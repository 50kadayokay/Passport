// End-to-end BriefV1 generation test for a NON-Kingsmen release.
// Runs the REAL generator (OpenAI, MINEEX_BRIEF_API_KEY) + validator + assembly pipeline and
// mirrors structure-release.js's PASS/REVIEW/FAIL attach logic, confirming v2 (with Key Results)
// reaches pp.PR_YEARS[].items[].v2 and writing public/newgen-test.json for the ?newgen=1 render demo.
// Run bundled so Vite-only imports resolve, e.g.:
//   esbuild scripts/_e2e-brief-test.mjs --bundle --platform=node --format=esm \
//     --define:import.meta.env="{}" --outfile=/tmp/e2e.mjs && node /tmp/e2e.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateBrief, briefToV2, BRIEF_MODEL } from "../api/_briefGen.js";
import { validateBrief } from "../api/_briefValidate.js";
import { assembleTimeline, toTimelineEntries } from "../src/lib/structureReleases.js";
import { mapProfileToPP } from "../src/lib/profileToPP.js";

// No .env file is read (those hold production credentials; scripts/script-target-guard-test.mjs).
// The caller exports the provider key it means to spend, in its own shell.
if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
  console.error("  REFUSING: set OPENAI_API_KEY or ANTHROPIC_API_KEY in your shell first (this spends real AI credits).");
  process.exit(2);
}

const COMPANY = "Sierra Blanca Silver Corp.";
const DATE = "2026-09-30";
const PR = `Sierra Blanca Silver Corp. Intersects 12.4 Metres of 583 g/t Silver Equivalent at the Rosario Vein, Durango, Mexico

Durango, Mexico — September 30, 2026 — Sierra Blanca Silver Corp. (TSXV: SBS) ("Sierra Blanca" or the "Company") is pleased to report assay results from the first four diamond drill holes of its 2026 program at the 100%-owned Rosario Project in Durango State, Mexico.

Drill hole ROS-26-012 intersected 12.4 metres grading 583 g/t silver equivalent (AgEq), including a higher-grade interval of 2.1 metres at 1,640 g/t AgEq, from a down-hole depth of 118.0 to 130.4 metres. The silver equivalent calculation uses 410 g/t silver, 1.8 g/t gold and 2.4% lead over the 12.4 metre interval.

Hole ROS-26-013, drilled 60 metres along strike to the northwest, returned 8.7 metres of 372 g/t AgEq from 95.5 metres, confirming continuity of the Rosario vein. Holes ROS-26-014 and ROS-26-015 are currently being logged and sampled, with assays pending.

"These results confirm a robust, high-grade silver system over an initial strike length of at least 300 metres," said Elena Marquez, President and CEO. "The vein remains open along strike and at depth."

The Company has budgeted 6,000 metres of drilling for the 2026 program. Assays for the remaining holes are expected in the fourth quarter of 2026.`;

const MODEL = process.env.MINEEX_BRIEF_MODEL || BRIEF_MODEL();
console.log(`model: ${MODEL}\ncompany: ${COMPANY}\n`);

const g = await generateBrief({ sourceText: PR, companyName: COMPANY, sourceDate: DATE, category: "" });
console.log("generateBrief: OK  (category=" + g.brief.category + ", keyResults=" + (g.brief.keyResults || []).length + ", takeaway=" + (g.brief.takeaway ? "yes" : "none") + ")  cost=$" + g.cost.toFixed(5));

const v = validateBrief(g.brief, PR);
console.log("validateBrief: status=" + v.status + (v.factualErrors?.length ? "  factualErrors=" + v.factualErrors.length : "") + (v.evidenceIssues?.length ? "  evidenceIssues=" + v.evidenceIssues.length : ""));

let v2 = null;
if (v.status === "PASS") { v2 = { ...briefToV2(g.brief, g.brief.category), _gen: true }; }
else if (v.status === "REVIEW") { v2 = { ...briefToV2(g.brief, g.brief.category), _gen: true, _needsReview: true }; }
console.log("attach: v2 " + (v2 ? "ATTACHED (_gen=" + v2._gen + (v2._needsReview ? ", _needsReview=true" : "") + ")" : "NOT attached (held for review)"));

const analysis = {
  card: { headline: g.brief.headline, sourceDate: DATE, category: g.brief.category,
    whatHappened: g.brief.whatHappened, whyItMatters: g.brief.whyItMatters, whatHappensNext: "",
    keyNumbers: (g.brief.keyResults || []).map((k) => ({ value: [k.value, k.unit].filter(Boolean).join(" "), label: k.descriptor })),
    investorTakeaway: g.brief.takeaway || "", sourceUrl: "" },
  classification: { suggestedImpact: "High", suggestedKey: true, confidence: "high" },
  proposedChanges: [],
  ...(v2 ? { v2 } : {}),
};
const assembled = assembleTimeline([{ item: { id: DATE, text: PR }, analysis }]);
const entries = toTimelineEntries(assembled);
const pp = mapProfileToPP({ timeline: entries });
const item = pp.PR_YEARS?.[0]?.items?.[0];
console.log("\npipeline -> pp.PR_YEARS[0].items[0]:");
console.log("  id:", item?.id, "| headline:", (item?.headline || "").slice(0, 60));
console.log("  v2 present:", !!item?.v2, "| v2._gen:", item?.v2?._gen, "| kr rows:", (item?.v2?.kr || []).length, "| tk:", item?.v2?.tk ? "yes" : "none");
if (item?.v2?.kr?.length) console.log("  Key Results:", item.v2.kr.map((r) => `${r.v}${r.u ? " " + r.u : ""} — ${r.desc}`).join(" | "));

const bogus = JSON.parse(JSON.stringify(g.brief));
bogus.keyResults = [{ value: "9999", unit: "g/t AgEq", descriptor: "fabricated interval not in source", secondary: "", rel: "" }];
const vb = validateBrief(bogus, PR);
console.log("\nFAIL-branch check: ungrounded 9999 g/t -> validate status=" + vb.status + " -> " + (vb.status === "FAIL" ? "v2 NOT attached (correct: held)" : "status " + vb.status));

if (item?.v2) {
  const fx = { company: COMPANY, ticker: "TSXV: SBS", date: DATE,
    item: { id: item.id, headline: item.headline, originalTitle: item.originalTitle || g.brief.headline, v2: item.v2 },
    full: { blocks: PR.split(/\n{2,}/).map((t) => ({ text: t.trim() })).filter((b) => b.text) } };
  fs.writeFileSync(path.join(ROOT, "public/newgen-test.json"), JSON.stringify(fx, null, 2));
  console.log("\nwrote public/newgen-test.json (render fixture)");
}
console.log("\nDONE.");
