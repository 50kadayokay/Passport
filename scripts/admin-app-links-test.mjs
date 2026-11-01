// Admin "View Company" links open the app on the deployment the admin is on
// (staging -> staging, production -> production), never a hard-coded host;
// printed QR codes keep a fixed public origin. Offline.
//   node scripts/admin-app-links-test.mjs
import fs from "node:fs";
import { appOrigin, appCompanyUrl, FALLBACK_APP_ORIGIN } from "../src/admin/appLinks.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}`); } };
const loc = (origin) => { const u = new URL(origin); return { origin: u.origin, protocol: u.protocol }; };

ok(appCompanyUrl("alpha-gold", "", loc("https://staging-mineex.vercel.app")) === "https://staging-mineex.vercel.app/app?c=alpha-gold", "staging admin -> staging app");
ok(appCompanyUrl("alpha-gold", "&ipad=1", loc("https://passport-xi-five.vercel.app")) === "https://passport-xi-five.vercel.app/app?c=alpha-gold&ipad=1", "production admin -> production app (unchanged)");
ok(appCompanyUrl("a b&c", "", loc("http://localhost:4353")) === "http://localhost:4353/app?c=a%20b%26c", "localhost -> local app; slug encoded");
ok(appOrigin({ origin: "null", protocol: "file:" }) === FALLBACK_APP_ORIGIN && appOrigin(null) === FALLBACK_APP_ORIGIN, "no usable origin (file:, none) -> the previous fixed origin");
ok(appOrigin({ origin: "capacitor://localhost", protocol: "capacitor:" }) === FALLBACK_APP_ORIGIN, "native shell -> fixed origin");

const files = ["src/admin/Admin.jsx", "src/admin/BlueprintReview.jsx", "src/admin/onboarding/OnboardingWorkspace.jsx"];
for (const f of files) {
  const s = fs.readFileSync(f, "utf8");
  ok(!/href=\{`\$\{PASSPORT_BASE\}/.test(s) && /appCompanyUrl\(/.test(s), `${f}: on-screen app links use appCompanyUrl`);
}
const admin = fs.readFileSync("src/admin/Admin.jsx", "utf8");
ok(/const publicUrlFor = \(slug\) => `\$\{PRINT_BASE\}\/app\?c=/.test(admin), "printed QR (publicUrlFor) keeps the fixed public origin");

console.log(`\n  admin-app-links: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
