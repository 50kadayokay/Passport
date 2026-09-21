// api/share-news.js — the shareable page for a news item, reached at /n/<id>
// (rewritten in vercel.json). Serves server-rendered OG / Twitter Card meta tags
// (crawlers don't run JS, so the tags must be in the HTML) pointing at the dynamic
// og-news image, and bounces real humans into the app.
// Config from the shared resolver — see api/_supabase.js. Reading process.env
// here is what let the server target a different (or unusable) project than the
// browser, surfacing as an auth error rather than a configuration one.
import { SB_URL as SB, ANON_KEY as ANON } from "./_supabase.js";

const APP_URL = process.env.PUBLIC_APP_URL || "https://passport-xi-five.vercel.app";
const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export default async function handler(req, res) {
  const id = String((req.query && req.query.id) || "").replace(/^news-/, "").trim();

  let title = "MineEx — Junior Mining News";
  let desc = "Junior-mining news and press releases, summarized in plain English.";
  if (id && SB && ANON) {
    try {
      const r = await fetch(`${SB}/rest/v1/news_public?id=eq.${encodeURIComponent(id)}&select=title,mineex_summary&limit=1`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
      const rows = await r.json();
      if (rows && rows[0]) { title = rows[0].title || title; desc = (rows[0].mineex_summary || desc).slice(0, 180); }
    } catch (_) { /* generic */ }
  }

  const img = `https://mineex.ca/api/og-news?id=${encodeURIComponent(id)}`;
  const html = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="MineEx">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${img}">
<meta http-equiv="refresh" content="0; url=${APP_URL}">
<link rel="canonical" href="${APP_URL}">
</head><body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0b0f17;color:#e2e8f0;display:flex;min-height:100vh;align-items:center;justify-content:center">
<a href="${APP_URL}" style="color:#10b981;font-weight:700;text-decoration:none;font-size:18px">Open in MineEx →</a>
</body></html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
  res.status(200).send(html);
}
