// The Report-Only CSP in vercel.json against what the app really loads.
//   node scripts/csp-report-only-test.mjs
//
// OFFLINE. Builds the app into a temporary folder (vite build, no network) and
// reads every origin in the output -- chunks, CSS, HTML pages, the service
// worker. Every origin must be either
//   LOADED      allowed by the directive it is loaded through, or
//   NOT_LOADED  accounted for, with the reason it needs no allowance (a link, a
//               licence comment, sample data, a provider switched off, a defect).
// An origin in neither list fails the test, so a new CDN or API cannot reach the
// bundle without someone deciding where it belongs. Also checks: the policy is
// Report-Only (the enforced CSP stays frame-ancestors only), every inline script
// on the app page is hashed, and nothing is reported to another site.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { PRODUCTION_REFS, STAGING_REFS } from "./_target-guard.mjs";

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };

// The two projects' origins, from the allowlists in _target-guard.mjs.
const SB_PROD = `https://${PRODUCTION_REFS[0]}.supabase.co`, SB_STAGING = `https://${STAGING_REFS[0]}.supabase.co`;
// origin -> the directives it is loaded through (each must allow it)
const LOADED = {
  [SB_PROD]: ["connect-src", "media-src", "img-src"],          // REST, auth, storage (images, video)
  [SB_STAGING]: ["connect-src", "media-src", "img-src"],       // a staging build's project (the bundle also names it in the tripwire)
  "https://cdnjs.cloudflare.com": ["script-src", "style-src", "connect-src", "worker-src"], // Leaflet js/css, pdf.js + worker
  "https://fonts.googleapis.com": ["style-src"],
  "https://api.fontshare.com": ["style-src"],
  "https://fonts.gstatic.com": ["font-src"],
  "https://cdn.fontshare.com": ["font-src"],                   // fonts named by api.fontshare.com's stylesheet (not in the bundle)
  "https://www.googleapis.com": ["connect-src"],               // Google sign-in token info (SocialLogin web)
  "https://accounts.google.com": ["connect-src"],              // Google token revoke (SocialLogin web)
  "https://a.basemaps.cartocdn.com": ["img-src"],              // Leaflet tiles, {s} = a-d
};
const NOT_LOADED = {
  "http://www.w3.org": "XML/SVG namespace strings",
  "http://www.apache.org": "XML namespace in pdf.js", "http://www.xfa.org": "XFA namespace in pdf.js", "http://ns.adobe.com": "XMP namespace in pdf.js",
  "https://supabase-url-not-configured.invalid": "src/lib/supabase.js's non-production host (never resolves; a production build never selects it)",
  "https://example.com": "placeholder text", "https://company.com": "placeholder text",
  "https://mineex.ca": "links and QR targets", "https://passport-xi-five.vercel.app": "links, QR targets and the booth fallback origin",
  "https://mineex.app": "QR target in marketing art",
  "https://www.newsfilecorp.com": "sourceUrl links in demo data", "https://www.mining.com": "source links in demo data", "https://mining.com": "source links",
  "https://www.kingsmenresources.com": "company website link", "https://kingsmenresources.com": "company website link",
  "https://www.linkedin.com": "share links", "https://linkedin.com": "share links", "https://twitter.com": "share links", "https://x.com": "share links",
  "https://finance.yahoo.com": "quote links", "https://ca.finance.yahoo.com": "quote links", "https://money.tmx.com": "quote links",
  "https://www.otcmarkets.com": "quote links", "https://www.stocktitan.net": "news links", "https://apps.apple.com": "App Store links",
  "https://reactjs.org": "React error-message links", "https://github.com": "library comment", "https://raw.github.com": "jszip licence comment",
  "https://stuk.github.io": "jszip error-message link", "http://stuartk.com": "jszip licence comment", "https://jcgt.org": "library comment",
  "https://capacitorjs.com": "Capacitor error-message link",
  "https://appleid.cdn-apple.com": "Apple sign-in script: initialised on iOS only (src/lib/auth.js), which runs the bundle natively, outside these headers",
  "https://connect.facebook.net": "Facebook login: switched off (capacitor.config.json providers.facebook=false; never initialised)",
  "https://api.x.com": "X login: switched off (providers.twitter=false; never initialised)",
  "https://api.anthropic.com": "DEFECT, deliberately not allowed: src/Onboarding.jsx callModel() calls the Anthropic API from the browser with no key; it can only fail. AI calls belong behind /api",
  "https://cdn.tailwindcss.com": "internal page only (__design-system.html); retire or exempt before enforcing",
  "https://cdn.jsdelivr.net": "internal page only (__design-system.html); retire or exempt before enforcing",
};

// ---- the policy -----------------------------------------------------------
const V = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
const pageRule = V.headers.find((r) => r.source === "/((?!api/|assets/).*)" && r.headers.some((h) => h.key === "X-Frame-Options"));
const get = (k) => (pageRule && pageRule.headers.find((h) => h.key === k) || {}).value;
const RO = get("Content-Security-Policy-Report-Only") || "";
const policy = Object.fromEntries(RO.split(";").map((d) => d.trim()).filter(Boolean).map((d) => { const [k, ...v] = d.split(/\s+/); return [k, v]; }));
const sources = (dir) => policy[dir] || policy["default-src"] || [];
const allows = (dir, origin) => {
  const host = new URL(origin).host;
  return sources(dir).some((s) => s === origin || s === "https:" && origin.startsWith("https:") || (s.startsWith("https://*.") && host.endsWith(s.slice(9))));
};

console.log("\n  THE POLICY");
ok(!!RO && !!policy["default-src"], "page routes carry Content-Security-Policy-Report-Only");
ok(get("Content-Security-Policy") === "frame-ancestors 'self' capacitor://localhost", "the ENFORCED CSP is still frame-ancestors only: nothing is blocked");
ok(!policy["report-uri"] && !policy["report-to"], "no report-uri / report-to: no reports leave the browser (violations show in its console)");
ok(sources("default-src").join(" ") === "'self'" && sources("object-src").join(" ") === "'none'" && sources("base-uri").join(" ") === "'self'" && sources("frame-src").join(" ") === "'self'", "default-src 'self', object-src 'none', base-uri 'self', frame-src 'self'");
ok(!sources("script-src").some((s) => s === "'unsafe-inline'" || s === "'unsafe-eval'" || s === "https:" || s === "*"), "script-src has no unsafe-inline, unsafe-eval or wildcard");
ok(Object.entries(policy).every(([k, v]) => k === "img-src" || !v.some((s) => s === "https:" || s === "*" || s.includes("*"))), "the only scheme-wide source is img-src https: (company images come from their own sites)");

// ---- the built app ----------------------------------------------------------
const out = fs.mkdtempSync(path.join(os.tmpdir(), "csp-build-"));
const b = spawnSync(process.execPath, ["node_modules/vite/bin/vite.js", "build", "--outDir", out, "--emptyOutDir", "--logLevel", "error"], { encoding: "utf8", timeout: 300000 });
ok(b.status === 0, "the app builds (into a temporary folder)", (b.stderr || "").slice(0, 300));
const files = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (/\.(m?js|css|html)$/.test(e.name)) files.push(f); } };
if (b.status === 0) walk(out);
const found = new Map();   // origin -> first file
const ORIGIN = /\b(https?|wss?):\/\/((?:\{[a-z]\}|[a-z0-9-]+)(?:\.[a-z0-9-]+)*\.[a-z]{2,})(:\d+)?/gi;
for (const f of files) {
  for (const m of fs.readFileSync(f, "utf8").matchAll(ORIGIN)) {
    const o = `${m[1].toLowerCase()}://${m[2].toLowerCase().replace(/^\{[a-z]\}\./, "a.")}${m[3] || ""}`;
    if (!found.has(o)) found.set(o, path.relative(out, f));
  }
}

console.log("\n  EVERY ORIGIN IN THE BUILD IS ACCOUNTED FOR");
ok(found.size > 20 && found.has(SB_PROD) && found.has("https://cdnjs.cloudflare.com"), `read ${files.length} built files, ${found.size} origins`);
const unknown = [...found].filter(([o]) => !LOADED[o] && !NOT_LOADED[o]);
ok(unknown.length === 0, "no origin outside LOADED / NOT_LOADED", unknown.map(([o, f]) => `${o} (${f})`).join("; "));
for (const [o, dirs] of Object.entries(LOADED)) {
  const missing = dirs.filter((d) => !allows(d, o));
  ok(missing.length === 0, `${o}: allowed in ${dirs.join(", ")}`, `not allowed in ${missing.join(", ")}`);
}
for (const o of ["https://api.anthropic.com", "https://api.x.com", "https://connect.facebook.net", "https://appleid.cdn-apple.com", "https://cdn.tailwindcss.com"]) {
  ok(!["script-src", "connect-src", "style-src"].some((d) => allows(d, o)), `${o}: NOT allowed (${NOT_LOADED[o].split(":")[0].split(";")[0]})`);
}
// A NOT_LOADED origin must not be loaded in code that runs on the web: no fetch,
// script/stylesheet/worker/import, apart from the ones named as such above.
const LOADS = /(fetch\(\s*[`"']?|\.src\s*=\s*[`"']?|\.href\s*=\s*[`"']?|import\(\s*[`"']?|new Worker\(\s*[`"']?|tileLayer\(\s*[`"']?|<script[^>]*src=["']?|<link[^>]*href=["']?)$/;
const EXPECT_LOADS = new Set(["https://api.anthropic.com", "https://api.x.com", "https://connect.facebook.net", "https://appleid.cdn-apple.com", "https://cdn.tailwindcss.com", "https://cdn.jsdelivr.net"]);
const sneaky = [];
for (const f of files) {
  const s = fs.readFileSync(f, "utf8");
  for (const m of s.matchAll(ORIGIN)) {
    const o = `${m[1].toLowerCase()}://${m[2].toLowerCase()}`;
    if (NOT_LOADED[o] && !EXPECT_LOADS.has(o) && LOADS.test(s.slice(Math.max(0, m.index - 60), m.index))) sneaky.push(`${o} (${path.relative(out, f)})`);
  }
}
ok(sneaky.length === 0, "no 'not loaded' origin is actually fetched, scripted or imported", [...new Set(sneaky)].join("; "));
ok(Object.keys(LOADED).filter((o) => o !== "https://cdn.fontshare.com").every((o) => found.has(o)), "every LOADED origin is really in the build (nothing allowed 'just in case', bar fontshare's font host)");

console.log("\n  INLINE CODE");
const html = b.status === 0 ? fs.readFileSync(path.join(out, "index.html"), "utf8") : "";
const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${crypto.createHash("sha256").update(m[1], "utf8").digest("base64")}'`);
ok(inline.length >= 1 && inline.every((h) => sources("script-src").includes(h)), `the app page's ${inline.length} inline script(s) are hashed in script-src (change one, update the hash)`, inline.join(" "));
ok(sources("style-src").includes("'unsafe-inline'"), "style-src allows inline styles (React style attributes; see the enforce plan)");
const evals = files.filter((f) => /new Function\(|\beval\(/.test(fs.readFileSync(f, "utf8"))).map((f) => path.basename(f).split("-")[0]);
ok(!sources("script-src").includes("'unsafe-eval'"), `no unsafe-eval; eval-capable libraries to check while reporting: ${[...new Set(evals)].join(", ") || "none"}`);

fs.rmSync(out, { recursive: true, force: true });
console.log(`\n  csp-report-only: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
