// SIX COMPLETE FIVE-SLIDE CAROUSELS — design prototypes.
//   npx vite-node scripts/prototypes/proto-carousels.mjs
//
// Isolated. Nothing here touches the production generator, the press release
// pipeline or the portal. The only shared import is text MEASUREMENT, because
// measuring a glyph is not a design decision.
//
// Each family is a design system, not a template: five slides that share a
// palette, a type pairing and a graphic language while differing in hierarchy
// and composition. No slide reuses another slide's arrangement.

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { fitText, wrapText, measure } from "../../src/portal/publish/carousel/textEngine.js";

export const W = 1080, H = 1350;
const OUT = path.join(process.env.HOME, "Desktop", "MineEx-Carousel-Systems");
const DIR = { root: OUT, slides: path.join(OUT, "slides"), sheets: path.join(OUT, "contact-sheets") };
Object.values(DIR).forEach((d) => fs.mkdirSync(d, { recursive: true }));

/* ---------------- the release — every value source-grounded ---------------- */
export const R = {
  eyebrow: "Discovery",
  headline: "Kingsmen Resources Intersects 1,742 g/t Silver Equivalent over 0.7 Metres in Its First Drill Program at Las Coloradas",
  headlineShort: "Kingsmen Intersects 1,742 g/t AgEq at Las Coloradas",
  project: "Las Coloradas Silver-Gold Project",
  location: "Parral Mining District, Chihuahua, Mexico",
  date: "9 October 2026",
  dateISO: "2026-10-09",
  company: "Kingsmen Resources Ltd.",
  tickers: [["TSXV", "KNG"], ["OTCQB", "KNGRF"], ["FSE", "TUY"]],
  cta: "Follow Kingsmen Resources on MineEx",
  ctaSub: "Company updates, verified and in full.",
  whatHappened: "The first six holes of the autumn programme returned 31.4 metres at 4.8 g/t gold, including 2.1 metres at 46.2 g/t, and two further mineralised intercepts along strike and at depth.",
  takeaway: "A wider, higher-grade intercept that extends the zone at depth moves this from a single discovery hole toward something that can carry a resource estimate — with three holes still pending.",
  results: [
    { v: "1,742", u: "g/t AgEq", d: "over 0.70 m, hole LC-25-010" },
    { v: "31.4", u: "m @ 4.8 g/t Au", d: "RC-26-088 from 149.0 m" },
    { v: "2.1", u: "m @ 46.2 g/t Au", d: "included in the above" },
    { v: "18.7", u: "m @ 2.9 g/t Au", d: "RC-26-089, 60 m along strike" },
  ],
};
export const TICKERS = R.tickers.map(([e, s]) => `${e} ${s}`).join("  ·  ");

/* ---------------- type + primitives ---------------- */
export const SERIF = "'Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif";
export const SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif";
export const MONO = "'SF Mono','Roboto Mono',Menlo,Consolas,monospace";
const stackKey = (f) => (/Palatino|Georgia|Iowan/.test(f) ? "serif" : /Mono|Menlo|Consolas/.test(f) ? "mono" : "sans");
export const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

export function block(text, { x, y, w, h, font, weight = 400, size, min = 18, max, lh = 1.1, fill, anchor = "start", tracking = 0, upper = false, opacity }) {
  const stack = stackKey(font);
  const body = upper ? String(text).toUpperCase() : String(text);
  const fit = size
    ? { size, lines: wrapText(body, { size, width: w, stack, weight }).lines }
    : fitText(body, { width: w, height: h, min, max: max || 120, stack, weight, lh });
  const fs2 = fit.size;
  const ax = anchor === "middle" ? x + w / 2 : anchor === "end" ? x + w : x;
  return fit.lines.map((ln, i) =>
    `<text x="${ax}" y="${y + fs2 * 0.74 + i * fs2 * lh}" fill="${fill}" text-anchor="${anchor}" font-family="${font}" font-size="${fs2}" font-weight="${weight}"${tracking ? ` letter-spacing="${tracking}"` : ""}${opacity != null ? ` opacity="${opacity}"` : ""}>${esc(ln)}</text>`
  ).join("");
}

export function line(text, { x, y, w, font, weight = 400, size, fill, anchor = "start", tracking = 0, upper = false, opacity }) {
  const s = String(text == null ? "" : text).trim();
  if (!s) return "";
  const body = upper ? s.toUpperCase() : s;
  const nat = measure(body, size, { stack: stackKey(font), weight }) + tracking * body.length;
  const fs2 = nat > w ? Math.max(9, Math.floor(size * (w / nat))) : size;
  const ax = anchor === "middle" ? x + w / 2 : anchor === "end" ? x + w : x;
  return `<text x="${ax}" y="${y}" fill="${fill}" text-anchor="${anchor}" font-family="${font}" font-size="${fs2}" font-weight="${weight}"${tracking ? ` letter-spacing="${tracking}"` : ""}${opacity != null ? ` opacity="${opacity}"` : ""}>${esc(body)}</text>`;
}

export const svg = (inner, bg) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${bg}"/>${inner}</svg>`;
export const img = (href, x, y, w, h, id) => href
  ? `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath><image href="${href}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`
  : "";
export const logoMark = (href, x, y, h, aspect = 1, anchor = "start") => {
  if (!href) return "";
  const w = Math.round(h * (aspect > 0 ? aspect : 1));
  return `<image href="${href}" x="${anchor === "middle" ? x - w / 2 : x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>`;
};

/* =======================================================================
   BROADSHEET — institutional financial publishing
   A ruled three-column field, a data strip, section numerals and folios.
   Dense, analytical, structural. The serif is for authority, not warmth;
   everything else is rules, columns and figures.
   ======================================================================= */
const BS = { INK: "#0e1114", NAVY: "#13233f", RULE: "#b9bdc6", HAIR: "#d8dbe0", GREY: "#59606c", PAPER: "#ffffff" };
const BM = 84, BW = W - BM * 2;
const bcol = (n) => BM + n * (BW / 3);                 // three structural columns
const bsCols = () => [1, 2].map((i) => `<rect x="${bcol(i) - 14}" y="196" width="1" height="${H - 196 - 170}" fill="${BS.HAIR}"/>`).join("");
const bsMast = (right, folio) => `
  ${line(R.company, { x: BM, y: 86, w: 520, font: SERIF, weight: 700, size: 25, fill: BS.INK, tracking: 0.4 })}
  ${line(right, { x: 520, y: 86, w: BW - 436, font: SANS, weight: 600, size: 15, fill: BS.GREY, anchor: "end", tracking: 2.4, upper: true })}
  <rect x="${BM}" y="104" width="${BW}" height="4" fill="${BS.INK}"/>
  <rect x="${BM}" y="113" width="${BW}" height="1" fill="${BS.INK}"/>
  ${folio ? line(folio, { x: BM, y: 156, w: BW, font: SANS, weight: 700, size: 14, fill: BS.NAVY, tracking: 4, upper: true }) : ""}`;
// A strip of disclosed figures, set like a market table under the masthead.
const bsStrip = (rows) => {
  const n = Math.min(rows.length, 4), cw = BW / n;
  return `<rect x="${BM}" y="178" width="${BW}" height="1" fill="${BS.RULE}"/>
    ${rows.slice(0, n).map((r, i) => `
      ${i > 0 ? `<rect x="${BM + i * cw - 14}" y="186" width="1" height="86" fill="${BS.HAIR}"/>` : ""}
      ${line(r.v, { x: BM + i * cw, y: 232, w: cw - 28, font: SERIF, weight: 700, size: 34, fill: BS.NAVY })}
      ${line(r.u, { x: BM + i * cw, y: 262, w: cw - 28, font: SANS, weight: 600, size: 13, fill: BS.GREY, tracking: 1, upper: true })}`).join("")}
    <rect x="${BM}" y="286" width="${BW}" height="1" fill="${BS.RULE}"/>`;
};
const bsFoot = () => `
  <rect x="${BM}" y="${H - 150}" width="${BW}" height="1" fill="${BS.INK}"/>
  ${line(R.project, { x: BM, y: H - 104, w: 520, font: SANS, weight: 600, size: 16, fill: BS.INK, tracking: 1.4, upper: true })}
  ${line(TICKERS, { x: 600, y: H - 104, w: 396, font: SANS, weight: 600, size: 15, fill: BS.NAVY, anchor: "end", tracking: 1.2 })}`;

export const broadsheet = {
  id: "BROADSHEET", label: "Broadsheet", blurb: "Institutional financial publishing",
  announce: () => svg(`${bsMast(R.date, "§ 01 · Announcement")}${bsStrip(R.results)}
    ${block(R.headline, { x: BM, y: 332, w: BW, h: 420, font: SERIF, weight: 700, min: 44, max: 76, lh: 1.04, fill: BS.INK })}
    <rect x="${BM}" y="810" width="${BW}" height="2" fill="${BS.INK}"/>
    ${[0, 1, 2].map((i) => {
      const txt = [R.whatHappened,
        "Three holes remain in progress with assays pending on approximately 1,400 metres of core.",
        `${R.results[0].v} ${R.results[0].u} was returned ${R.results[0].d}.`][i];
      return block(txt, { x: bcol(i), y: 844, w: BW / 3 - 30, h: 280, font: SERIF, weight: 400, size: 21, lh: 1.46, fill: "#333a44" });
    }).join("")}
    ${bsFoot()}`, BS.PAPER),

  // ADAPTIVE: the row pitch is computed from how many figures exist, so one
  // result fills the page as a lead and four set as a dense table. Nothing is
  // stretched and no figure is inflated to fill space.
  results: (rows = R.results) => {
    const n = Math.max(1, Math.min(rows.length, 4));
    const top = 332, bottom = H - 190, field = bottom - top;
    const pitch = field / n;
    const fig = n === 1 ? 150 : n === 2 ? 110 : n === 3 ? 86 : 68;
    const desc = n <= 2 ? 28 : n === 3 ? 24 : 21;
    return svg(`${bsMast("Drill results", "§ 02 · Key Results")}
      ${line("Key Results", { x: BM, y: 258, w: BW, font: SERIF, weight: 700, size: 50, fill: BS.INK })}
      ${line(`${n} disclosed ${n === 1 ? "figure" : "figures"}`, { x: 520, y: 258, w: BW - 436, font: SANS, weight: 600, size: 15, fill: BS.GREY, anchor: "end", tracking: 2, upper: true })}
      <rect x="${BM}" y="294" width="${BW}" height="3" fill="${BS.INK}"/>
      ${rows.slice(0, n).map((r, i) => {
        // Content is CENTRED in its band. Hung from the top, a single figure
        // left two thirds of the page empty beneath it.
        const blockH = fig * 0.76 + 54;
        const y = top + i * pitch + Math.max(0, (pitch - blockH) / 2);
        const ruleY = top + i * pitch - 2;
        return `${i > 0 ? `<rect x="${BM}" y="${ruleY}" width="${BW}" height="1" fill="${BS.RULE}"/>` : ""}
          ${line(String(i + 1).padStart(2, "0"), { x: BM, y: y + 44, w: 60, font: SANS, weight: 700, size: 14, fill: BS.NAVY, tracking: 2 })}
          ${line(r.v, { x: BM + 74, y: y + fig * 0.76, w: 440, font: SERIF, weight: 700, size: fig, fill: BS.NAVY })}
          ${line(r.u, { x: BM + 74, y: y + fig * 0.76 + 34, w: 440, font: SANS, weight: 600, size: 16, fill: BS.GREY, tracking: 1.2, upper: true })}
          ${block(r.d, { x: bcol(2) - 14, y: y + 30, w: BW / 3, h: pitch - 70, font: SERIF, weight: 400, size: desc, lh: 1.36, fill: BS.INK })}`;
      }).join("")}
      ${bsFoot()}`, BS.PAPER);
  },

  context: (photo) => svg(`${bsMast(R.location, "§ 03 · Project")}
    ${photo ? img(photo, BM, 196, BW, 392, "bsctx") : `<rect x="${BM}" y="196" width="${BW}" height="392" fill="${BS.INK}"/>${line(R.project, { x: BM + 40, y: 420, w: BW - 80, font: SERIF, weight: 700, size: 56, fill: BS.PAPER })}`}
    <rect x="${BM}" y="604" width="${BW}" height="1" fill="${BS.RULE}"/>
    ${line(R.project, { x: BM, y: 662, w: BW, font: SERIF, weight: 700, size: 42, fill: BS.INK })}
    ${line(R.location, { x: BM, y: 694, w: BW, font: SANS, weight: 600, size: 15, fill: BS.GREY, tracking: 2, upper: true })}
    <rect x="${BM}" y="724" width="${BW}" height="2" fill="${BS.INK}"/>
    ${[0, 1, 2].map((i) => {
      const txt = [R.whatHappened,
        "Three holes remain in progress with assays pending on approximately 1,400 metres of core.",
        `${R.results[1].v} ${R.results[1].u}, ${R.results[1].d}.`][i];
      return block(txt, { x: bcol(i), y: 760, w: BW / 3 - 30, h: 340, font: SERIF, weight: 400, size: 21, lh: 1.46, fill: "#333a44" });
    }).join("")}
    ${bsFoot()}`, BS.PAPER),

  why: () => svg(`${bsMast("Analysis", "§ 04 · Why It Matters")}
    <rect x="${BM}" y="196" width="${BW}" height="1" fill="${BS.RULE}"/>
    ${line("Why It Matters", { x: BM, y: 268, w: BW, font: SERIF, weight: 700, size: 50, fill: BS.INK })}
    <rect x="${BM}" y="300" width="220" height="4" fill="${BS.NAVY}"/>
    ${block(R.takeaway, { x: BM, y: 372, w: bcol(2) - 14 - BM, h: 520, font: SERIF, weight: 400, min: 30, max: 42, lh: 1.48, fill: BS.INK })}
    ${bsStrip(R.results.slice(0, 2)).replace('y="178"', 'y="940"').replace('y="186"', 'y="948"').replace('y="286"', 'y="1048"').replace(/y="232"/g, 'y="994"').replace(/y="262"/g, 'y="1024"')}
    ${line("MineEx provides factual summaries, not investment advice.", { x: BM, y: 1104, w: BW, font: SANS, weight: 500, size: 15, fill: BS.GREY })}
    ${bsFoot()}`, BS.PAPER),

  closing: (logo, aspect) => svg(`${bsMast(R.dateISO, "§ 05 · Contact")}
    <rect x="${BM}" y="196" width="${BW}" height="1" fill="${BS.RULE}"/>
    ${logoMark(logo, BM, 248, 110, aspect)}
    ${line(R.company, { x: BM, y: 462, w: BW, font: SERIF, weight: 700, size: 54, fill: BS.INK })}
    ${line(R.location, { x: BM, y: 496, w: BW, font: SANS, weight: 600, size: 15, fill: BS.GREY, tracking: 2, upper: true })}
    <rect x="${BM}" y="540" width="${BW}" height="2" fill="${BS.INK}"/>
    ${R.tickers.map(([ex, sym], i) => `
      ${i > 0 ? `<rect x="${bcol(i) - 14}" y="556" width="1" height="130" fill="${BS.HAIR}"/>` : ""}
      ${line(ex, { x: bcol(i), y: 596, w: BW / 3 - 30, font: SANS, weight: 700, size: 14, fill: BS.GREY, tracking: 2.4, upper: true })}
      ${line(sym, { x: bcol(i), y: 656, w: BW / 3 - 30, font: SERIF, weight: 700, size: 44, fill: BS.NAVY })}`).join("")}
    <rect x="${BM}" y="700" width="${BW}" height="1" fill="${BS.RULE}"/>
    ${line(R.cta, { x: BM, y: 790, w: BW, font: SERIF, weight: 700, size: 38, fill: BS.INK })}
    ${line(R.ctaSub, { x: BM, y: 828, w: BW, font: SANS, weight: 400, size: 19, fill: BS.GREY })}
    ${bsFoot()}`, BS.PAPER),
};

/* =======================================================================
   OBSIDIAN — cinematic luxury
   Near-black, copper hairlines, monumental numerals, light headline weights.
   Photography is darkened to a ground that type sits on.
   ======================================================================= */
const OB = { BLACK: "#06080b", GRAPHITE: "#1a1f26", COPPER: "#c98b45", BONE: "#f2ece3", DIM: "#79828d" };
const obHead = (right) => `
  ${line(R.eyebrow, { x: 96, y: 120, w: 500, font: SANS, weight: 700, size: 19, fill: OB.COPPER, tracking: 9, upper: true })}
  ${line(right, { x: 500, y: 120, w: 484, font: MONO, weight: 500, size: 18, fill: OB.DIM, anchor: "end", tracking: 1.5 })}`;
const obFoot = () => `
  <rect x="96" y="1168" width="46" height="2" fill="${OB.COPPER}"/>
  ${line(R.company, { x: 96, y: 1218, w: 560, font: SANS, weight: 500, size: 24, fill: OB.BONE, tracking: 1.4 })}
  ${line(TICKERS, { x: 600, y: 1218, w: 384, font: MONO, weight: 500, size: 16, fill: OB.DIM, anchor: "end", tracking: 1 })}`;

export const obsidian = {
  id: "OBSIDIAN", label: "Obsidian", blurb: "Cinematic luxury typography",
  announce: () => svg(`
    <rect x="0" y="0" width="${W}" height="420" fill="${OB.GRAPHITE}"/>
    <rect x="0" y="420" width="${W}" height="1" fill="${OB.COPPER}" opacity="0.55"/>
    ${obHead(R.date)}
    ${line(R.results[0].v, { x: 96, y: 330, w: 888, font: SANS, weight: 800, size: 186, fill: OB.BONE })}
    <rect x="96" y="356" width="888" height="1" fill="${OB.COPPER}" opacity="0.4"/>
    ${line(`${R.results[0].u}   ·   ${R.results[0].d}`, { x: 96, y: 392, w: 888, font: MONO, weight: 500, size: 20, fill: OB.COPPER, tracking: 1.6 })}
    ${block(R.headline, { x: 96, y: 500, w: 834, h: 520, font: SANS, weight: 300, min: 44, max: 70, lh: 1.16, fill: OB.BONE })}
    ${obFoot()}`, OB.BLACK),

  // A ledger of light. Copper rules, numerals ranged left, units hung right.
  results: () => svg(`${obHead("Assay highlights")}
    ${line("Key Results", { x: 96, y: 226, w: 888, font: SANS, weight: 200, size: 72, fill: OB.BONE })}
    <rect x="96" y="268" width="888" height="1" fill="${OB.COPPER}" opacity="0.45"/>
    ${R.results.map((r, i) => {
      const y = 330 + i * 196;
      return `${i > 0 ? `<rect x="96" y="${y - 48}" width="888" height="1" fill="#242a33"/>` : ""}
        ${line(r.v, { x: 96, y: y + 70, w: 470, font: SANS, weight: 700, size: 92, fill: OB.BONE })}
        ${line(r.u, { x: 560, y: y + 44, w: 424, font: MONO, weight: 600, size: 22, fill: OB.COPPER, anchor: "end", tracking: 1.2 })}
        ${line(r.d, { x: 560, y: y + 80, w: 424, font: MONO, weight: 500, size: 17, fill: OB.DIM, anchor: "end" })}`;
    }).join("")}
    ${obFoot()}`, OB.BLACK),

  // Photography as a darkened ground; the title sits in the lower third.
  context: (photo) => svg(`
    ${photo ? `${img(photo, 0, 0, W, 820, "obctx")}<rect x="0" y="0" width="${W}" height="820" fill="${OB.BLACK}" opacity="0.46"/>` : `<rect x="0" y="0" width="${W}" height="820" fill="${OB.GRAPHITE}"/>`}
    <rect x="0" y="820" width="${W}" height="1" fill="${OB.COPPER}" opacity="0.5"/>
    ${obHead(R.location)}
    ${line(R.project, { x: 96, y: 700, w: 888, font: SANS, weight: 300, size: 54, fill: OB.BONE })}
    ${line(R.location, { x: 96, y: 752, w: 888, font: MONO, weight: 500, size: 19, fill: OB.COPPER, tracking: 2, upper: true })}
    ${block(R.whatHappened, { x: 96, y: 890, w: 820, h: 220, font: SANS, weight: 300, size: 30, lh: 1.48, fill: "#c9cdd3" })}
    ${obFoot()}`, OB.BLACK),

  why: () => svg(`${obHead("Significance")}
    <rect x="96" y="300" width="2" height="640" fill="${OB.COPPER}" opacity="0.7"/>
    ${line("Why It Matters", { x: 140, y: 268, w: 844, font: SANS, weight: 200, size: 60, fill: OB.BONE })}
    ${block(R.takeaway, { x: 140, y: 360, w: 790, h: 560, font: SANS, weight: 300, min: 34, max: 52, lh: 1.44, fill: OB.BONE })}
    ${line("MineEx provides factual summaries, not investment advice.", { x: 140, y: 1030, w: 844, font: MONO, weight: 500, size: 16, fill: OB.DIM })}
    ${obFoot()}`, OB.BLACK),

  closing: (logo, aspect) => svg(`
    <rect x="0" y="0" width="${W}" height="${H}" fill="${OB.BLACK}"/>
    <rect x="0" y="980" width="${W}" height="370" fill="${OB.GRAPHITE}"/>
    <rect x="0" y="980" width="${W}" height="1" fill="${OB.COPPER}" opacity="0.5"/>
    ${obHead(R.dateISO)}
    ${logoMark(logo, W / 2, 330, 140, aspect, "middle")}
    ${line(R.company, { x: 96, y: 600, w: 888, font: SANS, weight: 200, size: 62, fill: OB.BONE, anchor: "middle" })}
    ${line(R.location, { x: 96, y: 648, w: 888, font: MONO, weight: 500, size: 18, fill: OB.DIM, anchor: "middle", tracking: 2.4, upper: true })}
    <rect x="${W / 2 - 24}" y="712" width="48" height="1" fill="${OB.COPPER}"/>
    ${R.tickers.map(([ex, sym], i) => `
      ${line(ex, { x: 96 + i * 296, y: 812, w: 296, font: MONO, weight: 500, size: 15, fill: OB.DIM, anchor: "middle", tracking: 2.6, upper: true })}
      ${line(sym, { x: 96 + i * 296, y: 862, w: 296, font: SANS, weight: 600, size: 38, fill: OB.COPPER, anchor: "middle" })}`).join("")}
    ${line(R.cta, { x: 96, y: 1104, w: 888, font: SANS, weight: 300, size: 38, fill: OB.BONE, anchor: "middle" })}
    ${line(R.ctaSub, { x: 96, y: 1150, w: 888, font: MONO, weight: 500, size: 18, fill: OB.DIM, anchor: "middle", tracking: 1 })}
    ${line(TICKERS, { x: 96, y: 1268, w: 888, font: MONO, weight: 500, size: 16, fill: OB.DIM, anchor: "middle", tracking: 1.2 })}`, OB.BLACK),
};

/* =======================================================================
   GRID — Swiss modernist
   A visible 12-column field, black bands, one disruptive red-orange. Flush
   left throughout; nothing centred, nothing rounded.
   ======================================================================= */
const GR = { PAPER: "#efeee9", BLACK: "#101010", RED: "#e8431f", GREY: "#555550" };
const col = (n) => 60 + n * ((W - 120) / 12);
const grRules = () => [1,2,3,4,5,6,7,8,9,10,11].map((i) => `<rect x="${col(i)}" y="0" width="1" height="${H}" fill="${GR.BLACK}" opacity="0.08"/>`).join("");
const grHead = (right) => `
  <rect x="0" y="0" width="${W}" height="196" fill="${GR.BLACK}"/>
  ${line(R.eyebrow, { x: col(0), y: 118, w: 560, font: SANS, weight: 800, size: 22, fill: GR.PAPER, tracking: 10, upper: true })}
  ${line(right, { x: col(7), y: 118, w: col(12) - col(7), font: SANS, weight: 500, size: 21, fill: "#9a9a9a", anchor: "end", tracking: 1 })}`;
const grFoot = () => `
  <rect x="0" y="${H - 148}" width="${W}" height="148" fill="${GR.BLACK}"/>
  ${line(R.company, { x: col(0), y: H - 86, w: 560, font: SANS, weight: 700, size: 25, fill: GR.PAPER })}
  ${line(TICKERS, { x: col(6), y: H - 86, w: col(12) - col(6), font: SANS, weight: 500, size: 18, fill: GR.RED, anchor: "end", tracking: 1.2 })}`;

export const grid = {
  id: "GRID", label: "Grid", blurb: "Swiss modernist graphic design",
  announce: () => svg(`${grRules()}${grHead(R.dateISO)}
    <rect x="${col(0)}" y="258" width="${col(4) - col(0) - 28}" height="${col(4) - col(0) - 28}" fill="${GR.RED}"/>
    ${line(R.results[0].v, { x: col(0) + 22, y: 420, w: col(4) - col(0) - 70, font: SANS, weight: 800, size: 86, fill: GR.PAPER })}
    ${line(R.results[0].u, { x: col(0) + 22, y: 462, w: col(4) - col(0) - 70, font: SANS, weight: 700, size: 20, fill: GR.PAPER, tracking: 1.2 })}
    ${block(R.headline, { x: col(4), y: 258, w: col(12) - col(4), h: 420, font: SANS, weight: 700, min: 36, max: 58, lh: 1.08, fill: GR.BLACK })}
    <rect x="${col(0)}" y="760" width="${W - 120}" height="4" fill="${GR.BLACK}"/>
    ${block(R.whatHappened, { x: col(0), y: 800, w: col(7) - col(0) - 24, h: 260, font: SANS, weight: 400, size: 26, lh: 1.46, fill: "#2b2b2b" })}
    ${line(R.results[0].d, { x: col(7), y: 826, w: col(12) - col(7), font: SANS, weight: 700, size: 19, fill: GR.RED, tracking: 0.8, upper: true })}
    ${grFoot()}`, GR.PAPER),

  // Figures stepped across the grid at descending scale — a modernist poster
  // of numbers, not a table.
  results: () => svg(`${grRules()}${grHead("Assays")}
    ${line("KEY RESULTS", { x: col(0), y: 290, w: 700, font: SANS, weight: 800, size: 46, fill: GR.BLACK, tracking: 2 })}
    <rect x="${col(0)}" y="318" width="${col(5) - col(0)}" height="6" fill="${GR.RED}"/>
    ${R.results.map((r, i) => {
      const spans = [[0, 8], [0, 6], [3, 9], [0, 7]];
      const [a, b] = spans[i];
      const y = 400 + i * 196;
      const big = i === 0;
      return `${line(r.v, { x: col(a), y: y + (big ? 96 : 76), w: col(b) - col(a), font: SANS, weight: 800, size: big ? 112 : 84, fill: big ? GR.RED : GR.BLACK })}
        ${line(r.u, { x: col(a), y: y + (big ? 132 : 110), w: col(b) - col(a), font: SANS, weight: 700, size: 19, fill: GR.BLACK, tracking: 1 })}
        ${line(r.d, { x: col(b) + 16, y: y + (big ? 96 : 76), w: col(12) - col(b) - 16, font: SANS, weight: 400, size: 19, fill: "#4a4a4a" })}`;
    }).join("")}
    ${grFoot()}`, GR.PAPER),

  // Image occupies an off-centre block; text is set against the grid beside it.
  context: (photo) => svg(`${grRules()}${grHead(R.location)}
    ${photo
      ? img(photo, col(0), 258, col(7) - col(0), 560, "grctx")
      : `<rect x="${col(0)}" y="258" width="${col(7) - col(0)}" height="560" fill="${GR.BLACK}"/>
         ${block(R.project, { x: col(0) + 28, y: 320, w: col(7) - col(0) - 56, h: 300, font: SANS, weight: 800, size: 56, lh: 1.04, fill: GR.PAPER })}
         <rect x="${col(0) + 28}" y="668" width="120" height="6" fill="${GR.RED}"/>
         ${line(R.location, { x: col(0) + 28, y: 736, w: col(7) - col(0) - 56, font: SANS, weight: 600, size: 18, fill: "#b9b9b9", tracking: 1.6, upper: true })}`}
    <rect x="${col(7)}" y="258" width="${col(12) - col(7)}" height="90" fill="${GR.RED}"/>
    ${line("THE PROJECT", { x: col(7) + 20, y: 312, w: col(12) - col(7) - 36, font: SANS, weight: 800, size: 20, fill: GR.PAPER, tracking: 3 })}
    ${block(R.project, { x: col(7), y: 380, w: col(12) - col(7), h: 180, font: SANS, weight: 700, size: 34, lh: 1.12, fill: GR.BLACK })}
    ${block(R.location, { x: col(7), y: 580, w: col(12) - col(7), h: 150, font: SANS, weight: 500, size: 21, lh: 1.35, fill: "#4a4a4a" })}
    <rect x="${col(0)}" y="868" width="${W - 120}" height="4" fill="${GR.BLACK}"/>
    ${block(R.whatHappened, { x: col(0), y: 908, w: col(8) - col(0), h: 240, font: SANS, weight: 400, size: 26, lh: 1.46, fill: "#2b2b2b" })}
    ${grFoot()}`, GR.PAPER),

  why: () => svg(`${grRules()}${grHead("Significance")}
    <rect x="0" y="258" width="${col(3)}" height="700" fill="${GR.RED}"/>
    ${line("WHY", { x: 60, y: 420, w: col(3) - 80, font: SANS, weight: 800, size: 76, fill: GR.PAPER })}
    ${line("IT", { x: 60, y: 496, w: col(3) - 80, font: SANS, weight: 800, size: 76, fill: GR.PAPER })}
    ${line("MATTERS", { x: 60, y: 572, w: col(3) - 80, font: SANS, weight: 800, size: 54, fill: GR.PAPER })}
    ${block(R.takeaway, { x: col(3) + 40, y: 290, w: col(12) - col(3) - 40, h: 620, font: SANS, weight: 500, min: 32, max: 46, lh: 1.38, fill: GR.BLACK })}
    ${line("MineEx provides factual summaries, not investment advice.", { x: col(3) + 40, y: 1010, w: col(12) - col(3) - 40, font: SANS, weight: 500, size: 17, fill: "#6a6a6a" })}
    ${grFoot()}`, GR.PAPER),

  closing: (logo, aspect) => svg(`${grRules()}${grHead(R.dateISO)}
    ${logoMark(logo, col(0), 280, 130, aspect)}
    ${block(R.company, { x: col(0), y: 470, w: col(8) - col(0), h: 180, font: SANS, weight: 800, size: 64, lh: 1.04, fill: GR.BLACK })}
    ${line(R.location, { x: col(0), y: 690, w: col(9) - col(0), font: SANS, weight: 500, size: 20, fill: "#4a4a4a", tracking: 1.2, upper: true })}
    <rect x="${col(0)}" y="740" width="${W - 120}" height="4" fill="${GR.BLACK}"/>
    ${R.tickers.map(([ex, sym], i) => `
      <rect x="${col(i * 4)}" y="790" width="${col(i * 4 + 4) - col(i * 4) - 24}" height="132" fill="${i === 0 ? GR.RED : GR.BLACK}"/>
      ${line(ex, { x: col(i * 4) + 18, y: 836, w: 180, font: SANS, weight: 700, size: 16, fill: GR.PAPER, tracking: 2.4, upper: true })}
      ${line(sym, { x: col(i * 4) + 18, y: 896, w: 200, font: SANS, weight: 800, size: 44, fill: GR.PAPER })}`).join("")}
    ${block(R.cta, { x: col(0), y: 980, w: col(9) - col(0), h: 120, font: SANS, weight: 700, size: 38, lh: 1.12, fill: GR.BLACK })}
    ${line(R.ctaSub, { x: col(0), y: 1104, w: col(10) - col(0), font: SANS, weight: 400, size: 21, fill: "#4a4a4a" })}
    ${grFoot()}`, GR.PAPER),
};

/* =======================================================================
   CORE — technical intelligence
   A readout: registration marks, a measured scale, monospaced annotation,
   cyan as signal. Structure only — no invented depths or coordinates.
   ======================================================================= */
const CO = { MID: "#0a1724", PANEL: "#0f2234", STEEL: "#8fa6b8", CYAN: "#2fd3e3", WHITE: "#eef5f9" };
const coReg = (x, y) => `<g opacity="0.55"><rect x="${x - 11}" y="${y}" width="22" height="1" fill="${CO.CYAN}"/><rect x="${x}" y="${y - 11}" width="1" height="22" fill="${CO.CYAN}"/></g>`;
const coFrame = (right) => `
  ${coReg(84, 72)} ${coReg(W - 84, 72)} ${coReg(84, H - 72)} ${coReg(W - 84, H - 72)}
  ${line("GEOLOGICAL INTELLIGENCE", { x: 114, y: 78, w: 480, font: MONO, weight: 500, size: 16, fill: CO.CYAN, tracking: 4 })}
  ${line(right, { x: 500, y: 78, w: 470, font: MONO, weight: 500, size: 16, fill: CO.STEEL, anchor: "end", tracking: 2 })}
  <rect x="84" y="104" width="912" height="1" fill="${CO.STEEL}" opacity="0.3"/>`;
const coFoot = () => `
  <rect x="84" y="${H - 190}" width="912" height="1" fill="${CO.STEEL}" opacity="0.3"/>
  ${line(R.company, { x: 84, y: H - 132, w: 600, font: SANS, weight: 600, size: 24, fill: CO.WHITE, tracking: 0.6 })}
  ${line(R.project, { x: 84, y: H - 98, w: 600, font: MONO, weight: 500, size: 16, fill: CO.STEEL, tracking: 1 })}
  ${line(TICKERS, { x: 520, y: H - 132, w: 476, font: MONO, weight: 500, size: 17, fill: CO.CYAN, anchor: "end", tracking: 1.4 })}`;

export const core = {
  id: "CORE", label: "Core", blurb: "Technical intelligence and precision",
  announce: () => svg(`${coFrame(R.dateISO)}
    ${line(R.eyebrow, { x: 84, y: 182, w: 912, font: MONO, weight: 600, size: 18, fill: CO.CYAN, tracking: 5, upper: true })}
    ${block(R.headline, { x: 84, y: 206, w: 894, h: 230, font: SANS, weight: 600, min: 34, max: 52, lh: 1.14, fill: CO.WHITE })}
    ${Array.from({ length: 19 }, (_, i) => `<rect x="84" y="${470 + i * 26}" width="${i % 4 === 0 ? 34 : 18}" height="1.5" fill="${CO.STEEL}" opacity="${i % 4 === 0 ? 0.9 : 0.45}"/>`).join("")}
    <rect x="84" y="470" width="1" height="468" fill="${CO.STEEL}" opacity="0.5"/>
    <rect x="170" y="470" width="826" height="468" fill="${CO.PANEL}" stroke="${CO.STEEL}" stroke-opacity="0.25"/>
    ${line("PRIMARY INTERCEPT", { x: 206, y: 526, w: 520, font: MONO, weight: 600, size: 16, fill: CO.STEEL, tracking: 3.4 })}
    ${line(R.results[0].v, { x: 206, y: 638, w: 740, font: SANS, weight: 700, size: 112, fill: CO.CYAN })}
    ${line(R.results[0].u, { x: 206, y: 686, w: 420, font: MONO, weight: 600, size: 22, fill: CO.WHITE, tracking: 1.6 })}
    <rect x="206" y="716" width="700" height="1" fill="${CO.STEEL}" opacity="0.3"/>
    ${line(R.results[0].d, { x: 206, y: 756, w: 700, font: MONO, weight: 500, size: 19, fill: CO.STEEL, tracking: 1 })}
    ${line(`${R.results[1].v} ${R.results[1].u}  ·  ${R.results[1].d}`, { x: 206, y: 812, w: 700, font: MONO, weight: 500, size: 18, fill: CO.STEEL })}
    ${line(`${R.results[3].v} ${R.results[3].u}  ·  ${R.results[3].d}`, { x: 206, y: 852, w: 700, font: MONO, weight: 500, size: 18, fill: CO.STEEL })}
    ${coFoot()}`, CO.MID),

  // A data table with a leading bar chart scaled to the largest value.
  results: () => {
    const max = 31.4;
    const bars = [31.4, 2.1, 18.7];
    return svg(`${coFrame("ASSAY TABLE")}
    ${line("KEY RESULTS", { x: 84, y: 182, w: 912, font: MONO, weight: 600, size: 20, fill: CO.CYAN, tracking: 5 })}
    <rect x="84" y="214" width="912" height="1" fill="${CO.CYAN}" opacity="0.5"/>
    ${line(R.results[0].v, { x: 84, y: 344, w: 600, font: SANS, weight: 700, size: 128, fill: CO.CYAN })}
    ${line(R.results[0].u, { x: 84, y: 392, w: 600, font: MONO, weight: 600, size: 24, fill: CO.WHITE, tracking: 1.6 })}
    ${line(R.results[0].d, { x: 84, y: 430, w: 600, font: MONO, weight: 500, size: 18, fill: CO.STEEL })}
    <rect x="84" y="486" width="912" height="1" fill="${CO.STEEL}" opacity="0.3"/>
    ${line("INTERVAL (m)", { x: 84, y: 536, w: 400, font: MONO, weight: 600, size: 15, fill: CO.STEEL, tracking: 3 })}
    ${bars.map((v, i) => {
      const r = R.results[i + 1] || R.results[1];
      const y = 580 + i * 190;
      const bw = Math.round((v / max) * 620);
      return `<rect x="84" y="${y}" width="${bw}" height="34" fill="${CO.CYAN}" opacity="${0.9 - i * 0.22}"/>
        <rect x="84" y="${y}" width="912" height="1" fill="${CO.STEEL}" opacity="0.18"/>
        ${line(`${r.v} ${r.u}`, { x: 84, y: y + 86, w: 620, font: SANS, weight: 600, size: 32, fill: CO.WHITE })}
        ${line(r.d, { x: 84, y: y + 122, w: 620, font: MONO, weight: 500, size: 17, fill: CO.STEEL })}
        ${line(`${v}`, { x: 740, y: y + 28, w: 256, font: MONO, weight: 600, size: 26, fill: CO.CYAN, anchor: "end" })}`;
    }).join("")}
    ${coFoot()}`, CO.MID);
  },

  context: (photo) => svg(`${coFrame(R.location)}
    ${line("SITE", { x: 84, y: 182, w: 912, font: MONO, weight: 600, size: 18, fill: CO.CYAN, tracking: 5 })}
    ${photo
      ? `${img(photo, 84, 212, 912, 420, "coctx")}<rect x="84" y="212" width="912" height="420" fill="none" stroke="${CO.CYAN}" stroke-opacity="0.45"/>`
      : `<rect x="84" y="212" width="912" height="420" fill="${CO.PANEL}" stroke="${CO.STEEL}" stroke-opacity="0.3"/>
         ${line("DISCLOSED INTERCEPTS", { x: 124, y: 268, w: 600, font: MONO, weight: 600, size: 15, fill: CO.STEEL, tracking: 3.4 })}
         ${R.results.slice(0, 3).map((r, i) => `
           <rect x="124" y="${310 + i * 100}" width="832" height="1" fill="${CO.STEEL}" opacity="0.18"/>
           ${line(`${r.v} ${r.u}`, { x: 124, y: 358 + i * 100, w: 520, font: SANS, weight: 600, size: 30, fill: CO.CYAN })}
           ${line(r.d, { x: 660, y: 358 + i * 100, w: 296, font: MONO, weight: 500, size: 16, fill: CO.STEEL, anchor: "end" })}`).join("")}`}
    <rect x="84" y="212" width="40" height="1" fill="${CO.CYAN}"/><rect x="84" y="212" width="1" height="40" fill="${CO.CYAN}"/>
    <rect x="956" y="592" width="40" height="1" fill="${CO.CYAN}"/><rect x="996" y="592" width="1" height="40" fill="${CO.CYAN}" transform="translate(-1,-40)"/>
    ${line(R.project, { x: 84, y: 714, w: 912, font: SANS, weight: 600, size: 44, fill: CO.WHITE })}
    ${line(R.location, { x: 84, y: 756, w: 912, font: MONO, weight: 500, size: 19, fill: CO.CYAN, tracking: 2, upper: true })}
    <rect x="84" y="800" width="912" height="1" fill="${CO.STEEL}" opacity="0.3"/>
    ${block(R.whatHappened, { x: 84, y: 846, w: 840, h: 260, font: SANS, weight: 400, size: 27, lh: 1.5, fill: "#bdcbd6" })}
    ${coFoot()}`, CO.MID),

  why: () => svg(`${coFrame("ANALYSIS")}
    ${line("WHY IT MATTERS", { x: 84, y: 182, w: 912, font: MONO, weight: 600, size: 20, fill: CO.CYAN, tracking: 5 })}
    <rect x="84" y="214" width="912" height="1" fill="${CO.CYAN}" opacity="0.5"/>
    <rect x="84" y="300" width="912" height="620" fill="${CO.PANEL}" stroke="${CO.STEEL}" stroke-opacity="0.25"/>
    ${block(R.takeaway, { x: 140, y: 360, w: 800, h: 500, font: SANS, weight: 400, min: 32, max: 46, lh: 1.46, fill: CO.WHITE })}
    ${line("MineEx provides factual summaries, not investment advice.", { x: 84, y: 988, w: 912, font: MONO, weight: 500, size: 16, fill: CO.STEEL })}
    ${coFoot()}`, CO.MID),

  closing: (logo, aspect) => svg(`${coFrame(R.dateISO)}
    ${logoMark(logo, 84, 260, 124, aspect)}
    ${line(R.company, { x: 84, y: 470, w: 912, font: SANS, weight: 600, size: 54, fill: CO.WHITE })}
    ${line(R.location, { x: 84, y: 514, w: 912, font: MONO, weight: 500, size: 18, fill: CO.STEEL, tracking: 2, upper: true })}
    <rect x="84" y="566" width="912" height="1" fill="${CO.STEEL}" opacity="0.3"/>
    ${R.tickers.map(([ex, sym], i) => `
      <rect x="${84 + i * 310}" y="616" width="286" height="130" fill="${CO.PANEL}" stroke="${CO.STEEL}" stroke-opacity="0.25"/>
      ${line(ex, { x: 108 + i * 310, y: 662, w: 240, font: MONO, weight: 600, size: 15, fill: CO.STEEL, tracking: 2.6, upper: true })}
      ${line(sym, { x: 108 + i * 310, y: 718, w: 240, font: SANS, weight: 700, size: 40, fill: CO.CYAN })}`).join("")}
    <rect x="84" y="820" width="912" height="1" fill="${CO.STEEL}" opacity="0.3"/>
    ${block(R.cta, { x: 84, y: 880, w: 840, h: 120, font: SANS, weight: 600, size: 38, lh: 1.14, fill: CO.WHITE })}
    ${line(R.ctaSub, { x: 84, y: 1016, w: 912, font: MONO, weight: 500, size: 18, fill: CO.STEEL, tracking: 1 })}
    ${coFoot()}`, CO.MID),
};

/* =======================================================================
   PAPER — luxury art book
   Photography leads. One idea per page, set small and low against a large
   plate or a great deal of air. A single gold hairline is the only rule.
   No tables, no columns, no masthead — the opposite of Broadsheet.
   ======================================================================= */
const PA = { IVORY: "#f3ede1", ESP: "#2b231d", GOLD: "#a9853f", MUTED: "#857666" };
const PML = 132, PMR = 132, PW = W - PML - PMR;
// Folio: a whisper at the foot, not a footer bar.
const paFolio = (n) => `
  ${line(R.company, { x: PML, y: H - 96, w: PW * 0.6, font: SERIF, weight: 400, size: 19, fill: PA.MUTED })}
  ${line(n, { x: PML, y: H - 96, w: PW, font: SANS, weight: 500, size: 14, fill: PA.MUTED, anchor: "end", tracking: 3, upper: true })}`;
const paKick = (t) => `
  ${line(t, { x: PML, y: 128, w: PW, font: SANS, weight: 500, size: 14, fill: PA.GOLD, tracking: 9, upper: true })}`;

export const paper = {
  id: "PAPER", label: "Paper", blurb: "Luxury art book",
  // A full plate occupying two thirds of the page; the headline sits beneath
  // it in a narrow measure, small against the image.
  announce: (photo) => svg(`${paKick(R.eyebrow)}
    ${photo
      ? `${img(photo, PML, 190, PW, 620, "pa1")}`
      : `${block(R.headline, { x: PML, y: 300, w: PW, h: 520, font: SERIF, weight: 400, min: 48, max: 86, lh: 1.16, fill: PA.ESP })}`}
    ${photo ? `<rect x="${PML}" y="852" width="64" height="1" fill="${PA.GOLD}"/>
      ${block(R.headline, { x: PML, y: 892, w: PW * 0.84, h: 280, font: SERIF, weight: 400, min: 30, max: 44, lh: 1.26, fill: PA.ESP })}`
      : `<rect x="${PML}" y="900" width="64" height="1" fill="${PA.GOLD}"/>
      ${line(R.project, { x: PML, y: 960, w: PW, font: SERIF, weight: 400, size: 30, fill: PA.MUTED })}`}
    ${line(`${R.project} · ${R.date}`, { x: PML, y: H - 150, w: PW, font: SANS, weight: 500, size: 14, fill: PA.MUTED, tracking: 2.4, upper: true })}
    ${paFolio("I")}`, PA.IVORY),

  // One figure per spread-width band, enormous amounts of air. No rules, no
  // numbering — the space does the separating.
  results: (rows = R.results) => {
    const n = Math.max(1, Math.min(rows.length, 4));
    const top = 250, field = (H - 240 - top) / n;
    const fig = n === 1 ? 168 : n === 2 ? 124 : n === 3 ? 98 : 82;
    return svg(`${paKick("Key Results")}
      ${rows.slice(0, n).map((r, i) => {
        const blockH = fig * 0.78 + 40;
        const y = top + i * field + Math.max(0, (field - blockH) / 2);
        return `${line(r.v, { x: PML, y: y + fig * 0.78, w: PW * 0.62, font: SERIF, weight: 400, size: fig, fill: PA.ESP })}
          ${line(r.u, { x: PML, y: y + fig * 0.78 + 34, w: PW * 0.62, font: SANS, weight: 500, size: 15, fill: PA.GOLD, tracking: 2.4, upper: true })}
          ${block(r.d, { x: PML + PW * 0.64, y: y + fig * 0.42, w: PW * 0.36, h: field - 70, font: SERIF, weight: 400, size: n >= 4 ? 19 : 23, lh: 1.38, fill: PA.MUTED })}`;
      }).join("")}
      ${paFolio("II")}`, PA.IVORY);
  },

  // Full-bleed plate to three edges, caption set in the lower margin.
  context: (photo) => svg(`
    ${photo ? img(photo, 0, 0, W, 980, "pa2") : `<rect x="0" y="0" width="${W}" height="980" fill="${PA.ESP}"/>
      ${block(R.project, { x: PML, y: 400, w: PW, h: 220, font: SERIF, weight: 400, size: 64, lh: 1.14, fill: PA.IVORY })}`}
    <rect x="${PML}" y="1040" width="64" height="1" fill="${PA.GOLD}"/>
    ${line(R.project, { x: PML, y: 1098, w: PW, font: SERIF, weight: 400, size: 38, fill: PA.ESP })}
    ${line(R.location, { x: PML, y: 1136, w: PW, font: SANS, weight: 500, size: 14, fill: PA.MUTED, tracking: 2.6, upper: true })}
    ${paFolio("III")}`, PA.IVORY),

  // A single sentence, set large, centred in air. Nothing else on the page.
  why: () => svg(`${paKick("Why It Matters")}
    ${block(R.takeaway, { x: PML, y: 360, w: PW, h: 520, font: SERIF, weight: 400, min: 34, max: 56, lh: 1.52, fill: PA.ESP })}
    <rect x="${PML}" y="990" width="64" height="1" fill="${PA.GOLD}"/>
    ${line("MineEx provides factual summaries, not investment advice.", { x: PML, y: 1044, w: PW, font: SANS, weight: 400, size: 15, fill: PA.MUTED })}
    ${paFolio("IV")}`, PA.IVORY),

  closing: (logo, aspect) => svg(`${paKick(R.dateISO)}
    ${logoMark(logo, PML, 300, 120, aspect)}
    ${block(R.company, { x: PML, y: 520, w: PW * 0.8, h: 160, font: SERIF, weight: 400, size: 56, lh: 1.14, fill: PA.ESP })}
    ${line(R.location, { x: PML, y: 700, w: PW, font: SANS, weight: 500, size: 14, fill: PA.MUTED, tracking: 2.6, upper: true })}
    <rect x="${PML}" y="762" width="64" height="1" fill="${PA.GOLD}"/>
    ${R.tickers.map(([ex, sym], i) => `
      ${line(`${ex}  ${sym}`, { x: PML, y: 826 + i * 52, w: PW, font: SERIF, weight: 400, size: 30, fill: i === 0 ? PA.ESP : PA.MUTED })}`).join("")}
    ${block(R.cta, { x: PML, y: 1020, w: PW * 0.8, h: 110, font: SERIF, weight: 400, size: 32, lh: 1.2, fill: PA.ESP })}
    ${paFolio("V")}`, PA.IVORY),
};

/* =======================================================================
   BLEED — immersive photography
   The photograph is the page. One gradient, type low and left, a hairline.
   Without photography it becomes a typographic cover, not an empty frame.
   ======================================================================= */
const BL = { WHITE: "#ffffff", INK: "#101418", SOFT: "rgba(255,255,255,0.74)" };
const blGrad = (id, a = 0.46, b = 0.08, c = 0.58, d = 0.92) => `
  <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#000" stop-opacity="${a}"/><stop offset="34%" stop-color="#000" stop-opacity="${b}"/>
    <stop offset="68%" stop-color="#000" stop-opacity="${c}"/><stop offset="100%" stop-color="#000" stop-opacity="${d}"/>
  </linearGradient></defs>`;
const blHead = (right) => `
  ${line(R.eyebrow, { x: 88, y: 136, w: 460, font: SANS, weight: 700, size: 18, fill: "rgba(255,255,255,0.88)", tracking: 9, upper: true })}
  ${line(right, { x: 540, y: 136, w: 452, font: SANS, weight: 500, size: 18, fill: BL.SOFT, anchor: "end", tracking: 1.4 })}`;
const blFoot = () => `
  <rect x="88" y="1126" width="64" height="2" fill="rgba(255,255,255,0.9)"/>
  ${line(R.company, { x: 88, y: 1186, w: 560, font: SANS, weight: 600, size: 21, fill: BL.WHITE, tracking: 0.6 })}
  ${line(TICKERS, { x: 620, y: 1186, w: 372, font: SANS, weight: 500, size: 17, fill: BL.SOFT, anchor: "end", tracking: 1.2 })}`;
const blNoPhoto = (inner) => svg(`<rect x="0" y="0" width="${W}" height="${H}" fill="${BL.INK}"/>${inner}`, BL.INK);

export const bleed = {
  id: "BLEED", label: "Bleed", blurb: "Immersive photography",
  announce: (photo) => photo ? svg(`${blGrad("bl1")}
    ${img(photo, 0, 0, W, H, "blc1")}<rect x="0" y="0" width="${W}" height="${H}" fill="url(#bl1)"/>
    ${blHead(R.date)}
    ${block(R.headline, { x: 88, y: 742, w: 820, h: 330, font: SANS, weight: 300, min: 40, max: 68, lh: 1.12, fill: BL.WHITE })}
    ${blFoot()}`, "#000")
    : blNoPhoto(`
    ${line(R.eyebrow, { x: 88, y: 150, w: 904, font: SANS, weight: 700, size: 19, fill: "rgba(255,255,255,0.62)", tracking: 9, upper: true })}
    ${block(R.headline, { x: 88, y: 300, w: 904, h: 620, font: SANS, weight: 200, min: 48, max: 92, lh: 1.1, fill: BL.WHITE })}
    <rect x="88" y="1140" width="60" height="1" fill="rgba(255,255,255,0.5)"/>
    ${line(`${R.company}   ·   ${R.date}`, { x: 88, y: 1200, w: 904, font: SANS, weight: 500, size: 21, fill: BL.SOFT, tracking: 1.2 })}`),

  // Figures over the photograph, each on its own band of darkness.
  results: (photo) => photo ? svg(`${blGrad("bl2", 0.52, 0.3, 0.72, 0.94)}
    ${img(photo, 0, 0, W, H, "blc2")}<rect x="0" y="0" width="${W}" height="${H}" fill="url(#bl2)"/>
    ${blHead("Assay highlights")}
    ${line("Key Results", { x: 88, y: 282, w: 904, font: SANS, weight: 200, size: 64, fill: BL.WHITE })}
    ${R.results.slice(0, 3).map((r, i) => {
      const y = 420 + i * 214;
      return `<rect x="88" y="${y}" width="904" height="1" fill="rgba(255,255,255,0.28)"/>
        ${line(r.v, { x: 88, y: y + 96, w: 520, font: SANS, weight: 300, size: 96, fill: BL.WHITE })}
        ${line(r.u, { x: 620, y: y + 72, w: 372, font: SANS, weight: 600, size: 22, fill: BL.WHITE, anchor: "end", tracking: 1 })}
        ${line(r.d, { x: 620, y: y + 106, w: 372, font: SANS, weight: 400, size: 17, fill: BL.SOFT, anchor: "end" })}`;
    }).join("")}
    ${blFoot()}`, "#000")
    : blNoPhoto(`
    ${line("Key Results", { x: 88, y: 260, w: 904, font: SANS, weight: 200, size: 64, fill: BL.WHITE })}
    ${R.results.map((r, i) => {
      const y = 380 + i * 200;
      return `<rect x="88" y="${y}" width="904" height="1" fill="rgba(255,255,255,0.2)"/>
        ${line(r.v, { x: 88, y: y + 96, w: 520, font: SANS, weight: 300, size: 92, fill: BL.WHITE })}
        ${line(r.u, { x: 620, y: y + 72, w: 372, font: SANS, weight: 600, size: 21, fill: BL.WHITE, anchor: "end" })}
        ${line(r.d, { x: 620, y: y + 104, w: 372, font: SANS, weight: 400, size: 17, fill: BL.SOFT, anchor: "end" })}`;
    }).join("")}`),

  context: (photo) => photo ? svg(`${blGrad("bl3", 0.3, 0.05, 0.5, 0.92)}
    ${img(photo, 0, 0, W, H, "blc3")}<rect x="0" y="0" width="${W}" height="${H}" fill="url(#bl3)"/>
    ${blHead(R.location)}
    ${line(R.project, { x: 88, y: 840, w: 904, font: SANS, weight: 200, size: 60, fill: BL.WHITE })}
    ${line(R.location, { x: 88, y: 888, w: 904, font: SANS, weight: 600, size: 18, fill: BL.SOFT, tracking: 2.4, upper: true })}
    ${block(R.whatHappened, { x: 88, y: 940, w: 790, h: 170, font: SANS, weight: 300, size: 27, lh: 1.46, fill: "rgba(255,255,255,0.92)" })}
    ${blFoot()}`, "#000")
    : blNoPhoto(`
    ${line(R.project, { x: 88, y: 420, w: 904, font: SANS, weight: 200, size: 60, fill: BL.WHITE })}
    ${line(R.location, { x: 88, y: 470, w: 904, font: SANS, weight: 600, size: 18, fill: BL.SOFT, tracking: 2.4, upper: true })}
    ${block(R.whatHappened, { x: 88, y: 560, w: 860, h: 300, font: SANS, weight: 300, size: 30, lh: 1.5, fill: "rgba(255,255,255,0.9)" })}`),

  why: (photo) => photo ? svg(`${blGrad("bl4", 0.62, 0.52, 0.72, 0.9)}
    ${img(photo, 0, 0, W, H, "blc4")}<rect x="0" y="0" width="${W}" height="${H}" fill="url(#bl4)"/>
    ${blHead("Significance")}
    ${block(R.takeaway, { x: 88, y: 360, w: 860, h: 560, font: SANS, weight: 300, min: 34, max: 54, lh: 1.42, fill: BL.WHITE })}
    ${line("MineEx provides factual summaries, not investment advice.", { x: 88, y: 1052, w: 904, font: SANS, weight: 500, size: 17, fill: BL.SOFT })}
    ${blFoot()}`, "#000")
    : blNoPhoto(`${block(R.takeaway, { x: 88, y: 380, w: 880, h: 560, font: SANS, weight: 300, min: 34, max: 56, lh: 1.42, fill: BL.WHITE })}`),

  closing: (logo, aspect, photo) => photo ? svg(`${blGrad("bl5", 0.5, 0.42, 0.74, 0.96)}
    ${img(photo, 0, 0, W, H, "blc5")}<rect x="0" y="0" width="${W}" height="${H}" fill="url(#bl5)"/>
    ${blHead(R.dateISO)}
    ${logoMark(logo, 88, 420, 130, aspect)}
    ${line(R.company, { x: 88, y: 672, w: 904, font: SANS, weight: 200, size: 60, fill: BL.WHITE })}
    ${line(R.location, { x: 88, y: 718, w: 904, font: SANS, weight: 600, size: 17, fill: BL.SOFT, tracking: 2.2, upper: true })}
    <rect x="88" y="772" width="904" height="1" fill="rgba(255,255,255,0.3)"/>
    ${R.tickers.map(([ex, sym], i) => `
      ${line(ex, { x: 88 + i * 300, y: 826, w: 260, font: SANS, weight: 600, size: 15, fill: BL.SOFT, tracking: 2.4, upper: true })}
      ${line(sym, { x: 88 + i * 300, y: 880, w: 260, font: SANS, weight: 300, size: 42, fill: BL.WHITE })}`).join("")}
    ${block(R.cta, { x: 88, y: 952, w: 820, h: 120, font: SANS, weight: 300, size: 38, lh: 1.16, fill: BL.WHITE })}
    ${line(R.ctaSub, { x: 88, y: 1074, w: 904, font: SANS, weight: 400, size: 19, fill: BL.SOFT })}
    ${blFoot()}`, "#000")
    : blNoPhoto(`
    ${logoMark(logo, 88, 380, 130, aspect)}
    ${line(R.company, { x: 88, y: 630, w: 904, font: SANS, weight: 200, size: 60, fill: BL.WHITE })}
    ${line(TICKERS, { x: 88, y: 700, w: 904, font: SANS, weight: 500, size: 20, fill: BL.SOFT, tracking: 1.4 })}
    ${block(R.cta, { x: 88, y: 820, w: 840, h: 120, font: SANS, weight: 300, size: 38, lh: 1.16, fill: BL.WHITE })}`),
};

export const FAMILIES = [broadsheet, obsidian, grid, core, paper, bleed];
export const SLIDES = ["announce", "results", "context", "why", "closing"];
export const SLIDE_LABEL = { announce: "1 Announcement", results: "2 Key Results", context: "3 Project Context", why: "4 Why It Matters", closing: "5 Closing" };
export { OUT, DIR };
