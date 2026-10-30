// The bespoke renderer. Plain Node, no framework, no MineEx code imported.
//
// THIS IS THE POINT OF THE DEMO. The site shares nothing with MineEx except the
// shape of the JSON it receives. No React, no Vite, no shared component
// library, no hosting assumption. Another site could be Next.js, Astro, Hugo or
// hand-written PHP and the contract would not change.
//
// It renders: canonical content it does not own (company, projects, releases)
// and site content it does (headings, bands, framing). The two arrive in one
// payload and are kept apart in it.

const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* Richtext arrives as a restricted subset. Escape first, then allow back only
   the marks the manifest permits — the same discipline as the portal. */
const rich = (s) => esc(s)
  .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  .replace(/\*([^*\n]+)\*/g, "<em>$1</em>");

const TONE = { ochre: "#C98B3A", rust: "#A2502E", slate: "#5C6672", gold: "#D8B34A" };

const fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
};

/** Pull one section's values by type. Missing sections render their defaults. */
const sectionOf = (site, type) => {
  const entry = Object.values(site?.sections || {}).find((s) => s && s.type === type);
  return (entry && entry.values) || {};
};

export function render(payload) {
  const { company = {}, content = {}, site = {}, mode } = payload || {};
  const profile = content.profile || {};
  const pp = profile.pp || {};
  const projects = Array.isArray(profile.projects) ? profile.projects : [];
  const posts = Array.isArray(content.posts) ? content.posts : [];

  const hero = sectionOf(site, "hero");
  const strata = sectionOf(site, "strata");
  const projSec = sectionOf(site, "projects");
  const news = sectionOf(site, "news");

  const bands = Array.isArray(strata.bands) ? strata.bands : [];
  const limit = Number(news.limit) > 0 ? Number(news.limit) : 4;

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(company.name || "Company")}</title>
<style>
  /* Entirely this site's own. MineEx has no say in any of it. */
  :root{--ink:#14110E;--paper:#F4F1EA;--rule:#D9D2C4;--accent:#A2502E}
  *{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--ink);
       font-family:"Iowan Old Style",Georgia,"Times New Roman",serif;line-height:1.5}
  .wrap{max-width:1080px;margin:0 auto;padding:0 32px}
  header.top{display:flex;align-items:baseline;gap:18px;padding:28px 0;border-bottom:1px solid var(--rule)}
  header.top .mark{font-size:13px;letter-spacing:.34em;text-transform:uppercase;font-weight:700}
  header.top .tick{margin-left:auto;font-size:12px;letter-spacing:.18em;color:#6B6358}
  .hero{padding:92px 0 80px;border-bottom:1px solid var(--rule)}
  .kicker{font-size:12px;letter-spacing:.3em;text-transform:uppercase;color:var(--accent);font-family:ui-sans-serif,system-ui,sans-serif;font-weight:700}
  h1{font-size:clamp(42px,7vw,86px);line-height:.98;letter-spacing:-.025em;margin:20px 0 0;font-weight:400}
  .standfirst{max-width:46ch;margin-top:26px;font-size:19px;color:#443E36}
  .strata{display:grid;grid-template-columns:120px 1fr;gap:44px;padding:78px 0;border-bottom:1px solid var(--rule)}
  .column{display:flex;flex-direction:column;gap:3px}
  .band{height:46px;border-radius:3px;position:relative;animation:grow .9s cubic-bezier(.2,1,.3,1) backwards;transform-origin:left}
  @keyframes grow{from{transform:scaleX(.04);opacity:0}to{transform:scaleX(1);opacity:1}}
  .band span{position:absolute;left:138px;top:50%;transform:translateY(-50%);white-space:nowrap;
             font-family:ui-sans-serif,system-ui,sans-serif;font-size:12.5px;letter-spacing:.04em;color:#5A5349}
  .band span b{color:var(--ink);font-weight:700}
  h2{font-size:13px;letter-spacing:.28em;text-transform:uppercase;font-family:ui-sans-serif,system-ui,sans-serif;
     font-weight:700;color:#6B6358;margin:0 0 26px}
  .projects{padding:78px 0;border-bottom:1px solid var(--rule)}
  .intro{max-width:52ch;font-size:18px;color:#443E36;margin:-10px 0 34px}
  .plist{display:grid;gap:0}
  .p{display:grid;grid-template-columns:1fr auto;gap:24px;padding:22px 0;border-top:1px solid var(--rule);align-items:baseline}
  .p:last-child{border-bottom:1px solid var(--rule)}
  .p h3{margin:0;font-size:27px;font-weight:400;letter-spacing:-.015em}
  .p .meta{font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px;letter-spacing:.14em;
           text-transform:uppercase;color:#6B6358}
  .p.lead h3{color:var(--accent)}
  .news{padding:78px 0 96px}
  .n{display:grid;grid-template-columns:132px 1fr;gap:28px;padding:20px 0;border-top:1px solid var(--rule)}
  .n time{font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px;letter-spacing:.1em;color:#6B6358;padding-top:5px}
  .n h3{margin:0;font-size:21px;font-weight:400;line-height:1.3}
  .n p{margin:7px 0 0;color:#5A5349;font-size:15.5px;max-width:62ch}
  footer{border-top:1px solid var(--rule);padding:30px 0 60px;font-family:ui-sans-serif,system-ui,sans-serif;
         font-size:11.5px;letter-spacing:.1em;color:#8A8276;display:flex;gap:16px}
  .draft{position:fixed;top:0;left:0;right:0;background:var(--accent);color:#fff;text-align:center;
         padding:7px;font-family:ui-sans-serif,system-ui,sans-serif;font-size:11.5px;letter-spacing:.18em;
         text-transform:uppercase;font-weight:700;z-index:9}
  @media(max-width:720px){.strata{grid-template-columns:1fr}.band span{left:0;top:auto;bottom:-2px;transform:none}
    .band{height:34px}.n{grid-template-columns:1fr;gap:4px}.p{grid-template-columns:1fr}}
</style></head>
<body>
${mode === "draft" ? '<div class="draft">Draft preview — not published</div>' : ""}
<div class="wrap">

  <header class="top">
    <span class="mark">${esc(company.name || "")}</span>
    ${company.ticker ? `<span class="tick">${esc(company.ticker)}</span>` : ""}
  </header>

  <section class="hero">
    ${hero.kicker ? `<div class="kicker">${esc(hero.kicker)}</div>` : ""}
    <h1>${esc(hero.headline || pp.ONE_LINER || company.name || "")}</h1>
    ${hero.standfirst ? `<div class="standfirst">${rich(hero.standfirst)}</div>` : ""}
  </section>

  ${bands.length ? `<section class="strata">
    <div class="column">
      ${bands.map((b, i) => `<div class="band" style="background:${TONE[b.tone] || TONE.slate};animation-delay:${i * 90}ms">
        <span><b>${esc(b.label)}</b>${b.depth != null ? ` · ${esc(b.depth)} m` : ""}</span></div>`).join("")}
    </div>
    <div><h2>${esc(strata.heading || "Stratigraphy")}</h2></div>
  </section>` : ""}

  <section class="projects">
    <h2>${esc(projSec.heading || "Projects")}</h2>
    ${projSec.intro ? `<div class="intro">${rich(projSec.intro)}</div>` : ""}
    <div class="plist">
      ${projects.length ? projects.map((p) => {
        const lead = projSec.featured && (p.key === projSec.featured || p.name === projSec.featured);
        return `<div class="p${lead ? " lead" : ""}">
          <h3>${esc(p.name || p.title || "Untitled")}</h3>
          <div class="meta">${esc(p.location || p.jurisdiction || p.commodity || "")}</div>
        </div>`;
      }).join("") : `<div class="p"><h3>No projects published</h3><div class="meta">—</div></div>`}
    </div>
  </section>

  <section class="news">
    <h2>${esc(news.heading || "Announcements")}</h2>
    ${posts.slice(0, limit).map((p) => `<article class="n">
      <time datetime="${esc(p.publishedAt || "")}">${esc(fmtDate(p.publishedAt))}</time>
      <div><h3>${esc(p.title)}</h3>${p.summary ? `<p>${esc(p.summary)}</p>` : ""}</div>
    </article>`).join("") || `<article class="n"><time>—</time><div><h3>Nothing published yet</h3></div></article>`}
  </section>

  <footer>
    <span>Content from MineEx · contract ${esc(payload.contract || "?")}</span>
    <span>${esc(mode || "")}</span>
    <span style="margin-left:auto">Generated ${esc(fmtDate(payload.generatedAt))}</span>
  </footer>
</div>
</body></html>`;
}
