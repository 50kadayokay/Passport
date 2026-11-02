// Security headers in vercel.json, offline.   node scripts/security-headers-test.mjs
//
// Resolves vercel.json's `headers` rules for a request path the way Vercel does
// (every rule whose source matches applies, later rules win per key) and checks:
//   - every page -- portal, admin, investor app, booth, marketing, legal, share
//     pages -- gets nosniff, Referrer-Policy and framing protection;
//   - /api/ and /assets/ get nosniff only: they are fetched cross-origin (company
//     websites, the native apps, crawlers for og images), never framed;
//   - nothing in the app frames a page from another origin, so 'self' is enough
//     (capacitor://localhost covers the booth phone in a native webview);
//   - no ENFORCED script CSP (it is Report-Only, scripts/csp-report-only-test.mjs);
//   - production-smoke expects exactly these values.
// OFFLINE: reads files only.
import fs from "node:fs";
import path from "node:path";
import { PAGE_HEADERS } from "./production-smoke.mjs";

let pass = 0, fail = 0;
const ok = (c, m, d = "") => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); } };

const V = JSON.parse(fs.readFileSync("vercel.json", "utf8"));

// The source syntax vercel.json uses: literal segments, :params, and raw regex
// groups. Anything else is refused rather than guessed at.
const SUPPORTED = /^\/([A-Za-z0-9_.\-/]|:[a-z]+|\((\?!)?[A-Za-z0-9_./|()*?!]*\))*$/;
const toRegex = (src) => new RegExp(`^${src.replace(/:[a-z]+/g, "[^/]+")}$`);
const resolve = (p) => {
  const out = {};
  for (const rule of V.headers) if (toRegex(rule.source).test(p)) for (const h of rule.headers) out[h.key.toLowerCase()] = h.value;
  return out;
};

console.log("\n  RULES");
ok(V.headers.every((r) => SUPPORTED.test(r.source)), "every header source uses syntax this test resolves", V.headers.map((r) => r.source).join(" "));
ok(V.headers.every((r) => r.headers.every((h) => h.key !== "Content-Security-Policy" || !/script-src|default-src|style-src/.test(h.value))), "the ENFORCED CSP has no script/style rules (those are Report-Only, scripts/csp-report-only-test.mjs)");

console.log("\n  PAGES (headers apply)");
const PAGES = [
  ["/", "marketing / app front door"], ["/portal", "company portal"], ["/portal/anything", "portal deep link"],
  ["/admin", "admin"], ["/app", "investor app (web)"], ["/appdemo", "marketing phone render"],
  ["/conference", "booth kiosk"], ["/confv3demo", "booth template preview"], ["/site", "website demo"],
  ["/support", "support (rewrite)"], ["/privacy.html", "legal page"], ["/n/abc123", "news share page (rewritten to the API)"],
  ["/reset", "password reset"], ["/__home-study.html", "static study page"],
];
for (const [p, what] of PAGES) {
  const h = resolve(p);
  const miss = Object.entries(PAGE_HEADERS).filter(([k, v]) => h[k] !== v).map(([k]) => k);
  ok(miss.length === 0 && /no-store/.test(h["cache-control"] || ""), `${p} (${what})`, `missing/different: ${miss.join(", ") || "cache-control"}`);
}

console.log("\n  EXEMPT (nosniff only)");
const EXEMPT = [
  ["/api/site-content", "company websites fetch it cross-origin"], ["/api/site-manifest", "website builds PUT it"],
  ["/api/og-news", "og:image for crawlers and social cards"], ["/api/share-news", "the /n/ page's handler (headers come from the /n/ path)"],
  ["/api/stripe-webhook", "Stripe posts to it"], ["/api/conference-config", "native booth app fetches it"],
  ["/api/messages", "investor app (native, cross-origin) posts to it"], ["/assets/index-abc.js", "bundled scripts"],
];
for (const [p, why] of EXEMPT) {
  const h = resolve(p);
  ok(h["x-content-type-options"] === "nosniff" && !h["x-frame-options"] && !h["content-security-policy"] && !h["content-security-policy-report-only"] && !h["referrer-policy"], `${p}: ${why}`, JSON.stringify(h));
}
ok(/immutable/.test(resolve("/assets/x.js")["cache-control"] || ""), "/assets/ keeps its immutable cache");

console.log("\n  NOTHING FRAMES ANOTHER ORIGIN (so 'self' breaks nothing)");
const files = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (/\.(jsx?|html)$/.test(e.name)) files.push(f); } };
walk("src"); walk("public");
const iframes = [];
for (const f of files) {
  const s = fs.readFileSync(f, "utf8");
  for (const m of s.matchAll(/<iframe\b[\s\S]{0,400}?\bsrc=(\{`[^`]*`\}|\{[^}]*\}|"[^"]*")/g)) iframes.push({ f, src: m[1] });
}
ok(iframes.length >= 10, `found the app's iframes (${iframes.length})`);
const isLiteralCross = (src) => /^(\{`|")https?:/.test(src);
ok(isLiteralCross('"https://evil.example/x"') && isLiteralCross("{`https://x.example/${a}`}") && !isLiteralCross("{`/app?c=${s}`}") && !isLiteralCross("{src}"), "(the scan's classifier: literal https src is caught, relative and computed are not)");
const literalCross = iframes.filter((x) => isLiteralCross(x.src));
ok(literalCross.length === 0, "no iframe has a literal cross-origin src", literalCross.map((x) => `${x.f}: ${x.src}`).join("; "));
{
  // The one computed src that can be another origin: the booth's phone profile falls back
  // to the app host when the page's own origin is not http(s), i.e. a native webview.
  const scenes = fs.readFileSync("src/aiBrief/ConferenceScenes.jsx", "utf8");
  ok(/origin = window\.location\.origin/.test(scenes) && /profileUrl = `\$\{origin\}\/app/.test(scenes), "the booth phone frames /app on the page's own origin");
  ok(PAGE_HEADERS["content-security-policy"].split(/\s+/).includes("capacitor://localhost"), "...and capacitor://localhost may frame it (a native webview's origin)");
  const cap = JSON.parse(fs.readFileSync("capacitor.config.json", "utf8"));
  ok(cap.webDir === "dist" && !(cap.server && cap.server.url), "the native investor app loads its own bundle (top level; page headers never reach it)");
}

console.log("\n  production-smoke AGREES");
const page = resolve("/portal");
ok(Object.entries(PAGE_HEADERS).every(([k, v]) => page[k] === v), "production-smoke's PAGE_HEADERS = what vercel.json sets on pages");

console.log(`\n  security-headers: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
