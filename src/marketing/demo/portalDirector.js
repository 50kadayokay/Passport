// ─────────────────────────────────────────────────────────────────────────────
// portalDirector — same-origin orchestration helpers for the Company Portal chapter.
//
// The Portal chapter renders the REAL ProfileEditor inside a same-origin iframe
// (WorkspaceFrame → /site?portaldemo=1). These helpers let the marketing layer
// DIRECT that real editor — navigate its tabs, focus a field, and apply ONE
// in-memory edit — exactly the way a person would, by driving its real DOM.
//
// Nothing here fetches, authenticates, or writes. The tagline edit goes through the
// editor's own React onChange (native value setter + input event), so it updates the
// same in-memory `pp` state the live preview reads. No product code is modified; the
// editor's injected-profile mode already guarantees no Supabase/auth/save side effects.
// ─────────────────────────────────────────────────────────────────────────────

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function getDoc(iframeEl) { try { return (iframeEl && iframeEl.contentDocument) || null; } catch (_) { return null; } }
export function getWin(iframeEl) { try { return (iframeEl && iframeEl.contentWindow) || null; } catch (_) { return null; } }

// Click a real nav item (top tab or left step) by its exact visible label. Prefers an
// actual button/role=button so navigation reliably fires (a bare text node may not handle click).
export function clickNav(doc, label) {
  if (!doc) return false;
  const buttons = [...doc.querySelectorAll("button,[role=button],a")]
    .filter((e) => e.textContent.trim() === label && e.offsetParent !== null);
  let el = buttons[0];
  if (!el) {
    const any = [...doc.querySelectorAll("*")].find((e) => e.textContent.trim() === label && e.offsetParent !== null);
    el = any && (any.closest("button,[role=button],a") || any);
  }
  if (el) { el.click(); return true; }
  return false;
}

// The Tagline textarea in Overview → Company details (the only presentation-oriented,
// non-factual field: it drives COMPANY.slogan, the investor-card positioning line).
export function findTagline(doc) {
  if (!doc) return null;
  // Prefer the textarea whose nearby label reads "Tagline"; fall back to the first visible one.
  const tas = [...doc.querySelectorAll("textarea")].filter((t) => t.offsetParent !== null);
  for (const t of tas) {
    let p = t.closest("div");
    for (let i = 0; i < 4 && p; i++) {
      const lbl = [...p.querySelectorAll("label,span")].map((s) => s.textContent.trim()).find((x) => /^tagline$/i.test(x));
      if (lbl) return t;
      p = p.parentElement;
    }
  }
  return tas[0] || null;
}

// Set a React-controlled textarea's value the way a keystroke would, so its onChange fires.
export function setControlledValue(win, el, value) {
  if (!win || !el) return false;
  const proto = win.HTMLTextAreaElement && win.HTMLTextAreaElement.prototype;
  const setter = proto && Object.getOwnPropertyDescriptor(proto, "value") && Object.getOwnPropertyDescriptor(proto, "value").set;
  if (!setter) { el.value = value; }
  else setter.call(el, value);
  el.dispatchEvent(new win.Event("input", { bubbles: true }));
  return true;
}

// A gentle typewriter fill (premium "editing" feel). Resolves when the full value is set.
export async function typeInto(win, el, value, { total = 620, token, alive } = {}) {
  const n = value.length;
  const step = Math.max(10, Math.floor(total / Math.max(1, n)));
  for (let i = 1; i <= n; i++) {
    if (alive && !alive(token)) return false;
    setControlledValue(win, el, value.slice(0, i));
    await sleep(step);
  }
  return true;
}

// Bounding rect of an element in iframe-CONTENT pixels (the iframe body is not scrolled;
// getBoundingClientRect is already in the 1440×900 content frame the marketing layer scales).
export function rectOf(el) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

// The preview element currently showing the tagline line (so emphasis can ring it).
export function findPreviewSlogan(doc, text) {
  if (!doc) return null;
  const root = doc.querySelector(".pp-editor-preview");
  if (!root) return null;
  const want = String(text || "").trim();
  const els = [...root.querySelectorAll("*")].filter((e) => e.children.length === 0);
  let hit = els.find((e) => e.textContent.trim() === want);
  if (!hit && want) hit = els.find((e) => e.textContent.includes(want.slice(0, 24)));
  return hit || null;
}

// Scroll an element to the top of the editor's scroll column (so a focused field is visible).
export function bringIntoView(el) {
  if (!el) return;
  try { el.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (_) {}
}
