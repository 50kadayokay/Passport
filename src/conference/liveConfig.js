// The booth's published look, offline-first (a17).
//
// ORDER OF AUTHORITY (highest first)
//   1. URL params (&t= &theme= &accent=) -- A/B on a device, unchanged
//   2. the published record (migration 0085), from the network or this
//      device's cache of the last one it saw
//   3. the compiled package's conference.studio (src/conference/registry.js)
//   4. the booth's own defaults
//
// OFFLINE-FIRST. The booth renders immediately from 2-from-cache or 3. The
// network read happens afterwards, with a timeout, and is applied only if it
// brings a newer version. A booth with no network, an unapplied migration or a
// failing API renders exactly what it rendered before this file existed.
//
// No investor-app imports: Conference Mode stays its own product.

export const STUDIO_KEYS = ["template", "theme", "accent"];
export const FETCH_TIMEOUT_MS = 4000;
const cacheKey = (slug) => `mineex.booth.studio.${slug}`;

/** Keep only the three keys the booth understands, each a short string. */
export function normaliseStudio(s) {
  const out = {};
  if (!s || typeof s !== "object") return out;
  for (const k of STUDIO_KEYS) {
    const v = s[k];
    if (typeof v === "string" && v.length <= 40 && (k !== "accent" || v === "" || /^#[0-9a-fA-F]{3,8}$/.test(v))) out[k] = v;
  }
  return out;
}

/** a15: the latest releases delivered to Conference Mode (0088), kept with the
    look so a booth that goes offline still has them. null = not provided. */
export function normaliseReleases(list) {
  if (!Array.isArray(list)) return null;
  return list.slice(0, 20).filter((d) => d && typeof d === "object" && typeof d.title === "string").map((d) => ({
    id: String(d.id || ""), kind: d.kind === "media" ? "media" : "press_release",
    title: d.title.slice(0, 300), summary: typeof d.summary === "string" ? d.summary.slice(0, 600) : "",
    category: typeof d.category === "string" ? d.category : null, image: typeof d.image === "string" ? d.image : null,
    publishedAt: typeof d.publishedAt === "string" ? d.publishedAt : null, version: Number(d.version) || 0,
  }));
}

/** The last published record this device saw for a slug, or null. */
export function readCached(slug, storage = globalThis.localStorage) {
  try {
    const rec = JSON.parse(storage.getItem(cacheKey(slug)) || "null");
    if (!rec || rec.slug !== slug || !Number.isFinite(rec.version)) return null;
    return { slug, studio: normaliseStudio(rec.studio), version: rec.version, publishedAt: rec.publishedAt || null, releases: normaliseReleases(rec.releases) };
  } catch { return null; }
}

export function writeCached(rec, storage = globalThis.localStorage) {
  try { storage.setItem(cacheKey(rec.slug), JSON.stringify(rec)); } catch { /* storage full or blocked */ }
}

/** Forget a slug's record (the server said there is none any more). */
export function clearCached(slug, storage = globalThis.localStorage) {
  try { storage.removeItem(cacheKey(slug)); } catch { /* ignore */ }
}

/**
 * Ask the API for the published record. Resolves to:
 *   { status: "found", record }   a published look
 *   { status: "none" }            the server says there is no published look
 *   { status: "unavailable" }     offline, timed out, not provisioned -- keep what you have
 * Never throws.
 */
export async function fetchPublished(slug, { fetchImpl = globalThis.fetch, timeoutMs = FETCH_TIMEOUT_MS, base = "" } = {}) {
  if (!slug || typeof fetchImpl !== "function") return { status: "unavailable" };
  const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = setTimeout(() => ctl && ctl.abort(), timeoutMs);
  try {
    const r = await fetchImpl(`${base}/api/conference-config?c=${encodeURIComponent(slug)}`, { signal: ctl ? ctl.signal : undefined, cache: "no-store" });
    if (r.status === 204) return { status: "none" };
    if (!r.ok) return { status: "unavailable" };
    const j = await r.json();
    if (!j || j.slug !== slug || !Number.isFinite(Number(j.version))) return { status: "unavailable" };
    return { status: "found", record: { slug, studio: normaliseStudio(j.studio), version: Number(j.version), publishedAt: j.publishedAt || null, releases: normaliseReleases(j.releases) } };
  } catch {
    return { status: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fold a network answer into the cache. Returns the record the booth should
 * now use (null = use the compiled package) and whether it changed.
 */
export function applyFetched(slug, current, result, storage = globalThis.localStorage) {
  if (result.status === "found") {
    const rec = result.record;
    if (!current || rec.version !== current.version || JSON.stringify(rec.studio) !== JSON.stringify(current.studio)
        || JSON.stringify(rec.releases || null) !== JSON.stringify(current.releases || null)) {
      writeCached(rec, storage);
      return { record: rec, changed: true };
    }
    return { record: current, changed: false };
  }
  if (result.status === "none" && current) {
    // Unpublished on purpose: go back to the compiled package.
    clearCached(slug, storage);
    return { record: null, changed: true };
  }
  return { record: current, changed: false };
}

/** The look to render: URL params > published record > compiled package > defaults. */
export function resolveStudio({ params, record, compiled, defaults = { template: "monolith", theme: "obsidian", accent: "" } }) {
  const pub = (record && record.studio) || {};
  const pkg = normaliseStudio(compiled);
  const get = (k) => (params && params.get && params.get(k)) || "";
  const accParam = get("accent");
  return {
    template: get("t") || pub.template || pkg.template || defaults.template,
    theme: get("theme") || pub.theme || pkg.theme || defaults.theme,
    accent: accParam ? "#" + accParam.replace(/^#/, "") : (pub.accent !== undefined ? pub.accent : (pkg.accent || defaults.accent)),
    source: record ? "published" : (Object.keys(pkg).length ? "package" : "default"),
    version: record ? record.version : null,
  };
}

/**
 * a15: show what the content fan-out delivered, through the slot every template
 * already renders (`profile.timeline`, its milestones band). Restrained on
 * purpose -- the timeline is a curated story, not a feed:
 *   - at most `max` releases (default 2), published in the last `days` (180)
 *   - placed first, marked status "NEWS"; the package's milestones follow, in
 *     their own order
 *   - a release whose headline is already a milestone is not repeated
 *   - `&news=0` on the booth URL turns it off
 * Returns the SAME profile object when there is nothing to add, so a booth
 * without releases renders exactly as before.
 */
export function withReleases(profile, releases, { params, now = Date.now(), max = 2, days = 180 } = {}) {
  try {
    if (!profile || !Array.isArray(releases) || !releases.length) return profile;
    if (params && params.get && params.get("news") === "0") return profile;
    const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const existing = Array.isArray(profile.timeline) ? profile.timeline : [];
    const seen = new Set(existing.map((t) => norm(t && t.headline)));
    const cutoff = now - days * 86400e3;
    const add = releases
      .filter((r) => r && r.title && Number.isFinite(Date.parse(r.publishedAt || "")) && Date.parse(r.publishedAt) >= cutoff && !seen.has(norm(r.title)))
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
      .slice(0, max)
      .map((r) => ({ date: r.publishedAt.slice(0, 10), headline: r.title, whyItMatters: r.summary ? r.summary.slice(0, 160) : "", status: "NEWS" }));
    if (!add.length) return profile;
    return { ...profile, timeline: [...add, ...existing] };
  } catch { return profile; }
}
