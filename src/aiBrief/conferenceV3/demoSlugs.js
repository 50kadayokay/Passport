// ─────────────────────────────────────────────────────────────────────────────
// The fictional demo companies the PUBLIC Conference Mode marketing gallery renders.
//
// These are the slugs already backed by the locally bundled mocks in ConferenceV3Demo's
// LOCAL_MOCKS (src/aiBrief/conferenceV3/mocks/*.json) — no Supabase row exists or is
// needed for any of them.
//
// This module deliberately exports SLUG NAMES ONLY and imports nothing, so main.jsx can
// gate the /confv3demo route on the whitelist without pulling the mock datasets into the
// entry bundle. It is a route whitelist, not a data source.
// ─────────────────────────────────────────────────────────────────────────────
export const PUBLIC_DEMO_SLUGS = [
  "pampanegra-demo",
  "ptarmigan-demo",
  "vilcanota-demo",
  "plataalta-demo",
  "granitepeak-demo",
  "northvale-demo",
  "emberline-demo",
  "quillon-demo",
  "lucerna-demo",
  "veyra-demo",
  "solvik-demo",
  "iberis-demo",
  "tremayne-demo",
  "ardven-demo",
  "kestrel-demo",
];

export function isPublicDemoSlug(slug) {
  return !!slug && PUBLIC_DEMO_SLUGS.includes(slug);
}
