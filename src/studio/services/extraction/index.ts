// Extraction provider registry.
//
// Callers ask for a provider by id or take the default; they never import a
// concrete provider. Order matters: the first AVAILABLE provider wins, and the
// real one is always first, so sample data can never be selected by accident.

import type { ExtractionProvider } from "./types";
import { anthropicExtractionProvider } from "./anthropic";
import { mockExtractionProvider } from "./mock";

export * from "./types";
export { normalizeExtraction } from "./normalize";

const PROVIDERS: ExtractionProvider[] = [anthropicExtractionProvider, mockExtractionProvider];

/** Every registered provider, including unavailable ones (the UI explains why). */
export function extractionProviders(): ExtractionProvider[] {
  return PROVIDERS.slice();
}

export function availableExtractionProviders(): ExtractionProvider[] {
  return PROVIDERS.filter((p) => p.isAvailable());
}

export function getExtractionProvider(id?: string | null): ExtractionProvider {
  if (id) {
    const found = PROVIDERS.find((p) => p.id === id);
    if (found) return found;
  }
  return availableExtractionProviders()[0] || (PROVIDERS[0] as ExtractionProvider);
}
