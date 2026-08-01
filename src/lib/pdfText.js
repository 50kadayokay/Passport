// Client-side PDF text extraction — free, no AI call.
//
// Most onboarding documents (press releases, website pages saved as PDF) have a
// real text layer, so we can pull their text in the browser with pdf.js instead
// of paying a model to transcribe each one. This is the single biggest cost lever
// in onboarding: it removes ~1 AI call per document.
//
// Loaded from cdnjs the same way the map loads Leaflet — no bundled dependency.
// Returns "" when pdf.js can't load or the PDF has no text layer (a scanned image);
// the caller can then fall back to AI transcription for those rare cases.

const PDFJS_VER = "3.11.174";
const CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VER}`;

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

// Extract text from a File (or ArrayBuffer). Returns "" on any failure so the
// caller degrades gracefully — never throws into the onboarding flow.
export async function pdfToText(file, { maxChars = 400000 } = {}) {
  try {
    const pdfjs = await loadPdfjs();
    const buf = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buf }).promise;
    const parts = [];
    let chars = 0;
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      // Join text items; pdf.js gives them in reading order per page.
      const pageText = content.items.map((it) => (it.str || "")).join(" ").replace(/\s+/g, " ").trim();
      if (pageText) { parts.push(pageText); chars += pageText.length; }
      if (chars >= maxChars) break;
    }
    return parts.join("\n\n").slice(0, maxChars);
  } catch (_) {
    return "";
  }
}

// True for files pdf.js can read.
export const isPdf = (file) => !!file && (file.type === "application/pdf" || /\.pdf$/i.test(file.name || ""));

// Deep per-page extraction-HEALTH analysis (Onboarding Engine, Pass 0). Returns page
// count, per-page character counts + a hasText flag, total chars, image-only page count,
// readable-text %, and the joined text. A page with almost no text is treated as
// image-only (a scanned slide / map), so an image-only deck can never look "processed".
const IMG_ONLY_MIN_CHARS = 25;   // a page with fewer than this is effectively image-only
export async function analyzePdf(file, { maxChars = 600000 } = {}) {
  try {
    const pdfjs = await loadPdfjs();
    const buf = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buf }).promise;
    const pages = [];
    const texts = [];
    let totalChars = 0, textPages = 0;
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const t = content.items.map((it) => (it.str || "")).join(" ").replace(/\s+/g, " ").trim();
      const chars = t.length;
      const hasText = chars >= IMG_ONLY_MIN_CHARS;
      pages.push({ page: p, chars, hasText });
      if (hasText) { textPages++; if (totalChars < maxChars) texts.push(t); }
      totalChars += chars;
    }
    const numPages = doc.numPages;
    return {
      ok: true, numPages, pages,
      totalChars, textPages, imageOnlyPages: numPages - textPages,
      readablePct: numPages ? Math.round((textPages / numPages) * 100) : 0,
      text: texts.join("\n\n").slice(0, maxChars),
      error: null,
    };
  } catch (e) {
    return { ok: false, numPages: 0, pages: [], totalChars: 0, textPages: 0, imageOnlyPages: 0, readablePct: 0, text: "", error: e.message || "pdf parse failed" };
  }
}
