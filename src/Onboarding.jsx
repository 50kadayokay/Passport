import React, { useState, useEffect, useRef, useMemo, useContext, createContext } from "react";
import {
  Home, Clock, Map as MapIcon, PieChart, Users,
  BadgeCheck, Bookmark, Plus, Check, Zap, X,
  ChevronRight, ChevronLeft, Gem, MapPin, Wallet, TrendingUp,
  Coins, Pickaxe, Route, Mountain, Navigation,
  Target, FlaskConical, Drill, ShieldCheck, Info, MessageSquare,
  Activity, Landmark, Radio, Eye, Minus, Layers, ArrowUpRight, Crosshair, Camera, Grid3x3,
  Compass, ScanLine, CircleUserRound, Search, Bell, Settings, ChevronDown, Plus as PlusIcon, Sparkles, Flame,
  Star, Scan, User, Newspaper, Globe, QrCode, Focus, TrendingDown,
  Droplets, Plane, Building2, Factory, Hammer, GalleryHorizontal,
  Type, FileUp, Loader2, RotateCcw, AlertTriangle, Upload, ArrowRight, ArrowLeft, CheckCircle2, ImageIcon, Trash2,
} from "lucide-react";
// The onboarding preview reuses the SAME renderer the live app uses, so the two
// can never drift. Feeding it the in-progress `profile` shows exactly what will
// publish.
import AppCompanyProfile from "./aiBrief/screens/CompanyProfile.jsx";
import { StatusBar as AppStatusBar } from "./aiBrief/components.jsx";
import { authHeaders, getUser } from "./lib/auth.js";
import { uploadCompanyMedia, flushProfileAssets } from "./lib/storage.js";
import { SUPABASE_URL, SUPABASE_ANON } from "./lib/supabase.js";

/* --- stubbed data consts (stripped long lines); blank schema by default --- */
const CAP = { rows: [], outstanding: "", fd: "", debt: "$0" };
let PROJECTS_DATA = {};
const SEED_PROJECTS_DATA = {};
let PR_YEARS = [];
const SEED_PR_YEARS = [];
const FULL = {};
let AVATAR="", STATUS_IMG="", STATUS_LOGO="";
const KR_AVATAR="", SITE_PHOTO="", KR_LOGO="";
let TEAM_MEMBERS = [];
const SEED_TEAM_MEMBERS = [];

/* ============================================================
   Supabase — read/write for onboarding profiles
   Publishable ("anon") key; safe to ship in the client.
   ============================================================ */
// SUPABASE_URL / SUPABASE_ANON now come from src/lib/supabase.js (env-driven).

// The template row is a reference only — it must never be overwritten by a save.
const RESERVED_SLUG = "kingsmen-resources";

// slug ← company name: lowercase, spaces→hyphens, stripped of anything unsafe.
function slugify(name) {
  return String(name || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Derive the save slug from the entered name. Empty name → "" (blocks the save).
// If the name would collide with the protected template row, divert it so the
// "kingsmen-resources" reference is never clobbered.
function deriveSlug(name) {
  const s = slugify(name);
  if (!s) return "";
  return s === RESERVED_SLUG ? `${s}-copy` : s;
}

// UPSERT the signed-in company's own profile. Runs with the user's JWT so RLS
// ties the row to them via owner_id; conflict target is `slug` so re-saving the
// same company merges in place.
async function sbSaveProfile(profile, slug, status) {
  if (!slug) throw new Error("Enter a company name first");
  if (slug === RESERVED_SLUG) throw new Error("The template row is read-only");
  const user = getUser();
  if (!user) throw new Error("Please sign in to save your profile");
  const name = (profile && profile.company && profile.company.name) || "";
  // Push any base64 images up to Storage first — the DB never stores base64.
  const cleanProfile = await flushProfileAssets(profile);
  const row = { slug, name, profile: cleanProfile, owner_id: user.id };
  if (status) row.status = status;
  const headers = await authHeaders();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/companies?on_conflict=slug`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403 || /row-level security/.test(detail)) {
      throw new Error("That company name is taken by another account. Try a different name.");
    }
    throw new Error(`Save failed (${res.status})${detail ? `: ${detail}` : ""}`);
  }
  return true;
}

// Load the company owned by the signed-in user (for resume/edit), or null.
async function fetchMyCompany() {
  const user = getUser();
  if (!user) return null;
  const headers = await authHeaders();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/companies?owner_id=eq.${user.id}&select=*&limit=1`, { headers });
  if (!res.ok) return null;
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

/* ============================================================
   PASSPORT — Light FinTech Aesthetic
   Inspired by Apple, Wealthsimple, & Arc Browser
   ============================================================ */

const EM = "#10b981";       // emerald — active / live states only
const EM_TEXT = "#0f9b73";  // slightly deeper emerald for small text on white

// ---- Section identity system (subtle accents over white/black) ----
// Each section reads as a distinct "environment" while emerald stays the brand.
const THEME = {
  overview: { key: "Company",     c: "#10b981", t: "#0f9b73", g: ["#06281d", "#0f3d2e"], soft: "rgba(16,185,129,0.10)" }, // emerald
  timeline: { key: "Progress",    c: "#2563eb", t: "#1d4ed8", g: ["#0b1f4d", "#10306e"], soft: "rgba(37,99,235,0.10)" },  // electric blue
  projects: { key: "Assets",      c: "#ea580c", t: "#c2410c", g: ["#3a2606", "#5c3d0f"], soft: "rgba(234,88,12,0.12)" }, // warm orange
  capital:  { key: "Financials",  c: "#7c3aed", t: "#6d28d9", g: ["#2a1259", "#3b1d7a"], soft: "rgba(124,58,237,0.10)" }, // premium purple
  team:     { key: "Leadership",  c: "#1e3a8a", t: "#1e3a8a", g: ["#0f172a", "#1e293b"], soft: "rgba(30,58,138,0.10)" },  // deep navy
  media:    { key: "Media",       c: "#db2777", t: "#be185d", g: ["#4a0e2e", "#6d1840"], soft: "rgba(219,39,119,0.10)" }, // rose
  map:      { key: "Geography",   c: "#0d9488", t: "#0f766e", g: ["#06302b", "#0c4a44"], soft: "rgba(13,148,136,0.10)" }, // slate teal
};

// Small reusable section kicker (colored eyebrow above a view title)
function Kicker({ section }) {
  const th = THEME[section];
  return <span className="text-[10px] font-extrabold uppercase tracking-[0.2em]" style={{ color: th.t }}>{th.key}</span>;
}

// Fades text in word-by-word like an LLM — smooth blur + rise, gently staggered.
function WordFade({ text, className, delay = 0, step = 70 }) {
  const words = String(text).split(" ");
  return (
    <span className={className}>
      {words.map((w, i) => (
        <span key={i}>
          <span className="pp-wordfade" style={{ display: "inline-block", animationDelay: `${delay + i * step}ms` }}>{w}</span>
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </span>
  );
}

// Streams text in like an LLM generating a response (with a thin caret while typing).
function TypeIn({ text, speed = 16 }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setN(i);
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);
  const done = n >= text.length;
  return (
    <span>
      {text.slice(0, n)}
      {!done && <span className="ml-px inline-block h-[0.9em] w-[2px] -translate-y-[1px] align-middle pp-caret" style={{ background: "currentColor" }} />}
    </span>
  );
}


const COMPANY = {
  name: "Company Name",
  website: "companywebsite.com",
  slogan: "Add a short slogan",
  ticker: "",
  commodity: "Silver & Gold",
  jurisdiction: "",
  status: "Drilling Underway / Assays Pending",
  marketCap: "C$18.5M",
  sharePrice: "C$0.21",
  cash: "C$4.2M",
  workingCapital: "C$4.0M",
  ev: "C$14.3M",
  debt: "C$0",
  shares: "88.2M",
  fd: "112.5M",
};



const EXCHANGES = [];


const THESIS = [];

const STAGES = ["Acquisition", "Validation", "Target Gen", "Drilling", "Discovery", "Production"];
const STAGE_NOW = 3;
const STAGE_DESC = [
  "Secured the option to earn 100% of the Project 1 silver-gold district.",
  "Confirmed historic high-grade silver through surface sampling and mapping.",
  "Defined drill-ready targets along the mineralized structure.",
  "Phase 1 diamond drilling is turning at Project 1 right now.",
  "Convert drill intercepts into a maiden mineral resource estimate.",
  "Permit, build and bring the deposit into production.",
];

/* ---- V2 narrative + classification system ---------------------------- */
const ONE_LINER =
  "the company is advancing a high-grade silver-gold district — turning high-grade drill intercepts into a maiden discovery on a fully funded program.";

const FUNDING = {
  funded: true,
  label: "Fully Funded · Current Program",
  note: "The latest financing provides enough capital to fund the current exploration program with no near-term financing required.",
  cautionLabel: "Financing Likely Required",
  cautionNote: "Current cash may not fully cover the planned program, and additional financing could be required in the near term.",
};

// Capital Status is state-driven. `state` is one of the documented set below;
// `tone` tints the pill (funded → green, financing expected → amber, capital
// events → blue). Headline / summary / runway endpoints are plain factual text.
const CAP_STATES = {
  "Fully Funded": "ok",
  "Recently Financed": "ok",
  "Production Funded": "ok",
  "Financing Expected": "warn",
  "Capital Allocation Update": "info",
  "Strategic Acquisition Funding": "info",
};
const CAP_TONE = {
  ok:   { dot: "#10b981", text: "#0f9b73", ring: "#10b981" },
  warn: { dot: "#f59e0b", text: "#b45309", ring: "#f59e0b" },
  info: { dot: "#2563eb", text: "#1d4ed8", ring: "#2563eb" },
};

const CAPSTATUS = {};

// ===== Capital page: factual + educational template data =====
const NR = "Not Reported";

// Drill-down figures for the four Financial Snapshot cards (facts only).
const METRIC_DETAIL = {};

// Ownership — lives only inside Share Structure (single source of truth).
const OWNERSHIP = [
  ["Institutional Ownership", NR],
  ["Insider Ownership", "≈24%"],
];

// Plain-English, educational only — no advice, ratings, or opinions.
const EDU = {
  marketCap: { t: "Market Capitalization",
    what: "The total market value of a company's outstanding shares.",
    why: "It is the most common way to size a company and compare it with peers.",
    how: "Current share price multiplied by the number of basic shares outstanding." },
  cash: { t: "Cash",
    what: "The cash and cash equivalents reported on the most recent balance sheet.",
    why: "Cash shows how much capital is available to fund operations and exploration.",
    how: "Taken directly from the latest financial statements as of the reporting date." },
  debt: { t: "Debt",
    what: "Money the company owes, including long-term debt, convertible notes and lease liabilities.",
    why: "Debt represents obligations that must be repaid and ranks ahead of shareholders.",
    how: "Summed from interest-bearing liabilities reported on the latest balance sheet." },
  ev: { t: "Enterprise Value",
    what: "A measure of total company value that includes debt and excludes cash.",
    why: "It lets investors compare companies with different cash and debt levels on a like-for-like basis.",
    how: "Market capitalization plus total debt minus cash and equivalents." },
  workingCapital: { t: "Working Capital",
    what: "Current assets minus current liabilities on the most recent balance sheet.",
    why: "It shows the short-term liquidity available to fund day-to-day operations.",
    how: "Reported current assets less reported current liabilities as of the filing date." },
  debtToEquity: { t: "Debt-to-Equity",
    what: "A ratio comparing total debt to shareholders' equity.",
    why: "It indicates how much a company relies on debt versus equity to finance itself.",
    how: "Total interest-bearing debt divided by total shareholders' equity." },
  snapshot: { t: "Financial Snapshot",
    what: "The headline capital metrics that describe a company's size and balance sheet today.",
    why: "Together they give a quick, comparable read on value, liquidity and leverage.",
    how: "Tap any metric to see the figures behind it and how it is calculated." },
  keyfacts: { t: "Key Facts",
    what: "A factual summary of the company's most recently reported capital figures.",
    why: "It gathers the headline numbers a company discloses in one place.",
    how: "Each figure is taken directly from the company's filings and news releases." },
  financing: { t: "Financing History",
    what: "A record of the equity financings a company has completed over time.",
    why: "It shows how a company has raised the capital used to advance its projects.",
    how: "Each entry lists the amount, type, price and stated use of proceeds as disclosed." },
  structure: { t: "Share Structure",
    what: "The breakdown of issued shares plus the options and warrants that could become shares.",
    why: "It shows the current ownership base and how it could grow if options and warrants are exercised.",
    how: "Compiled from the company's reported issued-and-outstanding share data." },
};

// Impact rating → colour. Reserved emerald only for the very top tier.
const IMPACT_STYLE = {
  Transformational: { c: "#0f9b73", bg: "rgba(16,185,129,0.12)", dot: "#10b981" },
  High:             { c: "#b45309", bg: "rgba(245,158,11,0.14)", dot: "#f59e0b" },
  Moderate:         { c: "#1d4ed8", bg: "rgba(37,99,235,0.10)",  dot: "#3b82f6" },
  Low:              { c: "#475569", bg: "rgba(100,116,139,0.10)", dot: "#94a3b8" },
};

// News category → colour + label.
const CAT_STYLE = {
  Discovery:         { c: "#0f9b73", bg: "rgba(16,185,129,0.10)" }, // emerald
  Drilling:          { c: "#1d4ed8", bg: "rgba(37,99,235,0.10)" },  // blue
  Financing:         { c: "#6d28d9", bg: "rgba(124,58,237,0.10)" }, // purple
  Permitting:        { c: "#c2410c", bg: "rgba(234,88,12,0.10)" },  // orange
  Infrastructure:    { c: "#475569", bg: "rgba(100,116,139,0.10)" },// slate
  Acquisition:       { c: "#a16207", bg: "rgba(180,130,20,0.12)" }, // gold
  "Resource Growth": { c: "#0d9488", bg: "rgba(13,148,136,0.10)" }, // turquoise
  Exploration:       { c: "#475569", bg: "rgba(100,116,139,0.10)" },
  Corporate:         { c: "#64748b", bg: "rgba(100,116,139,0.08)" },
};

// Derive {cat, impact} from a release's text — no data mutation needed.
function classify(it) {
  const t = ((it.headline || "") + " " + (it.label || "")).toLowerCase();
  let cat;
  if (it.category) cat = it.category;
  else if (/private placement|bought deal|financing|raises|raise|upsize|proceeds/.test(t)) cat = "Financing";
  else if (/permit|permitting|environmental approval|authoriz/.test(t)) cat = "Permitting";
  else if (/road|access road|infrastructure|construction|power line|camp|water/.test(t)) cat = "Infrastructure";
  else if (/resource estimate|maiden resource|resource growth|mineral resource|expands resource/.test(t)) cat = "Resource Growth";
  else if (/discovery|new zone|new discovery/.test(t)) cat = "Discovery";
  else if (/acquir|option to|granted option|\bloi\b|letter of intent|land position|consolidat|claim|access agreement/.test(t)) cat = "Acquisition";
  else if (/intersect|hits|g\/t|down-dip|step-out|continuity/.test(t)) cat = "Discovery";
  else if (/drill/.test(t)) cat = "Drilling";
  else if (/annual|meeting|director|appoint|marketing|engages|plan/.test(t)) cat = "Corporate";
  else cat = "Exploration";

  let impact;
  if (it.key) impact = /bought deal|financing|continuity/.test(t) ? "Transformational" : "High";
  else if (cat === "Financing" || cat === "Acquisition" || cat === "Discovery" || cat === "Resource Growth") impact = "Moderate";
  else impact = "Low";
  return { cat, impact };
}

// Plain-English investor takeaway derived from impact tier.
const TAKEAWAY_BY_IMPACT = {
  Transformational: "A thesis-defining event that materially re-rates the story.",
  High: "A meaningful step-change that strengthens the investment case.",
  Moderate: "A constructive development that de-risks the path forward.",
  Low: "Incremental progress that keeps the program on track.",
};

/* ---- V3: current status, "what's next", stage impact, health, track record ---- */
const STATUS = {
  state: "26-Hole Drill Campaign",
  tone: EM,
  detail: "Phase 1 diamond drilling is actively underway at Project 1.",
  progressLabel: "14 / 26 holes",
  latest: "Three drill holes submitted to the lab for assays.",
  impact: "Could expand the high-grade silver system.",
  next: "Phase 1 assay results",
  nextCatalyst: "Phase 1 Assays",
  eta: "Expected H2 2026",
};

const NEXT_BY_CAT = {
  Discovery:   "Expect follow-up holes and assays that test how far the high-grade zone extends along strike and at depth.",
  Drilling:    "Core is being logged and sampled; assay results follow as the lab reports them.",
  Financing:   "Proceeds fund the active program — capital converts directly into drilling and news flow.",
  Acquisition: "The new ground is folded into the plan and queued for sampling and drill testing.",
  Exploration: "Results feed target generation, sharpening where the next holes are collared.",
  Corporate:   "Execution continues against the funded 2026 catalyst calendar.",
};

const STAGE_IMPACT_BY_CAT = {
  Discovery:   ["Exploration", "Discovery"],
  Drilling:    ["Target Gen", "Discovery"],
  Financing:   ["Funded", "Drilling"],
  Acquisition: ["Acquisition", "Validation"],
  Exploration: ["Validation", "Target Gen"],
  Corporate:   ["On Plan", "On Plan"],
};

// Investor health scorecard (5 = strongest). Judgment-based, at-a-glance.
const HEALTH = [];

// Board-level track record (aggregates grounded in the bios + financing history).
const TRACK = [];

/* ============================================================
   PRESS-RELEASE TIMELINE DATA  —  full archive 2023-2026
   PR_YEARS: years (newest first); each release has a summarized
   label, the original headline, Why This Matters, Key Takeaways.
   FULL: id -> full original press-release text.
   ============================================================ */


/* ---------- Hook for smooth numerical animations ---------- */
function useTween(target, duration = 500) {
  const [val, setVal] = useState(target);
  const raf = useRef();
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const startVal = from.current;
    const delta = target - startVal;
    cancelAnimationFrame(raf.current);
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      setVal(startVal + delta * eased);
      if (t < 1) raf.current = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);
  return val;
}

/* ---------- Shared style tokens (light) ---------- */
const card = "rounded-[24px] border border-slate-200 bg-white shadow-sm";
// Elevated card — matches the Capital Status card (deep soft shadow). Reusable template token.
const cardShadow = "0 1px 2px rgba(15,23,42,0.03), 0 30px 60px -26px rgba(15,23,42,0.28)";
const cardElevated = "rounded-3xl border border-slate-200 bg-white";
const subLabel = "text-[10px] uppercase tracking-[0.2em] text-slate-500 font-semibold";
const DARK_CTA = { background: "#0f172a", color: "#ffffff" };

/* ============================================================
   CHROME
   ============================================================ */
function StatusBar() {
  return (
    <div className="flex items-center justify-between px-8 pt-3 pb-2 text-[12px] font-medium text-slate-900 select-none">
      <span className="tabular-nums tracking-tight">9:41</span>
      <div className="flex items-center gap-1.5">
        <span className="flex items-end gap-[2px]">
          {[3, 5, 7, 9].map((h, i) => (
            <span key={i} className="w-[3px] rounded-sm bg-slate-900" style={{ height: h }} />
          ))}
        </span>
        <Radio size={12} className="text-slate-900" />
        <span className="ml-1 flex h-[11px] w-[22px] items-center rounded-[3px] border border-slate-400 p-[1.5px]">
          <span className="h-full w-[75%] rounded-[1px] bg-slate-900" />
        </span>
      </div>
    </div>
  );
}

// Subtle haptic feedback on selection (no-op where unsupported).
function haptic() { try { if (navigator.vibrate) navigator.vibrate(7); } catch (e) {} }

/* ============================================================
   PRIMARY APP NAVIGATION — icon-only, premium.
   Discover · Following · [Scan] · Feed · Profile
   Center Scan is an elevated emerald action button.
   ============================================================ */
// Gemini-style iridescent star — rainbow gradient fill with a soft rotating glow.
function RainbowStar({ active }) {
  return (
    <span className="relative grid place-items-center" style={{ height: 26, width: 26 }}>
      <span
        aria-hidden="true"
        className="pp-glow pp-breathe absolute rounded-full"
        style={{
          height: active ? 30 : 25,
          width: active ? 30 : 25,
          background: "conic-gradient(from 210deg, #4f8cff, #8a5cff, #ff5cae, #ff9d4d, #38e0c8, #4f8cff)",
          filter: "blur(7px)",
          transition: "height .3s ease, width .3s ease",
        }}
      />
      <svg width="23" height="23" viewBox="0 0 24 24" className="relative" style={{ filter: active ? "drop-shadow(0 1px 3px rgba(124,92,255,0.5))" : "none" }}>
        <defs>
          <linearGradient id="ppStarGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#4f8cff" />
            <stop offset="0.38" stopColor="#8a5cff" />
            <stop offset="0.68" stopColor="#ff5cae" />
            <stop offset="1" stopColor="#ff9d4d" />
          </linearGradient>
        </defs>
        <path
          d="M12 2.4l2.63 5.33 5.88.86-4.255 4.146 1.005 5.864L12 15.94l-5.26 2.76 1.005-5.864L3.49 8.59l5.88-.86z"
          fill="url(#ppStarGrad)"
          stroke="url(#ppStarGrad)"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function BottomNav({ nav, setNav }) {
  const INK = "#0f172a";
  const items = [
    { id: "news", Icon: Newspaper },
    { id: "discover", Icon: Search },
    { id: "following", Icon: Star },
    { id: "feed", Icon: Activity },
    { id: "profile", Icon: User },
  ];
  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-40 px-5 pb-7 pt-2"
      style={{ background: "rgba(255,255,255,0.95)", backdropFilter: "blur(20px) saturate(180%)", borderTop: "1px solid rgba(226,232,240,0.7)" }}
    >
      <div className="flex items-center justify-between">
        {items.map((it) => {
          const on = nav === it.id;
          return (
            <button
              key={it.id}
              onClick={() => { haptic(); setNav(it.id); }}
              aria-label={it.id}
              className="grid place-items-center rounded-2xl transition active:scale-90"
              style={{ height: 44, width: 56, background: on ? "#f1f5f9" : "transparent" }}
            >
              <it.Icon size={23} style={{ color: on ? INK : "#9aa6b4" }} strokeWidth={on ? 2.4 : 1.9} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   STATIONARY STAGE TRACKER
   Dots never scroll; step with the ‹ › toggles or tap a dot.
   Completed/current = filled emerald · future = hollow white.
   ============================================================ */
function StageTracker() {
  const [sel, setSel] = useState(STAGE_NOW);
  const N = STAGES.length;
  const statusFor = (i) => (i < STAGE_NOW ? "Completed" : i === STAGE_NOW ? "In progress" : "Upcoming");
  const go = (dir) => setSel((s) => Math.min(N - 1, Math.max(0, s + dir)));

  const lineLeft = 100 / (2 * N);
  const lineWidth = 100 - 100 / N;
  const progressWidth = lineWidth * (STAGE_NOW / (N - 1));

  return (
    <div className={`${card} p-5`}>
      <div className="flex items-center justify-between">
        <span className={subLabel}>Project Stage</span>
        <div className="flex items-center gap-1.5">
          <button onClick={() => go(-1)} disabled={sel === 0}
            className="grid h-7 w-7 place-items-center rounded-full border border-slate-200 text-slate-600 transition active:scale-90 disabled:opacity-30"
            aria-label="Previous stage">
            <ChevronLeft size={15} />
          </button>
          <button onClick={() => go(1)} disabled={sel === N - 1}
            className="grid h-7 w-7 place-items-center rounded-full border border-slate-200 text-slate-600 transition active:scale-90 disabled:opacity-30"
            aria-label="Next stage">
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {/* Stationary dot row — no scrolling, nothing clipped */}
      <div className="relative mt-7">
        <div className="absolute h-[2px] bg-slate-200" style={{ left: `${lineLeft}%`, top: 14, width: `${lineWidth}%` }} />
        <div className="absolute h-[2px] bg-emerald-500 transition-all duration-500" style={{ left: `${lineLeft}%`, top: 14, width: `${progressWidth}%` }} />

        <div className="relative flex">
          {STAGES.map((s, i) => {
            const done = i < STAGE_NOW;
            const now = i === STAGE_NOW;
            const selected = i === sel;

            let dotStyle;
            if (done) dotStyle = { background: EM };
            else if (now) dotStyle = { background: EM, boxShadow: "0 0 12px rgba(16,185,129,0.55)" };
            else dotStyle = { background: "#ffffff", border: "2px solid #cbd5e1" };

            if (selected) {
              const ring = "0 0 0 4px rgba(16,185,129,0.2)";
              dotStyle = { ...dotStyle, boxShadow: dotStyle.boxShadow ? `${dotStyle.boxShadow}, ${ring}` : ring };
            }

            return (
              <div key={s} className="flex flex-1 justify-center">
                <button
                  onClick={() => setSel(i)}
                  className="relative z-10 grid h-7 w-7 place-items-center rounded-full transition active:scale-95"
                  style={dotStyle}
                  aria-label={s}
                  aria-pressed={selected}
                >
                  {done && <Check size={12} className="text-white" strokeWidth={3.5} />}
                  {now && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Readout for the selected stage */}
      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold tracking-tight text-slate-900">{STAGES[sel]}</span>
          <span
            className="rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider"
            style={
              sel === STAGE_NOW
                ? { background: "rgba(16,185,129,0.12)", color: EM_TEXT, border: "1px solid rgba(16,185,129,0.25)" }
                : sel < STAGE_NOW
                ? { background: "rgba(148,163,184,0.12)", color: "#64748b", border: "1px solid rgba(148,163,184,0.25)" }
                : { background: "rgba(15,23,42,0.04)", color: "#475569", border: "1px solid #e2e8f0" }
            }
          >
            {statusFor(sel)}
          </span>
        </div>
        <p className="mt-1.5 text-[12px] leading-relaxed text-slate-500">{STAGE_DESC[sel]}</p>
      </div>
    </div>
  );
}

/* ============================================================
   OVERVIEW
   ============================================================ */
/* Compact page bar — shown on every page except home: small avatar + company name + page tabs */
function PageBar({ tab, setTab, following, setFollowing }) {
  const pages = [
    { id: "overview", Icon: Home },
    { id: "projects", Icon: Pickaxe },
    { id: "timeline", Icon: Clock },
    { id: "capital", Icon: PieChart },
    { id: "team", Icon: Users },
    { id: "media", Icon: Grid3x3 },
  ];
  return (
    <div className="flex-shrink-0 border-b border-slate-200 px-5">
      <div className="flex items-center gap-2 pb-0.5 pt-1.5">
        <img src={AVATAR} alt={COMPANY.name} className="h-6 w-6 flex-shrink-0 rounded-full object-cover" style={{ border: "1px solid #e2e8f0" }} />
        <span className="text-[12.5px] font-extrabold tracking-tight text-slate-900">{COMPANY.name}</span>
        <BadgeCheck size={13} className="flex-shrink-0" style={{ color: "#0ea5e9" }} fill="rgba(14,165,233,0.15)" />
        <button
          onClick={() => setFollowing && setFollowing((f) => !f)}
          className="ml-auto flex h-6 flex-shrink-0 items-center justify-center gap-1 rounded-full border px-2.5 text-[10px] font-bold tracking-wide transition-all active:scale-[0.97]"
          style={following
            ? { background: "rgba(16,185,129,0.08)", color: EM_TEXT, borderColor: "rgba(16,185,129,0.35)" }
            : { background: "#ffffff", color: "#334155", borderColor: "#e2e8f0" }}
          aria-pressed={!!following}
        >
          {following ? <Check size={11} strokeWidth={2.8} /> : <Plus size={11} strokeWidth={2.8} />}
          {following ? "Following" : "Follow"}
        </button>
      </div>
      <div className="grid grid-cols-6">
        {pages.map((n) => {
          const on = tab === n.id;
          return (
            <button
              key={n.id}
              onClick={() => setTab(n.id)}
              className="relative flex items-center justify-center py-1.5 transition active:opacity-60"
              style={{ color: on ? "#0f172a" : "#9ca3af" }}
              aria-label={n.id}
            >
              <n.Icon size={18} strokeWidth={on ? 2.4 : 2} />
              {on && <span className="absolute -bottom-px left-1/2 h-[2px] -translate-x-1/2 rounded-full bg-slate-900" style={{ width: 22 }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   PROFILE HEADER  —  static the company banner shown on every page
   ============================================================ */
function ProfileHeader({ tab, setTab, following, setFollowing, onField }) {
  const pages = [
    { id: "overview", Icon: Home },
    { id: "projects", Icon: Pickaxe },
    { id: "timeline", Icon: Clock },
    { id: "capital", Icon: PieChart },
    { id: "team", Icon: Users },
    { id: "media", Icon: Grid3x3 },
  ];
  return (
    <div className="flex-shrink-0 px-5 pt-3">
      {/* profile — circular avatar, name beside it */}
      <div className="flex items-center gap-4">
        <div className="grid h-16 w-16 flex-shrink-0 place-items-center overflow-hidden rounded-full border border-slate-200 bg-white">
          <img src={AVATAR} alt="Company logo" className="h-full w-full object-cover" />
        </div>
        <div data-sp="co" className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h1 data-fp="co-name" onClick={() => onField && onField("co-name")} className="text-[22px] font-extrabold leading-tight tracking-tight text-slate-900" style={{ cursor: onField ? "pointer" : "default" }}>{COMPANY.name}</h1>
            <BadgeCheck size={18} className="flex-shrink-0" style={{ color: "#0ea5e9" }} fill="rgba(14,165,233,0.15)" />
          </div>
          <span
            data-fp="co-website"
            onClick={() => onField && onField("co-website")}
            className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold tracking-tight transition active:scale-95"
            style={{ color: "#0ea5e9", cursor: onField ? "pointer" : "default" }}
          >
            {COMPANY.website} <ArrowUpRight size={11} />
          </span>
          <p data-fp="co-slogan" onClick={() => onField && onField("co-slogan")} className="mt-0.5 text-[12px] font-medium italic tracking-tight text-slate-500" style={{ cursor: onField ? "pointer" : "default" }}>{COMPANY.slogan}</p>
          {(COMPANY.ticker || COMPANY.commodity || COMPANY.jurisdiction || COMPANY.stage) && (
            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] font-semibold tracking-tight text-slate-400">
              {[COMPANY.ticker, COMPANY.commodity, COMPANY.jurisdiction, COMPANY.stage].filter(Boolean).map((t, i, a) => (
                <span key={i} className="inline-flex items-center gap-1.5">{t}{i < a.length - 1 && <span className="text-slate-300">·</span>}</span>
              ))}
            </p>
          )}
        </div>
      </div>

      {/* actions — follow + message */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={() => setFollowing((f) => !f)}
          className="flex h-9 items-center justify-center gap-1.5 rounded-full border text-[12px] font-bold tracking-tight transition-all active:scale-[0.97]"
          style={following
            ? { background: "#ffffff", color: "#2563eb", borderColor: "#bcd4fb" }
            : { background: "#ffffff", color: "#334155", borderColor: "#e2e8f0" }}
          aria-pressed={following}
        >
          {following ? <Check size={13} strokeWidth={2.8} /> : <Plus size={13} strokeWidth={2.8} />}
          {following ? "Following" : "Follow"}
        </button>
        <button
          className="flex h-9 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white text-[12px] font-bold tracking-tight text-slate-700 transition active:scale-[0.97]"
        >
          <MessageSquare size={13} strokeWidth={2.6} /> Message
        </button>
      </div>

      {/* page tabs */}
      <div className="mt-2.5 grid grid-cols-6 border-b border-slate-200">
        {pages.map((n) => {
          const on = tab === n.id;
          return (
            <button
              key={n.id}
              onClick={() => setTab(n.id)}
              className="relative flex items-center justify-center py-1.5 transition active:opacity-60"
              style={{ color: on ? "#0f172a" : "#9ca3af" }}
              aria-label={n.id}
            >
              <n.Icon size={18} strokeWidth={on ? 2.4 : 2} />
              {on && <span className="absolute -bottom-px left-1/2 h-[2px] -translate-x-1/2 rounded-full bg-slate-900" style={{ width: 22 }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Glossy 3D glass buttons for the AI scenario read (bull / bear / next).
function ScenarioGlassButton({ variant, Icon, selected, dimmed, onClick }) {
  const press = (e) => { e.currentTarget.style.transform = "scale(0.96)"; };
  const release = (e) => { e.currentTarget.style.transform = selected ? "translateY(-2px) scale(1.02)" : "none"; };
  const liftedShadowGreen = "0 8px 18px -8px rgba(26,196,150,0.8), 0 0 8px -3px rgba(74,224,166,0.5)";
  const liftedShadowRed = "0 8px 18px -8px rgba(233,60,55,0.78), 0 0 8px -3px rgba(255,120,120,0.45)";
  const dimStyle = { opacity: dimmed ? 0.6 : 1, transition: "opacity .28s ease, transform .18s ease, box-shadow .25s ease, filter .28s ease", filter: dimmed ? "saturate(0.85)" : selected ? "brightness(1.08) saturate(1.08)" : "none" };

  if (variant === "iris") {
    const rainbow = "conic-gradient(from 215deg, #9db8ff, #c6a3ff, #ff9ecf, #ffd6a0, #a7eccf, #9db8ff)";
    return (
      <button
        onClick={onClick} onPointerDown={press} onPointerUp={release} onPointerLeave={release}
        aria-pressed={selected}
        style={{ position: "relative", aspectRatio: "1 / 1", width: "100%", borderRadius: 24, border: "none", padding: 0, background: "transparent", cursor: "pointer", transform: selected ? "translateY(-2px) scale(1.02)" : "none", ...dimStyle }}
      >
        <span aria-hidden="true" style={{ position: "absolute", inset: selected ? -3 : -2, borderRadius: 27, background: rainbow, filter: selected ? "blur(6px)" : "blur(4px)", opacity: selected ? 0.85 : 0.5, transition: "inset .25s ease, opacity .25s ease, filter .25s ease" }} />
        <span aria-hidden="true" style={{ position: "absolute", inset: 0, borderRadius: 24, background: rainbow }} />
        <span aria-hidden="true" style={{ position: "absolute", inset: 3, borderRadius: 21, background: "linear-gradient(155deg, #ffffff 0%, #f2f6fb 100%)", boxShadow: "inset 0 2px 1px rgba(255,255,255,0.95), inset 0 -10px 16px -7px rgba(150,160,190,0.28)" }} />
        <span aria-hidden="true" style={{ position: "absolute", left: "8%", top: "6%", width: "84%", height: "42%", borderRadius: 18, background: "linear-gradient(180deg, rgba(255,255,255,0.7), rgba(255,255,255,0))" }} />
        <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
          <span style={{ display: "grid", placeItems: "center", width: "46%", height: "46%", borderRadius: 15, background: "rgba(255,255,255,0.62)", border: "1px solid rgba(255,255,255,0.9)", boxShadow: "0 2px 7px rgba(120,130,160,0.2)" }}>
            <Icon size={23} strokeWidth={2} style={{ color: "#9aa3af" }} />
          </span>
        </span>
      </button>
    );
  }

  const cfg = variant === "green"
    ? { body: "linear-gradient(155deg, #d9f1c2 0%, #82d196 42%, #24b08f 100%)", glow: "0 6px 14px -9px rgba(40,176,140,0.55)", lift: liftedShadowGreen, icon: "#2f9e5e", innerBg: "rgba(255,255,255,0.30)", innerBorder: "rgba(255,255,255,0.6)", rim: "rgba(255,255,255,0.55)" }
    : { body: "linear-gradient(155deg, #ffbaba 0%, #ff6d6d 46%, #e7322f 100%)", glow: "0 6px 14px -9px rgba(233,60,55,0.55)", lift: liftedShadowRed, icon: "#e23b3b", innerBg: "rgba(255,255,255,0.34)", innerBorder: "rgba(255,255,255,0.65)", rim: "rgba(255,255,255,0.62)" };

  return (
    <button
      onClick={onClick} onPointerDown={press} onPointerUp={release} onPointerLeave={release}
      aria-pressed={selected}
      style={{
        position: "relative", aspectRatio: "1 / 1", width: "100%", borderRadius: 24, border: "none", padding: 0, overflow: "hidden", cursor: "pointer", background: cfg.body,
        boxShadow: `${selected ? cfg.lift : cfg.glow}, inset 0 0 0 1.5px ${cfg.rim}, inset 0 2px 2px rgba(255,255,255,0.55), inset 0 -16px 26px -12px rgba(0,0,0,0.2)`,
        transform: selected ? "translateY(-2px) scale(1.02)" : "none", ...dimStyle,
      }}
    >
      <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 70% at 27% 8%, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 55%)" }} />
      <span aria-hidden="true" style={{ position: "absolute", left: "-12%", top: "-8%", width: "124%", height: "58%", background: "linear-gradient(180deg, rgba(255,255,255,0.4), rgba(255,255,255,0))", transform: "rotate(-7deg)" }} />
      <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
        <span style={{ display: "grid", placeItems: "center", width: "46%", height: "46%", borderRadius: 16, background: cfg.innerBg, border: `1px solid ${cfg.innerBorder}`, boxShadow: "inset 0 1px 1px rgba(255,255,255,0.5)" }}>
          <Icon size={25} strokeWidth={2.4} style={{ color: cfg.icon }} />
        </span>
      </span>
    </button>
  );
}

function Overview({ ov = BLANK_OV, activeSpot, tab, goto, openBrief, following, setFollowing, bookmarked, setBookmarked, saved, openCompare, openWatchlist, openConference }) {
  const STATUS = ov.status || BLANK_OV.status;
  // Company Status Card — the progress bar shows only when explicitly enabled and Current/Total are valid.
  const STATUS_SHOW_PROGRESS = STATUS.progressEnabled === true && STATUS.progressDone != null && STATUS.progressTotal != null && Number(STATUS.progressTotal) > 0;
  const [showStatusInfo, setShowStatusInfo] = useState(false);

  // Current program progress (hole-based).
  const HOLES_DONE = STATUS.progressDone || 0, HOLES_TOTAL = STATUS.progressTotal || 1;
  const pct = (HOLES_DONE / HOLES_TOTAL) * 100;
  const [pTarget, setPTarget] = useState(0);
  const progressW = useTween(pTarget, 1100);

  const [snapIn, setSnapIn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setSnapIn(true), 40); return () => clearTimeout(t); }, []);

  // "Why it matters" expandable + bull/bear expandable tablets.
  const [whyOpen, setWhyOpen] = useState(false);
  const [openCase, setOpenCase] = useState(null);
  useEffect(() => {
    if (activeSpot === "ov-thesis") setWhyFollowOpen(true);           // open the dropdown so its content is visible/editable
    else if (activeSpot === "ov-thesis-expanded") setWhyFollowOpen(true); // then reveal the expanded content
    else if (activeSpot === "ov-bull") { setWhyFollowOpen(true); setOpenCase("bull"); }
    else if (activeSpot === "ov-bear") { setWhyFollowOpen(true); setOpenCase("bear"); }
    else if (activeSpot === "ov-next") { setWhyFollowOpen(true); setOpenCase("next"); }
  }, [activeSpot]);
  const [photoOpen, setPhotoOpen] = useState(false);

  // Status flip card — intro: image fades in, logo fades in, then flips to details.
  const [flipped, setFlipped] = useState(false);   // false = image face, true = details face
  const [imgIn, setImgIn] = useState(false);
  const [logoIn, setLogoIn] = useState(false);
  const [showLogo, setShowLogo] = useState(true);   // logo only during the intro
  useEffect(() => {
    const t1 = setTimeout(() => setImgIn(true), 80);     // image fades in
    const t2 = setTimeout(() => setLogoIn(true), 720);    // logo fades in after
    const t3 = setTimeout(() => setFlipped(true), 2100);  // flip to the details
    const t4 = setTimeout(() => setShowLogo(false), 2900); // drop logo once details are shown
    return () => { [t1, t2, t3, t4].forEach(clearTimeout); };
  }, []);

  // Fill the progress bar each time the card flips to its details face,
  // starting once the flip has rotated far enough to reveal the back face.
  useEffect(() => {
    if (!flipped) { setPTarget(0); return; }   // reset so it re-fills on the next flip
    const t = setTimeout(() => setPTarget(pct), 450);
    return () => clearTimeout(t);
  }, [flipped, pct]);

  // Animated thesis checklist — collapsible; one continuous emerald line descends when opened.
  const [whyFollowOpen, setWhyFollowOpen] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const LINE_MS = 1000; // descent duration
  const railRef = useRef(null);
  const firstDotRef = useRef(null);
  const lastDotRef = useRef(null);
  const [lineGeo, setLineGeo] = useState({ top: 0, height: 0 });
  // Measure the precise span between the first and last node centers so the rail
  // and line begin and end exactly on the dots — no stub past the final icon, and
  // robust to text wrapping on narrow screens.
  useEffect(() => {
    const measure = () => {
      const rail = railRef.current, f = firstDotRef.current, l = lastDotRef.current;
      if (!rail || !f || !l) return;
      const rb = rail.getBoundingClientRect();
      const fb = f.getBoundingClientRect();
      const lb = l.getBoundingClientRect();
      const top = (fb.top + fb.height / 2) - rb.top;
      const end = (lb.top + lb.height / 2) - rb.top;
      setLineGeo({ top, height: Math.max(0, end - top) });
    };
    measure();
    const t = setTimeout(measure, 60);
    window.addEventListener("resize", measure);
    return () => { clearTimeout(t); window.removeEventListener("resize", measure); };
  }, [whyFollowOpen]);
  // Begin the descent only after the panel has finished expanding, so it reads as one smooth motion.
  useEffect(() => {
    if (!whyFollowOpen) { setDrawn(false); return; }
    const t = setTimeout(() => setDrawn(true), 380);
    return () => clearTimeout(t);
  }, [whyFollowOpen]);

  // Dynamically-shaped thesis points + quick facts.
  const WHY_ICONS = [Drill, Wallet, Gem, Layers, Target, Crosshair];
  const WHY = (ov.thesis || []).map((text, i) => ({ Icon: WHY_ICONS[i % WHY_ICONS.length], text }));
  const QUICK_ICONS = [MapPin, Pickaxe, Wallet, Clock];
  const QUICK = (ov.quick || []).map((q, i) => ({ Icon: QUICK_ICONS[i % QUICK_ICONS.length], label: q.label, sub: q.sub }));
  const CASE_META = {
    bull: { label: "Bull Case", Icon: TrendingUp, c: "#0f9b73", bg: "rgba(16,185,129,0.10)", bd: "rgba(16,185,129,0.25)", short: "Bull" },
    bear: { label: "Bear Case", Icon: TrendingDown, c: "#dc2626", bg: "rgba(220,38,38,0.07)", bd: "rgba(220,38,38,0.2)", short: "Bear" },
  };
  const CASES = (ov.cases || []).map((x) => ({ ...(CASE_META[x.key] || CASE_META.bull), key: x.key, text: x.text, detail: x.detail }));
  const NEXT_CASE = ov.nextCase
    ? { key: "next", label: "Next Validation Point", short: "Validation", Icon: Crosshair, c: "#1d4ed8", bg: "rgba(37,99,235,0.07)", bd: "rgba(37,99,235,0.2)", text: ov.nextCase }
    : null;
  const SCENARIOS = [...CASES.map((c) => ({ ...c, short: c.short || c.label })), ...(NEXT_CASE ? [NEXT_CASE] : [])];
  const activeCase = SCENARIOS.find((s) => s.key === openCase);
  const scenarioRef = useRef(null);
  useEffect(() => {
    if (!openCase) return;
    const t = setTimeout(() => {
      if (scenarioRef.current) scenarioRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 430);
    return () => clearTimeout(t);
  }, [openCase]);

  return (
    <div className="px-5 pt-3 pb-2" style={{ opacity: snapIn ? 1 : 0, transform: snapIn ? "none" : "translateY(6px)", transition: "opacity .5s ease, transform .5s ease" }}>

      {/* ============ SECTION 1 — CURRENT STATUS (flip card) ============ */}
      <div data-sp="ov-status"><FlipStatusCard hero={STATUS_IMG} logo={STATUS_LOGO} status={STATUS} flipped={flipped} logoIn={logoIn} width="100%" showProgress={STATUS_SHOW_PROGRESS} /></div>

      <div data-sp="ov-thesis" className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <button
          onClick={() => { haptic(); setWhyFollowOpen((v) => !v); }}
          aria-expanded={whyFollowOpen}
          className="flex w-full items-center justify-center gap-2 px-4 py-4 text-center transition active:scale-[0.99]"
          style={{ background: "#0f172a" }}
        >
          <span className="text-[14px] font-semibold tracking-tight text-white">The Investment Case</span>
          <ChevronDown
            size={18}
            strokeWidth={2.4}
            className={whyFollowOpen ? "" : "pp-bob"}
            style={{ color: "#ffffff", transform: whyFollowOpen ? "rotate(180deg)" : "none", transition: "transform .3s ease" }}
          />
        </button>
        <div style={{ display: "grid", gridTemplateRows: whyFollowOpen ? "1fr" : "0fr", transition: "grid-template-rows .38s ease" }}>
          <div className="overflow-hidden">
            <div ref={railRef} data-sp="ov-thesis-expanded" data-sp-delay="480" className="relative px-4 pb-4" style={{ paddingTop: 20 }}>
              {/* connector rail — spans exactly first→last node center (no overshoot) */}
              <span aria-hidden="true" style={{ position: "absolute", left: 26, top: lineGeo.top, height: lineGeo.height, width: 2, borderRadius: 9999, background: "#e2e8f0" }} />
              {/* emerald line — one continuous GPU-driven descent, no per-frame reflow */}
              <span
                aria-hidden="true"
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
                {WHY.map((w, i) => {
                  const PtIcon = w.Icon;
                  const on = drawn;
                  // light each node exactly as the constant-speed line tip reaches it
                  const delay = drawn ? Math.round((i / (WHY.length - 1)) * LINE_MS) : 0;
                  return (
                    <div
                      key={i}
                      data-fp={`th-${i}`}
                      ref={i === 0 ? firstDotRef : (i === WHY.length - 1 ? lastDotRef : null)}
                      className="relative flex items-center"
                      style={{ gap: 14 }}
                    >
                      <span
                        className="relative z-10 grid flex-shrink-0 place-items-center rounded-full"
                        style={{
                          width: 22,
                          height: 22,
                          background: on ? EM : "#ffffff",
                          border: on ? `2px solid ${EM}` : "2px solid #cbd5e1",
                          boxShadow: on ? "0 2px 7px -1px rgba(16,185,129,0.55)" : "none",
                          transition: "background .3s ease, border-color .3s ease, box-shadow .3s ease",
                          transitionDelay: `${delay}ms`,
                        }}
                      >
                        <PtIcon size={12} strokeWidth={2.5} style={{ color: on ? "#ffffff" : "#94a3b8", transform: on ? "scale(1)" : "scale(0.88)", transition: "color .3s ease, transform .25s ease", transitionDelay: `${delay}ms` }} />
                      </span>
                      <span className="font-semibold leading-snug tracking-tight" style={{ fontSize: 13, color: on ? "#334155" : "#94a3b8", transition: "color .3s ease", transitionDelay: `${delay}ms` }}>{w.text}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ============ SECTION 3 — AI BRIEF (hero feature) ============ */}
      <button
        data-sp="ov-brief"
        onClick={openBrief}
        className="mt-3 block w-full overflow-hidden rounded-3xl text-left transition-transform active:scale-[0.98]"
        style={{ padding: 16, background: "radial-gradient(135% 130% at 88% 8%, #7ad6f8 0%, rgba(122,214,248,0) 45%), linear-gradient(140deg, #1b4fd0 0%, #2f86e6 58%, #49b4f0 100%)", boxShadow: "0 20px 40px -20px rgba(31,79,208,0.7)" }}
      >
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: "rgba(255,255,255,0.22)" }}><Zap size={15} className="text-white" strokeWidth={2.6} /></span>
          <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-white/85">AI Brief</span>
        </div>
        <p className="mt-2.5 font-extrabold leading-tight tracking-tight text-white" style={{ fontSize: 17 }}>Explain this company in 60 Seconds</p>
        <p className="mt-1.5 font-medium leading-snug text-white/80" style={{ fontSize: 12 }}>AI-generated summary covering opportunity, risks, catalysts and project potential.</p>
      </button>

      {/* ============ SECTION 5 — BULL / BEAR / NEXT ============ */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        {SCENARIOS.map((c) => (
          <div key={c.key} data-sp={{ bull: "ov-bull", bear: "ov-bear", next: "ov-next" }[c.key]}>
          <ScenarioGlassButton
            variant={c.key === "next" ? "iris" : c.key === "bull" ? "green" : "red"}
            Icon={c.Icon}
            selected={openCase === c.key}
            dimmed={!!openCase && openCase !== c.key}
            onClick={() => { haptic(); setOpenCase(openCase === c.key ? null : c.key); }}
          />
          </div>
        ))}
      </div>

      {/* detail — generated only when a scenario is pressed */}
      <div ref={scenarioRef} data-detail="ov-scenario-detail" style={{ display: "grid", gridTemplateRows: activeCase ? "1fr" : "0fr", transition: "grid-template-rows .34s ease", scrollMarginBottom: 112 }}>
        <div className="overflow-hidden">
          {activeCase && (
            <div className="mt-2.5 rounded-2xl border bg-white p-4" style={{ borderColor: activeCase.bd }}>
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: activeCase.bg }}><activeCase.Icon size={15} style={{ color: activeCase.c }} strokeWidth={2.5} /></span>
                <span className="text-[11px] font-extrabold uppercase tracking-wider" style={{ color: activeCase.c }}>{activeCase.label}</span>
              </div>
              <p key={activeCase.key} className="mt-2 text-[13px] font-medium leading-relaxed text-slate-600"><WordFade text={activeCase.text} step={26} /></p>
            </div>
          )}
        </div>
      </div>

      {/* ===== WHY IT MATTERS — popup card ===== */}
      {whyOpen && (
        <BottomSheet onClose={() => setWhyOpen(false)}>
          <div className="flex items-center gap-2 border-b border-slate-200 pb-3 pr-9">
            <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg" style={{ background: "rgba(16,185,129,0.12)" }}>
              <Sparkles size={14} style={{ color: EM_TEXT }} strokeWidth={2.4} />
            </span>
            <span className="text-[10px] font-extrabold uppercase tracking-[0.18em]" style={{ color: EM_TEXT }}>Why It Matters</span>
          </div>
          <p className="mt-4 text-[14px] font-semibold leading-relaxed text-slate-800">the company is testing extensions of the high-grade silver mineralization identified during its 2025 discovery campaign.</p>
          <p className="mt-2.5 text-[12.5px] font-medium leading-relaxed text-slate-500">
            Each new hole that ties zones together adds tonnage and grade to a system that already has historic production behind it. Confirming continuity is the difference between isolated hits and a resource a market can value — which is what drives a re-rate at this stage.
          </p>
        </BottomSheet>
      )}

      {/* ===== SITE PHOTO — expanded view ===== */}
      {photoOpen && (
        <div
          className="absolute inset-0 z-[85] flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-sm pp-fade"
          style={{ padding: 20 }}
          onClick={() => setPhotoOpen(false)}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setPhotoOpen(false); }}
            aria-label="Close photo"
            className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full text-white transition active:scale-90"
            style={{ background: "rgba(255,255,255,0.16)", backdropFilter: "blur(8px)" }}
          >
            <X size={18} />
          </button>
          <div className="pp-pop w-full max-w-[340px]" onClick={(e) => e.stopPropagation()}>
            <div className="overflow-hidden rounded-3xl border border-white/15" style={{ boxShadow: "0 30px 60px -20px rgba(0,0,0,0.7)" }}>
              <img src={SITE_PHOTO} alt="Project photo" className="block w-full" />
            </div>
            <div className="mt-3 flex items-center gap-1.5 px-1 text-white">
              <Pickaxe size={13} className="text-emerald-400" />
              <span className="text-[13px] font-bold tracking-tight">Project 1</span>
              <span className="text-white/40">·</span>
              <MapPin size={12} className="text-white/60" />
              <span className="text-[12px] font-medium text-white/70"></span>
            </div>
          </div>
        </div>
      )}

      {/* ===== LIVE STATUS — info modal (summary + every stage) ===== */}
      {showStatusInfo && (
        <BottomSheet onClose={() => setShowStatusInfo(false)}>
          <div className="border-b border-slate-200 pb-3 pr-9">
            <span className="text-[9px] font-extrabold uppercase tracking-[0.18em]" style={{ color: EM_TEXT }}>Program Status</span>
            <h3 className="mt-1 text-[16px] font-extrabold tracking-tight text-slate-900">{STATUS.state}</h3>
            <p className="mt-1.5 text-[12px] font-medium leading-relaxed text-slate-500">{STATUS.detail} Next up: {STATUS.next} — {STATUS.eta}.</p>
          </div>
          <StageTimeline />
        </BottomSheet>
      )}

    </div>
  );
}

/* ============================================================
   TIMELINE  —  inline year accordion
   Tap a year  ->  its releases drop down (summarized titles).
   Tap a release  ->  detail modal (headline, why, takeaways)
   ->  Read Full Press Release  ->  full-text modal.
   ============================================================ */
const QUARTERS = { Jan: "Q1", Feb: "Q1", Mar: "Q1", Apr: "Q2", May: "Q2", Jun: "Q2", Jul: "Q3", Aug: "Q3", Sep: "Q3", Oct: "Q4", Nov: "Q4", Dec: "Q4" };
function groupByQuarter(items) {
  const out = [];
  const idx = {};
  items.forEach((it, ii) => {
    const abbr = it.d.split(" ")[0];           // "May", "Jan"
    const q = QUARTERS[abbr] || abbr;          // "Q1".."Q4" (group key)
    if (idx[q] === undefined) { idx[q] = out.length; out.push({ quarter: q, abbr: q, items: [] }); }
    out[idx[q]].items.push({ it, ii });
  });
  return out;
}
// The most-recent (last) quarter of a given year — opened by default when that year is shown.
function defaultQuarterFor(year) {
  const yr = PR_YEARS.find((p) => p.year === year);
  if (!yr) return null;
  const groups = groupByQuarter(yr.items);
  return groups.length ? `${year}-${groups[0].quarter}` : null;
}

// ---- Task 2: empty-aware preview helpers ----------------------------------
// One clean empty state, styled like the existing Media empty state, used when a
// section has no data in `profile`. No seeded fallback, no placeholder dashes.
function SectionEmpty({ Icon, title, sub }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-2xl bg-slate-100">
        {Icon ? <Icon size={26} className="text-slate-400" strokeWidth={1.9} /> : null}
      </span>
      <p className="mt-4 text-[15px] font-bold tracking-tight text-slate-900">{title}</p>
      <p className="mt-1 max-w-[240px] text-[13px] font-medium leading-snug text-slate-500">{sub}</p>
    </div>
  );
}
// Universal project snapshot structure (labels are template, values are company data).
const SNAP_TEMPLATE = [
  { Icon: MapPin, label: "Location" },
  { Icon: Gem, label: "Commodity" },
  { Icon: ShieldCheck, label: "Interest" },
  { Icon: Pickaxe, label: "Past Producer" },
  { Icon: Layers, label: "Concessions" },
  { Icon: Mountain, label: "Deposit Type" },
];

const TL_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function parseTLDate(s) {
  if (!s) return { year: new Date().getFullYear(), md: "", ord: 0 };
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) { const y = +iso[1], m = +iso[2], d = +iso[3]; return { year: y, md: `${TL_MONTHS[m - 1]} ${d}`, ord: y * 10000 + m * 100 + d }; }
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return { year: dt.getFullYear(), md: `${TL_MONTHS[dt.getMonth()]} ${dt.getDate()}`, ord: dt.getTime() / 1e6 };
  const ym = /(\d{4})/.exec(s); const y = ym ? +ym[1] : new Date().getFullYear();
  return { year: y, md: s, ord: y * 10000 };
}
// profile.timeline is a flat list of updates; the view groups them by year (and quarter).
function buildTimelineYears(flat) {
  if (!Array.isArray(flat) || !flat.length) return [];
  if (flat[0] && Array.isArray(flat[0].items)) return flat;   // already grouped — back-compat
  const byYear = {};
  flat.forEach((u) => {
    const p = parseTLDate(u.date);
    const item = { id: u.id, d: p.md, key: !!u.key, label: u.title || "", headline: u.title || "", category: u.category || "", why: u.summary || "", url: u.url || "", takeaways: [], _ord: p.ord };
    (byYear[p.year] = byYear[p.year] || []).push(item);
  });
  return Object.keys(byYear).map(Number).sort((a, b) => b - a).map((y) => ({ year: y, items: byYear[y].sort((a, b) => b._ord - a._ord) }));
}
function TimelineView() {
  const rawTimeline = (useContext(ProfileContext)?.profile?.timeline) ?? [];
  const PR_YEARS = useMemo(() => buildTimelineYears(rawTimeline), [rawTimeline]);
  const [detail, setDetail] = useState(null);   // { yi, ii } | null
  const [showFull, setShowFull] = useState(false);
  const [activeYear, setActiveYear] = useState(PR_YEARS[0]?.year ?? null);
  const [highOnly, setHighOnly] = useState(true);   // diamond filter opens first: key/high-impact across all years
  const [expanded, setExpanded] = useState(() => {
    const init = {};
    PR_YEARS.forEach((yr) => {
      const g = groupByQuarter(yr.items);
      if (g.length) init[`${yr.year}-${g[0].quarter}`] = true;   // recent quarter open by default
    });
    return init;
  });

  const item = detail ? PR_YEARS[detail.yi].items[detail.ii] : null;

  const rootRef = useRef(null);
  const quarterRefs = useRef({});
  const headerRef = useRef(null);
  const [headerH, setHeaderH] = useState(53);
  useEffect(() => {
    const measure = () => { if (headerRef.current) setHeaderH(headerRef.current.offsetHeight); };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [highOnly, activeYear]);
  // keep the active year valid when timeline data appears/changes
  useEffect(() => { if (PR_YEARS.length && !PR_YEARS.some((y) => y.year === activeYear)) setActiveYear(PR_YEARS[0].year); }, [PR_YEARS]);
  if (!PR_YEARS.length) return (
    <div className="px-5 pt-2">
      <div><Kicker section="timeline" /><h2 className="-mt-0.5 text-xl font-bold tracking-tight text-slate-900">Timeline</h2></div>
      <SectionEmpty Icon={Clock} title="No updates yet" sub="Press releases and milestones will appear here as they're added." />
    </div>
  );
  const scroller = () => (rootRef.current ? rootRef.current.closest(".pp-scroll") : null);

  const goYear = (year) => {
    setActiveYear(year);
    setHighOnly(false);
    const cont = scroller();
    if (cont) cont.scrollTo({ top: 0, behavior: "smooth" });
  };
  const toggleQuarter = (mkey) => {
    const willOpen = !expanded[mkey];
    setExpanded((p) => {
      const next = { ...p };
      groupByQuarter(yr.items).forEach((g) => { next[`${yr.year}-${g.quarter}`] = false; });
      next[mkey] = willOpen;
      return next;
    });
    // bring the opened quarter up just beneath the sticky year header, fully in view
    if (willOpen) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const el = quarterRefs.current[mkey];
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }));
    }
  };

  let yi = PR_YEARS.findIndex((p) => p.year === activeYear);
  if (yi < 0) yi = 0;
  const yr = PR_YEARS[yi];
  const groups = groupByQuarter(yr.items);
  const keyCount = yr.items.filter((it) => it.key).length;

  return (
    <div ref={rootRef} className="px-5 pt-2 pb-0">
      {/* HEADER — title + year-pill selector */}
      <div>
        <h2 className="text-[15px] font-bold tracking-tight text-slate-900"><Kicker section="timeline" /></h2>
        <p className="-mt-0.5 text-[18px] font-extrabold tracking-tight text-slate-900">The Story So Far</p>
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => { haptic(); setHighOnly((v) => !v); const c = scroller(); if (c) c.scrollTo({ top: 0, behavior: "smooth" }); }}
            aria-label="Show key milestones across all years"
            aria-pressed={highOnly}
            className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full transition active:scale-90"
            style={highOnly
              ? { background: EM, boxShadow: "0 4px 12px -5px rgba(16,185,129,0.75)" }
              : { background: "#fff", border: "1px solid #e2e8f0" }}
          >
            <Gem size={14} style={{ color: highOnly ? "#fff" : EM }} strokeWidth={2.4} />
          </button>
          <span className="mr-0.5 h-5 w-px flex-shrink-0 bg-slate-200" />
          {PR_YEARS.map((yr) => {
            const on = !highOnly && yr.year === activeYear;
            return (
              <button
                key={yr.year}
                onClick={() => goYear(yr.year)}
                className="rounded-full px-3.5 py-1.5 text-[12px] font-bold tabular-nums tracking-tight transition active:scale-95"
                style={on
                  ? { background: "#2563eb", color: "#fff", boxShadow: "0 4px 12px -5px rgba(37,99,235,0.7)" }
                  : { background: "#fff", color: "#64748b", border: "1px solid #e2e8f0" }}
              >
                {yr.year}
              </button>
            );
          })}
        </div>
      </div>

      {/* ALL-TIME KEY MILESTONES — diamond filter active */}
      {highOnly && (
        <section className="relative mt-3">
          <div className="sticky top-0 z-30 -mx-5 flex items-center gap-2 px-5 py-2.5" style={{ background: "#ffffff", borderBottom: "1px solid #f1f5f9" }}>
            <Gem size={15} style={{ color: EM }} strokeWidth={2.4} />
            <span className="text-[15px] font-extrabold tracking-tight text-slate-900">Key Milestones</span>
            <span className="text-[11px] font-medium" style={{ color: EM_TEXT }}>All-time · {PR_YEARS.reduce((n, y) => n + y.items.filter((it) => it.key).length, 0)} highlights</span>
          </div>
          <div className="space-y-4 pb-0 pt-3">
            {PR_YEARS.map((yrX, yIdx) => {
              const keyItems = yrX.items.map((it, ii) => ({ it, ii })).filter((x) => x.it.key);
              if (!keyItems.length) return null;
              return (
                <div key={yrX.year}>
                  <p className="mb-1 px-1 text-[11px] font-extrabold uppercase tracking-widest text-slate-400">{yrX.year}</p>
                  <div className="relative">
                    <div className="absolute bg-slate-200" style={{ left: 11, top: 14, bottom: 14, width: 2 }} />
                    {keyItems.map(({ it, ii }) => {
                      const { cat, impact } = classify(it);
                      const is = IMPACT_STYLE[impact];
                      return (
                        <button
                          key={it.id}
                          onClick={() => { setShowFull(false); setDetail({ yi: yIdx, ii }); }}
                          className="relative flex w-full items-stretch gap-3 py-1.5 text-left transition active:scale-[0.99]"
                        >
                          <span className="relative z-10 flex flex-shrink-0 justify-center pt-4" style={{ width: 25 }}>
                            <span className="grid place-items-center rounded-full" style={{ height: 20, width: 20, background: EM, boxShadow: "0 0 0 4px rgba(16,185,129,0.15)" }}>
                              <Gem size={11} style={{ color: "#06281d" }} />
                            </span>
                          </span>
                          <span className="min-w-0 flex-1 rounded-2xl border border-slate-100 bg-white p-3" style={{ boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 10px 24px -18px rgba(15,23,42,0.35)" }}>
                            <span className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wider" style={{ background: is.bg, color: is.c }}>
                                <span className="h-1.5 w-1.5 rounded-full" style={{ background: is.dot }} /> {impact}
                              </span>
                              <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{cat}</span>
                              <ChevronRight size={15} className="ml-auto flex-shrink-0 text-slate-300" />
                            </span>
                            <span className="mt-1.5 block text-[13px] font-bold leading-snug tracking-tight text-slate-900">{it.label}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* BODY — single active year, flowing in the app's main scroll */}
      {!highOnly && (
      <section key={yr.year} className="relative mt-3">
        {/* sticky compact year header (+ white buffer below the line) */}
        <div ref={headerRef} className="sticky top-0 z-30 -mx-5" style={{ background: "#ffffff" }}>
          <div className="flex items-center gap-2 px-5 py-2.5" style={{ borderBottom: "1px solid #f1f5f9" }}>
            <span className="text-[19px] font-extrabold tabular-nums tracking-tight text-slate-900">{yr.year}</span>
            <span className="text-[11px] font-medium" style={{ color: highOnly ? EM_TEXT : "#94a3b8" }}>
              {highOnly ? `${keyCount} key milestone${keyCount === 1 ? "" : "s"}` : `${yr.items.length} releases`}
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <button
                onClick={() => yi > 0 && goYear(PR_YEARS[yi - 1].year)}
                disabled={yi === 0}
                aria-label="Newer year"
                className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 transition active:scale-90 disabled:opacity-30"
              ><ChevronLeft size={16} /></button>
              <button
                onClick={() => yi < PR_YEARS.length - 1 && goYear(PR_YEARS[yi + 1].year)}
                disabled={yi === PR_YEARS.length - 1}
                aria-label="Older year"
                className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 transition active:scale-90 disabled:opacity-30"
              ><ChevronRight size={16} /></button>
            </div>
          </div>
          <div style={{ height: 12 }} />
        </div>

        {/* QUARTER SECTIONS */}
        <div className="space-y-2 pb-0" style={{ paddingTop: 0 }}>
          {groups.map((grp, gi) => {
            const mkey = `${yr.year}-${grp.quarter}`;
            const hasKey = grp.items.some((x) => x.it.key);
            const items = highOnly ? grp.items.filter((x) => x.it.key) : grp.items;
            if (highOnly && items.length === 0) return null;   // hide quarters with no key milestones
            const isExp = highOnly ? true : !!expanded[mkey];
            // The single most-recent quarter overall = first group of the newest year.
            const isLatest = yi === 0 && gi === 0;
              return (
                <div key={mkey} ref={(el) => { quarterRefs.current[mkey] = el; }} style={{ scrollMarginTop: headerH }}>
                  {/* quarter mini-header — full width, collapsible */}
                  <button
                    onClick={() => toggleQuarter(mkey)}
                    aria-expanded={isExp}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left transition active:scale-[0.99]"
                    style={isExp
                      ? { background: "#1d4ed8", border: "1px solid #1d4ed8", boxShadow: "0 6px 16px -8px rgba(29,78,216,0.6)" }
                      : { background: "#fff", border: "1px solid #d8dee9" }}
                  >
                    <span className="text-[13px] font-extrabold tracking-tight" style={{ color: isExp ? "#fff" : "#1e293b" }}>{grp.quarter} {yr.year}</span>
                    <span className="text-[11px] font-medium" style={{ color: isExp ? "rgba(255,255,255,0.7)" : "#94a3b8" }}>· {items.length} release{items.length > 1 ? "s" : ""}</span>
                    {hasKey && <Gem size={11} style={{ color: isExp ? "#6ee7b7" : EM }} />}
                    <ChevronRight size={15} className="ml-auto flex-shrink-0 transition-transform duration-200" style={{ color: isExp ? "rgba(255,255,255,0.85)" : "#cbd5e1", transform: isExp ? "rotate(90deg)" : "rotate(0deg)" }} />
                  </button>

                  {/* milestones — dots on a secondary line, cards to the right */}
                  {isExp && (
                    <div className="pp-view relative mt-1">
                      <div className="absolute bg-slate-200" style={{ left: 11, top: 14, bottom: 14, width: 2 }} />

                      {/* upcoming release tablet — only the most recent quarter */}
                      {isLatest && !highOnly && (
                        <div className="relative flex w-full items-stretch gap-3 py-1.5">
                          <span className="relative z-10 flex flex-shrink-0 justify-center pt-4" style={{ width: 25 }}>
                            <span className="relative grid place-items-center">
                              <span className="pp-ping absolute h-4 w-4 rounded-full" style={{ background: "rgba(37,99,235,0.35)" }} />
                              <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#2563eb", boxShadow: "0 0 0 3px rgba(37,99,235,0.18)" }} />
                            </span>
                          </span>
                          <span className="min-w-0 flex-1 rounded-2xl p-3" style={{ border: "1.5px dashed #93b4f6", background: "rgba(37,99,235,0.05)" }}>
                            <span className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wider" style={{ background: "#2563eb", color: "#fff" }}>
                                <Clock size={9} /> Upcoming
                              </span>
                              <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{grp.quarter} {yr.year}</span>
                            </span>
                            <span className="mt-1.5 block text-[13px] font-bold leading-snug tracking-tight" style={{ color: "#1d4ed8" }}>Next press release expected</span>
                            <span className="mt-1 block text-[10.5px] font-medium text-slate-500">Drill results & corporate updates pending</span>
                          </span>
                        </div>
                      )}

                      {items.map(({ it, ii }) => {
                        const { cat, impact } = classify(it);
                        const cs = CAT_STYLE[cat], is = IMPACT_STYLE[impact];
                        return (
                          <button
                            key={it.id}
                            onClick={() => { setShowFull(false); setDetail({ yi, ii }); }}
                            className="relative flex w-full items-stretch gap-3 py-1.5 text-left transition active:scale-[0.99]"
                          >
                            {/* dot on the line */}
                            <span className="relative z-10 flex flex-shrink-0 justify-center pt-4" style={{ width: 25 }}>
                              <span
                                className="grid place-items-center rounded-full"
                                style={{
                                  height: it.key ? 20 : 14, width: it.key ? 20 : 14,
                                  ...(it.key
                                    ? { background: EM, boxShadow: "0 0 0 4px rgba(16,185,129,0.15)" }
                                    : { background: "#fff", border: `2px solid ${cs.c}` }),
                                }}
                              >
                                {it.key && <Gem size={11} style={{ color: "#06281d" }} />}
                              </span>
                            </span>
                            {/* content card */}
                            <span className="min-w-0 flex-1 rounded-2xl border border-slate-100 bg-white p-3" style={{ boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 10px 24px -18px rgba(15,23,42,0.35)" }}>
                              <span className="flex items-center gap-1.5">
                                <span className="rounded-md px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wider" style={{ background: cs.bg, color: cs.c }}>{cat}</span>
                                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{grp.quarter} {yr.year}</span>
                                <ChevronRight size={15} className="ml-auto flex-shrink-0 text-slate-300" />
                              </span>
                              <span className="mt-1.5 block text-[13px] font-bold leading-snug tracking-tight text-slate-900">{it.label}</span>
                              <span className="mt-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider" style={{ background: is.bg, color: is.c }}>
                                <span className="h-1.5 w-1.5 rounded-full" style={{ background: is.dot }} /> {impact} impact
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ====== DETAIL (analyst note) MODAL ====== */}
      {item && !showFull && (() => {
        const { cat, impact } = classify(item);
        const cs = CAT_STYLE[cat], is = IMPACT_STYLE[impact];
        return (
        <BottomSheet onClose={() => setDetail(null)}>
          <div className="border-b border-slate-200 pb-3 pr-9">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-md px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wider" style={{ background: cs.bg, color: cs.c }}>{cat}</span>
              <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wider" style={{ background: is.bg, color: is.c }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: is.dot }} /> {impact}
              </span>
              <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 tabular-nums">{item.d}, {PR_YEARS[detail.yi].year}</span>
            </div>
            <h3 className="mt-2 text-[16px] font-extrabold leading-snug tracking-tight text-slate-900">{item.headline}</h3>
          </div>

          <SummaryContent item={item} cat={cat} impact={impact} onReadFull={() => setShowFull(true)} />
        </BottomSheet>
        );
      })()}

      {/* ====== FULL PRESS-RELEASE MODAL (scrolling text in swipe-up card) ====== */}
      {item && showFull && (
        <BottomSheet onClose={() => setShowFull(false)}>
          <div className="border-b border-slate-200 pb-3 pr-9">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 tabular-nums">{item.d}, {PR_YEARS[detail.yi].year} · Full Release</p>
            <h3 className="mt-1 text-[15px] font-extrabold leading-snug tracking-tight text-slate-900">{item.headline}</h3>
          </div>
          <FullText text={FULL[item.id]} />
        </BottomSheet>
      )}
    </div>
  );
}

/* Why This Matters + Key Takeaways. Window and button are present immediately;
   the text fades in once, in a single swipe. */
function SummaryContent({ item, cat, impact, onReadFull }) {
  const stage = STAGE_IMPACT_BY_CAT[cat] || ["—", "—"];
  return (
    <div className="mt-4">
      <div key={item.id} className="pp-view space-y-4">
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-[0.16em]" style={{ color: "#0f172a" }}>What Happened</span>
          <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-slate-600">{item.label}.</p>
        </div>
        {item.why && (
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-[0.16em]" style={{ color: "#0f172a" }}>Why It Matters</span>
          <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-slate-600">{item.why}</p>
        </div>
        )}
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-[0.16em]" style={{ color: "#0f172a" }}>What Happens Next</span>
          <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-slate-600">{NEXT_BY_CAT[cat]}</p>
        </div>
        {(item.takeaways || []).length > 0 && (
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-[0.16em]" style={{ color: "#0f172a" }}>Key Numbers</span>
          <ul className="mt-2 space-y-1.5">
            {(item.takeaways || []).map((t, j) => (
              <li key={j} className="flex items-start gap-2.5">
                <span className="grid h-5 flex-shrink-0 place-items-center">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: EM }} />
                </span>
                <span className="text-[13px] font-medium leading-5 text-slate-600">{t}</span>
              </li>
            ))}
          </ul>
        </div>
        )}
        {/* Project stage impact — visual */}
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-[0.16em]" style={{ color: "#0f172a" }}>Stage Impact</span>
          <div className="mt-2 flex items-center gap-2">
            <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-bold tracking-tight text-slate-500">{stage[0]}</span>
            <ArrowUpRight size={15} className="flex-shrink-0" style={{ color: EM }} />
            <span className="rounded-lg px-2.5 py-1.5 text-[11px] font-bold tracking-tight" style={{ background: "rgba(16,185,129,0.12)", color: EM_TEXT }}>{stage[1]}</span>
          </div>
        </div>
        <div className="rounded-2xl p-3.5" style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.2)" }}>
          <span className="text-[10px] font-extrabold uppercase tracking-[0.16em]" style={{ color: EM_TEXT }}>Investor Takeaway</span>
          <p className="mt-1.5 text-[13px] font-semibold leading-relaxed text-slate-700">{TAKEAWAY_BY_IMPACT[impact]}</p>
        </div>
      </div>

      {item.url && (
        <a href={item.url} target="_blank" rel="noreferrer" className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-700 transition active:scale-95">
          View Source <ArrowUpRight size={14} />
        </a>
      )}
      {FULL[item.id] && (
      <button
        onClick={onReadFull}
        className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-xs font-bold uppercase tracking-wider text-white transition active:scale-95"
        style={DARK_CTA}
      >
        Read Full Press Release <ChevronRight size={14} />
      </button>
      )}
    </div>
  );
}

/* Renders the full press release line-by-line, darkening section headings and
   short labels (e.g. "Highlights:", "Qualified Person", "1. HIGH GRADE …"). */
function isPrHeading(t) {
  if (!t || t.length > 80) return false;
  if (/:$/.test(t) && t.length <= 58) return true;                                  // labels ending in colon
  if (/^\d+\.\s+[A-Z0-9 ,.\-\/&()]+$/.test(t) && /[A-Z]{3,}/.test(t)) return true;  // "1. HIGH GRADE …"
  if (/^(Highlights|Key Results|Survey Technical Details|Qualified Person|About the company|Forward[\s-]?Looking|Contact|Table \d|Figure \d)/i.test(t)) return true;
  const letters = t.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 5 && letters === letters.toUpperCase() && t.length <= 70) return true; // standalone ALL-CAPS line
  return false;
}

function FullText({ text }) {
  return (
    <div>
      {text.split("\n").map((line, i) => {
        const t = line.trim();
        if (!t) return <div key={i} style={{ height: 8 }} />;
        return isPrHeading(t) ? (
          <p key={i} className="font-bold tracking-tight text-slate-900" style={{ fontSize: 12.5, marginTop: 12, marginBottom: 2 }}>{t}</p>
        ) : (
          <p key={i} className="text-slate-600" style={{ fontSize: 12, lineHeight: 1.6 }}>{line}</p>
        );
      })}
    </div>
  );
}

/* Centered rounded modal. Compact fixed height. Optional `header` stays fixed
   at the top while `children` scroll beneath it. X stays pinned top-right.
   Tap X or backdrop to close. */
function Sheet({ header, children, onClose }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center" style={{ padding: 16 }}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm pp-fade" onClick={onClose} />
      <div
        className="relative flex w-full flex-col overflow-hidden border border-slate-200 bg-white shadow-2xl pp-pop"
        style={{ height: 500, maxHeight: "calc(100% - 40px)", borderRadius: 26 }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute z-20 grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-500 transition active:scale-90"
          style={{ top: 14, right: 14 }}
        >
          <X size={16} />
        </button>
        {header && (
          <div className="flex-shrink-0" style={{ padding: "20px 20px 0 20px" }}>
            {header}
          </div>
        )}
        <div className="pp-scroll overflow-y-auto" style={{ flex: 1, minHeight: 0, padding: header ? "12px 20px 20px 20px" : 20 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/* Swipe-up bottom sheet — 75% tall, grab handle to drag down, X to close, scrolls internally */
function StageTimeline() {
  const [go, setGo] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGo(true), 150);
    return () => clearTimeout(t);
  }, []);
  return (
    <div style={{ marginTop: 16 }}>
      {STAGES.map((s, i) => {
        const done = i < STAGE_NOW, now = i === STAGE_NOW, last = i === STAGES.length - 1;
        const segActive = i < STAGE_NOW;       // connector below this dot leads to a reached stage
        const reached = i <= STAGE_NOW;
        return (
          <div key={s} style={{ display: "flex", gap: 12 }}>
            {/* dot + connector column */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 24 }}>
              <span style={{ display: "grid", placeItems: "center", flexShrink: 0, width: 24, height: 24, borderRadius: 9999, fontSize: 10, fontWeight: 800, background: now ? "#0f172a" : done ? "rgba(15,23,42,0.08)" : "#f1f5f9", color: now ? "#ffffff" : done ? "#0f172a" : "#94a3b8" }}>
                {done ? <Check size={12} strokeWidth={3} /> : i + 1}
              </span>
              {!last && (
                <div style={{ width: 2, flex: "1 1 0%", minHeight: 22, marginTop: 3, marginBottom: 3, borderRadius: 2, background: "#e2e8f0", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: segActive && go ? "100%" : "0%", background: "#0f172a", borderRadius: 2, transition: `height .42s ease ${(0.1 + i * 0.24).toFixed(2)}s` }} />
                </div>
              )}
            </div>
            {/* text */}
            <div style={{ minWidth: 0, flex: "1 1 0%", paddingBottom: last ? 0 : 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <p className="font-bold tracking-tight" style={{ fontSize: 13, color: reached ? "#0f172a" : "#334155" }}>{s}</p>
                {now && <span style={{ padding: "2px 6px", borderRadius: 6, fontSize: 8, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", background: "rgba(15,23,42,0.09)", color: "#0f172a" }}>Current</span>}
              </div>
              <p style={{ marginTop: 2, fontSize: 11.5, lineHeight: 1.5, color: "#64748b" }}>{STAGE_DESC[i]}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BottomSheet({ children, onClose }) {
  const [shown, setShown] = useState(false);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startY = useRef(0);

  useEffect(() => {
    const r = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(r);
  }, []);

  const close = () => {
    setShown(false);
    setTimeout(onClose, 280);
  };

  const onDown = (e) => {
    setDragging(true);
    startY.current = e.clientY;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  };
  const onMove = (e) => {
    if (!dragging) return;
    const dy = e.clientY - startY.current;
    setDrag(dy > 0 ? dy : 0);
  };
  const onUp = () => {
    if (!dragging) return;
    setDragging(false);
    if (drag > 90) close();
    else setDrag(0);
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end" style={{ padding: "0 16px 16px" }}>
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        style={{ opacity: shown ? 1 : 0, transition: "opacity .28s ease" }}
        onClick={close}
      />
      <div
        className="relative flex w-full flex-col overflow-hidden bg-white shadow-2xl"
        style={{
          height: "78%",
          borderRadius: 28,
          transform: shown ? `translateY(${drag}px)` : "translateY(110%)",
          transition: dragging ? "none" : "transform .32s cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        {/* grab handle — drag down to dismiss */}
        <div
          className="flex-shrink-0 touch-none pb-1 pt-3"
          style={{ cursor: dragging ? "grabbing" : "grab" }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <div className="mx-auto h-1.5 w-10 rounded-full bg-slate-300" />
        </div>
        {/* close */}
        <button
          onClick={close}
          aria-label="Close"
          className="absolute z-20 grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-500 transition active:scale-90"
          style={{ top: 14, right: 14 }}
        >
          <X size={16} />
        </button>
        {/* scrollable content — card stays still while this scrolls */}
        <div className="pp-scroll overflow-y-auto" style={{ flex: 1, minHeight: 0, padding: "6px 20px 24px 20px" }}>
          {typeof children === "function" ? children(close) : children}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   MAP
   ============================================================ */

/* ============================================================
   MAP — zoomable lat/long grid map with both projects pinned
   ============================================================ */
const MAP_BBOX = { latMin: 26.62, latMax: 27.18, lonMin: -105.82, lonMax: -105.26 };
const geoX = (lon) => ((lon - MAP_BBOX.lonMin) / (MAP_BBOX.lonMax - MAP_BBOX.lonMin)) * 100;
const geoY = (lat) => ((MAP_BBOX.latMax - lat) / (MAP_BBOX.latMax - MAP_BBOX.latMin)) * 100;
const MAP_SITES = [
  { key: "lc", name: "Project 1", lat: 27.05, lon: -105.45, tone: EM, fill: "rgba(16,185,129,0.25)" },
  { key: "alm", name: "Project 2", lat: 26.75, lon: -105.50, tone: "#f59e0b", fill: "rgba(245,158,11,0.25)" },
];

function MapView({ onOpenProjects }) { return null; }

function PeekModal({ site, onClose, onOpenProjects }) { return null; }
// Media grid — populate MEDIA_POSTS with { img } objects to show the Instagram-style grid.
const MEDIA_POSTS = [];

function MediaView() {
  const posts = (useContext(ProfileContext)?.profile?.media) ?? [];
  return (
    <div className="px-5 pt-2">
      <div>
        <Kicker section="media" />
        <h2 className="-mt-0.5 text-xl font-bold tracking-tight text-slate-900">Media</h2>
      </div>
      {posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-2xl bg-slate-100">
            <Grid3x3 size={26} className="text-slate-400" strokeWidth={1.9} />
          </span>
          <p className="mt-4 text-[15px] font-bold tracking-tight text-slate-900">No posts yet</p>
          <p className="mt-1 max-w-[230px] text-[13px] font-medium leading-snug text-slate-500">This company hasn't posted yet. New media will appear here.</p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-3 gap-1">
          {posts.map((post, i) => (
            <button key={i} className="relative block overflow-hidden bg-slate-100 transition active:opacity-80" style={{ aspectRatio: "1 / 1" }}>
              <img src={post.img} alt="" className="absolute inset-0 h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ===== Live (15-min delayed) quotes =====
// Optional: deploy passport-quote-worker and set its URL here to use it first.
// It should accept ?s=SYMBOL and return JSON { price, currency }.
const QUOTE_WORKER = "";
// CORS relays raced in parallel so the first to answer wins (works from WKWebView).
const QUOTE_RELAYS = [
  (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://thingproxy.freeboard.io/fetch/${u}`,
];

async function fetchQuote(yahoo) {
  // Preferred path: a deployed quote worker.
  if (QUOTE_WORKER) {
    try {
      const r = await fetch(QUOTE_WORKER + encodeURIComponent(yahoo));
      if (r.ok) {
        const j = await r.json();
        if (j && j.price != null) return { price: Number(j.price), currency: j.currency };
      }
    } catch (e) { /* fall through to relays */ }
  }
  // Fallback: Yahoo chart endpoint via raced CORS relays.
  const target = `https://query1.finance.yahoo.com/v8/finance/chart/${yahoo}?interval=1d&range=1d`;
  const attempts = QUOTE_RELAYS.map(async (wrap) => {
    const res = await fetch(wrap(target));
    if (!res.ok) throw new Error("relay " + res.status);
    const data = await res.json();
    const meta = data && data.chart && data.chart.result && data.chart.result[0] && data.chart.result[0].meta;
    const price = meta && meta.regularMarketPrice;
    if (price == null) throw new Error("no price");
    return { price: Number(price), currency: meta.currency };
  });
  return Promise.any(attempts);
}

function fmtQuote(num, cur) {
  const v = Number(num);
  if (!isFinite(v)) return null;
  return cur + (v >= 1 ? v.toFixed(2) : v.toFixed(3));
}

// Returns a live price string, or null until the first quote arrives.
function useQuote(yahoo, cur) {
  const [price, setPrice] = useState(null);
  useEffect(() => {
    if (!yahoo) return;
    let alive = true;
    const load = () => fetchQuote(yahoo)
      .then((q) => { if (alive && q) { const f = fmtQuote(q.price, cur); if (f) setPrice(f); } })
      .catch(() => {});
    load();
    const id = setInterval(load, 120000); // refresh every 2 min while open
    return () => { alive = false; clearInterval(id); };
  }, [yahoo, cur]);
  return price;
}

function ListingCard({ x }) {
  const live = useQuote(x.yahoo, x.cur);
  const price = live || x.price; // static price shows instantly; live replaces it
  return (
    <div className="rounded-2xl p-3.5" style={{ background: "#0b0f17" }}>
      <div className="flex items-center gap-1">
        <Building2 size={9} className="flex-shrink-0" strokeWidth={2.4} style={{ color: "#475569" }} />
        <p className="text-[8px] font-semibold uppercase tracking-wider" style={{ color: "#64748b" }}>{x.ex}</p>
      </div>
      <p className="mt-1.5 text-[16px] font-extrabold tracking-tight text-white">{x.sym}</p>
      {price && (
        <p className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold tabular-nums tracking-tight" style={{ color: "#cbd5e1" }}>
          {price}
          {live && <span className="inline-block h-1 w-1 flex-shrink-0 rounded-full" style={{ background: EM }} />}
        </p>
      )}
    </div>
  );
}

// ===== Capital page helpers =====
const capNum = (s) => Number(String(s).replace(/[^0-9.]/g, "")) || 0;
const capFmt = (n) => capNum(n).toLocaleString("en-US");
const capShort = (n) => {
  const v = capNum(n);
  if (v >= 1e9) return (v / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return String(v);
};

function ScoreDots({ level, tone }) {
  const [on, setOn] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setOn(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setOn(true); io.disconnect(); }
    }, { threshold: 0.5, rootMargin: "0px 0px -8% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <span ref={ref} className="flex items-center gap-[7px]">
      {[1, 2, 3, 4, 5].map((n) => {
        const active = n <= level;
        return (
          <span
            key={n}
            className="rounded-full"
            style={{
              height: 9,
              width: 9,
              background: on && active ? tone : "#e2e8f0",
              transform: on ? "scale(1)" : "scale(0.78)",
              transition: `background-color .8s ease ${n * 150}ms, transform .8s cubic-bezier(.22,1,.36,1) ${n * 150}ms`,
            }}
          />
        );
      })}
    </span>
  );
}

function HealthRow({ h, open, onToggle, first }) {
  const tone = h.level >= 4 ? EM : h.level === 3 ? "#f59e0b" : "#ef4444";
  return (
    <div className={first ? "" : "border-t border-slate-100"}>
      <button onClick={onToggle} className="grid w-full appearance-none items-center gap-2 py-4 text-left" style={{ gridTemplateColumns: "1fr auto 1fr", border: "none", background: "transparent", outline: "none" }}>
        <span className="text-[15px] font-semibold tracking-tight text-slate-800">{h.k}</span>
        <ScoreDots level={h.level} tone={tone} />
        <span className="justify-self-end text-right text-[11.5px] font-medium tracking-tight text-slate-500">{h.v}</span>
      </button>
      <div className="grid transition-all duration-300 ease-out" style={{ gridTemplateRows: open ? "1fr" : "0fr" }}>
        <div className="overflow-hidden">
          <div className="pb-3.5 pr-1">
            <p className="text-[12px] font-medium leading-relaxed text-slate-500">{h.note}</p>
            {h.src && <p className="mt-1 text-[10.5px] font-medium leading-snug text-slate-400">{h.src}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function FinanceRow({ r, open, onToggle, last, newest }) {
  const node = newest ? EM : "#cbd5e1";
  const det = [
    ["Price per Share", r.price || NR],
    ["Lead Broker", r.lead || NR],
    ["Purpose", r.purpose || NR],
    ["Status", r.status || "Completed"],
  ];
  return (
    <div className="relative pl-7">
      {!last && <span className="absolute w-px" style={{ left: 5, top: 6, bottom: -4, background: "#e7ebf0" }} />}
      <span className="absolute rounded-full border-2 border-white" style={{ left: 0, top: 5, height: 11, width: 11, background: node, boxShadow: newest ? "0 0 0 4px rgba(16,185,129,0.16)" : "none" }} />
      <button onClick={onToggle} className={`block w-full appearance-none text-left ${last ? "pb-1" : "pb-7"}`} style={{ border: "none", background: "transparent", outline: "none" }}>
        <p className="font-bold tracking-tight tabular-nums" style={{ color: newest ? EM_TEXT : "#0f172a", fontSize: newest ? 18 : 15.5 }}>{r.v}</p>
        <p className="mt-0.5 text-[12px] font-medium text-slate-500">{r.type}</p>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: newest ? "rgba(15,157,115,0.75)" : "#94a3b8" }}>{r.d}</p>
        <div className="grid transition-all duration-300 ease-out" style={{ gridTemplateRows: open ? "1fr" : "0fr" }}>
          <div className="overflow-hidden">
            <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
              {det.map((d, i) => (
                <div key={i} className="flex items-center justify-between gap-3">
                  <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">{d[0]}</span>
                  <span className="text-right text-[12px] font-medium tracking-tight text-slate-700">{d[1]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </button>
    </div>
  );
}

function DilutionViz({ basic, fd }) {
  const frac = fd > 0 ? Math.min(100, (basic / fd) * 100) : 0;
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(frac), 140); return () => clearTimeout(t); }, [frac]);
  return (
    <div>
      <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "#e2e8f0" }}>
        <div className="h-full rounded-full" style={{ width: w + "%", background: "#0f172a", transition: "width .85s cubic-bezier(.22,1,.36,1)" }} />
      </div>
      <div className="mt-2 flex items-center gap-4">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500"><span className="h-1.5 w-1.5 rounded-full" style={{ background: "#0f172a" }} />Basic Shares</span>
        <span className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400"><span className="h-1.5 w-1.5 rounded-full" style={{ background: "#cbd5e1" }} />Potential Dilution</span>
      </div>
    </div>
  );
}

const SEC_GROUPS = [
  { key: "Common Shares", match: (s) => /common/i.test(s) },
  { key: "Options", match: (s) => /option/i.test(s) },
  { key: "Warrants", match: (s) => /warrant/i.test(s) },
  { key: "Restricted Shares", match: (s) => /restricted/i.test(s) },
  { key: "Convertible Securities", match: (s) => /convert/i.test(s) },
];

// Gradient AI summary card — mirrors the app's feature-card pattern
// (radial highlight + directional fill + coloured shadow). Blue→violet accent.
function AISummaryButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="relative w-full appearance-none overflow-hidden rounded-2xl px-4 py-3.5 text-left transition active:scale-[0.99]"
      style={{
        border: "none",
        outline: "none",
        background: "radial-gradient(135% 130% at 88% 6%, rgba(150,120,255,0.55) 0%, rgba(150,120,255,0) 46%), linear-gradient(140deg, #2540c8 0%, #4f46e5 56%, #7c3aed 100%)",
        boxShadow: "0 18px 36px -18px rgba(79,70,229,0.65)",
      }}
    >
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0" style={{ height: "52%", background: "linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0))" }} />
      <span className="relative flex items-center gap-2.5">
        <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full" style={{ background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.3)" }}>
          <Sparkles size={14} color="#fff" strokeWidth={2.4} />
        </span>
        <span className="flex-1">
          <span className="block text-[12.5px] font-bold tracking-tight text-white">AI Summary</span>
          <span className="block text-[10.5px] font-medium" style={{ color: "rgba(255,255,255,0.72)" }}>Plain-English read on this capital structure</span>
        </span>
        <ChevronRight size={16} className="flex-shrink-0" strokeWidth={2.4} style={{ color: "rgba(255,255,255,0.8)" }} />
      </span>
    </button>
  );
}

// Navigation row that opens a bottom sheet. Icon chip + title + preview + chevron.
function SectionRow({ Icon, label, preview, onClick, first, sp }) {
  return (
    <button
      data-sp={sp}
      onClick={onClick}
      className={`flex w-full appearance-none items-center gap-3 px-4 py-3.5 text-left transition active:bg-slate-50 ${first ? "" : "border-t border-slate-100"}`}
      style={{ border: "none", background: "transparent", outline: "none" }}
    >
      <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl" style={{ background: "rgba(37,99,235,0.10)" }}>
        <Icon size={17} style={{ color: "#2563eb" }} strokeWidth={2.3} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-bold tracking-tight text-slate-900">{label}</span>
        <span className="block truncate text-[11px] font-medium tracking-tight text-slate-400">{preview}</span>
      </span>
      <ChevronRight size={16} className="flex-shrink-0 text-slate-300" strokeWidth={2.4} />
    </button>
  );
}

function CapitalView({ vm: vmProp } = {}) {
  // Task 1: prefer the profile-derived VM from context; fall back to prop, then
  // the live global fallback (used only outside the onboarding provider).
  const ctx = useContext(ProfileContext);
  const vm = (ctx && ctx.vm) || vmProp || LIVE_VM;
  // EDIT MODE INJECTION — every company-specific value comes from `vm`.
  // Blank vm → the app's real empty states; approved fields → populated widgets.
  const { COMPANY, CAP, CAPSTATUS, EXCHANGES, OWNERSHIP, METRIC_DETAIL } = vm;
  const blank = vm.blank;
  const raises = vm.raises || [];
  const [r0 = {}] = raises;
  const ownMap = Object.fromEntries(OWNERSHIP || []);
  const insiderOwn = ownMap["Insider Ownership"];
  const ownPreview = (OWNERSHIP && OWNERSHIP.length)
    ? OWNERSHIP.map(([k, v]) => `${k.replace(" Ownership", "")} ${v || NR}`).join(" · ")
    : "—";
  // Single sheet controller — null, or one of:
  // "structure" | "ownership" | "financing" | "finDetails" | "aiSummary"
  const [sheet, setSheet] = useState(null);
  const [capFlipped, setCapFlipped] = useState(false);   // Capital status card: flip to financial detail face
  const [metricKey, setMetricKey] = useState(null);
  const [eduKey, setEduKey] = useState(null);
  const [runwayTarget, setRunwayTarget] = useState(0);
  const runwayW = useTween(runwayTarget, 1100);
  useEffect(() => { const t = setTimeout(() => setRunwayTarget(CAPSTATUS.runwayPct), 200); return () => clearTimeout(t); }, []);
  const debtNum = capNum(COMPANY.debt);
  const equityNum = capNum(COMPANY.equity) || capNum(COMPANY.workingCapital);
  const dte = debtNum === 0 ? "0%" : `${Math.round((debtNum / equityNum) * 100)}%`;

  // ===== Capital Snapshot — the four metrics investors actually check =====
  // Basic/Fully Diluted are pulled from CAP (single source of truth) so they
  // can never drift from the Share Structure breakdown below.
  // TODO(JJ): swap the cash figure here when the C$4.2M / C$13.0M call is final.
  const CASH_VALUE = COMPANY.cash;
  const CASH_ASOF  = "";
  const snapshot = [
    { k: "Market Cap", v: COMPANY.marketCap },
    { k: "Cash", v: CASH_VALUE, sub: CASH_ASOF },
    { k: "Basic Shares", v: CAP.outstanding ? capShort(capNum(CAP.outstanding)) : "" },
    { k: "Fully Diluted", v: CAP.fd ? capShort(capNum(CAP.fd)) : "" },
  ];

  // Secondary metrics — tucked into the collapsed "Financial Details" drawer.
  const finDetails = [
    { k: "Enterprise Value", v: COMPANY.ev },
    { k: "Working Capital", v: COMPANY.workingCapital },
    { k: "Long-Term Debt", v: COMPANY.debt },
    { k: "Debt-to-Equity", v: dte },
  ].filter((m) => m.v);

  const updated = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const capTone = CAP_TONE[CAP_STATES[CAPSTATUS.state] || "ok"] || CAP_TONE.ok;

  // ===== Share-structure computation (used by tablet + bottom sheet) =====
  const basic = capNum(CAP.outstanding), fd = capNum(CAP.fd);
  const ssGroups = SEC_GROUPS.map((g) => {
    const rows = CAP.rows.filter((r) => g.match(r.sec));
    return { ...g, rows, total: rows.reduce((a, r) => a + capNum(r.qty), 0) };
  }).filter((g) => g.rows.length > 0);
  const priceOf = (det) => { const m = (det || "").match(/\$([0-9.]+)/); return m ? parseFloat(m[1]) : null; };
  const calcGroup = (re) => {
    const g = ssGroups.find((x) => re.test(x.key));
    if (!g) return null;
    let qty = 0, proceeds = 0;
    g.rows.forEach((r) => { const p = priceOf(r.det); const q = capNum(r.qty); if (p != null && q) { qty += q; proceeds += p * q; } });
    return qty > 0 ? { proceeds, avg: proceeds / qty } : null;
  };
  const optCalc = calcGroup(/option/i), warCalc = calcGroup(/warrant/i);
  const totalProceeds = (optCalc ? optCalc.proceeds : 0) + (warCalc ? warCalc.proceeds : 0);
  const money = (n) => "C$" + (n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : (n / 1e3).toFixed(0) + "K");
  const dilutionPct = fd > 0 ? (((fd - basic) / fd) * 100).toFixed(1) + "%" : NR;

  // ===== Pre-written AI summary of the capital structure =====
  const AI_SUMMARY = [
    { h: "Capital position", b: `${COMPANY.name} carries no debt and a tight ${capShort(basic)} basic share count, reaching ${capShort(fd)} fully diluted — a ${dilutionPct} potential dilution that is modest for an explorer at this stage.` },
    { h: "Funding", b: `The ${r0.v} ${(r0.type||"").toLowerCase()} in ${r0.d} is the most recent raise. A bought deal means an underwriter took the financing risk onto its own book — generally read as a confidence signal.` },
    { h: "Ownership", b: insiderOwn ? `Insider ownership of ${insiderOwn} keeps management aligned with shareholders. Institutional ownership is not currently reported.` : "Insider ownership is not currently disclosed in approved filings; institutional ownership is not reported." },
    { h: "Watch", b: `Options and warrants would bring in roughly ${money(totalProceeds)} of cash if exercised, but also account for all of the dilution between basic and fully diluted. Most warrants sit well above the current share price.` },
  ];

  // ===== Snapshot tablet → which sheet/metric each opens =====
  const tabletAction = {
    "Market Cap": () => setMetricKey("Market Cap"),
    "Cash": () => setMetricKey("Cash"),
    "Basic Shares": () => setSheet("structure"),
    "Fully Diluted": () => setSheet("structure"),
  };

  return (
    <>
    <div className="space-y-6 px-5 pt-2">
      <div>
        <Kicker section="capital" />
        <h2 className="-mt-0.5 text-xl font-bold tracking-tight text-slate-900">Capital</h2>
      </div>

      {/* ===== CAPITAL STATUS CARD (empty-state guarded for edit mode) ===== */}
      <div data-sp="cp-status">
      {!CAPSTATUS.headline ? <EmptyStatusCard /> : (
      <div onClick={() => vm.onField && vm.onField("cp-status")} className="overflow-hidden rounded-3xl border border-slate-200 bg-white" style={{ boxShadow: cardShadow, cursor: vm.onField ? "pointer" : "default" }}>
        <div className="px-5 pb-5 pt-5">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ border: `1px solid ${capTone.ring}`, background: "transparent" }}>
              <span className="relative flex h-1.5 w-1.5">
                <span className="pp-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: capTone.dot }} />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: capTone.dot }} />
              </span>
              <span className="font-extrabold uppercase" style={{ fontSize: 9, letterSpacing: "0.14em", color: capTone.text }}>{CAPSTATUS.state || "Capital Status"}</span>
            </span>
            <button onClick={(e) => { e.stopPropagation(); haptic(); setCapFlipped((f) => !f); }} aria-label={capFlipped ? "Back to status" : "Flip for financial detail"} className="-mr-1 grid appearance-none place-items-center rounded-full transition active:scale-90" style={{ height: 24, width: 24, background: "transparent", border: "none", outline: "none" }}>
              {capFlipped ? <RotateCcw size={16} style={{ color: "#2563eb" }} strokeWidth={2.4} /> : <Info size={18} style={{ color: "#2563eb" }} strokeWidth={2.4} />}
            </button>
          </div>
          {!capFlipped ? (<>
          <h2 className="font-extrabold tracking-tight text-slate-900" style={{ marginTop: 13, fontSize: 25, lineHeight: 1.06 }}>{CAPSTATUS.headline}</h2>
          <p className="font-medium text-slate-500" style={{ marginTop: 9, fontSize: 12.5, lineHeight: 1.4 }}>{CAPSTATUS.summary}</p>
          {CAPSTATUS.showProgress && (
          <div style={{ marginTop: 22 }}>
            <p className="px-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Funding Runway</p>
            <div className="relative mt-3 flex h-5 items-center px-1">
              <div className="relative h-2 w-full rounded-full bg-slate-200">
                <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${runwayW}%`, background: "linear-gradient(90deg, #2563eb, #60a5fa)" }} />
                <div className="absolute z-10 h-4 w-4 rounded-full" style={{ left: `${runwayW}%`, top: "50%", transform: "translate(-50%, -50%)", background: "#1d4ed8", boxShadow: "0 0 0 2.5px #fff, 0 0 0 4.5px rgba(37,99,235,0.35), 0 2px 6px -1px rgba(0,0,0,0.25)" }} />
              </div>
            </div>
            <div className="mt-1.5 flex justify-between px-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{CAPSTATUS.runwayLeft}</span>
              <span className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: "#2563eb" }}>{CAPSTATUS.runwayRight}</span>
            </div>
          </div>
          )}
          </>) : (
          <div data-detail="cp-status-back" style={{ animation: "pp-tab-slide .28s ease" }}>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400" style={{ marginTop: 13 }}>Capital detail</p>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
              {[["Market Cap", COMPANY.marketCap], ["Cash", COMPANY.cash], ["Basic Shares", CAP.outstanding], ["Fully Diluted", CAP.fd], ["Debt", COMPANY.debt]].map(([k, v], i) => (
                <div key={i}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{k}</p>
                  <p className="mt-0.5 text-[15px] font-extrabold tracking-tight text-slate-900 tabular-nums">{v || "—"}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[11px] font-medium text-slate-400">Tap the arrow to flip back.</p>
          </div>
          )}
        </div>
      </div>
      )}
      </div>

      {/* ===== LISTINGS (directly beneath the status card) ===== */}
      <div data-sp="cp-listings">
        <div className="flex items-baseline justify-between px-0.5">
          <span className={subLabel}>Listings</span>
          {EXCHANGES.length > 0 && <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-300">Delayed 15 min</span>}
        </div>
        {EXCHANGES.length > 0 ? (
          <div className="mt-2.5 grid grid-cols-3 gap-2.5">
            {EXCHANGES.map((x) => (
              <ListingCard key={x.sym} x={x} />
            ))}
          </div>
        ) : (
          <div className="mt-2.5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
            <p className="text-[12.5px] font-medium text-slate-400">No listings added yet</p>
          </div>
        )}
      </div>

      {/* ===== AI SUMMARY (top) ===== */}
      <div data-sp="cp-aisummary"><AISummaryButton onClick={() => { haptic(); if (vm.onField) return vm.onField("cp-aisummary"); setSheet("aiSummary"); }} /></div>

      {/* ===== CAPITAL SNAPSHOT — 4 tappable grey tablets ===== */}
      {snapshot.length > 0 && (
        <div data-sp="cp-wc">
          <div className="flex items-center justify-between px-0.5">
            <span className={subLabel}>Capital Snapshot</span>
            <button onClick={() => { haptic(); setEduKey("snapshot"); }} aria-label="About these metrics" className="appearance-none p-0.5" style={{ border: "none", background: "transparent", outline: "none" }}>
              <Info size={14} style={{ color: "#cbd5e1" }} strokeWidth={2.4} />
            </button>
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-3">
            {snapshot.map((s, i) => {
              const TIcon = { "Market Cap": Landmark, "Cash": Wallet, "Basic Shares": Layers, "Fully Diluted": PieChart }[s.k] || Coins;
              return (
                <button
                  key={i}
                  data-sp={SNAP_FIELD[s.k]}
                  onClick={() => { haptic(); if (vm.onField) return vm.onField(SNAP_FIELD[s.k]); (tabletAction[s.k] || (() => {}))(); }}
                  className="relative appearance-none rounded-2xl bg-slate-50 p-5 text-left transition active:scale-[0.98]"
                  style={{ border: "none", outline: "none" }}
                >
                  <span className="grid h-8 w-8 place-items-center rounded-xl" style={{ background: "rgba(37,99,235,0.10)" }}>
                    <TIcon size={16} style={{ color: "#2563eb" }} strokeWidth={2.3} />
                  </span>
                  <p className="mt-3 text-[22px] font-extrabold leading-none tracking-tight text-slate-900 tabular-nums">{s.v || "—"}</p>
                  <p className="mt-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{s.k}</p>
                  {s.sub && <p className="mt-1 text-[10px] font-medium tracking-tight text-slate-400">{s.sub}</p>}
                  <ChevronRight size={13} className="absolute right-3 top-3" style={{ color: "#cbd5e1" }} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== SECTION CARDS (tap to open detail sheet) ===== */}
      <div>
        <span className={`${subLabel} px-0.5`}>Explore</span>
        <div className="mt-2.5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <SectionRow sp="cp-shares" Icon={Layers} label="Share Structure" preview={CAP.outstanding ? `${capShort(basic)} basic · ${capShort(fd)} fully diluted` : "—"} onClick={() => { haptic(); if (vm.onField) return vm.onField("cp-shares"); setSheet("structure"); }} first />
          <SectionRow sp="cp-insider" Icon={Users} label="Ownership" preview={ownPreview} onClick={() => { haptic(); if (vm.onField) return vm.onField("cp-insider"); setSheet("ownership"); }} />
          <SectionRow sp="cp-fin" Icon={Coins} label="Latest Financing" preview={r0.v ? `${r0.v} ${(r0.type||"").toLowerCase()} · ${r0.d}` : "—"} onClick={() => { haptic(); if (vm.onField) return vm.onField("cp-fin"); setSheet("financing"); }} />
          <SectionRow sp="cp-findetails" Icon={Activity} label="Financial Details" preview="Enterprise value, working capital, debt" onClick={() => { haptic(); if (vm.onField) return vm.onField("cp-findetails"); setSheet("finDetails"); }} />
        </div>
      </div>
    </div>

    {metricKey && (() => {
      const eduMap = { "Market Cap": EDU.marketCap, "Cash": EDU.cash, "Long-Term Debt": EDU.debt, "Enterprise Value": EDU.ev, "Working Capital": EDU.workingCapital, "Debt-to-Equity": EDU.debtToEquity };
      const edu = eduMap[metricKey];
      const rows = METRIC_DETAIL[metricKey];
      const evCalc = [["Market Cap", COMPANY.marketCap, "+"], ["Total Debt", COMPANY.debt, "+"], ["Cash", COMPANY.cash, "−"]];
      return (
        <BottomSheet onClose={() => setMetricKey(null)}>
          <div className="border-b border-slate-200 pb-3 pr-9">
            <span className="text-[9px] font-extrabold uppercase tracking-[0.18em]" style={{ color: "#2563eb" }}>{metricKey}</span>
            <h3 className="mt-1 text-[18px] font-extrabold tracking-tight text-slate-900">{edu ? edu.t : metricKey}</h3>
          </div>

          {metricKey === "Enterprise Value" ? (
            <div className="mt-4">
              {evCalc.map((d, i) => (
                <div key={i} className="flex items-center justify-between gap-3 border-t border-slate-100 py-2.5">
                  <span className="flex items-center gap-2">
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[11px] font-bold" style={{ background: "#eef2ff", color: "#2563eb" }}>{d[2]}</span>
                    <span className="text-[12.5px] font-semibold tracking-tight text-slate-700">{d[0]}</span>
                  </span>
                  <span className="text-[13px] font-bold tabular-nums tracking-tight text-slate-900">{d[1]}</span>
                </div>
              ))}
              <div className="mt-1 flex items-center justify-between gap-3 border-t-2 border-slate-300 pt-3">
                <span className="text-[12.5px] font-extrabold tracking-tight text-slate-900">Enterprise Value</span>
                <span className="text-[16px] font-extrabold tabular-nums tracking-tight" style={{ color: "#2563eb" }}>{COMPANY.ev}</span>
              </div>
            </div>
          ) : (
            <div className="mt-4">
              {(rows || []).map((d, i) => (
                <div key={i} className="flex items-start justify-between gap-3 border-t border-slate-100 py-2.5 first:border-t-0">
                  <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">{d[0]}</span>
                  <span className="text-right text-[12.5px] font-semibold tabular-nums tracking-tight text-slate-700">{d[1] || NR}</span>
                </div>
              ))}
            </div>
          )}

          {edu && (
            <div className="mt-5 space-y-3.5 border-t border-slate-100 pt-4">
              {[["What it means", edu.what], ["Why it's reported", edu.why], ["How it's calculated", edu.how]].map((d, i) => (
                <div key={i}>
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#2563eb" }}>{d[0]}</p>
                  <p className="mt-1 text-[12.5px] font-medium leading-relaxed text-slate-600">{d[1]}</p>
                </div>
              ))}
            </div>
          )}
        </BottomSheet>
      );
    })()}

    {eduKey && EDU[eduKey] && (
      <BottomSheet onClose={() => setEduKey(null)}>
        <div className="border-b border-slate-200 pb-3 pr-9">
          <span className="text-[9px] font-extrabold uppercase tracking-[0.18em]" style={{ color: "#2563eb" }}>About</span>
          <h3 className="mt-1 text-[18px] font-extrabold tracking-tight text-slate-900">{EDU[eduKey].t}</h3>
        </div>
        <div className="mt-4 space-y-3.5">
          {[["What it means", EDU[eduKey].what], ["Why companies report it", EDU[eduKey].why], ["How it is used", EDU[eduKey].how]].map((d, i) => (
            <div key={i}>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#2563eb" }}>{d[0]}</p>
              <p className="mt-1 text-[12.5px] font-medium leading-relaxed text-slate-600">{d[1]}</p>
            </div>
          ))}
        </div>
      </BottomSheet>
    )}

    {/* ===== SHARE STRUCTURE SHEET ===== */}
    {sheet === "structure" && (
      <BottomSheet onClose={() => setSheet(null)}>
        <div className="border-b border-slate-200 pb-3 pr-9">
          <span className="text-[9px] font-extrabold uppercase tracking-[0.18em]" style={{ color: "#2563eb" }}>Capital</span>
          <h3 className="mt-1 text-[18px] font-extrabold tracking-tight text-slate-900">Share Structure</h3>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <div className="flex flex-col rounded-2xl border border-slate-100 bg-slate-50 p-3.5">
            <p className="text-[8px] font-bold uppercase tracking-[0.1em] leading-none text-slate-400">Basic Shares</p>
            <p className="mt-1.5 text-[14px] font-bold tabular-nums tracking-tight text-slate-900">{capShort(basic)}</p>
          </div>
          {(fd > 0 || blank) && (
            <div className="flex flex-col rounded-2xl border border-slate-100 bg-slate-50 p-3.5">
              <p className="text-[8px] font-bold uppercase tracking-[0.1em] leading-none text-slate-400">Fully Diluted</p>
              <p className="mt-1.5 text-[14px] font-bold tabular-nums tracking-tight text-slate-900">{capShort(fd)}</p>
            </div>
          )}
        </div>
        {fd > 0 && <div className="mt-4"><DilutionViz basic={basic} fd={fd} /></div>}
        {ssGroups.map((g, gi) => {
          const tranches = g.rows.filter((r) => r.det && r.det !== "\u2014");
          return (
            <div key={gi} className="mt-4 border-t border-slate-100 pt-4">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] font-bold tracking-tight text-slate-900">{g.key}</span>
                <span className="text-[13px] font-bold tabular-nums tracking-tight text-slate-900">{capFmt(g.total)}</span>
              </div>
              {tranches.length > 0 && (
                <div className="mt-2.5 space-y-2">
                  {tranches.map((r, ri) => (
                    <div key={ri} className="flex items-center justify-between gap-3">
                      <span className="text-[11px] font-medium text-slate-400">{r.det}</span>
                      <span className="text-[11.5px] font-medium tabular-nums tracking-tight text-slate-500">{r.qty}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {(fd > 0 || blank) && (
          <div className="mt-4 flex items-baseline justify-between border-t border-slate-100 pt-4">
            <span className="text-[13px] font-bold tracking-tight text-slate-900">Potential Dilution</span>
            <span className="text-[13px] font-semibold tabular-nums tracking-tight text-slate-700">{dilutionPct}</span>
          </div>
        )}
        {(optCalc || warCalc) && (
          <div className="mt-5 border-t border-slate-200 pt-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Potential Exercise Proceeds</p>
            <div className="mt-2 flex items-end justify-between gap-3">
              <span className="text-[11px] font-medium leading-snug text-slate-500">If all outstanding options<br />and warrants were exercised</span>
              <span className="text-[15px] font-extrabold tabular-nums tracking-tight text-slate-900">{money(totalProceeds)}</span>
            </div>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-400">Options · Weighted Avg</span>
                <span className="text-[11.5px] font-medium tabular-nums text-slate-600">{optCalc ? "C$" + optCalc.avg.toFixed(2) : NR}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-400">Warrants · Weighted Avg</span>
                <span className="text-[11.5px] font-medium tabular-nums text-slate-600">{warCalc ? "C$" + warCalc.avg.toFixed(2) : NR}</span>
              </div>
            </div>
          </div>
        )}
        {(fd > 0 || blank) && (
          <div className="mt-5 flex items-baseline justify-between border-t border-slate-200 pt-4">
            <span className="text-[13px] font-bold tracking-tight text-slate-900">Fully Diluted Total</span>
            <span className="text-[17px] font-extrabold tabular-nums tracking-tight text-slate-900">{CAP.fd}</span>
          </div>
        )}
      </BottomSheet>
    )}

    {/* ===== OWNERSHIP SHEET ===== */}
    {sheet === "ownership" && (
      <BottomSheet onClose={() => setSheet(null)}>
        <div className="border-b border-slate-200 pb-3 pr-9">
          <span className="text-[9px] font-extrabold uppercase tracking-[0.18em]" style={{ color: "#2563eb" }}>Capital</span>
          <h3 className="mt-1 text-[18px] font-extrabold tracking-tight text-slate-900">Ownership</h3>
        </div>
        <div className="mt-2">
          {OWNERSHIP.map(([k, v], i) => (
            <div key={i} className={`flex items-center justify-between gap-3 py-3.5 ${i === 0 ? "" : "border-t border-slate-100"}`}>
              <span className="text-[13px] font-semibold tracking-tight text-slate-900">{k}</span>
              <span className="text-[13px] font-semibold tabular-nums tracking-tight text-slate-700">{v || NR}</span>
            </div>
          ))}
        </div>
        {insiderOwn && <p className="mt-2 border-t border-slate-100 pt-3 text-[11.5px] font-medium leading-relaxed text-slate-500">Insider ownership of {insiderOwn} keeps management directly aligned with shareholders. Institutional ownership is not currently reported.</p>}
      </BottomSheet>
    )}

    {/* ===== LATEST FINANCING SHEET ===== */}
    {sheet === "financing" && (
      <BottomSheet onClose={() => setSheet(null)}>
        <div className="border-b border-slate-200 pb-3 pr-9">
          <span className="text-[9px] font-extrabold uppercase tracking-[0.18em]" style={{ color: EM_TEXT }}>Financing</span>
          <h3 className="mt-1 text-[18px] font-extrabold tracking-tight text-slate-900">Latest Financing</h3>
        </div>
        <div className="mt-4 flex items-baseline justify-between">
          <span className="text-[22px] font-extrabold tabular-nums tracking-tight" style={{ color: EM_TEXT }}>{r0.v}</span>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{r0.d}</span>
        </div>
        <p className="text-[12.5px] font-medium text-slate-500">{r0.type}</p>
        <div className="mt-3">
          {[["Price per Share", r0.price || NR], ["Lead Broker", r0.lead || NR], ["Purpose", r0.purpose || NR], ["Status", r0.status || "Completed"]].map((d, i) => (
            <div key={i} className="flex items-start justify-between gap-3 border-t border-slate-100 py-2.5">
              <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">{d[0]}</span>
              <span className="text-right text-[12.5px] font-semibold tracking-tight text-slate-700">{d[1]}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 border-t border-slate-100 pt-3 text-[11.5px] font-medium leading-relaxed text-slate-500">A bought deal means an underwriter purchased the entire offering up front and took on the resale risk — generally read as a sign of confidence in the story.</p>
      </BottomSheet>
    )}

    {/* ===== FINANCIAL DETAILS SHEET ===== */}
    {sheet === "finDetails" && (
      <BottomSheet onClose={() => setSheet(null)}>
        <div className="border-b border-slate-200 pb-3 pr-9">
          <span className="text-[9px] font-extrabold uppercase tracking-[0.18em]" style={{ color: "#2563eb" }}>Capital</span>
          <h3 className="mt-1 text-[18px] font-extrabold tracking-tight text-slate-900">Financial Details</h3>
        </div>
        <div className="mt-2">
          {finDetails.map((m, i) => {
            const tappable = m.k === "Enterprise Value";
            return (
              <div key={i} className="flex items-center justify-between gap-3 border-t border-slate-100 py-3.5">
                <button
                  onClick={tappable ? () => { haptic(); setSheet(null); setMetricKey(m.k); } : undefined}
                  className="flex appearance-none items-center gap-1 text-left"
                  style={{ border: "none", background: "transparent", outline: "none", cursor: tappable ? "pointer" : "default" }}
                >
                  <span className="text-[13px] font-semibold tracking-tight text-slate-900">{m.k}</span>
                  {tappable && <Info size={11} style={{ color: "#cbd5e1" }} strokeWidth={2.4} />}
                </button>
                <span className="text-[13px] font-semibold tabular-nums tracking-tight text-slate-700">{m.v}</span>
              </div>
            );
          })}
        </div>
      </BottomSheet>
    )}

    {/* ===== AI SUMMARY SHEET ===== */}
    {sheet === "aiSummary" && (
      <BottomSheet onClose={() => setSheet(null)}>
        <div className="flex items-center gap-2.5 border-b border-slate-200 pb-3 pr-9">
          <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full" style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)" }}>
            <Sparkles size={16} color="#fff" strokeWidth={2.4} />
          </span>
          <div>
            <span className="block text-[9px] font-extrabold uppercase tracking-[0.18em]" style={{ color: "#7c3aed" }}>AI Summary</span>
            <h3 className="text-[16px] font-extrabold tracking-tight text-slate-900">Capital structure at a glance</h3>
          </div>
        </div>
        <div className="mt-4 space-y-3.5">
          {AI_SUMMARY.map((d, i) => (
            <div key={i}>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#7c3aed" }}>{d.h}</p>
              <p className="mt-1 text-[12.5px] font-medium leading-relaxed text-slate-600">{d.b}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 border-t border-slate-100 pt-3 text-[10px] font-medium leading-relaxed text-slate-400">Generated from this company's reported capital figures. Not investment advice.</p>
      </BottomSheet>
    )}
    </>
  );
}

/* ============================================================
   PROJECTS  —  full detail for both sites (own tab)
   ============================================================ */
/* ---- Project 1 detail content (carousel + wallet pills + AI brief) ---- */
// To use real photos, add a `src` (base64 or URL) to any slide below.
const LC_GALLERY = [];

const AM_GALLERY = [];

const LC_PILLS = [];

const LC_BRIEF = {};

// Liquid-glass surface for the expand / close controls.
const GLASS = {
  background: "rgba(255,255,255,0.14)",
  backdropFilter: "blur(16px) saturate(180%)",
  WebkitBackdropFilter: "blur(16px) saturate(180%)",
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "inset 0 1px 1px rgba(255,255,255,0.55), inset 0 -1px 1px rgba(255,255,255,0.15), 0 4px 14px rgba(2,6,23,0.25)",
};

// Project 1 site photos — replaces the map in the project detail view.
const LC_SITE_GALLERY = [];  // site photos stripped


// Swipeable photo carousel (tile + fullscreen lightbox). Tap a photo to expand;
// the > control advances and loops; X closes the lightbox.
function ProjectGallery({ slides }) {
  const [idx, setIdx] = useState(0);        // tile position
  const [open, setOpen] = useState(false);
  const [expIdx, setExpIdx] = useState(0);  // lightbox position
  const ref = useRef(null);
  const expRef = useRef(null);
  const tapRef = useRef(null);

  const onScroll = () => {
    const el = ref.current; if (!el) return;
    setIdx(Math.round(el.scrollLeft / el.clientWidth));
  };
  const onExpScroll = () => {
    const el = expRef.current; if (!el) return;
    setExpIdx(Math.round(el.scrollLeft / el.clientWidth));
  };

  // Distinguish a tap (open lightbox) from a swipe (scroll through).
  const onPointerDown = (e) => { tapRef.current = { x: e.clientX, y: e.clientY }; };
  const onPointerUp = (e) => {
    const d = tapRef.current; tapRef.current = null;
    if (!d) return;
    if (Math.abs(e.clientX - d.x) < 8 && Math.abs(e.clientY - d.y) < 8) {
      setExpIdx(idx); setOpen(true);
    }
  };

  // Advance the tile, looping back to the first photo.
  const nextTile = (e) => {
    e.stopPropagation();
    const el = ref.current; if (!el) return;
    const n = (idx + 1) % slides.length;
    el.scrollTo({ left: n * el.clientWidth, behavior: "smooth" });
  };
  // Advance the lightbox, looping.
  const nextExp = () => {
    const el = expRef.current; if (!el) return;
    const n = (expIdx + 1) % slides.length;
    el.scrollTo({ left: n * el.clientWidth, behavior: "smooth" });
  };

  // Sync lightbox to the tile position when it opens.
  useEffect(() => {
    if (open && expRef.current) {
      const el = expRef.current;
      el.scrollLeft = idx * el.clientWidth;
    }
  }, [open]);

  // When closing, reflect the lightbox position back onto the tile.
  const closeLightbox = () => {
    setOpen(false);
    const el = ref.current;
    if (el) { setIdx(expIdx); requestAnimationFrame(() => { el.scrollLeft = expIdx * el.clientWidth; }); }
  };

  const stop = (e) => e.stopPropagation();

  return (
    <div>
      {/* TILE — same footprint as the map it replaces: 300 tall, rounded, bordered */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200" style={{ height: 300, background: "#0f172a" }}>
        <div
          ref={ref}
          onScroll={onScroll}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          className="pp-scroll flex cursor-pointer overflow-x-auto"
          style={{ height: "100%", scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" }}
        >
          {slides.map((s, i) => (
            <div key={i} className="relative flex-shrink-0" style={{ width: "100%", height: "100%", scrollSnapAlign: "center" }}>
              <img src={s.src} alt={s.label} draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </div>
          ))}
        </div>

        {/* dot indicators */}
        <div className="pointer-events-none absolute inset-x-0 flex justify-center" style={{ bottom: 12, gap: 6 }}>
          {slides.map((_, i) => (
            <span key={i} style={{ height: 5, width: i === idx ? 16 : 5, borderRadius: 999, background: i === idx ? "#fff" : "rgba(255,255,255,0.5)", transition: "all .3s", boxShadow: "0 1px 2px rgba(2,6,23,0.4)" }} />
          ))}
        </div>

      </div>

      {/* FULLSCREEN LIGHTBOX */}
      {open && (
        <div className="absolute inset-0 z-[80] flex flex-col bg-slate-950/95 backdrop-blur-sm pp-fade">
          <button
            onClick={closeLightbox}
            aria-label="Close gallery"
            className="absolute z-10 grid place-items-center active:scale-90"
            style={{ top: 16, right: 16, height: 40, width: 40, borderRadius: 999, ...GLASS }}
          >
            <X size={18} className="text-white" strokeWidth={2.5} />
          </button>

          <div className="flex flex-1 items-center">
            <div
              ref={expRef}
              onScroll={onExpScroll}
              className="pp-scroll flex w-full overflow-x-auto"
              style={{ scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" }}
            >
              {slides.map((s, i) => (
                <div key={i} className="flex flex-shrink-0 items-center justify-center" style={{ width: "100%", scrollSnapAlign: "center", paddingLeft: 16, paddingRight: 16 }}>
                  <img src={s.src} alt={s.label} draggable={false} style={{ width: "100%", maxHeight: "66vh", objectFit: "contain", borderRadius: 16 }} />
                </div>
              ))}
            </div>
          </div>

          {/* right-arrow advance */}
          <button
            onClick={nextExp}
            aria-label="Next photo"
            className="absolute grid place-items-center active:scale-90"
            style={{ top: "50%", right: 14, transform: "translateY(-50%)", height: 42, width: 42, borderRadius: 999, ...GLASS }}
          >
            <ChevronRight size={20} className="text-white" strokeWidth={2.5} />
          </button>

          {/* caption + dots */}
          <div style={{ paddingBottom: 28, paddingTop: 12 }}>
            <p style={{ textAlign: "center", fontSize: 8, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>{slides[expIdx] ? slides[expIdx].kicker : ""}</p>
            <p style={{ textAlign: "center", fontSize: 13, fontWeight: 700, color: "#fff", marginTop: 2 }}>{slides[expIdx] ? slides[expIdx].label : ""}</p>
            <div className="flex justify-center" style={{ gap: 6, marginTop: 10 }}>
              {slides.map((_, i) => (
                <span key={i} style={{ height: 5, width: i === expIdx ? 16 : 5, borderRadius: 999, background: i === expIdx ? "#fff" : "rgba(255,255,255,0.35)", transition: "all .3s" }} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const LIFECYCLE = [
  { name: "Exploration", short: "Explore" },
  { name: "Discovery", short: "Discover" },
  { name: "Resource Definition", short: "Resource" },
  { name: "Economic Studies", short: "Studies" },
  { name: "Development", short: "Develop" },
  { name: "Production", short: "Produce" },
];

// Apple-clean project lifecycle: connected nodes, current highlighted, rest muted.
const STAGE_NAMES = ["Explore", "Discovery", "Resource", "Studies", "Development", "Production"];
const STAGE_SHORT = ["Explore", "Discovery", "Resource", "Studies", "Develop", "Produce"];
function StageTrack({ idx, tone, toneSoft }) {
  const n = STAGE_NAMES.length;
  const [frac, setFrac] = useState(0);
  useEffect(() => {
    setFrac(0);
    const t = setTimeout(() => setFrac(idx / (n - 1)), 120);
    return () => clearTimeout(t);
  }, [idx, n]);
  return (
    <div className="rounded-2xl p-4" style={{ background: "#000000", border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 10px 26px -14px rgba(0,0,0,0.6)" }}>
      <div className="flex items-center justify-between">
        <span className={`${subLabel} px-0.5`} style={{ color: "#ffffff" }}>Project Stage</span>
        <span className="flex items-center gap-1 text-[11px] font-bold tracking-tight" style={{ color: tone }}>
          {STAGE_NAMES[idx]}
          <ChevronRight size={13} className="pp-nudge" style={{ color: "rgba(255,255,255,0.4)" }} />
        </span>
      </div>
      <div className="relative mt-4" style={{ height: 18 }}>
        {/* base rail */}
        <div className="absolute" style={{ left: "8.333%", right: "8.333%", top: 8, height: 2, borderRadius: 999, background: "rgba(255,255,255,0.13)" }} />
        {/* progress rail */}
        <div className="absolute" style={{ left: "8.333%", top: 8, height: 2, borderRadius: 999, width: `calc((100% - 16.666%) * ${frac})`, background: tone, transition: "width .7s cubic-bezier(.22,1,.36,1)" }} />
        {/* nodes */}
        <div className="absolute inset-0 flex">
          {STAGE_NAMES.map((s, i) => {
            const done = i < idx, cur = i === idx;
            return (
              <div key={i} className="flex flex-1 items-start justify-center">
                {cur ? (
                  <span className="relative grid place-items-center rounded-full" style={{ height: 18, width: 18, background: tone, boxShadow: `0 0 0 4px ${tone}2e` }}>
                    <span className="pp-ping absolute inline-flex rounded-full" style={{ height: 18, width: 18, background: tone, opacity: 0.55 }} />
                    <span className="relative" style={{ height: 6, width: 6, borderRadius: 999, background: "#fff" }} />
                  </span>
                ) : (
                  <span style={{ height: 18, display: "grid", placeItems: "center" }}>
                    <span style={{ height: 11, width: 11, borderRadius: 999, background: done ? tone : "#1a1d25", border: done ? "none" : "1.5px solid rgba(255,255,255,0.22)" }} />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {/* labels */}
      <div className="mt-2.5 flex">
        {STAGE_NAMES.map((s, i) => (
          <span key={i} className="flex-1 text-center" style={{ fontSize: 8.5, lineHeight: 1.2, fontWeight: i === idx ? 800 : 600, letterSpacing: "0.02em", whiteSpace: "nowrap", color: i === idx ? tone : i < idx ? "#ffffff" : "#c7cdd6" }}>{STAGE_SHORT[i]}</span>
        ))}
      </div>
    </div>
  );
}

const AM_SITE_GALLERY = [];

const AM_BRIEF = {};

// Marker tones by type
const MK_TONE = { drill: "#2563eb", historic: "#64748b", target: "#10b981", explore: "#f59e0b" };
const MK_LABEL = { drill: "Active Drilling", historic: "Historic Mine", target: "Drill Target", explore: "Exploration Target" };

// Interactive Leaflet map embedded directly in the Projects page.
function ProjectMap({ project }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [peek, setPeek] = useState(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let cancelled = false;
    const ensureCss = () => {
      if (document.getElementById("leaflet-css")) return;
      const l = document.createElement("link");
      l.id = "leaflet-css"; l.rel = "stylesheet";
      l.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
      document.head.appendChild(l);
    };
    const ensureJs = () => new Promise((resolve, reject) => {
      if (window.L) return resolve(window.L);
      const ex = document.getElementById("leaflet-js");
      if (ex) { ex.addEventListener("load", () => resolve(window.L)); ex.addEventListener("error", reject); return; }
      const s = document.createElement("script");
      s.id = "leaflet-js";
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
      s.onload = () => resolve(window.L); s.onerror = reject;
      document.body.appendChild(s);
    });

    ensureCss();
    ensureJs().then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, { zoomControl: true, attributionControl: false, scrollWheelZoom: false });
      mapRef.current = map;
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", { subdomains: "abcd", maxZoom: 20, detectRetina: true, crossOrigin: true }).addTo(map);

      if (project.boundary) {
        L.polygon(project.boundary, { color: project.tone, weight: 2, fillColor: project.tone, fillOpacity: 0.08, dashArray: "5 4" }).addTo(map);
      }
      const pin = (tone) => L.divIcon({
        className: "", iconSize: [26, 34], iconAnchor: [13, 32],
        html: `<svg width="26" height="34" viewBox="0 0 24 32" style="filter:drop-shadow(0 2px 4px rgba(15,23,42,.4))"><path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 20 12 20s12-11 12-20C24 5.37 18.63 0 12 0z" fill="${tone}"/><circle cx="12" cy="12" r="4.4" fill="#fff"/></svg>`,
      });
      project.markers.forEach((mk) => {
        const m = L.marker([mk.lat, mk.lon], { icon: pin(MK_TONE[mk.type]), title: mk.name }).addTo(map);
        m.on("click", () => setPeek(mk));
      });
      const pts = project.markers.map((mk) => [mk.lat, mk.lon]);
      try { map.fitBounds(L.latLngBounds(pts).pad(0.55)); } catch (e) { map.setView(pts[0] || [27, -105.45], 12); }
      setTimeout(() => { if (!cancelled && mapRef.current) mapRef.current.invalidateSize(); }, 240);
      setStatus("ready");
    }).catch(() => { if (!cancelled) setStatus("error"); });

    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, [project.key]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200" style={{ height: 300, background: "#eef2f7" }}>
      <div ref={containerRef} style={{ position: "absolute", inset: 0, zIndex: 0 }} />
      {status !== "ready" && (
        <div className="absolute inset-0 grid place-items-center text-[11px] font-medium text-slate-400" style={{ zIndex: 1 }}>
          {status === "loading" ? "Loading map…" : "Map unavailable offline"}
        </div>
      )}
      {/* legend */}
      <div className="absolute left-2.5 top-2.5 flex flex-col gap-1 rounded-xl px-2.5 py-2" style={{ zIndex: 1000, background: "rgba(255,255,255,0.92)", backdropFilter: "blur(6px)", boxShadow: "0 2px 8px rgba(15,23,42,0.12)" }}>
        {Object.keys(MK_LABEL).map((k) => (
          <div key={k} className="flex items-center gap-1.5">
            <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: MK_TONE[k] }} />
            <span className="text-[8px] font-bold uppercase tracking-wide text-slate-500">{MK_LABEL[k]}</span>
          </div>
        ))}
      </div>
      {/* floating info card */}
      {peek && (
        <div className="absolute inset-x-2.5 bottom-2.5 rounded-2xl bg-white p-3.5 pp-pop" style={{ zIndex: 1000, boxShadow: "0 12px 30px -8px rgba(15,23,42,0.4)" }}>
          <button onClick={() => setPeek(null)} aria-label="Close" className="absolute grid h-6 w-6 place-items-center rounded-full bg-slate-100 text-slate-400 transition active:scale-90" style={{ top: 10, right: 10 }}>
            <X size={13} />
          </button>
          <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5" style={{ background: `${MK_TONE[peek.type]}1a` }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: MK_TONE[peek.type] }} />
            <span className="text-[8px] font-extrabold uppercase tracking-wider" style={{ color: MK_TONE[peek.type] }}>{MK_LABEL[peek.type]}</span>
          </span>
          <p className="mt-1.5 text-[14px] font-extrabold tracking-tight text-slate-900 pr-6">{peek.name}</p>
          <p className="mt-1 text-[11.5px] font-medium leading-snug text-slate-500">{peek.desc}</p>
        </div>
      )}
    </div>
  );
}

// District Maps — swipeable carousel of company map images with an explanation
// beneath each. Falls back to the interactive Leaflet map until image sets are
// embedded (pass slides as [{ src, title, desc }]).
function MapCarousel({ slides, project, title, desc }) {
  const [idx, setIdx] = useState(0);
  const ref = useRef(null);
  const onScroll = () => { const el = ref.current; if (el) setIdx(Math.round(el.scrollLeft / el.clientWidth)); };

  if (!slides || slides.length === 0) {
    return (
      <div>
        <ProjectMap project={project} />
        <p className="mt-3 text-[12.5px] font-bold tracking-tight text-slate-900">{title}</p>
        <p className="mt-0.5 text-[12px] font-medium leading-snug text-slate-500">{desc}</p>
        <div className="mt-3 flex items-start gap-1.5 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-2.5 text-slate-400">
          <GalleryHorizontal size={13} strokeWidth={2.2} className="mt-px flex-shrink-0" />
          <span className="text-[10.5px] font-medium leading-snug">Company district map sets drop in here as a swipeable carousel.</span>
        </div>
      </div>
    );
  }

  const cur = slides[idx] || slides[0];
  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl border border-slate-200" style={{ height: 300, background: "#0f172a" }}>
        <div ref={ref} onScroll={onScroll} className="pp-scroll flex overflow-x-auto"
          style={{ height: "100%", scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" }}>
          {slides.map((s, i) => (
            <div key={i} className="relative flex-shrink-0" style={{ width: "100%", height: "100%", scrollSnapAlign: "center" }}>
              <img src={s.src} alt={s.title} draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </div>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-x-0 flex justify-center" style={{ bottom: 12, gap: 6 }}>
          {slides.map((_, i) => (
            <span key={i} style={{ height: 5, width: i === idx ? 16 : 5, borderRadius: 999, background: i === idx ? "#fff" : "rgba(255,255,255,0.5)", transition: "all .3s", boxShadow: "0 1px 2px rgba(2,6,23,0.4)" }} />
          ))}
        </div>
      </div>
      <p className="mt-3 text-[12.5px] font-bold tracking-tight text-slate-900">{cur.title}</p>
      <p className="mt-0.5 text-[12px] font-medium leading-snug text-slate-500">{cur.desc}</p>
      <div className="mt-2 flex items-center gap-1.5 text-slate-400">
        <GalleryHorizontal size={12} strokeWidth={2.2} />
        <span className="text-[10px] font-semibold tracking-tight">Swipe to browse all maps</span>
      </div>
    </div>
  );
}

// ----- Project-level data: expandable snapshot, stage detail, uniqueness -----
const LC_SNAP = [];
const AM_SNAP = [];
const LC_STAGE = {};
const AM_STAGE = {};
const LC_UNIQUE = {};
const AM_UNIQUE = {};

const DEFAULT_PROJECTS = [
  { id: "project-1", enabled: true,  name: "Project 1" },
  { id: "project-2", enabled: true,  name: "Project 2" },
  { id: "project-3", enabled: false, name: "Project 3" },
  { id: "project-4", enabled: false, name: "Project 4" },
];
// Each configurable project maps onto one of the two blank templates (odd→lc, even→am),
// so projects 3 & 4 reuse the existing template variants without new placeholder data.
const templateFor = (id) => (parseInt(String(id).split("-")[1], 10) % 2 === 1 ? "lc" : "alm");

function ProjectsView({ spot, projects } = {}) {
  const ctxProfile = useContext(ProfileContext)?.profile;
  const PROJECTS = ctxProfile?.projects ?? ((projects && projects.length) ? projects : DEFAULT_PROJECTS);
  const enabled = PROJECTS.filter((x) => x.enabled);
  const [selId, setSelId] = useState(enabled[0] ? enabled[0].id : "project-1");
  const [winStart, setWinStart] = useState(0);   // left index of the 2-tab window (only used when 3+ projects)
  const [showBrief, setShowBrief] = useState(false);
  const [cardSheet, setCardSheet] = useState(null);
  const [showWhy, setShowWhy] = useState(false);
  const [snapSheet, setSnapSheet] = useState(null);
  const [showStage, setShowStage] = useState(false);
  const [showUnique, setShowUnique] = useState(false);
  // Keep the selection valid and the window in range when the project set changes.
  useEffect(() => {
    if (!enabled.find((x) => x.id === selId)) { setSelId(enabled[0] ? enabled[0].id : "project-1"); setWinStart(0); }
    else setWinStart((ws) => Math.max(0, Math.min(ws, Math.max(0, enabled.length - 2))));
  }, [enabled.map((x) => x.id).join("|")]);
  // Two-tab sliding window: tapping the far tab reveals its neighbour; tapping the near tab slides back.
  const onTab = (pr) => {
    const n = enabled.length, i = enabled.findIndex((x) => x.id === pr.id);
    setSelId(pr.id);
    if (n > 2) setWinStart((ws0) => { const ws = Math.min(ws0, n - 2); if (i === ws && ws > 0) return ws - 1; if (i === ws + 1 && ws + 1 < n - 1) return ws + 1; return ws; });
  };
  // Onboarding: reveal the unique card for its "expanded" step, collapse for the intro step.
  useEffect(() => {
    if (spot === "pj-unique-expanded") setShowUnique(true);
    else if (spot === "pj-unique") setShowUnique(false);
  }, [spot]);

  const PROJ = {};

  // Task 2: project content comes from the selected project in `profile`
  // (empty by default). Labels are universal template; values are company data.
  const selProj = enabled.find((x) => x.id === selId) || enabled[0] || {};
  const p = {
    name: selProj.name || "",
    tone: "#10b981", toneText: "#0f766e", toneSoft: "rgba(16,185,129,0.08)",
    gallery: (selProj.gallery && selProj.gallery.length) ? selProj.gallery : null,
    stageIdx: (typeof selProj.stageIdx === "number" ? selProj.stageIdx : -1),
    cards: selProj.cards || [],
    geo: selProj.geo || {},
    status: selProj.status || "",
    description: selProj.description || "",
    brief: {
      what: selProj.description || (selProj.brief && selProj.brief.what) || "",
      exploring: (selProj.brief && selProj.brief.exploring) || "",
      focus: (selProj.brief && selProj.brief.focus) || "",
      opportunity: (selProj.brief && selProj.brief.opportunity) || "",
      risksText: (selProj.brief && selProj.brief.risksText) || "",
      simple: (selProj.brief && selProj.brief.simple) || "",
    },
  };
  const hasBrief = !!(p.brief.what || p.brief.exploring || p.brief.focus || p.brief.opportunity || p.brief.risksText || p.brief.simple);
  const SNAP = SNAP_TEMPLATE.map((t, i) => {
    const v = (selProj.snapshot && selProj.snapshot[i]) || {};
    return { ...t, value: v.value || "", value2: v.value2 || "", sub: v.sub || "", detail: v.detail || [] };
  });
  const STAGEINFO = selProj.stage || {};
  const UNIQUE = selProj.unique || {};
  const GEO_ORDER = [
    { kind: "map", label: "District Maps", sub: "Claims · Structures · Regional Context", Icon: MapIcon },
    { kind: "geology", label: "Geology", sub: "Rocks · Structures · Mineralization", Icon: Layers },
    { kind: "drills", label: "Drill Results", sub: "Intercepts · Assays · Sections", Icon: Drill },
    { kind: "history", label: "Exploration History", sub: "Programs · Operators · Discoveries", Icon: Clock },
    { kind: "nearby", label: "Nearby Operations", sub: "Mines · Deposits · Processing", Icon: Navigation },
    { kind: "infra", label: "Infrastructure", sub: "Roads · Power · Water", Icon: Route },
  ];

  if (!enabled.length) return (
    <div className="px-5 pt-2">
      <div data-sp="pj-header">
        <Kicker section="projects" />
        <h2 className="-mt-0.5 text-xl font-bold tracking-tight text-slate-900">Projects</h2>
      </div>
      <SectionEmpty Icon={Pickaxe} title="No projects yet" sub="Add a project to start building out this section." />
    </div>
  );
  return (
    <div className="px-5 pt-2">
      <div data-sp="pj-header">
        <Kicker section="projects" />
        <h2 className="-mt-0.5 text-xl font-bold tracking-tight text-slate-900">Projects</h2>
        {(() => {
          const n = enabled.length;
          const ws = n <= 2 ? 0 : Math.min(winStart, n - 2);
          const winTabs = n <= 2 ? enabled : [enabled[ws], enabled[ws + 1]].filter(Boolean);
          return (
            <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 p-1" style={{ background: "#f8fafc" }}>
              <div key={winTabs.map((t) => t.id).join("|")} className="flex w-full" style={{ animation: "pp-tab-slide .34s cubic-bezier(.4,0,.2,1)" }}>
                {winTabs.map((pr) => {
                  const active = pr.id === selId;
                  return (
                    <button key={pr.id} onClick={() => onTab(pr)}
                      className="min-w-0 flex-1 truncate rounded-lg py-2 text-[12.5px] font-bold tracking-tight transition-all"
                      style={active ? { background: p.tone, color: "#fff" } : { color: "#64748b" }}>
                      {pr.name}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>

      <div key={selId} className="pp-view mt-4 space-y-5">
        <div data-sp="pj-carousel">{p.gallery ? <ProjectGallery slides={p.gallery} /> : (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-14 text-center">
            <ImageIcon size={26} className="text-slate-300" strokeWidth={1.8} />
            <p className="mt-2 text-[12.5px] font-semibold text-slate-400">No project photos yet</p>
          </div>
        )}</div>

        {(p.status || p.description) && (
          <div className="space-y-2">
            {p.status && <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider" style={{ background: p.toneSoft, color: p.toneText }}>{p.status}</span>}
            {p.description && <p className="text-[13px] font-medium leading-relaxed text-slate-600">{p.description}</p>}
          </div>
        )}

        {/* AI Project Brief — slim Wallet-style card, opens full sheet */}
        <button data-sp="pj-brief" onClick={() => setShowBrief(true)}
          className="flex w-full items-center gap-3 overflow-hidden rounded-2xl px-3.5 py-3 text-left transition active:scale-[0.98]"
          style={{ background: "linear-gradient(150deg,#0b1f4d 0%,#1d4ed8 100%)", boxShadow: "0 4px 16px rgba(29,78,216,0.22)" }}>
          <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-xl bg-white/15"><Zap size={15} className="text-white" strokeWidth={2.4} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[8.5px] font-extrabold uppercase tracking-[0.16em] text-blue-200/90">AI Project Brief</span>
            <span className="mt-px block text-[13px] font-bold tracking-tight text-white">Understand this project in 60 seconds</span>
          </span>
          <ChevronRight size={17} className="flex-shrink-0 text-white/70" />
        </button>

        {/* Project Snapshot — six universal fundamentals, each its own target */}
        <div>
          <span className={`${subLabel} px-0.5`}>Project Snapshot</span>
          <div className="mt-2.5 grid grid-cols-2 gap-2.5">
            {SNAP.map((s, i) => (
              <button key={i} data-sp={`pj-snap-${i}`} onClick={() => setSnapSheet(s)}
                className="flex flex-col rounded-2xl border border-slate-100 bg-slate-50 p-3.5 text-left transition active:scale-[0.97]" style={{ minHeight: 98 }}>
                <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: p.toneSoft }}>
                  <s.Icon size={14} style={{ color: p.tone }} strokeWidth={2.3} />
                </span>
                <p className="mt-2.5 text-[8px] font-bold uppercase tracking-[0.1em] leading-none text-slate-400">{s.label}</p>
                <p className="mt-1.5 text-[13px] font-bold leading-tight tracking-tight text-slate-900">{s.value}</p>
                {s.value2 && <p className="mt-1 text-[10px] font-semibold leading-tight text-slate-500">{s.value2}</p>}
              </button>
            ))}
          </div>
        </div>

        {/* Project Stage — premium lifecycle, expandable */}
        <button data-sp="pj-stage" onClick={() => setShowStage(true)} className="block w-full text-left transition active:scale-[0.99]">
          <StageTrack idx={p.stageIdx} tone={p.tone} toneSoft={p.toneSoft} />
        </button>

        {/* Geological Intelligence — technical library */}
        <div>
          <span className={`${subLabel} px-0.5`}>Geological Intelligence</span>
          <div className="mt-2.5 grid grid-cols-2 gap-2.5">
            {GEO_ORDER.map((o, i) => {
              const c = p.cards.find((x) => x.kind === o.kind);
              const CIcon = o.Icon;
              return (
                <button key={i} data-sp={{ map: "pj-geo-district", geology: "pj-geo-geology", drills: "pj-geo-drill", history: "pj-geo-history", nearby: "pj-geo-nearby", infra: "pj-geo-infra" }[o.kind]} onClick={() => { const gt = (p.geo && p.geo[o.kind]) || ""; setCardSheet(gt ? { label: o.label, sub: o.sub, kind: o.kind, Icon: o.Icon, geoText: gt } : (c ? { ...c, label: o.label } : { label: o.label, sub: o.sub, kind: o.kind, Icon: o.Icon, emptyCard: true })); }}
                  className="relative flex flex-col items-start rounded-2xl border border-slate-100 bg-white p-3 text-left transition active:scale-[0.97]"
                  style={{ boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}>
                  <span className="grid h-8 w-8 place-items-center rounded-xl" style={{ background: p.toneSoft }}><CIcon size={16} style={{ color: p.tone }} strokeWidth={2.3} /></span>
                  <p className="mt-2 pr-3 text-[12.5px] font-bold leading-tight tracking-tight text-slate-900">{o.label}</p>
                  <p className="mt-0.5 text-[10px] font-medium leading-snug text-slate-400">{o.sub}</p>
                  <ChevronRight size={13} className="absolute right-2.5 top-3" style={{ color: "#cbd5e1" }} />
                </button>
              );
            })}
          </div>
        </div>

        {/* What Makes This Project Unique — AI insight, inline expandable card */}
        <div data-sp="pj-unique" className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <button onClick={() => setShowUnique((v) => !v)} aria-expanded={showUnique}
            className="flex w-full items-center gap-2.5 px-4 py-4 text-left transition active:scale-[0.99]">
            <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg" style={{ background: p.toneSoft }}>
              <Sparkles size={14} strokeWidth={2.4} style={{ color: p.tone }} />
            </span>
            <span className="min-w-0 flex-1 text-[13.5px] font-bold tracking-tight text-slate-900">What Makes This Project Unique</span>
            <ChevronDown size={17} strokeWidth={2.4} style={{ color: "#94a3b8", transform: showUnique ? "rotate(180deg)" : "none", transition: "transform .3s ease" }} />
          </button>
          <div style={{ display: "grid", gridTemplateRows: showUnique ? "1fr" : "0fr", transition: "grid-template-rows .4s ease" }}>
            <div className="overflow-hidden">
              <div data-sp="pj-unique-expanded" data-sp-delay="480" className="space-y-4 px-4 pb-4 pt-1">
                {(UNIQUE.diff || []).length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Key Differentiators</p>
                    <ul className="mt-2 space-y-1.5">
                      {(UNIQUE.diff || []).map((b, i) => (
                        <li key={i} className="flex gap-2.5 text-[12px] font-medium leading-snug text-slate-700"><span className="mt-[7px] h-1 w-1 flex-shrink-0 rounded-full" style={{ background: p.tone }} /><span>{b}</span></li>
                      ))}
                    </ul>
                  </div>
                )}
                {(UNIQUE.adv || []).length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Competitive Advantages</p>
                    <ul className="mt-2 space-y-1.5">
                      {(UNIQUE.adv || []).map((b, i) => (
                        <li key={i} className="flex gap-2.5 text-[12px] font-medium leading-snug text-slate-700"><span className="mt-[7px] h-1 w-1 flex-shrink-0 rounded-full" style={{ background: p.tone }} /><span>{b}</span></li>
                      ))}
                    </ul>
                  </div>
                )}
                {(UNIQUE.comps || []).length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Comparable Deposits</p>
                    <ul className="mt-2 space-y-1.5">
                      {(UNIQUE.comps || []).map((b, i) => (
                        <li key={i} className="flex gap-2.5 text-[12px] font-medium leading-snug text-slate-700"><span className="mt-[7px] h-1 w-1 flex-shrink-0 rounded-full" style={{ background: p.tone }} /><span>{b}</span></li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {snapSheet && (
        <BottomSheet onClose={() => setSnapSheet(null)}>
          <div className="flex items-center gap-2.5 border-b border-slate-200 pb-3 pr-9">
            <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-xl" style={{ background: p.toneSoft }}>
              <snapSheet.Icon size={16} style={{ color: p.tone }} strokeWidth={2.3} />
            </span>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">{snapSheet.sub}</p>
              <p className="text-[15px] font-extrabold tracking-tight text-slate-900">{snapSheet.label}</p>
            </div>
          </div>
          <div className="mt-3.5 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100">
            {snapSheet.detail.map((row, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">{row[0]}</span>
                <span className="text-right text-[12.5px] font-bold tracking-tight text-slate-900">{row[1]}</span>
              </div>
            ))}
          </div>
          {snapSheet.note && <p className="mt-3.5 text-[12.5px] font-medium leading-relaxed text-slate-600">{snapSheet.note}</p>}
        </BottomSheet>
      )}

      {showStage && (
        <BottomSheet onClose={() => setShowStage(false)}>
          <div className="flex items-center gap-2.5 border-b border-slate-200 pb-3 pr-9">
            <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-xl" style={{ background: p.toneSoft }}>
              <Mountain size={16} style={{ color: p.tone }} strokeWidth={2.3} />
            </span>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">Project Stage</p>
              <p className="text-[15px] font-extrabold tracking-tight text-slate-900">{STAGEINFO.stage}</p>
            </div>
          </div>
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">What this stage means</p>
              <p className="mt-1 text-[13px] font-medium leading-relaxed text-slate-700">{STAGEINFO.meaning}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Current objectives</p>
              <ul className="mt-2 space-y-1.5">
                {(STAGEINFO.objectives || []).map((b, i) => (
                  <li key={i} className="flex gap-2.5 text-[12.5px] font-medium leading-snug text-slate-700">
                    <span className="mt-[7px] h-1 w-1 flex-shrink-0 rounded-full" style={{ background: p.tone }} />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl p-3.5" style={{ background: p.toneSoft }}>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: p.tone }}>Next major milestone</p>
              <p className="mt-1 text-[13px] font-semibold leading-relaxed text-slate-900">{STAGEINFO.next}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Development path</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                {STAGE_NAMES.map((nm, i) => (
                  <span key={i} className="flex items-center gap-x-1.5">
                    <span className="text-[11px] font-bold tracking-tight" style={{ color: i === p.stageIdx ? p.tone : i < p.stageIdx ? "#475569" : "#cbd5e1" }}>{nm}</span>
                    {i < STAGE_NAMES.length - 1 && <ChevronRight size={11} style={{ color: "#cbd5e1" }} />}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </BottomSheet>
      )}

      {showBrief && hasBrief && (
        <BottomSheet onClose={() => setShowBrief(false)}>
          <div className="flex items-center gap-2.5 pr-9">
            <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full" style={{ background: "rgba(37,99,235,0.12)" }}><Zap size={15} style={{ color: "#1d4ed8" }} strokeWidth={2.6} /></span>
            <div>
              <p className="text-[9px] font-extrabold uppercase tracking-[0.16em]" style={{ color: "#1d4ed8" }}>60-Second Project Brief</p>
              <p className="text-[15px] font-extrabold tracking-tight text-slate-900">{p.name}</p>
            </div>
          </div>
          <div className="mt-3.5 space-y-4 border-t border-slate-100 pt-3.5">
            {p.brief.what && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Project Overview</p>
              <p className="mt-1 text-[13px] font-medium leading-relaxed text-slate-700">{p.brief.what}</p>
            </div>
            )}
            {p.brief.exploring && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">What's Being Explored / Developed</p>
              <p className="mt-1 text-[12.5px] font-medium leading-relaxed text-slate-700">{p.brief.exploring}</p>
            </div>
            )}
            {p.brief.focus && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Current Technical Focus</p>
              <p className="mt-1 text-[12.5px] font-medium leading-relaxed text-slate-700">{p.brief.focus}</p>
            </div>
            )}
            {p.brief.opportunity && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Main Geological Opportunity</p>
              <p className="mt-1 text-[12.5px] font-medium leading-relaxed text-slate-700">{p.brief.opportunity}</p>
            </div>
            )}
            {p.brief.risksText && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Key Technical Risks</p>
              <p className="mt-1 text-[12.5px] font-medium leading-relaxed text-slate-700">{p.brief.risksText}</p>
            </div>
            )}
            {p.brief.simple && (
            <div className="rounded-xl p-3.5" style={{ background: "rgba(37,99,235,0.06)", boxShadow: "inset 3px 0 0 #2563eb" }}>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "#1d4ed8" }}>In Plain English</p>
              <p className="mt-1 text-[13px] font-semibold leading-relaxed text-slate-900">{p.brief.simple}</p>
            </div>
            )}
          </div>
        </BottomSheet>
      )}

      {cardSheet && (
        <BottomSheet onClose={() => setCardSheet(null)}>
          <div className="flex items-center gap-2.5 pr-9">
            <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl" style={{ background: p.toneSoft }}>
              <cardSheet.Icon size={17} style={{ color: p.tone }} strokeWidth={2.4} />
            </span>
            <div>
              <h3 className="text-[17px] font-extrabold leading-tight tracking-tight text-slate-900">{cardSheet.label}</h3>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: p.toneText }}>{p.name}</p>
            </div>
          </div>
          {cardSheet.geoText ? (
            <div className="mt-4">
              <p className="whitespace-pre-line text-[13px] font-medium leading-relaxed text-slate-600">{cardSheet.geoText}</p>
            </div>
          ) : cardSheet.emptyCard ? (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center">
              <p className="text-[12.5px] font-medium leading-relaxed text-slate-500">No {String(cardSheet.label || "details").toLowerCase()} added for this project yet.</p>
            </div>
          ) : cardSheet.kind === "map" ? (
            <div className="mt-4">
              <MapCarousel slides={p.districtMaps} project={p} title={cardSheet.mapTitle} desc={cardSheet.mapDesc} />
            </div>
          ) : cardSheet.kind === "geology" ? (
            <div className="mt-3.5">
              <p className="text-[13px] font-medium leading-relaxed text-slate-600">{cardSheet.body}</p>
              <div className="mt-4 space-y-3 border-t border-slate-100 pt-3.5">
                {cardSheet.points.map((pt, i) => (
                  <div key={i}>
                    <p className="text-[10px] font-bold uppercase tracking-[0.13em]" style={{ color: p.toneText }}>{pt.k}</p>
                    <p className="mt-0.5 text-[12.5px] font-medium leading-snug text-slate-700">{pt.v}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : cardSheet.kind === "history" ? (
            <div className="mt-4">
              {cardSheet.timeline.map((t, i) => (
                <div key={i} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full" style={{ background: p.tone }} />
                    {i < cardSheet.timeline.length - 1 && <span className="w-px flex-1" style={{ background: "#e8edf3", minHeight: 18 }} />}
                  </div>
                  <div className={i < cardSheet.timeline.length - 1 ? "pb-3.5" : ""}>
                    <p className="text-[11px] font-bold tracking-tight" style={{ color: p.toneText }}>{t.era}</p>
                    <p className="mt-0.5 text-[12.5px] font-medium leading-snug text-slate-700">{t.v}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : cardSheet.kind === "drills" ? (
            cardSheet.empty ? (
              <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-1.5">
                  <Drill size={13} className="text-slate-400" strokeWidth={2.2} />
                  <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-400">Pre-Drilling</span>
                </div>
                <p className="mt-2 text-[12.5px] font-medium leading-relaxed text-slate-600">{cardSheet.emptyMsg}</p>
              </div>
            ) : (
              <div className="mt-4 space-y-2.5">
                {cardSheet.rows.map((r, i) => (
                  <div key={i} className="rounded-2xl border border-slate-100 bg-slate-50 p-3.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-[12.5px] font-bold tracking-tight text-slate-900">{r.hole}</p>
                      <p className="text-[13.5px] font-extrabold tracking-tight" style={{ color: p.toneText }}>{r.grade}</p>
                    </div>
                    <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Interval {r.interval}</p>
                    <p className="mt-2 flex gap-2 text-[11.5px] font-medium leading-snug text-slate-600">
                      <Sparkles size={12} className="mt-[2px] flex-shrink-0" style={{ color: p.tone }} strokeWidth={2.2} />
                      <span>{r.note}</span>
                    </p>
                  </div>
                ))}
              </div>
            )
          ) : cardSheet.kind === "infra" ? (
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              {cardSheet.infra.map((it, i) => (
                <div key={i} className="rounded-2xl border border-slate-100 bg-slate-50 p-3.5">
                  <span className="grid h-8 w-8 place-items-center rounded-xl" style={{ background: p.toneSoft }}><it.Icon size={15} style={{ color: p.tone }} strokeWidth={2.2} /></span>
                  <p className="mt-2 text-[8px] font-bold uppercase tracking-[0.12em] text-slate-400">{it.label}</p>
                  <p className="mt-0.5 text-[12.5px] font-bold leading-tight tracking-tight text-slate-900">{it.value}</p>
                </div>
              ))}
            </div>
          ) : cardSheet.kind === "nearby" ? (
            <div className="mt-4 space-y-2.5">
              {cardSheet.ops.map((o, i) => (
                <div key={i} className="flex gap-3 rounded-2xl border border-slate-100 bg-white p-3.5">
                  <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl text-[14px] font-extrabold" style={{ background: p.toneSoft, color: p.toneText }}>{o.name.charAt(0)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-[13px] font-bold tracking-tight text-slate-900">{o.name}</p>
                      <p className="flex-shrink-0 text-[10.5px] font-bold tracking-tight" style={{ color: p.toneText }}>{o.dist}</p>
                    </div>
                    <p className="text-[10.5px] font-semibold tracking-tight text-slate-400">{o.op} · {o.kind}</p>
                    <p className="mt-1 text-[11.5px] font-medium leading-snug text-slate-600">{o.note}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3.5 text-[13px] font-medium leading-relaxed text-slate-600">{cardSheet.body}</p>
          )}
        </BottomSheet>
      )}
    </div>
  );
}

/* ============================================================
   TEAM  —  Board & Management
   ============================================================ */
function teamInitials(name, t) {
  if (t) return t;
  return (name || "").split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}
function TeamAvatar({ photo, name, t, size = 64, className = "" }) {
  if (photo) return <img src={photo} alt={name} className={`rounded-full object-cover ${className}`} style={{ width: size, height: size, border: "1px solid #e2e8f0" }} />;
  return (
    <div className={`grid place-items-center rounded-full ${className}`} style={{ width: size, height: size, border: "1px solid #e2e8f0", background: "#f1f5f9", color: "#64748b", fontSize: Math.round(size * 0.34), fontWeight: 800, letterSpacing: "-.02em" }}>
      {teamInitials(name, t) || <Users size={Math.round(size * 0.42)} strokeWidth={2} />}
    </div>
  );
}
function TeamView({ onOpenCompany }) {
  const [open, setOpen] = useState(null);
  const [ceoFollow, setCeoFollow] = useState(false);
  const [profile, setProfile] = useState(false);
  const TEAM_MEMBERS = (useContext(ProfileContext)?.profile?.team) ?? [];
  if (!TEAM_MEMBERS.length) return (
    <div className="space-y-5 px-5 pt-2">
      <div><Kicker section="team" /><h2 className="-mt-0.5 text-xl font-bold tracking-tight text-slate-900">Board &amp; Management</h2></div>
      <SectionEmpty Icon={Users} title="No team members yet" sub="Board and management profiles will appear here as they're added." />
    </div>
  );
  const lead = TEAM_MEMBERS[0];
  const rest = TEAM_MEMBERS.slice(1);
  const active = open != null ? TEAM_MEMBERS[open] : null;
  return (
    <div className="space-y-5 px-5 pt-2">
      <div>
        <Kicker section="team" />
        <h2 className="-mt-0.5 text-xl font-bold tracking-tight text-slate-900">Board &amp; Management</h2>
      </div>

      {/* ===== MEMBERS — borderless list, bio opens centered modal ===== */}
      <div>
        {/* lead (CEO) — same row layout as the rest so everything aligns */}
        <button onClick={() => setOpen(0)} className="flex w-full items-start gap-3.5 border-t border-slate-100 pt-4 text-left transition active:opacity-70">
          <div className="relative flex-shrink-0">
            <TeamAvatar photo={lead.photo} name={lead.name} t={lead.t} size={64} />
            <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full bg-white">
              <BadgeCheck size={16} style={{ color: "#0ea5e9" }} fill="rgba(14,165,233,0.18)" />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-[14.5px] font-extrabold tracking-tight text-slate-900">{lead.name}</h4>
            <p className="text-[11px] font-semibold" style={{ color: THEME.team.t }}>{lead.role}</p>
            <p className="mt-1 text-[11.5px] font-medium leading-snug text-slate-500 line-clamp-2">{lead.short}</p>
          </div>
          <ChevronRight size={16} className="mt-1 flex-shrink-0 text-slate-300" />
        </button>

        {/* rest */}
        {rest.map((m, idx) => {
          const i = idx + 1;
          return (
            <button key={i} onClick={() => setOpen(i)} className="mt-3.5 flex w-full items-start gap-3.5 border-t border-slate-100 pt-3.5 text-left transition active:opacity-70">
              <TeamAvatar photo={m.photo} name={m.name} t={m.t} size={64} className="flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <h4 className="text-[14.5px] font-bold tracking-tight text-slate-900">{m.name}</h4>
                <p className="text-[11px] font-semibold" style={{ color: THEME.team.t }}>{m.role}</p>
                <p className="mt-1 text-[11.5px] font-medium leading-snug text-slate-500 line-clamp-2">{m.short}</p>
              </div>
              <ChevronRight size={16} className="mt-1 flex-shrink-0 text-slate-300" />
            </button>
          );
        })}
      </div>

      {/* ===== BIO CARD ===== */}
      {active && (
        <BottomSheet onClose={() => setOpen(null)}>
          <div className="flex items-start gap-3.5 pr-9">
            <div className="relative flex-shrink-0">
              {open === 0 ? (
                <button onClick={() => setProfile(true)} className="block transition active:scale-95" aria-label="Open profile">
                  <TeamAvatar photo={active.photo} name={active.name} t={active.t} size={64} />
                </button>
              ) : (
                <TeamAvatar photo={active.photo} name={active.name} t={active.t} size={64} />
              )}
              {open === 0 && (
                <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full bg-white">
                  <BadgeCheck size={17} style={{ color: "#0ea5e9" }} fill="rgba(14,165,233,0.18)" />
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h3 className="text-[16px] font-extrabold leading-tight tracking-tight text-slate-900">{active.name}</h3>
                {open === 0 && <BadgeCheck size={14} className="flex-shrink-0" style={{ color: "#0ea5e9" }} fill="rgba(14,165,233,0.15)" />}
              </div>
              <p className="text-[11px] font-bold" style={{ color: THEME.team.t }}>{active.role}</p>
              {open === 0 && (
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => setCeoFollow((f) => !f)}
                    className="flex h-8 flex-1 items-center justify-center gap-1 rounded-full border text-[11px] font-bold tracking-wide transition-all active:scale-[0.97]"
                    style={ceoFollow
                      ? { background: "rgba(16,185,129,0.08)", color: EM_TEXT, borderColor: "rgba(16,185,129,0.35)" }
                      : { background: "#ffffff", color: "#334155", borderColor: "#e2e8f0" }}
                    aria-pressed={ceoFollow}
                  >
                    {ceoFollow ? <Check size={12} strokeWidth={2.8} /> : <Plus size={12} strokeWidth={2.8} />}
                    {ceoFollow ? "Following" : "Follow"}
                  </button>
                  <button className="flex h-8 flex-1 items-center justify-center gap-1 rounded-full border border-slate-200 bg-white text-[11px] font-bold tracking-wide text-slate-700 transition-all active:scale-[0.97]">
                    <MessageSquare size={12} strokeWidth={2.6} /> Message
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="mt-4 space-y-2.5 border-t border-slate-100 pt-3.5">
            {(active.full || active.short || "").split("\n\n").filter(Boolean).map((para, j) => (
              <p key={j} className="text-[12.5px] leading-relaxed text-slate-600">{para}</p>
            ))}
            {active.linkedin && (
              <a href={active.linkedin} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[12px] font-bold pt-1" style={{ color: THEME.team.t }}>LinkedIn <ArrowUpRight size={13} /></a>
            )}
          </div>
        </BottomSheet>
      )}

      {/* ===== INSTAGRAM-STYLE PROFILE (CEO) ===== */}
      {profile && (
        <div className="absolute inset-0 z-[60] flex flex-col bg-white pp-fade">
          {/* top bar */}
          <div className="flex flex-shrink-0 items-center gap-3 border-b border-slate-100 px-3 py-3">
            <button onClick={() => setProfile(false)} className="grid h-8 w-8 place-items-center rounded-full text-slate-700 transition active:scale-90" aria-label="Back">
              <ChevronLeft size={20} />
            </button>
            <div className="flex items-center gap-1.5">
              <span className="text-[15px] font-extrabold tracking-tight text-slate-900">{lead.name}</span>
              <BadgeCheck size={15} style={{ color: "#0ea5e9" }} fill="rgba(14,165,233,0.15)" />
            </div>
          </div>

          <div className="pp-scroll flex-1 overflow-y-auto">
            {/* header */}
            <div className="px-5 pt-5">
              <div className="flex items-center gap-6">
                <TeamAvatar photo={lead.photo} name={lead.name} t={lead.t} size={80} className="flex-shrink-0" />
                <div className="flex flex-1 items-center justify-around text-center">
                  {[["0", "Posts"], ["0", "Followers"], ["0", "Following"]].map(([n, l]) => (
                    <div key={l}>
                      <p className="text-[16px] font-extrabold leading-none tracking-tight text-slate-900 tabular-nums">{n}</p>
                      <p className="mt-1 text-[11px] font-medium text-slate-500">{l}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-3">
                <p className="text-[14px] font-extrabold tracking-tight text-slate-900">{lead.name}</p>
                <p className="text-[12px] font-bold" style={{ color: THEME.team.t }}>{lead.role}</p>
                <p className="mt-1 text-[12px] font-medium leading-relaxed text-slate-500">{lead.short}</p>
                <a
                  href="https://www.companywebsite.com"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold tracking-tight transition active:scale-95"
                  style={{ color: "#0ea5e9" }}
                >
                  <ArrowUpRight size={12} /> companywebsite.com
                </a>
                {/* company affiliation — tap to open the company profile */}
                <button
                  onClick={() => onOpenCompany && onOpenCompany()}
                  className="mt-2.5 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-1.5 pr-2.5 transition active:scale-[0.97]"
                >
                  <span className="grid h-6 w-6 place-items-center overflow-hidden rounded-full bg-white" style={{ border: "1px solid #e2e8f0" }}>
                    <img src={AVATAR} alt="Company logo" className="h-full w-full object-cover" />
                  </span>
                  <span className="text-[11.5px] font-bold tracking-tight text-slate-900">{COMPANY.name}</span>
                  <BadgeCheck size={12} style={{ color: "#0ea5e9" }} fill="rgba(14,165,233,0.15)" />
                  <ChevronRight size={13} className="text-slate-400" />
                </button>
              </div>
              <div className="mt-3.5 flex gap-2">
                <button
                  onClick={() => setCeoFollow((f) => !f)}
                  className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border text-[12px] font-bold tracking-wide transition-all active:scale-[0.98]"
                  style={ceoFollow
                    ? { background: "rgba(16,185,129,0.08)", color: EM_TEXT, borderColor: "rgba(16,185,129,0.35)" }
                    : { background: "#0f172a", color: "#fff", borderColor: "#0f172a" }}
                  aria-pressed={ceoFollow}
                >
                  {ceoFollow ? <><Check size={13} strokeWidth={2.8} /> Following</> : <><Plus size={13} strokeWidth={2.8} /> Follow</>}
                </button>
                <button className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white text-[12px] font-bold tracking-wide text-slate-700 transition-all active:scale-[0.98]">
                  <MessageSquare size={13} strokeWidth={2.6} /> Message
                </button>
              </div>
            </div>

            {/* tab bar */}
            <div className="mt-5 flex justify-center border-t border-slate-100 py-2.5">
              <Grid3x3 size={20} className="text-slate-900" />
            </div>

            {/* empty state */}
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <div className="grid h-16 w-16 place-items-center rounded-full border-2 border-slate-900">
                <Camera size={28} className="text-slate-900" strokeWidth={1.6} />
              </div>
              <p className="mt-4 text-[20px] font-extrabold tracking-tight text-slate-900">No Posts Yet</p>
              <p className="mt-1 text-[12.5px] font-medium leading-relaxed text-slate-400">When {lead.name.split(" ")[0]} shares updates, they'll appear here.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   V4 — engagement, retention & platform expansion
   ============================================================ */
const WATCHING = [
  { t: "Fully Funded", Icon: ShieldCheck },
  { t: "Active Drill Program", Icon: Drill },
  { t: "High Grade", Icon: Gem },
  { t: "District Scale", Icon: Layers },
  { t: "Historic Producer", Icon: Pickaxe },
  { t: "Tight Share Structure", Icon: PieChart },
];

const WATCHLISTS = ["Silver Explorers", "Actively Drilling", "Mexico Projects", "Fully Funded", "High Conviction"];

const COMPARE_ROWS = [];

/* ---- Watchlist bottom sheet ---- */
function WatchlistSheet({ saved, setSaved, onClose }) { return null; }

/* ---- Comparison overlay ---- */
function CompareSheet({ onClose }) { return null; }

/* ---- Conference Mode — QR-scan conversion screen ---- */
function ConferenceMode({ following, setFollowing, saved, openWatchlist, onViewCatalysts, onViewTimeline, openBrief, onClose }) { return null; }

/* ============================================================
   60-SECOND BRIEF (bottom sheet)
   ============================================================ */
function BriefOverlay({ onClose }) {
  const b = (useContext(ProfileContext)?.profile?.companyBrief) || {};
  const kp = Array.isArray(b.keyPoints) ? b.keyPoints.filter(Boolean) : [];
  return (
    <BottomSheet onClose={onClose}>
      {(close) => (
        <>
          <div className="flex items-center gap-1.5 border-b border-slate-200 pb-3">
            <Zap size={12} style={{ color: EM_TEXT }} />
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: EM_TEXT }}>The 60-Second Brief</span>
          </div>
          <div className="mt-5 space-y-4">
            {b.headline && <p className="text-[15px] font-extrabold tracking-tight text-slate-900">{b.headline}</p>}
            {b.shortSummary && <p className="text-xs leading-relaxed font-semibold text-slate-700">{b.shortSummary}</p>}
            {b.businessDescription && <p className="text-xs leading-relaxed font-medium text-slate-600">{b.businessDescription}</p>}
            {kp.length > 0 && (
              <ul className="space-y-1.5">
                {kp.map((p, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full" style={{ background: EM_TEXT }} />
                    <span className="text-xs leading-relaxed font-medium text-slate-600">{p}</span>
                  </li>
                ))}
              </ul>
            )}
            {!b.headline && !b.shortSummary && !b.businessDescription && kp.length === 0 && (
              <p className="text-xs leading-relaxed font-medium text-slate-400">No company brief has been added yet.</p>
            )}
          </div>
          <button onClick={close} className="mt-6 flex h-11 w-full items-center justify-center rounded-xl text-xs uppercase tracking-wider font-bold text-white transition active:scale-95" style={DARK_CTA}>Got It</button>
        </>
      )}
    </BottomSheet>
  );
}

/* ============================================================
   INVESTOR-OS SCREENS (Discover · Following · Scan · Feed · Profile)
   ============================================================ */

// Company directory. the company is the live profile; the rest seed search.
const DIRECTORY = [];

function CoLogo({ co, size = 44 }) {
  if (co.logo) {
    return (
      <div className="flex-shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white" style={{ height: size, width: size }}>
        <img src={co.logo} alt="" className={`h-full w-full ${co.photo ? "object-cover" : "object-contain"}`} />
      </div>
    );
  }
  return (
    <div className="grid flex-shrink-0 place-items-center rounded-xl text-[13px] font-extrabold text-white" style={{ height: size, width: size, background: co.c || "#64748b" }}>
      {co.mono}
    </div>
  );
}

// A single tappable company row used in Discover & Following.
function CompanyRow({ co, onOpen }) {
  return (
    <button
      onClick={() => { haptic(); co.live ? onOpen() : null; }}
      className="flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 text-left transition active:scale-[0.99]"
      style={{ boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 12px 26px -20px rgba(15,23,42,0.4)" }}
    >
      <CoLogo co={co} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[14px] font-bold tracking-tight text-slate-900">{co.name}</span>
          {co.live && <BadgeCheck size={13} style={{ color: EM }} className="flex-shrink-0" />}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-tight text-slate-400">
          <span>{co.ticker}</span><span className="text-slate-300">·</span><span className="truncate">{co.commodity}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-1 text-[10.5px] font-medium text-slate-400">
          <MapPin size={10} className="flex-shrink-0" /><span className="truncate">{co.region}</span>
        </div>
      </div>
      <div className="flex flex-shrink-0 flex-col items-end">
        <span className="text-[13px] font-bold tabular-nums tracking-tight text-slate-900">{co.price}</span>
        <span className="text-[11px] font-bold tabular-nums tracking-tight" style={{ color: co.up ? EM_TEXT : "#dc2626" }}>{co.chg}</span>
      </div>
      <ChevronRight size={16} className="ml-0.5 flex-shrink-0 text-slate-300" />
    </button>
  );
}

// Consistent screen header (large title + optional eyebrow / trailing slot).
function ScreenHead({ eyebrow, title, trailing, onScan, accent = EM_TEXT }) {
  return (
    <div className="flex items-end justify-between px-5 pb-3 pt-3">
      <div>
        {eyebrow && <p className="text-[10px] font-extrabold uppercase tracking-[0.2em]" style={{ color: accent }}>{eyebrow}</p>}
        <h1 className="text-[26px] font-extrabold leading-none tracking-tight text-slate-900">{title}</h1>
      </div>
      <div className="flex items-center gap-2">
        {trailing}
        {onScan && (
          <button
            onClick={() => { haptic(); onScan(); }}
            aria-label="Scan QR code"
            className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-slate-800 transition active:scale-90"
            style={{ boxShadow: "0 1px 2px rgba(15,23,42,0.06)" }}
          >
            <Focus size={18} strokeWidth={2.2} />
          </button>
        )}
      </div>
    </div>
  );
}

// Featured sell-side / independent analysts covering the junior space.
const ANALYSTS = [
  { id: "an1", name: "Maria Velez", firm: "Cordia Capital", focus: "Silver & Gold", covers: 14, mono: "MV", c: "#0d9488", rating: "Sector Outperform", coversKng: true,
    tags: ["maria", "velez", "cordia", "silver", "gold"] },
  { id: "an2", name: "David Chen", firm: "Northcrest Securities", focus: "Precious Metals", covers: 22, mono: "DC", c: "#2563eb", rating: "Buy",
    tags: ["david", "chen", "northcrest", "precious", "metals"] },
  { id: "an3", name: "Sarah Okafor", firm: "Meridian Research", focus: "Base & Battery Metals", covers: 18, mono: "SO", c: "#c2410c", rating: "Accumulate",
    tags: ["sarah", "okafor", "meridian", "copper", "lithium", "battery"] },
  { id: "an4", name: "Tom Bradshaw", firm: "Granite Equity", focus: "Junior Explorers", covers: 31, mono: "TB", c: "#7c3aed", rating: "Speculative Buy", coversKng: true,
    tags: ["tom", "bradshaw", "granite", "junior", "explorers"] },
];

function AnalystRow({ a, onOpenCompany }) {
  return (
    <div className="flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3" style={{ boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 12px 26px -20px rgba(15,23,42,0.4)" }}>
      <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-full text-[13px] font-extrabold text-white" style={{ background: a.c }}>{a.mono}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-bold tracking-tight text-slate-900">{a.name}</p>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-tight text-slate-400">
          <span className="truncate">{a.firm}</span><span className="text-slate-300">·</span><span className="truncate">{a.focus}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="rounded-md px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-slate-500" style={{ background: "#f1f5f9" }}>{a.covers} covered</span>
          <span className="rounded-md px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider" style={{ background: "rgba(15,23,42,0.06)", color: "#0f172a" }}>{a.rating}</span>
          {a.coversKng && (
            <button onClick={() => { haptic(); onOpenCompany(); }} className="rounded-md px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider transition active:scale-95" style={{ background: "rgba(16,185,129,0.12)", color: EM_TEXT }}>
              Coverage
            </button>
          )}
        </div>
      </div>
      <button className="flex-shrink-0 rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-600 transition active:scale-95">Follow</button>
    </div>
  );
}

/* ---------- DISCOVER ---------- */
function DiscoverScreen({ onOpenCompany, onScan }) {
  const [mode, setMode] = useState("juniors"); // juniors | analysts
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const isJ = mode === "juniors";

  const companies = query
    ? DIRECTORY.filter((c) => c.name.toLowerCase().includes(query) || c.ticker.toLowerCase().includes(query) || c.tags.some((t) => t.includes(query)))
    : DIRECTORY;
  const analysts = query
    ? ANALYSTS.filter((a) => a.name.toLowerCase().includes(query) || a.firm.toLowerCase().includes(query) || a.tags.some((t) => t.includes(query)))
    : ANALYSTS;
  const count = isJ ? companies.length : analysts.length;

  const goJuniors = (val) => { haptic(); setMode("juniors"); setQ(val); };
  const goAnalysts = () => { haptic(); setMode("analysts"); setQ(""); };

  const chip = (label, active, onClick, extra) => (
    <button key={label} onClick={onClick}
      className="flex-shrink-0 rounded-full border px-3 py-1.5 text-[11.5px] font-bold tracking-tight transition active:scale-95"
      style={active ? { background: "#0f172a", borderColor: "#0f172a", color: "#fff" } : { background: "#fff", borderColor: "#e2e8f0", color: "#475569" }}>
      {extra}{label}
    </button>
  );

  return (
    <div className="flex h-full flex-col">
      <ScreenHead eyebrow="Explore" title="Discover" onScan={onScan} />
      <div className="px-5 pb-2">
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
          <Search size={17} className="flex-shrink-0 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={isJ ? "Search companies, tickers, commodities" : "Search analysts, firms, coverage"}
            className="w-full bg-transparent text-[14px] font-medium tracking-tight text-slate-900 outline-none placeholder:text-slate-400"
          />
          {q && <button onClick={() => setQ("")} className="flex-shrink-0 text-slate-400"><X size={16} /></button>}
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 pp-scroll">
          {chip("Trending", isJ && !query, () => goJuniors(""), <Flame size={11} className="mr-1 inline -translate-y-px" style={{ color: isJ && !query ? "#fb923c" : "#ea580c" }} />)}
          {chip("Silver", isJ && query === "silver", () => goJuniors("silver"))}
          {chip("Gold", isJ && query === "gold", () => goJuniors("gold"))}
          {chip("Analysts", !isJ, goAnalysts, <Users size={11} className="mr-1 inline -translate-y-px" style={{ color: !isJ ? "#fff" : "#64748b" }} />)}
          {chip("Copper", isJ && query === "copper", () => goJuniors("copper"))}
          {chip("Drilling Now", false, () => goJuniors(""))}
        </div>
      </div>

      <div className="pp-scroll flex-1 space-y-2.5 overflow-y-auto px-5 pb-28 pt-1">
        <p className="px-1 pb-1 pt-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">
          {query ? `${count} result${count === 1 ? "" : "s"}` : (isJ ? "Featured Juniors" : "Featured Analysts")}
        </p>
        {isJ
          ? companies.map((c) => <CompanyRow key={c.id} co={c} onOpen={onOpenCompany} />)
          : analysts.map((a) => <AnalystRow key={a.id} a={a} onOpenCompany={onOpenCompany} />)}
        {count === 0 && (
          <div className="grid place-items-center rounded-2xl border border-dashed border-slate-200 py-12 text-center">
            {isJ ? <Compass size={26} className="text-slate-300" /> : <Users size={26} className="text-slate-300" />}
            <p className="mt-2 text-[13px] font-semibold text-slate-400">No {isJ ? "companies" : "analysts"} match “{q}”.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- FOLLOWING ---------- */
function FollowingScreen({ followed, onOpenCompany, onScan }) {
  const [seg, setSeg] = useState("companies");
  const SEGS = [{ id: "companies", label: "Companies" }, { id: "watchlist", label: "Watchlist" }, { id: "catalysts", label: "Catalysts" }];
  const companies = DIRECTORY.filter((c) => followed.includes(c.id));
  return (
    <div className="flex h-full flex-col">
      <ScreenHead eyebrow="Your Portfolio" title="Following" onScan={onScan} trailing={
        <span className="mb-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold tabular-nums text-slate-500">{companies.length} tracked</span>
      } />
      <div className="px-5 pb-2">
        <div className="flex gap-1 rounded-2xl bg-slate-100 p-1">
          {SEGS.map((s) => {
            const on = seg === s.id;
            return (
              <button key={s.id} onClick={() => { haptic(); setSeg(s.id); }}
                className="flex-1 rounded-xl py-2 text-[12px] font-bold tracking-tight transition"
                style={on ? { background: "#fff", color: "#0f172a", boxShadow: "0 1px 3px rgba(15,23,42,0.12)" } : { color: "#64748b" }}>
                {s.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="pp-scroll flex-1 space-y-2.5 overflow-y-auto px-5 pb-28 pt-2">
        {seg === "companies" && (companies.length ? companies.map((c) => <CompanyRow key={c.id} co={c} onOpen={onOpenCompany} />) : (
          <div className="grid place-items-center rounded-2xl border border-dashed border-slate-200 py-12 text-center">
            <Bookmark size={24} className="text-slate-300" /><p className="mt-2 text-[13px] font-semibold text-slate-400">No companies followed yet.</p>
          </div>
        ))}
        {seg === "watchlist" && (
          <div className="grid place-items-center rounded-2xl border border-dashed border-slate-200 py-12 text-center">
            <Eye size={24} className="text-slate-300" /><p className="mt-2 text-[13px] font-semibold text-slate-400">Your saved searches & price alerts live here.</p>
          </div>
        )}
        {seg === "catalysts" && (
          <button onClick={() => { haptic(); onOpenCompany(); }} className="flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition active:scale-[0.99]"
            style={{ border: "1.5px dashed #93b4f6", background: "rgba(37,99,235,0.05)" }}>
            <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl" style={{ background: "#2563eb" }}><Clock size={18} className="text-white" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold tracking-tight" style={{ color: "#1d4ed8" }}>Company Name — assays pending</p>
              <p className="mt-0.5 text-[11px] font-medium text-slate-500">Next drill results expected this quarter</p>
            </div>
            <ChevronRight size={16} className="flex-shrink-0 text-slate-300" />
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- SCAN ---------- */
function ScanScreen() {
  return (
    <div className="flex h-full flex-col">
      <ScreenHead eyebrow="Conference Mode" title="Scan" />
      <div className="flex flex-1 flex-col items-center justify-center px-8 pb-28">
        <div className="relative grid place-items-center" style={{ width: 230, height: 230 }}>
          <div className="absolute inset-0 rounded-[32px]" style={{ background: "linear-gradient(160deg, rgba(15,23,42,0.06), rgba(15,23,42,0.02))" }} />
          {[
            "left-0 top-0 border-l-[3px] border-t-[3px] rounded-tl-[28px]",
            "right-0 top-0 border-r-[3px] border-t-[3px] rounded-tr-[28px]",
            "left-0 bottom-0 border-l-[3px] border-b-[3px] rounded-bl-[28px]",
            "right-0 bottom-0 border-r-[3px] border-b-[3px] rounded-br-[28px]",
          ].map((p) => <span key={p} className={"absolute h-12 w-12 " + p} style={{ borderColor: "#0f172a" }} />)}
          <div className="grid h-16 w-16 place-items-center rounded-2xl" style={{ background: "linear-gradient(155deg,#334155,#0f172a)", boxShadow: "0 12px 30px -8px rgba(15,23,42,0.5)" }}>
            <Scan size={30} className="text-white" strokeWidth={2.1} />
          </div>
        </div>
        <p className="mt-8 text-center text-[15px] font-bold tracking-tight text-slate-900">Point at a company QR code</p>
        <p className="mt-1.5 max-w-[260px] text-center text-[12.5px] font-medium leading-relaxed text-slate-500">
          Instantly pull up a Passport profile, follow a company, and capture booth conversations.
        </p>
        <button className="mt-6 flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-bold text-white transition active:scale-95" style={{ background: "#0f172a" }}>
          <Camera size={15} /> Enable Camera
        </button>
      </div>
    </div>
  );
}

/* ---------- FEED ---------- */
function FeedScreen({ onOpenCompany, onScan }) {
  const ITEMS = [
    { co: "Company Name", t: "Drilling underway at Project 1", tag: "Catalyst", tc: "#2563eb", tb: "rgba(37,99,235,0.1)", Icon: Drill, when: "2h", live: true },
    { co: "Company Name", t: "Closes C$4.15M private placement", tag: "Financing", tc: "#7c3aed", tb: "rgba(124,58,237,0.1)", Icon: Wallet, when: "1d", live: true },
    { co: "Aurum Peak Gold", t: "Intersects 4.2 g/t Au over 18m", tag: "Results", tc: "#ca8a04", tb: "rgba(202,138,4,0.12)", Icon: Sparkles, when: "2d" },
    { co: "Company Name", t: "Project 2 100% option granted", tag: "Acquisition", tc: "#c2410c", tb: "rgba(194,65,12,0.1)", Icon: Landmark, when: "4d", live: true },
    { co: "Cordillera Copper", t: "Adds 1,200 ha to flagship project", tag: "Land", tc: "#0d9488", tb: "rgba(13,148,136,0.1)", Icon: Layers, when: "5d" },
  ];
  return (
    <div className="flex h-full flex-col">
      <ScreenHead eyebrow="What's Moving" title="Feed" onScan={onScan} />
      <div className="pp-scroll flex-1 space-y-2.5 overflow-y-auto px-5 pb-28 pt-1">
        {ITEMS.map((it, i) => (
          <button key={i} onClick={() => { haptic(); it.live ? onOpenCompany() : null; }}
            className="flex w-full items-start gap-3 rounded-2xl border border-slate-100 bg-white p-3.5 text-left transition active:scale-[0.99]"
            style={{ boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 12px 26px -20px rgba(15,23,42,0.4)" }}>
            <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl" style={{ background: it.tb }}><it.Icon size={16} style={{ color: it.tc }} /></span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="rounded-md px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wider" style={{ background: it.tb, color: it.tc }}>{it.tag}</span>
                <span className="text-[11px] font-bold tracking-tight text-slate-400">{it.co}</span>
                <span className="ml-auto text-[10.5px] font-semibold text-slate-300">{it.when}</span>
              </div>
              <p className="mt-1.5 text-[13.5px] font-bold leading-snug tracking-tight text-slate-900">{it.t}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- NEWS ---------- */
function NewsScreen({ onOpenCompany, onScan }) {
  const [cat, setCat] = useState("all");
  const CATS = [{ id: "all", label: "All" }, { id: "markets", label: "Markets" }, { id: "sector", label: "Sector" }, { id: "company", label: "My Companies" }];
  const FEATURED = { tag: "Markets", src: "Kitco News", when: "1h", title: "Silver breaks US$34/oz as industrial and investment demand converge", blurb: "Analysts point to tightening physical supply and resurgent safe-haven flows driving the metal to a multi-year high." };
  const STORIES = [
    { id: "n1", cat: "company", live: true, src: "Company Wire", when: "3h", tag: "Company", title: "Company Name expands Project 1 drill program" },
    { id: "n2", cat: "markets", src: "Bloomberg", when: "5h", tag: "Markets", title: "Gold holds near record as rate-cut bets firm up" },
    { id: "n3", cat: "sector", src: "The Northern Miner", when: "8h", tag: "Sector", title: "Mexico clarifies concession framework for junior explorers" },
    { id: "n4", cat: "company", live: true, src: "Company Wire", when: "1d", tag: "Company", title: "the company closes C$4.15M placement to fund 2026 exploration" },
    { id: "n5", cat: "sector", src: "Mining.com", when: "1d", tag: "Sector", title: "Silver juniors outperform as M&A speculation builds in the sector" },
    { id: "n6", cat: "markets", src: "Reuters", when: "2d", tag: "Markets", title: "Copper edges higher on China stimulus optimism" },
  ];
  const TAGC = { Markets: { c: "#0d9488", b: "rgba(13,148,136,0.1)" }, Sector: { c: "#7c3aed", b: "rgba(124,58,237,0.1)" }, Company: { c: "#2563eb", b: "rgba(37,99,235,0.1)" } };
  const list = cat === "all" ? STORIES : STORIES.filter((s) => s.cat === cat);
  return (
    <div className="flex h-full flex-col">
      <ScreenHead eyebrow="Market Wire" title="News" onScan={onScan} />
      <div className="px-5 pb-2">
        <div className="flex gap-2 overflow-x-auto pb-1 pp-scroll">
          {CATS.map((c) => {
            const on = cat === c.id;
            return (
              <button key={c.id} onClick={() => { haptic(); setCat(c.id); }}
                className="flex-shrink-0 rounded-full border px-3 py-1.5 text-[11.5px] font-bold tracking-tight transition active:scale-95"
                style={on ? { background: "#0f172a", borderColor: "#0f172a", color: "#fff" } : { background: "#fff", borderColor: "#e2e8f0", color: "#475569" }}>
                {c.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="pp-scroll flex-1 space-y-2.5 overflow-y-auto px-5 pb-28 pt-1">
        {(cat === "all" || cat === "markets") && (
          <button className="w-full overflow-hidden rounded-3xl border border-slate-100 bg-white text-left transition active:scale-[0.99]" style={{ boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 16px 30px -22px rgba(15,23,42,0.5)" }}>
            <div className="relative h-28 w-full" style={{ background: "linear-gradient(135deg,#0f172a,#334155)" }}>
              <Globe size={120} strokeWidth={1} className="absolute -right-5 -top-5 text-white/10" />
              <span className="absolute left-4 top-4 rounded-md px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-white" style={{ background: "rgba(255,255,255,0.18)" }}>{FEATURED.tag}</span>
            </div>
            <div className="p-4">
              <p className="text-[15px] font-extrabold leading-snug tracking-tight text-slate-900">{FEATURED.title}</p>
              <p className="mt-1.5 text-[12px] font-medium leading-relaxed text-slate-500">{FEATURED.blurb}</p>
              <div className="mt-2.5 flex items-center gap-1.5 text-[11px] font-bold tracking-tight text-slate-400">
                <span>{FEATURED.src}</span><span className="text-slate-300">·</span><span>{FEATURED.when} ago</span>
              </div>
            </div>
          </button>
        )}
        <p className="px-1 pb-1 pt-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">Latest</p>
        {list.map((s) => {
          const t = TAGC[s.tag] || TAGC.Markets;
          return (
            <button key={s.id} onClick={() => { haptic(); s.live ? onOpenCompany() : null; }}
              className="flex w-full items-start gap-3 rounded-2xl border border-slate-100 bg-white p-3.5 text-left transition active:scale-[0.99]"
              style={{ boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 12px 26px -20px rgba(15,23,42,0.4)" }}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="rounded-md px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wider" style={{ background: t.b, color: t.c }}>{s.tag}</span>
                  <span className="truncate text-[11px] font-bold tracking-tight text-slate-400">{s.src}</span>
                  <span className="ml-auto flex-shrink-0 text-[10.5px] font-semibold text-slate-300">{s.when}</span>
                </div>
                <p className="mt-1.5 text-[13.5px] font-bold leading-snug tracking-tight text-slate-900">{s.title}</p>
              </div>
              {s.live && <BadgeCheck size={14} style={{ color: EM }} className="mt-0.5 flex-shrink-0" />}
            </button>
          );
        })}
        {list.length === 0 && (
          <div className="grid place-items-center rounded-2xl border border-dashed border-slate-200 py-12 text-center">
            <Newspaper size={24} className="text-slate-300" /><p className="mt-2 text-[13px] font-semibold text-slate-400">No stories in this category yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- PROFILE ---------- */
function ProfileScreen({ onScan }) {
  const ROWS = [
    [{ Icon: Bell, label: "Notifications", hint: "Catalyst & price alerts" }, { Icon: Eye, label: "Watchlist & Alerts" }],
    [{ Icon: Wallet, label: "Holdings" }, { Icon: Bookmark, label: "Saved Searches" }],
    [{ Icon: Settings, label: "Settings" }, { Icon: Info, label: "About Passport" }],
  ];
  return (
    <div className="flex h-full flex-col">
      <ScreenHead eyebrow="Account" title="Profile" onScan={onScan} />
      <div className="pp-scroll flex-1 overflow-y-auto px-5 pb-28 pt-1">
        <div className="flex items-center gap-3.5 rounded-2xl border border-slate-100 bg-white p-4" style={{ boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 12px 26px -20px rgba(15,23,42,0.4)" }}>
          <div className="grid h-14 w-14 place-items-center rounded-full text-[18px] font-extrabold text-white" style={{ background: "linear-gradient(158deg,#0f172a,#334155)" }}>JJ</div>
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-extrabold tracking-tight text-slate-900">Retail Investor</p>
            <p className="mt-0.5 text-[12px] font-semibold text-slate-400">Passport member · Junior mining</p>
          </div>
          <button className="rounded-full border border-slate-200 px-3 py-1.5 text-[11.5px] font-bold text-slate-600 transition active:scale-95">Edit</button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[{ v: "1", l: "Following" }, { v: "3", l: "Alerts" }, { v: "12", l: "Catalysts" }].map((s) => (
            <div key={s.l} className="rounded-2xl border border-slate-100 bg-white py-3 text-center" style={{ boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}>
              <p className="text-[19px] font-extrabold tabular-nums tracking-tight text-slate-900">{s.v}</p>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">{s.l}</p>
            </div>
          ))}
        </div>
        {ROWS.map((group, gi) => (
          <div key={gi} className="mt-3 overflow-hidden rounded-2xl border border-slate-100 bg-white" style={{ boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}>
            {group.map((r, ri) => (
              <button key={r.label} className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition active:bg-slate-50"
                style={ri > 0 ? { borderTop: "1px solid #f1f5f9" } : {}}>
                <r.Icon size={18} className="flex-shrink-0 text-slate-500" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-bold tracking-tight text-slate-800">{r.label}</p>
                  {r.hint && <p className="text-[11px] font-medium text-slate-400">{r.hint}</p>}
                </div>
                <ChevronRight size={16} className="flex-shrink-0 text-slate-300" />
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   COMPANY PROFILE — the full the company experience (detail screen)
   ============================================================ */
function CompanyProfile({ onBack, onScan }) {
  const [tab, setTab] = useState("overview");
  const [brief, setBrief] = useState(false);
  const [following, setFollowing] = useState(true);
  const [bookmarked, setBookmarked] = useState(false);
  const [saved, setSaved] = useState([]);
  const [overlay, setOverlay] = useState(null);

  return (
    <div className="flex h-full flex-col pp-fade" style={{ background: "#ffffff" }}>
      <div className="flex-shrink-0" style={{ background: "linear-gradient(180deg, #F1F6FD 0%, #F8FBFE 55%, #FFFFFF 100%)" }}>
        <div className="flex items-center gap-1 px-2 pt-1">
          <button onClick={() => { haptic(); onBack(); }} aria-label="Back" className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full text-slate-600 transition active:scale-90 active:bg-slate-100">
            <ChevronLeft size={22} />
          </button>
          <span className="text-[12px] font-bold uppercase tracking-widest text-slate-400">Company Profile</span>
          {onScan && (
            <button onClick={() => { haptic(); onScan(); }} aria-label="Scan QR code"
              className="ml-auto mr-1 grid h-10 w-10 flex-shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-slate-800 transition active:scale-90"
              style={{ boxShadow: "0 1px 2px rgba(15,23,42,0.06)" }}>
              <Focus size={18} strokeWidth={2.2} />
            </button>
          )}
        </div>
        {tab === "overview"
          ? <ProfileHeader tab={tab} setTab={setTab} following={following} setFollowing={setFollowing} />
          : <PageBar tab={tab} setTab={setTab} following={following} setFollowing={setFollowing} />}
      </div>
      <div key={tab} className="pp-scroll flex-1 overflow-y-auto pb-24" style={{ overscrollBehaviorY: "contain", WebkitOverflowScrolling: "touch" }}>
        <div className={"pp-view " + (tab === "timeline" ? "" : "min-h-full")}>
          {tab === "projects" && <ProjectsView />}
          {tab === "timeline" && <TimelineView />}
          {tab === "capital" && <CapitalView />}
          {tab === "team" && <TeamView onOpenCompany={() => setTab("overview")} />}
          {tab === "media" && <MediaView />}
        </div>
      </div>
      {brief && <BriefOverlay onClose={() => setBrief(false)} />}
      {overlay === "watchlist" && <WatchlistSheet saved={saved} setSaved={setSaved} onClose={() => setOverlay(null)} />}
      {overlay === "compare" && <CompareSheet onClose={() => setOverlay(null)} />}
      {overlay === "conference" && (
        <ConferenceMode
          following={following}
          setFollowing={setFollowing}
          saved={saved}
          openWatchlist={() => setOverlay("watchlist")}
          onViewCatalysts={() => { setOverlay(null); setTab("timeline"); }}
          onViewTimeline={() => { setOverlay(null); setTab("timeline"); }}
          openBrief={() => { setOverlay(null); setBrief(true); }}
          onClose={() => setOverlay(null)}
        />
      )}
    </div>
  );
}

/* ============================================================
   DEVICE FRAME
   ============================================================ */
function App() { return null; }

/* ============================================================================
   ONBOARDING LAYER  — the authoring tool
   Left = the REAL app (real chrome + real CapitalView), blank by default and
   filled field-by-field from dropped documents. Tap any field → edit on the
   right (type / prompt AI / drop a doc) → approve → publish. Approval-gated.
   ============================================================================ */

const SNAP_FIELD = { "Cash": "cp-cash", "Working Capital": "cp-cash", "Basic Shares": "cp-basic", "Fully Diluted": "cp-fd", "Market Cap": "cp-mktcap" };

const OB_THEME = {
  overview: { key: "Overview", t: "#059669", c: "#10b981", soft: "#ecfdf5" },
  projects: { key: "Projects", t: "#b45309", c: "#d97706", soft: "#fffbeb" },
  timeline: { key: "Timeline", t: "#2563eb", c: "#2563eb", soft: "#eff6ff" },
  capital:  { key: "Capital",  t: "#7c3aed", c: "#7c3aed", soft: "#f5f3ff" },
  team:     { key: "Team",     t: "#1e3a8a", c: "#1e3a8a", soft: "#eef2ff" },
  media:    { key: "Media",    t: "#e11d48", c: "#e11d48", soft: "#fff1f2" },
};
const PROV = { "company-confirmed": "#10b981", "ai-extracted": "#7c3aed", "ai-derived": "#2563eb", "company-upload": "#64748b" };

function EmptyTabScaffold({ kicker, title, note, onClick, tone = "#94a3b8" }) {
  return (
    <div className="px-5 pt-4">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.18em]" style={{ color: tone }}>{kicker}</p>
      <h2 className="mt-0.5 text-[19px] font-extrabold tracking-tight text-slate-300">{title}</h2>
      <div onClick={onClick} className="mt-4 rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50/40 px-5 py-7" style={{ cursor: onClick ? "pointer" : "default" }}>
        <div className="h-5 w-2/3 rounded-md bg-slate-200/70" />
        <div className="mt-2.5 h-3 w-full rounded bg-slate-100" />
        <div className="mt-1.5 h-3 w-4/5 rounded bg-slate-100" />
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <div className="h-16 rounded-2xl border border-slate-100 bg-white" />
          <div className="h-16 rounded-2xl border border-slate-100 bg-white" />
        </div>
        <p className="mt-5 text-[11px] font-medium text-slate-400">{note}</p>
      </div>
    </div>
  );
}

function EmptyStatusCard({ onClick }) {
  return (
    <div onClick={onClick} className="rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50/40 px-5 py-6" style={{ cursor: onClick ? "pointer" : "default" }}>
      <div className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-slate-300 px-2.5 py-1">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
        <span className="font-extrabold uppercase text-slate-300" style={{ fontSize: 9, letterSpacing: "0.14em" }}>Capital Status</span>
      </div>
      <div className="mt-3.5 h-6 w-3/4 rounded-md bg-slate-200/70" />
      <div className="mt-2 h-3 w-full rounded bg-slate-100" />
      <div className="mt-1.5 h-3 w-2/3 rounded bg-slate-100" />
      <p className="mt-5 text-[10px] font-bold uppercase tracking-wider text-slate-300">Funding Runway</p>
      <div className="mt-3 h-2 w-full rounded-full bg-slate-100" />
      <p className="mt-4 text-[11px] font-medium text-slate-400">Tap to add funding status — or drop a document.</p>
    </div>
  );
}

const DASH = "\u2014";
const SKELETON_OV = { status: { state: DASH, detail: "", progressLabel: "Program Progress", latest: "", nextCatalyst: DASH, eta: DASH, impact: DASH, next: "", progressDone: 0, progressTotal: 1 }, quick: [{ label: DASH, sub: "" }, { label: DASH, sub: "" }, { label: DASH, sub: "" }, { label: DASH, sub: "" }], thesis: ["", "", "", "", ""], cases: [{ key: "bull", text: "", detail: "" }, { key: "bear", text: "", detail: "" }], nextCase: DASH };
const SKELETON_PROJECT = { tag: DASH, name: DASH, coord: "", commodities: "", intro: "", tone: "#94a3b8", toneSoft: "rgba(148,163,184,0.10)", stageIdx: 0, gallery: null, cards: [], stats: [{ Icon: MapPin, label: DASH, value: DASH }, { Icon: Coins, label: DASH, value: DASH }, { Icon: Target, label: DASH, value: DASH }] };
const SKELETON_PROJECTS_DATA = { lc: SKELETON_PROJECT, alm: SKELETON_PROJECT };
const SKELETON_PR_YEARS = [{ year: DASH, items: [{ id: "s1", d: DASH, key: false, label: "" }, { id: "s2", d: DASH, key: false, label: "" }, { id: "s3", d: DASH, key: false, label: "" }] }];
const SKELETON_TEAM_MEMBERS = [{ name: DASH, role: DASH, photo: "", t: "", short: "", full: "" }, { name: DASH, role: DASH, photo: "", t: "", short: "", full: "" }, { name: DASH, role: DASH, photo: "", t: "", short: "", full: "" }];
function blankCapitalVM(onField, stateOf) {
  return { COMPANY: { cash: DASH, workingCapital: DASH, marketCap: DASH, ev: DASH, debt: DASH }, CAP: { outstanding: DASH, fd: DASH, debt: DASH, rows: [{ sec: "Common Shares Outstanding", det: DASH, qty: DASH }, { sec: "Options", det: DASH, qty: DASH }, { sec: "Warrants", det: DASH, qty: DASH }] }, CAPSTATUS: {}, EXCHANGES: [{ ex: DASH, sym: DASH, price: DASH, cur: "", yahoo: "" }, { ex: DASH, sym: DASH, price: DASH, cur: "", yahoo: "" }, { ex: DASH, sym: DASH, price: DASH, cur: "", yahoo: "" }], OWNERSHIP: [["Institutional Ownership", DASH], ["Insider Ownership", DASH]], METRIC_DETAIL: {}, raises: [{ d: DASH, v: DASH, type: DASH, price: DASH, lead: DASH, purpose: DASH, status: DASH }], blank: true, onField, stateOf };
}
const BLANK_OV = { status: { state: "", detail: "", progressLabel: "", latest: "", nextCatalyst: "", eta: "", impact: "", next: "", progressDone: 0, progressTotal: 1 }, thesis: [], quick: [], cases: [], nextCase: null };
function overviewVM(fields) {
  const by = Object.fromEntries(fields.map((f) => [f.id, f]));
  const P = (id) => { const f = by[id]; return f && (f.state === "pending" || f.state === "approved") ? (f.data || {}) : null; };
  const st = P("ov-status"); const th = P("ov-thesis");
  const bf = by["ov-brief"]; const brief = bf && (bf.state === "pending" || bf.state === "approved") ? (bf.value || "") : "";
  return {
    status: (st && st.status) || SKELETON_OV.status,
    quick: (st && st.quick) || SKELETON_OV.quick,
    thesis: (th && th.thesis) || SKELETON_OV.thesis,
    cases: (th && th.cases) || SKELETON_OV.cases,
    nextCase: (th && th.nextCase) || SKELETON_OV.nextCase,
    brief,
  };
}

// Live fallback so the real CapitalView can render outside edit mode too.
const LIVE_VM = { COMPANY, CAP, CAPSTATUS, EXCHANGES, OWNERSHIP, METRIC_DETAIL, raises: [] };

// Map the approval-gated field list -> the shape CapitalView reads.
// Present = pending OR approved (so the preview fills as extraction lands);
// publishing is gated on `approved` separately.
function profileToVM(capFields, onField, stateOf) {
  const by = Object.fromEntries(capFields.map((f) => [f.id, f]));
  const present = (id) => { const f = by[id]; return f && (f.state === "pending" || f.state === "approved") ? (f.data || {}) : undefined; };
  const status = present("cp-status");
  const shares = present("cp-shares");
  const cash = present("cp-wc");
  const fin = present("cp-fin");
  const listings = present("cp-listings");
  const own = present("cp-insider");
  return {
    COMPANY: { name: "Company Name", cash: cash && cash.cash, workingCapital: cash && cash.cash, marketCap: undefined, ev: undefined, debt: "C$0" },
    CAP: { outstanding: (shares && shares.outstanding) || "", fd: (shares && shares.fd) || "", debt: "$0", rows: (shares && shares.rows) || [] },
    CAPSTATUS: status || {},
    EXCHANGES: (listings && listings.exchanges) || [],
    OWNERSHIP: (own && own.ownership) || [],
    METRIC_DETAIL: {},
    raises: (fin && fin.raises) || [],
    onField, stateOf,
  };
}

// ============================================================================
// PROFILE DATA ARCHITECTURE (Task 1)
// One `profile` object is the source the preview reads from. During this
// migration only Capital is wired to it; `fields` remains the editor's write
// target and is synced INTO `profile` (see Onboarding). `buildVM` derives the
// exact same VM shape CapitalView already consumes, so rendering is identical.
// ============================================================================
const ProfileContext = createContext(null);

// Flatten every field's approval state into an id -> state map.
function statusFromFields(fields) {
  const m = {};
  for (const arr of Object.values(fields)) for (const f of arr) m[f.id] = f.state;
  return m;
}
// The structured capital `data` per field id (gating happens later, via status).
function capitalDataFromFields(capFields) {
  const m = {};
  for (const f of (capFields || [])) m[f.id] = f.data || {};
  return m;
}

// buildVM(profile, status) -> the VM the preview needs. Capital half reads from
// `profile.capital`; mirrors profileToVM/blankCapitalVM exactly so output is
// byte-identical to the pre-migration path.
function buildVM(profile, status, onField, stateOf) {
  const co = (profile && profile.company) || {};
  const cap = (profile && profile.capital) || {};
  const listings = co.listings || [];
  const has = (v) => v != null && v !== "";
  // Temporary mocked quote: deterministic price + currency per exchange (real API later).
  const mockQuote = (l) => {
    const sym = (l.sym || "").toUpperCase();
    if (!sym) return { price: "", cur: "" };
    let h = 0; for (let i = 0; i < sym.length; i++) h = (h * 31 + sym.charCodeAt(i)) & 0xffff;
    const ex = (l.ex || "").toUpperCase();
    const sign = /OTC|NASDAQ|NYSE|US/.test(ex) ? "US$" : /FSE|XETRA|FRA|EUR/.test(ex) ? "€" : "C$";
    const val = (0.05 + (h % 250) / 100).toFixed(2);
    return { price: sign + val, cur: sign };
  };
  const rows = [];
  if (has(cap.outstanding)) rows.push({ sec: "Common Shares Outstanding", det: "", qty: cap.outstanding });
  if (has(cap.options)) rows.push({ sec: "Options", det: "", qty: cap.options });
  if (has(cap.warrants)) rows.push({ sec: "Warrants", det: "", qty: cap.warrants });
  // Capital status card — driven by editable fields on profile.capital (issue 28).
  const capCur = cap.progressCurrent === "" || cap.progressCurrent == null ? null : Number(cap.progressCurrent);
  const capTot = cap.progressTotal === "" || cap.progressTotal == null ? null : Number(cap.progressTotal);
  const capHasProgress = !!cap.progressEnabled && capCur != null && capTot != null && capTot > 0;
  const capPct = capHasProgress ? Math.max(0, Math.min(100, Math.round((capCur / capTot) * 100))) : 0;
  const CAPSTATUS = cap.headline ? {
    headline: cap.headline,
    summary: cap.subtext || "",
    state: cap.state || "Capital Status",
    showProgress: capHasProgress,
    runwayPct: capPct,
    runwayLeft: cap.progressLeft || "",
    runwayRight: cap.progressRight || "",
  } : {};
  return {
    COMPANY: { name: co.name || "Company Name", cash: cap.cash || "", workingCapital: cap.cash || "", marketCap: cap.marketCap || "", ev: "", debt: cap.debt || "" },
    CAP: { outstanding: cap.outstanding || "", fd: cap.fd || "", debt: cap.debt || "", rows },
    CAPSTATUS,
    EXCHANGES: listings.map((l) => { const q = mockQuote(l); return { ex: l.ex || "", sym: l.sym || "", price: q.price, cur: q.cur, yahoo: "" }; }),
    OWNERSHIP: has(cap.ownership) ? [["Insider Ownership", cap.ownership]] : [],
    METRIC_DETAIL: {},
    raises: has(cap.financing) ? [{ d: "", v: cap.financing, type: "", price: "", lead: "", purpose: "", status: "" }] : [],
    sharePrice: cap.sharePrice || "",
    onField, stateOf,
  };
}

// ---- Corrected the company fixture (structured per field). This is what a bulk
// extraction produces from the dropped documents; every value stages pending. ----
const KROWS = CAP.rows;
const SEED_CAPITAL = [];
// blank clone (schema kept, values removed) — the starting state before extraction
const blankOf = (f) => ({ ...f, value: "", data: undefined, state: "blank" });

const SEED_FIELDS = {
  overview: [
    { id: "co-name", label: "Company name", value: "", provenance: "manual", confidence: 0, source_doc: null, source_quote: null, state: "blank" },
    { id: "co-website", label: "Website", value: "", provenance: "manual", confidence: 0, source_doc: null, source_quote: null, state: "blank" },
    { id: "co-slogan", label: "Slogan", value: "", provenance: "manual", confidence: 0, source_doc: null, source_quote: null, state: "blank" },
    { id: "ov-status", label: "Status hero", value: "Drilling Underway · Assays Pending", provenance: "ai-derived", confidence: 0.85,
      source_doc: "A&R Offering Document p.4", source_quote: "13,000 meters anticipated February 2026 to September 2026", state: "pending",
      data: { status: { state: "Drilling Underway · Assays Pending", detail: "Phase 1 diamond drilling is active at the flagship project; assays are pending across the program.", progressLabel: "2026 Drill Program", latest: "Holes completed and assays submitted to the lab.", nextCatalyst: "Maiden assay batch", eta: "Expected Q2 2026", impact: "Grade & continuity confirmation", next: "Assay results", progressDone: 14, progressTotal: 26 },
        quick: [ { label: "Jurisdiction", sub: "Primary region" }, { label: "Silver · Gold", sub: "Ag · Au primary" }, { label: "Fully Funded", sub: "Through 2026" }, { label: "Q2 2026", sub: "Next catalyst" } ] } },
    { id: "ov-brief", label: "AI brief", value: "Plain-English summary of the opportunity, risks, catalysts and project potential.", provenance: "ai-derived", confidence: 0.6, source_doc: "All documents", source_quote: "", state: "pending" },
    { id: "ov-thesis", label: "Investment thesis", value: "Historic high-grade silver-gold district, drill-tested at depth · first hole high-grade intercepts · funded through 2026.", provenance: "ai-derived", confidence: 0.7,
      source_doc: "", source_quote: "", state: "blank",
      data: { thesis: [],
        cases: [],
        nextCase: "" } },
    { id: "ov-health", label: "Health · going concern", value: "Going-concern note present in latest audited financials", provenance: "company-confirmed", confidence: 1.0,
      source_doc: "Offering Document p.7", source_quote: "included a going-concern note", state: "pending" },
  ],
  projects: [
    { id: "pj-data", label: "Projects — Project 1 & Project 2", value: "", provenance: "ai-extracted", confidence: 0.95,
      source_doc: "", source_quote: "", state: "blank", data: { projects: true } },
  ],
  timeline: [
    { id: "tl-data", label: "Timeline — press releases", value: "55 press releases, 2023–2026 · 6 key milestones incl. C$13M bought deal close and high-grade intercepts discovery hole", provenance: "ai-extracted", confidence: 0.9,
      source_doc: "News releases 2023–2026", source_quote: "first assays from hole LC-25-008", state: "pending", data: { timeline: true } },
  ],
  capital: SEED_CAPITAL,
  team: [
    { id: "tm-roster", label: "Team — board & management", value: "Board and management team", provenance: "company-confirmed", confidence: 0.95,
      source_doc: "Information Circular p.6", source_quote: "directors and executive officers", state: "pending", data: { team: true } },
  ],
  media: [
    { id: "md-1", label: "Media", value: "", provenance: "company-upload", confidence: 0.0, source_doc: null, source_quote: null, state: "blank" },
  ],
};
const BLANK_FIELDS = Object.fromEntries(Object.entries(SEED_FIELDS).map(([k, arr]) => [k, arr.map(blankOf)]));

const fmt = (b) => (b < 1024 ? b + " B" : b < 1048576 ? (b / 1024).toFixed(0) + " KB" : (b / 1048576).toFixed(1) + " MB");
async function callModel(system, content) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, system, messages: [{ role: "user", content }] }),
  });
  const d = await res.json();
  return (d.content || []).map((b) => (b.type === "text" ? b.text : "")).join("").trim();
}
const parseJSON = (t) => { try { return JSON.parse(t.replace(/```json|```/g, "").trim()); } catch { return null; } };

/* ============================================================================
   COMPANY STATUS — AI AUTOFILL (Task 2)
   Scans uploaded documents and populates the single `profile.companyStatus`
   object from Task 1. Shape, card UI, and editor layout are unchanged; this
   only proposes values, which the user then reviews/edits in the existing
   right-side "Edit Company Status" panel before publishing.
   ============================================================================ */
const COMPANY_STATUS_EXTRACTION_SYSTEM = `You extract the "Company Status" fields for a junior mining company's investor profile from the uploaded documents. You are precise, factual, and never promotional.

SOURCE PRIORITY (highest first): 1) most recent news release, 2) MD&A, 3) investor presentation, 4) technical report, 5) company website content, 6) other uploaded notes. If sources conflict, use the newest reliable source. Judge recency from dates inside the documents and from the filenames provided.

ABSOLUTE RULES:
- Never invent information, numbers, or dates. Use only facts stated in the documents.
- Never infer or estimate exact dates or timing.
- Never use investment-advice or buy / sell / hold language.
- Never use promotional words (e.g. "undervalued", "moonshot", "explosive", "game-changing", "massive upside", "bullish", "huge", "skyrocket").
- Keep every field factual and educational.

FIELDS:
- statusHeadline: the company's current PRIMARY operational activity. 2-5 words, factual, present tense, non-promotional. Do NOT copy a press-release title. Examples: "26-Hole Drill Campaign", "Phase 2 Drilling", "Resource Expansion", "Permitting Underway", "Feasibility Study". If not determinable from the documents, "".
- statusHeadlineSubtext: ONE factual sentence explaining the current status. Max 25 words. Do not repeat the headline. Example: "Phase 1 diamond drilling is actively underway at Las Coloradas." If not determinable, "".
- latestUpdate: the NEWEST COMPLETED milestone. Max 15 words. No future events. Examples: "Three drill holes submitted to the lab.", "Closed C$13M financing.", "Mobilized second drill rig." If not determinable, "".
- nextCatalyst: the next meaningful FUTURE milestone. Choose ONE only. Examples: "Assay Results", "Phase 2 Drilling", "Resource Estimate", "Permit Approval", "Metallurgical Results". If none is found, "Not Disclosed".
- expected: the expected timing for nextCatalyst. Never estimate timing. Examples: "July 2026", "Q3 2026", "H2 2026", "7-9 Weeks". If not found, "Not Disclosed".
- investmentImpact: ONE plain-English, EDUCATIONAL sentence explaining why the nextCatalyst matters. Max 20 words. Not promotional, no price/return language. Good: "Tests whether mineralization continues beyond known zones.", "Defines the project's first mineral resource.", "Advances the project toward permitting." If not determinable, "".
- progressBar: enable ONLY if the documents contain measurable, countable progress (e.g. "14 of 26 holes completed", "1,200 of 2,500 metres drilled", "3 of 5 permits received"). If found: {"enabled":true,"label":"<short label>","current":<number>,"total":<number>,"unit":"<unit>"}. Never invent numbers. If no measurable progress is found: {"enabled":false,"label":"","current":null,"total":null,"unit":""}. Do NOT output a percentage — it is always computed from current / total.

OUTPUT: Return ONLY a single JSON object, no markdown fences, no commentary. It has two parts — the extracted "status" values and a per-field "review". Exact shape:
{"status":{"statusHeadline":"","statusHeadlineSubtext":"","latestUpdate":"","nextCatalyst":"","expected":"","investmentImpact":"","progressBar":{"enabled":false,"label":"","current":null,"total":null,"unit":""}},"review":{"statusHeadline":{"confidence":"high","reason":"","sourcesUsed":[],"howToImprove":""},"statusHeadlineSubtext":{"confidence":"high","reason":"","sourcesUsed":[],"howToImprove":""},"latestUpdate":{"confidence":"high","reason":"","sourcesUsed":[],"howToImprove":""},"nextCatalyst":{"confidence":"high","reason":"","sourcesUsed":[],"howToImprove":""},"expected":{"confidence":"high","reason":"","sourcesUsed":[],"howToImprove":""},"investmentImpact":{"confidence":"high","reason":"","sourcesUsed":[],"howToImprove":""},"progressBar":{"confidence":"high","reason":"","sourcesUsed":[],"howToImprove":""}}}

REVIEW — for EACH of the seven fields, judge your own confidence honestly:
- confidence "high": value explicitly stated, appears in multiple recent documents that agree, no interpretation required.
- confidence "medium": value in only one reliable source, minor interpretation required, document slightly outdated, or some details missing.
- confidence "low": no strong source, documents conflict, value inferred, source outdated, OR the field was filled with "Not Disclosed" / progress not found.
- reason: short and SPECIFIC, max 20 words. Not generic. Good: "Found in the latest news release and May investor presentation." / "Timing not found in uploaded documents." / "Conflicting catalyst timing between presentation and news release." Bad: "AI was unsure." / "Confidence is low."
- sourcesUsed: array of source strings, each "<Document type> — <Title if available> — <Date if available>" (e.g. "News Release — June 18, 2026", "Investor Presentation — May 2026", "MD&A — Q1 2026"). Empty array [] if no source supports the value.
- howToImprove: one specific, actionable step (e.g. "Upload the latest investor presentation.", "Upload the newest MD&A.", "Manually confirm the expected timing.", "Add a source document confirming drill progress.").`;

// Coerce a model response into the exact companyStatus shape. Never fabricates:
// empty in → empty out. nextCatalyst/expected fall back to "Not Disclosed" per spec.
// The progress bar is enabled only when current/total are real numbers with total > 0.
function normalizeCompanyStatus(raw) {
  if (!raw || typeof raw !== "object") return null;
  const s = (v) => (typeof v === "string" ? v.trim() : "");
  const numOrNull = (v) => {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    const n = parseFloat(String(v).replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : null;
  };
  const pbRaw = raw.progressBar && typeof raw.progressBar === "object" ? raw.progressBar : {};
  const current = numOrNull(pbRaw.current);
  const total = numOrNull(pbRaw.total);
  const measurable = current != null && total != null && total > 0;
  const enabled = !!pbRaw.enabled && measurable;
  const progressBar = enabled
    ? { enabled: true, label: s(pbRaw.label), current, total, unit: s(pbRaw.unit) }
    : { enabled: false, label: "", current: null, total: null, unit: "" };
  return {
    statusHeadline: s(raw.statusHeadline),
    statusHeadlineSubtext: s(raw.statusHeadlineSubtext),
    latestUpdate: s(raw.latestUpdate),
    nextCatalyst: s(raw.nextCatalyst) || "Not Disclosed",
    expected: s(raw.expected) || "Not Disclosed",
    investmentImpact: s(raw.investmentImpact),
    progressBar,
  };
}

const fileToBase64 = (file) => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(String(fr.result).split(",")[1]);
  fr.onerror = rej;
  fr.readAsDataURL(file);
});

// Build the multimodal message content: PDFs as document blocks, text/notes as
// text blocks, plus a filename manifest so the model can weigh source priority.
// `instruction` names the extraction task (defaults to Company Status) so the same
// uploaded documents can be reused for other extractions (e.g. the Company Brief).
async function buildStatusExtractionContent(files, pasteText, instruction) {
  const content = [];
  const names = [];
  for (const file of files || []) {
    if (!file) continue;
    names.push(file.name);
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
    if (isPdf) {
      try { content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: await fileToBase64(file) } }); } catch { /* skip unreadable */ }
    } else {
      try { const t = await file.text(); if (t && t.trim()) content.push({ type: "text", text: `Document "${file.name}":\n${t.slice(0, 12000)}` }); } catch { /* skip */ }
    }
  }
  if (pasteText && pasteText.trim()) content.push({ type: "text", text: `Pasted notes:\n${pasteText.slice(0, 12000)}` });
  if (!content.length) return null;
  const task = instruction || "extract the Company Status fields";
  const manifest = names.length ? `Uploaded files (use their dates and types to judge recency and source priority): ${names.join(", ")}.\n\n` : "";
  content.push({ type: "text", text: `${manifest}From the documents above, ${task}. Return ONLY the JSON object described in the system instructions.` });
  return content;
}

// Confidence display metadata (editor-only; never rendered on the card/profile).
const STATUS_REVIEW_KEYS = ["statusHeadline", "statusHeadlineSubtext", "latestUpdate", "nextCatalyst", "expected", "investmentImpact", "progressBar"];
const CONF_META = {
  high:   { label: "High",   c: "#0f9b73", bg: "rgba(16,185,129,0.10)", bd: "rgba(16,185,129,0.30)" },
  medium: { label: "Medium", c: "#b45309", bg: "rgba(245,158,11,0.12)", bd: "rgba(245,158,11,0.38)" },
  low:    { label: "Low",    c: "#be123c", bg: "rgba(244,63,94,0.10)",  bd: "rgba(244,63,94,0.32)" },
};

// Format one source into "Type — Title — Date". Accepts a pre-formatted string
// or an object {type,title,date}.
function formatReviewSource(src) {
  if (typeof src === "string") return src.trim();
  if (src && typeof src === "object") return [src.type, src.title, src.date].map((x) => (x == null ? "" : String(x).trim())).filter(Boolean).join(" — ");
  return "";
}

// Coerce the model's review into the exact companyStatusReview shape (all 7 keys).
// `status` is the normalized values, used to enforce low confidence on
// "Not Disclosed" / disabled progress. Never fabricates sources.
function normalizeCompanyStatusReview(rawReview, status) {
  const src = rawReview && typeof rawReview === "object" ? rawReview : {};
  const st = status || {};
  const out = {};
  for (const key of STATUS_REVIEW_KEYS) {
    const r = src[key] && typeof src[key] === "object" ? src[key] : {};
    let confidence = ["high", "medium", "low"].includes(r.confidence) ? r.confidence : "low";
    // Guardrails: fields the pipeline couldn't source are always low confidence.
    if (key === "nextCatalyst" && st.nextCatalyst === "Not Disclosed") confidence = "low";
    if (key === "expected" && st.expected === "Not Disclosed") confidence = "low";
    if (key === "progressBar" && !(st.progressBar && st.progressBar.enabled)) confidence = "low";
    const sourcesUsed = Array.isArray(r.sourcesUsed) ? r.sourcesUsed.map(formatReviewSource).filter(Boolean) : [];
    out[key] = {
      confidence,
      reason: typeof r.reason === "string" ? r.reason.trim() : "",
      sourcesUsed,
      howToImprove: typeof r.howToImprove === "string" ? r.howToImprove.trim() : "",
    };
  }
  return out;
}

// Full pipeline: build content → call model → parse → normalize. Returns
// { status, review } (both normalized), or null if nothing to read / parse failed.
async function extractCompanyStatus(files, pasteText) {
  const content = await buildStatusExtractionContent(files, pasteText);
  if (!content) return null;
  const raw = parseJSON(await callModel(COMPANY_STATUS_EXTRACTION_SYSTEM, content));
  if (!raw || typeof raw !== "object") return null;
  const status = normalizeCompanyStatus(raw.status);
  if (!status) return null;
  const review = normalizeCompanyStatusReview(raw.review, status);
  return { status, review };
}

/* ============================================================================
   COMPANY BRIEF — AI AUTOFILL (Task 5)
   Same architecture as Company Status: a single `profile.companyBrief` object,
   filled from the SAME uploaded documents (reusing buildStatusExtractionContent),
   with a per-field confidence review. The brief DESCRIBES THE COMPANY — never the
   investment case — and carries no buy/sell, price, or promotional language.
   ============================================================================ */
const BRIEF_REVIEW_KEYS = ["headline", "shortSummary", "businessDescription", "keyPoints"];
const COMPANY_BRIEF_EXTRACTION_SYSTEM = `You write a plain-language "Company Brief" for a junior mining company's investor profile, using ONLY the uploaded documents. The brief DESCRIBES THE COMPANY — what it is and what it does — it is NOT the investment case.

ABSOLUTE RULES:
- Never invent information. Use only facts stated in the documents.
- Describe the company; do NOT argue why to invest.
- No buy / sell / hold language. No price targets. No promotional claims. No "undervalued". No speculative upside or expected-return language. No hype words.
- Neutral and factual throughout.

FIELDS (in "brief"):
- headline: 3-7 words naming what the company is. Factual, non-promotional. Example: "Silver-Gold Explorer in Mexico". If not determinable, "".
- shortSummary: ONE sentence, max 25 words, describing the company. If not determinable, "".
- businessDescription: max 90 words describing the business factually — commodity, jurisdiction, projects, stage, strategy. If not determinable, "".
- keyPoints: up to 5 short, FACTUAL bullet points about the company (assets, jurisdiction, stage, funding, etc.). Each a plain statement of fact, not a selling point. Fewer than 5 is fine. [] if none.

REVIEW — for EACH field (headline, shortSummary, businessDescription, keyPoints), judge confidence honestly:
- "high": explicitly stated, appears in multiple recent documents that agree, no interpretation required.
- "medium": one reliable source, minor interpretation, slightly outdated, or some details missing.
- "low": no strong source, documents conflict, inferred, outdated, or the field was left empty.
- reason: short and SPECIFIC, max 20 words. Not generic.
- sourcesUsed: array of "<Document type> — <Title if available> — <Date if available>" strings; [] if none.
- howToImprove: one specific, actionable step.

OUTPUT: Return ONLY a single JSON object, no markdown fences, no commentary, exactly:
{"brief":{"headline":"","shortSummary":"","businessDescription":"","keyPoints":[]},"review":{"headline":{"confidence":"high","reason":"","sourcesUsed":[],"howToImprove":""},"shortSummary":{"confidence":"high","reason":"","sourcesUsed":[],"howToImprove":""},"businessDescription":{"confidence":"high","reason":"","sourcesUsed":[],"howToImprove":""},"keyPoints":{"confidence":"high","reason":"","sourcesUsed":[],"howToImprove":""}}}`;

// Coerce a model response into the exact companyBrief shape. Never fabricates.
// keyPoints capped at 5, factual strings only.
function normalizeCompanyBrief(raw) {
  if (!raw || typeof raw !== "object") return null;
  const s = (v) => (typeof v === "string" ? v.trim() : "");
  const keyPoints = Array.isArray(raw.keyPoints) ? raw.keyPoints.map(s).filter(Boolean).slice(0, 5) : [];
  return {
    headline: s(raw.headline),
    shortSummary: s(raw.shortSummary),
    businessDescription: s(raw.businessDescription),
    keyPoints,
  };
}

// Coerce the model's review into the exact companyBriefReview shape (4 keys).
// Empty fields are forced to low confidence. Never fabricates sources.
function normalizeCompanyBriefReview(rawReview, brief) {
  const src = rawReview && typeof rawReview === "object" ? rawReview : {};
  const b = brief || {};
  const out = {};
  for (const key of BRIEF_REVIEW_KEYS) {
    const r = src[key] && typeof src[key] === "object" ? src[key] : {};
    let confidence = ["high", "medium", "low"].includes(r.confidence) ? r.confidence : "low";
    const empty = key === "keyPoints" ? !(Array.isArray(b.keyPoints) && b.keyPoints.length) : !String(b[key] || "").trim();
    if (empty) confidence = "low";
    const sourcesUsed = Array.isArray(r.sourcesUsed) ? r.sourcesUsed.map(formatReviewSource).filter(Boolean) : [];
    out[key] = {
      confidence,
      reason: typeof r.reason === "string" ? r.reason.trim() : "",
      sourcesUsed,
      howToImprove: typeof r.howToImprove === "string" ? r.howToImprove.trim() : "",
    };
  }
  return out;
}

// Full pipeline: reuse the uploaded docs → call model → parse → normalize.
// Returns { brief, review } (both normalized) or null.
async function extractCompanyBrief(files, pasteText) {
  const content = await buildStatusExtractionContent(files, pasteText, "write the Company Brief (headline, short summary, business description, and up to 5 factual key points) that describes the company");
  if (!content) return null;
  const raw = parseJSON(await callModel(COMPANY_BRIEF_EXTRACTION_SYSTEM, content));
  if (!raw || typeof raw !== "object") return null;
  const brief = normalizeCompanyBrief(raw.brief);
  if (!brief) return null;
  const review = normalizeCompanyBriefReview(raw.review, brief);
  return { brief, review };
}

/* ---------- right-side field editor (ported from onboarding-v2) ---------- */
function Editor({ field, th, onUpdate }) {
  const [text, setText] = useState(field.value || "");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(null);
  const [proposal, setProposal] = useState(null);
  const [err, setErr] = useState(null);
  const [src, setSrc] = useState(false);
  const fileRef = useRef(null);

  const runPrompt = async () => {
    if (!prompt.trim()) return;
    setBusy("prompt"); setErr(null); setProposal(null);
    try {
      const out = await callModel(
        "You revise ONE field on a regulated mining investor profile. Return ONLY JSON {\"value\":\"...\"}. Facts only, no promotion, no invented figures, concise.",
        `Field: ${field.label}\nCurrent: ${field.value || "(blank)"}\nInstruction: ${prompt}`);
      const j = parseJSON(out) || { value: out };
      setProposal({ value: j.value, via: "prompt", provenance: "ai-derived" });
    } catch { setErr("Couldn't reach the model. Edit manually below."); }
    setBusy(null);
  };
  const runFile = async (file) => {
    setBusy("file"); setErr(null); setProposal(null);
    try {
      const system = `Extract the value for "${field.label}". Return ONLY JSON {"value":"...","source_quote":"<=15 words verbatim","confidence":0-1}. If absent, value null.`;
      let content;
      if (file.type === "application/pdf") {
        const b64 = await new Promise((r, j) => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(",")[1]); fr.onerror = j; fr.readAsDataURL(file); });
        content = [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }, { type: "text", text: `Extract: ${field.label}` }];
      } else { content = `Document:\n${(await file.text()).slice(0, 12000)}\n\nExtract: ${field.label}`; }
      const j = parseJSON(await callModel(system, content));
      if (j && j.value) setProposal({ value: j.value, source_quote: j.source_quote, source_doc: file.name, confidence: j.confidence ?? 0.7, via: "file", provenance: "ai-extracted" });
      else setErr("Couldn't find that field in the file.");
    } catch { setErr("Couldn't read that file. PDFs and .txt work best."); }
    setBusy(null);
  };
  const accept = () => {
    setText(proposal.value);
    onUpdate({ value: proposal.value, state: "pending", provenance: proposal.provenance,
      ...(proposal.source_quote ? { source_quote: proposal.source_quote, source_doc: proposal.source_doc, confidence: proposal.confidence } : {}) });
    setProposal(null); setPrompt("");
  };
  const eyebrow = { fontSize: 11, fontWeight: 800, letterSpacing: ".16em", textTransform: "uppercase", color: "#94a3b8", display: "flex", alignItems: "center", gap: 7, marginBottom: 9 };

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".16em", textTransform: "uppercase", color: th.t }}>{field.label}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: `${PROV[field.provenance]}18`, color: PROV[field.provenance] }}>{field.provenance}</span>
            {field.confidence > 0 && <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>confidence {Math.round(field.confidence * 100)}%</span>}
          </div>
        </div>
        {field.state === "approved" && <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, color: "#0f9b73" }}><Check size={14} strokeWidth={3} /> approved</span>}
      </div>

      {field.conflict && (
        <div style={{ marginTop: 14, borderRadius: 12, border: "1px solid #fcd9a6", background: "#fffbeb", padding: "11px 13px", fontSize: 12.5, color: "#b45309", display: "flex", gap: 9 }}>
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} /><span>{field.conflict}</span>
        </div>
      )}

      {field.source_quote && (
        <div style={{ marginTop: 14 }}>
          <button onClick={() => setSrc((v) => !v)} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", fontSize: 11.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, padding: 0 }}>
            <ChevronDown size={13} style={{ transform: src ? "none" : "rotate(-90deg)", transition: "transform .15s" }} /> SOURCE
          </button>
          {src && (
            <div style={{ marginTop: 8, borderLeft: `2px solid ${th.c}`, paddingLeft: 12 }}>
              <p style={{ fontSize: 13, fontStyle: "italic", color: "#334155", margin: 0, lineHeight: 1.5 }}>&ldquo;{field.source_quote}&rdquo;</p>
              <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 6, fontWeight: 600 }}>{field.source_doc}</p>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 22 }}>
        <label style={eyebrow}><Type size={12} /> edit text</label>
        <textarea value={text} onChange={(e) => setText(e.target.value)} style={{ width: "100%", minHeight: 84, resize: "vertical", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "12px 14px", color: "#0f172a", fontSize: 14, lineHeight: 1.5, boxSizing: "border-box", fontFamily: "inherit" }} />
        {text !== (field.value || "") && (
          <button onClick={() => onUpdate({ value: text, state: "pending", provenance: "company-confirmed" })} style={{ marginTop: 8, fontSize: 13, fontWeight: 700, padding: "8px 14px", borderRadius: 9, border: "none", background: th.c, color: "#fff", cursor: "pointer" }}>Save text</button>
        )}
      </div>

      <div style={{ marginTop: 22 }}>
        <label style={eyebrow}><Sparkles size={12} /> tell the assistant what to change</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runPrompt()} placeholder="e.g. tighten to one line, or add the closing date"
            style={{ flex: 1, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "11px 13px", color: "#0f172a", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit" }} />
          <button onClick={runPrompt} disabled={busy || !prompt.trim()} style={{ padding: "0 15px", borderRadius: 12, border: "none", background: busy === "prompt" ? "#e2e8f0" : th.c, color: "#fff", cursor: prompt.trim() ? "pointer" : "not-allowed", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700 }}>
            {busy === "prompt" ? <Loader2 size={14} className="pp-spin" /> : <Sparkles size={14} />} Apply
          </button>
        </div>
      </div>

      <div style={{ marginTop: 22 }}>
        <label style={eyebrow}><FileUp size={12} /> drop a document for this field</label>
        <div onClick={() => fileRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.[0]) runFile(e.dataTransfer.files[0]); }}
          style={{ cursor: "pointer", borderRadius: 12, border: "1.5px dashed #e2e8f0", padding: 16, textAlign: "center", background: "#f8fafc", fontSize: 12.5, color: "#94a3b8", fontWeight: 600 }}>
          {busy === "file" ? <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><Loader2 size={14} className="pp-spin" /> reading…</span> : "drop a PDF or .txt — extractor refills this field"}
          <input ref={fileRef} type="file" accept=".pdf,.txt" style={{ display: "none" }} onChange={(e) => { if (e.target.files?.[0]) runFile(e.target.files[0]); e.target.value = ""; }} />
        </div>
      </div>

      {err && <p style={{ marginTop: 12, fontSize: 12.5, color: "#dc2626" }}>{err}</p>}

      {proposal && (
        <div style={{ marginTop: 16, borderRadius: 14, border: `1px solid ${th.c}`, background: th.soft, padding: "14px 15px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}><Sparkles size={13} color={th.c} /><span style={{ fontSize: 11, fontWeight: 700, color: th.t }}>proposed via {proposal.via}</span></div>
          <p style={{ fontSize: 14, lineHeight: 1.5, margin: 0, color: "#0f172a" }}>{proposal.value}</p>
          {proposal.source_quote && <p style={{ fontSize: 12, fontStyle: "italic", color: "#64748b", marginTop: 8 }}>&ldquo;{proposal.source_quote}&rdquo; — {proposal.source_doc}</p>}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={accept} style={{ fontSize: 13, fontWeight: 700, padding: "8px 14px", borderRadius: 9, border: "none", background: th.c, color: "#fff", cursor: "pointer" }}>Use this</button>
            <button onClick={() => setProposal(null)} style={{ fontSize: 13, fontWeight: 600, padding: "8px 14px", borderRadius: 9, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", cursor: "pointer" }}>Discard</button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 28, paddingTop: 18, borderTop: "1px solid #eef2f6", display: "flex", alignItems: "center", gap: 10 }}>
        {field.state === "approved"
          ? <button onClick={() => onUpdate({ state: "pending" })} style={{ fontSize: 13, fontWeight: 600, padding: "10px 16px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", cursor: "pointer", display: "flex", alignItems: "center", gap: 7 }}><RotateCcw size={14} /> Un-approve</button>
          : <button onClick={() => onUpdate({ state: "approved" })} disabled={!text} style={{ fontSize: 14, fontWeight: 700, padding: "11px 22px", borderRadius: 10, border: "none", background: text ? "#10b981" : "#e2e8f0", color: text ? "#fff" : "#94a3b8", cursor: text ? "pointer" : "not-allowed", display: "flex", alignItems: "center", gap: 8 }}><Check size={16} strokeWidth={2.6} /> Approve field</button>}
        <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>approving is what lets it publish</span>
      </div>
    </div>
  );
}

/* ---------- error boundary so un-wired tabs never white-screen ---------- */
class Safe extends React.Component {
  constructor(p) { super(p); this.state = { err: false }; }
  static getDerivedStateFromError() { return { err: true }; }
  render() { return this.state.err ? this.props.fallback : this.props.children; }
}

const OB_KEYFRAMES = `
  @keyframes pp-tab-slide { from { opacity: .35; transform: translateX(7px); } to { opacity: 1; transform: none; } }
  @keyframes pp-ping { 75%,100% { transform: scale(2.2); opacity: 0; } }
  .pp-ping { animation: pp-ping 2s cubic-bezier(0,0,0.2,1) infinite; }
  @keyframes pp-spin { to { transform: rotate(360deg); } }
  .pp-spin { animation: pp-spin .8s linear infinite; }
  @keyframes pp-fade { from { opacity: 0; } to { opacity: 1; } }
  .pp-fade { animation: pp-fade .25s ease; }
  @keyframes pp-view { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  .pp-view { animation: pp-view .35s cubic-bezier(0.16,1,0.3,1); }
  .pp-scroll::-webkit-scrollbar { width: 0; height: 0; display: none; }
  .pp-scroll { scrollbar-width: none; }
  @keyframes pp-sheet { from { transform: translateY(100%); } to { transform: translateY(0); } }
  .pp-sheet { animation: pp-sheet .4s cubic-bezier(.2,.85,.25,1); }
`;

/* ---------- the real app, blanked, in the left panel ---------- */
const TAB_FIELD = { overview: "ov-status", projects: "pj-data", timeline: "tl-data", team: "tm-roster", media: "md-1" };
function BriefPopCard({ brief }) {
  const b = brief || {};
  const kp = Array.isArray(b.keyPoints) ? b.keyPoints.filter(Boolean) : [];
  const empty = !b.headline && !b.shortSummary && !b.businessDescription && !kp.length;
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 46, display: "flex", flexDirection: "column", justifyContent: "flex-end", background: "rgba(15,23,42,0.18)", pointerEvents: "none" }}>
      <div className="pp-sheet" style={{ background: "#fff", borderTopLeftRadius: 26, borderTopRightRadius: 26, boxShadow: "0 -24px 60px -22px rgba(15,23,42,0.5)", padding: "12px 20px 26px", maxHeight: "72%", overflowY: "auto" }}>
        <div style={{ width: 40, height: 4, borderRadius: 99, background: "#e2e8f0", margin: "0 auto 16px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
          <span style={{ width: 30, height: 30, borderRadius: 10, background: "linear-gradient(140deg,#1b4fd0,#49b4f0)", display: "grid", placeItems: "center" }}><Zap size={15} color="#fff" strokeWidth={2.5} /></span>
          <div><p style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: ".18em", textTransform: "uppercase", color: "#94a3b8", margin: 0 }}>AI Brief</p><p style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", margin: "1px 0 0", letterSpacing: "-.01em" }}>{b.headline || "Explain this company in 60 seconds"}</p></div>
        </div>
        {empty
          ? <p style={{ fontSize: 13, lineHeight: 1.55, color: "#334155", margin: 0 }}>Your AI-generated company brief will appear here — edit it on the right and preview it in this card.</p>
          : (
            <>
              {b.shortSummary && <p style={{ fontSize: 13, lineHeight: 1.55, color: "#0f172a", fontWeight: 600, margin: "0 0 8px" }}>{b.shortSummary}</p>}
              {b.businessDescription && <p style={{ fontSize: 12.5, lineHeight: 1.55, color: "#334155", margin: 0 }}>{b.businessDescription}</p>}
              {kp.length > 0 && (
                <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 7 }}>
                  {kp.map((p, i) => (
                    <li key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <span style={{ marginTop: 6, width: 5, height: 5, borderRadius: 999, background: "#2f86e6", flexShrink: 0 }} />
                      <span style={{ fontSize: 12.5, lineHeight: 1.4, color: "#334155" }}>{p}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
      </div>
    </div>
  );
}
function EditChip({ onClick, tone }) {
  return (
    <button onClick={onClick} className="absolute right-3 top-2 z-40 flex items-center gap-1.5 rounded-full border bg-white/95 px-3 py-1.5 text-[11px] font-bold shadow-sm backdrop-blur transition active:scale-95"
      style={{ borderColor: tone + "44", color: tone }}>
      <Type size={11} strokeWidth={2.6} /> Edit
    </button>
  );
}

function LeftPreview({ vm, tab, setTab, ready, spot, onActivate, fieldSpot, projects }) {
  const frameRef = useRef(null);
  const notWired = (name) => (
    <div className="px-5 pt-10 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl" style={{ background: "#f1f5f9" }}><Layers size={22} className="text-slate-400" /></div>
      <p className="mt-4 text-[15px] font-bold text-slate-800">{name}</p>
      <p className="mx-auto mt-1 max-w-[240px] text-[12.5px] font-medium text-slate-400">Capital is wired end-to-end. This tab fills the same way — next pass.</p>
    </div>
  );
  return (
    <div className="relative overflow-hidden bg-white" style={{ width: 390, height: 800, borderRadius: 40, border: "10px solid #dfe5ec", boxShadow: "0 30px 90px -20px rgba(15,23,42,0.35)" }}>
      <div ref={frameRef} className="flex h-full flex-col" style={{ background: "#fff" }} onClickCapture={(e) => { const el = e.target.closest("[data-sp]"); if (el) { const id = el.getAttribute("data-sp"); if (onActivate && id !== spot) { e.stopPropagation(); e.preventDefault(); onActivate(id); } } }}>
        <HeaderSpotlight active={spot === "co"} containerRef={frameRef} />
        <FieldBorderOverlay containerRef={frameRef} fieldSpot={fieldSpot} tab={tab} />
        {spot === "ov-brief" && tab === "overview" && <BriefPopCard brief={vm.ov && vm.ov.companyBrief} />}
        <StatusBar />
        <div className="flex-shrink-0" style={{ background: "linear-gradient(180deg,#F1F6FD 0%,#F8FBFE 55%,#FFFFFF 100%)" }}>
          <div className="flex items-center gap-1 px-2 pt-1">
            <button aria-label="Back" className="grid h-9 w-9 place-items-center rounded-full text-slate-600"><ChevronLeft size={22} /></button>
            <span className="text-[12px] font-bold uppercase tracking-widest text-slate-400">Company Profile</span>
          </div>
          {tab === "overview"
            ? <ProfileHeader tab={tab} setTab={setTab} following={true} setFollowing={() => {}} onField={vm.onField} />
            : <PageBar tab={tab} setTab={setTab} following={true} setFollowing={() => {}} />}
        </div>
        <div key={tab} className="pp-scroll relative flex-1 overflow-y-auto pb-24">
          <ScrollSpotlight spot={spot} />
          <ScenarioSpotlight spot={spot} />
          <div className="pp-view min-h-full" data-sp={({ team: "tm-roster", timeline: "tl-data" })[tab]}>
            {tab === "overview" && <Safe fallback={notWired("Overview")}><Overview ov={vm.ov} activeSpot={spot} tab={tab} goto={() => {}} openBrief={() => vm.onField && vm.onField("ov-brief")} following={true} setFollowing={() => {}} bookmarked={false} setBookmarked={() => {}} saved={[]} openCompare={() => {}} openWatchlist={() => {}} openConference={() => {}} /></Safe>}
            {tab === "projects" && <Safe fallback={notWired("Projects")}><ProjectsView spot={spot} projects={projects} /></Safe>}
            {tab === "timeline" && <Safe fallback={notWired("Timeline")}><TimelineView /></Safe>}
            {tab === "capital" && <CapitalView />}
            {tab === "team" && <Safe fallback={notWired("Team")}><TeamView onOpenCompany={() => {}} /></Safe>}
            {tab === "media" && <Safe fallback={notWired("Media")}><MediaView /></Safe>}
          </div>
        </div>
      </div>
    </div>
  );
}

const OB_PAGES = ["overview", "projects", "timeline", "capital", "team", "media"];


/* ============================================================================
   BRANDING & VISUAL IDENTITY  — comes before the profile template.
   Left: live preview (avatar + hero status card with composited logo).
   Right: three guided uploads (profile pic, hero image, logo).
   Logo background is removed client-side via a corner-color key
   (handles white / black / solid backgrounds), then composited + faded in.
   ============================================================================ */

function removeBg(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      const scale = Math.min(1, 900 / Math.max(img.width, img.height));
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0, c.width, c.height);
      let id;
      try { id = ctx.getImageData(0, 0, c.width, c.height); } catch { return resolve(dataUrl); }
      const d = id.data, W = c.width, H = c.height;
      // sample the four corners to infer the background colour
      const cor = [0, (W - 1) * 4, (H - 1) * W * 4, (H * W - 1) * 4];
      let br = 0, bg = 0, bb = 0;
      cor.forEach((i) => { br += d[i]; bg += d[i + 1]; bb += d[i + 2]; });
      br /= 4; bg /= 4; bb /= 4;
      const T = 70;                              // colour-distance threshold
      const feather = 32;
      for (let i = 0; i < d.length; i += 4) {
        const dist = Math.sqrt((d[i] - br) ** 2 + (d[i + 1] - bg) ** 2 + (d[i + 2] - bb) ** 2);
        if (dist < T) d[i + 3] = 0;
        else if (dist < T + feather) d[i + 3] = Math.round(d[i + 3] * ((dist - T) / feather));
      }
      ctx.putImageData(id, 0, 0);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function UploadTile({ shape, filled, onFile, children, hint, tone = "#0f172a" }) {
  const ref = useRef(null);
  const [drag, setDrag] = useState(false);
  const radius = shape === "circle" ? "9999px" : shape === "rect" ? "16px" : "22px";
  const h = shape === "circle" ? 132 : shape === "rect" ? 116 : 190;
  const w = shape === "circle" ? 132 : "100%";
  return (
    <div
      onClick={() => ref.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files?.[0]) onFile(e.dataTransfer.files[0]); }}
      style={{ position: "relative", width: w, height: h, margin: shape === "circle" ? "0 auto" : 0, borderRadius: radius, cursor: "pointer",
        border: `2px dashed ${drag ? tone : filled ? "transparent" : "#d8dee9"}`, background: filled ? "#0b1220" : drag ? "rgba(15,23,42,0.03)" : "#f8fafc",
        overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", transition: "border-color .15s, background .15s" }}>
      {children}
      {!filled && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "#94a3b8", pointerEvents: "none" }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: "#eef2f7", display: "grid", placeItems: "center" }}><Plus size={18} color={tone} strokeWidth={2.6} /></div>
          {hint && <span style={{ fontSize: 11.5, fontWeight: 600, textAlign: "center", padding: "0 16px" }}>{hint}</span>}
        </div>
      )}
      <input ref={ref} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { if (e.target.files?.[0]) onFile(e.target.files[0]); e.target.value = ""; }} />
    </div>
  );
}


/* ============================================================================
   FLIP STATUS CARD  — the real status card, reusable.
   Front = hero + composited logo. Back = the exact templated status card
   (Company Status · headline · summary · progress · Latest Update /
   Next Catalyst / Expected / Investment Impact). Blank by default.
   ============================================================================ */
function FlipStatusCard({ hero, logo, status = {}, flipped = false, logoIn = true, width = 300, showProgress = true }) {
  const pct = status.progressTotal ? Math.max(0, Math.min(100, Math.round(((status.progressDone || 0) / status.progressTotal) * 100))) : 0;
  const ph = (v, placeholder) => v ? <>{v}</> : <span style={{ color: "#cbd5e1", fontWeight: 600 }}>{placeholder}</span>;
  const heroFace = (
    <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 22, overflow: "hidden", background: "#0b1220" }}>
      {hero
        ? <img src={hero} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        : <div style={{ position: "absolute", inset: 0, background: "linear-gradient(150deg,#e2e8f0,#cbd5e1)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 7, color: "#94a3b8" }}><ImageIcon size={22} /><span style={{ fontSize: 11, fontWeight: 700 }}>Hero image</span></div>}
      <span style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(0,0,0,0.05),rgba(0,0,0,0.30))" }} />
      {logo && <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", opacity: logoIn ? 1 : 0, transform: logoIn ? "scale(1)" : "scale(.92)", transition: "opacity .8s ease, transform .8s cubic-bezier(.2,.8,.2,1)" }}><img src={logo} alt="" style={{ width: "58%", maxHeight: "58%", objectFit: "contain", filter: "drop-shadow(0 6px 16px rgba(0,0,0,0.55))" }} /></span>}
    </div>
  );
  const backFace = (
    <div style={{ borderRadius: 22, overflow: "hidden", border: "1px solid #e2e8f0", background: "#fff", boxShadow: "0 1px 2px rgba(15,23,42,0.03), 0 24px 54px -24px rgba(15,23,42,0.32)" }}>
      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", flexDirection: "row-reverse", alignItems: "center", gap: 12 }}>
          <div style={{ width: 74, height: 74, borderRadius: 16, overflow: "hidden", border: "1px solid #e2e8f0", flexShrink: 0, boxShadow: "0 9px 20px -10px rgba(15,23,42,0.5)" }}>
            {hero ? <img src={hero} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", background: "#f1f5f9", color: "#cbd5e1" }}><ImageIcon size={15} /></span>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", flex: 1, minWidth: 0 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 999, padding: "3px 9px", border: "1px solid #f97316" }}>
              <span style={{ position: "relative", display: "flex", width: 6, height: 6 }}><span className="pp-ping" style={{ position: "absolute", inset: 0, borderRadius: 999, background: "#fb923c", opacity: .75 }} /><span style={{ position: "relative", width: 6, height: 6, borderRadius: 999, background: "#f97316" }} /></span>
              <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase", color: "#f97316" }}>Company Status</span>
            </span>
            <h2 data-fp="st-state" style={{ marginTop: 11, fontSize: 20, lineHeight: 1.08, fontWeight: 800, letterSpacing: "-.01em", color: "#0f172a" }}>{ph(status.state, "Status headline")}</h2>
            <p data-fp="st-detail" style={{ marginTop: 8, fontSize: 11.5, lineHeight: 1.35, fontWeight: 500, color: "#64748b" }}>{ph(status.detail, "One-line summary of where the company stands.")}</p>
          </div>
        </div>
        {showProgress && (
        <div style={{ marginTop: 20 }}>
          <div style={{ height: 8, borderRadius: 999, background: "#e2e8f0", overflow: "hidden" }}><div style={{ height: "100%", width: `${pct}%`, borderRadius: 999, background: "linear-gradient(90deg,#10b981,#34d399)" }} /></div>
          <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "#94a3b8" }}>{ph(status.progressLabel, "Progress")}</span>
            <span style={{ fontSize: 9.5, fontWeight: 800, color: "#0f9b73" }}>{pct}%</span>
          </div>
        </div>
        )}
      </div>
      {[["Latest Update", status.latest, "—"], ["Next Catalyst", status.nextCatalyst, "—"]].reduce((_, __) => _, null)}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: "1px solid #f1f5f9" }}>
        <div style={{ padding: 12, borderRight: "1px solid #f1f5f9" }}><p style={{ fontSize: 8.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "#94a3b8" }}>Latest Update</p><p data-fp="st-latest" style={{ marginTop: 4, fontSize: 11, fontWeight: 600, lineHeight: 1.25, color: "#475569" }}>{ph(status.latest, "—")}</p></div>
        <div style={{ padding: 12 }}><p style={{ fontSize: 8.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "#94a3b8" }}>Next Catalyst</p><p data-fp="st-nextCatalyst" style={{ marginTop: 4, fontSize: 12.5, fontWeight: 700, lineHeight: 1.2, color: "#0f172a" }}>{ph(status.nextCatalyst, "—")}</p></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: "1px solid #f1f5f9" }}>
        <div style={{ padding: 12, borderRight: "1px solid #f1f5f9" }}><p style={{ fontSize: 8.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "#94a3b8" }}>Expected</p><p data-fp="st-eta" style={{ marginTop: 4, fontSize: 12.5, fontWeight: 700, lineHeight: 1.2, color: "#0f172a" }}>{ph(status.eta && status.eta.replace("Expected ", ""), "—")}</p></div>
        <div style={{ padding: 12 }}><p style={{ fontSize: 8.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "#94a3b8" }}>Investment Impact</p><p data-fp="st-impact" style={{ marginTop: 4, fontSize: 11, fontWeight: 600, lineHeight: 1.25, color: "#475569" }}>{ph(status.impact, "—")}</p></div>
      </div>
    </div>
  );
  return (
    <div style={{ width, perspective: 1600 }}>
      <div style={{ position: "relative", transformStyle: "preserve-3d", transition: "transform .85s cubic-bezier(.2,.75,.2,1)", transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}>
        <div style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>{backFace}</div>
        <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}>
          <div style={{ height: "100%" }}>{heroFace}</div>
        </div>
      </div>
    </div>
  );
}

/* ---------- status-review step: card flips to filled template (left), edit (right) ---------- */
function StatusReview({ brand, seed, onNext, onBack, onSkip }) {
  const [flipped, setFlipped] = useState(false);
  const [st, setSt] = useState(seed);
  useEffect(() => { const t = setTimeout(() => setFlipped(true), 500); return () => clearTimeout(t); }, []);
  const set = (k, v) => setSt((p) => ({ ...p, [k]: v }));
  const reset = (k) => setSt((p) => ({ ...p, [k]: seed[k] }));
  const rows = [
    { k: "state", label: "Status headline", area: false },
    { k: "detail", label: "Summary", area: true },
    { k: "progressLabel", label: "Progress label", area: false },
    { k: "latest", label: "Latest update", area: true },
    { k: "nextCatalyst", label: "Next catalyst", area: false },
    { k: "eta", label: "Expected", area: false },
    { k: "impact", label: "Investment impact", area: true },
  ];
  const eyebrow = { fontSize: 11, fontWeight: 800, letterSpacing: ".16em", textTransform: "uppercase", color: "#94a3b8" };
  return (
    <div style={{ minHeight: "100vh", height: "100vh", display: "grid", gridTemplateColumns: "1fr 1fr", background: "#f6f8fb" }}>
      <style>{OB_KEYFRAMES}</style>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, padding: 40, background: "radial-gradient(700px 500px at 50% 0%,#fff,#eef2f7)" }}>
        <span style={{ ...eyebrow, color: "#10b981" }}>Live preview</span>
        <FlipStatusCard hero={brand.hero} logo={brand.logo} status={st} flipped={flipped} />
        <p style={{ fontSize: 11.5, color: "#94a3b8", maxWidth: 300, textAlign: "center" }}>Your hero card flips to reveal the status card. Edits on the right update it live.</p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", background: "#fff", borderLeft: "1px solid #e9eef5" }}>
        <div style={{ padding: "34px 40px 12px" }}>
          <span style={{ ...eyebrow, color: "#0f172a" }}>Step 2 · Company status</span>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-.02em", color: "#0f172a", margin: "8px 0 0" }}>Review your status card</h1>
          <p style={{ fontSize: 13, color: "#64748b", marginTop: 8 }}>We pre-filled this from your documents. Edit anything — the card mirrors your changes. The back arrow on any field undoes it.</p>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 40px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          {rows.map(({ k, label, area }) => (
            <div key={k}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <label style={{ ...eyebrow, fontSize: 10.5 }}>{label}</label>
                {st[k] !== seed[k] && <button onClick={() => reset(k)} title="Undo" style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700 }}><RotateCcw size={12} /> undo</button>}
              </div>
              {area
                ? <textarea value={st[k] || ""} onChange={(e) => set(k, e.target.value)} style={{ width: "100%", minHeight: 60, resize: "vertical", border: "1px solid #e2e8f0", borderRadius: 11, padding: "10px 12px", fontSize: 13.5, color: "#0f172a", boxSizing: "border-box", fontFamily: "inherit" }} />
                : <input value={st[k] || ""} onChange={(e) => set(k, e.target.value)} style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 11, padding: "10px 12px", fontSize: 13.5, color: "#0f172a", boxSizing: "border-box", fontFamily: "inherit" }} />}
            </div>
          ))}
        </div>
        <div style={{ padding: "16px 40px 24px", borderTop: "1px solid #eef2f6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button onClick={onBack} style={{ fontSize: 13.5, fontWeight: 600, padding: "11px 16px", borderRadius: 11, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7 }}><ArrowLeft size={15} /> Back</button>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <button onClick={onSkip} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13.5, fontWeight: 700, color: "#64748b", display: "inline-flex", alignItems: "center", gap: 6 }}>Skip <ArrowRight size={15} /></button>
            <button onClick={() => onNext(st)} style={{ fontSize: 15, fontWeight: 700, padding: "13px 28px", borderRadius: 13, border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 9 }}>Approve &amp; continue <ArrowRight size={17} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Branding({ onNext }) {
  const [avatar, setAvatar] = useState("");
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [hero, setHero] = useState("");
  const [logo, setLogo] = useState("");
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoIn, setLogoIn] = useState(false);
  const dragRef = useRef(null);

  const read = (file, cb) => { const r = new FileReader(); r.onload = () => cb(r.result); r.readAsDataURL(file); };
  const onAvatar = (f) => read(f, (u) => { setAvatar(u); setZoom(1); setPos({ x: 0, y: 0 }); });
  const onHero = (f) => read(f, setHero);
  const onLogo = (f) => read(f, (u) => { setLogoBusy(true); setLogoIn(false); removeBg(u).then((out) => { setLogo(out); setLogoBusy(false); setTimeout(() => setLogoIn(true), 80); }); });

  // drag-to-reposition on the avatar preview
  const startDrag = (e) => { dragRef.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y }; };
  const moveDrag = (e) => { if (!dragRef.current) return; setPos({ x: dragRef.current.ox + (e.clientX - dragRef.current.sx), y: dragRef.current.oy + (e.clientY - dragRef.current.sy) }); };
  const endDrag = () => { dragRef.current = null; };

  const ready = avatar && hero && logo;
  const eyebrow = { fontSize: 11, fontWeight: 800, letterSpacing: ".16em", textTransform: "uppercase", color: "#94a3b8" };
  const step = (n, title, sub) => (
    <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 12 }}>
      <span style={{ width: 24, height: 24, borderRadius: 999, background: "#0f172a", color: "#fff", fontSize: 12, fontWeight: 800, display: "grid", placeItems: "center", flexShrink: 0 }}>{n}</span>
      <div><p style={{ fontSize: 14.5, fontWeight: 700, color: "#0f172a", margin: 0 }}>{title}</p><p style={{ fontSize: 12, color: "#94a3b8", margin: "1px 0 0" }}>{sub}</p></div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", height: "100vh", display: "grid", gridTemplateColumns: "1fr 1fr", background: "#f6f8fb" }}
      onMouseMove={moveDrag} onMouseUp={endDrag} onMouseLeave={endDrag}>
      <style>{OB_KEYFRAMES}</style>

      {/* LEFT — live preview */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 26, padding: 40, background: "radial-gradient(700px 500px at 50% 0%,#ffffff,#eef2f7)" }}>
        <span style={{ ...eyebrow, color: "#10b981" }}>Live preview</span>

        {/* avatar */}
        <div
          onMouseDown={avatar ? startDrag : undefined}
          style={{ width: 128, height: 128, borderRadius: 999, overflow: "hidden", border: "5px solid #fff", boxShadow: "0 16px 40px -14px rgba(15,23,42,0.4)", background: "#eef2f7", position: "relative", cursor: avatar ? "grab" : "default", flexShrink: 0 }}>
          {avatar
            ? <img src={avatar} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `translate(${pos.x}px,${pos.y}px) scale(${zoom})`, userSelect: "none" }} />
            : <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#cbd5e1" }}><Plus size={26} /></span>}
        </div>

        <FlipStatusCard hero={hero} logo={logo} status={{}} flipped={false} logoIn={logoIn} />
        
        <p style={{ fontSize: 11.5, color: "#94a3b8", maxWidth: 340, textAlign: "center" }}>This is exactly how your avatar and status card will appear on the live profile.</p>
      </div>

      {/* RIGHT — upload panel */}
      <div style={{ display: "flex", flexDirection: "column", background: "#fff", borderLeft: "1px solid #e9eef5" }}>
        <div style={{ padding: "34px 40px 10px" }}>
          <span style={{ ...eyebrow, color: "#0f172a" }}>Step 1 of onboarding</span>
          <h1 style={{ fontSize: 25, fontWeight: 800, letterSpacing: "-.02em", color: "#0f172a", margin: "8px 0 0" }}>Branding &amp; visual identity</h1>
          <p style={{ fontSize: 13.5, color: "#64748b", marginTop: 8, lineHeight: 1.5 }}>Add your three brand assets. The preview updates live — when you drop in your logo we remove its background and place it on the hero automatically.</p>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 40px 20px", display: "flex", flexDirection: "column", gap: 26 }}>
          {/* 1 — profile picture */}
          <div>
            {step("1", "Company profile picture", "Shown as your circular avatar")}
            <UploadTile shape="circle" filled={!!avatar} onFile={onAvatar} hint="Add photo">
              {avatar && <img src={avatar} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `translate(${pos.x}px,${pos.y}px) scale(${zoom})` }} />}
            </UploadTile>
            {avatar && (
              <div style={{ marginTop: 12 }}>
                <label style={{ ...eyebrow, fontSize: 10, display: "block", marginBottom: 6 }}>Zoom — drag the preview to reposition</label>
                <input type="range" min="1" max="3" step="0.01" value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} style={{ width: "100%", accentColor: "#0f172a" }} />
              </div>
            )}
          </div>

          {/* 2 — hero image */}
          <div>
            {step("2", "Company hero image", "A high-quality shot of your flagship project or site")}
            <UploadTile shape="hero" filled={!!hero} onFile={onHero} hint="Drop your hero image">
              {hero && <img src={hero} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
            </UploadTile>
          </div>

          {/* 3 — logo */}
          <div>
            {step("3", "Company logo", "PNG or SVG — transparent, white, or black background")}
            <UploadTile shape="rect" filled={!!logo} onFile={onLogo} hint="Drop your logo — we'll cut out the background">
              {logo && <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", background: "linear-gradient(135deg,#0b1220,#1e293b)" }}><img src={logo} alt="" style={{ maxWidth: "72%", maxHeight: "76%", objectFit: "contain", filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.5))" }} /></div>}
            </UploadTile>
            {logoBusy && <p style={{ fontSize: 12, color: "#64748b", marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}><Loader2 size={13} className="pp-spin" /> Removing background…</p>}
          </div>
        </div>

        <div style={{ padding: "16px 40px 24px", borderTop: "1px solid #eef2f6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, color: "#94a3b8" }}>{[avatar, hero, logo].filter(Boolean).length} / 3 assets added</span>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <button onClick={() => onNext({ avatar, hero, logo })}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13.5, fontWeight: 700, color: "#64748b", display: "inline-flex", alignItems: "center", gap: 6 }}>
              Skip <ArrowRight size={15} />
            </button>
            <button onClick={() => ready && onNext({ avatar, hero, logo })} disabled={!ready}
              style={{ fontSize: 15, fontWeight: 700, padding: "13px 30px", borderRadius: 13, border: "none", cursor: ready ? "pointer" : "not-allowed", display: "inline-flex", alignItems: "center", gap: 9, background: ready ? "#0f172a" : "#e2e8f0", color: ready ? "#fff" : "#94a3b8", transition: "all .16s" }}>
              Next <ArrowRight size={17} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


/* ============================================================================
   SPOTLIGHT GUIDED EDITING
   Dims everything except the active section, auto-opens its editor on the
   right, steps forward with Next, and lets you click any dimmed section to
   jump to it. Section targets are marked with data-sp="<id>".
   ============================================================================ */

const SECTION_DEFS = {
  co:          { tab: "overview", label: "Company details",  kind: "company" },
  "ov-status": { tab: "overview", label: "Edit Company Status", kind: "companyStatus" },
  "ov-thesis": { tab: "overview", label: "Investment case",   kind: "thesis" },
  "ov-thesis-expanded": { tab: "overview", label: "Investment case — detail", kind: "thesis" },
  "ov-brief":  { tab: "overview", label: "Edit Company Brief",  kind: "companyBrief" },
  "ov-bull":   { tab: "overview", label: "Bull case",         kind: "scenario", scenario: "bull" },
  "ov-bear":   { tab: "overview", label: "Bear case",         kind: "scenario", scenario: "bear" },
  "ov-next":   { tab: "overview", label: "Next validation point", kind: "scenario", scenario: "next" },
  "pj-header":   { tab: "projects", label: "Projects",        kind: "projects" },
  "pj-carousel": { tab: "projects", label: "Project photos",  kind: "projects", pjStep: 0 },
  "pj-brief":    { tab: "projects", label: "AI project brief",kind: "projects", pjStep: 1 },
  "pj-snap-0": { tab: "projects", label: "Snapshot · Location",      kind: "projects", pjStep: 2 },
  "pj-snap-1": { tab: "projects", label: "Snapshot · Commodities",   kind: "projects", pjStep: 3 },
  "pj-snap-2": { tab: "projects", label: "Snapshot · Land Position", kind: "projects", pjStep: 4 },
  "pj-snap-3": { tab: "projects", label: "Snapshot · Drill Targets", kind: "projects", pjStep: 5 },
  "pj-stage":         { tab: "projects", label: "Project stage",            kind: "projects", pjStep: 6 },
  "pj-geo-district":  { tab: "projects", label: "Geology · District maps",  kind: "projects", pjStep: 9 },
  "pj-geo-geology":   { tab: "projects", label: "Geology · Geology",        kind: "projects", pjStep: 10 },
  "pj-geo-drill":     { tab: "projects", label: "Geology · Drill results",  kind: "projects", pjStep: 11 },
  "pj-geo-history":   { tab: "projects", label: "Geology · Exploration history", kind: "projects", pjStep: 12 },
  "pj-geo-nearby":    { tab: "projects", label: "Geology · Nearby operations",   kind: "projects", pjStep: 13 },
  "pj-geo-infra":     { tab: "projects", label: "Geology · Infrastructure", kind: "projects", pjStep: 14 },
  "pj-unique":          { tab: "projects", label: "What makes this unique", kind: "projects", pjStep: 15 },
  "pj-unique-expanded": { tab: "projects", label: "Unique — details",       kind: "projects", pjStep: 15 },
  "tl-data":   { tab: "timeline", label: "Timeline",          kind: "timeline", field: "tl-data" },
  "cp-status":    { tab: "capital", label: "Capital",           kind: "capital" },
  "cp-listings":  { tab: "capital", label: "Listings",          kind: "company" },
  "cp-aisummary": { tab: "capital", label: "AI Capital Summary",kind: "capital" },
  "cp-mktcap":    { tab: "capital", label: "Market Cap",        kind: "capital" },
  "cp-cash":      { tab: "capital", label: "Cash",              kind: "capital" },
  "cp-wc":        { tab: "capital", label: "Cash",              kind: "capital" },
  "cp-basic":     { tab: "capital", label: "Basic Shares",      kind: "capital" },
  "cp-fd":        { tab: "capital", label: "Fully Diluted",     kind: "capital" },
  "cp-shares":    { tab: "capital", label: "Share Structure",   kind: "capital" },
  "cp-fin":       { tab: "capital", label: "Latest Financing",  kind: "capital" },
  "cp-findetails":{ tab: "capital", label: "Financial Details", kind: "capital" },
  "cp-insider":   { tab: "capital", label: "Ownership",         kind: "capital" },
  "tm-roster": { tab: "team",     label: "Team",              kind: "team", field: "tm-roster" },
  "md-1":      { tab: "media",    label: "Media",             kind: "text", field: "md-1" },
};
// Ordered strictly by on-screen position: top→bottom, left→right within a row.
// New profile overview = Company details → Company Status → Company Brief
// (with Core Value Drivers). The old investment-thesis / bull / bear / next-
// validation steps were dropped when the profile layout changed.
const SECTION_ORDER = [
  "co", "ov-status", "ov-brief",
  "pj-header",
  "tl-data",
  "cp-fin",
  "tm-roster",
];

/* ============================================================================
   SPOTLIGHT — content-space architecture.

   The spotlight lives INSIDE the scrolling profile content (`ScrollSpotlight`,
   a direct child of `.pp-scroll`). Its position is measured in *content-space*
   using offsetTop/offsetLeft/offsetWidth/offsetHeight — values that do not
   change when the container scrolls. Because the spotlight and its target share
   the same scrolling parent, they move together for free: no scroll listeners,
   no rAF tracking, no ResizeObserver, no re-lock, no post-animation correction.
   We measure once per target, glide transform→transform between content-space
   positions, and stop.

   The company header (`co`) lives above the scroll area, so it gets its own
   tiny static frame-level highlight (`HeaderSpotlight`) that never needs to
   track anything.
   ============================================================================ */

// One rounded box whose huge box-shadow spread dims everything around it.
const SPOT_SHADOW = "0 0 0 2px rgba(16,185,129,0.75), 0 0 24px 6px rgba(16,185,129,0.30), 0 0 0 9999px rgba(15,23,42,0.58)";
const SPOT_BASE = {
  position: "absolute", top: 0, left: 0, width: 0, height: 0,
  pointerEvents: "none", opacity: 0, borderRadius: 16, boxShadow: SPOT_SHADOW,
  transition: "opacity .4s cubic-bezier(.4,0,.2,1)", willChange: "transform, width, height",
};

// Offset of `el` within `root`, summed up the offsetParent chain. Scroll-independent.
function contentOffset(el, root) {
  let x = 0, y = 0, n = el;
  while (n && n !== root) {
    x += n.offsetLeft; y += n.offsetTop;
    n = n.offsetParent;
    if (n && n !== root && !root.contains(n)) break;   // guard against escaping the root
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}
function padFor(w, h) { const small = w < 130 || h < 76; return { pad: small ? 6 : 12, r: small ? 12 : 18 }; }

const SCENARIO_SPOTS = { "ov-bull": 1, "ov-bear": 1, "ov-next": 1 };
// Build an SVG path for a rounded polygon (handles both convex and concave corners).
function roundedPolyPath(pts, radius) {
  const n = pts.length; let d = "";
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n], cur = pts[i], next = pts[(i + 1) % n];
    const v1x = cur.x - prev.x, v1y = cur.y - prev.y, v2x = next.x - cur.x, v2y = next.y - cur.y;
    const l1 = Math.hypot(v1x, v1y) || 1, l2 = Math.hypot(v2x, v2y) || 1;
    const cross = (v1x / l1) * (v2y / l2) - (v1y / l1) * (v2x / l2);
    // Only round convex (outer) corners. Concave (inner) junctions stay sharp so
    // the neck meets the field flush — no notch/hole.
    const r = cross > 0 ? Math.min(radius, l1 / 2, l2 / 2) : 0;
    if (r < 0.5) {
      d += (i === 0 ? `M ${cur.x} ${cur.y} ` : `L ${cur.x} ${cur.y} `);
      continue;
    }
    const aX = cur.x - (v1x / l1) * r, aY = cur.y - (v1y / l1) * r;
    const bX = cur.x + (v2x / l2) * r, bY = cur.y + (v2y / l2) * r;
    d += (i === 0 ? `M ${aX} ${aY} ` : `L ${aX} ${aY} `) + `A ${r} ${r} 0 0 1 ${bX} ${bY} `;
  }
  return d + "Z";
}

/* Scenario spotlight: a single connected L-shape covering the active Bull/Bear/Next
   icon AND its detail card below, with the notch (adjacent buttons) cut out. */
function ScenarioSpotlight({ spot }) {
  const ref = useRef(null);
  const [d, setD] = useState(null);
  useEffect(() => {
    const isScen = !!SCENARIO_SPOTS[spot];
    if (!isScen) { setD(null); return; }
    const svg = ref.current; if (!svg) return;
    const scroller = svg.parentElement; if (!scroller) return;
    let cancelled = false;
    const timer = setTimeout(() => requestAnimationFrame(() => {
      if (cancelled) return;
      const btn = scroller.querySelector(`[data-sp="${spot}"]`);
      const detail = scroller.querySelector('[data-detail="ov-scenario-detail"]');
      if (!btn || !detail || detail.getBoundingClientRect().height < 6) { setD(null); return; }
      const b = contentOffset(btn, scroller), f = contentOffset(detail, scroller);
      const p = 8, r = 15;
      const fx1 = f.x - p, fx2 = f.x + f.w + p, fy2 = f.y + f.h + p, jy = f.y - p; // field box + top junction
      const by1 = b.y - p;                                              // button top
      const bx1 = Math.max(fx1, Math.min(b.x - p, fx2));                // button left, clamped into field span
      const bx2 = Math.max(fx1, Math.min(b.x + b.w + p, fx2));          // button right, clamped
      // Field (full width) with the active button as a bump on its top edge, at
      // that button's actual column (works for left/middle/right).
      let pts = [
        { x: fx1, y: jy }, { x: bx1, y: jy }, { x: bx1, y: by1 }, { x: bx2, y: by1 },
        { x: bx2, y: jy }, { x: fx2, y: jy }, { x: fx2, y: fy2 }, { x: fx1, y: fy2 },
      ];
      pts = pts.filter((pt, i) => { const q = pts[(i - 1 + pts.length) % pts.length]; return Math.abs(pt.x - q.x) > 0.5 || Math.abs(pt.y - q.y) > 0.5; });
      setD({ path: roundedPolyPath(pts, r), w: scroller.scrollWidth || scroller.clientWidth, h: scroller.scrollHeight });
    }), 560);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [spot]);
  if (!SCENARIO_SPOTS[spot] || !d) return <svg ref={ref} width="0" height="0" aria-hidden="true" style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none", opacity: 0 }} />;
  return (
    <svg ref={ref} width={d.w} height={d.h} aria-hidden="true" style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none", zIndex: 40, opacity: 1, transition: "opacity .35s ease" }}>
      <defs>
        <mask id="scenmask">
          <rect x="0" y="0" width={d.w} height={d.h} fill="#fff" />
          <path d={d.path} fill="#000" />
        </mask>
        <filter id="scenglow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#10b981" floodOpacity="0.45" />
        </filter>
      </defs>
      <rect x="0" y="0" width={d.w} height={d.h} fill="rgba(15,23,42,0.58)" mask="url(#scenmask)" />
      <path d={d.path} fill="none" stroke="rgba(16,185,129,0.85)" strokeWidth="2" filter="url(#scenglow)" />
    </svg>
  );
}

function prefersReduced() {
  return typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* ---- the scroll-content spotlight: measures once, glides, then does nothing ---- */
function ScrollSpotlight({ spot }) {
  const boxRef = useRef(null);
  const cur = useRef(null);       // current content-space rect {x,y,w,h,r}
  const raf = useRef(0);
  const shown = useRef(false);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const scroller = box.parentElement;               // the .pp-scroll container
    if (raf.current) { cancelAnimationFrame(raf.current); raf.current = 0; }

    // `co` is the header — handled by HeaderSpotlight. Bull/Bear/Next use the
    // dedicated L-shape ScenarioSpotlight, so bail here to avoid double-dimming.
    if (!spot || spot === "co" || SCENARIO_SPOTS[spot] || !scroller) { box.style.opacity = "0"; shown.current = false; cur.current = null; return; }

    let cancelled = false;
    const reduce = prefersReduced();

    const apply = (r) => {
      box.style.transform = `translate3d(${r.x}px, ${r.y}px, 0)`;
      box.style.width = r.w + "px";
      box.style.height = r.h + "px";
      box.style.borderRadius = r.r + "px";
    };
    // Bull/Bear/Next: the buttons live in a shared 3-col row, so highlighting the
    // button (and unioning the full-width detail) would light up all three. Instead
    // point the spotlight at just that scenario's detail card — the area it relates to.
    const DETAIL_ONLY = {
      "ov-bull": '[data-detail="ov-scenario-detail"]',
      "ov-bear": '[data-detail="ov-scenario-detail"]',
      "ov-next": '[data-detail="ov-scenario-detail"]',
    };
    const measure = () => {
      let el = scroller.querySelector(`[data-sp="${spot}"]`);
      const detailSel = DETAIL_ONLY[spot];
      if (detailSel) {
        const del = scroller.querySelector(detailSel);
        if (del && del.getBoundingClientRect().height > 6) el = del;   // highlight the open scenario card only
      }
      if (!el) return null;
      const o = contentOffset(el, scroller);          // stable content-space box
      const { pad, r } = padFor(o.w, o.h);
      return { x: o.x - pad, y: o.y - pad, w: o.w + pad * 2, h: o.h + pad * 2, r };
    };
    const bringIntoView = (rect, instant) => {
      const viewH = scroller.clientHeight;
      let top = rect.h >= viewH * 0.85 ? rect.y - 24 : rect.y - (viewH - rect.h) / 2;
      const max = scroller.scrollHeight - viewH;
      top = Math.max(0, Math.min(top, max));
      scroller.scrollTo({ top, behavior: instant ? "auto" : "smooth" });
    };

    // Re-measure when the highlighted element's size changes (e.g. key-point rows
    // added/removed): the highlight grows/shrinks to fit instead of staying locked.
    let ro = null;
    const reflow = () => {
      if (cancelled) return;
      const to = measure();
      if (!to) return;
      const from = cur.current || to;
      if (raf.current) cancelAnimationFrame(raf.current);
      const dur = 240, t0 = performance.now();
      const ease = (x) => 1 - Math.pow(1 - x, 3);
      const step = (now) => {
        if (cancelled) return;
        const p = Math.min(1, (now - t0) / dur), e = ease(p);
        const r = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w + (to.w - from.w) * e, h: from.h + (to.h - from.h) * e, r: from.r + (to.r - from.r) * e };
        cur.current = r; apply(r);
        if (p < 1) raf.current = requestAnimationFrame(step);
        else { raf.current = 0; cur.current = to; apply(to); }
      };
      raf.current = requestAnimationFrame(step);
    };
    const observeTarget = () => {
      if (typeof ResizeObserver === "undefined" || ro) return;
      ro = new ResizeObserver(() => reflow());
      const el = scroller.querySelector(`[data-sp="${spot}"]`);
      if (el) ro.observe(el);
      const rail = scroller.querySelector('[data-sp="ov-thesis-expanded"]');
      if (rail && spot === "ov-thesis") ro.observe(rail);
    };

    // Measure after the section/tab has painted. Expandable targets carry a
    // `data-sp-delay` so we wait for their open animation to finish before the
    // single measurement — no re-measuring, no post-expand recalibration.
    const targetEl = scroller.querySelector(`[data-sp="${spot}"]`);
    const settle = (DETAIL_ONLY[spot] || spot === "ov-thesis") ? 520 : (targetEl ? (parseInt(targetEl.getAttribute("data-sp-delay"), 10) || 40) : 40);
    const timer = setTimeout(() => requestAnimationFrame(() => {
      if (cancelled) return;
      const to = measure();
      if (!to) { box.style.opacity = "0"; return; }
      observeTarget();   // watch for content-size changes → reflow the highlight

      const instant = reduce || !shown.current;       // snap+fade on first show / reduced motion
      bringIntoView(to, instant);                      // scroll the container; box scrolls with it
      const from = cur.current;

      if (instant || !from) {
        cur.current = to; apply(to); shown.current = true;
        box.style.opacity = "0";
        requestAnimationFrame(() => { if (!cancelled) box.style.opacity = "1"; });
        return;
      }

      // Glide old→new, both in content-space, so the scroll can't fight it.
      box.style.opacity = "1";
      const dur = 460, t0 = performance.now();
      const ease = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
      const step = (now) => {
        if (cancelled) return;
        const p = Math.min(1, (now - t0) / dur), e = ease(p);
        const r = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w + (to.w - from.w) * e, h: from.h + (to.h - from.h) * e, r: from.r + (to.r - from.r) * e };
        cur.current = r; apply(r);
        if (p < 1) raf.current = requestAnimationFrame(step);
        else { raf.current = 0; cur.current = to; apply(to); }
      };
      raf.current = requestAnimationFrame(step);
    }), settle);

    return () => { cancelled = true; clearTimeout(timer); if (ro) ro.disconnect(); if (raf.current) cancelAnimationFrame(raf.current); };
  }, [spot]);

  return <div ref={boxRef} aria-hidden="true" style={{ ...SPOT_BASE, zIndex: 40 }} />;
}

/* ---- the header spotlight: static, frame-level, only for `co` ---- */
function HeaderSpotlight({ active, containerRef }) {
  const boxRef = useRef(null);
  useEffect(() => {
    const box = boxRef.current, cont = containerRef.current;
    if (!box) return;
    if (!active || !cont) { box.style.opacity = "0"; return; }
    let cancelled = false;
    // The header never scrolls, so a single measurement is stable — no tracking.
    const timer = setTimeout(() => requestAnimationFrame(() => {
      if (cancelled) return;
      const el = cont.querySelector('[data-sp="co"]');
      if (!el) { box.style.opacity = "0"; return; }
      const cr = cont.getBoundingClientRect(), er = el.getBoundingClientRect();
      const pad = 10;
      box.style.transform = `translate3d(${er.left - cr.left - pad}px, ${er.top - cr.top - pad}px, 0)`;
      box.style.width = (er.width + pad * 2) + "px";
      box.style.height = (er.height + pad * 2) + "px";
      box.style.borderRadius = "16px";
      box.style.opacity = "0";
      requestAnimationFrame(() => { if (!cancelled) box.style.opacity = "1"; });
    }), 40);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [active]);
  return <div ref={boxRef} aria-hidden="true" style={{ ...SPOT_BASE, zIndex: 41 }} />;
}

/* ---- the green edit-border shown while a field is focused in the editor.
   Positioned once per focus change (no listeners); header and scroll fields
   are both handled in frame space since the border is transient. ---- */
function FieldBorderOverlay({ containerRef, fieldSpot, tab }) {
  const ref = useRef(null);
  useEffect(() => {
    const box = ref.current, cont = containerRef.current;
    if (!box || !cont) { if (box) box.style.display = "none"; return; }
    if (!fieldSpot) { box.style.display = "none"; return; }
    let cancelled = false;
    const timer = setTimeout(() => requestAnimationFrame(() => {
      if (cancelled) return;
      const el = cont.querySelector(`[data-fp="${fieldSpot}"]`) || cont.querySelector(`[data-sp="${fieldSpot}"]`);
      if (!el) { box.style.display = "none"; return; }
      const cr = cont.getBoundingClientRect(), er = el.getBoundingClientRect();
      const pad = 5;
      box.style.display = "block";
      box.style.transform = `translate3d(${er.left - cr.left - pad}px, ${er.top - cr.top - pad}px, 0)`;
      box.style.width = (er.width + pad * 2) + "px";
      box.style.height = (er.height + pad * 2) + "px";
    }), 40);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [fieldSpot, tab]);
  return <div ref={ref} aria-hidden="true" style={{ position: "absolute", top: 0, left: 0, display: "none", border: "2px solid #10b981", borderRadius: 10, boxShadow: "0 0 0 3px rgba(16,185,129,0.16)", pointerEvents: "none", zIndex: 55, transition: "transform .2s cubic-bezier(.4,0,.2,1), width .2s cubic-bezier(.4,0,.2,1), height .2s cubic-bezier(.4,0,.2,1)", willChange: "transform" }} />;
}

/* Compact per-field AI confidence review. Rendered ONLY inside the onboarding
   editor — never on the card or the published profile. */
function StatusReviewNote({ review, edited }) {
  if (!review) return null;
  const m = CONF_META[review.confidence] || CONF_META.low;
  const sources = review.sourcesUsed && review.sourcesUsed.length ? review.sourcesUsed.join(" · ") : "No supporting source found.";
  const line = { margin: "3px 0 0", fontSize: 10.5, lineHeight: 1.35, color: "#64748b" };
  return (
    <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 9, background: "#f8fafc", border: "1px solid #eef2f6" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9.5, fontWeight: 800, letterSpacing: ".03em", textTransform: "uppercase", color: m.c, background: m.bg, border: `1px solid ${m.bd}`, borderRadius: 999, padding: "2px 7px" }}>
          <Sparkles size={9} /> {m.label} confidence
        </span>
        {edited && <span style={{ fontSize: 9.5, fontWeight: 700, color: "#475569", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 999, padding: "2px 7px" }}>Manually edited</span>}
        {review.confidence === "low" && !edited && <span style={{ fontSize: 9.5, fontWeight: 700, color: "#be123c" }}>Review recommended</span>}
      </div>
      {review.reason && <p style={line}><span style={{ fontWeight: 700, color: "#475569" }}>Why: </span>{review.reason}</p>}
      <p style={line}><span style={{ fontWeight: 700, color: "#475569" }}>Sources: </span>{sources}</p>
      {review.howToImprove && <p style={line}><span style={{ fontWeight: 700, color: "#475569" }}>Improve: </span>{review.howToImprove}</p>}
    </div>
  );
}

function SectionEditor({ spot, def, getVal, getStatus, onText, onIdentity, onStatus, onScenario, onThesis, onNext, onPrev, onGotoSpot, first, idx, total, last, onFocusField, projects, setProjects, timeline, setTimeline, team, setTeam, company, setCompany, capital, setCapital, companyStatus, setCompanyStatus, companyStatusReview, companyStatusAI, companyBrief, setCompanyBrief, companyBriefReview, companyBriefAI }) {
  const [openId, setOpenId] = useState(null);   // which project/timeline card is expanded in the editor
  const [projStep, setProjStep] = useState(0);  // which sub-section of the open project is showing
  const [dragIdx, setDragIdx] = useState(null);  // photo being dragged to reorder
  const [uploadErr, setUploadErr] = useState("");  // photo upload error message
  // When the user taps a project tile in the preview, the spot carries a pjStep hint —
  // open the same paginated editor at that section (continuity with Next/Back).
  useEffect(() => {
    if (def && def.kind === "projects" && typeof def.pjStep === "number") {
      setProjStep(def.pjStep);
      setOpenId((cur) => cur || (((projects || [])[0] && (projects || [])[0].id) || null));
    }
  }, [def]);
  const [pbOpen, setPbOpen] = useState(false);  // Company Status → Progress Bar collapsible
  const ff = (id) => ({ onFocus: () => onFocusField && onFocusField(id), onBlur: () => onFocusField && onFocusField(null) });
  const eyebrow = { fontSize: 11, fontWeight: 800, letterSpacing: ".16em", textTransform: "uppercase", color: "#94a3b8", display: "block", marginBottom: 7 };
  const inputStyle = { width: "100%", border: "1px solid #e2e8f0", borderRadius: 11, padding: "11px 13px", fontSize: 13.5, color: "#0f172a", boxSizing: "border-box", fontFamily: "inherit" };
  let body = null;
  if (def.kind === "identity") {
    const f = [["co-name", "Company name", "e.g. Northern Star Mining"], ["co-website", "Website", "e.g. northernstar.com"], ["co-slogan", "Slogan", "A short one-line descriptor"]];
    body = f.map(([id, label, ph]) => (
      <div key={id} style={{ marginBottom: 16 }}>
        <label style={eyebrow}>{label}</label>
        <input value={getVal(id)} onChange={(e) => onIdentity(id, e.target.value)} placeholder={ph} style={inputStyle} {...ff(id)} />
      </div>
    ));
  } else if (def.kind === "status") {
    const st = getStatus();
    const rows = [["state", "Status headline", false], ["detail", "Summary", true], ["progressLabel", "Progress label", false], ["latest", "Latest update", true], ["nextCatalyst", "Next catalyst", false], ["eta", "Expected", false], ["impact", "Investment impact", true]];
    body = rows.map(([k, label, area]) => (
      <div key={k} style={{ marginBottom: 15 }}>
        <label style={eyebrow}>{label}</label>
        {area
          ? <textarea value={st[k] || ""} onChange={(e) => onStatus(k, e.target.value)} style={{ ...inputStyle, minHeight: 58, resize: "vertical" }} {...ff("st-" + k)} />
          : <input value={st[k] || ""} onChange={(e) => onStatus(k, e.target.value)} style={inputStyle} {...ff("st-" + k)} />}
      </div>
    ));
  } else if (def.kind === "scenario") {
    const key = def.scenario;
    const val = key === "next" ? (getStatus("nextCase") || "") : ((getStatus("cases").find((c) => c.key === key) || {}).text || "");
    body = (
      <div>
        <label style={eyebrow}>{def.label} — what this means for investors</label>
        <textarea value={val} onChange={(e) => onScenario(key, e.target.value)} style={{ ...inputStyle, minHeight: 130, resize: "vertical" }} placeholder={`Explain the ${def.label.toLowerCase()}…`} {...ff("ov-" + key)} />
      </div>
    );
  } else if (def.kind === "thesis") {
    const pts = getStatus("thesis") || [];
    body = (
      <div>
        <label style={eyebrow}>Key points — each becomes a line in the thesis</label>
        {pts.map((p, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 9, alignItems: "center" }}>
            <input value={p} onChange={(e) => onThesis(pts.map((x, j) => j === i ? e.target.value : x))} placeholder={`Key point ${i + 1}`} style={{ ...inputStyle, flex: 1 }} {...ff("th-" + i)} />
            <button onClick={() => onThesis(pts.filter((_, j) => j !== i))} title="Remove point" style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 9, border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", color: "#94a3b8", fontSize: 20, lineHeight: 1 }}>−</button>
          </div>
        ))}
        <button onClick={() => onThesis([...pts, ""])} style={{ marginTop: 2, display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13.5, fontWeight: 700, color: "#0f172a", background: "#f1f5f9", border: "none", borderRadius: 10, padding: "10px 15px", cursor: "pointer" }}>+ Add key point</button>
      </div>
    );
  } else if (def.kind === "projects") {
    const list = projects || [];
    const STAGE_OPTS = ["Explore", "Discovery", "Resource", "Studies", "Development", "Production"];
    // snapshot is an OBJECT keyed to what the profile renders (location / commodities / land / targets).
    const blankProject = () => ({ id: "proj-" + Date.now() + "-" + Math.floor(Math.random() * 1e4), enabled: true, name: "", stageIdx: -1, status: "", description: "", snapshot: { location: "", commodities: "", land: "", targets: "" }, gallery: [], map: {} });
    const addProject = () => { const np = blankProject(); setProjects && setProjects((l) => [...(l || []), np]); };
    const patch = (id, p) => setProjects && setProjects((l) => (l || []).map((x) => (x.id === id ? { ...x, ...p } : x)));
    const moveImg = (id, from, to) => setProjects && setProjects((l) => (l || []).map((x) => { if (x.id !== id || from == null || to == null || from === to) return x; const g = ((x.gallery) || []).slice(); const [m] = g.splice(from, 1); g.splice(to, 0, m); return { ...x, gallery: g }; }));
    const patchSnap = (id, key, value) => setProjects && setProjects((l) => (l || []).map((x) => {
      if (x.id !== id) return x;
      const snap = (x.snapshot && !Array.isArray(x.snapshot)) ? x.snapshot : {};
      return { ...x, snapshot: { ...snap, [key]: value } };
    }));
    const patchImg = (id, i, src) => setProjects && setProjects((l) => (l || []).map((x) => {
      if (x.id !== id) return x; const g = (x.gallery && x.gallery.slice()) || []; g[i] = { ...g[i], src }; return { ...x, gallery: g };
    }));
    const addImg = (id) => setProjects && setProjects((l) => (l || []).map((x) => (x.id === id ? { ...x, gallery: [...((x.gallery) || []), { src: "", label: "" }] } : x)));
    const rmImg = (id, i) => setProjects && setProjects((l) => (l || []).map((x) => (x.id === id ? { ...x, gallery: (x.gallery || []).filter((_, j) => j !== i) } : x)));
    // Upload selected/dropped images to Supabase Storage → append the returned
    // URL to the project gallery (no more base64 bloat in the profile jsonb).
    const addFiles = async (id, fileList) => {
      const files = Array.from(fileList || []).filter((f) => f && f.type && f.type.startsWith("image/"));
      for (const f of files) {
        // optimistic placeholder while uploading
        const tmp = "uploading-" + Date.now() + "-" + Math.random().toString(36).slice(2);
        setProjects && setProjects((l) => (l || []).map((x) => (x.id === id ? { ...x, gallery: [...((x.gallery) || []), { src: "", label: f.name, _tmp: tmp, uploading: true }] } : x)));
        try {
          const url = await uploadCompanyMedia(f);
          setProjects && setProjects((l) => (l || []).map((x) => (x.id === id ? { ...x, gallery: (x.gallery || []).map((g) => (g._tmp === tmp ? { src: url, label: f.name } : g)) } : x)));
        } catch (err) {
          setUploadErr && setUploadErr(err.message || "Upload failed");
          setProjects && setProjects((l) => (l || []).map((x) => (x.id === id ? { ...x, gallery: (x.gallery || []).filter((g) => g._tmp !== tmp) } : x)));
        }
      }
    };
    const del = (id) => { setProjects && setProjects((l) => (l || []).filter((x) => x.id !== id)); setOpenId((o) => (o === id ? null : o)); };
    const snapLabels = ["Location / jurisdiction", "Commodity", "Interest", "Past producer", "Concessions", "Deposit type"];
    const miniLabel = { display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 5 };
    const smallInput = { ...inputStyle, padding: "9px 11px", fontSize: 13 };
    const pr = list.find((x) => x.id === openId) || null;
    // Steps match the new Project page: photos → AI brief → the 4 snapshot fields → stage.
    const SUB = [
      { label: "Photos", type: "photos" },
      { label: "AI project brief", type: "brief" },
      { label: "Location", type: "snap", k: "location", ph: "e.g. Parral District, Chihuahua, Mexico" },
      { label: "Commodities", type: "snap", k: "commodities", ph: "e.g. Silver · Gold" },
      { label: "Land Position", type: "snap", k: "land", ph: "e.g. 15 Claims · 845 ha" },
      { label: "Drill Targets", type: "snap", k: "targets", ph: "e.g. 4 Identified" },
      { label: "Project stage", type: "stage" },
    ];
    const patchBrief = (id, k, v) => { const cur = (list.find((x) => x.id === id) || {}).brief || {}; patch(id, { brief: { ...cur, [k]: v } }); };
    body = (
      <div>
        {!pr ? (
          <>
            <p style={{ fontSize: 12.5, color: "#94a3b8", margin: "0 0 14px" }}>Name each project this company holds — just the names here. You'll add photos and details next.</p>
            {list.map((p2, i) => (
              <div key={p2.id} style={{ display: "flex", gap: 8, marginBottom: 9, alignItems: "center" }}>
                <input value={p2.name || ""} onChange={(e) => patch(p2.id, { name: e.target.value })} placeholder={`Project ${i + 1} name`} style={{ ...smallInput, flex: 1 }} {...ff("pj-name-" + p2.id)} />
                <button onClick={() => del(p2.id)} title="Remove project" style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 9, border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", color: "#94a3b8", fontSize: 20, lineHeight: 1 }}>−</button>
              </div>
            ))}
            <button onClick={addProject} style={{ marginTop: 2, display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13.5, fontWeight: 700, color: "#0f172a", background: "#f1f5f9", border: "none", borderRadius: 10, padding: "10px 15px", cursor: "pointer" }}>+ Add project</button>
          </>
        ) : (() => {
          const st = SUB[Math.min(projStep, SUB.length - 1)] || SUB[0];
          const GEO_FP = { map: "pj-geo-district", geology: "pj-geo-geology", drills: "pj-geo-drill", history: "pj-geo-history", nearby: "pj-geo-nearby", infra: "pj-geo-infra" };
          return (
          <>
            <button onClick={() => setOpenId(null)} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 700, color: "#64748b", background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 12 }}><ChevronRight size={14} style={{ transform: "rotate(180deg)" }} /> All projects</button>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 2 }}>
              <p style={{ fontSize: 15.5, fontWeight: 800, color: "#0f172a", margin: 0 }}>{pr.name || "Project"}{list.length > 1 ? <span style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8" }}>  ·  Project {list.findIndex((x) => x.id === pr.id) + 1} of {list.length}</span> : null}</p>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8" }}>{projStep + 1} / {SUB.length}</span>
            </div>
            <label style={{ ...eyebrow, marginBottom: 12, display: "block" }}>{st.label}</label>

            {st.type === "photos" && (<>
              <label
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = "#10b981"; e.currentTarget.style.background = "rgba(16,185,129,0.06)"; }}
                onDragLeave={(e) => { e.currentTarget.style.borderColor = "#cbd5e1"; e.currentTarget.style.background = "#fff"; }}
                onDrop={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = "#cbd5e1"; e.currentTarget.style.background = "#fff"; if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) addFiles(pr.id, e.dataTransfer.files); }}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, aspectRatio: "1 / 0.8", border: "2px dashed #cbd5e1", borderRadius: 16, cursor: "pointer", background: "#fff", transition: "border-color .15s, background .15s" }}>
                <input type="file" accept="image/*" multiple onChange={(e) => { addFiles(pr.id, e.target.files); e.target.value = ""; }} style={{ display: "none" }} />
                <span style={{ display: "grid", placeItems: "center", width: 52, height: 52, borderRadius: 16, background: "#f1f5f9", pointerEvents: "none" }}><ImageIcon size={26} style={{ color: "#94a3b8" }} /></span>
                <span style={{ fontSize: 15, fontWeight: 800, color: "#334155", pointerEvents: "none" }}>Drag &amp; drop photos, or <span style={{ color: "#10b981" }}>browse</span></span>
                <span style={{ fontSize: 12, color: "#cbd5e1", pointerEvents: "none" }}>Tap to select · they upload straight to the carousel</span>
              </label>
              {uploadErr && <p style={{ fontSize: 12, fontWeight: 600, color: "#e11d48", margin: "8px 0 0" }}>{uploadErr}</p>}
              {((pr.gallery) || []).length > 0 && (<>
                <p style={{ fontSize: 12, color: "#94a3b8", margin: "14px 0 8px" }}>Drag the photos to reorder them in the carousel.</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {((pr.gallery) || []).map((g, gi) => (
                    <div key={gi} draggable
                      onDragStart={() => setDragIdx(gi)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => { moveImg(pr.id, dragIdx, gi); setDragIdx(null); }}
                      onDragEnd={() => setDragIdx(null)}
                      style={{ position: "relative", aspectRatio: "1", borderRadius: 10, overflow: "hidden", border: dragIdx === gi ? "2px solid #10b981" : "1px solid #e2e8f0", background: "#f8fafc", cursor: "grab", opacity: dragIdx === gi ? 0.6 : 1 }}>
                      {g.src ? <img src={g.src} alt={g.label || ""} draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} /> : <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center" }}><ImageIcon size={18} style={{ color: "#cbd5e1" }} /></div>}
                      <button onClick={() => rmImg(pr.id, gi)} title="Remove photo" style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: 999, border: "none", background: "rgba(15,23,42,0.7)", color: "#fff", cursor: "pointer", display: "grid", placeItems: "center", fontSize: 13, lineHeight: 1 }}>×</button>
                    </div>
                  ))}
                </div>
              </>)}
            </>)}

            {st.type === "brief" && (<>
              <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 12px" }}>The plain-English brief shown in this project's AI card.</p>
              <div style={{ marginBottom: 12 }}><label style={miniLabel}>What this project is</label><textarea value={(pr.brief && pr.brief.what) || pr.description || ""} onChange={(e) => patchBrief(pr.id, "what", e.target.value)} placeholder="e.g. A high-grade silver-gold project in a historic district." style={{ ...smallInput, minHeight: 58, resize: "vertical" }} /></div>
              <div style={{ marginBottom: 12 }}><label style={miniLabel}>What the company is exploring for</label><textarea value={(pr.brief && pr.brief.exploring) || ""} onChange={(e) => patchBrief(pr.id, "exploring", e.target.value)} placeholder="e.g. Continuity of high-grade veins at depth." style={{ ...smallInput, minHeight: 58, resize: "vertical" }} /></div>
              <div><label style={miniLabel}>Why it matters / current focus</label><textarea value={(pr.brief && pr.brief.focus) || ""} onChange={(e) => patchBrief(pr.id, "focus", e.target.value)} placeholder="e.g. Assays from the current program could support a maiden resource." style={{ ...smallInput, minHeight: 58, resize: "vertical" }} /></div>
            </>)}

            {st.type === "snap" && (
              <div><label style={miniLabel}>{st.label}</label><input value={(pr.snapshot && !Array.isArray(pr.snapshot) && pr.snapshot[st.k]) || ""} onChange={(e) => patchSnap(pr.id, st.k, e.target.value)} placeholder={st.ph} style={smallInput} {...ff("pj-snap-" + st.k + "-" + pr.id)} /></div>
            )}

            {st.type === "stage" && (<>
              <div><label style={miniLabel}>Stage</label><select value={typeof pr.stageIdx === "number" ? pr.stageIdx : -1} onChange={(e) => patch(pr.id, { stageIdx: parseInt(e.target.value, 10) })} style={{ ...smallInput, appearance: "auto" }} {...ff("pj-stage-" + pr.id)}><option value={-1}>Not set</option>{STAGE_OPTS.map((s, si) => <option key={si} value={si}>{s}</option>)}</select></div>
              <div style={{ marginTop: 12 }}><label style={miniLabel}>Status</label><input value={pr.status || ""} onChange={(e) => patch(pr.id, { status: e.target.value })} placeholder="e.g. Active drilling" style={smallInput} {...ff("pj-status-" + pr.id)} /></div>
            </>)}

            {st.type === "geo" && (<>
              <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 12px" }}>These notes show in each tile's detail card on the published profile.</p>
              <div><label style={miniLabel}>{st.label}</label><textarea value={(pr.geo && pr.geo[st.k]) || ""} onChange={(e) => patch(pr.id, { geo: { ...(pr.geo || {}), [st.k]: e.target.value } })} placeholder={`Notes on ${st.label.toLowerCase()}…`} style={{ ...smallInput, minHeight: 100, resize: "vertical" }} {...ff(GEO_FP[st.k])} /></div>
            </>)}

            {st.type === "unique" && (<>
              <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 12px" }}>The differentiator shown in the "What makes this project unique" card.</p>
              <div><label style={miniLabel}>What makes this project unique</label><textarea value={pr.unique || ""} onChange={(e) => patch(pr.id, { unique: e.target.value })} placeholder="e.g. District-scale land package over a historic high-grade system, fully permitted and drill-ready." style={{ ...smallInput, minHeight: 110, resize: "vertical" }} {...ff("pj-unique")} /></div>
            </>)}
          </>
          );
        })()}
      </div>
    );
  } else if (def.kind === "timeline") {
    const list = timeline || [];
    const CATS = ["Discovery", "Drilling", "Financing", "Permitting", "Infrastructure", "Acquisition", "Resource Growth", "Exploration", "Corporate"];
    const today = new Date().toISOString().slice(0, 10);
    const blank = () => ({ id: "tl-" + Date.now() + "-" + Math.floor(Math.random() * 1e4), title: "", date: today, category: "Exploration", summary: "", url: "", key: true });
    const add = () => { const n = blank(); setTimeline && setTimeline((l) => [...(l || []), n]); setOpenId(n.id); };
    const patch = (id, p) => setTimeline && setTimeline((l) => (l || []).map((x) => (x.id === id ? { ...x, ...p } : x)));
    const del = (id) => { setTimeline && setTimeline((l) => (l || []).filter((x) => x.id !== id)); setOpenId((o) => (o === id ? null : o)); };
    const miniLabel = { display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 5 };
    const smallInput = { ...inputStyle, padding: "9px 11px", fontSize: 13 };
    body = (
      <div>
        <p style={{ fontSize: 12.5, color: "#94a3b8", margin: "0 0 14px" }}>Add press releases and milestones. They group by year automatically in the preview.</p>
        {list.length === 0 && (
          <div style={{ border: "1px dashed #cbd5e1", borderRadius: 12, padding: "22px 16px", textAlign: "center", marginBottom: 14 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", margin: 0 }}>No updates yet</p>
            <p style={{ fontSize: 12, color: "#cbd5e1", margin: "4px 0 0" }}>Add the first update to start the timeline.</p>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {list.map((u, i) => {
            const isOpen = openId === u.id;
            return (
              <div key={u.id} style={{ border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 12px", background: isOpen ? "rgba(37,99,235,0.05)" : "#fff" }}>
                  <button onClick={() => setOpenId(isOpen ? null : u.id)} style={{ flex: 1, minWidth: 0, textAlign: "left", border: "none", background: "transparent", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 8 }}>
                    {u.key && <Gem size={12} style={{ color: "#2563eb", flexShrink: 0 }} />}
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.title || `Update ${i + 1}`}</span>
                    <ChevronRight size={15} style={{ color: "#94a3b8", flexShrink: 0, transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
                  </button>
                  <button onClick={() => del(u.id)} title="Delete update" style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 8, border: "1px solid #fecaca", background: "#fff", cursor: "pointer", color: "#ef4444", display: "grid", placeItems: "center" }}><Trash2 size={15} /></button>
                </div>
                {isOpen && (
                  <div style={{ padding: "4px 12px 14px", borderTop: "1px solid #eef2f6" }}>
                    <div style={{ marginTop: 12 }}>
                      <label style={miniLabel}>Title</label>
                      <input value={u.title || ""} onChange={(e) => patch(u.id, { title: e.target.value })} placeholder="e.g. Closes financing" style={smallInput} {...ff("tl-title-" + u.id)} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
                      <div>
                        <label style={miniLabel}>Date</label>
                        <input type="date" value={u.date || ""} onChange={(e) => patch(u.id, { date: e.target.value })} style={{ ...smallInput, appearance: "auto" }} {...ff("tl-date-" + u.id)} />
                      </div>
                      <div>
                        <label style={miniLabel}>Category</label>
                        <select value={u.category || "Exploration"} onChange={(e) => patch(u.id, { category: e.target.value })} style={{ ...smallInput, appearance: "auto" }} {...ff("tl-cat-" + u.id)}>
                          {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <label style={miniLabel}>Short summary <span style={{ fontWeight: 600, color: "#cbd5e1" }}>· optional</span></label>
                      <textarea value={u.summary || ""} onChange={(e) => patch(u.id, { summary: e.target.value })} placeholder="Why this matters, in a sentence." style={{ ...smallInput, minHeight: 58, resize: "vertical" }} {...ff("tl-sum-" + u.id)} />
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <label style={miniLabel}>Source URL <span style={{ fontWeight: 600, color: "#cbd5e1" }}>· optional</span></label>
                      <input value={u.url || ""} onChange={(e) => patch(u.id, { url: e.target.value })} placeholder="https://…" style={smallInput} {...ff("tl-url-" + u.id)} />
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 14, cursor: "pointer" }}>
                      <input type="checkbox" checked={!!u.key} onChange={(e) => patch(u.id, { key: e.target.checked })} style={{ width: 16, height: 16, accentColor: "#2563eb", cursor: "pointer" }} />
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: "#334155" }}>Key milestone (shows in highlights)</span>
                    </label>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <button onClick={add} style={{ marginTop: 14, width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 14, fontWeight: 700, color: "#fff", background: "#2563eb", border: "none", borderRadius: 11, padding: "12px 16px", cursor: "pointer" }}>+ Add update</button>
      </div>
    );
  } else if (def.kind === "team") {
    const list = team || [];
    const blank = () => ({ id: "tm-" + Date.now() + "-" + Math.floor(Math.random() * 1e4), name: "", role: "", short: "", full: "", photo: "", linkedin: "", t: "" });
    const add = () => { const n = blank(); setTeam && setTeam((l) => [...(l || []), n]); setOpenId(n.id); };
    const patch = (id, p) => setTeam && setTeam((l) => (l || []).map((x) => (x.id === id ? { ...x, ...p } : x)));
    const del = (id) => { setTeam && setTeam((l) => (l || []).filter((x) => x.id !== id)); setOpenId((o) => (o === id ? null : o)); };
    const miniLabel = { display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 5 };
    const smallInput = { ...inputStyle, padding: "9px 11px", fontSize: 13 };
    body = (
      <div>
        <p style={{ fontSize: 12.5, color: "#94a3b8", margin: "0 0 14px" }}>Add board members and management. The first person listed is featured as the lead.</p>
        {list.length === 0 && (
          <div style={{ border: "1px dashed #cbd5e1", borderRadius: 12, padding: "22px 16px", textAlign: "center", marginBottom: 14 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", margin: 0 }}>No team members yet</p>
            <p style={{ fontSize: 12, color: "#cbd5e1", margin: "4px 0 0" }}>Add the first person to start this section.</p>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {list.map((m, i) => {
            const isOpen = openId === m.id;
            return (
              <div key={m.id} style={{ border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 12px", background: isOpen ? "rgba(30,58,138,0.05)" : "#fff" }}>
                  <button onClick={() => setOpenId(isOpen ? null : m.id)} style={{ flex: 1, minWidth: 0, textAlign: "left", border: "none", background: "transparent", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name || `Member ${i + 1}`}</span>
                    {i === 0 && <span style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", color: "#64748b", background: "#f1f5f9", borderRadius: 5, padding: "2px 5px", flexShrink: 0 }}>Lead</span>}
                    <ChevronRight size={15} style={{ color: "#94a3b8", flexShrink: 0, transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
                  </button>
                  <button onClick={() => del(m.id)} title="Delete member" style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 8, border: "1px solid #fecaca", background: "#fff", cursor: "pointer", color: "#ef4444", display: "grid", placeItems: "center" }}><Trash2 size={15} /></button>
                </div>
                {isOpen && (
                  <div style={{ padding: "4px 12px 14px", borderTop: "1px solid #eef2f6" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
                      <div>
                        <label style={miniLabel}>Name</label>
                        <input value={m.name || ""} onChange={(e) => patch(m.id, { name: e.target.value })} placeholder="Full name" style={smallInput} {...ff("tm-name-" + m.id)} />
                      </div>
                      <div>
                        <label style={miniLabel}>Role / title</label>
                        <input value={m.role || ""} onChange={(e) => patch(m.id, { role: e.target.value })} placeholder="e.g. CEO & Director" style={smallInput} {...ff("tm-role-" + m.id)} />
                      </div>
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <label style={miniLabel}>Short bio</label>
                      <textarea value={m.short || ""} onChange={(e) => patch(m.id, { short: e.target.value })} placeholder="A sentence or two on background and experience." style={{ ...smallInput, minHeight: 62, resize: "vertical" }} {...ff("tm-short-" + m.id)} />
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <label style={miniLabel}>Headshot URL <span style={{ fontWeight: 600, color: "#cbd5e1" }}>· optional (upload coming later)</span></label>
                      <input value={m.photo || ""} onChange={(e) => patch(m.id, { photo: e.target.value })} placeholder="https://…" style={smallInput} {...ff("tm-photo-" + m.id)} />
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <label style={miniLabel}>LinkedIn URL <span style={{ fontWeight: 600, color: "#cbd5e1" }}>· optional</span></label>
                      <input value={m.linkedin || ""} onChange={(e) => patch(m.id, { linkedin: e.target.value })} placeholder="https://linkedin.com/in/…" style={smallInput} {...ff("tm-li-" + m.id)} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <button onClick={add} style={{ marginTop: 14, width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 14, fontWeight: 700, color: "#fff", background: "#1e3a8a", border: "none", borderRadius: 11, padding: "12px 16px", cursor: "pointer" }}>+ Add team member</button>
      </div>
    );
  } else if (def.kind === "company") {
    const c = company || {};
    const listings = c.listings || [];
    const STAGE_OPTS = ["Explore", "Discovery", "Resource", "Studies", "Development", "Production"];
    const set = (patch) => setCompany && setCompany(patch);
    const setListings = (l) => setCompany && setCompany({ listings: l });
    const addListing = () => setListings([...listings, { ex: "", sym: "" }]);
    const patchListing = (i, p) => setListings(listings.map((x, j) => (j === i ? { ...x, ...p } : x)));
    const rmListing = (i) => setListings(listings.filter((_, j) => j !== i));
    const miniLabel = { display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 5 };
    const smallInput = { ...inputStyle, padding: "9px 11px", fontSize: 13 };
    const fld = (id, label, ph, area, opts) => (
      <div style={{ marginBottom: 13 }}>
        <label style={miniLabel}>{label}</label>
        {opts
          ? <select value={c[id] || ""} onChange={(e) => set({ [id]: e.target.value })} style={{ ...smallInput, appearance: "auto" }} {...ff("co-" + id)}><option value="">Not set</option>{opts.map((o) => <option key={o} value={o}>{o}</option>)}</select>
          : area
            ? <textarea value={c[id] || ""} onChange={(e) => set({ [id]: e.target.value })} placeholder={ph} style={{ ...smallInput, minHeight: 58, resize: "vertical" }} {...ff("co-" + id)} />
            : <input value={c[id] || ""} onChange={(e) => set({ [id]: e.target.value })} placeholder={ph} style={smallInput} {...ff("co-" + id)} />}
      </div>
    );
    body = spot === "co" ? (
      <div>
        <p style={{ fontSize: 12.5, color: "#94a3b8", margin: "0 0 14px" }}>Your company's name, website, and slogan. Everything else has its own step.</p>
        <label style={eyebrow}>Identity</label>
        {fld("name", "Company name", "e.g. Northern Star Mining")}
        {fld("website", "Website", "e.g. northernstar.com")}
        {fld("slogan", "Slogan", "A short one-line descriptor")}
      </div>
    ) : (
      <div>
        <p style={{ fontSize: 12.5, color: "#94a3b8", margin: "0 0 14px" }}>Add the company's stock listing(s). Enter the exchange and ticker — add more if it trades on multiple exchanges.</p>
        <label style={{ ...eyebrow }}>Listings <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 600, color: "#cbd5e1" }}>· price auto-connects (demo)</span></label>
        {listings.length === 0 && <p style={{ fontSize: 12, color: "#cbd5e1", margin: "-2px 0 10px" }}>Add a listing — enter the exchange and ticker.</p>}
        {listings.map((l, i) => {
          const sym = (l.sym || "").toUpperCase(); let h = 0; for (let k = 0; k < sym.length; k++) h = (h * 31 + sym.charCodeAt(k)) & 0xffff;
          const ex = (l.ex || "").toUpperCase(); const sign = /OTC|NASDAQ|NYSE|US/.test(ex) ? "US$" : /FSE|XETRA|FRA|EUR/.test(ex) ? "€" : "C$";
          const price = sym ? sign + (0.05 + (h % 250) / 100).toFixed(2) : "";
          return (
          <div key={i} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={l.ex || ""} onChange={(e) => patchListing(i, { ex: e.target.value })} placeholder="Exchange (e.g. TSX.V)" style={{ ...smallInput, flex: 1 }} />
              <input value={l.sym || ""} onChange={(e) => patchListing(i, { sym: e.target.value })} placeholder="Ticker (e.g. KNG)" style={{ ...smallInput, flex: 1 }} />
              <button onClick={() => rmListing(i)} title="Remove listing" style={{ width: 36, flexShrink: 0, borderRadius: 9, border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", color: "#94a3b8", fontSize: 18 }}>−</button>
            </div>
            {price && <p style={{ fontSize: 11.5, fontWeight: 700, color: "#2563eb", margin: "5px 0 0 2px" }}>● Live price {price} <span style={{ fontWeight: 600, color: "#cbd5e1" }}>· delayed 15 min (demo)</span></p>}
          </div>
          );
        })}
        <button onClick={addListing} style={{ fontSize: 12.5, fontWeight: 700, color: "#0f172a", background: "#f1f5f9", border: "none", borderRadius: 9, padding: "8px 13px", cursor: "pointer", marginBottom: 4 }}>+ Add listing</button>
      </div>
    );
  } else if (def.kind === "companyStatus") {
    const s = companyStatus || {};
    const pb = s.progressBar || {};
    const setPB = (patch) => setCompanyStatus && setCompanyStatus({ progressBar: { ...pb, ...patch } });
    const miniLabel = { display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 5 };
    const smallInput = { ...inputStyle, padding: "9px 11px", fontSize: 13 };
    // Percentage is always computed, never editable.
    const pbCurrent = pb.current === "" || pb.current == null ? null : Number(pb.current);
    const pbTotal = pb.total === "" || pb.total == null ? null : Number(pb.total);
    const pbPct = pbCurrent != null && pbTotal != null && pbTotal > 0 ? Math.max(0, Math.min(100, Math.round((pbCurrent / pbTotal) * 100))) : null;
    // AI confidence review (editor-only). `edited` = the value diverged from the
    // AI's autofilled baseline; the review object itself is never erased by edits.
    const reviewOf = (key) => (companyStatusReview && companyStatusReview[key]) || null;
    const editedOf = (key) => {
      if (!companyStatusAI) return false;
      if (key === "progressBar") return JSON.stringify(s.progressBar || {}) !== JSON.stringify(companyStatusAI.progressBar || {});
      return (s[key] || "") !== (companyStatusAI[key] || "");
    };
    // Field order is fixed by spec. Each maps 1:1 to a companyStatus key; ff() links
    // the input to the matching card element so focusing spotlights it live.
    const txt = (key, label, area, fp, ph) => (
      <div style={{ marginBottom: 15 }}>
        <label style={eyebrow}>{label}</label>
        {area
          ? <textarea value={s[key] || ""} onChange={(e) => setCompanyStatus && setCompanyStatus({ [key]: e.target.value })} placeholder={ph} style={{ ...inputStyle, minHeight: 58, resize: "vertical" }} {...ff(fp)} />
          : <input value={s[key] || ""} onChange={(e) => setCompanyStatus && setCompanyStatus({ [key]: e.target.value })} placeholder={ph} style={inputStyle} {...ff(fp)} />}
        <StatusReviewNote review={reviewOf(key)} edited={editedOf(key)} />
      </div>
    );
    body = (
      <div>
        <p style={{ fontSize: 12.5, color: "#94a3b8", margin: "0 0 16px" }}>Everything shown on the status card, edited here. Changes update the preview instantly.</p>
        {txt("statusHeadline", "Status Headline", false, "st-state", "e.g. Drilling Underway · Assays Pending")}
        {txt("statusHeadlineSubtext", "Status Headline Subtext", true, "st-detail", "One-line summary of where the company stands.")}
        {txt("latestUpdate", "Latest Update", true, "st-latest", "Most recent development.")}
        {txt("nextCatalyst", "Next Catalyst", false, "st-nextCatalyst", "e.g. Maiden assay batch")}
        {txt("expected", "Expected", false, "st-eta", "e.g. Q2 2026")}
        {txt("investmentImpact", "Investment Impact", true, "st-impact", "Why it matters for investors.")}

        <div style={{ marginTop: 4, borderTop: "1px solid #eef2f6", paddingTop: 16 }}>
          <button onClick={() => setPbOpen((v) => !v)}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", padding: 0, cursor: "pointer" }}>
            <span style={eyebrow}>Progress Bar</span>
            <ChevronDown size={16} style={{ color: "#94a3b8", transform: pbOpen ? "rotate(180deg)" : "none", transition: "transform .2s ease" }} />
          </button>
          {pbOpen && (
            <div style={{ marginTop: 12 }}>
              <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", marginBottom: 14 }}>
                <span style={miniLabel}>Show Progress Bar</span>
                <button onClick={() => setPB({ enabled: !pb.enabled })} role="switch" aria-checked={!!pb.enabled}
                  style={{ position: "relative", width: 42, height: 24, borderRadius: 999, border: "none", cursor: "pointer", flexShrink: 0, background: pb.enabled ? "#10b981" : "#e2e8f0", transition: "background .16s" }}>
                  <span style={{ position: "absolute", top: 3, left: pb.enabled ? 21 : 3, width: 18, height: 18, borderRadius: 999, background: "#fff", boxShadow: "0 1px 3px rgba(15,23,42,0.3)", transition: "left .16s" }} />
                </button>
              </label>
              <div style={{ marginBottom: 13 }}>
                <label style={miniLabel}>Progress Label</label>
                <input value={pb.label || ""} onChange={(e) => setPB({ label: e.target.value })} placeholder="e.g. 2026 Drill Program" style={smallInput} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={{ marginBottom: 13 }}>
                  <label style={miniLabel}>Current Value</label>
                  <input type="number" value={pb.current == null ? "" : pb.current} onChange={(e) => setPB({ current: e.target.value === "" ? null : Number(e.target.value) })} placeholder="e.g. 14" style={smallInput} />
                </div>
                <div style={{ marginBottom: 13 }}>
                  <label style={miniLabel}>Total Value</label>
                  <input type="number" value={pb.total == null ? "" : pb.total} onChange={(e) => setPB({ total: e.target.value === "" ? null : Number(e.target.value) })} placeholder="e.g. 26" style={smallInput} />
                </div>
              </div>
              <div style={{ marginBottom: 13 }}>
                <label style={miniLabel}>Unit</label>
                <input value={pb.unit || ""} onChange={(e) => setPB({ unit: e.target.value })} placeholder="e.g. holes" style={smallInput} />
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f8fafc", border: "1px solid #eef2f6", borderRadius: 10, padding: "10px 13px" }}>
                <span style={miniLabel}>Percentage <span style={{ fontWeight: 600, color: "#cbd5e1" }}>· auto-calculated</span></span>
                <span style={{ fontSize: 15, fontWeight: 800, color: pbPct == null ? "#cbd5e1" : "#0f9b73" }}>{pbPct == null ? "—" : pbPct + "%"}</span>
              </div>
              <StatusReviewNote review={reviewOf("progressBar")} edited={editedOf("progressBar")} />
            </div>
          )}
        </div>
      </div>
    );
  } else if (def.kind === "companyBrief") {
    const b = companyBrief || {};
    const kp = Array.isArray(b.keyPoints) ? b.keyPoints : [];
    const miniLabel = { display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 5 };
    const smallInput = { ...inputStyle, padding: "9px 11px", fontSize: 13 };
    const reviewOf = (key) => (companyBriefReview && companyBriefReview[key]) || null;
    const editedOf = (key) => {
      if (!companyBriefAI) return false;
      if (key === "keyPoints") return JSON.stringify(kp) !== JSON.stringify(companyBriefAI.keyPoints || []);
      return (b[key] || "") !== (companyBriefAI[key] || "");
    };
    const setKP = (arr) => setCompanyBrief && setCompanyBrief({ keyPoints: arr });
    const txt = (key, label, area, ph) => (
      <div style={{ marginBottom: 15 }}>
        <label style={eyebrow}>{label}</label>
        {area
          ? <textarea value={b[key] || ""} onChange={(e) => setCompanyBrief && setCompanyBrief({ [key]: e.target.value })} placeholder={ph} style={{ ...inputStyle, minHeight: 64, resize: "vertical" }} {...ff("ov-brief")} />
          : <input value={b[key] || ""} onChange={(e) => setCompanyBrief && setCompanyBrief({ [key]: e.target.value })} placeholder={ph} style={inputStyle} {...ff("ov-brief")} />}
        <StatusReviewNote review={reviewOf(key)} edited={editedOf(key)} />
      </div>
    );
    body = (
      <div>
        <p style={{ fontSize: 12.5, color: "#94a3b8", margin: "0 0 16px" }}>A plain-language description of the company. Describe what the company is — not the investment case.</p>
        {txt("headline", "Headline", false, "e.g. Silver-Gold Explorer in Mexico")}
        {txt("shortSummary", "Short Summary", true, "One sentence describing the company (max ~25 words).")}
        {txt("businessDescription", "Business Description", true, "What the company does — commodity, jurisdiction, projects, stage (max ~90 words).")}
        <div style={{ marginBottom: 6 }}>
          <label style={eyebrow}>Key Points <span style={{ fontWeight: 700, color: "#cbd5e1" }}>· up to 5</span></label>
          {kp.map((p, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 9, alignItems: "center" }}>
              <input value={p} onChange={(e) => setKP(kp.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Key point ${i + 1}`} style={{ ...smallInput, flex: 1 }} {...ff("ov-brief")} />
              <button onClick={() => setKP(kp.filter((_, j) => j !== i))} title="Remove key point" style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 9, border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", color: "#94a3b8", fontSize: 20, lineHeight: 1 }}>−</button>
            </div>
          ))}
          {kp.length < 5 && (
            <button onClick={() => setKP([...kp, ""])} style={{ marginTop: 2, display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13.5, fontWeight: 700, color: "#0f172a", background: "#f1f5f9", border: "none", borderRadius: 10, padding: "10px 15px", cursor: "pointer" }}>+ Add key point</button>
          )}
          <StatusReviewNote review={reviewOf("keyPoints")} edited={editedOf("keyPoints")} />
        </div>
      </div>
    );
  } else if (def.kind === "capital") {
    const c = capital || {};
    const set = (patch) => setCapital && setCapital(patch);
    const miniLabel = { display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 5 };
    const smallInput = { ...inputStyle, padding: "9px 11px", fontSize: 13 };
    const fld = (id, label, ph, area) => (
      <div style={{ marginBottom: 13 }}>
        <label style={miniLabel}>{label}</label>
        {area
          ? <textarea value={c[id] || ""} onChange={(e) => set({ [id]: e.target.value })} placeholder={ph} style={{ ...smallInput, minHeight: 58, resize: "vertical" }} {...ff("cp-" + id)} />
          : <input value={c[id] || ""} onChange={(e) => set({ [id]: e.target.value })} placeholder={ph} style={smallInput} {...ff("cp-" + id)} />}
      </div>
    );
    const capSec = { "cp-status": "status", "cp-aisummary": "aisummary", "cp-mktcap": "mktcap", "cp-cash": "cash", "cp-wc": "cash", "cp-basic": "basic", "cp-fd": "fd", "cp-shares": "shares", "cp-fin": "financing", "cp-findetails": "findetails", "cp-insider": "ownership" }[spot] || "status";
    const SEC_INTRO = { status: "The capital status card shown at the top of the Capital page.", aisummary: "The plain-English AI read on this company's capital structure.", mktcap: "Current market capitalization.", cash: "Cash on hand (or working capital).", basic: "Basic shares outstanding.", fd: "Fully diluted share count.", shares: "Warrants, options, and other dilutive instruments.", financing: "The most recent financing.", findetails: "Secondary financial metrics.", ownership: "Who owns the company — insider and institutional ownership." };
    body = (
      <div>
        <p style={{ fontSize: 12.5, color: "#94a3b8", margin: "0 0 14px" }}>{SEC_INTRO[capSec]}</p>

        {capSec === "status" && (<>
          <label style={eyebrow}>Capital status card</label>
          {fld("headline", "Capital header", "e.g. Fully Funded Through 2026")}
          {fld("subtext", "Header subtext", "e.g. The C$13M February deal funds the 2026 program.", true)}
          <div style={{ marginBottom: 13, marginTop: 2 }}>
            <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
              <span style={miniLabel}>Show progress bar</span>
              <button onClick={() => set({ progressEnabled: !c.progressEnabled })} role="switch" aria-checked={!!c.progressEnabled}
                style={{ position: "relative", width: 42, height: 24, borderRadius: 999, border: "none", cursor: "pointer", flexShrink: 0, background: c.progressEnabled ? "#2563eb" : "#e2e8f0", transition: "background .16s" }}>
                <span style={{ position: "absolute", top: 3, left: c.progressEnabled ? 21 : 3, width: 18, height: 18, borderRadius: 999, background: "#fff", boxShadow: "0 1px 3px rgba(15,23,42,0.3)", transition: "left .16s" }} />
              </button>
            </label>
          </div>
          {c.progressEnabled && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {fld("progressLeft", "Left label", "e.g. Today")}
                {fld("progressRight", "Right label", "e.g. Through 2026")}
                {fld("progressCurrent", "Current value", "e.g. 8")}
                {fld("progressTotal", "Total value", "e.g. 12")}
              </div>
              <p style={{ fontSize: 11, color: "#cbd5e1", margin: "-2px 0 12px" }}>Progress % is calculated from current ÷ total. Leave the bar off to hide it.</p>
            </>
          )}
        </>)}

        {capSec === "aisummary" && (<>
          <label style={eyebrow}>AI capital summary</label>
          {fld("aiSummary", "Plain-English capital read", "e.g. The company is fully funded through 2026 following a C$13M bought deal, with a tight share structure and insider alignment.", true)}
        </>)}

        {capSec === "mktcap" && (<><label style={eyebrow}>Market cap</label>{fld("marketCap", "Market capitalization", "e.g. C$25M")}</>)}
        {capSec === "cash" && (<><label style={eyebrow}>Cash</label>{fld("cash", "Cash on hand", "e.g. C$5.2M")}</>)}
        {capSec === "basic" && (<><label style={eyebrow}>Basic shares</label>{fld("outstanding", "Shares outstanding", "e.g. 45M")}</>)}
        {capSec === "fd" && (<><label style={eyebrow}>Fully diluted</label>{fld("fd", "Fully diluted shares", "e.g. 58M")}</>)}

        {capSec === "shares" && (<>
          <label style={eyebrow}>Share structure</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {fld("warrants", "Warrants", "e.g. 8M")}
            {fld("options", "Options", "e.g. 5M")}
          </div>
        </>)}

        {capSec === "financing" && (<>
          <label style={eyebrow}>Latest financing</label>
          {fld("financing", "Recent financing", "e.g. C$13M bought deal closed Feb 2026 at C$0.25.", true)}
        </>)}

        {capSec === "findetails" && (<>
          <label style={eyebrow}>Financial details</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {fld("ev", "Enterprise value", "e.g. C$20M")}
            {fld("workingCapital", "Working capital", "e.g. C$5M")}
            {fld("debt", "Debt", "e.g. C$0")}
            {fld("sharePrice", "Share price", "e.g. C$0.30")}
          </div>
        </>)}

        {capSec === "ownership" && (<>
          <label style={eyebrow}>Ownership</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {fld("insiderOwn", "Insider ownership", "e.g. 24%")}
            {fld("institutionalOwn", "Institutional ownership", "e.g. 15%")}
          </div>
          {fld("ownership", "Ownership summary", "e.g. Management and insiders hold ≈24%, keeping alignment with shareholders.", true)}
        </>)}
      </div>
    );
  } else {
    body = (
      <div>
        <label style={eyebrow}>{def.label}</label>
        <textarea value={getVal(def.field)} onChange={(e) => onText(def.field, e.target.value)} style={{ ...inputStyle, minHeight: 120, resize: "vertical" }} placeholder={`Edit the ${def.label.toLowerCase()} content…`} {...ff(spot)} />
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ marginBottom: 18 }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".16em", textTransform: "uppercase", color: "#10b981" }}>{idx >= 0 ? `Step ${idx + 1} of ${total}` : "Edit"}</span>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", margin: "5px 0 0", letterSpacing: "-.01em" }}>{def.label}</h2>
        <p style={{ fontSize: 12.5, color: "#94a3b8", marginTop: 5 }}>Edit below — the preview updates live. Or click any dimmed section to jump there.</p>
      </div>
      <div style={{ flex: 1, overflowY: "auto", paddingRight: 2 }}>{body}</div>
      {(() => {
        const pjList = projects || [];
        const projOpen = def.kind === "projects" && openId != null;
        const PROJ_SPOTS = ["pj-carousel", "pj-brief", "pj-snap-0", "pj-snap-1", "pj-snap-2", "pj-snap-3", "pj-stage"];
        const projLast = PROJ_SPOTS.length - 1; // 6 (Project stage)
        const pIdx = pjList.findIndex((x) => x.id === openId);
        // Navigate by spot so the preview spotlight follows each tile (useEffect syncs projStep).
        const handleNext = () => {
          if (def.kind === "projects") {
            if (openId == null) { const f = pjList[0]; if (f) { setOpenId(f.id); onGotoSpot(PROJ_SPOTS[0]); return; } }
            else if (projStep < projLast) { onGotoSpot(PROJ_SPOTS[projStep + 1]); return; }
            else { const nx = pjList[pIdx + 1]; if (nx) { setOpenId(nx.id); onGotoSpot(PROJ_SPOTS[0]); return; } setOpenId(null); setProjStep(0); onNext(); return; }
          }
          onNext();
        };
        const handlePrev = () => {
          if (def.kind === "projects" && openId != null) {
            if (projStep > 0) { onGotoSpot(PROJ_SPOTS[projStep - 1]); return; }
            const pv = pjList[pIdx - 1]; if (pv) { setOpenId(pv.id); onGotoSpot(PROJ_SPOTS[projLast]); return; }
            setOpenId(null); onGotoSpot("pj-header"); return;
          }
          onPrev();
        };
        const moreProjects = projOpen && pjList[pIdx + 1];
        // Capital sub-section wizard (spans kinds — Listings is a company editor).
        // New Capital page order: Latest Financing → Cash → Basic → Fully Diluted →
        // Share Structure → Ownership → Balance Sheet (+ Listings). Market Cap and the
        // old capital status card were dropped in the new layout.
        const CAP_SPOTS = ["cp-fin", "cp-cash", "cp-basic", "cp-fd", "cp-shares", "cp-insider", "cp-findetails", "cp-listings"];
        const capSpotNorm = (spot === "cp-wc") ? "cp-cash" : (spot === "cp-mktcap" ? "cp-mktcap" : spot);
        const capIdx = CAP_SPOTS.indexOf(capSpotNorm);
        const inCap = capIdx >= 0;
        const origNext = handleNext, origPrev = handlePrev;
        const handleNext2 = () => {
          if (inCap) { if (capIdx < CAP_SPOTS.length - 1) { onGotoSpot(CAP_SPOTS[capIdx + 1]); return; } onNext(); return; }
          origNext();
        };
        const handlePrev2 = () => {
          if (inCap) { if (capIdx > 0) { onGotoSpot(CAP_SPOTS[capIdx - 1]); return; } onPrev(); return; }
          origPrev();
        };
        const capMore = inCap && capIdx < CAP_SPOTS.length - 1;
        const prevDisabled = first && !projOpen && !(inCap && capIdx > 0);
        const nextLabel = projOpen ? (projStep < projLast ? "Next section" : (moreProjects ? "Next project →" : "Done · projects")) : (capMore ? "Next section" : (last ? "Done" : "Next"));
        return (
          <div style={{ paddingTop: 16, marginTop: 8, borderTop: "1px solid #eef2f6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button onClick={handlePrev2} disabled={prevDisabled} style={{ fontSize: 14, fontWeight: 600, padding: "12px 20px", borderRadius: 12, border: "1px solid #e2e8f0", background: "#fff", color: prevDisabled ? "#cbd5e1" : "#64748b", cursor: prevDisabled ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 7, opacity: prevDisabled ? 0.6 : 1 }}>
              <ArrowLeft size={16} /> {projOpen ? "Back" : "Previous"}
            </button>
            <button onClick={handleNext2} style={{ fontSize: 14.5, fontWeight: 700, padding: "12px 22px", borderRadius: 12, border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}>
              {nextLabel} <ArrowRight size={16} />
            </button>
          </div>
        );
      })()}
    </div>
  );
}

export default function Onboarding({ embedded = false }) {
  // When embedded in the Company Console, screens fill their container instead
  // of the full viewport (the console provides the sidebar + top bar).
  const _vh = embedded ? "100%" : "100vh";
  const [screen, setScreen] = useState("intake");
  // The signed-in company's existing row slug (stable across renames), so edits
  // update the same row instead of spawning a new one. Null until first save.
  const [savedSlug, setSavedSlug] = useState(null);
  const [hydrating, setHydrating] = useState(true);
  const [brand, setBrand] = useState({ avatar: "", hero: "", logo: "" });
  const [spot, setSpot] = useState(null);
  const [fieldSpot, setFieldSpot] = useState(null);
  const FIRST_SECTION = { overview: "co", projects: "pj-header", capital: "cp-fin", team: "tm-roster" };
  const [files, setFiles] = useState([]);
  const [paste, setPaste] = useState("");
  const [drag, setDrag] = useState(false);
  const [fields, setFields] = useState(BLANK_FIELDS);
  const [tab, setTab] = useState("overview");
  const [sel, setSel] = useState(null);   // { tab, id } | null
  // Supabase save status: idle | saving | saved | error (+ message for errors)
  const [saveState, setSaveState] = useState("idle");
  const [saveMsg, setSaveMsg] = useState("");
  // Task 1: single profile object. Capital reads from here; `fields` still the
  // editor's write target and is synced in below. Other sections are carried for
  // completeness but still render via the existing path for now.
  const [profile, setProfile] = useState(() => ({
    company: {}, overview: {}, capital: {},
    // Single source of truth for the Company Status Card. Every visible field on
    // that card renders from here; nothing about status lives anywhere else.
    // (Populated automatically by AI onboarding later — starts empty, no placeholders.)
    companyStatus: {
      statusHeadline: "",
      statusHeadlineSubtext: "",
      latestUpdate: "",
      nextCatalyst: "",
      expected: "",
      investmentImpact: "",
      progressBar: { enabled: false, label: "", current: null, total: null, unit: "" },
    },
    // Per-field AI confidence review (editor-only; null until AI autofill runs).
    companyStatusReview: null,
    // Snapshot of the AI-autofilled values, used to detect manual edits.
    companyStatusAI: null,
    // Company AI Brief — single source of truth (describes the company).
    companyBrief: { headline: "", shortSummary: "", businessDescription: "", keyPoints: [] },
    companyBriefReview: null,
    companyBriefAI: null,
    projects: [], timeline: [], team: [], media: [], brand,
  }));
  const inputRef = useRef(null);

  const addFiles = (fl) => setFiles((p) => [...p, ...Array.from(fl).map((f) => ({ name: f.name, size: f.size, file: f }))]);

  // On mount: if this signed-in company already has a saved profile, hydrate it
  // and jump straight into the editor to resume/edit. Otherwise start fresh.
  // `?new=1` (admin "Onboard a company") forces a fresh build, ignoring any existing row.
  useEffect(() => {
    const fresh = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("new") === "1";
    if (fresh) { setHydrating(false); return; }
    let alive = true;
    fetchMyCompany()
      .then((row) => {
        if (!alive || !row || !row.profile) return;
        setProfile((p) => ({ ...p, ...row.profile }));
        if (row.profile.brand) setBrand(row.profile.brand);
        setSavedSlug(row.slug);
        setScreen("review"); setSpot("co"); setTab("overview");
      })
      .finally(() => { if (alive) setHydrating(false); });
    return () => { alive = false; };
  }, []);

  const runFill = (skipId) => {
    let i = 0;
    for (const [t, arr] of Object.entries(SEED_FIELDS)) {
      for (const f of arr) {
        if (f.state === "blank" || f.id === skipId) continue;
        const delay = 350 + i * 380; i += 1;
        setTimeout(() => setFields((prev) => ({ ...prev, [t]: prev[t].map((x) => (x.id === f.id ? { ...f } : x)) })), delay);
      }
    }
  };
  // AI autofill: scan uploaded docs/notes → populate the companyStatus source of
  // truth, its per-field confidence review, and the AI baseline (for edit detection).
  // Failure (e.g. model unreachable) leaves everything empty for manual entry.
  const autofillCompanyStatus = async () => {
    try {
      const res = await extractCompanyStatus(files.map((f) => f.file).filter(Boolean), paste);
      if (res && res.status) setProfile((p) => ({ ...p, companyStatus: res.status, companyStatusReview: res.review, companyStatusAI: JSON.parse(JSON.stringify(res.status)) }));
      return res;
    } catch { return null; }
  };
  // Brief autofill reuses the SAME uploaded documents — no re-upload, no new inputs.
  const autofillCompanyBrief = async () => {
    try {
      const res = await extractCompanyBrief(files.map((f) => f.file).filter(Boolean), paste);
      if (res && res.brief) setProfile((p) => ({ ...p, companyBrief: res.brief, companyBriefReview: res.review, companyBriefAI: JSON.parse(JSON.stringify(res.brief)) }));
      return res;
    } catch { return null; }
  };
  const submit = async () => { setScreen("loading"); await Promise.all([autofillCompanyStatus(), autofillCompanyBrief()]); setScreen("branding"); };
  const seedStatus = SEED_FIELDS.overview.find((f) => f.id === "ov-status").data.status;
  const finishBranding = (assets) => { setBrand(assets); runFill(); setSpot("co"); setTab("overview"); setScreen("review"); };
  const finishStatus = (st) => {
    setFields((prev) => ({ ...prev, overview: prev.overview.map((f) => f.id === "ov-status" ? { ...f, state: "pending", value: st.state, data: { ...f.data, status: st } } : f) }));
    setScreen("review");
    runFill("ov-status");
    setSpot("co"); setTab("overview");
  };

  const flat = Object.entries(fields).flatMap(([t, arr]) => arr.map((f) => ({ ...f, tab: t })));
  const stateOf = (id) => { const f = flat.find((x) => x.id === id); return f ? f.state : "blank"; };
  const onField = (id) => { const f = flat.find((x) => x.id === id); if (f) setSel({ tab: f.tab, id }); };
  const update = (patch) => sel && setFields((prev) => ({ ...prev, [sel.tab]: prev[sel.tab].map((f) => (f.id === sel.id ? { ...f, ...patch } : f)) }));

  const present = (id) => { const st = stateOf(id); return st === "pending" || st === "approved"; };
  const spotGetVal = (id) => { const f = flat.find((x) => x.id === id); return f ? (f.value || "") : ""; };
  const spotGetStatus = (which) => { const th = flat.find((x) => x.id === "ov-thesis"); const thP = th && (th.state === "pending" || th.state === "approved"); const d = thP ? (th.data || {}) : {}; if (which === "thesis") return (d.thesis && d.thesis.length ? d.thesis : SKELETON_OV.thesis); if (which === "cases") return (d.cases && d.cases.length ? d.cases : SKELETON_OV.cases); if (which === "nextCase") return d.nextCase || ""; const f = flat.find((x) => x.id === "ov-status"); const fP = f && (f.state === "pending" || f.state === "approved"); return (fP && f.data && f.data.status) || {}; };
  const spotText = (id, val) => { if (id === "__thesis__") { setFields((p) => ({ ...p, overview: p.overview.map((f) => f.id === "ov-thesis" ? { ...f, state: "pending", data: { ...f.data, thesis: val.split("\n").filter(Boolean) } } : f) })); return; } const f = flat.find((x) => x.id === id); if (!f) return; const t = f.tab; setFields((p) => ({ ...p, [t]: p[t].map((x) => x.id === id ? { ...x, state: "pending", value: val } : x) })); };
  const spotIdentity = (id, val) => setFields((p) => ({ ...p, overview: p.overview.map((f) => f.id === id ? { ...f, state: "pending", value: val } : f) }));
  const spotStatus = (k, val) => setFields((p) => ({ ...p, overview: p.overview.map((f) => f.id === "ov-status" ? { ...f, state: "pending", data: { ...f.data, status: { ...(f.data && f.data.status), [k]: val } } } : f) }));
  const spotThesis = (arr) => setFields((p) => ({ ...p, overview: p.overview.map((f) => f.id === "ov-thesis" ? { ...f, state: "pending", data: { ...f.data, thesis: arr } } : f) }));
  const spotScenario = (key, text) => setFields((p) => ({ ...p, overview: p.overview.map((f) => { if (f.id !== "ov-thesis") return f; const d = { ...(f.data || {}) }; if (key === "next") { d.nextCase = text; } else { let cases = (d.cases && d.cases.length) ? d.cases.slice() : [{ key: "bull", text: "" }, { key: "bear", text: "" }]; if (!cases.find((c) => c.key === key)) cases.push({ key, text: "" }); d.cases = cases.map((c) => c.key === key ? { ...c, text } : c); } return { ...f, state: "pending", data: d }; }) }));
  const ordIdx = (s) => SECTION_ORDER.indexOf((s && s.indexOf("pj-") === 0) ? "pj-header" : (s && s.indexOf("cp-") === 0) ? "cp-fin" : s);
  const nextSpot = () => { setFieldSpot(null); const i = ordIdx(spot); const nx = SECTION_ORDER[i + 1]; if (!nx) { setSpot(null); return; } setSpot(nx); setTab(SECTION_DEFS[nx].tab); };
  const prevSpot = () => { setFieldSpot(null); const i = ordIdx(spot); if (i <= 0) return; const pv = SECTION_ORDER[i - 1]; setSpot(pv); setTab(SECTION_DEFS[pv].tab); };
  const gotoTab = (t) => { setTab(t); setSpot(FIRST_SECTION[t] || null); setFieldSpot(null); };
  // the blank template's data sources — populated ONLY when extraction/edits land
  AVATAR = brand.avatar || ""; STATUS_IMG = brand.hero || ""; STATUS_LOGO = brand.logo || "";
  const idVal = (id) => { const f = flat.find((x) => x.id === id); return f && f.value ? f.value : ""; };
  const co = profile.company || {};
  COMPANY.name = co.name || "Company Name";
  COMPANY.website = co.website || "companywebsite.com";
  COMPANY.slogan = co.slogan || "Add a short slogan";
  COMPANY.ticker = co.ticker || "";
  COMPANY.commodity = co.commodity || "";
  COMPANY.jurisdiction = co.jurisdiction || "";
  COMPANY.stage = co.stage || "";
  // Task 2: Projects/Timeline/Team/Media now render from `profile.<section>`
  // (empty-aware). The old SEED/SKELETON gate has been removed.

  // Task 1: keep `profile` synced from the current write target (`fields`) so the
  // editor + extraction keep working, while Capital renders from `profile`.
  const status = useMemo(() => statusFromFields(fields), [fields]);
  useEffect(() => {
    setProfile((p) => ({
      ...p,
      overview: overviewVM(fields.overview),
      brand,
    }));
  }, [fields, brand]);
  // Tasks 4-6: projects/timeline/team/company/capital are edited directly on `profile` (source of truth).
  const setProjects = (upd) => setProfile((p) => ({ ...p, projects: typeof upd === "function" ? upd(p.projects || []) : upd }));
  const setTimeline = (upd) => setProfile((p) => ({ ...p, timeline: typeof upd === "function" ? upd(p.timeline || []) : upd }));
  const setTeam = (upd) => setProfile((p) => ({ ...p, team: typeof upd === "function" ? upd(p.team || []) : upd }));
  const setCompany = (patch) => setProfile((p) => ({ ...p, company: { ...(p.company || {}), ...patch } }));
  const setCapital = (patch) => setProfile((p) => ({ ...p, capital: { ...(p.capital || {}), ...patch } }));
  const setCompanyStatus = (patch) => setProfile((p) => ({ ...p, companyStatus: { ...(p.companyStatus || {}), ...patch } }));
  const setCompanyBrief = (patch) => setProfile((p) => ({ ...p, companyBrief: { ...(p.companyBrief || {}), ...patch } }));
  // Save the live profile to Supabase (UPSERT by slug). Returns true on success so
  // callers (e.g. Publish) can gate on it. Never touches the reserved template row.
  const doSave = async (publish = false) => {
    // Reuse the existing row's slug on edits (stable across renames); derive one on first save.
    const slug = savedSlug || deriveSlug(profile.company && profile.company.name);
    if (!slug) { setSaveState("error"); setSaveMsg("Enter a company name first"); return false; }
    setSaveState("saving"); setSaveMsg("");
    try {
      // Save keeps it a draft; only Publish takes it live on the app.
      await sbSaveProfile(profile, slug, publish ? "published" : "draft");
      setSavedSlug(slug);
      setSaveState("saved");
      return true;
    } catch (e) {
      setSaveState("error"); setSaveMsg(e && e.message ? e.message : "Save failed");
      return false;
    }
  };
  // dev/test seam: lets the verification harness read and patch the live profile.
  useEffect(() => { if (typeof window !== "undefined") { window.__ppProfile = { get: () => profile, set: setProfile, status }; window.__ppStatusAI = { normalizeCompanyStatus, normalizeCompanyStatusReview, buildStatusExtractionContent, extractCompanyStatus, apply: (res) => setProfile((p) => (res && res.status ? { ...p, companyStatus: res.status, companyStatusReview: res.review, companyStatusAI: JSON.parse(JSON.stringify(res.status)) } : p)) }; window.__ppBriefAI = { normalizeCompanyBrief, normalizeCompanyBriefReview, extractCompanyBrief, apply: (res) => setProfile((p) => (res && res.brief ? { ...p, companyBrief: res.brief, companyBriefReview: res.review, companyBriefAI: JSON.parse(JSON.stringify(res.brief)) } : p)) }; } }, [profile, status]);

  const _ovF = overviewVM(fields.overview);
  // Company Status Card view-model — derived 1:1 from the single `companyStatus`
  // source of truth (profile.companyStatus). Nothing about status is read from
  // profile.company (or anywhere else) anymore.
  const _cs = profile.companyStatus || {};
  const _pb = _cs.progressBar || {};
  const _companyStatus = {
    state: _cs.statusHeadline || "",
    detail: _cs.statusHeadlineSubtext || "",
    latest: _cs.latestUpdate || "",
    nextCatalyst: _cs.nextCatalyst || "",
    eta: _cs.expected || "",
    impact: _cs.investmentImpact || "",
    progressLabel: _pb.label || "",
    progressDone: _pb.current,
    progressTotal: _pb.total,
    progressUnit: _pb.unit || "",
    progressEnabled: !!_pb.enabled,
    next: "",
  };
  const vm = { ...buildVM(profile, status, onField, stateOf), ov: { ..._ovF, status: _companyStatus, companyBrief: profile.companyBrief } };
  const current = sel ? fields[sel.tab].find((f) => f.id === sel.id) : null;
  const gated = flat.filter((f) => !(f.tab === "media" && f.state === "blank"));
  const total = gated.length;
  const approved = gated.filter((f) => f.state === "approved").length;
  const ready = { overview: present("ov-status"), projects: present("pj-data"), timeline: present("tl-data"), team: present("tm-roster") };
  // Publish validation: the six Company Status text fields are required (progress bar is optional).
  const _csReq = [["statusHeadline", "Status Headline"], ["statusHeadlineSubtext", "Status Headline Subtext"], ["latestUpdate", "Latest Update"], ["nextCatalyst", "Next Catalyst"], ["expected", "Expected"], ["investmentImpact", "Investment Impact"]];
  const _csMissing = _csReq.filter(([k]) => !String((profile.companyStatus || {})[k] || "").trim()).map(([, label]) => label);
  const statusComplete = _csMissing.length === 0;
  const canPublish = approved > 0 && statusComplete;

  if (hydrating) return (
    <div style={{ minHeight: _vh, display: "grid", placeItems: "center", background: "#f6f8fb" }}>
      <div style={{ textAlign: "center", color: "#94a3b8" }}>
        <Loader2 size={30} className="animate-spin" color="#10b981" style={{ margin: "0 auto" }} />
        <p style={{ marginTop: 12, fontSize: 14 }}>Loading your workspace…</p>
      </div>
    </div>
  );

  if (screen === "intake") return (
    <div style={{ minHeight: _vh, background: "radial-gradient(1000px 600px at 50% -10%,#fff,#eef2f7 60%,#e2e8f0)", display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}>
      <style>{OB_KEYFRAMES}</style>
      <div style={{ width: "100%", maxWidth: 620, background: "#fff", borderRadius: 24, border: "1px solid #e9eef5", boxShadow: "0 30px 80px -30px rgba(15,23,42,0.3)", padding: "34px 34px 30px" }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".2em", textTransform: "uppercase", color: "#10b981" }}>Passport onboarding</span>
        <h1 style={{ fontSize: 25, fontWeight: 800, letterSpacing: "-.02em", color: "#0f172a", margin: "8px 0 0" }}>Build your company profile</h1>
        <p style={{ fontSize: 13.5, color: "#64748b", marginTop: 10, lineHeight: 1.5 }}>Drop in your filings, presentations and news releases — or paste text. You&rsquo;ll preview and approve every field before it goes live.</p>
        <div onClick={() => inputRef.current?.click()} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); }}
          style={{ marginTop: 22, borderRadius: 18, cursor: "pointer", padding: "40px 20px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            border: `2px dashed ${drag ? "#10b981" : "#e2e8f0"}`, background: drag ? "rgba(16,185,129,0.05)" : "#fff", transition: "all .16s" }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: drag ? "#10b981" : "#f1f5f9", display: "grid", placeItems: "center", marginBottom: 18 }}>
            <Upload size={24} color={drag ? "#fff" : "#10b981"} strokeWidth={2.2} />
          </div>
          <p style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "#0f172a", letterSpacing: "-.01em" }}>{drag ? "Release to add" : "Drag and drop all your related documents or text here"}</p>
          <p style={{ fontSize: 12.5, color: "#94a3b8", marginTop: 8 }}>PDFs, decks, press releases — everything at once</p>
          <input ref={inputRef} type="file" multiple style={{ display: "none" }} onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ""; }} />
        </div>
        {files.length > 0 && (
          <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 8 }}>
            {files.map((f, i) => (
              <span key={i} style={{ fontSize: 12, fontWeight: 600, color: "#334155", background: "#f1f5f9", borderRadius: 8, padding: "6px 10px" }}>{f.name} · {fmt(f.size)}</span>
            ))}
          </div>
        )}
        <div style={{ marginTop: 18 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 800, letterSpacing: ".18em", textTransform: "uppercase", color: "#94a3b8", marginBottom: 10 }}>or paste text</label>
          <textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste a press release, a bio, notes…"
            style={{ width: "100%", minHeight: 90, resize: "vertical", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "12px 14px", color: "#0f172a", fontSize: 13.5, boxSizing: "border-box", fontFamily: "inherit" }} />
        </div>
        <button onClick={submit} disabled={!files.length && !paste.trim()}
          style={{ marginTop: 18, width: "100%", height: 50, borderRadius: 13, border: "none", fontSize: 15, fontWeight: 700,
            cursor: files.length || paste.trim() ? "pointer" : "not-allowed", transition: "all .16s",
            background: files.length || paste.trim() ? "#0f172a" : "#e2e8f0", color: files.length || paste.trim() ? "#fff" : "#94a3b8", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 9 }}>
          Extract &amp; build profile <ArrowRight size={17} />
        </button>
        <button onClick={() => { setScreen("review"); setSpot("co"); setTab("overview"); }}
          style={{ marginTop: 14, width: "100%", background: "none", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, fontSize: 13, fontWeight: 700, color: "#64748b", padding: "6px 0" }}>
          Skip — view the blank profile template <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );

  if (screen === "branding") return <Branding onNext={finishBranding} />;

  if (screen === "status") return <StatusReview brand={brand} seed={seedStatus} onNext={finishStatus} onBack={() => setScreen("branding")} onSkip={() => { setScreen("review"); runFill(); setSpot("co"); setTab("overview"); }} />;

  if (screen === "loading") return (
    <div style={{ minHeight: _vh, background: "radial-gradient(1000px 600px at 50% -10%,#fff,#eef2f7 60%,#e2e8f0)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{OB_KEYFRAMES}</style>
      <div style={{ textAlign: "center" }}>
        <Loader2 size={40} className="pp-spin" color="#10b981" />
        <p style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", marginTop: 18 }}>Reading your documents…</p>
        <p style={{ fontSize: 13, color: "#94a3b8", marginTop: 10 }}>extracting fields · attaching sources · scoring confidence</p>
      </div>
    </div>
  );

  if (screen === "published") return (
    <div style={{ minHeight: _vh, background: "radial-gradient(1000px 600px at 50% -10%,#fff,#eef2f7 60%,#e2e8f0)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{OB_KEYFRAMES}</style>
      <div style={{ textAlign: "center" }}>
        <CheckCircle2 size={54} color="#10b981" />
        <p style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", marginTop: 16 }}>Profile published</p>
        <p style={{ fontSize: 13.5, color: "#64748b", marginTop: 8 }}>{approved} approved fields are now live on the the company Passport.</p>
      </div>
    </div>
  );

  // ---- review (split screen) ----
  const th = OB_THEME[(sel && sel.tab) || tab];
  const _saveLabel = { idle: "Save", saving: "Saving…", saved: "Saved", error: "Retry save" }[saveState];
  const _saveBg = { idle: "#0f172a", saving: "#64748b", saved: "#10b981", error: "#e11d48" }[saveState];
  const saveBar = (
    <div style={{ position: "fixed", left: 20, bottom: 20, zIndex: 1000, display: "flex", alignItems: "center", gap: 10 }}>
      <button onClick={doSave} disabled={saveState === "saving"}
        style={{ fontSize: 13, fontWeight: 700, padding: "9px 16px", borderRadius: 10, border: "none",
          cursor: saveState === "saving" ? "default" : "pointer", background: _saveBg, color: "#fff",
          boxShadow: "0 8px 24px -8px rgba(15,23,42,0.45)" }}>
        {_saveLabel}
      </button>
      {saveState === "saved" && (
        <span style={{ fontSize: 12, fontWeight: 600, color: "#10b981" }}>Saved to Supabase</span>
      )}
      {saveState === "error" && (
        <span style={{ fontSize: 12, fontWeight: 600, color: "#e11d48", maxWidth: 280 }}>{saveMsg}</span>
      )}
    </div>
  );
  return (
    <ProfileContext.Provider value={{ profile, setProfile, status, vm }}>
    <div style={{ minHeight: embedded ? 0 : "100vh", height: _vh, display: "grid", gridTemplateColumns: "minmax(380px, 1fr) minmax(400px, 520px)", background: "#f6f8fb" }}>
      <style>{OB_KEYFRAMES}</style>
      {saveBar}
      {/* exit back to where you came from (admin for the "Onboard a company" flow) */}
      {!embedded && (
        <a href={(typeof window !== "undefined" && new URLSearchParams(window.location.search).get("new") === "1") ? "/admin" : "/"}
          style={{ position: "fixed", left: 20, top: 20, zIndex: 1000, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: "#64748b", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 14px", textDecoration: "none", boxShadow: "0 8px 24px -8px rgba(15,23,42,0.25)" }}>
          ← Exit
        </a>
      )}
      {/* LEFT — live preview, rendered by the SAME component the app uses */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 24, overflow: "auto" }}>
        <div style={{ width: 392, height: 788, maxHeight: "84vh", background: "#fff", borderRadius: 44, overflow: "hidden", border: "1px solid #e9eef5", boxShadow: "0 40px 90px -30px rgba(15,23,42,0.4)", display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <AppStatusBar />
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
            <AppCompanyProfile
              profile={profile}
              showBack={false}
              tab={tab === "media" ? "updates" : tab}
              onTabChange={(t) => gotoTab(t === "updates" ? "media" : t)}
            />
          </div>
        </div>
        <p style={{ fontSize: 11.5, color: "#94a3b8", textAlign: "center", maxWidth: 360 }}>This is exactly how the profile will appear in the app. Switch sections with the tabs; edit fields on the right.</p>
      </div>
      {/* RIGHT — editor + gate */}
      <div style={{ display: "flex", flexDirection: "column", background: "#fff", borderLeft: "1px solid #e9eef5" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 26px", borderBottom: "1px solid #eef2f6" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={prevSpot} disabled={ordIdx(spot) <= 0} title="Previous step" style={{ width: 34, height: 34, borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", cursor: ordIdx(spot) <= 0 ? "default" : "pointer", display: "grid", placeItems: "center", color: ordIdx(spot) <= 0 ? "#cbd5e1" : "#64748b", flexShrink: 0 }}><ArrowLeft size={17} /></button>
            <div>
              <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".18em", textTransform: "uppercase", color: "#94a3b8" }}>Review &amp; approve</span>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", margin: "3px 0 0" }}>{approved}/{total} fields approved</p>
            </div>
          </div>
          <button onClick={async () => { const ok = await doSave(true); if (ok) setScreen("published"); }} disabled={!canPublish || saveState === "saving"}
            title={!statusComplete ? "Company Status needs: " + _csMissing.join(", ") : (approved === 0 ? "Approve at least one field to publish" : "")}
            style={{ fontSize: 13.5, fontWeight: 700, padding: "10px 18px", borderRadius: 11, border: "none", cursor: (canPublish && saveState !== "saving") ? "pointer" : "not-allowed", background: canPublish ? "#0f172a" : "#e2e8f0", color: canPublish ? "#fff" : "#94a3b8" }}>
            {saveState === "saving" ? "Saving…" : "Publish"}
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "28px 26px" }}>
          {spot && SECTION_DEFS[spot] ? (
            <SectionEditor spot={spot} def={SECTION_DEFS[spot]} getVal={spotGetVal} getStatus={spotGetStatus} onText={spotText} onIdentity={spotIdentity} onStatus={spotStatus}
              onScenario={spotScenario} onThesis={spotThesis} onNext={nextSpot} onPrev={prevSpot} onGotoSpot={(id) => { setFieldSpot(null); setSpot(id); setTab((SECTION_DEFS[id] && SECTION_DEFS[id].tab) || "projects"); }} first={ordIdx(spot) === 0} idx={ordIdx(spot)} total={SECTION_ORDER.length} last={ordIdx(spot) === SECTION_ORDER.length - 1} onFocusField={setFieldSpot} projects={profile.projects} setProjects={setProjects} timeline={profile.timeline} setTimeline={setTimeline} team={profile.team} setTeam={setTeam} company={profile.company} setCompany={setCompany} capital={profile.capital} setCapital={setCapital} companyStatus={profile.companyStatus} setCompanyStatus={setCompanyStatus} companyStatusReview={profile.companyStatusReview} companyStatusAI={profile.companyStatusAI} companyBrief={profile.companyBrief} setCompanyBrief={setCompanyBrief} companyBriefReview={profile.companyBriefReview} companyBriefAI={profile.companyBriefAI} />
          ) : (
            <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 12 }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: "#f1f5f9", display: "grid", placeItems: "center" }}><Check size={22} color="#10b981" /></div>
              <p style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", margin: 0 }}>All sections reviewed</p>
              <p style={{ fontSize: 13, color: "#94a3b8", maxWidth: 320 }}>Click any section in the preview to edit it again, or Publish when you're ready.</p>
            </div>
          )}
        </div>
      </div>
    </div>
    </ProfileContext.Provider>
  );
}
