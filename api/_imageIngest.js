// _imageIngest.js — Stage 9C. UNIVERSAL first-party image ingestion for onboarding. Works ONLY on
// imagery the site itself embeds in the pages we already crawled (the Jina markdown carries every
// `![alt](url)`), so nothing is scraped from search engines, no stock, nothing fabricated. Every
// asset keeps its source page + image URL. Pipeline: discover → filter → classify → rank → dedupe
// → route into the existing Conference/profile image slots, with provenance + confidence. No
// company is special-cased. An OPTIONAL low-cost vision pass classifies only ambiguous high-value
// images (gated + capped) so we never spend vision tokens on trivial assets.
import { callLLMTool } from "./_openaiExtract.js";

// ── helpers ───────────────────────────────────────────────────────────────────
const dec = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const abs = (u, base) => { try { return new URL(u, base).href.replace(/#.*$/, ""); } catch { return ""; } };
const baseName = (u) => { try { return dec(new URL(u).pathname.split("/").pop() || ""); } catch { return ""; } };
const extOf = (f) => (f.match(/\.([a-z0-9]{2,5})(?:\.[a-z0-9]{2,5})?$/i) ? f.match(/\.([a-z0-9]{2,5})$/i)?.[1] || "" : "").toLowerCase();
const words = (s) => (String(s || "").toLowerCase().match(/[a-z]{3,}/g) || []);

// Known third-party hosts that are never company content, and name fragments that mark chrome/UI.
const THIRD_PARTY = /(doubleclick|googlesyndication|google-analytics|googletagmanager|gstatic|gravatar|fbcdn|facebook\.com|twitter\.com|x\.com|linkedin\.com|instagram|youtube\.com|ytimg|vimeo|tiktok|pinterest|addthis|sharethis|hotjar|hubspot|mailchimp|cloudflareinsights)/i;
const UI_NAME = /(favicon|apple-touch|mstile|sprite|\bicon\b|-icon|icon-|\bui-|spacer|pixel|1x1|blank|placeholder|arrow|chevron|hamburger|menu-|caret|bullet|divider|badge-app|app-store|google-play|play-store|social|facebook|twitter|linkedin|instagram|youtube|tiktok|\bx\b|cookie|gdpr|consent)/i;
const SCREENSHOT = /(screenshot|screen shot|website\s*screenshot|screen-)/i;

// Category keyword tables — matched against alt + filename + surrounding context + page kind.
// Order matters: the FIRST matching, most-specific class wins. Each entry: [regex, category, weight].
const RULES = [
  [/(long.?section|cross.?section|strati?graph|litholog|\bfig(?:ure)?\.?\s*\d|\bfigure\b|schematic|isometric|\b3d\b|block model|\btable\s*\d|long_section|_section)/i, "technical", 0.9],
  [/(locator|location map|regional map|jurisdiction|claims? map|property map|tenure|land package map|_locator|yukon.*(map|locator))/i, "jurisdiction_map", 0.85],
  [/(plan map|drill plan|grid map|geolog(?:y|ical) map|target map|prospect map|\bmap\b)/i, "project_map", 0.7],
  [/(core tray|core box|core shack|drill core|\bcore\b|assay|core photo)/i, "core", 0.85],
  [/(drill rig|drilling|\brig\b|rig-|drill-rig|drillrig|diamond drill)/i, "drilling", 0.85],
  [/(aerial|drone|panorama|landscape|mountain|valley|ridge|glacier|tundra|scenery|forest|alpine|snow|rainbow|\bsky\b|lake|river|terrain|_slide|slide\d)/i, "landscape", 0.75],
  [/(geologist|backpack|sampling|prospect|mapping|field crew|traverse|outcrop|field work|fieldwork|hiking|boots)/i, "field", 0.7],
  [/(camp|solar|airstrip|air strip|road|building|facility|drill pad|infrastructure|generator|accommodation|helicopter|heli-|logistics)/i, "infrastructure", 0.7],
  [/(historic|adit|shaft|portal|workings|heritage|old mine|abandoned)/i, "historic", 0.7],
  [/(headshot|portrait|\bbio\b|director|\bceo\b|\bcfo\b|\bvp\b|management team|team member|board of)/i, "team", 0.6],
  [/(banner|infographic|\bchart\b|presentation|\bslide\b|cover image|corporate|graphic)/i, "corporate_graphic", 0.5],
];
const PHOTO_CATS = new Set(["landscape", "field", "drilling", "core", "infrastructure", "historic", "team"]);
const PAGE_WEIGHT = { home: 3, page: 2, pdf: 1 };

// ── 1. DISCOVER ─────────────────────────────────────────────────────────────
// Parse every markdown image the crawl already captured, with its context. `linkedTo` marks a
// thumbnail wrapped in a link (e.g. a video), which we down-rank as primary photography.
export function discoverImages(corpus) {
  const sections = (corpus && corpus.sections) || [];
  const byUrl = new Map();
  const IMG = /(\[)?!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)(?:\]\(([^)\s]+)\))?/g;
  for (const sec of sections) {
    const text = String(sec.text || ""); let m;
    while ((m = IMG.exec(text))) {
      const alt = (m[2] || "").replace(/^Image\s*\d+:?\s*/i, "").trim();
      const url = abs(m[3], sec.url); if (!url || /^data:/i.test(url)) continue;
      const title = m[4] || ""; const linkedTo = m[5] || (m[1] ? "link" : "");
      const ctx = text.slice(Math.max(0, m.index - 160), m.index + 160).replace(/!?\[[^\]]*\]\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
      const rec = byUrl.get(url) || { url, alt, title, filename: baseName(url), ext: extOf(baseName(url)), sourcePages: [], sourceKinds: [], contexts: [], linkedTo, pageCount: 0 };
      if (!rec.alt && alt) rec.alt = alt;
      if (!rec.sourcePages.includes(sec.url)) { rec.sourcePages.push(sec.url); rec.sourceKinds.push(sec.kind); rec.pageCount++; }
      if (ctx && rec.contexts.length < 3) rec.contexts.push(ctx);
      byUrl.set(url, rec);
    }
  }
  return [...byUrl.values()];
}

// ── 2. FILTER ───────────────────────────────────────────────────────────────
// Hard-reject non-content assets. Returns { kept, rejected:[{url,reason}] }.
function filterCandidates(cands, companyName) {
  const kept = [], rejected = [];
  for (const c of cands) {
    const hay = `${c.filename} ${c.alt} ${c.title}`.toLowerCase();
    let reason = "";
    if (THIRD_PARTY.test(c.url)) reason = "third-party/ad/social host";
    else if (UI_NAME.test(hay)) reason = "UI/icon/social/favicon/decorative";
    else if (c.ext === "svg" && !/logo/.test(hay)) reason = "svg UI graphic";
    else if (c.ext === "gif") reason = "gif (likely decorative/animation)";
    if (reason) rejected.push({ url: c.url, filename: c.filename, reason }); else kept.push(c);
  }
  return { kept, rejected };
}

// Webflow/WordPress resize + hash suffixes → a normalized key for duplicate grouping.
const dupKey = (f) => f.toLowerCase()
  .replace(/^[0-9a-f]{24}_/, "")            // Webflow asset-id prefix
  .replace(/-p-\d+/g, "")                    // Webflow "-p-500" resize
  .replace(/-\d{2,4}x\d{2,4}/g, "")          // WordPress "-1024x768"
  .replace(/[-_ ]?(copy|scaled|v\d+|final|new|\(\d+\))/g, "")
  .replace(/\.[a-z0-9]+(\.[a-z0-9]+)?$/i, "")
  .replace(/[^a-z0-9]+/g, "").trim();

// ── 3. CLASSIFY ───────────────────────────────────────────────────────────────
function classifyOne(c) {
  // Classify from the image's OWN metadata (alt / filename / title) — NOT surrounding page text,
  // which wrongly promotes a scenic photo to "map" just because the page mentions a map. Page
  // context is used only for the leadership-page headshot signal below.
  const hay = `${c.alt} ${c.filename} ${c.title}`;
  const onLeadership = c.sourcePages.some((u) => /leader|team|management|about|board|director|governance/i.test(u));
  for (const [re, cat, w] of RULES) {
    if (re.test(hay)) {
      let category = cat, conf = w;
      if (cat === "landscape" && onLeadership && /portrait|headshot|\bbio\b/i.test(hay)) { category = "team"; }
      return { category, confidence: conf, why: `matched /${re.source.slice(0, 40)}…/ in ${c.alt ? "alt" : "filename"}` };
    }
  }
  // Leadership-page photo with no other signal → likely a headshot.
  if (onLeadership && PHOTO_CATS.has("team")) return { category: "team", confidence: 0.4, why: "on leadership/team page" };
  return { category: "unknown", confidence: 0.2, why: "no deterministic signal" };
}

// ── 4. RANK ────────────────────────────────────────────────────────────────
function scoreOne(c) {
  let s = c.confidence * 4;
  const kind = c.sourceKinds[0] || "page";
  s += (PAGE_WEIGHT[kind] || 1);
  s += Math.min(3, words(c.alt).length * 0.5);                 // descriptive alt = real content
  if (/^(image|img|dsc|screenshot|untitled|photo)\d*$/i.test(c.filename.replace(/\.[a-z0-9.]+$/i, ""))) s -= 2;
  if (/[a-z]{4,}/i.test(c.filename.replace(/^[0-9a-f]{24}_/, "")) && !/^[0-9a-f]+$/.test(c.filename)) s += 1;
  if (PHOTO_CATS.has(c.category) && /(jpe?g|webp|avif)$/i.test(c.ext)) s += 1.5;
  if (SCREENSHOT.test(`${c.filename} ${c.alt}`)) s -= 4;       // screenshots of slides/news
  if (c.linkedTo) s -= 1;                                       // video thumbnail etc.
  s += Math.min(1.5, (c.pageCount - 1) * 0.5);                  // appears on several pages = important
  return s;
}

// ── 5. LOGO (independent of project imagery) ──────────────────────────────────
// Partner / analyst / exchange logos live on investor pages and must NOT be mistaken for the
// company's own mark. A real logo either carries a company-name word or repeats site-wide (nav).
const PARTNER_LOGO = /(capital markets|securities|cormark|canaccord|\batb\b|\brbc\b|\bbmo\b|\bcibc\b|scotia|eight capital|stifel|raymond james|sponsor|member of|\bllp\b|advisor|analyst|\bbank\b|broker|\btsx\b|\botcqb\b|\bcse\b|\bnyse\b|nasdaq|frankfurt|exchange|refinitiv|bloomberg)/i;
function pickLogo(cands, companyName) {
  const cn = words(companyName).filter((w) => !["corp", "inc", "ltd", "limited", "gold", "silver", "mining", "resources", "metals", "corporation"].includes(w));
  const navPages = Math.max(...cands.map((c) => c.pageCount), 1);
  const scored = cands.map((c) => {
    const hay = `${c.filename} ${c.alt} ${c.title}`.toLowerCase();
    const nameHit = cn.length && cn.some((w) => hay.includes(w));
    const isNav = c.pageCount >= Math.max(3, navPages);        // appears on (nearly) every page
    const hasLogoWord = /logo|wordmark|brandmark/.test(hay);
    // Figures, maps, screenshots and slides carry the company name too — they are not the logo.
    const isContent = /fig(?:ure)?[-_ ]?\d|_section|longsection|long section|screenshot|claims|locator|slide\d?|image\d|_map|photo|backpack|mountain|core|drill/i.test(hay) || words(c.alt).length > 5;
    let s = 0;
    if (hasLogoWord) s += 4;
    if (nameHit) s += 2;
    s += isNav ? 4 : Math.min(2, c.pageCount);
    if (/(png|svg)$/i.test(c.ext)) s += 1;
    if (PARTNER_LOGO.test(hay)) s -= 9;                          // broker / analyst / exchange mark
    if (/favicon|apple-touch|mstile/.test(hay)) s -= 10;
    // Accept only a real company mark: an explicit logo/wordmark, or a site-wide nav image —
    // never a piece of content imagery that merely mentions the company name.
    return { c, s, ok: !PARTNER_LOGO.test(hay) && !isContent && (hasLogoWord || isNav) };
  }).filter((x) => x.ok && x.s > 3).sort((a, b) => b.s - a.s);
  return scored[0] ? { ...scored[0].c, logoScore: scored[0].s } : null;
}

// ── OPTIONAL vision escalation (ambiguous, high-value, capped) ─────────────────
const VISION_CATS = ["logo", "landscape", "field", "drilling", "core", "infrastructure", "historic", "team", "jurisdiction_map", "project_map", "technical", "corporate_graphic", "unknown"];
async function visionClassify(url) {
  const tool = { name: "classify_image", description: "Classify a single mining-company website image.", parameters: { type: "object", properties: {
    category: { type: "string", enum: VISION_CATS }, confidence: { type: "number" }, caption: { type: "string" } }, required: ["category"] } };
  // callLLMTool sends a text user turn; for vision we pass the image URL in an OpenAI vision message.
  const r = await callLLMTool({ system: "You label a single image for a junior-mining investor profile. Pick the best category. Never guess a person's identity.", user: `Classify this image: ${url}`, tool, model: process.env.AI_MODEL || "gpt-4o-mini", maxTokens: 200, imageUrl: url });
  return r.input || {};
}

// ── ingest: run the whole thing ──────────────────────────────────────────────
export async function ingestImages(corpus, { companyName = "", projectNames = [], vision = false, visionCap = 4 } = {}) {
  const discovered = discoverImages(corpus);
  const { kept, rejected } = filterCandidates(discovered, companyName);
  const logo = pickLogo(kept, companyName);

  // classify + score everything except the chosen logo (logo is excluded from photo pools)
  let classified = kept.filter((c) => !logo || c.url !== logo.url).map((c) => {
    const cl = classifyOne(c); return { ...c, ...cl, score: 0 };
  });
  classified.forEach((c) => { c.score = scoreOne(c); });

  // optional vision on ambiguous high-value unknowns only
  let visionCalls = 0;
  if (vision) {
    const targets = classified.filter((c) => c.category === "unknown" && (c.sourceKinds[0] === "home" || /project|propert|rogue|valley/i.test(c.sourcePages.join(" "))))
      .sort((a, b) => b.score - a.score).slice(0, visionCap);
    for (const t of targets) {
      try { const v = await visionClassify(t.url); if (v.category) { t.category = v.category === "logo" ? "corporate_graphic" : v.category; t.confidence = Math.max(t.confidence, v.confidence || 0.6); t.why = `vision: ${v.caption || v.category}`; t.score = scoreOne(t); visionCalls++; } } catch (_) {}
    }
  }

  // dedupe by normalized filename — keep the highest score
  const bestByDup = new Map();
  for (const c of classified.sort((a, b) => b.score - a.score)) {
    const k = dupKey(c.filename) || c.url;
    if (!bestByDup.has(k)) bestByDup.set(k, c);
  }
  const deduped = [...bestByDup.values()];
  const dupsRemoved = classified.length - deduped.length;

  // group by category, ranked
  const byCat = {};
  for (const c of deduped) (byCat[c.category] = byCat[c.category] || []).push(c);
  Object.values(byCat).forEach((arr) => arr.sort((a, b) => b.score - a.score));

  const asAsset = (c) => c && { url: c.url, sourcePage: c.sourcePages[0] || "", category: c.category, confidence: Number((c.confidence || 0).toFixed(2)), alt: c.alt || "", why: c.why };
  const photoPool = ["landscape", "field", "infrastructure", "historic"].flatMap((k) => byCat[k] || []).sort((a, b) => b.score - a.score);

  const media = {
    logo: logo ? { url: logo.url, sourcePage: logo.sourcePages[0] || "", confidence: 0.7, why: `logo score ${logo.logoScore}` } : null,
    hero: asAsset(photoPool[0]) || null,
    photos: {
      overview: (photoPool.slice(1, 2)).map(asAsset),
      jurisdiction: (byCat.jurisdiction_map || byCat.landscape || []).slice(0, 1).map(asAsset),
      results: [...(byCat.drilling || []), ...(byCat.core || [])].slice(0, 2).map(asAsset),
      follow: (photoPool.slice(2, 3)).map(asAsset),
      project: photoPool.slice(0, 4).map(asAsset),
    },
    maps: [...(byCat.jurisdiction_map || []), ...(byCat.project_map || [])].map(asAsset),
    technical: (byCat.technical || []).map(asAsset),
    team: (byCat.team || []).map(asAsset),
    review: deduped.filter((c) => c.confidence < 0.4 && PHOTO_CATS.has(c.category)).map(asAsset),
    all: deduped.map(asAsset),
    stats: {
      discovered: discovered.length, rejected: rejected.length, kept: kept.length, deduped: deduped.length,
      dupsRemoved, visionCalls, byCategory: Object.fromEntries(Object.entries(byCat).map(([k, v]) => [k, v.length])),
    },
    rejected,
  };
  return media;
}

// ── route the ingested media into the profile the Conference pipeline reads ────
// Fill-only: never overwrites an operator-supplied image. Writes brand.logo/hero (→ pp.AVATAR/
// STATUS_IMG) and attaches ranked project photos to the flagship's gallery; stashes the full
// classified library + provenance under profile.media for review and later Company-Profile use.
export function applyMediaToProfile(profile, media, flagshipKey = "") {
  if (!profile || !media) return profile;
  profile.brand = profile.brand || {};
  if (media.logo && !profile.brand.logo) { profile.brand.logo = media.logo.url; if (!profile.brand.avatar) profile.brand.avatar = media.logo.url; }
  if (media.hero && !profile.brand.hero) profile.brand.hero = media.hero.url;
  // attach project photos to the flagship so pp/gallery + scenes pick them up
  const projects = Array.isArray(profile.projects) ? profile.projects : [];
  const flag = projects.find((p) => p && (p.id === flagshipKey || p.key === flagshipKey)) || projects[0];
  if (flag && (media.photos.project || []).length) {
    const existing = Array.isArray(flag.gallery) ? flag.gallery : [];
    if (!existing.length) flag.gallery = media.photos.project.map((a) => ({ src: a.url, sourcePage: a.sourcePage, category: a.category }));
  }
  profile.media = media; // full provenance library for operator review
  return profile;
}
