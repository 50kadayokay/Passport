// Passport booth PWA service worker.
// Purpose: let a conference iPad run the booth fully OFFLINE after one online load.
// Strategy:
//   • navigations  → network-first, falling back to the cached app shell (/app)
//   • DATA (Supabase REST /rest/v1/) → NETWORK-FIRST, so a company's profile is always fresh
//                     (an edit/restore shows immediately); cache is only an offline fallback.
//                     Previously cache-first, which served stale "frozen" profiles after edits.
//   • assets/images → cache-first (same- AND cross-origin: JS/CSS, Fontshare/Google fonts,
//                     Supabase Storage images), revalidating in the background
// Bump CACHE_VERSION on a breaking change to evict old caches.
const CACHE_VERSION = "passport-booth-v5";
const SHELL = ["/app", "/manifest.webmanifest", "/booth-icon.svg"];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function cachePut(req, res) {
  // Store successful same-origin (200) and opaque cross-origin responses only.
  if (!res || (res.status !== 200 && res.type !== "opaque")) return;
  caches.open(CACHE_VERSION).then((c) => c.put(req, res)).catch(() => {});
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  // Page navigations → try the network, fall back to the cached shell when offline.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => { cachePut(req, res.clone()); return res; })
        .catch(() => caches.match(req).then((r) => r || caches.match("/app")))
    );
    return;
  }

  // DATA (Supabase REST) → NETWORK-FIRST: always try the live network so profile edits show
  // immediately; fall back to the cached copy only when offline.
  if (/\/rest\/v1\//.test(req.url)) {
    e.respondWith(
      fetch(req)
        .then((res) => { cachePut(req, res.clone()); return res; })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Assets, fonts, images → serve from cache first (instant + offline), and refresh the
  // cached copy in the background when a network is available.
  e.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req)
        .then((res) => { cachePut(req, res.clone()); return res; })
        .catch(() => cached);
      return cached || net;
    })
  );
});
