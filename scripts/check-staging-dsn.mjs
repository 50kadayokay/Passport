// Verify the staging connection string WITHOUT ever emitting it.
//
// This exists because a hand-rolled check printed one: the URI had been pasted
// three times, so the whole credential ended up inside the pathname, and a mask
// applied only to `url.password` let it through. The lesson is not "mask more
// fields" -- it is that NOTHING derived from the file may reach stdout.
//
// So this prints only booleans, counts and a fixed allowlist of values that
// cannot contain a secret: protocol, hostname, port, and the project ref
// matched from a known list. Every other finding is a yes/no.

import fs from "node:fs";

const FILE = "supabase/staging/.connection";
const ALLOWED_REFS = ["jmljfovtfxcdhjmtlnva"];
const PRODUCTION_REFS = ["rvptronniomlqumjhyrr"];

const raw = fs.existsSync(FILE) ? fs.readFileSync(FILE, "utf8") : "";
const text = raw.trim();
const out = [];
const say = (k, v) => out.push(`  ${k.padEnd(30)} ${v}`);

say("file present", fs.existsSync(FILE) ? "yes" : "NO");
say("bytes", String(Buffer.byteLength(raw)));
say("trailing newline only", /\n{2,}/.test(raw) ? "NO" : "yes");

// A correct file holds exactly ONE uri. Counting occurrences catches the
// repeated-paste case that caused the leak.
const occurrences = (text.match(/postgres(?:ql)?:\/\//g) || []).length;
say("postgres:// occurrences", `${occurrences} ${occurrences === 1 ? "(correct)" : "(EXPECTED 1)"}`);

say("names an allowed ref", ALLOWED_REFS.some((r) => text.includes(r)) ? "yes" : "NO");
say("names a production ref", PRODUCTION_REFS.some((r) => text.includes(r)) ? "YES — REFUSE" : "no");
say("placeholder left in", /\[|\]|YOUR-PASSWORD/i.test(text) ? "YES" : "no");
say("looks like shell, not a uri", /pbpaste|mkdir|chmod|&&/.test(text) ? "YES" : "no");

let ok = false;
if (occurrences === 1) {
  try {
    const u = new URL(text);
    // Only these four are printed, and none can hold a credential:
    say("protocol", u.protocol);
    say("host", u.hostname);
    say("port", u.port || "(default)");
    say("database", /^\/[A-Za-z0-9_-]+$/.test(u.pathname) ? u.pathname.slice(1) : "(unexpected shape)");
    say("username shape", /^postgres\.[a-z0-9]{20}$/.test(u.username) ? "postgres.<ref> (correct)" : "UNEXPECTED");
    say("password", u.password ? `present, ${u.password.length} chars` : "MISSING");
    ok = !!u.password
      && ALLOWED_REFS.some((r) => u.username.includes(r))
      && !PRODUCTION_REFS.some((r) => text.includes(r))
      && u.pathname === "/postgres";
  } catch (e) {
    say("parse", `FAILED (${e.code || "invalid"})`);
  }
}

console.log("\n" + out.join("\n"));
console.log(`\n  VERDICT: ${ok ? "usable, staging only" : "NOT usable — fix before connecting"}\n`);
process.exit(ok ? 0 : 1);
