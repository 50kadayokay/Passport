// Brand marks for the portal chrome — the MineEx lockup and a company's own mark.
// Geometry and logo resolution come from lib/brand.js so these never drift from the
// printable placard or anything else that carries the identity.
import React from "react";
import { markInnerSvg, MARK_VIEWBOX, MARK_RATIO, CAP_HEIGHT, MARK_OVERSHOOT, companyLogo, companyMonogram } from "../lib/brand.js";

let uid = 0;

/** The MineEx mark alone. `height` is the ink height in px. */
export function MineExMark({ height = 20, className = "", title, style }) {
  const id = React.useMemo(() => `mx${++uid}`, []);
  return (
    <svg
      // Width is NOT rounded: the element's aspect must equal the viewBox's exactly, or
      // preserveAspectRatio letterboxes the artwork inside its box.
      //
      // overflow:visible matters as much. An <svg> root defaults to overflow:hidden, and
      // this box is a fractional number of DEVICE pixels wide (6.3 CSS px = 12.59 px at 2x).
      // The left edge lands on a pixel boundary and stays crisp while the remainder on the
      // right is clipped away — one rounded corner, one flat. Letting it paint past the box
      // keeps both corners identical.
      width={height * MARK_RATIO} height={height} viewBox={MARK_VIEWBOX}
      style={{ overflow: "visible", flexShrink: 0, ...(style || {}) }}
      shapeRendering="geometricPrecision"
      className={className} role={title ? "img" : "presentation"}
      aria-label={title || undefined} aria-hidden={title ? undefined : true}
      dangerouslySetInnerHTML={{ __html: markInnerSvg(id) }}
    />
  );
}

/**
 * The top-left lockup: the core sample, then "MineEx", then a PORTAL tag.
 *
 * The sample is set to exactly the cap height of the M and the row is baseline-aligned, so
 * the top and bottom of the sample land on the top and bottom of the M. (A flex item that
 * is a replaced element baselines on its bottom edge, which is what makes this exact rather
 * than eyeballed.) `size` is the wordmark's font size.
 */
export function MineExLockup({ size = 34, tag = "Portal" }) {
  return (
    <span className="flex min-w-0 items-baseline gap-[4px]">
      {/* Baseline alignment pins the sample's BOTTOM to the baseline, so the overshoot
          would otherwise grow upward only. Translate it down by half — a visual nudge that
          leaves the baseline alignment itself untouched — so it extends equally past the
          top and bottom of the M. */}
      <MineExMark
        height={size * CAP_HEIGHT * MARK_OVERSHOOT}
        title="MineEx"
        style={{ transform: `translateY(${(size * CAP_HEIGHT * (MARK_OVERSHOOT - 1)) / 2}px)` }}
      />
      <span
        className="font-extrabold leading-none tracking-tight text-slate-900"
        style={{ fontSize: size }}
      >
        MineEx
      </span>
      {tag && (
        <span className="ml-auto shrink-0 self-center rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">
          {tag}
        </span>
      )}
    </span>
  );
}

/**
 * A company's own mark — its uploaded logo, else a deterministic initials squircle.
 * Per the design system's universal fallback rule: image if present, otherwise a
 * coloured initials tile. Never a broken image, never an empty circle.
 */
export function CompanyMark({ company, size = 38, className = "" }) {
  const src = companyLogo(company);
  const radius = Math.round(size * 0.3);   // squircle, per the `Logo` component spec
  if (src) {
    return (
      <img
        src={src} alt="" width={size} height={size}
        className={`shrink-0 border border-slate-200 bg-white object-cover ${className}`}
        style={{ width: size, height: size, borderRadius: radius }}
      />
    );
  }
  return (
    <span
      className={`grid shrink-0 place-items-center bg-slate-900 font-extrabold text-white ${className}`}
      style={{ width: size, height: size, borderRadius: radius, fontSize: Math.round(size * 0.34) }}
    >
      {companyMonogram(company)}
    </span>
  );
}
