// Canonical server-side Supabase configuration and session verification.
//
// WHY THIS EXISTS
// ---------------
// Every /api route resolved its own Supabase config, and every one of them did it
// differently from the browser:
//
//   src/lib/supabase.js   import.meta.env.VITE_SUPABASE_URL || "https://…"   (fallback)
//   api/_entitlement.js   process.env.VITE_SUPABASE_URL                       (none)
//   api/_service.js       process.env.VITE_SUPABASE_URL                       (none)
//   api/extract-company.js, extract-projects.js, og-news.js, share-news.js    (none)
//
// So the browser could talk to Supabase while the server could not, and nothing
// said so. When VITE_SUPABASE_URL was present but not a URL, the `!SB` guard passed
// (a non-empty string is truthy), `fetch("<garbage>/auth/v1/user")` threw
// TypeError: Invalid URL, and a bare `catch` turned that into:
//
//     502 { error: "Could not verify the session." }
//
// which reads as "your login is broken" when the truth was "this server has no
// usable Supabase URL". _service.js was worse: its catch returned null, which
// callers reported as 401 "Sign in required."
//
// WHAT THIS DOES
// --------------
//   1. Resolves config once, VALIDATING it rather than trusting truthiness, and
//      falling back to the same project the browser falls back to — so client and
//      server can never disagree about which project a token belongs to.
//   2. Says so loudly, once, at startup.
//   3. Verifies a bearer token in ONE place, returning a structured result with a
//      SAFE diagnostic. The token is never logged, and is scrubbed from any error
//      text before it is surfaced.

// Mirrors the fallbacks in src/lib/supabase.js. Both values are public by design —
// the project URL and the publishable ("anon") key are shipped in the browser
// bundle. The service-role key is NOT here and must never be.
const FALLBACK_URL = "https://rvptronniomlqumjhyrr.supabase.co";
const FALLBACK_ANON = "sb_publishable_NNxikHZSGZ0CYnzN7jckLg_vPvrRCTl";

const looksLikeUrl = (v) => {
  try { const u = new URL(String(v)); return u.protocol === "https:" || u.protocol === "http:"; }
  catch { return false; }
};

// Supabase publishable keys are `sb_publishable_…`; legacy anon keys are JWTs.
// Anything else — empty, a placeholder, a redacted value — is not a usable key.
const looksLikeAnonKey = (v) =>
  /^sb_publishable_[A-Za-z0-9._-]{10,}$/.test(String(v || "")) ||
  /^eyJ[A-Za-z0-9._-]{20,}$/.test(String(v || ""));

function resolve(name, raw, valid, fallback, warnings) {
  if (valid(raw)) return String(raw);
  warnings.push(raw === undefined || raw === "" ? `${name} is not set` : `${name} is set but not usable`);
  return fallback;
}

const warnings = [];
export const SB_URL = resolve("VITE_SUPABASE_URL", process.env.VITE_SUPABASE_URL, looksLikeUrl, FALLBACK_URL, warnings);
export const ANON_KEY = resolve("VITE_SUPABASE_ANON_KEY", process.env.VITE_SUPABASE_ANON_KEY, looksLikeAnonKey, FALLBACK_ANON, warnings);

// One line at startup beats a 502 at runtime. Values are never printed.
if (warnings.length) {
  console.warn(`[supabase] ${warnings.join("; ")} — using the built-in project fallback. ` +
               `Set these in the environment to target a different project.`);
}

// Exported for tests: the validators that decide whether env config is usable.
export const _looksLikeUrl = looksLikeUrl;
export const _looksLikeAnonKey = looksLikeAnonKey;

/** True when this process has a usable Supabase URL + publishable key. */
export function supabaseConfigured() {
  return looksLikeUrl(SB_URL) && looksLikeAnonKey(ANON_KEY);
}

/** Read the bearer token off a request. One parser, so no route invents its own. */
export function bearerToken(req) {
  const h = (req && req.headers && (req.headers.authorization || req.headers.Authorization)) || "";
  const m = /^Bearer\s+(.+)$/i.exec(String(h).trim());
  const tok = m ? m[1].trim() : "";
  // A client that interpolates a null session sends the literal "Bearer null".
  // Treat that as no credential rather than shipping it to Supabase to be rejected.
  return tok && tok !== "null" && tok !== "undefined" ? tok : "";
}

// Remove anything that could be a credential before an error string is logged or
// returned. JWTs and Supabase keys are long unbroken token-ish runs.
export function scrubSecrets(text) {
  return String(text || "")
    .replace(/eyJ[A-Za-z0-9._-]{20,}/g, "<token>")
    .replace(/sb_(publishable|secret)_[A-Za-z0-9._-]+/g, "<key>");
}

/**
 * Verify a caller's Supabase access token.
 *
 * Returns `{ ok, user, status, error, detail }`. `detail` is a SAFE, scrubbed
 * description of a transport failure for logs and for the JSON body — it never
 * contains the token. Callers send `status`/`error` and must not invent their own.
 *
 * The three outcomes are kept distinct on purpose:
 *   401 — no credential, or Supabase rejected it (expired / invalid / wrong project)
 *   502 — we could not reach Supabase to ask (config or network)
 *   200 — verified
 */
export async function verifyBearer(token) {
  if (!token) return { ok: false, user: null, status: 401, error: "Sign in required.", detail: "no bearer token" };

  let r;
  try {
    r = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    });
  } catch (e) {
    const detail = scrubSecrets(`${(e && e.constructor && e.constructor.name) || "Error"}: ${(e && e.message) || e}`);
    console.error(`[auth] could not reach Supabase to verify a session — ${detail} (url host: ${hostOf(SB_URL)})`);
    return { ok: false, user: null, status: 502, error: "Could not verify the session.", detail };
  }

  if (!r.ok) {
    // Supabase answered and said no: expired, malformed, or issued by a different
    // project. That is a 401 for the caller, not a server fault.
    const body = scrubSecrets(await r.text().catch(() => ""));
    const detail = `supabase auth responded ${r.status}${body ? `: ${body.slice(0, 120)}` : ""}`;
    return { ok: false, user: null, status: 401, error: "Session expired or invalid. Sign in again.", detail };
  }

  const user = await r.json().catch(() => null);
  if (!user || !user.id) {
    return { ok: false, user: null, status: 401, error: "Session expired or invalid. Sign in again.", detail: "auth returned no user" };
  }
  return { ok: true, user, status: 200, error: null, detail: null };
}

function hostOf(u) { try { return new URL(u).host; } catch { return "<unparseable>"; } }
