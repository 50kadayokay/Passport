// Site Contract authorization — the full refusal matrix.
//   node scripts/site-contract-test.mjs
//
// WHAT THIS PROVES, AND WHAT IT DOES NOT
// --------------------------------------
// It exercises api/_siteAuth.js against an injected store, so every branch runs
// -- including the ones a live database makes awkward to reach, like a revoked
// credential racing an in-flight request, or the credentials table not existing
// at all. Every assertion here is about the authorization DECISION.
//
// It is NOT a test that RLS holds. RLS is enforced by Postgres and can only be
// proven against Postgres; scripts/tenant-isolation-test.mjs is where that
// lives, and it has still never been run. A green run here means the rules in
// this file are right, not that the database agrees with them.
//
// The bar: every path that is not an explicit, verified allow must deny.

import { verifySiteToken, mintToken, hashToken, siteToken, DENY } from "../api/_siteAuth.js";

const COMPANY_A = "aaaaaaaa-0000-0000-0000-000000000001";
const COMPANY_B = "bbbbbbbb-0000-0000-0000-000000000002";

let pass = 0, fail = 0;
const results = [];

function check(group, name, got, want) {
  const ok = got === want;
  ok ? pass++ : fail++;
  results.push({ group, name, ok, got, want });
}

/* A store built from a list of rows. `findByHash` is what production does; the
   difference is only where the row comes from. */
const storeOf = (rows) => ({
  async findByHash(hash) { return rows.find((r) => r.token_hash === hash) || null; },
  touch: async () => {},
});

const THROWS = {
  notProvisioned: { async findByHash() { const e = new Error("no table"); e.notProvisioned = true; throw e; } },
  backend: { async findByHash() { throw new Error("connection reset"); } },
};

// ---------------------------------------------------------------- fixtures --
const siteA = mintToken("site");
const siteB = mintToken("site");
const draftA = mintToken("draft");
const revoked = mintToken("site");
const expired = mintToken("draft");
const expiresLater = mintToken("draft");

const ROWS = [
  { id: "1", company_id: COMPANY_A, kind: "site",  token_hash: siteA.hash,  label: "A build", revoked_at: null, expires_at: null },
  { id: "2", company_id: COMPANY_B, kind: "site",  token_hash: siteB.hash,  label: "B build", revoked_at: null, expires_at: null },
  { id: "3", company_id: COMPANY_A, kind: "draft", token_hash: draftA.hash, label: "preview", revoked_at: null, expires_at: "2099-01-01T00:00:00Z" },
  { id: "4", company_id: COMPANY_A, kind: "site",  token_hash: revoked.hash, label: "leaked", revoked_at: "2026-01-01T00:00:00Z", expires_at: null },
  { id: "5", company_id: COMPANY_A, kind: "draft", token_hash: expired.hash, label: "stale", revoked_at: null, expires_at: "2026-01-01T00:00:00Z" },
  { id: "6", company_id: COMPANY_A, kind: "draft", token_hash: expiresLater.hash, label: "live", revoked_at: null, expires_at: "2026-10-15T12:00:00Z" },
];
const store = storeOf(ROWS);
const V = (t, kind, opts = {}) => verifySiteToken(t, { kind, store, ...opts });

// ------------------------------------------------------------------ allows --
{
  const g = "valid credentials are allowed";
  const a = await V(siteA.token, "site");
  check(g, "site token resolves", a.ok === true, true);
  check(g, "resolves to its own company", a.companyId, COMPANY_A);
  const d = await V(draftA.token, "draft");
  check(g, "draft token resolves", d.ok === true, true);
  check(g, "draft resolves to its own company", d.companyId, COMPANY_A);
}

// -------------------------------------------------------- cross-company ----
{
  const g = "cross-company access";
  // The decisive property: B's token yields B, and there is no argument that
  // could make it yield A. The company is never a parameter.
  const b = await V(siteB.token, "site");
  check(g, "B's token resolves to B", b.companyId, COMPANY_B);
  check(g, "B's token never resolves to A", b.companyId === COMPANY_A, false);
  // A hash collision would be the only way to reach another company; prove the
  // lookup is by exact hash, not by anything caller-supplied.
  check(g, "A and B hash differently", siteA.hash === siteB.hash, false);
  check(g, "hash is deterministic", hashToken(siteA.token), siteA.hash);
  check(g, "plaintext is not the hash", siteA.token === siteA.hash, false);
}

// --------------------------------------------------------------- refusals ---
{
  const g = "revoked and expired";
  check(g, "revoked token refused", (await V(revoked.token, "site")).reason, DENY.REVOKED);
  check(g, "expired draft refused", (await V(expired.token, "draft")).reason, DENY.EXPIRED);
  // Expiry is evaluated against the clock, not assumed — prove both sides.
  const before = await V(expiresLater.token, "draft", { now: () => new Date("2026-10-15T11:59:00Z") });
  const after = await V(expiresLater.token, "draft", { now: () => new Date("2026-10-15T12:00:01Z") });
  check(g, "valid one minute before expiry", before.ok, true);
  check(g, "refused one second after expiry", after.reason, DENY.EXPIRED);
  // A token expiring exactly now is expired: the comparison is <=, so there is
  // no one-tick window where a dead credential still works.
  const exactly = await V(expiresLater.token, "draft", { now: () => new Date("2026-10-15T12:00:00Z") });
  check(g, "expired exactly at the boundary", exactly.reason, DENY.EXPIRED);
}

{
  const g = "unauthorized and malformed";
  check(g, "no token", (await V("", "site")).reason, DENY.NO_TOKEN);
  check(g, "unknown token", (await V(mintToken("site").token, "site")).reason, DENY.UNKNOWN);
  check(g, "empty-ish", (await V("mxs_", "site")).reason, DENY.MALFORMED);
  check(g, "wrong prefix", (await V("tok_abcdefghijklmnop", "site")).reason, DENY.MALFORMED);
  check(g, "injection attempt", (await V("mxs_abc'; drop table site_credentials;--", "site")).reason, DENY.MALFORMED);
  check(g, "path traversal attempt", (await V("mxs_../../admin", "site")).reason, DENY.MALFORMED);
  check(g, "absurdly long", (await V(`mxs_${"a".repeat(400)}`, "site")).reason, DENY.MALFORMED);
  check(g, "null byte", (await V("mxs_abc\u0000def", "site")).reason, DENY.MALFORMED);
}

{
  const g = "the two kinds are not interchangeable";
  // A draft token is short-lived and handed out per preview; if it could read
  // published content or upload a manifest it would be a site token with a
  // timer.
  check(g, "draft token refused for site endpoint", (await V(draftA.token, "site")).reason, DENY.WRONG_KIND);
  check(g, "site token refused for draft endpoint", (await V(siteA.token, "draft")).reason, DENY.WRONG_KIND);
  // The stored kind is the authority, not the prefix. A row whose kind was
  // changed server-side must be refused even though its prefix still matches.
  const mismatched = mintToken("site");
  const tricky = storeOf([{ id: "x", company_id: COMPANY_A, kind: "draft", token_hash: mismatched.hash, revoked_at: null, expires_at: null }]);
  const r = await verifySiteToken(mismatched.token, { kind: "site", store: tricky });
  check(g, "stored kind overrides the prefix", r.reason, DENY.WRONG_KIND);
}

{
  const g = "backend failure denies";
  // A database that is down, or a migration that was never applied, must never
  // resolve to allow.
  const np = await verifySiteToken(siteA.token, { kind: "site", store: THROWS.notProvisioned });
  check(g, "missing table → not provisioned", np.reason, DENY.NOT_PROVISIONED);
  check(g, "missing table → 503", np.status, 503);
  const be = await verifySiteToken(siteA.token, { kind: "site", store: THROWS.backend });
  check(g, "backend error → denied", be.ok === true, false);
  check(g, "backend error → 502", be.status, 502);
  const orphan = storeOf([{ id: "y", company_id: null, kind: "site", token_hash: siteA.hash, revoked_at: null, expires_at: null }]);
  check(g, "row without a company denied", (await verifySiteToken(siteA.token, { kind: "site", store: orphan })).reason, DENY.UNKNOWN);
}

{
  const g = "refusals do not leak which guess was close";
  const unknown = await V(mintToken("site").token, "site");
  const revokedR = await V(revoked.token, "site");
  // "Revoked" and "unknown" must read identically from outside, or the API
  // becomes an oracle for discovering which guessed tokens once existed.
  check(g, "same message for unknown and revoked", unknown.error, revokedR.error);
  check(g, "same status", unknown.status, revokedR.status);
  check(g, "reason differs internally", unknown.reason === revokedR.reason, false);
  check(g, "message names no company", /aaaa|bbbb/i.test(revokedR.error || ""), false);
}

{
  const g = "header parsing";
  const h = (v) => siteToken({ headers: { authorization: v } });
  check(g, "standard Bearer", h(`Bearer ${siteA.token}`), siteA.token);
  check(g, "lowercase scheme", h(`bearer ${siteA.token}`), siteA.token);
  check(g, "extra whitespace", h(`  Bearer   ${siteA.token}  `), siteA.token);
  check(g, "no scheme is not a token", h(siteA.token), "");
  check(g, "Basic refused", h(`Basic ${siteA.token}`), "");
  check(g, "missing header", siteToken({ headers: {} }), "");
}

// ------------------------------------------------- manifest + payload shape --
{
  const g = "manifest validation";
  const { validateManifest, FIELD_TYPES } = await import("../src/lib/siteManifest.js");
  const demo = (await import("../sites/demo-bespoke/mineex.config.mjs")).default;

  const ok = validateManifest(demo);
  check(g, "the demo site's own manifest is valid", ok.ok, true);

  // The rule the whole architecture rests on: a site cannot invent a field type,
  // because an editor that has never heard of it has no control to render.
  const invented = structuredClone(demo);
  invented.sections[0].fields.push({ key: "glow", type: "colorpicker", label: "Glow" });
  check(g, "an invented field type is rejected", validateManifest(invented).ok, false);

  // Nesting is capped: a repeater of repeaters is a data model pretending to be
  // a form.
  const nested = structuredClone(demo);
  nested.sections[1].fields[1].of.push({ key: "sub", type: "list", label: "Sub", of: [{ key: "a", type: "text", label: "A" }] });
  check(g, "a list of lists is rejected", validateManifest(nested).ok, false);

  const wrongMajor = { ...structuredClone(demo), contract: "2.0" };
  check(g, "an unsupported contract major is rejected", validateManifest(wrongMajor).ok, false);

  const dupe = structuredClone(demo);
  dupe.sections.push({ type: "hero", label: "Another hero", fields: [] });
  check(g, "a duplicate section type is rejected", validateManifest(dupe).ok, false);

  // Normalisation drops anything unrecognised, so an upload cannot smuggle keys
  // past the editor.
  const smuggled = structuredClone(demo);
  smuggled.sections[0].fields[0].secretDesignToken = "#ff0000";
  const norm = validateManifest(smuggled);
  check(g, "unknown constraints are refused outright", norm.ok, false);

  check(g, "reference targets are canonical records only",
    validateManifest({ ...structuredClone(demo), sections: [{ type: "x", label: "X", fields: [{ key: "r", type: "reference", label: "R", to: "site_section" }] }] }).ok, false);
  check(g, "vocabulary covers the demo's needs",
    demo.sections.every((s) => s.fields.every((f) => !!FIELD_TYPES[f.type])), true);
}

{
  const g = "payload shape and renderer robustness";
  const fs = await import("node:fs");
  const { render } = await import("../sites/demo-bespoke/render.mjs");
  const sample = JSON.parse(fs.readFileSync("sites/demo-bespoke/content.sample.json", "utf8"));

  for (const k of ["contract", "mode", "generatedAt", "company", "version", "content", "site"]) {
    check(g, `payload carries "${k}"`, Object.hasOwn(sample, k), true);
  }
  for (const k of ["profile", "posts", "media"]) {
    check(g, `content carries "${k}"`, Object.hasOwn(sample.content, k), true);
  }
  // The separation that requirement 3 depends on: canonical and site content are
  // different branches of the payload, so nothing written to one can land in the
  // other.
  check(g, "site content is not inside content", Object.hasOwn(sample.content, "sections"), false);
  check(g, "canonical profile is not inside site", Object.hasOwn(sample.site, "profile"), false);

  // A site must render before anyone has edited anything, and must not throw on
  // an empty company. A renderer that needs content to exist is a renderer that
  // breaks on day one.
  const bare = { contract: "1.0", mode: "published", generatedAt: null,
                 company: {}, version: {}, content: { profile: {}, posts: [], media: [] },
                 site: { pages: [], sections: {} } };
  let html = "";
  try { html = render(bare); } catch { html = ""; }
  check(g, "renders with no content at all", html.length > 200, true);
  check(g, "renders the sample", render(sample).length > 2000, true);
  check(g, "draft mode shows the banner", /Draft preview/.test(render({ ...sample, mode: "draft" })), true);
  check(g, "published mode does not", /Draft preview/.test(render(sample)), false);

  // Escaping: content comes from a database the customer writes to.
  const xss = structuredClone(sample);
  xss.site.sections["hero-1"].values.headline = '</h1><script>alert(1)</script>';
  const out = render(xss);
  check(g, "content cannot inject script", /<script>alert/.test(out), false);
  check(g, "it is escaped instead", /&lt;script&gt;/.test(out), true);
}

// ----------------------------------------------------------------- report --
let group = "";
for (const r of results) {
  if (r.group !== group) { group = r.group; console.log(`\n  ${group}`); }
  console.log(`    ${r.ok ? "ok  " : "FAIL"} ${r.name}${r.ok ? "" : `  (got ${JSON.stringify(r.got)}, want ${JSON.stringify(r.want)})`}`);
}
console.log(`\n  site contract auth: ${pass} passed, ${fail} failed`);
console.log("  (authorization logic only — RLS is proven by tenant-isolation-test.mjs)\n");
process.exit(fail ? 1 : 0);
