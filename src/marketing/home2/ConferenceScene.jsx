// ─────────────────────────────────────────────────────────────────────────────
// ConferenceScene — the Conference walkthrough, composited onto the front-facing
// black-screen iPad. The flat iPad now runs the REAL "Northvale" folio Conference
// template and walks through its PAGES (a live presentation), mapped FLUSH onto the
// glass via a projective (homography) transform.
//
//   confIndex 0: the folio HERO page — it animates in on arrival and HOLDS here until the
//                visitor swipes again (no auto-advance).
//   confIndex 1–6: the next pages (about · glance · projects · atlas · evidence · field) —
//                the visitor swipes; the iPad advances one page per gesture; faint progress
//                dots show how many pages remain.
//
// The physical iPad geometry is LOCKED across every state; only the screen page changes.
// Left narrative is one quiet chapter label (the iPad is the focus).
// NOTE: northvale-demo renders via the DEV route /confv3demo (localhost/DEV only) — a
// production render route for this mock is still a follow-up.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MX, EASE } from "../system.jsx";
import TabletFrame from "../demo/TabletFrame.jsx";
import { ChapterRail } from "./WalkthroughNarrative.jsx";

// The supplied front-facing iPad asset and its inner-screen quadrilateral, measured from
// the asset's alpha/black region as fractions of its 1536×1024 canvas.
const IPAD_SRC = "/marketing/conference-ipad-front-v4.webp?v=2";   // camera-less iPad, transparent background
const IPAD_ASPECT = 1434 / 1097;
// The screen APERTURE the template renders into — the inner DISPLAY opening, not the whole
// dark front. Measured glass corners (black-region edges + circle-fit corner radius ≈41px on
// the 1536×1024 asset) were offset inward by a uniform physical bezel (30px asset ≈ 16px on
// screen), preserving the tablet's perspective (a slight trapezoid, wider at the bottom). The
// corner radius below is the CONCENTRIC offset of that curve (glassRadius − inset = 11px asset
// → SCREEN_RADIUS source px), so the black bezel keeps a constant optical thickness THROUGH the
// corners — nested rounded rectangles sharing one curvature family, not a pasted webpage.
// FLAT front-facing iPad: the screen is a straight rectangle (no perspective), so the quad's
// corners form a rectangle and the homography reduces to a plain affine scale — the template
// renders FLAT on the glass. Corners = the measured black-glass rectangle inset by a uniform
// ~26px bezel (≈16px on screen) on all sides.
// The front camera sits in the left bezel (lens right edge ~0.085 of the 1433×1098 asset). The
// display aperture's LEFT edge is placed to the RIGHT of it (0.100) so the ORIGINAL camera in the
// device photo stays fully visible, with a small natural bezel between it and the Conference
// content — no overlay, no reconstructed circle. Right/top/bottom edges unchanged.
// DISPLAY OPENING DERIVED FROM THE HARDWARE PIXELS (not guessed). Measured on the 1433×1098 asset:
//   black-glass straight edges  L 95  R 1338  T 39  B 865
//   glass corner radius (circle-fit, tangents L≈95 / T≈39)  Rg ≈ 44  (arc centre L+Rg, T+Rg)
//   front-camera lens centre (116, 435), lens bbox 112–120 in the LEFT rim.
// The pink/live display is the glass rounded-rect INSET by a UNIFORM bezel B on every side, with corner
// radius Rg − B → the display corner arcs are CONCENTRIC with the glass, so the black bezel keeps constant
// thickness through every corner. B = 28 is the thinnest uniform rim that still fully contains the camera
// lens (right edge 120) inside the LEFT bezel (display starts at 95+28 = 123, a ~3px gap after the lens).
// Measured on the camera-less asset (1434×1097): black-glass edges + corner radius (circle-fit ≈44).
const GLASS = { L: 87, R: 1346, T: 54, B: 849, Rg: 44, W: 1434, H: 1097 };
// ONE thin, uniform bezel on all four sides. With the camera gone there is no clearance constraint, so this
// is a clean modern-iPad rim: BEZEL 18 → display corner radius Rg − 18 = 25 (rounded, concentric with glass).
const BEZEL = 18;
const QUAD = {
  tl: [(GLASS.L + BEZEL) / GLASS.W, (GLASS.T + BEZEL) / GLASS.H],
  tr: [(GLASS.R - BEZEL) / GLASS.W, (GLASS.T + BEZEL) / GLASS.H],
  br: [(GLASS.R - BEZEL) / GLASS.W, (GLASS.B - BEZEL) / GLASS.H],
  bl: [(GLASS.L + BEZEL) / GLASS.W, (GLASS.B - BEZEL) / GLASS.H],
};
// Aperture render size AT THE OPENING'S EXACT ASPECT → template maps 1:1, no x/y stretch.
const APERTURE_W_ASSET = GLASS.R - GLASS.L - 2 * BEZEL;   // 1173
const APERTURE_H_ASSET = GLASS.B - GLASS.T - 2 * BEZEL;   // 756
const SW = 1424, SH = Math.round(SW * APERTURE_H_ASSET / APERTURE_W_ASSET);   // ≈ 918
// Aperture border-radius in SW-space so the ON-GLASS radius is exactly Rg − BEZEL (concentric with glass).
const SCREEN_RADIUS = Math.round((GLASS.Rg - BEZEL) * SW / APERTURE_W_ASSET); // ≈ 11

// DIAGNOSTIC: fill the iPad display with HOT PINK (no Conference content) to verify the physical screen
// geometry — the pink must sit exactly in the opening, concentric with the glass, camera fully in the rim.
const DEBUG_PINK = false;

// The Northvale folio presentation. confIndex 0 = the HERO page (it animates in and HOLDS
// until the next swipe); confIndex 1..6 walk these pages, one per swipe.
const FOLIO_SRC = "/confv3demo?c=northvale-demo&t=folio";

// The Conference sales story — FIVE iPad states, each driving the REAL folio to ONE real state (no
// intermediate pages, no montage). Left copy (verbatim) + the folio data-sid the iPad jumps to.
const CONF_COPY = [
  { eyebrow: "CONFERENCE MODE", h: "Radically upgrade your conference experience.", body: "Turn your company story into an interactive experience built for the booth." },
  { eyebrow: "01 / 04 · PROJECTS", h: "Give investors the big picture.", body: "Present your flagship projects, key assets and investment story in a format designed to be explored in person." },
  { eyebrow: "02 / 04 · EXPLORE", h: "Let investors explore for themselves.", body: "Bring projects, targets and locations to life through interactive maps built for deeper conversations at the booth." },
  { eyebrow: "03 / 04 · RESULTS", h: "Turn technical results into something visual.", body: "Show drill results, intercepts and supporting project data in a format investors can understand at a glance." },
  { eyebrow: "04 / 04 · CONNECT", h: "Turn every conversation into a lasting connection.", body: "Investors scan to continue exploring your company on MineEx, follow your profile and stay connected after the conference ends." },
  { eyebrow: "CONFERENCE MODE · TEMPLATES", h: "Make it unmistakably yours.", body: "Choose from a collection of premium Conference Mode templates and customize them to your brand — or work with us on a completely bespoke experience." },
];
// confIndex → folio data-sid. i=0 HERO(index) · 1 PROJECT · 2 MAP · 3 INTERCEPTS · 4 QR. (i=5 TEMPLATES is a
// thumbnail grid shown INSIDE the iPad — not a folio state.) Jumps are INSTANT, so nothing in between shows.
const SID = ["index", "projects", "atlas", "evidence", "contact"];

// State 06 — TEMPLATES: the "16 templates · Conference Mode" gallery (copied from the standalone gallery),
// shown INSIDE the iPad. 4 cards per row; each card is a real template preview (/thumbs) with a number ·
// name · NEW · OPEN label bar, over the same fictional demo companies.
// [template, name, isNew, demo-company slug]. Each preview is the REAL template rendered live for its
// fictional demo company via the app's own /confv3demo route — so every hero actually animates.
const TEMPLATE_GALLERY = [
  ["terminal2", "Terminal II", 1, "pampanegra-demo"], ["expedition", "Expedition", 1, "ptarmigan-demo"], ["keynote", "Keynote", 1, "vilcanota-demo"], ["vein", "Vein", 1, "plataalta-demo"],
  ["chronicle", "Chronicle", 0, "granitepeak-demo"], ["filament", "Filament", 0, "granitepeak-demo"], ["folio", "Folio", 0, "northvale-demo"], ["crimson", "Crimson", 0, "emberline-demo"],
  ["tableau", "Tableau", 0, "quillon-demo"], ["gyre", "Gyre", 0, "lucerna-demo"], ["beacon", "Beacon", 0, "veyra-demo"], ["lattice", "Lattice", 0, "solvik-demo"],
  ["relay", "Relay", 0, "iberis-demo"], ["spectra", "Spectra", 0, "tremayne-demo"], ["vista", "Vista", 0, "ardven-demo"], ["cirrus", "Cirrus", 0, "kestrel-demo"],
];

// ── projective transform: map a w×h rectangle onto an arbitrary quad → CSS matrix3d. ──
function adj(m) {
  return [
    m[4] * m[8] - m[5] * m[7], m[2] * m[7] - m[1] * m[8], m[1] * m[5] - m[2] * m[4],
    m[5] * m[6] - m[3] * m[8], m[0] * m[8] - m[2] * m[6], m[2] * m[3] - m[0] * m[5],
    m[3] * m[7] - m[4] * m[6], m[1] * m[6] - m[0] * m[7], m[0] * m[4] - m[1] * m[3],
  ];
}
function mm(a, b) { const c = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { let s = 0; for (let k = 0; k < 3; k++) s += a[3 * i + k] * b[3 * k + j]; c[3 * i + j] = s; } return c; }
function mv(m, v) { return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]]; }
function basis(x1, y1, x2, y2, x3, y3, x4, y4) { const m = [x1, x2, x3, y1, y2, y3, 1, 1, 1]; const v = mv(adj(m), [x4, y4, 1]); return mm(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]]); }
function quadTransform(w, h, tl, tr, br, bl) {
  const s = basis(0, 0, w, 0, w, h, 0, h);
  const d = basis(tl[0], tl[1], tr[0], tr[1], br[0], br[1], bl[0], bl[1]);
  const t = mm(d, adj(s));
  for (let i = 0; i < 9; i++) t[i] /= t[8];
  const m = [t[0], t[3], 0, t[6], t[1], t[4], 0, t[7], 0, 0, 1, 0, t[2], t[5], 0, t[8]];
  return "matrix3d(" + m.map((n) => (Math.abs(n) < 1e-6 ? 0 : n)).join(",") + ")";
}

// Premium, no-bounce page ease (iOS-like).
const EASE_PAGE = "cubic-bezier(0.33, 0, 0.12, 1)";

export default function ConferenceScene({ mobile = false, reduce = false, confIndex = 0, mount = false, active = false, deviceOnly = false }) {
  const i = Math.max(0, Math.min(CONF_COPY.length - 1, confIndex));   // 0..4

  // ── iPad content page-slide. The folio ALWAYS shows exactly one selected state; moving between two
  // states plays a single vertical slide INSIDE the aperture: the current page slides off-screen, the
  // folio is jumped DIRECTLY to the destination while hidden (navSmooth off → no intermediate travel),
  // then the destination slides into place. The physical iPad never moves. ──
  const [foSid, setFoSid] = useState("index");
  const [foSmooth, setFoSmooth] = useState(false);
  const [slideY, setSlideY] = useState("0px");
  const [slideTrans, setSlideTrans] = useState("none");
  const prevIRef = useRef(0);

  // Page change = INSTANT folio jump (navSmooth off): the destination page appears directly, with NO
  // intermediate pages travelled through and NO black gap. The synchronised left-copy motion carries the
  // sense of transition; the physical iPad never moves. (slideY is kept at 0 — no page translate.)
  useEffect(() => {
    if (!mount) return;
    prevIRef.current = i;
    setFoSmooth(false);
    setSlideTrans("none"); setSlideY("0%");
    if (i >= SID.length) return;   // TEMPLATES (i=5): keep the folio mounted underneath; the grid overlays it
    setFoSid(i === 0 ? (active ? "index" : "about") : (SID[i] || "projects"));
  }, [i, active, mount]);


  // ── Left-copy motion, synchronised with the iPad state. On each state change the current copy lifts
  // and fades (translateY ≈ −24 / opacity→0, ~200ms), then the incoming copy rises into the SAME grid
  // slot (from +26 / opacity 0 → settle, ~440ms ease-out). One gesture drives both this and the iPad. ──
  const [shownI, setShownI] = useState(i);
  const [copyAnim, setCopyAnim] = useState("in");
  useEffect(() => {
    if (shownI === i) return;
    setCopyAnim("out");
    const t = setTimeout(() => { setShownI(i); setCopyAnim("in"); }, 200);
    return () => clearTimeout(t);
  }, [i, shownI]);

  // ── State 06 gallery entrance. All 16 templates fit on the tablet at once (no scroll, no pan); when the
  // state opens they animate in — a soft staggered fade-and-rise, row by row — then hold still. Leaving the
  // state clears the flag so it replays from scratch on the next visit. ──
  const [galShow, setGalShow] = useState(false);
  useEffect(() => {
    const onGallery = i === 5 && active;
    if (!onGallery) { setGalShow(false); return; }
    const t = setTimeout(() => setGalShow(true), 90);   // let the overlay fade in first, then reveal cards
    return () => clearTimeout(t);
  }, [i, active]);

  // Staggered live-preview boot. Each card shows its pre-rendered thumb instantly; the real, animating
  // template hero then boots in over it — a few cards at a time so the browser never loads all 16
  // Conference bundles at once (which janked the swipe and left cards black). Re-arms on each entry so
  // the heroes replay their intro. Mounting begins as the state is approached (QR onward).
  const galleryNear = mount && i >= 4 && !deviceOnly;   // deviceOnly reuse (ecosystem finale) never shows the 16-up gallery
  const [liveN, setLiveN] = useState(0);
  useEffect(() => {
    if (!galleryNear) { setLiveN(0); return; }
    let n = 0; setLiveN(0);
    const id = setInterval(() => { n += 2; setLiveN(n); if (n >= TEMPLATE_GALLERY.length) clearInterval(id); }, 240);
    return () => clearInterval(id);
  }, [galleryNear]);

  // ── Measure the rendered iPad box so the homography maps to on-screen pixels. ──
  const boxRef = useRef(null);
  const [boxW, setBoxW] = useState(0);
  useLayoutEffect(() => {
    const el = boxRef.current; if (!el) return;
    const measure = () => setBoxW(el.clientWidth || 0);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const Hd = boxW / IPAD_ASPECT;
  const screenTransform = useMemo(() => {
    if (!boxW) return "scale(0)";
    const p = (f) => [f[0] * boxW, f[1] * Hd];
    return quadTransform(SW, SH, p(QUAD.tl), p(QUAD.tr), p(QUAD.br), p(QUAD.bl));
  }, [boxW, Hd]);

  // ── Hero wordmark fit (THIS marketing instance only — template file untouched). The folio's
  // "Northvale" wordmark bleeds to ~94% of the folio width by design; inside the iPad's safe
  // content area that clips the final "e", so we nudge JUST the hero wordmark in a touch. Scoped
  // to the index page's wordmark, injected into the same-origin folio; a light interval lands it
  // however slowly the folio cold-loads (and re-lands if it reloads). ──
  useEffect(() => {
    if (!mount) return;
    const box = boxRef.current;
    const id = setInterval(() => {
      const ifr = box && box.querySelector("iframe");
      const doc = ifr && ifr.contentDocument;
      const head = doc && (doc.head || doc.documentElement);
      const ready = doc && doc.querySelector('.fo-state[data-sid="index"] .fo-giant');
      if (!head || !ready || doc.getElementById("mx-hero-fit")) return;
      // Fit the giant wordmark into the display (no transform). The wordmark's own `overflow:hidden`
      // (used for the letter-rise reveal) combined with its NEGATIVE letter-spacing pulls the box's right
      // edge inside the final glyph's ink, clipping the last "e". padding-right adds that ink back inside the
      // clip box → the complete "e" renders with breathing room after it. (Marketing instance only.)
      const fs = parseFloat(getComputedStyle(ready).fontSize) || 0;
      if (!fs) return; // wait until the folio has laid out at its real size
      const st = doc.createElement("style");
      st.id = "mx-hero-fit";
      st.textContent = `.fo-state[data-sid="index"] .fo-giant{font-size:${Math.round(fs * 0.68)}px !important;transform:none !important;padding-right:0.16em !important;}`;
      head.appendChild(st);
    }, 400);
    return () => clearInterval(id);
  }, [mount]);

  // ── Narrative — the sales-story copy for the current state, animated in/out with the iPad. ──
  const c = CONF_COPY[shownI] || CONF_COPY[0];
  const narrative = (
    // Rail + copy — the SAME side rail the App chapter uses (WalkthroughNarrative's
    // ChapterRail), replacing the horizontal dot row this chapter used to carry, so both
    // chapters show progress the same way.
    <div style={{ display: "flex", gap: "clamp(20px, 2vw, 34px)", alignItems: "stretch", minWidth: 0 }}>
      {!mobile && <ChapterRail total={CONF_COPY.length} active={shownI} />}
      <div style={{ minWidth: 0 }}>
      <style>{"@keyframes mxConfCopyIn{from{opacity:0;transform:translateY(26px)}to{opacity:1;transform:translateY(0)}}"}</style>
      <div key={shownI} style={copyAnim === "out"
        ? { opacity: 0, transform: "translateY(-24px)", transition: `opacity 200ms ${EASE}, transform 200ms ${EASE}` }
        : { animation: `mxConfCopyIn 440ms ${EASE} both` }}>
        <p className="mx-label" style={{ color: MX.emText, letterSpacing: "0.22em", margin: 0 }}>{c.eyebrow}</p>
        <h2 className="mx-h2" style={{ marginTop: 18, maxWidth: "15ch", color: MX.text }}>{c.h}</h2>
        <p style={{ marginTop: 18, maxWidth: "34ch", color: MX.emText, fontSize: "clamp(15px, 1.1vw, 18px)", lineHeight: 1.5 }}>{c.body}</p>
      </div>
      </div>
    </div>
  );

  // ── The physical device + composited folio screen (geometry locked; only the page changes). ──
  const device = (
    <div ref={boxRef} className="mx-cdev" style={{ position: "relative", width: mobile ? "94%" : "100%", aspectRatio: `${GLASS.W} / ${GLASS.H}`, margin: mobile ? "0 auto" : 0 }}>
      {/* Reflected-light glow behind the base — a soft blue bloom under the LEFT of the stand and a lime
          bloom under the RIGHT, aligned with the colours already reflecting off the aluminium stand, so the
          gradient reads as the light source the stand is picking up. Behind the device (shows in the margins
          around the base), blurred and subtle. */}
      <div aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: "-3%", height: "40%", zIndex: 0, pointerEvents: "none",
        background: "radial-gradient(38% 78% at 33% 74%, rgba(37,99,235,0.55), rgba(37,99,235,0) 72%), radial-gradient(40% 82% at 70% 76%, rgba(198,240,74,0.52), rgba(198,240,74,0) 72%)",
        filter: "blur(34px)" }} />
      {/* Opaque screen backing — fills the glass rectangle BEHIND the (transparent-screened) iPad asset so the
          display can never show the page through it as a pale ring at the aperture edge. Sits under the asset;
          only the asset's transparent screen area reveals it, and the bezel covers any overhang. */}
      <div aria-hidden style={{ position: "absolute",
        left: `${(GLASS.L / GLASS.W) * 100}%`, top: `${(GLASS.T / GLASS.H) * 100}%`,
        width: `${((GLASS.R - GLASS.L) / GLASS.W) * 100}%`, height: `${((GLASS.B - GLASS.T) / GLASS.H) * 100}%`,
        background: "#07090c",
        // The glass corner is a CIRCULAR 44px (GLASS.Rg) arc. A single percentage resolves
        // against width for the horizontal radius and height for the vertical one, so "2.7%"
        // produced a 34 x 21.5 ELLIPSE — far squarer than the glass. Its corners therefore
        // escaped past the aluminium into the asset's transparent surround and read as black
        // triangles on the light background. The two-axis form restores a true circle.
        borderRadius: `${(GLASS.Rg / (GLASS.R - GLASS.L)) * 100}% / ${(GLASS.Rg / (GLASS.B - GLASS.T)) * 100}%`,
        zIndex: 0, pointerEvents: "none" }} />
      <img src={IPAD_SRC} alt="MineEx Conference Mode on an iPad at a conference booth" draggable={false}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none", zIndex: 1 }} />
      {/* No camera overlay — this asset has no front camera. */}
      <div style={{ position: "absolute", top: 0, left: 0, width: SW, height: SH, zIndex: 2, transformOrigin: "0 0", transform: screenTransform,
        overflow: "hidden", borderRadius: SCREEN_RADIUS, background: "#000", backfaceVisibility: "hidden" }}>
        {/* PAGE-SLIDE wrapper — vertical translate INSIDE the aperture (clipped) for the iOS-style page
            transition. The instant folio jump happens while this is off-screen, so no intermediate state
            is ever visible. */}
        <div style={{ position: "absolute", inset: 0, transform: `translateY(${slideY})`, transition: slideTrans, willChange: "transform" }}>
          {/* OVERSCAN: the folio plane overfills the aperture ~1% so subpixel rounding never shows a seam. */}
          <div style={{ position: "absolute", inset: 0, transform: "scale(1.012)", transformOrigin: "50% 50%" }}>
            {DEBUG_PINK ? (
              <div style={{ position: "absolute", inset: 0, background: "#ff1493" }} />
            ) : mount ? (
              <TabletFrame bare src={FOLIO_SRC} interactive={false} renderW={SW} renderH={SH} navSid={foSid} navSmooth={foSmooth} title="MineEx Conference Mode — Northvale" />
            ) : (
              <div style={{ position: "absolute", inset: 0, background: "radial-gradient(130% 130% at 50% 42%, #0c1016 0%, #05070b 72%)" }} />
            )}
          </div>
        </div>
        {/* STATE 06 — TEMPLATES: the "16 templates · Conference Mode" gallery, shown INSIDE the iPad. Dark
            ground, eyebrow + headline + demo-company intro, then a 4-up grid of every template as a real
            preview (/thumbs — the same renders, 16 live iframes would be far too heavy) with a number · name ·
            NEW · OPEN label bar. Overlays the folio (which stays mounted underneath). */}
        {!DEBUG_PINK && (
          <div style={{ position: "absolute", inset: 0, zIndex: 5, background: "#07090c", color: "#f2f0ea",
            opacity: i === 5 ? 1 : 0, pointerEvents: i === 5 ? "auto" : "none", transition: `opacity 320ms ${EASE}`,
            padding: "30px 30px 28px", display: "flex", flexDirection: "column",
            fontFamily: "'Inter', system-ui, sans-serif" }}>
            <div style={{ flex: "0 0 auto", margin: "0 0 16px", fontSize: 13, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "#8a929c",
              opacity: galShow ? 1 : 0, transform: galShow ? "none" : "translateY(8px)",
              transition: galShow ? `opacity 440ms ${EASE_PAGE}, transform 440ms ${EASE_PAGE}` : "none" }}>
              16 Templates <span style={{ color: "#5b636e" }}>· Conference Mode</span>
            </div>
            {/* All 16 at once — no scroll, no pan. Each card is the REAL template rendered LIVE for its demo
                company (its hero animates), framed to the hero band, with a number · name · NEW · OPEN bar
                below — the standalone gallery, on the tablet. Cards fade-and-rise in, row-staggered. */}
            <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gridTemplateRows: "repeat(4, 1fr)", gap: 12 }}>
              {TEMPLATE_GALLERY.map(([k, name, isNew, slug], idx) => {
                const delay = 110 + Math.floor(idx / 4) * 85 + (idx % 4) * 32;   // by row, gently offset across the row
                return (
                  <div key={k} style={{ minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)", background: "#0b0e13",
                    opacity: galShow ? 1 : 0, transform: galShow ? "none" : "translateY(18px) scale(0.985)",
                    transition: galShow ? `opacity 520ms ${EASE_PAGE} ${delay}ms, transform 560ms ${EASE_PAGE} ${delay}ms` : "none", willChange: "opacity, transform" }}>
                    {/* Preview: the pre-rendered thumb is the instant, never-black base; the live animating hero
                        boots in over it (staggered) with a transparent screen so nothing flashes. Fills the cell
                        (rows are equal) and crops to the hero band — no squish, and nothing overflows the screen. */}
                    <div style={{ position: "relative", flex: 1, minHeight: 0, overflow: "hidden",
                      backgroundColor: "#05070b",
                      // The thumb is a CSS background, so it is fetched the moment this node exists —
                      // and on the home deck every scene exists from the start. That pulled ~4MB of
                      // gallery imagery before the page had drawn its own phone. It now waits for the
                      // same proximity flag the live tiles use.
                      backgroundImage: galleryNear ? `url(/thumbs/${k}.jpg)` : "none",
                      backgroundSize: "cover", backgroundPosition: "top center" }}>
                      {galleryNear && idx < liveN && (
                        <div style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
                          <TabletFrame bare src={`/confv3demo?c=${slug}&t=${k}&bar=0`} interactive={false} showBootCover={false} screenBg="transparent" renderW={1194} renderH={834} title={`${name} — ${slug}`} />
                        </div>
                      )}
                    </div>
                    <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 8, padding: "8px 11px", background: "#0b0e13", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{String(idx + 1).padStart(2, "0")}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.01em", color: "#f2f0ea", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
                      {isNew ? <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", color: "#d3e04f", border: "1px solid rgba(211,224,79,0.5)", borderRadius: 4, padding: "2px 5px", lineHeight: 1 }}>NEW</span> : null}
                      <span style={{ marginLeft: "auto", fontSize: 11, color: "rgba(255,255,255,0.45)", letterSpacing: "0.08em", fontWeight: 600 }}>OPEN ↗</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {!DEBUG_PINK && <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 6, pointerEvents: "none", background: "linear-gradient(118deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 30%)" }} />}
      </div>
    </div>
  );

  // Ecosystem-finale reuse: render ONLY the approved iPad device (no narrative, no gestures), so the
  // finale chapter can compose the exact same physical iPad. Normal output is unchanged (default false).
  if (deviceOnly) {
    return <div className="mx-conf" style={{ position: "relative", width: "100%", pointerEvents: "none" }}>{device}</div>;
  }

  if (mobile) {
    return (
      <div className="mx-conf" style={{ position: "relative", height: "100%", width: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, padding: "84px 22px 24px" }}>
        {narrative}
        {device}
      </div>
    );
  }
  return (
    <div className="mx-conf" style={{ position: "relative", height: "100%", width: "100%" }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, max-content) clamp(620px, 56vw, 864px)", justifyContent: "center", alignItems: "center", height: "100%",
        maxWidth: 1500, margin: "0 auto", padding: "0 clamp(28px, 5vw, 72px)", gap: "clamp(48px, 4vw, 76px)" }}>
        {narrative}
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>{device}</div>
      </div>
    </div>
  );
}
