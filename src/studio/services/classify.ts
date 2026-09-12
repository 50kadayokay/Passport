// Release classifier (stage 6).
//
// Deliberately deterministic. The extraction already reports its own read of the
// type AND which type-specific blocks it managed to populate, so the decision is
// evidence that is already in hand. A second model call here would add latency,
// cost and nondeterminism to a question the data has effectively answered — and
// it could not be unit-tested, which this can.
//
// Signal weights, strongest first:
//   1. Which blocks carry real content (a populated drill block with holes is
//      near-conclusive).
//   2. The extractor's own releaseType.
//   3. Headline wording, as a tiebreak only.

import type { Confidence, MiningExtraction, ReleaseType } from "../types";

export interface Classification {
  type: ReleaseType;
  confidence: Confidence;
  /** Human-readable evidence, shown in review so the decision is never a black box. */
  reasons: string[];
  scores: Record<ReleaseType, number>;
  /** Other types genuinely present — a financing that also reports assays. */
  secondary: ReleaseType[];
}

const HEADLINE_HINTS: [ReleaseType, RegExp][] = [
  ["drill_results", /\b(intersect|intercept|drill|assay|hole|g\/t|grading)\b/i],
  ["financing", /\b(placement|offering|financing|proceeds|bought deal|flow-through|subscri|warrant)\b/i],
  ["resource_update", /\b(mineral resource|resource estimate|mre|indicated|inferred|contained (ounces|oz)|43-101)\b/i],
  ["exploration_update", /\b(survey|geophys|geochem|sampling|target|mapping|trench|soil)\b/i],
];

export function classifyRelease(extraction: MiningExtraction): Classification {
  const scores: Record<ReleaseType, number> = {
    drill_results: 0, exploration_update: 0, financing: 0, resource_update: 0, other: 0,
  };
  const reasons: string[] = [];

  // 1) Block evidence — the strongest signal available.
  const drill = extraction.drill;
  if (drill && (drill.holes?.length || drill.highlights?.length)) {
    const n = drill.holes?.length || 0;
    scores.drill_results += 6 + Math.min(3, n);
    reasons.push(`Drill block populated with ${n} hole${n === 1 ? "" : "s"}.`);
  }
  const fin = extraction.financing;
  if (fin && (fin.grossProceeds || fin.tranches?.length)) {
    scores.financing += 7;
    reasons.push(`Financing block populated${fin.grossProceeds ? ` (${fin.grossProceeds.raw})` : ""}.`);
  }
  const res = extraction.resource;
  if (res && res.categories?.length) {
    scores.resource_update += 7 + Math.min(2, res.categories.length);
    reasons.push(`Resource block with ${res.categories.length} categor${res.categories.length === 1 ? "y" : "ies"}.`);
  }
  const exp = extraction.exploration;
  if (exp && (exp.surveys?.length || exp.samples?.length)) {
    scores.exploration_update += 5 + Math.min(2, (exp.surveys?.length || 0) + (exp.samples?.length || 0));
    reasons.push(`Exploration block with ${exp.surveys?.length || 0} survey(s) and ${exp.samples?.length || 0} sample set(s).`);
  }

  // 2) The extractor's own judgment.
  if (extraction.releaseType && extraction.releaseType !== "other") {
    const weight = extraction.releaseTypeConfidence === "high" ? 4 : extraction.releaseTypeConfidence === "medium" ? 2.5 : 1.5;
    scores[extraction.releaseType] += weight;
    reasons.push(`Extractor read it as ${extraction.releaseType.replace(/_/g, " ")} (${extraction.releaseTypeConfidence} confidence).`);
  }

  // 3) Headline wording — tiebreak weight only.
  const headline = extraction.headline || "";
  HEADLINE_HINTS.forEach(([type, re]) => {
    if (re.test(headline)) { scores[type] += 1.5; reasons.push(`Headline language suggests ${type.replace(/_/g, " ")}.`); }
  });

  const ranked = (Object.entries(scores) as [ReleaseType, number][])
    .filter(([t]) => t !== "other")
    .sort((a, b) => b[1] - a[1]);

  const top = ranked[0];
  if (!top || top[1] === 0) {
    return { type: "other", confidence: "low", reasons: ["No type-specific evidence found."], scores, secondary: [] };
  }

  const second = ranked[1];
  const margin = top[1] - (second ? second[1] : 0);
  const confidence: Confidence = top[1] >= 8 && margin >= 4 ? "high" : top[1] >= 5 && margin >= 2 ? "medium" : "low";

  // A secondary type needs real block evidence of its own, not just a headline word.
  const secondary = ranked.slice(1).filter(([, s]) => s >= 5).map(([t]) => t);

  return { type: top[0], confidence, reasons, scores, secondary };
}
