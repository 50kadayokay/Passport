// Write the production runner's connection file by typing ONLY the database password.
//   node scripts/make-prod-dsn-file.mjs            -> ~/.mineex-prod-dsn
//
// Builds the session-pooler URI for production (rvptronniomlqumjhyrr, ca-central-1) as the
// `postgres` role, asks for the password at a hidden prompt, checks it with ONE read-only
// `select 1` (BEGIN READ ONLY ... ROLLBACK; nothing is written), then saves the URI to a file
// OUTSIDE the repo with mode 600 and validates it with the runner's own readDsn(). The password
// is never printed, logged or put on a command line. Delete the file after the rollout.
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import pg from "pg";
import { readDsn, PRODUCTION_REFS } from "./_production-migrations.mjs";

const REF = "rvptronniomlqumjhyrr";
if (!PRODUCTION_REFS.includes(REF)) { console.error("  REFUSING: production ref mismatch"); process.exit(2); }
const HOSTS = ["aws-0-ca-central-1.pooler.supabase.com", "aws-1-ca-central-1.pooler.supabase.com"];
const FILE = path.join(os.homedir(), ".mineex-prod-dsn");

function askHidden(prompt) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) return reject(new Error("run this in a terminal (it needs a hidden prompt)"));
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding("utf8");
    process.stdout.write("\x1b[?2004l" + prompt);
    let raw = "";
    const finish = (err) => {
      stdin.setRawMode(false); stdin.pause(); stdin.removeListener("data", onData);
      process.stdout.write("\n\x1b[?2004h");
      if (err) return reject(err);
      resolve(raw.replace(/\x1b\[[0-9;?]*[ -\/]*[@-~]/g, "").replace(/\x1b/g, "").trim());
    };
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") return finish();
        if (ch === "\u0003") return finish(new Error("cancelled"));
        if (ch === "\u007f" || ch === "\b") { raw = raw.slice(0, -1); continue; }
        if (ch === "\x1b" || ch >= " ") raw += ch;
      }
    };
    stdin.on("data", onData);
  });
}

const dsnFor = (host, pw) => `postgresql://postgres.${REF}:${encodeURIComponent(pw)}@${host}:5432/postgres`;
async function check(dsn) {
  const c = new pg.Client({ connectionString: dsn, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
  try { await c.connect(); await c.query("begin read only"); await c.query("select 1"); await c.query("rollback"); return { ok: true }; }
  catch (e) { return { ok: false, code: e.code || "", msg: String(e.message || e).replace(/postgres(ql)?:\/\/\S+/g, "[dsn]") }; }
  finally { await c.end().catch(() => {}); }
}

console.log(`  Production connection file -- project ${REF} (session pooler, ca-central-1)`);
console.log(`  Saves to ${FILE} (mode 600, outside the repo). Paste the database password; nothing appears.`);
for (let attempt = 1; attempt <= 3; attempt++) {
  let pw;
  try { pw = await askHidden(attempt === 1 ? "  Database password: " : "  Database password (try again): "); }
  catch (e) { console.error(`  ${e.message}`); process.exit(1); }
  if (!pw) { console.log("  (empty)"); continue; }
  let chosen = null, last = null;
  for (const host of HOSTS) {
    const r = await check(dsnFor(host, pw));
    if (r.ok) { chosen = host; break; }
    last = r;
    if (!/Tenant or user not found|ENOTFOUND|EAI_AGAIN/i.test(r.msg)) break;   // wrong password etc: don't try the other host
  }
  if (!chosen) { console.log(`  Not accepted (${last.code || "error"}): ${last.msg.slice(0, 120)}. Nothing was saved.`); continue; }
  fs.writeFileSync(FILE, dsnFor(chosen, pw) + "\n", { mode: 0o600 });
  fs.chmodSync(FILE, 0o600);
  const v = readDsn({ PRODUCTION_DSN_FILE: FILE }, REF);
  console.log(`  Saved. Password accepted (read-only check), host ${chosen}, role ${v.user.split(".")[0]}, file mode ${(fs.statSync(FILE).mode & 0o777).toString(8)}.`);
  console.log("  The runner will use it via PRODUCTION_DSN_FILE. Delete it after the rollout:  rm ~/.mineex-prod-dsn");
  process.exit(0);
}
console.log("  Three attempts failed; nothing was saved."); process.exit(1);
