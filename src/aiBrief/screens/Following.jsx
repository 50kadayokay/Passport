import React, { useState } from "react";
import { Search, ArrowUpDown } from "lucide-react";
import { COMPANIES } from "../data.js";
import { ScanButton, SectionLabel, CompanyRow } from "../components.jsx";

const SUBTABS = ["Following", "Favourites", "Watchlist"];
// Following list = reverse of the discovery list, matching the design's order.
const LIST = [...COMPANIES].reverse();

export default function Following({ onOpen }) {
  const [tab, setTab] = useState("Following");
  return (
    <div className="pp-fade pb-6">
      <div className="flex items-start justify-between px-5 pt-3 pb-1">
        <div>
          <p className="text-[13px] font-bold uppercase tracking-[0.16em] text-emerald-600">Your Workspace</p>
          <h1 className="mt-1 text-[34px] font-extrabold leading-none tracking-tight text-slate-900">Following</h1>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="rounded-full bg-slate-100 px-3.5 py-2 text-[13px] font-bold text-slate-500"><span className="text-slate-900">{LIST.length}</span> FOLLOWING</span>
          <ScanButton />
        </div>
      </div>

      {/* segmented sub-tabs */}
      <div className="mt-4 px-5">
        <div className="flex rounded-2xl bg-slate-100 p-1">
          {SUBTABS.map((s) => (
            <button
              key={s}
              onClick={() => setTab(s)}
              className={`flex-1 rounded-xl py-2.5 text-[15px] font-bold transition ${tab === s ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* search */}
      <div className="mt-4 px-5">
        <div className="flex items-center gap-3 rounded-2xl bg-slate-100 px-4 py-3.5">
          <Search size={20} className="text-slate-400" />
          <input placeholder="Search this list" className="w-full bg-transparent text-[15px] text-slate-700 placeholder:text-slate-400 outline-none" />
        </div>
      </div>

      {/* list header */}
      <div className="mt-5 flex items-center justify-between px-5">
        <SectionLabel>{LIST.length} Following</SectionLabel>
        <button className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-[14px] font-bold text-slate-700">
          <ArrowUpDown size={15} /> Recent
        </button>
      </div>

      <div className="mt-3 space-y-3.5 px-5">
        {LIST.map((c) => <CompanyRow key={c.id} c={c} onOpen={onOpen} />)}
      </div>
    </div>
  );
}
