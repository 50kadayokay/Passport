# Conference Extraction Runner (internal, Phase 1)

Automates the manual three-pass Conference Mode extraction as one local command. It does **not**
change the Conference Blueprint, schemas, prompts, merge logic, review UI, renderer, or publishing —
it just performs the passes you used to do by hand in ChatGPT.

## What it does
1. Reads a **draft** company by slug (service-key Supabase REST).
2. Reads its **already-ingested** documents (uploaded + text-extracted + classified in the browser doc panel).
3. Groups docs by their `kind` into the existing bundles — **Technical** (geology/projects/results), **Capital**, **Story/Team/Thesis**.
4. Runs each bundle's existing prompt through a pluggable LLM provider.
5. Extracts + validates the JSON, **retrying only failed/invalid passes**.
6. Merges successes with the existing null-safe `applyImport` (skips any `conference._locked` paths, never blanks a filled field).
7. Regenerates `pp`, writes `imports/<slug>/{technical,capital,story}.json`, `merged-profile.json`, and `report.json`.
8. With `--write`, PATCHes the draft profile. Otherwise it's a dry-run.

**Milestones** is intentionally excluded — it reads the existing timeline; run that small pass in the Blueprint.

## Setup
```bash
cp tools/conference-runner/.env.example tools/conference-runner/.env
# fill in SUPABASE_URL, SUPABASE_SERVICE_KEY, and (for real runs) a provider + key
```

## Use
```bash
# 1. Upload the company's documents once, in the browser doc panel (ingest + classify).
# 2. Then, from the repo root:

# Dry-run with the free mock provider — proves grouping/validate/merge/report end to end:
npm run extract:conference -- --slug argenta-silver-corp-conference-blank

# Real extraction (set CONF_PROVIDER + key in .env), write into the draft:
npm run extract:conference -- --slug argenta-silver-corp-conference-blank --provider anthropic --model <id> --write

# Re-run just one bundle:
npm run extract:conference -- --slug <slug> --only technical --write
```

Then open that draft in the Conference Blueprint → review conflicts/missing/editorial → preview → publish.

## Provider + cost
`--provider mock|anthropic|openai`. Token usage and an estimated `$` are logged **per pass** and in
`report.json`. Prices in `config.mjs` are approximate — set them to your actual model/plan. `mock`
costs nothing and is for testing the harness.

## Phase 2 portability
All logic is pure functions; `run.mjs` is a thin CLI shell and `supa.mjs` uses the service key exactly
like a Supabase Edge Function would. Moving execution server-side is "call the same functions from a
Deno handler" — no restructuring of grouping, prompts, validation, or merge.
