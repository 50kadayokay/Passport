-- ============================================================================
-- 0041_outbox_claim_lease.sql — atomic claim/lease + retry lifecycle for
-- public.notification_outbox.
--
-- PROBLEM (W1-W4, found during the Android port)
--   The sender did:  SELECT ... WHERE status='pending'  →  send  →  PATCH result
--   Two overlapping invocations (the hourly cron plus a manual or retried call)
--   both SELECT the same pending rows and both deliver them. The unique key
--   (news_item_id,user_id,token) makes ENQUEUE idempotent; nothing made DELIVERY
--   idempotent. Additionally `attempts` was written as the literal 1, a row
--   marked 'failed' was never retried, and a worker dying mid-batch left rows
--   stuck forever.
--
-- SOLUTION
--   A SECURITY DEFINER function that claims rows with
--       SELECT ... FOR UPDATE SKIP LOCKED
--   and flips them to 'sending' with a lease, inside ONE transaction.
--
-- WHY THIS CANNOT DOUBLE-CLAIM
--   * FOR UPDATE takes a row-level write lock on each selected row and holds it
--     until the function's transaction commits.
--   * SKIP LOCKED makes a CONCURRENT claim skip those rows outright — it does
--     not block and it does not return them. So two workers can never receive
--     the same row from the SELECT.
--   * The UPDATE to status='sending' is in that same transaction, so by the time
--     the lock is released the row is no longer 'pending' and no longer matches
--     the claim predicate.
--   There is no window between "selected" and "marked", which is exactly the gap
--   the old read-then-write sender had.
--
-- STATE MACHINE
--   pending ──claim──▶ sending ──success──────▶ sent      (terminal)
--      ▲                  │
--      │                  ├──permanent/max────▶ failed    (terminal)
--      │                  │
--      └──retryable───────┘  attempts+1, next_attempt_at = now()+backoff
--      ▲
--      └──lease expiry (worker died) — reclaimed after lease_expires_at
--
--   'skipped' stays terminal and is unchanged (unroutable platform).
--
-- Additive and reversible: only new nullable columns plus one widened CHECK.
-- Existing rows keep working (next_attempt_at NULL = eligible immediately).
-- ============================================================================
begin;

-- 1) LEASE + RETRY COLUMNS ---------------------------------------------------
alter table public.notification_outbox
  add column if not exists claimed_at       timestamptz,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists claimed_by       text,
  add column if not exists next_attempt_at  timestamptz;

-- 2) ALLOW THE 'sending' STATE ----------------------------------------------
alter table public.notification_outbox drop constraint if exists notification_outbox_status_check;
alter table public.notification_outbox
  add constraint notification_outbox_status_check
  check (status in ('pending','sending','sent','failed','skipped'));

-- 3) CLAIM INDEX -------------------------------------------------------------
-- The old partial index only covered status='pending'. The claim predicate also
-- has to find expired 'sending' leases, so index both.
drop index if exists public.idx_outbox_pending;
create index if not exists idx_outbox_claimable
  on public.notification_outbox (status, next_attempt_at, created_at)
  where status in ('pending','sending');

-- 4) THE ATOMIC CLAIM --------------------------------------------------------
-- Returns the rows this caller now owns. Anything returned is guaranteed to be
-- owned by exactly one worker until its lease expires.
create or replace function public.claim_notification_outbox(
  p_limit         int  default 200,
  p_lease_seconds int  default 300,
  p_max_attempts  int  default 5,
  p_worker        text default null
)
returns setof public.notification_outbox
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with claimable as (
    select o.id
    from public.notification_outbox o
    where
      o.attempts < p_max_attempts
      and (
        -- never attempted, or its backoff has elapsed
        (o.status = 'pending' and (o.next_attempt_at is null or o.next_attempt_at <= now()))
        -- a worker claimed this and died: the lease has expired, so reclaim it
        or (o.status = 'sending' and o.lease_expires_at is not null and o.lease_expires_at < now())
      )
    order by o.created_at asc
    limit p_limit
    for update skip locked          -- ← the concurrency guarantee
  )
  update public.notification_outbox o
     set status           = 'sending',
         claimed_at       = now(),
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         claimed_by       = p_worker
    from claimable c
   where o.id = c.id
  returning o.*;
end;
$$;

revoke all on function public.claim_notification_outbox(int,int,int,text) from public, anon, authenticated;

-- 5) RESULT REPORTING --------------------------------------------------------
-- One function so a worker can never leave a row in 'sending' by writing a
-- partial update, and so backoff is computed in the database (single clock).
--
--   p_outcome 'sent'      -> terminal success
--             'retry'     -> attempts+1; back to 'pending' with backoff, or
--                            'failed' once attempts reaches p_max_attempts
--             'failed'    -> terminal (permanent token / max attempts)
--             'release'   -> PROVIDER CONFIG failure: back to 'pending' WITHOUT
--                            burning an attempt. A bad key or malformed payload
--                            affects every row for that provider; burning
--                            attempts would destroy the whole queue for a
--                            mistake that is ours to fix.
create or replace function public.finish_notification_outbox(
  p_id            uuid,
  p_outcome       text,
  p_error         text default null,
  p_max_attempts  int  default 5,
  p_base_backoff  int  default 60
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempts int;
begin
  select attempts into v_attempts from public.notification_outbox where id = p_id;
  if v_attempts is null then return; end if;

  if p_outcome = 'sent' then
    update public.notification_outbox
       set status = 'sent', sent_at = now(), last_error = null,
           attempts = v_attempts + 1,
           claimed_at = null, lease_expires_at = null, claimed_by = null, next_attempt_at = null
     where id = p_id;

  elsif p_outcome = 'retry' then
    if v_attempts + 1 >= p_max_attempts then
      update public.notification_outbox
         set status = 'failed', last_error = coalesce(p_error,'max attempts reached'),
             attempts = v_attempts + 1,
             claimed_at = null, lease_expires_at = null, claimed_by = null
       where id = p_id;
    else
      update public.notification_outbox
         set status = 'pending', last_error = p_error,
             attempts = v_attempts + 1,
             -- exponential backoff, capped at 1h: 60s, 120s, 240s, 480s …
             next_attempt_at = now() + make_interval(secs => least(p_base_backoff * power(2, v_attempts)::int, 3600)),
             claimed_at = null, lease_expires_at = null, claimed_by = null
       where id = p_id;
    end if;

  elsif p_outcome = 'release' then
    -- config failure: return to the queue untouched (no attempt burned)
    update public.notification_outbox
       set status = 'pending', last_error = p_error,
           claimed_at = null, lease_expires_at = null, claimed_by = null
     where id = p_id;

  else -- 'failed'
    update public.notification_outbox
       set status = 'failed', last_error = coalesce(p_error,'permanent failure'),
           attempts = v_attempts + 1,
           claimed_at = null, lease_expires_at = null, claimed_by = null
     where id = p_id;
  end if;
end;
$$;

revoke all on function public.finish_notification_outbox(uuid,text,text,int,int) from public, anon, authenticated;

commit;
