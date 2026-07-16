// Vercel serverless function — generates the content for the shareable
// "audience card" video from a company's extracted press-release corpus.
//
// It returns up to 10 short, punchy, investor-compelling selling points (the
// waterfall face of the card) plus a headline and a one-line hook. Everything is
// grounded in the supplied releases/brief — never invented, never promotional
// fluff — because this goes out publicly on social.
//
// The Anthropic key lives ONLY here (server-side env var). Model via AI_MODEL.

const MODEL = process.env.AI_MODEL || "claude-sonnet-5";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const SCHEMA_VERSION = 1;
const MAX_POINTS = 10;

const TOOL = {
  name: "emit_audience_card",
  description: "Return the content for a shareable investor card about a junior-mining company.",
  input_schema: {
    type: "object",
    properties: {
      headline: { type: "string", description: "Short card headline — the single most compelling framing of this company. <= 60 chars. No hype words." },
      hook: { type: "string", description: "One line under the headline: the opportunity in plain English. <= 100 chars." },
      points: {
        type: "array",
        maxItems: MAX_POINTS,
        description: `Up to ${MAX_POINTS} short, concrete selling points that would compel an investor, ordered STRONGEST FIRST. Each must be a specific disclosed fact (grade, metres, dollars, stage, jurisdiction, funding, catalyst) — never a vague claim. <= 60 chars each so they fit the card.`,
        items: {
          type: "object",
          properties: {
            text: { type: "string", description: "The point itself, <= 60 chars, e.g. '42m of 385 g/t silver in maiden hole'." },
            kind: { type: "string", enum: ["discovery", "grade", "scale", "funding", "catalyst", "jurisdiction", "team", "stage", "ownership", "other"], description: "What kind of selling point this is (drives the card's icon)." },
          },
          required: ["text", "kind"],
        },
      },
      warnings: { type: "array", items: { type: "string" }, description: "Anything the reviewer should check before this goes public." },
    },
    required: ["headline", "hook", "points"],
  },
};

const SYSTEM = [
  "You write short, factual investor-facing card copy for junior mining companies.",
  "This card is published PUBLICLY on social media, so accuracy is non-negotiable and",
  "a human reviews it first.",
  "",
  "CORE RULE — never invent. Every point must trace to a fact in the supplied releases",
  "or brief: a grade, an intercept, a dollar amount, a stage, a jurisdiction, a funding",
  "position, a named catalyst. If you cannot ground it, leave it out. Fewer strong",
  "points beat ten weak ones.",
  "",
  `Return AT MOST ${MAX_POINTS} points, ordered STRONGEST FIRST — the first point should be`,
  "the single most compelling fact about the company. Each point must be <= 60 characters",
  "so it fits on the card: terse, concrete, readable at a glance.",
  "",
  "GOOD: '42m of 385 g/t silver in maiden hole' · 'Fully funded through 2026' ·",
  "'District-scale land package in Chihuahua' · 'Phase 2: 10,000m starting Q3 2026'",
  "BAD: 'World-class asset' · 'Exceptional potential' · 'Strong management' ·",
  "'Compelling opportunity' — these are hype, not facts. Never use them.",
  "",
  "Ignore promotional adjectives in the source material; extract the underlying fact.",
  "If the company is early-stage with little disclosed, return fewer points and say so",
  "in warnings rather than padding.",
].join("\n");

function bad(res, code, msg) { res.status(code).json({ error: msg }); }

export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, 405, "Method not allowed");
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return bad(res, 500, "Server not configured: ANTHROPIC_API_KEY is missing.");

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { return bad(res, 400, "Invalid JSON body"); } }
  const { company = {}, timeline = [], brief = null, projects = [] } = body || {};
  if ((!Array.isArray(timeline) || !timeline.length) && !brief) {
    return bad(res, 400, "Provide the release chronology and/or the company brief.");
  }

  const compact = (Array.isArray(timeline) ? timeline : []).slice(0, 60).map((e) => ({
    date: e.date, headline: e.headline || e.title, category: e.category,
    what: e.whatHappened, why: e.whyItMatters, impact: e.impact, key: e.key,
    numbers: e.keyNumbers, stageTo: e.stageTo, projects: e.projects,
  }));

  const parts = [];
  if (company && (company.name || company.ticker)) parts.push("Company: " + JSON.stringify(company));
  if (brief) parts.push("Company brief:\n```json\n" + JSON.stringify(brief, null, 2) + "\n```");
  if (Array.isArray(projects) && projects.length) parts.push("Projects: " + JSON.stringify(projects));
  if (compact.length) parts.push("Release chronology (newest first):\n```json\n" + JSON.stringify(compact, null, 2) + "\n```");
  parts.push(`Write the card: a headline, a one-line hook, and up to ${MAX_POINTS} grounded selling points, strongest first.`);

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
        messages: [{ role: "user", content: parts.join("\n\n") }],
      }),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      return bad(res, 502, `AI provider error (${r.status}): ${detail.slice(0, 300)}`);
    }
    const data = await r.json();
    const block = Array.isArray(data.content) && data.content.find((b) => b.type === "tool_use");
    if (!block || !block.input) return bad(res, 502, "AI returned no card content.");
    const card = block.input;
    if (Array.isArray(card.points)) card.points = card.points.slice(0, MAX_POINTS);
    card.schemaVersion = SCHEMA_VERSION;
    card.model = MODEL;
    return res.status(200).json({ card });
  } catch (e) {
    return bad(res, 502, `AI request failed: ${e.message || e}`);
  }
}
