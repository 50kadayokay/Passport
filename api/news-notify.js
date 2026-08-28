// api/news-notify.js — fan-out stage: turn newly-live company news into queued
// pushes, one per follower's device. It ENQUEUES into notification_outbox only;
// the APNs send drains that queue separately (needs the APNs key — next step).
//
// Gating, all enforced here:
//   • item must be live + approved + canonical + linked to a company + not yet fanned out
//   • the linked company's tier must be a PAID tier (basic/pro) — the monetization lever
//   • the user must follow that company (is_following) with notifications_enabled
//   • the user's notification_preferences must allow this category (push_enabled + the
//     category-specific flag)
//   • the user must have at least one registered push token
// Idempotent: outbox has a unique (news_item_id,user_id,token); items are stamped
// push_notified_at so a re-run never re-enqueues. No cron here yet — call manually,
// or chain it after news-process, once the client registers tokens.
import { serviceConfigured, serviceRest } from "./_service.js";
import { checkNewsAuth } from "./_news.js";

export const config = { maxDuration: 120 };

const BATCH = 25;                                  // items fanned out per call
const PAID_TIERS = new Set(["basic", "pro"]);      // only paid companies push (the lever)

// news category → the notification_preferences flag that gates it.
function prefKeyForCategory(cat) {
  if (cat === "Drill Results" || cat === "MRE/Resource") return "followed_company_results";
  if (cat === "Financing") return "followed_company_financings";
  return "followed_company_news";
}
const clip = (s, n) => { s = String(s || "").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const uniq = (a) => [...new Set(a)];

async function rows(path) { const r = await serviceRest(path); return r.ok ? (await r.json().catch(() => [])) : []; }

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!checkNewsAuth(req)) return res.status(401).json({ error: "unauthorized" });
  if (!serviceConfigured()) return res.status(500).json({ error: "Supabase service env missing" });

  // 1) Newly-live, canonical, linked items that haven't been fanned out yet. Pull the
  //    linked company + its tier inline (embedded resources).
  const sel = "id,title,category,mineex_summary,news_item_companies(company_slug,companies(name,slug,tier))";
  const filter = `status=eq.live&review_state=eq.approved&is_canonical=eq.true&push_notified_at=is.null&order=published_at.desc&limit=${BATCH}`;
  const items = await rows(`news_items?${filter}&select=${sel}`);
  if (!items.length) return res.status(200).json({ ok: true, items: 0, queued: 0, message: "nothing new to fan out" });

  let queued = 0, skippedFree = 0;
  const report = [];

  for (const it of items) {
    const links = Array.isArray(it.news_item_companies) ? it.news_item_companies : [];
    // Keep only links to a PAID company (basic/pro). Free/listing companies never push.
    const paid = links.filter((l) => l.companies && PAID_TIERS.has(String(l.companies.tier || "")));
    let itemQueued = 0;

    for (const l of paid) {
      const slug = l.company_slug || (l.companies && l.companies.slug);
      const coName = (l.companies && l.companies.name) || "A company you follow";
      if (!slug) continue;

      // followers of this company who want notifications
      const followers = await rows(`user_company_relationships?company_slug=eq.${encodeURIComponent(slug)}&is_following=eq.true&notifications_enabled=eq.true&select=user_id`);
      const userIds = uniq(followers.map((f) => f.user_id).filter(Boolean));
      if (!userIds.length) continue;
      const inList = `(${userIds.join(",")})`;

      // their prefs + tokens
      const prefs = await rows(`notification_preferences?user_id=in.${inList}&select=user_id,push_enabled,followed_company_news,followed_company_results,followed_company_financings`);
      const prefBy = new Map(prefs.map((p) => [p.user_id, p]));
      const tokens = await rows(`push_tokens?user_id=in.${inList}&select=user_id,token,platform`);

      const pk = prefKeyForCategory(it.category);
      const outbox = [];
      for (const t of tokens) {
        const p = prefBy.get(t.user_id);
        // default-allow when a user has no prefs row yet (schema defaults are all true)
        const allowed = !p || (p.push_enabled && p[pk] !== false);
        if (!allowed) continue;
        outbox.push({
          news_item_id: it.id,
          user_id: t.user_id,
          token: t.token,
          platform: t.platform || "ios",
          title: coName,
          body: clip(it.mineex_summary || it.title, 178),
          data: { news_item_id: it.id, company_slug: slug, category: it.category || null },
        });
      }
      if (outbox.length) {
        // idempotent insert (unique news_item_id,user_id,token)
        await serviceRest("notification_outbox?on_conflict=news_item_id,user_id,token", {
          method: "POST", body: outbox, prefer: "resolution=ignore-duplicates,return=minimal",
        });
        itemQueued += outbox.length;
      }
    }

    if (!paid.length) skippedFree++;
    // Stamp fanned-out regardless (0 tokens today = nothing to send; we never
    // retro-push old news once the client ships and tokens exist).
    await serviceRest(`news_items?id=eq.${it.id}`, { method: "PATCH", body: { push_notified_at: new Date().toISOString() }, prefer: "return=minimal" });
    queued += itemQueued;
    report.push({ id: it.id, title: clip(it.title, 60), paid_companies: paid.length, queued: itemQueued });
  }

  return res.status(200).json({ ok: true, items: items.length, queued, skipped_free_only: skippedFree, report });
}
