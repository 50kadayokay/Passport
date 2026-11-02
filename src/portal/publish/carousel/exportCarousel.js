// Deterministic export: the same SVG the editor shows, rasterised locally.
//
// No image service, no generative call, no network round trip. The browser
// draws the markup it is already displaying, which is the only way to promise
// that the download matches the preview.

import { CANVAS } from "./families.js";

/** Remote images taint a canvas and make toBlob throw a SecurityError, so every
 *  pixel that ends up in a slide has to be inlined first. Returns "" on failure
 *  -- a slide without its photograph still exports; a crashed export does not. */
export async function toDataUri(url) {
  const u = String(url || "");
  if (!u) return "";
  if (u.startsWith("data:")) return u;
  try {
    const res = await fetch(u, { mode: "cors", credentials: "omit" });
    if (!res.ok) return "";
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ""));
      fr.onerror = () => resolve("");
      fr.readAsDataURL(blob);
    });
  } catch { return ""; }
}

/** One slide's SVG markup -> a PNG blob at exactly 1080x1350. */
export function svgToPng(svgMarkup, { scale = 1 } = {}) {
  return new Promise((resolve, reject) => {
    const svg = svgMarkup.includes("xmlns=") ? svgMarkup
      : svgMarkup.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    const blobUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = Math.round(CANVAS.w * scale);
        c.height = Math.round(CANVAS.h * scale);
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(blobUrl);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error("The browser could not encode the image."))), "image/png");
      } catch (e) { URL.revokeObjectURL(blobUrl); reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error("The slide could not be rendered.")); };
    img.src = blobUrl;
  });
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** All five slides as one ZIP, using the jszip already in the project. */
export async function zipSlides(files, zipName) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  files.forEach(({ name, blob }) => zip.file(name, blob));
  const out = await zip.generateAsync({ type: "blob" });
  download(out, zipName);
}

export const slideFilename = (slug, i, slide) =>
  `${slug || "release"}-${String(i + 1).padStart(2, "0")}-${slide.id}.png`;
