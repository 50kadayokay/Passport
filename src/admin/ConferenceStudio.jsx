// ConferenceStudio — admin section to set a company's Conference Mode look: pick a TEMPLATE, THEME
// and ACCENT, preview it live on the company's real data, and save the choice to
// profile.conference.studio. Reuses the V3 renderer via the /confv3demo preview route (dev) and the
// canonical companies table + updateCompany — no second store, no new publish path.
import React, { useMemo, useState, useEffect } from "react";
import { Presentation, Check, Loader2, ExternalLink } from "lucide-react";
import { updateCompany } from "../lib/supabase.js";
import { authHeaders } from "../lib/auth.js";
import { TEMPLATE_LIST, THEME_LIST } from "../aiBrief/conferenceV3/ConferenceV3.jsx";

const THEMES = THEME_LIST.map((t) => ({ key: t.key, label: t.label, chip: t.dot }));
const PRESETS = ["#c9a86a", "#c8703a", "#2fb37a", "#43e0b0", "#b57be0", "#d8556b"];

export default function ConferenceStudio({ companies = [], reload }) {
  const withToken = useMemo(() => companies.filter((c) => c.preview_token), [companies]);
  const sorted = useMemo(() => withToken.slice().sort((a, b) => String(a.name || a.slug).localeCompare(String(b.name || b.slug))), [withToken]);
  const [slug, setSlug] = useState(sorted[0] ? sorted[0].slug : "");
  const company = sorted.find((c) => c.slug === slug) || null;

  const [template, setTemplate] = useState("monolith");
  const [theme, setTheme] = useState("obsidian");
  const [accent, setAccent] = useState("");     // "" = theme default
  const [busy, setBusy] = useState(false); const [saved, setSaved] = useState(false); const [err, setErr] = useState("");

  // load the company's saved selection when it changes
  useEffect(() => {
    const s = (company && company.profile && company.profile.conference && company.profile.conference.studio) || {};
    setTemplate(s.template || "monolith"); setTheme(s.theme || "obsidian"); setAccent(s.accent || ""); setSaved(false); setErr("");
  }, [slug]); // eslint-disable-line

  const previewSrc = company
    ? `/confv3demo?c=${encodeURIComponent(company.slug)}&preview=${company.preview_token}&t=${template}&theme=${theme}${accent ? "&accent=" + accent.replace("#", "") : ""}&bar=0`
    : "";

  const save = async () => {
    if (!company) return;
    setBusy(true); setErr(""); setSaved(false);
    try {
      const profile = JSON.parse(JSON.stringify(company.profile || {}));
      profile.conference = { ...(profile.conference || {}), studio: { template, theme, accent } };
      const updated = await updateCompany(company.slug, { profile }, await authHeaders());
      if (!updated) throw new Error("Save returned no rows.");
      company.profile = profile; setSaved(true); reload && reload();
    } catch (e) { setErr(String(e.message || e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex h-full w-full bg-slate-50">
      {/* CONTROLS */}
      <div className="flex w-[360px] flex-shrink-0 flex-col gap-6 overflow-y-auto border-r border-slate-200 bg-white px-6 py-6">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-slate-900 text-white"><Presentation size={17} /></div>
          <div><div className="text-[16px] font-extrabold tracking-tight text-slate-900">Conference Studio</div><div className="text-[11.5px] text-slate-400">Pick a look, save it per company</div></div>
        </div>

        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Company</span>
          <select value={slug} onChange={(e) => setSlug(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13.5px] font-semibold text-slate-800 outline-none focus:border-slate-300 focus:bg-white">
            {sorted.map((c) => <option key={c.slug} value={c.slug}>{c.name || c.slug}{(c.status || "").toLowerCase() === "published" ? " · live" : " · draft"}</option>)}
          </select>
        </label>

        <div>
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Template</span>
          <div className="mt-2 grid max-h-[300px] grid-cols-2 gap-1 overflow-auto rounded-xl border border-slate-200 bg-slate-50/60 p-2 sm:grid-cols-3">
            {TEMPLATE_LIST.map((t) => (
              <button key={t.key} onClick={() => { setTemplate(t.key); setSaved(false); }}
                className={`rounded-lg px-3 py-2 text-left text-[12px] font-bold transition active:scale-95 ${template === t.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-white hover:text-slate-900"}`}>{t.label}</button>
            ))}
          </div>
        </div>

        <div>
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Theme</span>
          <div className="mt-2 flex gap-2.5">
            {THEMES.map((t) => (
              <button key={t.key} onClick={() => { setTheme(t.key); setAccent(""); setSaved(false); }} title={t.label}
                className={`h-9 w-9 rounded-full border-2 transition active:scale-95 ${theme === t.key ? "border-blue-600" : "border-slate-200"}`} style={{ background: t.chip }} />
            ))}
          </div>
        </div>

        <div>
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Accent</span>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="relative h-9 w-9 overflow-hidden rounded-full border-2 border-slate-200" style={{ background: accent || "#94a3b8" }} title="Custom accent">
              <input type="color" value={accent || "#c9a86a"} onChange={(e) => { setAccent(e.target.value); setSaved(false); }} className="absolute -inset-2 h-[calc(100%+16px)] w-[calc(100%+16px)] cursor-pointer opacity-0" />
            </label>
            {PRESETS.map((c) => <button key={c} onClick={() => { setAccent(c); setSaved(false); }} title={c} className="h-6 w-6 rounded-full transition hover:scale-110" style={{ background: c }} />)}
            {accent && <button onClick={() => { setAccent(""); setSaved(false); }} className="text-[11px] font-bold text-slate-400 hover:text-slate-700">reset</button>}
          </div>
        </div>

        <div className="mt-auto">
          {err && <p className="mb-2 text-[12px] font-semibold text-rose-600">{err}</p>}
          <button onClick={save} disabled={busy || !company} className="flex w-full items-center justify-center gap-2 rounded-full bg-slate-900 py-3 text-[14.5px] font-bold text-white transition active:scale-[0.99] disabled:opacity-40">
            {busy ? <Loader2 size={16} className="animate-spin" /> : saved ? <><Check size={16} /> Saved</> : "Save look"}
          </button>
          {company && <a href={previewSrc.replace("&bar=0", "")} target="_blank" rel="noreferrer" className="mt-2 flex items-center justify-center gap-1.5 text-[12px] font-bold text-slate-400 hover:text-slate-700"><ExternalLink size={12} /> Open full preview</a>}
        </div>
      </div>

      {/* LIVE PREVIEW */}
      <div className="min-w-0 flex-1 bg-slate-100 p-4">
        {company ? (
          <iframe key={previewSrc} src={previewSrc} title="Conference preview" className="h-full w-full rounded-2xl border border-slate-200 bg-white shadow-sm" />
        ) : <div className="grid h-full place-items-center text-[13px] text-slate-400">Select a company to preview.</div>}
      </div>
    </div>
  );
}
