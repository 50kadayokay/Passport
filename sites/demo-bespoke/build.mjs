// The site's build step — the whole customer-facing half of the Site Contract.
//
//   node sites/demo-bespoke/build.mjs                     local sample payload
//   node sites/demo-bespoke/build.mjs --api               live MineEx
//   node sites/demo-bespoke/build.mjs --api --draft       draft preview
//
// Four obligations, and this file performs all four:
//   1. upload the manifest                  (PUT /api/site-manifest)
//   2. fetch content                        (GET /api/site-content)
//   3. honour draft mode                    (--draft / ?mineex_draft=)
//   4. serve the last good build on failure (see CACHE below)
//
// Deliberately boring: fetch, render, write a file. A static host would upload
// `index.html`; a server-rendered site would call `render()` per request
// instead. Neither changes the contract.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "./render.mjs";
import manifest from "./mineex.config.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "dist");
const CACHE = path.join(OUT, "last-good.json");
const SAMPLE = path.join(HERE, "content.sample.json");

const args = new Set(process.argv.slice(2));
const useApi = args.has("--api");
const draft = args.has("--draft");

const BASE = process.env.MINEEX_API || "http://localhost:5180";
const TOKEN = draft ? process.env.MINEEX_DRAFT_TOKEN : process.env.MINEEX_SITE_TOKEN;

const log = (...a) => console.log("  " + a.join(" "));

async function uploadManifest() {
  const r = await fetch(`${BASE}/api/site-manifest`, {
    method: "PUT",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(manifest),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    // A manifest that will not upload is a build problem, not a runtime one:
    // say so loudly, but do not stop the build — the site can still render.
    log(`manifest: NOT uploaded (${r.status}) ${body.error || ""}`);
    if (body.problems) body.problems.forEach((p) => log(`          ${p}`));
    return false;
  }
  log(`manifest: uploaded — ${body.sections} sections, ${body.fields} editable fields`);
  return true;
}

async function fetchContent() {
  const url = `${BASE}/api/site-content${draft ? "?draft=1" : ""}`;
  const r = await fetch(url, { headers: { authorization: `Bearer ${TOKEN}` } });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw Object.assign(new Error(body.error || `content fetch failed (${r.status})`), { status: r.status });
  }
  return r.json();
}

/* OBLIGATION 4. A content API outage must never take a public company's
   investor site down, so the last successful payload is kept on disk and used
   when a fetch fails. A slightly stale site beats a 500. */
function lastGood() {
  try { return JSON.parse(fs.readFileSync(CACHE, "utf8")); } catch { return null; }
}

async function getPayload() {
  if (!useApi) {
    log("source:   local sample (contract-shaped; run with --api for live MineEx)");
    return JSON.parse(fs.readFileSync(SAMPLE, "utf8"));
  }
  if (!TOKEN) throw new Error(`set ${draft ? "MINEEX_DRAFT_TOKEN" : "MINEEX_SITE_TOKEN"} to build against the API`);
  try {
    await uploadManifest();
    const payload = await fetchContent();
    log(`source:   MineEx ${payload.mode} · contract ${payload.contract}`);
    return payload;
  } catch (e) {
    const cached = lastGood();
    if (!cached) throw e;
    log(`source:   LAST GOOD BUILD — live fetch failed (${e.status || "?"}: ${e.message})`);
    return cached;
  }
}

const payload = await getPayload();

// A site should ignore fields it does not recognise rather than validate
// strictly, so that additive contract changes do not force a redeploy. The one
// thing worth refusing is a major version it cannot read.
const major = parseInt(String(payload.contract || "").split(".")[0], 10);
if (major !== 1) throw new Error(`this site speaks contract 1.x; MineEx sent ${payload.contract}`);

fs.mkdirSync(OUT, { recursive: true });
const html = render(payload);
fs.writeFileSync(path.join(OUT, "index.html"), html);
if (useApi && payload.mode === "published") fs.writeFileSync(CACHE, JSON.stringify(payload));

const sections = Object.keys(payload.site?.sections || {}).length;
log(`company:  ${payload.company?.name} (${payload.company?.slug})`);
log(`content:  ${(payload.content?.profile?.projects || []).length} projects · ${(payload.content?.posts || []).length} posts · ${sections} site sections`);
log(`written:  ${path.relative(process.cwd(), path.join(OUT, "index.html"))} (${(html.length / 1024).toFixed(1)} KB)`);
