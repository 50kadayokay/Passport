// Assembling one website's content payload.
//
// THE SEPARATION THIS FILE EXISTS TO ENFORCE
// ------------------------------------------
//   content.*  CANONICAL — one company record, shared by the investor app, the
//              booth, MineIQ and every website. Lives in `companies.profile`,
//              `posts`, `media_assets`, `documents`.
//   site.*     WEBSITE-SPECIFIC — headings, imagery choices, section order,
//              presentation settings belonging to this one site. Lives in
//              `company_blueprints.data`.
//
// They are read from different tables and written by different paths. Updating
// a company's canonical information CANNOT overwrite its site content, because
// nothing in the canonical write path can reach `company_blueprints.data`. That
// is structural rather than a convention someone has to remember.
//
// PUBLISHED vs DRAFT is the only switch. A site token sees what the public sees:
// a published company, published posts, approved site content. A draft token
// additionally sees unpublished posts and the working copy of the site. No
// token sees another company's anything, because the company comes from the
// credential.

import { serviceRest } from "./_service.js";
import { CONTRACT_VERSION } from "../src/lib/siteManifest.js";
import { selectCopy, visibleOnly } from "../src/lib/siteSelection.js";

const MAX_POSTS = 200;

async function getJson(path) {
  const r = await serviceRest(path);
  if (!r.ok) return null;
  return r.json().catch(() => null);
}

/**
 * Build the payload for one company.
 *
 * `companyId` comes from a verified credential — never from the request.
 * Returns { ok, status, body }.
 */
export async function buildSiteContent(companyId, { draft = false } = {}) {
  const rows = await getJson(
    `companies?id=eq.${companyId}&select=id,slug,name,status,primary_ticker,profile,updated_at&limit=1`);
  const company = rows && rows[0];
  if (!company) return { ok: false, status: 404, body: { error: "That company no longer exists." } };

  // An unpublished company is not an error in draft mode -- that is exactly when
  // a site is being built before launch. In published mode it is a refusal,
  // because serving a live website the contents of an unpublished profile would
  // publish it by the back door.
  if (!draft && company.status !== "published") {
    return {
      ok: false, status: 403,
      body: {
        error: "This company's profile is not published.",
        detail: "Published content is only served for a published profile. Use a draft token to preview.",
      },
    };
  }

  // a14: what the site pulls is the company's choice (portal Website page). The
  // blueprint is read first because it decides whether posts and media are
  // fetched at all. Sections hidden there are dropped from the payload.
  const site = await getSiteBlueprint(companyId, { draft });

  // Posts: live ones always; unpublished only under a draft token. `removed_at`
  // is a reversible unpublish, so a retired post is excluded from both.
  const postFilter = draft
    ? `company_id=eq.${companyId}&removed_at=is.null`
    : `company_id=eq.${companyId}&removed_at=is.null&published_at=lte.${encodeURIComponent(new Date().toISOString())}`;
  const posts = !site.include.posts ? [] : (await getJson(
    `posts?${postFilter}&select=id,title,summary,post_type,category,published_at,media_url,thumbnail_url,source_url,materiality_label` +
    `&order=published_at.desc&limit=${MAX_POSTS}`)) || [];

  // Public media only. `company-media-private` exists precisely so that private
  // assets are not in the public bucket, and a website is a public surface.
  // a15: what the content fan-out delivered to this website (site_content_v1 ->
  // destination_content, migration 0088). Same records as `posts`, delivered
  // through the outbox with their own state and retries; null when 0088 is not
  // applied, so a site can tell "not provisioned" from "nothing delivered".
  const delivered = !site.include.posts ? [] : await getJson(
    `destination_content?company_id=eq.${companyId}&destination=eq.website&removed_at=is.null` +
    `&select=publication_id,post_type,title,summary,category,image_url,source_url,published_at,version,delivered_at` +
    `&order=published_at.desc.nullslast&limit=${MAX_POSTS}`);

  const media = !site.include.media ? [] : (await getJson(
    `media_assets?company_id=eq.${companyId}&previewable=is.true&select=id,storage_path,source_document_id,created_at` +
    `&order=created_at.desc&limit=200`)) || [];

  return {
    ok: true, status: 200,
    body: {
      contract: CONTRACT_VERSION,
      mode: draft ? "draft" : "published",
      generatedAt: new Date().toISOString(),
      company: {
        id: company.id, slug: company.slug, name: company.name,
        status: company.status, ticker: company.primary_ticker || null,
      },
      version: {
        content: company.updated_at || null,
        site: site.version,
        releases: Array.isArray(delivered) && delivered.length
          ? delivered.reduce((m, d) => (d.delivered_at > m ? d.delivered_at : m), "") : null,
      },
      content: {
        // The profile is served as stored: canonical source AND the compiled
        // `pp` presentation shape. A bespoke site is not told which to use --
        // that is a design decision, and design is the site's business.
        profile: company.profile || {},
        posts: posts.map(shapePost),
        releases: Array.isArray(delivered) ? delivered.map(shapeDelivered) : null,
        media,
      },
      site: site.payload,
    },
  };
}

/**
 * The website blueprint: pages, section instances, and their values.
 *
 * Draft reads the working row; published reads the approved one. When there is
 * no blueprint yet -- a site built before anyone has edited anything -- this
 * returns empty structures rather than failing, so a new site renders from
 * canonical content alone.
 */
async function getSiteBlueprint(companyId, { draft }) {
  const wanted = draft ? "" : "&status=eq.approved";
  const rows = await getJson(
    `company_blueprints?company_id=eq.${companyId}&blueprint_type=eq.website${wanted}` +
    `&select=id,template_key,template_version,status,data,updated_at&order=updated_at.desc&limit=1`);

  const row = rows && rows[0];
  if (!row) return { version: 0, include: { posts: true, media: true }, payload: { key: null, version: null, pages: [], sections: {} } };

  // Published: the snapshot frozen by the last "Publish to website" (or, for a
  // blueprint from before a14, the approved working copy). Draft: the working
  // copy. Either way, hidden sections never leave the server.
  const copy = selectCopy(row.data, { draft });
  const { pages, sections } = visibleOnly(copy);
  return {
    version: row.updated_at || 0,
    include: copy.include,
    payload: {
      key: row.template_key || null,
      version: row.template_version || null,
      status: row.status,
      pages,
      sections,
    },
  };
}

/* One fan-out delivery (a15), in the same shape as a post. */
function shapeDelivered(d) {
  return {
    id: d.publication_id,
    kind: d.post_type === "media" ? "media" : "press_release",
    title: d.title || "",
    summary: d.summary || "",
    category: d.category || null,
    publishedAt: d.published_at || null,
    image: d.image_url || null,
    sourceUrl: d.source_url || null,
    version: d.version,
  };
}

/* One post, in the shape a website wants. Not the database row: `post_type` and
   `materiality_label` are MineEx vocabulary a site should be able to ignore,
   and a site should never have to know that `thumbnail_url` doubles as a video
   poster. */
function shapePost(p) {
  return {
    id: p.id,
    kind: p.post_type === "media" ? "media" : "press_release",
    title: p.title || "",
    summary: p.summary || "",
    category: p.category || null,
    publishedAt: p.published_at || null,
    image: p.thumbnail_url || p.media_url || null,
    mediaUrl: p.media_url || null,
    sourceUrl: p.source_url || null,
    materiality: p.materiality_label || null,
  };
}
