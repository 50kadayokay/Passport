// Sections 1–3: the opening reveal — hero, the fragmentation problem, and the
// company profile itself.
import React, { useRef, useState, useLayoutEffect } from "react";
import { ArrowRight } from "lucide-react";
import {
  MX, EASE, Section, Wrap, Eyebrow, Cta, Phone,
  useTrack, useViewport, useReduce, ramp, win, mix, phoneWidth,
} from "../system.jsx";
import { Fit, AppShot, AiBriefSheet } from "../ui/AppUI.jsx";
import { CHANNELS } from "../data.js";

/* ══════════════════════════════════════════════ 1 · HERO — LIVE DEMO ═══════
   The opening is a single pinned scene: the phone stays anchored on the right
   while an investor "uses" the real MineEx profile inside it — AI Brief opens,
   then the navigation walks Projects → Progress → Capital → Leadership → Media.
   Everything is driven by scroll progress `p`, so it scrubs and reverses with
   the finger; nothing plays on its own. The old separate profile walkthrough is
   gone — this scene explains what a Pro Profile is, then the page moves on to
   Discovery. */

const HERO_BEATS = [
  { key: "hero",       label: "For mining companies", head: "The investor platform built for mining.",   body: "Turn investor interest into a lasting connection — with one profile that explains your company and keeps investors following your progress.", tab: "overview", cta: "hero" },
  { key: "brief",      label: "Understand",           head: "Get investors up to speed. Fast.",           body: "MineEx turns your company information into a concise investor brief — giving investors a faster way to understand your projects, progress and opportunity.", tab: "overview" },
  { key: "projects",   label: "Projects",             head: "Put your projects on display.",              body: "Showcase every project with the imagery, details and context investors need to understand what you're building.", tab: "projects" },
  { key: "progress",   label: "Progress",             head: "Turn your news into a story.",               body: "Press releases and milestones, summarized and organized so investors can see what happened, why it mattered and how you've progressed.", tab: "timeline" },
  { key: "capital",    label: "Capital",              head: "Make the numbers easy to understand.",       body: "Capital structure, listings, financings and funding position — clearly presented in one place.", tab: "capital" },
  { key: "leadership", label: "Leadership",           head: "Show investors who's behind it.",            body: "Put your team, experience and track record front and centre.", tab: "team" },
  { key: "media",      label: "Media",                head: "Bring your company to life.",                body: "Photos, videos, interviews and project footage — all part of the investor experience.", tab: "media" },
  { key: "resolve",    label: "Your Pro Profile",     head: "Everything an investor needs. One place.",   body: "Give investors a clearer way to understand your company — and a reason to keep following as your story develops.", tab: "media", cta: "resolve" },
];

// Per-beat pinned scroll distance, in vh. Distance is what makes a deliberate
// swipe land on the next section instead of one flick clearing the whole scene —
// there is no snapping, just enough room that fast and slow both read. The
// AI-Brief beat is by far the longest because a full interaction unfolds inside
// it: the card presses, the sheet opens, the reader scrubs through it, it closes.
const BEAT_VH = [40, 96, 56, 58, 48, 48, 64, 40];
const BEAT_TOTAL = BEAT_VH.reduce((a, b) => a + b, 0);
const BEAT_FRAC = (() => { const out = []; let acc = 0; for (const v of BEAT_VH) { out.push(acc / BEAT_TOTAL); acc += v; } out.push(1); return out; })();
const HERO_TABS = ["overview", "overview", "projects", "timeline", "capital", "team", "media", "media"];
const HERO_AREAS = ["overview", "projects", "timeline", "capital", "team", "media"];

const heroBeatIndex = (p) => { let i = 0; for (let n = 1; n < BEAT_VH.length; n++) { if (p >= BEAT_FRAC[n]) i = n; else break; } return i; };
const beatLocal = (p, i) => { const a = BEAT_FRAC[i], b = BEAT_FRAC[i + 1]; return Math.max(0, Math.min(1, (p - a) / ((b - a) || 1))); };
const HERO_HEAD = { fontSize: "clamp(30px, 4vw, 56px)", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.05 };

function HeroCta({ kind }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 28 }}>
      <Cta href="#demo">Claim Your Company <ArrowRight size={17} /></Cta>
      {kind === "hero" && <Cta href="#demo" kind="ghost">Book a Demo</Cta>}
    </div>
  );
}

export function Hero() {
  const track = useRef(null);
  const p = useTrack(track, { reduceValue: 0 });
  const { mobile } = useViewport();
  const reduce = useReduce();

  if (reduce) return <HeroStatic />;
  if (mobile) return <HeroMobile />;

  const beat = heroBeatIndex(p);
  const tab = HERO_TABS[beat];
  // AI-Brief sub-phases, all inside its own (long) beat so each has room to read:
  // press the card → open the sheet → scrub through the content → let it recede.
  const bl = beat === 1 ? beatLocal(p, 1) : 0;
  const briefPress = beat === 1 && bl > 0.03 && bl < 0.97;
  const briefOpen = beat === 1 ? Math.max(0, Math.min(ramp(bl, 0.12, 0.34), 1 - ramp(bl, 0.86, 1.0))) : 0;
  const briefScroll = beat === 1 ? ramp(bl, 0.40, 0.82) : 0;
  const litArea = HERO_AREAS.indexOf(tab);

  return (
    <div ref={track} className="mx-track" style={{ height: `${BEAT_TOTAL + 100}vh`, background: MX.sheet }}>
      <div className="mx-stage" style={{ background: MX.sheet }}>
        {/* one soft field of light behind the device — unchanged from the old hero */}
        <div aria-hidden style={{ position: "absolute", right: "17%", top: "52%", transform: "translate(50%, -50%)", width: "min(720px, 92vw)", height: "min(720px, 82vh)", background: "radial-gradient(closest-side, rgba(10,12,15,0.06), transparent 72%)", pointerEvents: "none" }} />
        <Wrap style={{ width: "100%", position: "relative" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.04fr 0.96fr", gap: 56, alignItems: "center" }}>

            {/* LEFT — copy. Label / headline / body hold the same position; only the
                content cross-fades, so the eye rests while the phone does the work. */}
            <div>
              <div style={{ position: "relative" }}>
                {HERO_BEATS.map((b, n) => {
                  const on = n === beat;
                  return (
                    <div key={b.key} style={{ position: n === 0 ? "relative" : "absolute", inset: n === 0 ? undefined : 0, top: 0, opacity: on ? 1 : 0, transform: on ? "none" : "translateY(7px)", transition: `opacity 300ms ${EASE}, transform 300ms ${EASE}`, pointerEvents: on ? "auto" : "none" }}>
                      <p className="mx-label" style={{ color: MX.emText, letterSpacing: "0.22em" }}>{b.label}</p>
                      <h1 style={{ ...HERO_HEAD, marginTop: 16, maxWidth: "15ch", textWrap: "balance" }}>{b.head}</h1>
                      <p className="mx-lead" style={{ color: MX.dim, marginTop: 18, maxWidth: "42ch" }}>{b.body}</p>
                      {b.cta && <HeroCta kind={b.cta} />}
                    </div>
                  );
                })}
              </div>

              {/* restrained progress rail — sits below the copy, clear of the CTAs,
                  and stays put across beats (only the lit segment moves) */}
              <div style={{ display: "flex", gap: 8, marginTop: 30 }}>
                {HERO_AREAS.map((_, n) => (
                  <span key={n} style={{ height: 3, width: n === litArea ? 30 : 16, borderRadius: 3, background: n === litArea ? MX.ink : "rgba(18,22,29,0.16)", transition: `width 340ms ${EASE}, background 340ms ${EASE}` }} />
                ))}
              </div>
            </div>

            {/* RIGHT — the phone. Anchored. Real captured app screens swap inside it
                (exact match, no live re-render = no scroll cost); the AI Brief sheet
                animates live on top of the overview. */}
            <div style={{ display: "flex", justifyContent: "center" }}>
              <Phone width={phoneWidth(mobile)}>
                {HERO_AREAS.map((s) => (
                  <div key={s} aria-hidden={s !== tab} style={{ position: "absolute", inset: 0, opacity: s === tab ? 1 : 0, transition: `opacity 300ms ${EASE}`, willChange: "opacity" }}>
                    <AppShot name={s} />
                  </div>
                ))}
                {beat === 1 && (
                  <Fit>
                    <div style={{ position: "relative", width: 375, height: 804 }}>
                      {/* press cue on the real AI-Brief card before the sheet covers it */}
                      {briefPress && briefOpen < 0.55 && (
                        <div aria-hidden style={{ position: "absolute", left: 13, right: 13, bottom: 74, height: 132, borderRadius: 24, boxShadow: "0 0 0 3px rgba(255,255,255,0.8), 0 12px 30px -6px rgba(37,99,235,0.6)", transform: "scale(0.965)" }} />
                      )}
                      <AiBriefSheet p={briefOpen} scroll={briefScroll} />
                    </div>
                  </Fit>
                )}
              </Phone>
            </div>
          </div>
        </Wrap>
      </div>
    </div>
  );
}

/* Mobile — no pinned trap. The same story told as a short vertical sequence:
   copy, then the product state it describes, repeated. Each phone is a static
   real screen at the right tab (AI Brief shown open for its beat). */
function HeroMobile() {
  return (
    <Section tone="sheet" pad="88px 0 40px">
      <Wrap>
        <div style={{ display: "grid", gap: 64 }}>
          {HERO_BEATS.filter((b) => b.key !== "resolve").map((b) => (
            <div key={b.key} style={{ textAlign: "center" }}>
              <p className="mx-label" style={{ color: MX.emText, letterSpacing: "0.22em" }}>{b.label}</p>
              <h2 style={{ ...HERO_HEAD, marginTop: 14, marginInline: "auto", maxWidth: "16ch", textWrap: "balance" }}>{b.head}</h2>
              <p className="mx-lead" style={{ color: MX.dim, marginTop: 16, maxWidth: "40ch", marginInline: "auto" }}>{b.body}</p>
              {b.cta === "hero" && <div style={{ display: "flex", justifyContent: "center" }}><HeroCta kind="hero" /></div>}
              <div style={{ display: "flex", justifyContent: "center", marginTop: 26 }}>
                <Phone width="min(72vw, 288px)">
                  <AppShot name={b.tab} />
                  {b.key === "brief" && (
                    <Fit>
                      <div style={{ position: "relative", width: 375, height: 804 }}>
                        <AiBriefSheet p={1} scroll={0} />
                      </div>
                    </Fit>
                  )}
                </Phone>
              </div>
            </div>
          ))}
          {/* resolution */}
          <div style={{ textAlign: "center" }}>
            <p className="mx-label" style={{ color: MX.emText, letterSpacing: "0.22em" }}>Your Pro Profile</p>
            <h2 style={{ ...HERO_HEAD, marginTop: 14, marginInline: "auto", maxWidth: "16ch", textWrap: "balance" }}>Everything an investor needs. One place.</h2>
            <p className="mx-lead" style={{ color: MX.dim, marginTop: 16, maxWidth: "40ch", marginInline: "auto" }}>Give investors a clearer way to understand your company — and a reason to keep following as your story develops.</p>
            <div style={{ display: "flex", justifyContent: "center" }}><HeroCta kind="resolve" /></div>
          </div>
        </div>
      </Wrap>
    </Section>
  );
}

/* Reduced motion — everything readable, nothing animated. The hero, one calm
   phone on the overview, then the six capabilities listed plainly. */
function HeroStatic() {
  return (
    <Section tone="sheet" pad="96px 0 56px">
      <Wrap>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 40 }}>
          <div>
            <p className="mx-label" style={{ color: MX.emText, letterSpacing: "0.22em" }}>For mining companies</p>
            <h1 style={{ ...HERO_HEAD, marginTop: 16, maxWidth: "16ch" }}>The investor platform built for mining.</h1>
            <p className="mx-lead" style={{ color: MX.dim, marginTop: 18, maxWidth: "44ch" }}>Turn investor interest into a lasting connection — with one profile that explains your company and keeps investors following your progress.</p>
            <HeroCta kind="hero" />
          </div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <Phone width={"min(72vw, 300px)"}><AppShot name="overview" /></Phone>
          </div>
          <div style={{ display: "grid", gap: 22 }}>
            {HERO_BEATS.slice(1).map((b) => (
              <div key={b.key}>
                <p className="mx-label" style={{ color: MX.emText }}>{b.label}</p>
                <p className="mx-h3" style={{ marginTop: 6 }}>{b.head}</p>
                <p className="mx-body" style={{ color: MX.dim, marginTop: 5, maxWidth: "46ch" }}>{b.body}</p>
              </div>
            ))}
          </div>
        </div>
      </Wrap>
    </Section>
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
