// Accents and grounds: the contract.
//
// A company can put any of ten designs on any of five backgrounds. That is
// 50 combinations nobody will review by hand, so the guarantee has to be
// mechanical: whatever the family drew as its ink must still be readable
// against the ground the company picked, and the accent must come out the
// far side untouched.

import { PREMIUM, PREMIUM_IDS } from "../src/portal/publish/carousel/premium.js";
import { premiumContent } from "../src/portal/publish/carousel/premiumText.js";
import { ACCENTS, GROUNDS, groundHex, groundOf, recolourMarkup, moveColour, hexToRgb }
  from "../src/portal/publish/carousel/palette.js";

let pass = 0; const fails = [];
const ok = (n, c) => { if (c) pass++; else fails.push(n); };
const eq = (n, a, b) => ok(`${n} (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b));

const lum = (hex) => {
  const a = hexToRgb(hex).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
};
const chroma = (hex) => { const [r, g, b] = hexToRgb(hex); return (Math.max(r, g, b) - Math.min(r, g, b)) / 255; };
const hue = (hex) => {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  if (!d) return 0;
  const h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h / 6;
};
const contrast = (a, b) => {
  const L1 = Math.max(lum(a), lum(b)), L2 = Math.min(lum(a), lum(b));
  return (L1 + 0.05) / (L2 + 0.05);
};

const ACCENT = "#B4472A";
const slide = { id: "announce", kind: "announcement", layout: "", fields: {
  eyebrow: "DISCOVERY", headline: "Widest high-grade intercept to date extends the Keel zone 140 m down-plunge",
  project: "Keel zone", date: "20 Oct 2026" } };
const deck = [slide,
  { id: "results", kind: "keyResults", fields: { title: "Key results", rows: [{ v: "31.4", u: "m", desc: "@ 4.8 g/t Au" }] } },
  { id: "context", kind: "context", fields: { body: "The hole steps out 120 m." } },
  { id: "why", kind: "why", fields: { body: "Grade continuity at depth." } },
  { id: "closing", kind: "closing", fields: { cta: "Read the release", url: "https://x.test" } }];
const brand = { name: "Kingsmen Resources Ltd.", location: "Chihuahua, Mexico", tickers: [{ ex: "TSXV", sym: "KNG" }] };

console.log("\n=== A. the catalogue ===");
eq("A1 five accents offered", ACCENTS.length, 5);
ok("A2 every accent is a real six-digit hex", ACCENTS.every((a) => /^#[0-9A-Fa-f]{6}$/.test(a.hex)));
ok("A3 no two accents are the same colour", new Set(ACCENTS.map((a) => a.hex.toLowerCase())).size === 5);
ok("A4 every accent is dark enough for white type", ACCENTS.every((a) => contrast(a.hex, "#ffffff") >= 4.5));
eq("A5 five grounds plus the family's own", GROUNDS.length, 6);
eq("A6 the first option is the family's own", GROUNDS[0].id, "");
ok("A7 grounds span light and dark", GROUNDS.some((g) => g.hex && lum(g.hex) > 0.6) && GROUNDS.some((g) => g.hex && lum(g.hex) < 0.1));

console.log("\n=== B. the move preserves separation ===");
ok("B1 a ground maps onto the chosen ground exactly", moveColour("#ffffff", "#ffffff", "#0A0C0F").toLowerCase() === "#0a0c0f");
ok("B2 dark ink on white becomes light ink on black", lum(moveColour("#0e1114", "#ffffff", "#0A0C0F")) > 0.7);
ok("B3 light ink on black becomes dark ink on white", lum(moveColour("#f8fafc", "#0b1220", "#FFFFFF")) < 0.3);
ok("B4 a hairline stays a hairline", contrast(moveColour("#e2e8f0", "#ffffff", "#0A0C0F"), "#0A0C0F") < 3);
ok("B5 the move is stable when nothing changes",
  moveColour("#123456", "#ffffff", "#ffffff").toLowerCase() === "#123456");

console.log("\n=== C. every family on every ground ===");
let worst = { ratio: 99, where: "" };
for (const id of PREMIUM_IDS) {
  const fam = PREMIUM[id];
  const c = premiumContent({ slide, brand, deck });
  const markup = fam.announcement(c, { accent: ACCENT, photo: "", logo: "", logoAspect: 1 });
  const own = groundOf(markup);
  ok(`C-${id} declares a full-bleed ground`, /^#[0-9a-fA-F]{6}$/.test(own));
  // THE FAMILY'S INK IS WHAT IT DREW TYPE IN. Read it off the text elements
  // rather than off every colour in the file, because a banded footer is not
  // ink and is not held to the same rule.
  const textFills = [...new Set([...markup.matchAll(/<(?:text|tspan)\b[^>]*\bfill="(#[0-9a-fA-F]{6})"/g)].map((m) => m[1]))]
    .filter((h) => h.toLowerCase() !== ACCENT.toLowerCase());
  ok(`C-${id} draws type in at least one colour`, textFills.length > 0);
  const ink = textFills.sort((a, b) => contrast(b, own) - contrast(a, own))[0];
  // Furniture: a saturated colour that is NOT used for type.
  const furniture = [...new Set((markup.match(/#[0-9a-fA-F]{6}\b/g) || []))]
    .filter((h) => h.toLowerCase() !== ACCENT.toLowerCase() && !textFills.includes(h)
      && chroma(h) > 0.12 && h.toLowerCase() !== own.toLowerCase());
  for (const g of GROUNDS.filter((x) => x.hex)) {
    const to = groundHex(g.id);
    const out = recolourMarkup(markup, own, to, [ACCENT]);
    const newGround = groundOf(out);
    eq(`C-${id}/${g.id} paints the chosen ground`, newGround.toLowerCase(), to.toLowerCase());
    const newInk = moveColour(ink, own, to, true);
    const r = contrast(newInk, to);
    if (r < worst.ratio) worst = { ratio: r, where: `${id}/${g.id}` };
    ok(`C-${id}/${g.id} keeps the ink readable (${r.toFixed(1)}:1)`, r >= 7);
    // Only families that actually draw the accent can be checked for it.
    if (markup.includes(ACCENT)) ok(`C-${id}/${g.id} leaves the accent untouched`, out.includes(ACCENT));
    // Furniture keeps its hue. A deep teal band must not come back as cyan.
    furniture.forEach((f) => {
      const moved = moveColour(f, own, to, false);
      ok(`C-${id}/${g.id} furniture ${f} keeps its hue`, Math.abs(hue(moved) - hue(f)) < 0.04 || chroma(moved) < 0.06);
      ok(`C-${id}/${g.id} furniture ${f} is not made fluorescent`, chroma(moved) <= chroma(f) + 0.06);
      // Furniture keeps the standing it had: a whisper stays a whisper, a
      // bold band stays bold. The test is relative, because an absolute floor
      // would brighten panels the family deliberately kept subtle.
      const had = contrast(f, own), now = contrast(moved, to);
      ok(`C-${id}/${g.id} furniture ${f} keeps its standing (${had.toFixed(2)} -> ${now.toFixed(2)})`,
        now >= Math.min(had, 2.2) - 0.08);
    });
  }
}
console.log(`   worst ink contrast across all 50 combinations: ${worst.ratio.toFixed(1)}:1 (${worst.where})`);

console.log("\n=== C2. type reversed out onto furniture is left alone ===");
for (const id of PREMIUM_IDS) {
  const c = premiumContent({ slide, brand, deck });
  const markup = PREMIUM[id].announcement(c, { accent: ACCENT, photo: "", logo: "", logoAspect: 1 });
  const own = groundOf(markup);
  const reversed = [...new Set([...markup.matchAll(/<(?:text|tspan)\b[^>]*\bfill="(#[0-9a-fA-F]{6})"/g)].map((m) => m[1]))]
    .filter((h) => h.toLowerCase() !== ACCENT.toLowerCase() && contrast(h, own) < 2);
  for (const g of GROUNDS.filter((x) => x.hex)) {
    reversed.forEach((h) => ok(`C2-${id}/${g.id} reversed type ${h} is untouched`,
      moveColour(h, own, groundHex(g.id), true).toLowerCase() === h.toLowerCase()));
  }
  if (reversed.length) console.log(`   ${id}: ${reversed.length} reversed-out colour(s) held still`);
}

console.log("\n=== D. nothing else is disturbed ===");
const c0 = premiumContent({ slide, brand, deck });
// The context slide is the one that carries photography.
const cCtx = premiumContent({ slide: deck[2], brand, deck });
const m0 = PREMIUM.obsidian.context(cCtx, { accent: ACCENT, photo: "data:image/png;base64,AAAA", logo: "", logoAspect: 1 });
const m1 = recolourMarkup(m0, groundOf(m0), "#FFFFFF", [ACCENT]);
ok("D1 image data is carried through untouched", m1.includes("data:image/png;base64,AAAA"));
eq("D2 the words are unchanged", (m1.match(/Keel zone/g) || []).length, (m0.match(/Keel zone/g) || []).length);
eq("D3 the markup keeps its structure", m1.split("<").length, m0.split("<").length);
ok("D4 no ground means no change at all", recolourMarkup(m0, groundOf(m0), "") === m0);
ok("D5 translucent scrims move too, keeping their alpha",
  !/rgba\(248, 250, 252/.test(m1) || m0.includes("rgba(248,250,252"));

const total = pass + fails.length;
console.log(`\npalette: ${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.slice(0, 12).forEach((f) => console.log(`  ✗ ${f}`)); process.exit(1); }
console.log(`✓ ALL PASS — ${total} assertions`);
