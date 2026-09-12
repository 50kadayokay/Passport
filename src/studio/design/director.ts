// The Design Director (stage 8).
//
// Chooses a layout for each narrative beat. Its real job is DIFFERENCE: six
// slides built from one template read as generated no matter how good the
// typography is, so the director actively refuses repetition.
//
// Three mechanisms:
//   1. CANDIDATES — each scene type has several legitimate layouts.
//   2. NO ADJACENT REPEATS — neither the variant nor the compositional weight
//      position may match the previous slide.
//   3. RHYTHM — a deck must contain at least one full-bleed slide and vary its
//      background treatment, so the eye is not asked to do the same work six
//      times running.
//
// A `layoutSeed` makes the choice deterministic but re-rollable, which is what
// "regenerate layout" means: a different valid arrangement of the same story.

import type { StoryBeat, StoryPlan } from "../services/story/types";
import type {
  AccentUsage, Alignment, BackgroundTreatment, DesignDocument, DesignSlide, ImagePosition, LayoutVariant,
} from "./schema";

/** Where a layout puts its visual mass. Adjacent slides must not match. */
const WEIGHT_POSITION: Record<LayoutVariant, string> = {
  "cover-editorial": "top-left",
  "cover-fullbleed": "bottom-full",
  "metric-whitespace": "hanging-left",
  "metric-split": "split",
  "metric-overlay": "bottom-full",
  "data-technical": "split",
  "data-editorial": "center-left",
  "editorial-text": "center-left",
  "quote-composition": "top-left",
  "map-context": "full",
  "metric-bleed": "edge-right",
  "editorial-marginalia": "margin-split",
  "metric-stack": "spine",
  "statement": "full-type",
  "closing-card": "bottom-left",
  "mineex-endcard": "center",
};

const CANDIDATES: Record<string, LayoutVariant[]> = {
  cover: ["cover-editorial", "cover-fullbleed"],
  hero_metric: ["metric-whitespace", "metric-overlay", "metric-split", "metric-bleed", "metric-stack"],
  context_location: ["map-context", "data-editorial"],
  supporting_data: ["data-technical", "data-editorial", "metric-split", "metric-stack"],
  interpretation: ["quote-composition", "editorial-text", "statement", "editorial-marginalia"],
  next_steps: ["editorial-text", "data-editorial", "editorial-marginalia"],
  closing: ["closing-card"],
  endcard: ["mineex-endcard"],
};

const TREATMENT: Record<LayoutVariant, BackgroundTreatment> = {
  "cover-editorial": "flat",
  "cover-fullbleed": "image-fullbleed",
  "metric-whitespace": "flat",
  "metric-split": "texture-topo",
  "metric-overlay": "image-fullbleed",
  "data-technical": "flat",
  "data-editorial": "flat",
  "editorial-text": "flat",
  "quote-composition": "inverted",
  "map-context": "texture-topo",
  "metric-bleed": "flat",
  "editorial-marginalia": "flat",
  "metric-stack": "flat",
  "statement": "inverted",
  "closing-card": "flat",
  "mineex-endcard": "flat",
};

const IMAGE_POSITION: Record<LayoutVariant, ImagePosition> = {
  "cover-editorial": "none",
  "cover-fullbleed": "full",
  "metric-whitespace": "none",
  "metric-split": "right",
  "metric-overlay": "full",
  "data-technical": "none",
  "data-editorial": "none",
  "editorial-text": "none",
  "quote-composition": "none",
  "map-context": "full",
  "metric-bleed": "none",
  "editorial-marginalia": "none",
  "metric-stack": "none",
  "statement": "none",
  "closing-card": "none",
  "mineex-endcard": "none",
};

/** Deterministic small PRNG so a seed reproduces a layout exactly. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}

/**
 * Score each candidate layout for THIS beat, then take the best.
 *
 * Fit comes first: a location beat wants the topographic plate, a drill column
 * wants the technical split, a proceeds bar needs full width. Tie-breaking at
 * random produced four decks that used the same four layouts in the same order —
 * correct by the no-repeat rule and still monotonous — so repetition is now a
 * PENALTY inside a scored decision rather than the only rule.
 *
 * The seeded jitter is sized against the fit gaps: a decisive fit (a proceeds bar
 * needing full width) is worth ~28 points and always holds, while candidates
 * within a few points of each other genuinely swap. That is what makes
 * "regenerate layout" a real alternative arrangement rather than a no-op button.
 */
function fitScore(v: LayoutVariant, beat: StoryBeat, releaseType: string): number {
  const graphic = beat.dataGraphic?.kind;

  switch (beat.kind) {
    case "cover":
      // A field story opens on the ground; a numbers story opens on the page.
      if (releaseType === "drill_results" || releaseType === "exploration_update") {
        return v === "cover-fullbleed" ? 14 : 6;
      }
      return v === "cover-editorial" ? 14 : 6;

    case "hero_metric":
      if (v === "metric-whitespace") return 13;
      // The bleed suits a short, dramatic figure; a long one just gets cropped
      // into illegibility, so it earns its place only when the number is short.
      if (v === "metric-bleed") return (beat.primaryMetric?.value.length || 9) <= 6 ? 14 : 3;
      if (v === "metric-stack") return (beat.secondaryMetrics?.length || 0) >= 2 ? 12 : 4;
      if (v === "metric-overlay") return releaseType === "exploration_update" || releaseType === "drill_results" ? 11 : 5;
      return 7;

    case "context_location":
      return v === "map-context" ? 15 : 4;

    case "supporting_data":
      if (graphic === "drill_column") return v === "data-technical" ? 15 : v === "metric-split" ? 8 : 3;
      if (graphic === "resource_blocks") return v === "data-technical" ? 13 : v === "data-editorial" ? 10 : 4;
      // A proportional band needs the full measure; a split would crush it.
      if (graphic === "proceeds_bar") return v === "data-editorial" ? 15 : 3;
      if (graphic === "stat_rows") return v === "metric-split" ? 12 : v === "data-editorial" ? 9 : 4;
      return 6;

    case "interpretation":
      if (beat.quote) return v === "quote-composition" ? 15 : v === "statement" ? 8 : 5;
      // A short read becomes a statement; a long one needs the margin structure.
      if (v === "statement") return (beat.body?.length || 200) <= 120 ? 14 : 4;
      if (v === "editorial-marginalia") return (beat.body?.length || 0) > 120 ? 12 : 6;
      return v === "editorial-text" ? 13 : 4;

    case "next_steps":
      if (v === "editorial-marginalia") return 10;
      return v === "editorial-text" ? 11 : 8;

    default:
      return 8;
  }
}

function chooseVariant(
  beat: StoryBeat,
  prev: DesignSlide | undefined,
  rand: () => number,
  used: Map<LayoutVariant, number>,
  releaseType: string,
): LayoutVariant {
  const all = CANDIDATES[beat.kind] || ["editorial-text"];

  // Hard exclusions: a layout with nowhere to put this beat's content.
  let pool = all.filter((v) => {
    if (beat.dataGraphic && v === "metric-overlay") return false;
    if (!beat.dataGraphic && v === "data-technical") return false;
    if (!beat.quote && v === "quote-composition") return false;
    if (!beat.primaryMetric && (v === "metric-whitespace" || v === "metric-overlay" || v === "metric-bleed")) return false;
    if (!beat.primaryMetric && !(beat.secondaryMetrics || []).length && v === "metric-stack") return false;
    if (!beat.body && !beat.headline && v === "statement") return false;
    if (beat.dataGraphic && (v === "metric-bleed" || v === "statement" || v === "editorial-marginalia")) return false;
    return true;
  });
  if (!pool.length) pool = all.slice();

  let best = pool[0] as LayoutVariant;
  let bestScore = -Infinity;
  for (const v of pool) {
    let score = fitScore(v, beat, releaseType) * 4;
    if (prev?.layoutVariant === v) score -= 100;
    if (prev && WEIGHT_POSITION[prev.layoutVariant] === WEIGHT_POSITION[v]) score -= 30;
    score -= (used.get(v) || 0) * 22;
    score += rand() * 26;
    if (score > bestScore) { bestScore = score; best = v; }
  }

  used.set(best, (used.get(best) || 0) + 1);
  return best;
}

/**
 * Plan background treatments for the WHOLE deck at once.
 *
 * Done as a second pass rather than per-slide because the cap ("at most two
 * topographic plates") is a property of the deck, not of any slide — computing it
 * incrementally meant a slide's decision depended on how many plates happened to
 * precede it, which let a third slip through. A texture on every slide stops
 * being an accent and becomes wallpaper.
 *
 * Where a layout is happy either way, the seed decides. That is what makes
 * "regenerate layout" change the deck's rhythm even when every beat already has
 * one clearly-best layout and the variant sequence legitimately cannot move.
 */
function planTreatments(variants: LayoutVariant[], seed: number): BackgroundTreatment[] {
  const out = variants.map((v) => TREATMENT[v]);
  const MAX_PLATES = 2;
  let plates = out.filter((t) => t === "texture-topo").length;

  variants.forEach((v, i) => {
    if (plates >= MAX_PLATES) return;
    if (out[i] !== "flat") return;
    const eligible = v === "metric-whitespace" || v === "data-editorial" || v === "editorial-text";
    if (eligible && (i + seed) % 3 === 0) { out[i] = "texture-topo"; plates += 1; }
  });

  return out;
}

export function designStory(
  plan: StoryPlan,
  opts: { themeId: string; brandColor?: string; company: string; tickers: string; website?: string; disclaimer?: string; appStoreUrl?: string; seed?: number },
): DesignDocument {
  const seed = opts.seed ?? 1;
  const rand = rng(seed);
  const used = new Map<LayoutVariant, number>();
  const slides: DesignSlide[] = [];

  // Pass 1 — choose a layout for every beat.
  const variants: LayoutVariant[] = [];
  plan.beats.forEach((beat) => {
    const prevVariant = variants[variants.length - 1];
    const prevSlide = prevVariant ? ({ layoutVariant: prevVariant } as DesignSlide) : undefined;
    variants.push(chooseVariant(beat, prevSlide, rand, used, plan.releaseType));
  });

  // Pass 2 — treatments are a deck-wide decision, then build the slides.
  const treatments = planTreatments(variants, seed);

  plan.beats.forEach((beat, i) => {
    const layoutVariant = variants[i] as LayoutVariant;
    const backgroundTreatment = treatments[i] as BackgroundTreatment;

    // The accent moves around the deck rather than sitting in one place — it marks
    // the eyebrow on one slide, the figure on the next, a rule on a third.
    const accentCycle: AccentUsage[] = ["rule", "eyebrow", "metric", "rule", "none", "eyebrow"];
    const accentUsage: AccentUsage = beat.kind === "endcard" ? "none"
      : beat.kind === "closing" ? "eyebrow"
      : beat.kind === "hero_metric" ? "metric"
      : (accentCycle[(i + seed) % accentCycle.length] as AccentUsage);

    const alignment: Alignment = "left";
    const imagePosition = IMAGE_POSITION[layoutVariant];

    slides.push({
      id: beat.id,
      sceneType: beat.kind,
      layoutVariant,
      ...(beat.eyebrow ? { eyebrow: beat.eyebrow } : {}),
      ...(beat.headline ? { headline: beat.headline } : {}),
      ...(beat.body ? { body: beat.body } : {}),
      ...(beat.primaryMetric ? { primaryMetric: beat.primaryMetric } : {}),
      ...(beat.secondaryMetrics?.length ? { secondaryMetrics: beat.secondaryMetrics } : {}),
      ...(beat.dataGraphic ? { dataGraphic: beat.dataGraphic } : {}),
      ...(beat.quote ? { quote: beat.quote } : {}),
      ...(imagePosition !== "none" || backgroundTreatment === "texture-topo"
        ? {
            imageAsset: {
              kind: layoutVariant === "map-context" ? ("generated-topo" as const) : ("generated-terrain" as const),
              seed: Math.floor(rand() * 9999),
            },
          }
        : {}),
      imagePosition,
      backgroundTreatment,
      alignment,
      accentUsage,
      // The logo appears twice in a deck at most — opening and closing. Watermarking
      // every slide is the clearest tell of a template.
      logoMode: beat.kind === "cover" ? "corner" : beat.kind === "closing" || beat.kind === "endcard" ? "lockup" : "none",
      sourceClaimIds: beat.sourceClaimIds,
    });
  });

  return {
    themeId: opts.themeId,
    ...(opts.brandColor ? { brandColor: opts.brandColor } : {}),
    company: opts.company,
    tickers: opts.tickers,
    ...(opts.website ? { website: opts.website } : {}),
    ...(opts.appStoreUrl ? { appStoreUrl: opts.appStoreUrl } : {}),
    ...(opts.disclaimer ? { disclaimer: opts.disclaimer } : {}),
    layoutSeed: seed,
    slides,
  };
}
