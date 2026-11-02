// a06: profile updates suggested by a press release -- the deterministic half.
//
// The model (api/extract-profile-updates.js) proposes; everything that decides
// what a person is shown and what reaches the profile DRAFT is here, pure, and
// shared by the server, the review panel and scripts/profile-suggestions-test.mjs:
//
//   validateProposals  keep a proposal only if its quote is VERBATIM in the
//                      release (whitespace and quote marks aside) and every
//                      figure in its value appears in that quote. Each kept
//                      proposal carries the line it came from.
//   diffProposals      what the profile says now vs what the release says;
//                      a proposal that matches the profile is not shown.
//   applyProposals     the approved changes, applied to a pp object. The caller
//                      saves the result as the profile DRAFT through
//                      /api/profile-draft -- never to the live profile.
//
// Nothing here talks to the network.

import { figuresIn, unsupportedFigures } from "./figures.js";

// What a release can change, and where it lives in pp (src/lib/profileToPP.js).
export const KINDS = {
  cash:               { label: "Cash / treasury",        section: "Capital",  numeric: true,  dated: true },
  shares_outstanding: { label: "Shares outstanding",     section: "Capital",  numeric: true },
  fully_diluted:      { label: "Fully diluted shares",   section: "Capital",  numeric: true },
  options:            { label: "Options outstanding",    section: "Capital",  numeric: true },
  warrants:           { label: "Warrants outstanding",   section: "Capital",  numeric: true },
  debt:               { label: "Debt",                   section: "Capital",  numeric: true },
  financing:          { label: "Financing",              section: "Capital",  numeric: true,  dated: true, list: true },
  milestone:          { label: "Timeline milestone",     section: "Timeline", numeric: false, dated: true, list: true },
  latest_update:      { label: "Latest update",          section: "Highlights", numeric: false },
  next_catalyst:      { label: "Next catalyst",          section: "Highlights", numeric: false },
};

const str = (v) => (v == null ? "" : String(v));
const has = (v) => str(v).trim() !== "";

/** Whitespace and typographic quotes are not content. */
function normChar(ch) {
  if (/[‘’‚′]/.test(ch)) return "'";
  if (/[“”„″]/.test(ch)) return '"';
  if (/[–—−]/.test(ch)) return "-";
  return ch;
}

/** The text with runs of whitespace collapsed, plus each kept char's original index. */
function normalizeWithMap(text) {
  const out = [], map = [];
  let space = false;
  const s = str(text);
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (/\s/.test(ch)) { if (!space && out.length) { out.push(" "); map.push(i); } space = true; continue; }
    space = false;
    out.push(normChar(ch).toLowerCase()); map.push(i);
  }
  while (out.length && out[out.length - 1] === " ") { out.pop(); map.pop(); }
  return { norm: out.join(""), map };
}

/**
 * Where a quote sits in the release: { line, endLine, excerpt } with 1-based
 * line numbers of the ORIGINAL text, or null when the quote is not in it.
 */
export function locateQuote(text, quote) {
  const q = normalizeWithMap(quote).norm;
  if (q.length < 12) return null;                 // too short to be evidence of anything
  const { norm, map } = normalizeWithMap(text);
  const at = norm.indexOf(q);
  if (at < 0) return null;
  const src = str(text);
  const startIdx = map[at], endIdx = map[at + q.length - 1];
  const lineOf = (idx) => src.slice(0, idx).split("\n").length;
  return { line: lineOf(startIdx), endLine: lineOf(endIdx), excerpt: src.slice(startIdx, endIdx + 1) };
}

const ISO = /^\d{4}-\d{2}(-\d{2})?$/;

/**
 * Keep only proposals that can be traced and checked. Returns
 * { accepted, dropped } -- `dropped` is shown as a count with reasons, so a
 * suggestion that vanished is never silent.
 */
export function validateProposals(raw, text, source = {}) {
  const accepted = [], dropped = [];
  const seenScalar = new Set();
  (Array.isArray(raw) ? raw : []).forEach((p, i) => {
    const drop = (reason) => dropped.push({ kind: p && p.kind, value: p && p.value, reason });
    if (!p || typeof p !== "object") return drop("not a proposal");
    const meta = KINDS[p.kind];
    if (!meta) return drop("unknown kind");
    const value = str(p.value).trim();
    if (!value) return drop("no value");
    const loc = locateQuote(text, p.quote);
    if (!loc) return drop("its quote is not in the release");
    if (meta.numeric) {
      if (!figuresIn(value).length && !/\d/.test(value)) return drop("no figure in the value");
      const extra = unsupportedFigures(value, loc.excerpt);
      if (extra.length) return drop(`figures not in its quote: ${extra.join(", ")}`);
    }
    const date = str(p.date).trim();
    if (date) {
      if (!ISO.test(date)) return drop("date is not YYYY-MM-DD");
      if (!loc.excerpt.includes(date.slice(0, 4)) && !str(text).includes(date.slice(0, 4))) return drop("date's year is not in the release");
    }
    if (meta.dated && meta.list && !date) return drop("needs a date");
    if (!meta.list) {
      if (seenScalar.has(p.kind)) return drop("duplicate");
      seenScalar.add(p.kind);
    }
    const d = p.details && typeof p.details === "object" ? p.details : {};
    accepted.push({
      id: `${p.kind}-${i}`,
      kind: p.kind,
      value,
      date: date || null,
      details: {
        type: str(d.type).slice(0, 80), price: str(d.price).slice(0, 40), use: str(d.use).slice(0, 200),
      },
      quote: loc.excerpt,
      source: {
        updateId: source.updateId || null,
        headline: source.headline || "",
        publishedOn: source.publishedOn || null,
        line: loc.line, endLine: loc.endLine,
      },
    });
  });
  return { accepted, dropped };
}

/* ---------------------------------------------------------------- current values */

const capRow = (pp, re) => ((pp.CAP && Array.isArray(pp.CAP.rows)) ? pp.CAP.rows : []).find((r) => r && re.test(str(r.sec)));
const flatTimeline = (pp) => {
  const out = [];
  (Array.isArray(pp.PR_YEARS) ? pp.PR_YEARS : []).forEach((y) => (y.items || []).forEach((it) => out.push(it)));
  return out;
};
const normCmp = (v) => str(v).toLowerCase().replace(/[\s,]+/g, "").replace(/\.0+(?=\D|$)/g, "");

/** What the profile currently says for this kind, as text ("" = nothing). */
export function currentValue(pp = {}, p) {
  const co = pp.COMPANY || {}, cap = pp.CAP || {}, st = pp.STATUS || {};
  switch (p.kind) {
    case "cash":               return [str(co.cash), has(co.reportingDate) ? `as at ${co.reportingDate}` : ""].filter(has).join(" ");
    case "shares_outstanding": return str(cap.outstanding || co.shares);
    case "fully_diluted":      return str(cap.fd || co.fd);
    case "options":            return str((capRow(pp, /option/i) || {}).qty);
    case "warrants":           return str((capRow(pp, /warrant/i) || {}).qty);
    case "debt":               return str(cap.debt || co.debt);
    case "latest_update":      return str(st.latest);
    case "next_catalyst":      return str(st.nextCatalyst || st.next);
    case "financing": {
      const hit = (Array.isArray(pp.RAISES) ? pp.RAISES : []).find((r) => normCmp(r.v) === normCmp(p.value));
      return hit ? [hit.v, hit.d].filter(has).join(" · ") : "";
    }
    case "milestone": {
      const day = str(p.date);
      const hit = flatTimeline(pp).find((e) => str(e.id).startsWith(day) &&
        normCmp(e.headline || e.label).slice(0, 24) === normCmp(p.value).slice(0, 24));
      return hit ? [hit.headline || hit.label, str(hit.id).slice(0, 10)].filter(has).join(" · ") : "";
    }
    default: return "";
  }
}

/** Each proposal with `current` and `status`: new | changed | same. */
export function diffProposals(pp, proposals) {
  return (proposals || []).map((p) => {
    const current = currentValue(pp || {}, p);
    let status;
    if (p.kind === "financing" || p.kind === "milestone") status = current ? "same" : "new";
    else if (!current) status = "new";
    else if (p.kind === "cash") status = normCmp(str((pp.COMPANY || {}).cash)) === normCmp(p.value) && (!p.date || str((pp.COMPANY || {}).reportingDate) === p.date) ? "same" : "changed";
    else status = normCmp(current) === normCmp(p.value) ? "same" : "changed";
    return { ...p, current, status };
  });
}

/* ---------------------------------------------------------------- apply */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayLabel = (id) => { const m = str(id).match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/); return m ? `${MONTHS[+m[2] - 1] || ""}${m[3] ? ` ${+m[3]}` : ""}` : ""; };

// Same grouping the profile editor uses for PR_YEARS (ProfileEditor.jsx regroupTL).
function regroup(flat) {
  const by = {};
  flat.forEach((e) => { const yr = (str(e.id).match(/^(\d{4})/) || [])[1] || String(new Date().getFullYear()); (by[yr] = by[yr] || []).push(e); });
  return Object.keys(by).sort((a, b) => b - a).map((y) => ({ year: y, items: by[y].sort((a, b) => str(b.id).localeCompare(str(a.id))) }));
}

function setCapRowQty(cap, re, sec, qty) {
  const rows = Array.isArray(cap.rows) ? cap.rows.map((r) => ({ ...r })) : [];
  const i = rows.findIndex((r) => re.test(str(r.sec)));
  if (i >= 0) rows[i].qty = qty; else rows.push({ sec, det: "", qty });
  return { ...cap, rows };
}

/**
 * The approved changes applied to a COPY of pp. Unknown kinds are ignored.
 * The result is what the caller saves as the profile draft.
 */
export function applyProposals(pp = {}, approved = []) {
  let next = { ...pp, COMPANY: { ...(pp.COMPANY || {}) }, CAP: { ...(pp.CAP || {}) }, STATUS: { ...(pp.STATUS || {}) } };
  for (const p of approved || []) {
    const v = str(p.value).trim();
    if (!v || !KINDS[p.kind]) continue;
    switch (p.kind) {
      case "cash":
        next.COMPANY.cash = v;
        if (p.date) next.COMPANY.reportingDate = p.date;
        break;
      case "shares_outstanding":
        next.CAP.outstanding = v; next.COMPANY.shares = v;
        next.CAP = setCapRowQty(next.CAP, /common/i, "Common Shares Outstanding", v);
        break;
      case "fully_diluted":
        next.CAP.fd = v; next.COMPANY.fd = v;
        break;
      case "options":  next.CAP = setCapRowQty(next.CAP, /option/i, "Options", v); break;
      case "warrants": next.CAP = setCapRowQty(next.CAP, /warrant/i, "Warrants", v); break;
      case "debt":     next.CAP.debt = v; next.COMPANY.debt = v; break;
      case "latest_update":
        next.STATUS.latest = v; next.STATUS.hasData = true;
        break;
      case "next_catalyst":
        next.STATUS.next = v; next.STATUS.nextCatalyst = v; next.STATUS.hasData = true;
        break;
      case "financing": {
        const d = p.details || {};
        const raise = { d: p.date || "", v, type: str(d.type), price: str(d.price), lead: "", purpose: str(d.use), status: "Completed" };
        next.RAISES = [raise, ...(Array.isArray(next.RAISES) ? next.RAISES : [])]
          .sort((a, b) => str(b.d).localeCompare(str(a.d)));
        break;
      }
      case "milestone": {
        const id = p.date || "";
        const entry = { id, d: dayLabel(id), key: false, headline: v, label: v, why: "",
          whatHappened: str(p.quote), whatHappensNext: "", takeaways: [] };
        next.PR_YEARS = regroup([entry, ...flatTimeline(next)]);
        break;
      }
      default: break;
    }
  }
  return next;
}

/**
 * The review panel's per-suggestion edit steps, kept pure so they are tested by
 * execution. An item is a diffed proposal plus { decision, edit }.
 *
 *   startEdit   opens the editor on the current value and remembers the
 *               decision it had, so Cancel can put it back.
 *   cancelEdit  discards the edit: value, date and decision are as before
 *               (an undecided suggestion stays pending). Nothing is approved.
 *   keepEdit    "Use this": takes the edited value and approves it.
 */
export function startEdit(p) {
  return { ...p, edit: { value: p.value, date: p.date || "", before: p.decision ?? null } };
}

export function cancelEdit(p) {
  if (!p.edit) return p;
  return { ...p, edit: null, decision: p.edit.before ?? null };
}

export function keepEdit(p) {
  if (!p.edit) return p;
  const date = p.edit.date || null;
  return {
    ...p, value: p.edit.value, date,
    edited: p.edited || p.edit.value !== p.value || date !== p.date,
    edit: null, decision: "approve",
  };
}
