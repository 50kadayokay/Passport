// Extracted-media previewability — pure unit tests (no I/O).
//   node scripts/media-support-test.mjs
//
// WHY THIS EXISTS
// ---------------
// A .docx can embed formats no browser decodes. The real Kingsmen release carries
// three EMF parts beside four PNGs. Handed to an <img> those render as broken
// tiles, and — worse — the company could tick one and publish an image investors
// would never see.
//
// The rule is capability-based and allowlist-shaped, so a format nobody has
// anticipated degrades to a placeholder rather than a broken tile. These tests pin
// that, and pin the two things that must NOT happen as a result: the unsupported
// asset is never dropped from the extraction result, and never selectable.

import {
  isPreviewableMime, previewability, isPublishableAsset,
  annotateAssets, sanitizeSelection, formatLabel, PREVIEWABLE_IMAGE_MIME,
} from "../src/lib/imageSupport.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗ " + m); } };
const eq = (got, want, m) => ok(got === want, `${m}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`);

const A = (id, mime) => ({ id, mime_type: mime, storage_path: `co/${id}.bin` });

// ---- browser-renderable formats preview ------------------------------------
for (const m of ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif", "image/bmp"])
  ok(isPreviewableMime(m), `previewable: ${m}`);
ok(isPreviewableMime("IMAGE/PNG"), "mime match is case-insensitive");
ok(isPreviewableMime("image/jpeg; charset=binary"), "mime parameters ignored");

// ---- unsupported formats do not ---------------------------------------------
for (const m of ["image/x-emf", "image/emf", "application/x-msmetafile", "image/x-wmf",
                 "image/tiff", "image/heic", "application/postscript", "image/svg+xml"])
  ok(!isPreviewableMime(m), `not previewable: ${m}`);

// ---- allowlist: unknown/absent types degrade safely -------------------------
for (const m of ["image/some-future-codec", "application/octet-stream", "", null, undefined])
  ok(!isPreviewableMime(m), `unknown type degrades to non-previewable: ${JSON.stringify(m)}`);

// ---- the placeholder caption -------------------------------------------------
eq(formatLabel("image/x-emf"), "EMF image", "EMF label");
eq(formatLabel("image/tiff"), "TIFF image", "TIFF label");
eq(previewability(A("e", "image/x-emf")).reason, "Preview unavailable — EMF image", "restrained placeholder copy");
eq(previewability(A("p", "image/png")).reason, null, "previewable assets carry no reason");

// ---- extraction results keep the unsupported asset --------------------------
const EXTRACTED = [
  A("i1", "image/png"), A("i2", "image/x-emf"), A("i3", "image/x-emf"),
  A("i4", "image/x-emf"), A("i5", "image/png"), A("i6", "image/png"), A("i7", "image/png"),
];
const annotated = annotateAssets(EXTRACTED);
eq(annotated.length, 7, "all 7 extracted assets are preserved, none discarded");
eq(annotated.filter((a) => a.previewable).length, 4, "4 PNGs previewable");
eq(annotated.filter((a) => !a.previewable).length, 3, "3 EMFs marked non-previewable");
ok(annotated.every((a) => "previewable" in a), "previewability is marked on every asset");
ok(annotated.find((a) => a.id === "i2").preview_reason === "Preview unavailable — EMF image",
   "unsupported asset carries its reason in media state");
ok(annotated.every((a, i) => a.id === EXTRACTED[i].id), "order and identity preserved");
ok(annotated.every((a, i) => a.storage_path === EXTRACTED[i].storage_path),
   "provenance fields (storage_path) preserved on unsupported assets");

// ---- unsupported assets cannot be selected for publishing -------------------
ok(!isPublishableAsset(A("e", "image/x-emf")), "EMF is not publishable");
ok(isPublishableAsset(A("p", "image/png")), "PNG is publishable");
eq(sanitizeSelection(["i1", "i2", "i5"], EXTRACTED).join(","), "i1,i5", "EMF id stripped from a selection");
eq(sanitizeSelection(["i2", "i3", "i4"], EXTRACTED).length, 0, "an all-EMF selection sanitises to empty");
eq(sanitizeSelection(["i1"], EXTRACTED).join(","), "i1", "valid selection survives untouched");
eq(sanitizeSelection(["nope"], EXTRACTED).length, 0, "unknown id is not selectable");
eq(sanitizeSelection(null, EXTRACTED).length, 0, "null selection is handled");
eq(sanitizeSelection(["i2"], []).length, 0, "selection against no assets is empty");

// ---- no broken <img>: the tile decides before any URL is requested ----------
// MediaTile renders an <img> only when `previewable` is true AND a signed url
// arrived, and skips the signed-url request entirely otherwise. Assert the
// predicate the component branches on, for every asset in the real document.
ok(annotated.filter((a) => !a.previewable).every((a) => previewability(a).previewable === false),
   "no unsupported asset can reach the <img> branch");
ok(annotated.filter((a) => a.previewable).every((a) => a.preview_reason === null),
   "previewable assets render normally, with no placeholder");

// ---- the real Kingsmen mix ---------------------------------------------------
const KNG = annotateAssets([
  A("image1", "image/png"), A("image2", "image/x-emf"), A("image3", "image/x-emf"),
  A("image4", "image/x-emf"), A("image5", "image/png"), A("image6", "image/png"), A("image7", "image/png"),
]);
eq(KNG.filter((a) => a.previewable).map((a) => a.id).join(","), "image1,image5,image6,image7",
   "real document: the 4 PNGs are the previewable set");
eq(sanitizeSelection(KNG.map((a) => a.id), KNG).join(","), "image1,image5,image6,image7",
   "real document: select-all yields only the browser-renderable images");

ok(PREVIEWABLE_IMAGE_MIME.size > 0 && !PREVIEWABLE_IMAGE_MIME.has("image/svg+xml"),
   "allowlist is non-empty and excludes SVG by design");

// ---- component guard: the tile must never mount an unguarded <img> ---------
// The unit tests above pin the rule; this pins the one call site that depends on
// it. A future edit that drops the guard and renders <img src={url}> for every
// asset would reintroduce the broken tile with every unit test still green.
import fs from "node:fs";
import path from "node:path";
const TILE = fs.readFileSync(
  path.join(import.meta.dirname, "..", "src", "portal", "publish", "CreateRelease.jsx"), "utf8",
);
const tileRaw = TILE.slice(TILE.indexOf("function MediaTile("), TILE.indexOf("/* ------", TILE.indexOf("function MediaTile(")));
// Comments in this component legitimately mention <img>; count real JSX only.
const tileSrc = tileRaw.replace(/^\s*\/\/.*$/gm, "");
ok(/previewability\(asset\)/.test(tileSrc), "MediaTile consults previewability() for the asset");
ok(/if \(!previewable\) return/.test(tileSrc), "MediaTile skips the signed-URL request when not previewable");
ok(/\{!previewable \? \(/.test(tileSrc), "MediaTile branches on previewable before rendering");
ok(/Preview unavailable/.test(tileRaw), "MediaTile renders the placeholder copy");
ok(tileSrc.split("<img").length - 1 === 1, "MediaTile contains exactly one <img>, on the previewable branch");
ok(/\) : url \? \(\s*\n\s*<img/.test(tileSrc), "the <img> sits on the previewable+url branch, not the default");
ok(/const Tag = previewable \? "button" : "div"/.test(tileSrc), "unsupported tiles are not buttons");

console.log(`\nmedia support: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
