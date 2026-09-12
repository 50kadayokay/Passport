// _websiteCorpus.js — Phase 7 ingestion. Given a company website URL, build a bounded, clean-text
// corpus (homepage + a few key pages + linked PDFs) to feed the extraction. Uses the Jina Reader
// (r.jina.ai) so JS-rendered pages and PDFs come back as clean markdown. NOTHING here calls an LLM
// or writes to the DB — it only gathers public text. Provider-agnostic behind readOne(): swap Jina
// for Firecrawl later without touching callers.
//
// Bounding matters: a single-page site can return 600k+ chars (~150k tokens) which exceeds a
// 128k-context model. We cap total chars and page/PDF counts, and fetch pages CONCURRENTLY so total
// latency ~= one page, not N pages (keyless Jina is ~20s/page).

const JINA = "https://r.jina.ai/";

// Fetch one URL as clean markdown via Jina Reader. Returns "" on any failure (never throws).
async function readOne(url, { jinaKey, timeoutMs = 45000 } = {}) {
  const headers = { Accept: "text/plain", "X-Return-Format": "markdown" };
  if (jinaKey) headers.Authorization = `Bearer ${jinaKey}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(JINA + url, { headers, signal: ctrl.signal });
    if (!r.ok) return "";
    return await r.text();
  } catch { return ""; }
  finally { clearTimeout(t); }
}

const norm = (u) => { try { return new URL(u).href.replace(/#.*$/, "").replace(/\/$/, ""); } catch { return ""; } };
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

// Rank a discovered link by how likely it is to carry investor-relevant content.
const KEY_PATTERNS = [
  [/project|propert|asset|deposit|mine/i, 5],
  [/about|overview|company|corporate/i, 3],
  [/team|management|leadership|board|director/i, 3],
  [/news|press|release|announce|media/i, 2],
  [/investor|presentation|fact.?sheet|technical|resource|43-101|ni43/i, 4],
];
function scoreLink(url, text = "") {
  const s = (url + " " + text).toLowerCase();
  let score = 0;
  for (const [re, pts] of KEY_PATTERNS) if (re.test(s)) score += pts;
  return score;
}

// Extract [text](url) markdown links + bare .pdf urls from a page's markdown.
function extractLinks(md, rootHost) {
  const out = [];
  const mdLink = /\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g;
  let m;
  while ((m = mdLink.exec(md))) out.push({ text: m[1], url: m[2] });
  const pdfs = md.match(/https?:\/\/[^)\s"']+\.pdf/gi) || [];
  pdfs.forEach((u) => out.push({ text: "PDF", url: u }));
  // same-domain only, de-duped, normalized
  const seen = new Set();
  const links = [];
  for (const l of out) {
    const n = norm(l.url);
    if (!n || hostOf(n) !== rootHost || seen.has(n)) continue;
    seen.add(n);
    links.push({ ...l, url: n, isPdf: /\.pdf$/i.test(n) });
  }
  return links;
}

// Build the corpus. V2: returns per-source `sections` (with text) so extraction passes can be fed
// their relevant slice (e.g. the deep-technical pass gets PDFs), plus a concatenated `corpus`.
// Returns { corpus, sections:[{url,kind,text}], sources:[{url,chars,kind}], chars, truncated, pagesRead }.
// `perSourceMax` stops one giant single-page site from eating the whole budget and starving PDFs.
export async function buildCorpus(rootUrl, opts = {}) {
  const { maxChars = 500000, perSourceMax = 120000, maxPages = 6, maxPdfs = 5, jinaKey = process.env.JINA_API_KEY || "" } = opts;
  const empty = (error) => ({ corpus: "", sections: [], sources: [], chars: 0, truncated: false, pagesRead: 0, error });
  const root = norm(rootUrl);
  if (!root) return empty("bad_url");
  const rootHost = hostOf(root);

  const rootMd = await readOne(root, { jinaKey });
  if (!rootMd) return empty("root_unreadable");

  // Discover + rank internal links; take the top key pages and technical PDFs (excluding the root).
  const links = extractLinks(rootMd, rootHost).filter((l) => l.url !== root);
  const pages = links.filter((l) => !l.isPdf).map((l) => ({ ...l, score: scoreLink(l.url, l.text) }))
    .filter((l) => l.score > 0).sort((a, b) => b.score - a.score).slice(0, maxPages);
  const pdfs = links.filter((l) => l.isPdf).map((l) => ({ ...l, score: scoreLink(l.url, l.text) }))
    .sort((a, b) => b.score - a.score).slice(0, maxPdfs);

  // Fetch the extra pages + PDFs CONCURRENTLY (keeps total latency ~= one page even for many sources).
  const extra = [...pages, ...pdfs];
  const fetched = await Promise.all(extra.map((l) => readOne(l.url, { jinaKey }).then((md) => ({ url: l.url, md, kind: l.isPdf ? "pdf" : "page" }))));

  // Assemble: root first (most important), then pages, then PDFs. Each source capped at perSourceMax.
  const raw = [{ url: root, md: rootMd, kind: "home" }, ...fetched.filter((f) => f.md)];
  let corpus = "", used = 0, truncated = false;
  const sources = [], sections = [];
  for (const sec of raw) {
    if (used >= maxChars) { truncated = true; break; }
    const budget = Math.min(perSourceMax, maxChars - used);
    const body = sec.md.length > budget ? sec.md.slice(0, budget) : sec.md;
    if (sec.md.length > budget) truncated = true;
    corpus += `\n\n===== SOURCE: ${sec.url} (${sec.kind}) =====\n${body}`;
    used += body.length;
    sources.push({ url: sec.url, chars: body.length, kind: sec.kind });
    sections.push({ url: sec.url, kind: sec.kind, text: body });
  }
  return { corpus: corpus.trim(), sections, sources, chars: used, truncated, pagesRead: raw.length };
}
