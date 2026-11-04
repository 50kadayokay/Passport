import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import { isMarketingPath } from "./marketing/routes.js";
import { isPublicDemoSlug } from "./aiBrief/conferenceV3/demoSlugs.js";
import ReactDOM from "react-dom/client";
import "./index.css";
import { SUPABASE_URL, SUPABASE_ANON } from "./lib/supabase.js";
import { useAuth } from "./auth/useAuth.js";
import { signIn, signUp, requestPasswordReset, consumeHashSession, updatePassword, getUser, getAccessToken, signInWithApple, signInWithGoogle, googleConfigured, appleAvailable } from "./lib/auth.js";
import * as investorData from "./lib/investorData.js";
import { isNativeApp } from "./lib/platform.js";
import { wireAndroidBack } from "./lib/androidBack.js"; // Android hardware back (no-op on web/iOS)
import { useBackHandler } from "./lib/useBackHandler.js";
import { SecureStorage } from "@aparajita/capacitor-secure-storage"; // iOS Keychain for "Remember me"
import { Keyboard } from "@capacitor/keyboard"; // native keyboard events (lift content above it)

// Surfaces are code-split so the marketing bundle stays lean:
const Onboarding = React.lazy(() => import("./console/CompanyConsole.jsx")); // company console (wraps the builder)
const Admin = React.lazy(() => import("./admin/MissionControl.jsx"));         // Mission Control
const Portal = React.lazy(() => import("./portal/Portal.jsx"));               // Company Portal (desktop, paying companies)
const Studio = React.lazy(() => import("./studio/Studio.tsx"));                // Story Studio (desktop, admin) — release → carousel/video
const PortalGate = React.lazy(() => import("./portal/PortalGate.jsx"));       // resolves company + entitlement
const EditorDemo = import.meta.env.DEV ? React.lazy(() => import("./portal/EditorDemo.jsx")) : null;       // localhost-only editor harness
const FeedDemo = import.meta.env.DEV ? React.lazy(() => import("./aiBrief/FeedDemo.jsx")) : null;          // localhost-only Today-feed harness
const PortalDemo = import.meta.env.DEV ? React.lazy(() => import("./portal/PortalDemo.jsx")) : null;       // localhost-only portal-shell harness
const PostDetailRoute = React.lazy(() => import("./aiBrief/Feed.jsx").then((m) => ({ default: m.PostDetailRoute }))); // /p/<id> deep link
const BlueprintDemo = import.meta.env.DEV ? React.lazy(() => import("./admin/blueprints/BlueprintDemo.jsx")) : null; // /bpdemo — dev harness (no auth/DB), removable
const OnboardDemo = import.meta.env.DEV ? React.lazy(() => import("./admin/onboarding/OnboardDemo.jsx")) : null; // /onboarddemo — dev harness (no auth), removable
// /confv3demo — dev harness AND, for whitelisted demo slugs only, the renderer behind
// the public Conference template gallery (see isPublicConfDemo below). It therefore
// cannot be null in production, or every gallery tile renders a null component.
// Still lazy, so the chunk is only fetched when the route actually renders; access is
// restricted by the route gate, not by dropping the import.
const ConferenceV3Demo = React.lazy(() => import("./aiBrief/conferenceV3/ConferenceV3Demo.jsx"));
const ConferenceBooth = React.lazy(() => import("./aiBrief/conferenceV3/ConferenceV3Booth.jsx")); // /conference — PRODUCTION standalone iPad booth
const InvestorDemo = React.lazy(() => import("./aiBrief/InvestorDemo.jsx")); // /appdemo — PRODUCTION chromeless investor-shell render for the marketing site phone (no auth, demo data)
const ShowcaseTemplates = import.meta.env.DEV ? React.lazy(() => import("./marketing/ShowcaseTemplates.jsx")) : null; // /templatesdemo — template showcase gallery (dev), removable
// /studiodemo — dev harness (no auth/DB), removable. The lazy import is behind an
// import.meta.env.DEV guard so a production build drops the chunk entirely, taking
// the sample releases with it. Without the guard Rollup emits them as a fetchable
// chunk even though the route never renders in production.
const StudioDemo = import.meta.env.DEV ? React.lazy(() => import("./studio/dev/StudioDemo.tsx")) : null;
// The public MineEx marketing site at /site — an isolated, code-split surface, so
// none of it ships in the app bundle. The previous marketing pages stay reachable
// at /site/legacy.
const MarketingSite = React.lazy(() => import("./marketing/MarketingSite.jsx"));
const LegacySite = React.lazy(() => import("./site/Site.jsx"));
const MarketingV2 = React.lazy(() => import("./marketing/v2/MarketingV2.jsx")); // /sitex — redesigned sales page (dev preview)
import AuthGate from "./auth/AuthGate.jsx";

// Surfaces are split by URL path:
//   /onboarding  → the desktop-only company builder (not reachable from the app)
//   anything else → the mobile consumer app
// Onboarding is gated to wide screens so it can't be used on a phone.
// `title` / `body` name the surface being blocked; the defaults are the
// onboarding builder's, which is where this screen started.
function DesktopOnly({ children, title = "Onboarding is a desktop tool",
  body = "Building a company profile needs a larger screen. Open this page on a desktop or laptop to continue. The MineEx app itself works great on your phone." }) {
  const [wide, setWide] = React.useState(typeof window !== "undefined" ? window.innerWidth >= 1024 : true);
  React.useEffect(() => {
    const on = () => setWide(window.innerWidth >= 1024);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  if (wide) return children;
  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 32, background: "#f4f5f7", textAlign: "center" }}>
      <div style={{ maxWidth: 340 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🖥️</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: 0 }}>{title}</h1>
        <p style={{ fontSize: 14, color: "#64748b", marginTop: 10, lineHeight: 1.5 }}>{body}</p>
      </div>
    </div>
  );
}

// Self-heal: after a deploy, a stale service-worker cache can leave a device unable
// to load a JS chunk (white screen / "won't load"). When Vite reports a failed chunk
// preload, wipe caches + the service worker and reload ONCE so the app recovers on
// its own instead of staying stuck.
if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", async () => {
    try {
      if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); }
      if (navigator.serviceWorker) { const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map((r) => r.unregister())); }
    } catch (_) {}
    try {
      if (!sessionStorage.getItem("pp-healed")) { sessionStorage.setItem("pp-healed", "1"); window.location.reload(); }
    } catch (_) { window.location.reload(); }
  });
}

// DEV-ONLY MineEx Brief benchmark build: boot straight into Kingsmen's timeline with the eight
// Version-2 Briefs loaded from a local fixture (public/brief-bench.json). MUST ship false — when
// true, a localhost dev build auto-redirects into the benchmark. The benchmark itself is reached
// via the ?brief=1 loader below, which is localhost-gated and cannot activate on a production host.
// The rewrite runs before any routing/flags read the URL, so the normal shared-profile path (?c=)
// renders the REAL app as a guest with no login, no DB writes.
const BRIEF_BENCH = false;
if (BRIEF_BENCH && typeof window !== "undefined") {
  try {
    const _p = new URLSearchParams(window.location.search);
    // Don't hijack an explicit sign-in deep link — otherwise tapping "Sign in" from the
    // demo guest view would get rewritten back to the shared company and appear to bounce.
    if (!_p.has("c") && !_p.has("signin")) window.history.replaceState(null, "", "/app?c=kingsmen-resources&tab=timeline&brief=1");
  } catch (_) {}
}
const path = typeof window !== "undefined" ? window.location.pathname : "/";
const isOnboarding = path.startsWith("/onboarding");
const isAdmin = path.startsWith("/admin");
const isPortal = path.startsWith("/portal");
const isStudio = path.startsWith("/studio");
const isPost = /^\/p\/[^/]+/.test(path);
const postId = isPost ? decodeURIComponent(path.replace(/^\/p\//, "").split(/[/?#]/)[0]) : null;
// In the native iOS/Android shell the app boots at "/", so treat native as the app.
const isApp = isNativeApp || path === "/app" || path.startsWith("/app/") || path.startsWith("/app?");
// Standalone Conference Mode booth — PRODUCTION (not dev-gated). A self-contained iPad kiosk that
// renders one company's chosen template full-screen, independent of the investor app, and QR-links
// visitors to that company's Pro profile. Reached at /conference?c=<slug> on the booth's own host.
const isConference = path === "/conference" || path.startsWith("/conference/") || path.startsWith("/conference?");
// PRODUCTION chromeless investor-shell render for the marketing site's phone (iframed
// by the Investor page). No auth, demo data only; renders the real app screens.
const isInvestorDemo = path === "/appdemo" || path.startsWith("/appdemo/") || path.startsWith("/appdemo?");
const isReset = path === "/reset" || path.startsWith("/reset");
// A Supabase recovery link can land on the project's Site URL ROOT (not /reset) when the
// app's /reset origin isn't in the dashboard redirect allow-list — the token then arrives
// in the hash on "/" (or any route) and the password form is never reached. Detect the
// recovery token anywhere and treat it as a reset, so the link always lands on the form.
const hasRecoveryHash = (() => {
  try { return /(?:^|[#&])type=recovery(?:&|$)/.test(window.location.hash || ""); } catch (_) { return false; }
})();
// Blueprint workspace dev harness — LOCALHOST ONLY. In production /bpdemo falls through
// to the normal app (never renders sample Blueprint content publicly).
const isLocalhost = (() => {
  try { const h = window.location.hostname; return h === "localhost" || h === "127.0.0.1"; } catch (_) { return false; }
})();
const isBpDemo = path.startsWith("/bpdemo") && isLocalhost && import.meta.env.DEV;
const isOnboardDemo = path.startsWith("/onboarddemo") && isLocalhost && import.meta.env.DEV;
// Conference Mode template harness. It stays LOCALHOST + DEV only, with ONE narrow
// exception the public marketing gallery depends on: a request for one of the fictional
// demo companies whose dataset is already bundled locally (ConferenceV3Demo's LOCAL_MOCKS
// — no Supabase row exists for any of them), with no preview token and no QA fixture.
// Without that exception every gallery tile renders "Profile not available" in a
// production build, because the route simply does not exist there.
//
// The whitelist is what keeps this safe: an unlisted slug never reaches the harness, so
// the Supabase preview path (which carries a default token) can never be driven from a
// public URL, and arbitrary company data can never be rendered.
const confDemoParams = (() => {
  try { return new URLSearchParams(window.location.search); } catch (_) { return new URLSearchParams(); }
})();
const isPublicConfDemo =
  path.startsWith("/confv3demo") &&
  !confDemoParams.get("preview") &&                       // Supabase token path: dev + localhost only
  !confDemoParams.get("fixture") &&                       // QA fixtures:         dev + localhost only
  !confDemoParams.get("coverage") &&                      // dev coverage overlay: dev + localhost only
  isPublicDemoSlug(confDemoParams.get("c"));
const isConfV3Demo = path.startsWith("/confv3demo") && ((isLocalhost && import.meta.env.DEV) || isPublicConfDemo);
const isTemplatesDemo = path.startsWith("/templatesdemo") && isLocalhost && import.meta.env.DEV;
// Story Studio pipeline harness — LOCALHOST ONLY, same rule as /bpdemo. In production
// /studiodemo falls through to the normal app and never renders sample releases.
const isStudioDemo = path.startsWith("/studiodemo") && isLocalhost && import.meta.env.DEV;
// Profile-editor visual harness — LOCALHOST ONLY. Renders the portal ProfileEditor against a
// real draft company's pp with no auth, so the editor UI/interactions can be tested directly.
const isEditorDemo = path.startsWith("/editordemo") && isLocalhost && import.meta.env.DEV;
const isFeedDemo = path.startsWith("/feeddemo") && isLocalhost && import.meta.env.DEV;
const isPortalDemo = path.startsWith("/portaldemo") && isLocalhost && import.meta.env.DEV;
// The marketing homepage is no longer the front door for the app domain (that's the
// login-gated app now); it stays reachable at /site. BUT on the public marketing
// domain (mineex.ca) the ROOT is the marketing site — the website front door — while
// the app itself lives at /app. Host-gated so passport-xi-five and native are unaffected.
const mkHost = (typeof window !== "undefined" ? window.location.hostname : "").replace(/^www\./, "");
const isMarketingHost = mkHost === "mineex.ca";
const isSiteX = path.startsWith("/sitex") && isLocalhost; // redesigned sales page, dev preview only
const isMarketing = path === "/site" || path.startsWith("/site/") || isMarketingPath(path) || (isMarketingHost && !isNativeApp && (path === "/" || path === ""));
const isLegacySite = path === "/site/legacy" || path.startsWith("/site/legacy/");

const lazyFallback = (label) => (
  <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "#f4f5f7", color: "#94a3b8" }}>Loading {label}…</div>
);

// Android hardware back, wired ONCE for every surface this entry renders.
//
// This cannot live inside a single screen component. @capacitor/app registers an
// always-enabled OnBackPressedCallback, and when no JS "backButton" listener exists
// AND the webview cannot go back it does nothing at all — swallowing the press and
// trapping the user (e.g. on the signed-out welcome screen, where the investor app
// component is not mounted). Wiring here guarantees a back contract always exists.
// No-op unless the Capacitor platform is "android".
wireAndroidBack();

// Stamp the build into every document (sales page AND the app embedded in the phone), so
// the on-device diagnostic can show whether the two are the same build. A service worker
// can serve one from cache and the other from the network, and that mismatch is invisible
// from a test harness, which never has a service worker at all.
try { window.__MX_BUILD = typeof __MX_BUILD__ !== "undefined" ? __MX_BUILD__ : "dev"; } catch (_) {}

const root = ReactDOM.createRoot(document.getElementById("root"));

// Investor sign-in / sign-up card for the app (companies onboard separately on
// desktop). Uses the shared GoTrue client, which clamps public signups to the
// "investor" role and persists the session in localStorage — so once someone is
// in, they stay in across app reopens.
// Wise-style pre-auth welcome for logged-out users: an animated brand splash that
// resolves into the "MineEx" wordmark, auto-advances to a "Get started" landing, then
// a Log in / Register choice that hands off to <InvestorAuth> in the chosen mode.
// Splash plays ONCE, then never again. `splashSeen` guards within one app load (so
// returning from the form via "back" doesn't replay it); localStorage — which the
// Capacitor webview persists across launches — guards cold starts, so a returning
// user never sits through the intro again.
let splashSeen = false;
function splashPersisted() { try { return localStorage.getItem("mx.splashSeen") === "1"; } catch (_) { return false; } }
function persistSplash() { try { localStorage.setItem("mx.splashSeen", "1"); } catch (_) {} }
const WELCOME_GREEN = "#2563eb";   // primary CTA colour (retained for the auth screen)
// Opening splash: the MineEx desktop lockup, centred on a soft gradient, revealed with a gentle
// fade + scale. Short + premium; then it hands straight off to the login / sign-up screen.
const WELCOME_KF = `
@keyframes mxMark{0%{opacity:0;transform:scale(.88)}100%{opacity:1;transform:scale(1)}}
@keyframes mxFade{from{opacity:0}to{opacity:1}}`;
// Native iOS system font — shared by the splash and the auth screen.
const SYS_FONT = "-apple-system, 'SF Pro Text', 'SF Pro Display', system-ui, 'Segoe UI', Roboto, sans-serif";
// The MineEx core-sample mark: a rounded capsule of four stacked bands (brown / rust /
// silver / gold), drawn as crisp SVG so it scales to any size. `size` = height in px.
// `id` must be unique per on-screen instance (clipPath reference).
function MineExMark({ size = 28, id = "mxm" }) {
  const w = Math.round(size * 0.30);
  return (
    <svg width={w} height={size} viewBox="0 0 44 146" aria-hidden style={{ flex: "none" }}>
      <defs><clipPath id={id}><rect x="0" y="0" width="44" height="146" rx="13" /></clipPath></defs>
      <g clipPath={`url(#${id})`}>
        <rect x="0" y="0" width="44" height="36.5" fill="#7a4e33" />
        <rect x="0" y="36.5" width="44" height="36.5" fill="#c4633b" />
        <rect x="0" y="73" width="44" height="36.5" fill="#b6bcc3" />
        <rect x="0" y="109.5" width="44" height="36.5" fill="#d9a24c" />
      </g>
    </svg>
  );
}
// The animated green→blue field from the sales hero (home2/InvestorPage Atmosphere), adapted
// full-bleed behind the splash + auth screens: cobalt / sky / chartreuse blooms drifting on slow
// loops over white, so the black logo and the form stay readable on top.
const ATMO_KF = `
@keyframes mxfa{0%,100%{transform:translate(0,0)}50%{transform:translate(-2%,1.5%)}}
@keyframes mxfb{0%,100%{transform:translate(0,0)}50%{transform:translate(1.5%,-2%)}}
@keyframes mxfc{0%,100%{transform:translate(0,0)}50%{transform:translate(-1.5%,-1.5%)}}
@keyframes mxfd{0%,100%{transform:translate(0,0)}50%{transform:translate(2%,2%)}}
.mxfa{animation:mxfa 22s ease-in-out infinite}.mxfb{animation:mxfb 26s ease-in-out infinite}.mxfc{animation:mxfc 24s ease-in-out infinite}.mxfd{animation:mxfd 28s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){.mxfa,.mxfb,.mxfc,.mxfd{animation:none}}`;
const atmoBlob = (pos, color) => ({ position: "absolute", inset: 0, background: `radial-gradient(90% 82% at ${pos}, ${color}, transparent)` });
// Fine grain over the field — dithers the soft gradient so it doesn't show stepping/banding lines.
const AUTH_GRAIN = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E\")";
function AuthAtmosphere() {
  return (
    <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden", background: "#ffffff" }}>
      <style>{ATMO_KF}</style>
      <span style={{ position: "absolute", inset: 0, background: "linear-gradient(152deg, rgba(37,99,235,.10) 0%, rgba(96,165,250,.08) 38%, rgba(125,211,192,.10) 64%, rgba(198,240,74,.13) 100%)" }} />
      <span className="mxfa" style={atmoBlob("28% 26%", "rgba(37,99,235,.16)")} />
      <span className="mxfb" style={atmoBlob("80% 30%", "rgba(59,130,246,.13)")} />
      <span className="mxfc" style={atmoBlob("72% 82%", "rgba(198,240,74,.18)")} />
      <span className="mxfd" style={atmoBlob("24% 80%", "rgba(147,197,253,.16)")} />
      <div style={{ position: "absolute", inset: 0, opacity: 0.6, mixBlendMode: "multiply", backgroundImage: AUTH_GRAIN }} />
    </div>
  );
}

function WelcomeIntro({ onChoose }) {
  // Just the opening animation now — no "get started" landing. The MineEx desktop lockup reveals
  // on a soft gradient, then we hand straight off to the login / sign-up screen.
  const textRef = useRef(null);
  const [offset, setOffset] = useState(0);   // how far right to start so the mark sits dead-centre
  const [revealed, setRevealed] = useState(false);
  const [leaving, setLeaving] = useState(false);   // fade the splash out before handing off to login
  const GAP = 15;
  // Measure the wordmark before paint so the mark can begin exactly at screen centre.
  useLayoutEffect(() => {
    const w = textRef.current ? textRef.current.offsetWidth : 0;
    setOffset((GAP + w) / 2);
  }, []);
  useEffect(() => {
    splashSeen = true;
    persistSplash();
    // Mark settles first, then the group glides left while the wordmark eases in.
    const r = setTimeout(() => setRevealed(true), 1050);
    const out = setTimeout(() => setLeaving(true), 3150);   // begin the fade-out
    const t = setTimeout(() => onChoose("signin"), 3650);   // hand off once faded to black
    return () => { clearTimeout(r); clearTimeout(out); clearTimeout(t); };
  }, []);
  const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";   // soft, premium settle (ease-out-expo-ish)
  return (
    <div onClick={() => onChoose("signin")} style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 32, overflow: "hidden", background: "#000000", opacity: leaving ? 0 : 1, transition: "opacity .5s ease" }}>
      <style>{WELCOME_KF}</style>
      {/* Mark eases in dead-centre; after a beat the whole group glides left while the
          wordmark fades + slides into place beside it. No clipping — a clean settle. */}
      <div style={{ display: "flex", alignItems: "baseline", gap: GAP, transform: `translateX(${revealed ? 0 : offset}px)`, transition: `transform 1.1s ${EASE}` }}>
        <div style={{ animation: "mxMark 1s cubic-bezier(0.16,1,0.3,1) both" }}>
          <MineExMark size={38} id="mx-splash" />
        </div>
        <span ref={textRef} style={{ display: "block", whiteSpace: "nowrap", fontSize: 54, lineHeight: 1, fontWeight: 800, letterSpacing: "-0.03em", color: "#ffffff", fontFamily: SYS_FONT, opacity: revealed ? 1 : 0, transform: `translateX(${revealed ? 0 : -12}px)`, transition: `opacity 1s ${EASE} .12s, transform 1.1s ${EASE}` }}>MineEx</span>
      </div>
    </div>
  );
}

function InvestorAuth({ onSuccess, initialMode, onBack }) {
  const REMEMBER_KEY = "mineex.rememberEmail.v1";
  const [mode, setMode] = useState(initialMode || "signin"); // signin | signup | forgot
  // Remember the last email across logout so users don't retype it (the password is
  // left to iOS Keychain autofill via the autoComplete attrs — never stored by us).
  const [email, setEmail] = useState(() => { try { return localStorage.getItem(REMEMBER_KEY) || ""; } catch { return ""; } });
  const [remember, setRemember] = useState(true);
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false); // signup: confirmation email sent
  const [sent, setSent] = useState(false);        // forgot: reset link sent
  const [shown, setShown] = useState(false);      // fade the screen in on mount (crossfade from splash)
  useEffect(() => { const id = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(id); }, []);
  // Keep the form reachable when the keyboard is open: track the visible viewport so the
  // screen shrinks to the area above the keyboard and its content scrolls (no plugin needed).
  // Keyboard handling: the webview is NOT resized (resize:"none"). Instead we lift the whole
  // column in ONE smooth transform so the fields + Sign in sit just above the keyboard; the
  // social buttons slide under the opaque keyboard (never half-cut), and it returns on hide.
  const [shiftY, setShiftY] = useState(0);
  const signInRef = useRef(null);
  useEffect(() => {
    if (!isNativeApp) return;
    let subs = [];
    (async () => {
      try {
        const show = await Keyboard.addListener("keyboardWillShow", (info) => {
          const kbH = (info && info.keyboardHeight) || 0;
          const el = signInRef.current;
          if (!el || !kbH) return;
          const avail = window.innerHeight - kbH;            // visible area above the keyboard
          const bottom = el.getBoundingClientRect().bottom;  // at rest (keyboard was down → shift 0)
          setShiftY(Math.max(0, Math.ceil(bottom - avail + 16)));
        });
        const hide = await Keyboard.addListener("keyboardWillHide", () => setShiftY(0));
        subs = [show, hide];
      } catch (_) {}
    })();
    return () => { subs.forEach((s) => s && s.remove && s.remove()); };
  }, []);
  // After the splash→login crossfade (which fades through black) completes, tint the page
  // body to the login's background so the area the keyboard reveals isn't a black gap.
  useEffect(() => {
    const prev = document.body.style.backgroundColor;
    const t = setTimeout(() => { document.body.style.backgroundColor = "#F8F9FB"; }, 650);
    return () => { clearTimeout(t); document.body.style.backgroundColor = prev; };
  }, []);

  // "Remember me" credential: on a device we keep email+password in the iOS Keychain
  // (encrypted, sandboxed) via SecureStorage; on web we only ever remember the email.
  const CRED_KEY = "mineex.cred.v1";
  useEffect(() => {
    if (!isNativeApp) return;
    (async () => {
      try {
        const c = await SecureStorage.get(CRED_KEY);
        if (c && typeof c === "object") { if (c.email) setEmail(c.email); if (c.password) setPassword(c.password); }
      } catch { /* nothing stored yet */ }
    })();
  }, []);

  const go = (m) => { setMode(m); setError(""); };

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      if (mode === "forgot") {
        await requestPasswordReset(email.trim());
        setSent(true);
        return;
      }
      if (mode === "signup") {
        const { session, needsConfirmation } = await signUp(email.trim(), password);
        if (needsConfirmation && !session) { setConfirm(true); return; }
      } else {
        await signIn(email.trim(), password);
      }
      try {
        if (remember) {
          localStorage.setItem(REMEMBER_KEY, email.trim());
          if (isNativeApp) await SecureStorage.set(CRED_KEY, { email: email.trim(), password });
        } else {
          localStorage.removeItem(REMEMBER_KEY);
          if (isNativeApp) await SecureStorage.remove(CRED_KEY);
        }
      } catch {}
      onSuccess && onSuccess();
    } catch (err) {
      setError((err && err.message) || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // Native social sign-in (Apple / Google). Cancellations are silent.
  const social = async (provider) => {
    setError(""); setBusy(true);
    try {
      if (provider === "apple") await signInWithApple();
      else await signInWithGoogle();
      onSuccess && onSuccess();
    } catch (err) {
      const m = (err && err.message) || "Sign-in failed";
      if (!/cancel/i.test(m)) setError(m);
    } finally {
      setBusy(false);
    }
  };

  // Clean, Apple-inspired composition: warm off-white canvas, no gradient. The column is
  // vertically centred and capped for balance on phones of any height; native iOS system
  // font throughout. Branding + welcome are centred; text inside the form stays natural.
  // Scroll container sized to the visible viewport; the inner column is min-height:100% and
  // flex-centred, so content centres when it fits and scrolls from the top (no clipping) when
  // the keyboard shrinks the area.
  const wrap = { height: "100dvh", minHeight: "100dvh", overflow: "hidden", background: "#F8F9FB", position: "relative", zIndex: 1, fontFamily: SYS_FONT, opacity: shown ? 1 : 0, transition: "opacity .5s ease" };
  const colCenter = { minHeight: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", paddingLeft: 24, paddingRight: 24, paddingTop: "calc(env(safe-area-inset-top,0px) + 20px)", paddingBottom: "calc(env(safe-area-inset-bottom,0px) + 20px)", transform: `translateY(${-shiftY}px)`, transition: "transform 0.3s cubic-bezier(0.17,0.59,0.4,1)", willChange: "transform" };
  const inputWrap = { position: "relative", width: "100%" };
  const input = { height: 52, width: "100%", boxSizing: "border-box", borderRadius: 14, border: "1px solid #e5e7eb", padding: "0 44px", fontSize: 16, outline: "none", background: "#ffffff", color: "#111827", fontFamily: SYS_FONT, colorScheme: "light" };
  const inputIcon = { position: "absolute", left: 15, top: "50%", transform: "translateY(-50%)", color: "#9ca3af", pointerEvents: "none", display: "flex" };
  const link = { background: "none", border: "none", color: "#111827", fontWeight: 600, cursor: "pointer", padding: 0, fontSize: 13.5, fontFamily: SYS_FONT };

  if (confirm || sent) {
    const isConfirm = confirm;
    const centerCol = { maxWidth: 320, marginLeft: "auto", marginRight: "auto" };
    return (
      <div style={wrap}>
        <div style={colCenter}>
        <div style={{ textAlign: "center", width: "100%", maxWidth: 440 }}>
          {/* Branded app mark with a cobalt mail badge — the same icon the Welcome flow uses,
              so the confirmation reads as MineEx, not a generic system screen. */}
          <div style={{ display: "inline-flex", position: "relative", marginBottom: 22 }}>
            <img src="/icon-192.png" alt="" style={{ width: 78, height: 78, borderRadius: 19, boxShadow: "0 16px 40px rgba(15,23,42,0.18)" }} />
            <span style={{ position: "absolute", right: -7, bottom: -7, width: 36, height: 36, borderRadius: "50%", background: "#2563eb", display: "grid", placeItems: "center", boxShadow: "0 8px 18px rgba(37,99,235,0.45)", border: "3px solid #fff" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m3.5 7.5 8.5 6 8.5-6" /></svg>
            </span>
          </div>
          <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "#2563eb", margin: 0 }}>MineEx</p>
          <h1 style={{ fontSize: 25, fontWeight: 800, letterSpacing: "-0.02em", color: "#0f172a", margin: "8px 0 0" }}>Check your email</h1>
          <p style={{ fontSize: 14.5, color: "#64748b", marginTop: 10, lineHeight: 1.55, ...centerCol }}>
            {isConfirm
              ? <>We sent a confirmation link to <b style={{ color: "#0f172a" }}>{email}</b>. Tap it, then come back to sign in.</>
              : <>If an account exists for <b style={{ color: "#0f172a" }}>{email}</b>, you'll get a link to reset your password.</>}
          </p>
          <div style={{ marginTop: 18, padding: "11px 14px", background: "#f8fafc", border: "1px solid #eef2f7", borderRadius: 12, fontSize: 12.5, color: "#94a3b8", lineHeight: 1.5, ...centerCol }}>
            Didn't get it? Check your spam folder — delivery can take a minute.
          </div>
          <button onClick={() => { setConfirm(false); setSent(false); go("signin"); }} style={{ marginTop: 22, height: 52, width: "100%", maxWidth: 360, marginLeft: "auto", marginRight: "auto", display: "block", borderRadius: 9999, border: "none", background: "#0f172a", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>Back to sign in</button>
        </div>
        </div>
      </div>
    );
  }

  const title = mode === "signup" ? "Create your account" : mode === "forgot" ? "Reset your password" : "Welcome back";
  const sub = mode === "signup" ? "Follow junior miners and get their updates in one feed. Free for investors."
    : mode === "forgot" ? "Enter your email and we'll send you a reset link."
    : "Sign in to your investor account.";

  return (
    <div style={wrap}>
      {onBack && <button type="button" onClick={onBack} aria-label="Back" style={{ position: "absolute", top: "calc(env(safe-area-inset-top, 0px) + 14px)", left: 18, background: "none", border: "none", fontSize: 26, lineHeight: 1, color: "#111827", cursor: "pointer", padding: "2px 6px", zIndex: 2 }}>‹</button>}
      <div style={colCenter}>
      <div style={{ width: "100%", maxWidth: 440 }}>
      {/* Branding + welcome — centred as a block, deliberate spacing, no gradient behind it */}
      <div style={{ textAlign: "center", marginBottom: 26 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 5 }}>
          <MineExMark size={19} id="mx-login" />
          <span style={{ fontSize: 27, lineHeight: 1, fontWeight: 800, letterSpacing: "-0.03em", color: "#111827" }}>MineEx</span>
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", color: "#111827", margin: "22px 0 0" }}>{title}</h1>
        <p style={{ fontSize: 14.5, color: "#6b7280", marginTop: 8 }}>{sub}</p>
      </div>

      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={inputWrap}>
          <span style={inputIcon}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m3.5 7.5 8.5 6 8.5-6" /></svg>
          </span>
          <input type="email" inputMode="email" autoComplete="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={input} />
        </div>
        {mode !== "forgot" && (
          <div style={inputWrap}>
            <span style={inputIcon}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
            </span>
            <input type={showPw ? "text" : "password"} autoComplete={mode === "signup" ? "new-password" : "current-password"} required placeholder="Password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} style={input} />
            <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Hide password" : "Show password"} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#9ca3af", cursor: "pointer", padding: 8, display: "flex" }}>
              {showPw
                ? <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6 0 10 7 10 7a18 18 0 0 1-3 3.6m-4 1.9A10.9 10.9 0 0 1 12 19C6 19 2 12 2 12a18 18 0 0 1 5-5.6" /><path d="m2 2 20 20" /><path d="M9.5 9.5a3 3 0 0 0 4.2 4.2" /></svg>
                : <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>}
            </button>
          </div>
        )}
        {mode === "signin" && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: "#4b5563", fontWeight: 500, cursor: "pointer" }}>
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} style={{ width: 16, height: 16, accentColor: "#111827" }} />
              Remember me
            </label>
            <button type="button" onClick={() => go("forgot")} style={{ ...link, color: "#6b7280", fontWeight: 500, fontSize: 13 }}>Forgot password?</button>
          </div>
        )}
        {error && <p style={{ fontSize: 13, color: "#dc2626", fontWeight: 600 }}>{error}</p>}
        <button ref={signInRef} type="submit" disabled={busy} style={{ height: 54, borderRadius: 14, border: "none", background: "#111827", color: "#fff", fontSize: 16, fontWeight: 600, fontFamily: SYS_FONT, cursor: "pointer", opacity: busy ? 0.6 : 1, marginTop: 6 }}>
          {busy ? "Please wait…" : mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Sign in"}
        </button>
      </form>

      {isNativeApp && mode !== "forgot" && (appleAvailable() || googleConfigured()) && (
        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 11 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
            <span style={{ fontSize: 13, color: "#9ca3af", fontWeight: 500 }}>or</span>
            <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
          </div>
          {appleAvailable() && (
            <button type="button" onClick={() => social("apple")} disabled={busy} style={{ height: 52, borderRadius: 14, border: "1px solid #e5e7eb", background: "#fff", color: "#111827", fontSize: 15.5, fontWeight: 600, fontFamily: SYS_FONT, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 9, opacity: busy ? 0.6 : 1 }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="#111827" aria-hidden><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" /></svg>
              Continue with Apple
            </button>
          )}
          {googleConfigured() && (
            <button type="button" onClick={() => social("google")} disabled={busy} style={{ height: 52, borderRadius: 14, border: "1px solid #e5e7eb", background: "#fff", color: "#111827", fontSize: 15.5, fontWeight: 600, fontFamily: SYS_FONT, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 9, opacity: busy ? 0.6 : 1 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden><path fill="#4285F4" d="M23.5 12.3c0-.8-.07-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8" /><path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1 .7-2.4 1.1-4 1.1-3 0-5.6-2-6.5-4.8h-4v3C3.5 21.3 7.5 24 12 24" /><path fill="#FBBC05" d="M5.5 14.4a7.2 7.2 0 0 1 0-4.6v-3h-4a12 12 0 0 0 0 10.6z" /><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0 7.5 0 3.5 2.7 1.5 6.8l4 3C6.4 6.8 9 4.8 12 4.8" /></svg>
              Continue with Google
            </button>
          )}
        </div>
      )}

      <p style={{ marginTop: 22, textAlign: "center", fontSize: 14, color: "#6b7280" }}>
        {mode === "signin" && <>New to MineEx? <button type="button" onClick={() => go("signup")} style={link}>Create an account</button></>}
        {mode === "signup" && <>Already have an account? <button type="button" onClick={() => go("signin")} style={link}>Sign in</button></>}
        {mode === "forgot" && <button type="button" onClick={() => go("signin")} style={link}>Back to sign in</button>}
      </p>
      </div>
      </div>
    </div>
  );
}

// Password-reset landing (/reset): the recovery email link arrives here with a token
// in the URL; adopt it as a session, then let the user set a new password.
function ResetPassword() {
  const [ready, setReady] = useState(false);
  const [ok, setOk] = useState(false);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const r = consumeHashSession();
    if (!r || !r.type) setError(r?.error || "This reset link is invalid or has expired. Request a new one.");
    setReady(true);
  }, []);
  const submit = async (e) => {
    e.preventDefault(); setError(""); setBusy(true);
    try { await updatePassword(pw); setOk(true); }
    catch (err) { setError((err && err.message) || "Couldn't reset your password."); }
    finally { setBusy(false); }
  };
  const wrap = { minHeight: "100dvh", display: "flex", flexDirection: "column", justifyContent: "center", padding: "28px 24px", background: "#ffffff", maxWidth: 460, margin: "0 auto" };
  const input = { height: 50, borderRadius: 14, border: "1px solid #e2e8f0", padding: "0 16px", fontSize: 15, outline: "none", background: "#f8fafc" };
  if (!ready) return <div style={{ ...wrap, alignItems: "center", color: "#94a3b8" }}>Loading…</div>;
  if (ok) return (
    <div style={wrap}><div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", margin: 0 }}>Password updated</h1>
      <p style={{ fontSize: 14, color: "#64748b", marginTop: 10 }}>You're all set.</p>
      <a href="/app" style={{ display: "inline-block", marginTop: 22, height: 50, lineHeight: "50px", padding: "0 24px", borderRadius: 14, background: "#0f172a", color: "#fff", fontSize: 15, fontWeight: 700, textDecoration: "none" }}>Open MineEx</a>
    </div></div>
  );
  return (
    <div style={wrap}>
      <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "#2563eb" }}>MineEx</p>
      <h1 style={{ fontSize: 27, fontWeight: 800, letterSpacing: "-0.02em", color: "#0f172a", marginTop: 6 }}>Set a new password</h1>
      <form onSubmit={submit} style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 12 }}>
        <input type="password" autoComplete="new-password" required placeholder="New password" minLength={6} value={pw} onChange={(e) => setPw(e.target.value)} style={input} />
        {error && <p style={{ fontSize: 13, color: "#dc2626", fontWeight: 600 }}>{error}</p>}
        <button type="submit" disabled={busy} style={{ height: 54, borderRadius: 9999, border: "none", background: "#0f172a", color: "#fff", fontSize: 15, fontWeight: 700, opacity: busy ? 0.6 : 1, marginTop: 4 }}>
          {busy ? "Please wait…" : "Update password"}
        </button>
      </form>
      <p style={{ marginTop: 18, textAlign: "center", fontSize: 13.5 }}><a href="/app" style={{ color: "#2563eb", fontWeight: 700, textDecoration: "none" }}>Back to sign in</a></p>
    </div>
  );
}

// Onboarding — shown once to a signed-in investor whose profile isn't complete yet
// (investor_profiles.onboarding_completed = false). Required step (name + investor
// type) is saved via completeOnboarding(), which flips the flag; interests and the
// notification prompt are optional. Also warms the local profile cache so the profile
// shows immediately on entry. Guests (shared/QR links) never see this — the gate in
// AppRoot only runs it for signed-in users. Existing app UI is untouched.
const ONB_TYPES = ["Retail Investor", "Angel Investor", "Institutional", "Fund Manager", "Analyst", "Advisor", "Other"];
const ONB_COMMODITIES = ["Gold", "Silver", "Copper", "Uranium", "Lithium", "Nickel", "Rare Earths", "Zinc", "Cobalt", "Other"];
const ONB_JURISDICTIONS = ["Canada", "USA", "Mexico", "South America", "Australia", "Africa", "Europe", "Asia"];
const ONB_STAGES = ["Grassroots", "Exploration", "Discovery", "Resource", "Development", "Production"];

function InvestorOnboarding({ onDone, onSkip }) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [location, setLocation] = useState("");
  const [commodities, setCommodities] = useState([]);
  const [jurisdictions, setJurisdictions] = useState([]);
  const [stages, setStages] = useState([]);

  const tog = (arr, set, v) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const finish = async () => {
    setBusy(true); setError("");
    try {
      // Required first — this is the write that flips onboarding_completed to true.
      await investorData.completeOnboarding({ name: name.trim(), investorType: type, location: location.trim() });
      // Optional interests — best-effort; a failure here must not block entry.
      if (commodities.length || jurisdictions.length || stages.length) {
        try { await investorData.upsertInvestorPreferences({ commodities, jurisdictions, stages }); } catch (_) {}
      }
      // Warm the local profile cache so the profile tab shows this data immediately.
      try {
        const email = getUser()?.email || "guest";
        localStorage.setItem(`mineex.profile.v1.${email}`, JSON.stringify({ name: name.trim(), investorType: type, location: location.trim() }));
      } catch (_) {}
      onDone && onDone();
    } catch (err) {
      setError((err && err.message) || "Something went wrong. Please try again.");
      setBusy(false);
    }
  };

  const enableNotifsThenFinish = async () => {
    try { if (typeof Notification !== "undefined" && Notification.requestPermission) await Notification.requestPermission(); } catch (_) {}
    finish();
  };

  // Shared styles.
  const input = { height: 52, borderRadius: 14, border: "1px solid #e5e9f0", padding: "0 16px", fontSize: 16, outline: "none", background: "#f7f9fc", width: "100%", boxSizing: "border-box", color: "#0f172a" };
  const cta = (dis) => ({ height: 56, borderRadius: 9999, border: "none", background: "#0f172a", color: "#fff", fontSize: 16, fontWeight: 700, opacity: dis ? 0.4 : 1, cursor: dis ? "default" : "pointer", width: "100%" });
  const skip = { background: "none", border: "none", color: "#64748b", fontWeight: 600, fontSize: 14, cursor: "pointer", padding: "12px 0 2px", width: "100%" };
  const label = { fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginTop: 22, marginBottom: 9, display: "block" };
  const chip = (on) => ({ padding: "9px 15px", borderRadius: 9999, fontSize: 14, fontWeight: 700, cursor: "pointer", border: on ? "1px solid #2563eb" : "1px solid #e5e9f0", background: on ? "#2563eb" : "#fff", color: on ? "#fff" : "#475569", transition: "all .12s" });
  const chipRow = { display: "flex", flexWrap: "wrap", gap: 8 };
  const title = { fontSize: 27, fontWeight: 800, color: "#0f172a", margin: "16px 0 0", letterSpacing: "-0.01em", lineHeight: 1.12 };
  const sub = { fontSize: 14.5, color: "#64748b", marginTop: 8, lineHeight: 1.45 };

  // Full-height frame: progress bar pinned at the top, content top-aligned and
  // scrollable, CTA anchored at the bottom. Honors the notch / home-indicator safe areas.
  // Full-height frame: progress bar pinned at the top, content top-aligned and
  // scrollable, CTA anchored at the bottom. Honors the notch / home-indicator safe
  // areas. Kept as a plain render helper (NOT a nested <Component>) so typing in an
  // input never remounts the subtree and steals focus.
  const frame = (content, footer) => (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", background: "#fff", maxWidth: 480, margin: "0 auto", boxSizing: "border-box", paddingLeft: 22, paddingRight: 22, paddingTop: "calc(env(safe-area-inset-top, 0px) + 22px)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 18px)" }}>
      <div style={{ display: "flex", gap: 6 }}>
        {[0, 1, 2].map((i) => <span key={i} style={{ height: 5, flex: 1, borderRadius: 9999, background: i <= step ? "#2563eb" : "#e8edf2", transition: "background .2s" }} />)}
      </div>
      <div style={{ flex: 1, overflowY: "auto", paddingTop: 8, WebkitOverflowScrolling: "touch" }}>{content}</div>
      <div style={{ paddingTop: 14 }}>{footer}</div>
    </div>
  );

  if (step === 0) {
    const canNext = name.trim() && type;
    return frame(
      <>
        <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "#2563eb", margin: "8px 0 0" }}>Welcome to MineEx</p>
        <h1 style={title}>Complete your profile</h1>
        <p style={sub}>This is shared with companies when you message them — you can edit it anytime.</p>
        <label style={label}>Your name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" style={input} />
        <label style={label}>Investor type</label>
        <div style={chipRow}>{ONB_TYPES.map((t) => <button key={t} type="button" onClick={() => setType(t)} style={chip(type === t)}>{t}</button>)}</div>
        <label style={label}>Location <span style={{ textTransform: "none", color: "#cbd5e1", fontWeight: 600, letterSpacing: 0 }}>(optional)</span></label>
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, Country" style={input} />
        <div style={{ height: 8 }} />
      </>,
      <>
        <button type="button" disabled={!canNext} onClick={() => canNext && setStep(1)} style={cta(!canNext)}>Continue</button>
        {onSkip && <button type="button" onClick={onSkip} style={skip}>Skip for now</button>}
      </>
    );
  }

  if (step === 1) {
    return frame(
      <>
        <h1 style={title}>What are you interested in?</h1>
        <p style={sub}>We'll use this to tailor your feed. All optional.</p>
        <label style={label}>Commodities</label>
        <div style={chipRow}>{ONB_COMMODITIES.map((c) => <button key={c} type="button" onClick={() => tog(commodities, setCommodities, c)} style={chip(commodities.includes(c))}>{c}</button>)}</div>
        <label style={label}>Jurisdictions</label>
        <div style={chipRow}>{ONB_JURISDICTIONS.map((j) => <button key={j} type="button" onClick={() => tog(jurisdictions, setJurisdictions, j)} style={chip(jurisdictions.includes(j))}>{j}</button>)}</div>
        <label style={label}>Company stage</label>
        <div style={chipRow}>{ONB_STAGES.map((s) => <button key={s} type="button" onClick={() => tog(stages, setStages, s)} style={chip(stages.includes(s))}>{s}</button>)}</div>
        <div style={{ height: 8 }} />
      </>,
      <>
        <button type="button" onClick={() => setStep(2)} style={cta(false)}>Continue</button>
        <button type="button" onClick={() => setStep(2)} style={skip}>Skip for now</button>
      </>
    );
  }

  return frame(
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", height: "100%", padding: "0 8px" }}>
      <div style={{ width: 84, height: 84, borderRadius: 24, background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, marginBottom: 22 }}>🔔</div>
      <h1 style={{ ...title, marginTop: 0, textAlign: "center" }}>Never miss an update</h1>
      <p style={{ ...sub, marginTop: 12, maxWidth: 320 }}>Get notified when the companies you follow release drill results, financings, and news.</p>
      {error && <p style={{ fontSize: 13, color: "#dc2626", fontWeight: 600, marginTop: 14 }}>{error}</p>}
    </div>,
    <>
      <button type="button" onClick={enableNotifsThenFinish} disabled={busy} style={cta(busy)}>{busy ? "Setting up…" : "Enable notifications"}</button>
      <button type="button" onClick={finish} disabled={busy} style={skip}>Not now</button>
    </>
  );
}

// Merge a company's REAL published posts (from the `posts` table, via the publish spine)
// into the profile's pp so publishing actually shows on the profile: media → UPDATE_POSTS
// (the Media tab), press releases → PR_YEARS (the Timeline). Static pp entries are kept;
// real posts are prepended/merged newest-first. Best-effort — never blocks the render.
async function mergeCompanyPosts(coId, base) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/posts?company_id=eq.${coId}&removed_at=is.null&select=post_type,title,summary,media_url,thumbnail_url,published_at,publication_id&order=published_at.desc&limit=60`, { headers: base });
  if (!res.ok) return;
  const rows = await res.json().catch(() => []);
  if (!Array.isArray(rows) || !rows.length) return;
  const pp = window.__PP__ || (window.__PP__ = {});
  const isVid = (u) => !!u && /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(u);
  const rel = (d) => { const t = Date.parse(d); if (!t) return ""; const s = (Date.now() - t) / 1000; if (s < 3600) return Math.max(1, Math.round(s / 60)) + "m ago"; if (s < 86400) return Math.round(s / 3600) + "h ago"; const days = Math.round(s / 86400); return days <= 1 ? "Yesterday" : days + "d ago"; };
  // MEDIA → UPDATE_POSTS (Media tab)
  const media = rows.filter((r) => r.post_type === "media").map((r) => ({
    post_type: "media", cat: isVid(r.media_url) ? "Video" : "Photo", video: isVid(r.media_url),
    videoSrc: isVid(r.media_url) ? r.media_url : undefined,
    img: r.thumbnail_url || r.media_url || "", title: r.title || "", desc: r.summary || "", ts: rel(r.published_at),
  }));
  if (media.length) pp.UPDATE_POSTS = [...media, ...(Array.isArray(pp.UPDATE_POSTS) ? pp.UPDATE_POSTS : [])];
  // PRESS RELEASES → PR_YEARS (Timeline)
  const prs = rows.filter((r) => r.post_type !== "media" && r.title);
  if (prs.length) {
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const flat = [];
    (Array.isArray(pp.PR_YEARS) ? pp.PR_YEARS : []).forEach((y) => (y.items || []).forEach((it) => flat.push(it)));
    prs.forEach((r) => {
      const id = String(r.published_at || "").slice(0, 10);
      const m = id.match(/^(\d{4})-(\d{2})-(\d{2})/);
      // De-dupe: the same day and headline, or the full entry the dispatcher already
      // compiled into pp for this publication (pubKey, D1), whatever its date.
      if (flat.some((e) => (String(e.id) === id && e.headline === r.title) || (r.publication_id && e.pubKey === `pub:${r.publication_id}`))) return;
      flat.push({ id, d: m ? `${MON[+m[2] - 1] || ""} ${+m[3]}` : "", headline: r.title, label: r.title, why: r.summary || "", key: false, takeaways: [] });
    });
    const by = {};
    flat.forEach((e) => { const yr = (String(e.id || "").match(/^(\d{4})/) || [])[1] || String(new Date().getFullYear()); (by[yr] = by[yr] || []).push(e); });
    pp.PR_YEARS = Object.keys(by).sort((a, b) => b - a).map((y) => ({ year: y, items: by[y].sort((a, b) => String(b.id || "").localeCompare(String(a.id || ""))) }));
  }
}

// Gate for the investor app: shows the sign-in/up card until a session exists,
// then loads the prototype (seeding window.__PP__ with live company data first).
function AppRoot() {
  const { ready, signedIn } = useAuth();
  const [App, setApp] = useState(null);
  const [seed, setSeed] = useState(0);
  const [loadState, setLoadState] = useState("loading");   // loading | ok | notfound
  const modRef = useRef(null);
  const seededRef = useRef(false);
  // Pre-auth welcome flow: null = show the animated welcome intro; "signin"/"signup" =
  // the user picked an option, so render the auth form in that mode.
  const [authMode, setAuthMode] = useState(null);
  // Android back: the sign-in/register form returns to the welcome intro.
  useBackHandler(!!authMode, () => setAuthMode(null));

  // Live editor preview: when embedded in the admin editor, the parent posts the
  // draft's `pp` object; apply it in place and remount so edits show instantly —
  // no DB round-trip, so it can never fall back to the built-in demo company.
  useEffect(() => {
    const onMsg = (e) => {
      const d = e && e.data;
      if (!d || d.type !== "pp-seed" || !d.pp) return;
      try { window.__PP__ = d.pp; if (modRef.current && modRef.current.applyPP) modRef.current.applyPP(d.pp); } catch (_) {}
      seededRef.current = true;         // an editor is driving this preview
      setLoadState("ok");
      setSeed((s) => s + 1);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  useEffect(() => {
    // Runs for EVERYONE — signed-in or guest. Profiles are public: a QR/shared link
    // opens the full profile in the browser with no signup wall (data loads via the anon
    // key, gated only by "published" RLS). Signing up is an upsell, not a gate.
    let cancelled = false;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const requestedSlug = params.get("c");            // a SPECIFIC company was asked for
      const manageSlug = params.get("manage");          // native "switch to company" (owner) entry
      const isManage = !!manageSlug && !requestedSlug;  // manage a company I'm a member of
      const slug = requestedSlug || manageSlug || "kingsmen-resources";
      const previewToken = params.get("preview");
      let ok = false;

      // The Explore/Today directory is independent of THIS company's profile, but the app
      // cannot mount until window.__DIRECTORY__ exists (PassportProto reads it at module
      // scope). It used to be fetched AFTER the profile, so the profile sat waiting ~335ms
      // on data it never reads. Start it here so the two run concurrently.
      // An EMBEDDED single profile (?c=slug&embed=1 — every marketing phone) renders a company
      // profile and never opens Explore or Today, so it does not need PR_YEARS: the press-release
      // archive of every published company, and by far the heaviest column here. Dropping it for
      // that case cuts the payload roughly in half and gets the profile on screen sooner. The
      // real app is unchanged and still selects everything.
      const embeddedProfile = params.get("embed") === "1" && !!requestedSlug;
      const DIR_COLS = "slug,name,primary_ticker,updated_at,co:profile->pp->COMPANY,brand:profile->brand,cap:profile->capital,tier:profile->pp->TIER,brief:profile->pp->LISTING_BRIEF,ctier:tier";
      // PAGINATED. This request had no limit, which does not mean "no limit" --
      // PostgREST caps a page at 1000 rows and silently returns the first page.
      // With 1421 published companies that left 421 of them, everything after
      // `portofino-resources-inc` alphabetically, absent from window.__DIRECTORY__
      // entirely: invisible in Explore, in Today, and in the Messages composer's
      // company search. It reads as "search is broken" because for ~30% of
      // companies it genuinely returns nothing.
      //
      // PassportProto reads DIRECTORY at MODULE SCOPE, so late-arriving rows are
      // never picked up -- the list has to be complete before the app mounts, and
      // a background top-up is not an option.
      //
      // Cost, measured rather than assumed: page 1 is 0.71 MB / 451 ms, and the
      // remainder is one more round trip. Pages after the first are fetched
      // CONCURRENTLY, so the added latency is one round trip, not one per page.
      //
      // An EMBEDDED profile (?c=slug&embed=1 — every marketing phone) never opens
      // Explore, Today or the composer, so it keeps the single cheap page.
      const dirPromise = (async () => {
        try {
          const h = { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` };
          const cols = embeddedProfile ? DIR_COLS : `${DIR_COLS.replace(",ctier:tier", "")},pr:profile->pp->PR_YEARS,ctier:tier`;
          // order=name,slug: name alone is not unique, and an unstable order across
          // pages can repeat or skip a company at a page boundary.
          const base = `${SUPABASE_URL}/rest/v1/companies?status=eq.published&select=${cols}&order=name,slug`;
          const PAGE = 1000;
          const first = await fetch(`${base}&limit=${PAGE}`, { headers: { ...h, Prefer: "count=exact" } });
          const head = await first.json().catch(() => []);
          if (!Array.isArray(head) || embeddedProfile) return Array.isArray(head) ? head : [];
          // "0-999/1421" -> 1421. Absent or unparseable means take what we have.
          const total = Number((first.headers.get("content-range") || "").split("/")[1]) || head.length;
          if (total <= head.length) return head;
          const rest = [];
          for (let off = head.length; off < total; off += PAGE) {
            rest.push(
              fetch(`${base}&limit=${PAGE}&offset=${off}`, { headers: h })
                .then((r) => (r.ok ? r.json() : []))
                .catch(() => [])
            );
          }
          return head.concat(...(await Promise.all(rest)));
        } catch (_) { return []; }
      })();
      try {
        const base = { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` };
        let coId = null;
        if (params.get("draft") === "1") {
          // DRAFT PREVIEW (?c=<slug>&draft=1): render a LOCAL fixture profile
          // (public/drafts/<slug>.json) for a company not yet in the database, so a Pro profile can
          // be reviewed on any device before it is published. Seeds window.__PP__ exactly the way a
          // real DB row does — no Supabase read, no write. Param-gated: the normal code path is
          // untouched unless ?draft=1 is present, so production is unaffected.
          const fx = await fetch(`/drafts/${encodeURIComponent(slug)}.json`).then((x) => x.json()).catch(() => null);
          if (fx) {
            try { window.__CANON_PROJECTS__ = Array.isArray(fx.projects) ? fx.projects : null; } catch (_) {}
            try { if (fx.ACCOUNT_TIER === undefined) fx.ACCOUNT_TIER = "pro"; } catch (_) {}
            window.__PP__ = fx; ok = true;
          }
        } else if (previewToken) {
          // Admin preview of an unpublished (ready/archived) company — the token-gated
          // RPC bypasses the "published only" RLS so the profile renders in the iframe.
          const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_preview_company`, {
            method: "POST",
            headers: { ...base, "Content-Type": "application/json" },
            body: JSON.stringify({ p_slug: slug, p_token: previewToken }),
          });
          const row = await res.json().catch(() => null);
          // Canonical project data (projects[].drillResults etc.) is the single source of
          // truth the Pro Profile reads for results — captured whether or not a compiled pp exists.
          if (row && row.profile) { try { window.__CANON_PROJECTS__ = Array.isArray(row.profile.projects) ? row.profile.projects : null; } catch (_) {} }
          if (row && row.profile && row.profile.pp) { window.__PP__ = row.profile.pp; try { window.__PP__.ACCOUNT_TIER = row.tier; } catch (_) {} coId = row.id || null; ok = true; }
        } else {
          // Auth-aware read: a signed-in user sends their token so RLS also returns a company
          // they OWN that isn't published yet (so a company can open + manage its own draft).
          let h = base;
          const me = (() => { try { return getUser(); } catch (_) { return null; } })();
          if (me) { try { const tok = await getAccessToken(); if (tok) h = { apikey: SUPABASE_ANON, Authorization: `Bearer ${tok}` }; } catch (_) {} }
          const res = await fetch(
            `${SUPABASE_URL}/rest/v1/companies?slug=eq.${encodeURIComponent(slug)}&select=id,tier,owner_id,pp:profile->pp,projects:profile->projects`,
            { headers: h }
          );
          const rows = await res.json().catch(() => []);
          // Canonical projects[] (source of truth for drill/results) — captured for every
          // company, independent of whether a compiled pp is present.
          if (rows && rows[0]) { try { window.__CANON_PROJECTS__ = Array.isArray(rows[0].projects) ? rows[0].projects : null; } catch (_) {} }
          if (rows && rows[0] && rows[0].pp) {
            window.__PP__ = rows[0].pp; try { window.__PP__.ACCOUNT_TIER = rows[0].tier; } catch (_) {} coId = rows[0].id || null; ok = true;
            // Company account: a signed-in user who MANAGES this company → the Profile tab
            // becomes their editable company profile (+ publish). Reconciled to the canonical
            // authorization model (migration 0006): management is granted by owner_id OR an
            // ACTIVE company_memberships row — matching the server's owns_company()/RLS, which
            // already accepts either. The membership query is RLS-backed (it can only return the
            // caller's own rows), so this is real authorization, never the slug/URL.
            // Roles shipped (0076): only owner/admin get this view (mayManage below); edits
            // then go through /api/profile-draft, which re-checks the role on the server.
            try {
              let coRole = null;
              if (me && rows[0].owner_id && rows[0].owner_id === me.id) {
                coRole = "owner";
              } else if (me && rows[0].id) {
                try {
                  const mres = await fetch(`${SUPABASE_URL}/rest/v1/company_memberships?company_id=eq.${rows[0].id}&user_id=eq.${me.id}&status=eq.active&select=role&limit=1`, { headers: h });
                  const mrows = await mres.json().catch(() => []);
                  if (Array.isArray(mrows) && mrows[0] && mrows[0].role) coRole = mrows[0].role;
                } catch (_) {}
              }
              // The owner view IS the company's profile editor, so it is for the company's
              // OWNERS and ADMINS only (lib/companyProfileEdit.js): another member, or a
              // platform admin without such a membership, gets the investor app.
              const mayManage = coRole === "owner" || coRole === "admin";
              if (mayManage) {
                window.__PP__.COMPANY_ACCOUNT = true;
                window.__CO_ID__ = rows[0].id; window.__CO_SLUG__ = slug; window.__CO_ROLE__ = coRole;
                window.__CO_OWNER_ID__ = rows[0].owner_id || null;   // the editor's role check needs it (an owner may have no membership row)
                // Snapshot the owner's OWN company context. Browsing other companies in-app
                // swaps their data into window.__PP__; the app restores from this when the owner
                // returns to their Profile, so manage mode persists while they navigate.
                window.__CO_PP__ = window.__PP__;
              }
              // Native "manage" entry (?manage=<slug>): authorization is the active membership
              // above — NEVER the URL. If the caller is a verified member, boot into owner mode
              // on the Profile tab; otherwise show nothing of this company and bounce to the
              // investor app (handles stale links, revoked memberships, unauthorized attempts).
              if (isManage) {
                if (mayManage) { try { window.__CO_MANAGE__ = true; } catch (_) {} }
                else { cancelled = true; window.location.replace("/app"); return; }
              }
            } catch (_) {}
          } else if (rows && rows[0] && slug === "kingsmen-resources") {
            // The published Kingsmen row exists but carries no `pp`. Kingsmen is the app's
            // built-in flagship: PassportProto ships the full original profile as its
            // prototype and renders it whenever window.__PP__ is unset. So leave __PP__
            // unset and mark the load OK — the pristine prototype renders. (Any OTHER
            // company still requires its own pp, so it correctly shows "unavailable".)
            ok = true;
          }
        }
        // Surface the company's real published posts (press releases + media) on the profile.
        if (ok && coId && window.__PP__) { try { await mergeCompanyPosts(coId, base); } catch (_) {} }
      } catch (_) { /* handled below */ }

      // Manage-mode safety net: if ?manage=<slug> did NOT resolve to a verified active
      // membership (no pp, no row, lost session, or any load error), never fall through to a
      // half-managed state — bounce to the investor app. Authorization is the membership only.
      if (isManage && !(typeof window !== "undefined" && window.__CO_MANAGE__)) { cancelled = true; try { window.location.replace("/app"); } catch (_) {} return; }

      // The directory feeds Explore + Today. An EMBEDDED single profile (?c=slug&embed=1 —
      // every marketing phone) never shows either, so making it await this query only
      // delayed the profile paint by the length of the request. Build it in the background
      // there, and keep the original blocking behaviour for the real app.
      const buildDirectory = async () => {
        // Load published companies → Explore/search directory + the Today feed (their
        // recent press releases). One query, both derived.
        try {
          const drows = await dirPromise;   // already in flight since boot

          // Parse a "C$41.2M" / "$1.2B" style figure into a number of dollars, for market-cap buckets.
          const money = (v) => {
            const s = String(v || ""); const m = s.replace(/[, ]/g, "").match(/([\d.]+)\s*([bmk])?/i);
            if (!m) return null;
            const n = parseFloat(m[1]); const u = (m[2] || "").toLowerCase();
            return u === "b" ? n * 1e9 : u === "m" ? n * 1e6 : u === "k" ? n * 1e3 : n;
          };
          if (Array.isArray(drows)) {
            window.__DIRECTORY__ = drows.map((r) => {
              const co = r.co || {}, brand = r.brand || {}, cap = r.cap || {};
              const name = r.name || co.name || r.slug;
              const mono = String(name).trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "?";
              return {
                id: r.slug, slug: r.slug, name, live: true,
                ticker: r.primary_ticker || co.ticker || "",
                commodity: co.commodity || "", region: co.jurisdiction || co.region || "",
                stage: co.stage || "", website: co.website || "", headquarters: co.headquarters || "",
                brief: r.brief || co.slogan || "", tier: r.tier || "", updatedAt: r.updated_at || "",
                funding: cap.state || "", mcap: cap.marketCap || "", mcapNum: money(cap.marketCap),
                logo: brand.avatar || brand.logo || "", mono, c: "#334155",
                tags: [name, r.slug, r.primary_ticker, co.commodity, co.jurisdiction].filter(Boolean).join(" ").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean),
              };
            });
            const feed = [];
            // RECENCY SAFEGUARD: only releases from the last N days reach the feed, so a
            // company's back-catalogue of old press releases can never flood it.
            const FEED_MAX_AGE_DAYS = 30;
            const feedCutoff = new Date(Date.now() - FEED_MAX_AGE_DAYS * 86400000).toISOString().slice(0, 10);
            for (const r of drows) {
              // Releases in the feed are a PAID feature (basic/pro). Free/listing companies —
              // incl. demo profiles like Argenta — don't push their profile press releases here.
              if (!["basic", "pro"].includes(r.ctier)) continue;
              const logo = (r.brand && (r.brand.avatar || r.brand.logo)) || "";
              for (const y of (Array.isArray(r.pr) ? r.pr : [])) for (const it of (y.items || [])) {
                if (!it.id) continue;
                if (String(it.id).slice(0, 10) < feedCutoff) continue; // stale release — keep off the feed
                feed.push({
                  coId: r.slug, slug: r.slug, co: r.name, logo, date: it.id,
                  headline: it.headline || it.label || "", key: !!it.key,
                  // Enough for an inline reader on the feed (no navigation needed to read it).
                  whatHappened: it.whatHappened || "", why: it.why || "",
                  takeaways: Array.isArray(it.takeaways) ? it.takeaways : [],
                  originalTitle: it.originalTitle || "",
                });
              }
            }
            feed.sort((a, b) => String(b.date).localeCompare(String(a.date)));
            window.__FEED__ = feed.slice(0, 40);
          }
        } catch (_) {}
      };
      // NOTE: this MUST be awaited. PassportProto reads window.__DIRECTORY__ / __FEED__ when
      // its module first executes, and mounting before they exist makes the app start on the
      // Today feed instead of the requested profile. The win comes from the fetch above
      // already being in flight since boot, not from skipping the wait.
      await buildDirectory();

      const mod = await import("./aiBrief/PassportProto.jsx");
      modRef.current = mod;
      if (cancelled) return;
      // LOCAL-ONLY Contact-card QA fixture (never production). ?contactfixture=full|partial
      // overlays a demo IR contact + company socials/HQ onto the in-memory singletons so the
      // full Contact card can be demoed via a link. It MERGES into the real prototype COMPANY
      // (keeps jurisdiction/commodity/etc.) and only touches COMPANY/CONTACT/tier — never the
      // DB. Runs after the module loads so the prototype data exists to merge onto.
      try {
        const fx = params.get("contactfixture");
        if (fx && /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(location.hostname) && mod.applyPP) {
          const baseCompany = (mod.COMPANY && typeof mod.COMPANY === "object") ? mod.COMPANY : {};
          const company = Object.assign({}, baseCompany, {
            name: baseCompany.name || "Kingsmen Resources",
            website: baseCompany.website || "https://kingsmenresources.com",
            headquarters: fx === "partial" ? "" : "1500 West Georgia St, Vancouver, BC, Canada",
            linkedin: fx === "partial" ? "" : "company/kingsmen-resources",
            twitter: "kingsmenres",
            instagram: fx === "partial" ? "" : "kingsmenresources",
          });
          const contact = fx === "partial"
            ? { name: "Scott Emerson", role: "President & CEO", photo: "", email: "scott@example.com", phone: "" }
            : { name: "Scott Emerson", role: "President & CEO", photo: "https://rvptronniomlqumjhyrr.supabase.co/storage/v1/object/public/company-media/kingsmen/portrait-0-photo-0.jpg", email: "scott@example.com", phone: "+1 604 555 0123" };
          mod.applyPP({ COMPANY: company, CONTACT: contact, ACCOUNT_TIER: "pro" });
        }
      } catch (_) {}
      // LOCAL-ONLY press-release content-block fixture (never production). ?prfixture=1 loads a
      // real Kingsmen release (parsed into text+figure blocks) from /pr-fixture.json and MERGES
      // it into the timeline (PR_YEARS) + FULL so the content-block reader can be demoed. No DB.
      try {
        const pf = params.get("prfixture");
        if (pf && /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(location.hostname) && mod.applyPP) {
          const r = await fetch("/pr-fixture.json").then((x) => x.json()).catch(() => null);
          if (r && Array.isArray(r.years) && r.full) {
            // Full ingest: the real press-release history (text + figure blocks) drives the timeline.
            mod.applyPP({ PR_YEARS: r.years, FULL: r.full, ACCOUNT_TIER: "pro" });
          }
        }
      } catch (_) {}
      // DEV-ONLY MineEx Brief benchmark (?brief=1): load the eight Kingsmen Version-2 Briefs into
      // the timeline from public/brief-bench.json. Each item carries BOTH the current-app fields
      // (why/takeaways, for the in-reader "Current" toggle) and a `v2` object. The full original
      // release (text + figures) rides in FULL. No DB write; overrides only this session's PR data.
      try {
        const _briefGen = params.get("briefgen") === "1";   // dev: load the GENERATED briefs (Phase 1A) instead of the approved benchmark
        if ((params.get("brief") === "1" || _briefGen) && /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(location.hostname) && mod.applyPP) {
          const bb = await fetch(_briefGen ? "/brief-generated.json" : "/brief-bench.json").then((x) => x.json()).catch(() => null);
          if (bb && Array.isArray(bb.dates) && bb.dates.length) {
            const byYear = {};
            for (const d of bb.dates) {
              const v2 = bb.v2[d] || {}, oldf = bb.old[d] || {};
              const dt = new Date(d.slice(0, 10) + "T00:00:00");
              const year = String(dt.getFullYear());
              const dd = dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
              (byYear[year] = byYear[year] || []).push({
                id: d, d: dd,
                headline: v2.head || oldf.headline || "", originalTitle: v2.head || oldf.headline || "",
                label: v2.head || "", key: true,
                why: oldf.why || "", takeaways: Array.isArray(oldf.takeaways) ? oldf.takeaways : [], whatHappened: "",
                v2: { cat: v2.cat, wh: v2.wh, wy: v2.wy, kr: Array.isArray(v2.kr) ? v2.kr : [], bc: v2.bc, tk: v2.tk },
              });
            }
            const PR_YEARS = Object.keys(byYear).sort((a, b) => Number(b) - Number(a))
              .map((year) => ({ year, items: byYear[year].sort((a, b) => (a.id < b.id ? 1 : -1)) }));
            const FULL = {}; for (const d of bb.dates) FULL[d] = bb.full[d] || {};
            try { window.__BRIEF_BENCH__ = true; } catch (_) {}
            mod.applyPP({ PR_YEARS, FULL, ACCOUNT_TIER: "pro" });
          }
        }
      } catch (_) {}
      // Attach the APPROVED Kingsmen v2 Briefs (the settled design — structured Key Results) to the
      // REAL timeline releases by id, and merge their full release text + images, so the normal app
      // shows the v2 Brief we settled on (not the sparse historical fallback) with the full release
      // intact. Keeps every existing release; only adds `v2` to the ones that have an approved brief.
      try {
        // Runs on ANY host (localhost, LAN, production) for the Kingsmen shared/guest view so the
        // web + QR/link profile shows the APPROVED v2 Brief design, not the sparse historical
        // fallback. Scoped to c=kingsmen-resources only; kingsmen-briefs.json ships in the build;
        // applyPP is a client-side session override (no DB write).
        if (!params.get("brief") && !params.get("briefgen")
            && params.get("c") === "kingsmen-resources"
            && mod.applyPP) {
          const bb = await fetch("/kingsmen-briefs.json").then((x) => x.json()).catch(() => null);
          if (bb && bb.v2) {
            const curYears = Array.isArray(mod.PR_YEARS) ? mod.PR_YEARS : [];
            const mergedYears = curYears.map((yr) => ({
              ...yr,
              items: (yr.items || []).map((it) => {
                const v = bb.v2[it.id];
                // `pe` = the plain-English "What Does It Mean" explainer; surfaced at item level so the
                // reader (SummaryContent reads item.plainEnglish) shows it as the standard 2nd section.
                return v ? { ...it, plainEnglish: v.pe || it.plainEnglish || "", v2: { cat: v.cat, wh: v.wh, wy: v.wy, kr: Array.isArray(v.kr) ? v.kr : [], tk: v.tk } } : it;
              }),
            }));
            const mergedFull = { ...(mod.FULL || {}), ...(bb.full || {}) };
            mod.applyPP({ PR_YEARS: mergedYears, FULL: mergedFull });
          }
        }
      } catch (_) {}
      // DEV-ONLY (?newgen=1): inject ONE freshly GENERATED non-Kingsmen V2 Brief (produced by the
      // real generator+validator via scripts/_e2e-brief-test.mjs → public/newgen-test.json) into the
      // timeline so it can be opened in the exact V2 reader. Localhost-only, no DB, nothing published.
      try {
        if (params.get("newgen") === "1" && /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(location.hostname) && mod.applyPP) {
          const ng = await fetch("/newgen-test.json").then((x) => x.json()).catch(() => null);
          if (ng && ng.item && ng.item.v2) {
            const yr = String(ng.date || ng.item.id).slice(0, 4);
            const curYears = Array.isArray(mod.PR_YEARS) ? mod.PR_YEARS : [];
            const dayLabel = (() => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ng.date || ng.item.id)); return m ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : (ng.date || ng.item.id); })();
            const injected = { d: dayLabel, headline: ng.item.headline, originalTitle: ng.item.originalTitle, id: ng.item.id, key: true, label: ng.item.headline, v2: ng.item.v2 };
            let placed = false;
            const mergedYears = curYears.map((y) => {
              if (String(y.year) === yr) { placed = true; return { ...y, items: [injected, ...(y.items || [])] }; }
              return y;
            });
            if (!placed) mergedYears.unshift({ year: Number(yr), items: [injected] });
            const mergedFull = { ...(mod.FULL || {}), [ng.item.id]: ng.full };
            mod.applyPP({ PR_YEARS: mergedYears, FULL: mergedFull });
          }
        }
      } catch (_) {}
      // DEV-ONLY (?briefv1=1): preview the HISTORICAL BriefV1 presentation (Path A) on the REAL
      // timeline data — no fixture, no AI. The reader maps each existing summary's fields into the
      // BriefV1 shell. Default OFF and localhost-gated, so production behaviour is unchanged.
      try {
        if (params.get("briefv1") === "1" && /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(location.hostname)) {
          window.__BRIEF_V1_HISTORICAL__ = true;
        }
      } catch (_) {}
      // LOCAL-ONLY company-account demo (never production). ?companyaccount=1 flips the Profile
      // tab to the company's own editable profile + post button, as if signed in as the company.
      try {
        if (params.get("companyaccount") === "1" && /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(location.hostname) && mod.applyPP) {
          mod.applyPP({ COMPANY_ACCOUNT: true, ACCOUNT_TIER: "pro" });
        }
      } catch (_) {}
      setApp(() => mod.default);
      // A specific company was requested but its data didn't load (e.g. a draft opened
      // without its preview token) → show an honest "unavailable" instead of the demo
      // company. Never applies once an editor has seeded live data via postMessage.
      if (!seededRef.current) setLoadState(requestedSlug && !ok ? "notfound" : "ok");
      // DEV/REVIEW ONLY — attach the APPROVED Kingsmen v2 Briefs (the settled BriefV1 design with
      // structured Key Results) to the REAL timeline releases by id, and merge their full release
      // text + images, so the normal app shows the v2 Brief we settled on (not the sparse historical
      // fallback) with the full release intact. Keeps every existing release; only adds `v2` to the
      // ones that have an approved brief. localhost-gated — no DB, nothing published in production.
      try {
        if (params.get("c") === "kingsmen-resources"
            && /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(location.hostname) && mod.applyPP) {
          const bb = await fetch("/kingsmen-briefs.json").then((x) => x.json()).catch(() => null);
          if (bb && bb.v2) {
            const curYears = Array.isArray(mod.PR_YEARS) ? mod.PR_YEARS : [];
            const mergedYears = curYears.map((yr) => ({
              ...yr,
              items: (yr.items || []).map((it) => {
                const v = bb.v2[it.id];
                // `pe` = the plain-English "What Does It Mean" explainer; surfaced at item level so the
                // reader (SummaryContent reads item.plainEnglish) shows it as the standard 2nd section.
                return v ? { ...it, plainEnglish: v.pe || it.plainEnglish || "", v2: { cat: v.cat, wh: v.wh, wy: v.wy, kr: Array.isArray(v.kr) ? v.kr : [], tk: v.tk } } : it;
              }),
            }));
            const mergedFull = { ...(mod.FULL || {}), ...(bb.full || {}) };
            mod.applyPP({ PR_YEARS: mergedYears, FULL: mergedFull });
          }
        }
      } catch (_) {}
      // Tell a parent editor we're ready to receive live draft data.
      try { if (window.parent && window.parent !== window) window.parent.postMessage({ type: "pp-ready" }, "*"); } catch (_) {}
    })();
    return () => { cancelled = true; };
  }, [signedIn]);

  // Investor onboarding removed: signing in (Apple / Google / email) takes the user straight into
  // the app — no name / investor-type / interest setup questions. Profile details are editable
  // later in the Profile tab. (The InvestorOnboarding component is retained but no longer shown.)

  if (!ready) return lazyFallback("app");
  // Front door. On the WEB the app is freely browsable: a logged-out visitor lands straight in the
  // app as a guest (they can sign in anytime). Only the NATIVE app is login-first. A shared/QR
  // profile link (?c=slug or ?preview=…) is always public with no wall, on either platform. An
  // explicit sign-in intent (?signin deep link OR authMode set in-app) always reaches the form.
  const search = (() => { try { return new URLSearchParams(window.location.search); } catch (_) { return new URLSearchParams(); } })();
  const hasSharedProfile = search.has("c") || search.has("preview");
  const wantsSignIn = search.has("signin") || !!authMode;
  if (!signedIn && (wantsSignIn || (isNativeApp && !hasSharedProfile))) {
    const forced = search.has("signin");
    // First launch plays the opening animation (WelcomeIntro), which then hands off to the auth
    // screen. After that (splash already seen) or on any explicit sign-in intent, go straight to
    // the login / sign-up form — there is no "get started" landing.
    if (forced || authMode || splashSeen || splashPersisted()) {
      return <InvestorAuth initialMode={forced ? "signin" : (authMode || "signin")} onBack={null} />;
    }
    return <WelcomeIntro onChoose={setAuthMode} />;
  }
  if (!App) return lazyFallback("app");
  if (loadState === "notfound") return <ProfileUnavailable />;
  return (
    <>
      <App key={seed} guest={!signedIn} />
    </>
  );
}

function ProfileUnavailable() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#f8fafc", textAlign: "center" }}>
      <div style={{ maxWidth: 340 }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>🔒</div>
        <h1 style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", margin: 0 }}>Profile not available</h1>
        <p style={{ fontSize: 13.5, lineHeight: 1.5, color: "#64748b", marginTop: 8 }}>
          This company isn’t published yet, so it can’t be viewed without its preview link. Open it from the
          admin (it adds the preview token automatically), or publish it to make it public.
        </p>
      </div>
    </div>
  );
}

if (isEditorDemo) {
  // Dev-only profile-editor harness (no auth). Additive; safe to remove.
  root.render(<React.Suspense fallback={lazyFallback("editor")}><EditorDemo /></React.Suspense>);
} else if (isFeedDemo) {
  // Dev-only Today-feed harness (no auth). Additive; safe to remove.
  root.render(<React.Suspense fallback={lazyFallback("feed")}><FeedDemo /></React.Suspense>);
} else if (isPortalDemo) {
  // Dev-only portal-shell harness (no auth). Additive; safe to remove.
  root.render(<React.Suspense fallback={lazyFallback("portal")}><PortalDemo /></React.Suspense>);
} else if (isStudioDemo) {
  // Dev-only Story Studio harness (no auth, no DB). Additive; safe to remove.
  root.render(<React.Suspense fallback={lazyFallback("Story Studio")}><StudioDemo /></React.Suspense>);
} else if (isBpDemo) {
  // Dev-only Blueprint workspace harness (no auth, no DB). Additive; safe to remove.
  root.render(<React.Suspense fallback={lazyFallback("app")}><BlueprintDemo /></React.Suspense>);
} else if (isOnboardDemo) {
  // Dev-only onboarding-workspace harness (loads a real draft via preview token; no auth bypass). Additive; safe to remove.
  root.render(<React.Suspense fallback={lazyFallback("app")}><OnboardDemo /></React.Suspense>);
} else if (isConference) {
  // PRODUCTION standalone Conference Mode booth — its own page, no investor-app bundle. Renders a
  // company's chosen template by ?c=<slug> and QR-links to its Pro profile.
  root.render(<React.Suspense fallback={lazyFallback("app")}><ConferenceBooth /></React.Suspense>);
} else if (isConfV3Demo) {
  // Dev-only Conference V3 harness (real data via preview token; no auth bypass). Additive; safe to remove.
  root.render(<React.Suspense fallback={lazyFallback("app")}><ConferenceV3Demo /></React.Suspense>);
} else if (isTemplatesDemo) {
  // Dev-only Conference Mode template showcase gallery. Additive; safe to remove.
  root.render(<React.Suspense fallback={lazyFallback("app")}><ShowcaseTemplates /></React.Suspense>);
} else if (isPost) {
  // Public deep link to a single release (shared links, notification taps).
  root.render(<React.Suspense fallback={lazyFallback("release")}><PostDetailRoute postId={postId} /></React.Suspense>);
} else if (isReset || hasRecoveryHash) {
  // If the recovery token landed somewhere other than /reset, normalise the path so a
  // refresh keeps working — the form reads the token from the hash, which is preserved.
  try { if (hasRecoveryHash && !isReset) window.history.replaceState(null, "", "/reset" + window.location.hash); } catch (_) {}
  root.render(<ResetPassword />);
} else if (isInvestorDemo) {
  // PRODUCTION chromeless investor-shell render for the marketing phone. Additive; no auth.
  root.render(<React.Suspense fallback={lazyFallback("app")}><InvestorDemo /></React.Suspense>);
} else if (isApp) {
  root.render(<AppRoot />);
} else {
  root.render(
    <React.StrictMode>
      {isPortal ? (
        <DesktopOnly title="The Company Portal is a desktop tool"
          body="The portal needs a larger screen. Open it on a desktop or laptop to manage your company. The MineEx app itself works great on your phone.">
          <AuthGate title="Sign in to your Company Portal" subtitle="Manage your company on MineEx">
            <React.Suspense fallback={lazyFallback("portal")}>
              <PortalGate render={(company, opts) => <Portal company={company} switchCompany={opts?.switchCompany} adminMode={opts?.adminMode} />} />
            </React.Suspense>
          </AuthGate>
        </DesktopOnly>
      ) : isOnboarding ? (
        <DesktopOnly>
          <AuthGate title="Sign in to your company" subtitle="Build and manage your MineEx profile">
            <React.Suspense fallback={lazyFallback("onboarding")}><Onboarding /></React.Suspense>
          </AuthGate>
        </DesktopOnly>
      ) : isStudio ? (
        <DesktopOnly>
          <AuthGate requireAdmin title="Sign in to Story Studio" subtitle="Turn a press release into a designed carousel">
            <React.Suspense fallback={lazyFallback("Story Studio")}><Studio /></React.Suspense>
          </AuthGate>
        </DesktopOnly>
      ) : isAdmin ? (
        <DesktopOnly>
          <AuthGate requireAdmin title="Sign in to Admin" subtitle="MineEx operations console">
            <React.Suspense fallback={lazyFallback("admin")}><Admin /></React.Suspense>
          </AuthGate>
        </DesktopOnly>
      ) : isSiteX ? (
        <React.Suspense fallback={lazyFallback("MineEx")}><MarketingV2 /></React.Suspense>
      ) : isMarketing ? (
        <React.Suspense fallback={lazyFallback("MineEx")}>
          {isLegacySite ? <LegacySite /> : <MarketingSite />}
        </React.Suspense>
      ) : (
        <AppRoot />
      )}
    </React.StrictMode>
  );
}
