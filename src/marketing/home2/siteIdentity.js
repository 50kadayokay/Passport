// ─────────────────────────────────────────────────────────────────────────────
// Public-site identity — the ONE place the business's legal details are defined.
//
// The operating entity behind MineEx, supplied by the business owner 2026-10-05.
// MineEx is the product name; Liquid Jungle Management Ltd. is the company that runs it
// (and the publisher on the App Store listing, bundle id com.liquidjungle.mineex).
export const LEGAL_ENTITY_NAME = "Liquid Jungle Management Ltd.";

// TODO(legal): the registered/mailing address is still outstanding. It is deliberately
// left empty rather than guessed — an invented address on a public commercial site is a
// misrepresentation, and CASL expects a real one in commercial email. The footer renders
// the copyright line without it and omits the address block entirely while this is empty,
// so nothing fake is ever shown. One line per array entry when it arrives.
export const BUSINESS_ADDRESS = [];

export const SUPPORT_EMAIL = "support@mineex.ca";

// Falls back to the product name if the entity is ever blanked, so the line stays truthful.
export const copyrightHolder = () => LEGAL_ENTITY_NAME || "MineEx";
