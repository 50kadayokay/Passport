import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom/client";
import Site from "./site/Site.jsx"; // the public marketing site — the front door at "/"
import "./index.css";
import { SUPABASE_URL, SUPABASE_ANON } from "./lib/supabase.js";
import { useAuth } from "./auth/useAuth.js";
import { signIn, signUp } from "./lib/auth.js";

// Surfaces are code-split so the marketing bundle stays lean:
const Onboarding = React.lazy(() => import("./console/CompanyConsole.jsx")); // company console (wraps the builder)
const Admin = React.lazy(() => import("./admin/MissionControl.jsx"));         // Mission Control
const Portal = React.lazy(() => import("./portal/Portal.jsx"));               // Company Portal (desktop, paying companies)
const PortalGate = React.lazy(() => import("./portal/PortalGate.jsx"));       // resolves company + entitlement
const PostDetailRoute = React.lazy(() => import("./aiBrief/Feed.jsx").then((m) => ({ default: m.PostDetailRoute }))); // /p/<id> deep link
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
const isPortal = path.startsWith("/portal");
const isPost = /^\/p\/[^/]+/.test(path);
const postId = isPost ? decodeURIComponent(path.replace(/^\/p\//, "").split(/[/?#]/)[0]) : null;
const isApp = path === "/app" || path.startsWith("/app/") || path.startsWith("/app?");
// The marketing homepage is no longer the front door (that's the login-gated app now);
// it stays reachable at /site for linking from ads, decks, etc.
const isMarketing = path === "/site" || path.startsWith("/site/");

const lazyFallback = (label) => (
  <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "#f4f5f7", color: "#94a3b8" }}>Loading {label}…</div>
);

const root = ReactDOM.createRoot(document.getElementById("root"));

// Investor sign-in / sign-up card for the app (companies onboard separately on
// desktop). Uses the shared GoTrue client, which clamps public signups to the
// "investor" role and persists the session in localStorage — so once someone is
// in, they stay in across app reopens.
function InvestorAuth({ onSuccess }) {
  const [mode, setMode] = useState("signin"); // login-only for investors; company signup lives on desktop /onboarding
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
  const [seed, setSeed] = useState(0);
  const [loadState, setLoadState] = useState("loading");   // loading | ok | notfound
  const modRef = useRef(null);
  const seededRef = useRef(false);

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
        if (previewToken) {
          // Admin preview of an unpublished (ready/archived) company — the token-gated
          // RPC bypasses the "published only" RLS so the profile renders in the iframe.
          const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_preview_company`, {
            method: "POST",
            headers: { ...base, "Content-Type": "application/json" },
            body: JSON.stringify({ p_slug: slug, p_token: previewToken }),
          });
          const row = await res.json().catch(() => null);
          if (row && row.profile && row.profile.pp) { window.__PP__ = row.profile.pp; ok = true; }
        } else {
          const res = await fetch(
            `${SUPABASE_URL}/rest/v1/companies?slug=eq.${encodeURIComponent(slug)}&select=pp:profile->pp`,
            { headers: base }
          );
          const rows = await res.json().catch(() => []);
          if (rows && rows[0] && rows[0].pp) { window.__PP__ = rows[0].pp; ok = true; }
        }
      } catch (_) { /* handled below */ }

      // Load published companies → Explore/search directory + the Today feed (their
      // recent press releases). One query, both derived.
      try {
        const base = { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` };
        const dres = await fetch(`${SUPABASE_URL}/rest/v1/companies?status=eq.published&select=slug,name,primary_ticker,co:profile->pp->COMPANY,brand:profile->brand,cap:profile->capital,pr:profile->pp->PR_YEARS&order=name`, { headers: base });
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
              funding: cap.state || "", mcap: cap.marketCap || "", mcapNum: money(cap.marketCap),
              logo: brand.avatar || brand.logo || "", mono, c: "#334155",
              tags: [name, r.slug, r.primary_ticker, co.commodity, co.jurisdiction, cap.state].filter(Boolean).join(" ").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean),
            };
          });
          const feed = [];
          for (const r of drows) {
            const logo = (r.brand && (r.brand.avatar || r.brand.logo)) || "";
            for (const y of (Array.isArray(r.pr) ? r.pr : [])) for (const it of (y.items || [])) {
              if (!it.id) continue;
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
  if (!signedIn && (!hasSharedProfile || search.has("signin"))) return <InvestorAuth />;
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

if (isPost) {
  // Public deep link to a single release (shared links, notification taps).
  root.render(<React.Suspense fallback={lazyFallback("release")}><PostDetailRoute postId={postId} /></React.Suspense>);
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
      ) : isAdmin ? (
        <DesktopOnly>
          <AuthGate requireAdmin title="Sign in to Admin" subtitle="Passport operations console">
            <React.Suspense fallback={lazyFallback("admin")}><Admin /></React.Suspense>
          </AuthGate>
        </DesktopOnly>
      ) : isMarketing ? (
        <Site />
      ) : (
        <AppRoot />
      )}
    </React.StrictMode>
  );
}
