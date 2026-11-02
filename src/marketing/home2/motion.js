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

// ── IS THIS GESTURE DELIBERATE? ──────────────────────────────────────────────
// The paged decks required ONE wheel event in the stream to reach FIRM_DELTA before
// they would move, to reject a momentum tail. That also rejects a gentle gesture: a
// macOS trackpad glide emits deltas of roughly 1-10, a mouse wheel emits 100+. So on a
// trackpad the decks did not move SLOWLY, they did not move AT ALL. Measured in WebKit
// (the engine Safari uses) on the live Pro page, 40 events in one glide:
//
//     deltaY  3 x40  (total 120)  ->  no movement
//     deltaY  6 x40  (total 240)  ->  no movement
//     deltaY  9 x40  (total 360)  ->  no movement
//     deltaY 12 x40  ->  advances
//
// A stream can now qualify two ways: a firm peak as before, OR a SUSTAINED push well
// past the trigger. Inertia cannot satisfy the second one, because a momentum tail
// arrives inside the same stream and `streamUsed` already limits a stream to one move;
// a tail only begins a fresh stream after NEW_GESTURE_GAP of silence, by which point
// macOS has stopped sending it. The firm-peak path is untouched, so a mouse wheel and a
// firm flick behave exactly as they do today.
export const SUSTAINED_FACTOR = 2.5;
export const gestureReady = (accum, streamPeak, trigger = WHEEL_TRIGGER, firm = FIRM_DELTA) => {
  const a = Math.abs(accum);
  return a >= trigger && (streamPeak >= firm || a >= trigger * SUSTAINED_FACTOR);
};

// A DIRECTION CHANGE IS ALWAYS A NEW GESTURE.
//
// The reversal test carried the same FIRM_DELTA requirement as the trigger, so on a
// trackpad (deltas of roughly 1-10) a reversal was never recognised: the accumulator kept
// the forward total and the first backward glide had to overcome it before anything moved.
// Measured on the Pro walkthrough with the cursor over the phone — forward ran 1 to 23
// with no stalls, backward stalled four times and skipped states.
//
// Fingers cannot physically reverse during a momentum tail, and a tail does not change
// sign, so the peak requirement protected nothing here. Any real movement against the
// current direction now re-arms the stream.
export const REVERSE_MIN = 2;
export const isReversal = (deltaY, accumDir) =>
  accumDir !== 0 && Math.sign(deltaY) === -accumDir && Math.abs(deltaY) >= REVERSE_MIN;
