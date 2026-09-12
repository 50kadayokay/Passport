// The Story Director's output (stage 7) — CONTENT ONLY.
//
// A StoryPlan says what each slide is about and which verified claims back it.
// It says nothing about layout, colour or typography: that is the Design
// Director's job (stage 8). Keeping the split strict is what lets the same story
// be re-laid-out in a different theme without regenerating the narrative.

export type BeatKind =
  | "cover"
  | "hero_metric"
  | "context_location"
  | "supporting_data"
  | "interpretation"
  | "next_steps"
  | "closing"
  /** MineEx sign-off. Always last; the platform's card, not the issuer's. */
  | "endcard";

export interface MetricContent {
  label: string;
  value: string;
  unit?: string;
  qualifier?: string;
  context?: string;
  /** A caveat that must travel with the figure wherever it is rendered. */
  caveat?: string;
}

/** A drawing the renderer generates from data — never an imported image. */
export type DataGraphic =
  | { kind: "drill_column"; holeId: string; totalDepth: number; from: number; to: number; label: string; includes: { from: number; to: number; label: string }[] }
  | { kind: "resource_blocks"; rows: { label: string; tonnes: number; grade: string; contained: string; tone: number }[] }
  | { kind: "proceeds_bar"; segments: { label: string; amount: number; display: string }[] }
  | { kind: "step_out"; distance: string; direction: string; note: string }
  | { kind: "stat_rows"; rows: { label: string; value: string }[] };

export interface StoryBeat {
  id: string;
  kind: BeatKind;
  eyebrow?: string;
  headline?: string;
  body?: string;
  primaryMetric?: MetricContent;
  secondaryMetrics?: MetricContent[];
  dataGraphic?: DataGraphic;
  quote?: { text: string; attribution: string };
  /** Verified claim ids this beat rests on. Empty means "structural, not factual". */
  sourceClaimIds: string[];
  /** Editorial weight — the Design Director reads this when choosing a layout. */
  weight: "hero" | "normal" | "quiet";
}

export interface StoryPlan {
  releaseType: string;
  title: string;
  beats: StoryBeat[];
  /** Beats that were dropped, and why — so the deck's shape is explainable. */
  dropped: { kind: BeatKind; reason: string }[];
  generatedAt: string;
}
