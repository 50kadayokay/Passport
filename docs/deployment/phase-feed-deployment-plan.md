# Feed/Publish Phase — Deployment Plan

Companion to `docs/adr/0001-publish-event-architecture.md`. Approved (Vercel dispatcher) with the checkpoint structure below. No checkpoint is "the completed phase".

## Determinations (measured, not assumed)

- **Vercel plan = `hobby`** (confirmed via `api.vercel.com/v2/user` → `billing.plan: hobby`). Hobby Cron is daily-only.
  → **Dispatcher cron = Supabase Cron (`pg_cron` + `pg_net`) POSTing to the protected `/api/dispatch`** every minute. Both extensions enable via SQL (no Supabase CLI). If upgraded to Pro, switch to Vercel Cron (one `vercel.json` entry) with no code change.
- **Env vars set in Vercel (Production + Preview), server-only:** `SUPABASE_SERVICE_ROLE_KEY`, `DISPATCH_SECRET`. Neither is `VITE_`-prefixed, so neither is bundled to the browser. Existing: `ANTHROPIC_API_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

## Checkpoints

1. **Publish spine & dispatcher** — outbox, versioned publish/unpublish RPCs, dispatcher framework (empty listener registry), spine tests. *(this checkpoint)*
2. **Listeners & backend tests** — `feed_projection_v1`, `in_app_notifications_v1`; posts/follows/notifications tables; activate Supabase Cron; listener idempotency/retry/isolation tests.
3. **Feed UI & Follow controls** — Following/Latest/Discover, Follow buttons, company feed, post detail + deep link.
4. **Notification Center & preferences.**
5. **Observability & reconciliation** — admin Outbox Health panel (`outbox_health()`), reconciliation tool for missing/stale projections & deliveries.
6. **End-to-end regression suite.**

## Deploy order (never a broken intermediate state)

- `0008_publish_spine.sql` applied first — adds the spine; **does not** lock down client publishing, so nothing breaks.
- Endpoints (`/api/publish`, `/api/unpublish`, `/api/dispatch`) deploy with the app; env vars already set.
- **Production smoke test through `/api/publish` must pass and be documented BEFORE `0009` (the RLS lockdown) is applied.** Then re-run the smoke test after `0009`.
- `0009_publish_lockdown.sql` (client cannot set `status='published'`; publishing only via `/api/publish`) applied last.

## Security invariants

- `SUPABASE_SERVICE_ROLE_KEY` never leaves the server. `/api/dispatch` rejects any request lacking a valid `x-dispatch-secret`.
- Spine RPCs: `EXECUTE` revoked from `PUBLIC`/`anon`/`authenticated`, granted only to `service_role` (revoking from PUBLIC is required — role-specific revokes leave the default PUBLIC grant intact).
- Best-effort immediate dispatch has a 1.5s timeout and can never fail a committed publish.
