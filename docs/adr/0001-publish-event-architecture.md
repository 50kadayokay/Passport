# ADR 0001 — Publish as an Event (outbox + dispatcher)

Status: accepted 2026-07-18. Supersedes the DB-trigger approach in the first draft of `0008_feed_foundation.sql`.

## Context

Publishing is becoming the single origin event of the Passport operating system. Today it is a client-side row update; it must become a durable, observable event that many independent consumers react to (feed, notifications, and later website/RSS/email/search/AI/social). Business logic must live in application code, not a Postgres trigger, but we must not lose the integrity guarantee a trigger gave us ("a published publication always has its downstream effects").

## Current publishing path (verified in code)

- `src/console/CommsCenter.jsx` → `saveDrafts()` inserts `updates` + `publications` rows with `status` in `draft|approved`.
- `src/lib/publish.js` → `publishPublication()` runs the connector **in the browser** and then **PATCHes `publications.status = 'published'` directly** (publish.js:113).
- RLS (migration 0005) `publications` "owner_all" lets any owner/admin set any column — so a client can self-publish with one PATCH. This is the path we are closing.

## Proposed publishing path

```
Client → POST /api/publish { publicationId }        (Vercel function = Publish Service)
  1. authenticate caller (Supabase /auth/v1/user)
  2. authorize: can_touch_company(company) — owner or admin
  3. verify entitlement (my_features includes the destination's feature)
  4. validate the publication + destination + current status
  5. call ONE atomic RPC: publish_publication(publicationId)
  6. best-effort: invoke the dispatcher Edge Function immediately (fire-and-forget)
  7. return { ok, publicationId, published_at }        — NO post/notification created here
```

The **atomic RPC** (`publish_publication`) is the only thing that may set `status='published'`:

```
begin (implicit, single statement/txn):
  SELECT ... FOR UPDATE            -- lock the publication row
  reject if status not in (draft, review, approved)   -- invalid transition guard
  UPDATE publications SET status='published', published_at=now(), publish_seq=publish_seq+1
  INSERT INTO events (PUBLICATION_PUBLISHED, small payload, idempotency_key='publish:<id>:<seq>')
     ON CONFLICT (idempotency_key) DO NOTHING          -- retries never double-emit
commit
```

Post creation and notifications are **not** here. They are dispatcher listeners.

## Transaction boundary

One transaction: `publications` state change **and** the outbox `events` insert commit together, or neither does. Nothing else is in the boundary — no external calls, no post write. This is the transactional-outbox pattern.

## Event schema (small — ids + context, never content)

```json
{
  "event_type": "PUBLICATION_PUBLISHED",
  "event_version": 1,
  "publication_id": "…",
  "company_id": "…",
  "occurred_at": "…",
  "actor_user_id": "…",
  "idempotency_key": "publish:<publication-id>:<publish_seq>"
}
```

Each listener loads the authoritative `publications`/`updates`/`companies` rows itself, so the outbox never holds stale duplicated content.

## Dispatcher lifecycle

- Implemented as a **Supabase Edge Function** (`publish-dispatcher`), close to the DB.
- Driven by **Supabase Cron** (guaranteed drain) + **best-effort immediate invocation** from `/api/publish` (so posts normally appear within seconds).
- Per run, per listener: claim a small batch of due deliveries with `FOR UPDATE SKIP LOCKED`, run the listener, record the outcome. Listeners run **independently** — one failing never blocks or rolls back another that succeeded.
- Listeners now: `feed_projection` (create/update the canonical post), `in_app_notifications` (create eligible notifications). Both **idempotent**.

## Retry & idempotency model

- **Publish idempotency:** unique `events.idempotency_key` → repeated publish requests emit exactly one event.
- **Per-listener delivery:** `event_deliveries(event_id, listener, status, attempts, next_attempt_at, last_error, processed_at)`, unique `(event_id, listener)`.
- **Idempotent listeners:** feed projection upserts on unique `posts.publication_id`; notifications upsert on unique `(user_id, post_id, kind)`. Replaying an event creates no duplicates.
- **Backoff:** exponential `next_attempt_at` on failure; **dead-letter** after N attempts; **replay** = reset a delivery to `pending`.

## Authorization boundary

- Only `/api/publish` can publish. Direct client publishing is blocked at RLS: the `publications` update/insert `WITH CHECK` forbids `status='published'`; the `publish_publication` RPC (SECURITY DEFINER) is the only writer of that state, and it re-checks `can_touch_company`.
- Clients keep full draft/edit rights for non-published states.
- Dispatcher runs with the service role (Edge Function secret), never exposed to the browser.

## Rollout & rollback

1. Apply migration (outbox, deliveries, richer `posts`, `follows`, `notifications`, `notification_prefs`, RPCs, RLS lockdown). Backfill posts from already-published publications.
2. Deploy the `publish-dispatcher` Edge Function; schedule Supabase Cron.
3. Ship `/api/publish`; switch `publish.js`/CommsCenter to call it. The old direct-PATCH path stops working by RLS, so there is a single publish path.
4. Build feed + Notification Center UI reading the canonical projections.
- **Rollback:** revert the client to draft-only, disable Cron, and (if needed) restore the permissive `publications` update policy. Posts/events tables are additive and can be left in place; no destructive change to existing tables.

## Posts schema (structural now; denormalize only when measured)

`publication_id (unique)`, `company_id`, `post_type`, `category`, `materiality_score`, `materiality_label`, `project_id`, `title`, `summary`, `thumbnail_url`, `source_url`, `published_at`, `removed_at`. No copied company name/logo/commodity/jurisdiction and no like/comment/share columns until a query proves the need.
