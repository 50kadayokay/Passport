// Post-processing applied to EVERY provider's output, mock included.
//
// Two jobs:
//   1. Fill in the shape — guarantee the arrays exist, so no downstream component
//      needs a `?? []` on every access.
//   2. Drop the empty-string placeholders. Tool schemas cannot express "omit this",
//      so models are told to return "" for absent optional strings; carrying those
//      through would put an empty caption or a blank ticker into a rendered slide.

import type { MiningExtraction } from "../../types";
import { EXTRACTION_SCHEMA_VERSION } from "../../types";
import { resolveAllAnchors } from "../../lib/anchors";

/** Recursively drop "" values and the empty containers that leaves behind. */
function prune(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(prune).filter((v) => v !== undefined);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim() === "") continue;
      const pruned = prune(v);
      if (pruned === undefined) continue;
      out[k] = pruned;
    }
    return out;
  }
  return node === null ? undefined : node;
}

const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/**
 * Normalise a raw provider payload into a `MiningExtraction` the rest of the app
 * can rely on, and resolve every source anchor against `sourceText`.
 */
export function normalizeExtraction(raw: unknown, sourceText: string): MiningExtraction {
  const p = (prune(raw) || {}) as Record<string, unknown>;

  const company = (p.company || {}) as Record<string, unknown>;
  const dateline = (p.dateline || {}) as Record<string, unknown>;
  const summary = (p.summary || {}) as Record<string, unknown>;

  const shaped = {
    ...p,
    schemaVersion: typeof p.schemaVersion === "number" ? p.schemaVersion : EXTRACTION_SCHEMA_VERSION,
    releaseType: p.releaseType || "other",
    releaseTypeConfidence: p.releaseTypeConfidence || "low",
    secondaryTypes: asArray(p.secondaryTypes),
    company: { name: company.name || "", tickers: asArray(company.tickers), website: company.website },
    headline: p.headline || "",
    dateline: { date: (dateline.date as string) || null, place: dateline.place },
    summary: {
      whatHappened: summary.whatHappened || "",
      whyItMatters: summary.whyItMatters || "",
      whatHappensNext: summary.whatHappensNext || "",
    },
    projects: asArray(p.projects),
    commodities: asArray(p.commodities),
    quotes: asArray(p.quotes),
    headlineNumbers: asArray(p.headlineNumbers),
    facts: asArray(p.facts),
    forwardLooking: p.forwardLooking === true,
    cautionaryNotes: asArray(p.cautionaryNotes),
    warnings: asArray(p.warnings),
  } as unknown as MiningExtraction;

  // Type-specific blocks keep their own required arrays.
  if (shaped.drill) {
    shaped.drill.holes = asArray(shaped.drill.holes);
    shaped.drill.highlights = asArray(shaped.drill.highlights);
  }
  if (shaped.exploration) {
    shaped.exploration.workTypes = asArray(shaped.exploration.workTypes);
    shaped.exploration.surveys = asArray(shaped.exploration.surveys);
    shaped.exploration.samples = asArray(shaped.exploration.samples);
    shaped.exploration.nextSteps = asArray(shaped.exploration.nextSteps);
  }
  if (shaped.financing) {
    shaped.financing.tranches = asArray(shaped.financing.tranches);
    shaped.financing.useOfProceeds = asArray(shaped.financing.useOfProceeds);
    shaped.financing.participants = asArray(shaped.financing.participants);
    shaped.financing.conditions = asArray(shaped.financing.conditions);
  }
  if (shaped.resource) {
    shaped.resource.categories = asArray(shaped.resource.categories);
    shaped.resource.priceAssumptions = asArray(shaped.resource.priceAssumptions);
    shaped.resource.notes = asArray(shaped.resource.notes);
  }

  return resolveAllAnchors(shaped, sourceText);
}
