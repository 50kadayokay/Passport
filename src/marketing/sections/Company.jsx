// Sections 9–10: the company side — dashboard and analytics.
import React, { useRef } from "react";
import { Radio, Building2, Image as ImageIcon, Calendar, BarChart3, ScrollText } from "lucide-react";
import {
  MX, EASE, Section, Wrap, Reveal, Eyebrow, Desktop, useTrack, useViewport, useReduce, ramp, mix,
} from "../system.jsx";
import { DashboardUI } from "../ui/DeskUI.jsx";

const CAPABILITIES = [
  { Icon: Building2, title: "Profile management", body: "Overview, projects, capital, timeline and team — edited by you, live for investors." },
  { Icon: Radio, title: "Publishing & broadcast", body: "Write an update once and push it to the people who follow you." },
  { Icon: ImageIcon, title: "Media library", body: "Drone footage, core photography, decks and logos in one organised place." },
  { Icon: Calendar, title: "Catalyst calendar", body: "Track upcoming drilling, assays, studies and financings." },
  { Icon: ScrollText, title: "Activity log", body: "An append-only record of every change — history can be added to, never rewritten." },
  { Icon: BarChart3, title: "Analytics", body: "What you've published, and investor engagement as it comes online." },
];

/* ════════════════════════════════════════ 9 · COMPANY DASHBOARD ══════════ */

export function Dashboard() {
  const track = useRef(null);
  const p = useTrack(track, { reduceValue: 1 });
  const { mobile } = useViewport();
  const reduce = useReduce();
  const settle = ramp(p, 0.02, 0.4);
  const tilt = reduce ? 0 : mix(6, 0, settle);

  return (
    <div ref={track} className="mx-track" style={{ background: MX.paper, padding: mobile ? "84px 0 96px" : "clamp(110px, 14vh, 180px) 0" }}>
      <Wrap>
        <div style={{ maxWidth: 720 }}>
          <Eyebrow>The company side</Eyebrow>
          <Reveal kind="heading" delay={60}>
            <h2 className="mx-h2" style={{ marginTop: 16, maxWidth: "15ch" }}>
              A dashboard your IR team actually runs the company from.
            </h2>
          </Reveal>
          <Reveal kind="copy">
            <p className="mx-lead" style={{ color: MX.dim, marginTop: 18, maxWidth: "48ch" }}>
              Everything an investor sees is controlled from one place — profile, publishing, media, calendar and the record of who
              changed what.
            </p>
          </Reveal>
        </div>

        <div
          style={{
            marginTop: mobile ? 34 : 54,
            perspective: 1600,
          }}
        >
          <div
            style={{
              transform: `rotateX(${tilt.toFixed(2)}deg) translate3d(0, ${mix(24, 0, settle).toFixed(1)}px, 0)`,
              transformOrigin: "50% 0%",
              willChange: "transform",
            }}
          >
            <Desktop label="mineex.ca/portal">
              <div style={{ height: mobile ? 420 : 520, overflow: "hidden" }}>
                <div style={{ width: mobile ? 900 : "100%", height: "100%", transform: mobile ? "scale(0.62)" : "none", transformOrigin: "top left" }}>
                  <DashboardUI section="home" />
                </div>
              </div>
            </Desktop>
          </div>
        </div>
        <p className="mx-body" style={{ color: MX.mute, marginTop: 14, textAlign: "center" }}>
          Company dashboard, shown with demonstration data.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: mobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
            gap: mobile ? 2 : 0,
            marginTop: mobile ? 40 : 70,
            borderTop: `1px solid ${MX.hair}`,
          }}
        >
          {CAPABILITIES.map(({ Icon, title, body }, i) => (
            <Reveal key={title} kind="item" order={i % 3}>
              <div
                style={{
                  padding: mobile ? "22px 0" : "30px 30px 30px 0",
                  borderBottom: `1px solid ${MX.hair}`,
                  height: "100%",
                }}
              >
                <Icon size={19} color={MX.emText} strokeWidth={1.9} />
                <p className="mx-h3" style={{ marginTop: 14, fontSize: "clamp(16px, 1.35vw, 19px)" }}>{title}</p>
                <p className="mx-body" style={{ color: MX.dim, marginTop: 7, maxWidth: "34ch" }}>{body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Wrap>
    </div>
  );
}

/* ═══════════════════════════════════════════════ 10 · ANALYTICS ══════════ */

export function Analytics() {
  const { mobile } = useViewport();
  return (
    <Section tone="sheet">
      <Wrap>
        <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "minmax(0, 0.8fr) minmax(0, 1.2fr)", gap: mobile ? 28 : 56, alignItems: "center" }}>
          <div>
            <Eyebrow>Analytics</Eyebrow>
            <Reveal kind="heading" delay={60}>
              <h2 className="mx-h2" style={{ marginTop: 16, maxWidth: "12ch" }}>
                Know what's getting attention.
              </h2>
            </Reveal>
            <Reveal kind="copy">
              <p className="mx-lead" style={{ color: MX.dim, marginTop: 18, maxWidth: "38ch" }}>
                MineEx reports what your company has actually published, and measures investor engagement from real activity on your
                profile — never estimated, never inflated.
              </p>
            </Reveal>
            <Reveal kind="copy" order={1}>
              <p className="mx-body" style={{ color: MX.mute, marginTop: 18, maxWidth: "40ch" }}>
                Profile views, followers, reading time and geography begin recording once your profile is published and starts receiving
                traffic.
              </p>
            </Reveal>
          </div>

          <Reveal kind="media">
            <Desktop label="mineex.ca/portal — analytics">
              <div style={{ height: mobile ? 330 : 400, overflow: "hidden" }}>
                <div style={{ width: mobile ? 900 : "100%", height: "100%", transform: mobile ? "scale(0.62)" : "none", transformOrigin: "top left" }}>
                  <DashboardUI section="analytics" />
                </div>
              </div>
            </Desktop>
          </Reveal>
        </div>
      </Wrap>
    </Section>
  );
}
