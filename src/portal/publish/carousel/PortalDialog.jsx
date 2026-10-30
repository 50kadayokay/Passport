// A portal dialog. Not window.prompt().
//
// The browser's prompt() is modal to the whole application, unstyled, and
// cannot be cancelled gracefully on a phone. Everything the carousel editor
// asks of a company -- a name, an overwrite, a deletion -- is asked here
// instead, in the portal's own type, with Escape and the backdrop both
// meaning "no".

import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";

export default function PortalDialog({ open, title, blurb, onClose, children, footer, width = 420 }) {
  const box = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", onKey, true);
    // Focus the first field so a name can be typed immediately -- the one
    // thing prompt() did get right.
    const t = setTimeout(() => {
      if (!box.current) return;
      // A name field first -- the one thing prompt() got right. Only if there
      // is nothing to type does focus fall to the first control.
      const el = box.current.querySelector("input:not([type=color]),textarea")
        || box.current.querySelector("[data-autofocus]")
        || box.current.querySelector("button");
      if (el) { el.focus(); if (el.select) el.select(); }
    }, 10);
    return () => { document.removeEventListener("keydown", onKey, true); clearTimeout(t); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-slate-900/25 backdrop-blur-[2px]" onClick={onClose} />
      <div ref={box} style={{ width }}
        className="relative max-h-[86vh] w-full overflow-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_24px_60px_-20px_rgba(15,23,42,.45)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[15.5px] font-extrabold tracking-tight text-slate-900">{title}</h3>
            {blurb && <p className="mt-1 text-[12.5px] leading-relaxed text-slate-500">{blurb}</p>}
          </div>
          <button onClick={onClose} aria-label="Close"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X size={15} strokeWidth={2.4} />
          </button>
        </div>
        <div className="mt-4">{children}</div>
        {footer && <div className="mt-5 flex items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export const DBTN = "rounded-xl bg-slate-900 px-3.5 py-2 text-[12.5px] font-bold text-white transition hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400";
export const DBTN_GHOST = "rounded-xl border border-slate-200 px-3.5 py-2 text-[12.5px] font-bold text-slate-500 transition hover:border-slate-300 hover:text-slate-700";
export const DBTN_DANGER = "rounded-xl bg-rose-600 px-3.5 py-2 text-[12.5px] font-bold text-white transition hover:bg-rose-700";
export const DINPUT = "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[13.5px] text-slate-800 outline-none transition focus:border-blue-400";
