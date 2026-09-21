// Synthetic .docx fixtures for the OOXML inventory tests.
//
// Built in-process rather than committed as binaries: a .docx is a zip, and a
// checked-in binary is a fixture nobody can read in a diff or adjust in a review.
// Every structure below exists because it is a way a real document can hide text.
//
// These deliberately do NOT go through Word. Word would normalise away exactly the
// awkward shapes we need — unknown elements, odd prefixes, duplicated
// AlternateContent branches.

import JSZip from "jszip";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const MC = "http://schemas.openxmlformats.org/markup-compatibility/2006";

const CONTENT_TYPES = (extra = "") => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
${extra}</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const docRels = (rels = "") => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${rels}</Relationships>`;

const doc = (body) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}" xmlns:mc="${MC}"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><w:body>${body}</w:body></w:document>`;

export const p = (t) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;

/** Assemble a package from a map of part name -> string contents. */
async function pack(parts) {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(parts)) zip.file(name, content);
  return zip.generateAsync({ type: "nodebuffer" });
}

export const FIXTURES = {
  /** The simplest possible document: three plain paragraphs. */
  async baseline() {
    return pack({
      "[Content_Types].xml": CONTENT_TYPES(),
      "_rels/.rels": ROOT_RELS,
      "word/document.xml": doc(p("First paragraph.") + p("Second paragraph.") + p("Third paragraph.")),
    });
  },

  /** A real footnote alongside the three separator notes Word always writes. */
  async footnotes() {
    return pack({
      "[Content_Types].xml": CONTENT_TYPES(
        '<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>'),
      "_rels/.rels": ROOT_RELS,
      "word/_rels/document.xml.rels": docRels(
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>'),
      "word/document.xml": doc(p("Body text.") + `<w:p><w:r><w:footnoteReference w:id="2"/></w:r></w:p>`),
      "word/footnotes.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:footnotes xmlns:w="${W}">
<w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/><w:t>SEPARATOR MUST NOT COUNT</w:t></w:r></w:p></w:footnote>
<w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:t>CONTINUATION MUST NOT COUNT</w:t></w:r></w:p></w:footnote>
<w:footnote w:id="2"><w:p><w:r><w:t xml:space="preserve">REAL FOOTNOTE CONTENT that must be inventoried.</w:t></w:r></w:p></w:footnote>
</w:footnotes>`,
    });
  },

  /** Headers and footers carrying real text, plus a PAGE field. */
  async headersFooters() {
    return pack({
      "[Content_Types].xml": CONTENT_TYPES(
        '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' +
        '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>'),
      "_rels/.rels": ROOT_RELS,
      "word/_rels/document.xml.rels": docRels(
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>'),
      "word/document.xml": doc(p("Body.")),
      "word/header1.xml": `<?xml version="1.0"?><w:hdr xmlns:w="${W}">${p("HEADER TEXT HERE")}</w:hdr>`,
      "word/footer1.xml": `<?xml version="1.0"?><w:ftr xmlns:w="${W}">${p("FOOTER TEXT HERE")}<w:p><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r></w:p></w:ftr>`,
    });
  },

  /** A 2x2 table. Cell text is content; cell boundaries are layout. */
  async tables() {
    const cell = (t) => `<w:tc><w:tcPr/>${p(t)}</w:tc>`;
    const row = (a, b) => `<w:tr>${cell(a)}${cell(b)}</w:tr>`;
    return pack({
      "[Content_Types].xml": CONTENT_TYPES(),
      "_rels/.rels": ROOT_RELS,
      "word/document.xml": doc(`<w:tbl><w:tblPr/><w:tblGrid><w:gridCol/><w:gridCol/></w:tblGrid>${row("Hole", "Grade")}${row("LC-26-014", "433 g/t")}</w:tbl>`),
    });
  },

  /** Text inside a DrawingML text box and a VML text box. */
  async textboxes() {
    return pack({
      "[Content_Types].xml": CONTENT_TYPES(),
      "_rels/.rels": ROOT_RELS,
      "word/document.xml": doc(
        p("Body.") +
        `<w:p><w:r><w:drawing><w:txbxContent>${p("DRAWINGML TEXTBOX TEXT")}</w:txbxContent></w:drawing></w:r></w:p>` +
        `<w:p><w:r><w:pict><v:textbox><w:txbxContent>${p("VML TEXTBOX TEXT")}</w:txbxContent></v:textbox></w:pict></w:r></w:p>`),
    });
  },

  /** Hyperlink display text is content; the target is a relationship. */
  async hyperlinks() {
    return pack({
      "[Content_Types].xml": CONTENT_TYPES(),
      "_rels/.rels": ROOT_RELS,
      "word/_rels/document.xml.rels": docRels(
        '<Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com" TargetMode="External"/>'),
      "word/document.xml": doc(`<w:p><w:hyperlink r:id="rId9" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:r><w:t>CLICK THIS LINK TEXT</w:t></w:r></w:hyperlink></w:p>`),
    });
  },

  /** Tracked changes: an insertion is visible, a deletion is not. */
  async trackedChanges() {
    return pack({
      "[Content_Types].xml": CONTENT_TYPES(),
      "_rels/.rels": ROOT_RELS,
      "word/document.xml": doc(
        `<w:p><w:ins w:id="1" w:author="A"><w:r><w:t>INSERTED VISIBLE TEXT</w:t></w:r></w:ins>` +
        `<w:del w:id="2" w:author="A"><w:r><w:delText>DELETED INVISIBLE TEXT</w:delText></w:r></w:del></w:p>`),
    });
  },

  /** mc:AlternateContent holds the same text twice. Only Choice may count. */
  async alternateContent() {
    return pack({
      "[Content_Types].xml": CONTENT_TYPES(),
      "_rels/.rels": ROOT_RELS,
      "word/document.xml": doc(
        `<w:p><w:r><mc:AlternateContent>` +
        `<mc:Choice Requires="wps">${p("SHAPE TEXT ONCE")}</mc:Choice>` +
        `<mc:Fallback>${p("SHAPE TEXT ONCE")}</mc:Fallback>` +
        `</mc:AlternateContent></w:r></w:p>`),
    });
  },

  /** An element nobody has taught the walker about, holding real text. */
  async unknownElement() {
    return pack({
      "[Content_Types].xml": CONTENT_TYPES(),
      "_rels/.rels": ROOT_RELS,
      "word/document.xml": doc(
        p("Known text.") +
        `<w:p><w:r><w:someFutureThing>TEXT INSIDE AN UNKNOWN ELEMENT</w:someFutureThing></w:r></w:p>`),
    });
  },

  /** Characters that naive pipelines mangle. */
  async unicode() {
    return pack({
      "[Content_Types].xml": CONTENT_TYPES(),
      "_rels/.rels": ROOT_RELS,
      "word/document.xml": doc(
        p("Grade 100 m of C$30 million") +          // non-breaking spaces
        p("Curly ‘quotes’ and “doubles”") +
        p("Em—dash en–dash non‑breaking hyphen") +
        p("Math ± 2° × 10⁵ ≤ αβγ") +
        p("Emoji 👍 surrogate pair")),
    });
  },

  /** The same paragraph three times: one-to-one matching must not conflate them. */
  async repeated() {
    return pack({
      "[Content_Types].xml": CONTENT_TYPES(),
      "_rels/.rels": ROOT_RELS,
      "word/document.xml": doc(p("Identical paragraph.") + p("Identical paragraph.") + p("Identical paragraph.")),
    });
  },

  /** Tabs, breaks, symbols and soft hyphens stand for characters. */
  async charElements() {
    return pack({
      "[Content_Types].xml": CONTENT_TYPES(),
      "_rels/.rels": ROOT_RELS,
      "word/document.xml": doc(
        `<w:p><w:r><w:t>Before</w:t><w:tab/><w:t>After</w:t><w:br/><w:t>NextLine</w:t></w:r></w:p>` +
        `<w:p><w:r><w:sym w:font="Symbol" w:char="00B5"/></w:r></w:p>`),
    });
  },

  /** A relationship pointing at a part that is not in the package. */
  async missingPart() {
    return pack({
      "[Content_Types].xml": CONTENT_TYPES(
        '<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>'),
      "_rels/.rels": ROOT_RELS,
      "word/_rels/document.xml.rels": docRels(
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>'),
      "word/document.xml": doc(p("Body only.")),
    });
  },

  /** Malformed XML inside an otherwise valid package. */
  async malformedPart() {
    return pack({
      "[Content_Types].xml": CONTENT_TYPES(),
      "_rels/.rels": ROOT_RELS,
      "word/document.xml": `<?xml version="1.0"?><w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>unclosed`,
    });
  },

  /** Not a zip at all. */
  async notAZip() { return Buffer.from("This is plainly not a DOCX package."); },

  /** A zip with no [Content_Types].xml. */
  async noContentTypes() {
    return pack({ "_rels/.rels": ROOT_RELS, "word/document.xml": doc(p("orphan")) });
  },

  // ---------------------------------------------------------------- 3C corpus

  /** Nested table inside a merged cell. */
  async nestedTables() {
    const inner = `<w:tbl><w:tblPr/><w:tr><w:tc><w:tcPr/>${p("INNER CELL ONE")}</w:tc><w:tc><w:tcPr/>${p("INNER CELL TWO")}</w:tc></w:tr></w:tbl>`;
    return pack({
      "[Content_Types].xml": CONTENT_TYPES(),
      "_rels/.rels": ROOT_RELS,
      "word/document.xml": doc(
        `<w:tbl><w:tblPr/><w:tr>` +
        `<w:tc><w:tcPr><w:gridSpan w:val="2"/><w:vMerge w:val="restart"/></w:tcPr>${p("MERGED OUTER CELL")}${inner}</w:tc>` +
        `</w:tr><w:tr><w:tc><w:tcPr><w:vMerge/></w:tcPr>${p("CONTINUATION CELL")}</w:tc></w:tr></w:tbl>`),
    });
  },

  /** Headers and footers carrying real disclosure language. */
  async disclosureHeaderFooter() {
    return pack({
      "[Content_Types].xml": CONTENT_TYPES(
        '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' +
        '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>'),
      "_rels/.rels": ROOT_RELS,
      "word/_rels/document.xml.rels": docRels(
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>'),
      "word/document.xml": doc(p("Assays returned 433 g/t AgEq over 1.40 m.")),
      "word/header1.xml": `<?xml version="1.0"?><w:hdr xmlns:w="${W}">${p("NOT FOR DISTRIBUTION TO UNITED STATES NEWSWIRE SERVICES")}</w:hdr>`,
      "word/footer1.xml": `<?xml version="1.0"?><w:ftr xmlns:w="${W}">${p("Mineral resources that are not mineral reserves do not have demonstrated economic viability.")}</w:ftr>`,
    });
  },

  /** Several footnotes and endnotes, two of them word-for-word identical. */
  async manyNotes() {
    return pack({
      "[Content_Types].xml": CONTENT_TYPES(
        '<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>' +
        '<Override PartName="/word/endnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml"/>'),
      "_rels/.rels": ROOT_RELS,
      "word/_rels/document.xml.rels": docRels(
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes" Target="endnotes.xml"/>'),
      "word/document.xml": doc(p("Body.")),
      "word/footnotes.xml": `<?xml version="1.0"?><w:footnotes xmlns:w="${W}">
<w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:t>SEP</w:t></w:r></w:p></w:footnote>
<w:footnote w:id="1"><w:p><w:r><w:t>True widths are not known.</w:t></w:r></w:p></w:footnote>
<w:footnote w:id="2"><w:p><w:r><w:t>True widths are not known.</w:t></w:r></w:p></w:footnote>
<w:footnote w:id="3"><w:p><w:r><w:t>Grades are uncut.</w:t></w:r></w:p></w:footnote>
</w:footnotes>`,
      "word/endnotes.xml": `<?xml version="1.0"?><w:endnotes xmlns:w="${W}">
<w:endnote w:type="separator" w:id="-1"><w:p><w:r><w:t>SEP</w:t></w:r></w:p></w:endnote>
<w:endnote w:id="4"><w:p><w:r><w:t>Endnote disclosure text.</w:t></w:r></w:p></w:endnote>
</w:endnotes>`,
    });
  },

  /** Hyperlinks of every shape, including display text that differs from target. */
  async hyperlinkVariants() {
    const RNS = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    return pack({
      "[Content_Types].xml": CONTENT_TYPES(),
      "_rels/.rels": ROOT_RELS,
      "word/_rels/document.xml.rels": docRels(
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://real-target.example.com/a" TargetMode="External"/>'),
      "word/document.xml": doc(
        `<w:p><w:hyperlink r:id="rId1" ${RNS}><w:r><w:t>Click here for the technical report</w:t></w:r></w:hyperlink></w:p>` +
        `<w:p><w:hyperlink w:anchor="_Toc1"><w:r><w:t>Internal bookmark link</w:t></w:r></w:hyperlink></w:p>` +
        `<w:p><w:hyperlink r:id="rId1" ${RNS}><w:r><w:t>https://displayed-url.example.com</w:t></w:r></w:hyperlink></w:p>`),
    });
  },

  /** Hidden text (w:vanish) alongside visible text. */
  async hiddenText() {
    return pack({
      "[Content_Types].xml": CONTENT_TYPES(),
      "_rels/.rels": ROOT_RELS,
      "word/document.xml": doc(
        p("Visible sentence.") +
        `<w:p><w:r><w:rPr><w:vanish/></w:rPr><w:t>HIDDEN TEXT THAT IS STILL IN THE FILE</w:t></w:r></w:p>`),
    });
  },

  /** PAGE, REF and TOC fields, plus a nested field, all with cached results. */
  async fieldVariants() {
    const fld = (instr, result) =>
      `<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r>` +
      `<w:r><w:instrText xml:space="preserve">${instr}</w:instrText></w:r>` +
      `<w:r><w:fldChar w:fldCharType="separate"/></w:r>` +
      `<w:r><w:t>${result}</w:t></w:r>` +
      `<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`;
    const nested =
      `<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> IF </w:instrText></w:r>` +
      `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAGE </w:instrText></w:r>` +
      `<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>9</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>` +
      `<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>NESTED RESULT</w:t></w:r>` +
      `<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`;
    return pack({
      "[Content_Types].xml": CONTENT_TYPES(),
      "_rels/.rels": ROOT_RELS,
      "word/document.xml": doc(
        p("Authored sentence.") + fld(" PAGE ", "3") + fld(" REF _Toc1 ", "See section two") +
        fld(" TOC \\o 1-3 ", "Table of contents entry") + nested),
    });
  },

  /** A comments part with comment ranges in the body. */
  async comments() {
    return pack({
      "[Content_Types].xml": CONTENT_TYPES(
        '<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>'),
      "_rels/.rels": ROOT_RELS,
      "word/_rels/document.xml.rels": docRels(
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>'),
      "word/document.xml": doc(
        `<w:p><w:commentRangeStart w:id="1"/><w:r><w:t>Reviewed sentence.</w:t></w:r><w:commentRangeEnd w:id="1"/><w:r><w:commentReference w:id="1"/></w:r></w:p>`),
      "word/comments.xml": `<?xml version="1.0"?><w:comments xmlns:w="${W}"><w:comment w:id="1" w:author="Reviewer">${p("REVIEWER COMMENT TEXT")}</w:comment></w:comments>`,
    });
  },

  /** AlternateContent whose Choice and Fallback do NOT agree. */
  async alternateDiffering() {
    return pack({
      "[Content_Types].xml": CONTENT_TYPES(),
      "_rels/.rels": ROOT_RELS,
      "word/document.xml": doc(
        `<w:p><w:r><mc:AlternateContent>` +
        `<mc:Choice Requires="wps">${p("MODERN CHOICE TEXT")}</mc:Choice>` +
        `<mc:Fallback>${p("LEGACY FALLBACK TEXT DIFFERS")}</mc:Fallback>` +
        `</mc:AlternateContent></w:r></w:p>`),
    });
  },

  /** A chart relationship: text-bearing and NOT read by this verifier. */
  async chartPart() {
    return pack({
      "[Content_Types].xml": CONTENT_TYPES(),
      "_rels/.rels": ROOT_RELS,
      "word/_rels/document.xml.rels": docRels(
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="charts/chart1.xml"/>'),
      "word/document.xml": doc(p("Body with a chart.")),
      "word/charts/chart1.xml": `<?xml version="1.0"?><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:title>GRADE BY HOLE</c:title></c:chart>`,
    });
  },

  /** SmartArt (diagram) data: text-bearing and NOT read. */
  async smartArt() {
    return pack({
      "[Content_Types].xml": CONTENT_TYPES(),
      "_rels/.rels": ROOT_RELS,
      "word/_rels/document.xml.rels": docRels(
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramData" Target="diagrams/data1.xml"/>'),
      "word/document.xml": doc(p("Body with SmartArt.")),
      "word/diagrams/data1.xml": `<?xml version="1.0"?><dgm:dataModel xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram"><dgm:pt><dgm:t>SMARTART NODE TEXT</dgm:t></dgm:pt></dgm:dataModel>`,
    });
  },

  /** An embedded OLE object. */
  async embeddedObject() {
    return pack({
      "[Content_Types].xml": CONTENT_TYPES(),
      "_rels/.rels": ROOT_RELS,
      "word/_rels/document.xml.rels": docRels(
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject" Target="embeddings/obj1.bin"/>'),
      "word/document.xml": doc(p("Body with an embedded object.")),
      "word/embeddings/obj1.bin": "BINARY-ISH CONTENT",
    });
  },

  /** A relationship type nobody has ever classified. */
  async unknownRelationship() {
    return pack({
      "[Content_Types].xml": CONTENT_TYPES(),
      "_rels/.rels": ROOT_RELS,
      "word/_rels/document.xml.rels": docRels(
        '<Relationship Id="rId1" Type="http://example.com/relationships/somethingNew" Target="mystery.xml"/>'),
      "word/document.xml": doc(p("Body.")),
      "word/mystery.xml": "<x>MYSTERY TEXT</x>",
    });
  },

  /** Identical paragraphs in different structural locations. */
  async repeatedAcrossLocations() {
    return pack({
      "[Content_Types].xml": CONTENT_TYPES(
        '<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>'),
      "_rels/.rels": ROOT_RELS,
      "word/_rels/document.xml.rels": docRels(
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>'),
      "word/document.xml": doc(
        p("True widths are not known.") +
        `<w:tbl><w:tblPr/><w:tr><w:tc><w:tcPr/>${p("True widths are not known.")}</w:tc></w:tr></w:tbl>` +
        p("True widths are not known.")),
      "word/footnotes.xml": `<?xml version="1.0"?><w:footnotes xmlns:w="${W}"><w:footnote w:id="1">${p("True widths are not known.")}</w:footnote></w:footnotes>`,
    });
  },

  /** Empty paragraphs and runs with no text. */
  async emptyBoundaries() {
    return pack({
      "[Content_Types].xml": CONTENT_TYPES(),
      "_rels/.rels": ROOT_RELS,
      "word/document.xml": doc(
        p("First.") + "<w:p/>" + "<w:p><w:pPr/></w:p>" + `<w:p><w:r><w:rPr/></w:r></w:p>` +
        `<w:p><w:r><w:t xml:space="preserve"></w:t></w:r></w:p>` + p("Last.")),
    });
  },

  /** One sentence split across a great many runs. */
  async manyRuns() {
    const word = (w) => `<w:r><w:t xml:space="preserve">${w}</w:t></w:r>`;
    const chars = "Assays returned 433 g/t AgEq over 1.40 m.".split("").map(word).join("");
    return pack({
      "[Content_Types].xml": CONTENT_TYPES(),
      "_rels/.rels": ROOT_RELS,
      "word/document.xml": doc(`<w:p>${chars}</w:p>`),
    });
  },

  /** A very long single paragraph. */
  async longParagraph() {
    const body = Array.from({ length: 4000 }, (_, i) => `token${i}`).join(" ");
    return pack({
      "[Content_Types].xml": CONTENT_TYPES(),
      "_rels/.rels": ROOT_RELS,
      "word/document.xml": doc(p(body)),
    });
  },

  /** Page breaks and manual line breaks. */
  async breaks() {
    return pack({
      "[Content_Types].xml": CONTENT_TYPES(),
      "_rels/.rels": ROOT_RELS,
      "word/document.xml": doc(
        `<w:p><w:r><w:t>Before break</w:t><w:br w:type="page"/><w:t>After page break</w:t></w:r></w:p>` +
        `<w:p><w:r><w:t>Line one</w:t><w:br/><w:t>Line two</w:t></w:r></w:p>`),
    });
  },

  /** NFC vs NFD, combining marks, RTL. */
  async normalisationForms() {
    return pack({
      "[Content_Types].xml": CONTENT_TYPES(),
      "_rels/.rels": ROOT_RELS,
      "word/document.xml": doc(
        p("Cafe\u0301 combining acute") +          // NFD
        p("Caf\u00e9 precomposed") +               // NFC
        p("\u05d4\u05d1\u05d3\u05d9\u05e7\u05d4 RTL Hebrew") +
        p("\u0627\u0644\u0639\u0631\u0628\u064a\u0629 RTL Arabic") +
        p("Subscript H\u2082O and superscript m\u00b3")),
    });
  },

  /** A content type that lies about what the part is. */
  async misleadingContentType() {
    return pack({
      "[Content_Types].xml": `<?xml version="1.0"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="image/png"/>
</Types>`,
      "_rels/.rels": ROOT_RELS,
      "word/document.xml": doc(p("Text hidden behind a false content type.")),
    });
  },

  /** No relationships part at all. */
  async missingRels() {
    return pack({
      "[Content_Types].xml": CONTENT_TYPES(),
      "word/document.xml": doc(p("orphan")),
    });
  },

  /** Deeply nested XML. */
  async deepNesting(depth = 400) {
    let inner = `<w:r><w:t>DEEP TEXT</w:t></w:r>`;
    for (let i = 0; i < depth; i++) inner = `<w:sdt><w:sdtContent>${inner}</w:sdtContent></w:sdt>`;
    return pack({
      "[Content_Types].xml": CONTENT_TYPES(),
      "_rels/.rels": ROOT_RELS,
      "word/document.xml": doc(`<w:p>${inner}</w:p>`),
    });
  },

  /** An encrypted OOXML file: a CFB container, not a zip. */
  async encrypted() {
    const cfb = Buffer.alloc(512);
    Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(cfb, 0);
    return cfb;
  },

  /** Non-conventional prefixes: "w" is bound to something else entirely. */
  async oddPrefixes() {
    return pack({
      "[Content_Types].xml": CONTENT_TYPES(),
      "_rels/.rels": ROOT_RELS,
      "word/document.xml": `<?xml version="1.0"?>
<q:document xmlns:q="${W}" xmlns:w="http://example.com/not-wordprocessing">
<q:body><q:p><q:r><q:t>PREFIX INDEPENDENT TEXT</q:t></q:r></q:p></q:body></q:document>`,
    });
  },
};
