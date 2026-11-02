// Saved carousel configurations: the contract.
//
// The one thing a configuration must never do is carry release content from
// one release to the next. Every assertion below either proves that, or proves
// that an operation a company performs (save, load, rename, duplicate, delete,
// update, set default) does exactly what its name says and nothing more.

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

const C = await import("../src/lib/socialConfigs.js");

let pass = 0; const fails = [];
const ok = (name, cond) => { if (cond) pass++; else fails.push(name); };
const eq = (name, a, b) => ok(`${name} (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b));

const A = "company-a", B = "company-b";
const deck = (over = {}) => ({
  slides: [
    { id: "announce", kind: "announce", layout: "", fields: { headline: "Hole KM-24-011 returns 31.4 m", eyebrow: "DRILLING", project: "Thunder Creek", date: "20 Oct 2026" } },
    { id: "results", kind: "keyResults", layout: "dominant", fields: { title: "Key results", rows: [{ v: "31.4", u: "m", desc: "mineralised width" }] } },
    { id: "context", kind: "context", layout: "", fields: { body: "The hole steps out 120 m.", imageUrl: "https://example.test/core.jpg", imageId: "img_1" } },
    { id: "why", kind: "why", layout: "", fields: { body: "Grade continuity." } },
    { id: "closing", kind: "closing", layout: "", fields: { cta: "Read the release", url: "https://example.test/r" } },
  ],
  order: ["announce", "results", "context", "why", "closing"],
  caption: "Kingsmen Resources reports 31.4 m of mineralisation.",
  ...over,
});

console.log("\n=== A. a configuration carries design, never content ===");
const cap = C.captureConfig({ name: "Drilling updates", family: "premium:obsidian", accent: "#B4472A", ground: "bone", slides: deck().slides, order: deck().order });
const blob = JSON.stringify(cap);
eq("A1 only design keys are stored", Object.keys(cap).sort(),
  ["accent", "createdAt", "family", "ground", "id", "imageTreatment", "isDefault", "layouts", "name", "order", "updatedAt"]);
ok("A2 no headline survives capture", !/31\.4|KM-24-011|Thunder Creek/.test(blob));
ok("A3 no unit, figure or qualifier survives capture", !/mineralised|\bm\b.*width|Grade continuity/.test(blob));
ok("A4 no image id or url survives capture", !/example\.test|img_1/.test(blob));
ok("A5 no caption survives capture", !/Kingsmen Resources reports/.test(blob));
eq("A5b the ground is kept", cap.ground, "bone");
eq("A6 layouts are kept by slide id", cap.layouts, { announce: "", results: "dominant", context: "", why: "", closing: "" });

console.log("\n=== B. save, list, rename, duplicate, delete ===");
const saved = C.saveConfig(A, cap);
eq("B1 saved and listed once", C.listConfigs(A).length, 1);
eq("B2 name round-trips", C.listConfigs(A)[0].name, "Drilling updates");
C.renameConfig(A, saved.id, "Drilling updates — wide");
eq("B3 rename changes the name only", [C.listConfigs(A)[0].name, C.listConfigs(A)[0].family],
  ["Drilling updates — wide", "premium:obsidian"]);
const dup = C.duplicateConfig(A, saved.id);
eq("B4 duplicate adds a second entry", C.listConfigs(A).length, 2);
ok("B5 duplicate takes a new id", dup.id !== saved.id);
eq("B6 duplicate is named a copy", dup.name, "Drilling updates — wide copy");
ok("B7 duplicate copies the design", dup.family === saved.family && dup.layouts.results === "dominant");
C.removeConfig(A, dup.id);
eq("B8 delete removes exactly one", C.listConfigs(A).map((c) => c.id), [saved.id]);
ok("B9 a name longer than the cap is truncated, not rejected",
  C.sanitise({ name: "x".repeat(200) }).name.length === 80);

console.log("\n=== C. update overwrites in place ===");
const updated = C.saveConfig(A, { ...C.captureConfig({ name: "Drilling updates — wide", family: "premium:meridian", accent: "#1B4D3E", slides: deck().slides, order: ["results", "announce", "context", "why", "closing"] }), id: saved.id, createdAt: saved.createdAt });
eq("C1 still one configuration", C.listConfigs(A).length, 1);
eq("C2 id is preserved", updated.id, saved.id);
eq("C3 family was replaced", C.listConfigs(A)[0].family, "premium:meridian");
eq("C4 order was replaced", C.listConfigs(A)[0].order, ["results", "announce", "context", "why", "closing"]);
eq("C5 createdAt survives, updatedAt moves", [updated.createdAt === saved.createdAt, updated.updatedAt >= saved.updatedAt], [true, true]);

console.log("\n=== D. defaults ===");
const second = C.saveConfig(A, C.captureConfig({ name: "Financings", family: "premium:core", accent: "#222222", slides: deck().slides, order: deck().order }));
C.setDefaultConfig(A, second.id);
eq("D1 exactly one default", C.listConfigs(A).filter((c) => c.isDefault).length, 1);
eq("D2 the right one is default", C.defaultConfig(A).id, second.id);
C.setDefaultConfig(A, saved.id);
eq("D3 setting another moves the default", [C.defaultConfig(A).id, C.listConfigs(A).filter((c) => c.isDefault).length], [saved.id, 1]);
C.removeConfig(A, saved.id);
ok("D4 deleting the default leaves no default", C.defaultConfig(A) === null);
C.setDefaultConfig(A, second.id);

console.log("\n=== E. company isolation ===");
eq("E1 company B sees nothing of company A", C.listConfigs(B).length, 0);
ok("E2 company B has no default", C.defaultConfig(B) === null);
C.saveConfig(B, C.captureConfig({ name: "B house style", family: "premium:paper", accent: "#000000", slides: deck().slides, order: deck().order }));
eq("E3 B's save does not reach A", C.listConfigs(A).map((c) => c.name), ["Financings"]);
eq("E4 A's configuration is untouched by B", C.listConfigs(B).map((c) => c.name), ["B house style"]);
ok("E5 the keys are company-scoped", [...store.keys()].every((k) => /^mineex\.social\.configs\.(company-a|company-b)$/.test(k)));
ok("E6 nothing stored anywhere mentions release content",
  [...store.values()].every((v) => !/31\.4|KM-24-011|Thunder Creek|example\.test/.test(v)));

console.log("\n=== F. applying a configuration dresses NEW facts ===");
// A different release entirely: a financing, with its own words and figures.
const financing = {
  slides: [
    { id: "announce", kind: "announce", layout: "", fields: { headline: "Upsized bought deal closes fully subscribed", eyebrow: "FINANCING", project: "Corporate", date: "18 Oct 2026" } },
    { id: "results", kind: "keyResults", layout: "", fields: { title: "Key terms", rows: [{ v: "C$18.2M", u: "", desc: "gross proceeds" }, { v: "Fully subscribed", u: "", desc: "book" }] } },
    { id: "context", kind: "context", layout: "", fields: { body: "Proceeds fund the 2027 programme.", imageUrl: "", imageId: "" } },
    { id: "why", kind: "why", layout: "", fields: { body: "Fully funded to decision." } },
    { id: "closing", kind: "closing", layout: "", fields: { cta: "Read the release", url: "https://example.test/f" } },
  ],
  order: ["announce", "results", "context", "why", "closing"],
};
const look = C.saveConfig(A, C.captureConfig({ name: "House", family: "premium:obsidian", accent: "#B4472A", slides: deck().slides, order: ["results", "announce", "context", "why", "closing"] }));
const dressed = C.applyConfig(financing, look);
eq("F1 the financing headline is untouched", dressed.slides[0].fields.headline, "Upsized bought deal closes fully subscribed");
eq("F2 the financing figures are untouched", dressed.slides[1].fields.rows.map((r) => r.v), ["C$18.2M", "Fully subscribed"]);
eq("F3 the saved layout is applied", dressed.slides[1].layout, "dominant");
eq("F4 the saved order is applied", dressed.order, ["results", "announce", "context", "why", "closing"]);
eq("F5 the draft records which configuration it wears", dressed.configId, look.id);
eq("F6 no slide was added or dropped", dressed.slides.length, 5);
eq("F7 slide identities are preserved", dressed.slides.map((s) => s.id), financing.slides.map((s) => s.id));

console.log("\n=== G. an older or partial configuration degrades safely ===");
const stale = C.sanitise({ name: "Old", family: "premium:grid", layouts: { gone: "x", announce: "" }, order: ["gone", "closing", "announce"] });
const degraded = C.applyConfig(financing, stale);
eq("G1 unknown ids are dropped from the order", degraded.order.filter((id) => id === "gone").length, 0);
eq("G2 every real slide still appears exactly once", degraded.order.slice().sort(), ["announce", "closing", "context", "results", "why"]);
eq("G3 the saved part of the order is honoured", degraded.order.slice(0, 2), ["closing", "announce"]);
eq("G4 orderedSlides follows the order", C.orderedSlides(degraded).map((s) => s.id), degraded.order);
eq("G5 a draft with no order falls back to deck order",
  C.orderedSlides({ slides: financing.slides }).map((s) => s.id), ["announce", "results", "context", "why", "closing"]);

console.log("\n=== H. unsaved-design detection ===");
const live = { family: look.family, accent: look.accent, slides: dressed.slides, order: dressed.order };
eq("H1 a freshly loaded configuration is clean", C.designSignature(live), C.configSignature(look));
ok("H2 changing the family is dirty", C.designSignature({ ...live, family: "premium:paper" }) !== C.configSignature(look));
ok("H3 changing the accent is dirty", C.designSignature({ ...live, accent: "#000000" }) !== C.configSignature(look));
ok("H3b changing the ground is dirty", C.designSignature({ ...live, ground: "ink" }) !== C.configSignature(look));
ok("H4 changing a layout is dirty",
  C.designSignature({ ...live, slides: live.slides.map((s) => (s.id === "results" ? { ...s, layout: "asymmetric" } : s)) }) !== C.configSignature(look));
ok("H5 reordering is dirty", C.designSignature({ ...live, order: ["announce", "results", "context", "why", "closing"] }) !== C.configSignature(look));
ok("H6 editing a HEADLINE is NOT a design change",
  C.designSignature({ ...live, slides: live.slides.map((s) => (s.id === "announce" ? { ...s, fields: { ...s.fields, headline: "Changed" } } : s)) }) === C.configSignature(look));
ok("H7 editing a FIGURE is NOT a design change",
  C.designSignature({ ...live, slides: live.slides.map((s) => (s.id === "results" ? { ...s, fields: { rows: [{ v: "9.9" }] } } : s)) }) === C.configSignature(look));
ok("H8 a draft wearing nothing has no active configuration", C.activeConfig(A, financing) === null);
eq("H9 a draft wearing one finds it", C.activeConfig(A, dressed).id, look.id);
ok("H10 a draft wearing a DELETED configuration reports none",
  C.activeConfig(A, { ...dressed, configId: "cfg_goneaway" }) === null);

console.log("\n=== I-0. refreshing from the summary keeps the design ===");
const refreshed = {
  slides: financing.slides.map((s) => ({ ...s, layout: "", fields: { ...s.fields, headline: s.id === "announce" ? "Bought deal upsized to C$21.0M" : s.fields.headline } })),
  order: ["announce", "results", "context", "why", "closing"],
};
const kept = C.carryDesign(refreshed, dressed);
eq("I01 the refreshed words survive", kept.slides[0].fields.headline, "Bought deal upsized to C$21.0M");
eq("I02 the chosen layouts are carried over", kept.slides.map((s) => s.layout), dressed.slides.map((s) => s.layout));
eq("I03 the chosen order is carried over", kept.order, dressed.order);
eq("I04 the configuration in use is carried over", kept.configId, dressed.configId);
ok("I05 a draft wearing nothing stays wearing nothing", !C.carryDesign(refreshed, { slides: refreshed.slides, order: [] }).configId);

console.log("\n=== I. order warnings stay advisory ===");
eq("I1 closing out of place warns", C.orderWarnings({ slides: financing.slides, order: ["closing", "announce", "results", "context", "why"] }).length, 1);
eq("I2 results before the announcement warns", C.orderWarnings({ slides: financing.slides, order: ["results", "announce", "context", "why", "closing"] }).length, 1);
eq("I3 the conventional order warns about nothing", C.orderWarnings({ slides: financing.slides, order: ["announce", "results", "context", "why", "closing"] }).length, 0);

console.log("\n=== J. persistence survives a reload ===");
const beforeReload = JSON.stringify(C.listConfigs(A));
const fresh = await import(`../src/lib/socialConfigs.js?reload=${Date.now()}`);
eq("J1 a fresh module sees the same configurations", JSON.stringify(fresh.listConfigs(A)).replace(/"updatedAt":"[^"]+"/g, ""), beforeReload.replace(/"updatedAt":"[^"]+"/g, ""));
eq("J2 the default survives", fresh.defaultConfig(A) && fresh.defaultConfig(A).name, C.defaultConfig(A).name);
ok("J3 corrupt storage yields an empty list, not a crash",
  (() => { store.set("mineex.social.configs.company-c", "{not json"); try { return fresh.listConfigs("company-c").length === 0; } catch { return false; } })());

const total = pass + fails.length;
console.log(`\nsocial configurations: ${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  ✗ ${f}`)); process.exit(1); }
console.log(`✓ ALL PASS — ${total} assertions`);
