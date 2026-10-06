// ─────────────────────────────────────────────────────────────────────────────
// AdvancedSearch — the real filter sheet, as live DOM.
//
// This is the screen the marketing site used to show as a 585px screenshot. It is now
// the actual thing: the taxonomy is the PRODUCT's own (COMMODITY_GROUPS, STAGES and
// commoditiesOf from src/lib/discovery.js — the same module the app's Explore uses),
// and the counts beside each option are COUNTED, live, from the investor demo
// directory. Nothing here is a hand-drawn imitation of the product, and nothing is
// hard-coded: change the fixture and the numbers follow.
//
// It is a demonstration, so it is deterministic and local. It reads a fixture array in
// memory. It performs no network call, writes nothing to Supabase, and knows nothing
// about the visitor.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useMemo, useState } from "react";
import { COMMODITY_GROUPS, STAGES, commoditiesOf } from "../../lib/discovery.js";
import { BULK } from "../demo/investorDirectoryBulk.js";

const INK = "#0b1220";
const SLATE = "#64748b";
const MUTE = "#94a3b8";
const HAIR = "#e8edf3";
const EM = "#2563eb";

const FACETS = [
  { id: "commodity", label: "Commodity" },
  { id: "location", label: "Location" },
  { id: "stage", label: "Stage" },
];

// Jurisdiction groups, read off the fixture itself rather than declared twice.
function regionsOf(co) {
  return String(co.region || "").split(/[;,]/).map((r) => r.trim()).filter(Boolean);
}

export default function AdvancedSearch({ onClose, onApply }) {
  const [facet, setFacet] = useState("commodity");
  const [picked, setPicked] = useState(() => new Set());

  // Counts straight off the directory, using the product's own commodity parser.
  const counts = useMemo(() => {
    const c = new Map();
    for (const co of BULK) {
      for (const k of commoditiesOf(co)) c.set(k, (c.get(k) || 0) + 1);
      for (const r of regionsOf(co)) {
        const last = r.split(",").pop().trim();
        c.set("@" + last, (c.get("@" + last) || 0) + 1);
      }
      if (co.stage) c.set("#" + co.stage, (c.get("#" + co.stage) || 0) + 1);
    }
    return c;
  }, []);

  const groups = useMemo(() => {
    if (facet === "commodity") {
      return COMMODITY_GROUPS
        .map((g) => ({ group: g.group, items: g.items.filter((i) => counts.get(i)) }))
        .filter((g) => g.items.length);
    }
    if (facet === "stage") return [{ group: "Project stage", items: STAGES }];
    const places = [...counts.keys()].filter((k) => k.startsWith("@"))
      .map((k) => k.slice(1)).sort((a, b) => counts.get("@" + b) - counts.get("@" + a)).slice(0, 14);
    return [{ group: "Jurisdiction", items: places }];
  }, [facet, counts]);

  const keyFor = (item) => (facet === "commodity" ? item : facet === "stage" ? "#" + item : "@" + item);

  // Matching companies for the current selection — the real count, not a slogan.
  const shown = useMemo(() => {
    if (!picked.size) return BULK.length;
    return BULK.filter((co) => {
      const mine = new Set([
        ...commoditiesOf(co),
        ...regionsOf(co).map((r) => "@" + r.split(",").pop().trim()),
        ...(co.stage ? ["#" + co.stage] : []),
      ]);
      for (const k of picked) if (mine.has(k)) return true;
      return false;
    }).length;
  }, [picked]);

  const toggle = (k) => setPicked((p) => {
    const n = new Set(p);
    n.has(k) ? n.delete(k) : n.add(k);
    return n;
  });

  return (
    <div style={{
      position: "absolute", left: 0, right: 0, bottom: 0, top: 86, zIndex: 6,
      background: "#fff", borderRadius: "22px 22px 0 0", display: "flex", flexDirection: "column",
      boxShadow: "0 -18px 48px -24px rgba(10,27,46,0.42)",
      animation: "mxSheetUp 420ms cubic-bezier(0.32,0.72,0,1) both",
    }}>
      <span aria-hidden style={{ width: 38, height: 4, borderRadius: 999, background: "#dfe5ec", margin: "9px auto 0" }} />

      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px 0" }}>
        <p style={{ margin: 0, fontSize: 19, fontWeight: 800, letterSpacing: "-0.03em", color: INK, flex: 1 }}>Advanced Search</p>
        <button type="button" onClick={onClose} aria-label="Close advanced search"
          style={{ appearance: "none", border: 0, cursor: "pointer", width: 30, height: 30, borderRadius: 999, background: "#eef2f7", color: SLATE, fontSize: 15, lineHeight: 1, display: "grid", placeItems: "center" }}>×</button>
      </div>

      <div style={{ display: "flex", gap: 8, padding: "12px 18px 10px" }}>
        {FACETS.map((f) => {
          const on = f.id === facet;
          return (
            <button key={f.id} type="button" onClick={() => setFacet(f.id)}
              style={{ appearance: "none", cursor: "pointer", font: "inherit", padding: "8px 15px", borderRadius: 999,
                fontSize: 13.5, fontWeight: 700, letterSpacing: "-0.015em",
                background: on ? INK : "#fff", color: on ? "#fff" : SLATE,
                border: `1px solid ${on ? INK : HAIR}`, transition: "background 200ms ease, color 200ms ease" }}>{f.label}</button>
          );
        })}
      </div>

      {/* The one place a finger may scroll inside the phone, and it is a list that
          obviously scrolls. The page keeps every other gesture. */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "0 18px 10px", overscrollBehavior: "contain" }}>
        {groups.map((g) => (
          <div key={g.group}>
            <p style={{ margin: "12px 0 2px", fontSize: 10.5, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTE }}>{g.group}</p>
            {g.items.map((item) => {
              const k = keyFor(item);
              const on = picked.has(k);
              const n = counts.get(k) || 0;
              return (
                <button key={item} type="button" onClick={() => toggle(k)}
                  style={{ appearance: "none", border: 0, background: "transparent", cursor: "pointer", font: "inherit",
                    width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "11px 0", textAlign: "left" }}>
                  <span aria-hidden style={{ width: 21, height: 21, borderRadius: 6, flex: "0 0 auto",
                    border: `1.5px solid ${on ? EM : "#d6dde6"}`, background: on ? EM : "#fff",
                    display: "grid", placeItems: "center", color: "#fff", fontSize: 12, fontWeight: 900,
                    transition: "background 160ms ease, border-color 160ms ease" }}>{on ? "✓" : ""}</span>
                  <span style={{ flex: 1, fontSize: 15, fontWeight: 600, letterSpacing: "-0.015em", color: INK }}>{item}</span>
                  <span style={{ fontSize: 13, color: MUTE, fontVariantNumeric: "tabular-nums" }}>{n || ""}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div style={{ padding: "10px 18px calc(16px + env(safe-area-inset-bottom, 0px))", borderTop: `1px solid ${HAIR}` }}>
        <button type="button" onClick={() => onApply && onApply([...picked])}
          style={{ appearance: "none", border: 0, cursor: "pointer", font: "inherit", width: "100%", height: 50, borderRadius: 999,
            background: INK, color: "#fff", fontSize: 15.5, fontWeight: 800, letterSpacing: "-0.015em" }}>
          Show {shown} companies
        </button>
      </div>
      <style>{`@keyframes mxSheetUp { from { transform: translateY(14%); opacity: 0 } to { transform: translateY(0); opacity: 1 } }`}</style>
    </div>
  );
}
