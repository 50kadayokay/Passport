// ─────────────────────────────────────────────────────────────────────────────
// SALES SITE RELEASE GATE
//
// Answers one question about a build: DID THE PUBLIC SALES SITE CHANGE?
//
// It answers it from the built artifact, not from which paths a commit touched.
// Path rules miss the case that actually caused trouble here — a shared dependency
// edited for the app that silently alters the marketing surface too. Hashing what
// Rollup actually emitted cannot miss it.
//
// WHY A FINGERPRINT AND NOT THE FILENAMES. Vite's filenames are content hashes, so
// they look like a natural fingerprint, but two builds of identical source produce
// 130 different filenames. The cause is one line, vite.config.js:
//
//     const MX_BUILD = new Date().toISOString()...
//
// That timestamp lands in the entry chunk, changes its hash, and every chunk that
// imports it by name changes too. Measured: of 130 emitted files, 129 were byte
// identical between consecutive builds and only the entry differed, by 7 seconds of
// wall clock. So the build IS deterministic; it is stamped. This normalises the stamp
// and the cascading filenames away, and hashes what is left.
//
// SCOPE. The fingerprint covers the chunks reachable from the marketing entry — which
// includes the shared pieces the sales site genuinely depends on (system, Nav, motion,
// the demo surfaces). It deliberately EXCLUDES the common entry chunk, because that
// one carries the router for every MineEx surface and changes whenever the app or the
// portal does. Excluding it is what lets app and portal releases pass untouched; the
// rendered-route checks in the regression suite cover what it would have caught.
//
// USAGE
//   node scripts/site-release-gate.mjs --write     record the current site as approved
//   node scripts/site-release-gate.mjs             verify; exit 1 if the site changed
//
// An intentional sales-site release re-records the baseline with --write, which is the
// deliberate act the release process is built around.
// ─────────────────────────────────────────────────────────────────────────────
import { createHash, verify as edVerify, createPublicKey } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIST = "dist/assets";
const BASELINE = "qa/site-fingerprint.json";
const APPROVALS = "qa/site-approvals.json";
const PUBKEY = "qa/site-release-key.pub";
const MARKETING_ENTRY = /^MarketingSite-/;
// The shared application entry: router for every surface, not the sales site itself.
const SHARED_ENTRY = /^index-[A-Za-z0-9_-]{8}\.js$/;

// ── THE EMBEDDED DEMONSTRATIONS ─────────────────────────────────────────────
// The sales site does not only render its own chunks. It iframes three real product
// surfaces, and what they draw IS the sales page as a visitor experiences it:
//
//     /app?c=kingsmen-resources&embed=1   the Pro profile in the phone   -> PassportProto
//     /appdemo?embed=1                    the investor shell             -> InvestorDemo
//     /confv3demo?c=...&t=...             the template decks             -> ConferenceV3Demo
//
// Those live in separate chunk graphs, so the marketing fingerprint cannot see them.
// Measured: changing a user-visible literal in PassportProto altered what the sales
// page shows inside the phone and the first version of this gate passed it.
//
// They are fingerprinted SEPARATELY and reported, not blocked by default — because
// these are the investor app, and blocking on them would stop ordinary app and portal
// work, which is the thing this gate must never do. A deliberate sales-site release
// runs with --strict, where an unacknowledged change here fails too.
const EMBED_ENTRIES = [/^PassportProto-/, /^InvestorDemo-/, /^ConferenceV3Demo-/];

const normalise = (buf) =>
  buf
    // the cascading content hashes in import specifiers
    .replace(/-[A-Za-z0-9_-]{8}\.(js|css)/g, "-HASH.$1")
    // the wall-clock build stamp (vite.config.js)
    .replace(/__MX_BUILD\s*=\s*"[^"]*"/g, '__MX_BUILD="STAMP"')
    .replace(/"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}Z"/g, '"STAMP"');

const read = (name) => normalise(readFileSync(join(DIST, name), "utf8"));

// Build the chunk graph from the emitted files, so no build-manifest flag is needed.
function graph(rootMatchers) {
  const files = readdirSync(DIST).filter((f) => f.endsWith(".js") || f.endsWith(".css"));
  const byStem = new Map();                       // "Nav-HASH.js" -> real filename
  for (const f of files) byStem.set(f.replace(/-[A-Za-z0-9_-]{8}\./, "-HASH."), f);

  const roots = files.filter((f) => rootMatchers.some((re) => re.test(f)));
  if (!roots.length) throw new Error("no entry chunk for " + rootMatchers + " in " + DIST + " — build first");

  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file) || SHARED_ENTRY.test(file)) return;
    seen.add(file);
    const src = read(file);
    for (const m of src.matchAll(/["'`]\.?\/?((?:assets\/)?[A-Za-z0-9_.-]+-HASH\.(?:js|css))["'`]/g)) {
      const target = byStem.get(m[1].replace(/^assets\//, ""));
      if (target) walk(target);
    }
  };
  roots.forEach(walk);

  const parts = [...seen].sort().map((f) => {
    const h = createHash("sha256").update(read(f)).digest("hex").slice(0, 16);
    return { chunk: f.replace(/-[A-Za-z0-9_-]{8}\./, "-*."), sha: h };
  });
  const combined = createHash("sha256").update(parts.map((p) => p.chunk + p.sha).join("\n")).digest("hex");
  return { chunks: parts.length, fingerprint: combined, parts };
}

const fingerprint = () => ({ site: graph([MARKETING_ENTRY]), embed: graph(EMBED_ENTRIES) });
const current = fingerprint();
const write = process.argv.includes("--write");
const report = process.argv.includes("--report");

// ── AUTHORISATION ───────────────────────────────────────────────────────────
// There is no flag and no environment variable that authorises a sales-site release.
// Both were self-granted: whoever runs the deploy could set them. Authorisation is an
// Ed25519 signature over this exact build's fingerprint, produced by the key holder
// with scripts/site-approve.mjs. This side only VERIFIES, so no secret is present in
// any build, and a signature cannot be reused for a different build.
function approvedFingerprint(fp) {
  if (!existsSync(PUBKEY) || !existsSync(APPROVALS)) return false;
  try {
    const key = createPublicKey(readFileSync(PUBKEY));
    const { approvals = [] } = JSON.parse(readFileSync(APPROVALS, "utf8"));
    return approvals.some(
      (a) => a.fingerprint === fp &&
        edVerify(null, Buffer.from(fp, "hex"), key, Buffer.from(a.signature, "base64"))
    );
  } catch (_) { return false; }
}

const classify = (cur) => {
  const siteSet = new Set(cur.site.parts.map((p) => p.chunk));
  const embSet = new Set(cur.embed.parts.map((p) => p.chunk));
  const all = new Map();
  for (const p of cur.site.parts) all.set(p.chunk, { sha: p.sha, cat: embSet.has(p.chunk) ? "shared" : "site-only" });
  for (const p of cur.embed.parts) if (!siteSet.has(p.chunk)) all.set(p.chunk, { sha: p.sha, cat: "demo-only" });
  return all;
};

// One fingerprint over everything that reaches a visitor of mineex.ca: the marketing
// chunks AND the product surfaces it iframes. This is what gets signed.
const nowMap = classify(current);
const combined = createHash("sha256")
  .update([...nowMap].sort((a, b) => a[0].localeCompare(b[0])).map(([c, v]) => v.cat + " " + c + " " + v.sha).join("\n"))
  .digest("hex");

if (write) {
  const parts = [...nowMap].map(([chunk, v]) => ({ chunk, sha: v.sha, cat: v.cat })).sort((a, b) => a.chunk.localeCompare(b.chunk));
  writeFileSync(BASELINE, JSON.stringify({ recorded: new Date().toISOString(), fingerprint: combined, parts }, null, 2) + "\n");
  const by = (c) => parts.filter((p) => p.cat === c).length;
  console.log(`\n  Baseline recorded — ${parts.length} chunks`);
  console.log(`    site-only ${String(by("site-only")).padStart(3)}   shared ${String(by("shared")).padStart(3)}   demo-only ${String(by("demo-only")).padStart(3)}`);
  console.log(`    fingerprint ${combined.slice(0, 32)}…\n`);
  process.exit(0);
}

if (!existsSync(BASELINE)) { console.error(`\n  No baseline at ${BASELINE}. Record one with --write.\n`); process.exit(2); }

const base = JSON.parse(readFileSync(BASELINE, "utf8"));
const was = new Map(base.parts.map((p) => [p.chunk, p]));
const moved = { "site-only": [], shared: [], "demo-only": [] };
for (const [chunk, v] of nowMap) {
  const b = was.get(chunk);
  if (!b) moved[v.cat].push("added    " + chunk);
  else if (b.sha !== v.sha) moved[v.cat].push("modified " + chunk);
}
for (const [chunk, b] of was) if (!nowMap.has(chunk)) (moved[b.cat] || moved["site-only"]).push("removed  " + chunk);
const total = Object.values(moved).reduce((n, a) => n + a.length, 0);

if (report) {
  console.log("FINGERPRINT " + combined);
  if (!total) console.log("\n  Nothing would change on mineex.ca.");
  else for (const cat of ["site-only", "shared", "demo-only"]) {
    if (!moved[cat].length) continue;
    console.log(`\n  ${cat}:`);
    for (const l of moved[cat].slice(0, 12)) console.log("        " + l);
  }
  process.exit(0);
}

if (!total) {
  console.log(`\n  Sales site UNCHANGED — ${nowMap.size} chunks verified.`);
  console.log("  Safe to deploy without a sales-site release.\n");
  process.exit(0);
}

console.error("");
for (const cat of ["site-only", "shared", "demo-only"]) {
  if (!moved[cat].length) continue;
  const title = cat === "site-only" ? "SALES SITE's own code changed"
    : cat === "shared" ? "SHARED code changed — used by BOTH the app and the sales page"
    : "EMBEDDED DEMO changed — what the sales page shows inside the device";
  console.error(`  ${title}`);
  for (const line of moved[cat].slice(0, 10)) console.error("        " + line);
  console.error("");
}

if (approvedFingerprint(combined)) {
  console.error(`  ✓ Signed release approval found for ${combined.slice(0, 24)}… — proceeding.\n`);
  process.exit(0);
}

console.error("  ✗ NOT APPROVED. This build changes what mineex.ca serves.\n");
console.error(`      fingerprint  ${combined.slice(0, 48)}…`);
console.error("      To release:  node scripts/site-approve.mjs    (needs the release key)");
console.error("\n  There is no flag or environment variable that bypasses this.\n");
process.exit(1);
