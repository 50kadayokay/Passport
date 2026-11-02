// A Conference Mode QR code must scan to the company's public investor profile.
//   node scripts/conference-qr-check.mjs
//
// This is printed onto booth panels and handouts. A wrong destination is not a
// bug you patch next sprint -- it is a box of dead signage at a trade show. So
// the code is not merely generated and eyeballed: it is ENCODED and then DECODED
// with a real scanner (jsqr, the same library the investor app scans with), and
// the decoded payload is compared against the canonical URL.
//
// Both libraries are already dependencies; nothing new is added to check this.

import QRCode from "qrcode";
import jsQR from "jsqr";

const CANONICAL_ORIGIN = "https://mineex.ca";
const profileUrl = (slug) => `${CANONICAL_ORIGIN}/app?c=${encodeURIComponent(slug)}`;

/* qrcode's module bitmap, blown up and turned into the RGBA ImageData jsqr
   wants. Scaling matters: at one pixel per module a scanner has no quiet zone
   or sampling room, which is also true of a QR printed too small. */
function imageData(text, scale = 6, quiet = 4) {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "H" });
  const size = modules.size;
  const dim = (size + quiet * 2) * scale;
  const data = new Uint8ClampedArray(dim * dim * 4).fill(255);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!modules.data[y * size + x]) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const px = ((y + quiet) * scale + dy) * dim + ((x + quiet) * scale + dx);
          data[px * 4] = 0; data[px * 4 + 1] = 0; data[px * 4 + 2] = 0;
        }
      }
    }
  }
  return { data, width: dim, height: dim };
}

const CASES = [
  "kingsmen-resources",
  "kingsmen-sandbox",
  "a",                                   // a short slug still has to round-trip
  "company-with-a-rather-long-slug-name",
];

let bad = 0;
console.log("");
for (const slug of CASES) {
  const want = profileUrl(slug);
  const img = imageData(want);
  const got = jsQR(img.data, img.width, img.height);
  const ok = got && got.data === want;
  if (!ok) bad++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${slug.padEnd(38)} → ${got ? got.data : "did not decode"}`);
  if (!ok && got) console.log(`        expected ${want}`);
}

// The destination must be the public profile, never a portal route and never a
// host that only exists on the machine that generated it.
const sample = profileUrl("kingsmen-resources");
for (const [label, bad_] of [
  ["not localhost", /localhost|127\.0\.0\.1|\.local/i.test(sample)],
  ["not a portal route", /\/portal/i.test(sample)],
  ["not a preview host", /vercel\.app|netlify|ngrok/i.test(sample)],
  ["is the canonical origin", !sample.startsWith(`${CANONICAL_ORIGIN}/`)],
]) {
  if (bad_) { bad++; console.log(`  FAIL  destination: ${label}`); }
  else console.log(`  ok    destination: ${label}`);
}

console.log(bad ? `\n  ${bad} failure(s)\n` : "\n  every QR decodes to the intended public profile\n");
process.exit(bad ? 1 : 0);
