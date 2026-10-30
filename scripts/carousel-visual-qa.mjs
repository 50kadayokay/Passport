// Renders every composition to a real 1080x1350 PNG for visual inspection.
//   node scripts/carousel-visual-qa.mjs [outDir]
//
// Not a substitute for looking at the images. It rasterises them so a human
// can, and it fails loudly on the two things a human should not have to hunt
// for: text that could not fit at its minimum size, and text measured wider
// than its box.

import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import SlideSVG from "../src/portal/publish/carousel/SlideSVG.jsx";
import { FAMILY_IDS, FAMILIES } from "../src/portal/publish/carousel/families.js";
import { COMPOSITIONS } from "../src/portal/publish/carousel/layouts.jsx";
import { buildCarousel } from "../src/lib/carousel.js";

const OUT = process.argv[2] || "/tmp/carousel-qa";
fs.mkdirSync(OUT, { recursive: true });

/* ---- fixtures that exercise the hard cases ---- */
const DRILL = {
  headline: "Kingsmen Resources Intersects 1,742 g/t Silver Equivalent over 0.7 Metres in Its First Drill Program at Las Coloradas",
  category: "Discovery", sourceDate: "2026-10-09",
  whatHappened: "The first six holes of the autumn programme returned 31.4 metres at 4.8 g/t gold, including 2.1 metres at 46.2 g/t, and two further mineralised intercepts along strike and at depth.",
  whyItMatters: "This is the widest high-grade interval drilled on the property.",
  investorTakeaway: "A wider, higher-grade intercept that extends the zone at depth moves this from a single discovery hole toward something that can carry a resource estimate — with three holes still pending.",
  projectsMentioned: ["Las Coloradas Silver-Gold Project"], sourceUrl: "https://kingsmenresources.example/news/2026-10-09-keel-zone",
  keyNumbers: [
    { value: "31.4 m @ 4.8 g/t Au", label: "RC-26-088 from 149.0 m" },
    { value: "2.1 m @ 46.2 g/t Au", label: "included in the above" },
    { value: "18.7 m @ 2.9 g/t Au", label: "RC-26-089, 60 m along strike" },
    { value: "1,742 g/t AgEq", label: "over 0.70 m, hole LC-25-010" },
  ],
};
const FIN = {
  headline: "Company Closes Upsized C$18.2 Million Bought Deal Financing",
  category: "Financing", sourceDate: "2026-08-21",
  whatHappened: "The bought deal private placement closed fully subscribed for gross proceeds of C$18.2 million, having been upsized twice on demand.",
  whyItMatters: "The programme is now funded through to a maiden resource estimate.",
  investorTakeaway: "Being funded through to a maiden resource removes the question most likely to have been asked at the next financing.",
  projectsMentioned: ["Las Coloradas"], sourceUrl: "https://kingsmenresources.example/news/financing",
  keyNumbers: [{ value: "C$18.2M", label: "gross proceeds" }, { value: "Fully subscribed", label: "upsized twice on demand" }],
};
const SHORT = { ...DRILL, headline: "Drilling Hits 31.4 m of 4.8 g/t Au", keyNumbers: [DRILL.keyNumbers[0]] };

const BRAND = { name: "Kingsmen Resources Ltd.", tickers: [{ ex: "TSXV", sym: "KNG" }, { ex: "OTCQB", sym: "KNGRF" }, { ex: "FSE", sym: "TUY" }] };
const LONGNAME = { name: "Cordillera Silver & Base Metals Exploration Corporation", tickers: [{ ex: "TSXV", sym: "CSBX" }] };

// A real photograph, as a data URI, so image compositions are exercised.
// REAL KINGSMEN ASSETS, not mockups. Downloaded once to /tmp/kings by the
// caller; librsvg decodes PNG/JPEG in <image href> but not WebP, so the site
// photograph is transcoded here. The browser handles either.
const dataUri = async (file, w, h) => {
  try {
    const buf = await sharp(file).resize(w, h, { fit: "cover" }).jpeg({ quality: 86 }).toBuffer();
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  } catch { return ""; }
};
const PHOTO = await dataUri("/tmp/kings/site.webp", 1400, 1400);
const LOGO = await dataUri("/tmp/kings/logo.jpeg", 480, 480);
const LOGO_ASPECT = await (async () => { try { const m = await sharp("/tmp/kings/logo.jpeg").metadata(); return m.width / m.height; } catch { return 1; } })();
// A wide wordmark and a transparent mark, to prove logos are contained rather
// than cropped, stretched or rounded.
const WORDMARK = await (async () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="200"><rect width="900" height="200" fill="none"/><text x="10" y="140" font-family="Helvetica" font-size="110" font-weight="800" fill="#0b1220">KINGSMEN</text></svg>`;
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return `data:image/png;base64,${buf.toString("base64")}`;
})();

async function render(name, { slide, family, accent, brand, imageHref = "", logoHref = "", logoAspect = 1 }) {
  const problems = [];
  const markup = renderToStaticMarkup(
    React.createElement(SlideSVG, {
      slide, family, accent, brand, imageHref, logoHref, logoAspect,
      onOverflow: (id, comp) => problems.push(`overflow in ${id}/${comp}`),
    })
  );
  const file = path.join(OUT, `${name}.png`);
  await sharp(Buffer.from(markup)).resize(1080, 1350).png().toFile(file);
  const meta = await sharp(file).metadata();
  if (meta.width !== 1080 || meta.height !== 1350) problems.push(`wrong size ${meta.width}x${meta.height}`);
  return { file, problems };
}

const carouselFor = (card, brand, images) => buildCarousel({ card, classification: {}, brand, images });

const run = async () => {
  let made = 0; const issues = [];

  // 1. EVERY COMPOSITION, on the family that best shows it.
  const showcase = { announcement: "broadsheet", keyResults: "obsidian", context: "bleed", why: "paper", closing: "core" };
  const c = carouselFor(DRILL, BRAND, PHOTO ? [{ id: "p", url: PHOTO }] : []);
  for (const [kind, comps] of Object.entries(COMPOSITIONS)) {
    const slide = c.slides.find((s) => s.kind === kind);
    for (const comp of comps) {
      const r = await render(`comp-${kind}-${comp.id}`,
        { slide: { ...slide, layout: comp.id }, family: showcase[kind], accent: "#2563eb", brand: BRAND, imageHref: PHOTO, logoHref: LOGO, logoAspect: LOGO_ASPECT });
      made++; if (r.problems.length) issues.push(`${kind}/${comp.id}: ${r.problems.join(", ")}`);
    }
  }

  // 2. EVERY FAMILY, same slide, so the families can be compared directly.
  for (const fam of FAMILY_IDS) {
    for (const kind of ["announcement", "keyResults"]) {
      const slide = c.slides.find((s) => s.kind === kind);
      const r = await render(`family-${fam}-${kind}`, { slide, family: fam, accent: "#2563eb", brand: BRAND, imageHref: PHOTO, logoHref: LOGO, logoAspect: LOGO_ASPECT });
      made++; if (r.problems.length) issues.push(`${fam}/${kind}: ${r.problems.join(", ")}`);
    }
  }

  // 3. THE HARD CASES.
  const hard = [
    ["stress-longheadline", { slide: { ...c.slides[0], layout: "poster" }, family: "obsidian", accent: "#2563eb", brand: BRAND }],
    ["stress-shortheadline", { slide: carouselFor(SHORT, BRAND, []).slides[0], family: "broadsheet", accent: "#2563eb", brand: BRAND }],
    ["stress-longcompany", { slide: carouselFor(DRILL, LONGNAME, []).slides[4], family: "paper", accent: "#0f766e", brand: LONGNAME, logoHref: LOGO, logoAspect: LOGO_ASPECT }],
    ["stress-financing-results", { slide: carouselFor(FIN, BRAND, []).slides[1], family: "grid", accent: "#6d28d9", brand: BRAND }],
    ["stress-financing-banner", { slide: { ...carouselFor(FIN, BRAND, []).slides[1], layout: "banner" }, family: "bleed", accent: "#b45309", brand: BRAND }],
    ["stress-noimage-context", { slide: { ...carouselFor(DRILL, BRAND, []).slides[2], layout: "bleed" }, family: "core", accent: "#2563eb", brand: BRAND }],
    ["stress-fourfigures", { slide: { ...c.slides[1], layout: "quadrant" }, family: "grid", accent: "#111827", brand: BRAND }],
    ["stress-ledger-units", { slide: { ...c.slides[1], layout: "ledger" }, family: "core", accent: "#0d9488", brand: BRAND }],
    ["logo-wordmark-stacked", { slide: carouselFor(DRILL, BRAND, []).slides[4], family: "broadsheet", accent: "#2563eb", brand: BRAND, logoHref: WORDMARK, logoAspect: 4.5 }],
    ["logo-wordmark-centred", { slide: { ...carouselFor(DRILL, BRAND, []).slides[4], layout: "centred" }, family: "paper", accent: "#2563eb", brand: BRAND, logoHref: WORDMARK, logoAspect: 4.5 }],
    ["logo-square-bar", { slide: { ...carouselFor(DRILL, BRAND, []).slides[4], layout: "bar" }, family: "obsidian", accent: "#2563eb", brand: BRAND, logoHref: LOGO, logoAspect: LOGO_ASPECT }],
    ["stress-paleaccent", { slide: { ...c.slides[1], layout: "banner" }, family: "paper", accent: "#fbbf24", brand: BRAND }],
    ["stress-darkaccent", { slide: { ...c.slides[3], layout: "panel" }, family: "obsidian", accent: "#7c3aed", brand: BRAND }],
  ];
  for (const [name, opts] of hard) {
    const r = await render(name, opts); made++;
    if (r.problems.length) issues.push(`${name}: ${r.problems.join(", ")}`);
  }

  // 4. COMPLETE CAROUSELS — the thing a company would actually post.
  const decks = [
    ["deck-drilling", DRILL, BRAND, "broadsheet", "#2563eb", PHOTO],
    ["deck-financing", FIN, BRAND, "obsidian", "#2563eb", ""],
    ["deck-longheadline", { ...DRILL }, BRAND, "bleed", "#b45309", PHOTO],
    ["deck-noimagery", { ...DRILL }, BRAND, "grid", "#0f766e", ""],
  ];
  for (const [name, card, brand, fam, accent, photo] of decks) {
    const deck = carouselFor(card, brand, photo ? [{ id: "p", url: photo }] : []);
    for (let i = 0; i < deck.slides.length; i++) {
      const sl = deck.slides[i];
      const r = await render(`${name}-${i + 1}-${sl.id}`,
        { slide: sl, family: fam, accent, brand, imageHref: photo, logoHref: LOGO, logoAspect: LOGO_ASPECT });
      made++; if (r.problems.length) issues.push(`${name}/${sl.id}: ${r.problems.join(", ")}`);
    }
  }

  // 5. CONTACT SHEET — all six families, one row each, five slides across.
  const sheetCols = 5, cell = 300, gap = 16, label = 34;
  const rowsImgs = [];
  for (const fam of FAMILY_IDS) {
    const deck = carouselFor(DRILL, BRAND, PHOTO ? [{ id: "p", url: PHOTO }] : []);
    const cells = [];
    for (const sl of deck.slides) {
      const markup = renderToStaticMarkup(React.createElement(SlideSVG, {
        slide: sl, family: fam, accent: "#2563eb", brand: BRAND, imageHref: PHOTO, logoHref: LOGO, logoAspect: LOGO_ASPECT }));
      cells.push(await sharp(Buffer.from(markup)).resize(cell, Math.round(cell * 1350 / 1080)).png().toBuffer());
    }
    rowsImgs.push({ fam, cells });
  }
  const ch = Math.round(cell * 1350 / 1080);
  const sheetW = sheetCols * cell + (sheetCols + 1) * gap;
  const sheetH = rowsImgs.length * (ch + label + gap) + gap;
  const svgLabels = rowsImgs.map((r, i) =>
    `<text x="${gap}" y="${gap + i * (ch + label + gap) + 24}" font-family="Helvetica" font-size="20" font-weight="700" fill="#0f172a">${FAMILIES[r.fam].label.toUpperCase()}</text>`).join("");
  const composites = [];
  rowsImgs.forEach((r, i) => r.cells.forEach((buf, j) => composites.push({
    input: buf, left: gap + j * (cell + gap), top: gap + i * (ch + label + gap) + label })));
  await sharp({ create: { width: sheetW, height: sheetH, channels: 3, background: "#ffffff" } })
    .composite([...composites, { input: Buffer.from(`<svg width="${sheetW}" height="${sheetH}">${svgLabels}</svg>`), top: 0, left: 0 }])
    .png().toFile(path.join(OUT, "contact-sheet.png"));
  made++;

  console.log(`\n  rendered ${made} PNGs to ${OUT}`);
  console.log(`  compositions: ${Object.values(COMPOSITIONS).reduce((n, a) => n + a.length, 0)} across ${Object.keys(COMPOSITIONS).length} slide types`);
  console.log(`  families: ${FAMILY_IDS.length}`);
  if (issues.length) { console.log(`\n  ${issues.length} ISSUE(S):`); issues.forEach((i) => console.log("   -", i)); }
  else console.log("\n  no overflow or sizing issues detected");
  process.exit(issues.length ? 1 : 0);
};
run().catch((e) => { console.error(e); process.exit(1); });
