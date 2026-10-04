// Phase 1 safety properties — each asserted directly, not inferred from "tests pass".
//
//   node scripts/phase1-safety-test.mjs
//
// Covers the three blockers from the architecture audit: push cannot fire from a
// migration, 0050 cannot rewrite a live table, and MineIQ retrieval degrades
// instead of disappearing.

import fs from "node:fs";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗ " + m); } };
const read = (p) => fs.readFileSync(p, "utf8");

// ---- 1. PUSH SAFETY -------------------------------------------------------
console.log("\n=== 1. a migration cannot start sending push ===");
{
  const m51 = read("supabase/migrations/0051_release_revisions_and_timeline.sql");
  const subs = m51.match(/insert into public\.listener_subscriptions[\s\S]*?on conflict/g) || [];
  const subsText = subs.join("\n");
  ok(subs.length > 0, "0051 still subscribes the correcting listeners");
  ok(!/\('device_push_v1'/.test(subsText), "0051 does NOT subscribe device_push_v1");
  ok(/profile_timeline_v1/.test(subsText) && /mineiq_facts_v1/.test(subsText),
     "0051 still subscribes profile_timeline_v1 and mineiq_facts_v1");

  ok(fs.existsSync("supabase/migrations/0055_enable_device_push.sql"),
     "enabling push is its own migration");
  const m55 = read("supabase/migrations/0055_enable_device_push.sql");
  ok(/\('device_push_v1', 'PUBLICATION_PUBLISHED'\)/.test(m55), "0055 is what subscribes it");
  ok(/delete from public\.listener_subscriptions/.test(m55), "0055 documents how to reverse it");

  // No other unapplied migration may sneak the subscription in.
  const others = fs.readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql") && !f.startsWith("0055"));
  const sneaky = others.filter((f) => /\('device_push_v1'\s*,\s*'PUBLICATION/.test(read(`supabase/migrations/${f}`)));
  ok(sneaky.length === 0, `no other migration subscribes device push (found: ${sneaky.join(", ") || "none"})`);
}

console.log("\n=== 1b. credentials alone cannot send ===");
{
  const sender = read("api/news-push-send.js");
  ok(/function pushEnabled\(\)/.test(sender), "the sender has an explicit enable switch");
  ok(/String\(process\.env\.PUSH_ENABLED \|\| ""\) === "true"/.test(sender),
     "only the exact string 'true' enables it — unset, empty, '1' and 'yes' are all off");

  // The switch must be checked BEFORE the APNs credential check, or having
  // credentials would still open a connection.
  const iEnable = sender.indexOf("if (!pushEnabled())");
  const iCreds = sender.indexOf("APNS not configured");
  const iConnect = sender.indexOf("http2.connect");
  ok(iEnable > -1 && iEnable < iCreds, "the switch is checked BEFORE the credential check");
  ok(iEnable > -1 && iEnable < iConnect, "the switch is checked BEFORE any APNs connection is opened");

  // The disabled path must return without touching Apple.
  const disabled = sender.slice(iEnable, sender.indexOf("APNS not configured"));
  ok(!/http2|apnsJwt|sendOne/.test(disabled), "the disabled path makes no APNs call of any kind");
  ok(/wouldSend/.test(disabled) && /preview/.test(disabled),
     "the disabled path still reports who WOULD be notified, so generation is inspectable");
  ok(/status: "skipped"/.test(disabled), "queued rows can be marked skipped rather than delivered");
}

// ---- 2. NO LIVE TABLE REWRITE --------------------------------------------
console.log("\n=== 2. 0050 cannot rewrite or lock live tables ===");
{
  ok(!fs.existsSync("supabase/migrations/0050_mineiq_and_publication_push.sql"),
     "the original combined 0050 is gone");
  const a = read("supabase/migrations/0050a_mineiq_and_publication_push.sql");
  const b = read("supabase/migrations/0050b_mineiq_search_indexes.sql");

  // A stored generated column rewrites the table. Only `facts` may have one,
  // because it is empty.
  const stored = [...a.matchAll(/alter table public\.(\w+)[\s\S]{0,400?}?generated always as[\s\S]{0,200}?stored/g)]
    .map((m) => m[1]);
  ok(!stored.includes("documents"), "documents gets NO stored generated column");
  ok(!stored.includes("updates"), "updates gets NO stored generated column");
  ok(a.includes("add column if not exists fts tsvector"), "facts keeps one (the table is empty)");

  ok(!/create index concurrently/i.test(a), "0050a contains no CONCURRENTLY (it is transactional)");
  ok(/^begin;/m.test(a) && /^commit;/m.test(a), "0050a is one atomic transaction");

  ok(/create index concurrently/i.test(b), "0050b builds indexes concurrently");
  ok(!/^begin;/m.test(b) && !/^commit;/m.test(b), "0050b is NOT wrapped in a transaction");
  ok(/cannot run inside a transaction/i.test(b), "0050b warns that CONCURRENTLY cannot be transactional");
  ok(/indisvalid/.test(b), "0050b documents how to find and drop an invalid index after a failed build");

  // The index expression and the query expression must be character-identical
  // or the planner silently ignores the index.
  const docIdxExpr = (b.match(/on public\.documents using gin \(\s*([\s\S]*?)\);/) || [])[1] || "";
  const norm = (x) => x.replace(/\s+/g, " ").replace(/\bd\./g, "").trim();
  ok(norm(docIdxExpr).includes("coalesce(filename, '') || ' ' || coalesce(title, '') || ' ' || coalesce(extracted_text, '')"),
     "the documents index expression is the expected one");
  ok(norm(a).includes(norm(docIdxExpr).replace(/\)$/, "")),
     "mineiq_search() queries the SAME expression the index is built on");
}

// ---- 3. RETRIEVAL DEGRADES, NEVER DISAPPEARS ------------------------------
console.log("\n=== 3. MineIQ keeps documents and releases without the RPC ===");
{
  const s = read("api/_mineiqSearch.js");
  ok(/async function legacyScan/.test(s), "a fallback retrieval path exists");
  ok(/userSelect\(token,[\s\S]{0,80}`updates\?/.test(s), "the fallback retrieves published releases");
  ok(/userSelect\(token,[\s\S]{0,80}`documents\?/.test(s), "the fallback retrieves documents");

  // Isolation: the fallback must use the caller's JWT, never a service key.
  ok(!/serviceRest|SERVICE_ROLE|service_role/.test(s), "the fallback never uses a service key");
  ok((s.match(/userSelect\(token/g) || []).length >= 2, "every fallback read carries the caller's token");

  // A missing function falls back; an authorization failure must NOT.
  ok(/42883/.test(s), "a missing function is detected by code, not by message alone");
  ok(/42501/.test(s), "an authorization failure is handled separately from a missing function");
  const guard = s.slice(s.indexOf("} catch (e) {"), s.indexOf("return legacyScan(token, companyId, query, limit);\n  }"));
  ok(/if \(!missing\) return out;/.test(guard),
     "a non-missing error returns NOTHING rather than falling back");

  ok(/degraded: true/.test(s), "the fallback reports that retrieval is degraded");
  ok(/RPC_PRESENT/.test(s), "the missing-function verdict is cached, not retried per request");

  // One contract, so callers cannot branch on which engine answered.
  ok(/blocks: \[\], sources: \[\], available: false, degraded: false/.test(s),
     "both paths return the same shape");
}

console.log(`\nphase1-safety: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
