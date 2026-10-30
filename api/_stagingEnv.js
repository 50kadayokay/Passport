// Staging environment: detection and the production tripwire.
//
// WHY THIS EXISTS
// ---------------
// Production configuration is forgiving on purpose: _supabase.js falls back to
// the production project when VITE_SUPABASE_URL is missing or unusable, so a
// mis-set deploy keeps serving. On staging that same forgiveness is the most
// likely way to touch production by accident. So when MINEEX_ENV=staging,
// configuration is checked once, here, at import, and anything that could
// point a staging process at production -- or arm a live channel -- stops the
// function before it can make a single request.
//
// THE RULES (staging only; production behaviour is untouched)
//   • MINEEX_ENV is unset (production), or exactly "staging". Anything else is
//     a typo that would silently mean "production", so it throws.
//   • The Supabase URL is EXACTLY the staging project. No fallback.
//   • The publishable key is not production's, and a JWT key names staging.
//   • The service key is read ONLY from STAGING_SUPABASE_SERVICE_ROLE_KEY. The
//     production names (SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SERVICE_KEY) being
//     present at all is refused: that is exactly what a production env file
//     loaded by mistake looks like.
//   • Provider keys are absent or the literal mock sentinel. A real-looking key
//     never enters a staging process, so it can never be sent anywhere.
//   • Push credentials and switches that arm live channels are refused.
//   • The reverse also holds: a process configured for the staging project
//     WITHOUT MINEEX_ENV=staging is refused, because it would run with no
//     egress guard.
//
// Files prefixed with _ are not routed by Vercel.

export const STAGING_REF = "jmljfovtfxcdhjmtlnva";
export const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
export const STAGING_HOST = `${STAGING_REF}.supabase.co`;
export const PRODUCTION_REFS = ["rvptronniomlqumjhyrr"];
// Production's publishable key is public (it ships in the browser bundle and is
// already committed in _supabase.js); it is listed so staging can refuse it.
export const PRODUCTION_ANON_KEYS = ["sb_publishable_NNxikHZSGZ0CYnzN7jckLg_vPvrRCTl"];

export const MOCK_SENTINEL = "staging-mock";

export class StagingConfigError extends Error {
  constructor(message) { super(`[staging tripwire] ${message}`); this.name = "StagingConfigError"; }
}

// Provider credentials that may only be absent or the mock sentinel.
export const MOCK_ONLY_VARS = [
  "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "POSTMARK_SERVER_TOKEN",
  "EODHD_API_KEY", "JINA_API_KEY",
];
// Variables that must not be present at all: production-named secrets, push
// credentials, cron, and the switches that publish or notify on their own.
export const FORBIDDEN_VARS = [
  "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY",
  "APNS_P8", "APNS_KEY_ID", "APNS_TEAM_ID", "APNS_BUNDLE_ID",
  "FCM_PRIVATE_KEY", "FCM_CLIENT_EMAIL", "FCM_PROJECT_ID",
  "CRON_SECRET", "NEWS_PROXY_URL",
];
// Switches that must not be "true" on staging.
export const FORBIDDEN_TRUE = ["PUSH_ENABLED", "NEWS_AUTOCREATE_ENABLED", "NEWS_AUTO_APPROVE_ENABLED"];

/** Which environment this process declares. Throws on anything unrecognised. */
export function declaredEnv(env = process.env) {
  const v = env.MINEEX_ENV;
  if (v === undefined || v === "") return "production";
  if (v === "staging") return "staging";
  throw new StagingConfigError(`MINEEX_ENV must be unset or "staging"; got an unrecognised value.`);
}

// atob, not Buffer: this module is reachable from an Edge-runtime route.
const jwtRef = (k) => {
  try {
    const b64 = String(k).split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64 + "===".slice((b64.length + 3) % 4))).ref || null;
  } catch { return null; }
};
const mentionsProduction = (v) => PRODUCTION_REFS.some((r) => String(v || "").includes(r));
const mentionsStaging = (v) => String(v || "").includes(STAGING_REF);

/**
 * Validate a staging environment. Returns the resolved staging config, or
 * throws StagingConfigError naming the VARIABLE (never its value).
 */
export function assertStagingEnv(env = process.env) {
  const problems = [];

  const url = String(env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
  if (!url) problems.push("VITE_SUPABASE_URL is not set (staging has no fallback)");
  else if (mentionsProduction(url)) problems.push("VITE_SUPABASE_URL names the PRODUCTION project");
  else if (url !== STAGING_URL) problems.push("VITE_SUPABASE_URL is not exactly the staging project URL");

  const anon = String(env.VITE_SUPABASE_ANON_KEY || "");
  if (!anon) problems.push("VITE_SUPABASE_ANON_KEY is not set (staging has no fallback)");
  else if (PRODUCTION_ANON_KEYS.includes(anon)) problems.push("VITE_SUPABASE_ANON_KEY is the PRODUCTION publishable key");
  else if (anon.startsWith("eyJ") && jwtRef(anon) !== STAGING_REF) problems.push("VITE_SUPABASE_ANON_KEY is a JWT for another project");
  else if (!/^sb_publishable_[A-Za-z0-9._-]{10,}$/.test(anon) && !anon.startsWith("eyJ")) problems.push("VITE_SUPABASE_ANON_KEY is not a publishable key");

  const service = String(env.STAGING_SUPABASE_SERVICE_ROLE_KEY || "");
  if (service) {
    if (service.startsWith("eyJ") && jwtRef(service) !== STAGING_REF) problems.push("STAGING_SUPABASE_SERVICE_ROLE_KEY is a JWT for another project");
    else if (!service.startsWith("eyJ") && !service.startsWith("sb_secret_")) problems.push("STAGING_SUPABASE_SERVICE_ROLE_KEY is not a service key");
  }

  for (const k of FORBIDDEN_VARS) if (env[k] !== undefined && env[k] !== "") problems.push(`${k} must not be set on staging`);
  for (const k of FORBIDDEN_TRUE) if (String(env[k] || "").toLowerCase() === "true") problems.push(`${k} must not be "true" on staging`);
  for (const k of MOCK_ONLY_VARS) {
    const v = env[k];
    if (v !== undefined && v !== "" && v !== MOCK_SENTINEL) problems.push(`${k} must be absent or "${MOCK_SENTINEL}" on staging`);
  }

  const stripe = String(env.STRIPE_SECRET_KEY || "");
  if (stripe && !/^(sk|rk)_test_/.test(stripe)) problems.push("STRIPE_SECRET_KEY is not a Stripe TEST-mode key");
  const mode = String(env.STAGING_STRIPE_MODE || "mock");
  if (mode !== "mock" && mode !== "test") problems.push(`STAGING_STRIPE_MODE must be "mock" or "test"`);
  if (mode === "test" && !stripe) problems.push(`STAGING_STRIPE_MODE=test needs a test-mode STRIPE_SECRET_KEY`);

  // Every other value: none may name production.
  for (const [k, v] of Object.entries(env)) {
    if (k === "VITE_SUPABASE_URL") continue;
    if (typeof v === "string" && mentionsProduction(v)) problems.push(`${k} names the PRODUCTION project`);
  }

  if (problems.length) throw new StagingConfigError(problems.join("; "));
  return { url: STAGING_URL, anon, service, stripeMode: mode };
}

/**
 * The reverse rule: a process aimed at the staging project must declare
 * MINEEX_ENV=staging, or it would run with no egress guard.
 */
export function assertNotUndeclaredStaging(env = process.env) {
  if (declaredEnv(env) === "staging") return;
  if (mentionsStaging(env.VITE_SUPABASE_URL) || env.STAGING_SUPABASE_SERVICE_ROLE_KEY) {
    throw new StagingConfigError("this process targets the staging project but MINEEX_ENV is not \"staging\"");
  }
}

// ---- run at import ----------------------------------------------------------
export const ENVIRONMENT = declaredEnv();
export const IS_STAGING = ENVIRONMENT === "staging";
assertNotUndeclaredStaging();
export const STAGING = IS_STAGING ? assertStagingEnv() : null;
