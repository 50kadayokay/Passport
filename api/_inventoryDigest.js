// inventory-digest-v1 -- the identity of a complete independent OOXML inventory.
//
// WHY THIS REPLACED THE BLOCKS-ONLY DIGEST
// ----------------------------------------
// The first digest covered blocks alone, because blocks are what supplementation
// copies from. That made the digest an integrity check on *supplementable text*
// rather than on the inventory, and left three things unbound:
//
//   * a part flipping walked=true -> false, which is the difference between "we
//     read this part" and "we did not"
//   * a part's error changing, which is the difference between a known-unread
//     relationship and an unexplained one
//   * any note at all -- and notes are what make a verdict of VERIFIED auditable,
//     since VERIFIED asserts every non-visible construct matched an explicit rule
//
// An inventory whose notes can be rewritten without changing its digest cannot
// support that assertion. So the digest now covers the whole manifest.
//
// ENCODING
// --------
// Every field is length-prefixed: BYTELENGTH ":" VALUE, with a bare "~" for NULL.
// NULL and the empty string therefore encode differently ("~" vs "0:"), and no
// choice of separator inside a value can imitate a field boundary -- the reader
// knows how many bytes to consume before it looks at them. There is no delimiter
// to escape and none to be ambiguous about.
//
// Records carry a type tag (P/B/N) and sections carry their own name and row
// count, so a part can never be read as a block, and truncating a section cannot
// masquerade as a shorter one.
//
// ORDERING
// --------
// Rows are sorted by their ENCODED BYTES. Sequence information is not carried by
// list position -- it lives in source_block/source_order inside the row -- so
// sorting loses nothing and gives both implementations the same order without
// either needing to agree on a collation. PostgreSQL does it with COLLATE "C",
// JavaScript with Buffer.compare; both are plain UTF-8 byte order.
//
// WHAT IS EXCLUDED
// ----------------
// Database-generated ids, inventory_id, company_id, created_at, and the generated
// char_count/byte_count/sha256 columns. None of them describe the source; all of
// them would make the same inventory hash differently on re-persist.

import { createHash } from "node:crypto";

export const INVENTORY_DIGEST_VERSION = "inventory-digest-v1";

const b = (s) => Buffer.byteLength(s, "utf8");

/** Length-prefixed field. NULL/undefined is "~", distinct from the empty string. */
export const enc = (v) => {
  if (v === null || v === undefined) return "~";
  const s = typeof v === "boolean" ? (v ? "true" : "false") : String(v);
  return `${b(s)}:${s}`;
};

/** An ordered array of labels: its length, then its elements in order. */
const encArray = (a) => {
  const arr = Array.isArray(a) ? a : [];
  return enc(String(arr.length)) + arr.map((x) => enc(x)).join("");
};

const partRow = (p) =>
  "P" + enc(p.partName) + enc(p.partKind) + enc(p.contentType) +
        enc(p.bytes === null || p.bytes === undefined ? null : String(p.bytes)) +
        enc(p.sha256) + enc(p.walked) + enc(p.error);

const blockRow = (x) =>
  "B" + enc(x.partName) + enc(x.partKind) + enc(x.xmlPath) +
        enc(x.sourceBlock === null || x.sourceBlock === undefined ? null : String(x.sourceBlock)) +
        enc(x.sourceOrder === null || x.sourceOrder === undefined ? null : String(x.sourceOrder)) +
        encArray(x.structures) + enc(x.text);

const noteRow = (n) =>
  "N" + enc(n.noteKind) + enc(n.partName) + enc(n.xmlPath) + enc(n.element) +
        enc(n.kind) + enc(n.reason) +
        enc(n.chars === null || n.chars === undefined ? null : String(n.chars)) +
        enc(n.excerpt);

const byBytes = (x, y) => Buffer.compare(Buffer.from(x, "utf8"), Buffer.from(y, "utf8"));

const section = (name, rows) =>
  enc(name) + enc(String(rows.length)) + [...rows].sort(byBytes).join("");

/** The exact bytes that get hashed. Exposed so a mismatch can be diffed, not guessed at. */
export const inventoryPreimage = ({ parts = [], blocks = [], notes = [] }) =>
  INVENTORY_DIGEST_VERSION + "\n" +
  section("parts",  parts.map(partRow)) +
  section("blocks", blocks.map(blockRow)) +
  section("notes",  notes.map(noteRow));

export const inventoryDigest = (inv) =>
  createHash("sha256").update(inventoryPreimage(inv), "utf8").digest("hex");
