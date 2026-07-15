import React, { useState, useRef, useEffect } from "react";
import {
  ArrowLeft, ScanLine, BadgeCheck, Check, MessageSquare, ExternalLink,
  Home, Pickaxe, Clock, PieChart, Users, Radio, Zap, ChevronDown, ChevronRight,
  MapPin, Layers, Wallet, Coins, Activity, FlaskConical, Newspaper, ArrowUpRight,
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
// Word-by-word blur fade-in (ported 1:1 from the prototype).
function WordFade({ text }) {
  const words = String(text || "").split(" ");
  return (
    <span>
      {words.map((w, i) => (
        <span key={i}>
          <span className="pp-wordfade" style={{ display: "inline-block", animationDelay: `${i * 70}ms` }}>{w}</span>
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </span>
  );
}

const CARD_SHADOW = "rgba(15,23,42,0.03) 0px 1px 2px, rgba(15,23,42,0.28) 0px 30px 60px -26px";

function StatusCell({ label, value, small }) {
  return (
    <div className="flex flex-col p-3">
      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={small ? "mt-1 text-[11px] font-semibold leading-tight tracking-tight text-slate-600" : "mt-1 text-[13px] font-bold tracking-tight text-slate-900"}>{value || "—"}</p>
    </div>
  );
}

function CompanyStatus({ status, name }) {
  const pb = status?.progressBar || {};
  const hasStatus = has(status?.statusHeadline) || has(status?.latestUpdate) || has(status?.nextCatalyst);
  const pct = pb.enabled && pb.total ? Math.round((Number(pb.current) / Number(pb.total)) * 100) : null;
  const [flipped, setFlipped] = useState(false);
  const [w, setW] = useState(0); // animates the slider fill 0 -> pct on mount (like the prototype)
  useEffect(() => { const t = setTimeout(() => setW(pct || 0), 150); return () => clearTimeout(t); }, [pct]);
  if (!hasStatus) return <EmptyState icon={Zap} title="No company status yet" sub={`${name} hasn't published a current status update to its Passport.`} />;
  const photo = status.photo;

  return (
    <div style={{ perspective: 1600 }}>
      <div className="relative" style={{ transformStyle: "preserve-3d", transition: "transform 0.7s cubic-bezier(0.2,0.75,0.2,1)", transform: flipped ? "rotateY(0deg)" : "rotateY(180deg)" }}>
        {/* FRONT — data */}
        <div style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white" style={{ boxShadow: CARD_SHADOW }}>
            <div className="p-5">
              <div style={{ display: "flex", flexDirection: "row-reverse", alignItems: "center", gap: 14 }}>
                {has(photo) && (
                  <button onClick={() => setFlipped(true)} aria-label="Show site photo" className="relative overflow-hidden rounded-2xl border border-slate-200 transition active:scale-[0.97]" style={{ width: 96, height: 96, flexShrink: 0, boxShadow: "rgba(15,23,42,0.5) 0px 9px 20px -10px" }}>
                    <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    <span className="absolute right-1.5 top-1.5 grid place-items-center rounded-full" style={{ width: 24, height: 24, background: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)" }}><ArrowUpRight size={13} className="text-white" /></span>
                  </button>
                )}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", flex: "1 1 0%", minWidth: 0 }}>
                  <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ border: "1px solid #f97316", background: "transparent" }}>
                    <span className="relative flex h-1.5 w-1.5"><span className="pp-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-orange-500" /></span>
                    <span className="font-extrabold uppercase" style={{ fontSize: 9, letterSpacing: "0.14em", color: "#f97316" }}>Company Status</span>
                  </span>
                  <h2 className="font-extrabold tracking-tight text-slate-900" style={{ marginTop: 13, fontSize: 23, lineHeight: 1.08 }}>{status.statusHeadline}</h2>
                  {has(status.statusHeadlineSubtext) && <p className="font-medium text-slate-500" style={{ marginTop: 9, fontSize: 12, lineHeight: 1.35 }}><WordFade text={status.statusHeadlineSubtext} /></p>}
                </div>
              </div>
              {pct != null && (
                <div className="mt-7">
                  <div className="relative flex h-4 items-center">
                    <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-200"><div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${w}%`, background: "linear-gradient(90deg, #10b981, #34d399)", transition: "width 0.9s cubic-bezier(0.22,1,0.36,1)" }} /></div>
                    <div className="absolute z-10 h-4 w-4 rounded-full" style={{ left: `${w}%`, transform: "translateX(-50%)", background: "#047857", boxShadow: "#fff 0px 0px 0px 2.5px, rgba(4,120,87,0.35) 0px 0px 0px 4.5px, rgba(0,0,0,0.25) 0px 2px 6px -1px", transition: "left 0.9s cubic-bezier(0.22,1,0.36,1)" }} />
                  </div>
                  <div className="mt-1.5 flex justify-between"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{pb.current} / {pb.total} {pb.unit || pb.label}</span><span className="text-[10px] font-extrabold tabular-nums tracking-wider" style={{ color: "#0f9b73" }}>{pct}%</span></div>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 border-t border-slate-100">
              <div className="border-r border-slate-100"><StatusCell label="Latest Update" value={status.latestUpdate} small /></div>
              <StatusCell label="Investment Impact" value={status.investmentImpact} small />
            </div>
            <div className="grid grid-cols-2 border-t border-slate-100">
              <div className="border-r border-slate-100"><StatusCell label="Next Catalyst" value={status.nextCatalyst} /></div>
              <StatusCell label="Expected" value={status.expected} />
            </div>
          </div>
        </div>
        {/* BACK — full photo */}
        <button onClick={() => setFlipped(false)} aria-label="Show status details" className="absolute inset-0 overflow-hidden rounded-3xl border border-slate-200" style={{ backfaceVisibility: "hidden", pointerEvents: flipped ? "auto" : "none", boxShadow: CARD_SHADOW }}>
          {has(photo) && <img src={photo} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
          <span style={{ position: "absolute", inset: 0, background: "linear-gradient(rgba(0,0,0,0.1) 0%, rgba(0,0,0,0) 38%, rgba(0,0,0,0.3) 100%)" }} />
          <span className="absolute inline-flex items-center gap-1.5 rounded-full" style={{ bottom: 12, right: 12, padding: "5px 10px", background: "rgba(15,23,42,0.5)", backdropFilter: "blur(4px)" }}>
            <span className="font-bold uppercase text-white" style={{ fontSize: 8, letterSpacing: "0.12em" }}>Tap to flip back</span>
          </span>
        </button>
      </div>
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

      <button className="mt-3 block w-full overflow-hidden rounded-3xl text-left transition-transform active:scale-[0.98]" style={{ padding: 16, background: "radial-gradient(135% 130% at 88% 8%, #7ad6f8 0%, rgba(122,214,248,0) 45%), linear-gradient(140deg, #1b4fd0 0%, #2f86e6 58%, #49b4f0 100%)", boxShadow: "rgba(31,79,208,0.7) 0px 20px 40px -20px" }}>
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: "rgba(255,255,255,0.22)" }}><Zap size={15} className="text-white" strokeWidth={2.6} /></span>
          <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-white/85">AI Brief</span>
        </div>
        <p className="mt-2.5 font-extrabold leading-tight tracking-tight text-white" style={{ fontSize: 17 }}>Explain {name} in 60 Seconds</p>
        <p className="mt-1.5 font-medium leading-snug text-white/80" style={{ fontSize: 12 }}>{has(brief.shortSummary) ? brief.shortSummary : "AI-generated summary covering opportunity, risks, catalysts and project potential."}</p>
      </button>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-center gap-2 px-4 py-4 text-center transition active:scale-[0.99]" style={{ background: "#0f172a" }}>
          <span className="text-[14px] font-semibold tracking-tight text-white">Core Value Drivers</span>
          <ChevronDown size={18} strokeWidth={2.4} className="text-white transition-transform" style={{ transform: open ? "rotate(180deg)" : "none" }} />
        </button>
        <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 0.38s ease" }}>
          <div className="overflow-hidden">
            <div className="relative px-4 pb-4" style={{ paddingTop: 20 }}>
              {drivers.length ? (<>
                <span aria-hidden style={{ position: "absolute", left: 26, top: 31, bottom: 24, width: 2, borderRadius: 9999, background: "linear-gradient(#10b981, #34d399)" }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
                  {drivers.map((d, i) => (
                    <div key={i} className="relative flex items-center" style={{ gap: 14 }}>
                      <span className="relative z-10 grid flex-shrink-0 place-items-center rounded-full" style={{ width: 22, height: 22, background: "#fff", border: "2px solid #10b981", boxShadow: "0 0 0 3px rgba(16,185,129,0.12)" }}><Check size={12} strokeWidth={2.6} style={{ color: "#0f9b73" }} /></span>
                      <span className="font-semibold leading-snug tracking-tight" style={{ fontSize: 13, color: "#334155" }}>{d}</span>
                    </div>
                  ))}
                </div>
              </>) : <p className="text-center text-[13px] text-slate-400">Value drivers haven't been added yet.</p>}
            </div>
          </div>
        </div>
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

function Gallery({ images }) {
  const [idx, setIdx] = useState(0);
  if (!Array.isArray(images) || !images.length) {
    return <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/60 text-[13px] font-medium text-slate-400">No project photos yet</div>;
  }
  const onScroll = (e) => { const w = e.currentTarget.clientWidth || 1; setIdx(Math.round(e.currentTarget.scrollLeft / w)); };
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200" style={{ height: 300, background: "#0f172a" }}>
      <div onScroll={onScroll} className="pp-noscroll flex overflow-x-auto" style={{ height: "100%", scrollSnapType: "x mandatory" }}>
        {images.map((src, i) => (
          <div key={i} className="relative flex-shrink-0" style={{ width: "100%", height: "100%", scrollSnapAlign: "center" }}>
            <img src={src} alt="" draggable="false" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </div>
        ))}
      </div>
      {images.length > 1 && (
        <div className="pointer-events-none absolute inset-x-0 flex justify-center" style={{ bottom: 12, gap: 6 }}>
          {images.map((_, i) => (
            <span key={i} style={{ height: 5, width: i === idx ? 16 : 5, borderRadius: 999, background: i === idx ? "#fff" : "rgba(255,255,255,0.5)", transition: "0.3s", boxShadow: "rgba(2,6,23,0.4) 0px 1px 2px" }} />
          ))}
        </div>
      )}
    </div>
  );
}

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
      <Gallery images={p.gallery} />

      {/* per-project AI */}
      <div>
        <span className="px-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Project Intelligence</span>
        <button className="mt-2.5 flex w-full items-center gap-3 overflow-hidden rounded-2xl px-3.5 py-3 text-left transition active:scale-[0.98]" style={{ background: "linear-gradient(150deg, #0b1f4d 0%, #1d4ed8 100%)", boxShadow: "rgba(29,78,216,0.22) 0px 4px 16px" }}>
          <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-xl bg-white/15"><Zap size={16} className="text-white" strokeWidth={2.4} /></span>
          <span className="min-w-0 flex-1"><span className="block text-[13px] font-bold tracking-tight text-white">Understand this project in 60 seconds</span></span>
          <ChevronRight size={16} className="flex-shrink-0 text-white/80" />
        </button>
      </div>

      {/* snapshot */}
      <div>
        <p className="mb-2.5 px-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Project Snapshot</p>
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
        <p className="mb-2.5 px-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Technical Intelligence</p>
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
function Capital({ capital, company }) {
  const c = capital || {};
  const listings = Array.isArray(company?.listings) ? company.listings.slice(0, 3) : [];
  const funded = has(c.headline) || has(c.state);
  const runwayPct = typeof c.runwayPct === "number" ? c.runwayPct : (c.funded ? 100 : 0);
  const snap = [
    { value: c.financing, label: "Latest Financing", sub: c.financingNote, Icon: Coins },
    { value: c.cash, label: "Cash", sub: c.cashNote, Icon: Wallet },
    { value: fmtShares(c.outstanding), label: "Basic Shares", sub: "Issued & outstanding", Icon: Layers },
    { value: fmtShares(c.fd), label: "Fully Diluted", sub: "Incl. options & warrants", Icon: PieChart },
  ].filter((x) => has(x.value));

  if (!funded && !listings.length && !snap.length) return <EmptyState icon={PieChart} title="No capital structure yet" sub="Share structure and financials haven't been published." />;

  return (
    <div className="space-y-6">
      <div><span className="text-[10px] font-extrabold uppercase tracking-[0.2em]" style={{ color: "#6d28d9" }}>Financials</span><h2 className="-mt-0.5 text-xl font-bold tracking-tight text-slate-900">Capital</h2></div>

      {funded && (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white" style={{ boxShadow: CARD_SHADOW }}>
          <div className="px-5 pb-5 pt-5">
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ border: "1px solid #10b981", background: "transparent" }}>
              <span className="relative flex h-1.5 w-1.5"><span className="pp-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "#10b981" }} /><span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: "#10b981" }} /></span>
              <span className="font-extrabold uppercase" style={{ fontSize: 9, letterSpacing: "0.14em", color: "#0f9b73" }}>{c.state || "Fully Funded"}</span>
            </span>
            <h2 className="font-extrabold tracking-tight text-slate-900" style={{ marginTop: 13, fontSize: 25, lineHeight: 1.06 }}>{c.headline || c.state}</h2>
            {has(c.summary) && <p className="font-medium text-slate-500" style={{ marginTop: 9, fontSize: 12.5, lineHeight: 1.4 }}>{c.summary}</p>}
            {(has(c.runwayLeft) || has(c.runwayRight)) && (
              <div style={{ marginTop: 22 }}>
                <p className="px-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Funding Runway</p>
                <div className="relative mt-3 flex h-5 items-center px-1">
                  <div className="relative h-2 w-full rounded-full bg-slate-200">
                    <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${runwayPct}%`, background: "linear-gradient(90deg,#2563eb,#60a5fa)" }} />
                    <div className="absolute z-10 h-4 w-4 rounded-full" style={{ left: `${runwayPct}%`, top: "50%", transform: "translate(-50%,-50%)", background: "#1d4ed8", boxShadow: "#fff 0px 0px 0px 2.5px, rgba(37,99,235,0.35) 0px 0px 0px 4.5px, rgba(0,0,0,0.25) 0px 2px 6px -1px" }} />
                  </div>
                </div>
                <div className="mt-1.5 flex justify-between px-1"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{c.runwayLeft || "Today"}</span><span className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: "#2563eb" }}>{c.runwayRight || ""}</span></div>
              </div>
            )}
          </div>
        </div>
      )}

      {listings.length > 0 && (
        <div>
          <div className="flex items-baseline justify-between px-0.5"><span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Listings</span><span className="text-[9px] font-semibold uppercase tracking-wider text-slate-300">Delayed 15 min</span></div>
          <div className="mt-2.5 grid gap-2.5" style={{ gridTemplateColumns: `repeat(${listings.length}, minmax(0,1fr))` }}>
            {listings.map((l, i) => (
              <div key={i} className="flex flex-col items-center rounded-2xl p-3.5 text-center" style={{ background: "#0b0f17" }}>
                <p className="text-[8px] font-semibold uppercase tracking-wider" style={{ color: "#64748b" }}>{l.ex}</p>
                <p className="mt-1.5 text-[16px] font-extrabold tracking-tight text-white">{l.sym}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {snap.length > 0 && (
        <div>
          <span className="px-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Capital Snapshot</span>
          <div className="mt-2.5 grid grid-cols-2 gap-3">
            {snap.map((s, i) => (
              <div key={i} className="rounded-2xl bg-slate-50 p-5">
                <span className="grid h-8 w-8 place-items-center rounded-xl" style={{ background: "rgba(37,99,235,0.1)" }}><s.Icon size={16} style={{ color: "#2563eb" }} /></span>
                <p className="mt-3 text-[22px] font-extrabold leading-none tracking-tight text-slate-900 tabular-nums">{s.value}</p>
                <p className="mt-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{s.label}</p>
                {has(s.sub) && <p className="mt-1 text-[10px] font-medium tracking-tight text-slate-400">{s.sub}</p>}
              </div>
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
function Updates({ media, company = {} }) {
  const [tab, setTab] = useState("Updates");
  const all = Array.isArray(media) ? media : [];
  const list = tab === "Media" ? all.filter((u) => has(u.image)) : tab === "Reposts" ? [] : all;
  const emptyFor = { Updates: "No updates yet", Media: "No media yet", Reposts: "No reposts yet" };
  return (
    <div className="space-y-4">
      {/* Updates · Media · Reposts — matches the live company profile */}
      <div className="flex border-b border-slate-100">
        {["Updates", "Media", "Reposts"].map((t) => {
          const on = tab === t;
          return (
            <button key={t} onClick={() => setTab(t)} className="relative flex-1 pb-3 pt-1 text-[15px] font-bold" style={{ color: on ? "#0f172a" : "#94a3b8" }}>
              {t}{on && <span className="absolute -bottom-px left-1/2 h-0.5 w-10 -translate-x-1/2 rounded-full bg-slate-900" />}
            </button>
          );
        })}
      </div>
      {!list.length ? (
        <EmptyState icon={Radio} title={emptyFor[tab]} sub="Drilling, lab and corporate updates will stream in here as they're posted." />
      ) : (
        <div className="space-y-3.5">
          {list.map((u, i) => {
            const tone = UPD_TONE[(u.kind || "").toLowerCase()] || UPD_TONE.default;
            return (
              <div key={i} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                {/* company avatar + name (left), category pill (right) */}
                <div className="flex items-center gap-2">
                  <Avatar brand={company.brand} name={company.name} size={28} />
                  <span className="truncate text-[14px] font-bold tracking-tight text-slate-900">{company.name}</span>
                  <BadgeCheck size={14} className="flex-shrink-0 text-sky-500" />
                  <span className={`ml-auto flex-shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${tone}`}><FlaskConical size={12} /> {u.kind || "Update"}</span>
                </div>
                <p className="mt-3 text-[17px] font-bold leading-snug text-slate-900">{u.title}</p>
                {has(u.body) && <p className="mt-1.5 text-[14px] leading-snug text-slate-500">{u.body}</p>}
                {has(u.image) && <img src={u.image} alt="" className="mt-3 h-48 w-full rounded-2xl object-cover" />}
                {/* date bottom-right */}
                <div className="mt-2.5 flex justify-end"><span className="text-[12px] font-medium text-slate-400">{u.time || ""}</span></div>
              </div>
            );
          })}
        </div>
      )}
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
      <button className="flex flex-shrink-0 items-center gap-1.5 rounded-full border border-slate-900 bg-slate-900 px-3.5 py-1.5 text-[14px] font-bold text-white"><Check size={15} /> Following</button>
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
          {has(company.slogan) && <p className="mt-1 text-[15px] text-slate-500">{company.slogan}</p>}
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
      {/* plain back arrow only — no breadcrumb, no QR (matches the live company profile) */}
      {showBack && (
        <div className="flex flex-shrink-0 items-center bg-gradient-to-b from-slate-50 to-white px-3 pt-1.5">
          <button onClick={onBack} aria-label="Back" className="grid h-8 w-8 place-items-center text-slate-700"><ArrowLeft size={22} /></button>
        </div>
      )}

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
          {tab === "capital" && <Capital capital={profile.capital} company={company} />}
          {tab === "team" && <div className="space-y-5"><div><Eyebrow color="#0f766e">People</Eyebrow><h1 className="mt-1 text-[30px] font-extrabold tracking-tight text-slate-900">Team</h1></div><EmptyState icon={Users} title="No team listed" sub="Management and directors haven't been added to this Passport." /></div>}
          {tab === "updates" && <Updates media={profile.media} company={company} />}
        </div>
      </div>
    </div>
  );
}
