// ─────────────────────────────────────────────────────────────────────────────
// Presentation build of the MineEx company dashboard (the portal at /portal) and
// its analytics page.
//
// The real portal is authenticated and bound to a company row, so it can't be
// rendered on a public page. These reproduce its actual layout, navigation and
// cards — including the honest state of engagement analytics, which the product
// itself describes as starting to record once a profile is published rather than
// showing estimated numbers.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import {
  House, Radio, Building2, Image as ImageIcon, Calendar, BarChart3, ScrollText,
  CreditCard, Settings, ChevronDown, Sparkles, ArrowRight, FileText, Check,
  TrendingUp,
} from "lucide-react";
import { CO, IMG } from "../data.js";

// The product's own accent. These are app screens, so they keep the colour the
// app actually ships — the marketing page around them is monochrome by design, and
// the product is what supplies the colour.
const EM = "#059669";
const EM_TEXT = "#047857";
const EM_SOFT = "#ecfdf5";

const INK = "#0f172a";
const SLATE = "#64748b";
const MUTE = "#94a3b8";
const HAIR = "#e2e8f0";
const UI = { fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", color: INK };

export const PORTAL_NAV = [
  { id: "home", label: "Home", Icon: House },
  { id: "broadcast", label: "Broadcast", Icon: Radio },
  { id: "profile", label: "Company Profile", Icon: Building2 },
  { id: "media", label: "Media Library", Icon: ImageIcon },
  { id: "calendar", label: "Calendar", Icon: Calendar },
  { id: "analytics", label: "Analytics", Icon: BarChart3 },
  { id: "activity", label: "Activity Log", Icon: ScrollText },
  { id: "billing", label: "Billing", Icon: CreditCard },
  { id: "settings", label: "Settings", Icon: Settings },
];

function Sidebar({ section }) {
  return (
    <aside style={{ width: 208, flex: "0 0 auto", borderRight: `1px solid ${HAIR}`, background: "#fff", display: "flex", flexDirection: "column", padding: "18px 0" }}>
      <div style={{ padding: "0 16px" }}>
        <p style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: EM_TEXT }}>MineEx</p>
        <div style={{ marginTop: 11, display: "flex", alignItems: "center", gap: 9, border: `1px solid ${HAIR}`, background: "#f8fafc", borderRadius: 11, padding: "8px 9px" }}>
          <img src={IMG.avatar} alt="" width={26} height={26} loading="lazy" style={{ width: 26, height: 26, borderRadius: 7, objectFit: "cover", flex: "0 0 auto" }} />
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: "block", fontSize: 11.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{CO.legalName}</span>
            <span style={{ display: "block", fontSize: 9.5, color: MUTE, fontWeight: 500 }}>owner</span>
          </span>
          <ChevronDown size={12} color={MUTE} />
        </div>
      </div>
      <nav style={{ marginTop: 16, padding: "0 10px", display: "grid", gap: 2 }}>
        {PORTAL_NAV.map(({ id, label, Icon }) => {
          const on = id === section;
          return (
            <span key={id} style={{ display: "flex", alignItems: "center", gap: 10, borderRadius: 8, padding: "7px 10px", fontSize: 11.5, fontWeight: 600, background: on ? INK : "transparent", color: on ? "#fff" : SLATE }}>
              <Icon size={13.5} color={on ? "#fff" : MUTE} />
              {label}
            </span>
          );
        })}
      </nav>
    </aside>
  );
}

function Stat({ label, value, Icon, accent }) {
  return (
    <div style={{ border: `1px solid ${HAIR}`, background: "#fff", borderRadius: 13, padding: "11px 13px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={{ fontSize: 10, fontWeight: 600, color: MUTE }}>{label}</p>
        {Icon && <Icon size={12} color="#cbd5e1" />}
      </div>
      <p className="mx-num" style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.03em", marginTop: 3, color: accent ? EM : INK }}>{value}</p>
    </div>
  );
}

function HealthRing({ score = 82 }) {
  const r = 40, C = 2 * Math.PI * r;
  const color = score >= 75 ? EM : score >= 55 ? "#0ea5e9" : "#f59e0b";
  return (
    <div style={{ border: `1px solid ${HAIR}`, background: "#fff", borderRadius: 13, padding: "14px 16px", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <p style={{ alignSelf: "flex-start", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: MUTE }}>Company health</p>
      <div style={{ position: "relative", display: "grid", placeItems: "center", marginTop: 8 }}>
        <svg width="108" height="108" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="54" cy="54" r={r} fill="none" stroke="#f1f5f9" strokeWidth="10" />
          <circle cx="54" cy="54" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - score / 100)} />
        </svg>
        <div style={{ position: "absolute", textAlign: "center" }}>
          <div className="mx-num" style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, letterSpacing: "-0.03em" }}>{score}</div>
          <div style={{ fontSize: 9, fontWeight: 600, color: MUTE, marginTop: 2 }}>out of 100</div>
        </div>
      </div>
      <p style={{ marginTop: 8, fontSize: 12.5, fontWeight: 700, color }}>Strong</p>
    </div>
  );
}

const RECS = [
  "Add a catalyst for the Phase 1 assay results",
  "Upload footage from the Las Coloradas drill site",
  "Publish an update — your last release was in May",
];

const ACTIONS = [
  { title: "Broadcast an update", body: "Upload once — MineEx drafts every channel.", Icon: Radio },
  { title: "Edit company profile", body: "Overview, projects, capital, timeline, team.", Icon: Building2 },
  { title: "Upload media", body: "Drone footage, core photos, decks, logos.", Icon: ImageIcon },
  { title: "Plan catalysts", body: "Track upcoming drilling, assays and studies.", Icon: Calendar },
];

function HomeView() {
  return (
    <div>
      <h3 style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.032em" }}>Good to see you.</h3>
      <p style={{ fontSize: 11.5, color: SLATE, marginTop: 3 }}>Here's what {CO.legalName} needs today to keep investors informed.</p>

      <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 12, marginTop: 16 }}>
        <HealthRing />
        <div style={{ border: `1px solid ${HAIR}`, background: "#fff", borderRadius: 13, padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <Sparkles size={13} color={EM} />
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: MUTE }}>Recommended for you</p>
          </div>
          <div style={{ display: "grid", gap: 7, marginTop: 10 }}>
            {RECS.map((t) => (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid #f1f5f9", background: "#f8fafc", borderRadius: 10, padding: "9px 11px" }}>
                <span style={{ width: 22, height: 22, borderRadius: 7, background: "#fff", border: `1px solid ${HAIR}`, display: "grid", placeItems: "center", flex: "0 0 auto" }}>
                  <ArrowRight size={11} color={EM} />
                </span>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "#334155" }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 12 }}>
        <Stat label="Documents filed" value="18" Icon={FileText} />
        <Stat label="Updates written" value="53" Icon={Radio} />
        <Stat label="Published" value="53" Icon={Check} />
        <Stat label="Status" value="Published" Icon={TrendingUp} accent />
      </div>

      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: MUTE, marginTop: 20 }}>Quick actions</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginTop: 9 }}>
        {ACTIONS.map(({ title, body, Icon }) => (
          <div key={title} style={{ display: "flex", alignItems: "flex-start", gap: 10, border: `1px solid ${HAIR}`, background: "#fff", borderRadius: 13, padding: "11px 13px" }}>
            <span style={{ width: 28, height: 28, borderRadius: 9, background: "#f1f5f9", display: "grid", placeItems: "center", color: SLATE, flex: "0 0 auto" }}><Icon size={14} /></span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: "block", fontSize: 12, fontWeight: 700 }}>{title}</span>
              <span style={{ display: "block", fontSize: 10.5, color: SLATE, marginTop: 1 }}>{body}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnalyticsHome() {
  return (
    <div>
      <h3 style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.032em" }}>Analytics</h3>
      <p style={{ fontSize: 11.5, color: SLATE, marginTop: 3, maxWidth: 460 }}>
        The numbers that matter — starting with what your company has published, then investor engagement as it comes online.
      </p>

      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: MUTE, marginTop: 18 }}>Your content</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 9 }}>
        <Stat label="Documents filed" value="18" Icon={FileText} />
        <Stat label="Timeline entries" value="53" Icon={ScrollText} />
        <Stat label="Projects" value="2" Icon={Building2} />
        <Stat label="Updates published" value="53" Icon={Radio} />
      </div>

      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: MUTE, marginTop: 20 }}>Investor engagement</p>
      <div style={{ border: `1px solid ${HAIR}`, background: "#fff", borderRadius: 13, padding: 15, marginTop: 9, display: "flex", gap: 11, alignItems: "flex-start" }}>
        <span style={{ width: 32, height: 32, borderRadius: 10, background: "#f1f5f9", display: "grid", placeItems: "center", color: MUTE, flex: "0 0 auto" }}><BarChart3 size={16} /></span>
        <span>
          <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#1e293b" }}>Profile views, followers, reading time and geography</span>
          <span style={{ display: "block", fontSize: 11.5, color: SLATE, marginTop: 4, lineHeight: 1.5, maxWidth: 520 }}>
            These begin recording once your profile is published and starts receiving traffic. We only report engagement from real
            investor activity — never estimated or inflated numbers.
          </span>
        </span>
      </div>
    </div>
  );
}

function DashboardUIBase({ section = "home" }) {
  return (
    <div style={{ display: "flex", height: "100%", minHeight: 430, background: "#f8fafc", ...UI }}>
      <Sidebar section={section} />
      <div style={{ flex: 1, minWidth: 0, overflow: "hidden", padding: "22px 26px" }}>
        {section === "analytics" ? <AnalyticsHome /> : <HomeView />}
      </div>
    </div>
  );
}

export const DashboardUI = React.memo(DashboardUIBase);
