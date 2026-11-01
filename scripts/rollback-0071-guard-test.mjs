// 0071's rollback refuses while 0088 is applied (R2). OFFLINE: the rollback
// file, 0088's objects and the round trip's order are checked in source; the
// live behaviour is scripts/rollback-0071-guard-check.mjs (staging, rolled back).
//   node scripts/rollback-0071-guard-test.mjs
import fs from "node:fs";
import { runnerBody } from "./_db-egress.mjs";
import { PREREQUISITES } from "./_migration-manifest.mjs";

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const read = (f) => fs.readFileSync(f, "utf8");
const code = (s) => s.replace(/--[^\n]*/g, "");

const RB = read("supabase/rollbacks/0071_publishing_reliability.rollback.sql");
const M88 = code(read("supabase/migrations/0088_content_fanout.sql"));
const RB88 = code(read("supabase/rollbacks/0088_content_fanout.rollback.sql"));
const body = code(RB);

console.log("\n  THE GUARD (supabase/rollbacks/0071_publishing_reliability.rollback.sql)");
const guardAt = body.search(/do \$\$\s*begin\s*if exists/);
const firstChange = body.search(/create or replace|drop |delete from|alter table|update public\./i);
ok(guardAt > 0 && guardAt < firstChange, "a guard block runs before the rollback's first change");
const guard = body.slice(guardAt, body.indexOf("end $$;", guardAt));
ok(/raise exception '0071 rollback refused: 0088_content_fanout is still applied'/.test(guard), "it raises, naming 0088");
ok(/hint = '[^']*0088_content_fanout\.rollback\.sql first, then this file/.test(guard), "its hint names the order: 0088's rollback first");

// Every object 0088 creates must be a marker, with the exact signature 0088's rollback drops.
const subs = [...M88.matchAll(/unnest\(array\[([^\]]+)\]\) l/g)].flatMap((m) => [...m[1].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]));
ok(subs.length === 2 && subs.every((l) => new RegExp(`'${l}'`).test(guard)), `both 0088 listeners are checked (${subs.join(", ")})`);
ok(/create table[^;(]*public\.destination_content/.test(M88) && /to_regclass\('public\.destination_content'\)/.test(guard), "destination_content is checked");
for (const fn of [...RB88.matchAll(/drop function if exists (public\.[a-z_]+\([^)]*\))/g)].map((m) => m[1])) {
  ok(guard.includes(`to_regprocedure('${fn}')`), `${fn} is checked, with the signature 0088's rollback drops`);
}
ok(/drop column if exists active_from/.test(body) && body.indexOf("drop column if exists active_from") > guardAt, "the column the guard protects is dropped only after it");

console.log("\n  RUNNERS");
let rb; try { rb = runnerBody(RB); } catch (e) { rb = e; }
ok(typeof rb === "string" && /do \$\$\nbegin\n  if exists/.test(rb) && (rb.match(/\[runner\]/g) || []).length === 2, "runnerBody strips only the file's begin/commit; the DO block's own begin survives", String(rb).slice(0, 200));
const check = read("scripts/publishing-0071-check.mjs");
ok(/RB_0088[\s\S]*savepoint rb`\);[\s\S]{0,200}runnerBody\(RB_0088\)[\s\S]{0,40}runnerBody\(RB\)/.test(check), "publishing-0071-check unwinds 0088 before 0071 inside its savepoint");

console.log("\n  ROUND TRIP AND MANIFEST ORDER");
const rt = read("scripts/migration-rollback-roundtrip.mjs");
const order = JSON.parse(`[${(/const ORDER = \[([\s\S]*?)\];/.exec(rt) || [, ""])[1].replace(/\s+/g, " ")}]`);
ok(order.indexOf("0071_publishing_reliability") >= 0 && order.indexOf("0071_publishing_reliability") < order.indexOf("0088_content_fanout"), "ORDER lists 0071 before 0088");
ok(/for \(const n of \[\.\.\.ORDER\]\.reverse\(\)\)/.test(rt), "the unwind runs ORDER reversed, so 0088's rollback runs before 0071's");
ok((PREREQUISITES["0088_content_fanout.sql"] || []).includes("0071_publishing_reliability.sql"), "the manifest records that 0088 needs 0071");
ok(!/active_from/.test(code(read("supabase/migrations/0087_audience_events.sql"))), "0087 does not read active_from, so it needs no guard (posts.media_url is kept by 0071's rollback)");
ok(/drop column if exists media_url/.test(body) === false, "0071's rollback keeps posts.media_url, which 0087 reads");

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
