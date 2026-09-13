#!/usr/bin/env node
/* Generate a sample QR placard through the SAME builder the portal uses, so a sample
   can never drift from the real download.

   Usage: node scripts/sample-placard.mjs <slug> "<Company Name>" [outDir]
*/
import fs from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import { profileUrl, companyMonogram } from "../src/lib/brand.js";
import { buildPlacardSvg, splitQrSvg } from "../src/lib/qrPlacard.js";

const [, , slug = "argenta-silver-corp", name = "Argenta Silver Corp.", outDir = "."] = process.argv;

const url = profileUrl(slug);
if (!url) { console.error("a slug is required"); process.exit(1); }

const qr = await QRCode.toString(url, {
  type: "svg", margin: 0, errorCorrectionLevel: "M",
  color: { dark: "#0f172a", light: "#ffffff" },
});
const { viewBox, inner } = splitQrSvg(qr);

const svg = buildPlacardSvg({
  qrInner: inner,
  qrViewBox: viewBox,
  name,
  logo: "",                                   // samples use the monogram
  monogram: companyMonogram({ name, slug }),
  // no `measure` → estimated widths; the browser passes a canvas measurer
});

fs.mkdirSync(outDir, { recursive: true });
const file = path.join(outDir, `${slug}-qr-placard.svg`);
fs.writeFileSync(file, svg);
console.log(`${file}\n  encodes: ${url}`);
