// a18 · Mine IQ chat history (migration 0066), LIVE on STAGING: ask through the
// local staging API (/api/compose, mode "ask"; the AI provider is answered by the
// staging egress MOCK, so no AI credit is spent), then persist and reload the
// conversation exactly as src/lib/mineiqChat.js does (mineiq_threads /
// mineiq_messages over REST, as the signed-in user), and prove who can see,
// change and delete it.
//   node scripts/mineiq-history-live-test.mjs [apiBase=http://127.0.0.1:8899]
//
// WHAT IT WRITES (staging only): one throwaway company "zz-a18-<run>" (owner =
// company A's owner; admin and viewer fixtures as members) and its Mine IQ
// threads/messages. Everything cascades away with the company (it never
// publishes). Company A is never written. Prints no secrets.
import fs from "node:fs";
import pg from "pg";

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
for (const k of ["COMPANY_A", "COADMIN", "STAFF", "COMPANY_B", "INVESTOR"]) W[k] = await signIn(k);
if (Object.values(W).some((v) => !v)) { console.error("  fixture sign-in failed"); process.exit(3); }
const rest = async (u, path, init = {}) => {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { apikey: ANON, "content-type": "application/json", Authorization: `Bearer ${u ? u.token : ANON}`, ...(init.headers || {}) } });
  const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; }
  return { status: r.status, body: b };
};
// src/lib/mineiqChat.js, request for request.
const listThreads = (u) => rest(u, `mineiq_threads?company_id=eq.${X}&select=id,title,shared_with_company,created_at,updated_at&order=updated_at.desc&limit=50`);
const getThread = (u, id) => rest(u, `mineiq_messages?thread_id=eq.${id}&select=id,role,body,sources,grounded,created_at&order=created_at.asc&limit=200`);
const createThread = (u, companyId, extra = {}) => rest(u, "mineiq_threads", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ company_id: companyId, user_id: u.id, title: "New chat", ...extra }) });
const appendTurn = (u, threadId, companyId, question, answer, sources, grounded) => rest(u, "mineiq_messages", { method: "POST", headers: { Prefer: "return=minimal" },
  body: JSON.stringify([{ thread_id: threadId, company_id: companyId, role: "user", body: question, sources: [], grounded: null }, { thread_id: threadId, company_id: companyId, role: "assistant", body: answer, sources: sources || [], grounded: grounded ?? null }]) });
const patchThread = (u, id, patch) => rest(u, `mineiq_threads?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });
const deleteThread = (u, id) => rest(u, `mineiq_threads?id=eq.${id}`, { method: "DELETE", headers: { Prefer: "return=representation" } });
const ask = async (u, question) => {
  const r = await fetch(`${API}/api/compose`, { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${u.token}` },
    body: JSON.stringify({ mode: "ask", question, companyId: X, companyName: "A18 Mine IQ", attachments: [] }) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

const RUN = Date.now().toString(36);
let X = null;
try {
  console.log("\n  FIXTURE");
  await q(`select set_config('app.provisioning', 'on', false)`);
  X = (await one(`insert into public.companies (slug, name, owner_id, status, tier) values ($1, 'A18 Mine IQ', $2, 'published', 'pro') returning id`, [`zz-a18-${RUN}`, W.COMPANY_A.id])).id;
  for (const [k, role] of [["COADMIN", "admin"], ["STAFF", "viewer"]]) await q(`insert into public.company_memberships (company_id, user_id, role, status) values ($1, $2, $3, 'active')`, [X, W[k].id, role]);
  await q(`insert into public.company_subscriptions (company_id, plan_id, status) select $1, plan_id, 'active' from public.company_subscriptions where company_id = $2`, [X, iso.ISOLATION_COMPANY_A_ID]);
  ok(!!X, "throwaway company with owner, admin and viewer, active plan");

  console.log("\n  1. ASK (staging API; AI answered by the egress mock)");
  const question = `What is the treasury position? ${RUN}`;
  const a = await ask(W.COMPANY_A, question);
  ok(a.status === 200 && typeof (a.body.answer ?? a.body.text ?? a.body.reply) === "string", "the owner asks Mine IQ and gets an answer", `${a.status} ${JSON.stringify(a.body).slice(0, 160)}`);
  const answer = String(a.body.answer ?? a.body.text ?? a.body.reply ?? "");
  const sources = Array.isArray(a.body.sources) ? a.body.sources : [{ title: "fixture source" }];

  console.log("\n  2. SAVE AND RELOAD (mineiqChat.js)");
  let r = await createThread(W.COMPANY_A, X);
  const T = Array.isArray(r.body) ? r.body[0] : null;
  ok(r.status === 201 && T && T.user_id === W.COMPANY_A.id && T.shared_with_company === false, "a thread is created, owned by the asker, private by default", `${r.status}`);
  r = await appendTurn(W.COMPANY_A, T.id, X, question, answer, sources, a.body.grounded);
  ok(r.status === 201, "the question and answer are saved, with the answer's sources", `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
  r = await patchThread(W.COMPANY_A, T.id, { title: "Treasury", updated_at: new Date().toISOString() });
  ok(r.status === 200 && r.body[0]?.title === "Treasury", "the thread is titled and touched");
  r = await listThreads(W.COMPANY_A);
  ok(Array.isArray(r.body) && r.body.length === 1 && r.body[0].id === T.id && r.body[0].title === "Treasury", "after a reload, the history lists the conversation");
  r = await getThread(W.COMPANY_A, T.id);
  ok(Array.isArray(r.body) && r.body.length === 2 && r.body[0].role === "user" && r.body[0].body === question && r.body[1].role === "assistant" && r.body[1].body === answer
     && JSON.stringify(r.body[1].sources) === JSON.stringify(sources), "reopening it shows the same question, answer and sources");

  console.log("\n  3. PRIVATE TO THE PERSON WHO ASKED");
  for (const who of ["COADMIN", "STAFF"]) {
    r = await listThreads(W[who]);
    ok(Array.isArray(r.body) && r.body.length === 0, `a colleague (${who === "STAFF" ? "viewer" : "admin"}) does not see a private conversation`);
    r = await getThread(W[who], T.id);
    ok(Array.isArray(r.body) && r.body.length === 0, `…nor its messages`);
  }
  r = await appendTurn(W.COADMIN, T.id, X, "injected", "injected");
  ok(r.status >= 400, "a colleague cannot add to someone else's conversation", `${r.status}`);
  r = await patchThread(W.COADMIN, T.id, { title: "Hijacked" });
  ok(!(Array.isArray(r.body) && r.body.length) && (await one(`select title from public.mineiq_threads where id = $1`, [T.id])).title === "Treasury", "…nor rename it");
  r = await deleteThread(W.COADMIN, T.id);
  ok(!!(await one(`select 1 x from public.mineiq_threads where id = $1`, [T.id])), "…nor delete it");
  for (const who of ["COMPANY_B", "INVESTOR"]) {
    r = await listThreads(W[who]);
    ok(Array.isArray(r.body) && r.body.length === 0 && (await getThread(W[who], T.id)).body.length === 0, `${who === "COMPANY_B" ? "another company" : "an investor"} sees nothing`);
  }
  r = await createThread(W.COMPANY_B, X);
  ok(r.status >= 400, "another company cannot start a conversation under this company", `${r.status}`);
  r = await rest(W.COMPANY_A, "mineiq_threads", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ company_id: X, user_id: W.COADMIN.id, title: "forged" }) });
  ok(r.status >= 400, "nobody can create a conversation in a colleague's name (user_id comes from the session)", `${r.status}`);

  console.log("\n  4. SHARED ON PURPOSE (database rule; no share control in the UI yet)");
  r = await patchThread(W.COMPANY_A, T.id, { shared_with_company: true });
  ok(r.status === 200 && r.body[0]?.shared_with_company === true, "the owner shares it with the company");
  r = await listThreads(W.COADMIN);
  ok(Array.isArray(r.body) && r.body.length === 1 && (await getThread(W.COADMIN, T.id)).body.length === 2, "a colleague now sees it and its messages");
  r = await appendTurn(W.COADMIN, T.id, X, "injected", "injected");
  ok(r.status >= 400, "a shared conversation is still read-only to colleagues", `${r.status}`);
  ok((await listThreads(W.COMPANY_B)).body.length === 0, "sharing is within the company only");

  console.log("\n  5. LEAVING THE COMPANY ENDS ACCESS; DELETE REMOVES EVERYTHING");
  await q(`delete from public.company_memberships where company_id = $1 and user_id = $2`, [X, W.COADMIN.id]);
  r = await listThreads(W.COADMIN);
  ok(Array.isArray(r.body) && r.body.length === 0, "a removed member no longer sees the shared conversation");
  r = await deleteThread(W.COMPANY_A, T.id);
  ok(r.status === 200 && Array.isArray(r.body) && r.body.length === 1, "the owner deletes the conversation");
  ok((await one(`select count(*)::int n from public.mineiq_messages where thread_id = $1`, [T.id])).n === 0, "its messages are gone with it");
  ok((await listThreads(W.COMPANY_A)).body.length === 0, "the history is empty again");
} catch (e) {
  ok(false, "unexpected error", e.stack || e.message);
} finally {
  console.log("\n  CLEANUP");
  if (X) await q(`delete from public.companies where id = $1`, [X]).catch((e) => ok(false, "cleanup", e.message));
}
ok(!(await one(`select 1 x from public.companies where slug = $1`, [`zz-a18-${RUN}`])) && (await one(`select count(*)::int n from public.mineiq_threads t left join public.companies c on c.id = t.company_id where c.id is null`)).n === 0, "throwaway company and its conversations removed");
await pgc.end();
console.log(`\n  mineiq-history-live (staging): ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
