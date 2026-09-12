// Sample fixture registry — DEV ONLY.
//
// The only importer of this module is services/extraction/mock.ts, which refuses
// to run outside a dev build. Nothing here is reachable from a production path.

import type { StudioFixture } from "./types";
import { drillResultsFixture } from "./drillResults.fixture";
import { financingFixture } from "./financing.fixture";
import { explorationFixture } from "./explorationUpdate.fixture";
import { resourceFixture } from "./resourceUpdate.fixture";

export type { StudioFixture } from "./types";

export const FIXTURES: StudioFixture[] = [
  drillResultsFixture,
  financingFixture,
  explorationFixture,
  resourceFixture,
];

export function getFixture(id: string): StudioFixture | undefined {
  return FIXTURES.find((f) => f.id === id);
}

/**
 * Pick the fixture that best matches pasted text, so testing the pipeline against
 * a real release still exercises the right layout family. Keyword scoring is
 * deliberately crude — this is a development convenience, not the classifier.
 */
export function pickFixture(text: string): StudioFixture {
  const t = String(text || "").toLowerCase();
  const score = (words: string[]) => words.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0);

  const scores: [StudioFixture, number][] = [
    [drillResultsFixture, score(["drill", "hole", "intersect", "assay", "intercept", "g/t"])],
    [financingFixture, score(["placement", "offering", "proceeds", "warrant", "flow-through", "subscribe"])],
    [explorationFixture, score(["survey", "soil", "geophys", "target", "mapping", "sampling"])],
    [resourceFixture, score(["mineral resource", "indicated", "inferred", "43-101", "cut-off", "tonnes"])],
  ];

  scores.sort((a, b) => b[1] - a[1]);
  const best = scores[0];
  return best && best[1] > 0 ? best[0] : drillResultsFixture;
}
