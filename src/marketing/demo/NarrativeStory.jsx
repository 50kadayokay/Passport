// ─────────────────────────────────────────────────────────────────────────────
// NarrativeStory — the premium sales-page section that wraps the LOCKED phone demo.
//
// Composition: LEFT = a persistent editorial stage of business-value copy; RIGHT =
// the DirectedEmbed phone (the real MineEx product, the visual proof). The phone
// stays anchored while the visitor scrolls the directed product sequence.
//
// SYNCHRONIZATION — the phone is the source of truth, and it now tells us when it
// moves. DirectedEmbed emits three lifecycle events; the narrative choreographs to
// them rather than polling:
//   demo:transitionstart  → the outgoing beat DEPARTS as the phone begins moving
//   demo:contentready     → the incoming beat ARRIVES with the destination content
//   demo:settled          → both settle together
// The events carry raw phone-state indices {from,to}; this layer owns the state→beat
// map. When from and to belong to the SAME beat (A→B, G→H, Capital→Structure) the
// copy is not touched at all. A low-frequency poll is kept only as a failsafe that
// reconciles the displayed beat if an event is ever missed (e.g. a focus change).
//
// 11 phone states → 8 narrative beats. DirectedEmbed's states/timing are unchanged
// except for the one approved Capital Structure state; this file owns none of that.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useRef, useState } from "react";
import { MX, EASE, useViewport } from "../system.jsx";
import { stageGridStyle } from "../home2/WalkthroughNarrative.jsx";
import { DirectedEmbed } from "./DirectedEmbed.jsx";
import { ProjectsAct } from "./ProjectsAct.jsx";
import PushPreview from "../home2/PushPreview.jsx";

// Narrative beats (business value for a junior-mining CEO). Copy is verbatim as approved.
// The eleven Projects beats are shared by the isolated Projects act AND the full walkthrough.
const PROJECT_BEATS = [
  { eyebrow: "YOUR PROJECTS",          head: "Give every asset its own investor-ready profile.",         body: "Each project brings together real imagery, stage, location, geology and the information investors need to understand the asset." },
  { eyebrow: "REAL PHOTOGRAPHY",       head: "Show investors the property, not a data sheet.",           body: "Real photographs of the site — the ground, the workings, the drilling — the way an investor would see it in person." },
  { eyebrow: "MULTIPLE PROJECTS",      head: "Move between every asset in one place.",                   body: "Investors can jump between your projects in a tap — with each project keeping its own photography, stage, geology, targets and technical story." },
  { eyebrow: "INDEPENDENT PROFILES",   head: "Every project stands on its own.",                         body: "Almoloya keeps its own stage, deposit type and data — a separate investor profile, not a copy of the flagship." },
  { eyebrow: "PROJECT SNAPSHOT",       head: "Give investors the fundamentals at a glance.",             body: "Location, commodities, deposit type, drill targets and stage — structured the way investors size up an asset." },
  { eyebrow: "PROJECT CONTEXT",        head: "Give investors the context behind the headline numbers.",  body: "Stage, current activity and upcoming milestones sit one tap deeper, so investors can understand where the project actually stands today." },
  { eyebrow: "TECHNICAL INTELLIGENCE", head: "Make the technical case easier to understand.",            body: "Exploration strategy, geological models and technical context are organized into layers investors can explore without digging through technical reports." },
  { eyebrow: "GEOLOGICAL MODEL",       head: "Make the geological thesis easier to understand.",         body: "Structures, mineralization and the deposit model are organized into a clear explanation of how the project is thought to work." },
  { eyebrow: "EXPLORATION RESULTS",    head: "Let investors go all the way to the evidence.",            body: "Surface the real holes, grades, widths and intercepts behind the story — with the context needed to understand why they matter." },
  { eyebrow: "THE INVESTMENT CASE",    head: "Show investors why the project matters.",                  body: "MineEx connects the project's differentiators, supporting evidence and why-it-matters context into one investor-ready view." },
  { eyebrow: "A BALANCED VIEW",        head: "Show the upside and the risk, honestly.",                  body: "The bull case, the bear case and the next catalyst to watch — giving investors a balanced view of what could move the project." },
];
// Isolated Projects act (/site?story=1&act=projects) — the frozen ProjectsAct's 14 states → the 11 beats above.
//   0 projects · 1 lcPhoto1 · 2 lcPhoto2 · 3 almoArrive · 4 almoSnapshot · 5 lcSnapshot
//   6 stage · 7 techIntel · 8 geoModel · 9 drill · 10 finalSynth · 11 bull · 12 bear · 13 nextVal
const PROJECT_STATE_TO_BEAT = [0, 1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10];

// The five non-Projects beats.
const B_PROFILE    = { eyebrow: "PROFILE",    head: "Your company, built for investors.",                        body: "Give investors one living profile for the essential facts — what you own, where you operate, what stage you're at and what you're focused on now." };
const B_AI_BRIEF   = { eyebrow: "AI BRIEF",   head: "Understand the company in under a minute.",                  body: "MineEx turns your company information into a plain-English orientation — what you do, how you create value and why it matters." };
const B_PROGRESS   = { eyebrow: "PROGRESS",   head: "Turn years of disclosure into a story investors can follow.", body: "Organize milestones chronologically, then explain what happened, why it mattered and how each event moved the company forward." };
const B_CAPITAL    = { eyebrow: "CAPITAL",    head: "Make your capital position immediately understandable.",     body: "Show funding runway, listings and key capital metrics up front — with the underlying share structure and dilution available when investors want to go deeper." };
const B_LEADERSHIP = { eyebrow: "LEADERSHIP", head: "Put the people behind the company front and centre.",        body: "Give investors a clear view of the management team and board behind the assets and strategy." };
const B_MGMT       = { eyebrow: "MANAGEMENT PROFILES", head: "Give investors context on the people leading the company.", body: "Management and board profiles bring the experience behind the assets and strategy into the same investor profile." };
const B_MEDIA      = { eyebrow: "MEDIA",      head: "Keep your investor content in one place.",                   body: "Publish project photos, videos and interviews directly to your profile so investors can keep exploring your story." };
// Follow / investor retention — the commercial payoff (interest → relationship).
const B_FOLLOW     = { eyebrow: "FOLLOW",        head: "Turn investor interest into a lasting connection.", body: "Investors don't just understand your company and leave. They can follow your company and stay connected as your story develops." };
const B_STAY       = { eyebrow: "STAY CONNECTED", head: "Don't let investor interest disappear.",          body: "Turn a website visit, conference conversation or QR scan into an ongoing investor relationship." };

// Full-walkthrough project beats (simplified order): Las Coloradas is explored in depth,
// then ONE "Multiple Projects" beat closes the act on the Almoloya switch. "Multiple projects"
// and "independent profiles" are merged into a single beat (the switch proves both). Project
// Stage/Context is shown once (on Las Coloradas). The isolated PROJECT_BEATS above are unchanged.
const B_MULTI = { eyebrow: "MULTIPLE PROJECTS", head: "Every project gets its own profile.", body: "Move between your assets in a tap — with each project keeping its own photography, stage, geology, targets and technical story." };
const FULL_PROJECT_BEATS = [
  PROJECT_BEATS[0],   // YOUR PROJECTS
  PROJECT_BEATS[1],   // REAL PHOTOGRAPHY
  PROJECT_BEATS[4],   // PROJECT SNAPSHOT
  PROJECT_BEATS[5],   // PROJECT CONTEXT
  PROJECT_BEATS[6],   // TECHNICAL INTELLIGENCE
  PROJECT_BEATS[7],   // GEOLOGICAL MODEL
  PROJECT_BEATS[8],   // EXPLORATION RESULTS
  PROJECT_BEATS[9],   // THE INVESTMENT CASE
  PROJECT_BEATS[10],  // A BALANCED VIEW
  B_MULTI,            // MULTIPLE PROJECTS (finale — Las Coloradas → Almoloya)
];

// Full walkthrough — 25 states → 19 beats: Profile → AI Brief → 10 Projects beats → Progress → Capital → Leadership → Management Profiles → Media → Follow → Stay Connected.
const FULL_BEATS = [B_PROFILE, B_AI_BRIEF, ...FULL_PROJECT_BEATS, B_PROGRESS, B_CAPITAL, B_LEADERSHIP, B_MGMT, B_MEDIA, B_FOLLOW, B_STAY];
//   states: 0,1 Profile · 2 AIBrief · 3 YourProjects · 4,5 RealPhotography · 6 Snapshot · 7 Context ·
//   8 TechIntel · 9 GeoModel · 10 Results · 11 InvestmentCase · 12,13,14 BalancedView · 15 MultipleProjects(Almoloya) ·
//   16,17 Progress · 18,19 Capital · 20 Leadership · 21 ManagementProfiles · 22 Media · 23 Follow · 24 Following
const PROGRESS_BEAT = 12;   // walkthrough states 16 (timeline) + 17 (milestone)
const STATE_TO_BEAT = [0, 0, 1, 2, 3, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 11, 12, 12, 13, 13, 14, 15, 16, 17, 18];

// Dark stage for the full walkthrough: near-black ground + an animated blue→green glow
// behind the phone (the same colour language as the homepage, tuned to glow on black).
const NS_BG = "#07080b";
const nsGlow = (pos, color, size) => { const [x, y] = pos.split(" "); return { position: "absolute", left: x, top: y, width: size, height: size, transform: "translate(-50%,-50%)", background: `radial-gradient(closest-side, ${color}, transparent 72%)`, filter: "blur(30px)", borderRadius: "50%" }; };
const GLOW_CSS = `
  .mxw-a,.mxw-b,.mxw-c,.mxw-d{will-change:transform}
  @keyframes wA{0%{transform:translate(-50%,-50%) translate(-4%,-3%) scale(1)}50%{transform:translate(-50%,-50%) translate(8%,6%) scale(1.18)}100%{transform:translate(-50%,-50%) translate(-4%,-3%) scale(1)}}
  @keyframes wB{0%{transform:translate(-50%,-50%) translate(6%,3%) scale(1.1)}50%{transform:translate(-50%,-50%) translate(-7%,-5%) scale(1)}100%{transform:translate(-50%,-50%) translate(6%,3%) scale(1.1)}}
  @keyframes wC{0%{transform:translate(-50%,-50%) scale(1)}50%{transform:translate(-50%,-50%) translate(-8%,7%) scale(1.15)}100%{transform:translate(-50%,-50%) scale(1)}}
  @keyframes wD{0%{transform:translate(-50%,-50%) translate(3%,-2%) scale(1.05)}50%{transform:translate(-50%,-50%) translate(-5%,5%) scale(.92)}100%{transform:translate(-50%,-50%) translate(3%,-2%) scale(1.05)}}
  .mxw-a{animation:wA 26s ease-in-out infinite}.mxw-b{animation:wB 32s ease-in-out infinite}.mxw-c{animation:wC 28s ease-in-out infinite}.mxw-d{animation:wD 34s ease-in-out infinite}
`;

export function NarrativeStory({ variant = "full", hardware = false, cutout = false }) {
  const isProjects = variant === "projects";
  const BEATS = isProjects ? PROJECT_BEATS : FULL_BEATS;
  const MAP = isProjects ? PROJECT_STATE_TO_BEAT : STATE_TO_BEAT;
  const beatOf = (s) => (typeof s === "number" && MAP[s] != null ? MAP[s] : 0);
  const { mobile } = useViewport();

  // The displayed beat, and its enter/exit phase (in · out · prep).
  const [shownBeat, setShownBeat] = useState(0);
  const [phase, setPhase] = useState("in");
  const shownBeatRef = useRef(0);
  const animatingRef = useRef(false);
  // The choreography effect binds once, so it reads `mobile` through a ref.
  const mobileRef = useRef(mobile);
  useEffect(() => { mobileRef.current = mobile; }, [mobile]);
  useEffect(() => { shownBeatRef.current = shownBeat; }, [shownBeat]);

  // Event-driven choreography (+ failsafe poll).
  useEffect(() => {
    const onStart = (e) => {
      animatingRef.current = true;
      const { from, to } = e.detail || {};
      // Only a real beat change moves the copy; within-beat advances leave it stationary.
      if (beatOf(from) === beatOf(to)) return;
      // PHONES: swap the copy on the spot instead of running the depart/arrive choreography.
      // That choreography is built for desktop, where one deliberate gesture gives it the
      // ~750ms it needs (240ms out, then the wait for demo:contentready, then a 480ms fade
      // in). On a phone the beats arrive far faster than that, so the copy never finished
      // arriving before it was told to leave again — measured on the shipped build, the
      // headline was invisible 64% of the time while scrolling, with blanks up to 1511ms.
      // An empty stage under the phone is most of what reads as "glitchy". Swapping the
      // text directly keeps the copy on screen at all times, and the short fade below is
      // enough to stop it looking like a hard cut.
      if (mobileRef.current) { setShownBeat(beatOf(to)); setPhase("in"); return; }
      setPhase("out");                                         // depart as the phone begins moving
    };
    const onReady = (e) => {
      if (mobileRef.current) return;                           // phones already swapped, in onStart
      const { from, to } = e.detail || {};
      if (beatOf(from) !== beatOf(to)) {
        setShownBeat(beatOf(to));                              // arrive with the destination content
        setPhase("prep");
      }
    };
    const onSettled = () => { animatingRef.current = false; };

    window.addEventListener("demo:transitionstart", onStart);
    window.addEventListener("demo:contentready", onReady);
    window.addEventListener("demo:settled", onSettled);

    // Failsafe only: if an event was ever missed, reconcile to the phone's committed
    // state — never mid-transition, and with no animation (it's a correction, not a beat).
    const poll = setInterval(() => {
      if (animatingRef.current) return;
      try {
        const s = window.__demoState && window.__demoState();
        if (!s || typeof s.cur !== "number" || s.animating) return;
        const b = beatOf(s.cur);
        if (b !== shownBeatRef.current) { setShownBeat(b); setPhase("in"); }
      } catch (_) {}
    }, 700);

    return () => {
      window.removeEventListener("demo:transitionstart", onStart);
      window.removeEventListener("demo:contentready", onReady);
      window.removeEventListener("demo:settled", onSettled);
      clearInterval(poll);
    };
  }, []);

  // prep → in via setTimeout (rAF is PAUSED when the pane is unfocused, which would
  // strand the incoming copy at opacity 0). A short timeout paints the "prep" resting
  // position, then the "in" transition runs — regardless of focus.
  useEffect(() => {
    if (phase !== "prep") return;
    const t = setTimeout(() => setPhase("in"), 32);
    return () => clearTimeout(t);
  }, [phase]);

  const beat = BEATS[shownBeat] || BEATS[0];
  const copyMotion = (mobile ? {
    // Short enough to keep up with scroll-driven beats, and it never rests at 0.
    out:  { opacity: 1, transform: "none", transition: `opacity 120ms ${EASE}` },
    prep: { opacity: 1, transform: "none", transition: "none" },
    in:   { opacity: 1, transform: "none", transition: `opacity 160ms ${EASE}` },
  } : {
    out:  { opacity: 0, transform: "translateY(-16px)", transition: `opacity 240ms ${EASE}, transform 240ms ${EASE}` },
    prep: { opacity: 0, transform: "translateY(18px)", transition: "none" },
    in:   { opacity: 1, transform: "translateY(0)",    transition: `opacity 480ms ${EASE}, transform 560ms ${EASE}` },
  })[phase];

  const phone = isProjects ? <ProjectsAct /> : <DirectedEmbed hardware={hardware} cutout={cutout} />;

  // Blue→green atmospheric glow, sitting behind the phone on the right; left stays black.
  // ── Presentation-stage atmosphere ──────────────────────────────────────────
  // The frozen ?story / ?salesstory routes keep their original four blurred blooms.
  // The hardware (Pro) stage instead gets ONE full-bleed radial field: because radial
  // gradients fade to transparent on their own, there is no clipping box, no mask edge
  // and therefore no rectangular boundary. It is centred on the phone column (70% across),
  // extends well past the device, and is static — no blur filters, no animation loops.
  const bgLayer = hardware ? (
    <div aria-hidden style={{
      position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none",
      background: [
        // A bottom fade to #07080b lived here, to hide a hard edge where the stage ended.
        // It became the problem: fading the lower 38% of the stage to near-black IS a black
        // band, which is what shows from the value-drivers beat onward. Removed. The edge it
        // was hiding came from the stage being a different height than the viewport during a
        // scroll, and these walkthroughs no longer scroll at all — the stage is a static
        // 100svh — so there is nothing left for it to hide.
        "radial-gradient(62% 52% at 70% 46%, rgba(37,99,235,0.34) 0%, rgba(37,99,235,0.15) 40%, rgba(37,99,235,0) 74%)",
        "radial-gradient(46% 40% at 79% 70%, rgba(45,212,191,0.22) 0%, rgba(45,212,191,0) 72%)",
        "radial-gradient(42% 36% at 61% 22%, rgba(56,189,248,0.17) 0%, rgba(56,189,248,0) 70%)",
      ].join(","),
    }} />
  ) : (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "68%", overflow: "hidden",
        WebkitMaskImage: "linear-gradient(to right, transparent, #000 22%)", maskImage: "linear-gradient(to right, transparent, #000 22%)" }}>
        <span className="mxw-a" style={nsGlow("52% 40%", "rgba(37,99,235,.72)", "86%")} />
        <span className="mxw-b" style={nsGlow("40% 66%", "rgba(56,189,248,.58)", "78%")} />
        <span className="mxw-c" style={nsGlow("66% 78%", "rgba(163,230,53,.55)", "72%")} />
        <span className="mxw-d" style={nsGlow("50% 16%", "rgba(45,212,191,.55)", "68%")} />
      </div>
    </div>
  );

  if (mobile) {
    // The phone pages are the SAME walkthrough as desktop, sized to the screen — not a
    // separate story. This used to drop the narrative and show the device alone, which
    // rendered as a full-bleed phone over the nav with no copy at all; that is what led
    // to a parallel mobile composition being written instead of finishing this one.
    //
    // Same beats, same copy, same real app. Stacked: copy above, device below, with the
    // device taking the remaining height (see stageGridStyle).
    return (
      <div className="mx-story-m" style={{ position: "relative", height: "100svh", overflow: "hidden", background: NS_BG }}>
        <style>{`.mx-story-m .mx-demo{background:transparent!important}${hardware ? ".mx-story-m .mx-demo{height:100%!important;overflow:visible!important}.mx-story-m .mx-demo > div:not([aria-hidden]){padding:0!important;overflow:visible!important}" : ""} ${GLOW_CSS}`}</style>
        {bgLayer}
        <div style={{ position: "absolute", left: 0, right: 0, top: 62, bottom: 12, zIndex: 3 }}>
          <div style={stageGridStyle(true)}>
            <div style={copyMotion}>
              <p className="mx-label" style={{ color: MX.onDarkMute, letterSpacing: "0.22em", margin: 0 }}>
                <span style={{ color: MX.onDark, fontWeight: 800 }}>{String(shownBeat + 1).padStart(2, "0")}</span>
                <span style={{ color: MX.onDarkMute }}> / {String(BEATS.length).padStart(2, "0")}</span>
                <span style={{ color: MX.onDarkMute, margin: "0 8px" }}>·</span>
                {beat.eyebrow}
              </p>
              <h2 className="mx-h2" style={{ marginTop: 9, maxWidth: "22ch", color: MX.onDark }}>{beat.head}</h2>
              <p className="mx-lead" style={{ color: MX.onDarkDim, marginTop: 10, maxWidth: "38ch" }}>{beat.body}</p>
            </div>
            <div style={{ position: "relative", height: "100%" }}>{phone}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-story" style={{ position: "relative", height: "100svh", overflow: "hidden", background: NS_BG, touchAction: "none" }}>
      <style>{`
        .mx-story .mx-demo { background: transparent !important; }
        .mx-story .mx-demo > div[aria-hidden] { display: none !important; }  /* hide the phone's internal-state dots */
        ${hardware ? `
        /* Photoreal hardware: size to the grid cell (not 100svh) and let the phone's own
           soft shadow fall outside the box. Mirrors the sales page's .mx-appstage rules. */
        .mx-story .mx-demo { height: 100% !important; overflow: visible !important; }
        .mx-story .mx-demo > div:not([aria-hidden]) { padding: 0 !important; overflow: visible !important; }
        ` : ""}
        ${GLOW_CSS}
      `}</style>
      {bgLayer}
      <div
        style={{
          position: "relative",
          display: "grid",
          gridTemplateColumns: "minmax(0, 0.9fr) minmax(0, 1.1fr)",
          alignItems: "center",
          height: "100%",
          maxWidth: 1380,
          margin: "0 auto",
          // Reserve the fixed nav's height so nothing in the walkthrough can sit under it.
          // Same figures the sales page uses (SAFE_TOP = NAV_H 64 + 28 = 92, SAFE_BOTTOM = 28).
          padding: hardware ? "92px clamp(28px, 5vw, 84px) 28px" : "0 clamp(28px, 5vw, 84px)",
          boxSizing: "border-box",
          gap: "clamp(28px, 4vw, 76px)",
        }}
      >
        {/* LEFT — persistent editorial stage */}
        <div style={{ display: "flex", gap: "clamp(20px, 2vw, 34px)", alignItems: "stretch" }}>
          <ChapterRail total={BEATS.length} active={shownBeat} />
          <div style={{ minHeight: 300, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={copyMotion}>
              <p className="mx-label" style={{ color: MX.onDarkMute, letterSpacing: "0.22em", margin: 0 }}>
                <span style={{ color: MX.onDark, fontWeight: 800 }}>{String(shownBeat + 1).padStart(2, "0")}</span>
                <span style={{ color: MX.onDarkMute }}> / {String(BEATS.length).padStart(2, "0")}</span>
                <span style={{ color: MX.onDarkMute, margin: "0 8px" }}>·</span>
                {beat.eyebrow}
              </p>
              <h2 className="mx-h2" style={{ marginTop: 18, maxWidth: "16ch", color: MX.onDark }}>{beat.head}</h2>
              <p className="mx-lead" style={{ color: MX.onDarkDim, marginTop: 20, maxWidth: "38ch" }}>{beat.body}</p>
            </div>
          </div>
        </div>

        {/* RIGHT — the real MineEx phone (visual proof), anchored */}
        <div style={{ position: "relative", height: "100%" }}>
          {/* The same push preview the sales page uses, shown on the PROGRESS beat — the
              one where the timeline is on screen. Dark variant for this stage. */}
          {hardware && !mobile && <PushPreview show={shownBeat === PROGRESS_BEAT} />}
          {phone}
        </div>
      </div>
    </div>
  );
}

// A thin vertical progress rail — one segment per beat, filled up to the active one.
// Restrained orientation, secondary to the headline; not a carousel paginator.
function ChapterRail({ total, active }) {
  return (
    <div aria-hidden style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 8, flexShrink: 0, paddingTop: 4 }}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          style={{
            width: 2,
            height: i === active ? 30 : 16,
            borderRadius: 2,
            background: i === active ? MX.onDark : i < active ? "rgba(255,255,255,0.42)" : "rgba(255,255,255,0.14)",
            transition: `height 420ms ${EASE}, background 420ms ${EASE}`,
          }}
        />
      ))}
    </div>
  );
}
