// ─────────────────────────────────────────────────────────────────────────────
// InvestorPage — the "Investor" nav destination (/investor).
//
// A cinematic, guided demonstration of the investor experience, art-directed per
// chapter so each one is composed around the interaction it shows:
//
//   DISCOVER  reading & scrolling   — copy left, phone right
//   EXPLORE   filtering             — copy left with a live filter/result readout, phone right
//   RESEARCH  depth                 — the phone takes the stage (centre, larger)
//   FOLLOW    the resolution        — phone left, a calm closing statement right
//
// Consistent throughout: Switzer/Instrument-Serif type, the near-white atmosphere,
// the ONE photoreal titanium phone (same hardware & proportions). The phone is a
// single persistent layer that glides to each chapter's position (it stays put while
// a chapter's beats play) and its REAL screen is scripted per beat via __appDemoGo.
//
// Navigation is the SAME paged-wheel controller the sales page uses (AppSection), with
// its constants imported rather than copied, so the motion and speed are identical:
// one deliberate gesture = one beat, animated over SHEET_MS with EASE_SHEET. Native CSS
// scroll-snap is kept for touch and reduced-motion, where the browser should own it.
//
// Because the controller calls preventDefault, it also carries AppSection's two
// iframe defences — blur any iframe that takes focus, and route the phone iframe's own
// wheel events back here — without which the first gesture after the phone mounts is
// swallowed ("move the mouse before it lets me swipe again").
//
// AppSection (the approved sales page) is untouched.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useRef, useState } from "react";
import { COUNTS } from "../demo/investorFixture.js";
import { EASE, MarketingStyles, useReduce, useViewport } from "../system.jsx";
import { SHEET_MS, EASE_SHEET, WHEEL_TRIGGER, NEW_GESTURE_GAP, FIRM_DELTA, FRESH_FLICK } from "./motion.js";
import Nav from "./Nav.jsx";
import InvestorShellPhone from "../demo/InvestorShellPhone.jsx";
import PushPreview, { PR_INVESTOR } from "./PushPreview.jsx";
import { STAGE } from "./WalkthroughNarrative.jsx";

import Footer from "./Footer.jsx";
const BG = "#fbfcfe";
const NAVY = "#0a1b2e";
const SLATE = "#565f6e";
const COBALT = "#2563EB";
const MUTE = "#9aa1ad";
const HAIR = "rgba(10,27,46,0.10)";
const GRAIN = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E\")";


// ── THE COMPOSITION (one, for every state) ─────────────────────────────────────
// The sales page's stage metrics, with ONE deliberate difference: its first column is
// `max-content`, which would widen for the intro's larger headline and therefore MOVE
// the device between states. The device must never move, so the narrative column is a
// fixed width and every headline wraps inside it. The device slot is the sales page's
// 320px, so the phone sits at the same scale and position in all 19 states.
const NAV_H = 64;
// The device is now the sales page's full size (557×929). At the old insets it filled the
// stage edge to edge with nothing to breathe into, so the insets are trimmed to give it a
// margin top and bottom. Copy still clears the nav comfortably.
const SAFE_TOP = NAV_H + 14;     // 78
const SAFE_BOTTOM = 16;
// Responsive to the VIEWPORT but fixed for any given viewport, so the device slot holds
// the same position in all 19 states while still fitting narrower desktops (a fixed 560px
// column overflows at 1024).
const NARR_W = "clamp(360px, 40vw, 560px)";
// This page needs MORE separation than the sales page's stage: its device is drawn at the
// sales size (557 wide) but overflows a 320px column by ~118px on each side, so the sales
// page's 120px gap left only ~46px of air between the headline and the phone. A wider
// container and a larger gap put ~115px between them without moving the device column.
const stageGrid = {
  display: "grid",
  gridTemplateColumns: `${NARR_W} 320px`,
  justifyContent: "center",
  alignItems: "center",
  height: "100%",
  maxWidth: 1280,
  margin: "0 auto",
  padding: "0 clamp(24px, 4vw, 64px)",
  gap: "clamp(110px, 12vw, 190px)",
};

// Guided beats (states 1…17). State 0 = intro, state 18 = close. `k` is the phone
// directive handed to window.__appDemoGo; `ch` (0-3) groups beats into the four chapters.
const STATES = [
  { ch: 0, k: "today:lead",        n: "01", label: "Discover", head: "Junior mining news is scattered. This isn\u2019t.", body: "Coverage of this sector lives across newswires, exchange filings and company websites. MineEx pulls it into one feed, ranked around the companies you follow." },
  { ch: 0, k: "today:scroll",      n: "01", label: "Discover", head: "Built for how investors actually read.", body: "Editorial coverage, press releases, company updates and company media sit side by side, newest first \u2014 so one scroll tells you what moved." },
  { ch: 0, k: "story",             n: "01", label: "Discover", head: "Headlines rarely explain themselves.", body: "Every story opens with a plain-language MineEx summary: what was announced, why it matters, and the numbers worth remembering." },
  { ch: 0, k: "story:scroll",      n: "01", label: "Discover", head: "Always one tap from the source.", body: "The summary orients you in seconds. The original release or article is right there when a number needs checking." },
  { ch: 1, k: "explore",           n: "02", label: "Explore",  head: "A directory built for discovery.", body: "Search by company, ticker or commodity \u2014 or browse by what a company actually is, instead of reading down an exchange listing page." },
  { ch: 1, k: "explore:commodity", n: "02", label: "Explore",  head: "Start from your thesis, not a ticker.", body: "Pick a commodity and the directory narrows in real time to the companies working in it." },
  { ch: 1, k: "explore:location",  n: "02", label: "Explore",  head: "Jurisdiction is half the investment case.", body: "Add a country or region and the list narrows again. Commodity, geography and stage combine into a shortlist you can actually read." },
  { ch: 1, k: "explore:results",   n: "02", label: "Explore",  head: "A thesis to a shortlist in seconds.", body: "What used to mean a dozen browser tabs is now a few taps. Open any result and go straight into the company\u2019s full story." },
  { ch: 2, k: "company:overview",  n: "03", label: "Research", head: "One profile instead of twelve tabs.", body: "Tickers, commodity, jurisdiction and stage up front, with what the company is working on right now \u2014 the orientation a corporate website rarely gives you." },
  { ch: 2, k: "company:brief",     n: "03", label: "Research", head: "The investment case in plain language.", body: "The AI Brief explains what the company does, how it intends to create value, and what to watch next \u2014 written for an investor, not a geologist." },
  { ch: 2, k: "company:projects",  n: "03", label: "Research", head: "Project detail you can read.", body: "Geology, drill results and imagery in a consistent structure, so comparing two companies doesn\u2019t mean decoding two different PDFs." },
  { ch: 2, k: "company:timeline",  n: "03", label: "Research", head: "See whether the story is progressing.", body: "Milestones and results in order \u2014 the clearest signal of whether a company is executing or standing still." },
  { ch: 2, k: "company:capital",   n: "03", label: "Research", head: "Dilution is the risk nobody shows you.", body: "Shares outstanding, options, warrants and funding position in one view, so you know what you would actually be buying." },
  { ch: 2, k: "company:team",      n: "03", label: "Research", head: "In exploration, management is the bet.", body: "Who is running the company and what they have built before \u2014 the record behind the plan." },
  { ch: 3, k: "company:follow",    n: "04", label: "Follow",   head: "Follow the names you\u2019re working on.", body: "Following a company tunes your feed to it. Sign in and your list travels with you across devices." },
  { ch: 3, k: "following",         n: "04", label: "Follow",   head: "Your own coverage list.", body: "Following, favourites and a watchlist keep the names you\u2019re tracking a tap away, instead of in a spreadsheet." },
  { ch: 3, k: "today:updates",     n: "04", label: "Follow",   head: "The next release comes to you.", body: "When a company you follow publishes, it moves to the top of your feed \u2014 so you stay current without checking a dozen websites." },
];
// "Their next release finds you." — state 17, the beat that puts a followed company's new
// release in the feed. The notification belongs with it, not a frame earlier or later.
const PUSH_BEAT = STATES.length;        // 17
const N = STATES.length + 2;            // 19: intro · 17 beats · close
const prod = (i) => STATES[Math.max(0, Math.min(STATES.length - 1, i - 1))];
// State 0 is the intro, and it shows the feed at the TOP — its strongest composition, lead
// story and all. Beat 1 then scrolls, beat 2 scrolls further: the first gesture starts a
// natural downward read rather than repeating the screen already on display. (An earlier
// version parked the intro part-scrolled to manufacture motion; that weakened the hero for
// no reason beyond having something to animate.)
const phoneKeyFor = (i) => (i <= 0 ? "today" : prod(i).k);
const chapterOf = (i) => (i >= 1 && i <= STATES.length ? STATES[i - 1].ch : -1);
const CHAP_KEYS = ["discover", "explore", "research", "follow"];

// Supporting figures shown beside the phone. ALL of these are real values from the
// canonical Kingsmen profile (src/marketing/demo/kingsmenPortalProfile.js — the static,
// marketing-owned compile, so they can't drift); nothing here is invented. They exist to
// give each beat its own weight, not to fill space.
const KX = {
  tickers: "TSXV: KNG · OTCQB: KNGRF · FSE: TUY",
  identity: "Silver & Gold · Chihuahua, Mexico · Explorer",
  thesis: ["Fully funded through 2026", "26-hole Phase 1 campaign underway"],
  projects: "Las Coloradas · Almoloya",
  intercept: "LC-25-010 · 13.35 m @ 138 g/t AgEq",
  releases: "53 releases since 2023",
  nextCatalyst: "Next: Phase 1 Assays · Expected H2 2026",
  capital: "C$4.2M cash · $0 debt · 34,523,086 shares",
  funded: "Fully Funded Through 2026",
  team: "7 directors & officers",
  ceo: "Scott Emerson · President & CEO",
  // the real section headings of a MineEx story summary
  summarySections: ["MineEx summary", "What does this mean", "Context"],
  sources: "Trade press · newswires · regulatory filings · company releases & media",
};


/* ── paged wheel controller — the sales page's motion, applied to this page ────────
 * AppSection animates a fixed stage by transform; this page is a real scrolling track,
 * so the same gesture model drives window.scrollTo instead. Identical thresholds,
 * identical duration, identical curve — hence identical feel. The easing is evaluated
 * in JS because a scroll position cannot be handed to a CSS transition.
 */
function cubicBezier(x1, y1, x2, y2) {
  const A = (a, b) => 1 - 3 * b + 3 * a, B = (a, b) => 3 * b - 6 * a, C = (a) => 3 * a;
  const calc = (t, a, b) => ((A(a, b) * t + B(a, b)) * t + C(a)) * t;
  const slope = (t, a, b) => 3 * A(a, b) * t * t + 2 * B(a, b) * t + C(a);
  return (x) => {
    let t = x;
    for (let i = 0; i < 6; i++) { const d = slope(t, x1, x2); if (!d) break; t -= (calc(t, x1, x2) - x) / d; }
    return calc(t, y1, y2);
  };
}
// The JS twin of EASE_SHEET = cubic-bezier(0.32, 0.72, 0, 1).
const EASE_SHEET_FN = cubicBezier(0.32, 0.72, 0, 1);

function usePagedWheel(sectionRef, n, enabled) {
  useEffect(() => {
    if (!enabled) return undefined;
    // MarketingSite sets html{scroll-behavior:smooth} site-wide (as an INLINE style) so
    // anchor jumps glide. That re-animates every window.scrollTo this controller makes,
    // stretching a 720ms move to ~1.2s and replacing EASE_SHEET with the browser's own
    // curve. `.inv-paged` carries !important so it beats that inline value; removed on
    // unmount, so the rest of the site keeps its smooth anchors.
    const de = document.documentElement;
    de.classList.add("inv-paged");

    let accum = 0, dir0 = 0, last = 0, used = false, peak = 0, lastMag = 0;
    let locked = false, clearT = null, raf = 0, animIdx = null;
    const unlock = () => { locked = false; };
    const lock = (ms) => { locked = true; if (clearT) clearTimeout(clearT); clearT = setTimeout(unlock, ms); };

    const cellH = () => {
      const c = document.querySelector(".inv-cell");
      const h = c ? c.getBoundingClientRect().height : 0;
      return h || window.innerHeight || 1;
    };
    const baseTop = () => {
      const el = sectionRef.current;
      return el ? window.scrollY + el.getBoundingClientRect().top : 0;
    };
    const indexNow = () => Math.round((window.scrollY - baseTop()) / cellH());

    const animateTo = (to) => {
      if (raf) cancelAnimationFrame(raf);
      const from = window.scrollY, delta = to - from, t0 = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - t0) / SHEET_MS);
        window.scrollTo(0, from + delta * EASE_SHEET_FN(p));
        if (p < 1) raf = requestAnimationFrame(step); else { raf = 0; animIdx = null; }
      };
      raf = requestAnimationFrame(step);
    };

    const advance = (d) => {
      const cur = animIdx == null ? indexNow() : animIdx;
      const target = Math.max(0, Math.min(n - 1, cur + d));
      if (target === cur) return;
      animIdx = target;
      animateTo(baseTop() + target * cellH());
      lock(SHEET_MS);
    };

    // Gesture model copied verbatim from AppSection so the trigger point feels the same.
    const onWheel = (e) => {
      const now = performance.now(), gap = now - last, mag = Math.abs(e.deltaY);
      const reversed = dir0 !== 0 && Math.sign(e.deltaY) === -dir0 && mag >= FIRM_DELTA;
      const freshFlick = used && !locked && mag >= FRESH_FLICK && mag > lastMag * 2;
      if (gap > NEW_GESTURE_GAP || reversed || freshFlick) { accum = 0; dir0 = Math.sign(e.deltaY); used = false; peak = 0; }
      last = now; lastMag = mag; peak = Math.max(peak, mag);
      e.preventDefault();
      if (locked || used) return;
      if (Math.sign(e.deltaY) !== dir0) { accum = 0; dir0 = Math.sign(e.deltaY); }
      accum += e.deltaY;
      if (Math.abs(accum) < WHEEL_TRIGGER || peak < FIRM_DELTA) return;
      used = true; accum = 0;
      advance(e.deltaY > 0 ? 1 : -1);
    };
    window.addEventListener("wheel", onWheel, { passive: false, capture: true });

    // An iframe that holds focus swallows the first two-finger scroll on macOS.
    const onFocusIn = (e) => {
      const t = e.target;
      if (t && t.tagName === "IFRAME") { try { t.blur(); } catch (_) {} try { window.focus(); } catch (_) {} }
    };
    window.addEventListener("focusin", onFocusIn);

    // Route the phone iframe's own wheel back to this controller, now and on every reload
    // (a boot swaps contentWindow and drops the listener).
    const wired = new WeakSet();
    const wire = (f) => {
      try { f.setAttribute("tabindex", "-1"); } catch (_) {}
      const attach = () => { try { const cw = f.contentWindow; if (cw) cw.addEventListener("wheel", onWheel, { passive: false, capture: true }); } catch (_) {} };
      attach();
      if (!wired.has(f)) { wired.add(f); try { f.addEventListener("load", attach); } catch (_) {} }
    };
    const attachFrames = () => { document.querySelectorAll(".mx-invstage iframe").forEach(wire); };
    attachFrames();
    let mo = null, moScheduled = false;
    try {
      const stage = sectionRef.current || document.body;
      mo = new MutationObserver(() => { if (!moScheduled) { moScheduled = true; requestAnimationFrame(() => { moScheduled = false; attachFrames(); }); } });
      mo.observe(stage, { childList: true, subtree: true });
    } catch (_) {}
    const frameScan = setInterval(attachFrames, 500);

    return () => {
      window.removeEventListener("wheel", onWheel, { capture: true });
      window.removeEventListener("focusin", onFocusIn);
      if (mo) mo.disconnect();
      clearInterval(frameScan);
      document.querySelectorAll(".mx-invstage iframe").forEach((f) => { try { const cw = f.contentWindow; if (cw) cw.removeEventListener("wheel", onWheel, { capture: true }); } catch (_) {} });
      if (clearT) clearTimeout(clearT);
      if (raf) cancelAnimationFrame(raf);
      de.classList.remove("inv-paged");
    };
  }, [sectionRef, n, enabled]);
}

/* ── native-scroll index: one index per snapped viewport, no preventDefault ──────── */
function useScrollIndex(ref, n) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    let raf = 0;
    const calc = () => {
      raf = 0;
      const el = ref.current; if (!el) return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight || 1;
      const span = r.height - vh;
      const p = span <= 0 ? 0 : Math.min(1, Math.max(0, -r.top / span));
      const i = Math.round(p * (n - 1));
      setIdx((prev) => (prev === i ? prev : i));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(calc); };
    calc();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [ref, n]);
  return idx;
}

/* ── copy cross-fade: out → prep → in, keyed on the active beat (matches sales page) ── */
function useCopyPhase(idx, reduce) {
  const [shown, setShown] = useState(idx);
  const [phase, setPhase] = useState("in");
  useEffect(() => {
    if (reduce) { setShown(idx); setPhase("in"); return undefined; }
    if (shown === idx) return undefined;
    setPhase("out");
    const t = setTimeout(() => { setShown(idx); setPhase("prep"); }, 140);
    return () => clearTimeout(t);
  }, [idx, shown, reduce]);
  useEffect(() => { if (phase !== "prep") return undefined; const t = setTimeout(() => setPhase("in"), 24); return () => clearTimeout(t); }, [phase]);
  return { shown, phase };
}
const copyStyleFor = (phase, reduce) => {
  if (reduce) return { opacity: 1, transform: "none" };
  if (phase === "out") return { opacity: 0, transform: "translateY(-10px)", transition: `opacity 140ms ${EASE}, transform 140ms ${EASE}` };
  if (phase === "prep") return { opacity: 0, transform: "translateY(12px)", transition: "none" };
  return { opacity: 1, transform: "translateY(0)", transition: `opacity 300ms ${EASE}, transform 340ms ${EASE}` };
};

// Number that eases to its target (for the live filter result count).
function useTween(target, ms = 560) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = from.current, t0 = performance.now(); let raf;
    const tick = (now) => { const p = Math.min(1, (now - t0) / ms); const e = 1 - Math.pow(1 - p, 3); setV(Math.round(start + (target - start) * e)); if (p < 1) raf = requestAnimationFrame(tick); else from.current = target; };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

/* ── small pieces ────────────────────────────────────────────────────────────── */

// The ONE supporting-information treatment: a hairline, then type. Used to give each
// beat its own weight without adding cards, pills or floating UI.
function Support({ children, compact }) {
  return (
    <div style={{ marginTop: compact ? 14 : 28, paddingTop: compact ? 12 : 20, borderTop: `1px solid ${HAIR}`, maxWidth: "38ch" }}>
      {children}
    </div>
  );
}
// A quiet dot-separated fact line.
function Facts({ children, strong, compact }) {
  return <p style={{ margin: 0, fontSize: compact ? 12.5 : 14, fontWeight: strong ? 700 : 500, color: strong ? NAVY : SLATE, letterSpacing: "-0.005em", lineHeight: 1.5 }}>{children}</p>;
}
// A large tabular figure with its caption — the Explore result count.
function Figure({ value, caption, compact }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
      <span style={{ fontSize: compact ? 30 : 48, fontWeight: 700, letterSpacing: "-0.04em", color: NAVY, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: compact ? 13 : 15, fontWeight: 600, color: SLATE }}>{caption}</span>
    </div>
  );
}
function Eyebrow({ n, label }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
      <span style={{ fontSize: 14, fontWeight: 800, color: COBALT, fontVariantNumeric: "tabular-nums" }}>{n}</span>
      <span className="mx-label" style={{ color: MUTE, letterSpacing: "0.2em" }}>{label}</span>
    </div>
  );
}

const blob = (pos, color) => ({ position: "absolute", inset: 0, background: `radial-gradient(52% 52% at ${pos}, ${color}, transparent 78%)` });
function Atmosphere({ reduce }) {
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none" }}>
      <div style={{ position: "absolute", inset: 0, background: BG }} />
      {/* The field is wider than the device and reaches FULL strength before it gets there:
          at 52% wide with the left edge ramping to 40%, the colour was still fading in exactly
          where the phone sits, so the device read as floating on bare white. Now the ramp is
          finished well to the phone's left and the blooms are centred behind it. */}
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "56%", overflow: "hidden",
        WebkitMaskImage: "linear-gradient(to right, transparent, #000 38%), linear-gradient(to bottom, transparent 0%, transparent 5%, #000 20%)",
        WebkitMaskComposite: "source-in",
        maskImage: "linear-gradient(to right, transparent, #000 38%), linear-gradient(to bottom, transparent 0%, transparent 5%, #000 20%)",
        maskComposite: "intersect" }}>
        {/* A continuous blue→green wash under the blooms. Without it the field reads as four
            separate blobs with bare white between them — and the gap lands right where the
            device sits, since the phone covers the middle of the strip. */}
        <span style={{ position: "absolute", inset: 0, background: "linear-gradient(152deg, rgba(37,99,235,.08) 0%, rgba(96,165,250,.06) 38%, rgba(125,211,192,.06) 64%, rgba(198,240,74,.09) 100%)" }} />
        <span className={reduce ? "" : "inv-fa"} style={blob("58% 43%", "rgba(37,99,235,.15)")} />
        <span className={reduce ? "" : "inv-fb"} style={blob("48% 67%", "rgba(59,130,246,.12)")} />
        <span className={reduce ? "" : "inv-fc"} style={blob("66% 74%", "rgba(198,240,74,.16)")} />
        <span className={reduce ? "" : "inv-fd"} style={blob("64% 30%", "rgba(147,197,253,.15)")} />
        <span style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,0) 42%)" }} />
      </div>
      <div style={{ position: "absolute", inset: 0, opacity: 0.5, mixBlendMode: "multiply", backgroundImage: GRAIN }} />
    </div>
  );
}

// EXPLORE: the filter state and the result count, as TYPE inside the narrative — not
// pills or a floating widget. The count is the figure; the filter is its caption.
function FilterViz({ i, compact }) {
  const chips = i >= 7 ? "Silver · Mexico" : i >= 6 ? "Silver" : null;
  // The FILTERED counts come from the fixture, because the phone prints the same number on
  // its search button right beside them and any invented figure would be contradicted on
  // screen. The unfiltered beat carries NO number: how many companies this demo happens to
  // hold is an implementation detail, not a claim about MineEx's market coverage. Put a
  // verified production figure here or leave it in words.
  const browsing = i === 5;
  const n = useTween(browsing ? 0 : i >= 7 ? COUNTS.both : COUNTS.commodity);
  return (
    <Support compact={compact}>
      <p className="mx-label" style={{ margin: "0 0 10px", color: browsing ? MUTE : COBALT, letterSpacing: "0.18em" }}>
        {browsing ? "No filters" : `Filtered by ${chips}`}
      </p>
      {browsing
        ? <p style={{ margin: 0, fontSize: compact ? 17 : 21, fontWeight: 600, color: NAVY, letterSpacing: "-0.02em", lineHeight: 1.3, maxWidth: "20ch" }}>Browse the directory, or narrow it.</p>
        : <Figure value={n} caption={i >= 8 ? "match your thesis" : "companies match"} compact={compact} />}
      {i >= 8 && <p style={{ margin: "12px 0 0", fontSize: compact ? 12.5 : 14, fontWeight: 600, color: COBALT }}>Opening Kingsmen Resources →</p>}
    </Support>
  );
}

// Per-beat supporting information. Deliberately NOT on every beat — the browsing and
// the follow beats stay clean so the states that carry real detail (reading a story,
// and the whole Research chapter) read as heavier. Research is the centrepiece because
// it is the only chapter where every beat carries real figures from the profile.
function supportFor(i, compact) {
  switch (i) {
    case 1:  // DISCOVER · browsing the feed — whose stories these are
      return <Support compact={compact}><Facts compact={compact}>{KX.sources}</Facts></Support>;
    case 4:  // DISCOVER · reading — the real structure of a MineEx story summary
      return (
        <Support compact={compact}>
          <div style={{ display: "grid", gap: compact ? 6 : 9 }}>
            {KX.summarySections.map((t) => (
              <p key={t} style={{ margin: 0, fontSize: compact ? 13 : 15, fontWeight: 600, color: NAVY, letterSpacing: "-0.01em" }}>
                <span style={{ color: COBALT, marginRight: 10 }}>—</span>{t}
              </p>
            ))}
          </div>
        </Support>
      );
    case 9:  // RESEARCH · overview
      return <Support compact={compact}><Facts strong compact={compact}>{KX.tickers}</Facts><Facts compact={compact}>{KX.identity}</Facts></Support>;
    case 10: // RESEARCH · AI brief
      return (
        <Support compact={compact}>
          <div style={{ display: "grid", gap: compact ? 5 : 8 }}>
            {KX.thesis.map((t) => <Facts key={t} strong compact={compact}>{t}</Facts>)}
          </div>
        </Support>
      );
    case 11: // RESEARCH · projects
      return <Support compact={compact}><Facts strong compact={compact}>{KX.projects}</Facts><Facts compact={compact}>{KX.intercept}</Facts></Support>;
    case 12: // RESEARCH · timeline
      return <Support compact={compact}><Facts strong compact={compact}>{KX.releases}</Facts><Facts compact={compact}>{KX.nextCatalyst}</Facts></Support>;
    case 13: // RESEARCH · capital
      return <Support compact={compact}><Facts strong compact={compact}>{KX.capital}</Facts><Facts compact={compact}>{KX.funded}</Facts></Support>;
    case 14: // RESEARCH · leadership
      return <Support compact={compact}><Facts strong compact={compact}>{KX.team}</Facts><Facts compact={compact}>{KX.ceo}</Facts></Support>;
    default:
      return null;   // browsing, opening and the follow beats stay clean
  }
}

/* ── copy content for a beat (shared desktop/mobile) ──────────────────────────── */
function BeatCopy({ i, compact }) {
  if (i === 0) return (
    <>
      <p className="mx-label" style={{ color: COBALT, letterSpacing: "0.22em", margin: 0 }}>For investors</p>
      <h1 className="mx-display" style={{ margin: "clamp(14px,2.2vh,24px) 0 0", color: NAVY, maxWidth: "12ch", fontSize: compact ? 36 : "clamp(42px,5.4vw,78px)", lineHeight: 0.96, letterSpacing: "-0.045em" }}>Discover, research and follow the junior mining market.</h1>
      <p className="mx-lead" style={{ margin: "clamp(16px,2vh,26px) 0 0", color: SLATE, maxWidth: "36ch", fontSize: compact ? 15 : undefined }}>Follow an investor as they find a company, read its full story, decide it’s worth tracking, and keep hearing from it — in the MineEx investor app.</p>
      <p className="mx-label" style={{ marginTop: compact ? 20 : "clamp(28px,4.2vh,46px)", color: MUTE, letterSpacing: "0.2em" }}>Discover · Explore · Research · Follow&nbsp;&nbsp;↓</p>
    </>
  );
  if (i === N - 1) return (
    <>
      <p className="mx-label" style={{ color: COBALT, letterSpacing: "0.22em", margin: 0 }}>Discover · Explore · Research · Follow</p>
      <h2 className="mx-display" style={{ margin: "clamp(14px,2.2vh,24px) 0 0", color: NAVY, maxWidth: "12ch", fontSize: compact ? 34 : "clamp(38px,4.8vw,68px)", lineHeight: 0.98, letterSpacing: "-0.042em" }}>One app for the junior mining market.</h2>
      <p className="mx-lead" style={{ margin: "clamp(14px,2vh,24px) 0 0", color: SLATE, maxWidth: "36ch", fontSize: compact ? 15 : undefined }}>Discover the market, explore companies, research their operations and follow what happens next — together in one app, built for investors.</p>
      <div style={{ marginTop: compact ? 22 : "clamp(28px,4.2vh,46px)", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: compact ? 14 : 18 }}>
        <a href="/get-the-app" className="inv-cta" style={{ display: "inline-flex", alignItems: "center", gap: 12, height: compact ? 52 : 60, padding: compact ? "0 30px" : "0 38px", borderRadius: 999, background: COBALT, color: "#fff", border: `1px solid ${COBALT}`, fontSize: compact ? 16 : 17.5, fontWeight: 700, letterSpacing: "-0.015em", textDecoration: "none" }}>Get the App <span aria-hidden className="inv-arw">→</span></a>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13.5, color: MUTE }}>Free for investors.</span>
          <a href="/pro" className="inv-link" style={{ display: "inline-flex", alignItems: "center", gap: 7, color: SLATE, fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em", textDecoration: "none" }}>For companies: MineEx Pro <span aria-hidden className="inv-arw2">→</span></a>
        </div>
      </div>
      <Footer compact />
    </>
  );
  const s = prod(i);
  // ONE scale for every beat — Research is made the centrepiece by its interactions and
  // pacing, never by shrinking its type or resizing the device.
  return (
    <>
      <Eyebrow n={s.n} label={s.label} />
      <h2 className="mx-h2" style={{ margin: compact ? "8px 0 0" : "18px 0 0", color: NAVY, maxWidth: "16ch", fontSize: compact ? 21 : undefined }}>{s.head}</h2>
      <p className="mx-lead" style={{ margin: compact ? "8px 0 0" : "20px 0 0", color: SLATE, maxWidth: "38ch", fontSize: compact ? 14.5 : undefined }}>{s.body}</p>
      {s.ch === 1 ? <FilterViz i={i} compact={compact} /> : supportFor(i, compact)}
    </>
  );
}

export default function InvestorPage() {
  const { mobile } = useViewport();
  const reduce = useReduce();
  const sectionRef = useRef(null);
  const idx = useScrollIndex(sectionRef, N);
  const { shown, phase } = useCopyPhase(idx, reduce);

  // Desktop uses the sales page's paged-wheel controller; native CSS scroll-snap stays
  // on for touch, where the browser should own the gesture. The two must never both run,
  // or snap fights the controller's animation mid-flight.
  const paged = !mobile && !reduce;
  usePagedWheel(sectionRef, N, paged);
  useEffect(() => {
    if (reduce || paged) return undefined;
    const el = document.documentElement;
    el.classList.add("inv-snap");
    return () => el.classList.remove("inv-snap");
  }, [reduce, paged]);

  // The device is present from the FIRST frame (showing the real Today feed) and never
  // enters, moves or rescales. The stage owns the safe area, so the phone simply fills
  // its grid cell.
  const active = phoneKeyFor(idx);
  const showPhone = idx >= 1 && idx <= STATES.length;   // mobile only: copy card needs the room
  const phone = mobile
    ? <InvestorShellPhone active={active} insetTop={0} insetBottom={0} />
    : <InvestorShellPhone active={active} fill matchSales />;

  if (mobile) {
    return (
      <div className="mx-root" id="top" style={{ background: BG, minHeight: "100vh", color: NAVY }}>
        <MarketingStyles />
        <Nav />
        <main style={{ fontFamily: "'Switzer', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
          <section ref={sectionRef} style={{ position: "relative", height: `${N * 100}svh` }}>
            {Array.from({ length: N }).map((_, i) => <div key={i} aria-hidden className="inv-cell" style={{ position: "absolute", top: `${i * 100}svh`, left: 0, right: 0, height: "100svh", pointerEvents: "none" }} />)}
            <div style={{ position: "sticky", top: 0, height: "100svh", overflow: "hidden" }}>
              <Atmosphere reduce={reduce} />
              <div style={{ position: "absolute", inset: 0, zIndex: 20, opacity: showPhone ? 1 : 0, transition: `opacity 520ms ${EASE}` }}>{phone}</div>
              <div key={shown} className="inv-mcopy" style={{ position: "absolute", left: 16, right: 16, zIndex: 30,
                ...(showPhone ? { bottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" } : { top: "50%", transform: "translateY(-50%)" }),
                background: "rgba(255,255,255,0.92)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: `1px solid ${HAIR}`, borderRadius: 18, padding: "18px 20px", boxShadow: "0 20px 44px -26px rgba(10,27,46,0.4)" }}>
                <BeatCopy i={shown} compact />
              </div>
            </div>
          </section>
        </main>
        <InvStyles />
      </div>
    );
  }

  // ── DESKTOP: one pinned stage; phone + copy glide to each chapter's composition ──
  return (
    <div className="mx-root mx-invstage" id="top" style={{ background: BG, minHeight: "100vh", color: NAVY }}>
      <MarketingStyles />
      <Nav />
      <main style={{ fontFamily: "'Switzer', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
        <section ref={sectionRef} style={{ position: "relative", height: `${N * 100}svh` }}>
          {Array.from({ length: N }).map((_, i) => <div key={i} aria-hidden className="inv-cell" style={{ position: "absolute", top: `${i * 100}svh`, left: 0, right: 0, height: "100svh", pointerEvents: "none" }} />)}

          <div style={{ position: "sticky", top: 0, height: "100svh", overflow: "hidden" }}>
            <Atmosphere reduce={reduce} />

            {/* ONE stage for all 19 states: narrative left, device right, both fixed. */}
            <div style={{ position: "absolute", left: 0, right: 0, top: SAFE_TOP, bottom: SAFE_BOTTOM, zIndex: 20 }}>
              <div style={stageGrid}>
                {/* narrative — fixed column, so the device slot never moves */}
                <div style={{ minHeight: 300, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <div style={copyStyleFor(phase, reduce)}><BeatCopy i={shown} /></div>
                </div>
                {/* device — constant slot, constant scale, no entrance */}
                <div style={{ position: "relative", height: "100%", pointerEvents: "none" }}>
                  {phone}
                  {/* The story's point, in one frame: the company publishes, the follower is
                      notified, and the update is already in the feed behind the banner. Fires
                      on the same beat that switches the phone to the followed-company updates,
                      so the two land together. Desktop only — on mobile the copy card owns
                      the space to the phone's side. */}
                  <PushPreview show={shown === PUSH_BEAT} note={PR_INVESTOR} />
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <InvStyles />
    </div>
  );
}

function InvStyles() {
  return (
    <style>{`
      html.inv-snap { scroll-snap-type: y mandatory; }
      /* The paged controller animates scroll position itself — the browser must not
         re-animate it on top. !important is required: the smooth value is set inline. */
      html.inv-paged { scroll-behavior: auto !important; }
      .inv-cell { scroll-snap-align: start; scroll-snap-stop: always; }
      @keyframes invMcopy { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      .inv-mcopy { animation: invMcopy 340ms ${EASE} both; }
      @keyframes invChip { from { opacity: 0; transform: translateY(6px) scale(0.96); } to { opacity: 1; transform: none; } }
      .inv-chip { animation: invChip 320ms ${EASE} both; }
      .mx-root iframe { pointer-events: none !important; }
      .inv-cta { transition: transform 160ms ${EASE}, box-shadow 160ms ${EASE}; }
      .inv-cta:hover { transform: translateY(-1px); box-shadow: 0 16px 34px -18px rgba(37,99,235,0.7); }
      .inv-arw, .inv-arw2 { transition: transform 200ms ${EASE}; }
      .inv-cta:hover .inv-arw, .inv-link:hover .inv-arw2 { transform: translateX(4px); }
      .inv-link { transition: color 160ms ${EASE}; }
      .inv-link:hover { color: ${COBALT}; }
      @keyframes invfa { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-3%,2%)} }
      @keyframes invfb { 0%,100%{transform:translate(0,0)} 50%{transform:translate(2%,-3%)} }
      @keyframes invfc { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-2%,-2%)} }
      @keyframes invfd { 0%,100%{transform:translate(0,0)} 50%{transform:translate(3%,3%)} }
      .inv-fa{animation:invfa 15s ease-in-out infinite} .inv-fb{animation:invfb 19s ease-in-out infinite} .inv-fc{animation:invfc 17s ease-in-out infinite} .inv-fd{animation:invfd 21s ease-in-out infinite}
      @media (prefers-reduced-motion: reduce){ .inv-fa,.inv-fb,.inv-fc,.inv-fd{animation:none} html.inv-snap{scroll-snap-type:none} }
    `}</style>
  );
}
