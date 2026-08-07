// ─────────────────────────────────────────────────────────────────────────────
// Conference Mode — the convention booth scene engine.
// Split out of PassportProto.jsx so all Conference-only rendering lives in one
// file. Shared booth primitives (SceneShell, Reveal, CountUp, …) and the
// window.__PP__-derived data globals (COMPANY, PROJECTS_FULL, …) are imported
// from PassportProto; this file adds nothing to the investor app itself.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import { ChevronRight, ChevronDown, Clock } from "lucide-react";
import { resolveWidgets, resolveProjectWidgets, widgetText } from "../lib/conferenceWidgets.js";
import {
  SceneShell, CountUp, OwnershipBar, ChapterMark, BoothTimeline,
  EM, EM_TEXT, sceneEyebrow, prefersReduce, shortCo, has,
  AVATAR, CAP, CAPSTATUS, COMPANY, EXCHANGES, OWNERSHIP, PROJECTS_FULL, PR_YEARS,
  STATUS, STATUS_IMG, TEAM_MEMBERS,
} from "./PassportProto.jsx";

// ─────────────────────────────────────────────────────────────────────────────
// Conference Mode entrance motion — the Midu-studio reveal, applied universally.
// A one-shot, editorial entrance: a heading emerges UPWARD from behind a clip mask;
// its supporting copy rises gently a beat later; cards/stats/badges follow with a
// restrained stagger. Clear hierarchy — HEADING → SUBTEXT → SUPPORTING CONTENT —
// never everything at once. Understated, decelerating, premium; not a slide-up.
//
// This replaces the shared scroll-linked Reveal for the booth only: it triggers ONCE
// when a section is ~20% in view (no replay on scroll-back) and honors reduced-motion.
// Drop-in compatible with the existing <Reveal v="eyebrow|head|body|card|media" order=.. />.
const CONF_EASE = "cubic-bezier(0.22, 1, 0.36, 1)"; // quick out, gentle settle — the Midu curve
const CONF_MOTION = {
  //          delay  dur   y   blur  clip   scale   stagger(per order)
  eyebrow: { delay: 0,   dur: 620, y: 14, blur: 0, clip: false, scale: 1,     stagger: 0 },
  head:    { delay: 120, dur: 860, y: 0,  blur: 4, clip: true,  scale: 1,     stagger: 55 },
  body:    { delay: 300, dur: 720, y: 20, blur: 0, clip: false, scale: 1,     stagger: 0 },
  media:   { delay: 340, dur: 780, y: 24, blur: 0, clip: false, scale: 1,     stagger: 0 },
  card:    { delay: 420, dur: 660, y: 22, blur: 0, clip: false, scale: 0.985, stagger: 70 },
};
function Reveal({ children, v = "body", order = 0, style, className }) {
  const cfg = CONF_MOTION[v] || CONF_MOTION.body;
  const reduce = prefersReduce();
  const ref = useRef(null);
  const [shown, setShown] = useState(reduce);
  useEffect(() => {
    if (reduce) return;
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } });
    }, { threshold: 0.2 });   // fire once the section meaningfully enters, not at dead-center
    io.observe(el);
    return () => io.disconnect();
  }, [reduce]);
  const delay = (cfg.delay || 0) + (cfg.stagger ? order * cfg.stagger : 0);
  const T = `transform ${cfg.dur}ms ${CONF_EASE} ${delay}ms, opacity ${cfg.dur}ms ${CONF_EASE} ${delay}ms, filter ${cfg.dur}ms ${CONF_EASE} ${delay}ms`;
  // Headings: emerge from behind an overflow-hidden mask (paddingBottom/negative margin gives
  // descenders room without shifting layout). Text starts fully below its baseline and rises in.
  if (cfg.clip) {
    return (
      <div ref={ref} className={className} style={{ ...style, overflow: "hidden", paddingBottom: "0.14em", marginBottom: "-0.14em" }}>
        <div style={{
          transform: shown ? "translateY(0)" : "translateY(115%)",
          opacity: shown ? 1 : 0,
          filter: shown ? "blur(0px)" : `blur(${cfg.blur}px)`,
          transition: reduce ? "none" : T,
          willChange: shown ? "auto" : "transform, opacity, filter",
        }}>{children}</div>
      </div>
    );
  }
  // Everything else: a smaller, softer rise — movement scales down the hierarchy.
  return (
    <div ref={ref} className={className} style={{
      ...style,
      transform: shown ? "translateY(0) scale(1)" : `translateY(${cfg.y}px)${cfg.scale !== 1 ? ` scale(${cfg.scale})` : ""}`,
      opacity: shown ? 1 : 0,
      filter: cfg.blur ? (shown ? "blur(0px)" : `blur(${cfg.blur}px)`) : undefined,
      transition: reduce ? "none" : T,
      willChange: shown ? "auto" : "transform, opacity",
    }}>{children}</div>
  );
}

// Section 3 — the flagship project told as 2–3 swipeable NARRATIVE paragraphs over its image,
// with callout facts and a "+N assets" pill for portfolio companies.
function SceneProjectStory({ project, label, calloutsFor, fallbackImg, id, conf = {} }) {
  const S = (x) => (x == null ? "" : String(x));
  const paras = (Array.isArray(project.narrative) ? project.narrative : []).map(S).filter(Boolean);
  const [i, setI] = useState(0);
  const n = paras.length;
  const touch = useRef(null);
  const go = (d) => setI((x) => Math.max(0, Math.min(n - 1, x + d)));
  // Per-project widget curation (Blueprint: conference.projectWidgets/projectWidgetKeys[key]).
  // When this project has been curated, its selected badges become the callouts; otherwise the
  // auto callouts stand. `conf.projectTakeaways[key]` adds an optional one-line investor takeaway.
  const pjk = S(project.key) || S(project.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  // Per-project images: prefer the conference gallery (conference.projectGallery[key]) over the
  // shared project gallery. First image is the scene background; the rest become thumbnails.
  const gsrc = (g) => S(typeof g === "string" ? g : g && g.src);
  const pjGallery = (conf && conf.projectGallery && Array.isArray(conf.projectGallery[pjk]) && conf.projectGallery[pjk].length)
    ? conf.projectGallery[pjk] : (Array.isArray(project.gallery) ? project.gallery : []);
  const img = (pjGallery[0] && gsrc(pjGallery[0])) || fallbackImg || "";
  const snapVal = (needle) => { const s = (Array.isArray(project.snap) ? project.snap : []).find((x) => new RegExp(needle, "i").test(S(x.label))); return s ? S(s.value) : ""; };
  const curated = conf && conf.projectWidgetKeys && conf.projectWidgetKeys[pjk];
  const projWidgets = curated ? resolveProjectWidgets(pjk, {
    stage: S(project.stageName), commodity: snapVal("commodity"), ownership: snapVal("ownership"),
    location: S(project.locationFull), landPackage: snapVal("land"), depositType: snapVal("deposit") || S((project.deposit || {}).type),
    geologicalModel: S(project.geology),
  }, conf) : [];
  const callouts = projWidgets.length ? projWidgets.map((w) => ({ k: w.label, v: w.value })).slice(0, 6) : calloutsFor(project);
  const takeaway = (conf && conf.projectTakeaways && S(conf.projectTakeaways[pjk])) || "";
  const navBtn = { height: 44, width: 44, borderRadius: 99, display: "grid", placeItems: "center", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.22)", color: "#fff", cursor: "pointer" };
  const onStart = (e) => { touch.current = e.touches ? e.touches[0].clientX : e.clientX; };
  const onEnd = (e) => { if (touch.current == null) return; const x = e.changedTouches ? e.changedTouches[0].clientX : e.clientX; const dx = x - touch.current; if (n > 1 && Math.abs(dx) > 48) go(dx < 0 ? 1 : -1); touch.current = null; };
  return (
    <section data-sec={id} onTouchStart={onStart} onTouchEnd={onEnd} style={{ position: "relative", minHeight: "100vh", overflow: "hidden", background: "#05070d", scrollSnapAlign: "start" }}>
      {img && <img src={img} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(2,6,23,0.55) 0%, rgba(2,6,23,0.35) 40%, rgba(2,6,23,0.92) 100%)" }} />
      <div style={{ position: "relative", maxWidth: 1240, margin: "0 auto", padding: "clamp(64px,9vh,120px) 56px", color: "#fff", minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <Reveal v="eyebrow"><div style={sceneEyebrow(EM)}>{label || "Flagship Project"}</div></Reveal>
        <Reveal v="head"><div style={{ fontSize: "clamp(40px,6vw,84px)", fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 1, marginTop: 14 }}>{S(project.name)}</div></Reveal>
        {takeaway && <Reveal v="body" order={1}><div style={{ marginTop: 18, fontSize: "clamp(16px,1.8vw,21px)", fontWeight: 700, color: "#fff", borderLeft: `3px solid ${EM}`, paddingLeft: 14, maxWidth: 780, lineHeight: 1.4 }}>{takeaway}</div></Reveal>}
        {n > 0 && (
          <div key={i} style={{ marginTop: 28, maxWidth: 780, minHeight: 150 }}>
            <div style={{ fontSize: "clamp(18px,2vw,25px)", fontWeight: 500, lineHeight: 1.5, color: "#e6ebf2" }}>{paras[i]}</div>
          </div>
        )}
        {n > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 22 }}>
            <button onClick={() => go(-1)} disabled={i === 0} aria-label="Previous" style={{ ...navBtn, opacity: i === 0 ? 0.35 : 1 }}><ChevronRight size={21} style={{ transform: "rotate(180deg)" }} /></button>
            <div style={{ display: "flex", gap: 8 }}>{paras.map((_, k) => (<span key={k} onClick={() => setI(k)} style={{ height: 9, width: k === i ? 26 : 9, borderRadius: 99, background: k === i ? EM : "rgba(255,255,255,0.35)", transition: "width .25s, background .25s", cursor: "pointer" }} />))}</div>
            <button onClick={() => go(1)} disabled={i === n - 1} aria-label="Next" style={{ ...navBtn, opacity: i === n - 1 ? 0.35 : 1 }}><ChevronRight size={21} /></button>
          </div>
        )}
        {callouts.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginTop: 38, maxWidth: 980 }}>
            {callouts.map((c, k) => (
              <div key={k} style={{ background: "rgba(11,18,32,0.55)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 18, padding: "16px 18px" }}>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: EM }}>{c.k}</div>
                <div style={{ fontSize: 19, fontWeight: 800, marginTop: 5, letterSpacing: "-0.02em" }}>{S(c.v)}</div>
              </div>
            ))}
          </div>
        )}
        {(() => {
          const dep = project.deposit || {};
          const flag = (v, label) => (v === true || /^(yes|true)/i.test(S(v)) ? label : (S(v) && !/^(no|false|n\/a|none)/i.test(S(v)) ? S(v) : ""));
          const tags = [S(dep.type), S(dep.mineType), flag(dep.pastProducer, "Past producer"), flag(dep.brownfields, "Brownfields"), flag(dep.porphyry, "Porphyry"), S(dep.historicalProduction)].map(S).filter(Boolean);
          return tags.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 26 }}>
              {tags.map((t, k) => (<span key={k} style={{ fontSize: 13, fontWeight: 700, color: "#c4cdd9", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 999, padding: "7px 15px" }}>{t}</span>))}
            </div>
          ) : null;
        })()}
        {pjGallery.length > 1 && (
          <div style={{ display: "flex", gap: 12, marginTop: 26, flexWrap: "wrap" }}>
            {pjGallery.slice(1, 5).map((g, k) => (gsrc(g) ? (
              <div key={k} style={{ width: 150, height: 96, borderRadius: 14, overflow: "hidden", border: "1px solid rgba(255,255,255,0.2)", flexShrink: 0 }}><img src={gsrc(g)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /></div>
            ) : null))}
          </div>
        )}
      </div>
    </section>
  );
}

export function ConferenceScenes() {
  const S = (x) => (x == null ? "" : String(x));
  const co = COMPANY || {}, st = STATUS || {}, cap = CAP || {};
  const conf = (() => { try { return (window.__PP__ && window.__PP__.CONFERENCE) || {}; } catch (_) { return {}; } })();
  const capStatus = (() => { try { return (window.__PP__ && window.__PP__.CAPSTATUS) || {}; } catch (_) { return {}; } })();
  const reduce = prefersReduce();

  // Handoff QR → the company's live Passport profile with a UTM tag. (The spec's
  // passport.app/co/{ticker} host isn't live; using the real profile URL so a scan actually
  // opens the profile and converts — the whole point of the booth.)
  let slug = ""; try { slug = new URLSearchParams(window.location.search).get("c") || ""; } catch (_) {}
  let origin = "https://passport-xi-five.vercel.app";
  try { if (window.location.origin && /^https?:/.test(window.location.origin)) origin = window.location.origin; } catch (_) {}
  const utm = S(conf.boothQrUtm) || "booth";
  const qrUrl = `${origin}/app?c=${encodeURIComponent(slug)}&utm_campaign=${encodeURIComponent(utm)}`;
  const [qr, setQr] = useState("");
  useEffect(() => { let live = true; QRCode.toString(qrUrl, { type: "svg", errorCorrectionLevel: "H", margin: 0 }).then((s) => { if (live) setQr(s); }).catch(() => {}); return () => { live = false; }; }, [qrUrl]);

  const scrollRef = useRef(null), heroRef = useRef(null);

  // Hero parallax (disabled under reduced-motion).
  useEffect(() => {
    const root = scrollRef.current; if (!root) return;
    let raf = 0;
    const onScroll = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; if (heroRef.current && !reduce) heroRef.current.style.transform = `translate3d(0, ${Math.min(root.scrollTop, 1100) * 0.24}px, 0) scale(1.12)`; }); };
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => { root.removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [reduce]);

  // 45s idle attract-reset — any touch/scroll/move restarts the timer; on expiry, glide to Hero.
  useEffect(() => {
    const root = scrollRef.current; if (!root) return;
    const ms = (Number(conf.kioskIdleTimeout) > 0 ? Number(conf.kioskIdleTimeout) : 45) * 1000;
    let timer;
    const glideTop = () => {
      const start = root.scrollTop; if (start < 2) return;
      const dur = 750; let t0 = null, done = false; const ease = (p) => 1 - Math.pow(1 - p, 3);
      const step = (ts) => { if (done) return; if (t0 == null) t0 = ts; const p = Math.min(1, (ts - t0) / dur); root.scrollTop = start * (1 - ease(p)); if (p < 1) requestAnimationFrame(step); else done = true; };
      requestAnimationFrame(step); setTimeout(() => { if (!done) { done = true; root.scrollTop = 0; } }, dur + 120);
    };
    const reset = () => { clearTimeout(timer); timer = setTimeout(glideTop, ms); };
    const evs = ["touchstart", "pointerdown", "mousedown", "wheel", "scroll", "keydown"];
    evs.forEach((e) => root.addEventListener(e, reset, { passive: true }));
    window.addEventListener("mousemove", reset, { passive: true });
    reset();
    return () => { clearTimeout(timer); evs.forEach((e) => root.removeEventListener(e, reset)); window.removeEventListener("mousemove", reset); };
  }, [conf.kioskIdleTimeout]);

  // ---- data ----
  const hasLogo = S(AVATAR).trim() !== "", hasHero = S(STATUS_IMG).trim() !== "";
  const ex = (Array.isArray(EXCHANGES) ? EXCHANGES : []).filter((e) => e && e.sym);
  const ticker = (ex[0] && S(ex[0].sym)) || S(co.ticker).replace(/^[^:]*:\s*/, "");
  const proj = Object.values(PROJECTS_FULL || {})[0] || {};
  const snapVal = (needle) => { const s = (Array.isArray(proj.snap) ? proj.snap : []).find((x) => new RegExp(needle, "i").test(S(x.label))); return s ? S(s.value) : ""; };
  const flagImg = (Array.isArray(proj.gallery) && proj.gallery[0] && S(proj.gallery[0].src)) || (hasHero ? STATUS_IMG : "");
  const callouts = [
    { k: "Location", v: S(proj.locationFull) || S(co.location) },
    { k: "Jurisdiction", v: S(co.jurisdiction) },
    { k: "Ownership", v: snapVal("ownership") },
    { k: "Land Package", v: snapVal("land") },
  ].filter((c) => S(c.v));

  // Highlights — new master-schema glance strip {value,label,context}; fallback to legacy stats.
  // Honors Blueprint curation: drop deselected (selected === false), and float the ★featured one
  // to the front. Un-curated records have no `selected`, so everything shows as before.
  const highlights = (() => {
    const all = (Array.isArray(conf.highlights) && conf.highlights.length ? conf.highlights
      : Array.isArray(conf.heroHighlightStats) ? conf.heroHighlightStats : [])
      .filter((s) => s && S(s.value) && s.selected !== false);
    const feat = all.find((s) => s.featured);
    return (feat ? [feat, ...all.filter((s) => s !== feat)] : all).slice(0, 6);
  })();

  const ownershipHas = Array.isArray(OWNERSHIP) && OWNERSHIP.length && S(OWNERSHIP[0][1]);
  const fundedLine = S(capStatus.headline);

  // All projects; flagship = conf.featuredProjectKey (else first) + per-project callouts.
  const projects = Object.values(PROJECTS_FULL || {}).filter((p) => p && S(p.name));
  const flagship = projects.find((p) => S(p.key) === S(conf.featuredProjectKey)) || projects[0] || {};
  const snapValFor = (pj, needle) => { const s = (Array.isArray(pj.snap) ? pj.snap : []).find((x) => new RegExp(needle, "i").test(S(x.label))); return s ? S(s.value) : ""; };
  const calloutsFor = (pj) => [
    { k: "Stage", v: S(pj.stageName) },
    { k: "Ownership", v: snapValFor(pj, "ownership") },
    { k: "Deposit", v: snapValFor(pj, "deposit") },
    { k: "Land Package", v: snapValFor(pj, "land") },
    { k: "Location", v: S(pj.locationFull) || S(co.location) },
  ].filter((c) => S(c.v)).slice(0, 5);
  const years = (Array.isArray(PR_YEARS) ? PR_YEARS : []).filter((y) => y && Array.isArray(y.items) && y.items.length);
  // Team, with Blueprint leadership curation applied: conference.leadership
  // { selectedPersonIds, featuredPersonId, custom[] } picks who shows, floats the featured leader
  // first, and appends conference-only leaders. Keyed by a name slug (matches the Blueprint).
  // Un-curated companies (no conference.leadership) show the full shared team, as before.
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
  const investmentCase = (() => {
    const all = (Array.isArray(conf.investmentCase) ? conf.investmentCase : []).filter((r) => r && S(r.reason) && r.selected !== false);
    const feat = all.find((r) => r.featured);
    return feat ? [feat, ...all.filter((r) => r !== feat)] : all;
  })();
  const catalysts = (() => { try { return (window.__PP__ && Array.isArray(window.__PP__.CATALYSTS)) ? window.__PP__.CATALYSTS.filter((c) => c && S(c.label)) : []; } catch (_) { return []; } })();
  // Per-page hero statistic — the one defining phrase for a page (Blueprint: conference.<page>HeroStat).
  // An accent-bar banner rendered just under the section eyebrow. Optional; renders only when set.
  const heroStat = (text, dark = true) => (!S(text) ? null : (
    <Reveal v="head"><div style={{ marginTop: 14, fontSize: "clamp(22px,2.8vw,40px)", fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.08, color: dark ? "#fff" : "#0f172a", borderLeft: `3px solid ${dark ? EM : EM_TEXT}`, paddingLeft: 16, maxWidth: 940 }}>{S(text)}</div></Reveal>
  ));
  // Per-section images (Blueprint: conference.gallery[section] arrays, + legacy conference.images[section]).
  // A responsive grid rendered at the foot of a scene. Optional; renders only when images exist.
  const boothGallery = (sections, dark = true) => {
    const keys = Array.isArray(sections) ? sections : [sections];
    const imgs = [];
    keys.forEach((sec) => {
      const legacy = conf.images && conf.images[sec]; if (S(legacy)) imgs.push(S(legacy));
      const arr = conf.gallery && Array.isArray(conf.gallery[sec]) ? conf.gallery[sec] : [];
      arr.forEach((g) => { const s = S(typeof g === "string" ? g : g && g.src); if (s) imgs.push(s); });
    });
    const uniq = [...new Set(imgs)].slice(0, 6);
    if (!uniq.length) return null;
    const border = dark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(15,23,42,0.1)";
    return (
      <div style={{ display: "grid", gridTemplateColumns: uniq.length === 1 ? "1fr" : "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginTop: 40, maxWidth: 1200 }}>
        {uniq.map((src, i) => (<Reveal key={i} v="card" order={Math.min(i, 3)}><div style={{ borderRadius: 18, overflow: "hidden", border }}><img src={src} alt="" style={{ display: "block", width: "100%", maxHeight: uniq.length === 1 ? "52vh" : "34vh", objectFit: "cover" }} /></div></Reveal>))}
      </div>
    );
  };

  // Featured milestones — look up the profile's timeline entries by date (text reused VERBATIM).
  const featuredMilestones = (() => {
    const all = years.flatMap((y) => (Array.isArray(y.items) ? y.items : []).map((it) => ({ ...it, year: y.year })));
    const want = new Set((Array.isArray(conf.featuredMilestoneDates) ? conf.featuredMilestoneDates : []).map(S));
    let sel = want.size ? all.filter((it) => want.has(S(it.id)) || want.has(S(it.d))) : all.filter((it) => it.key);
    if (!sel.length) sel = all;
    return sel.slice().sort((a, b) => S(a.id).localeCompare(S(b.id))).slice(0, 8);
  })();

  // Stage-adaptive Results: which technical block of the flagship to feature.
  const stageMap = { exploration: "resource", development: "economics", production: "production", royalty: "royalty" };
  const evType = (S(conf.evidenceType) === "drill_results" ? "resource" : S(conf.evidenceType)) || stageMap[S(co.stage).toLowerCase()] || "resource";
  const deriveGrade = () => {
    for (const p of Object.values(PROJECTS_FULL || {})) {
      const card = (Array.isArray(p.cards) ? p.cards : []).find((c) => c.kind === "drills" && Array.isArray(c.rows) && c.rows.length);
      if (card) { const r = card.rows[0]; return { grade: S(r.grade), width: S(r.interval), location: S(p.name), context: S(r.note) }; }
    }
    return null;
  };

  // ---- Sticky section nav (ported from the editorial board): centered scroll-spy bar with a
  // smooth manual scroll. Only sections with data become nav targets (tagged via data-sec). ----
  const NAV_H = 60;
  const capHasData = S(co.cash) || S(cap.outstanding) || S(cap.fd) || S(co.marketCap || cap.marketCap) || ownershipHas;
  const leadHasData = team.length || (Array.isArray(conf.leadership) && conf.leadership.length);
  const NAV = [
    { id: "overview", label: "Overview" },
    projects.length > 0 && { id: "projects", label: "Projects" },
    false && { id: "timeline", label: "Timeline" },   // Timeline removed from Conference Mode (app-only)
    capHasData && { id: "capital", label: "Capital" },
    leadHasData && { id: "leadership", label: "Leadership" },
    { id: "follow", label: "Follow" },
  ].filter(Boolean);
  const [active, setActive] = useState("overview");
  const animateTo = (target) => {
    const root = scrollRef.current; if (!root) return;
    target = Math.max(0, Math.min(target, root.scrollHeight - root.clientHeight));
    const start = root.scrollTop, dist = target - start; if (Math.abs(dist) < 2) return;
    const dur = 480; let t0 = null, done = false; const ease = (p) => 1 - Math.pow(1 - p, 3);
    const step = (ts) => { if (done) return; if (t0 == null) t0 = ts; const p = Math.min(1, (ts - t0) / dur); root.scrollTop = start + dist * ease(p); if (p < 1) requestAnimationFrame(step); else done = true; };
    requestAnimationFrame(step);
    setTimeout(() => { if (!done) { done = true; root.scrollTop = target; } }, dur + 90);
  };
  const go = (id) => { const root = scrollRef.current; if (!root) return; if (id === "overview") return animateTo(0); const el = root.querySelector(`[data-sec="${id}"]`); if (el) animateTo(el.offsetTop - NAV_H); };
  const scrollToEl = (el, pad = 14) => { const root = scrollRef.current; if (!root || !el) return; const ct = root.getBoundingClientRect().top, et = el.getBoundingClientRect().top; animateTo(root.scrollTop + (et - ct) - NAV_H - pad); };
  useEffect(() => {
    const root = scrollRef.current; if (!root) return;
    const onScroll = () => {
      const y = root.scrollTop + NAV_H + 40; let cur = NAV[0] && NAV[0].id;
      for (const nn of NAV) { const el = root.querySelector(`[data-sec="${nn.id}"]`); if (el && el.offsetTop <= y) cur = nn.id; }
      if (root.scrollTop + root.clientHeight >= root.scrollHeight - 4) cur = NAV[NAV.length - 1].id;
      setActive(cur);
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll); onScroll();
    return () => { root.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); };
  }, [NAV.length]);

  // ---- SCENES — the storyboard (each null when data missing → skipped) ----
  const scenes = [];

  // ACT I · Scene 1 — HERO. Premium sequenced entrance: the hero image fades in, then the
  // logo → name → slogan → tickers (each individually) blur-and-rise into place. Fully
  // data-driven — drops back to a brand-gradient when no hero image/logo is set yet, and
  // hydrates the moment you upload them (brand.hero / brand.logo). Reduced-motion → static.
  {
    const tEnd = 1.2 + ex.length * 0.16;             // when the last ticker has landed
    const rise = (delay) => ({ animationName: "confHeroRise", animationDuration: "0.9s", animationTimingFunction: CONF_EASE, animationFillMode: "both", animationDelay: `${delay}s`, willChange: "opacity, filter, transform" });
    scenes.push(
      <div key="hero" data-sec="overview" style={{ position: "relative", height: "100vh", minHeight: 640, overflow: "hidden", background: "#05070d", scrollSnapAlign: "start" }}>
        <style>{`
          @keyframes confHeroRise { from { opacity: 0; filter: blur(16px); transform: translateY(24px); } to { opacity: 1; filter: blur(0); transform: translateY(0); } }
          @keyframes confHeroBg { from { opacity: 0; transform: scale(1.06); } to { opacity: 1; transform: scale(1); } }
          .conf-hero-bg { animation: confHeroBg 2.4s cubic-bezier(.2,.6,.2,1) both; }
          @media (prefers-reduced-motion: reduce) {
            .conf-hero-bg { animation: none; opacity: 1; transform: none; }
            [data-hero-rise] { animation: none !important; opacity: 1 !important; filter: none !important; transform: none !important; }
          }
        `}</style>
        {/* Entrance fade + settle lives on this wrapper so it never fights the scroll parallax,
            which drives the inner element's own transform. */}
        <div className="conf-hero-bg" style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
          {S(conf.heroVideo)
            ? <video ref={heroRef} src={S(conf.heroVideo)} autoPlay muted loop playsInline style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transform: "scale(1.12)" }} />
            : hasHero
              ? <img ref={heroRef} src={STATUS_IMG} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transform: "scale(1.12)" }} />
              : <div ref={heroRef} style={{ position: "absolute", inset: 0, background: `radial-gradient(1200px 700px at 70% -10%, ${EM}44, transparent), linear-gradient(135deg, ${EM}, #05070d)`, transform: "scale(1.12)" }} />}
        </div>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(2,6,23,0.34) 0%, rgba(2,6,23,0.04) 34%, rgba(2,6,23,0.88) 100%)" }} />
        <div style={{ position: "absolute", left: 0, right: 0, bottom: "12vh" }}>
          <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 56px", color: "#fff" }}>
            {hasLogo && <img data-hero-rise src={AVATAR} alt="" style={{ height: 96, width: 96, borderRadius: 22, objectFit: "cover", boxShadow: "0 18px 50px rgba(0,0,0,0.5)", ...rise(0.4) }} />}
            <div data-hero-rise style={{ fontSize: "clamp(56px,8vw,104px)", fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 0.96, marginTop: 16, ...rise(0.62) }}>{S(co.name) || "Company Name"}</div>
            {S(co.slogan) && <div data-hero-rise style={{ fontSize: "clamp(20px,2.4vw,30px)", fontWeight: 600, opacity: 0.92, marginTop: 16, ...rise(0.92) }}>{S(co.slogan)}</div>}
            {ex.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 22 }}>
                {ex.map((e, i) => (
                  <span key={i} data-hero-rise style={{ display: "inline-flex", alignItems: "center", fontSize: 13.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "#fff", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 999, padding: "7px 15px", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", ...rise(1.2 + i * 0.16) }}>{e.ex}: {e.sym}</span>
                ))}
              </div>
            )}
            {S(st.state) && <div data-hero-rise style={{ marginTop: 24, display: "inline-flex", alignItems: "center", gap: 12, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 999, padding: "11px 22px", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", ...rise(tEnd + 0.15) }}><span style={{ height: 9, width: 9, borderRadius: 99, background: EM, boxShadow: `0 0 0 4px ${EM}44` }} /><span style={{ fontSize: 16, fontWeight: 700 }}>{S(st.state)}</span></div>}
            {conf.heroStatistic && S(conf.heroStatistic.value) && (
              <div data-hero-rise style={{ marginTop: 26, ...rise(tEnd + 0.32) }}>
                <div style={{ fontSize: "clamp(30px,4.2vw,54px)", fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 1 }}>{S(conf.heroStatistic.value)}</div>
                {(S(conf.heroStatistic.label) || S(conf.heroStatistic.context)) && <div style={{ fontSize: 14.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.82, marginTop: 9 }}>{[S(conf.heroStatistic.label), S(conf.heroStatistic.context)].filter(Boolean).join("  ·  ")}</div>}
              </div>
            )}
          </div>
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 28, display: "flex", justifyContent: "center" }}>
          <div data-hero-rise style={{ color: "rgba(255,255,255,0.6)", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, ...rise(2.3) }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.2em" }}>Scroll</span><ChevronDown size={18} />
          </div>
        </div>
      </div>
    );
  }

  // SECTION 1 — COMPANY OVERVIEW. Black scene. Top: headline (clip reveal) + overview paragraph
  // on the left, a supporting image on the right. Bottom: the key facts as a row of widgets.
  if (S(conf.overview) || S(conf.hook) || S(conf.macroContext) || S(conf.mission)) {
    const headline = S(conf.hook) || S(co.name);   // the slogan field can be a full paragraph — use the short hook
    const ovW = conf.overviewWidgets || {};
    const ov = (k, auto) => S(ovW[k]) || auto;
    const facts = [
      { k: "Headquarters", v: ov("headquarters", S(co.headquarters) || S(co.location)) },
      { k: "Jurisdiction", v: ov("jurisdiction", S(co.jurisdiction)) },
      { k: "Assets", v: ov("assets", projects.length ? String(projects.length) : "") },
      { k: "Flagship Project", v: ov("flagship", S(flagship.name)) },
      { k: "Commodity", v: ov("commodity", S(co.commodity)) },
      { k: "Company Stage", v: ov("stage", S(co.stage)) },
      { k: "Current Activity", v: ov("currentActivity", S(conf.currentActivity)) },
    ].filter((f) => S(f.v));
    const ovImg = (() => {
      const g = (conf.gallery && (conf.gallery.overview || conf.gallery.company)) || [];
      const first = Array.isArray(g) && g[0];
      return (first ? S(typeof first === "string" ? first : first && first.src) : "") || S(STATUS_IMG);
    })();
    scenes.push(
      <SceneShell key="company" bg="#000000" color="#fff">
        <div style={{ display: "flex", flexDirection: "column", gap: "clamp(30px,4vw,52px)" }}>
          <div style={{ display: "grid", gridTemplateColumns: ovImg ? "minmax(0,1.08fr) minmax(0,0.92fr)" : "1fr", gap: "clamp(32px,5vw,64px)", alignItems: "center" }}>
            <div>
              <Reveal v="eyebrow"><div style={sceneEyebrow(EM)}>Company</div></Reveal>
              {S(headline) && <Reveal v="head"><div style={{ fontSize: "clamp(32px,4.4vw,62px)", fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.04, marginTop: 14 }}>{headline}</div></Reveal>}
              {S(conf.overview) && <Reveal v="body" order={1}><div style={{ fontSize: "clamp(17px,1.9vw,23px)", fontWeight: 500, letterSpacing: "-0.01em", lineHeight: 1.6, marginTop: 22, color: "#c9d3df", maxWidth: 620 }}>{S(conf.overview)}</div></Reveal>}
            </div>
            {ovImg && (
              <Reveal v="media"><div style={{ borderRadius: 22, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 30px 70px -44px rgba(0,0,0,0.8)" }}>
                <img src={ovImg} alt="" style={{ display: "block", width: "100%", height: "auto", maxHeight: "48vh", objectFit: "cover" }} />
              </div></Reveal>
            )}
          </div>
          {facts.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
              {facts.map((f, i) => (
                <Reveal key={i} v="card" order={i}>
                  <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: "15px 17px", height: "100%" }}>
                    <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.5)" }}>{f.k}</div>
                    <div style={{ fontSize: "clamp(15px,1.4vw,19px)", fontWeight: 800, marginTop: 7, color: "#fff", lineHeight: 1.25, textTransform: f.k === "Company Stage" ? "capitalize" : "none" }}>{S(f.v)}</div>
                  </div>
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </SceneShell>
    );
  }

  // SECTION 3 — AT A GLANCE (bird's-eye highlights across every aspect, before the deep dive)
  if (highlights.length) scenes.push(
    <SceneShell key="glance" bg="#000000" color="#fff">
      <Reveal v="eyebrow"><div style={sceneEyebrow(EM)}>At a Glance</div></Reveal>
      {S(conf.hook) && <Reveal v="head"><div style={{ fontSize: "clamp(28px,3.6vw,50px)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.12, marginTop: 14, maxWidth: 1000 }}>{S(conf.hook)}</div></Reveal>}
      {S(conf.highlightsIntro) && <Reveal v="body" order={1}><div style={{ fontSize: "clamp(16px,1.9vw,22px)", color: "#93a0b0", marginTop: 16, maxWidth: 920, lineHeight: 1.5 }}>{S(conf.highlightsIntro)}</div></Reveal>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 20, marginTop: 44 }}>
        {highlights.map((s, i) => (
          <Reveal key={i} v="card" order={Math.min(i, 5)}><div style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 26, padding: "clamp(26px,2.6vw,38px)", height: "100%" }}>
            <div style={{ fontSize: "clamp(26px,2.8vw,42px)", fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.06, overflowWrap: "break-word", wordBreak: "normal" }}><CountUp value={S(s.value)} /></div>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: "#9aa4b2", marginTop: 14, textTransform: "uppercase", letterSpacing: "0.08em" }}>{S(s.label)}</div>
            {S(s.context) && <div style={{ fontSize: 14, color: "#7c8a9c", marginTop: 9, lineHeight: 1.4 }}>{S(s.context)}</div>}
          </div></Reveal>
        ))}
      </div>
      {boothGallery("highlights")}
    </SceneShell>
  );

  // SECTION 3 — JURISDICTION (why here: location → district context → regional geology → infrastructure)
  {
    const infra = flagship.infrastructure || {};
    const regionBody = S(conf.region) || S(infra.notes) || (Array.isArray(flagship.narrative) ? S(flagship.narrative[0]) : "");
    const jurAuto = {
      provinceState: S(co.jurisdiction),
      infrastructure: [S(infra.road) && "Road", S(infra.power) && "Power", S(infra.water) && "Water"].filter(Boolean).join(" · "),
    };
    const jurCurated = !!(conf.jurisdictionWidgets || conf.jurisdictionWidgetKeys);
    const jurPool = jurCurated ? resolveWidgets("jurisdiction", jurAuto, conf).slice(0, 8) : [];
    const infraFacts = (jurPool.length ? jurPool.map((w) => ({ k: w.label, v: widgetText(w.value) })) : [
      { k: "Jurisdiction", v: S(co.jurisdiction) },
      { k: "Access", v: S(infra.road) },
      { k: "Power", v: S(infra.power) },
      { k: "Water", v: S(infra.water) },
    ]).filter((f) => S(f.v));
    if (S(regionBody) || S(conf.districtContext) || S(conf.regionalGeology) || infraFacts.length) scenes.push(
      <SceneShell key="jurisdiction" bg="#0b1220" color="#fff">
        <Reveal v="eyebrow"><div style={sceneEyebrow(EM)}>Jurisdiction</div></Reveal>
        {heroStat(conf.jurisdictionHeroStat)}
        <Reveal v="head"><div style={{ fontSize: "clamp(30px,4vw,58px)", fontWeight: 800, letterSpacing: "-0.03em", marginTop: 14 }}>{S(co.jurisdiction) || "The District"}</div></Reveal>
        {S(regionBody) && <Reveal v="body" order={1}><div style={{ fontSize: "clamp(17px,1.9vw,23px)", fontWeight: 500, lineHeight: 1.5, color: "#dbe2ec", marginTop: 22, maxWidth: 1000 }}>{S(regionBody)}</div></Reveal>}
        {S(conf.districtContext) && <Reveal v="body" order={2}><div style={{ fontSize: 15.5, color: "#93a0b0", marginTop: 18, maxWidth: 980, lineHeight: 1.55 }}><b style={{ color: EM }}>District — </b>{S(conf.districtContext)}</div></Reveal>}
        {S(conf.regionalGeology) && <Reveal v="body" order={3}><div style={{ fontSize: 15.5, color: "#93a0b0", marginTop: 14, maxWidth: 980, lineHeight: 1.55 }}><b style={{ color: EM }}>Regional geology — </b>{S(conf.regionalGeology)}</div></Reveal>}
        {boothGallery("jurisdiction")}
        {infraFacts.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginTop: 40 }}>
            {infraFacts.map((f, i) => (
              <Reveal key={i} v="card" order={Math.min(i, 3)}><div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 18, padding: "18px 20px", height: "100%" }}>
                <div style={{ fontSize: 11.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: EM }}>{f.k}</div>
                <div style={{ fontSize: 15, fontWeight: 600, marginTop: 8, color: "#dbe2ec", lineHeight: 1.4 }}>{S(f.v)}</div>
              </div></Reveal>
            ))}
          </div>
        )}
      </SceneShell>
    );
  }

  // SECTION 4 — ASSETS (each project as a swipeable narrative + facts; flagship first, then the rest)
  {
    const ordered = [flagship, ...projects.filter((p) => p !== flagship)].filter((p) => p && S(p.name));
    // Portfolio Overview — a single "at a glance" page for multi-asset companies, so investors
    // see the whole portfolio before the per-project narratives. Carries the "projects" nav anchor.
    const multi = ordered.length > 1;
    if (multi) scenes.push(
      <SceneShell key="portfolio" bg="#0b1220" color="#fff" id="projects">
        <Reveal v="eyebrow"><div style={sceneEyebrow(EM)}>Portfolio</div></Reveal>
        {heroStat(conf.portfolioHeroStat)}
        <Reveal v="head"><div style={{ fontSize: "clamp(30px,4vw,58px)", fontWeight: 800, letterSpacing: "-0.03em", marginTop: 14 }}>{S(conf.portfolioTitle) || `${ordered.length} Projects`}</div></Reveal>
        {S(conf.portfolioOverview) && <Reveal v="body" order={1}><div style={{ fontSize: "clamp(17px,1.9vw,23px)", fontWeight: 500, lineHeight: 1.5, color: "#dbe2ec", marginTop: 22, maxWidth: 1000 }}>{S(conf.portfolioOverview)}</div></Reveal>}
        {(() => {
          const pfAuto = {
            flagship: S(flagship.name), numProjects: String(ordered.length), commodity: S(co.commodity),
            stage: S(co.stage), ownership: snapValFor(flagship, "ownership"), landPackage: snapValFor(flagship, "land"),
            jurisdiction: S(co.jurisdiction), activePrograms: S(conf.currentActivity),
          };
          const pf = (conf.portfolioWidgets || conf.portfolioWidgetKeys) ? resolveWidgets("portfolio", pfAuto, conf).slice(0, 8) : [];
          return pf.length ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginTop: 36 }}>
              {pf.map((w, i) => (
                <Reveal key={w.key} v="card" order={Math.min(i, 4)}><div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: "14px 16px" }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: EM }}>{w.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, marginTop: 6, color: "#e6ebf2", lineHeight: 1.35 }}>{widgetText(w.value)}</div>
                </div></Reveal>
              ))}
            </div>
          ) : null;
        })()}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18, marginTop: 40 }}>
          {ordered.map((pj, pi) => {
            const cs = calloutsFor(pj);
            const stage = cs.find((c) => c.k === "Stage");
            const loc = cs.find((c) => c.k === "Location");
            const stat = cs.find((c) => c.k === "Deposit" || c.k === "Land Package" || c.k === "Ownership");
            return (
              <Reveal key={S(pj.key) || pi} v="card" order={Math.min(pi, 3)}>
                <div style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${pi === 0 ? EM + "66" : "rgba(255,255,255,0.1)"}`, borderRadius: 20, padding: "22px 24px", height: "100%" }}>
                  {pi === 0 && <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: EM, marginBottom: 8 }}>Flagship</div>}
                  <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.1 }}>{S(pj.name)}</div>
                  {stage && <div style={{ fontSize: 14, fontWeight: 700, color: EM, marginTop: 8 }}>{S(stage.v)}</div>}
                  {loc && <div style={{ fontSize: 14, color: "#93a0b0", marginTop: 6 }}>{S(loc.v)}</div>}
                  {stat && <div style={{ fontSize: 13.5, color: "#c4cdd9", marginTop: 12, lineHeight: 1.4 }}><b style={{ color: "#dbe2ec" }}>{stat.k}: </b>{S(stat.v)}</div>}
                </div>
              </Reveal>
            );
          })}
        </div>
      </SceneShell>
    );
    ordered.forEach((pj, pi) => scenes.push(
      <SceneProjectStory
        key={"asset-" + (S(pj.key) || pi)}
        project={pj}
        label={pi === 0 ? "Flagship Project" : `Asset · ${pi + 1} of ${ordered.length}`}
        calloutsFor={calloutsFor}
        fallbackImg={hasHero ? STATUS_IMG : ""}
        id={(!multi && pi === 0) ? "projects" : undefined}
        conf={conf}
      />
    ));
  }

  // SECTION 4 — RESULTS & TECHNICAL EVIDENCE (context paragraph → stage-adaptive proof)
  {
    const res = flagship.resource || {}, eco = flagship.economics || {}, prod = flagship.production || {}, met = flagship.metallurgy || {};
    // Selected drill intercepts (hole · interval · grade) — the core proof for a driller.
    const drillRows = (flagship.drillResults && Array.isArray(flagship.drillResults.rows) ? flagship.drillResults.rows : [])
      .filter((r) => r && (S(r.grade) || S(r.interval) || S(r.hole))).slice(0, 8);
    let items = [], title = "Results & Evidence";
    if (evType === "economics" && (S(eco.npv) || S(eco.irr))) {
      title = "Project Economics";
      items = [["NPV", eco.npv], ["IRR", eco.irr], ["Initial Capex", eco.capex], ["Payback", eco.payback], ["Mine Life", eco.mineLife], ["AISC", eco.aisc]];
    } else if (evType === "production" && (S(prod.annualOutput) || S(prod.aisc))) {
      title = "Production & Cash Flow";
      items = [["Annual Output", prod.annualOutput], ["AISC", prod.aisc], ["Free Cash Flow", prod.freeCashFlow], ["Reserve Life", prod.reserveLife]];
    } else if (S(res.containedMetal) || S(res.grade)) {
      title = "Mineral Resource";
      items = [["Contained Metal", res.containedMetal], ["Grade", res.grade], ["Tonnes", res.tonnes], ["Category", res.category], ["Cut-off", res.cutoff]];
    }
    items = items.map(([l, v]) => ({ l, v: S(v) })).filter((x) => x.v);
    const g = (!items.length && conf.featuredGrade && S(conf.featuredGrade.grade)) ? conf.featuredGrade : (!items.length ? deriveGrade() : null);
    if (items.length || (g && S(g.grade)) || drillRows.length) scenes.push(
      <SceneShell key="results" bg="#05070d" color="#fff">
        <Reveal v="eyebrow"><div style={sceneEyebrow(EM)}>{drillRows.length && !items.length ? "Drill Results" : title}</div></Reveal>
        {heroStat(conf.resultsHeroStat)}
        {S(conf.resultsIntro) && <Reveal v="head"><div style={{ fontSize: "clamp(22px,2.6vw,34px)", fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.4, maxWidth: 1000, marginTop: 16, color: "#dbe2ec" }}>{S(conf.resultsIntro)}</div></Reveal>}
        {Array.isArray(conf.resultsWidgetKeys) && conf.resultsWidgetKeys.length > 0 && (() => {
          // Curated results badges — only when the reviewer explicitly picked widgets (the scene
          // below already carries the technical proof, so this stays opt-in to avoid duplication).
          const rAuto = {
            bestResult: drillRows[0] ? [S(drillRows[0].hole), S(drillRows[0].interval), S(drillRows[0].grade)].filter(Boolean).join(" · ") : "",
            widestInterval: S(drillRows[0] && drillRows[0].interval),
            currentProgram: S((flagship.drilling || {}).program) || S(conf.currentActivity),
            drillingStatus: S((flagship.drilling || {}).phase),
            holesCompleted: S((flagship.drilling || {}).holesCompleted),
            assaysPending: S((flagship.drilling || {}).assaysPending),
            resourceStatus: S(res.category),
          };
          const rp = resolveWidgets("results", rAuto, conf).slice(0, 6);
          return rp.length ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14, marginTop: 32 }}>
              {rp.map((w, i) => (
                <Reveal key={w.key} v="card" order={Math.min(i, 4)}><div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: "14px 16px" }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: EM }}>{w.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, marginTop: 6, color: "#e6ebf2", lineHeight: 1.35 }}>{widgetText(w.value)}</div>
                </div></Reveal>
              ))}
            </div>
          ) : null;
        })()}
        {(() => {
          const d = flagship.drilling || {};
          const ds = [
            { l: "Program", v: S(d.program) }, { l: "Phase", v: S(d.phase) },
            { l: "Holes completed", v: S(d.holesCompleted) }, { l: "Metres drilled", v: S(d.metresDrilled) },
            { l: "Assays pending", v: S(d.assaysPending) }, { l: "Hit rate", v: S(d.hitRate) },
          ].filter((x) => x.v);
          return ds.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "24px 40px", marginTop: 32 }}>
              {ds.map((x, i) => (
                <Reveal key={i} v="card" order={Math.min(i, 4)} style={{ minWidth: 0 }}><div style={{ minWidth: 0 }}><div style={{ fontSize: "clamp(22px,2.4vw,34px)", fontWeight: 900, letterSpacing: "-0.02em", overflowWrap: "break-word", wordBreak: "normal" }}><CountUp value={x.v} /></div><div style={{ fontSize: 12, fontWeight: 700, color: "#93a0b0", marginTop: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>{x.l}</div></div></Reveal>
              ))}
            </div>
          ) : null;
        })()}
        {items.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 26, marginTop: 44 }}>
            {items.map((it, i) => (
              <Reveal key={i} v="card" order={Math.min(i, 4)} style={{ minWidth: 0 }}><div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "clamp(26px,3vw,44px)", fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.05, overflowWrap: "break-word", wordBreak: "normal" }}><CountUp value={it.v} /></div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "#93a0b0", marginTop: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>{it.l}</div>
              </div></Reveal>
            ))}
          </div>
        ) : (g && !drillRows.length && (
          <div style={{ marginTop: 30 }}>
            <Reveal v="head"><div style={{ fontSize: "clamp(48px,9vw,130px)", fontWeight: 900, letterSpacing: "-0.05em", lineHeight: 0.92 }}><CountUp value={S(g.grade)} /></div></Reveal>
            {S(g.width) && <Reveal v="body" order={1}><div style={{ fontSize: "clamp(22px,2.6vw,36px)", fontWeight: 700, color: "#c4cdd9", marginTop: 10 }}>{S(g.width)}</div></Reveal>}
            {(S(g.location) || S(g.context)) && <Reveal v="body" order={2}><div style={{ fontSize: 16, color: "#93a0b0", marginTop: 18, fontWeight: 600 }}>{[S(g.location), S(g.context)].filter(Boolean).join(" · ")}</div></Reveal>}
          </div>
        ))}
        {drillRows.length > 0 && (
          <div style={{ marginTop: 44 }}>
            <Reveal v="eyebrow"><div style={{ fontSize: 12.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: EM, marginBottom: 16 }}>Selected drill intercepts</div></Reveal>
            <div style={{ display: "grid", gap: 10, maxWidth: 1040 }}>
              {drillRows.map((r, i) => (
                <Reveal key={i} v="card" order={Math.min(i, 4)}><div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "6px 22px", padding: "15px 20px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16 }}>
                  {S(r.hole) && <span style={{ fontFamily: "ui-monospace,monospace", fontSize: 15, fontWeight: 800, color: "#dbe2ec", minWidth: 110 }}>{S(r.hole)}</span>}
                  {S(r.interval) && <span style={{ fontSize: 15.5, color: "#93a0b0" }}>{S(r.interval)}</span>}
                  {S(r.grade) && <span style={{ fontSize: 18, fontWeight: 900, color: "#fff", marginLeft: "auto" }}>{S(r.grade)}</span>}
                </div></Reveal>
              ))}
            </div>
          </div>
        )}
        {boothGallery("results")}
        {S(met.testwork) && <Reveal v="body" order={3}><div style={{ marginTop: 34, fontSize: 15, color: "#8493a8", maxWidth: 940, lineHeight: 1.5 }}><b style={{ color: "#c4cdd9" }}>Metallurgy: </b>{S(met.testwork)}</div></Reveal>}
      </SceneShell>
    );
  }

  // SECTION 6 — TIMELINE (board-style: chapter mark + "A company that keeps moving" + the
  // accordion BoothTimeline. Not snap-aligned + top-justified so the accordion can grow and
  // scroll naturally within the section.)
  // Timeline is intentionally REMOVED from Conference Mode (spec) — the full timeline is
  // exclusive to the Passport app. Data (PR_YEARS / timeline[]) + the app's timeline tab are
  // untouched; only this booth scene is suppressed. `false &&` keeps the code for reference.
  if (false && years.length) scenes.push(
    <SceneShell key="timeline" id="timeline" bg="#0a0f1c" color="#fff" style={{ justifyContent: "flex-start", scrollSnapAlign: "none" }}>
      <Reveal><ChapterMark n="05" label="How it has progressed" dark /></Reveal>
      <Reveal v="head"><div style={{ fontSize: "clamp(34px,4.6vw,56px)", fontWeight: 900, letterSpacing: "-0.035em", lineHeight: 1.04, marginTop: 22, maxWidth: 820 }}>A company that keeps moving</div></Reveal>
      <Reveal v="body" order={1}><div style={{ fontSize: "clamp(17px,2vw,21px)", color: "#93a0b0", marginTop: 18, maxWidth: 660, lineHeight: 1.5 }}>{S(conf.timelineIntro) || "Every milestone below moved the story forward — not just another release."}</div></Reveal>
      <BoothTimeline years={years} scrollToEl={scrollToEl} dark />
    </SceneShell>
  );

  // SECTION 6 — CAPITAL DETAILS & FINANCIAL STRENGTH
  {
    // Capital widget pool (Blueprint-curated). Short numeric values become the big hero-number
    // cells; longer text values (funding status, latest financing) render as a compact badge row
    // so the giant nowrap number style never overflows. Falls back to the legacy cells when the
    // company has no conference capital data yet.
    const capAuto = {
      fundingStatus: fundedLine || S(capStatus.label),
      cash: S(co.cash),
      workingCapital: S(cap.workingCapital),
      latestFinancing: Array.isArray(cap.financing) ? "" : S(cap.financing),
      shares: S(cap.outstanding),
      fd: S(cap.fd),
      ownership: S(cap.ownership),
      warrants: S(cap.warrants),
      options: S(cap.options),
      debt: S(cap.debt),
      balanceSheetDate: S(cap.reportingDate),
    };
    const capCurated = !!(conf.capitalWidgets || conf.capitalWidgetKeys);
    const capPool = capCurated ? resolveWidgets("capital", capAuto, conf) : [];
    const capShort = (v) => { const s = widgetText(v); return s.length <= 16 && /\d/.test(s); };
    const legacyCells = [
      S(co.cash) && { v: S(co.cash), l: fundedLine || "Treasury" },
      S(cap.outstanding) && { v: S(cap.outstanding), l: "Shares Outstanding" },
      S(cap.fd) && { v: S(cap.fd), l: "Fully Diluted" },
      S(co.marketCap || cap.marketCap) && { v: S(co.marketCap || cap.marketCap), l: "Market Cap" },
    ].filter(Boolean);
    const capCells = (capPool.length ? capPool.filter((w) => capShort(w.value)).map((w) => ({ v: widgetText(w.value), l: w.label })) : legacyCells).slice(0, 4);
    // Longer text badges — skip strategicInvestors (rendered by the partnerships block below).
    const capBadges = capPool.filter((w) => !capShort(w.value) && w.key !== "strategicInvestors").map((w) => ({ k: w.label, v: widgetText(w.value) })).slice(0, 6);
    if (capCells.length || capBadges.length || ownershipHas || S(conf.capitalIntro)) scenes.push(
      <SceneShell key="capital" id="capital" bg="#05070d" color="#fff">
        <Reveal v="eyebrow"><div style={sceneEyebrow(EM)}>Capital</div></Reveal>
        {heroStat(conf.capitalHeroStat)}
        {S(conf.capitalIntro) && <Reveal v="head"><div style={{ fontSize: "clamp(22px,2.6vw,34px)", fontWeight: 500, lineHeight: 1.4, maxWidth: 1000, marginTop: 16, color: "#dbe2ec" }}>{S(conf.capitalIntro)}</div></Reveal>}
        {capCells.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 28, marginTop: 44 }}>
            {capCells.map((it, i) => (
              <Reveal key={i} v="card" order={Math.min(i, 3)}><div>
                <div style={{ fontSize: "clamp(30px,3.6vw,52px)", fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.02, whiteSpace: "nowrap" }}><CountUp value={it.v} /></div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#93a0b0", marginTop: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>{it.l}</div>
              </div></Reveal>
            ))}
          </div>
        )}
        {capBadges.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginTop: capCells.length ? 28 : 44 }}>
            {capBadges.map((f, i) => (
              <Reveal key={i} v="card" order={Math.min(i, 3)}><div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: "16px 18px", height: "100%" }}>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: EM }}>{f.k}</div>
                <div style={{ fontSize: 15.5, fontWeight: 700, marginTop: 7, color: "#e6ebf2", lineHeight: 1.4 }}>{f.v}</div>
              </div></Reveal>
            ))}
          </div>
        )}
        {ownershipHas && <Reveal v="body" order={3}><div style={{ marginTop: 46 }}><div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.14em", color: "#93a0b0", marginBottom: 18 }}>Backing & Ownership</div><OwnershipBar rows={OWNERSHIP} dark /></div></Reveal>}
        {(() => {
          const parts = (Array.isArray(conf.strategicPartnerships) ? conf.strategicPartnerships : []).map(S).filter(Boolean);
          return parts.length ? (
            <div style={{ marginTop: 44 }}>
              <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.14em", color: "#93a0b0", marginBottom: 14 }}>Strategic partnerships</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                {parts.map((pp, i) => (<Reveal key={i} v="card" order={Math.min(i, 4)}><span style={{ display: "inline-block", fontSize: 15, fontWeight: 600, color: "#dbe2ec", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: "12px 18px" }}>{pp}</span></Reveal>))}
              </div>
            </div>
          ) : null;
        })()}
        {boothGallery("capital")}
      </SceneShell>
    );
  }

  // SECTION 8 — LEADERSHIP (board-style: warm light section, CEO featured card + team grid).
  // Falls back to the dark track-record cards for companies with conference.leadership but no
  // team headshots/bios. Top-justified + non-snap so the grid can grow.
  {
    const leaders = (Array.isArray(conf.leadership) ? conf.leadership : []).filter((l) => l && S(l.name));
    const photoFor = (name) => { const m = team.find((t) => S(t.name).toLowerCase() === S(name).toLowerCase()); return m ? S(m.photo) : ""; };
    if (team.length) scenes.push(
      <SceneShell key="leadership" id="leadership" bg="#faf7f3" color="#0f172a" style={{ justifyContent: "flex-start", scrollSnapAlign: "none" }}>
        <Reveal><ChapterMark n="06" label="Who is behind it" /></Reveal>
        <Reveal><div style={{ fontSize: "clamp(34px,4.6vw,48px)", fontWeight: 900, letterSpacing: "-0.038em", marginTop: 22, maxWidth: 760, lineHeight: 1.06 }}>Meet the people creating value</div></Reveal>
        {heroStat((conf.leadership && (S(conf.leadership.heroStatistic) || S(conf.leadership.headline))) || "", false)}
        {(() => {
          const ceo = team[0]; if (!ceo) return null;
          const mono = S(ceo.initials || (ceo.name || "").split(/\s+/).slice(0, 2).map((w) => w[0]).join(""));
          const bio = S(ceo.full) || S(ceo.short);
          return (
            <Reveal v="card"><div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 48, alignItems: "start", marginTop: 48, background: "#fff", borderRadius: 30, padding: 40, boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 46px 84px -52px rgba(15,23,42,0.5)" }}>
              <div style={{ height: 300, width: 300, borderRadius: 24, overflow: "hidden", background: `linear-gradient(150deg, ${EM}2e, ${EM}0a)`, display: "grid", placeItems: "center", color: EM_TEXT, fontWeight: 900, fontSize: 88 }}>{ceo.photo ? <img src={ceo.photo} alt="" style={{ height: "100%", width: "100%", objectFit: "cover" }} /> : mono}</div>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.16em", color: EM_TEXT }}>Leading the company</div>
                <div style={{ fontSize: 40, fontWeight: 900, letterSpacing: "-0.03em", marginTop: 10, lineHeight: 1.02 }}>{S(ceo.name)}</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: EM_TEXT, marginTop: 5 }}>{S(ceo.role)}</div>
                {bio && <div style={{ fontSize: 17, color: "#475569", marginTop: 20, lineHeight: 1.7, maxWidth: 720 }}>{bio}</div>}
              </div>
            </div></Reveal>
          );
        })()}
        {team.length > 1 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(400px, 1fr))", gap: 30, marginTop: 30 }}>
            {team.slice(1).map((m, i) => {
              const mono = S(m.initials || (m.name || "").split(/\s+/).slice(0, 2).map((w) => w[0]).join(""));
              return (
                <Reveal key={i} v="card"><div style={{ display: "flex", gap: 22, background: "#fff", borderRadius: 24, padding: 24, height: "100%", boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 30px 60px -46px rgba(15,23,42,0.4)" }}>
                  <div style={{ height: 108, width: 108, flexShrink: 0, borderRadius: 20, overflow: "hidden", background: `linear-gradient(150deg, ${EM}22, ${EM}08)`, display: "grid", placeItems: "center", color: EM_TEXT, fontWeight: 900, fontSize: 34 }}>{m.photo ? <img src={m.photo} alt="" style={{ height: "100%", width: "100%", objectFit: "cover" }} /> : mono}</div>
                  <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column" }}>
                    <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em" }}>{S(m.name)}</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: EM_TEXT, marginTop: 3 }}>{S(m.role)}</div>
                    {S(m.short) && <div style={{ fontSize: 14.5, color: "#5b6675", marginTop: 11, lineHeight: 1.55 }}>{S(m.short)}</div>}
                  </div>
                </div></Reveal>
              );
            })}
          </div>
        )}
        {boothGallery("leadership", false)}
      </SceneShell>
    );
    else if (leaders.length) scenes.push(
      <SceneShell key="leadership" id="leadership" bg="#0b1220" color="#fff" style={{ justifyContent: "flex-start", scrollSnapAlign: "none" }}>
        <Reveal v="eyebrow"><div style={sceneEyebrow(EM)}>Leadership</div></Reveal>
        <Reveal v="head"><div style={{ fontSize: "clamp(22px,2.6vw,34px)", fontWeight: 500, lineHeight: 1.4, maxWidth: 1000, marginTop: 16, color: "#dbe2ec" }}>{S(conf.leadershipIntro) || "Backed by proven operators."}</div></Reveal>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 22, marginTop: 44 }}>
          {leaders.slice(0, 6).map((l, i) => {
            const photo = photoFor(l.name);
            const initials = S(l.name).split(/\s+/).slice(0, 2).map((w) => w[0]).join("");
            const rows = [
              { k: "Previously", items: (Array.isArray(l.previousCompanies) ? l.previousCompanies : []).map(S).filter(Boolean) },
              { k: "Discoveries", items: (Array.isArray(l.discoveries) ? l.discoveries : []).map(S).filter(Boolean) },
              { k: "Track record", items: (Array.isArray(l.successes) ? l.successes : []).map(S).filter(Boolean) },
            ].filter((r) => r.items.length);
            return (
              <Reveal key={i} v="card" order={Math.min(i, 4)}><div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 22, padding: 26, height: "100%" }}>
                <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                  <div style={{ height: 60, width: 60, borderRadius: 16, overflow: "hidden", background: "rgba(255,255,255,0.08)", display: "grid", placeItems: "center", fontSize: 20, fontWeight: 800, color: "#c4cdd9", flexShrink: 0 }}>{photo ? <img src={photo} alt="" style={{ height: "100%", width: "100%", objectFit: "cover" }} /> : initials}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 19, fontWeight: 900, letterSpacing: "-0.02em" }}>{S(l.name)}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: EM, marginTop: 2 }}>{S(l.role)}</div>
                  </div>
                </div>
                {S(l.headline) && <div style={{ fontSize: 17, fontWeight: 700, marginTop: 16, color: "#e6ebf2", lineHeight: 1.3 }}>{S(l.headline)}</div>}
                {rows.map((r, ri) => (
                  <div key={ri} style={{ marginTop: 14, paddingLeft: 14, borderLeft: `2px solid ${EM}44` }}>
                    <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "#7c8a9c" }}>{r.k}</div>
                    <div style={{ fontSize: 14, color: "#c4cdd9", marginTop: 4, lineHeight: 1.5 }}>{r.items.join(" · ")}</div>
                  </div>
                ))}
              </div></Reveal>
            );
          })}
        </div>
      </SceneShell>
    );
  }

  // SECTION 9 — WHY INVEST (synthesis: reasons → competitive advantages → near-term catalysts)
  {
    const advantages = (Array.isArray(conf.competitiveAdvantages) ? conf.competitiveAdvantages : []).map(S).filter(Boolean);
    if (investmentCase.length || advantages.length || catalysts.length) scenes.push(
      <SceneShell key="whyinvest" bg="#05070d" color="#fff">
        <Reveal v="eyebrow"><div style={sceneEyebrow(EM)}>Why Invest</div></Reveal>
        <Reveal v="head"><div style={{ fontSize: "clamp(28px,3.6vw,50px)", fontWeight: 800, letterSpacing: "-0.03em", marginTop: 14 }}>Why {shortCo(co.name)}</div></Reveal>
        {S(conf.investmentSummary) && <Reveal v="body" order={1}><div style={{ fontSize: "clamp(17px,2vw,24px)", color: "#dbe2ec", marginTop: 20, maxWidth: 1000, lineHeight: 1.5 }}>{S(conf.investmentSummary)}</div></Reveal>}
        {S(conf.investorTakeaway) && <Reveal v="body" order={2}><div style={{ fontSize: 15.5, color: "#93a0b0", marginTop: 16, maxWidth: 900, lineHeight: 1.5, borderLeft: `3px solid ${EM}`, paddingLeft: 14 }}>{S(conf.investorTakeaway)}</div></Reveal>}
        {investmentCase.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 18, marginTop: 40 }}>
            {investmentCase.map((r, i) => (
              <Reveal key={i} v="card" order={Math.min(i, 5)}><div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 22, padding: 24, height: "100%" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
                  <span style={{ fontSize: 15, fontWeight: 900, color: EM, flexShrink: 0 }}>{String(i + 1).padStart(2, "0")}</span>
                  <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.25 }}>{S(r.reason)}</div>
                </div>
                {S(r.evidence) && <div style={{ fontSize: 14, color: "#c4cdd9", marginTop: 12, lineHeight: 1.5 }}>{S(r.evidence)}</div>}
                {S(r.standsOutBecause) && <div style={{ fontSize: 13.5, color: "#8493a8", marginTop: 10, lineHeight: 1.45, fontStyle: "italic" }}>{S(r.standsOutBecause)}</div>}
              </div></Reveal>
            ))}
          </div>
        )}
        {advantages.length > 0 && (
          <div style={{ marginTop: 44 }}>
            <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.14em", color: "#93a0b0", marginBottom: 16 }}>Competitive advantages</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {advantages.map((a, i) => (
                <Reveal key={i} v="card" order={Math.min(i, 4)}><span style={{ display: "inline-block", fontSize: 15, fontWeight: 600, color: "#dbe2ec", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: "12px 18px" }}>{a}</span></Reveal>
              ))}
            </div>
          </div>
        )}
        {catalysts.length > 0 && (
          <div style={{ marginTop: 44 }}>
            <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.14em", color: "#93a0b0", marginBottom: 16 }}>Near-term catalysts</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
              {catalysts.slice(0, 4).map((c, i) => (
                <Reveal key={i} v="card" order={Math.min(i, 3)}><div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 18, padding: 20, height: "100%" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Clock size={15} style={{ color: EM }} /><span style={{ fontSize: 12.5, fontWeight: 800, color: EM }}>{S(c.timing)}</span></div>
                  <div style={{ fontSize: 17, fontWeight: 800, marginTop: 8, letterSpacing: "-0.02em" }}>{S(c.label)}</div>
                  {S(c.impact) && <div style={{ fontSize: 13.5, color: "#8493a8", marginTop: 8, lineHeight: 1.45 }}>{S(c.impact)}</div>}
                </div></Reveal>
              ))}
            </div>
          </div>
        )}
        {boothGallery("why")}
      </SceneShell>
    );
  }

  // CUSTOM SECTIONS (Pass 4 — up to 2 standalone sections when a standard module can't carry it)
  (Array.isArray(conf.customSections) ? conf.customSections : []).filter((c) => c && (S(c.title) || S(c.context))).slice(0, 2).forEach((c, ci) => {
    const ki = (Array.isArray(c.keyInformation) ? c.keyInformation : []).filter((x) => x && (S(x.value) || S(x.label)));
    scenes.push(
      <SceneShell key={"custom-" + (S(c.key) || ci)} bg={ci % 2 ? "#0b1220" : "#05070d"} color="#fff">
        <Reveal v="eyebrow"><div style={sceneEyebrow(EM)}>{S(c.title) || "More"}</div></Reveal>
        {S(c.context) && <Reveal v="head"><div style={{ fontSize: "clamp(22px,2.6vw,34px)", fontWeight: 500, lineHeight: 1.4, maxWidth: 1000, marginTop: 16, color: "#dbe2ec" }}>{S(c.context)}</div></Reveal>}
        {ki.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 18, marginTop: 40 }}>
            {ki.map((x, i) => (
              <Reveal key={i} v="card" order={Math.min(i, 4)}><div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: 22, height: "100%" }}>
                {S(x.value) && <div style={{ fontSize: "clamp(22px,2.4vw,34px)", fontWeight: 900, letterSpacing: "-0.02em" }}>{S(x.value)}</div>}
                {S(x.label) && <div style={{ fontSize: 13, fontWeight: 800, color: "#9aa4b2", marginTop: S(x.value) ? 10 : 0, textTransform: "uppercase", letterSpacing: "0.08em" }}>{S(x.label)}</div>}
                {S(x.context) && <div style={{ fontSize: 13.5, color: "#7c8a9c", marginTop: 8, lineHeight: 1.4 }}>{S(x.context)}</div>}
              </div></Reveal>
            ))}
          </div>
        )}
      </SceneShell>
    );
  });

  // SECTION 10 — CONVERSION & PASSPORT QR HANDOFF
  scenes.push(
    <SceneShell key="cta" id="follow" color="#fff" bg={(() => {
      const g = conf.gallery && Array.isArray(conf.gallery.follow) && conf.gallery.follow[0];
      const src = g ? (typeof g === "string" ? g : S(g.src)) : "";
      return src ? `linear-gradient(rgba(5,7,13,0.72), rgba(5,7,13,0.9)), url("${src}") center/cover` : `radial-gradient(1200px 520px at 80% -10%, ${EM}26, transparent), #05070d`;
    })()}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 64, alignItems: "center" }}>
        <div>
          <Reveal v="eyebrow"><div style={sceneEyebrow(EM)}>Continue the Story</div></Reveal>
          <Reveal v="head"><div style={{ fontSize: "clamp(40px,5vw,76px)", fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 1.02, marginTop: 20 }}>Never miss another drill result.</div></Reveal>
          <Reveal v="body" order={1}><div style={{ fontSize: "clamp(18px,2.2vw,26px)", color: "#93a0b0", marginTop: 20, maxWidth: 620, lineHeight: 1.4 }}>Follow {ticker ? `$${ticker}` : shortCo(co.name)} on MineEx and get every release delivered instantly.</div></Reveal>
          {(() => {
            const benefits = (conf.follow && Array.isArray(conf.follow.benefitLabels) && conf.follow.benefitLabels.length)
              ? conf.follow.benefitLabels.map(S).filter(Boolean)
              : ["Follow the company", "Press-release alerts", "The complete timeline", "CEO interviews & media", "Full project detail"];
            return (
              <Reveal v="body" order={2}><div style={{ marginTop: 26, display: "flex", flexWrap: "wrap", gap: 10, maxWidth: 620 }}>
                {benefits.slice(0, 6).map((b, i) => (<span key={i} style={{ fontSize: 14, fontWeight: 700, color: "#dbe2ec", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 999, padding: "9px 16px" }}>{S(b)}</span>))}
              </div></Reveal>
            );
          })()}
        </div>
        <Reveal v="card"><div style={{ textAlign: "center" }}><div className="pp-scene-pulse" style={{ background: "#fff", borderRadius: 32, padding: 24 }}><div style={{ height: 280, width: 280 }} dangerouslySetInnerHTML={{ __html: qr || "" }} /></div><div style={{ marginTop: 14, fontSize: 15, fontWeight: 800, color: "#fff", letterSpacing: "0.02em" }}>{S(conf.follow && conf.follow.qrLabel) || "Follow on MineEx"}</div></div></Reveal>
      </div>
    </SceneShell>
  );

  return (
    <div ref={scrollRef} style={{ position: "fixed", inset: 0, overflowY: "auto", overflowX: "hidden", background: "#05070d", color: "#0f172a", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif", scrollSnapType: "y proximity", WebkitOverflowScrolling: "touch" }}>
      <style>{`@keyframes ppScenePulse{0%,100%{transform:scale(1);box-shadow:0 0 0 0 ${EM}55}50%{transform:scale(1.03);box-shadow:0 0 0 22px ${EM}00}} .pp-scene-pulse{animation:ppScenePulse 2.6s ease-in-out infinite} @media (prefers-reduced-motion: reduce){.pp-scene-pulse{animation:none}}`}</style>
      {/* Persistent, subtle "Follow on MineEx" QR — locally generated, always available; hidden on
          the final Follow scene (which has the full-size QR). Does not obstruct scene content. */}
      {qr && active !== "follow" && (
        <div style={{ position: "fixed", right: 18, bottom: 18, zIndex: 55, display: "flex", alignItems: "center", gap: 10, background: "rgba(11,18,32,0.82)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 16, padding: "9px 14px 9px 9px", boxShadow: "0 12px 30px -12px rgba(0,0,0,0.6)" }}>
          <div style={{ height: 50, width: 50, background: "#fff", borderRadius: 9, padding: 4 }} dangerouslySetInnerHTML={{ __html: qr }} />
          <div style={{ color: "#fff", fontSize: 12, fontWeight: 800, lineHeight: 1.15, letterSpacing: "0.01em" }}>Follow on<br />MineEx</div>
        </div>
      )}
      {/* Sticky section nav (fixed overlay; light bar per the editorial board) */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, background: "rgba(245,247,251,0.9)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderBottom: "1px solid #e2e8f0" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 40px", display: "flex", gap: 6, height: NAV_H, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
          {NAV.map((n) => (
            <button key={n.id} onClick={() => go(n.id)} style={{ position: "relative", background: "none", border: "none", cursor: "pointer", padding: "8px 18px", fontSize: 15, fontWeight: active === n.id ? 900 : 700, letterSpacing: "-0.01em", color: active === n.id ? "#0b1220" : "#9aa6b4", transition: "color .2s, font-weight .2s" }}>
              {n.label}
              {active === n.id && <span style={{ position: "absolute", left: 18, right: 18, bottom: -1, height: 3, borderRadius: 3, background: EM }} />}
            </button>
          ))}
        </div>
      </div>
      {scenes}
    </div>
  );
}
