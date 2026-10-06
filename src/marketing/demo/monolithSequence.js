// ─────────────────────────────────────────────────────────────────────────────
// monolithSequence — marketing-only orchestration of the REAL Monolith booth.
//
// It drives the real ConferenceV3 "Monolith" (mn3) presentation through a curated
// set of its OWN existing scenes by setting the scroll position of the booth's own
// scroll container (.cv3) inside the same-origin iframe. ConferenceV3 is NOT touched:
// its single --p scroll driver already turns that scroll into the real scene motion.
// This is the marketing "Explain the Story Fast" demonstration — the parent directs
// the real product; it is NOT an autoplay feature of Conference Mode.
//
// Each step targets a real chapter (by its real class) at a --p position that lands
// on that scene's resting composition. Offsets are recomputed at run time from the
// live chapter geometry and the iframe's own viewport height, so it is resolution-
// independent. Nothing here is a screenshot, a mock, or a fake slide.
// ─────────────────────────────────────────────────────────────────────────────

// Curated real-scene sequence (verified against the live Kingsmen Monolith DOM):
//   mn3-hero (identity) → mn3-snap-ch ("the company in ten seconds" + thesis) →
//   mn3-flag-ch facts (Las Coloradas) → mn3-flag-ch drill (LC-25-010 result) →
//   mn3-port-ch (portfolio + jurisdiction map). mn3-stat is absent for Kingsmen
//   (no explicit heroStatistic), so it is correctly not in the sequence.
export const EXPLAIN_FAST = [
  { key: "identity",   chapter: "mn3-hero",    p: 0.12, dwell: 2200, label: "Kingsmen Resources" },
  // Kingsmen's snapshot is sparse (jurisdiction only, no thesis), so this scene passes
  // quickly as a transition rather than lingering. (Data is intentionally untouched.)
  { key: "tenSeconds", chapter: "mn3-snap-ch", p: 0.72, dwell: 850, label: "The company in ten seconds" },
  { key: "flagship",   chapter: "mn3-flag-ch", p: 0.22, dwell: 1700, label: "Las Coloradas" },
  { key: "drill",      chapter: "mn3-flag-ch", p: 0.76, dwell: 2400, label: "Drill result" },
  { key: "portfolio",  chapter: "mn3-port-ch", p: 0.55, dwell: 0,    label: "Portfolio · Chihuahua" },
];

// Run the sequence. Returns a handle with cancel(). `onScene(index, scene)` fires as
// each scene is reached. `moveMs` is the eased travel time between scenes.
export function runExplainFast(iframe, { onScene, onDone, moveMs = 1000 } = {}) {
  let cancelled = false;
  const timers = [];
  const wait = (ms) => new Promise((res) => { const t = setTimeout(res, ms); timers.push(t); });

  const scrollerOf = () => {
    try {
      const doc = iframe && iframe.contentWindow && iframe.contentWindow.document;
      return doc ? doc.querySelector(".cv3") : null;
    } catch (_) { return null; }
  };
  const chapterEl = (doc, cls) => doc.querySelector(".mn3 ." + cls.split(" ")[0]);

  const targetTop = (sc, doc, vh, scene) => {
    const ch = chapterEl(doc, scene.chapter);
    if (!ch) return null;
    const abs = ch.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop;
    return Math.round(abs + scene.p * Math.max(1, ch.offsetHeight - vh));
  };

  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const smooth = (sc, to, ms) => new Promise((res) => {
    const from = sc.scrollTop, d = to - from, t0 = performance.now();
    const step = (now) => {
      if (cancelled) return res();
      const t = Math.min(1, (now - t0) / ms);
      sc.scrollTop = Math.round(from + d * easeInOut(t));
      try { sc.dispatchEvent(new Event("scroll")); } catch (_) {}
      if (t < 1) requestAnimationFrame(step); else res();
    };
    requestAnimationFrame(step);
  });

  (async () => {
    // Wait for the booth to be ready (its scroller + chapters present).
    let sc = null, tries = 0;
    while (!cancelled && tries++ < 60) {
      sc = scrollerOf();
      if (sc && sc.ownerDocument.querySelector(".mn3 .mn3-hero")) break;
      await wait(100);
    }
    if (cancelled || !sc) return;
    const doc = sc.ownerDocument;
    const vh = (iframe.contentWindow && iframe.contentWindow.innerHeight) || sc.clientHeight || 834;

    for (let i = 0; i < EXPLAIN_FAST.length; i++) {
      if (cancelled) return;
      const scene = EXPLAIN_FAST[i];
      const to = targetTop(sc, doc, vh, scene);
      if (to == null) continue;
      if (i === 0) { sc.scrollTop = to; try { sc.dispatchEvent(new Event("scroll")); } catch (_) {} }
      else await smooth(sc, to, moveMs);
      onScene && onScene(i, scene);
      if (scene.dwell) await wait(scene.dwell);
    }
    if (!cancelled) onDone && onDone();
  })();

  return { cancel() { cancelled = true; timers.forEach(clearTimeout); } };
}
