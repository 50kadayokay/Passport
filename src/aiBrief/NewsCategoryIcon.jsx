import React from "react";
import { Drill, Coins, Layers, Users, Map, Newspaper, Film, Radio } from "lucide-react";

/* ---------------------------------------------------------------------------
   NewsCategoryIcon — the generic, own-artwork placeholder for a feed card that
   has no (rights-cleared) source image. It represents the article's CATEGORY (or
   for media, its TYPE), never the event, so it can never be mistaken for a photo
   of the news. Palette + tinted-circle treatment match the rest of the newsroom
   (Company Identity card, timeline tags): a faint tint + one colored lucide glyph.

   Categories mirror the AI `category` enum in _newsAI.js:
     Drill Results · Financing · MRE/Resource · Management ·
     Property Acquisition · General News
   Media/updates content types get their own glyphs.
--------------------------------------------------------------------------- */

// color = glyph/stroke color; tint = ~12% wash behind it (same recipe as the
// identity grid icons). Chosen to sit in the existing slate/emerald newsroom.
export const CATEGORY_STYLE = {
  "Drill Results":        { Icon: Drill,     color: "#1d4ed8", tint: "rgba(37,99,235,0.11)" },  // Passport blue
  "Financing":            { Icon: Coins,     color: "#6d28d9", tint: "rgba(124,58,237,0.11)" },  // violet
  "MRE/Resource":         { Icon: Layers,    color: "#0d9488", tint: "rgba(13,148,136,0.12)" },  // teal
  "Management":           { Icon: Users,     color: "#5b57c9", tint: "rgba(99,91,201,0.12)" },   // indigo
  "Property Acquisition": { Icon: Map,       color: "#a16207", tint: "rgba(180,130,20,0.13)" },  // earth/sand
  "General News":         { Icon: Newspaper, color: "#475569", tint: "rgba(100,116,139,0.10)" }, // slate
};
// Media / update content types (no image → these glyphs).
const TYPE_STYLE = {
  VIDEO:     { Icon: Film,      color: "#be123c", tint: "rgba(190,18,60,0.10)" },   // rose
  INTERVIEW: { Icon: Film,      color: "#be123c", tint: "rgba(190,18,60,0.10)" },
  UPDATE:    { Icon: Radio,     color: "#059669", tint: "rgba(5,150,105,0.12)" },   // emerald
};
const FALLBACK = CATEGORY_STYLE["General News"];

// Resolve the right glyph/colours from a media/update TYPE first, else the category.
export function coverStyleFor({ category, contentType } = {}) {
  return TYPE_STYLE[contentType] || CATEGORY_STYLE[category] || FALLBACK;
}
export function categoryStyle(category) { return CATEGORY_STYLE[category] || FALLBACK; }

/* A small tinted circle — for inline use next to a headline (the identity-grid look). */
export function CategoryChip({ category, contentType, size = 26 }) {
  const { Icon, color, tint } = coverStyleFor({ category, contentType });
  const inner = Math.round(size * 0.52);
  return (
    <span style={{ width: size, height: size, borderRadius: 9999, background: tint, border: "1px solid rgba(15,23,42,0.05)", display: "grid", placeItems: "center", flexShrink: 0 }} aria-label={category || contentType || "News"}>
      <Icon size={inner} strokeWidth={2.2} style={{ color }} />
    </span>
  );
}

/* The card image REPLACEMENT — fills its container. A soft tinted panel with a
   centered glyph + a faint watermark, so a card with no photo still reads as a
   finished newsroom card rather than a broken/empty image. Purely iconographic. */
export default function NewsCategoryIcon({ category, contentType, radius = 16, className = "", style = {} }) {
  const { Icon, color, tint } = coverStyleFor({ category, contentType });
  return (
    <div
      className={className}
      role="img"
      aria-label={`${category || contentType || "News"} — no image`}
      style={{ position: "relative", width: "100%", height: "100%", borderRadius: radius, overflow: "hidden", background: `radial-gradient(120% 120% at 50% 18%, ${tint} 0%, #ffffff 78%)`, border: "1px solid #eef2f7", display: "grid", placeItems: "center", ...style }}
    >
      <Icon size="46%" strokeWidth={1.4} style={{ color, opacity: 0.10, position: "absolute", right: "-6%", bottom: "-8%" }} />
      <span style={{ position: "relative", display: "grid", placeItems: "center", width: "38%", maxWidth: 64, aspectRatio: "1 / 1", borderRadius: 9999, background: "#ffffff", border: `1px solid ${tint}`, boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}>
        <Icon size="52%" strokeWidth={2.1} style={{ color }} />
      </span>
    </div>
  );
}

/* CardCover — drop-in for a card's image slot: the real image when we have one
   (and are allowed to show it), otherwise the category/type icon. Fills its parent
   (give the parent width/height + rounding + overflow-hidden). Media cards draw
   their own play overlay on top, so this stays purely image-or-icon. */
export function CardCover({ it, radius = 0 }) {
  if (it && it.image) {
    return <div style={{ width: "100%", height: "100%", borderRadius: radius, backgroundImage: `url("${it.image}")`, backgroundSize: "cover", backgroundPosition: "center" }} />;
  }
  return <NewsCategoryIcon category={it && it.category} contentType={it && it.contentType} radius={radius} />;
}
