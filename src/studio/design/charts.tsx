// Data graphics, drawn from the extraction.
//
// Every one of these is generated from numbers the release actually stated, in
// the theme's palette, labelled in the theme's type. That is what separates a
// designed slide from a screenshot of a table — and it is also an honesty
// mechanism: the drill column is drawn down the hole's axis, and resource blocks
// carry less tonal weight as geological confidence falls.

import React from "react";
import type { Theme } from "./themes";
import type { DataGraphic } from "../services/story/types";
import { TRACK, TYPE } from "./tokens";

interface ViewProps { theme: Theme; accent: string; width: number; height: number; graphic: DataGraphic }

const labelStyle = (theme: Theme) => ({
  fontFamily: theme.labelFace === "mono" ? theme.mono : theme.text,
  fontSize: TYPE.label,
  fontWeight: theme.labelFace === "mono" ? 400 : 600,
  letterSpacing: theme.labelFace === "mono" ? "0.06em" : TRACK.label,
  textTransform: "uppercase" as const,
  color: theme.muted,
});

// ── DRILL COLUMN ───────────────────────────────────────────────────────────
function DrillColumnView({ theme, accent, width, height, graphic }: ViewProps) {
  if (graphic.kind !== "drill_column") return null;
  const { totalDepth, from, to, label, includes } = graphic;

  // A wide column reads as a drilled object; a thin one reads as a progress bar.
  // The emptiness above and below the band is not wasted space — it is the barren
  // rock, drawn to scale, and labelling the collar and end of hole turns that
  // emptiness into the information it actually is.
  const colW = 96;
  const h = height - 56;
  const y = (d: number) => (d / totalDepth) * h;
  const top = y(from);
  const bandH = Math.max(6, y(to) - top);

  const step = totalDepth > 400 ? 100 : 50;
  const ticks: number[] = [];
  for (let d = 0; d <= totalDepth; d += step) ticks.push(d);

  const labelX = colW + 54;
  // "<length> @ <grade>" is authored as two lines; SVG text has no wrapping.
  const labelLines = label.split(/\s*@\s*/).filter(Boolean);
  // The label block is bracketed to the band and vertically centred on it, then
  // clamped inside the drawing — one ordered block instead of leaders competing
  // for the same few pixels where an interval and its high-grade core coincide.
  const blockH = 40 + labelLines.length * 34 + includes.length * 22;
  const blockY = Math.max(0, Math.min(h - blockH, top + bandH / 2 - blockH / 2));

  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      <g transform="translate(64, 30)">
        <text x={0} y={-14} fontFamily={theme.mono} fontSize={11} fill={theme.muted} letterSpacing="0.1em">SURFACE</text>

        <rect x={0} y={0} width={colW} height={h} fill={theme.rule} fillOpacity={0.28} />
        <rect x={0} y={0} width={colW} height={h} fill="none" stroke={theme.rule} strokeWidth={theme.ruleWeight} />

        {ticks.map((d) => (
          <g key={d}>
            <line x1={-10} y1={y(d)} x2={0} y2={y(d)} stroke={theme.rule} strokeWidth={theme.ruleWeight} />
            <text x={-17} y={y(d) + 4} textAnchor="end" fontFamily={theme.mono} fontSize={11} fill={theme.muted} letterSpacing="0.04em">{d}</text>
          </g>
        ))}

        <rect x={0} y={top} width={colW} height={bandH} fill={accent} />
        {includes.map((inc, i) => (
          <rect key={i} x={colW * 0.26} y={y(inc.from)} width={colW * 0.48}
            height={Math.max(3, y(inc.to) - y(inc.from))} fill={theme.ink} fillOpacity={0.82} />
        ))}

        {/* Bracket: ties the label block to the exact depths it describes. */}
        <polyline
          points={`${colW + 14},${top} ${colW + 26},${top} ${colW + 26},${top + bandH} ${colW + 14},${top + bandH}`}
          fill="none" stroke={accent} strokeWidth={theme.ruleWeight}
        />
        <line x1={colW + 26} y1={top + bandH / 2} x2={labelX - 10} y2={blockY + 26} stroke={accent} strokeWidth={theme.ruleWeight} strokeOpacity={0.55} />

        {/* Stacked, not run-on. "42.7 metres @ 3.14 g/t gold" set on one line is
            wider than the column it belongs to and ran straight into the stats
            beside it — SVG text cannot wrap, so the break has to be authored. */}
        <g>
          <text x={labelX} y={blockY + 12} fontFamily={theme.text} fontSize={12} fontWeight={600}
            letterSpacing={TRACK.label} fill={theme.muted}>{`${from.toFixed(1)}–${to.toFixed(1)} M`}</text>
          {labelLines.map((line, i) => (
            <text key={i} x={labelX} y={blockY + 48 + i * 34} fontFamily={theme.display}
              fontSize={i === 0 ? 31 : 26} letterSpacing={TRACK.display}
              fill={i === 0 ? theme.ink : theme.muted}>{line}</text>
          ))}
          {includes.map((inc, i) => (
            <text key={i} x={labelX} y={blockY + 52 + labelLines.length * 34 + i * 22} fontFamily={theme.mono}
              fontSize={12.5} fill={theme.muted}>{`incl. ${inc.label}`}</text>
          ))}
        </g>

        <line x1={0} y1={h} x2={colW} y2={h} stroke={theme.ink} strokeWidth={1.5} strokeOpacity={0.55} />
        <text x={0} y={h + 24} fontFamily={theme.mono} fontSize={11} fill={theme.muted} letterSpacing="0.1em">
          {`EOH ${totalDepth} M`}
        </text>
      </g>
    </svg>
  );
}

// ── RESOURCE BLOCKS ────────────────────────────────────────────────────────
// Area is proportional to tonnage; tone falls with geological confidence, so an
// inferred block is visibly lighter than an indicated one. The chart says what
// the category names mean without a legend.
function ResourceBlocksView({ theme, accent, width, height, graphic }: ViewProps) {
  if (graphic.kind !== "resource_blocks") return null;
  const rows = graphic.rows;
  const total = rows.reduce((n, r) => n + r.tonnes, 0) || 1;
  const gap = 16;
  const usable = height - gap * (rows.length - 1);

  let cursor = 0;
  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      {rows.map((r, i) => {
        const bh = Math.max(52, (r.tonnes / total) * usable);
        const yPos = cursor;
        cursor += bh + gap;
        return (
          <g key={i} transform={`translate(0, ${yPos})`}>
            <rect x={0} y={0} width={width * 0.34} height={bh} fill={accent} fillOpacity={r.tone} />
            <text x={width * 0.34 + 26} y={22} style={labelStyle(theme)} fill={theme.muted}>{r.label}</text>
            <text x={width * 0.34 + 26} y={bh > 78 ? 62 : 52} fontFamily={theme.display} fontSize={bh > 78 ? 34 : 27}
              letterSpacing={TRACK.display} fill={theme.ink}>{r.contained}</text>
            <text x={width * 0.34 + 26} y={bh > 78 ? 88 : 74} fontFamily={theme.mono} fontSize={13} fill={theme.muted}>
              {`${(r.tonnes / 1e6).toFixed(1)} Mt @ ${r.grade}`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── USE OF PROCEEDS ────────────────────────────────────────────────────────
// One band split proportionally. Not a pie: a pie forces angle comparison, which
// people are measurably bad at, and it drags a legend along with it.
function ProceedsBarView({ theme, accent, width, height, graphic }: ViewProps) {
  if (graphic.kind !== "proceeds_bar") return null;
  const segs = graphic.segments;
  const total = segs.reduce((n, s) => n + s.amount, 0) || 1;
  const barH = 76;
  let x = 0;

  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      {segs.map((s, i) => {
        const w = (s.amount / total) * width;
        const seg = (
          <g key={i}>
            <rect x={x} y={0} width={Math.max(2, w - 3)} height={barH} fill={accent} fillOpacity={1 - i * 0.26} />
            <line x1={x} y1={barH + 16} x2={x} y2={barH + 30} stroke={theme.rule} strokeWidth={theme.ruleWeight} />
            <text x={x} y={barH + 54} style={labelStyle(theme)} fill={theme.muted}>{s.display}</text>
            <foreignObject x={x} y={barH + 62} width={Math.max(120, w - 12)} height={110}>
              <div style={{ fontFamily: theme.text, fontSize: 17, lineHeight: 1.34, color: theme.ink, paddingRight: 14 }}>{s.label}</div>
            </foreignObject>
          </g>
        );
        x += w;
        return seg;
      })}
    </svg>
  );
}

// ── STAT ROWS ──────────────────────────────────────────────────────────────
function StatRowsView({ theme, width, graphic }: ViewProps) {
  if (graphic.kind !== "stat_rows") return null;
  return (
    <div style={{ width }}>
      {graphic.rows.map((r, i) => (
        <div key={i} style={{
          display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 24,
          padding: "17px 0", borderTop: `${theme.ruleWeight}px solid ${theme.rule}`,
        }}>
          <span style={{ ...labelStyle(theme), flex: "1 1 auto" }}>{r.label}</span>
          <span style={{
            fontFamily: theme.display, fontSize: 27, letterSpacing: TRACK.display,
            color: theme.ink, fontVariantNumeric: "tabular-nums", textAlign: "right", flex: "0 0 auto",
          }}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function StepOutView({ theme, accent, width, graphic }: ViewProps) {
  if (graphic.kind !== "step_out") return null;
  return (
    <svg width={width} height={180} style={{ overflow: "visible" }}>
      <circle cx={40} cy={90} r={9} fill={theme.ink} />
      <circle cx={width - 40} cy={90} r={9} fill={accent} />
      <line x1={52} y1={90} x2={width - 52} y2={90} stroke={theme.rule} strokeWidth={theme.ruleWeight} strokeDasharray="5 6" />
      <text x={width / 2} y={72} textAnchor="middle" fontFamily={theme.display} fontSize={34} fill={theme.ink}>{graphic.distance}</text>
      <text x={width / 2} y={124} textAnchor="middle" style={labelStyle(theme)} fill={theme.muted}>{graphic.direction}</text>
    </svg>
  );
}

export function DataGraphicView(props: ViewProps) {
  switch (props.graphic.kind) {
    case "drill_column": return <DrillColumnView {...props} />;
    case "resource_blocks": return <ResourceBlocksView {...props} />;
    case "proceeds_bar": return <ProceedsBarView {...props} />;
    case "stat_rows": return <StatRowsView {...props} />;
    case "step_out": return <StepOutView {...props} />;
    default: return null;
  }
}
