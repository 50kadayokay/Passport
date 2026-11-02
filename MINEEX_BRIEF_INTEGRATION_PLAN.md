# MineEx Brief — Integration Plan (for approval)

Status: **PLAN ONLY — nothing implemented.** No production data, published releases, or
deployment config changed. The approved **BriefV1** visual design is locked and is NOT
modified by either path below.

Prereqs already in place (this branch, uncommitted, dev-gated):
- `api/_briefGen.js` — OpenAI BriefV1 generator (dedicated key `MINEEX_BRIEF_API_KEY`).
- `api/_briefValidate.js` — deterministic validator (grounding, unit/measurement match,
  INCLUDING relationship, historical-vs-current).
- Reader renders BriefV1 from a `v2`-shaped object (`SummaryContent`, gated by
  `window.__BRIEF_BENCH__` today); category badge reads `v2.cat` when present.

---

## Publishing gate (applies to BOTH paths)

A Brief may be **auto-published only when `validateBrief(...).status === "PASS"`.**
- **FAIL** (any `factualErrors`): blocked. Ungrounded number, figure not co-located with its
  measurement, unit/measurement mismatch, count-as-grade, INCLUDING misuse, or unattributed
  historical-as-current. Must be corrected by a human before publishing.
- **REVIEW** (any `evidenceIssues`): blocked from auto-publish. A supporting passage could not
  be verbatim/span-verified. Requires human confirmation against source.
- **PASS**: mechanically clean.

**Important limitation (confirmed in evidence review):** deterministic grounding cannot catch
every *semantic* overstatement. Example found: a headline that says "completes acquisition of
[project]" when the source describes acquiring an *option* to earn 100% — every number is
grounded, so it validates PASS, yet the prose is materially misleading. **Therefore company
review is a REQUIRED second gate for NEW releases, not optional**, even on PASS.

---

## PATH A — HISTORICAL releases (presentation-only, no AI)

Goal: show existing summaries inside the BriefV1 shell. **No regeneration, no API calls, no cost.**

Mapping (deterministic, from existing timeline fields → `v2`-shaped object):
- `headline` ← existing release headline/title.
- `whatHappened` ← existing `whatHappened` (or label) — verbatim, unchanged.
- `whyItMatters` ← existing `why` — verbatim, unchanged.
- `category` ← existing stored category if present; else leave the current heuristic badge.
- `keyResults` → **OMITTED unless** the historical record already holds structured metric
  data that maps cleanly to `{value, unit, descriptor}`. Free-text "key number" bullets are
  NOT split into metric rows (that would invent structure). Where present, existing bullets may
  continue to render in their current list style; they are not forced into the two-column rows.
- `takeaway` → **OMITTED** (cannot be derived without inventing content).

Rules:
- Preserve 100% of existing summary content and all full press releases, images, tables.
- Omit any field that cannot be mapped without inventing content — never fabricate.
- Purely a rendering/mapping layer; reversible by toggling the presentation flag.

Affected (when implemented): `src/aiBrief/PassportProto.jsx` (reader mapping), the timeline
loader. No backend, no DB writes, no AI.

---

## PATH B — NEW releases (generator + validator + approval + audit)

Flow: **ingest source → generate → validate → company review/approval → publish.**

1. **Ingest** — store the original press release (text, images, tables, disclosures) unchanged
   as the source of record. The Brief never replaces or edits the original.
2. **Generate** — `generateBrief()` (gpt-4o-mini, `MINEEX_BRIEF_API_KEY`, ~$0.0014/release).
3. **Validate** — `validateBrief()` against the original source. Non-PASS → held for human
   resolution (see gate above). PASS → eligible for company review.
4. **Company review & approval** — the owning company sees the draft Brief beside the original
   source and must explicitly approve before publication. Required even on PASS (semantic check).
5. **Publish** — only an approved Brief renders to investors in BriefV1.
6. **Audit trail** — persist, per release: source hash, model + prompt version, generated
   Brief, validator result (status + findings), reviewer identity, approval timestamp, and any
   edits. Supports rollback and accountability.

Rules:
- Preserve original source documents, images, tables, disclosures (never mutated).
- Explicit company approval gates publication; no silent auto-publish of unreviewed content.
- Dedicated API key only; isolated from existing AI integrations and secrets.

Affected (when implemented): a new generate+validate endpoint (reusing the two `api/_brief*`
modules), a draft/approval store + audit table (migration), company-portal review UI, reader
wiring to render approved Briefs. All require separate approval before building.

---

## Not in scope / guardrails
- No implementation yet. No changes to production data, published releases, or deployment.
- BriefV1 visual design unchanged in both paths.
- Existing AI endpoints, scheduled jobs, and production secrets untouched.
- Rollback: Path A is a presentation toggle; Path B publishes nothing without approval and
  keeps a full audit trail.
