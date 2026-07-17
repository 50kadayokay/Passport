// Communications Center — the console surface for Engines 2-4.
//
//   1. The CEO writes ONE update.
//   2. Picks the destinations (only the ones their plan unlocks are shown).
//   3. AI drafts each channel + flags which profile sections to review.
//   4. The CEO edits any draft and approves it.
//
// Nothing here publishes. Approval marks a draft ready; the Publisher (a later
// connector layer) is the only thing that pushes externally. This is the shell:
// the generate + review + approve loop, backed by the updates/publications tables
// from migration 0005.
//
// Feature-gated end to end: the whole section only renders when the company has
// `communications_center`, and each destination checkbox only appears if that
// publish feature is in the plan. The API re-checks both — this UI is convenience.

import React, { useState, useMemo } from "react";
import {
  Megaphone, Sparkles, Loader2, Check, Circle, CheckCircle2, AlertTriangle,
  Send, Pencil, ChevronRight, Radio, FileText, Globe, Linkedin, Mail, Bell, Clock,
} from "lucide-react";
import { SUPABASE_URL } from "../lib/supabase.js";
import { authHeaders, getAccessToken } from "../lib/auth.js";
import { useFeatures, FEATURES } from "../lib/features.js";
import { publishPublication, connectorIsLive } from "../lib/publish.js";

// Destination presentation. `feature` mirrors the API's CHANNELS gate so the UI
// and server agree on what a plan unlocks.
const DESTS = [
  { id: "passport",   label: "Passport timeline", Icon: FileText, feature: FEATURES.COMMUNICATIONS_CENTER, always: true },
  { id: "push",       label: "Push notification", Icon: Bell,     feature: FEATURES.PUSH_PUBLISH },
  { id: "website",    label: "Website article",   Icon: Globe,    feature: FEATURES.WEBSITE_PUBLISH },
  { id: "linkedin",   label: "LinkedIn post",     Icon: Linkedin, feature: FEATURES.LINKEDIN_PUBLISH },
  { id: "x",          label: "X thread",          Icon: Radio,    feature: FEATURES.X_PUBLISH },
  { id: "newsletter", label: "Email newsletter",  Icon: Mail,     feature: FEATURES.NEWSLETTER_PUBLISH },
];

// Small status pill for a destination's publish outcome.
function pubStatusPill(state) {
  if (!state) return null;
  const map = {
    publishing: { t: "Publishing…", c: "bg-blue-50 text-blue-600" },
    published:  { t: "Published",   c: "bg-emerald-50 text-emerald-600" },
    pending:    { t: "Queued",      c: "bg-slate-100 text-slate-500" },
    failed:     { t: "Failed",      c: "bg-rose-50 text-rose-600" },
  };
  const m = map[state]; if (!m) return null;
  return <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${m.c}`}>{m.t}</span>;
}

// Render a destination's AI content, whatever shape it takes.
function DraftBody({ dest, content }) {
  if (!content) return null;
  if (dest === "x" && Array.isArray(content.posts)) {
    return (
      <div className="space-y-2">
        {content.posts.map((p, i) => (
          <div key={i} className="rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-700">
            <span className="mr-1.5 text-[11px] font-bold text-slate-400">{i + 1}/{content.posts.length}</span>{p}
          </div>
        ))}
      </div>
    );
  }
  // Generic: print the string fields in a sensible order.
  const order = ["title", "subject", "headline", "dek", "body", "text"];
  const keys = Object.keys(content).sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
  return (
    <div className="space-y-1.5">
      {keys.map((k) => (
        <p key={k} className={/title|subject|headline/.test(k) ? "text-[14px] font-bold text-slate-900" : "text-[13px] leading-relaxed text-slate-600"}>
          {String(content[k])}
        </p>
      ))}
    </div>
  );
}

export default function CommsCenter({ company }) {
  const companyId = company?.id || null;
  const { can, loading } = useFeatures(companyId);

  const [update, setUpdate] = useState("");
  const [occurredOn, setOccurredOn] = useState("");
  const [picked, setPicked] = useState(() => new Set(["passport"]));
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState(null);      // AI result
  const [drafts, setDrafts] = useState([]);    // editable copy of plan.drafts
  const [approved, setApproved] = useState(() => new Set());
  const [err, setErr] = useState("");
  const [savedUpdateId, setSavedUpdateId] = useState(null);
  const [publishState, setPublishState] = useState({});   // destination -> "publishing" | "published" | "pending" | "failed"

  // Only destinations the plan unlocks are selectable.
  const available = useMemo(() => DESTS.filter((d) => d.always || can(d.feature)), [loading]); // eslint-disable-line

  if (!loading && !can(FEATURES.COMMUNICATIONS_CENTER)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-400"><Megaphone size={26} /></div>
        <h1 className="text-[22px] font-extrabold tracking-tight">Communications Center</h1>
        <p className="max-w-sm text-[14px] leading-relaxed text-slate-400">
          Write one update and let AI draft your timeline, website, LinkedIn, X, newsletter and push — all reviewed before anything goes out.
        </p>
        <span className="mt-1 rounded-full bg-amber-50 px-3 py-1 text-[12.5px] font-bold text-amber-700">Available on Passport Communications</span>
      </div>
    );
  }

  const toggle = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function generate() {
    setErr(""); setPlan(null); setDrafts([]); setApproved(new Set()); setSavedUpdateId(null);
    if (update.trim().length < 4) { setErr("Write a sentence or two about what happened."); return; }
    setBusy(true);
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/comms-generate", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          companyId, update, occurredOn: occurredOn || undefined,
          destinations: [...picked],
          context: company?.profile?.companyBrief || null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
      setPlan(j);
      setDrafts(j.drafts || []);
    } catch (e) { setErr(e.message || "Generation failed"); }
    finally { setBusy(false); }
  }

  // Persist the update + its publications as drafts. This is the Engine-4 handoff:
  // rows the operator can later approve and the Publisher can pick up.
  async function saveDrafts() {
    setErr("");
    try {
      const h = await authHeaders();
      const uRes = await fetch(`${SUPABASE_URL}/rest/v1/updates`, {
        method: "POST",
        headers: { ...h, "content-type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({
          company_id: companyId, body: update, occurred_on: occurredOn || null,
          status: "review", detected: { summary: plan.summary, category: plan.category, profileTouches: plan.profileTouches || [] },
        }),
      });
      if (!uRes.ok) throw new Error(`Could not save the update (${uRes.status}).`);
      const [u] = await uRes.json();
      setSavedUpdateId(u.id);

      const rows = drafts.map((d) => ({
        company_id: companyId, update_id: u.id, destination_id: d.destination,
        content: d.content, status: approved.has(d.destination) ? "approved" : "draft",
      }));
      const pRes = await fetch(`${SUPABASE_URL}/rest/v1/publications`, {
        method: "POST", headers: { ...h, "content-type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(rows),
      });
      if (!pRes.ok) throw new Error(`Saved the update, but drafts failed (${pRes.status}).`);
      const savedPubs = await pRes.json().catch(() => []);

      // Push each APPROVED draft through its connector. Only `passport` is live;
      // the rest report pending, so the UI shows honest per-destination status.
      for (const pub of savedPubs) {
        if (pub.status !== "approved") continue;
        setPublishState((s) => ({ ...s, [pub.destination_id]: "publishing" }));
        const r = await publishPublication(company, pub, occurredOn);
        setPublishState((s) => ({ ...s, [pub.destination_id]: r.ok ? "published" : r.pending ? "pending" : "failed" }));
      }
    } catch (e) { setErr(e.message || "Save failed"); }
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center gap-2.5">
          <Megaphone size={22} className="text-slate-900" />
          <h1 className="text-[26px] font-extrabold tracking-tight">Communications Center</h1>
        </div>
        <p className="mt-1 text-[14px] text-slate-500">Write one update. AI drafts every channel. You review and approve — nothing goes out on its own.</p>

        {/* Step 1 — the one update */}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
          <label className="text-[12px] font-bold uppercase tracking-wider text-slate-400">What happened?</label>
          <textarea value={update} onChange={(e) => setUpdate(e.target.value)} rows={3}
            placeholder="e.g. We completed hole LC-27 and submitted the assays to the lab."
            className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-3.5 py-3 text-[14px] leading-relaxed outline-none focus:border-slate-400" />
          <div className="mt-2 flex items-center gap-2">
            <Clock size={14} className="text-slate-400" />
            <input type="date" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)}
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] text-slate-600" />
            <span className="text-[12px] text-slate-400">when it happened (optional)</span>
          </div>

          {/* Step 2 — destinations */}
          <div className="mt-4">
            <p className="text-[12px] font-bold uppercase tracking-wider text-slate-400">Send to</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {available.map(({ id, label, Icon }) => {
                const on = picked.has(id);
                return (
                  <button key={id} onClick={() => toggle(id)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition ${on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}>
                    <Icon size={13} /> {label}
                    {on && <Check size={12} />}
                  </button>
                );
              })}
            </div>
          </div>

          <button onClick={generate} disabled={busy || !companyId}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-[14px] font-bold text-white disabled:opacity-40">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} Generate drafts
          </button>
          {err && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] font-semibold text-rose-600">{err}</p>}
        </div>

        {/* Step 3 — what changed + review each draft */}
        {plan && (
          <>
            <div className="mt-6 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-4 py-3">
              <span className="text-[12px] font-bold uppercase tracking-wider text-slate-400">Detected</span>
              <span className="text-[13.5px] font-semibold text-slate-700">{plan.summary}</span>
              {(plan.profileTouches || []).map((t) => (
                <span key={t} className="rounded-full bg-white px-2.5 py-0.5 text-[11.5px] font-bold text-slate-500 ring-1 ring-slate-200">updates {t}</span>
              ))}
            </div>

            <div className="mt-4 space-y-3">
              {drafts.map((d, i) => {
                const meta = DESTS.find((x) => x.id === d.destination) || {};
                const Icon = meta.Icon || FileText;
                const isApproved = approved.has(d.destination);
                return (
                  <div key={d.destination} className={`rounded-2xl border bg-white p-5 ${isApproved ? "border-emerald-300" : "border-slate-200"}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon size={16} className="text-slate-500" />
                        <span className="text-[13px] font-bold text-slate-900">{meta.label || d.destination}</span>
                        {!connectorIsLive(d.destination) && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-bold text-slate-400">connector coming soon</span>}
                        {pubStatusPill(publishState[d.destination])}
                      </div>
                      <button onClick={() => setApproved((s) => { const n = new Set(s); n.has(d.destination) ? n.delete(d.destination) : n.add(d.destination); return n; })}
                        disabled={!!savedUpdateId}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold disabled:opacity-50 ${isApproved ? "bg-emerald-500 text-white" : "border border-slate-200 text-slate-600"}`}>
                        {isApproved ? <><CheckCircle2 size={13} /> Approved</> : <><Circle size={13} /> Approve</>}
                      </button>
                    </div>
                    <div className="mt-3"><DraftBody dest={d.destination} content={d.content} /></div>
                    {(d.warnings || []).length > 0 && (
                      <div className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2">
                        <AlertTriangle size={13} className="mt-0.5 flex-shrink-0 text-amber-600" />
                        <div className="text-[12px] font-medium text-amber-700">{d.warnings.map((w, j) => <p key={j}>{w}</p>)}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Step 4 — save to the review queue */}
            <div className="mt-5 flex items-center gap-3">
              <button onClick={saveDrafts} disabled={!!savedUpdateId}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-[14px] font-bold text-white disabled:opacity-50">
                {savedUpdateId ? <><Check size={16} /> Saved · approved published</> : <><Send size={16} /> Save & publish {approved.size} approved</>}
              </button>
              <p className="text-[12.5px] text-slate-400">Approved Passport-timeline drafts go live now. External connectors are queued until connected.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
