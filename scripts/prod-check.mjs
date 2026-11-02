// One READ-ONLY check per rollout step, for the operator's own terminal.
//
//   PRODUCTION_DSN_FILE=~/.mineex-prod-dsn node scripts/prod-check.mjs --stage=deploy
//   ... --stage=phase3 | phase4 | phase5 | phase5b | final
//   node scripts/prod-check.mjs --staging --app <staging web URL> --stage=final      (dry run)
//
// STAGES (docs/PRODUCTION-ROLLOUT-PLAN.md, Runbook):
//   deploy   after the Vercel deploy, before any migration
//   phase3 / phase4 / phase5 / phase5b   after that phase's last migration
//   final    after 0091, before the pilot opens (same checks as phase5b)
//
// EACH STAGE RUNS
//   1. scripts/production-smoke.mjs (S3/S4): pages, security headers, CSP
//      Report-Only, guest browsing and private-table refusals, the investor feed,
//      a company profile, its posts and follower count, Mine IQ refused to an
//      investor, the owner's portal reads, viewer refusals. A check that needs a
//      migration this stage has not reached is reported NOT YET, not FAIL.
//   2. /api/ops: refused to a guest (401); with the admin account, reachable and
//      reporting the listing-report limit once 0093 is in.
//   3. Catalog checkpoints, each in its own READ ONLY transaction (the server
//      refuses any write), using the production runner's own markers
//      (scripts/_production-migrations.mjs buildPlan -> checkpoint): every
//      migration up to this stage reads applied, every later one reads not yet.
//   4. Catalog: the listing-report guard (0092/0093) is in place without submitting
//      a report -- trigger enabled, the six-column grant, no client access to the
//      counters or functions, the limits row; and no pg_cron outbox-drain job
//      (the pilot keeps scheduled delivery off).
//
// SAFETY
//   - Nothing writes. HTTP goes through production-smoke's refuseRequest guard
//     (GET/HEAD, the password sign-in and sign-out, read-only RPCs only). Catalog
//     reads run in BEGIN READ ONLY ... ROLLBACK with statement and lock timeouts.
//   - Production by default; --staging targets staging and nothing else (each
//     refuses the other's URL and DSN).
//   - Accounts are asked for at a hidden prompt (no env files, no arguments):
//     investor, owner, optional viewer, optional platform admin. Empty answers
//     skip that account (the stage is then INCOMPLETE). --no-accounts skips them.
//   - The DSN: production from PRODUCTION_DSN_FILE (the runner's rules: outside
//     the repo, mode 600, the production project, role postgres); staging from
//     supabase/staging/.connection. --no-db skips the catalog (INCOMPLETE).
//   - Output: PASS / FAIL / INCOMPLETE / NOT YET per check, secrets redacted.
//
// EXIT: 0 PASS · 1 FAIL · 2 REFUSED · 3 INCOMPLETE
import fs from "node:fs";
import readline from "node:readline";
import { pathToFileURL } from "node:url";
import { parseTarget, runSmoke, refuseRequest, makeRedactor, anonKeyFromBundle } from "./production-smoke.mjs";
import { PRODUCTION_REFS, STAGING_REFS, DEFAULT_AUDIT, loadRecord, parseQ01Markers, buildPlan, readDsn } from "./_production-migrations.mjs";

export const STAGES = ["deploy", "phase3", "phase4", "phase5", "phase5b", "final"];
const PHASE_OF_STAGE = { deploy: 2, phase3: 3, phase4: 4, phase5: 5, phase5b: 6, final: 6 };
const PHASE_RANK = { "3": 3, "4": 4, "5": 5, "5b": 6 };
const PROD = { ref: PRODUCTION_REFS[0], app: "https://mineex.ca" };
const STAGING = { ref: STAGING_REFS[0] };
const sbUrl = (ref) => `https://${ref}.supabase.co`;

// Smoke checks that need a migration the stage may not have reached (FAIL -> NOT YET).
export const SMOKE_NEEDS = [
  [/the server counts them as a manager|the server refuses a viewer|sees the company as viewer|reads the notifications/, "0076_company_roles.sql"],
  [/Mine IQ conversations load/, "0066_mineiq_conversations.sql"],
];

/** { stage, staging, app, apiOnly, noAccounts, noDb } or { refuse }. */
export function parseArgs(argv) {
  const val = (k) => { const a = argv.find((x) => x.startsWith(`${k}=`)); if (a) return a.slice(k.length + 1); const i = argv.indexOf(k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null; };
  const known = new Set(["--stage", "--staging", "--app", "--api-only", "--no-accounts", "--no-db"]);
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i].split("=")[0];
    if (!known.has(k)) return { refuse: `unknown argument ${argv[i]}` };
    if ((k === "--stage" || k === "--app") && !argv[i].includes("=")) i++;
  }
  const stage = val("--stage");
  if (!STAGES.includes(stage)) return { refuse: `--stage must be one of ${STAGES.join(", ")}` };
  const staging = argv.includes("--staging");
  const app = val("--app") || (staging ? null : PROD.app);
  if (!app) return { refuse: "--staging needs --app <the staging web app or API URL>; nothing defaults to staging" };
  const ref = staging ? STAGING.ref : PROD.ref;
  const t = parseTarget(["--app", app, "--supabase", sbUrl(ref), ...(staging ? [] : ["--production"]), ...(argv.includes("--api-only") ? ["--api-only"] : [])]);
  if (t.refuse) return { refuse: t.refuse };
  if (staging && /mineex\.ca$/i.test(new URL(t.app).hostname)) return { refuse: "--staging with the production web app; give the staging app URL" };
  if (!staging && new URL(t.app).hostname !== new URL(PROD.app).hostname) return { refuse: `production checks run against ${PROD.app}; --app can only change it together with --staging` };
  return { stage, staging, target: t, ref, noAccounts: argv.includes("--no-accounts"), noDb: argv.includes("--no-db") };
}

/** Phase of each pending migration, from the plan's migration-order table. */
export function phasesFromPlan(planText) {
  const block = (/<!-- migration-order:start -->([\s\S]*?)<!-- migration-order:end -->/.exec(planText) || [])[1] || "";
  const out = {};
  for (const l of block.split("\n")) {
    const c = l.split("|").slice(1, -1).map((s) => s.trim());
    const file = (/`([^`]+\.sql)`/.exec(c[1] || "") || [])[1];
    if (file && PHASE_RANK[c[2]]) out[file] = PHASE_RANK[c[2]];
  }
  return out;
}

/** Hidden prompt. null when there is no terminal. */
export function makeAsk({ input = process.stdin, output = process.stdout } = {}) {
  if (!input.isTTY) return null;
  return (question, { hidden = false } = {}) => new Promise((resolve) => {
    const rl = readline.createInterface({ input, output, terminal: true });
    if (hidden) rl._writeToOutput = (s) => { if (s.includes(question)) output.write(question); };
    rl.question(question, (a) => { rl.close(); if (hidden) output.write("\n"); resolve(String(a || "").trim()); });
  });
}

export async function askAccounts(ask) {
  const acc = {};
  for (const [k, label, optional] of [["INVESTOR", "test investor", false], ["OWNER", "test company owner", false], ["VIEWER", "test company viewer (optional)", true], ["ADMIN", "platform admin, for /api/ops (optional)", true]]) {
    const email = await ask(`  ${label} email${optional ? " (Enter to skip)" : ""}: `);
    if (!email) continue;
    const password = await ask(`  ${label} password (hidden): `, { hidden: true });
    if (password) { acc[`SMOKE_${k}_EMAIL`] = email; acc[`SMOKE_${k}_PASSWORD`] = password; }
  }
  const slug = await ask("  owner's company slug (Enter for their first): ");
  if (slug) acc.SMOKE_COMPANY_SLUG = slug;
  return acc;
}

/** One statement in its own READ ONLY transaction. */
export async function readOnly(client, sql, args) {
  await client.query("begin read only");
  try {
    await client.query("set local statement_timeout = '15s'");
    await client.query("set local lock_timeout = '2s'");
    const ro = (await client.query("show transaction_read_only")).rows[0].transaction_read_only;
    if (ro !== "on") throw new Error("the transaction is not read-only; refusing to continue");
    return (await client.query(sql, args)).rows;
  } finally { await client.query("rollback").catch(() => {}); }
}

export async function runCheck({ argv, env = {}, fetchImpl = globalThis.fetch, pgConnect, ask, out = console.log, err = console.error, read = (f) => fs.readFileSync(f, "utf8"), repoRoot = process.cwd() }) {
  const a = parseArgs(argv);
  if (a.refuse) { err(`\n  prod-check: REFUSING -- ${a.refuse}\n`); return { verdict: "REFUSED", code: 2 }; }
  const { stage, staging, target } = a;
  const reached = PHASE_OF_STAGE[stage];
  const counts = { PASS: 0, FAIL: 0, INCOMPLETE: 0, "NOT YET": 0, INFO: 0 };
  let redact = makeRedactor([]);
  const line = (kind, m, d = "") => { counts[kind]++; (kind === "FAIL" ? err : out)(redact(`  ${kind.padEnd(10)} ${m}${d ? `  (${d})` : ""}`)); };
  const head = (m) => out(`\n  ${m}`);
  out(`\n  prod-check --stage=${stage}  ${staging ? `STAGING (${STAGING.ref}, dry run)` : `PRODUCTION (${PROD.ref}), read-only`}  ${target.app}`);

  // Migrations: phase per file (the plan) and marker per file (the runner).
  let phases = {}, items = [];
  try {
    phases = phasesFromPlan(read("docs/PRODUCTION-ROLLOUT-PLAN.md"));
    const record = loadRecord(DEFAULT_AUDIT);
    const q01 = parseQ01Markers(read(record.query.split(" ")[0]));
    items = buildPlan({ files: fs.readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")), record, log: [], q01Markers: q01 }).items;
  } catch (e) { line("FAIL", "the plan's phases and the runner's markers load", e.message); }
  const expected = (f) => (phases[f] || 99) <= reached;
  const missingPhase = items.filter((i) => !phases[i.file]).map((i) => i.file);
  if (missingPhase.length) line("FAIL", "every pending migration has a phase in the plan", missingPhase.join(", "));
  const has = (f) => expected(f);

  // Accounts.
  let acc = {};
  if (a.noAccounts) line("INCOMPLETE", "accounts", "--no-accounts");
  else if (!ask) line("INCOMPLETE", "accounts", "no terminal for the hidden prompt");
  else { head("ACCOUNTS (hidden; nothing is stored)"); acc = await askAccounts(ask); }
  // The publishable key is public (it ships in the app); only an api-only target needs it given.
  if (env.SMOKE_ANON_KEY) acc.SMOKE_ANON_KEY = env.SMOKE_ANON_KEY;
  redact = makeRedactor(Object.entries(acc).filter(([k]) => /PASSWORD/.test(k)).map(([, v]) => v));

  // 1. Smoke, with NOT YET for checks this stage cannot pass yet.
  head("SMOKE (scripts/production-smoke.mjs)");
  const smokeLine = (s) => {
    const text = String(s);
    for (const l of text.split("\n")) {
      const m = l.match(/^\s+(✓|✗|- SKIP) (.*)$/);
      if (!m) { if (l.trim() && !/production-smoke:/.test(l)) out(redact(l)); continue; }
      const what = m[2];
      if (m[1] === "✓") line("PASS", what);
      // An optional account (the viewer) left out is information, not a gap.
      else if (m[1] === "- SKIP") line(/\(optional\)/.test(what) ? "INFO" : "INCOMPLETE", what.replace(/^SKIP /, ""));
      else {
        const need = SMOKE_NEEDS.find(([re]) => re.test(what));
        if (need && !has(need[1])) line("NOT YET", what.split("\n")[0], `needs ${need[1]}, phase ${Object.keys(PHASE_RANK).find((k) => PHASE_RANK[k] === phases[need[1]])}`);
        else line("FAIL", what.split("\n")[0], (what.split("\n")[1] || "").trim());
      }
    }
  };
  let smoke = null;
  try { smoke = await runSmoke({ target, env: acc, fetchImpl, out: smokeLine, err: smokeLine }); }
  catch (e) { line("FAIL", "the smoke run completed", e.message); }

  // 2. /api/ops through the same guard.
  head("/api/ops");
  const send = async (method, url, { headers = {}, body } = {}) => {
    const why = refuseRequest(method, url, target);
    if (why) throw new Error(`read-only guard: ${why}`);
    const r = await fetchImpl(url, { method, headers: { ...headers, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
    const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch { /* not JSON */ }
    return { status: r.status, body: j, text };
  };
  try {
    const g = await send("GET", `${target.app}/api/ops?view=listing-reports`);
    if (g.status === 401) line("PASS", "/api/ops refuses a guest (401)");
    else line("FAIL", "/api/ops refuses a guest (401)", `HTTP ${g.status}`);
    if (!acc.SMOKE_ADMIN_EMAIL) line("INCOMPLETE", "/api/ops as a platform admin", "no admin account given");
    else {
      // The publishable key: given, or read from the app's bundle (where it ships by design).
      const keyFrom = acc.SMOKE_ANON_KEY || (await (async () => {
        const h = await send("GET", `${target.app}/`);
        const src = (h.text.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/) || [])[1];
        return src ? anonKeyFromBundle((await send("GET", new URL(src, target.app).href)).text, a.ref) : null;
      })().catch(() => null));
      if (!keyFrom) line("INCOMPLETE", "/api/ops as a platform admin", "no publishable key");
      else {
        redact = makeRedactor([...Object.entries(acc).filter(([k]) => /PASSWORD/.test(k)).map(([, v]) => v), keyFrom]);
        const s = await send("POST", `${target.supabase}/auth/v1/token?grant_type=password`, { headers: { apikey: keyFrom }, body: { email: acc.SMOKE_ADMIN_EMAIL, password: acc.SMOKE_ADMIN_PASSWORD } });
        const tok = s.body && s.body.access_token;
        if (!tok) line("FAIL", "the admin signs in", `HTTP ${s.status}`);
        else {
          redact = makeRedactor([...Object.entries(acc).filter(([k]) => /PASSWORD/.test(k)).map(([, v]) => v), keyFrom, tok, s.body.refresh_token]);
          try {
            const r = await send("GET", `${target.app}/api/ops?view=listing-reports`, { headers: { Authorization: `Bearer ${tok}` } });
            const lr = r.body && r.body.listingReports;
            if (r.status !== 200 || !lr) line("FAIL", "/api/ops answers a platform admin", `HTTP ${r.status}`);
            else if (has("0093_listing_reports_rate_limit.sql")) {
              if (lr.available) line("PASS", `/api/ops reports the listing-report limit: ${lr.globalCount} of ${lr.globalLimit} this hour`);
              else line("FAIL", "/api/ops reports the listing-report limit (0093 should be in)", lr.reason);
              if (lr.capHit) line("FAIL", "the listing-report global cap is NOT full", `${lr.globalCount}/${lr.globalLimit}: installed apps' reports are being refused`);
              else if (lr.warn) line("INFO", `listing reports at ${Math.round(lr.ratio * 100)}% of the hourly cap`);
            } else line(lr.available ? "INFO" : "PASS", `/api/ops answers a platform admin${lr.available ? "" : " (listing-report limit: not yet, 0093 is phase 3)"}`);
          } finally { await send("POST", `${target.supabase}/auth/v1/logout`, { headers: { apikey: keyFrom, Authorization: `Bearer ${tok}` } }).catch(() => {}); }
        }
      }
    }
  } catch (e) { line("FAIL", "/api/ops checks completed", e.message); }

  // 3 + 4. Catalog, read-only.
  head("CATALOG (each statement in its own READ ONLY transaction)");
  let client = null;
  if (a.noDb) line("INCOMPLETE", "catalog checkpoints", "--no-db");
  else {
    try {
      let dsn;
      if (staging) {
        dsn = read("supabase/staging/.connection").trim();
        if (!dsn.includes(STAGING.ref) || PRODUCTION_REFS.some((r) => dsn.includes(r))) throw new Error("supabase/staging/.connection does not name only the staging project");
      } else dsn = readDsn(env, PROD.ref, { repoRoot }).dsn;
      client = await pgConnect(dsn);
    } catch (e) { line("INCOMPLETE", "catalog checkpoints", `no database connection: ${e.message}`); }
  }
  if (client) {
    try {
      for (const it of items) {
        const want = expected(it.file);
        if (!it.checkpoint) { line("FAIL", `${it.file}: has a checkpoint marker`); continue; }
        let got;
        try { got = (await readOnly(client, it.checkpoint))[0].applied === true; }
        catch (e) { line("FAIL", `${it.file}: marker reads`, e.code || e.message); continue; }
        if (want && got) line("PASS", `${it.file}: applied`);
        else if (want) line("FAIL", `${it.file}: applied (this stage is past its phase)`, "marker reads NOT applied");
        else if (!got) line("NOT YET", `${it.file}: not applied yet`, `phase ${Object.keys(PHASE_RANK).find((k) => PHASE_RANK[k] === phases[it.file])}`);
        else if (staging) line("INFO", `${it.file}: applied on staging, ahead of this stage (expected: staging has everything)`);
        else line("FAIL", `${it.file}: not applied before its phase`, "marker reads APPLIED: production is ahead of the plan or the log");
      }
      const one = async (sql) => (await readOnly(client, sql))[0];
      if (has("0093_listing_reports_rate_limit.sql")) {
        const g = await one(`select
          exists (select 1 from pg_trigger where tgrelid = 'public.listing_reports'::regclass and tgname = 'listing_reports_guard' and tgenabled = 'O') trig,
          (select coalesce(bool_or(has_function_privilege(r, p.oid, 'EXECUTE')), false) from pg_proc p, unnest(array['anon','authenticated']) r
             where p.pronamespace = 'public'::regnamespace and p.proname in ('listing_reports_guard','listing_report_client_ip','listing_report_network','listing_report_key')) exec,
          (select coalesce(bool_or(has_table_privilege(r, t, x)), false) from unnest(array['anon','authenticated']) r,
             unnest(array['public.submission_throttle','public.listing_report_limits','public.submission_throttle_salt']) t, unnest(array['SELECT','INSERT','UPDATE','DELETE']) x) tbl,
          has_table_privilege('anon', 'public.listing_reports', 'SELECT') sel,
          has_table_privilege('anon', 'public.listing_reports', 'INSERT') tableins,
          (select count(*)::int from unnest(array['company_slug','company_name','kind','message','contact','user_id']) c where has_column_privilege('anon', 'public.listing_reports', c, 'INSERT')) six,
          has_column_privilege('anon', 'public.listing_reports', 'created_at', 'INSERT') at,
          (select row_to_json(l) from (select per_client, client_window_minutes, per_network, network_window_minutes, global_per_window, global_window_minutes from public.listing_report_limits where id) l) lim`);
        if (g.trig) line("PASS", "listing_reports_guard trigger is in place and enabled (0093)"); else line("FAIL", "listing_reports_guard trigger is in place and enabled (0093)");
        if (!g.exec && !g.tbl) line("PASS", "clients cannot execute 0093's functions or touch its counters, limits or salt"); else line("FAIL", "clients cannot execute 0093's functions or touch its counters, limits or salt", `execute ${g.exec}, tables ${g.tbl}`);
        if (!g.sel && !g.tableins && g.six === 6 && !g.at) line("PASS", "anon: INSERT on the six report columns only (0092), no SELECT"); else line("FAIL", "anon: INSERT on the six report columns only (0092), no SELECT", JSON.stringify({ sel: g.sel, tableins: g.tableins, six: g.six, created_at: g.at }));
        if (g.lim) line("PASS", `limits: client ${g.lim.per_client}/${g.lim.client_window_minutes} min, network ${g.lim.per_network}/${g.lim.network_window_minutes} min, global ${g.lim.global_per_window}/${g.lim.global_window_minutes} min`); else line("FAIL", "the listing_report_limits row exists");
      } else line("NOT YET", "the listing-report guard (0092/0093)", "phase 3");
      const cron = await one(`select to_regclass('cron.job') is not null has_cron`);
      if (!cron.has_cron) line("PASS", "no pg_cron: nothing schedules an outbox drain (pilot)");
      else {
        const j = await one(`select count(*)::int n from cron.job where command ilike '%dispatch%' or jobname = 'outbox-drain'`);
        if (j.n === 0) line("PASS", "pg_cron is present but schedules no outbox drain (pilot)"); else line("FAIL", "no scheduled outbox drain in the pilot", `${j.n} job(s)`);
      }
    } catch (e) { line("FAIL", "catalog checks completed", e.message); }
    finally { await client.end().catch(() => {}); }
  }

  const verdict = counts.FAIL ? "FAIL" : counts.INCOMPLETE ? "INCOMPLETE" : "PASS";
  out(`\n  prod-check --stage=${stage}: ${counts.PASS} PASS, ${counts.FAIL} FAIL, ${counts.INCOMPLETE} INCOMPLETE, ${counts["NOT YET"]} NOT YET (expected at this stage), ${counts.INFO} INFO -> ${verdict}\n`);
  return { verdict, counts, code: verdict === "PASS" ? 0 : verdict === "FAIL" ? 1 : 3 };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const { default: pg } = await import("pg");
  const caFile = (process.env.PRODUCTION_DB_CA_FILE || "").trim();
  const pgConnect = async (dsn) => {
    const c = new pg.Client({ connectionString: dsn, ssl: caFile ? { ca: fs.readFileSync(caFile, "utf8"), rejectUnauthorized: true } : { rejectUnauthorized: false }, application_name: "mineex-prod-check" });
    await c.connect();
    await c.query("set default_transaction_read_only = on");
    return c;
  };
  const res = await runCheck({ argv: process.argv.slice(2), env: process.env, pgConnect, ask: makeAsk() });
  process.exit(res.code);
}
