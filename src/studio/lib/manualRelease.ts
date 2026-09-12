// Hand-entered releases.
//
// This is a PRODUCTION path, not a test fixture: it is how an operator drives the
// studio when there is no model call to be had, and how they correct an
// extraction that got a figure wrong. It therefore lives in lib/, not mock/.
//
// The important trick is that it does NOT bypass verification. The form is
// assembled into a plain-text release, and every fact's anchor quotes a line of
// that text — so hand-entered facts resolve for exactly the same reason model-
// extracted ones do, and the fact-check screen keeps meaning something. The
// "source" is simply the operator's own words rather than a wire release.

import type { HeadlineNumber, MiningExtraction, ReleaseType } from "../types";
import { normalizeExtraction } from "../services/extraction/normalize";

export interface ManualFigure {
  label: string;
  value: string;
  qualifier: string;
  context: string;
  caveat: string;
  emphasis: "primary" | "secondary";
}

export interface ManualRelease {
  companyName: string;
  tickers: string;          // "TSXV: TVM, OTCQB: TVMLF"
  website: string;
  releaseType: ReleaseType;
  headline: string;
  date: string;             // YYYY-MM-DD
  place: string;
  projectName: string;
  jurisdiction: string;
  ownership: string;
  commodities: string;      // comma separated
  whatHappened: string;
  whyItMatters: string;
  whatHappensNext: string;
  figures: ManualFigure[];
  quoteText: string;
  quoteName: string;
  quoteRole: string;
  cautionaryNotes: string;  // one per line
}

export const emptyFigure = (): ManualFigure => ({
  label: "", value: "", qualifier: "", context: "", caveat: "", emphasis: "secondary",
});

export const emptyRelease = (): ManualRelease => ({
  companyName: "", tickers: "", website: "",
  releaseType: "drill_results",
  headline: "", date: "", place: "",
  projectName: "", jurisdiction: "", ownership: "", commodities: "",
  whatHappened: "", whyItMatters: "", whatHappensNext: "",
  figures: [{ ...emptyFigure(), emphasis: "primary" }, emptyFigure()],
  quoteText: "", quoteName: "", quoteRole: "",
  cautionaryNotes: "",
});

const lines = (v: string) => String(v || "").split("\n").map((l) => l.trim()).filter(Boolean);
const csv = (v: string) => String(v || "").split(",").map((x) => x.trim()).filter(Boolean);

function parseTickers(v: string): { exchange: string; symbol: string }[] {
  return csv(v).map((pair) => {
    const [exchange, symbol] = pair.split(":").map((x) => x.trim());
    return { exchange: exchange || "", symbol: symbol || exchange || "" };
  }).filter((t) => t.symbol);
}

/** Render the form as a plain-text release — the document every anchor quotes. */
export function releaseToText(f: ManualRelease): string {
  const out: string[] = [];
  if (f.headline) out.push(f.headline);
  const dateline = [f.place, f.date].filter(Boolean).join(", ");
  if (dateline || f.companyName) {
    out.push(`${dateline ? dateline + " - " : ""}${f.companyName}${f.tickers ? ` (${f.tickers})` : ""} reports the following.`);
  }
  if (f.whatHappened) out.push(f.whatHappened);
  if (f.whyItMatters) out.push(f.whyItMatters);
  if (f.projectName) {
    out.push(`Project: ${f.projectName}${f.jurisdiction ? `, ${f.jurisdiction}` : ""}${f.ownership ? ` (${f.ownership})` : ""}.`);
  }
  f.figures.filter((x) => x.value.trim()).forEach((x) => {
    out.push([x.label, x.value, x.qualifier, x.context].filter(Boolean).join(" — ") + ".");
  });
  if (f.quoteText) out.push(`"${f.quoteText}" said ${[f.quoteName, f.quoteRole].filter(Boolean).join(", ")}.`);
  if (f.whatHappensNext) out.push(f.whatHappensNext);
  lines(f.cautionaryNotes).forEach((n) => out.push(n));
  return out.join("\n\n");
}

/**
 * Build a MiningExtraction from the form.
 *
 * Anchors quote the assembled text verbatim, so `normalizeExtraction` resolves
 * them the same way it resolves a model's quotes and nothing downstream needs to
 * know the difference.
 */
export function buildExtraction(f: ManualRelease): { extraction: MiningExtraction; rawText: string } {
  const rawText = releaseToText(f);
  const anchorFor = (needle: string) => ({ quote: needle });

  const figures = f.figures.filter((x) => x.value.trim());
  const headlineNumbers: HeadlineNumber[] = figures.map((x) => ({
    label: x.label || "Figure",
    value: x.value,
    ...(x.qualifier ? { qualifier: x.qualifier } : {}),
    ...(x.context ? { context: x.context } : {}),
    ...(x.caveat ? { caveat: x.caveat } : {}),
    kind: "other" as const,
    emphasis: x.emphasis,
    anchor: anchorFor([x.label, x.value, x.qualifier, x.context].filter(Boolean).join(" — ")),
  }));

  const raw: Record<string, unknown> = {
    schemaVersion: 1,
    releaseType: f.releaseType,
    releaseTypeConfidence: "high",
    secondaryTypes: [],
    company: {
      name: f.companyName,
      tickers: parseTickers(f.tickers),
      ...(f.website ? { website: f.website } : {}),
    },
    headline: f.headline,
    dateline: { date: f.date || null, ...(f.place ? { place: f.place } : {}) },
    summary: {
      whatHappened: f.whatHappened,
      whyItMatters: f.whyItMatters,
      whatHappensNext: f.whatHappensNext,
    },
    projects: f.projectName
      ? [{
          name: f.projectName,
          commodities: csv(f.commodities),
          ...(f.jurisdiction ? { jurisdiction: { label: f.jurisdiction } } : {}),
          ...(f.ownership ? { ownership: f.ownership } : {}),
          anchor: anchorFor(`Project: ${f.projectName}`),
        }]
      : [],
    commodities: csv(f.commodities),
    quotes: f.quoteText
      ? [{
          name: f.quoteName || "Company statement",
          ...(f.quoteRole ? { role: f.quoteRole } : {}),
          quote: f.quoteText,
          anchor: anchorFor(f.quoteText),
        }]
      : [],
    headlineNumbers,
    facts: figures.map((x, i) => ({
      id: `m${i}`,
      statement: [x.label, x.value, x.qualifier].filter(Boolean).join(" "),
      kind: "measurement" as const,
      confidence: "high" as const,
      anchor: anchorFor([x.label, x.value, x.qualifier, x.context].filter(Boolean).join(" — ")),
    })),
    forwardLooking: /expect|anticipat|will |plan/i.test(f.whatHappensNext || ""),
    cautionaryNotes: lines(f.cautionaryNotes),
    warnings: ["Entered by hand — figures were not extracted from a source document."],
  };

  return { extraction: normalizeExtraction(raw, rawText), rawText };
}
