// scripts/gen-kingsmen-briefs.mjs — build public/kingsmen-briefs.json for the Kingsmen demo:
// a v2 Brief (structured Key Results) for EVERY Kingsmen release, plus the full release text with
// its figures/tables attached from public/pr-fixture. The 8 approved briefs keep their hand-authored
// v2 + full (brief-bench.json); the rest are generated from the release's own full text and have
// their images matched by date. Kingsmen only. No prod writes. OpenAI via MINEEX_BRIEF_API_KEY.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateBrief, briefToV2, BRIEF_MODEL } from "../api/_briefGen.js";
import { validateBrief } from "../api/_briefValidate.js";
import { formatReleaseText } from "../src/lib/pressRelease.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const f of [".env.local"]) { try { for (const l of fs.readFileSync(path.join(ROOT, f), "utf8").split("\n")) { const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(l); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); } } catch {} }
if (!process.env.MINEEX_BRIEF_API_KEY) { console.error("✗ MINEEX_BRIEF_API_KEY missing (.env.local)"); process.exit(2); }
const MODEL = process.env.MINEEX_BRIEF_MODEL || BRIEF_MODEL();

// ---- extract the real Kingsmen PR_YEARS + FULL from the app source (JSON literals) ----
const SRC = fs.readFileSync(path.join(ROOT, "src/aiBrief/PassportProto.jsx"), "utf8");
function extract(marker, open, close) {
  const i = SRC.indexOf(marker); let j = SRC.indexOf(open, i), depth = 0, inStr = false, q = "", esc = false;
  for (let k = j; k < SRC.length; k++) { const ch = SRC[k];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === q) inStr = false; continue; }
    if (ch === '"') { inStr = true; q = ch; continue; }
    if (ch === open) depth++; else if (ch === close) { depth--; if (depth === 0) return SRC.slice(j, k + 1); }
  }
  return null;
}
const PRY = JSON.parse(extract("export let PR_YEARS = _PP.PR_YEARS ??", "[", "]"));
const FULL = JSON.parse(extract("export let FULL = _PP.FULL ??", "{", "}"));
const releases = []; PRY.forEach((y) => y.items.forEach((it) => releases.push(it)));
const ids = releases.map((r) => r.id);
const bench = JSON.parse(fs.readFileSync(path.join(ROOT, "public/brief-bench.json"), "utf8"));
const approved = new Set(bench.dates);

// ---- match pr-fixture images to each release by date ----
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function parseImg(name) {
  let m = /^([a-z]{3})(\d{1,2})(?:-(\d{4}))?-/.exec(name); if (m && MON[m[1]]) return { mo: MON[m[1]], d: +m[2], y: m[3] ? +m[3] : null };
  m = /^(\d{4})-(\d{2})-(\d{2})-/.exec(name); if (m) return { y: +m[1], mo: +m[2], d: +m[3] };
  return null;
}
function assign(p) {
  const cands = ids.filter((id) => { const [Y, M, D] = id.split("-").map(Number); return M === p.mo && D === p.d; });
  if (!cands.length) return null;
  if (p.y) return cands.find((id) => +id.split("-")[0] === p.y) || null;
  return cands.sort((a, b) => b.localeCompare(a))[0]; // no year → most recent occurrence
}
function caption(name) {
  const base = name.replace(/\.[a-z]+$/i, "");
  const fig = /(?:^|-)(fig|figure)0*(\d+)/i.exec(base), tab = /(?:^|-)(table)0*(\d+)/i.exec(base);
  const lead = fig ? `Figure ${fig[2]}` : tab ? `Table ${tab[2]}` : "";
  let desc = base.replace(/^[a-z]{3}\d{1,2}(-\d{4})?-/i, "").replace(/^\d{4}-\d{2}-\d{2}-/, "")
    .replace(/(fig|figure|table)0*\d+-?/i, "").replace(/-/g, " ").trim();
  desc = desc.replace(/\blc(\d)/gi, "LC-$1").replace(/\b([a-z])/g, (c) => c);
  return [lead, desc].filter(Boolean).join(" — ");
}
const imgMap = {};
for (const f of fs.readdirSync(path.join(ROOT, "public/pr-fixture"))) {
  const p = parseImg(f.toLowerCase()); if (!p) continue; const id = assign(p); if (!id) continue;
  (imgMap[id] = imgMap[id] || []).push(f);
}
for (const id of Object.keys(imgMap)) imgMap[id].sort(); // fig1,fig2,table1,table2 order
// Build a well-formatted full release: reflow the raw text into headings + paragraphs
// (formatReleaseText), then place each image inline right after the paragraph that first
// references its Figure/Table number (unreferenced images go at the end).
function buildFull(rawText, files, headline) {
  const fmt = formatReleaseText(rawText || "");
  let segs = fmt.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  // Drop the leading title (the sheet header already shows the headline): the real body starts at
  // the dateline paragraph ("Vancouver … (date) … is pleased to report …"). Keep from there.
  const dateIdx = segs.findIndex((s) => /is pleased to|--\s*\(|\bTSXV\s*:|\bTSX-V\s*:|vancouver,?\s+british columbia/i.test(s));
  if (dateIdx > 0) segs = segs.slice(dateIdx);
  const imgs = (files || []).map((f) => {
    const m = /(fig|figure|table)0*(\d+)/i.exec(f);
    return { f, kind: m ? (/^t/i.test(m[1]) ? "table" : "fig") : null, num: m ? +m[2] : null, src: `/pr-fixture/${f}`, caption: caption(f), used: false };
  });
  const blocks = [];
  for (const seg of segs) {
    blocks.push({ text: seg });
    for (const im of imgs) {
      if (im.used || im.num == null) continue;
      const re = im.kind === "table" ? new RegExp(`\\btable\\s*0*${im.num}\\b`, "i") : new RegExp(`\\bfig(?:ure)?\\.?\\s*0*${im.num}\\b`, "i");
      if (re.test(seg)) { blocks.push({ type: "image", src: im.src, caption: im.caption }); im.used = true; }
    }
  }
  for (const im of imgs) if (!im.used) blocks.push({ type: "image", src: im.src, caption: im.caption });
  return { blocks };
}
// Reuse v2 Briefs already generated (don't re-spend on OpenAI) unless --regen.
const REGEN = process.argv.includes("--regen");
let prevV2 = {};
try { prevV2 = (JSON.parse(fs.readFileSync(path.join(ROOT, "public/kingsmen-briefs.json"), "utf8")).v2) || {}; } catch {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const outV2 = {}, outFull = {}; const report = [];
let totalCost = 0;

for (const r of releases) {
  const id = r.id;
  if (approved.has(id)) {                                   // keep the hand-authored approved brief + full (images/captions)
    outV2[id] = bench.v2[id];
    outFull[id] = bench.full[id];
    report.push({ id, source: "approved", kr: (bench.v2[id].kr || []).length });
    continue;
  }
  const text = typeof FULL[id] === "string" ? FULL[id] : (FULL[id] && FULL[id].text) || "";
  const full = buildFull(text, imgMap[id], r.headline);                 // reflowed text + inline images
  const nImg = full.blocks.filter((b) => b.type === "image").length;
  outFull[id] = full;
  if (!text || text.trim().length < 60) { report.push({ id, source: "no-text", kr: 0 }); continue; }
  if (!REGEN && prevV2[id]) { outV2[id] = prevV2[id]; report.push({ id, source: "reused", kr: (prevV2[id].kr || []).length, images: nImg }); console.log(`  · ${id} reused v2  kr=${(prevV2[id].kr || []).length} img=${nImg}`); continue; }
  let brief = null, cost = 0, attempt = 0, err = null;
  while (attempt < 3 && !brief) { attempt++; try { const g = await generateBrief({ sourceText: text, companyName: "Kingsmen Resources", sourceDate: id, model: MODEL }); brief = g.brief; cost = g.cost; } catch (e) { err = e; const transient = !e.status || e.status === 429 || e.status >= 500; if (!transient || attempt >= 3) break; await sleep(700 * attempt); } }
  totalCost += cost;
  if (!brief) { report.push({ id, source: "gen-failed", error: err?.message, kr: 0 }); console.log(`  ✗ ${id} gen failed: ${err?.message}`); continue; }
  const v = validateBrief(brief, text);
  outV2[id] = briefToV2(brief, brief.category);
  report.push({ id, source: "generated", cat: brief.category, kr: (brief.keyResults || []).length, status: v.status, images: nImg, cost: +cost.toFixed(5) });
  console.log(`  ${v.status === "PASS" ? "✓" : v.status === "REVIEW" ? "⚠" : "✗"} ${id} [${brief.category}] kr=${(brief.keyResults || []).length} img=${nImg} ${v.status} $${cost.toFixed(5)}`);
}

const outPath = path.join(ROOT, "public/kingsmen-briefs.json");
fs.writeFileSync(outPath, JSON.stringify({ dates: ids, v2: outV2, full: outFull, _meta: { model: MODEL, generatedAt: new Date().toISOString() } }, null, 2));
const withKR = report.filter((r) => r.kr > 0).length, withImg = Object.keys(outFull).filter((id) => (outFull[id].blocks || []).some((b) => b.type === "image")).length;
console.log(`\nreleases: ${ids.length} | v2 briefs: ${Object.keys(outV2).length} | with Key Results: ${withKR} | with images: ${withImg} | generated cost: $${totalCost.toFixed(4)}`);
console.log(`wrote ${path.relative(ROOT, outPath)}`);
