// a12 live check -- impressions against the STAGING database (0073a/0073b
// applied there), through PostgREST, signed in as the real fixture users.
//   node scripts/impressions-live-test.mjs
//
// Covers: recording through record_post_impressions() (retired posts refused,
// same-day repeats ignored, one per investor), 12 simultaneous submissions,
// direct REST attempts to inflate (same-day duplicate, backdating, another
// user's id, anon; 0073c: no direct impressions, no client-supplied created_at), the dashboard functions' figures against counts taken
// straight from the table, the recording-start date and the read rate over
// recorded opens only, members-only access, and that the existing reading
// time / saves / breakdown figures are unchanged by impressions.
//
// WRITES (staging only): impression rows and a few open rows for company A's
// posts -- all removed at the end (verified). Prints no secrets.

import fs from "node:fs";

const readEnvFile = (f) => Object.fromEntries(fs.readFileSync(f, "utf8").split("\n").filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }));
const iso = readEnvFile("supabase/staging/.isolation-env"), apiEnv = readEnvFile("supabase/staging/.api-env");
const SB = (iso.ISOLATION_SUPABASE_URL || "").replace(/\/+$/, ""), ANON = iso.ISOLATION_ANON_KEY, SERVICE = apiEnv.STAGING_SUPABASE_SERVICE_ROLE_KEY;
if (!SB || /rvptronniomlqumjhyrr/.test(SB) || !/jmljfovtfxcdhjmtlnva/.test(SB)) { console.error("  refusing: not the staging project"); process.exit(2); }
const A = iso.ISOLATION_COMPANY_A_ID;

const svc = async (path, init = {}) => { const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "content-type": "application/json", ...(init.headers || {}) } }); const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };
const signIn = async (k) => { const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email: iso[`ISOLATION_${k}_EMAIL`], password: iso[`ISOLATION_${k}_PASS`] }) }); const j = r.ok ? await r.json() : null; return j ? { token: j.access_token, id: j.user.id } : null; };
const as = async (user, path, body, prefer = "return=minimal") => { const r = await fetch(`${SB}/rest/v1/${path}`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json", Prefer: prefer, ...(user ? { Authorization: `Bearer ${user.token}` } : {}) }, body: JSON.stringify(body) }); const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { status: r.status, body: j }; };
const record = (user, ids) => as(user, "rpc/record_post_impressions", { p_post_ids: ids });
const rpcAs = (user, fn, args) => as(user, `rpc/${fn}`, args);

let pass = 0, fail = 0, known = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const knownFail = (c, m, why) => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { known++; console.log(`  ✗ ${m}  [KNOWN until 0073c is applied: ${why}]`); } };

const who = {}; for (const k of ["INVESTOR", "INVESTOR_B", "STAFF", "COMPANY_A", "COMPANY_B", "ANALYST"]) who[k] = await signIn(k);
if (Object.values(who).some((v) => !v)) { console.error("  could not sign in all fixture users"); process.exit(4); }
const start = new Date().toISOString();
const posts = await svc(`posts?company_id=eq.${A}&select=id,removed_at`);
const LP = posts.find((p) => !p.removed_at).id, RP = posts.find((p) => p.removed_at).id;
const liveIds = posts.filter((p) => !p.removed_at).map((p) => p.id);
const today = new Date().toISOString().slice(0, 10);
const impressionsToday = async (uid, pid) => (await svc(`post_events?user_id=eq.${uid}&post_id=eq.${pid}&kind=eq.impression&created_at=gte.${today}T00:00:00Z&select=id`)).length;
const createdIds = new Set();
const before = { bt: await rpcAs(who.COMPANY_A, "company_engagement_by_type", { p_company: A, p_days: null }), totals: await rpcAs(who.COMPANY_A, "company_engagement_totals", { p_company: A }) };

console.log(`\n  staging ${new URL(SB).host.split(".")[0]} · impressions (0073a/b applied)`);
try {
  console.log("\n  RECORDING (record_post_impressions)");
  const pre1 = await impressionsToday(who.INVESTOR.id, LP);
  let r = await record(who.INVESTOR, [LP, RP, LP]);
  ok(r.status === 200 && r.body === (pre1 ? 0 : 1) && (await impressionsToday(who.INVESTOR.id, LP)) === 1 && (await impressionsToday(who.INVESTOR.id, RP)) === 0, `investor 1: [live, unpublished, live again] -> ${r.body} new; the unpublished post is REJECTED`);
  r = await record(who.INVESTOR, [LP]);
  ok(r.status === 200 && r.body === 0 && (await impressionsToday(who.INVESTOR.id, LP)) === 1, "the same investor, post and UTC day again -> 0; still exactly one row");
  r = await record(who.INVESTOR_B, [LP]);
  ok(r.status === 200 && (await impressionsToday(who.INVESTOR_B.id, LP)) === 1, "investor 2, same post -> counted once for them too");
  r = await record(who.INVESTOR, Array.from({ length: 51 }, () => LP));
  ok(r.status >= 400, `51 ids in one call -> refused (${r.status})`);
  r = await record(null, [LP]);
  ok(r.status === 401 || r.status === 403 || r.status === 404, `signed out -> refused (${r.status})`);

  console.log("\n  12 SIMULTANEOUS SUBMISSIONS (one investor, one post)");
  const shots = await Promise.all(Array.from({ length: 12 }, () => record(who.STAFF, [LP])));
  const newRows = shots.reduce((a, x) => a + (x.status === 200 ? Number(x.body) : 0), 0);
  ok(shots.every((x) => x.status === 200) && newRows <= 1 && (await impressionsToday(who.STAFF.id, LP)) === 1, `12 at once -> all accepted, ${newRows} new row in total, exactly 1 stored`);

  console.log("\n  DIRECT ATTEMPTS TO INFLATE (PostgREST, as the investor)");
  const direct = (body) => as(who.INVESTOR_B, "post_events", body);
  r = await direct({ post_id: LP, user_id: who.INVESTOR_B.id, kind: "impression" });
  ok(r.status === 403, `a same-day duplicate written directly -> refused by policy (${r.status})`);
  r = await direct({ post_id: LP, user_id: who.INVESTOR.id, kind: "impression" });
  ok(r.status === 403, `an impression in ANOTHER investor's name -> refused (${r.status})`);
  r = await direct({ post_id: LP, user_id: null, kind: "impression" });
  ok(r.status === 403 || r.status === 400, `an impression with no user -> refused (${r.status})`);
  r = await as(null, "post_events", { post_id: LP, user_id: null, kind: "impression" });
  ok(r.status === 401 || r.status === 403, `anon -> refused (${r.status})`);
  r = await direct({ post_id: LP, user_id: who.INVESTOR_B.id, kind: "impression", created_at: "2026-01-15T12:00:00Z" });
  const backdated = await svc(`post_events?user_id=eq.${who.INVESTOR_B.id}&post_id=eq.${LP}&kind=eq.impression&created_at=lt.2026-02-01&select=id`);
  backdated.forEach((x) => createdIds.add(x.id));
  ok(r.status >= 400 && backdated.length === 0, `0073c: a BACKDATED impression written directly is refused (${r.status}, ${backdated.length} stored)`);
  r = await direct({ post_id: LP, user_id: who.INVESTOR_B.id, kind: "impression", created_at: new Date().toISOString() });
  ok(r.status === 403, `0073c: ANY direct impression insert is refused -- impressions only through record_post_impressions() (${r.status})`);

  console.log("\n  DASHBOARD FIGURES vs THE TABLE");
  // A deleted investor's impressions keep their row with user_id = null (on delete
  // set null); count(distinct user_id) ignores them, so the table side does too.
  const imp = await svc(`post_events?post_id=in.(${liveIds.join(",")})&kind=eq.impression&select=user_id,created_at`);
  const allImp = await svc(`post_events?post_id=in.(${posts.map((p) => p.id).join(",")})&kind=eq.impression&select=created_at&order=created_at.asc&limit=1`);
  const first = allImp[0] && allImp[0].created_at;
  const opensSince = (await svc(`post_events?post_id=in.(${liveIds.join(",")})&kind=eq.open&created_at=gte.${encodeURIComponent(first)}&select=id`)).length;
  const sum = (await rpcAs(who.COMPANY_A, "company_impression_summary", { p_company: A, p_days: null })).body[0];
  ok(Date.parse(sum.first_recorded_at) === Date.parse(first), `recording start = the company's first impression row (${String(first).slice(0, 10)})`);
  ok(Number(sum.impressions) === imp.length && Number(sum.viewers) === new Set(imp.map((x) => x.user_id).filter(Boolean)).size && Number(sum.opens_since) === opensSince,
    `summary = table: ${sum.impressions} impressions, ${sum.viewers} viewers, ${sum.opens_since} opens since recording began`, JSON.stringify({ sum, table: { impressions: imp.length, viewers: new Set(imp.map((x) => x.user_id).filter(Boolean)).size, opensSince } }));
  // Opens from BEFORE recording began must not enter the read rate.
  const ago = new Date(Date.parse(first) - 86400e3).toISOString(), after = new Date().toISOString();
  const o1 = await svc("post_events", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ post_id: LP, user_id: who.INVESTOR.id, kind: "open", created_at: ago }) });
  const o2 = await svc("post_events", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ post_id: LP, user_id: who.INVESTOR.id, kind: "open", created_at: after }) });
  [o1[0], o2[0]].forEach((x) => x && createdIds.add(x.id));
  const sum2 = (await rpcAs(who.COMPANY_A, "company_impression_summary", { p_company: A, p_days: null })).body[0];
  ok(Number(sum2.opens_since) === Number(sum.opens_since) + 1, `an open from BEFORE recording began is not in the read rate; one after it is (${sum.opens_since} -> ${sum2.opens_since})`);
  const pi = (await rpcAs(who.COMPANY_A, "company_post_impressions", { p_company: A, p_days: 1 })).body;
  const lpRow = pi.find((x) => x.post_id === LP);
  ok(lpRow && Number(lpRow.impressions) === (await svc(`post_events?post_id=eq.${LP}&kind=eq.impression&select=id`)).length && !pi.find((x) => x.post_id === RP), "per post: matches the table; the unpublished post is not listed");

  console.log("\n  ACCESS");
  for (const k of ["COMPANY_A", "STAFF", "ANALYST"]) { const x = await rpcAs(who[k], "company_impression_summary", { p_company: A, p_days: null }); ok(x.status === 200, `${k} (member of A): reads A's impressions`); }
  for (const k of ["COMPANY_B", "INVESTOR"]) { const x = await rpcAs(who[k], "company_impression_summary", { p_company: A, p_days: null }); ok(x.status >= 400 && !Array.isArray(x.body), `${k}: refused (${x.status})`); }
  { const x = await rpcAs(null, "company_post_impressions", { p_company: A, p_days: 30 }); ok(x.status >= 400, `anon: refused (${x.status})`); }

  console.log("\n  EXISTING METRICS UNCHANGED BY IMPRESSIONS");
  const btAfter = await rpcAs(who.COMPANY_A, "company_engagement_by_type", { p_company: A, p_days: null });
  const strip = (rows) => JSON.stringify((rows.body || []).map((r) => ({ ...r, reads: undefined })));
  ok(strip(btAfter) === strip(before.bt), "reading time, likes, saves and save presses per type: identical (only the test's +1 open differs)");
  const tAfter = await rpcAs(who.COMPANY_A, "company_engagement_totals", { p_company: A });
  const t0 = before.totals.body[0], t1 = tAfter.body[0];
  ok(t1.avg_dwell_secs === t0.avg_dwell_secs && t1.saves === t0.saves && t1.likes === t0.likes && Number(t1.views) === imp.length, `totals: dwell/saves/likes unchanged; views now the de-duplicated impressions (${t1.views})`);
  // After the "unchanged" comparison: these legitimately add a dwell and a save press.
  console.log("\n  NO CLIENT-SUPPLIED HISTORY (opens, reading time) -- and legitimate events still record");
  for (const [kind, value] of [["open", null], ["dwell", 42000]]) {
    const before1 = Date.now();
    r = await direct({ post_id: LP, user_id: who.INVESTOR_B.id, kind, value, created_at: "2026-01-15T12:00:00Z" });
    const rows = await svc(`post_events?user_id=eq.${who.INVESTOR_B.id}&post_id=eq.${LP}&kind=eq.${kind}&created_at=gte.${encodeURIComponent(start)}&select=id,created_at,value`);
    rows.forEach((x) => createdIds.add(x.id));
    const old = await svc(`post_events?user_id=eq.${who.INVESTOR_B.id}&post_id=eq.${LP}&kind=eq.${kind}&created_at=lt.2026-02-01&select=id`);
    old.forEach((x) => createdIds.add(x.id));
    ok(r.status === 201 && rows.length === 1 && Math.abs(Date.parse(rows[0].created_at) - before1) < 120e3 && old.length === 0,
      `a '${kind}' sent with created_at 2026-01-15 is RECORDED (legitimate event) but stamped NOW by the database (${rows[0] ? rows[0].created_at.slice(0, 19) : "none"})`);
  }
  r = await direct({ post_id: LP, user_id: who.INVESTOR_B.id, kind: "save" });
  const sv = await svc(`post_events?user_id=eq.${who.INVESTOR_B.id}&post_id=eq.${LP}&kind=eq.save&created_at=gte.${encodeURIComponent(start)}&select=id`);
  sv.forEach((x) => createdIds.add(x.id));
  ok(r.status === 201 && sv.length === 1, "a feed save press (the app's own write) still records");

} catch (e) {
  ok(false, "unexpected error", e.stack || e.message);
} finally {
  const mine = await svc(`post_events?post_id=in.(${posts.map((p) => p.id).join(",")})&created_at=gte.${encodeURIComponent(start)}&select=id`);
  mine.forEach((x) => createdIds.add(x.id));
  if (createdIds.size) await svc(`post_events?id=in.(${[...createdIds].join(",")})`, { method: "DELETE" });
  const left = createdIds.size ? (await svc(`post_events?id=in.(${[...createdIds].join(",")})&select=id`)).length : 0;
  console.log(`\n  cleanup: ${createdIds.size} test rows removed, ${left} left`);
  if (left) fail++;
}
console.log(`  impressions-live (staging): ${pass} passed, ${fail} failed${known ? `, ${known} KNOWN` : ""}\n`);
process.exit(fail ? 1 : 0);
