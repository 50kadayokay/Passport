// Saved configurations — a company's reusable LOOK, with explicit verbs.
//
// Four actions, each named for exactly what it does:
//   Save as new configuration   — a new entry, nothing overwritten
//   Update "<name>"             — overwrites the loaded one, after confirming
//   Load                        — dresses THIS release in a saved look
//   Set as default              — applied automatically to new carousels
//
// A configuration carries no release content (socialConfigs.sanitise holds
// that line), so none of these can move last month's figures into this
// month's headline.

import React, { useEffect, useState } from "react";
import { Bookmark, Check, Copy, Pencil, Star, Trash2, Plus, FolderOpen } from "lucide-react";
import PortalDialog, { DBTN, DBTN_GHOST, DBTN_DANGER, DINPUT } from "./PortalDialog.jsx";
import {
  listConfigs, saveConfig, renameConfig, duplicateConfig, removeConfig,
  setDefaultConfig, captureConfig, applyConfig, activeConfig,
  designSignature, configSignature,
} from "../../../lib/socialConfigs.js";

const LBL = "text-[10.5px] font-bold uppercase tracking-[0.16em] text-slate-400";
const ROW_BTN = "inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-500 transition hover:border-slate-300 hover:text-slate-700";

export default function ConfigPanel({ companyId, carousel, family, accent, ground = "", onChange, onFamily, onAccent, onGround, onLoaded }) {
  const [configs, setConfigs] = useState([]);
  const [dlg, setDlg] = useState(null);          // {kind, cfg?}
  const [name, setName] = useState("");
  const refresh = () => setConfigs(listConfigs(companyId));
  useEffect(() => { refresh(); }, [companyId]);  // eslint-disable-line react-hooks/exhaustive-deps

  const slides = carousel.slides || [];
  const live = designSignature({ family, accent, ground, slides, order: carousel.order || [] });
  const loaded = activeConfig(companyId, carousel);
  // UNSAVED *DESIGN* CHANGES. Deliberately not the draft's own dirty state:
  // the release's words autosave as they always did, and this says only that
  // the look no longer matches the saved configuration it came from.
  const dirty = !!loaded && configSignature(loaded) !== live;

  const close = () => { setDlg(null); setName(""); };
  // Renaming and deleting are reached FROM the list, so they return to it
  // rather than dropping the company back out to the editor.
  const backToList = () => { setName(""); setDlg({ kind: "manage" }); };
  const capture = (overrides = {}) => captureConfig({
    name: overrides.name, family, accent, ground, slides, order: carousel.order || [],
  });

  const doSaveNew = () => {
    const saved = saveConfig(companyId, capture({ name: name.trim() }));
    onChange({ ...carousel, configId: saved.id, edited: true });
    refresh(); close();
  };
  const doUpdate = () => {
    saveConfig(companyId, { ...capture({ name: loaded.name }), id: loaded.id, isDefault: loaded.isDefault, createdAt: loaded.createdAt });
    refresh(); close();
  };
  const doLoad = (cfg) => {
    if (cfg.family) onFamily(cfg.family);
    if (cfg.accent) onAccent(cfg.accent);
    if (onGround) onGround(cfg.ground || "");   // "" is a real choice: the family's own
    onChange(applyConfig(carousel, cfg));
    if (onLoaded) onLoaded();
    refresh(); close();
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={LBL}>Configuration</span>
        {loaded ? (
          dirty ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-amber-700">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Unsaved design changes
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-emerald-600">
              <Check size={11} strokeWidth={3} /> Saved
            </span>
          )
        ) : null}
      </div>

      <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] font-bold text-slate-700">
        <Bookmark size={13} className="shrink-0 text-slate-400" strokeWidth={2.4} />
        {loaded ? loaded.name : <span className="font-semibold text-slate-400">No saved configuration in use</span>}
        {loaded && loaded.isDefault && (
          <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.12em] text-blue-600">default</span>
        )}
      </p>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {loaded && (
          <button onClick={() => setDlg({ kind: "update" })} disabled={!dirty}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-bold transition ${
              dirty ? "bg-slate-900 text-white hover:bg-slate-800" : "bg-white text-slate-400 ring-1 ring-slate-200"}`}>
            <Check size={12} strokeWidth={2.8} /> Update “{loaded.name.length > 22 ? `${loaded.name.slice(0, 22)}…` : loaded.name}”
          </button>
        )}
        <button onClick={() => { setName(""); setDlg({ kind: "new" }); }}
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-bold transition ${
            loaded ? "border border-slate-200 bg-white text-slate-600 hover:border-slate-300" : "bg-slate-900 text-white hover:bg-slate-800"}`}>
          <Plus size={12} strokeWidth={2.8} /> Save as new configuration
        </button>
        <button onClick={() => setDlg({ kind: "manage" })}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11.5px] font-bold text-slate-600 transition hover:border-slate-300">
          <FolderOpen size={12} strokeWidth={2.6} /> {configs.length ? `Load configuration (${configs.length})` : "Load configuration"}
        </button>
      </div>

      <p className="mt-2.5 text-[11px] leading-relaxed text-slate-400">
        Saves the design only — family, layouts, slide order, accent and background. Never headlines, figures, units, dates or images.
      </p>

      {/* ---- save as new ---- */}
      <PortalDialog open={dlg && dlg.kind === "new"} onClose={close}
        title="Save as new configuration"
        blurb="Name this look so you can reuse it on future releases. Nothing from this release's text is saved."
        footer={<>
          <button className={DBTN_GHOST} onClick={close}>Cancel</button>
          <button className={DBTN} disabled={!name.trim()} onClick={doSaveNew}>Save configuration</button>
        </>}>
        <label className={LBL}>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className={`mt-1.5 ${DINPUT}`}
          placeholder="e.g. Drilling updates" maxLength={80}
          onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) doSaveNew(); }} />
        {configs.some((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase()) && (
          <p className="mt-2 text-[12px] font-semibold text-amber-700">
            You already have a configuration with this name. This will create a second one.
          </p>
        )}
      </PortalDialog>

      {/* ---- confirm overwrite ---- */}
      <PortalDialog open={dlg && dlg.kind === "update"} onClose={close} width={400}
        title={loaded ? `Update “${loaded.name}”?` : "Update configuration?"}
        blurb="The saved design will be replaced by the one on screen. Releases already published are not affected."
        footer={<>
          <button className={DBTN_GHOST} onClick={close}>Cancel</button>
          <button className={DBTN} onClick={doUpdate}>Update configuration</button>
        </>}>
        <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-slate-500">
          Other drafts using this configuration keep the look they were saved with until you load it again.
        </p>
      </PortalDialog>

      {/* ---- rename ---- */}
      <PortalDialog open={dlg && dlg.kind === "rename"} onClose={backToList} width={400}
        title="Rename configuration"
        footer={<>
          <button className={DBTN_GHOST} onClick={backToList}>Cancel</button>
          <button className={DBTN} disabled={!name.trim()}
            onClick={() => { renameConfig(companyId, dlg.cfg.id, name.trim()); refresh(); backToList(); }}>Rename</button>
        </>}>
        <label className={LBL}>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className={`mt-1.5 ${DINPUT}`} maxLength={80}
          onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) { renameConfig(companyId, dlg.cfg.id, name.trim()); refresh(); backToList(); } }} />
      </PortalDialog>

      {/* ---- confirm delete ---- */}
      <PortalDialog open={dlg && dlg.kind === "delete"} onClose={backToList} width={400}
        title={dlg && dlg.cfg ? `Delete “${dlg.cfg.name}”?` : "Delete configuration?"}
        blurb="This cannot be undone. Drafts already using it keep their current look."
        footer={<>
          <button className={DBTN_GHOST} onClick={backToList}>Keep it</button>
          <button className={DBTN_DANGER}
            onClick={() => { removeConfig(companyId, dlg.cfg.id); refresh(); backToList(); }}>Delete configuration</button>
        </>}>
        <p className="rounded-xl bg-rose-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-rose-600">
          Only the saved design is deleted. No release, summary or image is touched.
        </p>
      </PortalDialog>

      {/* ---- load / manage ---- */}
      <PortalDialog open={dlg && dlg.kind === "manage"} onClose={close} width={520}
        title="Saved configurations"
        blurb="Load one onto this release, or manage the list. The default is applied to new carousels automatically."
        footer={<button className={DBTN_GHOST} onClick={close}>Done</button>}>
        {configs.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-3.5 py-6 text-center text-[12.5px] leading-relaxed text-slate-400">
            Nothing saved yet. Set up a look you like, then choose <span className="font-bold text-slate-500">Save as new configuration</span>.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {configs.map((cfg) => {
              const on = loaded && loaded.id === cfg.id;
              return (
                <li key={cfg.id} className={`rounded-xl px-3 py-2.5 ring-1 transition ${on ? "bg-blue-50/60 ring-blue-200" : "bg-white ring-slate-200"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-slate-800">
                      {cfg.name}
                      {cfg.isDefault && <span className="ml-1.5 rounded bg-blue-50 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.12em] text-blue-600">default</span>}
                      {on && <span className="ml-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">in use</span>}
                    </span>
                    <button onClick={() => doLoad(cfg)}
                      className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11.5px] font-bold text-white transition hover:bg-slate-800">
                      {on ? "Reload" : "Load"}
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button className={ROW_BTN} onClick={() => { setName(cfg.name); setDlg({ kind: "rename", cfg }); }}>
                      <Pencil size={10} strokeWidth={2.6} /> Rename
                    </button>
                    <button className={ROW_BTN} onClick={() => { duplicateConfig(companyId, cfg.id); refresh(); }}>
                      <Copy size={10} strokeWidth={2.6} /> Duplicate
                    </button>
                    <button className={ROW_BTN} disabled={cfg.isDefault}
                      onClick={() => { setDefaultConfig(companyId, cfg.id); refresh(); }}>
                      <Star size={10} strokeWidth={2.6} /> {cfg.isDefault ? "Is default" : "Set as default"}
                    </button>
                    <button className={`${ROW_BTN} text-rose-500 hover:border-rose-300 hover:text-rose-600`}
                      onClick={() => setDlg({ kind: "delete", cfg })}>
                      <Trash2 size={10} strokeWidth={2.6} /> Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </PortalDialog>
    </div>
  );
}
