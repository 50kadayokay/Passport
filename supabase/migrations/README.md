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

`main`'s two were checked after the merge: **both were unapplied.**

`0042_push_token_ownership` has since been applied. It closes a live privacy
bug: a device token stayed attached to an account after sign-out, so the next
person to sign in on that device also received the previous user's
notifications. `src/lib/auth.js` had been calling `release_push_token` on every
sign-out and silently swallowing the failure, because the function did not
exist. At the time of applying, 6 tokens existed and 0 were shared, so the leak
had not yet occurred.

`0041_outbox_claim_lease` is still unapplied. It is **a hard prerequisite for
`0055`**: without it two overlapping sender runs claim the same pending rows and
deliver the same notification twice. Not urgent while push is off; required
before it is turned on.

To re-check either:

```sql
select
  to_regclass('public.outbox_claim_lease') is not null as "0041 applied?",
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='push_tokens'
             and column_name='company_id')             as "0042 applied?";
```

## Applying one

1. Paste the file into Supabase → SQL Editor → Run.
2. Generate its verification: `node scripts/verify-migration.mjs <number>`.
3. Paste that, and read every row. All must say PASS.

`0050b` is the exception: `CREATE INDEX CONCURRENTLY` cannot run inside a
transaction, so its statements are run one at a time in an otherwise empty
query. A failed build leaves an invalid index that must be dropped before
retrying — the file explains how.
