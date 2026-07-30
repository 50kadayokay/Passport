// Company Health Score — Passport's signature "what should I do today?" signal.
//
// A score out of 100 from signals we can actually measure from the profile + a few
// counts. Deliberately MOTIVATING, not punitive: every missing point comes with a
// concrete, one-click-ish recommendation. Pure function — no I/O — so it's easy to
// reason about and adjust the weights.
//
// `stats` is the { documents, updates, publications, published } from companyStats.
// `now` is injected (defaults to current time) so the freshness math is testable.

const DAY = 86400000;

function latestTimelineDate(profile) {
  const t = Array.isArray(profile?.timeline) ? profile.timeline : [];
  let best = 0;
  for (const e of t) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(e?.date || ""));
    if (m) { const d = Date.parse(m[0]); if (!Number.isNaN(d) && d > best) best = d; }
  }
  return best || null;
}

export function computeHealth(profile = {}, stats = {}, now = Date.now()) {
  const p = profile || {};
  const has = (v) => (Array.isArray(v) ? v.length > 0 : !!v && (typeof v !== "object" || Object.keys(v).length > 0));

  const lastTl = latestTimelineDate(p);
  const daysSincePublish = lastTl ? Math.floor((now - lastTl) / DAY) : null;
  const mediaCount = stats.documents || 0;

  // Each item: points available + whether earned + the recommendation when not.
  const items = [
    { key: "identity",  pts: 10, ok: has(p.company?.name) && has(p.company?.commodity), rec: "Complete your company identity (name, commodity, jurisdiction)." },
    { key: "brief",     pts: 10, ok: has(p.companyBrief?.paragraphs) || has(p.companyBrief?.summary), rec: "Write a company brief so investors get the story in seconds." },
    { key: "projects",  pts: 12, ok: has(p.projects), rec: "Add at least one project with its stage and highlights." },
    { key: "capital",   pts: 12, ok: has(p.capital), rec: "Fill in your capital structure (shares, cash, market cap)." },
    { key: "team",      pts: 8,  ok: has(p.team), rec: "Add your management team and board." },
    { key: "status",    pts: 8,  ok: has(p.companyStatus?.statusHeadline), rec: "Set a current status headline so investors know where you are." },
    { key: "hero",      pts: 6,  ok: has(p.hero?.image) || has(p.heroImage), rec: "Upload a hero image — a strong project photo lifts the whole profile." },
    { key: "logo",      pts: 4,  ok: has(p.company?.logo) || has(p.logo), rec: "Add your company logo." },
    { key: "media",     pts: 10, ok: mediaCount > 0, rec: "Upload media and documents — drill photos, decks, technical reports." },
    { key: "timeline",  pts: 10, ok: has(p.timeline), rec: "Add your news timeline so the track record is visible." },
    // Freshness: full points if published within 30 days, decaying to 0 by 120 days.
    { key: "freshness", pts: 10,
      ok: daysSincePublish != null && daysSincePublish <= 30,
      partial: daysSincePublish == null ? 0 : Math.max(0, Math.min(1, (120 - daysSincePublish) / 90)),
      rec: daysSincePublish == null
        ? "Publish your first update to start building momentum."
        : `It's been ${daysSincePublish} days since your last update — investors reward regular news.` },
  ];

  let score = 0, max = 0;
  const recommendations = [];
  for (const it of items) {
    max += it.pts;
    if (it.ok) { score += it.pts; continue; }
    const earned = it.partial != null ? Math.round(it.pts * it.partial) : 0;
    score += earned;
    recommendations.push({ key: it.key, text: it.rec, gain: it.pts - earned });
  }

  const pct = Math.round((score / max) * 100);
  const band =
    pct >= 90 ? "Excellent" :
    pct >= 75 ? "Strong" :
    pct >= 55 ? "Getting there" :
    pct >= 30 ? "Needs work" : "Just started";

  // Surface the highest-impact gaps first.
  recommendations.sort((a, b) => b.gain - a.gain);

  return { score: pct, band, daysSincePublish, recommendations };
}
