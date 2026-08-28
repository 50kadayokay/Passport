// api/news-review.js — admin-only approve/reject for the news review queue.
//
// This is the ONLY path by which a news_item becomes public: an admin explicitly
// approves it (status='live', review_state='approved'). Reject hides it
// (status='rejected'). Admin identity is verified server-side via requireAdmin;
// the write uses the service role. Nothing here runs automatically.
import { requireAdmin } from "./_entitlement.js";
import { serviceConfigured, serviceRest } from "./_service.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const admin = await requireAdmin(req, res); // sends its own error + returns null if not an admin
  if (!admin) return;
  if (!serviceConfigured()) return res.status(500).json({ error: "Supabase service env missing" });

  const body = req.body || {};
  const id = String(body.id || "");
  const action = String(body.action || "");
  if (!id || !["approve", "reject"].includes(action)) {
    return res.status(400).json({ error: "Body must be { action: 'approve' | 'reject', id }" });
  }

  // APPROVE requires full provenance coverage: every section the AI populated must
  // have at least one supporting source snippet. If not, the item stays in review and
  // approval is refused — a hard gate so nothing unsupported can be published.
  if (action === "approve") {
    const cr = await serviceRest(`news_items?id=eq.${encodeURIComponent(id)}&select=mineex_summary,plain_english_explanation,context,key_numbers,provenance`);
    if (!cr.ok) return res.status(500).json({ error: `check HTTP ${cr.status}` });
    const it = (await cr.json().catch(() => []))[0];
    if (!it) return res.status(409).json({ error: "Item not found." });
    const prov = Array.isArray(it.provenance) ? it.provenance : [];
    const covered = new Set(prov.map((p) => p && p.field).filter(Boolean));
    const populated = {
      mineex_summary: !!(it.mineex_summary && String(it.mineex_summary).trim()),
      plain_english_explanation: !!(it.plain_english_explanation && String(it.plain_english_explanation).trim()),
      context: !!(it.context && String(it.context).trim()),
      key_numbers: Array.isArray(it.key_numbers) && it.key_numbers.length > 0,
    };
    const missing = Object.keys(populated).filter((k) => populated[k] && !covered.has(k));
    if (missing.length) {
      return res.status(422).json({ error: `Cannot approve — missing provenance for: ${missing.join(", ")}. Item kept in review; reprocess it to regenerate provenance.`, missing });
    }
  }

  const patch = action === "approve"
    ? { status: "live", review_state: "approved" }
    : { status: "rejected", review_state: "rejected" };

  // Approve only acts on items still in review; reject can also UNPUBLISH a live item.
  const stateFilter = action === "approve" ? "&status=eq.review" : "&status=in.(review,live)";
  const r = await serviceRest(`news_items?id=eq.${encodeURIComponent(id)}${stateFilter}`, {
    method: "PATCH", body: patch, prefer: "return=representation",
  });
  if (!r.ok) return res.status(500).json({ error: `update HTTP ${r.status}` });
  const rows = await r.json().catch(() => []);
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(409).json({ error: action === "approve" ? "Item not found or not in 'review' state." : "Item not found or not in a rejectable state." });
  }
  return res.status(200).json({ ok: true, id, action, status: patch.status });
}
