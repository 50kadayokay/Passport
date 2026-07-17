// Communications Engine (Engine 2 + 3).
//
// The CEO writes ONE update — "Completed hole LC-27, assays submitted" — and this
// endpoint does two things in a single call:
//   detect  — what surfaces does this change? (timeline, projects, website, social)
//   draft   — a destination-shaped version for each enabled, entitled destination
//
// Everything is a DRAFT. Nothing here publishes; the Approval Engine (a later
// endpoint) is the only thing that pushes to a connector. This route only writes
// rows the operator will review.
//
// Grounded, not creative: the copy restates the CEO's update in each channel's
// idiom. It must not invent facts the update doesn't contain — this is a public
// communication for a regulated issuer.

import { requireFeature } from "./_entitlement.js";

const MODEL = process.env.AI_MODEL || "claude-sonnet-5";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// Each destination the engine can draft for, with the shape its content takes and
// the feature that unlocks it. Passport (the profile itself) and push are always
// available on the base plan; the rest gate on their publish feature.
const CHANNELS = {
  passport:   { label: "Passport timeline", feature: "communications_center", shape: "A timeline entry: a headline (<= 70 chars) and a 1-2 sentence body." },
  push:       { label: "Push notification", feature: "push_publish",          shape: "A push notification: title (<= 40 chars) and body (<= 110 chars)." },
  website:    { label: "Website article",   feature: "website_publish",       shape: "A short news article: title, dek (1 sentence), and 2-3 short paragraphs." },
  linkedin:   { label: "LinkedIn post",     feature: "linkedin_publish",      shape: "A LinkedIn post: 2-4 short paragraphs, professional, 1-2 relevant hashtags max." },
  x:          { label: "X thread",          feature: "x_publish",             shape: "An X thread: an array of 2-4 posts, each <= 270 chars, first post is the hook." },
  newsletter: { label: "Email newsletter",  feature: "newsletter_publish",    shape: "An email: subject line and a short body (greeting, 2 paragraphs, sign-off)." },
};

const DETECT_TOOL = {
  name: "emit_plan",
  description: "Decide which surfaces a company update should touch, then draft each one.",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "One plain-English line: what changed. <= 90 chars." },
      category: { type: "string", enum: ["drilling", "assay", "financing", "corporate", "permit", "personnel", "other"], description: "What kind of update this is." },
      profileTouches: {
        type: "array",
        description: "Which Passport profile sections this update should update. Empty if none.",
        items: { type: "string", enum: ["status", "timeline", "projects", "capital", "team"] },
      },
      drafts: {
        type: "array",
        description: "One draft per requested destination, in the same order as requested.",
        items: {
          type: "object",
          properties: {
            destination: { type: "string" },
            content: { type: "object", description: "Destination-shaped content. Follow the shape given for that destination." },
            warnings: { type: "array", items: { type: "string" }, description: "Anything the reviewer should check before publishing." },
          },
          required: ["destination", "content"],
        },
      },
    },
    required: ["summary", "category", "drafts"],
  },
};

const SYSTEM = [
  "You are the communications engine for a junior mining company's investor platform.",
  "The CEO writes one short update; you decide what it affects and draft each channel.",
  "",
  "GROUNDING — restate, never invent. Every draft must be supported by the CEO's update",
  "(and the company context, if given). Do not add grades, dates, dollar amounts, or",
  "claims the update doesn't contain. This is public communication for a regulated",
  "issuer; a fabricated fact is a serious harm. If the update is thin, keep the drafts",
  "thin and say so in warnings.",
  "",
  "Match each channel's idiom: a push notification is terse; a LinkedIn post is",
  "professional prose; an X thread is punchy; a newsletter is warmer. Never use hype",
  "adjectives ('world-class', 'exceptional') — state the fact.",
  "",
  "profileTouches: name the profile sections a human should review for update, based on",
  "what the news is (an assay result touches timeline + projects; a financing touches",
  "capital). Don't over-reach — only sections the update genuinely bears on.",
].join("\n");

function bad(res, code, msg) { res.status(code).json({ error: msg }); }

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, 405, "Method not allowed");
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return bad(res, 500, "Server not configured: ANTHROPIC_API_KEY is missing.");

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { return bad(res, 400, "Invalid JSON body"); } }
  const { companyId = "", update = "", occurredOn = "", destinations = [], context = null } = body || {};

  if (!companyId) return bad(res, 400, "companyId is required.");
  if (!update || update.trim().length < 4) return bad(res, 400, "Write an update first.");

  // The Communications Center itself is the gate. Individual destinations are
  // filtered by their own feature below, so a company can draft for what it pays
  // for and nothing else — the model never even sees a locked channel.
  const auth = await requireFeature(req, res, { companyId, feature: "communications_center" });
  if (!auth) return;

  const requested = (Array.isArray(destinations) ? destinations : [])
    .filter((d) => CHANNELS[d])
    .filter((d) => auth.features.includes(CHANNELS[d].feature) || auth.features.includes("communications_center") && (d === "passport"));
  // Always allow the Passport timeline when the center is unlocked; it's the
  // company's own surface, not an external connector.
  if (!requested.includes("passport") && auth.features.includes("communications_center")) requested.unshift("passport");
  const channels = [...new Set(requested)];
  if (!channels.length) return bad(res, 403, "None of the requested destinations are in your plan.");

  const channelSpec = channels.map((d) => `- ${d} (${CHANNELS[d].label}): ${CHANNELS[d].shape}`).join("\n");
  const ctx = context ? `\n\nCompany context:\n${JSON.stringify(context).slice(0, 4000)}` : "";
  const userMsg =
    `Company update from the CEO${occurredOn ? ` (occurred ${occurredOn})` : ""}:\n"""\n${String(update).slice(0, 4000)}\n"""` +
    ctx +
    `\n\nDraft for exactly these destinations, in this order:\n${channelSpec}\n\n` +
    `Return one draft per destination plus which profile sections to review.`;

  try {
    const r = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 3000,
        system: SYSTEM,
        tools: [DETECT_TOOL],
        tool_choice: { type: "tool", name: DETECT_TOOL.name },
        messages: [{ role: "user", content: userMsg }],
      }),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      return bad(res, 502, `AI provider error (${r.status}): ${detail.slice(0, 300)}`);
    }
    const data = await r.json();
    const block = (data.content || []).find((b) => b.type === "tool_use");
    if (!block || !block.input) return bad(res, 502, "AI returned no plan.");

    const plan = block.input;
    // Only hand back drafts for channels we actually requested (defends against
    // the model inventing a destination).
    plan.drafts = (plan.drafts || []).filter((d) => channels.includes(d.destination));
    return res.status(200).json({ ...plan, channels, meta: { model: MODEL, usage: data.usage } });
  } catch (e) {
    return bad(res, 502, `AI request failed: ${e.message || e}`);
  }
}
