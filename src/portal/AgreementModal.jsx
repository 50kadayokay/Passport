import React, { useState } from "react";
import { X, FileText, Check, Loader2 } from "lucide-react";
import { recordAgreement } from "../lib/portal.js";
import { AGREEMENT_VERSION } from "./onboarding.js";

// The company-agreement acceptance step. Shows a short summary + a link to the full versioned
// agreement, records acceptance server-side (record_company_agreement RPC), then calls onDone.
// The legal text itself lives on the versioned /agreement page — this component does not author it.
export default function AgreementModal({ company, onClose, onDone }) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const accept = async () => {
    if (!checked || busy) return;
    setBusy(true); setErr("");
    const r = await recordAgreement(company.id, AGREEMENT_VERSION);
    setBusy(false);
    if (r && r.ok) { onDone && onDone(r); }
    else setErr("Couldn't record your acceptance. Please try again.");
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-600"><FileText size={18} /></span>
            <h2 className="text-[16px] font-extrabold text-slate-900">Company Agreement</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        <div className="px-6 py-5">
          <p className="text-[14px] leading-relaxed text-slate-600">
            Before {company.name || "your company"} goes live on MineEx, an authorized representative
            needs to accept the MineEx Company Agreement. It covers how your company profile and
            content are published and managed on MineEx.
          </p>
          <a href={`/agreements/${AGREEMENT_VERSION}.html`} target="_blank" rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-bold text-blue-600 hover:underline">
            Read the full agreement (v{AGREEMENT_VERSION}) <FileText size={13} />
          </a>

          <label className="mt-5 flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5" />
            <span className="text-[13.5px] font-medium text-slate-700">
              I am authorized to accept on behalf of {company.name || "this company"}, and I agree to the
              MineEx Company Agreement (v{AGREEMENT_VERSION}).
            </span>
          </label>

          {err && <p className="mt-3 text-[12.5px] font-semibold text-rose-500">{err}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4">
          <button onClick={onClose} className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-[13.5px] font-bold text-slate-600 hover:border-slate-300">Cancel</button>
          <button onClick={accept} disabled={!checked || busy}
            className={`inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-[13.5px] font-bold text-white ${checked && !busy ? "bg-slate-900 hover:bg-slate-800" : "cursor-not-allowed bg-slate-300"}`}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Accept &amp; continue
          </button>
        </div>
      </div>
    </div>
  );
}
