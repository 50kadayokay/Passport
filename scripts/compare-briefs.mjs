// scripts/compare-briefs.mjs — Phase 1B report (dev-only, read-only).
//
// Separates THREE things the user asked to see independently:
//   A. FACTUAL FAILURES  — deterministic grounding (ungrounded numbers, non-verbatim evidence).
//                          These are the gate. Source of truth = the runner's validateBrief result.
//   B. EDITORIAL DIFFERENCES — how the generated Brief differs from the approved benchmark
//                          (category, KR count, takeaway presence, which benchmark numbers appear).
//                          The benchmark is a QUALITY REFERENCE, not a verbatim target, so these
//                          are differences to judge, NOT failures.
//   C. COST — measured tokens + $/release.
//
// Usage: node scripts/compare-briefs.mjs --report <report.json> [--out <md>]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const REPORT = path.resolve(ROOT, arg("--report", path.join(process.env.SCRATCH || "/tmp", "brief-gen-report.json")));
const OUT = path.resolve(ROOT, arg("--out", path.join(process.env.SCRATCH || "/tmp", "brief-accuracy-report.md")));
const bench = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "brief-bench.json"), "utf8"));
const gen = JSON.parse(fs.readFileSync(REPORT, "utf8"));

const norm = (s) => String(s || "").toLowerCase().replace(/[   ]/g, " ").replace(/\s+/g, " ").trim();
const NUMRE = /\d[\d.,]*\d|\d/g;
const nums = (s) => [...new Set((String(s || "").match(NUMRE) || []).map((x) => x.replace(/,/g, "")))];

const lines = [`# MineEx Brief — Phase 1B report`, ``, `Model: \`${gen.model}\` · generated ${gen.generatedAt}`, ``];
const verdicts = {};

// ---- A. VERDICT per release: PASS / REVIEW / FAIL, factual vs evidence split ----
lines.push(`## A. Grounding verdict (deterministic) — PASS / REVIEW / FAIL`, ``);
lines.push(`PASS = all numbers contextually grounded + evidence verbatim-or-span-verified · REVIEW = grounded but some evidence unverifiable · FAIL = a factual error (ungrounded number or figure not attached to its measurement).`, ``);
for (const d of bench.dates) {
  const rec = (gen.perRelease || []).find((r) => r.date === d);
  if (!rec || !rec.ok) { lines.push(`- **${d}**: generation failed — ${rec?.error || "no record"}`); verdicts[d] = "FAIL"; continue; }
  const v = rec.validation || { status: "PASS", factualErrors: [], evidenceIssues: [] };
  verdicts[d] = v.status;
  lines.push(`- **${d}** — **${v.status}**`);
  if (v.factualErrors.length) { lines.push(`    - Factual errors (FAIL):`); v.factualErrors.forEach((f) => lines.push(`        - ${f}`)); }
  if (v.evidenceIssues.length) { lines.push(`    - Evidence-extraction (REVIEW):`); v.evidenceIssues.forEach((f) => lines.push(`        - ${f}`)); }
  if (!v.factualErrors.length && !v.evidenceIssues.length) lines.push(`    - clean`);
}
lines.push(``);

// ---- B. EDITORIAL DIFFERENCES vs benchmark (references, not targets) ----
lines.push(`## B. Editorial differences vs the approved benchmark (reference, not a verbatim target)`, ``);
for (const d of bench.dates) {
  const approved = bench.v2[d] || {};
  const rec = (gen.perRelease || []).find((r) => r.date === d);
  if (!rec || !rec.ok) continue;
  const g = rec.brief, diffs = [];
  if (norm(g.category) !== norm(approved.cat)) diffs.push(`category: generated **${g.category}** vs benchmark **${approved.cat}**`);
  const aKr = approved.kr || [], gKr = g.keyResults || [];
  if (aKr.length !== gKr.length) diffs.push(`Key Results count: generated **${gKr.length}** vs benchmark **${aKr.length}**`);
  const aTk = !!approved.tk, gTk = !!(g.takeaway && g.takeaway.trim());
  if (aTk !== gTk) diffs.push(`Takeaway: generated **${gTk ? "present" : "omitted"}** vs benchmark **${aTk ? "present" : "omitted"}**${g.omittedTakeawayReason ? ` (reason: ${g.omittedTakeawayReason})` : ""}`);
  // benchmark headline numbers that don't surface anywhere in the generated Brief
  const genNums = new Set(nums([g.headline, g.whatHappened, g.whyItMatters, g.takeaway, ...gKr.map((r) => `${r.value} ${r.descriptor} ${r.secondary} ${r.exactFigure}`)].join(" ")));
  const aNums = nums([approved.head, approved.wh, approved.wy, approved.tk, ...aKr.map((r) => `${r.v} ${r.desc} ${r.sec}`)].join(" "));
  const missing = aNums.filter((t) => t.length >= 2 && !genNums.has(t));
  if (missing.length) diffs.push(`benchmark numbers not surfaced by generator: ${missing.join(", ")}`);
  lines.push(`### ${d} — ${approved.cat} · ${approved.head}`);
  if (!diffs.length) { lines.push(`- matches the benchmark's shape`, ``); }
  else { diffs.forEach((x) => lines.push(`- ${x}`)); lines.push(``); }
}

// ---- C. COST ----
const t = gen.totals || {};
lines.push(`## C. Cost (measured)`, ``,
  `- model: \`${gen.model}\``,
  `- total: $${t.total_cost_usd}  ·  avg/release: $${t.avg_cost_per_release_usd}  ·  max/release: $${t.max_cost_per_release_usd}`,
  `- every release ≤ $0.25: **${t.within_budget_0_25}**  ·  total retries: ${t.total_retries}`,
  `- tokens: ${t.total_input_tokens} in / ${t.total_output_tokens} out`, ``);

// ---- Summary ----
const tally = (s) => Object.values(verdicts).filter((v) => v === s).length;
lines.push(`## Summary`, ``,
  `- **Verdicts**: ${tally("PASS")} PASS · ${tally("REVIEW")} REVIEW · ${tally("FAIL")} FAIL  (of ${bench.dates.length})`,
  `- **FAIL** = factual error (ungrounded number or figure not attached to its measurement) — must fix.`,
  `- **REVIEW** = factually grounded but a supporting passage couldn't be verbatim-verified — human eyes.`,
  `- **Editorial** differences from the benchmark are in section B (judge, not fail).`,
  `- **Cost**: $${t.total_cost_usd} total, ~$${t.avg_cost_per_release_usd}/release.`, ``);

fs.writeFileSync(OUT, lines.join("\n"));
console.log(lines.join("\n"));
console.log(`\nwrote ${path.relative(ROOT, OUT)}`);
