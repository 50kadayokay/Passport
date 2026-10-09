# MineEx — Complete Development Change Inventory

**Generated:** 2026-10-08 (read-only audit; no application code altered)
**Dev branch:** `app-update-2026-10` @ `8d655cf` + uncommitted work
**Production (web) baseline:** `prod-v75-4e696bf` (`4e696bf`, 2026-10-06) — VERIFIED direct ancestor of HEAD
**`main` (ahead of us):** `5e4540a` (2026-10-08)
**Scope:** 45 committed dev changes since production + 1 uncommitted working file; plus 25 commits on `main` not yet integrated.

Legend — **Risk:** Low / Med / High / Critical · **Verif:** NotTested / Passed / Failed / Blocked · **Approval:** Awaiting (default)

---

## 0. Baseline, protection & verification status

| Item | Finding | Class |
|---|---|---|
| Are we editing the real app? | Yes — `/app` + native both render the single `PassportProto.jsx`; prod-v75 is a direct ancestor | VERIFIED |
| DB migrations in the 45 dev commits | **None** — no data-model changes vs production | VERIFIED |
| Native build → source commit (iOS 1.3.1 build 17 / Android 1.3.1) | **Not establishable from repo** — no CI/workflows, no fastlane, no CHANGELOG, no build tags | UNVERIFIED — needs App Store Connect / Play Console build logs or the commit each build was compiled from |
| Native app loads live web? | No — `capacitor.config` `webDir:"dist"`, no `server.url` → installed app bundles a **frozen** `dist` | VERIFIED |
| Backup of current state | Tags `backup/appupdate-head-20261008-133514` (HEAD) + `backup/appupdate-wip-20261008-133514` (`9db02a4`, captures uncommitted) + patch/bundle in `/tmp/mineex-audit-backup-20261008-133514/` | VERIFIED recoverable |

**⚠️ Blocked verification:** True production parity against the *installed mobile app* cannot be done from here. To compare against the published app I need either (a) the commit each store build came from, or (b) screenshots from the installed iOS/Android app for the screens below.

---

## A. UNCOMMITTED working changes (this session) — `src/aiBrief/PassportProto.jsx` (+151 / −101)

> Highest scrutiny: these touch **shared** components used by investors. Not yet committed. Captured in backup tag `backup/appupdate-wip-20261008-133514`.

| ID | Feature/screen | Original behaviour | New behaviour | Visual | Functional | Affected | Files | Dependencies | Risk | Verif | Approval |
|---|---|---|---|---|---|---|---|---|---|---|---|
| U-1 | Company-owner Profile tab | (New in dev; prod had no company accounts) Thin identity card | Renders the **real** `CompanyProfile` in `owner` mode (full live profile) | Yes | Yes | Company owners | `CompanyProfile`, `CompanyProfileScreen` | Reuses real profile component | Med | NotTested | Awaiting |
| U-2 | `ProfileHeader` owner branch | Investor view: Back + Follow + Contact | Owner view: no Back, **Share profile + Contacts**, Settings gear + "+" | Yes | Yes | **Shared** (investor path gated by `owner=false`) | `ProfileHeader` | Investor Follow/Contact must be unchanged | **High** | NotTested | Awaiting |
| U-3 | Owner **Settings** | n/a | **New `CompanySettings`** BottomSheet (sign out / password / legal) | Yes | Yes | Company owners | `CompanySettings` (new) | **DUPLICATE of investor Settings** — flagged for removal | **High** | NotTested | **Needs correction** |
| U-4 | Contacts card owner edit | Investors see read-only contact card | Owner-only **edit pencil** (top-right) opens `EditCompanyProfile` | Minor | Yes | Company owners | contact BottomSheet in `CompanyProfile` | `EditCompanyProfile` lacks IR-person fields | Med | NotTested | **Needs correction** (field coverage) |
| U-5 | Owner **Share** | n/a | Ad-hoc `navigator.share`/clipboard with hand-built URL | No | Yes | Company owners | `CompanyProfileScreen.onShare` | **Bypasses `src/lib/share.js`** | Med | NotTested | **Needs correction** |
| U-6 | Global "+" create | "+" only on company Profile tab | "+" in header of Today/Explore/Following/Profile (not Messages); shell-level create menu | Yes | Yes | Company owners (gated basic/pro) | `ScreenHead` (`onCreate`), shell `renderNav` + create overlay | Investor tabs unaffected when `onCreate` undefined | Med | NotTested | Awaiting |
| U-7 | Edit-button z-index fix | Edit button in profile heroes was overlaid → real taps swallowed | `z-10` on button + `pointer-events-none` on sheen | No | **Yes (bug fix)** | **Investors + owners** | investor `ProfileScreen` hero + company hero | — | Low | Passed (pane, real click) | Awaiting |

---

## B. Committed dev changes since production (45 commits, grouped)

> All on `app-update-2026-10`, descended from `prod-v75`. None in production/native yet. **Several intentionally changed existing investor behaviour** — review each.

| ID | Change (commits) | Original behaviour | New behaviour | Affected | Risk | Verif | Approval |
|---|---|---|---|---|---|---|---|
| C-1 | **Login simplified — onboarding/interest gate removed** (`25d5809`, `413b…`) | Prod login flowed through an onboarding / interest-selection gate | Gate removed; straight to app | **All users** | **High** (changes existing auth UX) | NotTested | Awaiting |
| C-2 | **Company-profile primary action: Message → Contact sheet** (`e4ab6e1`,`a1aecc6`,`b66b09c`,`534383a`,`b1f5713`,`86bc122`,`6157507`,`de78496`,`29418f5`,`afef934`,`1118cd6`,`ad3283f`, +copy/clipboard `b74e9f8`) | Company profile primary action = **Message**; header carried social icons | Primary action opens a redesigned **Contact / IR card** (person · email/phone/address copy-to-clipboard · company links); gated Basic/Pro | **Investors** | **High** (core investor-facing change) | NotTested | Awaiting |
| C-3 | **Opening animation replaced** (`80cb9b6`) | Prior splash/opening | New black drill-core + wordmark accordion, play-once | All users | Med | NotTested | Awaiting |
| C-4 | **Standalone CEO profile page removed** (`dae17d4`) | A dedicated CEO profile page existed | Page removed | Investors | Med | NotTested | Awaiting |
| C-5 | **Team-member bios: Connect/Message removed** (`a541470`) | Team bios had Connect/Message | Buttons removed | Investors | Low | NotTested | Awaiting |
| C-6 | **Capital card: Funding Runway bar removed + height** (`ed8564a`,`706cb33`, #4) | Capital card showed a Funding Runway progress bar | Bar removed; card taller | Investors | Low | NotTested | Awaiting |
| C-7 | **Project photos → grouped gallery card** (`d17619c`,`e6aa1e7`,`34f1c8c`, #10) | Project images shown differently | Grouped gallery card; 3-per-row thumbs; flicker fix | Investors | Low | NotTested | Awaiting |
| C-8 | **Press-release content-block reader + 58-release ingest fixture** (`cca4336`,`91bbe3d`,`4ba8202`, #11) | Press releases rendered legacy text | Interleaved text/image blocks; local review fixture (localhost only) | Investors | Low | NotTested | Awaiting |
| C-9 | **Message thread shows company logo (live, varied colour)** (`ce63440`,`e043301`,`ebd3e05`) | Thread avatars flat | CoLogo, live latest logo, varied colour | Investors | Low | NotTested | Awaiting |
| C-10 | **Prototype (Kingsmen) real data** (`413b669`,`e6aa1e7`,`c642a66`,`d18a7b3`, `15322b4`) | Prototype had placeholder/invented bio etc. | Real HQ, IR contact, slogan; restored commodity/jurisdiction formatting | Investors (Kingsmen view) | Low | NotTested | Awaiting |
| C-11 | **Company-account Profile tab + composer + create card** (`9c64cb4`,`0f1b1db`,`1899260`,`178341d`, #7) | No company accounts in prod | New owner Profile tab, media composer, Instagram-style create card | Company owners | Med | NotTested | Awaiting |
| C-12 | **Branded auth emails + recovery-redirect guard** (`6646e12`) | Supabase default emails; reset could land on marketing root | Branded templates (files); `hasRecoveryHash` routes recovery to `/reset` | All users | Low–Med | **Partially verified** (live email confirmed; guard verified in preview) | Awaiting |
| C-13 | **Company profile persist-edits + owner-aware draft load** (`8d655cf`, #7) | n/a | Owner save → `companies.profile`; owner token loads own draft | Company owners | Med | **Passed** (DB persist verified) | Awaiting |
| C-14 | **Misc UI tweaks** (`f14d51d`,`44a259f`: button/milestone colours; `bad9a90`/`b7c6f7e`: leak-guard port + revert; `985015c`,`0ed3109`: mobile marketing-walkthrough) | — | Minor colour/marketing-walkthrough changes | Mixed | Low | NotTested | Awaiting |

**New files added (non-app-behaviour):** `supabase/email-templates/*.html` (3), `assets/brand/mineex-lockup-{white,ink}.png`, `public/brand/…` (2), `qa/*.mjs` (4 QA scripts), `.gitignore` (+4).

---

## C. Commits on `main` NOT in our branch (25) — to integrate

| Group | Count | Commits | Nature | Risk if omitted |
|---|---|---|---|---|
| **Security** | 1 | `5e4540a` Close the three unauthenticated AI endpoints | Hardens `api/` endpoints | **Critical** — must integrate |
| **Conference / mobile walkthrough polish** | 24 | `6f1aac9`…`5d47a2a` (tablet mount, black-bar, phone sizing, scroll lock, glow, SW cache, arrow controls, etc.) | Marketing-site mobile demo fixes | Med (marketing only) |

Full list: `/tmp/mineex-audit-backup-20261008-133514/commits_missing_from_main.txt`

---

## D. Merge-conflict report (dev ↔ main, computed non-destructively via `git merge-tree`)

- `src/main.jsx` → **auto-merges clean** (no conflict)
- `src/aiBrief/PassportProto.jsx` → **no conflict** (main didn't touch it)
- `qa/thrash.mjs`, `qa/thrashchrome.mjs` → auto-merge
- **CONFLICTS (4, all marketing-site files):**
  - `src/marketing/home2/AppSection.jsx`
  - `src/marketing/home2/InvestorPage.jsx`
  - `src/marketing/home2/ProProfileChapter.jsx`
  - `src/marketing/system.jsx`

**Interpretation:** all conflicts are in the **marketing site**, caused by main's Conference/mobile-walkthrough work vs our marketing edits. **No conflict touches the investor app (`PassportProto.jsx`) or the security fix.**

---

## E. Prioritized regression-risk list

1. **CRITICAL** — Missing security fix `5e4540a` (unauthenticated AI endpoints) must be integrated before any release.
2. **HIGH** — C-1 login gate removal, C-2 Message→Contact: existing investor behaviour intentionally changed; confirm each was intended and matches the design you want shipped.
3. **HIGH** — U-2 owner branches in shared `ProfileHeader`/`CompanyProfile`: verify the **investor** path is byte-for-byte unchanged.
4. **HIGH** — U-3 duplicate `CompanySettings`: replace with the shared investor Settings (per your Phase 5).
5. **MED** — U-4 contact edit misses IR-person fields; U-5 share bypasses `share.js`; U-6 global "+".
6. **MED** — 4 marketing-file merge conflicts (resolve preserving both the demo fixes and our marketing edits).
7. **LOW** — gallery, PR blocks, message-logo, prototype data, colour tweaks.

---

## F. Proposed synchronization procedure (for approval — NOT yet executed)

1. **Protected integration branch:** create `sync/main-into-appupdate-2026-10` from HEAD (never on `main`/production).
2. **Commit the uncommitted work first** on that branch (so it's in history, not loose) — or keep as WIP tag; your call.
3. **Merge `main`** into the integration branch. Expect clean auto-merge of `main.jsx` + the security fix; resolve the **4 marketing conflicts by hand**, preserving both main's walkthrough fixes and our marketing edits (no wholesale "take one side").
4. **Verify the security fix** landed intact (`api/` endpoints).
5. **Build** (`vite build`) + run the Phase 6 regression checklist (investor first, then owner).
6. **Only after your approval**, apply the Phase 5 corrections (shared Settings, share.js, QR reuse, IR-field contact edit).
7. Nothing deploys; no native rebuild/resubmit until you approve a release.

---

*Companion doc:* `MINEEX_RELEASE_VERIFICATION.md` (per-change approval + test tracking).

---

## G. Synchronization run — RESULTS (2026-10-09)

**Branch:** `sync/main-into-appupdate-2026-10` · **Merge commit:** `c710b10`
**Backup (recoverable):** tags `backup/appupdate-head-20261008-133514`, `backup/appupdate-wip-20261008-133514` (`9db02a4`); bundle+patch in `/tmp/mineex-audit-backup-20261008-133514/`. Production and `main` untouched.

**What was integrated:** `main`'s commits (the critical **unauthenticated-AI-endpoint security fix `5e4540a`** + Conference/mobile marketing-walkthrough fixes, incl. main's latest tip `4947176`).

**Conflict resolutions (4, all marketing-site, resolved to main's version):**
| File | Ours | Main (taken) | Why |
|---|---|---|---|
| `src/marketing/system.jsx` | added a `dvh` height rule + `.mx-vstage` targeting | removed the `dvh` rule (caused jitter), added `touch-action:pan-y pinch-zoom` | competing fixes for the same phone black-strip bug; main's is the newer, informed iteration — keeping ours reintroduces the jitter |
| `InvestorPage.jsx` / `AppSection.jsx` | `position:sticky` | `position: mobile?relative:sticky` (desktop unchanged) | main's is a superset (adds mobile handling, preserves desktop sticky) |
| `ProProfileChapter.jsx` | sticky + `${PRO_STATES*72}svh` scroll track | relative + `100svh` + arrow controls, snapping removed | main's full mobile-walkthrough rewrite supersedes ours |

**No app code (`PassportProto.jsx`) was in conflict**; it is **byte-identical** to the pre-merge WIP (`81a680d`) — the merge changed no investor/company app behaviour.

**Verification results:**
| Check | Result |
|---|---|
| `vite build` | ✅ OK |
| `typecheck` (studio) | ✅ OK |
| `check:demo-assets` | ✅ clean (12 scenes, no real-company imagery) |
| `npm test` (AI-guard security regression) | ✅ **145 passed / 0 failed — no unauthorised request reached Anthropic** |
| Security fix present | ✅ `api/_aiGuard.js` + guards on audience-card/structure-release/synthesize-profile |
| App file integrity | ✅ identical to pre-merge |

**C-1…C-4 — verified from commit diffs (impact on the EXISTING investor experience):**
- **C-1 (`25d5809`) — login onboarding/interest gate removed.** Signed-in investors now go straight into the app; removed the `onbState` gate, `InvestorOnboarding` render, and the launch `getInvestorProfile()` round-trip. `WelcomeIntro`/`InvestorAuth` (incl. Apple/Google) untouched; existing sessions unaffected. **Impact:** investors no longer see the post-sign-in interest/onboarding step. *Confirm the feed still personalises acceptably without the collected interests.*
- **C-2 (`e4ab6e1` + ~13-commit refinement cluster) — "Message" → "Contact".** Company-profile header button changed from Message to a **Contact/IR sheet** (contact person, tappable Email/Phone/LinkedIn/Website/Address, plus "Message in MineEx" which still opens the existing company DM). **Impact:** richer contact info; messaging is now one tap deeper. Core investor-facing change.
- **C-3 (`80cb9b6`) — opening animation.** Splash bg now black; drill-core mark scales in, wordmark accordions open; ~1.9s, play-once (CTA buttons stay blue). **Impact:** cosmetic intro change, no functional effect.
- **C-4 (`dae17d4`) — standalone CEO profile page removed.** Tapping a leader now opens only the existing inline bio sheet; the full-screen CEO portal + its trigger + dead state removed. Inline bio / Connect-Message / MemberAvatar unchanged. **Impact:** investors can no longer open the full-screen CEO page.

All four are **intentional** (clear commit rationale), **not accidental** — but each alters the investor experience vs the currently published app, so each needs your explicit confirmation before release.

**Unresolved risks:** native-build↔commit traceability still UNVERIFIED; C-1…C-4 + the owner-feature corrections (U-3/U-4/U-5) await your decisions; none deployed.

---

## H. Phase-5 corrections + C-1 — IMPLEMENTED (2026-10-09, on `sync/…`, separate commits)

| ID | Commit | What changed | Reused (no duplication) | Verification | Approval |
|---|---|---|---|---|---|
| **A3** | `10894ce` | Owner share → `src/lib/share.js` (`companyShareUrl`+`shareContent`+`shouldFallback`) instead of ad-hoc `navigator.share` | existing share system | build ✅; pane 🟡 | Awaiting |
| **A4** | `0d911e0` | Polished owner **share sheet**: company logo + name + existing profile **QR** (`QRCode→mineex.ca/app?c=<slug>`) + Share + Copy link | existing QR generator; no 2nd system | build ✅; pane ✅ (QR renders, sheet opens) | Awaiting |
| **A2** | `ea17123` | **Complete contact editing**: IR contact name/role/photo added to `EditCompanyProfile` → `profile.contact.{name,role,photo}` via the single save path; card look unchanged; owner-gated | existing editor + `mapProfileToPP.CONTACT` + `uploadCompanyMedia` | build ✅; pane ✅ (fields present) | Awaiting |
| **A1** | `e6e4b79` | **Shared Settings**: extracted the investor Settings into one `AccountSettings`; both investor + owner render it; **deleted duplicate `CompanySettings`** | the real investor Settings | build ✅; pane ✅ (investor full panel + Account & Security sub-panel intact; company now identical); typecheck ✅; AI-guard 145/0 | Awaiting |
| **C-1** | `a442034` | **Skippable** one-time interest onboarding for new investors (overlay, not a gate); `onSkip` + "Skip for now"; one-time via local flag + single cloud check; fails open | existing `InvestorOnboarding` | build ✅; pane ✅ (direct access preserved, fail-open) | Awaiting |

**C-4/C-5/C-6 per your direction:** C-4 placeholder CEO page **kept removed**; C-5 fake Connect **kept removed** (company messaging preserved via Contact); C-6 Funding Runway bar **left removed** (pending your confirmation it was request #4).

**Still UNVERIFIED (need real account / native build):** the onboarding overlay's *appearance* for a brand-new investor + Skip dismissal (existing accounts have `onboarding_completed=true`, so correctly don't see it); all native iOS/Android behaviour; Android back-stack for the shared Settings sub-panels; share native sheet on device.
