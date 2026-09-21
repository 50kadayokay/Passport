// Which extracted images a browser can actually display.
//
// WHY THIS EXISTS
// ---------------
// A .docx can embed formats no browser decodes. The real Kingsmen release carries
// three EMF parts (Windows Enhanced Metafile) alongside four PNGs. Handed to an
// <img>, an EMF renders as a broken-image tile — and worse, the company could tick
// it and "publish" an image investors would never see.
//
// So capability is decided BEFORE display, from the stored mime type.
//
// ALLOWLIST, NOT DENYLIST
// -----------------------
// Anything not positively known to be browser-renderable is treated as not
// previewable. That way a format nobody has thought of yet degrades to a tidy
// placeholder instead of a broken tile — the failure mode is safe by default.
// A denylist would have to predict every format Word might emit (EMF, WMF, PICT,
// TIFF, CDR, …) and would silently break the first time it guessed wrong.
//
// NOTHING IS DELETED OR CONVERTED
// -------------------------------
// The unsupported asset is still extracted, hashed, stored privately and given its
// provenance row. It simply cannot be previewed or selected. No conversion
// dependency is introduced; previewability is derived from data already stored on
// `media_assets.mime_type`, so no migration is needed either.

/**
 * Mime types an <img> can decode, across current browsers.
 *
 * SVG is deliberately absent. It renders in an <img>, but it is an active document
 * from an untrusted upload, and listing it here would make it previewable for any
 * future surface that renders media some other way. Extraction never produces SVG,
 * so excluding it costs nothing and removes a footgun.
 */
export const PREVIEWABLE_IMAGE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",      // non-standard but seen in the wild
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
  "image/x-ms-bmp",
  "image/apng",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

/** Human names for formats we knowingly cannot preview. */
const FORMAT_LABELS = [
  [/^image\/x-emf$|^image\/emf$|^application\/x-msmetafile$/i, "EMF"],
  [/^image\/x-wmf$|^image\/wmf$/i, "WMF"],
  [/^image\/tiff$/i, "TIFF"],
  [/^image\/vnd\.adobe\.photoshop$|^image\/psd$/i, "PSD"],
  [/^application\/postscript$/i, "EPS"],
  [/^image\/svg\+xml$/i, "SVG"],
  [/^image\/heic$|^image\/heif$/i, "HEIC"],
];

const norm = (mime) => String(mime || "").trim().toLowerCase().split(";")[0];

/** True when a browser <img> can render this mime type. */
export function isPreviewableMime(mime) {
  return PREVIEWABLE_IMAGE_MIME.has(norm(mime));
}

/**
 * A short, human name for a format — "EMF image", "TIFF image", or a generic
 * fallback built from the subtype. Used for the placeholder caption, so it must
 * never read like an error.
 */
export function formatLabel(mime) {
  const m = norm(mime);
  for (const [re, name] of FORMAT_LABELS) if (re.test(m)) return `${name} image`;
  const sub = m.split("/")[1];
  if (!sub) return "Unsupported image";
  return `${sub.replace(/^x-/, "").toUpperCase()} image`;
}

/**
 * Previewability of one stored asset.
 *
 * Returns `{ previewable, label, reason }`. `reason` is null when previewable, and
 * otherwise a sentence fit to show a company user — no mime types, no jargon.
 */
export function previewability(asset) {
  const mime = norm(asset && (asset.mime_type || asset.mime || asset.contentType));
  if (isPreviewableMime(mime)) return { previewable: true, label: "Image", reason: null };
  const label = formatLabel(mime);
  return { previewable: false, label, reason: `Preview unavailable — ${label}` };
}

/** Convenience: can this asset be shown to investors? Previewable implies yes. */
export function isPublishableAsset(asset) {
  return previewability(asset).previewable;
}

/**
 * Annotate a list of assets with `previewable` / `preview_label` / `preview_reason`.
 *
 * Mutating a copy rather than filtering is deliberate: requirement is that the
 * unsupported asset stays visible and accounted for, just not previewable or
 * selectable. Dropping it here would hide real extracted content from the operator.
 */
export function annotateAssets(assets) {
  return (Array.isArray(assets) ? assets : []).map((a) => {
    const p = previewability(a);
    return { ...a, previewable: p.previewable, preview_label: p.label, preview_reason: p.reason };
  });
}

/**
 * Remove ids of non-previewable assets from a selection.
 *
 * Drafts persist `selected_asset_ids`. A draft saved before this rule existed — or
 * one edited in another session — can carry an unsupported id, so selections are
 * sanitised on load as well as on click. Publishing an image investors cannot see
 * is a silent failure, and this is the one place to stop it.
 */
export function sanitizeSelection(selectedIds, assets) {
  const allowed = new Set(
    (Array.isArray(assets) ? assets : []).filter(isPublishableAsset).map((a) => a && a.id),
  );
  return [...(selectedIds || [])].filter((id) => allowed.has(id));
}
