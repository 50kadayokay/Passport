// Adapts the release fixtures to the exact shapes ingestRelease and
// structureRelease return, so the demo exercises the real downstream code.
//
// Kept apart from releaseDemo.js (the data) because this file knows about
// INGEST_STATUS and the pipeline's response contract, and the data file should
// not have to.

import { normalizeRelease } from "../../lib/pressRelease.js";
import { INGEST_STATUS } from "../../lib/ingestRelease.js";
import { RELEASE_FIXTURES, fixtureForFile } from "./releaseDemo.js";

// Kingsmen's own approved profile photography, served straight from the public
// bucket the investor profile reads.
const BUCKET = "https://rvptronniomlqumjhyrr.supabase.co/storage/v1/object/public/company-media";
const DEMO_IMAGES = [
  `${BUCKET}/kingsmen/site-8-colonial-era-workings.webp`,
  `${BUCKET}/d3d4100e-35b9-49e2-aa70-88bebe086eba/1788460981652-image.jpeg`,
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Stand in for ingestRelease.
 *
 * Reports the SAME progress stages the real one does, in roughly the same
 * order and with enough delay to be visible -- the processing screen is part of
 * the experience being demonstrated, and a result that arrives instantly makes
 * the real thing feel broken by comparison.
 *
 * The release DATE comes from the file's lastModified, so a dropped file lands
 * at a plausible point on the timeline instead of always today. The company can
 * change it on the review screen, which is where that decision belongs.
 */
export async function demoIngest(file, { onProgress = () => {} } = {}) {
  const fx = fixtureForFile(file);

  onProgress("uploading");        await sleep(320);
  onProgress("parsing");          await sleep(420);
  onProgress("extracting-media"); await sleep(260);
  onProgress("storing-media");    await sleep(220);

  const when = new Date(file?.lastModified || Date.now());
  const date = Number.isNaN(when.getTime()) ? new Date() : when;

  return {
    status: INGEST_STATUS.OK,
    headline: fx.headline,
    // The demo returns BOTH shapes the real ingest now returns, so the demo
    // exercises the same contract: `text` is the summariser's input and
    // `fullText` is the complete release the company publishes. The fixtures
    // already carry their own QP and forward-looking sections, so the demo
    // runs them through the same complete-mode normalisation production uses.
    text: normalizeRelease(fx.text).body || fx.text,
    fullText: normalizeRelease(fx.text, { complete: true }).body || fx.text,
    releaseDate: date.toISOString().slice(0, 10),
    document: { id: `demo-doc-${fx.key}` },
    // DEMO IMAGERY. The real ingest extracts images from the uploaded PDF; the
    // demo has no PDF to extract from, so it offers the company's OWN approved
    // profile imagery instead. These are the same photographs the investor
    // profile already shows -- nothing is invented, and nothing claims to have
    // come out of the document. `__demoUrl` marks them as fixture-supplied so
    // the portal serves them directly rather than signing a storage path.
    assets: DEMO_IMAGES.map((u, i) => ({
      id: `demo-asset-${fx.key}-${i}`, previewable: true, __demoUrl: u,
      filename: `release-image-${i + 1}.jpg`,
    })),
    assetsMeta: [],
    warnings: [],
    blocks: [],
    // Carried so demoStructure can return the summary that belongs to THIS
    // text rather than guessing from it.
    __demoFixtureKey: fx.key,
  };
}

/** Stand in for structureRelease. Matches the fixture by its text. */
export async function demoStructure(text) {
  await sleep(700);   // long enough that the "generating" state is seen
  const body = String(text || "");
  const fx = RELEASE_FIXTURES.find((f) => body.includes(f.text.slice(80, 160))) || RELEASE_FIXTURES[0];
  // A deep copy: the review screen edits this object, and a shared fixture
  // would carry one run's edits into the next.
  return JSON.parse(JSON.stringify(fx.analysis));
}
