// Text measurement and fitting for the carousel.
//
// WHAT WAS WRONG
// --------------
// Wrapping used an assumed average advance -- `size * 0.5`, nudged for weight
// -- and counted CHARACTERS against a budget. Every glyph was treated as the
// same width, so "WWW" and "iii" cost the same. Capitalised headlines and
// technical terms ("31.4 m @ 4.8 g/t Au", "1,742 g/t AgEq") are full of wide
// glyphs and ran past the margin; lowercase prose broke far too early. Font
// size was fixed regardless of how much text there was, so a long headline
// simply overflowed the canvas and was cropped by the viewBox.
//
// WHAT HAPPENS NOW
// ----------------
// Real per-glyph advances, measured from the actual stacks (fontMetrics.js),
// summed per word. Wrapping is by measured width against a real box. Size is
// chosen by fitting: the largest size in a stated range at which the text fits
// the box, found by search, never by hope. If nothing in the range fits, the
// caller is told -- `overflow: true` -- rather than the text being quietly cut.
//
// Nothing here ever truncates. A slide that cannot hold its text reports it,
// and the editor surfaces it, because a figure or a qualifier dropped to make
// a layout work is a disclosure removed from an investor's view.

import { WIDTHS, MONO_ADVANCE, ASCENT, DESCENT } from "./fontMetrics.js";

const FALLBACK = 0.55;   // unmeasured glyph (CJK, emoji): assume wide-ish

/** Width of one string at size 1. Multiply by font size for px. */
export function advance(text, { stack = "sans", weight = 400 } = {}) {
  const t = String(text == null ? "" : text);
  if (stack === "mono") return t.length * MONO_ADVANCE;
  const table = (WIDTHS[stack] || WIDTHS.sans)[weight] || (WIDTHS[stack] || WIDTHS.sans)[400];
  let w = 0;
  for (const ch of t) {
    const cp = ch.codePointAt(0);
    w += (table && table[cp] != null) ? table[cp] : FALLBACK;
  }
  return w;
}

export const measure = (text, size, opts) => advance(text, opts) * size;

/**
 * Wrap by MEASURED width. Returns lines, never dropping a word.
 * A single word longer than the box is kept whole and reported as overflow --
 * breaking "RC-26-088" across lines would corrupt a hole id.
 */
export function wrapText(text, { size, width, stack = "sans", weight = 400, maxLines = Infinity }) {
  const t = String(text == null ? "" : text).replace(/\s+/g, " ").trim();
  if (!t) return { lines: [], overflow: false, widest: 0 };
  const words = t.split(" ");
  const lines = [];
  let line = "";
  let widest = 0;
  let overflow = false;

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate, size, { stack, weight }) <= width || !line) {
      // `|| !line` keeps an over-long single word intact on its own line.
      if (!line && measure(word, size, { stack, weight }) > width) overflow = true;
      line = candidate;
    } else {
      lines.push(line);
      widest = Math.max(widest, measure(line, size, { stack, weight }));
      line = word;
      if (measure(word, size, { stack, weight }) > width) overflow = true;
    }
  }
  if (line) { lines.push(line); widest = Math.max(widest, measure(line, size, { stack, weight })); }
  if (lines.length > maxLines) overflow = true;      // reported, not trimmed
  return { lines, overflow, widest };
}

/**
 * The largest size in [min, max] at which `text` fits `width` x `height`.
 * Binary search on an integer size; returns the fitted lines with it.
 */
export function fitText(text, {
  width, height, min = 18, max = 160, stack = "sans", weight = 400, lh = 1.2, maxLines = Infinity,
}) {
  const fits = (size) => {
    const r = wrapText(text, { size, width, stack, weight, maxLines: Infinity });
    const h = r.lines.length * size * lh;
    return { ok: h <= height && !r.overflow && r.lines.length <= maxLines, r, h };
  };
  let lo = min, hi = Math.max(min, Math.round(max)), best = null;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const f = fits(mid);
    if (f.ok) { best = { size: mid, ...f }; lo = mid + 1; } else { hi = mid - 1; }
  }
  if (best) return { size: best.size, lines: best.r.lines, height: best.h, overflow: false };
  // Nothing in range fits. Lay it out at the minimum and SAY SO -- the caller
  // shows a warning; the words stay whole.
  const r = wrapText(text, { size: min, width, stack, weight });
  return { size: min, lines: r.lines, height: r.lines.length * min * lh, overflow: true };
}

/** Baseline of the first line so a block of `n` lines is optically centred in
 *  a box, using real ascent/descent rather than half the font size. */
export function centredBaseline(boxTop, boxHeight, lineCount, size, lh = 1.2) {
  const block = (lineCount - 1) * size * lh + size * (ASCENT + DESCENT);
  return boxTop + (boxHeight - block) / 2 + size * ASCENT;
}

/** Baseline of the first line for a top-aligned block. */
export const topBaseline = (boxTop, size) => boxTop + size * ASCENT;

/** Cap height, for aligning a figure's baseline against a label. */
export const capHeight = (size) => size * ASCENT;
