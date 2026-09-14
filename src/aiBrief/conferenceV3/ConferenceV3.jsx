// ConferenceV3 — the productized, data-driven redesign of Conference Mode. Renders a chosen TEMPLATE
// from the universal view model (buildV3Model), with a global theme + accent system. This is the
// codebase home of the artifact concepts; templates are added here one at a time as they're locked.
// Phase 1: Template 01 "Monolith", data-bound, theme + accent. Previewable at /confv3demo (localhost).
import React, { useMemo, useState, useEffect, useRef } from "react";
import { buildV3Model } from "./model.js";

// ── THEME REGISTRY ── each palette is a full token set; line/line2/chip derive from ink. Add a
// palette here and it appears in the switcher, the Studio, and the website showcase automatically.
const THEMES = {
  // Dark grounds — each ground carries a faint hue, neutrals are tuned to it, one confident accent.
  obsidian: { label: "Obsidian", bg: "#0b0b0d", bg2: "#131317", ink: "#f0efe9", dim: "#9a988f", faint: "#5c5a54", accent: "#caa96b", accent2: "#e6cf9c" }, // neutral black · champagne gold
  meridian: { label: "Meridian", bg: "#0c0f15", bg2: "#141922", ink: "#eaeef4", dim: "#8c94a2", faint: "#4e5666", accent: "#5fb2cf", accent2: "#9bd6e8" }, // navy-black · steel cyan
  cellar:   { label: "Cellar",   bg: "#120f0d", bg2: "#1b1713", ink: "#f1eae2", dim: "#a89a8c", faint: "#675c50", accent: "#cf7043", accent2: "#e39b73" }, // brown-black · terracotta
  pine:     { label: "Pine",     bg: "#0c110e", bg2: "#141b16", ink: "#eaf0ea", dim: "#92a396", faint: "#55625a", accent: "#c2a15c", accent2: "#ddc389" }, // green-charcoal · brass
  amethyst: { label: "Amethyst", bg: "#0f0d15", bg2: "#17141f", ink: "#efebf3", dim: "#a099ab", faint: "#605a6c", accent: "#a690d8", accent2: "#c8b6ec" }, // plum-charcoal · soft lilac
  // Light grounds — cool neutral (never cream), tuned greys, one warm/cool accent.
  graphite: { label: "Graphite", bg: "#eceef1", bg2: "#e3e6ea", ink: "#14171c", dim: "#5b6069", faint: "#a4abb5", accent: "#ff7a1a", accent2: "#ff9d4d" }, // cool grey · tangerine (kept)
  porcelain:{ label: "Porcelain",bg: "#f5f5f6", bg2: "#ecedee", ink: "#1a1a1d", dim: "#64666b", faint: "#a8abb0", accent: "#b5482f", accent2: "#d06b52" }, // cool white · brick red
  harbor:   { label: "Harbor",   bg: "#eef1f1", bg2: "#e5e9e9", ink: "#12191a", dim: "#566063", faint: "#a0abac", accent: "#1f6b66", accent2: "#2f8f88" }, // cool light · deep teal
};
const _rgb = (h) => { h = String(h).replace("#", ""); if (h.length === 3) h = h.replace(/./g, (c) => c + c); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const _vars = (t) => { const [r, g, b] = _rgb(t.ink); return `--bg:${t.bg};--bg2:${t.bg2};--ink:${t.ink};--dim:${t.dim};--faint:${t.faint};--accent:${t.accent};--accent2:${t.accent2};--line:rgba(${r},${g},${b},.10);--line2:rgba(${r},${g},${b},.18);--chip:rgba(${r},${g},${b},.06)`; };
const THEME_KEYS = Object.keys(THEMES);
const THEME_ACCENT = Object.fromEntries(THEME_KEYS.map((k) => [k, THEMES[k].accent]));
const themeDot = (k) => `radial-gradient(circle at 32% 30%, ${THEMES[k].accent} 0 34%, ${THEMES[k].bg2} 36%)`;
export const THEME_LIST = THEME_KEYS.map((k) => ({ key: k, label: THEMES[k].label, accent: THEMES[k].accent, bg: THEMES[k].bg, ink: THEMES[k].ink, dot: themeDot(k) }));
function lighten(hex, amt) {
  try { const n = parseInt(hex.replace("#", ""), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    r = Math.round(r + (255 - r) * amt); g = Math.round(g + (255 - g) * amt); b = Math.round(b + (255 - b) * amt);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1); } catch { return hex; }
}
// Split "7.94 Moz Au" → a big number + a smaller unit, so the hero figure never wraps as one slab.
function splitStat(v) {
  const m = String(v || "").match(/^([\d.,]+)\s*(.*)$/);
  return m && m[2] ? <>{m[1]}<span className="unit"> {m[2]}</span></> : (v || "");
}
// Join React nodes as prose: "a, b and c".
function joinProse(arr) { return arr.map((n, i) => <React.Fragment key={i}>{i > 0 ? (i === arr.length - 1 ? " and " : ", ") : ""}{n}</React.Fragment>); }

const CSS = `
.cv3{${_vars(THEMES.obsidian)};
  --font:"Inter Tight",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--mono:"IBM Plex Mono",ui-monospace,Menlo,monospace;--serif:"Fraunces",Georgia,"Times New Roman",serif;
  position:fixed;inset:0;z-index:1;overflow-y:auto;background:var(--bg);color:var(--ink);font-family:var(--font);-webkit-font-smoothing:antialiased}
${THEME_KEYS.filter((k) => k !== "obsidian").map((k) => `.cv3[data-variant="${k}"]{${_vars(THEMES[k])}}`).join("\n")}
.cv3 *{box-sizing:border-box}
.cv3 img{display:block;max-width:100%}
.cv3 .wrap{max-width:1180px;margin:0 auto;padding:0 clamp(20px,5vw,64px)}
.cv3 .eyebrow{font-family:var(--mono);font-size:12px;font-weight:500;letter-spacing:.28em;text-transform:uppercase;color:var(--accent)}
.cv3 .tabnum{font-variant-numeric:tabular-nums}
.cv3 section{padding:clamp(52px,8vh,104px) 0;position:relative}
.cv3 .kick{display:flex;align-items:center;gap:14px;margin-bottom:30px}
.cv3 .kick .eyebrow{white-space:nowrap}.cv3 .kick .ln{height:1px;flex:1;background:var(--line)}
.cv3 .rise{opacity:0;transform:translateY(24px);transition:opacity .9s cubic-bezier(.22,1,.36,1),transform .9s cubic-bezier(.22,1,.36,1),filter .9s ease,clip-path 1s cubic-bezier(.65,0,.35,1)}
/* signature reveal modifiers set the INITIAL (out) state; .in below MUST come last so it clears them */
.cv3 .rise.blur{filter:blur(16px);transform:translateY(30px)}
.cv3 .rise.scale{transform:scale(.9);transform-origin:center bottom}
.cv3 .rise.up{transform:translateY(64px)}
.cv3 .rise.wipe{opacity:1;transform:none;clip-path:inset(0 100% -0.2em 0)}
.cv3 .rise.in{opacity:1!important;transform:none!important;filter:none!important}
.cv3 .rise.wipe.in{clip-path:inset(0 0 -0.2em 0)}
@media (prefers-reduced-motion:reduce){.cv3 .rise,.cv3 .rise.wipe{opacity:1!important;transform:none!important;filter:none!important;clip-path:none!important}}
.cv3 .hero{position:relative;height:min(92vh,880px);min-height:540px;display:flex;align-items:flex-end;overflow:hidden}
.cv3 .hero-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.cv3 .hero-ph{position:absolute;inset:0;background:radial-gradient(120% 90% at 70% 20%,color-mix(in srgb,var(--accent) 18%,transparent),var(--bg2))}
.cv3 .hero-scrim{position:absolute;inset:0}
.cv3 .hero-inner{position:relative;z-index:2;width:100%;padding-bottom:clamp(36px,7vh,84px)}
.cv3 .ticker{display:inline-flex;align-items:center;gap:9px;font-family:var(--mono);font-size:12.5px;font-weight:500;letter-spacing:.08em;padding:7px 14px;border:1px solid var(--line2);border-radius:999px;color:var(--ink);background:var(--chip)}
.cv3 .ticker .dot{width:6px;height:6px;border-radius:50%;background:var(--accent)}
.cv3 .hero h1{font-size:clamp(48px,10vw,130px);line-height:.92;letter-spacing:-.035em;font-weight:800;margin:20px 0 0;text-wrap:balance;text-shadow:0 2px 40px rgba(0,0,0,.35)}
.cv3 .hero .lede{font-size:clamp(16px,2vw,22px);max-width:32ch;margin:18px 0 0;font-weight:500;opacity:.92}
.cv3 .thesis p{font-size:clamp(26px,4.4vw,54px);line-height:1.09;letter-spacing:-.025em;font-weight:600;text-wrap:balance;margin:0;max-width:22ch}
.cv3 .statstrip{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;margin-top:58px;background:var(--line);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.cv3 .statstrip .cell{background:var(--bg);padding:26px 20px}
.cv3 .statstrip .v{font-size:clamp(26px,3.6vw,42px);font-weight:800;letter-spacing:-.03em;line-height:1}
.cv3 .statstrip .k{font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);margin-top:12px}
.cv3 .bignum{text-align:center}
.cv3 .bignum .huge{font-size:clamp(58px,12vw,172px);font-weight:900;letter-spacing:-.05em;line-height:.9;color:var(--accent);font-variant-numeric:tabular-nums;text-wrap:balance}
.cv3 .bignum .huge .unit{font-size:.3em;font-weight:700;color:var(--ink);letter-spacing:-.01em}
.cv3 .bignum .cap{font-family:var(--mono);font-size:13px;letter-spacing:.2em;text-transform:uppercase;color:var(--dim);margin-top:22px}
.cv3 .reslegend{display:flex;justify-content:center;gap:30px;margin-top:40px;font-family:var(--mono);font-size:12.5px;color:var(--dim);flex-wrap:wrap}
.cv3 .reslegend b{color:var(--ink);font-weight:600}
.cv3 .flag{display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--line)}
.cv3 .flag .media{position:relative;min-height:400px;overflow:hidden}
.cv3 .flag .media img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.cv3 .flag .media .ph{position:absolute;inset:0;background:linear-gradient(140deg,var(--bg2),var(--bg))}
.cv3 .flag .media .lab{position:absolute;left:20px;bottom:18px;z-index:2;font-family:var(--mono);font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#fff;text-shadow:0 1px 12px rgba(0,0,0,.8)}
.cv3 .flag .data{padding:clamp(28px,3.4vw,52px);border-left:1px solid var(--line)}
.cv3 .flag .data h3{font-size:clamp(26px,3.4vw,40px);font-weight:800;letter-spacing:-.025em;margin:0}
.cv3 .flag .data .sub{color:var(--dim);margin-top:8px;font-weight:500}
.cv3 .drill{width:100%;border-collapse:collapse;margin-top:26px;font-variant-numeric:tabular-nums}
.cv3 .drill th{text-align:left;font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--faint);padding:0 0 10px;font-weight:500}
.cv3 .drill td{padding:12px 0;border-top:1px solid var(--line);font-size:15px}
.cv3 .drill td.hole{font-family:var(--mono);color:var(--dim);font-size:13px}
.cv3 .drill td.grade{text-align:right;font-weight:700;color:var(--accent)}
.cv3 .drill td.int{text-align:right}
.cv3 .why .row{display:grid;grid-template-columns:88px 1fr;gap:24px;padding:40px 0;border-top:1px solid var(--line);align-items:baseline}
.cv3 .why .row:last-child{border-bottom:1px solid var(--line)}
.cv3 .why .row .rn{font-family:var(--mono);font-size:14px;color:var(--accent);letter-spacing:.1em}
.cv3 .why .row p{margin:0;font-size:clamp(20px,2.6vw,32px);line-height:1.2;letter-spacing:-.02em;font-weight:600;text-wrap:balance}
.cv3 .team{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--line);border:1px solid var(--line)}
.cv3 .team .p{background:var(--bg);padding:22px}
.cv3 .team .p .nm{font-size:16px;font-weight:700;letter-spacing:-.01em}
.cv3 .team .p .rl{font-family:var(--mono);font-size:11px;letter-spacing:.06em;color:var(--dim);margin-top:8px;text-transform:uppercase}
.cv3 .follow{text-align:center;border-top:1px solid var(--line)}
.cv3 .follow h2{font-size:clamp(40px,7vw,92px);font-weight:800;letter-spacing:-.035em;line-height:.95;margin:0;text-wrap:balance}
.cv3 .follow .cta{font-family:var(--mono);font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim);margin-top:22px}
/* Portfolio / Capital / Timeline / Catalyst */
.cv3 .proj{display:grid;gap:1px;background:var(--line);border:1px solid var(--line)}
.cv3 .proj .pr{background:var(--bg);padding:clamp(20px,2.4vw,32px);display:grid;grid-template-columns:1fr auto;gap:16px;align-items:start}
.cv3 .proj .pr .pn{font-size:clamp(20px,2.4vw,30px);font-weight:800;letter-spacing:-.02em}
.cv3 .proj .pr .pmeta{font-family:var(--mono);font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--dim);margin-top:8px}
.cv3 .proj .pr .po{color:var(--dim);margin-top:12px;font-size:14px;line-height:1.5;max-width:64ch}
.cv3 .proj .pr .ptag{font-family:var(--mono);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);border:1px solid var(--line2);border-radius:999px;padding:5px 11px;white-space:nowrap}
.cv3 .capgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);border:1px solid var(--line)}
.cv3 .capgrid .cc{background:var(--bg);padding:22px}
.cv3 .capgrid .cc .ck{font-family:var(--mono);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim)}
.cv3 .capgrid .cc .cv{font-size:clamp(20px,2.4vw,30px);font-weight:800;letter-spacing:-.02em;margin-top:10px;font-variant-numeric:tabular-nums}
.cv3 .prog{margin-top:22px}
.cv3 .prog .bar{height:8px;border-radius:999px;background:var(--line);overflow:hidden}
.cv3 .prog .bar i{display:block;height:100%;background:var(--accent);border-radius:999px;transition:width 1.2s cubic-bezier(.22,1,.36,1)}
.cv3 .prog .pl{display:flex;justify-content:space-between;margin-top:12px;font-family:var(--mono);font-size:12px;color:var(--dim)}
.cv3 .tl .te{display:grid;grid-template-columns:120px 1fr;gap:20px;padding:20px 0;border-top:1px solid var(--line);align-items:baseline}
.cv3 .tl .te .td{font-family:var(--mono);font-size:12px;color:var(--accent);letter-spacing:.04em}
.cv3 .tl .te .th{font-size:clamp(16px,1.8vw,21px);font-weight:700;letter-spacing:-.01em}
.cv3 .tl .te .tw{color:var(--dim);margin-top:6px;font-size:13.5px;line-height:1.5}
.cv3 .cat{display:flex;gap:16px;align-items:center;border:1px solid var(--line2);border-radius:16px;padding:24px clamp(20px,2.4vw,32px);background:var(--chip)}
.cv3 .cat .ci{font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
.cv3 .cat .cn{font-size:clamp(20px,2.6vw,30px);font-weight:800;letter-spacing:-.02em;margin-top:6px}
.cv3 .cat .cw{color:var(--dim);margin-top:6px;font-size:14px}
@media(max-width:820px){.cv3 .capgrid{grid-template-columns:repeat(2,1fr)}.cv3 .proj .pr{grid-template-columns:1fr}.cv3 .tl .te{grid-template-columns:1fr;gap:6px}}
/* Atlas map */
.cv3 .m-bg{fill:var(--bg2)}.cv3 .m-grid{stroke:var(--line)}.cv3 .m-acc{fill:var(--accent)}.cv3 .m-accs{stroke:var(--accent)}.cv3 .m-ink{fill:var(--ink)}.cv3 .m-dim{fill:var(--dim)}
.cv3 svg text{font-family:var(--mono)}
.cv3 .atlas-hero{position:relative;min-height:100vh;display:grid;grid-template-columns:1.05fr .95fr}
.cv3 .atlas-map{position:relative;min-height:520px;background:var(--bg2);border-right:1px solid var(--line);overflow:hidden}
.cv3 .atlas-map svg{position:absolute;inset:0;width:100%;height:100%}
.cv3 .atlas-copy{padding:clamp(30px,6vw,90px);align-self:center}
.cv3 .atlas-copy .ek{font-family:var(--mono);font-size:12px;letter-spacing:.24em;text-transform:uppercase;color:var(--accent)}
.cv3 .atlas-copy h1{font-size:clamp(40px,6vw,84px);line-height:.94;letter-spacing:-.035em;font-weight:800;margin:16px 0 0;text-wrap:balance}
.cv3 .atlas-copy .lede{font-size:clamp(16px,1.7vw,20px);color:var(--dim);max-width:34ch;margin:20px 0 0;line-height:1.5}
.cv3 .atlas-copy .ticker{margin-top:24px}
.cv3 .maptools{position:absolute;left:16px;top:16px;z-index:5;display:flex;flex-wrap:wrap;gap:6px;max-width:80%}
.cv3 .maptools button{font-family:var(--mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;padding:6px 10px;border-radius:999px;border:1px solid var(--line2);background:color-mix(in srgb,var(--bg) 55%,transparent);color:var(--dim);cursor:pointer;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
.cv3 .maptools button[aria-pressed="true"]{color:var(--bg);background:var(--accent);border-color:var(--accent)}
.cv3 .mapfacts{position:absolute;right:16px;bottom:16px;z-index:5;font-family:var(--mono);font-size:11px;color:var(--dim);text-align:right;line-height:1.7}
.cv3 .mapfacts b{color:var(--ink)}
.cv3 .maptip{position:absolute;z-index:6;pointer-events:none;font-family:var(--mono);font-size:11px;padding:5px 8px;border-radius:7px;background:var(--ink);color:var(--bg);opacity:0;transform:translate(-50%,-140%);transition:opacity .12s;white-space:nowrap;font-weight:600}
.cv3 .drillhole{cursor:pointer}
@media (max-width:900px){.cv3 .atlas-hero{grid-template-columns:1fr}.cv3 .atlas-map{min-height:62vh;border-right:none;border-bottom:1px solid var(--line)}}
/* Ledger */
.cv3 .ledger-hero{padding:clamp(80px,14vh,170px) 0 clamp(40px,7vh,80px)}
.cv3 .ledger-hero .ek{font-family:var(--mono);font-size:12px;letter-spacing:.24em;text-transform:uppercase;color:var(--accent)}
.cv3 .ledger-hero h1{font-family:var(--serif);font-weight:500;font-size:clamp(40px,7.5vw,108px);line-height:1;letter-spacing:-.02em;margin:22px 0 0;text-wrap:balance}
.cv3 .ledger-hero h1 em{font-style:italic;color:var(--accent)}
.cv3 .ledger-hero .lede{font-size:clamp(16px,1.9vw,21px);max-width:54ch;margin:24px 0 0;line-height:1.5;color:var(--dim)}
.cv3 .ledger-hero .ticker{margin-top:24px}
.cv3 .lgrid{display:grid;grid-template-columns:repeat(12,1fr);gap:1px;background:var(--line);border:1px solid var(--line)}
.cv3 .lcell{background:var(--bg);padding:clamp(22px,2.6vw,34px)}
.cv3 .lcell.c6{grid-column:span 6}.cv3 .lcell.c4{grid-column:span 4}.cv3 .lcell.c8{grid-column:span 8}.cv3 .lcell.c12{grid-column:span 12}
.cv3 .lcell .lh{font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim)}
.cv3 .lcell .lbig{font-family:var(--serif);font-size:clamp(38px,5.4vw,68px);font-weight:500;letter-spacing:-.02em;line-height:1;margin-top:14px;color:var(--accent);font-variant-numeric:tabular-nums}
.cv3 .lcell .lbig small{font-size:.32em;color:var(--ink);font-family:var(--font);font-weight:700;letter-spacing:0;margin-left:4px}
.cv3 .lcell .lsub{color:var(--dim);margin-top:14px;font-size:13.5px;line-height:1.5}
.cv3 .gradechart{display:flex;align-items:flex-end;gap:8px;height:150px;margin-top:6px}
.cv3 .gradechart .gb{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:8px}
.cv3 .gradechart .gb i{width:100%;background:var(--accent);border-radius:3px 3px 0 0;transition:height 1s cubic-bezier(.22,1,.36,1)}
.cv3 .gradechart .gb .gl{font-family:var(--mono);font-size:10px;color:var(--dim);letter-spacing:.04em}
.cv3 .gradechart .gb .gv{font-family:var(--mono);font-size:11px;font-weight:600;color:var(--ink)}
.cv3 .cap-tl .ev{display:grid;grid-template-columns:auto 1fr;gap:18px;padding:14px 0;border-top:1px solid var(--line);align-items:baseline}
.cv3 .cap-tl .ev:first-child{border-top:none}
.cv3 .cap-tl .ev .amt{font-family:var(--serif);font-size:24px;color:var(--accent);font-variant-numeric:tabular-nums;white-space:nowrap}
.cv3 .cap-tl .ev .meta b{font-weight:700}.cv3 .cap-tl .ev .meta span{color:var(--dim);font-family:var(--mono);font-size:11px;letter-spacing:.04em;display:block;margin-top:3px}
.cv3 .lquote{font-family:var(--serif);font-size:clamp(22px,3.2vw,40px);font-weight:500;line-height:1.26;letter-spacing:-.01em;text-wrap:balance}
.cv3 .lquote em{color:var(--accent);font-style:italic}
@media (max-width:820px){.cv3 .lcell.c6,.cv3 .lcell.c4,.cv3 .lcell.c8{grid-column:span 12}}
/* Strata */
.cv3 .strata-top{padding:clamp(76px,12vh,140px) 0 36px}
.cv3 .strata-top .ek{font-family:var(--mono);font-size:12px;letter-spacing:.24em;text-transform:uppercase;color:var(--accent)}
.cv3 .strata-top h1{font-size:clamp(38px,6vw,84px);line-height:.96;letter-spacing:-.03em;font-weight:800;margin:16px 0 0;text-wrap:balance}
.cv3 .strata-top .lede{font-size:clamp(16px,1.7vw,20px);color:var(--dim);max-width:48ch;margin:20px 0 0;line-height:1.5}
.cv3 .xsec{position:relative;margin-top:22px;background:var(--bg2);border:1px solid var(--line)}
.cv3 .xsec svg{width:100%;height:auto;display:block}
.cv3 .xseg{cursor:pointer}
.cv3 .x-hole{stroke:var(--faint)}.cv3 .x-surface{stroke:var(--ink)}
.cv3 .strata-legend{display:flex;gap:24px;flex-wrap:wrap;margin-top:20px;font-family:var(--mono);font-size:11.5px;color:var(--dim);letter-spacing:.04em}
.cv3 .strata-legend b{color:var(--ink)}.cv3 .strata-legend .gr{display:inline-block;width:26px;height:8px;border-radius:2px;vertical-align:middle;margin-right:8px}
/* Keynote */
.cv3 .kn-scene{height:100vh;min-height:600px;display:grid;place-items:center;text-align:center;position:relative;overflow:hidden;padding:0 20px}
.cv3 .kn-scene .knc{position:relative;z-index:2;max-width:1100px}
.cv3 .kn-scene h2{font-size:clamp(52px,12vw,180px);font-weight:800;letter-spacing:-.045em;line-height:.9;margin:0;text-wrap:balance}
.cv3 .kn-scene .sub{font-family:var(--mono);font-size:clamp(12px,1.4vw,15px);letter-spacing:.22em;text-transform:uppercase;color:var(--dim);margin-top:24px}
.cv3 .kn-scene .big{font-size:clamp(80px,22vw,300px);font-weight:900;letter-spacing:-.05em;line-height:.8;color:var(--accent);font-variant-numeric:tabular-nums}
.cv3 .kn-scene .big .unit{font-size:.24em;color:var(--ink);font-weight:700}
.cv3 .kn-scene img.knbg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.cv3 .kn-scene .knscrim{position:absolute;inset:0;background:radial-gradient(120% 100% at 50% 50%,transparent 30%,var(--bg) 92%)}
.cv3 .kn-scene .ticker{margin-top:28px}
/* Terminal */
/* ══ Template 06 · TERMINAL — investor intelligence system. Obsidian ground + champagne gold + mono.
   A persistent instrument HUD frames a workspace of full-viewport STATES (vertical scroll-snap). Modules
   mount via clip-wipes + a scan sweep; assets and geography are interactive. Namespace: trm. ══ */
/* base palette = Obsidian · champagne gold (default). Each theme variant re-tokens the whole instrument
   below — dark grounds keep the terminal aesthetic; light grounds (graphite / porcelain / harbor) flip
   it to a bright console. All Terminal colour comes through these tokens, so every variant stays legible. */
.cv3 .trm{--bg:#0a0a0c;--panel:#111116;--panel2:#17171d;--ink:#f0efe9;--dim:#9a988f;--faint:#5c5a54;--acc:#caa96b;--acc2:#e6cf9c;--line:rgba(240,239,233,.10);--line2:rgba(240,239,233,.20);--grid:rgba(240,239,233,.04);--g1:#131319;--g2:#0b0b0e;
  position:relative;height:100vh;overflow-y:auto;overflow-x:hidden;scroll-snap-type:y mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none;background:var(--bg);color:var(--ink);font-family:var(--mono)}
.cv3 .trm::-webkit-scrollbar{display:none}
/* ── Terminal colour options (pick via ?theme= / Studio) ── */
.cv3[data-variant="meridian"] .trm{--bg:#0a0e14;--panel:#111721;--panel2:#161d29;--ink:#eaeef4;--dim:#8c94a2;--faint:#4e5666;--acc:#5fb2cf;--acc2:#9bd6e8;--line:rgba(234,238,244,.10);--line2:rgba(234,238,244,.20);--grid:rgba(234,238,244,.04);--g1:#131a26;--g2:#0c1017}
.cv3[data-variant="cellar"] .trm{--bg:#100d0b;--panel:#1a1511;--panel2:#201a15;--ink:#f1eae2;--dim:#a89a8c;--faint:#675c50;--acc:#cf7043;--acc2:#e39b73;--line:rgba(241,234,226,.10);--line2:rgba(241,234,226,.20);--grid:rgba(241,234,226,.04);--g1:#1c1610;--g2:#0d0a08}
.cv3[data-variant="pine"] .trm{--bg:#0b0f0c;--panel:#121a14;--panel2:#172013;--ink:#eaf0ea;--dim:#92a396;--faint:#55625a;--acc:#c2a15c;--acc2:#ddc389;--line:rgba(234,240,234,.10);--line2:rgba(234,240,234,.20);--grid:rgba(234,240,234,.04);--g1:#121a16;--g2:#0a0d0b}
.cv3[data-variant="amethyst"] .trm{--bg:#0d0b12;--panel:#16121d;--panel2:#1b1624;--ink:#efebf3;--dim:#a099ab;--faint:#605a6c;--acc:#a690d8;--acc2:#c8b6ec;--line:rgba(239,235,243,.10);--line2:rgba(239,235,243,.20);--grid:rgba(239,235,243,.04);--g1:#161020;--g2:#0b0810}
/* light grounds — the original grey + orange (graphite) the user first presented, plus two more */
.cv3[data-variant="graphite"] .trm{--bg:#eceef1;--panel:#e4e7ea;--panel2:#dbdfe4;--ink:#14171c;--dim:#5b6069;--faint:#9aa1ab;--acc:#ff7a1a;--acc2:#ff9d4d;--line:rgba(20,23,28,.12);--line2:rgba(20,23,28,.22);--grid:rgba(20,23,28,.05);--g1:#f3f5f7;--g2:#e7eaee}
.cv3[data-variant="porcelain"] .trm{--bg:#f5f5f6;--panel:#ecedee;--panel2:#e4e5e7;--ink:#1a1a1d;--dim:#64666b;--faint:#a8abb0;--acc:#b5482f;--acc2:#d06b52;--line:rgba(26,26,29,.12);--line2:rgba(26,26,29,.22);--grid:rgba(26,26,29,.05);--g1:#fafafb;--g2:#eff0f1}
.cv3[data-variant="harbor"] .trm{--bg:#eef1f1;--panel:#e5e9e9;--panel2:#dde2e2;--ink:#12191a;--dim:#566063;--faint:#9aa6a7;--acc:#1f6b66;--acc2:#2f8f88;--line:rgba(18,25,26,.12);--line2:rgba(18,25,26,.22);--grid:rgba(18,25,26,.05);--g1:#f3f6f6;--g2:#e9eded}
.cv3 .trm-ground{position:fixed;inset:0;z-index:0;pointer-events:none;background:radial-gradient(130% 90% at 50% -8%,var(--g1) 0%,var(--g2) 55%,var(--bg) 100%)}
.cv3 .trm-ground::before{content:"";position:absolute;inset:0;background-image:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px);background-size:48px 48px;-webkit-mask-image:radial-gradient(115% 80% at 50% 42%,#000 22%,transparent 88%);mask-image:radial-gradient(115% 80% at 50% 42%,#000 22%,transparent 88%)}
/* persistent instrument HUD (viewfinder corners + contextual readouts) */
.cv3 .trm-hud{position:fixed;inset:0;z-index:40;pointer-events:none;font-family:var(--mono)}
.cv3 .trm-hud .cnr{position:absolute;width:13px;height:13px;border:1.5px solid var(--line2)}
.cv3 .trm-hud .cnr.tl{top:15px;left:15px;border-right:0;border-bottom:0}
.cv3 .trm-hud .cnr.tr{top:15px;right:15px;border-left:0;border-bottom:0}
.cv3 .trm-hud .cnr.bl{bottom:15px;left:15px;border-right:0;border-top:0}
.cv3 .trm-hud .cnr.br{bottom:15px;right:15px;border-left:0;border-top:0}
.cv3 .trm-h{position:absolute;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);line-height:1.55}
.cv3 .trm-h .g{color:var(--acc)}
.cv3 .trm-h.tl{top:23px;left:36px}
.cv3 .trm-h.tr{top:23px;right:36px;text-align:right}
.cv3 .trm-h.bl{bottom:23px;left:36px}
.cv3 .trm-h.br{bottom:23px;right:36px;text-align:right}
.cv3 .trm-meter{display:flex;gap:3px;margin-top:8px;justify-content:flex-end}
.cv3 .trm-meter i{width:13px;height:3px;background:var(--line2);transition:background .3s}
.cv3 .trm-meter i.on{background:var(--acc)}
/* states */
.cv3 .trm-state{min-height:100vh;scroll-snap-align:start;position:relative;z-index:1;display:flex;flex-direction:column;justify-content:center;padding:clamp(74px,12vh,130px) clamp(30px,7vw,120px);overflow:hidden}
.cv3 .trm-in{width:100%;max-width:1200px;margin:0 auto;position:relative}
.cv3 .trm-scan{position:absolute;left:-8vw;right:-8vw;top:0;height:2px;background:linear-gradient(90deg,transparent,var(--acc),transparent);opacity:0;pointer-events:none;z-index:5}
.cv3 .trm-state.act .trm-scan{animation:trmscan 1.05s cubic-bezier(.5,0,.2,1) .04s}
@keyframes trmscan{0%{opacity:.85;transform:translateY(-6vh)}100%{opacity:0;transform:translateY(64vh)}}
/* computational reveal primitives: a clip-wipe (default) + a restrained rise */
.cv3 .trm-wipe{clip-path:inset(0 100% 0 0);transition:clip-path .72s cubic-bezier(.66,0,.2,1)}
.cv3 .trm-state.act .trm-wipe{clip-path:inset(0 0 0 0)}
.cv3 .trm-rise{opacity:0;transform:translateY(12px);transition:opacity .55s ease,transform .55s cubic-bezier(.2,1,.3,1)}
.cv3 .trm-state.act .trm-rise{opacity:1;transform:none}
.cv3 .trm-modk{font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:var(--acc);margin-bottom:clamp(22px,3.4vh,38px);padding-left:16px;position:relative;width:fit-content}
.cv3 .trm-modk::before{content:"";position:absolute;left:0;top:50%;width:8px;height:8px;background:var(--acc);transform:translateY(-50%)}
@media(prefers-reduced-motion:reduce){.cv3 .trm-wipe{clip-path:none!important}.cv3 .trm-rise{opacity:1!important;transform:none!important}.cv3 .trm-scan{display:none}}
/* IDENTITY */
.cv3 .trm-boot-k{font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:var(--acc);width:fit-content}
.cv3 .trm-boot-name{font-family:var(--font);font-weight:800;letter-spacing:-.045em;line-height:.9;font-size:clamp(52px,11vw,166px);margin:clamp(16px,3vh,34px) 0 0;width:fit-content;max-width:100%}
.cv3 .trm-boot-sub{font-family:var(--font);font-size:clamp(17px,2.1vw,28px);line-height:1.4;color:var(--dim);max-width:40ch;margin:clamp(18px,3vh,30px) 0 0;width:fit-content}
.cv3 .trm-boot-chips{display:flex;flex-wrap:wrap;gap:10px;margin-top:clamp(24px,4vh,40px)}
.cv3 .trm-boot-chips span{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink);border:1px solid var(--line2);padding:8px 14px}
/* PRIMARY SIGNAL / mega readout */
.cv3 .trm-sig{display:flex;align-items:flex-end;gap:clamp(20px,4vw,60px);flex-wrap:wrap}
.cv3 .trm-mega{font-family:var(--font);font-weight:800;letter-spacing:-.045em;line-height:.82;font-variant-numeric:tabular-nums;font-size:clamp(74px,17vw,264px);color:var(--ink)}
.cv3 .trm-mega .u{font-size:.22em;font-weight:700;letter-spacing:0;color:var(--acc);margin-left:.1em}
.cv3 .trm-sig-side{padding-bottom:clamp(8px,2vh,26px);max-width:30ch}
.cv3 .trm-sig-k{font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--acc)}
.cv3 .trm-sig-note{font-size:clamp(13px,1.5vw,17px);line-height:1.5;color:var(--dim);margin-top:12px}
.cv3 .trm-vitals{display:flex;flex-wrap:wrap;gap:clamp(24px,5vw,72px);margin-top:clamp(34px,6vh,68px);border-top:1px solid var(--line);padding-top:clamp(20px,3vh,34px)}
.cv3 .trm-vitals .fk{font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint)}
.cv3 .trm-vitals .fv{font-family:var(--font);font-size:clamp(17px,2vw,26px);font-weight:600;color:var(--ink);margin-top:9px}
/* ASSET REGISTER */
.cv3 .trm-assets-grid{display:grid;grid-template-columns:minmax(210px,.9fr) 1.65fr;gap:clamp(20px,3vw,48px);align-items:start}
@media(max-width:860px){.cv3 .trm-assets-grid,.cv3 .trm-spatial-grid{grid-template-columns:1fr!important}}
.cv3 .trm-list{display:flex;flex-direction:column;border-top:1px solid var(--line)}
.cv3 .trm-list .row{display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:baseline;text-align:left;background:none;border:0;border-bottom:1px solid var(--line);padding:16px 8px 16px 16px;cursor:pointer;color:var(--dim);position:relative;font-family:var(--mono);transition:color .25s,background .25s}
.cv3 .trm-list .row::before{content:"";position:absolute;left:0;top:0;bottom:0;width:2px;background:var(--acc);transform:scaleY(0);transform-origin:top;transition:transform .3s}
.cv3 .trm-list .row.on::before{transform:scaleY(1)}
.cv3 .trm-list .row.on{color:var(--ink);background:var(--panel)}
.cv3 .trm-list .row .rn{font-size:11px;color:var(--acc);font-variant-numeric:tabular-nums}
.cv3 .trm-list .row .rt{font-family:var(--font);font-weight:600;font-size:clamp(15px,1.7vw,20px);letter-spacing:-.01em}
.cv3 .trm-list .row .rs{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--faint);white-space:nowrap}
.cv3 .trm-detail{min-width:0}
.cv3 .trm-media{position:relative;aspect-ratio:16/10;background:var(--panel);border:1px solid var(--line2);overflow:hidden}
.cv3 .trm-media img{width:100%;height:100%;object-fit:cover;filter:contrast(1.04) saturate(.94);animation:trmreveal .6s cubic-bezier(.5,0,.2,1)}
@keyframes trmreveal{from{clip-path:inset(0 0 100% 0)}to{clip-path:inset(0 0 0 0)}}
.cv3 .trm-media-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:11px;letter-spacing:.2em;color:var(--faint)}
.cv3 .trm-media .fr{position:absolute;width:14px;height:14px;border:1.5px solid var(--acc);z-index:2}
.cv3 .trm-media .fr.tl{top:10px;left:10px;border-right:0;border-bottom:0}
.cv3 .trm-media .fr.tr{top:10px;right:10px;border-left:0;border-bottom:0}
.cv3 .trm-media .fr.bl{bottom:10px;left:10px;border-right:0;border-top:0}
.cv3 .trm-media .fr.br{bottom:10px;right:10px;border-left:0;border-top:0}
.cv3 .trm-media .cap{position:absolute;left:0;right:0;bottom:0;display:flex;justify-content:space-between;align-items:flex-end;gap:12px;padding:16px 18px;background:linear-gradient(0deg,rgba(8,8,10,.88),transparent);z-index:2}
.cv3 .trm-media .cap .cn{font-family:var(--font);font-weight:700;font-size:clamp(16px,1.9vw,24px);color:#fff}
.cv3 .trm-media .cap .cl{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--acc);white-space:nowrap}
.cv3 .trm-dfacts{display:grid;grid-template-columns:repeat(2,1fr);gap:1px;background:var(--line);border:1px solid var(--line);margin-top:14px}
.cv3 .trm-dfacts .df{background:var(--bg);padding:13px 16px;display:flex;flex-direction:column;gap:7px}
.cv3 .trm-dfacts .dk{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--faint)}
.cv3 .trm-dfacts .dv{font-family:var(--font);font-size:clamp(14px,1.5vw,18px);font-weight:600;color:var(--ink)}
.cv3 .trm-dov{font-size:clamp(13px,1.5vw,16px);line-height:1.55;color:var(--dim);margin-top:14px;max-width:64ch}
/* SPATIAL */
.cv3 .trm-spatial-grid{display:grid;grid-template-columns:minmax(210px,.9fr) 1.5fr;gap:clamp(20px,3vw,48px);align-items:stretch}
.cv3 .trm-map{position:relative;border:1px solid var(--line2);background:var(--panel);min-height:clamp(300px,52vh,520px);display:flex;align-items:center;justify-content:center;overflow:hidden}
.cv3 .trm-map-svg{width:min(60%,320px);height:76%;overflow:visible}
.cv3 .trm-map-shape{fill:color-mix(in srgb,var(--acc) 6%,transparent);stroke:var(--line2);stroke-width:1}
.cv3 .trm-node .dot{fill:var(--dim);transition:fill .3s,r .3s}
.cv3 .trm-node .nl{fill:var(--faint);font-family:var(--mono);font-size:4px;letter-spacing:.5px;transition:fill .3s}
.cv3 .trm-node.on .dot{fill:var(--acc);r:3.4}
.cv3 .trm-node.on .nl{fill:var(--acc)}
.cv3 .trm-map-hud{position:absolute;left:0;right:0;bottom:0;display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);border-top:1px solid var(--line)}
.cv3 .trm-map-hud .mh{background:var(--bg);padding:11px 14px;display:flex;flex-direction:column;gap:6px}
.cv3 .trm-map-hud .mh .k{font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--faint)}
.cv3 .trm-map-hud .mh .v{font-family:var(--font);font-size:clamp(12px,1.3vw,15px);font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums}
@media(max-width:860px){.cv3 .trm-map-hud{grid-template-columns:repeat(2,1fr)}}
.cv3 .trm-locator{display:flex;flex-direction:column;align-items:center;gap:22px}
.cv3 .trm-loc-ring{position:relative;width:clamp(130px,20vw,190px);height:clamp(130px,20vw,190px)}
.cv3 .trm-loc-ring span{position:absolute;inset:0;border:1px solid var(--line2);border-radius:50%}
.cv3 .trm-loc-ring span:nth-child(2){inset:22%;border-color:var(--line)}
.cv3 .trm-loc-ring span:nth-child(3){inset:44%;border-color:var(--acc);opacity:.6}
.cv3 .trm-loc-name{font-family:var(--font);font-weight:700;font-size:clamp(20px,2.4vw,32px);color:var(--ink)}
.cv3 .trm-foot{font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--faint);margin-top:clamp(16px,2.5vh,26px)}
/* EVIDENCE */
.cv3 .trm-ev{display:flex;flex-direction:column;border-top:1px solid var(--line)}
.cv3 .trm-ev .evr{display:grid;grid-template-columns:130px 1fr auto 32%;gap:clamp(14px,2vw,30px);align-items:center;padding:15px 8px;border-bottom:1px solid var(--line)}
.cv3 .trm-ev .evr.top{padding:24px 8px}
.cv3 .trm-ev .evr.top .eg{font-size:clamp(24px,3vw,42px);color:var(--acc)}
.cv3 .trm-ev .eh{font-size:12px;color:var(--dim)}
.cv3 .trm-ev .ei{font-size:12px;color:var(--faint)}
.cv3 .trm-ev .eg{font-family:var(--font);font-weight:700;font-size:clamp(15px,1.8vw,22px);color:var(--ink);font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}
.cv3 .trm-ev .eb{height:6px;background:var(--panel);position:relative;overflow:hidden}
.cv3 .trm-ev .eb i{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(90deg,var(--acc2),var(--acc))}
@media(max-width:760px){.cv3 .trm-ev .evr{grid-template-columns:auto 1fr auto}.cv3 .trm-ev .ei,.cv3 .trm-ev .eb{display:none}}
/* TREASURY */
.cv3 .trm-treasury{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--line);border:1px solid var(--line)}
@media(max-width:760px){.cv3 .trm-treasury{grid-template-columns:repeat(2,1fr)}}
.cv3 .trm-treasury .tf{background:var(--bg);padding:clamp(20px,3.4vh,36px) clamp(18px,2vw,28px)}
.cv3 .trm-treasury .tfv{font-family:var(--font);font-weight:800;letter-spacing:-.02em;font-size:clamp(28px,4vw,58px);color:var(--ink);font-variant-numeric:tabular-nums;line-height:.95}
.cv3 .trm-treasury .tfv .u{font-size:.4em;color:var(--acc);font-weight:700;margin-left:.1em}
.cv3 .trm-treasury .tfk{font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--faint);margin-top:14px}
/* SYSTEM LOG */
.cv3 .trm-log{display:flex;flex-direction:column;border-top:1px solid var(--line)}
.cv3 .trm-log .lg{display:grid;grid-template-columns:132px 1fr auto;gap:clamp(14px,2vw,28px);align-items:baseline;padding:16px 8px;border-bottom:1px solid var(--line)}
.cv3 .trm-log .lg .lt{font-size:12px;color:var(--dim);font-variant-numeric:tabular-nums}
.cv3 .trm-log .lg .lh{font-family:var(--font);font-weight:600;font-size:clamp(14px,1.6vw,19px);color:var(--ink);display:block;line-height:1.2}
.cv3 .trm-log .lg .lw{font-size:12px;color:var(--faint);margin-top:7px;display:block;max-width:58ch;line-height:1.45}
.cv3 .trm-log .lg .ls{font-size:9.5px;letter-spacing:.14em;color:var(--faint);white-space:nowrap}
.cv3 .trm-log .lg.pend .lt,.cv3 .trm-log .lg.pend .ls{color:var(--acc)}
.cv3 .trm-log .lg.pend{background:linear-gradient(90deg,color-mix(in srgb,var(--acc) 7%,transparent),transparent 62%)}
/* RESOLVE */
.cv3 .trm-concl{display:flex;flex-direction:column;gap:clamp(10px,1.6vh,16px);margin-bottom:clamp(30px,5vh,56px)}
.cv3 .trm-concl .cc{display:grid;grid-template-columns:auto 1fr;gap:clamp(14px,2vw,26px);align-items:baseline;border-bottom:1px solid var(--line);padding-bottom:clamp(10px,1.6vh,16px)}
.cv3 .trm-concl .ci{font-size:12px;color:var(--acc);font-variant-numeric:tabular-nums}
.cv3 .trm-concl .ct{font-family:var(--font);font-weight:600;font-size:clamp(16px,2vw,26px);letter-spacing:-.01em;line-height:1.32;color:var(--ink)}
.cv3 .trm-final{border:1px solid var(--line2);background:var(--panel);padding:clamp(24px,4vh,44px)}
.cv3 .trm-final-k{font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--acc)}
.cv3 .trm-final-name{font-family:var(--font);font-weight:800;letter-spacing:-.03em;font-size:clamp(26px,4vw,56px);margin-top:14px;color:var(--ink)}
.cv3 .trm-final-feat{display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:20px}
.cv3 .trm-final-feat span{font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim)}
/* Dossier */
.cv3 .dos-head{padding:clamp(76px,13vh,150px) 0 36px;border-bottom:2px solid var(--ink)}
.cv3 .dos-head .dl{font-family:var(--mono);font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--accent);display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px}
.cv3 .dos-head h1{font-family:var(--serif);font-weight:500;font-size:clamp(42px,7.5vw,100px);line-height:.98;letter-spacing:-.02em;margin:22px 0 0;text-wrap:balance}
.cv3 .dos-head .dek{font-size:clamp(16px,2vw,22px);color:var(--dim);max-width:60ch;margin:22px 0 8px;line-height:1.5;font-weight:500}
.cv3 .dos-body{columns:2;column-gap:48px;padding:42px 0;font-size:15.5px;line-height:1.7}
.cv3 .dos-body p{margin:0 0 18px;break-inside:avoid}
.cv3 .dos-body p:first-child::first-letter{font-family:var(--serif);font-size:3.4em;line-height:.8;float:left;margin:6px 10px 0 0;color:var(--accent)}
.cv3 .dos-fig{margin:20px 0;position:relative}.cv3 .dos-fig img{width:100%;aspect-ratio:16/7;object-fit:cover}
.cv3 .dos-fig figcaption{font-family:var(--mono);font-size:11px;color:var(--dim);margin-top:10px;letter-spacing:.04em}
.cv3 .dos-pull{font-family:var(--serif);font-weight:500;font-size:clamp(24px,3.8vw,44px);line-height:1.2;letter-spacing:-.01em;text-align:center;padding:44px 6%;text-wrap:balance;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.cv3 .dos-pull em{color:var(--accent);font-style:italic}
.cv3 .dos-facts{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);border:1px solid var(--line);margin:44px 0}
.cv3 .dos-facts .df{background:var(--bg);padding:22px}.cv3 .dos-facts .df .k{font-family:var(--mono);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim)}
.cv3 .dos-facts .df .v{font-family:var(--serif);font-size:clamp(26px,3.6vw,42px);color:var(--accent);margin-top:8px;font-variant-numeric:tabular-nums}
@media(max-width:720px){.cv3 .dos-body{columns:1}.cv3 .dos-facts{grid-template-columns:repeat(2,1fr)}}
.cv3 .dos-sec{padding:46px 0;border-top:1px solid var(--line)}
.cv3 .dos-sec .dh{font-family:var(--serif);font-size:clamp(26px,3.6vw,44px);font-weight:500;letter-spacing:-.01em;margin:0 0 26px}
.cv3 .dos-proj{padding:20px 0;border-bottom:1px solid var(--line);break-inside:avoid}
.cv3 .dos-proj h4{font-family:var(--serif);font-size:clamp(20px,2.4vw,28px);font-weight:500;margin:0;letter-spacing:-.01em}
.cv3 .dos-proj .pm{font-family:var(--mono);font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);margin-top:6px}
.cv3 .dos-proj p{margin:12px 0 0;color:var(--dim);font-size:15.5px;line-height:1.65;max-width:72ch}
.cv3 .dos-lead{font-size:clamp(18px,2vw,24px);line-height:1.65;max-width:66ch;font-weight:500}
.cv3 .dos-lead b{color:var(--accent);font-weight:600}
.cv3 .dos-chron{columns:2;column-gap:48px}
.cv3 .dos-chron .ce{break-inside:avoid;margin:0 0 18px}
.cv3 .dos-chron .cd{font-family:var(--mono);font-size:11px;color:var(--accent);letter-spacing:.06em}
.cv3 .dos-chron .ch{font-weight:700;margin-top:3px;line-height:1.35}
.cv3 .dos-mast{font-size:16.5px;line-height:1.95;columns:2;column-gap:48px}
.cv3 .dos-mast div{break-inside:avoid}.cv3 .dos-mast b{font-weight:700}.cv3 .dos-mast span{color:var(--dim)}
@media(max-width:720px){.cv3 .dos-chron,.cv3 .dos-mast{columns:1}}
/* Index */
.cv3 .idx{min-height:100vh;display:flex;flex-direction:column;justify-content:center;padding:14vh clamp(20px,6vw,90px)}
.cv3 .idx .top{font-family:var(--mono);font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--dim);display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px}
.cv3 .idx h1{font-size:clamp(46px,11vw,170px);font-weight:800;letter-spacing:-.045em;line-height:.9;margin:clamp(40px,12vh,110px) 0 0;text-wrap:balance}
.cv3 .idx h1 em{font-style:normal;color:var(--accent)}
.cv3 .idx .figs{display:flex;flex-wrap:wrap;gap:clamp(28px,5vw,70px);margin-top:clamp(48px,12vh,110px);border-top:1px solid var(--line);padding-top:34px}
.cv3 .idx .figs .fg .n{font-size:clamp(26px,3.4vw,44px);font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.cv3 .idx .figs .fg .l{font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);margin-top:8px}
.cv3 .idx .foot-line{margin-top:auto;padding-top:40px;font-family:var(--mono);font-size:12px;color:var(--faint);letter-spacing:.06em}
/* Keynote body — one idea per full-screen scene */
.cv3 .kn-list{display:flex;flex-direction:column;gap:20px;margin-top:36px}
.cv3 .kn-list .kn-li b{font-size:clamp(30px,5.4vw,72px);font-weight:800;letter-spacing:-.035em;display:block;line-height:1}
.cv3 .kn-list .kn-li span{font-family:var(--mono);font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);display:block;margin-top:8px}
.cv3 .kn-cap{display:flex;gap:clamp(30px,6vw,84px);justify-content:center;flex-wrap:wrap;margin-top:38px}
.cv3 .kn-cap b{font-size:clamp(36px,7vw,100px);font-weight:900;letter-spacing:-.04em;color:var(--accent);display:block;font-variant-numeric:tabular-nums;line-height:1}
.cv3 .kn-cap span{font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);margin-top:10px;display:block}
.cv3 .kn-mast{display:flex;flex-wrap:wrap;gap:14px 36px;justify-content:center;margin-top:36px;font-size:clamp(20px,2.8vw,38px);font-weight:700;letter-spacing:-.02em}
/* Index body — ultra-minimal lists */
.cv3 .idx-body{padding:0 clamp(20px,6vw,90px) 12vh}
.cv3 .idx-sec{border-top:1px solid var(--line);padding:46px 0}
.cv3 .idx-k{font-family:var(--mono);font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--dim);margin-bottom:22px}
.cv3 .idx-proj{display:flex;justify-content:space-between;align-items:baseline;gap:20px;padding:14px 0;border-bottom:1px solid var(--line)}
.cv3 .idx-proj .idx-n{font-size:clamp(24px,3.6vw,52px);font-weight:800;letter-spacing:-.035em}
.cv3 .idx-proj .idx-m{font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--dim);white-space:nowrap;text-align:right}
.cv3 .idx-cap{display:flex;flex-wrap:wrap;gap:16px 44px;font-size:clamp(16px,1.9vw,21px)}.cv3 .idx-cap b{font-weight:800;font-variant-numeric:tabular-nums}
.cv3 .idx-tl{padding:10px 0;font-size:clamp(15px,1.8vw,20px);color:var(--ink)}.cv3 .idx-tl .idx-d{font-family:var(--mono);font-size:12px;color:var(--accent);margin-right:10px}
.cv3 .idx-team{display:flex;flex-wrap:wrap;gap:10px 30px;font-size:clamp(16px,1.9vw,23px);font-weight:700}
/* Atlas body — cartographic field register */
.cv3 .ab-body{position:relative;background-image:linear-gradient(var(--line2) 1px,transparent 1px),linear-gradient(90deg,var(--line2) 1px,transparent 1px);background-size:58px 58px;background-position:0 0}
.cv3 .ab-body::before{content:"N ⌃";position:sticky;top:16px;float:right;font-family:var(--mono);font-size:11px;letter-spacing:.2em;color:var(--dim);z-index:3}
.cv3 .ab-proj .abn::before{content:"⌖ ";color:var(--accent)}
.cv3 .ab-sec{padding:clamp(36px,6vh,72px) 0}
.cv3 .ab-h{font-family:var(--mono);font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);margin-bottom:14px;display:flex;align-items:center;gap:14px}
.cv3 .ab-h::after{content:"";flex:1;height:1px;background:var(--line)}
.cv3 .ab-proj{display:grid;grid-template-columns:56px 1fr auto;gap:24px;align-items:start;padding:26px 0;border-top:1px solid var(--line)}
.cv3 .ab-proj .abn{font-family:var(--mono);font-size:13px;color:var(--faint)}
.cv3 .ab-proj .abt{font-size:clamp(24px,3vw,40px);font-weight:800;letter-spacing:-.025em}
.cv3 .ab-proj .abo{color:var(--dim);margin-top:8px;font-size:14.5px;line-height:1.55;max-width:60ch}
.cv3 .ab-proj .abm{font-family:var(--mono);font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--dim);text-align:right;line-height:1.9;white-space:nowrap}
.cv3 .ab-ribbon{display:flex;flex-wrap:wrap;border-left:1px solid var(--line);border-top:1px solid var(--line)}
.cv3 .ab-ribbon .rc{flex:1;min-width:130px;padding:18px 20px;border-right:1px solid var(--line);border-bottom:1px solid var(--line)}
.cv3 .ab-ribbon .rc .k{font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim)}
.cv3 .ab-ribbon .rc .v{font-family:var(--mono);font-size:18px;font-weight:600;margin-top:8px;color:var(--ink)}
@media(max-width:720px){.cv3 .ab-proj{grid-template-columns:1fr}.cv3 .ab-proj .abm{text-align:left}}
/* Strata body — stacked geological bands */
.cv3 .sb-band{position:relative;padding:clamp(28px,4.5vw,52px) 0;border-top:1px solid var(--line)}
.cv3 .sb-band::before{content:"";position:absolute;left:56px;top:0;bottom:0;width:1px;background:color-mix(in srgb,var(--accent) 22%,var(--line))}
.cv3 .sb-band:nth-child(odd){background:linear-gradient(90deg,color-mix(in srgb,var(--ink) 5%,transparent),color-mix(in srgb,var(--ink) 2%,transparent) 65%,transparent)}
.cv3 .sb-band .depth{position:absolute;left:0;top:clamp(28px,4.5vw,52px);font-family:var(--mono);font-size:12px;font-weight:600;color:var(--accent);letter-spacing:.05em;z-index:2}
.cv3 .sb-band .bt{font-size:clamp(26px,3.4vw,46px);font-weight:800;letter-spacing:-.025em;margin-left:78px}
.cv3 .sb-band .bm{font-family:var(--mono);font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--dim);margin:8px 0 0 78px}
.cv3 .sb-band .bo{color:var(--dim);margin:12px 0 0 78px;font-size:15px;line-height:1.6;max-width:62ch}
.cv3 .sb-cap{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);border:1px solid var(--line);margin-top:10px}
.cv3 .sb-cap .c{background:var(--bg);padding:20px}.cv3 .sb-cap .c .k{font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim)}.cv3 .sb-cap .c .v{font-size:24px;font-weight:800;margin-top:8px;font-variant-numeric:tabular-nums}
@media(max-width:720px){.cv3 .sb-cap{grid-template-columns:repeat(2,1fr)}.cv3 .sb-band .bt,.cv3 .sb-band .bm,.cv3 .sb-band .bo{margin-left:0}.cv3 .sb-band .depth{position:static;display:block;margin-bottom:8px}}
/* Pulse body — cinematic full-bleed features */
.cv3 .pb-feat{position:relative;min-height:68vh;display:grid;grid-template-columns:1fr 1fr;align-items:stretch}
.cv3 .pb-feat .pbimg{position:relative;overflow:hidden;min-height:48vh}
.cv3 .pb-feat .pbimg img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.cv3 .pb-feat .pbimg .ph{position:absolute;inset:0;background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 22%,var(--bg2)),var(--bg))}
.cv3 .pb-feat .pbtxt{padding:clamp(30px,6vw,88px);align-self:center}
.cv3 .pb-feat.rev .pbimg{order:2}
.cv3 .pb-feat .pbk{font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
.cv3 .pb-feat .pbt{font-size:clamp(30px,4.4vw,62px);font-weight:800;letter-spacing:-.03em;margin:14px 0 0;line-height:1}
.cv3 .pb-feat .pbo{color:var(--dim);margin-top:16px;font-size:16px;line-height:1.6;max-width:46ch}
@media(max-width:820px){.cv3 .pb-feat{grid-template-columns:1fr}.cv3 .pb-feat.rev .pbimg{order:0}}
/* Orbit body — centered constellation */
.cv3 .ob2-sec{text-align:center;padding:clamp(46px,8vh,100px) 0;border-top:1px solid var(--line)}
.cv3 .ob2-k{font-family:var(--mono);font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--accent);margin-bottom:26px}
.cv3 .ob2-proj{padding:20px 0}
.cv3 .ob2-proj .on{font-size:clamp(30px,5vw,72px);font-weight:800;letter-spacing:-.035em;line-height:1}
.cv3 .ob2-proj .om{font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);margin-top:10px}
.cv3 .ob2-cap{display:flex;justify-content:center;flex-wrap:wrap;gap:clamp(26px,5vw,64px)}
.cv3 .ob2-cap b{font-size:clamp(28px,4vw,52px);font-weight:800;color:var(--accent);display:block;font-variant-numeric:tabular-nums;line-height:1}
.cv3 .ob2-cap span{font-family:var(--mono);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);margin-top:8px;display:block}
.cv3 .ob2-list{max-width:60ch;margin:0 auto}
.cv3 .ob2-list .ol{padding:12px 0;border-top:1px solid var(--line);font-size:clamp(15px,1.7vw,19px)}.cv3 .ob2-list .ol .od{font-family:var(--mono);font-size:12px;color:var(--accent);margin-right:12px}
/* Pulse II (original hero) — restored for the pulse2 variant */
.cv3 .pulse-hero{position:relative;min-height:100vh;display:grid;place-items:center;text-align:center;overflow:hidden}
.cv3 .pulse-hero canvas{position:absolute;inset:0;width:100%;height:100%}
.cv3 .pulse-hero .pc{position:relative;z-index:2;padding:0 20px}
.cv3 .pulse-hero .ek{font-family:var(--mono);font-size:12px;letter-spacing:.26em;text-transform:uppercase;color:var(--accent)}
.cv3 .pulse-hero h1{font-size:clamp(48px,11vw,160px);font-weight:800;letter-spacing:-.04em;line-height:.9;margin:22px 0 0;text-wrap:balance}
.cv3 .pulse-hero .lede{font-size:clamp(16px,1.8vw,21px);color:var(--dim);max-width:40ch;margin:22px auto 0;line-height:1.5}
.cv3 .pulse-hero .ticker{margin-top:28px}
/* Pulse */
/* ══ Template 09 · PULSE — aurora / luminous / atmospheric. The company revealed as light moving through
   a night sky. A persistent aurora FIELD (one canvas) breathes behind everything and reacts to scroll;
   cinematic snap BEATS; content revealed by LUMINANCE SWEEPS (never fade-up); signature body viz = THE
   READING (luminous curtains encoding real evidence). Own palette: midnight · aurora teal · violet. ══ */
.cv3 .pulse{--bg:#060a14;--bg2:#0b1120;--ink:#eaf2f0;--dim:#8ea6ad;--faint:#3f515a;--accent:#3fe0c0;--accent2:#9a86f2;--line:rgba(234,242,240,.10);--line2:rgba(234,242,240,.20);
  position:relative;height:100vh;overflow-y:auto;overflow-x:hidden;scroll-snap-type:y mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none;background:var(--bg);color:var(--ink)}
.cv3 .pulse::-webkit-scrollbar{display:none}
.cv3 .pulse-field{position:fixed;inset:0;z-index:0;pointer-events:none}
.cv3 .pulse-field canvas{width:100%;height:100%;display:block}
.cv3 .pls-beat{position:relative;z-index:1;min-height:100vh;scroll-snap-align:start;display:flex;flex-direction:column;justify-content:center;padding:clamp(76px,12vh,132px) clamp(26px,7vw,110px);overflow:hidden}
.cv3 .pls-in{width:100%;max-width:1180px;margin:0 auto;position:relative}
/* LUMINANCE SWEEP — a soft band of light passes across and reveals content (Pulse's reveal grammar) */
.cv3 .pls-sw{-webkit-mask-image:linear-gradient(105deg,#000 40%,rgba(0,0,0,.25) 60%,transparent 78%);mask-image:linear-gradient(105deg,#000 40%,rgba(0,0,0,.25) 60%,transparent 78%);-webkit-mask-size:260% 100%;mask-size:260% 100%;-webkit-mask-position:150% 0;mask-position:150% 0;opacity:.001;transition:-webkit-mask-position 1.05s cubic-bezier(.42,0,.15,1),mask-position 1.05s cubic-bezier(.42,0,.15,1),opacity .5s ease}
.cv3 .pls-beat.on .pls-sw{-webkit-mask-position:0% 0;mask-position:0% 0;opacity:1}
.cv3 .pls-glow{position:relative}
.cv3 .pls-glow::after{content:"";position:absolute;left:50%;top:50%;width:120%;height:180%;transform:translate(-50%,-50%) scale(.4);background:radial-gradient(closest-side,color-mix(in srgb,var(--accent) 32%,transparent),transparent);opacity:0;pointer-events:none;z-index:-1;filter:blur(20px)}
.cv3 .pls-beat.on .pls-glow::after{animation:plsflare 1.6s cubic-bezier(.3,0,.2,1) .25s}
@keyframes plsflare{0%{opacity:0;transform:translate(-50%,-50%) scale(.4)}40%{opacity:1;transform:translate(-50%,-50%) scale(1)}100%{opacity:.5;transform:translate(-50%,-50%) scale(1.05)}}
@media(prefers-reduced-motion:reduce){.cv3 .pls-sw{-webkit-mask-image:none!important;mask-image:none!important;opacity:1!important}.cv3 .pls-glow::after{display:none}}
/* HERO */
.cv3 .pls-hero{align-items:center;text-align:center}
.cv3 .pls-hero .ek{font-family:var(--mono);font-size:12px;letter-spacing:.28em;text-transform:uppercase;color:var(--accent)}
.cv3 .pls-hero h1{font-size:clamp(48px,11vw,168px);font-weight:800;letter-spacing:-.045em;line-height:.88;margin:22px 0 0;text-wrap:balance;text-shadow:0 0 60px color-mix(in srgb,var(--accent) 22%,transparent)}
.cv3 .pls-hero h1 em{font-style:normal;color:var(--accent)}
.cv3 .pls-hero .lede{font-size:clamp(16px,1.9vw,22px);color:var(--dim);max-width:42ch;margin:24px auto 0;line-height:1.5}
.cv3 .pls-hero .tk{display:inline-flex;align-items:center;gap:10px;margin-top:30px;font-family:var(--mono);font-size:12px;letter-spacing:.1em;color:var(--ink)}
.cv3 .pls-hero .tk .dot{width:7px;height:7px;border-radius:50%;background:var(--accent);box-shadow:0 0 12px 2px color-mix(in srgb,var(--accent) 80%,transparent);animation:plsdot 2.6s ease-in-out infinite}
@keyframes plsdot{0%,100%{opacity:.5;transform:scale(.85)}50%{opacity:1;transform:scale(1.15)}}
.cv3 .pls-cue{position:absolute;left:50%;bottom:clamp(26px,5vh,52px);transform:translateX(-50%);font-family:var(--mono);font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--faint);z-index:2;animation:plscue 2.4s ease-in-out infinite}
@keyframes plscue{0%,100%{opacity:.4;transform:translate(-50%,0)}50%{opacity:.85;transform:translate(-50%,5px)}}
/* section kicker */
.cv3 .pls-k{font-family:var(--mono);font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:var(--accent);margin-bottom:clamp(22px,3.4vh,40px);display:flex;align-items:center;gap:12px}
.cv3 .pls-k::before{content:"";width:26px;height:1px;background:var(--accent);box-shadow:0 0 8px var(--accent)}
/* THE READING — luminous aurora curtains encoding REAL evidence (signature body viz) */
.cv3 .pls-read-head{display:flex;align-items:baseline;justify-content:space-between;gap:16px;flex-wrap:wrap}
.cv3 .pls-read{display:flex;align-items:flex-end;gap:clamp(10px,2.4vw,40px);height:min(52vh,460px);margin-top:clamp(26px,4vh,48px);padding-bottom:34px;border-bottom:1px solid var(--line)}
.cv3 .pls-cur{position:relative;flex:1;min-width:0;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center}
.cv3 .pls-cur .col{width:min(74%,66px);height:0;border-radius:40px 40px 3px 3px;background:linear-gradient(to top,transparent,color-mix(in srgb,var(--accent) 26%,transparent) 34%,var(--accent) 118%);box-shadow:0 0 26px -2px color-mix(in srgb,var(--accent) 55%,transparent);transition:height 1.05s cubic-bezier(.3,0,.2,1) var(--d,0s);filter:blur(.3px)}
.cv3 .pls-beat.on .pls-cur .col{height:var(--h,20%)}
.cv3 .pls-cur.peak .col{background:linear-gradient(to top,transparent,color-mix(in srgb,var(--accent2) 30%,transparent) 30%,#fff 128%);box-shadow:0 0 40px 2px color-mix(in srgb,var(--accent2) 70%,transparent)}
.cv3 .pls-cur .val{font-family:var(--font);font-weight:700;font-size:clamp(15px,1.8vw,24px);color:var(--ink);margin-bottom:10px;font-variant-numeric:tabular-nums;opacity:0;transition:opacity .5s ease calc(var(--d,0s) + .5s)}
.cv3 .pls-cur.peak .val{color:var(--accent)}
.cv3 .pls-beat.on .pls-cur .val{opacity:1}
.cv3 .pls-cur .lab{font-family:var(--mono);font-size:10px;letter-spacing:.06em;color:var(--dim);margin-top:14px;white-space:nowrap;text-align:center}
.cv3 .pls-read-note{font-family:var(--mono);font-size:11px;letter-spacing:.04em;color:var(--faint);margin-top:16px}
/* THE READING — resource/crest fallback */
.cv3 .pls-crest{display:flex;align-items:flex-end;gap:clamp(24px,5vw,70px);flex-wrap:wrap;margin-top:clamp(24px,4vh,44px)}
.cv3 .pls-crest .big{font-family:var(--font);font-weight:800;letter-spacing:-.04em;line-height:.82;font-size:clamp(72px,16vw,250px);font-variant-numeric:tabular-nums;color:var(--ink);text-shadow:0 0 70px color-mix(in srgb,var(--accent) 34%,transparent)}
.cv3 .pls-crest .big em{font-style:normal;font-size:.26em;color:var(--accent);margin-left:.12em}
.cv3 .pls-crest .pts{display:flex;flex-direction:column;gap:14px;padding-bottom:12px}
.cv3 .pls-crest .pt{display:flex;align-items:center;gap:12px;font-family:var(--mono);font-size:12px;letter-spacing:.04em;color:var(--dim)}
.cv3 .pls-crest .pt::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--accent);box-shadow:0 0 12px 2px color-mix(in srgb,var(--accent) 70%,transparent)}
.cv3 .pls-crest .pt b{color:var(--ink);font-weight:600;font-family:var(--font);font-size:16px}
/* NUMBER as EVENT (capital / material figure) */
.cv3 .pls-fig{display:grid;grid-template-columns:auto 1fr;gap:clamp(24px,4vw,60px);align-items:center}
@media(max-width:820px){.cv3 .pls-fig{grid-template-columns:1fr}}
.cv3 .pls-fig .num{font-family:var(--font);font-weight:800;letter-spacing:-.04em;line-height:.84;font-size:clamp(60px,12vw,200px);font-variant-numeric:tabular-nums;color:var(--ink);text-shadow:0 0 60px color-mix(in srgb,var(--accent) 28%,transparent)}
.cv3 .pls-fig .num em{font-style:normal;font-size:.28em;color:var(--accent);margin-left:.08em}
.cv3 .pls-fig .side .sr{display:flex;justify-content:space-between;gap:20px;align-items:baseline;padding:12px 0;border-bottom:1px solid var(--line)}
.cv3 .pls-fig .side .sr .k{font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--dim)}
.cv3 .pls-fig .side .sr .v{font-family:var(--font);font-weight:600;font-size:clamp(17px,2vw,24px);color:var(--ink);font-variant-numeric:tabular-nums}
/* IMAGERY — cinematic crop whose mask OPENS with the beat */
.cv3 .pls-img{display:grid;grid-template-columns:1.4fr 1fr;gap:clamp(28px,4vw,64px);align-items:center}
.cv3 .pls-img.rev{grid-template-columns:1fr 1.4fr}
.cv3 .pls-img.rev .pls-imgwin{order:2}
@media(max-width:820px){.cv3 .pls-img,.cv3 .pls-img.rev{grid-template-columns:1fr}.cv3 .pls-img.rev .pls-imgwin{order:0}}
.cv3 .pls-imgwin{position:relative;height:min(64vh,560px);overflow:hidden;clip-path:inset(0 0 100% 0);transition:clip-path 1.05s cubic-bezier(.5,0,.15,1) .1s}
.cv3 .pls-beat.on .pls-imgwin{clip-path:inset(0 0 0 0)}
.cv3 .pls-imgwin img{width:100%;height:100%;object-fit:cover;transform:scale(1.12);transition:transform 6s ease}
.cv3 .pls-beat.on .pls-imgwin img{transform:scale(1)}
.cv3 .pls-imgwin::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 55%,color-mix(in srgb,var(--bg) 70%,transparent)),linear-gradient(90deg,color-mix(in srgb,var(--accent) 10%,transparent),transparent 40%);mix-blend-mode:screen;pointer-events:none}
.cv3 .pls-imgwin .cap{position:absolute;left:16px;bottom:14px;font-family:var(--mono);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink);z-index:2}
.cv3 .pls-imgtxt .t{font-size:clamp(30px,4.6vw,64px);font-weight:800;letter-spacing:-.03em;line-height:1;margin:0}
.cv3 .pls-imgtxt .meta{font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--dim);margin-top:16px}
.cv3 .pls-imgtxt p{font-size:clamp(15px,1.7vw,18px);line-height:1.6;color:var(--dim);margin-top:18px;max-width:44ch}
/* PROGRESSION — a luminous aurora ray; milestones are points of light, the catalyst glows ahead */
.cv3 .pls-prog{position:relative;margin-top:clamp(24px,4vh,44px);padding-left:34px}
.cv3 .pls-prog::before{content:"";position:absolute;left:9px;top:6px;bottom:6px;width:2px;background:linear-gradient(to bottom,var(--accent),color-mix(in srgb,var(--accent) 20%,transparent));box-shadow:0 0 12px var(--accent);transform:scaleY(0);transform-origin:top;transition:transform 1.1s cubic-bezier(.4,0,.2,1)}
.cv3 .pls-beat.on .pls-prog::before{transform:scaleY(1)}
.cv3 .pls-mi{position:relative;padding:clamp(11px,1.7vh,18px) 0;display:grid;grid-template-columns:130px 1fr;gap:clamp(14px,2vw,28px);align-items:baseline;border-bottom:1px solid var(--line)}
.cv3 .pls-mi::before{content:"";position:absolute;left:-30px;top:calc(clamp(11px,1.7vh,18px) + 6px);width:11px;height:11px;border-radius:50%;background:var(--bg);border:2px solid var(--accent);transform:scale(0);transition:transform .4s cubic-bezier(.3,1.4,.5,1) var(--d,0s)}
.cv3 .pls-beat.on .pls-mi::before{transform:scale(1)}
.cv3 .pls-mi .d{font-family:var(--mono);font-size:12px;color:var(--dim);font-variant-numeric:tabular-nums}
.cv3 .pls-mi .h{font-family:var(--font);font-weight:600;font-size:clamp(15px,1.8vw,21px);color:var(--ink);line-height:1.25}
.cv3 .pls-mi.next::before{background:var(--accent);box-shadow:0 0 16px 3px color-mix(in srgb,var(--accent) 80%,transparent);animation:plspulse 2.4s ease-in-out infinite 1.2s}
.cv3 .pls-mi.next .d{color:var(--accent)}
@keyframes plspulse{0%,100%{box-shadow:0 0 10px 1px color-mix(in srgb,var(--accent) 60%,transparent)}50%{box-shadow:0 0 22px 5px color-mix(in srgb,var(--accent) 90%,transparent)}}
/* WHY / RESOLUTION */
.cv3 .pls-why{display:flex;flex-direction:column;gap:clamp(12px,2vh,20px);margin-top:clamp(20px,3vh,36px)}
.cv3 .pls-why .w{display:grid;grid-template-columns:auto 1fr;gap:clamp(16px,2.5vw,32px);align-items:baseline;border-bottom:1px solid var(--line);padding-bottom:clamp(12px,2vh,20px)}
.cv3 .pls-why .w .n{font-family:var(--mono);font-size:13px;color:var(--accent)}
.cv3 .pls-why .w .t{font-size:clamp(17px,2.2vw,28px);font-weight:600;letter-spacing:-.01em;line-height:1.3;color:var(--ink)}
/* TEAM — a luminous roster */
.cv3 .pls-team{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1px;background:var(--line);border:1px solid var(--line);margin-top:clamp(22px,3vh,40px)}
.cv3 .pls-team .tm{background:var(--bg);padding:clamp(18px,2.4vh,28px) clamp(16px,1.8vw,22px)}
.cv3 .pls-team .tm .nm{font-family:var(--font);font-weight:700;font-size:clamp(16px,1.9vw,22px);color:var(--ink)}
.cv3 .pls-team .tm .ro{font-family:var(--mono);font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--dim);margin-top:9px}
/* RESOLUTION / CTA — the aurora converges */
.cv3 .pls-cta{align-items:center;text-align:center}
.cv3 .pls-cta .conv{font-family:var(--mono);font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--accent)}
.cv3 .pls-cta h2{font-size:clamp(40px,7vw,110px);font-weight:800;letter-spacing:-.04em;line-height:.9;margin:20px 0 0;text-shadow:0 0 70px color-mix(in srgb,var(--accent) 30%,transparent)}
.cv3 .pls-cta .feat{display:flex;flex-wrap:wrap;gap:9px 22px;justify-content:center;margin-top:26px}
.cv3 .pls-cta .feat span{font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim)}
.cv3 .pls-cta .go{display:inline-flex;align-items:center;gap:10px;margin-top:30px;font-family:var(--mono);font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:var(--bg);background:var(--accent);border-radius:999px;padding:15px 30px;box-shadow:0 0 40px -6px var(--accent)}
.cv3 .cv3bar{position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:20;display:flex;align-items:center;gap:9px;padding:7px 10px;border-radius:999px;background:color-mix(in srgb,var(--bg) 74%,transparent);border:1px solid var(--line2);backdrop-filter:blur(16px)}
.cv3 .cv3bar .lab{font-family:var(--mono);font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim)}
.cv3 .cv3bar .div{width:1px;height:18px;background:var(--line2)}
.cv3 .cv3bar .navb{font-family:var(--mono);font-size:17px;line-height:1;color:var(--dim);background:transparent;border:none;cursor:pointer;padding:2px 8px;border-radius:8px;transition:.15s}
.cv3 .cv3bar .navb:hover{color:var(--ink);background:var(--chip)}
.cv3 .tplsel{position:relative}
.cv3 .tplcur{font-family:var(--mono);font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink);background:var(--chip);border:1px solid var(--line2);border-radius:999px;padding:8px 14px;cursor:pointer;min-width:150px;display:flex;justify-content:space-between;gap:12px;align-items:center;white-space:nowrap}
.cv3 .tplcur .cx{color:var(--accent);font-size:9px}
.cv3 .tplback{position:fixed;inset:0;z-index:25}
.cv3 .tplmenu{position:absolute;top:calc(100% + 10px);left:50%;transform:translateX(-50%);z-index:26;background:color-mix(in srgb,var(--bg) 93%,transparent);border:1px solid var(--line2);border-radius:16px;-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px);padding:8px;display:grid;grid-template-columns:1fr 1fr;gap:3px;max-height:min(70vh,560px);overflow:auto;width:min(380px,88vw);box-shadow:0 24px 60px -22px rgba(0,0,0,.55)}
.cv3 .tplitem{font-family:var(--mono);font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--dim);background:transparent;border:none;border-radius:9px;padding:10px 12px;cursor:pointer;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:.12s}
.cv3 .tplitem:hover{color:var(--ink);background:var(--chip)}
.cv3 .tplitem.on{color:var(--bg);background:var(--accent)}
.cv3 .tplpill{font-family:var(--mono);font-size:10.5px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:var(--dim);padding:6px 11px;border-radius:999px;border:none;background:transparent;cursor:pointer;white-space:nowrap;transition:.15s}
.cv3 .tplpill:hover{color:var(--ink)}
.cv3 .tplpill[aria-pressed="true"]{background:var(--accent);color:var(--bg)}
.cv3 .sw{width:24px;height:24px;border-radius:50%;border:1.5px solid var(--line2);cursor:pointer;padding:0}
.cv3 .sw[aria-pressed="true"]{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 22%,transparent)}
.cv3 .sw.ob{background:radial-gradient(circle at 32% 30%,#c9a86a 0 34%,#101215 36%)}
.cv3 .sw.al{background:radial-gradient(circle at 32% 30%,#1f6b4f 0 34%,#f4f3ef 36%)}
.cv3 .sw.au{background:radial-gradient(circle at 32% 30%,#43e0b0 0 34%,#0d1613 36%)}
.cv3 .accent{position:relative;width:24px;height:24px;border-radius:50%;overflow:hidden;border:1.5px solid var(--line2);cursor:pointer;background:var(--accent)}
.cv3 .accent input{position:absolute;inset:-6px;width:calc(100% + 12px);height:calc(100% + 12px);opacity:0;cursor:pointer;border:none}
@media (max-width:820px){.cv3 .statstrip{grid-template-columns:repeat(2,1fr)}.cv3 .flag{grid-template-columns:1fr}.cv3 .flag .data{border-left:none;border-top:1px solid var(--line)}.cv3 .team{grid-template-columns:repeat(2,1fr)}.cv3 .why .row{grid-template-columns:1fr;gap:8px}}
/* ══ TEMPLATE 11 · CORE — a horizontal core-tray light table (scan the physical rock left→right) ══ */
.cv3:has(.core){overflow:hidden}
.cv3 .core{position:relative;height:100vh;display:flex;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;background:linear-gradient(180deg,var(--bg),color-mix(in srgb,var(--ink) 3%,var(--bg)))}
.cv3 .core::-webkit-scrollbar{height:0;display:none}
.cv3 .core-rail{position:fixed;left:0;right:0;bottom:0;height:3px;background:var(--line);z-index:8}
.cv3 .core-rail i{display:block;height:100%;width:0;background:var(--accent)}
.cv3 .cpanel{flex:0 0 auto;width:min(90vw,720px);height:100%;scroll-snap-align:center;display:flex;flex-direction:column;justify-content:center;padding:clamp(34px,5vw,76px) clamp(28px,5vw,64px);border-right:1px solid var(--line);position:relative;opacity:0;transform:translateX(46px);transition:opacity .7s cubic-bezier(.22,1,.36,1),transform .7s cubic-bezier(.22,1,.36,1)}
.cv3 .cpanel.on{opacity:1;transform:none}
.cv3 .cpanel.wide{width:min(96vw,1040px)}
.cv3 .cnum{position:absolute;top:clamp(26px,4vw,44px);left:clamp(28px,5vw,64px);font-family:var(--mono);font-size:10.5px;letter-spacing:.14em;color:var(--faint)}
.cv3 .clab{font-family:var(--mono);font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--accent)}
.cv3 .ch1{font-size:clamp(34px,4.6vw,66px);font-weight:800;letter-spacing:-.03em;line-height:.98;margin:12px 0 0;font-variant-numeric:tabular-nums}
.cv3 .ch1 .unit{font-size:.4em;color:var(--dim);font-weight:700;letter-spacing:-.01em}
.cv3 .csub{color:var(--dim);margin-top:14px;font-size:15px;line-height:1.55;max-width:48ch}
.cv3 .cmeta{font-family:var(--mono);font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--dim);margin-top:16px;line-height:1.95}
.cv3 .cmeta b{color:var(--ink)}
.cv3 .corebox{margin-top:26px;border:1px solid var(--line);border-radius:9px;background:color-mix(in srgb,var(--ink) 4%,var(--bg));padding:16px 18px 12px;overflow:hidden}
.cv3 .coreticks{display:flex;justify-content:space-between;font-family:var(--mono);font-size:9.5px;color:var(--faint);letter-spacing:.06em;margin-bottom:12px;text-transform:uppercase}
.cv3 .cstick{position:relative;height:24px;border-radius:4px;margin:8px 0;overflow:hidden;border:1px solid var(--line2);background:repeating-linear-gradient(90deg,color-mix(in srgb,var(--ink) 16%,var(--bg2)) 0 5px,color-mix(in srgb,var(--ink) 9%,var(--bg2)) 5px 11px,color-mix(in srgb,var(--ink) 22%,var(--bg2)) 11px 15px,color-mix(in srgb,var(--ink) 7%,var(--bg2)) 15px 21px)}
.cv3 .cstick .run{position:absolute;top:-1px;bottom:-1px;background:linear-gradient(180deg,var(--accent2),var(--accent));opacity:0;box-shadow:0 0 16px color-mix(in srgb,var(--accent) 65%,transparent);transition:opacity .55s ease}
.cv3 .cpanel.on .cstick .run{opacity:1}
.cv3 .cstickrow{display:grid;grid-template-columns:104px 1fr auto;gap:16px;align-items:center;margin:10px 0}
.cv3 .cstickrow .chole{font-family:var(--mono);font-size:10.5px;color:var(--faint);letter-spacing:.05em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:uppercase}
.cv3 .cstickrow .cgrade{font-family:var(--mono);font-size:11.5px;font-weight:600;color:var(--ink);white-space:nowrap;font-variant-numeric:tabular-nums}
.cv3 .cstickrow .cgrade b{color:var(--accent)}
.cv3 .cbox{margin-top:24px;border:1px solid var(--line);border-radius:9px;overflow:hidden;background:var(--bg)}
.cv3 .cbox .bimg{height:clamp(150px,26vh,236px);position:relative;overflow:hidden;background:linear-gradient(140deg,var(--bg2),var(--bg))}
.cv3 .cbox .bimg img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.cv3 .cbox .bimg .btag{position:absolute;left:12px;top:12px;font-family:var(--mono);font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#fff;background:rgba(0,0,0,.5);padding:4px 8px;border-radius:5px;-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}
.cv3 .cbox .brow{display:flex;flex-wrap:wrap;gap:6px 22px;padding:14px 16px;border-top:1px solid var(--line);font-family:var(--mono);font-size:10.5px;letter-spacing:.04em;text-transform:uppercase;color:var(--dim)}
.cv3 .cbox .brow b{color:var(--ink)}
.cv3 .cert{margin-top:22px;border:1px solid var(--line);border-radius:9px;padding:clamp(20px,3vw,32px);position:relative;background:var(--bg);font-family:var(--mono)}
.cv3 .cert .crth{display:flex;justify-content:space-between;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);border-bottom:1px solid var(--line);padding-bottom:12px;margin-bottom:6px}
.cv3 .cert .crow{display:flex;justify-content:space-between;align-items:baseline;gap:16px;padding:11px 0;border-bottom:1px dashed var(--line2);font-size:13px}
.cv3 .cert .crow .k{color:var(--dim);text-transform:uppercase;letter-spacing:.05em;font-size:10.5px}
.cv3 .cert .crow .v{color:var(--ink);font-weight:600;font-variant-numeric:tabular-nums}
.cv3 .cert{padding-bottom:clamp(58px,7vw,74px)}
.cv3 .cert .stamp{position:absolute;right:clamp(18px,3vw,40px);bottom:clamp(14px,2.4vw,24px);border:2px solid var(--accent);color:var(--accent);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;padding:7px 12px;border-radius:6px;font-weight:700;transform:rotate(-8deg) scale(1.5);opacity:0;transition:transform .32s cubic-bezier(.2,1.5,.4,1) .25s,opacity .32s ease .25s}
.cv3 .cpanel.on .cert .stamp{transform:rotate(-8deg) scale(1);opacity:.92}
.cv3 .cend h2{font-size:clamp(34px,4.8vw,74px);font-weight:800;letter-spacing:-.03em;line-height:.96}
@media(max-width:600px){.cv3 .cpanel{width:92vw}}
/* ══ TEMPLATE 12 · CINEMA — a 60–90s company film (acts, cuts, darkness, photography-led) ══ */
.cv3:has(.cine){scroll-snap-type:y proximity;background:#050505}
.cv3 .cine{background:#050505;color:#f2efe9}
.cv3 .scene{position:relative;height:100vh;scroll-snap-align:start;overflow:hidden;display:flex;align-items:flex-end;justify-content:flex-start;text-align:left}
.cv3 .scene.card{align-items:center;justify-content:center;text-align:center}
.cv3 .scene .shot{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.cv3 .scene .ph{position:absolute;inset:0;background:radial-gradient(120% 100% at 50% 38%,color-mix(in srgb,var(--accent) 22%,#0b0a09),#050505)}
.cv3 .scene .vig{position:absolute;inset:0;background:radial-gradient(120% 130% at 50% 50%,transparent 38%,rgba(0,0,0,.74))}
.cv3 .scene:not(.card) .vig{background:linear-gradient(90deg,rgba(0,0,0,.84) 0%,rgba(0,0,0,.52) 26%,rgba(0,0,0,.12) 52%,transparent 72%),linear-gradient(0deg,rgba(0,0,0,.55) 0%,transparent 42%)}
.cv3 .scene:not(.card) .cc{max-width:40ch;margin:0 auto 0 0;padding:0 clamp(24px,5vw,72px) clamp(48px,10vh,104px)}
.cv3 .scene:not(.card) .cd{margin-left:0;margin-right:auto}
.cv3 .scene .bars{position:absolute;inset:0;z-index:3;pointer-events:none}
.cv3 .scene .bars::before,.cv3 .scene .bars::after{content:"";position:absolute;left:0;right:0;height:7vh;background:#000}
.cv3 .scene .bars::before{top:0}.cv3 .scene .bars::after{bottom:0}
.cv3 .scene .cc{position:relative;z-index:4;padding:0 clamp(24px,6vw,90px);max-width:60ch}
.cv3 .cine .act{font-family:var(--mono);font-size:12px;letter-spacing:.4em;text-transform:uppercase;color:var(--accent)}
.cv3 .cine .ct{font-size:clamp(40px,8vw,118px);font-weight:800;letter-spacing:-.04em;line-height:.92;margin:18px 0 0;text-wrap:balance}
.cv3 .cine .cd{font-size:clamp(16px,2.1vw,24px);color:#cfc9bf;margin:22px auto 0;max-width:46ch;line-height:1.5;font-weight:500}
.cv3 .cine .tk{display:inline-flex;gap:8px;align-items:center;margin-top:26px;font-family:var(--mono);font-size:12px;letter-spacing:.1em;color:#b7b1a6}
.cv3 .scene.card{background:#000}
.cv3 .cine .evk{font-family:var(--mono);font-size:13px;letter-spacing:.24em;text-transform:uppercase;color:#cfc9bf}
.cv3 .cine .evo{font-size:clamp(60px,13vw,178px);font-weight:900;letter-spacing:-.05em;line-height:.86;color:var(--accent);font-variant-numeric:tabular-nums;margin-top:16px}
.cv3 .cine .evo .unit{display:block;font-size:.26em;color:#cfc9bf;font-weight:800;margin-top:14px;letter-spacing:.02em}
.cv3 .rise.cut{opacity:0;transform:scale(1.16)}
.cv3 .rise.cut.in{transition-duration:.32s,.32s,.32s!important;opacity:1!important;transform:none!important}
@keyframes cine-title{0%{opacity:0;letter-spacing:.42em;filter:blur(7px)}100%{opacity:1;letter-spacing:-.04em;filter:none}}
.cv3 .cine .opening{animation:cine-title 2.1s cubic-bezier(.2,.7,.2,1) both}
@keyframes cine-fadein{to{opacity:1}}
.cv3 .cine .fade{opacity:0;animation:cine-fadein 1.3s ease 1.5s forwards}
.cv3 .credits{height:100vh;scroll-snap-align:start;overflow:hidden;position:relative;background:#000;display:flex;justify-content:center}
.cv3 .credits .roll{position:relative;width:min(90vw,600px);text-align:center;padding-top:100vh;will-change:transform}
.cv3 .credits.on .roll{animation:cine-crawl 30s linear forwards}
@keyframes cine-crawl{to{transform:translateY(-116%)}}
.cv3 .credits .thesis{font-size:clamp(24px,3.4vw,44px);font-weight:800;letter-spacing:-.02em;line-height:1.12;margin-bottom:64px;text-wrap:balance}
.cv3 .credits .cgrp{margin-bottom:44px}
.cv3 .credits .cgrp .role{font-family:var(--mono);font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:var(--accent);margin-bottom:10px}
.cv3 .credits .cgrp .name{font-size:clamp(19px,2.5vw,29px);font-weight:700;line-height:1.4}
@media (prefers-reduced-motion:reduce){.cv3 .credits .roll{padding-top:40px;animation:none!important}.cv3 .cine .opening,.cv3 .cine .fade{animation:none;opacity:1;letter-spacing:-.04em;filter:none}}
/* ══ TEMPLATE 03 · LEDGER — analytical investor workstation (comparison · ratios · evidence) ══ */
.cv3 .lw{max-width:1200px;margin:0 auto;padding:clamp(64px,10vh,120px) clamp(20px,5vw,56px) 80px}
.cv3 .lw-head{display:grid;grid-template-columns:1fr auto;gap:24px 40px;align-items:end;border-bottom:2px solid var(--ink);padding-bottom:26px}
.cv3 .lw-head .who{font-family:var(--mono);font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim)}
.cv3 .lw-head h1{font-family:var(--serif);font-weight:500;font-size:clamp(34px,5vw,68px);line-height:.98;letter-spacing:-.02em;margin:12px 0 0}
.cv3 .lw-head .hero-fig{text-align:right}
.cv3 .lw-head .hero-fig .n{font-size:clamp(40px,6vw,84px);font-weight:800;letter-spacing:-.04em;line-height:.88;font-variant-numeric:tabular-nums;color:var(--accent)}
.cv3 .lw-head .hero-fig .n .unit{font-size:.32em;color:var(--ink);font-weight:700;letter-spacing:0}
.cv3 .lw-head .hero-fig .k{font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);margin-top:8px}
.cv3 .lw-strip{display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid var(--line);margin-bottom:0}
.cv3 .lw-strip .s{padding:18px 20px 18px 0;border-right:1px solid var(--line)}
.cv3 .lw-strip .s:last-child{border-right:none}
.cv3 .lw-strip .s .v{font-size:clamp(20px,2.4vw,30px);font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.cv3 .lw-strip .s .k{font-family:var(--mono);font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);margin-top:8px}
.cv3 .lw-strip .s .r{font-family:var(--mono);font-size:10.5px;color:var(--accent);margin-top:5px}
.cv3 .lw-sec{padding:clamp(40px,6vh,72px) 0;border-bottom:1px solid var(--line)}
.cv3 .lw-sh{display:flex;align-items:baseline;gap:12px;margin-bottom:22px}
.cv3 .lw-sh .lx{font-family:var(--mono);font-size:12px;color:var(--accent)}
.cv3 .lw-sh h2{font-family:var(--serif);font-weight:500;font-size:clamp(22px,2.8vw,34px);letter-spacing:-.01em}
.cv3 .lw-sh .note{margin-left:auto;font-family:var(--mono);font-size:10.5px;color:var(--dim);text-transform:uppercase;letter-spacing:.08em}
.cv3 .cmp{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
.cv3 .cmp th{text-align:right;font-family:var(--mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);font-weight:500;padding:0 0 12px 18px;border-bottom:1px solid var(--ink)}
.cv3 .cmp th:first-child{text-align:left}
.cv3 .cmp td{text-align:right;padding:15px 0 15px 18px;border-bottom:1px solid var(--line);font-size:14.5px;white-space:nowrap}
.cv3 .cmp td.wrap{white-space:normal}
.cv3 .cmp td:first-child{text-align:left;font-weight:700;letter-spacing:-.01em;font-size:16px}
.cv3 .cmp td .sub{font-family:var(--mono);font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:.05em;display:block;margin-top:3px;font-weight:400}
.cv3 .cmp tr.hi td{background:color-mix(in srgb,var(--accent) 8%,transparent)}
.cv3 .cmp tr.hi td:first-child::before{content:"◆ ";color:var(--accent)}
.cv3 .cmp .num{color:var(--ink);font-weight:600}.cv3 .cmp .acc{color:var(--accent);font-weight:700}
.cv3 .lw-2{display:grid;grid-template-columns:1.15fr .85fr;gap:clamp(32px,5vw,64px);align-items:start}
@media(max-width:820px){.cv3 .lw-2{grid-template-columns:1fr}.cv3 .lw-strip{grid-template-columns:repeat(2,1fr)}.cv3 .lw-head{grid-template-columns:1fr}.cv3 .lw-head .hero-fig{text-align:left}}
.cv3 .gchart{display:flex;align-items:flex-end;gap:clamp(10px,2vw,26px);height:200px;border-bottom:1px solid var(--ink);padding-top:20px}
.cv3 .gchart .gb{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;min-width:0}
.cv3 .gchart .gb .gv{font-family:var(--mono);font-size:12px;font-weight:600;color:var(--accent);margin-bottom:8px;font-variant-numeric:tabular-nums}
.cv3 .gchart .gb i{display:block;width:100%;max-width:54px;background:linear-gradient(180deg,var(--accent),color-mix(in srgb,var(--accent) 55%,var(--bg)));border-radius:3px 3px 0 0;transition:height 1s cubic-bezier(.22,1,.36,1)}
.cv3 .gchart .gb .gl{font-family:var(--mono);font-size:10px;color:var(--dim);margin-top:10px;letter-spacing:.04em}
.cv3 .ratio{display:flex;flex-direction:column;gap:2px}
.cv3 .ratio .rr{display:grid;grid-template-columns:1fr auto;gap:14px;align-items:baseline;padding:13px 0;border-bottom:1px solid var(--line)}
.cv3 .ratio .rr .k{font-family:var(--mono);font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--dim)}
.cv3 .ratio .rr .v{font-size:19px;font-weight:700;font-variant-numeric:tabular-nums}
.cv3 .ratio .rr .v small{font-family:var(--mono);font-size:11px;color:var(--accent);font-weight:500;margin-left:6px}
.cv3 .lw-bars{margin-top:8px}
.cv3 .lw-bars .lb{margin:14px 0}
.cv3 .lw-bars .lb .lbt{display:flex;justify-content:space-between;font-family:var(--mono);font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--dim);margin-bottom:7px}
.cv3 .lw-bars .lb .lbt b{color:var(--ink);font-weight:600}
.cv3 .lw-bars .lb .track{height:9px;background:var(--line);border-radius:2px;overflow:hidden}
.cv3 .lw-bars .lb .track i{display:block;height:100%;width:0;background:var(--accent);border-radius:2px;transition:width 1.1s cubic-bezier(.22,1,.36,1)}
.cv3 .lw-why{columns:2;column-gap:48px;margin-top:8px}
.cv3 .lw-why .w{break-inside:avoid;display:grid;grid-template-columns:30px 1fr;gap:12px;padding:14px 0;border-top:1px solid var(--line)}
.cv3 .lw-why .w .n{font-family:var(--mono);font-size:13px;color:var(--accent);font-weight:600}
.cv3 .lw-why .w p{margin:0;font-size:15px;line-height:1.5;color:var(--ink)}
@media(max-width:820px){.cv3 .lw-why{columns:1}}
/* ══ TEMPLATE 07 · DOSSIER — investigative mining feature (photography · pull quotes · sidebars) ══ */
/* ══ Template 07 · DOSSIER — the investment file. Dense institutional research document that comes ALIVE
   as the investor examines it: assisted vertical snap between DENSE spreads, document-physical motion
   (sheet reveals, rules drawing, red-pen annotation), and a signature EVIDENCE STACK that accumulates.
   Own archival palette (warm paper · charcoal · deep vermilion markup) — decoupled from global themes. ══ */
.cv3 .dz{--bg:#efe7d6;--bg2:#e7dec9;--ink:#211d17;--dim:#6f6656;--faint:#a89b81;--accent:#b23423;--accent2:#cf4a34;--line:rgba(33,29,23,.16);--line2:rgba(33,29,23,.30);--chip:rgba(33,29,23,.05);background:var(--bg);color:var(--ink)}
.cv3 .dz-file{height:100vh;overflow-y:auto;overflow-x:hidden;scroll-snap-type:y mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none;position:relative}
.cv3 .dz-file::-webkit-scrollbar{display:none}
.cv3 .dz-ex{min-height:100vh;scroll-snap-align:start;position:relative;display:flex;flex-direction:column;justify-content:center;padding:clamp(66px,9vh,104px) clamp(24px,5vw,64px);overflow:hidden}
.cv3 .dz-spread{display:grid;grid-template-columns:1fr clamp(230px,29%,340px);gap:clamp(30px,4vw,64px);align-items:center;width:100%;max-width:1200px;margin:0 auto}
@media(max-width:820px){.cv3 .dz-spread{grid-template-columns:1fr;gap:28px}}
.cv3 .dz-main{min-width:0}
/* document-physical reveals: a sheet uncovering (clip), a rule drawing */
.cv3 .dz-up{clip-path:inset(0 0 100% 0);transition:clip-path .72s cubic-bezier(.66,0,.2,1)}
.cv3 .dz-ex.on .dz-up{clip-path:inset(0 0 0 0)}
.cv3 .dz-rule{height:1px;background:var(--ink);transform:scaleX(0);transform-origin:left;transition:transform .8s cubic-bezier(.7,0,.2,1) .1s;margin:clamp(14px,2.2vh,24px) 0}
.cv3 .dz-rule.d2{transition-delay:.3s;background:var(--line2)}
.cv3 .dz-ex.on .dz-rule{transform:scaleX(1)}
.cv3 .dz-ex-k{font-family:var(--mono);font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--accent);margin-bottom:clamp(16px,2.4vh,26px);width:fit-content}
/* running head + folio (printed-report chrome) */
.cv3 .dz-run{position:fixed;top:18px;left:0;right:0;z-index:30;text-align:center;font-family:var(--mono);font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim);pointer-events:none}
.cv3 .dz-folio{position:fixed;bottom:18px;left:0;right:0;z-index:30;text-align:center;font-family:var(--mono);font-size:10.5px;letter-spacing:.14em;color:var(--dim);pointer-events:none}
.cv3 .dz-folio .fl{color:var(--accent);margin-left:8px;text-transform:uppercase;letter-spacing:.12em}
/* masthead + document typography */
.cv3 .dz-name{font-family:var(--serif);font-weight:500;font-size:clamp(40px,5.6vw,90px);line-height:.98;letter-spacing:-.02em;color:var(--ink);margin:0}
.cv3 .dz-sub{font-family:var(--serif);font-style:italic;font-size:clamp(17px,2vw,26px);color:var(--dim);margin-top:14px;max-width:30ch}
.cv3 .dz-metaline{font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--dim);margin-top:14px}
.cv3 .dz-h2{font-family:var(--serif);font-weight:500;font-size:clamp(30px,4vw,56px);line-height:1.02;letter-spacing:-.015em;color:var(--ink);margin:0}
.cv3 .dz-p{font-size:16px;line-height:1.6;color:var(--ink);margin-top:16px;max-width:58ch}
.cv3 .dz-p.clip3{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
/* the strongest intercept, marked in red pen */
.cv3 .dz-insert .ir.top{position:relative}
.cv3 .dz-insert .ir.top::before{content:"";position:absolute;left:-14px;top:2px;bottom:2px;width:2px;background:var(--accent)}
.cv3 .dz-insert .ir.top .g{position:relative}
.cv3 .dz-insert .ir.top .g::after{content:"";position:absolute;left:-2px;right:-2px;bottom:-3px;height:2px;background:var(--accent);transform:scaleX(0);transform-origin:left;transition:transform .7s cubic-bezier(.7,0,.2,1) .5s}
.cv3 .dz-ex.on .dz-insert .ir.top .g::after{transform:scaleX(1)}
/* position — dense capital numbers + what-to-watch */
.cv3 .dz-numbers{display:grid;grid-template-columns:repeat(2,1fr);gap:1px;background:var(--line);border:1px solid var(--line2)}
.cv3 .dz-numbers .nr{background:var(--bg);padding:14px 16px;display:flex;flex-direction:column;gap:8px}
.cv3 .dz-numbers .nr .k{font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim)}
.cv3 .dz-numbers .nr .v{font-family:var(--serif);font-size:clamp(20px,2.4vw,30px);font-weight:500;color:var(--ink);font-variant-numeric:tabular-nums;line-height:1}
.cv3 .dz-watch{border-top:2px solid var(--ink);margin-top:clamp(18px,3vh,30px);padding-top:14px}
.cv3 .dz-watch .it{font-family:var(--mono);font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);margin-bottom:12px}
.cv3 .dz-watch .wr{display:grid;grid-template-columns:120px 1fr auto;gap:16px;align-items:baseline;padding:10px 0;border-bottom:1px solid var(--line)}
.cv3 .dz-watch .wr .wt{font-family:var(--mono);font-size:12px;color:var(--accent);font-variant-numeric:tabular-nums}
.cv3 .dz-watch .wr.rec .wt{color:var(--dim)}
.cv3 .dz-watch .wr .wl{font-family:var(--serif);font-size:clamp(15px,1.8vw,21px);font-weight:500;color:var(--ink);line-height:1.25}
.cv3 .dz-watch .wr .wtag{font-family:var(--mono);font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--bg);background:var(--accent);padding:4px 8px;align-self:center}
/* portfolio records (reuses dz-chap, compacted) */
.cv3 .dz-recs .dz-chap{margin-top:clamp(16px,2.4vh,26px);padding-top:18px}
.cv3 .dz-recs .dz-chap:first-child{border-top:2px solid var(--ink)}
.cv3 .dz-recs .dz-chap p{-webkit-line-clamp:2;display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden;margin-top:10px;font-size:15px}
/* findings */
.cv3 .dz-finds{display:flex;flex-direction:column;gap:clamp(10px,1.6vh,16px);margin-bottom:clamp(20px,3vh,34px)}
.cv3 .dz-finds .fnd{display:grid;grid-template-columns:auto 1fr;gap:clamp(14px,2vw,26px);align-items:baseline;border-bottom:1px solid var(--line);padding-bottom:clamp(10px,1.5vh,16px)}
.cv3 .dz-finds .fn{font-family:var(--serif);font-style:italic;font-size:clamp(20px,2.6vw,34px);color:var(--accent);line-height:.8}
.cv3 .dz-finds .ft{font-family:var(--serif);font-size:clamp(16px,2vw,26px);font-weight:500;line-height:1.28;letter-spacing:-.01em;color:var(--ink)}
.cv3 .dz-princ{font-family:var(--mono);font-size:11.5px;letter-spacing:.04em;color:var(--dim);margin-bottom:clamp(20px,3vh,34px)}
.cv3 .dz-princ .pk{color:var(--accent);text-transform:uppercase;letter-spacing:.14em;font-size:10px;margin-right:10px}
.cv3 .dz-close{border-top:2px solid var(--ink);padding-top:clamp(18px,3vh,30px)}
.cv3 .dz-close-name{font-family:var(--serif);font-weight:500;font-style:italic;font-size:clamp(26px,4vw,52px);color:var(--accent);letter-spacing:-.01em;line-height:1.05}
.cv3 .dz-close-sub{font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--dim);margin-top:14px}
/* ── THE EVIDENCE STACK — the signature: material facts accumulate into a physically filed pile ── */
.cv3 .dz-stack{position:relative;align-self:center}
.cv3 .dz-stack-h{font-family:var(--mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim);margin-bottom:16px;text-align:right}
.cv3 .dz-stack-h b{color:var(--accent);font-weight:400}
.cv3 .dz-stack-body{position:relative;display:flex;flex-direction:column;align-items:stretch}
.cv3 .dz-pc{position:relative;background:var(--bg);border:1px solid var(--line2);box-shadow:0 8px 22px -12px rgba(20,16,10,.55);padding:13px 15px;margin-top:-10px;transform:rotate(var(--rot,0deg));transform-origin:60% 0;z-index:var(--i)}
.cv3 .dz-pc:first-child{margin-top:0}
.cv3 .dz-pc:nth-child(odd){--rot:-1.1deg}
.cv3 .dz-pc:nth-child(even){--rot:1.3deg}
.cv3 .dz-ex.on .dz-pc.new{animation:dzfile .58s cubic-bezier(.5,0,.2,1) .1s both}
@keyframes dzfile{0%{transform:translateX(46px) rotate(4deg);box-shadow:0 18px 36px -12px rgba(20,16,10,.6)}100%{transform:translateX(0) rotate(var(--rot,0deg))}}
.cv3 .dz-pc .pk{font-family:var(--mono);font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);display:block}
.cv3 .dz-pc .ps{font-family:var(--serif);font-size:15px;color:var(--ink);margin-top:5px;display:block}
.cv3 .dz-pc .pv{font-family:var(--serif);font-weight:500;font-size:clamp(19px,2.2vw,27px);color:var(--ink);margin-top:5px;display:block;font-variant-numeric:tabular-nums;line-height:1.05;position:relative;width:fit-content}
.cv3 .dz-pc .pv.mk::after{content:"";position:absolute;left:-2px;right:-4px;bottom:-2px;height:2.5px;background:var(--accent);transform:scaleX(0);transform-origin:left;transition:transform .7s cubic-bezier(.7,0,.2,1) .55s}
.cv3 .dz-ex.on .dz-pc .pv.mk::after{transform:scaleX(1)}
.cv3 .dz-pc-photo{padding:8px 8px 30px}
.cv3 .dz-pc-photo img{width:100%;height:clamp(96px,15vh,150px);object-fit:cover;display:block}
.cv3 .dz-pc-photo .pcap{position:absolute;left:14px;bottom:9px;font-family:var(--mono);font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--dim)}
.cv3 .dz-pc-file{border-color:var(--ink);border-left:3px solid var(--accent)}
@media(max-width:820px){.cv3 .dz-stack{max-width:340px;margin:0 auto}.cv3 .dz-stack-h{text-align:left}}
@media(prefers-reduced-motion:reduce){.cv3 .dz-up{clip-path:none!important}.cv3 .dz-rule,.cv3 .dz-pc .pv.mk::after,.cv3 .dz-insert .ir.top .g::after{transform:scaleX(1)!important}.cv3 .dz-pc.new{animation:none!important}}
.cv3 .dz-open{position:relative;height:min(92vh,860px);min-height:520px;display:flex;align-items:flex-end;overflow:hidden}
.cv3 .dz-open img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.cv3 .dz-open .ph{position:absolute;inset:0;background:linear-gradient(140deg,var(--bg2),var(--bg))}
.cv3 .dz-open .sc{position:absolute;inset:0;background:linear-gradient(0deg,rgba(0,0,0,.82) 4%,rgba(0,0,0,.2) 40%,transparent 70%)}
.cv3 .dz-open .oin{position:relative;z-index:2;width:100%;max-width:1000px;margin:0 auto;padding:0 clamp(20px,5vw,56px) clamp(40px,7vh,80px);color:#f4f1ea}
.cv3 .dz-open .kx{font-family:var(--mono);font-size:11.5px;letter-spacing:.24em;text-transform:uppercase;color:var(--accent2)}
.cv3 .dz-open h1{font-family:var(--serif);font-weight:500;font-size:clamp(38px,6.4vw,88px);line-height:1;letter-spacing:-.02em;margin:16px 0 0;max-width:20ch;text-shadow:0 2px 30px rgba(0,0,0,.5)}
.cv3 .dz-open .byl{font-family:var(--mono);font-size:12px;letter-spacing:.06em;color:#d9d2c6;margin-top:20px}
.cv3 .dz-body{max-width:1000px;margin:0 auto;padding:0 clamp(20px,5vw,56px)}
.cv3 .dz-lede{font-family:var(--serif);font-size:clamp(22px,2.9vw,34px);line-height:1.34;letter-spacing:-.01em;margin:clamp(40px,6vh,72px) 0 0;max-width:26ch;color:var(--ink)}
.cv3 .dz-lede::first-letter{initial-letter:3;font-weight:600;color:var(--accent);margin-right:14px}
.cv3 .dz-grid{display:grid;grid-template-columns:1fr clamp(200px,24%,280px);gap:clamp(32px,5vw,68px);margin-top:clamp(36px,5vh,60px);align-items:start}
@media(max-width:820px){.cv3 .dz-grid{grid-template-columns:1fr}}
.cv3 .dz-col p{font-size:17px;line-height:1.66;margin:0 0 20px;color:var(--ink);max-width:62ch}
.cv3 .dz-col p .drop{color:var(--dim)}
.cv3 .dz-pull{font-family:var(--serif);font-size:clamp(24px,3.2vw,40px);line-height:1.18;letter-spacing:-.015em;color:var(--accent);margin:34px 0;padding-left:22px;border-left:3px solid var(--accent);max-width:22ch}
.cv3 .dz-insert{border:1px solid var(--ink);border-radius:2px;padding:22px 24px;margin:30px 0;background:color-mix(in srgb,var(--ink) 3%,var(--bg))}
.cv3 .dz-insert .it{font-family:var(--mono);font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);margin-bottom:14px}
.cv3 .dz-insert .ir{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:baseline;padding:9px 0;border-top:1px solid var(--line);font-family:var(--mono);font-size:13px;font-variant-numeric:tabular-nums}
.cv3 .dz-insert .ir .h{color:var(--dim);font-size:11px}.cv3 .dz-insert .ir .g{color:var(--accent);font-weight:600;text-align:right}
.cv3 .dz-aside{position:sticky;top:24px}
.cv3 .dz-side{border-top:2px solid var(--ink);padding-top:16px;margin-bottom:30px}
.cv3 .dz-side .st{font-family:var(--mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);margin-bottom:14px}
.cv3 .dz-side .sr{display:flex;justify-content:space-between;gap:10px;align-items:baseline;padding:8px 0;border-bottom:1px solid var(--line);font-size:13px}
.cv3 .dz-side .sr .k{color:var(--dim)}.cv3 .dz-side .sr .v{font-weight:700;font-variant-numeric:tabular-nums;text-align:right}
.cv3 .dz-fig{margin:36px 0 8px;position:relative}
.cv3 .dz-fig img{width:100%;border-radius:2px;display:block}
.cv3 .dz-fig figcaption{font-family:var(--mono);font-size:11px;color:var(--dim);margin-top:12px;letter-spacing:.03em;display:flex;gap:8px}
.cv3 .dz-fig figcaption b{color:var(--accent)}
.cv3 .dz-map{margin:36px 0;border:1px solid var(--line);border-radius:2px;overflow:hidden;background:var(--bg2)}
.cv3 .dz-map svg{display:block;width:100%;height:auto}
.cv3 .dz-map .mc{padding:12px 16px;border-top:1px solid var(--line);font-family:var(--mono);font-size:11px;color:var(--dim);display:flex;justify-content:space-between}
.cv3 .dz-map .mc b{color:var(--ink)}
.cv3 .dz-chap{border-top:1px solid var(--ink);margin-top:clamp(44px,6vh,72px);padding-top:26px;display:grid;grid-template-columns:auto 1fr;gap:clamp(24px,4vw,48px)}
.cv3 .dz-chap .rn{font-family:var(--serif);font-size:clamp(40px,6vw,90px);font-weight:500;color:var(--accent);line-height:.8;font-style:italic}
.cv3 .dz-chap h3{font-family:var(--serif);font-size:clamp(26px,3.4vw,44px);font-weight:500;letter-spacing:-.015em;margin:0}
.cv3 .dz-chap .pm{font-family:var(--mono);font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--dim);margin:12px 0 0}
.cv3 .dz-chap p{font-size:16.5px;line-height:1.62;margin:16px 0 0;max-width:60ch;color:var(--ink)}
.cv3 .dz-chap .cfig{margin-top:20px}.cv3 .dz-chap .cfig img{width:100%;border-radius:2px}
.cv3 .dz-subj{display:grid;grid-template-columns:auto 1fr;gap:clamp(20px,3vw,36px);align-items:center;border-top:1px solid var(--line);padding:28px 0}
.cv3 .dz-subj .av{width:clamp(64px,9vw,104px);height:clamp(64px,9vw,104px);border-radius:50%;background:var(--bg2);display:grid;place-items:center;font-family:var(--serif);font-size:clamp(24px,3vw,38px);color:var(--accent);border:1px solid var(--line)}
.cv3 .dz-subj .sq{font-family:var(--serif);font-size:clamp(18px,2.2vw,26px);line-height:1.3;letter-spacing:-.01em}
.cv3 .dz-subj .sn{font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--dim);margin-top:12px}
.cv3 .dz-subj .sn b{color:var(--ink)}
.cv3 .dz-end{text-align:center;padding:clamp(56px,9vh,110px) 0;border-top:1px solid var(--ink);margin-top:40px}
.cv3 .dz-end .m{font-family:var(--serif);font-size:clamp(28px,4vw,52px);font-weight:500;font-style:italic;color:var(--accent)}
.cv3 .dz-end .c{font-family:var(--mono);font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim);margin-top:20px}
/* ══ TEMPLATE 16 · TERRAIN — travelling through the physical geography (DPI-crisp contour canvas) ══ */
.cv3:has(.terr){overflow:hidden}
.cv3 .terr{position:fixed;inset:0;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch}
.cv3 .terr-cv{position:fixed;inset:0;width:100vw;height:100vh;z-index:0;pointer-events:none}
.cv3 .terr-hud{position:fixed;left:clamp(18px,4vw,40px);top:clamp(18px,4vw,40px);z-index:3;font-family:var(--mono);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim)}
.cv3 .terr-hud b{color:var(--accent)}
.cv3 .terr-el{position:fixed;right:clamp(18px,4vw,40px);top:clamp(18px,4vw,40px);z-index:3;font-family:var(--mono);font-size:10.5px;letter-spacing:.06em;color:var(--dim);text-align:right}
.cv3 .terr-el b{color:var(--ink);font-size:15px}
.cv3 .way{position:relative;z-index:2;min-height:100vh;display:flex;align-items:center;padding:0 clamp(24px,7vw,120px)}
.cv3 .way .wc{max-width:44ch;opacity:0;transform:translateY(40px);transition:opacity 1s cubic-bezier(.22,1,.36,1),transform 1s cubic-bezier(.22,1,.36,1)}
.cv3 .way.on .wc{opacity:1;transform:none}
.cv3 .way.right{justify-content:flex-end;text-align:right}
.cv3 .way.right .wc{margin-left:auto}
.cv3 .way .stage{font-family:var(--mono);font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:var(--accent)}
.cv3 .way .coord{font-family:var(--mono);font-size:11px;color:var(--dim);margin-top:6px;letter-spacing:.04em}
.cv3 .way h2{font-size:clamp(38px,6.4vw,96px);font-weight:800;letter-spacing:-.04em;line-height:.94;margin:16px 0 0;text-wrap:balance}
.cv3 .way h2 .unit{font-size:.32em;color:var(--dim);font-weight:700}
.cv3 .way p{font-size:clamp(16px,1.9vw,21px);line-height:1.5;color:var(--dim);margin:20px 0 0}
.cv3 .way .wmeta{margin-top:22px;display:flex;flex-wrap:wrap;gap:8px 26px;font-family:var(--mono);font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--dim)}
.cv3 .way.right .wmeta{justify-content:flex-end}
.cv3 .way .wmeta b{color:var(--ink)}
.cv3 .way .elev{margin-top:24px;display:inline-flex;align-items:baseline;gap:10px;padding:9px 16px;border:1px solid var(--line2);border-radius:999px;background:color-mix(in srgb,var(--bg) 60%,transparent);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
.cv3 .way .elev .e{font-family:var(--mono);font-size:15px;font-weight:600;color:var(--accent);font-variant-numeric:tabular-nums}
.cv3 .way .elev .l{font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim)}
.cv3 .terr-scrim{position:fixed;inset:0;z-index:1;pointer-events:none;background:radial-gradient(120% 100% at 50% 50%,transparent 30%,color-mix(in srgb,var(--bg) 60%,transparent))}
/* ════ WAVE 1 — every class strictly namespaced per template (vlt/grd/cns/prs/sig) so no template can affect another ════ */
/* ══ 19 · VAULT — capital-markets luxury, kept scarce (dark · hairline frames · centered · slow) ══ */
.cv3 .vlt-s{min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:clamp(40px,10vh,120px) clamp(24px,6vw,90px);position:relative;border-bottom:1px solid var(--line2)}
.cv3 .vlt-k{font-family:var(--mono);font-size:11px;letter-spacing:.34em;text-transform:uppercase;color:var(--dim);margin-bottom:30px}
.cv3 .vlt-frame{border:1px solid var(--accent);padding:clamp(30px,5vw,64px) clamp(36px,7vw,110px);opacity:0;transform:scale(.985);transition:opacity 1.4s ease,transform 1.4s cubic-bezier(.22,1,.36,1)}
.cv3 .vlt-s.on .vlt-frame{opacity:1;transform:none}
.cv3 .vlt-big{font-family:var(--serif);font-weight:500;font-size:clamp(52px,10vw,148px);line-height:.9;letter-spacing:-.02em;color:var(--ink);font-variant-numeric:tabular-nums}
.cv3 .vlt-big .unit{font-size:.24em;color:var(--accent);font-style:italic;display:block;margin-top:18px;letter-spacing:.03em}
.cv3 .vlt-cap{font-family:var(--mono);font-size:11.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--dim);margin-top:28px}
.cv3 .vlt-h{font-family:var(--serif);font-weight:500;font-size:clamp(30px,4.6vw,64px);line-height:1.04;letter-spacing:-.015em;max-width:18ch}
.cv3 .vlt-sub{color:var(--dim);font-size:clamp(15px,1.7vw,19px);line-height:1.55;max-width:44ch;margin-top:22px}
.cv3 .vlt-own{width:min(560px,86vw);margin-top:34px}
.cv3 .vlt-own .obar{height:2px;background:var(--line);position:relative;overflow:hidden}
.cv3 .vlt-own .obar i{position:absolute;left:0;top:0;bottom:0;background:var(--accent);width:0;transition:width 1.6s cubic-bezier(.22,1,.36,1)}
.cv3 .vlt-s.on .vlt-own .obar i{width:var(--w)}
.cv3 .vlt-own .olab{display:flex;justify-content:space-between;margin-top:12px;font-family:var(--mono);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim)}
.cv3 .vlt-rows{width:min(560px,86vw);margin-top:6px}
.cv3 .vlt-rows .r{display:flex;justify-content:space-between;align-items:baseline;padding:17px 0;border-bottom:1px solid var(--line)}
.cv3 .vlt-rows .r .k{font-family:var(--mono);font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim)}
.cv3 .vlt-rows .r .v{font-family:var(--serif);font-size:clamp(20px,2.4vw,30px);font-variant-numeric:tabular-nums}
.cv3 .vlt-names{display:flex;flex-direction:column;gap:16px;margin-top:10px}
.cv3 .vlt-names .nm{font-family:var(--serif);font-size:clamp(20px,2.4vw,30px);font-weight:500}
.cv3 .vlt-names .rl{font-family:var(--mono);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);margin-top:4px}
/* ══ 13 · GRID — Swiss typography to the edge (visible asymmetric grid · kinetic tabular numerals) ══ */
.cv3 .grd{max-width:1320px;margin:0 auto;border-left:1px solid var(--line);border-right:1px solid var(--line)}
.cv3 .grd-row{display:grid;grid-template-columns:repeat(12,1fr);gap:1px;background:var(--line);border-bottom:1px solid var(--line)}
.cv3 .grd-row>*{background:var(--bg);padding:clamp(16px,2.2vw,32px)}
.cv3 .grd-lab{font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim)}
.cv3 .grd-num{font-weight:800;letter-spacing:-.045em;line-height:.84;font-variant-numeric:tabular-nums;color:var(--ink)}
.cv3 .grd-num .unit{font-size:.28em;color:var(--accent);font-weight:700;letter-spacing:0;vertical-align:baseline}
.cv3 .grd-big{font-size:clamp(56px,12vw,184px)}
.cv3 .grd-mid{font-size:clamp(30px,4.4vw,64px)}
.cv3 .grd-name{font-size:clamp(22px,3vw,42px);font-weight:800;letter-spacing:-.03em;line-height:.98}
.cv3 .grd-txt{font-size:13.5px;line-height:1.5;color:var(--dim)}
.cv3 .grd-c2{grid-column:span 2}.cv3 .grd-c3{grid-column:span 3}.cv3 .grd-c4{grid-column:span 4}.cv3 .grd-c5{grid-column:span 5}.cv3 .grd-c6{grid-column:span 6}.cv3 .grd-c7{grid-column:span 7}.cv3 .grd-c8{grid-column:span 8}.cv3 .grd-c9{grid-column:span 9}.cv3 .grd-c12{grid-column:span 12}
.cv3 .grd-cell{display:flex;flex-direction:column;justify-content:space-between;gap:16px;min-height:118px}
.cv3 .grd-tall{min-height:clamp(300px,46vh,480px)}
.cv3 .grd-cell.acc{background:var(--accent)!important;color:var(--bg)}
.cv3 .grd-cell.acc .grd-lab,.cv3 .grd-cell.acc .grd-num{color:var(--bg)}
@media(max-width:860px){.cv3 .grd-c2,.cv3 .grd-c3,.cv3 .grd-c4{grid-column:span 6}.cv3 .grd-c5,.cv3 .grd-c6,.cv3 .grd-c7,.cv3 .grd-c8,.cv3 .grd-c9{grid-column:span 12}}
/* ══ 23 · CONSTELLATION — the company as a navigable network (fixed node-graph canvas + focus) ══ */
.cv3:has(.cns){overflow:hidden}
.cv3 .cns{position:fixed;inset:0;overflow-y:auto;overflow-x:hidden}
.cv3 .cns-cv{position:fixed;inset:0;width:100vw;height:100vh;z-index:0;pointer-events:none}
.cv3 .cns-node{min-height:100vh;position:relative;z-index:2;display:flex;align-items:center;padding:0 clamp(24px,8vw,150px)}
.cv3 .cns-node .cc{max-width:42ch;opacity:0;transform:translateY(28px);transition:opacity .8s ease,transform .8s cubic-bezier(.22,1,.36,1)}
.cv3 .cns-node.on .cc{opacity:1;transform:none}
.cv3 .cns-node.right{justify-content:flex-end;text-align:right}
.cv3 .cns-node.right .cc{margin-left:auto}
.cv3 .cns-k{font-family:var(--mono);font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--accent)}
.cv3 .cns-h{font-size:clamp(34px,5.4vw,80px);font-weight:800;letter-spacing:-.035em;line-height:.95;margin:14px 0 0;text-wrap:balance}
.cv3 .cns-h .unit{font-size:.3em;color:var(--dim);font-weight:700}
.cv3 .cns-p{font-size:clamp(16px,1.8vw,20px);color:var(--dim);line-height:1.5;margin:18px 0 0}
.cv3 .cns-sat{margin-top:22px;display:flex;flex-wrap:wrap;gap:8px}
.cv3 .cns-node.right .cns-sat{justify-content:flex-end}
.cv3 .cns-sat span{font-family:var(--mono);font-size:11px;letter-spacing:.03em;padding:7px 12px;border:1px solid var(--line2);border-radius:999px;color:var(--dim)}
.cv3 .cns-sat span b{color:var(--accent);font-weight:600}
.cv3 .cns-hud{position:fixed;left:clamp(18px,4vw,40px);top:clamp(18px,4vw,40px);z-index:3;font-family:var(--mono);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim)}
.cv3 .cns-hud b{color:var(--accent)}
/* ══ 12 · PROSPECTUS — institutional offering document (paginated pages · cap table · footnotes) ══ */
.cv3:has(.prs){scroll-snap-type:y proximity}
.cv3 .prs-page{min-height:100vh;scroll-snap-align:start;border-bottom:1px solid var(--line);position:relative;display:flex;flex-direction:column;justify-content:center;padding:clamp(66px,11vh,120px) clamp(24px,8vw,150px) clamp(52px,8vh,92px)}
.cv3 .prs-rh{position:absolute;top:clamp(28px,5vh,48px);left:clamp(24px,8vw,150px);right:clamp(24px,8vw,150px);display:flex;justify-content:space-between;font-family:var(--mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);border-bottom:1px solid var(--line);padding-bottom:10px}
.cv3 .prs-pn{position:absolute;bottom:clamp(24px,4vh,40px);right:clamp(24px,8vw,150px);font-family:var(--mono);font-size:11px;color:var(--dim)}
.cv3 .prs-cover{align-items:center;text-align:center}
.cv3 .prs-seal{width:64px;height:64px;border-radius:50%;border:1px solid var(--accent);display:grid;place-items:center;font-family:var(--serif);font-style:italic;color:var(--accent);font-size:23px;margin:0 auto 30px}
.cv3 .prs-cover h1{font-family:var(--serif);font-weight:500;font-size:clamp(34px,5.4vw,74px);line-height:1.02;letter-spacing:-.02em;max-width:20ch;margin:0}
.cv3 .prs-cover .sub{font-family:var(--mono);font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);margin-top:26px;line-height:2}
.cv3 .prs-sn{font-family:var(--mono);font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);margin-bottom:18px}
.cv3 .prs-h{font-family:var(--serif);font-weight:500;font-size:clamp(26px,3.6vw,48px);letter-spacing:-.015em;margin:0 0 24px}
.cv3 .prs-cols{columns:2;column-gap:clamp(32px,5vw,64px);font-size:15px;line-height:1.68;color:var(--ink);text-align:justify;-webkit-hyphens:auto;hyphens:auto}
.cv3 .prs-cols p{margin:0 0 14px}
.cv3 .prs-cols sup{color:var(--accent);font-size:.7em}
@media(max-width:820px){.cv3 .prs-cols{columns:1}}
.cv3 .prs-fn{margin-top:26px;padding-top:14px;border-top:1px solid var(--line);font-size:11.5px;color:var(--dim);line-height:1.6;max-width:70ch}
.cv3 .prs-fn sup{color:var(--accent)}
.cv3 .prs-tbl{width:100%;max-width:760px;border-collapse:collapse;font-variant-numeric:tabular-nums}
.cv3 .prs-tbl caption{text-align:left;font-family:var(--mono);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);padding-bottom:16px}
.cv3 .prs-tbl th{text-align:right;font-family:var(--mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);font-weight:500;padding:0 0 11px 20px;border-bottom:1px solid var(--ink)}
.cv3 .prs-tbl th:first-child{text-align:left}
.cv3 .prs-tbl td{text-align:right;padding:13px 0 13px 20px;border-bottom:1px solid var(--line);font-size:14px}
.cv3 .prs-tbl td:first-child{text-align:left;font-weight:600}
.cv3 .prs-tbl tr.tot td{border-top:2px solid var(--ink);border-bottom:none;font-weight:700;color:var(--accent)}
.cv3 .prs-idx{position:fixed;right:clamp(16px,3vw,30px);top:50%;transform:translateY(-50%);z-index:5;display:flex;flex-direction:column;gap:12px;text-align:right}
.cv3 .prs-idx .ix{font-family:var(--mono);font-size:9.5px;letter-spacing:.08em;color:var(--faint);text-transform:uppercase}
.cv3 .prs-idx .ix.cur{color:var(--accent)}
@media(max-width:900px){.cv3 .prs-idx{display:none}}
/* ══ 17 · SIGNAL — a geophysical survey coming in (live animated traces · emergent spikes) ══ */
.cv3 .sig-sec{padding:clamp(44px,7vh,88px) clamp(24px,6vw,90px);border-bottom:1px solid var(--line);position:relative}
.cv3 .sig-k{font-family:var(--mono);font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--accent);display:inline-flex;align-items:center;gap:10px}
.cv3 .sig-k .sdot{width:7px;height:7px;border-radius:50%;background:var(--accent);box-shadow:0 0 10px var(--accent);animation:sig-blink 1.4s steps(1) infinite}
@keyframes sig-blink{50%{opacity:.2}}
.cv3 .sig-h{font-size:clamp(30px,4.4vw,64px);font-weight:800;letter-spacing:-.03em;line-height:.98;margin:14px 0 0;font-variant-numeric:tabular-nums}
.cv3 .sig-h .unit{font-size:.32em;color:var(--dim);font-weight:700}
.cv3 .sig-p{color:var(--dim);font-size:15px;line-height:1.55;max-width:54ch;margin:14px 0 0}
.cv3 .sig-trace{position:relative;height:clamp(130px,22vh,210px);margin-top:26px;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.cv3 .sig-trace canvas{position:absolute;inset:0;width:100%;height:100%}
.cv3 .sig-tag{position:absolute;transform:translate(-50%,-108%);font-family:var(--mono);font-size:10.5px;color:var(--accent);white-space:nowrap;font-weight:600;text-align:center;pointer-events:none}
.cv3 .sig-tag .th{color:var(--faint);display:block;font-weight:400;font-size:9.5px}
.cv3 .sig-gauges{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1px;background:var(--line);border:1px solid var(--line);margin-top:26px}
.cv3 .sig-gauges .g{background:var(--bg);padding:18px 20px}
.cv3 .sig-gauges .g .v{font-family:var(--mono);font-size:clamp(20px,2.4vw,30px);font-weight:600;font-variant-numeric:tabular-nums;color:var(--ink)}
.cv3 .sig-gauges .g .k{font-family:var(--mono);font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);margin-top:8px}
.cv3 .sig-rows{margin-top:26px}
.cv3 .sig-rows .sr{display:grid;grid-template-columns:auto 1fr auto;gap:16px;align-items:baseline;padding:13px 0;border-top:1px solid var(--line);font-family:var(--mono);font-size:13px}
.cv3 .sig-rows .sr .a{color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.05em}.cv3 .sig-rows .sr .g{color:var(--accent);font-weight:600;text-align:right}
/* ════ WAVE 2 — namespaced mn/bp/arc/orb/kys ════ */
/* ══ 01 · MONOLITH (V4 body) — monumental, ONE object per full screen, photography as ground ══ */
.cv3 .mn-scene{min-height:100vh;display:flex;flex-direction:column;justify-content:center;padding:clamp(40px,10vh,120px) clamp(24px,7vw,120px);position:relative;overflow:hidden}
.cv3 .mn-scene.center{align-items:center;text-align:center}
.cv3 .mn-photo{position:absolute;inset:0;z-index:0}
.cv3 .mn-photo img{width:100%;height:100%;object-fit:cover}
.cv3 .mn-photo::after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,var(--bg) 2%,rgba(0,0,0,.28) 42%,rgba(0,0,0,.5))}
.cv3 .mn-in{position:relative;z-index:2;max-width:1180px;margin:0 auto;width:100%}
.cv3 .mn-k{font-family:var(--mono);font-size:12px;letter-spacing:.24em;text-transform:uppercase;color:var(--accent)}
.cv3 .mn-huge{font-size:clamp(60px,13vw,220px);font-weight:900;letter-spacing:-.05em;line-height:.86;text-wrap:balance;font-variant-numeric:tabular-nums}
.cv3 .mn-huge .unit{font-size:.22em;font-weight:700;color:var(--accent);letter-spacing:-.01em}
.cv3 .mn-stmt{font-size:clamp(34px,6vw,88px);font-weight:800;letter-spacing:-.035em;line-height:1.0;max-width:16ch;text-wrap:balance}
.cv3 .mn-name{font-size:clamp(44px,9vw,148px);font-weight:900;letter-spacing:-.04em;line-height:.9;color:#fff;text-shadow:0 2px 40px rgba(0,0,0,.45)}
.cv3 .mn-cap{font-family:var(--mono);font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#e6e2da;margin-top:22px}
.cv3 .mn-scene .mn-cap.dk{color:var(--dim)}
.cv3 .mn-grade{font-size:clamp(50px,10vw,150px);font-weight:900;letter-spacing:-.04em;color:var(--accent);line-height:.9;font-variant-numeric:tabular-nums}
.cv3 .mn-list{display:flex;flex-direction:column;gap:clamp(8px,1.6vh,18px)}
.cv3 .mn-list .li{font-size:clamp(26px,4.6vw,64px);font-weight:800;letter-spacing:-.03em;line-height:1;color:var(--faint);transition:color .6s ease}
.cv3 .mn-list .li.in{color:var(--ink)}
/* ══ 01 · MONOLITH V2 — scene deck: a graphic + real content per page, scroll-driven page-to-page transitions ══ */
.cv3 .mn2{position:relative}
.cv3 .mn2-scene{position:relative;min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;padding:clamp(40px,10vh,120px) clamp(24px,7vw,120px);overflow:hidden}
.cv3 .mn2-scene.center{align-items:center;text-align:center}
.cv3 .mn2-in{position:relative;z-index:3;max-width:1180px;margin:0 auto;width:100%;transform:translateY(calc(var(--x,0)*-7vh));opacity:calc(1 - var(--x,0)*.92);will-change:transform,opacity}
/* photographic ground — parallaxes up and darkens as the scene leaves, scales as it enters */
.cv3 .mn2-photo{position:absolute;inset:-6% 0;z-index:0;transform:translateY(calc(var(--x,0)*-6vh)) scale(calc(1 + var(--e,0)*.06));will-change:transform}
.cv3 .mn2-photo img{width:100%;height:100%;object-fit:cover}
.cv3 .mn2-photo::after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,var(--bg) 3%,rgba(0,0,0,.30) 44%,rgba(0,0,0,.52));opacity:calc(.82 + var(--x,0)*.18)}
/* oversized watermark index numeral — a graphic anchor + depth as you move between scenes */
.cv3 .mn2-idx{position:absolute;z-index:1;right:clamp(8px,3vw,70px);top:50%;transform:translateY(calc(-50% + var(--x,0)*-12vh)) translateY(calc(var(--e,0)*4vh));font-weight:900;font-size:clamp(190px,40vw,600px);line-height:1;color:var(--ink);opacity:.055;letter-spacing:-.06em;pointer-events:none;font-variant-numeric:tabular-nums;user-select:none}
.cv3 .mn2-k{font-family:var(--mono);font-size:12px;letter-spacing:.24em;text-transform:uppercase;color:var(--accent)}
.cv3 .mn2-name{font-size:clamp(44px,9vw,150px);font-weight:900;letter-spacing:-.04em;line-height:.9;color:#fff;text-shadow:0 2px 40px rgba(0,0,0,.45);display:block}
.cv3 .mn2-cap{font-family:var(--mono);font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#e6e2da;margin-top:22px}
.cv3 .mn2-cap.dk{color:var(--dim)}
.cv3 .mn2-stmt{font-size:clamp(34px,6vw,90px);font-weight:800;letter-spacing:-.035em;line-height:1.02;max-width:18ch;text-wrap:balance}
.cv3 .mn2-rule{height:2px;width:0;background:var(--accent);margin:34px 0 0}
.cv3 .mn2-rule.in{width:clamp(120px,22vw,340px);transition:width 1.1s cubic-bezier(.65,0,.35,1) .25s}
.cv3 .mn2-statwrap{display:flex;align-items:flex-end;gap:clamp(18px,4vw,56px);justify-content:center}
.cv3 .mn2-bar{width:clamp(10px,1.4vw,20px);background:linear-gradient(0deg,var(--accent),var(--accent2));border-radius:7px;height:calc(var(--e,0) * clamp(150px,30vh,340px));align-self:flex-end;min-height:10px;box-shadow:0 0 40px -6px var(--accent)}
.cv3 .mn2-huge{font-size:clamp(64px,15vw,260px);font-weight:900;letter-spacing:-.05em;line-height:.84;font-variant-numeric:tabular-nums;text-wrap:balance}
.cv3 .mn2-huge .unit{font-size:.2em;font-weight:700;color:var(--accent);letter-spacing:0}
.cv3 .mn2-proof{padding:44px;text-align:center;font-family:var(--mono);font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:var(--dim);border-top:1px solid var(--line2)}
/* two-column scene (graphic + copy) */
.cv3 .mn2-split{display:grid;grid-template-columns:1fr 1fr;gap:clamp(24px,5vw,80px);align-items:center;width:100%;max-width:1180px;margin:0 auto}
@media(max-width:860px){.cv3 .mn2-split{grid-template-columns:1fr;gap:34px}}
.cv3 .mn2-grade{font-size:clamp(50px,10vw,150px);font-weight:900;letter-spacing:-.04em;color:var(--accent);line-height:.9;font-variant-numeric:tabular-nums}
/* flagship drill section (schematic, from real holes) */
.cv3 .mn2-sec{position:relative;width:100%;aspect-ratio:4/3;border:1px solid var(--line2);border-radius:14px;background:linear-gradient(180deg,color-mix(in srgb,var(--ink) 5%,transparent),transparent);overflow:hidden}
.cv3 .mn2-sec svg{width:100%;height:100%;display:block}
.cv3 .mn2-seclab{position:absolute;left:12px;bottom:10px;font-family:var(--mono);font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim)}
/* project chips + overview */
.cv3 .mn2-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px}
.cv3 .mn2-chip{font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;padding:6px 12px;border:1px solid var(--line2);border-radius:999px;color:#e6e2da;background:rgba(0,0,0,.28)}
.cv3 .mn2-over{font-size:clamp(15px,1.7vw,19px);line-height:1.5;color:#e6e2da;max-width:46ch;margin-top:18px}
/* capital rows */
.cv3 .mn2-caprows{display:flex;flex-direction:column;gap:0;width:100%;max-width:600px;margin:30px auto 0}
.cv3 .mn2-caprow{display:grid;grid-template-columns:1fr auto;gap:14px;align-items:baseline;border-bottom:1px solid var(--line2);padding:14px 0}
.cv3 .mn2-caprow .k{font-family:var(--mono);font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim)}
.cv3 .mn2-caprow .v{font-size:clamp(20px,2.6vw,34px);font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
/* catalyst — primary milestone big, any others listed below (robust when there is only one) */
.cv3 .mn2-mile{margin-top:22px;max-width:24ch}
.cv3 .mn2-mile .mt{font-family:var(--mono);font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
.cv3 .mn2-mile .ml{font-size:clamp(34px,6vw,84px);font-weight:800;letter-spacing:-.035em;line-height:1.03;margin-top:12px}
.cv3 .mn2-mile .mi{font-size:clamp(15px,1.7vw,20px);line-height:1.5;color:color-mix(in srgb,var(--ink) 76%,transparent);max-width:42ch;margin-top:18px}
.cv3 .mn2-milerest{display:flex;flex-direction:column;margin-top:36px;max-width:660px}
.cv3 .mn2-milerest .mrow{display:grid;grid-template-columns:120px 1fr;gap:20px;align-items:baseline;border-top:1px solid var(--line2);padding:15px 0}
.cv3 .mn2-milerest .mrow .t{font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--accent)}
.cv3 .mn2-milerest .mrow .l{font-size:clamp(16px,1.9vw,22px);font-weight:700;line-height:1.25}
/* why slabs */
.cv3 .mn2-slabs{display:flex;flex-direction:column;width:100%;margin-top:18px}
.cv3 .mn2-slab{display:grid;grid-template-columns:auto 1fr;gap:24px;align-items:baseline;padding:clamp(12px,1.7vh,22px) 0;border-top:1px solid var(--line2)}
.cv3 .mn2-slab .n{font-family:var(--mono);font-size:14px;color:var(--accent);font-weight:600}
.cv3 .mn2-slab .w{font-size:clamp(22px,3.4vw,48px);font-weight:800;letter-spacing:-.02em;line-height:1.06;color:var(--faint);transition:color .7s ease}
.cv3 .mn2-slab.in .w{color:var(--ink)}
/* leadership avatars */
.cv3 .mn2-team{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:clamp(16px,2.2vw,28px);width:100%;margin-top:22px}
.cv3 .mn2-mem{display:flex;align-items:center;gap:14px}
.cv3 .mn2-av{width:58px;height:58px;border-radius:50%;flex-shrink:0;display:grid;place-items:center;font-weight:800;font-size:18px;background:color-mix(in srgb,var(--accent) 24%,transparent);color:var(--ink);border:1px solid var(--line2)}
.cv3 .mn2-mem .nm{font-size:clamp(17px,1.8vw,22px);font-weight:800;letter-spacing:-.01em;line-height:1.1}
.cv3 .mn2-mem .rl{font-family:var(--mono);font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--dim);margin-top:4px}
/* closing cta */
.cv3 .mn2-cta-name{font-size:clamp(44px,9vw,140px);font-weight:900;letter-spacing:-.04em;line-height:.9;display:block}
@media (prefers-reduced-motion:reduce){.cv3 .mn2-in,.cv3 .mn2-photo,.cv3 .mn2-idx{transform:none!important}.cv3 .mn2-bar{height:clamp(150px,30vh,340px)!important}}
/* ══ 01 · MONOLITH V3 — pinned, scroll-scrubbed cinematic chapters. Each chapter pins for a
   scroll length and transforms into the next through its OWN bespoke move (no global fade). A
   single JS driver sets --p (0→1) per chapter; every transform below is derived from --p in CSS. ══ */
.cv3 .mn3{position:relative;background:var(--bg)}
.cv3 .mn3-ch{position:relative}
.cv3 .mn3-stage{position:sticky;top:0;height:100vh;overflow:hidden;background:var(--bg)}
.cv3 .mn3-photo{position:absolute;inset:0;z-index:0;overflow:hidden;will-change:transform}
.cv3 .mn3-photo img{width:100%;height:100%;object-fit:cover}
.cv3 .mn3-scrim{position:absolute;inset:0;z-index:1;background:linear-gradient(0deg,var(--bg) 1%,rgba(0,0,0,.26) 40%,rgba(0,0,0,.5));pointer-events:none}
.cv3 .mn3-cover{position:absolute;inset:0;z-index:2;background:var(--bg);pointer-events:none}
.cv3 .mn3-pad{position:absolute;inset:0;z-index:3;display:flex;flex-direction:column;justify-content:center;padding:clamp(40px,10vh,120px) clamp(24px,7vw,120px);will-change:transform,opacity}
.cv3 .mn3-pad.center{align-items:center;text-align:center}
.cv3 .mn3-pad.end{justify-content:flex-end}
.cv3 .mn3-in{width:100%;max-width:1180px;margin:0 auto}
.cv3 .mn3-idx{position:absolute;z-index:1;right:clamp(8px,3vw,70px);top:50%;transform:translateY(calc(-50% + (var(--p,0) - .5)*-9vh));font-weight:900;font-size:clamp(190px,40vw,600px);line-height:1;color:var(--ink);opacity:.05;letter-spacing:-.06em;pointer-events:none;user-select:none;font-variant-numeric:tabular-nums}
/* HERO — photo scales, black rises to consume it, type pins then lifts away */
.cv3 .mn3-hero .mn3-photo{transform:scale(calc(1 + var(--p,0)*.14));transform-origin:50% 45%}
.cv3 .mn3-hero .mn3-cover{opacity:clamp(0,calc((var(--p,0) - .55)/.42),1)}
.cv3 .mn3-hero .mn3-pad{transform:translateY(calc(var(--p,0)*-7vh));opacity:clamp(0,calc(1 - (var(--p,0) - .48)*2.4),1)}
/* THESIS — statement wipes in on black, rule draws, jurisdiction resolves */
.cv3 .mn3-stmt{clip-path:inset(0 calc((1 - clamp(0,calc(var(--p,0)/.34),1))*100%) -.16em 0)}
.cv3 .mn3-rule{height:2px;background:var(--accent);margin:34px 0 0;width:calc(clamp(0,calc((var(--p,0) - .28)/.32),1) * clamp(120px,22vw,340px))}
.cv3 .mn3-sup{opacity:clamp(0,calc((var(--p,0) - .48)/.3),1)}
.cv3 .mn3-thesis .mn3-pad{opacity:clamp(0,calc(1 - (var(--p,0) - .84)/.16),1)}
/* STAT — the number is the graphic, then BECOMES A MASK the flagship image opens through */
.cv3 .mn3-stat .mn3-pad{opacity:clamp(0,calc(var(--p,0)/.1),1)}
.cv3 .mn3-stat-label{opacity:calc(1 - clamp(0,calc((var(--p,0) - .58)/.16),1))}
.cv3 .mn3-stat-ctx{opacity:calc(clamp(0,calc((var(--p,0) - .16)/.16),1) * (1 - clamp(0,calc((var(--p,0) - .55)/.15),1)))}
.cv3 .mn3-statrow{display:flex;align-items:flex-end;gap:clamp(16px,3vw,44px);justify-content:center}
.cv3 .mn3-stat-bar{width:clamp(10px,1.4vw,20px);background:linear-gradient(0deg,var(--accent),var(--accent2));border-radius:7px;align-self:flex-end;height:calc(clamp(0,calc(var(--p,0)/.4),1) * clamp(150px,30vh,340px));min-height:10px;opacity:calc(1 - clamp(0,calc((var(--p,0) - .5)/.16),1));box-shadow:0 0 40px -6px var(--accent)}
.cv3 .mn3-statnum{display:flex;align-items:flex-end;gap:.06em;line-height:.84}
.cv3 .mn3-statnum .glyphs{position:relative;display:inline-grid;font-size:clamp(64px,15vw,260px);font-weight:900;letter-spacing:-.05em;font-variant-numeric:tabular-nums;transform:scale(calc(1 + clamp(0,calc((var(--p,0) - .6)/.4),1)*6.5));transform-origin:50% 48%;will-change:transform;opacity:calc(1 - clamp(0,calc((var(--p,0) - .84)/.12),1))}
.cv3 .mn3-statnum .glyphs>span{grid-area:1/1;display:block}
.cv3 .mn3-statnum .g-solid{color:var(--ink);opacity:calc(1 - clamp(0,calc((var(--p,0) - .6)/.14),1))}
.cv3 .mn3-statnum .g-mask{-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;background-size:cover;background-position:50% 45%;opacity:clamp(0,calc((var(--p,0) - .6)/.14),1)}
.cv3 .mn3-statnum .g-unit{font-size:clamp(20px,3vw,54px);font-weight:700;color:var(--accent);opacity:calc(1 - clamp(0,calc((var(--p,0) - .56)/.14),1))}
.cv3 .mn3-stat .mn3-flag{position:absolute;inset:0;z-index:4;opacity:clamp(0,calc((var(--p,0) - .8)/.14),1);pointer-events:none}
.cv3 .mn3-stat .mn3-flag img{width:100%;height:100%;object-fit:cover}
/* FLAGSHIP — image settles from the stat reveal; a bare drill-section surveys itself onto the land */
.cv3 .mn3-flag-ch .mn3-photo{transform:scale(calc(1.06 - var(--p,0)*.06 + clamp(0,calc((var(--p,0) - .8)/.2),1)*.24))}
.cv3 .mn3-flag-ch .mn3-scrim{opacity:clamp(.4,calc(.4 + var(--p,0)*.5),1)}
.cv3 .mn3-flag-ch .mn3-pad{opacity:calc(clamp(0,calc((var(--p,0) - .08)/.22),1) * (1 - clamp(0,calc((var(--p,0) - .82)/.18),1)))}
.cv3 .mn3-flag-sec{position:absolute;left:clamp(24px,7vw,120px);right:clamp(24px,7vw,120px);bottom:clamp(40px,10vh,110px);z-index:2;height:min(36vh,300px);opacity:clamp(0,calc((var(--p,0) - .2)/.3),1);clip-path:inset(calc((1 - clamp(0,calc((var(--p,0) - .2)/.4),1))*100%) 0 0 0)}
.cv3 .mn3-flag-sec svg{width:100%;height:100%;display:block}
.cv3 .mn3-flag-seclab{position:absolute;left:0;bottom:-22px;font-family:var(--mono);font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:#cfcabf}
/* PROJECTS — full-bleed photo, pinned type; the image SPLITS from the centre to reveal the next asset */
.cv3 .mn3-proj .mn3-proj-next{position:absolute;inset:0;z-index:0}
.cv3 .mn3-proj .mn3-proj-next img{width:100%;height:100%;object-fit:cover}
.cv3 .mn3-half{position:absolute;inset:0;z-index:1;background-size:cover;background-position:center;--sp:clamp(0,calc((var(--p,0) - .66)/.34),1)}
.cv3 .mn3-half::after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,rgba(0,0,0,.58),rgba(0,0,0,.12) 46%,transparent)}
.cv3 .mn3-half.l{clip-path:inset(0 50% 0 0);transform:translateX(calc(var(--sp)*-58%))}
.cv3 .mn3-half.r{clip-path:inset(0 0 0 50%);transform:translateX(calc(var(--sp)*58%))}
.cv3 .mn3-proj .mn3-pad{opacity:calc(clamp(0,calc((var(--p,0) - .06)/.16),1) * (1 - clamp(0,calc((var(--p,0) - .66)/.26),1)));transform:translateY(calc((1 - clamp(0,calc((var(--p,0) - .06)/.16),1))*24px))}
.cv3 .mn3-meta{font-family:var(--mono);font-size:clamp(11px,1.2vw,13px);letter-spacing:.14em;text-transform:uppercase;color:#e6e2da;margin-top:20px}
.cv3 .mn3-over{font-size:clamp(15px,1.7vw,19px);line-height:1.5;color:#e6e2da;max-width:46ch;margin-top:18px}
/* CAPITAL — figure and structure ASSEMBLE row by row on black */
.cv3 .mn3-cap-ch .mn3-pad{opacity:clamp(0,calc(var(--p,0)/.12),1)}
.cv3 .mn3-cap-big{opacity:clamp(0,calc((var(--p,0) - .04)/.18),1);transform:translateY(calc((1 - clamp(0,calc((var(--p,0) - .04)/.18),1))*30px))}
.cv3 .mn3-caprow{--rp:clamp(0,calc((var(--p,0) - .22)/.6*var(--n,5) - var(--i,0)),1);opacity:var(--rp);transform:translateY(calc((1 - var(--rp))*22px))}
/* CATALYST — an accent line draws downward and carries you into the milestone */
.cv3 .mn3-cat .mn3-line{position:absolute;left:clamp(24px,7vw,120px);top:0;width:2px;height:100%;background:var(--accent);transform-origin:50% 0;transform:scaleY(clamp(0,calc(var(--p,0)/.4),1));z-index:1;opacity:.9}
.cv3 .mn3-cat .mn3-pad{padding-left:calc(clamp(24px,7vw,120px) + 42px)}
.cv3 .mn3-cat-mile{opacity:clamp(0,calc((var(--p,0) - .3)/.3),1);transform:translateX(calc((1 - clamp(0,calc((var(--p,0) - .3)/.3),1))*30px))}
/* WHY / LEADERSHIP — staggered assembly driven by index */
.cv3 .mn3-slab{--rp:clamp(0,calc((var(--p,0) - .16)/.64*var(--n,5) - var(--i,0)),1);opacity:var(--rp);transform:translateY(calc((1 - var(--rp))*26px))}
.cv3 .mn3-mem{--rp:clamp(0,calc((var(--p,0) - .14)/.66*var(--n,8) - var(--i,0)),1);opacity:var(--rp);transform:translateY(calc((1 - var(--rp))*20px))}
/* CLOSE */
.cv3 .mn3-close-name{opacity:clamp(0,calc(var(--p,0)/.4),1);transform:scale(calc(.94 + clamp(0,calc(var(--p,0)/.5),1)*.06))}
.cv3 .mn3-close-sub{opacity:clamp(0,calc((var(--p,0) - .3)/.3),1)}
@media (prefers-reduced-motion:reduce){
  .cv3 .mn3-stmt{clip-path:none!important}.cv3 .mn3-rule{width:clamp(120px,22vw,340px)!important}
  .cv3 .mn3-statnum .glyphs{transform:none!important}.cv3 .mn3-statnum .g-mask,.cv3 .mn3-stat .mn3-flag{opacity:0!important}.cv3 .mn3-statnum .g-solid,.cv3 .mn3-statnum .g-unit{opacity:1!important}
  .cv3 .mn3-half.l,.cv3 .mn3-half.r{transform:none!important}
  .cv3 .mn3-pad,.cv3 .mn3-sup,.cv3 .mn3-stat-label,.cv3 .mn3-stat-ctx,.cv3 .mn3-cap-big,.cv3 .mn3-caprow,.cv3 .mn3-cat-mile,.cv3 .mn3-slab,.cv3 .mn3-mem,.cv3 .mn3-close-name,.cv3 .mn3-close-sub{opacity:1!important;transform:none!important}
  .cv3 .mn3-cat .mn3-line{transform:scaleY(1)!important}.cv3 .mn3-flag-sec{clip-path:none!important;opacity:1!important}
}
/* ── Monolith V3 narrative chapters (identity → snapshot → flagship → portfolio → economics → next → why → close) ── */
.cv3 .mn3-hook{font-family:var(--mono);font-size:clamp(11px,1.4vw,15px);letter-spacing:.26em;text-transform:uppercase;color:#f2ede2;margin-bottom:20px;text-shadow:0 1px 20px rgba(0,0,0,.6)}
/* CH02 snapshot — four facts assemble on black, then a supporting line resolves */
.cv3 .mn3-snap{display:grid;grid-template-columns:repeat(2,1fr);gap:clamp(22px,5vh,54px) clamp(30px,6vw,100px);width:100%;max-width:880px;margin:26px auto 0}
@media(max-width:760px){.cv3 .mn3-snap{grid-template-columns:1fr;gap:24px}}
.cv3 .mn3-snap .f{--rp:clamp(0,calc((var(--p,0) - .1)/.5*var(--n,4) - var(--i,0)),1);opacity:var(--rp);transform:translateY(calc((1 - var(--rp))*26px))}
.cv3 .mn3-snap .fv{font-size:clamp(38px,6vw,84px);font-weight:900;letter-spacing:-.04em;line-height:.9;font-variant-numeric:tabular-nums}
.cv3 .mn3-snap .fv .u{font-size:.34em;font-weight:700;color:var(--accent);letter-spacing:0}
.cv3 .mn3-snap .fk{font-family:var(--mono);font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);margin-top:12px}
.cv3 .mn3-snap-sup{max-width:44ch;margin:clamp(26px,6vh,58px) auto 0;font-size:clamp(17px,2vw,26px);line-height:1.36;font-weight:600;letter-spacing:-.015em;text-wrap:balance;opacity:clamp(0,calc((var(--p,0) - .6)/.26),1)}
/* CH03 flagship — two clean states: facts, then the drill-section emerges (no overlap with type) */
.cv3 .mn3-flag2 .mn3-scrim{opacity:calc(.42 + clamp(0,calc((var(--p,0) - .42)/.2),1)*.46)}
.cv3 .mn3-fa{position:absolute;inset:0;z-index:3;display:flex;flex-direction:column;justify-content:center;padding:clamp(40px,10vh,120px) clamp(24px,7vw,120px);opacity:calc(clamp(0,calc((var(--p,0) - .05)/.14),1) * (1 - clamp(0,calc((var(--p,0) - .44)/.12),1)));transform:translateY(calc(clamp(0,calc((var(--p,0) - .44)/.12),1)*-4vh))}
.cv3 .mn3-fa .big{font-size:clamp(46px,9vw,120px);font-weight:900;letter-spacing:-.045em;line-height:.9;font-variant-numeric:tabular-nums;margin-top:14px}
.cv3 .mn3-fa .sub{font-family:var(--mono);font-size:clamp(12px,1.4vw,15px);letter-spacing:.06em;color:#e6e2da;margin-top:14px}
.cv3 .mn3-fa .line{font-size:clamp(16px,1.9vw,22px);font-weight:600;color:#f2ede2;margin-top:20px;max-width:30ch;text-wrap:balance}
.cv3 .mn3-fb{position:absolute;inset:0;z-index:4;opacity:clamp(0,calc((var(--p,0) - .5)/.14),1)}
.cv3 .mn3-fb-head{position:absolute;left:clamp(24px,7vw,120px);right:clamp(24px,7vw,120px);top:clamp(40px,12vh,120px)}
.cv3 .mn3-fb-grade{font-size:clamp(44px,8vw,110px);font-weight:900;letter-spacing:-.04em;color:var(--accent);line-height:.9;font-variant-numeric:tabular-nums}
.cv3 .mn3-fb-cap{font-family:var(--mono);font-size:clamp(12px,1.4vw,15px);letter-spacing:.06em;color:#e6e2da;margin-top:12px}
.cv3 .mn3-fb-sec{position:absolute;left:clamp(24px,7vw,120px);right:clamp(24px,7vw,120px);bottom:clamp(46px,11vh,120px);height:min(38vh,320px);clip-path:inset(calc((1 - clamp(0,calc((var(--p,0) - .56)/.32),1))*100%) 0 0 0)}
.cv3 .mn3-fb-sec svg{width:100%;height:100%;display:block;filter:drop-shadow(0 1px 3px rgba(0,0,0,.7))}
.cv3 .mn3-fb-seclab{position:absolute;left:clamp(24px,7vw,120px);bottom:clamp(24px,6vh,60px);font-family:var(--mono);font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:#cfcabf}
/* CH04 portfolio — persistent region map + a register that lights each project in turn */
.cv3 .mn3-port{position:absolute;inset:0;z-index:3;display:grid;grid-template-columns:1.05fr .95fr;align-items:center;gap:clamp(20px,3vw,50px);padding:clamp(40px,8vh,90px) clamp(24px,6vw,100px)}
@media(max-width:820px){.cv3 .mn3-port{grid-template-columns:1fr;grid-template-rows:auto 1fr;gap:18px;padding-top:clamp(70px,10vh,90px)}}
.cv3 .mn3-map{position:relative;height:min(66vh,560px)}
.cv3 .mn3-map svg{width:100%;height:100%;overflow:visible}
.cv3 .mn3-map .nvout{fill:color-mix(in srgb,var(--ink) 5%,transparent);stroke:var(--line2);stroke-width:1.5}
.cv3 .mn3-map .grat{stroke:var(--line2);stroke-width:.7;opacity:.5}
.cv3 .mn3-map .pin{--rp:clamp(0,calc((var(--p,0) - .08)/.72*var(--n,3) - var(--i,0)),1)}
.cv3 .mn3-map .pin .halo{opacity:calc(var(--rp)*.9);transform-box:fill-box;transform-origin:center;transform:scale(calc(.4 + var(--rp)*.6))}
.cv3 .mn3-map .pin .dot{fill:var(--accent);opacity:calc(.3 + var(--rp)*.7)}
.cv3 .mn3-map .pin .plab{fill:var(--bg);font-family:var(--font);font-weight:800;font-size:4px;opacity:calc(.4 + var(--rp)*.6)}
.cv3 .mn3-pj .pjnum{display:inline-block;min-width:1.4em;font-family:var(--mono);font-size:.5em;font-weight:600;color:var(--accent);vertical-align:middle;margin-right:.2em}
.cv3 .mn3-porthead{font-family:var(--mono);font-size:clamp(12px,1.5vw,16px);letter-spacing:.16em;text-transform:uppercase;color:var(--accent);margin-bottom:20px}
.cv3 .mn3-pj{--rp:clamp(0,calc((var(--p,0) - .08)/.72*var(--n,3) - var(--i,0)),1);opacity:calc(.26 + var(--rp)*.74);padding:clamp(11px,2vh,20px) 0;border-top:1px solid var(--line2)}
.cv3 .mn3-pj .pjname{font-size:clamp(24px,3.2vw,42px);font-weight:900;letter-spacing:-.03em;line-height:1}
.cv3 .mn3-pj .pjmeta{font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);margin-top:9px}
.cv3 .mn3-pj .pjdesc{font-size:clamp(13px,1.4vw,16px);line-height:1.45;color:color-mix(in srgb,var(--ink) 74%,transparent);margin-top:9px;max-width:46ch;max-height:calc(var(--rp)*140px);overflow:hidden}
/* CH05 economics — restrained figure grid, market cap NOT dominant */
.cv3 .mn3-econ{display:grid;grid-template-columns:repeat(3,1fr);gap:clamp(20px,4vh,44px) clamp(28px,5vw,70px);width:100%;max-width:920px;margin:30px auto 0}
@media(max-width:760px){.cv3 .mn3-econ{grid-template-columns:repeat(2,1fr)}}
.cv3 .mn3-econ .e{--rp:clamp(0,calc((var(--p,0) - .12)/.5*var(--en,6) - var(--i,0)),1);opacity:var(--rp);transform:translateY(calc((1 - var(--rp))*20px))}
.cv3 .mn3-econ .ev{font-size:clamp(30px,4.4vw,60px);font-weight:900;letter-spacing:-.035em;line-height:.94;font-variant-numeric:tabular-nums}
.cv3 .mn3-econ .ek{font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);margin-top:9px}
.cv3 .mn3-econ-note{max-width:50ch;margin:clamp(26px,5vh,50px) auto 0;font-family:var(--mono);font-size:clamp(11px,1.2vw,13px);letter-spacing:.04em;color:var(--dim);opacity:clamp(0,calc((var(--p,0) - .62)/.26),1)}
/* CH07 why — four numbered reasons revealed as distinct beats */
.cv3 .mn3-why{display:flex;flex-direction:column;gap:clamp(14px,2.4vh,30px);width:100%;max-width:1000px;margin:18px auto 0}
.cv3 .mn3-reason{--rp:clamp(0,calc((var(--p,0) - .12)/.66*var(--wn,4) - var(--i,0)),1);display:grid;grid-template-columns:auto 1fr;gap:clamp(18px,3vw,40px);align-items:baseline;opacity:calc(.22 + var(--rp)*.78);transform:translateY(calc((1 - var(--rp))*24px))}
.cv3 .mn3-reason .rn{font-family:var(--mono);font-size:clamp(13px,1.5vw,17px);color:var(--accent);font-weight:600;padding-top:.4em}
.cv3 .mn3-reason .rw{font-size:clamp(21px,3vw,42px);font-weight:800;letter-spacing:-.025em;line-height:1.08;text-wrap:balance}
/* CH08 CTA */
.cv3 .mn3-lead-intro{font-size:clamp(16px,2vw,24px);line-height:1.4;font-weight:600;max-width:52ch;color:color-mix(in srgb,var(--ink) 82%,transparent);margin-top:14px;opacity:clamp(0,calc((var(--p,0) - .04)/.16),1)}
.cv3 .mn3-cta-list{display:flex;flex-wrap:wrap;gap:10px 26px;margin:26px 0;justify-content:center}
.cv3 .mn3-cta-list span{font-family:var(--mono);font-size:clamp(11px,1.3vw,14px);letter-spacing:.12em;text-transform:uppercase;color:var(--dim)}
.cv3 .mn3-cta-go{display:inline-flex;align-items:center;gap:10px;font-family:var(--mono);font-size:clamp(13px,1.5vw,16px);letter-spacing:.1em;text-transform:uppercase;color:var(--accent);border:1px solid var(--accent);border-radius:999px;padding:14px 26px;margin-top:8px}
@media (prefers-reduced-motion:reduce){
  .cv3 .mn3-snap .f,.cv3 .mn3-snap-sup,.cv3 .mn3-fa,.cv3 .mn3-fb,.cv3 .mn3-econ .e,.cv3 .mn3-econ-note,.cv3 .mn3-reason,.cv3 .mn3-pj,.cv3 .mn3-lead-intro{opacity:1!important;transform:none!important}
  .cv3 .mn3-fb-sec{clip-path:none!important}.cv3 .mn3-map .pin .dot,.cv3 .mn3-map .pin .plab{opacity:1!important}
}
/* ══════ 02 · ATLAS (V5) — a premium interactive FIELD ATLAS. Same canonical story as Monolith, told
   through geography. Motion grammar = arrival-triggered cartographic "registration" (a chapter turns in
   like a new plate) — deliberately NOT Monolith's continuous scrub. Namespace atx-. ══════ */
.cv3 .atx{position:relative;background:var(--bg)}
.cv3 .atx-ch{position:relative;min-height:100vh;display:flex;flex-direction:column;justify-content:center;padding:clamp(52px,10vh,120px) clamp(28px,7vw,120px);overflow:hidden}
.cv3 .atx-in{position:relative;z-index:3;width:100%;max-width:1200px;margin:0 auto}
.cv3 .atx-eyebrow{font-family:var(--mono);font-size:clamp(11px,1.3vw,14px);letter-spacing:.22em;text-transform:uppercase;color:var(--accent)}
.cv3 .atx-h{font-size:clamp(34px,5vw,74px);font-weight:800;letter-spacing:-.03em;line-height:1;text-wrap:balance}
/* the recurring cartographic signature: a fine registration frame + corner plate/coordinate labels */
.cv3 .atx-frame{position:absolute;inset:clamp(16px,3.2vh,34px) clamp(16px,3.2vw,40px);border:1px solid var(--line2);pointer-events:none;z-index:2}
.cv3 .atx-frame i{position:absolute;width:11px;height:11px;border:0 solid var(--accent);opacity:.75}
.cv3 .atx-frame i.tl{top:-1px;left:-1px;border-top-width:2px;border-left-width:2px}
.cv3 .atx-frame i.tr{top:-1px;right:-1px;border-top-width:2px;border-right-width:2px}
.cv3 .atx-frame i.bl{bottom:-1px;left:-1px;border-bottom-width:2px;border-left-width:2px}
.cv3 .atx-frame i.br{bottom:-1px;right:-1px;border-bottom-width:2px;border-right-width:2px}
.cv3 .atx-plateno{position:absolute;z-index:3;top:clamp(22px,4vh,44px);right:clamp(24px,4.6vw,58px);font-family:var(--mono);font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim)}
.cv3 .atx-foot{position:absolute;z-index:3;left:clamp(24px,4.6vw,58px);bottom:clamp(22px,4vh,44px);font-family:var(--mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim)}
/* arrival reveal — children register in when the chapter gets .on */
.cv3 .atx-reg{opacity:0;clip-path:inset(0 0 100% 0);transition:clip-path 1s cubic-bezier(.7,0,.18,1),opacity .7s ease}
.cv3 .atx-ch.on .atx-reg{opacity:1;clip-path:inset(0 0 -4% 0)}
.cv3 .atx-ch.on .atx-reg.d1{transition-delay:.1s}.cv3 .atx-ch.on .atx-reg.d2{transition-delay:.22s}.cv3 .atx-ch.on .atx-reg.d3{transition-delay:.34s}.cv3 .atx-ch.on .atx-reg.d4{transition-delay:.46s}
/* ── the Atlas map (cartographic: graticule + coordinate frame + pins + crosshair target) ── */
.cv3 .atx-map{position:relative;width:100%}
.cv3 .atx-map svg{width:100%;height:100%;display:block;overflow:visible}
.cv3 .atx .amout{fill:color-mix(in srgb,var(--ink) 4%,transparent);stroke:var(--ink);stroke-opacity:.4;stroke-width:1.2}
.cv3 .atx .amgrat{stroke:var(--line2);stroke-width:.6}
.cv3 .atx .amglab{fill:var(--dim);font-family:var(--mono);font-size:3.4px;letter-spacing:.4px}
.cv3 .atx .ampin .amdot{fill:var(--accent)}
.cv3 .atx .ampin .amhalo{fill:none;stroke:var(--accent);stroke-width:.8;opacity:0;transform-box:fill-box;transform-origin:center;transform:scale(.3);transition:opacity .6s,transform .6s}
.cv3 .atx-ch.on .atx .ampin .amhalo{opacity:.85;transform:scale(1)}
.cv3 .atx .ampin .amnum{fill:var(--bg);font-family:var(--font);font-weight:800;font-size:4px}
.cv3 .atx .ampin .amlab{fill:var(--ink);font-family:var(--mono);font-size:3.6px;letter-spacing:.4px;opacity:0;transition:opacity .6s .3s}
.cv3 .atx-ch.on .atx .ampin .amlab{opacity:.85}
.cv3 .atx .amcross{stroke:var(--accent);stroke-width:.7;opacity:0;transition:opacity .5s}
.cv3 .atx-ch.on .atx .amcross{opacity:.9}
/* CH1 LOCATE — full-screen map, identity + coordinate HUD over it */
.cv3 .atx-locate{padding:0}
.cv3 .atx-locate .atx-map{position:absolute;inset:0;height:100%;z-index:0}
.cv3 .atx-locate .atx-map svg{height:100%}
.cv3 .atx-loc-copy{position:relative;z-index:4;margin-top:auto;padding:clamp(40px,9vh,110px) clamp(28px,7vw,120px)}
.cv3 .atx-loc-name{font-size:clamp(40px,8vw,120px);font-weight:900;letter-spacing:-.04em;line-height:.92;text-shadow:0 2px 40px var(--bg)}
.cv3 .atx-coord{position:absolute;z-index:4;top:clamp(56px,11vh,110px);left:clamp(28px,7vw,120px);font-family:var(--mono);font-size:clamp(11px,1.3vw,14px);letter-spacing:.14em;color:var(--accent);line-height:1.7}
/* CH2 FIELD INDEX — atlas front-matter with dotted leaders */
.cv3 .atx-index{margin-top:30px;border-top:1px solid var(--ink);border-top-color:color-mix(in srgb,var(--ink) 30%,transparent)}
.cv3 .atx-ix-row{display:grid;grid-template-columns:auto 1fr auto;gap:16px;align-items:baseline;padding:clamp(14px,2.4vh,26px) 0;border-bottom:1px solid var(--line2)}
.cv3 .atx-ix-row .ixk{font-family:var(--mono);font-size:clamp(11px,1.2vw,13px);letter-spacing:.14em;text-transform:uppercase;color:var(--dim)}
.cv3 .atx-ix-row .ixlead{border-bottom:1px dotted var(--line2);transform:translateY(-4px)}
.cv3 .atx-ix-row .ixv{font-size:clamp(26px,3.6vw,52px);font-weight:800;letter-spacing:-.025em;font-variant-numeric:tabular-nums}
.cv3 .atx-ix-plate{font-family:var(--mono);font-size:11px;color:var(--accent);width:2.6em}
.cv3 .atx-index-sup{margin-top:34px;font-size:clamp(16px,1.9vw,23px);line-height:1.4;font-weight:600;max-width:46ch;color:color-mix(in srgb,var(--ink) 82%,transparent)}
/* CH3 FLAGSHIP FIELD PLATE — annotated full-bleed photograph */
.cv3 .atx-plate{padding:0}
.cv3 .atx-plate-photo{position:absolute;inset:0;z-index:0}
.cv3 .atx-plate-photo img{width:100%;height:100%;object-fit:cover}
.cv3 .atx-plate-photo::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.62),rgba(0,0,0,.18) 55%,rgba(0,0,0,.42))}
.cv3 .atx-plate-body{position:relative;z-index:4;margin-top:auto;padding:clamp(40px,9vh,110px) clamp(28px,7vw,120px);color:#fff}
.cv3 .atx-plate-title{font-size:clamp(30px,4.4vw,64px);font-weight:900;letter-spacing:-.03em;line-height:.98}
.cv3 .atx-anno{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:clamp(14px,2vw,30px);margin-top:26px;max-width:820px}
.cv3 .atx-anno .a{border-left:2px solid var(--accent);padding-left:14px}
.cv3 .atx-anno .av{font-size:clamp(18px,2vw,26px);font-weight:800;letter-spacing:-.02em;color:#fff}
.cv3 .atx-anno .ak{font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:#d8d3c8;margin-top:4px}
.cv3 .atx-plate-line{font-size:clamp(15px,1.7vw,20px);line-height:1.5;color:#f0ebe0;max-width:52ch;margin-top:24px}
.cv3 .atx-scalebar{position:absolute;z-index:4;right:clamp(28px,7vw,120px);top:clamp(70px,14vh,150px);text-align:right;font-family:var(--mono);font-size:10px;letter-spacing:.1em;color:#e6e2da}
.cv3 .atx-scalebar .bar{height:3px;width:120px;background:linear-gradient(90deg,#fff 0 50%,transparent 50%);border:1px solid #fff;margin-top:6px;margin-left:auto}
/* CH4 DISCOVERY — technical insert plate */
.cv3 .atx-insert-frame{position:relative;margin:26px auto 0;max-width:960px;border:1px solid var(--line2);padding:clamp(18px,3vw,40px);background:color-mix(in srgb,var(--ink) 3%,transparent)}
.cv3 .atx-insert-frame::before{content:"FIG. 01";position:absolute;top:-9px;left:22px;background:var(--bg);padding:0 8px;font-family:var(--mono);font-size:10px;letter-spacing:.18em;color:var(--dim)}
.cv3 .atx-insert-grid{display:grid;grid-template-columns:1.4fr 1fr;gap:clamp(20px,4vw,54px);align-items:center}
@media(max-width:820px){.cv3 .atx-insert-grid{grid-template-columns:1fr}}
.cv3 .atx-insert-fig{position:relative;width:100%;aspect-ratio:5/3}
.cv3 .atx-insert-fig svg{width:100%;height:100%}
.cv3 .atx-insert-grade{font-size:clamp(44px,7vw,96px);font-weight:900;letter-spacing:-.04em;color:var(--accent);line-height:.9;font-variant-numeric:tabular-nums}
.cv3 .atx-insert-cap{font-family:var(--mono);font-size:clamp(11px,1.3vw,14px);letter-spacing:.06em;color:var(--dim);margin-top:14px;line-height:1.6}
/* CH5 PORTFOLIO — the geographic pullback: map + field register with photo insets */
.cv3 .atx-port{display:grid;grid-template-columns:1fr 1fr;gap:clamp(24px,4vw,64px);align-items:center}
@media(max-width:900px){.cv3 .atx-port{grid-template-columns:1fr;gap:24px}}
.cv3 .atx-port .atx-map{height:min(64vh,560px)}
.cv3 .atx-preg-row{display:grid;grid-template-columns:64px 1fr;gap:16px;align-items:center;padding:clamp(11px,2vh,18px) 0;border-top:1px solid var(--line2)}
.cv3 .atx-preg-row .thumb{width:64px;height:48px;object-fit:cover;filter:grayscale(.2)}
.cv3 .atx-preg-row .thumbx{width:64px;height:48px;border:1px solid var(--line2);display:grid;place-items:center;font-family:var(--mono);font-size:16px;color:var(--dim)}
.cv3 .atx-preg-row .prn{font-size:clamp(18px,2.2vw,30px);font-weight:800;letter-spacing:-.02em;line-height:1}
.cv3 .atx-preg-row .prm{font-family:var(--mono);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);margin-top:6px}
.cv3 .atx-preg-row .prd{font-size:clamp(12px,1.3vw,14.5px);line-height:1.4;color:color-mix(in srgb,var(--ink) 72%,transparent);margin-top:6px;max-width:40ch}
/* CH6 TREASURY LEDGER — ruled field-accounts page (NOT a dashboard) */
.cv3 .atx-ledger{margin-top:30px;max-width:860px}
.cv3 .atx-led-row{display:grid;grid-template-columns:2.4em 1fr auto;gap:18px;align-items:baseline;padding:clamp(13px,2.2vh,22px) 0;border-bottom:1px solid var(--line2)}
.cv3 .atx-led-row:first-child{border-top:1px solid color-mix(in srgb,var(--ink) 30%,transparent)}
.cv3 .atx-led-row .ln{font-family:var(--mono);font-size:11px;color:var(--dim)}
.cv3 .atx-led-row .lk{font-family:var(--mono);font-size:clamp(11px,1.3vw,14px);letter-spacing:.1em;text-transform:uppercase;color:color-mix(in srgb,var(--ink) 78%,transparent)}
.cv3 .atx-led-row .lv{font-size:clamp(22px,2.8vw,40px);font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums;text-align:right}
.cv3 .atx-led-note{margin-top:22px;font-family:var(--mono);font-size:11px;letter-spacing:.05em;color:var(--dim)}
/* CH7 TRAVERSE — survey route from current stage to the milestone */
.cv3 .atx-route{position:relative;margin:44px 0 0}
.cv3 .atx-route svg{width:100%;height:120px;overflow:visible}
.cv3 .atx-route .rline{fill:none;stroke:var(--line2);stroke-width:2}
.cv3 .atx-route .rprog{fill:none;stroke:var(--accent);stroke-width:2.4;stroke-dasharray:1;stroke-dashoffset:1;transition:stroke-dashoffset 1.6s cubic-bezier(.65,0,.35,1) .2s}
.cv3 .atx-ch.on .atx-route .rprog{stroke-dashoffset:0}
.cv3 .atx-route .rst{fill:var(--bg);stroke:var(--dim);stroke-width:1.5}
.cv3 .atx-route .rst.here{stroke:var(--accent);fill:var(--accent)}
.cv3 .atx-stations{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:10px}
.cv3 .atx-stations .st .stt{font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--accent)}
.cv3 .atx-stations .st .stl{font-size:clamp(16px,1.9vw,24px);font-weight:800;letter-spacing:-.02em;margin-top:8px;line-height:1.1}
.cv3 .atx-stations .st .std{font-size:clamp(13px,1.4vw,15px);line-height:1.45;color:color-mix(in srgb,var(--ink) 72%,transparent);margin-top:8px}
/* CH8 INVESTMENT CASE — field-guide legend */
.cv3 .atx-legend{margin-top:26px;display:flex;flex-direction:column}
.cv3 .atx-leg-row{display:grid;grid-template-columns:44px 8.5em 1fr;gap:clamp(14px,2.5vw,40px);align-items:center;padding:clamp(16px,2.8vh,30px) 0;border-top:1px solid var(--line2)}
@media(max-width:760px){.cv3 .atx-leg-row{grid-template-columns:44px 1fr;row-gap:6px}.cv3 .atx-leg-row .legd{grid-column:2}}
.cv3 .atx-leg-row .legsym svg{width:34px;height:34px}
.cv3 .atx-leg-row .legl{font-family:var(--mono);font-size:clamp(13px,1.6vw,19px);letter-spacing:.1em;text-transform:uppercase;color:var(--accent);font-weight:600}
.cv3 .atx-leg-row .legd{font-size:clamp(16px,1.9vw,24px);font-weight:700;letter-spacing:-.02em;line-height:1.28}
/* CH9 FIELD ROSTER — expedition roster over a field-crew photo */
.cv3 .atx-roster-ch{padding:0}
.cv3 .atx-roster-photo{position:absolute;inset:0;z-index:0}
.cv3 .atx-roster-photo img{width:100%;height:100%;object-fit:cover;filter:grayscale(.3)}
.cv3 .atx-roster-photo::after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,var(--bg) 6%,rgba(0,0,0,.55) 55%,rgba(0,0,0,.68))}
.cv3 .atx-roster-body{position:relative;z-index:4;padding:clamp(52px,10vh,120px) clamp(28px,7vw,120px)}
.cv3 .atx-roster-intro{font-size:clamp(17px,2.1vw,26px);line-height:1.35;font-weight:600;max-width:52ch;color:#f2ede2;margin-top:12px}
.cv3 .atx-roster{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:clamp(12px,1.6vw,22px);margin-top:30px}
.cv3 .atx-rmem{display:grid;grid-template-columns:auto 1fr;gap:13px;align-items:center;border-top:1px solid rgba(255,255,255,.16);padding-top:12px}
.cv3 .atx-rmem .rid{font-family:var(--mono);font-size:10px;letter-spacing:.1em;color:var(--accent);border:1px solid rgba(255,255,255,.24);padding:5px 7px;white-space:nowrap}
.cv3 .atx-rmem .rnm{font-size:clamp(15px,1.6vw,18px);font-weight:800;color:#fff;line-height:1.1}
.cv3 .atx-rmem .rrl{font-family:var(--mono);font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:#cfc9bd;margin-top:3px}
/* CH10 CLOSE — geographic pullback + CTA */
.cv3 .atx-close{padding:0}
.cv3 .atx-close .atx-map{position:absolute;inset:0;height:100%;z-index:0;opacity:.5}
.cv3 .atx-close-body{position:relative;z-index:4;margin:auto;text-align:center;padding:clamp(40px,9vh,110px) clamp(28px,7vw,120px)}
.cv3 .atx-close-name{font-size:clamp(38px,7vw,110px);font-weight:900;letter-spacing:-.04em;line-height:.9}
.cv3 .atx-close-list{display:flex;flex-wrap:wrap;gap:10px 24px;justify-content:center;margin:24px 0}
.cv3 .atx-close-list span{font-family:var(--mono);font-size:clamp(11px,1.3vw,13px);letter-spacing:.12em;text-transform:uppercase;color:var(--dim)}
.cv3 .atx-close-go{display:inline-flex;align-items:center;gap:10px;font-family:var(--mono);font-size:clamp(13px,1.5vw,16px);letter-spacing:.1em;text-transform:uppercase;color:var(--accent);border:1px solid var(--accent);border-radius:999px;padding:14px 26px}
@media (prefers-reduced-motion:reduce){.cv3 .atx-reg{opacity:1!important;clip-path:none!important}.cv3 .atx-route .rprog{stroke-dashoffset:0!important}.cv3 .atx .ampin .amhalo,.cv3 .atx .ampin .amlab,.cv3 .atx .amcross{opacity:1!important;transform:none!important}}
/* ── ATLAS NATIVE PALETTE — cartographic/survey families, decoupled from the global dark themes.
   Default = DAY (limestone paper + charcoal ink + oxide accent). A few Atlas-specific variants map off
   the theme swatch so the selector cycles Atlas colours, never Monolith's. Scoped to .atx only. ── */
.cv3 .atx{--bg:#e9e1d0;--ink:#2a251f;--dim:#7d715c;--faint:#c5b9a1;--line2:#cabd9f;--chip:#ded2ba;--accent:#bd5320;--accent2:#d98a3c;background:var(--bg);color:var(--ink)}
.cv3[data-variant="pine"] .atx,.cv3[data-variant="amethyst"] .atx{--bg:#e1e4d4;--ink:#243029;--dim:#6b7663;--faint:#bcc4ab;--line2:#bfc7ac;--chip:#d4dac4;--accent:#5d7344;--accent2:#89a268}
.cv3[data-variant="cellar"] .atx,.cv3[data-variant="graphite"] .atx{--bg:#201f1b;--ink:#ece2d2;--dim:#9b907c;--faint:#453f37;--line2:#38332b;--chip:#2b2924;--accent:#d3652c;--accent2:#e79a4e}
/* ATLAS TYPOGRAPHY — editorial serif display (inverts Monolith's heavy sans) + mono survey labels */
.cv3 .atx-h,.cv3 .atx-loc-name,.cv3 .atx-plate-title,.cv3 .atx-close-name,.cv3 .atx-preg-row .prn,.cv3 .atx-entry-name,.cv3 .atx-fieldrec-grade,.cv3 .atx-index .ixv{font-family:var(--serif);font-weight:500;letter-spacing:-.005em}
.cv3 .atx-loc-name,.cv3 .atx-close-name{font-weight:400;letter-spacing:-.01em}
/* CH1 TITLE SHEET — an atlas cover: dominant name in clean space + a contained locator figure */
.cv3 .atx-title{padding:0;justify-content:stretch}
.cv3 .atx-title-meta{position:absolute;z-index:3;top:clamp(22px,4vh,44px);left:clamp(28px,6vw,90px);font-family:var(--mono);font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--dim)}
.cv3 .atx-title-grid{position:relative;z-index:3;margin:auto;width:100%;max-width:1200px;padding:clamp(60px,10vh,120px) clamp(28px,6vw,90px);display:grid;grid-template-columns:1.35fr .65fr;gap:clamp(30px,5vw,80px);align-items:center}
@media(max-width:820px){.cv3 .atx-title-grid{grid-template-columns:1fr;gap:36px}}
.cv3 .atx-title .atx-loc-name{font-size:clamp(46px,8vw,120px);line-height:.98;text-shadow:none;margin-top:14px}
.cv3 .atx-title-tag{font-size:clamp(16px,2vw,24px);line-height:1.4;max-width:30ch;margin-top:22px;color:color-mix(in srgb,var(--ink) 82%,transparent)}
.cv3 .atx-title-fig{margin:0}
.cv3 .atx-title-map{border:1px solid var(--ink);background:color-mix(in srgb,var(--ink) 3%,transparent);padding:16px;height:min(46vh,400px)}
.cv3 .atx-title-map svg{width:100%;height:100%}
.cv3 .atx-title-fig figcaption{font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);margin-top:11px;text-align:center}
/* CH4 FIELD RECORD — assay/core-log ribbon (visualises ONLY grade + interval width + hole id) */
.cv3 .atx-fieldrec{margin-top:20px;max-width:760px}
.cv3 .atx-fieldrec-grade{font-size:clamp(58px,11vw,170px);line-height:.86;color:var(--accent)}
.cv3 .atx-fieldrec-sub{font-family:var(--mono);font-size:clamp(13px,1.6vw,18px);letter-spacing:.08em;color:var(--ink);margin-top:14px}
.cv3 .atx-corelog{margin-top:30px}
.cv3 .atx-corelog .clbar{position:relative;height:38px;border:1px solid var(--ink);border-radius:3px;overflow:hidden;background:repeating-linear-gradient(90deg,transparent 0 13px,color-mix(in srgb,var(--ink) 9%,transparent) 13px 14px)}
.cv3 .atx-corelog .clfill{position:absolute;inset:0;background:linear-gradient(90deg,color-mix(in srgb,var(--accent) 72%,transparent),var(--accent));clip-path:inset(0 100% 0 0);transition:clip-path 1.4s cubic-bezier(.65,0,.35,1) .3s}
.cv3 .atx-ch.on .atx-corelog .clfill{clip-path:inset(0 0 0 0)}
.cv3 .atx-corelog .clscale{display:flex;justify-content:space-between;margin-top:9px;font-family:var(--mono);font-size:11px;letter-spacing:.08em;color:var(--dim)}
.cv3 .atx-fieldrec-note{font-family:var(--mono);font-size:11px;letter-spacing:.04em;color:var(--dim);margin-top:26px;max-width:54ch;line-height:1.6}
/* CH5 PORTFOLIO — indexed atlas entries, image-forward, alternating; dynamic count */
.cv3 .atx-entries{margin-top:18px}
.cv3 .atx-entry{display:grid;grid-template-columns:minmax(200px,42%) 1fr;gap:clamp(22px,4vw,56px);align-items:center;padding:clamp(22px,4vh,46px) 0;border-top:1px solid var(--line2)}
.cv3 .atx-entry:nth-child(even) .atx-entry-fig{order:2}
@media(max-width:760px){.cv3 .atx-entry{grid-template-columns:1fr}.cv3 .atx-entry:nth-child(even) .atx-entry-fig{order:0}}
.cv3 .atx-entry-fig{position:relative;aspect-ratio:4/3;overflow:hidden;border:1px solid var(--line2)}
.cv3 .atx-entry-fig img{width:100%;height:100%;object-fit:cover}
.cv3 .atx-entry-figx{width:100%;height:100%;display:grid;place-items:center;font-family:var(--serif);font-size:64px;color:var(--faint);background:var(--chip)}
.cv3 .atx-entry-ix{position:absolute;top:10px;left:10px;font-family:var(--mono);font-size:12px;letter-spacing:.1em;background:var(--bg);color:var(--accent);padding:4px 10px;border:1px solid var(--line2)}
.cv3 .atx-entry-loc{font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
.cv3 .atx-entry-name{font-size:clamp(28px,4vw,56px);line-height:1;margin-top:9px}
.cv3 .atx-entry-meta{font-family:var(--mono);font-size:12px;letter-spacing:.06em;color:var(--dim);margin-top:13px}
.cv3 .atx-entry-desc{font-size:clamp(15px,1.7vw,19px);line-height:1.5;margin-top:14px;max-width:48ch;color:color-mix(in srgb,var(--ink) 82%,transparent)}
/* CH10 CLOSE — colophon: a small pull-back locator + CTA (no full-bleed map behind the type) */
.cv3 .atx-close{padding:0}
.cv3 .atx-close .atx-close-body{position:relative;z-index:4;margin:auto;text-align:center;padding:clamp(48px,9vh,110px) clamp(28px,7vw,120px);max-width:820px}
.cv3 .atx-close-fig{width:clamp(130px,20vw,190px);height:clamp(150px,24vh,230px);margin:0 auto 30px;border:1px solid var(--line2);padding:12px}
.cv3 .atx-close-fig svg{width:100%;height:100%}
.cv3 .atx-treg-head{display:grid;grid-template-columns:2.4em 1fr auto;gap:18px;padding-bottom:10px;border-bottom:2px solid var(--ink);font-family:var(--mono);font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim);margin-top:22px}
.cv3 .atx-treg-head span:last-child{text-align:right}
/* ══════ 04 · STRATA (V6) — a continuous VERTICAL GEOLOGICAL DESCENT. Same canonical story as Monolith/
   Atlas, told as layers passed on the way down. Native palette: cool slate at surface → warm umber at
   depth (mineral/verdigris accent). Motion = emergence from depth. A persistent depth rail is the spine.
   Namespace st2-. ══════ */
.cv3 .st2{--bg:#232a30;--ink:#e9edf0;--dim:#8a97a1;--faint:#39434b;--line2:#323c44;--chip:#2b333b;--accent:#3f9e88;--accent2:#67c2a9;position:relative;color:var(--ink);background:linear-gradient(180deg,#242b32 0%,#232a2c 42%,#2a2620 76%,#2b2019 100%)}
.cv3[data-variant="pine"] .st2,.cv3[data-variant="harbor"] .st2{--accent:#5b86c4;--accent2:#89ade0;background:linear-gradient(180deg,#232830 0%,#232a30 45%,#26282f 100%)}
.cv3[data-variant="cellar"] .st2,.cv3[data-variant="graphite"] .st2{--accent:#c47a45;--accent2:#e0a069;background:linear-gradient(180deg,#282420 0%,#2a231d 50%,#2c1e16 100%)}
/* depth rail — the structural backbone (fixed on the left; a marker descends with scroll) */
.cv3 .st2-rail{position:fixed;left:clamp(16px,3vw,42px);top:0;height:100vh;width:60px;z-index:8;pointer-events:none;display:flex;flex-direction:column;justify-content:center}
.cv3 .st2-rail-line{position:absolute;left:10px;top:12vh;bottom:12vh;width:1px;background:var(--line2)}
.cv3 .st2-rail-fill{position:absolute;left:10px;top:12vh;width:1px;height:calc(var(--dp,0)*76vh);background:var(--accent);box-shadow:0 0 12px -2px var(--accent)}
.cv3 .st2-rail-mark{position:absolute;left:6px;top:calc(12vh + var(--dp,0)*76vh);width:9px;height:9px;border-radius:50%;background:var(--accent);transform:translateY(-50%);box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 22%,transparent)}
.cv3 .st2-rail-lab{position:absolute;left:26px;top:calc(12vh + var(--dp,0)*76vh);transform:translateY(-50%);font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);white-space:nowrap}
.cv3 .st2-rail-dep{position:absolute;left:26px;top:calc(12vh + var(--dp,0)*76vh + 14px);transform:translateY(-50%);font-family:var(--mono);font-size:9px;letter-spacing:.1em;color:var(--dim);white-space:nowrap}
@media(max-width:760px){.cv3 .st2-rail{display:none}}
/* chapters — whitespace-rich, left room for the rail; emerge as you descend */
.cv3 .st2-ch{position:relative;min-height:92vh;display:flex;flex-direction:column;justify-content:center;padding:clamp(48px,10vh,120px) clamp(28px,6vw,90px) clamp(48px,10vh,120px) clamp(80px,10vw,150px)}
.cv3 .st2-ch.tall{min-height:auto;padding-top:clamp(60px,14vh,160px);padding-bottom:clamp(60px,14vh,160px)}
.cv3 .st2-in{width:100%;max-width:1080px}
.cv3 .st2-eyebrow{font-family:var(--mono);font-size:clamp(11px,1.3vw,14px);letter-spacing:.22em;text-transform:uppercase;color:var(--accent)}
.cv3 .st2-depthtag{font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim)}
/* emergence reveal (blur clears, rises from depth) — Strata's own motion */
.cv3 .st2-em{opacity:0;transform:translateY(30px);filter:blur(6px);transition:opacity 1s ease,transform 1.1s cubic-bezier(.2,1,.3,1),filter 1s ease}
.cv3 .st2 .on .st2-em{opacity:1;transform:none;filter:none}
.cv3 .st2 .on .st2-em.e1{transition-delay:.08s}.cv3 .st2 .on .st2-em.e2{transition-delay:.2s}.cv3 .st2 .on .st2-em.e3{transition-delay:.32s}.cv3 .st2 .on .st2-em.e4{transition-delay:.44s}
/* SURFACE / IDENTITY */
.cv3 .st2-name{font-size:clamp(44px,8.5vw,132px);font-weight:900;letter-spacing:-.04em;line-height:.92}
.cv3 .st2-tag{font-size:clamp(16px,2vw,24px);line-height:1.4;max-width:34ch;margin-top:20px;color:color-mix(in srgb,var(--ink) 82%,transparent)}
.cv3 .st2-surface-mk{font-family:var(--mono);font-size:10px;letter-spacing:.3em;text-transform:uppercase;color:var(--dim);margin-bottom:26px;display:flex;align-items:center;gap:14px}
.cv3 .st2-surface-mk::after{content:"";flex:1;height:1px;background:var(--line2)}
/* SNAPSHOT — four facts as a descending column, not a grid */
.cv3 .st2-facts{margin-top:8px}
.cv3 .st2-fact{display:grid;grid-template-columns:auto 1fr;gap:clamp(16px,3vw,40px);align-items:baseline;padding:clamp(16px,2.6vh,28px) 0;border-bottom:1px solid var(--line2)}
.cv3 .st2-fact .fv{font-size:clamp(34px,5vw,72px);font-weight:900;letter-spacing:-.035em;line-height:.95;font-variant-numeric:tabular-nums}
.cv3 .st2-fact .fk{font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);text-align:right}
.cv3 .st2-sup{font-size:clamp(17px,2vw,25px);line-height:1.4;font-weight:600;max-width:44ch;margin-top:30px;text-wrap:balance}
/* CROSS-SECTION — honest: decorative stratigraphy + factual intercept bars (no fabricated geometry) */
.cv3 .st2-sec-wrap{position:relative;margin-top:26px;border:1px solid var(--line2);background:color-mix(in srgb,#000 18%,transparent);overflow:hidden}
.cv3 .st2-sec-wrap svg{width:100%;height:auto;display:block}
.cv3 .st2-band{opacity:.5}
.cv3 .st2-icept{opacity:0;transition:opacity .6s ease}
.cv3 .st2 .on .st2-icept{opacity:1}
.cv3 .st2-sec-note{font-family:var(--mono);font-size:10.5px;letter-spacing:.04em;color:var(--dim);margin-top:14px;line-height:1.6;max-width:64ch}
/* RESOURCE / KEY RESULT / big layer figures */
.cv3 .st2-big{font-size:clamp(54px,10vw,180px);font-weight:900;letter-spacing:-.05em;line-height:.86;font-variant-numeric:tabular-nums}
.cv3 .st2-big .u{font-size:.26em;font-weight:700;color:var(--accent);letter-spacing:0}
.cv3 .st2-line{font-family:var(--mono);font-size:clamp(12px,1.5vw,16px);letter-spacing:.06em;color:color-mix(in srgb,var(--ink) 82%,transparent);margin-top:18px}
.cv3 .st2-body{font-size:clamp(16px,1.8vw,21px);line-height:1.55;max-width:52ch;margin-top:20px;color:color-mix(in srgb,var(--ink) 84%,transparent)}
/* FLAGSHIP annotations */
.cv3 .st2-annos{display:flex;flex-wrap:wrap;gap:clamp(16px,3vw,44px);margin-top:24px}
.cv3 .st2-annos .a{border-left:2px solid var(--accent);padding-left:14px}
.cv3 .st2-annos .av{font-size:clamp(18px,2.2vw,30px);font-weight:800;letter-spacing:-.02em}
.cv3 .st2-annos .ak{font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);margin-top:5px}
/* PROJECT HORIZON — full-bleed image emerging, with the factual record over it */
.cv3 .st2-horizon{position:relative;min-height:100vh;display:flex;align-items:flex-end;padding:clamp(48px,10vh,110px) clamp(28px,6vw,90px) clamp(48px,10vh,110px) clamp(80px,10vw,150px);overflow:hidden}
.cv3 .st2-horizon-img{position:absolute;inset:0;z-index:0}
.cv3 .st2-horizon-img img{width:100%;height:100%;object-fit:cover;opacity:.66}
.cv3 .st2-horizon-img::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(15,14,12,.72) 0%,rgba(15,14,12,.28) 40%,rgba(15,14,12,.8) 100%)}
.cv3 .st2-horizon-x{position:absolute;inset:0;z-index:0;background:repeating-linear-gradient(180deg,color-mix(in srgb,var(--ink) 6%,transparent) 0 3px,transparent 3px 34px)}
.cv3 .st2-horizon-in{position:relative;z-index:2;width:100%;max-width:1080px}
.cv3 .st2-horizon-ix{font-family:var(--mono);font-size:clamp(12px,1.5vw,15px);letter-spacing:.2em;text-transform:uppercase;color:var(--accent)}
.cv3 .st2-horizon-name{font-size:clamp(36px,6vw,86px);font-weight:900;letter-spacing:-.035em;line-height:.98;color:#fff;margin-top:10px}
.cv3 .st2-horizon-meta{font-family:var(--mono);font-size:clamp(11px,1.3vw,14px);letter-spacing:.08em;color:#e6e2da;margin-top:14px}
.cv3 .st2-horizon-take{font-size:clamp(15px,1.7vw,20px);line-height:1.5;color:#f2ede2;max-width:50ch;margin-top:16px}
/* CAPITAL LAYER — figures embedded in a strata band, not cards */
.cv3 .st2-caplayer{border-top:1px solid var(--line2);border-bottom:1px solid var(--line2);margin-top:24px}
.cv3 .st2-caprow{display:grid;grid-template-columns:2.2em 1fr auto;gap:18px;align-items:baseline;padding:clamp(13px,2.2vh,22px) 0;border-bottom:1px solid var(--line2)}
.cv3 .st2-caprow:last-child{border-bottom:none}
.cv3 .st2-caprow .cn{font-family:var(--mono);font-size:11px;color:var(--dim)}
.cv3 .st2-caprow .ck{font-family:var(--mono);font-size:clamp(11px,1.3vw,14px);letter-spacing:.1em;text-transform:uppercase;color:color-mix(in srgb,var(--ink) 80%,transparent)}
.cv3 .st2-caprow .cv{font-size:clamp(22px,2.8vw,42px);font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums;text-align:right}
/* MILESTONES — markers embedded in the depth line */
.cv3 .st2-strata-time{position:relative;margin-top:30px;padding-left:34px}
.cv3 .st2-strata-time::before{content:"";position:absolute;left:5px;top:6px;bottom:6px;width:1px;background:var(--line2)}
.cv3 .st2-mile{position:relative;padding:clamp(12px,2.2vh,22px) 0}
.cv3 .st2-mile::before{content:"";position:absolute;left:-31px;top:calc(clamp(12px,2.2vh,22px) + 7px);width:9px;height:9px;border-radius:50%;background:var(--bg);border:2px solid var(--accent)}
.cv3 .st2-mile .mdate{font-family:var(--mono);font-size:12px;letter-spacing:.1em;color:var(--accent)}
.cv3 .st2-mile .mhead{font-size:clamp(18px,2.2vw,28px);font-weight:800;letter-spacing:-.02em;margin-top:5px}
.cv3 .st2-mile .mwhy{font-size:clamp(13px,1.4vw,16px);line-height:1.45;color:var(--dim);margin-top:6px;max-width:52ch}
/* CATALYST — lies deeper; emerges from below */
.cv3 .st2-cat{position:relative}
.cv3 .st2-cat .st2-cat-lead{font-family:var(--mono);font-size:clamp(11px,1.3vw,14px);letter-spacing:.2em;text-transform:uppercase;color:var(--dim)}
.cv3 .st2-cat .st2-cat-time{font-family:var(--mono);font-size:clamp(13px,1.6vw,18px);letter-spacing:.12em;color:var(--accent);margin-top:20px}
.cv3 .st2-cat .st2-cat-label{font-size:clamp(34px,5.4vw,84px);font-weight:900;letter-spacing:-.035em;line-height:1.02;margin-top:12px;max-width:20ch}
.cv3 .st2-cat .st2-cat-impact{font-size:clamp(16px,1.8vw,22px);line-height:1.5;color:color-mix(in srgb,var(--ink) 82%,transparent);max-width:44ch;margin-top:20px}
/* WHY — the payoff: earlier layers compress into the thesis */
.cv3 .st2-why{margin-top:12px}
.cv3 .st2-why-row{display:grid;grid-template-columns:auto 8em 1fr;gap:clamp(14px,2.5vw,36px);align-items:baseline;padding:clamp(16px,2.8vh,30px) 0;border-top:1px solid var(--line2)}
@media(max-width:760px){.cv3 .st2-why-row{grid-template-columns:auto 1fr}.cv3 .st2-why-row .wd{grid-column:2}}
.cv3 .st2-why-row .wn{font-family:var(--mono);font-size:12px;color:var(--accent)}
.cv3 .st2-why-row .wl{font-family:var(--mono);font-size:clamp(12px,1.5vw,17px);letter-spacing:.1em;text-transform:uppercase;color:var(--accent);font-weight:600}
.cv3 .st2-why-row .wd{font-size:clamp(18px,2.2vw,30px);font-weight:700;letter-spacing:-.02em;line-height:1.3}
/* CTA — reached the core */
.cv3 .st2-core{min-height:100vh;text-align:center;align-items:center}
.cv3 .st2-core-mk{font-family:var(--mono);font-size:11px;letter-spacing:.34em;text-transform:uppercase;color:var(--accent)}
.cv3 .st2-core-name{font-size:clamp(40px,7vw,116px);font-weight:900;letter-spacing:-.04em;line-height:.9;margin-top:18px}
.cv3 .st2-core-list{display:flex;flex-wrap:wrap;gap:10px 24px;justify-content:center;margin:24px 0}
.cv3 .st2-core-list span{font-family:var(--mono);font-size:clamp(11px,1.3vw,13px);letter-spacing:.12em;text-transform:uppercase;color:var(--dim)}
.cv3 .st2-core-go{display:inline-flex;align-items:center;gap:10px;font-family:var(--mono);font-size:clamp(13px,1.5vw,16px);letter-spacing:.1em;text-transform:uppercase;color:var(--accent);border:1px solid var(--accent);border-radius:999px;padding:14px 26px;margin-top:6px}
@media (prefers-reduced-motion:reduce){.cv3 .st2-em{opacity:1!important;transform:none!important;filter:none!important}.cv3 .st2-icept{opacity:1!important}}
/* ── STRATA choreography: a persistent parallax geological WORLD behind everything (we never leave it)
   + scroll-scrubbed SIGNATURE MOMENTS (lock · trace · excavation · break · close). --gp = global descent
   0→1; --p = per-pinned-chapter progress. Quiet chapters keep the calm .st2-em emergence. ── */
.cv3 .st2>*{position:relative;z-index:1}
.cv3 .st2-world{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden}
.cv3 .st2-world .wl{position:absolute;left:0;right:0;top:-40vh;height:220vh;will-change:transform}
.cv3 .st2-world .wl.far{transform:translateY(calc(var(--gp,0)*-70vh));background:repeating-linear-gradient(180deg,transparent 0 84px,color-mix(in srgb,var(--ink) 4%,transparent) 84px 86px,transparent 86px 230px)}
.cv3 .st2-world .wl.mid{transform:translateY(calc(var(--gp,0)*-150vh));background:repeating-linear-gradient(180deg,transparent 0 150px,color-mix(in srgb,var(--ink) 6%,transparent) 150px 152px,transparent 152px 420px)}
.cv3 .st2-world .wl.near{transform:translateY(calc(var(--gp,0)*-300vh));background:repeating-linear-gradient(180deg,transparent 0 260px,color-mix(in srgb,var(--accent) 5%,transparent) 260px 262px,transparent 262px 900px)}
.cv3 .st2-world .wcore{position:absolute;left:50%;top:0;bottom:0;width:1px;background:linear-gradient(180deg,transparent,color-mix(in srgb,var(--accent) 14%,transparent) 40%,transparent);opacity:.5}
.cv3 .st2-world::after{content:"";position:absolute;inset:0;background:radial-gradient(120% 60% at 50% 0%,transparent 40%,color-mix(in srgb,#000 30%,transparent))}
/* pinned-scrub infrastructure */
.cv3 .st2-pin{position:relative}
.cv3 .st2-pin .st2-stage{position:sticky;top:0;height:100vh;overflow:hidden;display:flex;flex-direction:column;justify-content:center;padding:clamp(48px,10vh,120px) clamp(28px,6vw,90px) clamp(48px,10vh,120px) clamp(80px,10vw,150px)}
/* RESOURCE LOCK — the figure exists fragmented across layers, then snaps into place at the right depth */
.cv3 .st2-lockwrap{position:relative;display:inline-block}
.cv3 .st2-lock{position:relative;display:inline-block;font-size:clamp(54px,11vw,186px);font-weight:900;letter-spacing:-.05em;line-height:.86;font-variant-numeric:tabular-nums}
.cv3 .st2-lock .ghost{visibility:hidden}
.cv3 .st2-lock .sl{position:absolute;left:0;top:0;width:100%;color:var(--ink)}
.cv3 .st2-lock .s0{clip-path:inset(0 0 67% 0);transform:translateX(calc((1 - clamp(0,calc(var(--p,0)/.5),1))*22%));filter:blur(calc((1 - clamp(0,calc(var(--p,0)/.5),1))*3px))}
.cv3 .st2-lock .s1{clip-path:inset(34% 0 33% 0);transform:translateX(calc((1 - clamp(0,calc(var(--p,0)/.5),1))*-28%))}
.cv3 .st2-lock .s2{clip-path:inset(67% 0 0 0);transform:translateX(calc((1 - clamp(0,calc(var(--p,0)/.5),1))*18%));filter:blur(calc((1 - clamp(0,calc(var(--p,0)/.5),1))*3px))}
.cv3 .st2-lock-seam{position:absolute;left:-4%;right:-4%;top:50%;height:2px;background:var(--accent);opacity:calc(clamp(0,calc((var(--p,0) - .4)/.12),1) * (1 - clamp(0,calc((var(--p,0) - .6)/.2),1)));box-shadow:0 0 22px 1px var(--accent)}
.cv3 .st2-lock-sub{opacity:clamp(0,calc((var(--p,0) - .58)/.18),1);transform:translateY(calc((1 - clamp(0,calc((var(--p,0) - .58)/.18),1))*16px))}
/* ASSAY TRACE — a measurement line crosses, finds the interval, the result locks on (abstract, non-spatial) */
.cv3 .st2-trace{position:relative;max-width:760px;margin-top:8px}
.cv3 .st2-trace .tl{position:relative;height:3px;background:var(--line2);margin-top:20px}
.cv3 .st2-trace .tprog{position:absolute;left:0;top:0;height:3px;background:var(--accent);width:calc(clamp(0,calc(var(--p,0)/.4),1)*100%);box-shadow:0 0 14px -1px var(--accent)}
.cv3 .st2-trace .tint{position:absolute;left:36%;width:26%;top:-7px;height:17px;border-radius:3px;background:var(--accent);opacity:calc(clamp(0,calc((var(--p,0) - .34)/.12),1)*.9)}
.cv3 .st2-trace .tscale{display:flex;justify-content:space-between;margin-top:9px;font-family:var(--mono);font-size:11px;color:var(--dim)}
.cv3 .st2-trace-m{font-family:var(--mono);font-size:clamp(14px,1.8vw,20px);letter-spacing:.06em;color:var(--ink);margin-top:26px;opacity:clamp(0,calc((var(--p,0) - .4)/.12),1)}
.cv3 .st2-trace-g{font-size:clamp(50px,10vw,168px);font-weight:900;letter-spacing:-.05em;line-height:.86;color:var(--accent);font-variant-numeric:tabular-nums;margin-top:8px;opacity:clamp(0,calc((var(--p,0) - .5)/.14),1);transform:translateY(calc((1 - clamp(0,calc((var(--p,0) - .5)/.14),1))*26px))}
.cv3 .st2-trace-sub{opacity:clamp(0,calc((var(--p,0) - .66)/.16),1);margin-top:16px}
.cv3 .st2-trace-note{font-family:var(--mono);font-size:10.5px;letter-spacing:.04em;color:var(--dim);margin-top:22px;max-width:60ch;line-height:1.6;opacity:clamp(0,calc((var(--p,0) - .7)/.2),1)}
/* IMAGE EXCAVATION — strata masks part from the centre to expose a real photograph */
.cv3 .st2-exc .st2-stage{justify-content:flex-end;padding-left:clamp(80px,10vw,150px)}
.cv3 .st2-exc-photo{position:absolute;inset:0;z-index:0}
.cv3 .st2-exc-photo img{width:100%;height:100%;object-fit:cover;transform:scale(calc(1.08 - clamp(0,calc(var(--p,0)/.6),1)*.06))}
.cv3 .st2-exc-photo::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(12,11,10,.6),rgba(12,11,10,.2) 42%,rgba(12,11,10,.82))}
.cv3 .st2-exc-tex{position:absolute;inset:0;z-index:1;background:repeating-linear-gradient(180deg,color-mix(in srgb,var(--ink) 7%,transparent) 0 2px,transparent 2px 38px);opacity:.5}
.cv3 .st2-exc-mask{position:absolute;left:0;right:0;z-index:2;background:linear-gradient(var(--md,180deg),var(--bg),color-mix(in srgb,var(--bg) 82%,#000))}
.cv3 .st2-exc-mask.top{top:0;height:51%;transform:translateY(calc(clamp(0,calc(var(--p,0)/.55),1)*-101%))}
.cv3 .st2-exc-mask.bot{bottom:0;height:51%;transform:translateY(calc(clamp(0,calc(var(--p,0)/.55),1)*101%))}
.cv3 .st2-exc-seam{position:absolute;left:0;right:0;top:50%;height:1px;background:var(--accent);z-index:3;opacity:calc(1 - clamp(0,calc(var(--p,0)/.5),1))}
.cv3 .st2-exc-in{position:relative;z-index:4;width:100%;max-width:1080px;opacity:clamp(0,calc((var(--p,0) - .3)/.2),1);transform:translateY(calc((1 - clamp(0,calc((var(--p,0) - .3)/.2),1))*22px))}
/* CATALYST BREAK — the established strata end; the next milestone emerges from dark space below */
.cv3 .st2-break .st2-stage{justify-content:flex-start}
.cv3 .st2-break-strata{position:absolute;left:0;right:0;top:0;height:46vh;z-index:0;background:repeating-linear-gradient(180deg,color-mix(in srgb,var(--ink) 9%,transparent) 0 2px,transparent 2px 30px);transform:translateY(calc(clamp(0,calc(var(--p,0)/.4),1)*-46vh));opacity:calc(1 - clamp(0,calc((var(--p,0) - .2)/.3),1))}
.cv3 .st2-break-edge{position:absolute;left:0;right:0;top:46vh;height:1px;background:var(--accent);z-index:1;opacity:calc((1 - clamp(0,calc((var(--p,0) - .1)/.3),1)));box-shadow:0 0 30px 2px var(--accent);transform:translateY(calc(clamp(0,calc(var(--p,0)/.4),1)*-46vh))}
.cv3 .st2-break-void{position:absolute;inset:0;z-index:0;background:radial-gradient(120% 80% at 50% 120%,color-mix(in srgb,#000 55%,transparent),transparent 60%)}
.cv3 .st2-break-in{position:relative;z-index:2;width:100%;max-width:1080px;margin-top:auto;margin-bottom:8vh;transform:translateY(calc((1 - clamp(0,calc((var(--p,0) - .3)/.45),1))*46vh));opacity:clamp(.06,calc((var(--p,0) - .18)/.4),1)}
/* CORE CLOSE — accumulated layers compress inward; the core opens onto the identity */
.cv3 .st2-close .st2-stage{align-items:center;text-align:center}
.cv3 .st2-close-lyr{position:absolute;left:0;right:0;z-index:2;height:52vh;background:repeating-linear-gradient(180deg,color-mix(in srgb,var(--ink) 12%,transparent) 0 3px,color-mix(in srgb,#000 24%,transparent) 3px 26px)}
.cv3 .st2-close-lyr.top{top:0;transform:translateY(calc((1 - clamp(0,calc(var(--p,0)/.5),1))*-54vh))}
.cv3 .st2-close-lyr.bot{bottom:0;transform:translateY(calc((1 - clamp(0,calc(var(--p,0)/.5),1))*54vh))}
.cv3 .st2-core-ap{position:absolute;left:50%;top:50%;width:min(46vh,420px);height:min(46vh,420px);border-radius:50%;border:1px solid var(--accent);transform:translate(-50%,-50%) scale(calc(.2 + clamp(0,calc((var(--p,0) - .45)/.4),1)*1.1));opacity:calc(clamp(0,calc((var(--p,0) - .45)/.2),1)*.5);z-index:3}
.cv3 .st2-core-in{position:relative;z-index:4;opacity:clamp(0,calc((var(--p,0) - .56)/.22),1);transform:translateY(calc((1 - clamp(0,calc((var(--p,0) - .56)/.22),1))*18px))}
@media (prefers-reduced-motion:reduce){
  .cv3 .st2-world .wl{transform:none!important}
  .cv3 .st2-lock .sl{transform:none!important;filter:none!important}.cv3 .st2-lock-sub,.cv3 .st2-trace-m,.cv3 .st2-trace-g,.cv3 .st2-trace-sub,.cv3 .st2-trace-note,.cv3 .st2-exc-in,.cv3 .st2-break-in,.cv3 .st2-core-in{opacity:1!important;transform:none!important}
  .cv3 .st2-trace .tprog{width:100%!important}.cv3 .st2-exc-mask.top,.cv3 .st2-exc-mask.bot,.cv3 .st2-break-strata,.cv3 .st2-close-lyr{transform:translateY(-120%)!important}
}
/* ══ 15 · BLUEPRINT — engineering drafting sheet (title block · dimension lines · self-drawing schematics) ══ */
.cv3 .bp-sheet{max-width:1200px;margin:0 auto;padding:clamp(28px,4vw,56px) clamp(24px,4vw,56px) clamp(60px,9vh,110px);background:repeating-linear-gradient(0deg,transparent 0 39px,var(--line2) 39px 40px),repeating-linear-gradient(90deg,transparent 0 39px,var(--line2) 39px 40px)}
.cv3 .bp-tb{display:grid;grid-template-columns:1fr auto;border:1px solid var(--ink);margin-bottom:36px}
.cv3 .bp-tb>div{padding:14px 18px;border-right:1px solid var(--ink)}
.cv3 .bp-tb>div:last-child{border-right:none;text-align:right}
.cv3 .bp-tb .t{font-family:var(--mono);font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim)}
.cv3 .bp-tb .b{font-family:var(--mono);font-size:clamp(15px,2.2vw,26px);font-weight:600;margin-top:5px;color:var(--ink)}
.cv3 .bp-sec{margin:40px 0;position:relative}
.cv3 .bp-sn{font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);margin-bottom:22px;display:flex;align-items:center;gap:12px}
.cv3 .bp-sn::after{content:"";flex:1;height:1px;background:var(--line)}
.cv3 .bp-draw svg{width:100%;height:auto;display:block;font-family:var(--mono);overflow:visible;clip-path:inset(0 100% 0 0);transition:clip-path 1.5s cubic-bezier(.65,0,.35,1)}
.cv3 .bp-draw.on svg{clip-path:inset(0 0 0 0)}
.cv3 .bp-draw .ln{stroke:var(--accent);stroke-width:1.6;fill:none}
.cv3 .bp-draw .ln2{stroke:var(--ink);stroke-width:1.2;fill:none}
.cv3 .bp-draw .dim{stroke:var(--dim);stroke-width:1;fill:none;opacity:0;transition:opacity .5s ease .9s}
.cv3 .bp-draw.on .dim{opacity:1}
.cv3 .bp-draw text{fill:var(--dim);font-size:11px;opacity:0;transition:opacity .5s ease .9s}
.cv3 .bp-draw.on text{opacity:1}
.cv3 .bp-draw text.dt{fill:var(--accent);font-weight:600}
.cv3 .bp-sched{width:100%;border-collapse:collapse;font-family:var(--mono);font-size:13px}
.cv3 .bp-sched th{text-align:right;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);font-weight:500;padding:0 0 10px 20px;border-bottom:1px solid var(--ink)}
.cv3 .bp-sched th:first-child{text-align:left}
.cv3 .bp-sched td{text-align:right;padding:11px 0 11px 20px;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums}
.cv3 .bp-sched td:first-child{text-align:left;color:var(--ink)}
.cv3 .bp-sched td.n{color:var(--accent);font-weight:600}
.cv3 .bp-sched tr.rev td{color:var(--accent)}
/* ══ 20 · ARCHIVE — research archive (paper · folders · stamps · corner-mounted photos · scattered) ══ */
.cv3 .arc{background:color-mix(in srgb,var(--ink) 5%,var(--bg))}
.cv3 .arc-wrap{max-width:1120px;margin:0 auto;padding:clamp(60px,9vh,120px) clamp(20px,5vw,56px)}
.cv3 .arc-folder{border-top:3px solid var(--accent);background:var(--bg);padding:clamp(28px,4vw,54px);position:relative;box-shadow:0 30px 70px -34px rgba(0,0,0,.5);margin-bottom:clamp(30px,5vh,60px)}
.cv3 .arc-tab{position:absolute;top:-3px;left:40px;transform:translateY(-100%);background:var(--accent);color:var(--bg);font-family:var(--mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;padding:8px 16px;font-weight:600}
.cv3 .arc-k{font-family:var(--mono);font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim)}
.cv3 .arc-h{font-family:var(--serif);font-weight:500;font-size:clamp(32px,5vw,64px);line-height:1.02;letter-spacing:-.01em;margin:12px 0 0}
.cv3 .arc-type{font-family:var(--mono);font-size:14px;line-height:1.75;color:var(--ink);margin-top:20px;max-width:62ch}
.cv3 .arc-sec{margin:clamp(34px,5vh,64px) 0}
.cv3 .arc-lbl{font-family:var(--mono);font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);margin-bottom:20px;border-bottom:1px solid var(--line);padding-bottom:10px}
.cv3 .arc-scatter{display:flex;flex-wrap:wrap;gap:clamp(16px,2.4vw,34px);align-items:flex-start}
.cv3 .arc-card{background:var(--bg);border:1px solid var(--line);padding:20px 22px;flex:1 1 300px;position:relative;box-shadow:0 18px 34px -24px rgba(0,0,0,.55)}
.cv3 .arc-card:nth-child(3n+2){transform:rotate(-1.1deg)}.cv3 .arc-card:nth-child(3n){transform:rotate(.9deg)}
.cv3 .arc-card .ct{font-family:var(--mono);font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);border-bottom:1px solid var(--line);padding-bottom:10px;margin-bottom:12px;display:flex;justify-content:space-between}
.cv3 .arc-card .cn{font-family:var(--serif);font-size:22px;font-weight:500}
.cv3 .arc-card .cm{font-family:var(--mono);font-size:11px;color:var(--dim);margin-top:8px;line-height:1.8}
.cv3 .arc-card .cm b{color:var(--ink)}
.cv3 .arc-photo{background:var(--bg);border:1px solid var(--line);padding:12px 12px 38px;flex:0 1 250px;transform:rotate(-2deg);box-shadow:0 18px 34px -20px rgba(0,0,0,.55);position:relative}
.cv3 .arc-photo img{width:100%;display:block;filter:sepia(.12) contrast(1.02)}
.cv3 .arc-photo .cap{position:absolute;bottom:12px;left:14px;font-family:var(--mono);font-size:10px;color:var(--dim)}
.cv3 .arc-mount{position:absolute;width:20px;height:20px;border:1px solid var(--faint);opacity:.45}
.cv3 .arc-stamp{display:inline-block;border:2px solid var(--accent);color:var(--accent);font-family:var(--mono);font-size:12px;letter-spacing:.12em;text-transform:uppercase;padding:8px 14px;font-weight:700;opacity:0;transform:rotate(-7deg) scale(1.5);transition:transform .32s cubic-bezier(.2,1.5,.4,1),opacity .32s}
.cv3 .arc-rec.on .arc-stamp{opacity:.9;transform:rotate(-7deg) scale(1)}
.cv3 .arc-recrow{display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:baseline;padding:11px 0;border-bottom:1px solid var(--line);font-family:var(--mono);font-size:13px}
.cv3 .arc-recrow .h{color:var(--dim);font-size:11px}.cv3 .arc-recrow .g{color:var(--accent);font-weight:600;text-align:right}
.cv3 .arc-ledger .lr{display:flex;justify-content:space-between;padding:11px 0;border-bottom:1px dashed var(--line);font-family:var(--mono);font-size:13px}
.cv3 .arc-ledger .lr .k{color:var(--dim);text-transform:uppercase;font-size:10.5px;letter-spacing:.06em}
.cv3 .arc-ledger .lr .v{color:var(--ink);font-weight:600}
.cv3 .arc-idx{display:flex;flex-wrap:wrap;gap:14px}
.cv3 .arc-idx .ic{background:var(--bg);border:1px solid var(--line);padding:14px 18px;flex:1 1 190px;transform:rotate(-.6deg)}
.cv3 .arc-idx .ic:nth-child(2n){transform:rotate(1deg)}
.cv3 .arc-idx .ic .nm{font-family:var(--serif);font-size:18px}
.cv3 .arc-idx .ic .rl{font-family:var(--mono);font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--dim);margin-top:6px}
/* ══ Template 10 · ORBIT (rebuild) — INFORMATION HAS GRAVITY. Deep slate ground, platinum ink; LUMINANCE
   communicates mass (bright = high relevance, dim = peripheral). A globe opens with the company's TRUTHFUL
   jurisdiction, then RELEASES into a persistent gravitational FIELD: the company's real facts (imagery,
   numbers, projects, capital, catalyst) gain/lose mass and migrate, finally CONVERGING into the thesis.
   Orbit = gravitational/relational/convergent — never Atlas's cartography. Namespace: orbit / og. ══ */
.cv3 .orbit{--bg:#0a0d13;--bg2:#111722;--ink:#e7ebf4;--hi:#ffffff;--dim:#6f7a90;--faint:#333c49;--line:rgba(231,235,244,.09);--line2:rgba(231,235,244,.18);--glow:158,186,255;--accent:#a7bce8;
  position:relative;height:100vh;overflow-y:auto;overflow-x:hidden;scroll-snap-type:y proximity;-webkit-overflow-scrolling:touch;scrollbar-width:none;background:radial-gradient(130% 100% at 50% 22%,#10161f 0%,#0a0d13 68%);color:var(--ink);font-family:var(--font)}
.cv3 .orbit::-webkit-scrollbar{display:none}
.cv3 .orbit-field{position:fixed;inset:0;z-index:1;pointer-events:none;overflow:hidden}
.cv3 .orbit-globe{position:absolute;inset:0;width:100%;height:100%;display:block}
.cv3 .orbit-sec{min-height:100vh;scroll-snap-align:start;position:relative;z-index:0}
/* geographic resolve labels (appear only while the globe holds the jurisdiction) */
.cv3 .og-geo{position:absolute;left:50%;top:50%;transform:translate(-50%,calc(-50% - 2vh));text-align:center;z-index:3;opacity:0;transition:opacity .8s ease;width:max-content;max-width:80vw}
.cv3 .orbit[data-stid="place"] .og-geo{opacity:1}
.cv3 .og-geo .ctry{font-family:var(--mono);font-size:12px;letter-spacing:.26em;text-transform:uppercase;color:var(--dim)}
.cv3 .og-geo .reg{font-size:clamp(44px,7vw,104px);font-weight:800;letter-spacing:-.035em;line-height:.96;margin-top:12px;text-shadow:0 0 46px rgba(var(--glow),.45)}
.cv3 .og-geo .note{font-family:var(--mono);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--faint);margin-top:16px}
/* a MASS — a real company fact whose position, scale and luminance are gravity */
.cv3 .og-mass{position:absolute;left:50%;top:50%;will-change:transform,opacity;transition:transform 1.05s cubic-bezier(.32,.86,.3,1),opacity .9s ease;text-align:center;max-width:min(42vw,520px)}
.cv3 .og-mass .ml{font-family:var(--mono);font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim)}
.cv3 .og-mass .mv{font-weight:800;letter-spacing:-.03em;line-height:.92;color:var(--ink)}
.cv3 .og-mass.num .mv{font-size:clamp(38px,6.6vw,118px);font-variant-numeric:tabular-nums;margin-top:8px}
.cv3 .og-mass.num .mv .u{font-size:.27em;color:var(--accent);margin-left:.06em;font-weight:700}
.cv3 .og-mass.text .mv{font-size:clamp(24px,3.8vw,58px);margin-top:8px}
.cv3 .og-mass.proj .mv{font-size:clamp(17px,2.3vw,29px);margin-top:6px}
.cv3 .og-mass.ident .mv{font-size:clamp(42px,7vw,124px)}
.cv3 .og-mass .ms{font-family:var(--mono);font-size:11px;letter-spacing:.06em;color:var(--dim);margin-top:10px;text-transform:uppercase}
.cv3 .og-mass.hi .mv{color:var(--hi);text-shadow:0 0 54px rgba(var(--glow),.5)}
.cv3 .og-mass.hi .ml,.cv3 .og-mass.hi .ms{color:var(--accent)}
.cv3 .og-mass.img{width:min(44vmin,480px);max-width:44vw;aspect-ratio:4/5}
.cv3 .og-mass.img .frame{position:relative;width:100%;height:100%;overflow:hidden}
.cv3 .og-mass.img img{width:100%;height:100%;object-fit:cover;display:block;filter:saturate(.92) brightness(.92)}
.cv3 .og-mass.img.hi img{filter:saturate(1) brightness(1)}
.cv3 .og-mass.img .mcap{position:absolute;left:14px;bottom:12px;font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#fff;text-shadow:0 1px 8px rgba(0,0,0,.7)}
/* project selection (interactive, only where multiple assets) */
.cv3 .og-mass.proj.pick{cursor:pointer;pointer-events:auto}
.cv3 .og-mass.proj.pick.on .mv{color:var(--hi);text-shadow:0 0 40px rgba(var(--glow),.5)}
/* convergence — the thesis at the centre of gravity */
.cv3 .og-thesis{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(.92);opacity:0;transition:transform 1.1s cubic-bezier(.32,.86,.3,1),opacity .9s ease;max-width:min(26ch,60vw);text-align:center;z-index:4}
.cv3 .orbit[data-stid="converge"] .og-thesis,.cv3 .orbit[data-stid="follow"] .og-thesis{opacity:1;transform:translate(-50%,-50%) scale(1)}
.cv3 .og-thesis .tk{font-family:var(--mono);font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--accent)}
.cv3 .og-thesis .tt{font-size:clamp(22px,3.1vw,42px);font-weight:800;letter-spacing:-.02em;line-height:1.16;margin-top:14px;text-shadow:0 0 54px rgba(var(--glow),.42)}
/* CTA — the field resolves to a single point */
.cv3 .og-cta{position:absolute;left:50%;top:72%;transform:translate(-50%,-50%);text-align:center;z-index:5;opacity:0;transition:opacity .8s ease .2s}
.cv3 .orbit[data-stid="follow"] .og-cta{opacity:1}
.cv3 .og-cta .feat{font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);margin-bottom:18px}
.cv3 .og-cta .go{display:inline-flex;align-items:center;gap:10px;font-family:var(--mono);font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:var(--bg);background:var(--ink);border-radius:999px;padding:15px 30px;box-shadow:0 0 44px -8px rgba(var(--glow),.7);pointer-events:auto}
.cv3 .og-hint{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);z-index:6;font-family:var(--mono);font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--faint);pointer-events:none;transition:opacity .5s}
.cv3 .orbit[data-stid="follow"] ~ * .og-hint,.cv3 .orbit[data-stid="converge"] .og-hint{opacity:0}
@media(prefers-reduced-motion:reduce){.cv3 .og-mass,.cv3 .og-thesis{transition:opacity .5s ease!important}}
/* ══ 05 · KEYNOTE (V4) — world-class product presentation: horizontal stages · clean · diagrams assemble ══ */
.cv3:has(.kys){overflow:hidden}
.cv3 .kys{height:100vh;display:flex;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none}
.cv3 .kys::-webkit-scrollbar{display:none}
.cv3 .kys::-webkit-scrollbar{height:0;display:none}
.cv3 .kys-stage{flex:0 0 100vw;height:100%;scroll-snap-align:center;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:clamp(40px,8vh,110px) clamp(30px,10vw,190px);position:relative}
.cv3 .kys-k{font-family:var(--mono);font-size:12px;letter-spacing:.26em;text-transform:uppercase;color:var(--accent);opacity:0;transform:translateY(16px);transition:.7s}
.cv3 .kys-stage.on .kys-k{opacity:1;transform:none}
.cv3 .kys-h{font-size:clamp(38px,7vw,108px);font-weight:800;letter-spacing:-.04em;line-height:.95;margin:20px 0 0;text-wrap:balance;font-variant-numeric:tabular-nums;opacity:0;transform:translateY(24px) scale(.97);transition:opacity .8s ease .12s,transform .8s cubic-bezier(.22,1,.36,1) .12s}
.cv3 .kys-stage.on .kys-h{opacity:1;transform:none}
.cv3 .kys-h .unit{font-size:.24em;color:var(--dim);font-weight:700}
.cv3 .kys-sub{font-size:clamp(16px,2vw,23px);color:var(--dim);margin-top:22px;max-width:42ch;opacity:0;transition:opacity .8s ease .32s}
.cv3 .kys-stage.on .kys-sub{opacity:1}
.cv3 .kys-diag{display:flex;gap:clamp(10px,2vw,22px);align-items:flex-end;justify-content:center;margin-top:44px;height:min(30vh,230px)}
.cv3 .kys-diag .db{width:clamp(38px,7vw,84px);display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%}
.cv3 .kys-diag .db i{width:100%;background:var(--accent);border-radius:5px 5px 0 0;height:0;transition:height 1s cubic-bezier(.22,1,.36,1) .3s}
.cv3 .kys-stage.on .kys-diag .db i{height:var(--h)}
.cv3 .kys-diag .db .v{font-family:var(--mono);font-size:12px;color:var(--accent);margin-bottom:9px;font-weight:600}
.cv3 .kys-diag .db .l{font-family:var(--mono);font-size:10px;color:var(--dim);margin-top:11px;text-transform:uppercase;letter-spacing:.05em}
.cv3 .kys-facts{display:flex;gap:clamp(20px,4vw,60px);margin-top:36px;flex-wrap:wrap;justify-content:center}
.cv3 .kys-facts .f{opacity:0;transform:translateY(18px);transition:opacity .7s ease,transform .7s cubic-bezier(.22,1,.36,1)}
.cv3 .kys-stage.on .kys-facts .f{opacity:1;transform:none}
.cv3 .kys-facts .f .fv{font-size:clamp(24px,3vw,44px);font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.cv3 .kys-facts .f .fl{font-family:var(--mono);font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--dim);margin-top:8px}
.cv3 .kys-hint{position:fixed;right:24px;bottom:22px;z-index:5;font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim)}
.cv3 .kys-nav{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:5;display:flex;gap:7px}
.cv3 .kys-nav i{width:7px;height:7px;border-radius:50%;background:var(--line);transition:.3s;cursor:pointer}
.cv3 .kys-nav i.on{background:var(--accent);width:20px;border-radius:4px}
/* ══ 05 · KEYNOTE V6 — editorial horizontal presentation. Native blue/cream palette + lateral
   choreography (--c signed centre-offset, --a abs) so the composition transforms sideways as you
   scroll. Precise grid; imagery participates in the motion. Scoped to .kys. ══ */
.cv3 .kys{--bg:#efe9db;--ink:#19223a;--dim:#6a7089;--line:#dbd5c5;--line2:#e2dccd;--chip:#e7e1d2;--accent:#2f56c9;--accent2:#6183e6;background:var(--bg);color:var(--ink)}
.cv3[data-variant="obsidian"] .kys,.cv3[data-variant="cellar"] .kys{--bg:#121a2f;--ink:#eef1f8;--dim:#8892ae;--line:#283049;--line2:#212942;--chip:#1b2339;--accent:#6a8bec;--accent2:#98b1f4}
.cv3[data-variant="graphite"] .kys,.cv3[data-variant="porcelain"] .kys{--bg:#e8e3d4;--ink:#1c2740}
.cv3 .kys-in{position:relative;width:100%;max-width:1220px;margin:0 auto;padding:0 clamp(28px,6vw,96px)}
.cv3 .kys-stage2{flex:0 0 100vw;height:100%;scroll-snap-align:center;display:flex;flex-direction:column;justify-content:center;position:relative;overflow:hidden}
.cv3 .kys-eyebrow{font-family:var(--mono);font-size:clamp(11px,1.2vw,14px);letter-spacing:.24em;text-transform:uppercase;color:var(--accent)}
.cv3 .kys-title{font-size:clamp(40px,7vw,120px);font-weight:800;letter-spacing:-.04em;line-height:.94;text-wrap:balance;font-variant-numeric:tabular-nums}
.cv3 .kys-lead{font-size:clamp(17px,2vw,26px);line-height:1.4;color:color-mix(in srgb,var(--ink) 82%,transparent);max-width:46ch}
.cv3 .kys-meta{font-family:var(--mono);font-size:clamp(11px,1.3vw,14px);letter-spacing:.08em;text-transform:uppercase;color:var(--dim)}
/* lateral choreography primitives */
.cv3 .kys-lat{transform:translateX(calc(var(--c,0)*38px));will-change:transform}
.cv3 .kys-lat.d2{transform:translateX(calc(var(--c,0)*66px))}
.cv3 .kys-lat.d3{transform:translateX(calc(var(--c,0)*96px))}
.cv3 .kys-lat.rev{transform:translateX(calc(var(--c,0)*-54px))}
/* image column — cross-slides opposite to the type for depth without 3D */
.cv3 .kys-imgcol{position:relative;height:min(74vh,660px);overflow:hidden;background:var(--chip)}
.cv3 .kys-imgcol img{position:absolute;inset:-4%;width:108%;height:108%;object-fit:cover;transform:translateX(calc(var(--c,0)*-46px))}
.cv3 .kys-imgcol .cap{position:absolute;left:14px;bottom:12px;font-family:var(--mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#fff;background:rgba(15,18,30,.5);padding:5px 9px;backdrop-filter:blur(3px)}
/* two-column editorial split (image + info) */
.cv3 .kys-two{display:grid;grid-template-columns:1fr 1fr;gap:clamp(28px,5vw,80px);align-items:center}
.cv3 .kys-two.img65{grid-template-columns:1.55fr 1fr}
.cv3 .kys-two.img65r{grid-template-columns:1fr 1.55fr}
@media(max-width:820px){.cv3 .kys-two,.cv3 .kys-two.img65,.cv3 .kys-two.img65r{grid-template-columns:1fr;gap:24px}.cv3 .kys-imgcol{height:44vh}}
/* RESULT SPLIT — two facts arrive from opposite edges and lock on the centre axis */
.cv3 .kys-split{display:flex;align-items:baseline;justify-content:center;gap:clamp(10px,1.6vw,26px);flex-wrap:nowrap}
.cv3 .kys-split .sp{font-size:clamp(40px,8.4vw,150px);font-weight:800;letter-spacing:-.045em;line-height:.9;font-variant-numeric:tabular-nums;white-space:nowrap}
.cv3 .kys-split .sp.l{transform:translateX(calc(var(--c,0)*-44vw))}
.cv3 .kys-split .sp.r{transform:translateX(calc(var(--c,0)*44vw));color:var(--accent)}
.cv3 .kys-split-x{width:1px;height:clamp(50px,9vw,120px);background:var(--line2);align-self:center}
/* RESOURCE COMPOSE — the number assembles from opposite directions beside a photo */
.cv3 .kys-num{font-size:clamp(64px,13vw,230px);font-weight:800;letter-spacing:-.05em;line-height:.84;font-variant-numeric:tabular-nums}
.cv3 .kys-num .u{display:block;font-size:.22em;font-weight:700;letter-spacing:.02em;color:var(--accent);transform:translateX(calc(var(--c,0)*70px));margin-top:.08em}
/* CAPITAL — a horizontally assembling editorial spread (no cards, no bars) */
.cv3 .kys-spread{display:grid;grid-template-columns:repeat(3,1fr);gap:clamp(22px,3vh,44px) clamp(30px,5vw,90px);border-top:2px solid var(--ink);padding-top:clamp(22px,3vh,40px)}
@media(max-width:760px){.cv3 .kys-spread{grid-template-columns:repeat(2,1fr)}}
.cv3 .kys-spread .e .ev{font-size:clamp(28px,4.2vw,60px);font-weight:800;letter-spacing:-.03em;font-variant-numeric:tabular-nums;line-height:.95}
.cv3 .kys-spread .e .ek{font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);margin-top:10px}
/* MILESTONES — a horizontal historical rail that travels with the scroll */
.cv3 .kys-rail{position:relative;margin-top:clamp(30px,6vh,64px);padding-top:34px;overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 3%,#000 85%,transparent);mask-image:linear-gradient(90deg,transparent,#000 3%,#000 85%,transparent)}
.cv3 .kys-rail::before{content:"";position:absolute;left:0;right:0;top:6px;height:2px;background:var(--line2)}
.cv3 .kys-rail-row{display:flex;gap:clamp(26px,4vw,64px);transform:translateX(var(--tx,0px));will-change:transform}
.cv3 .kys-rail .mi{position:relative;flex:0 0 auto;width:min(66vw,290px)}
.cv3 .kys-rail-count{margin-top:clamp(18px,3vh,30px);font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim)}
.cv3 .kys-rail .mi::before{content:"";position:absolute;left:0;top:-34px;width:11px;height:11px;border-radius:50%;background:var(--bg);border:2px solid var(--accent)}
.cv3 .kys-rail .mi .d{font-family:var(--mono);font-size:12px;letter-spacing:.1em;color:var(--accent)}
.cv3 .kys-rail .mi .h{font-size:clamp(17px,1.9vw,24px);font-weight:800;letter-spacing:-.02em;margin-top:7px;line-height:1.15}
.cv3 .kys-rail .mi .w{font-size:clamp(12px,1.3vw,15px);line-height:1.4;color:var(--dim);margin-top:7px;max-width:34ch}
/* WHY — facts converge, then reasons lock in a grid */
.cv3 .kys-why{display:grid;grid-template-columns:auto 1fr;gap:clamp(14px,2vw,32px) clamp(18px,3vw,46px);align-items:baseline;margin-top:clamp(20px,3vh,36px)}
.cv3 .kys-why .rn{font-family:var(--mono);font-size:clamp(12px,1.4vw,16px);color:var(--accent);font-weight:600}
.cv3 .kys-why .rl{font-family:var(--mono);font-size:clamp(12px,1.5vw,17px);letter-spacing:.1em;text-transform:uppercase;color:var(--accent);font-weight:600;white-space:nowrap}
.cv3 .kys-why .rd{font-size:clamp(17px,2vw,26px);font-weight:700;letter-spacing:-.02em;line-height:1.3}
@media(max-width:760px){.cv3 .kys-why{grid-template-columns:1fr}.cv3 .kys-why .rl{margin-top:-6px}}
/* CTA — identity and QR lock on the centre grid, then all motion stops */
.cv3 .kys-cta{display:flex;flex-direction:column;align-items:center;text-align:center;gap:18px}
.cv3 .kys-cta-list{display:flex;flex-wrap:wrap;gap:9px 22px;justify-content:center}
.cv3 .kys-cta-list span{font-family:var(--mono);font-size:clamp(10px,1.2vw,13px);letter-spacing:.12em;text-transform:uppercase;color:var(--dim)}
.cv3 .kys-cta-go{display:inline-flex;align-items:center;gap:10px;font-family:var(--mono);font-size:clamp(13px,1.5vw,16px);letter-spacing:.1em;text-transform:uppercase;color:var(--accent);border:1px solid var(--accent);border-radius:999px;padding:14px 26px}
@media (prefers-reduced-motion:reduce){.cv3 .kys-lat,.cv3 .kys-lat.d2,.cv3 .kys-lat.d3,.cv3 .kys-lat.rev,.cv3 .kys-imgcol img,.cv3 .kys-num .u,.cv3 .kys-split .sp.l,.cv3 .kys-split .sp.r{transform:none!important;opacity:1!important}}
/* ── THE GEOGRAPHIC JOURNEY — Keynote's cinematic map. NOT Atlas: no graticule/register — a cream/blue
   editorial silhouette that zooms in laterally through World → Country → Region while a breadcrumb steps,
   markers lock at real jurisdiction positions, and a real photo takes over. Autoplays on .play. ── */
.cv3 .kys-geo{position:relative;overflow:hidden}
.cv3 .kys-geo-grid{position:relative;height:min(76vh,640px)}
.cv3 .kys-geo-copy{position:absolute;left:0;top:50%;transform:translateY(-50%);width:min(36%,400px);z-index:2}
@media(max-width:860px){.cv3 .kys-geo-grid{height:auto;padding:20px 0}.cv3 .kys-geo-copy{position:static;width:100%;transform:none}}
.cv3 .kys-geo-steps{display:flex;flex-direction:column;gap:clamp(6px,1.2vh,12px);margin-top:16px}
.cv3 .kys-geo-step{font-size:clamp(24px,3.4vw,58px);font-weight:800;letter-spacing:-.03em;line-height:1;color:var(--line);opacity:.45}
.cv3 .kys-geo.play .kys-geo-step{animation:kysgeostep .42s cubic-bezier(.2,1,.3,1) forwards var(--d)}
@keyframes kysgeostep{to{color:var(--ink);opacity:1}}
.cv3 .kys-geo-step.last{color:var(--accent)}
.cv3 .kys-geo.play .kys-geo-step.last{animation:kysgeosteplast .42s cubic-bezier(.2,1,.3,1) forwards var(--d)}
@keyframes kysgeosteplast{to{color:var(--accent);opacity:1}}
.cv3 .kys-geo-proj{margin-top:clamp(20px,3vh,36px);opacity:0}
.cv3 .kys-geo.play .kys-geo-proj{animation:kysgeofade .55s ease 1.85s forwards}
@keyframes kysgeofade{to{opacity:1}}
.cv3 .kys-geo-proj .pn{font-size:clamp(24px,3vw,46px);font-weight:800;letter-spacing:-.03em;line-height:1}
.cv3 .kys-geo-proj .pl{font-family:var(--mono);font-size:clamp(11px,1.3vw,14px);letter-spacing:.1em;text-transform:uppercase;color:var(--dim);margin-top:10px}
.cv3 .kys-geo-mapwrap{position:absolute;left:36%;top:4%;bottom:4%;right:2%;z-index:1}
@media(max-width:860px){.cv3 .kys-geo-mapwrap{position:static;width:100%;height:40vh;margin-top:18px}}
.cv3 .kys-geo-mapwrap svg{width:100%;height:100%;overflow:visible}
.cv3 .kys-geo-region{fill:color-mix(in srgb,var(--accent) 6%,transparent);stroke:var(--accent);stroke-width:1.1;opacity:0;transform-box:fill-box;transform-origin:60% 50%;transform:translateX(14%) scale(.62)}
.cv3 .kys-geo.play .kys-geo-region{animation:kysgeoreg 1s cubic-bezier(.22,1,.3,1) .18s forwards}
@keyframes kysgeoreg{to{opacity:1;transform:translateX(0) scale(1)}}
.cv3 .kys-geo-mk{opacity:0}
.cv3 .kys-geo.play .kys-geo-mk{animation:kysgeomk .45s cubic-bezier(.2,1,.3,1) forwards var(--d)}
@keyframes kysgeomk{0%{opacity:0;transform:translateY(-6px)}100%{opacity:1;transform:translateY(0)}}
.cv3 .kys-geo-mk .dot{fill:var(--accent)}
.cv3 .kys-geo-mk .num{fill:var(--bg);font-family:var(--font);font-weight:800;font-size:4px}
.cv3 .kys-geo-mk .lb{fill:var(--ink);font-family:var(--mono);font-size:3.5px;letter-spacing:.5px}
.cv3 .kys-geo-mk.flag .ring{fill:none;stroke:var(--accent);stroke-width:.7;opacity:.55}
.cv3 .kys-geo-foot{position:absolute;left:0;bottom:-4px;font-family:var(--mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim)}
@media (prefers-reduced-motion:reduce){.cv3 .kys-geo-step,.cv3 .kys-geo-proj{opacity:1!important;color:var(--ink)}.cv3 .kys-geo-region,.cv3 .kys-geo-mk{opacity:1!important;transform:none!important}}
/* ════ WAVE 3+4 (new) — namespaced gal/vn/chr/spc/exp ════ */
/* ══ 22 · GALLERY — museum exhibition (whitespace · one work per view · wall labels · slow) ══ */
.cv3 .gal-exh{min-height:100vh;display:grid;place-items:center;padding:clamp(60px,12vh,140px) clamp(24px,8vw,140px);position:relative}
.cv3 .gal-work{max-width:min(1000px,90vw);width:100%;text-align:center}
.cv3 .gal-frame{position:relative;overflow:hidden;opacity:0;transform:scale(1.02);transition:opacity 1.2s ease,transform 1.4s cubic-bezier(.22,1,.36,1)}
.cv3 .gal-exh.on .gal-frame{opacity:1;transform:none}
.cv3 .gal-frame img{width:100%;max-height:62vh;object-fit:cover;display:block}
.cv3 .gal-frame .ph{width:100%;height:50vh;background:linear-gradient(140deg,var(--bg2),var(--bg))}
.cv3 .gal-label{margin-top:26px;display:inline-block;text-align:left;border-top:1px solid var(--ink);padding-top:14px;min-width:clamp(240px,40vw,420px)}
.cv3 .gal-label .t{font-family:var(--serif);font-size:clamp(22px,3vw,38px);font-weight:500;letter-spacing:-.01em}
.cv3 .gal-label .m{font-family:var(--mono);font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--dim);margin-top:12px;line-height:1.95}
.cv3 .gal-eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:var(--accent);margin-bottom:22px}
.cv3 .gal-plate{max-width:min(760px,88vw);margin:0 auto;text-align:center}
.cv3 .gal-plate .big{font-family:var(--serif);font-size:clamp(48px,9vw,120px);font-weight:500;letter-spacing:-.02em;color:var(--accent);font-variant-numeric:tabular-nums;line-height:.92}
.cv3 .gal-plate .big .unit{font-size:.24em;color:var(--ink);font-style:italic}
.cv3 .gal-tomb{font-family:var(--mono);font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--dim);line-height:2.3;margin-top:22px}
.cv3 .gal-tomb b{color:var(--ink)}
.cv3 .gal-h{font-family:var(--serif);font-size:clamp(30px,4.4vw,60px);font-weight:500;letter-spacing:-.01em}
/* ══ 18 · VEIN — one organic mineral vein grows through the page; content buds off it ══ */
.cv3:has(.vn){overflow:hidden}
.cv3 .vn{position:fixed;inset:0;overflow-y:auto;overflow-x:hidden}
.cv3 .vn-svg{position:fixed;inset:0;width:100vw;height:100vh;z-index:0;pointer-events:none}
.cv3 .vn-path{fill:none;stroke:var(--accent);stroke-width:2.6;stroke-linecap:round}
.cv3 .vn-ghost{fill:none;stroke:var(--line);stroke-width:1}
.cv3 .vn-bud{min-height:90vh;display:flex;align-items:center;position:relative;z-index:2;padding:0 clamp(24px,9vw,150px)}
.cv3 .vn-bud .bc{max-width:40ch;opacity:0;transform:translateY(30px);transition:opacity .8s ease,transform .8s cubic-bezier(.22,1,.36,1)}
.cv3 .vn-bud.on .bc{opacity:1;transform:none}
.cv3 .vn-bud.right{justify-content:flex-end;text-align:right}
.cv3 .vn-bud.right .bc{margin-left:auto}
.cv3 .vn-k{font-family:var(--mono);font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--accent)}
.cv3 .vn-h{font-size:clamp(32px,5vw,72px);font-weight:800;letter-spacing:-.035em;line-height:.96;margin:14px 0 0;text-wrap:balance}
.cv3 .vn-h .unit{font-size:.3em;color:var(--dim);font-weight:700}
.cv3 .vn-p{font-size:clamp(16px,1.8vw,20px);color:var(--dim);line-height:1.5;margin:18px 0 0}
.cv3 .vn-shoot{margin-top:20px;font-family:var(--mono);font-size:12.5px;display:flex;flex-direction:column;gap:8px}
.cv3 .vn-bud.right .vn-shoot{align-items:flex-end}
.cv3 .vn-shoot span{color:var(--dim)}.cv3 .vn-shoot span b{color:var(--accent);font-weight:600}
/* ══ 24 · CHRONICLE — the company organized entirely by time (one continuous axis) ══ */
.cv3 .chr{max-width:1080px;margin:0 auto;padding:clamp(60px,10vh,120px) clamp(20px,5vw,56px) 100px;position:relative}
.cv3 .chr-axis{position:absolute;left:50%;top:clamp(200px,26vh,340px);bottom:60px;width:1px;background:linear-gradient(180deg,var(--accent),var(--line) 12%,var(--line));transform:translateX(-50%)}
.cv3 .chr-head{text-align:center;margin-bottom:clamp(30px,5vh,60px)}
.cv3 .chr-head .k{font-family:var(--mono);font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:var(--accent)}
.cv3 .chr-head h1{font-size:clamp(36px,6vw,86px);font-weight:800;letter-spacing:-.04em;line-height:.96;margin:16px 0 0;text-wrap:balance}
.cv3 .chr-head p{color:var(--dim);max-width:44ch;margin:18px auto 0;font-size:16px;line-height:1.5}
.cv3 .chr-marker{text-align:center;position:relative;z-index:2;margin:18px 0}
.cv3 .chr-marker span{font-family:var(--mono);font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--bg);background:var(--accent);padding:7px 16px;border-radius:999px}
.cv3 .chr-ev{display:grid;grid-template-columns:1fr 1fr;margin:clamp(16px,2.4vh,30px) 0;position:relative;min-height:40px}
.cv3 .chr-ev .side{padding:0 clamp(24px,4vw,56px)}
.cv3 .chr-ev.l .side{grid-column:1;text-align:right}
.cv3 .chr-ev.r .side{grid-column:2;text-align:left}
.cv3 .chr-ev .dot{position:absolute;left:50%;top:6px;width:11px;height:11px;border-radius:50%;background:var(--bg);border:2px solid var(--accent);transform:translateX(-50%);z-index:3}
.cv3 .chr-ev.future .dot{border-color:var(--dim)}
.cv3 .chr-ev .date{font-family:var(--mono);font-size:13px;color:var(--accent);letter-spacing:.04em}
.cv3 .chr-ev.future .date{color:var(--dim)}
.cv3 .chr-ev .h{font-size:clamp(18px,2.3vw,28px);font-weight:700;letter-spacing:-.015em;margin-top:8px;line-height:1.18}
.cv3 .chr-ev .p{font-size:14px;color:var(--dim);margin-top:8px;line-height:1.5}
.cv3 .chr-ev .tag{font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);margin-top:10px}
.cv3 .chr-ev .big{font-family:var(--mono);font-size:clamp(22px,2.6vw,34px);font-weight:600;color:var(--accent);margin-top:6px;font-variant-numeric:tabular-nums}
.cv3 .chr-r{opacity:0;transform:translateY(24px);transition:opacity .8s ease,transform .8s cubic-bezier(.22,1,.36,1)}
.cv3 .chr-r.on{opacity:1;transform:none}
@media(max-width:760px){.cv3 .chr-axis{left:20px}.cv3 .chr-ev{grid-template-columns:1fr}.cv3 .chr-ev.l .side,.cv3 .chr-ev.r .side{grid-column:1;text-align:left;padding:0 0 0 46px}.cv3 .chr-ev .dot{left:20px}}
/* ══ 21 · SPECIMEN — natural-history collection (dense taxonomic plate grid · sample numbers · scales) ══ */
.cv3 .spc{max-width:1200px;margin:0 auto;padding:clamp(56px,9vh,110px) clamp(20px,5vw,56px)}
.cv3 .spc-head{border-bottom:2px solid var(--ink);padding-bottom:22px;display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:16px}
.cv3 .spc-head .k{font-family:var(--mono);font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--accent)}
.cv3 .spc-head h1{font-family:var(--serif);font-weight:500;font-size:clamp(30px,4.6vw,60px);letter-spacing:-.01em;margin:10px 0 0}
.cv3 .spc-head .acc{font-family:var(--mono);font-size:11px;color:var(--dim);text-align:right;line-height:1.9}
.cv3 .spc-lbl{font-family:var(--mono);font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);margin:clamp(34px,5vh,56px) 0 18px}
.cv3 .spc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(238px,1fr));gap:1px;background:var(--line);border:1px solid var(--line)}
.cv3 .spc-plate{background:var(--bg);padding:22px 20px;position:relative;opacity:0;transform:translateY(16px);transition:opacity .6s ease,transform .6s cubic-bezier(.22,1,.36,1)}
.cv3 .spc-plate.on{opacity:1;transform:none}
.cv3 .spc-plate .no{font-family:var(--mono);font-size:9.5px;letter-spacing:.08em;color:var(--faint);position:absolute;top:15px;right:16px}
.cv3 .spc-plate .fig{height:120px;background:radial-gradient(circle at 40% 34%,color-mix(in srgb,var(--accent) 28%,var(--bg2)),var(--bg2));border-radius:4px;margin-bottom:16px;position:relative;overflow:hidden}
.cv3 .spc-plate .fig img{width:100%;height:100%;object-fit:cover}
.cv3 .spc-plate .fig .scale{position:absolute;bottom:9px;left:9px;height:3px;width:44px;background:var(--ink);opacity:.55}
.cv3 .spc-plate .fig .scale::after{content:"5 cm";position:absolute;left:0;top:6px;font-family:var(--mono);font-size:8px;color:var(--ink);opacity:.7}
.cv3 .spc-plate .nm{font-family:var(--serif);font-size:20px;font-weight:500}
.cv3 .spc-plate .lat{font-family:var(--mono);font-size:10px;color:var(--dim);font-style:italic;margin-top:5px}
.cv3 .spc-plate .cls{font-family:var(--mono);font-size:10.5px;color:var(--dim);text-transform:uppercase;letter-spacing:.04em;margin-top:13px;line-height:2;border-top:1px solid var(--line);padding-top:11px}
.cv3 .spc-plate .cls b{color:var(--ink)}
/* ══ 25 · EXPEDITION — horizontal geographic route; dated stops; route draws ahead ══ */
.cv3:has(.exp){overflow:hidden}
.cv3 .exp{height:100vh;display:flex;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch;position:relative;background:linear-gradient(180deg,var(--bg),color-mix(in srgb,var(--ink) 5%,var(--bg)))}
.cv3 .exp::-webkit-scrollbar{height:0;display:none}
.cv3 .exp-route{position:absolute;left:0;top:57%;height:0;border-top:2px dashed var(--accent);opacity:.5;z-index:1}
.cv3 .exp-stop{flex:0 0 min(86vw,660px);height:100%;scroll-snap-align:center;display:flex;flex-direction:column;justify-content:center;padding:clamp(30px,5vw,72px);position:relative;z-index:2}
.cv3 .exp-stop .exp-marker{position:absolute;left:clamp(30px,5vw,72px);top:57%;width:13px;height:13px;border-radius:50%;background:var(--accent);transform:translateY(-50%);box-shadow:0 0 0 6px color-mix(in srgb,var(--accent) 20%,transparent);z-index:3}
.cv3 .exp-stop .leg{font-family:var(--mono);font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
.cv3 .exp-stop .coord{font-family:var(--mono);font-size:11px;color:var(--dim);margin-top:6px}
.cv3 .exp-stop h2{font-size:clamp(32px,4.6vw,62px);font-weight:800;letter-spacing:-.035em;line-height:.98;margin:14px 0 0}
.cv3 .exp-stop h2 .unit{font-size:.3em;color:var(--dim);font-weight:700}
.cv3 .exp-note{border:1px solid var(--line);border-left:3px solid var(--accent);background:var(--bg);padding:18px 20px;margin-top:22px;max-width:46ch;font-family:var(--mono);font-size:12.5px;line-height:1.7;color:var(--ink);box-shadow:0 16px 32px -22px rgba(0,0,0,.5)}
.cv3 .exp-note .nl{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);margin-bottom:10px}
.cv3 .exp-note .rr{display:flex;justify-content:space-between;gap:14px;padding:5px 0}
.cv3 .exp-note .rr b{color:var(--accent)}
.cv3 .exp-meta{margin-top:20px;display:flex;flex-wrap:wrap;gap:8px 22px;font-family:var(--mono);font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--dim)}
.cv3 .exp-meta b{color:var(--ink)}
.cv3 .exp-hud{position:fixed;left:clamp(18px,4vw,40px);top:clamp(18px,4vw,40px);z-index:5;font-family:var(--mono);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim)}
.cv3 .exp-hud b{color:var(--accent)}
/* ══ 02 · ATLAS (V4 body) — an interactive field atlas: a persistent district-map rail indexes the
   company; scrolling the register activates each project ON the map. Namespaced afx-. ══ */
.cv3 .afx-grid{display:grid;grid-template-columns:minmax(300px,37%) 1fr;max-width:1340px;margin:0 auto;border-left:1px solid var(--line);border-right:1px solid var(--line)}
@media(max-width:820px){.cv3 .afx-grid{grid-template-columns:1fr}}
.cv3 .afx-map{position:sticky;top:0;height:100vh;border-right:1px solid var(--line);background:linear-gradient(180deg,var(--bg2),var(--bg));overflow:hidden;display:flex;flex-direction:column}
@media(max-width:820px){.cv3 .afx-map{position:static;height:58vh}}
.cv3 .afx-map .mh,.cv3 .afx-map .mf{display:flex;justify-content:space-between;gap:10px;padding:15px 18px;font-family:var(--mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim)}
.cv3 .afx-map .mh{border-bottom:1px solid var(--line)}.cv3 .afx-map .mf{border-top:1px solid var(--line);letter-spacing:.04em}
.cv3 .afx-map .mf b,.cv3 .afx-map .mh b{color:var(--accent)}
.cv3 .afx-map .mv{flex:1;position:relative}
.cv3 .afx-map svg{position:absolute;inset:0;width:100%;height:100%}
.cv3 .afx-map .grat{stroke:var(--line);stroke-width:.4;fill:none}
.cv3 .afx-map .gratlab{fill:var(--faint);font-family:var(--mono);font-size:3.1px;letter-spacing:.1px}
.cv3 .afx-map .district{fill:color-mix(in srgb,var(--accent) 6%,transparent);stroke:var(--accent);stroke-width:1;stroke-opacity:.55;stroke-linejoin:round}
.cv3 .afx-map .pin{fill:var(--dim);transition:fill .45s ease,r .45s cubic-bezier(.2,1.4,.4,1)}
.cv3 .afx-map .pin.act{fill:var(--accent);r:3.2}
.cv3 .afx-map .pinlab{fill:var(--dim);font-family:var(--mono);font-size:3.4px;letter-spacing:.15px;transition:fill .45s}
.cv3 .afx-map .pinlab.act{fill:var(--ink)}
.cv3 .afx-map .xh{opacity:0;transition:opacity .5s}.cv3 .afx-map .xh.on{opacity:.85}
.cv3 .afx-map .xh line{stroke:var(--accent);stroke-width:.5;stroke-dasharray:2.4 2.4}
.cv3 .afx-map .northm text{fill:var(--dim)}
.cv3 .afx-reg{min-width:0}
.cv3 .afx-entry{min-height:86vh;display:flex;flex-direction:column;justify-content:center;padding:clamp(40px,5vw,80px) clamp(28px,4.5vw,64px);border-bottom:1px solid var(--line);position:relative}
.cv3 .afx-entry .afx-in{opacity:0;transform:translateX(-26px);transition:opacity .8s ease,transform .8s cubic-bezier(.22,1,.36,1)}
.cv3 .afx-entry.afx-on .afx-in{opacity:1;transform:none}
.cv3 .afx-sheet{position:absolute;top:20px;right:clamp(28px,4.5vw,64px);font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--faint)}
.cv3 .afx-ix{font-family:var(--mono);font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);display:flex;align-items:center;gap:12px}
.cv3 .afx-ix::after{content:"";flex:1;height:1px;background:var(--line);max-width:120px}
.cv3 .afx-t{font-size:clamp(30px,3.8vw,56px);font-weight:800;letter-spacing:-.03em;line-height:.98;margin:12px 0 0}
.cv3 .afx-t .unit{font-size:.36em;color:var(--dim);font-weight:700}
.cv3 .afx-coord{font-family:var(--mono);font-size:11.5px;color:var(--dim);margin-top:14px;letter-spacing:.04em;display:flex;gap:20px;flex-wrap:wrap}
.cv3 .afx-coord b{color:var(--ink)}
.cv3 .afx-o{color:var(--dim);margin-top:18px;font-size:15px;line-height:1.6;max-width:52ch}
.cv3 .afx-meta{margin-top:20px;display:grid;grid-template-columns:auto 1fr;gap:9px 20px;font-family:var(--mono);font-size:11px;letter-spacing:.04em;text-transform:uppercase;max-width:40ch}
.cv3 .afx-meta dt{color:var(--faint)}.cv3 .afx-meta dd{margin:0;color:var(--ink)}
.cv3 .afx-drill{font-family:var(--mono);font-size:12.5px;margin-top:16px;max-width:44ch}
.cv3 .afx-drill .r{display:grid;grid-template-columns:auto 1fr auto;gap:14px;padding:9px 0;border-top:1px solid var(--line)}
.cv3 .afx-drill .r .g{color:var(--accent);text-align:right;font-weight:600}
.cv3 .afx-ribbon{display:flex;flex-wrap:wrap;border-left:1px solid var(--line);border-top:1px solid var(--line);margin-top:16px;max-width:52ch}
.cv3 .afx-ribbon .rc{flex:1 1 130px;padding:15px 18px;border-right:1px solid var(--line);border-bottom:1px solid var(--line)}
.cv3 .afx-ribbon .rc .k{font-family:var(--mono);font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim)}
.cv3 .afx-ribbon .rc .v{font-family:var(--mono);font-size:16px;color:var(--ink);margin-top:7px}
.cv3 .afx-port{display:flex;flex-direction:column;gap:2px;margin-top:18px;max-width:48ch}
.cv3 .afx-port .pr{display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:baseline;padding:13px 0;border-top:1px solid var(--line);font-family:var(--mono);font-size:12px}
.cv3 .afx-port .pr .id{color:var(--accent);font-weight:600}.cv3 .afx-port .pr .nm{color:var(--ink);font-family:var(--font);font-size:16px;font-weight:700;letter-spacing:-.01em}.cv3 .afx-port .pr .rf{color:var(--dim);text-align:right}
`;

export default function ConferenceV3({ profile, template = "monolith", theme: themeProp = "obsidian", accent: accentProp = "", showBar = true }) {
  const model = useMemo(() => buildV3Model(profile || {}), [profile]);
  const [tpl, setTpl] = useState(TEMPLATES[template] ? template : "monolith");
  const [theme, setTheme] = useState(themeProp || "obsidian");
  const [accent, setAccent] = useState(accentProp || "");     // "" = use theme default
  const [menu, setMenu] = useState(false);                    // template dropdown open
  const rootRef = useRef(null);
  useEffect(() => { setTpl(TEMPLATES[template] ? template : "monolith"); }, [template]);
  useEffect(() => { setTheme(themeProp || "obsidian"); }, [themeProp]);
  useEffect(() => { setAccent(accentProp || ""); }, [accentProp]);

  // load the display + mono faces once (the app doesn't ship them; Conference is its own register)
  useEffect(() => {
    if (document.getElementById("cv3-fonts")) return;
    const l = document.createElement("link"); l.id = "cv3-fonts"; l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700;800;900&family=IBM+Plex+Mono:wght@400;500;600&family=Fraunces:ital,opsz,wght@0,9..144,500;1,9..144,500&display=swap";
    document.head.appendChild(l);
  }, []);

  // scroll reveals
  useEffect(() => {
    const el = rootRef.current; if (!el) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: .14, rootMargin: "0px 0px -6% 0px" });
    el.querySelectorAll(".rise").forEach((r) => io.observe(r));
    setTimeout(() => el.querySelectorAll(".rise:not(.in)").forEach((r) => { if (r.getBoundingClientRect().top < window.innerHeight) r.classList.add("in"); }), 60);
    return () => io.disconnect();
  }, [model, theme, tpl]);

  // switching templates always starts the new one at the top — reset the main scroller
  // plus any horizontal (.core/.kys/.exp) or fixed-vertical (.terr/.cns/.vn) inner scrollers
  useEffect(() => {
    const el = rootRef.current; if (!el) return;
    const reset = () => {
      el.scrollTop = 0;
      el.querySelectorAll(".core,.kys,.exp").forEach((s) => { s.scrollLeft = 0; });
      el.querySelectorAll(".terr,.cns,.vn").forEach((s) => { s.scrollTop = 0; });
      try { window.scrollTo(0, 0); } catch { /* noop */ }
    };
    reset();
    const t = setTimeout(reset, 60); // catch inner scrollers that mount after the switch
    return () => clearTimeout(t);
  }, [tpl]);

  const chooseTheme = (v) => { setTheme(v); setAccent(""); };
  const accentStyle = accent ? { "--accent": accent, "--accent2": lighten(accent, .34) } : {};

  return (
    <>
      <style>{CSS}</style>
      <div className="cv3" data-variant={theme} style={accentStyle} ref={rootRef}>
        {showBar && (() => {
          const keys = Object.keys(TEMPLATES); const ci = Math.max(0, keys.indexOf(tpl));
          // moving to another template gives it a fresh palette (theme by index) so clicking
          // through the library never shows the same colours twice in a row
          const pick = (k) => {
            const ni = Math.max(0, keys.indexOf(k));
            setTpl(k); setTheme(THEME_KEYS[ni % THEME_KEYS.length]); setAccent(""); setMenu(false);
          };
          const go = (d) => pick(keys[(ci + d + keys.length) % keys.length]);
          return (
            <div className="cv3bar">
              <button className="navb" onClick={() => go(-1)} aria-label="Previous template">‹</button>
              <div className="tplsel">
                <button className="tplcur" onClick={() => setMenu((v) => !v)} aria-expanded={menu}>{(TEMPLATES[tpl] || {}).label || tpl}<span className="cx">▾</span></button>
                {menu && <>
                  <div className="tplback" onClick={() => setMenu(false)} />
                  <div className="tplmenu">{keys.map((k) => (
                    <button key={k} className={"tplitem" + (k === tpl ? " on" : "")} onClick={() => pick(k)}>{TEMPLATES[k].label}</button>
                  ))}</div>
                </>}
              </div>
              <button className="navb" onClick={() => go(1)} aria-label="Next template">›</button>
              <span className="div" />
              {THEME_KEYS.map((k) => <button key={k} className="sw" aria-pressed={theme === k} title={THEMES[k].label} onClick={() => chooseTheme(k)} style={{ background: themeDot(k) }} />)}
              <span className="div" />
              <label className="accent" title="Accent colour"><input type="color" value={accent || THEME_ACCENT[theme]} onChange={(e) => setAccent(e.target.value)} /></label>
            </div>
          );
        })()}
        {(TEMPLATES[tpl] || TEMPLATES.monolith).render(model)}
      </div>
    </>
  );
}

// ── CANONICAL CONFERENCE STORY ─────────────────────────────────────────────────────────────────────
// Derived ONCE from the model — the same investor facts every template presents. Templates control HOW
// the story is shown, never WHAT exists. Invents nothing: economics (mine-life/AISC) and the leadership
// disciplines line are surfaced only where the company discloses them in its own data; everything else
// collapses when a field is absent. Monolith and Atlas (and future templates) all consume this, so an
// investor learns equivalent things about the company whichever presentation a CEO picks.
function _confStory(m) {
  const pool = (m.images.pool && m.images.pool.length) ? m.images.pool : [m.images.hero, m.images.field, m.images.camp].filter(Boolean);
  const flag = m.projects.find((p) => p.hasDrills) || m.projects[0] || {};
  const flagImg = flag.image || m.images.field || pool[1] || pool[0] || "";
  const best = (m.flagship.drills || []).slice().sort((a, b) => _gnum(b.grade) - _gnum(a.grade))[0] || null;
  const cats = (m.catalysts || []).slice(0, 4);
  const why = m.why.slice(0, 4);
  const region = m.geo.region || m.geo.country || "";
  const hook = [m.commodity, region, m.heroStat && m.heroStat.value].filter(Boolean).join("   ·   ");
  const sm = String((m.heroStat && m.heroStat.value) || "").match(/^\s*([\d.,]+)\s*(.*)$/);
  const statNum = sm ? sm[1] : String((m.heroStat && m.heroStat.value) || ""), statUnit = sm ? sm[2] : "";
  const facts = [
    m.heroStat && { v: m.heroStat.value, k: m.heroStat.label || "Resource" },
    flag.ownership && { v: flag.ownership, k: "Flagship ownership" },
    region && { v: region, k: "Jurisdiction" },
    flag.stage && { v: flag.stage, k: "Current stage" },
  ].filter(Boolean).slice(0, 4);
  const capFind = (re) => (m.capital.find((c) => re.test(c[0])) || [])[1];
  const whyText = why.join("  ") + "  " + (m.thesis || "");
  const mLife = (whyText.match(/(\d+)\s*[-\s]?\s*year[s]?\s+(?:mine\s+life|life[-\s]of[-\s]mine)/i) || [])[1];
  const aiscM = whyText.match(/(?:aisc|all[-\s]in\s+sustaining)[^.]*?(US\$[\d,]+(?:\.\d+)?\s*\/?\s*oz)/i);
  const debtVal = capFind(/debt/i) || (/\bno\s+debt|debt[-\s]free\b/i.test(whyText) ? "None" : "");
  const econ = [
    { v: capFind(/cash/i), k: "Cash" },
    { v: debtVal, k: "Debt" },
    { v: capFind(/market\s*cap/i), k: "Market cap" },
    { v: capFind(/outstanding/i), k: "Shares outstanding" },
    mLife && { v: mLife + "-yr", k: "Projected mine life" },
    aiscM && { v: aiscM[1].replace(/\s+/g, ""), k: "AISC" },
  ].filter((e) => e && e.v);
  const disc = _mnDisciplines(m.team);
  const nWord = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven"][m.projects.length] || String(m.projects.length);
  const portHead = m.projects.length > 1 ? `${nWord} projects · one ${region || "portfolio"}` : (region || "Portfolio");
  const ctaFeatures = ["Press releases", "Exploration results", "Project updates", "Media", "Catalysts"];
  return { pool, flag, flagImg, best, cats, why, region, hook, statNum, statUnit, facts, econ, disc, portHead, ctaFeatures };
}

// a short investment-case label DERIVED from a reason's own words (scale/location/economics/funding);
// falls back to a numeral when nothing matches — never invents a category the text doesn't support.
function _confReasonLabel(text, i) {
  const t = String(text || "").toLowerCase();
  if (/\b(moz|resource|ounce|scale|tonn|grade|deposit)\b/.test(t)) return "Scale";
  if (/\b(jurisdiction|nevada|located|location|infrastructure|tier|district|region)\b/.test(t)) return "Location";
  if (/\b(econom|aisc|cost|pea|mine life|margin|npv|irr|payback)\b/.test(t)) return "Economics";
  if (/\b(fund|financ|cash|debt|treasur|capital|balance sheet)\b/.test(t)) return "Funded";
  return "0" + (i + 1);
}

// MONOLITH (V4) — brutalist monumentality. ONE dominant object per full screen, photography as ground,
// a slow procession of singular statements. No cards, no tables, no ticker chrome, no stat grids.
function Monolith({ m }) {
  // ONE driver: sets --p (0→1) on each pinned chapter as it scrubs through its own scroll length.
  // Every transform is derived from --p in CSS, so motion is scroll-linked, GPU-only and 60fps.
  useEffect(() => {
    const chapters = Array.from(document.querySelectorAll(".mn3 .mn3-ch"));
    if (!chapters.length) return;
    let raf = 0;
    const upd = () => {
      raf = 0; const vh = window.innerHeight || 1;
      chapters.forEach((ch) => {
        const travel = ch.offsetHeight - vh;
        const p = travel > 0 ? Math.max(0, Math.min(1, -ch.getBoundingClientRect().top / travel)) : (ch.getBoundingClientRect().top <= 0 ? 1 : 0);
        ch.style.setProperty("--p", p.toFixed(4));
      });
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(upd); };
    const sc = document.querySelector(".cv3");
    upd(); requestAnimationFrame(upd);
    (sc || window).addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { (sc || window).removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [m]);

  const { pool, flag, flagImg, best, cats, why, region, hook, statNum, statUnit, facts, econ, disc, portHead } = _confStory(m);
  const img = (i) => (pool.length ? pool[((i % pool.length) + pool.length) % pool.length] : "");
  const heroImg = m.images.hero || img(0);
  return (
    <div className="mn3">
      {/* HERO — photo scales, black rises to consume it; the name pins then lifts away */}
      <section className="mn3-ch mn3-hero" style={{ height: "200vh" }}>
        <div className="mn3-stage">
          <div className="mn3-photo">{heroImg ? <img src={heroImg} alt="" /> : null}</div>
          <div className="mn3-scrim" /><div className="mn3-cover" />
          <div className="mn3-pad end"><div className="mn3-in">
            {hook && <div className="mn3-hook rise" style={{ transitionDelay: ".05s" }}>{hook}</div>}
            <div className="mn2-name rise blur" style={{ transitionDelay: ".2s" }}>{m.name}</div>
            {m.tagline && <div className="mn2-cap rise" style={{ transitionDelay: ".5s" }}>{m.tagline}</div>}
            {m.tickerLine && <span className="ticker rise" style={{ transitionDelay: ".6s", marginTop: 22 }}><span className="dot" />{m.tickerLine}</span>}
          </div></div>
        </div>
      </section>

      {/* SNAPSHOT — the company in ten seconds: four facts assemble, then a statement resolves */}
      {facts.length > 0 && (
        <section className="mn3-ch mn3-snap-ch" style={{ height: "220vh" }}>
          <div className="mn3-stage">
            <div className="mn3-pad center"><div className="mn3-in">
              <div className="mn2-k" style={{ marginBottom: 6 }}>The company in ten seconds</div>
              <div className="mn3-snap">
                {facts.map((f, i) => (
                  <div className="f" key={i} style={{ "--i": i, "--n": facts.length }}>
                    <div className="fv">{f.v}</div><div className="fk">{f.k}</div>
                  </div>
                ))}
              </div>
              {m.thesis && <div className="mn3-snap-sup">{m.thesis}</div>}
            </div></div>
          </div>
        </section>
      )}

      {/* STAT — the number IS the graphic, then becomes a mask the flagship image opens through */}
      {m.heroStat && (
        <section className="mn3-ch mn3-stat" style={{ height: "260vh" }}>
          <div className="mn3-stage">
            <div className="mn3-pad center"><div className="mn3-in">
              <div className="mn2-k mn3-stat-label" style={{ marginBottom: 26 }}>{m.heroStat.label}</div>
              <div className="mn3-statrow">
                <div className="mn3-stat-bar" aria-hidden="true" />
                <div className="mn3-statnum">
                  <span className="glyphs">
                    <span className="g-solid">{statNum}</span>
                    <span className="g-mask" style={{ backgroundImage: flagImg ? `url(${flagImg})` : "none" }}>{statNum}</span>
                  </span>
                  {statUnit && <span className="g-unit">{statUnit}</span>}
                </div>
              </div>
              {m.heroStat.context && <div className="mn2-cap dk mn3-stat-ctx" style={{ marginTop: 28 }}>{m.heroStat.context}</div>}
            </div></div>
            <div className="mn3-flag" aria-hidden="true">{flagImg ? <img src={flagImg} alt="" /> : null}</div>
          </div>
        </section>
      )}

      {/* FLAGSHIP ASSET — state A: the resource in context; state B: the strongest intercept, then the
          drill-section draws in BELOW it (established statistic first — no graphic crossing the type) */}
      {(flag.name || best) && (
        <section className="mn3-ch mn3-flag-ch mn3-flag2" style={{ height: "300vh" }}>
          <div className="mn3-stage">
            <div className="mn3-photo">{flagImg ? <img src={flagImg} alt="" /> : null}</div>
            <div className="mn3-scrim" />
            <div className="mn3-fa"><div className="mn3-in">
              <div className="mn2-k">{[flag.name, flag.location].filter(Boolean).join(" · ")}</div>
              {m.heroStat && <div className="big">{m.heroStat.value}</div>}
              <div className="sub">{[m.heroStat && m.heroStat.context, flag.ownership && flag.ownership + " owned", flag.land].filter(Boolean).join("   ·   ")}</div>
              {flag.overview && <div className="line">{flag.overview}</div>}
            </div></div>
            {best && (
              <div className="mn3-fb">
                <div className="mn3-fb-head">
                  <div className="mn2-k" style={{ marginBottom: 12 }}>Strongest intercept</div>
                  <div className="mn3-fb-grade">{best.grade}</div>
                  <div className="mn3-fb-cap">{best.hole}{best.interval ? " · over " + best.interval : ""}</div>
                </div>
                {(m.flagship.drills || []).length > 0 && <div className="mn3-fb-sec"><Mn2Section drills={m.flagship.drills || []} /></div>}
                <div className="mn3-fb-seclab">Drill section · schematic, not to scale</div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* PORTFOLIO — the projects as one strategy: a schematic jurisdiction map + a register that lights
          each project (and its map pin) in turn. One project → a single asset frame, no forced grid. */}
      {m.projects.length > 0 && (
        <section className="mn3-ch mn3-port-ch" style={{ height: `${Math.max(240, 130 + m.projects.length * 70)}vh` }}>
          <div className="mn3-stage">
            <div className="mn3-port">
              <div className="mn3-map"><Mn3Map projects={m.projects} region={region} /></div>
              <div className="mn3-portlist">
                <div className="mn3-porthead">{portHead}</div>
                {m.projects.map((p, i) => (
                  <div className="mn3-pj" key={i} style={{ "--i": i, "--n": m.projects.length }}>
                    <div className="pjname"><span className="pjnum">{i + 1}</span>{p.name}</div>
                    <div className="pjmeta">{[p.stage, p.commodity, p.ownership && p.ownership + " owned"].filter(Boolean).join(" · ")}</div>
                    {p.overview && <div className="pjdesc">{p.overview}</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ECONOMICS — can the company advance its project? A balanced figure grid where market cap is
          one tile, not the whole screen. Mine-life / AISC appear only when the company discloses them. */}
      {econ.length > 0 && (
        <section className="mn3-ch mn3-econ-ch" style={{ height: "210vh" }}>
          <div className="mn3-stage">
            <div className="mn3-pad center"><div className="mn3-in">
              <div className="mn2-k" style={{ marginBottom: 8 }}>Built to advance</div>
              <div className="mn3-econ">
                {econ.map((e, i) => (
                  <div className="e" key={i} style={{ "--i": i, "--en": econ.length }}>
                    <div className="ev">{e.v}</div><div className="ek">{e.k}</div>
                  </div>
                ))}
              </div>
              <div className="mn3-econ-note">Full capital structure and analysis on MineEx.</div>
            </div></div>
          </div>
        </section>
      )}

      {/* CATALYST — an accent line draws downward and carries you into the milestone */}
      {cats.length > 0 && (
        <section className="mn3-ch mn3-cat" style={{ height: "200vh" }}>
          <div className="mn3-stage">
            <div className="mn3-line" aria-hidden="true" />
            <div className="mn3-pad"><div className="mn3-in">
              <div className="mn2-k">What happens next</div>
              <div className="mn2-mile mn3-cat-mile">
                {cats[0].timing && <span className="mt">{cats[0].timing}</span>}
                <div className="ml">{cats[0].label}</div>
                {cats[0].impact && <div className="mi">{cats[0].impact}</div>}
              </div>
              {cats.length > 1 && (
                <div className="mn2-milerest mn3-cat-mile">
                  {cats.slice(1).map((c, i) => (
                    <div className="mrow" key={i}><span className="t">{c.timing || "Next"}</span><span className="l">{c.label}</span></div>
                  ))}
                </div>
              )}
            </div></div>
          </div>
        </section>
      )}

      {/* WHY INVEST — the case as distinct, sequentially-revealed numbered reasons (not one wall of text) */}
      {why.length > 0 && (
        <section className="mn3-ch mn3-why-ch" style={{ height: "240vh" }}>
          <div className="mn3-stage">
            <div className="mn3-pad"><div className="mn3-in">
              <div className="mn2-k" style={{ marginBottom: 20 }}>Why invest</div>
              <div className="mn3-why">
                {why.map((w, i) => (
                  <div className="mn3-reason" key={i} style={{ "--i": i, "--wn": why.length }}>
                    <span className="rn">{String(i + 1).padStart(2, "0")}</span><span className="rw">{w}</span>
                  </div>
                ))}
              </div>
            </div></div>
          </div>
        </section>
      )}

      {/* LEADERSHIP — a credibility line derived from the actual roles present, then the team */}
      {m.team.length > 0 && (
        <section className="mn3-ch mn3-lead-ch" style={{ height: "200vh" }}>
          <div className="mn3-stage">
            <div className="mn3-pad"><div className="mn3-in">
              <div className="mn2-k" style={{ marginBottom: 14 }}>Leadership</div>
              {disc && <div className="mn3-lead-intro">A leadership team spanning {disc}.</div>}
              <div className="mn2-team" style={{ marginTop: 26 }}>
                {m.team.slice(0, 8).map((p, i) => (
                  <div className="mn2-mem mn3-mem" key={i} style={{ "--i": i, "--n": Math.min(8, m.team.length) }}>
                    <div className="mn2-av" aria-hidden="true">{mn2Initials(p.name)}</div>
                    <div><div className="nm">{p.name}</div>{p.role && <div className="rl">{p.role}</div>}</div>
                  </div>
                ))}
              </div>
            </div></div>
          </div>
        </section>
      )}

      {/* CLOSE — a reason to follow, then MineEx as the logical continuation of the experience */}
      <section className="mn3-ch mn3-close" style={{ height: "150vh" }}>
        <div className="mn3-stage">
          <div className="mn3-pad center"><div className="mn3-in">
            <div className="mn2-k mn3-close-sub" style={{ marginBottom: 18 }}>Follow the story</div>
            <div className="mn2-cta-name mn3-close-name">{m.name}</div>
            <div className="mn3-cta-list">
              {["Press releases", "Exploration results", "Project updates", "Media", "Catalysts"].map((x) => <span key={x}>{x}</span>)}
            </div>
            <div className="mn3-cta-go">Follow on MineEx →</div>
          </div></div>
        </div>
      </section>
    </div>
  );
}

// initials for the leadership avatars (first + last, uppercased)
function mn2Initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "·";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

// flagship drill-section schematic — top holes plotted as intercepts, colour by relative grade.
// Honest: positions are schematic (labelled as such); hole ids, intervals and grades are the real data.
function Mn2Section({ drills }) {
  const ds = (drills || []).slice(0, 6);
  if (!ds.length) return null;
  const maxG = Math.max(...ds.map((d) => _gnum(d.grade) || 0), 0.0001);
  const W = 400, H = 300, top = 48, n = ds.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      <line x1="24" y1={top} x2={W - 24} y2={top} stroke="var(--line2)" strokeWidth="1.5" />
      <text x="24" y={top - 12} fill="var(--dim)" fontFamily="var(--mono)" fontSize="9" letterSpacing="2">SURFACE</text>
      {ds.map((d, i) => {
        const x = 46 + (i + 0.5) * ((W - 92) / n);
        const gi = (_gnum(d.grade) || 0) / maxG;
        const seg = Math.min(140, 44 + (_gnum(d.interval) || 12) * 2.4);
        const y0 = top + 26 + (i % 2) * 26;
        return (
          <g key={i}>
            <line x1={x} y1={top} x2={x} y2={y0 + seg + 10} stroke="var(--line2)" strokeWidth="1" />
            <circle cx={x} cy={top} r="3" fill="var(--accent)" />
            <rect x={x - 5.5} y={y0} width="11" height={seg} rx="5" fill="var(--accent)" opacity={(0.32 + gi * 0.62).toFixed(2)} />
          </g>
        );
      })}
    </svg>
  );
}

// leadership credibility line — names ONLY the disciplines actually present in the team's roles
// (nothing invented about experience or track record). Empty when too few roles resolve.
function _mnDisciplines(team) {
  const map = [[/explor/i, "exploration"], [/develop/i, "development"], [/permit|sustain|environ/i, "permitting"], [/financ|cfo|treasur|capital/i, "finance"], [/operat|coo|production/i, "operations"], [/geolog/i, "geology"]];
  const set = [];
  (team || []).forEach((t) => map.forEach(([re, w]) => { if (re.test(t.role || "") && !set.includes(w)) set.push(w); }));
  if (set.length < 2) return "";
  return set.slice(0, -1).join(", ") + " and " + set[set.length - 1];
}

// schematic jurisdiction map — a real state outline where we know it (NEVADA), else a neutral plate.
// Pins placed by matching a project's disclosed county/location; positions are SCHEMATIC (labelled so),
// never fabricated coordinates. Pins light in order via the chapter's --p.
const _NV_PATH = "M8 6 L86 6 L86 95 L64 132 L8 60 Z";
const _NV_COUNTIES = { humboldt: [26, 24], elko: [66, 20], lander: [46, 34], eureka: [54, 37], nye: [50, 76], washoe: [14, 34], "white pine": [70, 52], esmeralda: [34, 96], clark: [60, 116], pershing: [30, 40], churchill: [30, 54], mineral: [30, 70], lincoln: [66, 88], lyon: [22, 52], douglas: [15, 56], storey: [19, 44] };
function Mn3Map({ projects, region }) {
  const isNV = /nevada/i.test(region || "");
  const path = isNV ? _NV_PATH : "M14 12 L86 10 L92 58 L76 118 L20 114 L8 54 Z";
  const list = projects || [];
  const pins = list.map((p, i) => {
    let pos = null;
    if (isNV) { const loc = String(p.location || "").toLowerCase(); const c = Object.keys(_NV_COUNTIES).find((k) => loc.includes(k)); if (c) pos = _NV_COUNTIES[c]; }
    if (!pos) pos = [30 + (i % 2) * 36, 22 + i * (90 / Math.max(1, list.length))];
    return { x: pos[0], y: pos[1], name: p.name };
  });
  return (
    <svg viewBox="0 0 100 140" preserveAspectRatio="xMidYMid meet">
      <defs><clipPath id="mn3mapclip"><path d={path} /></clipPath></defs>
      <g className="grat" clipPath="url(#mn3mapclip)">
        {[20, 40, 60, 80].map((x) => <line key={"v" + x} x1={x} y1="0" x2={x} y2="140" />)}
        {[28, 56, 84, 112].map((y) => <line key={"h" + y} x1="0" y1={y} x2="100" y2={y} />)}
      </g>
      <path className="nvout" d={path} />
      {pins.map((p, i) => (
        <g className="pin" key={i} style={{ "--i": i, "--n": pins.length }}>
          <circle className="halo" cx={p.x} cy={p.y} r="8.5" fill="none" stroke="var(--accent)" strokeWidth="1" />
          <circle className="dot" cx={p.x} cy={p.y} r="3.4" />
          <text className="plab" x={p.x} y={p.y + 1.7} textAnchor="middle">{i + 1}</text>
        </g>
      ))}
      {region && <text x="50" y="138" textAnchor="middle" fill="var(--dim)" fontFamily="var(--mono)" fontSize="4.6" letterSpacing="2">{esc(region.toUpperCase())} · SCHEMATIC POSITIONS</text>}
    </svg>
  );
}

// Atlas's cartographic map — same honest geography as Mn3Map (real state outline + real counties,
// schematic positions) but a different rendering: graticule, coordinate ticks, numbered pins, and an
// optional crosshair that targets one project (the "locate the company" moment). Styled via atx- CSS.
// only={i}: render a SINGLE jurisdiction locator (the flagship's disclosed county-level position) — never
// a manufactured multi-project spatial layout. Honest: real state outline, real county, labelled schematic.
function AtxMap({ projects, region, only }) {
  const isNV = /nevada/i.test(region || "");
  const path = isNV ? _NV_PATH : "M14 12 L86 10 L92 58 L76 118 L20 114 L8 54 Z";
  const list = projects || [];
  const target = (typeof only === "number") ? list[only] : list[0];
  let pos = null;
  if (isNV && target) { const loc = String(target.location || "").toLowerCase(); const c = Object.keys(_NV_COUNTIES).find((k) => loc.includes(k)); if (c) pos = _NV_COUNTIES[c]; }
  return (
    <svg viewBox="0 0 100 140" preserveAspectRatio="xMidYMid meet">
      <defs><clipPath id="atxclip"><path d={path} /></clipPath></defs>
      <g className="amgrat" clipPath="url(#atxclip)">
        {[16, 32, 48, 64, 80].map((x) => <line key={"v" + x} x1={x} y1="0" x2={x} y2="140" />)}
        {[20, 44, 68, 92, 116].map((y) => <line key={"h" + y} x1="0" y1={y} x2="100" y2={y} />)}
      </g>
      <path className="amout" d={path} />
      {pos && <g className="amcross"><line x1={pos[0]} y1="0" x2={pos[0]} y2="140" /><line x1="0" y1={pos[1]} x2="100" y2={pos[1]} /></g>}
      {pos && <g className="ampin"><circle className="amhalo" cx={pos[0]} cy={pos[1]} r="8" /><circle className="amdot" cx={pos[0]} cy={pos[1]} r="3.4" /></g>}
      {region && <text className="amglab" x="50" y="137" textAnchor="middle">{esc(region.toUpperCase())}</text>}
    </svg>
  );
}

// a small distinct map-symbol per investment-case reason (legend glyphs — purely decorative)
function _atxLegSym(label) {
  const c = "var(--accent)";
  if (label === "Scale") return <svg viewBox="0 0 34 34"><circle cx="17" cy="17" r="12" fill="none" stroke={c} strokeWidth="1.6" /><circle cx="17" cy="17" r="4" fill={c} /></svg>;
  if (label === "Location") return <svg viewBox="0 0 34 34"><path d="M17 5 C11 5 7 9 7 15 C7 22 17 30 17 30 C17 30 27 22 27 15 C27 9 23 5 17 5 Z" fill="none" stroke={c} strokeWidth="1.6" /><circle cx="17" cy="15" r="3.2" fill={c} /></svg>;
  if (label === "Economics") return <svg viewBox="0 0 34 34"><path d="M17 4 L30 17 L17 30 L4 17 Z" fill="none" stroke={c} strokeWidth="1.6" /><path d="M17 11 L23 17 L17 23 L11 17 Z" fill={c} /></svg>;
  if (label === "Funded") return <svg viewBox="0 0 34 34"><rect x="6" y="6" width="22" height="22" fill="none" stroke={c} strokeWidth="1.6" /><path d="M11 17 L15 21 L23 12" fill="none" stroke={c} strokeWidth="2" /></svg>;
  return <svg viewBox="0 0 34 34"><circle cx="17" cy="17" r="11" fill="none" stroke={c} strokeWidth="1.6" /></svg>;
}

// ── Template 02 · ATLAS — map-led. The map is an honest DISTRICT SCHEMATIC (not geo-accurate; we
// never fabricate coordinates), but every label is real: drill dots carry actual hole names + grades
// from the model, layers toggle, hovering a hole shows its assay. ──
const esc = (s) => String(s == null ? "" : s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
function buildAtlasMap(el, m) {
  if (!el) return;
  const drills = (m.flagship.drills || []).slice(0, 10);
  const pts = drills.map((d, i) => { const a = i / Math.max(1, drills.length) * Math.PI * 2 + 0.6; const r = 34 + ((i * 41) % 62); return { x: (256 + Math.cos(a) * r).toFixed(0), y: (308 + Math.sin(a) * r * 0.92).toFixed(0), d }; });
  const claim = "M120 120 L400 90 L440 300 L410 560 L250 640 L90 540 L70 300 Z";
  let g = '<rect class="m-bg" x="0" y="0" width="500" height="700"/><g class="m-grid" stroke-width="1" fill="none">';
  for (let i = 1; i < 7; i++) g += '<path d="M0 ' + (i * 100) + 'H500"/>';
  for (let j = 1; j < 5; j++) g += '<path d="M' + (j * 100) + ' 0V700"/>';
  g += '</g><g data-g="claims"><path d="' + claim + '" class="m-acc m-accs" fill-opacity=".06" stroke-width="1.5" stroke-dasharray="5 6" stroke-opacity=".7"/></g>';
  g += '<g data-g="deposit"><ellipse cx="256" cy="308" rx="70" ry="58" class="m-acc m-accs" fill-opacity=".2" stroke-width="1.5"/><ellipse cx="256" cy="308" rx="40" ry="32" class="m-acc" fill-opacity=".34"/><text class="m-ink" x="256" y="250" text-anchor="middle" font-size="13" letter-spacing="3">' + esc((m.flagship.name || "Deposit").toUpperCase().slice(0, 16)) + '</text></g>';
  g += '<g data-g="targets">' + [[150, 180], [360, 470], [120, 520]].map((t) => '<circle cx="' + t[0] + '" cy="' + t[1] + '" r="13" class="m-accs" fill="none" stroke-width="1.5" stroke-opacity=".8"/><circle cx="' + t[0] + '" cy="' + t[1] + '" r="3" class="m-acc"/>').join("") + "</g>";
  g += '<g data-g="drills">' + pts.map((p) => '<circle class="drillhole m-acc" cx="' + p.x + '" cy="' + p.y + '" r="4.5" data-h="' + esc(p.d.hole) + '" data-v="' + esc(p.d.grade) + '"><title>' + esc(p.d.hole) + " · " + esc(p.d.grade) + "</title></circle>").join("") + "</g>";
  el.innerHTML = '<div class="maptools"><button data-layer="deposit" aria-pressed="true">Deposit</button>'
    + (drills.length ? '<button data-layer="drills" aria-pressed="true">Drilling</button>' : "")
    + '<button data-layer="targets" aria-pressed="true">Targets</button><button data-layer="claims" aria-pressed="true">Claim</button></div>'
    + '<div class="mapfacts">' + (m.geo.place ? "<div><b>" + esc(m.geo.place) + "</b></div>" : "") + (drills.length ? "<div>" + drills.length + " holes plotted</div>" : "") + "<div>District schematic</div></div>"
    + '<div class="maptip"></div><svg viewBox="0 0 500 700" preserveAspectRatio="xMidYMid slice">' + g + "</svg>";
  const svg = el.querySelector("svg"), tip = el.querySelector(".maptip");
  el.querySelectorAll(".maptools button").forEach((b) => { b.onclick = () => { const on = b.getAttribute("aria-pressed") !== "true"; b.setAttribute("aria-pressed", on ? "true" : "false"); const grp = svg.querySelector('[data-g="' + b.dataset.layer + '"]'); if (grp) grp.style.display = on ? "" : "none"; }; });
  el.querySelectorAll(".drillhole").forEach((c) => {
    c.addEventListener("mouseenter", () => { tip.textContent = c.dataset.h + (c.dataset.v ? " · " + c.dataset.v : ""); tip.style.opacity = "1"; c.setAttribute("r", "7"); });
    c.addEventListener("mousemove", (ev) => { const r = el.getBoundingClientRect(); tip.style.left = (ev.clientX - r.left) + "px"; tip.style.top = (ev.clientY - r.top) + "px"; });
    c.addEventListener("mouseleave", () => { tip.style.opacity = "0"; c.setAttribute("r", "4.5"); });
  });
  // ── signature entrance: the claim boundary surveys itself in; drill holes fade + ping in sequence
  //    (opacity only — robust; two rAFs guarantee the initial frame paints before the transition). ──
  if (matchMedia("(prefers-reduced-motion:reduce)").matches) return;
  const claimP = el.querySelector('[data-g="claims"] path');
  const dots = el.querySelectorAll(".drillhole"), targ = el.querySelector('[data-g="targets"]'), dep = el.querySelector('[data-g="deposit"]');
  if (claimP) { const L = claimP.getTotalLength(); claimP.style.strokeDasharray = L; claimP.style.strokeDashoffset = L; }
  if (dep) { dep.style.opacity = "0"; dep.style.transition = "opacity .8s ease .55s"; }
  if (targ) { targ.style.opacity = "0"; targ.style.transition = "opacity .8s ease 1.4s"; }
  dots.forEach((c, i) => { c.style.opacity = "0"; c.style.transition = "opacity .4s ease " + (0.95 + i * 0.08) + "s"; });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (claimP) { claimP.style.transition = "stroke-dashoffset 1.5s cubic-bezier(.65,0,.35,1) .15s"; claimP.style.strokeDashoffset = "0"; }
    if (dep) dep.style.opacity = "1";
    if (targ) targ.style.opacity = "1";
    dots.forEach((c) => { c.style.opacity = "1"; });
  }));
}
// ATLAS (V5) — a premium interactive FIELD ATLAS. Consumes the SAME canonical story as Monolith
// (_confStory) but tells it through geography with varied cartographic compositions (map, index,
// field plate, technical insert, portfolio map, treasury ledger, survey traverse, legend, roster,
// pullback). Motion = arrival-triggered "registration" per chapter, not Monolith's continuous scrub.
function Atlas({ m }) {
  const rootRef = useRef(null);
  useEffect(() => {
    const root = rootRef.current; if (!root) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) e.target.classList.add("on"); }), { threshold: 0.22 });
    root.querySelectorAll(".atx-ch").forEach((c) => io.observe(c));
    const first = root.querySelector(".atx-ch"); if (first) setTimeout(() => first.classList.add("on"), 40);
    return () => io.disconnect();
  }, [m]);

  const { pool, flag, flagImg, best, cats, why, region, hook, facts, econ, disc, portHead, ctaFeatures } = _confStory(m);
  const heroImg = m.images.hero || pool[0] || "";
  const flagIdx = Math.max(0, m.projects.indexOf(flag));
  const coordLabel = (m.geo.lat != null && m.geo.lng != null)
    ? `${Math.abs(m.geo.lat).toFixed(0)}°${m.geo.lat >= 0 ? "N" : "S"} ${Math.abs(m.geo.lng).toFixed(0)}°${m.geo.lng >= 0 ? "E" : "W"}`
    : (region ? region.toUpperCase() : "");
  const rosterImg = pool.find((u) => u && u !== flagImg && u !== heroImg) || flagImg || heroImg;
  const projImg = (p, i) => p.image || (pool.length ? pool[(i + 2) % pool.length] : "");
  const cat0 = cats[0];
  const anno = [[m.heroStat && m.heroStat.context, "Grade × tonnes"], [flag.ownership, "Ownership"], [flag.land, "Land position"], [flag.stage, "Stage"]].filter((a) => a[0]);
  const frame = (<div className="atx-frame" aria-hidden="true"><i className="tl" /><i className="tr" /><i className="bl" /><i className="br" /></div>);
  return (
    <div className="atx" ref={rootRef}>
      {/* CH1 TITLE SHEET — an atlas cover: the company name owns clean space; a contained locator figure
          places it in the world. No decorative line crosses the primary type. */}
      <section className="atx-ch atx-title">
        {frame}<div className="atx-plateno">Sheet 01 · Cover</div>
        <div className="atx-title-meta atx-reg">Field atlas{coordLabel ? " · " + coordLabel : ""}</div>
        <div className="atx-title-grid">
          <div className="atx-title-copy">
            {hook && <div className="atx-eyebrow atx-reg">{hook}</div>}
            <h1 className="atx-loc-name atx-reg d1">{m.name}</h1>
            {m.tagline && <p className="atx-title-tag atx-reg d2">{m.tagline}</p>}
            {m.tickerLine && <span className="ticker atx-reg d3" style={{ marginTop: 24 }}><span className="dot" />{m.tickerLine}</span>}
          </div>
          {region && (
            <figure className="atx-title-fig atx-reg d2">
              <div className="atx-title-map"><AtxMap projects={m.projects} region={region} only={flagIdx} /></div>
              <figcaption>{flag.location || region} · schematic locator</figcaption>
            </figure>
          )}
        </div>
      </section>

      {/* CH2 FIELD INDEX — the company at a glance as atlas front-matter with dotted leaders */}
      {facts.length > 0 && (
        <section className="atx-ch">
          {frame}<div className="atx-plateno">Sheet 02 · Index</div>
          <div className="atx-in">
            <div className="atx-eyebrow atx-reg">The company at a glance</div>
            <div className="atx-index">
              {facts.map((f, i) => (
                <div className="atx-ix-row atx-reg" key={i} style={{ transitionDelay: (0.1 + i * 0.1) + "s" }}>
                  <span className="atx-ix-plate">{String(i + 1).padStart(2, "0")}</span>
                  <span style={{ display: "flex", alignItems: "baseline", gap: 12 }}><span className="ixk">{f.k}</span><span className="ixlead" style={{ flex: 1 }} /></span>
                  <span className="ixv">{f.v}</span>
                </div>
              ))}
            </div>
            {m.thesis && <p className="atx-index-sup atx-reg d4">{m.thesis}</p>}
          </div>
        </section>
      )}

      {/* CH3 FLAGSHIP FIELD PLATE — annotated full-bleed project photograph */}
      {(flag.name || m.heroStat) && (
        <section className="atx-ch atx-plate">
          <div className="atx-plate-photo">{flagImg ? <img src={flagImg} alt="" /> : null}</div>
          {frame}<div className="atx-plateno" style={{ color: "#e6e2da" }}>Sheet 03 · Flagship</div>
          <div className="atx-plate-body">
            <div className="atx-eyebrow atx-reg" style={{ color: "#f2ede2" }}>{[flag.name, flag.location].filter(Boolean).join(" · ")}</div>
            {m.heroStat && <div className="atx-plate-title atx-reg d1">{m.heroStat.value}</div>}
            {anno.length > 0 && (
              <div className="atx-anno">
                {anno.map((a, i) => <div className="a atx-reg" key={i} style={{ transitionDelay: (0.18 + i * 0.1) + "s" }}><div className="av">{a[0]}</div><div className="ak">{a[1]}</div></div>)}
              </div>
            )}
            {flag.overview && <div className="atx-plate-line atx-reg d4">{flag.overview}</div>}
          </div>
        </section>
      )}

      {/* CH4 FIELD RECORD — the strongest intercept as an assay/core-log ribbon. Visualises ONLY the
          reported facts (grade · interval width · hole id) — no depth, inclination or adjacent holes. */}
      {best && (
        <section className="atx-ch atx-fieldrec-ch">
          {frame}<div className="atx-plateno">Sheet 04 · Field record</div>
          <div className="atx-in">
            <div className="atx-eyebrow atx-reg">Strongest intercept · {best.hole}</div>
            <div className="atx-fieldrec">
              <div className="atx-fieldrec-grade atx-reg d1">{best.grade}</div>
              {best.interval && <div className="atx-fieldrec-sub atx-reg d1">Over {best.interval} of mineralisation</div>}
              {best.interval && (
                <div className="atx-corelog atx-reg d2">
                  <div className="clbar"><div className="clfill" /></div>
                  <div className="clscale"><span>0 m</span><span>Interval · {best.interval}</span></div>
                </div>
              )}
              <div className="atx-fieldrec-note atx-reg d3">Reported assay interval, hole {best.hole}. Ribbon shows interval width only — no hole depth, inclination, position or adjacent results are implied.</div>
            </div>
          </div>
        </section>
      )}

      {/* CH5 PORTFOLIO — the projects as indexed atlas ENTRIES (letter · image · factual record),
          alternating and image-forward. Dynamic: works for one project or many, no manufactured map. */}
      {m.projects.length > 0 && (
        <section className="atx-ch atx-portfolio">
          {frame}<div className="atx-plateno">Sheet 05 · Portfolio</div>
          <div className="atx-in">
            <div className="atx-eyebrow atx-reg">{portHead}</div>
            <div className="atx-entries">
              {m.projects.map((p, i) => (
                <article className="atx-entry atx-reg" key={i} style={{ transitionDelay: (0.06 + i * 0.06) + "s" }}>
                  <div className="atx-entry-fig">
                    {projImg(p, i) ? <img src={projImg(p, i)} alt="" /> : <div className="atx-entry-figx">{String.fromCharCode(65 + i)}</div>}
                    <span className="atx-entry-ix">Entry {String.fromCharCode(65 + i)}</span>
                  </div>
                  <div className="atx-entry-body">
                    {(p.location || region) && <div className="atx-entry-loc">{p.location || region}</div>}
                    <h3 className="atx-entry-name">{p.name}</h3>
                    <div className="atx-entry-meta">{[p.stage, p.commodity, p.ownership && p.ownership + " owned", p.land].filter(Boolean).join("   ·   ")}</div>
                    {p.overview && <p className="atx-entry-desc">{p.overview}</p>}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CH6 TREASURY LEDGER — a ruled field-accounts page (deliberately not a dashboard) */}
      {econ.length > 0 && (
        <section className="atx-ch">
          {frame}<div className="atx-plateno">Sheet 06 · Treasury</div>
          <div className="atx-in">
            <div className="atx-eyebrow atx-reg">Treasury &amp; economics</div>
            <h2 className="atx-h atx-reg d1" style={{ marginTop: 10 }}>Register of position.</h2>
            <div className="atx-treg-head atx-reg d1"><span>No.</span><span>Entry</span><span>As recorded</span></div>
            <div className="atx-ledger">
              {econ.map((e, i) => (
                <div className="atx-led-row atx-reg" key={i} style={{ transitionDelay: (0.12 + i * 0.07) + "s" }}>
                  <span className="ln">{String(i + 1).padStart(2, "0")}</span><span className="lk">{e.k}</span><span className="lv">{e.v}</span>
                </div>
              ))}
            </div>
            <div className="atx-led-note atx-reg d4">Recorded from latest disclosure. Full capital structure &amp; analysis on MineEx.</div>
          </div>
        </section>
      )}

      {/* CH7 TRAVERSE — a survey route from the current stage to the milestone (Atlas's catalyst) */}
      {cat0 && (
        <section className="atx-ch">
          {frame}<div className="atx-plateno">Sheet 07 · Traverse</div>
          <div className="atx-in">
            <div className="atx-eyebrow atx-reg">What happens next</div>
            <h2 className="atx-h atx-reg d1" style={{ marginTop: 10 }}>The route ahead.</h2>
            <div className="atx-route atx-reg d2">
              <svg viewBox="0 0 100 16" preserveAspectRatio="none"><path className="rline" d="M4 8 H96" /><path className="rprog" pathLength="1" d="M4 8 H96" /><circle className="rst here" cx="4" cy="8" r="2.6" /><circle className="rst" cx="50" cy="8" r="2.6" /><circle className="rst" cx="96" cy="8" r="2.6" /></svg>
            </div>
            <div className="atx-stations">
              <div className="st atx-reg d2"><div className="stt">Now</div><div className="stl">{flag.stage || "In progress"}</div><div className="std">Advancing the flagship toward a study decision.</div></div>
              <div className="st atx-reg d3"><div className="stt">{cat0.timing || "Next"}</div><div className="stl">{cat0.label}</div>{cat0.impact && <div className="std">{cat0.impact}</div>}</div>
              {/construction/i.test(cat0.impact || "") && <div className="st atx-reg d4"><div className="stt">Then</div><div className="stl">Construction decision</div><div className="std">The milestone the study is built to inform.</div></div>}
            </div>
          </div>
        </section>
      )}

      {/* CH8 INVESTMENT CASE — a field-guide legend: symbol · label · reason */}
      {why.length > 0 && (
        <section className="atx-ch">
          {frame}<div className="atx-plateno">Sheet 08 · Legend</div>
          <div className="atx-in">
            <div className="atx-eyebrow atx-reg">The investment case</div>
            <div className="atx-legend">
              {why.map((w, i) => { const lab = _confReasonLabel(w, i); return (
                <div className="atx-leg-row atx-reg" key={i} style={{ transitionDelay: (0.1 + i * 0.1) + "s" }}>
                  <span className="legsym">{_atxLegSym(lab)}</span><span className="legl">{lab}</span><span className="legd">{w}</span>
                </div>
              ); })}
            </div>
          </div>
        </section>
      )}

      {/* CH9 FIELD ROSTER — the team as an expedition roster over a field photograph */}
      {m.team.length > 0 && (
        <section className="atx-ch atx-roster-ch">
          <div className="atx-roster-photo">{rosterImg ? <img src={rosterImg} alt="" /> : null}</div>
          {frame}<div className="atx-plateno" style={{ color: "#e6e2da" }}>Sheet 09 · Field roster</div>
          <div className="atx-roster-body">
            <div className="atx-eyebrow atx-reg" style={{ color: "#f2ede2" }}>Leadership</div>
            {disc && <p className="atx-roster-intro atx-reg d1">A leadership team spanning {disc}.</p>}
            <div className="atx-roster">
              {m.team.slice(0, 8).map((p, i) => (
                <div className="atx-rmem atx-reg" key={i} style={{ transitionDelay: (0.05 * i) + "s" }}>
                  <span className="rid">{mn2Initials(p.name)}</span>
                  <div><div className="rnm">{p.name}</div>{p.role && <div className="rrl">{p.role}</div>}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CH10 COLOPHON — pull back to the region as a small contained locator, then the MineEx CTA */}
      <section className="atx-ch atx-close">
        {frame}<div className="atx-plateno">Sheet 10 · Follow</div>
        <div className="atx-close-body">
          {region && <figure className="atx-close-fig atx-reg"><AtxMap projects={m.projects} region={region} only={flagIdx} /></figure>}
          <div className="atx-eyebrow atx-reg d1">Follow the story</div>
          <div className="atx-close-name atx-reg d2">{m.name}</div>
          <div className="atx-close-list atx-reg d3">{ctaFeatures.map((x) => <span key={x}>{x}</span>)}</div>
          <div className="atx-close-go atx-reg d3">Follow on MineEx →</div>
        </div>
      </section>
    </div>
  );
}

// ── shared sections (used by Monolith, Atlas, and templates to come) ──
function HeroStat({ m }) {
  if (!m.heroStat) return null;
  return (
    <section className="bignum"><div className="wrap">
      <div className="rise"><div className="huge">{splitStat(m.heroStat.value)}</div>
        <div className="cap">{m.heroStat.label}{m.heroStat.context ? " · " + m.heroStat.context : ""}</div></div>
      {m.highlights.length > 1 ? <div className="reslegend rise">{m.highlights.slice(0, 3).map((h, i) => <span key={i}><b>{h.value}</b> {h.label}</span>)}</div> : null}
    </div></section>
  );
}
function Flagship({ m }) {
  if (!m.flagship.drills.length) return null;
  return (
    <section><div className="wrap">
      <div className="kick rise"><span className="eyebrow">Flagship · The evidence</span><span className="ln" /></div>
      <div className="flag rise">
        <div className="media">{m.images.field ? <img src={m.images.field} alt="" /> : <div className="ph" />}<span className="lab">{m.flagship.name || m.shortName}</span></div>
        <div className="data">
          <h3>{m.flagship.name || "Flagship project"}</h3>{m.flagship.sub && <div className="sub">{m.flagship.sub}</div>}
          <table className="drill"><thead><tr><th>Hole</th><th style={{ textAlign: "right" }}>Interval</th><th style={{ textAlign: "right" }}>Grade</th></tr></thead>
            <tbody>{m.flagship.drills.slice(0, 5).map((d, i) => <tr key={i}><td className="hole">{d.hole || "—"}</td><td className="int tabnum">{d.interval || "—"}</td><td className="grade tabnum">{d.grade || "—"}</td></tr>)}</tbody></table>
        </div>
      </div>
    </div></section>
  );
}
function FollowBlock({ m }) {
  return (
    <section className="follow"><div className="wrap"><div className="rise">
      <h2>Follow {m.shortName}<br />on MineEx.</h2>
      <div className="cta">Every update, delivered</div>
    </div></div></section>
  );
}
function Projects({ m }) {
  if (!m.projects.length) return null;
  return (
    <section><div className="wrap">
      <div className="kick rise"><span className="eyebrow">Portfolio · {m.projects.length} projects</span><span className="ln" /></div>
      <div className="proj rise">{m.projects.map((p, i) => (
        <div className="pr" key={i}><div>
          <div className="pn">{p.name}</div>
          <div className="pmeta">{[p.location, p.commodity, p.ownership && p.ownership + " owned", p.land].filter(Boolean).join(" · ")}</div>
          {p.overview && <div className="po">{p.overview}</div>}
        </div>{p.stage && <div className="ptag">{p.stage}</div>}</div>
      ))}</div>
    </div></section>
  );
}
function Progress({ m }) {
  const ref = useRef(null);
  const pct = Math.max(6, Math.min(100, Math.round((parseFloat(m.progress.current) || 0) / (parseFloat(m.progress.total) || 1) * 100)));
  useEffect(() => { const el = ref.current; if (el) setTimeout(() => { el.style.width = pct + "%"; }, 80); }, []);
  return (<div className="prog rise"><div className="bar"><i ref={ref} style={{ width: 0 }} /></div><div className="pl"><span>{m.progress.headline || "Progress"}</span><span>{m.progress.current} of {m.progress.total} {m.progress.unit}</span></div></div>);
}
function Capital({ m }) {
  if (!m.capital.length && !m.financings.length && !m.progress) return null;
  return (
    <section><div className="wrap">
      <div className="kick rise"><span className="eyebrow">Capital</span><span className="ln" /></div>
      {m.capital.length > 0 && <div className="capgrid rise">{m.capital.map(([k, v], i) => <div className="cc" key={i}><div className="ck">{k}</div><div className="cv">{v}</div></div>)}</div>}
      {m.progress && <Progress m={m} />}
    </div></section>
  );
}
function Catalyst({ m }) {
  const c = m.catalysts[0]; if (!c) return null;
  return (<section><div className="wrap"><div className="cat rise"><div><div className="ci">Next catalyst{c.timing ? " · " + c.timing : ""}</div><div className="cn">{c.label}</div>{c.impact && <div className="cw">{c.impact}</div>}</div></div></div></section>);
}
function Timeline({ m }) {
  if (!m.timeline.length) return null;
  return (
    <section><div className="wrap">
      <div className="kick rise"><span className="eyebrow">Milestones</span><span className="ln" /></div>
      <div className="tl">{m.timeline.map((t, i) => <div className="te rise" key={i}><div className="td">{(t.date || "").slice(0, 10)}</div><div><div className="th">{t.headline}</div>{t.why && <div className="tw">{t.why}</div>}</div></div>)}</div>
    </div></section>
  );
}
function WhyBlock({ m }) {
  if (!m.why.length) return null;
  return (
    <section><div className="wrap">
      <div className="kick rise"><span className="eyebrow">Why invest</span><span className="ln" /></div>
      <div className="why">{m.why.map((w, i) => <div className="row rise" key={i}><span className="rn">{String(i + 1).padStart(2, "0")}</span><p>{w}</p></div>)}</div>
    </div></section>
  );
}
function TeamBlock({ m }) {
  if (!m.team.length) return null;
  return (
    <section><div className="wrap">
      <div className="kick rise"><span className="eyebrow">Leadership · {m.team.length}</span><span className="ln" /></div>
      <div className="team rise">{m.team.slice(0, 9).map((p, i) => <div className="p" key={i}><div className="nm">{p.name}</div><div className="rl">{p.role}</div></div>)}</div>
    </div></section>
  );
}
// The full investor body — portfolio, capital, catalyst, milestones, thesis, leadership. Any template
// can append this to become a complete deck while keeping its own signature hero.
function DeepDeck({ m }) {
  return (<><Projects m={m} /><Capital m={m} /><Catalyst m={m} /><Timeline m={m} /><WhyBlock m={m} /><TeamBlock m={m} /></>);
}
// Keynote's body — one idea per full-screen scene, in its own idiom.
function KeynoteBody({ m }) {
  return (
    <>
      {m.projects.length > 0 && <section className="kn-scene"><div className="knc"><div className="sub rise">The portfolio</div><div className="kn-list rise" style={{ transitionDelay: ".15s" }}>{m.projects.map((p, i) => <div className="kn-li" key={i}><b>{p.name}</b><span>{[p.stage, p.commodity, p.location].filter(Boolean).join(" · ")}</span></div>)}</div></div></section>}
      {m.capital.length > 0 && <section className="kn-scene"><div className="knc"><div className="sub rise">Capital</div><div className="kn-cap rise" style={{ transitionDelay: ".15s" }}>{m.capital.slice(0, 4).map(([k, v], i) => <div key={i}><b>{v}</b><span>{k}</span></div>)}</div></div></section>}
      {m.catalysts[0] && <section className="kn-scene"><div className="knc"><div className="sub rise">Next catalyst{m.catalysts[0].timing ? " · " + m.catalysts[0].timing : ""}</div><h2 className="rise scale" style={{ fontSize: "clamp(40px,7vw,110px)", marginTop: 18 }}>{m.catalysts[0].label}</h2></div></section>}
      {m.team.length > 0 && <section className="kn-scene"><div className="knc"><div className="sub rise">Leadership</div><div className="kn-mast rise" style={{ transitionDelay: ".15s" }}>{m.team.slice(0, 8).map((p, i) => <span key={i}>{p.name}</span>)}</div></div></section>}
    </>
  );
}
// Index's body — ultra-minimal lists, in its own idiom.
function IndexBody({ m }) {
  return (
    <div className="idx-body">
      {m.projects.length > 0 && <div className="idx-sec"><div className="idx-k">Portfolio · {m.projects.length}</div>{m.projects.map((p, i) => <div className="idx-proj" key={i}><span className="idx-n">{p.name}</span><span className="idx-m">{[p.stage, p.commodity].filter(Boolean).join(" · ")}</span></div>)}</div>}
      {m.capital.length > 0 && <div className="idx-sec"><div className="idx-k">Capital</div><div className="idx-cap">{m.capital.map(([k, v], i) => <span key={i}><b>{v}</b> {k}</span>)}</div></div>}
      {m.timeline.length > 0 && <div className="idx-sec"><div className="idx-k">Milestones</div>{m.timeline.slice(0, 5).map((t, i) => <div className="idx-tl" key={i}><span className="idx-d">{(t.date || "").slice(0, 7)}</span>{t.headline}</div>)}</div>}
      {m.team.length > 0 && <div className="idx-sec"><div className="idx-k">Leadership · {m.team.length}</div><div className="idx-team">{m.team.map((p, i) => <span key={i}>{p.name}</span>)}</div></div>}
    </div>
  );
}
// Atlas's body — a cartographic field register: every asset a located, coordinated entry.
function AtlasBody({ m }) {
  const coord = (p) => [p.location, p.commodity, p.ownership && p.ownership + " owned", p.land].filter(Boolean);
  return (
    <div className="wrap ab-body">
      {m.projects.length > 0 && <div className="ab-sec">
        <div className="ab-h">Field register · {m.projects.length} assets</div>
        {m.projects.map((p, i) => (
          <div className="ab-proj rise up" key={i} style={{ transitionDelay: (i * 0.06) + "s" }}>
            <div className="abn">{String(i + 1).padStart(2, "0")}</div>
            <div><div className="abt">{p.name}</div>{p.stage && <div className="abn" style={{ marginTop: 6 }}>{p.stage}</div>}{p.overview && <div className="abo">{p.overview}</div>}</div>
            <div className="abm">{coord(p).map((c, k) => <div key={k}>{c}</div>)}</div>
          </div>
        ))}
      </div>}
      {m.capital.length > 0 && <div className="ab-sec">
        <div className="ab-h">Capital position</div>
        <div className="ab-ribbon rise">{m.capital.map(([k, v], i) => <div className="rc" key={i}><div className="k">{k}</div><div className="v">{v}</div></div>)}</div>
      </div>}
      {m.catalysts[0] && <div className="ab-sec">
        <div className="ab-h">Next catalyst{m.catalysts[0].timing ? " · " + m.catalysts[0].timing : ""}</div>
        <div className="ab-proj rise" style={{ gridTemplateColumns: "1fr" }}><div><div className="abt">{m.catalysts[0].label}</div>{m.catalysts[0].impact && <div className="abo">{m.catalysts[0].impact}</div>}</div></div>
      </div>}
      {m.timeline.length > 0 && <div className="ab-sec">
        <div className="ab-h">Log</div>
        {m.timeline.map((t, i) => (
          <div className="ab-proj rise up" key={i} style={{ transitionDelay: (i * 0.05) + "s" }}>
            <div className="abn">{(t.date || "").slice(0, 10)}</div>
            <div><div className="abt" style={{ fontSize: "clamp(18px,2vw,26px)" }}>{t.headline}</div>{t.why && <div className="abo">{t.why}</div>}</div><div />
          </div>
        ))}
      </div>}
      {m.why.length > 0 && <div className="ab-sec">
        <div className="ab-h">Why invest</div>
        {m.why.map((w, i) => <div className="ab-proj rise up" key={i} style={{ gridTemplateColumns: "56px 1fr", transitionDelay: (i * 0.06) + "s" }}><div className="abn">{String(i + 1).padStart(2, "0")}</div><div className="abo" style={{ fontSize: 17, color: "var(--ink)" }}>{w}</div></div>)}
      </div>}
      {m.team.length > 0 && <div className="ab-sec">
        <div className="ab-h">Leadership · {m.team.length}</div>
        <div className="ab-ribbon rise">{m.team.slice(0, 12).map((p, i) => <div className="rc" key={i}><div className="v" style={{ fontFamily: "var(--sans,inherit)", fontSize: 16 }}>{p.name}</div><div className="k" style={{ marginTop: 6 }}>{p.role}</div></div>)}</div>
      </div>}
    </div>
  );
}
// Strata's body — the deck read as a core log: every section a stacked band at descending depth.
function StrataBody({ m }) {
  let depth = 0; const nd = () => { const d = depth; depth += 250; return d === 0 ? "0 m" : "−" + d + " m"; };
  return (
    <div className="wrap">
      {m.projects.map((p, i) => (
        <div className="sb-band rise up" key={"p" + i} style={{ transitionDelay: (i * 0.05) + "s" }}>
          <span className="depth">{nd()}</span>
          <div className="bt">{p.name}</div>
          <div className="bm">{[p.stage, p.commodity, p.location, p.ownership && p.ownership + " owned"].filter(Boolean).join("  ·  ")}</div>
          {p.overview && <div className="bo">{p.overview}</div>}
        </div>
      ))}
      {m.capital.length > 0 && <div className="sb-band rise up"><span className="depth">{nd()}</span><div className="bt">Capital</div>
        <div className="sb-cap" style={{ marginLeft: 78 }}>{m.capital.map(([k, v], i) => <div className="c" key={i}><div className="k">{k}</div><div className="v">{v}</div></div>)}</div>
      </div>}
      {m.catalysts[0] && <div className="sb-band rise up"><span className="depth">{nd()}</span><div className="bt">{m.catalysts[0].label}</div><div className="bm">Next catalyst{m.catalysts[0].timing ? "  ·  " + m.catalysts[0].timing : ""}</div>{m.catalysts[0].impact && <div className="bo">{m.catalysts[0].impact}</div>}</div>}
      {m.timeline.length > 0 && <div className="sb-band rise up"><span className="depth">{nd()}</span><div className="bt">Milestones</div>
        <div style={{ marginLeft: 78, marginTop: 14 }}>{m.timeline.map((t, i) => <div key={i} className="bm" style={{ margin: "0 0 10px", color: "var(--ink)" }}><span style={{ color: "var(--accent)", marginRight: 12 }}>{(t.date || "").slice(0, 10)}</span>{t.headline}</div>)}</div>
      </div>}
      {m.why.length > 0 && <div className="sb-band rise up"><span className="depth">{nd()}</span><div className="bt">Why invest</div>
        <div style={{ marginLeft: 78, marginTop: 14 }}>{m.why.map((w, i) => <div className="bo" key={i} style={{ margin: "0 0 12px", maxWidth: "62ch" }}><b style={{ color: "var(--accent)", marginRight: 10 }}>{String(i + 1).padStart(2, "0")}</b>{w}</div>)}</div>
      </div>}
      {m.team.length > 0 && <div className="sb-band rise up"><span className="depth">{nd()}</span><div className="bt">Leadership</div>
        <div className="bo" style={{ marginLeft: 78 }}>{m.team.slice(0, 12).map((p, i) => <span key={i}>{p.name}{p.role ? " (" + p.role + ")" : ""}{i < Math.min(12, m.team.length) - 1 ? "   ·   " : ""}</span>)}</div>
      </div>}
    </div>
  );
}
// Pulse's body — cinematic, alternating full-bleed features that keep the ambient motion going.
function PulseBody({ m }) {
  const imgs = [m.images.field, m.images.camp, m.images.hero].filter(Boolean);
  return (
    <>
      {m.projects.map((p, i) => (
        <div className={"pb-feat" + (i % 2 ? " rev" : "")} key={i}>
          <div className="pbimg">{imgs[i % imgs.length] ? <img src={imgs[i % imgs.length]} alt="" /> : <div className="ph" />}</div>
          <div className="pbtxt">
            <div className="pbk rise">{[p.stage, p.commodity].filter(Boolean).join(" · ") || "Asset " + (i + 1)}</div>
            <h2 className="pbt rise blur" style={{ transitionDelay: ".1s" }}>{p.name}</h2>
            {p.location && <div className="pbk rise" style={{ transitionDelay: ".2s", color: "var(--dim)" }}>{p.location}</div>}
            {p.overview && <p className="pbo rise" style={{ transitionDelay: ".25s" }}>{p.overview}</p>}
          </div>
        </div>
      ))}
      {m.capital.length > 0 && <section className="ob2-sec"><div className="wrap"><div className="ob2-k rise">Capital</div>
        <div className="ob2-cap">{m.capital.map(([k, v], i) => <div className="rise" key={i} style={{ transitionDelay: (i * 0.06) + "s" }}><b>{v}</b><span>{k}</span></div>)}</div></div></section>}
      {m.catalysts[0] && <div className="pb-feat"><div className="pbimg">{imgs[0] ? <img src={imgs[0]} alt="" /> : <div className="ph" />}</div>
        <div className="pbtxt"><div className="pbk rise">Next catalyst{m.catalysts[0].timing ? " · " + m.catalysts[0].timing : ""}</div><h2 className="pbt rise blur" style={{ transitionDelay: ".1s" }}>{m.catalysts[0].label}</h2>{m.catalysts[0].impact && <p className="pbo rise" style={{ transitionDelay: ".2s" }}>{m.catalysts[0].impact}</p>}</div></div>}
      {m.timeline.length > 0 && <section className="ob2-sec"><div className="wrap"><div className="ob2-k rise">Milestones</div>
        <div className="ob2-list">{m.timeline.map((t, i) => <div className="ol rise" key={i} style={{ transitionDelay: (i * 0.04) + "s", textAlign: "left" }}><span className="od">{(t.date || "").slice(0, 10)}</span>{t.headline}</div>)}</div></div></section>}
      {m.team.length > 0 && <section className="ob2-sec"><div className="wrap"><div className="ob2-k rise">Leadership</div>
        <div className="ob2-cap">{m.team.slice(0, 10).map((p, i) => <div className="rise" key={i} style={{ transitionDelay: (i * 0.05) + "s" }}><b style={{ fontSize: "clamp(18px,2vw,26px)" }}>{p.name}</b><span>{p.role}</span></div>)}</div></div></section>}
    </>
  );
}
// Orbit's body — everything centered on the axis, like marks turning past on the globe.
function OrbitBody({ m }) {
  return (
    <div className="wrap">
      {m.projects.length > 0 && <section className="ob2-sec"><div className="ob2-k rise">Portfolio · {m.projects.length}</div>
        {m.projects.map((p, i) => <div className="ob2-proj rise scale" key={i} style={{ transitionDelay: (i * 0.07) + "s" }}><div className="on">{p.name}</div><div className="om">{[p.stage, p.commodity, p.location].filter(Boolean).join("  ·  ")}</div></div>)}
      </section>}
      {m.capital.length > 0 && <section className="ob2-sec"><div className="ob2-k rise">Capital</div>
        <div className="ob2-cap">{m.capital.map(([k, v], i) => <div className="rise" key={i} style={{ transitionDelay: (i * 0.06) + "s" }}><b>{v}</b><span>{k}</span></div>)}</div></section>}
      {m.catalysts[0] && <section className="ob2-sec"><div className="ob2-k rise">Next catalyst{m.catalysts[0].timing ? " · " + m.catalysts[0].timing : ""}</div>
        <div className="ob2-proj rise scale"><div className="on">{m.catalysts[0].label}</div>{m.catalysts[0].impact && <div className="om" style={{ maxWidth: "50ch", margin: "14px auto 0" }}>{m.catalysts[0].impact}</div>}</div></section>}
      {m.timeline.length > 0 && <section className="ob2-sec"><div className="ob2-k rise">Milestones</div>
        <div className="ob2-list">{m.timeline.map((t, i) => <div className="ol rise" key={i} style={{ transitionDelay: (i * 0.04) + "s" }}><span className="od">{(t.date || "").slice(0, 10)}</span>{t.headline}</div>)}</div></section>}
      {m.why.length > 0 && <section className="ob2-sec"><div className="ob2-k rise">Why invest</div>
        <div className="ob2-list">{m.why.map((w, i) => <div className="ol rise" key={i} style={{ transitionDelay: (i * 0.05) + "s" }}><span className="od">{String(i + 1).padStart(2, "0")}</span>{w}</div>)}</div></section>}
      {m.team.length > 0 && <section className="ob2-sec"><div className="ob2-k rise">Leadership · {m.team.length}</div>
        <div className="ob2-cap">{m.team.slice(0, 10).map((p, i) => <div className="rise" key={i} style={{ transitionDelay: (i * 0.05) + "s" }}><b style={{ fontSize: "clamp(18px,2vw,26px)" }}>{p.name}</b><span>{p.role}</span></div>)}</div></section>}
    </div>
  );
}

// ── Template 03 · LEDGER — data-forward editorial. The grade chart is generated from REAL drill
// intercepts in the model (never a fabricated distribution). ──
function buildGradeChart(el, drills) {
  if (!el) return;
  const G = (drills || []).map((d) => ({ label: String(d.hole || "").split("-").pop(), v: parseFloat(String(d.grade || "").replace(/[^0-9.]/g, "")) }))
    .filter((x) => isFinite(x.v) && x.v > 0).slice(0, 6);
  if (!G.length) { el.innerHTML = '<div style="color:var(--dim);font-size:13px">No numeric intercepts disclosed.</div>'; return; }
  const mx = Math.max.apply(null, G.map((x) => x.v)), H = 116;
  el.innerHTML = G.map((d) => '<div class="gb"><span class="gv">' + d.v + '</span><i style="height:0" data-h="' + Math.max(6, Math.round(d.v / mx * H)) + '"></i><span class="gl">' + esc(d.label) + "</span></div>").join("");
  setTimeout(() => el.querySelectorAll(".gb i").forEach((i) => { i.style.height = i.dataset.h + "px"; }), 60);
}
// LEDGER — an analytical investor workstation. Comparison, ratios and charts generated from the REAL
// model (dilution, share-structure proportions, intercept chart — never fabricated). Strong numeric
// typography, no metric cards. Wow moments: the grade chart draws, the project matrix cross-highlights,
// the capital structure resolves into a real dilution/ownership breakdown.
const _pnum = (s) => { const m = String(s || "").match(/([\d.]+)/); return m ? parseFloat(m[1]) : NaN; };
function Ledger({ m }) {
  const gcRef = useRef(null), barRef = useRef(null);
  useEffect(() => { buildGradeChart(gcRef.current, m.flagship.drills); }, [m]);
  useEffect(() => { const el = barRef.current; if (el) setTimeout(() => el.querySelectorAll(".track i").forEach((i) => { i.style.width = i.dataset.w + "%"; }), 120); }, [m]);
  const cap = Object.fromEntries(m.capital);
  const basic = _pnum(cap["Shares outstanding"]), fd = _pnum(cap["Fully diluted"]);
  const dilution = isFinite(basic) && isFinite(fd) && basic > 0 ? Math.round((fd - basic) / basic * 100) : null;
  const shareRows = [["Basic", cap["Shares outstanding"]], ["Options", cap["Options"]], ["Warrants", cap["Warrants"]], ["Fully diluted", cap["Fully diluted"]]]
    .filter((r) => r[1]).map((r) => ({ k: r[0], v: r[1], n: _pnum(r[1]) }));
  const barMax = Math.max(...shareRows.map((r) => r.n).filter(isFinite), 1);
  const gm = (d) => _pnum(d.grade);
  const drills = m.flagship.drills || [];
  const bestHole = drills.slice().sort((a, b) => gm(b) - gm(a))[0];
  return (
    <div className="lw">
      <div className="lw-head">
        <div><div className="who rise">{m.name}{m.tickers[0] ? "  ·  " + m.tickers[0] : ""}{m.tickers[1] ? "  ·  " + m.tickers[1] : ""}</div>
          <h1 className="rise" style={{ transitionDelay: ".06s" }}>Investment analysis</h1></div>
        {m.heroStat && <div className="hero-fig rise" style={{ transitionDelay: ".12s" }}><div className="n">{splitStat(m.heroStat.value)}</div><div className="k">{m.heroStat.label}</div></div>}
      </div>

      <div className="lw-strip rise">
        {m.heroStat && m.heroStat.context && <div className="s"><div className="v">{m.heroStat.context.split("·")[0].trim()}</div><div className="k">Grade / tonnage</div></div>}
        {m.commodity && <div className="s"><div className="v">{m.commodity}</div><div className="k">Commodity</div></div>}
        {(m.geo.region || m.geo.place) && <div className="s"><div className="v" style={{ fontSize: "clamp(18px,2vw,24px)" }}>{m.geo.region || m.geo.place}</div><div className="k">Jurisdiction · {m.geo.country || "—"}</div></div>}
        {dilution != null && <div className="s"><div className="v">{dilution}%<span style={{ fontSize: ".5em", color: "var(--dim)", fontWeight: 600 }}> dil.</span></div><div className="k">Basic → fully diluted</div></div>}
      </div>

      {/* Evidence — real intercepts as a chart + intercept table */}
      {drills.length > 0 && (
        <div className="lw-sec"><div className="lw-sh"><span className="lx">01</span><h2>The evidence</h2><span className="note">disclosed intercepts</span></div>
          <div className="lw-2">
            <div>
              <table className="cmp"><thead><tr><th>Hole</th><th>Interval</th><th>Grade</th></tr></thead>
                <tbody>{drills.slice(0, 6).map((d, i) => <tr key={i} className={bestHole && d.hole === bestHole.hole ? "hi" : ""}><td>{d.hole || "—"}</td><td className="num">{d.interval || "—"}</td><td className="acc">{d.grade || "—"}</td></tr>)}</tbody></table>
            </div>
            <div><div className="lw-sh" style={{ marginBottom: 12 }}><span className="note" style={{ marginLeft: 0 }}>Grade · g/t, by hole</span></div>
              <div className="gchart" ref={gcRef} /></div>
          </div>
        </div>
      )}

      {/* Project comparison matrix */}
      {m.projects.length > 0 && (
        <div className="lw-sec"><div className="lw-sh"><span className="lx">02</span><h2>Portfolio, compared</h2><span className="note">{m.projects.length} assets</span></div>
          <table className="cmp"><thead><tr><th>Project</th><th>Stage</th><th>Commodity</th><th>Ownership</th><th>Land</th></tr></thead>
            <tbody>{m.projects.map((p, i) => <tr key={i} className={i === 0 ? "hi" : ""}>
              <td>{p.name}{p.location ? <span className="sub">{p.location}</span> : null}</td>
              <td className="num">{p.stage || "—"}</td><td className="num">{p.commodity || "—"}</td>
              <td className="acc">{p.ownership || "—"}</td><td className="num">{p.land || "—"}</td></tr>)}</tbody></table>
        </div>
      )}

      {/* Capital structure — ratios + proportional bars */}
      {m.capital.length > 0 && (
        <div className="lw-sec"><div className="lw-sh"><span className="lx">03</span><h2>Capital structure</h2><span className="note">share &amp; treasury</span></div>
          <div className="lw-2">
            <div className="ratio">{m.capital.map(([k, v], i) => <div className="rr" key={i}><span className="k">{k}</span><span className="v">{v}{k === "Fully diluted" && dilution != null ? <small>+{dilution}% vs basic</small> : null}</span></div>)}</div>
            {shareRows.length > 1 && <div className="lw-bars" ref={barRef}><div className="lw-sh" style={{ marginBottom: 6 }}><span className="note" style={{ marginLeft: 0 }}>Share structure · millions</span></div>
              {shareRows.map((r, i) => <div className="lb" key={i}><div className="lbt"><span>{r.k}</span><b>{r.v}</b></div><div className="track"><i data-w={isFinite(r.n) ? Math.round(r.n / barMax * 100) : 0} style={{ width: 0 }} /></div></div>)}</div>}
          </div>
        </div>
      )}

      {/* Progression + catalyst */}
      {(m.timeline.length > 0 || m.catalysts[0]) && (
        <div className="lw-sec"><div className="lw-sh"><span className="lx">04</span><h2>Progression</h2>{m.catalysts[0] && <span className="note">next · {m.catalysts[0].timing || "upcoming"}</span>}</div>
          <div className="lw-2">
            <table className="cmp"><thead><tr><th>Date</th><th style={{ textAlign: "left", paddingLeft: 24 }}>Milestone</th></tr></thead>
              <tbody>{m.timeline.slice(0, 6).map((t, i) => <tr key={i}><td className="num" style={{ whiteSpace: "nowrap" }}>{(t.date || "").slice(0, 10)}</td><td className="wrap" style={{ textAlign: "left", paddingLeft: 24, fontWeight: 400, fontSize: 14 }}>{t.headline}</td></tr>)}</tbody></table>
            {m.catalysts[0] && <div><div className="lw-sh" style={{ marginBottom: 10 }}><span className="note" style={{ marginLeft: 0 }}>Near-term catalyst</span></div>
              <div className="ratio"><div className="rr"><span className="k">{m.catalysts[0].timing || "Upcoming"}</span><span className="v" style={{ fontSize: 16 }}>{m.catalysts[0].label}</span></div>{m.catalysts[0].impact && <p style={{ fontSize: 14, color: "var(--dim)", lineHeight: 1.55, margin: "14px 0 0" }}>{m.catalysts[0].impact}</p>}</div></div>}
          </div>
        </div>
      )}

      {/* Thesis */}
      {m.why.length > 0 && (
        <div className="lw-sec"><div className="lw-sh"><span className="lx">05</span><h2>The case</h2></div>
          <div className="lw-why">{m.why.map((w, i) => <div className="w" key={i}><span className="n">{String(i + 1).padStart(2, "0")}</span><p>{w}</p></div>)}</div>
        </div>
      )}

      {/* Leadership — credentials matrix */}
      {m.team.length > 0 && (
        <div className="lw-sec" style={{ borderBottom: "none" }}><div className="lw-sh"><span className="lx">06</span><h2>Leadership</h2><span className="note">{m.team.length}</span></div>
          <table className="cmp"><tbody>{m.team.slice(0, 8).map((p, i) => <tr key={i}><td>{p.name}</td><td className="wrap num" style={{ textAlign: "right", color: "var(--dim)", fontWeight: 400 }}>{p.role}</td></tr>)}</tbody></table>
        </div>
      )}
      <FollowBlock m={m} />
    </div>
  );
}

// ── Template 04 · STRATA — a geologist's cross-section. Holes plot their REAL assay grades from the
// model (colour = grade); geometry is an honest schematic (we hold no collar coords), labelled so. ──
function buildXsec(el, m) {
  if (!el) return;
  const W = 1000, surfY = 110, botY = 560, dY = (d) => surfY + (d / 1000) * (botY - surfY);
  const drills = (m.flagship.drills || []).slice(0, 6).map((d) => ({ hole: d.hole, grade: d.grade, g: parseFloat(String(d.grade || "").replace(/[^0-9.]/g, "")) || 0 }));
  let g = '<rect class="m-bg" x="0" y="0" width="' + W + '" height="600"/><g class="m-grid" stroke-width="1" fill="none">';
  for (let d = 0; d <= 1000; d += 200) g += '<path d="M60 ' + dY(d) + "H" + (W - 16) + '"/>';
  g += "</g>";
  let lab = "";
  for (let d = 0; d <= 1000; d += 200) lab += '<text class="m-dim" x="14" y="' + (dY(d) + 4) + '" font-size="11">' + d + "m</text>";
  g += '<path d="M60 ' + (surfY - 2) + " Q 300 " + (surfY - 22) + " 560 " + (surfY - 8) + " T " + (W - 16) + " " + (surfY + 2) + '" class="x-surface" fill="none" stroke-width="2" stroke-opacity=".8"/>';
  g += '<text class="m-dim" x="64" y="' + (surfY - 14) + '" font-size="11" letter-spacing="2">SURFACE</text>';
  g += '<path d="M430 ' + dY(120) + " C 360 " + dY(360) + ", 470 " + dY(720) + ", 590 " + dY(680) + " C 720 " + dY(640) + ", 690 " + dY(260) + ", 600 " + dY(140) + ' Z" class="m-acc" fill-opacity=".08" stroke="none"/>';
  g += '<path d="M360 ' + dY(0) + " L640 " + dY(0) + " L560 " + dY(340) + " L440 " + dY(340) + ' Z" class="m-accs" fill="none" stroke-width="1.4" stroke-dasharray="6 5" stroke-opacity=".55"/>';
  g += '<text class="m-dim" x="500" y="' + (dY(0) + 18) + '" text-anchor="middle" font-size="10" letter-spacing="2">PIT SHELL</text>';
  const mx = Math.max.apply(null, drills.map((d) => d.g).concat([1])), collars = [340, 430, 520, 610, 700, 775];
  let holeG = "", segG = "";
  drills.forEach((d, i) => {
    const x0 = collars[i % collars.length], y0 = surfY, dx = (i % 2 ? -1 : 1) * (60 + i * 18), len = 760 + (i % 3) * 80, x1 = x0 + dx, y1 = dY(len);
    holeG += '<line x1="' + x0 + '" y1="' + y0 + '" x2="' + x1 + '" y2="' + y1 + '" class="x-hole" stroke-width="1" stroke-opacity=".7"/><rect class="m-ink" x="' + (x0 - 3) + '" y="' + (y0 - 6) + '" width="6" height="6"/>';
    if (d.g > 0) {
      const f0 = 0.5, f1 = 0.62, ax = x0 + (x1 - x0) * f0, ay = y0 + (y1 - y0) * f0, bx = x0 + (x1 - x0) * f1, by = y0 + (y1 - y0) * f1, op = Math.min(1, 0.3 + d.g / mx * 0.7).toFixed(2);
      segG += '<line class="xseg m-accs" x1="' + ax + '" y1="' + ay + '" x2="' + bx + '" y2="' + by + '" stroke-width="7" stroke-linecap="round" stroke-opacity="' + op + '" data-g="' + esc(d.grade) + '" data-h="' + esc(d.hole) + '"><title>' + esc(d.hole) + " · " + esc(d.grade) + "</title></line>";
    }
  });
  el.innerHTML = '<div class="maptip"></div><svg viewBox="0 0 1000 600">' + g + holeG + segG + lab + "</svg>";
  const svg = el.querySelector("svg"), tip = el.querySelector(".maptip");
  svg.querySelectorAll(".xseg").forEach((s) => {
    s.addEventListener("mouseenter", () => { tip.textContent = s.dataset.h + " · " + s.dataset.g; tip.style.opacity = "1"; s.setAttribute("stroke-width", "11"); });
    s.addEventListener("mousemove", (ev) => { const r = el.getBoundingClientRect(); tip.style.left = (ev.clientX - r.left) + "px"; tip.style.top = (ev.clientY - r.top) + "px"; });
    s.addEventListener("mouseleave", () => { tip.style.opacity = "0"; s.setAttribute("stroke-width", "7"); });
  });
  // signature entrance: grade intervals light up down the section
  if (matchMedia("(prefers-reduced-motion:reduce)").matches) return;
  const segs = svg.querySelectorAll(".xseg");
  segs.forEach((s, i) => { s.style.opacity = "0"; s.style.transition = "opacity .5s ease " + (0.35 + i * 0.13) + "s"; });
  requestAnimationFrame(() => requestAnimationFrame(() => segs.forEach((s) => { s.style.opacity = "1"; })));
}
// STRATA's honest cross-section: DECORATIVE stratigraphy (a design motif — never claimed as the
// company's geology) beside a FACTUAL intercept register (each reported hole's grade shown as a
// relative bar, labelled with hole + interval). No hole position, orientation, depth, spacing, pit
// shell or ore-body geometry is invented. Falls back gracefully to just the register when sparse.
function St2Section({ drills }) {
  const ds = (drills || []).slice(0, 6).map((d) => ({ hole: d.hole, grade: d.grade, interval: d.interval, g: _gnum(d.grade) || 0 }));
  const maxG = Math.max(...ds.map((d) => d.g), 0.0001);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "0.82fr 1.18fr" }}>
      <div style={{ position: "relative", minHeight: 250 }}>
        <svg viewBox="0 0 100 130" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          {[...Array(7)].map((_, i) => <rect key={i} className="st2-band" x="0" y={8 + i * 17.4} width="100" height="17" fill="var(--ink)" fillOpacity={(0.06 + i * 0.05).toFixed(3)} />)}
          <line x1="0" y1="8" x2="100" y2="8" stroke="var(--accent)" strokeWidth="0.7" />
        </svg>
        <div style={{ position: "absolute", top: 7, left: 10, fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "2px", color: "var(--dim)" }}>SURFACE</div>
        <div style={{ position: "absolute", bottom: 7, left: 10, fontFamily: "var(--mono)", fontSize: 8.5, letterSpacing: "1.6px", color: "var(--dim)", opacity: .8 }}>DECORATIVE STRATIGRAPHY</div>
      </div>
      <div style={{ padding: "clamp(16px,3vw,32px)" }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--dim)", marginBottom: 12 }}>Reported intercepts · {ds.length}</div>
        {ds.map((d, i) => (
          <div className="st2-icept" key={i} style={{ transitionDelay: (0.2 + i * 0.12) + "s", display: "grid", gridTemplateColumns: "1fr auto", gap: 14, alignItems: "center", padding: "11px 0", borderTop: "1px solid var(--line2)" }}>
            <div>
              <div style={{ height: 8, borderRadius: 4, background: "var(--accent)", opacity: (0.42 + (d.g / maxG) * 0.58), width: (28 + (d.g / maxG) * 72) + "%" }} />
              <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: ".06em", color: "var(--dim)", marginTop: 8 }}>{esc(d.hole)}{d.interval ? " · " + d.interval : ""}</div>
            </div>
            <div style={{ fontWeight: 800, fontSize: "clamp(15px,1.7vw,22px)", fontVariantNumeric: "tabular-nums" }}>{d.grade}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// STRATA (V6) — a continuous vertical geological descent through the company. Same _confStory dataset,
// its own system: depth-rail spine, slate→umber palette, emergence motion, imagery surfacing at depth.
function Strata({ m }) {
  const rootRef = useRef(null);
  useEffect(() => {
    const root = rootRef.current, sc = document.querySelector(".cv3"); if (!root || !sc) return;
    const reveal = [...root.querySelectorAll(".st2-ch:not(.st2-pin)")];
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) e.target.classList.add("on"); }), { threshold: 0.16 });
    reveal.forEach((c) => io.observe(c));
    const pins = [...root.querySelectorAll(".st2-pin")];
    const all = [...root.querySelectorAll("[data-lab]")];
    const labEl = root.querySelector(".st2-rail-lab"), depEl = root.querySelector(".st2-rail-dep");
    let raf = 0;
    const upd = () => {
      raf = 0; const vh = window.innerHeight || 1, max = sc.scrollHeight - sc.clientHeight;
      const gp = max > 0 ? Math.max(0, Math.min(1, sc.scrollTop / max)) : 0;
      root.style.setProperty("--gp", gp.toFixed(4)); root.style.setProperty("--dp", gp.toFixed(4));
      pins.forEach((ch) => { const r = ch.getBoundingClientRect(); const travel = ch.offsetHeight - vh; const p = travel > 0 ? Math.max(0, Math.min(1, -r.top / travel)) : (r.top <= 0 ? 1 : 0); ch.style.setProperty("--p", p.toFixed(4)); });
      const cy = vh / 2; let best = 0, bd = 1e9;
      all.forEach((c, i) => { const r = c.getBoundingClientRect(); const d = Math.abs((r.top + r.bottom) / 2 - cy); if (d < bd) { bd = d; best = i; } });
      if (labEl) labEl.textContent = all[best] ? (all[best].dataset.lab || "") : ""; if (depEl) depEl.textContent = "Layer " + (best + 1) + " / " + all.length;
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(upd); };
    upd(); requestAnimationFrame(upd);
    sc.addEventListener("scroll", onScroll, { passive: true }); window.addEventListener("resize", onScroll);
    return () => { io.disconnect(); sc.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [m]);

  const { pool, flag, flagImg, best, cats, why, region, hook, facts, econ, disc, portHead, ctaFeatures } = _confStory(m);
  const cat0 = cats[0];
  const projImg = (p, i) => p.image || (pool.length ? pool[(i + 2) % pool.length] : "");
  const flagAnno = [[flag.ownership && flag.ownership + " owned", "Ownership"], [flag.land, "Land position"], [flag.stage, "Stage"]].filter((a) => a[0]);
  return (
    <div className="st2" ref={rootRef}>
      {/* the persistent geological world — parallax strata we descend through, never leaving it */}
      <div className="st2-world" aria-hidden="true"><div className="wl far" /><div className="wl mid" /><div className="wl near" /><div className="wcore" /></div>
      <div className="st2-rail" aria-hidden="true">
        <div className="st2-rail-line" /><div className="st2-rail-fill" /><div className="st2-rail-mark" />
        <div className="st2-rail-lab" /><div className="st2-rail-dep" />
      </div>

      {/* SURFACE / IDENTITY (quiet) */}
      <section className="st2-ch st2-hero" data-lab="Surface">
        <div className="st2-in">
          <div className="st2-surface-mk st2-em">Surface{region ? " · " + region : ""}</div>
          {hook && <div className="st2-eyebrow st2-em e1">{hook}</div>}
          <h1 className="st2-name st2-em e1" style={{ marginTop: 14 }}>{m.name}</h1>
          {m.tagline && <p className="st2-tag st2-em e2">{m.tagline}</p>}
          {m.tickerLine && <span className="ticker st2-em e3" style={{ marginTop: 24 }}><span className="dot" />{m.tickerLine}</span>}
        </div>
      </section>

      {/* COMPANY SNAPSHOT (quiet) */}
      {facts.length > 0 && (
        <section className="st2-ch" data-lab="Company">
          <div className="st2-in">
            <div className="st2-eyebrow st2-em">The company</div>
            <div className="st2-facts">
              {facts.map((f, i) => <div className="st2-fact st2-em" key={i} style={{ transitionDelay: (0.1 + i * 0.1) + "s" }}><div className="fv">{f.v}</div><div className="fk">{f.k}</div></div>)}
            </div>
            {m.thesis && <p className="st2-sup st2-em e4">{m.thesis}</p>}
          </div>
        </section>
      )}

      {/* FLAGSHIP (quiet) — what the asset is; the resource number is saved for the lock moment */}
      {flag.name && (
        <section className="st2-ch" data-lab="Flagship">
          <div className="st2-in">
            <div className="st2-eyebrow st2-em">Flagship asset</div>
            <div className="st2-name st2-em e1" style={{ fontSize: "clamp(32px,5vw,70px)", marginTop: 10 }}>{flag.name}</div>
            {flag.location && <div className="st2-line st2-em e2">{flag.location}</div>}
            {flagAnno.length > 0 && <div className="st2-annos st2-em e2">{flagAnno.map((a, i) => <div className="a" key={i}><div className="av">{a[0]}</div><div className="ak">{a[1]}</div></div>)}</div>}
            {flag.overview && <div className="st2-body st2-em e3">{flag.overview}</div>}
          </div>
        </section>
      )}

      {/* ✦ MOMENT — RESOURCE LOCK: the figure exists fragmented across layers, then snaps into place */}
      {m.heroStat && (
        <section className="st2-pin" data-lab="Resource" style={{ height: "210vh" }}>
          <div className="st2-stage"><div className="st2-in">
            <div className="st2-eyebrow" style={{ opacity: .85 }}>Mineral resource</div>
            <div className="st2-lockwrap" style={{ marginTop: 18 }}>
              <div className="st2-lock">
                <span className="ghost">{m.heroStat.value}</span>
                <span className="sl s0">{m.heroStat.value}</span><span className="sl s1">{m.heroStat.value}</span><span className="sl s2">{m.heroStat.value}</span>
              </div>
              <div className="st2-lock-seam" />
            </div>
            {m.heroStat.context && <div className="st2-lock-sub st2-line">{m.heroStat.context}{m.heroStat.label ? "   ·   " + m.heroStat.label : ""}</div>}
          </div></div>
        </section>
      )}

      {/* ✦ MOMENT — ASSAY TRACE: a measurement line crosses, finds the interval, the grade locks on */}
      {best && (
        <section className="st2-pin" data-lab="Result" style={{ height: "240vh" }}>
          <div className="st2-stage"><div className="st2-in">
            <div className="st2-eyebrow" style={{ opacity: .85 }}>Strongest intercept · {best.hole}</div>
            <div className="st2-trace">
              <div className="tl"><div className="tprog" /><div className="tint" /></div>
              <div className="tscale"><span>0</span><span>{best.interval ? "interval · " + best.interval : "interval"}</span></div>
            </div>
            {best.interval && <div className="st2-trace-m">Interval located · {best.interval}</div>}
            <div className="st2-trace-g">{best.grade}</div>
            <div className="st2-trace-sub st2-line">{best.hole}{best.interval ? " · over " + best.interval : ""}</div>
            <div className="st2-trace-note">Abstract measurement trace — reported interval width and grade only. No hole position, orientation or depth is implied.</div>
          </div></div>
        </section>
      )}

      {/* EVIDENCE REGISTER (quiet) — the honest full intercept list */}
      {best && (m.flagship.drills || []).length > 1 && (
        <section className="st2-ch" data-lab="Evidence">
          <div className="st2-in">
            <div className="st2-eyebrow st2-em">All reported intercepts</div>
            <div className="st2-sec-wrap st2-em e1" style={{ marginTop: 22 }}><St2Section drills={m.flagship.drills || []} /></div>
            <div className="st2-sec-note st2-em e2">Decorative stratigraphy is a design motif, not this company's geology. Bars show each reported intercept's grade (relative) with hole and interval — no hole position, depth or ore-body geometry is implied.</div>
          </div>
        </section>
      )}

      {/* ✦ MOMENT — IMAGE EXCAVATION: strata masks part to expose each project photograph (dynamic count) */}
      {m.projects.map((p, i) => (
        <section className="st2-pin st2-exc" data-lab={"Project " + (i + 1)} style={{ height: "195vh" }} key={"x" + i}>
          <div className="st2-stage">
            <div className="st2-exc-photo">{projImg(p, i) ? <img src={projImg(p, i)} alt="" /> : null}</div>
            <div className="st2-exc-tex" /><div className="st2-exc-mask top" /><div className="st2-exc-mask bot" /><div className="st2-exc-seam" />
            <div className="st2-exc-in">
              <div className="st2-horizon-ix">Project {String(i + 1).padStart(2, "0")}{p.location ? " · " + p.location : ""}</div>
              <div className="st2-horizon-name">{p.name}</div>
              <div className="st2-horizon-meta">{[p.stage, p.commodity, p.ownership && p.ownership + " owned", p.land].filter(Boolean).join("   ·   ")}</div>
              {p.overview && <div className="st2-horizon-take">{p.overview}</div>}
            </div>
          </div>
        </section>
      ))}

      {/* CAPITAL LAYER (quiet) */}
      {econ.length > 0 && (
        <section className="st2-ch" data-lab="Capital">
          <div className="st2-in">
            <div className="st2-eyebrow st2-em">Capital layer · the support beneath</div>
            <div className="st2-caplayer st2-em e2" style={{ marginTop: 24 }}>
              {econ.map((e, i) => <div className="st2-caprow" key={i}><span className="cn">{String(i + 1).padStart(2, "0")}</span><span className="ck">{e.k}</span><span className="cv">{e.v}</span></div>)}
            </div>
          </div>
        </section>
      )}

      {/* MILESTONES (quiet) — historical layers */}
      {m.timeline.length > 0 && (
        <section className="st2-ch" data-lab="Record">
          <div className="st2-in">
            <div className="st2-eyebrow st2-em">What the company has built</div>
            <div className="st2-strata-time st2-em e1">
              {m.timeline.slice(0, 6).map((t, i) => (
                <div className="st2-mile" key={i}>
                  {t.date && <div className="mdate">{t.date}</div>}
                  <div className="mhead">{t.headline}</div>
                  {t.why && <div className="mwhy">{t.why}</div>}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ✦ MOMENT — CATALYST BREAK: the established strata end; the next milestone emerges from below */}
      {cat0 && (
        <section className="st2-pin st2-break" data-lab="Ahead" style={{ height: "220vh" }}>
          <div className="st2-stage">
            <div className="st2-break-strata" /><div className="st2-break-edge" /><div className="st2-break-void" />
            <div className="st2-break-in st2-in">
              <div className="st2-cat-lead">Deeper still · what lies ahead</div>
              {cat0.timing && <div className="st2-cat-time">{cat0.timing}</div>}
              <div className="st2-cat-label">{cat0.label}</div>
              {cat0.impact && <div className="st2-cat-impact">{cat0.impact}</div>}
            </div>
          </div>
        </section>
      )}

      {/* WHY INVEST (quiet payoff) — what the layers add up to */}
      {why.length > 0 && (
        <section className="st2-ch" data-lab="Thesis">
          <div className="st2-in">
            <div className="st2-eyebrow st2-em">What the layers add up to</div>
            <div className="st2-why">
              {why.map((w, i) => { const lab = _confReasonLabel(w, i); return (
                <div className="st2-why-row st2-em" key={i} style={{ transitionDelay: (0.1 + i * 0.1) + "s" }}>
                  <span className="wn">{String(i + 1).padStart(2, "0")}</span><span className="wl">{lab}</span><span className="wd">{w}</span>
                </div>
              ); })}
            </div>
          </div>
        </section>
      )}

      {/* ✦ MOMENT — CORE CLOSE: the layers compress inward; the core opens onto the identity */}
      <section className="st2-pin st2-close" data-lab="Core" style={{ height: "200vh" }}>
        <div className="st2-stage">
          <div className="st2-close-lyr top" /><div className="st2-close-lyr bot" /><div className="st2-core-ap" />
          <div className="st2-core-in st2-in" style={{ maxWidth: 820 }}>
            <div className="st2-core-mk">You've reached the core</div>
            <div className="st2-core-name">{m.name}</div>
            {m.tickerLine && <div style={{ fontFamily: "var(--mono)", fontSize: 12, letterSpacing: ".12em", color: "var(--dim)", marginTop: 14 }}>{m.tickerLine}</div>}
            <div className="st2-core-list">{ctaFeatures.map((x) => <span key={x}>{x}</span>)}</div>
            <div className="st2-core-go">Follow on MineEx →</div>
          </div>
        </div>
      </section>
    </div>
  );
}

// ── Template 05 · KEYNOTE — one idea per full-screen scene ──
// KEYNOTE (V4) — a world-class product presentation. HORIZONTAL swipe stages, one idea per stage,
// immaculate backgrounds, staged stat reveals and diagrams that assemble piece by piece. No cards,
// tables, prose, photos or ambient noise. Wow: (1) the opening statement, (2) the evidence diagram
// assembles from real grades, (3) the closing capital diagram builds.
// KEYNOTE (V6) — editorial horizontal presentation. Keeps the side-sliding deck, refines it into a
// native blue/cream identity, and drives a lateral scrub (--c signed centre-offset, --a abs) so the
// composition transforms sideways. Full _confStory dataset, imagery in the motion, precise grid.
function Keynote({ m }) {
  const scRef = useRef(null); const goRef = useRef(null); const [idx, setIdx] = useState(0);
  // NATIVE-SCROLL MOTION. The deck is a real horizontal scroller with CSS scroll-snap (mandatory +
  // scroll-snap-stop:always) — so the OS provides the momentum and the magnetic settle: one swipe glides
  // exactly one composition, eased by the platform, and it can never rest stranded halfway. No custom
  // wheel/settle engine to fight it. A passive rAF driver just READS scrollLeft and expresses the same
  // deterministic `--c` lateral transforms + milestone rail; graphics play once and hold.
  useEffect(() => {
    const sc = scRef.current; if (!sc) return;
    const stages = [...sc.querySelectorAll(".kys-stage2")];
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      const i = +e.target.dataset.i; if (!isNaN(i)) setIdx(i);
      e.target.querySelectorAll(".kys-play:not(.played)").forEach((el) => el.classList.add("play", "played"));
    }), { root: sc, threshold: 0.55 });
    stages.forEach((s) => io.observe(s));
    let raf = 0;
    const upd = () => {
      raf = 0; const vw = sc.clientWidth || 1, cx = sc.scrollLeft + vw / 2;
      stages.forEach((s) => s.style.setProperty("--c", Math.max(-1.5, Math.min(1.5, ((s.offsetLeft + s.offsetWidth / 2) - cx) / vw)).toFixed(4)));
      // Milestones — the record travels laterally as its stage crosses the viewport, clamped to the real
      // overflow (never over-scrolls, never hard-clips; the edge mask crops on purpose), reversible.
      const row = sc.querySelector(".kys-rail-row");
      if (row) { const stage = row.closest(".kys-stage2"), rail = row.parentElement; const c = parseFloat(stage.style.getPropertyValue("--c")) || 0; const over = Math.max(0, row.scrollWidth - rail.clientWidth); const t = Math.min(1, Math.max(0, (0.55 - c) / 1.1)); row.style.setProperty("--tx", (-t * over).toFixed(1) + "px"); }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(upd); };
    const snapTo = (i) => { const vw = sc.clientWidth || 1; sc.scrollTo({ left: Math.max(0, Math.min(stages.length - 1, i)) * vw, behavior: "smooth" }); };
    goRef.current = snapTo;
    // A VERTICAL wheel/trackpad gesture drives the deck horizontally 1:1 and CONTINUOUSLY — the content
    // tracks the fingers directly (trackpad wheel events carry their own momentum tail), and the CSS
    // mandatory snap settles onto the nearest composition once the gesture ends. No cooldown, no intent
    // threshold, no programmatic easing — that's what makes the swipe feel connected and smooth. A
    // horizontal swipe already scrolls natively and is left untouched.
    const onWheel = (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { sc.scrollLeft += e.deltaY; e.preventDefault(); } };
    const onKey = (e) => { const vw = sc.clientWidth || 1, cur = Math.round(sc.scrollLeft / vw); if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); snapTo(cur + 1); } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); snapTo(cur - 1); } };
    upd(); requestAnimationFrame(upd);
    sc.addEventListener("scroll", onScroll, { passive: true }); sc.addEventListener("wheel", onWheel, { passive: false }); window.addEventListener("keydown", onKey); window.addEventListener("resize", onScroll);
    return () => { io.disconnect(); sc.removeEventListener("scroll", onScroll); sc.removeEventListener("wheel", onWheel); window.removeEventListener("keydown", onKey); window.removeEventListener("resize", onScroll); if (raf) cancelAnimationFrame(raf); goRef.current = null; };
  }, [m]);

  const { pool, flag, flagImg, best, cats, why, region, hook, facts, econ, statNum, statUnit, ctaFeatures } = _confStory(m);
  const cat0 = cats[0];
  const projImg = (p, i) => p.image || (pool.length ? pool[(i + 2) % pool.length] : "");
  const imgCol = (src, cap) => <div className="kys-imgcol">{src ? <img src={src} alt="" /> : null}{cap && <span className="cap">{cap}</span>}</div>;

  // THE GEOGRAPHIC JOURNEY — data-driven. Real jurisdiction only, broad→specific (country → region →
  // district), NO "World" placeholder. Markers placed at county level ONLY where the disclosed location
  // matches a known county (labelled schematic), else jurisdiction fallback.
  const geoIsNV = /nevada/i.test(region);
  const geoPath = _NV_PATH;
  const geoSteps = [m.geo.country, region, m.geo.district].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
  const geoMarks = geoIsNV ? m.projects.map((p, i) => { const loc = String(p.location || "").toLowerCase(); const c = Object.keys(_NV_COUNTIES).find((k) => loc.includes(k)); return c ? { name: p.name, pos: _NV_COUNTIES[c], i } : null; }).filter(Boolean) : [];
  const S = [];

  // 1 · IDENTITY (quiet minimal)
  S.push(<div className="kys-in">
    <div className="kys-eyebrow kys-lat">{hook || m.tickerLine || "MineEx"}</div>
    <h1 className="kys-title kys-lat d2" style={{ marginTop: 18 }}>{m.name.replace(/\.$/, "")}.</h1>
    {m.tagline && <p className="kys-lead kys-lat d3" style={{ marginTop: 24 }}>{m.tagline}</p>}
    {m.tickerLine && <div className="kys-meta kys-lat d3" style={{ marginTop: 22 }}>{m.tickerLine}</div>}
  </div>);

  // 2 · THESIS
  if (m.thesis) S.push(<div className="kys-in">
    <div className="kys-eyebrow kys-lat">The opportunity</div>
    <h1 className="kys-title kys-lat d2" style={{ fontSize: "clamp(30px,4.8vw,76px)", marginTop: 18, maxWidth: "18ch" }}>{m.thesis}</h1>
  </div>);

  // ✦ GEOGRAPHIC JOURNEY — the cinematic map gets a FULL hero: country → region zooms in and markers
  //   lock. No photo beside it — the handoff to real imagery is the next stage (a deliberate transition).
  if (region || m.geo.country) S.push(<div className="kys-in kys-geo kys-play">
    <div className="kys-geo-grid">
      <div className="kys-geo-copy">
        <div className="kys-eyebrow kys-lat">Where the assets are</div>
        <div className="kys-geo-steps">
          {geoSteps.map((s, i) => <div className={"kys-geo-step" + (i === geoSteps.length - 1 ? " last" : "")} key={i} style={{ "--d": (0.15 + i * 0.4) + "s" }}>{s}</div>)}
        </div>
        <div className="kys-geo-proj"><div className="pn">{flag.name || m.name}</div>{flag.location && <div className="pl">{flag.location}</div>}</div>
      </div>
      <div className="kys-geo-mapwrap">
        <svg viewBox="0 0 100 140" preserveAspectRatio="xMidYMid meet">
          {geoIsNV
            ? <path className="kys-geo-region" d={geoPath} />
            : <g className="kys-geo-region"><circle cx="50" cy="70" r="34" fill="none" strokeDasharray="3 3" /><circle cx="50" cy="70" r="20" fill="none" strokeDasharray="2 3" opacity=".6" /></g>}
          {geoMarks.map((mk, j) => <g className={"kys-geo-mk" + (j === 0 ? " flag" : "")} key={j} style={{ "--d": (1.35 + j * 0.2) + "s" }}>{j === 0 && <circle className="ring" cx={mk.pos[0]} cy={mk.pos[1]} r="7.5" />}<circle className="dot" cx={mk.pos[0]} cy={mk.pos[1]} r="3.4" /><text className="num" x={mk.pos[0]} y={mk.pos[1] + 1.5} textAnchor="middle">{mk.i + 1}</text></g>)}
        </svg>
        <div className="kys-geo-foot">{geoMarks.length ? (region || "").toUpperCase() + " · schematic positions" : (region || m.geo.country || "").toUpperCase() + " · jurisdiction"}</div>
      </div>
    </div>
  </div>);

  // 3 · RESOURCE — number composes beside a photograph (image takeover, right)
  if (m.heroStat) S.push(<div className="kys-in"><div className="kys-two img65r" style={{ minHeight: "70vh" }}>
    <div>
      <div className="kys-eyebrow kys-lat">{m.heroStat.label}</div>
      <div className="kys-num kys-lat" style={{ marginTop: 12 }}>{statNum}<span className="u">{statUnit}</span></div>
      {m.heroStat.context && <div className="kys-meta kys-lat d2" style={{ marginTop: 22 }}>{m.heroStat.context}</div>}
    </div>
    {imgCol(flagImg, flag.name || "Flagship")}
  </div></div>);

  // 4 · STRONGEST RESULT — split: interval from left, grade from right, lock on centre axis
  if (best) S.push(<div className="kys-in" style={{ textAlign: "center" }}>
    <div className="kys-eyebrow kys-lat" style={{ display: "block", textAlign: "center" }}>Strongest intercept</div>
    <div className="kys-split" style={{ marginTop: 26 }}>
      {best.interval && <span className="sp l">{best.interval}</span>}{best.interval && <span className="kys-split-x" />}<span className="sp r">{best.grade}</span>
    </div>
    <div className="kys-meta kys-lat" style={{ marginTop: 26 }}>{best.hole} · reported interval width &amp; grade — no geometry implied</div>
  </div>);

  // 5 · FLAGSHIP — image 65% left, editorial info cross-sliding right
  if (flag.name) S.push(<div className="kys-in"><div className="kys-two img65" style={{ minHeight: "72vh" }}>
    {imgCol(flagImg, flag.location || flag.name)}
    <div>
      <div className="kys-eyebrow kys-lat rev">Flagship asset</div>
      <h2 className="kys-title kys-lat rev" style={{ fontSize: "clamp(30px,4.4vw,66px)", marginTop: 12 }}>{flag.name}</h2>
      {flag.location && <div className="kys-meta kys-lat rev" style={{ marginTop: 14 }}>{flag.location}</div>}
      <div className="kys-meta kys-lat rev d2" style={{ marginTop: 18, color: "var(--ink)", fontSize: "clamp(13px,1.5vw,17px)" }}>{[flag.ownership && flag.ownership + " owned", flag.land, flag.stage].filter(Boolean).join("   ·   ")}</div>
      {flag.overview && <p className="kys-lead kys-lat rev d2" style={{ marginTop: 18, fontSize: "clamp(15px,1.6vw,19px)" }}>{flag.overview}</p>}
    </div>
  </div></div>);

  // 6 · PORTFOLIO — a horizontal visual essay, alternating image side (dynamic count)
  m.projects.forEach((p, i) => S.push(<div className="kys-in"><div className={"kys-two " + (i % 2 ? "img65r" : "img65")} style={{ minHeight: "72vh" }}>
    {i % 2 ? null : imgCol(projImg(p, i), p.location || p.name)}
    <div>
      <div className="kys-eyebrow kys-lat rev">Project {String(i + 1).padStart(2, "0")}{p.stage ? " · " + p.stage : ""}</div>
      <h2 className="kys-title kys-lat rev" style={{ fontSize: "clamp(30px,4.4vw,66px)", marginTop: 12 }}>{p.name}</h2>
      <div className="kys-meta kys-lat rev d2" style={{ marginTop: 16 }}>{[p.commodity, p.ownership && p.ownership + " owned", p.location, p.land].filter(Boolean).join("   ·   ")}</div>
      {p.overview && <p className="kys-lead kys-lat rev d2" style={{ marginTop: 16, fontSize: "clamp(15px,1.6vw,19px)" }}>{p.overview}</p>}
    </div>
    {i % 2 ? imgCol(projImg(p, i), p.location || p.name) : null}
  </div></div>));

  // 7 · CAPITAL — horizontally assembling editorial spread
  if (econ.length) S.push(<div className="kys-in">
    <div className="kys-eyebrow kys-lat">Capital &amp; economics</div>
    <div className="kys-spread" style={{ marginTop: 26 }}>
      {econ.map((e, i) => <div className="e" key={i} style={{ transform: "translateX(calc(var(--c,0)*" + ((i % 2 ? -1 : 1) * (24 + i * 10)) + "px))" }}><div className="ev">{e.v}</div><div className="ek">{e.k}</div></div>)}
    </div>
    <div className="kys-meta kys-lat d3" style={{ marginTop: 26 }}>Full capital structure on MineEx</div>
  </div>);

  // 8 · MILESTONES — one continuous horizontal record: the row travels start→end as this stage crosses
  //   the viewport (interpolated in JS from the stage's own scroll progress, reversible, clamped so it
  //   never over-scrolls; the edge mask crops intentionally — it never hard-clips a card).
  if (m.timeline.length) { const ml = m.timeline.slice(0, 6); S.push(<div className="kys-in">
    <div className="kys-eyebrow kys-lat">What the company has built</div>
    <div className="kys-rail">
      <div className="kys-rail-row">{ml.map((t, i) => <div className="mi" key={i}>{t.date && <div className="d">{t.date}</div>}<div className="h">{t.headline}</div>{t.why && <div className="w">{t.why}</div>}</div>)}</div>
    </div>
    <div className="kys-rail-count kys-lat d2">{ml.length} milestone{ml.length !== 1 ? "s" : ""}{m.timeline.length > ml.length ? " · more on MineEx" : ""} — swipe to travel the record</div>
  </div>); }

  // 9 · CATALYST — approaches from the right and becomes dominant
  if (cat0) S.push(<div className="kys-in" style={{ textAlign: "center" }}>
    <div className="kys-eyebrow kys-lat" style={{ display: "block", textAlign: "center" }}>What's approaching</div>
    {cat0.timing && <div className="kys-meta" style={{ marginTop: 22, color: "var(--accent)", transform: "translateX(calc(var(--c,0)*90px))" }}>{cat0.timing}</div>}
    <h1 className="kys-title" style={{ marginTop: 12, transform: "translateX(calc(var(--c,0)*150px))" }}>{cat0.label}</h1>
    {cat0.impact && <p className="kys-lead kys-lat d3" style={{ marginTop: 22, marginLeft: "auto", marginRight: "auto" }}>{cat0.impact}</p>}
  </div>);

  // 10 · WHY — the case assembles from opposite directions, then reasons lock in a grid
  if (why.length) S.push(<div className="kys-in">
    <div className="kys-eyebrow kys-lat">What it all adds up to</div>
    <div className="kys-why" style={{ marginTop: 18 }}>
      {why.map((w, i) => { const lab = _confReasonLabel(w, i); return (
        <React.Fragment key={i}>
          <span className="rl" style={{ transform: "translateX(calc(var(--c,0)*" + (i % 2 ? -44 : 44) + "px))" }}>{lab}</span>
          <span className="rd" style={{ transform: "translateX(calc(var(--c,0)*" + (i % 2 ? 30 : -30) + "px))" }}>{w}</span>
        </React.Fragment>
      ); })}
    </div>
  </div>);

  // 11 · CTA — identity and follow lock on the centre grid, then motion stops
  S.push(<div className="kys-in"><div className="kys-cta">
    <div className="kys-eyebrow kys-lat">Follow the story</div>
    <h1 className="kys-title kys-lat" style={{ fontSize: "clamp(34px,6vw,100px)" }}>{m.name}</h1>
    {m.tickerLine && <div className="kys-meta">{m.tickerLine}</div>}
    <div className="kys-cta-list">{ctaFeatures.map((x) => <span key={x}>{x}</span>)}</div>
    <div className="kys-cta-go">Follow on MineEx →</div>
  </div></div>);

  return (
    <>
      <div className="kys" ref={scRef}>{S.map((s, i) => <div className="kys-stage2" data-i={i} key={i}>{s}</div>)}</div>
      <div className="kys-nav">{S.map((_, i) => <i className={idx === i ? "on" : ""} key={i} onClick={() => goRef.current && goRef.current(i)} />)}</div>
      <div className="kys-hint">Swipe →</div>
    </>
  );
}

// ── Template 06 · TERMINAL — investor intelligence system ──
// A persistent instrument HUD frames a workspace of full-viewport STATES that evolve as the investor
// explores: the strongest REAL signal takes control, assets open into media windows, geography and the
// portfolio are interactive, capital & log resolve into a distilled thesis. Same universal dataset as
// every template; told as a responsive live-intelligence environment. Obsidian ground · champagne gold ·
// mono chrome. Adapts to any commodity, stage, project count and data richness (no assumed drills).
function Terminal({ m }) {
  const scRef = useRef(null);
  const [active, setActive] = useState(0);
  const [revealed, setRevealed] = useState(() => new Set([0]));
  const [sel, setSel] = useState(0);
  useEffect(() => {
    const sc = scRef.current; if (!sc) return;
    const els = [...sc.querySelectorAll(".trm-state")];
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      const i = +e.target.dataset.i;
      if (!isNaN(i)) { setActive(i); setRevealed((p) => { if (p.has(i)) return p; const n = new Set(p); n.add(i); return n; }); }
    }), { root: sc, threshold: 0.45 });
    els.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [m]);

  const { pool, flag, flagImg, best, cats, why, region, econ } = _confStory(m);
  const P = m.projects || [];
  const splitNum = (s) => { const mm = String(s == null ? "" : s).match(/^\s*([~<>]?[\d.,]+)\s*(.*)$/); return mm ? [mm[1], mm[2]] : [String(s == null ? "" : s), ""]; };
  const eV = (re) => (econ.find((e) => re.test(e.k)) || {}).v;
  const cashV = eV(/cash/i), mcapV = eV(/market/i);

  // PRIMARY SIGNAL — the single strongest factual evidence for THIS company, by investment relevance;
  // never assumes drills. Falls through gracefully to whatever real data the company actually carries.
  let primary;
  if (m.heroStat) { const [n, u] = splitNum(m.heroStat.value); primary = { n, u, k: m.heroStat.label || "Mineral resource", note: m.heroStat.context }; }
  else if (best) { primary = { n: best.grade, u: "", k: "Strongest intercept", note: [best.interval, best.hole].filter(Boolean).join("   ·   ") }; }
  else if (mcapV) { const [n, u] = splitNum(mcapV); primary = { n, u, k: "Market capitalization" }; }
  else if (cashV) { const [n, u] = splitNum(cashV); primary = { n, u, k: "Treasury position" }; }
  else if (cats[0]) { primary = { n: cats[0].timing || "Next", u: "", k: "Upcoming catalyst", note: cats[0].label }; }
  else if (flag.stage) { primary = { n: flag.stage, u: "", k: "Development stage" }; }
  else { primary = { n: m.commodity || m.shortName, u: "", k: "Focus" }; }

  const vitals = [
    m.commodity && ["Commodity", m.commodity],
    region && ["Jurisdiction", region],
    flag.stage && ["Stage", flag.stage],
    m.tickers[0] && ["Listing", m.tickers.join("   ")],
  ].filter(Boolean).slice(0, 4);

  const cur = P[Math.min(sel, Math.max(0, P.length - 1))] || {};
  const curImg = cur.image || (pool.length ? pool[(sel + 1) % pool.length] : "") || flagImg || "";
  const dfacts = [cur.commodity && ["Commodity", cur.commodity], cur.ownership && ["Ownership", cur.ownership], cur.location && ["Location", cur.location], cur.land && ["Land", cur.land]].filter(Boolean).slice(0, 4);
  const dcols = dfacts.length <= 3 ? Math.max(1, dfacts.length) : 2; // never leave a dead grid cell
  const isNV = /nevada/i.test(region);
  const county = (loc) => { const s = String(loc || "").toLowerCase(); return Object.keys(_NV_COUNTIES).find((k) => s.includes(k)); };
  const drills = (m.flagship.drills || []).slice().sort((a, b) => _gnum(b.grade) - _gnum(a.grade)).slice(0, 6);

  const S = [];
  const modk = (t) => <div className="trm-modk trm-wipe">{t}</div>;

  // 01 · IDENTITY — a sparse, deliberate boot: the system opens on the company
  S.push({ id: "IDENTITY", node: (
    <div className="trm-in trm-boot">
      <div className="trm-scan" />
      <div className="trm-boot-k trm-wipe">◆ MINEEX INTELLIGENCE</div>
      <h1 className="trm-boot-name trm-wipe">{m.name.replace(/\.$/, "")}</h1>
      {m.tagline && <p className="trm-boot-sub trm-wipe">{m.tagline}</p>}
      <div className="trm-boot-chips">{[m.commodity, region, m.tickers[0]].filter(Boolean).map((x, i) => <span className="trm-rise" style={{ transitionDelay: (0.4 + i * 0.09) + "s" }} key={i}>{x}</span>)}</div>
    </div>
  ) });

  // 02 · PRIMARY SIGNAL — the strongest real fact takes control of the workspace
  S.push({ id: "SIGNAL", node: (
    <div className="trm-in">
      <div className="trm-scan" />
      {modk("Primary signal")}
      <div className="trm-sig">
        <div className="trm-mega trm-wipe">{primary.n}{primary.u && <span className="u">{primary.u}</span>}</div>
        <div className="trm-sig-side trm-rise" style={{ transitionDelay: ".28s" }}><div className="trm-sig-k">{primary.k}</div>{primary.note && <div className="trm-sig-note">{primary.note}</div>}</div>
      </div>
      {vitals.length > 0 && <div className="trm-vitals">{vitals.map(([k, v], i) => <div className="f trm-rise" style={{ transitionDelay: (0.32 + i * 0.07) + "s" }} key={i}><div className="fk">{k}</div><div className="fv">{v}</div></div>)}</div>}
    </div>
  ) });

  // 03 · ASSET REGISTER — interactive, imagery-forward: select an asset, its media window opens
  if (P.length) S.push({ id: "ASSETS", node: (
    <div className="trm-in trm-assets">
      <div className="trm-scan" />
      {modk("Asset register · " + P.length + (P.length === 1 ? " asset" : " assets"))}
      <div className="trm-assets-grid">
        <div className="trm-list">{P.map((p, i) => <button className={"row" + (i === sel ? " on" : "")} onClick={() => setSel(i)} key={i}><span className="rn">{String(i + 1).padStart(2, "0")}</span><span className="rt">{p.name}</span><span className="rs">{p.stage || p.commodity || ""}</span></button>)}</div>
        <div className="trm-detail">
          <div className="trm-media">{curImg ? <img src={curImg} alt="" key={curImg} /> : <div className="trm-media-empty">NO MEDIA ON FILE</div>}<span className="fr tl" /><span className="fr tr" /><span className="fr bl" /><span className="fr br" /><div className="cap"><span className="cn">{cur.name}</span>{(cur.location || region) && <span className="cl">{cur.location || region}</span>}</div></div>
          {dfacts.length > 0 && <div className="trm-dfacts" style={{ gridTemplateColumns: "repeat(" + dcols + ",1fr)" }}>{dfacts.map(([k, v], i) => <div className="df" key={i}><span className="dk">{k}</span><span className="dv">{v}</span></div>)}</div>}
          {cur.overview && <p className="trm-dov">{cur.overview}</p>}
        </div>
      </div>
    </div>
  ) });

  // 04 · SPATIAL — honest geography as an intelligence panel (NOT Atlas): interactive positions, real
  //   jurisdiction datum, schematic county nodes only where the disclosed location matches a known county
  if (region || m.geo.country) { const list = P.length ? P : [{ name: m.shortName, location: region }]; S.push({ id: "SPATIAL", node: (
    <div className="trm-in trm-spatial">
      <div className="trm-scan" />
      {modk("Spatial // asset positions")}
      <div className="trm-spatial-grid">
        <div className="trm-list">{list.map((p, i) => <button className={"row" + (i === sel ? " on" : "")} onClick={() => setSel(i)} key={i}><span className="rn">{String(i + 1).padStart(2, "0")}</span><span className="rt">{p.name}</span><span className="rs">{p.location || region || ""}</span></button>)}</div>
        <div className="trm-map">
          {isNV ? (
            <svg viewBox="0 0 100 140" preserveAspectRatio="xMidYMid meet" className="trm-map-svg">
              <path className="trm-map-shape" d={_NV_PATH} />
              {P.map((p, i) => { const c = county(p.location); if (!c) return null; const pos = _NV_COUNTIES[c]; return <g className={"trm-node" + (i === sel ? " on" : "")} key={i}><circle className="dot" cx={pos[0]} cy={pos[1]} r="2.6" /><text className="nl" x={pos[0]} y={pos[1] - 5} textAnchor="middle">{String(i + 1).padStart(2, "0")}</text></g>; })}
            </svg>
          ) : (
            <div className="trm-locator"><div className="trm-loc-ring"><span /><span /><span /></div><div className="trm-loc-name">{region || m.geo.country}</div></div>
          )}
          <div className="trm-map-hud">
            <div className="mh"><span className="k">Region</span><span className="v">{region || "—"}</span></div>
            <div className="mh"><span className="k">Country</span><span className="v">{m.geo.country || "—"}</span></div>
            {m.geo.lat != null && <div className="mh"><span className="k">Datum</span><span className="v">{Number(m.geo.lat).toFixed(1)}°, {Number(m.geo.lng).toFixed(1)}°</span></div>}
            <div className="mh"><span className="k">Active</span><span className="v">{(list[Math.min(sel, list.length - 1)] || {}).name || m.shortName}</span></div>
          </div>
        </div>
      </div>
      <div className="trm-foot">{isNV && P.some((p) => county(p.location)) ? (region || "").toUpperCase() + " · schematic asset positions — not survey coordinates" : (region || m.geo.country || "").toUpperCase() + " · disclosed jurisdiction datum"}</div>
    </div>
  ) }); }

  // 05 · EVIDENCE — the densest analytical state; strongest real evidence (drills, else resource)
  const evNode = drills.length ? (
    <div className="trm-in">
      <div className="trm-scan" />
      {modk("Evidence // strongest intercepts")}
      <div className="trm-ev">{drills.map((d, i) => { const g = _gnum(d.grade), mx = _gnum(drills[0].grade) || 1; return <div className={"evr trm-wipe" + (i === 0 ? " top" : "")} style={{ transitionDelay: (0.08 + i * 0.06) + "s" }} key={i}><span className="eh">{d.hole}</span><span className="ei">{d.interval || "—"}</span><span className="eg">{d.grade}</span><span className="eb"><i style={{ width: Math.max(6, Math.round((g / mx) * 100)) + "%" }} /></span></div>; })}</div>
      <div className="trm-foot">Reported interval widths and grades — no drill geometry implied.</div>
    </div>
  ) : m.heroStat ? (
    <div className="trm-in">
      <div className="trm-scan" />
      {modk("Evidence // resource")}
      <div className="trm-sig"><div className="trm-mega trm-wipe">{splitNum(m.heroStat.value)[0]}{splitNum(m.heroStat.value)[1] && <span className="u">{splitNum(m.heroStat.value)[1]}</span>}</div><div className="trm-sig-side trm-rise" style={{ transitionDelay: ".2s" }}><div className="trm-sig-k">{m.heroStat.label || "Mineral resource"}</div>{m.heroStat.context && <div className="trm-sig-note">{m.heroStat.context}</div>}</div></div>
    </div>
  ) : null;
  if (evNode) S.push({ id: "EVIDENCE", node: evNode });

  // 06 · TREASURY — capital position as a systems readout (only when real capital/economics exist)
  if (econ.length) S.push({ id: "TREASURY", node: (
    <div className="trm-in">
      <div className="trm-scan" />
      {modk("Treasury // position")}
      <div className="trm-treasury">{econ.slice(0, 6).map((e, i) => { const [n, u] = splitNum(e.v); return <div className="tf trm-wipe" style={{ transitionDelay: (0.08 + i * 0.06) + "s" }} key={i}><div className="tfv">{n}{u && <span className="u">{u}</span>}</div><div className="tfk">{e.k}</div></div>; })}</div>
    </div>
  ) });

  // 07 · SYSTEM LOG — record (logged milestones) + forecast (pending catalysts)
  const logRows = [
    ...(m.timeline || []).slice(0, 5).map((t) => ({ t: (t.date || "").slice(0, 10), h: t.headline, w: t.why, pending: false })),
    ...cats.slice(0, 3).map((c) => ({ t: c.timing || "PENDING", h: c.label, w: c.impact, pending: true })),
  ];
  if (logRows.length) S.push({ id: "LOG", node: (
    <div className="trm-in">
      <div className="trm-scan" />
      {modk("System log // record & forecast")}
      <div className="trm-log">{logRows.map((r, i) => <div className={"lg trm-wipe" + (r.pending ? " pend" : "")} style={{ transitionDelay: (0.06 + i * 0.05) + "s" }} key={i}><span className="lt">{r.t}</span><span className="lc"><span className="lh">{r.h}</span>{r.w && <span className="lw">{r.w}</span>}</span><span className="ls">{r.pending ? "PENDING" : "LOGGED"}</span></div>)}</div>
    </div>
  ) });

  // 08 · RESOLVE — the analysis distils into the thesis, then the follow directive as the final state
  S.push({ id: "RESOLVE", node: (
    <div className="trm-in trm-resolve">
      <div className="trm-scan" />
      {modk("Analysis resolved")}
      {why.length > 0 && <div className="trm-concl">{why.map((w, i) => <div className="cc trm-wipe" style={{ transitionDelay: (0.08 + i * 0.07) + "s" }} key={i}><span className="ci">{String(i + 1).padStart(2, "0")}</span><span className="ct">{w}</span></div>)}</div>}
      <div className="trm-final trm-rise" style={{ transitionDelay: ".2s" }}>
        <div className="trm-final-k">Continuous coverage</div>
        <div className="trm-final-name">Follow {m.shortName} on MineEx</div>
        <div className="trm-final-feat">{["Press releases", "Results", "Catalysts", "Media"].map((x) => <span key={x}>{x}</span>)}</div>
      </div>
    </div>
  ) });

  const total = S.length;
  const activeLabel = (S[active] && S[active].id) || "";
  return (
    <div className="trm" ref={scRef}>
      <div className="trm-ground" />
      {S.map((s, i) => <section className={"trm-state" + (revealed.has(i) ? " act" : "")} data-i={i} key={s.id}>{s.node}</section>)}
      <div className="trm-hud">
        <span className="cnr tl" /><span className="cnr tr" /><span className="cnr bl" /><span className="cnr br" />
        <div className="trm-h tl"><span className="g">◆</span> {m.shortName}</div>
        <div className="trm-h tr">{m.tickerLine || m.commodity}<br /><span className="g">● {active === total - 1 ? "RESOLVED" : "ANALYZING"}</span></div>
        <div className="trm-h bl"><span className="g">//</span> {activeLabel}</div>
        <div className="trm-h br">{String(active + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}<div className="trm-meter">{S.map((_, i) => <i className={i <= active ? "on" : ""} key={i} />)}</div></div>
      </div>
    </div>
  );
}

// ── Template 07 · DOSSIER — the investment file ──
// The original DENSE institutional research document, made dynamic WITHOUT losing its density. Assisted
// vertical snap advances the file through DENSE spreads (masthead → flagship evidence → portfolio →
// position → findings); the document responds (sheet reveals, rules drawing, red-pen markup); and the
// signature EVIDENCE STACK physically accumulates the material facts into a filed pile as the case is
// examined, resolving beside the conclusion. Own archival palette (paper · charcoal · vermilion). No map.
const _ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
function Dossier({ m }) {
  const scRef = useRef(null);
  const [active, setActive] = useState(0);
  const [seen, setSeen] = useState(() => new Set([0]));
  useEffect(() => {
    const sc = scRef.current; if (!sc) return;
    const els = [...sc.querySelectorAll(".dz-ex")];
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      const i = +e.target.dataset.i;
      if (!isNaN(i)) { setActive(i); setSeen((p) => { if (p.has(i)) return p; const n = new Set(p); n.add(i); return n; }); }
    }), { root: sc, threshold: 0.5 });
    els.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [m]);

  const { pool, flag, flagImg, best, cats, why, region, econ } = _confStory(m);
  const P = m.projects || [];
  const eV = (re) => (econ.find((e) => re.test(e.k)) || {}).v;
  const mcapV = eV(/market/i), cashV = eV(/cash/i);
  const img = (i) => (pool.length ? pool[((i % pool.length) + pool.length) % pool.length] : "");

  // strongest MATERIAL fact for this company (facts only; adapts — never assumes drilling)
  let mat;
  if (m.heroStat) mat = { v: m.heroStat.value, label: m.heroStat.label || "Mineral resource" };
  else if (best) mat = { v: best.grade, label: "Strongest intercept" };
  else if (mcapV) mat = { v: mcapV, label: "Market capitalization" };
  else if (cashV) mat = { v: cashV, label: "Treasury" };
  else if (cats[0]) mat = { v: cats[0].timing || "Next", label: "Upcoming catalyst" };
  else if (flag.stage) mat = { v: flag.stage, label: "Development stage" };
  else mat = { v: m.commodity || m.shortName, label: "Focus" };
  const drills = (m.flagship.drills || []).slice().sort((a, b) => _gnum(b.grade) - _gnum(a.grade)).slice(0, 4);

  const numbers = [
    m.heroStat && [m.heroStat.label || "Resource", m.heroStat.value],
    m.commodity && ["Commodity", m.commodity],
    region && ["Jurisdiction", region],
    ...econ.slice(0, 4).map((e) => [e.k, e.v]),
  ].filter(Boolean).slice(0, 6);

  // EVIDENCE STACK pieces — accumulate in narrative order (file → photo → material fact → records → capital → catalyst)
  const pieces = [{ type: "file", k: m.tickers[0] || m.shortName, s: "Investment file" }];
  if (flagImg) pieces.push({ type: "photo", img: flagImg, cap: flag.name || m.shortName });
  pieces.push({ type: "fact", v: mat.v, k: mat.label, mark: true });
  P.slice(0, 2).forEach((p) => pieces.push({ type: "record", k: p.stage || p.commodity || "Asset", v: p.name }));
  if (mcapV) pieces.push({ type: "fin", k: "Market cap", v: mcapV });
  if (cashV) pieces.push({ type: "fin", k: "Treasury", v: cashV });
  if (cats[0]) pieces.push({ type: "cat", k: "Next catalyst", v: cats[0].timing || cats[0].label });
  const stack = (count) => {
    const n = Math.min(count, pieces.length);
    return (
      <div className="dz-stack">
        <div className="dz-stack-h">Evidence filed · <b>{n}</b></div>
        <div className="dz-stack-body">
          {pieces.slice(0, n).map((pc, i) => (
            <div className={"dz-pc dz-pc-" + pc.type + (i === n - 1 ? " new" : "")} style={{ "--i": i }} key={i}>
              {pc.type === "photo" ? <><img src={pc.img} alt="" /><span className="pcap">{pc.cap}</span></>
                : pc.type === "file" ? <><span className="pk">{pc.k}</span><span className="ps">{pc.s}</span></>
                  : <><span className="pk">{pc.k}</span><span className={"pv" + (pc.mark ? " mk" : "")}>{pc.v}</span></>}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const EX = [];

  // 01 · THE FILE — dense masthead: identity, listing, jurisdiction, thesis
  EX.push({ k: "The file", node: (
    <div className="dz-spread">
      <div className="dz-main">
        <div className="dz-ex-k dz-up">MineEx · Confidential Investment File</div>
        <div className="dz-rule" />
        <h1 className="dz-name dz-up">{m.name.replace(/\.$/, "")}</h1>
        {m.tagline && <div className="dz-sub dz-up">{m.tagline}</div>}
        <div className="dz-metaline dz-up">{[m.commodity, region, flag.stage, m.tickerLine].filter(Boolean).join("     ·     ")}</div>
        <div className="dz-rule d2" />
        {m.thesis && <p className="dz-lede dz-up">{m.thesis}</p>}
      </div>
      {stack(1)}
    </div>
  ) });

  // 02 · FLAGSHIP — the primary asset record; intercepts marked in red pen
  if (flag.name) EX.push({ k: "Flagship", node: (
    <div className="dz-spread">
      <div className="dz-main">
        <div className="dz-ex-k dz-up">Exhibit A · Flagship record</div>
        <h2 className="dz-h2 dz-up">{flag.name}</h2>
        <div className="dz-metaline dz-up">{[flag.location, flag.ownership && flag.ownership + " owned", flag.land, flag.stage].filter(Boolean).join("     ·     ")}</div>
        {flag.overview && <p className="dz-p clip3 dz-up">{flag.overview}</p>}
        {drills.length > 0 && <div className="dz-insert dz-up">
          <div className="it">From the core · reported intercepts</div>
          {drills.map((d, i) => <div className={"ir" + (i === 0 ? " top" : "")} key={i}><span className="h">{d.hole || "—"}</span><span>{d.interval || ""}</span><span className="g">{d.grade || "—"}</span></div>)}
        </div>}
      </div>
      {stack(flagImg ? 3 : 2)}
    </div>
  ) });

  // 03 · PORTFOLIO — projects as file records (dense; flagship deeper, secondaries lighter)
  if (P.length > 1) EX.push({ k: "Portfolio", node: (
    <div className="dz-spread">
      <div className="dz-main">
        <div className="dz-ex-k dz-up">The portfolio · {P.length} assets</div>
        <div className="dz-recs">
          {P.slice(0, 4).map((p, i) => (
            <div className="dz-chap dz-up" style={{ transitionDelay: (0.06 + i * 0.06) + "s" }} key={i}>
              <div className="rn">{_ROMAN[i] || i + 1}</div>
              <div><h3>{p.name}</h3><div className="pm">{[p.stage, p.commodity, p.location, p.ownership && p.ownership + " owned"].filter(Boolean).join("  ·  ")}</div>{p.overview && <p>{p.overview}</p>}</div>
            </div>
          ))}
        </div>
      </div>
      {stack((flagImg ? 3 : 2) + Math.min(2, P.length))}
    </div>
  ) });

  // 04 · POSITION — capital & catalysts, dense; the next catalyst flagged for watch
  if (numbers.length || cats[0]) EX.push({ k: "Position", node: (
    <div className="dz-spread">
      <div className="dz-main">
        <div className="dz-ex-k dz-up">Exhibit B · Position &amp; catalysts</div>
        {numbers.length > 0 && <div className="dz-numbers dz-up">{numbers.map((r, i) => <div className="nr" key={i}><span className="k">{r[0]}</span><span className="v">{r[1]}</span></div>)}</div>}
        {(cats[0] || (m.timeline && m.timeline[0])) && <div className="dz-watch dz-up">
          <div className="it">What to watch</div>
          {cats[0] && <div className="wr"><span className="wt">{cats[0].timing || "Upcoming"}</span><span className="wl">{cats[0].label}</span><span className="wtag">Watch</span></div>}
          {m.timeline && m.timeline[0] && <div className="wr rec"><span className="wt">{(m.timeline[0].date || "").slice(0, 10)}</span><span className="wl">{m.timeline[0].headline}</span></div>}
        </div>}
      </div>
      {stack(pieces.length)}
    </div>
  ) });

  // 05 · FINDINGS — the case resolves; the accumulated evidence beside the conclusion + follow action
  EX.push({ k: "Findings", node: (
    <div className="dz-spread dz-final">
      <div className="dz-main">
        <div className="dz-ex-k dz-up">Findings</div>
        {why.length > 0 && <div className="dz-finds">{why.map((w, i) => <div className="fnd dz-up" style={{ transitionDelay: (0.06 + i * 0.07) + "s" }} key={i}><span className="fn">{_ROMAN[i]}</span><span className="ft">{w}</span></div>)}</div>}
        {m.team.length > 0 && <div className="dz-princ dz-up"><span className="pk">Principals</span> {m.team.slice(0, 4).map((p) => p.name).join("  ·  ")}</div>}
        <div className="dz-close dz-up"><div className="dz-close-name">Follow {m.shortName} on MineEx</div><div className="dz-close-sub">Continue the file — press releases, results, catalysts &amp; media</div></div>
      </div>
      {stack(pieces.length)}
    </div>
  ) });

  const total = EX.length;
  return (
    <div className="dz dz-file" ref={scRef}>
      {EX.map((e, i) => <section className={"dz-ex" + (seen.has(i) ? " on" : "")} data-i={i} key={i}>{e.node}</section>)}
      <div className="dz-run">MineEx Investment File — {m.shortName}</div>
      <div className="dz-folio">— {String(active + 1).padStart(2, "0")} / {String(total).padStart(2, "0")} —<span className="fl">·  {(EX[active] || {}).k}</span></div>
    </div>
  );
}

// ── Template 08 · INDEX — ultra-minimal ──
function IndexTpl({ m }) {
  return (
    <>
    <div className="idx">
      <div className="top rise"><span>{m.name}</span><span>{m.tickers[0] || ""}</span></div>
      <h1 className="rise scale" style={{ transitionDelay: ".12s" }}>{m.heroStat ? <>{m.heroStat.value}<br /><em>{[m.commodity, m.geo.region || m.geo.place].filter(Boolean).join(" · ")}</em></> : m.name}</h1>
      {m.stats.length > 0 && <div className="figs rise">{m.stats.slice(0, 4).map((s, i) => <div className="fg" key={i}><div className="n tabnum">{s.v}</div><div className="l">{s.k}</div></div>)}</div>}
      <div className="foot-line rise">{m.tagline || "Follow on MineEx"}</div>
    </div>
    <IndexBody m={m} /><FollowBlock m={m} />
    </>
  );
}

// canvas helpers
const cvHexA = (hex, a) => { hex = (hex || "#c9a86a").replace("#", ""); if (hex.length === 3) hex = hex.replace(/./g, (c) => c + c); const n = parseInt(hex, 16); return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")"; };
function sizeCanvasEl(cv) { const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.max(1, r.width * dpr); cv.height = Math.max(1, r.height * dpr); return dpr; }

// ── Template 09 · PULSE — aurora / luminous / atmospheric ──
// A persistent aurora FIELD (one optimized canvas) breathes behind the whole experience and reacts to
// scroll; cinematic snap BEATS; content revealed by LUMINANCE SWEEPS (never fade-up); the signature body
// moment is THE READING — luminous curtains encoding the company's strongest REAL evidence. Milestones
// travel as points of light; the ending converges into the follow. Own palette (midnight · teal · violet).
function Pulse({ m }) {
  const scRef = useRef(null); const fieldRef = useRef(null);
  const [seen, setSeen] = useState(() => new Set([0]));
  // aurora FIELD — one canvas, additive luminous curtains, slow breathing, depth, scroll-reactive.
  useEffect(() => {
    const host = fieldRef.current; if (!host) return; const cv = host.querySelector("canvas"); if (!cv) return;
    const ctx = cv.getContext("2d"); const reduce = matchMedia("(prefers-reduced-motion:reduce)").matches;
    let raf = 0, t = 0, W = 0, H = 0, dpr = 1; const stars = [];
    const size = () => { dpr = Math.min(1.6, window.devicePixelRatio || 1); const r = host.getBoundingClientRect(); W = cv.width = Math.max(1, Math.round(r.width * dpr)); H = cv.height = Math.max(1, Math.round(r.height * dpr)); stars.length = 0; for (let i = 0; i < 64; i++) stars.push([Math.random() * W, Math.random() * H * 0.72, Math.random() * 1.1 * dpr + 0.3, Math.random()]); };
    size(); const onR = () => size(); window.addEventListener("resize", onR);
    const hues = [[63, 224, 192], [110, 222, 140], [154, 134, 242], [79, 186, 232], [63, 224, 192]];
    const sc = scRef.current;
    const draw = () => {
      raf = requestAnimationFrame(draw); if (!reduce) t += 0.0042;
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#070c18"); g.addColorStop(0.55, "#060912"); g.addColorStop(1, "#04060d");
      ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const st = sc ? sc.scrollTop : 0, vh = sc ? (sc.clientHeight || 1) : H, prog = st / vh;
      const intensity = Math.max(0.34, 1 - prog * 0.42), rise = Math.min(H * 0.12, prog * H * 0.02), breathe = 0.78 + 0.22 * Math.sin(t * 1.6);
      ctx.globalCompositeOperation = "lighter";
      for (const s of stars) { const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + s[3] * 6)); ctx.fillStyle = "rgba(200,220,255," + (0.5 * tw * intensity).toFixed(3) + ")"; ctx.fillRect(s[0], s[1] - rise * 0.3, s[2], s[2]); }
      const N = 5, step = Math.max(10, W / 64);
      for (let i = 0; i < N; i++) {
        const depth = i / (N - 1), base = H * (0.34 + depth * 0.15) + Math.sin(t * 0.7 + i * 1.3) * H * 0.025 - rise, amp = H * (0.07 + depth * 0.035), sp = 0.5 + depth * 0.5;
        ctx.beginPath(); ctx.moveTo(0, H);
        for (let x = 0; x <= W; x += step) { const y = base + Math.sin(x * 0.0022 + t * sp + i) * amp + Math.sin(x * 0.0051 + t * sp * 1.4 + i * 2) * amp * 0.5; ctx.lineTo(x, y); }
        ctx.lineTo(W, H); ctx.closePath();
        const c = hues[i % hues.length], a = (0.26 + depth * 0.07) * breathe * (0.6 + intensity * 0.5), gg = ctx.createLinearGradient(0, base - amp * 2.2, 0, base + amp * 3.5);
        gg.addColorStop(0, "rgba(" + c[0] + "," + c[1] + "," + c[2] + ",0)"); gg.addColorStop(0.14, "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + (a * 0.6).toFixed(3) + ")"); gg.addColorStop(0.34, "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a.toFixed(3) + ")"); gg.addColorStop(1, "rgba(" + c[0] + "," + c[1] + "," + c[2] + ",0)");
        ctx.fillStyle = gg; ctx.fill();
      }
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onR); };
  }, []);
  // beats reveal (play-once, no replay)
  useEffect(() => {
    const sc = scRef.current; if (!sc) return; const els = [...sc.querySelectorAll(".pls-beat")];
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (!e.isIntersecting) return; const i = +e.target.dataset.i; if (!isNaN(i)) setSeen((p) => { if (p.has(i)) return p; const n = new Set(p); n.add(i); return n; }); }), { root: sc, threshold: 0.4 });
    els.forEach((s) => io.observe(s)); return () => io.disconnect();
  }, [m]);

  const { pool, flag, flagImg, best, cats, why, region, econ } = _confStory(m);
  const P = m.projects || [];
  const splitNum = (s) => { const mm = String(s == null ? "" : s).match(/^\s*([~<>]?[\d.,]+)\s*(.*)$/); return mm ? [mm[1], mm[2]] : [String(s == null ? "" : s), ""]; };
  const img = (i) => (pool.length ? pool[((i % pool.length) + pool.length) % pool.length] : "");

  // THE READING — luminous curtains from REAL numeric intercepts; else a resource/material crest.
  const curtains = (m.flagship.drills || []).map((d) => ({ lab: d.hole, val: d.grade, n: _gnum(d.grade) })).filter((c) => c.n > 0).sort((a, b) => b.n - a.n).slice(0, 6);
  const maxN = curtains.length ? Math.max(...curtains.map((c) => c.n)) : 1;
  let crest;
  if (m.heroStat) { const [n, u] = splitNum(m.heroStat.value); crest = { n, u, label: m.heroStat.label || "Mineral resource", pts: m.highlights.slice(1, 4).map((h) => [h.value, h.label]) }; }
  else if (best) { const [n, u] = splitNum(best.grade); crest = { n, u, label: "Strongest intercept", pts: [[best.interval, "interval"], [best.hole, "hole"]].filter((x) => x[0]) }; }
  else if (econ[0]) { const [n, u] = splitNum(econ[0].v); crest = { n, u, label: econ[0].k, pts: econ.slice(1, 4).map((e) => [e.v, e.k]) }; }
  else { crest = { n: m.commodity || m.shortName, u: "", label: "Focus", pts: [] }; }

  const capBig = econ.find((e) => /market/i.test(e.k)) || econ.find((e) => /cash/i.test(e.k)) || econ[0];
  const capSide = econ.filter((e) => e !== capBig).slice(0, 5);
  const others = P.filter((p) => p.name !== flag.name);
  const events = [...(m.timeline || []).slice(0, 5).map((tl) => ({ d: (tl.date || "").slice(0, 10), h: tl.headline, next: false })), ...cats.slice(0, 2).map((c) => ({ d: c.timing || "Next", h: c.label, next: true }))];

  const B = [];

  // 1 · HERO — identity under the aurora
  B.push(
    <>
      <div className="pls-in pls-hero">
        <div className="ek pls-sw">{[m.geo.lat != null ? Math.round(Math.abs(m.geo.lat)) + "°" + (m.geo.lat >= 0 ? "N" : "S") : "", region].filter(Boolean).join("  ·  ") || m.commodity}</div>
        <h1 className="pls-sw pls-glow">{m.heroStat ? <>{splitNum(m.heroStat.value)[0]}<em> {splitNum(m.heroStat.value)[1] || (m.commodity || "")}</em></> : m.name.replace(/\.$/, "")}</h1>
        {m.thesis && <p className="lede pls-sw">{m.thesis}</p>}
        {m.tickerLine && <span className="tk pls-sw"><span className="dot" />{m.tickerLine}</span>}
      </div>
      <div className="pls-cue">Scroll ↓</div>
    </>
  );

  // 2 · THE READING — signature luminous evidence
  B.push(
    <div className="pls-in">
      <div className="pls-k">The reading</div>
      {curtains.length >= 2 ? (
        <>
          <div className="pls-read-head"><div className="pls-sw" style={{ fontSize: "clamp(22px,3vw,40px)", fontWeight: 800, letterSpacing: "-.02em" }}>Strongest intercepts</div><div className="pls-sw" style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--dim)" }}>{m.commodity || "grade"} · reported</div></div>
          <div className="pls-read">{curtains.map((c, i) => <div className={"pls-cur" + (i === 0 ? " peak" : "")} style={{ "--h": Math.max(14, Math.round(c.n / maxN * 100)) + "%", "--d": (0.1 + i * 0.08) + "s" }} key={i}><span className="val">{c.val}</span><span className="col" /><span className="lab">{c.lab}</span></div>)}</div>
          <div className="pls-read-note">Reported grades — interval widths as disclosed; no drill geometry implied.</div>
        </>
      ) : (
        <div className="pls-crest">
          <div className="big pls-sw pls-glow">{crest.n}{crest.u && <em>{crest.u}</em>}</div>
          <div className="pts">
            <div className="pt pls-sw" style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--accent)" }}>{crest.label}</div>
            {crest.pts.map(([v, k], i) => <div className="pt pls-sw" style={{ transitionDelay: (0.1 + i * 0.08) + "s" }} key={i}><b>{v}</b> {k}</div>)}
          </div>
        </div>
      )}
    </div>
  );

  // 3 · FLAGSHIP — cinematic image window opening
  if (flag.name) B.push(
    <div className="pls-in pls-img">
      <div className="pls-imgwin">{flagImg ? <img src={flagImg} alt="" /> : <div style={{ width: "100%", height: "100%", background: "var(--bg2)" }} />}<span className="cap">{flag.location || flag.name}</span></div>
      <div className="pls-imgtxt">
        <div className="pls-k">Flagship</div>
        <h2 className="t pls-sw">{flag.name}</h2>
        <div className="meta pls-sw">{[flag.stage, flag.commodity || m.commodity, flag.ownership && flag.ownership + " owned", flag.land].filter(Boolean).join("   ·   ")}</div>
        {flag.overview && <p className="pls-sw">{flag.overview}</p>}
      </div>
    </div>
  );

  // 4 · OTHER PROJECTS — alternating cinematic crops (dynamic count)
  others.slice(0, 3).forEach((p, i) => B.push(
    <div className={"pls-in pls-img" + (i % 2 === 0 ? " rev" : "")}>
      <div className="pls-imgwin">{(p.image || img(i + 2)) ? <img src={p.image || img(i + 2)} alt="" /> : <div style={{ width: "100%", height: "100%", background: "var(--bg2)" }} />}<span className="cap">{p.location || p.name}</span></div>
      <div className="pls-imgtxt">
        <div className="pls-k">Project {String(i + 2).padStart(2, "0")}</div>
        <h2 className="t pls-sw">{p.name}</h2>
        <div className="meta pls-sw">{[p.stage, p.commodity, p.location, p.ownership && p.ownership + " owned"].filter(Boolean).join("   ·   ")}</div>
        {p.overview && <p className="pls-sw">{p.overview}</p>}
      </div>
    </div>
  ));

  // 5 · CAPITAL — a number as an event
  if (capBig) B.push(
    <div className="pls-in">
      <div className="pls-k">Position</div>
      <div className="pls-fig">
        <div className="num pls-sw pls-glow">{splitNum(capBig.v)[0]}{splitNum(capBig.v)[1] && <em>{splitNum(capBig.v)[1]}</em>}</div>
        <div className="side">
          <div className="sr pls-sw" style={{ borderTopColor: "transparent" }}><span className="k">{capBig.k}</span><span className="v" /></div>
          {capSide.map((e, i) => <div className="sr pls-sw" style={{ transitionDelay: (0.1 + i * 0.06) + "s" }} key={i}><span className="k">{e.k}</span><span className="v">{e.v}</span></div>)}
        </div>
      </div>
    </div>
  );

  // 6 · PROGRESSION — milestones as points of light travelling toward the next catalyst
  if (events.length) B.push(
    <div className="pls-in">
      <div className="pls-k">Momentum</div>
      <div className="pls-prog">{events.map((e, i) => <div className={"pls-mi" + (e.next ? " next" : "")} style={{ "--d": (0.2 + i * 0.1) + "s" }} key={i}><span className="d">{e.d}</span><span className="h pls-sw">{e.h}</span></div>)}</div>
    </div>
  );

  // 7 · WHY — the case, luminous
  if (why.length) B.push(
    <div className="pls-in">
      <div className="pls-k">Why it matters</div>
      <div className="pls-why">{why.map((w, i) => <div className="w" key={i}><span className="n">{String(i + 1).padStart(2, "0")}</span><span className="t pls-sw" style={{ transitionDelay: (i * 0.08) + "s" }}>{w}</span></div>)}</div>
      {m.team.length > 0 && <div className="pls-team">{m.team.slice(0, 6).map((p, i) => <div className="tm pls-sw" style={{ transitionDelay: (0.1 + i * 0.05) + "s" }} key={i}><div className="nm">{p.name}</div><div className="ro">{p.role}</div></div>)}</div>}
    </div>
  );

  // 8 · RESOLUTION — the aurora converges into the follow
  B.push(
    <div className="pls-in pls-cta">
      <div className="conv pls-sw">The signal continues</div>
      <h2 className="pls-sw pls-glow">{m.shortName}</h2>
      {m.tickerLine && <div className="pls-sw" style={{ fontFamily: "var(--mono)", fontSize: 12, letterSpacing: ".08em", color: "var(--dim)", marginTop: 16 }}>{m.tickerLine}</div>}
      <div className="feat pls-sw">{["Press releases", "Results", "Catalysts", "Media"].map((x) => <span key={x}>{x}</span>)}</div>
      <div className="go pls-sw">Follow on MineEx →</div>
    </div>
  );

  return (
    <div className="pulse" ref={scRef}>
      <div className="pulse-field" ref={fieldRef}><canvas /></div>
      {B.map((node, i) => <section className={"pls-beat" + (seen.has(i) ? " on" : "")} data-i={i} key={i}>{node}</section>)}
    </div>
  );
}

// ── Template 09b · PULSE II — the ORIGINAL Pulse (aurora canvas hero + feature body), preserved as a
// second creative direction alongside the refined Pulse above. Same universal data, unchanged. ──
function Pulse2({ m }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return; const ctx = cv.getContext("2d"); let raf, t = 0;
    const reduce = matchMedia("(prefers-reduced-motion:reduce)").matches;
    sizeCanvasEl(cv); const onR = () => sizeCanvasEl(cv); window.addEventListener("resize", onR);
    const rv = (n) => getComputedStyle(cv).getPropertyValue(n).trim();
    const draw = () => {
      const w = cv.width, h = cv.height; ctx.clearRect(0, 0, w, h); if (!reduce) t += 0.006; const acc = rv("--accent") || "#c9a86a";
      for (let i = 0; i < 5; i++) {
        ctx.beginPath(); const base = h * (0.42 + i * 0.1), amp = h * 0.05; ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += Math.max(8, w / 90)) { const y = base + Math.sin(x * 0.004 + t + i) * amp + Math.sin(x * 0.009 + t * 1.3 + i * 2) * amp * 0.6; ctx.lineTo(x, y); }
        ctx.lineTo(w, h); ctx.closePath(); ctx.fillStyle = cvHexA(acc, 0.045 + i * 0.012); ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onR); };
  }, []);
  return (
    <>
      <section className="pulse-hero">
        <canvas ref={ref} />
        <div className="pc">
          <div className="ek rise">{[m.geo.lat != null ? Math.round(m.geo.lat) + "°N" : "", m.geo.place].filter(Boolean).join(" · ") || "Under the aurora"}</div>
          <h1 className="rise blur" style={{ transitionDelay: ".15s" }}>{m.heroStat ? <>{m.heroStat.value}<br />of {m.commodity || "gold"}.</> : m.name}</h1>
          {m.thesis && <p className="lede rise">{m.thesis}</p>}
          {m.tickerLine && <span className="ticker rise"><span className="dot" />{m.tickerLine}</span>}
        </div>
      </section>
      <PulseBody2 m={m} />
    </>
  );
}

// Improved body for PULSE II — keeps the original aurora hero above, but replaces the old static feature
// list with the refined Pulse motion system (luminance sweeps, THE READING curtains, cinematic imagery,
// number-as-event, milestone light-progression, resolution) rendered in the original gold palette.
function PulseBody2({ m }) {
  const ref = useRef(null);
  useEffect(() => {
    const host = ref.current; if (!host) return; const root = host.closest(".cv3");
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) e.target.classList.add("on"); }), { root: root || null, threshold: 0.32 });
    [...host.querySelectorAll(".pls-beat")].forEach((s) => io.observe(s)); return () => io.disconnect();
  }, [m]);

  const { pool, flag, flagImg, best, cats, why, region, econ } = _confStory(m);
  const P = m.projects || [];
  const splitNum = (s) => { const mm = String(s == null ? "" : s).match(/^\s*([~<>]?[\d.,]+)\s*(.*)$/); return mm ? [mm[1], mm[2]] : [String(s == null ? "" : s), ""]; };
  const img = (i) => (pool.length ? pool[((i % pool.length) + pool.length) % pool.length] : "");
  const curtains = (m.flagship.drills || []).map((d) => ({ lab: d.hole, val: d.grade, n: _gnum(d.grade) })).filter((c) => c.n > 0).sort((a, b) => b.n - a.n).slice(0, 6);
  const maxN = curtains.length ? Math.max(...curtains.map((c) => c.n)) : 1;
  let crest;
  if (m.heroStat) { const [n, u] = splitNum(m.heroStat.value); crest = { n, u, label: m.heroStat.label || "Mineral resource", pts: m.highlights.slice(1, 4).map((h) => [h.value, h.label]) }; }
  else if (best) { const [n, u] = splitNum(best.grade); crest = { n, u, label: "Strongest intercept", pts: [[best.interval, "interval"], [best.hole, "hole"]].filter((x) => x[0]) }; }
  else if (econ[0]) { const [n, u] = splitNum(econ[0].v); crest = { n, u, label: econ[0].k, pts: econ.slice(1, 4).map((e) => [e.v, e.k]) }; }
  else { crest = { n: m.commodity || m.shortName, u: "", label: "Focus", pts: [] }; }
  const capBig = econ.find((e) => /market/i.test(e.k)) || econ.find((e) => /cash/i.test(e.k)) || econ[0];
  const capSide = econ.filter((e) => e !== capBig).slice(0, 5);
  const others = P.filter((p) => p.name !== flag.name);
  const events = [...(m.timeline || []).slice(0, 5).map((tl) => ({ d: (tl.date || "").slice(0, 10), h: tl.headline, next: false })), ...cats.slice(0, 2).map((c) => ({ d: c.timing || "Next", h: c.label, next: true }))];

  const B = [];
  // THE READING — luminous evidence
  B.push(
    <div className="pls-in">
      <div className="pls-k">The reading</div>
      {curtains.length >= 2 ? (
        <>
          <div className="pls-read-head"><div className="pls-sw" style={{ fontSize: "clamp(22px,3vw,40px)", fontWeight: 800, letterSpacing: "-.02em" }}>Strongest intercepts</div><div className="pls-sw" style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--dim)" }}>{m.commodity || "grade"} · reported</div></div>
          <div className="pls-read">{curtains.map((c, i) => <div className={"pls-cur" + (i === 0 ? " peak" : "")} style={{ "--h": Math.max(14, Math.round(c.n / maxN * 100)) + "%", "--d": (0.1 + i * 0.08) + "s" }} key={i}><span className="val">{c.val}</span><span className="col" /><span className="lab">{c.lab}</span></div>)}</div>
          <div className="pls-read-note">Reported grades — interval widths as disclosed; no drill geometry implied.</div>
        </>
      ) : (
        <div className="pls-crest">
          <div className="big pls-sw pls-glow">{crest.n}{crest.u && <em>{crest.u}</em>}</div>
          <div className="pts">
            <div className="pt pls-sw" style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--accent)" }}>{crest.label}</div>
            {crest.pts.map(([v, k], i) => <div className="pt pls-sw" style={{ transitionDelay: (0.1 + i * 0.08) + "s" }} key={i}><b>{v}</b> {k}</div>)}
          </div>
        </div>
      )}
    </div>
  );
  // FLAGSHIP — cinematic image window
  if (flag.name) B.push(
    <div className="pls-in pls-img">
      <div className="pls-imgwin">{flagImg ? <img src={flagImg} alt="" /> : <div style={{ width: "100%", height: "100%", background: "var(--bg2)" }} />}<span className="cap">{flag.location || flag.name}</span></div>
      <div className="pls-imgtxt"><div className="pls-k">Flagship</div><h2 className="t pls-sw">{flag.name}</h2><div className="meta pls-sw">{[flag.stage, flag.commodity || m.commodity, flag.ownership && flag.ownership + " owned", flag.land].filter(Boolean).join("   ·   ")}</div>{flag.overview && <p className="pls-sw">{flag.overview}</p>}</div>
    </div>
  );
  // OTHER PROJECTS
  others.slice(0, 3).forEach((p, i) => B.push(
    <div className={"pls-in pls-img" + (i % 2 === 0 ? " rev" : "")}>
      <div className="pls-imgwin">{(p.image || img(i + 2)) ? <img src={p.image || img(i + 2)} alt="" /> : <div style={{ width: "100%", height: "100%", background: "var(--bg2)" }} />}<span className="cap">{p.location || p.name}</span></div>
      <div className="pls-imgtxt"><div className="pls-k">Project {String(i + 2).padStart(2, "0")}</div><h2 className="t pls-sw">{p.name}</h2><div className="meta pls-sw">{[p.stage, p.commodity, p.location, p.ownership && p.ownership + " owned"].filter(Boolean).join("   ·   ")}</div>{p.overview && <p className="pls-sw">{p.overview}</p>}</div>
    </div>
  ));
  // CAPITAL — number as event
  if (capBig) B.push(
    <div className="pls-in">
      <div className="pls-k">Position</div>
      <div className="pls-fig">
        <div className="num pls-sw pls-glow">{splitNum(capBig.v)[0]}{splitNum(capBig.v)[1] && <em>{splitNum(capBig.v)[1]}</em>}</div>
        <div className="side"><div className="sr pls-sw" style={{ borderTopColor: "transparent" }}><span className="k">{capBig.k}</span><span className="v" /></div>{capSide.map((e, i) => <div className="sr pls-sw" style={{ transitionDelay: (0.1 + i * 0.06) + "s" }} key={i}><span className="k">{e.k}</span><span className="v">{e.v}</span></div>)}</div>
      </div>
    </div>
  );
  // PROGRESSION — milestones as travelling light
  if (events.length) B.push(
    <div className="pls-in">
      <div className="pls-k">Momentum</div>
      <div className="pls-prog">{events.map((e, i) => <div className={"pls-mi" + (e.next ? " next" : "")} style={{ "--d": (0.2 + i * 0.1) + "s" }} key={i}><span className="d">{e.d}</span><span className="h pls-sw">{e.h}</span></div>)}</div>
    </div>
  );
  // WHY + TEAM
  if (why.length) B.push(
    <div className="pls-in">
      <div className="pls-k">Why it matters</div>
      <div className="pls-why">{why.map((w, i) => <div className="w" key={i}><span className="n">{String(i + 1).padStart(2, "0")}</span><span className="t pls-sw" style={{ transitionDelay: (i * 0.08) + "s" }}>{w}</span></div>)}</div>
      {m.team.length > 0 && <div className="pls-team">{m.team.slice(0, 6).map((p, i) => <div className="tm pls-sw" style={{ transitionDelay: (0.1 + i * 0.05) + "s" }} key={i}><div className="nm">{p.name}</div><div className="ro">{p.role}</div></div>)}</div>}
    </div>
  );
  // RESOLUTION
  B.push(
    <div className="pls-in pls-cta">
      <div className="conv pls-sw">The signal continues</div>
      <h2 className="pls-sw pls-glow">{m.shortName}</h2>
      {m.tickerLine && <div className="pls-sw" style={{ fontFamily: "var(--mono)", fontSize: 12, letterSpacing: ".08em", color: "var(--dim)", marginTop: 16 }}>{m.tickerLine}</div>}
      <div className="feat pls-sw">{["Press releases", "Results", "Catalysts", "Media"].map((x) => <span key={x}>{x}</span>)}</div>
      <div className="go pls-sw">Follow on MineEx →</div>
    </div>
  );

  return <div ref={ref}>{B.map((node, i) => <section className="pls-beat pls-b2" data-i={i} key={i}>{node}</section>)}</div>;
}

// ── Template 10 · ORBIT (rebuild) — "information has gravity" ──
// A globe opens on the company's TRUTHFUL jurisdiction, then RELEASES into a persistent gravitational
// FIELD where the company's real facts (imagery, numbers, projects, capital, catalyst) gain/lose mass
// (= luminance) and migrate, finally CONVERGING into the thesis. Same universal data; Orbit-specific
// storytelling. Adapts to project count, company type and available data. Never fabricates geography.
function Orbit({ m }) {
  const scRef = useRef(null), globeRef = useRef(null);
  const [state, setState] = useState(0);
  const [sel, setSel] = useState(0);
  const stRef = useRef("open");
  const { pool, flag, flagImg, best, cats, why, region, econ, ctaFeatures } = _confStory(m);
  const splitNum = (s) => { const mm = String(s == null ? "" : s).match(/^\s*([~<>]?[\d.,]+)\s*(.*)$/); return mm ? [mm[1], mm[2]] : [String(s == null ? "" : s), ""]; };
  const nilish = (v) => /(^|\b)(nil|none|no|zero|0)\b/i.test(String(v));
  const hasJ = m.geo.lat != null && m.geo.lng != null;
  const thesis = m.tagline || m.thesis || ("Follow " + m.shortName);

  // strongest MATERIAL evidence for this company (adaptive; never assumes drilling/resource)
  let evi = null;
  if (m.heroStat) { const [n, u] = splitNum(m.heroStat.value); evi = { n, u, label: m.heroStat.label || "Mineral resource" }; }
  else if (best) { evi = { n: best.grade, u: "", label: "Strongest intercept" }; }
  else if (econ.find((e) => /mine life|aisc/i.test(e.k))) { const e = econ.find((e) => /mine life|aisc/i.test(e.k)); const [n, u] = splitNum(e.v); evi = { n, u, label: e.k }; }
  else if (flag.land) { evi = { n: flag.land, u: "", label: "Land position" }; }
  else if (flag.stage) { evi = { n: flag.stage, u: "", label: "Development stage" }; }
  // capital hierarchy (derived, never a hard-coded slot)
  const score = (f) => { const k = f.k.toLowerCase(); if (/debt/.test(k)) return nilish(f.v) ? 9.0 : 6; if (/cash|treasur/.test(k)) return 9.3; if (/mine life|aisc/.test(k)) return 8.5; if (/market cap/.test(k)) return 7; if (/outstanding/.test(k)) return 5; if (/dilut/.test(k)) return 4.2; return 2.5; };
  let capF = [...m.capital.map(([k, v]) => ({ k, v })), ...econ.filter((e) => /mine life|aisc/i.test(e.k)).map((e) => ({ k: e.k, v: e.v }))].filter((f) => f.v).map((f) => ({ ...f, s: score(f) })).sort((a, b) => b.s - a.s);
  const capP = capF[0], capS = capF[1];
  const others = m.projects.filter((p) => p.name !== flag.name);

  // ── the MASSES (real company facts) ──
  const M = [];
  M.push({ id: "id", kind: "ident", mv: m.shortName, ms: m.tickerLine });
  if (flagImg) M.push({ id: "img", kind: "img", src: flagImg, cap: flag.location || flag.name || "" });
  if (flag.name) M.push({ id: "flag", kind: "text", ml: "Flagship", mv: flag.name });
  if (evi) M.push({ id: "evi", kind: "num", ml: evi.label, mv: evi.n, mu: evi.u });
  if (capP) { const df = /debt/i.test(capP.k) && nilish(capP.v); const [n, u] = df ? ["Zero", ""] : splitNum(capP.v); M.push({ id: "cap", kind: "num", ml: df ? "Debt" : capP.k, mv: n, mu: u }); }
  if (capS) { const [n, u] = splitNum(capS.v); M.push({ id: "cap2", kind: "num", ml: capS.k, mv: n, mu: u }); }
  if (cats[0]) M.push({ id: "cat", kind: "text", ml: "Next" + (cats[0].timing ? " · " + cats[0].timing : ""), mv: cats[0].label });
  others.slice(0, 4).forEach((p, i) => M.push({ id: "p" + i, kind: "proj", mv: p.name, ms: [p.stage, p.location].filter(Boolean).join(" · "), pick: true, projIdx: i }));
  const has = (id) => M.some((x) => x.id === id);
  const projIds = M.filter((x) => x.kind === "proj").map((x) => x.id);

  // ── the STATE sequence (adaptive) ──
  const S = [{ id: "open", focus: ["id"] }];
  if (hasJ) S.push({ id: "place" });
  if (has("img") || has("flag")) S.push({ id: "owns", focus: has("img") ? ["img"] : ["flag"], support: has("img") && has("flag") ? ["flag"] : [], orbit: projIds });
  if (has("evi")) S.push({ id: "evidence", focus: ["evi"], support: [has("img") ? "img" : "", has("flag") ? "flag" : ""].filter(Boolean) });
  if (has("cap")) S.push({ id: "capital", focus: ["cap"], support: has("cap2") ? ["cap2"] : [] });
  if (has("cat")) S.push({ id: "next", focus: ["cat"], support: has("cap") ? ["cap"] : [] });
  S.push({ id: "converge" });
  S.push({ id: "follow" });
  const cur = S[Math.min(state, S.length - 1)] || S[0];
  stRef.current = cur.id;

  // ── GLOBE — dotted sphere with REAL land + truthful jurisdiction marker; zooms to face the jurisdiction
  //    from the "place" state on, then fades as the field takes over. No fabricated precision. ──
  useEffect(() => {
    if (!hasJ) return; const cv = globeRef.current; if (!cv) return; const ctx = cv.getContext("2d");
    const reduce = matchMedia("(prefers-reduced-motion:reduce)").matches;
    let land = []; fetch("/geo/land.json").then((r) => r.json()).then((d) => { land = d; }).catch(() => {});
    let raf = 0, autoRot = 0, face = 0, zoom = 1, alpha = 1;
    sizeCanvasEl(cv); requestAnimationFrame(() => requestAnimationFrame(() => sizeCanvasEl(cv)));
    const onR = () => sizeCanvasEl(cv); window.addEventListener("resize", onR);
    const rv = (n) => getComputedStyle(cv).getPropertyValue(n).trim();
    const P = Math.PI, jLa = m.geo.lat, jLo = m.geo.lng, mix = (a, b, t) => a + (b - a) * t;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const st = stRef.current;
      const tF = st === "open" ? 0 : 1, tZ = st === "open" ? 1 : (st === "place" ? 1.85 : 2.05), tA = (st === "open" || st === "place") ? 1 : 0;
      face += (tF - face) * 0.05; zoom += (tZ - zoom) * 0.05; alpha += (tA - alpha) * 0.07;
      const w = cv.width, h = cv.height; ctx.clearRect(0, 0, w, h);
      if (alpha < 0.012) return;
      if (!reduce) autoRot += 0.0016;
      const dpr = Math.min(2, window.devicePixelRatio || 1), R = Math.min(w, h) * 0.34 * zoom, cx = w / 2, cy = h / 2;
      const rotY = mix(autoRot, -jLo * P / 180, face), tiltX = (jLa * P / 180) * face;
      const ink = rv("--ink") || "#e7ebf4", acc = rv("--accent") || "#a7bce8";
      ctx.globalAlpha = alpha;
      const proj = (la, lo) => { la *= P / 180; lo = lo * P / 180 + rotY; const x = Math.cos(la) * Math.sin(lo), y = Math.sin(la), z = Math.cos(la) * Math.cos(lo); return [x, y * Math.cos(tiltX) - z * Math.sin(tiltX), y * Math.sin(tiltX) + z * Math.cos(tiltX)]; };
      for (const p of land) { const v = proj(p[0], p[1]); if (v[2] <= 0.02) continue; ctx.fillStyle = cvHexA(ink, 0.14 + v[2] * 0.5); ctx.beginPath(); ctx.arc(cx + v[0] * R, cy - v[1] * R, (0.8 + v[2] * 1.0) * dpr, 0, 7); ctx.fill(); }
      const v = proj(jLa, jLo);
      if (v[2] > 0) { const mx = cx + v[0] * R, my = cy - v[1] * R; ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(mx, my, 3.6 * dpr, 0, 7); ctx.fill(); const pr = reduce ? 0.5 : (0.5 + 0.5 * Math.sin(Date.now() / 600)); ctx.strokeStyle = cvHexA(acc, 0.55 - pr * 0.35); ctx.lineWidth = 1.4 * dpr; ctx.beginPath(); ctx.arc(mx, my, (6 + pr * 11) * dpr, 0, 7); ctx.stroke(); }
      ctx.globalAlpha = 1;
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onR); };
  }, [m, hasJ]);

  // sections drive the active state
  useEffect(() => {
    const sc = scRef.current; if (!sc) return; const secs = [...sc.querySelectorAll(".orbit-sec")];
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { const i = +e.target.dataset.i; if (!isNaN(i)) setState(i); } }), { root: sc, threshold: 0.5 });
    secs.forEach((s) => io.observe(s)); return () => io.disconnect();
  }, [m]);

  // ── gravity: position/scale/luminance of each mass for the active state ──
  const idx = {}; M.forEach((x, i) => idx[x.id] = i);
  const ang = (n, i) => (-90 + i * 360 / Math.max(1, n)) * Math.PI / 180;
  const posFor = (id, st) => {
    if (st.id === "open" || st.id === "place") {
      if ((st.focus || []).includes(id)) return st.id === "open" ? { tx: 0, ty: -3, s: 1, o: 1 } : { tx: 0, ty: -3, s: .5, o: .2 };
      const i = idx[id], a = (i * 47 % 360) * Math.PI / 180; return { tx: Math.cos(a) * 48, ty: Math.sin(a) * 34, s: .3, o: st.id === "place" ? .05 : .1 };
    }
    if (st.id === "converge") { const keys = ["flag", "evi", "cap", "cat"].filter((k) => idx[k] != null); const j = keys.indexOf(id); if (j >= 0) { const a = ang(keys.length, j); return { tx: Math.cos(a) * 27, ty: Math.sin(a) * 27, s: .58, o: 1 }; } return { tx: 0, ty: 0, s: .2, o: 0 }; }
    if (st.id === "follow") return { tx: 0, ty: 0, s: .2, o: 0 };
    const F = st.focus || [], Su = st.support || [], Or = st.orbit || [];
    if (F.includes(id)) { if (F.length === 1) return { tx: 0, ty: 0, s: 1.12, o: 1 }; const j = F.indexOf(id); return { tx: j === 0 ? -17 : 17, ty: 0, s: .92, o: 1 }; }
    if (Su.includes(id)) { const j = Su.indexOf(id); const a = ang(Su.length + 2, j + 1); return { tx: Math.cos(a) * 32, ty: Math.sin(a) * 30 - 2, s: .5, o: .72 }; }
    if (Or.includes(id)) { const j = Or.indexOf(id); const a = ang(Or.length, j); return { tx: Math.cos(a) * 41, ty: Math.sin(a) * 33, s: .42, o: .55 }; }
    const i = idx[id], a = (i * 67 % 360) * Math.PI / 180; return { tx: Math.cos(a) * 53, ty: Math.sin(a) * 37, s: .3, o: .15 };
  };
  const massStyle = (id) => { const p = posFor(id, cur); return { transform: "translate(calc(-50% + " + p.tx + "vmin), calc(-50% + " + p.ty + "vmin)) scale(" + p.s + ")", opacity: p.o }; };
  const isHi = (id) => (cur.focus || []).includes(id);

  return (
    <div className="orbit" ref={scRef} data-stid={cur.id}>
      <div className="orbit-field">
        {hasJ && <canvas className="orbit-globe" ref={globeRef} />}
        {hasJ && <div className="og-geo"><div className="ctry">{m.geo.country || ""}</div><div className="reg">{region || m.geo.country}</div><div className="note">Disclosed operating jurisdiction</div></div>}
        {M.map((x) => x.kind === "img"
          ? <div className={"og-mass img" + (isHi(x.id) ? " hi" : "")} key={x.id} style={massStyle(x.id)}><div className="frame"><img src={x.src} alt="" />{x.cap && <span className="mcap">{x.cap}</span>}</div></div>
          : <div className={"og-mass " + x.kind + (isHi(x.id) ? " hi" : "") + (x.pick ? " pick" + (sel === x.projIdx ? " on" : "") : "")} key={x.id} style={massStyle(x.id)} onClick={x.pick ? () => setSel(x.projIdx) : undefined}>
              {x.ml && <div className="ml">{x.ml}</div>}<div className="mv">{x.mv}{x.mu && <span className="u">{x.mu}</span>}</div>{x.ms && <div className="ms">{x.ms}</div>}
            </div>)}
        <div className="og-thesis"><div className="tk">The investment case</div><div className="tt">{thesis}</div></div>
        <div className="og-cta"><div className="feat">{(ctaFeatures || []).slice(0, 4).join("     ·     ")}</div><div className="go">Follow {m.shortName} on MineEx →</div></div>
      </div>
      {S.map((s, i) => <section className="orbit-sec" data-i={i} key={i} />)}
      <div className="og-hint">Scroll ↓</div>
    </div>
  );
}

// ══ TEMPLATE 11 · CORE ══════════════════════════════════════════════════════════════════════════
// A horizontal core-tray light table. The whole deck is ONE horizontal scroller — you scan the
// recovered rock left→right, box by box. Nothing stacks vertically (that is Strata); no cards, no
// schematic section. Wow moments: (1) the tray slides onto the light table, (2) mineralised runs
// illuminate along the flagship core, (3) the assay certificate stamps VERIFIED.
const _gnum = (g) => parseFloat(String(g || "").replace(/[^0-9.]/g, "")) || 0;
function Core({ m }) {
  const scRef = useRef(null), railRef = useRef(null);
  useEffect(() => {
    const sc = scRef.current; if (!sc) return;
    const panels = [...sc.querySelectorAll(".cpanel")];
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) e.target.classList.add("on"); }), { root: sc, threshold: 0.5 });
    panels.forEach((p) => io.observe(p));
    requestAnimationFrame(() => panels[0] && panels[0].classList.add("on"));
    const onScroll = () => { const max = sc.scrollWidth - sc.clientWidth; if (railRef.current) railRef.current.style.width = (max > 0 ? sc.scrollLeft / max * 100 : 0) + "%"; };
    // let a vertical wheel / trackpad drive the horizontal tray (desktop review); touch is native
    const onWheel = (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { sc.scrollLeft += e.deltaY; e.preventDefault(); } };
    sc.addEventListener("scroll", onScroll, { passive: true });
    sc.addEventListener("wheel", onWheel, { passive: false });
    onScroll();
    return () => { io.disconnect(); sc.removeEventListener("scroll", onScroll); sc.removeEventListener("wheel", onWheel); };
  }, [m]);
  const drills = (m.flagship.drills || []).slice(0, 6);
  const maxg = Math.max(1, ...drills.map((d) => _gnum(d.grade)));
  const imgs = [m.images.field, m.images.camp, m.images.hero].filter(Boolean);
  const jur = [m.geo.region || m.geo.place, m.geo.country].filter(Boolean).join(", ");
  let n = 0; const num = () => String(++n).padStart(2, "0");
  return (
    <div className="core" ref={scRef}>
      {/* 01 — light table intro (WOW 1: the tray slides in) */}
      <div className="cpanel">
        <div className="cnum">CORE LIBRARY · {m.name}</div>
        <div className="clab">{m.tickerLine || m.commodity}</div>
        <div className="ch1">{m.shortName}</div>
        {(m.thesis || m.tagline) && <div className="csub">{m.thesis || m.tagline}</div>}
        <div className="cmeta">
          {jur && <>Jurisdiction · <b>{jur}</b><br /></>}
          {m.commodity && <>Commodity · <b>{m.commodity}</b><br /></>}
          {m.flagship.name && <>Flagship · <b>{m.flagship.name}</b></>}
        </div>
        {drills[0] && <div className="corebox"><div className="coreticks"><span>best run</span><span>logged core →</span></div>
          <div className="cstickrow"><span className="chole">{drills[0].hole || "Hole"}</span>
            <div className="cstick"><div className="run" style={{ left: "16%", width: Math.max(16, _gnum(drills[0].grade) / maxg * 60) + "%", transitionDelay: ".35s" }} /></div>
            <span className="cgrade"><b>{drills[0].grade}</b></span></div></div>}
        <div className="cnum" style={{ top: "auto", bottom: "clamp(30px,5vw,60px)" }}>Scan right →</div>
      </div>

      {/* 02 — the flagship core (WOW 2: runs illuminate down the tray) */}
      {drills.length > 0 && (
        <div className="cpanel wide">
          <div className="cnum">{num()} · logged core</div>
          <div className="clab">{m.flagship.name || m.shortName} · mineralised intervals</div>
          <div className="ch1" style={{ fontSize: "clamp(28px,3.4vw,48px)" }}>{m.heroStat ? splitStat(m.heroStat.value) : "The evidence, logged"}</div>
          <div className="corebox">
            <div className="coreticks"><span>0 m</span><span>hole-by-hole intercepts</span><span>depth →</span></div>
            {drills.map((d, i) => { const g = _gnum(d.grade); const w = Math.max(14, g / maxg * 56); const left = 10 + (i * 11) % 34;
              return (<div className="cstickrow" key={i}><span className="chole">{d.hole || "—"}</span>
                <div className="cstick"><div className="run" style={{ left: left + "%", width: w + "%", transitionDelay: (0.25 + i * 0.16) + "s" }} /></div>
                <span className="cgrade"><b>{d.grade}</b>{d.interval ? " / " + d.interval : ""}</span></div>); })}
          </div>
          <div className="csub">Real disclosed intercepts — each hole’s mineralised run lit in proportion to its grade. Schematic spacing, not to collar scale.</div>
        </div>
      )}

      {/* 03..n — every project as a core box in the tray */}
      {m.projects.map((p, i) => (
        <div className="cpanel" key={i}>
          <div className="cnum">{num()} · box</div>
          <div className="clab">{p.stage || "Project"}</div>
          <div className="ch1" style={{ fontSize: "clamp(28px,3.6vw,52px)" }}>{p.name}</div>
          <div className="cbox">
            <div className="bimg">{imgs.length ? <img src={imgs[i % imgs.length]} alt="" /> : null}<span className="btag">{p.commodity || m.commodity || "Core"}</span></div>
            <div className="brow">
              {p.location && <span>Location · <b>{p.location}</b></span>}
              {p.ownership && <span>Owned · <b>{p.ownership}</b></span>}
              {p.land && <span>Land · <b>{p.land}</b></span>}
            </div>
          </div>
          {p.overview && <div className="csub">{p.overview}</div>}
        </div>
      ))}

      {/* assay certificate — capital (WOW 3: the stamp) */}
      {m.capital.length > 0 && (
        <div className="cpanel">
          <div className="cnum">{num()} · certificate</div>
          <div className="clab">Assay certificate · capital structure</div>
          <div className="ch1" style={{ fontSize: "clamp(26px,3vw,42px)" }}>Certified position</div>
          <div className="cert">
            <div className="crth"><span>Certificate of analysis</span><span>{m.shortName}</span></div>
            {m.capital.map(([k, v], i) => <div className="crow" key={i}><span className="k">{k}</span><span className="v">{v}</span></div>)}
            <div className="stamp">Verified</div>
          </div>
        </div>
      )}

      {/* catalyst — the next hole, boxed and pending */}
      {m.catalysts[0] && (
        <div className="cpanel">
          <div className="cnum">{num()} · pending</div>
          <div className="clab">Awaiting assay{m.catalysts[0].timing ? " · " + m.catalysts[0].timing : ""}</div>
          <div className="ch1" style={{ fontSize: "clamp(28px,3.4vw,50px)" }}>{m.catalysts[0].label}</div>
          {m.catalysts[0].impact && <div className="csub">{m.catalysts[0].impact}</div>}
          <div className="corebox" style={{ marginTop: 26 }}><div className="coreticks"><span>next hole</span><span>results pending</span></div>
            <div className="cstick"><span className="hl">PENDING</span><span className="gl" style={{ color: "var(--dim)", mixBlendMode: "normal" }}>—</span></div></div>
        </div>
      )}

      {/* timeline — dated campaigns */}
      {m.timeline.length > 0 && (
        <div className="cpanel wide">
          <div className="cnum">{num()} · campaign log</div>
          <div className="clab">Drilled record</div>
          <div className="ch1" style={{ fontSize: "clamp(26px,3vw,42px)" }}>The record</div>
          <div style={{ marginTop: 22 }}>{m.timeline.slice(0, 6).map((t, i) => (
            <div className="brow" key={i} style={{ border: "1px solid var(--line)", borderRadius: 8, marginBottom: 8, display: "grid", gridTemplateColumns: "110px 1fr", textTransform: "none", letterSpacing: 0 }}>
              <span style={{ color: "var(--accent)" }}>{(t.date || "").slice(0, 10)}</span><span style={{ color: "var(--ink)", fontFamily: "var(--font)", fontSize: 14 }}>{t.headline}</span>
            </div>))}</div>
        </div>
      )}

      {/* team — initials on the boxes */}
      {m.team.length > 0 && (
        <div className="cpanel">
          <div className="cnum">{num()} · logged by</div>
          <div className="clab">Leadership · {m.team.length}</div>
          <div className="ch1" style={{ fontSize: "clamp(26px,3vw,42px)" }}>Who logged it</div>
          <div className="cmeta" style={{ marginTop: 22, fontFamily: "var(--font)", textTransform: "none", letterSpacing: 0, fontSize: 15, lineHeight: 2 }}>
            {m.team.slice(0, 8).map((p, i) => <div key={i}><b>{(p.name || "").split(/\s+/).map((w) => w[0]).slice(0, 2).join("")}</b> &nbsp;{p.name}{p.role ? " — " + p.role : ""}</div>)}
          </div>
        </div>
      )}

      {/* follow */}
      <div className="cpanel cend">
        <div className="clab">End of tray</div>
        <h2>Follow {m.shortName}<br />on MineEx.</h2>
        <div className="cmeta">Every assay, logged and delivered.</div>
      </div>
      <div className="core-rail"><i ref={railRef} /></div>
    </div>
  );
}

// ══ TEMPLATE 12 · CINEMA ════════════════════════════════════════════════════════════════════════
// A 60–90s company film: opening titles, ACTS, hard CUTS, moments of black, photography as the
// primary storyteller, and a closing credits crawl carrying the thesis. No cards, no tables, no
// timeline list, no ambient canvas. Wow moments: (1) opening titles resolve over black, (2) the
// evidence CUT (the headline stat slams in), (3) the closing credits crawl.
function Cinema({ m }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) e.target.classList.add("on"); }), { threshold: 0.35 });
    el.querySelectorAll(".credits").forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, [m]);
  const hero = m.images.hero || m.images.field, field = m.images.field || m.images.hero, camp = m.images.camp || m.images.field || m.images.hero;
  const shots = [camp, field, hero];
  const c0 = m.catalysts[0];
  const capLead = m.capital.find((c) => /market cap/i.test(c[0])) || m.capital[0];
  return (
    <div className="cine" ref={ref}>
      {/* Cold open — WOW 1 */}
      <div className="scene card"><div className="cc">
        <div className="act">A MineEx presentation</div>
        <h1 className="ct opening">{m.shortName}.</h1>
        {(m.tagline || m.commodity) && <div className="cd fade">{m.tagline || (m.commodity + " · " + (m.geo.region || m.geo.place || ""))}</div>}
      </div></div>

      {/* Act I — the ground */}
      <div className="scene">
        {field ? <img className="shot" src={field} alt="" /> : <div className="ph" />}<div className="vig" /><div className="bars" />
        <div className="cc">
          <div className="act rise">Act I — The ground</div>
          <h2 className="ct rise" style={{ transitionDelay: ".1s" }}>{m.geo.place || m.geo.region || "The ground"}.</h2>
          {m.thesis && <div className="cd rise" style={{ transitionDelay: ".2s" }}>{m.thesis}</div>}
        </div>
      </div>

      {/* Act II — the discovery */}
      <div className="scene">
        {hero ? <img className="shot" src={hero} alt="" /> : <div className="ph" />}<div className="vig" /><div className="bars" />
        <div className="cc">
          <div className="act rise">Act II — The discovery</div>
          <h2 className="ct rise" style={{ transitionDelay: ".1s" }}>{m.flagship.name || m.shortName}.</h2>
        </div>
      </div>
      {/* the evidence CUT — WOW 2 */}
      {m.heroStat && (
        <div className="scene card"><div className="cc">
          <div className="evk rise">{m.heroStat.label}</div>
          <div className="evo rise cut" style={{ transitionDelay: ".15s" }}>{splitStat(m.heroStat.value)}</div>
          {m.heroStat.context && <div className="cd rise" style={{ transitionDelay: ".35s" }}>{m.heroStat.context}</div>}
        </div></div>
      )}

      {/* Act III — the portfolio, as a sequence */}
      {m.projects.length > 0 && (
        <>
          <div className="scene card"><div className="cc"><div className="act rise">Act III — The ground it holds</div>
            <h2 className="ct rise" style={{ transitionDelay: ".1s" }}>{m.projects.length} {m.projects.length === 1 ? "project" : "projects"}.</h2></div></div>
          {m.projects.slice(0, 3).map((p, i) => (
            <div className="scene" key={i}>
              {shots[i % shots.length] ? <img className="shot" src={shots[i % shots.length]} alt="" /> : <div className="ph" />}<div className="vig" /><div className="bars" />
              <div className="cc">
                <div className="act rise">{[p.stage, p.commodity].filter(Boolean).join(" · ") || "Asset " + (i + 1)}</div>
                <h2 className="ct rise" style={{ transitionDelay: ".1s" }}>{p.name}</h2>
                {p.overview && <div className="cd rise" style={{ transitionDelay: ".2s" }}>{p.overview}</div>}
              </div>
            </div>
          ))}
        </>
      )}

      {/* Act IV — the position (capital as a quiet title card) */}
      {capLead && (
        <div className="scene card"><div className="cc">
          <div className="act rise">Act IV — The position</div>
          <h2 className="ct rise" style={{ transitionDelay: ".1s", fontSize: "clamp(36px,6vw,88px)" }}>{capLead[1]}</h2>
          <div className="cd rise" style={{ transitionDelay: ".2s" }}>{capLead[0]}{m.capital.length > 1 ? " · " + m.capital.slice(0, 3).filter((c) => c !== capLead).map((c) => c[1] + " " + c[0].toLowerCase()).join(" · ") : ""}</div>
        </div></div>
      )}

      {/* Act V — the cliffhanger */}
      {c0 && (
        <div className="scene card"><div className="cc">
          <div className="act rise">Act V — What happens next</div>
          <h2 className="ct rise" style={{ transitionDelay: ".1s" }}>{c0.label}.</h2>
          {(c0.timing || c0.impact) && <div className="cd rise" style={{ transitionDelay: ".2s" }}>{[c0.timing, c0.impact].filter(Boolean).join(" — ")}</div>}
        </div></div>
      )}

      {/* Closing credits — WOW 3 */}
      <div className="credits"><div className="roll">
        <div className="thesis">{m.thesis || m.tagline || m.shortName}</div>
        {m.why.map((w, i) => <div className="cgrp" key={i}><div className="role">Reason {String(i + 1).padStart(2, "0")}</div><div className="name">{w}</div></div>)}
        {m.team.length > 0 && <div className="cgrp"><div className="role">Leadership</div>{m.team.slice(0, 8).map((p, i) => <div className="name" key={i}>{p.name}{p.role ? " — " + p.role : ""}</div>)}</div>}
        <div className="cgrp"><div className="role">Now showing on MineEx</div><div className="name">{m.tickerLine || m.name}</div></div>
      </div></div>
    </div>
  );
}

// ══ TEMPLATE 16 · TERRAIN ═══════════════════════════════════════════════════════════════════════
// Travelling THROUGH the physical geography. A persistent, DPI-crisp topographic contour field that
// flies inward as you scroll; the body is a spatial traverse — jurisdiction → district → flagship →
// evidence → portfolio → horizon — each a waypoint you arrive at over the moving land. Not a flat map
// with pins (that is Atlas). Wow moments: (1) the land resolves into relief, (2) grade rises out of
// the terrain at the flagship, (3) the traverse pulls back to the horizon / what's next.
function Terrain({ m }) {
  const scRef = useRef(null), cvRef = useRef(null);
  useEffect(() => {
    const cv = cvRef.current, sc = scRef.current; if (!cv || !sc) return;
    const ctx = cv.getContext("2d"); let raf, dpr = 1, W = 0, Hh = 0;
    const reduce = matchMedia("(prefers-reduced-motion:reduce)").matches;
    const size = () => { dpr = sizeCanvasEl(cv); W = cv.width; Hh = cv.height; };
    size(); requestAnimationFrame(() => requestAnimationFrame(size)); const onR = () => size(); window.addEventListener("resize", onR);
    const rv = (n) => getComputedStyle(cv).getPropertyValue(n).trim();
    const RINGS = 10;
    let target = 0, cur = 0;
    const readScroll = () => { const max = sc.scrollHeight - sc.clientHeight; target = max > 0 ? sc.scrollTop / max : 0; };
    sc.addEventListener("scroll", readScroll, { passive: true }); readScroll(); cur = target;
    const draw = () => {
      cur += (target - cur) * 0.09;
      const p = reduce ? target : cur;
      ctx.clearRect(0, 0, W, Hh);
      const ink = rv("--ink") || "#e8e8e8", acc = rv("--accent") || "#c2a15c";
      const cx = W * (0.5 + Math.sin(p * 3.0) * 0.05), cy = Hh * (0.5 + Math.cos(p * 2.2) * 0.04);
      const maxR = Math.hypot(W, Hh) * 0.66, wide = W > Hh ? 1.2 : 0.86;
      const phase = p * 5.2, seg = 96;
      for (let j = 0; j < RINGS; j++) {
        const f = ((j + phase) % RINGS) / RINGS;      // 0 (centre) → 1 (edge), expanding as you travel
        const r = f * maxR;
        const alpha = Math.min(1, f * 2.4) * (1 - f * 0.35);
        const isCur = f > 0.42 && f < 0.56;           // the "current elevation" ridge
        ctx.beginPath();
        for (let k = 0; k <= seg; k++) {
          const a = k / seg * Math.PI * 2;
          const noise = 1 + Math.sin(a * 3 + j * 1.3) * 0.09 + Math.sin(a * 5 - j * 0.7 + p * 2) * 0.05;
          const rr = r * noise;
          const x = cx + Math.cos(a) * rr * wide, y = cy + Math.sin(a) * rr * 0.72;
          k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = isCur ? cvHexA(acc, 0.85 * alpha) : cvHexA(ink, 0.16 * alpha);
        ctx.lineWidth = (isCur ? 2 : 1) * dpr;
        ctx.stroke();
      }
      ctx.beginPath(); ctx.fillStyle = cvHexA(acc, 0.9); ctx.arc(cx, cy, 3.4 * dpr, 0, 7); ctx.fill();
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onR); sc.removeEventListener("scroll", readScroll); };
  }, [m]);
  useEffect(() => {
    const sc = scRef.current; if (!sc) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) e.target.classList.add("on"); }), { root: sc, threshold: 0.5 });
    sc.querySelectorAll(".way").forEach((w) => io.observe(w));
    return () => io.disconnect();
  }, [m]);
  const coord = m.geo.lat != null ? `${m.geo.lat.toFixed(2)}°, ${m.geo.lng.toFixed(2)}°` : (m.geo.place || "");
  const best = (m.flagship.drills || []).slice().sort((a, b) => _pnum(b.grade) - _pnum(a.grade))[0];
  const other = m.projects.slice(1);
  return (
    <div className="terr" ref={scRef}>
      <canvas className="terr-cv" ref={cvRef} />
      <div className="terr-scrim" />
      <div className="terr-hud">Traverse · <b>{m.shortName}</b></div>
      {coord && <div className="terr-el">{coord}<br /><span style={{ color: "var(--faint)" }}>disclosed jurisdiction</span></div>}

      <div className="way"><div className="wc">
        <div className="stage">Traverse begins</div>
        {coord && <div className="coord">{coord}</div>}
        <h2>{m.geo.country || m.geo.region || m.geo.place || m.shortName}.</h2>
        {m.thesis && <p>{m.thesis}</p>}
      </div></div>

      {(m.geo.region || m.geo.district) && <div className="way right"><div className="wc">
        <div className="stage">The district</div>
        <h2>{m.geo.district || m.geo.region}.</h2>
        <div className="wmeta">{[m.geo.region, m.geo.country].filter(Boolean).map((x, i) => <span key={i}><b>{x}</b></span>)}</div>
      </div></div>}

      <div className="way"><div className="wc">
        <div className="stage">Flagship ground</div>
        <h2>{m.flagship.name || m.shortName}.</h2>
        <div className="wmeta">{[m.commodity, m.projects[0] && m.projects[0].stage, m.projects[0] && m.projects[0].ownership && m.projects[0].ownership + " owned"].filter(Boolean).map((x, i) => <span key={i}><b>{x}</b></span>)}</div>
        {m.flagship.sub && <p>{m.flagship.sub}</p>}
      </div></div>

      {m.heroStat && <div className="way right"><div className="wc">
        <div className="stage">Grade rises from the ground</div>
        <h2>{splitStat(m.heroStat.value)}</h2>
        {m.heroStat.context && <p>{m.heroStat.context}</p>}
        {best && <div className="elev"><span className="e">{best.grade}</span><span className="l">best hole · {best.hole}</span></div>}
      </div></div>}

      {other.length > 0 && <div className="way"><div className="wc">
        <div className="stage">The ground it holds</div>
        <h2>{m.projects.length} projects, across the district.</h2>
        <div className="wmeta" style={{ flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
          {m.projects.map((p, i) => <span key={i}><b>{p.name}</b> — {[p.stage, p.commodity].filter(Boolean).join(" · ")}</span>)}
        </div>
      </div></div>}

      {m.catalysts[0] && <div className="way right"><div className="wc">
        <div className="stage">On the horizon</div>
        <h2>{m.catalysts[0].label}.</h2>
        {m.catalysts[0].timing && <div className="coord">{m.catalysts[0].timing}</div>}
        {m.catalysts[0].impact && <p>{m.catalysts[0].impact}</p>}
      </div></div>}

      <div className="way"><div className="wc">
        <div className="stage">End of traverse</div>
        <h2>Follow {m.shortName}<br />on MineEx.</h2>
        <p>Every step across this ground, delivered.</p>
      </div></div>
    </div>
  );
}

// ══ 19 · VAULT — capital-markets luxury, kept scarce. One held asset per screen, hairline frames,
// slow reveals, lots of black. Wow: (1) the value opens the vault framed, (2) one decisive intercept
// framed like a certificate, (3) ownership + capital resolve, closing on the held market cap. ═════════
function _useOn(rootRef, sel, deps) {
  useEffect(() => {
    const el = rootRef.current; if (!el) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) e.target.classList.add("on"); }), { threshold: 0.4 });
    el.querySelectorAll(sel).forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, deps); // eslint-disable-line
}
function Vault({ m }) {
  const ref = useRef(null);
  _useOn(ref, ".vlt-s", [m]);
  const best = (m.flagship.drills || []).slice().sort((a, b) => _gnum(b.grade) - _gnum(a.grade))[0];
  const own = _pnum(m.projects[0] && m.projects[0].ownership);
  const mktcap = (m.capital.find((c) => /market cap/i.test(c[0])) || [])[1];
  const c0 = m.catalysts[0];
  return (
    <div className="vlt" ref={ref}>
      <div className="vlt-s"><div className="vlt-k">{m.name}{m.tickers[0] ? " · " + m.tickers[0] : ""}</div>
        <div className="vlt-frame"><div className="vlt-big">{m.heroStat ? splitStat(m.heroStat.value) : (mktcap || m.shortName)}</div></div>
        <div className="vlt-cap">{m.heroStat ? m.heroStat.label : "Held value"}</div>
      </div>

      {(m.flagship.name || best) && <div className="vlt-s"><div className="vlt-k">The asset</div>
        <div className="vlt-h">{m.flagship.name || m.shortName}</div>
        {m.flagship.sub && <div className="vlt-sub">{m.flagship.sub}</div>}
        {best && <div className="vlt-frame" style={{ marginTop: 34 }}><div className="vlt-big" style={{ fontSize: "clamp(34px,6vw,84px)" }}>{best.grade}</div><div className="vlt-cap" style={{ marginTop: 16 }}>Best intercept · {best.hole}</div></div>}
      </div>}

      {(m.capital.length > 0 || isFinite(own)) && <div className="vlt-s"><div className="vlt-k">Ownership &amp; capital</div>
        {isFinite(own) && <div className="vlt-own"><div className="obar"><i style={{ "--w": Math.max(3, Math.min(100, own)) + "%" }} /></div><div className="olab"><span>{m.flagship.name || "Flagship"} · owned</span><span>{m.projects[0].ownership}</span></div></div>}
        <div className="vlt-rows">{m.capital.map(([k, v], i) => <div className="r" key={i}><span className="k">{k}</span><span className="v">{v}</span></div>)}</div>
      </div>}

      {m.why[0] && <div className="vlt-s"><div className="vlt-k">The case</div><div className="vlt-h">{m.why[0]}</div></div>}

      {m.team.length > 0 && <div className="vlt-s"><div className="vlt-k">Principals</div>
        <div className="vlt-names">{m.team.slice(0, 6).map((p, i) => <div key={i}><div className="nm">{p.name}</div><div className="rl">{p.role}</div></div>)}</div>
      </div>}

      <div className="vlt-s">{c0 && <><div className="vlt-k">What happens next{c0.timing ? " · " + c0.timing : ""}</div><div className="vlt-h" style={{ marginBottom: 40 }}>{c0.label}</div></>}
        {mktcap && <div className="vlt-frame"><div className="vlt-big" style={{ fontSize: "clamp(40px,7vw,110px)" }}>{mktcap}</div><div className="vlt-cap" style={{ marginTop: 16 }}>Market capitalisation</div></div>}
        <div className="vlt-cap" style={{ marginTop: 40 }}>Follow {m.shortName} on MineEx</div>
      </div>
    </div>
  );
}

// ══ 13 · GRID — Swiss typography to the edge. A visible asymmetric grid; huge tabular numerals count
// up on the grid (kinetic type). Wow: (1) the grid locks in, (2) the resource numeral counts up big,
// (3) a closing oversized market-cap numeral fills the grid. ═══════════════════════════════════════
function _splitNum(v) { const m = String(v || "").match(/^([\d.,]+)\s*(.*)$/); return m ? { n: parseFloat(m[1].replace(/,/g, "")), dp: (m[1].split(".")[1] || "").length, unit: m[2] } : null; }
function GridNum({ value, cls }) {
  const ref = useRef(null); const s = _splitNum(value);
  useEffect(() => {
    const el = ref.current; if (!el || !s) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return; io.unobserve(e.target);
      const t0 = performance.now(), dur = 900;
      const tick = (t) => { const k = Math.min(1, (t - t0) / dur); const val = (s.n * (1 - Math.pow(1 - k, 3))); el.textContent = val.toFixed(s.dp); if (k < 1) requestAnimationFrame(tick); else el.textContent = s.n.toFixed(s.dp); };
      requestAnimationFrame(tick);
    }), { threshold: 0.5 });
    io.observe(el); return () => io.disconnect();
  }, [value]); // eslint-disable-line
  if (!s) return <span className={"grd-num " + cls}>{value}</span>;
  return <span className={"grd-num " + cls}><span ref={ref}>{(0).toFixed(s.dp)}</span>{s.unit ? <span className="unit"> {s.unit}</span> : null}</span>;
}
function Grid({ m }) {
  const mktcap = (m.capital.find((c) => /market cap/i.test(c[0])) || [])[1];
  const capTop = m.capital.slice(0, 3);
  return (
    <div className="grd">
      <div className="grd-row">
        <div className="grd-c8 grd-cell"><div className="grd-lab">{m.tickerLine || "MineEx"}</div><div className="grd-name">{m.name}</div></div>
        <div className="grd-c4 grd-cell"><div className="grd-lab">Commodity</div><div className="grd-name" style={{ fontSize: "clamp(20px,2.4vw,32px)" }}>{m.commodity || "—"}</div></div>
      </div>
      <div className="grd-row">
        {m.heroStat && <div className="grd-c8 grd-cell grd-tall"><div className="grd-lab">{m.heroStat.label}</div><GridNum value={m.heroStat.value} cls="grd-big" /></div>}
        <div className="grd-c4 grd-cell"><div><div className="grd-lab">Jurisdiction</div><div className="grd-name" style={{ fontSize: "clamp(20px,2.4vw,30px)", marginTop: 10 }}>{m.geo.region || m.geo.place || "—"}</div></div>{m.heroStat && m.heroStat.context && <div className="grd-txt">{m.heroStat.context}</div>}</div>
      </div>
      {m.stats.length > 0 && <div className="grd-row">{m.stats.slice(0, 4).map((s, i) => <div className="grd-c3 grd-cell" key={i}><GridNum value={s.v} cls="grd-mid" /><div className="grd-lab">{s.k}</div></div>)}</div>}
      {m.projects.length > 0 && <div className="grd-row">{m.projects.slice(0, 3).map((p, i) => <div className={"grd-cell " + (i === 0 ? "grd-c6" : "grd-c3")} key={i}><div className="grd-lab">{p.stage || "Project"}</div><div className="grd-name">{p.name}</div><div className="grd-txt">{[p.commodity, p.ownership && p.ownership + " owned"].filter(Boolean).join(" · ")}</div></div>)}</div>}
      {capTop.length > 0 && <div className="grd-row">{capTop.map(([k, v], i) => <div className="grd-c4 grd-cell" key={i}><GridNum value={v} cls="grd-mid" /><div className="grd-lab">{k}</div></div>)}</div>}
      {m.why.length > 0 && <div className="grd-row"><div className="grd-c12 grd-cell"><div className="grd-lab">Why invest</div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 24, marginTop: 8 }}>{m.why.map((w, i) => <div key={i} style={{ fontSize: "clamp(16px,1.7vw,20px)", lineHeight: 1.4, fontWeight: 700, letterSpacing: "-.01em" }}><span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--accent)" }}>{String(i + 1).padStart(2, "0")} </span>{w}</div>)}</div></div></div>}
      {mktcap && <div className="grd-row"><div className="grd-c12 grd-cell acc grd-tall" style={{ justifyContent: "center", alignItems: "center", textAlign: "center" }}><div className="grd-lab">Market capitalisation</div><GridNum value={mktcap} cls="grd-big" /></div></div>}
    </div>
  );
}

// ══ 23 · CONSTELLATION — the company as a navigable network. A fixed node-graph canvas; scroll glides
// focus from node to node, each expanding its linked satellites. Wow: (1) the constellation draws and
// connects, (2) a project node reveals its drill-evidence satellites, (3) a pulsing future node. ════
function Constellation({ m }) {
  const scRef = useRef(null), cvRef = useRef(null), focus = useRef(0);
  const nodes = useMemo(() => {
    const list = [{ k: "Company", h: m.shortName, p: m.thesis, sats: m.tickers.slice(0, 2) }];
    m.projects.slice(0, 3).forEach((pr, i) => list.push({ k: pr.stage || "Project", h: pr.name, p: pr.overview, sats: [pr.commodity, pr.location, pr.ownership && pr.ownership + " owned"].filter(Boolean), drills: i === 0 }));
    if (m.heroStat) list.push({ k: m.heroStat.label, h: m.heroStat.value, p: m.heroStat.context, sats: (m.flagship.drills || []).slice(0, 3).map((d) => d.hole + " " + d.grade), big: true });
    if (m.capital.length) list.push({ k: "Capital", h: (m.capital.find((c) => /market cap/i.test(c[0])) || m.capital[0])[1], p: "", sats: m.capital.slice(0, 4).map((c) => c[1] + " " + c[0].toLowerCase()) });
    if (m.catalysts[0]) list.push({ k: "Next" + (m.catalysts[0].timing ? " · " + m.catalysts[0].timing : ""), h: m.catalysts[0].label, p: m.catalysts[0].impact, sats: [], future: true });
    if (m.team.length) list.push({ k: "Leadership", h: m.team.length + " principals", p: "", sats: m.team.slice(0, 4).map((t) => t.name) });
    return list;
  }, [m]);
  const pts = useMemo(() => nodes.map((_, i) => i === 0 ? [0, 0] : [Math.cos((i - 1) / Math.max(1, nodes.length - 1) * Math.PI * 2 - Math.PI / 2) * (0.62 + (i % 2) * 0.14), Math.sin((i - 1) / Math.max(1, nodes.length - 1) * Math.PI * 2 - Math.PI / 2) * (0.62 + (i % 2) * 0.14)]), [nodes]);
  useEffect(() => {
    const cv = cvRef.current; if (!cv) return; const ctx = cv.getContext("2d"); let raf, dpr = 1, W = 0, Hh = 0;
    const reduce = matchMedia("(prefers-reduced-motion:reduce)").matches;
    const size = () => { dpr = sizeCanvasEl(cv); W = cv.width; Hh = cv.height; };
    size(); requestAnimationFrame(() => requestAnimationFrame(size)); const onR = () => size(); window.addEventListener("resize", onR);
    const rv = (n) => getComputedStyle(cv).getPropertyValue(n).trim();
    let camX = 0, camY = 0, t = 0;
    const draw = () => {
      t += 0.016; const fi = focus.current, fp = pts[fi] || [0, 0];
      camX += (fp[0] - camX) * 0.06; camY += (fp[1] - camY) * 0.06;
      ctx.clearRect(0, 0, W, Hh);
      const ink = rv("--ink") || "#eee", acc = rv("--accent") || "#a690d8", S = Math.min(W, Hh) * 0.34;
      const proj = (p) => [W / 2 + (p[0] - camX) * S, Hh / 2 + (p[1] - camY) * S];
      // edges from company (node 0) to all
      const c0 = proj(pts[0]);
      pts.forEach((p, i) => { if (i === 0) return; const s = proj(p); const on = i === fi; ctx.beginPath(); ctx.moveTo(c0[0], c0[1]); ctx.lineTo(s[0], s[1]); ctx.strokeStyle = cvHexA(on ? acc : ink, on ? 0.6 : 0.22); ctx.lineWidth = (on ? 1.8 : 1) * dpr; ctx.stroke(); });
      // sat spokes around focused node
      const fn = nodes[fi]; if (fn && fn.sats && fn.sats.length) { const s = proj(pts[fi]); fn.sats.forEach((_, j) => { const a = j / fn.sats.length * Math.PI * 2 + t * 0.3; const r = 34 * dpr; ctx.beginPath(); ctx.moveTo(s[0], s[1]); ctx.lineTo(s[0] + Math.cos(a) * r, s[1] + Math.sin(a) * r); ctx.strokeStyle = cvHexA(acc, 0.4); ctx.lineWidth = 1 * dpr; ctx.stroke(); ctx.beginPath(); ctx.fillStyle = cvHexA(acc, 0.8); ctx.arc(s[0] + Math.cos(a) * r, s[1] + Math.sin(a) * r, 2.2 * dpr, 0, 7); ctx.fill(); }); }
      // nodes
      pts.forEach((p, i) => { const s = proj(p); const on = i === fi, node = nodes[i]; const pr = node && node.future ? (0.5 + 0.5 * Math.sin(t * 2.5)) : 1;
        if (on || (node && node.future)) { ctx.beginPath(); ctx.strokeStyle = cvHexA(acc, (node && node.future ? 0.5 : 0.6) - pr * 0.3); ctx.lineWidth = 1.5 * dpr; ctx.arc(s[0], s[1], ((on ? 12 : 8) + pr * (node && node.future ? 8 : 4)) * dpr, 0, 7); ctx.stroke(); }
        ctx.beginPath(); ctx.fillStyle = i === 0 ? cvHexA(acc, 0.95) : (on ? cvHexA(acc, 0.95) : cvHexA(ink, 0.68)); ctx.arc(s[0], s[1], (i === 0 ? 7 : on ? 6 : 4) * dpr, 0, 7); ctx.fill(); });
      if (!reduce) raf = requestAnimationFrame(draw); else raf = requestAnimationFrame(() => { setTimeout(() => raf = requestAnimationFrame(draw), 60); });
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onR); };
  }, [nodes, pts]);
  useEffect(() => {
    const sc = scRef.current; if (!sc) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("on"); const i = +e.target.dataset.i; if (!isNaN(i)) focus.current = i; } }), { root: sc, threshold: 0.35 });
    sc.querySelectorAll(".cns-node").forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [nodes]);
  return (
    <div className="cns" ref={scRef}>
      <canvas className="cns-cv" ref={cvRef} />
      <div className="cns-hud">Network · <b>{m.shortName}</b></div>
      {nodes.map((n, i) => (
        <div className={"cns-node" + (i % 2 ? " right" : "")} data-i={i} key={i}><div className="cc">
          <div className="cns-k">{n.k}</div>
          <div className="cns-h">{n.big ? splitStat(n.h) : n.h}</div>
          {n.p && <div className="cns-p">{n.p}</div>}
          {n.sats && n.sats.length > 0 && <div className="cns-sat">{n.sats.map((s, j) => <span key={j}>{n.drills || n.big ? <b>{s}</b> : s}</span>)}</div>}
        </div></div>
      ))}
    </div>
  );
}

// ══ 12 · PROSPECTUS — an institutional offering document. Discrete paginated pages, a contents rail,
// running headers, page numbers, footnotes and a formal capitalization table. Wow: (1) the cover +
// seal, (2) the tabulated intercept exhibit with footnotes, (3) the capitalization table. ═══════════
function Prospectus({ m }) {
  const scRef = useRef(null); const [cur, setCur] = useState(0);
  const legal = m.legal || m.name;
  const pages = ["Cover", "The Company", "The Assets", "Evidence", "Capital", "Outlook"];
  useEffect(() => {
    const sc = scRef.current; if (!sc) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting && e.intersectionRatio >= 0.5) setCur(+e.target.dataset.i); }), { threshold: [0.5, 0.75] });
    sc.querySelectorAll(".prs-page").forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [m]);
  const rh = (n) => <div className="prs-rh"><span>{legal}</span><span>Offering summary · {n}</span></div>;
  let pn = 0; const P = () => <div className="prs-pn">{String(++pn).padStart(2, "0")}</div>;
  const cap = m.capital;
  return (
    <div className="prs" ref={scRef}>
      <div className="prs-idx">{pages.map((p, i) => <div className={"ix" + (cur === i ? " cur" : "")} key={i}>{String(i).padStart(2, "0")} {p}</div>)}</div>

      <div className="prs-page prs-cover" data-i="0">
        <div className="prs-seal">{(m.shortName || "M").slice(0, 1)}</div>
        <h1>{legal}</h1>
        <div className="sub">{m.tickers.join("  ·  ") || "Private company"}<br />{m.commodity ? m.commodity + " · " : ""}{m.geo.place || ""}<br />Offering summary · confidential</div>
      </div>

      <div className="prs-page" data-i="1">{rh("The Company")}<div className="prs-sn">1 · The Company</div>
        <h2 className="prs-h">{m.tagline || "Overview"}</h2>
        <div className="prs-cols">{[m.thesis, m.flagship.sub, m.why[0]].filter(Boolean).map((t, i) => <p key={i}>{t}{i === 0 ? <sup>1</sup> : null}</p>)}</div>
        <div className="prs-fn"><sup>1</sup> Figures and statements are drawn from the company's public disclosure. This summary is for information only and is not an offer of securities.</div>{P()}</div>

      {m.projects.length > 0 && <div className="prs-page" data-i="2">{rh("The Assets")}<div className="prs-sn">2 · The Assets</div>
        <table className="prs-tbl"><caption>Schedule of mineral properties</caption><thead><tr><th>Property</th><th>Stage</th><th>Commodity</th><th>Interest</th><th>Area</th></tr></thead>
          <tbody>{m.projects.map((p, i) => <tr key={i}><td>{i + 1}. {p.name}</td><td>{p.stage || "—"}</td><td>{p.commodity || "—"}</td><td>{p.ownership || "—"}</td><td>{p.land || "—"}</td></tr>)}</tbody></table>{P()}</div>}

      {m.flagship.drills.length > 0 && <div className="prs-page" data-i="3">{rh("Evidence")}<div className="prs-sn">3 · Selected Drill Results</div>
        <table className="prs-tbl"><caption>{m.flagship.name || "Flagship"} — disclosed intercepts<sup>2</sup></caption><thead><tr><th>Hole</th><th>Interval</th><th>Grade</th></tr></thead>
          <tbody>{m.flagship.drills.slice(0, 8).map((d, i) => <tr key={i}><td>{d.hole || "—"}</td><td>{d.interval || "—"}</td><td>{d.grade || "—"}</td></tr>)}</tbody></table>
        <div className="prs-fn"><sup>2</sup> Intervals are drill-indicated widths and may not represent true thickness. See the company's technical disclosure for QA/QC and methodology.</div>{P()}</div>}

      {cap.length > 0 && <div className="prs-page" data-i="4">{rh("Capital")}<div className="prs-sn">4 · Capitalization</div>
        <table className="prs-tbl"><caption>Capital structure</caption><thead><tr><th>Item</th><th>Amount</th></tr></thead>
          <tbody>{cap.map(([k, v], i) => <tr key={i} className={/fully diluted|market cap/i.test(k) ? "tot" : ""}><td>{k}</td><td>{v}</td></tr>)}</tbody></table>{P()}</div>}

      <div className="prs-page" data-i="5">{rh("Outlook")}<div className="prs-sn">5 · Outlook</div>
        {m.catalysts[0] ? <><h2 className="prs-h">{m.catalysts[0].label}</h2><div className="prs-cols"><p>{[m.catalysts[0].timing, m.catalysts[0].impact].filter(Boolean).join(" — ") || "Near-term catalyst."}</p>{m.why[1] ? <p>{m.why[1]}</p> : null}</div></> : <h2 className="prs-h">{m.tagline || m.shortName}</h2>}
        <div className="prs-fn">Continue the review on MineEx · {m.tickerLine || m.name}</div>{P()}</div>
    </div>
  );
}

// ══ 17 · SIGNAL — a geophysical survey coming in. Live animated traces; intercepts emerge as spikes.
// Wow: (1) the survey trace sweeps in, (2) real grades emerge as tagged amplitude spikes, (3) an
// incoming ping — the next result. Instrument mono, dark. ═══════════════════════════════════════════
function Signal({ m }) {
  const ref = useRef(null);
  useEffect(() => {
    const root = ref.current; if (!root) return;
    const canvases = [...root.querySelectorAll(".sig-trace canvas")];
    const insts = canvases.map((cv) => ({ cv, ctx: cv.getContext("2d"), dpr: 1, spikes: JSON.parse(cv.dataset.spikes || "[]"), seed: Math.random() * 10 }));
    const reduce = matchMedia("(prefers-reduced-motion:reduce)").matches;
    const size = () => insts.forEach((o) => { o.dpr = sizeCanvasEl(o.cv); });
    size(); requestAnimationFrame(() => requestAnimationFrame(size)); const onR = () => size(); window.addEventListener("resize", onR);
    const rv = (n) => getComputedStyle(root).getPropertyValue(n).trim();
    let raf, t = 0;
    const draw = () => {
      t += 0.02; const ink = rv("--ink") || "#eee", acc = rv("--accent") || "#caa96b", dim = rv("--dim") || "#889";
      insts.forEach((o) => {
        const W = o.cv.width, H = o.cv.height, mid = H * 0.56, dpr = o.dpr; o.ctx.clearRect(0, 0, W, H);
        // baseline grid
        o.ctx.strokeStyle = cvHexA(dim, 0.12); o.ctx.lineWidth = 1 * dpr; o.ctx.beginPath(); o.ctx.moveTo(0, mid); o.ctx.lineTo(W, mid); o.ctx.stroke();
        // ambient trace
        o.ctx.beginPath();
        for (let x = 0; x <= W; x += 3 * dpr) { const n = Math.sin(x * 0.01 + t + o.seed) * 5 + Math.sin(x * 0.03 - t * 1.4) * 3; let y = mid + n * dpr;
          o.spikes.forEach((sp) => { const sx = sp.x * W, d = Math.abs(x - sx); if (d < 26 * dpr) { const g = Math.exp(-(d * d) / (2 * Math.pow(9 * dpr, 2))); y -= g * sp.h * (H * 0.42); } });
          x ? o.ctx.lineTo(x, y) : o.ctx.moveTo(x, y); }
        o.ctx.strokeStyle = o.spikes.length ? cvHexA(acc, 0.9) : cvHexA(ink, 0.5); o.ctx.lineWidth = 1.4 * dpr; o.ctx.stroke();
        // sweep head
        const hx = ((t * 0.12 + o.seed) % 1) * W; o.ctx.beginPath(); o.ctx.fillStyle = cvHexA(acc, 0.9); o.ctx.arc(hx, mid, 2 * dpr, 0, 7); o.ctx.fill();
        o.ctx.strokeStyle = cvHexA(acc, 0.14); o.ctx.beginPath(); o.ctx.moveTo(hx, 0); o.ctx.lineTo(hx, H); o.ctx.stroke();
      });
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onR); };
  }, [m]);
  const drills = (m.flagship.drills || []).slice(0, 5);
  const maxg = Math.max(1, ...drills.map((d) => _gnum(d.grade)));
  const spikes = drills.map((d, i) => ({ x: 0.12 + i * (0.76 / Math.max(1, drills.length - 1)), h: Math.max(0.3, _gnum(d.grade) / maxg), hole: d.hole, grade: d.grade }));
  const c0 = m.catalysts[0];
  return (
    <div className="sig" ref={ref}>
      <div className="sig-sec"><div className="sig-k"><span className="sdot" />Survey · live · {m.geo.region || m.geo.place || m.shortName}</div>
        <div className="sig-h">{m.heroStat ? splitStat(m.heroStat.value) : m.shortName}</div>
        {m.thesis && <div className="sig-p">{m.thesis}</div>}
        <div className="sig-trace"><canvas data-spikes="[]" /></div>
      </div>

      {drills.length > 0 && <div className="sig-sec"><div className="sig-k"><span className="sdot" />Intercepts · amplitude by grade</div>
        <div className="sig-h" style={{ fontSize: "clamp(24px,3vw,44px)" }}>{m.flagship.name || "Anomalies"}</div>
        <div className="sig-trace"><canvas data-spikes={JSON.stringify(spikes.map((s) => ({ x: s.x, h: s.h })))} />
          {spikes.map((s, i) => <div className="sig-tag" key={i} style={{ left: s.x * 100 + "%", top: (1 - s.h * 0.42 - 0.44) * 100 + "%" }}>{s.grade}<span className="th">{s.hole}</span></div>)}
        </div>
        <div className="sig-p">Each spike is a real disclosed intercept, amplitude scaled to grade.</div>
      </div>}

      {m.projects.length > 0 && <div className="sig-sec"><div className="sig-k"><span className="sdot" />Targets detected · {m.projects.length}</div>
        <div className="sig-rows">{m.projects.map((p, i) => <div className="sr" key={i}><span>{p.name}</span><span className="a">{[p.stage, p.commodity, p.location].filter(Boolean).join(" · ")}</span><span className="g">{p.ownership || "—"}</span></div>)}</div>
      </div>}

      {m.capital.length > 0 && <div className="sig-sec"><div className="sig-k"><span className="sdot" />Readouts · capital</div>
        <div className="sig-gauges">{m.capital.map(([k, v], i) => <div className="g" key={i}><div className="v">{v}</div><div className="k">{k}</div></div>)}</div>
      </div>}

      {c0 && <div className="sig-sec"><div className="sig-k"><span className="sdot" />Incoming{c0.timing ? " · " + c0.timing : ""}</div>
        <div className="sig-h" style={{ fontSize: "clamp(26px,3.4vw,50px)" }}>{c0.label}</div>
        {c0.impact && <div className="sig-p">{c0.impact}</div>}
        <div className="sig-trace"><canvas data-spikes="[]" /></div>
      </div>}

      <div className="sig-sec" style={{ borderBottom: "none" }}><div className="sig-k"><span className="sdot" />Signal locked</div>
        <div className="sig-h" style={{ fontSize: "clamp(26px,3.4vw,48px)" }}>Follow {m.shortName} on MineEx</div>
      </div>
    </div>
  );
}

// ══ 15 · BLUEPRINT — an engineering drafting sheet. Title block, construction lines, dimension
// annotations, self-drawing orthogonal schematics (of the BUILT project, not geology). Wow: (1) the
// general-arrangement schematic constructs itself, (2) a dimensioned intercept detail, (3) the
// revisions & approvals block. ═════════════════════════════════════════════════════════════════════
function Blueprint({ m }) {
  const ref = useRef(null);
  _useOn(ref, ".bp-draw", [m]);
  const drills = (m.flagship.drills || []).slice(0, 5);
  const maxg = Math.max(1, ...drills.map((d) => _gnum(d.grade)));
  return (
    <div className="bp" ref={ref}><div className="bp-sheet">
      <div className="bp-tb">
        <div><div className="t">Project / drawing</div><div className="b">{(m.flagship.name || m.shortName)} — General Arrangement</div></div>
        <div><div className="t">Sheet</div><div className="b">GP-001 · Rev A</div></div>
      </div>

      <div className="bp-sec"><div className="bp-sn">1 · General arrangement</div>
        <div className="bp-draw"><svg viewBox="0 0 820 320">
          <path className="ln" d="M70 56 H490 V252 H70 Z" pathLength="1" />
          <path className="ln2" d="M70 154 H490" pathLength="1" />
          <path className="ln" d="M210 116 C160 150 200 214 288 196 C372 180 360 120 300 104 C270 96 236 100 210 116 Z" pathLength="1" />
          <path className="dim" d="M70 280 H490 M70 274 V286 M490 274 V286" />
          <text className="dt" x="280" y="298" textAnchor="middle">{(m.projects[0] && m.projects[0].land) || "claim block"}</text>
          <path className="dim" d="M520 56 V252 M514 56 H526 M514 252 H526" />
          <text x="536" y="120">{m.commodity || "—"}</text>
          <text x="536" y="140" className="dt">{m.projects[0] && m.projects[0].ownership ? m.projects[0].ownership + " owned" : ""}</text>
          <text x="536" y="176">{m.geo.region || m.geo.place || ""}</text>
          <text x="212" y="150" className="dt">OREBODY (SCHEMATIC)</text>
        </svg></div></div>

      {m.projects.length > 0 && <div className="bp-sec"><div className="bp-sn">2 · Schedule of properties</div>
        <table className="bp-sched"><thead><tr><th>Ref</th><th>Property</th><th>Stage</th><th>Commodity</th><th>Interest</th><th>Area</th></tr></thead>
          <tbody>{m.projects.map((p, i) => <tr key={i}><td>P{String(i + 1).padStart(2, "0")}</td><td>{p.name}</td><td>{p.stage || "—"}</td><td>{p.commodity || "—"}</td><td className="n">{p.ownership || "—"}</td><td>{p.land || "—"}</td></tr>)}</tbody></table></div>}

      {drills.length > 0 && <div className="bp-sec"><div className="bp-sn">3 · Detail — logged intercepts</div>
        <div className="bp-draw"><svg viewBox="0 0 820 300">
          <path className="ln2" d="M40 70 H780" pathLength="1" /><text x="40" y="60">SURFACE</text>
          {drills.map((d, i) => { const x0 = 120 + i * 130, x1 = x0 + 46, len = 150 + (i % 3) * 40, y1 = 70 + len, g = _gnum(d.grade), sa = 0.45, sb = 0.62;
            const ax = x0 + (x1 - x0) * sa, ay = 70 + len * sa, bx = x0 + (x1 - x0) * sb, by = 70 + len * sb;
            return <g key={i}>
              <path className="ln2" d={`M${x0} 70 L${x1} ${y1}`} pathLength="1" />
              <path className="ln" d={`M${ax} ${ay} L${bx} ${by}`} pathLength="1" style={{ strokeWidth: Math.max(3, g / maxg * 9) }} />
              <text x={x1 + 8} y={(ay + by) / 2} className="dt">{d.grade}</text>
              <text x={x1 + 8} y={(ay + by) / 2 + 15}>{d.hole}</text>
            </g>; })}
        </svg></div><div className="bp-sn" style={{ marginTop: 16, color: "var(--dim)" }}>Intercept widths are drill-indicated · not to true scale</div></div>}

      {m.capital.length > 0 && <div className="bp-sec"><div className="bp-sn">4 · Bill of capital</div>
        <table className="bp-sched"><thead><tr><th>Item</th><th>Quantity</th></tr></thead>
          <tbody>{m.capital.map(([k, v], i) => <tr key={i}><td>{k}</td><td className="n">{v}</td></tr>)}</tbody></table></div>}

      {(m.timeline.length > 0 || m.team.length > 0) && <div className="bp-sec"><div className="bp-sn">5 · Revisions &amp; approvals</div>
        <table className="bp-sched"><tbody>
          {m.timeline.slice(0, 4).map((t, i) => <tr className="rev" key={"t" + i}><td>Rev {String.fromCharCode(65 + i)}</td><td style={{ textAlign: "left", paddingLeft: 20 }}>{t.headline}</td><td>{(t.date || "").slice(0, 10)}</td></tr>)}
          {m.team.slice(0, 3).map((p, i) => <tr key={"a" + i}><td>Approved</td><td style={{ textAlign: "left", paddingLeft: 20, color: "var(--ink)" }}>{p.name}</td><td>{p.role}</td></tr>)}
        </tbody></table></div>}
    </div></div>
  );
}

// ══ 20 · ARCHIVE — a research archive. Folders, evidence sheets, rubber stamps, corner-mounted photos,
// assay record cards — dated, initialed, scattered and slightly rotated. Wow: (1) the file folder
// opens, (2) assay records stamp RECEIVED, (3) a pending action stamped on top. ════════════════════
function _Mounts() { return <>{[["top", "left"], ["top", "right"], ["bottom", "left"], ["bottom", "right"]].map((c, i) => <span className="arc-mount" key={i} style={{ [c[0]]: 8, [c[1]]: 8 }} />)}</>; }
function Archive({ m }) {
  const ref = useRef(null);
  _useOn(ref, ".arc-rec", [m]);
  const drills = (m.flagship.drills || []).slice(0, 5);
  const _ini = (s) => (s || "").split(/\s+/).map((w) => w[0]).slice(0, 2).join("");
  return (
    <div className="arc" ref={ref}><div className="arc-wrap">
      <div className="arc-folder"><span className="arc-tab">Confidential file · {m.tickers[0] || m.shortName}</span>
        <div className="arc-k">MineEx archive · {m.geo.place || ""}</div>
        <div className="arc-h">{m.name}</div>
        {m.thesis && <div className="arc-type">RE: {m.thesis}</div>}
      </div>

      {m.projects.length > 0 && <div className="arc-sec"><div className="arc-lbl">Property files</div>
        <div className="arc-scatter">
          {m.projects.map((p, i) => <div className="arc-card" key={i}>
            <div className="ct"><span>File P{String(i + 1).padStart(2, "0")}</span><span>{p.stage || "—"}</span></div>
            <div className="cn">{p.name}</div>
            <div className="cm">{p.location ? <>Loc · <b>{p.location}</b><br /></> : null}{p.commodity ? <>Commodity · <b>{p.commodity}</b><br /></> : null}{p.ownership ? <>Interest · <b>{p.ownership}</b></> : null}</div>
          </div>)}
          {m.images.field && <div className="arc-photo"><_Mounts /><img src={m.images.field} alt="" /><span className="cap">Fig. — {m.flagship.name || "field"}</span></div>}
        </div></div>}

      {drills.length > 0 && <div className="arc-sec arc-rec"><div className="arc-lbl">Assay records <span className="arc-stamp" style={{ marginLeft: 14 }}>Received</span></div>
        <div className="arc-card" style={{ transform: "rotate(-.4deg)" }}>
          <div className="ct"><span>Certificate · {m.flagship.name || "flagship"}</span><span>g/t Au</span></div>
          {drills.map((d, i) => <div className="arc-recrow" key={i}><span>{d.hole || "—"}</span><span className="h">{d.interval || ""}</span><span className="g">{d.grade || "—"}</span></div>)}
        </div></div>}

      {m.capital.length > 0 && <div className="arc-sec"><div className="arc-lbl">Ledger of holdings</div>
        <div className="arc-card" style={{ transform: "rotate(.3deg)", flex: "1 1 100%" }}><div className="arc-ledger">{m.capital.map(([k, v], i) => <div className="lr" key={i}><span className="k">{k}</span><span className="v">{v}</span></div>)}</div></div></div>}

      {m.timeline.length > 0 && <div className="arc-sec"><div className="arc-lbl">Chronological record</div>
        <div className="arc-scatter">{m.timeline.slice(0, 6).map((t, i) => <div className="arc-card" key={i} style={{ flex: "1 1 340px" }}>
          <div className="ct"><span>{(t.date || "").slice(0, 10)}</span><span>Entry {String(i + 1).padStart(2, "0")}</span></div>
          <div className="cn" style={{ fontSize: 19 }}>{t.headline}</div></div>)}</div></div>}

      {m.team.length > 0 && <div className="arc-sec"><div className="arc-lbl">Personnel index</div>
        <div className="arc-idx">{m.team.slice(0, 8).map((p, i) => <div className="ic" key={i}><div className="nm">{_ini(p.name)} · {p.name}</div><div className="rl">{p.role}</div></div>)}</div></div>}

      {m.catalysts[0] && <div className="arc-sec arc-rec"><div className="arc-lbl">Pending action <span className="arc-stamp" style={{ marginLeft: 14 }}>Pending</span></div>
        <div className="arc-card" style={{ transform: "rotate(-.6deg)", flex: "1 1 100%" }}><div className="cn">{m.catalysts[0].label}</div><div className="cm">{[m.catalysts[0].timing, m.catalysts[0].impact].filter(Boolean).join(" — ")}</div></div></div>}

      <div style={{ textAlign: "center", padding: "40px 0 10px", fontFamily: "var(--mono)", fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--dim)" }}>End of file · continue on MineEx</div>
    </div></div>
  );
}

// ══ 22 · GALLERY — a museum exhibition. One work at a time in vast whitespace; giant image + a tiny
// curatorial wall label; deliberate emptiness and slow pacing. Wow: (1) the headline work is hung,
// (2) an evidence plate of the finest specimen, (3) the coming-exhibition placard. ═════════════════
function Gallery({ m }) {
  const ref = useRef(null); _useOn(ref, ".gal-exh", [m]);
  const imgs = [m.images.hero, m.images.field, m.images.camp].filter(Boolean);
  const best = (m.flagship.drills || []).slice().sort((a, b) => _gnum(b.grade) - _gnum(a.grade))[0];
  const works = [{ img: imgs[0], t: m.flagship.name || m.shortName, meta: [["Medium", m.commodity], ["Dimensions", m.projects[0] && m.projects[0].land], ["Locality", m.geo.place]] }];
  m.projects.slice(1).forEach((p, i) => works.push({ img: imgs[(i + 1) % Math.max(1, imgs.length)], t: p.name, meta: [["Medium", [p.stage, p.commodity].filter(Boolean).join(", ")], ["Interest", p.ownership], ["Locality", p.location]] }));
  return (
    <div className="gal" ref={ref}>
      {works.map((w, i) => <div className="gal-exh" key={i}><div className="gal-work">
        {i === 0 && <div className="gal-eyebrow">MineEx · Exhibition{m.geo.place ? " · " + m.geo.place : ""}</div>}
        <div className="gal-frame">{w.img ? <img src={w.img} alt="" /> : <div className="ph" />}</div>
        <div className="gal-label"><div className="t">{w.t}</div><div className="m">{w.meta.filter((x) => x[1]).map((x, j) => <React.Fragment key={j}>{x[0]} · {x[1]}<br /></React.Fragment>)}</div></div>
      </div></div>)}
      {m.heroStat && <div className="gal-exh"><div className="gal-plate"><div className="gal-eyebrow">The measure</div><div className="big">{splitStat(m.heroStat.value)}</div>
        <div className="gal-tomb">{m.heroStat.label}<br />{m.heroStat.context ? <b>{m.heroStat.context}</b> : null}{best ? <><br />Finest specimen · <b>{best.grade}</b> ({best.hole})</> : null}</div></div></div>}
      {m.capital.length > 0 && <div className="gal-exh"><div className="gal-plate"><div className="gal-eyebrow">Provenance</div><div className="gal-h">Capital</div>
        <div className="gal-tomb">{m.capital.map(([k, v], i) => <React.Fragment key={i}>{k} · <b>{v}</b><br /></React.Fragment>)}</div></div></div>}
      {m.catalysts[0] && <div className="gal-exh"><div className="gal-plate"><div className="gal-eyebrow">Coming exhibition{m.catalysts[0].timing ? " · " + m.catalysts[0].timing : ""}</div><div className="gal-h">{m.catalysts[0].label}</div></div></div>}
      {m.team.length > 0 && <div className="gal-exh"><div className="gal-plate"><div className="gal-eyebrow">With thanks to</div><div className="gal-tomb" style={{ fontSize: 13.5 }}>{m.team.slice(0, 6).map((p, i) => <React.Fragment key={i}><b>{p.name}</b> · {p.role}<br /></React.Fragment>)}</div></div></div>}
      <div className="gal-exh"><div className="gal-plate"><div className="gal-eyebrow">End of exhibition</div><div className="gal-h">Follow {m.shortName} on MineEx</div></div></div>
    </div>
  );
}

// ══ 18 · VEIN — one organic mineral vein grows through the whole page; every section buds off it. The
// vein draws ahead of scroll. Wow: (1) the vein begins at surface, (2) ore shoots — intercepts thicken
// the vein where grade is high, (3) the vein's leading tip, still growing. ═════════════════════════
function Vein({ m }) {
  const scRef = useRef(null), pathRef = useRef(null);
  useEffect(() => {
    const sc = scRef.current, path = pathRef.current; if (!sc || !path) return;
    let len = 0; try { len = path.getTotalLength(); } catch (e) { len = 300; }
    path.style.strokeDasharray = len; path.style.strokeDashoffset = len;
    const onScroll = () => { const max = sc.scrollHeight - sc.clientHeight; const p = max > 0 ? sc.scrollTop / max : 0; path.style.strokeDashoffset = len * (1 - Math.min(1, p * 1.08)); };
    sc.addEventListener("scroll", onScroll, { passive: true }); onScroll();
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) e.target.classList.add("on"); }), { root: sc, threshold: 0.4 });
    sc.querySelectorAll(".vn-bud").forEach((b) => io.observe(b));
    return () => { sc.removeEventListener("scroll", onScroll); io.disconnect(); };
  }, [m]);
  const drills = (m.flagship.drills || []).slice(0, 4);
  const D = "M50 -2 C 18 16, 82 32, 50 50 C 18 68, 82 84, 50 102";
  return (
    <div className="vn" ref={scRef}>
      <svg className="vn-svg" viewBox="0 0 100 100" preserveAspectRatio="none"><path className="vn-ghost" d={D} vectorEffect="non-scaling-stroke" /><path ref={pathRef} className="vn-path" d={D} vectorEffect="non-scaling-stroke" /></svg>
      <div className="vn-bud"><div className="bc"><div className="vn-k">Surface</div><div className="vn-h">{m.shortName}</div>{m.thesis && <div className="vn-p">{m.thesis}</div>}</div></div>
      {m.projects.map((p, i) => <div className={"vn-bud" + (i % 2 ? " right" : "")} key={i}><div className="bc"><div className="vn-k">{p.stage || "Vein"}</div><div className="vn-h">{p.name}</div>
        <div className="vn-p">{[p.commodity, p.location, p.ownership && p.ownership + " owned"].filter(Boolean).join(" · ")}</div>{p.overview && <div className="vn-p" style={{ fontSize: 16 }}>{p.overview}</div>}</div></div>)}
      {drills.length > 0 && <div className="vn-bud right"><div className="bc"><div className="vn-k">Ore shoots · assays</div><div className="vn-h">{m.heroStat ? splitStat(m.heroStat.value) : "High grade"}</div>
        <div className="vn-shoot">{drills.map((d, i) => <span key={i}>{d.hole} — <b>{d.grade}</b>{d.interval ? " / " + d.interval : ""}</span>)}</div></div></div>}
      {m.capital.length > 0 && <div className="vn-bud"><div className="bc"><div className="vn-k">Where the vein widens · capital</div>
        <div className="vn-shoot" style={{ fontSize: 15, marginTop: 16 }}>{m.capital.map(([k, v], i) => <span key={i}><b>{v}</b> {k.toLowerCase()}</span>)}</div></div></div>}
      {m.catalysts[0] && <div className="vn-bud right"><div className="bc"><div className="vn-k">Leading tip{m.catalysts[0].timing ? " · " + m.catalysts[0].timing : ""}</div><div className="vn-h">{m.catalysts[0].label}</div>{m.catalysts[0].impact && <div className="vn-p">{m.catalysts[0].impact}</div>}</div></div>}
      <div className="vn-bud"><div className="bc"><div className="vn-k">Follow the vein</div><div className="vn-h">Follow {m.shortName} on MineEx</div></div></div>
    </div>
  );
}

// ══ 24 · CHRONICLE — the company organized ENTIRELY by time. One continuous axis; projects, financings,
// results and catalysts attach at their dates. No topic sections. Wow: (1) the axis + 'today', (2) a
// dated result carrying its figure, (3) future catalysts above 'today'. ═══════════════════════════════
function Chronicle({ m }) {
  const ref = useRef(null);
  useEffect(() => { const el = ref.current; if (!el) return; const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) e.target.classList.add("on"); }), { threshold: 0.3 }); el.querySelectorAll(".chr-r").forEach((n) => io.observe(n)); return () => io.disconnect(); }, [m]);
  const events = [];
  m.timeline.forEach((t) => events.push({ date: t.date, h: t.headline, p: t.why, tag: "Milestone", big: (/resourc|moz|drill|intercept|assay|grade/i.test(t.headline) && m.heroStat) ? m.heroStat.value : null }));
  m.financings.forEach((f) => { if (f.date) events.push({ date: f.date, h: (f.amount || "Financing") + (f.type ? " · " + f.type : ""), tag: "Financing" }); });
  events.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const future = m.catalysts[0] ? [{ date: m.catalysts[0].timing || "Next", h: m.catalysts[0].label, p: m.catalysts[0].impact, tag: "Catalyst", fut: true }] : [];
  const rows = [...events, ...future];
  return (
    <div className="chr" ref={ref}>
      <div className="chr-axis" />
      <div className="chr-head chr-r"><div className="k">The record · {m.shortName}</div><h1>Told by time.</h1>{m.thesis && <p>{m.thesis}</p>}</div>
      {rows.map((e, i) => <React.Fragment key={i}>
        {i === events.length && future.length > 0 && <div className="chr-marker chr-r"><span>Today</span></div>}
        <div className={"chr-ev " + (i % 2 ? "r" : "l") + (e.fut ? " future" : "")}>
          <div className="dot" />
          <div className="side chr-r">
            <div className="date">{e.fut ? e.date : (e.date || "").slice(0, 10)}</div>
            <div className="h">{e.h}</div>
            {e.big && <div className="big">{e.big}</div>}
            {e.p && <div className="p">{e.p}</div>}
            <div className="tag">{e.tag}</div>
          </div>
        </div>
      </React.Fragment>)}
    </div>
  );
}

// ══ 21 · SPECIMEN — a natural-history collection. A dense taxonomic GRID of labelled specimen plates,
// each with a sample number, scale bar and classification. The opposite of Gallery's emptiness. Wow:
// (1) the classified collection, (2) assay specimens with scale bars, (3) accession pending. ════════
function Specimen({ m }) {
  const ref = useRef(null); _useOn(ref, ".spc-plate", [m]);
  const imgs = [m.images.field, m.images.camp, m.images.hero].filter(Boolean);
  const drills = (m.flagship.drills || []).slice(0, 4);
  let acc = 1000; const no = () => "№ " + (++acc);
  return (
    <div className="spc" ref={ref}>
      <div className="spc-head"><div><div className="k">MineEx · Collection</div><h1>{m.name}</h1></div><div className="acc">Accession · {m.tickers[0] || m.shortName}<br />{[m.commodity, m.geo.place].filter(Boolean).join(" · ")}</div></div>
      {m.projects.length > 0 && <><div className="spc-lbl">Class · Properties ({m.projects.length})</div>
        <div className="spc-grid">{m.projects.map((p, i) => <div className="spc-plate" key={i}><div className="no">{no()}</div>
          <div className="fig">{imgs.length ? <img src={imgs[i % imgs.length]} alt="" /> : null}<span className="scale" /></div>
          <div className="nm">{p.name}</div><div className="lat">{p.commodity || m.commodity}</div>
          <div className="cls">Locality · <b>{p.location || "—"}</b><br />Formation · <b>{p.stage || "—"}</b><br />Interest · <b>{p.ownership || "—"}</b></div></div>)}</div></>}
      {drills.length > 0 && <><div className="spc-lbl">Class · Assay specimens</div>
        <div className="spc-grid">{drills.map((d, i) => <div className="spc-plate" key={i}><div className="no">{no()}</div>
          <div className="fig" style={{ height: 76 }}><span className="scale" /></div>
          <div className="nm" style={{ fontSize: 17 }}>{d.hole}</div><div className="lat">{m.flagship.name || "flagship"}</div>
          <div className="cls">Grade · <b>{d.grade}</b><br />Interval · <b>{d.interval || "—"}</b></div></div>)}</div></>}
      {m.capital.length > 0 && <><div className="spc-lbl">Catalogue · Capital</div>
        <div className="spc-grid">{m.capital.map(([k, v], i) => <div className="spc-plate" key={i} style={{ padding: "18px 20px" }}><div className="nm" style={{ fontFamily: "var(--mono)", fontSize: 22 }}>{v}</div><div className="cls" style={{ borderTop: "none", paddingTop: 6, marginTop: 8 }}>{k}</div></div>)}</div></>}
      {m.team.length > 0 && <><div className="spc-lbl">Curated by</div>
        <div className="spc-grid">{m.team.slice(0, 6).map((p, i) => <div className="spc-plate" key={i} style={{ padding: "18px 20px" }}><div className="nm" style={{ fontSize: 18 }}>{p.name}</div><div className="cls" style={{ borderTop: "none", paddingTop: 6, marginTop: 6 }}>{p.role}</div></div>)}</div></>}
      {m.catalysts[0] && <><div className="spc-lbl">Accession pending{m.catalysts[0].timing ? " · " + m.catalysts[0].timing : ""}</div>
        <div className="spc-grid"><div className="spc-plate" style={{ gridColumn: "1/-1" }}><div className="nm">{m.catalysts[0].label}</div>{m.catalysts[0].impact && <div className="cls">{m.catalysts[0].impact}</div>}</div></div></>}
    </div>
  );
}

// ══ 25 · EXPEDITION — a horizontal geographic route. Travel the traverse left→right; each project is a
// dated stop with a field note; a dashed route runs behind. Wow: (1) base camp, (2) field-note assays
// at each stop, (3) the next leg / destination ahead. ═══════════════════════════════════════════════
function Expedition({ m }) {
  const scRef = useRef(null), routeRef = useRef(null);
  useEffect(() => {
    const sc = scRef.current; if (!sc) return;
    const onWheel = (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { sc.scrollLeft += e.deltaY; e.preventDefault(); } };
    sc.addEventListener("wheel", onWheel, { passive: false });
    const fit = () => { if (routeRef.current) routeRef.current.style.width = sc.scrollWidth + "px"; };
    requestAnimationFrame(fit); window.addEventListener("resize", fit);
    return () => { sc.removeEventListener("wheel", onWheel); window.removeEventListener("resize", fit); };
  }, [m]);
  const best = (m.flagship.drills || []).slice().sort((a, b) => _gnum(b.grade) - _gnum(a.grade))[0];
  const coord = m.geo.lat != null ? `${m.geo.lat.toFixed(2)}°, ${m.geo.lng.toFixed(2)}°` : (m.geo.place || "");
  const stops = [];
  stops.push(<><div className="exp-marker" /><div className="leg">Base camp</div>{coord && <div className="coord">{coord}</div>}<h2>{m.geo.region || m.geo.place || m.shortName}.</h2>{m.thesis && <div className="exp-note"><div className="nl">Field brief</div>{m.thesis}</div>}</>);
  m.projects.forEach((p, i) => stops.push(<><div className="exp-marker" /><div className="leg">Leg {i + 1} · {p.stage || "stop"}</div>{p.location && <div className="coord">{p.location}</div>}<h2>{p.name}</h2>
    <div className="exp-note"><div className="nl">Field note</div>{p.overview || [p.commodity, p.ownership && p.ownership + " owned"].filter(Boolean).join(" · ")}{i === 0 && best ? <div className="rr" style={{ marginTop: 10, borderTop: "1px solid var(--line)", paddingTop: 10 }}><span>Best assay</span><b>{best.grade}</b></div> : null}</div>
    <div className="exp-meta">{[p.commodity, p.ownership && p.ownership + " owned", p.land].filter(Boolean).map((x, j) => <span key={j}><b>{x}</b></span>)}</div></>));
  if (m.heroStat) stops.push(<><div className="exp-marker" /><div className="leg">Survey</div><h2>{splitStat(m.heroStat.value)}</h2><div className="exp-meta"><span><b>{m.heroStat.label}</b></span>{m.heroStat.context && <span>{m.heroStat.context}</span>}</div></>);
  if (m.catalysts[0]) stops.push(<><div className="exp-marker" /><div className="leg">Next leg{m.catalysts[0].timing ? " · " + m.catalysts[0].timing : ""}</div><h2>{m.catalysts[0].label}.</h2>{m.catalysts[0].impact && <div className="exp-note"><div className="nl">On the horizon</div>{m.catalysts[0].impact}</div>}</>);
  stops.push(<><div className="exp-marker" /><div className="leg">Journey's end</div><h2>Follow {m.shortName}.</h2><div className="exp-meta"><span>on MineEx · <b>{m.tickerLine}</b></span></div></>);
  return (
    <>
      <div className="exp" ref={scRef}><div className="exp-route" ref={routeRef} />{stops.map((s, i) => <div className="exp-stop" key={i}>{s}</div>)}</div>
      <div className="exp-hud">Expedition · <b>{m.shortName}</b></div>
    </>
  );
}

// ATLAS V4 body — a persistent district-map rail (the INDEX to the company) + a cartographic field
// register. Scrolling the register activates the matching project ON the map: the crosshair tweens to
// its indexed position, the pin illuminates, the grid reference + jurisdiction datum update. Ends on a
// full-portfolio map. Honest geography only: real jurisdiction lat/lng + locations; project marks are
// labelled SCHEMATIC indexed positions, never claimed precise coordinates.
const _AFX_POS = [[40, 40], [61, 34], [52, 63], [33, 66], [70, 58], [46, 49]];
function AtlasBodyV4({ m }) {
  const [active, setActive] = useState(0);
  const regRef = useRef(null), mapRef = useRef(null), xhRef = useRef(null), curRef = useRef([50, 50]), rafRef = useRef();
  const projects = m.projects;
  const gpos = (i) => _AFX_POS[i % _AFX_POS.length];
  const gref = (i) => { const [x, y] = gpos(i); return String.fromCharCode(65 + Math.min(4, Math.floor(x / 20))) + "-" + Math.min(5, Math.floor(y / 20) + 1); };
  const jur = m.geo, drills = (m.flagship.drills || []).slice(0, 5);
  const datum = jur.lat != null ? jur.lat.toFixed(2) + "°, " + jur.lng.toFixed(2) + "°" : "disclosed";
  useEffect(() => {
    const sc = regRef.current; if (!sc) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("afx-on"); const a = +e.target.dataset.act; setActive(isNaN(a) ? 0 : a); } }), { threshold: 0.55 });
    sc.querySelectorAll(".afx-entry").forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [m]);
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    map.querySelectorAll(".pin").forEach((el) => el.classList.toggle("act", active === -1 || +el.dataset.i === active));
    map.querySelectorAll(".pinlab").forEach((el) => el.classList.toggle("act", active === -1 || +el.dataset.i === active));
    const xh = xhRef.current; if (!xh) return;
    if (active < 0) { xh.classList.remove("on"); return; }
    xh.classList.add("on");
    const target = gpos(active); cancelAnimationFrame(rafRef.current);
    const step = () => { const c = curRef.current; c[0] += (target[0] - c[0]) * 0.2; c[1] += (target[1] - c[1]) * 0.2;
      xh.setAttribute("transform", `translate(${c[0].toFixed(2)} ${c[1].toFixed(2)})`);
      if (Math.abs(target[0] - c[0]) > 0.25 || Math.abs(target[1] - c[1]) > 0.25) rafRef.current = requestAnimationFrame(step);
      else xh.setAttribute("transform", `translate(${target[0]} ${target[1]})`); };
    step();
    return () => cancelAnimationFrame(rafRef.current);
  }, [active]);
  const grat = []; for (let g = 20; g < 100; g += 20) { grat.push(<line key={"x" + g} x1={g} y1="5" x2={g} y2="95" />); grat.push(<line key={"y" + g} x1="5" y1={g} x2="95" y2={g} />); }
  const cols = ["A", "B", "C", "D", "E"];
  const Entry = (act, cls, body) => <div className={"afx-entry" + (cls || "")} data-act={act}><div className="afx-in">{body}</div></div>;
  let sheet = 0; const sn = () => "Sheet " + String(++sheet).padStart(2, "0");
  return (
    <div className="afx"><div className="afx-grid">
      <div className="afx-map" ref={mapRef}>
        <div className="mh"><span>District index</span><span><b>{jur.region || jur.place || "Jurisdiction"}</b></span></div>
        <div className="mv"><svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          <g className="grat">{grat}</g>
          {cols.map((c, i) => <text key={c} className="gratlab" x={9 + i * 20} y="8">{c}</text>)}
          {[1, 2, 3, 4, 5].map((r) => <text key={r} className="gratlab" x="1.5" y={13 + (r - 1) * 20}>{r}</text>)}
          <path className="district" d="M22 27 L52 17 L80 29 L85 55 L69 83 L36 85 L15 57 Z" />
          {projects.map((p, i) => { const [x, y] = gpos(i); return <g key={i}><circle className="pin" data-i={i} cx={x} cy={y} r="1.9" /><text className="pinlab" data-i={i} x={x + 3.2} y={y + 1.1}>P{String(i + 1).padStart(2, "0")}</text></g>; })}
          <g className="xh" ref={xhRef}><line x1="-120" y1="0" x2="120" y2="0" /><line x1="0" y1="-120" x2="0" y2="120" /></g>
          <g className="northm" transform="translate(91 11)"><line x1="0" y1="5" x2="0" y2="-3.5" stroke="var(--dim)" strokeWidth=".5" /><text className="gratlab" x="-1.3" y="-4.5">N</text></g>
          <line x1="7" y1="93.5" x2="23" y2="93.5" stroke="var(--dim)" strokeWidth=".7" /><text className="gratlab" x="7" y="91">scale · schematic index</text>
        </svg></div>
        <div className="mf"><span>Datum · {datum}</span><b>{active >= 0 && projects[active] ? "Ref " + gref(active) : (jur.country || "District")}</b></div>
      </div>

      <div className="afx-reg" ref={regRef}>
        {Entry(0, "", <><div className="afx-sheet">{sn()}</div><div className="afx-ix">Field atlas · {jur.place || "jurisdiction"}</div>
          <div className="afx-t">{m.shortName}</div>
          <div className="afx-coord"><span>Datum · <b>{datum}</b></span>{jur.region && <span>Region · <b>{jur.region}</b></span>}</div>
          {m.thesis && <div className="afx-o">{m.thesis}</div>}</>)}

        {projects.map((p, i) => Entry(i, "", <React.Fragment key={i}><div className="afx-sheet">{sn()} · Ref {gref(i)}</div>
          <div className="afx-ix">P{String(i + 1).padStart(2, "0")} · {p.stage || "asset"}</div>
          <div className="afx-t">{p.name}</div>
          <div className="afx-coord"><span>Grid · <b>{gref(i)}</b></span>{p.location && <span><b>{p.location}</b></span>}</div>
          {p.overview && <div className="afx-o">{p.overview}</div>}
          <dl className="afx-meta">{[["Commodity", p.commodity], ["Interest", p.ownership], ["Land", p.land]].filter((r) => r[1]).map((r, k) => <React.Fragment key={k}><dt>{r[0]}</dt><dd>{r[1]}</dd></React.Fragment>)}</dl></React.Fragment>))}

        {drills.length > 0 && Entry(0, "", <><div className="afx-sheet">{sn()} · Ref {gref(0)}</div><div className="afx-ix">Logged intercepts · {m.flagship.name || "flagship"}</div>
          <div className="afx-t" style={{ fontSize: "clamp(24px,2.8vw,40px)" }}>{m.heroStat ? splitStat(m.heroStat.value) : "The evidence"}</div>
          <div className="afx-drill">{drills.map((d, i) => <div className="r" key={i}><span style={{ color: "var(--dim)" }}>{d.hole || "—"}</span><span>{d.interval || ""}</span><span className="g">{d.grade || "—"}</span></div>)}</div></>)}

        {m.capital.length > 0 && Entry(0, "", <><div className="afx-sheet">{sn()}</div><div className="afx-ix">Capital position</div>
          <div className="afx-t" style={{ fontSize: "clamp(24px,2.8vw,40px)" }}>Held &amp; funded</div>
          <div className="afx-ribbon">{m.capital.map(([k, v], i) => <div className="rc" key={i}><div className="k">{k}</div><div className="v">{v}</div></div>)}</div></>)}

        {m.catalysts[0] && Entry(0, "", <><div className="afx-sheet">{sn()}</div><div className="afx-ix">Next catalyst{m.catalysts[0].timing ? " · " + m.catalysts[0].timing : ""}</div>
          <div className="afx-t" style={{ fontSize: "clamp(26px,3.2vw,46px)" }}>{m.catalysts[0].label}</div>
          {m.catalysts[0].impact && <div className="afx-o">{m.catalysts[0].impact}</div>}</>)}

        {Entry(-1, "", <><div className="afx-sheet">{sn()} · full sheet</div><div className="afx-ix">The company, mapped</div>
          <div className="afx-t" style={{ fontSize: "clamp(26px,3.2vw,48px)" }}>{projects.length} indexed {projects.length === 1 ? "asset" : "assets"}, one district.</div>
          <div className="afx-port">{projects.map((p, i) => <div className="pr" key={i}><span className="id">P{String(i + 1).padStart(2, "0")}</span><span className="nm">{p.name}</span><span className="rf">{gref(i)} · {p.location || m.geo.region || ""}</span></div>)}</div>
          {m.why[0] && <div className="afx-o" style={{ marginTop: 24, color: "var(--ink)", fontSize: 17 }}>{m.why[0]}</div>}</>)}

        {Entry(-1, "", <><div className="afx-ix">End of sheet</div><div className="afx-t">Follow {m.shortName}<br />on MineEx.</div></>)}
      </div>
    </div></div>
  );
}

// ── TEMPLATE REGISTRY ── add an entry per template as it's ported; the Studio + switcher read this.
const TEMPLATES = {
  monolith: { label: "01 · Monolith", render: (m) => <Monolith m={m} /> },
  atlas: { label: "02 · Atlas", render: (m) => <Atlas m={m} /> },
  ledger: { label: "03 · Ledger", render: (m) => <Ledger m={m} /> },
  strata: { label: "04 · Strata", render: (m) => <Strata m={m} /> },
  keynote: { label: "05 · Keynote", render: (m) => <Keynote m={m} /> },
  terminal: { label: "06 · Terminal", render: (m) => <Terminal m={m} /> },
  dossier: { label: "07 · Dossier", render: (m) => <Dossier m={m} /> },
  index: { label: "08 · Index", render: (m) => <IndexTpl m={m} /> },
  pulse: { label: "09 · Pulse", render: (m) => <Pulse m={m} /> },
  pulse2: { label: "26 · Pulse II (original)", render: (m) => <Pulse2 m={m} /> },
  orbit: { label: "10 · Orbit", render: (m) => <Orbit m={m} /> },
  core: { label: "11 · Core", render: (m) => <Core m={m} /> },
  cinema: { label: "12 · Cinema", render: (m) => <Cinema m={m} /> },
  terrain: { label: "13 · Terrain", render: (m) => <Terrain m={m} /> },
  vault: { label: "14 · Vault", render: (m) => <Vault m={m} /> },
  grid: { label: "15 · Grid", render: (m) => <Grid m={m} /> },
  constellation: { label: "16 · Constellation", render: (m) => <Constellation m={m} /> },
  prospectus: { label: "17 · Prospectus", render: (m) => <Prospectus m={m} /> },
  signal: { label: "18 · Signal", render: (m) => <Signal m={m} /> },
  blueprint: { label: "19 · Blueprint", render: (m) => <Blueprint m={m} /> },
  archive: { label: "20 · Archive", render: (m) => <Archive m={m} /> },
  gallery: { label: "21 · Gallery", render: (m) => <Gallery m={m} /> },
  vein: { label: "22 · Vein", render: (m) => <Vein m={m} /> },
  chronicle: { label: "23 · Chronicle", render: (m) => <Chronicle m={m} /> },
  specimen: { label: "24 · Specimen", render: (m) => <Specimen m={m} /> },
  expedition: { label: "25 · Expedition", render: (m) => <Expedition m={m} /> },
};
export const TEMPLATE_LIST = Object.keys(TEMPLATES).map((k) => ({ key: k, label: TEMPLATES[k].label }));
