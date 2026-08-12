// ─────────────────────────────────────────────────────────────────────────────
// Conference Mode — the convention-booth DECK engine.
//
// Conference Mode is a discrete presentation deck, NOT a scroll page. This file owns:
//   • the deck controller (useDeck) — one intentional gesture advances exactly ONE
//     state; a transition lock prevents a fast/strong swipe from skipping states;
//     wheel / touch / keyboard all drive the same state machine.
//   • the beat MANIFEST — sections (from the pure view-model) flattened into an
//     ordered list of beats; each section renders only when its data exists.
//   • the color-inheriting top nav + per-section beat dots + idle attract-reset.
//
// Rendering is delegated to conference-only components in conferenceUI.jsx, each of
// which receives `active` (is this the on-screen section) and `local` (which beat).
// Isolation is unchanged: we only READ window.__PP__-derived globals + accent/util
// bindings from PassportProto; nothing here touches the investor app.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef, useCallback } from "react";
import QRCode from "qrcode";
import { resolveWidgets, resolveProjectWidgets, widgetText } from "../lib/conferenceWidgets.js";
import { buildConferenceModel } from "./conferenceModel.js";
import {
  CMStyles, TONES, BeatDots,
  CMOverview, CMHighlights, CMJurisdiction, CMProject, CMCapital, CMLeadership, CMWhyInvest, CMFollow, CMEndCap,
} from "./conferenceUI.jsx";
import {
  EM, prefersReduce, shortCo,
  AVATAR, CAP, COMPANY, EXCHANGES, OWNERSHIP, PROJECTS_FULL, PR_YEARS,
  STATUS, STATUS_IMG, TEAM_MEMBERS,
} from "./PassportProto.jsx";

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const TRANS_MS = 620;          // section/beat transition duration = the lock window
const WHEEL_TH = 46;           // trackpad/mouse-wheel accumulation threshold (one gesture → one step)
const TOUCH_TH = 56;           // finger swipe distance threshold (px)

export function ConferenceScenes() {
  const S = (x) => (x == null ? "" : String(x));
  const co = COMPANY || {}, st = STATUS || {}, cap = CAP || {};
  const conf = (() => { try { return (window.__PP__ && window.__PP__.CONFERENCE) || {}; } catch (_) { return {}; } })();
  const capStatus = (() => { try { return (window.__PP__ && window.__PP__.CAPSTATUS) || {}; } catch (_) { return {}; } })();
  const reduce = prefersReduce();

  // ── Handoff QR + profile URL (both point at the live Passport profile) ──────────
  let slug = "", previewToken = "";
  try { const p = new URLSearchParams(window.location.search); slug = p.get("c") || ""; previewToken = p.get("preview") || ""; } catch (_) {}
  let origin = "https://passport-xi-five.vercel.app";
  try { if (window.location.origin && /^https?:/.test(window.location.origin)) origin = window.location.origin; } catch (_) {}
  const utm = S(conf.boothQrUtm) || "booth";
  const qrUrl = `${origin}/app?c=${encodeURIComponent(slug)}&utm_campaign=${encodeURIComponent(utm)}`;
  // Phone-frame profile (no ipad=1 → the real mobile Passport profile). Carries the
  // preview token so unpublished companies still render in the frame.
  const profileUrl = `${origin}/app?c=${encodeURIComponent(slug)}${previewToken ? `&preview=${encodeURIComponent(previewToken)}` : ""}&qr=1`;
  const [qr, setQr] = useState("");
  useEffect(() => { let live = true; QRCode.toString(qrUrl, { type: "svg", errorCorrectionLevel: "H", margin: 0 }).then((s) => { if (live) setQr(s); }).catch(() => {}); return () => { live = false; }; }, [qrUrl]);

  // ── Data (unchanged sourcing) ──────────────────────────────────────────────────
  const hasHero = S(STATUS_IMG).trim() !== "";
  const ex = (Array.isArray(EXCHANGES) ? EXCHANGES : []).filter((e) => e && e.sym);
  const ticker = (ex[0] && S(ex[0].sym)) || S(co.ticker).replace(/^[^:]*:\s*/, "");
  const tickerLabel = ticker ? (ex[0] && S(ex[0].ex) ? `${S(ex[0].ex)}: ${ticker}` : ticker) : "";
  const projects = Object.values(PROJECTS_FULL || {}).filter((p) => p && S(p.name));
  const flagship = projects.find((p) => S(p.key) === S(conf.featuredProjectKey)) || projects[0] || {};

  // Jurisdiction / project curated widget facts (fall through to legacy in the model).
  const jurisdictionFacts = (() => {
    if (!(conf.jurisdictionWidgets || conf.jurisdictionWidgetKeys)) return null;
    const inf = (flagship && flagship.infrastructure) || {};
    const jurAuto = { provinceState: S(co.jurisdiction), infrastructure: [S(inf.road) && "Road", S(inf.power) && "Power", S(inf.water) && "Water"].filter(Boolean).join(" · ") };
    return resolveWidgets("jurisdiction", jurAuto, conf).slice(0, 8).map((w) => ({ label: w.label, value: widgetText(w.value) })).filter((f) => S(f.value));
  })();
  const projectFacts = (() => {
    const out = {};
    (projects || []).forEach((pj) => {
      const pjk = S(pj.key) || S(pj.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      if (!(conf.projectWidgetKeys && conf.projectWidgetKeys[pjk])) return;
      const sv = (needle) => { const s = (Array.isArray(pj.snap) ? pj.snap : []).find((x) => new RegExp(needle, "i").test(S(x.label))); return s ? S(s.value) : ""; };
      const auto = { stage: S(pj.stageName), commodity: sv("commodity"), ownership: sv("ownership"), location: S(pj.locationFull), landPackage: sv("land"), depositType: sv("deposit") || S((pj.deposit || {}).type), geologicalModel: S(pj.geology) };
      out[pjk] = resolveProjectWidgets(pjk, auto, conf).map((w) => ({ label: w.label, value: widgetText(w.value) })).filter((f) => S(f.value));
    });
    return out;
  })();

  const cmModel = buildConferenceModel({
    co, st, conf, tickers: ex, logo: AVATAR, heroImg: STATUS_IMG,
    projects, featuredProjectKey: conf.featuredProjectKey, shortName: shortCo(co.name),
    jurisdictionFacts, projectFacts,
  });

  // ── Leadership model (Blueprint curation applied) ───────────────────────────────
  const team = (() => {
    const raw = (Array.isArray(TEAM_MEMBERS) ? TEAM_MEMBERS : []).filter((m) => m && S(m.name));
    const lead = (conf.leadership && typeof conf.leadership === "object" && !Array.isArray(conf.leadership)) ? conf.leadership : {};
    const keyOf = (m, i) => (m && (m.id || m.key)) || `t-${String((m && m.name) || i).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
    const customLeaders = (Array.isArray(lead.custom) ? lead.custom : []).filter((m) => m && S(m.name)).map((m) => ({ ...m, __key: m.key }));
    let list = raw.map((m, i) => ({ ...m, __key: keyOf(m, i) })).concat(customLeaders);
    const sel = Array.isArray(lead.selectedPersonIds) ? lead.selectedPersonIds : null;
    if (sel) { const byKey = Object.fromEntries(list.map((m) => [m.__key, m])); list = sel.map((k) => byKey[k]).filter(Boolean); }
    const featKey = S(lead.featuredPersonId);
    if (featKey) { const fi = list.findIndex((m) => m.__key === featKey); if (fi > 0) { const [f] = list.splice(fi, 1); list.unshift(f); } }
    return list;
  })();
  const leadershipModel = (() => {
    if (!team.length) return null;
    const mkInitials = (m) => S(m && m.initials) || S(m && m.name).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
    const trimBio = (s) => { s = S(s).replace(/\s+/g, " ").trim(); if (s.length <= 300) return s; const cut = s.slice(0, 300); const dot = cut.lastIndexOf(". "); return dot > 150 ? cut.slice(0, dot + 1) : cut.replace(/\s+\S*$/, "") + "…"; };
    const leadConf = (conf.leadership && typeof conf.leadership === "object" && !Array.isArray(conf.leadership)) ? conf.leadership : {};
    const lead = team[0];
    return {
      eyebrow: "Leadership", title: S(leadConf.headline) || "The people creating value", companyShort: shortCo(co.name),
      featured: { name: S(lead.name), role: S(lead.role), photo: S(lead.photo), initials: mkInitials(lead), bio: trimBio(S(lead.short) || S(lead.full)) },
      supporting: team.slice(1).map((m) => ({ name: S(m.name), role: S(m.role), photo: S(m.photo), initials: mkInitials(m) })),
    };
  })();

  // ── Why-Invest data ─────────────────────────────────────────────────────────────
  const investmentCase = (() => {
    const all = (Array.isArray(conf.investmentCase) ? conf.investmentCase : []).filter((r) => r && S(r.reason) && r.selected !== false);
    const feat = all.find((r) => r.featured);
    return feat ? [feat, ...all.filter((r) => r !== feat)] : all;
  })();
  const catalysts = (() => { try { return (window.__PP__ && Array.isArray(window.__PP__.CATALYSTS)) ? window.__PP__.CATALYSTS.filter((c) => c && S(c.label)) : []; } catch (_) { return []; } })();
  const whyData = {
    eyebrow: "Why Invest", title: `Why ${shortCo(co.name)}`,
    reasons: investmentCase.map((r) => ({ reason: S(r.reason), evidence: S(r.evidence), standsOutBecause: S(r.standsOutBecause) })).filter((r) => r.reason),
    advantages: (Array.isArray(conf.competitiveAdvantages) ? conf.competitiveAdvantages : []).map(S).filter(Boolean),
    catalysts: catalysts.map((c) => ({ timing: S(c.timing), label: S(c.label), impact: S(c.impact) })).filter((c) => c.label),
  };

  // ── Capital model (deterministic: primary figures · ownership · notes · securities) ──
  const capitalModel = (() => {
    const ownSegs = [];
    (Array.isArray(OWNERSHIP) ? OWNERSHIP : []).forEach(([lab, val]) => {
      S(val).split(/·|,|;|\/|\band\b/).forEach((tok) => {
        const mm = tok.match(/(\d+(?:\.\d+)?)\s*%\s*(.*)/);
        if (mm && parseFloat(mm[1]) > 0) ownSegs.push({ pct: parseFloat(mm[1]), label: (mm[2] || lab || "").trim().replace(/^[~\s]+/, "") });
      });
    });
    const fundedLine = S(capStatus.headline);
    // Non-zero guard — a value like "C$0", "0", or "$0.0M" is noise, not a figure.
    const nonZero = (v) => { const s = S(v); if (!s) return false; const num = s.replace(/[^0-9.]/g, ""); return num !== "" && parseFloat(num) !== 0; };
    // Primary hero numbers (short numeric): the three that matter most, in order.
    const figures = [];
    [["Cash", co.cash], ["Market Cap", co.marketCap || cap.marketCap], ["Shares Outstanding", cap.outstanding]]
      .forEach(([l, v]) => { if (nonZero(v) && figures.length < 3) figures.push({ label: l, value: S(v) }); });
    // Longer-form notes.
    const notes = [];
    const fin = Array.isArray(cap.financing) ? "" : S(cap.financing);
    if (fin) notes.push({ label: "Last financing", value: fin });
    if (nonZero(cap.workingCapital)) notes.push({ label: "Working capital", value: S(cap.workingCapital) });
    if (S(cap.reportingDate)) notes.push({ label: "Balance sheet", value: S(cap.reportingDate) });
    // Securities (own beat; vanishes when empty). Warrants/options usually live in cap.rows[].
    const securities = [], seen = {};
    const addSec = (label, value, detail) => { const k = S(label).toLowerCase(); if (nonZero(value) && !seen[k]) { seen[k] = 1; securities.push({ label: S(label), value: S(value), detail: S(detail) }); } };
    addSec("Fully diluted shares", cap.fd);
    (Array.isArray(cap.rows) ? cap.rows : []).forEach((r) => { if (/warrant|option/i.test(S(r.sec))) addSec(r.sec, r.qty, r.det); });
    addSec("Warrants", cap.warrants); addSec("Options", cap.options); addSec("Debt", cap.debt);
    const partnerships = (Array.isArray(conf.strategicPartnerships) ? conf.strategicPartnerships : []).map(S).filter(Boolean);
    return {
      eyebrow: "Capital", heroStat: S(conf.capitalHeroStat), intro: S(conf.capitalIntro),
      fundingStatus: fundedLine || S(capStatus.label), ownership: ownSegs, figures, notes, securities, partnerships,
    };
  })();
  const capitalHasData = capitalModel.figures.length || capitalModel.ownership.length || capitalModel.notes.length || capitalModel.securities.length || capitalModel.fundingStatus || capitalModel.intro;

  // ── Flagship results (folded into the flagship project's beat sequence) ──────────
  const resultsModel = (() => {
    const res = flagship.resource || {}, eco = flagship.economics || {}, prod = flagship.production || {}, met = flagship.metallurgy || {};
    const drillRows = (flagship.drillResults && Array.isArray(flagship.drillResults.rows) ? flagship.drillResults.rows : [])
      .filter((r) => r && (S(r.grade) || S(r.interval) || S(r.hole))).slice(0, 6).map((r) => ({ hole: S(r.hole), interval: S(r.interval), grade: S(r.grade) }));
    const stageMap = { exploration: "resource", development: "economics", production: "production", royalty: "royalty" };
    const evType = (S(conf.evidenceType) === "drill_results" ? "resource" : S(conf.evidenceType)) || stageMap[S(co.stage).toLowerCase()] || "resource";
    let metrics = [], title = "Results & Evidence";
    if (evType === "economics" && (S(eco.npv) || S(eco.irr))) { title = "Project Economics"; metrics = [["NPV", eco.npv], ["IRR", eco.irr], ["Initial Capex", eco.capex], ["Payback", eco.payback], ["Mine Life", eco.mineLife], ["AISC", eco.aisc]]; }
    else if (evType === "production" && (S(prod.annualOutput) || S(prod.aisc))) { title = "Production & Cash Flow"; metrics = [["Annual Output", prod.annualOutput], ["AISC", prod.aisc], ["Free Cash Flow", prod.freeCashFlow], ["Reserve Life", prod.reserveLife]]; }
    else if (S(res.containedMetal) || S(res.grade)) { title = "Mineral Resource"; metrics = [["Contained Metal", res.containedMetal], ["Grade", res.grade], ["Tonnes", res.tonnes], ["Category", res.category], ["Cut-off", res.cutoff]]; }
    metrics = metrics.map(([l, v]) => ({ label: l, value: S(v) })).filter((m) => m.value);
    const deriveGrade = () => { for (const p of Object.values(PROJECTS_FULL || {})) { const card = (Array.isArray(p.cards) ? p.cards : []).find((c) => c.kind === "drills" && Array.isArray(c.rows) && c.rows.length); if (card) { const r = card.rows[0]; return { grade: S(r.grade), width: S(r.interval), location: S(p.name), context: S(r.note) }; } } return null; };
    const fg = (conf.featuredGrade && S(conf.featuredGrade.grade)) ? conf.featuredGrade : (!metrics.length ? deriveGrade() : null);
    let featured = null, selectedMetrics = [];
    if (metrics.length) { featured = { kind: "metric", value: metrics[0].value, label: metrics[0].label }; selectedMetrics = metrics.slice(1); }
    else if (fg && S(fg.grade)) { featured = { kind: "grade", value: S(fg.grade), interval: S(fg.width), hole: S(fg.location), context: S(fg.context) }; }
    // Contextual media (neutral label — never tied to a specific intercept).
    const g0 = (g) => S(typeof g === "string" ? g : g && g.src);
    const mImgs = [];
    (conf.gallery && Array.isArray(conf.gallery.results) ? conf.gallery.results : []).forEach((g) => { const s = g0(g); if (s) mImgs.push(s); });
    const fk = S(flagship.key) || S(flagship.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    (conf.projectGallery && Array.isArray(conf.projectGallery[fk]) ? conf.projectGallery[fk] : (Array.isArray(flagship.gallery) ? flagship.gallery : [])).forEach((g) => { const s = g0(g); if (s) mImgs.push(s); });
    if (hasHero) mImgs.push(STATUS_IMG);
    const mediaImages = [...new Set(mImgs)].slice(0, 4);
    return {
      eyebrow: (drillRows.length && !metrics.length) ? "Drill Results" : title,
      featured, metrics: selectedMetrics, intercepts: drillRows,
      media: { images: mediaImages, label: drillRows.length ? (S(flagship.name) ? `Drilling at ${S(flagship.name)}` : "Exploration gallery") : "Project media" },
    };
  })();

  // ── Follow data ──────────────────────────────────────────────────────────────────
  const followData = {
    eyebrow: "Continue on Passport",
    headline: S(conf.follow && conf.follow.headline) || `Follow ${shortCo(co.name)} on Passport`,
    body: S(conf.follow && conf.follow.body) || `Conference Mode is the summary. Scan to open ${shortCo(co.name)} on Passport — every update, delivered.`,
    qr, qrLabel: S(conf.follow && conf.follow.qrLabel) || "Scan to follow", profileUrl,
    bg: (() => { const g = conf.gallery && Array.isArray(conf.gallery.follow) && conf.gallery.follow[0]; const src = g ? (typeof g === "string" ? g : S(g.src)) : ""; return src ? `linear-gradient(rgba(5,7,13,0.78), rgba(5,7,13,0.94)), url("${src}") center/cover` : ""; })(),
  };

  // ── SECTION MANIFEST ─────────────────────────────────────────────────────────────
  const SECTIONS = [];
  SECTIONS.push({ id: "overview", label: "Overview", tone: CMOverview.tone, count: CMOverview.beats({ hero: cmModel.hero, company: cmModel.company }).length, render: (l, a) => <CMOverview hero={cmModel.hero} company={cmModel.company} local={l} active={a} reduce={reduce} /> });
  if (cmModel.highlights.cards.length) SECTIONS.push({ id: "highlights", label: "Highlights", tone: CMHighlights.tone, count: CMHighlights.beats({ highlights: cmModel.highlights }).length, render: (l, a) => <CMHighlights highlights={cmModel.highlights} local={l} active={a} reduce={reduce} /> });
  if (cmModel.jurisdiction.hasContent) SECTIONS.push({ id: "jurisdiction", label: "Jurisdiction", tone: CMJurisdiction.tone, count: CMJurisdiction.beats({ jurisdiction: cmModel.jurisdiction }).length, render: (l, a) => <CMJurisdiction jurisdiction={cmModel.jurisdiction} local={l} active={a} reduce={reduce} /> });
  cmModel.projectStories.forEach((story, pi) => {
    const results = story.flagship ? resultsModel : null;
    const count = CMProject.beats({ story, results }).length;
    if (!count) return;
    SECTIONS.push({ id: pi === 0 ? "projects" : ("project-" + story.key), label: pi === 0 ? "Projects" : "", tone: CMProject.tone, count, render: (l, a) => <CMProject story={story} results={results} local={l} active={a} reduce={reduce} /> });
  });
  if (capitalHasData) SECTIONS.push({ id: "capital", label: "Capital", tone: CMCapital.tone, count: CMCapital.beats({ capital: capitalModel }).length, render: (l, a) => <CMCapital capital={capitalModel} local={l} active={a} reduce={reduce} /> });
  if (leadershipModel && leadershipModel.featured) SECTIONS.push({ id: "leadership", label: "Leadership", tone: CMLeadership.tone, count: CMLeadership.beats({ leadership: leadershipModel }).length, render: (l, a) => <CMLeadership leadership={leadershipModel} local={l} active={a} reduce={reduce} /> });
  if (whyData.reasons.length || whyData.advantages.length || whyData.catalysts.length) SECTIONS.push({ id: "whyinvest", label: "Why Invest", tone: CMWhyInvest.tone, count: CMWhyInvest.beats({ data: whyData }).length, render: (l, a) => <CMWhyInvest data={whyData} local={l} active={a} reduce={reduce} /> });
  SECTIONS.push({ id: "follow", label: "Follow", tone: CMFollow.tone, count: 1, render: (l, a, armed) => <CMFollow data={followData} local={l} active={a} reduce={reduce} armed={armed} /> });
  SECTIONS.push({ id: "endcap", label: "", tone: CMEndCap.tone, count: 1, render: (l, a) => <CMEndCap name={co.name} ticker={tickerLabel} active={a} /> });

  // Flatten → ordered beats + per-section start indices.
  const steps = [], starts = [];
  { let acc = 0; SECTIONS.forEach((sec, si) => { starts.push(acc); for (let l = 0; l < sec.count; l++) steps.push({ si, l }); acc += sec.count; }); }
  const total = Math.max(1, steps.length);

  // ── DECK CONTROLLER ──────────────────────────────────────────────────────────────
  const rootRef = useRef(null);
  const idxRef = useRef(0);
  const lockRef = useRef(false);
  const totalRef = useRef(total);
  const unlockRef = useRef(null);
  const idleRef = useRef(null);
  const [index, setIndexState] = useState(0);
  totalRef.current = total;

  const bumpIdle = useCallback(() => {
    clearTimeout(idleRef.current);
    const ms = (Number(conf.kioskIdleTimeout) > 0 ? Number(conf.kioskIdleTimeout) : 45) * 1000;
    idleRef.current = setTimeout(() => { if (idxRef.current !== 0 && !lockRef.current) { lockRef.current = true; idxRef.current = 0; setIndexState(0); clearTimeout(unlockRef.current); unlockRef.current = setTimeout(() => { lockRef.current = false; }, TRANS_MS); } }, ms);
  }, [conf.kioskIdleTimeout]);

  const commit = useCallback((next) => {
    const cur = idxRef.current;
    next = Math.max(0, Math.min(totalRef.current - 1, next));
    if (next === cur || lockRef.current) return;
    lockRef.current = true;
    idxRef.current = next; setIndexState(next);
    clearTimeout(unlockRef.current); unlockRef.current = setTimeout(() => { lockRef.current = false; }, TRANS_MS);
  }, []);
  const go = useCallback((d) => commit(idxRef.current + d), [commit]);
  const goTo = useCallback((i) => commit(i), [commit]);

  useEffect(() => {
    const root = rootRef.current; if (!root) return;
    // Momentum-aware wheel: one intentional gesture = one state. After a step fires we stay
    // `wheelLocked` until wheel events actually STOP for a quiet gap — so a hard flick's inertial
    // tail can't fire a second step once the transition lock releases. Only a fresh, deliberate
    // scroll (after the quiet gap) advances again.
    let wheelAccum = 0, wheelIdle = null, wheelLocked = false, ty = null;
    const onWheel = (e) => {
      e.preventDefault();
      clearTimeout(wheelIdle);
      wheelIdle = setTimeout(() => { wheelLocked = false; wheelAccum = 0; }, 140);
      if (wheelLocked || lockRef.current) { wheelAccum = 0; return; }
      wheelAccum += e.deltaY;
      if (Math.abs(wheelAccum) > WHEEL_TH) { const d = wheelAccum > 0 ? 1 : -1; wheelAccum = 0; wheelLocked = true; go(d); }
      bumpIdle();
    };
    const onTS = (e) => { if (!e.touches || e.touches.length !== 1) { ty = null; return; } ty = e.touches[0].clientY; bumpIdle(); };
    const onTM = (e) => { if (ty != null && e.cancelable) e.preventDefault(); };
    const onTE = (e) => { if (ty == null) return; const y = (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientY : ty); const dy = ty - y; ty = null; if (Math.abs(dy) > TOUCH_TH) go(dy > 0 ? 1 : -1); bumpIdle(); };
    const onKey = (e) => {
      const k = e.key;
      if (k === "ArrowDown" || k === "Down" || k === "PageDown" || k === "ArrowRight" || k === "Right" || k === " " || k === "Spacebar") { e.preventDefault(); go(1); bumpIdle(); }
      else if (k === "ArrowUp" || k === "Up" || k === "PageUp" || k === "ArrowLeft" || k === "Left") { e.preventDefault(); go(-1); bumpIdle(); }
      else if (k === "Home") { e.preventDefault(); goTo(0); bumpIdle(); }
      else if (k === "End") { e.preventDefault(); goTo(totalRef.current - 1); bumpIdle(); }
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    root.addEventListener("touchstart", onTS, { passive: true });
    root.addEventListener("touchmove", onTM, { passive: false });
    root.addEventListener("touchend", onTE, { passive: true });
    window.addEventListener("keydown", onKey);
    bumpIdle();
    return () => {
      root.removeEventListener("wheel", onWheel); root.removeEventListener("touchstart", onTS);
      root.removeEventListener("touchmove", onTM); root.removeEventListener("touchend", onTE);
      window.removeEventListener("keydown", onKey);
      clearTimeout(wheelIdle); clearTimeout(unlockRef.current); clearTimeout(idleRef.current);
    };
  }, [go, goTo, bumpIdle]);

  const cur = steps[index] || { si: 0, l: 0 };
  const activeSection = cur.si, activeLocal = cur.l;
  const activeTone = SECTIONS[activeSection] ? SECTIONS[activeSection].tone : TONES.ink;
  const onLight = activeTone.key === "sheet" || activeTone.key === "board";

  // Top nav — only primary sections (skip secondary project instances + endcap).
  const NAV = SECTIONS.map((s, si) => ({ ...s, si })).filter((s) => s.label && s.id !== "endcap" && !/^project-/.test(s.id));
  const progress = total > 1 ? index / (total - 1) : 0;

  return (
    <div ref={rootRef} className="cm-root" style={{ position: "fixed", inset: 0, overflow: "hidden", background: activeTone.bg, color: activeTone.fg, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif", touchAction: "none", transition: reduce ? "none" : `background 520ms ${EASE}`, WebkitUserSelect: "none", userSelect: "none" }}>
      <CMStyles />

      {/* Section layers — all mounted; only the active fades/rises in. */}
      {SECTIONS.map((sec, si) => {
        const isActive = si === activeSection;
        const local = si < activeSection ? sec.count - 1 : si > activeSection ? 0 : activeLocal;
        const armed = Math.abs(si - activeSection) <= 1;
        return (
          <div key={sec.id} aria-hidden={!isActive} style={{
            position: "absolute", inset: 0, zIndex: isActive ? 2 : 1,
            opacity: isActive ? 1 : 0,
            transform: isActive ? "translateY(0)" : (si > activeSection ? "translateY(3.5%)" : "translateY(-3.5%)"),
            transition: reduce ? "none" : `opacity 460ms ${EASE}, transform 540ms ${EASE}`,
            pointerEvents: isActive ? "auto" : "none",
          }}>
            {sec.render(local, isActive, armed)}
          </div>
        );
      })}

      {/* Top progress hairline (overall position through the deck). */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: 2, zIndex: 60, background: onLight ? "rgba(18,22,29,0.08)" : "rgba(255,255,255,0.08)" }}>
        <div style={{ height: "100%", width: `${progress * 100}%`, background: activeTone.accent, transition: reduce ? "none" : `width 640ms ${EASE}` }} />
      </div>

      {/* Color-inheriting top nav. */}
      <div style={{ position: "fixed", top: 2, left: 0, right: 0, zIndex: 55, background: activeTone.nav, backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderBottom: `1px solid ${activeTone.navHair}`, transition: reduce ? "none" : `background 320ms ${EASE}, border-color 320ms ${EASE}` }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 clamp(16px,4vw,44px)", height: 58, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, flexWrap: "wrap" }}>
          {NAV.map((n) => {
            const on = n.si === activeSection;
            return (
              <button key={n.id} onClick={() => { goTo(starts[n.si]); bumpIdle(); }} style={{ position: "relative", background: "none", border: "none", cursor: "pointer", padding: "8px 16px", fontSize: 14.5, fontWeight: on ? 800 : 600, letterSpacing: "-0.01em", color: on ? activeTone.navText : activeTone.navDim, transition: `color .25s ${EASE}` }}>
                {n.label}
                {on && <span style={{ position: "absolute", left: 16, right: 16, bottom: 0, height: 3, borderRadius: 3, background: activeTone.accent }} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active-section beat dots — bottom center (progress within the section).
          Hidden on the very first step, where the swipe cue provides the guidance. */}
      {index !== 0 && SECTIONS[activeSection] && SECTIONS[activeSection].count > 1 && SECTIONS[activeSection].id !== "endcap" && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: "clamp(20px,4vh,40px)", zIndex: 55, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
          <BeatDots count={SECTIONS[activeSection].count} local={activeLocal} tone={activeTone} />
        </div>
      )}

      {/* First-run swipe cue (hero only). */}
      {index === 0 && !reduce && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: "clamp(18px,3.4vh,34px)", zIndex: 55, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, pointerEvents: "none", color: activeTone.navDim }}>
          <div className="cm-cue" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase" }}>Swipe</div>
          <div className="cm-cue" style={{ width: 20, height: 20, borderRight: `2px solid ${activeTone.navDim}`, borderBottom: `2px solid ${activeTone.navDim}`, transform: "rotate(45deg)" }} />
        </div>
      )}

      {/* Persistent follow QR chip — recedes on the Follow scene (which has the big QR). */}
      {qr && SECTIONS[activeSection] && SECTIONS[activeSection].id !== "follow" && SECTIONS[activeSection].id !== "endcap" && (
        <div style={{ position: "fixed", right: 18, bottom: 18, zIndex: 55, display: "flex", alignItems: "center", gap: 10, background: onLight ? "rgba(255,255,255,0.7)" : "rgba(11,18,32,0.8)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: `1px solid ${activeTone.navHair}`, borderRadius: 14, padding: "8px 13px 8px 8px", boxShadow: "0 12px 30px -14px rgba(0,0,0,0.5)", transition: reduce ? "none" : `background 400ms ${EASE}` }}>
          <div style={{ height: 46, width: 46, background: "#fff", borderRadius: 8, padding: 4 }} dangerouslySetInnerHTML={{ __html: qr }} />
          <div style={{ color: onLight ? "#141821" : "#fff", fontSize: 12, fontWeight: 800, lineHeight: 1.15, whiteSpace: "nowrap" }}>Follow on<br />Passport</div>
        </div>
      )}
    </div>
  );
}
