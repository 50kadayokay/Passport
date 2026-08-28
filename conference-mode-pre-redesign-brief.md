# Conference Mode — Pre-Redesign Technical Brief

> Consolidated from direct codebase audits. Read-only reference. Nothing in the code was modified to produce this.
> Canonical booth file: `src/aiBrief/ConferenceScenes.jsx`. Shared primitives + booth switch: `src/aiBrief/PassportProto.jsx`.

---

## Project boundary (read first)

- **We are NOT rebuilding** the extraction pipeline, the blueprint schema, the blueprint editor, evidence/validation, profile persistence, the `pp` compiler, or the company data architecture.
- **We ARE building** the definitive production **Conference Mode presentation layer**, using screenshots / screen recordings / live Framer references as the visual + motion source of truth.
- **Hard requirement:** the finished presentation must remain **driven by the existing company blueprint/data** (`window.__PP__` + `conf.*`), so any onboarded mining company auto-populates the same Conference Mode system with no per-company styling.
- **Structural consequence:** the redesign lives inside `ConferenceScenes.jsx` (plus a new conference-only UI file). It keeps reading the same globals/fields and keeps calling the widget resolver. It does not touch the read-only contracts or the do-not-touch systems listed below.

---

## 1. Current architecture

- **Stack:** React 18 (no TypeScript), Vite, Tailwind (admin/app only — **the booth uses no Tailwind classes**), Supabase (Postgres/PostgREST/RLS/Storage, `companies.profile` jsonb), Vercel, PWA service worker.
- **Booth entry:** `/app?c=<slug>&ipad=1` (or `&mode=booth`). `App` (`PassportProto.jsx`) checks `isBooth` and **early-returns the booth renderer before any phone-mode hooks run**.
- **Renderer variants:** `?scene=1` → `ConferenceScenes` (canonical, default), `?board=1` → `ConferenceProfile`, `?fixa` → `ConferenceFixa`. `conference.style` can also select `board`/`fixa`. Default is `ConferenceScenes`.
- **Data source at runtime:** the booth reads module-global variables (`COMPANY`, `PROJECTS_FULL`, `CONFERENCE`, `OWNERSHIP`, `EXCHANGES`, `STATUS`, `STATUS_IMG`, `AVATAR`, `CAP`, `CAPSTATUS`, `TEAM_MEMBERS`, `PR_YEARS`) that are reassigned by `applyPP()` from `window.__PP__`. **The booth receives no props.**
- **Leaf status:** nothing outside `src/aiBrief/` imports `ConferenceScenes.jsx`; it is rendered only by the `App` booth switch. Edits confined to it cannot propagate upstream.
- **Gating:** booth is a **paid feature** — `isListingTier` (free) is excluded.

## 2. Current 11-section structure (as actually implemented)

Scenes are pushed into a `scenes[]` array, each conditionally included only when its data predicate passes.

| # | Intended section | Implemented as | Notes |
|---|---|---|---|
| 1 | Hero | Bespoke full-bleed `100vh` block (not `SceneShell`) | `data-sec="overview"`; own CSS animation cascade + parallax |
| 2 | Company | `SceneShell bg:#000` — black scene, headline+paragraph left, image right, fact-tile row bottom | Recently redesigned; shares the Hero's "overview" nav anchor |
| 3 | Highlights | Rendered as **"At a Glance"** — glass stat-card grid | Same scene; different label |
| 4 | Jurisdiction | `SceneShell bg:#0b1220` | No nav anchor |
| 5 | Projects/Assets | **Split**: Portfolio Overview scene (multi-asset only, carries `id="projects"`) + one full-bleed `SceneProjectStory` per project | Flagship first |
| 6 | Results | `SceneShell bg:#05070d`, stage-adaptive (resource/economics/production) | No nav anchor |
| 7 | Milestones/Timeline | **DISABLED** — `if (false && years.length)`; NAV entry hardcoded `false` | Data (`PR_YEARS`) + app timeline untouched; only the booth scene is suppressed |
| 8 | Capital | `SceneShell id:"capital"` | Big-number cells + text badges + OwnershipBar + partnership pills |
| 9 | Leadership | Two variants: light photo-grid (`bg:#faf7f3`, CEO card + team grid) OR dark track-record cards | Non-snap, top-justified; **no LinkedIn**; `id:"leadership"` |
| 10 | Why Invest | `SceneShell bg:#05070d` — numbered reason cards + advantage pills + catalyst cards | No nav anchor |
| 11 | Follow/QR | `SceneShell id:"follow"` — headline + benefits + pulsing QR | Bg can be a follow-gallery image |

- **Also present:** up to 2 **Custom sections** (between Why Invest and Follow).
- **Nav collapses to 5 anchors:** Overview, Projects, Capital, Leadership, Follow. Jurisdiction, Results, Why Invest, Custom are scroll-only.
- **Orphaned/unused fields verified:** `overviewWidgetKeys` (Company redesign switched to a fixed 7-fact map), `conf.mission`, `conf.macroContext`, `leadership.investorTakeaway`, and the computed `featuredMilestones` (Timeline disabled).

## 3. Blueprint → UI data flow

```
documents → extraction (LLM) → blueprint → blueprint editor → validation/evidence
  → profile data (Supabase companies.profile jsonb)
  → COMPILE: mapProfileToPP(profile)  [src/lib/profileToPP.js]
  → window.__PP__ (applyPP reassigns module globals)
  → PRESENTATION: ConferenceScenes reads globals + window.__PP__.CONFERENCE (conf.*)
```

- **Two data lanes:** `conference.*` is copied **verbatim** into `pp.CONFERENCE`; shared fields are transformed into `COMPANY/PROJECTS_FULL/CAP/TEAM_MEMBERS/OWNERSHIP/EXCHANGES/STATUS_IMG/AVATAR`, plus `BRAND`/`BRAND_TEXT` accent colors (from `profile.brand.color`, `BRAND_TEXT = darken(color, 0.16)`; default emerald `#059669`/`#047857`).
- **Merge semantics:** `applyImport(existing, payload)` shallow-merges `conference` (non-empty only) — which is why conference widget layers use **flat keys** (`<page>Widgets`, `<page>WidgetKeys`, `<page>CustomWidgets`).
- **Widget resolution (runtime compile):** curated stat badges flow through `conferenceWidgets.js` — `resolveWidgets(page, auto, conf)`, `resolveProjectWidgets(key, auto, conf)`, `widgetText()`. This is the **shared contract** between the Blueprint editor (`BlueprintReview.jsx`) and the booth. Keep signatures/keys stable.
- **The booth is read-only** against `window.__PP__`; it never writes to Supabase.

## 4. Shared component system

**Already components (the redesign's backbone):**
- `SceneShell` (`PassportProto.jsx`) — full-viewport section, vertical-center, 1240px inner column, per-scene bg, `data-sec`, `scrollSnapAlign:start`. Props: `children,bg,color,minVh,pad,style,id`.
- `Reveal` — **local to `ConferenceScenes.jsx`** (Midu clip-mask entrance), shadows the imported scroll-linked `Reveal`/`Layer`. Variants `eyebrow|head|body|media|card`.
- `CountUp` (`PassportProto.jsx`) — number tally; **scroll-linked via ScrollFX, reverses on scroll-back**.
- `OwnershipBar` — segmented ownership bar (parses "~NN% label").
- `ChapterMark` — number · rule · label (Leadership-A, disabled Timeline).
- `BoothTimeline` — accordion timeline (**used only by the disabled Timeline scene**).
- `sceneEyebrow(col)` — style factory (13px/800/uppercase/0.24em).
- `heroStat()`, `boothGallery()` — local closures in `ConferenceScenes.jsx`.

**Recurring patterns that are inline literals, NOT components (top consolidation targets):** tint metric/info card (~10×), auto-fit stat grid (~10× with 10 different min-widths), rounded-999 pill (~6×), glass card, big-number stat cell, "intro-as-head" lead (~4×), card micro-label (~9×), display heading (per-scene clamps), accent-bar quote, framed image container, gradient scrim (3 variants), portfolio project card, numbered reason card, catalyst card, team/CEO card, track-record card, avatar-mono box, deposit tag row, thumbnail strip, QR (corner + full duplicated), scroll cue.

**Caveat:** the shared primitives are defined in `PassportProto.jsx` and used ~19× by the phone app. **Fork conference-only copies rather than mutating them.**

## 5. Current design system

- **Fonts:** `index.html` loads Switzer + Instrument Serif, but the **canonical booth renders the system stack** (`-apple-system,…`) — the webfonts are effectively used only by `ConferenceFixa`. No font token.
- **Color tokens:** only `EM` (accent) and `EM_TEXT` (darker shade), from `window.__PP__.BRAND`. Everything else is a raw literal. (`THEME` per-section palette in `PassportProto.jsx` is app-only, not used by the booth.)
- **Backgrounds:** per-scene hardcoded literals — `#000000`, `#05070d`, `#0b1220`, `#faf7f3` (only light scene), plus gradient scrims on full-bleed scenes.
- **Borders/radii/shadows:** no scales. Border idiom `1px solid rgba(255,255,255,0.1)` (+ alphas 0.12–0.22) repeated ~25×; ~10 ad-hoc radii (999/32/30/26/24/22/20/18/16/14/9); shadows are one-offs (Leadership cards, hero logo, corner QR).
- **Glass/blur:** `backdrop-filter: blur()` — At-a-Glance cards `14px`, nav `12px`, corner QR `10px`, project callouts `10px`, hero pills `8px`.
- **Spacing:** the only shared decision is `SceneShell` padding `clamp(80px,11vh,150px) 56px` and the de-facto `56px` gutter + `maxWidth:1240` (nav uses 1180 inconsistently). Everything else is per-element margin/gap literals.
- **Grid:** CSS Grid, dominant pattern `repeat(auto-fit, minmax(Npx,1fr))` with N tuned per scene.
- **Tailwind:** configured but `theme.extend` empty; **booth uses 0 Tailwind classes** and only 2 CSS classes (`conf-hero-bg`, `pp-scene-pulse`, both booth-defined). Essentially 100% inline styles.

## 6. Current motion system

- **No animation library** (deps: `qrcode`, `lucide-react`, `pdfjs-dist`, `react`, `react-dom`). All motion is DIY. **No spring physics anywhere.**
- **Five coexisting systems:**
  1. Local `Reveal` (IntersectionObserver, threshold **0.2**, fires **once, no replay**) — primary text/card system, driven by `CONF_MOTION` config + `CONF_EASE = cubic-bezier(0.22,1,0.36,1)`.
  2. Hero — bespoke CSS `@keyframes` cascade (`confHeroRise`/`confHeroBg`), once on mount.
  3. `CountUp` via `ScrollFX` — **scroll-linked, reversible** (differs from the once-model beside it).
  4. `OwnershipBar` — own IO (0.35), once, CSS width transition staggered 90ms.
  5. QR pulse (`ppScenePulse`) — **infinite** box-shadow/scale.
- **`CONF_MOTION` variants (verified):** eyebrow `{d0,dur620,y14}`, head `{d120,dur860,y0,blur4,clip,stagger55}`, body `{d300,dur720,y20}`, media `{d340,dur780,y24}`, card `{d420,dur660,y22,scale0.985,stagger70}`.
- **Reduced-motion:** honored across all systems (`prefersReduce()` + a Hero `@media` block).
- **Replay:** text/cards/hero/ownership = once; `CountUp` = reverses; hero parallax = continuous; QR pulse = infinite.
- **Two `Reveal` name collision** (local once-model vs imported scroll-model) is a known footgun to resolve when systematizing.

## 7. iPad behavior

- **Orientation:** manifest `orientation:"any"`; the JS `screen.orientation.lock("portrait")` lives **after** the booth early-return, so **the booth is not orientation-locked** (layouts read landscape-first, portrait degrades but doesn't break).
- **Viewport:** `maximum-scale=1.0, user-scalable=no, viewport-fit=cover` (pinch-zoom disabled). Sizing uses `vh` (not `dvh`).
- **Scroll:** one `position:fixed; inset:0; overflowY:auto; overflowX:hidden` container, `WebkitOverflowScrolling:touch`, `scrollSnapType:"y proximity"`, per-scene `scrollSnapAlign:start` (Leadership/Timeline opt out).
- **Touch:** no `touch-action` CSS; project stories add horizontal swipe (48px threshold) without `preventDefault`.
- **Absent (verified):** no `@media (orientation)`, no width breakpoints, no `overscroll-behavior`, no `touch-action`, no `env(safe-area-inset-*)`, no `100dvh`, **no Wake Lock / fullscreen enforcement**. Only media query in the booth path is `prefers-reduced-motion`.
- **Kiosk:** 45s idle attract-reset glides to Hero but does **not** keep the screen awake (needs iOS Auto-Lock/Guided Access).
- **Flag dependency:** without `ipad=1`, an iPad renders the phone/desktop app (`isPhone()` treats iPad as non-phone), not the booth.

## 8. Offline behavior

- **Service worker** `public/sw.js`, `CACHE_VERSION="passport-booth-v4"`: navigations network-first → cached `/app` shell; assets/fonts/Storage images cache-first (revalidate in background); `/rest/v1/` **network-first with cache fallback**.
- **After one online load:** offline refresh works — cached shell + bundles; the seed query falls back to its cached response → `window.__PP__` re-seeds → booth renders. Requires the **same seed-query URL** to have been cached; cold-start offline shows "unavailable"/default.
- **Steady state:** once loaded, the running booth makes **no further network calls** (QR is local, no polling/analytics/live refresh).

## 9. Media handling

- **Images:** plain `<img>` — no `loading="lazy"`, no `decoding`, no width/height, no placeholders → eager load + possible layout shift on cold load; instant after cache.
- **Resolution:** per-project prefers `conf.projectGallery[key]`, else shared `project.gallery`; section images via `boothGallery` (`conf.gallery[section]` + legacy `conf.images[section]`); hero/company image falls back to `STATUS_IMG`; sizing via `objectFit:cover` + `vh`/px maxHeight caps (no `aspect-ratio`).
- **Video:** optional hero `conf.heroVideo` → `<video autoPlay muted loop playsInline>` (correct for iOS autoplay); cached opaque; loops continuously.

## 10. QR / follow behavior

- QR generated **client-side** (`qrcode` → inline SVG, `errorCorrectionLevel:"H"`, margin 0) — works fully offline.
- Encodes `${origin}/app?c=<slug>&utm_campaign=<conf.boothQrUtm||"booth">` — the visitor's **phone** profile, deliberately **without `ipad=1`**.
- Two renderings: a persistent bottom-right mini-QR (hidden on the Follow scene) and the full 280×280 pulsing QR card on Follow (`ppScenePulse`).
- Follow scene copy/benefits: `conf.follow.benefitLabels` (else 5 hardcoded defaults), `conf.follow.qrLabel`.

## 11. Missing-data behavior

- Every scene is conditionally pushed only when its data predicate passes → **missing data removes the whole scene/field; there are no empty/skeleton states.**
- All strings coerced via a local `S()` (null → `""`); fields filtered out when empty.
- Nav anchors are conditional (`projects.length`, `capHasData`, `leadHasData`), so the nav bar reflects available data.
- No `notFound` taxonomy — absence is silent.

## 12. Files safe to modify (for this redesign)

- **`src/aiBrief/ConferenceScenes.jsx`** — the whole canonical booth (target). *Rule: keep reading the same `window.__PP__` globals + `conf.*` keys and the widget-resolver API.*
- **A new file** (e.g. `src/aiBrief/conferenceUI.jsx`) for the extracted reusable component system — preferred over editing shared primitives.
- **`src/index.css`** — append booth-scoped classes/keyframes (don't repurpose app `pp-*`).
- **`index.html`** — only font `<link>`/viewport/meta, carefully (global file).

## 13. Files that should NOT be modified without explicit permission

- **Read-only contracts (must understand, must not change):** `src/lib/profileToPP.js` (`mapProfileToPP`, shared by 10 surfaces), `src/lib/conferenceWidgets.js` (editor↔booth contract).
- **Shared primitives + booth switch inside `src/aiBrief/PassportProto.jsx`** (`SceneShell`, `CountUp`, `OwnershipBar`, `ChapterMark`, `BoothTimeline`, `sceneEyebrow`, the `App` `isBooth` switch, `ConferenceProfile`, `ConferenceFixa`) — shared with the phone app; **fork, don't mutate**.
- **Persistence/lifecycle:** `src/lib/profileImport.js`, `storage.js`, `supabase.js`, `publish.js`, `publishClient.js`, `profileVersions.js`, `profileSafety.js`.
- **Blueprint/extraction/evidence:** all of `src/lib/blueprints/*`, `src/lib/ai.js`, `pdfText.js`, `structureReleases.js`, `pressRelease.js`, and `src/admin/*` (editor/extraction/evidence UI).
- **Offline/config (change only deliberately):** `public/sw.js` (bump `CACHE_VERSION` on breaking asset changes), `public/manifest.webmanifest`.
- **`supabase/migrations/*`**, `public/kingsmen-resources-backup.json` — never as part of a visual change.

**Configuration files that affect styling/animation/responsive/routing/offline:** `index.html` (fonts, viewport, SW registration), `src/index.css` (styling/animation), `tailwind.config.js` (empty extend; booth uses no Tailwind), `postcss.config.js`, `public/manifest.webmanifest` (PWA/orientation/offline), `public/sw.js` (offline), `src/main.jsx` (routing + `window.__PP__` seeding).

## 14. Known technical constraints

- Booth is **~100% inline styles**, no design tokens beyond `EM`/`EM_TEXT`; no Tailwind in the booth.
- Shared primitives are coupled to the phone app (mutating them affects the app).
- `mapProfileToPP` and `conferenceWidgets` are shared contracts — presentation must consume, not reshape.
- No animation library and no springs — reference motion with overshoot/bounce can only be approximated with cubic-bezier unless a library is added.
- `Reveal` accepts only `v`, `order`, `style`, `className` — **no per-call duration/delay/distance override**; precise per-element choreography needs new variants or new props.
- Two `Reveal` implementations share a name (once vs scroll-linked); `CountUp` replays while neighbors don't.
- iPad kiosk gaps: no Wake Lock, no fullscreen enforcement, `vh` (not `dvh`), no `overscroll-behavior`, no safe-area insets, orientation unmanaged.
- Cold-start requires network once; offline correctness depends on the seed-query URL shape staying stable.
- `data-sec` anchors + NAV ids are internally coupled to the scroll-spy.

## 15. Known prototype / temporary elements

- **Timeline scene DISABLED** (`if (false && years.length)`), NAV entry hardcoded `false`; `featuredMilestones` computed but unused; `BoothTimeline` only referenced by this dead path.
- **Orphaned fields:** `overviewWidgetKeys`, `conf.mission`, `conf.macroContext`, `leadership.investorTakeaway`.
- **Fonts loaded but unused** by the canonical booth (Switzer/Instrument Serif → only `ConferenceFixa`).
- **Alternate renderers** `ConferenceProfile` (board) and `ConferenceFixa` exist behind `?board`/`?fixa`/`conference.style` for A/B; canonical is `ConferenceScenes`.
- Nav container width `1180` vs content `1240` inconsistency.

## 16. Existing capabilities we should reuse

- **`SceneShell`** section frame (height/center/width/snap/anchor contract).
- **`Reveal` + `CONF_MOTION` + `CONF_EASE`** as the central motion token table (extend, don't rewrite from scratch).
- **`CountUp`, `OwnershipBar`, `ChapterMark`, `sceneEyebrow`, `heroStat`, `boothGallery`** — working primitives.
- **`conferenceWidgets` resolver** — curated stat-badge rendering (the data-driven backbone for per-page/per-project stats).
- **Client-side QR generation** and the offline-proof handoff URL contract.
- **Blueprint-curated selection layers** already wired: widget include/exclude/custom, record pools (highlights/why-invest), leadership selection (no LinkedIn), per-page hero stats, per-project widgets + takeaway, per-section galleries.
- **The scene-skip + `S()` coercion** missing-data model (data-driven population across companies).
- **Service worker offline caching** and the PWA standalone setup.

---

## Redesign guardrails (summary)

1. Work in `ConferenceScenes.jsx` + a new `conferenceUI.jsx`; fork shared primitives instead of editing them.
2. Keep consuming `window.__PP__` globals + `conf.*`; keep the `conferenceWidgets` call signatures; don't touch `mapProfileToPP`.
3. Preserve: booth early-return position, `data-sec` anchors + nav, client-side QR + handoff URL, single fixed scroll container + `overflowX:hidden`, `scrollSnapAlign:none` escape hatch for tall scenes, reduced-motion honoring, iOS video attributes, SW cache contract (`/app` shell + network-first `/rest/v1/`; bump `CACHE_VERSION` on breaking assets).
4. The result must stay fully data-driven so any onboarded company auto-populates the same system.
