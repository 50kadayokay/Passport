// Computes inventory-digest-v1 for every fixture the isolated-schema audit persists.
//
// These values are embedded in the audit SQL as literals. Nothing in the database
// computes them, so persist_verification()'s recomputation from stored rows has to
// agree with an INDEPENDENT implementation rather than with itself. A shared bug in
// one side cannot cancel out in the other.
import { inventoryDigest } from "../api/_inventoryDigest.js";

const EMOJI = "\u{1F44D}";
const FN   = "Footnote recovered text.";
const CT_MAIN = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";
const CT_FN   = "application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml";
const CT_CH   = "application/vnd.openxmlformats-officedocument.drawingml.chart+xml";

const blk = (partName, partKind, xmlPath, sourceBlock, sourceOrder, text) =>
  ({ partName, partKind, xmlPath, sourceBlock, sourceOrder, structures: [], text });

const F = {
  // The main run: three parts (one deliberately unwalked), four blocks, two notes.
  runA: {
    parts: [
      { partName: "word/document.xml",       partKind: "document",  contentType: CT_MAIN, bytes: 4096, sha256: "1".repeat(64), walked: true,  error: null, via: "package/_rels/.rels" },
      { partName: "word/footnotes.xml",      partKind: "footnotes", contentType: CT_FN,   bytes: 512,  sha256: "2".repeat(64), walked: true,  error: null, via: "word/_rels/document.xml.rels" },
      { partName: "word/charts/chart1.xml",  partKind: "chart",     contentType: CT_CH,   bytes: 900,  sha256: "3".repeat(64), walked: false, error: "KNOWN_UNREAD_REL", via: "word/_rels/document.xml.rels" },
    ],
    blocks: [
      blk("word/document.xml",  "document",  "document/body/p/r/t", 0, 0, "Body one."),
      blk("word/document.xml",  "document",  "document/body/p/r/t", 1, 1, `Grade 5 g/t ${EMOJI} then more.`),
      blk("word/document.xml",  "document",  "document/body/p/r/t", 2, 2, "Body three."),
      blk("word/footnotes.xml", "footnotes", "footnotes/footnote/p/r/t", 3, 3, FN),
    ],
    notes: [
      { noteKind: "ignored",     partName: "word/document.xml",      xmlPath: "document/body/p/pPr", element: "w:instrText", kind: "field-instruction", reason: "field instructions are not visible text", chars: 18, excerpt: null,
        noteRef: null, noteType: null, ns: null, relType: null },
      { noteKind: "unsupported", partName: "word/charts/chart1.xml", xmlPath: "chart",               element: "c:chart",     kind: "chart",             reason: "chart text is not read by this engine",   chars: 0,  excerpt: null,
        noteRef: null, noteType: null, ns: "http://schemas.openxmlformats.org/drawingml/2006/chart",
        relType: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" },
      { noteKind: "note",        partName: "word/footnotes.xml",     xmlPath: null,                  element: null,          kind: "footnote",          reason: null,                                       chars: 0,  excerpt: null,
        noteRef: 2, noteType: "normal", ns: null, relType: null },
    ],
  },
  runFail: { parts: [], blocks: [blk("word/x", null, "p", 0, 0, "z")], notes: [] },
  runInd:  { parts: [], blocks: [blk("word/y", null, "p", 0, 0, "z")], notes: [] },
  // "SUPPLEMENTABLE finding with no inventory content" must survive the digest
  // check to reach the finding check it is actually about.
  noContent: { parts: [], blocks: [blk("p", null, "p", 0, 0, "a")], notes: [] },
  // One per composition rule exercised end to end.
  ruleFootnotes: { parts: [], blocks: [blk("word/footnotes.xml", "footnotes", "p/r/t", 0, 0, "Footnote recovered text.")], notes: [] },
  ruleHeader:    { parts: [], blocks: [blk("word/header1.xml",   "header",    "p/r/t", 0, 0, "Header recovered text.")],   notes: [] },
  ruleFooter:    { parts: [], blocks: [blk("word/footer1.xml",   "footer",    "p/r/t", 0, 0, "Footer recovered text.")],   notes: [] },
};

// Mutation set proving each field is actually covered by the digest.
const clone = (o) => JSON.parse(JSON.stringify(o));
const mutations = {
  base:            (i) => i,
  blockOneChar:    (i) => { i.blocks[3].text = i.blocks[3].text.replace("text.", "texd."); return i; },
  partWalked:      (i) => { i.parts[2].walked = true; return i; },
  partError:       (i) => { i.parts[2].error = "SOMETHING_ELSE"; return i; },
  noteKind:        (i) => { i.notes[0].noteKind = "note"; return i; },
  noteReason:      (i) => { i.notes[1].reason = "chart text is not read by this engine."; return i; },
  noteProvenance:  (i) => { i.notes[0].xmlPath = "document/body/p/rPr"; return i; },
  reordered:       (i) => { i.parts.reverse(); i.blocks.reverse(); i.notes.reverse(); return i; },
  // One per newly bound field. Each changes exactly one value and nothing else, so
  // a digest that does not move proves that field is outside the preimage.
  partVia:         (i) => { i.parts[0].via = "word/_rels/document.xml.rels"; return i; },
  noteRef:         (i) => { i.notes[2].noteRef = 3; return i; },
  noteType:        (i) => { i.notes[2].noteType = "separator"; return i; },
  noteNs:          (i) => { i.notes[1].ns = "http://schemas.openxmlformats.org/drawingml/2006/main"; return i; },
  noteRelType:     (i) => { i.notes[1].relType = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject"; return i; },
};

const out = {};
for (const [k, v] of Object.entries(F)) out[k] = inventoryDigest(v);
for (const [k, fn] of Object.entries(mutations)) out[`mut_${k}`] = inventoryDigest(fn(clone(F.runA)));

if (process.argv[2] === "--sql") {
  const lines = Object.entries(out).map(([k, v]) => `  set_config('p3d.dig_${k}', '${v}', false)`);
  console.log("select\n" + lines.join(",\n") + ";");
} else {
  for (const [k, v] of Object.entries(out)) console.log(v, k);
  const base = out.mut_base;
  const same = Object.entries(out).filter(([k, v]) => k.startsWith("mut_") && k !== "mut_base" && v === base);
  console.log("\nmut_base == runA:", base === out.runA);
  console.log("mutations that did NOT change the digest:", same.length ? same.map(([k]) => k) : "none");
}
