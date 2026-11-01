# Production database password rotation — checklist

**Status: PREPARED, NOT DONE.** Rotating is a production change and needs your
approval; only you perform it (Supabase dashboard, your account). Project:
`rvptronniomlqumjhyrr` ("Passport V1", ca-central-1).

## Why
The `postgres` password was shown on screen in the Claude app's Terminal tab c1
on 2026-11-01 (a pasted value landed on the shell prompt after a prompt bug,
since fixed). It was also read into this Claude session's transcript. It is not
in shell history, the repo, git history, audit results or app logs (checked
2026-11-01, counts only).

## What depends on this password (checked 2026-11-01)
| Consumer | Uses the `postgres` password? | Effect of rotating |
|---|---|---|
| Investor app (web `/app`, iOS/Android 1.3.x) | No: PostgREST/Auth/Storage with the publishable (anon) key | None |
| API on Vercel (`api/*`) | No: service-role key over HTTPS. No `DATABASE_URL`/DSN in any env file or Vercel env pull | None |
| Public site, portal, Mission Control | No: same API keys | None |
| Supabase's own services (PostgREST, Auth, Storage, Realtime) | No: internal roles, not the `postgres` password | None |
| Edge functions / CI workflows / Supabase CLI link | None exist in this repo; no linked project | None |
| `scripts/production-audit-start.mjs` | Yes, typed at a hidden prompt each run; never stored | Paste the new one next time |
| Anything outside this repo (BI tool, SQL client, backup tool, a teammate's saved connection) | Unknown here; only you can know | Must be updated, or it stops connecting |

Staging tooling uses the staging project's own connection (`supabase/staging/.connection`)
and is unaffected.

## Before
1. Confirm there is no outside consumer (last row above). If there is, note
   where its connection string is stored so you can update it straight after.
2. Pick a quiet moment. API keys don't change, so the app keeps working, but
   any open direct connection using the old password will be dropped.
3. Close Terminal tab c1 first: type `unset HISTFILE`, press Enter, then
   close the tab, so its contents are never written to history.

## Rotate (you, in the dashboard)
4. Supabase → **Passport V1** → **Project Settings → Database** → **Reset
   database password**. Use the generated password.
5. Save it straight into your password manager, **replacing** the existing
   entry. Don't paste it anywhere else.

## After (verification, no production changes)
6. Investor app: open `/app`, load a company profile, sign in as an investor.
   API keys are unchanged, so this should simply work.
7. Portal: sign in and open a company dashboard.
8. Old password refused, new one accepted: run the read-only audit starter
   (`node scripts/production-audit-start.mjs`) and paste the NEW password at the
   hidden prompt. It connects read-only and rolls back. (With your approval this
   can be the run that fetches the drifted functions' source.)
9. Update any outside consumer from step 1.

## Rollback
Not possible for the old value, and not wanted (it is exposed). If something
outside this repo breaks, give it the new password; if the new one is ever
exposed, rotate again.

## Never
- Paste the password into chat, a terminal command line, a file, a URL or an
  environment file in this repo.
- Rotate the API keys (anon / service role) as part of this. They are separate,
  were not exposed, and the shipped native apps depend on the anon key.
