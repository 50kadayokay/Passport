// a06 · Profile updates suggested by a press release, LIVE on STAGING. For S4.
//   node scripts/profile-suggestions-live-test.mjs [apiBase=http://127.0.0.1:8899]
// Needs the local staging API server (scripts/staging-api-server.mjs), started
// AFTER the api/ changes. The AI provider is the staging egress MOCK: no credit.
//
// Proves, against the real database and routes:
//   1. who may ask (/api/extract-profile-updates): owner, admin, editor yes;
//      publisher, viewer, other company, investor no -- refused before any AI call
//   2. the route reads the STORED release as the caller; another company's
//      release id is a 404; the response is { proposals, dropped, source }
//   3. the review panel's save path (src/portal/publish/ProfileSuggestions.jsx,
//      request for request): load draft -> applyProposals -> save as the DRAFT
//      through /api/profile-draft. The live profile is unchanged; the draft
//      holds the change; a publisher cannot save it.
// If the egress mock knows propose_profile_updates (requested from S4), the
// mocked proposals are checked for provenance too; otherwise step 3 uses a
// proposal validated locally against the stored text, exactly as the server does.
//
// WHAT IT WRITES (staging only): one throwaway company "zz-a06-<run>" (owner =
// company A's owner; admin, editor, publisher, viewer fixtures as members), one
// DRAFT release, and its profile draft. Nothing is published. Everything
// cascades away with the company. Company A is never written. Prints no secrets.
import fs from "node:fs";
import pg from "pg";
import { validateProposals, applyProposals } from "../src/portal/publish/profileSuggestions.js";

const API = (process.argv[2] || "http://127.0.0.1:8899").replace(/\/+$/, "");
const rd = (f) => Object.fromEntries(fs.readFileSync(f, "utf8").split("\n").filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const iso = rd("supabase/staging/.isolation-env");
const SB = iso.ISOLATION_SUPABASE_URL.replace(/\/+$/, ""), ANON = iso.ISOLATION_ANON_KEY;
const url = fs.readFileSync("supabase/staging/.connection", "utf8").trim();
if (!/jmljfovtfxcdhjmtlnva/.test(SB) || /rvptronniomlqumjhyrr/.test(SB) || !url.includes("jmljfovtfxcdhjmtlnva") || url.includes("rvptronniomlqumjhyrr")) { console.error("  REFUSING: not the staging project"); process.exit(2); }
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(API)) { console.error("  REFUSING: the API base must be the local staging API server (AI calls are mocked there)"); process.exit(2); }

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const pgc = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await pgc.connect();
const q = async (s, a) => (await pgc.query(s, a)).rows;
const one = async (s, a) => (await q(s, a))[0];
const signIn = async (key) => {
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email: iso[`ISOLATION_${key}_EMAIL`], password: iso[`ISOLATION_${key}_PASS`] }) });
  const j = r.ok ? await r.json() : null;
  return j ? { token: j.access_token, id: j.user.id } : null;
};
const W = {};
for (const k of ["COMPANY_A", "COADMIN", "EDITOR", "PUBLISHER", "STAFF", "COMPANY_B", "INVESTOR"]) W[k] = await signIn(k);
if (Object.values(W).some((v) => !v)) { console.error("  fixture sign-in failed"); process.exit(3); }
const api = async (u, route, body) => {
  const r = await fetch(`${API}/api/${route}`, { method: "POST", headers: { "content-type": "application/json", ...(u ? { Authorization: `Bearer ${u.token}` } : {}) }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

const RUN = Date.now().toString(36);
const RELEASE = [
  `A06 Closes C$2.4 Million Private Placement ${RUN}`,
  "",
  "The Company closed its non-brokered private placement for gross proceeds of C$2,448,000.",
  "Following closing, the Company has 48,900,000 common shares outstanding.",
  "As at September 30, 2026 the Company held cash of C$3.4 million.",
].join("\n");
const PP = { COMPANY: { name: "A06 Suggestions", cash: "C$3.1M", reportingDate: "2026-06-30", shares: "41,250,000" },
  CAP: { outstanding: "41,250,000", fd: "", rows: [{ sec: "Common Shares Outstanding", det: "", qty: "41,250,000" }] }, STATUS: {} };
let X = null, U = null;
try {
  console.log("\n  FIXTURE");
  await q(`select set_config('app.provisioning', 'on', false)`);
  X = (await one(`insert into public.companies (slug, name, owner_id, status, tier, profile) values ($1, 'A06 Suggestions', $2, 'published', 'pro', $3::jsonb) returning id`,
    [`zz-a06-${RUN}`, W.COMPANY_A.id, JSON.stringify({ pp: PP })])).id;
  for (const [k, role] of [["COADMIN", "admin"], ["EDITOR", "editor"], ["PUBLISHER", "publisher"], ["STAFF", "viewer"]]) {
    await q(`insert into public.company_memberships (company_id, user_id, role, status) values ($1, $2, $3, 'active')`, [X, W[k].id, role]);
  }
  await q(`insert into public.company_subscriptions (company_id, plan_id, status) select $1, plan_id, 'active' from public.company_subscriptions where company_id = $2`, [X, iso.ISOLATION_COMPANY_A_ID]);
  U = (await one(`insert into public.updates (company_id, author_id, body, status, published_on, detected) values ($1, $2, $3, 'draft', '2026-10-05', $4::jsonb) returning id`,
    [X, W.COMPANY_A.id, RELEASE, JSON.stringify({ headline: `A06 Closes C$2.4 Million Private Placement ${RUN}` })])).id;
  const otherU = (await one(`select id from public.updates where company_id = $1 limit 1`, [iso.ISOLATION_COMPANY_B_ID]) || {}).id;
  ok(!!X && !!U, "throwaway company with owner, admin, editor, publisher, viewer; one draft release");

  console.log("\n  1. WHO MAY ASK");
  for (const k of ["COMPANY_A", "COADMIN", "EDITOR"]) {
    const r = await api(W[k], "extract-profile-updates", { companyId: X, updateId: U });
    ok(r.status === 200 && Array.isArray(r.body.proposals) && Array.isArray(r.body.dropped) && r.body.source && r.body.source.updateId === U,
       `${k}: 200 with { proposals, dropped, source }`, `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    if (k === "EDITOR" && r.body.proposals && r.body.proposals.length) {
      ok(r.body.proposals.every((p) => p.source && p.source.line > 0 && RELEASE.includes(p.quote)), "mocked proposals carry a line and a verbatim quote of the stored release");
    }
  }
  for (const [k, why] of [["PUBLISHER", "publisher"], ["STAFF", "viewer"], ["COMPANY_B", "company B's owner"], ["INVESTOR", "investor"]]) {
    const r = await api(W[k], "extract-profile-updates", { companyId: X, updateId: U });
    ok(r.status === 403 || r.status === 401, `${why}: refused`, `${r.status}`);
  }
  ok((await api(null, "extract-profile-updates", { companyId: X, updateId: U })).status === 401, "anonymous: 401");

  console.log("\n  2. WHAT IT READS");
  if (otherU) {
    const r = await api(W.COMPANY_A, "extract-profile-updates", { companyId: X, updateId: otherU });
    ok(r.status === 404, "company B's release id under company X: 404", `${r.status}`);
  } else ok(true, "company B has no release to probe (skipped)");
  ok((await api(W.COMPANY_A, "extract-profile-updates", { companyId: X, updateId: "nope" })).status === 400, "malformed id: 400");

  console.log("\n  3. THE PANEL'S SAVE PATH: draft only");
  const { accepted } = validateProposals([
    { kind: "shares_outstanding", value: "48,900,000", quote: "Following closing, the Company has 48,900,000 common shares outstanding." },
    { kind: "cash", value: "C$3.4 million", date: "2026-09-30", quote: "As at September 30, 2026 the Company held cash of C$3.4 million." },
  ], RELEASE, { updateId: U });
  ok(accepted.length === 2 && accepted[0].source.line === 4, "two proposals validate against the stored text (shares on line 4)");
  const load = await api(W.EDITOR, "profile-draft", { action: "load", companyId: X });
  ok(load.status === 200 && load.body.ok, "editor loads the profile draft state", `${load.status} ${JSON.stringify(load.body).slice(0, 160)}`);
  const live = load.body.live || {};
  const nextPp = applyProposals((load.body.draft && load.body.draft.draft.pp) || live.pp || {}, accepted);
  const pubTry = await api(W.PUBLISHER, "profile-draft", { action: "save", companyId: X, draft: { projects: live.projects ?? null, pp: nextPp }, expectedVersion: null, baseFingerprint: load.body.live_fingerprint });
  ok(pubTry.status === 403, "a publisher cannot save the approved changes to the profile draft", `${pubTry.status}`);
  const save = await api(W.EDITOR, "profile-draft", { action: "save", companyId: X, draft: { projects: live.projects ?? null, pp: nextPp }, expectedVersion: null, baseFingerprint: load.body.live_fingerprint });
  ok(save.status === 200 && save.body.ok && save.body.version === 1, "editor saves the approved changes as draft version 1", `${save.status} ${JSON.stringify(save.body).slice(0, 160)}`);
  const liveNow = (await one(`select profile from public.companies where id = $1`, [X])).profile;
  ok(liveNow.pp.CAP.outstanding === "41,250,000" && liveNow.pp.COMPANY.cash === "C$3.1M", "the LIVE profile is unchanged");
  const d = await one(`select draft from public.company_profile_drafts where company_id = $1`, [X]);
  ok(d && d.draft.pp.CAP.outstanding === "48,900,000" && d.draft.pp.COMPANY.cash === "C$3.4 million" && d.draft.pp.COMPANY.reportingDate === "2026-09-30",
     "the DRAFT holds the approved shares and cash (with its as-at date)");
  const stale = await api(W.COADMIN, "profile-draft", { action: "save", companyId: X, draft: { projects: null, pp: nextPp }, expectedVersion: null, baseFingerprint: load.body.live_fingerprint });
  ok(stale.status === 409, "a second save from the same stale load is refused (compare-and-set)", `${stale.status}`);
} catch (e) {
  ok(false, "unexpected error", e.stack || e.message);
} finally {
  console.log("\n  CLEANUP");
  if (X) await q(`delete from public.companies where id = $1`, [X]).catch((e) => ok(false, "cleanup", e.message));
}
ok(!(await one(`select 1 x from public.companies where slug = $1`, [`zz-a06-${RUN}`])), "throwaway company, its release and its draft removed");
await pgc.end();
console.log(`\n  profile-suggestions-live (staging): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
