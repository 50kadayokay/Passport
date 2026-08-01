// Blueprint persistence — talks ONLY to the `company_blueprints` table. There is no
// code path here that writes to `companies` / `companies.profile`. RLS (can_touch_company)
// scopes every read/write to the owner/admin; anon is denied.

import { SUPABASE_URL } from "../supabase.js";
import { authHeaders, getUser } from "../auth.js";
import { TEMPLATE_VERSION } from "./types.js";
import { projectProfileToPassportBlueprint } from "./projectProfileToPassportBlueprint.js";
import { projectProfileToConferenceBlueprint } from "./projectProfileToConferenceBlueprint.js";

const TABLE = `${SUPABASE_URL}/rest/v1/company_blueprints`;
const COLS = "id,company_id,blueprint_type,template_key,template_version,status,data,created_at,updated_at,created_by,updated_by";

async function req(url, opts = {}) {
  const h = await authHeaders();
  const res = await fetch(url, { ...opts, headers: { ...h, "Content-Type": "application/json", ...(opts.headers || {}) } });
  if (!res.ok) {
    const d = await res.text().catch(() => "");
    throw new Error(`Blueprint request failed (${res.status})${d ? `: ${d.slice(0, 160)}` : ""}`);
  }
  return res.json().catch(() => []);
}

export function projectFor(type, profile) {
  return type === "conference"
    ? projectProfileToConferenceBlueprint(profile)
    : projectProfileToPassportBlueprint(profile);
}

// All blueprints the caller may touch (admin: all; owner: own company). Newest first.
export async function fetchAllBlueprints() {
  return req(`${TABLE}?select=${COLS}&order=updated_at.desc.nullslast`);
}

export async function fetchBlueprintsForCompany(companyId) {
  return req(`${TABLE}?company_id=eq.${encodeURIComponent(companyId)}&select=${COLS}&order=updated_at.desc.nullslast`);
}

export async function getBlueprint(companyId, type, version = TEMPLATE_VERSION) {
  const rows = await req(`${TABLE}?company_id=eq.${encodeURIComponent(companyId)}&blueprint_type=eq.${type}&template_version=eq.${encodeURIComponent(version)}&select=${COLS}&limit=1`);
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

// Create a draft by projecting the company's CURRENT profile. Read-only w.r.t. profile.
export async function createFromProfile(company, type, version = TEMPLATE_VERSION) {
  const profile = (company && company.profile) || {};
  const data = projectFor(type, profile);
  const uid = getUser()?.id || null;
  const body = {
    company_id: company.id,
    blueprint_type: type,
    template_key: data.templateKey,
    template_version: version,
    status: "draft",
    data,
    created_by: uid,
    updated_by: uid,
  };
  const rows = await req(TABLE, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(body) });
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

// Get the existing draft or create it from the profile.
export async function ensureBlueprint(company, type, version = TEMPLATE_VERSION) {
  const existing = await getBlueprint(company.id, type, version);
  if (existing) return existing;
  return createFromProfile(company, type, version);
}

// Create both blueprints for a company (projection only; no profile mutation).
export async function createBothFromProfile(company) {
  const passport = await ensureBlueprint(company, "passport");
  const conference = await ensureBlueprint(company, "conference");
  return { passport, conference };
}

export async function saveBlueprintData(id, data) {
  const uid = getUser()?.id || null;
  const rows = await req(`${TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ data, updated_by: uid }),
  });
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

export async function setBlueprintStatus(id, status) {
  const rows = await req(`${TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status }),
  });
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

// Duplicate a blueprint into a NEW template_version (older version untouched).
export async function duplicateVersion(row, newVersion) {
  const uid = getUser()?.id || null;
  const data = { ...(row.data || {}), templateVersion: newVersion };
  const body = {
    company_id: row.company_id,
    blueprint_type: row.blueprint_type,
    template_key: row.template_key,
    template_version: newVersion,
    status: "draft",
    data,
    created_by: uid,
    updated_by: uid,
  };
  const rows = await req(TABLE, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(body) });
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}
