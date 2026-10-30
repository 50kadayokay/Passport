// Who may run Company Memory's AI, and who may save what it produces (D23).
//
// Two different rules decide this, and they are not the same set of people:
//
//   RUN the AI      api/_aiGuard.js DRAFTING_ROLES (Batch C, approved): the
//                   company's owner, admins, editors and publishers, plus
//                   platform admins. Viewers and analysts may not draft.
//   SAVE a rebuild  api/memory-save.js REBUILD_SAVE_ROLES (D23, approved): the
//                   company's OWNER or a company ADMIN, plus platform admins.
//                   Editors and publishers generate AI content elsewhere but do
//                   not save a rebuild to the live profile.
//
// Re-analysis is only useful if it can be saved, so the console checks BOTH
// before spending anything, and says which rule stopped the person. Neither rule
// is decided here: the server enforces both. This only avoids paying for an
// analysis that cannot be kept, and never reports a save that did not happen.

import { SUPABASE_URL } from "./supabase.js";
import { authHeaders, apiHeaders, getMyRole } from "./auth.js";

// Mirror api/_aiGuard.js and api/memory-save.js. scripts/memory-ai-test.mjs
// fails if either drifts.
export const DRAFTING_ROLES = ["owner", "admin", "editor", "publisher"];
export const REBUILD_SAVE_ROLES = ["owner", "admin"];
export const REBUILD_FIELDS = ["timeline", "companyStatus", "companyBrief", "company", "capital", "team", "projects"];

/** Pure decision from a company role and the platform-admin flag. */
export function memoryAccess({ role = null, platformAdmin = false } = {}) {
  if (platformAdmin) return { canAnalyze: true, canSave: true, reason: "" };
  if (!role) return { canAnalyze: false, canSave: false, reason: "You are not a member of this company." };
  if (!DRAFTING_ROLES.includes(role)) {
    return { canAnalyze: false, canSave: false, reason: `Your role (${role}) can view Company Memory but cannot run AI analysis.` };
  }
  if (!REBUILD_SAVE_ROLES.includes(role)) {
    return { canAnalyze: true, canSave: false, reason: `Your role (${role}) may generate AI content, but only the company's owner or admins (or a MineEx admin) can save a rebuild to the live profile.` };
  }
  return { canAnalyze: true, canSave: true, reason: "" };
}

/** The caller's access to `companyId`, asked as the caller. Fails closed. */
export async function loadMemoryAccess(companyId) {
  if (!companyId) return memoryAccess({});
  try {
    const h = await authHeaders();
    const [roleRes, platformRole] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/rpc/my_company_role`, { method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify({ cid: companyId }) }),
      getMyRole().catch(() => null),
    ]);
    const role = roleRes.ok ? await roleRes.json().catch(() => null) : null;
    return memoryAccess({ role: typeof role === "string" ? role : null, platformAdmin: platformRole === "admin" });
  } catch {
    return { canAnalyze: false, canSave: false, reason: "Could not check your access to this company." };
  }
}

/**
 * Save a rebuild through /api/memory-save, which checks the role in the
 * database, writes ONLY the rebuild fields (REBUILD_FIELDS) and recomputes the
 * render payload itself. `baseUpdatedAt` is the updated_at the rebuild was
 * merged against: if anyone saved since, the server refuses (409) rather than
 * overwrite them. Throws unless exactly one row was written.
 */
export async function saveCompanyProfile(companyId, profile, baseUpdatedAt) {
  const fields = {};
  for (const k of REBUILD_FIELDS) if (profile && profile[k] !== undefined) fields[k] = profile[k];
  const res = await fetch("/api/memory-save", {
    method: "POST",
    headers: await apiHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ companyId, fields, baseUpdatedAt }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data.ok) return { updatedAt: data.updatedAt };
  if (res.status === 403) throw new Error("The profile was not saved: only the company's owner or admins (or a MineEx admin) can save a rebuild.");
  if (res.status === 409) throw new Error(`The profile was not saved: ${data.error || "it changed while the rebuild ran"}`);
  throw new Error(`The profile was not saved (${res.status}${data.error ? `: ${data.error}` : ""}).`);
}

/** The company's current profile and the updated_at it was read at, by id. */
export async function readCompanyProfile(companyId) {
  const h = await authHeaders();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/companies?id=eq.${encodeURIComponent(companyId)}&select=profile,updated_at&limit=1`, { headers: h });
  if (!res.ok) throw new Error(`Could not read the current profile (${res.status}).`);
  const rows = await res.json().catch(() => []);
  if (!rows[0]) throw new Error("Company not found.");
  return { profile: rows[0].profile || {}, updatedAt: rows[0].updated_at };
}

const STEP_LABEL = {
  transcribe: "reading scanned PDFs", timeline: "timeline", company: "company details",
  projects: "projects", overview: "status card and AI brief",
};

/**
 * Turn a run's per-step outcomes into what the person is told.
 *   { level: "error" | "partial" | "ok", text }
 * "error" means nothing should be saved.
 */
export function summarizeSteps(steps = {}, counts = {}) {
  const entries = Object.entries(steps).filter(([, v]) => v && !v.skipped);
  const failed = entries.filter(([, v]) => !v.ok);
  const refused = failed.filter(([, v]) => v.refused);
  if (entries.length && failed.length === entries.length) {
    const why = refused.length
      ? `the AI requests were refused (${refused[0][1].status || "no status"}: ${refused[0][1].error})`
      : `every step failed (${failed[0][1].error})`;
    return { level: "error", text: `Nothing was rebuilt: ${why}. Your profile was not changed.` };
  }
  const done = [];
  if (counts.timeline != null) done.push(`${counts.timeline} timeline entries`);
  if (counts.projects != null) done.push(`${counts.projects} projects`);
  if (counts.leaders != null) done.push(`${counts.leaders} leaders`);
  if (steps.overview && steps.overview.ok) done.push(`status card and AI brief regenerated${steps.overview.source === "saved timeline" ? " (from your saved timeline)" : ""}`);
  const notes = failed.map(([k, v]) => `${STEP_LABEL[k] || k} failed${v.refused ? " (refused)" : ""}`);
  const skipped = Object.entries(steps).filter(([, v]) => v && v.skipped).map(([k, v]) => `${STEP_LABEL[k] || k} skipped: ${v.error || "nothing to do"}`);
  return {
    level: failed.length ? "partial" : "ok",
    text: [done.join(", "), ...notes, ...skipped].filter(Boolean).join(" · "),
  };
}
