// Sections 1–3: the opening reveal — hero, the fragmentation problem, and the
// company profile itself.
import React, { useRef, useState, useLayoutEffect } from "react";
import { ArrowRight } from "lucide-react";
import {
  MX, EASE, Section, Wrap, Reveal, Eyebrow, Lead, Cta, Phone,
  useTrack, useViewport, useReduce, ramp, win, step, mix, phoneWidth,
} from "../system.jsx";
import { Fit, ProfileScreen, AppShot } from "../ui/AppUI.jsx";
import { CHANNELS } from "../data.js";

/* ══════════════════════════════════════════════════════ 1 · HERO ══════════ */

export function Hero() {
  const track = useRef(null);
  const p = useTrack(track, { reduceValue: 0 });
  const { mobile } = useViewport();
  const reduce = useReduce();
  const lift = reduce ? 0 : p;

  return (
    <div ref={track} style={{ position: "relative", background: MX.sheet }}>
      <Section
        tone="sheet"
        pad={mobile ? "94px 0 60px" : "clamp(112px, 15vh, 150px) 0 clamp(72px, 10vh, 116px)"}
        style={{ overflow: "hidden" }}
      >
        {/* one soft field of light behind the device */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            right: mobile ? "50%" : "17%",
            top: mobile ? "auto" : "52%",
            bottom: mobile ? "8%" : "auto",
            transform: mobile ? "translateX(50%)" : "translate(50%, -50%)",
            width: "min(720px, 92vw)",
            height: "min(720px, 82vh)",
            background: "radial-gradient(closest-side, rgba(10,12,15,0.06), transparent 72%)",
            pointerEvents: "none",
          }}
        />
        <Wrap style={{ position: "relative" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: mobile ? "1fr" : "1.04fr 0.96fr",
              gap: mobile ? 44 : 56,
              alignItems: "center",
            }}
          >
            {/* the message */}
            <div style={{ textAlign: mobile ? "center" : "left" }}>
              <Reveal kind="eyebrow">
                <p className="mx-label" style={{ color: MX.emText, letterSpacing: "0.22em" }}>For junior mining companies</p>
              </Reveal>
              <Reveal kind="heading" delay={80}>
                <h1
                  className="mx-h1"
                  style={{
                    marginTop: 18,
                    maxWidth: "13ch",
                    marginInline: mobile ? "auto" : undefined,
                    fontSize: "clamp(34px, 4.7vw, 66px)",
                    textWrap: "balance",
                  }}
                >
                  The investor platform built for mining.
                </h1>
              </Reveal>
              <Reveal kind="copy" order={0}>
                <p className="mx-lead" style={{ color: MX.dim, marginTop: 20, maxWidth: "44ch", marginInline: mobile ? "auto" : undefined }}>
                  Turn investor interest into a lasting connection — with one profile that explains your company and keeps investors following your progress.
                </p>
              </Reveal>
              <Reveal kind="copy" order={1}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: mobile ? "center" : "flex-start", marginTop: 30 }}>
                  <Cta href="#demo" style={mobile ? { width: "min(340px, 100%)" } : undefined}>
                    Claim Your Company <ArrowRight size={17} />
                  </Cta>
                  <Cta href="#demo" kind="ghost" style={mobile ? { width: "min(340px, 100%)" } : undefined}>
                    Book a Demo
                  </Cta>
                </div>
              </Reveal>
            </div>

            {/* the product, fully in frame */}
            <Reveal kind="media" delay={200}>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <Phone
                  width={mobile ? "min(72vw, 288px)" : "min(31vw, 320px, 60vh)"}
                  style={{
                    // Translation only. Scaling a subtree this size on every scroll
                    // frame forces a re-raster of the whole phone; translating does not.
                    transform: `translate3d(0, ${mix(0, -22, Math.min(1, lift * 2)).toFixed(1)}px, 0)`,
                    willChange: "transform",
                  }}
                >
                  <Fit>
                    <ProfileScreen tab="overview" nav="explore" flip />
                  </Fit>
                </Phone>
              </div>
            </Reveal>
          </div>
        </Wrap>
      </Section>
    </div>
  );
}

/* ═══════════════════════════════════════════════ 2 · THE PROBLEM ══════════ */

// Scattered channel positions, in % of the stage. Desktop spreads them wide;
// mobile uses a tighter, taller field so nothing clips off the edge.
const SPREAD_D = [
  [16, 18], [74, 14], [24, 76], [84, 60], [12, 48], [58, 86], [70, 34], [42, 10],
];
const SPREAD_M = [
  [22, 12], [72, 20], [18, 44], [76, 46], [26, 72], [70, 74], [48, 30], [46, 90],
];

export function Problem() {
  const track = useRef(null);
  const p = useTrack(track, { reduceValue: 0.95 });   // reduced motion → the resolved frame
  const { mobile } = useViewport();
  const spread = mobile ? SPREAD_M : SPREAD_D;

  const arrive = ramp(p, 0.5, 0.82);   // the MineEx tile resolves
  // Hand the stacked "problem → answer" lines over without both sitting at ~50%
  // opacity at once (which reads as ghosted double text): the old line is gone
  // before the new one arrives, with only a hair of blank between them.
  const outO = 1 - win(arrive, 0, 0.46);
  const inO = win(arrive, 0.54, 1);

  // The field's pixel size, so chip travel can be expressed as a transform.
  const field = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    const read = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={track} className="mx-track" style={{ height: mobile ? "150vh" : "175vh", background: MX.sheetDeep }}>
      <div className="mx-stage" style={{ background: MX.sheetDeep }}>
        <Wrap style={{ width: "100%" }}>
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "minmax(0, 0.85fr) minmax(0, 1fr)", gap: mobile ? 28 : 56, alignItems: "center" }}>
            <div>
              <Eyebrow>The problem</Eyebrow>
              {/* the headline resolves with the field: the problem becomes the answer */}
              <div style={{ position: "relative", marginTop: 18 }}>
                <h2
                  className="mx-h2"
                  style={{ maxWidth: "15ch", opacity: outO, transform: `translateY(${mix(0, -10, arrive)}px)` }}
                >
                  Your story is spread across eight places at once.
                </h2>
                <h2
                  className="mx-h2"
                  style={{
                    position: "absolute", inset: 0, maxWidth: "15ch",
                    opacity: inO, transform: `translateY(${mix(14, 0, arrive)}px)`, pointerEvents: "none",
                  }}
                >
                  One place investors actually come back to.
                </h2>
              </div>
              <div style={{ position: "relative", marginTop: 20, minHeight: mobile ? 84 : 96 }}>
                <p
                  className="mx-lead"
                  style={{
                    color: MX.dim, maxWidth: "40ch",
                    opacity: outO,
                    transform: `translateY(${mix(0, -8, arrive)}px)`,
                  }}
                >
                  Investor attention is scattered across every channel you publish to — and nothing connects them.
                </p>
                <p
                  className="mx-lead"
                  style={{
                    position: "absolute", inset: 0,
                    color: MX.text, maxWidth: "40ch", fontWeight: 600,
                    opacity: inO,
                    transform: `translateY(${mix(12, 0, arrive)}px)`,
                    pointerEvents: "none",
                  }}
                >
                  MineEx replaces the scatter with one place investors can discover, understand and follow your company.
                </p>
              </div>
            </div>

            {/* the field */}
            <div ref={field} style={{ position: "relative", height: mobile ? "48vh" : "64vh" }}>
              {CHANNELS.map((c, i) => {
                const [x, y] = spread[i] || [50, 50];
                // each chip collapses on its own beat, so the group folds in rather
                // than snapping into a single unreadable pile
                const t = ramp(p, 0.06 + i * 0.022, 0.5 + i * 0.022);
                const gone = win(p, 0.30 + i * 0.02, 0.5 + i * 0.02);
                // Travel is a TRANSFORM, never left/top — animating position would
                // relayout the whole field on every scroll frame.
                // Drift halfway in, then dissolve — a full collapse to one point
                // just stacks eight pills on top of each other mid-scroll.
                const dx = ((50 - x) / 100) * box.w * t * 0.5;
                const dy = ((50 - y) / 100) * box.h * t * 0.5;
                return (
                  <span
                    key={c}
                    style={{
                      position: "absolute",
                      left: `${x}%`,
                      top: `${y}%`,
                      transform: `translate(-50%, -50%) translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0) scale(${mix(1, 0.88, t).toFixed(3)})`,
                      background: "#fff",
                      border: `1px solid ${MX.hair}`,
                      borderRadius: 999,
                      padding: mobile ? "8px 13px" : "10px 18px",
                      fontSize: mobile ? 12 : 14,
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      opacity: 1 - gone,
                      boxShadow: "0 14px 30px -20px rgba(4,8,14,0.4)",
                      willChange: "transform, opacity",
                    }}
                  >
                    {c}
                  </span>
                );
              })}

              {/* what they resolve into */}
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  transform: `translate(-50%, -50%) scale(${mix(0.88, 1, arrive)})`,
                  opacity: arrive,
                  background: MX.ink,
                  color: MX.onDark,
                  borderRadius: 24,
                  padding: mobile ? "22px 26px" : "32px 42px",
                  textAlign: "center",
                  boxShadow: "0 50px 90px -50px rgba(4,8,14,0.7)",
                  willChange: "transform, opacity",
                }}
              >
                <img src="/marketing/mineex-core.webp" alt="" width={22} height={64} style={{ width: mobile ? 19 : 22, height: mobile ? 55 : 64, margin: "0 auto" }} />
                <p style={{ fontSize: mobile ? 23 : 32, fontWeight: 700, letterSpacing: "-0.035em", marginTop: 14 }}>MineEx</p>
                <p style={{ fontSize: mobile ? 12.5 : 14.5, color: MX.onDarkMute, marginTop: 6 }}>One place. Every investor.</p>
              </div>
            </div>
          </div>
        </Wrap>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════ 3 · YOUR COMPANY ON MINEEX ════════ */

// The order follows how an investor actually learns a mining company:
// what is it → what does it own → what has it done → how is it funded →
// who runs it → show me more. Each beat leads with the BENEFIT (head); the
// phone provides the evidence; `line` is the short supporting explanation.
const PROFILE_BEATS = [
  { tab: "overview", label: "Overview", head: "Understand your company in seconds.", line: "The essentials, up front. What you do, where you operate, what you own and what matters now." },
  { tab: "projects", label: "Projects", head: "Put your projects on display.", line: "Showcase every project with the imagery, details and context investors need to understand the opportunity." },
  { tab: "timeline", label: "Your progress", head: "Turn your news into a story.", line: "Press releases summarised, organised and put into context — so investors can see what happened, why it mattered and how you've progressed.", detail: "Filter by importance, year or quarter." },
  { tab: "capital", label: "Capital", head: "Make the numbers easy to understand.", line: "Capital structure, listings, financings and funding position — clearly presented in one place." },
  { tab: "team", label: "Leadership", head: "Show investors who's behind it.", line: "Put your leadership front and centre — the people, experience and track record driving the company forward." },
  { tab: "media", label: "Media", head: "Bring your company to life.", line: "Turn your photos, videos and interviews into an investor-facing media library that shows the company beyond the numbers." },
];

export function CompanyProfileSection() {
  const track = useRef(null);
  const p = useTrack(track);
  const { mobile } = useViewport();
  const reduce = useReduce();
  const i = reduce ? 0 : step(p, PROFILE_BEATS.length);
  const beat = PROFILE_BEATS[i];
  // Signature moment: the profile resolves into place as the section pins —
  // slightly oversized + soft, settling to its final interface. Pure transform/
  // opacity, scrubbed to scroll progress, so it reverses precisely with the finger.
  const settle = reduce ? 1 : ramp(p, 0.0, 0.11);

  return (
    <div ref={track} className="mx-track" style={{ height: `${PROFILE_BEATS.length * 44}vh`, background: MX.sheet }}>
      <div className="mx-stage" style={{ background: MX.sheet }}>
        <Wrap style={{ width: "100%" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: mobile ? "1fr" : "minmax(0, 1fr) auto",
              gap: mobile ? 22 : 70,
              alignItems: "center",
            }}
          >
            <div style={{ order: mobile ? 2 : 1, textAlign: mobile ? "center" : "left" }}>
              <Eyebrow>Your Pro Profile</Eyebrow>
              <h2 className="mx-h2" style={{ marginTop: 16, maxWidth: "14ch", marginInline: mobile ? "auto" : undefined }}>
                Everything an investor needs. One profile.
              </h2>
              <p className="mx-lead" style={{ color: MX.dim, marginTop: 14, maxWidth: "40ch", marginInline: mobile ? "auto" : undefined }}>
                Your company, simplified for investors — from your projects and progress to your capital, leadership and media.
              </p>

              {/* the beat rail — one line at a time, cross-faded. With reduced motion
                  there is no sequence to watch, so every beat is simply listed. */}
              {reduce ? (
                <div style={{ marginTop: 26, display: "grid", gap: 20, textAlign: "left" }}>
                  {PROFILE_BEATS.map((b) => (
                    <div key={b.tab}>
                      <p className="mx-label" style={{ color: MX.emText }}>{b.label}</p>
                      <h3 className="mx-h3" style={{ marginTop: 6 }}>{b.head}</h3>
                      <p className="mx-body" style={{ color: MX.dim, marginTop: 5, maxWidth: "42ch" }}>{b.line}</p>
                      {b.detail && <p className="mx-body" style={{ color: MX.mute, marginTop: 4, fontSize: 13 }}>{b.detail}</p>}
                    </div>
                  ))}
                </div>
              ) : (
              <div style={{ marginTop: mobile ? 18 : 30, minHeight: mobile ? 150 : 196, position: "relative" }}>
                {PROFILE_BEATS.map((b, n) => (
                  <div
                    key={b.tab}
                    style={{
                      position: n === 0 ? "relative" : "absolute",
                      inset: n === 0 ? undefined : 0,
                      opacity: n === i ? 1 : 0,
                      transform: n === i ? "none" : "translateY(10px)",
                      transition: `opacity 420ms ${EASE}, transform 420ms ${EASE}`,
                      pointerEvents: "none",
                    }}
                  >
                    <p className="mx-label" style={{ color: MX.emText }}>{b.label}</p>
                    <h3 className="mx-h3" style={{ marginTop: 9, maxWidth: "15ch", marginInline: mobile ? "auto" : undefined }}>{b.head}</h3>
                    <p className="mx-body" style={{ color: MX.dim, marginTop: 9, maxWidth: "38ch", marginInline: mobile ? "auto" : undefined }}>{b.line}</p>
                    {b.detail && <p className="mx-body" style={{ color: MX.mute, marginTop: 7, fontSize: 13, marginInline: mobile ? "auto" : undefined }}>{b.detail}</p>}
                  </div>
                ))}
              </div>

              )}

              {/* progress rail mirrors the profile's own tab bar */}
              <div style={{ display: reduce ? "none" : "flex", gap: 8, marginTop: mobile ? 18 : 30, justifyContent: mobile ? "center" : "flex-start" }}>
                {PROFILE_BEATS.map((b, n) => (
                  <span
                    key={b.tab}
                    style={{
                      height: 3,
                      width: n === i ? 34 : 18,
                      borderRadius: 3,
                      background: n === i ? "var(--mx-accent-ink)" : "rgba(18,22,29,0.16)",
                      transition: `width 420ms ${EASE}, background 420ms ${EASE}`,
                    }}
                  />
                ))}
              </div>
            </div>

            <div style={{ order: mobile ? 1 : 2, display: "flex", justifyContent: "center" }}>
              <div style={{ transform: `scale(${mix(1.06, 1, settle).toFixed(3)}) translate3d(0, ${mix(22, 0, settle).toFixed(1)}px, 0)`, opacity: mix(0.35, 1, settle), willChange: "transform, opacity" }}>
                <Phone width={phoneWidth(mobile)}>
                  <AppShot name={beat.tab} />
                </Phone>
              </div>
            </div>
          </div>
        </Wrap>
      </div>
    </div>
  );
}
