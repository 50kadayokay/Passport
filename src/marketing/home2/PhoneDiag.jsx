// ─────────────────────────────────────────────────────────────────────────────
// PhoneDiag — on-device diagnostics for the simulated phone, opened with ?mxdiag=1.
//
// Why this exists: the reported displacement does not reproduce in headless Chrome at an
// iPhone viewport, so measuring it here proves nothing about iOS Safari. This records the
// real session on the real device instead, and makes the log exportable without Safari
// Web Inspector.
//
// It measures VISIBLE elements only. An earlier DOM probe matched hidden pages inside the
// app (data-page read "today" at every state) and reported perfect numbers while the
// device was visibly wrong — so every element here is resolved by what is actually painted
// at a point on screen, via elementFromPoint inside the frame, not by selector.
//
// Development instrument. Renders nothing unless ?mxdiag=1 is present.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useRef, useState } from "react";

export const diagOn = () => {
  try { return new URLSearchParams(window.location.search).get("mxdiag") === "1"; }
  catch (_) { return false; }
};

// Toggles for isolating the cause, each independently switchable on the device.
export const diagFlag = (name) => {
  try { return new URLSearchParams(window.location.search).get(name) === "1"; }
  catch (_) { return false; }
};

const r6 = (n) => (typeof n === "number" ? Math.round(n * 10) / 10 : n);

function readFrame(frameEl) {
  // Everything below is read from the frame's own document, in ITS coordinate space, and
  // reported alongside the parent-space rect of the frame so the two can be related.
  const out = { ok: false };
  try {
    const doc = frameEl.contentDocument;
    const win = frameEl.contentWindow;
    if (!doc || !win) return out;
    const W = win.innerWidth, H = win.innerHeight;
    // What is ACTUALLY painted at the top, middle and bottom of the simulated screen.
    const at = (y) => {
      const el = doc.elementFromPoint(Math.round(W / 2), y);
      if (!el) return null;
      const q = el.getBoundingClientRect();
      const cs = win.getComputedStyle(el);
      return {
        tag: el.tagName.toLowerCase() + (el.className && typeof el.className === "string"
          ? "." + el.className.split(" ").filter(Boolean).slice(0, 2).join(".") : ""),
        top: r6(q.top), bottom: r6(q.bottom),
        pos: cs.position, tf: cs.transform === "none" ? "none" : cs.transform,
      };
    };
    // Every scroller with a non-zero offset — the thing that retains displacement.
    const scrolled = [];
    doc.querySelectorAll("*").forEach((el) => {
      if (el.scrollTop) {
        scrolled.push({
          el: el.tagName.toLowerCase() + (el.className && typeof el.className === "string"
            ? "." + el.className.split(" ").filter(Boolean).slice(0, 2).join(".") : ""),
          top: Math.round(el.scrollTop), range: el.scrollHeight - el.clientHeight,
          oy: win.getComputedStyle(el).overflowY,
        });
      }
    });
    const vv = win.visualViewport;
    out.ok = true;
    out.innerW = W; out.innerH = H;
    out.docScroll = Math.round(doc.scrollingElement ? doc.scrollingElement.scrollTop : 0);
    out.winScrollY = Math.round(win.scrollY || 0);
    out.bodyTop = r6(doc.body.getBoundingClientRect().top);
    out.bodyTf = win.getComputedStyle(doc.body).transform;
    out.htmlOverflow = win.getComputedStyle(doc.documentElement).overflow;
    out.visual = vv ? { w: r6(vv.width), h: r6(vv.height), ox: r6(vv.offsetLeft), oy: r6(vv.offsetTop), scale: r6(vv.scale) } : null;
    out.paintedTop = at(2);
    out.paintedMid = at(Math.round(H / 2));
    out.paintedBottom = at(H - 3);
    out.scrolled = scrolled.slice(0, 6);
    out.build = (win.__MX_BUILD || null);
  } catch (e) { out.err = String(e).slice(0, 80); }
  return out;
}

export default function PhoneDiag({ state, label }) {
  const [log, setLog] = useState([]);
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState("");
  const lastRef = useRef(null);

  const sample = useCallback((why) => {
    const frameEl = document.querySelector('iframe[src*="embed=1"], iframe[src*="/appdemo"]');
    const openEl = Array.from(document.querySelectorAll("div")).find((el) => {
      const q = el.getBoundingClientRect();
      return q.height > 200 && el.getAttribute("aria-hidden") === "true"
        && /rgb\(244, 245, 247\)/.test(getComputedStyle(el).backgroundColor);
    });
    const fr = frameEl ? frameEl.getBoundingClientRect() : null;
    const op = openEl ? openEl.getBoundingClientRect() : null;
    const inner = frameEl ? readFrame(frameEl) : { ok: false };
    const entry = {
      t: Math.round(performance.now()),
      why, state, label,
      parentBuild: (typeof window !== "undefined" && window.__MX_BUILD) || null,
      opening: op ? { top: r6(op.top), bottom: r6(op.bottom), h: r6(op.height) } : null,
      frame: fr ? { top: r6(fr.top), bottom: r6(fr.bottom), h: r6(fr.height) } : null,
      frameTf: frameEl ? getComputedStyle(frameEl).transform : null,
      // the number that matters: frame vs opening, and what is painted at the screen edges
      dTop: op && fr ? r6(fr.top - op.top) : null,
      dBottom: op && fr ? r6(fr.bottom - op.bottom) : null,
      pageVisual: (typeof window !== "undefined" && window.visualViewport)
        ? { h: r6(window.visualViewport.height), oy: r6(window.visualViewport.offsetTop), scale: r6(window.visualViewport.scale) } : null,
      inner,
    };
    lastRef.current = entry;
    setLog((L) => [...L.slice(-299), entry]);
  }, [state, label]);

  // Before / during / after every state change, so the first moving frame is identifiable.
  useEffect(() => {
    sample("state:enter");
    const a = setTimeout(() => sample("state:+250ms"), 250);
    const b = setTimeout(() => sample("state:+900ms"), 900);
    const c = setTimeout(() => sample("state:settled"), 2000);
    return () => { clearTimeout(a); clearTimeout(b); clearTimeout(c); };
  }, [state, sample]);

  // Also sample on any touch, so a finger-induced shift is captured even without a state change.
  useEffect(() => {
    const onTouch = () => sample("touchend");
    window.addEventListener("touchend", onTouch, { passive: true });
    return () => window.removeEventListener("touchend", onTouch);
  }, [sample]);

  const exportLog = async () => {
    const text = JSON.stringify(log, null, 1);
    try { await navigator.clipboard.writeText(text); setCopied("copied to clipboard"); }
    catch (_) {
      try {
        const blob = new Blob([text], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = "mineex-phone-diag.json"; a.click();
        setCopied("downloaded");
      } catch (e) { setCopied("copy failed — screenshot the panel"); }
    }
    setTimeout(() => setCopied(""), 2500);
  };

  const L = lastRef.current;
  const drift = L && (Math.abs(L.dTop || 0) > 1 || Math.abs(L.dBottom || 0) > 1);

  return (
    <div style={{
      position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 99999,
      background: "rgba(5,7,10,0.94)", color: "#dfe6f0", font: "11px/1.35 ui-monospace,Menlo,monospace",
      padding: "8px 10px", maxHeight: open ? "46vh" : 30, overflow: "auto",
      borderTop: `2px solid ${drift ? "#ff5d5d" : "#2f6"}`,
    }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: open ? 6 : 0 }}>
        <b style={{ color: drift ? "#ff8a8a" : "#7df9a8" }}>{drift ? "DRIFT" : "aligned"}</b>
        <span>state {String(state)}</span>
        <span style={{ opacity: 0.7 }}>{label}</span>
        <button onClick={exportLog} style={{ marginLeft: "auto", font: "inherit", padding: "3px 8px", borderRadius: 5, border: "1px solid #456", background: "#17202c", color: "#cfe" }}>export</button>
        <button onClick={() => setOpen((o) => !o)} style={{ font: "inherit", padding: "3px 8px", borderRadius: 5, border: "1px solid #456", background: "#17202c", color: "#cfe" }}>{open ? "hide" : "show"}</button>
      </div>
      {copied && <div style={{ color: "#7df9a8" }}>{copied}</div>}
      {open && L && (
        <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
{`frame vs opening   dTop ${L.dTop}  dBottom ${L.dBottom}
opening            ${L.opening ? L.opening.top + " → " + L.opening.bottom : "-"}
frame              ${L.frame ? L.frame.top + " → " + L.frame.bottom : "-"}
page visualVP      ${L.pageVisual ? `h ${L.pageVisual.h} offsetTop ${L.pageVisual.oy} scale ${L.pageVisual.scale}` : "-"}
--- inside the simulated phone ---
inner viewport     ${L.inner.innerW}x${L.inner.innerH}   docScroll ${L.inner.docScroll}   winScrollY ${L.inner.winScrollY}
body top / tf      ${L.inner.bodyTop} / ${L.inner.bodyTf}
inner visualVP     ${L.inner.visual ? `h ${L.inner.visual.h} offsetTop ${L.inner.visual.oy} scale ${L.inner.visual.scale}` : "-"}
painted @top       ${L.inner.paintedTop ? `${L.inner.paintedTop.tag} top ${L.inner.paintedTop.top} pos ${L.inner.paintedTop.pos}` : "-"}
painted @bottom    ${L.inner.paintedBottom ? `${L.inner.paintedBottom.tag} bottom ${L.inner.paintedBottom.bottom} pos ${L.inner.paintedBottom.pos}` : "-"}
scrolled elements  ${L.inner.scrolled && L.inner.scrolled.length ? L.inner.scrolled.map((s) => `${s.el}=${s.top}/${s.range}`).join("  ") : "none"}
builds             parent ${L.parentBuild || "?"}   inner ${L.inner.build || "?"}
samples captured   ${log.length}`}
        </pre>
      )}
    </div>
  );
}
