// api/share-news.js — the public, shareable web version of a news item, reached at
// /n/<id> (rewritten in vercel.json). It serves BOTH:
//   • server-rendered OG / Twitter Card meta tags (crawlers don't run JS), and
//   • a readable article page that MIRRORS the in-app reader (SummaryContent / BriefV1):
//     What Happened · MineEx summary → What does this mean? → Context → cobalt Key Results
//     → disclaimer, with a dark "Read the original" action to the source.
// It shows only MineEx-generated summary content (never the source's article body), so it
// stays copyright-safe, and it credits + links the original publisher.
//
// The field→section mapping and key-number parsing below are a faithful, dependency-free
// copy of src/aiBrief/historicalBrief.js (historicalToV2), so this page reads the same as
// the app.
const APP_URL = process.env.PUBLIC_APP_URL || "https://mineex.ca";
const EM = "#2563eb", EM_TEXT = "#1d4ed8"; // app brand (cobalt)

const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmtDate = (s) => { try { const d = new Date(s); return isNaN(d) ? "" : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }); } catch (_) { return ""; } };

const CAT_COLOR = { "Drill Results": "#3b82f6", Financing: "#8b5cf6", "MRE/Resource": "#14b8a6", Management: "#6366f1", "Property Acquisition": "#c88a2e", "General News": "#64748b" };

// --- key-number parsing (verbatim from historicalBrief.js) ---
const VALUE_RE = /^([~<>≈]?\s*(?:C\$|US\$|A\$|CA\$|\$|€|£)?\s*\d[\d,]*(?:\.\d+)?(?:[MBK])?(?:\s*%|\s*\+)?)(?:\s+(million|billion|bn|thousand))?/i;
const UNIT_RE = /^(g\/t(?:\s+[A-Za-z][A-Za-z]*(?:Eq)?)?|oz\/t|oz|ppm|%|metres?|meters?|m|km|Mt|Moz|koz|kt|kg|tonnes?\s+per\s+day|tonnes?|tpd|grams?|t|ha|Mlbs?|lbs?)\b/;
const MEASURE = /^(g\/t|oz\/t|oz|ppm|%|metres?|meters?|m|km|Mt|Moz|koz|kt|kg|tonnes?|t|ha|Mlbs?|lbs?)/i;
function parseKeyNumber(s) {
  const str = String(s == null ? "" : s).trim(); if (!str) return null;
  const m = VALUE_RE.exec(str); if (!m) return null;
  let v = (m[1] + (m[2] ? " " + m[2] : "")).replace(/\s+/g, " ").trim();
  if (!/\d/.test(v)) return null;
  let rest = str.slice(m[0].length).trim(); let u = "";
  const um = UNIT_RE.exec(rest); if (um) { u = um[1].trim(); rest = rest.slice(um[0].length).trim(); }
  // Include a stray leading period so a trailing "." on the value doesn't survive as a lone "." desc.
  const desc = rest.replace(/^[.\-–—:·,\s]+/, "").trim();
  return { v, u, desc };
}
function splitKeyNumbers(keyNumbers) {
  const rows = [], highlights = [];
  for (const k of Array.isArray(keyNumbers) ? keyNumbers : []) {
    if (k && typeof k === "object") {
      const v = (k.v != null ? k.v : k.value);
      const label = String((k.desc != null ? k.desc : k.label) || "").trim();
      if (v != null && String(v).trim()) {
        const parsed = parseKeyNumber(String(v));
        if (parsed) rows.push({ v: parsed.v, u: parsed.u || String(k.u || "").trim(), desc: [parsed.desc, label].filter(Boolean).join(" · ") });
        else rows.push({ v: String(v), u: k.u || "", desc: label });
      } else if (label) highlights.push(label);
    } else if (k != null && String(k).trim()) {
      const row = parseKeyNumber(k); if (row) rows.push(row); else highlights.push(String(k).trim());
    }
  }
  return { rows, highlights };
}

export default async function handler(req, res) {
  const id = String((req.query && req.query.id) || "").replace(/^news-/, "").trim();
  const SB = process.env.VITE_SUPABASE_URL, ANON = process.env.VITE_SUPABASE_ANON_KEY;

  let row = null;
  if (id && SB && ANON) {
    try {
      const r = await fetch(`${SB}/rest/v1/news_public?id=eq.${encodeURIComponent(id)}&select=title,source_name,published_at,category,commodity,canonical_url,mineex_summary,plain_english_explanation,context,key_numbers,is_press_release&limit=1`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
      const rows = await r.json();
      if (rows && rows[0]) row = rows[0];
    } catch (_) { /* generic */ }
  }

  const title = (row && row.title) || "MineEx — Junior Mining News";
  const desc = ((row && row.mineex_summary) || "Junior-mining news and press releases, summarized in plain English.").slice(0, 180);
  const img = `${APP_URL}/api/og-news?id=${encodeURIComponent(id)}`;
  const accent = (row && CAT_COLOR[row.category]) || EM;
  const canonical = `${APP_URL}/n/${encodeURIComponent(id)}`;

  let body;
  if (!row) {
    body = `<main class="wrap"><p class="body">We couldn't find that story. It may have moved.</p><a class="cta" href="${APP_URL}">Go to MineEx</a></main>`;
  } else {
    const dateStr = fmtDate(row.published_at);
    const isRelease = !!row.is_press_release;
    const origLabel = isRelease ? "Read the full release" : "Read the original article";
    const { rows: kr, highlights } = splitKeyNumbers(row.key_numbers);
    const S = [];
    if (row.mineex_summary) S.push(`<section><p class="lbl"><b style="color:#0f172a">What Happened</b> <span class="sub">· MineEx summary</span></p><p class="body">${esc(row.mineex_summary)}</p></section>`);
    if (row.plain_english_explanation) {
      const defs = String(row.plain_english_explanation).split("\n").map((l) => l.trim().replace(/^[•\-]\s*/, "")).filter(Boolean);
      S.push(`<section><p class="lbl" style="color:#64748b">What does this mean?</p>${defs.length > 1 ? `<ul class="defs">${defs.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>` : `<p class="body">${esc(defs[0] || row.plain_english_explanation)}</p>`}</section>`);
    }
    if (row.context) S.push(`<section><p class="lbl" style="color:${EM_TEXT}">Context</p><p class="body">${esc(row.context)}</p></section>`);
    if (kr.length) {
      const maxLen = kr.reduce((m, r) => Math.max(m, String(r.v || "").length), 0);
      const vSize = maxLen <= 9 ? 22 : maxLen <= 12 ? 18 : 15;
      const rowsHtml = kr.map((r) => {
        const measure = r.u && MEASURE.test(r.u);
        const val = `<span class="kv" style="font-size:${vSize}px">${esc(r.v)}</span>${r.u ? (measure ? `<span class="ku">${esc(r.u)}</span>` : `<div class="ku2">${esc(r.u)}</div>`) : ""}`;
        return `<div class="krrow"><div class="kcell">${val}</div><div class="kdesc">${esc(r.desc)}</div></div>`;
      }).join("");
      S.push(`<section><p class="kr-lbl">Key Results</p><div class="krgrid">${rowsHtml}</div></section>`);
    } else if (highlights.length) {
      S.push(`<section><p class="kr-lbl">Highlights</p><ul class="hl">${highlights.map((h) => `<li>${esc(h)}</li>`).join("")}</ul></section>`);
    }
    const chips = [
      row.category ? `<span class="chip" style="background:${accent}">${esc(String(row.category).toUpperCase())}</span>` : "",
      row.commodity ? `<span class="chip ghost">${esc(String(row.commodity).toUpperCase())}</span>` : "",
    ].join("");
    const srcNote = !isRelease ? `Source: ${esc(row.source_name || "Industry")}${dateStr ? ` · ${dateStr}` : ""}` : (row.source_name ? `${esc(row.source_name)}${dateStr ? ` · ${dateStr}` : ""}` : dateStr);

    body = `<main class="wrap">
      <div class="chips">${chips}</div>
      <h1>${esc(title)}</h1>
      ${srcNote ? `<p class="src">${srcNote}</p>` : ""}
      <div class="rule" style="background:${accent}"></div>
      ${S.join("")}
      <p class="disc">MineEx provides factual summaries and educational context, not investment advice. Refer to the original disclosure for complete information.</p>
      ${row.canonical_url ? `<a class="cta" href="${esc(row.canonical_url)}" target="_blank" rel="noopener nofollow">${origLabel} <span aria-hidden="true">&#8599;</span></a>
      <p class="attr">Summary and context by MineEx${row.source_name ? ` · Original reporting via <a href="${esc(row.canonical_url)}" target="_blank" rel="noopener nofollow">${esc(row.source_name)}</a>` : ""}.</p>` : ""}
    </main>`;
  }

  const html = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="article"><meta property="og:site_name" content="MineEx">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${img}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${img}">
<link rel="canonical" href="${canonical}">
<style>
  *{box-sizing:border-box}
  html,body{margin:0;background:#fff}
  body{color:#0f172a;font:16px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
  a{color:inherit}
  header.top{border-bottom:1px solid #eef1f5}
  header.top .in{max-width:640px;margin:0 auto;padding:15px 22px}
  .brand{color:${EM};font-weight:800;letter-spacing:.26em;font-size:15px;text-decoration:none}
  .brand .by{color:#94a3b8;font-weight:600;letter-spacing:.12em;font-size:11px;margin-left:10px}
  .wrap{max-width:640px;margin:0 auto;padding:26px 22px 60px}
  .chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}
  .chip{display:inline-block;color:#fff;font-size:11px;font-weight:800;letter-spacing:.05em;padding:5px 12px;border-radius:999px}
  .chip.ghost{background:#f1f5f9;color:#475569}
  h1{font-size:clamp(22px,4.6vw,30px);line-height:1.18;letter-spacing:-.02em;font-weight:800;margin:0;color:#0f172a}
  .src{color:#94a3b8;font-size:12.5px;font-weight:600;margin:10px 0 0}
  .rule{height:4px;width:64px;border-radius:2px;margin:20px 0 2px}
  section{margin-top:22px}
  .lbl{font-size:10px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;margin:0 0 7px}
  .lbl .sub{font-size:10px;font-weight:700;letter-spacing:.12em;color:#94a3b8}
  .body{margin:0;color:#475569;font-size:14.5px;line-height:1.65;font-weight:450}
  .defs{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:9px}
  .defs li{position:relative;padding-left:17px;color:#475569;font-size:14px;line-height:1.5}
  .defs li::before{content:"";position:absolute;left:1px;top:8px;width:6px;height:6px;border-radius:50%;background:${EM}}
  .kr-lbl{font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#0f172a;margin:0 0 6px}
  .krgrid{display:grid;grid-template-columns:max-content minmax(0,1fr);column-gap:20px}
  .krrow{display:contents}
  .kcell,.kdesc{padding:13px 0;border-top:1px solid #f1f5f9}
  .krgrid > .krrow:first-child .kcell,.krgrid > .krrow:first-child .kdesc{border-top:0}
  .kcell{white-space:nowrap}
  .kv{font-weight:800;letter-spacing:-.01em;color:${EM_TEXT};font-variant-numeric:tabular-nums}
  .ku{font-weight:600;color:#94a3b8;margin-left:4px;font-size:.62em}
  .ku2{margin-top:3px;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8}
  .kdesc{font-size:13.5px;font-weight:600;line-height:1.4;color:#1e293b;min-width:0}
  .hl{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:10px}
  .hl li{position:relative;padding-left:17px;color:#334155;font-size:14px;line-height:1.45}
  .hl li::before{content:"";position:absolute;left:1px;top:8px;width:6px;height:6px;border-radius:50%;background:${EM}}
  .disc{margin-top:24px;background:#f8fafc;border-radius:12px;padding:12px 14px;color:#94a3b8;font-size:11.5px;line-height:1.5}
  .cta{display:inline-flex;align-items:center;gap:8px;margin-top:20px;background:#0f172a;color:#fff;text-decoration:none;font-weight:700;font-size:14.5px;padding:14px 22px;border-radius:16px}
  .attr{margin-top:13px;color:#94a3b8;font-size:12px}
  .attr a{color:#64748b}
  footer{border-top:1px solid #eef1f5}
  footer .in{max-width:640px;margin:0 auto;padding:20px 22px;display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;justify-content:space-between;color:#94a3b8;font-size:13px}
  footer a{color:${EM};font-weight:700;text-decoration:none}
</style>
</head><body>
<header class="top"><div class="in"><a class="brand" href="${APP_URL}">MINEEX<span class="by">Junior Mining News</span></a></div></header>
${body}
<footer><div class="in"><span>Junior mining news, summarized in plain English.</span><a href="${APP_URL}">Get the MineEx app &#8594;</a></div></footer>
</body></html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600");
  res.status(200).send(html);
}
