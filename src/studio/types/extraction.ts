// Mining-specific structured extraction schema (V1).
//
// V1 covers the four release types that make up the great majority of junior-mining
// news flow and that reward a designed carousel:
//
//   drill_results      — intercepts, holes, programs
//   exploration_update — surveys, sampling, targets, mapping
//   financing          — placements, bought deals, flow-through, use of proceeds
//   resource_update    — NI 43-101 / JORC estimates by category
//
// Anything else extracts to the shared envelope with no type-specific block, and
// the Story Director falls back to a narrative treatment.
//
// DESIGN NOTE — the four blocks are OPTIONAL and independent, not a discriminated
// union. Real releases mix: a financing announcement routinely reports the drill
// results it will fund. Forcing one shape per release would throw away the second
// story. The classifier picks the PRIMARY type; extraction keeps everything.

import type {
  CompanyRef, Confidence, GradeValue, ISODate, Jurisdiction, Measurement, Money,
  PersonQuote, ProjectRef, QualifiedPerson, SourceAnchor,
} from "./core";

export const EXTRACTION_SCHEMA_VERSION = 1;

export type ReleaseType =
  | "drill_results"
  | "exploration_update"
  | "financing"
  | "resource_update"
  | "other";

export const RELEASE_TYPES: ReleaseType[] = [
  "drill_results", "exploration_update", "financing", "resource_update", "other",
];

export const RELEASE_TYPE_LABELS: Record<ReleaseType, string> = {
  drill_results: "Drill Results",
  exploration_update: "Exploration Update",
  financing: "Financing",
  resource_update: "Resource Update",
  other: "Other",
};

// ============================================================================
// DRILL RESULTS
// ============================================================================

/**
 * One reported intercept.
 *
 * `trueWidth` vs `length` is the single most abused number in junior mining: a
 * downhole length is not a thickness unless the hole cuts the body at a known
 * angle. We store both, plus whether true width was actually stated, so the
 * renderer can label a headline number honestly instead of implying thickness.
 */
export interface DrillInterval {
  from: Measurement;
  to: Measurement;
  /** Downhole length (to − from), as reported. */
  length: Measurement;
  trueWidth?: Measurement;
  /** True when the release states or estimates true width; false when only downhole length is given. */
  trueWidthReported: boolean;
  grades: GradeValue[];
  /** Higher-grade sub-intervals — "including 3.0 m @ 41.2 g/t Au". */
  includes?: DrillInterval[];
  /** The company itself led with this interval (headline / "highlights" list). */
  isHighlight?: boolean;
  anchor: SourceAnchor;
}

export interface DrillHole {
  /** As labelled by the company, e.g. "KRC-24-017". */
  id: string;
  /** Zone, target or vein name the hole tested. */
  target?: string;
  azimuthDeg?: number;
  dipDeg?: number;
  totalDepth?: Measurement;
  collar?: {
    easting?: number;
    northing?: number;
    elevationM?: number;
    datum?: string;
  };
  intervals: DrillInterval[];
  /** Reported with no significant mineralisation — a real result worth keeping. */
  noSignificantResults?: boolean;
  anchor?: SourceAnchor;
}

export interface DrillProgram {
  name?: string;
  holesCompleted?: number;
  holesPlanned?: number;
  metresDrilled?: Measurement;
  rigCount?: number;
  status?: "planned" | "underway" | "completed" | "paused";
  /** e.g. "Phase 2 diamond drilling". */
  description?: string;
  anchor?: SourceAnchor;
}

export interface DrillResultsBlock {
  program?: DrillProgram;
  holes: DrillHole[];
  /** Intervals the company led with, flattened for the Story Director. */
  highlights: DrillInterval[];
  /** Results outstanding — the built-in "what happens next". */
  assaysPending?: boolean;
  assaysPendingDetail?: string;
  /** Distance from previously known mineralisation, when stated — the step-out story. */
  stepOut?: Measurement;
  /** QA/QC statement present (chain of custody, standards, blanks). */
  qaqcStated?: boolean;
}

// ============================================================================
// EXPLORATION UPDATE
// ============================================================================

export type ExplorationWork =
  | "geophysics" | "geochemistry" | "mapping" | "trenching" | "surface_sampling"
  | "target_generation" | "permitting" | "land_acquisition" | "metallurgy" | "other";

export interface SurveyRecord {
  /** e.g. "airborne magnetics", "IP/resistivity", "MobileMT". */
  method: string;
  lineKm?: Measurement;
  coverage?: Measurement;
  status?: "planned" | "underway" | "completed" | "interpreted";
  finding?: string;
  anchor: SourceAnchor;
}

export type SampleKind = "grab" | "channel" | "chip" | "soil" | "rock" | "till" | "stream_sediment" | "other";

export interface SampleSet {
  kind: SampleKind;
  count?: number;
  /** The values the release leads with. */
  highlights: GradeValue[];
  /** Widths for channel/chip sampling, which unlike grabs carry a length. */
  width?: Measurement;
  location?: string;
  /**
   * Grab and rock samples are SELECTIVE by nature and are not representative of
   * the deposit. When the release omits that caveat we flag it here so the
   * renderer can still label the number correctly.
   */
  selectiveSampleCaveatStated?: boolean;
  anchor: SourceAnchor;
}

export interface ExplorationBlock {
  workTypes: ExplorationWork[];
  surveys: SurveyRecord[];
  samples: SampleSet[];
  targetsDefined?: number;
  targetNames?: string[];
  /** Mineralised strike length / footprint defined so far. */
  footprint?: Measurement;
  nextSteps: string[];
}

// ============================================================================
// FINANCING
// ============================================================================

export type FinancingType =
  | "private_placement" | "bought_deal" | "public_offering" | "flow_through"
  | "debt" | "convertible" | "royalty_stream" | "at_the_market" | "warrant_exercise"
  | "strategic_investment" | "other";

export interface FinancingTranche {
  label: string;
  amount: Money;
  status?: "announced" | "closed" | "pending";
  closingDate?: ISODate;
}

export interface UnitComposition {
  /** Securities per unit, as described, e.g. "one common share and one-half warrant". */
  description?: string;
  pricePerUnit?: Money;
  unitCount?: number;
  warrantRatio?: number;
  warrantExercisePrice?: Money;
  warrantTermMonths?: number;
}

export interface UseOfProceeds {
  purpose: string;
  amount?: Money;
  /** Share of the raise, 0–1, when given as a percentage. */
  share?: number;
  anchor?: SourceAnchor;
}

export interface FinancingParticipant {
  name: string;
  role: "lead_order" | "strategic" | "insider" | "agent" | "underwriter" | "finder";
  amount?: Money;
  /** Post-close ownership, 0–1. */
  resultingStake?: number;
  anchor?: SourceAnchor;
}

export interface FinancingBlock {
  type: FinancingType;
  grossProceeds?: Money;
  minimumRaise?: Money;
  maximumRaise?: Money;
  upsized?: boolean;
  tranches: FinancingTranche[];
  units?: UnitComposition;
  /** Flow-through portion — Canadian juniors almost always split the raise. */
  flowThrough?: { amount: Money; premiumPct?: number };
  useOfProceeds: UseOfProceeds[];
  participants: FinancingParticipant[];
  closingDate?: ISODate;
  holdPeriod?: string;
  /** Conditions precedent, e.g. "subject to TSXV approval". */
  conditions: string[];
  proFormaCash?: Money;
  sharesOutstandingAfter?: number;
  /** 0–1. Only set when the release supports the arithmetic. */
  dilutionPct?: number;
}

// ============================================================================
// RESOURCE UPDATE
// ============================================================================

export type ResourceStandard = "NI 43-101" | "JORC" | "SK-1300" | "other";

export type ResourceCategoryName =
  | "measured" | "indicated" | "measured_indicated" | "inferred"
  | "proven" | "probable" | "proven_probable" | "total";

export const RESOURCE_CATEGORY_LABELS: Record<ResourceCategoryName, string> = {
  measured: "Measured",
  indicated: "Indicated",
  measured_indicated: "Measured & Indicated",
  inferred: "Inferred",
  proven: "Proven",
  probable: "Probable",
  proven_probable: "Proven & Probable",
  total: "Total",
};

export interface ContainedMetal {
  element: string;
  value: number;
  unit: "oz" | "koz" | "Moz" | "lb" | "Mlb" | "Blb" | "t" | "kt" | "Mt";
  raw: string;
  isEquivalent?: boolean;
}

export interface ResourceCategoryRow {
  category: ResourceCategoryName;
  tonnes: Measurement;
  grades: GradeValue[];
  contained: ContainedMetal[];
  anchor: SourceAnchor;
}

export interface ResourceBlock {
  standard: ResourceStandard;
  /** Resources and reserves are different things; a release may report both. */
  estimateKind: "maiden" | "update" | "restatement" | "reserve";
  effectiveDate?: ISODate;
  reportTitle?: string;
  categories: ResourceCategoryRow[];
  cutoff?: { value: number; unit: string; basis?: string; raw: string };
  priceAssumptions: { commodity: string; price: Money; unit?: string }[];
  /** Open-pit constrained vs underground — changes what the tonnage means. */
  constraint?: "pit_constrained" | "underground" | "combined" | "unconstrained";
  metallurgicalRecovery?: { commodity: string; recoveryPct: number }[];
  /** Change versus the previous estimate, when the release states one. */
  comparison?: {
    previousEffectiveDate?: ISODate;
    tonnesChangePct?: number;
    containedChangePct?: number;
    note?: string;
  };
  notes: string[];
}

// ============================================================================
// HEADLINE NUMBERS + FLAT FACTS
// ============================================================================

export type HeadlineNumberKind =
  | "grade" | "length" | "tonnage" | "contained" | "money" | "count" | "percent" | "distance" | "date" | "other";

/**
 * A figure worth setting LARGE.
 *
 * This is the deliberate bridge between extraction and design. The Story Director
 * chooses from these rather than re-reading prose, which is what keeps a big
 * editorial metric on a slide traceable to a quote in the release.
 */
export interface HeadlineNumber {
  /** Short label above the figure, e.g. "Best intercept". */
  label: string;
  /** The figure itself, formatted as the company printed it: "42.7 m". */
  value: string;
  /** The modifier set beside it: "@ 3.14 g/t Au". */
  qualifier?: string;
  /** Where it came from: "hole KRC-24-017, Boulder Zone". */
  context?: string;
  kind: HeadlineNumberKind;
  emphasis: "primary" | "secondary";
  /** Caveat the design MUST carry with the number, e.g. "downhole length, not true width". */
  caveat?: string;
  anchor: SourceAnchor;
}

export type FactKind =
  | "measurement" | "financial" | "date" | "assertion" | "quote" | "forward_looking";

/**
 * The flat, anchored fact list — the spine of claim/source verification.
 *
 * `derived` marks a fact the model COMPUTED rather than read (a percentage change,
 * a total). Derived facts have no verbatim quote to match, so they are checked by
 * recomputation instead of by string search.
 */
export interface ExtractedFact {
  id: string;
  statement: string;
  kind: FactKind;
  anchor: SourceAnchor;
  confidence: Confidence;
  derived?: boolean;
  /** How a derived fact was computed, e.g. "12.4 Mt × 1.8 g/t ÷ 31.1035". */
  derivation?: string;
}

// ============================================================================
// THE ENVELOPE
// ============================================================================

export interface MiningExtraction {
  schemaVersion: number;

  /** The extractor's own read of the release type; the classifier decides the final one. */
  releaseType: ReleaseType;
  releaseTypeConfidence: Confidence;
  /** Secondary types present, e.g. a financing that also reports drill results. */
  secondaryTypes: ReleaseType[];

  company: CompanyRef;
  headline: string;
  dateline: { date: ISODate | null; place?: string };

  summary: {
    whatHappened: string;
    whyItMatters: string;
    whatHappensNext: string;
  };

  projects: ProjectRef[];
  primaryJurisdiction?: Jurisdiction;
  commodities: string[];

  drill?: DrillResultsBlock;
  exploration?: ExplorationBlock;
  financing?: FinancingBlock;
  resource?: ResourceBlock;

  quotes: PersonQuote[];
  qualifiedPerson?: QualifiedPerson;

  headlineNumbers: HeadlineNumber[];
  facts: ExtractedFact[];

  /** Release contains forward-looking statements — the export must carry a disclaimer. */
  forwardLooking: boolean;
  cautionaryNotes: string[];
  /** Things the extractor could not resolve; surfaced in review, never hidden. */
  warnings: string[];
}

/** Provenance for one extraction run. Stored alongside, never inside, the payload. */
export interface ExtractionMeta {
  provider: string;
  model: string;
  schemaVersion: number;
  extractedAt: string;
  durationMs?: number;
  usage?: { inputTokens?: number; outputTokens?: number };
  /** True when the payload came from a fixture rather than a real model. */
  isMock?: boolean;
}
