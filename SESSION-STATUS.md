# S1 Content & AI: session status

Branch `claude/portal-s1-content-cac41d`, from 8b9e18f. Local commits only:
nothing pushed, merged, deployed or applied. No migrations (0080–0084 unused).
No real AI calls; no staging access.

| Item | Implemented | Offline-tested | Needs S4 live test | Commit |
|---|---|---|---|---|
| a19 Mine IQ grounding and citations | yes | yes, 47/0 | rolled-back SQL check; real-AI run needs the user's approval | 954b488 |
| a07 press release ingest to publish through the UI | yes (defects fixed) | yes, 28/0 + demo click-through | real UI click-through on staging | a4510f8 |
| a08 edit / unpublish published releases | yes (retention unchanged, disclosed) | yes (same suite) | same click-through | a4510f8 |
| a06 AI-suggested profile updates from a release | yes | yes, 50/0 + demo click-through | live API test | 5f8a56c |

Regression on the branch: `npm test` pass, `vite build` pass, `ai-access-test` 193/0.

## a19: Mine IQ grounding (954b488)
- `api/_mineiqGrounding.js`: mechanical checks on every Ask answer: figures that
  appear in no source, refusals, conflict flags. They report and never rewrite.
- Fixes in the ask path (`api/compose.js`):
  - `grounded` was always true, because the profile block is always retrieved.
    It's now false when the model says it couldn't find the answer.
  - Responses now carry `unsupported_figures`. `MineIQ.jsx` shows a
    "Check before using" note for them. The note is not saved in chat history.
- `_mineiqSearch.js`: one row over the context budget used to stop retrieval
  (`break`). It's now skipped (`continue`), so shorter rows ranked after it
  still reach the prompt.
- Harness: `node scripts/mineiq-grounding-eval.mjs` (`--verbose` prints why each
  bad answer failed). It runs the shipped `compose` handler against fixture
  records in `scripts/fixtures/mineiq-grounding.json`, with a stubbed Supabase
  and a mocked provider. **47 passed, 0 failed.** It covers:
  - cited dates
  - superseded fact excluded
  - another company's record absent
  - no record → canned refusal with no provider call
  - another company's ID refused by the guard
  - 7 cases, each with a good answer that passes and bad answers that all
    fail (12/12 caught): invented grade, invented drill result, invented
    resource, invented revenue, no citation, stale value only, rounded
    figure, change hidden, one side of a contradiction, averaged values,
    general knowledge
- **Real-AI run (not run, costs money, needs approval):**
  `MINEIQ_EVAL_REAL_APPROVED=1 OPENAI_API_KEY=<key> node scripts/mineiq-grounding-eval.mjs --real`
  That's 7 calls on gpt-4o-mini, about 3k input and 300 output tokens each.
- **For S4 (rolled back, staging):** `node scripts/mineiq-search-supersession-check.mjs`.
  It proves `mineiq_search()` itself in SQL: superseded fact excluded, current
  and historical facts returned, company B's fact excluded, B asking about A
  gets 42501, nothing persisted.

## a07 / a08: release editor (a4510f8)
Defects found in the real UI path and fixed:
1. A live release was badged "Draft — not visible to investors". It's now
   badged Live, Taken down or Draft.
2. Edits to a live release were autosaved straight into `updates.body` with no
   revision. An edit is now an "Unsaved correction" until it's saved; leaving
   asks first. A saved correction or restore syncs the row, so "Publish again"
   can't bring back the old text.
3. Take-down left the card badged Live, and reopening it showed "Save
   correction", which the RPC refuses with `not_published`. Cause:
   `unpublish_publication` flips only the publication, and `updates.status`
   stays `published`. `releaseState()` in `publishDrafts.js` now reads the
   publication. Taken-down releases show "Taken down" and offer "Publish again".
4. A live release whose publication record failed to load was offered
   "Publish to MineEx" (a second announcement). It now shows an explanation.
5. Every error was titled "Couldn't publish". Each failure now has its own title.
6. Take-down returned to the library silently. The library now confirms it.
7. "Restore" was offered on taken-down releases, where the RPC always refuses it.
8. Demo harness: no fixture release could be opened ("That draft could not be
   opened"), because the fixture lookup was unreachable.
9. Changing the date or images of a live release has no effect until it's
   published again. The UI now says so.

**a08 Mine IQ retention is unchanged.** The take-down confirmation, the
taken-down view and the library notice all say Mine IQ keeps the facts it
learned from the release, with the count (`factCountForPublication`).
`release-edit-unpublish-test` asserts that no unpublish path deletes facts.

Offline: `node scripts/release-edit-unpublish-test.mjs`, **28/0**.

Demo click-through on `/portaldemo`, port 4351, with Supabase pointed at a dead
local address:
- upload → preparing → review → summary edit → publish → honest outcome screen
- live release → unsaved-correction note → take-down confirmation with the
  retention note → error titled "Couldn't take this release down" (the demo
  blocks writes)

**Needs S4, live UI on the staging bundle**, as owner of a staging company:
1. Upload a PDF. Check the summary, edit it, preview, then publish.
2. Check the outcome rows.
3. Reopen the release. It should be badged Live.
4. Edit the text. The unsaved note should appear, and leaving should ask first.
5. Save the correction. Check the revision and that the feed updates.
6. Take it down. The confirmation should state the fact count.
7. Check the library notice and that the card reads "Taken down".
8. Reopen it. It should be badged Taken down and offer "Publish again".
9. Publish again. It should be back in the feed with the **corrected** text.
10. As a publisher, repeat steps 5–9. As an editor, confirm there's no
    correct or take-down control.

Also run the existing `publishing-live-test` and `audit-trail-live-test`.

## a06: profile updates from a release (5f8a56c)
- `POST /api/extract-profile-updates { companyId, updateId }`:
  - Guarded by `requireAiCaller` with roles = `profile-draft.js` `DRAFT_ROLES`
    (owner, admin, editor), plus platform admins.
  - Reads the **stored** release as the caller, scoped to the authorised
    company. It ignores text in the request body.
  - The model never sees the current profile.
  - Writes nothing.
- `src/portal/publish/profileSuggestions.js` is pure and shared:
  - A proposal is kept only if its quote is verbatim in the release and every
    figure in its value is in that quote.
  - Kept proposals carry the release ID, headline and source line(s).
  - Dropped proposals are counted, with reasons.
  - It also diffs proposals against the profile and applies them to a pp copy.
  - It covers cash (with as-at date), shares outstanding, fully diluted,
    options, warrants, debt, financing, timeline milestone, latest update and
    next catalyst.
- `ProfileSuggestions.jsx` sits in the release editor, shown only to roles that
  can edit the profile draft:
  - Each change shows "profile now" vs "from this release", the quote with its
    line, and Approve / Edit / Reject.
  - "Save N approved changes to your profile draft" reloads the draft, then
    saves through `/api/profile-draft` (compare-and-set). It never publishes;
    publishing stays the ordinary profile publish (owner, admin).
- Offline: `node scripts/profile-suggestions-test.mjs`, **50/0**. It covers:
  - quote and line location, including across line breaks
  - 7 kinds of invented or untraceable proposals dropped
  - diff and apply, with no mutation
  - endpoint roles: owner, admin and editor in; publisher, viewer, analyst,
    other company, investor and anonymous refused before any AI call
  - another company's release → 404
  - body text ignored; no writes
  - panel saves draft-only
- Demo click-through: proposals render with the quote and line; edit, reject
  and approve work; save reports "Demo: nothing was saved".
- **For S4 (live, staging API, egress mock):** `node scripts/profile-suggestions-live-test.mjs`.
  It uses a throwaway company `zz-a06-<run>` and checks:
  - which roles may ask, the 404 and the 400
  - draft-only save: live profile unchanged, draft holds the changes
  - a publisher can't save; a stale save gets 409
  - cleanup

## Requests to other sessions (all to S4, files I don't own)
1. **`package.json`**: add to `npm test`:
   - `node scripts/mineiq-grounding-eval.mjs`
   - `node scripts/release-edit-unpublish-test.mjs`
   - `node scripts/profile-suggestions-test.mjs`
2. **`scripts/_api-routes.mjs` / `api-authz-test.mjs`**: add `extract-profile-updates`.
   Owner, admin and editor are admitted (200 or 404 for a probe ID). Publisher,
   viewer, analyst, investor, other company and anonymous are refused (403/401).
   `ai-access-test.mjs` could list it too. Its role set differs from `DRAFTING`:
   publishers are excluded, matching profile drafts.
3. **`api/_stagingEgress.js`** (optional): a mock case for `propose_profile_updates`
   so the live test also checks mocked proposals. For example, return one
   `shares_outstanding` proposal whose quote is the first sentence in the
   prompt containing "shares outstanding". Today it returns `{}`, which yields
   zero proposals; the live test handles that.
4. **Live runs**, all listed above:
   - `mineiq-search-supersession-check` (rolled back)
   - `profile-suggestions-live-test`
   - the a07/a08 UI click-through
   - the existing `publishing-live-test` and `audit-trail-live-test`
5. **Decision for the user (a08, open):** Mine IQ still retrieves a taken-down
   release's **body**, not only its facts. `mineiq_search`'s release branch and
   the legacy scan filter on `updates.status = 'published'`, which a take-down
   doesn't change. Left unchanged with fact retention; the UI wording covers
   facts. Worth deciding together.

## Batch 2: S3's a28 review of S1 pages (all fixed)
Commits: `c8e8fe8` Mine IQ history · `2a960e2` media page · `fe8a0af` release
library and editor · `0daf4c4` draft page, profile editor and Content loader ·
`164f9d7` test. Offline: `node scripts/s1-page-states-test.mjs`, **28/0**. It runs
the lib changes against a stubbed network and checks the page wiring. Regression:
`npm test` pass, build pass, grounding 47/0, release-edit 28/0, profile-suggestions 50/0.
- High:
  - (1) The Mine IQ probe now switches to local mode only on a 404 or a missing
    table. Any other failure is an error, and the next call probes again.
  - (2) The media page shows the load error with Try again.
  - (3) The release library shows the load error with Try again; failed
    `listDrafts`/`listPublished` reads now throw.
  - (4) The reopen path is wrapped in try/catch, with an "Opening your release"
    loader and an explained error.
  - (5) Was already fixed in `a4510f8` (`pubMissing`).
- Medium:
  - Mine IQ "Try again" no longer duplicates the question.
  - No error banner above an empty grid.
  - A failed image list keeps the saved selection, says so, and blocks publishing.
  - Drafting responses without text, and fact checks without findings, are handled.
  - The profile editor loads by company ID, so a missing slug no longer blocks it.
- Low:
  - A turn with no saved answer is explained.
  - No more "Photo · ".
  - Reopening no longer shows the upload checklist.
  - History with no list returned is an error; no more "saved by undefined".
  - The Content loader now matches the other sections.

Requests:
- Add `node scripts/s1-page-states-test.mjs` to `npm test`.
- `src/lib/mediaAssets.js` (not mine) answers `[]` for a failed read. I work
  around that in the editor when a saved selection exists. A strict option, or
  a throw, would let it tell an empty list from a failed read in every case.
- ~~`knowledgeSummary` 0 counts~~: fixed in batch 2b (below).

## Batch 2b: Mine IQ overview counts (S3 request, with S3 f3b8b5d)
`knowledgeSummary` now reports a failed documents, releases, drafts or media
read as `null`, never 0. Each failed list is named in `unavailable`, with its
message in `errors`. `attentionItems` leads with "Your documents couldn't be
loaded". `countLabel()` gives the display text. `s1-page-states-test` is
**33/0** on this branch; the documents case is skipped because `memory.js` here
still returns []. With S3's `memory.js` swapped in temporarily, it is **34/0**,
including "a failed documents read is null and named".

## Findings, not changed (out of scope)
- `scripts/compose-test.mjs` is stale: it imports `callClaude`, which no longer
  exists. It only runs with an Anthropic key, so it never fails today.
- The demo ingest adapter ignores the uploaded file and always returns the
  same fixture release.
- The live release preview phone is hidden below the `xl` breakpoint unless
  the Preview tab is chosen. That's by design, noted for the mobile pass (S3, a28).
