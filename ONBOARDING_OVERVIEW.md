# Passport — Onboarding System Overview

A complete description of how companies get onboarded onto Passport. Written to be
self-contained for someone with no prior context.

---

## 1. What Passport is

Passport is a mobile app where retail investors follow **junior (early-stage) mining
companies**. Each company gets a clean, standardized investor **profile** in the app —
a status card, a 60-second AI brief, projects, capital/financials, leadership, and a
timeline of news. Investors browse these profiles and follow companies for updates.

The business model is **concierge**: the operator (the founder) builds and publishes each
company's profile, then hands it off. Companies don't build their own profiles.

## 2. The problem onboarding solves

For each company, the operator gathers its **public documents** — press releases, technical
reports (NI 43-101), MD&A, financial statements, investor presentations, corporate/website
pages — and must turn all of that into a complete, accurate, standardized profile. The
challenge is doing this **repeatably, cheaply, and accurately** for any company.

An earlier approach ran the documents through an AI extraction API automatically. It was
**expensive** (each call sent the full document set as context) and **unreliable**. The
current approach is different and is described below.

## 3. The current architecture: a document-to-JSON pipeline

The pipeline is:

```
Company documents
     │
     ▼
ChatGPT  (using a fixed prompt/schema)  ──►  one JSON object + an evidence audit
     │
     ▼
Admin "Import" screen  (validates, merges into the company's profile)
     │
     ▼
The app renders the profile from that JSON
     │
     ▼
Operator reviews (with an evidence/verification gate) → Publishes
```

Key property: **no AI runs on Passport's own servers.** Generation happens in ChatGPT (a flat
subscription); importing is just a database write. So onboarding costs ~$0 per company on the
Passport side. The operator stays in full control and reviews everything before publishing.

## 4. The core design principle: two layers

There are two distinct responsibilities, and they must never be confused:

- **CONTENT (owned by ChatGPT):** what belongs in each field — the facts, the wording, the
  tone, the selection logic (e.g. which initiative becomes the "status"), archetype handling,
  what to do when data is missing.
- **STRUCTURE (owned by the app's code):** the exact JSON field names, types, and object shape.
  These are read directly out of the application's source code and are a **hard contract**.

**The single most common failure** is ChatGPT inventing a field name (e.g. `latest_update`
instead of `latestUpdate`, or nesting a block under `content` when the app reads it at the top
level). When that happens the field silently imports as empty and that widget renders blank.
So the schema given to ChatGPT must exactly mirror what the code reads, and the importer
flags any unknown key.

## 5. The prompt / schema

The operator copies a single **prompt template** (a button in the admin does this). It is
~25,000 characters and contains, in one block:

1. **Accuracy rules** — use only facts stated in the documents; copy figures exactly; `null`
   for anything not disclosed; never invent; this is a regulated issuer's public profile so a
   fabricated share count or drill grade is a serious harm.
2. **Source authority rules** — which document is authoritative for which field, and that
   **authority beats recency**. Capital comes from financial statements/MD&A, not the
   presentation. Geology from the technical report. Timeline from press releases. Presentations
   are treated as a *lead* (what to investigate), not a *source* (what to write) — this is the
   main way marketing language would otherwise contaminate a profile.
3. **Writing standard** — write like a disciplined analyst, never promotional, state risk
   honestly, never reference share price.
4. **Two length rules** — card faces are ruthlessly short (character ceilings per field);
   detail sheets are deliberately rich (a summary + supporting facts + a "so what").
5. **The full JSON schema** — every field, annotated with what belongs in it, its limit, and a
   worked example. The schema mirrors a real reference company ("Kingsmen") so ChatGPT sees the
   target richness rather than guessing.
6. **Output format** — return two clearly delimited sections:
   `=== PROFILE JSON ===` (the data to import) and `=== EVIDENCE AUDIT ===` (the proof of work).

The schema's top-level shape:

```
{
  archetype, asOfDate, confidence, reviewRequired, notFound,   // extraction metadata
  company:       { name, ticker, website, slogan, commodity, jurisdiction, listings[] },
  companyStatus: { statusHeadline, statusHeadlineSubtext, latestUpdate, investmentImpact,
                   nextCatalyst, expected, progressBar },
  companyBrief:  { keyPoints[] (value drivers), sections[] (the 6-part 60-second brief) },
  capital:       { outstanding, fd, options, warrants, cash, debt, workingCapital, marketCap,
                   sharePrice, reportingDate, latestFiling, ownership, state, headline,
                   subtext, financing, financingDate/Type/Price/Use },
  team:          [ { name, role, short, full } ],
  projects:      [ { key, name, short, tag, locationFull, stageName, stageIdx,
                     snapshot{ location, commodity, ownership, landPackage, depositType,
                               pastProducer },   // each = value + detail pairs + a note
                     brief{}, geology{}, explorationHistory{}, drillResults{}, unique{},
                     targets{}, scenarios{}, stage{} } ],
  timeline:      [ { date, headline, whatHappened, whyItMatters, whatHappensNext,
                     keyNumbers[], key, fullText } ]
}
```

## 6. The passes (why generation is split)

A real company can have a technical report + financials + MD&A + circular + governance docs +
dozens of press releases. That's far more than a single ChatGPT response can extract honestly —
it would truncate or fabricate (a well-behaved model refuses outright). So the prompt runs in
**three passes**, each a self-contained copy of the full prompt with a scope line appended:

- **Pass 1 — Company:** identity, status, brief, capital, team
- **Pass 2 — Projects:** the projects array (one project per run if they're large)
- **Pass 3 — Timeline:** press releases, in date-order batches

The same documents are attached to every pass; only the requested output narrows. Each pass's
JSON is imported independently and **merges** into the same company (sections don't overwrite
each other; timeline entries de-duplicate by date). A small company (~15-25 docs) can be done
in one pass.

## 7. The importer

In the admin, "Import a company from JSON" (or "Import JSON" on an existing company):

- **Tolerant paste** — accepts the whole ChatGPT reply; strips the section markers, code
  fences, and the audit portion, finds the JSON.
- **Validation before writing** — recognizes only real profile keys; **reports any unknown key**
  rather than silently accepting it (this catches the invented-field-name failure).
- **Merge, never replace** — only keys present in the payload are written, so re-importing one
  pass can't wipe the others or the operator's edits. Projects merge by key; timeline
  de-duplicates by date.
- **Create-or-update** — if the JSON's company name maps to a new slug it creates the company
  as a draft; if the slug already exists it merges into it (so re-running a pass just updates).
- **Report** — "created/merged, N fields populated," which sections landed, and which fields
  came through empty (so the operator can feed gaps back to ChatGPT and re-import just that
  section).

## 8. How JSON becomes the rendered profile

The imported JSON is stored as the company's `profile` object. A mapping function
(`mapProfileToPP`) transforms that profile into the exact render payload (`pp`) the mobile app
reads. The mapping is where the field-name contract lives — it reads specific keys
(e.g. `projects[].geology.body`, `projects[].snapshot.location.detail`) and produces the
widgets. If the JSON's shape doesn't match what the mapping reads, that widget renders empty.
The prompt schema is written to mirror this mapping exactly.

Graceful degradation is built in: any widget with no data hides cleanly (an honest empty state)
rather than showing a placeholder or another company's data.

## 9. Accuracy and verification (the part that matters most)

Because these profiles are public and may be shown to the company's own CEO, accuracy is
critical. The system provides:

- **The evidence audit** — for every field it filled or deliberately left null, ChatGPT returns
  a row: `Field | Value | Verification | Source document + date | Supporting quote | Why`. The
  verification level is one of **QUOTED** (verbatim), **DERIVED** (computed, with the
  arithmetic), **SYNTHESIZED** (written from multiple sources), **SELECTED** (a choice among
  candidates, with what was rejected), or **MISSING** (couldn't fill, with what was searched).
  A verbatim supporting quote is mandatory for QUOTED and DERIVED.
- **The audit is captured on import** and stored with the company, so the proof-of-work
  survives past the ChatGPT conversation.
- **An Evidence panel** in the admin shows this beside the live profile preview, defaulting to
  a "Needs review" filter that surfaces only the judgment calls (SELECTED / SYNTHESIZED /
  MISSING) — so the operator checks ~20 risky fields, not all 80.
- **A pre-publish review gate** — publishing a draft with un-verified judgment calls (or a
  `reviewRequired: true` flag from ChatGPT) opens a gate that quantifies the risk, links to the
  evidence, and requires the operator to confirm they verified it. Re-importing after a review
  invalidates it (forces a re-check). The rest of the fields being verbatim quotes is what makes
  this fast.

The philosophy: turn "I hope it's accurate" into "I verified every judgment call; the rest are
direct quotes from the filings."

## 10. The operator's end-to-end workflow

1. Gather a company's public documents.
2. In the admin, copy the prompt (Pass 1 → then 2 → then 3 for large companies).
3. Paste each into ChatGPT with the documents attached; copy the returned JSON.
4. Import each into the company (create on the first pass, merge on the rest).
5. Upload images manually (logo, project photos, headshots — the only thing ChatGPT can't
   produce).
6. Review the live preview + the Evidence panel; clear the flagged fields.
7. Publish (through the review gate).
8. When news lands later, an "update prompt" produces a small delta (new timeline entry +
   refreshed status card) that merges in.

## 11. Current state and known limitations

Working: the full pipeline (prompt → passes → import with validation/merge → render → evidence
audit → review gate → publish/delete). Most of a profile populates correctly and accurately.

Known gaps / roadmap:
- **Full press releases** are not generated (too large for the prompt). Planned: drag-and-drop
  the PDFs after the fact, matched to timeline entries by date.
- **District Context** is the one project widget without a renderer yet (small code build).
- **Capital section** prose is being refined (it previously repeated the financing string and
  showed a hardcoded reporting date — both fixed).
- **Images** are always a manual upload step.

## 12. Reference company

"Kingsmen" is the internal gold-standard reference profile — its real field values are embedded
in the prompt as the richness bar every generated company is measured against. The most recent
real onboarding test is "Argenta Silver Corp."
