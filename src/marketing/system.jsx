// ─────────────────────────────────────────────────────────────────────────────
// Marketing design system.
//
// Deliberately inherits the product's own visual language (the Conference Mode
// deck in src/aiBrief/conferenceUI.jsx): Switzer type, the same clamp() ramp, the
// same cream "sheet" / "ink" tones, the same emerald accent and the same
// rise-and-resolve motion curve. The site therefore looks like the product rather
// than like a template dropped on top of it.
//
// ISOLATION: nothing here imports from the application. Every class is `mx-`
// prefixed and every style is local, so this surface can never affect the app.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef, useCallback } from "react";

// Graphite & white. The page itself carries no brand colour — the only colour on
// it comes from the product screens inside the device frames, which keep the app's
// own emerald. Everything else is ink, white and cool grey.
export const MX = {
  ink: "#0a0c0f",
  inkSoft: "#14181d",
  sheet: "#f5f6f7",
  sheetDeep: "#eaecef",
  paper: "#ffffff",
  text: "#0a0c0f",
  dim: "#545b66",
  mute: "#868d97",
  hair: "rgba(10,12,15,0.11)",
  onDark: "#f5f6f7",
  onDarkDim: "#b9c0c9",
  onDarkMute: "#7e868f",
  hairDark: "rgba(255,255,255,0.14)",
  // `em` is the page's one mark: ink on light surfaces, white on dark ones.
  em: "#0a0c0f",
  emDark: "#ffffff",
  emText: "#4d545e",
  emSoft: "#f0f1f3",
  steel: "#3d4754",
  maxW: 1240,
};

export const FONT =
  "'Switzer', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
export const SERIF = "'Instrument Serif', Georgia, 'Times New Roman', serif";
export const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/* ── reduced motion ──────────────────────────────────────────────────────── */

export function useReduce() {
  const [r, setR] = useState(() => {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (_) {
      return false;
    }
  });
  useEffect(() => {
    let mq;
    try {
      mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    } catch (_) {
      return;
    }
    const on = () => setR(mq.matches);
    mq.addEventListener ? mq.addEventListener("change", on) : mq.addListener(on);
    return () =>
      mq.removeEventListener ? mq.removeEventListener("change", on) : mq.removeListener(on);
  }, []);
  return r;
}

/* Coarse breakpoint hook — mobile gets a deliberately different composition, not
   a squeezed desktop one. */
export function useViewport() {
  const read = () => {
    const w = typeof window === "undefined" ? 1280 : window.innerWidth;
    return { w, mobile: w < 760, tablet: w >= 760 && w < 1100, desktop: w >= 1100 };
  };
  const [v, setV] = useState(read);
  useEffect(() => {
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setV(read()));
    };
    window.addEventListener("resize", on, { passive: true });
    return () => {
      window.removeEventListener("resize", on);
      cancelAnimationFrame(raf);
    };
  }, []);
  return v;
}

/* ── in-view reveal ──────────────────────────────────────────────────────── */

// ONE IntersectionObserver for every reveal on the page, not one per element.
// Callbacks are held in a WeakMap keyed by the observed node.
const revealCbs = new WeakMap();
let revealIO = null;

function revealObserver() {
  if (revealIO) return revealIO;
  if (typeof IntersectionObserver === "undefined") return null;
  revealIO = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const cb = revealCbs.get(e.target);
        if (cb) {
          cb();
          revealCbs.delete(e.target);
          revealIO.unobserve(e.target);
        }
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
  );
  return revealIO;
}

export function useInView(ref) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = revealObserver();
    // Fail visible: with no observer support, or in a hidden tab where callbacks
    // never fire, show the content rather than leave the page blank.
    if (!io || (typeof document !== "undefined" && document.hidden)) {
      setSeen(true);
      return;
    }
    revealCbs.set(el, () => setSeen(true));
    io.observe(el);
    return () => {
      revealCbs.delete(el);
      io.unobserve(el);
    };
  }, [ref, seen]);
  return seen;
}

const MOTION = {
  eyebrow: { y: 10, dur: 480, delay: 0, stagger: 60 },
  heading: { y: 30, dur: 620, delay: 60, stagger: 0, blur: 5 },
  copy: { y: 16, dur: 520, delay: 190, stagger: 90 },
  item: { y: 18, dur: 520, delay: 160, stagger: 70 },
  media: { y: 30, dur: 760, delay: 120, stagger: 0, scaleFrom: 0.965 },
  none: { y: 0, dur: 500, delay: 0, stagger: 0 },
};

/* One reveal vocabulary for the whole page: rise, and for headings a blur that
   resolves. Never bounces, never overshoots. */
export function Reveal({
  kind = "copy",
  order = 0,
  delay,
  as: Tag = "div",
  style,
  className = "",
  children,
}) {
  const ref = useRef(null);
  const reduce = useReduce();
  const seen = useInView(ref);
  const cfg = MOTION[kind] || MOTION.copy;
  const on = reduce || seen;
  const d = on ? (delay != null ? delay : cfg.delay) + order * (cfg.stagger || 0) : 0;
  const from = `translateY(${cfg.y}px)` + (cfg.scaleFrom ? ` scale(${cfg.scaleFrom})` : "");
  return (
    <Tag
      ref={ref}
      className={className}
      style={{
        opacity: on ? 1 : 0,
        transform: on ? "none" : from,
        filter: cfg.blur ? (on ? "blur(0px)" : `blur(${cfg.blur}px)`) : undefined,
        transition: reduce
          ? "none"
          : `opacity ${cfg.dur}ms ${EASE} ${d}ms, transform ${cfg.dur}ms ${EASE} ${d}ms, filter ${cfg.dur}ms ${EASE} ${d}ms`,
        willChange: on ? "auto" : "transform, opacity",
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}

/* ── scroll-driven sticky scenes ─────────────────────────────────────────── */

// LOCALHOST-ONLY preview switch, for reviewing a scroll-driven scene without
// having to hold a scroll position: /site?mxonly=<section>&mxp=<0..1> renders one
// section and pins every sticky track to the given progress. Inert in production.
export const DEV = (() => {
  try {
    const h = window.location.hostname;
    if (h !== "localhost" && h !== "127.0.0.1") return { only: null, p: null };
    const q = new URLSearchParams(window.location.search);
    const raw = q.get("mxp");
    const p = raw == null ? null : Math.max(0, Math.min(1, parseFloat(raw)));
    return { only: q.get("mxonly"), p: Number.isFinite(p) ? p : null };
  } catch (_) {
    return { only: null, p: null };
  }
})();


// ONE scroll listener for the whole page, not one per scene.
//
// Every sticky track subscribes to a single rAF-coalesced ticker. Each tick reads
// all subscribers' rects in one batch (one layout flush, not N), and a track that
// is entirely off-screen does no work and pushes no state — so at any moment only
// the one or two scenes actually on screen can cause a React render. Progress is
// also quantised, so slow scrolling doesn't re-render on every pixel.
const tickers = new Set();
let scheduled = false;
let listening = false;

function runTick() {
  scheduled = false;
  const vh = window.innerHeight || 1;
  tickers.forEach((fn) => fn(vh));
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(runTick);
}

function subscribe(fn) {
  tickers.add(fn);
  if (!listening) {
    listening = true;
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
  }
  fn(window.innerHeight || 1);   // synchronous first read — rAF never runs in a hidden tab
  return () => {
    tickers.delete(fn);
    if (tickers.size === 0 && listening) {
      listening = false;
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    }
  };
}

// Progress (0→1) of a tall "track" element passing the viewport. Drives every
// sticky product demonstration on the page. Short-circuited to a fixed resting
// value when the visitor prefers reduced motion.
export function useTrack(ref, { reduceValue = 0.5, steps = 200 } = {}) {
  const reduce = useReduce();
  const pinned = DEV.p;
  const [p, setP] = useState(reduce ? reduceValue : 0);
  const lastRef = useRef(-1);

  useEffect(() => {
    if (pinned != null) {
      setP(pinned);
      return;
    }
    if (reduce) {
      setP(reduceValue);
      return;
    }
    const measure = (vh) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // Entirely off screen: the last on-screen tick already left this scene at
      // its start or end value, so there is nothing to update.
      if (r.bottom <= 0 || r.top >= vh) return;
      const span = r.height - vh;
      const raw = span <= 0 ? (r.top <= vh * 0.5 ? 1 : 0) : -r.top / span;
      const clamped = raw < 0 ? 0 : raw > 1 ? 1 : raw;
      const q = Math.round(clamped * steps) / steps;
      if (q === lastRef.current) return;      // no visible change → no render
      lastRef.current = q;
      setP(q);
    };
    return subscribe(measure);
  }, [ref, reduce, reduceValue, pinned, steps]);

  return p;
}

// Map progress into a 0→1 ramp between `a` and `b`, with ease-out.
export const ramp = (p, a, b) => {
  if (b <= a) return p >= b ? 1 : 0;
  const t = (p - a) / (b - a);
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return 1 - Math.pow(1 - c, 3);
};
// Linear window, no easing — for opacity cross-fades.
export const win = (p, a, b) => {
  const t = (p - a) / (b - a || 1);
  return t < 0 ? 0 : t > 1 ? 1 : t;
};
// Pick an index from progress across n steps.
export const step = (p, n) => Math.max(0, Math.min(n - 1, Math.floor(p * n * 0.999)));
export const mix = (a, b, t) => a + (b - a) * t;

/* ── layout primitives ───────────────────────────────────────────────────── */

export function Section({
  tone = "sheet",
  id,
  children,
  className = "",
  style,
  pad = "clamp(96px, 13vh, 190px) 0",
}) {
  const dark = tone === "ink" || tone === "inkSoft";
  return (
    <section
      id={id}
      className={`mx-section ${className}`}
      data-tone={tone}
      style={{
        background: MX[tone] || tone,
        color: dark ? MX.onDark : MX.text,
        padding: pad,
        position: "relative",
        ...style,
      }}
    >
      {children}
    </section>
  );
}

export function Wrap({ children, className = "", style, width }) {
  return (
    <div
      className={className}
      style={{
        maxWidth: width || MX.maxW,
        margin: "0 auto",
        padding: "0 clamp(22px, 5vw, 64px)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Eyebrow({ children, color, style, order = 0 }) {
  return (
    <Reveal kind="eyebrow" order={order}>
      <div className="mx-label" style={{ color: color || MX.emText, display: "inline-flex", alignItems: "center", gap: 12, ...style }}>
        <span style={{ width: 22, height: 2, borderRadius: 2, background: "currentColor", opacity: 0.85 }} />
        {children}
      </div>
    </Reveal>
  );
}

export function Display({ children, className = "", style, delay }) {
  return (
    <Reveal kind="heading" delay={delay}>
      <h2 className={`mx-display ${className}`} style={style}>{children}</h2>
    </Reveal>
  );
}

export function H2({ children, className = "", style, delay }) {
  return (
    <Reveal kind="heading" delay={delay}>
      <h2 className={`mx-h2 ${className}`} style={style}>{children}</h2>
    </Reveal>
  );
}

export function Lead({ children, order = 0, style, className = "", dark }) {
  return (
    <Reveal kind="copy" order={order}>
      <p className={`mx-lead ${className}`} style={{ color: dark ? MX.onDarkDim : MX.dim, ...style }}>
        {children}
      </p>
    </Reveal>
  );
}

/* ── calls to action ─────────────────────────────────────────────────────── */

export function Cta({ children, href = "#claim", kind = "primary", dark = false, onClick, style }) {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    height: 54,
    padding: "0 26px",
    borderRadius: 999,
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: "-0.01em",
    textDecoration: "none",
    cursor: "pointer",
    border: "1px solid transparent",
    transition: `transform 240ms ${EASE}, background 240ms ${EASE}, border-color 240ms ${EASE}, color 240ms ${EASE}`,
    whiteSpace: "nowrap",
  };
  const skin =
    kind === "primary"
      ? dark
        ? { background: "#ffffff", color: MX.ink }
        : { background: MX.ink, color: "#ffffff" }
      : dark
      ? { background: "transparent", color: MX.onDark, borderColor: MX.hairDark }
      : { background: "transparent", color: MX.text, borderColor: "rgba(18,22,29,0.18)" };
  return (
    <a className="mx-cta" href={href} onClick={onClick} style={{ ...base, ...skin, ...style }}>
      {children}
    </a>
  );
}

/* ── device frames ───────────────────────────────────────────────────────── */

// Device widths are capped by viewport HEIGHT as well as width, so a sticky scene
// never grows taller than the stage it has to sit inside on a short laptop screen.
export const phoneWidth = (mobile) =>
  mobile ? "min(60vw, 250px, 30vh)" : "min(27vw, 320px, 31vh)";


// iPhone. Matches the frame the product itself uses in Conference Mode, so the
// device presentation on this page and in the booth deck are the same object.
export function Phone({ children, width = 320, style, className = "", shadow = true, glare = true }) {
  return (
    <div
      className={`mx-phone ${className}`}
      style={{
        position: "relative",
        width,
        aspectRatio: "9 / 19.3",
        borderRadius: "clamp(34px, 3.4vw, 46px)",
        background: "#0a0a0c",
        padding: "clamp(8px, 0.85vw, 11px)",
        boxShadow: shadow
          ? "0 60px 120px -50px rgba(4,8,14,0.55), 0 0 0 2px rgba(255,255,255,0.06) inset"
          : "0 0 0 2px rgba(255,255,255,0.06) inset",
        flex: "0 0 auto",
        ...style,
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          borderRadius: "clamp(26px, 2.7vw, 36px)",
          overflow: "hidden",
          background: "#fff",
          isolation: "isolate",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 9,
            left: "50%",
            transform: "translateX(-50%)",
            width: "32%",
            height: 20,
            background: "#0a0a0c",
            borderRadius: 99,
            zIndex: 6,
          }}
        />
        {children}
        {glare && (
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              zIndex: 7,
              background: "linear-gradient(118deg, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0) 32%)",
            }}
          />
        )}
      </div>
    </div>
  );
}

// iPad, landscape — the booth device.
export function Tablet({ children, style, className = "" }) {
  return (
    <div
      className={`mx-tablet ${className}`}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "4 / 3",
        borderRadius: "clamp(20px, 2vw, 30px)",
        background: "#0a0a0c",
        padding: "clamp(9px, 1vw, 15px)",
        boxShadow: "0 80px 150px -60px rgba(0,0,0,0.8), 0 0 0 2px rgba(255,255,255,0.07) inset",
        ...style,
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          borderRadius: "clamp(12px, 1.2vw, 18px)",
          overflow: "hidden",
          background: "#f3f1ec",
        }}
      >
        {children}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background: "linear-gradient(112deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 34%)",
          }}
        />
      </div>
    </div>
  );
}

// Desktop browser chrome — for the company dashboard.
export function Desktop({ children, label = "mineex.com/portal", style, className = "" }) {
  return (
    <div
      className={`mx-desktop ${className}`}
      style={{
        width: "100%",
        borderRadius: "clamp(12px, 1.1vw, 16px)",
        overflow: "hidden",
        background: "#fff",
        boxShadow: "0 70px 130px -60px rgba(4,8,14,0.55), 0 0 0 1px rgba(18,22,29,0.08)",
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 14px",
          background: "#f6f6f5",
          borderBottom: "1px solid rgba(18,22,29,0.07)",
        }}
      >
        {["#e5e5e4", "#e5e5e4", "#e5e5e4"].map((c, i) => (
          <span key={i} style={{ width: 9, height: 9, borderRadius: 99, background: c }} />
        ))}
        <span
          style={{
            marginLeft: 10,
            fontSize: 11,
            fontWeight: 600,
            color: MX.mute,
            background: "#fff",
            border: "1px solid rgba(18,22,29,0.07)",
            borderRadius: 6,
            padding: "3px 12px",
          }}
        >
          {label}
        </span>
      </div>
      <div style={{ position: "relative" }}>{children}</div>
    </div>
  );
}

/* ── global scoped styles ────────────────────────────────────────────────── */

export function MarketingStyles() {
  return (
    <style>{`
      .mx-root, .mx-root * { box-sizing: border-box; }
      .mx-root {
        font-family: ${FONT};
        background: ${MX.sheet};
        color: ${MX.text};
        -webkit-font-smoothing: antialiased;
        overflow-x: clip;
      }
      .mx-root h1, .mx-root h2, .mx-root h3, .mx-root p, .mx-root figure { margin: 0; }
      .mx-root ul { margin: 0; padding: 0; list-style: none; }
      .mx-root a { color: inherit; }
      .mx-root img { display: block; max-width: 100%; }
      .mx-root ::selection { background: ${MX.em}; color: #fff; }

      /* Type ramp — mirrors the product's Conference Mode ramp exactly. */
      .mx-display { font-size: clamp(40px, 6.6vw, 104px); font-weight: 700; letter-spacing: -0.042em; line-height: 0.98; }
      .mx-h1 { font-size: clamp(32px, 5vw, 76px); font-weight: 700; letter-spacing: -0.036em; line-height: 1.02; }
      .mx-h2 { font-size: clamp(28px, 3.7vw, 56px); font-weight: 700; letter-spacing: -0.03em; line-height: 1.06; }
      .mx-h3 { font-size: clamp(20px, 1.9vw, 28px); font-weight: 700; letter-spacing: -0.022em; line-height: 1.16; }
      .mx-lead { font-size: clamp(16.5px, 1.35vw, 21px); font-weight: 400; line-height: 1.52; letter-spacing: -0.006em; }
      .mx-body { font-size: clamp(14.5px, 1.02vw, 16.5px); font-weight: 400; line-height: 1.55; }
      .mx-label { font-size: 11.5px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; }
      .mx-serif { font-family: ${SERIF}; font-weight: 400; letter-spacing: -0.01em; }
      .mx-num { font-variant-numeric: tabular-nums; }

      .mx-cta:hover { transform: translateY(-1px); }
      .mx-cta:active { transform: translateY(0); }

      /* Sticky demonstration scenes. */
      /* A 30,000px page keeps every scene in the DOM. content-visibility lets the
         browser skip layout and paint for the tracks that are nowhere near the
         viewport; each track has an explicit height, so nothing shifts. */
      .mx-track { position: relative; content-visibility: auto; }
      .mx-stage { position: sticky; top: 0; height: 100svh; display: flex; align-items: center; overflow: hidden; }

      @keyframes mx-cue { 0%,100% { transform: translateY(0); opacity: .55 } 50% { transform: translateY(6px); opacity: 1 } }
      .mx-cue { animation: mx-cue 2.4s ease-in-out infinite; }
      @keyframes mx-drift { from { transform: scale(1) } to { transform: scale(1.07) } }
      .mx-drift { animation: mx-drift 24s ease-in-out infinite alternate; }
      @keyframes mx-pulse { 0% { transform: scale(1); opacity: .55 } 70%,100% { transform: scale(2.4); opacity: 0 } }
      .mx-pulse { animation: mx-pulse 2.2s cubic-bezier(0,0,0.2,1) infinite; }
      @keyframes mx-sheen { from { background-position: 0% 50% } to { background-position: 100% 50% } }
      .mx-sheen { animation: mx-sheen 16s ease-in-out infinite alternate; }
      @keyframes mx-scanline { 0% { transform: translateY(-100%) } 100% { transform: translateY(320%) } }
      .mx-scan { animation: mx-scanline 2.6s ${EASE} infinite; }

      .mx-noscroll { scrollbar-width: none; -ms-overflow-style: none; }
      .mx-noscroll::-webkit-scrollbar { display: none; }

      @media (prefers-reduced-motion: reduce) {
        .mx-root *, .mx-root *::before, .mx-root *::after {
          animation-duration: 0.001ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.001ms !important;
          scroll-behavior: auto !important;
        }
        /* Sticky scenes collapse to their content, and the scroll tracks that drove
           them collapse with them — otherwise the page keeps the empty scroll
           distance the animation used to need. */
        .mx-stage { position: relative; height: auto; }
        .mx-track { height: auto !important; }
      }
    `}</style>
  );
}
