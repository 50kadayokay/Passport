// Onboarding steps at the top of the Conference Blueprint workbench: upload docs,
// download per-section prompts, and paste ChatGPT's JSON back. Loading applies to the
// company's PROFILE (null-safe merge); the reviewer then clicks "Re-sync" to project the
// fresh data into the blueprint fields/pools. Reuses the same DocPanel + section prompts
// as the App Blueprint, so the morning workflow lives here too.
import React, { useState } from "react";
import { DocPanel } from "../BlueprintReview.jsx";
import { CONFERENCE_SECTIONS, conferenceSectionPrompt } from "../promptTemplate.js";
import { parseImport, applyImport } from "../../lib/profileImport.js";
import { updateCompany } from "../../lib/supabase.js";
import { authHeaders } from "../../lib/auth.js";
import { mapProfileToPP } from "../../lib/profileToPP.js";

function downloadPrompt(id) {
  const text = conferenceSectionPrompt(id);
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
  const a = document.createElement("a"); a.href = url; a.download = `conference-${id}-prompt.md`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ConferenceOnboardingBar({ company, onLoaded }) {
  const [open, setOpen] = useState(true);
  const [paste, setPaste] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [hit, setHit] = useState("");
  if (!company || !company.slug) return null;

  const copyProfile = async () => {
    const clean = JSON.parse(JSON.stringify(company.profile || {}));
    delete clean.pp;
    const strip = (o) => { if (Array.isArray(o)) o.forEach(strip); else if (o && typeof o === "object") for (const k of Object.keys(o)) { if (typeof o[k] === "string" && o[k].startsWith("data:")) o[k] = ""; else strip(o[k]); } };
    strip(clean);
    try { await navigator.clipboard.writeText(JSON.stringify(clean)); setMsg({ ok: true, text: "Profile JSON copied — paste it with a section prompt." }); }
    catch { setMsg({ ok: false, text: "Clipboard blocked by the browser." }); }
  };

  const load = async () => {
    const parsed = parseImport(paste || "");
    if (!parsed.ok) { setMsg({ ok: false, text: parsed.error || "Couldn't parse that JSON." }); return; }
    setBusy(true);
    try {
      const { next } = applyImport(company.profile || {}, parsed.payload);
      const withPp = { ...next, pp: mapProfileToPP(next) };
      await updateCompany(company.slug, { profile: withPp }, await authHeaders());
      setPaste("");
      setMsg({ ok: true, text: `Loaded ${parsed.known.join(", ")}. Now click “Re-sync” above to pull it into the blueprint.` });
      if (onLoaded) onLoaded(withPp);
    } catch (e) { setMsg({ ok: false, text: e.message || "Load failed" }); }
    finally { setBusy(false); }
  };

  return (
    <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-3">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 text-left text-[12px] font-extrabold uppercase tracking-wide text-slate-500">
        <span className="grid h-5 w-5 place-items-center rounded bg-slate-200 text-[11px]">{open ? "–" : "+"}</span>
        Onboarding — upload docs, run section prompts, load the JSON
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <DocPanel companyId={company.id} />
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11.5px] font-bold uppercase tracking-wide text-slate-400">Section prompts:</span>
            {CONFERENCE_SECTIONS.map((s) => (
              <button key={s.id} onClick={() => { downloadPrompt(s.id); setHit(s.id); setTimeout(() => setHit(""), 1500); }}
                title={s.docs} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[12px] font-bold text-slate-600 hover:border-slate-400">
                {hit === s.id ? "✓ downloaded" : `${s.n}·${s.label}`}
              </button>
            ))}
            <button onClick={copyProfile} className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[12px] font-bold text-indigo-700 hover:bg-indigo-100">Copy profile JSON</button>
          </div>
          <textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste a section's JSON reply here…"
            className="h-24 w-full resize-y rounded-xl border border-slate-200 bg-white p-3 font-mono text-[12px] leading-relaxed text-slate-800 outline-none focus:border-slate-400" />
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={load} disabled={!paste.trim() || busy} className="rounded-lg bg-slate-900 px-3 py-1.5 text-[13px] font-bold text-white hover:bg-slate-700 disabled:opacity-40">{busy ? "Loading…" : "Load into profile"}</button>
            {msg && <span className={`text-[12px] font-semibold ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
