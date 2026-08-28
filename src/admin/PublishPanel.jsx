import React, { useState } from "react";
import { X, Loader2, Check, Newspaper, Film, ChevronLeft, AlertTriangle, Lock } from "lucide-react";
import { SUPABASE_URL } from "../lib/supabase.js";
import { authHeaders } from "../lib/auth.js";
import { publishViaApi } from "../lib/publishClient.js";

// ============================================================================
// PUBLISH — put something new on a paying company's profile and into the feed.
//
// What a tier may publish:
//   Basic → press releases only.
//   Pro   → press releases and media posts.
// Free accounts don't publish at all (they're unclaimed community listings), so
// this panel is only ever opened from a Basic or Pro row.
//
// Everything goes through the sanctioned publish spine — never a direct write to
// `posts`:
//   updates row → publications row (destination "passport") → POST /api/publish
// /api/publish authenticates, authorises (actor_can_publish → admins pass),
// checks entitlement, then runs the atomic RPC that flips the publication and
// emits the outbox event. The dispatcher projects it into `posts` and fans out
// follower notifications. That last part is why this asks for confirmation:
// publishing a press release NOTIFIES every follower and cannot be un-sent.
// ============================================================================

const TYPES = {
  press_release: {
    id: "press_release", label: "Press release", Icon: Newspaper, tiers: ["basic", "pro"],
    blurb: "An official company announcement. Appears in the Press Releases feed and notifies followers.",
  },
  media: {
    id: "media", label: "Media post", Icon: Film, tiers: ["pro"],
    blurb: "A video or interview for the Media feed. Does not notify followers.",
  },
};

// Event categories — the same taxonomy the feed labels press releases with.
const CATEGORIES = ["Drill Results", "Assays", "Resource Update", "Financing", "Exploration", "Acquisition", "Permitting", "Partnership", "Corporate"];
const MATERIALITY = ["Transformational", "High", "Moderate", "Low"];

const today = () => new Date().toISOString().slice(0, 10);

async function rest(path, body, headers) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  const rows = await res.json().catch(() => null);
  if (!res.ok) throw new Error((rows && (rows.message || rows.error)) || `${path} failed (${res.status})`);
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row || !row.id) throw new Error(`${path} returned no row — RLS may have blocked the write.`);
  return row;
}

// updates → publications → /api/publish. Returns the publish result.
async function createAndPublish(company, form) {
  const h = await authHeaders();
  const isMedia = form.type === "media";

  const update = await rest("updates", {
    company_id: company.id,
    body: form.body || form.headline,
    occurred_on: form.date || null,
    status: "approved",
    detected: isMedia ? {} : { materiality: form.materiality || null },
    meta: { source: "admin:account-management", post_type: form.type },
  }, h);

  const publication = await rest("publications", {
    company_id: company.id,
    update_id: update.id,
    destination_id: "passport",
    status: "approved",
    content: {
      post_type: form.type,
      headline: form.headline,
      body: form.body || "",
      category: isMedia ? (form.mediaKind || "Video") : (form.category || null),
      media_url: isMedia ? form.mediaUrl : "",
      thumbnail_url: form.thumbnailUrl || "",
      source_url: form.sourceUrl || "",
    },
  }, h);

  return publishViaApi(publication.id);
}

/* --------------------------------- fields -------------------------------- */

const Field = ({ label, hint, children }) => (
  <div>
    <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
    {children}
    {hint && <p className="mt-1 text-[11px] leading-snug text-slate-400">{hint}</p>}
  </div>
);
const input = "w-full rounded-lg border border-slate-200 px-3 py-2 text-[13.5px] outline-none focus:border-slate-400";

/* --------------------------------- panel --------------------------------- */

export default function PublishPanel({ company, tier, onClose, onPublished }) {
  const allowed = Object.values(TYPES).filter((t) => t.tiers.includes(tier));
  const [type, setType] = useState(allowed.length === 1 ? allowed[0].id : null);
  const [form, setForm] = useState({ date: today(), materiality: "Moderate", category: "Drill Results", mediaKind: "Video" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setErr(""); };
  const isMedia = type === "media";
  const ready = String(form.headline || "").trim() && (isMedia ? String(form.mediaUrl || "").trim() : String(form.body || "").trim());

  const go = async () => {
    setBusy(true); setErr("");
    try {
      const r = await createAndPublish(company, { ...form, type });
      setDone(r);
      if (onPublished) await onPublished();
    } catch (e) {
      setErr(e && e.message ? e.message : "Publish failed.");
      setConfirming(false);
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-5" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-[680px] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            {type && allowed.length > 1 && !done && (
              <button onClick={() => { setType(null); setConfirming(false); }} className="text-slate-300 hover:text-slate-700"><ChevronLeft size={18} /></button>
            )}
            <p className="text-[16px] font-extrabold tracking-tight text-slate-900">
              Publish · <span className="text-slate-400">{company.name || company.slug}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-600"><X size={20} /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {/* ---------- published ---------- */}
          {done ? (
            <div className="py-10 text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><Check size={28} /></div>
              <p className="mt-4 text-[17px] font-extrabold tracking-tight text-slate-900">Published</p>
              <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-slate-500">
                “{form.headline}” is live on {company.name || company.slug}.
                {isMedia ? " It appears in the Media feed." : " Followers are being notified now."}
              </p>
              <button onClick={onClose} className="mt-6 rounded-xl bg-slate-900 px-5 py-2.5 text-[13.5px] font-bold text-white">Done</button>
            </div>

          /* ---------- pick a type ---------- */
          ) : !type ? (
            <>
              <p className="text-[13.5px] text-slate-500">What are you publishing?</p>
              <div className="mt-4 grid grid-cols-2 gap-4">
                {Object.values(TYPES).map((t) => {
                  const ok = t.tiers.includes(tier);
                  return (
                    <button key={t.id} disabled={!ok} onClick={() => setType(t.id)}
                      className={`rounded-2xl border-2 p-5 text-left transition ${ok ? "border-slate-200 bg-white hover:border-slate-400 hover:shadow-md" : "cursor-not-allowed border-slate-100 bg-slate-50 opacity-60"}`}>
                      <div className={`grid h-11 w-11 place-items-center rounded-xl ${ok ? "bg-slate-100 text-slate-600" : "bg-slate-100 text-slate-300"}`}>
                        {ok ? <t.Icon size={21} /> : <Lock size={18} />}
                      </div>
                      <p className="mt-3 text-[15px] font-extrabold tracking-tight text-slate-900">{t.label}</p>
                      <p className="mt-1 text-[12px] leading-snug text-slate-400">{ok ? t.blurb : "Pro accounts only."}</p>
                    </button>
                  );
                })}
              </div>
            </>

          /* ---------- confirm ---------- */
          ) : confirming ? (
            <div className="py-6">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-amber-600"><AlertTriangle size={24} /></div>
              <p className="mt-4 text-center text-[17px] font-extrabold tracking-tight text-slate-900">Publish this now?</p>
              <p className="mx-auto mt-2 max-w-md text-center text-[13px] leading-relaxed text-slate-500">
                “{form.headline}” goes live on <b>{company.name || company.slug}</b> immediately.
                {isMedia
                  ? " It appears in the Media feed. Followers are not notified."
                  : " It appears in the Press Releases feed and every follower is notified — that cannot be un-sent."}
              </p>
              {err && <p className="mt-4 text-center text-[12.5px] font-bold text-rose-600">{err}</p>}
              <div className="mt-6 flex justify-center gap-2.5">
                <button onClick={() => setConfirming(false)} disabled={busy} className="rounded-xl border border-slate-200 px-4 py-2.5 text-[13.5px] font-bold text-slate-600">Back</button>
                <button onClick={go} disabled={busy}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-60">
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Publish
                </button>
              </div>
            </div>

          /* ---------- compose ---------- */
          ) : (
            <div className="space-y-3.5">
              <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-slate-400">
                {React.createElement(TYPES[type].Icon, { size: 14 })} {TYPES[type].label}
              </div>

              <Field label={isMedia ? "Title" : "Headline"}>
                <input className={input} value={form.headline || ""} onChange={(e) => set("headline", e.target.value)}
                  placeholder={isMedia ? "Site visit — El Quevar" : "Argenta Silver intersects 120 m of 95 g/t Ag"} />
              </Field>

              {isMedia ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Kind">
                      <select className={input} value={form.mediaKind} onChange={(e) => set("mediaKind", e.target.value)}>
                        <option>Video</option><option>Interview</option>
                      </select>
                    </Field>
                    <Field label="Date"><input type="date" className={input} value={form.date || ""} onChange={(e) => set("date", e.target.value)} /></Field>
                  </div>
                  <Field label="Video URL" hint="The file or hosted video the Media feed plays.">
                    <input className={input} value={form.mediaUrl || ""} onChange={(e) => set("mediaUrl", e.target.value)} placeholder="https://…/site-visit.mp4" />
                  </Field>
                  <Field label="Thumbnail URL (optional)">
                    <input className={input} value={form.thumbnailUrl || ""} onChange={(e) => set("thumbnailUrl", e.target.value)} placeholder="https://…/thumb.jpg" />
                  </Field>
                  <Field label="Description (optional)">
                    <textarea rows={3} className={`${input} resize-y`} value={form.body || ""} onChange={(e) => set("body", e.target.value)} />
                  </Field>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Category">
                      <select className={input} value={form.category} onChange={(e) => set("category", e.target.value)}>
                        {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </Field>
                    <Field label="Materiality">
                      <select className={input} value={form.materiality} onChange={(e) => set("materiality", e.target.value)}>
                        {MATERIALITY.map((m) => <option key={m}>{m}</option>)}
                      </select>
                    </Field>
                    <Field label="Date"><input type="date" className={input} value={form.date || ""} onChange={(e) => set("date", e.target.value)} /></Field>
                  </div>
                  <Field label="Summary" hint="Plain-language: what happened and why it matters. Shown on the feed card.">
                    <textarea rows={5} className={`${input} resize-y`} value={form.body || ""} onChange={(e) => set("body", e.target.value)} />
                  </Field>
                  <Field label="Source URL (optional)" hint="Link to the release on the wire or the company site.">
                    <input className={input} value={form.sourceUrl || ""} onChange={(e) => set("sourceUrl", e.target.value)} placeholder="https://…" />
                  </Field>
                  <Field label="Thumbnail URL (optional)">
                    <input className={input} value={form.thumbnailUrl || ""} onChange={(e) => set("thumbnailUrl", e.target.value)} placeholder="https://…/core.jpg" />
                  </Field>
                </>
              )}

              {err && <p className="text-[12.5px] font-bold text-rose-600">{err}</p>}

              <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 pt-4">
                <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-[13.5px] font-bold text-slate-600">Cancel</button>
                <button onClick={() => setConfirming(true)} disabled={!ready}
                  className="rounded-xl bg-slate-900 px-5 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-40">Review & publish</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
