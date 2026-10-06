// ─────────────────────────────────────────────────────────────────────────────
// ConferenceAct — the Conference Mode sales chapter, after the frozen Pro Profile
// phone walkthrough. Four gesture-driven beats, one persistent real Monolith booth
// + one persistent real Pro Profile phone.
//
// BEAT 1 · "The Booth Experience" (frozen): real Kingsmen Monolith large in a
//   landscape iPad → rest.
// BEAT 2 · "Explain the Story Fast" (frozen): one gesture directs the REAL Monolith
//   through its own scenes → rests on portfolio. (monolithSequence.js.)
// BEAT 3 · "Same company. Different experience." (frozen): one gesture recomposes to
//   the dominant tablet + a real Pro Profile phone → dual-device rest.
// BEAT 4 · "The handoff": one gesture plays the whole booth→scan→profile→follow
//   journey. The real Monolith advances to its real "Follow on MineEx →" close
//   scene; the REAL handoff QR (real destination) becomes the focal point; attention
//   carries to the phone, which becomes dominant showing the REAL Kingsmen Pro
//   Profile; the REAL Follow control is pressed (guest = local only, no auth, no
//   production write). Rests on a lasting-connection composition.
//
// Both devices are the REAL products in same-origin iframes. No screenshots, no mocks,
// no fake UI. The marketing page owns only presentation; it never modifies ConferenceV3,
// the app, the data, or the frozen Pro Profile walkthrough files.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { MX, EASE, Wrap, Reveal, Eyebrow, Display, Lead, useInView, useReduce, useViewport } from "../system.jsx";
import TabletFrame from "./TabletFrame.jsx";
import PhoneFrame from "./PhoneFrame.jsx";
import TemplateShowcase, { SHOWCASE } from "./TemplateShowcase.jsx";
import { runExplainFast, EXPLAIN_FAST } from "./monolithSequence.js";

const GESTURE_THRESHOLD = 70;
// The REAL handoff destination Conference Mode's booth QR points at (see ConferenceV3Booth
// BoothQR / followUrl). A scan opens the real Kingsmen Pro Profile in the app.
const HANDOFF_URL = "https://passport-xi-five.vercel.app/app?c=kingsmen-resources&utm_campaign=booth";
// Capture-only slow-motion for the Beat-4 phases: /site?conf=1&b4slow=6. Default 1 (no
// effect on the real experience). Dev aid only, like the site's other preview switches.
const B4SLOW = (() => { try { const n = parseFloat(new URLSearchParams(window.location.search).get("b4slow")); return n > 0 ? n : 1; } catch (_) { return 1; } })();
// Capture-only: /site?conf=1&b4hold=<close|qr|toPhone|follow> pins Beat 4 at one phase
// (no auto-advance) so a single phase can be screenshotted despite tool latency. Default off.
const B4HOLD = (() => { try { return new URLSearchParams(window.location.search).get("b4hold") || ""; } catch (_) { return ""; } })();

function DeviceReveal({ children }) {
  const ref = useRef(null);
  const reduce = useReduce();
  const seen = useInView(ref);
  const on = reduce || seen;
  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      <div style={{ opacity: on ? 1 : 0, transform: on ? "none" : "translateY(46px) scale(0.975)", transition: reduce ? "none" : `opacity 1100ms ${EASE}, transform 1200ms ${EASE}`, willChange: on ? "auto" : "transform, opacity" }}>{children}</div>
      {!reduce && (
        <div aria-hidden className={on ? "mx-conf-sweep-on" : ""} style={{ position: "absolute", inset: 0, pointerEvents: "none", borderRadius: 30, overflow: "hidden", zIndex: 4 }}>
          <div className="mx-conf-sweep-bar" style={{ position: "absolute", top: "-20%", bottom: "-20%", width: "36%", transform: "translateX(-160%) rotate(8deg)", background: "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0) 100%)" }} />
        </div>
      )}
    </div>
  );
}

export function ConferenceAct({ resumeAtTerminal = false } = {}) {
  const { mobile } = useViewport();
  const reduce = useReduce();

  // DECLARATIVE initial state only (approved Conference-freeze exception). When false (default)
  // ConferenceAct is byte-for-byte its old self, opening at "opening". When true it mounts
  // directly into the EXISTING approved terminal — beat "showcase", the final showcase item
  // (Terrain), shown — so a parent can remount the real chapter at its terminal for reverse
  // navigation. It seeds only initial state/refs; no timing, gesture or behaviour changes, and
  // no separate terminal component. Every other beat's state stays at its default (unused at
  // the showcase rest, which is gated purely by `beat`/`showcasing`).
  const LAST_SHOW = SHOWCASE.length - 1;
  const [beat, setBeat] = useState(resumeAtTerminal ? "showcase" : "opening");   // opening | explain | relationship | handoff | showcase
  const [sceneIdx, setSceneIdx] = useState(-1);
  const [copyIn, setCopyIn] = useState(false);   // Beat 3 narrative/phone reveal
  const [phoneIn, setPhoneIn] = useState(false);
  const [hop, setHop] = useState("");            // Beat 4 sub-phase: '' | close | qr | toPhone | follow
  const [qrUrl, setQrUrl] = useState("");
  const [followed, setFollowed] = useState(false);
  const [showIdx, setShowIdx] = useState(resumeAtTerminal ? LAST_SHOW : 0);     // Beat 5 template index: 0 Monolith · 1 Atlas · 2 Terrain
  const [showShown, setShowShown] = useState(!!resumeAtTerminal);
  const beatRef = useRef(resumeAtTerminal ? "showcase" : "opening");
  const busyRef = useRef(false);
  const runnerRef = useRef(null);
  const timers = useRef([]);
  const addTimer = (t) => { timers.current.push(t); return t; };
  useEffect(() => { beatRef.current = beat; }, [beat]);
  useEffect(() => () => { if (runnerRef.current) runnerRef.current.cancel(); timers.current.forEach(clearTimeout); }, []);

  // ── Read-only marketing-state signal for a parent layer (approved Conference-freeze
  //    exception). Exposes EXISTING internal state only — no behavior, visual, timing,
  //    gesture or state-machine change. `terminal` = showcase at its final template
  //    (Terrain); `settled` = choreography at rest. Removed on unmount.
  const showIdxRef = useRef(resumeAtTerminal ? LAST_SHOW : 0);
  useEffect(() => { showIdxRef.current = showIdx; }, [showIdx]);
  useEffect(() => {
    window.__conferenceDemoState = () => ({
      beat: beatRef.current,
      showIdx: showIdxRef.current,
      terminal: beatRef.current === "showcase" && showIdxRef.current >= SHOWCASE.length - 1,
      settled: !busyRef.current,
    });
    return () => { try { delete window.__conferenceDemoState; } catch (_) {} };
  }, []);
  // Real handoff QR (real destination), generated once with the product's own lib.
  useEffect(() => { QRCode.toDataURL(HANDOFF_URL, { errorCorrectionLevel: "H", margin: 1, width: 320 }).then(setQrUrl).catch(() => {}); }, []);

  const lockInput = () => {
    const block = (e) => { e.preventDefault(); e.stopImmediatePropagation(); };
    window.addEventListener("wheel", block, { passive: false, capture: true });
    window.addEventListener("touchmove", block, { passive: false, capture: true });
    return () => { window.removeEventListener("wheel", block, { capture: true }); window.removeEventListener("touchmove", block, { capture: true }); };
  };

  // BEAT 2
  const startExplain = useCallback(() => {
    if (busyRef.current || beatRef.current !== "opening") return;
    const iframe = document.querySelector(".mx-tabletframe iframe");
    if (!iframe) return;
    busyRef.current = true; setBeat("explain"); setSceneIdx(0);
    const unblock = lockInput();
    runnerRef.current = runExplainFast(iframe, { moveMs: reduce ? 0 : 1000, onScene: (i) => setSceneIdx(i), onDone: () => { busyRef.current = false; unblock(); } });
  }, [reduce]);

  // BEAT 3
  const startRelationship = useCallback(() => {
    if (busyRef.current || beatRef.current !== "explain") return;
    busyRef.current = true; setBeat("relationship"); setCopyIn(false); setPhoneIn(false);
    const unblock = lockInput();
    if (reduce) { setCopyIn(true); setPhoneIn(true); addTimer(setTimeout(() => { busyRef.current = false; unblock(); }, 80)); return; }
    addTimer(setTimeout(() => setCopyIn(true), 460));
    addTimer(setTimeout(() => setPhoneIn(true), 760));
    addTimer(setTimeout(() => { busyRef.current = false; unblock(); }, 2000));
  }, [reduce]);

  // BEAT 4 — the handoff. Directs the real Monolith to its close scene, surfaces the
  // real QR, carries attention to the phone, and presses the REAL Follow control.
  const pressRealFollow = useCallback(() => {
    try {
      const d = document.querySelector(".mx-phoneframe iframe").contentDocument;
      const btn = [...d.querySelectorAll("button")].find((b) => /^\s*Follow\s*$/.test(b.textContent || ""));
      if (btn) { btn.click(); setFollowed(true); }
    } catch (_) {}
  }, []);

  const startHandoff = useCallback(() => {
    if (busyRef.current || beatRef.current !== "relationship") return;
    busyRef.current = true; setBeat("handoff"); setHop("close");
    // advance the REAL Monolith to its own "Follow on MineEx →" close scene
    const iframe = document.querySelector(".mx-tabletframe iframe");
    try {
      const cw = iframe.contentWindow, doc = cw.document, sc = doc.querySelector(".cv3"), vh = cw.innerHeight;
      const ch = doc.querySelector(".mn3 .mn3-close");
      if (sc && ch) {
        const abs = ch.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop;
        const to = Math.round(abs + 0.6 * Math.max(1, ch.offsetHeight - vh));
        if (reduce) { sc.scrollTop = to; sc.dispatchEvent(new Event("scroll")); }
        else {
          const from = sc.scrollTop, t0 = performance.now(), ease = (t) => 1 - Math.pow(1 - t, 3);
          const step = (now) => { const t = Math.min(1, (now - t0) / 1300); sc.scrollTop = Math.round(from + (to - from) * ease(t)); sc.dispatchEvent(new Event("scroll")); if (t < 1) requestAnimationFrame(step); };
          requestAnimationFrame(step);
        }
      }
    } catch (_) {}

    // capture-only: pin one phase, NO input lock (reload to reset) so it never leaks a blocker
    if (B4HOLD) { addTimer(setTimeout(() => { setHop(B4HOLD); if (B4HOLD === "follow") addTimer(setTimeout(pressRealFollow, 500)); busyRef.current = false; }, 1400)); return; }
    const unblock = lockInput();
    if (reduce) { setHop("follow"); pressRealFollow(); addTimer(setTimeout(() => { busyRef.current = false; unblock(); }, 80)); return; }
    addTimer(setTimeout(() => setHop("qr"), 1700 * B4SLOW));       // real QR becomes the focal point
    addTimer(setTimeout(() => setHop("toPhone"), 3800 * B4SLOW));  // attention carries to the phone; it becomes dominant
    addTimer(setTimeout(() => { setHop("follow"); pressRealFollow(); }, 5600 * B4SLOW));  // press the REAL Follow control
    addTimer(setTimeout(() => { busyRef.current = false; unblock(); }, 6800 * B4SLOW));   // rest
  }, [reduce, pressRealFollow]);

  // BEAT 5 — the template reveal. The phone leaves, the tablet regains dominance, and
  // the real Monolith gives way to the three-template showcase (all real, cross-faded).
  const startShowcase = useCallback(() => {
    if (busyRef.current || beatRef.current !== "handoff") return;
    busyRef.current = true;
    const unblock = lockInput();
    setPhoneIn(false);                                   // the phone completes its job and leaves gracefully
    const enter = () => { setBeat("showcase"); setShowIdx(0); addTimer(setTimeout(() => setShowShown(true), 80)); };
    if (reduce) { enter(); addTimer(setTimeout(() => { busyRef.current = false; unblock(); }, 120)); return; }
    addTimer(setTimeout(enter, 700));                    // let the phone fade before the showcase takes over
    addTimer(setTimeout(() => { busyRef.current = false; unblock(); }, 2100));  // showcase Monolith settled
  }, [reduce]);

  // Advance the showcase to the next real template (cross-fade; pre-mounted → no reload).
  const advanceShowcase = useCallback(() => {
    if (busyRef.current) return;
    setShowIdx((i) => {
      if (i >= SHOWCASE.length - 1) return i;            // Terrain is the last; rest
      busyRef.current = true;
      const unblock = lockInput();
      addTimer(setTimeout(() => { busyRef.current = false; unblock(); }, 950));  // hold through the cross-fade
      return i + 1;
    });
  }, []);

  // One capture-phase listener advances the beat on a deliberate downward gesture.
  useEffect(() => {
    let accum = 0, lastT = 0;
    const centered = () => {
      const el = document.querySelector(".mx-tabletframe"); if (!el) return false;
      const r = el.getBoundingClientRect(); const vh = window.innerHeight || 1;
      return Math.abs((r.top + r.height / 2) - vh / 2) < vh * 0.36 && r.height > vh * 0.36;
    };
    const onWheel = (e) => {
      if (busyRef.current) return;
      const b = beatRef.current;
      if (b !== "opening" && b !== "explain" && b !== "relationship" && b !== "handoff" && b !== "showcase") return;
      if (e.deltaY <= 0) return;
      if (b === "opening" && !centered()) return;   // must be at the booth first; later beats are already resting states
      const now = performance.now();
      if (now - lastT > 300) accum = 0;
      lastT = now; accum += e.deltaY;
      if (accum < GESTURE_THRESHOLD) return;
      e.preventDefault(); e.stopImmediatePropagation(); accum = 0;
      if (b === "opening") startExplain();
      else if (b === "explain") startRelationship();
      else if (b === "relationship") startHandoff();
      else if (b === "handoff") startShowcase();
      else advanceShowcase();                        // showcase: cycle Monolith → Atlas → Terrain
    };
    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => window.removeEventListener("wheel", onWheel, { capture: true });
  }, [startExplain, startRelationship, startHandoff, startShowcase, advanceShowcase]);

  const introVisible = beat === "explain" && sceneIdx <= 0;
  const railVisible = beat === "explain";
  const rel = beat === "relationship";
  const hand = beat === "handoff";
  const showcasing = beat === "showcase";
  const phoneMounted = rel || hand;

  // Tablet position across beats.
  let deckShift = "none";
  if (rel) deckShift = mobile ? "translateY(-6%) scale(0.9)" : "translate(-7%, -3%) scale(0.82)";
  else if (hand) {
    deckShift = (hop === "close" || hop === "qr")
      ? (mobile ? "translateY(-8%) scale(0.92)" : "translate(-3%, -3%) scale(0.9)")     // dominant again for the close scene + QR
      : (mobile ? "translate(-24%,-30%) scale(0.5)" : "translate(-33%, -12%) scale(0.54)"); // recede to secondary/background
  }
  const deckDim = hand && (hop === "toPhone" || hop === "follow");

  // Phone position/scale: frozen Beat-3 anchor (lower-right); a Beat-4 transform brings it to centre-dominant.
  const phoneToCentre = hand && (hop === "toPhone" || hop === "follow");
  const phoneTransform = phoneIn
    ? (phoneToCentre ? (mobile ? "translate(6vw, -18vh) scale(1.18)" : "translate(-30vw, -20vh) scale(1.24)") : "none")
    : "translateY(52px) scale(0.96)";

  return (
    <section id="conference" style={{ position: "relative", background: MX.ink, color: MX.onDark, padding: mobile ? "clamp(90px,16vh,150px) 0 96px" : "clamp(130px,20vh,240px) 0 clamp(90px,12vh,150px)", overflow: "hidden" }}>
      <div aria-hidden style={{ position: "absolute", left: 0, right: 0, top: 0, height: "clamp(60px, 9vh, 140px)", transform: "translateY(-99%)", background: MX.ink, borderRadius: "50% 50% 0 0 / 100% 100% 0 0" }} />
      <div aria-hidden style={{ position: "absolute", left: "50%", top: mobile ? "42%" : "48%", width: "min(1200px, 120vw)", height: "min(1200px, 120vw)", transform: "translate(-50%,-50%)", background: "radial-gradient(closest-side, rgba(120,150,190,0.16), rgba(120,150,190,0.05) 45%, rgba(0,0,0,0) 72%)", pointerEvents: "none" }} />

      <Wrap style={{ position: "relative", zIndex: 2 }}>
        <div style={{ maxWidth: 760, margin: "0 auto", textAlign: "center", opacity: beat === "opening" ? 1 : 0, transform: beat === "opening" ? "none" : "translateY(-12px)", transition: reduce ? "none" : `opacity 520ms ${EASE}, transform 520ms ${EASE}`, pointerEvents: beat === "opening" ? "auto" : "none" }}>
          <div style={{ display: "flex", justifyContent: "center" }}><Eyebrow color={MX.onDarkDim}>Conference Mode</Eyebrow></div>
          <Display style={{ marginTop: 18, color: MX.onDark }}>Replace the one-pager.</Display>
          <Lead dark order={1} style={{ marginTop: 20, marginLeft: "auto", marginRight: "auto", maxWidth: 620 }}>
            The same Kingsmen story that lived on the phone — now a premium digital booth, built for iPad and made for the floor of an investor conference.
          </Lead>
        </div>

        <div style={{ maxWidth: 1120, margin: mobile ? "48px auto 0" : "clamp(56px,8vh,110px) auto 0", transform: deckShift, opacity: showcasing ? 0 : (deckDim ? 0.72 : 1), filter: deckDim ? "brightness(0.66)" : "none", transition: reduce ? "none" : `transform 1200ms ${EASE}, opacity 900ms ${EASE}, filter 900ms ${EASE}`, transformOrigin: "center center", willChange: "transform" }}>
          <DeviceReveal>
            <TabletFrame template="monolith" interactive={false} />
          </DeviceReveal>
          <Reveal kind="copy" order={2}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 26, flexWrap: "wrap", opacity: beat === "opening" ? 1 : 0, transition: `opacity 400ms ${EASE}` }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 600, letterSpacing: "0.02em", color: MX.onDarkDim }}>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: "#4ade80", boxShadow: "0 0 0 4px rgba(74,222,128,0.16)" }} />Live
              </span>
              <span aria-hidden style={{ width: 4, height: 4, borderRadius: 99, background: MX.onDarkMute }} />
              <span style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: MX.onDarkMute }}>MineEx Conference Mode · Kingsmen Resources · Monolith</span>
            </div>
          </Reveal>
        </div>
      </Wrap>

      {/* BEAT 2 chrome */}
      {railVisible && (
        <>
          <div style={{ position: "fixed", left: 0, right: 0, top: "clamp(26px,6vh,70px)", zIndex: 40, display: "flex", justifyContent: "center", pointerEvents: "none", opacity: introVisible ? 1 : 0, transform: introVisible ? "none" : "translateY(-14px)", transition: `opacity 640ms ${EASE}, transform 640ms ${EASE}` }}>
            <div style={{ textAlign: "center", maxWidth: 660, padding: "0 24px" }}>
              <span className="mx-label" style={{ color: MX.onDarkDim, display: "inline-flex", alignItems: "center", gap: 12, justifyContent: "center" }}>
                <span style={{ width: 22, height: 2, borderRadius: 2, background: "var(--mx-accent)" }} />Explain the story fast
              </span>
              <p style={{ marginTop: 14, fontSize: "clamp(15px,1.6vw,18px)", lineHeight: 1.5, fontWeight: 500, color: MX.onDarkDim }}>
                The essential company story — projects, progress and technical results — in a booth presentation an investor understands at a glance.
              </p>
            </div>
          </div>
          <div aria-hidden style={{ position: "fixed", left: 0, right: 0, bottom: "clamp(18px,4vh,38px)", zIndex: 40, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, pointerEvents: "none" }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: MX.onDarkMute, opacity: sceneIdx >= 0 ? 0.9 : 0, transition: `opacity 400ms ${EASE}` }}>{(EXPLAIN_FAST[sceneIdx] || {}).label || ""}</span>
            <div style={{ display: "flex", gap: 7 }}>{EXPLAIN_FAST.map((s, i) => (<span key={i} style={{ width: i === sceneIdx ? 22 : 7, height: 3, borderRadius: 3, background: i <= sceneIdx ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.22)", transition: `width 420ms ${EASE}, background 420ms ${EASE}` }} />))}</div>
          </div>
        </>
      )}

      {/* BEAT 3 / 4 narrative (upper-left) */}
      {(rel || hand) && (
        <div style={{ position: "fixed", left: "clamp(24px,6vw,92px)", top: mobile ? "clamp(64px,11vh,110px)" : "clamp(66px,12vh,140px)", zIndex: 42, maxWidth: mobile ? "78vw" : 430, pointerEvents: "none", opacity: (rel ? copyIn : true) ? 1 : 0, transform: (rel ? copyIn : true) ? "none" : "translateY(16px)", transition: `opacity 720ms ${EASE}, transform 720ms ${EASE}` }}>
          {rel ? (
            <>
              <span className="mx-label" style={{ color: MX.onDarkDim, display: "inline-flex", alignItems: "center", gap: 12 }}><span style={{ width: 22, height: 2, borderRadius: 2, background: "var(--mx-accent)" }} />One company story</span>
              <h2 className="mx-h2" style={{ color: MX.onDark, marginTop: 16, maxWidth: "14ch" }}>Built for every investor moment.</h2>
              <p className="mx-lead" style={{ color: MX.onDarkDim, marginTop: 16, maxWidth: "34ch" }}>At the booth, Conference Mode makes the story immediate. Afterward, the Pro Profile gives investors the depth to keep exploring — the same company, in the context each moment calls for.</p>
            </>
          ) : (
            <>
              <span className="mx-label" style={{ color: MX.onDarkDim, display: "inline-flex", alignItems: "center", gap: 12 }}><span style={{ width: 22, height: 2, borderRadius: 2, background: "var(--mx-accent)" }} />The handoff</span>
              <h2 className="mx-h2" style={{ color: MX.onDark, marginTop: 16, maxWidth: "15ch" }}>The conversation doesn't end at the booth.</h2>
              <p className="mx-lead" style={{ color: MX.onDarkDim, marginTop: 16, maxWidth: "34ch" }}>A scan takes the investor from your booth to your MineEx profile — somewhere to keep exploring your company and follow your progress.</p>
            </>
          )}
        </div>
      )}

      {/* BEAT 4 — the REAL handoff QR (real destination), focal then carried toward the phone */}
      {hand && qrUrl && (
        <div aria-hidden style={{ position: "fixed", zIndex: 46,
          left: mobile ? "50%" : "52%", top: mobile ? "34%" : "44%",
          transform: `translate(-50%,-50%) ${hop === "toPhone" || hop === "follow" ? "translate(18vw, 14vh) scale(0.7)" : "scale(1)"}`,
          opacity: hop === "qr" ? 1 : 0,
          transition: `opacity 620ms ${EASE}, transform 900ms ${EASE}`, pointerEvents: "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, padding: 16, borderRadius: 20, background: "rgba(255,255,255,0.97)", boxShadow: "0 30px 80px -20px rgba(0,0,0,0.6)" }}>
            <div style={{ maxWidth: 168, textAlign: "right" }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#0b0b0d", lineHeight: 1.12, letterSpacing: "-.01em" }}>Browse the full profile</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#6b6b6b", marginTop: 6, lineHeight: 1.3 }}>Scan to open Kingsmen in the MineEx app</div>
            </div>
            <img src={qrUrl} alt="" width={96} height={96} style={{ display: "block", borderRadius: 10 }} />
          </div>
        </div>
      )}

      {/* Persistent real Pro Profile phone (Beats 3 & 4) */}
      {phoneMounted && (
        <div style={{ position: "fixed", right: "clamp(20px,7vw,120px)", bottom: "clamp(20px,6vh,70px)", zIndex: 48, width: mobile ? "min(46vw, 200px)" : "clamp(232px, 22vw, 320px)", pointerEvents: "none", opacity: phoneIn ? 1 : 0, transform: phoneTransform, transition: `opacity 900ms ${EASE}, transform 1100ms ${EASE}`, willChange: "transform, opacity" }}>
          <PhoneFrame tab="overview" />
          <div style={{ marginTop: 14, textAlign: "center", fontSize: 11.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: followed ? "#4ade80" : MX.onDarkMute, transition: `color 500ms ${EASE}` }}>
            {followed ? "Following · Kingsmen (KNG)" : "MineEx Pro Profile · Kingsmen"}
          </div>
        </div>
      )}

      {/* BEAT 5 — the template reveal: one company, three radically different real designs */}
      {showcasing && <TemplateShowcase active={showIdx} shown={showShown} />}

      <style>{`
        .mx-conf-sweep-on .mx-conf-sweep-bar{ animation: mx-conf-sweep 1500ms cubic-bezier(0.22,1,0.36,1) 320ms both; }
        @keyframes mx-conf-sweep{ from{ transform: translateX(-160%) rotate(8deg); } to{ transform: translateX(420%) rotate(8deg); } }
        @media (prefers-reduced-motion: reduce){ .mx-conf-sweep-bar{ animation: none !important; } }
      `}</style>
    </section>
  );
}

export default ConferenceAct;
