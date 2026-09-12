// Claim/source verification (stage 5).
//
// This is a GATE, not a report. The Story Director may only build slides from
// claims that pass here, which is what makes "interpretation based only on
// supported facts" enforceable rather than aspirational.

import type { Confidence } from "../../types";

export type Verdict =
  /** Quote found verbatim in the source, and every number in the claim appears in it. */
  | "supported"
  /** Quote found, but a figure in the claim isn't in the quoted span. */
  | "partial"
  /** Computed rather than quoted; arithmetic re-checked where possible. */
  | "derived"
  /** Quote not found in the source text at all. Never renderable. */
  | "unsupported";

export interface ClaimVerdict {
  claimId: string;
  statement: string;
  verdict: Verdict;
  quote: string;
  /** Numbers named in the claim that could not be located in the quote. */
  missingFigures: string[];
  /** For derived claims: did recomputation agree? */
  recomputed?: { ok: boolean; note: string };
  confidence: Confidence;
}

export interface VerificationReport {
  verifiedAt: string;
  claims: ClaimVerdict[];
  counts: Record<Verdict, number>;
  /** Claim ids the renderer is allowed to use. */
  renderable: string[];
  /** True when nothing failed — the deck can be exported without a review flag. */
  clean: boolean;
}
