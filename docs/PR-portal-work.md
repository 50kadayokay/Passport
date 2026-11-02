## Portal launch: live baseline v1.3.2 + Company Portal

Merges `portal-work` into `main`. `main` is the branch Vercel deploys to Production.

### What this contains
- The live investor app as deployed today (`prod-v1.3.2`, 223 commits not yet on `main`), merged with
  nothing removed. Every line prod-v1.3.2 added is present or deliberately combined (checked file by file).
- The Company Portal: profile drafts and publishing, releases (ingest, summarise, edit, take down), media
  library, team roles, messaging, notifications, analytics, website content contract and fan-out, Conference
  Mode, Mine IQ, Services.
- Security work: tenant isolation fixes, the shared AI guard on every AI route (including prod's
  `/api/brief-generate`), security headers and a CSP Report-Only policy, non-production builds that can never
  default to the production database, and session-gated polling.
- The native company profile editor now goes through draft and publish, owners and admins only.

### Deploying this changes no data
New features need database migrations that are NOT part of this merge; until they run, those features stay
inert (verified against the current production schema). The migrations follow in separately approved
phases (`docs/LAUNCH-DAY-RUNBOOK.md`).

### Verified on staging (every pending migration applied)
- Tenant isolation 1088/0, API authorization 446/0, 25 live suites (investor app 35/0), migration round
  trip 82/0, production-exact rollback captures 15/0, `npm test`, web and native builds.
- Read-only production audits (2026-11-01, re-run 2026-11-02): production matches the repo's expected state;
  no drift since.

### Rollback
Vercel → Deployments → previous Production deployment → Instant Rollback. No database state is involved.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
