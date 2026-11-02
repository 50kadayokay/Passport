// The live INVESTOR APP against STAGING, where every pending migration
// (0053-0076) is applied. Each step reproduces a real call the app makes -- the
// same path, payload, headers and upsert mode as the source cited next to it --
// as a guest (anon key) and as a signed-in investor.
//   node scripts/investor-app-live-test.mjs
//
// The question it answers: with the pending migrations in place, does the
// investor app (web /app, the native shell, /p/ deep links) still work?
//
// WHAT IT WRITES (staging only): one THROWAWAY investor account created for the
// run (random email @staging.invalid, random password generated in-process and
// never printed), the rows that investor's own actions create, one listing
// report (removed), and one investor->company message thread. The account is
// removed at the end through the app's own "delete my account" RPC
// (delete_own_account); anything left is removed by the service role and the
// run asserts nothing remains. No existing company, post or user is changed.
import fs from "node:fs";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

const rd = (f) => Object.fromEntries(fs.readFileSync(f, "utf8").split("\n").filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const iso = rd("supabase/staging/.isolation-env"), apiEnv = rd("supabase/staging/.api-env");
const SB = iso.ISOLATION_SUPABASE_URL.replace(/\/+$/, ""), ANON = iso.ISOLATION_ANON_KEY, SERVICE = apiEnv.STAGING_SUPABASE_SERVICE_ROLE_KEY;
if (!/jmljfovtfxcdhjmtlnva/.test(SB) || /rvptronniomlqumjhyrr/.test(SB)) { console.error("  REFUSING: not the staging project"); process.exit(2); }

let pass = 0, fail = 0, known = 0;
const results = [];
const ok = (c, m, d = "", knownBreak = null) => {
  if (c) { pass++; console.log(`  ✓ ${m}`); results.push({ m, v: "PASS" }); }
  else if (knownBreak) { known++; console.error(`  ✗ ${m}  [BREAKS THE APP: ${knownBreak}]${d ? `\n      ${d}` : ""}`); results.push({ m, v: "BREAK", why: knownBreak }); }
  else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); results.push({ m, v: "FAIL", d }); }
};
const req = async (token, path, init = {}) => {
  const h = { apikey: ANON, Authorization: `Bearer ${token || ANON}`, ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}), ...(init.headers || {}) };
  const r = await fetch(`${SB}/rest/v1/${path}`, { method: init.method || "GET", headers: h, body: init.body !== undefined ? JSON.stringify(init.body) : undefined });
  const t = await r.text(); let b = null; try { b = t ? JSON.parse(t) : null; } catch { b = t; }
  return { status: r.status, body: b };
};
const svc = (path, init = {}) => fetch(`${SB}/rest/v1/${path}`, { method: init.method || "GET", headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", ...(init.headers || {}) }, body: init.body ? JSON.stringify(init.body) : undefined }).then(async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } });
const admin = (path, init = {}) => fetch(`${SB}/auth/v1/admin/${path}`, { method: init.method || "GET", headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" }, body: init.body ? JSON.stringify(init.body) : undefined });

// Local staging API (for /api/messages, as the app calls it).
const PORT = 9700 + Math.floor(Math.random() * 200);
const server = spawn(process.execPath, ["scripts/staging-api-server.mjs", "--port", String(PORT)], { stdio: "ignore" });
process.on("exit", () => { try { server.kill(); } catch {} });
for (let i = 0; i < 40; i++) { if (await fetch(`http://127.0.0.1:${PORT}/__staging/egress`).then((r) => r.ok).catch(() => false)) break; await new Promise((r) => setTimeout(r, 250)); }

const A = { id: iso.ISOLATION_COMPANY_A_ID, slug: iso.ISOLATION_COMPANY_A_SLUG };
const RUN = Date.now().toString(36);
const email = `iso-investor-app-${RUN}@staging.invalid`;
const password = crypto.randomBytes(24).toString("base64url");   // never printed
let uid = null, token = null, reportId = null;

try {
  // ------------------------------------------------------------------ guest --
  console.log("\n  GUEST (signed out; the app's anon key)");
  const post = (await svc(`posts?company_id=eq.${A.id}&removed_at=is.null&select=id,company_id&limit=1`))[0];
  let r = await req(null, `news_public?select=*&published_at=gte.${encodeURIComponent(new Date(Date.now() - 90 * 864e5).toISOString())}&order=published_at.desc&limit=20`);
  ok(r.status === 200 && Array.isArray(r.body), "news feed (news_public) loads  [feed.js]", `${r.status}`);
  r = await req(null, `posts?company_id=eq.${A.id}&removed_at=is.null&select=*&order=published_at.desc&limit=20`);
  ok(r.status === 200 && Array.isArray(r.body) && (!post || r.body.length >= 1), `a company's posts load  [feed.js] (${Array.isArray(r.body) ? r.body.length : "?"} rows)`, `${r.status}`);
  if (post) {
    r = await req(null, `posts?id=eq.${post.id}&select=*&limit=1`);
    ok(r.status === 200 && r.body.length === 1, "a single post loads (the /p/<id> deep link)  [feed.js]", `${r.status}`);
  }
  r = await req(null, `companies?id=in.(${A.id})&select=id,slug,name,primary_ticker,tier,brand:profile->brand,commodity:profile->pp->COMPANY->>commodity,jurisdiction:profile->pp->COMPANY->>jurisdiction`);
  ok(r.status === 200 && r.body.length === 1 && r.body[0].slug === A.slug, "company cards load with the app's exact columns (0061b column grants)  [feed.js:124]", `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
  r = await req(null, "rpc/company_follower_count", { method: "POST", body: { cid: A.id } });
  ok(r.status === 200 && typeof r.body === "number", "follower count  [feed.js:62]", `${r.status} ${JSON.stringify(r.body)}`);
  // p_token is a uuid (0003); the app only ever sends real preview tokens.
  r = await req(null, "rpc/get_preview_company", { method: "POST", body: { p_slug: A.slug, p_token: crypto.randomUUID() } });
  ok(r.status === 200 && (r.body === null || typeof r.body === "object"), "preview-company lookup answers (unknown token -> no company, no error)  [supabase.js:65]", `${r.status} ${JSON.stringify(r.body).slice(0, 80)}`);
  // Impressions are signed-in only BY DESIGN: impressions.js returns early with
  // no user (noteImpression / flushImpressions), and 0073b grants the RPC to
  // authenticated only. Both halves are checked; the signed-in path is below.
  {
    const src = fs.readFileSync("src/lib/impressions.js", "utf8");
    const skips = (src.match(/if \(!u \|\| !u\.id/g) || []).length >= 2;
    const g = post ? await req(null, "rpc/record_post_impressions", { method: "POST", body: { p_post_ids: [post.id] } }) : { status: 401 };
    ok(skips && (g.status === 401 || g.status === 403), "guest impressions: the app never sends them, and the database refuses them (0073b, by design)", `app skips: ${skips}; db: ${g.status}`);
  }
  // Report / claim a listing -- exactly as the app does it TODAY (anon insert).
  // Prefer: return=minimal, as prod-v1.3.2 sends it (PassportProto.jsx:10239):
  // anon has no SELECT on listing_reports, so asking for the row back would be
  // refused even though the insert itself is allowed. Cleanup finds the row by message.
  r = await req(null, "listing_reports", { method: "POST", headers: { Prefer: "return=minimal" }, body: { company_slug: A.slug, company_name: "Iso", kind: "error", message: `iso investor-app ${RUN}`, contact: "", user_id: null } });
  ok(r.status === 201, "'Report this listing' as the app sends it (anon INSERT into listing_reports)  [PassportProto.jsx:9667]", `${r.status} ${JSON.stringify(r.body).slice(0, 140)}`,
     "0058 revokes anon INSERT on listing_reports; the app still writes it directly");

  // --------------------------------------------------------------- sign up --
  console.log("\n  SIGN-UP (a new investor account; profile created by the auth trigger, 0059)");
  const cr = await admin("users", { method: "POST", body: { email, password, email_confirm: true } });
  const created = await cr.json().catch(() => null);
  uid = created?.id || null;
  ok(cr.ok && uid, "a new auth user is created", `${cr.status}`);
  const si = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  token = si.ok ? (await si.json()).access_token : null;
  ok(!!token, "the new investor signs in");
  const prof = await svc(`profiles?id=eq.${uid}&select=role`);
  ok(Array.isArray(prof) && prof.length === 1 && prof[0].role === "investor", `the sign-up trigger created exactly one profile, role investor (${JSON.stringify(prof)})`);

  // ----------------------------------------------------------- signed in --
  console.log("\n  SIGNED-IN INVESTOR (the app's own calls, as the user)");
  const H = (m) => ({ method: "POST", headers: { Prefer: m } });
  r = await req(token, "investor_profiles?select=*&limit=1");
  ok(r.status === 200, "read own investor profile (onboarding gate)  [investorData.getInvestorProfile]", `${r.status}`);
  r = await req(token, "investor_profiles?on_conflict=user_id", { ...H("resolution=merge-duplicates,return=representation"), body: { user_id: uid, onboarding_completed: true, onboarding_completed_at: new Date().toISOString() } });
  ok(r.status === 201 || r.status === 200, "complete onboarding (upsert investor_profiles)  [investorData.completeOnboarding]", `${r.status} ${JSON.stringify(r.body).slice(0, 140)}`);
  r = await req(token, "investor_preferences?on_conflict=user_id", { ...H("resolution=merge-duplicates,return=representation"), body: { user_id: uid, commodities: ["gold"], jurisdictions: [], stages: [], interests: [] } });
  ok(r.status === 201 || r.status === 200, "save preferences (upsert investor_preferences)", `${r.status} ${JSON.stringify(r.body).slice(0, 140)}`);
  r = await req(token, "user_company_relationships?on_conflict=user_id,company_slug", { ...H("resolution=merge-duplicates,return=representation"), body: { user_id: uid, company_slug: A.slug } });
  const relOk = r.status === 201 || r.status === 200;
  r = await req(token, "user_company_relationships?select=*");
  const relRead = r.status === 200 && r.body.some((x) => x.company_slug === A.slug);
  r = await req(token, `user_company_relationships?company_slug=eq.${A.slug}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  ok(relOk && relRead && r.status === 204, "watchlist: upsert, read, delete user_company_relationships (0061a grants)", `${r.status}`);
  const like = await req(token, "post_likes?on_conflict=user_id,company_slug,post_key", { ...H("resolution=ignore-duplicates,return=minimal"), body: { user_id: uid, company_slug: A.slug, post_key: `iso-${RUN}` } });
  const likeRead = await req(token, `post_likes?company_slug=eq.${A.slug}&post_key=eq.iso-${RUN}&select=post_key&limit=1`);
  const unlike = await req(token, `post_likes?company_slug=eq.${A.slug}&post_key=eq.iso-${RUN}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  ok(like.status === 201 && likeRead.body?.length === 1 && unlike.status === 204, "like / read / unlike a post (post_likes, 0061a grants)", `${like.status}/${likeRead.status}/${unlike.status}`);
  const save = await req(token, "post_saves?on_conflict=user_id,company_slug,post_key", { ...H("resolution=ignore-duplicates,return=minimal"), body: { user_id: uid, company_slug: A.slug, post_key: `iso-${RUN}` } });
  const saveRead = await req(token, "post_saves?select=company_slug,post_key");
  const unsave = await req(token, `post_saves?company_slug=eq.${A.slug}&post_key=eq.iso-${RUN}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  ok(save.status === 201 && saveRead.body?.some((x) => x.post_key === `iso-${RUN}`) && unsave.status === 204, "save / list / unsave a post (post_saves)", `${save.status}/${saveRead.status}/${unsave.status}`);
  const fol = await req(token, "company_follows", { method: "POST", headers: { Prefer: "return=minimal" }, body: { user_id: uid, company_id: A.id } });
  const folRead = await req(token, `company_follows?user_id=eq.${uid}&company_id=eq.${A.id}&select=id&limit=1`);
  const unfol = await req(token, `company_follows?user_id=eq.${uid}&company_id=eq.${A.id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  ok(fol.status === 201 && folRead.body?.length === 1 && unfol.status === 204, "follow / check / unfollow a company (company_follows, 0061a grants)", `${fol.status}/${folRead.status}/${unfol.status}`);
  r = await req(token, "notification_preferences?on_conflict=user_id", { ...H("resolution=merge-duplicates,return=representation"), body: { user_id: uid } });
  ok(r.status === 201 || r.status === 200, "notification preferences upsert", `${r.status} ${JSON.stringify(r.body).slice(0, 140)}`);
  const np = await req(token, "notification_prefs", { method: "POST", headers: { Prefer: "return=representation" }, body: { user_id: uid, company_id: null, channel: "in_app", muted: false, min_materiality: 1 } });
  const npId = Array.isArray(np.body) ? np.body[0]?.id : null;
  const npPatch = npId ? await req(token, `notification_prefs?id=eq.${npId}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: { muted: true, updated_at: new Date().toISOString() } }) : { status: 0 };
  ok(np.status === 201 && npPatch.status === 204, "in-app notification settings: create and update (notification_prefs)  [notifications.js]", `${np.status}/${npPatch.status} ${JSON.stringify(np.body).slice(0, 120)}`);
  r = await req(token, "notifications?select=id,kind,company_id,post_id,title,body,deep_link,read_at,created_at&order=created_at.desc&limit=50");
  ok(r.status === 200 && Array.isArray(r.body), "notifications list loads", `${r.status}`);
  if (post) {
    const evs = [];
    for (const kind of ["open", "dwell", "save"]) evs.push((await req(token, "post_events", { method: "POST", headers: { Prefer: "return=minimal" }, body: { post_id: post.id, user_id: uid, kind, value: kind === "dwell" ? 4200 : null } })).status);
    ok(evs.every((s) => s === 201), `post analytics events open / dwell / save (post_events, 0061a + 0073c guard)  [feed.recordPostEvent]`, evs.join(","));
    r = await req(token, "rpc/record_post_impressions", { method: "POST", body: { p_post_ids: [post.id] } });
    ok(r.status === 200 || r.status === 204, "impressions as a signed-in investor (0073b)", `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
  }
  r = await req(token, "rpc/claim_push_token", { method: "POST", body: { p_token: `iso-push-${RUN}`, p_platform: "ios" } });
  const pushClaim = r.status;
  r = await req(token, "rpc/release_push_token", { method: "POST", body: { p_token: `iso-push-${RUN}` } });
  ok((pushClaim === 200 || pushClaim === 204) && (r.status === 200 || r.status === 204), "register and release a push token  [push.js]", `${pushClaim}/${r.status}`);

  console.log("\n  REPORT THIS LISTING -- NEW BUILDS (through /api/submit, as PassportProto.jsx now sends it)");
  {
    const submit = (tok, extra = {}) => fetch(`http://127.0.0.1:${PORT}/api/submit?form=listing_report`, { method: "POST", headers: { "content-type": "application/json", ...(tok ? { authorization: `Bearer ${tok}` } : {}) },
      body: JSON.stringify({ form: "listing_report", company_slug: A.slug, company_name: "Iso", kind: "claim", message: `iso investor-app ${RUN}`, contact: "", ...extra }) }).then(async (x) => ({ status: x.status, body: await x.json().catch(() => null) }));
    const forged = crypto.randomUUID();
    const signedIn = await submit(token, { user_id: forged });
    const guest = await submit(null);
    const rows = await svc(`listing_reports?message=eq.${encodeURIComponent(`iso investor-app ${RUN}`)}&kind=eq.claim&select=user_id,company_slug`);
    ok(signedIn.status === 200 && signedIn.body?.stored === true && guest.status === 200 && guest.body?.stored === true, "a signed-in and a guest report are both stored", `${signedIn.status}/${guest.status}`);
    ok(Array.isArray(rows) && rows.some((x) => x.user_id === uid) && rows.some((x) => x.user_id === null) && !rows.some((x) => x.user_id === forged),
       "the signed-in report is attributed to the VERIFIED user; the guest's has none; a client-sent user_id is ignored", JSON.stringify(rows));
  }

  console.log("\n  MESSAGING (investor -> company, through /api/messages as the app calls it)");
  const send = await fetch(`http://127.0.0.1:${PORT}/api/messages`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ companySlug: A.slug, body: `iso investor-app ${RUN}` }) });
  const sendBody = await send.json().catch(() => null);
  ok(send.status === 200 && sendBody?.ok, "send a message to a company", `${send.status} ${JSON.stringify(sendBody).slice(0, 160)}`);
  r = await req(token, "conversations?select=id,company_slug,company_name,last_message_at&order=last_message_at.desc");
  const conv = Array.isArray(r.body) ? r.body.find((c) => c.company_slug === A.slug) : null;
  ok(r.status === 200 && !!conv, "the conversation appears in the investor's inbox", `${r.status}`);
  if (conv) {
    r = await req(token, `messages?conversation_id=eq.${conv.id}&select=id,sender,body,created_at&order=created_at.asc`);
    ok(r.status === 200 && r.body.some((m) => m.body === `iso investor-app ${RUN}` && m.sender === "investor"), "the thread shows the investor's message", `${r.status}`);
    r = await req(token, `message_attachments?conversation_id=eq.${conv.id}&select=*`);
    ok(r.status === 200, "message attachments list loads (0062)", `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
    r = await req(token, "conversations?select=company_read_at&limit=1");
    ok(r.status === 200, "read receipts column readable  [messages.js]", `${r.status}`);
  }

  // ------------------------------------------------------- delete account --
  console.log("\n  DELETE MY ACCOUNT (the app's own RPC)");
  r = await req(token, "rpc/delete_own_account", { method: "POST", body: {} });
  ok(r.status === 200 || r.status === 204, "delete_own_account succeeds  [PassportProto.jsx:9346]", `${r.status} ${JSON.stringify(r.body).slice(0, 140)}`);
  const gone = await admin(`users/${uid}`);
  ok(gone.status === 404, "the auth account is gone", `${gone.status}`);
  if (gone.status === 404) uid = uid;   // still used for the residue check below
} catch (e) {
  ok(false, "unexpected error", e.stack || e.message);
} finally {
  // Remove anything the run created, then assert nothing is left.
  if (reportId) await svc(`listing_reports?id=eq.${reportId}`, { method: "DELETE" });
  await svc(`listing_reports?message=eq.${encodeURIComponent(`iso investor-app ${RUN}`)}`, { method: "DELETE" });
  if (uid) {
    const convs = await svc(`conversations?investor_id=eq.${uid}&select=id`);
    for (const c of (Array.isArray(convs) ? convs : [])) await svc(`conversations?id=eq.${c.id}`, { method: "DELETE" });
    const still = await admin(`users/${uid}`);
    if (still.status === 200) await admin(`users/${uid}`, { method: "DELETE" });
    const left = {};
    for (const t of ["profiles?id", "investor_profiles?user_id", "investor_preferences?user_id", "user_company_relationships?user_id", "post_likes?user_id", "post_saves?user_id", "company_follows?user_id", "notification_preferences?user_id", "notification_prefs?user_id", "conversations?investor_id", "push_tokens?user_id"]) {
      const rows = await svc(`${t}=eq.${uid}&select=*&limit=5`);
      if (Array.isArray(rows) && rows.length) left[t.split("?")[0]] = rows.length;
    }
    const authLeft = (await admin(`users/${uid}`)).status === 200;
    ok(!authLeft && Object.keys(left).length === 0, "cleanup: no auth user and no rows left for the throwaway investor", JSON.stringify(left));
  }
  const lr = await svc(`listing_reports?message=eq.${encodeURIComponent(`iso investor-app ${RUN}`)}&select=id`);
  ok(Array.isArray(lr) && lr.length === 0, "cleanup: no test listing report left");
}
console.log(`\n  investor-app-live (staging, all pending migrations applied): ${pass} passed, ${fail} failed, ${known} BREAKING finding(s)\n`);
process.exit(fail || known ? 1 : 0);
