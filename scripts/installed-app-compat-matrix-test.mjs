// Offline test: docs/INSTALLED-APP-COMPATIBILITY-MATRIX.md agrees with the migration SQL.
//   node scripts/installed-app-compat-matrix-test.mjs
// Contacts nothing. Reads the migration files, the rollout plan, the matrix doc
// and (when the tags are in this clone) the shipped builds' source via `git show`.
//
// 1. Phases come from the rollout plan's migration-order table, so a migration
//    moved between phases moves its effect between matrix columns.
// 2. A small grant model replays every pending GRANT/REVOKE on the tables the
//    installed app writes, phase by phase, and checks each installed call's
//    privilege needs (an upsert with merge-duplicates needs UPDATE; return=
//    representation needs SELECT). Its verdict must match the matrix cell:
//    denied = ❌, allowed = ✅ or ⚠️.
// 3. Rows the grant model cannot decide (policies, functions, storage, API) get
//    a targeted assertion against the SQL or the deployed source.
// 4. The installed call shapes (headers, columns, kinds) are frozen below and,
//    when the tag exists, checked against prod-v1.3.2 and the older builds.
import fs from "node:fs";
import { execFileSync } from "node:child_process";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log(`FAIL  ${m}`); } };
const read = (f) => fs.readFileSync(f, "utf8");
const MIG = "supabase/migrations";
const files = fs.readdirSync(MIG).filter((f) => f.endsWith(".sql"));
const sqlOf = (m) => { const f = files.find((x) => x.startsWith(m + "_")); if (!f) throw new Error(`no migration ${m}`); return read(`${MIG}/${f}`).replace(/--[^\n]*/g, ""); };

// ---- the installed builds' call shapes (frozen; re-verified in part 4) ---------------
// Native 1.0 (dff4f8d), 1.1 (c1bf1b7), 1.3.1 (9761492) and 1.3.2 (prod-v1.3.2).
const INSTALLED = {
  postEventKinds: ["open", "dwell", "like", "save"],
  reportKinds: ["error", "claim"],
  reportBodyIsArray: false,
  snippets: [
    { file: "src/lib/feed.js", what: "follow() POSTs company_follows with merge-duplicates (needs UPDATE)",
      re: /rest\/v1\/company_follows`,\s*\{\s*method: "POST",\s*headers: \{[^}]*Prefer: "resolution=merge-duplicates,return=minimal"/ },
    { file: "src/lib/feed.js", what: "post_events: one row { post_id, user_id, kind, value }, return=minimal",
      re: /rest\/v1\/post_events`,\s*\{\s*method: "POST",[^}]*Prefer: "return=minimal" \},\s*body: JSON\.stringify\(\{ post_id: postId, user_id: u\.id, kind, value \}\)/ },
    { file: "src/lib/investorData.js", what: "post_likes insert uses ignore-duplicates (no UPDATE)",
      re: /post_likes\?on_conflict=user_id,company_slug,post_key", headers, \{\s*method: "POST", prefer: "resolution=ignore-duplicates,return=minimal"/ },
    { file: "src/lib/investorData.js", what: "user_company_relationships upsert uses merge-duplicates + return=representation",
      re: /user_company_relationships\?on_conflict=user_id,company_slug", headers, \{\s*method: "POST", prefer: "resolution=merge-duplicates,return=representation"/ },
    { file: "src/aiBrief/PassportProto.jsx", what: "listing report: anon key, return=minimal, one object with the six granted columns",
      re: /rest\/v1\/listing_reports`, \{\s*method: "POST",\s*headers: \{ apikey: SUPABASE_ANON, Authorization: `Bearer \$\{SUPABASE_ANON\}`, "Content-Type": "application\/json", Prefer: "return=minimal" \},\s*body: JSON\.stringify\(\{ company_slug: slug, company_name: name, kind, message: message\.trim\(\), contact: contact\.trim\(\), user_id: uid \}\)/ },
    { file: "src/aiBrief/PassportProto.jsx", what: "listing report kinds are 'error' | 'claim'",
      re: /useState\("error"\); \/\/ 'error' \| 'claim'/ },
    { file: "src/aiBrief/PassportProto.jsx", what: "send: POST ${API_BASE}/api/messages { companySlug, body } with the Bearer session",
      re: /fetch\(`\$\{API_BASE\}\/api\/messages`, \{\s*method: "POST",\s*headers: \{ "content-type": "application\/json", Authorization: `Bearer \$\{token\}` \},\s*body: JSON\.stringify\(\{ companySlug: id, body: text \}\)/ },
    { file: "src/aiBrief/PassportProto.jsx", what: "no build sends an 'impression' post_event",
      re: /^(?![\s\S]*recordPostEvent\([^)]*"impression")/ },
    { file: "src/main.jsx", what: "the /p/<id> page (the only FollowButton) is a path route; the native shell boots at /",
      re: /const isPost = \/\^\\\/p\\\/\[\^\/\]\+\/\.test\(path\);[\s\S]*const isApp = isNativeApp \|\|/ },
    { file: "src/aiBrief/PassportProto.jsx", what: "the in-app screens never render the company_follows FollowButton",
      re: /^(?![\s\S]*FollowButton)/ },
    { file: "src/lib/platform.js", what: "native API_BASE is the production deployment",
      re: /API_BASE = isNativeApp \? "https:\/\/passport-xi-five\.vercel\.app" : ""/ },
    { file: "src/main.jsx", builds: ["prod-v1.3.2"], what: "manage mode reads the caller's own company_memberships role",
      re: /rest\/v1\/company_memberships\?company_id=eq\.\$\{rows\[0\]\.id\}&user_id=eq\.\$\{me\.id\}&status=eq\.active&select=role&limit=1/ },
    { file: "src/aiBrief/PassportProto.jsx", builds: ["prod-v1.3.2"], what: "the owner editor uploads to company-media and PATCHes companies.profile directly",
      re: /uploadCompanyMedia\(f\.avatarFile\)[\s\S]{0,1200}updateCompanyProfile\(coId, profile\)/ },
    { file: "src/lib/push.js", builds: ["prod-v1.3.2"], what: "push registers through claim_push_token",
      re: /rest\/v1\/rpc\/claim_push_token/ },
    { file: "src/lib/push.js", builds: ["9761492"], what: "1.3.1 push upserts push_tokens directly",
      re: /rest\/v1\/push_tokens\?on_conflict=user_id,token/ },
  ],
};

// ---- phases, from the authoritative rollout table ---------------------------------
const plan = read("docs/PRODUCTION-ROLLOUT-PLAN.md");
const order = plan.slice(plan.indexOf("<!-- migration-order:start -->"), plan.indexOf("<!-- migration-order:end -->"));
const PHASE = {};
for (const m of order.matchAll(/^\|\s*\d+\s*\|\s*`(\d{4}[a-z]?)_[^`]+\.sql`\s*\|\s*(3|4|5|5b)\s*\|/gm)) PHASE[m[1]] = m[2];
const COLS = ["a", "b", "c", "d", "e"];                // a = after deploy, b..e = after Phase 3, 4, 5, 5b
const COL_PHASE = { b: "3", c: "4", d: "5", e: "5b" };
const PHASE_RANK = { "3": 1, "4": 2, "5": 3, "5b": 4 };
const pending = Object.keys(PHASE).sort((x, y) => PHASE_RANK[PHASE[x]] - PHASE_RANK[PHASE[y]] || order.indexOf(`\`${x}_`) - order.indexOf(`\`${y}_`));
ok(pending.length >= 30, `rollout plan lists the pending migrations (${pending.length})`);
const inPhaseOrEarlier = (m, col) => col !== "a" && PHASE[m] && PHASE_RANK[PHASE[m]] <= PHASE_RANK[COL_PHASE[col]];
const allPendingSql = pending.map((m) => [m, sqlOf(m)]);
const mentions = (re) => allPendingSql.filter(([, s]) => re.test(s)).map(([m]) => m);

// ---- grant model ---------------------------------------------------------------
const ALL7 = ["select", "insert", "update", "delete", "truncate", "references", "trigger"];
const MODEL_TABLES = ["company_follows", "post_events", "post_likes", "user_company_relationships", "listing_reports"];
// Production's starting grants on these tables (0061a's header; 0058's header:
// "listing_reports only ever had INSERT").
const baseline = () => ({
  company_follows: { anon: new Set(ALL7), authenticated: new Set(ALL7) },
  post_events: { anon: new Set(ALL7), authenticated: new Set(ALL7) },
  post_likes: { anon: new Set(), authenticated: new Set(ALL7) },
  user_company_relationships: { anon: new Set(), authenticated: new Set(ALL7) },
  listing_reports: { anon: new Set(["insert"]), authenticated: new Set(["insert"]) },
  cols: {},                                              // "table|role|priv" -> Set(cols)
});
function apply(state, sql) {
  const roles = (s) => s.split(",").map((r) => r.trim()).filter((r) => r === "anon" || r === "authenticated");
  const tablesIn = (s) => [...s.matchAll(/public\.([a-z_0-9]+)/g)].map((m) => m[1]).filter((t) => MODEL_TABLES.includes(t));
  for (const st of sql.split(";")) {
    const s = st.replace(/\s+/g, " ").trim().toLowerCase();
    let m;
    if ((m = s.match(/^revoke (.+?) on (?:table )?(public\.[a-z_0-9, .]+?) from (.+)$/))) {
      const privs = m[1] === "all" || m[1] === "all privileges" ? ALL7 : m[1].split(",").map((p) => p.trim());
      for (const t of tablesIn(m[2])) for (const r of roles(m[3])) {
        privs.forEach((p) => state[t][r].delete(p));
        for (const p of privs) delete state.cols[`${t}|${r}|${p}`];   // a table-level REVOKE drops column grants too
      }
    } else if ((m = s.match(/^grant (.+?) on (?:table )?(public\.[a-z_0-9]+) to (.+)$/))) {
      for (const t of tablesIn(m[2])) for (const r of roles(m[3])) {
        for (const part of m[1].match(/[a-z]+(?: \([^)]*\))?/g) || []) {
          const pm = part.match(/^([a-z]+)(?: \(([^)]*)\))?$/);
          if (!pm) continue;
          if (pm[2]) { const k = `${t}|${r}|${pm[1]}`; state.cols[k] = new Set([...(state.cols[k] || []), ...pm[2].split(",").map((c) => c.trim())]); }
          else if (pm[1] === "all") ALL7.forEach((p) => state[t][r].add(p));
          else state[t][r].add(pm[1]);
        }
      }
    }
  }
  return state;
}
const stateAt = (col) => { const s = baseline(); for (const [m, sql] of allPendingSql) if (inPhaseOrEarlier(m, col)) apply(s, sql); return s; };
const STATES = Object.fromEntries(COLS.map((c) => [c, stateAt(c)]));
const has = (state, t, r, p, cols) => state[t][r].has(p) || (cols && cols.length > 0 && cols.every((c) => (state.cols[`${t}|${r}|${p}`] || new Set()).has(c)));

// Installed calls the grant model decides. needs: [privilege, columns?]. Cited from prod-v1.3.2.
const GRANT_ROWS = {
  I10: { t: "user_company_relationships", r: "authenticated", needs: [["insert", ["user_id", "company_slug"]], ["update", ["user_id", "company_slug"]], ["select"], ["delete"]] },
  I11: { t: "post_likes", r: "authenticated", needs: [["insert", ["user_id", "company_slug", "post_key"]], ["select"], ["delete"]] },
  I12: { t: "company_follows", r: "authenticated", needs: [["insert", ["user_id", "company_id"]], ["update", ["user_id", "company_id"]]] },
  I13: { t: "company_follows", r: "authenticated", needs: [["select"], ["delete"]] },
  I14: { t: "post_events", r: "authenticated", needs: [["insert", ["post_id", "user_id", "kind", "value"]]] },
  I15: { t: "listing_reports", r: "anon", needs: [["insert", ["company_slug", "company_name", "kind", "message", "contact", "user_id"]]] },
};

// ---- the matrix doc --------------------------------------------------------------
const doc = read("docs/INSTALLED-APP-COMPATIBILITY-MATRIX.md");
const block = (name) => { const a = doc.indexOf(`<!-- ${name}:start -->`), b = doc.indexOf(`<!-- ${name}:end -->`); ok(a > 0 && b > a, `doc has the ${name} block`); return doc.slice(a, b); };
const parseRows = (txt) => {
  const rows = {};
  for (const line of txt.split("\n")) {
    const c = line.split("|").map((x) => x.trim());
    if (!/^[IW]\d\d$/.test(c[1] || "")) continue;
    rows[c[1]] = { call: c[2], cells: Object.fromEntries(COLS.map((k, i) => [k, c[3 + i]])) };
  }
  return rows;
};
const ROWS = parseRows(block("matrix"));
const WEB = parseRows(block("web-matrix"));
const sym = (cell) => (cell || "").match(/✅|⚠️|❌/)?.[0] || null;
for (const [id, r] of Object.entries({ ...ROWS, ...WEB })) for (const k of COLS) ok(sym(r.cells[k]), `${id} column (${k}) has a verdict (${r.cells[k]})`);

// 2. grant-model rows.
for (const [id, g] of Object.entries(GRANT_ROWS)) {
  ok(ROWS[id], `matrix has row ${id}`);
  if (!ROWS[id]) continue;
  for (const k of COLS) {
    const missing = g.needs.filter(([p, cols]) => !has(STATES[k], g.t, g.r, p, cols)).map(([p]) => p);
    const s = sym(ROWS[id].cells[k]);
    if (missing.length) ok(s === "❌", `${id} (${k}): ${g.r} lacks ${missing.join("+")} on ${g.t}, so the cell must be ❌ (is ${ROWS[id].cells[k]})`);
    else ok(s === "✅" || s === "⚠️", `${id} (${k}): ${g.r} has what it needs on ${g.t}, so the cell must not be ❌ (is ${ROWS[id].cells[k]})`);
  }
}
// The one break: what revokes it, and the fix that would close it.
ok(PHASE["0061a"] === "3", "0061a runs in Phase 3");
ok(!has(STATES.b, "company_follows", "authenticated", "update", ["user_id", "company_id"]) && has(STATES.a, "company_follows", "authenticated", "update"), "company_follows UPDATE is present before Phase 3 and gone after 0061a");
{
  const fixed = apply(stateAt("e"), "grant update (user_id, company_id) on public.company_follows to authenticated;");
  ok(GRANT_ROWS.I12.needs.every(([p, c]) => has(fixed, "company_follows", "authenticated", p, c)), "the documented minimal fix (column UPDATE grant) satisfies I12");
  ok(!/create policy[^;]*on public\.company_follows for (update|all) to authenticated using \(user_id/.test(allPendingSql.map(([, s]) => s).join("\n")), "no pending migration adds a non-admin UPDATE policy on company_follows (so the column grant updates nothing)");
  ok(/create policy "own_insert" on public\.company_follows for insert to authenticated with check \(user_id = auth\.uid\(\)\)/.test(sqlOf("0009")) && !/policy[^;]*"own_update"[^;]*company_follows/.test(sqlOf("0009")), "company_follows has own_insert and no own_update policy (0009)");
  ok(doc.includes("grant update (user_id, company_id) on public.company_follows to authenticated"), "doc states the minimal fix verbatim");
}

// 3. targeted assertions -----------------------------------------------------------
const noTouch = (re) => mentions(re);
const untouched = (id, tables) => {
  for (const t of tables) {
    const hits = noTouch(new RegExp(`(grant|revoke|policy|trigger|alter table)[^;]*\\bpublic\\.${t}\\b`, "i"));
    ok(hits.length === 0, `${id}: no pending migration changes grants/policies/triggers on ${t} (${hits.join(",") || "none"})`);
  }
  if (ROWS[id]) ok(COLS.every((k) => sym(ROWS[id].cells[k]) === "✅"), `${id}: untouched, so ✅ in every column`);
};
ok(noTouch(/\bnews_public\b/).length === 0, "I01: no pending migration mentions news_public");
untouched("I01", []);
untouched("I02", []);
{
  const hits = noTouch(/(grant|revoke|policy|trigger)[^;]*\bpublic\.posts\b/i);
  ok(hits.length === 0, `I02: no pending GRANT/REVOKE/policy/trigger on posts (${hits.join(",") || "none"})`);
  const alters = allPendingSql.flatMap(([m, s]) => [...s.matchAll(/alter table (?:if exists )?(?:only )?public\.posts\b([^;]*)/gi)].map((x) => `${m}:${x[1].trim()}`));
  ok(alters.length === 1 && /^0071:add column if not exists media_url text$/.test(alters[0]), `I02: the only ALTER on posts is 0071's additive media_url (${alters.join(" ")})`);
}
ok(/add column if not exists media_url/.test(sqlOf("0071")) && plan.includes("`posts.media_url` already exists in production"), "I02: 0071 only adds posts.media_url if missing, and production already has it");
untouched("I08", ["investor_profiles", "investor_preferences", "notification_preferences", "post_saves"]);
untouched("I16", ["notifications", "notification_prefs"]);
untouched("I19", ["profiles"]);
untouched("I22", ["push_tokens"]);
// companies: reads and the owner's direct profile PATCH.
{
  const hits = noTouch(/(grant|revoke|trigger)[^;]*\bon (table )?public\.companies\b/i);
  ok(hits.length === 0, `I03/I04: no pending GRANT/REVOKE/TRIGGER on companies (${hits.join(",") || "none"})`);
  const pol = allPendingSql.flatMap(([m, s]) => [...s.matchAll(/(create|drop) policy (?:if exists )?"?([a-z_]+)"? on public\.companies\b([^;]*)/gi)].map((x) => `${m}:${x[1]}:${x[2]}:${/for select/i.test(x[3]) || x[1] === "drop" ? "select" : "other"}`));
  ok(pol.length === 2 && pol.every((p) => p.startsWith("0076:") && p.includes(":member_read:")), `I03: the only companies policy change is 0076's member_read (${pol.join(" ")})`);
  ok(/create policy "member_read" on public\.companies for select to authenticated/.test(sqlOf("0076")), "I03: member_read is a SELECT policy (adds reads, removes none)");
  const manifest = read("scripts/_migration-manifest.mjs");
  ok(!PHASE["0061b"] && /0061b/.test(manifest.slice(manifest.indexOf("DEFERRED"), manifest.indexOf("PENDING"))), "I03: 0061b (companies column grants) stays deferred");
  for (const id of ["I03", "I04"]) ok(ROWS[id] && COLS.every((k) => sym(ROWS[id].cells[k]) === "✅"), `${id}: ✅ in every column`);
}
// company_memberships: the app reads its own role.
{
  const pol = noTouch(/policy[^;]*on public\.company_memberships\b/i);
  ok(pol.length === 0, `I05: no pending policy change on company_memberships (${pol.join(",") || "none"})`);
  ok(/revoke truncate, references, trigger on public\.company_memberships/.test(sqlOf("0076")) && !/revoke[^;]*select[^;]*company_memberships/.test(allPendingSql.map(([, s]) => s).join("\n")), "I05: 0076 revokes only truncate/references/trigger, never SELECT");
}
// Storage.
{
  const s78 = sqlOf("0078").replace(/\s+/g, " ");
  ok(PHASE["0078"] === "5", "I06: 0078 runs in Phase 5");
  ok(/create policy "media_write_own" on storage\.objects for insert to authenticated with check \(bucket_id in \('company-media', 'company-logos'\) and \(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text and public\.can_upload_company_assets\(\)\)/.test(s78), "I06: 0078 keeps the own-folder rule and adds can_upload_company_assets()");
  ok(/c\.owner_id = auth\.uid\(\)/.test(s78) && /m\.role in \('owner','admin','editor','publisher'\)/.test(s78), "I06: an owner (owner_id) and owner/admin/editor/publisher members may still upload");
  ok(ROWS.I06 && ["a", "b", "c"].every((k) => sym(ROWS.I06.cells[k]) === "✅") && ["d", "e"].every((k) => sym(ROWS.I06.cells[k]) === "⚠️"), "I06: ✅ until Phase 5, ⚠️ after (non-staff refused)");
  const readPol = noTouch(/policy[^;]*"?(media_public_read|media_update_own)"?/i);
  ok(readPol.length === 0, `I07: no pending migration changes media_public_read / media_update_own (${readPol.join(",") || "none"})`);
}
// post_events policy and guard.
{
  const s = sqlOf("0073c").replace(/\s+/g, " ");
  ok(/create policy "own_insert" on public\.post_events for insert to authenticated with check \(user_id = auth\.uid\(\) and kind <> 'impression'\)/.test(s), "I14: 0073c admits every kind but 'impression' for the caller's own user_id");
  ok(/new\.created_at := now\(\);/.test(s) && !/raise exception/.test(s), "I14: the guard only stamps created_at; it refuses nothing");
  ok(/where kind = 'impression'/.test(sqlOf("0073a")), "I14: 0073a's unique index is for impressions only");
  for (const k of INSTALLED.postEventKinds) ok(k !== "impression", `I14: installed kind ${k} passes the policy`);
}
// listing_reports: policy, 0093's single-row rule and limits.
{
  const s77 = sqlOf("0077").replace(/\s+/g, " ");
  ok(/for insert to anon, authenticated/.test(s77) && /kind in \('error', 'claim'\)/.test(s77), "I15: 0077 re-admits anon for kinds error/claim");
  for (const k of INSTALLED.reportKinds) ok(["error", "claim"].includes(k), `I15: installed kind ${k} is allowed`);
  const lim = s77.match(/length\(coalesce\(message, ''\)\)\s*<= (\d+)/);
  ok(lim && lim[1] === "4000", "I15: 0077 caps message at 4000 (the installed textarea has no cap: noted in the doc)");
  const s93 = sqlOf("0093");
  ok(/for each statement/i.test(s93) && /PT400/.test(s93) && /PT429/.test(s93), "I15: 0093 is a statement trigger that refuses >1 row (PT400) and over-limit (PT429)");
  ok(!INSTALLED.reportBodyIsArray, "I15: the installed sheet posts one object, not an array");
  ok(ROWS.I15 && sym(ROWS.I15.cells.b) === "⚠️", "I15: Phase 3 cell is ⚠️ (limits now apply)");
  const order3 = ["0058", "0077", "0092", "0093"].map((m) => order.indexOf(`\`${m}_`));
  ok(order3.every((v, i) => v > 0 && (i === 0 || v > order3[i - 1])), "I15: 0058 → 0077 → 0092 → 0093 in that order");
}
// conversations / messages: only company-side policies change.
{
  const COMPANY_SIDE = new Set(["conv_select_company", "conv_insert_company", "msg_select_company", "msg_insert_company", "msg_insert_sender_company"]);
  const dropped = allPendingSql.flatMap(([m, s]) => [...s.matchAll(/drop policy (?:if exists )?"?([a-z_]+)"? on public\.(conversations|messages)\b/gi)].map((x) => `${m}:${x[1]}`));
  ok(dropped.length > 0 && dropped.every((d) => COMPANY_SIDE.has(d.split(":")[1])), `I17/I18: only company-side policies are dropped/recreated (${dropped.join(" ")})`);
  ok(noTouch(/revoke[^;]*\bon (table )?public\.(conversations|messages)\b/i).length === 0, "I17/I18: no pending REVOKE on conversations/messages");
}
// /api/messages: the installed send shape, answered by the code Phase 1 deploys.
{
  const api = read("api/messages.js");
  ok(/body\.companySlug/.test(api) && /body\.body/.test(api), "I20: the deployed API reads { companySlug, body }");
  ok(/res\.status\(200\)\.json\(\{ ok: true, conversationId: conv\.id/.test(api), "I20: and answers { ok: true, conversationId }");
  ok(/authorization/.test(api) && /sign-in-required/.test(api), "I20: with the same Bearer session requirement");
  ok(PHASE["0063"] === "4", "I20: 0063 (drops the old upsert key) is Phase 4, after the Phase 1 deploy");
}
// RPCs the installed app calls: no pending migration replaces, drops or revokes them.
for (const fn of ["company_follower_count", "get_preview_company", "delete_own_account", "claim_push_token", "release_push_token", "company_followers_list"]) {
  const hits = noTouch(new RegExp(`(function|execute on function) (public\\.)?${fn}\\b`, "i"));
  ok(hits.length === 0, `I21: no pending migration replaces/drops/revokes ${fn} (${hits.join(",") || "none"})`);
}
// delete_own_account: new FKs to auth.users must not block an investor's deletion.
{
  const STAFF_ONLY = new Set(["0068:created_by", "0072:created_by", "0072:updated_by"]);   // site tokens and profile drafts: company staff only
  for (const [m, s] of allPendingSql) {
    for (const x of s.matchAll(/([a-z_]+)\s+uuid[^,\n]*references auth\.users\(id\)([^,\n]*)/g)) {
      const cascades = /on delete (cascade|set null)/.test(x[2]);
      ok(cascades || STAFF_ONLY.has(`${m}:${x[1]}`), `I23: ${m} ${x[1]} -> auth.users ${cascades ? "cascades/sets null" : "is staff-only (documented)"}`);
    }
  }
}
// The sign-up trigger is not part of this rollout.
ok(!PHASE["0059"] && plan.includes("0059 (never run its rollback in production)"), "I24: 0059 is already applied, not in the rollout");

// Web /app (redeployed in Phase 1): what it calls before the migrations land.
{
  ok(/Prefer: "resolution=ignore-duplicates,return=minimal"/.test(read("src/lib/feed.js")), "W01: the deployed follow() uses ignore-duplicates (needs no UPDATE)");
  ok(/if \(!res\.ok\) return \{\};\s*\/\/ 0062 not applied/.test(read("src/lib/attachments.js")), "W03: attachments degrade to none before 0062");
  ok(/catch \{ \/\* best effort \*\/ \}/.test(read("src/lib/impressions.js")), "W04: impressions are best effort before 0073b");
  ok(/never throws/.test(read("src/lib/analytics.js")), "W05: audience events never throw before 0087");
  ok(/profile drafts need migration 0072/.test(read("api/profile-draft.js")), "W06: /api/profile-draft answers 503 'needs 0072' before Phase 5");
  ok(WEB.W06 && ["a", "b", "c"].every((k) => sym(WEB.W06.cells[k]) === "⚠️") && ["d", "e"].every((k) => sym(WEB.W06.cells[k]) === "✅"), "W06: ⚠️ until Phase 5, ✅ after");
  const s93 = sqlOf("0093");
  ok(/if v_role is null or v_role not in \('anon', 'authenticated'\) then return null; end if;/.test(s93), "W02: 0093 limits only anon/authenticated; /api/submit's service role is not limited");
}

// 4. frozen installed call shapes, checked against the shipped source when present.
const INSTALLED_SRC = INSTALLED.snippets;
function gitShow(ref, file) {
  try { return execFileSync("git", ["show", `${ref}:${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 }); } catch { return null; }
}
const BUILDS = { "prod-v1.3.2": "1.3.2 (19)", "9761492": "1.3.1 (17)", "c1bf1b7": "1.1 (6)", dff4f8d: "1.0 (5)" };
let checkedBuilds = 0;
for (const [ref, label] of Object.entries(BUILDS)) {
  const probe = gitShow(ref, "src/lib/feed.js");
  if (probe == null) { console.log(`skip  ${label}: ${ref} not in this clone`); continue; }
  checkedBuilds++;
  for (const sn of INSTALLED_SRC) {
    if (sn.builds && !sn.builds.includes(ref)) continue;
    const src = gitShow(ref, sn.file);
    ok(src != null && sn.re.test(src), `${label} ${sn.file}: ${sn.what}`);
  }
}
if (checkedBuilds === 0) console.log("note  no shipped-build refs in this clone; the frozen shapes were not re-verified");

console.log(`\ninstalled-app compatibility matrix: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
