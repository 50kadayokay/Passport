# mineex-header-probe: throwaway, secret-less header diagnostic

**Not part of MineEx. Not deployed. Deploying it needs explicit approval.**

## Why it exists

F5 and F12 (`docs/REMEDIATION-PLAN.md`) both depend on one fact: does Vercel
let a **client** set `x-forwarded-host`, `x-forwarded-for`, `x-real-ip`,
`x-vercel-forwarded-for` or `forwarded`, on the Node and Edge runtimes?

We do **not** deploy the vulnerable MineEx code to find out. This project
answers the question with nothing in it worth attacking.

## What it is

| File | What it does |
|---|---|
| `api/node.js` | Node-runtime function. Returns the forwarding headers it received and the socket address of Vercel's proxy |
| `api/edge.js` | Edge-runtime function (the runtime `og-news` uses). The same, minus the socket address |
| `_echo.js` | The shared reporter. Never returns cookie, authorization or protection-bypass values, only their names |

## What it is not

Pinned by `scripts/header-probe-safety-test.mjs`, which is part of `npm test`.
The probe has:

- no environment variables, secrets, database, outbound calls or sockets;
- no dependencies, and no imports from MineEx code;
- no crons, env or rewrites in `vercel.json`;
- no presence in the MineEx deployment: Vercel builds functions only from the
  MineEx project's root `api/`, and nothing in `api/` or `src/` references
  this directory.

## Runbook (only after approval)

1. **Create a separate Vercel project from this directory only:**
   ```bash
   cd tools/header-probe && vercel link --project mineex-header-probe
   ```
   Same team and region (`iad1`) as staging. **Root directory = `tools/header-probe`.**
   Never link it to the MineEx project.
2. **In that project's settings, BEFORE the first deploy:** set Vercel
   Authentication to protect **all** deployments (API: `ssoProtection.deploymentType = "all"`),
   create a Protection Bypass for Automation secret, and add **no**
   environment variables.

   > **Lesson from the 2026-10-30 run.** The default, `all_except_custom_domains`,
   > left the project's production `*.vercel.app` alias **public**. A new
   > project's first deployment becomes production even without `--prod`. The
   > probe was reachable without login for about 2–3 minutes until protection
   > was raised to `all`. It held no secrets, but verify *every* URL
   > unauthenticated (expect 302 to `vercel.com/sso-api`) before sending a
   > diagnostic request.
   >
   > Also: `vercel link` writes a `.env.local` holding a project-scoped
   > `VERCEL_OIDC_TOKEN`. Delete it before deploying.
3. **Deploy:**
   ```bash
   vercel deploy --prod
   ```
4. **Run the diagnostic** from the repo root:
   ```bash
   PROBE_BASE=https://<probe>.vercel.app PROBE_BYPASS=<bypass secret> node scripts/header-probe-test.mjs
   ```
   It writes `docs/header-probe-results.json` and prints the F5/F12
   conclusions per runtime.
5. **Delete the Vercel project** (dashboard → Settings → Delete project), and
   record the deletion next to the results. Check the project, the deployment
   and the aliases through the API (expect 404).

   > A deleted deployment's *unique* hostname may keep redirecting to Vercel
   > login for a while, from edge cache, whereas a never-existing hostname
   > returns 404 at once. That is a login wall, not content.

## Cost and exposure

- **Cost:** none on an existing team. Two functions, a handful of
  invocations.
- **Exposure while it exists:** a protected endpoint that tells the caller
  which of the headers *they* sent reached it, plus Vercel's proxy address.
  There is nothing to exfiltrate.

## Verification without deploying

```bash
node scripts/header-probe-test.mjs --local      # harness check, no proxy: every spoofed header must arrive
node scripts/header-probe-safety-test.mjs       # safety, plus classifier checks against a simulated proxy
```
