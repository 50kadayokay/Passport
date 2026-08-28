// Native (Capacitor) detection + backend base URL.
//
// In the native iOS shell the app is served from capacitor://localhost, so a
// relative "/api/..." fetch has no server behind it — those calls must target the
// deployed Vercel backend instead. On the web the app is same-origin with its API,
// so the base stays empty (relative paths work as before).
export const isNativeApp = (() => {
  try {
    if (typeof window === "undefined") return false;
    if (/^capacitor:/i.test(window.location.protocol)) return true;
    const cap = window.Capacitor;
    return !!(cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform());
  } catch (_) {
    return false;
  }
})();

export const API_BASE = isNativeApp ? "https://passport-xi-five.vercel.app" : "";
