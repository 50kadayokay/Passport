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
// Returns a stop function. Images already in flight are left to finish; nothing new starts.
import { PP_ASSETS } from "./ppAssets.js";

export function warmPpAssets({ concurrency = 3, list = PP_ASSETS, onDone } = {}) {
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

// The handful the Projects act shows FIRST. Awaiting these instead of all 58 is what lets
// that surface reveal promptly while the rest keep warming behind it.
export function warmFirst(n = 6, concurrency = 3) {
  return new Promise((resolve) => {
    const stop = warmPpAssets({ concurrency, list: PP_ASSETS.slice(0, n), onDone: resolve });
    setTimeout(() => { stop(); resolve(); }, 3200);   // never hold a surface back on a bad network
  });
}
