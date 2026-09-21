// SHA-256 of a string, as lowercase hex over UTF-8 bytes.
//
// Deliberately dependency-free: no Supabase import, no Vite `import.meta.env`, so
// it runs unchanged in the browser, in a Node test and in a server route. The
// transcript hash is the one value that must be reproducible everywhere — a hash
// you can only compute inside the app is not much of a check.
//
// The DATABASE computes the authoritative value in a GENERATED column
// (public.sha256_hex), using the same definition: SHA-256 over the UTF-8 encoding
// of the text, hex-encoded. If this and that ever disagree for the same string,
// something altered the text in transit, which is exactly what we want to catch.

export async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(String(text ?? ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
