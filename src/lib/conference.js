// Conference Mode, as the portal needs it: who has it, what their booth looks
// like, and the QR assets they take to a trade show.
//
// WHAT THIS FILE DOES NOT DO
// --------------------------
// It does not run a presentation. The booth is a separate app at
// /conference?c=<slug> and the iPad application operates it; the portal's job
// is discovery, preview, change requests, QR artwork and whatever engagement is
// genuinely measured. Nothing here duplicates a booth control.
//
// ENTITLEMENT IS READ, NEVER ASSUMED
// ----------------------------------
// No company-name checks, no frontend flag. The answer comes from the same
// tables 0005 built for it: `my_features` resolves plan + per-company override
// and is the authority on whether Conference Mode is ON, and a direct read of
// `company_features` distinguishes "switched off" from "never had it" --
// my_features cannot, because both come back as absent.
//
// Both reads are RLS-scoped to the caller's own company, so this is not where
// the isolation lives: the database refuses another company's row whatever this
// file asks for. The UI gate is a convenience on top of that, not the control.

import QRCode from "qrcode";
import { SUPABASE_URL } from "./supabase.js";
import { authHeaders } from "./auth.js";
import { profileUrl, companyLogo, companyMonogram } from "./brand.js";
import { buildPlacardSvg, splitQrSvg } from "./qrPlacard.js";
import { DEFAULTS } from "./conferenceCatalog.js";
import { guardDemoWrite } from "./demoMode.js";

export const CONFERENCE_FEATURE = "conference_mode";

/** The four states the portal renders. `requested` never comes from here. */
export const STATE = { ACTIVE: "active", INACTIVE: "inactive", NONE: "none" };

/**
 * Is Conference Mode on for this company?
 *
 * Returns { state, note, since }. Denies by default: any failure resolves to
 * NONE rather than throwing, because a lookup that breaks must not accidentally
 * unlock a paid product -- and must not lock out a paying customer silently
 * either, which is why `error` comes back for the caller to show.
 */
export async function conferenceEntitlement(companyId) {
  if (!companyId) return { state: STATE.NONE, error: "" };

  // my_features read here rather than through fetchFeatures(), which turns a
  // failed call into an empty list: indistinguishable from "not bought", so a
  // paying customer whose lookup failed was shown the sales page with no notice
  // (S3 a28 review). A failed call is now reported.
  let on = false;
  let featuresFailed = false;
  try {
    const h = await authHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/my_features`, {
      method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify({ cid: companyId }),
    });
    if (!res.ok) featuresFailed = true;
    else {
      const rows = await res.json();
      on = (Array.isArray(rows) ? rows : []).map((x) => (typeof x === "string" ? x : x && x.my_features)).includes(CONFERENCE_FEATURE);
    }
  } catch { featuresFailed = true; }

  // The override row, for the distinction my_features cannot make. Absent is
  // the normal case and not an error: most companies have never bought it.
  let row = null;
  let error = "";
  try {
    const h = await authHeaders();
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/company_features` +
      `?company_id=eq.${companyId}&feature_id=eq.${CONFERENCE_FEATURE}&select=enabled,note,created_at&limit=1`,
      { headers: h });
    if (r.ok) row = (await r.json().catch(() => []))[0] || null;
    else if (r.status !== 404 && r.status !== 406) error = "Your Conference Mode status could not be confirmed.";
  } catch {
    error = "Your Conference Mode status could not be confirmed.";
  }

  if (featuresFailed && !error) error = "Your Conference Mode status could not be confirmed.";
  if (on) return { state: STATE.ACTIVE, note: row?.note || "", since: row?.created_at || null, error };
  if (row && row.enabled === false) {
    return { state: STATE.INACTIVE, note: row.note || "", since: row.created_at || null, error };
  }
  return { state: STATE.NONE, note: "", since: null, error };
}

/* ── the booth ────────────────────────────────────────────────────────────── */

export const BOOTH_ORIGIN = "https://mineex.ca";

/** The address the iPad opens. Absolute and canonical -- never window.origin,
    which would hand a localhost or preview URL to someone at a trade show. */
export const boothUrl = (slug) => `${BOOTH_ORIGIN}/conference?c=${encodeURIComponent(slug || "")}`;

/** The company's saved booth look, with the booth's own fallbacks. A published
    record (a17, below) is what booths actually run, so it wins when present. */
export function boothLook(company, record = null) {
  const studio = (record && record.studio)
    || (company?.profile && company.profile.conference && company.profile.conference.studio) || {};
  return {
    template: studio.template || DEFAULTS.template,
    theme: studio.theme || DEFAULTS.theme,
    accent: studio.accent || "",
    chosen: !!(studio.template || studio.theme),   // false = still on defaults
    published: record ? { version: record.version, at: record.published_at } : null,
  };
}

/* ── the published booth look (a17, migration 0085) ──────────────────────────

   Conference Studio publishes a company's look to `conference_booth_configs`;
   booths fetch it through /api/conference-config and cache it (see
   src/conference/liveConfig.js). Members read their own row (RLS); only
   platform admins write. A missing table (0085 not applied) reads as "not
   published" -- booths then run their compiled package, as they always have. */

export async function fetchBoothRecord(companyId) {
  if (!companyId) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/conference_booth_configs?company_id=eq.${companyId}` +
      "&select=studio,version,published_at&limit=1", { headers: await authHeaders() });
    if (!r.ok) return null;
    return (await r.json().catch(() => []))[0] || null;
  } catch { return null; }
}

/** Platform admins only (RLS refuses everyone else). Returns the stored row. */
export async function publishBoothLook(companyId, { template, theme, accent }) {
  guardDemoWrite("Publishing a booth look");
  const r = await fetch(`${SUPABASE_URL}/rest/v1/conference_booth_configs?on_conflict=company_id`, {
    method: "POST",
    headers: { ...(await authHeaders()), "content-type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ company_id: companyId, studio: { template, theme, accent: accent || "" } }),
  });
  if (!r.ok) {
    if (r.status === 404) throw new Error("Booth publishing is not enabled on this deployment (migration 0085).");
    throw new Error(`The booth look could not be published (${r.status}).`);
  }
  return (await r.json().catch(() => []))[0] || null;
}

/* ── QR artwork ───────────────────────────────────────────────────────────── */

/**
 * WHERE THE CODE POINTS. The investor profile, through brand.js's profileUrl --
 * the same canonical https://mineex.ca/app?c=<slug> the rest of the product
 * uses. Never a portal route, never window.location.origin. A QR printed onto
 * booth signage outlives the laptop it was generated on, so a preview-deploy
 * host baked into it is a dead placard at a trade show.
 */
export const qrTarget = (slug) => profileUrl(slug);

const FILE_SAFE = (s) => String(s || "company").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Vector. What a printer actually wants: no resolution to get wrong. */
export async function qrSvg(slug) {
  return QRCode.toString(qrTarget(slug), {
    type: "svg", errorCorrectionLevel: "H", margin: 1,
  });
}

/** Raster, at a size that survives being scaled onto a pull-up banner. */
export async function qrPngDataUrl(slug, width = 2048) {
  return QRCode.toDataURL(qrTarget(slug), {
    errorCorrectionLevel: "H", margin: 2, width,
  });
}

/**
 * The print-ready placard: QR, company name and logo on one artboard, built by
 * the SAME qrPlacard.js the rest of MineEx prints from. Vector, so it scales to
 * any signage without a resolution decision.
 */
export async function placardSvg(company) {
  const slug = company?.slug || "";
  const raw = await QRCode.toString(qrTarget(slug), { type: "svg", errorCorrectionLevel: "H", margin: 0 });
  const { viewBox, inner } = splitQrSvg(raw);
  return buildPlacardSvg({
    qrInner: inner,
    qrViewBox: viewBox,
    name: company?.name || slug,
    logo: companyLogo(company),
    monogram: companyMonogram(company),
  });
}

/** Hand the browser a file. One place, so every download names itself alike. */
export function download(filename, blobOrUrl) {
  const url = typeof blobOrUrl === "string" ? blobOrUrl : URL.createObjectURL(blobOrUrl);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  if (typeof blobOrUrl !== "string") setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const qrFilename = (company, ext) => `${FILE_SAFE(company?.slug || company?.name)}-mineex-qr.${ext}`;
export const placardFilename = (company) => `${FILE_SAFE(company?.slug || company?.name)}-mineex-placard.svg`;

/* ── requests ─────────────────────────────────────────────────────────────── */

/**
 * Both the "I want Conference Mode" inquiry and the "please change my
 * presentation" request go to /api/conference-inquiry, which already stores the
 * lead in `demo_bookings` and emails support. It is the existing sales path and
 * reusing it means a request lands where the team already looks, rather than in
 * a second inbox nobody watches.
 *
 * `interest` is what separates the two on arrival.
 */
export async function submitConferenceRequest({ kind, company, user, message, timeframe = "" }) {
  // THE DEFECT THE AUDIT FOUND. /api/conference-inquiry takes no auth by
  // design -- it is a public lead form -- so the demo could and did reach the
  // real sales table. Guarded here, and refused again by the fetch barrier.
  guardDemoWrite("Sending a Conference Mode request");
  const res = await fetch("/api/conference-inquiry", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: user?.name || user?.email || "MineEx portal user",
      email: user?.email || "",
      company: company?.name || company?.slug || "",
      conference: kind === "change" ? "Presentation change request" : "Conference Mode inquiry",
      interest: kind === "change" ? "change-request" : "conference-mode",
      proProfile: company?.slug || "",
      timeframe,
      message,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error === "missing-required-fields"
    ? "Add your email address before sending."
    : "That request could not be sent. Try again, or email support directly.");
  return data;   // { ok, stored, emailed }
}

/* A local record that a request went out, so the button can say so and not be
   pressed four times. NOT a status: /api/conference-inquiry writes to a
   service-role sales table the company's own JWT cannot read back, so the
   portal genuinely does not know what happened to it afterwards. Labelled that
   way in the UI rather than dressed up as a pipeline stage. */
const SENT_KEY = (companyId, kind) => `mineex.conference.sent.${kind}.${companyId || "none"}`;

export function markRequested(companyId, kind = "purchase") {
  try { localStorage.setItem(SENT_KEY(companyId, kind), new Date().toISOString()); } catch { /* ignore */ }
}
export function requestedAt(companyId, kind = "purchase") {
  try { return localStorage.getItem(SENT_KEY(companyId, kind)); } catch { return null; }
}
