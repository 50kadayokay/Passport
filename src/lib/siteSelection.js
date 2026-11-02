// What a company's website pulls (a14) -- shared by the Site Contract server
// (api/_siteContent.js) and the portal's Website page, so the page shows
// exactly what the API will serve.
//
// WHERE IT LIVES. Inside `company_blueprints.data` of the website blueprint,
// which the company already writes (0068/0076 policies):
//
//   data.pages, data.sections        the WORKING copy (draft tokens see this)
//   data.sections[id].hidden         true = not on the site
//   data.include { posts, media }    which canonical feeds the site receives
//   data.published { pages, sections, include, publishedAt }
//                                    the copy a SITE token sees, frozen at the
//                                    last "Publish to website"
//
// A blueprint written before a14 has no `published` snapshot: an approved row
// then serves its working copy, as it always did. Nothing existing changes
// meaning; the site only stops receiving what a company explicitly hides.
//
// Pure: no imports, no I/O.

const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);

export const FEEDS = ["posts", "media"];
export const DEFAULT_INCLUDE = { posts: true, media: true };

/** Feed switches, defaulting to on: a site that never chose receives everything, as before. */
export function normaliseInclude(inc) {
  const out = { ...DEFAULT_INCLUDE };
  if (isObj(inc)) for (const f of FEEDS) if (inc[f] === false) out[f] = false;
  return out;
}

/** The copy a given mode serves: draft -> working; published -> snapshot, else (legacy) working. */
export function selectCopy(data, { draft }) {
  const d = isObj(data) ? data : {};
  const src = !draft && isObj(d.published) ? d.published : d;
  return {
    pages: Array.isArray(src.pages) ? src.pages : [],
    sections: isObj(src.sections) ? src.sections : {},
    include: normaliseInclude(src.include),
    publishedAt: isObj(d.published) ? d.published.publishedAt || null : null,
  };
}

/**
 * Drop hidden sections, and every page reference to them. A page whose
 * sections are all hidden stays (empty): pages are the site's routing, and
 * removing a route is a deploy decision, not a content one.
 */
export function visibleOnly({ pages, sections }) {
  const keep = {};
  for (const [id, s] of Object.entries(sections || {})) {
    if (isObj(s) && s.hidden !== true) {
      const { hidden, ...rest } = s;   // the flag is editor state, not site content
      keep[id] = rest;
    }
  }
  return {
    pages: (pages || []).map((p) => (isObj(p) && Array.isArray(p.sections)
      ? { ...p, sections: p.sections.filter((id) => Object.prototype.hasOwnProperty.call(keep, id)) }
      : p)),
    sections: keep,
  };
}

/** The working copy frozen as the published one. */
export function snapshotForPublish(data, now = new Date().toISOString()) {
  const d = isObj(data) ? data : {};
  return {
    ...d,
    published: {
      pages: Array.isArray(d.pages) ? d.pages : [],
      sections: isObj(d.sections) ? d.sections : {},
      include: normaliseInclude(d.include),
      publishedAt: now,
    },
  };
}

/** Has the working copy moved on from the published snapshot? (Without a
    snapshot the live copy IS the working copy, so no. Whether the blueprint is
    approved at all is the caller's question -- it is a column, not data.) */
export function hasUnpublishedChanges(data) {
  const d = isObj(data) ? data : {};
  if (!isObj(d.published)) return false;
  const a = selectCopy(d, { draft: true }), b = selectCopy(d, { draft: false });
  return JSON.stringify([a.pages, a.sections, a.include]) !== JSON.stringify([b.pages, b.sections, b.include]);
}
