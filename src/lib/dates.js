// Date display for S2's pages. A missing or unparseable timestamp shows the
// fallback, never "Invalid Date" or 1 Jan 1970 (new Date(null) is the epoch).

const parse = (iso) => {
  if (iso === null || iso === undefined || iso === "") return null;
  const t = typeof iso === "number" ? iso : Date.parse(String(iso));
  return Number.isFinite(t) ? new Date(t) : null;
};

/** "4 Nov 2026, 10:32" (locale), or the fallback. */
export const formatDateTime = (iso, fallback = "—") => { const d = parse(iso); return d ? d.toLocaleString() : fallback; };

/** "Nov 4, 2026" (locale), or the fallback. */
export const formatDate = (iso, fallback = "—") => {
  const d = parse(iso);
  return d ? d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : fallback;
};

export const isValidDate = (iso) => parse(iso) !== null;
