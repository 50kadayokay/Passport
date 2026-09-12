// Small shared UI pieces for the studio chrome.
//
// The studio is an operator tool, so its interface stays quiet: one neutral
// palette, one accent, real type hierarchy, and no decoration that competes with
// the artwork being previewed inside it.

import React from "react";

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold uppercase tracking-[0.09em] text-slate-400">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[12px] leading-snug text-slate-400">{hint}</span> : null}
    </label>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error" | "good"; children: React.ReactNode }) {
  const tones: Record<string, string> = {
    info: "border-slate-200 bg-slate-50 text-slate-600",
    warn: "border-amber-200 bg-amber-50 text-amber-800",
    error: "border-rose-200 bg-rose-50 text-rose-700",
    good: "border-emerald-200 bg-emerald-50 text-emerald-800",
  };
  return (
    <div className={`rounded-xl border px-3.5 py-2.5 text-[13px] leading-relaxed ${tones[tone]}`}>{children}</div>
  );
}

export function Button({
  children, onClick, disabled, variant = "primary", type = "button", className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "danger";
  type?: "button" | "submit";
  className?: string;
}) {
  const variants: Record<string, string> = {
    primary: "bg-slate-900 text-white hover:bg-slate-700",
    ghost: "border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300",
    danger: "border border-rose-200 text-rose-600 hover:bg-rose-50",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13.5px] font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

/** A statistic set at a readable size — the studio's own house style, not a card. */
export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-[10.5px] font-bold uppercase tracking-[0.11em] text-slate-400">{label}</div>
      <div className="mt-0.5 text-[22px] font-semibold leading-none tracking-tight text-slate-900 tabular-nums">{value}</div>
      {sub ? <div className="mt-1 text-[12px] text-slate-500">{sub}</div> : null}
    </div>
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-slate-200 pb-2">
      <h2 className="text-[12px] font-bold uppercase tracking-[0.11em] text-slate-500">{children}</h2>
      {right}
    </div>
  );
}
