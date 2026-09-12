// Verification pass: does each extracted claim actually stand on the source text?
//
// Three checks, cheapest first, all local — no model call:
//   1. ANCHOR — was the quote found verbatim in the stored release? (resolved by
//      lib/anchors at extraction time). A missing quote is a fabrication.
//   2. FIGURES — every number named in the claim must also appear in the quoted
//      span. This is the check that catches the dangerous failure: a real quote
//      attached to a number that came from somewhere else.
//   3. ARITHMETIC — derived claims are re-computed from the numbers in their own
//      derivation string and compared.

import type { ExtractedFact, HeadlineNumber, MiningExtraction } from "../../types";
import type { ClaimVerdict, VerificationReport, Verdict } from "./types";

/** Numbers as written, normalised: "1,240.5" → "1240.5", "C$12.0M" → "12.0". */
function figuresIn(text: string): string[] {
  const out: string[] = [];
  const re = /\d[\d,]*(?:\.\d+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(text || ""))) !== null) {
    const n = m[0].replace(/,/g, "");
    if (n && n !== "0") out.push(n);
  }
  return out;
}

/**
 * Is `figure` present in `haystack`, allowing for the ways the same quantity is
 * printed differently? "8420" matches "8,420"; "42.7" matches "42.70"; "789000"
 * matches "789,000 ounces"; "12000000" matches "12,000,000" and "12.0 million".
 */
function figureAppears(figure: string, haystack: string): boolean {
  const hay = haystack.replace(/,/g, "");
  if (hay.includes(figure)) return true;

  const n = Number(figure);
  if (!Number.isFinite(n)) return false;

  // Trailing-zero tolerance: 42.7 vs 42.70, 3.1 vs 3.10.
  const trimmed = String(n);
  if (hay.includes(trimmed)) return true;

  // Scaled forms: 12000000 printed as "12" or "12.0" beside million/M.
  for (const [scale, words] of [[1e9, /billion|bn|B\b/i], [1e6, /million|mm?\b|M\b/i], [1e3, /thousand|k\b/i]] as const) {
    if (n >= scale) {
      const scaled = n / scale;
      const forms = [String(scaled), scaled.toFixed(1), scaled.toFixed(2)];
      if (forms.some((f) => hay.includes(f)) && words.test(haystack)) return true;
    }
  }
  return false;
}

/** Re-run the arithmetic a derived claim states, when it is a simple two-term op. */
function recheckDerivation(derivation: string): { ok: boolean; note: string } | undefined {
  const d = String(derivation || "").replace(/,/g, "");
  const m = /(-?\d+(?:\.\d+)?)\s*([×x*/÷+-])\s*(-?\d+(?:\.\d+)?)\s*=\s*(-?\d+(?:\.\d+)?)/.exec(d);
  if (!m) return undefined;
  const a = Number(m[1]), b = Number(m[3]), claimed = Number(m[4]);
  const op = m[2] as string;
  const actual = op === "×" || op === "x" || op === "*" ? a * b
    : op === "/" || op === "÷" ? a / b
    : op === "+" ? a + b : a - b;
  // 1% tolerance: releases round, and so did whoever wrote the derivation.
  const ok = Math.abs(actual - claimed) <= Math.abs(actual) * 0.01 + 1e-9;
  return { ok, note: ok ? `${a} ${op} ${b} = ${Number(actual.toFixed(4))}` : `stated ${claimed}, computes to ${Number(actual.toFixed(4))}` };
}

function verifyOne(id: string, statement: string, quote: string, resolved: boolean | undefined, opts: {
  derived?: boolean; derivation?: string; confidence?: "high" | "medium" | "low";
}): ClaimVerdict {
  const base = {
    claimId: id,
    statement,
    quote,
    confidence: opts.confidence || "medium",
  };

  if (opts.derived) {
    const recomputed = opts.derivation ? recheckDerivation(opts.derivation) : undefined;
    return {
      ...base,
      verdict: (recomputed && !recomputed.ok ? "unsupported" : "derived") as Verdict,
      missingFigures: [],
      ...(recomputed ? { recomputed } : {}),
    };
  }

  if (!resolved) {
    return { ...base, verdict: "unsupported", missingFigures: figuresIn(statement) };
  }

  const missing = figuresIn(statement).filter((f) => !figureAppears(f, quote));
  return { ...base, verdict: missing.length ? "partial" : "supported", missingFigures: missing };
}

/** Run the full verification pass over an extraction. */
export function verifyExtraction(extraction: MiningExtraction): VerificationReport {
  const claims: ClaimVerdict[] = [];

  (extraction.facts || []).forEach((f: ExtractedFact) => {
    claims.push(verifyOne(f.id, f.statement, f.anchor?.quote || "", f.anchor?.resolved, {
      ...(f.derived ? { derived: true } : {}),
      ...(f.derivation ? { derivation: f.derivation } : {}),
      confidence: f.confidence,
    }));
  });

  (extraction.headlineNumbers || []).forEach((h: HeadlineNumber, i: number) => {
    const statement = [h.label, h.value, h.qualifier, h.context].filter(Boolean).join(" ");
    claims.push(verifyOne(`hn${i}`, statement, h.anchor?.quote || "", h.anchor?.resolved, { confidence: "high" }));
  });

  const counts: Record<Verdict, number> = { supported: 0, partial: 0, derived: 0, unsupported: 0 };
  claims.forEach((c) => { counts[c.verdict] += 1; });

  // Partial claims stay renderable — the figure may simply live one sentence away
  // from the quoted span — but they are surfaced in review. Unsupported never renders.
  const renderable = claims.filter((c) => c.verdict !== "unsupported").map((c) => c.claimId);

  return {
    verifiedAt: new Date().toISOString(),
    claims,
    counts,
    renderable,
    clean: counts.unsupported === 0 && counts.partial === 0,
  };
}

/** Convenience gate for the Story Director. */
export function makeClaimGate(report: VerificationReport) {
  const ok = new Set(report.renderable);
  return {
    allows: (id: string) => ok.has(id),
    verdictOf: (id: string) => report.claims.find((c) => c.claimId === id)?.verdict,
  };
}
