// ConferenceV3Booth — the STANDALONE iPad booth for Conference Mode. This is NOT part of the investor
// app: it boots on its own (no PassportProto / 16MB app bundle) and renders one company's chosen template
// full-screen. Reached at /conference?c=<slug>.
//
// Data isolation: company content comes ONLY from the Conference registry (src/conference/registry.js) —
// a Conference-owned, locally bundled package per company. The booth never reads the MineEx investor
// profile (companies.profile), Supabase, investor auth or any investor-app API, so it runs fully offline
// once its bundle is installed. A slug with no Conference package shows an explicit unavailable state.
// Selection comes from the package's conference.studio; URL params override for A/B (&t= &theme= &accent=).
import React, { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import ConferenceV3 from "./ConferenceV3.jsx";
import { conferenceProfile } from "../../conference/registry.js";
import { CONFERENCE_WEB_ORIGIN } from "../../conference/config.js";

const screen = (msg, color) => (
  <div style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", background: "#0b0b0d", color, fontFamily: "system-ui,-apple-system,sans-serif", fontSize: 14, letterSpacing: ".02em" }}>{msg}</div>
);

// Floating QR card — a small white chip so the code scans on any template ground (dark or light).
function BoothQR({ target }) {
  const [qr, setQr] = useState("");
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(target, { errorCorrectionLevel: "H", margin: 1, width: 240 }).then((u) => { if (live) setQr(u); }).catch(() => {});
    return () => { live = false; };
  }, [target]);
  if (!qr) return null;
  return (
    <div style={{ position: "fixed", right: "clamp(16px,3vw,40px)", bottom: "clamp(16px,3vw,40px)", zIndex: 50, display: "flex", alignItems: "center", gap: 14, padding: 14, borderRadius: 18, background: "rgba(255,255,255,.96)", boxShadow: "0 10px 40px rgba(0,0,0,.35)", backdropFilter: "blur(6px)" }}>
      <div style={{ maxWidth: 150, textAlign: "right", fontFamily: "'Inter Tight',system-ui,sans-serif" }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: "#0b0b0d", lineHeight: 1.12, letterSpacing: "-.01em" }}>Browse the full profile</div>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: "#6b6b6b", marginTop: 5, lineHeight: 1.3 }}>Scan to open in the MineEx app</div>
      </div>
      <img src={qr} alt="Scan for the company profile" width={80} height={80} style={{ display: "block", borderRadius: 8 }} />
    </div>
  );
}

// Kiosk hardening — scoped to the booth and fully reversed on unmount. Keeps the iPad's
// screen awake all day (Screen Wake Lock, re-acquired whenever the tab becomes visible
// again, e.g. after the attract loop), kills rubber-band page bounce, and disables the
// text-selection / long-press callout so visitors can't accidentally select or drag.
function useBoothKiosk() {
  useEffect(() => {
    let lock = null;
    const acquire = async () => {
      try { if (navigator.wakeLock && document.visibilityState === "visible") lock = await navigator.wakeLock.request("screen"); } catch (_) {}
    };
    const onVis = () => { if (document.visibilityState === "visible") acquire(); };
    acquire();
    document.addEventListener("visibilitychange", onVis);

    const de = document.documentElement, b = document.body;
    const prev = { deOB: de.style.overscrollBehavior, bOB: b.style.overscrollBehavior, us: b.style.userSelect, callout: b.style.webkitTouchCallout };
    de.style.overscrollBehavior = "none";
    b.style.overscrollBehavior = "none";
    b.style.userSelect = "none";
    b.style.webkitUserSelect = "none";
    b.style.webkitTouchCallout = "none";

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      try { if (lock) lock.release(); } catch (_) {}
      de.style.overscrollBehavior = prev.deOB;
      b.style.overscrollBehavior = prev.bOB;
      b.style.userSelect = prev.us;
      b.style.webkitUserSelect = prev.us;
      b.style.webkitTouchCallout = prev.callout;
    };
  }, []);
}

// Attract loop — after ATTRACT_IDLE_MS of no interaction the booth fades into a looping,
// muted, cover-filled drone video; ANY tap/scroll/key dismisses it. The presentation is
// reset to scene 1 underneath WHILE the video is opaque, so it reappears at the top with no
// visible scroll-back and nothing to load. Screen stays awake (useBoothKiosk) and the loop is
// seamless, so it never goes black. Disabled gracefully if there's no video or it can't load.
const ATTRACT_FADE_IN = 1400, ATTRACT_FADE_OUT = 320;
function useAttractLoop(src, idleMs) {
  const [attract, setAttract] = useState(false);
  const videoRef = useRef(null);
  const readyRef = useRef(false);   // the video has enough data to play instantly
  const onRef = useRef(false);      // attract is currently showing
  const timerRef = useRef(null);

  // The actual scroll container varies by template (Terminal scrolls a `.trm` child inside
  // `.cv3`, others scroll `.cv3` itself) — find whichever element in the deck actually scrolls.
  const topScroller = () => {
    const root = document.querySelector(".cv3");
    if (!root) return null;
    if (root.scrollHeight - root.clientHeight > 4) return root;
    const nodes = root.querySelectorAll("*");
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (el.scrollHeight - el.clientHeight > 50 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) return el;
    }
    return root;
  };
  const resetToTop = () => { const el = topScroller(); if (el) el.scrollTop = 0; };
  // Keep the clip LOOPING CONTINUOUSLY and only fade opacity in/out — so it is never paused
  // on a frozen (black) frame and a re-entry never has to restart playback. Defensive play()
  // in case iOS pauses a backgrounded muted video.
  const playVideo = () => { const v = videoRef.current; if (v) { try { const p = v.play(); if (p && p.catch) p.catch(() => {}); } catch (_) {} } };

  const enter = () => {
    if (onRef.current || !src) return;
    if (!readyRef.current) { timerRef.current = setTimeout(enter, 1000); return; }   // video not buffered yet — retry, never fade to black
    onRef.current = true; setAttract(true);
    playVideo();
    setTimeout(() => { if (onRef.current) resetToTop(); }, ATTRACT_FADE_IN + 80);   // reset hidden behind the opaque video
  };
  const exit = () => {
    if (!onRef.current) return;
    onRef.current = false;
    resetToTop();                 // ensure top before the video clears (still opaque this frame)
    setAttract(false);            // video keeps playing underneath at opacity 0 — ready to fade in instantly next time
  };
  const arm = () => { if (timerRef.current) clearTimeout(timerRef.current); timerRef.current = setTimeout(enter, idleMs); };

  // Defer the (large) video download until a few seconds AFTER the booth has rendered, so it
  // never competes with the presentation's own chunks on first load. There's a 5-minute idle
  // window, so it buffers to ready long before it's needed.
  useEffect(() => {
    if (!src) return undefined;
    const t = setTimeout(() => { const v = videoRef.current; if (v) { try { v.preload = "auto"; v.load(); } catch (_) {} } }, 4000);
    return () => clearTimeout(t);
  }, [src]);

  // The attract clip must loop continuously and never freeze on a frame. If anything pauses it
  // (power-saving on a backgrounded muted video, etc.) while the booth is on screen, resume it.
  useEffect(() => {
    if (!src) return undefined;
    const v = videoRef.current; if (!v) return undefined;
    const onPause = () => { if (readyRef.current && document.visibilityState === "visible") { try { const p = v.play(); if (p && p.catch) p.catch(() => {}); } catch (_) {} } };
    v.addEventListener("pause", onPause);
    return () => v.removeEventListener("pause", onPause);
  }, [src]);

  useEffect(() => {
    if (!src) return undefined;
    const onActivity = () => { if (onRef.current) exit(); arm(); };
    const evs = ["pointerdown", "touchstart", "keydown", "wheel"];
    evs.forEach((e) => window.addEventListener(e, onActivity, { passive: true, capture: true }));
    arm();
    return () => { evs.forEach((e) => window.removeEventListener(e, onActivity, { capture: true })); if (timerRef.current) clearTimeout(timerRef.current); };
  }, [src, idleMs]);

  // When the clip can play, mark ready and start the continuous (hidden) loop.
  const onReady = () => { if (!readyRef.current) { readyRef.current = true; playVideo(); } };
  return { attract, videoRef, onReady };
}

export default function ConferenceV3Booth() {
  useBoothKiosk();
  const params = new URLSearchParams(window.location.search);
  const slug = params.get("c") || "";
  const profile = slug ? conferenceProfile(slug) : null;
  // Per-company attract video (falls back to a slug convention); ?idle=<seconds> overrides the delay for testing.
  const attractSrc = profile ? ((profile.conference && profile.conference.attractVideo) || `/conference-media/${encodeURIComponent(slug)}/attract.mp4`) : "";
  const idleMs = (() => { const q = parseInt(params.get("idle"), 10); return q > 0 ? q * 1000 : 5 * 60 * 1000; })();
  const { attract, videoRef, onReady } = useAttractLoop(attractSrc, idleMs);

  if (!slug) return screen("No company specified for this booth.", "#8a8880");
  if (!profile) return screen("Conference profile unavailable.", "#8a8880");

  // The package's saved template pick drives it; URL params override for A/B; sensible defaults.
  const studio = (profile.conference && profile.conference.studio) || {};
  const accParam = params.get("accent");
  const tplKey = params.get("t") || studio.template || "monolith";
  // Terminal designs its own scan moment (the RESOLVE output) and its instrument HUD owns the bottom-right
  // corner, so the floating chip would cover the HUD counter — it is omitted for that template only.
  const showChip = params.get("qr") !== "0" && tplKey !== "terminal" && tplKey !== "filament" && tplKey !== "folio" && tplKey !== "crimson" && tplKey !== "tableau" && tplKey !== "gyre" && tplKey !== "beacon" && tplKey !== "lattice" && tplKey !== "relay" && tplKey !== "spectra" && tplKey !== "vista" && tplKey !== "cirrus" && !["terminal2","expedition","keynote","vein"].includes(tplKey);   // these design their own Resolve QR
  // Deliberate outbound link: the package's QR destination, else the public MineEx company page.
  const follow = (profile.conference && profile.conference.followUrl)
    || `${CONFERENCE_WEB_ORIGIN}/app?c=${encodeURIComponent(slug)}&utm_campaign=booth`;
  return (
    <>
      <ConferenceV3
        profile={profile}
        template={tplKey}
        theme={params.get("theme") || studio.theme || "obsidian"}
        accent={accParam ? "#" + accParam.replace(/^#/, "") : (studio.accent || "")}
        showBar={false}
        followUrl={follow}
      />
      {showChip && <BoothQR target={follow} />}
      {attractSrc && (
        <video
          ref={videoRef} src={attractSrc} muted loop playsInline preload="none"
          onLoadedData={onReady} onCanPlayThrough={onReady} aria-hidden
          style={{ position: "fixed", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: 9998, background: "#000",
            opacity: attract ? 1 : 0, pointerEvents: attract ? "auto" : "none",
            transition: `opacity ${attract ? ATTRACT_FADE_IN : ATTRACT_FADE_OUT}ms ease` }}
        />
      )}
    </>
  );
}
