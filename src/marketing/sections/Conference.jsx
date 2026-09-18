// Sections 11–12: Conference Mode, and the booth-to-audience handoff.
import React, { useRef, useMemo } from "react";
import { QrCode as QrIcon, Smartphone, ScanLine, UserPlus, Bell } from "lucide-react";
import {
  MX, EASE, Wrap, Reveal, Eyebrow, Phone, Tablet,
  useTrack, useViewport, useReduce, ramp, win, step, mix,
} from "../system.jsx";
import { BoothDeck, QrCode } from "../ui/BoothUI.jsx";
import { Fit, ProfileScreen } from "../ui/AppUI.jsx";

const BOOTH_BEATS = [
  { kicker: "Conference Mode", line: "Your booth, presenting itself." },
  { kicker: "One device", line: "The whole story, on one iPad." },
  { kicker: "The handoff", line: "And a way to take it home." },
];

/* ═══════════════════════════════════════════ 11 · CONFERENCE MODE ════════ */

export function ConferenceMode() {
  const track = useRef(null);
  const p = useTrack(track);
  const { mobile } = useViewport();
  const reduce = useReduce();
  const i = reduce ? 0 : step(p, BOOTH_BEATS.length);
  const enter = reduce ? 1 : ramp(p, 0.0, 0.18);

  // Stable element identity, so the memoised booth deck isn't re-rendered on every
  // scroll frame just because this prop was rebuilt.
  const phone = useMemo(
    () =>
      mobile ? null : (
        <Phone width="clamp(96px, 17cqw, 190px)" shadow={false} glare={false}>
          <Fit>
            <ProfileScreen tab="overview" nav="explore" following />
          </Fit>
        </Phone>
      ),
    [mobile]
  );

  return (
    <div ref={track} className="mx-track" style={{ height: mobile ? "260vh" : "300vh", background: MX.ink }}>
      <div className="mx-stage" style={{ background: MX.ink, color: MX.onDark, flexDirection: "column", justifyContent: "center" }}>
        {/* room light */}
        <div
          aria-hidden
          style={{
            position: "absolute", left: "50%", top: "36%", width: "min(1400px, 150vw)", height: "min(1000px, 100vh)",
            transform: "translate(-50%, -50%)",
            background: "radial-gradient(closest-side, rgba(255,255,255,0.055), transparent 70%)", pointerEvents: "none",
          }}
        />
        <Wrap style={{ width: "100%", position: "relative", textAlign: "center" }}>
          {reduce ? (
            <div>
              <p className="mx-label" style={{ color: MX.onDarkMute, letterSpacing: "0.22em" }}>Conference Mode</p>
              <h2 className="mx-h2" style={{ marginTop: 14, marginInline: "auto", maxWidth: "16ch" }}>
                Your booth, presenting itself.
              </h2>
              <p className="mx-lead" style={{ color: MX.onDarkDim, margin: "18px auto 0", maxWidth: "46ch" }}>
                The whole story on one iPad — and a way for a visitor to take it home.
              </p>
            </div>
          ) : (
          <div style={{ minHeight: mobile ? 96 : 132, position: "relative" }}>
            {BOOTH_BEATS.map((b, n) => (
              <div
                key={b.line}
                style={{
                  position: n === 0 ? "relative" : "absolute",
                  inset: n === 0 ? undefined : 0,
                  opacity: n === i ? 1 : 0,
                  transform: n === i ? "none" : "translateY(12px)",
                  transition: `opacity 520ms ${EASE}, transform 520ms ${EASE}`,
                }}
              >
                <p className="mx-label" style={{ color: MX.onDarkMute, letterSpacing: "0.22em" }}>{b.kicker}</p>
                <h2 className="mx-h2" style={{ marginTop: 14, marginInline: "auto", maxWidth: "14ch" }}>{b.line}</h2>
              </div>
            ))}
          </div>
          )}

          {/* the booth device */}
          <div
            style={{
              position: "relative",
              margin: "0 auto",
              marginTop: mobile ? 26 : 42,
              width: mobile ? "min(92vw, 520px)" : "min(70vw, 820px, 72vh)",
              opacity: enter,
              transform: `translate3d(0, ${mix(30, 0, enter).toFixed(1)}px, 0)`,
              willChange: "transform, opacity",
            }}
          >
            <Tablet>
              <BoothDeck scene={i} phone={phone} />
            </Tablet>
            {/* booth surface + reflection */}
            <div
              aria-hidden
              style={{
                height: mobile ? 40 : 70,
                marginTop: 2,
                background: "linear-gradient(rgba(255,255,255,0.055), rgba(255,255,255,0))",
                borderRadius: "0 0 40px 40px / 0 0 100px 100px",
                filter: "blur(1px)",
              }}
            />
          </div>

          <p className="mx-body" style={{ color: MX.onDarkMute, marginTop: mobile ? 6 : 4 }}>
            Conference Mode runs offline on a booth iPad, and updates itself between shows.
          </p>
        </Wrap>
      </div>
    </div>
  );
}

/* ═════════════════════════════════ 12 · BOOTH TRAFFIC → AUDIENCE ═════════ */

const FLOW = [
  { Icon: Smartphone, label: "Visits your booth", note: "A conversation starts." },
  { Icon: QrIcon, label: "Sees the story", note: "Conference Mode does the presenting." },
  { Icon: ScanLine, label: "Scans the QR", note: "No app store, no form." },
  { Icon: UserPlus, label: "Opens your profile", note: "The full company, in their hand." },
  { Icon: Bell, label: "Follows you", note: "And keeps hearing from you." },
];

export function BoothToAudience() {
  const track = useRef(null);
  const p = useTrack(track, { reduceValue: 1 });
  const { mobile } = useViewport();
  const reduce = useReduce();
  const reached = (n) => p >= 0.1 + n * 0.15;

  return (
    <div ref={track} className="mx-track" style={{ height: mobile ? "170vh" : "185vh", background: MX.inkSoft }}>
      <div className="mx-stage" style={{ background: MX.inkSoft, color: MX.onDark }}>
        <Wrap style={{ width: "100%" }}>
          <div style={{ textAlign: "center", maxWidth: 680, margin: "0 auto" }}>
            <Eyebrow color={MX.onDarkMute}>From booth to audience</Eyebrow>
            <h2 className="mx-h2" style={{ marginTop: 16, marginInline: "auto", maxWidth: "17ch" }}>
              The relationship shouldn't end when they leave your booth.
            </h2>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: mobile ? "auto 1fr" : "repeat(5, minmax(0, 1fr))",
              gap: mobile ? "0 18px" : 18,
              marginTop: mobile ? 32 : 54,
              position: "relative",
            }}
          >
            {FLOW.map(({ Icon, label, note }, n) => {
              const on = reached(n);
              return (
                <React.Fragment key={label}>
                  <div style={{ display: "flex", flexDirection: mobile ? "column" : "row", alignItems: "center", gridColumn: mobile ? 1 : "auto" }}>
                    <span
                      style={{
                        width: mobile ? 42 : 52, height: mobile ? 42 : 52, borderRadius: 999,
                        display: "grid", placeItems: "center", flex: "0 0 auto",
                        border: `1px solid ${on ? MX.emDark : MX.hairDark}`,
                        background: on ? "rgba(255,255,255,0.09)" : "transparent",
                        color: on ? MX.emDark : MX.onDarkMute,
                        transition: `all 520ms ${EASE}`,
                      }}
                    >
                      <Icon size={mobile ? 18 : 21} strokeWidth={1.9} />
                    </span>
                    {mobile && n < FLOW.length - 1 && (
                      <span style={{ width: 1, flex: 1, minHeight: 26, background: on ? MX.emDark : MX.hairDark, opacity: 0.5, transition: `background 520ms ${EASE}` }} />
                    )}
                  </div>
                  <div style={{ paddingTop: mobile ? 4 : 18, paddingBottom: mobile ? 22 : 0 }}>
                    <p
                      style={{
                        fontSize: mobile ? 15 : 16.5, fontWeight: 700, letterSpacing: "-0.02em",
                        color: on ? MX.onDark : MX.onDarkMute, transition: `color 520ms ${EASE}`,
                      }}
                    >
                      {label}
                    </p>
                    <p className="mx-body" style={{ color: MX.onDarkMute, marginTop: 5, maxWidth: "24ch" }}>{note}</p>
                  </div>
                </React.Fragment>
              );
            })}
            {!mobile && (
              <span
                aria-hidden
                style={{
                  position: "absolute", left: "10%", right: "10%", top: mobile ? 0 : 26, height: 1,
                  background: `linear-gradient(90deg, ${MX.emDark}, ${MX.hairDark})`,
                  transform: `scaleX(${reduce ? 1 : Math.min(1, Math.max(0, (p - 0.1) / 0.62))})`,
                  transformOrigin: "left",
                  zIndex: -1,
                }}
              />
            )}
          </div>

          {/* the scan itself */}
          <div
            style={{
              display: "flex",
              flexDirection: mobile ? "column" : "row",
              alignItems: "center",
              justifyContent: "center",
              gap: mobile ? 18 : 40,
              marginTop: mobile ? 26 : 50,
            }}
          >
            <div style={{ position: "relative" }}>
              <QrCode value="https://mineex.ca/app?c=kingsmen-resources&utm_campaign=booth" size={mobile ? 108 : 132} />
              {!reduce && (
                <span
                  aria-hidden
                  className="mx-scan"
                  style={{
                    position: "absolute", left: 8, right: 8, top: 10, height: 26, borderRadius: 6,
                    background: "linear-gradient(rgba(255,255,255,0), rgba(255,255,255,0.42), rgba(255,255,255,0))", pointerEvents: "none",
                  }}
                />
              )}
            </div>
            <p className="mx-lead" style={{ color: MX.onDarkDim, maxWidth: "34ch", textAlign: mobile ? "center" : "left" }}>
              One physical conversation becomes a permanent digital connection — and every release you publish afterwards lands with the
              investor who scanned it.
            </p>
          </div>
        </Wrap>
      </div>
    </div>
  );
}
