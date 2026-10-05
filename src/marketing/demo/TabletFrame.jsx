// ─────────────────────────────────────────────────────────────────────────────
// TabletFrame — runs the REAL MineEx Conference Mode inside the marketing page's
// landscape iPad, exactly the way MobileAppFrame runs the real phone app.
//
// The marketing page owns ONLY the device presentation (bezel, scale, reveal, boot
// cover). Everything inside the screen is the real product: an <iframe> of
// /conference?c=…&t=…&qr=0. The iframe has its own window, so ConferenceV3 renders
// at its true iPad-landscape viewport (CONF_W × CONF_H) and believes it owns the
// screen. We only SCALE it visually with a transform; ConferenceV3 is never altered.
//
// Boot cover: a PURELY FUNCTIONAL obsidian mask — no copy, no spinner, no progress,
// no startup sequence. It exists only to hide the iframe until the real Conference
// opening has actually painted, then fades cleanly away to reveal it. Ideally the
// visitor never consciously perceives a loading state: the screen simply reads as a
// dark, powered device that resolves into the booth. This lives entirely in the
// marketing layer — ConferenceV3 is not touched.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

// Real Conference Mode iPad-landscape geometry (CSS px). ConferenceV3 runs at
// exactly this viewport inside the iframe; the frame scales it to fit on-screen.
export const CONF_W = 1194;
export const CONF_H = 834;

const SLUG = "kingsmen-resources";

export default function TabletFrame({
  slug = SLUG,
  template = "monolith",
  theme = "obsidian",
  src: srcProp,               // optional explicit same-origin route (else the /conference booth)
  bezel = 16,                 // dark bezel thickness (on-screen px)
  radius = 30,                // outer device corner radius
  title = "MineEx Conference Mode",
  onReady,                    // called once the real experience has painted
  interactive = true,         // false = presentation-only (no pointer capture)
  navSid,                     // marketing orchestration: scroll the REAL presentation to this [data-sid] section
  navStep = 0,                //   sub-step within a multi-step state (uses the product's OWN scroll math)
  navSmooth = false,          // animate the scroll to the target (else instant jump)
  bare = false,               // screen-ONLY (no bezel/frame/shadow/glare) — for compositing onto a physical device image
  renderW = CONF_W,           // iframe's native render resolution (override to match a composited screen's aspect → no stretch)
  renderH = CONF_H,
  showBootCover = true,       // false = no dark mask while booting (a caller-supplied placeholder shows through instead)
  screenBg,                   // override the screen-area background (e.g. "transparent" to reveal a placeholder behind)
  style,
  className = "",
}) {
  if (bare) { bezel = 0; radius = 0; }
  const boxRef = useRef(null);
  const iframeRef = useRef(null);
  const readyRef = useRef(false);
  const [screenW, setScreenW] = useState(0);   // on-screen width of the screen area
  const [ready, setReady] = useState(false);   // real opening has painted → drop the mask

  // Fluid: the device fills its parent's width; the screen area is that minus the bezel.
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") {
      if (el) setScreenW(Math.max(0, el.clientWidth - bezel * 2));
      return;
    }
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0].contentRect.width;
      setScreenW(Math.max(0, cw - bezel * 2));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [bezel]);

  const markReady = useCallback(() => {
    if (readyRef.current) return;
    readyRef.current = true;
    setReady(true);
    onReady && onReady();
  }, [onReady]);

  // Reveal only once the REAL Conference hero is actually in the DOM and painted —
  // not merely when the iframe document's load event fires (which is well before the
  // lazy Conference bundle mounts and the hero rasterises). We poll the same-origin
  // iframe document for the ConferenceV3 root, then wait one frame + a short settle
  // so the opening is truly on screen before the mask fades. A safety timeout ensures
  // the mask can never trap the view even if inspection is blocked.
  const handleLoad = useCallback(() => {
    const t0 = performance.now();
    const tick = () => {
      if (readyRef.current) return;
      let painted = false;
      try {
        const doc = iframeRef.current && iframeRef.current.contentDocument;
        const hero = doc && (doc.querySelector(".cv3") || doc.querySelector(".fo") || doc.querySelector("[data-cv3]"));
        painted = !!(doc && doc.readyState === "complete" && hero && (hero.textContent || "").trim().length > 8);
      } catch (_) {
        painted = true;   // cross-origin (shouldn't happen same-origin) → don't block
      }
      if (painted) {
        requestAnimationFrame(() => setTimeout(markReady, 240));   // let it rasterise
      } else if (performance.now() - t0 < 4500) {
        setTimeout(tick, 90);
      } else {
        markReady();       // safety: never leave the mask up indefinitely
      }
    };
    tick();
  }, [markReady]);

  // Marketing orchestration — drive the REAL presentation to a named section/step WITHOUT
  // modifying Conference Mode. Same-origin: read the presentation's own scroll container and
  // its `[data-sid]` sections (Terminal `.trm-state` OR folio `.fo-state`), then move to the
  // section's OWN offsetTop (+ step × viewport) — exactly the product's own scroll math.
  useEffect(() => {
    if (!ready || !navSid) return;
    const doc = iframeRef.current && iframeRef.current.contentDocument;
    if (!doc) return;
    let r1, r2, t, raf;
    const run = () => {
      const sec = doc.querySelector('[data-sid="' + navSid + '"]');
      if (!sec) return;
      // The presentation's OWN scroll container (Terminal `.trm` / folio `.fo`); walk up to the
      // scrollable ancestor. Section offsetTop is measured against it, so y = section top + step × viewport.
      let scEl = sec.parentElement;
      while (scEl && !(scEl.scrollHeight > scEl.clientHeight + 4)) scEl = scEl.parentElement;
      scEl = scEl || sec.offsetParent;
      if (!scEl) return;
      const y = sec.offsetTop + (navStep || 0) * (scEl.clientHeight || 1);
      if (Math.abs(scEl.scrollTop - y) < 1) return;
      if (!navSmooth) { scEl.scrollTop = y; return; }   // INSTANT — no visible fly-through
      // SMOOTH — a short eased scroll for the "presentation advances a page" feel. Adjacent pages
      // only, so nothing flies by. We animate scrollTop ourselves (never the product's own smooth
      // API, which can over-travel), so it lands exactly on the snap point.
      const from = scEl.scrollTop, d = y - from, t0 = performance.now(), dur = 620;
      const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
      const step = (now) => { const u = Math.min(1, (now - t0) / dur); scEl.scrollTop = from + d * ease(u); if (u < 1) raf = requestAnimationFrame(step); };
      raf = requestAnimationFrame(step);
    };
    r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(run); });
    t = setTimeout(run, 280);   // safety: run once more after layout has settled
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); if (raf) cancelAnimationFrame(raf); clearTimeout(t); };
  }, [ready, navSid, navStep, navSmooth]);

  const scale = screenW > 0 ? screenW / renderW : 0;
  const screenH = renderH * scale;
  const src = srcProp || `/conference?c=${encodeURIComponent(slug)}&t=${encodeURIComponent(template)}&theme=${encodeURIComponent(theme)}&qr=0`;

  return (
    <div
      ref={boxRef}
      className={`mx-tabletframe ${className}`}
      style={{
        position: "relative",
        width: "100%",
        background: bare ? "transparent" : "#0a0a0c",
        padding: bezel,
        borderRadius: radius,
        // Deep, single, soft shadow — a premium object resting on a dark stage. In `bare`
        // mode the physical device image supplies the body/shadow, so we render none.
        boxShadow: bare ? "none" : "0 90px 170px -60px rgba(0,0,0,0.85), 0 0 0 2px rgba(255,255,255,0.06) inset",
        ...style,
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: screenH || 1,
          borderRadius: bare ? 0 : Math.max(6, radius - bezel),
          overflow: "hidden",
          background: screenBg != null ? screenBg : (bare ? "#000" : "#05070b"),
          isolation: "isolate",
        }}
      >
        {scale > 0 && (
          <iframe
            ref={iframeRef}
            title={`${title} — ${slug}`}
            src={src}
            width={renderW}
            height={renderH}
            scrolling="no"
            loading="eager"
            onLoad={handleLoad}
            style={{
              border: 0,
              display: "block",
              width: renderW,
              height: renderH,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              pointerEvents: interactive ? "auto" : "none",
            }}
          />
        )}

        {showBootCover && <BootCover show={!ready} />}

        {/* Screen glare — a single raking highlight, purely the glass of the device. Omitted
            in `bare` mode: the physical device image already carries its own glass. */}
        {!bare && (
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              zIndex: 3,
              background: "linear-gradient(112deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0) 34%)",
            }}
          />
        )}
      </div>
    </div>
  );
}

// Purely functional obsidian mask. No copy, no spinner, no progress, no mark — the
// screen simply reads as a dark, powered device until the real booth resolves in.
// Matches the Conference "obsidian" ground so the hand-off is seamless and, ideally,
// imperceptible. Stays mounted through the fade so the transition is smooth.
function BootCover({ show }) {
  const [mounted, setMounted] = useState(true);
  useEffect(() => {
    if (show) { setMounted(true); return; }
    const t = setTimeout(() => setMounted(false), 720);
    return () => clearTimeout(t);
  }, [show]);
  if (!mounted) return null;
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 4,
        pointerEvents: "none",
        background: "radial-gradient(130% 130% at 50% 42%, #0c1016 0%, #05070b 72%)",
        opacity: show ? 1 : 0,
        transition: "opacity 640ms cubic-bezier(0.22,1,0.36,1)",
      }}
    />
  );
}
