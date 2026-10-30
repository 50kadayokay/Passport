// Verification for 0061a_table_privilege_hardening.sql — READ-MOSTLY, anon only.
//
// Runs the ANON half of the matrix with the publishable key, which is what any
// browser already holds: no privileged credential is used or needed, and none
// may ever be added here. The investor / owner / staff rows of the matrix need
// real sessions and are listed as manual steps at the end rather than faked,
// because a test that pretends to prove authorization is worse than no test.
//
//   node scripts/privilege-hardening-test.mjs            # before the migration
//   node scripts/privilege-hardening-test.mjs --after    # after it
//
// Exit code is non-zero if any expectation for the selected phase fails.

const AFTER = process.argv.includes("--after");
const URL = process.env.VITE_SUPABASE_URL || "https://rvptronniomlqumjhyrr.supabase.co";
const KEY = process.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_NNxikHZSGZ0CYnzN7jckLg_vPvrRCTl";
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

let pass = 0, fail = 0;
const ok = (n, cond, got) => { cond ? pass++ : fail++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${n}${cond ? "" : `   got: ${got}`}`); };

const get = async (path) => {
  const r = await fetch(`${URL}/rest/v1/${path}`, { headers: H });
  return { status: r.status, body: await r.text() };
};

console.log(`\nAnon matrix — ${AFTER ? "AFTER" : "BEFORE"} 0061a\n`);

// 1. The public investor app must keep working in BOTH phases. This is the
//    single most important assertion in the file: it is the regression that
//    the whole deployment sequence exists to prevent.
const COLS = "id,slug,name,primary_ticker,status,profile,created_at,updated_at,tier,managed_by_admin";
const pub = await get(`companies?slug=eq.kingsmen-resources&select=${COLS}&limit=1`);
ok("public profile readable with the explicit column list", pub.status === 200 && pub.body.startsWith("[{"), `${pub.status} ${pub.body.slice(0,80)}`);

// 2. The two columns.
const own = await get("companies?select=owner_id&limit=1");
const tok = await get("companies?select=preview_token&limit=1");
if (AFTER) {
  ok("anon cannot select owner_id",      own.status === 401 || own.status === 403, `${own.status}`);
  ok("anon cannot select preview_token", tok.status === 401 || tok.status === 403, `${tok.status}`);
  // select=* must now fail — this is EXPECTED, and is exactly why stale
  // browser sessions matter in the deployment plan.
  const star = await get("companies?select=*&limit=1");
  ok("anon select=* now rejected (stale-client tripwire)", star.status !== 200, `${star.status}`);
} else {
  ok("anon CAN select owner_id (pre-state)",      own.status === 200, `${own.status}`);
  ok("anon CAN select preview_token (pre-state)", tok.status === 200, `${tok.status}`);
}

// 3. Row-level isolation must be untouched by a column/grant change.
const drafts = await get("companies?status=neq.published&select=id&limit=1");
ok("anon still sees zero unpublished companies", drafts.body === "[]", drafts.body.slice(0, 60));

// 4. The four tables: anon must reach none of them after.
for (const t of ["company_follows", "post_events", "post_likes", "user_company_relationships"]) {
  const r = await get(`${t}?select=*&limit=1`);
  if (AFTER) ok(`anon denied on ${t}`, r.status === 401 || r.status === 403, `${r.status} ${r.body.slice(0,50)}`);
  else       ok(`${t} reachable or denied (pre-state recorded: ${r.status})`, true);
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
console.log(`MANUAL — these need real sessions and are NOT asserted here:
  investor  : follow + unfollow a company; like + unlike a post; open a release
              (exercises company_follows INSERT/DELETE/SELECT, post_likes, post_events INSERT)
  owner     : open the portal; Messages, Notifications, Analytics all render
  staff     : same as owner via an active company_membership, not ownership
  admin     : admin console still shows preview links (preview_token via own JWT)
  stale tab : a browser left open across the migration — reload recovers it\n`);
process.exit(fail ? 1 : 0);
