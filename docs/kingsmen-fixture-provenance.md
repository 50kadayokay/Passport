# Kingsmen Conference Fixture — Provenance

**Purpose:** the verified "quality benchmark" fixture for Conference Mode (Phase 1, Step 0).
Every factual field traces to a source below. **No figure was invented, inferred, or estimated.**
This provenance model is the template for what automated ingestion should eventually capture per field.

**Fixture location:** DB company row `slug=kingsmen-fixture` (status `draft`, tier `pro`), loaded in the
booth via preview token. Built by `scratchpad/build-kingsmen-fixture.mjs` from the verified MineEx
record, compiled through the real `mapProfileToPP` (unmodified). **Data only — zero template changes.**

## Source classes
- **[REC]** — MineEx's own verified company record (`companies` row `kingsmen-resources`, `profile.*`). This record was previously curated by MineEx from Kingsmen's public materials; treated here as authoritative existing data.
- **[PR:date]** — a specific dated Kingsmen news release, as recorded in the MineEx `profile.timeline`.
- **[PUB]** — well-established public/geographic fact (e.g. the Parral district is a historic Mexican silver district).

## Field-by-field

| Conference field | Value | Source |
|---|---|---|
| Company identity (name, tickers KNG/KNGRF/TUY, commodity, jurisdiction, website) | Kingsmen Resources Ltd., Silver & Gold, Chihuahua, MX | [REC] `profile.company` |
| Hero statistic / featured grade | 1,742 g/t AgEq over 0.7 m (190.85–191.55 m) | [PR:2025-09-24] maiden drill program |
| Highlight — financing | C$13.0M bought deal, fully funded through 2026 | [REC] `profile.capital` + [PR:2026-02-11] |
| Highlight — drill progress | 14 of 26 Phase 1 holes complete | [REC] `profile.companyStatus.progressBar` |
| Highlight — ground | 60 km² (Las Coloradas 32 + Almoloya 28) | [REC] `profile.projects[].snapshot.land` |
| Highlight — market cap | C$18.5M, 34,523,086 shares, C$0.21 (Mar 31 2026) | [REC] `profile.capital` |
| Drill intercepts (results beat) | 1,742 g/t AgEq/0.7m; 15.7m@74 incl 704; 1.6m@931 w/1.28 Au; 1.3m@270 (1.5km step-out) | [PR:2025-09-24], [PR:2026-01-19], [PR:2025-12-03], [PR:2026-01-08] |
| Capital figures (cash, mkt cap, shares, warrants/options) | C$4.2M cash; C$18.5M; 34.5M; option/warrant rows | [REC] `profile.capital` (as of Mar 31 2026) |
| Catalysts | Phase 1 assays (H2 2026); remaining 12 holes; Almoloya maiden drilling | [REC] `profile.companyStatus.nextCatalyst` + `profile.projects` |
| Jurisdiction narrative (Parral historic silver district; colonial/historic workings on-ground) | — | [PUB] Parral district + [REC] timeline "Old Mine Workings Traced", "historic ASARCO workings", colonial-era site imagery |
| Project stages (Las Coloradas: Drilling·Phase 1; Almoloya: Surface sampling) | — | [REC] `companyStatus` (active drilling) + timeline (Almoloya samples, option-to-acquire, not yet drilled) |
| Team (7 members, roles, bios) | Emerson, Johnston, DeMare, Downes, Pryor, Garza Moriel, Cortes Garcia | [REC] `profile.team` |
| Imagery (all photos) | real Kingsmen site photos | [REC] `profile.projects[].gallery`, `brand`, `companyStatus.photo` |

## Editorial framing (qualitative, not new facts)
`hook`, `overview`, `investmentCase[].reason/standsOutBecause`, `competitiveAdvantages`, `investmentSummary`,
`leadership.headline` are **editorial phrasings of the verified facts above** — they add narrative framing,
not new factual claims. Any numeric or factual assertion inside them is drawn from a [REC]/[PR] source in the table.

## Deliberately omitted (unsupported → left out)
- Institutional/insider **ownership** percentages — not in the verified record → `OWNERSHIP` left empty (no ownership beat data).
- **Mineral resource / reserve estimate** — Kingsmen is exploration-stage with **no resource estimate**; none asserted. Evidence beat uses drill intercepts only.
- Specific historic Parral **production tonnages** — not reliably sourced → omitted; jurisdiction narrative kept qualitative.
- Drill **hole IDs** — not in the record summaries → shown as "—" with dated context notes.
