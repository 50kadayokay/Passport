// Conference Mode entitlement: a failed lookup is reported, never silent
// (S3 a28 review: my_features failing while company_features succeeds showed a
// paying customer the sales page with no notice).   node scripts/conference-entitlement-test.mjs
// OFFLINE: src/lib/conference.js with the session and PostgREST stubbed.
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
store.set("pp.session", JSON.stringify({ access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.x", refresh_token: "r", expires_at: Date.now() + 3600e3, user: { id: "u1" } }));
let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
let F = { status: 200, body: [] }, R = { status: 200, body: [] };
globalThis.fetch = async (u) => {
  const x = String(u).includes("/rpc/my_features") ? F : R;
  if (x.throws) throw new TypeError("network");
  return { status: x.status, ok: x.status === 200, json: async () => x.body };
};
const { conferenceEntitlement, STATE } = await import("../src/lib/conference.js");
const CO = "11111111-1111-4111-8111-111111111111";
const run = async (f, r) => { F = f; R = r; return conferenceEntitlement(CO); };
let e = await run({ status: 200, body: ["conference_mode"] }, { status: 200, body: [{ enabled: true, note: "", created_at: "2026-01-01" }] });
ok(e.state === STATE.ACTIVE && !e.error, "entitled -> active, no notice");
e = await run({ status: 200, body: [] }, { status: 200, body: [] });
ok(e.state === STATE.NONE && !e.error, "never bought -> sales page, no notice");
e = await run({ status: 200, body: [] }, { status: 200, body: [{ enabled: false, note: "paused" }] });
ok(e.state === STATE.INACTIVE && !e.error, "switched off -> inactive");
e = await run({ status: 500, body: null }, { status: 200, body: [{ enabled: true, note: "", created_at: "2026-01-01" }] });
ok(e.state !== STATE.ACTIVE && /could not be confirmed/.test(e.error), "my_features fails, override row present -> not unlocked, but the customer is TOLD (the reproduced defect)", JSON.stringify(e));
e = await run({ throws: true }, { status: 200, body: [] });
ok(e.state === STATE.NONE && /could not be confirmed/.test(e.error), "my_features network error -> notice shown");
e = await run({ status: 200, body: [{ my_features: "conference_mode" }] }, { status: 500, body: null });
ok(e.state === STATE.ACTIVE && /could not be confirmed/.test(e.error), "object-shaped rows still understood; override read failing is reported");
ok((await conferenceEntitlement(null)).state === STATE.NONE, "no company -> none");
console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
