// ─────────────────────────────────────────────────────────────────────────────
// ProductStage — mounts ONE live product scene, and only while it is worth having.
//
// This is the rule the Conference gallery broke: sixteen live experiences at once,
// 14,857 nodes and 128MB, and Safari killed the tab. A phone page can afford a live
// product surface; it cannot afford six of them sitting in the document together.
//
// So each scene mounts as it approaches the viewport and unmounts once it is well
// past, which keeps roughly one scene alive at a time on an ordinary scroll. The box
// reserves its height either way, so unmounting never moves the page under a thumb.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useRef, useState } from "react";

export default function ProductStage({ children, minHeight, wash = true }) {
  const ref = useRef(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setLive(true); return; }
    // A quarter viewport of lead-in. A chapter is about one viewport tall, so this keeps
    // ONE scene alive while a chapter is being read and two only while a boundary is
    // crossing the screen — not the six that put Conference at 128MB. The surfaces are
    // plain DOM and their images are lazy, so a quarter screen is ample to paint in.
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => setLive(e.isIntersecting)),
      { rootMargin: "25% 0px 25% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ position: "relative", minHeight, display: "grid", placeItems: "center" }}>
      {wash && (
        <span aria-hidden style={{
          position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          width: "128%", height: "82%", borderRadius: "50%", pointerEvents: "none",
          background: "radial-gradient(closest-side, rgba(37,99,235,0.20), rgba(132,204,22,0.12) 52%, rgba(255,255,255,0) 78%)",
          filter: "blur(10px)",
        }} />
      )}
      <div style={{ position: "relative", width: "100%" }}>{live ? children : null}</div>
    </div>
  );
}
