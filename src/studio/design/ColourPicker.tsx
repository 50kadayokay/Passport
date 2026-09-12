// Accent colour control.
//
// Whatever is chosen here is still passed through `tameBrandColor`, so a
// fluorescent pick is desaturated and lifted or deepened until it clears a 3.5:1
// contrast against the theme's ground. The picker therefore offers real freedom
// without the freedom to make an unreadable slide — and it shows both values, so
// the correction is visible rather than mysterious.

import React, { useState } from "react";
import type { Theme } from "./themes";
import { tameBrandColor } from "./themes";

/**
 * A spread across hue and value rather than a brand palette: the point is to make
 * any company's colour reachable in one click, then let the taming rule handle
 * whether it can carry weight on this particular ground.
 */
const SWATCHES: string[] = [
  "#B4451F", "#D2231F", "#C0143C", "#8E1B4B", "#6D2077", "#4527A0",
  "#2A3EB1", "#1565C0", "#0277BD", "#00838F", "#00695C", "#2E7D32",
  "#558B2F", "#9E9D24", "#C8A415", "#EF6C00", "#8D6E63", "#5D4037",
  "#37474F", "#0B1020", "#101010", "#6B7280", "#9FB3C8", "#C8FF2E",
];

const HEX_RE = /^#?[0-9a-fA-F]{6}$/;

export default function ColourPicker({ theme, value, onChange }: {
  theme: Theme;
  /** Empty string means "use the theme's own accent". */
  value: string;
  onChange: (hex: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState(value);
  const applied = value ? tameBrandColor(value, theme) : theme.accent;
  const adjusted = !!value && applied.toLowerCase() !== value.toLowerCase();

  const commit = (v: string) => {
    setHex(v);
    if (!v) return onChange("");
    if (HEX_RE.test(v)) onChange(v.startsWith("#") ? v : `#${v}`);
  };

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.11em", textTransform: "uppercase", color: "#94a3b8" }}>Accent</span>

      <button
        onClick={() => setOpen(!open)}
        title="Choose an accent colour"
        style={{
          display: "flex", alignItems: "center", gap: 7, cursor: "pointer",
          border: "1px solid #e2e8f0", borderRadius: 9, background: "#fff", padding: "4px 9px 4px 5px",
        }}
      >
        <span style={{ width: 18, height: 18, borderRadius: 4, background: applied, border: "1px solid rgba(0,0,0,0.12)" }} />
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11.5, color: "#475569" }}>
          {value ? value.toUpperCase() : "Theme"}
        </span>
      </button>

      {adjusted ? (
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: "#0284c7" }} title="Adjusted for contrast against this theme's ground">
          → {applied.toUpperCase()}
        </span>
      ) : null}

      {open ? (
        <div style={{
          position: "absolute", top: 34, left: 46, zIndex: 30, width: 268,
          background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14,
          boxShadow: "0 16px 40px rgba(15,23,42,0.16)", padding: 13,
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 7 }}>
            <button
              onClick={() => { commit(""); setOpen(false); }}
              title="Theme default"
              style={{
                height: 30, borderRadius: 7, cursor: "pointer",
                border: value === "" ? "2px solid #0f172a" : "1px solid #cbd5e1",
                background: "repeating-linear-gradient(45deg,#fff,#fff 4px,#e2e8f0 4px,#e2e8f0 8px)",
              }}
            />
            {SWATCHES.map((c) => (
              <button
                key={c}
                onClick={() => { commit(c); setOpen(false); }}
                title={c}
                style={{
                  height: 30, borderRadius: 7, background: c, cursor: "pointer",
                  border: value.toLowerCase() === c.toLowerCase() ? "2px solid #0f172a" : "1px solid rgba(0,0,0,0.12)",
                }}
              />
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, paddingTop: 12, borderTop: "1px solid #e2e8f0" }}>
            <input
              type="color"
              value={HEX_RE.test(hex) ? (hex.startsWith("#") ? hex : `#${hex}`) : applied}
              onChange={(e) => commit(e.target.value)}
              style={{ width: 34, height: 30, padding: 0, border: "1px solid #e2e8f0", borderRadius: 7, background: "#fff", cursor: "pointer" }}
              title="Pick any colour"
            />
            <input
              value={hex}
              onChange={(e) => commit(e.target.value)}
              placeholder="#A23A17"
              spellCheck={false}
              style={{
                flex: 1, borderRadius: 8, border: "1px solid #e2e8f0", padding: "7px 9px",
                fontFamily: "ui-monospace, monospace", fontSize: 12, outline: "none",
              }}
            />
          </div>
          <p style={{ margin: "10px 0 0", fontSize: 11, lineHeight: 1.45, color: "#94a3b8" }}>
            Any colour is adjusted until it clears 3.5:1 against this theme&rsquo;s ground, so it can be
            read at a glance in a feed.
          </p>
        </div>
      ) : null}
    </div>
  );
}
