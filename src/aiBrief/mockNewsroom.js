// ============================================================================
// MOCK NEWSROOM — dev-only sandbox for the MineEx news feed.
//
// ~40 realistic mining stories across NEWS / press releases (typed by EVENT) /
// VIDEO / INTERVIEW / MINEEX BRIEF, with editorial depth, scene-based imagery,
// and fresh timestamps — so you can FEEL the finished For You / News / Press
// Releases / Media experience BEFORE building the real automated backend.
//
// 100% free & offline: no RSS, no AI, no cron, no network. Pure static data.
// ENABLE:  ?mock=1  in a browser, OR long-press the "Today" title in-app.
// REMOVE:  delete this file + its import/usage in PassportProto.jsx.
// ============================================================================
import { Radio, Newspaper, Play, Mic, Sparkles } from "lucide-react";

/* ---- enable/disable ----
   HARD DEV-ONLY GATE: mock is available only when running under the Vite dev server
   (import.meta.env.DEV). In ANY production build (`vite build` → native app AND the
   deployed web app) this always returns false, so no ordinary user — and no App
   Review tester — can ever surface the mock newsroom via ?mock=1 or the long-press. */
const DEV_ONLY = !!(import.meta && import.meta.env && import.meta.env.DEV);
export function mockEnabled() {
  if (!DEV_ONLY) return false;
  try {
    const u = new URLSearchParams(window.location.search);
    if (u.has("mock")) localStorage.setItem("mineex.mock", u.get("mock") === "0" ? "0" : "1");
    return localStorage.getItem("mineex.mock") === "1";
  } catch { return false; }
}
export function disableMock() { try { localStorage.setItem("mineex.mock", "0"); } catch {} }

/* ---- helpers ---- */
const isoFromH = (h) => new Date(Date.now() - h * 3600e3).toISOString();
const relFromH = (h) => (h < 1 ? "now" : h < 24 ? Math.max(1, Math.round(h)) + "h" : h < 48 ? "1d" : h < 168 ? Math.round(h / 24) + "d" : Math.round(h / 168) + "w");
const mono = (name) => String(name || "").trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "•";
const SRC_ICON = { NEWS: Newspaper, UPDATE: Radio, VIDEO: Play, INTERVIEW: Mic, "MINEEX BRIEF": Sparkles };
const SRC_TAG = { NEWS: "Industry", UPDATE: "Company", VIDEO: "Company", INTERVIEW: "Company", "MINEEX BRIEF": "Passport" };

const GRADE = {
  Silver: ["12.4 m @ 486 g/t AgEq", "1.7 m @ 1,240 g/t AgEq", "9.1 m @ 322 g/t AgEq"],
  Gold:   ["24 m @ 3.1 g/t Au", "6.0 m @ 8.7 g/t Au", "41 m @ 1.4 g/t Au"],
  Copper: ["8.5 m @ 2.4% Cu", "120 m @ 0.62% Cu", "15 m @ 1.9% Cu"],
  Lithium:["41 m @ 0.9% Li₂O", "22 m @ 1.3% Li₂O"],
  Uranium:["6.2 m @ 0.42% U₃O₈", "3.1 m @ 1.1% U₃O₈"],
  Nickel: ["15 m @ 1.8% Ni", "30 m @ 0.9% Ni"],
};
const metalWord = (c) => (Object.keys(GRADE).find((k) => String(c || "").includes(k)) || "Gold");
const gradeFor = (c, i) => { const a = GRADE[metalWord(c)]; return a[i % a.length]; };
const metal = (co) => metalWord(co.commodity).toLowerCase();
const PROJECTS = ["Cerro Blanco", "El Quevar", "Las Coloradas", "Soledad", "Yaxché", "San Marcos", "Cordillera", "Salar Norte", "Thunder Ridge", "Gaspé Trend", "Silver Ridge"];
const FIN = ["C$8.0M bought deal", "C$5.2M private placement", "C$12M strategic investment", "C$3.5M flow-through financing"];
const OUTLETS = ["Northern Miner", "Mining.com", "Kitco News", "Junior Mining Network", "BNN Bloomberg", "Reuters Metals"];

const SYNTH = [
  { slug: "sierra-argent", name: "Sierra Argent Mining", ticker: "TSXV: SAG", commodity: "Silver", region: "Zacatecas, Mexico" },
  { slug: "cordillera-silver", name: "Cordillera Silver", ticker: "TSXV: CSL", commodity: "Silver", region: "Puno, Peru" },
  { slug: "altiplano-silver", name: "Altiplano Silver Corp", ticker: "TSXV: ASV", commodity: "Silver", region: "Salta, Argentina" },
  { slug: "aurum-peak", name: "Aurum Peak Gold", ticker: "TSXV: APK", commodity: "Gold", region: "Nevada, USA" },
  { slug: "golden-strike", name: "Golden Strike Resources", ticker: "TSXV: GSR", commodity: "Gold", region: "Ontario, Canada" },
  { slug: "monarch-gold", name: "Monarch Gold Mining", ticker: "TSXV: MGX", commodity: "Gold", region: "Quebec, Canada" },
  { slug: "cordillera-copper", name: "Cordillera Copper", ticker: "TSXV: CUP", commodity: "Copper", region: "Antofagasta, Chile" },
  { slug: "andes-copper", name: "Andes Copper Corp", ticker: "TSXV: ACU", commodity: "Copper", region: "Coquimbo, Chile" },
  { slug: "salar-lithium", name: "Salar Lithium Corp", ticker: "TSXV: LIT", commodity: "Lithium", region: "Jujuy, Argentina" },
  { slug: "athabasca-uranium", name: "Athabasca Uranium", ticker: "TSXV: AUX", commodity: "Uranium", region: "Saskatchewan, Canada" },
  { slug: "boreal-nickel", name: "Boreal Nickel", ticker: "TSXV: BNK", commodity: "Nickel", region: "Ontario, Canada" },
];
function pickReal(dir, commodity, n, used) {
  const out = [];
  for (const c of dir) { if (out.length >= n) break; if (!c || used.has(c.slug)) continue; if (String(c.commodity || "").toLowerCase().includes(commodity.toLowerCase())) { out.push(c); used.add(c.slug); } }
  return out;
}
function buildRoster() {
  const dir = (typeof window !== "undefined" && Array.isArray(window.__DIRECTORY__)) ? window.__DIRECTORY__ : [];
  const used = new Set();
  const TARGETS = [["Silver", 3], ["Gold", 3], ["Copper", 2], ["Lithium", 1], ["Uranium", 1], ["Nickel", 1]];
  let roster = [];
  for (const [com, n] of TARGETS) {
    const real = pickReal(dir, com, n, used);
    for (let k = 0; k < n; k++) {
      const c = real[k];
      if (c) roster.push({ slug: c.slug, name: c.name, ticker: c.ticker || "", commodity: com, region: c.region || "", logo: c.logo || "", live: true });
      else { const s = SYNTH.find((x) => x.commodity === com && !roster.some((r) => r.slug === x.slug)); if (s) roster.push({ ...s, logo: "", live: false }); }
    }
  }
  if (roster.length < 6) roster = SYNTH.map((s) => ({ ...s, logo: "", live: false }));
  return roster.map((c, i) => ({ ...c, mono: mono(c.name), companyTier: i < 4 ? "pro" : i < 9 ? "basic" : "free" }));
}

// Normalized story. `scene` drives placeholder imagery; `eventType` drives the
// press-release label; `ageHours` drives freshness. Production would set `image`
// (real photo/thumbnail) and fall back to the MineEx-branded scene.
function story(o) {
  const { i, ageHours = 48, contentType, co, source, materiality = 50, eventType = "", scene = "", watch = "" } = o;
  const isCo = !!co;
  const whatHappened = o.whatHappened || "";
  const why = o.why || "";
  return {
    id: `mock-${i}`, contentType, eventType, badge: eventType || contentType, scene, watch, image: "",
    companyId: isCo ? co.slug : "", companyName: isCo ? co.name : (source || "MineEx"), ticker: isCo ? co.ticker : "",
    commodity: o.commodity || (isCo ? co.commodity : ""), jurisdiction: o.jurisdiction || (isCo ? co.region : ""),
    publishedAt: isoFromH(ageHours), when: relFromH(ageHours), source: source || "MineEx",
    headline: o.headline, t: o.headline, dek: o.dek || why || whatHappened,
    summary: whatHappened, summaryLong: o.summaryLong || [whatHappened, why].filter(Boolean).join(" "),
    context: o.context || "", keyNumbers: o.keyNumbers || [], originalHeadline: o.originalHeadline || o.headline,
    fullUrl: o.fullUrl || "https://example.com/mock-release", whatHappened, why, takeaways: o.takeaways || [],
    caption: o.caption || "", duration: o.duration || "", materiality,
    companyTier: isCo ? co.companyTier : "free", isFeatured: false,
    src: SRC_TAG[contentType], Icon: SRC_ICON[contentType], co: isCo ? co.name : (source || "MineEx"),
    live: !!(isCo && co.live), slug: isCo ? co.slug : "", logo: isCo ? co.logo : "", key: !!o.key,
  };
}

// Press-release "kinds" — typed by what actually happened, each with its own
// scene, materiality and freshness profile.
const PR_KINDS = [
  { ev: "DRILL RESULTS", scene: "core", key: true, mat: 88, ages: [4, 9, 27],
    head: (c, p, g) => `${c.name} hits ${g} at ${p}`, orig: (c, p, g) => `${c.name} Reports High-Grade Intercepts at ${p}, Including ${g}`,
    dek: (c, p) => `Fresh drilling extends the ${p} zone and firms up continuity along strike.`,
    long: (c, p, g) => `${c.name} released assays from ${p}, headlined by ${g}. The hole extends known mineralization along strike and ties previously reported sections together, pointing to a continuous zone rather than isolated hits. Management flagged an expanded follow-up program to test the structure at depth.`,
    ctx: (c) => `For a ${metal(c)} explorer at this stage, grade and continuity are what move the story toward a maiden resource.`,
    keys: (g, p) => [{ label: "Headline interval", value: g }, { label: "Zone", value: p }, { label: "Stage", value: "Exploration drilling" }, { label: "Next", value: "Follow-up holes" }] },
  { ev: "ASSAYS", scene: "core", mat: 78, ages: [12, 22, 44],
    head: (c, p, g) => `${c.name} returns ${g} in latest assays from ${p}`, orig: (c, p) => `${c.name} Announces Assay Results from ${p}`,
    dek: (c, p) => `Lab results confirm mineralization across the ${p} target.`,
    long: (c, p, g) => `Assays from ${c.name}'s ${p} target returned ${g}. Results confirm the tenor seen in earlier surface sampling and support the geological model ahead of the next drill phase.`,
    ctx: (c) => `Assay confirmation de-risks the ${metal(c)} model before larger spend is committed.`,
    keys: (g, p) => [{ label: "Best result", value: g }, { label: "Target", value: p }, { label: "Sample type", value: "Channel + core" }, { label: "Next", value: "Drill planning" }] },
  { ev: "RESOURCE UPDATE", scene: "geomap", mat: 84, ages: [30, 58],
    head: (c, p) => `${c.name} files maiden resource at ${p}`, orig: (c, p) => `${c.name} Announces Maiden Mineral Resource Estimate for ${p}`,
    dek: (c) => `First formal resource puts numbers behind the ${metal(c)} story.`,
    long: (c, p) => `${c.name} filed a maiden mineral resource estimate for ${p}, the first formal quantification of the deposit. The estimate anchors valuation and sets the baseline for future expansion drilling.`,
    ctx: () => `A maiden resource is the milestone that shifts a project from pure exploration to a quantifiable asset.`,
    keys: (g, p) => [{ label: "Category", value: "Inferred" }, { label: "Deposit", value: p }, { label: "Basis", value: "NI 43-101" }, { label: "Next", value: "Expansion drilling" }] },
  { ev: "EXPLORATION", scene: "geomap", mat: 62, ages: [16, 34],
    head: (c, p) => `${c.name} defines new drill targets across ${p}`, orig: (c, p) => `${c.name} Identifies New Drill Targets at ${p}`,
    dek: () => `Mapping and geophysics expand the target inventory.`,
    long: (c, p) => `${c.name} defined new drill targets across ${p} following mapping, sampling and geophysics. The work widens the pipeline of testable targets for the upcoming program.`,
    ctx: () => `A deeper target inventory increases the odds of discovery per dollar drilled.`,
    keys: (g, p) => [{ label: "New targets", value: "Multiple" }, { label: "Area", value: p }, { label: "Method", value: "Mapping + geophysics" }, { label: "Next", value: "Drill permitting" }] },
  { ev: "ACQUISITION", scene: "geomap", mat: 72, ages: [26, 52],
    head: (c, p) => `${c.name} acquires the ${p} land package`, orig: (c, p) => `${c.name} Expands District Footprint with ${p} Acquisition`,
    dek: () => `District-scale ground added, royalty-free.`,
    long: (c, p) => `${c.name} acquired the ${p} land package, expanding its district footprint. The addition consolidates prospective ground and adds new, untested targets to the portfolio.`,
    ctx: () => `Consolidating a district lets a company explore a whole mineral system rather than a single claim.`,
    keys: (g, p) => [{ label: "Package", value: p }, { label: "Terms", value: "Cash + shares" }, { label: "Royalty", value: "None" }, { label: "Next", value: "Target generation" }] },
  { ev: "PERMITTING", scene: "landscape", mat: 56, ages: [70, 130],
    head: (c, p) => `${c.name} receives drill permit for ${p}`, orig: (c, p) => `${c.name} Granted Drill Permit at ${p}`,
    dek: () => `Approval clears the path to the maiden program.`,
    long: (c, p) => `${c.name} received its drill permit for ${p}, clearing the final regulatory step before drilling. The company expects to mobilize a rig in the coming weeks.`,
    ctx: () => `Permitting is a common timeline risk; clearing it removes a gate to the next catalyst.`,
    keys: (g, p) => [{ label: "Permit", value: "Granted" }, { label: "Project", value: p }, { label: "Rig", value: "Mobilizing" }, { label: "Next", value: "First holes" }] },
  { ev: "PARTNERSHIP", scene: "landscape", mat: 60, ages: [40, 84],
    head: (c) => `${c.name} signs strategic exploration partnership`, orig: (c) => `${c.name} Enters Strategic Partnership to Advance Exploration`,
    dek: () => `A funded partner shares cost and technical depth.`,
    long: (c, p) => `${c.name} signed a strategic partnership to advance exploration at ${p}, bringing additional funding and technical expertise. The arrangement extends the company's runway without immediate dilution.`,
    ctx: () => `Partnerships can de-risk funding and add technical credibility to a junior's program.`,
    keys: (g, p) => [{ label: "Partner", value: "Strategic" }, { label: "Project", value: p }, { label: "Funding", value: "Shared" }, { label: "Next", value: "Joint program" }] },
  { ev: "CORPORATE", scene: "landscape", mat: 48, ages: [76, 150],
    head: (c) => `${c.name} appoints new VP Exploration`, orig: (c) => `${c.name} Strengthens Technical Team with Senior Appointment`,
    dek: () => `A senior hire ahead of the next drill campaign.`,
    long: (c) => `${c.name} appointed a new VP Exploration with district experience, strengthening the technical bench ahead of an expanded program.`,
    ctx: () => `Experienced technical leadership is a quiet but real driver of exploration outcomes.`,
    keys: () => [{ label: "Role", value: "VP Exploration" }, { label: "Focus", value: "Drill targeting" }, { label: "Team", value: "Expanded" }, { label: "Next", value: "Program design" }] },
];
const FIN_KIND = { ev: "FINANCING", scene: "processing", mat: 56, ages: [14, 40, 68],
  head: (c, f) => `${c.name} closes ${f}`, orig: (c, f) => `${c.name} Closes ${f} Financing`,
  dek: () => `The raise funds the next drill campaign and clears the overhang.`,
  long: (c, f) => `${c.name} closed a ${f}, with proceeds earmarked for exploration and general working capital. The company is now funded through its next program, removing the near-term financing overhang that often caps junior valuations.`,
  ctx: (c) => `A funded treasury lets ${c.name} run its catalyst calendar without raising into weakness.`,
  keys: (f) => [{ label: "Gross proceeds", value: f.split(" ")[0] }, { label: "Instrument", value: "Private placement" }, { label: "Use of funds", value: "Exploration" }, { label: "Runway", value: "~12 months" }] };

export function buildMockNewsroom() {
  const roster = buildRoster();
  const stories = [];
  let i = 0;

  // 1) PRESS RELEASES — typed by event, fresh dates on the important ones.
  roster.forEach((co, r) => {
    const proj = PROJECTS[r % PROJECTS.length];
    const g = gradeFor(co.commodity, r);
    const k = PR_KINDS[r % PR_KINDS.length];
    const age = k.ages[r % k.ages.length];
    stories.push(story({
      i: i++, ageHours: age, contentType: "UPDATE", co, key: k.key, materiality: k.mat, eventType: k.ev, scene: k.scene,
      headline: k.head(co, proj, g), originalHeadline: k.orig(co, proj, g), dek: k.dek(co, proj, g),
      summaryLong: k.long(co, proj, g), context: k.ctx(co, proj), keyNumbers: k.keys(g, proj),
      whatHappened: k.dek(co, proj, g), why: k.ctx(co, proj),
    }));
    if (r % 2 === 0) {
      const f = FIN[r % FIN.length]; const age2 = FIN_KIND.ages[r % FIN_KIND.ages.length];
      stories.push(story({
        i: i++, ageHours: age2, contentType: "UPDATE", co, materiality: FIN_KIND.mat, eventType: FIN_KIND.ev, scene: FIN_KIND.scene,
        headline: FIN_KIND.head(co, f), originalHeadline: FIN_KIND.orig(co, f), dek: FIN_KIND.dek(),
        summaryLong: FIN_KIND.long(co, f), context: FIN_KIND.ctx(co), keyNumbers: FIN_KIND.keys(f), whatHappened: FIN_KIND.dek(), why: FIN_KIND.ctx(co),
      }));
    }
  });

  // 2) MEDIA — Pro companies publish video-first content (Reels).
  const pros = roster.filter((c) => c.companyTier === "pro");
  const MEDIA = [
    { type: "INTERVIEW", scene: "interview", head: (c, p) => `CEO Interview: ${c.name} on the ${p} discovery`, cap: (c, p) => `${c.name}'s CEO breaks down the latest ${p} results and what comes next.`, dur: "8:24" },
    { type: "VIDEO", scene: "drilling", head: (c, p) => `Site Tour: inside ${c.name}'s ${p} drill program`, cap: (c, p) => `On the ground at ${p} — rigs turning, core logging and the target that matters.`, dur: "4:12" },
    { type: "VIDEO", scene: "core", head: (c) => `Core Review: high-grade ${metal(c)} from the latest holes`, cap: (c) => `The exploration team walks the drill core, section by section.`, dur: "6:03" },
    { type: "INTERVIEW", scene: "interview", head: (c) => `Analyst roundtable: the ${metal(c)} macro backdrop`, cap: (c) => `A panel on ${metal(c)} demand and supply featuring ${c.name}.`, dur: "12:47" },
  ];
  pros.forEach((co, k) => { const proj = PROJECTS[k % PROJECTS.length]; const m = MEDIA[k % MEDIA.length]; stories.push(story({ i: i++, ageHours: [8, 16, 26, 34][k % 4], contentType: m.type, scene: m.scene, co, materiality: 44, source: "MineEx Media", headline: m.head(co, proj), caption: m.cap(co, proj), duration: m.dur })); });
  pros.slice(0, 3).forEach((co, k) => { const proj = PROJECTS[(k + 4) % PROJECTS.length]; const m = MEDIA[(k + 1) % MEDIA.length]; stories.push(story({ i: i++, ageHours: [20, 30, 40][k % 3], contentType: m.type, scene: m.scene, co, materiality: 42, source: "MineEx Media", headline: m.head(co, proj), caption: m.cap(co, proj), duration: m.dur })); });

  // 3) INDUSTRY NEWS — external editorial. Freshest = highest-materiality macro.
  const NEWS = [
    { commodity: "Gold", age: 6, scene: "market", mat: 80, head: "Gold holds above $2,700 as central-bank buying accelerates", dek: "Official-sector demand is underpinning the price and junior gold margins.", long: "Central banks added to reserves for a third straight quarter, keeping gold firm above $2,700. For juniors, a higher gold price improves project NPVs and makes financings easier to close. Producers are also flush, which historically drives M&A down the food chain toward developers.", context: "Sustained strength at these levels tends to pull capital back into the junior gold space and revive takeover interest." },
    { commodity: "Copper", co: 6, age: 8, scene: "market", mat: 76, head: "Copper juniors rally on grid-electrification demand outlook", dek: "A structural deficit into the 2030s is drawing capital into exploration names.", long: "Electrification and data-centre buildout have analysts modelling a structural copper deficit within the decade. Majors are struggling to replace reserves organically, putting a premium on juniors with scale potential. The read-through has lifted TSXV copper explorers broadly.", context: "When majors can't grow reserves internally, well-positioned juniors become acquisition targets — a tailwind for the whole group." },
    { commodity: "Silver", co: 0, age: 11, scene: "market", mat: 78, head: "Silver climbs to a 12-year high as industrial demand tightens supply", dek: "Solar demand and a widening deficit are lifting the silver-developer complex.", long: "Silver pushed through multi-year resistance, driven by record solar-panel demand and a fifth consecutive year of supply deficit. Higher prices flow straight through to the economics of silver developers, whose in-ground ounces are suddenly worth more. Analysts caution the move has been fast and could see pullbacks.", context: "A rising silver price re-rates the whole peer group — even pre-resource explorers benefit as the market prices in higher ounce values." },
    { commodity: "Uranium", age: 16, scene: "market", mat: 70, head: "Uranium spot breaks higher as utilities restock", dek: "Term-contract activity is a tailwind for Athabasca-focused explorers.", long: "Utilities returned to the term market in size, pushing uranium spot to new cycle highs. The move validates the thesis behind a wave of new uranium exploration, particularly in the Athabasca Basin.", context: "Uranium is a contract-driven market — a pickup in term buying is a more durable signal than spot spikes." },
    { commodity: "Gold", age: 22, scene: "geomap", mat: 74, head: "Major producer acquires TSXV gold developer in C$310M deal", dek: "The premium takeout reset valuations across single-asset gold developers.", long: "A senior producer agreed to acquire a TSXV-listed gold developer for C$310M, a meaningful premium to the prior close. The deal reset comparable valuations across single-asset developers and revived speculation about who's next.", context: "One premium takeout tends to re-rate the entire peer set as the market hunts for the next target." },
    { commodity: "", age: 30, scene: "market", mat: 58, head: "TSXV mining financings hit an 18-month high last quarter", dek: "Silver and copper names led the rebound in junior capital raising.", long: "Junior financing activity rebounded sharply, with silver and copper explorers leading the tally. Improved risk appetite and stronger metal prices reopened a window that had been largely shut through the downturn.", context: "Financing activity is the clearest sign the junior cycle is turning — capital is the fuel for the next leg of exploration." },
    { commodity: "Silver", age: 60, scene: "landscape", mat: 62, head: "Analysts flag a widening silver supply squeeze into 2027", dek: "Mine supply is failing to keep pace with industrial and investment demand.", long: "Several desks published notes warning that silver mine supply is failing to keep pace with combined industrial and investment demand, projecting a widening deficit through 2027. The reports name high-grade developers as leverage to the theme.", context: "Structural deficits favour developers with high-grade, near-term ounces." },
    { commodity: "Lithium", age: 190, scene: "market", mat: 46, head: "Lithium prices stabilize after two-year slide; developers stay cautious", dek: "Spot has found a floor, but juniors remain measured on new spend.", long: "Spot lithium found support as inventories normalized and marginal supply came offline. Developers welcomed the stabilization but most are holding spend flat until pricing confirms a durable recovery.", context: "A price floor is necessary but not sufficient — juniors want a sustained recovery before re-accelerating programs." },
    { commodity: "Copper", age: 300, scene: "landscape", mat: 44, head: "Chile permitting reform could speed junior copper timelines", dek: "Proposed changes may shorten development timelines for copper juniors.", long: "Proposed reforms to Chile's environmental review process could shorten permitting timelines for copper projects. If enacted, the changes would de-risk the development path for juniors operating in the country's copper belts.", context: "Permitting is one of the biggest timeline risks for developers — reform that compresses it is a real value driver." },
    { commodity: "Nickel", age: 360, scene: "landscape", mat: 40, head: "Nickel supply glut eases as Indonesian output plateaus", dek: "Improving sentiment for Canadian sulphide-nickel explorers.", long: "A plateau in low-grade Indonesian supply improved sentiment across the nickel space, with Canadian sulphide-nickel explorers among the beneficiaries given their cleaner product profile.", context: "Sulphide nickel commands a premium in a cleaner-supply narrative — a differentiator for Canadian explorers." },
  ];
  NEWS.forEach((n, k) => stories.push(story({
    i: i++, ageHours: n.age, contentType: "NEWS", co: n.co != null ? roster[n.co] : null, commodity: n.commodity, materiality: n.mat, scene: n.scene,
    headline: n.head, dek: n.dek, summaryLong: n.long, context: n.context,
    why: n.commodity ? `Sets the tape for ${n.commodity.toLowerCase()} juniors.` : "", source: OUTLETS[k % OUTLETS.length],
  })));

  // 4) MINEEX BRIEFS — factual/contextual summaries from source material (NOT independent analysis).
  const BRIEFS = [
    { co: 0, age: 5, scene: "geomap", mat: 66, head: `MineEx Brief: ${roster[0].name}'s latest drill hit, in context`, dek: `What the newest intercept means alongside prior drilling.`,
      long: `${roster[0].name} reported a new high-grade intercept at its flagship project. Placed against prior holes, the result sits along the same interpreted structure and lengthens the known mineralized zone rather than standing alone.`,
      context: `Continuity between holes matters more than any single number: it's the difference between a series of hits and a coherent, potentially economic zone.`,
      watch: `The next two step-out holes along strike, and whether grade holds at depth.` },
    { commodity: "Silver", age: 12, scene: "market", mat: 60, head: "MineEx Brief: reading the silver price move", dek: "Why a higher silver price flows through to developers.",
      long: `Silver has moved to multi-year highs on solar demand and a persistent supply deficit. For pre-production developers, the effect is indirect but real: a higher metal price raises the assumed value of in-ground ounces and improves the economics used in resource and study work.`,
      context: `This is a factual summary of the market backdrop, not a recommendation. Price strength helps developer economics but does not de-risk any individual project.`,
      watch: `Whether the deficit narrative holds through the year, and which developers convert it into funded programs.` },
    { co: 6, age: 18, scene: "geomap", mat: 58, head: `MineEx Brief: ${roster[6].name}'s copper resource, explained`, dek: `Grade, tonnage and metallurgy in plain language.`,
      long: `${roster[6].name} sits in a crowded copper field. This brief lays out the three variables investors most often compare — grade, likely tonnage and metallurgy — using only what the company has disclosed.`,
      context: `Metallurgy quietly decides whether a copper deposit is economic; it's worth understanding early. This is context, not a valuation call.`,
      watch: `Metallurgical test results and any move from exploration toward a maiden resource.` },
    { commodity: "Gold", age: 26, scene: "landscape", mat: 56, head: "MineEx Brief: how a $2,700 gold price changes junior math", dek: "A plain-language look at price sensitivity.",
      long: `A higher gold price disproportionately lifts the value of marginal ounces. This brief walks through, factually, how a move from $1,900 to $2,700 gold changes the inputs a typical junior uses in its project economics.`,
      context: `Leverage cuts both ways — the same math that lifts economics on the way up compresses them on the way down. Presented as context, not advice.`,
      watch: `Whether the higher price holds long enough to change how juniors fund and prioritise projects.` },
  ];
  BRIEFS.forEach((b) => stories.push(story({
    i: i++, ageHours: b.age, contentType: "MINEEX BRIEF", co: b.co != null ? roster[b.co] : null, commodity: b.commodity, materiality: b.mat, scene: b.scene,
    headline: b.head, dek: b.dek, summaryLong: b.long, context: b.context, watch: b.watch, source: "MineEx",
  })));

  const investors = [
    { id: "silver", name: "Silver Sam", tagline: "Follows silver & gold explorers — For You leans silver/gold.", following: [roster[0].slug, roster[1].slug], interests: ["Silver", "Gold"] },
    { id: "copper", name: "Copper Casey", tagline: "Base & battery-metals focus — expect copper/lithium up top.", following: [roster[6].slug, roster[8].slug], interests: ["Copper", "Lithium", "Nickel"] },
    { id: "new", name: "New Investor Nia", tagline: "Brand new — follows nothing, so it's discovery + industry news.", following: [], interests: ["Gold"] },
  ];

  return { stories, investors, roster };
}
