// Extract embedded raster images from a PDF, in the browser, with pdf.js.
//
// Text extraction already lives in pdfText.js and costs nothing; this is the
// image half. It walks each page's operator list for image XObjects and renders
// them to a canvas, which normalises the many internal PDF pixel formats into
// PNG without us having to decode CMYK, indexed palettes or JPX by hand.
//
// WHAT IT DELIBERATELY DISCARDS
//   * anything below MIN_PX on a side — rules, bullets, hairline spacers
//   * near-square tiny marks — icons and glyph fragments
//   * images beyond MAX_IMAGES — a scanned deck is not a media library
//
// It returns CANDIDATES. Nothing here decides an image is worth publishing; the
// caller hashes, stores privately, and the CEO chooses. A false positive costs a
// thumbnail in a review list, which is much cheaper than silently dropping the
// one photograph that mattered.

const PDFJS_VER = "3.11.174";
const CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VER}`;

const MIN_PX = 120;          // smaller than this on either side is furniture
const MAX_IMAGES = 40;
const MAX_PAGES_SCANNED = 40;

let _loading = null;
function loadPdfjs() {
  if (typeof window !== "undefined" && window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (_loading) return _loading;
  _loading = new Promise((resolve, reject) => {
    const existing = document.getElementById("pdfjs-lib");
    if (existing) { existing.addEventListener("load", () => resolve(window.pdfjsLib)); return; }
    const s = document.createElement("script");
    s.id = "pdfjs-lib";
    s.src = `${CDN}/pdf.min.js`;
    s.onload = () => {
      try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${CDN}/pdf.worker.min.js`; } catch (_) {}
      resolve(window.pdfjsLib);
    };
    s.onerror = () => reject(new Error("pdf.js failed to load"));
    document.head.appendChild(s);
  });
  return _loading;
}

// pdf.js hands back raw pixel data in several shapes. Painting it onto a canvas
// is the one path that handles them all and yields a PNG we can hash and store.
function imgToBlob(img) {
  const { width, height } = img;
  if (!width || !height) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d");

  if (img.bitmap) {                       // ImageBitmap (pdf.js ≥ 3 fast path)
    ctx.drawImage(img.bitmap, 0, 0);
  } else if (img.data) {
    const src = img.data;
    const out = ctx.createImageData(width, height);
    const px = width * height;
    if (src.length === px * 4) {
      out.data.set(src);
    } else if (src.length === px * 3) {   // RGB → RGBA
      for (let i = 0, j = 0; i < px; i++, j += 3) {
        out.data[i * 4] = src[j]; out.data[i * 4 + 1] = src[j + 1];
        out.data[i * 4 + 2] = src[j + 2]; out.data[i * 4 + 3] = 255;
      }
    } else if (src.length === px) {       // greyscale
      for (let i = 0; i < px; i++) {
        out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = src[i];
        out.data[i * 4 + 3] = 255;
      }
    } else { return null; }               // unknown packing — skip, don't guess
    ctx.putImageData(out, 0, 0);
  } else { return null; }

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

/**
 * Candidate images from a PDF.
 * Returns [{ blob, width, height, page, name }] — never throws; an unreadable
 * PDF yields [] so ingestion can continue with text only.
 */
export async function pdfImages(file, { maxImages = MAX_IMAGES, minPx = MIN_PX } = {}) {
  const out = [];
  try {
    const pdfjs = await loadPdfjs();
    const buf = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buf }).promise;
    const seen = new Set();                       // same XObject reused across pages
    const pages = Math.min(doc.numPages, MAX_PAGES_SCANNED);

    for (let p = 1; p <= pages && out.length < maxImages; p++) {
      let page, ops;
      try { page = await doc.getPage(p); ops = await page.getOperatorList(); }
      catch (_) { continue; }                     // one bad page must not stop the rest

      for (let i = 0; i < ops.fnArray.length && out.length < maxImages; i++) {
        const fn = ops.fnArray[i];
        if (fn !== pdfjs.OPS.paintImageXObject && fn !== pdfjs.OPS.paintJpegXObject) continue;
        const name = ops.argsArray[i] && ops.argsArray[i][0];
        if (!name || seen.has(name)) continue;
        seen.add(name);

        try {
          const img = await new Promise((resolve) => {
            let settled = false;
            const done = (v) => { if (!settled) { settled = true; resolve(v); } };
            try { page.objs.get(name, done); } catch (_) { done(null); }
            setTimeout(() => done(null), 5000);   // some objects never resolve
          });
          if (!img || !img.width || !img.height) continue;
          if (img.width < minPx || img.height < minPx) continue;   // furniture

          const blob = await imgToBlob(img);
          if (blob && blob.size > 1024) {
            out.push({ blob, width: img.width, height: img.height, page: p, name: `page-${p}-${name}.png` });
          }
        } catch (_) { /* skip this image */ }
      }
      try { page.cleanup(); } catch (_) {}
    }
  } catch (_) { /* no pdf.js, encrypted, or corrupt → text-only ingestion */ }
  return out;
}

/* ============================================================
   PAGE RENDER FALLBACK
   ------------------------------------------------------------
   Many mining figures — claim maps, cross-sections, long sections, drill plans —
   are VECTOR graphics, not embedded rasters. pdfImages() cannot see them, so a
   page full of geology can look empty.

   The fallback is deliberately dumb: if a page draws a lot of vector content and
   produced no embedded image, render THE WHOLE PAGE and offer it as a candidate.

   What it does NOT do, on purpose:
     * no region detection, no cropping — cropping a figure out of a page means
       guessing where it starts, and a wrong crop silently mutilates a map
     * no interpretation — nothing here reads geology, geometry, scale or captions
     * no automatic inclusion — a page render is a CANDIDATE for human review

   A full page with honest provenance beats a fabricated crop.
   ============================================================ */

const RENDER_MAX_PX     = 1600;   // longest side
const RENDER_MAX_PAGES  = 12;
const RENDER_MIN_VECTOR = 40;     // path ops below this is a text page, not a figure
const RENDER_QUALITY    = 0.85;

/**
 * Render pages that look visually substantial but yielded no embedded image.
 *
 * `skipPages` — pages pdfImages() already produced a raster for, so the same
 * figure is not offered twice.
 *
 * Returns [{ blob, width, height, page, name, vectorOps }].
 */
export async function pdfPageRenders(file, { skipPages = [], maxPages = RENDER_MAX_PAGES } = {}) {
  const out = [];
  const skip = new Set(skipPages);
  try {
    const pdfjs = await loadPdfjs();
    const buf = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buf }).promise;
    const pages = Math.min(doc.numPages, MAX_PAGES_SCANNED);

    for (let p = 1; p <= pages && out.length < maxPages; p++) {
      if (skip.has(p)) continue;                       // its raster was already captured
      let page;
      try { page = await doc.getPage(p); } catch (_) { continue; }

      // Is there enough vector drawing here to be a figure rather than prose?
      let vectorOps = 0;
      try {
        const ops = await page.getOperatorList();
        for (const fn of ops.fnArray) {
          if (fn === pdfjs.OPS.constructPath || fn === pdfjs.OPS.fill ||
              fn === pdfjs.OPS.stroke || fn === pdfjs.OPS.eoFill ||
              fn === pdfjs.OPS.fillStroke || fn === pdfjs.OPS.shadingFill) vectorOps++;
        }
      } catch (_) { try { page.cleanup(); } catch (_) {} continue; }

      if (vectorOps < RENDER_MIN_VECTOR) { try { page.cleanup(); } catch (_) {} continue; }

      try {
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(RENDER_MAX_PX / Math.max(base.width, base.height), 2.5);
        const viewport = page.getViewport({ scale: Math.max(scale, 0.5) });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";                      // PDFs assume paper
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;

        const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", RENDER_QUALITY));
        if (blob && blob.size > 8 * 1024) {
          out.push({ blob, width: canvas.width, height: canvas.height, page: p,
                     name: `page-${p}-render.jpg`, vectorOps });
        }
      } catch (_) { /* skip this page */ }
      try { page.cleanup(); } catch (_) {}
    }
  } catch (_) { /* no pdf.js or unreadable → no renders */ }
  return out;
}

export const canExtractImages = () => typeof document !== "undefined";
