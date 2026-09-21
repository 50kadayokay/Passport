// Server-side API authentication — pure unit tests (no I/O).
//   node scripts/api-auth-test.mjs
//
// WHY THIS EXISTS
// ---------------
// The authenticated browser flow failed with:
//
//     502 { error: "Could not verify the session." }
//
// The session was fine. VITE_SUPABASE_URL was SET but was not a URL, so the
// `if (!SB)` guard passed (a non-empty string is truthy), fetch threw
// TypeError: Invalid URL, and a bare `catch` reported it as a login problem. The
// browser was unaffected because src/lib/supabase.js has a hardcoded fallback and
// the server had none — client and server disagreed about the project.
//
// These tests pin the three rules that stop that recurring: config is VALIDATED
// rather than trusted for truthiness, "Supabase said no" (401) stays distinct from
// "we could not ask Supabase" (502), and no credential ever reaches a log.

import {
  SB_URL, ANON_KEY, supabaseConfigured, bearerToken, verifyBearer, scrubSecrets,
  _looksLikeUrl as looksLikeUrl, _looksLikeAnonKey as looksLikeAnonKey,
} from "../api/_supabase.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗ " + m); } };
const eq = (g, w, m) => ok(g === w, `${m}\n      got:  ${JSON.stringify(g)}\n      want: ${JSON.stringify(w)}`);
const req = (h) => ({ headers: h || {} });

// ---- URL validation: truthiness is not enough ------------------------------
ok(looksLikeUrl("https://abc.supabase.co"), "https URL is usable");
ok(looksLikeUrl("http://localhost:54321"), "http URL is usable");
for (const bad of ["[SENSITIVE]", "", undefined, null, "not-a-url", "supabase.co", "ftp://x.co", "   "])
  ok(!looksLikeUrl(bad), `rejected as a URL: ${JSON.stringify(bad)}`);
ok(!looksLikeUrl("[SENSITIVE]"), "THE REGRESSION: a set-but-unusable URL is rejected, not accepted as truthy");

// ---- anon key validation ----------------------------------------------------
ok(looksLikeAnonKey("sb_publishable_NNxikHZSGZ0CYnzN7jckLg_vPvrRCTl"), "publishable key accepted");
ok(looksLikeAnonKey("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc"), "legacy JWT anon key accepted");
for (const bad of ["[SENSITIVE]", "", undefined, "sb_publishable_", "random"])
  ok(!looksLikeAnonKey(bad), `rejected as an anon key: ${JSON.stringify(bad)}`);

// ---- resolution always yields something usable ------------------------------
ok(looksLikeUrl(SB_URL), "SB_URL always resolves to a usable URL");
ok(looksLikeAnonKey(ANON_KEY), "ANON_KEY always resolves to a usable key");
ok(supabaseConfigured(), "server reports itself configured");
eq(new URL(SB_URL).host, "rvptronniomlqumjhyrr.supabase.co",
   "server resolves to the SAME project the browser falls back to");

// ---- bearer parsing ---------------------------------------------------------
eq(bearerToken(req({ authorization: "Bearer abc.def.ghi" })), "abc.def.ghi", "standard bearer");
eq(bearerToken(req({ authorization: "bearer abc" })), "abc", "case-insensitive scheme");
eq(bearerToken(req({ Authorization: "Bearer abc" })), "abc", "capitalised header name");
eq(bearerToken(req({ authorization: "  Bearer   abc  " })), "abc", "surrounding whitespace tolerated");
eq(bearerToken(req({})), "", "absent header → no token");
eq(bearerToken(req({ authorization: "abc" })), "", "missing scheme → no token");
eq(bearerToken(req({ authorization: "Basic abc" })), "", "wrong scheme → no token");
eq(bearerToken(), "", "absent request object handled");
// The specific client bug: `Bearer ${null}` when the session had gone.
eq(bearerToken(req({ authorization: "Bearer null" })), "", "literal 'Bearer null' is not a credential");
eq(bearerToken(req({ authorization: "Bearer undefined" })), "", "literal 'Bearer undefined' is not a credential");

// ---- no credential is a 401, never a 502 ------------------------------------
const none = await verifyBearer("");
eq(none.status, 401, "missing token → 401, not 502");
eq(none.error, "Sign in required.", "missing token message");
ok(none.ok === false && none.user === null, "missing token yields no user");

// ---- secrets never reach a log or a response body --------------------------
const JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop";
ok(!scrubSecrets(`failed for ${JWT}`).includes(JWT), "a JWT is scrubbed from error text");
eq(scrubSecrets(`failed for ${JWT}`), "failed for <token>", "JWT replaced with a placeholder");
ok(!scrubSecrets("key sb_publishable_ABC123xyz_def").includes("ABC123xyz"), "publishable key scrubbed");
ok(!scrubSecrets("key sb_secret_ABC123xyz_def").includes("ABC123xyz"), "secret key scrubbed");
eq(scrubSecrets(""), "", "empty input handled");
eq(scrubSecrets(null), "", "null input handled");
eq(scrubSecrets("TypeError: Invalid URL"), "TypeError: Invalid URL", "ordinary text passes through");

console.log(`\napi auth: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
