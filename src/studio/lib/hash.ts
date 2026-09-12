// Content hashing + text normalisation for ingested releases.

/**
 * Normalise release text for hashing and for quote matching.
 *
 * Wire services re-flow whitespace and swap smart quotes between the HTML and PDF
 * versions of the same release, so a raw hash would treat them as different
 * documents. Collapsing whitespace and folding typographic punctuation makes the
 * hash stable across those variants without touching the stored original.
 */
export function normalizeText(text: string): string {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** SHA-256 of the normalised text — the dedup key for `story_projects`. */
export async function contentHash(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalizeText(text).toLowerCase()));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Cheap readability stat shown during ingest so an empty PDF is obvious. */
export function textStats(text: string): { chars: number; words: number } {
  const t = normalizeText(text);
  return { chars: t.length, words: t ? t.split(" ").length : 0 };
}
