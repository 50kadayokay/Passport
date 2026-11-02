// TWENTY COMPOSITIONS, grouped by what each slide has to say.
//
// These are different ARRANGEMENTS, not different palettes: where the eye
// lands, what dominates, whether the page is split, bled, gridded or centred.
// A family supplies the voice (type stack, palette, furniture); a layout
// supplies the structure. Changing either produces a visibly different slide,
// and changing both produces a different design.
//
// Every text block is fitted by the engine, so nothing is ever cropped and
// nothing is ever silently shortened to fit.

import React from "react";
import { fitText, wrapText, measure, centredBaseline, topBaseline } from "./textEngine.js";

export const W = 1080, H = 1350;

/* ---------------- primitives ---------------- */

const stackOf = (t) => (/serif|Iowan|Palatino|Georgia/.test(t.f) ? "serif" : /Mono|Menlo|Consolas/.test(t.f) ? "mono" : "sans");

/** A fitted block of text. Reports overflow upward instead of clipping. */
function Block({ text, x, y, w, h, t, fill, size, min, max, lh = 1.2, anchor = "start", centreIn, maxLines, warn }) {
  const stack = stackOf(t);
  const weight = t.w || 400;
  const fit = size
    ? { size, ...wrapText(text, { size, width: w, stack, weight }), height: 0 }
    : fitText(text, { width: w, height: h, min: min || 16, max: max || t.s, stack, weight, lh, maxLines });
  const lines = fit.lines || [];
  if (fit.overflow && warn) warn();
  if (!lines.length) return null;
  const fs = fit.size;
  const first = centreIn
    ? centredBaseline(centreIn[0], centreIn[1], lines.length, fs, lh)
    : topBaseline(y, fs);
  return (
    <>
      {lines.map((ln, i) => (
        <text key={i} x={anchor === "middle" ? x + w / 2 : anchor === "end" ? x + w : x}
          y={first + i * fs * lh} fill={fill} textAnchor={anchor}
          fontFamily={t.f} fontSize={fs} fontWeight={weight}
          letterSpacing={t.tr || undefined}>
          {t.up ? ln.toUpperCase() : ln}
        </text>
      ))}
    </>
  );
}

/** One line, auto-shrunk to fit its width. Used for eyebrows, meta, tickers. */
function Line({ text, x, y, w, t, fill, anchor = "start", warn }) {
  const s = String(text == null ? "" : text).trim();
  if (!s) return null;
  const stack = stackOf(t), weight = t.w || 400;
  const label = t.up ? s.toUpperCase() : s;
  const natural = measure(label, t.s, { stack, weight }) + (t.tr || 0) * label.length;
  const size = natural > w ? Math.max(12, Math.floor(t.s * (w / natural))) : t.s;
  if (natural > w && warn) warn();
  return (
    <text x={anchor === "middle" ? x + w / 2 : anchor === "end" ? x + w : x} y={y} fill={fill}
      textAnchor={anchor} fontFamily={t.f} fontSize={size} fontWeight={weight} letterSpacing={t.tr || undefined}>
      {label}
    </text>
  );
}

/** How a family treats a photograph. This is where "cinematic" and
 *  "editorial" stop being adjectives: Bleed runs the image to the edge,
 *  Broadsheet insets it as a plate, Grid crops it square to the column, Core
 *  takes a specimen strip, Paper rounds and lifts it, Obsidian darkens it to a
 *  ground that type can sit on. */
export function photoRect(fam, { x, y, w, h }) {
  switch (fam.photo) {
    case "inset":   return { x: x + 36, y: y + 28, w: w - 72, h: h - 56, r: 0, dim: 0 };
    case "rounded": return { x: x + 28, y: y + 24, w: w - 56, h: h - 48, r: fam.radius || 28, dim: 0 };
    case "square":  return { x, y, w, h: Math.min(h, w), r: 0, dim: 0 };
    case "strip":   return { x, y: y + h * 0.12, w, h: h * 0.76, r: 0, dim: 0 };
    case "darken":  return { x, y, w, h, r: 0, dim: 0.42 };
    default:        return { x, y, w, h, r: 0, dim: 0 };
  }
}

const Img = ({ href, x, y, w, h, id, r = 0, dim = 0 }) => href ? (
  <>
    <clipPath id={id}><rect x={x} y={y} width={w} height={h} rx={r} /></clipPath>
    <image href={href} x={x} y={y} width={w} height={h} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${id})`} />
    {dim > 0 ? <rect x={x} y={y} width={w} height={h} fill="#000" opacity={dim} clipPath={`url(#${id})`} /> : null}
  </>
) : null;

/** A company's mark, laid in without cropping, stretching or rounding.
 *  Logos arrive square, wide (a wordmark), tall, or transparent. `slice` plus
 *  a corner radius -- which is right for a photograph -- cut the ends off a
 *  wordmark and put rounded corners on a transparent PNG that has none. This
 *  CONTAINS the mark in a box sized from its own aspect ratio, so every shape
 *  sits at the same optical weight. */
const Logo = ({ href, x, y, h, aspect = 1, align = "start", max = 420 }) => {
  if (!href) return null;
  const a = Number(aspect) > 0 ? Number(aspect) : 1;
  const w = Math.min(max, Math.round(h * a));
  const lx = align === "middle" ? x - w / 2 : x;
  return <image href={href} x={lx} y={y} width={w} height={h} preserveAspectRatio="xMidYMid meet" />;
};

const Scrim = ({ x, y, w, h, id, from = 0, to = 0.82 }) => (
  <>
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#000" stopOpacity={from} />
      <stop offset="100%" stopColor="#000" stopOpacity={to} />
    </linearGradient>
    <rect x={x} y={y} width={w} height={h} fill={`url(#${id})`} />
  </>
);

// Readable ink on an arbitrary accent — so a company picking a pale brand
// colour cannot accidentally publish unreadable slides.
export function inkOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 0.42 ? "#0b1220" : "#ffffff";
}

/** Evenly distributed band tops between two edges. Layouts place content by
 *  DIVIDING THE FIELD rather than by fixed offsets, which is what left banner
 *  and monolith with a dead strip along the bottom: their content was pinned
 *  near the top and the canvas kept going. */
function bands(top, bottom, n) {
  const h = (bottom - top) / Math.max(1, n);
  return Array.from({ length: n }, (_, i) => ({ y: top + i * h, h }));
}

/** One metric: figure left, descriptor right, sharing a baseline.
 *  The descriptor used to be dropped at an arbitrary offset, so a 96px figure
 *  and a 26px description floated at different heights on every row. Both are
 *  now set from the same baseline, with the unit hung beneath the figure. */
function Metric({ fam, accent, r, x, y, w, figureSize, descSize, split = 0.42, warn }) {
  const T = fam.type;
  const figW = w * split - 28;
  const descX = x + w * split;
  const descW = w - w * split;
  return (<>
    <Block text={r.v} x={x} y={y} w={figW} h={figureSize * 1.25} t={{ ...T.figure, s: figureSize }}
      fill={accent} min={Math.round(figureSize * 0.45)} max={figureSize} lh={1} warn={warn} />
    {r.u ? <Line text={r.u} x={x} y={y + figureSize * 0.74 + 40} w={figW} t={{ ...T.unit, s: Math.max(20, Math.round(figureSize * 0.26)) }} fill={fam.muted} warn={warn} /> : null}
    <Block text={r.desc} x={descX} y={y} w={descW} h={figureSize * 1.4} t={{ ...T.desc, s: descSize }}
      fill={fam.fg} min={18} max={descSize} lh={1.3} warn={warn} />
  </>);
}

/* ---------------- ANNOUNCEMENT ---------------- */

const editorial = ({ fam, accent, brand, f, P, warn }) => {
  const T = fam.type, L = P.L, w = P.w;
  return (<>
    <line x1={L} y1={P.pad + 212} x2={L + 200} y2={P.pad + 212} stroke={accent} strokeWidth="5" />
    <Line text={f.eyebrow} x={L} y={P.pad + 172} w={w} t={T.eyebrow} fill={accent} warn={warn} />
    {/* Centred in the field between the rule and the footer, so a short
        headline does not leave a dead lower third. */}
    <Block text={f.headline} x={L} y={0} w={w} h={H - (P.pad + 280) - (P.pad + 150)} t={T.title} fill={fam.fg}
      centreIn={[P.pad + 280, H - (P.pad + 280) - (P.pad + 150)]} min={44} max={T.title.s} lh={T.title.lh} warn={warn} />
    <Line text={[f.project, f.date].filter(Boolean).join("   ·   ")} x={L} y={H - P.pad - 70} w={w} t={T.meta} fill={fam.muted} warn={warn} />
    <Line text={brand.name} x={L} y={H - P.pad} w={w} t={T.meta} fill={fam.fg} warn={warn} />
  </>);
};

const poster = ({ fam, accent, brand, f, P, warn }) => {
  const T = fam.type, L = P.L, w = P.w;
  return (<>
    <Line text={f.eyebrow} x={L} y={P.pad + 40} w={w} t={T.eyebrow} fill={accent} warn={warn} />
    <Block text={f.headline} x={L} y={P.pad + 110} w={w} h={940} t={T.title} fill={fam.fg}
      min={56} max={Math.round(T.title.s * 1.5)} lh={0.98} warn={warn} />
    <Line text={[brand.name, f.date].filter(Boolean).join("   ·   ")} x={L} y={H - P.pad} w={w} t={T.meta} fill={fam.muted} warn={warn} />
  </>);
};

const centredLux = ({ fam, accent, brand, f, P, warn }) => {
  const T = fam.type, L = P.L, w = P.w;
  return (<>
    <Line text={f.eyebrow} x={L} y={P.pad + 120} w={w} t={T.eyebrow} fill={accent} anchor="middle" warn={warn} />
    <line x1={W / 2 - 40} y1={P.pad + 170} x2={W / 2 + 40} y2={P.pad + 170} stroke={accent} strokeWidth="2" />
    <Block text={f.headline} x={L} y={0} w={w} h={620} t={T.title} fill={fam.fg} anchor="middle"
      centreIn={[380, 560]} min={40} max={Math.round(T.title.s * 0.95)} lh={1.14} warn={warn} />
    <Line text={f.project} x={L} y={H - P.pad - 74} w={w} t={T.meta} fill={fam.fg} anchor="middle" warn={warn} />
    <Line text={f.date} x={L} y={H - P.pad - 24} w={w} t={T.meta} fill={fam.muted} anchor="middle" warn={warn} />
  </>);
};

const bleedPhoto = ({ fam, accent, brand, f, P, imageHref, warn }) => {
  const T = fam.type, L = P.L, w = P.w;
  if (!imageHref) return editorial({ fam, accent, brand, f, P, warn });
  return (<>
    <Img href={imageHref} x={0} y={0} w={W} h={H} id="annbleed" />
    <Scrim x={0} y={H * 0.3} w={W} h={H * 0.7} id="anngrad" from={0} to={0.88} />
    <Line text={f.eyebrow} x={L} y={H - 420} w={w} t={T.eyebrow} fill="#fff" warn={warn} />
    <Block text={f.headline} x={L} y={H - 380} w={w} h={250} t={T.title} fill="#ffffff" min={40} max={T.title.s} lh={1.06} warn={warn} />
    <rect x={L} y={H - P.pad - 46} width={54} height={4} fill={accent} />
    <Line text={[brand.name, f.date].filter(Boolean).join("   ·   ")} x={L} y={H - P.pad} w={w} t={T.meta} fill="rgba(255,255,255,0.82)" warn={warn} />
  </>);
};

const sidebar = ({ fam, accent, brand, f, P, warn }) => {
  const T = fam.type, bw = 300, L = bw + 72, w = W - L - P.pad;
  const ink = inkOn(accent);
  return (<>
    <rect x={0} y={0} width={bw} height={H} fill={accent} />
    <g transform={`translate(${P.pad / 2 + 24} ${H - P.pad}) rotate(-90)`}>
      <Line text={brand.name} x={0} y={0} w={900} t={{ ...T.meta, s: 26 }} fill={ink} warn={warn} />
    </g>
    <Line text={f.eyebrow} x={L} y={P.pad + 60} w={w} t={T.eyebrow} fill={accent} warn={warn} />
    <Block text={f.headline} x={L} y={0} w={w} h={700} t={T.title} fill={fam.fg}
      centreIn={[300, 700]} min={40} max={Math.round(T.title.s * 0.92)} lh={1.08} warn={warn} />
    <Line text={[f.project, f.date].filter(Boolean).join("  ·  ")} x={L} y={H - P.pad} w={w} t={T.meta} fill={fam.muted} warn={warn} />
  </>);
};

/* ---------------- KEY RESULTS ---------------- */

const rowsOf = (f) => (f.rows || []).filter((r) => r && (r.v || r.desc));

const stackRows = ({ fam, accent, f, P, warn }) => {
  const T = fam.type, L = P.L, w = P.w, rows = rowsOf(f).slice(0, 4);
  const B = bands(P.pad + 190, H - P.pad, rows.length);
  const fig = rows.length >= 4 ? 84 : rows.length === 3 ? 104 : 124;
  return (<>
    <Line text={f.title} x={L} y={P.pad + 60} w={w} t={T.eyebrow} fill={accent} warn={warn} />
    {rows.map((r, i) => (
      <g key={i}>
        {i > 0 && <line x1={L} y1={B[i].y - 34} x2={W - P.pad} y2={B[i].y - 34} stroke={fam.rule} strokeWidth="2" />}
        <Metric fam={fam} accent={accent} r={r} x={L} y={B[i].y + 10} w={w}
          figureSize={Math.min(T.figure.s, fig)} descSize={Math.min(T.desc.s + 4, 32)} split={0.44} warn={warn} />
      </g>
    ))}
  </>);
};

const monolith = ({ fam, accent, f, P, warn }) => {
  const T = fam.type, L = P.L, w = P.w, rows = rowsOf(f);
  const hero = rows[0], rest = rows.slice(1, 3);
  if (!hero) return null;
  // The hero owns the upper half; the remainder owns the lower. Neither is
  // pinned to an offset, so there is no leftover strip at the bottom.
  const split = rest.length ? 760 : H - P.pad;
  return (<>
    <Line text={f.title} x={L} y={P.pad + 60} w={w} t={T.eyebrow} fill={accent} anchor="middle" warn={warn} />
    <Block text={hero.v} x={L} y={0} w={w} h={300} t={{ ...T.figure, s: 230 }} fill={accent} anchor="middle"
      centreIn={[P.pad + 150, 320]} min={70} max={230} lh={1} warn={warn} />
    {hero.u ? <Line text={hero.u} x={L} y={P.pad + 500} w={w} t={{ ...T.unit, s: 36 }} fill={fam.muted} anchor="middle" warn={warn} /> : null}
    <Block text={hero.desc} x={L + w * 0.08} y={0} w={w * 0.84} h={170} t={{ ...T.desc, s: 38 }} fill={fam.fg} anchor="middle"
      centreIn={[P.pad + 540, 170]} min={22} max={38} lh={1.34} warn={warn} />
    {rest.length ? <line x1={L + w * 0.36} y1={split - 40} x2={L + w * 0.64} y2={split - 40} stroke={fam.rule} strokeWidth="2" /> : null}
    {rest.map((r, i) => {
      const B = bands(split, H - P.pad, rest.length)[i];
      return (
        <g key={i}>
          <Line text={[r.v, r.u].filter(Boolean).join(" ")} x={L} y={B.y + B.h * 0.42} w={w}
            t={{ ...T.desc, s: 52, w: 700 }} fill={accent} anchor="middle" warn={warn} />
          <Block text={r.desc} x={L + w * 0.08} y={B.y + B.h * 0.5} w={w * 0.84} h={B.h * 0.42}
            t={{ ...T.desc, s: 30 }} fill={fam.muted} anchor="middle" min={20} max={30} lh={1.3} warn={warn} />
        </g>
      );
    })}
  </>);
};

const quadrant = ({ fam, accent, f, P, warn }) => {
  const T = fam.type, L = P.L, w = P.w, rows = rowsOf(f).slice(0, 4);
  // The grid fills the field rather than hanging from the top: two rows across
  // whatever is left between the eyebrow and the lower margin.
  const top = P.pad + 200;
  const cw = w / 2, ch = (H - top - P.pad) / 2;
  return (<>
    <Line text={f.title} x={L} y={P.pad + 60} w={w} t={T.eyebrow} fill={accent} warn={warn} />
    <line x1={L + cw} y1={top - 50} x2={L + cw} y2={H - P.pad - 30} stroke={fam.rule} strokeWidth="2" />
    <line x1={L} y1={top + ch - 50} x2={W - P.pad} y2={top + ch - 50} stroke={fam.rule} strokeWidth="2" />
    {rows.map((r, i) => {
      const x = L + (i % 2) * cw + (i % 2 ? 36 : 0), y = top + Math.floor(i / 2) * ch;
      const cwi = cw - 44;
      return (<g key={i}>
        <Block text={r.v} x={x} y={y} w={cwi} h={120} t={{ ...T.figure, s: 104 }} fill={accent} min={38} max={104} lh={1} warn={warn} />
        {r.u ? <Line text={r.u} x={x} y={y + 150} w={cwi} t={T.unit} fill={fam.muted} warn={warn} /> : null}
        <Block text={r.desc} x={x} y={y + (r.u ? 186 : 150)} w={cwi} h={110} t={{ ...T.desc, s: 26 }} fill={fam.fg} min={17} max={26} lh={1.3} warn={warn} />
      </g>);
    })}
  </>);
};

const ledger = ({ fam, accent, f, P, warn }) => {
  const T = fam.type, L = P.L, w = P.w, rows = rowsOf(f).slice(0, 4);
  const top = P.pad + 210, rh = (H - top - P.pad) / Math.max(1, rows.length);
  const mono = { f: "'SF Mono','Roboto Mono',Menlo,Consolas,monospace", s: 30, w: 500 };
  return (<>
    <Line text={f.title} x={L} y={P.pad + 60} w={w} t={T.eyebrow} fill={accent} warn={warn} />
    <Line text="VALUE" x={L} y={top - 44} w={w * 0.4} t={{ ...mono, s: 20, tr: 4 }} fill={fam.muted} warn={warn} />
    <Line text="DESCRIPTION" x={L + w * 0.42} y={top - 44} w={w * 0.58} t={{ ...mono, s: 20, tr: 4 }} fill={fam.muted} warn={warn} />
    <line x1={L} y1={top - 20} x2={W - P.pad} y2={top - 20} stroke={accent} strokeWidth="3" />
    {rows.map((r, i) => {
      const y = top + i * rh;
      return (<g key={i}>
        {i > 0 && <line x1={L} y1={y - 34} x2={W - P.pad} y2={y - 34} stroke={fam.rule} strokeWidth="1" />}
        <Line text={[r.v, r.u].filter(Boolean).join(" ")} x={L} y={y + 42} w={w * 0.4} t={{ ...mono, s: 44, w: 600 }} fill={accent} warn={warn} />
        <Block text={r.desc} x={L + w * 0.42} y={y} w={w * 0.58} h={Math.max(80, rh - 60)} t={{ ...T.desc, s: 28 }} fill={fam.fg} min={18} max={28} lh={1.28} warn={warn} />
      </g>);
    })}
  </>);
};

const banner = ({ fam, accent, f, P, warn }) => {
  const T = fam.type, L = P.L, w = P.w, rows = rowsOf(f), hero = rows[0];
  if (!hero) return null;
  const ink = inkOn(accent);
  const rest = rows.slice(1, 3);
  const fieldH = 640;
  return (<>
    <rect x={0} y={0} width={W} height={fieldH} fill={accent} />
    <Line text={f.title} x={L} y={P.pad + 50} w={w} t={T.eyebrow} fill={ink} warn={warn} />
    <Block text={hero.v} x={L} y={0} w={w} h={300} t={{ ...T.figure, s: 200 }} fill={ink}
      centreIn={[P.pad + 110, 300]} min={64} max={200} lh={1} warn={warn} />
    {hero.u ? <Line text={hero.u} x={L} y={fieldH - 72} w={w} t={{ ...T.unit, s: 34 }} fill={ink} warn={warn} /> : null}
    {/* Everything below the field shares the remaining height equally. */}
    {(() => {
      const B = bands(fieldH + 70, H - P.pad, 1 + rest.length);
      return (<>
        <Block text={hero.desc} x={L} y={B[0].y} w={w} h={B[0].h - 40} t={{ ...T.desc, s: 40 }} fill={fam.fg}
          min={24} max={40} lh={1.34} warn={warn} />
        {rest.map((r, i) => (
          <g key={i}>
            <line x1={L} y1={B[i + 1].y - 26} x2={W - P.pad} y2={B[i + 1].y - 26} stroke={fam.rule} strokeWidth="2" />
            <Metric fam={fam} accent={accent} r={r} x={L} y={B[i + 1].y + 14} w={w}
              figureSize={78} descSize={30} split={0.42} warn={warn} />
          </g>
        ))}
      </>);
    })()}
  </>);
};

/* ---------------- CONTEXT ---------------- */

const fullBleedCtx = ({ fam, accent, f, P, imageHref, warn }) => {
  const T = fam.type, L = P.L, w = P.w;
  if (!imageHref) return textOnly({ fam, accent, f, P, warn });
  return (<>
    <Img href={imageHref} x={0} y={0} w={W} h={H} id="ctxbleed" />
    <Scrim x={0} y={H * 0.26} w={W} h={H * 0.74} id="ctxgrad" from={0} to={0.9} />
    <Line text={f.title} x={L} y={H - 380} w={w} t={T.eyebrow} fill={accent} warn={warn} />
    <Block text={f.body} x={L} y={H - 330} w={w} h={240} t={{ ...T.body, s: 38 }} fill="#ffffff" min={22} max={38} lh={1.45} warn={warn} />
  </>);
};

const halfSplit = ({ fam, accent, f, P, imageHref, warn }) => {
  const T = fam.type, L = P.L, w = P.w;
  if (!imageHref) return textOnly({ fam, accent, f, P, warn });
  return (<>
    {(() => { const R = photoRect(fam, { x: 0, y: 0, w: W, h: 660 });
      return <Img href={imageHref} {...R} id="ctxhalf" />; })()}
    <rect x={0} y={660} width={W} height={H - 660} fill={fam.bg} />
    <rect x={L} y={700} width={64} height={5} fill={accent} />
    <Line text={f.title} x={L} y={770} w={w} t={T.eyebrow} fill={accent} warn={warn} />
    <Block text={f.body} x={L} y={0} w={w} h={H - 820 - P.pad} t={T.body} fill={fam.fg}
      centreIn={[812, H - 812 - P.pad]} min={22} max={T.body.s + 6} lh={1.5} warn={warn} />
  </>);
};

const verticalSplit = ({ fam, accent, f, P, imageHref, warn }) => {
  const T = fam.type;
  if (!imageHref) return textOnly({ fam, accent, f, P, warn });
  const iw = 460, L = iw + 72, w = W - L - P.pad;
  const R = photoRect(fam, { x: 0, y: 0, w: iw, h: H });
  const strip = fam.photo === "strip";
  return (<>
    {/* A specimen strip has to read as a deliberate cut, not as an image that
        failed to fill. The band it sits in is inked, and an accent rule caps
        each end -- legible even at thumbnail size. */}
    {strip ? <rect x={0} y={0} width={iw} height={H} fill={fam.dark ? "#000" : "#0f172a"} /> : null}
    <Img href={imageHref} {...R} id="ctxvert" />
    {strip ? (<>
      <rect x={0} y={R.y - 6} width={iw} height={6} fill={accent} />
      <rect x={0} y={R.y + R.h} width={iw} height={6} fill={accent} />
    </>) : null}
    <Line text={f.title} x={L} y={P.pad + 60} w={w} t={T.eyebrow} fill={accent} warn={warn} />
    <Block text={f.body} x={L} y={0} w={w} h={820} t={{ ...T.body, s: 34 }} fill={fam.fg}
      centreIn={[260, 820]} min={20} max={34} lh={1.5} warn={warn} />
  </>);
};

const textOnly = ({ fam, accent, f, P, warn }) => {
  const T = fam.type, L = P.L, w = P.w;
  return (<>
    <Line text={f.title} x={L} y={P.pad + 60} w={w} t={T.eyebrow} fill={accent} warn={warn} />
    <line x1={L} y1={P.pad + 110} x2={L + 160} y2={P.pad + 110} stroke={accent} strokeWidth="4" />
    <Block text={f.body} x={L} y={0} w={w} h={860} t={{ ...T.body, s: Math.round(T.body.s * 1.25) }} fill={fam.fg}
      centreIn={[260, 860]} min={24} max={Math.round(T.body.s * 1.25)} lh={1.5} warn={warn} />
  </>);
};

/* ---------------- WHY ---------------- */

const pullQuote = ({ fam, accent, f, P, warn }) => {
  const T = fam.type, L = P.L + 48, w = P.w - 48;
  return (<>
    <Line text={f.title} x={P.L} y={P.pad + 60} w={P.w} t={T.eyebrow} fill={accent} warn={warn} />
    <rect x={P.L} y={330} width={7} height={640} fill={accent} />
    <Block text={f.body} x={L} y={0} w={w} h={640} t={{ ...T.body, s: 56, w: 500 }} fill={fam.fg}
      centreIn={[330, 640]} min={28} max={56} lh={1.32} warn={warn} />
  </>);
};

const centredStatement = ({ fam, accent, f, P, warn }) => {
  const T = fam.type, L = P.L + 40, w = P.w - 80;
  // The statement is centred in EVERYTHING below the eyebrow, with the rule
  // closing the composition just under it rather than drifting to the foot.
  const top = P.pad + 180, field = H - top - P.pad - 90;
  return (<>
    <Line text={f.title} x={P.L} y={P.pad + 100} w={P.w} t={T.eyebrow} fill={accent} anchor="middle" warn={warn} />
    <Block text={f.body} x={L} y={0} w={w} h={field} t={{ ...T.body, s: 56, w: 500 }} fill={fam.fg} anchor="middle"
      centreIn={[top, field]} min={28} max={56} lh={1.36} warn={warn} />
    <line x1={W / 2 - 36} y1={top + field + 46} x2={W / 2 + 36} y2={top + field + 46} stroke={accent} strokeWidth="3" />
  </>);
};

const panel = ({ fam, accent, f, P, warn }) => {
  const T = fam.type, ink = inkOn(accent), L = P.L + 52, w = P.w - 104;
  return (<>
    <rect x={P.pad - 20} y={280} width={W - (P.pad - 20) * 2} height={790} rx={fam.radius ? 28 : 0} fill={accent} />
    <Line text={f.title} x={L} y={370} w={w} t={T.eyebrow} fill={ink} warn={warn} />
    <Block text={f.body} x={L} y={0} w={w} h={560} t={{ ...T.body, s: 48, w: 500 }} fill={ink}
      centreIn={[420, 560]} min={24} max={48} lh={1.36} warn={warn} />
  </>);
};

/* ---------------- CLOSING ---------------- */

const closeStacked = ({ fam, accent, brand, f, P, logoHref, logoAspect, warn }) => {
  const T = fam.type, L = P.L, w = P.w;
  return (<>
    {/* Distributed across the field rather than stacked from a fixed offset,
        so a company with no logo or a short name does not leave a void. */}
    {(() => {
      const B = bands(P.pad + 170, H - P.pad, 4);
      return (<>
        {logoHref ? <Logo href={logoHref} x={L} y={B[0].y} h={132} aspect={logoAspect} /> : null}
        <Block text={brand.name} x={L} y={B[1].y} w={w} h={B[1].h - 30} t={{ ...T.title, s: 60 }} fill={fam.fg} min={30} max={60} lh={1.1} warn={warn} />
        <Line text={(f.tickers || []).map((t) => `${t.ex} ${t.sym}`).join("   ·   ")} x={L} y={B[2].y + 40} w={w} t={{ ...T.meta, s: 28 }} fill={accent} warn={warn} />
        <line x1={L} y1={B[2].y + 86} x2={W - P.pad} y2={B[2].y + 86} stroke={fam.rule} strokeWidth="2" />
        <Line text={f.cta} x={L} y={B[3].y + 36} w={w} t={{ ...T.body, s: 34, w: 600 }} fill={fam.fg} warn={warn} />
        <Block text={f.url} x={L} y={B[3].y + 60} w={w} h={100} t={{ ...T.meta, s: 24 }} fill={fam.muted} min={16} max={24} lh={1.3} warn={warn} />
      </>);
    })()}
  </>);
};

const centredMark = ({ fam, accent, brand, f, P, logoHref, logoAspect, warn }) => {
  const T = fam.type, L = P.L, w = P.w;
  return (<>
    {logoHref ? <Logo href={logoHref} x={W / 2} y={420} h={140} aspect={logoAspect} align="middle" /> : null}
    <Block text={brand.name} x={L} y={0} w={w} h={120} t={{ ...T.title, s: 54 }} fill={fam.fg} anchor="middle"
      centreIn={[620, 120]} min={28} max={54} lh={1.1} warn={warn} />
    <line x1={W / 2 - 30} y1={790} x2={W / 2 + 30} y2={790} stroke={accent} strokeWidth="3" />
    <Line text={(f.tickers || []).map((t) => `${t.ex} ${t.sym}`).join("   ·   ")} x={L} y={860} w={w} t={{ ...T.meta, s: 26 }} fill={accent} anchor="middle" warn={warn} />
    <Line text={f.cta} x={L} y={940} w={w} t={{ ...T.body, s: 32, w: 600 }} fill={fam.fg} anchor="middle" warn={warn} />
    <Block text={f.url} x={L} y={980} w={w} h={80} t={{ ...T.meta, s: 22 }} fill={fam.muted} anchor="middle" min={15} max={22} lh={1.3} warn={warn} />
  </>);
};

const tickerBar = ({ fam, accent, brand, f, P, logoHref, logoAspect, warn }) => {
  const T = fam.type, L = P.L, w = P.w, ink = inkOn(accent);
  return (<>
    {logoHref ? <Logo href={logoHref} x={L} y={300} h={124} aspect={logoAspect} /> : null}
    <Block text={brand.name} x={L} y={480} w={w} h={190} t={{ ...T.title, s: 68 }} fill={fam.fg} min={32} max={68} lh={1.08} warn={warn} />
    <Line text={f.cta} x={L} y={760} w={w} t={{ ...T.body, s: 34, w: 600 }} fill={fam.fg} warn={warn} />
    <Block text={f.url} x={L} y={800} w={w} h={90} t={{ ...T.meta, s: 24 }} fill={fam.muted} min={16} max={24} lh={1.3} warn={warn} />
    <rect x={0} y={H - 180} width={W} height={180} fill={accent} />
    <Line text={(f.tickers || []).map((t) => `${t.ex} ${t.sym}`).join("   ·   ")} x={L} y={H - 76} w={w} t={{ ...T.meta, s: 32, w: 700 }} fill={ink} warn={warn} />
  </>);
};

/* ---------------- catalogue ---------------- */

export const COMPOSITIONS = {
  announcement: [
    { id: "editorial", label: "Editorial", fn: editorial },
    { id: "poster", label: "Poster", fn: poster },
    { id: "centred", label: "Centred", fn: centredLux },
    { id: "bleed", label: "Full bleed", fn: bleedPhoto, needsImage: true },
    { id: "sidebar", label: "Sidebar", fn: sidebar },
  ],
  keyResults: [
    { id: "stack", label: "Stack", fn: stackRows },
    { id: "monolith", label: "Monolith", fn: monolith },
    { id: "quadrant", label: "Quadrant", fn: quadrant },
    { id: "ledger", label: "Ledger", fn: ledger },
    { id: "banner", label: "Banner", fn: banner },
  ],
  context: [
    { id: "bleed", label: "Full bleed", fn: fullBleedCtx, needsImage: true },
    { id: "half", label: "Half split", fn: halfSplit, needsImage: true },
    { id: "vertical", label: "Vertical split", fn: verticalSplit, needsImage: true },
    { id: "text", label: "Text only", fn: textOnly },
  ],
  why: [
    { id: "quote", label: "Pull quote", fn: pullQuote },
    { id: "centred", label: "Statement", fn: centredStatement },
    { id: "panel", label: "Panel", fn: panel },
  ],
  closing: [
    { id: "stacked", label: "Stacked", fn: closeStacked },
    { id: "centred", label: "Centred mark", fn: centredMark },
    { id: "bar", label: "Ticker bar", fn: tickerBar },
  ],
};

export const compositionsFor = (kind) => COMPOSITIONS[kind] || COMPOSITIONS.announcement;
export const compositionCount = Object.values(COMPOSITIONS).reduce((n, a) => n + a.length, 0);
