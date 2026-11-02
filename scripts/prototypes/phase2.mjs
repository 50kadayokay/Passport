// PHASE 2 — four new premium families + interchangeable layout proof.
//   npx vite-node scripts/prototypes/phase2.mjs
//
// Isolated design exploration. Nothing here is wired into the portal.
// Shared imports are text primitives only; every composition is hand-built.
//
// MANDATORY IN ALL FOUR: the company's full name, set as readable type with a
// deliberate place in the hierarchy -- above the headline as a masthead, or
// beneath it as a signature, never as a footer whisper and never only a logo.

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { W, H, SERIF, SANS, MONO, block, line, img, logoMark, inkOn } from "../../src/portal/publish/carousel/premiumText.js";

const OUT = path.join(process.env.HOME, "Desktop", "MineEx-Phase2-Prototypes");
fs.mkdirSync(OUT, { recursive: true });

/* ---- real, approved Kingsmen content ---- */
const C = {
  company: "Kingsmen Resources Ltd.",
  eyebrow: "Discovery",
  headline: "Kingsmen Resources Intersects 1,742 g/t Silver Equivalent over 0.7 Metres in Its First Drill Program at Las Coloradas",
  project: "Las Coloradas Silver-Gold Project",
  location: "Parral Mining District, Chihuahua, Mexico",
  date: "9 October 2026", dateISO: "2026-10-09",
  tickers: [["TSXV", "KNG"], ["OTCQB", "KNGRF"], ["FSE", "TUY"]],
  rows: [
    { v: "1,742", u: "g/t AgEq", d: "over 0.70 m, hole LC-25-010" },
    { v: "31.4", u: "m @ 4.8 g/t Au", d: "RC-26-088 from 149.0 m" },
    { v: "2.1", u: "m @ 46.2 g/t Au", d: "included in the above" },
    { v: "18.7", u: "m @ 2.9 g/t Au", d: "RC-26-089, 60 m along strike" },
  ],
};
const TICK = C.tickers.map(([e, s]) => `${e} ${s}`).join("   ·   ");
const svg = (inner, bg) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${bg}"/>${inner}</svg>`;

/* =====================================================================
   ATRIUM — architectural minimalism
   One vertical axis, enormous air, a single graphite line. The company
   name is the masthead: small caps, wide tracking, sitting on the axis.
   ===================================================================== */
const AT = { BONE: "#e8e6e1", CONCRETE: "#9b9892", GRAPHITE: "#3a3a38", INK: "#1c1c1a" };
const atrium = {
  label: "Atrium", blurb: "Architectural minimalism",
  announcement: () => {
    const AX = 300;                                    // the single vertical axis
    return svg(`
      <rect x="${AX}" y="0" width="1" height="${H}" fill="${AT.GRAPHITE}" opacity="0.28"/>
      <rect x="${AX}" y="150" width="1" height="90" fill="${AT.GRAPHITE}"/>
      ${line(C.company, { x: AX + 44, y: 198, w: 700, font: SANS, weight: 600, size: 29, fill: AT.INK, tracking: 5.5, upper: true })}
      ${line(C.eyebrow, { x: AX + 44, y: 242, w: 700, font: SANS, weight: 500, size: 15, fill: AT.CONCRETE, tracking: 7, upper: true })}
      ${block(C.headline, { x: AX + 44, y: 420, w: W - AX - 44 - 110, h: 420, font: SANS, weight: 300, min: 34, max: 50, lh: 1.42, fill: AT.INK })}
      <rect x="${AX}" y="980" width="1" height="90" fill="${AT.GRAPHITE}"/>
      ${line(C.project, { x: AX + 44, y: 1018, w: 620, font: SANS, weight: 500, size: 19, fill: AT.INK, tracking: 1.2 })}
      ${line(C.date, { x: AX + 44, y: 1052, w: 620, font: SANS, weight: 400, size: 17, fill: AT.CONCRETE, tracking: 1 })}
      ${line(TICK, { x: AX + 44, y: H - 120, w: 640, font: SANS, weight: 500, size: 15, fill: AT.CONCRETE, tracking: 2.4 })}`, AT.BONE);
  },
  keyResults: () => {
    const AX = 300;
    return svg(`
      <rect x="${AX}" y="0" width="1" height="${H}" fill="${AT.GRAPHITE}" opacity="0.28"/>
      <rect x="${AX}" y="150" width="1" height="90" fill="${AT.GRAPHITE}"/>
      ${line(C.company, { x: AX + 44, y: 198, w: 700, font: SANS, weight: 600, size: 29, fill: AT.INK, tracking: 5.5, upper: true })}
      ${line("Key Results", { x: AX + 44, y: 242, w: 700, font: SANS, weight: 500, size: 15, fill: AT.CONCRETE, tracking: 7, upper: true })}
      ${C.rows.map((r, i) => {
        const y = 400 + i * 190;
        return `<rect x="${AX}" y="${y - 24}" width="1" height="54" fill="${AT.GRAPHITE}" opacity="0.8"/>
          ${line(r.v, { x: AX + 44, y: y + 28, w: 340, font: SANS, weight: 300, size: 58, fill: AT.INK })}
          ${line(r.u, { x: AX + 44, y: y + 60, w: 340, font: SANS, weight: 500, size: 14, fill: AT.CONCRETE, tracking: 2.6, upper: true })}
          ${block(r.d, { x: AX + 420, y: y - 6, w: 250, h: 110, font: SANS, weight: 400, size: 17, lh: 1.42, fill: AT.CONCRETE })}`;
      }).join("")}
      ${line(TICK, { x: AX + 44, y: H - 120, w: 640, font: SANS, weight: 500, size: 15, fill: AT.CONCRETE, tracking: 2.4 })}`, AT.BONE);
  },
};

/* =====================================================================
   SIGNAL — bold contemporary editorial
   Scale contrast as the whole idea. A lime bar carries the company name
   at full width; the headline is enormous and breaks the right margin.
   ===================================================================== */
const SG = { CHALK: "#fbfbf9", INK: "#0a0a0a", LIME: "#c8f000" };
const signal = {
  label: "Signal", blurb: "Bold contemporary editorial",
  announcement: () => svg(`
    <rect x="0" y="0" width="${W}" height="128" fill="${SG.LIME}"/>
    ${line(C.company, { x: 64, y: 84, w: 700, font: SANS, weight: 800, size: 38, fill: SG.INK, tracking: -0.4 })}
    ${line(C.dateISO, { x: 760, y: 84, w: 256, font: SANS, weight: 700, size: 20, fill: SG.INK, anchor: "end", tracking: 1 })}
    ${line(C.eyebrow, { x: 64, y: 216, w: 600, font: SANS, weight: 800, size: 20, fill: SG.INK, tracking: 8, upper: true })}
    ${block(C.headline, { x: 64, y: 260, w: 988, h: 620, font: SANS, weight: 800, min: 54, max: 100, lh: 0.95, fill: SG.INK })}
    <rect x="64" y="950" width="${W - 128}" height="8" fill="${SG.INK}"/>
    ${line(C.project, { x: 64, y: 1020, w: 700, font: SANS, weight: 700, size: 26, fill: SG.INK })}
    <rect x="64" y="1120" width="${W - 128}" height="2" fill="${SG.INK}"/>
    ${line(TICK, { x: 64, y: 1180, w: 952, font: SANS, weight: 700, size: 20, fill: SG.INK, tracking: 1.2 })}`, SG.CHALK),
  keyResults: () => svg(`
    <rect x="0" y="0" width="${W}" height="128" fill="${SG.LIME}"/>
    ${line(C.company, { x: 64, y: 84, w: 700, font: SANS, weight: 800, size: 38, fill: SG.INK, tracking: -0.4 })}
    ${line("KEY RESULTS", { x: 760, y: 84, w: 256, font: SANS, weight: 800, size: 20, fill: SG.INK, anchor: "end", tracking: 2 })}
    ${C.rows.slice(0, 3).map((r, i) => {
      const y = 210 + i * 320;
      return `${i > 0 ? `<rect x="64" y="${y - 44}" width="${W - 128}" height="3" fill="${SG.INK}"/>` : ""}
        ${line(r.v, { x: 64, y: y + 150, w: 700, font: SANS, weight: 800, size: 176, fill: SG.INK })}
        <rect x="64" y="${y + 176}" width="300" height="34" fill="${SG.LIME}"/>
        ${line(r.u, { x: 76, y: y + 201, w: 276, font: SANS, weight: 800, size: 19, fill: SG.INK, tracking: 1 })}
        ${block(r.d, { x: 400, y: y + 172, w: 616, h: 90, font: SANS, weight: 500, size: 22, lh: 1.3, fill: "#444" })}`;
    }).join("")}
    ${line(TICK, { x: 64, y: 1290, w: 952, font: SANS, weight: 700, size: 19, fill: SG.INK, tracking: 1.2 })}`, SG.CHALK),
};

/* =====================================================================
   FIELDBOOK — scientific field documentation
   A ruled notebook page with a stamped identification block. The company
   name is the stamp: boxed, monospaced, top-left, the way a sample tag
   carries its origin. The only textured family.
   ===================================================================== */
const FB = { KRAFT: "#d9d2c2", RULE: "#b8ae99", GRAPHITE: "#33312c", OXIDE: "#8c3b2e", FADE: "#6f6757" };
const fbRules = (from, to) => Array.from({ length: Math.floor((to - from) / 44) }, (_, i) =>
  `<rect x="72" y="${from + i * 44}" width="${W - 144}" height="1" fill="${FB.RULE}" opacity="0.55"/>`).join("");
const fieldbook = {
  label: "Fieldbook", blurb: "Scientific field documentation",
  announcement: () => svg(`
    ${fbRules(300, 1180)}
    <rect x="72" y="0" width="2" height="${H}" fill="${FB.OXIDE}" opacity="0.4"/>
    <!-- identification stamp: the company name, boxed like a sample tag -->
    <rect x="72" y="96" width="640" height="118" fill="none" stroke="${FB.GRAPHITE}" stroke-width="2"/>
    <rect x="72" y="96" width="640" height="30" fill="${FB.GRAPHITE}"/>
    ${line("ISSUED BY", { x: 86, y: 118, w: 300, font: MONO, weight: 600, size: 14, fill: FB.KRAFT, tracking: 3.6 })}
    ${line(C.company, { x: 86, y: 182, w: 612, font: SANS, weight: 700, size: 34, fill: FB.GRAPHITE })}
    <rect x="740" y="96" width="268" height="118" fill="none" stroke="${FB.GRAPHITE}" stroke-width="2"/>
    ${line("DATE", { x: 754, y: 128, w: 240, font: MONO, weight: 600, size: 14, fill: FB.FADE, tracking: 3.6 })}
    ${line(C.dateISO, { x: 754, y: 180, w: 240, font: MONO, weight: 600, size: 28, fill: FB.GRAPHITE })}
    ${line(C.eyebrow, { x: 72, y: 272, w: 600, font: MONO, weight: 600, size: 16, fill: FB.OXIDE, tracking: 5, upper: true })}
    ${block(C.headline, { x: 88, y: 318, w: W - 176, h: 420, font: SERIF, weight: 400, min: 36, max: 54, lh: 1.63, fill: FB.GRAPHITE })}
    <rect x="72" y="1200" width="${W - 144}" height="2" fill="${FB.GRAPHITE}"/>
    ${line(C.project, { x: 72, y: 1250, w: 600, font: MONO, weight: 600, size: 18, fill: FB.GRAPHITE, tracking: 1 })}
    ${line(TICK, { x: 700, y: 1250, w: 308, font: MONO, weight: 500, size: 15, fill: FB.FADE, anchor: "end", tracking: 1 })}`, FB.KRAFT),
  keyResults: () => svg(`
    <rect x="72" y="0" width="2" height="${H}" fill="${FB.OXIDE}" opacity="0.4"/>
    <rect x="72" y="96" width="640" height="118" fill="none" stroke="${FB.GRAPHITE}" stroke-width="2"/>
    <rect x="72" y="96" width="640" height="30" fill="${FB.GRAPHITE}"/>
    ${line("ISSUED BY", { x: 86, y: 118, w: 300, font: MONO, weight: 600, size: 14, fill: FB.KRAFT, tracking: 3.6 })}
    ${line(C.company, { x: 86, y: 182, w: 612, font: SANS, weight: 700, size: 34, fill: FB.GRAPHITE })}
    <rect x="740" y="96" width="268" height="118" fill="none" stroke="${FB.GRAPHITE}" stroke-width="2"/>
    ${line("ASSAY", { x: 754, y: 128, w: 240, font: MONO, weight: 600, size: 14, fill: FB.FADE, tracking: 3.6 })}
    ${line(`n = ${C.rows.length}`, { x: 754, y: 180, w: 240, font: MONO, weight: 600, size: 28, fill: FB.OXIDE })}
    <!-- a logged table: ruled columns, monospaced values, oxide tick per row -->
    <rect x="72" y="282" width="${W - 144}" height="2" fill="${FB.GRAPHITE}"/>
    ${line("VALUE", { x: 92, y: 322, w: 300, font: MONO, weight: 600, size: 14, fill: FB.FADE, tracking: 3.4 })}
    ${line("UNIT", { x: 420, y: 322, w: 240, font: MONO, weight: 600, size: 14, fill: FB.FADE, tracking: 3.4 })}
    ${line("NOTE", { x: 680, y: 322, w: 328, font: MONO, weight: 600, size: 14, fill: FB.FADE, tracking: 3.4 })}
    <rect x="72" y="342" width="${W - 144}" height="1" fill="${FB.RULE}"/>
    ${C.rows.map((r, i) => {
      const y = 400 + i * 196;
      return `<rect x="72" y="${y + 120}" width="${W - 144}" height="1" fill="${FB.RULE}"/>
        <rect x="72" y="${y - 26}" width="14" height="14" fill="${FB.OXIDE}"/>
        ${line(r.v, { x: 92, y: y + 44, w: 310, font: MONO, weight: 600, size: 58, fill: FB.GRAPHITE })}
        ${line(r.u, { x: 420, y: y + 36, w: 240, font: MONO, weight: 500, size: 20, fill: FB.OXIDE })}
        ${block(r.d, { x: 680, y: y, w: 328, h: 100, font: SERIF, weight: 400, size: 20, lh: 1.42, fill: FB.FADE })}`;
    }).join("")}
    <rect x="72" y="1200" width="${W - 144}" height="2" fill="${FB.GRAPHITE}"/>
    ${line(C.project, { x: 72, y: 1250, w: 600, font: MONO, weight: 600, size: 18, fill: FB.GRAPHITE, tracking: 1 })}
    ${line(TICK, { x: 700, y: 1250, w: 308, font: MONO, weight: 500, size: 15, fill: FB.FADE, anchor: "end", tracking: 1 })}`, FB.KRAFT),
};

/* =====================================================================
   MERIDIAN — premium corporate presentation
   Horizontal bands and a generous lockup. The company name sits in sand
   on a deep teal band at the top -- the first thing read, boardroom calm.
   ===================================================================== */
const MR = { TEAL: "#0d3b3f", SAND: "#e4d9c8", BRASS: "#b89355", DEEP: "#07282b", MUTED: "#7d9497" };
const meridian = {
  label: "Meridian", blurb: "Premium corporate presentation",
  announcement: () => svg(`
    <rect x="0" y="0" width="${W}" height="258" fill="${MR.TEAL}"/>
    <rect x="0" y="258" width="${W}" height="4" fill="${MR.BRASS}"/>
    ${line(C.company, { x: 88, y: 150, w: 904, font: SERIF, weight: 600, size: 46, fill: MR.SAND })}
    ${line(C.location, { x: 88, y: 196, w: 904, font: SANS, weight: 500, size: 16, fill: MR.MUTED, tracking: 3, upper: true })}
    ${line(C.eyebrow, { x: 88, y: 348, w: 600, font: SANS, weight: 600, size: 16, fill: MR.BRASS, tracking: 7, upper: true })}
    ${block(C.headline, { x: 88, y: 392, w: 880, h: 420, font: SERIF, weight: 400, min: 40, max: 62, lh: 1.24, fill: MR.DEEP })}
    <rect x="88" y="900" width="120" height="3" fill="${MR.BRASS}"/>
    ${line(C.project, { x: 88, y: 964, w: 880, font: SANS, weight: 600, size: 24, fill: MR.DEEP, tracking: 0.6 })}
    ${line(C.date, { x: 88, y: 1000, w: 880, font: SANS, weight: 400, size: 19, fill: "#5d6f71" })}
    <rect x="0" y="${H - 128}" width="${W}" height="128" fill="${MR.TEAL}"/>
    ${line(TICK, { x: 88, y: H - 58, w: 904, font: SANS, weight: 600, size: 19, fill: MR.SAND, tracking: 1.6 })}`, MR.SAND),
  keyResults: () => svg(`
    <rect x="0" y="0" width="${W}" height="258" fill="${MR.TEAL}"/>
    <rect x="0" y="258" width="${W}" height="4" fill="${MR.BRASS}"/>
    ${line(C.company, { x: 88, y: 150, w: 904, font: SERIF, weight: 600, size: 46, fill: MR.SAND })}
    ${line("Key Results", { x: 88, y: 196, w: 904, font: SANS, weight: 500, size: 16, fill: MR.MUTED, tracking: 3, upper: true })}
    ${C.rows.map((r, i) => {
      const y = 330 + i * 218;
      return `${i > 0 ? `<rect x="88" y="${y - 44}" width="904" height="1" fill="#c9bda8"/>` : ""}
        ${line(r.v, { x: 88, y: y + 86, w: 440, font: SERIF, weight: 600, size: 88, fill: MR.TEAL })}
        ${line(r.u, { x: 88, y: y + 124, w: 440, font: SANS, weight: 600, size: 16, fill: MR.BRASS, tracking: 2.2, upper: true })}
        ${block(r.d, { x: 560, y: y + 34, w: 432, h: 120, font: SANS, weight: 400, size: 22, lh: 1.38, fill: "#5d6f71" })}`;
    }).join("")}
    <rect x="0" y="${H - 128}" width="${W}" height="128" fill="${MR.TEAL}"/>
    ${line(TICK, { x: 88, y: H - 58, w: 904, font: SANS, weight: 600, size: 19, fill: MR.SAND, tracking: 1.6 })}`, MR.SAND),
};

/* =====================================================================
   INTERCHANGEABLE LAYOUTS — three Key Results compositions for OBSIDIAN.
   Same palette, same type pairing, same copper furniture; three genuinely
   different arrangements. Content is byte-identical across all three.
   ===================================================================== */
const OB = { BLACK: "#06080b", GRAPHITE: "#1a1f26", COPPER: "#c98b45", BONE: "#f2ece3", DIM: "#79828d" };
const obChrome = (right) => `
  ${line(C.company, { x: 96, y: 118, w: 560, font: SANS, weight: 600, size: 30, fill: OB.BONE, tracking: 0.6 })}
  ${line(right, { x: 620, y: 118, w: 364, font: MONO, weight: 500, size: 17, fill: OB.DIM, anchor: "end", tracking: 1.5 })}
  <rect x="96" y="146" width="888" height="1" fill="${OB.COPPER}" opacity="0.5"/>
  <rect x="96" y="1168" width="46" height="2" fill="${OB.COPPER}"/>
  ${line(C.project, { x: 96, y: 1218, w: 520, font: SANS, weight: 500, size: 22, fill: OB.BONE })}
  ${line(TICK, { x: 600, y: 1218, w: 384, font: MONO, weight: 500, size: 16, fill: OB.DIM, anchor: "end", tracking: 1 })}`;

const obsidianVariants = {
  // A. LEDGER — the current one: numerals ranged left, units hung right.
  ledger: () => svg(`${obChrome("Assay highlights")}
    ${line("Key Results", { x: 96, y: 250, w: 888, font: SANS, weight: 200, size: 66, fill: OB.BONE })}
    ${C.rows.map((r, i) => {
      const y = 330 + i * 196;
      return `${i > 0 ? `<rect x="96" y="${y - 40}" width="888" height="1" fill="#242a33"/>` : ""}
        ${line(r.v, { x: 96, y: y + 86, w: 460, font: SANS, weight: 700, size: 92, fill: OB.BONE })}
        ${line(r.u, { x: 560, y: y + 58, w: 424, font: MONO, weight: 600, size: 22, fill: OB.COPPER, anchor: "end", tracking: 1.2 })}
        ${line(r.d, { x: 560, y: y + 92, w: 424, font: MONO, weight: 500, size: 17, fill: OB.DIM, anchor: "end" })}`;
    }).join("")}`, OB.BLACK),

  // B. DOMINANT — one figure at display scale on a graphite field; the rest
  //    reduced to a quiet index beneath it.
  dominant: () => {
    const hero = C.rows[0], rest = C.rows.slice(1);
    return svg(`
      <rect x="0" y="0" width="${W}" height="760" fill="${OB.GRAPHITE}"/>
      <rect x="0" y="760" width="${W}" height="1" fill="${OB.COPPER}" opacity="0.6"/>
      ${obChrome("Primary intercept")}
      ${line(hero.v, { x: 96, y: 520, w: 888, font: SANS, weight: 800, size: 260, fill: OB.BONE })}
      ${line(hero.u, { x: 96, y: 592, w: 560, font: MONO, weight: 600, size: 28, fill: OB.COPPER, tracking: 1.6 })}
      ${line(hero.d, { x: 96, y: 648, w: 888, font: MONO, weight: 500, size: 20, fill: OB.DIM })}
      ${rest.map((r, i) => {
        const y = 850 + i * 92;
        return `${line(`${r.v}  ${r.u}`, { x: 96, y, w: 520, font: SANS, weight: 500, size: 32, fill: OB.BONE })}
          ${line(r.d, { x: 600, y, w: 384, font: MONO, weight: 500, size: 17, fill: OB.DIM, anchor: "end" })}
          <rect x="96" y="${y + 26}" width="888" height="1" fill="#242a33"/>`;
      }).join("")}`, OB.BLACK);
  },

  // C. ASYMMETRIC — figures stepped across a diagonal, each on its own
  //    indent, with a copper rule tracking the step.
  asymmetric: () => svg(`${obChrome("Assay highlights")}
    ${line("Key Results", { x: 96, y: 250, w: 888, font: SANS, weight: 200, size: 66, fill: OB.BONE })}
    ${C.rows.map((r, i) => {
      const x = 96 + i * 108, y = 360 + i * 200;
      return `<rect x="${x}" y="${y - 38}" width="${888 - i * 108}" height="1" fill="${OB.COPPER}" opacity="${0.5 - i * 0.1}"/>
        ${line(r.v, { x, y: y + 72, w: 520, font: SANS, weight: 700, size: 104 - i * 12, fill: i === 0 ? OB.COPPER : OB.BONE })}
        ${line(r.u, { x, y: y + 106, w: 420, font: MONO, weight: 600, size: 19, fill: OB.DIM, tracking: 1.2 })}
        ${line(r.d, { x: x + 420, y: y + 48, w: 984 - x - 420 + 96, font: MONO, weight: 500, size: 17, fill: OB.DIM })}`;
    }).join("")}`, OB.BLACK),
};

/* ---------------- render ---------------- */
const run = async () => {
  const jobs = [
    ["ATRIUM-1-announcement", atrium.announcement()],
    ["ATRIUM-2-keyresults", atrium.keyResults()],
    ["SIGNAL-1-announcement", signal.announcement()],
    ["SIGNAL-2-keyresults", signal.keyResults()],
    ["FIELDBOOK-1-announcement", fieldbook.announcement()],
    ["FIELDBOOK-2-keyresults", fieldbook.keyResults()],
    ["MERIDIAN-1-announcement", meridian.announcement()],
    ["MERIDIAN-2-keyresults", meridian.keyResults()],
    ["VARIANT-obsidian-A-ledger", obsidianVariants.ledger()],
    ["VARIANT-obsidian-B-dominant", obsidianVariants.dominant()],
    ["VARIANT-obsidian-C-asymmetric", obsidianVariants.asymmetric()],
  ];
  const thumbs = [];
  for (const [name, markup] of jobs) {
    const f = path.join(OUT, `${name}.png`);
    await sharp(Buffer.from(markup)).resize(W, H).png().toFile(f);
    thumbs.push({ name, buf: await sharp(f).resize(300).png().toBuffer() });
  }
  const label = (t, w, h, s, c, wt = 700) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="0" y="${s}" font-family="Helvetica" font-size="${s}" font-weight="${wt}" fill="${c}">${t}</text></svg>`);
  const sheet = async (items, cols, title, out) => {
    const cw = 300, ch = Math.round(cw * H / W), gap = 16, pad = 86, lab = 28;
    const rows = Math.ceil(items.length / cols);
    const SW = cols * cw + (cols + 1) * gap, SH = pad + rows * (ch + lab + gap) + gap;
    const comps = [{ input: label(title, SW, 60, 30, "#0f172a"), top: 24, left: gap }];
    items.forEach((t, i) => {
      const r = Math.floor(i / cols), c = i % cols, top = pad + r * (ch + lab + gap);
      comps.push({ input: label(t.name, cw, lab, 15, "#475569", 600), top, left: gap + c * (cw + gap) });
      comps.push({ input: t.buf, top: top + lab, left: gap + c * (cw + gap) });
    });
    await sharp({ create: { width: SW, height: SH, channels: 3, background: "#ffffff" } }).composite(comps).png().toFile(out);
  };
  await sheet(thumbs.slice(0, 8), 4, "Four new premium families — Announcement and Key Results", path.join(OUT, "SHEET-four-new-families.png"));
  await sheet(thumbs.slice(8), 3, "Interchangeable layouts — three Obsidian Key Results compositions, identical content", path.join(OUT, "SHEET-layout-variations.png"));
  console.log(`  ${jobs.length} slides + 2 sheets -> ${OUT}`);
};
run().catch((e) => { console.error(e); process.exit(1); });
