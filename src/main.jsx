import React from "react";
import ReactDOM from "react-dom/client";
import Site from "./site/Site.jsx"; // the public marketing site — the front door at "/"
import "./index.css";
import { SUPABASE_URL, SUPABASE_ANON } from "./lib/supabase.js";

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

// The investor app is your prototype fed by live data. We fetch the company's
// data object and set window.__PP__ BEFORE importing the app, so its module-level
// consts pick it up (falling back to built-in data if the fetch fails).
async function bootApp() {
  root.render(lazyFallback("app"));
  try {
    const slug = new URLSearchParams(window.location.search).get("c") || "kingsmen-resources";
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/companies?slug=eq.${encodeURIComponent(slug)}&select=pp:profile->pp`,
      { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } }
    );
    const rows = await res.json().catch(() => []);
    if (rows && rows[0] && rows[0].pp) window.__PP__ = rows[0].pp;
  } catch (_) { /* fall back to the app's built-in reference data */ }
  const { default: App } = await import("./aiBrief/PassportProto.jsx");
  root.render(<App />);
}

if (isApp) {
  bootApp();
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
