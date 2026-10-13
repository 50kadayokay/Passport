// ─────────────────────────────────────────────────────────────────────────────
// The MineEx public marketing site — a THIN ROUTE LOADER.
//
// Mounted only at /site (see src/main.jsx) and lazily loaded, so nothing here is in
// the application's bundle. This module itself stays tiny: every surface below —
// the primary homepage, the legacy homepage, and each deeper demo — is a separate
// React.lazy chunk, so opening one route never downloads the code for the others.
//
// PERFORMANCE CONTRACT (Phase 0): the primary homepage (/home) must not pull
// any product-demonstration code. The following load ONLY via their own route/CTA:
//   DirectedEmbed · NarrativeStory · SalesStory · ConferenceAct · PortalAct ·
//   DemoStage(ProjectsAct) · Conference fixtures · kingsmenPortalProfile ·
//   ConferenceV3 · ProfileEditor · MobileAppFrame · legacy homepage sections.
//
// The public brand is MineEx throughout. The internal codename never appears here.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState } from "react";
import { effectiveSearch, isMarketingPath } from "./routes.js";
import { MX, MarketingStyles, useReduce } from "./system.jsx";

/* ── lazy surfaces — each its own chunk, loaded only when its route is opened ─── */

// Primary homepage (lean: Nav + Hero + system only; the deeper sections arrive in
// later phases and load their product surfaces on demand).
const Home2 = React.lazy(() => import("./home2/Home2.jsx"));
const ProPage = React.lazy(() => import("./home2/ProPage.jsx"));
const PricingPage = React.lazy(() => import("./home2/PricingDeck.jsx"));
const AppShotStage = React.lazy(() => import("./ui/AppShotStage.jsx"));
const ComparePlans = React.lazy(() => import("./home2/ComparePlans.jsx"));
// Ecosystem finale — static compositions review harness (?ecostory=1&state=0..5).
const EcoStoryRoute = React.lazy(() => import("./home2/EcoStoryRoute.jsx"));
// Conference Mode service + template library (the "Conference" nav destination).
const ConferencePage = React.lazy(() => import("./home2/ConferencePage.jsx"));
// Conference Mode inquiry — the page the Conference "Get Started" button opens.
const ConferenceInquiry = React.lazy(() => import("./home2/ConferenceInquiry.jsx"));
const ContactPage = React.lazy(() => import("./home2/ContactPage.jsx"));
const AndroidSoon = React.lazy(() => import("./home2/AndroidSoon.jsx"));
// Investor-side product walkthrough (the "Investor" nav destination).
const InvestorPage = React.lazy(() => import("./home2/InvestorPage.jsx"));
// App download page — the "Get the App" destination (App Store + Google Play).
const GetApp = React.lazy(() => import("./home2/GetApp.jsx"));
// A single Conference template, full-screen, with a Back-to-templates control.
const ConfTemplateRoute = React.lazy(() => import("./home2/ConfTemplateRoute.jsx"));
// The original long-form homepage (default /site), preserved.
const LegacyHome = React.lazy(() => import("./sections/LegacyHome.jsx"));

// Deep Pro Profile / Conference / Portal demos — preserved, code-split.
const DirectedEmbed = React.lazy(() => import("./demo/DirectedEmbed.jsx").then((m) => ({ default: m.DirectedEmbed })));
const NarrativeStory = React.lazy(() => import("./demo/NarrativeStory.jsx").then((m) => ({ default: m.NarrativeStory })));
const SalesStory = React.lazy(() => import("./demo/SalesStory.jsx"));
const ConferenceAct = React.lazy(() => import("./demo/ConferenceAct.jsx").then((m) => ({ default: m.ConferenceAct })));
const PortalSlice = React.lazy(() => import("./demo/PortalAct.jsx").then((m) => ({ default: m.PortalSlice })));
const ProProfileDemoStage = React.lazy(() => import("./demo/DemoStage.jsx").then((m) => ({ default: m.ProProfileDemoStage })));

// Full-screen route wrappers (each bundles its own heavy deps into its own chunk).
const ConferenceFixtureRoute = React.lazy(() => import("./demo/ConferenceFixtureRoute.jsx"));
const PhoneLab = React.lazy(() => import("./home2/PhoneLab.jsx"));
const PortalDemoRoute = React.lazy(() => import("./demo/PortalDemoRoute.jsx"));
const EmbedProofRoute = React.lazy(() => import("./demo/EmbedProofRoute.jsx"));

const TITLE = "MineEx — The investor platform built for junior mining";
const DESCRIPTION =
  "MineEx connects junior mining companies with investors: one profile investors can discover, understand and follow — plus updates, media, analytics and an interactive conference booth.";

function useDocumentMeta() {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = TITLE;

    const set = (attr, key, content) => {
      let el = document.head.querySelector(`meta[${attr}="${key}"]`);
      const created = !el;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      const prev = el.getAttribute("content");
      el.setAttribute("content", content);
      return () => {
        if (created) el.remove();
        else if (prev != null) el.setAttribute("content", prev);
      };
    };

    // Canonical + og:url point at the page actually being viewed, minus the junk: these
    // routes are query-string based, so a canonical that kept utm or cache-buster params
    // would split every share. Only the route-selecting params survive.
    const ROUTE_PARAMS = new Set(["home2", "pro", "conference", "investor", "pricing", "contact", "compare", "getapp", "android", "confstart", "plan"]);
    const canonicalUrl = (() => {
      try {
        const u = new URL(window.location.href);
        const keep = new URLSearchParams();
        for (const [k, v] of u.searchParams) if (ROUTE_PARAMS.has(k)) keep.set(k, v);
        const q = keep.toString();
        return u.origin + u.pathname + (q ? "?" + q : "");
      } catch (_) { return ""; }
    })();
    const ogImage = (() => {
      try { return new URL("/og-image.jpg", window.location.origin).href; } catch (_) { return "/og-image.jpg"; }
    })();

    // <link rel="canonical"> — created if absent, restored on unmount like the meta tags.
    let linkEl = document.head.querySelector('link[rel="canonical"]');
    const linkCreated = !linkEl;
    const prevHref = linkEl ? linkEl.getAttribute("href") : null;
    if (!linkEl) { linkEl = document.createElement("link"); linkEl.setAttribute("rel", "canonical"); document.head.appendChild(linkEl); }
    if (canonicalUrl) linkEl.setAttribute("href", canonicalUrl);

    const undo = [
      set("name", "description", DESCRIPTION),
      set("property", "og:site_name", "MineEx"),
      set("property", "og:title", TITLE),
      set("property", "og:description", DESCRIPTION),
      set("property", "og:type", "website"),
      set("property", "og:url", canonicalUrl),
      set("property", "og:image", ogImage),
      set("property", "og:image:width", "1200"),
      set("property", "og:image:height", "630"),
      set("property", "og:image:alt", "MineEx — the investor platform built for junior mining"),
      set("name", "twitter:card", "summary_large_image"),
      set("name", "twitter:title", TITLE),
      set("name", "twitter:description", DESCRIPTION),
      set("name", "twitter:image", ogImage),
    ];

    return () => {
      document.title = prevTitle;
      undo.forEach((fn) => fn());
      if (linkCreated) linkEl.remove();
      else if (prevHref != null) linkEl.setAttribute("href", prevHref);
    };
  }, []);
}

/* ── suspense helpers ────────────────────────────────────────────────────────── */

const fallback = <div style={{ position: "fixed", inset: 0, background: MX.sheet }} />;

// Deep-demo surfaces that expect the marketing root + global styles around them.
function Shell({ children }) {
  return (
    <div className="mx-root" id="top">
      <MarketingStyles />
      <React.Suspense fallback={fallback}>{children}</React.Suspense>
    </div>
  );
}

/* ── page ────────────────────────────────────────────────────────────────────── */

export default function MarketingSite() {
  useDocumentMeta();
  const reduce = useReduce();

  useEffect(() => {
    if (reduce) return;
    const prev = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = "smooth";
    return () => {
      document.documentElement.style.scrollBehavior = prev;
    };
  }, [reduce]);

  // A readable path (/pricing) resolves to the query this file already routes on
  // (?pricing=1), so both URL forms select the same surface. See marketing/routes.js.
  //
  // REACTIVE, and the nav routes client-side. Every tab was a plain <a href>, so a click
  // was a full document navigation: the whole bundle re-downloaded and React re-booted
  // before anything appeared. Measured on production — Pricing 908ms, Conference 1656ms,
  // Investor 6527ms. The surfaces are already separate lazy chunks, so swapping them in
  // place is what the architecture was built for; only this subscription was missing.
  const [search, setSearch] = useState(() =>
    typeof window === "undefined" ? "" : effectiveSearch(window.location.pathname, window.location.search));

  useEffect(() => {
    const sync = () => setSearch(effectiveSearch(window.location.pathname, window.location.search));

    // One delegated handler: a left-click on an in-site marketing link becomes a
    // pushState. Anything else — a new tab, a modifier, an external host, the app, the
    // static legal pages — is left to the browser exactly as before.
    const onClick = (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target && e.target.closest && e.target.closest("a[href]");
      if (!a || a.target === "_blank" || a.hasAttribute("download") || a.getAttribute("rel") === "external") return;
      let url;
      try { url = new URL(a.href, window.location.origin); } catch (_) { return; }
      if (url.origin !== window.location.origin) return;
      if (!isMarketingPath(url.pathname)) return;             // /app, /privacy.html, … unchanged
      if (url.pathname === window.location.pathname && url.search === window.location.search) { e.preventDefault(); return; }
      e.preventDefault();
      window.history.pushState({}, "", url.pathname + url.search + url.hash);
      window.dispatchEvent(new Event("mx:navchange"));        // Nav already listens for this
      window.scrollTo(0, 0);
      sync();
    };

    window.addEventListener("popstate", sync);
    window.addEventListener("mx:navchange", sync);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("mx:navchange", sync);
      document.removeEventListener("click", onClick);
    };
  }, []);

  // Directed-automation proof: the real iframe app driven by the DemoDirector.
  if (/[?&]directedEmbed/.test(search)) return <Shell><DirectedEmbed /></Shell>;

  // Build-time capture surface for the app screenshots (its own chunk, nothing links here).
  if (/[?&]appshot=/.test(search))
    return <React.Suspense fallback={fallback}><AppShotStage /></React.Suspense>;

  // Phone lab — ISOLATED working version of the device composition. Imports nothing that the
  // sales page, Pro page or Investor page render. Safe to experiment in.
  if (/[?&]phonelab(=|&|$)/.test(search))
    return <React.Suspense fallback={fallback}><PhoneLab /></React.Suspense>;

  // Company Portal chapter — isolated first-slice preview.
  if (/[?&]portalslice(=|&|$)/.test(search)) return <Shell><PortalSlice /></Shell>;

  // Marketing-only Company-Portal render surface (full-screen, own chunk).
  if (/[?&]portaldemo(=|&|$)/.test(search))
    return <React.Suspense fallback={fallback}><PortalDemoRoute /></React.Suspense>;


  // Marketing-only Conference fixture renderer (full-screen, own chunk).
  if (/[?&]conffixture=/.test(search))
    return <React.Suspense fallback={fallback}><ConferenceFixtureRoute /></React.Suspense>;

  // PRIMARY homepage — lean surface (its own chunk).
  if (/[?&]ecostory(=|&|$)/.test(search))
    return <React.Suspense fallback={fallback}><EcoStoryRoute /></React.Suspense>;

  if (/[?&]conftemplate(=|&|$)/.test(search))
    return <React.Suspense fallback={fallback}><ConfTemplateRoute /></React.Suspense>;

  // Conference Mode inquiry — checked before the Conference page (own chunk).
  if (/[?&]confstart(=|&|$)/.test(search))
    return <React.Suspense fallback={fallback}><ConferenceInquiry /></React.Suspense>;

  if (/[?&]conference(=|&|$)/.test(search))
    return <React.Suspense fallback={fallback}><ConferencePage /></React.Suspense>;

  if (/[?&]investor(=|&|$)/.test(search))
    return <React.Suspense fallback={fallback}><InvestorPage /></React.Suspense>;

  // Contact / plan enquiry — where every pricing CTA leads.
  if (/[?&]contact(=|&|$)/.test(search))
    return <React.Suspense fallback={fallback}><ContactPage /></React.Suspense>;

  // Android interstitial — where the Play badge leads until that listing publishes.
  if (/[?&]android(=|&|$)/.test(search))
    return <React.Suspense fallback={fallback}><AndroidSoon /></React.Suspense>;

  if (/[?&]getapp(=|&|$)/.test(search))
    return <React.Suspense fallback={fallback}><GetApp /></React.Suspense>;

  if (/[?&]home2(=|&|$)/.test(search))
    return <React.Suspense fallback={fallback}><Home2 /></React.Suspense>;

  // Pricing tab — the pricing ONLY (nav + ProPricing), no Pro intro/walkthrough (its own chunk).
  if (/[?&]compare(=|&|$)/.test(search))
    return <React.Suspense fallback={fallback}><ComparePlans /></React.Suspense>;

  if (/[?&]pricing(=|&|$)/.test(search))
    return <React.Suspense fallback={fallback}><PricingPage /></React.Suspense>;

  // Pro tab — intro → the full walkthrough → pricing (its own chunk).
  if (/[?&]pro(=|&|$)/.test(search))
    return <React.Suspense fallback={fallback}><ProPage /></React.Suspense>;

  // Six-chapter desktop sales section (?story, optional &act=projects).
  if (/[?&]story/.test(search))
    return <Shell><NarrativeStory variant={/[?&]act=projects/.test(search) ? "projects" : "full"} /></Shell>;

  // Pro Profile sales demo — the walkthrough alone (terminates at Follow).
  if (/[?&]salesstory(=|&|$)/.test(search)) return <Shell><NarrativeStory variant="full" /></Shell>;

  // Preserved integrated experience: Pro Profile → Conference → Portal.
  if (/[?&]integratedstory(=|&|$)/.test(search)) return <Shell><SalesStory /></Shell>;

  // Conference chapter — vertical-slice preview, with light/dark spacers.
  if (/[?&]conf(=|&|$)/.test(search))
    return (
      <div className="mx-root" id="top">
        <MarketingStyles />
        <div style={{ height: "42vh", background: MX.sheet }} />
        <React.Suspense fallback={fallback}><ConferenceAct /></React.Suspense>
        <div style={{ height: "40vh", background: MX.ink }} />
      </div>
    );

  // Three-state fidelity proof (full-screen, own chunk).
  if (/[?&]embed(=|&|$)/.test(search))
    return <React.Suspense fallback={fallback}><EmbedProofRoute /></React.Suspense>;

  // Pro Profile demo stage: ?slice (current model) or ?directedDemo (A/B).
  if (/[?&](slice|directedDemo)/.test(search)) {
    const directed = /[?&]directedDemo/.test(search);
    return (
      <div className="mx-root" id="top">
        <MarketingStyles />
        <React.Suspense fallback={fallback}><ProProfileDemoStage /></React.Suspense>
        {!directed && <div style={{ height: "70vh", background: MX.sheet }} />}
      </div>
    );
  }

  // Default /site — the preserved legacy homepage (also serves the DEV.only preview).
  return <React.Suspense fallback={fallback}><LegacyHome /></React.Suspense>;
}
