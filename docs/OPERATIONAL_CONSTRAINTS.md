# Operational constraints

Known, accepted limitations of deployed behaviour. Each records a deliberate
decision, not an outstanding bug.

---

## OC-1 — Documents carrying Phase 3 evidence cannot be deleted

**Status:** accepted, deferred. Recorded 2026-09-21, at the deployment of
migrations 0042–0044.

### What is constrained

Once a document has a `source_inventories`, `verification_runs`,
`verification_findings`, `canonical_sources` or `canonical_spans` row attached, it
**cannot be deleted through the normal deletion path by any role**, including
`service_role`. Attempting it raises:

```
42501  <table> is append-only; row <id> cannot be deleted
```

`documents` declares `ON DELETE CASCADE` into the evidence chain, so deleting the
parent reaches the evidence trigger and the whole statement aborts. The document
survives, and so does its evidence.

### Why it is this way

Append-only is enforced by triggers, not by row-level security, because
`service_role` bypasses RLS entirely — a policy would guarantee nothing against
anything holding the service key. Triggers fire for every role:

* `public.phase3_append_only` — `BEFORE UPDATE OR DELETE ... FOR EACH ROW`
* `public.phase3_no_truncate` — `BEFORE TRUNCATE ... FOR EACH STATEMENT`

The second was added in `0045` after production showed that `TRUNCATE` is
restricted by neither RLS nor row-level triggers, so the row guard alone left a
verb through. Foreign keys already refuse `TRUNCATE` on a referenced table, but
`TRUNCATE ... CASCADE` defeats that — the statement trigger is what stops it.

An UPDATE-only guard would have left a delete-then-reinsert path that produces a
different row saying something else. That is the same corruption by a longer
route, so both verbs are blocked.

### What this does NOT constrain

* Documents with no Phase 3 evidence attached delete exactly as before.
* Nothing in Release Body, publishing or the UI is affected.
* `source_transcripts` (migration 0041) keeps its original semantics: UPDATE is
  blocked, DELETE is not, and it still cascades from `documents`. This change did
  not touch it.

### Deployment status

Migrations 0042, 0045, 0043 and 0044 were applied to production on 2026-09-22, in
that order, each structurally verified before the next. No Phase 3 evidence has
been persisted yet, so no document is currently subject to this constraint.

### The resolution, when it comes

A privileged, audited erasure mechanism, designed separately. The requirement it
must meet: erasure has to be **recorded before it is performed**, so that a
deletion is itself a provenance event rather than an absence. Whatever form it
takes, it must not reintroduce a silent deletion path — which is why the fix is
not "relax the trigger".

### If this blocks something operationally

It will surface as a `42501 ... is append-only` error on a delete, not as silent
data loss. Escalate rather than working around it; the workaround is the hazard.
