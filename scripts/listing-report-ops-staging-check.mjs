// The listing-report cap alert against STAGING's real 0093 tables.
//   node scripts/listing-report-ops-staging-check.mjs
//
// FOR S4 TO RUN (needs supabase/staging/.connection and 0093 APPLIED on staging).
// It COMMITS, and restores exactly:
//   1. snapshot listing_report_limits and every 0093 counter in submission_throttle
//   2. lower global_per_window to (this window's global count + 4)
//   3. four anon reports (simulated PostgREST: role anon, gateway headers, the
//      json_to_recordset insert) are stored; the fifth is refused PT429 "right now"
//   4. api/_listingReportOps.js's listingReportStatus() -- the exact code /api/ops
//      runs, its service-role PostgREST reads answered from the same database --
//      reports capHit, globalCount = globalLimit, and 0093's own window start
//   5. with the limit raised to floor(count / 0.8) -- above the count, and the
//      count still >= 80% of it (possible because the count is at least 4): warn,
//      not capHit
//   6. restore: the limits row, every 0093 counter (deleted / recounted / re-added
//      by primary key, then compared), and this run's report rows deleted
// Prints counts and booleans only; no keys, no addresses.
import fs from "node:fs";
import pg from "pg";

const url = fs.readFileSync("supabase/staging/.connection", "utf8").trim();
if (url.includes("rvptronniomlqumjhyrr") || !url.includes("jmljfovtfxcdhjmtlnva")) { console.error("  REFUSING: not the staging project."); process.exit(2); }

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (s, a) => (await c.query(s, a)).rows;

// /api/ops reads through serviceRest (PostgREST, service role). Answer those reads
// from the database instead, for exactly the two tables and filters it uses.
const SB = "https://staging-db.invalid";
Object.assign(process.env, { VITE_SUPABASE_URL: SB, VITE_SUPABASE_ANON_KEY: "sb_publishable_offline_stub_key", SUPABASE_SERVICE_ROLE_KEY: "stub-service-key" });
delete process.env.MINEEX_ENV;
const COLS = /^[a-z_]+(,[a-z_]+)*$/;
globalThis.fetch = async (input) => {
  const u = new URL(String(input));
  if (u.origin !== SB) throw new Error(`unexpected egress to ${u.host}`);
  const table = u.pathname.replace("/rest/v1/", "");
  if (!["listing_report_limits", "submission_throttle"].includes(table)) throw new Error(`unexpected read of ${table}`);
  const where = [], args = [];
  let select = "*", order = "", limit = "";
  for (const [k, v] of u.searchParams) {
    if (k === "select") { if (!COLS.test(v)) throw new Error("select"); select = v; continue; }
    if (k === "order") { const [col, dir] = v.split("."); if (!/^[a-z_]+$/.test(col)) throw new Error("order"); order = ` order by ${col} ${dir === "desc" ? "desc" : "asc"}`; continue; }
    if (k === "limit") { limit = ` limit ${Number(v) | 0}`; continue; }
    if (!/^[a-z_]+$/.test(k)) throw new Error("filter");
    const i = v.indexOf("."), op = v.slice(0, i), x = v.slice(i + 1);
    args.push(x);
    const cast = k === "window_start" ? "::timestamptz" : k === "count" ? "::int" : k === "id" ? "::boolean" : "";
    if (op === "eq") where.push(`${k} = $${args.length}${cast}`);
    else if (op === "gte") where.push(`${k} >= $${args.length}${cast}`);
    else throw new Error(`operator ${op}`);
  }
  const rows = await q(`select ${select} from public.${table}${where.length ? ` where ${where.join(" and ")}` : ""}${order}${limit}`, args);
  for (const r of rows) if (r.window_start instanceof Date) r.window_start = r.window_start.toISOString();
  return new Response(JSON.stringify(rows), { status: 200, headers: { "content-type": "application/json" } });
};
const { listingReportStatus, FORMS, GLOBAL_KEY } = await import("../api/_listingReportOps.js");

const applied = (await q(`select to_regprocedure('public.listing_reports_guard()') is not null a`))[0].a;
if (!applied) { console.error("  0093 is not applied on staging; nothing to check."); process.exit(3); }

const OURS = Object.values(FORMS);
const TAG = `zz-lrops-${Date.now().toString(36)}`;
const snap = async () => new Map((await q(`select ip_hash, form, window_start::text ws, count from public.submission_throttle where form = any($1)`, [OURS])).map((r) => [`${r.ip_hash}|${r.form}|${r.ws}`, r]));
const S0 = await snap();
const [L0] = await q(`select * from public.listing_report_limits where id`);
const rowsBefore = (await q(`select count(*)::int n from public.listing_reports`))[0].n;
const globalNow = async () => (await q(`select coalesce((select count from public.submission_throttle where ip_hash = $1 and form = $2 and window_start = to_timestamp(floor(extract(epoch from now()) / ($3 * 60)) * ($3 * 60))), 0)::int n`, [GLOBAL_KEY, FORMS.global, L0.global_window_minutes]))[0].n;
const dbWindow = (await q(`select to_timestamp(floor(extract(epoch from now()) / ($1 * 60)) * ($1 * 60)) w`, [L0.global_window_minutes]))[0].w.toISOString();
const report = async (ip) => {
  const k = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await k.connect();
  try {
    await k.query("begin");
    await k.query(`select set_config('request.jwt.claims', $1, true), set_config('request.headers', $2, true)`, [JSON.stringify({ role: "anon" }), JSON.stringify({ "cf-connecting-ip": ip, "x-forwarded-for": ip })]);
    await k.query("set local role anon");
    await k.query(`insert into public.listing_reports (company_slug, company_name, kind, message, contact, user_id)
      select b.company_slug, b.company_name, b.kind, b.message, b.contact, b.user_id
      from json_to_recordset(json_build_array($1::json)) as b(company_slug text, company_name text, kind text, message text, contact text, user_id uuid)`,
      [JSON.stringify({ company_slug: TAG, company_name: "Zz ops check", kind: "error", message: "listing-report ops staging check", contact: "", user_id: null })]);
    await k.query("commit");
    return { ok: true };
  } catch (e) { await k.query("rollback").catch(() => {}); return { ok: false, code: e.code, msg: e.message }; }
  finally { await k.end(); }
};

try {
  const g0 = await globalNow();
  const FILL = 4;   // >= 4, so floor(count / 0.8) > count: a limit exists that is >= 80% full but not hit
  const limit = g0 + FILL;
  await q(`update public.listing_report_limits set global_per_window = $1 where id`, [limit]);
  console.log(`\n  CAP LOWERED to this window's count + ${FILL} (${limit})`);
  const res = [];
  for (let i = 0; i <= FILL; i++) res.push(await report(`198.18.${100 + i}.${7 + i}`));
  ok(res.slice(0, FILL).every((r) => r.ok), `${FILL} reports from ${FILL} networks are stored`, JSON.stringify(res.slice(0, FILL)));
  ok(!res[FILL].ok && res[FILL].code === "PT429" && /right now/.test(res[FILL].msg), `the ${FILL + 1}th is refused by the GLOBAL cap (PT429, "right now")`, `${res[FILL].code} ${res[FILL].msg}`);
  ok((await globalNow()) === limit, `the window's global counter equals the limit (${limit}): the refusal left no trace`);

  console.log("\n  WHAT /api/ops REPORTS");
  let s = await listingReportStatus();
  ok(s.available && s.capHit === true && s.globalCount === limit && s.globalLimit === limit, "capHit, with globalCount = globalLimit", JSON.stringify({ available: s.available, capHit: s.capHit, globalCount: s.globalCount, globalLimit: s.globalLimit }));
  ok(s.windowStart === dbWindow, "windowStart is the window 0093 wrote (same bucket arithmetic as the guard)", `${s.windowStart} vs ${dbWindow}`);
  const raised = Math.floor(limit / 0.8);   // > limit (limit >= 4), and limit / raised >= 0.8
  await q(`update public.listing_report_limits set global_per_window = $1 where id`, [raised]);
  s = await listingReportStatus();
  ok(raised > limit && s.capHit === false && s.warn === true, `limit raised to ${raised}: ${limit} of ${raised} (${Math.round((limit / raised) * 100)}%) warns, not capHit`);
} catch (e) {
  ok(false, "unexpected error", e.stack || e.message);
} finally {
  // Restore exactly: the limits row, every 0093 counter, this run's report rows.
  const cols = Object.keys(L0).filter((k) => k !== "id");
  await q(`update public.listing_report_limits set ${cols.map((k, i) => `${k} = $${i + 1}`).join(", ")} where id`, cols.map((k) => L0[k]));
  await q(`delete from public.listing_reports where company_slug = $1`, [TAG]);
  const now = await snap();
  for (const [k, r] of now) {
    if (!S0.has(k)) await q(`delete from public.submission_throttle where ip_hash = $1 and form = $2 and window_start = $3::timestamptz`, [r.ip_hash, r.form, r.ws]);
    else if (S0.get(k).count !== r.count) await q(`update public.submission_throttle set count = $4 where ip_hash = $1 and form = $2 and window_start = $3::timestamptz`, [r.ip_hash, r.form, r.ws, S0.get(k).count]);
  }
  for (const [k, r] of S0) if (!now.has(k)) await q(`insert into public.submission_throttle (ip_hash, form, window_start, count) values ($1, $2, $3::timestamptz, $4)`, [r.ip_hash, r.form, r.ws, r.count]);
  const after = await snap();
  ok(after.size === S0.size && [...S0].every(([k, r]) => after.has(k) && after.get(k).count === r.count), `restored: every 0093 counter is as it was (${S0.size} rows)`);
  const [L1] = await q(`select * from public.listing_report_limits where id`);
  ok(JSON.stringify(L1) === JSON.stringify(L0), "restored: the limits row is as it was");
  ok((await q(`select count(*)::int n from public.listing_reports`))[0].n === rowsBefore, "restored: this run's report rows are gone");
  await c.end();
}
console.log(`\n  listing-report-ops (staging): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
