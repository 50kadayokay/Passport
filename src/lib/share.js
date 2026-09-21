// src/lib/share.js — one share entry point for every platform.
//
// WHY
// MineEx has two share surfaces (the media viewer and the story reader) and both
// called navigator.share directly. Measured on an Android 16 / API 36 WebView:
//
//   { hasNavigatorShare: "undefined", hasCanShare: "undefined",
//     clipboard: "function", secureContext: true, ua: "... Android 16 ... wv" }
//
// The Web Share API simply does not exist in the Android System WebView (it does
// in WKWebView), so Android silently degraded to a clipboard copy — and on the
// story reader, to a copy with no feedback at all. This routes Android to the
// native share sheet while leaving iOS and web exactly as they were.
//
// DELIBERATELY NOT A FALLBACK CHAIN
// This helper never touches the clipboard. Each call site keeps its own fallback
// and its own wording, so iOS/web behaviour stays byte-identical and the two
// surfaces don't get silently homogenised.
//
// It also never builds a URL. Callers pass the app's existing canonical links
// (the /app?c=<slug> company URL and the /n/<id> news URL); no new URL format is
// introduced here.
import { Capacitor } from "@capacitor/core";

/** Result statuses. `shared` and `cancelled` both mean "we are done". */
export const SHARE_SHARED = "shared";
export const SHARE_CANCELLED = "cancelled";
export const SHARE_UNSUPPORTED = "unsupported";
export const SHARE_FAILED = "failed";

function platform() {
  try { return Capacitor.getPlatform(); } catch (_) { return "web"; }
}

/**
 * Share a title/text/url.
 *
 * @returns {Promise<{status: "shared"|"cancelled"|"unsupported"|"failed"}>}
 *
 *   shared      the sheet was shown and the user picked a target
 *   cancelled   the user dismissed the sheet — NOT an error, and explicitly not
 *               a reason to copy anything to the clipboard
 *   unsupported no share mechanism on this platform — the caller should fall
 *               back (clipboard) exactly as it did before
 *   failed      a genuine failure — the caller may fall back
 */
export async function shareContent({ title, text, url } = {}) {
  if (platform() === "android") {
    try {
      const { Share } = await import("@capacitor/share");
      await Share.share({
        ...(title ? { title } : {}),        // -> Intent.EXTRA_SUBJECT
        ...(text ? { text } : {}),          // -> Intent.EXTRA_TEXT (url appended by the plugin)
        ...(url ? { url } : {}),
        ...(title ? { dialogTitle: title } : {}),
      });
      return { status: SHARE_SHARED };
    } catch (e) {
      const m = String((e && e.message) || e);
      // The Android plugin rejects with "Share canceled" on RESULT_CANCELED, and
      // with "Can't share while sharing is in progress" on a double-tap. Neither
      // is a failure, and neither should trigger a clipboard copy.
      if (/cancel/i.test(m) || /in progress/i.test(m)) return { status: SHARE_CANCELLED };
      return { status: SHARE_FAILED };
    }
  }

  // iOS + web: unchanged. WKWebView and mobile browsers implement the Web Share
  // API, and — exactly as the previous inline code did — ANY rejection ends the
  // flow rather than falling through to the clipboard (a Web Share rejection is
  // overwhelmingly an AbortError from the user dismissing the sheet).
  try {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      await navigator.share({ ...(title ? { title } : {}), ...(text ? { text } : {}), ...(url ? { url } : {}) });
      return { status: SHARE_SHARED };
    }
  } catch (_) {
    return { status: SHARE_CANCELLED };
  }
  return { status: SHARE_UNSUPPORTED };
}

/** True when the caller should run its own clipboard fallback. */
export function shouldFallback(result) {
  const s = result && result.status;
  return s === SHARE_UNSUPPORTED || s === SHARE_FAILED;
}

export default shareContent;
