// Capture the staging ANON key into supabase/staging/.isolation-env.
//   node scripts/staging-anon-key.mjs
//
// The anon key is a publishable key -- it ships in browser bundles by design --
// but it still has no business in a chat transcript, and the same paste-twice
// problem applies, so it is read hidden and de-duplicated like the password.
import fs from "node:fs";

const REF = "jmljfovtfxcdhjmtlnva";
const ENV = "supabase/staging/.isolation-env";

const undouble = (s) => {
  let out = s;
  for (let i = 0; i < 4; i++) {
    const n = out.length; let shrunk = false;
    for (const k of [2, 3]) if (n % k === 0) {
      const unit = out.slice(0, n / k);
      if (unit.repeat(k) === out) { out = unit; shrunk = true; break; }
    }
    if (!shrunk) break;
  }
  return out;
};

const read = (prompt) => new Promise((resolve, reject) => {
  const tty = fs.createReadStream("/dev/tty");
  process.stdout.write(prompt);
  let buf = "";
  tty.on("data", (ch) => {
    for (const x of ch.toString("utf8")) {
      if (x === "\r" || x === "\n") { process.stdout.write("\n"); tty.close(); return resolve(buf); }
      if (x === "\u0003") { process.stdout.write("\n"); process.exit(130); }
      if (x === "\u007f") { buf = buf.slice(0, -1); continue; }
      buf += x;
    }
  });
  tty.on("error", reject);
});

const raw = (await read("  Paste the STAGING anon / publishable key (hidden), then Return:\n  > ")).trim();
const key = undouble(raw);
if (!key) { console.log("\n  Nothing entered.\n"); process.exit(2); }
if (key.length !== raw.length) console.log(`  (input arrived ${Math.round(raw.length / key.length)}x — de-duplicated)`);

// Shape check only. Both the legacy JWT anon key and the new sb_publishable_
// form are accepted; anything that looks like a secret key is refused.
const looksJwt = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key);
const looksPub = /^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(key);
if (/service_role|sb_secret_/.test(key)) {
  console.log("\n  REFUSING: that looks like a SECRET key. The suite needs the anon/publishable one.\n");
  process.exit(2);
}
if (!looksJwt && !looksPub) {
  console.log(`\n  That does not look like an anon key (${key.length} chars, no recognised prefix).\n`);
  process.exit(2);
}
console.log(`  accepted: ${looksJwt ? "JWT anon key" : "sb_publishable key"}, ${key.length} chars`);

const keep = fs.existsSync(ENV)
  ? fs.readFileSync(ENV, "utf8").split("\n").filter((l) => l && !/^ISOLATION_(ANON_KEY|SUPABASE_URL)=/.test(l))
  : [];
keep.push(`ISOLATION_SUPABASE_URL=https://${REF}.supabase.co`);
keep.push(`ISOLATION_ANON_KEY=${key}`);
fs.writeFileSync(ENV, keep.join("\n") + "\n", { mode: 0o600 });
console.log(`  wrote ${ENV} (${keep.length} vars)\n`);
