// Build supabase/staging/.api-env -- the ONLY environment the local staging API
// server ever sees.
//
//   node scripts/staging-api-env.mjs                 # create / refresh
//   node scripts/staging-api-env.mjs --service-key   # also capture the STAGING
//                                                    # service key (hidden prompt)
//
// What goes in:
//   • the staging URL and publishable key, copied from .isolation-env
//   • fresh random DISPATCH_SECRET, NEWS_PULL_SECRET, MESSAGES_INBOUND_SECRET and
//     a local STRIPE_WEBHOOK_SECRET (the suite signs its own test events)
//   • the mock sentinel for every provider key, so routes that check their key
//     before auth reach their guard, and the egress layer answers the call
//   • fixture-only recipients for the contact forms
//   • the staging service key, ONLY under its staging-specific name, and only
//     after the staging project itself has accepted it (see below)
// What never goes in: a production name, a live key, push credentials, CRON_SECRET.
//
// Nothing read is ever printed. Existing secrets are kept on refresh so a running
// server and the suite keep agreeing.

import crypto from "node:crypto";
import fs from "node:fs";

const REF = "jmljfovtfxcdhjmtlnva";
const STAGING_URL = `https://${REF}.supabase.co`;
const OUT = "supabase/staging/.api-env";
const ISO = "supabase/staging/.isolation-env";

const readEnv = (f) => fs.existsSync(f)
  ? Object.fromEntries(fs.readFileSync(f, "utf8").split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }))
  : {};
const iso = readEnv(ISO);
const prev = readEnv(OUT);
if (!iso.ISOLATION_ANON_KEY) { console.error(`\n  ${ISO} has no ISOLATION_ANON_KEY. Run: node scripts/staging-anon-key.mjs\n`); process.exit(2); }

const rnd = (p) => p + crypto.randomBytes(24).toString("base64url");
const env = {
  MINEEX_ENV: "staging",
  VITE_SUPABASE_URL: STAGING_URL,
  VITE_SUPABASE_ANON_KEY: iso.ISOLATION_ANON_KEY,
  DISPATCH_SECRET: prev.DISPATCH_SECRET || rnd("disp_"),
  NEWS_PULL_SECRET: prev.NEWS_PULL_SECRET || rnd("news_"),
  MESSAGES_INBOUND_SECRET: prev.MESSAGES_INBOUND_SECRET || rnd("inb_"),
  STRIPE_WEBHOOK_SECRET: prev.STRIPE_WEBHOOK_SECRET || rnd("whsec_"),
  STAGING_STRIPE_MODE: "mock",
  STRIPE_SECRET_KEY: "sk_test_staging_mock",
  STRIPE_PRICE_BASIC: "price_staging_mock_basic",
  STRIPE_PRICE_PRO: "price_staging_mock_pro",
  ANTHROPIC_API_KEY: "staging-mock",
  OPENAI_API_KEY: "staging-mock",
  POSTMARK_SERVER_TOKEN: "staging-mock",
  EODHD_API_KEY: "staging-mock",        // market-pull checks it after its secret; the call is mocked
  POSTMARK_INBOUND_HASH: "stagingmock",
  MESSAGES_FROM_EMAIL: "noreply@staging.invalid",
  CONTACT_TO: "support@staging.invalid",
  CONFERENCE_INQUIRY_TO: "support@staging.invalid",
  SUBMISSION_SALT: prev.SUBMISSION_SALT || rnd("salt_"),
  // Small enough that the suite can reach the limit; see api-authz-test.mjs.
  AI_CALLS_PER_WINDOW: "12",
  STAGING_EGRESS_LOG: "supabase/staging/egress.log",
};
if (prev.STAGING_SUPABASE_SERVICE_ROLE_KEY) env.STAGING_SUPABASE_SERVICE_ROLE_KEY = prev.STAGING_SUPABASE_SERVICE_ROLE_KEY;

if (process.argv.includes("--service-key")) {
  const read = (prompt) => new Promise((resolve, reject) => {
    const tty = fs.createReadStream("/dev/tty"); process.stdout.write(prompt); let buf = "";
    tty.on("data", (ch) => { for (const x of ch.toString("utf8")) {
      if (x === "\r" || x === "\n") { process.stdout.write("\n"); tty.close(); return resolve(buf); }
      if (x === "\u0003") { process.stdout.write("\n"); process.exit(130); }
      if (x === "\u007f") { buf = buf.slice(0, -1); continue; }
      buf += x; } });
    tty.on("error", reject);
  });
  let key = (await read("  Paste the STAGING service_role / secret key (hidden), then Return:\n  > ")).trim();
  for (const k of [3, 2]) if (key.length % k === 0 && key.slice(0, key.length / k).repeat(k) === key) { key = key.slice(0, key.length / k); break; }
  if (!/^sb_secret_|^eyJ/.test(key)) { console.log("  That is not a service key (no recognised prefix). Nothing saved.\n"); process.exit(2); }
  if (key.startsWith("eyJ")) {
    let ref = null; try { ref = JSON.parse(Buffer.from(key.split(".")[1], "base64url")).ref; } catch {}
    if (ref !== REF) { console.log("  REFUSING: that JWT is not for the staging project. Nothing saved.\n"); process.exit(2); }
  }
  // Prove it belongs to STAGING by asking staging -- the only host it is ever
  // sent to. The admin endpoint answers 200 to a staging service key and 401 to
  // anything else, including another project's key.
  const r = await fetch(`${STAGING_URL}/auth/v1/admin/users?per_page=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
    .catch(() => ({ status: 0 }));
  if (r.status !== 200) { console.log(`  REFUSING: the staging project did not accept that key (HTTP ${r.status}). Nothing saved.\n`); process.exit(2); }
  env.STAGING_SUPABASE_SERVICE_ROLE_KEY = key;
  console.log("  accepted: the staging project confirmed this is its service key");
}

fs.writeFileSync(OUT, "# Generated by scripts/staging-api-env.mjs. Staging only. Never commit.\n" +
  Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n") + "\n", { mode: 0o600 });
fs.chmodSync(OUT, 0o600);
console.log(`  wrote ${OUT} (${Object.keys(env).length} vars; service key: ${env.STAGING_SUPABASE_SERVICE_ROLE_KEY ? "present" : "ABSENT -- service-role routes will report 'not configured'"})\n`);
