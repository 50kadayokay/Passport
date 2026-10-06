// ─────────────────────────────────────────────────────────────────────────────
// MineEx sales page (v2) — FOUNDATION KIT.
//
// Three visual layers work together on this page:
//   1. LIVE PRODUCT UI  — the real Conference Mode (same-origin iframe) + real
//      investor screens (rebuilt-small, real-data) driven interactively.
//   2. ILLUSTRATION     — restrained architectural/editorial line art that sets
//      WHERE / WHO / WHEN (physical context the software can't show).
//   3. REAL PHOTOGRAPHY — actual project terrain / core imagery.
//
// A single connected DEMO STATE ties the interactions together: pressing Follow
// in the investor demo and Publish in the portal demo drive the same phone's
// notification — so the page demonstrates a SYSTEM, not isolated interfaces.
//
// Everything here is sandboxed: no auth, no writes, no real notifications; state
// is in-memory and resets on reload.
// ─────────────────────────────────────────────────────────────────────────────
import React, { createContext, useContext, useState, useRef, useEffect } from "react";
import { MX, EASE, Tablet, Phone } from "../system.jsx";
import { Fit, ProfileScreen, ExploreScreen, FeedScreen, ReleaseScreen, PushNotification, CompanyRow, FILTER_SETS } from "../ui/AppUI.jsx";
import { DIRECTORY, CO, RELEASES } from "../data.js";

// The product accent — cobalt. On this page blue means CONNECTION / ACTION: the
// QR bridge, the Follow, the CTAs, the live moments. Everything else stays graphite.
export const CB = "#2563eb";
export const CB_DEEP = "#1d4ed8";
export const CB_SOFT = "rgba(37,99,235,0.10)";

export const PREVIEW = "f93303de-0614-4ef1-814c-086ad229cf1a";
export const SLUG = "granitepeak-demo";

/* ── CONNECTED DEMO STATE ─────────────────────────────────────────────────── */
const DemoCtx = createContext(null);
export function DemoProvider({ children }) {
  const [following, setFollowing] = useState(false);
  const [published, setPublished] = useState(false);
  const reset = () => { setFollowing(false); setPublished(false); };
  return <DemoCtx.Provider value={{ following, setFollowing, published, setPublished, reset }}>{children}</DemoCtx.Provider>;
}
export const useDemo = () => useContext(DemoCtx) || { following: false, published: false };

/* ── LIVE CONFERENCE MODE ─────────────────────────────────────────────────────
   The real product, embedded same-origin. The company's verified data drives it;
   switching a chip loads a different template — the same dataset, told differently.
   Never implies MineEx invents data; it presents disclosed information. */
export const CONF_TEMPLATES = [
  { key: "keynote2", label: "Keynote II" },
  { key: "monolith", label: "Monolith" },
  { key: "expedition", label: "Expedition" },
  { key: "crucible", label: "Crucible" },
  { key: "vein", label: "Vein" },
];

export function ConfLive({ tpl, onPick, theme = "obsidian", chips = true, tablet = true, style }) {
  const [cur, setCur] = useState(tpl || CONF_TEMPLATES[0].key);
  const [loading, setLoading] = useState(true);
  useEffect(() => { if (tpl && tpl !== cur) { setCur(tpl); } }, [tpl]); // controlled override
  const pick = (k) => { setLoading(true); setCur(k); onPick && onPick(k); };
  const src = `/confv3demo?c=${SLUG}&preview=${PREVIEW}&t=${cur}&theme=${theme}&bar=0`;
  const screen = (
    <div style={{ position: "absolute", inset: 0, background: "#0b1428" }}>
      <iframe
        key={cur}
        title="MineEx Conference Mode"
        src={src}
        onLoad={() => setLoading(false)}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, display: "block" }}
      />
      <div aria-hidden style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "#0b1428", opacity: loading ? 1 : 0, transition: `opacity .5s ${EASE}`, pointerEvents: "none" }}>
        <span style={{ width: 22, height: 22, borderRadius: 999, border: "2px solid rgba(147,180,255,.28)", borderTopColor: "#93b4ff", animation: "mxv-spin 0.8s linear infinite" }} />
      </div>
    </div>
  );
  return (
    <div style={style}>
      {tablet ? <Tablet>{screen}</Tablet> : <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 14, overflow: "hidden" }}>{screen}</div>}
      {chips && (
        <div className="mxv-chiprow" style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 18 }}>
          {CONF_TEMPLATES.map((t) => {
            const on = t.key === cur;
            return (
              <button key={t.key} type="button" onClick={() => pick(t.key)} aria-pressed={on}
                style={{
                  border: `1px solid ${on ? CB : "rgba(18,22,29,0.16)"}`, background: on ? CB : "#fff",
                  color: on ? "#fff" : MX.text, borderRadius: 999, padding: "9px 16px", fontSize: 13.5,
                  fontWeight: 700, letterSpacing: "-0.01em", cursor: "pointer", fontFamily: "inherit",
                  transition: `background .25s ${EASE}, border-color .25s ${EASE}, color .25s ${EASE}`,
                }}>
                {t.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── INTERACTIVE INVESTOR PHONE ───────────────────────────────────────────────
   A controlled walk through the real investor screens: Explore → tap a company →
   Profile → Follow → return to the personalized feed. Buttons work; screens
   transition. Follow writes to the connected demo state. */
export function PhoneDemo({ width, autofocusExplore = false, style }) {
  const { following, setFollowing } = useDemo();
  const [screen, setScreen] = useState(autofocusExplore ? "explore" : "profile"); // explore | profile | feed
  const [tab, setTab] = useState("overview");
  const follow = () => setFollowing((v) => !v);
  const body = (() => {
    if (screen === "explore") {
      const sheet = (
        <div style={{ position: "absolute", left: 12, right: 12, bottom: 12, zIndex: 5 }}>
          <button type="button" onClick={() => setScreen("profile")}
            style={{ width: "100%", border: 0, background: CB, color: "#fff", borderRadius: 14, padding: "13px 16px", fontSize: 14.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 16px 30px -14px rgba(37,99,235,0.6)" }}>
            Open {CO.name} →
          </button>
        </div>
      );
      return <ExploreScreen results={DIRECTORY} sheet={sheet} />;
    }
    if (screen === "feed") return <FeedScreen tab={0} reveal={4} />;
    return <ProfileScreen tab={tab} following={following} onFollow={follow} nav="explore" />;
  })();
  return (
    <div style={{ position: "relative", ...style }}>
      <Phone width={width}><Fit>{body}</Fit></Phone>
      {/* controlled tab/nav affordances a real user would tap, kept minimal for the demo */}
      {screen === "profile" && (
        <div style={{ position: "absolute", left: "50%", bottom: -46, transform: "translateX(-50%)", display: "flex", gap: 8 }}>
          <MiniTab active={tab === "overview"} onClick={() => setTab("overview")}>Overview</MiniTab>
          <MiniTab active={tab === "projects"} onClick={() => setTab("projects")}>Projects</MiniTab>
          <MiniTab active={tab === "capital"} onClick={() => setTab("capital")}>Capital</MiniTab>
          <MiniTab active={false} onClick={() => setScreen("feed")}>My feed</MiniTab>
        </div>
      )}
      {screen === "feed" && (
        <div style={{ position: "absolute", left: "50%", bottom: -46, transform: "translateX(-50%)" }}>
          <MiniTab active={false} onClick={() => setScreen("profile")}>← Back to company</MiniTab>
        </div>
      )}
    </div>
  );
}
function MiniTab({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick}
      style={{ border: `1px solid ${active ? MX.ink : "rgba(18,22,29,0.16)"}`, background: active ? MX.ink : "#fff", color: active ? "#fff" : MX.dim, borderRadius: 999, padding: "7px 13px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
      {children}
    </button>
  );
}

/* A phone that shows the company profile, with the MineEx notification riding on
   top once the company has "published" (connected demo state). Reused in the
   Return beat and the hero. */
export function PhoneProfile({ width, showNotif = false, style }) {
  const { following, setFollowing } = useDemo();
  return (
    <div style={{ position: "relative", ...style }}>
      <Phone width={width}><Fit><ProfileScreen tab="overview" following={following} onFollow={() => setFollowing && setFollowing((v) => !v)} nav="explore" /></Fit></Phone>
      <div style={{ position: "absolute", top: "9%", left: "6%", right: "6%", zIndex: 8 }}>
        <PushNotification shown={showNotif} />
      </div>
    </div>
  );
}

/* ── ILLUSTRATION LANGUAGE ────────────────────────────────────────────────────
   Architectural line + silhouette + cobalt connective tissue. People are
   simplified silhouettes so the PRODUCT stays visually dominant. SVG only. */

// A restrained conference-hall backdrop: floor line, ceiling truss, a booth
// volume, soft topographic contour. Sits BEHIND the live device.
export function BoothBackdrop({ style }) {
  return (
    <svg viewBox="0 0 1200 760" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", ...style }} aria-hidden>
      <defs>
        <linearGradient id="mxv-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0d1220" /><stop offset="1" stopColor="#080b14" />
        </linearGradient>
      </defs>
      <rect width="1200" height="760" fill="url(#mxv-floor)" />
      {/* topographic contours, very faint */}
      {[0, 1, 2, 3, 4].map((i) => (
        <path key={i} d={`M-40 ${300 + i * 70} C 260 ${250 + i * 70}, 520 ${360 + i * 70}, 760 ${300 + i * 70} S 1180 ${250 + i * 70}, 1240 ${300 + i * 70}`}
          fill="none" stroke="rgba(147,180,255,0.06)" strokeWidth="1" />
      ))}
      {/* ceiling truss */}
      <g stroke="rgba(255,255,255,0.05)" strokeWidth="1">
        <line x1="0" y1="86" x2="1200" y2="70" />
        {Array.from({ length: 18 }).map((_, i) => <line key={i} x1={i * 70} y1="70" x2={i * 70 + 30} y2="98" />)}
      </g>
      {/* booth volume (right) — a company backwall + counter */}
      <g stroke="rgba(147,180,255,0.14)" strokeWidth="1.4" fill="none">
        <rect x="812" y="150" width="330" height="360" rx="4" />
        <line x1="812" y1="300" x2="1142" y2="300" />
        <rect x="838" y="180" width="278" height="96" rx="3" stroke="rgba(147,180,255,0.22)" />
        <line x1="790" y1="560" x2="1170" y2="560" />
      </g>
      {/* perspective floor lines */}
      <g stroke="rgba(255,255,255,0.04)" strokeWidth="1">
        {[0, 200, 400, 600, 800, 1000, 1200].map((x) => <line key={x} x1={x} y1="620" x2={x * 0.7 + 180} y2="470" />)}
      </g>
    </svg>
  );
}

// A simplified standing figure (investor). Silhouette, cobalt phone glow optional.
export function Figure({ variant = "stand", phone = false, glow = false, style }) {
  return (
    <svg viewBox="0 0 120 300" style={{ display: "block", ...style }} aria-hidden>
      <g fill={variant === "dark" ? "rgba(255,255,255,0.16)" : "rgba(10,12,15,0.82)"}>
        <circle cx="60" cy="42" r="24" />
        <path d="M32 96 Q60 78 88 96 L84 220 Q60 232 36 220 Z" />
        <path d="M40 218 L34 300 L52 300 L58 226 Z" />
        <path d="M80 218 L86 300 L68 300 L62 226 Z" />
        <path d="M84 110 Q104 150 96 190 L86 186 Q92 150 76 120 Z" />
      </g>
      {phone && (
        <g>
          <rect x="70" y="150" width="26" height="44" rx="6" fill={glow ? CB : "rgba(10,12,15,0.9)"} />
          {glow && <rect x="70" y="150" width="26" height="44" rx="6" fill="none" stroke={CB} strokeWidth="6" opacity="0.35" />}
        </g>
      )}
    </svg>
  );
}

// The QR / cobalt BRIDGE — a connective beam from a booth QR toward a phone.
export function QrBridge({ vertical = false, style }) {
  return (
    <div style={{ position: "relative", ...style }} aria-hidden>
      <svg viewBox="0 0 400 120" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
        <defs>
          <linearGradient id="mxv-beam" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={CB} stopOpacity="0.9" /><stop offset="1" stopColor={CB} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="20" y1="60" x2="380" y2="60" stroke="url(#mxv-beam)" strokeWidth="2" strokeDasharray="2 8" strokeLinecap="round">
          <animate attributeName="stroke-dashoffset" from="0" to="-40" dur="1.4s" repeatCount="indefinite" />
        </line>
      </svg>
    </div>
  );
}

/* Small standalone QR chip (styled to match the booth's real QR) used where a
   full presentation embed isn't needed. */
export function QrChip({ size = 96, style }) {
  // deterministic block pattern — decorative stand-in for the real generated code
  // that Conference Mode renders; used only as a bridge motif, not for scanning.
  const cells = 11;
  return (
    <div style={{ width: size, height: size, background: "#fff", borderRadius: 12, padding: size * 0.09, boxShadow: "0 18px 40px -20px rgba(4,10,26,.7)", ...style }} aria-hidden>
      <svg viewBox={`0 0 ${cells} ${cells}`} style={{ width: "100%", height: "100%" }}>
        {Array.from({ length: cells * cells }).map((_, i) => {
          const x = i % cells, y = Math.floor(i / cells);
          const corner = (x < 3 && y < 3) || (x > cells - 4 && y < 3) || (x < 3 && y > cells - 4);
          const on = corner ? (x === 0 || y === 0 || x === cells - 1 || y === cells - 1 || (x > 0 && x < 2 && y > 0 && y < 2) || (x > cells - 3 && x < cells - 1 && y > 0 && y < 2) || (x > 0 && x < 2 && y > cells - 3 && y < cells - 1)) : ((x * 7 + y * 13 + x * y) % 3 === 0);
          return on ? <rect key={i} x={x} y={y} width="1" height="1" fill="#0b1428" /> : null;
        })}
      </svg>
    </div>
  );
}
