// Vercel serverless function — analyzes a junior-mining press release with Claude
// and returns a structured, review-ready analysis. The Anthropic API key lives
// ONLY here (server-side env var); it is never shipped to the browser.
//
// It separates THREE judgments (category / impact tier / key milestone), proposes
// each with evidence + confidence, and returns proposed changes to other profile
// areas as SUGGESTIONS ONLY — the company confirms/edits before anything applies.
//
// Modes:
//   extract — { text, context? }                 → full analysis from raw PR text
//   refine  — { current, instruction, text?, context? } → revised analysis
//
// Set ANTHROPIC_API_KEY in Vercel (Project → Settings → Environment Variables)
// and in .env for local `vercel dev`. Model overridable via AI_MODEL.

const MODEL = process.env.AI_MODEL || "claude-sonnet-5";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const SCHEMA_VERSION = 1;

// Category = WHAT TYPE of event (separate from impact + milestone).
const CATEGORIES = [
  "Discovery", "Drilling", "Exploration", "Resource", "Economic Study",
  "Permitting", "Development", "Construction", "Production", "Financing",
  "Acquisition", "Corporate", "Leadership", "Partnership", "Property", "Other",
];
const IMPACTS = ["Transformational", "High", "Moderate", "Low"];
const CONFIDENCE = ["high", "medium", "low"];
const MILESTONE_ACTIONS = ["new_milestone", "update_existing", "supersede_existing", "timeline_only"];

// Internal 0–3 assessment dimensions (consistency aid; not shown as a raw total).
const DIMENSIONS = [
  "projectScale", "geologicalConfidence", "economicConfidence", "financingCertainty",
  "assetBase", "developmentStage", "permittingReadiness", "productionCapacity",
  "materialRisk", "expectedTimeline", "strategicImportance", "durability", "novelty",
];
const dimProps = () => DIMENSIONS.reduce((o, k) => {
  o[k] = { type: "integer", minimum: 0, maximum: 3, description: "0 none · 1 incremental · 2 material · 3 thesis-defining. Omit if not applicable." };
  return o;
}, {});

// Forced-tool schema → guaranteed typed output. Three concepts kept separate.
const TOOL = {
  name: "emit_release_analysis",
  description: "Return the structured, review-ready analysis of a junior-mining press release.",
  input_schema: {
    type: "object",
    properties: {
      card: {
        type: "object",
        description: "Investor-facing card content. Factual; no promotional language.",
        properties: {
          headline: { type: "string", description: "Concise investor headline, <= 90 chars. Not the company's full legal title line." },
          sourceDate: { type: "string", description: "The release's OWN date (from its dateline), as YYYY-MM-DD. Empty string only if genuinely absent." },
          category: { type: "string", enum: CATEGORIES, description: "Single best-fit event type." },
          whatHappened: { type: "string", description: "One plain-English sentence: what the company announced." },
          whyItMatters: { type: "string", description: "1-2 sentences on investor relevance, specific to THIS release." },
          whatHappensNext: { type: "string", description: "1-2 sentences on the next concrete catalyst/step implied by the release." },
          keyNumbers: { type: "array", items: { type: "string" }, description: "2-4 short concrete facts/figures from the release. Never invent numbers." },
          stageFrom: { type: "string", description: "Short project-stage label before this news, e.g. 'Target Gen'." },
          stageTo: { type: "string", description: "Short project-stage label the news advances toward, e.g. 'Discovery'." },
          investorTakeaway: { type: "string", description: "One balanced bottom-line sentence for a retail investor." },
          projectsMentioned: { type: "array", items: { type: "string" }, description: "Specific project/property names referenced." },
          sourceUrl: { type: "string", description: "Canonical release URL if present in the text, else empty." },
        },
        required: ["headline", "sourceDate", "category", "whatHappened", "whyItMatters", "whatHappensNext", "keyNumbers", "stageFrom", "stageTo", "investorTakeaway"],
      },
      classification: {
        type: "object",
        description: "The three SEPARATE judgments + the evidence behind them. These are SUGGESTIONS the company confirms.",
        properties: {
          suggestedImpact: { type: "string", enum: IMPACTS, description: "How much the underlying EVENT (not its wording) changes the investment story." },
          suggestedKey: { type: "boolean", description: "Whether this belongs in the curated 'Key Milestones' view — judged separately from impact." },
          impactReason: { type: "string", description: "Why this impact tier, grounded in the event's substance." },
          milestoneReason: { type: "string", description: "Why key=true/false, per durable-historical-importance test." },
          confidence: { type: "string", enum: CONFIDENCE, description: "Confidence in the classification given available context." },
          dimensions: { type: "object", description: "Internal 0-3 scores for applicable dimensions only.", properties: dimProps() },
          evidence: { type: "array", items: { type: "object", properties: { claim: { type: "string" }, quote: { type: "string", description: "Short supporting phrase from the release." } }, required: ["claim"] }, description: "Factual grounding pulled from the release." },
          warnings: { type: "array", items: { type: "string" }, description: "e.g. 'insufficient context', 'confirms prior disclosure', 'promotional language ignored'." },
        },
        required: ["suggestedImpact", "suggestedKey", "impactReason", "milestoneReason", "confidence"],
      },
      milestoneRecommendation: {
        type: "object",
        description: "How this release relates to EXISTING milestones (from context.existingMilestones).",
        properties: {
          action: { type: "string", enum: MILESTONE_ACTIONS, description: "new_milestone · update_existing · supersede_existing · timeline_only." },
          relatedId: { type: "string", description: "Id of the existing milestone this updates/supersedes, else empty." },
          reason: { type: "string" },
        },
        required: ["action", "reason"],
      },
      proposedChanges: {
        type: "array",
        description: "SUGGESTED updates to OTHER profile areas implied by this release. Never applied automatically; the company approves each. Empty array if none.",
        items: {
          type: "object",
          properties: {
            targetSection: { type: "string", description: "e.g. companyStatus, latestUpdate, nextCatalyst, project, projectStage, capital, team, highlights." },
            targetRef: { type: "string", description: "Which record it targets (e.g. a project name), else empty." },
            targetField: { type: "string" },
            proposedValue: { type: "string" },
            evidence: { type: "string", description: "Support from the release for this change." },
            confidence: { type: "string", enum: CONFIDENCE },
            reason: { type: "string" },
          },
          required: ["targetSection", "targetField", "proposedValue", "confidence"],
        },
      },
    },
    required: ["card", "classification", "milestoneRecommendation", "proposedChanges"],
  },
};

const SYSTEM = [
  "You are a disciplined investor-relations analyst for junior mining companies.",
  "You convert a press release into a factual, review-ready analysis. A human at the",
  "company confirms your suggestions before anything publishes — so be accurate and",
  "conservative, never promotional.",
  "",
  "CORE RULE — never invent. Do not state numbers, dates, grades, widths, dollar",
  "amounts or claims that are not in the release (or in provided company context).",
  "If a figure isn't present, leave it out. If context is insufficient, say so in",
  "warnings and default conservatively.",
  "",
  "SEPARATE THREE JUDGMENTS — never conflate them:",
  "1) category — WHAT TYPE of event occurred.",
  "2) impact tier — HOW MUCH the underlying event advances the investment story.",
  "3) key milestone — whether it has durable historical importance for the curated view.",
  "A release can be High impact yet NOT a key milestone, or Moderate impact yet a key",
  "milestone. Judge them independently. Never set key=true merely because impact is High.",
  "",
  "IMPACT TIER RUBRIC (judge the EVENT, not the adjectives):",
  "- Transformational: can materially redefine the company/thesis — major new discovery",
  "  with credible scale, first/major resource, decisive economic study, company-making",
  "  acquisition, construction decision, entry to production, financing that removes a",
  "  critical funding constraint, a result that changes the geological model or scale.",
  "- High: a meaningful step-change that strongly advances the story but doesn't redefine",
  "  the company — material drill results extending a known system, a meaningful new zone,",
  "  significant step-out, major financing/land deal/permit, important study result.",
  "- Moderate: constructively de-risks/advances — start/finish of a meaningful drill",
  "  program, useful claim acquisition, targeting-improving surveys, strategic executive",
  "  hire, study filing, permitting progress, results that reinforce the existing thesis.",
  "- Low: routine/incremental — survey completion without results, mobilization, assay",
  "  submission, routine corporate updates, AGM results, option grants, event attendance,",
  "  administrative filings, restatement of prior disclosure. (Low ≠ bad; just not thesis-",
  "  changing.)",
  "",
  "KEY MILESTONE TEST — propose key=true only when the event has durable importance:",
  "materially changes the asset base; establishes/expands a discovery; establishes or",
  "materially changes a resource; moves a project to a new lifecycle stage; materially",
  "changes financing capacity; completes a major transaction; changes ownership; hits a",
  "major permitting/development/construction/production milestone; a defining corporate",
  "event; or a result likely still important years later. Usually NOT a milestone:",
  "routine drilling updates, program commencement, assay submission, conference attendance,",
  "marketing agreements, minor appointments, routine filings, AGM results, incremental",
  "survey work, information already captured by a prior milestone.",
  "",
  "INTERNAL SCORING — score applicable dimensions 0-3 (0 none, 1 incremental, 2 material,",
  "3 thesis-defining) to keep tiers consistent. This is an internal aid; never surface a",
  "raw total to investors.",
  "",
  "ANTI-INFLATION — ignore promotional wording ('world class', 'exceptional', 'game",
  "changing', 'district scale', 'transformational', 'highly significant', 'tremendous",
  "potential') unless the factual content independently supports the classification. Note",
  "in warnings when you discounted such language.",
  "",
  "CONTEXT-AWARE — the same number means different things depending on new-discovery vs",
  "infill, distance from known mineralization, width/grade, continuity, project stage,",
  "existing resource size, company size, and whether it confirms or changes prior guidance.",
  "Use provided company/project context when available; do not infer facts absent from",
  "both the release and that context.",
  "",
  "MILESTONE DEDUP — compare against context.existingMilestones. If this represents the",
  "same financing/acquisition/discovery/resource update/drill result/stage advance as an",
  "existing milestone, recommend update_existing or supersede_existing (and cite relatedId).",
  "Where several releases describe one continuing event, only the most definitive should be",
  "the milestone; the rest are timeline_only.",
  "",
  "'sourceDate' is the release's own dateline date (YYYY-MM-DD) — this alone determines its",
  "position in history; do not use today's date.",
].join("\n");

function bad(res, code, msg) { res.status(code).json({ error: msg }); }

function contextBlock(context) {
  if (!context || typeof context !== "object") return "";
  const parts = [];
  if (context.company) parts.push("Company: " + JSON.stringify(context.company));
  if (Array.isArray(context.existingMilestones) && context.existingMilestones.length) {
    parts.push("Existing key milestones (for dedup):\n" + JSON.stringify(context.existingMilestones, null, 2));
  }
  if (context.profileSummary) parts.push("Current profile summary (for proposedChanges current values):\n" + JSON.stringify(context.profileSummary, null, 2));
  return parts.length ? "\n\nCompany context:\n" + parts.join("\n") : "";
}

export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, 405, "Method not allowed");
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return bad(res, 500, "Server not configured: ANTHROPIC_API_KEY is missing.");

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { return bad(res, 400, "Invalid JSON body"); } }
  const { mode = "extract", text = "", current = null, instruction = "", context = null } = body || {};

  if (mode === "extract" && !text.trim()) return bad(res, 400, "Provide the press-release text.");
  if (mode === "refine" && !current) return bad(res, 400, "Refine mode needs the current analysis.");

  const ctx = contextBlock(context);
  const userContent = mode === "refine"
    ? [
        "Current analysis (JSON):",
        "```json\n" + JSON.stringify(current, null, 2) + "\n```",
        text.trim() ? "Original press release for reference:\n\"\"\"\n" + text.trim() + "\n\"\"\"" : "",
        "Apply this change requested by the company, then emit the FULL revised analysis.",
        "Only change what the instruction implies; leave everything else intact.",
        "Instruction: " + (instruction.trim() || "(none — re-emit as-is)"),
        ctx,
      ].filter(Boolean).join("\n\n")
    : "Press release:\n\"\"\"\n" + text.trim() + "\n\"\"\"" + ctx + "\n\nAnalyze it and emit the structured analysis.";

  try {
    const r = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 3000,
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
    if (!block || !block.input) return bad(res, 502, "AI returned no structured analysis.");

    const analysis = block.input;
    analysis.schemaVersion = SCHEMA_VERSION;
    analysis.model = MODEL;
    return res.status(200).json({ analysis });
  } catch (e) {
    return bad(res, 502, `AI request failed: ${e.message || e}`);
  }
}
