// src/portal/BriefReview.jsx — portal review surface for the MineEx BriefV1.
//
// Targeted upgrade to the EXISTING press-release feature — not a new publishing system:
//   1. Company picks one of its existing releases (read from the profile it already owns).
//   2. "Generate Brief" calls /api/brief-generate (OpenAI gpt-4o-mini via MINEEX_BRIEF_API_KEY),
//      which reuses the SAME generator + validator used to design/approve BriefV1.
//   3. The company reviews the deterministic PASS / REVIEW / FAIL verdict, edits the Brief, and
//      previews it in the LOCKED BriefV1 design.
//   4. "Save Brief" writes `v2` onto that release via the EXISTING updateCompanyProfile; the app
//      reader then renders it. Making the company LIVE uses the existing publish flow — this panel
//      adds no new approval/publish path.
// Nothing here publishes on its own. Historical summaries are untouched.

import React, { useEffect, useMemo, useState } from "react";
import { loadPortalCompany, updateCompanyProfile } from "../lib/portal.js";
import { authHeaders } from "../lib/auth.js";

const EM = "#2563EB", EM_TEXT = "#1d4ed8";
const sourceTextOf = (item) =>
  (item && (item.fullText || item.sourceText || item.label || item.headline || "")) || "";

// Flatten profile.pp.PR_YEARS → a selectable list of releases (newest first).
function listReleases(profile) {
  const years = (profile && profile.pp && Array.isArray(profile.pp.PR_YEARS)) ? profile.pp.PR_YEARS : [];
  const out = [];
  years.forEach((yr, yi) => (yr.items || []).forEach((it, ii) => out.push({
    yi, ii, year: yr.year, id: it.id || `${yr.year}-${ii}`,
    headline: it.headline || it.label || "(untitled release)",
    hasText: !!(it.fullText && String(it.fullText).trim().length > 40),
    hasBrief: !!(it.v2 && (it.v2.head || it.v2.wh)),
  })));
  return out;
}

const VerdictPill = ({ status }) => {
  const m = {
    PASS:   { t: "PASS",   c: "#047857", bg: "rgba(5,150,105,0.10)" },
    REVIEW: { t: "REVIEW", c: "#b45309", bg: "rgba(217,119,6,0.12)" },
    FAIL:   { t: "FAIL",   c: "#b91c1c", bg: "rgba(220,38,38,0.12)" },
  }[status] || { t: status || "—", c: "#64748b", bg: "rgba(100,116,139,0.1)" };
  return <span className="rounded-md px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wider" style={{ color: m.c, background: m.bg }}>{m.t}</span>;
};

// Faithful, compact preview in the LOCKED BriefV1 design (same tokens/structure as the app reader).
function BriefPreview({ v2 }) {
  const kr = Array.isArray(v2.kr) ? v2.kr : [];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4" style={{ maxWidth: 390 }}>
      <h3 className="text-[16px] font-extrabold leading-snug tracking-tight text-slate-900">{v2.head}</h3>
      <div className="mt-4">
        <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-900">What Happened</span>
        <p className="mt-1.5 text-[13.5px] font-medium leading-relaxed text-slate-600">{v2.wh}</p>
      </div>
      <div className="mt-4">
        <span className="text-[10px] font-extrabold uppercase tracking-[0.16em]" style={{ color: EM_TEXT }}>Why It Matters</span>
        <p className="mt-1.5 text-[13.5px] font-medium leading-relaxed text-slate-600">{v2.wy}</p>
      </div>
      {kr.length > 0 && (
        <div className="mt-5">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-slate-900">Key Results</span>
          <div className="mt-2">
            {kr.map((r, i) => {
              const vlen = String(r.v || "").length;
              const vsize = vlen <= 6 ? 21 : vlen <= 9 ? 17 : vlen <= 12 ? 15 : 13;
              return (
              <div key={i} className={`flex items-start gap-4 py-3 ${i > 0 ? "border-t border-slate-100" : ""}`}>
                <div className="w-[124px] flex-shrink-0">
                  <div className="font-extrabold leading-tight tracking-tight tabular-nums break-words" style={{ color: EM_TEXT, fontSize: vsize }}>{r.v}</div>
                  {r.u && <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">{r.u}</div>}
                </div>
                <div className="min-w-0 flex-1 pt-px">
                  <div className="text-[13.5px] font-semibold leading-snug text-slate-800">
                    {r.rel && <span className="mr-1.5 text-[9.5px] font-extrabold uppercase tracking-[0.1em]" style={{ color: EM }}>{r.rel}</span>}
                    {r.rel && <span className="mr-1.5 text-slate-300">·</span>}
                    {r.desc}
                  </div>
                  {r.sec && <div className="mt-0.5 text-[12px] font-medium leading-snug text-slate-500">{r.sec}</div>}
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}
      {v2.tk && (
        <div className="mt-5 rounded-2xl px-4 py-3.5" style={{ background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.16)" }}>
          <span className="text-[10px] font-extrabold uppercase tracking-[0.14em]" style={{ color: EM_TEXT }}>The Takeaway</span>
          <p className="mt-1.5 text-[13.5px] font-semibold leading-relaxed text-slate-700">{v2.tk}</p>
        </div>
      )}
    </div>
  );
}

export default function BriefReview({ company }) {
  const companyId = company && company.id;
  const [profile, setProfile] = useState(null);
  const [releases, setReleases] = useState([]);
  const [selId, setSelId] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);   // { v2, validation, meta }
  const [v2, setV2] = useState(null);            // editable copy
  const [saved, setSaved] = useState(false);

  useEffect(() => { (async () => {
    if (!companyId) return;
    try {
      const c = await loadPortalCompany(companyId);
      setProfile(c && c.profile ? c.profile : {});
      const list = listReleases(c && c.profile);
      setReleases(list);
      if (list[0]) { setSelId(list[0].id); }
    } catch (e) { setErr(`Could not load your releases: ${e.message || e}`); }
  })(); }, [companyId]);

  const sel = useMemo(() => releases.find((r) => r.id === selId) || null, [releases, selId]);

  // When a release is picked, prefill the source text from its stored full release (if any).
  useEffect(() => {
    if (!sel || !profile) return;
    const item = profile.pp.PR_YEARS[sel.yi].items[sel.ii];
    setSourceText(sourceTextOf(item));
    setResult(null); setV2(null); setSaved(false); setErr("");
  }, [selId]); // eslint-disable-line

  async function generate() {
    setErr(""); setSaved(false);
    if (!sourceText || sourceText.trim().length < 40) { setErr("Paste the press-release text first (a short paragraph is enough)."); return; }
    setBusy(true);
    try {
      const h = await authHeaders();
      const res = await fetch("/api/brief-generate", {
        method: "POST",
        headers: { "content-type": "application/json", ...h },
        body: JSON.stringify({ companyId, sourceText, companyName: company.name || "", sourceDate: sel ? String(sel.year) : "" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Generation failed (${res.status}).`);
      setResult(data);
      setV2(JSON.parse(JSON.stringify(data.v2)));
    } catch (e) { setErr(e.message || String(e)); }
    finally { setBusy(false); }
  }

  async function save() {
    if (!sel || !v2) return;
    setBusy(true); setErr("");
    try {
      const next = JSON.parse(JSON.stringify(profile));
      next.pp.PR_YEARS[sel.yi].items[sel.ii].v2 = v2;
      // Record a lightweight, non-authoritative review note alongside the Brief (audit lives in
      // the existing activity_log / profile versions — this is just convenience metadata).
      next.pp.PR_YEARS[sel.yi].items[sel.ii].briefMeta = {
        status: result && result.validation ? result.validation.status : "EDITED",
        model: result && result.meta ? result.meta.model : "",
        reviewedAt: new Date().toISOString(),
      };
      await updateCompanyProfile(companyId, next);
      setProfile(next); setSaved(true);
      setReleases(listReleases(next));
    } catch (e) { setErr(`Save failed: ${e.message || e}`); }
    finally { setBusy(false); }
  }

  const fld = (label, val, set, rows = 2) => (
    <label className="block">
      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <textarea value={val || ""} onChange={(e) => set(e.target.value)} rows={rows}
        className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-[13px] text-slate-800 focus:border-blue-400 focus:outline-none" />
    </label>
  );

  if (!companyId) return <div className="p-6 text-slate-500">Select a company.</div>;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="text-[22px] font-extrabold tracking-tight text-slate-900">Press-Release Brief</h1>
      <p className="mt-1 text-[14px] text-slate-500">Generate the investor Brief for a release, review the factual check, edit it, then save. It appears in the app once the company is published — the Brief uses your existing publish flow.</p>

      {err && <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700">{err}</div>}

      {/* Step 1 — pick a release */}
      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Release</span>
        <select value={selId} onChange={(e) => setSelId(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 p-2 text-[13px]">
          {releases.length === 0 && <option value="">No releases found in your profile</option>}
          {releases.map((r) => <option key={r.id} value={r.id}>{r.year} · {r.headline}{r.hasBrief ? "  ✓ brief" : ""}</option>)}
        </select>
        <div className="mt-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Press-release text (source)</span>
          <textarea value={sourceText} onChange={(e) => setSourceText(e.target.value)} rows={6}
            placeholder="Paste the full press-release text here…"
            className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-[13px] text-slate-800 focus:border-blue-400 focus:outline-none" />
          <p className="mt-1 text-[12px] text-slate-400">The original release, images and disclosures are preserved — this text is only the source the Brief is grounded in.</p>
        </div>
        <button onClick={generate} disabled={busy}
          className="mt-3 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: EM }}>
          {busy ? "Generating…" : (result ? "Regenerate Brief" : "Generate Brief")}
        </button>
      </div>

      {/* Step 2 — verdict + edit + preview */}
      {v2 && (
        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Factual check</span>
              <VerdictPill status={result.validation.status} />
            </div>
            {result.validation.status !== "PASS" && (
              <ul className="mt-2 space-y-1 text-[12.5px] text-slate-600">
                {result.validation.factualErrors.map((f, i) => <li key={"f" + i}>⚠️ <b>Factual:</b> {f}</li>)}
                {result.validation.evidenceIssues.map((f, i) => <li key={"e" + i}>🔎 <b>Review:</b> {f}</li>)}
              </ul>
            )}
            {result.validation.status === "FAIL" && <p className="mt-2 text-[12.5px] font-semibold text-red-700">Resolve factual errors before publishing.</p>}
            {result.validation.status === "REVIEW" && <p className="mt-2 text-[12.5px] font-semibold text-amber-700">Confirm the flagged claims against your source before publishing.</p>}

            <div className="mt-4 space-y-3">
              {fld("Headline", v2.head, (x) => setV2({ ...v2, head: x }), 2)}
              {fld("What Happened", v2.wh, (x) => setV2({ ...v2, wh: x }), 3)}
              {fld("Why It Matters", v2.wy, (x) => setV2({ ...v2, wy: x }), 3)}
              {(v2.kr || []).map((r, i) => (
                <div key={i} className="rounded-lg bg-slate-50 p-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input value={r.v || ""} onChange={(e) => { const kr = [...v2.kr]; kr[i] = { ...kr[i], v: e.target.value }; setV2({ ...v2, kr }); }} placeholder="value" className="rounded border border-slate-200 p-1.5 text-[12.5px]" />
                    <input value={r.u || ""} onChange={(e) => { const kr = [...v2.kr]; kr[i] = { ...kr[i], u: e.target.value }; setV2({ ...v2, kr }); }} placeholder="unit" className="rounded border border-slate-200 p-1.5 text-[12.5px]" />
                  </div>
                  <input value={r.desc || ""} onChange={(e) => { const kr = [...v2.kr]; kr[i] = { ...kr[i], desc: e.target.value }; setV2({ ...v2, kr }); }} placeholder="descriptor" className="mt-1 w-full rounded border border-slate-200 p-1.5 text-[12.5px]" />
                  <button onClick={() => setV2({ ...v2, kr: v2.kr.filter((_, j) => j !== i) })} className="mt-1 text-[11px] font-semibold text-red-500">remove row</button>
                </div>
              ))}
              {fld("The Takeaway (optional — leave blank to omit)", v2.tk, (x) => setV2({ ...v2, tk: x }), 2)}
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button onClick={save} disabled={busy || result.validation.status === "FAIL"}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: "#0f172a" }}>
                {saved ? "Saved ✓" : "Save Brief to release"}
              </button>
              {result.validation.status === "FAIL" && <span className="text-[12px] font-semibold text-red-600">Blocked: fix factual errors first.</span>}
            </div>
            <p className="mt-2 text-[12px] text-slate-400">Saving attaches the Brief to this release. It becomes visible to investors through your normal Publish — nothing goes live on its own.</p>
          </div>

          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Preview (BriefV1)</span>
            <div className="mt-2"><BriefPreview v2={v2} /></div>
          </div>
        </div>
      )}
    </div>
  );
}
