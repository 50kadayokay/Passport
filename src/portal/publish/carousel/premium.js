// THE SIX PREMIUM DESIGN SYSTEMS.
//
// Each family composes its five slides as whole pages. They share no layout
// grammar on purpose: a family that differs only in palette reads as the same
// template, which is what these replace. Every value drawn comes from the
// approved card, the company profile or the release's own images.
//
// Signature: fn(c, ctx) where `c` is premiumContent() and `ctx` carries the
// accent, the photograph and the logo. Returns SVG inner markup.

import { W, H, SERIF, SANS, MONO, block, line, img, logoMark, inkOn, tickerLine } from "./premiumText.js";

const bg = (fill) => `<rect x="0" y="0" width="${W}" height="${H}" fill="${fill}"/>`;

/* ===================== BROADSHEET — institutional financial ============ */
const BS = { INK: "#0e1114", NAVY: "#13233f", RULE: "#b9bdc6", HAIR: "#d8dbe0", GREY: "#59606c", PAPER: "#ffffff" };
const BM = 84, BW = W - BM * 2, bcol = (n) => BM + n * (BW / 3);
const bsMast = (c, right, folio) => `
  ${line(c.company, { x: BM, y: 92, w: 620, font: SERIF, weight: 700, size: 38, fill: BS.INK })}
  ${line(right, { x: 640, y: 92, w: BW - 556, font: SANS, weight: 600, size: 15, fill: BS.GREY, anchor: "end", tracking: 2.4, upper: true })}
  <rect x="${BM}" y="104" width="${BW}" height="4" fill="${BS.INK}"/><rect x="${BM}" y="113" width="${BW}" height="1" fill="${BS.INK}"/>
  ${folio ? line(folio, { x: BM, y: 156, w: BW, font: SANS, weight: 700, size: 14, fill: BS.NAVY, tracking: 4, upper: true }) : ""}`;
const bsStrip = (rows, y) => {
  const n = Math.min(rows.length, 4); if (!n) return "";
  const cw = BW / n;
  return `<rect x="${BM}" y="${y}" width="${BW}" height="1" fill="${BS.RULE}"/>
    ${rows.slice(0, n).map((r, i) => `
      ${i > 0 ? `<rect x="${BM + i * cw - 14}" y="${y + 8}" width="1" height="86" fill="${BS.HAIR}"/>` : ""}
      ${line(r.v, { x: BM + i * cw, y: y + 54, w: cw - 28, font: SERIF, weight: 700, size: 34, fill: BS.NAVY })}
      ${line(r.u, { x: BM + i * cw, y: y + 84, w: cw - 28, font: SANS, weight: 600, size: 13, fill: BS.GREY, tracking: 1, upper: true })}`).join("")}
    <rect x="${BM}" y="${y + 108}" width="${BW}" height="1" fill="${BS.RULE}"/>`;
};
const bsFoot = (c) => `
  <rect x="${BM}" y="${H - 150}" width="${BW}" height="1" fill="${BS.INK}"/>
  ${line(c.project, { x: BM, y: H - 104, w: 520, font: SANS, weight: 600, size: 16, fill: BS.INK, tracking: 1.4, upper: true })}
  ${line(tickerLine(c.tickers), { x: 600, y: H - 104, w: 396, font: SANS, weight: 600, size: 15, fill: BS.NAVY, anchor: "end", tracking: 1.2 })}`;
// Columns are filled ONLY with distinct source material. A column with nothing
// of its own to say is left out rather than given a repeated paragraph.
const bsColumns = (parts, y, h) => {
  const live = parts.map((t) => String(t || "").trim()).filter(Boolean).slice(0, 3);
  if (!live.length) return "";
  const n = live.length, cw = BW / n;
  return live.map((t, i) => block(t, { x: BM + i * cw, y, w: cw - 30, h, font: SERIF, weight: 400, size: n === 1 ? 26 : 21, lh: 1.46, fill: "#333a44" })).join("");
};

export const broadsheet = {
  id: "broadsheet", label: "Broadsheet", blurb: "Institutional financial publishing", accent: BS.NAVY, usesAccent: false,
  announcement: (c) => bg(BS.PAPER) + `${bsMast(c, c.date, "§ 01 · Announcement")}${bsStrip(c.rows, 178)}
    ${block(c.headline, { x: BM, y: 332, w: BW, h: 420, font: SERIF, weight: 700, min: 42, max: 76, lh: 1.04, fill: BS.INK })}
    <rect x="${BM}" y="810" width="${BW}" height="2" fill="${BS.INK}"/>
    ${bsColumns([c.context, c.takeaway], 844, 280)}${bsFoot(c)}`,
  keyResults: (c) => {
    const rows = c.rows.slice(0, 4), n = Math.max(1, rows.length);
    const top = 332, pitch = (H - 190 - top) / n;
    const fig = n === 1 ? 150 : n === 2 ? 110 : n === 3 ? 86 : 68;
    const desc = n <= 2 ? 28 : n === 3 ? 24 : 21;
    return bg(BS.PAPER) + `${bsMast(c, "Drill results", "§ 02 · Key Results")}
      ${line(c.title || "Key Results", { x: BM, y: 258, w: BW, font: SERIF, weight: 700, size: 50, fill: BS.INK })}
      ${line(`${n} disclosed ${n === 1 ? "figure" : "figures"}`, { x: 520, y: 258, w: BW - 436, font: SANS, weight: 600, size: 15, fill: BS.GREY, anchor: "end", tracking: 2, upper: true })}
      <rect x="${BM}" y="294" width="${BW}" height="3" fill="${BS.INK}"/>
      ${rows.map((r, i) => {
        const blockH = fig * 0.76 + 54, y = top + i * pitch + Math.max(0, (pitch - blockH) / 2);
        return `${i > 0 ? `<rect x="${BM}" y="${top + i * pitch - 2}" width="${BW}" height="1" fill="${BS.RULE}"/>` : ""}
          ${line(String(i + 1).padStart(2, "0"), { x: BM, y: y + 44, w: 60, font: SANS, weight: 700, size: 14, fill: BS.NAVY, tracking: 2 })}
          ${line(r.v, { x: BM + 74, y: y + fig * 0.76, w: 440, font: SERIF, weight: 700, size: fig, fill: BS.NAVY })}
          ${line(r.u, { x: BM + 74, y: y + fig * 0.76 + 34, w: 440, font: SANS, weight: 600, size: 16, fill: BS.GREY, tracking: 1.2, upper: true })}
          ${block(r.desc, { x: bcol(2) - 14, y: y + 30, w: BW / 3, h: pitch - 70, font: SERIF, weight: 400, size: desc, lh: 1.36, fill: BS.INK })}`;
      }).join("")}${bsFoot(c)}`;
  },
  context: (c, { photo }) => bg(BS.PAPER) + `${bsMast(c, c.location || c.subject, "§ 03 · Project")}
    ${photo ? img(photo, BM, 196, BW, 392, "bsx")
      : `<rect x="${BM}" y="196" width="${BW}" height="392" fill="${BS.INK}"/>${block(c.subject, { x: BM + 40, y: 290, w: BW - 80, h: 200, font: SERIF, weight: 700, size: 56, lh: 1.08, fill: BS.PAPER })}`}
    <rect x="${BM}" y="604" width="${BW}" height="1" fill="${BS.RULE}"/>
    ${line(c.subject, { x: BM, y: 662, w: BW, font: SERIF, weight: 700, size: 42, fill: BS.INK })}
    ${line(c.location, { x: BM, y: 694, w: BW, font: SANS, weight: 600, size: 15, fill: BS.GREY, tracking: 2, upper: true })}
    <rect x="${BM}" y="724" width="${BW}" height="2" fill="${BS.INK}"/>
    ${bsColumns([c.body || c.context], 760, 340)}${bsFoot(c)}`,
  why: (c) => bg(BS.PAPER) + `${bsMast(c, "Analysis", "§ 04 · Why It Matters")}
    <rect x="${BM}" y="196" width="${BW}" height="1" fill="${BS.RULE}"/>
    ${line(c.title || "Why It Matters", { x: BM, y: 268, w: BW, font: SERIF, weight: 700, size: 50, fill: BS.INK })}
    <rect x="${BM}" y="300" width="220" height="4" fill="${BS.NAVY}"/>
    ${block(c.body || c.takeaway, { x: BM, y: 372, w: bcol(2) - 14 - BM, h: 520, font: SERIF, weight: 400, min: 28, max: 42, lh: 1.48, fill: BS.INK })}
    ${bsStrip(c.rows.slice(0, 2), 940)}
    ${line("MineEx provides factual summaries, not investment advice.", { x: BM, y: 1104, w: BW, font: SANS, weight: 500, size: 15, fill: BS.GREY })}
    ${bsFoot(c)}`,
  closing: (c, { logo, logoAspect }) => bg(BS.PAPER) + `${bsMast(c, c.date, "§ 05 · Contact")}
    <rect x="${BM}" y="196" width="${BW}" height="1" fill="${BS.RULE}"/>
    ${logoMark(logo, BM, 248, 110, logoAspect)}
    ${block(c.company, { x: BM, y: 440, w: BW, h: 130, font: SERIF, weight: 700, size: 54, lh: 1.08, fill: BS.INK })}
    ${line(c.location, { x: BM, y: 600, w: BW, font: SANS, weight: 600, size: 15, fill: BS.GREY, tracking: 2, upper: true })}
    <rect x="${BM}" y="636" width="${BW}" height="2" fill="${BS.INK}"/>
    ${c.tickers.slice(0, 3).map(([ex, sym], i) => `
      ${i > 0 ? `<rect x="${bcol(i) - 14}" y="652" width="1" height="130" fill="${BS.HAIR}"/>` : ""}
      ${line(ex, { x: bcol(i), y: 692, w: BW / 3 - 30, font: SANS, weight: 700, size: 14, fill: BS.GREY, tracking: 2.4, upper: true })}
      ${line(sym, { x: bcol(i), y: 752, w: BW / 3 - 30, font: SERIF, weight: 700, size: 44, fill: BS.NAVY })}`).join("")}
    <rect x="${BM}" y="796" width="${BW}" height="1" fill="${BS.RULE}"/>
    ${block(c.cta, { x: BM, y: 858, w: BW * 0.8, h: 110, font: SERIF, weight: 700, size: 38, lh: 1.14, fill: BS.INK })}
    ${block(c.url, { x: BM, y: 992, w: BW, h: 80, font: SANS, weight: 400, size: 18, lh: 1.3, fill: BS.GREY })}
    ${bsFoot(c)}`,
};

/* ===================== OBSIDIAN — cinematic luxury ===================== */
const OB = { BLACK: "#06080b", GRAPHITE: "#1a1f26", COPPER: "#c98b45", BONE: "#f2ece3", DIM: "#79828d" };
const obHead = (c, right, acc) => `
  ${line(c.company, { x: 96, y: 118, w: 560, font: SANS, weight: 600, size: 30, fill: OB.BONE, tracking: 0.4 })}
  ${line(right, { x: 620, y: 118, w: 364, font: MONO, weight: 500, size: 17, fill: OB.DIM, anchor: "end", tracking: 1.5 })}
  ${line(c.eyebrow || "Update", { x: 96, y: 158, w: 560, font: SANS, weight: 700, size: 16, fill: acc, tracking: 8, upper: true })}`;
const obFoot = (c, acc) => `
  <rect x="96" y="1168" width="46" height="2" fill="${acc}"/>
  ${line(c.company, { x: 96, y: 1218, w: 520, font: SANS, weight: 500, size: 24, fill: OB.BONE, tracking: 1.4 })}
  ${line(tickerLine(c.tickers), { x: 600, y: 1218, w: 384, font: MONO, weight: 500, size: 16, fill: OB.DIM, anchor: "end", tracking: 1 })}`;

export const obsidian = {
  id: "obsidian", label: "Obsidian", blurb: "Cinematic luxury typography", accent: OB.COPPER, usesAccent: true,
  announcement: (c, { accent: a = OB.COPPER }) => {
    const hero = c.rows[0];
    return bg(OB.BLACK) + `<rect x="0" y="0" width="${W}" height="420" fill="${OB.GRAPHITE}"/>
    <rect x="0" y="420" width="${W}" height="1" fill="${a}" opacity="0.55"/>${obHead(c, c.date, a)}
    ${hero ? `${line(hero.v, { x: 96, y: 330, w: 888, font: SANS, weight: 800, size: 186, fill: OB.BONE })}
      <rect x="96" y="356" width="888" height="1" fill="${a}" opacity="0.4"/>
      ${line([hero.u, hero.desc].filter(Boolean).join("   ·   "), { x: 96, y: 392, w: 888, font: MONO, weight: 500, size: 20, fill: a, tracking: 1.6 })}`
      : block(c.project, { x: 96, y: 210, w: 888, h: 180, font: SANS, weight: 200, size: 72, lh: 1.08, fill: OB.BONE })}
    ${block(c.headline, { x: 96, y: 500, w: 834, h: 520, font: SANS, weight: 300, min: 42, max: 70, lh: 1.16, fill: OB.BONE })}
    ${obFoot(c, a)}`;
  },
  keyResults: (c, { accent: a = OB.COPPER }) => {
    const rows = c.rows.slice(0, 4), n = Math.max(1, rows.length);
    const top = 330, pitch = (H - 230 - top) / n, fig = n === 1 ? 160 : n === 2 ? 122 : n === 3 ? 102 : 88;
    return bg(OB.BLACK) + `${obHead(c, "Assay highlights", a)}
      ${line(c.title || "Key Results", { x: 96, y: 226, w: 888, font: SANS, weight: 200, size: 72, fill: OB.BONE })}
      <rect x="96" y="268" width="888" height="1" fill="${a}" opacity="0.45"/>
      ${rows.map((r, i) => {
        const y = top + i * pitch + Math.max(0, (pitch - fig * 0.8 - 40) / 2);
        return `${i > 0 ? `<rect x="96" y="${top + i * pitch - 10}" width="888" height="1" fill="#242a33"/>` : ""}
          ${line(r.v, { x: 96, y: y + fig * 0.78, w: 470, font: SANS, weight: 700, size: fig, fill: OB.BONE })}
          ${line(r.u, { x: 560, y: y + fig * 0.5, w: 424, font: MONO, weight: 600, size: 22, fill: a, anchor: "end", tracking: 1.2 })}
          ${line(r.desc, { x: 560, y: y + fig * 0.5 + 34, w: 424, font: MONO, weight: 500, size: 17, fill: OB.DIM, anchor: "end" })}`;
      }).join("")}${obFoot(c, a)}`;
  },
  context: (c, { photo, accent: a = OB.COPPER }) => bg(OB.BLACK) + `
    ${photo ? `${img(photo, 0, 0, W, 820, "obx")}<rect x="0" y="0" width="${W}" height="820" fill="${OB.BLACK}" opacity="0.46"/>`
      : `<rect x="0" y="0" width="${W}" height="820" fill="${OB.GRAPHITE}"/>
         ${block(c.subject, { x: 96, y: 420, w: 820, h: 200, font: SANS, weight: 200, size: 72, lh: 1.08, fill: OB.BONE })}`}
    <rect x="0" y="820" width="${W}" height="1" fill="${a}" opacity="0.5"/>${obHead(c, c.location || "", a)}
    ${photo ? `${line(c.subject, { x: 96, y: 700, w: 888, font: SANS, weight: 300, size: 54, fill: OB.BONE })}
      ${line(c.location, { x: 96, y: 752, w: 888, font: MONO, weight: 500, size: 19, fill: a, tracking: 2, upper: true })}` : ""}
    ${block(c.body || c.context, { x: 96, y: 890, w: 820, h: 220, font: SANS, weight: 300, size: 30, lh: 1.48, fill: "#c9cdd3" })}
    ${obFoot(c, a)}`,
  why: (c, { accent: a = OB.COPPER }) => bg(OB.BLACK) + `${obHead(c, "Significance", a)}
    <rect x="96" y="300" width="2" height="640" fill="${a}" opacity="0.7"/>
    ${line(c.title || "Why It Matters", { x: 140, y: 268, w: 844, font: SANS, weight: 200, size: 60, fill: OB.BONE })}
    ${block(c.body || c.takeaway, { x: 140, y: 360, w: 790, h: 560, font: SANS, weight: 300, min: 32, max: 52, lh: 1.44, fill: OB.BONE })}
    ${line("MineEx provides factual summaries, not investment advice.", { x: 140, y: 1030, w: 844, font: MONO, weight: 500, size: 16, fill: OB.DIM })}
    ${obFoot(c, a)}`,
  closing: (c, { logo, logoAspect, accent: a = OB.COPPER }) => bg(OB.BLACK) + `
    <rect x="0" y="980" width="${W}" height="370" fill="${OB.GRAPHITE}"/><rect x="0" y="980" width="${W}" height="1" fill="${a}" opacity="0.5"/>
    ${obHead(c, c.date, a)}${logoMark(logo, W / 2, 330, 140, logoAspect, "middle")}
    ${block(c.company, { x: 96, y: 560, w: 888, h: 130, font: SANS, weight: 200, size: 62, lh: 1.08, fill: OB.BONE, anchor: "middle" })}
    ${line(c.location, { x: 96, y: 712, w: 888, font: MONO, weight: 500, size: 18, fill: OB.DIM, anchor: "middle", tracking: 2.4, upper: true })}
    <rect x="${W / 2 - 24}" y="752" width="48" height="1" fill="${a}"/>
    ${c.tickers.slice(0, 3).map(([ex, sym], i) => {
      const cw = 888 / Math.min(3, c.tickers.length || 1);
      return `${line(ex, { x: 96 + i * cw, y: 836, w: cw, font: MONO, weight: 500, size: 15, fill: OB.DIM, anchor: "middle", tracking: 2.6, upper: true })}
        ${line(sym, { x: 96 + i * cw, y: 886, w: cw, font: SANS, weight: 600, size: 38, fill: a, anchor: "middle" })}`;
    }).join("")}
    ${block(c.cta, { x: 96, y: 1074, w: 888, h: 90, font: SANS, weight: 300, size: 38, lh: 1.14, fill: OB.BONE, anchor: "middle" })}
    ${line(tickerLine(c.tickers), { x: 96, y: 1268, w: 888, font: MONO, weight: 500, size: 16, fill: OB.DIM, anchor: "middle", tracking: 1.2 })}`,
};

/* ===================== GRID — Swiss modernist ========================== */
const GR = { PAPER: "#efeee9", BLACK: "#101010", RED: "#e8431f" };
const gcol = (n) => 60 + n * ((W - 120) / 12);
const grRules = () => [1,2,3,4,5,6,7,8,9,10,11].map((i) => `<rect x="${gcol(i)}" y="0" width="1" height="${H}" fill="${GR.BLACK}" opacity="0.08"/>`).join("");
const grHead = (c, right) => `<rect x="0" y="0" width="${W}" height="196" fill="${GR.BLACK}"/>
  ${line(c.company, { x: gcol(0), y: 96, w: 620, font: SANS, weight: 800, size: 34, fill: GR.PAPER })}
  ${line(c.eyebrow || "Update", { x: gcol(0), y: 146, w: 520, font: SANS, weight: 800, size: 17, fill: GR.PAPER, tracking: 9, upper: true })}
  ${line(right, { x: gcol(7), y: 146, w: gcol(12) - gcol(7), font: SANS, weight: 500, size: 19, fill: "#9a9a9a", anchor: "end", tracking: 1 })}`;
const grFoot = (c, a) => `<rect x="0" y="${H - 148}" width="${W}" height="148" fill="${GR.BLACK}"/>
  ${line(c.company, { x: gcol(0), y: H - 86, w: 520, font: SANS, weight: 700, size: 25, fill: GR.PAPER })}
  ${line(tickerLine(c.tickers), { x: gcol(6), y: H - 86, w: gcol(12) - gcol(6), font: SANS, weight: 500, size: 18, fill: a, anchor: "end", tracking: 1.2 })}`;

export const grid = {
  id: "grid", label: "Grid", blurb: "Swiss modernist graphic design", accent: GR.RED, usesAccent: true,
  announcement: (c, { accent: a = GR.RED }) => {
    const hero = c.rows[0], ink = inkOn(a);
    return bg(GR.PAPER) + `${grRules()}${grHead(c, c.date)}
    ${hero ? `<rect x="${gcol(0)}" y="258" width="${gcol(4) - gcol(0) - 28}" height="${gcol(4) - gcol(0) - 28}" fill="${a}"/>
      ${line(hero.v, { x: gcol(0) + 22, y: 420, w: gcol(4) - gcol(0) - 70, font: SANS, weight: 800, size: 86, fill: ink })}
      ${line(hero.u, { x: gcol(0) + 22, y: 462, w: gcol(4) - gcol(0) - 70, font: SANS, weight: 700, size: 20, fill: ink, tracking: 1.2 })}` : ""}
    ${block(c.headline, { x: hero ? gcol(4) : gcol(0), y: 258, w: gcol(12) - (hero ? gcol(4) : gcol(0)), h: 420, font: SANS, weight: 700, min: 34, max: hero ? 58 : 76, lh: 1.08, fill: GR.BLACK })}
    <rect x="${gcol(0)}" y="760" width="${W - 120}" height="4" fill="${GR.BLACK}"/>
    ${block(c.context, { x: gcol(0), y: 800, w: gcol(7) - gcol(0) - 24, h: 260, font: SANS, weight: 400, size: 26, lh: 1.46, fill: "#2b2b2b" })}
    ${hero ? line(hero.desc, { x: gcol(7), y: 826, w: gcol(12) - gcol(7), font: SANS, weight: 700, size: 19, fill: a, tracking: 0.8, upper: true }) : ""}
    ${grFoot(c, a)}`;
  },
  keyResults: (c, { accent: a = GR.RED }) => {
    const rows = c.rows.slice(0, 4), n = Math.max(1, rows.length);
    const spans = [[0, 8], [0, 6], [3, 9], [0, 7]];
    const top = 400, pitch = (H - 210 - top) / n;
    return bg(GR.PAPER) + `${grRules()}${grHead(c, "Assays")}
      ${line((c.title || "Key Results").toUpperCase(), { x: gcol(0), y: 290, w: 700, font: SANS, weight: 800, size: 46, fill: GR.BLACK, tracking: 2 })}
      <rect x="${gcol(0)}" y="318" width="${gcol(5) - gcol(0)}" height="6" fill="${a}"/>
      ${rows.map((r, i) => {
        const [s, e] = spans[i % 4]; const big = i === 0;
        const y = top + i * pitch + Math.max(0, (pitch - 150) / 2);
        return `${line(r.v, { x: gcol(s), y: y + (big ? 96 : 76), w: gcol(e) - gcol(s), font: SANS, weight: 800, size: big ? 112 : 84, fill: big ? a : GR.BLACK })}
          ${line(r.u, { x: gcol(s), y: y + (big ? 132 : 110), w: gcol(e) - gcol(s), font: SANS, weight: 700, size: 19, fill: GR.BLACK, tracking: 1 })}
          ${line(r.desc, { x: gcol(e) + 16, y: y + (big ? 96 : 76), w: gcol(12) - gcol(e) - 16, font: SANS, weight: 400, size: 19, fill: "#4a4a4a" })}`;
      }).join("")}${grFoot(c, a)}`;
  },
  context: (c, { photo, accent: a = GR.RED }) => {
    const ink = inkOn(a);
    return bg(GR.PAPER) + `${grRules()}${grHead(c, c.location || "")}
    ${photo ? img(photo, gcol(0), 258, gcol(7) - gcol(0), 560, "grx")
      : `<rect x="${gcol(0)}" y="258" width="${gcol(7) - gcol(0)}" height="560" fill="${GR.BLACK}"/>
         ${block(c.subject, { x: gcol(0) + 28, y: 320, w: gcol(7) - gcol(0) - 56, h: 300, font: SANS, weight: 800, size: 56, lh: 1.04, fill: GR.PAPER })}
         <rect x="${gcol(0) + 28}" y="668" width="120" height="6" fill="${a}"/>
         ${line(c.location, { x: gcol(0) + 28, y: 736, w: gcol(7) - gcol(0) - 56, font: SANS, weight: 600, size: 18, fill: "#b9b9b9", tracking: 1.6, upper: true })}`}
    <rect x="${gcol(7)}" y="258" width="${gcol(12) - gcol(7)}" height="90" fill="${a}"/>
    ${line(c.title || "The Project", { x: gcol(7) + 20, y: 312, w: gcol(12) - gcol(7) - 36, font: SANS, weight: 800, size: 20, fill: ink, tracking: 3, upper: true })}
    ${block(c.subject, { x: gcol(7), y: 380, w: gcol(12) - gcol(7), h: 180, font: SANS, weight: 700, size: 34, lh: 1.12, fill: GR.BLACK })}
    ${block(c.location, { x: gcol(7), y: 580, w: gcol(12) - gcol(7), h: 150, font: SANS, weight: 500, size: 21, lh: 1.35, fill: "#4a4a4a" })}
    <rect x="${gcol(0)}" y="868" width="${W - 120}" height="4" fill="${GR.BLACK}"/>
    ${block(c.body || c.context, { x: gcol(0), y: 908, w: gcol(8) - gcol(0), h: 240, font: SANS, weight: 400, size: 26, lh: 1.46, fill: "#2b2b2b" })}
    ${grFoot(c, a)}`;
  },
  why: (c, { accent: a = GR.RED }) => {
    const ink = inkOn(a);
    return bg(GR.PAPER) + `${grRules()}${grHead(c, "Significance")}
    <rect x="0" y="258" width="${gcol(3)}" height="700" fill="${a}"/>
    ${["WHY", "IT", "MATTERS"].map((t, i) => line(t, { x: 60, y: 420 + i * 76, w: gcol(3) - 80, font: SANS, weight: 800, size: i === 2 ? 54 : 76, fill: ink })).join("")}
    ${block(c.body || c.takeaway, { x: gcol(3) + 40, y: 290, w: gcol(12) - gcol(3) - 40, h: 620, font: SANS, weight: 500, min: 30, max: 46, lh: 1.38, fill: GR.BLACK })}
    ${line("MineEx provides factual summaries, not investment advice.", { x: gcol(3) + 40, y: 1010, w: gcol(12) - gcol(3) - 40, font: SANS, weight: 500, size: 17, fill: "#6a6a6a" })}
    ${grFoot(c, a)}`;
  },
  closing: (c, { logo, logoAspect, accent: a = GR.RED }) => {
    const ink = inkOn(a);
    return bg(GR.PAPER) + `${grRules()}${grHead(c, c.date)}
    ${logoMark(logo, gcol(0), 280, 130, logoAspect)}
    ${block(c.company, { x: gcol(0), y: 470, w: gcol(8) - gcol(0), h: 180, font: SANS, weight: 800, size: 64, lh: 1.04, fill: GR.BLACK })}
    ${line(c.location, { x: gcol(0), y: 690, w: gcol(9) - gcol(0), font: SANS, weight: 500, size: 20, fill: "#4a4a4a", tracking: 1.2, upper: true })}
    <rect x="${gcol(0)}" y="740" width="${W - 120}" height="4" fill="${GR.BLACK}"/>
    ${c.tickers.slice(0, 3).map(([ex, sym], i) => `
      <rect x="${gcol(i * 4)}" y="790" width="${gcol(i * 4 + 4) - gcol(i * 4) - 24}" height="132" fill="${i === 0 ? a : GR.BLACK}"/>
      ${line(ex, { x: gcol(i * 4) + 18, y: 836, w: 180, font: SANS, weight: 700, size: 16, fill: i === 0 ? ink : GR.PAPER, tracking: 2.4, upper: true })}
      ${line(sym, { x: gcol(i * 4) + 18, y: 896, w: 200, font: SANS, weight: 800, size: 44, fill: i === 0 ? ink : GR.PAPER })}`).join("")}
    ${block(c.cta, { x: gcol(0), y: 980, w: gcol(9) - gcol(0), h: 120, font: SANS, weight: 700, size: 38, lh: 1.12, fill: GR.BLACK })}
    ${grFoot(c, a)}`;
  },
};

/* ===================== CORE — technical intelligence =================== */
const CO = { MID: "#0a1724", PANEL: "#0f2234", STEEL: "#8fa6b8", CYAN: "#2fd3e3", WHITE: "#eef5f9" };
const coReg = (x, y, a) => `<g opacity="0.55"><rect x="${x - 11}" y="${y}" width="22" height="1" fill="${a}"/><rect x="${x}" y="${y - 11}" width="1" height="22" fill="${a}"/></g>`;
const coFrame = (c, right, a) => `${coReg(84, 72, a)}${coReg(W - 84, 72, a)}${coReg(84, H - 72, a)}${coReg(W - 84, H - 72, a)}
  ${line("GEOLOGICAL INTELLIGENCE", { x: 114, y: 78, w: 460, font: MONO, weight: 500, size: 15, fill: a, tracking: 4 })}
  ${line(right, { x: 560, y: 78, w: 410, font: MONO, weight: 500, size: 15, fill: CO.STEEL, anchor: "end", tracking: 2 })}
  <rect x="84" y="100" width="912" height="1" fill="${CO.STEEL}" opacity="0.3"/>
  ${line(c.company, { x: 84, y: 146, w: 912, font: SANS, weight: 600, size: 32, fill: CO.WHITE })}
  <rect x="84" y="166" width="912" height="1" fill="${CO.STEEL}" opacity="0.18"/>`;
const coFoot = (c, a) => `<rect x="84" y="${H - 190}" width="912" height="1" fill="${CO.STEEL}" opacity="0.3"/>
  ${line(c.company, { x: 84, y: H - 132, w: 560, font: SANS, weight: 600, size: 24, fill: CO.WHITE })}
  ${line(c.project, { x: 84, y: H - 98, w: 560, font: MONO, weight: 500, size: 16, fill: CO.STEEL })}
  ${line(tickerLine(c.tickers), { x: 560, y: H - 132, w: 436, font: MONO, weight: 500, size: 17, fill: a, anchor: "end", tracking: 1.4 })}`;

export const core = {
  id: "core", label: "Core", blurb: "Technical intelligence and precision", accent: CO.CYAN, usesAccent: true,
  announcement: (c, { accent: a = CO.CYAN }) => {
    const hero = c.rows[0];
    return bg(CO.MID) + `${coFrame(c, c.date, a)}
    ${line(c.eyebrow || "Update", { x: 84, y: 182, w: 912, font: MONO, weight: 600, size: 18, fill: a, tracking: 5, upper: true })}
    ${block(c.headline, { x: 84, y: 206, w: 894, h: 230, font: SANS, weight: 600, min: 30, max: 52, lh: 1.14, fill: CO.WHITE })}
    ${Array.from({ length: 19 }, (_, i) => `<rect x="84" y="${470 + i * 26}" width="${i % 4 === 0 ? 34 : 18}" height="1.5" fill="${CO.STEEL}" opacity="${i % 4 === 0 ? 0.9 : 0.45}"/>`).join("")}
    <rect x="84" y="470" width="1" height="468" fill="${CO.STEEL}" opacity="0.5"/>
    <rect x="170" y="470" width="826" height="468" fill="${CO.PANEL}" stroke="${CO.STEEL}" stroke-opacity="0.25"/>
    ${hero ? `${line("PRIMARY INTERCEPT", { x: 206, y: 526, w: 520, font: MONO, weight: 600, size: 16, fill: CO.STEEL, tracking: 3.4 })}
      ${line(hero.v, { x: 206, y: 638, w: 740, font: SANS, weight: 700, size: 112, fill: a })}
      ${line(hero.u, { x: 206, y: 686, w: 420, font: MONO, weight: 600, size: 22, fill: CO.WHITE, tracking: 1.6 })}
      <rect x="206" y="716" width="700" height="1" fill="${CO.STEEL}" opacity="0.3"/>
      ${line(hero.desc, { x: 206, y: 756, w: 700, font: MONO, weight: 500, size: 19, fill: CO.STEEL })}
      ${c.rows.slice(1, 3).map((r, i) => line(`${r.v} ${r.u}  ·  ${r.desc}`, { x: 206, y: 812 + i * 40, w: 700, font: MONO, weight: 500, size: 18, fill: CO.STEEL })).join("")}`
      : block(c.context, { x: 206, y: 526, w: 760, h: 360, font: SANS, weight: 400, size: 26, lh: 1.5, fill: "#bdcbd6" })}
    ${coFoot(c, a)}`;
  },
  keyResults: (c, { accent: a = CO.CYAN }) => {
    const rows = c.rows.slice(0, 4), hero = rows[0], rest = rows.slice(1);
    const nums = rest.map((r) => parseFloat(String(r.v).replace(/[^\d.]/g, "")) || 0);
    const max = Math.max(1, ...nums);
    const top = 580, pitch = rest.length ? (H - 240 - top) / rest.length : 0;
    return bg(CO.MID) + `${coFrame(c, "ASSAY TABLE", a)}
      ${line((c.title || "Key Results").toUpperCase(), { x: 84, y: 182, w: 912, font: MONO, weight: 600, size: 20, fill: a, tracking: 5 })}
      <rect x="84" y="214" width="912" height="1" fill="${a}" opacity="0.5"/>
      ${hero ? `${line(hero.v, { x: 84, y: 344, w: 600, font: SANS, weight: 700, size: 128, fill: a })}
        ${line(hero.u, { x: 84, y: 392, w: 600, font: MONO, weight: 600, size: 24, fill: CO.WHITE, tracking: 1.6 })}
        ${line(hero.desc, { x: 84, y: 430, w: 760, font: MONO, weight: 500, size: 18, fill: CO.STEEL })}` : ""}
      <rect x="84" y="486" width="912" height="1" fill="${CO.STEEL}" opacity="0.3"/>
      ${rest.map((r, i) => {
        const y = top + i * pitch, bw = Math.round((nums[i] / max) * 620);
        return `<rect x="84" y="${y}" width="${bw}" height="30" fill="${a}" opacity="${0.9 - i * 0.2}"/>
          <rect x="84" y="${y}" width="912" height="1" fill="${CO.STEEL}" opacity="0.18"/>
          ${line(`${r.v} ${r.u}`, { x: 84, y: y + 82, w: 620, font: SANS, weight: 600, size: 32, fill: CO.WHITE })}
          ${line(r.desc, { x: 84, y: y + 118, w: 620, font: MONO, weight: 500, size: 17, fill: CO.STEEL })}
          ${line(r.v, { x: 740, y: y + 26, w: 256, font: MONO, weight: 600, size: 24, fill: a, anchor: "end" })}`;
      }).join("")}${coFoot(c, a)}`;
  },
  context: (c, { photo, accent: a = CO.CYAN }) => bg(CO.MID) + `${coFrame(c, c.location || "", a)}
    ${line("SITE", { x: 84, y: 182, w: 912, font: MONO, weight: 600, size: 18, fill: a, tracking: 5 })}
    ${photo ? `${img(photo, 84, 212, 912, 420, "cox")}<rect x="84" y="212" width="912" height="420" fill="none" stroke="${a}" stroke-opacity="0.45"/>`
      : `<rect x="84" y="212" width="912" height="420" fill="${CO.PANEL}" stroke="${CO.STEEL}" stroke-opacity="0.3"/>
         ${line("DISCLOSED INTERCEPTS", { x: 124, y: 268, w: 600, font: MONO, weight: 600, size: 15, fill: CO.STEEL, tracking: 3.4 })}
         ${c.rows.slice(0, 3).map((r, i) => `<rect x="124" y="${310 + i * 100}" width="832" height="1" fill="${CO.STEEL}" opacity="0.18"/>
            ${line(`${r.v} ${r.u}`, { x: 124, y: 358 + i * 100, w: 520, font: SANS, weight: 600, size: 30, fill: a })}
            ${line(r.desc, { x: 660, y: 358 + i * 100, w: 296, font: MONO, weight: 500, size: 16, fill: CO.STEEL, anchor: "end" })}`).join("")}`}
    ${line(c.subject, { x: 84, y: 714, w: 912, font: SANS, weight: 600, size: 44, fill: CO.WHITE })}
    ${line(c.location, { x: 84, y: 756, w: 912, font: MONO, weight: 500, size: 19, fill: a, tracking: 2, upper: true })}
    <rect x="84" y="800" width="912" height="1" fill="${CO.STEEL}" opacity="0.3"/>
    ${block(c.body || c.context, { x: 84, y: 846, w: 840, h: 260, font: SANS, weight: 400, size: 27, lh: 1.5, fill: "#bdcbd6" })}
    ${coFoot(c, a)}`,
  why: (c, { accent: a = CO.CYAN }) => bg(CO.MID) + `${coFrame(c, "ANALYSIS", a)}
    ${line((c.title || "Why It Matters").toUpperCase(), { x: 84, y: 182, w: 912, font: MONO, weight: 600, size: 20, fill: a, tracking: 5 })}
    <rect x="84" y="214" width="912" height="1" fill="${a}" opacity="0.5"/>
    <rect x="84" y="300" width="912" height="620" fill="${CO.PANEL}" stroke="${CO.STEEL}" stroke-opacity="0.25"/>
    ${block(c.body || c.takeaway, { x: 140, y: 360, w: 800, h: 500, font: SANS, weight: 400, min: 30, max: 46, lh: 1.46, fill: CO.WHITE })}
    ${line("MineEx provides factual summaries, not investment advice.", { x: 84, y: 988, w: 912, font: MONO, weight: 500, size: 16, fill: CO.STEEL })}
    ${coFoot(c, a)}`,
  closing: (c, { logo, logoAspect, accent: a = CO.CYAN }) => bg(CO.MID) + `${coFrame(c, c.date, a)}
    ${logoMark(logo, 84, 260, 124, logoAspect)}
    ${block(c.company, { x: 84, y: 440, w: 912, h: 120, font: SANS, weight: 600, size: 54, lh: 1.08, fill: CO.WHITE })}
    ${line(c.location, { x: 84, y: 580, w: 912, font: MONO, weight: 500, size: 18, fill: CO.STEEL, tracking: 2, upper: true })}
    <rect x="84" y="616" width="912" height="1" fill="${CO.STEEL}" opacity="0.3"/>
    ${c.tickers.slice(0, 3).map(([ex, sym], i) => `
      <rect x="${84 + i * 310}" y="656" width="286" height="130" fill="${CO.PANEL}" stroke="${CO.STEEL}" stroke-opacity="0.25"/>
      ${line(ex, { x: 108 + i * 310, y: 702, w: 240, font: MONO, weight: 600, size: 15, fill: CO.STEEL, tracking: 2.6, upper: true })}
      ${line(sym, { x: 108 + i * 310, y: 758, w: 240, font: SANS, weight: 700, size: 40, fill: a })}`).join("")}
    <rect x="84" y="840" width="912" height="1" fill="${CO.STEEL}" opacity="0.3"/>
    ${block(c.cta, { x: 84, y: 900, w: 840, h: 110, font: SANS, weight: 600, size: 38, lh: 1.14, fill: CO.WHITE })}
    ${block(c.url, { x: 84, y: 1030, w: 912, h: 70, font: MONO, weight: 500, size: 17, lh: 1.3, fill: CO.STEEL })}
    ${coFoot(c, a)}`,
};

/* ===================== PAPER — luxury art book ========================= */
const PA = { IVORY: "#f3ede1", ESP: "#2b231d", GOLD: "#a9853f", MUTED: "#857666" };
const PML = 132, PW = W - PML * 2;
const paFolio = (c, n) => `
  ${line(c.company, { x: PML, y: H - 96, w: PW * 0.6, font: SERIF, weight: 400, size: 19, fill: PA.MUTED })}
  ${line(n, { x: PML, y: H - 96, w: PW, font: SANS, weight: 500, size: 14, fill: PA.MUTED, anchor: "end", tracking: 3, upper: true })}`;
const paKick = (t, a, c) => `
  ${c ? line(c.company, { x: PML, y: 120, w: PW, font: SERIF, weight: 400, size: 32, fill: PA.ESP }) : ""}
  ${line(t, { x: PML, y: c ? 164 : 128, w: PW, font: SANS, weight: 500, size: 14, fill: a, tracking: 9, upper: true })}`;

export const paper = {
  id: "paper", label: "Paper", blurb: "Luxury art book", accent: PA.GOLD, usesAccent: true,
  announcement: (c, { photo, accent: a = PA.GOLD }) => bg(PA.IVORY) + `${paKick(c.eyebrow || "Announcement", a, c)}
    ${photo ? `${img(photo, PML, 190, PW, 620, "pax")}
      <rect x="${PML}" y="852" width="64" height="1" fill="${a}"/>
      ${block(c.headline, { x: PML, y: 892, w: PW * 0.84, h: 280, font: SERIF, weight: 400, min: 26, max: 44, lh: 1.26, fill: PA.ESP })}`
      : `${block(c.headline, { x: PML, y: 300, w: PW, h: 520, font: SERIF, weight: 400, min: 40, max: 86, lh: 1.16, fill: PA.ESP })}
      <rect x="${PML}" y="900" width="64" height="1" fill="${a}"/>
      ${line(c.project, { x: PML, y: 960, w: PW, font: SERIF, weight: 400, size: 30, fill: PA.MUTED })}`}
    ${line([c.project, c.date].filter(Boolean).join(" · "), { x: PML, y: H - 150, w: PW, font: SANS, weight: 500, size: 14, fill: PA.MUTED, tracking: 2.4, upper: true })}
    ${paFolio(c, "I")}`,
  keyResults: (c, { accent: a = PA.GOLD }) => {
    const rows = c.rows.slice(0, 4), n = Math.max(1, rows.length);
    const top = 250, field = (H - 240 - top) / n;
    const fig = n === 1 ? 168 : n === 2 ? 124 : n === 3 ? 98 : 82;
    return bg(PA.IVORY) + `${paKick(c.title || "Key Results", a, c)}
      ${rows.map((r, i) => {
        const y = top + i * field + Math.max(0, (field - (fig * 0.78 + 40)) / 2);
        return `${line(r.v, { x: PML, y: y + fig * 0.78, w: PW * 0.62, font: SERIF, weight: 400, size: fig, fill: PA.ESP })}
          ${line(r.u, { x: PML, y: y + fig * 0.78 + 34, w: PW * 0.62, font: SANS, weight: 500, size: 15, fill: a, tracking: 2.4, upper: true })}
          ${block(r.desc, { x: PML + PW * 0.64, y: y + fig * 0.42, w: PW * 0.36, h: field - 70, font: SERIF, weight: 400, size: n >= 4 ? 19 : 23, lh: 1.38, fill: PA.MUTED })}`;
      }).join("")}${paFolio(c, "II")}`;
  },
  context: (c, { photo, accent: a = PA.GOLD }) => bg(PA.IVORY) + `
    ${photo ? img(photo, 0, 0, W, 980, "pax2")
      : `<rect x="0" y="0" width="${W}" height="980" fill="${PA.ESP}"/>
         ${block(c.subject, { x: PML, y: 380, w: PW, h: 220, font: SERIF, weight: 400, size: 64, lh: 1.14, fill: PA.IVORY })}
         ${block(c.body || c.context, { x: PML, y: 680, w: PW * 0.8, h: 180, font: SERIF, weight: 400, size: 24, lh: 1.46, fill: "#cdbfae" })}`}
    <rect x="${PML}" y="1040" width="64" height="1" fill="${a}"/>
    ${line(c.subject, { x: PML, y: 1098, w: PW, font: SERIF, weight: 400, size: 38, fill: PA.ESP })}
    ${line(c.location, { x: PML, y: 1136, w: PW, font: SANS, weight: 500, size: 14, fill: PA.MUTED, tracking: 2.6, upper: true })}
    ${paFolio(c, "III")}`,
  why: (c, { accent: a = PA.GOLD }) => bg(PA.IVORY) + `${paKick(c.title || "Why It Matters", a, c)}
    ${block(c.body || c.takeaway, { x: PML, y: 360, w: PW, h: 520, font: SERIF, weight: 400, min: 32, max: 56, lh: 1.52, fill: PA.ESP })}
    <rect x="${PML}" y="990" width="64" height="1" fill="${a}"/>
    ${line("MineEx provides factual summaries, not investment advice.", { x: PML, y: 1044, w: PW, font: SANS, weight: 400, size: 15, fill: PA.MUTED })}
    ${paFolio(c, "IV")}`,
  closing: (c, { logo, logoAspect, accent: a = PA.GOLD }) => bg(PA.IVORY) + `${paKick(c.date || "Contact", a, c)}
    ${logoMark(logo, PML, 300, 120, logoAspect)}
    ${block(c.company, { x: PML, y: 500, w: PW * 0.8, h: 160, font: SERIF, weight: 400, size: 56, lh: 1.14, fill: PA.ESP })}
    ${line(c.location, { x: PML, y: 700, w: PW, font: SANS, weight: 500, size: 14, fill: PA.MUTED, tracking: 2.6, upper: true })}
    <rect x="${PML}" y="762" width="64" height="1" fill="${a}"/>
    ${c.tickers.slice(0, 3).map(([ex, sym], i) => line(`${ex}  ${sym}`, { x: PML, y: 826 + i * 52, w: PW, font: SERIF, weight: 400, size: 30, fill: i === 0 ? PA.ESP : PA.MUTED })).join("")}
    ${block(c.cta, { x: PML, y: 1020, w: PW * 0.8, h: 110, font: SERIF, weight: 400, size: 32, lh: 1.2, fill: PA.ESP })}
    ${paFolio(c, "V")}`,
};

/* ===================== BLEED — immersive photography =================== */
const BL = { WHITE: "#ffffff", INK: "#101418", SOFT: "rgba(255,255,255,0.74)" };
const blGrad = (id, a, b, c2, d) => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0%" stop-color="#000" stop-opacity="${a}"/><stop offset="34%" stop-color="#000" stop-opacity="${b}"/>
  <stop offset="68%" stop-color="#000" stop-opacity="${c2}"/><stop offset="100%" stop-color="#000" stop-opacity="${d}"/></linearGradient></defs>`;
const blHead = (c, right) => `
  ${line(c.company, { x: 88, y: 132, w: 560, font: SANS, weight: 600, size: 30, fill: BL.WHITE })}
  ${line(right, { x: 620, y: 132, w: 372, font: SANS, weight: 500, size: 17, fill: BL.SOFT, anchor: "end", tracking: 1.4 })}
  ${line(c.eyebrow || "Update", { x: 88, y: 170, w: 560, font: SANS, weight: 700, size: 16, fill: "rgba(255,255,255,0.8)", tracking: 8, upper: true })}`;
const blFoot = (c) => `<rect x="88" y="1126" width="64" height="2" fill="rgba(255,255,255,0.9)"/>
  ${line(c.company, { x: 88, y: 1186, w: 520, font: SANS, weight: 600, size: 21, fill: BL.WHITE })}
  ${line(tickerLine(c.tickers), { x: 620, y: 1186, w: 372, font: SANS, weight: 500, size: 17, fill: BL.SOFT, anchor: "end", tracking: 1.2 })}`;
const blPhoto = (photo, id, g) => `${blGrad(id + "g", ...g)}${img(photo, 0, 0, W, H, id)}<rect x="0" y="0" width="${W}" height="${H}" fill="url(#${id}g)"/>`;

export const bleed = {
  id: "bleed", label: "Bleed", blurb: "Immersive photography", accent: "#ffffff", usesAccent: false,
  announcement: (c, { photo }) => photo
    ? bg("#000") + `${blPhoto(photo, "bl1", [0.46, 0.08, 0.58, 0.92])}${blHead(c, c.date)}
      ${block(c.headline, { x: 88, y: 742, w: 820, h: 330, font: SANS, weight: 300, min: 36, max: 68, lh: 1.12, fill: BL.WHITE })}${blFoot(c)}`
    : bg(BL.INK) + `${blHead(c, c.date)}
      ${block(c.headline, { x: 88, y: 300, w: 904, h: 620, font: SANS, weight: 200, min: 44, max: 92, lh: 1.1, fill: BL.WHITE })}
      <rect x="88" y="1140" width="60" height="1" fill="rgba(255,255,255,0.5)"/>${blFoot(c)}`,
  keyResults: (c, { photo }) => {
    const rows = c.rows.slice(0, photo ? 3 : 4), n = Math.max(1, rows.length);
    const top = 420, pitch = (H - 240 - top) / n;
    const body = rows.map((r, i) => {
      const y = top + i * pitch;
      return `<rect x="88" y="${y}" width="904" height="1" fill="rgba(255,255,255,0.28)"/>
        ${line(r.v, { x: 88, y: y + 96, w: 520, font: SANS, weight: 300, size: 92, fill: BL.WHITE })}
        ${line(r.u, { x: 620, y: y + 72, w: 372, font: SANS, weight: 600, size: 21, fill: BL.WHITE, anchor: "end" })}
        ${line(r.desc, { x: 620, y: y + 106, w: 372, font: SANS, weight: 400, size: 17, fill: BL.SOFT, anchor: "end" })}`;
    }).join("");
    return photo
      ? bg("#000") + `${blPhoto(photo, "bl2", [0.52, 0.3, 0.72, 0.94])}${blHead(c, "Assay highlights")}
        ${line(c.title || "Key Results", { x: 88, y: 282, w: 904, font: SANS, weight: 200, size: 64, fill: BL.WHITE })}${body}${blFoot(c)}`
      : bg(BL.INK) + `${blHead(c, "Assay highlights")}
        ${line(c.title || "Key Results", { x: 88, y: 282, w: 904, font: SANS, weight: 200, size: 64, fill: BL.WHITE })}${body}${blFoot(c)}`;
  },
  context: (c, { photo }) => photo
    ? bg("#000") + `${blPhoto(photo, "bl3", [0.3, 0.05, 0.5, 0.92])}${blHead(c, c.location || "")}
      ${line(c.subject, { x: 88, y: 840, w: 904, font: SANS, weight: 200, size: 60, fill: BL.WHITE })}
      ${line(c.location, { x: 88, y: 888, w: 904, font: SANS, weight: 600, size: 18, fill: BL.SOFT, tracking: 2.4, upper: true })}
      ${block(c.body || c.context, { x: 88, y: 940, w: 790, h: 170, font: SANS, weight: 300, size: 27, lh: 1.46, fill: "rgba(255,255,255,0.92)" })}${blFoot(c)}`
    : bg(BL.INK) + `${blHead(c, c.location || "")}
      ${line(c.subject, { x: 88, y: 420, w: 904, font: SANS, weight: 200, size: 60, fill: BL.WHITE })}
      ${line(c.location, { x: 88, y: 470, w: 904, font: SANS, weight: 600, size: 18, fill: BL.SOFT, tracking: 2.4, upper: true })}
      ${block(c.body || c.context, { x: 88, y: 560, w: 860, h: 300, font: SANS, weight: 300, size: 30, lh: 1.5, fill: "rgba(255,255,255,0.9)" })}${blFoot(c)}`,
  why: (c, { photo }) => photo
    ? bg("#000") + `${blPhoto(photo, "bl4", [0.62, 0.52, 0.72, 0.9])}${blHead(c, "Significance")}
      ${block(c.body || c.takeaway, { x: 88, y: 360, w: 860, h: 560, font: SANS, weight: 300, min: 32, max: 54, lh: 1.42, fill: BL.WHITE })}
      ${line("MineEx provides factual summaries, not investment advice.", { x: 88, y: 1052, w: 904, font: SANS, weight: 500, size: 17, fill: BL.SOFT })}${blFoot(c)}`
    : bg(BL.INK) + `${blHead(c, "Significance")}
      ${block(c.body || c.takeaway, { x: 88, y: 380, w: 880, h: 560, font: SANS, weight: 300, min: 32, max: 56, lh: 1.42, fill: BL.WHITE })}${blFoot(c)}`,
  closing: (c, { photo, logo, logoAspect }) => {
    const body = `${logoMark(logo, 88, 420, 130, logoAspect)}
      ${block(c.company, { x: 88, y: 620, w: 904, h: 120, font: SANS, weight: 200, size: 60, lh: 1.08, fill: BL.WHITE })}
      ${line(c.location, { x: 88, y: 770, w: 904, font: SANS, weight: 600, size: 17, fill: BL.SOFT, tracking: 2.2, upper: true })}
      <rect x="88" y="808" width="904" height="1" fill="rgba(255,255,255,0.3)"/>
      ${c.tickers.slice(0, 3).map(([ex, sym], i) => `
        ${line(ex, { x: 88 + i * 300, y: 862, w: 260, font: SANS, weight: 600, size: 15, fill: BL.SOFT, tracking: 2.4, upper: true })}
        ${line(sym, { x: 88 + i * 300, y: 916, w: 260, font: SANS, weight: 300, size: 42, fill: BL.WHITE })}`).join("")}
      ${block(c.cta, { x: 88, y: 980, w: 820, h: 110, font: SANS, weight: 300, size: 38, lh: 1.16, fill: BL.WHITE })}`;
    return photo
      ? bg("#000") + `${blPhoto(photo, "bl5", [0.5, 0.42, 0.74, 0.96])}${blHead(c, c.date)}${body}${blFoot(c)}`
      : bg(BL.INK) + `${blHead(c, c.date)}${body}${blFoot(c)}`;
  },
};

/* ===================== ATRIUM — architectural minimalism =============== */
/* One vertical axis, enormous air, a single graphite line. Refined for
   thumbnail legibility: the figure and the company name now carry weight,
   so the slide reads in a feed rather than dissolving into its own calm. */
const AT = { BONE: "#e8e6e1", CONCRETE: "#9b9892", GRAPHITE: "#3a3a38", INK: "#1c1c1a" };
const AX = 300;
const atAxis = (marks = []) => `<rect x="${AX}" y="0" width="1" height="${H}" fill="${AT.GRAPHITE}" opacity="0.28"/>
  ${marks.map((y) => `<rect x="${AX}" y="${y}" width="1" height="90" fill="${AT.GRAPHITE}"/>`).join("")}`;
const atHead = (c, sub) => `
  ${line(c.company, { x: AX + 44, y: 198, w: W - AX - 150, font: SANS, weight: 700, size: 34, fill: AT.INK, tracking: 4, upper: true })}
  ${line(sub, { x: AX + 44, y: 242, w: W - AX - 150, font: SANS, weight: 500, size: 15, fill: AT.CONCRETE, tracking: 7, upper: true })}`;
const atFoot = (c) => line(tickerLine(c.tickers), { x: AX + 44, y: H - 120, w: 640, font: SANS, weight: 500, size: 15, fill: AT.CONCRETE, tracking: 2.4 });

export const atrium = {
  id: "atrium", label: "Atrium", blurb: "Architectural minimalism", accent: AT.GRAPHITE, usesAccent: false,
  announcement: (c) => bg(AT.BONE) + `${atAxis([150, 980])}${atHead(c, c.eyebrow || "Announcement")}
    ${block(c.headline, { x: AX + 44, y: 400, w: W - AX - 150, h: 440, font: SANS, weight: 400, min: 36, max: 56, lh: 1.34, fill: AT.INK })}
    ${line(c.project, { x: AX + 44, y: 1018, w: 620, font: SANS, weight: 600, size: 20, fill: AT.INK, tracking: 1.2 })}
    ${line(c.date, { x: AX + 44, y: 1052, w: 620, font: SANS, weight: 400, size: 17, fill: AT.CONCRETE })}${atFoot(c)}`,
  keyResults: (c) => {
    const rows = c.rows.slice(0, 4), n = Math.max(1, rows.length);
    const top = 380, pitch = (H - 220 - top) / n, fig = n === 1 ? 120 : n === 2 ? 92 : 68;
    return bg(AT.BONE) + `${atAxis([150])}${atHead(c, c.title || "Key Results")}
      ${rows.map((r, i) => {
        const y = top + i * pitch + Math.max(0, (pitch - fig - 40) / 2);
        return `<rect x="${AX}" y="${y - 20}" width="1" height="${fig + 20}" fill="${AT.GRAPHITE}" opacity="0.8"/>
          ${line(r.v, { x: AX + 44, y: y + fig * 0.76, w: 360, font: SANS, weight: 400, size: fig, fill: AT.INK })}
          ${line(r.u, { x: AX + 44, y: y + fig * 0.76 + 30, w: 360, font: SANS, weight: 600, size: 14, fill: AT.CONCRETE, tracking: 2.6, upper: true })}
          ${block(r.desc, { x: AX + 430, y: y + 6, w: W - AX - 430 - 110, h: fig + 20, font: SANS, weight: 400, size: 17, lh: 1.42, fill: AT.CONCRETE })}`;
      }).join("")}${atFoot(c)}`;
  },
  context: (c, { photo }) => bg(AT.BONE) + `${atAxis([150])}${atHead(c, c.title || "The Project")}
    ${photo ? `${img(photo, AX + 1, 340, W - AX - 110, 520, "atx")}` : `<rect x="${AX + 1}" y="340" width="${W - AX - 110}" height="520" fill="${AT.GRAPHITE}"/>
      ${block(c.subject, { x: AX + 45, y: 420, w: W - AX - 200, h: 240, font: SANS, weight: 300, size: 52, lh: 1.16, fill: AT.BONE })}`}
    ${line(c.subject, { x: AX + 44, y: 930, w: W - AX - 150, font: SANS, weight: 600, size: 26, fill: AT.INK })}
    ${line(c.location, { x: AX + 44, y: 966, w: W - AX - 150, font: SANS, weight: 500, size: 14, fill: AT.CONCRETE, tracking: 2.6, upper: true })}
    ${block(c.body || c.context, { x: AX + 44, y: 1010, w: W - AX - 150, h: 150, font: SANS, weight: 400, size: 19, lh: 1.5, fill: AT.CONCRETE })}${atFoot(c)}`,
  why: (c) => bg(AT.BONE) + `${atAxis([150, 1000])}${atHead(c, c.title || "Why It Matters")}
    ${block(c.body || c.takeaway, { x: AX + 44, y: 400, w: W - AX - 150, h: 520, font: SANS, weight: 400, min: 30, max: 46, lh: 1.46, fill: AT.INK })}
    ${line("MineEx provides factual summaries, not investment advice.", { x: AX + 44, y: 1046, w: 640, font: SANS, weight: 400, size: 14, fill: AT.CONCRETE })}${atFoot(c)}`,
  closing: (c, { logo, logoAspect }) => bg(AT.BONE) + `${atAxis([150])}${atHead(c, "Contact")}
    ${logoMark(logo, AX + 44, 380, 104, logoAspect)}
    ${line(c.location, { x: AX + 44, y: 584, w: W - AX - 150, font: SANS, weight: 500, size: 14, fill: AT.CONCRETE, tracking: 2.6, upper: true })}
    ${c.tickers.slice(0, 3).map(([ex, sym], i) => `
      ${line(ex, { x: AX + 44, y: 680 + i * 92, w: 160, font: SANS, weight: 500, size: 13, fill: AT.CONCRETE, tracking: 2.4, upper: true })}
      ${line(sym, { x: AX + 200, y: 680 + i * 92, w: 300, font: SANS, weight: 400, size: 34, fill: AT.INK })}`).join("")}
    ${block(c.cta, { x: AX + 44, y: 1000, w: W - AX - 180, h: 100, font: SANS, weight: 400, size: 28, lh: 1.3, fill: AT.INK })}${atFoot(c)}`,
};

/* ===================== SIGNAL — bold contemporary editorial ============ */
/* Scale contrast is the whole idea. The lime bar carries the company name
   at full width. Measures are held inside the page so nothing clips. */
const SG = { CHALK: "#fbfbf9", INK: "#0a0a0a", LIME: "#c8f000" };
const SGM = 64, SGW = W - SGM * 2;
const sgBar = (c, right) => `<rect x="0" y="0" width="${W}" height="128" fill="${SG.LIME}"/>
  ${line(c.company, { x: SGM, y: 84, w: 640, font: SANS, weight: 800, size: 38, fill: SG.INK })}
  ${line(right, { x: 720, y: 84, w: W - 720 - SGM, font: SANS, weight: 700, size: 20, fill: SG.INK, anchor: "end", tracking: 1 })}`;
const sgFoot = (c) => `<rect x="${SGM}" y="${H - 130}" width="${SGW}" height="2" fill="${SG.INK}"/>
  ${line(tickerLine(c.tickers), { x: SGM, y: H - 72, w: SGW, font: SANS, weight: 700, size: 19, fill: SG.INK, tracking: 1.2 })}`;

export const signal = {
  id: "signal", label: "Signal", blurb: "Bold contemporary editorial", accent: SG.LIME, usesAccent: true,
  announcement: (c, { accent: a = SG.LIME }) => bg(SG.CHALK) + `${sgBar(c, c.date).replace(SG.LIME, a)}
    ${line(c.eyebrow || "Announcement", { x: SGM, y: 216, w: 600, font: SANS, weight: 800, size: 20, fill: SG.INK, tracking: 8, upper: true })}
    ${block(c.headline, { x: SGM, y: 258, w: SGW, h: 620, font: SANS, weight: 800, min: 48, max: 98, lh: 0.98, fill: SG.INK })}
    <rect x="${SGM}" y="936" width="${SGW}" height="8" fill="${SG.INK}"/>
    ${line(c.project, { x: SGM, y: 1006, w: SGW, font: SANS, weight: 700, size: 26, fill: SG.INK })}${sgFoot(c)}`,
  keyResults: (c, { accent: a = SG.LIME }) => {
    const rows = c.rows.slice(0, 3), n = Math.max(1, rows.length);
    const top = 190, pitch = (H - 190 - top) / n, fig = n === 1 ? 220 : n === 2 ? 190 : 160;
    return bg(SG.CHALK) + `${sgBar(c, (c.title || "Key Results").toUpperCase()).replace(SG.LIME, a)}
      ${rows.map((r, i) => {
        const y = top + i * pitch;
        return `${i > 0 ? `<rect x="${SGM}" y="${y - 26}" width="${SGW}" height="3" fill="${SG.INK}"/>` : ""}
          ${line(r.v, { x: SGM, y: y + fig * 0.78, w: 660, font: SANS, weight: 800, size: fig, fill: SG.INK })}
          <rect x="${SGM}" y="${y + fig * 0.78 + 20}" width="320" height="34" fill="${a}"/>
          ${line(r.u, { x: SGM + 12, y: y + fig * 0.78 + 45, w: 296, font: SANS, weight: 800, size: 18, fill: SG.INK })}
          ${block(r.desc, { x: SGM + 360, y: y + fig * 0.78 + 14, w: SGW - 360, h: 86, font: SANS, weight: 500, size: 21, lh: 1.3, fill: "#444" })}`;
      }).join("")}${sgFoot(c)}`;
  },
  context: (c, { photo, accent: a = SG.LIME }) => bg(SG.CHALK) + `${sgBar(c, c.location || "").replace(SG.LIME, a)}
    ${photo ? img(photo, 0, 128, W, 620, "sgx") : `<rect x="0" y="128" width="${W}" height="620" fill="${SG.INK}"/>
      ${block(c.subject, { x: SGM, y: 300, w: SGW, h: 280, font: SANS, weight: 800, size: 78, lh: 1.0, fill: SG.CHALK })}`}
    <rect x="${SGM}" y="796" width="${SGW}" height="8" fill="${SG.INK}"/>
    ${line(c.subject, { x: SGM, y: 864, w: SGW, font: SANS, weight: 800, size: 38, fill: SG.INK })}
    ${block(c.body || c.context, { x: SGM, y: 910, w: SGW * 0.86, h: 240, font: SANS, weight: 500, size: 24, lh: 1.42, fill: "#333" })}${sgFoot(c)}`,
  why: (c, { accent: a = SG.LIME }) => bg(SG.CHALK) + `${sgBar(c, "WHY IT MATTERS").replace(SG.LIME, a)}
    <rect x="0" y="128" width="${W}" height="18" fill="${SG.INK}"/>
    ${block(c.body || c.takeaway, { x: SGM, y: 260, w: SGW, h: 700, font: SANS, weight: 700, min: 36, max: 62, lh: 1.14, fill: SG.INK })}
    <rect x="${SGM}" y="1010" width="260" height="34" fill="${a}"/>
    ${line("NOT INVESTMENT ADVICE", { x: SGM + 12, y: 1035, w: 236, font: SANS, weight: 800, size: 15, fill: SG.INK, tracking: 1 })}${sgFoot(c)}`,
  closing: (c, { logo, logoAspect, accent: a = SG.LIME }) => bg(SG.CHALK) + `${sgBar(c, c.date).replace(SG.LIME, a)}
    ${logoMark(logo, SGM, 220, 120, logoAspect)}
    ${block(c.company, { x: SGM, y: 400, w: SGW, h: 180, font: SANS, weight: 800, size: 76, lh: 1.0, fill: SG.INK })}
    ${line(c.location, { x: SGM, y: 626, w: SGW, font: SANS, weight: 700, size: 18, fill: "#555", tracking: 2, upper: true })}
    ${c.tickers.slice(0, 3).map(([ex, sym], i) => `
      <rect x="${SGM + i * 320}" y="690" width="296" height="120" fill="${i === 0 ? a : SG.INK}"/>
      ${line(ex, { x: SGM + 16 + i * 320, y: 732, w: 264, font: SANS, weight: 800, size: 15, fill: i === 0 ? SG.INK : SG.CHALK, tracking: 2 })}
      ${line(sym, { x: SGM + 16 + i * 320, y: 788, w: 264, font: SANS, weight: 800, size: 42, fill: i === 0 ? SG.INK : SG.CHALK })}`).join("")}
    ${block(c.cta, { x: SGM, y: 870, w: SGW * 0.84, h: 140, font: SANS, weight: 800, size: 42, lh: 1.08, fill: SG.INK })}${sgFoot(c)}`,
};


/* ===================== FIELDBOOK — scientific field documentation ====== */
/* A ruled page with a stamped identification block. The company name is the
   stamp: boxed under "ISSUED BY", the way a sample tag carries its origin. */
const FB = { KRAFT: "#d9d2c2", RULE: "#b8ae99", GRAPHITE: "#33312c", OXIDE: "#8c3b2e", FADE: "#6f6757" };
const fbRules = (from, to) => Array.from({ length: Math.max(0, Math.floor((to - from) / 44)) }, (_, i) =>
  `<rect x="72" y="${from + i * 44}" width="${W - 144}" height="1" fill="${FB.RULE}" opacity="0.55"/>`).join("");
const fbStamp = (c, rightLabel, rightValue, acc) => `
  <rect x="72" y="0" width="2" height="${H}" fill="${acc}" opacity="0.4"/>
  <rect x="72" y="96" width="640" height="118" fill="none" stroke="${FB.GRAPHITE}" stroke-width="2"/>
  <rect x="72" y="96" width="640" height="30" fill="${FB.GRAPHITE}"/>
  ${line("ISSUED BY", { x: 86, y: 118, w: 300, font: MONO, weight: 600, size: 14, fill: FB.KRAFT, tracking: 3.6 })}
  ${line(c.company, { x: 86, y: 182, w: 612, font: SANS, weight: 700, size: 34, fill: FB.GRAPHITE })}
  <rect x="740" y="96" width="268" height="118" fill="none" stroke="${FB.GRAPHITE}" stroke-width="2"/>
  ${line(rightLabel, { x: 754, y: 128, w: 240, font: MONO, weight: 600, size: 14, fill: FB.FADE, tracking: 3.6 })}
  ${line(rightValue, { x: 754, y: 180, w: 240, font: MONO, weight: 600, size: 26, fill: FB.GRAPHITE })}`;
const fbFoot = (c) => `<rect x="72" y="1200" width="${W - 144}" height="2" fill="${FB.GRAPHITE}"/>
  ${line(c.project, { x: 72, y: 1250, w: 600, font: MONO, weight: 600, size: 18, fill: FB.GRAPHITE, tracking: 1 })}
  ${line(tickerLine(c.tickers), { x: 700, y: 1250, w: 308, font: MONO, weight: 500, size: 15, fill: FB.FADE, anchor: "end", tracking: 1 })}`;

export const fieldbook = {
  id: "fieldbook", label: "Fieldbook", blurb: "Scientific field documentation", accent: FB.OXIDE, usesAccent: true,
  announcement: (c, { accent: a = FB.OXIDE }) => bg(FB.KRAFT) + `${fbRules(300, 1180)}${fbStamp(c, "DATE", c.date || "", a)}
    ${line(c.eyebrow || "Announcement", { x: 72, y: 272, w: 600, font: MONO, weight: 600, size: 16, fill: a, tracking: 5, upper: true })}
    ${block(c.headline, { x: 88, y: 318, w: W - 176, h: 420, font: SERIF, weight: 400, min: 34, max: 52, lh: 1.63, fill: FB.GRAPHITE })}${fbFoot(c)}`,
  keyResults: (c, { accent: a = FB.OXIDE }) => {
    const rows = c.rows.slice(0, 4), n = Math.max(1, rows.length);
    const top = 400, pitch = (H - 230 - top) / n, fig = n <= 2 ? 72 : 56;
    return bg(FB.KRAFT) + `${fbStamp(c, "ASSAY", `n = ${n}`, a)}
      <rect x="72" y="282" width="${W - 144}" height="2" fill="${FB.GRAPHITE}"/>
      ${line("VALUE", { x: 92, y: 322, w: 300, font: MONO, weight: 600, size: 14, fill: FB.FADE, tracking: 3.4 })}
      ${line("UNIT", { x: 420, y: 322, w: 240, font: MONO, weight: 600, size: 14, fill: FB.FADE, tracking: 3.4 })}
      ${line("NOTE", { x: 680, y: 322, w: 328, font: MONO, weight: 600, size: 14, fill: FB.FADE, tracking: 3.4 })}
      <rect x="72" y="342" width="${W - 144}" height="1" fill="${FB.RULE}"/>
      ${rows.map((r, i) => {
        const y = top + i * pitch;
        return `<rect x="72" y="${y + pitch - 40}" width="${W - 144}" height="1" fill="${FB.RULE}"/>
          <rect x="72" y="${y - 26}" width="14" height="14" fill="${a}"/>
          ${line(r.v, { x: 92, y: y + fig * 0.76, w: 310, font: MONO, weight: 600, size: fig, fill: FB.GRAPHITE })}
          ${line(r.u, { x: 420, y: y + fig * 0.6, w: 240, font: MONO, weight: 500, size: 19, fill: a })}
          ${block(r.desc, { x: 680, y: y + 4, w: 328, h: pitch - 70, font: SERIF, weight: 400, size: 19, lh: 1.42, fill: FB.FADE })}`;
      }).join("")}${fbFoot(c)}`;
  },
  context: (c, { photo, accent: a = FB.OXIDE }) => bg(FB.KRAFT) + `${fbStamp(c, "SITE", "01", a)}
    ${photo ? `${img(photo, 104, 282, W - 208, 440, "fbx")}<rect x="104" y="282" width="${W - 208}" height="440" fill="none" stroke="${FB.GRAPHITE}" stroke-width="2"/>`
      : `${fbRules(300, 700)}${block(c.subject, { x: 104, y: 330, w: W - 240, h: 260, font: SERIF, weight: 400, size: 54, lh: 1.5, fill: FB.GRAPHITE })}`}
    ${line("SPECIMEN", { x: 104, y: 766, w: 300, font: MONO, weight: 600, size: 14, fill: FB.FADE, tracking: 3.4 })}
    ${line(c.subject, { x: 104, y: 818, w: W - 208, font: SANS, weight: 700, size: 34, fill: FB.GRAPHITE })}
    ${line(c.location, { x: 104, y: 854, w: W - 208, font: MONO, weight: 500, size: 16, fill: a, tracking: 1.4, upper: true })}
    <rect x="104" y="888" width="${W - 208}" height="1" fill="${FB.RULE}"/>
    ${block(c.body || c.context, { x: 104, y: 920, w: W - 240, h: 240, font: SERIF, weight: 400, size: 21, lh: 1.6, fill: FB.FADE })}${fbFoot(c)}`,
  why: (c, { accent: a = FB.OXIDE }) => bg(FB.KRAFT) + `${fbRules(330, 1000)}${fbStamp(c, "NOTE", "A", a)}
    ${line("INTERPRETATION", { x: 72, y: 272, w: 600, font: MONO, weight: 600, size: 16, fill: a, tracking: 5 })}
    ${block(c.body || c.takeaway, { x: 88, y: 352, w: W - 176, h: 600, font: SERIF, weight: 400, min: 30, max: 46, lh: 1.72, fill: FB.GRAPHITE })}
    ${line("MineEx provides factual summaries, not investment advice.", { x: 88, y: 1060, w: 700, font: MONO, weight: 500, size: 15, fill: FB.FADE })}${fbFoot(c)}`,
  closing: (c, { logo, logoAspect, accent: a = FB.OXIDE }) => bg(FB.KRAFT) + `${fbStamp(c, "REF", c.date || "", a)}
    ${logoMark(logo, 104, 300, 108, logoAspect)}
    ${line(c.location, { x: 104, y: 490, w: W - 208, font: MONO, weight: 500, size: 16, fill: FB.FADE, tracking: 1.6, upper: true })}
    <rect x="104" y="530" width="${W - 208}" height="2" fill="${FB.GRAPHITE}"/>
    ${c.tickers.slice(0, 3).map(([ex, sym], i) => `
      <rect x="${104 + i * 290}" y="572" width="268" height="112" fill="none" stroke="${FB.GRAPHITE}" stroke-width="2"/>
      ${line(ex, { x: 120 + i * 290, y: 610, w: 236, font: MONO, weight: 600, size: 13, fill: FB.FADE, tracking: 2.6 })}
      ${line(sym, { x: 120 + i * 290, y: 662, w: 236, font: MONO, weight: 600, size: 34, fill: a })}`).join("")}
    ${block(c.cta, { x: 104, y: 760, w: W - 280, h: 120, font: SERIF, weight: 400, size: 32, lh: 1.5, fill: FB.GRAPHITE })}
    ${block(c.url, { x: 104, y: 920, w: W - 208, h: 70, font: MONO, weight: 500, size: 16, lh: 1.4, fill: FB.FADE })}${fbFoot(c)}`,
};

/* ===================== MERIDIAN — premium corporate ==================== */
/* Horizontal bands and a generous lockup. The company name sits in sand on
   a deep teal band -- the first thing read on every slide. */
const MR = { TEAL: "#0d3b3f", SAND: "#e4d9c8", BRASS: "#b89355", DEEP: "#07282b", MUTED: "#7d9497", BODY: "#5d6f71" };
const mrBand = (c, sub, acc) => `<rect x="0" y="0" width="${W}" height="258" fill="${MR.TEAL}"/>
  <rect x="0" y="258" width="${W}" height="4" fill="${acc}"/>
  ${line(c.company, { x: 88, y: 150, w: 904, font: SERIF, weight: 600, size: 46, fill: MR.SAND })}
  ${line(sub, { x: 88, y: 196, w: 904, font: SANS, weight: 500, size: 16, fill: MR.MUTED, tracking: 3, upper: true })}`;
const mrFoot = (c) => `<rect x="0" y="${H - 128}" width="${W}" height="128" fill="${MR.TEAL}"/>
  ${line(tickerLine(c.tickers), { x: 88, y: H - 58, w: 904, font: SANS, weight: 600, size: 19, fill: MR.SAND, tracking: 1.6 })}`;

export const meridian = {
  id: "meridian", label: "Meridian", blurb: "Premium corporate presentation", accent: MR.BRASS, usesAccent: true,
  announcement: (c, { accent: a = MR.BRASS }) => bg(MR.SAND) + `${mrBand(c, c.location || c.eyebrow || "", a)}
    ${line(c.eyebrow || "Announcement", { x: 88, y: 348, w: 600, font: SANS, weight: 600, size: 16, fill: a, tracking: 7, upper: true })}
    ${block(c.headline, { x: 88, y: 392, w: 880, h: 420, font: SERIF, weight: 400, min: 36, max: 62, lh: 1.24, fill: MR.DEEP })}
    <rect x="88" y="900" width="120" height="3" fill="${a}"/>
    ${line(c.project, { x: 88, y: 964, w: 880, font: SANS, weight: 600, size: 24, fill: MR.DEEP })}
    ${line(c.date, { x: 88, y: 1000, w: 880, font: SANS, weight: 400, size: 19, fill: MR.BODY })}${mrFoot(c)}`,
  keyResults: (c, { accent: a = MR.BRASS }) => {
    const rows = c.rows.slice(0, 4), n = Math.max(1, rows.length);
    const top = 330, pitch = (H - 200 - top) / n, fig = n === 1 ? 132 : n === 2 ? 108 : 84;
    return bg(MR.SAND) + `${mrBand(c, c.title || "Key Results", a)}
      ${rows.map((r, i) => {
        const y = top + i * pitch + Math.max(0, (pitch - fig - 50) / 2);
        return `${i > 0 ? `<rect x="88" y="${top + i * pitch - 20}" width="904" height="1" fill="#c9bda8"/>` : ""}
          ${line(r.v, { x: 88, y: y + fig * 0.78, w: 440, font: SERIF, weight: 600, size: fig, fill: MR.TEAL })}
          ${line(r.u, { x: 88, y: y + fig * 0.78 + 34, w: 440, font: SANS, weight: 600, size: 16, fill: a, tracking: 2.2, upper: true })}
          ${block(r.desc, { x: 560, y: y + fig * 0.3, w: 432, h: fig + 20, font: SANS, weight: 400, size: 21, lh: 1.38, fill: MR.BODY })}`;
      }).join("")}${mrFoot(c)}`;
  },
  context: (c, { photo, accent: a = MR.BRASS }) => bg(MR.SAND) + `${mrBand(c, c.title || "The Project", a)}
    ${photo ? img(photo, 0, 262, W, 500, "mrx") : `<rect x="0" y="262" width="${W}" height="500" fill="${MR.DEEP}"/>
      ${block(c.subject, { x: 88, y: 380, w: 880, h: 260, font: SERIF, weight: 400, size: 58, lh: 1.18, fill: MR.SAND })}`}
    ${line(c.subject, { x: 88, y: 840, w: 880, font: SERIF, weight: 600, size: 40, fill: MR.DEEP })}
    ${line(c.location, { x: 88, y: 880, w: 880, font: SANS, weight: 500, size: 16, fill: a, tracking: 2.4, upper: true })}
    <rect x="88" y="912" width="120" height="3" fill="${a}"/>
    ${block(c.body || c.context, { x: 88, y: 950, w: 880, h: 230, font: SANS, weight: 400, size: 22, lh: 1.46, fill: MR.BODY })}${mrFoot(c)}`,
  why: (c, { accent: a = MR.BRASS }) => bg(MR.SAND) + `${mrBand(c, c.title || "Why It Matters", a)}
    ${block(c.body || c.takeaway, { x: 88, y: 400, w: 880, h: 560, font: SERIF, weight: 400, min: 32, max: 52, lh: 1.44, fill: MR.DEEP })}
    <rect x="88" y="1020" width="120" height="3" fill="${a}"/>
    ${line("MineEx provides factual summaries, not investment advice.", { x: 88, y: 1076, w: 880, font: SANS, weight: 400, size: 16, fill: MR.BODY })}${mrFoot(c)}`,
  closing: (c, { logo, logoAspect, accent: a = MR.BRASS }) => bg(MR.SAND) + `${mrBand(c, "Contact", a)}
    ${logoMark(logo, 88, 330, 112, logoAspect)}
    ${block(c.company, { x: 88, y: 500, w: 880, h: 140, font: SERIF, weight: 600, size: 52, lh: 1.12, fill: MR.DEEP })}
    ${line(c.location, { x: 88, y: 672, w: 880, font: SANS, weight: 500, size: 16, fill: MR.BODY, tracking: 2.4, upper: true })}
    <rect x="88" y="716" width="904" height="1" fill="#c9bda8"/>
    ${c.tickers.slice(0, 3).map(([ex, sym], i) => `
      ${line(ex, { x: 88 + i * 300, y: 772, w: 270, font: SANS, weight: 600, size: 14, fill: MR.BODY, tracking: 2.4, upper: true })}
      ${line(sym, { x: 88 + i * 300, y: 826, w: 270, font: SERIF, weight: 600, size: 40, fill: MR.TEAL })}`).join("")}
    ${block(c.cta, { x: 88, y: 910, w: 820, h: 120, font: SERIF, weight: 400, size: 34, lh: 1.26, fill: MR.DEEP })}
    ${block(c.url, { x: 88, y: 1060, w: 880, h: 70, font: SANS, weight: 400, size: 17, lh: 1.3, fill: MR.BODY })}${mrFoot(c)}`,
};

/* ===================== INTERCHANGEABLE COMPOSITIONS ====================
   Added only where a second arrangement genuinely says something different.
   A family's canonical composition stays `fam[kind]`; variants are listed
   beside it, so a saved draft with no variant chosen renders exactly as it
   always did. No filler: several kinds have one good answer and keep it. */

const obChrome2 = (c, right, a) => `
  ${line(c.company, { x: 96, y: 118, w: 560, font: SANS, weight: 600, size: 30, fill: OB.BONE })}
  ${line(right, { x: 620, y: 118, w: 364, font: MONO, weight: 500, size: 17, fill: OB.DIM, anchor: "end", tracking: 1.5 })}
  <rect x="96" y="146" width="888" height="1" fill="${a}" opacity="0.5"/>
  <rect x="96" y="1168" width="46" height="2" fill="${a}"/>
  ${line(c.project, { x: 96, y: 1218, w: 520, font: SANS, weight: 500, size: 22, fill: OB.BONE })}
  ${line(tickerLine(c.tickers), { x: 600, y: 1218, w: 384, font: MONO, weight: 500, size: 16, fill: OB.DIM, anchor: "end", tracking: 1 })}`;

export const VARIANTS = {
  obsidian: {
    keyResults: [
      { id: "dominant", label: "Dominant figure", fn: (c, { accent: a = OB.COPPER }) => {
        const hero = c.rows[0], rest = c.rows.slice(1, 4);
        if (!hero) return obsidian.keyResults(c, { accent: a });
        return bg(OB.BLACK) + `<rect x="0" y="0" width="${W}" height="760" fill="${OB.GRAPHITE}"/>
          <rect x="0" y="760" width="${W}" height="1" fill="${a}" opacity="0.6"/>${obChrome2(c, "Primary intercept", a)}
          ${line(hero.v, { x: 96, y: 520, w: 888, font: SANS, weight: 800, size: 250, fill: OB.BONE })}
          ${line(hero.u, { x: 96, y: 592, w: 560, font: MONO, weight: 600, size: 28, fill: a, tracking: 1.6 })}
          ${line(hero.desc, { x: 96, y: 648, w: 888, font: MONO, weight: 500, size: 20, fill: OB.DIM })}
          ${rest.map((r, i) => { const y = 860 + i * 92;
            return `${line(`${r.v}  ${r.u}`, { x: 96, y, w: 520, font: SANS, weight: 500, size: 30, fill: OB.BONE })}
              ${line(r.desc, { x: 600, y, w: 384, font: MONO, weight: 500, size: 16, fill: OB.DIM, anchor: "end" })}
              <rect x="96" y="${y + 26}" width="888" height="1" fill="#242a33"/>`; }).join("")}`;
      } },
      { id: "asymmetric", label: "Asymmetric", fn: (c, { accent: a = OB.COPPER }) => {
        const rows = c.rows.slice(0, 4);
        return bg(OB.BLACK) + `${obChrome2(c, "Assay highlights", a)}
          ${line(c.title || "Key Results", { x: 96, y: 250, w: 888, font: SANS, weight: 200, size: 66, fill: OB.BONE })}
          ${rows.map((r, i) => { const x = 96 + i * 104, y = 360 + i * 200;
            return `<rect x="${x}" y="${y - 38}" width="${888 - i * 104}" height="1" fill="${a}" opacity="${0.5 - i * 0.1}"/>
              ${line(r.v, { x, y: y + 72, w: 500, font: SANS, weight: 700, size: 104 - i * 12, fill: i === 0 ? a : OB.BONE })}
              ${line(r.u, { x, y: y + 106, w: 420, font: MONO, weight: 600, size: 18, fill: OB.DIM, tracking: 1.2 })}
              ${line(r.desc, { x: x + 420, y: y + 48, w: 984 - x - 324, font: MONO, weight: 500, size: 16, fill: OB.DIM })}`; }).join("")}`;
      } },
    ],
  },
  broadsheet: {
    keyResults: [
      { id: "lead", label: "Lead figure", fn: (c) => {
        const hero = c.rows[0], rest = c.rows.slice(1, 4);
        if (!hero) return broadsheet.keyResults(c, {});
        return bg(BS.PAPER) + `${bsMast(c, "Drill results", "§ 02 · Key Results")}
          ${line(c.title || "Key Results", { x: BM, y: 258, w: BW, font: SERIF, weight: 700, size: 50, fill: BS.INK })}
          <rect x="${BM}" y="294" width="${BW}" height="3" fill="${BS.INK}"/>
          ${line(hero.v, { x: BM, y: 470, w: BW, font: SERIF, weight: 700, size: 180, fill: BS.NAVY })}
          ${line(hero.u, { x: BM, y: 516, w: BW, font: SANS, weight: 600, size: 20, fill: BS.GREY, tracking: 1.4, upper: true })}
          ${block(hero.desc, { x: BM, y: 556, w: BW * 0.72, h: 110, font: SERIF, weight: 400, size: 30, lh: 1.34, fill: BS.INK })}
          <rect x="${BM}" y="700" width="${BW}" height="1" fill="${BS.RULE}"/>
          ${rest.map((r, i) => { const y = 740 + i * 128;
            return `${i > 0 ? `<rect x="${BM}" y="${y - 28}" width="${BW}" height="1" fill="${BS.HAIR}"/>` : ""}
              ${line(r.v, { x: BM, y: y + 48, w: 300, font: SERIF, weight: 700, size: 54, fill: BS.NAVY })}
              ${line(r.u, { x: BM + 320, y: y + 48, w: 240, font: SANS, weight: 600, size: 15, fill: BS.GREY, tracking: 1.2, upper: true })}
              ${block(r.desc, { x: bcol(2) - 14, y: y + 12, w: BW / 3, h: 90, font: SERIF, weight: 400, size: 21, lh: 1.32, fill: BS.INK })}`; }).join("")}
          ${bsFoot(c)}`;
      } },
    ],
  },
  meridian: {
    keyResults: [
      { id: "band", label: "Banded figure", fn: (c, { accent: a = MR.BRASS }) => {
        const hero = c.rows[0], rest = c.rows.slice(1, 3);
        if (!hero) return meridian.keyResults(c, { accent: a });
        return bg(MR.SAND) + `${mrBand(c, c.title || "Key Results", a)}
          <rect x="0" y="262" width="${W}" height="420" fill="${MR.DEEP}"/>
          ${line(hero.v, { x: 88, y: 520, w: 904, font: SERIF, weight: 600, size: 168, fill: MR.SAND })}
          ${line(hero.u, { x: 88, y: 572, w: 904, font: SANS, weight: 600, size: 20, fill: a, tracking: 2.4, upper: true })}
          ${line(hero.desc, { x: 88, y: 628, w: 904, font: SANS, weight: 400, size: 21, fill: MR.MUTED })}
          ${rest.map((r, i) => { const y = 760 + i * 190;
            return `${i > 0 ? `<rect x="88" y="${y - 40}" width="904" height="1" fill="#c9bda8"/>` : ""}
              ${line(r.v, { x: 88, y: y + 70, w: 420, font: SERIF, weight: 600, size: 76, fill: MR.TEAL })}
              ${line(r.u, { x: 88, y: y + 104, w: 420, font: SANS, weight: 600, size: 15, fill: a, tracking: 2.2, upper: true })}
              ${block(r.desc, { x: 560, y: y + 24, w: 432, h: 110, font: SANS, weight: 400, size: 20, lh: 1.38, fill: MR.BODY })}`; }).join("")}
          ${mrFoot(c)}`;
      } },
    ],
  },
};

/** Every composition available for a family's slide kind: the canonical one
 *  first, then its variants. `slide.layout` selects by id; empty = canonical. */
export function compositionsOf(familyId, kind) {
  const fam = PREMIUM[`${familyId}`.replace(/^premium:/, "")];
  if (!fam || !fam[kind]) return [];
  const base = [{ id: "", label: "Default", fn: fam[kind] }];
  const extra = ((VARIANTS[fam.id] || {})[kind] || []).map((v) => ({ ...v }));
  return base.concat(extra);
}
export const compositionFor = (familyId, kind, layoutId) => {
  const all = compositionsOf(familyId, kind);
  return all.find((x) => x.id === (layoutId || "")) || all[0] || null;
};

/* ---------------------------------------------------------------------- */
export const PREMIUM = { broadsheet, obsidian, grid, core, paper, bleed, atrium, signal, fieldbook, meridian };
export const PREMIUM_IDS = Object.keys(PREMIUM);
export const isPremium = (id) => Object.prototype.hasOwnProperty.call(PREMIUM, `${id}`.replace(/^premium:/, "")) && /^premium:/.test(`${id}`);
export const premiumKey = (id) => `${id}`.replace(/^premium:/, "");
