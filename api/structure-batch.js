// Batched timeline structuring — analyzes MANY press releases in one call.
//
// Onboarding used to call structure-release once per document (~1 call/doc, the
// bulk of the cost). This takes a batch of releases and returns one structured
// timeline entry each, so a 69-release corpus goes from ~69 calls to ~7.
//
// Deliberately SLIM per entry: just the fields the timeline renders (headline,
// date, category, what/why/next, key numbers, stage, impact, key). The heavier
// per-release classification (dimensions, evidence, cross-tab suggestions) that
// full structure-release produces isn't needed for the timeline, and dropping it
// keeps output small enough to stay under the 60s serverless limit at batch size.
//
// Haiku by default — structuring a press release is not a reasoning-heavy task,
// and this runs across a whole corpus, so cost matters.

import { requireFeature, companyIdFromSlug, requireAdmin } from "./_entitlement.js";

const MODEL = process.env.BATCH_MODEL || "claude-haiku-4-5";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const CATEGORIES = [
  "Discovery", "Drilling", "Exploration", "Resource", "Economic Study",
  "Permitting", "Development", "Construction", "Production", "Financing",
  "Acquisition", "Corporate", "Leadership", "Partnership", "Property", "Other",
];
const IMPACTS = ["Transformational", "High", "Moderate", "Low"];

const TOOL = {
  name: "emit_timeline_entries",
  description: "Return one structured timeline entry per supplied press release, in the SAME order.",
  input_schema: {
    type: "object",
    properties: {
      entries: {
        type: "array",
        description: "One entry per release, in the order given. Preserve each release's `id`.",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Copy the release's id EXACTLY so it can be matched back." },
            headline: { type: "string", description: "Concise investor headline, <= 90 chars." },
            sourceDate: { type: "string", description: "The release's OWN date (YYYY-MM-DD). Empty only if genuinely absent." },
            category: { type: "string", enum: CATEGORIES },
            whatHappened: { type: "string", description: "One plain sentence: what was announced." },
            whyItMatters: { type: "string", description: "1-2 sentences on investor relevance, specific to THIS release." },
            whatHappensNext: { type: "string", description: "1-2 sentences on the next concrete catalyst implied." },
            keyNumbers: { type: "array", items: { type: "string" }, description: "2-4 concrete facts/figures from the release. Never invent." },
            stageFrom: { type: "string" },
            stageTo: { type: "string" },
            investorTakeaway: { type: "string", description: "One balanced bottom-line sentence." },
            impact: { type: "string", enum: IMPACTS, description: "How much the underlying event advances the story." },
            key: { type: "boolean", description: "Belongs in the curated 'Key Milestones' view — durable historical importance." },
            projectsMentioned: { type: "array", items: { type: "string" } },
          },
          required: ["id", "headline", "sourceDate", "category", "whatHappened", "whyItMatters", "impact", "key"],
        },
      },
    },
    required: ["entries"],
  },
};

const SYSTEM = [
  "You are a disciplined investor-relations analyst for junior mining companies.",
  "You convert press releases into factual, review-ready timeline entries. A human",
  "confirms before anything publishes — be accurate and conservative, never promotional.",
  "",
  "CORE RULE — never invent. Do not state numbers, dates, grades, dollar amounts or",
  "claims not in the release. If a figure isn't present, leave it out.",
  "",
  "You are given several releases at once, each with an `id`. Return ONE entry per",
  "release, in the SAME order, copying each `id` exactly. Judge impact by how much the",
  "underlying EVENT (not its wording) advances the investment story; `key` is durable",
  "historical importance, judged separately from impact.",
  "",
  "Some inputs may be non-press-release documents (a web page, a report). If an input",
  "isn't a dated announcement, still emit an entry but leave sourceDate empty and keep",
  "it factual — it will be filtered out of the timeline downstream.",
].join("\n");

function bad(res, code, msg) { res.status(code).json({ error: msg }); }
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, 405, "Method not allowed");
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return bad(res, 500, "Server not configured: ANTHROPIC_API_KEY is missing.");

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { return bad(res, 400, "Invalid JSON body"); } }
  const { releases = [], companyId: bodyCompanyId = "", slug = "", context = null } = body || {};
  const list = (Array.isArray(releases) ? releases : []).filter((r) => r && r.id && String(r.text || "").trim());
  if (!list.length) return bad(res, 400, "Provide `releases` [{id, text}].");

  // Same auth as the other extractors: companyId + feature, or admin concierge.
  const token = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || "").trim())?.[1] || "";
  const companyId = bodyCompanyId || (await companyIdFromSlug(slug, token));
  if (!companyId) { const admin = await requireAdmin(req, res); if (!admin) return; }
  else { const auth = await requireFeature(req, res, { companyId, feature: "company_memory" }); if (!auth) return; }

  // Each release's text, capped, tagged with its id.
  const docs = list.slice(0, 15).map((r) => `\n===== RELEASE id=${r.id} =====\n${String(r.text).slice(0, 12000)}`).join("\n");
  const ctx = context ? `\n\nCompany context: ${JSON.stringify(context).slice(0, 1500)}` : "";

  try {
    const r = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8000,
        system: SYSTEM,
        tools: [TOOL],
        tool_choice: { type: "tool", name: TOOL.name },
        messages: [{ role: "user", content: `Analyze these ${list.length} releases and return one timeline entry each, same order, copying each id.${ctx}\n${docs}` }],
      }),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      return bad(res, 502, `AI provider error (${r.status}): ${detail.slice(0, 300)}`);
    }
    const data = await r.json();
    const block = (data.content || []).find((b) => b.type === "tool_use");
    if (!block || !block.input) return bad(res, 502, "AI returned no entries.");
    return res.status(200).json({ entries: block.input.entries || [], meta: { model: MODEL, count: list.length, usage: data.usage } });
  } catch (e) {
    return bad(res, 502, `AI request failed: ${e.message || e}`);
  }
}
