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

// Android-only native flag. Android 15+/targetSdk 36 forces edge-to-edge: the WebView
// draws BEHIND the system navigation bar, so bottom-anchored UI (e.g. the tab bar) must
// add env(safe-area-inset-bottom) to clear it. iOS already clears its home indicator with
// fixed padding, so this flag lets us add the Android inset WITHOUT touching iOS layout.
export const isAndroidApp = (() => {
  try {
    if (typeof window === "undefined") return false;
    const cap = window.Capacitor;
    if (cap && typeof cap.getPlatform === "function") return cap.getPlatform() === "android";
    return false;
  } catch (_) {
    return false;
  }
})();
