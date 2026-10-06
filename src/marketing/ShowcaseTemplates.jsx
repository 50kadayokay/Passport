// ShowcaseTemplates — a client-facing gallery of Conference Mode templates. Each card is a LIVE,
// scaled preview of that template rendered on a fully-populated demo company, with a global palette
// picker. This is the "menu" a MineEx operator shows a CEO. Previews use the same V3 renderer.
import React, { useState } from "react";
import { TEMPLATE_LIST, THEME_LIST } from "../aiBrief/conferenceV3/ConferenceV3.jsx";

const DEMO = "granitepeak-demo", TOKEN = "f93303de-0614-4ef1-814c-086ad229cf1a";
const DESC = {
  monolith: "Cinematic and full-bleed — one commanding image and statement per screen.",
  atlas: "Map-led — an interactive district map anchors the story in place.",
  ledger: "Data-forward editorial — serif headlines, generated charts, numbers as the hero.",
  strata: "A geologist's cross-section — drilling and grade rendered as the deposit itself.",
  keynote: "Apple-keynote drama — one idea, full screen, at a time.",
  terminal: "A live data desk — ticker tape, metrics and drill log for the quant investor.",
  dossier: "An editorial field report — long-form, considered, magazine-grade.",
  index: "Radical minimalism — the essential figures and nothing else.",
  pulse: "Ambient motion — a living aurora behind the headline.",
  orbit: "A rotating globe that marks your ground on the world stage.",
};

const CSS = `
.tshow{--bg:#0a0b0d;--ink:#efece4;--dim:#9a978f;--line:rgba(239,236,228,.12);--accent:#c9a86a;
  position:fixed;inset:0;overflow-y:auto;background:var(--bg);color:var(--ink);
  font-family:"Inter Tight",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
.tshow *{box-sizing:border-box}
.tshow .wrap{max-width:1280px;margin:0 auto;padding:0 clamp(20px,5vw,56px)}
.tshow .hero{padding:clamp(64px,12vh,120px) 0 40px;text-align:center}
.tshow .hero .ek{font-family:"IBM Plex Mono",monospace;font-size:12px;letter-spacing:.26em;text-transform:uppercase;color:var(--accent)}
.tshow .hero h1{font-size:clamp(40px,6vw,80px);font-weight:800;letter-spacing:-.035em;line-height:.98;margin:18px 0 0;text-wrap:balance}
.tshow .hero p{color:var(--dim);font-size:clamp(16px,1.9vw,21px);max-width:60ch;margin:20px auto 0;line-height:1.5}
.tshow .themebar{display:flex;gap:9px;justify-content:center;flex-wrap:wrap;margin:34px 0 8px;align-items:center}
.tshow .themebar .lab{font-family:"IBM Plex Mono",monospace;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim);margin-right:4px}
.tshow .sw{width:26px;height:26px;border-radius:50%;border:1.5px solid var(--line);cursor:pointer;padding:0;transition:transform .2s}
.tshow .sw:hover{transform:scale(1.14)}.tshow .sw[aria-pressed="true"]{border-color:#fff;box-shadow:0 0 0 3px rgba(255,255,255,.14)}
.tshow .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:24px;padding:36px 0 90px}
@media(max-width:820px){.tshow .grid{grid-template-columns:1fr}}
.tshow .card{border:1px solid var(--line);border-radius:18px;overflow:hidden;background:#000;transition:transform .25s,border-color .25s;text-decoration:none;color:inherit;display:block}
.tshow .card:hover{transform:translateY(-4px);border-color:rgba(239,236,228,.28)}
.tshow .frame{position:relative;aspect-ratio:16/10;overflow:hidden;background:#000;border-bottom:1px solid var(--line)}
.tshow .frame iframe{position:absolute;top:0;left:0;width:1280px;height:800px;border:0;transform-origin:top left;pointer-events:none}
.tshow .frame .num{position:absolute;top:14px;left:16px;z-index:2;font-family:"IBM Plex Mono",monospace;font-size:11px;letter-spacing:.14em;color:#fff;mix-blend-mode:difference}
.tshow .frame .open{position:absolute;right:14px;bottom:14px;z-index:2;font-family:"IBM Plex Mono",monospace;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:#000;background:#fff;border-radius:999px;padding:6px 12px;opacity:0;transition:opacity .25s}
.tshow .card:hover .open{opacity:1}
.tshow .meta{padding:20px 22px 22px}
.tshow .meta h3{font-size:20px;font-weight:800;letter-spacing:-.02em;margin:0}
.tshow .meta p{color:var(--dim);font-size:14px;line-height:1.5;margin:8px 0 0}
.tshow .foot{border-top:1px solid var(--line);padding:26px 0;text-align:center;font-family:"IBM Plex Mono",monospace;font-size:12px;color:#5f5d58;letter-spacing:.06em}
.tshow .foot b{color:var(--accent);font-family:"Inter Tight",sans-serif;font-weight:800}
`;

function Card({ t, theme }) {
  const src = `/confv3demo?c=${DEMO}&preview=${TOKEN}&t=${t.key}&theme=${theme}&bar=0`;
  // 1280px-wide render scaled to the card width (measured via CSS: the frame is fluid, so scale to
  // a nominal 620px column and let aspect-ratio crop). We scale by the card's rendered width.
  const ref = React.useRef(null);
  const [scale, setScale] = useState(0.48);
  React.useEffect(() => {
    const el = ref.current; if (!el) return;
    const set = () => setScale(el.clientWidth / 1280);
    set(); const ro = new ResizeObserver(set); ro.observe(el); return () => ro.disconnect();
  }, []);
  return (
    <a className="card" href={`/confv3demo?c=${DEMO}&preview=${TOKEN}&t=${t.key}&theme=${theme}`} target="_blank" rel="noreferrer">
      <div className="frame" ref={ref}>
        <span className="num">{t.label}</span>
        <span className="open">Open full ↗</span>
        <iframe title={t.label} src={src} loading="lazy" style={{ transform: `scale(${scale})` }} tabIndex={-1} />
      </div>
      <div className="meta"><h3>{t.label.replace(/^\d+\s*·\s*/, "")}</h3><p>{DESC[t.key] || ""}</p></div>
    </a>
  );
}

export default function ShowcaseTemplates() {
  const [theme, setTheme] = useState("obsidian");
  return (
    <><style>{CSS}</style>
      <div className="tshow">
        <div className="wrap">
          <div className="hero">
            <div className="ek">MineEx · Conference Mode</div>
            <h1>{TEMPLATE_LIST.length} designs.<br />Your data. One booth.</h1>
            <p>Every template is populated automatically from your company's MineEx profile, then swiped through on an iPad at your booth. Pick a look — and a palette.</p>
            <div className="themebar">
              <span className="lab">Palette</span>
              {THEME_LIST.map((t) => <button key={t.key} className="sw" aria-pressed={theme === t.key} title={t.label} onClick={() => setTheme(t.key)} style={{ background: t.dot }} />)}
            </div>
          </div>
          <div className="grid">{TEMPLATE_LIST.map((t) => <Card key={t.key} t={t} theme={theme} />)}</div>
          <div className="foot">Powered by <b>MineEx</b> · Conference Mode</div>
        </div>
      </div>
    </>
  );
}
