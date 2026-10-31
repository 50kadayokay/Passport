// POST /api/profile-draft — company profile drafts: load, save, publish, discard
// (a04 / d28 / d29; migration 0072), and revision history: history, version,
// restore (a05; migration 0074) -- restore puts a past version INTO THE DRAFT,
// never the live profile; going live is the ordinary publish.
//
// APPROVED POLICY (2026-10-31):
//   draft    load / save / discard: the company's OWNER, a company ADMIN or an
//            EDITOR, and MineEx platform admins
//   publish  the OWNER, a company ADMIN, and platform admins
//   publishers, analysts, viewers, investors, other companies: neither
//
// WHY A ROUTE. Drafts live in company_profile_drafts (0072), which no client
// role can read or write: companies.profile is readable by anon, so a draft
// there would be public. This route verifies the caller, checks their role in
// the database AS THE CALLER (my_company_role, 0006; platform admin from their
// own profiles row) for a fast, explicit refusal, then calls the 0072 function
// as the service role with the caller as p_actor. The function checks the role
// AGAIN -- the database decides -- and does the work in one transaction.
//
// PUBLISH is publish_profile_draft(): snapshot the live profile
// (company_profile_versions), replace ONLY projects and pp on the CURRENT live
// row, append to activity_log, delete the draft -- all or nothing. Fields other
// services write (timeline, Company Memory's) are never touched.
//
// CONCURRENCY. Every save / publish / discard carries the draft version it was
// made against (compare-and-set); the first save carries the live fingerprint
// the editor loaded. Publish also refuses if the live editor fields changed
// since the draft began (a Company Memory rebuild, an admin edit).
//
//   200 { ok, ... }                 done (exactly what the database reports)
//   400 bad body                    401 not signed in
//   403 role may not do this        404 no such company
//   409 stale_draft | stale_base | draft_missing | no_draft | live_changed
//   413 too large                   502 role check / database unavailable
//   503 migration 0072 not applied
//
// The Mission Control concierge editor (src/admin/ProfileEditor.jsx) still
// writes the live profile directly: an intentional administrative exception
// (approved 2026-10-31), documented in docs/REMEDIATION-PLAN.md §22.

import { bearerToken, verifyBearer } from "./_supabase.js";
import { serviceRpc, serviceConfigured } from "./_service.js";
import { callerCompanyRole, callerIsPlatformAdmin, UUID } from "./_roles.js";

export const DRAFT_ROLES = ["owner", "admin", "editor"];
export const PUBLISH_ROLES = ["owner", "admin"];
export const ACTIONS = ["load", "save", "publish", "discard", "history", "version", "restore"];
export const MAX_BODY_BYTES = 3 * 1024 * 1024;

// The database's refusals, as HTTP.
export const STATUS_FOR = {
  forbidden: 403, not_found: 404, invalid: 400, too_large: 413,
  stale_draft: 409, stale_base: 409, draft_missing: 409, no_draft: 409, live_changed: 409,
};

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
function hasForbiddenKey(v, depth = 0) {
  if (depth > 40) return true;
  if (Array.isArray(v)) return v.some((x) => hasForbiddenKey(x, depth + 1));
  if (isObj(v)) return Object.keys(v).some((k) => FORBIDDEN_KEYS.has(k) || hasForbiddenKey(v[k], depth + 1));
  return false;
}

/** The draft as stored: ONLY the editor-owned keys. Returns { draft } or { error }. Exported for tests. */
export function cleanDraft(d) {
  if (!isObj(d)) return { error: "draft must be an object" };
  if (!isObj(d.pp)) return { error: "draft.pp must be an object" };
  const projects = d.projects === undefined ? null : d.projects;
  if (projects !== null && (!Array.isArray(projects) || projects.some((p) => !isObj(p)))) return { error: "draft.projects must be an array of objects" };
  const out = { projects, pp: d.pp };
  if (hasForbiddenKey(out)) return { error: "draft contains a forbidden key" };
  return { draft: out };
}

function bad(res, code, error, extra = {}) { res.status(code).json({ ok: false, error, ...extra }); }

export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, 405, "method");
  if (!serviceConfigured()) return bad(res, 500, "service-not-configured");

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { return bad(res, 400, "invalid-json"); } }
  let bytes = 0;
  try { bytes = Buffer.byteLength(JSON.stringify(body || {}), "utf8"); } catch { return bad(res, 400, "unreadable-body"); }
  if (bytes > MAX_BODY_BYTES) return bad(res, 413, "too_large");

  const token = bearerToken(req);
  const v = await verifyBearer(token);
  if (!v.ok || !v.user || !v.user.id) return bad(res, 401, "sign-in-required");

  const action = String((body && body.action) || "");
  if (!ACTIONS.includes(action)) return bad(res, 400, `action must be one of ${ACTIONS.join(", ")}`);
  const companyId = String((body && body.companyId) || "");
  if (!UUID.test(companyId)) return bad(res, 400, "companyId-required");

  // Role, decided by the database AS THE CALLER. undefined = could not ask.
  const role = await callerCompanyRole(token, companyId);
  if (role === undefined) return bad(res, 502, "role-check-failed");
  const allowed = action === "publish" ? PUBLISH_ROLES : DRAFT_ROLES;
  let admitted = allowed.includes(role || "");
  if (!admitted) admitted = await callerIsPlatformAdmin(token);
  if (!admitted) {
    return bad(res, 403, "forbidden", {
      role: role || null, allowed,
      reason: action === "publish"
        ? "Only the company's owner or admins (or a MineEx admin) can publish profile changes."
        : ["history", "version", "restore"].includes(action)
          ? "Only the company's owner, admins or editors (or a MineEx admin) can see and restore profile history."
          : "Only the company's owner, admins or editors (or a MineEx admin) can edit the profile.",
    });
  }

  const expected = body.expectedVersion == null ? null : Number(body.expectedVersion);
  if (expected !== null && !(Number.isInteger(expected) && expected >= 1)) return bad(res, 400, "expectedVersion must be a positive integer");

  let fn, args;
  if (action === "load") { fn = "load_profile_draft"; args = { p_company: companyId, p_actor: v.user.id }; }
  else if (action === "save") {
    const c = cleanDraft(body.draft);
    if (c.error) return bad(res, 400, "invalid", { reason: c.error });
    const base = body.baseFingerprint == null ? null : String(body.baseFingerprint);
    if (expected === null && !/^[0-9a-f]{32}$/.test(base || "")) return bad(res, 400, "a first save needs the baseFingerprint the editor loaded");
    fn = "save_profile_draft"; args = { p_company: companyId, p_actor: v.user.id, p_draft: c.draft, p_expected_version: expected, p_base_fingerprint: base };
  } else if (action === "history") {
    fn = "list_profile_versions"; args = { p_company: companyId, p_actor: v.user.id, p_limit: 50 };
  } else if (action === "version" || action === "restore") {
    const versionId = String(body.versionId || "");
    if (!UUID.test(versionId)) return bad(res, 400, "versionId-required");
    fn = action === "version" ? "get_profile_version" : "restore_profile_version_to_draft";
    args = action === "version"
      ? { p_company: companyId, p_actor: v.user.id, p_version: versionId }
      : { p_company: companyId, p_actor: v.user.id, p_version: versionId, p_expected_version: expected };
  } else {
    if (expected === null) return bad(res, 400, "expectedVersion (the draft version you saw) is required");
    fn = action === "publish" ? "publish_profile_draft" : "discard_profile_draft";
    args = { p_company: companyId, p_actor: v.user.id, p_expected_version: expected };
  }

  let r;
  try { r = await serviceRpc(fn, args); } catch { return bad(res, 502, "database-unavailable"); }
  if (r.status === 404) return bad(res, 503, ["history", "version", "restore"].includes(action) ? "profile history needs migration 0074" : "profile drafts need migration 0072");
  if (!r.ok) return bad(res, 502, `database error (${r.status})`);
  const out = await r.json().catch(() => null);
  if (!isObj(out)) return bad(res, 502, "database returned nothing");
  if (out.ok !== true) return res.status(STATUS_FOR[out.error] || 409).json(out);
  return res.status(200).json(out);
}
