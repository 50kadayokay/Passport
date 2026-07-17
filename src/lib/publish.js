// The Publisher (Engine 5) — connector layer.
//
// Each destination is a connector implementing publish(company, publication).
// The Communications Center produces `publications` rows; approving one and
// pushing it runs the matching connector. Adding Instagram/Mailchimp later is a
// new entry in CONNECTORS — nothing else changes.
//
// The `passport` connector is the one we fully control and needs no OAuth: it
// merges the draft into the company's own profile.timeline and recompiles
// profile.pp (the derived artifact the investor app reads). This is the concrete
// proof of the architecture — "the Passport profile is just one destination".
//
// External connectors (linkedin/x/website/newsletter/push) are declared but not
// implemented; they return a `pending` result so the UI can show "connector not
// set up yet" rather than silently doing nothing.

import { SUPABASE_URL } from "./supabase.js";
import { authHeaders } from "./auth.js";
import { mapProfileToPP } from "./profileToPP.js";

// A publication's content for the passport destination is { headline, body }.
// The app's timeline entry needs a dated id (also the FULL key that powers
// "read full release"), a headline, and a why/summary. Match mapTimeline's shape.
function timelineEntryFrom(publication, occurredOn) {
  const c = publication.content || {};
  // Prefer the update's own date; fall back to today. Runs in the browser, so
  // `new Date()` is fine here (unlike workflow scripts).
  const iso = /^\d{4}-\d{2}-\d{2}/.test(String(occurredOn || "")) ? String(occurredOn).slice(0, 10) : new Date().toISOString().slice(0, 10);
  const headline = String(c.headline || c.title || "").trim();
  const body = String(c.body || c.summary || "").trim();
  return {
    date: iso,
    headline: headline || "Company update",
    whyItMatters: body,
    fullText: body,        // so the "read full release" sheet has content
    key: false,
    source: "comms-center",
  };
}

// Merge one entry into profile.timeline, de-duplicating on (date, headline) so a
// re-publish of the same draft doesn't stack duplicates.
function mergeTimeline(timeline, entry) {
  const list = Array.isArray(timeline) ? timeline.slice() : [];
  const dupe = list.findIndex((e) => e && String(e.date).slice(0, 10) === entry.date && String(e.headline || e.title) === entry.headline);
  if (dupe >= 0) list[dupe] = { ...list[dupe], ...entry };
  else list.push(entry);
  // Newest first — the app re-sorts too, but keep the stored order sensible.
  list.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return list;
}

// The passport connector. Reads the company fresh (never trust a stale prop for a
// write), merges, recompiles pp, and patches the row. Returns a result the caller
// can surface.
async function publishToPassport(company, publication, occurredOn) {
  const slug = company?.slug;
  if (!slug) return { ok: false, error: "Company has no slug." };
  const h = await authHeaders();

  // Read current profile (RLS lets the owner/admin read their own row).
  const readRes = await fetch(`${SUPABASE_URL}/rest/v1/companies?slug=eq.${encodeURIComponent(slug)}&select=profile&limit=1`, { headers: h });
  if (!readRes.ok) return { ok: false, error: `Could not read company (${readRes.status}).` };
  const rows = await readRes.json().catch(() => []);
  const profile = (rows[0] && rows[0].profile) || {};

  const entry = timelineEntryFrom(publication, occurredOn);
  const nextProfile = { ...profile, timeline: mergeTimeline(profile.timeline, entry) };
  // Recompile the derived artifact the app renders.
  nextProfile.pp = mapProfileToPP(nextProfile);

  const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/companies?slug=eq.${encodeURIComponent(slug)}`, {
    method: "PATCH",
    headers: { ...h, "content-type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ profile: nextProfile }),
  });
  if (!patchRes.ok) {
    const d = await patchRes.text().catch(() => "");
    return { ok: false, error: `Publish failed (${patchRes.status})${d ? `: ${d.slice(0, 120)}` : ""}` };
  }
  return { ok: true, external_url: `/app?c=${encodeURIComponent(slug)}`, note: "Added to the Passport timeline." };
}

// External connectors — declared, not yet wired. Returning `pending` keeps the
// UI honest: it shows "not connected" instead of pretending it published.
const notWired = (label) => async () => ({ ok: false, pending: true, error: `The ${label} connector isn't set up yet.` });

export const CONNECTORS = {
  passport:   { publish: publishToPassport, live: true },
  push:       { publish: notWired("push"),       live: false },
  website:    { publish: notWired("website"),    live: false },
  linkedin:   { publish: notWired("LinkedIn"),   live: false },
  x:          { publish: notWired("X"),          live: false },
  newsletter: { publish: notWired("newsletter"), live: false },
};

export function connectorIsLive(destinationId) {
  return !!(CONNECTORS[destinationId] && CONNECTORS[destinationId].live);
}

// Publish one publication row through its connector, then reflect the result back
// onto the row (status/published_at/external_url or error). One row → one connector.
export async function publishPublication(company, publication, occurredOn) {
  const conn = CONNECTORS[publication.destination_id];
  if (!conn) return { ok: false, error: `No connector for '${publication.destination_id}'.` };

  const result = await conn.publish(company, publication, occurredOn);

  // Persist the outcome if this publication has a row (id present).
  if (publication.id) {
    const h = await authHeaders();
    const patch = result.ok
      ? { status: "published", published_at: new Date().toISOString(), external_url: result.external_url || null, error: null }
      : { status: result.pending ? "draft" : "failed", error: result.error || "Unknown error", attempts: (publication.attempts || 0) + 1 };
    await fetch(`${SUPABASE_URL}/rest/v1/publications?id=eq.${publication.id}`, {
      method: "PATCH",
      headers: { ...h, "content-type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(patch),
    }).catch(() => {});
  }
  return result;
}
