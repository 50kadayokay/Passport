// The project workbench.
//
// Stages 1–4 give it one job: run extraction and show, honestly, what came back —
// including how much of it is actually anchored in the release. Verification
// (stage 5), the classifier (6), the Story Director (7) and the design pipeline
// (8+) attach to this same screen as they land.

import React, { useMemo, useState } from "react";
import { Loader2, ChevronDown, ChevronRight, FlaskConical } from "lucide-react";
import type { StoryProject, StoryProjectRow } from "../types";
import { RELEASE_TYPE_LABELS } from "../types";
import { anchorCoverage, anchorText } from "../lib/anchors";
import { updateStoryProject } from "../lib/db";
import { extractionProviders, getExtractionProvider } from "../services/extraction";
import { Button, Notice, SectionTitle, Stat } from "../ui";

function Disclosure({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-slate-200 py-4">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-1.5 text-left text-[12px] font-bold uppercase tracking-[0.11em] text-slate-500 hover:text-slate-800">
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {title}
      </button>
      {open ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

/**
 * `save` is injectable for one reason: the localhost dev harness runs this exact
 * screen with an in-memory store, so the preview exercises the real component
 * rather than a lookalike. Production always uses the default.
 */
export default function ProjectView({
  project,
  onChange,
  save = updateStoryProject,
}: {
  project: StoryProject;
  onChange: (p: StoryProject) => void;
  save?: (id: string, patch: Partial<StoryProjectRow>) => Promise<StoryProject>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const providers = useMemo(() => extractionProviders(), []);
  const [providerId, setProviderId] = useState(() => getExtractionProvider().id);
  const provider = getExtractionProvider(providerId);

  const extraction = project.extraction;
  const coverage = useMemo(() => (extraction ? anchorCoverage(extraction) : { total: 0, resolved: 0 }), [extraction]);

  const runExtraction = async () => {
    setBusy(true); setError("");
    try {
      const result = await provider.extract({ text: project.rawText });
      const updated = await save(project.id, {
        extraction: result.extraction,
        extraction_meta: result.meta,
        release_type: result.extraction.releaseType,
        release_type_confidence: result.extraction.releaseTypeConfidence,
        release_date: result.extraction.dateline.date || project.releaseDate,
        status: "extracted",
      });
      onChange(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      await save(project.id, { status: "failed" }).then(onChange).catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[980px] px-8 py-10">
      <header className="border-b border-slate-200 pb-6">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.11em] text-slate-400">
          <span>{project.releaseType ? RELEASE_TYPE_LABELS[project.releaseType] : "Unclassified"}</span>
          {project.releaseDate ? <><span className="text-slate-300">·</span><span>{project.releaseDate}</span></> : null}
          {project.extractionMeta?.isMock ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-amber-800">
              <FlaskConical size={11} /> Sample data
            </span>
          ) : null}
        </div>
        <h1 className="mt-2 max-w-[38ch] text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] text-slate-900">{project.title}</h1>
      </header>

      <section className="mt-7">
        <SectionTitle>Extraction</SectionTitle>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <select
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-semibold text-slate-700 outline-none focus:border-slate-400"
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id} disabled={!p.isAvailable()}>
                {p.label}{p.isAvailable() ? "" : " — unavailable"}
              </option>
            ))}
          </select>
          <Button onClick={() => void runExtraction()} disabled={busy || !provider.isAvailable()}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            {extraction ? "Re-run extraction" : "Run extraction"}
          </Button>
          {!provider.isAvailable() && <span className="max-w-[46ch] text-[12.5px] leading-snug text-slate-400">{provider.unavailableReason()}</span>}
        </div>

        {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
      </section>

      {extraction && (
        <>
          <div className="mt-8 grid grid-cols-4 gap-6 rounded-2xl border border-slate-200 bg-white px-6 py-5">
            <Stat label="Type" value={RELEASE_TYPE_LABELS[extraction.releaseType]} sub={`${extraction.releaseTypeConfidence} confidence`} />
            <Stat label="Anchored" value={`${coverage.resolved}/${coverage.total}`} sub={coverage.total === coverage.resolved ? "every quote found" : "some quotes not found in source"} />
            <Stat label="Facts" value={String(extraction.facts.length)} sub={`${extraction.facts.filter((f) => f.derived).length} derived`} />
            <Stat label="Headline figures" value={String(extraction.headlineNumbers.length)} sub={`${extraction.headlineNumbers.filter((h) => h.emphasis === "primary").length} primary`} />
          </div>

          {coverage.resolved < coverage.total && (
            <div className="mt-4">
              <Notice tone="warn">
                {coverage.total - coverage.resolved} quote{coverage.total - coverage.resolved === 1 ? "" : "s"} could not be found in the stored
                release text. Those facts are unverified — the fact-check screen will hold them back from export.
              </Notice>
            </div>
          )}

          {extraction.warnings.length > 0 && (
            <div className="mt-4 space-y-2">
              {extraction.warnings.map((w, i) => <Notice key={i} tone="warn">{w}</Notice>)}
            </div>
          )}

          <section className="mt-8">
            <SectionTitle>Headline figures</SectionTitle>
            <div className="mt-5 space-y-6">
              {extraction.headlineNumbers.map((h, i) => (
                <div key={i} className="flex items-start gap-6">
                  <div className="w-[34%] shrink-0">
                    <div className="text-[10.5px] font-bold uppercase tracking-[0.11em] text-slate-400">{h.label}</div>
                    <div className={`mt-1 tracking-tight text-slate-900 tabular-nums ${h.emphasis === "primary" ? "text-[40px] font-semibold leading-none" : "text-[24px] font-medium leading-none"}`}>
                      {h.value}
                    </div>
                    {h.qualifier ? <div className="mt-1.5 text-[14px] font-medium text-slate-600">{h.qualifier}</div> : null}
                  </div>
                  <div className="min-w-0 flex-1 pt-1">
                    {h.context ? <div className="text-[13px] text-slate-500">{h.context}</div> : null}
                    {h.caveat ? <div className="mt-1 text-[12.5px] font-semibold text-amber-700">{h.caveat}</div> : null}
                    <blockquote className="mt-2 border-l-2 border-slate-200 pl-3 text-[12.5px] italic leading-relaxed text-slate-400">
                      {anchorText(h.anchor, project.rawText) || h.anchor.quote}
                      {h.anchor.resolved === false ? <span className="ml-1.5 not-italic font-bold text-rose-500">not found in source</span> : null}
                    </blockquote>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-9">
            <SectionTitle>Summary</SectionTitle>
            <dl className="mt-4 space-y-4">
              {([
                ["What happened", extraction.summary.whatHappened],
                ["Why it matters", extraction.summary.whyItMatters],
                ["What happens next", extraction.summary.whatHappensNext],
              ] as const).map(([label, text]) => (
                <div key={label} className="grid grid-cols-[150px_1fr] gap-5">
                  <dt className="pt-0.5 text-[11px] font-bold uppercase tracking-[0.09em] text-slate-400">{label}</dt>
                  <dd className="max-w-[62ch] text-[14px] leading-relaxed text-slate-700">{text}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="mt-9">
            <Disclosure title={`Facts (${extraction.facts.length})`}>
              <ul className="space-y-3">
                {extraction.facts.map((f) => (
                  <li key={f.id} className="grid grid-cols-[1fr_1fr] gap-5 border-b border-slate-100 pb-3">
                    <div>
                      <span className="text-[13.5px] leading-relaxed text-slate-700">{f.statement}</span>
                      <span className="ml-2 text-[11px] font-bold uppercase tracking-wide text-slate-300">{f.kind}</span>
                      {f.derived ? <div className="mt-0.5 text-[12px] text-amber-700">derived: {f.derivation}</div> : null}
                    </div>
                    <div className="text-[12.5px] italic leading-relaxed text-slate-400">
                      {anchorText(f.anchor, project.rawText) || f.anchor.quote}
                      {f.anchor.resolved === false ? <span className="ml-1.5 not-italic font-bold text-rose-500">not found</span> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </Disclosure>

            <Disclosure title="Raw extraction JSON">
              <pre className="max-h-[460px] overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-5 font-mono text-[11.5px] leading-relaxed text-slate-600">
                {JSON.stringify(extraction, null, 2)}
              </pre>
            </Disclosure>

            <Disclosure title="Source text">
              <pre className="max-h-[460px] overflow-auto whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-5 font-mono text-[12px] leading-relaxed text-slate-600">
                {project.rawText}
              </pre>
            </Disclosure>
          </section>
        </>
      )}

      {!extraction && (
        <div className="mt-8">
          <SectionTitle>Source text</SectionTitle>
          <pre className="mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-5 font-mono text-[12px] leading-relaxed text-slate-600">
            {project.rawText}
          </pre>
        </div>
      )}
    </div>
  );
}
