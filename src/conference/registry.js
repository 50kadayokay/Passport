// Conference Mode company registry — slug → Conference-owned package (verified dataset + template
// presentation + bundled assets). The ONLY source of company content for the booth: Conference Mode never
// reads the MineEx investor profile (companies.profile) or any investor-app API, so a company that is not
// registered here has no Conference presentation.
import kingsmenResourcesTerminal from "./companies/kingsmen-resources/presentation.terminal.js";

export const CONFERENCE_COMPANIES = {
  "kingsmen-resources": kingsmenResourcesTerminal,
};

export function conferenceProfile(slug) {
  return (slug && CONFERENCE_COMPANIES[slug]) || null;
}
