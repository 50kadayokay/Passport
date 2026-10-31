// D26 regression tests -- storeTranscript() must work with the permissions 0053
// deliberately grants (INSERT + SELECT, never UPDATE) on source_transcripts.
//   node scripts/transcript-write-test.mjs
//
// OFFLINE. The real src/lib/sourceTranscript.js runs with fetch stubbed as a
// PostgREST that ENFORCES 0053: a request that would need UPDATE privilege
// (resolution=merge-duplicates -> ON CONFLICT DO UPDATE) is refused with 42501,
// exactly as staging refused every upload. Covers: a new transcript is
// inserted; an identical repeat is a no-op insert and the EXISTING row is read
// back by the digest the database computes; the digest matches
// public.sha256_hex for non-ASCII text; a missing read-back and a refused write
// still fail closed. Static: no client write to source_transcripts or
// extraction_attempts asks for an upsert that needs UPDATE.

import fs from "node:fs";
import crypto from "node:crypto";

globalThis.localStorage = {
  _v: JSON.stringify({ access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.x", refresh_token: "r", expires_at: Date.now() + 3600000, user: { id: "u1" } }),
  getItem(k) { return k === "pp.session" ? this._v : null; }, setItem() {}, removeItem() {},
};

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
const hex = (t) => crypto.createHash("sha256").update(Buffer.from(String(t), "utf8")).digest("hex");

// A PostgREST that enforces 0053 on source_transcripts.
let table, calls, readBackBroken;
const reset = () => { table = []; calls = []; readBackBroken = false; };
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  const method = (init.method || "GET").toUpperCase();
  const prefer = String((init.headers || {}).Prefer || "");
  calls.push({ method, path: u.pathname, search: u.search, prefer });
  if (!u.pathname.endsWith("/rest/v1/source_transcripts")) return json([]);
  if (method === "POST") {
    if (/merge-duplicates/.test(prefer)) return json({ code: "42501", message: "permission denied for table source_transcripts" }, 403);
    const b = JSON.parse(init.body);
    const row = { id: `t${table.length + 1}`, ...b, sha256: hex(b.transcript_text), char_count: b.transcript_text.length };
    const dup = table.find((r) => r.document_id === row.document_id && r.sha256 === row.sha256);
    if (dup) {
      if (/ignore-duplicates/.test(prefer) && u.searchParams.get("on_conflict") === "document_id,sha256") return json([]);
      return json({ code: "23505", message: "duplicate key value violates unique constraint" }, 409);
    }
    table.push(row);
    return json([row], 201);
  }
  if (readBackBroken) return json([]);
  const doc = (u.searchParams.get("document_id") || "").replace(/^eq\./, ""), sha = (u.searchParams.get("sha256") || "").replace(/^eq\./, "");
  return json(table.filter((r) => r.document_id === doc && (!sha || r.sha256 === sha)));
};

const T = await import("../src/lib/sourceTranscript.js");
const args = (text) => ({ engine: "txt", text });

console.log("\n  WRITES WORK WITHOUT UPDATE PRIVILEGE (0053)");
reset();
{
  const r1 = await T.storeTranscript("co1", "doc1", args("Iso Alpha drilled 31 m of 4.8 g/t gold."));
  ok(r1 && r1.id === "t1", "a new transcript is inserted and returned");
  ok(/resolution=ignore-duplicates/.test(calls[0].prefer) && !/merge-duplicates/.test(calls[0].prefer) && calls[0].search.includes("on_conflict=document_id,sha256"), "the write is INSERT ... ON CONFLICT (document_id, sha256) DO NOTHING -- INSERT privilege only");
  const before = table.length;
  const r2 = await T.storeTranscript("co1", "doc1", args("Iso Alpha drilled 31 m of 4.8 g/t gold."));
  ok(r2 && r2.id === "t1" && table.length === before, "an identical re-extraction is a no-op: the EXISTING row is returned, nothing new written");
  ok(calls.some((c) => c.method === "GET" && c.search.includes(`sha256=eq.${hex("Iso Alpha drilled 31 m of 4.8 g/t gold.")}`)), "  ...read back by the database's own digest");
  const r3 = await T.storeTranscript("co1", "doc1", args("A DIFFERENT extraction of the same document."));
  ok(r3 && r3.id === "t2" && table.length === before + 1, "different text always inserts a NEW row (history kept, never replaced)");
}

console.log("\n  DIGEST = public.sha256_hex (UTF-8, lowercase hex)");
for (const t of ["plain ascii", "Québec — 4.8 g/t Au · 31 m", "日本語テキスト", "emoji ⛏️ and\nnewlines\ttabs"]) {
  ok((await T.sha256Hex(t)) === hex(t), `sha256Hex matches for ${JSON.stringify(t.slice(0, 18))}`);
}

console.log("\n  STILL FAILS CLOSED");
reset();
{
  await T.storeTranscript("co1", "doc1", args("first"));
  readBackBroken = true;
  let err = null; try { await T.storeTranscript("co1", "doc1", args("first")); } catch (e) { err = e; }
  ok(err && err.name === "TranscriptPersistenceError", "a duplicate whose existing row cannot be read back -> TranscriptPersistenceError (never a guessed row)");
}
reset();
{
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => json({ code: "42501", message: "permission denied" }, 403);
  let err = null; try { await T.storeTranscript("co1", "doc1", args("x")); } catch (e) { err = e; }
  globalThis.fetch = realFetch;
  ok(err && err.name === "TranscriptPersistenceError", "a refused write -> TranscriptPersistenceError (upload blocked, nothing fabricated)");
}

console.log("\n  STATIC: no upsert that needs UPDATE on append-only evidence");
{
  const src = fs.readFileSync("src/lib/sourceTranscript.js", "utf8");
  ok(!/merge-duplicates/.test(src), "sourceTranscript.js never asks for merge-duplicates (ON CONFLICT DO UPDATE)");
  const all = [];
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = `${d}/${e.name}`; if (e.isDirectory()) walk(p); else if (/\.(jsx?|mjs)$/.test(e.name)) all.push(p); } })("src");
  for (const d of ["api"]) for (const f of fs.readdirSync(d)) if (f.endsWith(".js")) all.push(`${d}/${f}`);
  const offenders = all.filter((f) => { const s = fs.readFileSync(f, "utf8"); return /(source_transcripts|extraction_attempts)/.test(s) && /merge-duplicates/.test(s); });
  ok(offenders.length === 0, "no file that writes source_transcripts / extraction_attempts uses merge-duplicates", offenders.join(", "));
  const mig = fs.readFileSync("supabase/migrations/0053_phase3_0041_privilege_hardening.sql", "utf8");
  ok(/revoke all on public\.%I from anon/.test(mig), "0053's grants are unchanged by this fix (still the source of truth)");
}

console.log(`\n  transcript-write: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
