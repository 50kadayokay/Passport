import React from "react";
import { Flame, Pickaxe, FileText, Globe, Video, TrendingUp, BadgeCheck } from "lucide-react";
import { MARKET, COMPANIES, FEATURED, ACTIVITY } from "../data.js";
import { ScreenHeader, ScanButton, SectionLabel, MonoTile, Pct } from "../components.jsx";

const ACT_ICON = { drill: Pickaxe, market: TrendingUp, doc: FileText, globe: Globe, video: Video };
const KIND_STYLE = {
  COMPANY: "text-indigo-500 bg-indigo-50",
  MARKET: "text-emerald-600 bg-emerald-50",
  INDUSTRY: "text-amber-600 bg-amber-50",
};

function MarketChip({ m }) {
  return (
    <div className="flex-shrink-0 w-[132px] rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <p className="text-[12px] font-bold uppercase tracking-widest text-slate-400">{m.key}</p>
      <p className="mt-2 text-[23px] font-extrabold tracking-tight text-slate-900">{m.price}</p>
      <p className="mt-1 text-[14px] font-bold"><Pct up={m.up}>{m.change}</Pct></p>
    </div>
  );
}

function TrendCard({ c, onOpen }) {
  return (
    <button onClick={() => onOpen(c.id)} className="flex-shrink-0 w-[300px] rounded-3xl border border-slate-100 bg-white p-4 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] active:scale-[0.99] transition">
      <div className="flex items-center gap-3">
        <MonoTile logo={c.logo} size={48} rounded={14} />
        <div className="min-w-0">
          <p className="truncate text-[18px] font-bold text-slate-900">{c.name}</p>
          <p className="text-[13px] font-medium text-slate-400">{c.exchange}: {c.ticker}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-[13px] font-bold text-orange-500">
        <Flame size={15} fill="currentColor" /> {c.tag}
      </div>
      <div className="mt-2 flex items-baseline justify-between">
        <p className="text-[22px] font-extrabold tracking-tight text-slate-900">{c.price}</p>
        <p className="text-[16px] font-bold"><Pct up={c.up}>{c.change}</Pct></p>
      </div>
    </button>
  );
}

export default function Today({ onOpen }) {
  return (
    <div className="pp-fade pb-6">
      <ScreenHeader eyebrow="Junior Mining" title="Today" right={<ScanButton />} />

      {/* Today's Market */}
      <div className="mt-5 px-5"><SectionLabel>Today's Market</SectionLabel></div>
      <div className="pp-noscroll mt-3 flex gap-3 overflow-x-auto px-5 pb-1">
        {MARKET.map((m) => <MarketChip key={m.key} m={m} />)}
      </div>

      {/* Trending Companies */}
      <div className="mt-7 px-5"><SectionLabel>Trending Companies</SectionLabel></div>
      <div className="pp-noscroll mt-3 flex gap-3.5 overflow-x-auto px-5 pb-1">
        {COMPANIES.filter((c) => c.tag).map((c) => <TrendCard key={c.id} c={c} onOpen={onOpen} />)}
      </div>

      {/* Featured Update */}
      <div className="mt-7 px-5"><SectionLabel>Featured Update</SectionLabel></div>
      <div className="mt-3 px-5">
        <button onClick={() => onOpen("kingsmen-resources")} className="block w-full overflow-hidden rounded-3xl bg-white text-left shadow-[0_8px_24px_-12px_rgba(15,23,42,0.25)] border border-slate-100">
          <div className="relative h-40 bg-gradient-to-br from-slate-800 to-slate-900 px-5 py-4">
            <span className="inline-block rounded-lg bg-white/15 px-3 py-1 text-[12px] font-bold uppercase tracking-widest text-white/90">{FEATURED.badge}</span>
            <Flame size={110} className="absolute -bottom-4 right-1 text-white/5" strokeWidth={1.5} />
          </div>
          <div className="px-5 py-4">
            <p className="text-[21px] font-extrabold leading-tight tracking-tight text-slate-900">{FEATURED.title}</p>
            <p className="mt-3 text-[14px] font-medium text-slate-400">{FEATURED.source} · {FEATURED.time}</p>
          </div>
        </button>
      </div>

      {/* Latest Activity */}
      <div className="mt-7 px-5"><SectionLabel>Latest Activity</SectionLabel></div>
      <div className="mt-3 space-y-3 px-5">
        {ACTIVITY.map((a, i) => {
          const Icon = ACT_ICON[a.icon] || FileText;
          return (
            <div key={i} className="flex items-start gap-3.5 rounded-3xl border border-slate-100 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl bg-indigo-50 text-indigo-500">
                <Icon size={20} strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${KIND_STYLE[a.kind]}`}>{a.kind}</span>
                  <span className="truncate text-[14px] font-semibold text-slate-700">{a.who}</span>
                  {a.verified && <BadgeCheck size={15} className="flex-shrink-0 text-emerald-500" />}
                  <span className="ml-auto flex-shrink-0 text-[13px] font-medium text-slate-400">{a.time}</span>
                </div>
                <p className="mt-1 text-[16px] font-bold leading-snug text-slate-900">{a.title}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
