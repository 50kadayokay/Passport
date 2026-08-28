# MineEx marketing site

The public sales site, served at **`/site`**. Fully isolated from the application:
nothing in `src/marketing/` is imported by the app, and the app is not imported
here — the single exception is `src/lib/supabase.js`, used to file demo requests
into the existing `demo_bookings` table.

`src/main.jsx` lazy-loads it, so none of it ships in the app bundle
(`MarketingSite` is its own ~28 KB gzipped chunk). The previous marketing pages
are untouched and still reachable at **`/site/legacy`**.

## Palette

Graphite and white: ink `#0a0c0f`, white, `#f5f6f7` / `#eaecef` greys, no brand
colour on the page itself. The **only** colour on the site comes from the product
screens inside the device frames, which keep the app's emerald — so the product
supplies the accent and the page stays out of its way. The `ui/` files therefore
define their own `EM` constants and do not read the site palette.

## Brand

The public name is **MineEx** everywhere on this surface. The internal codename
does not appear in any user-facing string — verified against the built chunk.

## Layout

```
data.js                real content: the published Kingsmen profile, real press
                       releases, real directory listings, real project photography
system.jsx             design tokens, type ramp, motion, scroll engine, device frames
ui/AppUI.jsx           presentation build of the investor app screens
ui/DeskUI.jsx          presentation build of the company dashboard + analytics
ui/BoothUI.jsx         presentation build of Conference Mode
sections/Opening.jsx   1 hero · 2 the problem · 3 your company on MineEx
sections/Discovery.jsx 4 get discovered · 5 the follow · 6 keep investors informed
sections/Content.jsx   7 press releases · 8 media
sections/Company.jsx   9 dashboard · 10 analytics
sections/Conference.jsx 11 Conference Mode · 12 booth → audience
sections/Close.jsx     13 the journey · 14 how companies use MineEx · 15 the close
MarketingSite.jsx      shell: nav, section order, footer, page metadata
```

## Why the app UI is rebuilt rather than imported

`src/aiBrief/PassportProto.jsx` is a ~16 MB module (base64 media inline) that
builds into an ~11 MB chunk, and its data lives in module-level singletons that
`applyPP()` mutates — so one page cannot show two different screens from it. The
components in `ui/` reproduce the shipped screens' layout, spacing, type,
iconography and accent at a fraction of the weight, and are driven by props so
scroll can move them. The type ramp and motion language are inherited from the
product's own Conference Mode system (`src/aiBrief/conferenceUI.jsx`).

## The scroll system

`useTrack(ref)` returns 0→1 progress as a tall `.mx-track` passes the viewport;
`.mx-stage` inside it is `position: sticky`. `ramp`/`win`/`step`/`mix` turn that
number into the scene. `Reveal` handles ordinary in-view entrances.

It is built to stay at frame rate on a laptop, and the rules matter — breaking one
will make the page stutter again:

- **One** scroll listener for the whole page (a shared rAF-coalesced ticker) and
  **one** IntersectionObserver for all reveals — never one per section.
- A track that is off-screen does no work and sets no state, so only the one or
  two scenes actually visible can cause a render. Progress is quantised too.
- Every screen in `ui/` is `React.memo`'d. Callers must keep props stable
  (`useCallback` / `useMemo`) or the memo silently stops working.
- Scroll-driven motion is `transform` and `opacity` only. No animated `left`/`top`
  (relayout), no animated `filter` (re-filters a whole layer), no `backdrop-filter`
  on the fixed header. Scaled subtrees carry `will-change: transform`.
- `.mx-track` uses `content-visibility: auto` so off-screen scenes are not laid out
  or painted.
- Images are served from `public/marketing/` at the two sizes actually painted
  (`-sm` ≈ 380 px for thumbnails, base ≈ 800 px for cards). The originals in the
  media bucket are 975–1500 px and ~3.5 MB in total.

Under `prefers-reduced-motion` every track collapses to its content height, each
scene renders a chosen resting frame (`useTrack(ref, { reduceValue })`), and the
two sequenced sections list all their beats instead of showing one.

## Reviewing one section

Localhost only:

```
/site?mxonly=<section>&mxp=<0..1>
```

`mxonly` renders that section alone; `mxp` pins every scroll track to that
progress, so a scroll-driven scene can be inspected at any point without holding
a scroll position. Sections: `hero`, `problem`, `profile`, `discovered`,
`follow`, `informed`, `releases`, `media`, `dashboard`, `analytics`,
`conference`, `booth`, `journey`, `offerings`, `cta`. Inert in production.

## Accuracy

No invented investors, customers, testimonials, engagement metrics, partnerships
or prices. Company content comes from published MineEx profiles. The dashboard
and analytics screens carry demonstration figures and say so, and the analytics
section repeats the product's own position: engagement reporting starts once a
profile is published, and only real activity is counted.
