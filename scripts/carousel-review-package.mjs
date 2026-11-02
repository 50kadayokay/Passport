// Builds a visual review package of the CURRENT carousel output.
//   npx vite-node scripts/carousel-review-package.mjs [outDir]
//
// Renders only. Nothing here improves, tweaks or special-cases a design: the
// point is to show exactly what the generator produces today so it can be
// judged honestly.

import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import JSZip from "jszip";
import SlideSVG from "../src/portal/publish/carousel/SlideSVG.jsx";
import { FAMILIES, FAMILY_IDS } from "../src/portal/publish/carousel/families.js";
import { COMPOSITIONS } from "../src/portal/publish/carousel/layouts.jsx";
import { buildCarousel } from "../src/lib/carousel.js";

const OUT = process.argv[2] || path.join(process.env.HOME, "Desktop", "MineEx-Carousel-Review");
const DIR = {
  root: OUT,
  slides: path.join(OUT, "01-slides-by-family"),
  families: path.join(OUT, "02-comparison-by-slide-type"),
  catalogue: path.join(OUT, "03-composition-catalogue"),
};
Object.values(DIR).forEach((d) => fs.mkdirSync(d, { recursive: true }));

/* ---- the release: a real Kingsmen drilling announcement ---- */
const CARD = {
  headline: "Kingsmen Resources Intersects 1,742 g/t Silver Equivalent over 0.7 Metres in Its First Drill Program at Las Coloradas",
  category: "Discovery", sourceDate: "2026-10-09",
  whatHappened: "The first six holes of the autumn programme returned 31.4 metres at 4.8 g/t gold, including 2.1 metres at 46.2 g/t, and two further mineralised intercepts along strike and at depth.",
  whyItMatters: "This is the widest high-grade interval drilled on the property, and it extends the zone 140 m down-plunge from the discovery hole.",
  investorTakeaway: "A wider, higher-grade intercept that extends the zone at depth moves this from a single discovery hole toward something that can carry a resource estimate — with three holes still pending.",
  projectsMentioned: ["Las Coloradas Silver-Gold Project"],
  sourceUrl: "https://kingsmenresources.example/news/2026-10-09-keel-zone",
  keyNumbers: [
    { value: "31.4 m @ 4.8 g/t Au", label: "RC-26-088 from 149.0 m" },
    { value: "2.1 m @ 46.2 g/t Au", label: "included in the above" },
    { value: "18.7 m @ 2.9 g/t Au", label: "RC-26-089, 60 m along strike" },
    { value: "1,742 g/t AgEq", label: "over 0.70 m, hole LC-25-010" },
  ],
};
const BRAND = {
  name: "Kingsmen Resources Ltd.",
  tickers: [{ ex: "TSXV", sym: "KNG" }, { ex: "OTCQB", sym: "KNGRF" }, { ex: "FSE", sym: "TUY" }],
};
const ACCENT = "#2563eb";

const dataUri = async (file, w, h) => {
  try { const b = await sharp(file).resize(w, h, { fit: "cover" }).jpeg({ quality: 88 }).toBuffer();
        return `data:image/jpeg;base64,${b.toString("base64")}`; } catch { return ""; }
};

const SLIDE_LABEL = { announce: "1 Announcement", results: "2 Key Results", context: "3 Project Context", why: "4 Why It Matters", closing: "5 Closing" };

const png = async (el, w = 1080) => {
  const markup = renderToStaticMarkup(el);
  return sharp(Buffer.from(markup)).resize(w, Math.round(w * 1350 / 1080)).png().toBuffer();
};

const label = (text, w, h, size = 26, colour = "#0f172a") =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="0" y="${size}" font-family="Helvetica, Arial" font-size="${size}" font-weight="700" fill="${colour}">${text.replace(/&/g, "&amp;")}</text></svg>`);

const sheet = async ({ cols, cell, items, title, file, rowLabels = [], colLabels = [] }) => {
  const ch = Math.round(cell * 1350 / 1080);
  const gap = 18, padT = 86, rowLab = rowLabels.length ? 36 : 0, colLab = colLabels.length ? 30 : 0;
  const rows = Math.ceil(items.length / cols);
  const W = cols * cell + (cols + 1) * gap;
  const H = padT + colLab + rows * (ch + rowLab + gap) + gap;
  const comps = [{ input: label(title, W, 60, 34), top: 26, left: gap }];
  colLabels.forEach((t, i) => comps.push({ input: label(t, cell, colLab, 20, "#475569"), top: padT - 4, left: gap + i * (cell + gap) }));
  for (let i = 0; i < items.length; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    const top = padT + colLab + r * (ch + rowLab + gap);
    if (rowLabels[i]) comps.push({ input: label(rowLabels[i], cell, rowLab, 20, "#0f172a"), top, left: gap + c * (cell + gap) });
    comps.push({ input: items[i], top: top + rowLab, left: gap + c * (cell + gap) });
  }
  const buf = await sharp({ create: { width: W, height: H, channels: 3, background: "#ffffff" } })
    .composite(comps).png().toBuffer();
  fs.writeFileSync(file, buf);
  return { file, W, H };
};

const run = async () => {
  const PHOTO = await dataUri("/tmp/kings/site.webp", 1400, 1400);
  const LOGO = await dataUri("/tmp/kings/logo.jpeg", 480, 480);
  const LOGO_ASPECT = await (async () => { try { const m = await sharp("/tmp/kings/logo.jpeg").metadata(); return m.width / m.height; } catch { return 1; } })();
  const deck = buildCarousel({ card: CARD, classification: {}, brand: BRAND, images: PHOTO ? [{ id: "p", url: PHOTO }] : [] });

  const made = [];
  const byFamily = {};           // fam -> [{slide, buf}]
  const resolved = {};           // fam -> [compositionId]

  // 1. THIRTY SLIDES, full resolution.
  for (const fam of FAMILY_IDS) {
    byFamily[fam] = []; resolved[fam] = [];
    for (const sl of deck.slides) {
      const el = React.createElement(SlideSVG, {
        slide: sl, family: fam, accent: ACCENT, brand: BRAND,
        imageHref: sl.fields.imageUrl ? PHOTO : "", logoHref: sl.kind === "closing" ? LOGO : "", logoAspect: LOGO_ASPECT,
      });
      const buf = await png(el, 1080);
      const file = path.join(DIR.slides, `${fam}-${SLIDE_LABEL[sl.id].replace(/\s+/g, "-")}.png`);
      fs.writeFileSync(file, buf); made.push(file);
      byFamily[fam].push({ slide: sl, buf: await png(el, 300) });
      // which composition the family actually resolved to
      const comps = COMPOSITIONS[sl.kind];
      const pref = (FAMILIES[fam].prefers || {})[sl.kind];
      let chosen = comps.find((c) => c.id === (sl.layout || pref)) || comps[0];
      if (chosen.needsImage && !sl.fields.imageUrl) chosen = comps.find((c) => !c.needsImage) || chosen;
      resolved[fam].push(chosen.id);
    }
  }

  // 2a. MASTER SHEET — 6 families x 5 slides.
  const masterItems = [], masterRowLabels = [];
  FAMILY_IDS.forEach((fam) => byFamily[fam].forEach(({ buf }, i) => {
    masterItems.push(buf);
    masterRowLabels.push(i === 0 ? `${FAMILIES[fam].label.toUpperCase()}  —  ${resolved[fam].join(" / ")}` : "");
  }));
  const master = await sheet({
    cols: 5, cell: 300, items: masterItems, rowLabels: masterRowLabels,
    colLabels: deck.slides.map((s) => SLIDE_LABEL[s.id]),
    title: "MineEx carousel — all six families, all five slides (same release)",
    file: path.join(DIR.root, "ALL-FAMILIES-contact-sheet.png"),
  });
  made.push(master.file);

  // 2b. ONE SHEET PER SLIDE TYPE.
  for (let i = 0; i < deck.slides.length; i++) {
    const sl = deck.slides[i];
    const items = FAMILY_IDS.map((fam) => byFamily[fam][i].buf);
    const labels = FAMILY_IDS.map((fam) => `${FAMILIES[fam].label}  ·  ${resolved[fam][i]}`);
    const f = await sheet({
      cols: 3, cell: 340, items, rowLabels: labels,
      title: `${SLIDE_LABEL[sl.id]} — the same slide across all six families`,
      file: path.join(DIR.families, `compare-${SLIDE_LABEL[sl.id].replace(/\s+/g, "-")}.png`),
    });
    made.push(f.file);
  }

  // 3. COMPOSITION CATALOGUE — all 20, each on a family that uses it.
  const usedBy = {};
  for (const fam of FAMILY_IDS) Object.entries(FAMILIES[fam].prefers || {}).forEach(([kind, id]) => {
    usedBy[`${kind}/${id}`] = [...(usedBy[`${kind}/${id}`] || []), FAMILIES[fam].label];
  });
  const catItems = [], catLabels = [];
  for (const [kind, comps] of Object.entries(COMPOSITIONS)) {
    const sl = deck.slides.find((s) => s.kind === kind);
    for (const comp of comps) {
      const owner = FAMILY_IDS.find((f) => (FAMILIES[f].prefers || {})[kind] === comp.id) || "broadsheet";
      const el = React.createElement(SlideSVG, {
        slide: { ...sl, layout: comp.id }, family: owner, accent: ACCENT, brand: BRAND,
        imageHref: PHOTO, logoHref: LOGO, logoAspect: LOGO_ASPECT,
      });
      const full = await png(el, 1080);
      const file = path.join(DIR.catalogue, `${kind}-${comp.id}.png`);
      fs.writeFileSync(file, full); made.push(file);
      catItems.push(await png(el, 300));
      const users = usedBy[`${kind}/${comp.id}`] || [];
      catLabels.push(`${kind}/${comp.id}${users.length ? "  ← " + users.join(", ") : "  (not a family default)"}`);
    }
  }
  const cat = await sheet({
    cols: 5, cell: 300, items: catItems, rowLabels: catLabels,
    title: "All 20 compositions — label shows which families use each one by default",
    file: path.join(DIR.root, "ALL-COMPOSITIONS-catalogue.png"),
  });
  made.push(cat.file);

  // 4. ZIP everything.
  const zip = new JSZip();
  for (const f of made) zip.file(path.relative(DIR.root, f), fs.readFileSync(f));
  const zipPath = path.join(DIR.root, "MineEx-carousel-review.zip");
  fs.writeFileSync(zipPath, await zip.generateAsync({ type: "nodebuffer" }));

  console.log(`\n  FOLDER: ${DIR.root}`);
  console.log(`  ZIP   : ${zipPath}`);
  console.log(`  files : ${made.length} PNGs + 1 ZIP`);
  console.log(`\n  master sheet : ${master.W}x${master.H}`);
  console.log(`  catalogue    : ${cat.W}x${cat.H}`);
  console.log("\n  compositions each family resolves to:");
  for (const fam of FAMILY_IDS) console.log(`    ${FAMILIES[fam].label.padEnd(12)} ${resolved[fam].join(" / ")}`);
  const unused = [];
  for (const [kind, comps] of Object.entries(COMPOSITIONS)) for (const c of comps)
    if (!usedBy[`${kind}/${c.id}`]) unused.push(`${kind}/${c.id}`);
  console.log(`\n  compositions NOT used as any family default (${unused.length}): ${unused.join(", ")}`);
};
run().catch((e) => { console.error(e); process.exit(1); });
