// Shared text primitives for the premium design families.
//
// These emit SVG markup strings rather than React elements, because each
// premium family is composed as a whole page rather than assembled from
// components -- that is what lets six families have genuinely different
// structure instead of six skins on one layout. The strings are rendered
// inside the same <svg> the rest of the system uses, so preview and export
// stay byte-identical.

import { fitText, wrapText, measure } from "./textEngine.js";

export const W = 1080, H = 1350;
export const SERIF = "'Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif";
export const SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif";
export const MONO = "'SF Mono','Roboto Mono',Menlo,Consolas,monospace";

const stackKey = (f) => (/Palatino|Georgia|Iowan/.test(f) ? "serif" : /Mono|Menlo|Consolas/.test(f) ? "mono" : "sans");
export const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Fitted, wrapped text. Never truncates: a block that cannot fit reports
 *  nothing and simply sets at its minimum, so no disclosure is lost. */
export function block(text, { x, y, w, h, font, weight = 400, size, min = 16, max, lh = 1.1, fill, anchor = "start", tracking = 0, upper = false }) {
  const t = String(text == null ? "" : text).trim();
  if (!t) return "";
  const stack = stackKey(font);
  const body = upper ? t.toUpperCase() : t;
  const fit = size
    ? { size, lines: wrapText(body, { size, width: w, stack, weight }).lines }
    : fitText(body, { width: w, height: h, min, max: max || 120, stack, weight, lh });
  const fs = fit.size;
  const ax = anchor === "middle" ? x + w / 2 : anchor === "end" ? x + w : x;
  return fit.lines.map((ln, i) =>
    `<text x="${ax}" y="${y + fs * 0.74 + i * fs * lh}" fill="${fill}" text-anchor="${anchor}" font-family="${font}" font-size="${fs}" font-weight="${weight}"${tracking ? ` letter-spacing="${tracking}"` : ""}>${esc(ln)}</text>`
  ).join("");
}

/** One line, shrunk to fit rather than clipped. */
export function line(text, { x, y, w, font, weight = 400, size, fill, anchor = "start", tracking = 0, upper = false }) {
  const s = String(text == null ? "" : text).trim();
  if (!s) return "";
  const body = upper ? s.toUpperCase() : s;
  const nat = measure(body, size, { stack: stackKey(font), weight }) + tracking * body.length;
  const fs = nat > w ? Math.max(9, Math.floor(size * (w / nat))) : size;
  const ax = anchor === "middle" ? x + w / 2 : anchor === "end" ? x + w : x;
  return `<text x="${ax}" y="${y}" fill="${fill}" text-anchor="${anchor}" font-family="${font}" font-size="${fs}" font-weight="${weight}"${tracking ? ` letter-spacing="${tracking}"` : ""}>${esc(body)}</text>`;
}

export const img = (href, x, y, w, h, id) => href
  ? `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath><image href="${esc(href)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`
  : "";

/** A company mark: contained to its own aspect, never cropped or rounded. */
export const logoMark = (href, x, y, h, aspect = 1, anchor = "start", max = 420) => {
  if (!href) return "";
  const w = Math.min(max, Math.round(h * (aspect > 0 ? aspect : 1)));
  return `<image href="${esc(href)}" x="${anchor === "middle" ? x - w / 2 : x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>`;
};

/** Readable ink on an arbitrary accent. */
export function inkOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 0.42 ? "#0b1220" : "#ffffff";
}

/** The slide's content, normalised. Everything a premium family may draw,
 *  derived ONLY from the approved card, the company profile and the release's
 *  own images -- never invented, never padded to fill a layout. */
export function premiumContent({ slide = {}, brand = {}, deck = [] }) {
  const f = slide.fields || {};
  const byKind = (k) => (deck.find((s) => s.kind === k) || {}).fields || {};
  const ann = byKind("announcement"), res = byKind("keyResults"), ctx = byKind("context"), why = byKind("why"), clo = byKind("closing");
  return {
    kind: slide.kind,
    eyebrow: f.eyebrow || ann.eyebrow || "",
    headline: f.headline || ann.headline || "",
    project: f.project || ann.project || "",
    // A CORPORATE RELEASE HAS NO PROJECT. Financings, appointments and
    // governance news leave `project` empty, and a composition that sets it
    // large then renders an empty field. `subject` is what those
    // compositions fall back to -- the release's own category, or the
    // company itself. It never invents a project name the release did not
    // disclose, and it is used only where a design needs a line of type to
    // hold a panel together.
    subject: f.project || ann.project || f.eyebrow || ann.eyebrow || brand.name || "",
    date: f.date || ann.date || "",
    title: f.title || "",
    body: f.body || "",
    rows: Array.isArray(f.rows) ? f.rows.filter((r) => r && (r.v || r.desc)) : (res.rows || []),
    // Context body belongs to the context slide; other slides borrow it only
    // where the design calls for supporting copy, and never twice on a page.
    context: ctx.body || "",
    takeaway: why.body || "",
    cta: f.cta || clo.cta || "Read the full release",
    url: f.url || clo.url || "",
    tickers: (f.tickers || clo.tickers || brand.tickers || []).map((t) => [t.ex || "", t.sym || ""]).filter(([, s]) => s),
    company: brand.name || "",
    location: brand.location || "",
    logo: brand.logo || "",
  };
}

export const tickerLine = (tk) => tk.map(([e, s]) => `${e} ${s}`).join("  ·  ");
