// POST /api/memory-save — save a Company Memory AI rebuild to the live profile.
//
// D23, approved policy (2026-10-30):
//   SAVE a rebuild   the company's OWNER or a company ADMIN, or a MineEx platform
//                    admin. Editors and publishers may generate AI content (Batch
//                    C) but may NOT save a rebuild to the live profile. Viewers,
//                    analysts, investors and other companies: never.
//
// WHY A SERVER ROUTE. The companies UPDATE policy (0001 auth_update) admits only
// owner_id = auth.uid() or a platform admin; a company admin's browser PATCH
// matches zero rows. Rather than widen RLS (a migration), this route checks the
// role in the database AS THE CALLER (my_company_role, 0006 -- an active
// membership's role, or 'owner' via companies.owner_id) and then writes with
// the service role -- but ONLY the profile fields an AI rebuild produces:
//
//   * the request carries `fields`: a subset of REBUILD_FIELDS. Everything else
//     in the profile is kept from the stored row, server-side;
//   * `company` is merged key by key from COMPANY_KEYS; its name and ticker are
//     identifiers and only ever FILL an empty slot;
//   * `pp` (the render payload) is recomputed here, never accepted;
//   * no column but `profile` is written -- not owner_id, tier, status, slug,
//     billing, membership or anything else.
//
// CONCURRENCY. The client sends the `updated_at` it merged against
// (`baseUpdatedAt`). A different stored value means someone saved in between:
// 409 stale_base, nothing written. The write itself is a compare-and-set on the
// updated_at this request read (the companies_touch trigger bumps it on every
// update), so two concurrent saves cannot both win: the loser gets 409
// concurrent_write. Zero rows written is never reported as success.
//
//   200 { ok, updatedAt }           saved (exactly one row)
//   400 bad body / slug does not match companyId / invalid fields
//   401 not signed in               403 role may not save   404 no such company
//   409 stale_base | concurrent_write                        413 too large
//   502 role check or database unavailable (fails closed)

import { bearerToken, verifyBearer } from "./_supabase.js";
import { serviceRest, serviceConfigured } from "./_service.js";
import { callerCompanyRole, callerIsPlatformAdmin, UUID } from "./_roles.js";
import { mapProfileToPP } from "../src/lib/profileToPP.js";

// Who may save a rebuild (approved). Platform admins are admitted separately.
export const REBUILD_SAVE_ROLES = ["owner", "admin"];
// What an AI rebuild may change: exactly what mergeExtraction/mergeIncremental write.
export const REBUILD_FIELDS = ["timeline", "companyStatus", "companyBrief", "company", "capital", "team", "projects"];
export const COMPANY_KEYS = ["name", "ticker", "website", "slogan", "commodity", "jurisdiction", "listings"];
const FILL_ONLY_COMPANY_KEYS = new Set(["name", "ticker"]);
export const MAX_BODY_BYTES = 3 * 1024 * 1024;
const LIMITS = { timeline: 1000, team: 200, projects: 100, listings: 50 };

function bad(res, code, error, extra = {}) { res.status(code).json({ ok: false, error, ...extra }); }
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
function hasForbiddenKey(v, depth = 0) {
  if (depth > 12) return true;
  if (Array.isArray(v)) return v.some((x) => hasForbiddenKey(x, depth + 1));
  if (isObj(v)) return Object.keys(v).some((k) => FORBIDDEN_KEYS.has(k) || hasForbiddenKey(v[k], depth + 1));
  return false;
}

/** Validate `fields`; returns an error string or null. Exported for tests. */
export function validateFields(fields) {
  if (!isObj(fields)) return "fields must be an object";
  const keys = Object.keys(fields);
  if (!keys.length) return "fields is empty";
  const extra = keys.filter((k) => !REBUILD_FIELDS.includes(k));
  if (extra.length) return `fields not allowed in a rebuild: ${extra.join(", ")}`;
  if (hasForbiddenKey(fields)) return "fields contain a forbidden key";
  for (const k of ["timeline", "team", "projects"]) {
    if (k in fields) {
      if (!Array.isArray(fields[k])) return `${k} must be an array`;
      if (fields[k].length > LIMITS[k]) return `${k} has too many entries`;
      if (fields[k].some((e) => !isObj(e))) return `${k} entries must be objects`;
    }
  }
  for (const k of ["companyStatus", "companyBrief", "capital", "company"]) {
    if (k in fields && !isObj(fields[k])) return `${k} must be an object`;
  }
  if (fields.company) {
    const bad = Object.keys(fields.company).filter((k) => !COMPANY_KEYS.includes(k));
    if (bad.length) return `company keys not allowed in a rebuild: ${bad.join(", ")}`;
    for (const [k, v] of Object.entries(fields.company)) {
      if (k === "listings") { if (!Array.isArray(v) || v.length > LIMITS.listings || v.some((x) => !isObj(x))) return "company.listings must be an array of objects"; }
      else if (typeof v !== "string" || v.length > 500) return `company.${k} must be a short string`;
    }
  }
  if (Array.isArray(fields.timeline) && fields.timeline.some((e) => e.date != null && typeof e.date !== "string")) return "timeline dates must be strings";
  return null;
}

/** The stored profile with only the allowlisted rebuild fields applied. Exported for tests. */
export function applyRebuild(current, fields) {
  const next = { ...(isObj(current) ? current : {}) };
  for (const k of REBUILD_FIELDS) {
    if (!(k in fields)) continue;
    if (k === "company") {
      const cur = isObj(next.company) ? next.company : {};
      const merged = { ...cur };
      for (const ck of COMPANY_KEYS) {
        if (!(ck in fields.company)) continue;
        if (FILL_ONLY_COMPANY_KEYS.has(ck) && String(cur[ck] || "").trim()) continue;   // identifiers: fill only
        merged[ck] = fields.company[ck];
      }
      next.company = merged;
    } else {
      next[k] = fields[k];
    }
  }
  delete next.pp;
  next.pp = mapProfileToPP(next);
  return next;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, 405, "method");
  if (!serviceConfigured()) return bad(res, 500, "service-not-configured");

  // 1. Size, then identity.
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { return bad(res, 400, "invalid-json"); } }
  let bytes = 0;
  try { bytes = Buffer.byteLength(JSON.stringify(body || {}), "utf8"); } catch { return bad(res, 400, "unreadable-body"); }
  if (bytes > MAX_BODY_BYTES) return bad(res, 413, "too-large");
  const token = bearerToken(req);
  const v = await verifyBearer(token);
  if (!v.ok || !v.user || !v.user.id) return bad(res, 401, "sign-in-required");

  const companyId = String((body && body.companyId) || "");
  if (!UUID.test(companyId)) return bad(res, 400, "companyId-required");

  // 2. Role, decided by the database AS THE CALLER. undefined = could not ask.
  const role = await callerCompanyRole(token, companyId);
  if (role === undefined) return bad(res, 502, "role-check-failed");
  let admitted = REBUILD_SAVE_ROLES.includes(role || "");
  if (!admitted) admitted = await callerIsPlatformAdmin(token);
  if (!admitted) return bad(res, 403, "role-may-not-save", { role: role || null, allowed: REBUILD_SAVE_ROLES });

  // 3. The company, by the authorised id. A slug, if sent, must be this company's.
  const rowR = await serviceRest(`companies?id=eq.${encodeURIComponent(companyId)}&select=id,slug,profile,updated_at&limit=1`);
  if (!rowR.ok) return bad(res, 502, "company-read-failed");
  const row = (await rowR.json().catch(() => []))[0];
  if (!row) return bad(res, 404, "company-not-found");
  if (body.slug != null && String(body.slug).toLowerCase() !== String(row.slug || "").toLowerCase()) {
    return bad(res, 400, "companyId and slug name different companies.", { code: "subject_mismatch" });
  }

  // 4. Payload.
  const fields = body.fields;
  const invalid = validateFields(fields);
  if (invalid) return bad(res, 400, invalid);
  const base = String(body.baseUpdatedAt || "");
  if (!base) return bad(res, 400, "baseUpdatedAt-required");
  // Exact string match: both values come from PostgREST in the same format,
  // and Date() would drop the microseconds two quick saves can differ by.
  if (base !== String(row.updated_at)) {
    return bad(res, 409, "The profile changed since this rebuild started. Run it again.", { code: "stale_base", updatedAt: row.updated_at });
  }

  // 5. Compare-and-set write of the profile column only; one row or an error.
  const next = applyRebuild(row.profile, fields);
  const w = await serviceRest(
    `companies?id=eq.${encodeURIComponent(companyId)}&updated_at=eq.${encodeURIComponent(row.updated_at)}&select=id,updated_at`,
    { method: "PATCH", prefer: "return=representation", body: { profile: next } });
  if (!w.ok) return bad(res, 502, "save-failed", { status: w.status });
  const written = await w.json().catch(() => []);
  if (!Array.isArray(written) || written.length !== 1) {
    return bad(res, 409, "Another save landed first. Run the rebuild again.", { code: "concurrent_write" });
  }
  res.status(200).json({ ok: true, updatedAt: written[0].updated_at, role: role || "platform-admin" });
}
