// Localhost-only Story Studio harness — no auth, no database, no API key.
//
// Walks the whole pipeline in the order it actually runs, one explicit step at a
// time, so each stage's output can be judged before the next consumes it:
//
//   choose release → extract → verify + classify + direct → design + render
//
// The route is gated to localhost in main.jsx, and the fixtures it uses are
// dropped from production builds, so this can never render publicly.

import React, { useEffect, useMemo, useState } from "react";
import { FlaskConical, Loader2, Check } from "lucide-react";
import Workbench from "../design/Workbench";
import ProjectView from "../screens/ProjectView";
import AuditAll from "./AuditAll";
import ReleaseForm from "../screens/ReleaseForm";
import type { MiningExtraction, StoryProject, StoryProjectRow } from "../types";
import { guessReleaseDate } from "../lib/ingest";
import { contentHash, textStats } from "../lib/hash";
import { getExtractionProvider } from "../services/extraction";
import type { StudioFixture } from "../mock/fixtures";

type Step = "choose" | "form" | "extracted" | "carousel";

function makeMemoryStore(initial: StoryProject) {
  let current = initial;
  return {
    get: () => current,
    save: async (_id: string, patch: Partial<StoryProjectRow>): Promise<StoryProject> => {
      current = {
        ...current,
        status: (patch.status as StoryProject["status"]) ?? current.status,
        extraction: patch.extraction !== undefined ? patch.extraction : current.extraction,
        extractionMeta: patch.extraction_meta !== undefined ? patch.extraction_meta : current.extractionMeta,
        releaseType: patch.release_type !== undefined ? patch.release_type : current.releaseType,
        releaseTypeConfidence: patch.release_type_confidence !== undefined ? patch.release_type_confidence : current.releaseTypeConfidence,
        releaseDate: patch.release_date !== undefined ? patch.release_date : current.releaseDate,
        updatedAt: new Date().toISOString(),
      };
      return current;
    },
  };
}

async function projectFromText(text: string, title: string): Promise<StoryProject> {
  const now = new Date().toISOString();
  return {
    id: "demo", companyId: null, createdBy: null, title, status: "ingested",
    sourceKind: "paste", sourceUrl: "", sourceFilename: "", sourceStoragePath: "",
    rawText: text, contentHash: await contentHash(text), releaseDate: guessReleaseDate(text),
    releaseType: null, releaseTypeConfidence: null, extraction: null, extractionMeta: null,
    verification: null, story: null, design: null, themeId: null, createdAt: now, updatedAt: now,
  };
}

const StepDot = ({ done, active, n, label }: { done: boolean; active: boolean; n: number; label: string }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    <div style={{
      width: 22, height: 22, borderRadius: 11, display: "grid", placeItems: "center",
      fontSize: 11, fontWeight: 700,
      background: done ? "#0f172a" : active ? "#fff" : "#f1f5f9",
      border: `1.5px solid ${done || active ? "#0f172a" : "#e2e8f0"}`,
      color: done ? "#fff" : active ? "#0f172a" : "#94a3b8",
    }}>{done ? <Check size={12} /> : n}</div>
    <span style={{ fontSize: 12.5, fontWeight: 600, color: done || active ? "#0f172a" : "#94a3b8" }}>{label}</span>
  </div>
);

export default function StudioDemo() {
  const [fixtures, setFixtures] = useState<StudioFixture[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>("choose");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [project, setProject] = useState<StoryProject | null>(null);
  const [showPipeline, setShowPipeline] = useState(false);
  const [pasted, setPasted] = useState("");
  // ?audit=1 renders the whole fixture × theme matrix for the geometry check.
  const auditMode = (() => { try { return new URLSearchParams(window.location.search).get("audit") === "1"; } catch { return false; } })();

  // Entering this route IS the opt-in the sample provider requires.
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("mock") !== "1") {
        url.searchParams.set("mock", "1");
        window.history.replaceState({}, "", url.toString());
      }
    } catch { /* the provider still runs its own check */ }
    void import("../mock/fixtures").then((m) => { setFixtures(m.FIXTURES); setLoading(false); });
  }, []);

  const store = useMemo(() => (project ? makeMemoryStore(project) : null), [project?.id, project?.rawText]);

  const choose = async (f: StudioFixture) => {
    setError("");
    setProject(await projectFromText(f.releaseText, f.label));
    setStep("choose");
  };

  /** Hand-entered release: skips extraction, joins the pipeline at the same point. */
  const useManual = async (extraction: MiningExtraction, rawText: string, title: string) => {
    const base = await projectFromText(rawText, title);
    setProject({
      ...base,
      extraction,
      extractionMeta: { provider: "manual", model: "hand-entered", schemaVersion: extraction.schemaVersion, extractedAt: new Date().toISOString() },
      releaseType: extraction.releaseType,
      releaseTypeConfidence: extraction.releaseTypeConfidence,
      releaseDate: extraction.dateline.date,
      status: "extracted",
    });
    setStep("carousel");
  };

  const runExtraction = async () => {
    if (!project) return;
    setBusy(true); setError("");
    try {
      const provider = getExtractionProvider("mock");
      const result = await provider.extract({ text: project.rawText });
      setProject({
        ...project,
        extraction: result.extraction,
        extractionMeta: result.meta,
        releaseType: result.extraction.releaseType,
        releaseTypeConfidence: result.extraction.releaseTypeConfidence,
        releaseDate: result.extraction.dateline.date || project.releaseDate,
        status: "extracted",
      });
      setStep("extracted");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="grid min-h-screen place-items-center bg-slate-50 text-slate-400"><Loader2 className="animate-spin" /></div>;
  }

  if (auditMode) {
    return (
      <div className="min-h-screen bg-slate-50 px-8 py-7">
        <h1 className="mb-5 text-[22px] font-semibold tracking-[-0.02em] text-slate-900">QA matrix — every fixture × every theme</h1>
        <AuditAll />
      </div>
    );
  }

  const extraction = project?.extraction as MiningExtraction | null;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-amber-200 bg-amber-50 px-8 py-2.5 text-[12.5px] font-semibold text-amber-800">
        <span className="inline-flex items-center gap-1.5">
          <FlaskConical size={13} /> Story Studio dev harness — localhost only, sample data, nothing is saved.
        </span>
      </div>

      <div className="flex items-center gap-7 border-b border-slate-200 bg-white px-8 py-3">
        <StepDot n={1} label="Choose release" done={!!project} active={!project} />
        <StepDot n={2} label="Run extraction" done={!!extraction} active={!!project && !extraction} />
        <StepDot n={3} label="Story + carousel" done={step === "carousel"} active={!!extraction && step !== "carousel"} />
        {extraction ? (
          <button onClick={() => setShowPipeline(!showPipeline)}
            className="ml-auto rounded-lg px-3 py-1.5 text-[12px] font-bold text-slate-500 hover:bg-slate-100">
            {showPipeline ? "Hide extraction detail" : "Extraction detail"}
          </button>
        ) : null}
      </div>

      <div className="px-9 py-8">
        {/* ── 1. Choose ────────────────────────────────────────────────── */}
        {step === "choose" && (
          <div className="mx-auto max-w-[860px]">
            <h1 className="text-[29px] font-semibold leading-tight tracking-[-0.02em] text-slate-900">Choose a sample release</h1>
            <p className="mt-1.5 max-w-[58ch] text-[14px] leading-relaxed text-slate-500">
              Each type produces a different story structure, a different drawing and a different set of layouts.
            </p>
            <div className="mt-7 space-y-2.5">
              {fixtures.map((f) => (
                <button key={f.id} onClick={() => void choose(f)}
                  className={`block w-full rounded-2xl border px-5 py-4 text-left transition ${
                    project?.title === f.label ? "border-slate-900 bg-white" : "border-slate-200 bg-white hover:border-slate-300"
                  }`}>
                  <div className="text-[14.5px] font-semibold text-slate-900">{f.label}</div>
                  <div className="mt-0.5 text-[12.5px] text-slate-400">
                    {f.releaseType.replace(/_/g, " ")} · {textStats(f.releaseText).words.toLocaleString()} words
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-7 rounded-2xl border border-slate-200 bg-white p-5">
              <div className="text-[13px] font-bold text-slate-900">Or use your own release</div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-slate-500">
                Type the details in yourself, or paste the release text. Sample extraction returns the
                closest matching fixture, so for your own content the form is the accurate route.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button onClick={() => setStep("form")}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-[13px] font-bold text-white">Enter details</button>
                <span className="text-[12px] text-slate-300">or</span>
                <textarea
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  placeholder="Paste release text…"
                  className="h-[38px] min-w-[260px] flex-1 resize-y rounded-xl border border-slate-200 px-3 py-2 font-mono text-[12px]"
                />
                <button
                  disabled={pasted.trim().length < 120}
                  onClick={() => void projectFromText(pasted, pasted.split("\n")[0]?.slice(0, 90) || "Pasted release").then((pr) => { setProject(pr); setStep("choose"); })}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-[13px] font-bold text-slate-600 disabled:opacity-40"
                >Load text</button>
              </div>
            </div>

            {project && (
              <div className="mt-7 flex items-center gap-3">
                <button onClick={() => void runExtraction()} disabled={busy}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-40">
                  {busy ? <Loader2 size={14} className="animate-spin" /> : null} Run extraction
                </button>
                <span className="text-[12.5px] text-slate-400">{project.title}</span>
              </div>
            )}
            {error && <p className="mt-4 text-[13px] font-semibold text-rose-600">{error}</p>}
          </div>
        )}

        {step === "form" && (
          <ReleaseForm onBuild={(ex, raw, title) => void useManual(ex, raw, title)} onCancel={() => setStep("choose")} />
        )}

        {/* ── 2. Extracted ─────────────────────────────────────────────── */}
        {step === "extracted" && extraction && (
          <div className="mx-auto max-w-[860px]">
            <h1 className="text-[29px] font-semibold leading-tight tracking-[-0.02em] text-slate-900">Extraction complete</h1>
            <p className="mt-1.5 max-w-[58ch] text-[14px] leading-relaxed text-slate-500">
              {extraction.facts.length} facts and {extraction.headlineNumbers.length} headline figures, each anchored to a
              verbatim quote. Next: verify the claims, classify the release, plan the story and lay it out.
            </p>
            <div className="mt-6 flex items-center gap-3">
              <button onClick={() => setStep("carousel")}
                className="rounded-xl bg-slate-900 px-5 py-2.5 text-[13.5px] font-bold text-white">
                Generate story &amp; carousel
              </button>
              <button onClick={() => { setProject(null); setStep("choose"); }}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-[13px] font-bold text-slate-500 hover:text-slate-900">
                Start over
              </button>
            </div>
          </div>
        )}

        {/* ── 3. Carousel ──────────────────────────────────────────────── */}
        {step === "carousel" && extraction && (
          <div>
            <div className="mb-5 flex items-baseline gap-4">
              <h1 className="text-[29px] font-semibold leading-tight tracking-[-0.02em] text-slate-900">Carousel</h1>
              <button onClick={() => { setProject(null); setStep("choose"); }}
                className="text-[12.5px] font-bold text-slate-400 hover:text-slate-700">Choose another release</button>
            </div>
            <Workbench extraction={extraction} />
          </div>
        )}

        {/* Extraction detail, on demand — the stage 1–4 screen, unchanged. */}
        {showPipeline && project && store && (
          <div className="mt-10 border-t border-slate-200 pt-6">
            <ProjectView project={store.get()} onChange={setProject} save={store.save} />
          </div>
        )}
      </div>
    </div>
  );
}
