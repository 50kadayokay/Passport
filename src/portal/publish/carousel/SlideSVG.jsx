// One renderer: a family supplies the voice, a composition supplies the
// structure, the text engine guarantees nothing is cropped.
//
// SVG because the export path is SVG -> canvas -> PNG. The editor and the
// download are the same markup measured with the same metrics, so they agree
// by construction rather than by luck.

import React from "react";
import { familyOf } from "./families.js";
import { compositionsFor, W, H, inkOn } from "./layouts.jsx";
import { groundHex, groundOf, recolourMarkup, recolourFamily } from "./palette.js";
import { PREMIUM, isPremium, premiumKey, compositionFor } from "./premium.js";
import { premiumContent } from "./premiumText.js";

function Device({ fam, accent, bleeding }) {
  // Family furniture is suppressed on bleed compositions, where the image is
  // the surface and a bar or grid over it is just clutter.
  if (bleeding) return null;
  switch (fam.device) {
    case "accentBar": return <rect x={0} y={H - 22} width={W} height={22} fill={accent} />;
    case "column":    return <rect x={0} y={0} width={18} height={H} fill={accent} />;
    case "grid":      return (<g opacity="0.55">{[1, 2, 3].map((i) => (
                        <line key={i} x1={(W / 4) * i} y1={0} x2={(W / 4) * i} y2={H} stroke={fam.rule} strokeWidth="1" />))}</g>);
    case "card":      return (<g>
                        <rect x={40} y={40} width={W - 80} height={H - 80} rx={fam.radius || 32} fill="#ffffff" opacity="0.94" />
                        <rect x={40} y={40} width={W - 80} height={10} rx={5} fill={accent} /></g>);
    case "field":     return <rect x={0} y={0} width={W} height={10} fill={accent} />;
    default:          return null;
  }
}

/**
 * `onOverflow` fires when a block could not fit at its minimum size. The
 * editor surfaces it; nothing is ever trimmed to silence it.
 */
export default function SlideSVG({
  slide, family, accent, brand = {}, imageHref = "", logoHref = "", logoAspect = 1,
  width, className, style, onOverflow, deck = [], ground = "",
}) {
  // A CHOSEN GROUND MOVES THE WHOLE PALETTE, it does not paint over one. See
  // palette.js: every colour keeps its distance from the ground and its hue,
  // and only the accent is held still.
  const groundTo = groundHex(ground);
  // PREMIUM FAMILIES compose whole pages rather than assembling a slide from
  // shared parts, which is what lets six of them look like six design studios
  // instead of six palettes. They emit SVG markup; the original families are
  // untouched below and remain selectable, so a saved draft keeps rendering
  // exactly as it did.
  if (isPremium(family)) {
    const famP = PREMIUM[premiumKey(family)];
    const comp = compositionFor(family, slide.kind, slide.layout);
    const fn = comp && comp.fn;
    if (fn) {
      const c = premiumContent({ slide, brand, deck });
      const inner = fn(c, {
        accent: accent || famP.accent,
        photo: imageHref || "",
        logo: logoHref || "",
        logoAspect,
      });
      const acc = accent || famP.accent;
      const painted = groundTo
        ? recolourMarkup(inner, groundOf(inner), groundTo, [acc])
        : inner;
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`}
          width={width} height={width ? Math.round((width * H) / W) : undefined}
          className={className} style={style}
          shapeRendering="geometricPrecision" textRendering="geometricPrecision"
          dangerouslySetInnerHTML={{ __html: painted }} />
      );
    }
  }

  const fam = groundTo ? recolourFamily(familyOf(family), groundTo) : familyOf(family);
  const acc = accent || "#2563eb";
  const comps = compositionsFor(slide.kind);
  // A family CHOOSES COMPOSITIONS, which is what makes two companies on
  // MineEx look like two companies. The slide's own layout wins when the
  // company has picked one; otherwise the family's preference applies, so
  // switching family restructures the deck rather than recolouring it.
  const preferred = (fam.prefers && fam.prefers[slide.kind]) || null;
  const chosen = slide.layout || preferred;
  let comp = comps.find((c) => c.id === chosen)
    || comps.find((c) => c.id === preferred) || comps[0];
  // A composition that needs a photograph and has none falls back rather than
  // rendering an empty frame.
  if (comp.needsImage && !imageHref) comp = comps.find((c) => !c.needsImage) || comp;
  const usesImage = !!(comp.needsImage && imageHref);
  // Only a true full-bleed composition paints a black ground. The others sit
  // on the family's own surface -- painting black behind an inset or strip
  // treatment left letterbox bars around the photograph.
  const bleeding = usesImage && comp.id === "bleed";

  const pad = fam.pad;
  const P = { pad, L: pad + (fam.device === "column" ? (fam.inset || 48) : 0), w: 0 };
  P.w = W - P.L - pad;

  let overflowed = false;
  const warn = () => { overflowed = true; };

  const body = comp.fn({ fam, accent: acc, brand, f: slide.fields || {}, P, imageHref, logoHref, logoAspect, warn });
  if (overflowed && onOverflow) onOverflow(slide.id, comp.id);

  // A bleed composition paints its own ground; everything else gets the
  // family's surface. The card device needs its panel under the content.
  const bg = bleeding ? "#000000" : fam.bg;

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`}
      width={width} height={width ? Math.round((width * H) / W) : undefined}
      className={className} style={style} shapeRendering="geometricPrecision" textRendering="geometricPrecision">
      <rect x={0} y={0} width={W} height={H} fill={bg} />
      <Device fam={fam} accent={acc} bleeding={bleeding} />
      {body}
    </svg>
  );
}

export { W, H, inkOn };
