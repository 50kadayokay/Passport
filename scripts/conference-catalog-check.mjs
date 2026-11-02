// The portal's Conference catalogue must match the booth's.
//   node scripts/conference-catalog-check.mjs
//
// src/lib/conferenceCatalog.js is a hand-maintained copy of the TEMPLATES and
// THEMES defined in aiBrief/conferenceV3/ConferenceV3.jsx. It is a copy because
// importing the real thing would pull a 1.78 MB booth chunk into the portal to
// render a list of names, and extracting a shared module would mean editing the
// booth. A copy drifts; this makes the drift loud.
//
// The booth is the authority. If it gains a template, this fails and the
// catalogue is what has to change -- never the other way round.

import fs from "node:fs";

const SRC = "src/aiBrief/conferenceV3/ConferenceV3.jsx";
const CATALOG = "src/lib/conferenceCatalog.js";

const src = fs.readFileSync(SRC, "utf8");
const cat = fs.readFileSync(CATALOG, "utf8");

const block = (text, start, end) => text.slice(text.indexOf(start), end ? text.indexOf(end) : undefined);

const boothTemplates = [...block(src, "const TEMPLATES = {")
  .matchAll(/^ {2}([a-z0-9]+): \{ label:/gm)].map((m) => m[1]);
const boothThemes = [...block(src, "const THEMES = {", "const THEME_KEYS")
  .matchAll(/^ {2}([a-z0-9]+):\s*\{/gm)].map((m) => m[1]);

const catTemplates = [...block(cat, "export const CONFERENCE_TEMPLATES = [", "export const CONFERENCE_THEMES")
  .matchAll(/key: "([a-z0-9]+)"/g)].map((m) => m[1]);
const catThemes = [...block(cat, "export const CONFERENCE_THEMES = [", "export const DEFAULTS")
  .matchAll(/key: "([a-z0-9]+)"/g)].map((m) => m[1]);

let bad = 0;
function compare(what, booth, portal) {
  const missing = booth.filter((k) => !portal.includes(k));
  const extra = portal.filter((k) => !booth.includes(k));
  const order = booth.length === portal.length && booth.every((k, i) => portal[i] === k);
  if (missing.length || extra.length) {
    bad++;
    console.error(`  FAIL  ${what}: booth has ${booth.length}, catalogue has ${portal.length}`);
    if (missing.length) console.error(`          missing from the catalogue: ${missing.join(", ")}`);
    if (extra.length) console.error(`          not in the booth:            ${extra.join(", ")}`);
  } else if (!order) {
    bad++;
    console.error(`  FAIL  ${what}: same ${booth.length} keys, different order — the portal lists them in the booth's order`);
  } else {
    console.log(`  ok    ${what}: ${booth.length} in step`);
  }
}

compare("templates", boothTemplates, catTemplates);
compare("themes", boothThemes, catThemes);

if (!boothTemplates.length || !boothThemes.length) {
  console.error("\n  FAIL  could not read the booth's lists — the shape of ConferenceV3.jsx changed.\n");
  process.exit(1);
}
console.log(bad ? "\n  catalogue is out of step with the booth\n" : "\n  catalogue matches the booth\n");
process.exit(bad ? 1 : 0);
