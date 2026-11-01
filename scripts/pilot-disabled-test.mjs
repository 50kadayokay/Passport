// For the pilot, scheduled delivery, the outbox drain and push stay DISABLED.
// OFFLINE. Two halves:
//   - every `file:line` cited in docs/PILOT-DISABLED-DELIVERY.md still holds
//     the quoted text (so the write-up cannot silently go stale);
//   - structural checks that fail if any of the guarantees change: the cron
//     list, pg_cron / pg_net in pending migrations, what invokes the dispatcher,
//     the PUSH_ENABLED gate, and which migrations subscribe which listener.
//   node scripts/pilot-disabled-test.mjs
import fs from "node:fs";
import { PENDING, DEFERRED } from "./_migration-manifest.mjs";

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const read = (f) => fs.readFileSync(f, "utf8");
const sqlCode = (s) => s.replace(/--[^\n]*/g, "");
const jsCode = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

const DOC = read("docs/PILOT-DISABLED-DELIVERY.md");

console.log("\n  EVIDENCE CITED IN docs/PILOT-DISABLED-DELIVERY.md");
const cells = (l) => l.split(/(?<!\\)\|/).slice(1, -1).map((s) => s.trim());
const rows = DOC.split("\n").filter((l) => /^\|\s*\d+[a-z]?\s*\|/.test(l)).map(cells);
ok(rows.length >= 20, `the checklist parses (${rows.length} rows)`);
for (const [n, , ev, quoted] of rows) {
  const want = (/^`([\s\S]*)`$/.exec(quoted) || [, ""])[1].replace(/\\\|/g, "|");
  const m = /^`([^`:]+):(\d+)`$/.exec(ev);
  if (m) {
    const line = fs.existsSync(m[1]) ? read(m[1]).split("\n")[Number(m[2]) - 1] || "" : "";
    ok(want && line.includes(want), `row ${n}: ${m[1]}:${m[2]} holds the quoted text`, `line is: ${line.trim().slice(0, 160)}`);
  } else {
    const f = (/^`([^`]+)`/.exec(ev) || [])[1];
    ok(f && fs.existsSync(f) && read(f).includes(want), `row ${n}: ${f} contains the quoted text`);
  }
}

console.log("\n  CRON");
const vercel = JSON.parse(read("vercel.json"));
const paths = (vercel.crons || []).map((c) => c.path);
ok(JSON.stringify(paths) === JSON.stringify(["/api/news-pull", "/api/news-process", "/api/news-notify", "/api/news-push-send"]), "vercel.json schedules exactly the four news jobs", paths.join(", "));
ok(!paths.some((p) => /dispatch|drain|outbox|deliver/i.test(p)), "no cron points at the dispatcher or a drain");

console.log("\n  DATABASE SCHEDULING (pending migrations)");
const scheduling = Object.keys(PENDING).filter((f) => fs.existsSync(`supabase/migrations/${f}`)).filter((f) =>
  /create\s+extension[^;]*\b(pg_cron|pg_net)\b|\bcron\.schedule\s*\(|\bnet\.http_\w+\s*\(/i.test(sqlCode(read(`supabase/migrations/${f}`))));
ok(scheduling.length === 0, `no pending migration (${Object.keys(PENDING).length}) enables pg_cron / pg_net or schedules a job`, scheduling.join(", "));
ok("0011_outbox_ops.sql" in DEFERRED && !("0011_outbox_ops.sql" in PENDING), "0011 (outbox-drain) is DEFERRED, not pending");
ok("0055_enable_device_push.sql" in DEFERRED && !("0055_enable_device_push.sql" in PENDING), "0055 (device push) is DEFERRED, not pending");

console.log("\n  WHAT INVOKES THE DISPATCHER");
const dispatch = jsCode(read("api/dispatch.js"));
const handler = dispatch.slice(dispatch.indexOf("export default async function handler"));
const getBranch = handler.slice(handler.indexOf('if (req.method === "GET")'), handler.indexOf("} else {"));
ok(/if \(!isTrustedCron\(req\)\) return res\.status\(401\)/.test(getBranch) && /trigger = "cron"/.test(getBranch), "a GET runs only with the cron bearer");
const postBranch = handler.slice(handler.indexOf("} else {"), handler.indexOf("const worker"));
ok(/if \(!checkDispatchSecret\(req\)\) return res\.status\(401\)/.test(postBranch), "a POST runs only with x-dispatch-secret (backfill aside)");
const callers = fs.readdirSync("api").filter((f) => f.endsWith(".js") && f !== "_service.js" && /invokeDispatchBestEffort\(\)/.test(jsCode(read(`api/${f}`)))).sort();
ok(JSON.stringify(callers) === JSON.stringify(["ops.js", "publish.js", "revise-release.js", "unpublish.js"]), "only publish, unpublish, revise-release and ops nudge the dispatcher", callers.join(", "));
const nudge = jsCode(read("api/_service.js"));
const nudgeFn = nudge.slice(nudge.indexOf("export async function invokeDispatchBestEffort"));
ok(nudgeFn.indexOf('if (!secret) return { dispatched: false') > 0 && nudgeFn.indexOf('if (!secret) return { dispatched: false') < nudgeFn.indexOf("await fetch("), "the nudge is skipped without DISPATCH_SECRET, before any request");
const srcFiles = fs.readdirSync("src", { recursive: true }).filter((f) => /\.(jsx?|mjs)$/.test(f));
ok(!srcFiles.some((f) => /\/api\/dispatch\b/.test(read(`src/${f}`))), "no browser code calls /api/dispatch");

console.log("\n  PUSH");
const push = jsCode(read("api/news-push-send.js"));
ok(/function pushEnabled\(\) \{\s*return String\(process\.env\.PUSH_ENABLED \|\| ""\) === "true";\s*\}/.test(push), "push is on only for PUSH_ENABLED exactly \"true\"");
const pushHandler = push.slice(push.indexOf("export default async function handler"));
const gate = pushHandler.indexOf("if (!pushEnabled()) {");
const gateEnd = pushHandler.indexOf("\n  }\n", gate);
ok(gate > 0 && gateEnd > gate, "the handler branches on pushEnabled()");
const before = pushHandler.slice(0, gateEnd);
ok(!/http2\.connect|fcmSendOne|fcmAccessToken|claim_notification_outbox|sendOne\(|deliverBatch\(/.test(before), "no provider call or claim before (or inside) the disabled branch");
ok(/return res\.status\(200\)\.json\(\{[\s\S]*pushEnabled: false,[\s\S]*sent: 0,/.test(pushHandler.slice(gate, gateEnd)), "the disabled branch returns sent: 0");

console.log("\n  LISTENER SUBSCRIPTIONS");
const subscribers = (listener) => fs.readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql") && new RegExp(`'${listener}'`).test(sqlCode(read(`supabase/migrations/${f}`))) && /insert into public\.listener_subscriptions/i.test(sqlCode(read(`supabase/migrations/${f}`))));
ok(JSON.stringify(subscribers("device_push_v1")) === JSON.stringify(["0055_enable_device_push.sql"]), "device_push_v1 is subscribed only by deferred 0055", subscribers("device_push_v1").join(", "));
for (const l of ["site_content_v1", "conference_content_v1"]) ok(JSON.stringify(subscribers(l)) === JSON.stringify(["0088_content_fanout.sql"]), `${l} is subscribed only by 0088`, subscribers(l).join(", "));
ok(/insert into public\.listener_subscriptions \(listener, event_type, active_from\)/.test(sqlCode(read("supabase/migrations/0088_content_fanout.sql"))), "0088 subscribes them with active_from (no historical replay)");

console.log("\n  ROLLOUT PLAN");
const plan = read("docs/PRODUCTION-ROLLOUT-PLAN.md");
ok(/Must NOT be set in production[\s\S]{0,400}`PUSH_ENABLED=true`/.test(plan), "the plan lists PUSH_ENABLED=true as must-not-set");
ok(plan.includes("docs/PILOT-DISABLED-DELIVERY.md"), "the plan points at this proof");

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
