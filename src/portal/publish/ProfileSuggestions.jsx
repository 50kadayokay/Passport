// a06: "Update your profile from this release" — the review panel.
//
// MineEx reads the saved release (api/extract-profile-updates.js) and proposes
// changes to the profile: cash, capital structure, financings, timeline
// milestones, the status-card highlights. Each one is shown against what the
// profile says now, with the sentence it came from and its line in the release,
// and the person approves, edits or rejects it.
//
// Approved changes are saved to the profile DRAFT through /api/profile-draft --
// the same path, roles and compare-and-set as the Profile editor's own Save.
// Nothing here publishes. Investors see the change only after an owner or admin
// publishes the draft from Profile.

import React, { useState } from "react";
import { Loader2, Check, X, Pencil, Sparkles, AlertCircle, CheckCircle2 } from "lucide-react";
import { KINDS, diffProposals, applyProposals, validateProposals } from "./profileSuggestions.js";
import { loadProfileDraft, saveProfileDraft, editorStart, messageFor } from "../../lib/profileDraft.js";
import { buildCanonicalProfile } from "../../lib/ppToProfile.js";
import { apiHeaders } from "../../lib/auth.js";
import { isPortalDemo } from "../../lib/demoMode.js";

const CARD = "rounded-2xl border border-slate-100 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04),0_12px_26px_-20px_rgba(15,23,42,.4)]";
const LABEL = "text-[10.5px] font-bold uppercase tracking-[0.16em] text-slate-400";

const demo = () => !!(import.meta.env && import.meta.env.DEV && isPortalDemo());

async function requestProposals(companyId, updateId) {
  const h = await apiHeaders({ "content-type": "application/json" });
  const r = await fetch("/api/extract-profile-updates", { method: "POST", headers: h, body: JSON.stringify({ companyId, updateId }) });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(out.error || `MineEx could not read this release (${r.status}).`);
  return out;
}

/* Demo harness only: no session and no AI. Sentences from the release that
   state a share count or a cash position become proposals, through the SAME
   validation the server applies, so the panel can be exercised end to end. */
function demoProposals(text, source) {
  const raw = [];
  String(text || "").split(/(?<=[.!?])\s+/).forEach((s) => {
    const shares = s.match(/(\d[\d,]{4,})\s+(?:common\s+)?shares\s+(?:issued\s+and\s+)?outstanding/i);
    if (shares) raw.push({ kind: "shares_outstanding", value: shares[1], quote: s });
    const cash = s.match(/cash[^.]*?((?:C\$|US\$|\$)\s?\d[\d,.]*\s*(?:million|M)?)/i);
    if (cash) raw.push({ kind: "cash", value: cash[1].trim(), quote: s });
  });
  return validateProposals(raw, text, source);
}

export default function ProfileSuggestions({ company, draft, text, headline, onBeforeRead, onClose }) {
  const [phase, setPhase] = useState("idle");      // idle | reading | ready | saving | saved | error
  const [err, setErr] = useState("");
  const [items, setItems] = useState([]);          // diffed proposals + { decision, edit }
  const [hiddenSame, setHiddenSame] = useState(0);
  const [dropped, setDropped] = useState([]);
  const [saved, setSaved] = useState(null);         // { canPublish, version }

  async function read() {
    setPhase("reading"); setErr("");
    try {
      // The server reads the SAVED release, so anything still in the autosave
      // window is saved first.
      if (onBeforeRead) await onBeforeRead();
      const source = { updateId: draft && draft.id, headline, publishedOn: draft && draft.published_on };
      const [res, base] = demo()
        ? [demoProposals(text, source), { ok: true, live: (company && company.profile) || {} }]
        : await Promise.all([requestProposals(company.id, draft.id), loadProfileDraft(company.id)]);
      if (!base.ok) throw new Error(messageFor(base));
      const proposals = res.proposals || res.accepted || [];
      const diffed = diffProposals(editorStart(base).pp, proposals);
      setItems(diffed.filter((p) => p.status !== "same").map((p) => ({ ...p, decision: null, edit: null })));
      setHiddenSame(diffed.filter((p) => p.status === "same").length);
      setDropped(res.dropped || []);
      setPhase("ready");
    } catch (e) {
      setErr(e.message || "MineEx could not read this release.");
      setPhase("error");
    }
  }

  const decide = (id, decision) => setItems((cur) => cur.map((p) => (p.id === id ? { ...p, decision: p.decision === decision ? null : decision } : p)));
  const startEdit = (id) => setItems((cur) => cur.map((p) => (p.id === id ? { ...p, edit: { value: p.value, date: p.date || "" } } : p)));
  const setEdit = (id, patch) => setItems((cur) => cur.map((p) => (p.id === id ? { ...p, edit: { ...p.edit, ...patch } } : p)));
  const keepEdit = (id) => setItems((cur) => cur.map((p) => (p.id === id
    ? { ...p, value: p.edit.value, date: p.edit.date || null, edited: p.edited || p.edit.value !== p.value || (p.edit.date || null) !== p.date, edit: null, decision: "approve" }
    : p)));

  const approved = items.filter((p) => p.decision === "approve" && !p.edit);

  async function save() {
    if (!approved.length) return;
    setPhase("saving"); setErr("");
    if (demo()) { setSaved({ demo: true }); setPhase("saved"); return; }
    try {
      // Fresh load: the draft may have moved since the panel opened. The save
      // below is compare-and-set against exactly this version.
      const out = await loadProfileDraft(company.id);
      if (!out.ok) throw new Error(messageFor(out));
      const start = editorStart(out);
      const nextProfile = buildCanonicalProfile(start.profile || {}, applyProposals(start.pp, approved));
      const r = await saveProfileDraft({
        companyId: company.id,
        draft: { projects: nextProfile.projects ?? null, pp: nextProfile.pp },
        expectedVersion: start.version,
        baseFingerprint: start.version == null ? out.live_fingerprint : null,
      });
      if (!r.ok) throw new Error(messageFor(r));
      setSaved({ canPublish: !!out.can_publish, version: r.version, count: approved.length });
      setPhase("saved");
    } catch (e) {
      setErr(e.message || "Could not save to your profile draft.");
      setPhase("ready");
    }
  }

  return (
    <div className={`p-6 ${CARD}`} data-profile-suggestions>
      <div className="flex items-center gap-2">
        <Sparkles size={15} strokeWidth={2.4} className="text-blue-500" />
        <span className={LABEL}>Update your profile from this release</span>
        {onClose && (
          <button onClick={onClose} aria-label="Close" className="ml-auto grid h-7 w-7 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
            <X size={14} />
          </button>
        )}
      </div>

      {phase === "idle" && (
        <div className="mt-3">
          <p className="text-[13px] leading-relaxed text-slate-500">
            MineEx reads this release for changes to your profile (cash, share structure, financings, timeline
            milestones, status highlights) and shows each one next to what your profile says now. You approve,
            edit or reject each change. Approved changes go to your profile draft, not straight to investors.
          </p>
          <button onClick={read} disabled={!draft || !String(text || "").trim()}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-[13px] font-bold text-white transition hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400">
            <Sparkles size={14} strokeWidth={2.4} /> Find profile updates
          </button>
        </div>
      )}

      {phase === "reading" && (
        <p className="mt-4 flex items-center gap-2.5 text-[13px] font-semibold text-slate-500" role="status">
          <Loader2 size={15} className="animate-spin text-blue-500" /> Reading the release for profile changes…
        </p>
      )}

      {phase === "error" && (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
          <p className="flex items-center gap-1.5 text-[13px] font-bold text-rose-800"><AlertCircle size={14} /> Couldn't suggest profile updates</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-rose-700">{err}</p>
          <button onClick={read} className="mt-2 text-[12.5px] font-bold text-rose-800 underline-offset-2 hover:underline">Try again</button>
        </div>
      )}

      {(phase === "ready" || phase === "saving") && (
        <div className="mt-4 space-y-3">
          {items.length === 0 ? (
            <p className="text-[13px] leading-relaxed text-slate-500" data-no-suggestions>
              {hiddenSame > 0
                ? "Your profile already matches what this release says. Nothing to change."
                : "MineEx found nothing in this release that changes your profile."}
            </p>
          ) : items.map((p) => <Suggestion key={p.id} p={p} onDecide={decide} onEdit={startEdit} onEditChange={setEdit} onKeep={keepEdit} />)}

          {(hiddenSame > 0 && items.length > 0) && (
            <p className="text-[11.5px] text-slate-400">{hiddenSame} more already match your profile and are not shown.</p>
          )}
          {dropped.length > 0 && (
            <details className="text-[11.5px] text-slate-400" data-dropped>
              <summary className="cursor-pointer">
                {dropped.length} suggestion{dropped.length === 1 ? "" : "s"} left out because {dropped.length === 1 ? "it" : "they"} could not be traced to a sentence in the release
              </summary>
              <ul className="mt-1 list-disc pl-5">
                {dropped.map((d, i) => <li key={i}>{(KINDS[d.kind] && KINDS[d.kind].label) || d.kind || "Unknown"}: {d.reason}</li>)}
              </ul>
            </details>
          )}

          {err && <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-[12.5px] font-semibold text-rose-700">{err}</p>}

          {items.length > 0 && (
            <div className="border-t border-slate-100 pt-3">
              <button onClick={save} disabled={!approved.length || phase === "saving"}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-[13px] font-bold text-white transition hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400">
                {phase === "saving" ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={2.6} />}
                {approved.length ? `Save ${approved.length} approved change${approved.length === 1 ? "" : "s"} to your profile draft` : "Approve a change to save it"}
              </button>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-400">
                Saved to your profile draft only. Investors see nothing until an owner or admin publishes the draft from Profile.
              </p>
            </div>
          )}
        </div>
      )}

      {phase === "saved" && saved && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3" role="status" data-suggestions-saved>
          <p className="flex items-center gap-1.5 text-[13px] font-bold text-emerald-800"><CheckCircle2 size={14} /> {saved.demo ? "Demo: nothing was saved" : "Saved to your profile draft"}</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-emerald-800">
            {saved.demo
              ? "The demo has no profile draft to write to. In the portal, the approved changes would be saved to your draft."
              : saved.canPublish
                ? `${saved.count} change${saved.count === 1 ? "" : "s"} added to your draft. Review and publish it from Profile when you are ready; investors see nothing until then.`
                : `${saved.count} change${saved.count === 1 ? "" : "s"} added to your draft. An owner or admin publishes it from Profile; investors see nothing until then.`}
          </p>
        </div>
      )}
    </div>
  );
}

function Suggestion({ p, onDecide, onEdit, onEditChange, onKeep }) {
  const meta = KINDS[p.kind] || { label: p.kind, section: "" };
  const tone = p.decision === "approve" ? "border-emerald-200 bg-emerald-50/40"
    : p.decision === "reject" ? "border-slate-100 bg-slate-50 opacity-60" : "border-slate-200 bg-white";
  return (
    <div className={`rounded-xl border px-4 py-3 ${tone}`} data-suggestion={p.kind} data-decision={p.decision || "open"}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-400">{meta.section}</span>
        <span className="text-[13px] font-bold text-slate-800">{meta.label}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${p.status === "changed" ? "bg-amber-100 text-amber-800" : "bg-blue-50 text-blue-700"}`}>
          {p.status === "changed" ? "Changes your profile" : "New"}
        </span>
        {p.edited && <span className="text-[10.5px] font-semibold text-slate-400">Edited by you</span>}
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 text-[12.5px] sm:grid-cols-2">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Profile now</p>
          <p className="mt-0.5 text-slate-500">{p.current || "Not on your profile"}</p>
        </div>
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">From this release</p>
          {p.edit ? (
            <div className="mt-1 space-y-1.5">
              <input value={p.edit.value} onChange={(e) => onEditChange(p.id, { value: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12.5px] text-slate-800 outline-none focus:border-blue-400" aria-label="Value" />
              {(meta.dated) && (
                <input type="date" value={p.edit.date} onChange={(e) => onEditChange(p.id, { date: e.target.value })}
                  className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12.5px] text-slate-800 outline-none focus:border-blue-400" aria-label="Date" />
              )}
              <div className="flex gap-2">
                <button onClick={() => onKeep(p.id)} disabled={!String(p.edit.value || "").trim()}
                  className="rounded-lg bg-slate-900 px-2.5 py-1 text-[11.5px] font-bold text-white disabled:bg-slate-200">Use this</button>
              </div>
            </div>
          ) : (
            <p className="mt-0.5 font-semibold text-slate-900">{p.value}{p.date ? <span className="font-normal text-slate-500"> · {p.date}</span> : null}</p>
          )}
        </div>
      </div>

      {/* Provenance: the sentence, and where it sits in the release. */}
      <blockquote className="mt-2 border-l-2 border-slate-200 pl-3 text-[12px] italic leading-relaxed text-slate-500" data-provenance>
        “{p.quote}”
        <span className="mt-0.5 block not-italic text-[11px] text-slate-400">
          {p.source && p.source.line ? `Line ${p.source.line}${p.source.endLine && p.source.endLine !== p.source.line ? `–${p.source.endLine}` : ""}` : ""}
          {p.source && p.source.headline ? ` of “${p.source.headline}”` : ""}
          {p.source && p.source.publishedOn ? ` (${String(p.source.publishedOn).slice(0, 10)})` : ""}
        </span>
      </blockquote>

      {!p.edit && (
        <div className="mt-2.5 flex gap-2">
          <button onClick={() => onDecide(p.id, "approve")} aria-pressed={p.decision === "approve"}
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11.5px] font-bold transition ${p.decision === "approve" ? "bg-emerald-600 text-white" : "border border-slate-200 text-slate-700 hover:border-slate-300"}`}>
            <Check size={12} strokeWidth={2.6} /> Approve
          </button>
          <button onClick={() => onEdit(p.id)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11.5px] font-bold text-slate-700 transition hover:border-slate-300">
            <Pencil size={11} strokeWidth={2.6} /> Edit
          </button>
          <button onClick={() => onDecide(p.id, "reject")} aria-pressed={p.decision === "reject"}
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11.5px] font-bold transition ${p.decision === "reject" ? "bg-slate-700 text-white" : "border border-slate-200 text-slate-500 hover:border-slate-300"}`}>
            <X size={12} strokeWidth={2.6} /> Reject
          </button>
        </div>
      )}
    </div>
  );
}
