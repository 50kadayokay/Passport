// Retire TEST publications on STAGING without breaking the append-only
// revision history (D22 Phase 2).
//
//   node scripts/retire-test-publications.mjs            # dry run: report only
//   node scripts/retire-test-publications.mjs --apply    # do it
//   ... --include-fixture                                # also the reused revision fixture
//
// WHY THIS IS NEEDED. release_revisions is append-only by design: a trigger
// refuses UPDATE and DELETE, so a publication that has ever been corrected can
// never be deleted (the cascade from publications is refused). That is right
// for disclosure records, but test releases pile up. This retires them instead:
//
//   1. published      -> unpublished through unpublish_publication(), as the
//                        company owner, so the lifecycle and outbox stay
//                        consistent (an event is recorded like any unpublish);
//   2. projections    -> removed: feed post (and its notifications and push
//                        queue rows), Mine IQ facts and claims, timeline entry;
//   3. no revisions   -> the publication and its update are DELETED;
//      revisions     -> the publication is KEPT with its full history, marked
//                        content.retired = { at, reason }. release_revisions is
//                        never written to.
//
// SAFETY. Staging only (allowlisted ref). Only publications whose headline
// starts with a known TEST marker are touched -- never a real release. Dry run
// unless --apply. Prints no secrets.

import fs from "node:fs";
import pg from "pg";

const TEST_MARKERS = ["[d22-live]", "[0071-check]", "[d20-live]", "[d23-live]", "[a07-live]"];
const FIXTURE = "[d22-live] revision fixture";
const APPLY = process.argv.includes("--apply");
const INCLUDE_FIXTURE = process.argv.includes("--include-fixture");

const url = (process.env.STAGING_DATABASE_URL || fs.readFileSync("supabase/staging/.connection", "utf8")).trim();
if (url.includes("rvptronniomlqumjhyrr") || !url.includes("jmljfovtfxcdhjmtlnva")) { console.error("  REFUSING: not the allowlisted staging project."); process.exit(2); }

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (s, a) => (await c.query(s, a)).rows;

const pubs = await q(`select p.id, p.company_id, p.update_id, p.status, p.content->>'headline' headline,
    (select count(*)::int from public.release_revisions r where r.publication_id = p.id) revs,
    (select owner_id from public.companies c where c.id = p.company_id) owner,
    (p.content ? 'retired') retired
  from public.publications p
  where ${TEST_MARKERS.map((_, i) => `p.content->>'headline' like $${i + 1}`).join(" or ")}
  order by p.created_at`, TEST_MARKERS.map((m) => `${m.replace(/[%_]/g, "\\$&")}%`));
// Idempotent: a publication already retired (and unpublished) is left alone.
const targets = pubs.filter((p) => (INCLUDE_FIXTURE || !String(p.headline).startsWith(FIXTURE)) && !(p.retired && p.status !== "published"));
console.log(`\n  ${APPLY ? "RETIRING" : "DRY RUN"}: ${targets.length} test publication(s) on staging${INCLUDE_FIXTURE ? "" : " (the reused revision fixture is skipped; --include-fixture to include it)"}`);

let deleted = 0, kept = 0;
for (const p of targets) {
  const plan = [p.status === "published" ? "unpublish" : null, "remove projections", p.revs ? `KEEP (${p.revs} revision${p.revs > 1 ? "s" : ""}: append-only history), mark retired` : "DELETE"].filter(Boolean).join(", ");
  console.log(`   ${p.id.slice(0, 8)}  ${String(p.headline).slice(0, 48).padEnd(48)}  ${p.status.padEnd(9)} -> ${plan}`);
  if (!APPLY) continue;
  await c.query("begin");
  try {
    await c.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
    if (p.status === "published") {
      const r = (await q(`select public.unpublish_publication($1, $2) j`, [p.id, p.owner]))[0].j;
      if (!r || r.ok !== true) throw new Error(`unpublish refused: ${JSON.stringify(r)}`);
    }
    const posts = (await q(`select id from public.posts where publication_id = $1`, [p.id])).map((r) => r.id);
    if (posts.length) {
      await q(`delete from public.notifications where post_id = any($1)`, [posts]);
      await q(`delete from public.notification_outbox where post_id = any($1)`, [posts]);
      await q(`delete from public.posts where id = any($1)`, [posts]);
    }
    await q(`delete from public.facts where publication_id = $1`, [p.id]);
    await q(`delete from public.mineiq_ingestions where publication_id = $1`, [p.id]);
    await q(`update public.companies c set profile = jsonb_set(coalesce(c.profile, '{}'::jsonb), '{timeline}',
               coalesce((select jsonb_agg(e) from jsonb_array_elements(coalesce(c.profile->'timeline', '[]'::jsonb)) e where e->>'key' is distinct from $2), '[]'::jsonb), true)
             where c.id = $1 and c.profile->'timeline' @> jsonb_build_array(jsonb_build_object('key', $2::text))`, [p.company_id, `pub:${p.id}`]);
    if (p.revs === 0) {
      await q(`delete from public.publications where id = $1`, [p.id]);
      if (p.update_id) await q(`delete from public.updates where id = $1 and not exists (select 1 from public.publications where update_id = $1)`, [p.update_id]);
      deleted++;
    } else {
      await q(`update public.publications set content = coalesce(content, '{}'::jsonb) || jsonb_build_object('retired', jsonb_build_object('at', now(), 'reason', 'test fixture retired')) where id = $1`, [p.id]);
      kept++;
    }
    await c.query("commit");
  } catch (e) {
    await c.query("rollback");
    console.error(`     failed, nothing changed for this publication: ${e.message}`);
  }
}
if (APPLY) {
  const revsAfter = (await q(`select count(*)::int n from public.release_revisions r join public.publications p on p.id = r.publication_id where ${TEST_MARKERS.map((_, i) => `p.content->>'headline' like $${i + 1}`).join(" or ")}`, TEST_MARKERS.map((m) => `${m}%`)))[0].n;
  console.log(`\n  deleted ${deleted}; kept ${kept} with their history (release_revisions untouched: ${revsAfter} revision rows remain on kept test publications)`);
}
await c.end();
