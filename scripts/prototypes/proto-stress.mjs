// Stress exports: the conditions that break layouts.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import * as P from "./proto-carousels.mjs";

const OUT = path.join(P.OUT, "stress");
fs.mkdirSync(OUT, { recursive: true });

const dataUri = async (f, w, h) => { try { const b = await sharp(f).resize(w, h, { fit: "cover" }).jpeg({ quality: 88 }).toBuffer(); return `data:image/jpeg;base64,${b.toString("base64")}`; } catch { return ""; } };
const save = async (name, markup) => {
  const f = path.join(OUT, `${name}.png`);
  await sharp(Buffer.from(markup)).resize(P.W, P.H).png().toFile(f);
  return f;
};

const run = async () => {
  const PHOTO = await dataUri("/tmp/kings/site.webp", 1400, 1750);
  const LOGO = await dataUri("/tmp/kings/logo.jpeg", 480, 480);
  const ASPECT = await (async () => { try { const m = await sharp("/tmp/kings/logo.jpeg").metadata(); return m.width / m.height; } catch { return 1; } })();
  // a wide wordmark, to prove marks are contained not cropped
  const WORD = await (async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="200"><text x="8" y="140" font-family="Helvetica" font-size="104" font-weight="800" fill="#1b2a4a">KINGSMEN</text></svg>`;
    return `data:image/png;base64,${(await sharp(Buffer.from(svg)).png().toBuffer()).toString("base64")}`;
  })();

  const made = [];
  const R = P.R;

  // 1. ADAPTIVE RESULTS — 1, 2, 3, 4 figures, Broadsheet and Paper.
  for (const n of [1, 2, 3, 4]) {
    const rows = R.results.slice(0, n);
    made.push(await save(`results-broadsheet-${n}-figure${n > 1 ? "s" : ""}`, P.broadsheet.results(rows)));
    made.push(await save(`results-paper-${n}-figure${n > 1 ? "s" : ""}`, P.paper.results(rows)));
  }

  // 2. NO PHOTOGRAPHY — every family's announce + context must stay finished.
  for (const fam of P.FAMILIES) {
    const a = fam.id === "PAPER" || fam.id === "BLEED" ? fam.announce("") : fam.announce();
    made.push(await save(`nophoto-${fam.id}-announce`, a));
    made.push(await save(`nophoto-${fam.id}-context`, fam.context("")));
  }

  // 3. LOGO ASPECTS — square mark vs wide wordmark, on closings.
  for (const fam of P.FAMILIES) {
    const sq = fam.id === "BLEED" ? fam.closing(LOGO, ASPECT, PHOTO) : fam.closing(LOGO, ASPECT);
    const wd = fam.id === "BLEED" ? fam.closing(WORD, 4.5, PHOTO) : fam.closing(WORD, 4.5);
    made.push(await save(`logo-square-${fam.id}`, sq));
    made.push(await save(`logo-wordmark-${fam.id}`, wd));
  }

  console.log(`  ${made.length} stress exports -> ${OUT}`);

  // contact sheets for the two stress groups
  const cell = 290, ch = Math.round(cell * P.H / P.W), gap = 16, pad = 86, lab = 28;
  const label = (t, w, h, s2, c, wt = 700) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="0" y="${s2}" font-family="Helvetica" font-size="${s2}" font-weight="${wt}" fill="${c}">${t}</text></svg>`);
  const build = async (files, cols, title, out) => {
    const rows = Math.ceil(files.length / cols);
    const SW = cols * cell + (cols + 1) * gap, SH = pad + rows * (ch + lab + gap) + gap;
    const comps = [{ input: label(title, SW, 60, 30, "#0f172a"), top: 24, left: gap }];
    for (let i = 0; i < files.length; i++) {
      const r = Math.floor(i / cols), c = i % cols;
      const top = pad + r * (ch + lab + gap);
      comps.push({ input: label(path.basename(files[i], ".png"), cell, lab, 15, "#475569", 600), top, left: gap + c * (cell + gap) });
      comps.push({ input: await sharp(files[i]).resize(cell).png().toBuffer(), top: top + lab, left: gap + c * (cell + gap) });
    }
    await sharp({ create: { width: SW, height: SH, channels: 3, background: "#ffffff" } }).composite(comps).png().toFile(out);
    return out;
  };
  const g = (p2) => made.filter((f) => path.basename(f).startsWith(p2));
  await build(g("results-"), 4, "Adaptive Key Results — 1 to 4 disclosed figures", path.join(P.OUT, "STRESS-adaptive-results.png"));
  await build(g("nophoto-"), 4, "No photography — every family stays finished", path.join(P.OUT, "STRESS-no-photography.png"));
  await build(g("logo-"), 4, "Logo aspect ratios — square mark vs wide wordmark", path.join(P.OUT, "STRESS-logo-aspects.png"));
  console.log("  3 stress contact sheets");
};
run().catch((e) => { console.error(e); process.exit(1); });
