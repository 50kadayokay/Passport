// ─────────────────────────────────────────────────────────────────────────────
// MockFeed — a rendered mock of the MineEx "Today / For You" news feed for the Hero
// phone. FICTIONAL companies + headlines + real generic mining imagery (thumbnails).
// Designed at the app's native screen size (585 × 1266) so it composites crisply into
// the hero phone via HeroHandPhone's perspective transform. Marketing-only mock.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";

const INK = "#0a0c0f", DIM = "#545b66", MUTE = "#868d97", HAIR = "rgba(10,12,15,0.10)";
const ACCENT = "#2563EB";

const STORIES = [
  { logo: "AG", color: "#c9862f", tag: "NEWS", head: "Aurora Gold expands Cerro Blanco resource by 41%", src: "Mining Wire", time: "6h", thumb: "/marketing/site-7-active-drill-site.webp" },
  { logo: "BC", color: "#b45f3a", tag: "NEWS", head: "Batholith Copper closes C$22M bought deal to fund 2026 drilling", src: "Resource Daily", time: "9h", thumb: "/marketing/site-11-mine-adit.webp" },
  { logo: "VL", color: "#3f9d6b", tag: "NEWS", head: "Verde Lithium intersects broad spodumene zone at Sierra Este", src: "The Prospector", time: "12h", thumb: "/marketing/site-19-drill-rig.webp" },
];

export default function MockFeed() {
  return (
    <div style={{ width: 585, height: 1266, background: "#fff", color: INK, overflow: "hidden", position: "relative", fontFamily: "inherit", WebkitFontSmoothing: "antialiased" }}>
      {/* status bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 40px 0" }}>
        <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.01em" }}>9:41</span>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {[7, 10, 13, 16].map((h, i) => <span key={i} style={{ width: 5, height: h, background: INK, borderRadius: 1, display: "inline-block" }} />)}
          <span style={{ width: 26, height: 15, border: `2px solid ${INK}`, borderRadius: 4, marginLeft: 6, position: "relative", display: "inline-block" }}><span style={{ position: "absolute", inset: 2, background: INK, borderRadius: 1 }} /></span>
        </span>
      </div>

      {/* header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", padding: "18px 40px 0" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "0.16em", color: ACCENT, textTransform: "uppercase" }}>Junior Mining</div>
          <div style={{ fontSize: 46, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1, marginTop: 2 }}>Today</div>
        </div>
        <div style={{ width: 40, height: 40, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gridTemplateRows: "repeat(3,1fr)", gap: 3 }}>
          {[1,1,0,1,0,1,0,1,1].map((v,i)=><span key={i} style={{ background: v?INK:"transparent", borderRadius: 1 }} />)}
        </div>
      </div>

      {/* tabs */}
      <div style={{ display: "flex", gap: 34, padding: "22px 40px 0", borderBottom: `1px solid ${HAIR}`, marginTop: 14 }}>
        {[["For You", true], ["News", false], ["Press Releases", false], ["Media", false]].map(([t, a]) => (
          <span key={t} style={{ fontSize: 25, fontWeight: 700, letterSpacing: "-0.01em", color: a ? INK : MUTE, paddingBottom: 16, borderBottom: a ? `3px solid ${INK}` : "3px solid transparent", marginBottom: -1 }}>{t}</span>
        ))}
      </div>

      {/* featured card */}
      <div style={{ margin: "26px 40px 0", borderRadius: 26, overflow: "hidden", boxShadow: "0 18px 40px -22px rgba(10,18,38,0.25)", border: `1px solid ${HAIR}` }}>
        <div style={{ position: "relative", height: 330 }}>
          <img src="/marketing/site-18-drill-site-aerial.webp" alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(6,10,18,.35) 0%, rgba(6,10,18,.15) 40%, rgba(6,10,18,.86) 100%)" }} />
          <span style={{ position: "absolute", top: 22, left: 22, fontSize: 16, fontWeight: 800, letterSpacing: "0.1em", color: "#fff", background: "rgba(255,255,255,0.18)", backdropFilter: "blur(4px)", padding: "7px 14px", borderRadius: 999 }}>UPDATE</span>
          <div style={{ position: "absolute", left: 26, right: 26, bottom: 24, color: "#fff", fontSize: 34, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.08 }}>
            Cordillera Silver hits 14.2 m of 512 g/t Ag at El Rayo
          </div>
        </div>
        <div style={{ padding: "22px 26px 26px" }}>
          <span style={{ display: "inline-block", fontSize: 18, fontWeight: 600, color: DIM, background: "#eef1f5", padding: "6px 14px", borderRadius: 999 }}>Silver · Mexico</span>
          <p style={{ fontSize: 22, lineHeight: 1.42, color: DIM, margin: "16px 0 0" }}>
            Cordillera Silver reported high-grade silver intercepts from the maiden drill program at El Rayo, extending the mineralized corridor across a 600 m strike and
          </p>
          <div style={{ fontSize: 18, color: MUTE, marginTop: 16, fontWeight: 600 }}>Mining Wire · 3h</div>
        </div>
      </div>

      {/* top stories */}
      <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "0.16em", color: MUTE, textTransform: "uppercase", padding: "30px 40px 6px" }}>Top Stories</div>
      <div style={{ padding: "0 40px" }}>
        {STORIES.map((s, i) => (
          <div key={i} style={{ display: "flex", gap: 20, alignItems: "center", padding: "22px 0", borderBottom: `1px solid ${HAIR}` }}>
            <div style={{ position: "relative", width: 108, height: 108, borderRadius: 18, overflow: "hidden", flexShrink: 0, background: s.color }}>
              <img src={s.thumb} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
              <span style={{ position: "absolute", left: 8, bottom: 8, width: 34, height: 34, borderRadius: 8, background: s.color, color: "#fff", fontSize: 15, fontWeight: 800, display: "grid", placeItems: "center", boxShadow: "0 2px 6px rgba(0,0,0,.3)" }}>{s.logo}</span>
            </div>
            <div style={{ minWidth: 0 }}>
              <span style={{ display: "inline-block", fontSize: 14, fontWeight: 800, letterSpacing: "0.08em", color: ACCENT, background: "rgba(37,99,235,0.10)", padding: "4px 10px", borderRadius: 6 }}>{s.tag}</span>
              <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.2, marginTop: 8, color: INK }}>{s.head}</div>
              <div style={{ fontSize: 17, color: MUTE, marginTop: 8, fontWeight: 600 }}>{s.src} · {s.time}</div>
            </div>
          </div>
        ))}
      </div>

      {/* bottom tab bar */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 96, background: "rgba(255,255,255,0.94)", backdropFilter: "blur(8px)", borderTop: `1px solid ${HAIR}`, display: "flex", alignItems: "center", justifyContent: "space-around", padding: "0 30px 22px" }}>
        {["spark", "compass", "chat", "star", "person"].map((k, i) => (
          <span key={k} style={{ width: 30, height: 30, borderRadius: 8, display: "grid", placeItems: "center", background: i === 0 ? "rgba(37,99,235,0.12)" : "transparent" }}>
            <span style={{ width: 20, height: 20, borderRadius: i === 4 ? 999 : 5, border: `2.5px solid ${i === 0 ? ACCENT : "#aab0b8"}` }} />
          </span>
        ))}
      </div>
    </div>
  );
}
