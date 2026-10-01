// Draft a Press Release — the AI-assisted drafting workspace.
//
// Two states in one screen. Before a draft exists it is a focused composer:
// say what you are announcing, attach what supports it, generate. After that it
// becomes a document workspace — the release itself is the dominant object, with
// a restrained revision toolbar above and an instruction box below.
//
// WHAT THIS DELIBERATELY IS NOT: a chat transcript. The CEO is writing a
// regulated disclosure, not conversing. So the draft is a real editable document
// they can type into directly, revisions replace it in place, and the AI's
// replies are not kept as bubbles. The one conversational element — "ask MineEx
// to revise" — exists because describing a change in words beats hunting for a
// control.
//
// GROUNDING. Everything factual comes from three places, in this order: what the
// CEO typed, the documents they attached, and MineIQ (the company's own record).
// The server prompt forbids inventing figures, quotes, QP statements and
// forward-looking language, and writes [bracketed placeholders] instead. Check
// Facts reports; it never silently rewrites.
//
// PUBLISHING IS UNTOUCHED. This screen never publishes. "Continue to Review"
// saves a draft through the existing createDraft() and hands off to the existing
// review screen, so every safeguard in validateForPublish still applies.

import React, { useState, useRef, useCallback } from "react";
import {
  ArrowLeft, Loader2, Wand2, Save, AlertCircle, FileText, Paperclip, X,
  ShieldCheck, CheckCircle2, AlertTriangle, HelpCircle, History, RotateCcw,
  ArrowUp, Database,
} from "lucide-react";
import { draftRelease, reviseRelease, checkFacts, REVISION_ACTIONS } from "../../lib/compose.js";
import { createDraft } from "../../lib/publishDrafts.js";
import { ingestRelease, supportedKind } from "../../lib/ingestRelease.js";

const CARD = "rounded-2xl border border-slate-100 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04),0_12px_26px_-20px_rgba(15,23,42,.4)]";
const LABEL = "text-[10.5px] font-bold uppercase tracking-[0.16em] text-slate-400";

/** The first non-empty line is the headline; the rest is the body. */
function splitRelease(text) {
  const lines = String(text || "").split("\n");
  const i = lines.findIndex((l) => l.trim());
  if (i === -1) return { headline: "", body: "" };
  return {
    headline: lines[i].trim().replace(/^#+\s*/, ""),
    body: lines.slice(i + 1).join("\n").replace(/^\s*\n/, ""),
  };
}

const FACT_META = {
  supported:  { Icon: CheckCircle2,  tone: "text-emerald-600", bg: "bg-emerald-50", label: "Supported" },
  conflict:   { Icon: AlertTriangle, tone: "text-amber-600",   bg: "bg-amber-50",   label: "Conflict" },
  unverified: { Icon: HelpCircle,    tone: "text-slate-500",   bg: "bg-slate-100",  label: "Unverified" },
};

/** One attached document, as a removable chip. */
function Attachment({ file, onRemove }) {
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-xl border border-slate-200 bg-white py-1.5 pl-3 pr-1.5">
      {file.status === "working" ? (
        <Loader2 size={13} className="shrink-0 animate-spin text-blue-500" />
      ) : file.error ? (
        <AlertCircle size={13} className="shrink-0 text-rose-500" />
      ) : (
        <Paperclip size={13} className="shrink-0 text-slate-400" />
      )}
      <span className="min-w-0 truncate text-[12.5px] font-semibold text-slate-700">{file.name}</span>
      {file.error
        ? <span className="shrink-0 text-[11.5px] text-rose-500">{file.error}</span>
        : file.status === "ready" && <span className="shrink-0 text-[11px] text-slate-400">{Math.round((file.chars || 0) / 100) / 10}k chars</span>}
      <button onClick={onRemove} aria-label={`Remove ${file.name}`}
        className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
        <X size={13} />
      </button>
    </span>
  );
}

/** "Company context connected" + what it actually used. */
function ContextBadge({ context, open, setOpen }) {
  if (!context) return null;
  const on = context.available;
  const sources = context.sources || [];
  return (
    <div className="mt-3">
      <button
        onClick={() => sources.length && setOpen(!open)}
        className={`inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition ${
          sources.length ? "hover:bg-slate-100" : "cursor-default"} ${on ? "text-slate-600" : "text-slate-400"}`}
      >
        <Database size={13} className={on ? "text-blue-500" : "text-slate-300"} />
        MineIQ — {on ? "company context connected" : "no company context"}
        {on && <CheckCircle2 size={12} className="text-emerald-600" />}
        {sources.length > 0 && <span className="text-slate-400">· {open ? "Hide" : "View"} sources</span>}
      </button>
      {open && sources.length > 0 && (
        <ul className="mt-1.5 space-y-1 rounded-xl bg-slate-50 px-4 py-3">
          {sources.map((sname, i) => (
            <li key={i} className="text-[12px] text-slate-600">· {sname}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function DraftRelease({ company, onExit, onSaved }) {
  const companyId = company?.id;
  const companyName = company?.name || "";

  const [details, setDetails] = useState("");
  const [files, setFiles] = useState([]);          // { id, name, text, chars, status, error }
  const [text, setText] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [instruction, setInstruction] = useState("");
  const [saving, setSaving] = useState(false);
  const [context, setContext] = useState(null);
  const [srcOpen, setSrcOpen] = useState(false);
  const [facts, setFacts] = useState(null);
  const [versions, setVersions] = useState([]);    // { label, text, at }
  const [histOpen, setHistOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const attachments = files.filter((f) => f.status === "ready" && f.text)
    .map((f) => ({ name: f.name, text: f.text }));

  // ---- attachments: the EXISTING ingestion path, not a second one ----------
  const addFiles = useCallback(async (list) => {
    const chosen = Array.from(list || []).filter(Boolean);
    if (!chosen.length) return;
    setErr("");

    for (const file of chosen) {
      const id = `${file.name}-${file.size}-${Date.now()}`;
      if (!supportedKind(file)) {
        setFiles((f) => [...f, { id, name: file.name, status: "error", error: "PDF, DOCX or TXT only" }]);
        continue;
      }
      setFiles((f) => [...f, { id, name: file.name, status: "working" }]);
      try {
        const res = await ingestRelease(companyId, file);
        const body = (res && res.text) || "";
        setFiles((f) => f.map((x) => x.id === id
          ? (body
              ? { ...x, status: "ready", text: body, chars: body.length }
              : { ...x, status: "error", error: "No text could be read" })
          : x));
      } catch (e) {
        setFiles((f) => f.map((x) => x.id === id
          ? { ...x, status: "error", error: e?.message ? "Could not read it" : "Failed" } : x));
      }
    }
  }, [companyId]);

  const removeFile = (id) => setFiles((f) => f.filter((x) => x.id !== id));

  // ---- generation ---------------------------------------------------------
  // Every AI result pushes the PREVIOUS text onto the stack first, so a bad
  // revision is always one click from being undone. The CEO's typed input is
  // never cleared on failure.
  const pushVersion = (label) => {
    if (!text.trim()) return;
    setVersions((v) => [...v, { label, text, at: Date.now() }].slice(-12));
  };

  async function generate() {
    if (!details.trim() && !attachments.length) {
      setErr("Tell MineEx what you're announcing, or attach a document.");
      return;
    }
    setErr(""); setFacts(null); setBusy("Preparing your draft…");
    try {
      const r = await draftRelease({ details, attachments, companyId, companyName });
      pushVersion("Original draft");
      setText(r.text);
      setContext(r.context || null);
    } catch (e) {
      setErr(e.message || "Could not write the draft.");
    } finally { setBusy(""); }
  }

  async function revise({ preset, label }) {
    setErr(""); setFacts(null); setBusy(`${label}…`);
    try {
      const r = await reviseRelease({ current: text, preset, attachments, companyId, companyName });
      pushVersion(label);
      setText(r.text);
      setContext(r.context || context);
    } catch (e) {
      setErr(e.message || "Could not revise the draft.");
    } finally { setBusy(""); }
  }

  async function askRevision() {
    const ask = instruction.trim();
    if (!ask || busy) return;
    setErr(""); setFacts(null); setBusy("Revising…");
    try {
      const r = await reviseRelease({ current: text, instruction: ask, attachments, companyId, companyName });
      pushVersion("Revision");
      setText(r.text);
      setContext(r.context || context);
      setInstruction("");
    } catch (e) {
      setErr(e.message || "Could not apply that change.");
    } finally { setBusy(""); }
  }

  async function runFactCheck() {
    setErr(""); setBusy("Checking facts…");
    try {
      const r = await checkFacts({ current: text, attachments, companyId, companyName });
      setFacts(r.findings || []);
      setContext(r.context || context);
    } catch (e) {
      setErr(e.message || "Could not check the draft.");
    } finally { setBusy(""); }
  }

  const restore = (v) => {
    pushVersion("Before restore");
    setText(v.text);
    setHistOpen(false);
  };

  // Hands off to the EXISTING review workflow. Nothing is published here.
  async function continueToReview() {
    if (!text.trim() || saving) return;
    setSaving(true); setErr("");
    try {
      const { headline, body } = splitRelease(text);
      const row = await createDraft(companyId, { headline, text: body || text });
      onSaved && onSaved(row);
    } catch (e) {
      setErr(e.message || "Could not save the draft.");
      setSaving(false);
    }
  }

  const hasDraft = !!text.trim();

  return (
    <div>
      <button onClick={onExit}
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-bold text-slate-500 transition hover:text-slate-900">
        <ArrowLeft size={15} strokeWidth={2.4} /> Publish
      </button>

      {err && (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl bg-rose-50 px-4 py-3">
          <AlertCircle size={17} className="mt-0.5 shrink-0 text-rose-500" />
          <p className="text-[13px] font-semibold text-rose-700">{err}</p>
        </div>
      )}

      {!hasDraft ? (
        /* ---------- COMPOSE ---------- */
        <div className="mx-auto max-w-[720px]">
          <h1 className="text-[27px] font-extrabold leading-tight tracking-tight text-slate-900">Draft a Press Release</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-slate-500">
            Tell MineEx what you want to announce. Add the key facts below and upload any relevant documents
            or supporting materials. MineEx will use what you provide to prepare a draft.
          </p>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
            className={`mt-6 overflow-hidden rounded-2xl border bg-white transition ${
              dragOver ? "border-blue-400 ring-2 ring-blue-500/15" : "border-slate-200"}`}
          >
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={9}
              placeholder="Describe the announcement, key results or information you want included…"
              className="w-full resize-y px-5 py-4 text-[14.5px] leading-relaxed text-slate-800 placeholder:text-slate-400 focus:outline-none"
            />
            <div className="border-t border-slate-100 px-4 py-3">
              <button onClick={() => fileRef.current && fileRef.current.click()}
                className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold text-slate-600 transition hover:bg-slate-100">
                <Paperclip size={14} strokeWidth={2.4} /> Add supporting files
              </button>
              <p className="mt-1 px-2.5 text-[11.5px] leading-relaxed text-slate-400">
                Press releases, technical reports, assay results, project updates or other relevant documents.
                PDF, DOCX or TXT, or drop them anywhere in this box.
              </p>
              {files.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {files.map((f) => <Attachment key={f.id} file={f} onRemove={() => removeFile(f.id)} />)}
                </div>
              )}
            </div>
          </div>
          <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" multiple className="hidden"
            onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />

          <div className="mt-5 flex items-center justify-end gap-3">
            {busy && <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-slate-500"><Loader2 size={14} className="animate-spin text-blue-500" /> {busy}</span>}
            <button onClick={generate} disabled={!!busy}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-[14px] font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">
              Generate Draft
            </button>
          </div>
        </div>
      ) : (
        /* ---------- WORKSPACE ---------- */
        <div>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-[27px] font-extrabold leading-tight tracking-tight text-slate-900">Draft a Press Release</h1>
              <ContextBadge context={context} open={srcOpen} setOpen={setSrcOpen} />
            </div>
            <div className="flex items-center gap-2">
              {versions.length > 0 && (
                <div className="relative">
                  <button onClick={() => setHistOpen(!histOpen)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] font-bold text-slate-600 transition hover:border-slate-300">
                    <History size={13} strokeWidth={2.4} /> Version history
                  </button>
                  {histOpen && (
                    <div className="absolute right-0 z-20 mt-1.5 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                      {[...versions].reverse().map((v, i) => (
                        <button key={v.at} onClick={() => restore(v)}
                          className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition hover:bg-slate-50">
                          <RotateCcw size={12} className="shrink-0 text-slate-400" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12.5px] font-semibold text-slate-700">{v.label}</span>
                            <span className="block text-[11px] text-slate-400">
                              {new Date(v.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Revision toolbar */}
          <div className="mt-5 flex flex-wrap items-center gap-1.5">
            {REVISION_ACTIONS.map((a) => (
              <button key={a.id} onClick={() => revise({ preset: a.id, label: a.label })} disabled={!!busy}
                title={a.hint}
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-bold text-slate-700 transition hover:border-slate-300 disabled:opacity-50">
                {a.label}
              </button>
            ))}
            <button onClick={runFactCheck} disabled={!!busy}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-bold text-slate-700 transition hover:border-slate-300 disabled:opacity-50">
              <ShieldCheck size={14} strokeWidth={2.4} /> Check Facts
            </button>
            {busy && (
              <span className="ml-1 inline-flex items-center gap-2 text-[12.5px] font-semibold text-slate-500">
                <Loader2 size={13} className="animate-spin text-blue-500" /> {busy}
              </span>
            )}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_330px]">
            {/* The document */}
            <div>
              <div className={`p-7 ${CARD}`}>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="min-h-[520px] w-full resize-y border-0 p-0 font-serif text-[15px] leading-[1.75] text-slate-800 focus:outline-none focus:ring-0"
                />
              </div>
              <p className="mt-2 px-1 text-[11.5px] leading-relaxed text-slate-400">
                Edit directly. Anything in [brackets] still needs filling in. Check every figure before publishing —
                this is a draft, not a verified disclosure.
              </p>

              {/* Conversational revision */}
              <div className="mt-4">
                <p className={LABEL}>Ask MineEx to revise the draft</p>
                <div className="mt-2 flex items-end gap-2">
                  <textarea
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); askRevision(); } }}
                    rows={2}
                    placeholder="Tell MineEx what you'd like to change…"
                    className="w-full resize-y rounded-xl border border-slate-200 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-slate-700 outline-none transition focus:border-blue-400"
                  />
                  <button onClick={askRevision} disabled={!instruction.trim() || !!busy}
                    aria-label="Apply revision"
                    className="mb-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-900 text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">
                    <ArrowUp size={16} strokeWidth={2.4} />
                  </button>
                </div>
                <p className="mt-1.5 text-[11.5px] text-slate-400">
                  Changes only what you ask for — the rest of your draft is left as it is.
                </p>
              </div>
            </div>

            {/* Side rail */}
            <div className="space-y-5">
              {facts && (
                <div className={`p-5 ${CARD}`}>
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={15} strokeWidth={2.4} className="text-slate-400" />
                    <span className={LABEL}>Fact check</span>
                  </div>
                  {facts.length === 0 ? (
                    <p className="mt-3 text-[13px] text-slate-500">No checkable claims were found.</p>
                  ) : (
                    <ul className="mt-3 space-y-3">
                      {facts.map((f, i) => {
                        const meta = FACT_META[f.status] || FACT_META.unverified;
                        return (
                          <li key={i} className="flex gap-2.5">
                            <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${meta.bg}`}>
                              <meta.Icon size={12} className={meta.tone} />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-[12.5px] font-semibold leading-snug text-slate-800">{f.claim}</span>
                              <span className="mt-0.5 block text-[12px] leading-snug text-slate-500">{f.note}</span>
                              {f.source && <span className="mt-0.5 block text-[11px] text-slate-400">{f.source}</span>}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <p className="mt-3 border-t border-slate-100 pt-2.5 text-[11px] leading-relaxed text-slate-400">
                    Nothing was changed. Review each point yourself.
                  </p>
                </div>
              )}

              {files.length > 0 && (
                <div className={`p-5 ${CARD}`}>
                  <span className={LABEL}>Source documents</span>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {files.map((f) => <Attachment key={f.id} file={f} onRemove={() => removeFile(f.id)} />)}
                  </div>
                </div>
              )}

              <div className={`p-5 ${CARD}`}>
                <span className={LABEL}>When you're happy</span>
                <p className="mt-2 text-[12.5px] leading-relaxed text-slate-500">
                  Drafting and publishing are separate. This hands the release to your normal review screen —
                  nothing goes out until you publish it there.
                </p>
                <button onClick={continueToReview} disabled={saving || !!busy}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-[13.5px] font-bold text-white transition hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400">
                  {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Save size={14} strokeWidth={2.4} /> Continue to Review</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
