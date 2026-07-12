import React from "react";
import { Sparkles, Compass, Star, User, ScanLine, ChevronRight, BadgeCheck } from "lucide-react";

/* ---------- phone chrome ---------- */

export function StatusBar() {
  return (
    <div className="relative flex items-center justify-between px-8 pt-3 pb-1.5 flex-shrink-0">
      <span className="text-[15px] font-semibold text-slate-900 tabular-nums tracking-tight">9:41</span>
      {/* notch */}
      <div className="absolute left-1/2 top-2.5 -translate-x-1/2 h-6 w-28 rounded-full bg-slate-900" />
      <div className="flex items-center gap-1.5">
        {/* signal */}
        <div className="flex items-end gap-[2px] h-3">
          {[6, 8, 10, 12].map((h, i) => (
            <span key={i} className="w-[3px] rounded-sm bg-slate-900" style={{ height: h }} />
          ))}
        </div>
        {/* wifi */}
        <svg width="16" height="12" viewBox="0 0 16 12" className="text-slate-900">
          <path d="M8 11.5a1.3 1.3 0 100-2.6 1.3 1.3 0 000 2.6z" fill="currentColor" />
          <path d="M3.2 6.4a7 7 0 019.6 0M1 4.2a10.2 10.2 0 0114 0M5.4 8.6a3.8 3.8 0 015.2 0" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" />
        </svg>
        {/* battery */}
        <div className="ml-0.5 flex items-center">
          <div className="h-[11px] w-[22px] rounded-[3px] border border-slate-900/80 p-[1.5px]">
            <div className="h-full w-[75%] rounded-[1px] bg-slate-900" />
          </div>
          <div className="h-[5px] w-[1.5px] rounded-r-sm bg-slate-900/80" />
        </div>
      </div>
    </div>
  );
}

const NAV = [
  { id: "today", Icon: Sparkles },
  { id: "explore", Icon: Compass },
  { id: "following", Icon: Star },
  { id: "profile", Icon: User },
];

export function BottomNav({ active, onChange }) {
  return (
    <div className="flex-shrink-0 border-t border-slate-100 bg-white px-6 pt-2.5 pb-5">
      <div className="flex items-center justify-between">
        {NAV.map(({ id, Icon }) => {
          const on = active === id;
          return (
            <button
              key={id}
              aria-label={id}
              onClick={() => onChange(id)}
              className={`grid h-11 w-14 place-items-center rounded-2xl transition-colors ${on ? "bg-slate-100" : ""}`}
            >
              <Icon size={24} strokeWidth={on ? 2.4 : 2} className={on ? "text-slate-900" : "text-slate-400"} fill={id === "today" && on ? "currentColor" : "none"} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* Round "scan QR" button that sits at the top-right of every main screen header. */
export function ScanButton() {
  return (
    <button aria-label="Scan QR code" className="grid h-11 w-11 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm">
      <ScanLine size={20} strokeWidth={2} />
    </button>
  );
}

/* ---------- small shared bits ---------- */

export function SectionLabel({ children, className = "" }) {
  return (
    <p className={`text-[13px] font-bold uppercase tracking-[0.14em] text-slate-400 ${className}`}>{children}</p>
  );
}

export function ScreenHeader({ eyebrow, title, right }) {
  return (
    <div className="flex items-start justify-between px-5 pt-3 pb-1">
      <div>
        <p className="text-[13px] font-bold uppercase tracking-[0.16em] text-emerald-600">{eyebrow}</p>
        <h1 className="mt-1 text-[34px] font-extrabold leading-none tracking-tight text-slate-900">{title}</h1>
      </div>
      {right}
    </div>
  );
}

export function Pct({ up, children }) {
  return <span className={up ? "text-emerald-600" : "text-rose-500"}>{children}</span>;
}

/* Initials from a company name, dropping legal suffixes. "Kingsmen Resources Ltd." → "KR" */
export function initialsOf(name) {
  const words = String(name || "").trim().split(/\s+/).filter((w) => !/^(ltd\.?|inc\.?|corp\.?|limited|co\.?|plc)$/i.test(w));
  return (words.slice(0, 2).map((w) => w[0]).join("") || "?").toUpperCase();
}

/* Generic company avatar — brand image if present, else initials tile.
   Nothing here is company-specific; every company renders the same way. */
export function Avatar({ brand, name, size = 86, rounded = "9999px" }) {
  const img = brand?.avatar || brand?.logo;
  const style = { width: size, height: size, borderRadius: rounded };
  if (img) return <img src={img} alt="" className="flex-shrink-0 object-cover" style={style} />;
  return (
    <div className="grid flex-shrink-0 place-items-center bg-slate-900 font-extrabold text-white" style={{ ...style, fontSize: Math.round(size * 0.3), letterSpacing: "-0.03em" }}>
      {initialsOf(name)}
    </div>
  );
}

/* Abbreviate a share count: "34,523,086" → "34.5M". Leaves pre-formatted money alone. */
export function fmtShares(v) {
  if (v == null || v === "") return "";
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  if (!n) return String(v);
  if (/[a-z$]/i.test(String(v))) return String(v); // already has currency / suffix
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(v);
}

/* Company logo tile — monogram for discovery-list peers. */
export function MonoTile({ logo, size = 56, rounded = 16 }) {
  const style = { width: size, height: size, borderRadius: rounded, background: logo.bg, color: logo.fg };
  return (
    <div className="grid flex-shrink-0 place-items-center font-extrabold" style={style}>
      {logo.brand ? (
        <span className="text-[20px]" style={{ letterSpacing: "-0.04em" }}>{logo.mono}</span>
      ) : (
        <span className="text-[17px] tracking-tight">{logo.mono}</span>
      )}
    </div>
  );
}

/* List row used on Explore and Following. */
export function CompanyRow({ c, onOpen }) {
  return (
    <button onClick={() => onOpen(c.id)} className="flex w-full items-center gap-3.5 rounded-3xl border border-slate-100 bg-white p-3.5 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] active:scale-[0.995] transition">
      <MonoTile logo={c.logo} size={56} rounded={16} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[19px] font-bold text-slate-900">{c.name}</p>
          {c.verified && <BadgeCheck size={17} className="flex-shrink-0 text-emerald-500" />}
        </div>
        <p className="mt-0.5 truncate text-[13.5px] font-medium text-slate-400">
          {c.exchange}: {c.ticker} · {c.commodities.join(" · ")}
        </p>
        <p className="mt-0.5 flex items-center gap-1 truncate text-[13px] text-slate-400">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="flex-shrink-0"><path d="M12 21s7-6.4 7-11a7 7 0 10-14 0c0 4.6 7 11 7 11z" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="2"/></svg>
          {c.location}
        </p>
      </div>
      <div className="flex flex-shrink-0 flex-col items-end">
        <p className="text-[18px] font-bold text-slate-900">{c.price}</p>
        <p className="text-[15px] font-bold"><Pct up={c.up}>{c.change}</Pct></p>
      </div>
      <ChevronRight size={18} className="flex-shrink-0 text-slate-300" />
    </button>
  );
}
