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
.cv3 .term{font-family:var(--mono)}
.cv3 .term .tape{border-bottom:1px solid var(--line);overflow:hidden;white-space:nowrap;padding:12px 0;margin-top:76px}
.cv3 .term .tape .run{display:inline-block;animation:cv3tape 34s linear infinite}
@keyframes cv3tape{from{transform:translateX(0)}to{transform:translateX(-50%)}}
.cv3 .term .tape span{font-size:12.5px;letter-spacing:.06em;color:var(--dim);padding:0 26px}
.cv3 .term .tape b{color:var(--accent);font-weight:600}
.cv3 .term-head{padding:clamp(40px,7vh,80px) 0 30px}
.cv3 .term-head .st{font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--accent)}
.cv3 .term-head h1{font-family:var(--font);font-size:clamp(38px,6vw,80px);font-weight:800;letter-spacing:-.03em;line-height:.98;margin:16px 0 0}
.cv3 .term-head h1 .cur{display:inline-block;width:.5em;height:.9em;background:var(--accent);margin-left:6px;vertical-align:-8%;animation:cv3blink 1.1s step-end infinite}
@keyframes cv3blink{50%{opacity:0}}
.cv3 .term-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);border:1px solid var(--line)}
.cv3 .term-grid .t{background:var(--bg);padding:22px 20px}
.cv3 .term-grid .t .tk{font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim)}
.cv3 .term-grid .t .tv{font-size:clamp(22px,3vw,36px);font-weight:600;letter-spacing:-.01em;margin-top:12px;color:var(--ink);font-variant-numeric:tabular-nums;font-family:var(--font)}
.cv3 .term-grid .t .td{font-size:11px;color:var(--faint);margin-top:8px}
.cv3 .term-log{margin-top:1px;border:1px solid var(--line);border-top:none}
.cv3 .term-log .lr{display:grid;grid-template-columns:130px 1fr auto;gap:16px;padding:13px 20px;border-top:1px solid var(--line);font-size:13px;align-items:center}
.cv3 .term-log .lr .c1{color:var(--dim)}.cv3 .term-log .lr .c3{color:var(--accent);font-weight:600;font-variant-numeric:tabular-nums}
.cv3 .term-log .lr.h{color:var(--faint);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;border-top:none}
@media(max-width:820px){.cv3 .term-grid{grid-template-columns:repeat(2,1fr)}}
.cv3 .term-sub{font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);padding:34px 0 12px}
.cv3 .term-tbl{width:100%;border-collapse:collapse;font-family:var(--mono);font-size:13px;border:1px solid var(--line)}
.cv3 .term-tbl th{text-align:left;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--faint);padding:10px 14px;font-weight:500;border-bottom:1px solid var(--line);background:var(--bg2)}
.cv3 .term-tbl td{padding:13px 14px;border-bottom:1px solid var(--line)}
.cv3 .term-tbl tr:last-child td{border-bottom:none}.cv3 .term-tbl td.nm{color:var(--ink);font-weight:600}.cv3 .term-tbl td.ac{color:var(--accent)}
.cv3 .term-read{border:1px solid var(--line);font-family:var(--mono)}
.cv3 .term-read .rr{display:flex;justify-content:space-between;gap:20px;padding:12px 16px;border-bottom:1px solid var(--line);font-size:13px}
.cv3 .term-read .rr:last-child{border-bottom:none}
.cv3 .term-read .rr .k{color:var(--dim);letter-spacing:.06em;text-transform:uppercase;font-size:11px;white-space:nowrap}
.cv3 .term-read .rr .v{color:var(--ink);font-weight:600;font-variant-numeric:tabular-nums;text-align:right}
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
/* Pulse */
.cv3 .pulse-hero{position:relative;min-height:100vh;display:grid;place-items:center;text-align:center;overflow:hidden}
.cv3 .pulse-hero canvas{position:absolute;inset:0;width:100%;height:100%}
.cv3 .pulse-hero .pc{position:relative;z-index:2;padding:0 20px}
.cv3 .pulse-hero .ek{font-family:var(--mono);font-size:12px;letter-spacing:.26em;text-transform:uppercase;color:var(--accent)}
.cv3 .pulse-hero h1{font-size:clamp(48px,11vw,160px);font-weight:800;letter-spacing:-.04em;line-height:.9;margin:22px 0 0;text-wrap:balance}
.cv3 .pulse-hero .lede{font-size:clamp(16px,1.8vw,21px);color:var(--dim);max-width:40ch;margin:22px auto 0;line-height:1.5}
.cv3 .pulse-hero .ticker{margin-top:28px}
/* Orbit */
.cv3 .orbit-hero{position:relative;min-height:100vh;display:grid;grid-template-columns:1fr 1fr;align-items:center;overflow:hidden}
.cv3 .orbit-stage{position:relative;min-height:100vh}
.cv3 .orbit-stage canvas{position:absolute;inset:0;width:100%;height:100%}
.cv3 .orbit-copy{padding:clamp(30px,6vw,90px)}
.cv3 .orbit-copy .ek{font-family:var(--mono);font-size:12px;letter-spacing:.24em;text-transform:uppercase;color:var(--accent)}
.cv3 .orbit-copy h1{font-size:clamp(44px,6vw,88px);line-height:.94;letter-spacing:-.035em;font-weight:800;margin:18px 0 0;text-wrap:balance}
.cv3 .orbit-copy .lede{font-size:clamp(16px,1.7vw,20px);color:var(--dim);max-width:34ch;margin:20px 0 0;line-height:1.5}
.cv3 .orbit-copy .ticker{margin-top:24px}
.cv3 .orbit-tag{position:absolute;left:50%;bottom:8%;transform:translateX(-50%);z-index:3;font-family:var(--mono);font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--dim)}
.cv3 .orbit-tag b{color:var(--accent)}
@media(max-width:900px){.cv3 .orbit-hero{grid-template-columns:1fr}.cv3 .orbit-stage{min-height:60vh}}
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
.cv3 .dz{background:var(--bg)}
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
/* ══ 10 · ORBIT (V4 body) — orbital passes: content arcs in around the axis with ring motifs ══ */
.cv3 .orb-pass{min-height:84vh;display:flex;align-items:center;padding:clamp(40px,7vh,90px) clamp(24px,7vw,120px);position:relative;overflow:hidden;border-top:1px solid var(--line2)}
.cv3 .orb-ring{position:absolute;border:1px solid color-mix(in srgb,var(--accent) 28%,var(--line));border-radius:50%;pointer-events:none;z-index:0}
.cv3 .orb-ring::after{content:"";position:absolute;inset:-1px;border-radius:50%;border:1px solid transparent;border-top-color:color-mix(in srgb,var(--accent) 55%,transparent)}
.cv3 .orb-pass .oc{position:relative;z-index:2;max-width:44ch;opacity:0;transform:translateX(-46px);transition:opacity .9s ease,transform .9s cubic-bezier(.22,1,.36,1)}
.cv3 .orb-pass.on .oc{opacity:1;transform:none}
.cv3 .orb-pass.right{justify-content:flex-end;text-align:right}
.cv3 .orb-pass.right .oc{margin-left:auto;transform:translateX(46px)}
.cv3 .orb-pass.right.on .oc{transform:none}
.cv3 .orb-k{font-family:var(--mono);font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--accent)}
.cv3 .orb-h{font-size:clamp(32px,5vw,74px);font-weight:800;letter-spacing:-.035em;line-height:.96;margin:14px 0 0;text-wrap:balance}
.cv3 .orb-h .unit{font-size:.3em;color:var(--dim);font-weight:700}
.cv3 .orb-p{font-size:clamp(16px,1.8vw,20px);color:var(--dim);line-height:1.5;margin:18px 0 0}
.cv3 .orb-list{margin-top:22px;display:flex;flex-direction:column;gap:13px}
.cv3 .orb-list .oi{font-size:clamp(17px,2vw,24px);font-weight:700;letter-spacing:-.01em}
.cv3 .orb-list .oi .d{font-family:var(--mono);font-size:12px;color:var(--accent);font-weight:500;margin-right:12px}
.cv3 .orb-list .oi small{font-family:var(--mono);font-size:11px;font-weight:400;color:var(--dim);letter-spacing:.04em}
/* ══ 05 · KEYNOTE (V4) — world-class product presentation: horizontal stages · clean · diagrams assemble ══ */
.cv3:has(.kys){overflow:hidden}
.cv3 .kys{height:100vh;display:flex;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch}
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
.cv3 .kys-nav i{width:7px;height:7px;border-radius:50%;background:var(--line);transition:.3s}
.cv3 .kys-nav i.on{background:var(--accent);width:20px;border-radius:4px}
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

  const chooseTheme = (v) => { setTheme(v); setAccent(""); };
  const accentStyle = accent ? { "--accent": accent, "--accent2": lighten(accent, .34) } : {};

  return (
    <>
      <style>{CSS}</style>
      <div className="cv3" data-variant={theme} style={accentStyle} ref={rootRef}>
        {showBar && (() => {
          const keys = Object.keys(TEMPLATES); const ci = Math.max(0, keys.indexOf(tpl));
          const go = (d) => { setTpl(keys[(ci + d + keys.length) % keys.length]); setMenu(false); };
          return (
            <div className="cv3bar">
              <button className="navb" onClick={() => go(-1)} aria-label="Previous template">‹</button>
              <div className="tplsel">
                <button className="tplcur" onClick={() => setMenu((v) => !v)} aria-expanded={menu}>{(TEMPLATES[tpl] || {}).label || tpl}<span className="cx">▾</span></button>
                {menu && <>
                  <div className="tplback" onClick={() => setMenu(false)} />
                  <div className="tplmenu">{keys.map((k) => (
                    <button key={k} className={"tplitem" + (k === tpl ? " on" : "")} onClick={() => { setTpl(k); setMenu(false); }}>{TEMPLATES[k].label}</button>
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

// MONOLITH (V4) — brutalist monumentality. ONE dominant object per full screen, photography as ground,
// a slow procession of singular statements. No cards, no tables, no ticker chrome, no stat grids.
function Monolith({ m }) {
  const imgs = [m.images.field, m.images.camp, m.images.hero].filter(Boolean);
  const mktcap = (m.capital.find((c) => /market cap/i.test(c[0])) || [])[1];
  const best = (m.flagship.drills || []).slice().sort((a, b) => _gnum(b.grade) - _gnum(a.grade))[0];
  const c0 = m.catalysts[0];
  return (
    <>
      <div className="mn-scene" style={{ justifyContent: "flex-end" }}>
        <div className="mn-photo">{m.images.hero ? <img src={m.images.hero} alt="" /> : null}</div>
        <div className="mn-in">
          {m.tickerLine && <span className="ticker rise" style={{ transitionDelay: ".1s" }}><span className="dot" />{m.tickerLine}</span>}
          <div className="mn-name rise blur" style={{ transitionDelay: ".2s", display: "block" }}>{m.name}</div>
          {m.tagline && <div className="mn-cap rise" style={{ transitionDelay: ".5s" }}>{m.tagline}</div>}
        </div>
      </div>

      {m.thesis && <div className="mn-scene center"><div className="mn-in"><div className="mn-k rise">The opportunity</div><div className="mn-stmt rise scale" style={{ margin: "22px auto 0" }}>{m.thesis}</div></div></div>}

      {m.heroStat && <div className="mn-scene center"><div className="mn-in">
        <div className="mn-huge rise blur">{splitStat(m.heroStat.value)}</div>
        <div className="mn-cap dk rise" style={{ transitionDelay: ".2s" }}>{m.heroStat.label}{m.heroStat.context ? " · " + m.heroStat.context : ""}</div></div></div>}

      {best && <div className="mn-scene" style={{ justifyContent: "flex-end" }}>
        <div className="mn-photo">{imgs[0] ? <img src={imgs[0]} alt="" /> : null}</div>
        <div className="mn-in"><div className="mn-k rise">Flagship · {m.flagship.name || "the evidence"}</div>
          <div className="mn-grade rise scale" style={{ marginTop: 14 }}>{best.grade}</div>
          <div className="mn-cap rise">Best intercept · {best.hole}{best.interval ? " · over " + best.interval : ""}</div></div></div>}

      {m.projects.map((p, i) => (
        <div className="mn-scene" style={{ justifyContent: "flex-end" }} key={i}>
          <div className="mn-photo">{imgs.length ? <img src={imgs[i % imgs.length]} alt="" /> : null}</div>
          <div className="mn-in"><div className="mn-k rise">{p.stage || "Project"}{p.location ? " · " + p.location : ""}</div>
            <div className="mn-name rise blur" style={{ display: "block", marginTop: 12 }}>{p.name}</div>
            <div className="mn-cap rise">{[p.commodity, p.ownership && p.ownership + " owned"].filter(Boolean).join(" · ")}</div></div></div>
      ))}

      {mktcap && <div className="mn-scene center"><div className="mn-in"><div className="mn-k rise">Market capitalisation</div><div className="mn-huge rise blur" style={{ color: "var(--accent)" }}>{mktcap}</div></div></div>}

      {c0 && <div className="mn-scene center"><div className="mn-in"><div className="mn-k rise">What happens next{c0.timing ? " · " + c0.timing : ""}</div><div className="mn-stmt rise scale" style={{ margin: "22px auto 0" }}>{c0.label}</div></div></div>}

      {m.why.length > 0 && <div className="mn-scene"><div className="mn-in"><div className="mn-k rise" style={{ marginBottom: 30 }}>Why invest</div>
        <div className="mn-list">{m.why.map((w, i) => <div className="li rise up" key={i} style={{ transitionDelay: (i * 0.08) + "s" }}>{w}</div>)}</div></div></div>}

      {m.team.length > 0 && <div className="mn-scene"><div className="mn-in"><div className="mn-k rise" style={{ marginBottom: 30 }}>Leadership</div>
        <div className="mn-list">{m.team.slice(0, 6).map((p, i) => <div className="li rise up" key={i} style={{ transitionDelay: (i * 0.06) + "s" }}>{p.name} <span style={{ fontSize: ".42em", color: "var(--dim)", fontWeight: 600 }}>{p.role}</span></div>)}</div></div></div>}

      <div className="mn-scene center"><div className="mn-in"><div className="mn-name rise blur" style={{ display: "block" }}>Follow {m.shortName}.</div><div className="mn-cap dk rise" style={{ transitionDelay: ".2s" }}>Every update, on MineEx</div></div></div>
    </>
  );
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
function Atlas({ m }) {
  const mapRef = useRef(null);
  useEffect(() => { buildAtlasMap(mapRef.current, m); }, [m]);
  return (
    <>
      <header className="atlas-hero">
        <div className="atlas-map" ref={mapRef} />
        <div className="atlas-copy">
          <div className="ek rise" style={{ transitionDelay: ".9s" }}>{m.geo.place || m.flagship.name || "Jurisdiction"}</div>
          <h1 className="rise" style={{ transitionDelay: "1.02s" }}>{m.flagship.name ? <>The {m.flagship.name}.</> : "The map is the thesis."}</h1>
          {(m.thesis || m.heroStat) && <p className="lede rise" style={{ transitionDelay: "1.16s" }}>{m.thesis || (m.heroStat.value + " — " + m.heroStat.label + ".")}</p>}
          {m.tickerLine && <span className="ticker rise" style={{ transitionDelay: "1.3s" }}><span className="dot" />{m.tickerLine}</span>}
        </div>
      </header>
      <HeroStat m={m} /><AtlasBodyV4 m={m} /><FollowBlock m={m} />
    </>
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
function Strata({ m }) {
  const ref = useRef(null);
  useEffect(() => { buildXsec(ref.current, m); }, [m]);
  return (
    <>
      <section className="strata-top"><div className="wrap">
        <div className="ek rise">{m.flagship.name || "Deposit"} · Cross-section</div>
        <h1 className="rise">A section<br />through the ore.</h1>
        <p className="lede rise">Each hole below plots its real intercept, coloured by grade — a schematic section, not to scale.</p>
        <div className="xsec rise" ref={ref} />
        <div className="strata-legend rise">
          <span><span className="gr" style={{ background: "color-mix(in srgb,var(--accent) 30%,transparent)" }} />lower grade</span>
          <span><span className="gr" style={{ background: "var(--accent)" }} />higher grade</span>
          {m.flagship.drills.length ? <span>{m.flagship.drills.length} holes · hover for assays</span> : null}
        </div>
      </div></section>
      <HeroStat m={m} /><StrataBody m={m} /><FollowBlock m={m} />
    </>
  );
}

// ── Template 05 · KEYNOTE — one idea per full-screen scene ──
// KEYNOTE (V4) — a world-class product presentation. HORIZONTAL swipe stages, one idea per stage,
// immaculate backgrounds, staged stat reveals and diagrams that assemble piece by piece. No cards,
// tables, prose, photos or ambient noise. Wow: (1) the opening statement, (2) the evidence diagram
// assembles from real grades, (3) the closing capital diagram builds.
function Keynote({ m }) {
  const scRef = useRef(null); const [idx, setIdx] = useState(0);
  const grades = (m.flagship.drills || []).slice(0, 5).map((d) => ({ v: _gnum(d.grade), g: d.grade, h: (d.hole || "").split("-").pop() })).filter((x) => x.v > 0);
  const gmax = Math.max(1, ...grades.map((x) => x.v));
  const capBars = m.capital.filter(([k]) => /shares outstanding|fully diluted|options|warrants/i.test(k)).map(([k, v]) => ({ k: k.replace(/ outstanding/i, ""), v, n: _pnum(v) })).filter((x) => isFinite(x.n));
  const cmax = Math.max(1, ...capBars.map((x) => x.n));
  useEffect(() => {
    const sc = scRef.current; if (!sc) return;
    const stages = [...sc.querySelectorAll(".kys-stage")];
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("on"); const i = +e.target.dataset.i; if (!isNaN(i)) setIdx(i); } }), { root: sc, threshold: 0.5 });
    stages.forEach((s) => io.observe(s)); requestAnimationFrame(() => stages[0] && stages[0].classList.add("on"));
    const onWheel = (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { sc.scrollLeft += e.deltaY; e.preventDefault(); } };
    sc.addEventListener("wheel", onWheel, { passive: false });
    return () => { io.disconnect(); sc.removeEventListener("wheel", onWheel); };
  }, [m]);
  const S = [];
  S.push(<><div className="kys-k">{m.tickerLine || "MineEx"}</div><h1 className="kys-h">{m.name.replace(/\.$/, "")}.</h1>{m.tagline && <div className="kys-sub">{m.tagline}</div>}</>);
  if (m.thesis) S.push(<><div className="kys-k">The opportunity</div><h1 className="kys-h" style={{ fontSize: "clamp(30px,4.6vw,68px)" }}>{m.thesis}</h1></>);
  if (m.heroStat) S.push(<><div className="kys-k">{m.heroStat.label}</div><h1 className="kys-h">{splitStat(m.heroStat.value)}</h1>{m.heroStat.context && <div className="kys-sub">{m.heroStat.context}</div>}</>);
  if (grades.length) S.push(<><div className="kys-k">Drill evidence · g/t Au</div><h1 className="kys-h" style={{ fontSize: "clamp(26px,3.4vw,48px)" }}>{m.flagship.name || "The intercepts"}</h1>
    <div className="kys-diag">{grades.map((x, i) => <div className="db" key={i}><div className="v">{x.v}</div><i style={{ "--h": Math.max(6, x.v / gmax * 100) + "%", transitionDelay: (0.3 + i * 0.1) + "s" }} /><div className="l">{x.h}</div></div>)}</div></>);
  m.projects.forEach((p) => S.push(<><div className="kys-k">{p.stage || "Project"}</div><h1 className="kys-h">{p.name}</h1>
    <div className="kys-facts">{[[p.commodity, "Commodity"], [p.ownership, "Ownership"], [p.location, "Location"]].filter((f) => f[0]).map((f, i) => <div className="f" key={i} style={{ transitionDelay: (0.2 + i * 0.12) + "s" }}><div className="fv" style={{ fontSize: "clamp(18px,2vw,28px)" }}>{f[0]}</div><div className="fl">{f[1]}</div></div>)}</div></>));
  if (capBars.length) S.push(<><div className="kys-k">Capital structure · millions</div><h1 className="kys-h" style={{ fontSize: "clamp(26px,3.4vw,48px)" }}>Share structure</h1>
    <div className="kys-diag">{capBars.map((x, i) => <div className="db" key={i}><div className="v">{x.v}</div><i style={{ "--h": Math.max(8, x.n / cmax * 100) + "%", transitionDelay: (0.3 + i * 0.1) + "s" }} /><div className="l">{x.k}</div></div>)}</div></>);
  if (m.catalysts[0]) S.push(<><div className="kys-k">What happens next{m.catalysts[0].timing ? " · " + m.catalysts[0].timing : ""}</div><h1 className="kys-h">{m.catalysts[0].label}.</h1></>);
  if (m.team.length) S.push(<><div className="kys-k">Leadership</div><div className="kys-facts" style={{ marginTop: 0 }}>{m.team.slice(0, 4).map((p, i) => <div className="f" key={i} style={{ transitionDelay: (0.15 + i * 0.1) + "s" }}><div className="fv" style={{ fontSize: "clamp(20px,2.2vw,30px)" }}>{p.name}</div><div className="fl">{p.role}</div></div>)}</div></>);
  S.push(<><div className="kys-k">Continue</div><h1 className="kys-h">Follow {m.shortName}.</h1><div className="kys-sub">On MineEx · {m.tickerLine}</div></>);
  return (
    <>
      <div className="kys" ref={scRef}>{S.map((s, i) => <div className="kys-stage" data-i={i} key={i}>{s}</div>)}</div>
      <div className="kys-nav">{S.map((_, i) => <i className={idx === i ? "on" : ""} key={i} />)}</div>
      <div className="kys-hint">Swipe →</div>
    </>
  );
}

// ── Template 06 · TERMINAL — quant data desk ──
function Terminal({ m }) {
  const tapeRef = useRef(null);
  useEffect(() => {
    const el = tapeRef.current; if (!el) return;
    const items = [];
    if (m.tickers[0]) items.push(esc(m.tickers[0]));
    if (m.heroStat) items.push("M&I <b>" + esc(m.heroStat.value) + "</b>");
    m.highlights.slice(1, 3).forEach((h) => items.push(esc(h.label) + " <b>" + esc(h.value) + "</b>"));
    if (m.geo.place) items.push("<b>" + esc(m.geo.place).toUpperCase() + "</b>");
    m.flagship.drills.slice(0, 3).forEach((d) => items.push(esc(d.hole) + " <b>" + esc(d.grade) + "</b>"));
    if (!items.length) items.push(esc(m.name));
    const one = items.map((t) => "<span>" + t + "</span>").join("");
    el.innerHTML = one + one;
  }, [m]);
  const tiles = [];
  if (m.heroStat) tiles.push([m.heroStat.label, m.heroStat.value, m.heroStat.context]);
  m.highlights.slice(1, 3).forEach((h) => tiles.push([h.label, h.value, h.context]));
  if (m.geo.place) tiles.push(["Jurisdiction", m.geo.region || m.geo.place, m.geo.country]);
  if (m.commodity) tiles.push(["Commodity", m.commodity, ""]);
  if (m.tickers[0]) tiles.push(["Listing", m.tickers[0], m.tickers[1] || ""]);
  return (
    <div className="term">
      <div className="wrap"><div className="tape"><div className="run" ref={tapeRef} /></div></div>
      <section className="term-head"><div className="wrap"><div className="st rise">{m.name} · exploration desk</div><h1 className="rise wipe">{m.heroStat ? m.heroStat.value : m.name}.<span className="cur" /></h1></div></section>
      <section style={{ paddingTop: 0 }}><div className="wrap">
        <div className="term-grid rise">{tiles.slice(0, 8).map((t, i) => <div className="t" key={i}><div className="tk">{t[0]}</div><div className="tv">{t[1]}</div>{t[2] && <div className="td">{t[2]}</div>}</div>)}</div>
        {m.flagship.drills.length > 0 && <div className="term-log rise"><div className="lr h"><span>Hole</span><span>Interval</span><span>Grade</span></div>{m.flagship.drills.slice(0, 6).map((d, i) => <div className="lr" key={i}><span className="c1">{d.hole}</span><span>{d.interval || "—"}</span><span className="c3">{d.grade}</span></div>)}</div>}
      </div></section>
      {m.projects.length > 0 && <div className="wrap" style={{ paddingBottom: "clamp(20px,4vh,44px)" }}><div className="term-sub">Portfolio · {m.projects.length} projects</div>
        <table className="term-tbl"><thead><tr><th>Project</th><th>Location</th><th>Commodity</th><th>Own</th><th>Stage</th></tr></thead>
          <tbody>{m.projects.map((p, i) => <tr key={i}><td className="nm">{p.name}</td><td>{p.location || "—"}</td><td>{p.commodity || "—"}</td><td className="ac">{p.ownership || "—"}</td><td>{p.stage || "—"}</td></tr>)}</tbody></table></div>}
      {m.capital.length > 0 && <div className="wrap" style={{ paddingBottom: "clamp(20px,4vh,44px)" }}><div className="term-sub">Capital structure</div>
        <div className="term-read">{m.capital.map(([k, v], i) => <div className="rr" key={i}><span className="k">{k}</span><span className="v">{v}</span></div>)}</div></div>}
      {m.catalysts[0] && <div className="wrap" style={{ paddingBottom: "clamp(20px,4vh,44px)" }}><div className="term-sub">Next catalyst</div>
        <div className="term-read"><div className="rr"><span className="k">{m.catalysts[0].timing || "Upcoming"}</span><span className="v">{m.catalysts[0].label}</span></div>{m.catalysts[0].impact && <div className="rr"><span className="k">Impact</span><span className="v" style={{ fontWeight: 400, color: "var(--dim)", textTransform: "none" }}>{m.catalysts[0].impact}</span></div>}</div></div>}
      {m.timeline.length > 0 && <div className="wrap" style={{ paddingBottom: "clamp(20px,4vh,44px)" }}><div className="term-sub">Event log</div>
        <div className="term-log">{m.timeline.map((t, i) => <div className="lr" key={i}><span className="c1">{(t.date || "").slice(0, 10)}</span><span>{t.headline}</span><span className="c3" /></div>)}</div></div>}
      {m.team.length > 0 && <div className="wrap" style={{ paddingBottom: "clamp(24px,5vh,56px)" }}><div className="term-sub">Leadership · {m.team.length}</div>
        <div className="term-read">{m.team.slice(0, 10).map((p, i) => <div className="rr" key={i}><span className="v" style={{ textAlign: "left" }}>{p.name}</span><span className="k" style={{ textTransform: "none" }}>{p.role}</span></div>)}</div></div>}
      <FollowBlock m={m} />
    </div>
  );
}

// ── Template 07 · DOSSIER — editorial field report ──
// DOSSIER — a premium investigative mining feature. Field photography, feature pacing, pull quotes
// (drawn ONLY from real supplied text), sidebars, evidence inserts, a map clipped into the story, and
// leadership presented as feature subjects. Human and journalistic — never a document, table or dashboard.
const _ROMAN = ["I", "II", "III", "IV", "V", "VI"];
function Dossier({ m }) {
  const pull = m.why[0] || m.flagship.sub || m.thesis;
  const bodyParas = [m.flagship.sub, m.why[1], m.why[2]].filter((x) => x && x !== pull);
  const drills = (m.flagship.drills || []).slice(0, 4);
  const sideNums = [
    m.heroStat && [m.heroStat.label, m.heroStat.value],
    m.commodity && ["Commodity", m.commodity],
    (m.geo.region || m.geo.place) && ["Jurisdiction", m.geo.region || m.geo.place],
    m.capital.find((c) => /market cap/i.test(c[0])),
    m.capital.find((c) => /cash/i.test(c[0])),
  ].filter(Boolean);
  const hasGeo = m.geo.lat != null && m.geo.lng != null;
  return (
    <div className="dz">
      <div className="dz-open">
        {m.images.hero ? <img src={m.images.hero} alt="" /> : <div className="ph" />}<div className="sc" />
        <div className="oin">
          <div className="kx rise">MineEx Field Report{m.geo.place ? " · " + m.geo.place : ""}</div>
          <h1 className="rise" style={{ transitionDelay: ".1s" }}>{m.tagline || (m.flagship.name ? "Inside " + m.flagship.name : m.shortName)}</h1>
          <div className="byl rise" style={{ transitionDelay: ".2s" }}>An investigation into {m.shortName}{m.commodity ? " · " + m.commodity : ""}</div>
        </div>
      </div>

      <div className="dz-body">
        {m.thesis && <p className="dz-lede rise">{m.thesis}</p>}
        <div className="dz-grid">
          <div className="dz-col">
            {bodyParas[0] && <p className="rise">{bodyParas[0]}</p>}
            {pull && <div className="dz-pull rise">“{pull}”</div>}
            {bodyParas[1] && <p className="rise">{bodyParas[1]}</p>}

            {drills.length > 0 && (
              <div className="dz-insert rise">
                <div className="it">From the core · {m.flagship.name || "flagship"}</div>
                {drills.map((d, i) => <div className="ir" key={i}><span className="h">{d.hole || "—"}</span><span>{d.interval || ""}</span><span className="g">{d.grade || "—"}</span></div>)}
              </div>
            )}

            {m.images.field && <figure className="dz-fig rise"><img src={m.images.field} alt="" /><figcaption><b>Fig. 1</b> {m.flagship.name || m.shortName}, {m.geo.place || "in the field"}.</figcaption></figure>}

            {bodyParas[2] && <p className="rise">{bodyParas[2]}</p>}

            {hasGeo && (
              <div className="dz-map rise">
                <svg viewBox="0 0 600 260" preserveAspectRatio="xMidYMid slice">
                  <rect className="m-bg" x="0" y="0" width="600" height="260" />
                  <g className="m-grid" strokeWidth="1" fill="none">{[52, 104, 156, 208].map((y) => <path key={y} d={`M0 ${y}H600`} />)}{[100, 200, 300, 400, 500].map((x) => <path key={x} d={`M${x} 0V260`} />)}</g>
                  <circle className="m-acc" cx="300" cy="130" r="7" /><circle className="m-accs" cx="300" cy="130" r="18" fill="none" strokeWidth="1.5" strokeOpacity=".6" />
                  <text className="m-dim" x="318" y="126" fontSize="13" letterSpacing="1">{(m.geo.region || m.geo.place || "").toUpperCase()}</text>
                  <text className="m-dim" x="318" y="144" fontSize="11">{m.geo.lat.toFixed(2)}°, {m.geo.lng.toFixed(2)}°</text>
                </svg>
                <div className="mc"><span>Approx. location · disclosed jurisdiction</span><b>{[m.geo.region, m.geo.country].filter(Boolean).join(", ")}</b></div>
              </div>
            )}
          </div>

          <aside className="dz-aside">
            {sideNums.length > 0 && <div className="dz-side rise"><div className="st">By the numbers</div>
              {sideNums.map((r, i) => <div className="sr" key={i}><span className="k">{r[0]}</span><span className="v">{r[1]}</span></div>)}</div>}
            {m.catalysts[0] && <div className="dz-side rise"><div className="st">What to watch</div>
              <div className="sr" style={{ borderBottom: "none", display: "block" }}><span className="k">{m.catalysts[0].timing || "Upcoming"}</span><div className="v" style={{ textAlign: "left", marginTop: 6, fontSize: 15, lineHeight: 1.35 }}>{m.catalysts[0].label}</div></div></div>}
          </aside>
        </div>

        {/* Projects as investigative chapters */}
        {m.projects.map((p, i) => (
          <div className="dz-chap rise" key={i}>
            <div className="rn">{_ROMAN[i] || i + 1}</div>
            <div>
              <h3>{p.name}</h3>
              <div className="pm">{[p.stage, p.commodity, p.location, p.ownership && p.ownership + " owned"].filter(Boolean).join("  ·  ")}</div>
              {p.overview && <p>{p.overview}</p>}
              {i === 1 && m.images.camp && <figure className="cfig"><img src={m.images.camp} alt="" /></figure>}
            </div>
          </div>
        ))}

        {/* Leadership as feature subjects */}
        {m.team.length > 0 && (
          <div style={{ marginTop: "clamp(44px,6vh,72px)" }}>
            <div className="dz-chap" style={{ borderTop: "1px solid var(--ink)", paddingTop: 26 }}><div className="rn" style={{ fontSize: "clamp(28px,4vw,56px)" }}>·</div><div><h3>The people behind it</h3></div></div>
            {m.team.slice(0, 5).map((p, i) => (
              <div className="dz-subj rise" key={i}>
                <div className="av">{(p.name || "").split(/\s+/).map((w) => w[0]).slice(0, 2).join("")}</div>
                <div><div className="sq">{p.name}</div><div className="sn"><b>{p.role || "Leadership"}</b>{i === 0 ? " · leading " + m.shortName : ""}</div></div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="dz-end"><div className="m rise">The story continues.</div><div className="c">Follow {m.shortName} on MineEx</div></div>
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

// ── Template 09 · PULSE — ambient aurora motion ──
function Pulse({ m }) {
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
      <HeroStat m={m} /><PulseBody m={m} /><FollowBlock m={m} />
    </>
  );
}

// ── Template 10 · ORBIT — rotating dotted globe, marking the real jurisdiction ──
function Orbit({ m }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return; const ctx = cv.getContext("2d"); let raf, rot = 0;
    const reduce = matchMedia("(prefers-reduced-motion:reduce)").matches;
    const pts = []; for (let la = -80; la <= 80; la += 9) { const rr = Math.cos(la * Math.PI / 180), n = Math.round(30 * rr) + 5; for (let k = 0; k < n; k++) pts.push([la, k / n * 360]); }
    sizeCanvasEl(cv); requestAnimationFrame(() => requestAnimationFrame(() => sizeCanvasEl(cv))); const onR = () => sizeCanvasEl(cv); window.addEventListener("resize", onR);
    const rv = (n) => getComputedStyle(cv).getPropertyValue(n).trim();
    const hasMark = m.geo.lat != null && m.geo.lng != null;
    const draw = () => {
      const w = cv.width, h = cv.height; ctx.clearRect(0, 0, w, h); if (!reduce) rot += 0.0022;
      const R = Math.min(w, h) * 0.4, cx = w / 2, cy = h / 2, ink = rv("--ink") || "#eee", acc = rv("--accent") || "#c9a86a", dpr = Math.min(2, window.devicePixelRatio || 1);
      const proj = (la, lo) => { la *= Math.PI / 180; lo = (lo + rot * 57.2958) * Math.PI / 180; return [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)]; };
      pts.forEach((p) => { const v = proj(p[0], p[1]); const sx = cx + v[0] * R, sy = cy - v[1] * R, a = v[2] > 0 ? (0.1 + v[2] * 0.5) : 0.05; ctx.beginPath(); ctx.fillStyle = cvHexA(ink, a); ctx.arc(sx, sy, (v[2] > 0 ? 1.5 : 1.1) * dpr, 0, 7); ctx.fill(); });
      if (hasMark) { const v = proj(m.geo.lat, m.geo.lng), mx = cx + v[0] * R, my = cy - v[1] * R; if (v[2] > 0) { ctx.beginPath(); ctx.fillStyle = acc; ctx.arc(mx, my, 4 * dpr, 0, 7); ctx.fill(); const pr = reduce ? 0.5 : (0.5 + 0.5 * Math.sin(Date.now() / 500)); ctx.beginPath(); ctx.strokeStyle = cvHexA(acc, 0.6 - pr * 0.4); ctx.lineWidth = 1.5 * dpr; ctx.arc(mx, my, (6 + pr * 10) * dpr, 0, 7); ctx.stroke(); } }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onR); };
  }, [m]);
  return (
    <>
      <header className="orbit-hero">
        <div className="orbit-stage"><canvas ref={ref} />{m.geo.place && <div className="orbit-tag">{m.flagship.name ? m.flagship.name + " · " : ""}<b>{m.geo.place}</b></div>}</div>
        <div className="orbit-copy">
          <div className="ek rise" style={{ transitionDelay: ".2s" }}>{m.geo.place || "Jurisdiction"}</div>
          <h1 className="rise blur" style={{ transitionDelay: ".32s" }}>{m.geo.region ? <>Anchored in<br />{m.geo.region}.</> : m.name}</h1>
          {m.thesis && <p className="lede rise" style={{ transitionDelay: ".5s" }}>{m.thesis}</p>}
          {m.tickerLine && <span className="ticker rise" style={{ transitionDelay: ".62s" }}><span className="dot" />{m.tickerLine}</span>}
        </div>
      </header>
      <OrbitBodyV4 m={m} /><FollowBlock m={m} />
    </>
  );
}
// Orbit's V4 body — orbital passes: content arcs in around the axis, framed by concentric ring motifs.
function OrbitBodyV4({ m }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) e.target.classList.add("on"); }), { threshold: 0.35 });
    el.querySelectorAll(".orb-pass").forEach((p) => io.observe(p));
    return () => io.disconnect();
  }, [m]);
  const R = (w, pos) => <div className="orb-ring" style={{ width: w, height: w, ...pos }} />;
  return (
    <div ref={ref}>
      {m.projects.length > 0 && <div className="orb-pass">{R("128vh", { right: "-34vh", top: "-20vh" })}<div className="oc"><div className="orb-k">Portfolio · {m.projects.length}</div>
        <div className="orb-list">{m.projects.map((p, i) => <div className="oi" key={i}>{p.name} <small>{[p.stage, p.commodity, p.location].filter(Boolean).join(" · ")}</small></div>)}</div></div></div>}
      {m.capital.length > 0 && <div className="orb-pass right">{R("104vh", { left: "-30vh", bottom: "-28vh" })}<div className="oc"><div className="orb-k">Capital</div>
        <div className="orb-list">{m.capital.map(([k, v], i) => <div className="oi" key={i}>{v} <small>{k}</small></div>)}</div></div></div>}
      {m.catalysts[0] && <div className="orb-pass">{R("88vh", { right: "-18vh", top: "6vh" })}<div className="oc"><div className="orb-k">Next catalyst{m.catalysts[0].timing ? " · " + m.catalysts[0].timing : ""}</div>
        <div className="orb-h">{m.catalysts[0].label}</div>{m.catalysts[0].impact && <div className="orb-p">{m.catalysts[0].impact}</div>}</div></div>}
      {m.timeline.length > 0 && <div className="orb-pass right">{R("112vh", { left: "-32vh", top: "-24vh" })}<div className="oc"><div className="orb-k">Milestones</div>
        <div className="orb-list">{m.timeline.slice(0, 6).map((t, i) => <div className="oi" key={i}><span className="d">{(t.date || "").slice(0, 10)}</span>{t.headline}</div>)}</div></div></div>}
      {m.team.length > 0 && <div className="orb-pass">{R("96vh", { right: "-26vh", bottom: "-30vh" })}<div className="oc"><div className="orb-k">Leadership · {m.team.length}</div>
        <div className="orb-list">{m.team.slice(0, 8).map((p, i) => <div className="oi" key={i}>{p.name} <small>{p.role}</small></div>)}</div></div></div>}
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
