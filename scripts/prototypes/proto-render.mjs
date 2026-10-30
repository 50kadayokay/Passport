// DESIGN PROTOTYPES — six announcement slides, six different design studios.
//   npx vite-node scripts/prototypes/proto-render.mjs
//
// Isolated on purpose. Nothing here imports or alters the production carousel
// templates; the only shared code is text MEASUREMENT, because measuring a
// glyph is not a design decision. Each family below is composed by hand: its
// own palette, its own type pairing, its own geometry, its own way of handling
// photography and figures. They deliberately do not share a layout engine.

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { fitText, wrapText, measure } from "../../src/portal/publish/carousel/textEngine.js";

const W = 1080, H = 1350;
const OUT = path.join(process.env.HOME, "Desktop", "MineEx-Design-Prototypes");
fs.mkdirSync(OUT, { recursive: true });

/* ---------------- the release (unchanged, factual) ---------------- */
const R = {
  eyebrow: "Discovery",
  headline: "Kingsmen Resources Intersects 1,742 g/t Silver Equivalent over 0.7 Metres in Its First Drill Program at Las Coloradas",
  project: "Las Coloradas Silver-Gold Project",
  date: "9 October 2026",
  dateISO: "2026-10-09",
  company: "Kingsmen Resources Ltd.",
  tickers: "TSXV KNG · OTCQB KNGRF · FSE TUY",
  figure: "1,742",
  unit: "g/t AgEq",
  qualifier: "over 0.70 m, hole LC-25-010",
};

/* ---------------- type stacks ---------------- */
const SERIF = "'Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif";
const SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif";
const MONO = "'SF Mono','Roboto Mono',Menlo,Consolas,monospace";
const stackKey = (f) => (/Palatino|Georgia|Iowan/.test(f) ? "serif" : /Mono|Menlo|Consolas/.test(f) ? "mono" : "sans");

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** Fitted multi-line text as raw SVG. */
function block(text, { x, y, w, h, font, weight = 400, size, min = 20, max, lh = 1.1, fill, anchor = "start", tracking = 0, upper = false }) {
  const stack = stackKey(font);
  const body = upper ? String(text).toUpperCase() : String(text);
  const fit = size
    ? { size, lines: wrapText(body, { size, width: w, stack, weight }).lines }
    : fitText(body, { width: w, height: h, min, max: max || 120, stack, weight, lh });
  const fs2 = fit.size;
  const ax = anchor === "middle" ? x + w / 2 : anchor === "end" ? x + w : x;
  return fit.lines.map((ln, i) =>
    `<text x="${ax}" y="${y + fs2 * 0.74 + i * fs2 * lh}" fill="${fill}" text-anchor="${anchor}" font-family="${font}" font-size="${fs2}" font-weight="${weight}"${tracking ? ` letter-spacing="${tracking}"` : ""}>${esc(ln)}</text>`
  ).join("");
}

/** One line, shrunk if it would overrun. */
function line(text, { x, y, w, font, weight = 400, size, fill, anchor = "start", tracking = 0, upper = false }) {
  const s = String(text == null ? "" : text).trim();
  if (!s) return "";
  const body = upper ? s.toUpperCase() : s;
  const stack = stackKey(font);
  const nat = measure(body, size, { stack, weight }) + tracking * body.length;
  const fs2 = nat > w ? Math.max(10, Math.floor(size * (w / nat))) : size;
  const ax = anchor === "middle" ? x + w / 2 : anchor === "end" ? x + w : x;
  return `<text x="${ax}" y="${y}" fill="${fill}" text-anchor="${anchor}" font-family="${font}" font-size="${fs2}" font-weight="${weight}"${tracking ? ` letter-spacing="${tracking}"` : ""}>${esc(body)}</text>`;
}

const svg = (inner, bg) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${bg}"/>${inner}</svg>`;

/* =======================================================================
   1. BROADSHEET — financial editorial
   A masthead, a rule, a deck, a column. Serif throughout, navy used as ink
   rather than decoration. The whitespace is the design.
   ======================================================================= */
const broadsheet = () => {
  const INK = "#14171c", NAVY = "#1b2a4a", RULE = "#c9ccd3", PAPER = "#ffffff";
  const M = 92, w = W - M * 2;
  return svg(`
    ${line(R.company, { x: M, y: 92, w, font: SERIF, weight: 600, size: 27, fill: INK, tracking: 0.6 })}
    ${line(R.date, { x: M, y: 92, w, font: SERIF, weight: 400, size: 24, fill: "#6b7280", anchor: "end" })}
    <rect x="${M}" y="116" width="${w}" height="3" fill="${INK}"/>
    <rect x="${M}" y="124" width="${w}" height="1" fill="${RULE}"/>

    ${line(R.eyebrow, { x: M, y: 206, w, font: SANS, weight: 700, size: 20, fill: NAVY, tracking: 6.5, upper: true })}

    ${block(R.headline, { x: M, y: 246, w, h: 560, font: SERIF, weight: 600, min: 46, max: 84, lh: 1.07, fill: INK })}

    <rect x="${M}" y="880" width="110" height="1" fill="${INK}"/>
    ${block("The first six holes of the autumn programme returned 31.4 metres at 4.8 g/t gold, including 2.1 metres at 46.2 g/t.",
      { x: M, y: 912, w: w * 0.62, h: 190, font: SERIF, weight: 400, size: 30, lh: 1.42, fill: "#3d4450" })}

    <rect x="${M}" y="1150" width="${w}" height="1" fill="${RULE}"/>
    ${line(R.project, { x: M, y: 1198, w: w * 0.54, font: SERIF, weight: 600, size: 25, fill: INK })}
    ${line(R.tickers, { x: M + w * 0.56, y: 1198, w: w * 0.44, font: SANS, weight: 600, size: 18, fill: NAVY, anchor: "end", tracking: 1.1 })}
  `, PAPER);
};

/* =======================================================================
   2. OBSIDIAN — cinematic luxury
   Near-black ground, copper hairlines, a monumental figure that the headline
   answers to. No blue anywhere. Letterspaced caps carry the small type.
   ======================================================================= */
const obsidian = () => {
  const BLACK = "#06080b", GRAPHITE = "#1a1f26", COPPER = "#c98b45", BONE = "#f2ece3";
  const M = 96, w = W - M * 2;
  return svg(`
    <rect x="0" y="0" width="${W}" height="${H}" fill="${BLACK}"/>
    <rect x="0" y="0" width="${W}" height="420" fill="${GRAPHITE}"/>
    <rect x="0" y="420" width="${W}" height="1" fill="${COPPER}" opacity="0.55"/>

    ${line(R.eyebrow, { x: M, y: 120, w, font: SANS, weight: 700, size: 19, fill: COPPER, tracking: 9, upper: true })}
    ${line(R.date, { x: M, y: 120, w, font: MONO, weight: 500, size: 19, fill: "#6d7681", anchor: "end", tracking: 1.5 })}

    <!-- the figure is the subject; its unit hangs off a copper rule -->
    ${line(R.figure, { x: M, y: 330, w, font: SANS, weight: 800, size: 186, fill: BONE })}
    <rect x="${M}" y="356" width="${w}" height="1" fill="${COPPER}" opacity="0.4"/>
    ${line(R.unit + "   ·   " + R.qualifier, { x: M, y: 392, w, font: MONO, weight: 500, size: 21, fill: COPPER, tracking: 1.6 })}

    ${block(R.headline, { x: M, y: 500, w: w * 0.94, h: 520, font: SANS, weight: 300, min: 44, max: 70, lh: 1.16, fill: BONE })}

    <rect x="${M}" y="1168" width="46" height="2" fill="${COPPER}"/>
    ${line(R.company, { x: M, y: 1218, w, font: SANS, weight: 500, size: 25, fill: BONE, tracking: 1.4 })}
    ${line(R.tickers, { x: M, y: 1256, w, font: MONO, weight: 500, size: 18, fill: "#79828d", tracking: 1.2 })}
  `, BLACK);
};

/* =======================================================================
   3. GRID — Swiss modernist
   Asymmetric column structure, a black field, red-orange as the single
   disruptive element. Everything flush left, nothing centred, type set tight.
   ======================================================================= */
const grid = () => {
  const PAPER = "#efeee9", BLACK = "#101010", RED = "#e8431f";
  const col = (n) => 60 + n * ((W - 120) / 12);
  return svg(`
    <!-- visible structure -->
    ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => `<rect x="${col(i)}" y="0" width="1" height="${H}" fill="${BLACK}" opacity="0.08"/>`).join("")}

    <rect x="0" y="0" width="${W}" height="196" fill="${BLACK}"/>
    ${line(R.eyebrow, { x: col(0), y: 118, w: 600, font: SANS, weight: 800, size: 22, fill: PAPER, tracking: 10, upper: true })}
    ${line(R.dateISO, { x: col(8), y: 118, w: col(12) - col(8), font: SANS, weight: 500, size: 22, fill: "#9a9a9a", anchor: "end", tracking: 1 })}

    <rect x="${col(0)}" y="258" width="${col(4) - col(0) - 28}" height="${col(4) - col(0) - 28}" fill="${RED}"/>
    ${line(R.figure, { x: col(0) + 22, y: 420, w: col(4) - col(0) - 70, font: SANS, weight: 800, size: 86, fill: PAPER })}
    ${line(R.unit, { x: col(0) + 22, y: 462, w: col(4) - col(0) - 70, font: SANS, weight: 700, size: 21, fill: PAPER, tracking: 1.4 })}

    ${block(R.headline, { x: col(4), y: 258, w: col(12) - col(4), h: 420, font: SANS, weight: 700, min: 36, max: 58, lh: 1.08, fill: BLACK })}

    <rect x="${col(0)}" y="760" width="${W - 120}" height="4" fill="${BLACK}"/>
    ${block("The first six holes of the autumn programme returned 31.4 metres at 4.8 g/t gold, including 2.1 metres at 46.2 g/t, and two further mineralised intercepts along strike and at depth.",
      { x: col(0), y: 800, w: col(7) - col(0) - 24, h: 260, font: SANS, weight: 400, size: 27, lh: 1.46, fill: "#2b2b2b" })}
    ${line(R.qualifier, { x: col(7), y: 826, w: col(12) - col(7), font: SANS, weight: 700, size: 20, fill: RED, tracking: 0.8, upper: true })}

    <rect x="0" y="${H - 148}" width="${W}" height="148" fill="${BLACK}"/>
    ${line(R.company, { x: col(0), y: H - 86, w: 620, font: SANS, weight: 700, size: 26, fill: PAPER, tracking: 0.4 })}
    ${line(R.tickers, { x: col(6), y: H - 86, w: col(12) - col(6), font: SANS, weight: 500, size: 19, fill: RED, anchor: "end", tracking: 1.2 })}
  `, PAPER);
};

/* =======================================================================
   4. CORE — technical intelligence
   A readout, not a poster. Midnight ground, steel rules, cyan as signal.
   Registration marks, a measured scale and monospaced annotation. Every value
   shown is one the release disclosed; the scale is unlabelled because
   inventing depths would be inventing geology.
   ======================================================================= */
const core = () => {
  const MID = "#0a1724", STEEL = "#8fa6b8", CYAN = "#2fd3e3", WHITE = "#eef5f9", PANEL = "#0f2234";
  const M = 84, w = W - M * 2;
  const tick = (y, long) => `<rect x="${M}" y="${y}" width="${long ? 34 : 18}" height="1.5" fill="${STEEL}" opacity="${long ? 0.9 : 0.45}"/>`;
  const ticks = Array.from({ length: 19 }, (_, i) => tick(470 + i * 26, i % 4 === 0)).join("");
  const reg = (x, y) => `<g opacity="0.55"><rect x="${x - 11}" y="${y}" width="22" height="1" fill="${CYAN}"/><rect x="${x}" y="${y - 11}" width="1" height="22" fill="${CYAN}"/></g>`;
  return svg(`
    ${reg(M, 72)} ${reg(W - M, 72)} ${reg(M, H - 72)} ${reg(W - M, H - 72)}

    ${line("GEOLOGICAL INTELLIGENCE", { x: M + 30, y: 78, w: 520, font: MONO, weight: 500, size: 17, fill: CYAN, tracking: 4 })}
    ${line(R.dateISO, { x: W - M - 520, y: 78, w: 490, font: MONO, weight: 500, size: 17, fill: STEEL, anchor: "end", tracking: 2 })}
    <rect x="${M}" y="104" width="${w}" height="1" fill="${STEEL}" opacity="0.3"/>

    ${line(R.eyebrow, { x: M, y: 182, w, font: MONO, weight: 600, size: 18, fill: CYAN, tracking: 5, upper: true })}
    ${block(R.headline, { x: M, y: 206, w: w * 0.98, h: 230, font: SANS, weight: 600, min: 34, max: 52, lh: 1.14, fill: WHITE })}

    <!-- measured scale: structure only, no invented values -->
    ${ticks}
    <rect x="${M}" y="470" width="1" height="${18 * 26}" fill="${STEEL}" opacity="0.5"/>

    <rect x="${M + 86}" y="470" width="${w - 86}" height="${18 * 26}" fill="${PANEL}" stroke="${STEEL}" stroke-opacity="0.25"/>
    ${line("PRIMARY INTERCEPT", { x: M + 122, y: 526, w: 520, font: MONO, weight: 600, size: 16, fill: STEEL, tracking: 3.4 })}
    ${line(R.figure, { x: M + 122, y: 638, w: w - 200, font: SANS, weight: 700, size: 112, fill: CYAN })}
    ${line(R.unit, { x: M + 122, y: 686, w: 420, font: MONO, weight: 600, size: 22, fill: WHITE, tracking: 1.6 })}
    <rect x="${M + 122}" y="716" width="${w - 250}" height="1" fill="${STEEL}" opacity="0.3"/>
    ${line(R.qualifier, { x: M + 122, y: 756, w: w - 250, font: MONO, weight: 500, size: 20, fill: STEEL, tracking: 1 })}
    ${line("31.4 m @ 4.8 g/t Au  ·  RC-26-088 from 149.0 m", { x: M + 122, y: 812, w: w - 250, font: MONO, weight: 500, size: 19, fill: STEEL, tracking: 0.8 })}
    ${line("18.7 m @ 2.9 g/t Au  ·  RC-26-089, 60 m along strike", { x: M + 122, y: 852, w: w - 250, font: MONO, weight: 500, size: 19, fill: STEEL, tracking: 0.8 })}

    <rect x="${M}" y="${H - 190}" width="${w}" height="1" fill="${STEEL}" opacity="0.3"/>
    ${line(R.company, { x: M, y: H - 132, w: 640, font: SANS, weight: 600, size: 25, fill: WHITE, tracking: 0.6 })}
    ${line(R.project, { x: M, y: H - 98, w: 640, font: MONO, weight: 500, size: 17, fill: STEEL, tracking: 1 })}
    ${line(R.tickers, { x: W - M - 560, y: H - 132, w: 560, font: MONO, weight: 500, size: 18, fill: CYAN, anchor: "end", tracking: 1.4 })}
  `, MID);
};

/* =======================================================================
   5. PAPER — luxury print
   Ivory stock, espresso ink, muted gold. An image framed as a plate with a
   deep mat and a keyline, a caption set small beneath it. Asymmetric margins
   so the page has a spine.
   ======================================================================= */
const paper = (photo) => {
  const IVORY = "#f4efe4", ESPRESSO = "#2f2621", GOLD = "#a9853f", MUTED = "#7a6c5d";
  const ML = 118, MR = 86, w = W - ML - MR;
  const plate = photo
    ? `<rect x="${ML - 22}" y="648" width="${w + 44}" height="462" fill="#ffffff"/>
       <image href="${photo}" x="${ML}" y="670" width="${w}" height="418" preserveAspectRatio="xMidYMid slice"/>
       <rect x="${ML}" y="670" width="${w}" height="418" fill="none" stroke="${GOLD}" stroke-width="1" stroke-opacity="0.8"/>`
    : `<rect x="${ML}" y="670" width="${w}" height="418" fill="none" stroke="${GOLD}" stroke-opacity="0.5" stroke-dasharray="3 7"/>`;
  return svg(`
    <rect x="0" y="0" width="34" height="${H}" fill="${ESPRESSO}" opacity="0.07"/>
    ${line(R.eyebrow, { x: ML, y: 142, w, font: SANS, weight: 600, size: 17, fill: GOLD, tracking: 8, upper: true })}
    <rect x="${ML}" y="168" width="54" height="1" fill="${GOLD}"/>

    ${block(R.headline, { x: ML, y: 216, w: w * 0.95, h: 372, font: SERIF, weight: 400, min: 40, max: 68, lh: 1.14, fill: ESPRESSO })}

    ${plate}
    ${line(R.project + "  ·  " + R.date, { x: ML, y: 1134, w, font: SANS, weight: 500, size: 17, fill: MUTED, tracking: 1.4, upper: true })}

    <rect x="${ML}" y="1176" width="${w}" height="1" fill="${ESPRESSO}" opacity="0.18"/>
    ${line(R.company, { x: ML, y: 1228, w: w * 0.66, font: SERIF, weight: 600, size: 26, fill: ESPRESSO })}
    ${line(R.tickers, { x: ML, y: 1228, w, font: SANS, weight: 500, size: 17, fill: MUTED, anchor: "end", tracking: 1.2 })}
  `, IVORY);
};

/* =======================================================================
   6. BLEED — photographic storytelling
   The photograph is the page. A long cinematic gradient, type set low and
   left, one hairline. No panels, no cards, no accent furniture. Without a
   photograph it becomes a typographic cover rather than an empty frame.
   ======================================================================= */
const bleed = (photo) => {
  const WHITE = "#ffffff";
  const M = 88, w = W - M * 2;
  if (!photo) {
    const INK = "#101418";
    return svg(`
      <rect x="0" y="0" width="${W}" height="${H}" fill="${INK}"/>
      ${line(R.eyebrow, { x: M, y: 150, w, font: SANS, weight: 700, size: 19, fill: "rgba(255,255,255,0.62)", tracking: 9, upper: true })}
      ${block(R.headline, { x: M, y: 300, w, h: 620, font: SANS, weight: 200, min: 48, max: 92, lh: 1.1, fill: WHITE })}
      <rect x="${M}" y="1140" width="60" height="1" fill="rgba(255,255,255,0.5)"/>
      ${line(R.company + "   ·   " + R.date, { x: M, y: 1200, w, font: SANS, weight: 500, size: 21, fill: "rgba(255,255,255,0.72)", tracking: 1.2 })}
    `, INK);
  }
  return svg(`
    <defs>
      <linearGradient id="bl" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000" stop-opacity="0.46"/>
        <stop offset="34%" stop-color="#000" stop-opacity="0.08"/>
        <stop offset="68%" stop-color="#000" stop-opacity="0.58"/>
        <stop offset="100%" stop-color="#000" stop-opacity="0.92"/>
      </linearGradient>
    </defs>
    <image href="${photo}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>
    <rect x="0" y="0" width="${W}" height="${H}" fill="url(#bl)"/>

    ${line(R.eyebrow, { x: M, y: 136, w: 500, font: SANS, weight: 700, size: 18, fill: "rgba(255,255,255,0.88)", tracking: 9, upper: true })}
    ${line(R.date, { x: W - M - 500, y: 136, w: 500, font: SANS, weight: 500, size: 18, fill: "rgba(255,255,255,0.7)", anchor: "end", tracking: 1.4 })}

    ${block(R.headline, { x: M, y: 742, w: w * 0.92, h: 330, font: SANS, weight: 300, min: 40, max: 68, lh: 1.12, fill: WHITE })}
    <rect x="${M}" y="1126" width="64" height="2" fill="rgba(255,255,255,0.9)"/>
    ${line(R.project, { x: M, y: 1186, w: w * 0.72, font: SANS, weight: 600, size: 22, fill: WHITE, tracking: 0.6 })}
    ${line(R.tickers, { x: M, y: 1186, w, font: SANS, weight: 500, size: 18, fill: "rgba(255,255,255,0.74)", anchor: "end", tracking: 1.2 })}
  `, "#000");
};

/* ---------------- render ---------------- */
const dataUri = async (file, w, h) => {
  try { const b = await sharp(file).resize(w, h, { fit: "cover" }).jpeg({ quality: 90 }).toBuffer();
        return `data:image/jpeg;base64,${b.toString("base64")}`; } catch { return ""; }
};

const run = async () => {
  const PHOTO = await dataUri("/tmp/kings/site.webp", 1400, 1750);
  const families = [
    ["1-BROADSHEET-financial-editorial", broadsheet()],
    ["2-OBSIDIAN-cinematic-luxury", obsidian()],
    ["3-GRID-swiss-modernist", grid()],
    ["4-CORE-technical-intelligence", core()],
    ["5-PAPER-luxury-print", paper(PHOTO)],
    ["6-BLEED-photographic", bleed(PHOTO)],
    ["6b-BLEED-no-photography-fallback", bleed("")],
  ];
  const thumbs = [];
  for (const [name, markup] of families) {
    const file = path.join(OUT, `${name}.png`);
    await sharp(Buffer.from(markup)).resize(W, H).png().toFile(file);
    const m = await sharp(file).metadata();
    console.log(`  ${String(m.width)}x${m.height}  ${name}.png`);
    if (!name.startsWith("6b")) thumbs.push({ name: name.split("-")[1], buf: await sharp(file).resize(330).png().toBuffer() });
  }

  // contact sheet, 3 x 2
  const cw = 330, ch = Math.round(cw * H / W), gap = 20, lab = 40, pad = 92;
  const SW = 3 * cw + 4 * gap, SH = pad + 2 * (ch + lab + gap) + gap;
  const label = (t, w2, h2, size, col) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w2}" height="${h2}"><text x="0" y="${size}" font-family="Helvetica" font-size="${size}" font-weight="700" fill="${col}">${t}</text></svg>`);
  const comps = [{ input: label("Six design directions — same Kingsmen release", SW, 60, 32, "#0f172a"), top: 30, left: gap }];
  thumbs.forEach((t, i) => {
    const r = Math.floor(i / 3), c = i % 3;
    const top = pad + r * (ch + lab + gap);
    comps.push({ input: label(t.name, cw, lab, 21, "#0f172a"), top, left: gap + c * (cw + gap) });
    comps.push({ input: t.buf, top: top + lab, left: gap + c * (cw + gap) });
  });
  const sheet = path.join(OUT, "CONTACT-SHEET-six-directions.png");
  await sharp({ create: { width: SW, height: SH, channels: 3, background: "#ffffff" } }).composite(comps).png().toFile(sheet);
  console.log(`\n  contact sheet: ${SW}x${SH}`);
  console.log(`  FOLDER: ${OUT}`);
};
run().catch((e) => { console.error(e); process.exit(1); });
