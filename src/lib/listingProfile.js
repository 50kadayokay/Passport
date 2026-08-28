// Basic-listing profiles ↔ the structured profile the editor speaks.
//
// THE PROBLEM THIS SOLVES
// The ~900 auto-generated directory listings were seeded straight into the app's
// render format: their whole row is `profile = { pp: { TIER:"listing", COMPANY:{…},
// LISTING_BRIEF, LISTING_SOURCE, EXCHANGES, AVATAR, … } }` with NO structured
// `profile.company` / `profile.tier` / `profile.companyBrief` underneath.
//
// The admin editor reads the structured side and, on save, regenerates pp from it
// (`pp = mapProfileToPP(profile)`). On a raw listing that meant:
//   • every field rendered empty in the editor (nothing structured to read), and
//   • saving REPLACED the good pp with one built from nothing — wiping TIER, so the
//     company silently stopped being a listing and rendered as a blank full profile.
//
// hydrateListingProfile() closes the loop: it lifts the pp blob back into the
// structured shape before editing, so the editor shows exactly what the app shows
// and the save round-trips instead of destroying it.
//
// Only ever fills BLANKS — a structured value already present always wins, so this
// is safe to run on a profile that has been edited before.

const S = (x) => (x == null ? "" : String(x));
const blank = (x) => !S(x).trim();

// Does this row render as a compact community listing in the app? The app decides on
// pp.TIER, so that is the authority; profile.tier is honoured too once hydrated.
export function isListingProfile(profile) {
  const p = profile || {};
  return S(p.tier) === "listing" || S(p.pp && p.pp.TIER) === "listing";
}

// Lift a listing's pp blob into the structured profile the editor edits.
// Returns a deep copy; non-listings are returned untouched (deep-copied).
export function hydrateListingProfile(profile) {
  const p = JSON.parse(JSON.stringify(profile || {}));
  if (!isListingProfile(p)) return p;

  const pp = p.pp || {};
  const ppc = pp.COMPANY || {};
  p.tier = "listing";

  const co = (p.company = { ...(p.company || {}) });
  const fill = (key, value) => { if (blank(co[key]) && !blank(value)) co[key] = S(value); };
  fill("name", ppc.name);
  fill("ticker", ppc.ticker);
  fill("website", ppc.website);
  fill("slogan", ppc.slogan);
  fill("commodity", ppc.commodity);
  fill("jurisdiction", ppc.jurisdiction);
  fill("stage", ppc.stage);
  fill("headquarters", ppc.headquarters);
  fill("location", ppc.location);

  // pp.EXCHANGES carries a derived `yahoo` suffix and a mock price; keep only the
  // authored half ({ ex, sym }) — mapProfileToPP rebuilds the rest on save.
  if (!Array.isArray(co.listings) || co.listings.length === 0) {
    co.listings = (Array.isArray(pp.EXCHANGES) ? pp.EXCHANGES : [])
      .filter((x) => x && !blank(x.sym))
      .map((x) => ({ ex: S(x.ex), sym: S(x.sym) }));
  }

  const brand = (p.brand = { ...(p.brand || {}) });
  if (blank(brand.logo)) brand.logo = S(pp.AVATAR || pp.LOGO);
  if (blank(brand.color)) brand.color = S(pp.BRAND);

  const status = (p.companyStatus = { ...(p.companyStatus || {}) });
  if (blank(status.photo)) status.photo = S(pp.STATUS_IMG);

  const brief = (p.companyBrief = { ...(p.companyBrief || {}) });
  if (blank(brief.shortSummary)) brief.shortSummary = S(pp.LISTING_BRIEF || pp.ONE_LINER);

  const contact = (p.contact = { ...(p.contact || {}) });
  const ppct = pp.CONTACT || {};
  for (const k of ["phone", "email", "twitter", "linkedin"]) if (blank(contact[k])) contact[k] = S(ppct[k]);

  if (!p.listingSource && pp.LISTING_SOURCE && typeof pp.LISTING_SOURCE === "object") {
    p.listingSource = { ...pp.LISTING_SOURCE };
  }
  return p;
}
