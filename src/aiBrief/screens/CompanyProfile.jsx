import React, { useState, useRef } from "react";
import {
  ArrowLeft, ScanLine, BadgeCheck, Check, MessageSquare, ExternalLink,
  Home, Pickaxe, Clock, PieChart, Users, Radio, Zap, ChevronDown, ChevronRight,
  MapPin, Layers, Wallet, Coins, Activity, FlaskConical, Newspaper,
} from "lucide-react";
import { Avatar, initialsOf, fmtShares } from "../components.jsx";
import Timeline from "./Timeline.jsx";

/* ---------- helpers ---------- */
const has = (v) => typeof v === "string" && v.trim().length > 0;
const displayHost = (url) => String(url || "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
const shortName = (name) => String(name || "This company").replace(/\s+(Ltd\.?|Inc\.?|Corp\.?|Limited)$/i, "");

function EmptyState({ icon: Icon, title, sub }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-slate-200 bg-white/60 px-6 py-14 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400"><Icon size={22} /></div>
      <p className="text-[16px] font-bold text-slate-700">{title}</p>
      {sub && <p className="max-w-[250px] text-[13.5px] leading-snug text-slate-400">{sub}</p>}
    </div>
  );
}

function Eyebrow({ children, color }) {
  return <p className="text-[13px] font-bold uppercase tracking-[0.16em]" style={{ color }}>{children}</p>;
}

const SUBTABS = [
  { id: "overview", Icon: Home },
  { id: "projects", Icon: Pickaxe },
  { id: "timeline", Icon: Clock },
  { id: "capital", Icon: PieChart },
  { id: "team", Icon: Users },
  { id: "updates", Icon: Radio },
];

/* ============================ OVERVIEW ============================ */
function CompanyStatus({ status, name }) {
  const pb = status?.progressBar || {};
  const hasStatus = has(status?.statusHeadline) || has(status?.latestUpdate) || has(status?.nextCatalyst);
  const pct = pb.enabled && pb.total ? Math.round((Number(pb.current) / Number(pb.total)) * 100) : null;
  if (!hasStatus) return <EmptyState icon={Zap} title="No company status yet" sub={`${name} hasn't published a current status update to its Passport.`} />;

  const cell = (label, value) => (
    <div className="p-4">
      <p className="text-[12px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 text-[16px] font-bold leading-snug text-slate-900">{value || "—"}</p>
    </div>
  );
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="p-5">
        <span className="inline-flex items-center gap-2 rounded-full border border-orange-200 px-3 py-1.5 text-[12px] font-bold uppercase tracking-wider text-orange-500">
          <span className="h-1.5 w-1.5 rounded-full bg-orange-500" /> Company Status
        </span>
        <h2 className="mt-3 text-[28px] font-extrabold leading-tight tracking-tight text-slate-900">{status.statusHeadline}</h2>
        {has(status.statusHeadlineSubtext) && <p className="mt-2 text-[15.5px] leading-snug text-slate-500">{status.statusHeadlineSubtext}</p>}
        {pct != null && (
          <div className="mt-5">
            <div className="h-2.5 w-full rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[13px] font-bold uppercase tracking-wide text-slate-400">{pb.current} / {pb.total} {pb.unit || pb.label}</span>
              <span className="text-[15px] font-extrabold text-emerald-600">{pct}%</span>
            </div>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 divide-x divide-slate-100 border-t border-slate-100">{cell("Latest Update", status.latestUpdate)}{cell("Next Catalyst", status.nextCatalyst)}</div>
      <div className="grid grid-cols-2 divide-x divide-slate-100 border-t border-slate-100">{cell("Expected", status.expected)}{cell("Investment Impact", status.investmentImpact)}</div>
    </div>
  );
}

function Overview({ profile }) {
  const name = shortName(profile.company?.name);
  const brief = profile.companyBrief || {};
  const drivers = Array.isArray(brief.keyPoints) ? brief.keyPoints.filter(Boolean) : [];
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-4">
      <CompanyStatus status={profile.companyStatus} name={name} />

      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-blue-500 to-sky-400 p-6 text-white shadow-[0_10px_30px_-12px_rgba(37,99,235,0.5)]">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/20"><Zap size={18} fill="currentColor" /></div>
          <span className="text-[14px] font-bold uppercase tracking-[0.2em]">AI Brief</span>
        </div>
        <h3 className="mt-4 text-[26px] font-extrabold leading-tight tracking-tight">Explain {name} in 60 Seconds</h3>
        <p className="mt-2 text-[15.5px] leading-snug text-white/90">{has(brief.shortSummary) ? brief.shortSummary : "AI-generated summary covering opportunity, risks, catalysts and project potential."}</p>
      </div>

      <div className="overflow-hidden rounded-2xl bg-slate-900 text-white">
        <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-center gap-2 px-5 py-4 text-[17px] font-bold">
          Core Value Drivers <ChevronDown size={18} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <div className="px-5 pb-5">
            {drivers.length ? (
              <ul className="space-y-2.5">
                {drivers.map((d, i) => (
                  <li key={i} className="flex items-start gap-3 text-[15px] leading-snug text-white/90">
                    <Check size={17} className="mt-0.5 flex-shrink-0 text-emerald-400" /> {d}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-center text-[14px] text-white/60">Value drivers haven't been added yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================ PROJECTS ============================ */
const STAGES = ["Explore", "Discovery", "Resource", "Studies", "Develop", "Produce"];
const TECH_CARDS = [
  { title: "District Context", sub: "Claims · Structures · Regional Context" },
  { title: "Exploration Strategy", sub: "Programs · Operators · Targets" },
  { title: "Geological Model", sub: "Rocks · Structures · Mineralization" },
  { title: "Exploration Results", sub: "Intercepts · Assays · Sections" },
];

function Projects({ projects }) {
  const list = (projects || []).filter((p) => p.enabled !== false);
  const [idx, setIdx] = useState(0);
  if (!list.length) return <EmptyState icon={Pickaxe} title="No projects listed" sub="This company's project portfolio hasn't been added yet." />;
  const p = list[Math.min(idx, list.length - 1)];
  const snap = p.snapshot || {};
  const geo = p.geo || {};
  const stageIdx = typeof p.stageIdx === "number" ? p.stageIdx : -1;
  const snapCell = (label, value) => (
    <div className="rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 text-[15px] font-bold leading-snug text-slate-900">{value || "—"}</p>
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <Eyebrow color="#c2410c">Assets</Eyebrow>
        <h1 className="mt-1 text-[30px] font-extrabold tracking-tight text-slate-900">Projects</h1>
      </div>

      {list.length > 1 && (
        <div className="flex rounded-2xl bg-slate-100 p-1">
          {list.map((pr, i) => (
            <button key={pr.id || i} onClick={() => setIdx(i)} className={`flex-1 rounded-xl py-2.5 text-[15px] font-bold transition ${i === idx ? "bg-emerald-500 text-white shadow-sm" : "text-slate-500"}`}>{pr.name}</button>
          ))}
        </div>
      )}

      {/* gallery */}
      {Array.isArray(p.gallery) && p.gallery.length ? (
        <img src={p.gallery[0]} alt="" className="h-56 w-full rounded-3xl object-cover" />
      ) : (
        <div className="flex h-40 items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white/60 text-[13px] font-medium text-slate-400">No project photos yet</div>
      )}

      {/* per-project AI */}
      <div>
        <p className="mb-2 text-[12px] font-bold uppercase tracking-widest text-slate-400">Project Intelligence</p>
        <button className="flex w-full items-center justify-between gap-3 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 px-5 py-4 text-left text-white shadow-[0_10px_30px_-12px_rgba(37,99,235,0.5)]">
          <span className="flex items-center gap-3"><span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-white/20"><Zap size={17} fill="currentColor" /></span><span className="text-[17px] font-bold leading-tight">Understand this project in 60 seconds</span></span>
          <ChevronRight size={18} className="flex-shrink-0" />
        </button>
      </div>

      {/* snapshot */}
      <div>
        <p className="mb-2 text-[12px] font-bold uppercase tracking-widest text-slate-400">Project Snapshot</p>
        <div className="grid grid-cols-2 gap-3">
          {snapCell("Location", has(geo.district) ? geo.district : has(snap.location) ? snap.location : "")}
          {snapCell("Commodities", snap.commodities || "")}
          {snapCell("Land Position", snap.land || "")}
          {snapCell("Drill Targets", snap.targets || "")}
        </div>
      </div>

      {/* stage bar */}
      <div>
        <p className="mb-3 text-[12px] font-bold uppercase tracking-widest text-slate-400">Project Stage</p>
        <div className="flex items-center gap-1">
          {STAGES.map((s, i) => (
            <div key={s} className="flex-1">
              <div className={`h-1.5 rounded-full ${stageIdx >= 0 && i <= stageIdx ? "bg-emerald-500" : "bg-slate-200"}`} />
              <p className={`mt-2 text-center text-[10.5px] font-bold ${i === stageIdx ? "text-emerald-600" : "text-slate-400"}`}>{s}</p>
            </div>
          ))}
        </div>
      </div>

      {/* technical intelligence */}
      <div>
        <p className="mb-2 text-[12px] font-bold uppercase tracking-widest text-slate-400">Technical Intelligence</p>
        <div className="space-y-3">
          {TECH_CARDS.map((c) => (
            <button key={c.title} className="flex w-full items-center justify-between rounded-2xl border border-slate-100 bg-white px-5 py-4 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <span><span className="block text-[16px] font-bold text-slate-900">{c.title}</span><span className="mt-0.5 block text-[13px] text-slate-400">{c.sub}</span></span>
              <ChevronRight size={18} className="text-slate-300" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================ CAPITAL ============================ */
function Capital({ capital }) {
  const c = capital || {};
  const cards = [
    { key: "financing", value: c.financing, label: "Latest Financing", sub: c.financingNote || "", Icon: Coins, tone: "text-indigo-500 bg-indigo-50" },
    { key: "cash", value: c.cash, label: "Cash", sub: c.cashNote || "", Icon: Wallet, tone: "text-indigo-500 bg-indigo-50" },
    { key: "basic", value: fmtShares(c.outstanding), label: "Basic Shares", Icon: Layers, tone: "text-indigo-500 bg-indigo-50" },
    { key: "fd", value: fmtShares(c.fd), label: "Fully Diluted", Icon: PieChart, tone: "text-indigo-500 bg-indigo-50" },
  ].filter((x) => has(x.value));

  const rows = [
    { title: "Share Structure", sub: [fmtShares(c.outstanding) && `${fmtShares(c.outstanding)} basic`, fmtShares(c.fd) && `${fmtShares(c.fd)} fully diluted`].filter(Boolean).join(" · "), Icon: Layers },
    { title: "Ownership", sub: has(c.ownership) ? c.ownership : "", Icon: Users },
    { title: "Balance Sheet", sub: "Cash, working capital, debt", Icon: Activity },
  ].filter((r) => has(r.sub));

  if (!cards.length && !rows.length) return <EmptyState icon={PieChart} title="No capital structure yet" sub="Share structure and financials haven't been published." />;

  return (
    <div className="space-y-5">
      <div><Eyebrow color="#4f46e5">Financials</Eyebrow><h1 className="mt-1 text-[30px] font-extrabold tracking-tight text-slate-900">Capital</h1></div>
      {cards.length > 0 && (
        <div>
          <p className="mb-2 text-[12px] font-bold uppercase tracking-widest text-slate-400">Capital Snapshot</p>
          <div className="grid grid-cols-2 gap-3">
            {cards.map((card) => (
              <div key={card.key} className="relative rounded-3xl bg-slate-50 p-5">
                <div className={`mb-4 grid h-9 w-9 place-items-center rounded-xl ${card.tone}`}><card.Icon size={18} /></div>
                <ChevronRight size={16} className="absolute right-4 top-4 text-slate-300" />
                <p className="text-[26px] font-extrabold tracking-tight text-slate-900">{card.value}</p>
                <p className="mt-1 text-[13px] font-bold uppercase tracking-wide text-slate-400">{card.label}</p>
                {has(card.sub) && <p className="mt-0.5 text-[12.5px] text-slate-400">{card.sub}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
      {rows.length > 0 && (
        <div>
          <p className="mb-2 text-[12px] font-bold uppercase tracking-widest text-slate-400">Explore</p>
          <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            {rows.map((r, i) => (
              <button key={r.title} className={`flex w-full items-center gap-4 px-5 py-4 text-left ${i > 0 ? "border-t border-slate-100" : ""}`}>
                <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-500"><r.Icon size={19} /></span>
                <span className="min-w-0 flex-1"><span className="block text-[17px] font-bold text-slate-900">{r.title}</span><span className="mt-0.5 block truncate text-[13.5px] text-slate-400">{r.sub}</span></span>
                <ChevronRight size={18} className="flex-shrink-0 text-slate-300" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================ UPDATES ============================ */
const UPD_TONE = {
  drilling: "text-emerald-600 bg-emerald-50", lab: "text-purple-600 bg-purple-50",
  financing: "text-indigo-600 bg-indigo-50", corporate: "text-slate-600 bg-slate-100", default: "text-slate-600 bg-slate-100",
};
function Updates({ media }) {
  const [tab, setTab] = useState("All");
  const list = Array.isArray(media) ? media : [];
  if (!list.length) return (
    <div className="space-y-5">
      <h1 className="text-[30px] font-extrabold tracking-tight text-slate-900">Updates</h1>
      <EmptyState icon={Radio} title="No updates yet" sub="Drilling, lab and corporate updates will stream in here as they're posted." />
    </div>
  );
  return (
    <div className="space-y-4">
      <h1 className="text-[30px] font-extrabold tracking-tight text-slate-900">Updates</h1>
      <div className="flex gap-6 border-b border-slate-100">
        {["All", "Updates", "Media"].map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`relative pb-3 text-[16px] font-bold ${tab === t ? "text-slate-900" : "text-slate-400"}`}>
            {t}{tab === t && <span className="absolute -bottom-px left-0 h-0.5 w-full rounded-full bg-blue-500" />}
          </button>
        ))}
      </div>
      <div className="space-y-3.5">
        {list.map((u, i) => {
          const tone = UPD_TONE[(u.kind || "").toLowerCase()] || UPD_TONE.default;
          return (
            <div key={i} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <div className="flex items-center justify-between">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold uppercase tracking-wide ${tone}`}><FlaskConical size={13} /> {u.kind || "Update"}</span>
                <span className="text-[13px] font-medium text-slate-400">{u.time || ""}</span>
              </div>
              <p className="mt-3 text-[18px] font-bold leading-snug text-slate-900">{u.title}</p>
              {has(u.body) && <p className="mt-1.5 text-[14.5px] leading-snug text-slate-500">{u.body}</p>}
              {has(u.image) && <img src={u.image} alt="" className="mt-3 h-48 w-full rounded-2xl object-cover" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================ HEADER ============================ */
function CompactHeader({ company }) {
  return (
    <div className="flex items-center justify-between px-5 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <Avatar brand={company.brand} name={company.name} size={34} />
        <span className="truncate text-[18px] font-extrabold tracking-tight text-slate-900">{company.name}</span>
        <BadgeCheck size={17} className="flex-shrink-0 text-sky-500" />
      </div>
      <button className="flex flex-shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-[14px] font-bold text-emerald-600"><Check size={15} /> Following</button>
    </div>
  );
}

function FullHeader({ company }) {
  return (
    <div className="px-5 pt-3">
      <div className="flex items-start gap-4">
        <Avatar brand={company.brand} name={company.name} size={86} />
        <div className="min-w-0 flex-1 pt-1">
          <div className="flex items-start gap-2">
            <h1 className="text-[30px] font-extrabold leading-[1.05] tracking-tight text-slate-900">{company.name}</h1>
            <BadgeCheck size={22} className="mt-1 flex-shrink-0 text-sky-500" />
          </div>
          {has(company.website) && (
            <a href={company.website} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-[16px] font-semibold text-sky-500">{displayHost(company.website)} <ExternalLink size={14} /></a>
          )}
          {has(company.slogan) && <p className="mt-1 text-[15px] italic text-slate-500">{company.slogan}</p>}
        </div>
      </div>
      <div className="mt-4 flex gap-3">
        <button className="flex flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-sky-100 bg-white py-3 text-[16px] font-bold text-sky-600"><Check size={18} /> Following</button>
        <button className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-3 text-[16px] font-bold text-slate-700"><MessageSquare size={18} /> Message</button>
      </div>
    </div>
  );
}

/* ============================ MAIN ============================ */
export default function CompanyProfile({ profile, onBack, tab: controlledTab, onTabChange, showBack = true }) {
  const [innerTab, setInnerTab] = useState("overview");
  const tab = controlledTab ?? innerTab;
  const [collapsed, setCollapsed] = useState(false);
  const scrollRef = useRef(null);
  const company = profile.company || {};

  const onScroll = (e) => {
    const y = e.currentTarget.scrollTop;
    setCollapsed((c) => (c ? y > 40 : y > 90)); // hysteresis
  };
  const goTab = (t) => {
    if (onTabChange) onTabChange(t); else setInnerTab(t);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setCollapsed(false);
  };

  return (
    <div className="flex h-full flex-col bg-white">
      {/* top bar */}
      <div className="flex flex-shrink-0 items-center justify-between bg-gradient-to-b from-slate-50 to-white px-5 py-2">
        {showBack ? (
          <button onClick={onBack} aria-label="Back" className="grid h-9 w-9 place-items-center rounded-full text-slate-500"><ArrowLeft size={22} /></button>
        ) : <div className="h-9 w-9" />}
        <span className="text-[13px] font-bold uppercase tracking-[0.16em] text-slate-400">Company Profile</span>
        <button aria-label="Scan QR code" className="grid h-11 w-11 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm"><ScanLine size={19} /></button>
      </div>

      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
        {/* full header scrolls away naturally; compact identity appears in the sticky bar */}
        <FullHeader company={company} />

        {/* sticky: compact header (when collapsed) + sub-tab bar */}
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur">
          {collapsed && <div className="border-b border-slate-50"><CompactHeader company={company} /></div>}
          <div className="border-b border-slate-100 px-3">
            <div className="flex items-center justify-between">
              {SUBTABS.map(({ id, Icon }) => {
                const on = tab === id;
                return (
                  <button key={id} aria-label={id} onClick={() => goTab(id)} className="relative flex flex-1 justify-center py-3">
                    <Icon size={22} className={on ? "text-slate-900" : "text-slate-300"} strokeWidth={on ? 2.3 : 2} />
                    {on && <span className="absolute -bottom-px left-1/2 h-0.5 w-7 -translate-x-1/2 rounded-full bg-slate-900" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* page content */}
        <div key={tab} className="pp-fade bg-[var(--pp-bg)] px-4 py-4" style={{ minHeight: "60%" }}>
          {tab === "overview" && <Overview profile={profile} />}
          {tab === "projects" && <Projects projects={profile.projects} />}
          {tab === "timeline" && <Timeline timeline={profile.timeline} />}
          {tab === "capital" && <Capital capital={profile.capital} />}
          {tab === "team" && <div className="space-y-5"><div><Eyebrow color="#0f766e">People</Eyebrow><h1 className="mt-1 text-[30px] font-extrabold tracking-tight text-slate-900">Team</h1></div><EmptyState icon={Users} title="No team listed" sub="Management and directors haven't been added to this Passport." /></div>}
          {tab === "updates" && <Updates media={profile.media} />}
        </div>
      </div>
    </div>
  );
}
