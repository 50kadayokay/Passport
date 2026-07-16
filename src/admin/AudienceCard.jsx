// Audience Card — generates a shareable, Twitter-ready MP4 for a company.
//
// The card is drawn on a <canvas> (1080x1350, 4:5 portrait) rather than in CSS so
// we can (a) control pixel output exactly and (b) capture it with MediaRecorder.
// Modern Chrome encodes H.264 MP4 natively; we fall back to WebM elsewhere.
//
// Three faces, in order:
//   1. project image + company logo/name          (the status-card look)
//   2. FLIP -> 5-7 selling points, waterfalling in with a snappy kinetic drop
//   3. FLIP -> "Analyzed & Presented by <brand>" authority stamp + follow CTA
//
// The points come from /api/audience-card, which reads the company's extracted
// press-release corpus — i.e. straight from what was dragged and dropped.
//
// Pacing targets a sub-15s runtime (where watch-time retention on X holds up).

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Loader2, Sparkles, Play, Download, Film, AlertTriangle, RefreshCw, ShieldCheck, CheckCircle2, FileText, ImagePlus } from "lucide-react";
import { fetchCompanies } from "../lib/supabase.js";
import { authHeaders } from "../lib/auth.js";

/* ============================== card config ============================== */
const W = 1080, H = 1350;                 // 4:5 portrait — X's best in-feed ratio
const MAX_POINTS = 7;                     // hard cap: 5-7 keeps runtime tight
const BRAND = {                           // placeholders — swap for real branding
  name: "Passport",
  slogan: "Every junior miner, one tap away.",
  cta: "Follow for next-gen mining intelligence",
};
const INK = "#0f172a", MUTED = "#94a3b8", ACCENT = "#10b981";

// The logo is the hero of the front face — it should dominate. Bounds are generous
// (78% of the card's inner width) and the name/ticker flow BELOW whatever height the
// logo actually lands at, so any aspect ratio composes correctly.
const LOGO_MAX_W = 780, LOGO_MAX_H = 560;

// Mobile-first type: the video is watched ~375px wide, so a 52px point renders at
// ~18px on a phone. Anything smaller stops being scannable mid-scroll — so we start
// at 52 and only step down if the block genuinely won't fit (see layoutPoints).
const PT_SIZES = [52, 48, 44, 40, 36];
const PT_MAX_LINES = 2;
const PT_X = 168, PT_MAX_W = (W - 72) - PT_X;      // text column width
const PT_AREA_TOP = 384, PT_AREA_BOT = H - 78;     // vertical room below the banner
const ptFont = (px = PT_SIZES[0]) => `700 ${px}px Inter, system-ui, -apple-system, sans-serif`;

// Animation beats (seconds) — snappy in, then hold the points long enough to
// actually read all of them before flipping to the stamp.
const T_FACE1 = 2.2, T_FLIP = 0.36, T_STAGGER = 0.44, T_PT_IN = 0.36,
      T_POINTS_HOLD = 3.0, T_FACE3 = 2.5;
export const timings = (n) => {
  const face1End = T_FACE1;
  const flip1End = face1End + T_FLIP;
  const pointsEnd = flip1End + Math.max(1, n) * T_STAGGER + T_POINTS_HOLD;
  const flip2End = pointsEnd + T_FLIP;
  return { face1End, flip1End, pointsEnd, flip2End, total: flip2End + T_FACE3 };
};

const clamp01 = (t) => Math.min(1, Math.max(0, t));
const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
// Symmetric ease — for fades. easeOut front-loads so hard it's ~95% opaque a third
// of the way in, which reads as "no fade at all"; this actually looks like one.
const smooth = (t) => { const x = clamp01(t); return x * x * (3 - 2 * x); };
// Slight overshoot — gives the point drop its kinetic snap.
const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1, x = clamp01(t); return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

/* ============================ canvas helpers ============================ */
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else {
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
}
function cover(ctx, img, x, y, w, h) {
  const ir = img.width / img.height, br = w / h;
  let sw = img.width, sh = img.height, sx = 0, sy = 0;
  if (ir > br) { sw = img.height * br; sx = (img.width - sw) / 2; }
  else { sh = img.width / br; sy = (img.height - sh) / 2; }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}
// Draw text with a tight dark shadow so it stays legible on ANY photo WITHOUT
// darkening the whole card. Repeat passes deepen the shadow, not the glyph weight.
function shadowText(ctx, text, x, y, passes = 2) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.62)";
  ctx.shadowBlur = 16;          // tight — a soft lift, not a dark cloud behind the type
  ctx.shadowOffsetY = 2;
  for (let i = 0; i < passes; i++) ctx.fillText(text, x, y);
  ctx.restore();
}
function wrap(ctx, text, maxW) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = []; let line = "";
  for (const w of words) {
    const t = line ? line + " " + w : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; }
    else line = t;
  }
  if (line) lines.push(line);
  return lines;
}
// Wrap to at most `maxLines`, ellipsizing (and reporting) anything that overflows —
// the card must never spill, and the admin needs to know which point got cut.
function fitLines(ctx, text, maxW, maxLines, font) {
  ctx.font = font;
  const all = wrap(ctx, text, maxW);
  if (all.length <= maxLines) return { lines: all, truncated: false };
  const lines = all.slice(0, maxLines);
  let last = lines[maxLines - 1];
  while (last.length && ctx.measureText(last + "…").width > maxW) last = last.slice(0, -1);
  lines[maxLines - 1] = last.replace(/\s+$/, "") + "…";
  return { lines, truncated: true };
}
const loadImg = (src) => new Promise((res) => {
  if (!src) return res(null);
  const i = new Image();
  i.crossOrigin = "anonymous";          // required or the canvas taints and capture fails
  i.onload = () => res(i);
  i.onerror = () => res(null);
  i.src = src;
});

// Knock the backdrop out of a logo so it sits cleanly on the photo.
// Flood-fills inward from the border rather than globally removing one colour —
// that way white INSIDE the logo (counters, lettering, a white wordmark on a dark
// badge) survives, and only the connected background is cleared. Already-transparent
// PNGs are returned untouched.
// Returns { canvas, ok, removedPct, alreadyCutOut }.
// `ok:false` means the flood ate into the mark itself (a light logo on a light
// backdrop) — the caller should fall back to the original rather than ship a
// half-eaten logo. Tolerance is deliberately tight by default; the admin can raise
// it for noisy JPEGs.
export function removeBackground(img, tol = 18) {
  const draw = () => {
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    c.getContext("2d", { willReadFrequently: true }).drawImage(img, 0, 0);
    return c;
  };
  const c = draw();
  const ctx = c.getContext("2d", { willReadFrequently: true });
  const w = c.width, h = c.height;
  if (!w || !h) return { canvas: c, ok: true, removedPct: 0, alreadyCutOut: false };
  let id;
  try { id = ctx.getImageData(0, 0, w, h); } catch (_) { return { canvas: c, ok: true, removedPct: 0, alreadyCutOut: false }; }
  const d = id.data;
  const at = (x, y) => (y * w + x) * 4;

  // Already a proper cut-out (transparent PNG) — leave it completely alone.
  const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
  const opaque = corners.filter(([x, y]) => d[at(x, y) + 3] > 8);
  if (!opaque.length) return { canvas: c, ok: true, removedPct: 0, alreadyCutOut: true };

  let r = 0, g = 0, b = 0;
  opaque.forEach(([x, y]) => { const i = at(x, y); r += d[i]; g += d[i + 1]; b += d[i + 2]; });
  r /= opaque.length; g /= opaque.length; b /= opaque.length;
  const dist = (i) => Math.abs(d[i] - r) + Math.abs(d[i + 1] - g) + Math.abs(d[i + 2] - b);
  const thresh = tol * 3;

  const seen = new Uint8Array(w * h);
  const stack = [];
  let removed = 0;
  const tryPush = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = y * w + x;
    if (seen[p]) return;
    seen[p] = 1;
    if (dist(p * 4) < thresh) stack.push(p);
  };
  for (let x = 0; x < w; x++) { tryPush(x, 0); tryPush(x, h - 1); }
  for (let y = 0; y < h; y++) { tryPush(0, y); tryPush(w - 1, y); }
  while (stack.length) {
    const p = stack.pop();
    if (d[p * 4 + 3]) removed++;
    d[p * 4 + 3] = 0;
    const x = p % w, y = (p / w) | 0;
    tryPush(x + 1, y); tryPush(x - 1, y); tryPush(x, y + 1); tryPush(x, y - 1);
  }
  const removedPct = removed / (w * h);

  // Sanity: if we cleared nearly the whole image, the mark was the same colour as the
  // backdrop and we just deleted it. Hand back the untouched original instead.
  const opaqueLeft = (() => { let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++; return n; })();
  if (opaqueLeft < w * h * 0.02) return { canvas: draw(), ok: false, removedPct, alreadyCutOut: false };

  // Soften the fringe only where it's genuinely backdrop-coloured.
  const alphaAt = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[at(x, y) + 3]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = at(x, y);
    if (!d[i + 3]) continue;
    if (alphaAt(x + 1, y) && alphaAt(x - 1, y) && alphaAt(x, y + 1) && alphaAt(x, y - 1)) continue;
    const k = dist(i) / thresh;
    if (k < 1) d[i + 3] = Math.round(255 * clamp01(k));
  }
  ctx.putImageData(id, 0, 0);
  return { canvas: c, ok: true, removedPct, alreadyCutOut: false };
}

// Offscreen context used to check point fit outside the render loop.
let _meas = null;
const measCtx = () => {
  if (!_meas && typeof document !== "undefined") _meas = document.createElement("canvas").getContext("2d");
  return _meas;
};
// Lay the points out so the block ALWAYS fits the card: start at the most legible
// size and step down only as far as needed. Returns the chosen metrics plus each
// point's wrapped lines, so the renderer and the admin warning agree exactly.
export function layoutPoints(ctx, points) {
  const avail = PT_AREA_BOT - PT_AREA_TOP;
  const list = points || [];
  let out = null;
  for (const size of PT_SIZES) {
    const lh = Math.round(size * 1.19), gap = Math.round(size * 0.66);
    const blocks = list.map((p) => fitLines(ctx, p.text, PT_MAX_W, PT_MAX_LINES, ptFont(size)));
    const totalH = blocks.reduce((s, b) => s + b.lines.length * lh, 0) + Math.max(0, blocks.length - 1) * gap;
    out = { blocks, size, lh, gap, totalH, fits: totalH <= avail, startY: PT_AREA_TOP + Math.max(0, (avail - totalH) / 2) };
    if (out.fits) break;
  }
  return out;
}
// Which points get ellipsized at the size they'll actually render at.
export function checkPoints(points) {
  const ctx = measCtx();
  if (!ctx || !points?.length) return { truncated: [], size: PT_SIZES[0], fits: true };
  const L = layoutPoints(ctx, points);
  return { truncated: L.blocks.map((b) => b.truncated), size: L.size, fits: L.fits };
}

/* ========================== provenance matching ========================== */
// Find the model's quote inside the ORIGINAL release text and return a context
// window around it. Whitespace is normalised (source docs are full of ragged
// newlines) but nothing else — if the quote isn't genuinely in the document we
// want to know, because that means the point isn't sourced.
export function locate(fullText, quote, pad = 260) {
  const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
  const hay = norm(fullText), needle = norm(quote);
  if (!hay || !needle) return null;
  let i = hay.toLowerCase().indexOf(needle.toLowerCase());
  if (i < 0) {
    // Second chance: punctuation/quote-mark drift (curly vs straight, stray commas).
    const loose = (s) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[^a-z0-9$%./' -]/g, "");
    const lh = loose(hay), ln = loose(needle);
    const j = ln ? lh.indexOf(ln) : -1;
    if (j < 0) return null;
    i = j; // approximate — good enough to show the region
  }
  const start = Math.max(0, i - pad), end = Math.min(hay.length, i + needle.length + pad);
  return {
    before: hay.slice(start, i),
    match: hay.slice(i, i + needle.length),
    after: hay.slice(i + needle.length, end),
    truncStart: start > 0,
    truncEnd: end < hay.length,
  };
}

/* ============================== the frames ============================== */
function faceBase(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#0b1220"); g.addColorStop(1, "#020617");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
function cardShell(ctx) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 60; ctx.shadowOffsetY = 20;
  ctx.fillStyle = "#ffffff";
  rr(ctx, 40, 40, W - 80, H - 80, 48); ctx.fill();
  ctx.restore();
}

// Front: full-bleed site photo, company logo centred over it with a drop shadow so
// it lifts off the image, then the name/ticker and a one-line headline.
function drawFace1(ctx, d, tIn = 99) {
  faceBase(ctx); cardShell(ctx);
  ctx.save(); rr(ctx, 40, 40, W - 80, H - 80, 48); ctx.clip();

  // full-bleed photo
  if (d.projectImg) cover(ctx, d.projectImg, 40, 40, W - 80, H - 80);
  else {
    const g = ctx.createLinearGradient(0, 40, 0, H - 40);
    g.addColorStop(0, "#1e293b"); g.addColorStop(1, "#0b1220");
    ctx.fillStyle = g; ctx.fillRect(40, 40, W - 80, H - 80);
  }
  // No card-wide scrim — the photo stays at its natural exposure. Legibility comes
  // from per-element shadows (shadowText / the logo's own drop shadow) instead, so
  // the only thing that reads as "shadow" on the card is behind the logo.

  const cx = W / 2;

  // Just the logo + the ticker(s) — no company name (the mark carries it) and no
  // strapline. Both fade up over the photo.
  const TICK_GAP = 84, TICK_LH = 52;
  let lw, lh;
  if (d.logoImg) {
    const iw = d.logoImg.width || 1, ih = d.logoImg.height || 1;
    const s = Math.min(LOGO_MAX_W / iw, LOGO_MAX_H / ih);
    lw = iw * s; lh = ih * s;
  } else { lw = lh = 420; }

  const ticks = (d.tickers || []).filter(Boolean);
  const groupH = lh + (ticks.length ? TICK_GAP + TICK_LH : 0);
  const groupTop = (H - groupH) / 2;                 // dead-centre on the card
  const cy = groupTop + lh / 2;

  // fade up over the photo: logo first, tickers following it in
  const aLogo = smooth(tIn / 1.15);
  const aTick = smooth((tIn - 0.6) / 0.95);

  if (d.logoImg) {
    ctx.save();
    ctx.globalAlpha = clamp01(aLogo);
    ctx.shadowColor = "rgba(0,0,0,0.85)"; ctx.shadowBlur = 64; ctx.shadowOffsetY = 20;
    ctx.drawImage(d.logoImg, cx - lw / 2, cy - lh / 2, lw, lh);
    ctx.shadowBlur = 30; ctx.shadowOffsetY = 8;      // second pass deepens the lift
    ctx.drawImage(d.logoImg, cx - lw / 2, cy - lh / 2, lw, lh);
    ctx.restore();
  } else {
    ctx.save();
    ctx.globalAlpha = clamp01(aLogo);
    ctx.shadowColor = "rgba(0,0,0,0.75)"; ctx.shadowBlur = 56; ctx.shadowOffsetY = 18;
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(cx, cy, lh / 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = clamp01(aLogo);
    ctx.fillStyle = INK; ctx.font = "800 168px Inter, system-ui, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText((d.name || "?").slice(0, 1).toUpperCase(), cx, cy + 8);
    ctx.restore();
  }

  // ticker(s) — restrained, wide-tracked caps. Reads as a listing, not a strapline.
  if (ticks.length && aTick > 0) {
    ctx.save();
    ctx.globalAlpha = clamp01(aTick);
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.font = "600 34px Inter, system-ui, sans-serif";
    ctx.letterSpacing = "6px";
    const y = groupTop + lh + TICK_GAP;
    const parts = ticks.map((t) => t.toUpperCase());
    const sepW = ctx.measureText("   •   ").width;
    const widths = parts.map((p) => ctx.measureText(p).width);
    const total = widths.reduce((a, b) => a + b, 0) + sepW * (parts.length - 1);
    let x = cx - total / 2;
    ctx.textAlign = "left";
    parts.forEach((p, i) => {
      ctx.fillStyle = "#fff";
      shadowText(ctx, p, x, y);
      x += widths[i];
      if (i < parts.length - 1) {
        ctx.fillStyle = ACCENT;
        shadowText(ctx, "   •   ", x, y);
        x += sepW;
      }
    });
    ctx.letterSpacing = "0px";
    ctx.restore();
  }
  ctx.restore();
}

// Animated cloud banner — soft radial blobs drifting across a blue field, clipped to
// the banner, so the header feels alive rather than a flat bar.
function drawCloudBanner(ctx, x, y, w, h, t, eyebrow, title) {
  ctx.save();
  ctx.shadowColor = "rgba(37,99,235,0.34)"; ctx.shadowBlur = 36; ctx.shadowOffsetY = 14;
  ctx.fillStyle = "#2563eb"; rr(ctx, x, y, w, h, 34); ctx.fill();
  ctx.restore();

  ctx.save();
  rr(ctx, x, y, w, h, 34); ctx.clip();
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, "#1e40af"); g.addColorStop(0.55, "#2563eb"); g.addColorStop(1, "#38bdf8");
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);

  // drifting clouds — each blob loops across at its own speed
  [[0.10, 0.30, 250, "#93c5fd", 0.055],
   [0.45, 0.72, 300, "#7dd3fc", 0.038],
   [0.78, 0.22, 230, "#bae6fd", 0.047],
   [0.62, 0.46, 200, "#60a5fa", 0.030]].forEach(([bx, by, r, col, sp], i) => {
    const px = x + (((bx + t * sp) % 1.5) - 0.25) * w;
    const py = y + by * h + Math.sin(t * 0.7 + i * 1.3) * 12;
    const rg = ctx.createRadialGradient(px, py, 0, px, py, r);
    rg.addColorStop(0, col + "88"); rg.addColorStop(1, col + "00");
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
  });
  const sheen = ctx.createLinearGradient(x, y, x, y + h);
  sheen.addColorStop(0, "rgba(255,255,255,0.20)"); sheen.addColorStop(0.55, "rgba(255,255,255,0)");
  ctx.fillStyle = sheen; ctx.fillRect(x, y, w, h);
  ctx.restore();

  ctx.save();
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.font = "800 25px Inter, system-ui, sans-serif";
  ctx.letterSpacing = "3px";
  ctx.fillText(eyebrow, x + 46, y + 80);
  ctx.letterSpacing = "0px";
  ctx.fillStyle = "#fff"; ctx.font = "800 58px Inter, system-ui, sans-serif";
  wrap(ctx, String(title || ""), w - 92).slice(0, 1).forEach((ln) => ctx.fillText(ln, x + 46, y + 156));
  ctx.restore();
}

function drawFace2(ctx, d, tIn) {
  faceBase(ctx); cardShell(ctx);
  ctx.save(); rr(ctx, 40, 40, W - 80, H - 80, 48); ctx.clip();
  ctx.fillStyle = "#ffffff"; ctx.fillRect(40, 40, W - 80, H - 80);

  drawCloudBanner(ctx, 80, 94, W - 160, 222, tIn, "WHY INVESTORS ARE WATCHING", d.name);
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";

  // Adaptive layout — guarantees the block fits between PT_AREA_TOP/BOT.
  const pts = (d.points || []).slice(0, MAX_POINTS);
  const L = layoutPoints(ctx, pts);
  let y = L.startY;
  const br = Math.round(L.size * 0.36);        // bullet scales with the chosen type size

  L.blocks.forEach((b, i) => {
    const local = (tIn - i * T_STAGGER) / T_PT_IN;
    const h = b.lines.length * L.lh;
    if (local > 0) {
      const e = easeOutBack(local);              // snap into place with a slight overshoot
      const dy = (1 - e) * 34;
      ctx.globalAlpha = clamp01(local * 1.6);
      // bullet
      const by = y + dy + Math.round(L.lh * 0.52);
      ctx.strokeStyle = ACCENT; ctx.lineWidth = Math.max(4, L.size * 0.095); ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.arc(112, by, br, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(112 - br * 0.46, by); ctx.lineTo(112 - br * 0.08, by + br * 0.44); ctx.lineTo(112 + br * 0.56, by - br * 0.46);
      ctx.stroke();
      // text — large, bold, scannable (dark ink on the white card)
      ctx.fillStyle = INK; ctx.font = ptFont(L.size);
      b.lines.forEach((ln, j) => ctx.fillText(ln, PT_X, y + dy + Math.round(L.lh * 0.72) + j * L.lh));
      ctx.globalAlpha = 1;
    }
    y += h + L.gap;
  });
  ctx.restore();
}

// Authority stamp — "Analyzed & Presented by <brand>" + slogan + follow CTA.
function drawFace3(ctx, d, a) {
  faceBase(ctx); cardShell(ctx);
  ctx.save(); rr(ctx, 40, 40, W - 80, H - 80, 48); ctx.clip();
  const g = ctx.createLinearGradient(0, 40, W, H); g.addColorStop(0, "#0f172a"); g.addColorStop(1, "#0b3b2e");
  ctx.fillStyle = g; ctx.fillRect(40, 40, W - 80, H - 80);

  const cx = W / 2;
  // staggered rise-in, quick and confident
  const step = (delay, dur = 0.4) => easeOut((a - delay) / dur);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";

  // mark
  let e = step(0);
  if (e > 0) {
    ctx.globalAlpha = e;
    ctx.fillStyle = "#fff"; rr(ctx, cx - 66, 372 + (1 - e) * 18, 132, 132, 34); ctx.fill();
    ctx.fillStyle = INK; ctx.font = "800 80px Inter, system-ui, sans-serif";
    ctx.fillText("P", cx, 440 + (1 - e) * 18);
    ctx.globalAlpha = 1;
  }
  // eyebrow
  e = step(0.14);
  if (e > 0) {
    ctx.globalAlpha = e;
    ctx.fillStyle = ACCENT; ctx.font = "800 27px Inter, system-ui, sans-serif";
    ctx.letterSpacing = "3px";
    ctx.fillText("ANALYZED & PRESENTED BY", cx, 585 + (1 - e) * 14);
    ctx.letterSpacing = "0px";
    ctx.globalAlpha = 1;
  }
  // brand name
  e = step(0.22);
  if (e > 0) {
    ctx.globalAlpha = e;
    ctx.fillStyle = "#fff"; ctx.font = "800 86px Inter, system-ui, sans-serif";
    ctx.fillText(BRAND.name, cx, 668 + (1 - e) * 16);
    ctx.globalAlpha = 1;
  }
  // slogan
  e = step(0.32);
  if (e > 0) {
    ctx.globalAlpha = e;
    ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.font = "500 36px Inter, system-ui, sans-serif";
    wrap(ctx, BRAND.slogan, W - 260).forEach((ln, i) => ctx.fillText(ln, cx, 748 + i * 48 + (1 - e) * 12));
    ctx.globalAlpha = 1;
  }
  // rule
  e = step(0.42);
  if (e > 0) {
    ctx.globalAlpha = e * 0.35;
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - 150 * e, 856); ctx.lineTo(cx + 150 * e, 856); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // follow CTA pill
  e = step(0.5);
  if (e > 0) {
    ctx.globalAlpha = e;
    ctx.font = "700 32px Inter, system-ui, sans-serif";
    const tw = ctx.measureText(BRAND.cta).width, pw = tw + 88, ph = 84;
    const py = 928 + (1 - e) * 16;
    ctx.fillStyle = ACCENT; rr(ctx, cx - pw / 2, py, pw, ph, 42); ctx.fill();
    ctx.fillStyle = "#04241b";
    ctx.fillText(BRAND.cta, cx, py + ph / 2 + 1);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

// One frame at time t (seconds). Exported so the render can be driven/verified directly.
export function drawFrame(ctx, t, d) {
  const T = timings((d.points || []).length);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const flip = (p, front, back) => {
    const a = p * Math.PI, sx = Math.cos(a), isBack = p > 0.5;
    ctx.save();
    ctx.translate(W / 2, 0); ctx.scale(isBack ? -sx : sx, 1); ctx.translate(-W / 2, 0);
    (isBack ? back : front)();
    ctx.restore();
  };

  if (t < T.face1End) drawFace1(ctx, d, t);
  else if (t < T.flip1End) flip((t - T.face1End) / T_FLIP, () => drawFace1(ctx, d, t), () => drawFace2(ctx, d, 0));
  else if (t < T.pointsEnd) drawFace2(ctx, d, t - T.flip1End);
  else if (t < T.flip2End) flip((t - T.pointsEnd) / T_FLIP, () => drawFace2(ctx, d, t - T.flip1End), () => drawFace3(ctx, d, 0));
  else drawFace3(ctx, d, t - T.flip2End);
}

/* =========================== recording (MP4) =========================== */
const MIMES = [
  "video/mp4;codecs=avc1.42E01E", "video/mp4;codecs=h264", "video/mp4",   // X-ready
  "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm",          // fallback
];
const pickMime = () => (typeof MediaRecorder === "undefined" ? "" : MIMES.find((m) => MediaRecorder.isTypeSupported(m)) || "");

/* =============================== uploaders =============================== */
const thumbSrc = (x) => (!x ? "" : x.toDataURL ? x.toDataURL() : x.src || "");
const CHECKER = {
  backgroundColor: "#fff",
  backgroundImage: "linear-gradient(45deg,#e2e8f0 25%,transparent 25%),linear-gradient(-45deg,#e2e8f0 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e2e8f0 75%),linear-gradient(-45deg,transparent 75%,#e2e8f0 75%)",
  backgroundSize: "10px 10px",
  backgroundPosition: "0 0,0 5px,5px -5px,-5px 0",
};
function Uploader({ label, hint, img, checker, onPick }) {
  const ref = useRef(null);
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white py-2 pl-2 pr-4">
      <button onClick={() => ref.current?.click()} title={`Upload ${label.toLowerCase()}`}
        className="grid h-12 w-12 flex-shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-200"
        style={checker ? CHECKER : { background: "#f1f5f9" }}>
        {img ? <img src={thumbSrc(img)} alt="" className="h-full w-full object-contain" /> : <ImagePlus size={16} className="text-slate-400" />}
      </button>
      <div className="min-w-0">
        <button onClick={() => ref.current?.click()} className="block text-[13px] font-bold text-slate-800 hover:underline">{label}</button>
        <p className="text-[11.5px] text-slate-400">{hint}</p>
      </div>
      <input ref={ref} type="file" accept="image/*" className="hidden"
        onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}

/* ============================ provenance panel ============================ */
// "Check your work": for each point, show the release it came from and highlight
// the exact quote inside the original document. A point whose quote can't be found
// is called out as UNVERIFIED rather than quietly shown as fine.
function Provenance({ points, timeline }) {
  const byDate = useMemo(() => {
    const m = new Map();
    (timeline || []).forEach((e) => { if (e && e.date) m.set(String(e.date), e); });
    return m;
  }, [timeline]);

  const rows = (points || []).map((p) => {
    const src = p.sourceDate ? byDate.get(String(p.sourceDate)) : null;
    const full = src ? String(src.fullText || src.summary || "") : "";
    return { p, src, full, hit: locate(full, p.quote) };
  });
  const verified = rows.filter((r) => r.hit).length;
  const allGood = verified === rows.length && rows.length > 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-wider text-slate-400">Sources — where each point came from</p>
          <p className="mt-1 text-[13px] text-slate-500">Each quote is matched against the original release text. Anything unmatched is flagged — don't post it without checking.</p>
        </div>
        <span className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-bold ${allGood ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
          {allGood ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />} {verified}/{rows.length} verified in source
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {rows.map(({ p, src, full, hit }, i) => (
          <div key={i} className={`rounded-xl border p-4 ${hit ? "border-slate-200" : "border-amber-300 bg-amber-50/40"}`}>
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-md bg-slate-900 text-[10.5px] font-bold text-white">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold text-slate-900">{p.text}</p>

                {/* source line */}
                <p className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-500">
                  <FileText size={12} className="flex-shrink-0" />
                  {src ? (<>{src.headline || src.title || "Release"} <span className="text-slate-400">· {p.sourceDate}</span></>)
                    : p.sourceDate ? (<span className="text-amber-700">No release found dated {p.sourceDate}</span>)
                    : (<span className="text-slate-400">From the company brief (no release cited)</span>)}
                </p>

                {/* highlighted quote in context */}
                {hit ? (
                  <p className="mt-2.5 rounded-lg bg-slate-50 p-3 text-[12.5px] leading-relaxed text-slate-500">
                    {hit.truncStart && "… "}{hit.before}
                    <mark className="rounded bg-emerald-200 px-1 py-0.5 font-semibold text-emerald-950">{hit.match}</mark>
                    {hit.after}{hit.truncEnd && " …"}
                  </p>
                ) : (
                  <div className="mt-2.5 rounded-lg bg-white p-3">
                    <p className="inline-flex items-center gap-1.5 text-[12px] font-bold text-amber-700">
                      <AlertTriangle size={12} /> UNVERIFIED — this quote isn't in the source text
                    </p>
                    {p.quote && <p className="mt-1.5 text-[12.5px] italic text-slate-500">“{p.quote}”</p>}
                    <p className="mt-1.5 text-[12px] text-slate-500">
                      {full ? "The claimed quote couldn't be located in that release. Verify it yourself before posting, or delete the point."
                            : "No original release text is stored for this source, so it can't be checked automatically."}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="py-6 text-center text-[13px] text-slate-400">No points to check.</p>}
      </div>
    </div>
  );
}

/* ============================== the section ============================== */
export default function AudienceCard() {
  const [companies, setCompanies] = useState([]);
  const [slug, setSlug] = useState("");
  const [card, setCard] = useState(null);
  const [assets, setAssets] = useState({ projectImg: null, logoImg: null, logoRaw: null });
  const [stripBg, setStripBg] = useState(true);
  const [bgTol, setBgTol] = useState(18);
  const [bgWarn, setBgWarn] = useState("");
  const [tickers, setTickers] = useState("");        // comma-separated, editable
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [checking, setChecking] = useState(false);   // "Check your work" panel
  const canvasRef = useRef(null);
  const rafRef = useRef(0);

  const company = companies.find((c) => c.slug === slug) || null;
  const mime = pickMime();
  const isMp4 = mime.startsWith("video/mp4");

  useEffect(() => { (async () => {
    try { const h = await authHeaders(); setCompanies((await fetchCompanies(h)) || []); } catch (_) {}
  })(); }, []);

  const data = card ? {
    name: company?.name || "",
    tickers: tickers.split(",").map((s) => s.trim()).filter(Boolean),
    headline: card.headline, hook: card.hook, points: (card.points || []).slice(0, MAX_POINTS),
    projectImg: assets.projectImg, logoImg: assets.logoImg,
  } : null;

  // Exactly which points get ellipsized at the size they'll actually render at.
  const fit = useMemo(() => checkPoints((card?.points || []).slice(0, MAX_POINTS)), [card]);
  const overflow = fit.truncated;
  const overflowCount = overflow.filter(Boolean).length;

  // Cut a logo out, and report honestly when it can't be done cleanly.
  const cut = useCallback((raw) => {
    if (!raw) return { logoImg: null, warn: "" };
    if (!stripBg) return { logoImg: raw, warn: "" };
    const r = removeBackground(raw, bgTol);
    if (!r.ok) return {
      logoImg: r.canvas,
      warn: "This logo is too close in colour to its own background to separate automatically — using the original. Upload a transparent PNG, or lower the sensitivity.",
    };
    return { logoImg: r.canvas, warn: r.alreadyCutOut ? "Already a transparent PNG — used as-is." : "" };
  }, [stripBg, bgTol]);

  // Pull the company's stored photo/logo + tickers as defaults; uploads override.
  useEffect(() => {
    let alive = true;
    if (!company) { setAssets({ projectImg: null, logoImg: null, logoRaw: null }); setTickers(""); return; }
    const p = company.profile || {};
    setTickers(company.primary_ticker || p.company?.ticker || "");
    (async () => {
      const [pi, li] = await Promise.all([
        loadImg(p.companyStatus?.photo || p.projects?.[0]?.photos?.[0] || ""),
        loadImg(p.company?.logo || p.company?.brand || p.pp?.AVATAR || ""),
      ]);
      if (!alive) return;
      const { logoImg, warn } = cut(li);
      setAssets({ projectImg: pi, logoImg, logoRaw: li });
      setBgWarn(warn);
    })();
    return () => { alive = false; };
  }, [company?.slug]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Re-cut when the toggle or sensitivity changes.
  useEffect(() => {
    setAssets((a) => {
      if (!a.logoRaw) return a;
      const { logoImg, warn } = cut(a.logoRaw);
      setBgWarn(warn);
      return { ...a, logoImg };
    });
  }, [stripBg, bgTol, cut]);

  const onPick = async (file, which) => {
    if (!file) return;
    setErr("");
    const img = await loadImg(URL.createObjectURL(file));
    if (!img) { setErr("Couldn't read that image file."); return; }
    if (which === "logo") {
      const { logoImg, warn } = cut(img);
      setAssets((a) => ({ ...a, logoRaw: img, logoImg }));
      setBgWarn(warn);
    } else setAssets((a) => ({ ...a, projectImg: img }));
  };
  const runtime = card ? timings((card.points || []).slice(0, MAX_POINTS).length).total : 0;

  const draw = useCallback((t) => {
    const c = canvasRef.current; if (!c || !data) return;
    drawFrame(c.getContext("2d"), t, data);
  }, [data]);

  useEffect(() => { if (data) draw(timings(data.points.length).flip1End + 0.6); }, [data, draw]);

  const generate = async () => {
    if (!company) return;
    setErr(""); setBusy("generate"); setCard(null);
    try {
      const p = company.profile || {};
      const res = await fetch("/api/audience-card", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          company: { name: company.name, ticker: company.primary_ticker || p.company?.ticker || "" },
          timeline: p.timeline || [], brief: p.companyBrief || null, projects: p.projects || [],
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
      setCard({ ...j.card, points: (j.card.points || []).slice(0, MAX_POINTS) });   // images are handled by the uploaders
    } catch (e) { setErr(e.message || "Generation failed"); }
    finally { setBusy(""); }
  };

  const run = (record) => new Promise((resolve) => {
    const c = canvasRef.current; if (!c || !data) return resolve();
    const total = timings(data.points.length).total;
    const t0 = performance.now();
    let rec = null; const chunks = [];
    if (record && mime) {
      const stream = c.captureStream(30);
      rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: mime.split(";")[0] });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `${company?.slug || "card"}-passport.${isMp4 ? "mp4" : "webm"}`;
        a.click(); URL.revokeObjectURL(url); resolve();
      };
      rec.start();
    }
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      draw(Math.min(t, total));
      if (t < total) rafRef.current = requestAnimationFrame(tick);
      else if (rec) rec.stop(); else resolve();
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
  });

  const preview = async () => { setBusy("preview"); await run(false); setBusy(""); };
  const exportVid = async () => { setBusy("export"); try { await run(true); } catch (e) { setErr(String(e)); } setBusy(""); };

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-[26px] font-extrabold tracking-tight">Audience Card</h1>
      <p className="mt-1 text-[13.5px] text-slate-500">
        Turns a company's extracted releases into a shareable card video — flips to its top selling points,
        then stamps it with your brand. Kept under 15s for watch-time retention on X.
      </p>

      {/* controls */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <select value={slug} onChange={(e) => { setSlug(e.target.value); setCard(null); }}
          className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[13.5px] font-semibold text-slate-700">
          <option value="">Choose a company…</option>
          {companies.map((c) => <option key={c.slug} value={c.slug}>{c.name || c.slug}</option>)}
        </select>
        <button onClick={generate} disabled={!company || busy === "generate"}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-40">
          {busy === "generate" ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} Generate points
        </button>
        {card && (
          <>
            <button onClick={preview} disabled={!!busy}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13.5px] font-bold text-slate-700 disabled:opacity-40">
              <Play size={16} /> Preview
            </button>
            <button onClick={() => setChecking((v) => !v)}
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[13.5px] font-bold ${checking ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700"}`}>
              <ShieldCheck size={16} /> Check your work
            </button>
            <button onClick={exportVid} disabled={!!busy || !mime}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-40">
              {busy === "export" ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Export {isMp4 ? "MP4" : "WebM"}
            </button>
            <span className={`text-[12.5px] font-bold ${runtime <= 15 ? "text-slate-400" : "text-amber-600"}`}>
              {runtime.toFixed(1)}s runtime
            </span>
          </>
        )}
      </div>

      {/* card artwork */}
      {company && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Uploader label="Front image" hint="the site / project photo" img={assets.projectImg} onPick={(f) => onPick(f, "project")} />
            <Uploader label="Company logo" hint={stripBg ? "background removed" : "as uploaded"} img={assets.logoImg} checker onPick={(f) => onPick(f, "logo")} />
            <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">Ticker(s)</label>
              <input value={tickers} onChange={(e) => setTickers(e.target.value)} placeholder="TSXV:KNG, OTCQB:KNGRF"
                className="w-[230px] bg-transparent text-[13.5px] font-semibold text-slate-800 outline-none placeholder:font-normal placeholder:text-slate-300" />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <label className="inline-flex cursor-pointer items-center gap-2 text-[12.5px] font-semibold text-slate-600">
              <input type="checkbox" checked={stripBg} onChange={(e) => setStripBg(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
              Remove logo background
            </label>
            {stripBg && (
              <label className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-slate-500">
                Sensitivity
                <input type="range" min="6" max="40" value={bgTol} onChange={(e) => setBgTol(Number(e.target.value))} className="w-36 accent-slate-900" />
                <span className="w-6 tabular-nums text-slate-400">{bgTol}</span>
              </label>
            )}
          </div>
          {bgWarn && (
            <p className="mt-2 inline-flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] font-semibold text-amber-700">
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" /> {bgWarn}
            </p>
          )}
        </>
      )}

      {!isMp4 && mime && (
        <p className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] font-semibold text-amber-700">
          <AlertTriangle size={14} /> This browser can't encode MP4 — it'll export WebM. Use Chrome for an X-ready MP4.
        </p>
      )}
      {err && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] font-semibold text-rose-600">{err}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[420px_1fr]">
        {/* canvas preview */}
        <div className="rounded-2xl border border-slate-200 bg-slate-100 p-4">
          <canvas ref={canvasRef} width={W} height={H}
            className="w-full rounded-xl bg-slate-900 shadow-lg" style={{ aspectRatio: "4 / 5" }} />
          <p className="mt-2 text-center text-[11.5px] text-slate-400">1080 × 1350 · 4:5 · {card ? `${runtime.toFixed(1)}s` : "—"}</p>
        </div>

        {/* editable points */}
        <div>
          {!card ? (
            <div className="grid h-full place-items-center rounded-2xl border border-dashed border-slate-200 py-16 text-center">
              <div>
                <Film size={22} className="mx-auto text-slate-300" />
                <p className="mt-2 max-w-[280px] text-[13px] font-medium text-slate-400">
                  Pick a company and generate — the points are pulled from its dropped press releases.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-bold uppercase tracking-wider text-slate-400">Card content — edit before exporting</p>
                <button onClick={generate} className="inline-flex items-center gap-1.5 text-[12px] font-bold text-slate-500 hover:text-slate-900"><RefreshCw size={13} /> Regenerate</button>
              </div>
              <input value={card.headline} onChange={(e) => setCard({ ...card, headline: e.target.value })}
                className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px] font-bold" />
              <input value={card.hook} onChange={(e) => setCard({ ...card, hook: e.target.value })}
                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px]" />

              <div className="mt-4 flex items-center justify-between">
                <p className="text-[12px] font-bold uppercase tracking-wider text-slate-400">{(card.points || []).length}/{MAX_POINTS} points</p>
                {overflowCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-[11.5px] font-bold text-amber-700">
                    <AlertTriangle size={12} /> {overflowCount} will be cut off — shorten {overflowCount === 1 ? "it" : "them"}
                  </span>
                )}
              </div>
              <div className="mt-2 space-y-2">
                {(card.points || []).slice(0, MAX_POINTS).map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-5 text-right text-[11px] font-bold text-slate-300">{i + 1}</span>
                    <div className="relative flex-1">
                      <input value={p.text}
                        onChange={(e) => { const pts = [...card.points]; pts[i] = { ...p, text: e.target.value }; setCard({ ...card, points: pts }); }}
                        className={`w-full rounded-lg border px-3 py-1.5 pr-14 text-[13px] ${overflow[i] ? "border-amber-400 bg-amber-50/50" : "border-slate-200"}`} />
                      <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-[10.5px] font-bold ${overflow[i] ? "text-amber-600" : "text-slate-300"}`}>
                        {String(p.text || "").length}
                      </span>
                    </div>
                    <button onClick={() => setCard({ ...card, points: card.points.filter((_, j) => j !== i) })}
                      className="px-1.5 text-[16px] leading-none text-slate-300 hover:text-rose-500">×</button>
                  </div>
                ))}
              </div>
              {(card.warnings || []).length > 0 && (
                <div className="mt-4 rounded-lg bg-amber-50 px-3 py-2">
                  {card.warnings.map((w, i) => <p key={i} className="text-[12px] font-medium text-amber-700">· {w}</p>)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Check your work — provenance for every point */}
      {card && checking && (
        <div className="mt-6">
          <Provenance points={(card.points || []).slice(0, MAX_POINTS)} timeline={company?.profile?.timeline || []} />
        </div>
      )}
    </div>
  );
}
