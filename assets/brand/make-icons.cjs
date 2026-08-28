// Canonical MineEx icon generator. Run from anywhere:
//   node assets/brand/make-icons.cjs
//
// Regenerates every shipped icon plus the full iOS raster set from one source.
// Edit this file, never the generated SVG/PNGs.
//
// GEOMETRY IS SIGNED OFF AND MUST NOT DRIFT: on a 1024 tile the core is 144 x 480
// at corner radius 34, centred, on #0B0D10. Set GLARE = "none" and the output is
// byte-for-byte identical to the approved flat reference.
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "../..");
const BRAND = __dirname;
const sharp = require(path.join(ROOT, "node_modules/sharp"));

const STRATA = ["#7A4E33", "#C4633B", "#B6BCC3", "#D9A24C"]; // overburden · copper · silver · gold
const INK = "#0B0D10";
const CORE = { wPct: 144 / 1024, hPct: 480 / 1024, rPct: 34 / 144 };

// GLARE — light reflecting off the face of the icon, laid over the whole tile.
// The core artwork itself is never shaded. Options: "none" | "soft" | "streak" |
// "edge" | "glass".
const GLARE = "soft";

function glareLayer(size, id) {
  const sweep = (o1, o2) => `<linearGradient id="g${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="${o1}"/>
      <stop offset="${o2}" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <rect width="${size}" height="${size}" fill="url(#g${id})"/>`;
  return {
    none: "",
    soft: sweep(0.16, 0.42),
    edge: sweep(0.13, 0.45) + `<linearGradient id="e${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0.30"/>
        <stop offset="0.014" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <rect width="${size}" height="${size}" fill="url(#e${id})"/>`,
    streak: `<linearGradient id="g${id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0.06" stop-color="#fff" stop-opacity="0"/>
        <stop offset="0.20" stop-color="#fff" stop-opacity="0.20"/>
        <stop offset="0.34" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <rect width="${size}" height="${size}" fill="url(#g${id})"/>`,
    glass: `<linearGradient id="g${id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0.17"/>
        <stop offset="0.30" stop-color="#fff" stop-opacity="0.13"/>
        <stop offset="0.305" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <rect width="${size}" height="${size}" fill="url(#g${id})"/>`,
  }[GLARE];
}

function iconSVG({ size = 1024, id = "i" } = {}) {
  const w = size * CORE.wPct, h = size * CORE.hPct;
  const x = (size - w) / 2, y = (size - h) / 2, r = w * CORE.rPct;
  const bands = STRATA.map((c, i) =>
    `<rect x="${x}" y="${y + i * (h / 4)}" width="${w}" height="${h / 4}" fill="${c}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs><clipPath id="c${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/></clipPath></defs>
  <rect width="${size}" height="${size}" fill="${INK}"/>
  <g clip-path="url(#c${id})">${bands}</g>
  ${glareLayer(size, id)}
</svg>`;
}

// The core alone, transparent — flat, no glare (it has no tile to reflect off).
function coreSVG({ w = 512, id = "q" } = {}) {
  const h = w * (CORE.hPct / CORE.wPct), r = w * CORE.rPct;
  const bands = STRATA.map((c, i) =>
    `<rect x="0" y="${i * (h / 4)}" width="${w}" height="${h / 4}" fill="${c}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs><clipPath id="c${id}"><rect x="0" y="0" width="${w}" height="${h}" rx="${r}"/></clipPath></defs>
  <g clip-path="url(#c${id})">${bands}</g>
</svg>`;
}

// Square and opaque everywhere: iOS and Android apply their own mask, and App Store
// Connect rejects an icon carrying an alpha channel.
const render = (svg, size, out) =>
  sharp(Buffer.from(svg)).resize(size, size).flatten({ background: INK }).removeAlpha().png().toFile(out);

const IOS = [20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 1024];

(async () => {
  const base = iconSVG();
  fs.mkdirSync(`${BRAND}/app/ios`, { recursive: true });
  fs.writeFileSync(`${BRAND}/app/icon-master.svg`, base);
  fs.writeFileSync(`${BRAND}/app/icon-maskable-master.svg`, base);

  for (const s of IOS) await render(base, s, `${BRAND}/app/ios/icon-${s}.png`);

  await render(base, 192, `${ROOT}/public/icon-192.png`);
  await render(base, 512, `${ROOT}/public/icon-512.png`);
  await render(base, 512, `${ROOT}/public/icon-maskable-512.png`);
  await render(base, 180, `${ROOT}/public/apple-touch-icon.png`);
  await render(base, 32, `${ROOT}/public/favicon-32.png`);

  fs.writeFileSync(`${ROOT}/public/booth-icon.svg`, iconSVG({ size: 512, id: "b" }));
  fs.writeFileSync(`${ROOT}/assets/app-icon.svg`,
`<!-- MineEx app icon — a drill core: four strata (overburden, copper, silver, gold)
     on near-black. Full-bleed square, no transparency, so iOS and Android apply
     their own mask and the App Store accepts it.
     Generated by assets/brand/make-icons.cjs — edit there, not here. -->
${base}`);

  fs.writeFileSync(`${BRAND}/mineex-core-sample.svg`, coreSVG());
  await sharp(Buffer.from(coreSVG({ w: 900, id: "big" }))).png().toFile(`${BRAND}/mineex-core-sample.png`);
  await sharp(Buffer.from(coreSVG({ w: 200, id: "web" }))).webp({ quality: 92, alphaQuality: 100 })
    .toFile(`${ROOT}/public/marketing/mineex-core.webp`);

  console.log(`icons regenerated · core ${Math.round(1024 * CORE.wPct)}x${Math.round(1024 * CORE.hPct)} ` +
              `r=${Math.round(1024 * CORE.wPct * CORE.rPct)} · glare "${GLARE}"`);
})();
