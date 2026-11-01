// a07 / a08 click-through on STAGING, deterministic. For S4.
//   node scripts/a07-click-through-live.mjs [apiBase=http://127.0.0.1:8899]
//   (npm run check:s1-a07-click-through)
// Needs the local staging API server (scripts/staging-api-server.mjs) on 8899.
// The AI provider there is the staging egress MOCK: no credit is spent.
//
// It runs the PORTAL'S OWN CLIENT CODE, the functions each button in
// CreateRelease.jsx calls, in the order a person clicks them, as company A's
// owner -- not a re-implementation of their requests:
//
//   upload          createDraft                     → state "draft"
//   autosave        saveDraft                       → the row holds the edit
//   Publish         validateForPublish + publishDraftToMineEx
//                                                   → publication published, state "live"
//   library         listPublished + releaseState    → the card says Live
//   Ask MineIQ      askMineIq                       → the release is a source
//   Save correction reviseRelease + syncLiveRow     → revision 2; row in step
//   Take down       unpublishViaApi                 → state "down" (card and editor)
//   Ask MineIQ      askMineIq                       → NOT a source (a08)
//   Publish again   publishDraftToMineEx            → "live", corrected text, source again
//   Take down       unpublishViaApi                 → leaves it down for retirement
//
// The client modules are bundled with esbuild and the STAGING env defined at
// build time, as `vite --mode staging` does: under plain node,
// src/lib/supabase.js would fall back to the production URL. With the env
// defined its staging tripwire applies, and a fetch barrier below refuses any
// host but the staging project and the local API server.
//
// WHAT IT WRITES (staging only): one release for company A whose headline starts
// "[a07-live]", its publication, two revisions and the events and projections
// publishing makes. A corrected publication cannot be deleted (release_revisions
// is append-only), so it is left TAKEN DOWN and named at the end for
// scripts/retire-test-publications.mjs (S4: add "[a07-live]" to TEST_MARKERS).
// Prints no secrets.
import fs from "node:fs";
import { build } from "esbuild";

const API = (process.argv[2] || "http://127.0.0.1:8899").replace(/\/+$/, "");
const rd = (f) => Object.fromEntries(fs.readFileSync(f, "utf8").split("\n").filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const iso = rd("supabase/staging/.isolation-env");
const SB = String(iso.ISOLATION_SUPABASE_URL || "").replace(/\/+$/, ""), ANON = iso.ISOLATION_ANON_KEY;
if (SB !== "https://jmljfovtfxcdhjmtlnva.supabase.co" || !ANON) { console.error("  REFUSING: not the staging project"); process.exit(2); }
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(API)) { console.error("  REFUSING: the API base must be the local staging API server (AI calls are mocked there)"); process.exit(2); }

let pass = 0, fail = 0, skip = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };

// ── the fetch barrier: staging and the local API, nothing else ──────────────
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const raw = String(input instanceof Request ? input.url : input);
  const url = raw.startsWith("/") ? new URL(raw, API) : new URL(raw);   // the UI's relative /api/* calls
  if (url.origin !== SB && url.origin !== API) throw new Error(`fetch barrier: refused ${url.host}`);
  return realFetch(url, init);
};

// ── the portal's client modules, built for staging ──────────────────────────
const OUT = "node_modules/.cache/a07-click-through.mjs";
await build({
  stdin: {
    contents: `
      export * from "./src/lib/publishDrafts.js";
      export { reviseRelease, listRevisions } from "./src/lib/releaseRevisions.js";
      export { unpublishViaApi } from "./src/lib/publishClient.js";
      export { askMineIq, factCountForPublication } from "./src/lib/mineiq.js";
      export { SUPABASE_URL } from "./src/lib/supabase.js";`,
    resolveDir: process.cwd(), loader: "js",
  },
  bundle: true, platform: "node", format: "esm", packages: "external", outfile: OUT, logLevel: "error",
  define: { "import.meta.env": JSON.stringify({ DEV: false, PROD: true, MODE: "staging", VITE_MINEEX_ENV: "staging", VITE_SUPABASE_URL: SB, VITE_SUPABASE_ANON_KEY: ANON }) },
});
const UI = await import(`../${OUT}?${Date.now()}`);
if (UI.SUPABASE_URL !== SB) { console.error("  REFUSING: the bundle does not point at staging"); process.exit(2); }

// ── signed in as company A's owner, the way src/lib/auth.js stores it ───────
const mem = {};
globalThis.localStorage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
{
  const r = await realFetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email: iso.ISOLATION_COMPANY_A_EMAIL, password: iso.ISOLATION_COMPANY_A_PASS }) });
  const j = r.ok ? await r.json() : null;
  if (!j) { console.error("  fixture sign-in failed"); process.exit(3); }
  localStorage.setItem("pp.session", JSON.stringify({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (j.expires_in || 3600) * 1000, user: j.user }));
}
const A = iso.ISOLATION_COMPANY_A_ID;

const RUN = `a07zq${Date.now().toString(36)}`;      // one word only this release contains
const HEADLINE = `[a07-live] ${RUN} Closes C$2.1 Million Placement`;
const BODY1 = `${RUN} The Company closed a non-brokered placement for gross proceeds of C$2,100,000.\n\nProceeds fund the ${RUN} drill programme.`;
const BODY2 = `${RUN} The Company closed a non-brokered placement for gross proceeds of C$2,160,000 (corrected).\n\nProceeds fund the ${RUN} drill programme.`;
const libraryState = async (id) => {
  const row = (await UI.listPublished(A)).find((r) => r.id === id);
  return row ? UI.releaseState({ updateStatus: row.status, publications: row.publications }) : "absent";
};
const editorState = async (id) => {
  const d = await UI.getDraft(id);
  const pub = (await (await fetch(`${SB}/rest/v1/publications?update_id=eq.${id}&destination_id=eq.passport&select=id,status`, { headers: { apikey: ANON, Authorization: `Bearer ${JSON.parse(mem["pp.session"]).access_token}` } })).json())[0];
  return { d, pub, state: UI.releaseState({ updateStatus: d && d.status, publicationStatus: pub ? pub.status : null }) };
};
// Mine IQ: does an answer list this release among its sources? null = Mine IQ
// is not available to this company on this server (reported, never a pass).
const minedFrom = async () => {
  try {
    const out = await UI.askMineIq({ question: `What did ${RUN} raise?`, companyId: A, companyName: "Company A" });
    return ((out.context && out.context.sources) || []).some((s) => s.includes(RUN));
  } catch (e) { return { unavailable: e.message }; }
};
const mineIq = (got, want, m) => {
  if (got && typeof got === "object") { skip++; console.log(`  - SKIP ${m}: ${got.unavailable}`); return; }
  ok(got === want, m);
};

let U = null, P = null;
try {
  console.log("\n  1. UPLOAD AND AUTOSAVE");
  const created = await UI.createDraft(A, { headline: HEADLINE, text: BODY1, releaseDate: "2026-10-28" });
  U = created && created.id;
  ok(!!U && (await editorState(U)).state === "draft", "the uploaded release opens as a draft");
  await UI.saveDraft(U, { headline: HEADLINE, text: `${BODY1}\n\nAbout the Company.` });
  ok(/About the Company\./.test(((await UI.getDraft(U)) || {}).body || ""), "an autosaved edit is on the row");
  await UI.saveDraft(U, { headline: HEADLINE, text: BODY1 });

  console.log("\n  2. PUBLISH");
  const draft = await UI.getDraft(U);
  ok(UI.validateForPublish(draft).length === 0, "the editor's publish checks pass", JSON.stringify(UI.validateForPublish(draft)));
  const pubOut = await UI.publishDraftToMineEx(A, draft);
  P = pubOut && pubOut.publicationId;
  let st = await editorState(U);
  ok(!!P && st.pub && st.pub.status === "published" && st.state === "live", "Publish to MineEx: the publication is published and the editor says Live", JSON.stringify(st.pub));
  ok((await libraryState(U)) === "live", "the library card says Live");
  mineIq(await minedFrom(), true, "Ask MineIQ: the live release is a source");

  console.log("\n  3. SAVE CORRECTION");
  const rev = await UI.reviseRelease({ publicationId: P, headline: HEADLINE, body: BODY2, reason: null });
  ok(rev && !rev.unchanged && rev.revision === 2, "Save correction records revision 2", JSON.stringify(rev));
  await UI.saveDraft(U, { headline: HEADLINE, text: BODY2 });                     // syncLiveRow
  ok(/2,160,000 \(corrected\)/.test(((await UI.getDraft(U)) || {}).body || ""), "the release row is synced to the correction");
  const revs = await UI.listRevisions(P);
  ok(Array.isArray(revs) && revs.length === 2, "the history lists both revisions", `${Array.isArray(revs) ? revs.length : revs}`);
  ok((await editorState(U)).state === "live", "still Live after a correction");

  console.log("\n  4. TAKE DOWN");
  const facts = await UI.factCountForPublication(P);
  ok(facts === null || Number.isInteger(facts), `the take-down confirm can count what Mine IQ learned (${facts})`);
  await UI.unpublishViaApi(P);
  st = await editorState(U);
  ok(st.pub.status === "draft" && st.d.status === "published" && st.state === "down", "Take down: the editor says Taken down (publication flipped; release row kept)");
  ok((await libraryState(U)) === "down", "the library card says Taken down");
  mineIq(await minedFrom(), false, "Ask MineIQ: a taken-down release is NOT a source (a08)");

  console.log("\n  5. PUBLISH AGAIN");
  const again = await UI.publishDraftToMineEx(A, await UI.getDraft(U));
  st = await editorState(U);
  ok(again && again.publicationId === P && st.state === "live", "Publish again reuses the publication and the editor says Live");
  const live = await (await fetch(`${SB}/rest/v1/publications?id=eq.${P}&select=content`, { headers: { apikey: ANON, Authorization: `Bearer ${JSON.parse(mem["pp.session"]).access_token}` } })).json();
  ok(/2,160,000 \(corrected\)/.test(((live[0] || {}).content || {}).body || ""), "what goes live again is the corrected text, not the original");
  mineIq(await minedFrom(), true, "Ask MineIQ: republished, it is a source again");
} catch (e) {
  ok(false, "unexpected error", e.stack || e.message);
} finally {
  console.log("\n  CLEANUP");
  if (P) {
    try { await UI.unpublishViaApi(P); ok((await editorState(U)).state === "down", "the test release is left taken down"); }
    catch (e) { ok(false, "take the test release down", e.message); }
    console.log(`  - publication ${P} ("[a07-live] …") awaits scripts/retire-test-publications.mjs --apply`);
  } else if (U) {
    try { await UI.deleteDraft(U); console.log("  - the unpublished draft was deleted"); } catch (e) { ok(false, "delete the draft", e.message); }
  }
}
console.log(`\n  a07-click-through (staging): ${pass} passed, ${fail} failed${skip ? `, ${skip} skipped` : ""}\n`);
process.exit(fail ? 1 : 0);
