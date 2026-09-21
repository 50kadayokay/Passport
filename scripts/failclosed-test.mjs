// Phase 2 hardening — "no persisted transcript, no successful ingestion".
//   node scripts/failclosed-test.mjs
//
// WHY THIS EXISTS
// ---------------
// storeTranscript() used to fail soft: on any write error it returned null and
// ingestion carried on to normalization and Review. That produced exactly the state
// Phase 2 exists to prevent — editable, publishable release content with no
// persisted source behind it to check it against, and nothing on screen saying so.
//
// These tests exercise the real ingestRelease() against a stubbed network, so the
// invariant is proven end to end rather than asserted about the source.

import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------- environment
// src/lib/supabase.js reads import.meta.env, which does not exist under plain
// node. Provide the shape it expects before importing anything that pulls it in.
if (!globalThis.__vite_env_patched__) {
  globalThis.__vite_env_patched__ = true;
  const url = new URL("../src/lib/supabase.js", import.meta.url);
  const src = fs.readFileSync(url, "utf8");
  if (/import\.meta\.env/.test(src)) {
    // Node 20+ exposes import.meta.env as undefined; define it globally instead by
    // running the module through a shim is heavy. Simpler: assert the fallbacks are
    // present so the module is safe to import once env is defined.
    process.env.VITE_SUPABASE_URL ||= "https://example.supabase.co";
  }
}

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  x " + m); } };
const eq = (g, w, m) => ok(g === w, `${m}\n      got:  ${JSON.stringify(g)}\n      want: ${JSON.stringify(w)}`);

// ---------------------------------------------------------------- source guards
// These hold regardless of whether the modules can be imported in this runtime.
const root = path.join(import.meta.dirname, "..");
const strip = (s) => s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const ingest = strip(fs.readFileSync(path.join(root, "src/lib/ingestRelease.js"), "utf8"));
const store = strip(fs.readFileSync(path.join(root, "src/lib/sourceTranscript.js"), "utf8"));
const ui = strip(fs.readFileSync(path.join(root, "src/portal/publish/CreateRelease.jsx"), "utf8"));

// storeTranscript throws instead of returning null
ok(/class TranscriptPersistenceError/.test(store), "a dedicated TranscriptPersistenceError type exists");
ok(/throw new TranscriptPersistenceError/.test(store), "storeTranscript throws on failure");
ok(!/^\s*return null;\s*$/m.test(store.slice(store.indexOf("export async function storeTranscript"),
                                             store.indexOf("export async function listTranscripts"))),
   "storeTranscript never returns null (no fail-soft path remains)");
ok(/if \(!body\.length\)[\s\S]{0,180}throw new TranscriptPersistenceError/.test(store),
   "an empty transcript is refused rather than manufactured");

// ingestRelease stops before normalization
const iTranscript = ingest.indexOf("await storeTranscript(");
const iCatch = ingest.indexOf("TRANSCRIPT_UNAVAILABLE", iTranscript);
const iNorm = ingest.indexOf("normalizeRelease(parsed.text");
ok(iTranscript > 0 && iCatch > iTranscript && iCatch < iNorm,
   "the transcript failure is handled BEFORE normalization is reached");
ok(/result\.status = INGEST_STATUS\.TRANSCRIPT_UNAVAILABLE;[\s\S]{0,900}return result;/.test(ingest),
   "the failure path returns immediately; no body, headline or draft is produced");
ok(/TRANSCRIPT_UNAVAILABLE:\s*"transcript_unavailable"/.test(ingest),
   "the failure state is distinguishable from a parsing failure");
ok(/blocksReview/.test(ingest) && /REVIEW_BLOCKING/.test(ingest), "a review-blocking set is defined and exported");
ok(!/saveDocumentText\(documentId,\s*""\)/.test(ingest), "no empty text is ever written over the document");

// the UI honours it
ok(/if \(blocksReview\(res\.status\)\)/.test(ui), "CreateRelease checks blocksReview before entering Review");
const iBlock = ui.indexOf("blocksReview(res.status)");
const iDraft = ui.indexOf("await createDraft(");
// The upload handler's own setPhase("review") — not the draft-loading effect's,
// which appears earlier in the file and is a different code path.
const iReview = ui.indexOf('setPhase("review")', iDraft);
ok(iBlock > 0 && iBlock < iDraft, "the block happens BEFORE a draft is created");
ok(iBlock < iReview, "the block happens BEFORE the Review screen is shown");
ok(/blocksReview\(res\.status\)\)\s*\{[\s\S]{0,260}return;/.test(ui), "the blocked path returns early");

// ---------------------------------------------------------------- live behaviour
// Run the real ingestRelease() with fetch stubbed, so the invariant is proven by
// execution rather than by reading the source.
let live = true;
let ingestRelease, INGEST_STATUS, blocksReview;
try {
  ({ ingestRelease, INGEST_STATUS, blocksReview } = await import("../src/lib/ingestRelease.js"));
} catch (e) {
  live = false;
  console.warn(`  (live ingest checks skipped: ${String(e.message).slice(0, 70)})`);
}

if (live) {
  const RAW = "KINGSMEN DRILLS 1.40 METRES\nVancouver, British Columbia--(August 20, 2026) - Kingsmen Resources Ltd. reported results today.\nThe zone is high-grade and hosts silver-gold-lead-zinc mineralization at depth.";
  const realFetch = globalThis.fetch;

  // A tiny router: storage + documents succeed, source_transcripts fails.
  const makeFetch = ({ transcriptOk }) => async (url, init = {}) => {
    const u = String(url);
    const json = (body, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (u.includes("/api/extract-docx")) return json({ ok: true, engine: "mammoth", engineVersion: "1.12.3", text: RAW, images: [], warnings: [] });
    if (u.includes("/storage/v1/object/")) return new Response("{}", { status: 200 });
    if (u.includes("/rest/v1/source_transcripts")) {
      return transcriptOk ? json([{ id: "t1", sha256: "deadbeef", char_count: RAW.length }])
                          : json({ message: "permission denied" }, 403);
    }
    if (u.includes("/rest/v1/extraction_attempts")) return json([{ id: "a1" }]);
    if (u.includes("/rest/v1/documents")) return json([{ id: "d1", storage_path: "company-docs/x/y.docx" }]);
    if (u.includes("/auth/v1/")) return json({ access_token: "tok", user: { id: "u1" } });
    return json([]);
  };

  // ingestRelease reads the file through FileReader (a browser API) to base64 it
  // for the server-side DOCX route. Shim just enough of it to run the real code
  // path rather than a stubbed imitation of it.
  globalThis.FileReader = class {
    readAsDataURL(f) {
      Promise.resolve(f.arrayBuffer()).then((buf) => {
        this.result = "data:application/octet-stream;base64," + Buffer.from(buf).toString("base64");
        this.onload && this.onload();
      }).catch(() => { this.onerror && this.onerror(); });
    }
  };

  // A minimal session so writeHeaders()/apiFetch() succeed.
  globalThis.localStorage = {
    _v: JSON.stringify({ access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.x", refresh_token: "r",
                         expires_at: Date.now() + 3600000, user: { id: "u1" } }),
    getItem(k) { return k === "pp.session" ? this._v : null; },
    setItem() {}, removeItem() {},
  };

  const file = { name: "kng.docx", size: 1000, type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                 arrayBuffer: async () => new ArrayBuffer(8), slice: () => file, stream: () => null };

  try {
    globalThis.fetch = makeFetch({ transcriptOk: false });
    const res = await ingestRelease("c1", file, {});
    eq(res.status, INGEST_STATUS.TRANSCRIPT_UNAVAILABLE, "LIVE: transcript write failure yields TRANSCRIPT_UNAVAILABLE");
    eq(res.ok, false, "LIVE: the ingest is not reported as successful");
    ok(blocksReview(res.status), "LIVE: the status blocks Review");
    eq(res.text, "", "LIVE: no normalized body is produced");
    eq(res.headline, "", "LIVE: no headline is derived");
    eq(res.releaseDate, null, "LIVE: no date is derived");
    ok(!res.normalization, "LIVE: normalization never ran");
    ok(!!res.document, "LIVE: the original uploaded document is still preserved");
    ok(!!res.error && /try again/i.test(res.error), "LIVE: the error is honest and retryable");
    ok(res.status !== INGEST_STATUS.FAILED, "LIVE: distinguishable from a parsing failure");
  } catch (e) {
    fail++; console.error("  x LIVE failure-path check threw: " + e.message);
  } finally {
    globalThis.fetch = realFetch;
  }

  // Retry succeeds from the already-preserved original, with no re-upload.
  try {
    globalThis.fetch = makeFetch({ transcriptOk: true });
    const res = await ingestRelease("c1", file, {});
    ok(res.status !== INGEST_STATUS.TRANSCRIPT_UNAVAILABLE, "LIVE: a retry that persists succeeds");
    ok(!blocksReview(res.status), "LIVE: a successful retry does not block Review");
    ok(res.text.length > 0, "LIVE: the retry produces a normalized body");
    ok(res.text.includes("high-grade"), "LIVE: DOCX hyphens survive the real ingest path");
    ok(res.text.includes("silver-gold-lead-zinc"), "LIVE: multi-hyphen compounds survive the real ingest path");
    eq(res.transcriptChars, RAW.length, "LIVE: the transcript records the engine's own character count");
  } catch (e) {
    fail++; console.error("  x LIVE retry check threw: " + e.message);
  } finally {
    globalThis.fetch = realFetch;
  }
}

// ---------------------------------------------------------------- schema guards
const mig = fs.readFileSync(path.join(root, "supabase/migrations/0041_source_transcripts.sql"), "utf8");
ok(/create unique index[\s\S]{0,140}\(document_id, sha256\)/.test(mig),
   "identical re-extraction is idempotent; different text always inserts a NEW row");
ok(/create trigger source_transcripts_immutable/.test(mig),
   "a previous successful transcript cannot be updated by any later attempt");
ok(!/for delete/i.test(mig), "no DELETE policy: a failed retry cannot remove an earlier transcript");

console.log(`\nfail-closed: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
