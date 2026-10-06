// ─────────────────────────────────────────────────────────────────────────────
// GlanceSection — "MineEx at a Glance" (homepage section 02). A bird's-eye view of
// the whole offering so a CEO understands the breadth in seconds. Marketing-layer,
// PURE CSS — no iframes, no product bundles, no real app, no ConferenceV3/Portal.
//
// Compressed composition: Pro Profile reads as the CORE investor destination (largest,
// centred, elevated); Conference Mode (where you meet investors) and Company Portal
// (your control layer) flank it; Mining Websites + Managed Services extend it. The
// whole system is meant to sit in one coherent visual field. Lightweight CSS device
// glyphs stand in for each product. Normal page scroll; only subtle reveal + hover.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { MX, EASE, Reveal, Eyebrow, useViewport } from "../system.jsx";

const MAXW = 1160;

export default function GlanceSection() {
  const { mobile, tablet } = useViewport();
  const desktop = !mobile && !tablet;

  return (
    <section
      id="platform"
      aria-label="The MineEx platform"
      style={{
        position: "relative",
        background: MX.paper,
        borderTop: `1px solid ${MX.hair}`,
        padding: mobile ? "56px 0 64px" : "clamp(52px,6.5vh,80px) 0 clamp(60px,7.5vh,90px)",
      }}
    >
      <div style={{ maxWidth: MAXW, margin: "0 auto", padding: mobile ? "0 22px" : "0 clamp(24px,5vw,56px)" }}>
        {/* ── header ── */}
        <div style={{ textAlign: "center", maxWidth: 700, marginInline: "auto" }}>
          <Eyebrow style={{ justifyContent: "center" }}>The MineEx Platform</Eyebrow>
          <Reveal kind="heading">
            <h2 className="mx-h2" style={{ marginTop: 14, color: MX.text, fontSize: mobile ? "clamp(30px,8.5vw,40px)" : "clamp(32px,3.6vw,50px)", letterSpacing: "-0.032em", lineHeight: 1.02 }}>
              Everything your investor presence needs.
            </h2>
          </Reveal>
          <Reveal kind="copy" order={1}>
            <p style={{ marginTop: 14, color: MX.dim, marginInline: "auto", maxWidth: "52ch", fontSize: 16, lineHeight: 1.5 }}>
              MineEx connects your digital presence, your conferences and your communications into one system —{" "}
              <span style={{ color: MX.text, fontWeight: 500 }}>one company story, everywhere investors meet you.</span>
            </p>
          </Reveal>
        </div>

        {desktop ? <SystemDesktop /> : <SystemStacked mobile={mobile} />}
      </div>
    </section>
  );
}

/* ═══ COPY / DATA ═══════════════════════════════════════════════════════════ */

const CORE = {
  tag: "The investor destination",
  name: "Pro Profile",
  line: "A living investor profile — projects, progress, capital, leadership and media — investors explore and Follow.",
};
const FLANK = [
  {
    tag: "Where you meet investors",
    name: "Conference Mode",
    line: "Replace the one-pager with a premium iPad presentation — QR straight into your profile.",
    glyph: TabletGlyph,
  },
  {
    tag: "Your control layer",
    name: "Company Portal",
    line: "Manage your whole investor presence — profile, updates, press and media — from one place.",
    glyph: DesktopGlyph,
  },
];
const EXT = [
  { name: "Mining Websites", line: "Premium custom mining websites, designed and hosted by MineEx.", glyph: WebsiteGlyph },
  { name: "Managed Services", line: "Done-for-you management of your investor presence and communications.", glyph: ManagedGlyph },
];

/* ═══ DESKTOP SYSTEM — one compact composition ══════════════════════════════ */

function SystemDesktop() {
  return (
    <div style={{ marginTop: "clamp(28px,3.6vh,44px)" }}>
      <div style={{ position: "relative" }}>
        {/* subtle glow behind the core (kept deliberately faint) */}
        <div aria-hidden style={{ position: "absolute", left: "50%", top: "12%", width: 340, height: 240, transform: "translateX(-50%)", background: "radial-gradient(closest-side, rgba(198,240,74,0.10), rgba(198,240,74,0))", filter: "blur(6px)", zIndex: 0 }} />
        <div style={{ position: "relative", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "end", columnGap: "clamp(18px,2.6vw,44px)", zIndex: 2 }}>
          <Flank {...FLANK[0]} />
          <CorePillar />
          <Flank {...FLANK[1]} />
        </div>
      </div>

      {/* connective rail → the three resolve to one thread that flows into the system below */}
      <div aria-hidden style={{ position: "relative", marginTop: "clamp(22px,2.8vh,34px)" }}>
        <div style={{ height: 1, background: "linear-gradient(90deg, rgba(10,12,15,0) 0%, rgba(10,12,15,0.12) 22%, rgba(198,240,74,0.55) 50%, rgba(10,12,15,0.12) 78%, rgba(10,12,15,0) 100%)" }} />
        <span style={{ position: "absolute", left: "50%", top: -5, transform: "translateX(-50%)", width: 10, height: 10, borderRadius: "50%", background: "var(--mx-accent)", boxShadow: "0 0 0 4px rgba(198,240,74,0.18)" }} />
        <div style={{ width: 1, height: 26, margin: "5px auto 0", background: `linear-gradient(180deg, var(--mx-accent), ${MX.hair})` }} />
      </div>

      <ExtensionsBand />
    </div>
  );
}

function CorePillar() {
  return (
    <Reveal kind="media" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <Tag center>{CORE.tag}</Tag>
      <div style={{ marginTop: 10 }}>
        <PhoneGlyph w={128} />
      </div>
      <div style={{ textAlign: "center", maxWidth: 248, marginTop: 16 }}>
        <h3 style={nameStyle(true)}>{CORE.name}</h3>
        <p style={lineStyle}>{CORE.line}</p>
      </div>
    </Reveal>
  );
}

function Flank({ tag, name, line, glyph: Glyph }) {
  return (
    <Reveal kind="media" order={1} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <Tag center>{tag}</Tag>
      <div style={{ marginTop: 10 }}>
        <Glyph />
      </div>
      <div style={{ textAlign: "center", maxWidth: 280, marginTop: 14 }}>
        <h3 style={nameStyle(false)}>{name}</h3>
        <p style={lineStyle}>{line}</p>
      </div>
    </Reveal>
  );
}

function ExtensionsBand() {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ textAlign: "center" }}><Tag center>Extending the system</Tag></div>
      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 820, marginInline: "auto" }}>
        {EXT.map((e, i) => (
          <Reveal kind="item" order={i} key={e.name}>
            <ExtCard {...e} />
          </Reveal>
        ))}
      </div>
    </div>
  );
}

function ExtCard({ name, line, glyph: Glyph }) {
  return (
    <div
      className="mx-ext"
      style={{
        display: "flex", alignItems: "center", gap: 16, padding: "14px 18px", borderRadius: 14,
        background: MX.sheet, border: `1px solid ${MX.hair}`,
        transition: `transform 240ms ${EASE}, box-shadow 240ms ${EASE}`,
      }}
    >
      <div style={{ flex: "0 0 auto" }}><Glyph /></div>
      <div style={{ minWidth: 0 }}>
        <h3 style={{ ...nameStyle(false), fontSize: 17 }}>{name}</h3>
        <p style={{ ...lineStyle, marginTop: 3 }}>{line}</p>
      </div>
      <style>{`.mx-ext:hover{transform:translateY(-2px);box-shadow:0 22px 44px -30px rgba(10,12,15,0.26);}`}</style>
    </div>
  );
}

/* ═══ MOBILE / TABLET — fast vertical narrative ═════════════════════════════ */

function SystemStacked() {
  const items = [
    { ...CORE, glyph: PhoneGlyph, core: true },
    ...FLANK,
    ...EXT.map((e, i) => ({ ...e, tag: i === 0 ? "Extending the system" : "" })),
  ];
  return (
    <div style={{ marginTop: 30, position: "relative", maxWidth: 460, marginInline: "auto" }}>
      {/* vertical connective rail */}
      <div aria-hidden style={{ position: "absolute", left: 18, top: 14, bottom: 14, width: 1, background: `linear-gradient(180deg, var(--mx-accent), ${MX.hair})` }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {items.map((it, i) => (
          <Reveal kind="item" order={i} key={it.name}>
            <StackedRow {...it} />
          </Reveal>
        ))}
      </div>
    </div>
  );
}

function StackedRow({ tag, name, line, glyph: Glyph, core }) {
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
      {/* rail node */}
      <div style={{ flex: "0 0 auto", width: 37, display: "flex", justifyContent: "center", paddingTop: 5 }}>
        <span aria-hidden style={{ width: core ? 13 : 10, height: core ? 13 : 10, borderRadius: "50%", background: "var(--mx-accent)", boxShadow: core ? "0 0 0 4px rgba(198,240,74,0.2)" : "0 0 0 3px rgba(198,240,74,0.15)" }} />
      </div>
      {/* compact: small evidence + type */}
      <div style={{ minWidth: 0, flex: 1, display: "flex", gap: 16, alignItems: "center" }}>
        <div style={{ flex: "0 0 auto" }}><Glyph mobile core={core} /></div>
        <div style={{ minWidth: 0 }}>
          {tag ? <Tag>{tag}</Tag> : null}
          <h3 style={{ ...nameStyle(core), fontSize: core ? 21 : 18, marginTop: tag ? 6 : 0 }}>{name}</h3>
          <p style={{ ...lineStyle, marginTop: 4 }}>{line}</p>
        </div>
      </div>
    </div>
  );
}

/* ═══ SHARED TEXT STYLES ════════════════════════════════════════════════════ */

const nameStyle = (core) => ({
  fontSize: core ? 22 : 18, fontWeight: 700, letterSpacing: "-0.025em", color: MX.text, lineHeight: 1.1,
});
const lineStyle = { marginTop: 6, fontSize: 13.5, lineHeight: 1.45, color: MX.dim, fontWeight: 400 };

function Tag({ children, center }) {
  return (
    <div className="mx-label" style={{ fontSize: 10.5, color: MX.mute, display: "flex", alignItems: "center", gap: 8, justifyContent: center ? "center" : "flex-start" }}>
      <span aria-hidden style={{ width: 12, height: 2, borderRadius: 2, background: "var(--mx-accent)" }} />
      {children}
    </div>
  );
}

/* ═══ LIGHTWEIGHT CSS PRODUCT GLYPHS (no images, no iframes) ═════════════════ */

const screenBase = { position: "relative", borderRadius: 10, overflow: "hidden", background: "#fff" };

// Pro Profile — a compact phone showing a mini investor profile.
function PhoneGlyph({ w = 128, mobile, core }) {
  if (mobile) w = core ? 60 : 56;
  const h = w * 2.0;
  return (
    <div style={{ width: w, height: h, borderRadius: w * 0.16, background: "#0a0a0c", padding: w * 0.05, boxShadow: "0 30px 60px -30px rgba(10,12,15,0.5), 0 0 0 1px rgba(255,255,255,0.06) inset" }}>
      <div style={{ ...screenBase, width: "100%", height: "100%", borderRadius: w * 0.12, background: "#f6f7f8", padding: w * 0.06, display: "flex", flexDirection: "column", gap: w * 0.055 }}>
        <div style={{ display: "flex", alignItems: "center", gap: w * 0.05 }}>
          <div style={{ width: w * 0.17, height: w * 0.17, borderRadius: 5, background: "#0a0c0f" }} />
          <div style={{ flex: 1 }}>
            <div style={{ height: Math.max(3, w * 0.045), width: "72%", borderRadius: 3, background: "#0a0c0f" }} />
            <div style={{ height: Math.max(2, w * 0.03), width: "46%", borderRadius: 3, background: "#c3c8ce", marginTop: w * 0.035 }} />
          </div>
          <div style={{ height: w * 0.1, width: w * 0.26, borderRadius: 99, background: "var(--mx-accent)" }} />
        </div>
        <div style={{ display: "flex", gap: w * 0.03 }}>
          {[0, 1, 2, 3, 4].map((i) => <div key={i} style={{ flex: 1, height: Math.max(2, w * 0.022), borderRadius: 2, background: i === 0 ? "#0a0c0f" : "#dfe3e7" }} />)}
        </div>
        <div style={{ height: h * 0.26, borderRadius: 7, background: "linear-gradient(135deg,#20262d,#0d1116)" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: Math.max(3, w * 0.035) }}>
          {[0.9, 0.7, 0.82, 0.5].map((wl, i) => <div key={i} style={{ height: Math.max(2, w * 0.028), width: `${wl * 100}%`, borderRadius: 3, background: "#d7dbe0" }} />)}
        </div>
      </div>
    </div>
  );
}

// Conference Mode — a landscape tablet with a cinematic cover + QR.
function TabletGlyph({ w = 188, mobile }) {
  if (mobile) w = 104;
  const h = w * 0.7;
  return (
    <div style={{ width: w, height: h, borderRadius: mobile ? 11 : 15, background: "#0a0a0c", padding: mobile ? 5 : 7, boxShadow: "0 30px 60px -32px rgba(10,12,15,0.5), 0 0 0 1px rgba(255,255,255,0.06) inset" }}>
      <div style={{ ...screenBase, width: "100%", height: "100%", borderRadius: 8, background: "radial-gradient(120% 120% at 40% 20%, #23201c 0%, #0c0f13 70%)" }}>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(115deg, rgba(120,96,64,0.35), rgba(0,0,0,0) 55%)" }} />
        <div style={{ position: "absolute", left: mobile ? 8 : 12, bottom: mobile ? 9 : 13 }}>
          <div style={{ height: 3, width: 34, borderRadius: 2, background: "rgba(255,255,255,0.45)" }} />
          <div style={{ height: mobile ? 6 : 9, width: mobile ? 62 : 100, borderRadius: 3, background: "#fff", marginTop: 6 }} />
          <div style={{ height: mobile ? 6 : 9, width: mobile ? 40 : 66, borderRadius: 3, background: "#fff", marginTop: 3 }} />
        </div>
        <div style={{ position: "absolute", right: mobile ? 8 : 11, bottom: mobile ? 8 : 11, width: mobile ? 20 : 27, height: mobile ? 20 : 27, borderRadius: 4, background: "#fff", padding: 3 }}>
          <div style={{ width: "100%", height: "100%", background: "repeating-conic-gradient(#0a0c0f 0deg 90deg, #fff 90deg 180deg) 0 0 / 6px 6px" }} />
        </div>
      </div>
    </div>
  );
}

// Company Portal — a desktop browser with a mini editor.
function DesktopGlyph({ w = 200, mobile }) {
  if (mobile) w = 116;
  const h = w * 0.64;
  return (
    <div style={{ width: w, height: h, borderRadius: mobile ? 9 : 11, overflow: "hidden", background: "#fff", boxShadow: "0 30px 60px -32px rgba(10,12,15,0.45), 0 0 0 1px rgba(10,12,15,0.08)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: mobile ? "5px 7px" : "7px 9px", background: "#f2f3f4", borderBottom: `1px solid ${MX.hair}` }}>
        {[0, 1, 2].map((i) => <span key={i} style={{ width: 5, height: 5, borderRadius: 99, background: "#dcdfe2" }} />)}
        <div style={{ marginLeft: 5, height: mobile ? 8 : 11, width: mobile ? 60 : 96, borderRadius: 3, background: "#fff", border: `1px solid ${MX.hair}` }} />
        <span style={{ marginLeft: "auto", width: 5, height: 5, borderRadius: 99, background: "var(--mx-accent)" }} />
      </div>
      <div style={{ display: "flex", height: h - (mobile ? 20 : 26) }}>
        <div style={{ width: "30%", background: "#fafbfb", borderRight: `1px solid ${MX.hair}`, padding: mobile ? 6 : 9, display: "flex", flexDirection: "column", gap: mobile ? 5 : 7 }}>
          {[0, 1, 2].map((i) => <div key={i} style={{ height: 4, width: `${80 - i * 10}%`, borderRadius: 3, background: i === 0 ? "#0a0c0f" : "#d9dde1" }} />)}
        </div>
        <div style={{ flex: 1, padding: mobile ? 8 : 11, display: "flex", flexDirection: "column", gap: mobile ? 7 : 9 }}>
          {[0, 1].map((i) => (
            <div key={i}>
              <div style={{ height: 3, width: 38, borderRadius: 2, background: "#c9ced3" }} />
              <div style={{ height: mobile ? 9 : 11, width: "100%", borderRadius: 4, background: "#f1f3f4", border: `1px solid ${MX.hair}`, marginTop: 4 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Mining Websites — a small browser window with a hero.
function WebsiteGlyph({ w = 60, mobile }) {
  if (mobile) w = 66;
  const h = w * 0.82;
  return (
    <div style={{ width: w, height: h, borderRadius: 9, overflow: "hidden", background: "#fff", boxShadow: "0 16px 34px -22px rgba(10,12,15,0.4), 0 0 0 1px rgba(10,12,15,0.08)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 3, padding: "5px 7px", background: "#f2f3f4", borderBottom: `1px solid ${MX.hair}` }}>
        {[0, 1, 2].map((i) => <span key={i} style={{ width: 3.5, height: 3.5, borderRadius: 99, background: "#d3d7db" }} />)}
      </div>
      <div style={{ padding: 7 }}>
        <div style={{ height: h * 0.34, borderRadius: 4, background: "linear-gradient(135deg,#20262d,#0d1116)" }} />
        <div style={{ height: 3.5, width: "70%", borderRadius: 2, background: "#d7dbe0", marginTop: 6 }} />
        <div style={{ height: 3.5, width: "50%", borderRadius: 2, background: "#e2e5e9", marginTop: 4 }} />
      </div>
    </div>
  );
}

// Managed Services — your investor presence, actively RUN by MineEx: a presence card
// with a lime "handled-for-you" check and broadcast arcs (ongoing management + comms).
function ManagedGlyph({ w = 60, mobile }) {
  if (mobile) w = 66;
  const h = w * 0.82;
  return (
    <div style={{ position: "relative", width: w, height: h }}>
      {/* the presence card being managed */}
      <div style={{ position: "absolute", left: 0, bottom: 0, width: w * 0.86, height: h * 0.82, borderRadius: 9, background: "#fff", border: `1px solid ${MX.hair}`, boxShadow: "0 16px 34px -22px rgba(10,12,15,0.4)", padding: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 8, height: 8, borderRadius: 3, background: "#0a0c0f" }} />
          <div style={{ height: 3.5, width: 22, borderRadius: 2, background: "#0a0c0f" }} />
        </div>
        <div style={{ height: 3.5, width: "84%", borderRadius: 2, background: "#d7dbe0", marginTop: 8 }} />
        <div style={{ height: 3.5, width: "62%", borderRadius: 2, background: "#e2e5e9", marginTop: 4 }} />
      </div>
      {/* MineEx managing it: lime check + outgoing broadcast arcs, top-right */}
      <svg viewBox="0 0 40 40" style={{ position: "absolute", right: -2, top: -2, width: w * 0.5, height: w * 0.5, overflow: "visible" }}>
        <path d="M15 22a7 7 0 0 1 7-7" fill="none" stroke="var(--mx-accent)" strokeWidth="2.4" strokeLinecap="round" opacity="0.5" />
        <path d="M10 24a12 12 0 0 1 12-12" fill="none" stroke="var(--mx-accent)" strokeWidth="2.4" strokeLinecap="round" opacity="0.28" />
        <circle cx="22" cy="15" r="7" fill="var(--mx-accent)" />
        <path d="M19 15.2l2.1 2.1 3.7-4" fill="none" stroke="#0a0c0f" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
