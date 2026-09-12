// The MineEx mark, drawn rather than linked.
//
// Geometry and strata come from assets/brand/README.txt, which signs the icon off
// at exact proportions. Drawing it in SVG (instead of importing a PNG from
// assets/, which Vite does not serve) means it is resolution-independent, exports
// cleanly with the slide, and stays correct at any size.
//
//   core width    14.0625% of the tile
//   core height   46.875%
//   corner radius 23.611% of the core width
//   ground        #0B0D10
//
// Four strata, surface downward, value increasing with depth.

import React from "react";

export const MINEEX_GROUND = "#0B0D10";
export const MINEEX_STRATA = ["#7A4E33", "#C4633B", "#B6BCC3", "#D9A24C"] as const;

/** The drill core on its own — the app icon's artwork, at any size. */
export function MineExCore({ height, x = 0, y = 0 }: { height: number; x?: number; y?: number }) {
  // The core's own aspect is fixed by the signed-off tile proportions.
  const w = height * (14.0625 / 46.875);
  const r = w * 0.23611;
  const band = height / 4;
  const id = `mx${Math.round(height)}`;
  return (
    <svg width={w} height={height} style={{ position: "absolute", left: x, top: y, overflow: "visible" }}>
      <defs>
        <clipPath id={id}><rect x={0} y={0} width={w} height={height} rx={r} /></clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        {MINEEX_STRATA.map((fill, i) => (
          <rect key={i} x={0} y={i * band} width={w} height={band} fill={fill} />
        ))}
      </g>
    </svg>
  );
}

/** The Apple mark, drawn so the App Store line needs no image asset. */
export function AppleGlyph({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 24 29" fill={color} style={{ display: "block" }}>
      <path d="M17.6 15.3c0-3 2.4-4.4 2.5-4.5-1.4-2-3.5-2.3-4.2-2.3-1.8-.2-3.5 1-4.4 1-.9 0-2.3-1-3.8-1-2 0-3.8 1.1-4.8 2.9-2 3.5-.5 8.8 1.5 11.7 1 1.4 2.1 3 3.6 2.9 1.4-.1 2-.9 3.7-.9s2.2.9 3.8.9c1.6 0 2.5-1.4 3.5-2.8 1.1-1.6 1.5-3.2 1.6-3.2-.1 0-3-1.2-3-4.7zM14.9 5.6c.8-1 1.3-2.3 1.2-3.6-1.2 0-2.6.8-3.4 1.7-.7.9-1.4 2.2-1.2 3.5 1.3.1 2.6-.7 3.4-1.6z" />
    </svg>
  );
}
