// api/og-news.js — dynamic social share image for a news item.
// GET /api/og-news?id=<newsId> → a 1200×630 branded PNG with the headline, used as
// the og:image / twitter:image on the /n/<id> share page. Rendered with @vercel/og
// (satori) on the Edge runtime. Falls back to a generic MineEx card if the item
// isn't found.
import { ImageResponse } from "@vercel/og";
import { createElement as h } from "react";
// Config from the shared resolver — see api/_supabase.js. Reading process.env
// here is what let the server target a different (or unusable) project than the
// browser, surfacing as an auth error rather than a configuration one.
import { SB_URL as SB, ANON_KEY as ANON } from "./_supabase.js";

export const config = { runtime: "edge" };


const CAT_COLOR = {
  "Drill Results": "#3b82f6",
  Financing: "#8b5cf6",
  "MRE/Resource": "#14b8a6",
  Management: "#6366f1",
  "Property Acquisition": "#c88a2e",
  "General News": "#94a3b8",
};

let FONT_REG, FONT_BOLD;
async function fonts() {
  if (!FONT_REG) FONT_REG = fetch("https://cdn.jsdelivr.net/npm/@fontsource/inter/files/inter-latin-500-normal.woff").then((r) => r.arrayBuffer());
  if (!FONT_BOLD) FONT_BOLD = fetch("https://cdn.jsdelivr.net/npm/@fontsource/inter/files/inter-latin-800-normal.woff").then((r) => r.arrayBuffer());
  return Promise.all([FONT_REG, FONT_BOLD]);
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const id = (searchParams.get("id") || "").replace(/^news-/, "").trim();

  let title = "Junior mining news, decoded.";
  let category = "General News", commodity = "", source = "";
  if (id && SB && ANON) {
    try {
      const r = await fetch(`${SB}/rest/v1/news_public?id=eq.${encodeURIComponent(id)}&select=title,category,commodity,source_name&limit=1`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
      const rows = await r.json();
      if (rows && rows[0]) { title = rows[0].title || title; category = rows[0].category || category; commodity = rows[0].commodity || ""; source = rows[0].source_name || ""; }
    } catch (_) { /* generic card */ }
  }
  const accent = CAT_COLOR[category] || "#94a3b8";
  const headline = title.length > 150 ? title.slice(0, 147) + "…" : title;
  const [reg, bold] = await fonts();

  const chip = (bg, color, text) => h("div", { style: { display: "flex", background: bg, color, fontSize: 26, fontWeight: 800, padding: "10px 22px", borderRadius: 999, letterSpacing: "0.04em" } }, text);

  const el = h("div", {
    style: {
      width: "1200px", height: "630px", display: "flex", flexDirection: "column", justifyContent: "space-between",
      padding: "72px", background: "linear-gradient(140deg,#0b0f17 0%,#0c1c15 100%)", fontFamily: "Inter",
    },
  },
    // TOP — brand + category/commodity chips
    h("div", { style: { display: "flex", flexDirection: "column" } },
      h("div", { style: { display: "flex", alignItems: "center", color: "#10b981", fontSize: 30, fontWeight: 800, letterSpacing: "0.34em" } }, "MINEEX"),
      h("div", { style: { display: "flex", marginTop: 34, gap: 14 } },
        chip(accent, "#ffffff", (category || "News").toUpperCase()),
        commodity ? chip("rgba(255,255,255,0.08)", "#cbd5e1", commodity.toUpperCase()) : null,
      ),
    ),
    // HEADLINE
    h("div", { style: { display: "flex", color: "#ffffff", fontSize: 66, fontWeight: 800, lineHeight: 1.08, letterSpacing: "-0.02em", maxWidth: "1056px" } }, headline),
    // FOOTER — attribution + domain, with an accent rule
    h("div", { style: { display: "flex", flexDirection: "column" } },
      h("div", { style: { display: "flex", height: 4, width: 96, background: accent, borderRadius: 2, marginBottom: 26 } }, ""),
      h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", color: "#8ea0b5", fontSize: 26, fontWeight: 500 } },
        h("div", { style: { display: "flex" } }, source ? `via ${source}` : "Junior mining, in one feed"),
        h("div", { style: { display: "flex", color: "#94a3b8", fontWeight: 800 } }, "mineex.ca"),
      ),
    ),
  );

  return new ImageResponse(el, {
    width: 1200, height: 630,
    fonts: [
      { name: "Inter", data: reg, weight: 500, style: "normal" },
      { name: "Inter", data: bold, weight: 800, style: "normal" },
    ],
    headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" },
  });
}
