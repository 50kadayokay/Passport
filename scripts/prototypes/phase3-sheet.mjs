// Contact sheet of the production premium families, straight from src.
import fs from "node:fs"; import path from "node:path"; import sharp from "sharp";
import { PREMIUM, PREMIUM_IDS } from "../../src/portal/publish/carousel/premium.js";
import { premiumContent, W, H } from "../../src/portal/publish/carousel/premiumText.js";
const OUT = path.join(process.env.HOME, "Desktop", "MineEx-Phase3"); fs.mkdirSync(OUT, { recursive: true });
const du = async (f, w, h) => { try { const b = await sharp(f).resize(w, h, { fit: "cover" }).jpeg({ quality: 88 }).toBuffer(); return `data:image/jpeg;base64,${b.toString("base64")}`; } catch { return ""; } };
const KINDS = ["announcement", "keyResults", "context", "why", "closing"];
const LBL = { announcement: "1 Announcement", keyResults: "2 Key Results", context: "3 Context", why: "4 Why", closing: "5 Closing" };
const brand = { name: process.argv[3] || "Kingsmen Resources Ltd.", location: "Parral Mining District, Chihuahua, Mexico",
  tickers: [{ ex: "TSXV", sym: "KNG" }, { ex: "OTCQB", sym: "KNGRF" }, { ex: "FSE", sym: "TUY" }] };
const deck = [
  { id: "announce", kind: "announcement", fields: { eyebrow: "Discovery", headline: "Kingsmen Resources Intersects 1,742 g/t Silver Equivalent over 0.7 Metres in Its First Drill Program at Las Coloradas", project: "Las Coloradas Silver-Gold Project", date: "9 October 2026" } },
  { id: "results", kind: "keyResults", fields: { title: "Key Results", rows: [
    { v: "1,742", u: "g/t AgEq", desc: "over 0.70 m, hole LC-25-010" }, { v: "31.4", u: "m @ 4.8 g/t Au", desc: "RC-26-088 from 149.0 m" },
    { v: "2.1", u: "m @ 46.2 g/t Au", desc: "included in the above" }, { v: "18.7", u: "m @ 2.9 g/t Au", desc: "RC-26-089, 60 m along strike" }] } },
  { id: "context", kind: "context", fields: { title: "The Project", body: "The first six holes of the autumn programme returned 31.4 metres at 4.8 g/t gold, including 2.1 metres at 46.2 g/t, and two further mineralised intercepts along strike and at depth." } },
  { id: "why", kind: "why", fields: { title: "Why It Matters", body: "A wider, higher-grade intercept that extends the zone at depth moves this from a single discovery hole toward something that can carry a resource estimate — with three holes still pending." } },
  { id: "closing", kind: "closing", fields: { cta: "Follow Kingsmen Resources on MineEx", url: "https://kingsmenresources.example/news/2026-10-09-keel-zone" } },
];
const run = async () => {
  const photo = process.argv[4] === "nophoto" ? "" : await du("/tmp/kings/site.webp", 1400, 1750);
  const logo = await du("/tmp/kings/logo.jpeg", 480, 480);
  const aspect = await (async () => { try { const m = await sharp("/tmp/kings/logo.jpeg").metadata(); return m.width / m.height; } catch { return 1; } })();
  const label = (t, w, h, s2, c2, wt = 700) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="0" y="${s2}" font-family="Helvetica" font-size="${s2}" font-weight="${wt}" fill="${c2}">${String(t).replace(/&/g,"&amp;")}</text></svg>`);
  const cw = 250, ch = Math.round(cw * H / W), gap = 12, pad = 84, rl = 30;
  const comps = [{ input: label(process.argv[2] || "MineEx — ten premium design families", 5 * cw + 6 * gap, 60, 28, "#0f172a"), top: 24, left: gap }];
  let r = 0;
  for (const fid of PREMIUM_IDS) {
    const fam = PREMIUM[fid]; const top = pad + r * (ch + rl + gap);
    comps.push({ input: label(`${fam.label} — ${fam.blurb}`, 900, rl, 19, "#0f172a"), top, left: gap });
    for (let i = 0; i < KINDS.length; i++) {
      const slide = deck[i];
      const c = premiumContent({ slide, brand, deck });
      const markup = fam[KINDS[i]](c, { accent: fam.accent, photo: KINDS[i] === "context" || fid === "bleed" ? photo : "", logo, logoAspect: aspect });
      const full = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${markup}</svg>`;
      const buf = await sharp(Buffer.from(full)).resize(cw).png().toBuffer();
      fs.writeFileSync(path.join(OUT, `${fid}-${KINDS[i]}.png`), await sharp(Buffer.from(full)).resize(W, H).png().toBuffer());
      comps.push({ input: buf, top: top + rl, left: gap + i * (cw + gap) });
    }
    r++;
  }
  const out = path.join(OUT, `${process.argv[5] || "SHEET-ten-families"}.png`);
  await sharp({ create: { width: 5 * cw + 6 * gap, height: pad + r * (ch + rl + gap) + gap, channels: 3, background: "#ffffff" } }).composite(comps).png().toFile(out);
  console.log("  ->", out);
};
run().catch((e) => { console.error(e); process.exit(1); });
