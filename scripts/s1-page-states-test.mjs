// S1 pages, a28 review fixes: failures are said, never shown as "empty".
//   node scripts/s1-page-states-test.mjs
//
// OFFLINE. The lib functions run against a stubbed fetch; the page wiring is
// checked in source, as company-roles-ui-test.mjs does. Defects from S3's a28
// review (claude/portal-s3-experience-bdec7b, "S1 pages — defects found").
import fs from "node:fs";

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const throws = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
const read = (f) => fs.readFileSync(f, "utf8");

// One programmable network for every lib under test.
let route = () => json([]);
globalThis.fetch = async (input, init = {}) => route(new URL(String(input instanceof Request ? input.url : input), "http://localhost"), init);
globalThis.localStorage = { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } };
// A signed-in session in the shape src/lib/auth.js stores, so writeHeaders()
// has a token to send. It never leaves this process.
const AUTH_KEY = "pp.session";   // src/lib/auth.js KEY
localStorage.setItem(AUTH_KEY, JSON.stringify({ access_token: "stub-token", refresh_token: "r", expires_at: Date.now() + 3600e3, user: { id: "u1" } }));

console.log("\n  MINE IQ HISTORY (mineiqChat.js)");
{
  const chat = await import("../src/lib/mineiqChat.js");
  let probeCalls = 0;
  route = (u) => { if (u.pathname.endsWith("/mineiq_threads")) { probeCalls++; return json({ message: "upstream" }, 503); } return json([]); };
  const e1 = await throws(() => chat.listThreads("co-1"));
  ok(e1 && /could not be loaded \(503\)/.test(e1.message), "a 5xx probe is an error the page shows", e1 && e1.message);
  ok(chat.storageMode() === "unknown", "...and does NOT switch this browser to local storage");
  route = (u) => { if (u.pathname.endsWith("/mineiq_threads")) { probeCalls++; return json({ message: "jwt expired" }, 401); } return json([]); };
  const e2 = await throws(() => chat.listThreads("co-1"));
  ok(e2 && /session has expired/.test(e2.message) && chat.storageMode() === "unknown", "an expired session is an error, not local mode");
  route = () => { throw new TypeError("network down"); };
  const e3 = await throws(() => chat.listThreads("co-1"));
  ok(e3 && /could not be reached/.test(e3.message) && chat.storageMode() === "unknown", "offline is an error, not local mode");
  route = (u) => { if (u.pathname.endsWith("/mineiq_threads") && u.searchParams.get("limit") === "1") { probeCalls++; return json([]); } return json([]); };
  await chat.listThreads("co-1");
  ok(chat.storageMode() === "supabase" && probeCalls === 3, "the next call asks again, and a healthy probe settles on the account");
  route = (u) => u.pathname.endsWith("/mineiq_messages")
    ? json([{ id: "m1", role: "user", body: "Q1" }, { id: "m2", role: "assistant", body: "A1", sources: [], grounded: true }, { id: "m3", role: "user", body: "Q2 with no answer row" }])
    : json([]);
  const t = await chat.getThread("co-1", "th-1");
  const turns = (t && t.turns) || [];
  ok(turns.length === 2 && turns[0].answer === "A1" && !turns[0].error, "a complete turn reads normally");
  ok(turns[1] && turns[1].answer == null && /No answer was saved/.test(turns[1].error || ""), "a question with no saved answer says so (no blank turn, no Copy of 'undefined')");
}
{
  // A fresh module: 404 = the table is not there (0066 unapplied) -> local, as before.
  const chat404 = await import(`../src/lib/mineiqChat.js?fresh=${Date.now()}`);
  route = (u) => u.pathname.endsWith("/mineiq_threads") ? json({ code: "PGRST205", message: "not found" }, 404) : json([]);
  await chat404.listThreads("co-2");
  ok(chat404.storageMode() === "local", "only a missing table (404 / PGRST205) settles on local storage");
}

console.log("\n  LISTS THROW ON A FAILED READ");
{
  const pd = await import("../src/lib/publishDrafts.js");
  const mp = await import("../src/lib/mediaPosts.js");
  route = () => json({ message: "boom" }, 500);
  const d = await throws(() => pd.listDrafts("co-1"));
  const p = await throws(() => pd.listPublished("co-1"));
  const m = await throws(() => mp.listMediaPosts("co-1"));
  ok(d && /drafts could not be loaded \(500\)/.test(d.message), "listDrafts throws instead of answering []");
  ok(p && /published releases could not be loaded \(500\)/.test(p.message), "listPublished throws instead of answering []");
  ok(m && /media could not be loaded \(500\)/.test(m.message), "listMediaPosts throws instead of answering []");
  route = () => json([]);
  ok((await pd.listDrafts("co-1")).length === 0 && (await mp.listMediaPosts("co-1")).length === 0, "a real empty list is still []");
}

console.log("\n  MINE IQ OVERVIEW COUNTS (mineiq.js knowledgeSummary)");
{
  const mi = await import("../src/lib/mineiq.js");
  route = (u) => (u.pathname.endsWith("/facts") ? json([]) : json({ message: "boom" }, 500));
  const sum = await mi.knowledgeSummary("co-1", {});
  ok(sum.releases === null && sum.drafts === null && sum.media === null, "failed release, draft and media reads are null, not 0");
  ok(["releases", "drafts", "media"].every((k) => sum.unavailable.includes(k) && sum.errors[k]), "...named in `unavailable`, with their messages");
  // listDocuments throws "documents_unavailable" from S3's f3b8b5d; before that
  // reaches this branch it still answers [] for a failure.
  if (/documents_unavailable/.test(read("src/lib/memory.js"))) {
    ok(sum.documents === null && sum.unavailable.includes("documents"), "a failed documents read is null and named, not '0 documents'");
  } else {
    console.log("  - documents: pending S3 f3b8b5d (memory.js on this branch still answers [] on failure); checked after integration");
  }
  ok(mi.countLabel(sum, "releases", "published releases") === "Published releases couldn't be loaded" && mi.countLabel({ media: 0 }, "media", "media posts") === "0 media posts",
     "the count label says 'couldn't be loaded' for null and keeps a real 0");
  const att = mi.attentionItems(sum, {});
  ok(att[0] && /couldn't be loaded/.test(att[0].title) && !att.some((a) => a.id === "drafts"), "the overview leads with what could not be loaded, and invents no draft count");
  route = (u) => json([]);
  const ok2 = await mi.knowledgeSummary("co-1", {});
  ok(ok2.documents === 0 && ok2.releases === 0 && ok2.unavailable.length === 0, "a real empty company is 0 with nothing unavailable");
}

console.log("\n  DRAFTING CLIENT (compose.js)");
{
  const c = await import("../src/lib/compose.js");
  route = () => json({ context: {} });
  const e = await throws(() => c.draftRelease({ details: "x", companyId: "co-1" }));
  ok(e && /Nothing came back/.test(e.message), "a 200 without text is an error, not undefined reaching the editor");
  const r = await throws(() => c.reviseRelease({ current: "x", preset: "tone", companyId: "co-1" }));
  ok(r && /Nothing came back/.test(r.message), "same for revise");
  route = () => json({ text: "Draft.", context: {} });
  ok((await c.draftRelease({ details: "x", companyId: "co-1" })).text === "Draft.", "a normal draft still comes back");
}

console.log("\n  PAGE WIRING");
const mine = read("src/portal/MineIQ.jsx");
ok(/const send = useCallback\(async \(question, attached = attachments, base = thread\)/.test(mine) && /send\(turn\.question, \[\], \{ \.\.\.thread, turns: thread\.turns\.filter/.test(mine),
   "Try again sends from the thread without the failed turn (no duplicate question)");
ok(/histErr \? "Couldn't confirm where chats are saved\."/.test(mine), "a failed probe does not say 'Checking…' for ever");
const media = read("src/portal/MediaPage.jsx");
ok(/data-media-load-error/.test(media) && /setPosts\(null\); setLoadErr/.test(media), "the media page shows a load error with Try again, not 'No media yet'");
ok(/\.filter\(Boolean\)\.join\(" · "\)/.test(media), "an undated post no longer reads 'Photo · '");
const pub = read("src/portal/publish/Publish.jsx");
ok(/setDrafts\(null\); setPublished\(null\);/.test(pub) && /\{!loadErr && <div className="mt-5">/.test(pub) && /onClick=\{refresh\}/.test(pub),
   "a failed library load shows the banner and Try again, not 'No press releases yet'");
const cr = read("src/portal/publish/CreateRelease.jsx");
ok(/try \{\s*const d = await getDraft\(draftId\);/.test(cr) && /data-release-open-error/.test(cr), "reopening a release cannot hang on 'loading': failures land on an explained error");
ok(/setPicked\(saved\);\s*setAssetsErr\(/.test(cr) && /if \(assetsErr\) \{/.test(cr) && /data-assets-error/.test(cr),
   "a failed image list keeps the saved selection, says so, and holds publishing");
ok(/if \(phase === "loading"\) \{/.test(cr) && /data-release-loading/.test(cr), "reopening shows 'Opening your release', not the upload checklist");
ok(/\) : pubMissing \? \(/.test(cr), "a live release whose publication lookup failed is never offered 'Publish to MineEx' (a4510f8)");
const dr = read("src/portal/publish/DraftRelease.jsx");
ok(/setFacts\(Array\.isArray\(r\.findings\) \? r\.findings : \[\]\)/.test(dr), "a fact check without a findings list cannot crash the draft page");
const pe = read("src/portal/ProfileEditor.jsx");
ok(/if \(!company\?\.id\) \{\s*\n?\s*setDenied\(/.test(pe) && !/if \(!slug \|\| !company\?\.id\) return;/.test(pe), "a company without a slug opens the editor (no 'Loading profile…' for ever)");
ok(/Array\.isArray\(out\.versions\) \? out\.versions : \{ error:/.test(pe) && /by_label \|\| "a team member"/.test(pe), "history cannot spin for ever; no 'saved by undefined'");
ok(/animate-spin/.test(read("src/portal/Content.jsx")), "Content's loader matches the other sections");

console.log(`\n  s1-page-states: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
