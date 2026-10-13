// Warm the Pro Profile photographs WITHOUT taking the connection away from the visitor.
//
// These 58 images are ~12MB. Nothing they warm is on screen when the warming starts; the
// point is that a LATER tab's hero is already in cache. That is worth doing — but only with
// whatever bandwidth is actually spare.
//
// The previous shape could not do that. It pumped inside a single idle callback:
//
//   while (deadline.timeRemaining() > 3) { const im = new Image(); im.src = PP_ASSETS[i++]; }
//
// Setting `.src` only STARTS a request; it does not wait for one. So the loop never yields
// to the deadline it is testing, and one tick fires the whole list. Measured on the home
// page: 68 image requests, 12.13MB, all in flight at once. A tab click during that window
// put the route's 3KB chunk at the back of a 12MB queue — which is why clicking Pro took
// ~2s for 3KB of JavaScript, and why 156KB took 6031ms on production.
//
// Two changes fix it, and both are needed:
//   • a real concurrency cap — the next image starts when one FINISHES, not when the
//     deadline says there is time, so at most `concurrency` requests ever compete;
//   • fetchPriority "low" — the browser then schedules these behind anything it considers
//     more important, including a chunk fetched by a navigation.
//
// ── AND IT WAS WARMING THE WRONG URLS ENTIRELY ──────────────────────────────────────
// ppAssets.js lists 58 files under /pp/ — 11MB of them. The app stopped using those URLs;
// its images are the /kingsmen-fixture/ set that PassportProto falls back to. Measured on
// production, on /home, /pro, ?slice and ?directedDemo, after scrolling each surface to the
// bottom so every chapter mounted:
//
//   /pp/ requested by the parent (the warm) : 58
//   /pp/ requested by the app in the iframe :  0
//
// So the whole 11MB was downloaded, on every visit, for a cache no one ever read from. That
// is the bulk of the home page's 12.13MB — and the queue a tab click had to wait behind.
//
// The warm now covers what the embed ACTUALLY requests. Those five files total 528KB and,
// measured against their largest drawn size at DPR 3, are already correctly sized — the
// status photograph is 900px serving a 1146px slot, so shrinking it would cost quality
// rather than preserve it. Nothing here is resized; the waste was never the dimensions.
const WARM_LIST = [
  "/kingsmen-fixture/04-status-img.jpeg",
  "/kingsmen-fixture/02-site-photo.jpeg",
  "/kingsmen-fixture/05-status-logo.png",
  "/kingsmen-fixture/00-logo.png",
  "/kingsmen-fixture/01-avatar.jpeg",
];

export const PP_WARM = WARM_LIST;

export function warmPpAssets({ concurrency = 3, list = WARM_LIST, onDone } = {}) {
  let i = 0, inFlight = 0, stop = false, finished = false;

  const settle = () => {
    if (finished || stop) return;
    finished = true;
    if (onDone) { try { onDone(); } catch (_) {} }
  };

  const pump = () => {
    if (stop) return;
    while (inFlight < concurrency && i < list.length) {
      const src = list[i++];
      inFlight++;
      const im = new Image();
      im.decoding = "async";
      try { im.fetchPriority = "low"; } catch (_) {}   // not in every engine; harmless when absent
      const done = () => { inFlight -= 1; pump(); };
      im.onload = done;
      im.onerror = done;
      im.src = src;
    }
    if (i >= list.length && inFlight === 0) settle();
  };

  pump();
  return () => { stop = true; };
}

// The ones the Projects act shows FIRST. It used to await all 58 before revealing.
export function warmFirst(n = 3, concurrency = 3) {
  return new Promise((resolve) => {
    const stop = warmPpAssets({ concurrency, list: WARM_LIST.slice(0, n), onDone: resolve });
    setTimeout(() => { stop(); resolve(); }, 3200);   // never hold a surface back on a bad network
  });
}
