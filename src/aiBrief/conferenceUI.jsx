// ─────────────────────────────────────────────────────────────────────────────
// Conference Mode — conference-only design + motion system (Deck rebuild).
//
// ISOLATION CONTRACT (unchanged):
//   • Nothing here edits or extends PassportProto shared primitives — we only READ
//     the live accent bindings (EM / EM_TEXT) and utilities (prefersReduce) from it.
//   • All CSS/classes/keyframes are `cm-`-prefixed and scoped under `.cm-root`.
//   • This module is imported ONLY by ConferenceScenes.jsx.
//
// ARCHITECTURE (new): Conference Mode is a discrete "deck" of presentation STATES
// (beats), not a scroll page. ConferenceScenes owns the deck controller (gesture
// locking, one-gesture-one-state) and passes each section component:
//     • active — is THIS section the on-screen one right now
//     • local  — which internal beat is active (0..count-1)
// Each section renders its beats as stacked layers via <SectionPanel/>; only the
// active beat is opaque, and its inner content animates via <Rise on=…/> (prop-
// driven — NO IntersectionObserver, NO scrollTop). Every section exposes a static
// `.beats(data)` so the controller can size the manifest without rendering.
// Motion is one consistent language: heading rise+blur → staggered copy → numbers
// reveal (tabular, no layout shift) → media establish. No bounce, no overshoot.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef } from "react";
import { EM, EM_TEXT, prefersReduce } from "./PassportProto.jsx";

// ── Design tokens ────────────────────────────────────────────────────────────
const FONT = "'Switzer', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";      // quick out, gentle settle
const EASE_MEDIA = "cubic-bezier(0.16, 1, 0.3, 1)"; // slower, filmic for media

const CM = {
  ink: "#04060c",
  deep: "#0a0e17",
  text: "#f5f7fa",
  dim: "#9aa6b4",
  mute: "#69737f",
  hair: "rgba(255,255,255,0.14)",
  hairSoft: "rgba(255,255,255,0.08)",
  sheet: "#f2efe8",
  sheetPanel: "#ffffff",
  sheetText: "#141821",
  sheetDim: "#565f6b",
  sheetMute: "#8b939d",
  sheetHair: "rgba(18,22,29,0.10)",
  onLight: "#141821",
  maxW: 1240,
  gutter: "clamp(28px, 5vw, 76px)",
  radMedia: 18,
  radPanel: 26,
  radPill: 999,
};

// Per-section tone. bg/fg drive the scene; nav.* drives the color-inheriting top bar.
// `accent` is a LAZY GETTER — EM/EM_TEXT are live `let` bindings from PassportProto and
// (via the circular import) are still in their TDZ when this module first evaluates.
// Reading them only at render time (getter) sidesteps that; assigning them at module
// eval throws "Cannot access EM before initialization" and blocks the whole app load.
export const TONES = {
  sheet: { key: "sheet", bg: "#f2efe8", fg: "#141821", dim: "#565f6b", mute: "#8b939d", hair: "rgba(18,22,29,0.10)", get accent() { return EM_TEXT; }, nav: "rgba(242,239,232,0.86)", navText: "#141821", navDim: "#8b939d", navHair: "rgba(18,22,29,0.10)" },
  board: { key: "board", bg: "#e7e4dd", fg: "#141821", dim: "#565f6b", mute: "#8b939d", hair: "rgba(18,22,29,0.10)", get accent() { return EM_TEXT; }, nav: "rgba(231,228,221,0.88)", navText: "#141821", navDim: "#8b939d", navHair: "rgba(18,22,29,0.10)" },
  ink: { key: "ink", bg: "#05070d", fg: "#f5f7fa", dim: "#c2ccd8", mute: "#8b97a6", hair: "rgba(255,255,255,0.14)", get accent() { return EM; }, nav: "rgba(6,9,15,0.82)", navText: "#f5f7fa", navDim: "#69737f", navHair: "rgba(255,255,255,0.12)" },
  deep: { key: "deep", bg: "#0b0e13", fg: "#f5f7fa", dim: "#c2ccd8", mute: "#8b97a6", hair: "rgba(255,255,255,0.14)", get accent() { return EM; }, nav: "rgba(11,14,19,0.82)", navText: "#f5f7fa", navDim: "#69737f", navHair: "rgba(255,255,255,0.12)" },
};

// Type ramp — clamp() everywhere so long names/headlines never break the composition.
const T = {
  eyebrow: { fontSize: 12.5, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase" },
  display: { fontSize: "clamp(46px, 7vw, 104px)", fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 0.98 },
  xl: { fontSize: "clamp(38px, 5.4vw, 84px)", fontWeight: 700, letterSpacing: "-0.036em", lineHeight: 1.0 },
  h1: { fontSize: "clamp(32px, 4.6vw, 66px)", fontWeight: 700, letterSpacing: "-0.032em", lineHeight: 1.03 },
  h2: { fontSize: "clamp(26px, 3.2vw, 46px)", fontWeight: 700, letterSpacing: "-0.028em", lineHeight: 1.08 },
  lead: { fontSize: "clamp(17px, 1.5vw, 22px)", fontWeight: 400, lineHeight: 1.5, letterSpacing: "-0.005em" },
  body: { fontSize: "clamp(14.5px, 1.05vw, 16.5px)", fontWeight: 400, lineHeight: 1.5 },
  label: { fontSize: 11.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase" },
};

// ── Injected, conference-scoped CSS (keyframes only) ─────────────────────────
export function CMStyles() {
  return (
    <style>{`
      .cm-root, .cm-root * { box-sizing: border-box; }
      @keyframes cm-cue { 0%,100% { transform: translateY(0); } 50% { transform: translateY(5px); } }
      .cm-root .cm-cue { animation: cm-cue 2.4s ease-in-out infinite; }
      @keyframes cm-herodrift { from { transform: scale(1); } to { transform: scale(1.06); } }
      .cm-root .cm-herodrift { animation: cm-herodrift 26s ease-in-out infinite alternate; }
      @keyframes cm-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
      .cm-root .cm-float { animation: cm-float 6s ease-in-out infinite; will-change: transform; }
      @keyframes cm-endcap-sheen { from { background-position: 0% 50%; } to { background-position: 100% 50%; } }
      .cm-root .cm-endcap-type { animation: cm-endcap-sheen 17s ease-in-out infinite alternate; }
      @keyframes cm-endcap-glow { 0%,100% { opacity: 0.5; transform: scale(1); } 50% { opacity: 0.9; transform: scale(1.08); } }
      .cm-root .cm-endcap-glow { animation: cm-endcap-glow 13s ease-in-out infinite; will-change: transform, opacity; }
      @media (prefers-reduced-motion: reduce) {
        .cm-root .cm-cue, .cm-root .cm-herodrift, .cm-root .cm-float,
        .cm-root .cm-endcap-type, .cm-root .cm-endcap-glow { animation: none; }
      }
    `}</style>
  );
}

// ── Motion language ───────────────────────────────────────────────────────────
// One restrained editorial vocabulary. `on` (not scroll, not IO) drives entrances,
// so the deck can replay a beat's choreography every time it becomes active.
const MOTION = {
  eyebrow: { y: 10, dur: 480, delay: 0, stagger: 0 },
  heading: { y: 30, dur: 580, delay: 60, stagger: 0, blur: 5 },   // rise + blur-resolve (450–650ms)
  copy: { y: 16, dur: 520, delay: 220, stagger: 100 },            // after heading, soft stagger
  stat: { y: 0, dur: 520, delay: 200, stagger: 90 },              // opacity only — numbers never move
  media: { y: 30, dur: 700, delay: 150, stagger: 0, scaleFrom: 0.96 },
  item: { y: 18, dur: 520, delay: 220, stagger: 78 },
};

function Rise({ on, kind = "copy", order = 0, delay, style, className, as: Tag = "div", children }) {
  const reduce = prefersReduce();
  // Latch: once a beat first reveals, stay revealed. So when its section fades out
  // during a transition, content fades WITH the layer instead of snapping to hidden.
  const [latched, setLatched] = useState(reduce);
  useEffect(() => { if (on) setLatched(true); }, [on]);
  const shown = reduce || latched;
  const cfg = MOTION[kind] || MOTION.copy;
  const d = shown ? (delay != null ? delay : cfg.delay) + order * (cfg.stagger || 0) : 0;
  const t = reduce ? "none" : `opacity ${cfg.dur}ms ${EASE} ${d}ms, transform ${cfg.dur}ms ${EASE} ${d}ms, filter ${cfg.dur}ms ${EASE} ${d}ms`;
  const from = `translateY(${cfg.y}px)` + (cfg.scaleFrom ? ` scale(${cfg.scaleFrom})` : "");
  return (
    <Tag className={className} style={{
      opacity: shown ? 1 : 0,
      transform: shown ? "none" : from,
      filter: cfg.blur ? (shown ? "blur(0px)" : `blur(${cfg.blur}px)`) : undefined,
      transition: t,
      willChange: shown ? "auto" : "transform, opacity",
      ...style,
    }}>{children}</Tag>
  );
}

// A number that reveals by opacity and (optionally) counts up — inside a fixed-width,
// tabular container so it NEVER causes layout shift while animating. `run` gates it.
function ConfCountUp({ value, run, style, countUp = true }) {
  const raw = value == null ? "" : String(value);
  const m = raw.match(/^(\D*)([\d][\d,]*(?:\.\d+)?)(.*)$/);
  const reduce = prefersReduce();
  const [disp, setDisp] = useState(m && countUp && !reduce ? m[1] + "0" + m[3] : raw);
  // `done` latches only at COMPLETION (not at start), so an interrupted count-up (idle
  // reset, quick nav away-and-back) restarts cleanly instead of freezing mid-value.
  const doneRef = useRef(false);
  useEffect(() => {
    if (!m || !countUp || reduce) { setDisp(raw); return; }
    if (doneRef.current) { setDisp(raw); return; }        // already finished → stay at final
    if (!run) { setDisp(m[1] + "0" + m[3]); return; }       // not active yet → placeholder
    const pre = m[1], numStr = m[2], suf = m[3];
    const grouped = numStr.includes(","), decimals = (numStr.split(".")[1] || "").length;
    const target = parseFloat(numStr.replace(/,/g, ""));
    const fmt = (n) => { let s = decimals ? n.toFixed(decimals) : String(Math.round(n)); if (grouped) s = Number(s).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }); return pre + s + suf; };
    let t0 = null, raf = 0; const dur = 1000;
    const step = (ts) => { if (t0 == null) t0 = ts; const p = Math.min(1, (ts - t0) / dur); const e = 1 - Math.pow(1 - p, 3); if (p >= 1) { doneRef.current = true; setDisp(raw); } else { setDisp(fmt(target * e)); raf = requestAnimationFrame(step); } };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [run, raw]);
  return <span style={{ fontVariantNumeric: "tabular-nums", ...style }}>{disp}</span>;
}

// ── Base primitives ───────────────────────────────────────────────────────────
function Eyebrow({ children, on, color, style }) {
  const c = color || EM;
  return (
    <Rise on={on} kind="eyebrow">
      <div style={{ display: "inline-flex", alignItems: "center", gap: 12, ...T.eyebrow, color: c, ...style }}>
        <span style={{ width: 22, height: 2, borderRadius: 2, background: c, opacity: 0.9 }} />
        {children}
      </div>
    </Rise>
  );
}
function Heading({ children, on, size = "h1", delay, color, style }) {
  return <Rise on={on} kind="heading" delay={delay}><div style={{ ...(T[size] || T.h1), color: color || "inherit", ...style }}>{children}</div></Rise>;
}
function Lead({ children, on, order = 0, color, style }) {
  return <Rise on={on} kind="copy" order={order}><div style={{ ...T.lead, color: color || "inherit", ...style }}>{children}</div></Rise>;
}

// Progress dots (● ○) for a section's beats. Restrained; accent-filled active.
export function BeatDots({ count, local, tone, style }) {
  if (count <= 1) return null;
  const acc = (tone && tone.accent) || EM;
  const off = tone && tone.key && (tone.key === "sheet" || tone.key === "board") ? "rgba(18,22,29,0.2)" : "rgba(255,255,255,0.28)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, ...style }}>
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} style={{ height: 8, width: i === local ? 24 : 8, borderRadius: 99, background: i === local ? acc : off, transition: `width .34s ${EASE}, background .34s ${EASE}` }} />
      ))}
    </div>
  );
}

// The beat-layer engine. Renders `count` stacked full-panel layers on the tone bg;
// only the active layer is opaque + interactive. Inner content animates via `active`.
function SectionPanel({ tone, count, local, active, reduce, render }) {
  const n = Math.max(1, count);
  const lc = Math.max(0, Math.min(local, n - 1));
  return (
    <div style={{ position: "absolute", inset: 0, background: tone.bg, color: tone.fg, fontFamily: FONT, overflow: "hidden" }}>
      {Array.from({ length: n }).map((_, i) => {
        const on = i === lc;
        return (
          <div key={i} aria-hidden={!on} style={{
            position: "absolute", inset: 0,
            opacity: on ? 1 : 0,
            transition: (on || reduce) ? "none" : `opacity 320ms ${EASE}`,
            pointerEvents: on ? "auto" : "none",
          }}>
            {render(i, on && active)}
          </div>
        );
      })}
    </div>
  );
}

// A single beat's centered content frame. `align:'top'` for grids that can grow.
function Beat({ children, align = "center", pad, maxW = CM.maxW, style }) {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: align === "top" ? "flex-start" : "center", padding: pad || "clamp(72px, 10vh, 116px) " + CM.gutter, boxSizing: "border-box", ...style }}>
      <div style={{ width: "100%", maxWidth: maxW, margin: "0 auto" }}>{children}</div>
    </div>
  );
}

// A drawn rule that grows L→R when its beat is active.
function DrawRule({ on, color, delay = 260, w = "clamp(120px, 34%, 280px)", h = 3, style }) {
  const reduce = prefersReduce();
  return <div style={{ width: w, height: h, background: color, transformOrigin: "left", transform: (reduce || on) ? "scaleX(1)" : "scaleX(0)", transition: reduce ? "none" : `transform 760ms ${EASE} ${delay}ms`, ...style }} />;
}

// A framed image that establishes (scale .96→1 + rise + fade) when its beat is active.
function MediaFill({ src, on, radius = "clamp(16px, 1.8vw, 24px)", style, children }) {
  const reduce = prefersReduce();
  const shown = reduce || on;
  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: radius, background: "#0c0f14", ...style }}>
      {src && <img src={src} alt="" loading="lazy" decoding="async" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transform: shown ? "scale(1)" : "scale(1.06)", opacity: shown ? 1 : 0, transition: reduce ? "none" : `transform 900ms ${EASE_MEDIA}, opacity 700ms ${EASE_MEDIA}` }} />}
      {children}
    </div>
  );
}

// A responsive fact rail — thin rules, small labels, large values; only populated facts.
function FactRail({ facts, on, tone, big = false }) {
  const label = tone.mute, rule = tone.hair, ink = tone.fg;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "clamp(26px, 4vh, 46px) clamp(30px, 4vw, 68px)" }}>
      {facts.map((f, i) => {
        const wide = (f.value || "").length > 15;
        return (
          <div key={i} style={{ flex: wide ? "2 1 300px" : "1 1 168px", minWidth: wide ? 240 : 140 }}>
            <DrawRule on={on} color={f.accent ? (tone.accent) : rule} h={f.accent ? 2 : 1} w="100%" delay={200 + i * 60} />
            <Rise on={on} kind="item" order={i} delay={300}>
              <div style={{ ...T.label, fontSize: 11.5, color: f.accent ? tone.accent : label, marginTop: "clamp(14px,1.8vh,22px)" }}>{f.label}</div>
              <div style={{ fontSize: big ? "clamp(26px,3vw,50px)" : "clamp(20px,2.1vw,32px)", fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.08, marginTop: "clamp(8px,1.2vh,14px)", color: ink, textTransform: f.capitalize ? "capitalize" : "none" }}>{f.value}</div>
            </Rise>
          </div>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// CHAPTER TRANSITION (Type A) — dramatic punctuation between major topics.
// A full-viewport reset: an image "takes over" (scales/reveals in) with a giant
// section number watermark, section name, and one evocative line resolving over it.
// `variant`: "image" (landscape/portrait takeover) · "data" (accent-led, no photo,
// for Capital / Investment Case). Used as beat 0 of a major section so entering the
// topic feels like turning to a new chapter, not loading another content page.
// ════════════════════════════════════════════════════════════════════════════
export function CMChapter({ number, kicker, title, subtitle, image, tone, variant = "image", active }) {
  const t = tone || TONES.ink;
  const reduce = prefersReduce();
  const shown = reduce || active;
  const isData = variant === "data" || !image;
  return (
    <div style={{ position: "absolute", inset: 0, background: isData ? t.bg : "#05070d", color: "#fff", fontFamily: FONT, overflow: "hidden" }}>
      {/* Backdrop — image takeover, or an accent field for data chapters */}
      {isData ? (
        <div aria-hidden style={{ position: "absolute", inset: 0, background: `radial-gradient(120% 100% at 82% -10%, ${t.accent}26, transparent 58%), ${t.bg}`, opacity: shown ? 1 : 0, transition: reduce ? "none" : `opacity 700ms ${EASE_MEDIA}` }} />
      ) : (
        <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
          <img src={image} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 32%", transform: shown ? "scale(1)" : "scale(1.14)", opacity: shown ? 1 : 0, transition: reduce ? "none" : `transform 1200ms ${EASE_MEDIA}, opacity 760ms ${EASE_MEDIA}` }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(4,6,12,0.52) 0%, rgba(4,6,12,0.12) 42%, rgba(4,6,12,0.86) 100%)" }} />
        </div>
      )}
      {/* Giant section-number watermark */}
      {number && (
        <div aria-hidden style={{ position: "absolute", top: "clamp(44px,9vh,132px)", right: "clamp(16px,4vw,72px)", fontSize: "clamp(150px,27vw,440px)", fontWeight: 700, letterSpacing: "-0.06em", lineHeight: 0.8, color: isData ? t.accent : "#fff", pointerEvents: "none", fontVariantNumeric: "tabular-nums", transform: shown ? "none" : "translateY(28px)", opacity: shown ? (isData ? 0.2 : 0.16) : 0, transition: reduce ? "none" : `transform 1000ms ${EASE} 80ms, opacity 900ms ${EASE} 80ms` }}>{number}</div>
      )}
      {/* Foreground — lower-left editorial block */}
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: "clamp(52px,9vh,124px) clamp(28px,5vw,84px)", boxSizing: "border-box" }}>
        <div style={{ maxWidth: 1120 }}>
          {kicker && <Rise on={active} kind="copy"><div style={{ ...T.label, fontSize: 13, color: t.accent, marginBottom: "clamp(12px,1.8vh,20px)" }}>{kicker}</div></Rise>}
          {title && <Rise on={active} kind="heading"><div style={{ fontSize: "clamp(52px,10.5vw,158px)", fontWeight: 700, letterSpacing: "-0.045em", lineHeight: 0.92, color: "#fff" }}>{title}</div></Rise>}
          {subtitle && <Rise on={active} kind="copy" order={1}><div style={{ fontSize: "clamp(18px,2.2vw,32px)", fontWeight: 500, color: "rgba(255,255,255,0.82)", marginTop: "clamp(16px,2.2vh,26px)", maxWidth: "36ch", lineHeight: 1.3 }}>{subtitle}</div></Rise>}
        </div>
      </div>
    </div>
  );
}
CMChapter.tone = TONES.ink;

// ════════════════════════════════════════════════════════════════════════════
// SECTION — OVERVIEW  (Cover · Positioning · Facts)
// ════════════════════════════════════════════════════════════════════════════
function overviewBeats({ hero, company }) {
  const beats = ["cover"];
  if ((company && (company.title || company.overview))) beats.push("positioning");
  if (company && company.facts && company.facts.length) beats.push("facts");
  return beats;
}
export function CMOverview({ hero, company, active, local, reduce }) {
  const tone = TONES.sheet;
  const beats = overviewBeats({ hero, company });
  const media = hero.media || { type: "none", src: "" };
  const tickers = hero.tickers || [];
  const stat = hero.stat && hero.stat.value ? hero.stat : null;

  const Cover = (on) => (
    <Beat pad="clamp(48px, 6vh, 88px) clamp(28px, 5vw, 76px)" maxW={1160}>
      {/* Framed dominant media */}
      <Rise on={on} kind="media">
        <div style={{ position: "relative", width: "100%", height: "clamp(240px, 44vh, 520px)", borderRadius: "clamp(16px,1.8vw,26px)", overflow: "hidden", border: `1px solid ${tone.hair}`, boxShadow: "0 60px 120px -70px rgba(20,24,33,0.5), 0 12px 40px -28px rgba(20,24,33,0.35)", background: "#e9e5dc" }}>
          {media.type === "video" ? <video src={media.src} autoPlay muted loop playsInline className="cm-herodrift" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
            : media.type === "image" ? <img src={media.src} alt="" className="cm-herodrift" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
              : <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: `linear-gradient(150deg, ${EM}22, #ece7dd 72%)` }}>{hero.logo && <img src={hero.logo} alt="" style={{ height: "clamp(72px,9vw,128px)", maxWidth: "48%", objectFit: "contain", opacity: 0.9 }} />}</div>}
        </div>
      </Rise>
      {/* Identity */}
      <div style={{ marginTop: "clamp(22px, 3vh, 40px)" }}>
        {hero.logo && media.type !== "none" && <Rise on={on} kind="copy" delay={260}><img src={hero.logo} alt="" style={{ height: "clamp(36px,3.6vw,52px)", maxWidth: 200, objectFit: "contain", display: "block", marginBottom: "clamp(12px,1.6vh,20px)" }} /></Rise>}
        {hero.name && <Heading on={on} size="xl" delay={320} color={tone.fg}>{hero.name}</Heading>}
        {hero.slogan && <Lead on={on} order={1} color={tone.dim} style={{ marginTop: "clamp(12px,1.6vh,18px)", maxWidth: "52ch", fontWeight: 500 }}>{hero.slogan}</Lead>}
        {(tickers.length > 0 || hero.status) && (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 9, marginTop: "clamp(14px,1.8vh,22px)" }}>
            {tickers.map((t, i) => (
              <Rise key={i} on={on} kind="item" order={i} delay={520} style={{ display: "inline-flex" }}>
                <span style={{ display: "inline-flex", alignItems: "center", fontSize: 12.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: tone.fg, background: "rgba(20,24,33,0.03)", border: `1px solid ${tone.hair}`, borderRadius: CM.radPill, padding: "7px 14px" }}>{t.ex ? `${t.ex}: ${t.sym}` : t.sym}</span>
              </Rise>
            ))}
            {hero.status && (
              <Rise on={on} kind="item" order={tickers.length} delay={520} style={{ display: "inline-flex" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 9, background: "rgba(20,24,33,0.03)", border: `1px solid ${tone.hair}`, borderRadius: CM.radPill, padding: "7px 15px" }}>
                  <span style={{ height: 8, width: 8, borderRadius: 99, background: EM_TEXT, boxShadow: `0 0 0 4px ${EM}22` }} />
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: tone.fg }}>{hero.status}</span>
                </span>
              </Rise>
            )}
          </div>
        )}
      </div>
    </Beat>
  );

  const Positioning = (on) => (
    <Beat>
      <Eyebrow on={on} color={tone.accent}>{company.eyebrow || "Company"}</Eyebrow>
      {company.title && <Heading on={on} size="display" delay={120} color={tone.fg} style={{ marginTop: "clamp(18px,2.4vh,30px)", maxWidth: "16ch" }}>{company.title}</Heading>}
      {company.overview && <Lead on={on} order={1} color={tone.dim} style={{ marginTop: "clamp(22px,3vh,36px)", maxWidth: "44ch" }}>{company.overview}</Lead>}
    </Beat>
  );

  const Facts = (on) => (
    <Beat>
      <Eyebrow on={on} color={tone.accent}>At a glance</Eyebrow>
      <div style={{ marginTop: "clamp(34px,5vh,62px)" }}><FactRail facts={company.facts} on={on} tone={tone} big /></div>
    </Beat>
  );

  const render = (i, on) => {
    const b = beats[i];
    if (b === "cover") return Cover(on);
    if (b === "positioning") return Positioning(on);
    return Facts(on);
  };
  return <SectionPanel tone={tone} count={beats.length} local={local} active={active} reduce={reduce} render={render} />;
}
CMOverview.beats = overviewBeats;
CMOverview.tone = TONES.sheet;

// ════════════════════════════════════════════════════════════════════════════
// SECTION — HIGHLIGHTS  (chunks of 3, value-dominant cards)
// ════════════════════════════════════════════════════════════════════════════
function chunk(arr, n) { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; }
function highlightsBeats({ highlights }) {
  const cards = (highlights && highlights.cards) || [];
  return chunk(cards, 3);
}
export function CMHighlights({ highlights, active, local, reduce }) {
  const tone = TONES.ink;
  const groups = highlightsBeats({ highlights });
  if (!groups.length) return null;
  const total = groups.length;

  const render = (gi, on) => {
    const cards = groups[gi];
    return (
      <Beat maxW={1280}>
        <div>
          <Eyebrow on={on} color={tone.accent}>{highlights.eyebrow || "At a Glance"}</Eyebrow>
          {highlights.title && <Heading on={on} size="h1" delay={110} color={tone.fg} style={{ marginTop: "clamp(14px,1.8vh,20px)", maxWidth: "18ch" }}>{highlights.title}</Heading>}
        </div>
        <div style={{ marginTop: "clamp(32px,5vh,64px)", display: "grid", gridTemplateColumns: `repeat(${cards.length}, minmax(0, 1fr))`, gap: "clamp(16px,1.6vw,26px)" }}>
          {cards.map((c, i) => (
            <Rise key={i} on={on} kind="item" order={i} delay={220}>
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: "clamp(260px, 36vh, 400px)", background: "rgba(255,255,255,0.03)", border: `1px solid ${tone.hair}`, borderRadius: CM.radPanel, padding: "clamp(24px,2.2vw,38px)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14 }}>
                  <div style={{ fontSize: "clamp(30px,3.4vw,54px)", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.02, color: tone.fg }}>{c.value}</div>
                  {c.seq && <div style={{ ...T.label, fontSize: 12, color: tone.accent, whiteSpace: "nowrap", flexShrink: 0, paddingTop: 4 }}>{c.seq}</div>}
                </div>
                <div>
                  {c.label && <div style={{ ...T.label, fontSize: 11, color: tone.mute }}>{c.label}</div>}
                  {c.context && <div style={{ ...T.body, color: tone.dim, marginTop: c.label ? 10 : 0 }}>{c.context}</div>}
                </div>
              </div>
            </Rise>
          ))}
        </div>
      </Beat>
    );
  };
  return <SectionPanel tone={tone} count={total} local={local} active={active} reduce={reduce} render={render} />;
}
CMHighlights.beats = highlightsBeats;
CMHighlights.tone = TONES.ink;

// ════════════════════════════════════════════════════════════════════════════
// SECTION — JURISDICTION  (Location · Context · Infrastructure)
// ════════════════════════════════════════════════════════════════════════════
function jurisdictionBeats({ jurisdiction }) {
  const j = jurisdiction || {};
  const beats = [];
  if (j.title || j.image) beats.push("location");
  const facts = j.facts || [];
  const hasContext = j.narrative || j.districtContext || j.regionalGeology || (facts.length > 0);
  if (hasContext) beats.push("context");
  if (!beats.length && j.narrative) beats.push("context");
  return beats;
}
export function CMJurisdiction({ jurisdiction, active, local, reduce }) {
  const tone = TONES.board;
  const j = jurisdiction || {};
  const beats = jurisdictionBeats({ jurisdiction });
  const facts = j.facts || [];

  // LOCATION — an intentionally sparse editorial opening: place name + a short descriptor
  // + the landscape. The prose lives in the Context beat so this never overflows.
  const Location = (on) => (
    <Beat pad="clamp(52px, 7vh, 88px) clamp(28px, 5vw, 76px)" maxW={1220}>
      <Eyebrow on={on} color={tone.accent}>{j.eyebrow || "Jurisdiction"}</Eyebrow>
      {j.title && <Heading on={on} size="h1" delay={110} color={tone.fg} style={{ marginTop: "clamp(12px,1.8vh,20px)", maxWidth: "16ch" }}>{j.title}</Heading>}
      {j.heroStat && <Rise on={on} kind="copy"><div style={{ fontSize: "clamp(15px,1.3vw,19px)", fontWeight: 600, color: tone.accent, marginTop: "clamp(12px,1.6vh,18px)", borderLeft: `3px solid ${tone.accent}`, paddingLeft: 14, maxWidth: "44ch" }}>{j.heroStat}</div></Rise>}
      {j.image && <Rise on={on} kind="media" delay={200}><MediaFill src={j.image} on={on} style={{ marginTop: "clamp(22px,3vh,38px)", height: "clamp(220px, 40vh, 420px)", border: "1px solid rgba(18,22,29,0.08)" }} /></Rise>}
    </Beat>
  );

  // CONTEXT — the geographic/infrastructure narrative + facts, beside a supporting image.
  const Context = (on) => (
    <Beat pad="clamp(56px, 7vh, 96px) clamp(28px, 5vw, 76px)" maxW={1220}>
      <Eyebrow on={on} color={tone.accent}>{(j.eyebrow || "Jurisdiction")} · Context</Eyebrow>
      <div style={{ display: "grid", gridTemplateColumns: j.image ? "minmax(0,1.08fr) minmax(0,1fr)" : "1fr", gap: "clamp(24px,4vw,64px)", alignItems: "center", marginTop: "clamp(22px,3vh,38px)" }}>
        <div>
          {j.narrative && <Rise on={on} kind="copy"><div style={{ ...T.lead, color: tone.dim, maxWidth: "48ch" }}>{j.narrative}</div></Rise>}
          {j.districtContext && <Rise on={on} kind="copy" order={1}><div style={{ fontSize: "clamp(14px,1.1vw,16px)", color: tone.mute, marginTop: j.narrative ? 16 : 0, lineHeight: 1.55, maxWidth: "48ch" }}><b style={{ color: tone.fg, fontWeight: 700 }}>District — </b>{j.districtContext}</div></Rise>}
          {j.regionalGeology && <Rise on={on} kind="copy" order={2}><div style={{ fontSize: "clamp(14px,1.1vw,16px)", color: tone.mute, marginTop: 12, lineHeight: 1.55, maxWidth: "48ch" }}><b style={{ color: tone.fg, fontWeight: 700 }}>Regional geology — </b>{j.regionalGeology}</div></Rise>}
          {facts.length > 0 && <div style={{ marginTop: "clamp(22px,3vh,36px)" }}><FactRail facts={facts.slice(0, 4)} on={on} tone={tone} /></div>}
        </div>
        {j.image && <Rise on={on} kind="media" delay={180}><MediaFill src={j.image} on={on} style={{ height: "clamp(240px, 46vh, 440px)", border: "1px solid rgba(18,22,29,0.08)" }} /></Rise>}
      </div>
    </Beat>
  );

  const render = (i, on) => (beats[i] === "location" ? Location(on) : Context(on));
  return <SectionPanel tone={tone} count={beats.length} local={local} active={active} reduce={reduce} render={render} />;
}
CMJurisdiction.beats = jurisdictionBeats;
CMJurisdiction.tone = TONES.board;

// ════════════════════════════════════════════════════════════════════════════
// SECTION — PROJECT  (per project: Snapshot · Story · Exploration · [Results])
// One instance per project. Persistent media backdrop for continuity across beats.
// ════════════════════════════════════════════════════════════════════════════
function projectBeats({ story, results }) {
  const states = (story && story.states) || [];
  const list = states.map((s) => ({ type: "state", state: s }));
  if (results && (results.featured || (results.metrics && results.metrics.length) || (results.intercepts && results.intercepts.length))) list.push({ type: "results", results });
  return list;
}
export function CMProject({ story, results, active, local, reduce }) {
  const tone = TONES.ink;
  const beats = projectBeats({ story, results });
  if (!beats.length) return null;

  const Header = (on) => (
    <div>
      <Rise on={on} kind="eyebrow"><div style={{ ...T.label, fontSize: 11.5, color: story.flagship ? tone.accent : "rgba(255,255,255,0.6)" }}>{story.label}</div></Rise>
      <Heading on={on} size="h1" delay={80} color={tone.fg} style={{ marginTop: "clamp(8px,1.2vh,14px)" }}>{story.name}</Heading>
      {story.location && <Rise on={on} kind="copy"><div style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.66)", marginTop: 10 }}>{story.location}</div></Rise>}
    </div>
  );

  const StateBody = (state, on) => (
    state.kind === "facts" ? (
      <div style={{ marginTop: "clamp(22px,3vh,34px)" }}><FactRail facts={state.facts} on={on} tone={tone} /></div>
    ) : (
      <Rise on={on} kind="copy"><div style={{ marginTop: "clamp(18px,2.6vh,28px)", fontSize: "clamp(17px,1.7vw,23px)", fontWeight: 400, lineHeight: 1.55, color: tone.dim, maxWidth: "44ch" }}>{state.body}</div></Rise>
    )
  );

  const render = (i, on) => {
    const b = beats[i];
    // Persistent media backdrop (right column) — same element across beats for continuity.
    const bImg = b.type === "state" ? (b.state.media || "") : ((results.media && results.media.images && results.media.images[0]) || "");
    if (b.type === "results") {
      const r = results;
      const f = r.featured;
      return (
        <Beat maxW={1240}>
          <div style={{ display: "grid", gridTemplateColumns: bImg ? "minmax(0,1fr) minmax(0,0.9fr)" : "1fr", gap: "clamp(28px,4vw,72px)", alignItems: "center" }}>
            <div>
              {Header(on)}
              <Rise on={on} kind="eyebrow" delay={140}><div style={{ ...T.label, fontSize: 11.5, color: tone.accent, marginTop: "clamp(20px,2.6vh,32px)" }}>{r.eyebrow || "Results & Evidence"}</div></Rise>
              {f && (f.kind === "grade" ? (
                <div style={{ marginTop: 14 }}>
                  <Rise on={on} kind="stat"><ConfCountUp value={f.value} run={on} style={{ display: "block", fontSize: "clamp(44px,6.4vw,96px)", fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 0.96, color: "#fff" }} /></Rise>
                  <DrawRule on={on} color={tone.accent} delay={320} style={{ marginTop: "clamp(16px,2.2vh,26px)" }} />
                  {f.interval && <Rise on={on} kind="copy" delay={420}><div style={{ fontSize: "clamp(18px,2.2vw,30px)", fontWeight: 700, color: tone.dim, marginTop: "clamp(14px,2vh,22px)" }}>{f.interval}</div></Rise>}
                  {(f.hole || f.context) && <Rise on={on} kind="copy" order={1} delay={420}><div style={{ fontSize: 15, color: tone.mute, marginTop: 10, maxWidth: "40ch" }}>{[f.hole, f.context].filter(Boolean).join("  ·  ")}</div></Rise>}
                </div>
              ) : (
                <div style={{ marginTop: 14 }}>
                  <Rise on={on} kind="stat"><ConfCountUp value={f.value} run={on} style={{ display: "block", fontSize: "clamp(40px,5.6vw,84px)", fontWeight: 700, letterSpacing: "-0.038em", lineHeight: 0.98, color: "#fff" }} /></Rise>
                  <DrawRule on={on} color={tone.accent} delay={320} style={{ marginTop: "clamp(14px,2vh,24px)" }} />
                  {f.label && <Rise on={on} kind="copy" delay={420}><div style={{ ...T.label, fontSize: 12.5, color: tone.mute, marginTop: 16 }}>{f.label}</div></Rise>}
                </div>
              ))}
              {r.intercepts && r.intercepts.length > 0 && (
                <div style={{ marginTop: "clamp(24px,3.4vh,40px)" }}>
                  <div style={{ ...T.label, fontSize: 11, color: tone.accent, marginBottom: 6 }}>Selected intercepts</div>
                  {r.intercepts.slice(0, 5).map((row, k) => (
                    <Rise key={k} on={on} kind="item" order={k} delay={200} style={{ display: "flex", alignItems: "baseline", gap: "8px 22px", flexWrap: "wrap", padding: "12px 0", borderTop: `1px solid ${tone.hair}` }}>
                      {row.hole && <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 14, fontWeight: 700, color: tone.dim, minWidth: 110 }}>{row.hole}</span>}
                      {row.interval && <span style={{ fontSize: 14.5, color: tone.mute }}>{row.interval}</span>}
                      {row.grade && <span style={{ fontSize: 17, fontWeight: 700, color: "#fff", marginLeft: "auto" }}>{row.grade}</span>}
                    </Rise>
                  ))}
                </div>
              )}
              {(!r.intercepts || !r.intercepts.length) && r.metrics && r.metrics.length > 0 && (
                <div style={{ marginTop: "clamp(24px,3.4vh,40px)", display: "flex", flexWrap: "wrap", gap: "clamp(20px,2.6vh,30px) clamp(28px,3.6vw,56px)" }}>
                  {r.metrics.slice(0, 5).map((mm, k) => (
                    <Rise key={k} on={on} kind="item" order={k} delay={200} style={{ minWidth: 130 }}>
                      <div style={{ height: 1, background: tone.hair }} />
                      <div style={{ ...T.label, fontSize: 10.5, color: tone.mute, marginTop: 12 }}>{mm.label}</div>
                      <div style={{ fontSize: "clamp(20px,2vw,30px)", fontWeight: 700, letterSpacing: "-0.02em", marginTop: 8, color: "#fff" }}>{mm.value}</div>
                    </Rise>
                  ))}
                </div>
              )}
            </div>
            {bImg && <Rise on={on} kind="media"><MediaFill src={bImg} on={on} style={{ height: "clamp(300px, 56vh, 560px)", border: `1px solid ${tone.hair}` }}>{r.media && r.media.label && <div style={{ position: "absolute", top: "clamp(14px,2vw,22px)", left: "clamp(14px,2vw,22px)", ...T.label, fontSize: 11, color: "rgba(255,255,255,0.9)" }}>{r.media.label}</div>}</MediaFill></Rise>}
          </div>
        </Beat>
      );
    }
    // state beat
    const st = b.state;
    return (
      <Beat maxW={1240}>
        <div style={{ display: "grid", gridTemplateColumns: bImg ? "minmax(0,0.95fr) minmax(0,1.05fr)" : "1fr", gap: "clamp(28px,4vw,72px)", alignItems: "center" }}>
          <div>
            {Header(on)}
            <Rise on={on} kind="eyebrow" delay={140}><div style={{ ...T.label, fontSize: 12, color: tone.accent, marginTop: "clamp(20px,2.6vh,32px)" }}>{st.kicker}</div></Rise>
            {StateBody(st, on)}
          </div>
          {bImg && <Rise on={on} kind="media"><MediaFill src={bImg} on={on} style={{ height: "clamp(300px, 58vh, 580px)", border: `1px solid ${tone.hair}` }} /></Rise>}
        </div>
      </Beat>
    );
  };
  return <SectionPanel tone={tone} count={beats.length} local={local} active={active} reduce={reduce} render={render} />;
}
CMProject.beats = projectBeats;
CMProject.tone = TONES.ink;

// ════════════════════════════════════════════════════════════════════════════
// SECTION — CAPITAL  (Snapshot · [Context] · [Securities])
// Deterministic reveal: geometry reserved → numbers → bar fills L→R → labels.
// ════════════════════════════════════════════════════════════════════════════
function capitalBeats({ capital }) {
  const c = capital || {};
  const beats = ["snapshot"];
  if (c.intro || (c.notes && c.notes.length) || c.fundingStatus) beats.push("context");
  if (c.securities && c.securities.length) beats.push("securities");
  return beats;
}
function OwnershipBar({ segments, on, reduce }) {
  const palette = [EM, "#5c7a96", "#7f8ca1", "#9aa6b8", "#b7c0cd", "#d5dbe3", "#eef1f5"];
  return (
    <div>
      {/* Bar reserves full height/width immediately; segments expand L→R once. */}
      <div style={{ position: "relative", height: "clamp(52px, 6vw, 74px)", borderRadius: 14, overflow: "hidden", background: "rgba(255,255,255,0.06)", display: "flex" }}>
        {segments.map((s, i) => (
          <div key={i} style={{ width: (reduce || on) ? `${Math.min(s.pct, 100)}%` : "0%", background: palette[i % palette.length], transition: reduce ? "none" : `width 900ms ${EASE} ${300 + i * 130}ms`, boxShadow: "inset -2px 0 0 #05070d" }} />
        ))}
      </div>
      {/* Labels appear only AFTER the bar completes. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "clamp(18px,2.4vh,24px) clamp(30px,4vw,60px)", marginTop: "clamp(20px,2.6vh,28px)" }}>
        {segments.map((s, i) => (
          <Rise key={i} on={on} kind="stat" order={i} delay={300 + segments.length * 130 + 120}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ height: 11, width: 11, borderRadius: 3, background: palette[i % palette.length], flexShrink: 0 }} />
              <span style={{ fontSize: "clamp(24px,2.6vw,38px)", fontWeight: 700, letterSpacing: "-0.02em", color: "#fff", fontVariantNumeric: "tabular-nums" }}>{s.pct}%</span>
            </div>
            <div style={{ ...T.label, fontSize: 11, color: "#8b97a6", marginTop: 8, textTransform: "capitalize", letterSpacing: "0.08em" }}>{s.label}</div>
          </Rise>
        ))}
      </div>
    </div>
  );
}
export function CMCapital({ capital, active, local, reduce }) {
  const tone = TONES.ink;
  const c = capital || {};
  const beats = capitalBeats({ capital });
  const segs = c.ownership || [];
  const primary = c.figures || [];

  const Snapshot = (on) => (
    <Beat maxW={1240}>
      <Eyebrow on={on} color={tone.accent}>{c.eyebrow || "Capital"}</Eyebrow>
      {c.heroStat && <Rise on={on} kind="copy"><div style={{ fontSize: "clamp(20px,2.4vw,34px)", fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.2, color: "#fff", marginTop: "clamp(14px,2vh,22px)", borderLeft: `3px solid ${tone.accent}`, paddingLeft: 16, maxWidth: "26ch" }}>{c.heroStat}</div></Rise>}
      {primary.length > 0 && (
        <div style={{ marginTop: "clamp(30px,4.5vh,58px)", display: "flex", flexWrap: "wrap", gap: "clamp(28px,4vw,72px)" }}>
          {primary.slice(0, 3).map((f, i) => (
            <div key={i} style={{ minWidth: "clamp(160px, 16vw, 240px)" }}>
              <Rise on={on} kind="stat" order={i}><ConfCountUp value={f.value} run={on} style={{ display: "block", fontSize: "clamp(36px,5vw,76px)", fontWeight: 700, letterSpacing: "-0.035em", lineHeight: 1.0, color: "#fff", whiteSpace: "nowrap" }} /></Rise>
              <DrawRule on={on} color={tone.accent} delay={260 + i * 120} style={{ marginTop: "clamp(12px,1.6vh,20px)" }} />
              <div style={{ ...T.label, fontSize: 12, color: tone.mute, marginTop: 14, textTransform: f.cap ? "capitalize" : "uppercase" }}>{f.label}</div>
            </div>
          ))}
        </div>
      )}
      {segs.length >= 2 && (
        <div style={{ marginTop: "clamp(34px,5vh,64px)" }}>
          <Rise on={on} kind="copy"><div style={{ ...T.label, fontSize: 11.5, color: tone.mute, marginBottom: "clamp(16px,2.2vh,24px)" }}>Ownership</div></Rise>
          <OwnershipBar segments={segs} on={on} reduce={reduce} />
        </div>
      )}
    </Beat>
  );

  const Context = (on) => (
    <Beat maxW={1120}>
      <Eyebrow on={on} color={tone.accent}>Capital · Context</Eyebrow>
      {c.fundingStatus && <Heading on={on} size="h2" delay={110} color="#fff" style={{ marginTop: "clamp(16px,2vh,24px)", maxWidth: "20ch" }}>{c.fundingStatus}</Heading>}
      {c.intro && <Lead on={on} order={1} color={tone.dim} style={{ marginTop: "clamp(18px,2.4vh,28px)", maxWidth: "60ch" }}>{c.intro}</Lead>}
      {c.notes && c.notes.length > 0 && (
        <div style={{ marginTop: "clamp(28px,3.6vh,44px)", display: "flex", flexWrap: "wrap", gap: "18px 44px" }}>
          {c.notes.map((n, i) => (
            <Rise key={i} on={on} kind="item" order={i} delay={220} style={{ maxWidth: "42ch" }}>
              <div style={{ ...T.label, fontSize: 10, color: tone.accent }}>{n.label}</div>
              <div style={{ fontSize: 15.5, fontWeight: 600, color: tone.dim, marginTop: 6, lineHeight: 1.4 }}>{n.value}</div>
            </Rise>
          ))}
        </div>
      )}
      {c.partnerships && c.partnerships.length > 0 && (
        <div style={{ marginTop: "clamp(28px,3.6vh,44px)" }}>
          <div style={{ ...T.label, fontSize: 11, color: tone.mute, marginBottom: 14 }}>Strategic partnerships</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {c.partnerships.map((p, i) => <Rise key={i} on={on} kind="item" order={i} delay={200}><span style={{ display: "inline-block", fontSize: 14.5, fontWeight: 600, color: tone.dim, background: "rgba(255,255,255,0.05)", border: `1px solid ${tone.hair}`, borderRadius: 14, padding: "11px 18px" }}>{p}</span></Rise>)}
          </div>
        </div>
      )}
    </Beat>
  );

  const Securities = (on) => (
    <Beat maxW={1000}>
      <Eyebrow on={on} color={tone.accent}>Capital · Securities</Eyebrow>
      <div style={{ marginTop: "clamp(28px,4vh,52px)" }}>
        {c.securities.map((s, i) => (
          <Rise key={i} on={on} kind="item" order={i} delay={180} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 24, alignItems: "baseline", padding: "clamp(16px,2.2vh,24px) 0", borderTop: `1px solid ${tone.hair}` }}>
            <div>
              <div style={{ fontSize: "clamp(17px,1.6vw,22px)", fontWeight: 700, color: "#fff", letterSpacing: "-0.01em" }}>{s.label}</div>
              {s.detail && <div style={{ fontSize: 14, color: tone.mute, marginTop: 6, lineHeight: 1.4 }}>{s.detail}</div>}
            </div>
            <div style={{ fontSize: "clamp(20px,2.2vw,32px)", fontWeight: 700, color: "#fff", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{s.value}</div>
          </Rise>
        ))}
      </div>
    </Beat>
  );

  const render = (i, on) => {
    const b = beats[i];
    if (b === "snapshot") return Snapshot(on);
    if (b === "context") return Context(on);
    return Securities(on);
  };
  return <SectionPanel tone={tone} count={beats.length} local={local} active={active} reduce={reduce} render={render} />;
}
CMCapital.beats = capitalBeats;
CMCapital.tone = TONES.ink;

// ════════════════════════════════════════════════════════════════════════════
// SECTION — LEADERSHIP  (Featured · [Team])
// ════════════════════════════════════════════════════════════════════════════
function leadershipBeats({ leadership }) {
  const L = leadership || {};
  if (!L.featured) return [];
  const beats = ["featured"];
  if (L.supporting && L.supporting.length) beats.push("team");
  return beats;
}
function Portrait({ src, initials, on, aspect = "4 / 5", radius = CM.radPanel, mono = "clamp(48px,6vw,96px)", tone }) {
  const reduce = prefersReduce();
  const shown = reduce || on;
  return (
    <div style={{ position: "relative", width: "100%", aspectRatio: aspect, borderRadius: radius, overflow: "hidden", background: src ? "rgba(18,22,29,0.05)" : `linear-gradient(158deg, ${EM}24, ${EM}06)`, border: `1px solid ${tone.hair}` }}>
      {src ? <img src={src} alt="" loading="lazy" decoding="async" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transform: shown ? "scale(1)" : "scale(1.08)", opacity: shown ? 1 : 0, transition: reduce ? "none" : `transform 1000ms ${EASE_MEDIA}, opacity 800ms ${EASE_MEDIA}` }} />
        : <div aria-hidden style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: EM_TEXT, fontWeight: 700, fontSize: mono, letterSpacing: "-0.03em" }}>{initials}</div>}
    </div>
  );
}
export function CMLeadership({ leadership, active, local, reduce }) {
  const tone = TONES.sheet;
  const L = leadership || {};
  const beats = leadershipBeats({ leadership });
  if (!beats.length) return null;
  const f = L.featured;
  const supporting = L.supporting || [];
  const teamHasPhotos = supporting.some((m) => m && m.photo);

  const Featured = (on) => (
    <Beat maxW={1240}>
      <Eyebrow on={on} color={tone.accent}>{L.eyebrow || "Leadership"}</Eyebrow>
      <Heading on={on} size="h1" delay={90} color={tone.fg} style={{ marginTop: "clamp(14px,2vh,22px)", maxWidth: "18ch" }}>{L.title || "The people creating value"}</Heading>
      <div style={{ display: "grid", gridTemplateColumns: f.photo ? "minmax(200px, 320px) 1fr" : "1fr", gap: "clamp(28px,4.6vw,72px)", alignItems: "center", marginTop: "clamp(30px,4.4vh,60px)" }}>
        {f.photo && <Rise on={on} kind="media"><Portrait src={f.photo} initials={f.initials} on={on} tone={tone} mono="clamp(64px,9vw,132px)" /></Rise>}
        <div>
          <Rise on={on} kind="eyebrow" delay={220}><div style={{ ...T.label, fontSize: 11.5, color: tone.accent }}>{L.companyShort ? `Leading ${L.companyShort}` : "Leading the company"}</div></Rise>
          <Heading on={on} size="h2" delay={300} color={tone.fg} style={{ marginTop: 12 }}>{f.name}</Heading>
          <Rise on={on} kind="copy" delay={400}><div style={{ fontSize: "clamp(16px,1.5vw,20px)", fontWeight: 700, color: tone.dim, marginTop: 12 }}>{f.role}</div></Rise>
          {f.bio && <Rise on={on} kind="copy" order={1} delay={400}><div style={{ ...T.lead, color: tone.dim, marginTop: "clamp(16px,2.2vh,26px)", maxWidth: "54ch" }}>{f.bio}</div></Rise>}
        </div>
      </div>
    </Beat>
  );

  const Team = (on) => (
    <Beat align="top" maxW={1240} pad="clamp(84px, 12vh, 140px) clamp(28px, 5vw, 76px)">
      <Eyebrow on={on} color={tone.accent}>{teamHasPhotos ? "The team" : `Board & management · ${supporting.length}`}</Eyebrow>
      <div style={{ marginTop: "clamp(28px,3.6vh,48px)" }}>
        {teamHasPhotos ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(clamp(140px, 16vw, 190px), 1fr))", gap: "clamp(24px,3vw,38px) clamp(18px,2.2vw,32px)" }}>
            {supporting.map((m, i) => (
              <Rise key={i} on={on} kind="item" order={Math.min(i, 10)} delay={180}>
                <Portrait src={m.photo} initials={m.initials} on={on} aspect="1 / 1" radius={CM.radMedia} mono="clamp(30px,3.4vw,44px)" tone={tone} />
                <div style={{ fontSize: "clamp(15px,1.1vw,17px)", fontWeight: 700, letterSpacing: "-0.015em", marginTop: 14, lineHeight: 1.2 }}>{m.name}</div>
                <div style={{ fontSize: "clamp(12.5px,0.95vw,13.5px)", fontWeight: 600, color: tone.dim, marginTop: 5, lineHeight: 1.35 }}>{m.role}</div>
              </Rise>
            ))}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(clamp(240px, 27vw, 320px), 1fr))", gap: "0 clamp(32px,4vw,64px)" }}>
            {supporting.map((m, i) => (
              <Rise key={i} on={on} kind="item" order={Math.min(i, 10)} delay={160}>
                <div style={{ borderTop: `1px solid ${tone.hair}`, padding: "clamp(16px,2vh,22px) 0" }}>
                  <div style={{ fontSize: "clamp(18px,1.7vw,23px)", fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.15 }}>{m.name}</div>
                  <div style={{ fontSize: "clamp(13px,1vw,14.5px)", fontWeight: 600, color: tone.dim, marginTop: 6, lineHeight: 1.35 }}>{m.role}</div>
                </div>
              </Rise>
            ))}
          </div>
        )}
      </div>
    </Beat>
  );

  const render = (i, on) => (beats[i] === "featured" ? Featured(on) : Team(on));
  return <SectionPanel tone={tone} count={beats.length} local={local} active={active} reduce={reduce} render={render} />;
}
CMLeadership.beats = leadershipBeats;
CMLeadership.tone = TONES.sheet;

// ════════════════════════════════════════════════════════════════════════════
// SECTION — WHY INVEST  (one argument per beat · Edge + Catalyst finale)
// ════════════════════════════════════════════════════════════════════════════
function whyBeats({ data }) {
  const d = data || {};
  const reasons = d.reasons || [];
  const beats = reasons.map((r, i) => ({ type: "reason", r, i }));
  if ((d.advantages && d.advantages.length) || (d.catalysts && d.catalysts.length)) beats.push({ type: "finale" });
  return beats;
}
export function CMWhyInvest({ data, active, local, reduce }) {
  const tone = TONES.ink;
  const d = data || {};
  const beats = whyBeats({ data });
  if (!beats.length) return null;
  const total = beats.length;
  const reasonsN = (d.reasons || []).length;

  const render = (i, on) => {
    const b = beats[i];
    if (b.type === "reason") {
      const r = b.r;
      return (
        <Beat maxW={1120}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
            <Eyebrow on={on} color={tone.accent}>{d.eyebrow || "Why Invest"}</Eyebrow>
            <Rise on={on} kind="eyebrow"><div style={{ ...T.label, fontSize: 12, color: tone.mute, fontVariantNumeric: "tabular-nums" }}>{String(b.i + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</div></Rise>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "clamp(56px, 8vw, 120px) 1fr", gap: "clamp(20px,3vw,48px)", alignItems: "start", marginTop: "clamp(28px,4vh,54px)" }}>
            <Rise on={on} kind="heading"><div style={{ fontSize: "clamp(30px,4vw,60px)", fontWeight: 700, color: tone.accent, letterSpacing: "-0.02em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{String(b.i + 1).padStart(2, "0")}</div></Rise>
            <div>
              <Heading on={on} size="h1" delay={90} color="#fff" style={{ maxWidth: "20ch" }}>{r.reason}</Heading>
              <DrawRule on={on} color={tone.accent} delay={360} w="clamp(80px, 16%, 200px)" h={2} style={{ marginTop: "clamp(18px,2.4vh,26px)" }} />
              {r.evidence && <Lead on={on} order={1} color={tone.dim} style={{ marginTop: "clamp(18px,2.4vh,26px)", maxWidth: "58ch" }}>{r.evidence}</Lead>}
              {r.standsOutBecause && <Rise on={on} kind="copy" order={2}><div style={{ fontSize: "clamp(14px,1.05vw,16px)", color: tone.mute, marginTop: 16, maxWidth: "56ch", lineHeight: 1.5, paddingLeft: 16, borderLeft: `2px solid ${EM}66` }}>{r.standsOutBecause}</div></Rise>}
            </div>
          </div>
        </Beat>
      );
    }
    // finale — Competitive Edge + Next Catalyst
    const advantages = d.advantages || [];
    const catalysts = d.catalysts || [];
    return (
      <Beat maxW={1240} align="center">
        <Eyebrow on={on} color={tone.accent}>{d.eyebrow || "Why Invest"} · The case</Eyebrow>
        <div style={{ display: "grid", gridTemplateColumns: (advantages.length && catalysts.length) ? "1fr 1fr" : "1fr", gap: "clamp(30px,5vw,80px)", marginTop: "clamp(28px,4vh,54px)" }}>
          {advantages.length > 0 && (
            <div>
              <Rise on={on} kind="heading"><div style={{ ...T.h2, color: "#fff" }}>Competitive edge</div></Rise>
              <div style={{ marginTop: "clamp(18px,2.4vh,28px)" }}>
                {advantages.slice(0, 5).map((a, k) => (
                  <Rise key={k} on={on} kind="item" order={k} delay={220} style={{ display: "flex", gap: 14, borderTop: `1px solid ${tone.hair}`, padding: "clamp(14px,1.8vh,20px) 0" }}>
                    <span style={{ width: 7, height: 7, borderRadius: 2, background: tone.accent, marginTop: "0.55em", flexShrink: 0 }} />
                    <div style={{ fontSize: "clamp(15px,1.15vw,18px)", color: tone.dim, lineHeight: 1.4, fontWeight: 600 }}>{a}</div>
                  </Rise>
                ))}
              </div>
            </div>
          )}
          {catalysts.length > 0 && (
            <div>
              <Rise on={on} kind="heading" delay={120}><div style={{ ...T.h2, color: "#fff" }}>Next catalyst</div></Rise>
              <div style={{ marginTop: "clamp(18px,2.4vh,28px)" }}>
                {catalysts.slice(0, 5).map((c, k) => (
                  <Rise key={k} on={on} kind="item" order={k} delay={280} style={{ display: "grid", gridTemplateColumns: "clamp(84px,12vw,150px) 1fr", gap: "clamp(14px,2vw,28px)", borderTop: `1px solid ${tone.hair}`, padding: "clamp(16px,2.2vh,24px) 0", alignItems: "baseline" }}>
                    <div style={{ fontSize: "clamp(13px,1vw,15px)", fontWeight: 700, color: tone.accent }}>{c.timing}</div>
                    <div>
                      <div style={{ fontSize: "clamp(16px,1.4vw,21px)", fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>{c.label}</div>
                      {c.impact && <div style={{ fontSize: "clamp(13px,1vw,15px)", color: tone.mute, marginTop: 8, lineHeight: 1.45, maxWidth: "48ch" }}>{c.impact}</div>}
                    </div>
                  </Rise>
                ))}
              </div>
            </div>
          )}
        </div>
      </Beat>
    );
  };
  return <SectionPanel tone={tone} count={total} local={local} active={active} reduce={reduce} render={render} />;
}
CMWhyInvest.beats = whyBeats;
CMWhyInvest.tone = TONES.ink;

// ════════════════════════════════════════════════════════════════════════════
// SECTION — FOLLOW  (product moment: QR + iPhone frame with the real profile)
// ════════════════════════════════════════════════════════════════════════════
export function CMFollow({ data, active, local, reduce, armed }) {
  const tone = TONES.ink;
  const d = data || {};
  const on = active;
  const bg = d.bg || `radial-gradient(1200px 560px at 82% -8%, ${EM}22, transparent), ${tone.bg}`;
  return (
    <div style={{ position: "absolute", inset: 0, background: bg, color: "#fff", fontFamily: FONT, overflow: "hidden" }}>
      <Beat maxW={1240} style={{ position: "absolute" }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "clamp(32px,6vw,90px)", alignItems: "center" }}>
          <div>
            <Eyebrow on={on} color={tone.accent}>{d.eyebrow || "Continue on Passport"}</Eyebrow>
            <Heading on={on} size="xl" delay={90} color="#fff" style={{ marginTop: "clamp(14px,2vh,22px)", maxWidth: "15ch" }}>{d.headline}</Heading>
            {d.body && <Lead on={on} order={1} color={tone.dim} style={{ marginTop: "clamp(16px,2.2vh,26px)", maxWidth: "42ch" }}>{d.body}</Lead>}
            {d.qr && (
              <Rise on={on} kind="media" delay={280}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 18, marginTop: "clamp(24px,3.2vh,40px)" }}>
                  <div style={{ background: "#fff", borderRadius: 20, padding: "clamp(12px,1.4vw,18px)", boxShadow: "0 30px 70px -44px rgba(0,0,0,0.7)" }}>
                    <div style={{ height: "clamp(120px,15vw,168px)", width: "clamp(120px,15vw,168px)" }} dangerouslySetInnerHTML={{ __html: d.qr }} />
                  </div>
                  <div style={{ ...T.label, fontSize: 12.5, color: "#fff", letterSpacing: "0.12em" }}>{d.qrLabel || "Scan to follow"}</div>
                </div>
              </Rise>
            )}
          </div>
          {/* iPhone device frame showing the REAL Passport profile via iframe (no code coupling). */}
          <Rise on={on} kind="media" delay={220}>
            <div className={reduce ? "" : "cm-float"} style={{ position: "relative", width: "clamp(240px, 26vw, 320px)", aspectRatio: "9 / 19.3", borderRadius: 46, background: "#0a0a0c", padding: 11, boxShadow: "0 60px 120px -50px rgba(0,0,0,0.75), 0 0 0 2px rgba(255,255,255,0.06) inset" }}>
              <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 36, overflow: "hidden", background: "#fff" }}>
                {/* dynamic island */}
                <div style={{ position: "absolute", top: 9, left: "50%", transform: "translateX(-50%)", width: "34%", height: 22, background: "#0a0a0c", borderRadius: 99, zIndex: 3 }} />
                {(armed && d.profileUrl)
                  ? <iframe title="Passport profile" src={d.profileUrl} loading="lazy" scrolling="no" style={{ position: "absolute", top: -46, left: 0, width: "100%", height: "calc(100% + 46px)", border: "none", background: "#fff" }} />
                  : <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "#f2efe8" }}>{/* fallback */}</div>}
                {/* top fade so the clipped app chrome reads as bezel, not a cut */}
                <div aria-hidden style={{ position: "absolute", top: 0, left: 0, right: 0, height: 30, background: "linear-gradient(#fff, rgba(255,255,255,0))", pointerEvents: "none", zIndex: 2 }} />
                {/* glass sheen */}
                <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(120deg, rgba(255,255,255,0.14) 0%, transparent 30%)", borderRadius: 36 }} />
              </div>
            </div>
          </Rise>
        </div>
      </Beat>
    </div>
  );
}
CMFollow.beats = () => [0];
CMFollow.tone = TONES.ink;

// ════════════════════════════════════════════════════════════════════════════
// SECTION — END-CAP  (closing branded frame)
// ════════════════════════════════════════════════════════════════════════════
export function CMEndCap({ name, ticker, active }) {
  const raw = (typeof EM === "string" ? EM.trim() : "");
  const accent = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw) || /^rgb/i.test(raw) ? raw : "#8a95a3";
  const grad = `linear-gradient(100deg, ${accent} 0%, ${accent}bb 24%, #e4ebf1 48%, ${accent}cc 70%, ${accent} 100%)`;
  const nm = (name && String(name).trim()) || "";
  return (
    <div style={{ position: "absolute", inset: 0, background: CM.ink, overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", fontFamily: FONT }}>
      <div aria-hidden className="cm-endcap-glow" style={{ position: "absolute", inset: "-25%", background: `radial-gradient(45% 45% at 50% 52%, ${accent}2b, transparent 68%)`, pointerEvents: "none" }} />
      <div style={{ position: "relative", width: "100%", textAlign: "center" }}>
        <div className="cm-endcap-type" style={{ display: "inline-block", whiteSpace: "nowrap", fontSize: "clamp(72px, 20vw, 380px)", fontWeight: 700, letterSpacing: "-0.05em", lineHeight: 0.9, backgroundImage: grad, backgroundSize: "230% 100%", backgroundPosition: "0% 50%", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent", padding: "0.08em 0.06em" }}>{nm}</div>
      </div>
      {ticker && <div style={{ position: "relative", marginTop: "clamp(14px,2vh,28px)", ...T.label, fontSize: 12.5, color: CM.mute, letterSpacing: "0.26em" }}>{ticker}</div>}
    </div>
  );
}
CMEndCap.beats = () => [0];
CMEndCap.tone = TONES.ink;
