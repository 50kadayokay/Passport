import React, { useState } from "react";
import { Search, Flame, Users } from "lucide-react";
import { COMPANIES, EXPLORE_FILTERS } from "../data.js";
import { ScreenHeader, ScanButton, SectionLabel, CompanyRow } from "../components.jsx";

export default function Explore({ onOpen }) {
  const [active, setActive] = useState("Trending");
  const chips = EXPLORE_FILTERS.slice(0, 4);
  return (
    <div className="pp-fade pb-6">
      <ScreenHeader eyebrow="Discover Companies" title="Explore" right={<ScanButton />} />

      {/* search */}
      <div className="mt-4 px-5">
        <div className="flex items-center gap-3 rounded-2xl bg-slate-100 px-4 py-3.5">
          <Search size={20} className="text-slate-400" />
          <input
            placeholder="Search companies, tickers, commodities"
            className="w-full bg-transparent text-[15px] text-slate-700 placeholder:text-slate-400 outline-none"
          />
        </div>
      </div>

      {/* filter chips */}
      <div className="pp-noscroll mt-4 flex gap-2.5 overflow-x-auto px-5 pb-1">
        {chips.map((f) => {
          const on = active === f;
          return (
            <button
              key={f}
              onClick={() => setActive(f)}
              className={`flex flex-shrink-0 items-center gap-1.5 rounded-full px-5 py-2.5 text-[15px] font-bold transition ${on ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"}`}
            >
              {f === "Trending" && <Flame size={15} fill={on ? "currentColor" : "none"} />}
              {f === "Analysts" && <Users size={15} />}
              {f}
            </button>
          );
        })}
      </div>

      {/* list */}
      <div className="mt-6 px-5"><SectionLabel>Featured Juniors</SectionLabel></div>
      <div className="mt-3 space-y-3.5 px-5">
        {COMPANIES.map((c) => <CompanyRow key={c.id} c={c} onOpen={onOpen} />)}
      </div>
    </div>
  );
}
