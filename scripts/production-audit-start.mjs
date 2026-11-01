// Start the production read-only audit by typing ONLY the database password.
//   node scripts/production-audit-start.mjs
//
// Builds the Session-pooler connection string for the production project
// (rvptronniomlqumjhyrr, ca-central-1) itself, asks for the password at a hidden
// prompt (nothing is echoed), and runs the committed, unchanged runner:
//   scripts/production-audit-run.mjs --target production <audit.sql> <results.json>
// with the connection string passed in its environment only. The pooler host
// is aws-0-… or aws-1-…; it tries aws-0 first and moves on ONLY if that pooler
// answers "Tenant or user not found" (it serves a different cluster) or the
// name does not resolve. The password is never printed, logged, saved or put
// on a command line. AUDIT_POOLER_HOSTS (comma list) overrides the hosts, for
// testing against unreachable names.
import { spawn } from "node:child_process";

const PROJECT = "rvptronniomlqumjhyrr";
const HOSTS = (process.env.AUDIT_POOLER_HOSTS || "aws-0-ca-central-1.pooler.supabase.com,aws-1-ca-central-1.pooler.supabase.com").split(",").map((h) => h.trim()).filter(Boolean);
// Optional: node scripts/production-audit-start.mjs <audit.sql> <results.json>
// Only files in supabase/audit/ and results in its gitignored results/ folder.
const SQL = process.argv[2] || "supabase/audit/production_readiness_2026_10_31.sql";
const OUT = process.argv[3] || "supabase/audit/results/production-2026-10-31.json";
if (!/^supabase\/audit\/[\w.-]+\.sql$/.test(SQL) || !/^supabase\/audit\/results\/[\w.-]+\.json$/.test(OUT)) {
  console.error("  REFUSING: the audit must be a file in supabase/audit/ and the result go to supabase/audit/results/."); process.exit(2);
}

// Hidden prompt that survives a terminal PASTE. zsh leaves "bracketed paste"
// on, so a paste arrives wrapped in ESC[200~ ... ESC[201~ markers; those (and
// any other escape sequence) are never part of the password. Paste-wrapping is
// switched off while the prompt is open and restored afterwards. A paste that
// ends in a newline submits, exactly like pressing Enter.
function askHidden(prompt) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) return reject(new Error("run this in a terminal (it needs a hidden prompt)"));
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding("utf8");   // echo off BEFORE the prompt shows
    process.stdout.write("\x1b[?2004l" + prompt);                       // bracketed paste off
    let raw = "";
    const finish = (err) => {
      stdin.setRawMode(false); stdin.pause(); stdin.removeListener("data", onData);
      process.stdout.write("\n\x1b[?2004h");                            // restore for the shell
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

// AUDIT_DRYRUN=1 (tests only): no connection is made. The fake answer is
// "password authentication failed" unless the password's sha256 equals
// AUDIT_DRYRUN_SHA, so the retry path can be exercised offline.
async function dryRun(dsn) {
  const { createHash } = await import("node:crypto");
  const pw = decodeURIComponent(dsn.slice(dsn.indexOf(":", 14) + 1, dsn.lastIndexOf("@")));
  const sha = createHash("sha256").update(pw).digest("hex");
  const accepted = sha === process.env.AUDIT_DRYRUN_SHA;
  return { code: accepted ? 0 : 1, out: accepted ? `  [dry run] accepted: ${pw.length} characters, sha256 ${sha.slice(0, 12)}\n` : "  could not connect (28P01): password authentication failed for user \"postgres\"\n" };
}

function runOnce(dsn) {
  if (process.env.AUDIT_DRYRUN) return dryRun(dsn);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/production-audit-run.mjs", "--target", "production", SQL, OUT], {
      env: { ...process.env, PRODUCTION_DATABASE_URL: dsn }, stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { out += d; });
    child.on("close", (code) => resolve({ code, out }));
  });
}

let password = "";
const scrub = (t) => String(t || "").replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "postgres://[redacted]");
try {
  console.log(`  Production read-only audit -- project ${PROJECT} (Session pooler, ca-central-1)`);
  console.log("  Paste the database password and press Enter. Nothing will appear while you paste.");
  // Never fall back to the shell on an empty or rejected password: ask again,
  // so a second paste cannot land on the shell prompt.
  let last = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    password = await askHidden(attempt === 1 ? "  Database password: " : "  Database password (try again): ");
    if (!password) { console.log("  Nothing was entered."); continue; }
    for (const host of HOSTS) {
      const dsn = `postgresql://postgres.${PROJECT}:${encodeURIComponent(password)}@${host}:5432/postgres`;
      last = await runOnce(dsn);
      const wrongCluster = /Tenant or user not found|ENOTFOUND|EAI_AGAIN/i.test(last.out);
      if (wrongCluster && host !== HOSTS[HOSTS.length - 1]) continue;
      break;
    }
    if (/28P01|password authentication failed/i.test(last.out)) { console.log("  That password was not accepted (nothing was read)."); password = ""; continue; }
    break;
  }
  if (!last) { console.log("  No password entered; nothing was run."); process.exitCode = 2; }
  else { process.stdout.write(scrub(last.out)); process.exitCode = last.code; }
} catch (e) {
  console.error(`  ${scrub(e.message || e)}`);
  process.exitCode = 1;
} finally {
  password = "";
}
