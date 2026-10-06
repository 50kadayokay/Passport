// ─────────────────────────────────────────────────────────────────────────────
// EcosystemScene — the FINAL story chapter of the MineEx sales page: the ecosystem
// that turns a booth conversation into a lasting investor relationship.
//
//   MEET → FOLLOW → AUDIENCE GROWTH → PUBLISH → NOTIFY → FINAL
//
// ONE continuous visual story on a single pinned stage. Physical objects PERSIST
// between beats: the same iPad carries MEET→FOLLOW, and ONE phone carries
// FOLLOW→AUDIENCE→NOTIFY (its screen cross-fades from profile to lock-screen). No
// object teleports or regenerates — every beat is a translate/opacity/scale of the
// same nodes. Each state's internal animation (the follower tally, the notification
// arrival, the Follow activation) completes on its own once the beat is reached.
//
// Marketing-layer only. REUSES the approved surfaces — the real Conference iPad via
// ConferenceScene `deviceOnly`, and the shared marketing Phone frame — so the existing
// iPad / iPhone compositing is untouched.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useRef, useState } from "react";
import { MX, EASE, Phone } from "../system.jsx";
import ConferenceScene from "./ConferenceScene.jsx";

const EASE_MOVE = "cubic-bezier(0.33, 0, 0.12, 1)";   // premium, no-overshoot object motion
const TICK = "#2563EB";

const ECO = [
  { key: "meet",     eyebrow: "The MineEx Ecosystem", head: "Meet investors at the booth.",        body: "Give them an interactive way to explore your company while the conversation is happening." },
  { key: "follow",   eyebrow: "The MineEx Ecosystem", head: "Turn interest into followers.",         body: "Investors scan your QR, continue exploring your company on MineEx and follow to stay connected." },
  { key: "audience", eyebrow: "The MineEx Ecosystem", head: "An audience that compounds.",            body: "Every booth conversation adds another follower — until a whole audience has formed around your company." },
  { key: "publish",  eyebrow: "The MineEx Ecosystem", head: "Keep your audience informed.",           body: "Publish company updates and press releases through MineEx as your story develops." },
  { key: "notify",   eyebrow: "The MineEx Ecosystem", head: "Your followers hear from you again.",    body: "When something important happens, the investors who chose to follow your company are brought back into the story." },
  { key: "final",    eyebrow: "From first meeting to what happens next", head: "The conference ends.\nThe relationship doesn’t.", body: "Conference Mode creates the connection. MineEx Pro gives you a place to continue it." },
];

// Per-beat object choreography. Offsets are in VIEWPORT units (vw/vh) so every object shares ONE
// reference frame (a %-translate would be relative to each element's own box → collisions). Anchor is
// the stage centre; objects translate out from there.
const IPAD = [
  { o: 1, x: 0,  y: 0, s: 1.00 },  // MEET — centred hero
  { o: 1, x: -7, y: 0, s: 0.94 },  // FOLLOW — eases left, makes room for the phone
  { o: 0, x: -12, y: 0, s: 0.90 }, // AUDIENCE — recedes
  { o: 0, x: -12, y: 0, s: 0.90 }, // PUBLISH
  { o: 0, x: -12, y: 0, s: 0.90 }, // NOTIFY
  { o: 0, x: -12, y: 0, s: 0.90 }, // FINAL
];
const PHONE = [
  { o: 0, x: 12, y: 14, s: 0.90 }, // MEET — waiting below-right
  { o: 1, x: 15, y: 11, s: 0.80 }, // FOLLOW — glides in over the iPad's lower-right
  { o: 1, x: 17, y: 0,  s: 0.84 }, // AUDIENCE — stands to the right of the counter
  { o: 0, x: 24, y: 6,  s: 0.88 }, // PUBLISH — parks aside
  { o: 1, x: 0,  y: 0,  s: 1.04 }, // NOTIFY — comes forward, centred
  { o: 0, x: 0,  y: 8,  s: 0.96 }, // FINAL — recedes
];
const COUNTER = [
  { o: 0, x: -12, s: 0.96 }, { o: 0, x: -12, s: 0.96 },
  { o: 1, x: -13, s: 1.00 }, // AUDIENCE — left of the phone
  { o: 0, x: -12, s: 0.96 }, { o: 0, x: -12, s: 0.96 }, { o: 0, x: -12, s: 0.96 },
];
const PUBLISH = [
  { o: 0, y: 5, s: 0.97 }, { o: 0, y: 5, s: 0.97 }, { o: 0, y: 5, s: 0.97 },
  { o: 1, y: 0, s: 1.00 }, // PUBLISH
  { o: 0, y: 5, s: 0.97 }, { o: 0, y: 5, s: 0.97 },
];

// ── Left narrative — same eyebrow/headline/body system as the approved walkthrough ──
function Narrative({ eyebrow, head, body, anim }) {
  return (
    <div style={anim}>
      <p className="mx-label" style={{ color: MX.emText, letterSpacing: "0.22em", margin: 0, display: "inline-flex", alignItems: "center", gap: 12 }}>
        <span aria-hidden style={{ width: 22, height: 2, borderRadius: 2, background: TICK }} />
        {eyebrow}
      </p>
      <h2 className="mx-h2" style={{ marginTop: 18, color: MX.text, whiteSpace: "pre-line" }}>{head}</h2>
      <p style={{ marginTop: 18, maxWidth: "34ch", color: MX.emText, fontSize: "clamp(15px, 1.1vw, 18px)", lineHeight: 1.5 }}>{body}</p>
    </div>
  );
}

// ── Phone screens (marketing-safe demo content, in the shared Phone frame) ──
function FollowScreen({ followed }) {
  return (
    <div style={{ position: "absolute", inset: 0, background: "#fff", display: "flex", flexDirection: "column", fontFamily: "inherit" }}>
      <div style={{ position: "relative", height: "46%", background: "linear-gradient(180deg,#1b2a3f,#0e1826)", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "url(/demo/monolith/c05.jpg)", backgroundSize: "cover", backgroundPosition: "center", opacity: 0.95 }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(6,10,16,0.15), rgba(6,10,16,0.65))" }} />
        <div style={{ position: "absolute", left: 16, right: 16, bottom: 14, color: "#fff" }}>
          <div style={{ fontSize: 10, letterSpacing: "0.14em", fontWeight: 700, opacity: 0.85 }}>TSXV: KGS · COPPER-GOLD</div>
          <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-0.01em", marginTop: 4 }}>Kingsmen Resources</div>
        </div>
      </div>
      <div style={{ flex: 1, padding: "16px 16px 0", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1, borderRadius: 12, padding: "12px 0", textAlign: "center", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            background: followed ? "#0a7d3c" : MX.ink, color: "#fff", transition: `background 360ms ${EASE}` }}>
            {followed ? <><span style={{ fontSize: 13 }}>✓</span> Following</> : "Follow"}
          </div>
          <div style={{ width: 46, borderRadius: 12, border: "1px solid rgba(10,12,15,0.12)", display: "grid", placeItems: "center", color: MX.dim, fontSize: 16 }}>⋯</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {[["Overview", 1], ["Projects", 0], ["Progress", 0]].map(([t, on]) => (
            <span key={t} style={{ fontSize: 12, fontWeight: 600, color: on ? MX.text : MX.mute, borderBottom: on ? `2px solid ${MX.ink}` : "2px solid transparent", paddingBottom: 6 }}>{t}</span>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[["Flagship", "Las Coloradas"], ["Stage", "Resource"], ["Gold", "1.9 Moz M&I"], ["Jurisdiction", "Sonora, MX"]].map(([k, v]) => (
            <div key={k} style={{ background: MX.sheet, borderRadius: 10, padding: "9px 11px" }}>
              <div style={{ fontSize: 9, letterSpacing: "0.1em", fontWeight: 700, color: MX.mute, textTransform: "uppercase" }}>{k}</div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: MX.text, marginTop: 2 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function NotifyScreen({ notifyIn }) {
  return (
    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,#0b1220,#0a1c14)", color: "#fff", fontFamily: "inherit", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: "url(/demo/monolith/c08.jpg)", backgroundSize: "cover", backgroundPosition: "center", opacity: 0.62 }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(6,10,16,0.35), rgba(6,10,16,0.6))" }} />
      <div style={{ position: "absolute", top: "12%", left: 0, right: 0, textAlign: "center" }}>
        <div style={{ fontSize: 15, fontWeight: 600, opacity: 0.9 }}>Tuesday, 22 September</div>
        <div style={{ fontSize: 66, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.05 }}>9:41</div>
      </div>
      <div style={{ position: "absolute", left: "6%", right: "6%", top: "40%",
        opacity: notifyIn ? 1 : 0, transform: notifyIn ? "translateY(0)" : "translateY(-16px)",
        transition: `opacity 520ms ${EASE}, transform 560ms ${EASE_MOVE}` }}>
        <div style={{ background: "rgba(28,30,36,0.62)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", borderRadius: 20, padding: "13px 14px", display: "flex", gap: 12, alignItems: "flex-start", border: "1px solid rgba(255,255,255,0.12)" }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: "#0a0c0f", display: "grid", placeItems: "center", flex: "0 0 auto" }}>
            <span style={{ width: 15, height: 15, borderRadius: 3, background: "linear-gradient(135deg,#caa96b,#2563EB)" }} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.02em" }}>MINEEX</span>
              <span style={{ fontSize: 11, opacity: 0.7 }}>now</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>Kingsmen Resources</div>
            <div style={{ fontSize: 13, opacity: 0.92, marginTop: 1, lineHeight: 1.35 }}>New drill results from Las Coloradas</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Publish surface (marketing-safe representation of the MineEx press-release publish flow) ──
function PublishSurface() {
  return (
    <div style={{ width: "100%", borderRadius: 16, overflow: "hidden", background: "#fff", boxShadow: "0 70px 130px -60px rgba(4,8,14,0.5), 0 0 0 1px rgba(18,22,29,0.08)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "#f6f6f5", borderBottom: "1px solid rgba(18,22,29,0.07)" }}>
        {[0, 1, 2].map((i) => <span key={i} style={{ width: 9, height: 9, borderRadius: 99, background: "#e0e0df" }} />)}
        <span style={{ marginLeft: 10, fontSize: 11, fontWeight: 600, color: MX.mute, background: "#fff", border: "1px solid rgba(18,22,29,0.07)", borderRadius: 6, padding: "3px 12px" }}>mineex.ca/portal · press releases</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "148px 1fr", minHeight: 320 }}>
        <div style={{ borderRight: "1px solid rgba(18,22,29,0.07)", padding: "16px 12px", background: "#fbfbfa", display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", color: MX.mute, textTransform: "uppercase", margin: "2px 6px 8px" }}>Workspace</div>
          {["Home", "Profile", "Press Releases", "Followers"].map((t) => (
            <div key={t} style={{ fontSize: 13, fontWeight: t === "Press Releases" ? 700 : 500, color: t === "Press Releases" ? MX.text : MX.dim, background: t === "Press Releases" ? "#eef2ff" : "transparent", borderRadius: 8, padding: "8px 10px" }}>{t}</div>
          ))}
        </div>
        <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", color: "#0a7d3c", textTransform: "uppercase" }}>Ready to publish</div>
              <div style={{ fontSize: 19, fontWeight: 700, color: MX.text, marginTop: 6, letterSpacing: "-0.01em" }}>New Drill Results from Las Coloradas</div>
              <div style={{ fontSize: 12.5, color: MX.mute, marginTop: 4 }}>Press release · Draft · Reviewed by 2</div>
            </div>
            <div style={{ background: MX.ink, color: "#fff", borderRadius: 10, padding: "11px 20px", fontWeight: 700, fontSize: 14, whiteSpace: "nowrap" }}>Publish →</div>
          </div>
          <div style={{ height: 1, background: "rgba(18,22,29,0.08)" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[100, 92, 96, 70].map((w, i) => <div key={i} style={{ height: 9, width: `${w}%`, borderRadius: 4, background: i === 0 ? "rgba(18,22,29,0.14)" : "rgba(18,22,29,0.07)" }} />)}
          </div>
          <div style={{ marginTop: 4, display: "flex", gap: 10, alignItems: "center", fontSize: 12, color: MX.mute }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: 99, background: "#0a7d3c" }} /> Will notify 100+ followers</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Follower counter (AUDIENCE): tallies 0 → 12 → 31 → 58 → 84 → 100+ on entry ──
const TALLY = ["0", "12", "31", "58", "84", "100+"];
function Counter({ run }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!run) { setN(0); return; }
    let k = 0; setN(0);
    const id = setInterval(() => { k += 1; setN(k); if (k >= TALLY.length - 1) clearInterval(id); }, 360);
    return () => clearInterval(id);
  }, [run]);
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: "clamp(84px, 11vw, 168px)", fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 0.9, color: MX.ink, fontVariantNumeric: "tabular-nums" }}>{TALLY[n]}</div>
      <div style={{ marginTop: 10, fontSize: 13, fontWeight: 800, letterSpacing: "0.24em", color: MX.mute, textTransform: "uppercase" }}>Followers</div>
      <div style={{ marginTop: 22, display: "flex", gap: 8, alignItems: "center", justifyContent: "center", color: MX.mute, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
        {TALLY.map((v, i) => (
          <React.Fragment key={v}><span style={{ fontWeight: i === TALLY.length - 1 ? 800 : 500, color: i <= n ? (i === TALLY.length - 1 && n === i ? MX.text : MX.dim) : "rgba(134,141,151,0.4)" }}>{v}</span>{i < TALLY.length - 1 && <span style={{ opacity: 0.4 }}>→</span>}</React.Fragment>
        ))}
      </div>
    </div>
  );
}

function ResolutionRow({ show }) {
  const steps = ["Conference Mode", "Follow", "100+ Followers", "Publish", "Notify"];
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
      {steps.map((s, i) => (
        <React.Fragment key={s}>
          <span style={{ fontSize: "clamp(11px,1vw,13px)", fontWeight: 700, letterSpacing: "0.04em", color: MX.text, background: "#fff", border: "1px solid rgba(10,12,15,0.12)", borderRadius: 999, padding: "9px 16px", boxShadow: "0 10px 24px -16px rgba(4,8,14,0.4)",
            opacity: show ? 1 : 0, transform: show ? "none" : "translateY(10px)", transition: `opacity 460ms ${EASE} ${i * 90}ms, transform 500ms ${EASE_MOVE} ${i * 90}ms` }}>{s}</span>
          {i < steps.length - 1 && <span aria-hidden style={{ color: MX.mute, fontSize: 14, opacity: show ? 1 : 0, transition: `opacity 300ms ${EASE} ${i * 90 + 60}ms` }}>→</span>}
        </React.Fragment>
      ))}
    </div>
  );
}

export default function EcosystemScene({ beat = 0, state, active = true, mount = true, mobile = false, reduce = false }) {
  const b = Math.max(0, Math.min(ECO.length - 1, state != null ? state : beat));

  // Narrative copy motion, synced to the beat (lift-out → swap → rise-in).
  const [shownB, setShownB] = useState(b);
  const [copyAnim, setCopyAnim] = useState("in");
  useEffect(() => {
    if (shownB === b) return;
    setCopyAnim("out");
    const t = setTimeout(() => { setShownB(b); setCopyAnim("in"); }, 190);
    return () => clearTimeout(t);
  }, [b, shownB]);
  const copyStyle = copyAnim === "out"
    ? { opacity: 0, transform: "translateY(-22px)", transition: `opacity 190ms ${EASE}, transform 190ms ${EASE}` }
    : { animation: reduce ? "none" : `mxEcoIn 460ms ${EASE} both` };

  // Auto-running internal animations, armed when their beat is reached.
  const followed = active && b >= 1;
  const [notifyIn, setNotifyIn] = useState(false);
  useEffect(() => {
    if (active && b === 4) { const t = setTimeout(() => setNotifyIn(true), 340); return () => clearTimeout(t); }
    setNotifyIn(false);
  }, [active, b]);

  const c = ECO[shownB];
  const isFinal = b === 5;

  // ── MOBILE / reduced-motion: simple stacked, per-beat (no absolute stage) ──
  if (mobile) {
    return (
      <div className="mx-eco" style={{ position: "relative", minHeight: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28, padding: "88px 22px 30px", textAlign: "center" }}>
        <style>{"@keyframes mxEcoIn{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}"}</style>
        <div style={{ maxWidth: 460 }}><Narrative eyebrow={c.eyebrow} head={c.head} body={c.body} anim={copyStyle} /></div>
        <div style={{ width: "100%", display: "flex", justifyContent: "center" }}>
          {b <= 1 && <div style={{ width: "88%" }}><ConferenceScene deviceOnly mount={mount} active confIndex={b === 0 ? 0 : 4} /></div>}
          {b === 2 && <Counter run={active} />}
          {b === 3 && <div style={{ width: "100%" }}><PublishSurface /></div>}
          {(b === 1 || b === 4) && <div style={{ width: "min(62vw,240px)", marginTop: b === 1 ? 18 : 0 }}><Phone width="100%">{b >= 4 ? <NotifyScreen notifyIn={notifyIn} /> : <FollowScreen followed={followed} />}</Phone></div>}
          {b === 5 && <div><ResolutionRow show={active} /></div>}
        </div>
      </div>
    );
  }

  const ip = IPAD[b], ph = PHONE[b], co = COUNTER[b], pu = PUBLISH[b];
  const T_MOVE = `opacity 620ms ${EASE}, transform 720ms ${EASE_MOVE}`;

  return (
    <div className="mx-eco" style={{ position: "relative", height: "100%", width: "100%", overflow: "hidden" }}>
      <style>{"@keyframes mxEcoIn{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}"}</style>

      {/* Left narrative — hidden on the FINAL beat (which is centred) */}
      <div style={{ position: "absolute", left: "clamp(28px,5vw,72px)", top: 0, bottom: 0, width: "min(440px, 36vw)", display: "flex", alignItems: "center", zIndex: 5,
        opacity: isFinal ? 0 : 1, transform: isFinal ? "translateX(-16px)" : "none", transition: T_MOVE, pointerEvents: isFinal ? "none" : "auto" }}>
        <Narrative eyebrow={c.eyebrow} head={c.head} body={c.body} anim={copyStyle} />
      </div>

      {/* Right stage — persistent objects live here and translate/scale between beats */}
      <div aria-hidden={isFinal} style={{ position: "absolute", left: "40%", right: "clamp(28px,5vw,72px)", top: 0, bottom: 0, zIndex: 3,
        opacity: isFinal ? 0 : 1, transition: `opacity 560ms ${EASE}`, pointerEvents: "none" }}>
        <div style={{ position: "absolute", inset: 0 }}>
          {/* iPad (persists MEET → FOLLOW) */}
          <div style={{ position: "absolute", left: "50%", top: "50%", width: "min(92%, 860px)",
            transform: `translate(-50%,-50%) translate(${ip.x}vw, ${ip.y}vh) scale(${ip.s})`, opacity: ip.o, transition: T_MOVE, willChange: "transform, opacity" }}>
            {mount && <ConferenceScene deviceOnly mount active confIndex={b === 0 ? 0 : 4} />}
          </div>

          {/* Counter (AUDIENCE) */}
          <div style={{ position: "absolute", left: "50%", top: "50%", transform: `translate(-50%,-50%) translate(${co.x}vw,0) scale(${co.s})`, opacity: co.o, transition: T_MOVE, willChange: "transform, opacity" }}>
            <Counter run={active && b === 2} />
          </div>

          {/* Publish surface (PUBLISH) */}
          <div style={{ position: "absolute", left: "50%", top: "50%", width: "min(100%, 880px)", transform: `translate(-50%,-50%) translate(0, ${pu.y}vh) scale(${pu.s})`, opacity: pu.o, transition: T_MOVE, willChange: "transform, opacity" }}>
            <PublishSurface />
          </div>

          {/* Phone (persists FOLLOW → AUDIENCE → NOTIFY; screen cross-fades) */}
          <div style={{ position: "absolute", left: "50%", top: "50%", width: "min(30%, 300px)",
            transform: `translate(-50%,-50%) translate(${ph.x}vw, ${ph.y}vh) scale(${ph.s})`, opacity: ph.o, transition: T_MOVE, willChange: "transform, opacity", zIndex: 4 }}>
            <Phone width="100%">
              <div style={{ position: "absolute", inset: 0, opacity: b >= 4 ? 0 : 1, transition: `opacity 420ms ${EASE}` }}><FollowScreen followed={followed} /></div>
              <div style={{ position: "absolute", inset: 0, opacity: b >= 4 ? 1 : 0, transition: `opacity 420ms ${EASE}` }}><NotifyScreen notifyIn={notifyIn} /></div>
            </Phone>
          </div>
        </div>
      </div>

      {/* FINAL — the resolution row + closing statement, centred; objects have become secondary */}
      <div style={{ position: "absolute", inset: 0, zIndex: 6, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "96px clamp(24px,5vw,64px) 40px", gap: "clamp(28px,4vh,52px)",
        opacity: isFinal ? 1 : 0, transform: isFinal ? "none" : "translateY(16px)", transition: `opacity 640ms ${EASE} ${isFinal ? "120ms" : "0ms"}, transform 680ms ${EASE_MOVE}`, pointerEvents: isFinal ? "auto" : "none" }}>
        <ResolutionRow show={isFinal && active} />
        <div style={{ maxWidth: 780 }}>
          <p className="mx-label" style={{ color: MX.emText, letterSpacing: "0.22em", margin: 0, display: "inline-flex", alignItems: "center", gap: 12, justifyContent: "center" }}>
            <span aria-hidden style={{ width: 22, height: 2, borderRadius: 2, background: TICK }} />
            {ECO[5].eyebrow}
          </p>
          <h2 style={{ marginTop: 20, color: MX.text, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.03, fontSize: "clamp(40px, 5.4vw, 72px)", whiteSpace: "pre-line" }}>{ECO[5].head}</h2>
          <p style={{ margin: "22px auto 0", maxWidth: "44ch", color: MX.emText, fontSize: "clamp(16px,1.3vw,19px)", lineHeight: 1.5 }}>{ECO[5].body}</p>
        </div>
      </div>
    </div>
  );
}
