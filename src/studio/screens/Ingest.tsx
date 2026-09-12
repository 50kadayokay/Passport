// Stage 2 — press release ingestion.
//
// One rule shapes this screen: the operator sees the exact text that will be
// stored BEFORE it is stored. Every anchor, every fact-check, every number set in
// large type later resolves against this string, so silently ingesting a bad PDF
// transcription would poison everything downstream.

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { FileText, Link2, ClipboardPaste, Loader2, Upload, AlertTriangle } from "lucide-react";
import type { IngestDraft } from "../lib/ingest";
import { guessReleaseDate, ingestFromPdf, ingestFromText, ingestFromUrl } from "../lib/ingest";
import { createStoryProject, findByContentHash, listCompanies, updateStoryProject } from "../lib/db";
import type { StoryProject } from "../types";
import type { StudioCompany } from "../lib/db";
import { Button, Field, Notice, SectionTitle, Stat } from "../ui";

type Mode = "paste" | "pdf" | "url";

/** Hostname for display. Never throws — a malformed stored URL must not blank the screen. */
function hostOf(url: string): string | undefined {
  if (!url) return undefined;
  try { return new URL(url).hostname; } catch { return url.slice(0, 40); }
}

const MODES: { id: Mode; label: string; icon: LucideIcon }[] = [
  { id: "paste", label: "Paste text", icon: ClipboardPaste },
  { id: "pdf", label: "Upload PDF", icon: FileText },
  { id: "url", label: "Fetch URL", icon: Link2 },
];

export default function Ingest({ onCreated }: { onCreated: (project: StoryProject) => void }) {
  const [mode, setMode] = useState<Mode>("paste");
  const [pasted, setPasted] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [draft, setDraft] = useState<IngestDraft | null>(null);
  const [title, setTitle] = useState("");
  const [companyId, setCompanyId] = useState<string>("");
  const [companies, setCompanies] = useState<StudioCompany[]>([]);
  const [duplicate, setDuplicate] = useState<StoryProject | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    listCompanies().then(setCompanies).catch(() => setCompanies([]));
  }, []);

  // Re-run the duplicate check whenever the text or the company assignment moves:
  // the same release under a different company is a different project.
  useEffect(() => {
    let cancelled = false;
    if (!draft) { setDuplicate(null); return; }
    findByContentHash(companyId || null, draft.contentHash)
      .then((hit) => { if (!cancelled) setDuplicate(hit); })
      .catch(() => { if (!cancelled) setDuplicate(null); });
    return () => { cancelled = true; };
  }, [draft, companyId]);

  const releaseDate = useMemo(() => (draft ? guessReleaseDate(draft.text) : null), [draft]);

  const run = async (fn: () => Promise<IngestDraft>) => {
    setBusy(true); setError("");
    try {
      const next = await fn();
      setDraft(next);
      setTitle(next.title);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDraft(null);
    } finally {
      setBusy(false);
    }
  };

  const onFile = (file: File | undefined) => { if (file) void run(() => ingestFromPdf(file)); };

  const create = async () => {
    if (!draft) return;
    setBusy(true); setError("");
    try {
      const project = await createStoryProject({
        companyId: companyId || null,
        title: title.trim() || draft.title,
        sourceKind: draft.sourceKind,
        sourceUrl: draft.sourceUrl,
        sourceFilename: draft.sourceFilename,
        rawText: draft.text,
        contentHash: draft.contentHash,
      });
      // The dateline read is a convenience, not a claim — extraction overwrites it.
      const withDate = releaseDate ? await updateStoryProject(project.id, { release_date: releaseDate }) : project;
      onCreated(withDate);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => { setDraft(null); setPasted(""); setUrl(""); setError(""); setDuplicate(null); };

  return (
    <div className="mx-auto max-w-[900px] px-8 py-10">
      <header>
        <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.02em] text-slate-900">Ingest a release</h1>
        <p className="mt-1.5 max-w-[52ch] text-[14px] leading-relaxed text-slate-500">
          Paste, upload or fetch one press release. The text stored here is the text every
          extracted fact is later checked against — so read it before you commit it.
        </p>
      </header>

      {!draft && (
        <>
          <div className="mt-8 flex gap-1.5">
            {MODES.map((m) => {
              const Icon = m.icon;
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => { setMode(m.id); setError(""); }}
                  className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-bold transition ${
                    active ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  }`}
                >
                  <Icon size={14} /> {m.label}
                </button>
              );
            })}
          </div>

          <div className="mt-5">
            {mode === "paste" && (
              <div>
                <textarea
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  placeholder="Paste the full press release, headline and dateline included…"
                  className="h-[340px] w-full resize-y rounded-2xl border border-slate-200 bg-white p-4 font-mono text-[12.5px] leading-relaxed text-slate-700 outline-none focus:border-slate-400"
                />
                <div className="mt-3">
                  <Button onClick={() => void run(() => ingestFromText(pasted))} disabled={busy || pasted.trim().length < 200}>
                    {busy ? <Loader2 size={14} className="animate-spin" /> : null} Read it
                  </Button>
                  {pasted.trim().length > 0 && pasted.trim().length < 200 && (
                    <span className="ml-3 text-[12.5px] text-slate-400">That's shorter than any real release — paste the whole thing.</span>
                  )}
                </div>
              </div>
            )}

            {mode === "pdf" && (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]); }}
                className="rounded-2xl border-2 border-dashed border-slate-200 bg-white px-8 py-16 text-center"
              >
                <Upload size={22} className="mx-auto text-slate-300" />
                <p className="mt-3 text-[14px] font-semibold text-slate-700">Drop the release PDF here</p>
                <p className="mx-auto mt-1 max-w-[46ch] text-[12.5px] leading-relaxed text-slate-400">
                  The text layer is read in your browser, so the stored text matches the file exactly.
                  Scanned PDFs with no text layer won't work — paste those instead.
                </p>
                <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
                <div className="mt-4">
                  <Button variant="ghost" onClick={() => fileRef.current?.click()} disabled={busy}>
                    {busy ? <Loader2 size={14} className="animate-spin" /> : null} Choose a file
                  </Button>
                </div>
              </div>
            )}

            {mode === "url" && (
              <div>
                <Field label="Release URL" hint="Newswire and company-site pages only. If the page redirects, paste the final URL.">
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://…"
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[13.5px] outline-none focus:border-slate-400"
                  />
                </Field>
                <div className="mt-3">
                  <Button onClick={() => void run(() => ingestFromUrl(url))} disabled={busy || !/^https?:\/\/.+/i.test(url)}>
                    {busy ? <Loader2 size={14} className="animate-spin" /> : null} Fetch it
                  </Button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {error && <div className="mt-5"><Notice tone="error">{error}</Notice></div>}

      {draft && (
        <div className="mt-8 space-y-7">
          <div className="grid grid-cols-4 gap-6 rounded-2xl border border-slate-200 bg-white px-6 py-5">
            <Stat label="Words" value={draft.stats.words.toLocaleString()} />
            <Stat label="Characters" value={draft.stats.chars.toLocaleString()} />
            <Stat label="Dateline" value={releaseDate || "—"} sub={releaseDate ? undefined : "Extraction will find it"} />
            <Stat label="Source" value={draft.sourceKind.toUpperCase()} sub={draft.sourceFilename || hostOf(draft.sourceUrl)} />
          </div>

          {draft.stats.words < 150 && (
            <Notice tone="warn">
              Only {draft.stats.words} words came through. If this is a PDF, the text layer may be partial —
              check the preview below before you continue.
            </Notice>
          )}

          <div>
            <SectionTitle right={<button onClick={reset} className="text-[12px] font-bold text-slate-400 hover:text-slate-700">Start over</button>}>
              Stored text
            </SectionTitle>
            <pre className="mt-3 max-h-[380px] overflow-auto whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-5 font-mono text-[12px] leading-relaxed text-slate-600">
              {draft.text}
            </pre>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <Field label="Project title">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[13.5px] outline-none focus:border-slate-400"
              />
            </Field>
            <Field label="Company" hint="Sets the brand kit the renderer uses. You can assign it later.">
              <select
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[13.5px] outline-none focus:border-slate-400"
              >
                <option value="">Unassigned</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.primary_ticker ? ` · ${c.primary_ticker}` : ""}</option>
                ))}
              </select>
            </Field>
          </div>

          {duplicate && (
            <Notice tone="warn">
              <span className="inline-flex items-center gap-1.5 font-bold"><AlertTriangle size={14} /> Already ingested</span>
              <span className="mt-1 block">
                This exact text is already in the studio as “{duplicate.title}”.
                <button onClick={() => onCreated(duplicate)} className="ml-1.5 font-bold underline">Open it instead</button>
              </span>
            </Notice>
          )}

          <div className="flex items-center gap-3 border-t border-slate-200 pt-6">
            <Button onClick={() => void create()} disabled={busy || !!duplicate}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : null} Create project
            </Button>
            <Button variant="ghost" onClick={reset} disabled={busy}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
