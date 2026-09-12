// Shared primitives for every Story Studio payload.
//
// Two ideas run through all of them:
//
//   1. NOTHING IS UNSOURCED. Every extracted fact carries a SourceAnchor — a
//      verbatim quote from the release. That is what makes the fact-check screen
//      possible and what stops the renderer from ever setting an invented number
//      in 140pt type.
//
//   2. NUMBERS KEEP THEIR ORIGINAL FORM. A Measurement stores the parsed value AND
//      the string exactly as the company printed it. We display the company's
//      formatting and compute on the parsed value; we never re-round a grade.

export type Confidence = "high" | "medium" | "low";

/** YYYY-MM-DD. */
export type ISODate = string;

/**
 * A verbatim span of the source release backing a fact.
 *
 * `quote` is produced by the extraction model. `charStart`/`charEnd` are resolved
 * LOCALLY by string-matching the quote against the stored raw text — never by the
 * model, which cannot count characters reliably. A quote that fails to match is a
 * verification failure, not a rounding error.
 */
export interface SourceAnchor {
  quote: string;
  charStart?: number;
  charEnd?: number;
  /** Set locally: did `quote` actually appear in the source text? */
  resolved?: boolean;
}

export type LengthUnit = "m" | "ft" | "km" | "mi" | "cm";
export type MassUnit = "t" | "kt" | "Mt" | "kg" | "g" | "lb" | "oz";
export type GradeUnit = "g/t" | "%" | "ppm" | "ppb" | "opt" | "oz/t" | "lb/t" | "kg/t" | "cpm";
export type AreaUnit = "km2" | "ha" | "m2" | "acre";
export type ContainedUnit = "oz" | "koz" | "Moz" | "lb" | "Mlb" | "Blb" | "t" | "kt" | "Mt";

export type Unit = LengthUnit | MassUnit | GradeUnit | AreaUnit | ContainedUnit | "%" | "x" | "count";

/** Softeners the company applied to a figure. Dropping these would misrepresent it. */
export type Qualifier = "approx" | "up_to" | "at_least" | "average" | "weighted_average" | "estimated";

export interface Measurement {
  value: number;
  unit: Unit;
  qualifier?: Qualifier;
  /** Exactly as printed in the release, e.g. "1,240.5 m" or "~12 km". */
  raw: string;
}

export type Currency = "CAD" | "USD" | "AUD" | "GBP" | "EUR" | "other";

export interface Money {
  value: number;
  currency: Currency;
  /** As printed, e.g. "C$5.0 million". */
  raw: string;
  /** True when the figure is a per-unit price rather than a total. */
  perUnit?: boolean;
}

/**
 * One metal/element grade.
 *
 * `isEquivalent` matters: AuEq / CuEq figures depend on price and recovery
 * assumptions, so they are never interchangeable with a measured grade. The
 * renderer labels them explicitly and the verifier demands the formula.
 */
export interface GradeValue {
  /** "Au", "Ag", "Cu", "Li2O", "U3O8", "AuEq", … */
  element: string;
  value: number;
  unit: GradeUnit;
  raw: string;
  isEquivalent?: boolean;
  /** Where the equivalence formula / price assumptions were disclosed, if at all. */
  equivalenceBasis?: string;
}

export interface Jurisdiction {
  country?: string;
  /** State, province, region or district. */
  region?: string;
  /** Free-text locality as written, e.g. "Golden Triangle, British Columbia". */
  label?: string;
}

export interface Ticker {
  exchange: string;
  symbol: string;
}

export interface CompanyRef {
  name: string;
  tickers: Ticker[];
  website?: string;
}

export interface ProjectRef {
  name: string;
  commodities: string[];
  jurisdiction?: Jurisdiction;
  /** e.g. "100% owned", "option to earn 70%". */
  ownership?: string;
  /** e.g. "grassroots", "advanced exploration", "PEA-stage", "construction". */
  stage?: string;
  areaKm2?: Measurement;
  anchor?: SourceAnchor;
}

export interface PersonQuote {
  name: string;
  role?: string;
  quote: string;
  anchor: SourceAnchor;
}

/** The NI 43-101 / JORC qualified-person sign-off, when the release carries one. */
export interface QualifiedPerson {
  name: string;
  credentials?: string;
  role?: string;
  statement?: string;
  anchor?: SourceAnchor;
}
