// READ-ONLY snapshot of the publishing state on STAGING, to prove a migration
// changed nothing it should not have.
//   node scripts/publishing-snapshot.mjs <out.json>
//   node scripts/publishing-snapshot.mjs --compare <before.json> <after.json>
//
// Captures (in a read-only transaction): publications (id, status, content
// digest), events by type, deliveries by listener and status, listener
// subscriptions, every company's timeline digest, posts (count + columns),
// release_revisions count, company_subscriptions + entitlement matrix, and the
// digests of the publishing functions. No content or user identity is output.

import fs from "node:fs";
import crypto from "node:crypto";
import pg from "pg";

const md5 = (v) => crypto.createHash("md5").update(JSON.stringify(v ?? null)).digest("hex");

if (process.argv[2] === "--compare") {
  const a = JSON.parse(fs.readFileSync(process.argv[3], "utf8")), b = JSON.parse(fs.readFileSync(process.argv[4], "utf8"));
  const diff = [];
  for (const k of Object.keys(a)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) diff.push(k);
  for (const k of Object.keys(b)) if (!(k in a)) diff.push(`${k} (new)`);
  console.log(diff.length ? `CHANGED: ${diff.join(", ")}` : "IDENTICAL");
  process.exit(0);
}

const url = (process.env.STAGING_DATABASE_URL || fs.readFileSync("supabase/staging/.connection", "utf8")).trim();
if (url.includes("rvptronniomlqumjhyrr") || !url.includes("jmljfovtfxcdhjmtlnva")) { console.error("  REFUSING: not the allowlisted staging project."); process.exit(2); }
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query("begin read only");
const q = async (s) => (await c.query(s)).rows;
const snap = {
  publications: (await q(`select id, status, publish_seq, md5(coalesce(content::text,'')) d from public.publications order by id`)),
  events_by_type: await q(`select event_type, count(*)::int n from public.events group by 1 order by 1`),
  deliveries: await q(`select listener, status, count(*)::int n from public.event_deliveries group by 1, 2 order by 1, 2`),
  subscriptions: await q(`select listener, event_type from public.listener_subscriptions order by 1, 2`),
  timelines: (await q(`select id, md5(coalesce(profile->'timeline','[]'::jsonb)::text) d from public.companies where profile ? 'timeline' order by id`)),
  posts: await q(`select count(*)::int n, count(*) filter (where removed_at is null)::int live from public.posts`),
  posts_digest: md5(await q(`select id, publication_id, title, removed_at from public.posts order by id`)),
  revisions: await q(`select count(*)::int n from public.release_revisions`),
  company_subscriptions: md5(await q(`select company_id, plan_id, status, renews_at, note from public.company_subscriptions order by company_id`)),
  entitlements: md5(await q(`select s.company_id, f.id, public.company_has_feature(s.company_id, f.id) h from public.company_subscriptions s cross join public.features f order by 1, 2`)),
  functions: await q(`select p.proname, pg_get_function_identity_arguments(p.oid) a, md5(pg_get_functiondef(p.oid)) d from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname in ('publish_publication','unpublish_publication','revise_publication','claim_deliveries','complete_delivery','upsert_timeline_entry','actor_can_publish') order by 1, 2`),
};
await c.query("rollback");
await c.end();
snap.publications = { count: snap.publications.length, digest: md5(snap.publications) };
snap.timelines = { count: snap.timelines.length, digest: md5(snap.timelines) };
fs.writeFileSync(process.argv[2], JSON.stringify(snap, null, 1));
console.log(`publications ${snap.publications.count}; events ${snap.events_by_type.map((e) => `${e.event_type}=${e.n}`).join(" ")}; deliveries rows ${snap.deliveries.reduce((n, d) => n + d.n, 0)}; subscriptions ${snap.subscriptions.length}; timelines ${snap.timelines.count}; posts ${snap.posts[0].n}; revisions ${snap.revisions[0].n}`);
