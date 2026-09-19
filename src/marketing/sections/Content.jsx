// Sections 7–8: the press-release reading experience, and media.
import React, { useRef } from "react";
import {
  MX, EASE, Wrap, Reveal, Eyebrow, Phone, useTrack, useViewport, useReduce, ramp, win, mix, phoneWidth,
} from "../system.jsx";
import { Fit, ReleaseScreen, MediaScreen, AppShot } from "../ui/AppUI.jsx";
import { RAW_RELEASE, RELEASES, IMG } from "../data.js";

/* ═════════════════════════════════════════ 7 · PRESS RELEASES ════════════ */

export function PressReleases() {
  const track = useRef(null);
  const p = useTrack(track, { reduceValue: 0.9 });
  const { mobile } = useViewport();

  const hand = ramp(p, 0.18, 0.62);              // the handover
  const rawOut = win(p, 0.24, 0.6);

  return (
    <div ref={track} className="mx-track" style={{ height: "165vh", background: MX.sheetDeep }}>
      <div className="mx-stage" style={{ background: MX.sheetDeep }}>
        <Wrap style={{ width: "100%" }}>
          <div style={{ textAlign: "center", maxWidth: 700, margin: "0 auto" }}>
            <Eyebrow>Press releases, rebuilt for investors</Eyebrow>
            <h2 className="mx-h2" style={{ marginTop: 16, marginInline: "auto", maxWidth: "16ch" }}>
              The same release. Finally readable.
            </h2>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: mobile ? "1fr" : "minmax(0, 1fr) auto",
              gap: mobile ? 24 : 60,
              alignItems: "center",
              marginTop: mobile ? 26 : 46,
            }}
          >
            {/* the wall of text it arrives as */}
            <div
              style={{
                position: "relative",
                background: "#fff",
                borderRadius: 14,
                padding: mobile ? "18px 18px 0" : "28px 30px 0",
                maxHeight: mobile ? 240 : 430,
                overflow: "hidden",
                boxShadow: "0 30px 70px -50px rgba(4,8,14,0.5)",
                // Opacity and transform only — animating filter() would re-run a
                // full-layer blur on a large element on every scroll frame.
                opacity: mix(1, 0.3, rawOut),
                transform: `scale(${mix(1, 0.965, rawOut).toFixed(3)})`,
                willChange: "transform, opacity",
              }}
            >
              <p className="mx-label" style={{ color: MX.mute, fontSize: 10 }}>Newswire · as published</p>
              <p style={{ fontSize: mobile ? 14 : 16, fontWeight: 700, letterSpacing: "-0.015em", marginTop: 12, lineHeight: 1.28 }}>
                {RAW_RELEASE.title}
              </p>
              <p style={{ fontSize: 11.5, color: MX.mute, marginTop: 8 }}>{RAW_RELEASE.dateline}</p>
              <p
                style={{
                  fontSize: mobile ? 11 : 12,
                  lineHeight: 1.72,
                  color: "#4b5563",
                  marginTop: 14,
                  whiteSpace: "pre-line",
                  textAlign: "justify",
                }}
              >
                {RAW_RELEASE.body}
              </p>
              <div
                aria-hidden
                style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 120, background: "linear-gradient(rgba(255,255,255,0), #fff)" }}
              />
            </div>

            {/* what MineEx turns it into */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                opacity: mix(0.25, 1, hand),
                transform: `translate3d(0, ${mix(28, 0, hand).toFixed(1)}px, 0)`,
                willChange: "transform, opacity",
              }}
            >
              <Phone width={phoneWidth(mobile)}>
                <AppShot name="release" />
              </Phone>
            </div>
          </div>

          <div style={{ textAlign: "center", marginTop: mobile ? 22 : 38, opacity: hand }}>
            <p className="mx-lead" style={{ color: MX.dim, maxWidth: "52ch", margin: "0 auto" }}>
              Headline, why it matters, the key takeaways, the company behind it — and the full release, unchanged, one tap away.
              MineEx never edits the facts. It makes them navigable.
            </p>
          </div>
        </Wrap>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════ 8 · MEDIA ═══════════ */

const MOSAIC_A = [IMG.rig.sm, IMG.adit.sm, IMG.district.sm];
const MOSAIC_B = [IMG.sampling.sm, IMG.timbered.sm, IMG.mineAdit.sm];

export function Media() {
  const track = useRef(null);
  const p = useTrack(track);
  const { mobile } = useViewport();
  const reduce = useReduce();
  const drift = reduce ? 0 : (p - 0.5) * 2;

  return (
    <div ref={track} className="mx-track" style={{ height: mobile ? "125vh" : "140vh", background: MX.ink, position: "relative", zIndex: 2 }}>
      {/* quieter echo of the Conference boundary: the dark Media section rises
          under the light Press Releases section above. Flatter, so it feels
          intentional rather than a repeat. Purely decorative. */}
      <div
        aria-hidden
        style={{
          position: "absolute", left: 0, right: 0, top: 0,
          height: "clamp(34px, 5vh, 76px)", transform: "translateY(-99%)",
          background: MX.ink,
          borderRadius: "50% 50% 0 0 / 100% 100% 0 0",
          zIndex: 1,
        }}
      />
      <div className="mx-stage" style={{ background: MX.ink, color: MX.onDark }}>
        <Wrap style={{ width: "100%" }}>
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "minmax(0, 1fr) auto minmax(0, 0.85fr)", gap: mobile ? 24 : 46, alignItems: "center" }}>
            <div style={{ order: mobile ? 1 : 1, textAlign: mobile ? "center" : "left" }}>
              <Eyebrow color={MX.onDarkMute}>Media</Eyebrow>
              <h2 className="mx-h2" style={{ marginTop: 16, maxWidth: "12ch", marginInline: mobile ? "auto" : undefined }}>
                Some stories are better seen.
              </h2>
              <p className="mx-lead" style={{ color: MX.onDarkDim, marginTop: 18, maxWidth: "34ch", marginInline: mobile ? "auto" : undefined }}>
                Site footage, core photography, interviews and management updates sit alongside the numbers — because a drill site explains
                itself faster than a paragraph can.
              </p>
            </div>

            <div style={{ order: mobile ? 3 : 2, display: "flex", justifyContent: "center" }}>
              <Phone width={phoneWidth(mobile)}>
                <AppShot name="media" />
              </Phone>
            </div>

            {/* two drifting columns of real project photography */}
            <div style={{ order: mobile ? 2 : 3, display: mobile ? "none" : "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[MOSAIC_A, MOSAIC_B].map((col, ci) => (
                <div key={ci} style={{ display: "grid", gap: 12, transform: `translateY(${drift * (ci ? 34 : -34)}px)` }}>
                  {col.map((src, i) => (
                    <div key={src} style={{ borderRadius: 14, overflow: "hidden", aspectRatio: i === 1 ? "3 / 4" : "1", background: "#11151c" }}>
                      <img src={src} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </Wrap>
      </div>
    </div>
  );
}
