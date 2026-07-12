import React from "react";
import ReactDOM from "react-dom/client";
import Site from "./site/Site.jsx"; // the public marketing site — the front door at "/"
import "./index.css";

// Surfaces are code-split so the marketing bundle stays lean:
const App = React.lazy(() => import("./aiBrief/App.jsx"));                    // investor app at /app
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

ReactDOM.createRoot(document.getElementById("root")).render(
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
    ) : isApp ? (
      <React.Suspense fallback={lazyFallback("app")}><App /></React.Suspense>
    ) : (
      <Site />
    )}
  </React.StrictMode>
);
