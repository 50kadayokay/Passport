// Set up and test the staging connection from a PASSWORD ALONE.
//
//   node scripts/staging-connect.mjs          # prompt, save, test
//   node scripts/staging-connect.mjs --test   # just test what is already saved
//
// WHY THIS SHAPE
// --------------
// Asking for a whole connection URI failed three times running: the clipboard
// delivered it twice, then three times, and once held the shell command that
// was meant to consume it. Every part of that URI except the password is a
// constant this file already knows, so asking for the rest was asking the user
// to re-type facts to a program that had them.
//
// It also de-duplicates the input. A terminal that delivers a paste twice
// yields exactly the doubled string, which is detectable and correctable --
// far better than failing and asking again.
//
// NOTHING DERIVED FROM THE SECRET IS PRINTED. Not masked, not partially: the
// only outputs are fixed strings, counts and lengths. A mask applied field by
// field is what leaked a password here once already.

import fs from "node:fs";
import pg from "pg";

const REF  = "jmljfovtfxcdhjmtlnva";                     // mineex-staging
const HOST = "aws-0-us-east-1.pooler.supabase.com";
const PORT = 5432;
const DB   = "postgres";
const FILE = "supabase/staging/.connection";

/** A paste delivered N times is the same string repeated. Reduce it. */
export function undouble(s) {
  let out = s;
  for (let i = 0; i < 4; i++) {
    const n = out.length;
    let shrunk = false;
    for (const k of [2, 3]) {
      if (n % k === 0) {
        const unit = out.slice(0, n / k);
        if (unit.repeat(k) === out) { out = unit; shrunk = true; break; }
      }
    }
    if (!shrunk) break;
  }
  return out;
}

const build = (pw) => `postgresql://postgres.${REF}:${encodeURIComponent(pw)}@${HOST}:${PORT}/${DB}`;

async function readSecret(prompt) {
  return new Promise((resolve, reject) => {
    let tty;
    try { tty = fs.createReadStream("/dev/tty"); }
    catch { return reject(new Error("no terminal available")); }
    process.stdout.write(prompt);
    if (process.stdin.isTTY) process.stdin.setRawMode?.(true);
    let buf = "";
    tty.on("data", (chunk) => {
      for (const ch of chunk.toString("utf8")) {
        if (ch === "\r" || ch === "\n") {
          process.stdout.write("\n");
          tty.close();
          if (process.stdin.isTTY) process.stdin.setRawMode?.(false);
          return resolve(buf);
        }
        if (ch === "\u0003") { process.stdout.write("\n"); process.exit(130); }
        if (ch === "\u007f") { buf = buf.slice(0, -1); continue; }  // backspace
        buf += ch;
      }
    });
    tty.on("error", reject);
  });
}

async function test(url) {
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    const who = await client.query(
      "select current_user, current_database() as db, version() as v, " +
      "(select count(*) from information_schema.tables where table_schema='public') as public_tables");
    const r = who.rows[0];
    console.log("\n  CONNECTED");
    console.log(`    role            ${r.current_user}`);
    console.log(`    database        ${r.db}`);
    console.log(`    server          ${String(r.v).split(" on ")[0]}`);
    console.log(`    public tables   ${r.public_tables}  ${Number(r.public_tables) === 0 ? "(empty, as expected for a fresh project)" : ""}`);
    await client.end();
    return true;
  } catch (e) {
    console.log(`\n  COULD NOT CONNECT: ${e.code || e.message}`);
    if (String(e.message).toLowerCase().includes("password")) {
      console.log("  The password was rejected. Reset it in the dashboard and run this again.");
    }
    try { await client.end(); } catch { /* never opened */ }
    return false;
  }
}

const url = process.argv.includes("--test")
  ? fs.readFileSync(FILE, "utf8").trim()
  : await (async () => {
      const raw = await readSecret(`  Paste the STAGING database password for ${REF} (hidden), then Return:\n  > `);
      const pw = undouble(raw.trim());
      if (!pw) { console.log("\n  Nothing entered.\n"); process.exit(2); }
      if (pw.length !== raw.trim().length)
        console.log(`  (input arrived ${Math.round(raw.trim().length / pw.length)}x — de-duplicated)`);
      console.log(`  password received: ${pw.length} characters`);
      const u = build(pw);
      fs.mkdirSync("supabase/staging", { recursive: true });
      fs.writeFileSync(FILE, u, { mode: 0o600 });
      console.log(`  saved to ${FILE} (chmod 600, gitignored)`);
      return u;
    })();

if (url.includes("rvptronniomlqumjhyrr")) {
  console.log("\n  REFUSING: that is the production project.\n"); process.exit(2);
}
process.exit((await test(url)) ? 0 : 1);
