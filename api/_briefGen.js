// api/_briefGen.js — BriefV1 generator core (Phase 1A).
//
// Reuses the SAME OpenAI integration pattern as the comms/news pipelines
// (REST /v1/chat/completions, forced function-call, gpt-4o-mini default via
// AI_MODEL, usage→cost via _aiUsage). NO Anthropic dependency. This module is
// import-safe for a plain Node script (no network at import time) and is the
// shared core a later phase can call from an endpoint.
//
// It emits the approved MineEx BriefV1 object (the Phase-0 benchmark design):
//   headline → whatHappened → whyItMatters → keyResults[0..4] → optional takeaway
// NO "Bigger Picture". Grounded (per-claim verbatim evidence), no invention, no
// repetition, no hype; exact numbers/units preserved; current vs historical and
// reported vs calculated-equivalent distinctions captured.

import { costUSD, PRICING, PRICING_VERIFIED } from "./_aiUsage.js";

export const BRIEF_MODEL = () => process.env.AI_MODEL || "gpt-4o-mini";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

// ---- the forced-function schema (OpenAI function `parameters` = JSON Schema) ----
export const BRIEF_TOOL = {
  name: "emit_brief",
  description:
    "Produce ONE MineEx investor Brief for a junior-mining company press release. " +
    "Grounded restatement only — never invent facts, numbers, dates, or conclusions the source does not contain.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      category: { type: "string", enum: ["Discovery", "Drilling", "Exploration", "Resource", "Economic Study", "Permitting", "Development", "Construction", "Production", "Financing", "Acquisition", "Corporate", "Leadership", "Partnership", "Property", "Other"], description: "The single best category for this release, inferred from the source only." },
      headline: { type: "string", description: "Factual headline, <= 90 chars. Preserve the lead measurement exactly. No hype, no boilerplate." },
      whatHappened: { type: "string", description: "1-2 sentences: the actual event. NEVER restate the headline verbatim." },
      whyItMatters: { type: "string", description: "1-2 sentences: significance for an investor. NEVER restate whatHappened. No promotion, no price/target talk." },
      keyResults: {
        type: "array",
        description:
          "0 to 4 results, most significant first. Each is ONE uniform two-column row. " +
          "OMIT entirely (empty array) for releases with no material metrics (e.g. an appointment). " +
          "Never pad with trivial or derived-for-filler numbers.",
        maxItems: 4,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            value: { type: "string", description: "Left-column display value, exact. Compact long money (e.g. 'C$13.0M'); keep the exact figure in exactFigure." },
            unit: { type: "string", description: "Short unit shown beneath the value (e.g. 'g/t AgEq', 'Distance', 'Gross', 'Interest')." },
            descriptor: { type: "string", description: "Right-column primary line (e.g. '6.45 m interval', 'West of hole LC-25-010')." },
            secondary: { type: "string", description: "Right-column secondary line, or '' if none. Never pad." },
            rel: { type: "string", enum: ["", "INCLUDING"], description: "'INCLUDING' ONLY when this row is an interval contained within the row immediately above (parent intercept). Else ''." },
            basis: { type: "string", enum: ["reported", "calculated"], description: "'calculated' for equivalents/derived values (AgEq, AuEq, totals the issuer computed); 'reported' for directly measured/disclosed values." },
            timeframe: { type: "string", enum: ["current", "historical"], description: "'current' = a new result from THIS release; 'historical' = a prior/reference/contextual result." },
            exactFigure: { type: "string", description: "Verbatim exact figure from the source when `value` is compacted/rounded; else ''." },
            evidenceQuote: { type: "string", description: "Verbatim snippet from the source text that supports this row's number(s)." },
          },
          required: ["value", "unit", "descriptor", "secondary", "rel", "basis", "timeframe", "exactFigure", "evidenceQuote"],
        },
      },
      takeaway: { type: "string", description: "ONE genuine insight that adds value beyond headline/whatHappened/whyItMatters/keyResults. Return '' to OMIT. Omit rather than repeat a fact/number/conclusion already shown, and never invent a forward-looking claim." },
      omittedTakeawayReason: { type: "string", description: "If takeaway is '', one short phrase why (e.g. 'no insight beyond sections'). Else ''." },
      evidence: {
        type: "array",
        description: "Per-claim grounding for headline/whatHappened/whyItMatters/takeaway: a verbatim source quote for each non-trivial factual claim or number.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            field: { type: "string", enum: ["headline", "whatHappened", "whyItMatters", "takeaway"] },
            claim: { type: "string", description: "The claim/number being grounded." },
            quote: { type: "string", description: "VERBATIM snippet from the source supporting it." },
          },
          required: ["field", "claim", "quote"],
        },
      },
      warnings: { type: "array", items: { type: "string" }, description: "Anything uncertain, ambiguous, or not directly supported by the source that a human should check. Empty array if none." },
    },
    required: ["category", "headline", "whatHappened", "whyItMatters", "keyResults", "takeaway", "omittedTakeawayReason", "evidence", "warnings"],
  },
};

export const BRIEF_SYSTEM = [
  "You are the MineEx Brief generator for a junior-mining investor platform. From ONE company press release you produce a single, disciplined investor Brief.",
  "",
  "STRUCTURE (exactly, in this order):",
  "1. headline — factual, lead measurement preserved exactly.",
  "2. whatHappened — the event; never restate the headline.",
  "3. whyItMatters — why it matters to an investor; never restate whatHappened.",
  "4. keyResults — 0 to 4 uniform rows (see schema). Most significant first.",
  "5. takeaway — OPTIONAL single insight; omit when there is none.",
  "Do NOT produce any 'Bigger Picture' / 'Broader Context' section. It does not exist in this format.",
  "",
  "GROUNDING — restate, never invent. Every number, name, date, interval, grade, and currency MUST appear verbatim in the source. Do not add, round away precision, or infer values the source does not state. Provide a verbatim source quote in evidence[] for each factual claim, and an evidenceQuote for each keyResults row. If you cannot ground a number, do not emit it.",
  "",
  "NUMBERS — preserve exact grades, intervals, drill-hole IDs, currencies, percentages and dates. When you compact a long figure into `value` (e.g. 'C$13.0M'), put the exact figure in `exactFigure`.",
  "",
  "DISTINCTIONS (critical for accuracy):",
  "- current vs historical: mark timeframe='current' for a new result from THIS release; 'historical' for prior/reference/contextual results. Never present a historical or neighbouring-hole figure as a new result.",
  "- reported vs calculated: mark basis='calculated' for equivalents and derived values the issuer computed (silver-equivalent AgEq, gold-equivalent AuEq, contained metal, totals); basis='reported' for directly measured/disclosed values (e.g. g/t Ag, metres). Never present a calculated equivalent as a directly measured grade.",
  "- reported fact vs company characterisation: state facts; do not adopt promotional adjectives the issuer uses.",
  "",
  "KEY RESULTS rows: value+unit is the left column; descriptor+secondary the right. Use rel='INCLUDING' ONLY when a row is an interval contained within the row immediately above it (a higher-grade core within a broader intercept) — the relationship is shown by the label, not by size. Distances, counts, continuity and other supporting facts are their own rows with an apt unit (e.g. 'Distance'). Support 0-4 rows without padding: never invent a second result, and never split one result into filler rows.",
  "",
  "TAKEAWAY: one concise, genuinely useful insight that is NOT already stated in another section. If it would repeat a fact, number, or conclusion, or if there is no real insight, return '' and give a short omittedTakeawayReason. Never fabricate a forward-looking or speculative claim.",
  "",
  "NO repetition across sections, NO filler, NO unsupported conclusions, NO hype adjectives ('world-class', 'exceptional', 'game-changing', 'strengthens the investment case'). Keep every field tight.",
].join("\n");

// Build the user message for one release.
export function buildBriefUserMessage({ sourceText, category = "", sourceDate = "", companyName = "" }) {
  const head = [
    companyName ? `Company: ${companyName}` : "",
    category ? `Category (hint only): ${category}` : "",
    sourceDate ? `Release date: ${sourceDate}` : "",
  ].filter(Boolean).join("\n");
  return (
    (head ? head + "\n\n" : "") +
    "Press release (the ONLY source — ground everything in this text):\n\"\"\"\n" +
    String(sourceText || "").slice(0, 24000) +
    "\n\"\"\"\n\nProduce the MineEx Brief by calling emit_brief."
  );
}

// Normalize OpenAI usage → {input_tokens, output_tokens, cache_read_tokens}.
export function normalizeUsage(u = {}) {
  const input = u.prompt_tokens ?? u.input_tokens ?? 0;
  const output = u.completion_tokens ?? u.output_tokens ?? 0;
  const cached = (u.prompt_tokens_details && u.prompt_tokens_details.cached_tokens) || 0;
  return { input_tokens: input, output_tokens: output, cache_read_tokens: cached, total_tokens: u.total_tokens ?? input + output };
}

// One grounded Brief generation call. Returns { brief, usage, cost, model, raw }.
// Throws on HTTP/parse failure so the caller can implement retry + record attempts.
export async function generateBrief({ sourceText, category, sourceDate, companyName, model, apiKey, maxTokens = 2000 }) {
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is missing");
  const useModel = model || BRIEF_MODEL();
  const body = {
    model: useModel,
    max_tokens: maxTokens,
    temperature: 0,
    messages: [
      { role: "system", content: BRIEF_SYSTEM },
      { role: "user", content: buildBriefUserMessage({ sourceText, category, sourceDate, companyName }) },
    ],
    tools: [{ type: "function", function: { name: BRIEF_TOOL.name, description: BRIEF_TOOL.description, parameters: BRIEF_TOOL.input_schema } }],
    tool_choice: { type: "function", function: { name: BRIEF_TOOL.name } },
  };
  const r = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    const err = new Error(`OpenAI ${r.status}: ${detail.slice(0, 300)}`);
    err.status = r.status;
    throw err;
  }
  const data = await r.json();
  const call = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (!call?.function?.arguments) throw new Error("No tool call returned");
  let brief;
  try { brief = JSON.parse(call.function.arguments); }
  catch { throw new Error("Unparseable tool arguments"); }
  const usage = normalizeUsage(data.usage || {});
  const cost = costUSD(usage);
  return { brief, usage, cost, model: useModel, pricing: PRICING, pricingVerified: PRICING_VERIFIED, raw: data };
}

// Map a generated brief → the benchmark fixture's v2 shape (display rows {v,u,desc,sec,rel}).
// Keeps the approved reader UNCHANGED (same fields the gated reader consumes).
export function briefToV2(brief, category) {
  const kr = Array.isArray(brief.keyResults) ? brief.keyResults : [];
  return {
    cat: brief.category || category || "",
    head: brief.headline || "",
    wh: brief.whatHappened || "",
    wy: brief.whyItMatters || "",
    kr: kr.map((r) => ({
      v: r.value, u: r.unit, desc: r.descriptor,
      sec: r.secondary || "", ...(r.rel ? { rel: r.rel } : {}),
    })),
    ...(brief.takeaway ? { tk: brief.takeaway } : {}),
  };
}
