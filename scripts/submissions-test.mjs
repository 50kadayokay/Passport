// Public-submission validation, spam gating and row building — pure unit tests.
//   node scripts/submissions-test.mjs
//
// No network, no database. Covers the logic that replaces three `with check
// (true)` anon INSERT policies, so a regression here reopens an unbounded public
// write. The throttle itself is NOT covered — it needs Postgres, and asserting it
// without one would be claiming a pass that never ran.

import { validate, looksLikeSpam, FORMS, MAX_BODY_BYTES, HONEYPOT_FIELD } from "../api/_submissions.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗ " + m); } };
const eq = (g, w, m) => ok(JSON.stringify(g) === JSON.stringify(w),
  `${m}\n      got:  ${JSON.stringify(g)}\n      want: ${JSON.stringify(w)}`);

// ---- required fields --------------------------------------------------------
ok(!validate("contact", {}).ok, "contact with nothing is rejected");
ok(!validate("contact", { name: "A" }).ok, "contact without an email is rejected");
ok(validate("contact", { name: "A", email: "a@b.co" }).ok, "minimal valid contact accepted");
ok(!validate("demo", { name: "A", email: "a@b.co" }).ok, "demo without a company is rejected");
ok(validate("demo", { name: "A", email: "a@b.co", company: "C" }).ok, "minimal valid demo accepted");
ok(!validate("listing_report", {}).ok, "listing report needs a slug");
ok(validate("listing_report", { company_slug: "acme" }).ok, "slug alone is a valid report");
ok(!validate("nope", {}).ok, "unknown form is rejected");

// ---- email shape ------------------------------------------------------------
for (const bad of ["a@b", "a b@c.co", "@b.co", "a@.co", "a@b.c", "plain"])
  ok(!validate("contact", { name: "A", email: bad }).ok, `rejected email: ${bad}`);
for (const good of ["a@b.co", "first.last+tag@sub.example.com"])
  ok(validate("contact", { name: "A", email: good }).ok, `accepted email: ${good}`);

// ---- truncation, not rejection, for prose ----------------------------------
const long = validate("contact", { name: "A", email: "a@b.co", message: "x".repeat(9000) });
ok(long.ok, "an over-long message is accepted");
eq(long.data.message.length, FORMS.contact.fields.message, "message truncated to its declared max");
const longName = validate("contact", { name: "n".repeat(500), email: "a@b.co" });
eq(longName.data.name.length, 200, "name truncated to 200");

// ---- whitespace-only is empty, not present ---------------------------------
ok(!validate("contact", { name: "   ", email: "a@b.co" }).ok, "whitespace-only name is missing");

// ---- enums ------------------------------------------------------------------
ok(validate("listing_report", { company_slug: "a", kind: "error" }).ok, "kind=error allowed");
ok(validate("listing_report", { company_slug: "a", kind: "claim" }).ok, "kind=claim allowed");
ok(!validate("listing_report", { company_slug: "a", kind: "drop-table" }).ok, "unknown kind rejected");

// ---- spam heuristics --------------------------------------------------------
eq(looksLikeSpam({ message: "https://a.co https://b.co https://c.co" }), "links", "3+ links flagged");
eq(looksLikeSpam({ message: "see https://a.co" }), null, "one link is fine");
eq(looksLikeSpam({ message: "[url=x]buy[/url]" }), "markup", "BBCode flagged");
eq(looksLikeSpam({ message: '<a href="x">y</a>' }), "markup", "anchor tag flagged");
eq(looksLikeSpam({ message: "a" + "!".repeat(30) }), "repetition", "long identical run flagged");
eq(looksLikeSpam({ message: "Hello, we are interested in the Pro plan." }), null,
   "an ordinary enquiry is not spam");
eq(looksLikeSpam({ name: "José Müller", company: "Peñasquito Minería" }), null,
   "THE FALSE POSITIVE THAT MATTERS: accented Latin names are not script-mismatch");
eq(looksLikeSpam({ message: "кредит онлайн быстро деньги займ срочно без справок" }),
   "script-mismatch", "majority-Cyrillic body flagged");
eq(looksLikeSpam({ message: "Our Ontario property, 加拿大, is drill-ready." }), null,
   "a few CJK characters in a Latin sentence are not flagged");
eq(looksLikeSpam({}), null, "empty prose is not spam");

// ---- the honeypot and size ceiling are declared, not guessed ---------------
eq(HONEYPOT_FIELD, "website_url", "honeypot field name is stable (the client must match it)");
ok(MAX_BODY_BYTES > 4096 && MAX_BODY_BYTES <= 65536, "body ceiling is sane");

// ---- passthrough covers every declared field -------------------------------
// A field validated but not passed through is silently discarded on insert,
// which is how form data goes missing without anyone noticing.
for (const [name, form] of Object.entries(FORMS)) {
  const declared = Object.keys(form.fields);
  const carried = new Set([...(form.passthrough || []),
                           "plan", "ticker", "message"]); // folded into notes instead
  const dropped = declared.filter((f) => !carried.has(f));
  eq(dropped, [], `${name}: every validated field is either passed through or folded into notes`);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
