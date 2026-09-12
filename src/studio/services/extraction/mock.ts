// Sample-data extraction provider — DEVELOPMENT ONLY.
//
// It exists so renderer and layout work can proceed without an API key, a running
// `vercel dev`, or model spend. Three rules keep it from ever contaminating
// production:
//
//   1. Every fixture lives under src/studio/mock/, which no production module
//      imports. This file is the ONLY bridge, and it reaches the fixtures through
//      a DYNAMIC import behind an `import.meta.env.DEV` guard — Vite folds that to
//      `false` in a production build, so Rollup drops the fixtures entirely and no
//      sample release ever ships in the bundle. (Verified by scanning dist/.)
//   2. `isAvailable()` is false unless the bundle is a dev build AND the operator
//      opted in (VITE_STUDIO_MOCK=1 or ?mock=1). A production build can never
//      select it, whatever the URL says.
//   3. Every result is stamped `isMock: true`, so a mocked project is visibly
//      mocked everywhere downstream and can never be exported as real.

import type { ExtractionInput, ExtractionOptions, ExtractionProvider, ExtractionResult } from "./types";
import { ExtractionError } from "./types";
import { normalizeExtraction } from "./normalize";

const ID = "mock";

function optedIn(): boolean {
  if (import.meta.env.VITE_STUDIO_MOCK === "1") return true;
  try {
    return new URLSearchParams(window.location.search).get("mock") === "1";
  } catch {
    return false;
  }
}

export const mockExtractionProvider: ExtractionProvider = {
  id: ID,
  label: "Sample data (dev)",

  isAvailable() {
    return Boolean(import.meta.env.DEV) && optedIn();
  },

  unavailableReason() {
    return "Sample data is a dev-only tool. Run the dev server with VITE_STUDIO_MOCK=1 or add ?mock=1.";
  },

  async extract(input: ExtractionInput, opts: ExtractionOptions = {}): Promise<ExtractionResult> {
    if (!this.isAvailable()) throw new ExtractionError(this.unavailableReason(), ID);

    // A short delay keeps the loading states honest during development.
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, 450);
      opts.signal?.addEventListener("abort", () => { clearTimeout(t); reject(new ExtractionError("Cancelled.", ID)); });
    });

    // Guarded dynamic import: the fixtures are not reachable from a production build.
    if (!import.meta.env.DEV) throw new ExtractionError("Sample data is not available in this build.", ID);
    const { pickFixture } = await import("../../mock/fixtures");
    const fixture = pickFixture(input.text);
    // Anchors are resolved against the FIXTURE's own release text, not the pasted
    // text — otherwise every sample anchor would read as unresolved.
    const extraction = normalizeExtraction(fixture.extraction, fixture.releaseText);

    return {
      extraction,
      meta: {
        provider: ID,
        model: `fixture:${fixture.id}`,
        schemaVersion: extraction.schemaVersion,
        extractedAt: new Date().toISOString(),
        durationMs: 450,
        isMock: true,
      },
    };
  },
};
