// Content — press releases and media, one destination, two tabs.
//
// WHY THIS EXISTS
// ---------------
// The sidebar used to carry three entries for what is really one job: Publish,
// Press Releases and Media. A company thinking "I want to put something on my
// profile" had to know which of the three to pick. This is that decision moved
// into the page, where the answer is a tab rather than a guess.
//
// IT OWNS NO FEATURE LOGIC. The press-release library, the publishing flow, the
// media grid and the composer are all the existing components, unchanged. This
// file is a tab bar and the launch-intent plumbing behind it.
//
// There used to be a contextual "Publish Press Release" / "Publish Media"
// button above the tabs. Both tabs now open on their own way in -- the release
// library leads with a drop zone, and the media grid with its own compose
// button -- so the top button was a second control for the thing already on
// screen, a few pixels higher. Removed, not relocated.
//
// Tab state is LIFTED to Portal.jsx so that leaving for MineIQ and coming back
// returns you to the tab you were on.

import React, { Suspense, lazy } from "react";
import { Megaphone, Image as ImageIcon, Loader2 } from "lucide-react";

const Publish   = lazy(() => import("./publish/Publish.jsx"));
const MediaPage = lazy(() => import("./MediaPage.jsx"));

// The same loader as every other portal section (Portal.jsx SectionLoader).
const Loader = () => (
  <div className="grid min-h-[40vh] place-items-center text-slate-300" role="status" aria-label="Loading">
    <Loader2 size={24} className="animate-spin text-blue-500" />
  </div>
);

const TABS = [
  { id: "releases", label: "Press Releases", Icon: Megaphone },
  { id: "media",    label: "Media",          Icon: ImageIcon },
];

// `hideTabs`: the portal shows Press Releases / Media in its side column (Portal.jsx
// ContentLayout), so the tab bar here is only drawn when nothing else offers it.
export default function Content({ company, tab = "releases", setTab, go = () => {}, takeover = null, setTakeover = () => {}, hideTabs = false }) {
  const active = TABS.some((t) => t.id === tab) ? tab : "releases";

  // `takeover` is a LAUNCH INTENT, not a separate screen: "create", "draft" or
  // "media". It is handed to the child as its initial state and the child then
  // owns the flow.
  //
  // An earlier version rendered the flows in their own frame with a back link.
  // That produced two stacked back links -- mine and CreateRelease's own -- and
  // the child's one exited to the Publish chooser, which is no longer a sidebar
  // destination. Rendering in place avoids both: the tab bar stays above the
  // flow, and CreateRelease's back lands on the library, which IS this tab.
  //
  // The children are keyed on the intent itself, so arriving from a homepage
  // tile remounts them into that flow. This was a `nonce` counter bumped by the
  // removed button; with the button gone the intent is the only thing that can
  // change, which makes it the honest key.
  // Switching tabs clears the intent, or returning to a tab would silently
  // re-open the flow you just left.
  const switchTab = (id) => { setTakeover(null); setTab(id); };

  return (
    <div>
      {!hideTabs && <div className="flex items-center gap-1 border-b border-slate-100">
        {TABS.map(({ id, label, Icon }) => {
          const on = id === active;
          return (
            <button
              key={id}
              onClick={() => switchTab(id)}
              aria-current={on ? "page" : undefined}
              className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-[13.5px] font-bold tracking-tight transition ${
                on ? "border-blue-600 text-blue-600"
                   : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              <Icon size={15.5} strokeWidth={on ? 2.4 : 2.2} />
              {label}
            </button>
          );
        })}
      </div>}

      <div className={hideTabs ? "" : "mt-6"}>
        <Suspense fallback={<Loader />}>
          {active === "releases" && (
            <Publish
              key={`pr-${takeover || "none"}`}
              company={company}
              view="releases"
              startIn={takeover === "draft" ? "draft" : takeover === "releases" ? "create" : null}
              // Publish calls go("releases") after publishing and go("media")
              // from its media link. Keep both inside Content rather than
              // sending them at sidebar entries that no longer exist.
              go={(dest) => {
                if (dest === "media") { switchTab("media"); return; }
                if (dest === "releases") { setTakeover(null); return; }
                go(dest);
              }}
            />
          )}
          {active === "media" && (
            <MediaPage
              key={`md-${takeover || "none"}`}
              company={company}
              startComposing={takeover === "media"}
              onComposerExit={() => setTakeover(null)}
            />
          )}
        </Suspense>
      </div>
    </div>
  );
}
