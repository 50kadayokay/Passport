// Shared mechanics for the three public submission forms.
//
// WHY THIS EXISTS
// ---------------
// `contact_submissions`, `demo_bookings` and `listing_reports` each carried an
// INSERT policy of `with check (true)` for the `anon` role. The anon key ships
// inside the client bundle, so that is an open, unbounded, unauthenticated write
// into three production tables -- any payload, any size, any number of times.
//
// Two of the three write paths went straight from the browser to
// /rest/v1/<table>: src/marketing/sections/Close.jsx and a duplicate insertLead()
// in src/site/Site.jsx. A third page (src/marketing/home2/ContactPage.jsx) already
// went through /api/contact, which is the shape the other two should have had.
// This module is that shape, factored out so all three share one validator, one
// throttle and one spam gate -- and so the anon INSERT policies can be dropped.
//
// WHAT IT DELIBERATELY DOES NOT DO
// --------------------------------
// No CAPTCHA. A CAPTCHA (Cloudflare Turnstile is the obvious choice, being free
// and privacy-respecting) is the right next layer, but it needs an account and a
// site key, so it is left as a documented follow-up rather than half-wired. The
// honeypot plus the throttle plus the heuristics below stop commodity form spam;
// they will not stop a determined human.

import { createHash, randomUUID } from "node:crypto";
import { serviceRpc, serviceConfigured } from "./_service.js";

// ------------------------------------------------------------ form schemas --
// `max` is enforced by truncation, not rejection, for optional prose fields --
// a long message should arrive clipped, not vanish. Required fields that fail
// validation reject, because a contact with no usable email is not a lead.
export const FORMS = {
  // SCHEMA CAVEAT: `demo_bookings` and `contact_submissions` are NOT defined in
  // supabase/migrations -- they were created by hand in the prototype era (see
  // docs/PHASE3-PUBLIC-SUBMISSIONS.md). The column lists below are therefore
  // INFERRED from the three client call sites that write them successfully today
  // (src/site/Site.jsx:153 and :181, src/marketing/sections/Close.jsx:261) plus
  // api/contact.js, which packs extra context into `notes`. Confirm against the
  // live schema before 0058 is applied; a column that does not exist makes
  // PostgREST reject the whole insert.
  contact: {
    table: "contact_submissions",
    required: ["name", "email"],
    fields: { name: 200, email: 200, company: 200, message: 4000 },
    passthrough: ["name", "email", "company", "message"],
  },
  // The pricing/contact page (src/marketing/home2/ContactPage.jsx -> /api/contact)
  // also lands here, carrying plan/phone/ticker, which api/contact.js folds into
  // `notes` rather than columns. Both shapes are preserved.
  demo: {
    table: "demo_bookings",
    required: ["name", "company", "email"],
    fields: {
      name: 200, email: 200, company: 200, phone: 60, country: 120,
      preferred_date: 60, preferred_time: 60, notes: 4000,
      ticker: 40, plan: 40, message: 4000,
    },
    passthrough: ["name", "email", "company", "phone", "country", "preferred_date", "preferred_time", "notes"],
  },
  listing_report: {
    table: "listing_reports",
    required: ["company_slug"],
    fields: { company_slug: 120, company_name: 200, kind: 20, message: 4000, contact: 200 },
    enums: { kind: ["error", "claim"] },
    passthrough: ["company_slug", "company_name", "kind", "message", "contact"],
  },
};

// Total request body ceiling. Vercel caps bodies well above this; the point is
// that a 4 KB form has no business carrying a megabyte.
export const MAX_BODY_BYTES = 16 * 1024;

const clean = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

// ------------------------------------------------------------- validation ---
export function validate(formName, body) {
  const form = FORMS[formName];
  if (!form) return { ok: false, error: "unknown-form" };

  const data = {};
  for (const [field, max] of Object.entries(form.fields)) data[field] = clean(body[field], max);

  for (const field of form.required) {
    if (!data[field]) return { ok: false, error: "missing-required-fields", field };
  }
  if ("email" in form.fields && data.email && !isEmail(data.email)) {
    return { ok: false, error: "invalid-email" };
  }
  for (const [field, allowed] of Object.entries(form.enums || {})) {
    if (data[field] && !allowed.includes(data[field])) return { ok: false, error: `invalid-${field}` };
  }
  return { ok: true, data };
}

// ------------------------------------------------------------ spam gating ---
// The honeypot is a field no human sees. Any value at all means a bot filled
// every input it found. Returning 200 rather than 400 matters: a bot that learns
// it was rejected adapts, and a bot that believes it succeeded stops retrying.
export const HONEYPOT_FIELD = "website_url";

export function looksLikeSpam(data) {
  const prose = [data.message, data.company, data.name, data.company_name].filter(Boolean).join(" ");
  if (!prose) return null;

  const links = (prose.match(/https?:\/\//gi) || []).length;
  if (links >= 3) return "links";

  // BBCode and bare anchor tags appear in commodity spam and never in a real enquiry.
  if (/\[url[=\]]|<a\s+href=/i.test(prose)) return "markup";

  // A run of 25+ identical characters is keyboard mashing or padding.
  if (/(.)\1{24,}/.test(prose)) return "repetition";

  // Cyrillic/CJK in an otherwise Latin form is the classic SEO-spam signature.
  // Measured as a RATIO so a legitimate accented name is unaffected.
  const nonLatin = (prose.match(/[Ѐ-ӿ一-鿿]/g) || []).length;
  if (nonLatin > 8 && nonLatin / prose.length > 0.25) return "script-mismatch";

  return null;
}

// -------------------------------------------------------------- throttling ---
// Fixed-window counter in Postgres, because Vercel's serverless instances share
// no memory -- an in-process counter would reset on every cold start and would be
// trivially evaded by concurrency.
//
// The client IP is HASHED with a server-side salt before storage. The throttle
// needs to recognise a repeat caller; it does not need to know who they are, and
// an un-hashed IP log is a privacy liability for no benefit.
const WINDOW_MINUTES = 10;
const MAX_PER_WINDOW = 5;

// WHICH HEADER IDENTIFIES THE CLIENT -- measured on Vercel on 2026-10-30 with
// the secret-less header probe (docs/header-probe-results.json):
//   x-real-ip               set by Vercel to the real client IP, Node AND Edge
//   x-forwarded-for         OVERWRITTEN by Vercel with the real IP (single value)
//   x-vercel-forwarded-for  real IP on Node, ABSENT on Edge -- not usable
//   x-client-ip, true-client-ip   passed through untouched: CLIENT-CONTROLLED
//   socket remoteAddress    127.0.0.1 (an internal hop) -- meaningless
// So: x-real-ip, else the first x-forwarded-for entry. Never the others. With
// neither (a non-Vercel host that sets nothing), every caller shares the
// "unknown" bucket -- stricter, never looser.
export function clientIp(req) {
  const h = (req && req.headers) || {};
  const real = String(h["x-real-ip"] || "").trim();
  if (real) return real;
  const fwd = String(h["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || "unknown";
}

function ipHash(ip) {
  const salt = process.env.SUBMISSION_SALT || "";
  // Without a salt a hashed IPv4 space is brute-forceable in seconds, so an
  // unsalted deployment gets a per-process random salt: the throttle still works
  // within an instance, and no weak hash is ever persisted across deployments.
  return createHash("sha256").update(`${salt || PROCESS_SALT}:${ip}`).digest("hex").slice(0, 32);
}
const PROCESS_SALT = randomUUID();

function windowStart(now = new Date()) {
  const ms = WINDOW_MINUTES * 60 * 1000;
  return new Date(Math.floor(now.getTime() / ms) * ms).toISOString();
}

// Returns { allowed, count } and fails OPEN on infrastructure trouble: a broken
// throttle must not take the contact form down with it. The cost of failing open
// is bounded by the other layers; the cost of failing closed is lost business.
export async function checkThrottle(formName, ip, { max = MAX_PER_WINDOW } = {}) {
  if (!serviceConfigured()) return { allowed: true, count: 0, note: "no-service-role" };
  // Via RPC, not a REST upsert. PostgREST's resolution=merge-duplicates issues
  // ON CONFLICT DO UPDATE SET <the columns you sent> -- so sending count:1 would
  // RESET the counter to 1 on every call instead of incrementing it, and the
  // throttle would never fire. The increment has to happen inside the database.
  try {
    const r = await serviceRpc("bump_submission_throttle", {
      p_ip_hash: ipHash(ip),
      p_form: formName,
      p_window_start: windowStart(),
    });
    if (!r.ok) return { allowed: true, count: 0, note: `throttle-${r.status}` };
    const count = await r.json().catch(() => null);
    if (typeof count !== "number") return { allowed: true, count: 0, note: "throttle-unparsed" };
    return { allowed: count <= max, count, max };
  } catch {
    return { allowed: true, count: 0, note: "throttle-threw" };
  }
}

export const THROTTLE_LIMITS = { WINDOW_MINUTES, MAX_PER_WINDOW };

// ------------------------------------------------- public lead forms (F7) ---
// api/contact.js and api/conference-inquiry.js email support@ on every call and
// had no throttle at all: a free relay into the support inbox. They now share
// submit.js's controls, applied AFTER validation and BEFORE anything is stored
// or sent:
//   honeypot  -> 200, nothing stored or sent (a bot told it failed retries)
//   spam      -> 200, nothing stored or sent
//   throttle  -> 429 + Retry-After, nothing stored or sent
// Each form has its own bucket, so one cannot exhaust the other. Conference
// inquiries come from booths on shared Wi-Fi, so they get a higher ceiling.
export const LEAD_FORM_LIMITS = {
  "lead:contact":    { max: MAX_PER_WINDOW },
  "lead:conference": { max: 20 },
};

/**
 * Returns null when the request may proceed, or { status, body, headers } to
 * send instead. Never throws. The throttle keeps submit.js's documented policy
 * of failing OPEN on infrastructure trouble (a broken counter must not take the
 * lead forms down); that trade-off is recorded in docs/REMEDIATION-PLAN.md.
 */
export async function guardLeadForm(req, formKey, data) {
  const limits = LEAD_FORM_LIMITS[formKey];
  if (!limits) return { status: 500, body: { ok: false, error: "unknown-form" } };
  const body = (req && req.body && typeof req.body === "object") ? req.body : {};
  if (String(body[HONEYPOT_FIELD] || "").trim()) return { status: 200, body: { ok: true, stored: false, emailed: false, discarded: "honeypot" } };
  const spam = looksLikeSpam(data);
  if (spam) return { status: 200, body: { ok: true, stored: false, emailed: false, discarded: spam } };
  const t = await checkThrottle(formKey, clientIp(req), { max: limits.max });
  if (!t.allowed) {
    return { status: 429, headers: { "Retry-After": String(WINDOW_MINUTES * 60) },
             body: { ok: false, error: "rate-limited", limit: limits.max, windowMinutes: WINDOW_MINUTES } };
  }
  return null;
}
