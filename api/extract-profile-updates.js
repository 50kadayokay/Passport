// POST /api/extract-profile-updates — a06: profile changes a press release
// discloses, PROPOSED for review. Writes nothing.
//
//   { companyId, updateId }  ->  { proposals, dropped, source }
//
// The release is read AS THE CALLER (userSelect, RLS), from the company the AI
// guard authorised -- never text from the body -- so every proposal's quote and
// line number point at the company's own stored release.
//
// WHO. Proposals only make sense for someone who can act on them: the roles
// that may save a profile DRAFT (api/profile-draft.js DRAFT_ROLES: owner,
// admin, editor; platform admins). Approving happens in the portal, which saves
// the approved changes as the profile draft through /api/profile-draft; going
// live is the ordinary profile publish (owner, admin). Nothing here, and nothing
// the review panel does, writes the live profile.
//
// GROUNDING. The model proposes; src/portal/publish/profileSuggestions.js
// decides. A proposal whose quote is not verbatim in the release, or whose value
// carries a figure its quote does not, is dropped and counted -- never shown as
// if it were sourced. The model is not shown the current profile: the diff is
// computed deterministically, so a stale value cannot leak into a proposal.

import { bearerToken } from "./_supabase.js";
import { requireAiCaller } from "./_aiGuard.js";
import { userSelect } from "./_userDb.js";
import { callOpenAITool, AI_MODELS } from "./_openaiExtract.js";
import { DRAFT_ROLES } from "./profile-draft.js";
import { validateProposals, KINDS } from "../src/portal/publish/profileSuggestions.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TEXT = 24000;

export const TOOL = {
  name: "propose_profile_updates",
  description: "Report the changes to the company's investor profile that this press release discloses.",
  parameters: {
    type: "object",
    properties: {
      changes: {
        type: "array",
        description: "One entry per profile value the release states. Omit anything the release does not state outright.",
        items: {
          type: "object",
          properties: {
            kind: { type: "string", enum: Object.keys(KINDS) },
            value: { type: "string", description: "The value exactly as the release writes it (e.g. 'C$3.4 million', '48,900,000'). For a milestone or highlight, one short factual sentence in the release's own words." },
            date: { type: "string", description: "YYYY-MM-DD. For cash: the 'as at' date. For a financing: its closing date. For a milestone: the date it happened. Empty if the release gives none." },
            details: { type: "object", description: "Financing only.", properties: {
              type: { type: "string" }, price: { type: "string" }, use: { type: "string" } } },
            quote: { type: "string", description: "The VERBATIM sentence from the release that states this. Copy it exactly." },
          },
          required: ["kind", "value", "quote"],
        },
      },
    },
    required: ["changes"],
  },
};

export const SYSTEM = [
  "You read a junior mining company's press release and report which values on its",
  "investor profile the release updates.",
  "",
  "- Report ONLY what the release states as a fact about the company now or a",
  "  completed event. Never infer, compute, convert, round or combine figures.",
  "- `value` keeps numbers, units and currencies exactly as written.",
  "- `quote` is copied verbatim from the release. If you cannot quote it, omit it.",
  "- cash: the company's cash or treasury position, with its as-at date if given.",
  "- shares_outstanding / fully_diluted / options / warrants / debt: capital",
  "  structure figures stated as current.",
  "- financing: a closed financing (amount, closing date, type, price, use).",
  "  Not a proposed or announced-but-unclosed one.",
  "- milestone: a completed event worth a line on the company timeline (a",
  "  drill program started or finished, a permit granted, an acquisition closed).",
  "- latest_update: one sentence on what the release reports, in its own words.",
  "- next_catalyst: the next event the release says is expected. Skip vague",
  "  forward-looking language.",
  "- Skip forward-looking statements, disclaimers, boilerplate and contacts.",
].join("\n");

function bad(res, code, msg) { res.status(code).json({ error: msg }); }

export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, 405, "POST only");

  const caller = await requireAiCaller(req, res, {
    label: "extract-profile-updates", feature: "portal_access", roles: DRAFT_ROLES,
  });
  if (!caller) return;

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const updateId = String(body.updateId || "");
  if (!UUID.test(updateId)) return bad(res, 400, "updateId must be a UUID.");
  // The company the guard AUTHORISED, never re-read from the body.
  const companyId = String(caller.companyId || "");
  if (!companyId) return bad(res, 400, "companyId is required.");

  // As the caller: RLS decides, and the company filter means a release of
  // another company is the same 404 as one that does not exist.
  let row = null;
  try {
    const rows = await userSelect(caller.token || bearerToken(req),
      `updates?id=eq.${updateId}&company_id=eq.${encodeURIComponent(companyId)}&select=id,company_id,status,body,published_on,detected&limit=1`);
    row = Array.isArray(rows) ? rows[0] : null;
  } catch { row = null; }
  if (!row) return bad(res, 404, "That release could not be found.");

  const text = String(row.body || "");
  if (!text.trim()) return bad(res, 400, "This release has no text to read.");
  if (!process.env.OPENAI_API_KEY) return bad(res, 500, "AI is not configured on this deployment.");

  const det = row.detected || {};
  const source = { updateId: row.id, headline: String(det.headline || ""), publishedOn: row.published_on || null, status: row.status };

  let raw;
  try {
    const { input } = await callOpenAITool({
      system: SYSTEM,
      model: AI_MODELS.extract(),
      maxTokens: 3000,
      tool: TOOL,
      user: [
        source.headline ? `Headline: ${source.headline}` : "",
        source.publishedOn ? `Release date: ${source.publishedOn}` : "",
        "",
        "Release:",
        '"""',
        text.slice(0, MAX_TEXT),
        '"""',
      ].filter((l) => l !== null).join("\n"),
    });
    raw = input && Array.isArray(input.changes) ? input.changes : [];
  } catch {
    // Generic on purpose: the provider's body can echo the release.
    return bad(res, 502, "MineEx could not read this release for profile changes. Try again.");
  }

  const { accepted, dropped } = validateProposals(raw, text, source);
  return res.status(200).json({
    proposals: accepted,
    dropped: dropped.map((d) => ({ kind: d.kind || null, reason: d.reason })),
    source,
  });
}
