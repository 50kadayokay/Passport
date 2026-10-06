// src/lib/useBackHandler.js — React binding for the back registry.
//
// Usage, one line at the component that owns an overlay:
//
//   useBackHandler(!!reader, () => setReader(null));
//
// With several overlays in one component, collapse them into a single call and make
// the precedence explicit rather than relying on registration order:
//
//   useBackHandler(!!(viewer || sheet), () => {
//     if (viewer) return setViewer(null);
//     setSheet(null);
//   });
//
// Inert on web and iOS: nothing consumes the registry there (see backStack.js).
import { useEffect, useRef } from "react";
import { pushBackHandler, BACK_PRIORITY } from "./backStack.js";

export { BACK_PRIORITY };

export function useBackHandler(active, onBack, priority = BACK_PRIORITY.OVERLAY) {
  // Keep the newest callback without re-registering: re-registering on every render
  // would churn the registry and, because ties break by registration order, could
  // silently reorder precedence mid-interaction.
  const cb = useRef(onBack);
  cb.current = onBack;

  useEffect(() => {
    if (!active) return undefined;
    return pushBackHandler(() => cb.current && cb.current(), priority);
  }, [active, priority]);
}

export default useBackHandler;
