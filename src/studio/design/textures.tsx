// Generated backgrounds.
//
// The releases arrive with no photography, and a grey placeholder box is the
// single most obvious "developer output" tell. These draw instead: contour
// plates, mineral grain, and drafting grids — quiet enough to sit behind type,
// specific enough to read as geological rather than decorative.
//
// They are also the permanent home for the map compositions. When a brand kit
// supplies real photography or a project map, it drops into the same slots.

import React from "react";
import type { Theme } from "./themes";

/** Deterministic value noise so a seed always draws the same plate. */
function noise(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}

/**
 * A topographic plate: nested closed contours around a couple of highs.
 *
 * Drawn as smoothed radial polygons rather than fake squiggles, so the lines nest
 * without crossing — which is what makes a contour map read as a survey instead
 * of as texture.
 */
export function TopoPlate({ width, height, seed, stroke, opacity = 1, lines = 32 }: {
  width: number; height: number; seed: number; stroke: string; opacity?: number; lines?: number;
}) {
  const rand = noise(seed);
  const centres = [
    { x: width * (0.24 + rand() * 0.12), y: height * (0.3 + rand() * 0.14), amp: 0.9 },
    { x: width * (0.68 + rand() * 0.14), y: height * (0.58 + rand() * 0.18), amp: 0.66 },
  ];
  // Per-angle roughness, fixed once, so every ring shares the same terrain shape.
  const STEPS = 72;
  const rough = Array.from({ length: STEPS }, () => 0.82 + rand() * 0.36);

  const paths: string[] = [];
  for (let ring = 1; ring <= lines; ring++) {
    const t = ring / lines;
    for (const c of centres) {
      const base = Math.min(width, height) * 0.06 + t * Math.min(width, height) * 0.62 * c.amp;
      const pts: string[] = [];
      for (let i = 0; i <= STEPS; i++) {
        const a = (i / STEPS) * Math.PI * 2;
        const r = base * (1 + (rough[i % STEPS]! - 1) * (0.35 + t * 0.5));
        pts.push(`${(c.x + Math.cos(a) * r).toFixed(1)},${(c.y + Math.sin(a) * r * 0.78).toFixed(1)}`);
      }
      paths.push(`M${pts.join("L")}Z`);
    }
  }

  return (
    <svg width={width} height={height} style={{ position: "absolute", inset: 0, opacity }}>
      <defs>
        {/* Fade the plate at the edges so it never fights the margins. */}
        <radialGradient id={`tp${seed}`} cx="42%" cy="40%" r="78%">
          <stop offset="0%" stopColor="#fff" stopOpacity="1" />
          <stop offset="72%" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id={`tm${seed}`}><rect width={width} height={height} fill={`url(#tp${seed})`} /></mask>
      </defs>
      <g mask={`url(#tm${seed})`} fill="none" stroke={stroke} strokeWidth={1}>
        {paths.map((d, i) => <path key={i} d={d} strokeOpacity={i % 5 === 0 ? 1 : 0.62} />)}
      </g>
    </svg>
  );
}

/** A drafting grid — used only by the Technical theme, where showing it is the point. */
export function GridPlate({ width, height, stroke, step = 60, opacity = 0.5 }: {
  width: number; height: number; stroke: string; step?: number; opacity?: number;
}) {
  const cols = Math.ceil(width / step), rows = Math.ceil(height / step);
  return (
    <svg width={width} height={height} style={{ position: "absolute", inset: 0, opacity }}>
      <g stroke={stroke} strokeWidth={0.75}>
        {Array.from({ length: cols + 1 }, (_, i) => <line key={`v${i}`} x1={i * step} y1={0} x2={i * step} y2={height} />)}
        {Array.from({ length: rows + 1 }, (_, i) => <line key={`h${i}`} x1={0} y1={i * step} x2={width} y2={i * step} />)}
      </g>
    </svg>
  );
}

/**
 * A terrain / rock stand-in for photography.
 *
 * Layered fractal noise with a directional light, graded through the theme's
 * image treatment — the same pipeline real photos will pass through, so swapping
 * in a JPEG later changes the source, not the look.
 */
export function TerrainPlate({ width, height, seed, theme }: {
  width: number; height: number; seed: number; theme: Theme;
}) {
  const t = theme.imageTreatment;
  const id = `tr${seed}`;
  return (
    <svg width={width} height={height} style={{
      position: "absolute", inset: 0,
      filter: `saturate(${t.saturate}) contrast(${t.contrast}) brightness(${t.brightness})`,
    }}>
      <defs>
        <filter id={id}>
          <feTurbulence type="fractalNoise" baseFrequency="0.004 0.009" numOctaves={6} seed={seed} result="n" />
          <feDiffuseLighting in="n" lightingColor="#b9a894" surfaceScale={3.2} result="lit">
            <feDistantLight azimuth={128} elevation={58} />
          </feDiffuseLighting>
          <feColorMatrix in="lit" type="saturate" values="0.55" />
        </filter>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0%" stopColor="#5d5245" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#1b1a19" stopOpacity="0.75" />
        </linearGradient>
      </defs>
      <rect width={width} height={height} fill={theme.imageGround} />
      <rect width={width} height={height} filter={`url(#${id})`} />
      <rect width={width} height={height} fill={`url(#${id}g)`} />
    </svg>
  );
}

/**
 * A scrim, not a wash.
 *
 * A flat overlay greys an entire photograph to make one corner legible. A
 * gradient darkens only where the type actually lands, so the image keeps its
 * range everywhere else.
 */
export function Scrim({ from = 0.94, stop = 0.62 }: { from?: number; stop?: number }) {
  return (
    <div style={{
      position: "absolute", inset: 0,
      background: `linear-gradient(to top, rgba(6,7,9,${from}) 0%, rgba(6,7,9,${from * 0.72}) 26%, rgba(6,7,9,${from * 0.16}) ${stop * 100}%, rgba(6,7,9,0) 78%)`,
    }} />
  );
}
