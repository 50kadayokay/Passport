// ─────────────────────────────────────────────────────────────────────────────
// Presentation build of the MineEx investor app.
//
// The live app screens live in src/aiBrief/PassportProto.jsx, a ~16 MB module
// whose data is module-level singleton state (applyPP swaps it in place). Importing
// it here would (a) ship an 11 MB chunk to a marketing page and (b) make it
// impossible to show two different screens at once. So these are presentation
// components: the same layout, spacing, type, iconography and emerald accent as
// the shipped app, rebuilt small and stateless so the page can drive them from
// scroll.
//
// They render REAL content from a real published MineEx profile (see data.js).
// Nothing here is imported by the application.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import {
  Gem, MapPin, Mountain, TrendingUp, Layers, Activity, House, Pickaxe, Clock,
  PieChart, Users, Radio, Sparkles, Compass, MessageSquare, Star, User, Search,
  SlidersHorizontal, Plus, Check, ChevronLeft, ExternalLink, Play, Bell, Zap,
  ChevronRight, BadgeCheck, Image as ImageIcon, FileText, RotateCcw, Info,
  ArrowDownUp, ScanLine, ChevronDown, Newspaper,
} from "lucide-react";
import { EASE, useReduce } from "../system.jsx";
import { CO, PROJECTS, TEAM, RELEASES, DIRECTORY, IMG } from "../data.js";

// The product's own accent. These are app screens, so they keep the colour the
// app actually ships — the marketing page around them is monochrome by design, and
// the product is what supplies the colour.
const EM = "#2563eb";
const EM_TEXT = "#1d4ed8";
const EM_SOFT = "#eff6ff";

const APP_BG = "#f4f5f7";
const INK = "#0f172a";
const SLATE = "#64748b";
const MUTE = "#94a3b8";
const HAIR = "#e2e8f0";

/* Scales a fixed 375-wide app layout into whatever device frame it is dropped in,
   so the UI keeps real-app proportions at any device size. */
export function Fit({ base = 375, children, style }) {
  const box = useRef(null);
  const [s, setS] = useState(1);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setS(el.clientWidth / base);
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [base]);
  return (
    <div ref={box} style={{ position: "absolute", inset: 0, overflow: "hidden", ...style }}>
      <div
        style={{
          width: base,
          height: s ? `${100 / s}%` : "100%",
          transform: `scale(${s})`,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// Embeds the REAL app inside the phone: an iframe of the live app, scaled from a
// fixed logical width to fill the frame, with the guest "Get the app" banner
// cropped off the top. No app change and no deploy — the marketing side only
// frames and clips it, so the phone shows the actual product (real flip card,
// live data, real behaviour) and can never drift from the app.
export function LiveApp({ src, poster = null, crop = 50, base = 390, revealMs = 6000, style }) {
  const box = useRef(null);
  const [b, setB] = useState({ w: 0, h: 0 });
  const [ready, setReady] = useState(false);   // real app booted → fade the poster out
  // The app is a heavy SPA (~6s cold boot) and it's cross-origin, so we can't read
  // when it's actually painted. The instant poster (a matched mock) covers the whole
  // boot on a generous fixed timer; because it matches, the cross-fade is invisible.
  useEffect(() => {
    const t = setTimeout(() => setReady(true), revealMs);
    return () => clearTimeout(t);
  }, [revealMs]);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setB({ w: el.clientWidth, h: el.clientHeight });
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = b.w ? b.w / base : 0;
  const frameH = scale ? b.h / scale + crop : 0;   // unscaled iframe height, incl. cropped banner
  return (
    <div ref={box} style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#fff", ...style }}>
      {b.w > 0 && (
        <iframe
          src={src}
          title="MineEx app"
          scrolling="no"
          tabIndex={-1}
          aria-hidden="true"
          style={{ position: "absolute", top: -(crop * scale), left: 0, width: base, height: frameH, border: "none", transform: `scale(${scale})`, transformOrigin: "top left", background: "#fff", pointerEvents: "none", zIndex: 1 }}
        />
      )}
      {/* instant poster (a matched mock) covers the app's boot; fades out when ready */}
      {poster && (
        <div style={{ position: "absolute", inset: 0, zIndex: 2, opacity: ready ? 0 : 1, transition: "opacity .55s ease", pointerEvents: "none", background: APP_BG }}>
          {poster}
        </div>
      )}
    </div>
  );
}

/* ── chrome ──────────────────────────────────────────────────────────────── */

function StatusBarBase({ dark = false }) {
  const c = dark ? "#fff" : INK;
  return (
    <div style={{ height: 46, display: "flex", alignItems: "flex-end", justifyContent: "space-between", padding: "0 22px 6px", color: c, flex: "0 0 auto" }}>
      <span style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: "-0.01em" }}>9:41</span>
      <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <svg width="17" height="11" viewBox="0 0 17 11" fill={c}><rect x="0" y="7" width="3" height="4" rx="1" /><rect x="4.5" y="5" width="3" height="6" rx="1" /><rect x="9" y="2.5" width="3" height="8.5" rx="1" /><rect x="13.5" y="0" width="3" height="11" rx="1" /></svg>
        <svg width="15" height="11" viewBox="0 0 15 11" fill={c}><path d="M7.5 10.5 0 3.2A10.6 10.6 0 0 1 15 3.2Z" opacity=".95" /></svg>
        <svg width="24" height="11" viewBox="0 0 24 11"><rect x="0.5" y="0.5" width="20" height="10" rx="3" fill="none" stroke={c} strokeOpacity=".4" /><rect x="2" y="2" width="15" height="7" rx="1.6" fill={c} /><rect x="21.6" y="3.6" width="1.6" height="3.8" rx=".8" fill={c} fillOpacity=".4" /></svg>
      </span>
    </div>
  );
}

const NAV = [
  { id: "today", Icon: Sparkles },
  { id: "explore", Icon: Compass },
  { id: "messages", Icon: MessageSquare },
  { id: "following", Icon: Star },
  { id: "profile", Icon: User },
];

function BottomNavBase({ active = "today" }) {
  return (
    <div style={{ flex: "0 0 auto", height: 76, background: "#fff", borderTop: `1px solid ${HAIR}`, display: "flex", alignItems: "flex-start", paddingTop: 14 }}>
      {NAV.map(({ id, Icon }) => (
        <div key={id} style={{ flex: 1, display: "grid", placeItems: "center" }}>
          <Icon size={22} strokeWidth={1.9} color={active === id ? INK : MUTE} />
        </div>
      ))}
    </div>
  );
}

// Vertical shell every phone screen sits in.
export function AppShell({ children, nav = "today", bg = APP_BG, dark = false, showNav = true }) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: bg, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", color: INK }}>
      <StatusBar dark={dark} />
      <div className="mx-noscroll" style={{ flex: 1, minHeight: 0, overflow: "hidden", position: "relative" }}>{children}</div>
      {showNav && <BottomNav active={nav} />}
    </div>
  );
}

/* ── shared bits ─────────────────────────────────────────────────────────── */

function Card({ children, style, pad = 0 }) {
  return <div style={{ background: "#fff", borderRadius: 18, padding: pad, ...style }}>{children}</div>;
}

export function FollowButton({ following, onToggle, wide = false, big = false }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        position: "relative",
        flex: wide ? "1 1 auto" : "0 0 auto",
        height: big ? 52 : 42,
        borderRadius: 999,
        border: following ? "1px solid transparent" : `1px solid ${HAIR}`,
        background: following ? EM : "#fff",
        color: following ? "#fff" : INK,
        fontSize: big ? 16 : 14.5,
        fontWeight: 700,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        cursor: "pointer",
        padding: "0 20px",
        transition: `background 380ms ${EASE}, color 260ms ${EASE}, border-color 260ms ${EASE}, transform 220ms ${EASE}`,
        transform: following ? "scale(1)" : "scale(1)",
        overflow: "hidden",
      }}
    >
      {following ? <Check size={big ? 19 : 16} strokeWidth={2.6} /> : <Plus size={big ? 19 : 16} strokeWidth={2.6} />}
      {following ? "Following" : "Follow"}
    </button>
  );
}

const FACT_ICON = { gem: Gem, pin: MapPin, mountain: Mountain, trend: TrendingUp, layers: Layers, activity: Activity };
const FACT_TINT = {
  gem: ["rgba(90,116,153,0.12)", "#5c7599"],
  pin: ["rgba(184,124,46,0.13)", "#b0762e"],
  mountain: ["rgba(59,130,246,0.11)", "#3b82f6"],
  trend: ["rgba(139,92,246,0.11)", "#8b5cf6"],
  layers: ["rgba(14,165,233,0.11)", "#0ea5e9"],
  activity: ["rgba(37,99,235,0.11)", "#2563eb"],
};

// Company-status fact-cell styling, ported from the app's identity grid: the
// category colour lives only in the icon + its faint container tint.
const ID_STYLE = {
  gem:      { Icon: Gem,        icBg: "rgba(90,116,153,0.12)", ic: "#5c7599" },
  pin:      { Icon: MapPin,     icBg: "rgba(184,124,46,0.13)", ic: "#b0762e" },
  mountain: { Icon: Mountain,   icBg: "rgba(37,99,235,0.11)",  ic: "#2563eb" },
  trend:    { Icon: TrendingUp, icBg: "rgba(99,91,201,0.12)",  ic: "#5b57c9" },
  layers:   { Icon: Layers,     icBg: "rgba(14,139,168,0.12)", ic: "#0e8ba8" },
  activity: { Icon: Activity,   icBg: "rgba(37,99,235,0.13)",  ic: "#2563eb" },
};

/* ── profile ─────────────────────────────────────────────────────────────── */

export const PROFILE_TABS = [
  { id: "overview", Icon: House },
  { id: "projects", Icon: Pickaxe },
  { id: "timeline", Icon: Clock },
  { id: "capital", Icon: PieChart },
  { id: "team", Icon: Users },
  { id: "updates", Icon: Radio },
];

function ProfileHeaderBase({ following, onFollow, compact = false }) {
  return (
    <div style={{ background: "#fff", padding: "6px 18px 0" }}>
      {!compact && <ChevronLeft size={24} color={INK} strokeWidth={2.2} style={{ marginLeft: -4 }} />}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: compact ? 4 : 10 }}>
        <img src={IMG.avatar} alt="" width={62} height={62} loading="lazy" style={{ width: 62, height: 62, borderRadius: 999, objectFit: "cover", flex: "0 0 auto" }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <h3 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 1.1, margin: 0 }}>{CO.name}</h3>
            <BadgeCheck size={17} color="#3b82f6" fill="#dbeafe" />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#2563eb" }}>{CO.website}</span>
            <ExternalLink size={11} color="#2563eb" />
          </div>
          <p style={{ fontSize: 13, color: SLATE, marginTop: 2 }}>{CO.slogan}</p>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <FollowButton following={following} onToggle={onFollow} wide />
        <button type="button" style={{ flex: 1, height: 42, borderRadius: 999, border: `1px solid ${HAIR}`, background: "#fff", fontSize: 14.5, fontWeight: 700, color: INK, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
          <MessageSquare size={15} strokeWidth={2.2} /> Message
        </button>
      </div>
    </div>
  );
}

function ProfileTabsBase({ tab = "overview" }) {
  return (
    <div style={{ background: "#fff", display: "flex", padding: "12px 12px 0", borderBottom: `1px solid ${HAIR}` }}>
      {PROFILE_TABS.map(({ id, Icon }) => {
        const on = id === tab;
        return (
          <div key={id} style={{ flex: 1, display: "grid", placeItems: "center", paddingBottom: 9, position: "relative" }}>
            <Icon size={19} strokeWidth={on ? 2.3 : 1.85} color={on ? INK : MUTE} />
            <span style={{ position: "absolute", left: "26%", right: "26%", bottom: 0, height: 2, borderRadius: 2, background: on ? INK : "transparent", transition: `background 300ms ${EASE}` }} />
          </div>
        );
      })}
    </div>
  );
}

/* ── Company Identity card — ported from the app's CompanyProfile ─────────────
   (src/aiBrief/PassportProto.jsx). A flip card that GROWS to fill the space
   between the tabs and the AI Brief: front = flagship photo + logo, back = the
   six-cell Company Status grid with equal (1fr) rows — which is what gives the
   tall, airy proportions. Auto-flips in the hero; elsewhere it rests on status. */
const ID_TICKERS = CO.listings.map(([ex, sym]) => ({ ex, sym }));
const ID_TK = ID_TICKERS.length <= 2 ? 13 : ID_TICKERS.length === 3 ? 11.5 : 10.5;
const BANNER = { tl: 0.52, bot: 0.42 };

function CompanyIdentityCard({ auto = false }) {
  const reduce = useReduce();
  const [flipped, setFlipped] = useState(!auto);   // rest on status unless auto-demoing
  useEffect(() => {
    if (!auto || reduce) { setFlipped(!auto); return; }
    setFlipped(false);
    let t;
    const step = (toBack) => { setFlipped(toBack); t = setTimeout(() => step(!toBack), toBack ? 4200 : 2200); };
    t = setTimeout(() => step(true), 1300);
    return () => clearTimeout(t);
  }, [auto, reduce]);

  const cells = CO.facts.map((f) => ({ label: f.label, value: f.value, live: f.live, ...(ID_STYLE[f.icon] || ID_STYLE.gem) }));

  return (
    <div style={{ flex: "1 1 auto", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ position: "relative", flex: "1 1 auto", minHeight: 0, display: "flex" }}>
        {/* soft shadow cast behind the card */}
        <div aria-hidden style={{ position: "absolute", inset: 0, borderRadius: 24, background: "#fff", boxShadow: "0 12px 30px -10px rgba(15,23,42,0.20)", zIndex: 0 }} />
        <div style={{ perspective: 1600, position: "relative", zIndex: 1, flex: 1, minWidth: 0 }}>
          <div style={{ position: "relative", height: "100%", transformStyle: "preserve-3d", WebkitTransformStyle: "preserve-3d", transition: "transform .85s cubic-bezier(.2,.75,.2,1)", transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}>

            {/* BACK — Company Status */}
            <div style={{ height: "100%", backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: "rotateY(180deg)", opacity: flipped ? 1 : 0, transition: "opacity .45s ease" }}>
              <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: 24, border: "1px solid #e2e8f0", background: "#fff" }}>
                {/* header banner — flagship photo behind COMPANY STATUS + tickers */}
                <div style={{ flex: "0 0 auto", position: "relative", overflow: "hidden", padding: "14px 18px 13px", background: "linear-gradient(180deg, #0b1220 0%, #0b1220 88%, #f4f7fb 100%)" }}>
                  <img src={IMG.status} alt="" aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 30%" }} />
                  <span aria-hidden style={{ position: "absolute", inset: 0, background: `radial-gradient(95% 150% at 15% 4%, rgba(11,18,32,${BANNER.tl}) 0%, rgba(11,18,32,0) 55%)` }} />
                  <span aria-hidden style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, rgba(11,18,32,0) 46%, rgba(11,18,32,${BANNER.bot}) 100%)` }} />
                  <span aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 18, background: "linear-gradient(180deg, rgba(244,247,251,0) 0%, #f4f7fb 100%)" }} />
                  <div style={{ position: "relative", zIndex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 6, height: 6, borderRadius: 999, background: "#f97316", boxShadow: "0 0 7px 1px rgba(249,115,22,0.9)" }} />
                        <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: "#fdb271", textShadow: "0 0 2px rgba(0,0,0,0.95), 0 1px 3px rgba(0,0,0,0.9)" }}>Company Status</span>
                      </div>
                      <button type="button" onClick={() => setFlipped(false)} aria-label="Show project photo" style={{ width: 24, height: 24, marginRight: -2, display: "grid", placeItems: "center", borderRadius: 999, border: "none", background: "transparent", color: "rgba(255,255,255,0.82)", cursor: "pointer" }}>
                        <RotateCcw size={13} strokeWidth={2.4} />
                      </button>
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <p style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.82)", textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>Trades As</p>
                      <div style={{ marginTop: 5, display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {ID_TICKERS.map((t, i) => (
                          <span key={i} style={{ display: "inline-flex", alignItems: "baseline", gap: 4, whiteSpace: "nowrap", padding: "3px 10px", borderRadius: 999, background: "rgba(255,255,255,0.13)", border: "1px solid rgba(255,255,255,0.34)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", boxShadow: "0 1px 3px rgba(0,0,0,0.16)" }}>
                            <span style={{ fontSize: ID_TK - 2.5, fontWeight: 700, color: "rgba(255,255,255,0.82)", letterSpacing: "0.03em", textShadow: "0 1px 2px rgba(0,0,0,0.45)" }}>{t.ex}</span>
                            <span style={{ fontSize: ID_TK - 0.5, fontWeight: 800, color: "#fff", letterSpacing: "-0.01em", textShadow: "0 1px 3px rgba(0,0,0,0.55)" }}>{t.sym}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                {/* six-cell grid — equal rows fill the remaining height */}
                <div style={{ flex: "1 1 auto", minHeight: 0, marginTop: -1, position: "relative", zIndex: 1, background: "linear-gradient(180deg,#f4f7fb,#eef3f9)", borderTop: "1px solid #e7ecf3", padding: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "repeat(3, 1fr)", gap: 6 }}>
                  {cells.map((c, i) => {
                    const Ic = c.Icon;
                    return (
                      <div key={i} style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 8, padding: "0 10px", background: "#fff", borderRadius: 10, border: "1px solid rgba(15,23,42,0.05)", boxShadow: "0 1px 1.5px rgba(15,23,42,0.03), inset 0 1px 0 rgba(255,255,255,0.9)" }}>
                        <span style={{ flexShrink: 0, width: 25, height: 25, borderRadius: 999, background: c.icBg, border: "1px solid rgba(15,23,42,0.045)", display: "grid", placeItems: "center", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)" }}>
                          <Ic size={12.5} strokeWidth={2.2} style={{ color: c.ic }} />
                        </span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <p style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "#94a3b8", lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.label}</p>
                          <p style={{ marginTop: 3, fontSize: 13.5, fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.1, color: "#0f172a", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                            {c.live && <span style={{ display: "inline-block", width: 5.5, height: 5.5, borderRadius: 999, background: "#3b82f6", marginRight: 5, verticalAlign: "middle", position: "relative", top: -1, boxShadow: "0 0 0 2px rgba(37,99,235,0.16)" }} />}
                            {c.value || "—"}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* FRONT — flagship photo + logo */}
            <button type="button" onClick={() => setFlipped(true)} aria-label="Show company status" style={{ position: "absolute", inset: 0, padding: 0, cursor: "pointer", borderRadius: 24, overflow: "hidden", border: "1px solid #e2e8f0", backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", pointerEvents: flipped ? "none" : "auto", opacity: flipped ? 0 : 1, transition: "opacity .45s ease" }}>
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg,#e8edf3,#dfe6ee)" }} />
              <img src={IMG.status} alt={CO.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
              <span style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0) 38%, rgba(0,0,0,0.30) 100%)" }} />
              <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
                <img src={IMG.logo} alt={CO.name} style={{ width: "85%", filter: "drop-shadow(0 3px 12px rgba(0,0,0,0.8))" }} />
              </span>
            </button>

          </div>
        </div>
      </div>
    </div>
  );
}

function AiBriefCard() {
  return (
    <button type="button" style={{ marginTop: 8, display: "block", width: "100%", textAlign: "left", overflow: "hidden", borderRadius: 24, border: "none", cursor: "pointer", padding: 16, background: "radial-gradient(135% 130% at 88% 8%, #7ad6f8 0%, rgba(122,214,248,0) 45%), linear-gradient(140deg, #1b4fd0 0%, #2f86e6 58%, #49b4f0 100%)", boxShadow: "0 20px 40px -20px rgba(31,79,208,0.7)", color: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(255,255,255,0.22)", display: "grid", placeItems: "center" }}><Zap size={15} color="#fff" strokeWidth={2.6} /></span>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.85)" }}>AI Brief</span>
      </div>
      <p style={{ marginTop: 10, fontSize: 17, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.1 }}>Explain Kingsmen in 60 Seconds</p>
      <p style={{ marginTop: 6, fontSize: 12, fontWeight: 500, lineHeight: 1.35, color: "rgba(255,255,255,0.8)" }}>AI-generated summary covering opportunity, risks, catalysts and project potential.</p>
    </button>
  );
}

function TabOverview({ flip = false }) {
  // Matches the app: the identity card grows to fill, AI Brief pinned below.
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", padding: "8px 20px 14px", minHeight: 0 }}>
      <CompanyIdentityCard auto={flip} />
      <AiBriefCard />
    </div>
  );
}

function TabProjects() {
  const p = PROJECTS[0];
  return (
    <div style={{ padding: "14px 12px 24px" }}>
      <p className="mx-label" style={{ color: "#c2410c", fontSize: 11, letterSpacing: "0.14em", padding: "0 4px" }}>Assets</p>
      <p style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em", padding: "6px 4px 0" }}>Projects</p>

      {/* project selector */}
      <div style={{ display: "flex", gap: 6, background: "#eef2f7", borderRadius: 14, padding: 4, marginTop: 14 }}>
        {PROJECTS.map((pr, i) => (
          <span key={pr.name} style={{ flex: 1, textAlign: "center", padding: "10px 8px", borderRadius: 11, fontSize: 14.5, fontWeight: 700, letterSpacing: "-0.02em", background: i === 0 ? EM : "transparent", color: i === 0 ? "#fff" : SLATE }}>{pr.name}</span>
        ))}
      </div>

      {/* flagship photo with carousel dots */}
      <div style={{ position: "relative", height: 190, borderRadius: 16, overflow: "hidden", marginTop: 12 }}>
        <img src={p.image} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 12, display: "flex", justifyContent: "center", gap: 5 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} style={{ width: i === 0 ? 16 : 5, height: 5, borderRadius: 999, background: i === 0 ? "#fff" : "rgba(255,255,255,0.55)" }} />
          ))}
        </div>
      </div>

      {/* project intelligence */}
      <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: EM_TEXT, margin: "20px 4px 10px" }}>Project Intelligence</p>
      <Card pad={"4px 16px 8px"}>
        {[["District", p.district], ["Stage", p.stage], ...p.snapshot].map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 14, padding: "12px 0", borderBottom: `1px solid #f1f5f9` }}>
            <span style={{ fontSize: 12.5, color: SLATE, flex: "0 0 auto" }}>{k}</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, textAlign: "right" }}>{v}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

// Impact level → [dot, text, chip-bg] — the app's own milestone weighting.
const IMPACT_TINT = {
  Transformational: ["#2563eb", "#1d4ed8", "#eff6ff"],
  High: ["#f59e0b", "#b45309", "#fffbeb"],
  Notable: ["#94a3b8", "#64748b", "#f1f5f9"],
};
const STORY_YEARS = ["2026", "2025", "2024", "2023"];

function TabTimeline() {
  return (
    <div style={{ padding: "14px 12px 24px" }}>
      <p className="mx-label" style={{ color: EM_TEXT, fontSize: 11, letterSpacing: "0.14em", padding: "0 4px" }}>Progress</p>
      <p style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em", padding: "6px 4px 0" }}>The Story So Far</p>

      {/* year filter rail */}
      <div style={{ display: "flex", gap: 8, marginTop: 14, padding: "0 4px" }}>
        <span style={{ width: 38, height: 38, borderRadius: 999, background: EM, display: "grid", placeItems: "center", flex: "0 0 auto" }}>
          <Gem size={17} color="#fff" fill="#fff" />
        </span>
        {STORY_YEARS.map((y, i) => (
          <span key={y} style={{ flex: 1, height: 38, borderRadius: 999, border: `1px solid ${i === 0 ? "rgba(37,99,235,0.35)" : HAIR}`, background: "#fff", display: "grid", placeItems: "center", fontSize: 14, fontWeight: 700, color: i === 0 ? INK : SLATE }}>{y}</span>
        ))}
      </div>

      {/* key-milestones header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "18px 4px 4px" }}>
        <Gem size={17} color={EM} fill={EM} />
        <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.02em" }}>Key Milestones</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: EM_TEXT, marginLeft: 4 }}>All-time · {RELEASES.length} highlights</span>
      </div>
      <div style={{ height: 1, background: HAIR, margin: "10px 4px 0" }} />

      <p style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.06em", color: MUTE, padding: "14px 4px 6px" }}>2026</p>
      <div style={{ position: "relative", paddingLeft: 26 }}>
        <span style={{ position: "absolute", left: 11, top: 10, bottom: 10, width: 2, background: HAIR, borderRadius: 2 }} />
        {RELEASES.map((r) => {
          const [dot, fg, bg] = IMPACT_TINT[r.impact] || IMPACT_TINT.Notable;
          return (
            <div key={r.date} style={{ position: "relative", marginBottom: 12 }}>
              <span style={{ position: "absolute", left: -25, top: 16, width: 24, height: 24, borderRadius: 999, background: "#eff6ff", display: "grid", placeItems: "center" }}>
                <Gem size={12} color={EM} fill={EM} />
              </span>
              <Card pad={"14px 14px 15px"}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: bg, borderRadius: 999, padding: "3px 9px" }}>
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: dot }} />
                    <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: fg }}>{r.impact}</span>
                  </span>
                  <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTE }}>{r.category}</span>
                  <ChevronRight size={16} color={MUTE} style={{ marginLeft: "auto" }} />
                </div>
                <p style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-0.02em", marginTop: 9, lineHeight: 1.3 }}>{r.headline}</p>
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TabCapital() {
  const c = CO.capital;
  return (
    <div style={{ padding: "14px 12px 24px" }}>
      <p className="mx-label" style={{ color: "#7c3aed", fontSize: 11, letterSpacing: "0.14em", padding: "0 4px" }}>Financials</p>
      <p style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em", padding: "6px 4px 0" }}>Capital</p>

      {/* funded headline card */}
      <Card pad={18} style={{ marginTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid rgba(37,99,235,0.4)`, borderRadius: 999, padding: "4px 11px" }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: EM }} />
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: EM_TEXT }}>Fully Funded</span>
          </span>
          <Info size={17} color={EM} strokeWidth={2} />
        </div>
        <p style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 1.08, marginTop: 14 }}>{c.headline}</p>
        <p style={{ fontSize: 13, color: SLATE, marginTop: 10, lineHeight: 1.45 }}>{c.desc}</p>
        <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: MUTE, marginTop: 18 }}>Funding runway</p>
        <div style={{ position: "relative", height: 8, borderRadius: 999, background: "#e8edf5", marginTop: 10 }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "100%", borderRadius: 999, background: `linear-gradient(90deg, ${EM}, #60a5fa)` }} />
          <span style={{ position: "absolute", right: -3, top: "50%", transform: "translateY(-50%)", width: 20, height: 20, borderRadius: 999, background: EM, border: "3px solid #fff", boxShadow: "0 2px 6px rgba(37,99,235,0.4)" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 9 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: MUTE }}>Today</span>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: EM_TEXT }}>Through 2026</span>
        </div>
      </Card>

      {/* listings */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "20px 4px 10px" }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTE }}>Listings</span>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTE }}>Delayed 15 min</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {CO.listings.map(([ex, sym]) => (
          <div key={ex} style={{ background: "#0f172a", borderRadius: 16, padding: "16px 10px", textAlign: "center" }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: "#94a3b8" }}>{ex}</p>
            <p style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.02em", color: "#fff", marginTop: 6 }}>{sym}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TabTeam() {
  return (
    <div style={{ padding: "14px 12px 24px" }}>
      <p className="mx-label" style={{ color: EM_TEXT, fontSize: 11, letterSpacing: "0.14em", padding: "0 4px" }}>Leadership</p>
      <p style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em", padding: "6px 4px 14px" }}>Board &amp; Management</p>
      <div style={{ borderTop: `1px solid ${HAIR}` }}>
        {TEAM.map((m) => (
          <div key={m.name} style={{ display: "flex", alignItems: "flex-start", gap: 13, padding: "16px 4px", borderBottom: `1px solid ${HAIR}` }}>
            <span style={{ position: "relative", flex: "0 0 auto" }}>
              <span style={{ width: 48, height: 48, borderRadius: 999, background: "#eef2f7", display: "grid", placeItems: "center", fontSize: 15, fontWeight: 800, color: "#64748b" }}>{m.initials}</span>
              {m.verified && (
                <span style={{ position: "absolute", right: -2, bottom: -2, background: "#fff", borderRadius: 999, display: "grid", placeItems: "center" }}>
                  <BadgeCheck size={16} color="#3b82f6" fill="#dbeafe" />
                </span>
              )}
            </span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: "block", fontSize: 15.5, fontWeight: 800, letterSpacing: "-0.02em" }}>{m.name}</span>
              <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: EM_TEXT, marginTop: 1 }}>{m.role}</span>
              {m.bio && <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", fontSize: 12.5, color: SLATE, marginTop: 5, lineHeight: 1.4 }}>{m.bio}</span>}
            </span>
            <ChevronRight size={17} color={MUTE} style={{ marginTop: 4, flex: "0 0 auto" }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function TabUpdates() {
  return (
    <div style={{ padding: "12px 12px 24px", display: "grid", gap: 10 }}>
      {RELEASES.slice(0, 3).map((r) => (
        <Card key={r.date} pad={14}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <img src={IMG.avatar} alt="" width={22} height={22} loading="lazy" style={{ width: 22, height: 22, borderRadius: 999, objectFit: "cover" }} />
            <span style={{ fontSize: 12, fontWeight: 700 }}>{CO.name}</span>
            <span style={{ fontSize: 11.5, color: MUTE, marginLeft: "auto" }}>{r.d}</span>
          </div>
          <p style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.022em", marginTop: 9, lineHeight: 1.25 }}>{r.label}</p>
          <p style={{ fontSize: 12.5, color: SLATE, marginTop: 6, lineHeight: 1.42 }}>{r.why}</p>
        </Card>
      ))}
    </div>
  );
}

const TAB_VIEW = {
  overview: TabOverview,
  projects: TabProjects,
  timeline: TabTimeline,
  capital: TabCapital,
  team: TabTeam,
  updates: TabUpdates,
};

function ProfileScreenBase({ tab = "overview", following = false, onFollow, showNav = true, nav = "explore", flip = false }) {
  const View = TAB_VIEW[tab] || TabOverview;
  return (
    <AppShell nav={nav} showNav={showNav}>
      <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <ProfileHeader following={following} onFollow={onFollow} />
        <ProfileTabs tab={tab} />
        <div className="mx-noscroll" style={{ flex: 1, minHeight: 0, overflow: "hidden", background: APP_BG }}>
          <div key={tab} className="pp-fade" style={{ height: "100%" }}>
            <View flip={flip} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

/* ── explore / discovery ─────────────────────────────────────────────────── */

export const FILTER_SETS = [
  { id: "commodity", label: "Commodity", Icon: Gem, options: ["Gold", "Silver", "Copper", "Uranium", "Lithium"] },
  { id: "location", label: "Location", Icon: MapPin, options: ["Canada", "United States", "Mexico", "Australia", "Peru"] },
  { id: "stage", label: "Stage", Icon: Mountain, options: ["Exploration", "Development", "Production", "Royalty"] },
];

function CompanyRowBase({ c, dim = false }) {
  return (
    <div style={{ background: "#fff", borderRadius: 16, padding: 12, display: "flex", alignItems: "center", gap: 12, opacity: dim ? 0.32 : 1, transition: `opacity 480ms ${EASE}` }}>
      {c.featured ? (
        <img src={IMG.avatar} alt="" width={42} height={42} loading="lazy" style={{ width: 42, height: 42, borderRadius: 999, objectFit: "cover", flex: "0 0 auto" }} />
      ) : (
        <span style={{ width: 42, height: 42, borderRadius: 999, background: c.tint, color: "#fff", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 800, flex: "0 0 auto" }}>{c.mono}</span>
      )}
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: 700, letterSpacing: "-0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
        <span style={{ display: "block", fontSize: 11.5, color: SLATE, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {c.ticker} · {c.commodity} · {c.region}
        </span>
      </span>
      <ChevronRight size={16} color={MUTE} style={{ flex: "0 0 auto" }} />
    </div>
  );
}

// Small "Recently Updated" carousel card, matching the app's discover rail.
function CarouselCard({ c }) {
  return (
    <div style={{ flex: "0 0 auto", width: 132, borderRadius: 16, overflow: "hidden", border: `1px solid ${HAIR}`, background: "#fff" }}>
      <div style={{ height: 74, background: c.tint || "#334155", display: "grid", placeItems: "center" }}>
        {c.featured ? <img src={IMG.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 22, fontWeight: 800, color: "rgba(255,255,255,0.92)" }}>{c.mono}</span>}
      </div>
      <div style={{ padding: "8px 9px 10px" }}>
        <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: "-0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</p>
        <p style={{ fontSize: 10.5, color: SLATE, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.ticker} · {c.commodity}</p>
      </div>
    </div>
  );
}

function ExploreScreenBase({ activeFilters = [], results = DIRECTORY, dimNonMatching = false, sheet = null }) {
  const hasF = activeFilters.length > 0;
  return (
    <AppShell nav="explore" bg="#fff">
      <div style={{ height: "100%", display: "flex", flexDirection: "column", background: APP_BG, position: "relative" }}>
        <div style={{ background: "#fff", padding: "8px 20px 12px" }}>
          <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTE }}>Discover Companies</p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 3 }}>
            <h3 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.035em" }}>Explore</h3>
            <ScanLine size={20} color={INK} strokeWidth={2} />
          </div>
          {/* search bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, borderRadius: 16, border: `1px solid ${HAIR}`, background: "#f8fafc", padding: "11px 14px", marginTop: 12 }}>
            <Search size={17} color={MUTE} />
            <span style={{ fontSize: 14, fontWeight: 500, color: MUTE }}>Search companies, tickers, commodities</span>
          </div>
          {/* filter row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTE }}>Filter</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 999, padding: "7px 14px", fontSize: 12.5, fontWeight: 700, letterSpacing: "-0.01em", border: `1px solid ${hasF ? "#0f172a" : HAIR}`, background: hasF ? "#0f172a" : "#fff", color: hasF ? "#fff" : "#475569" }}>
              <SlidersHorizontal size={13} />Advanced Search{hasF ? ` · ${activeFilters.length}` : ""}
            </span>
          </div>
        </div>
        <div className="mx-noscroll" style={{ flex: 1, minHeight: 0, overflow: "hidden", padding: "10px 12px 20px" }}>
          {!hasF && (
            <>
              <p style={{ fontSize: 13, fontWeight: 800, letterSpacing: "-0.02em", padding: "4px 4px 8px" }}>Recently Updated</p>
              <div className="mx-noscroll" style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4, marginBottom: 6 }}>
                {results.slice(0, 6).map((c) => <CarouselCard key={c.name} c={c} />)}
              </div>
            </>
          )}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 4px 8px" }}>
            <p style={{ fontSize: 13, fontWeight: 800, letterSpacing: "-0.02em" }}>{hasF ? `${results.length} ${results.length === 1 ? "company" : "companies"}` : "Featured"}</p>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 999, border: `1px solid ${HAIR}`, background: "#fff", padding: "6px 12px", fontSize: 11, fontWeight: 700, color: "#475569" }}>
              <ArrowDownUp size={12} strokeWidth={2.4} />Recommended
            </span>
          </div>
          <div style={{ display: "grid", gap: 9, alignContent: "start" }}>
            {results.map((c, i) => (
              <CompanyRow key={c.name} c={c} dim={dimNonMatching && i > 2} />
            ))}
          </div>
        </div>
        {sheet}
      </div>
    </AppShell>
  );
}

/* ── feed ────────────────────────────────────────────────────────────────── */

const FEED_TABS = ["For You", "News", "Press Releases", "Media"];

function FeedScreenBase({ tab = 0, reveal = 3 }) {
  return (
    <AppShell nav="today">
      <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <div style={{ background: "#fff", padding: "4px 16px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h3 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.035em" }}>Today</h3>
            <Bell size={20} color={INK} strokeWidth={2} />
          </div>
          <div className="mx-noscroll" style={{ display: "flex", gap: 18, marginTop: 12, overflowX: "auto" }}>
            {FEED_TABS.map((t, i) => (
              <span key={t} style={{ flex: "0 0 auto", paddingBottom: 9, fontSize: 14, fontWeight: 700, letterSpacing: "-0.015em", color: i === tab ? INK : MUTE, borderBottom: `2px solid ${i === tab ? INK : "transparent"}` }}>{t}</span>
            ))}
          </div>
        </div>
        <div className="mx-noscroll" style={{ flex: 1, minHeight: 0, overflow: "hidden", padding: "12px 12px 20px", display: "grid", gap: 10, alignContent: "start" }}>
          {RELEASES.slice(0, 4).map((r, i) => (
            <div
              key={r.date}
              style={{
                background: "#fff", borderRadius: 16, padding: 14,
                opacity: i < reveal ? 1 : 0,
                transform: i < reveal ? "none" : "translateY(16px)",
                transition: `opacity 520ms ${EASE} ${i * 70}ms, transform 520ms ${EASE} ${i * 70}ms`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <img src={IMG.avatar} alt="" width={22} height={22} loading="lazy" style={{ width: 22, height: 22, borderRadius: 999, objectFit: "cover" }} />
                <span style={{ fontSize: 12, fontWeight: 700 }}>{CO.name}</span>
                {i === 0 && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", color: EM_TEXT, background: EM_SOFT, borderRadius: 999, padding: "3px 7px" }}>NEW</span>}
                <span style={{ fontSize: 11.5, color: MUTE, marginLeft: "auto" }}>{r.d}</span>
              </div>
              <p style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.022em", marginTop: 9, lineHeight: 1.25 }}>{r.label}</p>
              <p style={{ fontSize: 12.5, color: SLATE, marginTop: 6, lineHeight: 1.42 }}>{r.why}</p>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

/* ── press-release reader ────────────────────────────────────────────────── */

function ReleaseScreenBase({ release = RELEASES[3] }) {
  return (
    <AppShell nav="today" showNav={false}>
      <div className="mx-noscroll" style={{ height: "100%", overflow: "hidden", background: "#fff" }}>
        <div style={{ padding: "8px 18px 22px" }}>
          <ChevronLeft size={22} color={INK} strokeWidth={2.2} style={{ marginLeft: -4 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
            <img src={IMG.avatar} alt="" width={24} height={24} loading="lazy" style={{ width: 24, height: 24, borderRadius: 999, objectFit: "cover" }} />
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>{CO.name}</span>
            <span style={{ fontSize: 11.5, color: MUTE }}>· {release.d}, 2026</span>
          </div>
          <h3 style={{ fontSize: 23, fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 1.14, marginTop: 12 }}>{release.label}</h3>

          <div style={{ background: EM_SOFT, borderRadius: 16, padding: 14, marginTop: 16 }}>
            <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: EM_TEXT }}>Why It Matters</p>
            <p style={{ fontSize: 14, lineHeight: 1.5, marginTop: 7, color: "#0f2f4d" }}>{release.why}</p>
          </div>

          <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTE, marginTop: 20 }}>Key Takeaways</p>
          <div style={{ display: "grid", gap: 8, marginTop: 9 }}>
            {release.takeaways.map((t) => (
              <div key={t} style={{ display: "flex", gap: 9, alignItems: "flex-start", background: "#f8fafc", borderRadius: 12, padding: "11px 12px" }}>
                <Check size={14} strokeWidth={3} color={EM} style={{ marginTop: 2, flex: "0 0 auto" }} />
                <span style={{ fontSize: 13, lineHeight: 1.4 }}>{t}</span>
              </div>
            ))}
          </div>

          <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTE, marginTop: 20 }}>Company</p>
          <div style={{ display: "flex", gap: 8, marginTop: 9 }}>
            {CO.listings.slice(0, 2).map(([ex, sym]) => (
              <span key={ex} style={{ border: `1px solid ${HAIR}`, borderRadius: 999, padding: "6px 11px", fontSize: 11.5, color: SLATE }}>
                {ex} <b style={{ color: INK, fontWeight: 800 }}>{sym}</b>
              </span>
            ))}
          </div>

          <div style={{ marginTop: 20, borderTop: `1px solid ${HAIR}`, paddingTop: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <FileText size={15} color={MUTE} />
            <span style={{ fontSize: 13, fontWeight: 700, color: INK }}>Read the full release</span>
            <ChevronRight size={15} color={MUTE} style={{ marginLeft: "auto" }} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

/* ── media ───────────────────────────────────────────────────────────────── */

const MEDIA_FILTERS = ["All", "Updates", "Photos", "Videos", "Interviews"];

function MediaScreenBase({ items }) {
  // Thumbnails paint small, so they take the small variant — never the full-size original.
  const grid =
    items || [IMG.aerial, IMG.rig, IMG.adit, IMG.sampling, IMG.timbered, IMG.field, IMG.shaft, IMG.district, IMG.mineAdit, IMG.colonial, IMG.drill, IMG.mineAdit].map((i) => i.sm);
  return (
    <AppShell nav="today">
      <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#fff" }}>
        <div style={{ padding: "6px 20px 10px" }}>
          <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTE }}>Company Media</p>
          <h3 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.035em", marginTop: 3 }}>Media</h3>
          {/* segmented filters */}
          <div className="mx-noscroll" style={{ display: "flex", gap: 7, marginTop: 12, overflowX: "auto" }}>
            {MEDIA_FILTERS.map((t, i) => (
              <span key={t} style={{ flex: "0 0 auto", borderRadius: 999, padding: "7px 14px", fontSize: 12.5, fontWeight: 700, letterSpacing: "-0.01em", border: `1px solid ${i === 0 ? "#0f172a" : HAIR}`, background: i === 0 ? "#0f172a" : "#fff", color: i === 0 ? "#fff" : "#475569" }}>{t}</span>
            ))}
          </div>
        </div>
        {/* Instagram-style tight grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 2 }}>
          {grid.map((src, i) => (
            <div key={i} style={{ position: "relative", aspectRatio: "1", overflow: "hidden", background: "#e2e8f0" }}>
              <img src={src} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              {(i === 0 || i === 4 || i === 7) && (
                <span style={{ position: "absolute", top: 6, right: 6, width: 20, height: 20, borderRadius: 999, background: "rgba(15,23,42,0.55)", display: "grid", placeItems: "center" }}>
                  <Play size={10} fill="#fff" color="#fff" style={{ marginLeft: 1 }} />
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

/* ── notification ────────────────────────────────────────────────────────── */

function PushNotificationBase({ shown = true, delay = 0 }) {
  return (
    <div
      style={{
        background: "rgba(250,250,252,0.94)",
        backdropFilter: "blur(18px)",
        borderRadius: 20,
        padding: "12px 14px",
        display: "flex",
        gap: 11,
        alignItems: "flex-start",
        boxShadow: "0 20px 46px -22px rgba(4,8,14,0.42)",
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : "translateY(-14px) scale(0.97)",
        transition: `opacity 520ms ${EASE} ${delay}ms, transform 520ms ${EASE} ${delay}ms`,
      }}
    >
      <img src="/icon-192.png" alt="" width={34} height={34} style={{ width: 34, height: 34, borderRadius: 9, flex: "0 0 auto" }} />
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 12, fontWeight: 800, color: INK, letterSpacing: "-0.01em" }}>MineEx</p>
        <p style={{ fontSize: 12.5, color: INK, marginTop: 2, lineHeight: 1.35 }}>
          <b style={{ fontWeight: 700 }}>{CO.name}</b> published an update — {RELEASES[0].label}.
        </p>
      </div>
    </div>
  );
}

/* Every exported screen above is wrapped in React.memo. The sticky sections that
   drive this page re-render on scroll; without the memo each frame would rebuild a
   whole phone UI tree, which is what made a long scroll stutter. Props are all
   primitives (or memoised by the caller), so the shallow compare is exact. */

export const ProfileScreen = React.memo(ProfileScreenBase);

export const ExploreScreen = React.memo(ExploreScreenBase);

export const FeedScreen = React.memo(FeedScreenBase);

export const ReleaseScreen = React.memo(ReleaseScreenBase);

export const MediaScreen = React.memo(MediaScreenBase);

export const PushNotification = React.memo(PushNotificationBase);

export const CompanyRow = React.memo(CompanyRowBase);

export const BottomNav = React.memo(BottomNavBase);

export const ProfileTabs = React.memo(ProfileTabsBase);

export const ProfileHeader = React.memo(ProfileHeaderBase);

export const StatusBar = React.memo(StatusBarBase);
