// Anchor resolution — proving that every extracted fact really is in the release.
//
// The model returns a `quote` for each fact. We resolve that quote to character
// offsets in the stored raw text OURSELVES, because:
//   • a model cannot count characters reliably, so model-supplied offsets are noise;
//   • a quote that cannot be found is the signal the fact-check screen exists for.
//
// Matching is done on a normalised projection of the text (collapsed whitespace,
// folded typographic punctuation) with an index map back to the original, so a
// smart-quote or line-wrap difference never fails a genuine match — while a
// genuinely absent quote still fails.

import type { SourceAnchor } from "../types";

interface NormalizedText {
  normalized: string;
  /** normalized[i] came from source[map[i]]. */
  map: number[];
}

/** Build the normalised projection plus its index map back into the source. */
export function projectText(source: string): NormalizedText {
  const src = String(source || "");
  let normalized = "";
  const map: number[] = [];
  let pendingSpace = false;

  for (let i = 0; i < src.length; i++) {
    let ch = src[i] as string;

    if (/\s/.test(ch)) { pendingSpace = normalized.length > 0; continue; }

    if (ch === "‘" || ch === "’" || ch === "‛") ch = "'";
    else if (ch === "“" || ch === "”") ch = '"';
    else if (ch === "–" || ch === "—") ch = "-";

    if (pendingSpace) { normalized += " "; map.push(i); pendingSpace = false; }
    normalized += ch.toLowerCase();
    map.push(i);
  }
  return { normalized, map };
}

function normalizeQuery(quote: string): string {
  return projectText(quote).normalized;
}

/**
 * Resolve one anchor against the release text.
 *
 * Returns a NEW anchor: `resolved` true with offsets when the quote was found,
 * `resolved` false and no offsets when it was not. The original quote is always
 * preserved so the reviewer can see exactly what the model claimed.
 */
export function resolveAnchor(anchorIn: SourceAnchor | undefined, projected: NormalizedText): SourceAnchor | undefined {
  if (!anchorIn || typeof anchorIn.quote !== "string" || !anchorIn.quote.trim()) return anchorIn;

  const needle = normalizeQuery(anchorIn.quote);
  if (!needle) return { ...anchorIn, resolved: false };

  const at = projected.normalized.indexOf(needle);
  if (at < 0) return { quote: anchorIn.quote, resolved: false };

  const start = projected.map[at];
  const end = projected.map[at + needle.length - 1];
  if (start === undefined || end === undefined) return { quote: anchorIn.quote, resolved: false };

  return { quote: anchorIn.quote, charStart: start, charEnd: end + 1, resolved: true };
}

/**
 * Walk an extraction payload and resolve every `anchor` in it, in place on a copy.
 *
 * Structural rather than schema-driven on purpose: the schema will grow new
 * anchored fields, and a generic walk keeps working without being told about them.
 */
export function resolveAllAnchors<T>(payload: T, sourceText: string): T {
  const projected = projectText(sourceText);

  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (k === "anchor" && v && typeof v === "object" && "quote" in (v as object)) {
          out[k] = resolveAnchor(v as SourceAnchor, projected);
        } else {
          out[k] = walk(v);
        }
      }
      return out;
    }
    return node;
  };

  return walk(payload) as T;
}

/** How many anchors resolved — the headline number for the fact-check screen. */
export function anchorCoverage(payload: unknown): { total: number; resolved: number } {
  let total = 0;
  let resolved = 0;
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (k === "anchor" && v && typeof v === "object" && "quote" in (v as object)) {
          total += 1;
          if ((v as SourceAnchor).resolved) resolved += 1;
        } else walk(v);
      }
    }
  };
  walk(payload);
  return { total, resolved };
}

/** The exact source span for an anchor, for highlighting in the review UI. */
export function anchorText(anchorIn: SourceAnchor | undefined, sourceText: string): string {
  if (!anchorIn || anchorIn.charStart === undefined || anchorIn.charEnd === undefined) return "";
  return sourceText.slice(anchorIn.charStart, anchorIn.charEnd);
}
