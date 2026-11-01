// The client's ONLY way to publish/unpublish — the server endpoints.
//
// Publishing never happens in the browser anymore: these POST to /api/publish and
// /api/unpublish, which authenticate, authorize (publish-capable role), verify
// entitlement, and call the atomic RPC that flips the publication and emits the
// outbox event. The dispatcher then projects the post and notifications.

import { getAccessToken } from "./auth.js";
import { guardDemoWrite } from "./demoMode.js";

async function call(path, publicationId) {
  // The demo never publishes to production. Simulated publishing lives in
  // lib/demoPublish.js and writes only to this browser.
  guardDemoWrite("Publishing");
  const token = await getAccessToken();
  if (!token) throw new Error("Sign in required.");
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ publicationId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const publishViaApi = (publicationId) => call("/api/publish", publicationId);
export const unpublishViaApi = (publicationId) => call("/api/unpublish", publicationId);
// Permanent delete of a media post that is already down: its stored file(s) and
// its place in the library (api/media-delete.js).
export const deleteMediaViaApi = (publicationId) => call("/api/media-delete", publicationId);
