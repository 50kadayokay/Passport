# Migrations

## The 0041 / 0042 number collision

Two migrations share each of those numbers:

| Number | From the app branch | From the portal branch |
|---|---|---|
| `0041` | `outbox_claim_lease` | `source_transcripts` |
| `0042` | `push_token_ownership` | `source_inventories` |

They were written in parallel on `main` and `portal-work` between September 2026
and the merge, before either branch saw the other's. **Both sets are real and
both may be applied** — the number is a filename convention, not a key. There is
no ledger table enforcing order, because migrations are applied by hand through
the Supabase SQL editor.

**They have deliberately NOT been renumbered.** Each file records what was
actually pasted into production under that name; renaming them afterwards would
make the history describe something that never happened. Read the filename, not
the number.

Everything from `0043` onward is unambiguous.

## Which are applied

Applied to production and verified:

```
0042  push token ownership              (from main; closed a live privacy bug)
0047  company messaging access
0048  company engagement analytics
0049  company notifications
0050a MineIQ schema, functions, outbox widening
0050b MineIQ full-text indexes (built CONCURRENTLY, one at a time)
0051  release revisions, profile timeline, event chain
0052  messaging privilege hardening
0053  Phase 3 (0041 tables) privilege hardening
0054  Phase 3 (0041 tables) immutability triggers
0056  function EXECUTE hardening
```

Deliberately **not** applied — both only needed before push is turned on:

```
0041  outbox claim lease   (from main)  — PREREQUISITE for 0055. Without it two
                                          overlapping sender runs claim the same
                                          rows and deliver twice.
0055  enable device push                — arms real notifications. Read the file.
```

Apply them in that order, and only when you intend investors' phones to buzz.

**CORRECTION.** An earlier version of this file said both of `main`'s migrations
were unapplied. That conclusion came from a check query that tested the wrong
objects:

* it looked for a TABLE `outbox_claim_lease` — `0041` creates no such table. It
  defines the functions `claim_notification_outbox` and
  `finish_notification_outbox`.
* it looked for a COLUMN `push_tokens.company_id` — `0042` adds no such column.
  It defines `claim_push_token` and `release_push_token`.

Both tests were written from the migration FILENAMES rather than their contents,
so neither could return anything but "not applied" regardless of the truth.
`0041` is in fact applied in production.

`0042` was then re-applied on the strength of that bad reading. No harm done —
every statement in it is `create or replace function`, so it is idempotent — but
the reasoning was wrong and the conclusion was unfounded.

To check either correctly, test the functions they actually define:

```sql
select
  case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                     where n.nspname='public' and p.proname='claim_notification_outbox')
       then 'APPLIED' else 'not applied' end as "0041",
  case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                     where n.nspname='public' and p.proname='claim_push_token')
       then 'APPLIED' else 'not applied' end as "0042";
```

## Applying one

1. Paste the file into Supabase → SQL Editor → Run.
2. Generate its verification: `node scripts/verify-migration.mjs <number>`.
3. Paste that, and read every row. All must say PASS.

`0050b` is the exception: `CREATE INDEX CONCURRENTLY` cannot run inside a
transaction, so its statements are run one at a time in an otherwise empty
query. A failed build leaves an invalid index that must be dropped before
retrying — the file explains how.
