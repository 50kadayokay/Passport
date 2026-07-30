// Supabase Storage — upload company assets (logos, project photos, docs) and
// get back a URL to store in the profile, instead of embedding base64 in the
// jsonb. Files go under the owner's folder so Storage RLS can enforce ownership.
import { SUPABASE_URL } from "./supabase.js";
import { authHeaders, getUser } from "./auth.js";

const MAX_BYTES = 15 * 1024 * 1024; // 15MB
const safeName = (s) => String(s || "file").toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "").slice(-80) || "file";

// Upload to a public bucket under `${uid}/…`; returns the public URL.
export async function uploadToBucket(bucket, file) {
  const user = getUser();
  if (!user) throw new Error("Sign in to upload files");
  if (file.size > MAX_BYTES) throw new Error("File is too large (max 15MB)");
  const path = `${user.id}/${Date.now()}-${safeName(file.name)}`;
  const h = await authHeaders();
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${encodeURI(path)}`, {
    method: "POST",
    headers: { ...h, "Content-Type": file.type || "application/octet-stream", "x-upsert": "true" },
    body: file,
  });
  if (!res.ok) {
    const d = await res.text().catch(() => "");
    throw new Error(`Upload failed (${res.status})${d ? `: ${d}` : ""}`);
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${encodeURI(path)}`;
}

export const uploadCompanyMedia = (file) => uploadToBucket("company-media", file);
export const uploadCompanyLogo = (file) => uploadToBucket("company-logos", file);
// True for legacy inline images we should migrate off of.
export const isDataUrl = (v) => typeof v === "string" && v.startsWith("data:");

async function dataUrlToFile(dataUrl) {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const ext = (blob.type.split("/")[1] || "png").split("+")[0];
  return new File([blob], `image.${ext}`, { type: blob.type || "image/png" });
}

// Flush any base64 images inside a profile (brand avatar/hero/logo + project
// galleries) up to Storage, replacing them with URLs. Called before every save
// so the `profile` jsonb never stores base64. Returns a cleaned copy.
export async function flushProfileAssets(profile) {
  if (!profile) return profile;
  const p = JSON.parse(JSON.stringify(profile));
  const up = async (d) => uploadCompanyMedia(await dataUrlToFile(d));
  const flush = async (d) => { try { return await up(d); } catch { return ""; } };

  // Brand images (circular logo, status hero, featured status logo).
  if (p.brand) for (const k of ["avatar", "hero", "logo", "statusLogo"]) {
    if (isDataUrl(p.brand[k])) p.brand[k] = await flush(p.brand[k]);
  }
  // Status card photo + team headshots.
  if (p.companyStatus && isDataUrl(p.companyStatus.photo)) p.companyStatus.photo = await flush(p.companyStatus.photo);
  for (const m of (p.team || [])) if (isDataUrl(m && m.photo)) m.photo = await flush(m.photo);
  // CEO note headshot.
  if (p.ceoNote && isDataUrl(p.ceoNote.photo)) p.ceoNote.photo = await flush(p.ceoNote.photo);
  // Per-card header photos (cardMedia = { "<projectKey>:<cardId>": { src } }).
  if (p.cardMedia && typeof p.cardMedia === "object") for (const k of Object.keys(p.cardMedia)) {
    const m = p.cardMedia[k];
    if (m && isDataUrl(m.src)) m.src = await flush(m.src);
  }
  // Project galleries — support both string[] and {src}[] shapes.
  for (const proj of (p.projects || [])) {
    if (Array.isArray(proj.gallery)) for (let i = 0; i < proj.gallery.length; i++) {
      const g = proj.gallery[i];
      if (isDataUrl(g)) proj.gallery[i] = await flush(g);
      else if (g && isDataUrl(g.src)) g.src = await flush(g.src);
    }
  }
  // Full-release screenshots on timeline entries.
  for (const e of (p.timeline || [])) if (Array.isArray(e.fullImages)) for (let i = 0; i < e.fullImages.length; i++) {
    if (isDataUrl(e.fullImages[i])) e.fullImages[i] = await flush(e.fullImages[i]);
  }
  return p;
}
