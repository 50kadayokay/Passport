// Conference Extraction Runner — Phase 1 (local CLI).
// Automates the manual three-pass workflow: read a draft company's already-ingested documents,
// group them by the existing classifier, run the existing bundle prompts through a pluggable LLM
// provider, validate + retry, merge with the existing null-safe applyImport, and write results.
//
//   node tools/conference-runner/run.mjs --slug <draft-slug> [options]
//   Options:
//     --write                 PATCH the draft profile in Supabase (default: dry-run to ./imports)
//     --only technical,story  run a subset of bundles
//     --provider mock|anthropic|openai   (default from CONF_PROVIDER, else mock)
//     --model <id>            model id for the provider
//     --retries N             retries per failed/invalid pass (default 1)
//     --max-chars N           per-bundle document char budget (default 400000)
//     --allow-published       allow running on a published record (normally blocked)
//
// Reuses (unchanged): promptTemplate bundle prompts + shapes, profileImport.applyImport,
// profileToPP.mapProfileToPP, documentStore.buildTextBundle, classify kinds. Nothing in the app
// is modified. Designed so run() logic can later be lifted into a Supabase Edge Function.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG, costOf } from "./config.mjs";
import { getCompany, getDocuments, writeProfile } from "./supa.mjs";
import { groupDocs } from "./group.mjs";
import { extractJson, validateShape } from "./validate.mjs";
import { complete } from "./providers/index.mjs";
import { CONFERENCE_BUNDLES, conferenceBundlePrompt, conferenceBundleShape } from "../../src/admin/promptTemplate.js";
import { applyImport } from "../../src/lib/profileImport.js";
import { mapProfileToPP } from "../../src/lib/profileToPP.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function parseArgs(argv) {
  const a = { write: false, retries: 1, only: null, provider: CONFIG.provider, model: CONFIG.model, maxChars: 400000, allowPublished: false };
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--write") a.write = true;
    else if (t === "--allow-published") a.allowPublished = true;
    else if (t === "--slug") a.slug = argv[++i];
    else if (t === "--only") a.only = argv[++i].split(",").map((s) => s.trim());
    else if (t === "--retries") a.retries = Math.max(0, +argv[++i] || 0);
    else if (t === "--provider") a.provider = argv[++i];
    else if (t === "--model") a.model = argv[++i];
    else if (t === "--max-chars") a.maxChars = +argv[++i] || a.maxChars;
  }
  return a;
}

// Remove reviewer-locked paths (conference._locked: ["conference.hook", ...]) from a payload so a
// pass can never overwrite an approved field. applyImport is already null-safe on top of this.
function stripLocked(payload, lockedPaths) {
  if (!Array.isArray(lockedPaths) || !lockedPaths.length) return payload;
  const clone = JSON.parse(JSON.stringify(payload));
  for (const p of lockedPaths) {
    const keys = String(p).split(".");
    let o = clone;
    for (let i = 0; i < keys.length - 1 && o; i++) o = o[keys[i]];
    if (o && typeof o === "object") delete o[keys[keys.length - 1]];
  }
  return clone;
}

const money = (n) => `$${n.toFixed(4)}`;

async function main() {
  const args = parseArgs(process.argv);
  if (!args.slug) { console.error("Usage: node tools/conference-runner/run.mjs --slug <draft-slug> [--write] [--only technical,capital,story] [--provider mock|anthropic|openai] [--model <id>] [--retries N]"); process.exit(1); }
  if (!CONFIG.supabaseUrl || !CONFIG.serviceKey) { console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_KEY — see tools/conference-runner/.env.example"); process.exit(1); }

  console.log(`\n▶ Conference extraction — ${args.slug}  (provider=${args.provider}${args.model ? `/${args.model}` : ""}, ${args.write ? "WRITE" : "dry-run"})`);

  const company = await getCompany(args.slug);
  if (!company) { console.error(`No company with slug "${args.slug}".`); process.exit(1); }
  if (company.slug === "kingsmen-resources") { console.error("Refusing to run on the protected flagship."); process.exit(1); }
  if (company.status === "published" && !args.allowPublished) { console.error(`"${args.slug}" is PUBLISHED — run on a draft, or pass --allow-published.`); process.exit(1); }

  const docs = await getDocuments(company.id);
  const { bundles, truncations } = groupDocs(docs, { maxCharsPerBundle: args.maxChars });
  console.log(`  documents: ${docs.length}  ·  groups: ` + Object.entries(bundles).map(([k, v]) => `${k}=${v.docs.length}`).join(" "));
  if (truncations.length) console.log(`  ⚠ dropped ${truncations.length} low-authority doc(s) over the char budget`);

  const locked = (company.profile && company.profile.conference && company.profile.conference._locked) || [];
  const bundleList = CONFERENCE_BUNDLES.filter((b) => !args.only || args.only.includes(b.id));
  const outDir = path.join(REPO, "imports", args.slug);
  fs.mkdirSync(outDir, { recursive: true });

  const report = { slug: args.slug, at: new Date().toISOString(), provider: args.provider, model: args.model || null, write: args.write, truncations, passes: [], totals: { inputTokens: 0, outputTokens: 0, costUsd: 0 } };
  const payloads = [];

  for (const b of bundleList) {
    const grp = bundles[b.id] || { text: "", chars: 0, used: [] };
    const shape = conferenceBundleShape(b.id);
    const pass = { bundle: b.id, label: b.label, docsUsed: grp.used, chars: grp.chars, ok: false, attempts: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, filled: 0, missingTop: [], error: null };

    if (!grp.text) { pass.error = "no documents classified into this group"; report.passes.push(pass); console.log(`  ⃠ ${b.label}: skipped (no docs)`); continue; }

    const system = "You are a precise mining-disclosure extraction engine. Read the documents and output ONLY one JSON object of the exact requested shape. No prose, no markdown.";
    const prompt = `${conferenceBundlePrompt(b.id)}\n\n=== COMPANY DOCUMENTS ===\n${grp.text}\n`;

    for (let attempt = 1; attempt <= args.retries + 1; attempt++) {
      pass.attempts = attempt;
      try {
        const r = await complete({ system, prompt, model: args.model }, args.provider);
        pass.inputTokens += r.usage.inputTokens; pass.outputTokens += r.usage.outputTokens;
        pass.costUsd += costOf(r.model || args.model, r.usage);
        const payload = extractJson(r.text);
        const v = validateShape(payload, shape);
        pass.filled = v.filled; pass.missingTop = v.missingTop;
        if (!v.usable) throw new Error(`parsed but empty (filled=0)`);
        payloads.push({ bundle: b.id, payload });
        fs.writeFileSync(path.join(outDir, `${b.id}.json`), JSON.stringify(payload, null, 2));
        pass.ok = true;
        console.log(`  ✓ ${b.label}: ${v.filled} fields  ·  ${pass.inputTokens}+${pass.outputTokens} tok  ·  ${money(pass.costUsd)}${v.missingTop.length ? `  · missing: ${v.missingTop.join(", ")}` : ""}`);
        break;
      } catch (e) {
        pass.error = e.message;
        if (attempt <= args.retries) { console.log(`  … ${b.label}: attempt ${attempt} failed (${e.message}) — retrying`); continue; }
        console.log(`  ✗ ${b.label}: failed after ${attempt} attempt(s) — ${e.message}`);
      }
    }
    report.totals.inputTokens += pass.inputTokens; report.totals.outputTokens += pass.outputTokens; report.totals.costUsd += pass.costUsd;
    report.passes.push(pass);
  }

  // Merge every successful pass onto the draft profile — null-safe, and never touching locked paths.
  let profile = company.profile || {};
  const mergeWarnings = [];
  for (const { bundle, payload } of payloads) {
    const safe = stripLocked(payload, locked);
    const { next, report: r } = applyImport(profile, safe, "", "");
    profile = next;
    (r.warnings || []).forEach((w) => mergeWarnings.push(`[${bundle}] ${w}`));
  }
  try { profile = { ...profile, pp: mapProfileToPP(profile) }; } catch (e) { mergeWarnings.push(`pp regen failed: ${e.message}`); }
  report.conflicts = mergeWarnings;

  fs.writeFileSync(path.join(outDir, "merged-profile.json"), JSON.stringify(profile, null, 2));
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));

  const okCount = report.passes.filter((p) => p.ok).length;
  console.log(`\n  merged ${okCount}/${report.passes.length} passes  ·  total ${report.totals.inputTokens}+${report.totals.outputTokens} tok  ·  ${money(report.totals.costUsd)}`);
  if (mergeWarnings.length) { console.log(`  ⚠ ${mergeWarnings.length} conflict(s)/note(s) to review:`); mergeWarnings.slice(0, 8).forEach((w) => console.log(`     • ${w}`)); }
  console.log(`  output: imports/${args.slug}/ (bundle JSONs, merged-profile.json, report.json)`);

  if (args.write) {
    if (company.status === "published" && !args.allowPublished) { console.error("Refusing to WRITE to a published record."); process.exit(1); }
    await writeProfile(args.slug, profile);
    console.log(`  ✓ wrote merged profile to draft "${args.slug}". Open the Conference Blueprint to review + preview.`);
  } else {
    console.log(`  (dry-run — re-run with --write to PATCH the draft, or Load imports/${args.slug}/*.json in the Blueprint.)`);
  }
  console.log(`  note: Milestones is not in this run — it reads the existing timeline. Run that small pass in the Blueprint.\n`);
}

main().catch((e) => { console.error("\n✗ Runner failed:", e.message); process.exit(1); });
