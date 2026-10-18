// api/brief-generate.js — the per-release BriefV1 generation step for the portal.
//
// Thin HTTP wrapper over the SAME generator + validator used to build and approve the design
// (api/_briefGen.js, api/_briefValidate.js). It does NOT publish and writes NO data — it returns a
// DRAFT Brief (BriefV1 `v2` shape) plus a deterministic PASS/REVIEW/FAIL verdict for the company to
// review, edit, and then approve/publish through the EXISTING portal save + publish flow.
//
// Provider: OpenAI gpt-4o-mini via the dedicated MINEEX_BRIEF_API_KEY / MINEEX_BRIEF_MODEL — isolated
// from every other AI integration (news/comms/extraction keep their own keys). Server-side only.
// Authorization + account separation reuse requireFeature() (verifies the session AND that this user
// may act for this company), exactly like comms-generate.js.

import { requireFeature } from "./_entitlement.js";
import { generateBrief, briefToV2, BRIEF_MODEL } from "./_briefGen.js";
import { validateBrief } from "./_briefValidate.js";

function bad(res, code, msg) { res.status(code).json({ error: msg }); }

export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, 405, "Method not allowed");
  if (!process.env.MINEEX_BRIEF_API_KEY) return bad(res, 500, "Server not configured: MINEEX_BRIEF_API_KEY is missing.");

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { return bad(res, 400, "Invalid JSON body"); } }
  body = body || {};
  const { companyId, sourceText, companyName = "", category = "", sourceDate = "" } = body;
  if (!companyId) return bad(res, 400, "companyId is required.");
  if (!sourceText || String(sourceText).trim().length < 40) return bad(res, 400, "Provide the press-release text (at least a short paragraph).");

  // Server-side authz + strict company separation (same gate the comms engine uses).
  const auth = await requireFeature(req, res, { companyId, feature: "communications_center" });
  if (!auth) return;

  const model = process.env.MINEEX_BRIEF_MODEL || BRIEF_MODEL();
  try {
    const { brief, usage, cost } = await generateBrief({ sourceText, companyName, category, sourceDate, model });
    const validation = validateBrief(brief, sourceText);   // deterministic; does NOT trust the model's own evidence
    const v2 = briefToV2(brief, brief.category);            // the exact shape the BriefV1 reader renders
    return res.status(200).json({
      v2,
      validation,                                           // { status: PASS|REVIEW|FAIL, factualErrors, evidenceIssues, notes }
      meta: {
        model,
        promptVersion: "briefv1-2026-10",
        takeaway: brief.takeaway ? "present" : "omitted",
        omittedTakeawayReason: brief.omittedTakeawayReason || "",
        warnings: brief.warnings || [],
        usage, cost_usd: cost,
      },
    });
  } catch (e) {
    return bad(res, 502, `Brief generation failed: ${e.message || e}`);
  }
}
