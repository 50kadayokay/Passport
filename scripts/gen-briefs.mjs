// scripts/gen-briefs.mjs — Phase 1A generation runner (OpenAI, dev-only, no DB/prod writes).
//
// Generates a MineEx BriefV1 for each of the 8 original Kingsmen releases using the
// ORIGINAL release text (public/brief-bench.json `full` blocks) as the ONLY input —
// the approved Briefs (`v2`) are NEVER supplied to the model. Records ACTUAL token
// usage + USD cost per release (including retries), and writes:
//   public/brief-generated.json   — generated v2 (+ reused old/full) for the sim
//   <scratch>/brief-gen-report.json — per-release usage/cost/retries + totals
//
// Usage:
//   OPENAI_API_KEY=sk-... node scripts/gen-briefs.mjs            # default model (AI_MODEL or gpt-4o-mini)
//   OPENAI_API_KEY=sk-... node scripts/gen-briefs.mjs --model gpt-4o-mini
//   OPENAI_API_KEY=sk-... node scripts/gen-briefs.mjs --model gpt-4o --out public/brief-generated.gpt4o.json
// NOTHING here touches Supabase, publishing, notifications, or the live app.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateBrief, briefToV2, BRIEF_MODEL } from "../api/_briefGen.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BENCH = path.join(ROOT, "public", "brief-bench.json");

// Minimal .env.local loader (no dependency): lets you keep OPENAI_API_KEY in a
// gitignored .env.local instead of exporting it. Never prints values.
for (const f of [".env.local", ".env"]) {
  try {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

function arg(name, def) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : def; }
const MODEL = arg("--model", BRIEF_MODEL());
const OUT = path.resolve(ROOT, arg("--out", "public/brief-generated.json"));
const REPORT = path.resolve(ROOT, arg("--report", path.join(process.env.SCRATCH || "/tmp", "brief-gen-report.json")));
const MAX_RETRIES = 3;

if (!process.env.OPENAI_API_KEY) {
  console.error("\n✗ OPENAI_API_KEY is not set.\n  Add it to .env.local (never commit it) or export it, then re-run:\n    OPENAI_API_KEY=sk-... node scripts/gen-briefs.mjs --model " + MODEL + "\n");
  process.exit(2);
}

const sourceTextOf = (full) =>
  (full?.blocks || []).filter((b) => b.type !== "image").map((b) => b.text || "").join("\n").trim();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  const bench = JSON.parse(fs.readFileSync(BENCH, "utf8"));
  const dates = bench.dates;
  const outV2 = {};
  const report = { model: MODEL, generatedAt: new Date().toISOString(), perRelease: [], totals: {} };

  for (const d of dates) {
    const sourceText = sourceTextOf(bench.full[d]);
    if (!sourceText) { console.error(`  ! ${d}: no source text — skipping`); continue; }

    let attempt = 0, lastErr = null, result = null;
    const attempts = [];
    while (attempt < MAX_RETRIES && !result) {
      attempt++;
      const t0 = Date.now();
      try {
        const r = await generateBrief({ sourceText, model: MODEL });
        attempts.push({ attempt, ok: true, ms: Date.now() - t0, usage: r.usage, cost: r.cost });
        result = r;
      } catch (e) {
        lastErr = e;
        attempts.push({ attempt, ok: false, ms: Date.now() - t0, error: e.message, status: e.status || null });
        const transient = !e.status || e.status === 429 || e.status >= 500;
        if (!transient || attempt >= MAX_RETRIES) break;
        await sleep(800 * attempt);
      }
    }

    // cost of ALL attempts (successful calls that returned usage; failed calls bill nothing we can see)
    const callCost = attempts.reduce((s, a) => s + (a.cost || 0), 0);
    const callInput = attempts.reduce((s, a) => s + (a.usage?.input_tokens || 0), 0);
    const callOutput = attempts.reduce((s, a) => s + (a.usage?.output_tokens || 0), 0);

    if (!result) {
      console.error(`  ✗ ${d}: failed after ${attempt} attempt(s): ${lastErr?.message}`);
      report.perRelease.push({ date: d, ok: false, attempts, error: lastErr?.message, cost_usd: +callCost.toFixed(6) });
      continue;
    }

    outV2[d] = briefToV2(result.brief, result.brief.category);
    const krCount = (result.brief.keyResults || []).length;
    report.perRelease.push({
      date: d, ok: true, model: MODEL,
      retries: attempt - 1,
      input_tokens: callInput, output_tokens: callOutput,
      cost_usd: +callCost.toFixed(6),
      keyResults: krCount,
      takeaway: result.brief.takeaway ? "present" : "omitted",
      omittedTakeawayReason: result.brief.omittedTakeawayReason || "",
      warnings: result.brief.warnings || [],
      // keep the full generated brief (incl. evidence, basis/timeframe) for the accuracy report
      brief: result.brief,
    });
    console.log(`  ✓ ${d}  [${result.brief.category}]  kr=${krCount}  tk=${result.brief.takeaway ? "y" : "-"}  retries=${attempt - 1}  $${callCost.toFixed(5)}`);
  }

  const ok = report.perRelease.filter((r) => r.ok);
  const total = ok.reduce((s, r) => s + r.cost_usd, 0);
  report.totals = {
    releases: report.perRelease.length,
    succeeded: ok.length,
    total_cost_usd: +total.toFixed(6),
    avg_cost_per_release_usd: ok.length ? +(total / ok.length).toFixed(6) : null,
    max_cost_per_release_usd: ok.length ? +Math.max(...ok.map((r) => r.cost_usd)).toFixed(6) : null,
    within_budget_0_25: ok.length ? ok.every((r) => r.cost_usd <= 0.25) : null,
    total_input_tokens: ok.reduce((s, r) => s + (r.input_tokens || 0), 0),
    total_output_tokens: ok.reduce((s, r) => s + (r.output_tokens || 0), 0),
    total_retries: ok.reduce((s, r) => s + (r.retries || 0), 0),
  };

  // Fixture for the simulator: generated v2 + REUSED old/full (so the reader + Current toggle + Read Full work).
  const fixture = { dates, v2: outV2, old: bench.old, full: bench.full, _meta: { model: MODEL, generatedAt: report.generatedAt, source: "openai", kind: "generated" } };
  fs.writeFileSync(OUT, JSON.stringify(fixture, null, 2));
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));

  console.log("\n── cost (measured) ──");
  console.table(ok.map((r) => ({ date: r.date, retries: r.retries, in: r.input_tokens, out: r.output_tokens, usd: r.cost_usd })));
  console.log(`model=${MODEL}  total=$${report.totals.total_cost_usd}  avg/release=$${report.totals.avg_cost_per_release_usd}  max/release=$${report.totals.max_cost_per_release_usd}  ≤$0.25 each: ${report.totals.within_budget_0_25}`);
  console.log(`\nwrote ${path.relative(ROOT, OUT)} and ${REPORT}`);
}

run().catch((e) => { console.error("runner failed:", e); process.exit(1); });
