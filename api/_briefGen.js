// api/_briefGen.js — BriefV1 generator core (Phase 1A).
//
// Reuses the SAME OpenAI integration PATTERN as the comms/news pipelines
// (REST /v1/chat/completions, forced function-call, gpt-4o-mini default), but with
// DEDICATED, ISOLATED credentials: MINEEX_BRIEF_API_KEY + MINEEX_BRIEF_MODEL. It never
// reads the shared OPENAI_API_KEY / AI_MODEL. usage→cost via _aiUsage (pure, no DB write).
// NO Anthropic dependency. This module is
// import-safe for a plain Node script (no network at import time) and is the
// shared core a later phase can call from an endpoint.
//
// It emits the approved MineEx BriefV1 object (the Phase-0 benchmark design):
//   headline → whatHappened → whyItMatters → keyResults[0..4] → optional takeaway
// NO "Bigger Picture". Grounded (per-claim verbatim evidence), no invention, no
// repetition, no hype; exact numbers/units preserved; current vs historical and
// reported vs calculated-equivalent distinctions captured.

import { costUSD, PRICING, PRICING_VERIFIED } from "./_aiUsage.js";

// DEDICATED env vars — the Brief generator is isolated from every other AI feature.
// It never reads the shared OPENAI_API_KEY or AI_MODEL (both are used by the news/comms/
// extraction pipelines), so Phase 1A can't touch or be touched by production credentials.
export const BRIEF_MODEL = () => process.env.MINEEX_BRIEF_MODEL || "gpt-4o-mini";
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
      category: { type: "string", enum: ["Discovery", "Drilling", "Financing", "Permitting", "Infrastructure", "Acquisition", "Resource Growth", "Exploration", "Corporate"], description: "The single best MineEx category for this release (these are the app's exact taxonomy), inferred from the source only. 'Drilling' ONLY when the release reports actual drill/assay RESULTS (grades/intervals from holes). A geophysical or geochemical survey (3D IP, induced polarization, resistivity, magnetics, soil/surface sampling) that merely IDENTIFIES or PROPOSES drill targets — reporting NO drill assays — is 'Exploration', even if it mentions 'drill targets' or 'holes proposed'. board/management/appointments = 'Corporate'; options/earn-ins/property deals = 'Acquisition'; placements/raises = 'Financing'; resource/reserve updates = 'Resource Growth'." },
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
            value: { type: "string", description: "Left-column display value = THE MEASURED QUANTITY THIS ROW IS ABOUT, exact, with NO trailing unit word baked in unless it is a length/money. For a grade row this is the grade NUMBER only (e.g. '218', '1,028'); for money, the amount (e.g. 'C$13.0M', 'US$325,000'); for a distance, the distance WITH its unit (e.g. '16 km'); for a count, the integer count only (e.g. '9'). NEVER put an interval length (e.g. '5.20 m') or a sample count here when the row is about a grade — the grade goes here, the interval goes in descriptor." },
            unit: { type: "string", description: "Short label shown beneath the value that MATCHES what `value` is. If value is a grade → the grade unit ('g/t AgEq', 'g/t Ag'). If value is a count of samples/holes/targets → 'Samples' / 'Holes' / 'Targets' (NEVER a grade unit like 'g/t'). If value is a distance → 'Distance' (the km/m already sits in value). If value is money → 'Gross' / 'Per Unit' / 'Proceeds' etc. The unit must never contradict the value (e.g. value '5.20 m' with unit 'g/t AgEq' is WRONG; value '9' meaning nine samples with unit 'g/t Ag' is WRONG)." },
            descriptor: { type: "string", description: "Right-column primary line carrying the CONTEXT for the value: for a grade row, the interval and hole (e.g. '6.45 m interval, hole LC-26-020'); for a count row, the threshold (e.g. 'samples > 500 g/t silver'). The interval length belongs HERE, not in value." },
            secondary: { type: "string", description: "Right-column secondary line, or '' if none. Never pad." },
            rel: { type: "string", enum: ["", "INCLUDING"], description: "Describes how THIS row relates to the row ABOVE it — NOT whether this row has its own sub-interval. Set 'INCLUDING' ONLY when THIS row's interval is physically contained within the row immediately above AND is from the SAME drill hole (a higher-grade sub-interval of that parent intercept). The FIRST row is never 'INCLUDING'. A row from a different hole is ''. If this row merely mentions its own included sub-interval, that goes in `secondary` and rel stays ''." },
            basis: { type: "string", enum: ["reported", "calculated"], description: "'calculated' for equivalents/derived values (AgEq, AuEq, totals the issuer computed); 'reported' for directly measured/disclosed values." },
            timeframe: { type: "string", enum: ["current", "historical"], description: "'current' = a NEW result first reported in THIS release; 'historical' = a prior/previously-reported/reference result. Key Results rows should be 'current'. Do NOT include a 'historical' row unless it is genuinely needed as context AND its descriptor/secondary clearly attributes it (e.g. 'previously reported, Jan 19 2026'); a historical row must never sit above or displace a current result." },
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
  "You are the MineEx Brief generator for a junior-mining investor platform. From ONE company press release you produce a single, disciplined investor Brief. The approved MineEx briefs are quality references, not text to copy; a different wording is fine if it is equally accurate, clear, and useful.",
  "",
  "STRUCTURE (in this order): headline → whatHappened → whyItMatters → keyResults (0 or more) → takeaway (optional). Do NOT produce any 'Bigger Picture' / 'Broader Context' section — it does not exist in this format.",
  "",
  "EDITORIAL DISTINCTION — each section serves a DIFFERENT purpose; never repeat content across them:",
  "- headline: the single most important factual outcome, lead measurement preserved exactly.",
  "- whatHappened: the concrete event (who/what/where). Never restate the headline.",
  "- whyItMatters: the investor significance — what this changes about the company/project. Never restate whatHappened. No price/target/valuation talk.",
  "- keyResults: the material quantitative results only (see below).",
  "- takeaway: the forward-looking 'what's next' — NOT a restatement of whyItMatters.",
  "",
  "KEY RESULTS — the release's material results, selected deliberately:",
  "- FIRST identify the release's HEADLINE result — the single most significant quantitative outcome the release is built around (usually the best grade×width intercept, the largest proceeds, the headline resource figure). It MUST be row 0. Never lead with a secondary, neighbouring, or lesser interval while the primary headline result is omitted or buried — that is a serious error.",
  "- THEN capture every OTHER materially important quantitative result, in descending significance, up to a total of FOUR rows. Do not stop at one row if the release genuinely reports several significant results (e.g. multiple strong holes/intervals, a full placement structure, several resource categories) — surface them. Completeness of the material results matters as much as discipline.",
  "- But NEVER pad: 0, 1, 2, 3 or 4 rows are all fine. A row must earn its place as a material result of THIS release. Omit minor, trivial, derived-for-filler, or merely contextual numbers. Prefer leaving a row out over including a weak one.",
  "- PRESERVE RELATIONSHIPS: when a higher-grade interval sits inside a broader headline intercept, put the broader (parent) interval in the row ABOVE and the richer included interval immediately below it with rel='INCLUDING'. Keep the parent and its included interval adjacent and in that order. Do not promote an 'including' sub-interval to a standalone headline — but DO surface it as the INCLUDING row (a material included high-grade hit must never be dropped).",
  "- CURRENT RESULTS ONLY: Key Results are the NEW results first reported in THIS release. Do NOT fill Key Results with previously-reported or historical holes/intervals from earlier releases. A prior result may appear ONLY if it is genuinely needed as context, must be marked timeframe='historical', must be clearly attributed in its descriptor/secondary (e.g. 'previously reported, Jan 19 2026'), and must never sit above or displace a current result. When in doubt, leave historical results out.",
  "- Appointments, board/management changes, and most corporate updates have ZERO material metrics → return an EMPTY keyResults array. Do NOT turn bio facts (years of experience, number of past employers, a founding year, an NSR on an unrelated asset) into Key Results.",
  "- rel='INCLUDING' ONLY when a row is a sub-interval contained within the row immediately above it, FROM THE SAME DRILL HOLE / same parent intercept. A result from a DIFFERENT hole is its own standalone row with rel='' — even if that result itself contains a higher-grade sub-interval, note that sub-interval in its OWN secondary line and do NOT mark the row INCLUDING. Distances/counts/continuity are their own rows with an apt unit (e.g. 'Distance').",
  "",
  "VALUE / UNIT COLUMN CONTRACT (the left column is value+unit; they MUST agree, and the measurement must match its label):",
  "- The left value is the quantity the row is ABOUT; the unit beneath it names that same quantity. They can never describe different things.",
  "- GRADE row → value = the grade number only (e.g. '218', '1,028'); unit = the grade unit (e.g. 'g/t AgEq'); the interval length + hole go in descriptor (e.g. '6.45 m interval, hole LC-26-020'). NEVER put the interval length (e.g. '5.20 m') in value with a grade unit.",
  "- COUNT row (number of samples / holes / targets) → value = the integer count (e.g. '9'); unit = 'Samples' / 'Holes' / 'Targets'; the threshold goes in descriptor (e.g. 'samples > 500 g/t silver'). NEVER label a count with a grade unit like 'g/t Ag'.",
  "- DISTANCE row → value = the distance WITH its unit (e.g. '16 km'); unit = 'Distance'. MONEY row → value = the amount (e.g. 'C$13.0M'); unit = a money label ('Gross', 'Per Unit', 'Proceeds').",
  "- Self-check every row: read 'value + unit' aloud — if it does not state a true, coherent measurement from the source (e.g. '5.20 m g/t AgEq' or '9 g/t Ag' for nine samples), fix which number goes in value and relabel the unit before emitting.",
  "",
  "TAKEAWAY — optional, and DISCIPLINED (omission is the default):",
  "- Include a takeaway ONLY when it carries DISTINCT, source-supported information that no other section already conveys — a specific upcoming milestone, a named pending/awaited result, or a concrete next step the company actually disclosed (with its detail, e.g. 'assays from the remaining six Soledad holes are pending').",
  "- A generic, templated, or vague line is NOT allowed. Reject anything that merely says the company 'plans to advance', 'will continue exploration', 'looks to unlock value', or otherwise restates whyItMatters in softer words. If you could write the sentence without reading this specific release, OMIT it.",
  "- Do NOT force a takeaway to fill the slot. Most releases will have none. When in doubt, return '' with a short, honest omittedTakeawayReason (e.g. 'no distinct next step disclosed').",
  "- Never manufacture significance, speculate, or invent a forward-looking claim.",
  "",
  "NUMBERS:",
  "- Preserve exact grades, intervals, drill-hole IDs, percentages, currencies and dates.",
  "- Format large monetary values cleanly in `value` (e.g. 'C$13.0M', 'US$325K') and put the EXACT original figure in `exactFigure` (e.g. 'C$13,000,000.50'). Never lose precision.",
  "- Keep every number in the SAME UNIT the source uses. Do NOT convert (e.g. if the source says '16 km', write '16 km' — never '16,000 m'). Each figure must stay attached to its own measurement and interval exactly as stated.",
  "- Preserve mineral-resource category words (inferred / indicated / measured / reserve) and the equivalent-grade suffix (AgEq / AuEq) EXACTLY as written — never drop, round or upgrade them (never write an inferred resource as just a 'resource'; never present AgEq/AuEq as Ag/Au).",
  "- A reported drill interval is a DOWN-HOLE length, not a true width, unless the source explicitly states a true width — never describe or imply a reported interval as a true width.",
  "",
  "GROUNDING & EVIDENCE (checked deterministically after you respond — ungrounded output is rejected):",
  "- Restate, never invent. Every number, name, date and claim MUST appear in the source.",
  "- Each keyResults.evidenceQuote and every evidence[].quote MUST be an EXACT, VERBATIM, copy-pasted substring of the source text — not paraphrased, not reconstructed, not re-spaced. If you cannot copy an exact supporting substring, do not emit that row/claim.",
  "",
  "DISTINCTIONS:",
  "- current vs historical (timeframe): a new result from THIS release vs a prior/reference/contextual one. Never present a historical or neighbouring-hole figure as a new result.",
  "- reported vs calculated (basis): 'calculated' for equivalents/derived values (AgEq, AuEq, contained metal, totals); 'reported' for directly measured/disclosed values. Never present a calculated equivalent as a directly measured grade.",
  "",
  "TRANSACTION STATUS — describe property/corporate deals at their ACTUAL legal stage; never imply more ownership or finality than the source states:",
  "- OPTION AGREEMENT: the company has the RIGHT (not obligation) to earn an interest by making staged payments/work over time. Say it 'options', 'acquires an option on', or 'acquires an option to earn up to X%' the project. NEVER 'acquires', 'completes the acquisition of', or 'now owns' the project.",
  "- EARN-IN / JOINT-VENTURE: the company earns an interest by funding exploration/expenditures over time. Say 'can earn up to X%' or 'enters an earn-in on'. It does NOT own that interest yet.",
  "- DEFINITIVE ACQUISITION AGREEMENT (signed, not yet closed): say 'agrees to acquire' / 'signs a definitive agreement to acquire'. Note it is subject to closing/approvals if the source does.",
  "- COMPLETED OWNERSHIP TRANSFER (deal closed, title/interest actually transferred): only THEN may you say 'acquires', 'completes the acquisition of', or 'now owns'.",
  "- Watch the headline especially: 'completes the acquisition of an OPTION to acquire 100%' is an OPTION, not ownership — the headline must say the company optioned (or acquired an option on) the project, not that it acquired the project. Match the exact % and the exact stage in the source.",
  "",
  "REGULATORY SAFETY (this is public disclosure for a regulated issuer):",
  "- NO investment recommendations or advice; NO price, target, or valuation talk.",
  "- NO promotional claims or hype adjectives ('world-class', 'exceptional', 'game-changing', 'strengthens the investment case'); do not use 'high-grade' etc. as praise.",
  "- NO geological interpretation beyond what the source states; do not imply a resource, mine, or economic outcome from exploration/drill results.",
  "- Attribute interpretations to the company EXPLICITLY ('management interprets…', 'the company says…'), never as established fact.",
  "- Phrase unproven or not-yet-achieved outcomes CONDITIONALLY ('could', 'targeting', 'if', 'pending') — never state a potential, planned, targeted or pending result as an accomplished fact.",
  "- No misleading simplifications of technical terms.",
  "",
  "Keep every field tight and non-repetitive.",
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
  const key = apiKey || process.env.MINEEX_BRIEF_API_KEY;
  if (!key) throw new Error("MINEEX_BRIEF_API_KEY is missing");
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
