// Website — what the company's own website pulls from MineEx (a14).
//
// The Site Contract API (api/site-content, api/site-manifest) already serves a
// bespoke site its content, scoped by a hashed token. This page is the missing
// editing surface on top of it:
//   - which of the site's sections are on the site (hide / show)
//   - which canonical feeds it receives (press releases, media)
//   - "Publish to website": freeze the working copy as what a SITE token gets;
//     a DRAFT token (previews) always sees the working copy
//   - the site's tokens: kind, label, last use, expiry; revoke (one-way)
//
// It edits SELECTION, not design: section content and layout come from the
// site's own manifest and build. Owners and admins change things; everyone
// else reads. The database enforces the same (0068/0076).

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Globe, Loader2, Eye, EyeOff, KeyRound, Check, AlertTriangle } from "lucide-react";
import { loadWebsite, saveWebsite, listSiteTokens, revokeSiteToken, canManageSite, tokenState, ConflictError } from "../lib/siteAdmin.js";
import { selectCopy, visibleOnly, hasUnpublishedChanges, normaliseInclude } from "../lib/siteSelection.js";
import { listDelivered } from "../lib/destinations.js";

const CARD = "rounded-2xl border border-slate-100 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04),0_12px_26px_-20px_rgba(15,23,42,.4)]";
const LABEL = "text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400";
const when = (iso) => (iso ? new Date(iso).toLocaleString() : "never");
const FEED_LABEL = { posts: ["Press releases & media posts", "Published releases and media posts, newest first"], media: ["Media library", "Public photos and videos from your library"] };

function Toggle({ on, disabled, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={`relative h-6 w-11 flex-shrink-0 rounded-full transition ${on ? "bg-blue-600" : "bg-slate-200"} disabled:opacity-50`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

function Tokens({ companyId, manage }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    try { setRows(await listSiteTokens(companyId)); setErr(""); } catch (e) { setRows([]); setErr(String(e.message || e)); }
  }, [companyId]);
  useEffect(() => { if (manage) load(); }, [load, manage]);

  const revoke = async (t) => {
    if (!window.confirm(`Revoke "${t.label || t.kind + " token"}"? Anything using it stops receiving content immediately. This cannot be undone.`)) return;
    setBusy(t.id); setErr("");
    try { const row = await revokeSiteToken(t.id); setRows((cur) => cur.map((r) => (r.id === row.id ? row : r))); }
    catch (e) { setErr(String(e.message || e)); }
    finally { setBusy(""); }
  };

  if (!manage) return <p className="mt-3 text-[13px] text-slate-400">Website tokens are visible to owners and admins.</p>;
  if (rows === null) return <div className="mt-3 text-slate-300"><Loader2 size={16} className="animate-spin" /></div>;
  return (
    <div className="mt-3">
      {err && <p className="mb-2 text-[12.5px] font-semibold text-rose-600">{err}</p>}
      {!rows.length ? <p className="text-[13px] text-slate-400">No tokens have been issued. MineEx issues one when your website is connected.</p> : (
        <ul className={`divide-y divide-slate-100 ${CARD}`}>
          {rows.map((t) => {
            const st = tokenState(t);
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <KeyRound size={15} className="text-slate-400" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-bold text-slate-900">{t.label || "Untitled token"}</div>
                  <div className="text-[11.5px] text-slate-400">
                    {t.kind === "site" ? "Site token · published content" : "Draft token · previews"} · issued {when(t.created_at)} · last used {when(t.last_used_at)}
                    {t.expires_at ? ` · expires ${when(t.expires_at)}` : ""}
                  </div>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-bold ${st === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                  {st === "active" ? "Active" : st === "revoked" ? `Revoked ${when(t.revoked_at)}` : "Expired"}
                </span>
                {st === "active" && (
                  <button onClick={() => revoke(t)} disabled={!!busy}
                    className="rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold text-rose-600 ring-1 ring-inset ring-rose-200 hover:bg-rose-50 disabled:opacity-50">
                    {busy === t.id ? <Loader2 size={13} className="animate-spin" /> : "Revoke"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-2 text-[11.5px] text-slate-400">A token's value is shown once, when it is issued, and is never stored. To replace one, ask MineEx for a new token, then revoke the old one.</p>
    </div>
  );
}

/* a15: releases the content fan-out delivered to the website (0088). Hidden
   until that can be read; empty when the posts feed is switched off. */
function DeliveredReleases({ companyId, feedOn }) {
  const [rows, setRows] = useState(undefined);
  useEffect(() => {
    let live = true;
    listDelivered(companyId, "website").then((r) => { if (live) setRows(r); });
    return () => { live = false; };
  }, [companyId]);
  if (!rows) return null;
  return (
    <section className="mt-7 max-w-[836px]">
      <h2 className="text-[16px] font-bold tracking-tight text-slate-900">Delivered to your website</h2>
      <p className="mt-0.5 text-[13px] text-slate-500">
        Each release you publish is sent to your website automatically.{!feedOn && " The press releases feed is switched off, so your site is not receiving them."}
      </p>
      {!rows.length ? <p className="mt-3 text-[13px] text-slate-400">Nothing delivered yet.</p> : (
        <ul className={`mt-3 divide-y divide-slate-100 ${CARD}`}>
          {rows.map((r) => (
            <li key={r.publication_id} className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-slate-900">{r.title}</span>
              <span className="shrink-0 text-[11.5px] text-slate-400">{r.published_at ? new Date(r.published_at).toLocaleDateString() : ""}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function Website({ company }) {
  const companyId = company?.id || "";
  const manage = canManageSite(company?.role || "owner");
  const [row, setRow] = useState(undefined);   // undefined = loading, null = no website
  const [data, setData] = useState({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setErr("");
    try { const r = await loadWebsite(companyId); setRow(r); setData((r && r.data) || {}); }
    catch (e) { setRow(null); setErr(String(e.message || e)); }
  }, [companyId]);
  useEffect(() => { load(); }, [load]);

  const typeLabel = useMemo(() => {
    const m = {};
    ((row && row.manifest && row.manifest.sections) || []).forEach((s) => { m[s.type] = s.label; });
    return m;
  }, [row]);

  const working = selectCopy(data, { draft: true });
  const live = visibleOnly(selectCopy((row && row.data) || {}, { draft: false }));
  const dirtyLocal = row && JSON.stringify(data) !== JSON.stringify(row.data || {});
  const unpublished = row && (dirtyLocal || row.status !== "approved" || hasUnpublishedChanges(data));

  const setHidden = (id, hidden) => setData((d) => ({ ...d, sections: { ...(d.sections || {}), [id]: { ...(d.sections || {})[id], hidden } } }));
  const setFeed = (f, on) => setData((d) => ({ ...d, include: { ...normaliseInclude(d.include), [f]: on } }));

  const save = async (publish) => {
    setBusy(publish ? "publish" : "save"); setErr(""); setNote("");
    try {
      const saved = await saveWebsite(row, data, { publish });
      setRow(saved); setData(saved.data || {});
      setNote(publish ? "Published. Your website receives this on its next build or refresh." : "Saved as a draft. Previews show it; your live site does not until you publish.");
    } catch (e) {
      setErr(String(e.message || e));
      if (e instanceof ConflictError) load();
    } finally { setBusy(""); }
  };

  const sectionIds = Object.keys(working.sections);
  const pageOf = (id) => (working.pages.find((p) => Array.isArray(p.sections) && p.sections.includes(id)) || {}).title;

  return (
    <div>
      <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-slate-900">Website</h1>
      <p className="mt-1 text-[14px] text-slate-500">Choose what your website shows from MineEx, publish it, and manage the tokens it reads with.</p>

      {err && <p className="mt-4 text-[13px] font-semibold text-rose-600">{err}</p>}
      {row === undefined && <div className="mt-8 text-slate-300"><Loader2 size={18} className="animate-spin" /></div>}

      {row === null && !err && (
        <div className={`mt-5 max-w-[836px] p-6 ${CARD}`}>
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-500"><Globe size={19} /></span>
            <div>
              <div className="text-[15px] font-bold text-slate-900">No website connected</div>
              <p className="text-[13px] text-slate-500">When MineEx connects your website, its sections appear here. Ask about it under Services → Investor Websites.</p>
            </div>
          </div>
        </div>
      )}

      {row && (
        <>
          <div className={`mt-5 flex max-w-[836px] flex-wrap items-center gap-x-8 gap-y-3 p-5 ${CARD}`}>
            <div><div className={LABEL}>Site</div><div className="mt-1 text-[14px] font-bold text-slate-900">{row.template_key || "Bespoke site"}{row.template_version ? ` · build ${row.template_version}` : ""}</div></div>
            <div><div className={LABEL}>Live content</div><div className="mt-1 text-[14px] font-bold text-slate-900">
              {row.status === "approved" ? `Published ${working.publishedAt ? when(working.publishedAt) : ""}` : "Not published yet"}</div></div>
            <div><div className={LABEL}>On the live site</div><div className="mt-1 text-[14px] font-bold text-slate-900">{Object.keys(live.sections).length} section{Object.keys(live.sections).length === 1 ? "" : "s"}</div></div>
            {unpublished && <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-[12px] font-bold text-amber-700"><AlertTriangle size={13} /> Unpublished changes</span>}
          </div>

          <section className="mt-7 max-w-[836px]">
            <h2 className="text-[16px] font-bold tracking-tight text-slate-900">Sections</h2>
            <p className="mt-0.5 text-[13px] text-slate-500">Hidden sections are not sent to your website. Their content is kept; show them again at any time.</p>
            {!sectionIds.length ? (
              <p className="mt-3 text-[13px] text-slate-400">
                Your website has no content sections yet{(row.manifest && row.manifest.sections || []).length ? ` (it can show: ${(row.manifest.sections || []).map((s) => s.label).join(", ")})` : ""}.
              </p>
            ) : (
              <ul className={`mt-3 divide-y divide-slate-100 ${CARD}`}>
                {sectionIds.map((id) => {
                  const s = working.sections[id] || {};
                  const shown = s.hidden !== true;
                  return (
                    <li key={id} className="flex items-center gap-3 px-4 py-3">
                      {shown ? <Eye size={15} className="text-slate-400" /> : <EyeOff size={15} className="text-slate-300" />}
                      <div className="min-w-0 flex-1">
                        <div className={`truncate text-[13.5px] font-bold ${shown ? "text-slate-900" : "text-slate-400"}`}>{typeLabel[s.type] || s.type || id}</div>
                        <div className="text-[11.5px] text-slate-400">{id}{pageOf(id) ? ` · ${pageOf(id)}` : ""}</div>
                      </div>
                      <Toggle on={shown} disabled={!manage || !!busy} label={`Show ${typeLabel[s.type] || id} on the website`} onChange={(on) => setHidden(id, !on)} />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="mt-7 max-w-[836px]">
            <h2 className="text-[16px] font-bold tracking-tight text-slate-900">Content from MineEx</h2>
            <p className="mt-0.5 text-[13px] text-slate-500">Your company profile is always included. Choose which feeds your website also receives.</p>
            <ul className={`mt-3 divide-y divide-slate-100 ${CARD}`}>
              {["posts", "media"].map((f) => (
                <li key={f} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-bold text-slate-900">{FEED_LABEL[f][0]}</div>
                    <div className="text-[11.5px] text-slate-400">{FEED_LABEL[f][1]}</div>
                  </div>
                  <Toggle on={working.include[f]} disabled={!manage || !!busy} label={FEED_LABEL[f][0]} onChange={(on) => setFeed(f, on)} />
                </li>
              ))}
            </ul>
          </section>

          {manage ? (
            <div className="mt-5 flex max-w-[836px] flex-wrap items-center gap-3">
              <button onClick={() => save(true)} disabled={!!busy || !unpublished}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-[13.5px] font-bold text-white transition hover:bg-slate-800 disabled:opacity-40">
                {busy === "publish" ? <Loader2 size={15} className="animate-spin" /> : <Globe size={15} />} Publish to website
              </button>
              <button onClick={() => save(false)} disabled={!!busy || !dirtyLocal}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[13.5px] font-bold text-slate-700 ring-1 ring-slate-200 hover:ring-slate-300 disabled:opacity-40">
                {busy === "save" ? <Loader2 size={15} className="animate-spin" /> : null} Save draft
              </button>
              {dirtyLocal && <button onClick={() => setData(row.data || {})} disabled={!!busy} className="text-[12.5px] font-semibold text-slate-400 hover:text-slate-700">Discard changes</button>}
              {note && <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-emerald-700"><Check size={14} /> {note}</span>}
            </div>
          ) : (
            <p className="mt-5 text-[12.5px] text-slate-400">Owners and admins can change what the website shows.</p>
          )}

          <DeliveredReleases companyId={companyId} feedOn={selectCopy((row && row.data) || {}, { draft: false }).include.posts} />
        </>
      )}

      {/* Tokens can exist before the site has uploaded a manifest, so they do not wait for one. */}
      {row !== undefined && (
        <section className="mt-9 max-w-[836px]">
          <h2 className="text-[16px] font-bold tracking-tight text-slate-900">Website tokens</h2>
          <p className="mt-0.5 text-[13px] text-slate-500">Your website reads from MineEx with these. Revoke one you no longer use, or one that may have leaked.</p>
          <Tokens companyId={companyId} manage={manage} />
        </section>
      )}
    </div>
  );
}
