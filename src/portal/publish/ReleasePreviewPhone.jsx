// The investor app's press release reader, live, inside the sales page's phone.
//
// WHAT MAKES THIS A PREVIEW RATHER THAN A MOCKUP
// ----------------------------------------------
// Nothing here draws a press release. The release is rendered by ReleaseReader,
// the same component the investor app opens when someone taps a release, inside
// BottomSheet, the same sheet it opens in. The data reaches it the same way too:
// the draft becomes a timeline entry through releaseEntryFromReview -- the
// builder the publisher uses -- and that entry is mapped by mapReleaseEntry,
// which runs the published profile's own mapTimeline.
//
// So the preview cannot flatter the draft. A field the mapper drops is dropped
// here; a takeaway that falls back to the canned line falls back here too. What
// the company approves is what publishing produces, because it is the same code
// producing both.

import React, { useEffect, useMemo, useState } from "react";
import DevicePhone from "../DevicePhone.jsx";
import { mapReleaseEntry } from "../../lib/profileToPP.js";
import { releaseEntryFromReview } from "../../lib/releaseEntry.js";

// The app's chrome above the profile content: its status bar and the row
// beneath it. These position the BACKDROP only. They have nothing to do with
// where the sheet begins -- that was the mistake. The sheet is laid over the
// whole screen and takes its height from BottomSheet's own rule, so sizing it
// against "what is left below the chrome" pushed it a sixth of a screen too
// low and left an unnatural band of blurred profile above it.
const STATUS_H = 38;
const APP_HEADER_H = 49;

export default function ReleasePreviewPhone({ draft, headline, text, date, analysis, maxWidth = 460 }) {
  const [mod, setMod] = useState(null);
  const [showFull, setShowFull] = useState(false);

  // Lazily, like the profile editor does: the investor app is a large module
  // and the review screen must not wait on it to become usable.
  useEffect(() => {
    let ok = true;
    import("../../aiBrief/PassportProto.jsx")
      .then((m) => { if (ok) setMod({ ReleaseReader: m.ReleaseReader, ReleaseFullReader: m.ReleaseFullReader, ReleaseCard: m.ReleaseCard, BottomSheet: m.BottomSheet, StatusBar: m.StatusBar }); })
      .catch(() => {});
    return () => { ok = false; };
  }, []);

  // Re-derived on every edit. `analysis` is the live card the editor is
  // mutating, so this is the current draft and never a saved snapshot.
  const mapped = useMemo(() => {
    try { return mapReleaseEntry(releaseEntryFromReview({ draft, headline, text, date, analysis })); }
    catch { return null; }
  }, [draft, headline, text, date, analysis]);

  // Before MineEx has written the summary there is nothing to preview, and
  // showing the reader anyway is worse than showing nothing: the renderer
  // falls back to deriving a category and an impact tier from the headline and
  // to a canned takeaway, so an ungenerated release looks like a generated one
  // classified "Corporate / Moderate". The company would be reading guesses as
  // though they were the analysis.
  const card = (analysis && analysis.card) || null;
  const generated = !!(card && (card.whatHappened || card.investorTakeaway ||
    (Array.isArray(card.keyNumbers) && card.keyNumbers.length)));

  const body = () => {
    if (!mod) return <Hint>Loading the investor app…</Hint>;
    if (!generated) return <Hint>Generate the summary to see how investors will read this release.</Hint>;
    if (!mapped) {
      // mapTimeline drops an entry without an ISO date, and so would the
      // profile. Saying which field is missing beats an empty phone.
      return <Hint>{date ? "Add a headline to see the preview." : "Set a release date to see the preview."}</Hint>;
    }
    const { ReleaseReader, ReleaseFullReader, ReleaseCard, BottomSheet, StatusBar } = mod;
    // The app's own layering: the timeline card behind, the release sheet open
    // over it. Both surfaces at once is not a preview conceit -- it is what an
    // investor is looking at when they read a release, and it is the only way
    // the company can see where the short headline it writes in review ends up.
    return (
      /* THE SHEET COVERS THE WHOLE SCREEN, as it does in the app.
         The app portals this sheet over its entire frame, so the scrim -- dim
         plus a 2px blur -- falls across the status bar and the row beneath it
         as well as the content. Rendering the sheet inside the content area
         instead left that reserved row lit while everything around it was
         dimmed, which is the blank strip. Nothing about the reader changed;
         what changed is how far its backdrop reaches. */
      <div style={{ height: "100%", position: "relative", overflow: "hidden", background: "#f8fafc" }}>
        <StatusBar />
        {/* The app's own 49px row. On the web the app fills it with an
            "Open in app" banner, which is a browser affordance and has no
            place in a company's preview of its own release -- but the height
            is real and the sheet is measured from what is left below it, so
            the space stays and the backdrop shows through it. */}
        <div style={{ height: APP_HEADER_H }} />
        {/* The reader's container: 376 x 737, the app's content area. */}
        <div style={{ position: "absolute", top: STATUS_H + APP_HEADER_H, left: 0, right: 0, bottom: 0, overflow: "hidden" }}>
          <div style={{ padding: "6px 18px 0" }}>
            <ReleaseCard item={mapped.item} year={mapped.year} />
          </div>
        </div>
        {/* Laid over the whole screen, exactly as the app lays it: the stack
            is inset-0 of the screen and BottomSheet decides its own height
            from that. Nothing here positions the sheet. */}
        <BottomSheet inline headerBar onClose={showFull ? () => setShowFull(false) : undefined}>
          {showFull && mapped.full
            ? <ReleaseFullReader item={mapped.item} year={mapped.year} full={mapped.full} />
            : <ReleaseReader item={mapped.item} year={mapped.year} hasFull={!!mapped.full}
                onReadFull={() => setShowFull(true)} />}
        </BottomSheet>
      </div>
    );
  };

  return <DevicePhone maxWidth={maxWidth}>{body()}</DevicePhone>;
}

function Hint({ children }) {
  return (
    <div style={{ height: "100%", display: "grid", placeItems: "center", background: "#fff", padding: 32 }}>
      <p style={{ margin: 0, textAlign: "center", fontFamily: "system-ui", fontSize: 14, fontWeight: 600, color: "#94a3b8" }}>
        {children}
      </p>
    </div>
  );
}
