// Renders the six prototype carousels and builds the contact sheets.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { FAMILIES, SLIDES, SLIDE_LABEL, DIR, W, H, R } from "./proto-carousels.mjs";

const dataUri = async (f, w, h) => {
  try { const b = await sharp(f).resize(w, h, { fit: "cover" }).jpeg({ quality: 90 }).toBuffer();
        return `data:image/jpeg;base64,${b.toString("base64")}`; } catch { return ""; }
};
const label = (t, w, h, size, col, weight = 700) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="0" y="${size}" font-family="Helvetica,Arial" font-size="${size}" font-weight="${weight}" fill="${col}">${String(t).replace(/&/g, "&amp;")}</text></svg>`);

const render = (fam, slide, { photo, logo, aspect }) => {
  const fn = fam[slide];
  if (slide === "closing") return fam.id === "BLEED" ? fn(logo, aspect, photo) : fn(logo, aspect);
  if (slide === "announce") return (fam.id === "PAPER" || fam.id === "BLEED") ? fn(photo) : fn();
  if (slide === "results") return fam.id === "BLEED" ? fn(photo) : fn();
  if (slide === "context") return fn(photo);
  // Bleed is defined by its photography: every slide that can carry an image
  // gets one. Leaving `why` without it produced a flat panel in the middle of
  // an otherwise photographic deck.
  if (slide === "why" && fam.id === "BLEED") return fn(photo);
  return fn();
};

const run = async () => {
  const PHOTO = await dataUri("/tmp/kings/site.webp", 1400, 1750);
  const LOGO = await dataUri("/tmp/kings/logo.jpeg", 480, 480);
  const ASPECT = await (async () => { try { const m = await sharp("/tmp/kings/logo.jpeg").metadata(); return m.width / m.height; } catch { return 1; } })();
  const ctx = { photo: PHOTO, logo: LOGO, aspect: ASPECT };

  const thumbs = {};
  const made = [];
  for (const fam of FAMILIES) {
    thumbs[fam.id] = [];
    for (const s of SLIDES) {
      const markup = render(fam, s, ctx);
      const file = path.join(DIR.slides, `${fam.id}-${SLIDE_LABEL[s].replace(/\s+/g, "-")}.png`);
      await sharp(Buffer.from(markup)).resize(W, H).png().toFile(file);
      made.push(file);
      thumbs[fam.id].push(await sharp(file).resize(300).png().toBuffer());
    }
    console.log(`  ${fam.id.padEnd(11)} 5 slides`);
  }

  // one sheet per family
  const cw = 300, ch = Math.round(cw * H / W), gap = 16, lab = 30, pad = 92;
  for (const fam of FAMILIES) {
    const SW = 5 * cw + 6 * gap, SH = pad + ch + lab + gap * 2;
    const comps = [
      { input: label(`${fam.label.toUpperCase()} — ${fam.blurb}`, SW, 60, 30, "#0f172a"), top: 26, left: gap },
    ];
    thumbs[fam.id].forEach((b, i) => {
      comps.push({ input: label(SLIDE_LABEL[SLIDES[i]], cw, lab, 18, "#64748b", 600), top: pad - 4, left: gap + i * (cw + gap) });
      comps.push({ input: b, top: pad + lab - 4, left: gap + i * (cw + gap) });
    });
    const f = path.join(DIR.sheets, `FAMILY-${fam.id}.png`);
    await sharp({ create: { width: SW, height: pad + lab + ch + gap * 2, channels: 3, background: "#ffffff" } }).composite(comps).png().toFile(f);
    made.push(f);
  }

  // master: 6 rows x 5 slides
  const rowLab = 34;
  const MW = 5 * cw + 6 * gap, MH = pad + FAMILIES.length * (ch + rowLab + gap) + gap;
  const mcomps = [{ input: label("MineEx — six design systems, five slides each (same Kingsmen release)", MW, 60, 32, "#0f172a"), top: 26, left: gap }];
  SLIDES.forEach((s, i) => mcomps.push({ input: label(SLIDE_LABEL[s], cw, 26, 17, "#64748b", 600), top: pad - 30, left: gap + i * (cw + gap) }));
  FAMILIES.forEach((fam, r) => {
    const top = pad + r * (ch + rowLab + gap);
    mcomps.push({ input: label(`${fam.label.toUpperCase()} — ${fam.blurb}`, MW, rowLab, 20, "#0f172a"), top, left: gap });
    thumbs[fam.id].forEach((b, i) => mcomps.push({ input: b, top: top + rowLab, left: gap + i * (cw + gap) }));
  });
  const master = path.join(DIR.root, "MASTER-all-30-slides.png");
  await sharp({ create: { width: MW, height: MH, channels: 3, background: "#ffffff" } }).composite(mcomps).png().toFile(master);
  made.push(master);

  console.log(`\n  ${made.length} files`);
  console.log(`  master: ${MW}x${MH}`);
  console.log(`  FOLDER: ${DIR.root}`);
};
run().catch((e) => { console.error(e); process.exit(1); });
