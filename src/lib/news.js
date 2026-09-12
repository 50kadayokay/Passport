// src/lib/news.js — investor-app read access to APPROVED news.
//
// Reads only the safe public view (news_public): headline, MineEx summary, source
// attribution, outbound link, commodity/jurisdiction, optional image — for items
// an admin has approved. No publisher text, no internal fields ever reach the client.
import { SUPABASE_URL, SUPABASE_ANON } from "./supabase.js";
import newsFixtures from "../aiBrief/newsFixtures.json";

const anon = { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` };

// Dev fixtures: with VITE_NEWS_FIXTURES=1 the app reads the 4 snapshotted processed
// stories from disk — zero network, zero paid AI — so the reader/feed/admin UI and
// App Store packaging can be developed without ever hitting Anthropic or Supabase.
export const NEWS_FIXTURES = newsFixtures;
const USE_FIXTURES = (import.meta && import.meta.env && import.meta.env.VITE_NEWS_FIXTURES) === "1";

export async function fetchLiveNews(limit = 60) {
  if (USE_FIXTURES) return newsFixtures.slice(0, limit);
  try {
    // Recency safeguard: only surface news from the last 30 days so stale items can
    // never fill the feed (matches the company-release cutoff in main.jsx).
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
    // cache:"no-store" forces a fresh network hit so pull-to-refresh surfaces newly
    // published stories (a URL cache-buster param is rejected by PostgREST → don't add one).
    const res = await fetch(`${SUPABASE_URL}/rest/v1/news_public?select=*&published_at=gte.${encodeURIComponent(cutoff)}&order=published_at.desc&limit=${limit}`, { headers: anon, cache: "no-store" });
    if (!res.ok) return [];
    const rows = await res.json().catch(() => []);
    return Array.isArray(rows) ? rows : [];
  } catch { return []; }
}
