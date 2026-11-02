// ─────────────────────────────────────────────────────────────────────────────
// SALES SITE RELEASE APPROVAL — the signing side.
//
// The gate used to be satisfiable with a flag or an environment variable. Both are
// self-granted: whoever runs the deploy can set them, so they record an intention,
// not an approval. This replaces them with a signature that only the key holder can
// produce. Nothing that runs in CI, and nobody working in this repository, can
// authorise a sales-site release without it.
//
// It is an Ed25519 signature over the build's fingerprint. The PRIVATE key lives
// outside the repository, on your machine. The PUBLIC key is committed, and the gate
// verifies with it. Verification needs no secret, so the key is never exposed to a
// build, a log, or this assistant.
//
//   node scripts/site-approve.mjs --init
//       Generate your key pair, once. Writes the public key into the repo and the
//       private key to ~/.mineex/site-release.key (chmod 600). Back that file up:
//       losing it means re-running --init and committing a new public key.
//
//   node scripts/site-approve.mjs
//       Show what this build would change, then sign ITS fingerprint and record the
//       approval. Run it only when you have decided the change should go live.
//
// The signature covers the exact fingerprint. It cannot be reused for a different
// build: change one byte of the sales site and the recorded approval stops matching.
// ─────────────────────────────────────────────────────────────────────────────
import { generateKeyPairSync, sign as edSign, createPrivateKey } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const PUB = "qa/site-release-key.pub";
const APPROVALS = "qa/site-approvals.json";
const KEYDIR = join(homedir(), ".mineex");
const KEY = join(KEYDIR, "site-release.key");

if (process.argv.includes("--init")) {
  if (existsSync(KEY)) {
    console.error(`\n  A private key already exists at ${KEY}.`);
    console.error("  Re-running --init would invalidate every existing approval.");
    console.error("  Delete that file deliberately if you really intend to rotate.\n");
    process.exit(1);
  }
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  mkdirSync(KEYDIR, { recursive: true });
  writeFileSync(KEY, privateKey.export({ type: "pkcs8", format: "pem" }));
  chmodSync(KEY, 0o600);
  writeFileSync(PUB, publicKey.export({ type: "spki", format: "pem" }));
  console.log(`\n  Release key created.`);
  console.log(`    private  ${KEY}   (yours — back it up, never commit it)`);
  console.log(`    public   ${PUB}   (commit this)\n`);
  process.exit(0);
}

if (!existsSync(KEY)) {
  console.error(`\n  No release key at ${KEY}. Run:  node scripts/site-approve.mjs --init\n`);
  process.exit(1);
}

// Ask the gate what this build looks like and what it would change.
let report = "";
try {
  report = execFileSync("node", ["scripts/site-release-gate.mjs", "--report"], { encoding: "utf8" });
} catch (e) {
  report = (e.stdout || "") + (e.stderr || "");
}
const fp = (report.match(/FINGERPRINT\s+([0-9a-f]{64})/) || [])[1];
if (!fp) {
  console.error("\n  Could not read a fingerprint from the gate. Build first, then retry.\n");
  console.error(report);
  process.exit(1);
}

console.log(report.replace(/FINGERPRINT\s+[0-9a-f]{64}\n?/, ""));
console.log(`  Fingerprint to approve:  ${fp.slice(0, 32)}…\n`);

const key = createPrivateKey(readFileSync(KEY));
const signature = edSign(null, Buffer.from(fp, "hex"), key).toString("base64");

const prev = existsSync(APPROVALS) ? JSON.parse(readFileSync(APPROVALS, "utf8")) : { approvals: [] };
prev.approvals = prev.approvals.filter((a) => a.fingerprint !== fp);
prev.approvals.push({ fingerprint: fp, signature, approved: new Date().toISOString() });
prev.approvals = prev.approvals.slice(-20);
writeFileSync(APPROVALS, JSON.stringify(prev, null, 2) + "\n");

console.log("  ✓ Release approved and signed.");
console.log(`    recorded in ${APPROVALS} — commit it with the change it approves.\n`);
