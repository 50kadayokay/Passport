// Conference Blueprint admin section — list + editor host.
// Reachable at /admin (section "blueprints") and deep-links:
//   /admin/blueprints
//   /admin/blueprints/:companySlug/passport
//   /admin/blueprints/:companySlug/conference
// Follows the existing section-state admin style (no new router library).

import React, { useEffect, useMemo, useState } from "react";
import {
  fetchAllBlueprints, ensureBlueprint, createBothFromProfile, duplicateVersion,
} from "../../lib/blueprints/blueprintStorage.js";
import { computeCompletion, downloadJson } from "./BlueprintShared.jsx";
import PassportBlueprintEditor from "./PassportBlueprintEditor.jsx";
import ConferenceBlueprintEditor from "./ConferenceBlueprintEditor.jsx";

const pct = (data) => { const t = computeCompletion(data); return t.total ? Math.round((t.approved / t.total) * 100) : 0; };
const setPath = (p) => { try { window.history.pushState(null, "", p); } catch (_) {} };

export default function Blueprints({ companies = [] }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(null); // { row, type }

  const load = async () => {
    setLoading(true); setErr("");
    try { setRows(await fetchAllBlueprints()); }
    catch (e) { setErr(e.message || "Could not load blueprints"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  // Deep-link: /admin/blueprints/:slug/:type opens that editor once companies load.
  useEffect(() => {
    const m = (window.location.pathname || "").match(/^\/admin\/blueprints\/([^/]+)\/(passport|conference)\/?$/);
    if (!m || !companies.length || open) return;
    const company = companies.find((c) => c.slug === decodeURIComponent(m[1]));
    if (company) openEditor(company, m[2]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companies]);

  const byCompany = useMemo(() => {
    const map = new Map();
    rows.forEach((r) => {
      const cur = map.get(r.company_id) || {};
      cur[r.blueprint_type] = r;
      map.set(r.company_id, cur);
    });
    return map;
  }, [rows]);

  const openEditor = async (company, type) => {
    setBusy(company.id + type); setErr("");
    try {
      const row = await ensureBlueprint(company, type);
      if (!row) throw new Error("Could not open blueprint.");
      setOpen({ row, type });
      setPath(`/admin/blueprints/${encodeURIComponent(company.slug)}/${type}`);
      setRows((prev) => { const others = prev.filter((r) => r.id !== row.id); return [row, ...others]; });
    } catch (e) { setErr(e.message || "Open failed"); }
    finally { setBusy(""); }
  };

  const createBoth = async (company) => {
    setBusy(company.id + "both"); setErr("");
    try { await createBothFromProfile(company); await load(); }
    catch (e) { setErr(e.message || "Create failed"); }
    finally { setBusy(""); }
  };

  const dupVersion = async (row) => {
    const v = window.prompt("New template version (e.g. 0.2):", "");
    if (!v) return;
    setBusy(row.id + "dup");
    try { await duplicateVersion(row, v.trim()); await load(); }
    catch (e) { setErr(e.message || "Duplicate failed"); }
    finally { setBusy(""); }
  };

  const back = () => { setOpen(null); setPath("/admin/blueprints"); load(); };

  if (open) {
    const Editor = open.type === "conference" ? ConferenceBlueprintEditor : PassportBlueprintEditor;
    return <div className="h-[calc(100vh-0px)]"><Editor row={open.row} onBack={back} onSaved={(saved) => saved && setOpen((o) => ({ ...o, row: saved }))} /></div>;
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-[20px] font-extrabold tracking-tight text-slate-900">Conference Blueprints</h2>
          <p className="text-[13px] text-slate-500">A safe, versioned review layer projected from each company profile. Editing here never changes the live profile.</p>
        </div>
        <button onClick={load} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-bold text-slate-600 hover:text-slate-900">Refresh</button>
      </div>
      {err && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[13px] font-semibold text-rose-700">{err}</div>}

      <div className="overflow-hidden rounded-2xl border border-slate-200">
        <table className="w-full text-left text-[13px]">
          <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-2.5">Company</th>
              <th className="px-4 py-2.5">Passport</th>
              <th className="px-4 py-2.5">Conference</th>
              <th className="px-4 py-2.5">Versions</th>
              <th className="px-4 py-2.5">Updated</th>
              <th className="px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Loading…</td></tr>}
            {!loading && companies.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">No companies.</td></tr>}
            {!loading && companies.map((c) => {
              const bp = byCompany.get(c.id) || {};
              const p = bp.passport, cf = bp.conference;
              const cell = (row) => row
                ? <div><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{row.status}</span> <span className="ml-1 text-[11px] text-slate-400">{pct(row.data)}%</span></div>
                : <span className="text-[12px] text-slate-300">—</span>;
              const updated = [p, cf].filter(Boolean).map((r) => r.updated_at).sort().pop();
              return (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5"><div className="font-bold text-slate-800">{c.name || c.slug}</div><div className="font-mono text-[11px] text-slate-400">{c.slug}</div></td>
                  <td className="px-4 py-2.5">{cell(p)}</td>
                  <td className="px-4 py-2.5">{cell(cf)}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-slate-400">{[p && `P:${p.template_version}`, cf && `C:${cf.template_version}`].filter(Boolean).join(" ") || "—"}</td>
                  <td className="px-4 py-2.5 text-[11.5px] text-slate-400">{updated ? new Date(updated).toLocaleDateString() : "—"}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {!(p && cf) && <button onClick={() => createBoth(c)} disabled={busy === c.id + "both"} className="rounded-lg border border-slate-200 px-2.5 py-1 text-[12px] font-bold text-slate-600 hover:text-slate-900">{busy === c.id + "both" ? "…" : "Create from profile"}</button>}
                      <button onClick={() => openEditor(c, "passport")} disabled={busy === c.id + "passport"} className="rounded-lg bg-slate-900 px-2.5 py-1 text-[12px] font-bold text-white">Passport</button>
                      <button onClick={() => openEditor(c, "conference")} disabled={busy === c.id + "conference"} className="rounded-lg bg-slate-900 px-2.5 py-1 text-[12px] font-bold text-white">Conference</button>
                      {p && <button onClick={() => downloadJson(`${c.slug}-passport-blueprint.json`, p.data)} className="rounded-lg border border-slate-200 px-2 py-1 text-[12px] text-slate-500 hover:text-slate-900" title="Export Passport JSON">⭳P</button>}
                      {cf && <button onClick={() => downloadJson(`${c.slug}-conference-blueprint.json`, cf.data)} className="rounded-lg border border-slate-200 px-2 py-1 text-[12px] text-slate-500 hover:text-slate-900" title="Export Conference JSON">⭳C</button>}
                      {(p || cf) && <button onClick={() => dupVersion(p || cf)} className="rounded-lg border border-slate-200 px-2 py-1 text-[12px] text-slate-500 hover:text-slate-900" title="Duplicate to a new version">Dup</button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
