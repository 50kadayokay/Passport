// Spending gate for the three endpoints that bill Anthropic directly.
//
// WHY THIS EXISTS
// ---------------
// api/structure-release.js, api/synthesize-profile.js and api/audience-card.js
// each had exactly one gate:
//
//     if (req.method !== "POST") return bad(res, 405, "Method not allowed");
//
// then POSTed to api.anthropic.com with ANTHROPIC_API_KEY. Probed against
// production with an empty body, all three returned 400 -- the body-validation
// message -- which proves they are deployed, the key is set, and nothing stood
// between an anonymous caller and a billed completion.
//
// 0005_comms_foundation.sql warned about precisely this in its own header:
// "Server code (api/*) must check company_has_feature() too -- the AI endpoints
// spend real money per call."
//
// WHAT THIS DOES NOT DO: reimplement auth. api/_entitlement.js already answers
// "are you allowed to touch this company?" and "is this feature paid for?" in
// one round trip via my_features(cid), which enforces can_touch_company() inside
// the database and resolves admins to every feature. A second copy of those
// rules would drift. This adds the two things it does not cover -- a request
// size ceiling and a rate limit -- and sequences everything so that no
// unauthorised request can reach the provider.
//
// ORDER, AND WHY
//   1. SIZE        cheapest, no I/O. A 9 MB body is rejected before auth.
//   2. AUTH + AUTHZ + ENTITLEMENT   admin concierge, or company + paid feature.
//   3. RATE LIMIT  keyed by the VERIFIED user, so it must come after step 2.
// The provider is only reached once all three pass.
//
// RATE LIMITING FAILS CLOSED -- unlike the public-form throttle in
// api/_submissions.js, which fails open because losing a contact-form
// submission is worse than letting one through. Here the opposite holds: these
// calls cost money, so an unconsultable counter means refuse, not allow.
//
// THAT MAKES 0057_submission_throttle.sql A HARD PREREQUISITE. Deploy this
// without it and all three endpoints return 503. See
// docs/AI-ENDPOINT-LOCKDOWN.md for the ordering.

import { requireFeature, requireAdmin, companyIdFromSlug } from "./_entitlement.js";
import { bearerToken, SB_URL, ANON_KEY } from "./_supabase.js";
import { serviceRpc, serviceRest, serviceConfigured } from "./_service.js";
import { callerCompanyRole, callerIsPlatformAdmin } from "./_roles.js";
import { createHash } from "node:crypto";

const WINDOW_MINUTES = 10;

// 200, not 30. The limit has to clear the largest LEGITIMATE burst, and that is
// a bulk onboarding run: src/lib/structureReleases.js's structureReleases()
// calls /api/structure-release once per release with concurrency 4, so
// analysing a company's back-catalogue is routinely 50-100 calls in a few
// minutes. A limit of 30 would abort onboarding partway through and look like a
// product bug.
//
// 200 per 10 minutes per VERIFIED, ENTITLED user still bounds the damage: the
// caller must already hold a paid company_memory entitlement, so this is a
// backstop against a runaway client or a compromised session, not the primary
// control. Authentication and entitlement are the primary controls.
//
// Tune with AI_CALLS_PER_WINDOW without a code change.
const MAX_PER_WINDOW = Number(process.env.AI_CALLS_PER_WINDOW || 200);

// A per-user 10-minute window bounds a BURST. It does nothing about a caller who
// sits at the limit across successive windows -- 200 every 10 minutes is 28,800 a
// day. So there is a second, company-level budget on a 24-hour window. Both must
// pass, both fail closed.
//
// 1000/day is roughly five full back-catalogue onboarding runs. A company that
// genuinely needs more is a conversation, not a silent charge.
const COMPANY_DAILY_CAP = Number(process.env.AI_COMPANY_DAILY_CAP || 1000);

// Per-USER daily budget (F4). The company cap bounds what one company's members
// spend together; this bounds what one account spends in total, including on
// paths with no company (platform-admin tools), which had no daily bound at all.
const USER_DAILY_CAP = Number(process.env.AI_USER_DAILY_CAP || 1500);

// WHO MAY DRAFT (F4, proposed policy 2026-10-30). AI drafting and company-content
// creation are for a company's authorised users acting for THAT company. The
// read-only roles (analyst, viewer) may ask Mine IQ about their company but may
// not generate content. Platform admins are always admitted. This is the one
// line to change if the role policy changes.
export const DRAFTING_ROLES = ["owner", "admin", "editor", "publisher"];
export const MEMBER_ROLES = ["owner", "admin", "editor", "publisher", "analyst", "viewer"];

// ROLLBACK SWITCHES. Rolling back must NEVER mean reverting to the
// unauthenticated code -- the previous deployment IS the vulnerability. So there
// are two ways to turn AI off, and they have different operational properties.
//
// 1. DATABASE FLAG (public.ai_controls, via ai_enabled()) -- THE EMERGENCY
//    CONTROL. One UPDATE, effective on the next request, no build, no deploy.
//
// 2. ENV VAR (AI_ENDPOINTS_DISABLED=true) -- NOT an emergency control.
//    Vercel binds environment variables to a DEPLOYMENT: editing one in the
//    dashboard changes nothing until the next build. It is a belt-and-braces
//    setting for a planned disable, or for a deployment that should ship with
//    AI off. Do not reach for it in an incident.
const ENV_DISABLED = () => String(process.env.AI_ENDPOINTS_DISABLED || "") === "true";

// Per-endpoint body ceilings. structure-release accepts `pdf` as raw base64
// bytes that Claude reads natively, and base64 inflates by about a third, so its
// limit has to accommodate a real press-release PDF. The other two carry only
// timeline/project JSON.
export const BODY_LIMITS = {
  "structure-release": 8 * 1024 * 1024,
  "synthesize-profile": 512 * 1024,
  "audience-card": 512 * 1024,
  // Added with F4. Generous on purpose: these carry release corpora or PDFs, and
  // Vercel's own request ceiling (4.5 MB) is the effective limit for most.
  "compose": 2 * 1024 * 1024,
  "compose-ask": 2 * 1024 * 1024,
  "comms-generate": 512 * 1024,
  "extract-company": 8 * 1024 * 1024,
  "extract-projects": 8 * 1024 * 1024,
  "extract-text": 8 * 1024 * 1024,
  "structure-batch": 8 * 1024 * 1024,
  "story-extract": 8 * 1024 * 1024,
  "story-fetch": 16 * 1024,
  "build-from-website": 64 * 1024,
};

function windowStart() {
  const ms = WINDOW_MINUTES * 60 * 1000;
  return new Date(Math.floor(Date.now() / ms) * ms).toISOString();
}

function dayStart() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

// One counter bump. Returns the post-increment count, or null if the counter
// could not be consulted -- which every caller treats as a refusal.
async function bump(key, form, window) {
  try {
    const r = await serviceRpc("bump_submission_throttle", {
      p_ip_hash: key, p_form: form, p_window_start: window,
    });
    if (!r.ok) return null;
    const n = await r.json().catch(() => null);
    return typeof n === "number" ? n : null;
  } catch { return null; }
}

// The user id is hashed before it reaches the counter, for the same reason the
// submission throttle hashes IPs: the counter needs to recognise a repeat
// caller, not to record who they are. SUBMISSION_SALT is required here -- an
// unsalted per-process fallback would reset the window on every cold start,
// which for a paid endpoint is a rate limit that does not limit.
function userHash(id) {
  const salt = process.env.SUBMISSION_SALT || "";
  return createHash("sha256").update(`ai:${salt}:${id}`).digest("hex").slice(0, 32);
}

/**
 * Guard an LLM-spending endpoint. Call it FIRST, before reading req.body for
 * anything else. Returns the caller when allowed, or null after having already
 * sent the response -- bail out on null:
 *
 *   const caller = await requireAiCaller(req, res, {
 *     label: "structure-release", feature: "company_memory",
 *   });
 *   if (!caller) return;
 */
export async function requireAiCaller(req, res, {
  label, feature, allowOnboarding = false,
  // F4 options. adminOnly: a platform-admin tool; any company in the body is
  // ignored. adminWhenNoCompany: no company named -> platform admin required
  // (the extractors' existing semantics, now with limits). roles: company roles
  // admitted on the company path (platform admins always are).
  adminOnly = false, adminWhenNoCompany = false, roles = null,
}) {
  // ---- 0. kill switches ---------------------------------------------------
  // Checked before everything, including size: when AI is off, nothing about
  // the request matters.
  //
  // The env var is checked first because it costs nothing. The database flag
  // costs one RPC and is the switch that actually works in an incident, so it
  // is checked before any provider call but after the free check.
  if (ENV_DISABLED()) {
    res.status(503).json({
      error: "AI features are temporarily unavailable.",
      detail: "ai-disabled-env",
    });
    return null;
  }
  if (!serviceConfigured()) {
    // Without the service role there is no way to read the kill switch and no
    // way to enforce the rate limit. Both are required, so refuse.
    res.status(503).json({
      error: "AI requests are temporarily unavailable.",
      detail: "service-role-unconfigured",
    });
    return null;
  }
  //
  // AN UNREADABLE SWITCH IS A REFUSAL. An earlier version let an unreadable flag
  // fall through on the reasoning that the rate limiter would refuse the request
  // anyway with a more accurate message. That reasoning fails in one real case:
  // a PARTIALLY applied 0057, where bump_submission_throttle exists but
  // ai_enabled does not. The limiter would then pass and the request would reach
  // Anthropic with the emergency switch unreadable -- i.e. with no way to stop
  // it. So this fails closed on its own.
  let aiOn = null;
  try {
    const r = await serviceRpc("ai_enabled", {});
    if (r.ok) aiOn = await r.json().catch(() => null);
  } catch { aiOn = null; }
  if (aiOn === false) {
    res.status(503).json({
      error: "AI features are temporarily unavailable.",
      detail: "ai-disabled-db",
    });
    return null;
  }
  if (aiOn !== true) {
    res.status(503).json({
      error: "AI requests are temporarily unavailable. Please try again shortly.",
      detail: "kill-switch-unreadable",
    });
    return null;
  }

  // ---- 1. size ceiling ----------------------------------------------------
  const limit = BODY_LIMITS[label] || 512 * 1024;
  let bytes = 0;
  try {
    const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
    bytes = Buffer.byteLength(raw, "utf8");
  } catch {
    res.status(400).json({ error: "Unreadable request body." });
    return null;
  }
  if (bytes > limit) {
    res.status(413).json({ error: "Request too large.", limit, bytes });
    return null;
  }

  // ---- 2. authentication, company authorisation, entitlement --------------
  // The admin-OR-company shape is the one api/structure-batch.js:98 and
  // api/extract-company.js already use. Onboarding synthesises a profile BEFORE
  // the company row exists, so there is genuinely no company to gate on there;
  // that path requires a platform admin instead, which is strictly narrower
  // than the feature check it replaces.
  const body = (req.body && typeof req.body === "object") ? req.body : {};
  const token = bearerToken(req);
  const companyId = body.companyId || (body.slug ? await companyIdFromSlug(body.slug, token) : null);
  // ONE SUBJECT (D23). A request that names both must name the same company.
  // The guard authorises `companyId`; an extractor without an inline corpus
  // reads by slug. Mismatched, a member of A could be authorised and billed as
  // A while the work ran on B. Unresolvable counts as a mismatch: fail closed.
  if (!adminOnly && body.companyId && body.slug) {
    // Resolved with the SERVICE role: RLS (0001 auth_read) hides an unpublished
    // company's row from its own admins and editors, which would turn every
    // legitimate request of theirs into a false mismatch. This reveals only
    // whether the slug names the id the caller sent; authorisation is below.
    let fromSlug = null;
    try {
      const r = await serviceRest(`companies?slug=eq.${encodeURIComponent(String(body.slug))}&select=id&limit=1`);
      fromSlug = r.ok ? ((await r.json().catch(() => []))[0] || {}).id || null : null;
    } catch { fromSlug = null; }
    if (!fromSlug || String(fromSlug) !== String(body.companyId)) {
      res.status(400).json({ error: "companyId and slug name different companies.", code: "subject_mismatch" });
      return null;
    }
  }

  let caller;
  let subject = adminOnly ? null : companyId;

  if (adminOnly) {
    // PLATFORM-ADMIN TOOL (Story Studio, the website builder). There is no
    // company path at all: the UI that calls these is admin-gated, and a company
    // id in the body must not turn them into a company-billed route.
    caller = await requireAdmin(req, res);          // 401 unauth · 403 non-admin
    if (!caller) return null;

  } else if (subject) {
    // EXPLICIT COMPANY CONTEXT. The only path for a company-specific request.
    // There is deliberately NO fallback from here: if the named company is not
    // yours or not entitled, the answer is 403, never "try a different company".
    caller = await requireFeature(req, res, { companyId: subject, feature });
    if (!caller) return null;                        // 401 · 400 · 403 · 502

  } else if (allowOnboarding && body.onboarding === true) {
    // ONBOARDING EXCEPTION — opted into by the caller, not inferred.
    //
    // An earlier version of this guard resolved the caller's own company
    // WHENEVER companyId was absent. That was wrong, and the failure is worth
    // recording: an admin who belongs to company A, opening a surface for
    // company B with a missing companyId, would have been authorised against A,
    // charged to A's budget, and allowed to proceed on B's data. The
    // authorisation subject and the data subject would silently diverge.
    //
    // So the exception now requires three things at once:
    //   • the ENDPOINT permits it (allowOnboarding) -- audience-card does not,
    //     because its company is always known;
    //   • the REQUEST declares it (onboarding: true) -- set only by
    //     src/Onboarding.jsx, the profile builder, which legitimately runs
    //     before a company row exists (?new=1 returns before loading one);
    //   • the CALLER independently resolves to an entitled company, or is a
    //     platform admin.
    //
    // A company-specific request that merely forgot its companyId now gets 400
    // below, not a quietly substituted company.
    const own = await callerOwnCompany(token);
    if (own) {
      subject = own;
      caller = await requireFeature(req, res, { companyId: subject, feature });
      if (!caller) return null;
    } else {
      caller = await requireAdmin(req, res);        // 401 unauth · 403 non-admin
      if (!caller) return null;
    }

  } else if (adminWhenNoCompany) {
    // No company named: the concierge/onboarding tooling run by a platform admin
    // before a company exists. Exactly the semantics these routes always had --
    // now behind the kill switch, size ceiling and rate limits as well.
    caller = await requireAdmin(req, res);
    if (!caller) return null;

  } else {
    // No company named, and no onboarding claim. Refuse rather than guess.
    res.status(400).json({
      error: "companyId is required.",
      detail: allowOnboarding ? "send companyId, slug, or onboarding:true" : "send companyId or slug",
    });
    return null;
  }

  // ---- 2b. company ROLE (F4) -----------------------------------------------
  // my_features() admits any active member, whatever their role. Drafting is
  // narrower: my_company_role() -- asked AS THE CALLER, so it can only describe
  // the caller -- must be one of `roles`, unless the caller is a platform admin.
  if (roles && subject && !caller.isAdmin) {
    const role = await callerCompanyRole(caller.token || token, subject);
    if (role === undefined) {
      res.status(502).json({ error: "Could not check your role for this company." });
      return null;
    }
    if (!roles.includes(role || "") && !(await callerIsPlatformAdmin(caller.token || token))) {
      res.status(403).json({
        error: "Your role in this company does not allow this.",
        code: "role_not_permitted", role: role || null, allowed: roles,
      });
      return null;
    }
    caller.role = role || null;
  }

  // ---- 3. rate limit, FAILING CLOSED --------------------------------------
  // serviceConfigured() was already checked at step 0, where it gates the kill
  // switch read as well.
  // (a) per-user burst window. Bucketed per endpoint, so a bulk onboarding run
  //     against structure-release cannot exhaust an interactive user's budget
  //     for audience-card.
  const burst = await bump(userHash(caller.userId), `ai:${label}`, windowStart());
  if (burst === null) {
    // Counter unreachable. For a paid endpoint that is a refusal, not a pass.
    // Most likely cause: 0057_submission_throttle.sql has not been applied.
    res.status(503).json({
      error: "AI requests are temporarily unavailable. Please try again shortly.",
      detail: "rate-limiter-unavailable",
    });
    return null;
  }
  if (burst > MAX_PER_WINDOW) {
    res.setHeader("Retry-After", String(WINDOW_MINUTES * 60));
    res.status(429).json({
      error: "Too many AI requests just now. Please try again in a few minutes.",
      limit: MAX_PER_WINDOW, windowMinutes: WINDOW_MINUTES, scope: "user",
    });
    return null;
  }

  // (a2) per-user daily budget (F4): bounds one account across every endpoint
  //      and every company, including the admin-only paths.
  const userDay = await bump(`ud:${userHash(caller.userId)}`, "ai:user-day", dayStart());
  if (userDay === null) {
    res.status(503).json({
      error: "AI requests are temporarily unavailable. Please try again shortly.",
      detail: "budget-unavailable",
    });
    return null;
  }
  if (userDay > USER_DAILY_CAP) {
    res.setHeader("Retry-After", "3600");
    res.status(429).json({
      error: "You have reached your daily AI limit. It resets at 00:00 UTC.",
      limit: USER_DAILY_CAP, scope: "user",
    });
    return null;
  }

  // (b) per-company daily budget. This is the one that stops a single entitled
  //     account accumulating unbounded charges across successive windows.
  //     Keyed by company so every member shares one budget -- otherwise adding
  //     seats would multiply the ceiling.
  if (subject) {
    const daily = await bump(`co:${subject}`, "ai:company", dayStart());
    if (daily === null) {
      res.status(503).json({
        error: "AI requests are temporarily unavailable. Please try again shortly.",
        detail: "budget-unavailable",
      });
      return null;
    }
    if (daily > COMPANY_DAILY_CAP) {
      res.setHeader("Retry-After", "3600");
      res.status(429).json({
        error: "This company has reached its daily AI limit. It resets at 00:00 UTC.",
        limit: COMPANY_DAILY_CAP, scope: "company",
      });
      return null;
    }
  }

  return { ...caller, companyId: subject || null, aiCalls: burst };
}

/**
 * The caller's own company: one they own, or hold an active membership in.
 *
 * Read AS THE CALLER, so RLS decides. Note it must NOT use
 * `companies?owner_id=eq.<uid>` alone -- the `auth_read` policy is
 * `owner_id = auth.uid() OR status = 'published' OR is_admin()`, so selecting
 * companies as a user also returns every PUBLISHED company and would be a
 * useless ownership test. company_memberships is the authorization spine (0006)
 * and its policy is `user_id = auth.uid() OR can_touch_company(company_id)`,
 * so a caller sees only their own rows.
 *
 * Returns a company uuid or null. Entitlement is still checked separately --
 * this answers "which company are you?", never "may you spend?".
 */
async function callerOwnCompany(token) {
  if (!token) return null;
  try {
    const m = await fetch(
      `${SB_URL}/rest/v1/company_memberships?status=eq.active&select=company_id&limit=1`,
      { headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` } });
    if (m.ok) {
      const rows = await m.json().catch(() => []);
      if (Array.isArray(rows) && rows[0] && rows[0].company_id) return rows[0].company_id;
    }
    // Fall back to direct ownership, filtered by owner so a published-company
    // row cannot be mistaken for the caller's.
    const u = await fetch(`${SB_URL}/auth/v1/user`,
      { headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` } });
    if (!u.ok) return null;
    const user = await u.json().catch(() => null);
    if (!user || !user.id) return null;
    const c = await fetch(
      `${SB_URL}/rest/v1/companies?owner_id=eq.${encodeURIComponent(user.id)}&select=id&limit=1`,
      { headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` } });
    if (!c.ok) return null;
    const rows = await c.json().catch(() => []);
    return (Array.isArray(rows) && rows[0] && rows[0].id) || null;
  } catch { return null; }
}

// callerCompanyRole / callerIsPlatformAdmin live in ./_roles.js, shared with billing (F2).

export const AI_RATE_LIMITS = { WINDOW_MINUTES, MAX_PER_WINDOW, COMPANY_DAILY_CAP, USER_DAILY_CAP };
