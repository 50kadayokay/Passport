// Regenerate every app-icon raster from assets/app-icon.svg.
//   node scripts/generate-icons.mjs
// Outputs the iOS AppIcon (1024, no alpha) + the PWA/web icon set in public/.
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svg = readFileSync(join(root, "assets/app-icon.svg"));
const CREAM = "#F1ECE2";
const GREEN = "#059669"; // MineEx brand green — matches the web welcome splash

// Render the SVG at a given square size.
const render = (size) => sharp(svg, { density: 384 }).resize(size, size);

const targets = [
  // iOS app icon — MUST be flattened (no alpha channel) or App Store rejects it.
  { size: 1024, out: "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png", flatten: true },
  // PWA / web icons.
  { size: 512, out: "public/icon-512.png" },
  { size: 512, out: "public/icon-maskable-512.png" },   // core is inside the safe zone already
  { size: 192, out: "public/icon-192.png" },
  { size: 180, out: "public/apple-touch-icon.png", flatten: true },
  { size: 32, out: "public/favicon-32.png" },
];

for (const t of targets) {
  let img = render(t.size);
  if (t.flatten) img = img.flatten({ background: CREAM });
  await img.png().toFile(join(root, t.out));
  console.log(`✓ ${t.out} (${t.size}px${t.flatten ? ", no alpha" : ""})`);
}

// iOS native launch screen (Capacitor): a solid brand-green 2732² canvas with the icon
// centred, so the native splash matches the web welcome splash (no white flash). The
// storyboard shows it scaleAspectFill, which only ever crops the green margins. All
// three Capacitor slots get the same image.
const splashDir = "ios/App/App/Assets.xcassets/Splash.imageset";
// Round the tile's corners (dest-in mask) so it reads as an app-icon tile on green.
const roundMask = Buffer.from('<svg width="460" height="460"><rect width="460" height="460" rx="104" ry="104"/></svg>');
const logoBuf = await sharp(await render(460).png().toBuffer()).composite([{ input: roundMask, blend: "dest-in" }]).png().toBuffer();
const splashBuf = await sharp({ create: { width: 2732, height: 2732, channels: 4, background: GREEN } })
  .composite([{ input: logoBuf, gravity: "center" }]).png().toBuffer();
for (const f of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) {
  await sharp(splashBuf).toFile(join(root, `${splashDir}/${f}`));
}
console.log("✓ iOS splash ×3 (green + centred logo)");
console.log("done");
