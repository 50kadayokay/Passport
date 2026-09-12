// Shape of a Story Studio sample fixture.
//
// DEVELOPMENT ONLY. Nothing under src/studio/mock is imported by a production
// module; the single bridge is services/extraction/mock.ts, which refuses to run
// outside a dev build. Every company, project, person and number in these files
// is invented.

import type { MiningExtraction, ReleaseType } from "../types";

export interface StudioFixture {
  id: string;
  label: string;
  releaseType: ReleaseType;
  /** The sample release the extraction was derived from. Anchors resolve against THIS. */
  releaseText: string;
  extraction: MiningExtraction;
}
