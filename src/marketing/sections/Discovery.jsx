// Sections 4–6: discovery, the follow moment, and what following turns into.
import React, { useRef, useState, useCallback, useMemo } from "react";
import { Radio, ArrowRight, ArrowDown } from "lucide-react";
import {
  MX, EASE, Section, Wrap, Reveal, Eyebrow, Cta, Phone,
  useTrack, useViewport, useReduce, ramp, win, mix, phoneWidth,
} from "../system.jsx";
import {
  Fit, ExploreScreen, FeedScreen, ProfileScreen, FollowButton, PushNotification, AppShot,
} from "../ui/AppUI.jsx";
import { DIRECTORY, CO, RELEASES, IMG } from "../data.js";

/* ═══════════════════════════════════════════ 4 · GET DISCOVERED ══════════ */

const STEPS = [
  { at: 0.16, set: "commodity", value: "Silver", test: (c) => /silver/i.test(c.commodity) },
  { at: 0.40, set: "location", value: "Mexico", test: (c) => /mexico/i.test(c.region) },
  { at: 0.62, set: "stage", value: "Explorer", test: (c) => /explor/i.test(c.stage) },
];

export function Discovered() {
  const track = useRef(null);
  const p = useTrack(track, { reduceValue: 0.9 });
  const { mobile } = useViewport();

  // Derive from a COUNT, not from `p`, and memoise on it: the phone screen is
  // memoised, so it only re-renders on the three frames where a filter lands.
  const n = STEPS.reduce((acc, s) => (p >= s.at ? acc + 1 : acc), 0);
  const { results, filters } = useMemo(() => {
    const active = STEPS.slice(0, n);
    return {
      results: DIRECTORY.filter((c) => active.every((s) => s.test(c))),
      filters: active.map((s) => ({ set: s.set, value: s.value })),
    };
  }, [n]);

  return (
    <div ref={track} className="mx-track" style={{ height: "160vh", background: MX.paper }}>
      <div className="mx-stage" style={{ background: MX.paper }}>
        <Wrap style={{ width: "100%" }}>
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "minmax(0, 1fr) auto", gap: mobile ? 24 : 70, alignItems: "center" }}>
            <div style={{ order: mobile ? 2 : 1, textAlign: mobile ? "center" : "left" }}>
              <Eyebrow>Get discovered</Eyebrow>
              <h2 className="mx-h2" style={{ marginTop: 16, maxWidth: "13ch", marginInline: mobile ? "auto" : undefined }}>
                Investors search. You show up.
              </h2>
              <p className="mx-lead" style={{ color: MX.dim, marginTop: 18, maxWidth: "38ch", marginInline: mobile ? "auto" : undefined }}>
                MineEx doesn't just host your information. Investors filter the market by what they actually care about — and your company
                appears because it matches.
              </p>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 9, marginTop: mobile ? 20 : 30, justifyContent: mobile ? "center" : "flex-start" }}>
                {STEPS.map((s, n) => {
                  const on = p >= s.at;
                  return (
                    <span
                      key={s.value}
                      style={{
                        borderRadius: 999,
                        padding: "9px 15px",
                        fontSize: 13.5,
                        fontWeight: 700,
                        border: `1px solid ${on ? "var(--mx-accent)" : "rgba(18,22,29,0.14)"}`,
                        background: on ? "var(--mx-accent)" : "transparent",
                        color: on ? MX.ink : MX.mute,
                        transition: `all 460ms ${EASE} ${n * 40}ms`,
                      }}
                    >
                      {s.value}
                    </span>
                  );
                })}
              </div>
              <p className="mx-body" style={{ color: MX.mute, marginTop: 16 }}>
                <span className="mx-num">{results.length}</span> {results.length === 1 ? "match" : "matches"} · filters run against every published listing
              </p>
            </div>

            <div style={{ order: mobile ? 1 : 2, display: "flex", justifyContent: "center" }}>
              <Phone width={phoneWidth(mobile)}>
                <AppShot name="explore" />
              </Phone>
            </div>
          </div>
        </Wrap>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════ 5 · THE FOLLOW ═══════════ */

export function FollowMoment() {
  const track = useRef(null);
  const p = useTrack(track, { reduceValue: 0.8 });
  const { mobile } = useViewport();
  const reduce = useReduce();
  const [manual, setManual] = useState(null);           // a visitor tap overrides scroll
  const auto = p >= 0.5;
  const following = manual == null ? auto : manual;
  const confirm = following ? 1 : 0;
  const toggle = useCallback(() => setManual((m) => !(m == null ? auto : m)), [auto]);

  return (
    <div ref={track} className="mx-track" style={{ height: "120vh", background: MX.ink }}>
      <div className="mx-stage" style={{ background: MX.ink, color: MX.onDark }}>
        <div
          aria-hidden
          style={{
            position: "absolute", left: "50%", top: "50%", width: "min(900px, 120vw)", height: "min(900px, 120vw)",
            transform: "translate(-50%, -50%)",
            background: `radial-gradient(closest-side, rgba(255,255,255,${following ? 0.1 : 0.04}), transparent 70%)`,
            transition: `background 900ms ${EASE}`, pointerEvents: "none",
          }}
        />
        <Wrap style={{ width: "100%", position: "relative" }}>
          <div style={{ textAlign: "center" }}>
            <Eyebrow color={MX.onDarkMute}>Turn discovery into followers</Eyebrow>
            <h2 className="mx-h2" style={{ marginTop: 16, marginInline: "auto", maxWidth: "14ch" }}>
              Discovery becomes an audience.
            </h2>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: mobile ? "column" : "row",
              alignItems: "center",
              justifyContent: "center",
              gap: mobile ? 22 : 54,
              marginTop: mobile ? 26 : 44,
            }}
          >
            <div style={{ position: "relative" }}>
              {!reduce && following && (
                <span
                  aria-hidden
                  className="mx-pulse"
                  style={{
                    position: "absolute", left: "50%", top: "26%", width: 90, height: 90, marginLeft: -45,
                    borderRadius: 999, border: "2px solid rgba(255,255,255,0.5)", pointerEvents: "none",
                  }}
                />
              )}
              <Phone width={phoneWidth(mobile)}>
                <AppShot name="overview" />
              </Phone>
            </div>

            <div style={{ maxWidth: mobile ? "100%" : 380, textAlign: mobile ? "center" : "left" }}>
              <div
                style={{
                  border: `1px solid ${MX.hairDark}`,
                  borderRadius: 20,
                  padding: mobile ? "18px 20px" : "24px 26px",
                  background: "rgba(255,255,255,0.03)",
                  opacity: mix(0.35, 1, confirm),
                  transform: `translateY(${mix(10, 0, confirm)}px)`,
                  transition: `opacity 600ms ${EASE}, transform 600ms ${EASE}`,
                }}
              >
                <FollowButton following={following} onToggle={toggle} big />
                <p className="mx-lead" style={{ color: MX.onDarkDim, marginTop: 18 }}>
                  {following
                    ? "That investor now receives every update this company publishes — indefinitely, without another ad, email list or introduction."
                    : "One tap is all it takes."}
                </p>
              </div>
              <p className="mx-body" style={{ color: MX.onDarkMute, marginTop: 14 }}>
                Tap it — this is the real control.
              </p>
            </div>
          </div>
        </Wrap>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════ 6 · KEEP INVESTORS INFORMED ═══════ */

export function StayInformed() {
  const track = useRef(null);
  const p = useTrack(track, { reduceValue: 0.78 });
  const { mobile } = useViewport();

  const publish = ramp(p, 0.10, 0.34);
  const travel = ramp(p, 0.30, 0.56);
  const cards = p < 0.42 ? 0 : p < 0.56 ? 1 : p < 0.70 ? 2 : 4;
  const notif = p >= 0.46 && p < 0.86;

  return (
    <div ref={track} className="mx-track" style={{ height: "150vh", background: MX.sheet }}>
      <div className="mx-stage" style={{ background: MX.sheet }}>
        <Wrap style={{ width: "100%" }}>
          <div style={{ textAlign: mobile ? "center" : "left", maxWidth: 620 }}>
            <Eyebrow>Keep investors informed</Eyebrow>
            <h2 className="mx-h2" style={{ marginTop: 16, maxWidth: "16ch", marginInline: mobile ? "auto" : undefined }}>
              Stay in front of the investors who chose to follow you.
            </h2>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: mobile ? "1fr" : "minmax(0, 1fr) 90px auto",
              alignItems: "center",
              gap: mobile ? 18 : 30,
              marginTop: mobile ? 26 : 44,
            }}
          >
            {/* the company publishes */}
            <div style={{ order: 1 }}>
              <div
                style={{
                  background: "#fff",
                  border: `1px solid ${MX.hair}`,
                  borderRadius: 20,
                  padding: mobile ? 16 : 22,
                  maxWidth: mobile ? "100%" : 420,
                  marginInline: mobile ? "auto" : undefined,
                  boxShadow: "0 30px 60px -46px rgba(4,8,14,0.4)",
                  opacity: mix(0.4, 1, publish),
                  transform: `translateY(${mix(12, 0, publish)}px)`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <span style={{ width: 28, height: 28, borderRadius: 9, background: MX.emSoft, display: "grid", placeItems: "center" }}>
                    <Radio size={14} color={MX.text} />
                  </span>
                  <span className="mx-label" style={{ color: MX.mute, letterSpacing: "0.12em" }}>Company publishes</span>
                  <span
                    style={{
                      marginLeft: "auto", borderRadius: 999, padding: "4px 10px", fontSize: 11, fontWeight: 800,
                      background: publish > 0.7 ? MX.emSoft : "#f1f5f9",
                      color: publish > 0.7 ? MX.text : MX.mute,
                      transition: `all 400ms ${EASE}`,
                    }}
                  >
                    {publish > 0.7 ? "PUBLISHED" : "DRAFT"}
                  </span>
                </div>
                <p style={{ fontSize: mobile ? 16 : 18, fontWeight: 700, letterSpacing: "-0.025em", marginTop: 14, lineHeight: 1.25 }}>
                  {RELEASES[0].label}
                </p>
                <p className="mx-body" style={{ color: MX.dim, marginTop: 8 }}>{RELEASES[0].why}</p>
              </div>
              <p className="mx-body" style={{ color: MX.mute, marginTop: 16, maxWidth: 420, marginInline: mobile ? "auto" : undefined, textAlign: mobile ? "center" : "left" }}>
                You publish once. Every follower receives it — in their feed and, if they've allowed it, as a notification.
              </p>
            </div>

            {/* the connection */}
            <div style={{ order: 2, display: "grid", placeItems: "center" }}>
              <span style={{ position: "relative", display: "grid", placeItems: "center", width: mobile ? 40 : 80, height: mobile ? 40 : 80 }}>
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    width: mobile ? 2 : "100%",
                    height: mobile ? "100%" : 2,
                    background: `linear-gradient(${mobile ? "180deg" : "90deg"}, ${MX.hair}, ${MX.em})`,
                    transform: mobile ? `scaleY(${travel})` : `scaleX(${travel})`,
                    transformOrigin: mobile ? "top" : "left",
                  }}
                />
                {mobile ? (
                  <ArrowDown size={18} color={MX.em} style={{ opacity: travel, position: "relative" }} />
                ) : (
                  <ArrowRight size={20} color={MX.em} style={{ opacity: travel, position: "relative" }} />
                )}
              </span>
            </div>

            {/* the follower's phone */}
            <div style={{ order: 3, display: "flex", justifyContent: "center", position: "relative" }}>
              <div style={{ position: "relative" }}>
                <div
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: mobile ? -34 : -46,
                    transform: "translateX(-50%)",
                    width: mobile ? "min(66vw, 262px)" : "min(28vw, 312px)",
                    zIndex: 4,
                  }}
                >
                  <PushNotification shown={notif} />
                </div>
                <Phone width={phoneWidth(mobile)}>
                  <AppShot name="feed" />
                </Phone>
              </div>
            </div>
          </div>
        </Wrap>
      </div>
    </div>
  );
}
