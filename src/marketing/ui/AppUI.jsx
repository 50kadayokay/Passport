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
  ChevronRight, BadgeCheck, Image as ImageIcon, FileText,
} from "lucide-react";
import { EASE } from "../system.jsx";
import { CO, PROJECTS, TEAM, RELEASES, DIRECTORY, IMG } from "../data.js";

// The product's own accent. These are app screens, so they keep the colour the
// app actually ships — the marketing page around them is monochrome by design, and
// the product is what supplies the colour.
const EM = "#059669";
const EM_TEXT = "#047857";
const EM_SOFT = "#ecfdf5";

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
  activity: ["rgba(5,150,105,0.11)", "#059669"],
};

function FactTile({ f }) {
  const Icon = FACT_ICON[f.icon] || Gem;
  const [bg, ic] = FACT_TINT[f.icon] || FACT_TINT.gem;
  return (
    <div style={{ background: "#fff", borderRadius: 14, padding: "13px 12px", display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ width: 30, height: 30, borderRadius: 999, background: bg, display: "grid", placeItems: "center", flex: "0 0 auto" }}>
        <Icon size={15} color={ic} strokeWidth={2} />
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: MUTE, whiteSpace: "nowrap" }}>{f.label}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em", marginTop: 1 }}>
          {f.live && <span style={{ width: 6, height: 6, borderRadius: 999, background: EM, flex: "0 0 auto" }} />}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.value}</span>
        </span>
      </span>
    </div>
  );
}

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

function StatusCard() {
  const s = CO.status;
  return (
    <Card style={{ overflow: "hidden" }}>
      <div style={{ position: "relative", height: 132 }}>
        <img src={IMG.status} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(4,8,14,0.34) 0%, rgba(4,8,14,0.05) 42%, rgba(4,8,14,0.52) 100%)" }} />
        <div style={{ position: "absolute", top: 11, left: 14, display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: "#f59e0b" }} />
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", color: "#fff" }}>COMPANY STATUS</span>
        </div>
        <div style={{ position: "absolute", left: 14, right: 14, bottom: 11 }}>
          <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.15em", color: "rgba(255,255,255,0.85)" }}>TRADES AS</p>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            {CO.listings.map(([ex, sym]) => (
              <span key={ex} style={{ background: "rgba(255,255,255,0.22)", backdropFilter: "blur(6px)", borderRadius: 999, padding: "5px 10px", fontSize: 11, color: "#fff", fontWeight: 500 }}>
                {ex} <b style={{ fontWeight: 800 }}>{sym}</b>
              </span>
            ))}
          </div>
        </div>
      </div>
      <div style={{ padding: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, background: "#fff" }}>
        {CO.facts.map((f) => <FactTile key={f.label} f={f} />)}
      </div>
      <div style={{ padding: "0 10px 12px" }}>
        <div style={{ background: "#f8fafc", borderRadius: 14, padding: 12 }}>
          <p style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: MUTE }}>{s.headline}</p>
          <div style={{ height: 5, borderRadius: 999, background: "#e2e8f0", marginTop: 8, overflow: "hidden" }}>
            <div style={{ width: `${(s.done / s.total) * 100}%`, height: "100%", borderRadius: 999, background: EM }} />
          </div>
          <p style={{ fontSize: 12, color: SLATE, marginTop: 7 }}>
            <b style={{ color: INK, fontWeight: 700 }} className="mx-num">{s.done} / {s.total} {s.unit}</b> · {s.eta}
          </p>
        </div>
      </div>
    </Card>
  );
}

function AiBriefCard() {
  return (
    <div style={{ borderRadius: 18, padding: 18, background: "linear-gradient(135deg, #4f6ef7 0%, #4aa8e8 100%)", color: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 30, height: 30, borderRadius: 10, background: "rgba(255,255,255,0.22)", display: "grid", placeItems: "center" }}><Zap size={16} fill="#fff" color="#fff" /></span>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.2em" }}>AI BRIEF</span>
      </div>
      <p style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.03em", marginTop: 14 }}>Explain Kingsmen in 60 Seconds</p>
      <p style={{ fontSize: 13, lineHeight: 1.45, color: "rgba(255,255,255,0.88)", marginTop: 6 }}>
        Summary covering opportunity, risks, catalysts and project potential.
      </p>
    </div>
  );
}

function TabOverview() {
  return (
    <div style={{ padding: "12px 12px 24px", display: "grid", gap: 12 }}>
      <StatusCard />
      <AiBriefCard />
    </div>
  );
}

function TabProjects() {
  return (
    <div style={{ padding: "12px 12px 24px", display: "grid", gap: 12 }}>
      {PROJECTS.map((p) => (
        <Card key={p.name} style={{ overflow: "hidden" }}>
          <div style={{ position: "relative", height: 128 }}>
            <img src={p.image} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(4,8,14,0) 40%, rgba(4,8,14,0.66) 100%)" }} />
            <div style={{ position: "absolute", left: 14, bottom: 12 }}>
              <p style={{ fontSize: 18, fontWeight: 800, color: "#fff", letterSpacing: "-0.03em" }}>{p.name}</p>
              <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.82)", marginTop: 1 }}>{p.district}</p>
            </div>
            <span style={{ position: "absolute", top: 11, right: 12, background: "rgba(255,255,255,0.92)", borderRadius: 999, padding: "4px 10px", fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", color: INK }}>{p.stage}</span>
          </div>
          <div style={{ padding: "4px 14px 12px" }}>
            {p.snapshot.map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: `1px solid #f1f5f9` }}>
                <span style={{ fontSize: 12.5, color: SLATE }}>{k}</span>
                <span style={{ fontSize: 12.5, fontWeight: 700 }}>{v}</span>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

const CAT_TINT = {
  Exploration: ["#eff6ff", "#2563eb"],
  Acquisition: ["#f5f3ff", "#7c3aed"],
  Financing: ["#ecfdf5", "#047857"],
  Drilling: ["#fff7ed", "#c2410c"],
};

function TabTimeline() {
  return (
    <div style={{ padding: "14px 12px 24px" }}>
      <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.12em", color: MUTE, textTransform: "uppercase", padding: "0 4px 10px" }}>2026</p>
      <div style={{ position: "relative", paddingLeft: 18 }}>
        <span style={{ position: "absolute", left: 5, top: 6, bottom: 6, width: 2, background: HAIR, borderRadius: 2 }} />
        {RELEASES.map((r) => {
          const [bg, fg] = CAT_TINT[r.category] || CAT_TINT.Exploration;
          return (
            <div key={r.date} style={{ position: "relative", marginBottom: 10 }}>
              <span style={{ position: "absolute", left: -17, top: 18, width: 10, height: 10, borderRadius: 999, background: r.key ? EM : "#fff", border: `2px solid ${r.key ? EM : HAIR}` }} />
              <Card pad={13}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: MUTE }}>{r.d}</span>
                  <span style={{ background: bg, color: fg, borderRadius: 999, padding: "3px 8px", fontSize: 9.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}>{r.category}</span>
                </div>
                <p style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: "-0.02em", marginTop: 7, lineHeight: 1.25 }}>{r.label}</p>
                <p style={{ fontSize: 12.5, color: SLATE, marginTop: 5, lineHeight: 1.4 }}>{r.why}</p>
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
    <div style={{ padding: "12px 12px 24px", display: "grid", gap: 12 }}>
      <Card pad={16}>
        <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", color: EM_TEXT, textTransform: "uppercase" }}>Capital</p>
        <p style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.032em", marginTop: 6 }}>{c.headline}</p>
        <div style={{ height: 6, borderRadius: 999, background: "#e2e8f0", marginTop: 12, overflow: "hidden" }}>
          <div style={{ width: "100%", height: "100%", background: EM, borderRadius: 999 }} />
        </div>
        <p style={{ fontSize: 11.5, color: MUTE, marginTop: 7 }}>{c.note}</p>
      </Card>
      <Card pad={"6px 16px 10px"}>
        {c.rows.map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "11px 0", borderBottom: `1px solid #f1f5f9` }}>
            <span style={{ fontSize: 13, color: SLATE }}>{k}</span>
            <span className="mx-num" style={{ fontSize: 13, fontWeight: 700 }}>{v}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

function TabTeam() {
  return (
    <div style={{ padding: "12px 12px 24px", display: "grid", gap: 10 }}>
      {TEAM.map((m) => (
        <Card key={m.name} pad={13} style={{ display: "flex", alignItems: "center", gap: 13 }}>
          <span style={{ width: 44, height: 44, borderRadius: 999, background: "#eef2f7", display: "grid", placeItems: "center", fontSize: 14.5, fontWeight: 800, color: "#64748b", flex: "0 0 auto" }}>{m.initials}</span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em" }}>{m.name}</span>
            <span style={{ display: "block", fontSize: 12.5, color: SLATE, marginTop: 1 }}>{m.role}</span>
          </span>
          <ChevronRight size={17} color={MUTE} style={{ marginLeft: "auto", flex: "0 0 auto" }} />
        </Card>
      ))}
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

function ProfileScreenBase({ tab = "overview", following = false, onFollow, showNav = true, nav = "explore" }) {
  const View = TAB_VIEW[tab] || TabOverview;
  return (
    <AppShell nav={nav} showNav={showNav}>
      <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <ProfileHeader following={following} onFollow={onFollow} />
        <ProfileTabs tab={tab} />
        <div className="mx-noscroll" style={{ flex: 1, minHeight: 0, overflow: "hidden", background: APP_BG }}>
          <div key={tab} className="pp-fade">
            <View />
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

function ExploreScreenBase({ activeFilters = [], results = DIRECTORY, dimNonMatching = false, sheet = null }) {
  return (
    <AppShell nav="explore" bg="#fff">
      <div style={{ height: "100%", display: "flex", flexDirection: "column", background: APP_BG, position: "relative" }}>
        <div style={{ background: "#fff", padding: "6px 16px 14px" }}>
          <h3 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.035em" }}>Explore</h3>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <span style={{ flex: 1, height: 40, borderRadius: 12, background: "#f1f5f9", display: "flex", alignItems: "center", gap: 8, padding: "0 12px" }}>
              <Search size={16} color={MUTE} />
              <span style={{ fontSize: 14, color: MUTE }}>Search companies</span>
            </span>
            <span style={{ width: 40, height: 40, borderRadius: 12, background: "#f1f5f9", display: "grid", placeItems: "center" }}>
              <SlidersHorizontal size={16} color={INK} />
            </span>
          </div>
          <div className="mx-noscroll" style={{ display: "flex", gap: 7, marginTop: 12, overflowX: "auto" }}>
            {FILTER_SETS.map(({ id, label, Icon }) => {
              const hit = activeFilters.find((f) => f.set === id);
              return (
                <span
                  key={id}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6, flex: "0 0 auto",
                    borderRadius: 999, padding: "8px 13px", fontSize: 12.5, fontWeight: 700,
                    border: `1px solid ${hit ? EM : HAIR}`,
                    background: hit ? EM : "#fff",
                    color: hit ? "#fff" : INK,
                    transition: `background 420ms ${EASE}, border-color 420ms ${EASE}, color 300ms ${EASE}`,
                  }}
                >
                  <Icon size={13.5} strokeWidth={2.2} />
                  {hit ? hit.value : label}
                </span>
              );
            })}
          </div>
        </div>
        <div className="mx-noscroll" style={{ flex: 1, minHeight: 0, overflow: "hidden", padding: "12px 12px 20px", display: "grid", gap: 9, alignContent: "start" }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: MUTE, padding: "0 4px" }}>
            {activeFilters.length ? "Matching companies" : "Recommended for you"}
          </p>
          {results.map((c, i) => (
            <CompanyRow key={c.name} c={c} dim={dimNonMatching && i > 2} />
          ))}
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
            <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: EM_TEXT }}>Why this matters</p>
            <p style={{ fontSize: 14, lineHeight: 1.5, marginTop: 7, color: "#0f3d2e" }}>{release.why}</p>
          </div>

          <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTE, marginTop: 20 }}>Key takeaways</p>
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

function MediaScreenBase({ items }) {
  // Thumbnails paint at ~110 css px, so they take the small variant — never the
  // full-size original.
  const grid =
    items || [IMG.rig, IMG.adit, IMG.sampling, IMG.timbered, IMG.field, IMG.shaft, IMG.district, IMG.mineAdit, IMG.colonial].map((i) => i.sm);
  return (
    <AppShell nav="today">
      <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#fff" }}>
        <div style={{ padding: "4px 16px 12px" }}>
          <h3 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.035em" }}>Media</h3>
          <div style={{ display: "flex", gap: 18, marginTop: 12 }}>
            {["All", "Video", "Site", "Team"].map((t, i) => (
              <span key={t} style={{ paddingBottom: 8, fontSize: 14, fontWeight: 700, color: i === 0 ? INK : MUTE, borderBottom: `2px solid ${i === 0 ? INK : "transparent"}` }}>{t}</span>
            ))}
          </div>
        </div>
        <div style={{ position: "relative", height: 190, margin: "0 12px", borderRadius: 16, overflow: "hidden" }}>
          <img src={IMG.aerial.src} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(4,8,14,0.1) 40%, rgba(4,8,14,0.68) 100%)" }} />
          <span style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 52, height: 52, borderRadius: 999, background: "rgba(255,255,255,0.92)", display: "grid", placeItems: "center" }}>
            <Play size={20} fill={INK} color={INK} style={{ marginLeft: 3 }} />
          </span>
          <div style={{ position: "absolute", left: 14, bottom: 12 }}>
            <p style={{ fontSize: 15, fontWeight: 800, color: "#fff", letterSpacing: "-0.025em" }}>Las Coloradas · site tour</p>
            <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.8)", marginTop: 1 }}>Project footage</p>
          </div>
        </div>
        <div style={{ padding: "12px 12px 20px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          {grid.map((src, i) => (
            <div key={i} style={{ position: "relative", aspectRatio: "1", borderRadius: 10, overflow: "hidden", background: "#e2e8f0" }}>
              <img src={src} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
