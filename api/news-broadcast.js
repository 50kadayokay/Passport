// api/news-broadcast.js — PAID "greater reach": push one news story to ALL registered
// devices, not just followers. This is the premium lever (a company pays to broadcast).
//
// Secret-gated (admin-triggered). Enqueues one notification_outbox row per device —
// idempotent via the (news_item_id,user_id,token) unique key, so any follower already
// queued for this story by news-notify is NOT double-pushed — then drains to APNs now.
//
// POST { news_item_id, title?, body? }  (title/body override the auto text)
import { serviceConfigured, serviceRest } from "./_service.js";
import { checkNewsAuth } from "./_news.js";
import { requireAdmin } from "./_entitlement.js";

export const config = { maxDuration: 120 };
const clip = (s, n) => { s = String(s || "").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

async function rows(path) { const r = await serviceRest(path); return r.ok ? (await r.json().catch(() => [])) : []; }

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  // Authorized either by the shared news secret/cron OR by a signed-in platform admin
  // (so the Mission Control button can trigger it with the admin's session).
  if (!checkNewsAuth(req)) {
    const admin = await requireAdmin(req, res); // sends 401/403 on failure
    if (!admin) return;
  }
  if (!serviceConfigured()) return res.status(500).json({ error: "Supabase service env missing" });

  const q = { ...(req.query || {}), ...(req.body || {}) };
  const newsItemId = q.news_item_id;
  if (!newsItemId) return res.status(400).json({ error: "news_item_id required" });

  const item = (await rows(`news_items?id=eq.${encodeURIComponent(newsItemId)}&limit=1&select=id,title,mineex_summary,category,news_item_companies(company_slug,companies(name,tier))`))[0];
  if (!item) return res.status(404).json({ error: "news_item not found" });
  const link = (item.news_item_companies || [])[0] || {};
  const co = link.companies || {};
  const slug = link.company_slug || null;
  const title = q.title || co.name || "MineEx";
  // Paid broadcast → carry a clear "Sponsored" disclosure in the banner text (§17(b)
  // paid-promotion labeling for a security's PR).
  const body = "Sponsored · " + (q.body || clip(item.mineex_summary || item.title, 160));

  // ALL registered devices (paginated).
  let tokens = [], off = 0;
  while (true) {
    const batch = await rows(`push_tokens?select=user_id,token,platform&limit=1000&offset=${off}`);
    tokens = tokens.concat(batch);
    if (batch.length < 1000) break;
    off += 1000;
  }
  if (!tokens.length) return res.status(200).json({ ok: true, devices: 0, queued: 0, message: "no devices registered" });

  let queued = 0;
  for (let i = 0; i < tokens.length; i += 500) {
    const chunk = tokens.slice(i, i + 500).map((t) => ({
      news_item_id: item.id, user_id: t.user_id, token: t.token, platform: t.platform || "ios",
      title, body, data: { news_item_id: item.id, company_slug: slug, category: item.category || null, broadcast: true, sponsored: true },
    }));
    await serviceRest("notification_outbox?on_conflict=news_item_id,user_id,token", { method: "POST", body: chunk, prefer: "resolution=ignore-duplicates,return=minimal" });
    queued += chunk.length;
  }

  // Drain to APNs immediately so a paid broadcast is near-instant.
  let sent = null;
  try {
    const proto = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const base = process.env.PUBLIC_BASE_URL || `${proto}://${host}`;
    sent = await fetch(`${base}/api/news-push-send`, { method: "POST", headers: { "x-news-secret": process.env.NEWS_PULL_SECRET || "", "content-type": "application/json" } }).then((r) => r.json()).catch(() => null);
  } catch (e) { sent = { error: String((e && e.message) || e).slice(0, 150) }; }

  return res.status(200).json({ ok: true, news_item_id: item.id, company: co.name || null, devices: tokens.length, queued, sent });
}
