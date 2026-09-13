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
  Send, Pencil, ChevronRight, Radio, FileText, Globe, Linkedin, Mail, Bell, Clock, Upload,
} from "lucide-react";
import { SUPABASE_URL } from "../lib/supabase.js";
import { authHeaders, getAccessToken } from "../lib/auth.js";
import { useFeatures, FEATURES } from "../lib/features.js";
import { connectorIsLive } from "../lib/publish.js";
import { publishViaApi } from "../lib/publishClient.js";

// Destination presentation. `feature` mirrors the API's CHANNELS gate so the UI
// and server agree on what a plan unlocks.
const DESTS = [
  { id: "passport",   label: "MineEx timeline", Icon: FileText, feature: FEATURES.COMMUNICATIONS_CENTER, always: true },
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
    published:  { t: "Published",   c: "bg-blue-50 text-blue-600" },
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

export default function CommsCenter({ company, devFeatures = null }) {
  const companyId = company?.id || null;
  const { can: canReal, loading } = useFeatures(companyId);
  // LOCALHOST HARNESS ONLY. /portaldemo has no session, so my_features returns nothing and
  // every gated surface shows its upsell instead of the thing being built. Compiled out of
  // production by import.meta.env.DEV — it can never widen a real customer's plan.
  const can = (f) => canReal(f) || (import.meta.env.DEV && Array.isArray(devFeatures) && devFeatures.includes(f));

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
  // Press release uploaded as a PDF: the transcribed text is BOTH the AI's source and the
  // "Read full press release" text stored on the profile, so that link is always there.
  const [srcText, setSrcText] = useState("");
  const [srcName, setSrcName] = useState("");
  const [srcBusy, setSrcBusy] = useState("");
  const [srcOpen, setSrcOpen] = useState(false);
  const [revise, setRevise] = useState("");
  const [dragOver, setDragOver] = useState(false);

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
        <span className="mt-1 rounded-full bg-amber-50 px-3 py-1 text-[12.5px] font-bold text-amber-700">Available on MineEx Communications</span>
      </div>
    );
  }

  const toggle = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Drop a release PDF → transcribe it → it becomes the source the AI summarises.
  async function ingestFile(file) {
    if (!file) return;
    const isPdf = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name);
    if (!isPdf && !/^text\//.test(file.type)) { setErr("Upload a PDF, or paste the text instead."); return; }
    if (file.size > 20 * 1024 * 1024) { setErr("That file is over 20 MB. Upload a smaller PDF."); return; }
    setErr(""); setSrcBusy("Reading the release…"); setSrcName(file.name);
    try {
      let text = "";
      if (isPdf) {
        const b64 = await new Promise((res, rej) => {
          const fr = new FileReader();
          fr.onload = () => res(String(fr.result || "").split(",")[1] || "");
          fr.onerror = () => rej(new Error("Could not read that file."));
          fr.readAsDataURL(file);
        });
        const token = await getAccessToken();
        const r = await fetch("/api/extract-text", {
          method: "POST",
          headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ pdf: b64, companyId }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || `Could not read the PDF (${r.status}).`);
        text = String(j.text || "").trim();
      } else {
        text = (await file.text()).trim();
      }
      if (!text) throw new Error("No readable text in that file — it may be a scan. Paste the text instead.");
      setSrcText(text);
      setSrcBusy("");
    } catch (e) {
      setSrcBusy(""); setSrcName(""); setErr(e.message || "Could not read that file.");
    }
  }
  const clearSource = () => { setSrcText(""); setSrcName(""); setSrcOpen(false); };

  async function generate(reviseWith) {
    const isRevision = !!reviseWith;
    setErr("");
    // A revision keeps nothing from the previous pass except as context for the model.
    if (!isRevision) { setPlan(null); setDrafts([]); setApproved(new Set()); setSavedUpdateId(null); }
    if (!srcText && update.trim().length < 4) { setErr("Upload a release PDF, or write a sentence or two about what happened."); return; }
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
          sourceText: srcText || undefined,
          revise: reviseWith || undefined,
          previous: reviseWith ? drafts : undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
      setPlan(j);
      setDrafts(j.drafts || []);
      if (isRevision) { setApproved(new Set()); setRevise(""); }   // re-review after a rewrite
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
          company_id: companyId, body: srcText || update, occurred_on: occurredOn || null,
          status: "review",
          detected: {
            summary: plan.summary, category: plan.category, profileTouches: plan.profileTouches || [],
            // The verbatim release. Stored on the update so the published timeline entry can
            // always offer "Read full press release" — the profile renders that link from the
            // full text, so without this only some releases would have it.
            fullText: srcText || update || "",
            sourceName: srcName || "",
          },
        }),
      });
      if (!uRes.ok) throw new Error(`Could not save the update (${uRes.status}).`);
      const [u] = await uRes.json();
      setSavedUpdateId(u.id);

      const rows = drafts.map((d) => ({
        company_id: companyId, update_id: u.id, destination_id: d.destination,
        // The timeline entry carries the full release with it; other channels don't need it.
        content: d.destination === "passport" && (srcText || update)
          ? { ...d.content, fullText: srcText || update }
          : d.content,
        status: approved.has(d.destination) ? "approved" : "draft",
      }));
      const pRes = await fetch(`${SUPABASE_URL}/rest/v1/publications`, {
        method: "POST", headers: { ...h, "content-type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(rows),
      });
      if (!pRes.ok) throw new Error(`Saved the update, but drafts failed (${pRes.status}).`);
      const savedPubs = await pRes.json().catch(() => []);

      // Publish each APPROVED draft through the server (the ONLY publish path).
      // Only `passport` has a live connector today; the rest report pending, so the
      // UI shows honest per-destination status. /api/publish sets the publication
      // published and emits the outbox event; the dispatcher projects the post.
      for (const pub of savedPubs) {
        if (pub.status !== "approved") continue;
        if (!connectorIsLive(pub.destination_id)) {
          setPublishState((s) => ({ ...s, [pub.destination_id]: "pending" }));
          continue;
        }
        setPublishState((s) => ({ ...s, [pub.destination_id]: "publishing" }));
        try {
          await publishViaApi(pub.id);
          setPublishState((s) => ({ ...s, [pub.destination_id]: "published" }));
        } catch (e) {
          setPublishState((s) => ({ ...s, [pub.destination_id]: "failed" }));
          setErr(e.message || "Publish failed");
        }
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

        {/* Step 1 — the release itself: drop the PDF, or write it. */}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
          <label className="text-[12px] font-bold uppercase tracking-wider text-slate-400">Your press release</label>

          {!srcText ? (
            <label
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); ingestFile(e.dataTransfer.files && e.dataTransfer.files[0]); }}
              className={`mt-2 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-7 text-center transition ${
                dragOver ? "border-blue-400 bg-blue-50/60" : "border-slate-300 bg-slate-50/60 hover:border-slate-400"
              }`}
            >
              {srcBusy ? (
                <><Loader2 size={20} className="animate-spin text-blue-500" />
                  <p className="mt-2 text-[13.5px] font-bold text-slate-600">{srcBusy}</p>
                  <p className="text-[12px] text-slate-400">{srcName}</p></>
              ) : (
                <><Upload size={20} className="text-slate-400" />
                  <p className="mt-2 text-[13.5px] font-bold text-slate-700">Drop your press release PDF here</p>
                  <p className="mt-0.5 text-[12px] text-slate-400">We read it and draft the summary for you — you review before anything publishes.</p></>
              )}
              <input type="file" accept="application/pdf,.pdf,text/plain" className="hidden"
                onChange={(e) => { ingestFile(e.target.files && e.target.files[0]); e.target.value = ""; }} />
            </label>
          ) : (
            <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-3">
              <div className="flex items-center gap-2.5">
                <FileText size={16} className="shrink-0 text-blue-600" />
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-slate-800">{srcName || "Pasted release"}</span>
                <span className="shrink-0 text-[11.5px] font-semibold text-slate-400">{srcText.length.toLocaleString()} chars</span>
                <button onClick={() => setSrcOpen((v) => !v)} className="shrink-0 text-[12px] font-bold text-blue-600 hover:text-blue-700">
                  {srcOpen ? "Hide" : "Review text"}
                </button>
                <button onClick={clearSource} title="Remove" className="shrink-0 text-[12px] font-bold text-slate-400 hover:text-slate-600">Remove</button>
              </div>
              {srcOpen && (
                <textarea value={srcText} onChange={(e) => setSrcText(e.target.value)} rows={10}
                  className="mt-3 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[12.5px] leading-relaxed text-slate-700 outline-none focus:border-slate-400" />
              )}
              <p className="mt-2 text-[11.5px] text-slate-400">
                This exact text is stored as the full release, so investors can always open it from your profile.
              </p>
            </div>
          )}

          <label className="mt-4 block text-[12px] font-bold uppercase tracking-wider text-slate-400">
            {srcText ? "Anything to add? (optional)" : "Or write it yourself"}
          </label>
          <textarea value={update} onChange={(e) => setUpdate(e.target.value)} rows={3}
            placeholder={srcText ? "Context for the summary — emphasis, correction, anything the PDF doesn\u2019t say." : "e.g. We completed hole LC-27 and submitted the assays to the lab."}
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

          <button onClick={() => generate()} disabled={busy || !companyId || (!srcText && update.trim().length < 4)}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-[14px] font-bold text-white disabled:opacity-40">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {drafts.length ? "Regenerate" : srcText ? "Summarise this release" : "Generate drafts"}
          </button>

          {/* Ask for a better version rather than editing by hand. */}
          {drafts.length > 0 && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
              <p className="text-[12px] font-bold uppercase tracking-wider text-slate-400">Not quite right?</p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input value={revise} onChange={(e) => setRevise(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && revise.trim() && !busy) generate(revise.trim()); }}
                  placeholder="e.g. lead with the grade, and keep it shorter"
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13.5px] outline-none focus:border-slate-400" />
                <button onClick={() => generate(revise.trim())} disabled={busy || !revise.trim()}
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-[13px] font-bold text-slate-700 disabled:opacity-40">
                  <Sparkles size={14} /> Rewrite
                </button>
              </div>
              <p className="mt-1.5 text-[11.5px] text-slate-400">Your edits are kept as context — it revises rather than starting over.</p>
            </div>
          )}
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
                  <div key={d.destination} className={`rounded-2xl border bg-white p-5 ${isApproved ? "border-blue-300" : "border-slate-200"}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon size={16} className="text-slate-500" />
                        <span className="text-[13px] font-bold text-slate-900">{meta.label || d.destination}</span>
                        {!connectorIsLive(d.destination) && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-bold text-slate-400">connector coming soon</span>}
                        {pubStatusPill(publishState[d.destination])}
                      </div>
                      <button onClick={() => setApproved((s) => { const n = new Set(s); n.has(d.destination) ? n.delete(d.destination) : n.add(d.destination); return n; })}
                        disabled={!!savedUpdateId}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold disabled:opacity-50 ${isApproved ? "bg-blue-500 text-white" : "border border-slate-200 text-slate-600"}`}>
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
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-[14px] font-bold text-white disabled:opacity-50">
                {savedUpdateId ? <><Check size={16} /> Saved · approved published</> : <><Send size={16} /> Save & publish {approved.size} approved</>}
              </button>
              <p className="text-[12.5px] text-slate-400">Approved MineEx-timeline drafts go live now. External connectors are queued until connected.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
