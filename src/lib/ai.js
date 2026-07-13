// Client wrapper for the AI analysis endpoint (/api/structure-release) plus
// helpers that turn an analysis into a draft post record and detect duplicates.
//
// The endpoint returns { analysis } with THREE separate judgments:
//   analysis.card                 — investor-facing content
//   analysis.classification       — suggestedImpact / suggestedKey + reasons/evidence
//   analysis.milestoneRecommendation — new / update / supersede / timeline_only
//   analysis.proposedChanges[]    — suggested edits to OTHER profile areas
// The company confirms category / impact / key and approves proposedChanges before
// anything is applied.

async function callAI(payload) {
  const res = await fetch("/api/structure-release", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `AI request failed (${res.status})`);
  return data.analysis;
}

// Raw press-release text (+ optional company context) -> full analysis.
export function analyzeRelease(text, context = null) {
  return callAI({ mode: "extract", text, context });
}

// Current analysis + a plain-English instruction -> revised analysis. `text`
// (original release) and `context` are optional but improve the edit.
export function refineAnalysis(current, instruction, text = "", context = null) {
  return callAI({ mode: "refine", current, instruction, text, context });
}

// SHA-256 of the raw release text — the strongest layer of duplicate detection.
export async function contentHash(text) {
  const norm = (text || "").replace(/\s+/g, " ").trim().toLowerCase();
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(norm));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Turn an analysis into a draft post record. The FINAL decision fields
// (category / impact / isKey) default to the AI's suggestions but are the
// company-owned overrides once edited — the AI suggestion is preserved in
// `classification` for the review UI + audit.
export function analysisToDraftPost(analysis, meta = {}) {
  const card = analysis.card || {};
  const cls = analysis.classification || {};
  return {
    postType: meta.postType || "press_release",
    status: "review",
    title: card.headline || "",
    sourceDate: card.sourceDate || "",            // the release's own date (drives timeline placement)
    sourceUrl: card.sourceUrl || meta.sourceUrl || "",
    sourceFilename: meta.sourceFilename || "",
    sourceStoragePath: meta.sourceStoragePath || "",
    rawText: meta.rawText || "",
    contentHash: meta.contentHash || "",
    card,                                          // full investor card (JSONB)
    classification: cls,                           // suggestions + evidence (JSONB)
    milestoneRecommendation: analysis.milestoneRecommendation || null,
    proposedChanges: (analysis.proposedChanges || []).map((c) => ({ ...c, status: "pending" })),
    // FINAL confirmed decisions — initialized from suggestions, company can override
    category: card.category || "Other",
    impact: cls.suggestedImpact || "Low",
    isKey: !!cls.suggestedKey,
    schemaVersion: analysis.schemaVersion || 1,
    aiModel: analysis.model || "",
  };
}

// Layered duplicate detection against existing posts. Returns a verdict the UI
// uses to block (exact) or warn (likely) before publishing.
export function classifyDuplicate(existingPosts, candidate) {
  const posts = existingPosts || [];
  const normUrl = (u) => (u || "").trim().replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
  const normTitle = (t) => (t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const cTitle = normTitle(candidate.title);
  const cUrl = normUrl(candidate.sourceUrl);

  for (const p of posts) {
    if (candidate.contentHash && p.content_hash && candidate.contentHash === p.content_hash) {
      return { verdict: "exact", match: p, reason: "Identical release text already posted." };
    }
    if (cUrl && normUrl(p.source_url) === cUrl) {
      return { verdict: "exact", match: p, reason: "Same source URL already posted." };
    }
  }
  for (const p of posts) {
    const sameDay = candidate.sourceDate && p.source_date === candidate.sourceDate;
    if (sameDay && normTitle(p.title) === cTitle && cTitle) {
      return { verdict: "likely", match: p, reason: "Same date and headline as an existing post." };
    }
  }
  return { verdict: "new", match: null, reason: "" };
}
