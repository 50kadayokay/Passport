// MineIQ intelligence path — REAL OpenAI calls against real prompts.
//
//   node scripts/mineiq-live-test.mjs
//
// This exercises the SHIPPED prompts and the SHIPPED transport. What it does not
// exercise is retrieval, which needs an authenticated session (see the report).
// Context blocks here are fixtures shaped exactly as mineIqContext() emits them,
// so the grounding and refusal behaviour under test is the real thing.
//
// Skips cleanly without OPENAI_API_KEY. Never prints the key.

import fs from "node:fs";
import path from "node:path";
import { ASK_SYSTEM, callModel } from "../api/compose.js";
import { extractFacts } from "../api/_mineiq.js";

for (const f of [".env.import", ".env.vercel.local", ".env.local", ".env"]) {
  const file = path.resolve(process.cwd(), f);
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env) && m[2]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
if (!process.env.OPENAI_API_KEY) { console.log("mineiq-live: skipped (no OPENAI_API_KEY)"); process.exit(0); }

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗ " + m); } };
const show = (s, n = 420) => String(s).replace(/\n{2,}/g, "\n").slice(0, n) + (String(s).length > n ? "…" : "");

// Context shaped exactly as mineIqContext() produces it, with stable source labels.
const CTX_A = {
  available: true,
  sources: [
    "Company profile",
    "Las Coloradas (project record)",
    "Previous release — Kingsmen Commences Phase II Drilling (2026-06-02)",
    "Previous release — Kingsmen Reports Assays from Four Holes (2026-09-22)",
  ],
  blocks: [
    { label: "Company profile", text: "Company: Kingsmen Resources Ltd.\nTicker: KNG\nExchange: TSXV\nHeadquarters: Vancouver, BC" },
    { label: "Las Coloradas (project record)", text: "Project: Las Coloradas\n  location: Parral Mining District, Chihuahua, Mexico\n  commodity: Silver-Gold" },
    { label: "Previous release — Kingsmen Commences Phase II Drilling (2026-06-02)",
      text: "2026-06-02 Kingsmen Commences Phase II Drilling\nThe Company has commenced a 5,000 metre Phase II programme at Las Coloradas. Nineteen holes are planned in the first tranche, testing the #8 structure along strike." },
    { label: "Previous release — Kingsmen Reports Assays from Four Holes (2026-09-22)",
      text: "2026-09-22 Kingsmen Reports Assays from Four Holes\nHole LC-26-020 returned 12.4 g/t Au over 8.5 metres from 141 metres on the #8 structure. Hole LC-26-021 returned 3.7 g/t Au over 6.2 metres. Drilling is currently paused pending receipt of outstanding assays. The Company expects the next batch in November 2026." },
  ],
};

// The handler builds the ask prompt inline, so mirror it exactly here.
const askPrompt = (question, ctx) => [
  "The company is Kingsmen Resources Ltd. Question from the company:",
  '"""', question, '"""',
  "",
  "=== COMPANY RECORD (MineIQ) ===",
  ...ctx.blocks.map((b) => `--- ${b.label} ---\n${b.text}`),
  "=== END COMPANY RECORD ===",
  "",
  "Answer from the company record above. If it does not contain the",
  "answer, say that you could not find it.",
].join("\n");

async function ask(q, ctx = CTX_A) {
  const text = await callModel({ system: ASK_SYSTEM, maxTokens: 1200, task: "ask", user: askPrompt(q, ctx) });
  return text;
}

// ---- 1. grounded answer ---------------------------------------------------
console.log("\n=== 1. latest drill results ===");
{
  const a = await ask("What are our latest drill results?");
  console.log("ANSWER:", show(a));
  ok(/12\.4/.test(a), "quotes the grade 12.4 exactly");
  ok(/8\.5/.test(a), "quotes the width 8.5 exactly");
  ok(/LC-26-020/.test(a), "names the hole");
  ok(!/\b(14\.8|9\.1|15\.2)\b/.test(a), "invents no other grades");
}

// ---- 2. narrative across sources -----------------------------------------
console.log("\n=== 2. how the #8 structure developed ===");
{
  const a = await ask("What have we said about the #8 structure?");
  console.log("ANSWER:", show(a));
  ok(/#8/.test(a), "addresses the #8 structure");
  ok(/strike|along strike|LC-26-020|12\.4/i.test(a), "draws on both releases");
}

// ---- 3. current state, newest wins ---------------------------------------
console.log("\n=== 3. current drilling status (newer supersedes older) ===");
{
  const a = await ask("What is the current status of drilling?");
  console.log("ANSWER:", show(a));
  ok(/paus/i.test(a), "uses the NEWER statement (paused), not the older (commenced)");
  ok(/September|2026-09-22|assay/i.test(a), "says which disclosure it used");
}

// ---- 4. REFUSAL -----------------------------------------------------------
console.log("\n=== 4. refusal — absent from the record ===");
{
  const a = await ask("What is our 2027 drilling budget?");
  console.log("ANSWER:", show(a));
  // Broadened: the first run refused with "does not provide information", which
  // this pattern missed. The guard that actually matters is the next assertion --
  // no figure may appear, however the refusal is worded.
  const refused = /(could not|couldn't|cannot|can't|does not|doesn't|do not|don't)\s+\w*\s*(find|contain|state|include|provide|specify|disclose|have)|no (information|mention|reference|data)|not (stated|provided|specified|disclosed|available)/i.test(a);
  ok(refused, "REFUSES rather than inventing a budget");
  ok(!/\$\s?\d/.test(a), "states no dollar figure of any kind");
}

// ---- 5. conflicting statements -------------------------------------------
console.log("\n=== 5. older vs newer, both surfaced ===");
{
  const ctx = JSON.parse(JSON.stringify(CTX_A));
  // A GENUINE same-measure change. The first fixture compared "nineteen holes
  // PLANNED" with "27 COMPLETED" -- two different measurements, so a model that
  // declined to present them as a change was right. This states a completed
  // count in both releases, which is what the rule is actually about.
  ctx.blocks.push({ label: "Previous release — Kingsmen Provides Drilling Update (2026-08-10)",
    text: "2026-08-10 Kingsmen Provides Drilling Update\nNineteen holes have been completed to date in the Phase II programme." });
  ctx.blocks.push({ label: "Previous release — Kingsmen Expands Programme (2026-10-01)",
    text: "2026-10-01 Kingsmen Expands Programme\nThe programme has been expanded and 27 holes have now been completed. Drilling has resumed." });
  const a = await ask("How many holes have been drilled, and is drilling active?", ctx);
  console.log("ANSWER:", show(a, 520));
  ok(/27/.test(a), "uses the newer hole count");
  ok(/19|nineteen/i.test(a), "names the EARLIER value (19) as well as the current one");
  ok(/august|2026-08-10|earlier|previous/i.test(a), "dates or attributes the earlier value");
  ok(/resum/i.test(a), "reflects the newer drilling status");
}

// ---- 6. structured fact extraction ---------------------------------------
console.log("\n=== 6. structured extraction (forced schema) ===");
{
  const facts = await extractFacts({
    companyName: "Kingsmen Resources Ltd.",
    title: "Kingsmen Reports Assays from Four Holes",
    body: CTX_A.blocks[3].text,
  });
  console.log(`EXTRACTED ${facts.length} facts:`);
  facts.slice(0, 6).forEach((f) => console.log(`  [${f.kind}] ${f.subject} — ${JSON.stringify(f.data)}`));
  ok(facts.length > 0, "returns facts");
  ok(facts.every((f) => f.quote && f.quote.trim()), "EVERY fact carries a verbatim quote");
  ok(facts.every((f) => f.subject && f.subject.trim()), "every fact names a subject");
  const drill = facts.find((f) => f.kind === "drill_result");
  ok(!!drill, "recognises a drill result");
  const blob = JSON.stringify(facts);
  ok(/12\.4/.test(blob), "preserves the grade exactly");
  ok(!/\b(14\.8|9\.9)\b/.test(blob), "invents no figures");
  // Quotes must actually appear in the source.
  const src = CTX_A.blocks[3].text;
  const unquoted = facts.filter((f) => !src.includes(String(f.quote).trim().replace(/^["']|["']$/g, "")));
  ok(unquoted.length === 0, `every quote appears verbatim in the source (${unquoted.length} did not)`);
}

console.log(`\nmineiq-live: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
