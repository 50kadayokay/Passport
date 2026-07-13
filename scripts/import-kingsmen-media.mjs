// import-kingsmen-media.mjs — one-time media import for the Kingsmen flagship.
//
// Extracts the real photos embedded in the prototype HTML, uploads them to
// Supabase Storage (company-media bucket), and wires them into the Kingsmen
// profile (logo, hero, status photo, project galleries + slogan).
//
// RUN (paste your key into the TERMINAL command only — never into chat, and it
// is never printed or saved):
//   cd "/Users/leifer/Claude Projects/Passport V1"
//   SUPABASE_SERVICE_KEY='your-service_role-key' node scripts/import-kingsmen-media.mjs
//
// Get the key: Supabase → Project Settings → API → "service_role" (secret).
// It is powerful — do not share it or commit it. This script only reads it from
// the environment for these uploads.

import { readFileSync } from "node:fs";

const SUPABASE_URL = "https://rvptronniomlqumjhyrr.supabase.co";
const KEY = process.env.SUPABASE_SERVICE_KEY;
const SLUG = "kingsmen-resources";
const OWNER_ID = "02a379c5-1c12-4353-b234-151901ee14b8"; // admin — makes Kingsmen editable in onboarding
const BUCKET = "company-media";
const PROTO = process.env.PROTO_HTML || "/Users/leifer/Downloads/Passport_ai_brief (1).html";
const SLOGAN = "Chihuahua's preeminent explorationist";

if (!KEY) {
  console.error("\n✗ Set SUPABASE_SERVICE_KEY first. Example:\n  SUPABASE_SERVICE_KEY='...' node scripts/import-kingsmen-media.mjs\n");
  process.exit(1);
}

const auth = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const slug = (s, i) => (s || `photo-${i}`).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || `photo-${i}`;

console.log("Reading prototype:", PROTO);
const html = readFileSync(PROTO, "utf8");

// Pull every src/photo data-URI + the nearest preceding label. Skip tiny (<3KB) placeholders.
const rx = /(src|photo):"data:image\/(\w+);base64,([A-Za-z0-9+/=]+)"/g;
const items = [];
let m, i = 0;
while ((m = rx.exec(html))) {
  const [, key, ext, b64] = m;
  const bytes = Buffer.from(b64, "base64");
  if (bytes.length < 3000) continue; // placeholders / icons
  const pre = html.slice(Math.max(0, m.index - 160), m.index);
  const labs = pre.match(/label:"([^"]{1,40})"/g);
  const label = labs ? labs[labs.length - 1].slice(7, -1) : "";
  items.push({ key, ext: ext === "jpeg" ? "jpg" : ext, mime: `image/${ext}`, bytes, label, i: i++ });
}
console.log(`Found ${items.length} real photos (galleries: ${items.filter(x => x.key === "src").length}, portraits/status: ${items.filter(x => x.key === "photo").length}).`);

async function upload(name, it) {
  const path = `kingsmen/${name}.${it.ext}`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: { ...auth, "Content-Type": it.mime, "x-upsert": "true" },
    body: it.bytes,
  });
  if (!res.ok) throw new Error(`upload ${path} → ${res.status} ${await res.text()}`);
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

const url = {};
console.log("\nUploading to Storage…");
for (const it of items) {
  const name = `${it.key === "photo" ? "portrait" : "site"}-${it.i}-${slug(it.label, it.i)}`;
  url[it.i] = await upload(name, it);
  process.stdout.write(".");
}
console.log(`\n✓ Uploaded ${items.length} images.`);

// Assign roles.
const gallery = items.filter((x) => x.key === "src");
const portraits = items.filter((x) => x.key === "photo");
const statusItem = gallery.find((x) => /drill site|drill program/i.test(x.label)) || gallery[0];
const heroItem = gallery.find((x) => /district|workings|landscape|field/i.test(x.label)) || gallery[1] || gallery[0];
const half = Math.ceil(gallery.length / 2);
const lasColoradas = gallery.slice(0, half).map((x) => url[x.i]);
const almoloya = gallery.slice(half).map((x) => url[x.i]);

console.log("\nFetching current profile…");
const cur = await (await fetch(`${SUPABASE_URL}/rest/v1/companies?slug=eq.${SLUG}&select=profile`, { headers: auth })).json();
const profile = cur[0].profile;

// The app header reads company.brand — set it there (and mirror to profile.brand).
const brand = { avatar: url[heroItem.i], hero: url[heroItem.i], logo: url[heroItem.i] };
profile.company = { ...(profile.company || {}), brand, slogan: SLOGAN };
profile.brand = { ...(profile.brand || {}), ...brand };
profile.companyStatus = { ...(profile.companyStatus || {}), photo: url[statusItem.i] };
profile.projects = (profile.projects || []).map((p, idx) => ({
  ...p,
  gallery: idx === 0 ? lasColoradas : idx === 1 ? almoloya : (p.gallery || []),
}));

console.log("Patching profile…");
const patch = await fetch(`${SUPABASE_URL}/rest/v1/companies?slug=eq.${SLUG}`, {
  method: "PATCH",
  headers: { ...auth, "Content-Type": "application/json", Prefer: "return=minimal" },
  body: JSON.stringify({ profile, owner_id: OWNER_ID }),
});
if (!patch.ok) throw new Error(`profile patch → ${patch.status} ${await patch.text()}`);

console.log(`\n✓ Done. Las Coloradas: ${lasColoradas.length} photos · Almoloya: ${almoloya.length} · status + logo set.`);
console.log("Refresh Kingsmen in the app to see the photos.");
