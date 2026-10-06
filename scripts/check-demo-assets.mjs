// Fails if the Investor demo's FICTIONAL market ever points at a real company's assets.
//
// Background: every `site-NN-*.webp` in public/marketing is Kingsmen's own Las Coloradas
// photography (mirrored from the Supabase bucket `company-media/kingsmen/`). Twelve of them
// were once handed out to Cerro Pálido, Taiga, Northreach, Veta Madre and Ashfall as if they
// were those issuers' own project photos. This guard makes that specific mistake loud.
import { readFileSync } from "fs";

const SRC = "src/marketing/demo/investorFixture.js";
const text = readFileSync(SRC, "utf8");

// Only real ASSET PATHS count — a slug like "kingsmen-resources" or the word in a comment
// is not an image. A path is anything with a slash and an image extension.
const PATHS = /["'`](\/[^"'`\s]+\.(?:webp|jpg|jpeg|png|svg|avif))["'`]/g;
const REAL_ASSET = /\/site-\d|hero-drillsite|\/marketing\/kingsmen-/;
const ALLOWED = new Set(["/marketing/kingsmen-avatar.webp"]);   // Kingsmen's own row

const bad = [];
for (const m of text.matchAll(PATHS)) if (REAL_ASSET.test(m[1]) && !ALLOWED.has(m[1])) bad.push(m[1]);

if (bad.length) {
  console.error("\n✗ Real-company assets referenced by the fictional Investor market:\n");
  for (const b of [...new Set(bad)]) console.error("   " + b);
  console.error(`\n  ${SRC} may only use /marketing/demo/logos and /marketing/demo/scenes.`);
  console.error("  Kingsmen's photography belongs to the Research chapter alone.\n");
  process.exit(1);
}

// Second rule: no photograph may illustrate two different fictional stories.
const used = [...text.matchAll(/\/marketing\/demo\/scenes\/([\w-]+)\.svg/g)].map((m) => m[1]);
const dupes = used.filter((v, i) => used.indexOf(v) !== i);
if (dupes.length) {
  console.error("\n✗ Scene reused across fictional stories: " + [...new Set(dupes)].join(", ") + "\n");
  process.exit(1);
}

console.log(`✓ Investor demo assets clean — ${used.length} scenes, no repeats, no real-company imagery.`);
