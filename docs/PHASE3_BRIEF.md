# MineEx — Source Integrity & Verification Layer (Phase 3)
## Technical brief for external review

*Self-contained. Assumes no prior context.*

---

## 1. What this system is

MineEx is a platform for junior mining companies. Companies upload press releases
(`.docx`) through a web portal; MineEx extracts the text and publishes it to investors.

Mining disclosure is legally sensitive. A press release contains grade figures,
resource estimates, forward-looking statements and cautionary language that
securities regulators require to travel *with* the claims they qualify. If a
footnote saying "no assurance that further drilling will confirm these results"
silently disappears during extraction, the published release is materially
misleading — and neither the company nor MineEx would know.

That is not hypothetical. It is what triggered this work.

---

## 2. What went wrong (the originating incident)

A real uploaded release produced a **10,490-character** extraction from the DOCX.
What reached the published body was **6,057 characters**. Nobody noticed, because
nothing compared the two.

Investigation found three separate causes:

1. **A link-detection heuristic** was deleting substantive paragraphs it
   misclassified as navigation furniture — 1,313 characters including a silver-
   equivalent calculation formula and an entire project section.
2. **Deliberate truncation** at "About the Company" markers removed 2,977
   characters (signatory block, IR contacts, forward-looking statement). By design,
   but undisclosed.
3. **The extraction engine (`mammoth`) silently omitted `word/footnotes.xml`
   entirely.** A 390-character cautionary disclosure, referenced from the body as
   `footnoteReference id="2"`, was never in the transcript at all. **`mammoth`
   emitted no warning.** The text simply did not exist as far as the pipeline was
   concerned.

Cause 3 is the important one. Causes 1 and 2 are bugs in our code, findable by
reading our code. Cause 3 is a *silent capability gap in a third-party library*.
No amount of testing our own logic would have found it, because our logic was
operating correctly on input that was already incomplete.

A methodological near-miss during the investigation sharpened this: a substring
probe (`transcript.includes(footnoteText)`) reported the footnote present, then
absent, then present again across runs. The body contained a forward-looking-
statement paragraph with *nearly identical wording* to the footnote. Substring
matching could not tell them apart. This is why the final design uses one-to-one
sequence alignment (Myers O(ND) diff) and never substring containment.

---

## 3. The governing requirement

> MineEx must never silently alter, omit, invent, or incorrectly transcribe
> information from an uploaded press release.
>
> For every document, MineEx must either **(A)** establish that the extracted
> representation is faithful to the source, or **(B)** explicitly refuse to mark it
> verified.
>
> **AI confidence must never be used as proof of source fidelity.**
>
> **False rejection is acceptable. Silent corruption is not.**

The last line drives every design decision below. Where the system cannot prove
something, it must say so — not guess, not approximate, and not fall back on a
language model's opinion that the text "looks complete."

---

## 4. Architecture

### 4.1 The provenance chain

```
original .docx bytes
   │
   ├─► source_transcripts      what the extraction engine (mammoth) produced
   │                           — immutable, hashed, append-only
   │
   ├─► source_inventories      an INDEPENDENT reading of the OOXML package
   │   ├─ parts                — every part, whether it was walked, and why not
   │   ├─ blocks               — exact text per (part, paragraph)
   │   └─ notes                — every non-visible construct and the rule that
   │                             classified it
   │
   ├─► verification_runs       deterministic reconciliation of transcript vs inventory
   │   └─ findings             — one row per discrepancy, first-class, not a blob
   │
   └─► canonical_sources       the authoritative representation
       └─ spans                — every span traces to the transcript or to an
                                 inventory block plus the rule that authorized it
```

Each link must exist immutably **before** anything cites it. An earlier draft
stored only an inventory *digest* on the canonical row, which meant provenance
pointed at evidence that existed solely in memory: the digest proved binding, but
"was this 390-character supplement actually in the package?" could never be
answered afterwards.

### 4.2 The independent inventory — why two readers

The core insight: **you cannot detect what an extraction engine silently dropped by
examining its output.** You need a second, independent reading of the source to
compare against.

`_ooxmlInventory.js` reads the DOCX package directly — `[Content_Types].xml`,
relationship graphs, `w:t` / `w:delText` / `w:instrText`, `mc:AlternateContent`
Choice/Fallback branches, `w:fldChar` cached field results, text boxes, VML. It
discovers parts via **content types and relationships, never filenames**, because
a filename convention is a guess and a relationship is a fact.

It declares `sax` and `jszip` as direct dependencies specifically so that removing
`mammoth` leaves the independent reader working. The two readers must not share a
failure mode.

Relationships are triaged three ways:
- **text-bearing** → walk it
- **known-ignorable** (14 types: images, styles, themes…) → skip, record a note
- **known-unread** (charts, SmartArt data, OLE objects) → **cannot be read by this
  engine → the verdict becomes `INDETERMINATE`**, never `VERIFIED`
- **anything unrecognised** → unsupported → `INDETERMINATE`

That third category is the honest part. The system does not pretend chart text
does not exist; it declares that it cannot see it, and refuses to certify.

### 4.3 Reconciliation

`_ooxmlReconcile.js` aligns transcript tokens against inventory tokens using
**Myers O(ND) diff** under an **identity matching projection** — zero
normalization, exact tokens. On the originating document this aligned 1,543
tokens against 1,543 tokens.

Findings are categorised: `MATCHED`, `LAYOUT_DIFFERENCE`, `INTENTIONALLY_IGNORED`,
`MISSING_FROM_TRANSCRIPT`, `UNEXPECTED_IN_TRANSCRIPT`, `ORDER_DIFFERENCE`,
`UNSUPPORTED_SOURCE_ELEMENT`.

### 4.4 The verdict model

Two orthogonal axes:

| `run_status` | `verdict` |
|---|---|
| `COMPLETED` | `VERIFIED` / `DISCREPANCY` / `INDETERMINATE` |
| `FAILED` | must be NULL |

A database CHECK constraint makes that pairing unforgeable rather than
conventional: a run that could not execute has not earned a verdict, and a run
that completed must have one.

**`INDETERMINATE` outranks `DISCREPANCY`.** A known, located, quantified
discrepancy is a *better* epistemic position than "there is a region of this
document I cannot read." Most systems would rank these the other way round.

### 4.5 Composition — structured first, serialized second

The canonical source is **a list of spans**; the serialized text is *derived* from
them. Not the reverse. Every span is either:

- **engine** — carries `(transcript_start, transcript_length)` into the immutable
  transcript, and its text must equal that exact slice; or
- **supplement** — carries the inventory block it copied, the finding that
  authorized the copy, and the composition rule that permitted it.

A CHECK constraint enforces that an engine span carries *no* supplement fields and
vice versa.

**Only `MISSING_FROM_TRANSCRIPT` findings can ever be `SUPPLEMENTABLE`.** And the
composition ruleset deliberately has **no rule for body text**: if an engine loses
a body paragraph, where it belonged is not deterministically recoverable from a
part boundary, so no rule can honestly authorize putting it back. Footnotes,
endnotes, headers and footers *are* recoverable, because those parts are
self-delimiting — each is a complete unit in its own region.

---

## 5. `inventory-digest-v1`

The inventory needs a stable identity so a canonical can bind to specific evidence.

**The first version covered blocks only** — blocks are what supplementation copies
from, so that seemed sufficient. It was not. It left three things unbound:

- a part flipping `walked: true → false` — the difference between "we read this
  part" and "we did not"
- a part's `error` changing — the difference between a known-unread relationship
  and an unexplained one
- **every note** — and notes are precisely what make a verdict of `VERIFIED`
  auditable, since `VERIFIED` asserts that every non-visible construct matched an
  explicit rule

An inventory whose notes can be rewritten without changing its digest **cannot
support the claim its verdict makes.**

### Encoding

Every field is length-prefixed: `BYTELENGTH ":" VALUE`, with a bare `~` for NULL.

```
inventory-digest-v1\n
  <section "parts">  <count> <sorted P-records>
  <section "blocks"> <count> <sorted B-records>
  <section "notes">  <count> <sorted N-records>
```

Properties this buys:

- **NULL ≠ empty string** (`~` vs `0:`) — a missing `error` and a blank `error`
  are different facts about the source.
- **No separator ambiguity.** There is no delimiter to escape, because the reader
  knows how many bytes to consume *before* it looks at them. No choice of content
  inside a value can imitate a field boundary.
- **Domain separation.** Records carry a type tag (`P`/`B`/`N`) and sections carry
  their own name and row count, so a part cannot be read as a block and a
  truncated section cannot masquerade as a shorter one.
- **Deterministic ordering.** Rows sort by their *encoded bytes*. Sequence
  information lives in `source_block`/`source_order` **inside** each record, never
  in list position — so sorting loses nothing, and PostgreSQL (`COLLATE "C"`) and
  JavaScript (`Buffer.compare`) agree without negotiating a locale.
- **Excludes storage metadata**: database ids, `inventory_id`, `company_id`,
  `created_at`, and generated `char_count`/`byte_count`/`sha256`. None describe the
  source; all would make the same inventory hash differently on re-persist.

The digest is implemented **twice** — `api/_inventoryDigest.js` and SQL functions
in the migration — and the audit proves they produce identical output.

---

## 6. The trust boundary

Three properties carry the guarantee:

**1. No client ever writes.** There is no `INSERT`, `UPDATE` or `DELETE` policy on
any of the nine tables. Both write paths are `SECURITY DEFINER` RPCs with
`search_path = public, pg_temp` (`pg_temp` named explicitly and last — omitting it
leaves a `SECURITY DEFINER` function open to temp-table shadowing, since PostgreSQL
searches `pg_temp` *first* for relation names when it is not named).

**2. The database derives; it never accepts.** Tenant is read from the document.
The inventory digest is recomputed from stored rows. The serialized canonical is
reconstructed from spans. `sha256`/`char_count`/`byte_count` are
`GENERATED ALWAYS`. A caller supplying any of these gets a **rejection**, not an
override — an unrecognised payload field raises rather than being ignored.

**3. Every relationship is composite `(id, company_id)`.** Cross-tenant wiring is a
foreign-key violation, not something row-level security happens to hide.

Plus: **append-only means UPDATE *and* DELETE**, enforced by trigger rather than
policy — because `service_role` bypasses RLS entirely, so a policy would guarantee
nothing against anything holding the service key. A trigger fires for every role.

---

## 7. How this was audited

No local PostgreSQL or Docker was available, and the production database could not
be touched. The approach: a single self-contained SQL script that

1. builds an isolated `p3d_audit` schema with synthetic fixtures (no foreign key
   reaches `public`),
2. installs the real migration logic,
3. runs ~173 attacks against the actual constraints, triggers and functions,
4. compares `public` row counts against a baseline captured at run start,
5. `DROP SCHEMA p3d_audit CASCADE`,
6. returns the report from a `pg_temp` table that survives the drop.

**Critical discipline:** the audit's copies of the RPCs and digest functions are
**generated from the migration files by schema substitution**, and the generator
asserts token-identity before the script is emitted. This was added after the
hand-maintained copies drifted (see §8.2).

---

## 8. Defects the audit found

This is the substantive part. Every one belongs to the same failure class: **the
database returned success for an operation other than the one requested.**

### 8.1 Invented `serialized` accepted
`persist_canonical` **ignored** a caller-supplied `serialized` field rather than
rejecting it. The security property held — the persisted text was the
reconstruction, not the forgery — but the caller received success for something
that did not happen.
**Fix:** strict payload contract; any unrecognised field raises `22023`.

### 8.2 The audit had drifted from the migration
The audit script's private copies of the RPCs were not the code the migration would
deploy. Diffing them revealed **two further defects that the audit was structurally
incapable of finding**:

- `search_path = public` (missing `pg_temp`) in both `SECURITY DEFINER` functions
- the migration's `persist_verification` wrote `source_inventory_parts` and
  `source_inventory_notes`; the audited copy did not. **A third of the write
  surface was untested** — including the notes table, which exists specifically to
  make `VERIFIED` auditable.

**Fix:** RPCs are now generated from the migration, with token-identity asserted.

### 8.3 `authorizing_finding_id` silently discarded
A supplement span names the finding that authorized it. The function resolved the
finding *by address* and overwrote a disagreeing caller-supplied id without
complaint.
**Fix:** a named finding must equal the resolved one.

### 8.4 `composition_rule_id` entirely unvalidated
The cited rule was stored verbatim with **no check of any kind**.

**And the obvious fix was also wrong.** The natural check —
`composition_rule_id = 'supplement_' || part_kind` — passes every test in the suite,
because every fixture used footnotes. But the real rule ids are
`supplement_headers` for part kind `header` and `supplement_footers` for `footer`.
That check would have **rejected every legitimate header and footer supplement in
production while looking rigorous in the audit.**

A test that passes for the wrong reason is worse than a missing one.

**Fix:** the ruleset became a database table. A cited rule must (a) exist at the
cited version, (b) belong to the ruleset the canonical claims, (c) cover the part
kind the source block actually came from, and (d) authorize the region the span was
placed in. Condition (d) is new coverage — nothing previously prevented recovered
*header* text being placed in `body`, where it would read as something the document
said in its own voice.

Positive regressions now prove all three mappings are **accepted**:
`footnotes → supplement_footnotes → footnotes`,
`header → supplement_headers → headers`,
`footer → supplement_footers → footers`.

### 8.5 Append-only guard assumed an `id` column
The trigger referenced `old.id`. The rules table is keyed `(rule_id, rule_version)`
and has no `id`, so deleting a rule raised `42703 record "old" has no field "id"` —
a type error, not a refusal. The delete was blocked, but by the wrong mechanism and
with a message that tells an operator nothing.

**Notable:** this was caught only because the test asserts on the *error message*
(`must_fail_with`), not merely that an error occurred. A conventional
"expect it to throw" test would have reported this green. The helper was introduced
one step earlier for an unrelated reason and immediately earned its place.

### 8.6 Stale hardcoded baseline
The `public`-unchanged check compared against row counts written down days earlier.
`companies` moved 1423 → 1424 (organic signup; the audit has no code path that
writes to `public`).

The test conflated two different claims: "the audit mutated `public`" and "`public`
changed at all since I recorded it." **Only the first is the property under audit.**
**Fix:** the run captures its own baseline at start and compares at end.

---

## 9. Current state

**173 tests, 173 passed, 0 failed**, against the real migration logic in an
isolated schema, with `public` provably unmodified.

```
digest 21 · immutability 26 · canonical 18 · rules 12 · verification 11
inventory 9 · provenance 9 · security 16 · unicode 13 · transactionality 10
public-unchanged 25 · cleanup 3
```

Notable coverage:
- **Unicode:** codepoint vs UTF-16 offsets proven to select *different* text on a
  string containing an emoji (JavaScript's `String.length` counts UTF-16 units;
  PostgreSQL's `substr()` counts codepoints — they diverge by one per astral
  character, and a validator mixing them approves the wrong slice). NFD/NFC not
  conflated; NBSP, non-breaking hyphen and RTL preserved exactly.
- **Transactionality:** every failure path leaves no partial artifact.
- **Cross-implementation:** the SQL digest and the JavaScript digest agree on 15
  fixtures including 7 mutations.

Nothing has been applied to the production database.

---

## 10. Open questions — where external review would help

**1. The purge problem.** Evidence is now undeletable by trigger. Because
`documents` cascades into the evidence chain, **a document carrying Phase 3
evidence cannot be deleted at all, by anyone.** That is the requested guarantee
working correctly, and it collides with any data-erasure obligation. What is the
right shape for an auditable purge path that does not reintroduce silent deletion?

**2. The bottom of the trust stack.** `package_sha256` is supplied by the caller.
The digest binds a canonical to *an* inventory, but nothing in the database proves
that inventory reflects the real `.docx` bytes. That trust sits in application code
(94 unit tests) rather than in the database. Is that the right boundary, or should
the original bytes be stored and hashed server-side?

**3. Composer identity.** `composer` and `composer_version` are free text. The
database cannot verify the composer that ran was the approved one. Options seem to
be: a registry table (same shape as the rules fix), signing, or accepting it.

**4. Masked coverage.** Adding the DELETE trigger caused an existing test to start
passing for a *different* reason than its label states — the trigger now fires
before the `ON DELETE RESTRICT` foreign key it was written to exercise. The FK is
still declared and still correct, but nothing tests it. How much does layered
redundancy matter when the outer layer is proven?

**5. General challenge.** Is there an attack on this design that the 173 tests do
not cover? The threat model assumed is a caller with valid credentials attempting
to persist a canonical that claims valid provenance but could not have been
produced by the approved deterministic composer.
