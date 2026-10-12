// scripts/compare-briefs.mjs — Phase 1A accuracy report (dev-only, read-only).
//
// Compares the GENERATED Briefs against the APPROVED benchmark and against the
// ORIGINAL source text, and reports every discrepancy: category, section presence,
// Key Results rows (value/unit/rel), takeaway omission, number preservation, and
// grounding (does each generated number/quote actually appear in the source?).
//
// Usage:
//   node scripts/compare-briefs.mjs --report /tmp/brief-gen-report.json [--out <md>]

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
const sourceTextOf = (d) => norm((bench.full[d]?.blocks || []).filter((b) => b.type !== "image").map((b) => b.text || "").join(" "));
// numeric cores like 218, 6.45, 1,742, 13,000,000.50, 866.25, 100
const NUMRE = /\d[\d.,]*\d|\d/g;
const nums = (s) => (String(s || "").match(NUMRE) || []).map((x) => x.replace(/,/g, ""));
const inSource = (tok, src) => {
  const t = tok.replace(/,/g, "");
  if (src.includes(t)) return true;
  const intPart = t.split(".")[0];
  return intPart.length >= 2 && src.includes(intPart); // allow compacted/rounded money (13.0M ⇐ 13,000,000)
};

const lines = [`# MineEx Brief — Phase 1A accuracy report`, ``, `Model: \`${gen.model}\` · generated ${gen.generatedAt}`, ``];
const summary = [];

for (const d of bench.dates) {
  const approved = bench.v2[d] || {};
  const rec = (gen.perRelease || []).find((r) => r.date === d);
  lines.push(`## ${d} — ${approved.cat || "?"} · ${approved.head || ""}`);
  if (!rec || !rec.ok) { lines.push(`- ✗ generation failed: ${rec?.error || "no record"}`, ``); summary.push({ date: d, status: "FAILED" }); continue; }
  const g = rec.brief, gv2 = gen && null;
  const src = sourceTextOf(d);
  const issues = [];

  // category
  if (norm(g.category) !== norm(approved.cat)) issues.push(`category: generated **${g.category}** vs approved **${approved.cat}**`);

  // takeaway presence
  const aTk = !!approved.tk, gTk = !!(g.takeaway && g.takeaway.trim());
  if (aTk !== gTk) issues.push(`takeaway: generated **${gTk ? "present" : "omitted"}** vs approved **${aTk ? "present" : "omitted"}**${g.omittedTakeawayReason ? ` (reason: ${g.omittedTakeawayReason})` : ""}`);

  // key-results count + per-row
  const aKr = approved.kr || [], gKr = g.keyResults || [];
  if (aKr.length !== gKr.length) issues.push(`key-results count: generated **${gKr.length}** vs approved **${aKr.length}**`);
  aKr.forEach((ar, i) => {
    const match = gKr.find((gr) => norm(gr.value) === norm(ar.v));
    if (!match) { issues.push(`approved KR value **${ar.v} ${ar.u}** not found in generated`); return; }
    if (norm(match.unit) !== norm(ar.u)) issues.push(`KR ${ar.v}: unit generated **${match.unit}** vs approved **${ar.u}**`);
    const aRel = ar.rel || "", gRel = match.rel || "";
    if (norm(aRel) !== norm(gRel)) issues.push(`KR ${ar.v}: rel generated **${gRel || "—"}** vs approved **${aRel || "—"}**`);
  });
  gKr.forEach((gr) => { if (!aKr.find((ar) => norm(ar.v) === norm(gr.value))) issues.push(`generated extra KR value **${gr.value} ${gr.unit}** (not in approved)`); });

  // grounding: every generated KR number must be traceable to source
  const genText = [g.headline, g.whatHappened, g.whyItMatters, g.takeaway, ...gKr.map((r) => `${r.value} ${r.descriptor} ${r.secondary} ${r.exactFigure}`)].join(" ");
  const ungrounded = [...new Set(nums(genText))].filter((t) => t.length >= 2 && !inSource(t, src));
  if (ungrounded.length) issues.push(`⚠ numbers not found verbatim in source (possible hallucination): ${ungrounded.join(", ")}`);

  // grounding: KR evidence quotes should be verbatim
  gKr.forEach((gr) => { if (gr.evidenceQuote && !src.includes(norm(gr.evidenceQuote).slice(0, 40))) issues.push(`KR ${gr.value}: evidenceQuote not found verbatim in source`); });

  // number preservation: approved numbers that vanished
  const aNums = [...new Set(nums([approved.head, approved.wh, approved.wy, approved.tk, ...aKr.map((r) => `${r.v} ${r.desc} ${r.sec}`)].join(" ")))];
  const gNums = new Set(nums(genText));
  const missing = aNums.filter((t) => t.length >= 2 && !gNums.has(t) && !inSource(t, norm(genText)));
  if (missing.length) issues.push(`approved numbers missing from generated: ${missing.join(", ")}`);

  if (issues.length === 0) { lines.push(`- ✓ no discrepancies (category, sections, KR rows, takeaway, numbers, grounding)`, ``); summary.push({ date: d, status: "CLEAN", issues: 0 }); }
  else { issues.forEach((x) => lines.push(`- ${x}`)); lines.push(``); summary.push({ date: d, status: "DISCREPANCIES", issues: issues.length }); }
}

const t = gen.totals || {};
lines.push(`## Summary`, ``);
summary.forEach((s) => lines.push(`- ${s.date}: **${s.status}**${s.issues ? ` (${s.issues})` : ""}`));
lines.push(``, `## Cost (measured)`, ``,
  `- model: \`${gen.model}\``,
  `- total: $${t.total_cost_usd}  ·  avg/release: $${t.avg_cost_per_release_usd}  ·  max/release: $${t.max_cost_per_release_usd}`,
  `- every release ≤ $0.25: **${t.within_budget_0_25}**  ·  total retries: ${t.total_retries}`,
  `- tokens: ${t.total_input_tokens} in / ${t.total_output_tokens} out`, ``);

fs.writeFileSync(OUT, lines.join("\n"));
console.log(lines.join("\n"));
console.log(`\nwrote ${path.relative(ROOT, OUT)}`);
