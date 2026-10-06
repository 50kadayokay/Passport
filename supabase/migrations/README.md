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

As of the merge, applied to production:

```
0047  company messaging access
0050a MineIQ schema, functions, outbox widening
0050b MineIQ full-text indexes (built CONCURRENTLY, one at a time)
0051  release revisions, profile timeline, event chain
0052  messaging privilege hardening
0053  Phase 3 (0041 tables) privilege hardening
0054  Phase 3 (0041 tables) immutability triggers
0056  function EXECUTE hardening
```

Deliberately **not** applied:

```
0048  company engagement analytics      — ready
0049  company notifications             — ready
0055  enable device push                — arms real notifications; see the file
```

Unknown: whether `main`'s `0041_outbox_claim_lease` and `0042_push_token_ownership`
were ever applied. To check:

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
