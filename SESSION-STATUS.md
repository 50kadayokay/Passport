# S2 Distribution — session status

Branch `claude/portal-s2-distribution-5f84c4` (from 8b9e18f). Local commits only:
nothing pushed, merged, deployed or applied anywhere. No staging credentials
were used; every database check below is a script for S4 to run.

## Items

| Req | State | Commits | Offline evidence | Needs S4 |
|---|---|---|---|---|
| a17 Conference content sync | implemented, offline-tested | 13b2587 | `conference-live-config-test` 36/0; build; booth checked on the dev server (no API -> compiled package; cached record -> published look, offline) | apply 0085 (approval); `conference-booth-0085-check` (rolled back); `investor-app-live-test` (booth file changed, additively) |
| a21 Bespoke service requests | implemented, offline-tested | f48c75e | `service-requests-test` 22/0; UI on a local mock harness (request, list, admin status change) | apply 0086 (approval); `service-requests-0086-check` (rolled back); a live create -> admin status -> company sees it run |
| a14 Website content UI | in progress | | | |
| a13 Analytics events | pending | | | |
| a15 Content fan-out | pending | | | |
| a22 Social publishing | deferred (scope note only) | | | |

### a17 — what changed
- `0085_conference_booth_config` (+ rollback): `conference_booth_configs` (one
  published look per company, version bumps only on change, keys whitelisted by
  trigger), RLS read = members/admins, write = platform admins;
  `conference_booth_config(slug)` anon-callable, returns slug/studio/version/published_at only.
- `api/conference-config.js` (new, public GET, anon key only): 200 look / 204 none / 503 unavailable.
- `src/conference/liveConfig.js` (new): resolution URL params > published > compiled package > defaults;
  per-device cache; 4 s timeout; never throws.
- `ConferenceV3Booth.jsx`: additive hook, renders immediately from cache/package, applies a newer version when it arrives.
- `ConferenceStudio.jsx`: "Save & publish to booths" also publishes the record; shows the live version.
- `src/lib/conference.js` + portal `Conference.jsx`: read the published record; status "Live on booths".
- Fallback: the compiled `registry.js` module is untouched and still used whenever no record is reachable.

### a21 — what changed
- `0086_service_requests` (+ rollback): statuses requested/in_review/quoted/in_progress/done;
  create = owner/admin/editor/publisher of that company (stamped `requested`, as the caller,
  no note); update = platform admin, status + note only; history appended per status change;
  no client delete; 20/company/day burst guard.
- `api/service-request.js` (new): role check, insert AS THE CALLER, Postmark email to support (best effort).
- `api/conference-inquiry.js`: `sendSupportEmail` exported (+ optional `fromName`); behaviour unchanged.
- `src/portal/Services.jsx`: request form, "Your requests" with status stepper and admin note;
  falls back to mailto when 0086 is absent or the role cannot ask.
- `src/admin/ServiceRequests.jsx` (new admin view) + `src/lib/serviceRequests.js`.

## Requests to other sessions
- **S3 (`src/admin/Admin.jsx`)**: add an admin nav entry "Service requests" rendering
  `src/admin/ServiceRequests.jsx` (default export, no props).
- **S4 (`package.json`)**: add to `npm test`: `node scripts/conference-live-config-test.mjs`,
  `node scripts/service-requests-test.mjs`.
- **S4 (`scripts/_api-routes.mjs` / authz suite)**: new routes `api/conference-config.js`
  (public GET by design) and `api/service-request.js` (POST, user JWT, owner/admin/editor/publisher or platform admin).
- **S4 (staging, after approval)**: apply 0085, 0086; run the two rolled-back checks first.

## Shared contracts
- None changed yet. `sendSupportEmail` is now exported from `api/conference-inquiry.js` (additive).

## Blockers
- None. Staging work is S4's by design.
