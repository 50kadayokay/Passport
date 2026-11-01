// GET /api/conference-config?c=<slug> — the booth's published look (a17).
//
//   200 { slug, studio: { template?, theme?, accent? }, version, publishedAt }
//   204 no published look for that slug (the booth keeps its compiled module)
//   503 not provisioned / backend unreachable (same: the booth keeps what it has)
//
// PUBLIC, BY DESIGN. A booth is an unattended iPad with no account. What comes
// back is three style keys and a version number, read through the anon-callable
// conference_booth_config(slug) from migration 0085, with the anon key: this
// route holds no privilege the booth does not already have.
//
// THE BOOTH NEVER DEPENDS ON THIS. src/conference/liveConfig.js renders from
// its cache or the compiled package first and only applies an answer from here
// when it arrives. Every failure here is a non-event at a trade show.

import { SB_URL, ANON_KEY } from "./_supabase.js";
import { normaliseStudio } from "../src/conference/liveConfig.js";

const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;

function param(req, name) {
  const v = req?.query?.[name];
  if (v !== undefined) return Array.isArray(v) ? v[0] : String(v);
  try { return new URL(req?.url || "", "http://local").searchParams.get(name) || ""; } catch { return ""; }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method-not-allowed" });
  }
  const slug = String(param(req, "c") || "").trim().toLowerCase();
  if (!SLUG.test(slug)) return res.status(400).json({ error: "A company slug is required." });

  let r;
  try {
    r = await fetch(`${SB_URL}/rest/v1/rpc/conference_booth_config`, {
      method: "POST",
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ p_slug: slug }),
    });
  } catch {
    return res.status(503).json({ error: "Booth configuration is unavailable." });
  }
  // 404 from PostgREST = the function does not exist yet (0085 unapplied).
  if (!r.ok) return res.status(503).json({ error: "Booth configuration is unavailable." });

  const row = (await r.json().catch(() => []))[0];
  res.setHeader("Cache-Control", "public, max-age=30, s-maxage=30");
  if (!row) return res.status(204).end();
  return res.status(200).json({
    slug: row.slug,
    studio: normaliseStudio(row.studio),
    version: Number(row.version) || 1,
    publishedAt: row.published_at || null,
  });
}
