/* ============================================================
   QR PLACARD — the printable card a company displays at a booth.
   ------------------------------------------------------------
   Layout: QR above a footer carrying the COMPANY on the left (logo + name, in black)
   and MINEEX on the right (mark + wordmark). Pure vector so it stays crisp at any
   print size, and fully self-contained (data: URLs only) so it survives being emailed
   to a print shop and never taints a canvas during rasterisation.

   Lives in lib/ rather than inside the portal so the same function that renders the
   preview also generates samples — a sample can never drift from the real download.
   ============================================================ */
import { markInnerSvg, MARK_VIEWBOX, MARK_RATIO, CAP_HEIGHT, MARK_OVERSHOOT } from "./brand.js";

export const CARD_W = 1000;
export const CARD_H = 1220;

export const PLACARD_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const xmlEsc = (s) =>
  String(s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));

// Rough width estimate, used when no real text measurer is supplied (Node).
const approxWidth = (text, px) => String(text || "").length * px * 0.58;

/**
 * Build the placard SVG.
 * `measure(text, px, weight)` should return the rendered width in px. Pass a canvas-backed
 * measurer in the browser; omitting it falls back to an estimate, which is fine for
 * samples but would risk a clipped wordmark in the real download.
 */
export function buildPlacardSvg({ qrInner, qrViewBox, name, logo, monogram, measure }) {
  const width = typeof measure === "function" ? measure : approxWidth;

  const left = logo
    ? `<clipPath id="logoClip"><circle cx="114" cy="1040" r="42"/></clipPath>
       <image href="${xmlEsc(logo)}" x="72" y="998" width="84" height="84"
              preserveAspectRatio="xMidYMid slice" clip-path="url(#logoClip)"/>`
    : `<circle cx="114" cy="1040" r="42" fill="#0f172a"/>
       <text x="114" y="1040" text-anchor="middle" dominant-baseline="central"
             font-family='${PLACARD_FONT}' font-size="34" font-weight="800"
             fill="#ffffff">${xmlEsc(monogram)}</text>`;

  // Right-aligned MineEx lockup, laid out from the right margin inwards using the
  // MEASURED wordmark width so it can never overrun the edge.
  const RIGHT = CARD_W - 72, MID = 1040;
  // The core sample is exactly the cap height of the M, matching the app lockup.
  // markW is NOT rounded: the nested <svg>'s aspect must equal the viewBox's exactly, or
  // preserveAspectRatio letterboxes the artwork inside its box and it reads as cropped.
  const wordPx = 42, markH = wordPx * CAP_HEIGHT * MARK_OVERSHOOT, markW = markH * MARK_RATIO, gap = 7;
  const wordW = width("MineEx", wordPx, 800);
  const markX = RIGHT - wordW - gap - markW;

  // The company name gets whatever room is left. Shrink, then ellipsise, rather than
  // letting a long name collide with the MineEx lockup.
  const nameX = 180, roomForName = markX - nameX - 40;
  let namePx = 40, shown = String(name || "");
  while (namePx > 24 && width(shown, namePx, 800) > roomForName) namePx -= 2;
  if (width(shown, namePx, 800) > roomForName) {
    while (shown.length > 4 && width(shown + "…", namePx, 800) > roomForName) shown = shown.slice(0, -1);
    shown += "…";
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  <rect width="${CARD_W}" height="${CARD_H}" fill="#ffffff"/>
  <rect x="8" y="8" width="${CARD_W - 16}" height="${CARD_H - 16}" rx="40" fill="none" stroke="#e2e8f0" stroke-width="3"/>

  <text x="${CARD_W / 2}" y="132" text-anchor="middle" font-family='${PLACARD_FONT}'
        font-size="30" font-weight="800" letter-spacing="5" fill="#64748b">SCAN FOR OUR INVESTOR PROFILE</text>

  <svg x="180" y="196" width="640" height="640" viewBox="${qrViewBox}">${qrInner}</svg>

  <text x="${CARD_W / 2}" y="906" text-anchor="middle" font-family='${PLACARD_FONT}'
        font-size="26" font-weight="600" fill="#94a3b8">Live updates, projects and capital structure</text>

  <line x1="72" y1="958" x2="${RIGHT}" y2="958" stroke="#e2e8f0" stroke-width="3"/>

  ${left}
  <text x="${nameX}" y="${MID}" dominant-baseline="central" font-family='${PLACARD_FONT}'
        font-size="${namePx}" font-weight="800" fill="#000000">${xmlEsc(shown)}</text>

  <svg x="${markX}" y="${MID - markH / 2}" width="${markW}" height="${markH}" viewBox="${MARK_VIEWBOX}" overflow="visible" shape-rendering="geometricPrecision">${markInnerSvg("pl")}</svg>
  <text x="${RIGHT}" y="${MID + (wordPx * CAP_HEIGHT) / 2}" text-anchor="end" font-family='${PLACARD_FONT}'
        font-size="${wordPx}" font-weight="800" fill="#0B0D10">MineEx</text>
</svg>`;
}

// Split a `qrcode` SVG string into the pieces the placard nests.
export function splitQrSvg(qrSvg) {
  const viewBox = (qrSvg.match(/viewBox="([^"]+)"/) || [])[1] || "0 0 33 33";
  const inner = qrSvg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  return { viewBox, inner };
}
