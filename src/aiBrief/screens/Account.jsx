import React from "react";
import { Bell, TrendingUp, Wallet, Search, Telescope, Activity, Settings, ChevronRight } from "lucide-react";
import { ACCOUNT } from "../data.js";
import { ScreenHeader, ScanButton } from "../components.jsx";

const MENU_ICON = { bell: Bell, price: TrendingUp, wallet: Wallet, search: Search, scope: Telescope, analytics: Activity, settings: Settings };

export default function Account() {
  return (
    <div className="pp-fade pb-6">
      <ScreenHeader eyebrow="Account" title="Profile" right={<ScanButton />} />

      {/* user card */}
      <div className="mt-4 px-5">
        <div className="flex items-center gap-4 rounded-3xl border border-slate-100 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="grid h-16 w-16 flex-shrink-0 place-items-center rounded-full bg-slate-900 text-[20px] font-bold text-white">{ACCOUNT.initials}</div>
          <div className="min-w-0 flex-1">
            <p className="text-[21px] font-extrabold tracking-tight text-slate-900">{ACCOUNT.name}</p>
            <p className="mt-0.5 text-[14px] font-medium leading-snug text-slate-400">{ACCOUNT.meta}</p>
          </div>
          <button className="flex-shrink-0 rounded-full border border-slate-200 px-4 py-2 text-[14px] font-bold text-slate-700">Edit</button>
        </div>
      </div>

      {/* stat tiles */}
      <div className="mt-3 grid grid-cols-3 gap-3 px-5">
        {ACCOUNT.stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-slate-100 bg-white py-5 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <p className="text-[26px] font-extrabold text-slate-900">{s.value}</p>
            <p className="mt-1 text-[12px] font-bold uppercase tracking-wider text-slate-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* menu groups */}
      <div className="mt-4 space-y-4 px-5">
        {ACCOUNT.menu.map((group, gi) => (
          <div key={gi} className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            {group.map((item, ii) => {
              const Icon = MENU_ICON[item.icon] || Bell;
              return (
                <button key={item.title} className={`flex w-full items-center gap-4 px-5 py-4 text-left ${ii > 0 ? "border-t border-slate-100" : ""}`}>
                  <Icon size={22} className="flex-shrink-0 text-slate-500" strokeWidth={2} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[17px] font-bold text-slate-900">{item.title}</p>
                    {item.sub && <p className="mt-0.5 text-[14px] font-medium text-slate-400">{item.sub}</p>}
                  </div>
                  <ChevronRight size={18} className="flex-shrink-0 text-slate-300" />
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
