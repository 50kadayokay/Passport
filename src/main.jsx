import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { SUPABASE_URL, SUPABASE_ANON } from "./lib/supabase.js";
import { useAuth } from "./auth/useAuth.js";
import { signIn, signUp, requestPasswordReset, consumeHashSession, updatePassword, getUser, signInWithApple, signInWithGoogle, googleConfigured } from "./lib/auth.js";
import * as investorData from "./lib/investorData.js";
import { isNativeApp } from "./lib/platform.js";
import { wireAndroidBack } from "./lib/androidBack.js"; // Android hardware back (no-op on web/iOS)
import { useBackHandler } from "./lib/useBackHandler.js";
import { SecureStorage } from "@aparajita/capacitor-secure-storage"; // iOS Keychain for "Remember me"

// Surfaces are code-split so the marketing bundle stays lean:
const Onboarding = React.lazy(() => import("./console/CompanyConsole.jsx")); // company console (wraps the builder)
const Admin = React.lazy(() => import("./admin/MissionControl.jsx"));         // Mission Control
const Portal = React.lazy(() => import("./portal/Portal.jsx"));               // Company Portal (desktop, paying companies)
const Studio = React.lazy(() => import("./studio/Studio.tsx"));                // Story Studio (desktop, admin) — release → carousel/video
const PortalGate = React.lazy(() => import("./portal/PortalGate.jsx"));       // resolves company + entitlement
const EditorDemo = React.lazy(() => import("./portal/EditorDemo.jsx"));       // localhost-only editor harness
const FeedDemo = React.lazy(() => import("./aiBrief/FeedDemo.jsx"));          // localhost-only Today-feed harness
const PortalDemo = React.lazy(() => import("./portal/PortalDemo.jsx"));       // localhost-only portal-shell harness
const PostDetailRoute = React.lazy(() => import("./aiBrief/Feed.jsx").then((m) => ({ default: m.PostDetailRoute }))); // /p/<id> deep link
const BlueprintDemo = React.lazy(() => import("./admin/blueprints/BlueprintDemo.jsx")); // /bpdemo — dev harness (no auth/DB), removable
const OnboardDemo = React.lazy(() => import("./admin/onboarding/OnboardDemo.jsx")); // /onboarddemo — dev harness (no auth), removable
const ConferenceV3Demo = React.lazy(() => import("./aiBrief/conferenceV3/ConferenceV3Demo.jsx")); // /confv3demo — dev harness (no auth), removable
const ConferenceBooth = React.lazy(() => import("./aiBrief/conferenceV3/ConferenceV3Booth.jsx")); // /conference — PRODUCTION standalone iPad booth
const ShowcaseTemplates = React.lazy(() => import("./marketing/ShowcaseTemplates.jsx")); // /templatesdemo — template showcase gallery (dev), removable
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
import AuthGate from "./auth/AuthGate.jsx";

// Surfaces are split by URL path:
//   /onboarding  → the desktop-only company builder (not reachable from the app)
//   anything else → the mobile consumer app
// Onboarding is gated to wide screens so it can't be used on a phone.
function DesktopOnly({ children }) {
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
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: 0 }}>Onboarding is a desktop tool</h1>
        <p style={{ fontSize: 14, color: "#64748b", marginTop: 10, lineHeight: 1.5 }}>
          Building a company profile needs a larger screen. Open this page on a desktop or laptop to continue. The Passport app itself works great on your phone.
        </p>
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
const isReset = path === "/reset" || path.startsWith("/reset");
// Blueprint workspace dev harness — LOCALHOST ONLY. In production /bpdemo falls through
// to the normal app (never renders sample Blueprint content publicly).
const isLocalhost = (() => {
  try { const h = window.location.hostname; return h === "localhost" || h === "127.0.0.1"; } catch (_) { return false; }
})();
const isBpDemo = path.startsWith("/bpdemo") && isLocalhost;
const isOnboardDemo = path.startsWith("/onboarddemo") && isLocalhost && import.meta.env.DEV;
const isConfV3Demo = path.startsWith("/confv3demo") && isLocalhost && import.meta.env.DEV;
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
const isMarketing = path === "/site" || path.startsWith("/site/") || (isMarketingHost && !isNativeApp && (path === "/" || path === ""));
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

const root = ReactDOM.createRoot(document.getElementById("root"));

// Investor sign-in / sign-up card for the app (companies onboard separately on
// desktop). Uses the shared GoTrue client, which clamps public signups to the
// "investor" role and persists the session in localStorage — so once someone is
// in, they stay in across app reopens.
// Wise-style pre-auth welcome for logged-out users: an animated brand splash that
// resolves into the "MineEx" wordmark, auto-advances to a "Get started" landing, then
// a Log in / Register choice that hands off to <InvestorAuth> in the chosen mode.
// Splash only plays on the first view per app load (splashSeen) so returning from the
// form via "back" doesn't replay the intro.
let splashSeen = false;
const WELCOME_GREEN = "#2563eb";
// Splash logo reveal: the icon tile rises in large and centred, then dissolves down
// into the "M" (same slot) while "ineEx" completes the wordmark — so the logo "merges"
// into the M of MineEx. mxLockup nudges the whole lockup left (~38px ≈ half of "ineEx")
// so the M reads as centred before the rest appears.
const WELCOME_KF = `
@keyframes mxLockup{0%,52%{transform:translateX(38px)}100%{transform:translateX(0)}}
@keyframes mxMerge{0%{opacity:0;transform:translateY(16px) scale(1.5)}28%{opacity:1;transform:translateY(0) scale(1.5)}58%{opacity:1;transform:scale(1.08)}82%,100%{opacity:0;transform:scale(.62)}}
@keyframes mxM{0%,64%{opacity:0}86%,100%{opacity:1}}
@keyframes mxRest{0%,68%{opacity:0;transform:translateX(-6px)}100%{opacity:1;transform:translateX(0)}}
@keyframes mxFade{from{opacity:0}to{opacity:1}}`;

function WelcomeIntro({ onChoose }) {
  const [phase, setPhase] = useState(splashSeen ? "start" : "splash"); // splash | start | choose

  useEffect(() => {
    if (phase !== "splash") return;
    splashSeen = true;
    const t = setTimeout(() => setPhase("start"), 2600);
    return () => clearTimeout(t);
  }, [phase]);

  const frame = { minHeight: "100dvh", display: "flex", flexDirection: "column", background: "#fff", maxWidth: 480, margin: "0 auto", boxSizing: "border-box", paddingLeft: 22, paddingRight: 22, paddingTop: "calc(env(safe-area-inset-top, 0px) + 22px)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" };
  const ctaGreen = { height: 56, borderRadius: 9999, border: "none", background: WELCOME_GREEN, color: "#fff", fontSize: 16, fontWeight: 700, width: "100%", cursor: "pointer" };
  const ctaLight = { height: 56, borderRadius: 9999, border: "none", background: "#f1f5f9", color: "#0f172a", fontSize: 16, fontWeight: 700, width: "100%", cursor: "pointer", marginTop: 10 };
  const h1 = { fontSize: 29, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em", lineHeight: 1.1, margin: "26px 0 0" };
  const sub = { fontSize: 15, color: "#64748b", marginTop: 12, lineHeight: 1.45, maxWidth: 320 };

  if (phase === "splash") {
    return (
      <div onClick={() => setPhase("start")} style={{ position: "fixed", inset: 0, background: WELCOME_GREEN, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{WELCOME_KF}</style>
        <div style={{ display: "inline-flex", alignItems: "center", animation: "mxLockup 1.9s cubic-bezier(.2,.8,.2,1) both" }}>
          <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 44, height: 54 }}>
            <img src="/icon-192.png" alt="" style={{ position: "absolute", width: 52, height: 52, borderRadius: 13, boxShadow: "0 14px 44px rgba(0,0,0,.20)", animation: "mxMerge 1.9s cubic-bezier(.2,.8,.2,1) both" }} />
            <span style={{ position: "absolute", fontSize: 46, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em", animation: "mxM 1.9s ease both" }}>M</span>
          </span>
          <span style={{ fontSize: 46, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em", animation: "mxRest 1.9s ease both" }}>ineEx</span>
        </div>
      </div>
    );
  }

  if (phase === "start") {
    return (
      <div style={frame} key="start">
        <style>{WELCOME_KF}</style>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", animation: "mxFade .45s both" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle at 50% 45%, #dbeafe 0%, #ffffff 70%)" }}>
            <img src="/icon-512.png" alt="" style={{ width: 148, height: 148, borderRadius: 34, boxShadow: "0 18px 50px rgba(15,23,42,.16)" }} />
          </div>
          <h1 style={h1}>Every junior miner,<br />in one feed.</h1>
          <p style={sub}>Follow explorers and developers and get their news the moment it breaks.</p>
        </div>
        <button type="button" onClick={() => setPhase("choose")} style={ctaGreen}>Get started</button>
      </div>
    );
  }

  return (
    <div style={frame} key="choose">
      <style>{WELCOME_KF}</style>
      <button type="button" onClick={() => setPhase("start")} aria-label="Back" style={{ alignSelf: "flex-start", background: "none", border: "none", fontSize: 26, lineHeight: 1, color: "#0f172a", cursor: "pointer", padding: "2px 4px", marginLeft: -4 }}>‹</button>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", animation: "mxFade .35s both" }}>
        <img src="/icon-192.png" alt="" style={{ width: 84, height: 84, borderRadius: 21, boxShadow: "0 12px 34px rgba(15,23,42,.14)" }} />
        <h1 style={h1}>One account for the<br />whole market</h1>
        <p style={sub}>Free for investors. Create an account or sign in to continue.</p>
      </div>
      <button type="button" onClick={() => onChoose("signup")} style={ctaGreen}>Create account</button>
      <button type="button" onClick={() => onChoose("signin")} style={ctaLight}>Log in</button>
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false); // signup: confirmation email sent
  const [sent, setSent] = useState(false);        // forgot: reset link sent

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

  const wrap = { minHeight: "100dvh", display: "flex", flexDirection: "column", justifyContent: "center", padding: "28px 24px", background: "#ffffff", maxWidth: 460, margin: "0 auto" };
  const input = { height: 50, borderRadius: 14, border: "1px solid #e2e8f0", padding: "0 16px", fontSize: 15, outline: "none", background: "#f8fafc" };
  const link = { background: "none", border: "none", color: "#2563eb", fontWeight: 700, cursor: "pointer", padding: 0, fontSize: 13.5 };

  if (confirm || sent) {
    const isConfirm = confirm;
    return (
      <div style={wrap}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>{isConfirm ? "📬" : "🔑"}</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", margin: 0 }}>Check your email</h1>
          <p style={{ fontSize: 14, color: "#64748b", marginTop: 10, lineHeight: 1.5 }}>
            {isConfirm
              ? <>We sent a confirmation link to <b>{email}</b>. Tap it, then come back and sign in.</>
              : <>If an account exists for <b>{email}</b>, we've sent a link to reset your password.</>}
          </p>
          <button onClick={() => { setConfirm(false); setSent(false); go("signin"); }} style={{ marginTop: 22, ...link, fontSize: 14 }}>Back to sign in</button>
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
      {onBack && <button type="button" onClick={onBack} aria-label="Back" style={{ position: "absolute", top: "calc(env(safe-area-inset-top, 0px) + 14px)", left: 18, background: "none", border: "none", fontSize: 26, lineHeight: 1, color: "#0f172a", cursor: "pointer", padding: "2px 6px" }}>‹</button>}
      <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "#2563eb" }}>MineEx</p>
      <h1 style={{ fontSize: 27, fontWeight: 800, letterSpacing: "-0.02em", color: "#0f172a", marginTop: 6 }}>{title}</h1>
      <p style={{ fontSize: 14, color: "#64748b", marginTop: 6 }}>{sub}</p>

      <form onSubmit={submit} style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 12 }}>
        <input type="email" inputMode="email" autoComplete="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={input} />
        {mode !== "forgot" && (
          <input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required placeholder="Password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} style={input} />
        )}
        {mode === "signin" && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: -2 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "#475569", fontWeight: 600, cursor: "pointer" }}>
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} style={{ width: 16, height: 16, accentColor: "#0f172a" }} />
              Remember me
            </label>
            <button type="button" onClick={() => go("forgot")} style={{ ...link, color: "#64748b", fontSize: 12.5 }}>Forgot password?</button>
          </div>
        )}
        {error && <p style={{ fontSize: 13, color: "#dc2626", fontWeight: 600 }}>{error}</p>}
        <button type="submit" disabled={busy} style={{ height: 54, borderRadius: 9999, border: "none", background: "#0f172a", color: "#fff", fontSize: 15, fontWeight: 700, opacity: busy ? 0.6 : 1, marginTop: 4 }}>
          {busy ? "Please wait…" : mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Sign in"}
        </button>
      </form>

      {isNativeApp && mode !== "forgot" && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
            <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>or</span>
            <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
          </div>
          <button type="button" onClick={() => social("apple")} disabled={busy} style={{ height: 50, borderRadius: 12, border: "none", background: "#0f172a", color: "#fff", fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: busy ? 0.6 : 1 }}>
             Continue with Apple
          </button>
          {googleConfigured() && (
            <button type="button" onClick={() => social("google")} disabled={busy} style={{ height: 50, borderRadius: 12, border: "1px solid #e2e8f0", background: "#fff", color: "#0f172a", fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: busy ? 0.6 : 1 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: "#4285F4" }}>G</span> Continue with Google
            </button>
          )}
        </div>
      )}

      <p style={{ marginTop: 20, textAlign: "center", fontSize: 13.5, color: "#64748b" }}>
        {mode === "signin" && <>New to MineEx? <button type="button" onClick={() => go("signup")} style={link}>Create an account</button></>}
        {mode === "signup" && <>Already have an account? <button type="button" onClick={() => go("signin")} style={link}>Sign in</button></>}
        {mode === "forgot" && <button type="button" onClick={() => go("signin")} style={link}>Back to sign in</button>}
      </p>

      <p style={{ marginTop: 14, textAlign: "center", fontSize: 11.5, color: "#94a3b8", lineHeight: 1.5 }}>
        Are you a company? <a href="/onboarding" style={{ color: "#64748b", fontWeight: 600 }}>Set up your profile on desktop →</a>
      </p>
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

function InvestorOnboarding({ onDone }) {
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
      <button type="button" disabled={!canNext} onClick={() => canNext && setStep(1)} style={cta(!canNext)}>Continue</button>
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
  const res = await fetch(`${SUPABASE_URL}/rest/v1/posts?company_id=eq.${coId}&removed_at=is.null&select=post_type,title,summary,media_url,thumbnail_url,published_at&order=published_at.desc&limit=60`, { headers: base });
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
      if (flat.some((e) => String(e.id) === id && e.headline === r.title)) return; // de-dupe
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
  // Onboarding gate: "checking" until we know, then "needed" | "done". Only consulted
  // for signed-in users; guests viewing a shared profile bypass it entirely.
  const [onbState, setOnbState] = useState("checking");
  // Pre-auth welcome flow: null = show the animated welcome intro; "signin"/"signup" =
  // the user picked an option, so render the auth form in that mode.
  const [authMode, setAuthMode] = useState(null);
  // Android back: the sign-in/register form returns to the welcome intro.
  useBackHandler(!!authMode, () => setAuthMode(null));

  // When a session appears, ask the cloud whether this investor has finished onboarding.
  // Fail-open (treat as done) on any error so a transient fetch failure never traps a
  // real user on the onboarding screen.
  useEffect(() => {
    if (!signedIn) { setOnbState("checking"); return; }
    let cancelled = false;
    investorData.getInvestorProfile()
      .then((p) => { if (!cancelled) setOnbState(p && p.onboardingCompleted ? "done" : "needed"); })
      .catch(() => { if (!cancelled) setOnbState("done"); });
    return () => { cancelled = true; };
  }, [signedIn]);

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
      const slug = requestedSlug || "kingsmen-resources";
      const previewToken = params.get("preview");
      let ok = false;
      try {
        const base = { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` };
        let coId = null;
        if (previewToken) {
          // Admin preview of an unpublished (ready/archived) company — the token-gated
          // RPC bypasses the "published only" RLS so the profile renders in the iframe.
          const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_preview_company`, {
            method: "POST",
            headers: { ...base, "Content-Type": "application/json" },
            body: JSON.stringify({ p_slug: slug, p_token: previewToken }),
          });
          const row = await res.json().catch(() => null);
          if (row && row.profile && row.profile.pp) { window.__PP__ = row.profile.pp; try { window.__PP__.ACCOUNT_TIER = row.tier; } catch (_) {} coId = row.id || null; ok = true; }
        } else {
          const res = await fetch(
            `${SUPABASE_URL}/rest/v1/companies?slug=eq.${encodeURIComponent(slug)}&select=id,tier,pp:profile->pp`,
            { headers: base }
          );
          const rows = await res.json().catch(() => []);
          if (rows && rows[0] && rows[0].pp) {
            window.__PP__ = rows[0].pp; try { window.__PP__.ACCOUNT_TIER = rows[0].tier; } catch (_) {} coId = rows[0].id || null; ok = true;
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

      // Load published companies → Explore/search directory + the Today feed (their
      // recent press releases). One query, both derived.
      try {
        const base = { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` };
        const dres = await fetch(`${SUPABASE_URL}/rest/v1/companies?status=eq.published&select=slug,name,primary_ticker,updated_at,co:profile->pp->COMPANY,brand:profile->brand,cap:profile->capital,tier:profile->pp->TIER,brief:profile->pp->LISTING_BRIEF,pr:profile->pp->PR_YEARS,ctier:tier&order=name`, { headers: base });
        const drows = await dres.json().catch(() => []);
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

      const mod = await import("./aiBrief/PassportProto.jsx");
      modRef.current = mod;
      if (cancelled) return;
      setApp(() => mod.default);
      // A specific company was requested but its data didn't load (e.g. a draft opened
      // without its preview token) → show an honest "unavailable" instead of the demo
      // company. Never applies once an editor has seeded live data via postMessage.
      if (!seededRef.current) setLoadState(requestedSlug && !ok ? "notfound" : "ok");
      // Tell a parent editor we're ready to receive live draft data.
      try { if (window.parent && window.parent !== window) window.parent.postMessage({ type: "pp-ready" }, "*"); } catch (_) {}
    })();
    return () => { cancelled = true; };
  }, [signedIn]);

  if (!ready) return lazyFallback("app");
  // Login-first front door: opening the app while logged out shows the sign-in screen.
  // The one exception is a shared/QR profile link (?c=slug or ?preview=…) — those stay
  // publicly viewable with no wall, so a scanned booth QR or a shared link just works.
  const search = (() => { try { return new URLSearchParams(window.location.search); } catch (_) { return new URLSearchParams(); } })();
  const hasSharedProfile = search.has("c") || search.has("preview");
  if (!signedIn && (!hasSharedProfile || search.has("signin"))) {
    // A direct ?signin deep-link jumps straight to the sign-in form (no welcome intro).
    const forced = search.has("signin");
    if (forced || authMode) {
      return <InvestorAuth initialMode={forced ? "signin" : authMode} onBack={forced ? null : () => setAuthMode(null)} />;
    }
    return <WelcomeIntro onChoose={setAuthMode} />;
  }
  // Signed-in investors must finish onboarding before entering the app. Guests (viewing
  // a shared/QR profile without a session) skip this and go straight to the profile.
  if (signedIn) {
    if (onbState === "checking") return lazyFallback("app");
    if (onbState === "needed") return <InvestorOnboarding onDone={() => setOnbState("done")} />;
  }
  if (!App) return lazyFallback("app");
  if (loadState === "notfound") return <ProfileUnavailable />;
  return <App key={seed} guest={!signedIn} />;
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
} else if (isReset) {
  root.render(<ResetPassword />);
} else if (isApp) {
  root.render(<AppRoot />);
} else {
  root.render(
    <React.StrictMode>
      {isPortal ? (
        <DesktopOnly>
          <AuthGate title="Sign in to your Company Portal" subtitle="Manage your company on Passport">
            <React.Suspense fallback={lazyFallback("portal")}>
              <PortalGate render={(company, opts) => <Portal company={company} switchCompany={opts?.switchCompany} adminMode={opts?.adminMode} />} />
            </React.Suspense>
          </AuthGate>
        </DesktopOnly>
      ) : isOnboarding ? (
        <DesktopOnly>
          <AuthGate title="Sign in to your company" subtitle="Build and manage your Passport profile">
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
          <AuthGate requireAdmin title="Sign in to Admin" subtitle="Passport operations console">
            <React.Suspense fallback={lazyFallback("admin")}><Admin /></React.Suspense>
          </AuthGate>
        </DesktopOnly>
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
