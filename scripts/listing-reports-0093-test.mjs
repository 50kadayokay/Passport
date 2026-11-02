// 0093 (listing_reports: database rate limit + one row per request) OFFLINE: the
// migration and rollback read as SQL, the numbers against /api/submit's, what the
// installed 1.3.x sheet does on a refusal, the manifest and plan, and the staging
// check's own cases and guard. The live proof is scripts/listing-reports-0093-check.mjs
// (staging; S4 runs it).
//   node scripts/listing-reports-0093-test.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { PENDING, PREREQUISITES } from "./_migration-manifest.mjs";
import { THROTTLE_LIMITS } from "../api/_submissions.js";
import { runnerBody, scanMigrationSql } from "./_db-egress.mjs";
import { PRODUCTION_REFS } from "./_target-guard.mjs";

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };
const read = (f) => fs.readFileSync(f, "utf8");
const code = (s) => s.replace(/--[^\n]*/g, "");

const F = "0093_listing_reports_rate_limit";
const MIG = read(`supabase/migrations/${F}.sql`), RB = read(`supabase/rollbacks/${F}.rollback.sql`);
const m = code(MIG), rb = code(RB);
const fn = (name) => (new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$;`).exec(m) || [""])[0];
const guard = fn("listing_reports_guard"), ipfn = fn("listing_report_client_ip"), netfn = fn("listing_report_network"), keyfn = fn("listing_report_key");

console.log("\n  SHAPE");
ok(/^begin;$/m.test(MIG) && /^commit;$/m.test(MIG) && !!runnerBody(MIG) && !!runnerBody(RB), "migration and rollback are one transaction each (the runner accepts them)");
ok(scanMigrationSql(MIG).length === 0 && scanMigrationSql(RB).length === 0, "no database egress in either");
ok(/create trigger listing_reports_guard\s+after insert on public\.listing_reports\s+referencing new table as new_rows\s+for each statement execute function public\.listing_reports_guard\(\);/.test(m),
  "ONE statement-level AFTER INSERT trigger with the statement's rows as a transition table (runs once per request, sees every row)");
ok([guard, ipfn, keyfn].every((f) => f && /security definer set search_path = public, pg_temp/.test(f)) && netfn && /immutable set search_path = public, pg_temp/.test(netfn), "the guard and helpers are security definer (the network helper: pure, immutable) with search_path public, pg_temp");

console.log("\n  WHO IS LIMITED");
ok(/v_role\s+text := coalesce\(nullif\(current_setting\('request\.jwt\.claims', true\), ''\)::json ->> 'role',\s*current_setting\('role', true\)\);/.test(guard), "the request role: PostgREST's claims, else the session's role");
ok(/if v_role is null or v_role not in \('anon', 'authenticated'\) then return null; end if;/.test(guard), "only anon and authenticated are limited (service role /api/submit and direct sessions pass)");
ok(/if public\.is_admin\(\) then return null; end if;/.test(guard), "MineEx platform admins pass");

console.log("\n  ONE REPORT PER REQUEST");
ok(/select count\(\*\) into v_rows from new_rows;\s*if v_rows = 0 then return null; end if;\s*if v_rows > 1 then\s*raise exception[^;]*using errcode = 'PT400'/.test(guard), "more than one row in the statement -> PT400 (the whole statement, so nothing is stored); zero rows passes");

console.log("\n  THE LIMITS");
const gi = guard.indexOf("values ('lr:global', 'listing_report_db_global'"), ni = guard.indexOf("values (public.listing_report_key('network', v_net), 'listing_report_db_network'"), ki = guard.indexOf("values (public.listing_report_key('client', coalesce(v_ip, 'unknown')), 'listing_report_db_client'");
ok(gi > 0 && gi < ni && ni < ki, "global, then the client's network, then the client -- always that order (no lock-order deadlock)");
ok((guard.match(/on conflict \(ip_hash, form, window_start\) do update set count = t\.count \+ 1\s*returning t\.count into v_count;/g) || []).length === 3, "each counter is an atomic upsert RETURNING the new count (the row lock serializes concurrent inserts: no overshoot)");
ok((guard.match(/using errcode = 'PT429'/g) || []).length === 3 && /v_count > l\.global_per_window/.test(guard) && /v_count > l\.per_network/.test(guard) && /v_count > l\.per_client/.test(guard), "over any limit -> PT429");
ok(/if v_net is not null then/.test(guard) && /listing_report_key\('client', coalesce\(v_ip, 'unknown'\)\)/.test(guard), "no address: no network counter, and one shared 'unknown' client bucket at the per-client limit");
ok(/insert into public\.submission_throttle as t/.test(guard) && ["'listing_report_db_global'", "'listing_report_db_network'", "'listing_report_db_client'"].every((x) => guard.includes(x)), "counters reuse 0057's submission_throttle, in their own forms (not /api/submit's)");
ok(/v_epoch double precision := extract\(epoch from now\(\)\);/.test(guard) && (guard.match(/to_timestamp\(floor\(v_epoch \/ \(l\.\w+_window_minutes \* 60\)\) \* \(l\.\w+_window_minutes \* 60\)\)/g) || []).length === 3, "fixed windows from the transaction's clock (now())");
const D = (col) => Number((new RegExp(`${col}\\s+integer not null default (\\d+)`).exec(m) || [])[1]);
ok(D("per_client") === THROTTLE_LIMITS.MAX_PER_WINDOW && D("client_window_minutes") === THROTTLE_LIMITS.WINDOW_MINUTES, `per client: ${D("per_client")} per ${D("client_window_minutes")} minutes = /api/submit's own policy`);
ok(D("per_network") === 20 && D("network_window_minutes") === 60, "per network (/24, /48): 20 per 60 minutes");
ok(D("global_per_window") === 600 && D("global_window_minutes") === 60, "global: 600 per 60 minutes");
ok(D("global_per_window") / D("per_network") >= 30, "residual risk as documented: tripping the global ceiling needs 30+ distinct networks in an hour");
ok(/30\+ distinct networks within one hour/.test(MIG) && /only until the hour window rolls over/.test(MIG), "...and the migration says so");
ok(/insert into public\.listing_report_limits \(id\) values \(true\) on conflict \(id\) do nothing;/.test(m) && /if not found then\s*l\.per_client := 5;\s*l\.client_window_minutes := 10;\s*l\.per_network := 20; l\.network_window_minutes := 60;\s*l\.global_per_window := 600; l\.global_window_minutes := 60;/.test(guard),
  "the numbers live in one editable row (one UPDATE, no migration), with the same defaults if the row is missing");

console.log("\n  PRUNING");
ok(/delete from public\.submission_throttle t\s*where t\.ctid in \(\s*select x\.ctid from public\.submission_throttle x\s*where x\.form in \('listing_report_db_global', 'listing_report_db_network', 'listing_report_db_client'\)\s*and x\.window_start < now\(\) - interval '1 day'\s*limit 50 for update skip locked\);/.test(guard),
  "every limited insert prunes up to 50 of OUR expired counters (older than a day), skipping rows another insert holds; /api/submit's are not touched");
ok(guard.indexOf("delete from public.submission_throttle") < gi, "...before taking the counter locks");

console.log("\n  THE CLIENT ADDRESS (gateway-set headers only)");
ok(/j ->> 'cf-connecting-ip'/.test(ipfn) && ipfn.indexOf("cf-connecting-ip") < ipfn.indexOf("hops[array_length(hops, 1)]"), "cf-connecting-ip first (the gateway always sets it; a client-supplied one is rejected)");
ok(/string_to_array\(coalesce\(j ->> 'x-forwarded-for', ''\), ','\)/.test(ipfn) && /hops\[array_length\(hops, 1\)\]/.test(ipfn) && !/split_part|hops\[1\]/.test(ipfn), "fallback: the LAST x-forwarded-for hop (the gateway appends the real one), never the first");
ok(!/x-real-ip|true-client-ip/.test(ipfn) && !/x-real-ip|true-client-ip/.test(guard), "x-real-ip and true-client-ip are never read");
ok((ipfn.match(/regexp_replace\([^\n]*'\^\\s\+\|\\s\+\$', '', 'g'\)/g) || []).length === 2 && !/btrim\(/.test(ipfn), "every candidate is trimmed of all surrounding whitespace (tabs, newlines), not just spaces");
ok(/begin v := p_ip::inet; exception when others then return null; end;/.test(netfn) && /set_masklen\(v, case when family\(v\) = 4 then 24 else 48 end\)/.test(netfn), "network: /24 for IPv4, /48 for IPv6; not an address -> none");
ok(/case p_kind when 'network' then 'ln:' else 'lr:' end/.test(keyfn) && /left\(encode\(sha256\(convert_to\(s\.salt \|\| case p_kind when 'network' then '\|net\|' else '\|' end \|\| p_value, 'UTF8'\)\), 'hex'\), 32\)/.test(keyfn), "stored keys: 'lr:' / 'ln:' + 32 hex of SHA-256(salt | value)");
ok(/values \(true, replace\(gen_random_uuid\(\)::text \|\| gen_random_uuid\(\)::text, '-', ''\)\)/.test(m), "the salt is generated in the migration (two v4 UUIDs, core PostgreSQL)");
ok(!/v_ip, 'listing|values \(v_ip|values \(v_net/.test(guard), "an address or network is never written, only its hash");

console.log("\n  NOTHING NEW TO READ");
for (const t of ["listing_report_limits", "submission_throttle_salt"]) {
  ok(new RegExp(`alter table public\\.${t} enable row level security;`).test(m) && new RegExp(`revoke all on public\\.${t} from public, anon, authenticated;`).test(m) && !new RegExp(`create policy[^;]*${t}`).test(m), `${t}: RLS on, no policy, no client grant`);
}
for (const f of ["listing_report_client_ip\\(\\)", "listing_report_network\\(text\\)", "listing_report_key\\(text, text\\)", "listing_reports_guard\\(\\)"]) ok(new RegExp(`revoke all on function public\\.${f} from public, anon, authenticated;`).test(m), `${f.replace(/\\/g, "")}: not executable by clients`);
ok(!/grant /i.test(m) && !/listing_reports_insert|alter policy|drop policy/.test(m), "no grant anywhere, and 0077's policy / 0092's grants untouched");

console.log("\n  REFUSALS THE INSTALLED APP SHOWS");
const g = spawnSync("git", ["show", "prod-v1.3.2:src/aiBrief/PassportProto.jsx"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const sheet = (g.stdout || "").slice((g.stdout || "").indexOf("function ReportListingSheet"), (g.stdout || "").indexOf("function ReportListingSheet") + 1500);
ok(g.status === 0 && /setState\(r\.ok \? "done" : "error"\)/.test(sheet), "1.3.x: any non-2xx answer -> the sheet's error state (a PT429 / PT400 is never shown as success)");
ok(/Prefer: "return=minimal"/.test(sheet) && /JSON\.stringify\(\{ company_slug/.test(sheet), "1.3.x sends ONE object (not an array): the one-row cap never refuses it");
const cur = read("src/aiBrief/PassportProto.jsx");
ok(/if \(r\.status !== 404 && r\.status < 500\) \{ setState\("error"\); return; \}/.test(cur), "the next build: a 4xx from /api/submit is a real refusal, not retried on the direct path");

console.log("\n  ROLLBACK");
for (const [what, re] of [["the trigger", /drop trigger if exists listing_reports_guard on public\.listing_reports;/], ["the guard", /drop function if exists public\.listing_reports_guard\(\);/],
  ["the helpers", /drop function if exists public\.listing_report_key\(text, text\);\s*drop function if exists public\.listing_report_network\(text\);\s*drop function if exists public\.listing_report_client_ip\(\);/],
  ["the salt table", /drop table if exists public\.submission_throttle_salt;/], ["the limits table", /drop table if exists public\.listing_report_limits;/], ["its counters only", /delete from public\.submission_throttle where form in \('listing_report_db_global', 'listing_report_db_network', 'listing_report_db_client'\);/]]) ok(re.test(rb), `rollback removes ${what}`);
ok(!/submission_throttle[^_]/.test(rb.replace(/delete from public\.submission_throttle where form in[^;]*;/, "")) && !/drop table if exists public\.submission_throttle;/.test(rb), "...and leaves 0057's table and /api/submit's counters alone");

console.log("\n  MANIFEST AND PLAN");
ok(`${F}.sql` in PENDING && /0092/.test(PENDING[`${F}.sql`]), "0093 is PENDING, and says it runs right after 0092");
ok(JSON.stringify(PREREQUISITES[`${F}.sql`]) === JSON.stringify(["0057_submission_throttle.sql", "0092_listing_reports_column_insert.sql"]), "PREREQUISITES: 0057 (the throttle table) and 0092");
const plan = read("docs/PRODUCTION-ROLLOUT-PLAN.md");
const rows = [...plan.matchAll(/^\| (\d+) \| `([^`]+)` \| ([^|]+) \|/gm)].map((x) => ({ f: x[2], phase: x[3].trim() }));
const i92 = rows.findIndex((r) => r.f === "0092_listing_reports_column_insert.sql"), i93 = rows.findIndex((r) => r.f === `${F}.sql`);
ok(i93 === i92 + 1 && rows[i93].phase === "3", "the rollout plan runs 0093 in Phase 3, immediately after 0092");
ok(/A sixth listing report from one device inside 10 minutes is refused, and so is a request carrying two reports \(0093\)/.test(plan), "the Phase 3 checkpoint names it");

console.log("\n  THE STAGING CHECK");
const chk = read("scripts/listing-reports-0093-check.mjs");
for (const [label, re] of [
  ["the 1.3.x insert stored", /anon, one object, six columns, a gateway address -> stored/],
  ["boundary: Nth stored, N+1th refused", /client B, report \$\{i\} of 3 -> stored[\s\S]*client B, report 4 -> refused PT429, not stored/],
  ["a refusal consumes nothing", /a refused report does not consume the window/],
  ["window reset", /window reset: with the counter moved into the previous window/],
  ["per-client separation", /per-client separation/],
  ["the per-network limit", /a NEW address in that \/24 -> refused PT429/],
  ["the last-hop fallback", /the LAST x-forwarded-for hop/],
  ["a forged first hop never changes the bucket", /a forged FIRST hop \(or extra hops\) never changes the bucket/],
  ["true-client-ip and x-real-ip ignored", /true-client-ip and x-real-ip are never read/],
  ["pruning", /one limited insert prunes a batch of up to 50 expired counters/],
  ["the global ceiling", /two NEW networks pass, a third is refused \(PT429\)/],
  ["the bulk cap", /a 2-row insert \(a JSON array\) -> refused whole, PT400/],
  ["concurrency on separate connections", /parallel inserts for one fresh client: exactly \$\{L\} stored/],
  ["service role unaffected", /service role \(\/api\/submit\): 8 inserts/],
  ["platform admin unaffected", /a MineEx platform admin \(is_admin\(\)\): not limited/],
  ["no raw IP stored, nothing readable", /no raw address or network is stored[\s\S]*cannot read the throttle, the limits or the salt/],
  ["the rollback restores exactly", /the rollback restores exactly the pre-0093 objects/],
]) ok(re.test(chk), `covers: ${label}`);
ok(/await c\.query\("begin"\);[\s\S]*finally \{\s*await c\.query\("rollback"\)/.test(chk) && /if \(!isCommitted\) \{\s*console\.log\("  - SKIPPED/.test(chk) && /delete from public\.listing_reports where company_slug = \$1 returning 1/.test(chk),
  "part 1 is one rolled-back transaction; part 2 runs only against a committed 0093 and deletes what it wrote");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lr0093-"));
fs.mkdirSync(path.join(tmp, "supabase/staging"), { recursive: true });
fs.writeFileSync(path.join(tmp, "supabase/staging/.connection"), `postgresql://nobody@db.${PRODUCTION_REFS[0]}.supabase.invalid:5432/postgres\n`);
const run = spawnSync(process.execPath, [path.resolve("scripts/listing-reports-0093-check.mjs")], { cwd: tmp, encoding: "utf8", timeout: 20000 });
ok(run.status === 2 && /REFUSING: not the staging project/.test(run.stderr), "the check refuses a production connection (exit 2) before connecting", `${run.status} ${(run.stderr || "").slice(0, 200)}`);
fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\n  listing-reports-0093: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
