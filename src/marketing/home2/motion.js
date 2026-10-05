// ─────────────────────────────────────────────────────────────────────────────
// Paged-navigation motion — the ONE definition of how a MineEx marketing deck moves.
//
// These were previously declared separately in AppSection (the sales page), PricingDeck
// and nowhere at all in InvestorPage, which is why the Investor walkthrough felt
// different: it was on native CSS scroll-snap, whose timing the browser owns. Every
// paged surface now reads its duration, curve and gesture thresholds from here, so the
// whole site advances with the same weight and at the same speed.
//
// Changing a value here changes every deck. That is the point.
// ─────────────────────────────────────────────────────────────────────────────

// How long one page move takes, and the curve it moves on.
export const SHEET_MS = 720;
export const EASE_SHEET = "cubic-bezier(0.32, 0.72, 0, 1)";

// When a wheel/trackpad stream counts as one deliberate gesture:
//   WHEEL_TRIGGER     accumulated |deltaY| before a move fires
//   NEW_GESTURE_GAP   ms of silence that re-arms the next move
//   FIRM_DELTA        minimum peak magnitude — filters stray micro-scroll
//   FRESH_FLICK       rising edge that re-arms mid-inertia, so a second deliberate
//                     flick lands immediately instead of waiting for silence
export const WHEEL_TRIGGER = 18;
export const NEW_GESTURE_GAP = 90;
export const FIRM_DELTA = 10;
export const FRESH_FLICK = 40;
