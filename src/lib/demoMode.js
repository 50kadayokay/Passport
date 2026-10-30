// Is this the dev-only portal demo harness?
//
// THREE conditions, all required, and the first is the one that matters:
// import.meta.env.DEV is replaced by the literal `false` in a production build,
// so every `if (isPortalDemo())` branch becomes dead code and is eliminated --
// taking the dynamic import of the fixtures with it. The demo data cannot reach
// a production bundle even by mistake, because it is not IN the bundle.
//
// The other two (localhost, /portaldemo) keep it out of the way during ordinary
// local development of the real, authenticated portal at /portal.
export function isPortalDemo() {
  try {
    if (!import.meta.env || !import.meta.env.DEV) return false;
    if (typeof window === "undefined") return false;
    const h = window.location.hostname;
    if (h !== "localhost" && h !== "127.0.0.1") return false;
    return window.location.pathname.startsWith("/portaldemo");
  } catch (_) {
    return false;
  }
}

/* ───────────────────────────────────────────────────────────────────────────
   DEMO ISOLATION
   ───────────────────────────────────────────────────────────────────────────
   The audit found that demo safety rested on an accident: every write path --
   publishing, Supabase mutations, /api/conference-inquiry -- was reachable from
   /portaldemo and blocked only because the harness has no session. Sign in once
   and the demo starts writing to production. One endpoint did not even need
   that: /api/conference-inquiry takes no auth by design, and a test submission
   from the demo reached the real sales table.

   So isolation is no longer "nobody is logged in". It is two layers:

     1. GUARDS at each known write, so a blocked action produces a clear message
        instead of a mystery network error.
     2. A FETCH BARRIER installed for the demo route, which refuses every
        mutating request regardless of which code issued it. This is the layer
        that holds when someone adds a write next month and forgets layer 1.

   Both are keyed on isPortalDemo(), which is itself dead-code-eliminated from
   production builds -- so none of this exists in a shipped bundle.                */

/** Thrown by a guarded write. Carries `demoBlocked` so callers can recognise it. */
export class DemoBlockedError extends Error {
  constructor(what) {
    super(`${what} is disabled in the demo. Nothing was sent to production.`);
    this.name = "DemoBlockedError";
    this.demoBlocked = true;
  }
}

/** Refuse a production write when running in the demo. Call at the top of one. */
export function guardDemoWrite(what) {
  if (import.meta.env && import.meta.env.DEV && isPortalDemo()) throw new DemoBlockedError(what);
}

/** True when a guarded write would be refused. For UI that wants to say so first. */
export const demoWritesBlocked = () => !!(import.meta.env && import.meta.env.DEV && isPortalDemo());

/* What the barrier lets through. Everything else that mutates is refused.
   Reads are untouched: the demo legitimately loads the sandbox company and its
   public profile, which is how it stays a faithful preview rather than a mock. */
const ALLOWED_MUTATIONS = [
  // The sandbox company itself is fetched through a token RPC, which is a POST
  // that reads. Named explicitly so the barrier does not break the harness.
  /\/rest\/v1\/rpc\/get_preview_company\b/,
];

const MUTATING = /^(POST|PUT|PATCH|DELETE)$/i;

let installed = false;

/**
 * Install the barrier. Idempotent, and a no-op outside the demo.
 *
 * Returns a description of what it did, so a test can assert the barrier is
 * actually on rather than trusting that it was called.
 */
export function installDemoFetchBarrier() {
  if (!(import.meta.env && import.meta.env.DEV && isPortalDemo())) return { installed: false, reason: "not the demo" };
  if (installed) return { installed: true, reason: "already installed" };
  if (typeof window === "undefined" || typeof window.fetch !== "function") {
    return { installed: false, reason: "no fetch" };
  }

  const real = window.fetch.bind(window);
  window.__mineexDemoBarrier = { blocked: [], allowed: 0 };

  window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    const method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();

    if (!MUTATING.test(method)) return real(input, init);
    if (ALLOWED_MUTATIONS.some((re) => re.test(url))) {
      window.__mineexDemoBarrier.allowed++;
      return real(input, init);
    }

    // Vite's own dev traffic (HMR pings, module graph) must not be refused, or
    // the harness stops reloading.
    if (/\/@vite\/|\/@id\/|\/node_modules\/\.vite\//.test(url)) return real(input, init);

    window.__mineexDemoBarrier.blocked.push({ url: String(url).slice(0, 200), method, at: Date.now() });
    // A refusal shaped like a server response, so callers take their existing
    // error path instead of throwing something they have never seen.
    return new Response(
      JSON.stringify({
        error: "Blocked by the MineEx demo barrier.",
        detail: "The demo never writes to production. This request was not sent.",
        demoBlocked: true, method, url: String(url).slice(0, 200),
      }),
      { status: 403, headers: { "content-type": "application/json" } }
    );
  };

  installed = true;
  return { installed: true, reason: "barrier active" };
}

/** What the barrier has refused this session. For the test harness and debugging. */
export const demoBarrierLog = () =>
  (typeof window !== "undefined" && window.__mineexDemoBarrier) || { blocked: [], allowed: 0 };
