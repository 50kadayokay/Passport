// Vercel serverless function — Layer 2 of the AI onboarding extractor.
//
// structure-release.js analyzes ONE press release. This takes the assembled
// chronology of a company's releases (newest first) and synthesizes the
// investor-facing OVERVIEW: the Company Status card + a concise Company Brief.
// Everything is grounded in the supplied releases — never invented — and returned
// as SUGGESTIONS the company confirms before publishing.
//
// The Anthropic key lives ONLY here (server-side env var). Model via AI_MODEL.

const MODEL = process.env.AI_MODEL || "claude-sonnet-5";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const SCHEMA_VERSION = 1;

const TOOL = {
  name: "emit_profile_overview",
  description: "Return the synthesized Company Status card and Company Brief for a junior-mining company.",
  input_schema: {
    type: "object",
    properties: {
      companyStatus: {
        type: "object",
        description: "The current, investor-facing status card. Reflects the MOST RECENT operational state across all releases.",
        properties: {
          statusHeadline: { type: "string", description: "Short punchy label for what the company is doing right now, e.g. '26-Hole Drill Campaign'. <= 40 chars." },
          statusHeadlineSubtext: { type: "string", description: "One sentence expanding the headline with the current program/asset." },
          latestUpdate: { type: "string", description: "The single most recent material development, one sentence." },
          investmentImpact: { type: "string", description: "One sentence on why the latest update matters to investors." },
          nextCatalyst: { type: "string", description: "Short label for the next expected value-driving event, e.g. 'Phase 1 Assays'." },
          expected: { type: "string", description: "When the next catalyst is expected, e.g. 'H2 2026' or 'Q3 2026'. Empty if unknown." },
        },
        required: ["statusHeadline", "statusHeadlineSubtext", "latestUpdate", "investmentImpact", "nextCatalyst", "expected"],
      },
      companyBrief: {
        type: "object",
        description: "A concise, factual investor brief describing the company.",
        properties: {
          shortSummary: { type: "string", description: "2-3 sentence plain-English summary of the opportunity: commodity, jurisdiction, stage, and what makes it interesting. Factual, not promotional." },
          keyPoints: { type: "array", items: { type: "string" }, description: "3-5 short, concrete value drivers grounded in the releases (each <= 10 words), e.g. 'Active 26-hole drill campaign underway'." },
        },
        required: ["shortSummary", "keyPoints"],
      },
      warnings: { type: "array", items: { type: "string" }, description: "e.g. 'limited releases provided', 'jurisdiction inferred', anything the reviewer should double-check." },
    },
    required: ["companyStatus", "companyBrief"],
  },
};

const SYSTEM = [
  "You are a disciplined investor-relations analyst for junior mining companies.",
  "You are given a company's press-release chronology (newest first), already",
  "structured. Synthesize the current investor-facing OVERVIEW: a Company Status",
  "card and a concise Company Brief. A human confirms your output before it",
  "publishes, so be accurate and conservative, never promotional.",
  "",
  "CORE RULE — never invent. Use only facts present in the supplied releases (and any",
  "company context). If commodity, jurisdiction, or stage isn't stated, infer only",
  "what's strongly implied and note it in warnings; otherwise leave it general.",
  "",
  "STATUS CARD reflects the CURRENT state:",
  "- statusHeadline/subtext: what the company is doing right now (its active program",
  "  or the stage of its flagship asset), drawn from the most recent operational news.",
  "- latestUpdate: the single most recent material development.",
  "- investmentImpact: why that latest update matters, in one balanced sentence.",
  "- nextCatalyst/expected: the next value-driving event the releases point to, and",
  "  its expected timing if stated (else leave expected empty).",
  "",
  "BRIEF is a short, factual description of the whole company — commodity, jurisdiction,",
  "stage, flagship asset(s), and the 3-5 concrete value drivers that make it investable.",
  "Ignore promotional adjectives; keep every key point grounded in a real disclosed fact.",
].join("\n");

function bad(res, code, msg) { res.status(code).json({ error: msg }); }

export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, 405, "Method not allowed");
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return bad(res, 500, "Server not configured: ANTHROPIC_API_KEY is missing.");

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { return bad(res, 400, "Invalid JSON body"); } }
  const { company = {}, timeline = [], projects = [] } = body || {};
  if (!Array.isArray(timeline) || !timeline.length) return bad(res, 400, "Provide the release chronology (timeline).");

  // Compact each entry to keep the synthesis prompt lean.
  const compact = timeline.slice(0, 60).map((e) => ({
    date: e.date, headline: e.headline || e.title, category: e.category,
    what: e.whatHappened, why: e.whyItMatters, next: e.whatHappensNext,
    impact: e.impact, key: e.key, numbers: e.keyNumbers,
    stageFrom: e.stageFrom, stageTo: e.stageTo, projects: e.projects,
  }));

  const parts = [];
  if (company && (company.name || company.ticker)) parts.push("Company: " + JSON.stringify(company));
  if (Array.isArray(projects) && projects.length) parts.push("Known projects: " + JSON.stringify(projects));
  parts.push("Release chronology (newest first):\n```json\n" + JSON.stringify(compact, null, 2) + "\n```");
  parts.push("Synthesize the Company Status card and Company Brief. Return only facts grounded in these releases.");
  const userContent = parts.join("\n\n");

  try {
    const r = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: SYSTEM,
        tools: [TOOL],
        tool_choice: { type: "tool", name: TOOL.name },
        messages: [{ role: "user", content: userContent }],
      }),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      return bad(res, 502, `AI provider error (${r.status}): ${detail.slice(0, 300)}`);
    }
    const data = await r.json();
    const block = Array.isArray(data.content) && data.content.find((b) => b.type === "tool_use");
    if (!block || !block.input) return bad(res, 502, "AI returned no overview.");
    const overview = block.input;
    overview.schemaVersion = SCHEMA_VERSION;
    overview.model = MODEL;
    return res.status(200).json({ overview });
  } catch (e) {
    return bad(res, 502, `AI request failed: ${e.message || e}`);
  }
}
