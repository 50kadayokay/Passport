// Draft Press Release — behavioural tests against the REAL model.
//
//   node scripts/compose-test.mjs
//
// WHY THIS EXISTS
// ---------------
// Every other check in this repo is deterministic. This one cannot be: the thing
// that can go wrong here is the model inventing a grade, a quote or a Qualified
// Person, and that failure looks exactly like success in a unit test of the
// prompt string. So this calls Anthropic with the SHIPPED prompts (imported from
// api/compose.js, never retyped) and asserts on what actually comes back.
//
// Skips cleanly with exit 0 when ANTHROPIC_API_KEY is absent, so it never breaks
// a CI run that has no key.

import fs from "node:fs";
import path from "node:path";
import { buildUserMessage, SYSTEM, FACT_TOOL, callClaude } from "../api/compose.js";

for (const f of [".env.vercel.local", ".env.local", ".env"]) {
  const file = path.resolve(process.cwd(), f);
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env) && m[2]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const KEY = process.env.ANTHROPIC_API_KEY;
// A real key is ~100 chars and starts sk-ant-. Anything shorter is a stub left
// in an env file, and calling the API with it just returns 401 -- which should
// read as "not run here", not as a failing test.
if (!KEY || KEY.length < 40) {
  console.log("compose: skipped (no usable ANTHROPIC_API_KEY — set one to run the model checks)");
  process.exit(0);
}

// A dead or wrong key is an environment problem, not a product failure.
async function guard(fn) {
  try { return await fn(); }
  catch (e) {
    if (/401|authentication_error|invalid x-api-key/i.test(String(e && e.message))) {
      console.log("compose: skipped (ANTHROPIC_API_KEY was rejected by the API)");
      process.exit(0);
    }
    throw e;
  }
}

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error("  ✗ " + m); } };

// ---- fixtures -------------------------------------------------------------
// Deliberately partial: a real closing date, a real grade, and NO quote, NO
// Qualified Person and NO forward-looking wording. Anything the model adds in
// those slots is fabrication.
const DETAILS = `We got assays back from the first four holes at Las Coloradas.
Best hole was LC-26-020: 12.4 g/t Au over 8.5 metres from 141 m.
Drilling started in August. Program is 5,000 m.`;

const ASSAY_DOC = {
  name: "assay-results.pdf",
  text: `LAS COLORADAS — ASSAY SUMMARY
Hole LC-26-018: 2.1 g/t Au over 4.0 m from 96 m
Hole LC-26-019: no significant values
Hole LC-26-020: 12.4 g/t Au over 8.5 m from 141 m
Hole LC-26-021: 3.7 g/t Au over 6.2 m from 118 m
Program: 5,000 m. Assays by SGS Durango.`,
};

const CTX = {
  available: true,
  sources: ["Company profile", "Las Coloradas (project record)"],
  blocks: [
    { label: "Company profile", text: "Company: Kingsmen Resources Ltd.\nTicker: KNG\nExchange: TSXV\nHeadquarters: Vancouver, BC" },
    { label: "Las Coloradas (project record)", text: "Project: Las Coloradas\n  location: Parral Mining District, Chihuahua, Mexico\n  commodity: Silver-Gold" },
  ],
};

const say = (t) => { console.log("\n" + t); };

// ---- 1. DRAFT -------------------------------------------------------------
say("=== A. draft is source-faithful ===");
const draft = await guard(() => callClaude(KEY, {
  system: SYSTEM, maxTokens: 3000,
  user: buildUserMessage("draft", {
    who: "The company is Kingsmen Resources Ltd. ",
    details: DETAILS, attachments: [ASSAY_DOC], ctx: CTX,
  }),
}));

ok(draft.includes("12.4"), "keeps the grade 12.4 exactly");
ok(draft.includes("8.5"), "keeps the width 8.5 exactly");
ok(/LC-26-020/.test(draft), "keeps drill-hole ID LC-26-020");
ok(/Las Coloradas/.test(draft), "uses the project name from the company record");

// The fabrication checks. A quote needs quotation marks around attributed
// speech; none was supplied, so any is invented.
const quoted = /["“][^"”]{40,}["”]/.test(draft) && /(said|stated|commented)/i.test(draft);
ok(!quoted, "invents NO executive quote (none was supplied)");

// A named QP with credentials that never appeared in any source.
const inventedQP = /\b(P\.\s?Geo|P\.\s?Eng)\b/.test(draft) && !/\[/.test(draft.slice(Math.max(0, draft.search(/P\.\s?Geo|P\.\s?Eng/)) - 60));
ok(!inventedQP, "invents NO named Qualified Person");

ok(/\[/.test(draft), "uses [bracketed placeholders] for what was not supplied");

// Grades that appear nowhere in the sources.
const grades = [...draft.matchAll(/(\d+\.?\d*)\s*g\/t/g)].map((m) => m[1]);
const known = ["12.4", "2.1", "3.7"];
const madeUp = grades.filter((g) => !known.includes(g));
ok(madeUp.length === 0, `invents no grades (found unsupported: ${madeUp.join(", ") || "none"})`);

// ---- 2. TARGETED REVISION -------------------------------------------------
say("=== B. a targeted instruction changes only its target ===");
const revised = await guard(() => callClaude(KEY, {
  system: SYSTEM, maxTokens: 3000,
  user: buildUserMessage("revise", {
    who: "The company is Kingsmen Resources Ltd. ",
    current: draft, instruction: "Make the headline shorter.",
    attachments: [ASSAY_DOC], ctx: CTX,
  }),
}));

const bodyOf = (t) => t.split("\n").slice(1).join("\n").trim();
const headOf = (t) => (t.split("\n").find((l) => l.trim()) || "").trim();

ok(headOf(revised) !== headOf(draft), "the headline changed");
ok(headOf(revised).length < headOf(draft).length, "the headline got shorter");

// The body should be essentially untouched. Compared by line, allowing a little
// drift, because the whole point of the rule is that hand edits survive.
const a = bodyOf(draft).split("\n").filter((l) => l.trim());
const b = bodyOf(revised).split("\n").filter((l) => l.trim());
const kept = a.filter((l) => b.includes(l)).length;
const ratio = a.length ? kept / a.length : 0;
ok(ratio >= 0.8, `body preserved (${Math.round(ratio * 100)}% of lines identical, want >=80%)`);
ok(revised.includes("12.4") && revised.includes("LC-26-020"), "facts survive the revision");

// ---- 3. CHECK FACTS -------------------------------------------------------
say("=== C. check facts catches what is not supported ===");
// Three deliberate problems planted in a draft: a grade that contradicts the
// assay table, a claim of significance nobody made, and a share count from
// nowhere.
const DIRTY = `Kingsmen Intersects 14.8 g/t Au Over 8.5 Metres at Las Coloradas

Vancouver, BC – [Date] — Kingsmen Resources Ltd. (TSXV: KNG) today reported that
hole LC-26-020 returned 14.8 g/t Au over 8.5 metres from 141 metres, the largest
intercept in the company's history. The Company has 48.9 million shares outstanding.`;

const { findings } = await guard(() => callClaude(KEY, {
  system: SYSTEM, maxTokens: 3000, tool: FACT_TOOL,
  user: buildUserMessage("check_facts", {
    who: "The company is Kingsmen Resources Ltd. ",
    current: DIRTY, attachments: [ASSAY_DOC], ctx: CTX,
  }),
}));

const all = JSON.stringify(findings).toLowerCase();
ok(Array.isArray(findings) && findings.length > 0, `returns findings (${findings.length})`);
ok(findings.some((f) => f.status !== "supported" && /14\.8/.test(JSON.stringify(f))),
   "flags 14.8 g/t (assay table says 12.4)");
ok(findings.some((f) => f.status === "unverified" && /largest/i.test(JSON.stringify(f))),
   "flags 'largest intercept' as unverified");
ok(findings.some((f) => f.status !== "supported" && /48\.9|shares/i.test(JSON.stringify(f))),
   "flags the unsupported share count");
ok(findings.some((f) => f.status === "supported" && /LC-26-020|las coloradas/i.test(JSON.stringify(f))),
   "confirms what IS supported");
ok(!all.includes("rewritten") && !all.includes("corrected to"), "reports only; does not rewrite");

console.log(`\ncompose: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
