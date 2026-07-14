import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import Site from "./site/Site.jsx"; // the public marketing site — the front door at "/"
import "./index.css";
import { SUPABASE_URL, SUPABASE_ANON } from "./lib/supabase.js";
import { useAuth } from "./auth/useAuth.js";
import { signIn, signUp } from "./lib/auth.js";

// Surfaces are code-split so the marketing bundle stays lean:
const Onboarding = React.lazy(() => import("./console/CompanyConsole.jsx")); // company console (wraps the builder)
const Admin = React.lazy(() => import("./admin/MissionControl.jsx"));         // Mission Control
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

const path = typeof window !== "undefined" ? window.location.pathname : "/";
const isOnboarding = path.startsWith("/onboarding");
const isAdmin = path.startsWith("/admin");
const isApp = path === "/app" || path.startsWith("/app/") || path.startsWith("/app?");

const lazyFallback = (label) => (
  <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "#f4f5f7", color: "#94a3b8" }}>Loading {label}…</div>
);

const root = ReactDOM.createRoot(document.getElementById("root"));

// Investor sign-in / sign-up card for the app (companies onboard separately on
// desktop). Uses the shared GoTrue client, which clamps public signups to the
// "investor" role and persists the session in localStorage — so once someone is
// in, they stay in across app reopens.
function InvestorAuth({ onSuccess }) {
  const [mode, setMode] = useState("signup"); // signup | signin
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      if (mode === "signup") {
        const { session, needsConfirmation } = await signUp(email.trim(), password);
        if (needsConfirmation && !session) { setConfirm(true); return; }
      } else {
        await signIn(email.trim(), password);
      }
      onSuccess && onSuccess();
    } catch (err) {
      setError((err && err.message) || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const wrap = { minHeight: "100dvh", display: "flex", flexDirection: "column", justifyContent: "center", padding: "28px 24px", background: "#ffffff", maxWidth: 460, margin: "0 auto" };

  if (confirm) {
    return (
      <div style={wrap}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>📬</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", margin: 0 }}>Check your email</h1>
          <p style={{ fontSize: 14, color: "#64748b", marginTop: 10, lineHeight: 1.5 }}>We sent a confirmation link to <b>{email}</b>. Tap it, then come back and sign in.</p>
          <button onClick={() => { setConfirm(false); setMode("signin"); }} style={{ marginTop: 22, fontSize: 14, fontWeight: 700, color: "#059669", background: "none", border: "none" }}>Back to sign in</button>
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "#059669" }}>Passport</p>
      <h1 style={{ fontSize: 27, fontWeight: 800, letterSpacing: "-0.02em", color: "#0f172a", marginTop: 6 }}>
        {mode === "signup" ? "Create your account" : "Welcome back"}
      </h1>
      <p style={{ fontSize: 14, color: "#64748b", marginTop: 6 }}>
        {mode === "signup" ? "Follow junior miners and get their updates in one feed. Free for investors." : "Sign in to your investor account."}
      </p>

      <form onSubmit={submit} style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 12 }}>
        <input
          type="email" inputMode="email" autoComplete="email" required placeholder="Email"
          value={email} onChange={(e) => setEmail(e.target.value)}
          style={{ height: 50, borderRadius: 14, border: "1px solid #e2e8f0", padding: "0 16px", fontSize: 15, outline: "none", background: "#f8fafc" }}
        />
        <input
          type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required placeholder="Password" minLength={6}
          value={password} onChange={(e) => setPassword(e.target.value)}
          style={{ height: 50, borderRadius: 14, border: "1px solid #e2e8f0", padding: "0 16px", fontSize: 15, outline: "none", background: "#f8fafc" }}
        />
        {error && <p style={{ fontSize: 13, color: "#dc2626", fontWeight: 600 }}>{error}</p>}
        <button
          type="submit" disabled={busy}
          style={{ height: 50, borderRadius: 14, border: "none", background: "#0f172a", color: "#fff", fontSize: 15, fontWeight: 700, opacity: busy ? 0.6 : 1, marginTop: 4 }}
        >
          {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
        </button>
      </form>

      <p style={{ marginTop: 18, textAlign: "center", fontSize: 13.5, color: "#64748b" }}>
        {mode === "signup" ? "Already have an account? " : "New to Passport? "}
        <button
          onClick={() => { setError(""); setMode(mode === "signup" ? "signin" : "signup"); }}
          style={{ fontWeight: 700, color: "#0f172a", background: "none", border: "none" }}
        >
          {mode === "signup" ? "Sign in" : "Create one"}
        </button>
      </p>
      <p style={{ marginTop: 20, textAlign: "center", fontSize: 11.5, color: "#94a3b8", lineHeight: 1.5 }}>
        Are you a company? <a href="/onboarding" style={{ color: "#64748b", fontWeight: 600 }}>Set up your profile on desktop →</a>
      </p>
    </div>
  );
}

// Gate for the investor app: shows the sign-in/up card until a session exists,
// then loads the prototype (seeding window.__PP__ with live company data first).
function AppRoot() {
  const { ready, signedIn } = useAuth();
  const [App, setApp] = useState(null);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    (async () => {
      try {
        const slug = new URLSearchParams(window.location.search).get("c") || "kingsmen-resources";
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/companies?slug=eq.${encodeURIComponent(slug)}&select=pp:profile->pp`,
          { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } }
        );
        const rows = await res.json().catch(() => []);
        if (rows && rows[0] && rows[0].pp) window.__PP__ = rows[0].pp;
      } catch (_) { /* fall back to built-in reference data */ }
      const mod = await import("./aiBrief/PassportProto.jsx");
      if (!cancelled) setApp(() => mod.default);
    })();
    return () => { cancelled = true; };
  }, [signedIn]);

  if (!ready) return lazyFallback("app");
  if (!signedIn) return <InvestorAuth />;
  if (!App) return lazyFallback("app");
  return <App />;
}

if (isApp) {
  root.render(<AppRoot />);
} else {
  root.render(
    <React.StrictMode>
      {isOnboarding ? (
        <DesktopOnly>
          <AuthGate title="Sign in to your company" subtitle="Build and manage your Passport profile">
            <React.Suspense fallback={lazyFallback("onboarding")}><Onboarding /></React.Suspense>
          </AuthGate>
        </DesktopOnly>
      ) : isAdmin ? (
        <DesktopOnly>
          <AuthGate requireAdmin title="Sign in to Admin" subtitle="Passport operations console">
            <React.Suspense fallback={lazyFallback("admin")}><Admin /></React.Suspense>
          </AuthGate>
        </DesktopOnly>
      ) : (
        <Site />
      )}
    </React.StrictMode>
  );
}
