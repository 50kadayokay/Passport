# MINEEX DESIGN SYSTEM

**Status:** v1.0 — extracted from the live investor app (`src/aiBrief/`), 2026-09-10.
**Source of truth** for all MineEx UI. Derived from the shipping product, not invented.

> This document was reverse-engineered from the production investor app, which is
> visually approved and treated as **read-only** during the current sprint. The app
> uses Tailwind with the **default theme** (no custom tokens), so the system below
> is the *implicit* language made explicit. New/unfinished surfaces (Conference Mode,
> onboarding, portal, sales site) must be built to this system. The live app is the
> reference, never the retrofit target.

---

## 0. Design philosophy

MineEx is a **premium investor / mining information product**, not a generic SaaS dashboard.

- Visually sophisticated, extremely clean, calm, deliberate.
- Information can be **dense**; the interface must never **feel** dense.
- Every screen has one obvious hierarchy and one primary action.
- Restraint over decoration: whitespace, strong typography, real imagery, and hierarchy do the work — not borders, gradients, or nested cards.

**Anti-patterns (banned):** cards-inside-cards, decorative gradients, heavy/omnipresent borders, oversized headings, generic AI-dashboard chrome, visual clutter, more than one primary action per view.

**North stars (principles, never imitation):** the clarity of Linear, the trust of Stripe, the restraint of Apple, the polish of Framer. MineEx keeps its own identity: **slate + cobalt, heavy-but-tight type, soft layered elevation, fully-rounded interactive elements.**

---

## 1. Two registers (shared vs surface-specific)

MineEx has **one system, two voices**. Both are extracted from the real codebase.

| | **Register A — Product/System** | **Register B — Editorial/Cinematic** |
|---|---|---|
| **Used by** | Investor app, Company Portal, Admin | Conference Mode, Sales/marketing site |
| **Typeface** | System stack (native, iOS-like) | **Switzer** (sans) + **Instrument Serif** (display serif) |
| **Feel** | Utility, fast, legible, dense-capable | Cinematic, spacious, narrative, premium |
| **Motion** | Micro (press, fade, slide ≤0.34s) | Orchestrated scene transitions, globe/map |
| **Color/tokens** | Identical foundations (below) | Identical foundations (below) |

The **foundations in §2–§9 are shared by both registers.** Only typeface, density, and motion scale differ. This is what keeps four surfaces feeling like one product.

---

## 2. Color

### 2.1 Neutral family — **SLATE** (never gray/zinc/neutral)

The entire app is built on Tailwind `slate`. This is a hard rule; mixing in `gray`/`zinc`/`neutral` breaks the identity.

| Token | Tailwind | Hex | Role |
|---|---|---|---|
| Text / Primary | `slate-900` | `#0f172a` | Headings, names, prices, primary text |
| Text / Secondary | `slate-500` | `#64748b` | Body, summaries, secondary lines |
| Text / Muted | `slate-400` | `#94a3b8` | Captions, meta, timestamps, tickers |
| Text / Faint | `slate-300` | `#cbd5e1` | Separators (`·`), chevrons, faintest text |
| Text / Emphasis-2 | `slate-700` | `#334155` | Icon buttons, slightly-emphasized secondary |
| Input text | `slate-800` | `#1e293b` | Values typed into fields |
| Border / Hairline | `slate-100` | `#f1f5f9` | **Default** card & nav border, dividers |
| Border / Control | `slate-200` | `#e2e8f0` | Inputs, chips, stronger dividers |
| Surface / Canvas + Card | `white` | `#ffffff` | App background **and** card surface |
| Surface / Muted control | `slate-100` | `#f1f5f9` | Inactive chips/tabs, search fields |
| Surface / Tinted field | `slate-50` | `#f8fafc` | Input backgrounds, subtle sections |
| Surface / Dark | `slate-900` | `#0f172a` | Dark tiles, avatar initials, high contrast |

> Canvas and card are **both white** — separation comes from the **shadow + hairline border**, not a gray page behind white cards. This is central to the calm look.

### 2.2 Accent — **cobalt blue**

| Token | Tailwind | Hex | Role |
|---|---|---|---|
| Accent / Primary | `blue-600` | `#2563eb` | Primary CTA, follow, links, eyebrows. **The brand `EM` constant.** |
| Accent / Active | `blue-500` | `#3b82f6` | Active segmented tabs, progress bars, unread dots |
| Accent / Tint | `blue-50` | `#eff6ff` | Accent chip/pill backgrounds |
| Accent / Verified | sky `#0ea5e9` | | BadgeCheck / verified markers only |

### 2.3 Semantic (use sparingly — never as chrome)

| Meaning | Tailwind / Hex | Where |
|---|---|---|
| Negative / Destructive | `rose-500` `#f43f5e`, `rose-600` | Down %, sign-out, delete |
| Industry (news) | `amber-600` text / `amber-50` bg | "INDUSTRY" category chip |
| Company (news) | `indigo-500` text / `indigo-50` bg | "COMPANY" category chip |

**Materiality badge palette** (news impact — inline hex, do not approximate):
- Transformational `#7c3aed` on `#f5f3ff` (violet)
- High `#0f766e` on `#eff6ff` (teal)
- Moderate `#1d4ed8` on `#eff6ff` (blue)
- Low `#64748b` on `#f8fafc` (slate)

**Avatar hash palette** (deterministic generated avatars only — never chrome): 16 saturated hues
`#4f46e5 #0891b2 #0d9488 #2563eb #65a30d #ca8a04 #d97706 #ea580c #dc2626 #e11d48 #db2777 #9333ea #7c3aed #2563eb #0284c7 #0f766e`.

### 2.4 Dark mode

**Not implemented** in the product app and **not** in scope for this sprint. No `dark:` variants. (Conference Mode composes its own dark scenes via explicit inline styles / a `dark` prop — that is scene art direction, not a theme system.) Do **not** add a global dark theme without an explicit decision.

---

## 3. Typography

### 3.1 Typefaces

- **Register A (product):** system stack —
  `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`.
- **Register B (editorial):** **Switzer** `400,500,600,700` (Fontshare) for UI/body; **Instrument Serif** (Google) `ital 0;1` for display/quotes. Already loaded in `index.html`.
  - Fallbacks: Switzer → the system stack; Instrument Serif → `Georgia, "Times New Roman", serif`.

### 3.2 Type scale — **arbitrary px, half-px allowed**

The app expresses size in `text-[NNpx]`, not `text-sm/base/lg`. Codify these steps:

| px | Role | Example pattern |
|---|---|---|
| **8 / 9 / 9.5** | Micro badges/pills (uppercase) | `text-[9px] font-bold uppercase tracking-wider` |
| **10 / 10.5** | Caption / meta | `text-[10.5px] font-semibold text-slate-400` |
| **11 / 11.5** | Small labels, chips | `text-[11px] font-bold` |
| **12 / 12.5** | Secondary body / summaries | `text-[12.5px] leading-relaxed text-slate-500` |
| **13 / 13.5** | **Body & label workhorse** | `text-[13px] font-bold` |
| **14 / 14.5** | List/card titles, inputs | `text-[14.5px] font-extrabold leading-snug` |
| **15** | Larger body, search input, primary chips | `text-[15px] font-bold` |
| **16** | Form inputs (prevents iOS zoom), emphasis | `text-[16px]` |
| **17–22** | Subheads, prices | `text-[22px] font-extrabold` |
| **30 / 34 / 38** | Screen titles / display | `text-[34px] font-extrabold leading-none tracking-tight` |

Rule of thumb: **inputs never below 16px on mobile** (iOS zoom). Everything else picks the nearest step above.

### 3.3 Weight, tracking, leading

- **Weight:** the app skews **heavy**. Default emphasis is `font-bold`; titles/prices/initials are `font-extrabold`; muted body is `font-medium`; `font-semibold` for captions. `font-normal` is rare. Never set body lighter than `font-medium`.
- **Tracking:** `tracking-tight` on essentially all headings, titles, and dense body. Uppercase labels use `tracking-wider` / `tracking-widest`, or arbitrary `tracking-[0.14em]`–`[0.22em]` on eyebrows/pills.
- **Leading:** `leading-none` (big display titles), `leading-snug` (card/list titles), `leading-relaxed` (summaries/body).

### 3.4 Canonical text patterns

```txt
Screen title      text-[34px] font-extrabold leading-none tracking-tight text-slate-900
Eyebrow / label   text-[13px] font-bold uppercase tracking-[0.16em] text-blue-600   (or text-slate-400)
Card title        text-[14.5px] font-extrabold leading-snug tracking-tight text-slate-900
Body / summary    text-[12.5px] leading-relaxed text-slate-500
Caption / meta    text-[10.5px] font-semibold text-slate-400
Micro badge       text-[9px] font-bold uppercase tracking-wider
```

---

## 4. Spacing, grid & layout

- **Screen horizontal gutter: `px-5`** (20px) — consistent app-wide. Editorial surfaces may go wider.
- **Rhythm:** a fine half-step scale — **1.5 / 2 / 2.5 / 3 / 3.5** is the backbone.
  - Icon↔text: `gap-1.5`. Row layouts: `gap-3` / `gap-3.5`.
  - List stacks: `space-y-3.5` (roomy) or `space-y-2.5` (tight).
  - Card padding: `p-4` (standard) / `p-3.5` (rows) / `p-3` (compact).
  - Pills: `px-2 py-0.5` (micro) → `px-2.5 py-1` (info). Buttons: `px-4 py-1.5` (compact) / `px-5 py-2.5` (primary).
- **Layout:** single-column mobile-first; content lives in a phone-width column. Sticky sub-headers use `sticky top-0 z-30` with a white bg + `slate-100` bottom hairline.

---

## 5. Radii

| Token | Tailwind | Applied to |
|---|---|---|
| Pill / round | `rounded-full` | Buttons, pills, chips, avatars, dots, tab underline, icon buttons |
| **Card (default)** | `rounded-2xl` (16px) | Cards, list rows, nav hit-areas |
| Card (roomy row) | `rounded-3xl` (24px) | Generous list rows (`CompanyRow`) |
| Input | `rounded-xl` (12px) | Text fields, inner tiles |
| Squircle tile | `rounded-[16px]` | Square company logo tiles (`Logo`/`MonoTile`) |

Rule: **interactive = fully round; container = `rounded-2xl`; input = `rounded-xl`.** Avoid `rounded-lg`/`rounded-md` for primary surfaces (reads generic).

---

## 6. Borders

- Default hairline: **`border border-slate-100`** (1px) on cards & nav.
- Controls/inputs: `border-slate-200`; focus deepens to `border-slate-300`.
- Width is almost always default `border` (1px). `border-2`+ is rare/intentional.
- Directional dividers: `border-t border-slate-100` (nav/section tops), `border-b` (headers). `divide-y divide-slate-100` for lists.
- **Do not** stack borders + strong shadow + tint on the same element. Pick one separation method (usually shadow + hairline).

---

## 7. Elevation (shadows)

The signature elevation is a **layered, slate-tinted, low-alpha inline shadow** — a 1px contact shadow plus a large soft diffuse. This, not a gray canvas, is how cards lift off white.

```css
/* Card — standard */
box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 12px 26px -20px rgba(15,23,42,0.40);
/* Card — slightly deeper variant */
box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 12px 26px -22px rgba(15,23,42,0.45);
/* Low tier only (utility class form) */
shadow-[0_1px_2px_rgba(15,23,42,0.04)]
```

- Shadow color is always **slate-900 rgb `15,23,42`** at very low alpha. Never use black or default Tailwind `shadow-md/lg` on cards (too harsh, wrong tint).
- Modals / bottom sheets may use `shadow-2xl`.

---

## 8. Motion & transitions

Hand-rolled CSS keyframes (no animation library). One easing signature: **`cubic-bezier(0.22, 1, 0.36, 1)`**, durations **0.24–0.34s**. All disabled under `prefers-reduced-motion`.

| Class | Use | Spec |
|---|---|---|
| `pp-fade` | Tab/section content in | fade + 8px rise, 0.34s |
| `pp-slide-up` | Bottom sheets / detail modals | 26px rise, 0.32s |
| `pp-pop` | Modal / card pop | scale 0.96→1, 0.24s |
| `pp-backdrop` | Scrim fade | 0.24s ease |
| `pp-press` / `active:scale-95` | Tactile press on controls | scale 0.97 on `:active`, 0.12s |
| `active:scale-[0.99]` | Card press | subtle |
| `pp-view` | View enter | 6px rise, 0.34s |
| `pp-wordfade` | Word-by-word hero reveal | blur+rise, 0.62s |
| `pp-spin` | Loading spinner | 0.8s linear |

**Rule:** every tappable element gets press feedback (`active:scale-95` controls / `active:scale-[0.99]` cards) + `transition`. Register B may add orchestrated scene transitions but must keep this same easing family.

---

## 9. Iconography

- **Library:** `lucide-react` **only**. No other icon set, no emoji as UI.
- **Size:** cluster at **13–16px** inline; nav at 24px; large accents 18–22px.
- **Stroke:** deliberately **heavy — `strokeWidth` 2.2–2.8** (default 2 looks too thin here). Active nav bumps to 2.4.
- **Color:** via `text-slate-*` / `text-blue-*`. Some active icons fill with `currentColor` (nav Sparkles, Flame).

---

## 10. Components

### 10.1 Buttons

```txt
Primary (accent pill)
  inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-bold
  bg-blue-600 text-white transition active:scale-95

Primary (dark solid)   — active filter / strong CTA
  rounded-full px-5 py-2.5 text-[15px] font-bold bg-slate-900 text-white transition active:scale-95

Secondary (outline chip)
  inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white
  px-3 py-1.5 text-[11px] font-bold text-slate-600 transition active:scale-95

Toggled-off / muted
  bg-slate-100 text-slate-600            (e.g. "Following" state)

Icon button (circular)
  grid h-11 w-11 place-items-center rounded-full border border-slate-200 bg-white
  text-slate-700 shadow-sm
```

One **primary** action per view (accent or dark). Everything else is secondary/ghost.

### 10.2 Inputs

```txt
Search field
  wrapper: flex items-center gap-3 rounded-2xl bg-slate-100 px-4 py-3.5
  input:   w-full bg-transparent text-[15px] text-slate-700 placeholder:text-slate-400 outline-none
  icon:    <Search size={20} className="text-slate-400" />

Form field (inputCls)
  w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13.5px] text-slate-800
  outline-none transition focus:border-slate-300 focus:bg-white
  (textarea: + resize-none)

Checkbox: accent-blue-600
```

Mobile inputs that accept typing use **≥16px** to prevent iOS zoom.

### 10.3 Cards

```txt
Standard card
  rounded-2xl border border-slate-100 bg-white p-4 text-left transition active:scale-[0.99]
  + box-shadow: 0 1px 2px rgba(15,23,42,.04), 0 12px 26px -20px rgba(15,23,42,.4)

Roomy list row (CompanyRow)
  flex items-center gap-3.5 rounded-3xl border border-slate-100 bg-white p-3.5
  shadow-[0_1px_2px_rgba(15,23,42,0.04)] active:scale-[0.995] transition
```

No nested cards. A card is white-on-white lifted by shadow + hairline.

### 10.4 Pills / badges / chips

```txt
Filter chip           rounded-full px-5 py-2.5 text-[15px] font-bold transition
  active:   bg-slate-900 text-white
  inactive: border border-slate-200 bg-white text-slate-600

Micro badge           rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider
Category chip (tint)   text-indigo-500 bg-indigo-50   /   text-amber-600 bg-amber-50   /   text-blue-600 bg-blue-50
Info pill             inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1
                       text-[11.5px] font-bold text-slate-500
Unread dot            h-2 w-2 rounded-full bg-blue-500
```

### 10.5 Navigation

```txt
Bottom tab bar
  container: flex-shrink-0 border-t border-slate-100 bg-white px-6 pt-2.5 pb-5
  item:      grid h-11 w-14 place-items-center rounded-2xl transition-colors
  active:    bg-slate-100 + icon text-slate-900 strokeWidth 2.4 (Today icon fills)
  inactive:  icon text-slate-400 strokeWidth 2
  tabs:      Today (Sparkles) · Explore (Compass) · Following (Star) · Profile (User)

Screen header
  flex items-start justify-between px-5 pt-3 pb-1
  eyebrow: text-[13px] font-bold uppercase tracking-[0.16em] text-blue-600
  title:   text-[34px] font-extrabold leading-none tracking-tight text-slate-900
  right:   action (e.g. ScanButton)

Segmented tabs
  track: grid grid-cols-N border-b border-slate-200
  indicator: absolute -bottom-px h-[2px] rounded-full bg-slate-900   (underline)
  pill variant: active bg-blue-600 text-white / inactive bg-slate-100 text-slate-500
```

### 10.6 Avatars & logos

- **`CoLogo`** (company, default 44): round. Image → `overflow-hidden rounded-full border border-slate-200 bg-white` `object-cover`. Fallback → initials tile, `rounded-full`, `font-extrabold text-white`, bg from avatar-hash palette, font ≈ `size*0.34`.
- **`Logo`** (company, 38): **squircle** `rounded-xl`, brand color or `#0f172a`, white extrabold initials.
- **`Avatar`** (person, 86): round; photo `object-cover` or `bg-slate-900` initials, `letterSpacing -0.03em`.
- **`initialsOf()`** strips legal suffixes (Ltd/Inc/Corp) before deriving initials.
- **Universal fallback rule:** image if present, else **deterministic colored initials tile**. Never a broken image, never an empty circle.

### 10.7 Imagery

- Fill fixed boxes with `object-cover`. Round company marks via `overflow-hidden rounded-full`.
- Scrims: `bg-black/45`–`/50` or `bg-slate-900/40` for text-over-image; translucent white chips (`bg-white/80`) with `backdrop-blur-sm`.
- **Gradients:** only neutral slate fades — `from-slate-50 to-white`, `from-slate-800 to-slate-900`, or inline `linear-gradient` image scrims. **No vivid multi-color gradients, ever.**

---

## 11. States

### 11.1 Loading
- Spinner: `pp-spin` (0.8s linear) on a lucide `Loader2`, sized 15–18, `text-slate-400` or accent.
- Prefer **skeletons** for content areas (slate-100 blocks, `rounded-xl`, subtle pulse) over spinners where layout is known.
- Buttons: swap label for `Loader2` spinner, keep width, disable, `bg-slate-300` when disabled.

### 11.2 Empty
- Centered, calm: a lucide glyph in a `bg-slate-100` round tile, a `text-[15px] font-bold text-slate-900` line, a `text-[12.5px] text-slate-500` subline, and (optionally) one primary action. Never a raw "no data".

### 11.3 Success / Error
- **Success:** `text-emerald`? **No** — MineEx has no emerald in chrome. Use accent/`slate-900` confirmation text + a `Check` icon; toasts say what happened ("Published", "Saved").
- **Error:** `text-rose-500` message, plain-language, states the fix. Destructive actions confirm first.
- Inline field error: `text-[12.5px] font-semibold text-rose-500` under the field.

---

## 12. Responsive behavior

- **Product app is phone-first** and runs in a phone-width column even on desktop (native iOS shell + web).
- **Portal/Admin** are **desktop-first** (gated ≥1024px in places) — wider multi-column layouts, but same tokens.
- **Conference Mode** targets **iPad landscape** at a booth — full-bleed, large type, safe-area aware.
- **Sales site** is fully responsive marketing.
- Rule: tokens are identical across breakpoints; only column count, gutter, and type step scale up. Never introduce a new palette or radius set per breakpoint.

---

## 13. Interaction patterns

- Tap feedback everywhere (`active:scale-*`).
- Bottom sheets (`pp-slide-up`) for detail/edit on mobile; centered modals (`pp-pop` + `pp-backdrop`) for focused actions.
- Horizontal chip strips scroll with hidden scrollbars (`pp-noscroll`).
- Pull-to-refresh on feeds (`PullToRefresh`).
- One primary action per screen; destructive actions are rose + confirm.
- Provenance/uncertainty: AI-extracted factual fields should carry a source and flag uncertainty rather than present invented precision (see architecture/ingestion phase).

---

## 14. Usage rules (the short list)

1. **Slate only** for neutrals. No gray/zinc/neutral.
2. **Cobalt `#2563eb`** is the one accent. Semantic hues (rose/amber/indigo/materiality) are for meaning, never decoration.
3. **White-on-white + layered slate shadow** for elevation — not a gray canvas, not harsh shadows.
4. **Heavy, tight type**; arbitrary-px scale; `tracking-tight` headings, wide-tracked uppercase labels.
5. **Round interactive, `rounded-2xl` containers, `rounded-xl` inputs.**
6. **lucide-react**, heavy stroke, 13–16px.
7. **One easing** (`cubic-bezier(0.22,1,0.36,1)`), short durations, reduced-motion safe.
8. **One primary action** per view. No nested cards, no vivid gradients, no dark mode (this sprint).
9. Register B (Conference/Sales) may switch to **Switzer/Instrument Serif** and larger scale, but keeps every foundation above.
10. The **live investor app is read-only**; build new surfaces to this doc, don't retrofit the app to it.
