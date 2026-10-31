// F9: READ-ONLY snapshot of company_subscriptions, companies.tier and the
// entitlement matrix on STAGING, to prove migration 0069b changed none of them.
//   node scripts/stripe-subs-snapshot.mjs <out.json>      (then diff two snapshots)
import fs from "node:fs"; import pg from "pg";
const url = fs.readFileSync("supabase/staging/.connection", "utf8").trim();
if (!url.includes("jmljfovtfxcdhjmtlnva") || url.includes("rvptronniomlqumjhyrr")) process.exit(2);
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } }); await c.connect();
await c.query("begin read only");
const subs = (await c.query(`select company_id, plan_id, status, started_at, renews_at, note, updated_at from public.company_subscriptions order by company_id`)).rows;
const ent = (await c.query(`select s.company_id, f.id as feature, public.company_has_feature(s.company_id, f.id) as has
  from public.company_subscriptions s cross join public.features f order by 1, 2`)).rows;
const tiers = (await c.query(`select id, tier from public.companies where id in (select company_id from public.company_subscriptions) order by id`)).rows;
await c.query("rollback"); await c.end();
const out = JSON.stringify({ subs, ent, tiers });
fs.writeFileSync(process.argv[2], out);
console.log(`subscriptions: ${subs.length} rows; entitlement cells: ${ent.length} (${ent.filter((e) => e.has).length} granted); companies: ${tiers.length}`);
