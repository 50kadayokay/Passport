// Service requests (a21): a company asks MineEx for a quote or a consultation
// from the Services page, and sees where it stands.
//
// Migration 0086 is the boundary: members read their company's requests,
// drafting roles create them, only platform admins move the status. A new
// request goes through /api/service-request so support is emailed as well;
// reads and admin updates are plain RLS-scoped PostgREST calls.
//
// NOT A CHECKOUT. Nothing is priced, ordered or charged. "Quoted" is a status a
// person sets, with a note; the conversation about money happens with a person.

import { SUPABASE_URL } from "./supabase.js";
import { authHeaders } from "./auth.js";
import { guardDemoWrite } from "./demoMode.js";

// Same ids as the Services cards and the database check constraint.
export const SERVICE_IDS = ["conference", "managed", "websites", "presentations", "brand", "photography"];
export const SERVICE_LABEL = {
  conference: "Conference Mode", managed: "Fully Managed MineEx", websites: "Investor Websites",
  presentations: "Corporate Presentations", brand: "Brand & Logo Design", photography: "Photography",
};

// In order. The database refuses anything else.
export const STATUSES = ["requested", "in_review", "quoted", "in_progress", "done"];
export const STATUS_LABEL = {
  requested: "Requested", in_review: "In review", quoted: "Quoted", in_progress: "In progress", done: "Done",
};

// Who may ask (mirrors 0086's insert policy). Analysts and viewers read only.
export const REQUEST_ROLES = ["owner", "admin", "editor", "publisher"];
export const canRequest = (role) => REQUEST_ROLES.includes(role);

export const MAX_DETAILS = 4000;
export const MAX_NOTE = 2000;

/** A missing table (0086 not applied) is "not available", not an error page. */
export class NotProvisioned extends Error {}

export async function listCompanyRequests(companyId) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/service_requests?company_id=eq.${companyId}` +
    "&select=id,service,details,status,admin_note,history,created_at,status_changed_at&order=created_at.desc&limit=100",
    { headers: await authHeaders() });
  if (r.status === 404) throw new NotProvisioned("Service requests are not enabled yet.");
  if (!r.ok) throw new Error(`Your requests could not be loaded (${r.status}).`);
  return r.json();
}

export async function createRequest({ companyId, service, details }) {
  guardDemoWrite("Sending a service request");
  const r = await fetch("/api/service-request", {
    method: "POST",
    headers: { ...(await authHeaders()), "content-type": "application/json" },
    body: JSON.stringify({ companyId, service, details: String(details || "").slice(0, MAX_DETAILS) }),
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 503) throw new NotProvisioned(j.error || "Service requests are not enabled yet.");
  if (!r.ok) throw new Error(j.error || `That request could not be sent (${r.status}).`);
  return j;   // { request, emailed }
}

/* ── platform admins ── */

export async function listAllRequests({ status = "" } = {}) {
  const f = status ? `&status=eq.${encodeURIComponent(status)}` : "";
  const r = await fetch(`${SUPABASE_URL}/rest/v1/service_requests?select=id,company_id,service,details,status,admin_note,history,created_at,status_changed_at,` +
    `companies(name,slug)${f}&order=created_at.desc&limit=500`, { headers: await authHeaders() });
  if (r.status === 404) throw new NotProvisioned("Service requests are not enabled yet (migration 0086).");
  if (!r.ok) throw new Error(`Requests could not be loaded (${r.status}).`);
  return r.json();
}

export async function updateRequest(id, { status, admin_note }) {
  const patch = {};
  if (status !== undefined) {
    if (!STATUSES.includes(status)) throw new Error("Unknown status.");
    patch.status = status;
  }
  if (admin_note !== undefined) patch.admin_note = String(admin_note).slice(0, MAX_NOTE);
  const r = await fetch(`${SUPABASE_URL}/rest/v1/service_requests?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...(await authHeaders()), "content-type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(`The request could not be updated (${r.status}).`);
  const row = (await r.json().catch(() => []))[0];
  if (!row) throw new Error("Only a MineEx platform admin can change a request.");
  return row;
}
