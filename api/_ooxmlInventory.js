// Phase 3A — independent OOXML text inventory.
//
// WHAT THIS IS
// ------------
// A second, independent reading of a .docx: it opens the package itself, walks the
// XML of every text-bearing part, and records each piece of text with the exact
// part and element path that produced it.
//
// WHY IT EXISTS
// -------------
// Phase 2 proved that MineEx preserves what mammoth returned. It could not prove
// that mammoth returned everything. On the real Kingsmen release mammoth silently
// dropped `word/footnotes.xml` -- 390 characters of cautionary disclosure about
// undrilled ground being "inherently uncertain" -- and emitted no warning about it.
// No check against mammoth's own output could ever have found that.
//
// So this path shares NOTHING with mammoth. Not its code, not its output, not its
// dependency tree: `sax` and `jszip` are declared as direct dependencies of this
// project precisely so that removing mammoth would leave the inventory working.
// Agreement between two readings only means something when they are independent.
//
// SCOPE (3A)
// ----------
// Inventory and provenance only. No reconciliation, no verdicts, no canonical
// composition, no publishing gate. This module reports what the package contains;
// deciding what that implies is 3B's job.
//
// It classifies but does not judge: every item carries a `kind` and a `visible`
// flag, and anything the ruleset does not recognise is surfaced as UNKNOWN rather
// than quietly dropped. A construct we have never seen is exactly the thing most
// likely to be hiding text.

import { createHash } from "node:crypto";

export const INVENTORY_ENGINE = "mineex-ooxml-inventory";
export const INVENTORY_VERSION = "1.0.0";

// ---------------------------------------------------------------- namespaces
const NS = {
  W:   "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  MC:  "http://schemas.openxmlformats.org/markup-compatibility/2006",
  WP:  "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
  A:   "http://schemas.openxmlformats.org/drawingml/2006/main",
  PIC: "http://schemas.openxmlformats.org/drawingml/2006/picture",
  V:   "urn:schemas-microsoft-com:vml",
  CT:  "http://schemas.openxmlformats.org/package/2006/content-types",
  REL: "http://schemas.openxmlformats.org/package/2006/relationships",
};

// Relationship types whose targets can contain document text.
const REL_TYPE = {
  OFFICE_DOC: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
  HEADER:     "http://schemas.openxmlformats.org/officeDocument/2006/relationships/header",
  FOOTER:     "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer",
  FOOTNOTES:  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes",
  ENDNOTES:   "http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes",
  COMMENTS:   "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments",
};

// ---------------------------------------------------------------- rel surface
// EVERY relationship from the main document is classified. A relationship type
// that is neither walkable nor on the ignorable list is treated as potentially
// text-bearing and forces INDETERMINATE downstream -- because the alternative is
// deciding that something we have never seen contains nothing worth reading.
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";
const MSR = "http://schemas.microsoft.com/office/2006/relationships/";

// Parts that carry document text and that the walker understands.
const TEXT_BEARING_RELS = new Set([
  `${R}header`, `${R}footer`, `${R}footnotes`, `${R}endnotes`, `${R}comments`,
]);

// Parts that provably carry no authored document text. Each is here because its
// content is formatting, binary media, or an external address -- never prose the
// company wrote. Anything not on this list is NOT assumed safe.
const IGNORABLE_RELS = new Set([
  `${R}styles`, `${R}numbering`, `${R}fontTable`, `${R}settings`, `${R}webSettings`,
  `${R}theme`, `${R}image`, `${R}hyperlink`, `${R}printerSettings`, `${R}thumbnail`,
  `${R}customXml`, `${R}customXmlProps`, `${R}calcChain`, `${R}sharedStrings`,
  `${MSR}stylesWithEffects`, `${MSR}people`, `${MSR}commentsIds`, `${MSR}commentsExtensible`,
]);

// Parts KNOWN to be able to carry text that this verifier does not yet read.
// Named explicitly so the report can say what it is, rather than "unknown".
const KNOWN_UNREAD_RELS = new Map([
  [`${R}chart`,            "chart part: axis titles, data labels and series names are text"],
  [`${R}diagramData`,      "SmartArt data: node text is text"],
  [`${R}diagramLayout`,    "SmartArt layout: may carry text"],
  [`${R}diagramColors`,    "SmartArt colours: may carry text"],
  [`${R}diagramQuickStyle`,"SmartArt style: may carry text"],
  [`${R}oleObject`,        "embedded OLE object: may contain a document"],
  [`${R}package`,          "embedded package: may contain a document"],
  [`${R}control`,          "ActiveX control: may carry a caption"],
  [`${R}subDocument`,      "linked sub-document: contains document text"],
  [`${R}glossaryDocument`, "glossary/building blocks: contains document text"],
  [`${MSR}commentsExtended`, "extended comments: may carry text"],
]);

// Content types we know how to walk. A part is inventoried only if BOTH a
// relationship points at it AND its declared content type is one of these --
// filenames are a convention, not a contract, and a hostile or unusual package is
// free to ignore the convention.
const WALKABLE_CT = new Map([
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml", "document"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml",        "header"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml",        "footer"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml",     "footnotes"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml",      "endnotes"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml",      "comments"],
  // Templates declare the main part under a different content type.
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml", "document"],
]);

// ---------------------------------------------------------------- element table
// Elements whose character data or attributes carry text, and how to treat each.
// `visible` means "a reader of the document sees it"; it is NOT a decision about
// whether the text should end up anywhere, which belongs to 3B.
const TEXT_ELEMENTS = new Map([
  [`${NS.W}|t`,             { kind: "text",       visible: true }],
  [`${NS.W}|delText`,       { kind: "deleted",    visible: false, reason: "tracked deletion: not visible in the document" }],
  [`${NS.W}|instrText`,     { kind: "field_code",  visible: false, reason: "field instruction, not user-visible text" }],
  [`${NS.W}|delInstrText`,  { kind: "field_code",  visible: false, reason: "deleted field instruction" }],
  [`${NS.A}|t`,             { kind: "text",       visible: true }],   // DrawingML shape/chart text
]);

// Empty elements that still stand for characters a reader perceives.
const CHAR_ELEMENTS = new Map([
  [`${NS.W}|tab`,            { text: "\t",     kind: "tab" }],
  [`${NS.W}|ptab`,           { text: "\t",     kind: "tab" }],
  [`${NS.W}|br`,             { text: "\n",     kind: "break" }],
  [`${NS.W}|cr`,             { text: "\n",     kind: "break" }],
  [`${NS.W}|noBreakHyphen`,  { text: "‑", kind: "text" }],
  [`${NS.W}|softHyphen`,     { text: "­", kind: "text" }],
]);

// Containers that tell us WHERE a piece of text sits. Recorded on every item so a
// discrepancy can later be described to an operator in the document's own terms.
const STRUCTURE_ELEMENTS = new Map([
  [`${NS.W}|tbl`,          "table"],
  [`${NS.W}|tr`,           "table_row"],
  [`${NS.W}|tc`,           "table_cell"],
  [`${NS.W}|hyperlink`,    "hyperlink"],
  [`${NS.W}|txbxContent`,  "textbox"],
  [`${NS.V}|textbox`,      "textbox_vml"],
  [`${NS.W}|ins`,          "insertion"],
  [`${NS.W}|sdtContent`,   "content_control"],
  [`${NS.W}|footnote`,     "footnote"],
  [`${NS.W}|endnote`,      "endnote"],
  [`${NS.W}|comment`,      "comment"],
  [`${NS.W}|hdr`,          "header"],
  [`${NS.W}|ftr`,          "footer"],
  [`${NS.MC}|Choice`,      "alternate_choice"],
  [`${NS.MC}|Fallback`,    "alternate_fallback"],
]);

// Elements known to be structural/formatting and never to hold character data.
// Anything NOT here that turns out to contain text is reported as UNKNOWN.
const KNOWN_INERT = new Set([
  "p", "r", "rPr", "pPr", "sectPr", "body", "document", "tblPr", "tblGrid", "gridCol",
  "trPr", "tcPr", "rFonts", "sz", "szCs", "color", "spacing", "ind", "jc", "b", "i", "u",
  "lang", "noProof", "bookmarkStart", "bookmarkEnd", "proofErr", "lastRenderedPageBreak",
  "drawing", "pict", "object", "fldChar", "footnoteReference", "endnoteReference",
  "commentReference", "commentRangeStart", "commentRangeEnd", "sym", "pgSz", "pgMar",
  "headerReference", "footerReference", "numPr", "ilvl", "numId", "pStyle", "rStyle",
  "highlight", "shd", "vertAlign", "position", "kern", "keepNext", "keepLines",
  "outlineLvl", "contextualSpacing", "widowControl", "tabs", "tab", "smartTag",
  "separator", "continuationSeparator", "footnotePr", "endnotePr", "vanish", "webHidden",
]);

// ---------------------------------------------------------------- small helpers
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const shortRel = (u) => String(u).split("/").pop();
const keyOf = (node) => `${node.uri || ""}|${node.local}`;

function attr(node, uri, local) {
  for (const a of Object.values(node.attributes || {})) {
    if (a.local === local && (!uri || a.uri === uri || a.uri === "")) return a.value;
  }
  return null;
}

/** Resolve a relationship target against the part that declared it. */
function resolveTarget(basePart, target) {
  if (!target) return null;
  if (target.startsWith("/")) return target.slice(1);
  const dir = basePart.includes("/") ? basePart.slice(0, basePart.lastIndexOf("/")) : "";
  const joined = dir ? `${dir}/${target}` : target;
  const out = [];
  for (const seg of joined.split("/")) {
    if (seg === "." || seg === "") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return out.join("/");
}

// ---------------------------------------------------------------- XML helpers
async function parseXml(text, handlers) {
  const { default: sax } = await import("sax");
  // xmlns:true so elements are matched on namespace URI + local name. Prefixes are
  // a convention; a document is free to bind "w:" to something else, and a
  // prefix-matching parser would read it wrong without ever saying so.
  const parser = sax.parser(true, { xmlns: true, trim: false, normalize: false, position: true });
  for (const [k, fn] of Object.entries(handlers)) parser[k] = fn;
  parser.write(text).close();
}

/** Read the package's content-type map: extension defaults plus per-part overrides. */
async function readContentTypes(xml) {
  const defaults = new Map(), overrides = new Map();
  await parseXml(xml, {
    onopentag(node) {
      if (node.uri !== NS.CT) return;
      if (node.local === "Default") {
        const ext = attr(node, null, "Extension"), ct = attr(node, null, "ContentType");
        if (ext && ct) defaults.set(ext.toLowerCase(), ct);
      } else if (node.local === "Override") {
        const pn = attr(node, null, "PartName"), ct = attr(node, null, "ContentType");
        if (pn && ct) overrides.set(pn.replace(/^\//, ""), ct);
      }
    },
    onerror(e) { throw e; },
  });
  return {
    typeOf(part) {
      if (overrides.has(part)) return overrides.get(part);
      const ext = part.includes(".") ? part.slice(part.lastIndexOf(".") + 1).toLowerCase() : "";
      return defaults.get(ext) || null;
    },
  };
}

/** Read one .rels part into [{ type, target }]. */
async function readRels(xml, basePart) {
  const rels = [];
  await parseXml(xml, {
    onopentag(node) {
      if (node.uri !== NS.REL || node.local !== "Relationship") return;
      const type = attr(node, null, "Type");
      const target = attr(node, null, "Target");
      const mode = attr(node, null, "TargetMode");
      if (!type || !target || mode === "External") return;
      rels.push({ type, target, resolved: resolveTarget(basePart, target) });
    },
    onerror(e) { throw e; },
  });
  return rels;
}

// ---------------------------------------------------------------- the walker
/**
 * Walk one part, emitting items, unsupported constructs and ignore records.
 *
 * Text is recorded EXACTLY as it appears. No trimming, no whitespace collapsing,
 * no quote folding: this value is the authority a later reconciliation compares
 * against, and an authority that has already been normalised cannot detect a
 * normalisation.
 */
async function walkPart({ partName, partKind, xml, out, limits }) {
  const stack = [];                 // [{ key, local, uri }]
  const structures = [];            // active structure labels
  // Which PARAGRAPH INSTANCE a text item belongs to.
  //
  // `path` says an item is inside a w:p; it cannot say WHICH w:p, because every
  // body paragraph has the identical path. Reconciliation needs the distinction:
  // two runs in one paragraph join seamlessly in extracted text, while two
  // paragraphs are separated. Without instance identity a verifier cannot tell a
  // legitimate separator from text that went missing between them.
  //
  // Additive provenance only -- no existing field changes meaning.
  const blockStack = [];
  // Field state. A Word field is a run of three markers:
  //   fldChar begin -> instrText (the instruction) -> fldChar separate
  //   -> w:t (the CACHED RESULT) -> fldChar end
  // The instruction was already classified as non-visible. The result is text a
  // reader sees, but it is COMPUTED by Word rather than authored -- a PAGE field
  // renders "2" on page two and "7" on page seven. Counting it as source content
  // reports a discrepancy every time an engine skips footers, which trains an
  // operator to dismiss findings. Classified explicitly instead of guessed at.
  let fieldDepth = 0;          // nested fields are legal
  let inFieldResult = 0;
  // mc:AlternateContent is SUPPOSED to express the same content twice. When the two
  // branches disagree, which one a reader sees depends on their application -- so
  // the verifier cannot know what the document says, and must not pretend to.
  let choiceText = null, collectChoice = false, fallbackText = null, fallbackPath = null;
  let order = out.items.length;
  let skipDepth = -1;               // inside an mc:Fallback being discarded
  let noteSkipDepth = -1;           // inside a separator footnote/endnote
  let curText = null;               // active text element descriptor

  const pathOf = () => stack.map((s) => s.local).join("/");

  await parseXml(xml, {
    onopentag(node) {
      const key = keyOf(node);
      stack.push({ key, local: node.local, uri: node.uri });
      // Depth and volume are checked while walking, not afterwards: a pathological
      // document must be stopped, not measured once it has already consumed memory.
      if (stack.length > limits.maxXmlDepth) throw new Error(`XML nesting exceeds ${limits.maxXmlDepth}`);

      // mc:AlternateContent carries the SAME content twice -- once per Choice, once
      // in Fallback. Counting both double-counts every shape, so Choice wins and
      // the Fallback is recorded as a deliberate skip rather than vanishing.
      if (key === `${NS.MC}|Fallback` && skipDepth < 0) {
        skipDepth = stack.length;
        fallbackText = "";
        fallbackPath = pathOf();
        out.ignored.push({ part: partName, path: pathOf(), kind: "alternate_fallback",
                           reason: "mc:Fallback duplicates mc:Choice; Choice is inventoried" });
        return;
      }
      if (key === `${NS.MC}|Choice`) { choiceText = ""; collectChoice = true; }

      // Separator footnotes/endnotes are rendering furniture, not content. The
      // w:type attribute is authoritative; the id convention (<= 0) is a fallback
      // for documents that omit it.
      if ((key === `${NS.W}|footnote` || key === `${NS.W}|endnote`) && noteSkipDepth < 0) {
        const type = attr(node, NS.W, "type");
        const id = parseInt(attr(node, NS.W, "id") ?? "", 10);
        const isSeparator = (type && type !== "normal") || (!type && Number.isFinite(id) && id <= 0);
        if (isSeparator) {
          noteSkipDepth = stack.length;
          out.ignored.push({ part: partName, path: pathOf(), kind: "note_separator",
                             reason: `${node.local} type=${type || `id ${id}`}: separator/continuation, not content`,
                             noteId: Number.isFinite(id) ? id : null });
          return;
        }
        out.notes.push({ part: partName, kind: node.local, id: Number.isFinite(id) ? id : null, type: type || "normal" });
      }

      if (skipDepth >= 0 || noteSkipDepth >= 0) return;

      if (key === `${NS.W}|fldChar`) {
        const ty = attr(node, NS.W, "fldCharType");
        if (ty === "begin") fieldDepth++;
        else if (ty === "separate" && fieldDepth > 0) inFieldResult++;
        else if (ty === "end") { if (inFieldResult > 0) inFieldResult--; if (fieldDepth > 0) fieldDepth--; }
      }
      if (key === `${NS.W}|p`) blockStack.push(out.blockCount++);
      if (STRUCTURE_ELEMENTS.has(key)) structures.push(STRUCTURE_ELEMENTS.get(key));

      // Alt text on a drawing is authored, user-meaningful text.
      if (key === `${NS.WP}|docPr` || key === `${NS.PIC}|cNvPr`) {
        for (const a of ["title", "descr"]) {
          const v = attr(node, null, a);
          if (v && v.trim()) {
            out.items.push({ text: v, kind: "alt_text", visible: false,
                             reason: "image alternative text, not body copy",
                             part: partName, partKind, path: pathOf(), order: order++,
                         block: blockStack.length ? blockStack[blockStack.length - 1] : null,
                             structures: [...structures] });
          }
        }
      }

      // w:sym encodes a character by code point in an attribute.
      if (key === `${NS.W}|sym`) {
        const ch = attr(node, NS.W, "char");
        if (ch && /^[0-9a-fA-F]{1,6}$/.test(ch)) {
          out.items.push({ text: String.fromCodePoint(parseInt(ch, 16)), kind: "symbol", visible: true,
                           part: partName, partKind, path: pathOf(), order: order++,
                         block: blockStack.length ? blockStack[blockStack.length - 1] : null,
                           structures: [...structures] });
        }
      }

      if (CHAR_ELEMENTS.has(key)) {
        const c = CHAR_ELEMENTS.get(key);
        out.items.push({ text: c.text, kind: c.kind, visible: true,
                         part: partName, partKind, path: pathOf(), order: order++,
                         block: blockStack.length ? blockStack[blockStack.length - 1] : null,
                         structures: [...structures] });
      }

      curText = TEXT_ELEMENTS.get(key) || null;
    },

    ontext(raw) {
      if (skipDepth >= 0 && fallbackText !== null && raw) fallbackText += raw;
      if (collectChoice && skipDepth < 0 && raw && choiceText !== null) choiceText += raw;
      if (skipDepth >= 0 || noteSkipDepth >= 0 || !raw) return;
      const top = stack[stack.length - 1];
      if (!top) return;

      if (curText) {
        // Reviewer comments live in the package but are not the company's
        // disclosure: they are annotations about the document, not part of it.
        // Classified explicitly so an engine that skips them is not reported as
        // having lost content, and so their presence is still visible in the report.
        if (partKind === "comments" && curText.kind === "text") {
          out.textChars += raw.length;
          out.items.push({ text: raw, kind: "comment_text", visible: false,
                           reason: "reviewer comment; an annotation about the document, not part of it",
                           part: partName, partKind, path: pathOf(), order: order++,
                           block: blockStack.length ? blockStack[blockStack.length - 1] : null,
                           structures: [...structures] });
          return;
        }
        // Inside a field result, w:t is Word's rendering of the instruction.
        if (inFieldResult > 0 && curText.kind === "text") {
          out.items.push({ text: raw, kind: "field_result", visible: false,
                           reason: "cached field result rendered by Word, not authored content",
                           part: partName, partKind, path: pathOf(), order: order++,
                           block: blockStack.length ? blockStack[blockStack.length - 1] : null,
                           structures: [...structures] });
          return;
        }
        out.textChars += raw.length;
        out.items.push({ text: raw, kind: curText.kind, visible: curText.visible,
                         ...(curText.reason ? { reason: curText.reason } : {}),
                         part: partName, partKind, path: pathOf(), order: order++,
                         block: blockStack.length ? blockStack[blockStack.length - 1] : null,
                         structures: [...structures] });
        return;
      }

      // Character data under an element we do not recognise. This is the single
      // most important branch in the file: an unknown construct holding text is
      // exactly what a filename-and-convention parser loses silently. It is
      // recorded as UNKNOWN so 3B can refuse to call the document verified.
      if (raw.trim() && !KNOWN_INERT.has(top.local)) {
        out.items.push({ text: raw, kind: "unknown_text", visible: null,
                         reason: `character data inside an unrecognised element <${top.local}>`,
                         part: partName, partKind, path: pathOf(), order: order++,
                         block: blockStack.length ? blockStack[blockStack.length - 1] : null,
                         structures: [...structures] });
        out.unsupported.push({ part: partName, path: pathOf(), element: top.local,
                               ns: top.uri || null, chars: raw.length,
                               reason: "unrecognised element containing character data" });
      }
    },

    oncdata(raw) { this.ontext ? null : null; if (raw && raw.trim()) {
      out.unsupported.push({ part: partName, path: pathOf(), element: "#cdata", ns: null,
                             chars: raw.length, reason: "CDATA section encountered" });
    } },

    onclosetag() {
      const popped = stack.pop();
      if (!popped) return;
      if (skipDepth >= 0 && stack.length < skipDepth) {
        skipDepth = -1;
        const a = (choiceText || "").replace(/\s+/g, " ").trim();
        const b = (fallbackText || "").replace(/\s+/g, " ").trim();
        if (b && a !== b) {
          out.unsupported.push({ part: partName, path: fallbackPath, element: "mc:AlternateContent", ns: null,
                                 chars: Math.abs(b.length - a.length),
                                 reason: "mc:Choice and mc:Fallback contain DIFFERENT text; which one a reader sees depends on the application" });
        }
        fallbackText = null; fallbackPath = null;
      }
      if (popped.key === `${NS.MC}|Choice`) collectChoice = false;
      if (noteSkipDepth >= 0 && stack.length < noteSkipDepth) noteSkipDepth = -1;
      if (popped.key === `${NS.W}|p` && blockStack.length) blockStack.pop();
      if (STRUCTURE_ELEMENTS.has(popped.key) && structures.length) structures.pop();
      curText = null;
      if (out.items.length > limits.maxItems) throw new Error(`inventory item limit exceeded (${limits.maxItems})`);
      if (out.textChars > limits.maxTextChars) throw new Error(`inventory text limit exceeded (${limits.maxTextChars})`);
    },

    onerror(e) { throw e; },
  });
}

// ---------------------------------------------------------------- entry point
export const LIMITS = {
  maxCompressedBytes:   25 * 1024 * 1024,   // package as delivered
  maxUncompressedBytes: 120 * 1024 * 1024,  // sum of declared part sizes (zip bomb)
  maxPartBytes:         40 * 1024 * 1024,   // any single part
  maxParts:             64,                 // parts actually walked
  maxEntries:           2048,               // zip entries, walked or not
  maxItems:             500000,             // inventory items
  maxTextChars:         40 * 1024 * 1024,   // total visible characters
  maxXmlDepth:          256,                // element nesting
};

/**
 * Build an independent inventory of a .docx package.
 *
 * Every limit below fails CLOSED: exceeding one sets `fatal`, which the reconciler
 * turns into run_status FAILED. A partially walked package must never be allowed
 * to look like a complete one -- a truncated inventory would report the text it did
 * not reach as missing, or worse, report a document as fully accounted for.
 */
export async function inventoryDocx(buffer, opts = {}) {
  const L = { ...LIMITS, ...opts };
  const { maxParts, maxItems } = L;
  const report = {
    ok: false, fatal: null,
    engine: INVENTORY_ENGINE, version: INVENTORY_VERSION,
    packageSha256: null,
    parts: [], items: [], unsupported: [], ignored: [], notes: [],
    blockCount: 0, textChars: 0, declaredUncompressedBytes: 0,
    stats: null,
  };

  let zip;
  try {
    if (!buffer || !buffer.length) { report.fatal = "empty input"; return report; }
    if (buffer.length > L.maxCompressedBytes) {
      report.fatal = `package exceeds the compressed size limit (${buffer.length} > ${L.maxCompressedBytes})`;
      return report;
    }
    const { default: JSZip } = await import("jszip");
    report.packageSha256 = sha256(buffer);
    zip = await JSZip.loadAsync(buffer);
  } catch (e) {
    report.fatal = `package could not be opened: ${e && e.message ? e.message : e}`;
    return report;
  }

  // Zip-bomb guard, read from the central directory BEFORE inflating anything.
  try {
    const entries = Object.values(zip.files || {}).filter((f) => !f.dir);
    if (entries.length > L.maxEntries) {
      report.fatal = `package has too many entries (${entries.length} > ${L.maxEntries})`;
      return report;
    }
    let declared = 0;
    for (const f of entries) {
      const n = (f._data && f._data.uncompressedSize) || 0;
      if (n > L.maxPartBytes) { report.fatal = `part ${f.name} exceeds the per-part limit (${n} > ${L.maxPartBytes})`; return report; }
      declared += n;
    }
    report.declaredUncompressedBytes = declared;
    if (declared > L.maxUncompressedBytes) {
      report.fatal = `package expands beyond the uncompressed limit (${declared} > ${L.maxUncompressedBytes})`;
      return report;
    }
  } catch (e) {
    report.fatal = `package directory could not be read: ${e && e.message ? e.message : e}`;
    return report;
  }

  const readText = async (name) => {
    const f = zip.file(name);
    return f ? f.async("string") : null;
  };
  const readBytes = async (name) => {
    const f = zip.file(name);
    return f ? f.async("nodebuffer") : null;
  };

  // 1) Content types, then 2) relationships. Parts are discovered through the
  //    package's own declarations -- never by guessing at filenames.
  let ct;
  try {
    const ctXml = await readText("[Content_Types].xml");
    if (!ctXml) { report.fatal = "[Content_Types].xml is missing"; return report; }
    ct = await readContentTypes(ctXml);
  } catch (e) {
    report.fatal = `[Content_Types].xml could not be parsed: ${e && e.message ? e.message : e}`;
    return report;
  }

  let mainPart = null;
  try {
    const rootRels = await readText("_rels/.rels");
    if (!rootRels) { report.fatal = "_rels/.rels is missing"; return report; }
    const rels = await readRels(rootRels, "");
    const office = rels.find((r) => r.type === REL_TYPE.OFFICE_DOC);
    mainPart = office ? office.resolved : null;
  } catch (e) {
    report.fatal = `_rels/.rels could not be parsed: ${e && e.message ? e.message : e}`;
    return report;
  }
  if (!mainPart) { report.fatal = "no officeDocument relationship found"; return report; }

  const discovered = [{ name: mainPart, via: "package/_rels/.rels" }];
  try {
    const docRelsName = mainPart.replace(/([^/]+)$/, "_rels/$1.rels");
    const docRelsXml = await readText(docRelsName);
    if (docRelsXml) {
      // EVERY relationship is triaged. Silence about an unrecognised relationship
      // is the failure mode this whole layer exists to prevent: a chart or an
      // embedded document is a perfectly ordinary place for disclosure to live.
      for (const r of await readRels(docRelsXml, mainPart)) {
        if (TEXT_BEARING_RELS.has(r.type)) {
          if (!discovered.some((d) => d.name === r.resolved)) discovered.push({ name: r.resolved, via: docRelsName });
        } else if (IGNORABLE_RELS.has(r.type)) {
          report.ignored.push({ part: r.resolved, path: docRelsName, kind: "non_text_relationship",
                                reason: `relationship type carries no authored text: ${shortRel(r.type)}` });
        } else if (KNOWN_UNREAD_RELS.has(r.type)) {
          report.unsupported.push({ part: r.resolved, path: docRelsName, element: null, ns: null, chars: 0,
                                    reason: `text-bearing part this verifier does not read -- ${KNOWN_UNREAD_RELS.get(r.type)}`,
                                    relType: r.type });
        } else {
          report.unsupported.push({ part: r.resolved, path: docRelsName, element: null, ns: null, chars: 0,
                                    reason: `unrecognised relationship type; cannot rule out document text: ${r.type}`,
                                    relType: r.type });
        }
      }
    }
  } catch (e) {
    report.unsupported.push({ part: mainPart, path: "_rels", element: null, ns: null, chars: 0,
                              reason: `document relationships could not be parsed: ${e && e.message ? e.message : e}` });
  }

  if (discovered.length > maxParts) { report.fatal = `too many parts (${discovered.length})`; return report; }

  // 3) Walk each discovered part whose declared content type we understand.
  for (const d of discovered) {
    const contentType = ct.typeOf(d.name);
    const partKind = contentType ? WALKABLE_CT.get(contentType) : null;
    const bytes = await readBytes(d.name);
    const entry = {
      name: d.name, contentType, kind: partKind, via: d.via,
      bytes: bytes ? bytes.length : 0,
      sha256: bytes ? sha256(bytes) : null,
      items: 0, visibleChars: 0, walked: false, error: null,
    };

    if (!bytes) { entry.error = "part referenced by a relationship but absent from the package"; report.parts.push(entry); continue; }
    if (!partKind) {
      entry.error = `content type not walkable: ${contentType || "unknown"}`;
      // The main document part is not optional. If it cannot be walked there is no
      // inventory to reconcile against, and a COMPLETED run reporting zero content
      // would be far more dangerous than an honest failure.
      if (d.name === mainPart) {
        report.fatal = `main document part declares a content type this verifier cannot walk: ${contentType || "(none)"}`;
      }
      report.unsupported.push({ part: d.name, path: "", element: null, ns: null, chars: 0,
                                reason: `referenced text-bearing part with unhandled content type ${contentType || "(none)"}` });
      report.parts.push(entry);
      continue;
    }

    const before = report.items.length;
    try {
      await walkPart({ partName: d.name, partKind, xml: bytes.toString("utf8"), out: report, limits: L });
      entry.walked = true;
    } catch (e) {
      // A part we cannot parse is not a document verdict -- it is an inability to
      // verify, and 3B must be told so rather than shown a short inventory.
      // Carry the SPECIFIC reason up. "could not be parsed" tells an operator
      // nothing; "inventory text limit exceeded" tells them the document is too
      // large for the current budget, which is a different problem with a
      // different answer.
      const why = e && e.message ? e.message : String(e);
      entry.error = `parse failed: ${why}`;
      report.fatal = report.fatal || `part ${d.name} could not be parsed: ${why}`;
    }
    const mine = report.items.slice(before);
    entry.items = mine.length;
    entry.visibleChars = mine.filter((x) => x.visible === true).reduce((a, x) => a + x.text.length, 0);
    report.parts.push(entry);
  }

  const visible = report.items.filter((x) => x.visible === true);
  report.stats = {
    parts: report.parts.length,
    partsWalked: report.parts.filter((p) => p.walked).length,
    items: report.items.length,
    visibleItems: visible.length,
    visibleChars: visible.reduce((a, x) => a + x.text.length, 0),
    invisibleItems: report.items.filter((x) => x.visible === false).length,
    unknownItems: report.items.filter((x) => x.visible === null).length,
    unsupported: report.unsupported.length,
    ignored: report.ignored.length,
    notes: report.notes.length,
    byKind: report.items.reduce((a, x) => { a[x.kind] = (a[x.kind] || 0) + 1; return a; }, {}),
    byStructure: visible.reduce((a, x) => { for (const s of x.structures) a[s] = (a[s] || 0) + 1; return a; }, {}),
  };
  report.ok = !report.fatal;
  return report;
}

/**
 * Visible text of one part, concatenated in document order.
 *
 * A convenience for reporting and tests. Reconciliation in 3B works from `items`,
 * not from this -- flattening to a string discards the provenance that makes a
 * discrepancy actionable.
 */
export function visibleTextOf(report, partName = null) {
  return report.items
    .filter((x) => x.visible === true && (!partName || x.part === partName))
    .map((x) => x.text).join("");
}
