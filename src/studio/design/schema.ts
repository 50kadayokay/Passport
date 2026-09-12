// Design JSON (stage 8).
//
// The contract between narrative and pixels. A DesignDocument holds structured
// CONTENT plus explicit VISUAL DECISIONS; slide components read it and render.
// No component may contain release-specific content — if a component knows the
// word "Halvard", the separation has failed.
//
// `theme` is deliberately deck-level rather than per-slide. A per-slide theme
// would let a deck drift between colour worlds, which is exactly what stops a set
// of slides reading as one designed object. Slides vary tone through
// `backgroundTreatment` instead.

import type { BeatKind, DataGraphic, MetricContent } from "../services/story/types";

export type LayoutVariant =
  | "cover-editorial"      // type-led, weight top-left, deep well of space below
  | "cover-fullbleed"      // image to all four edges, type in the lower third
  | "metric-whitespace"    // oversized figure hanging left, two thirds empty
  | "metric-split"         // figure left, drawing or image right
  | "metric-overlay"       // figure over full-bleed imagery
  | "data-technical"       // drawing dominant, grid visible, mono labels
  | "data-editorial"       // drawing quiet, reading dominant
  | "editorial-text"       // a paragraph set as a composition
  | "quote-composition"    // oversized quotation, asymmetric
  | "map-context"          // topographic plate with location typography
  | "metric-bleed"         // the figure cropped past the frame
  | "editorial-marginalia" // wide column, marginal note, hairline between
  | "metric-stack"         // hanging labels, values on a common spine
  | "statement"            // one line at maximum scale
  | "closing-card"         // bottom-weighted, caveats given room
  | "mineex-endcard";      // the platform sign-off

export type BackgroundTreatment =
  | "flat" | "texture-topo" | "texture-terrain" | "image-fullbleed" | "image-split" | "inverted";

export type ImagePosition = "none" | "full" | "left" | "right" | "top" | "bottom";
export type Alignment = "left" | "center" | "right";
export type AccentUsage = "none" | "rule" | "metric" | "eyebrow";
export type LogoMode = "none" | "corner" | "lockup";

export interface ImageAsset {
  /** "generated" until real photography is attached to a brand kit. */
  kind: "generated-terrain" | "generated-topo" | "photo";
  url?: string;
  seed: number;
  caption?: string;
  /** 0–1 focal point, so cropping keeps the subject rather than the file's centre. */
  focal?: { x: number; y: number };
}

/**
 * The named, movable pieces of a slide.
 *
 * Slots exist so the editor can address an element without knowing which layout
 * variant drew it: "move the headline" means the same thing on a cover and on a
 * map slide. A variant that has no use for a slot simply never renders it.
 */
export type SlotId =
  | "eyebrow" | "headline" | "body" | "metric" | "qualifier" | "context"
  | "caveat" | "rows" | "graphic" | "quote" | "attribution" | "lockup";

/**
 * A manual position for one slot, in design pixels on the 1080×1350 canvas.
 *
 * Layout is automatic until someone moves something. The first drag FREEZES the
 * slide — every slot's measured position is written as an override — so the piece
 * being dragged does not reflow its siblings out from under the cursor. Clearing
 * the overrides returns the slide to the Design Director.
 */
export interface SlotOverride {
  x: number;
  y: number;
  w?: number;
}

export interface DesignSlide {
  id: string;
  sceneType: BeatKind;
  layoutVariant: LayoutVariant;

  eyebrow?: string;
  headline?: string;
  body?: string;
  primaryMetric?: MetricContent;
  secondaryMetrics?: MetricContent[];
  dataGraphic?: DataGraphic;
  quote?: { text: string; attribution: string };

  imageAsset?: ImageAsset;
  imagePosition: ImagePosition;
  backgroundTreatment: BackgroundTreatment;
  alignment: Alignment;
  accentUsage: AccentUsage;
  logoMode: LogoMode;

  sourceClaimIds: string[];

  /** Manual slot positions. Absent means the layout is still automatic. */
  overrides?: Partial<Record<SlotId, SlotOverride>>;
}

export interface DesignDocument {
  themeId: string;
  /** Raw company colour. The theme tames it before use; the original is kept for audit. */
  brandColor?: string;
  company: string;
  tickers: string;
  website?: string;
  disclaimer?: string;
  layoutSeed: number;
  /** Where to send viewers for the app. Left unset until the real link exists —
   *  the card then shows the domain rather than an invented App Store URL. */
  appStoreUrl?: string;
  slides: DesignSlide[];
}
