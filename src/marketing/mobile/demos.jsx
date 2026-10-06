// ─────────────────────────────────────────────────────────────────────────────
// demos — the live screens the phone shows, one per chapter.
//
// Each is a thin wrapper around an AppUI screen that supplies the state a finger
// needs. The rule from the Projects proof holds everywhere: use the smallest real
// interaction that demonstrates the actual feature, and where the product has no
// control to offer, show the live screen and leave it alone rather than inventing
// a button for novelty's sake.
//
// Deliberately NOT interactive, because the product has nothing to interact with
// there: Capital, Leadership, Media, Timeline (every fixture release is 2026, so a
// year filter would empty the list and read as broken).
//
// Nothing here touches the network. No Supabase, no Postmark, no push, no auth, no
// analytics beyond the page's own. Follow state is a useState in this file.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from "react";
import { ExploreScreen, FeedScreen, MediaScreen, ProfileScreen, ReleaseScreen } from "../ui/AppUI.jsx";
import AdvancedSearch from "./AdvancedSearch.jsx";

// ── The company profile. The tab bar is the product's own way of moving between
//    sections, so it is live on every profile chapter; `start` picks where it opens.
export function ProfileDemo({ start = "overview", projects = false }) {
  const [tab, setTab] = useState(start);
  const [project, setProject] = useState(0);
  const [following, setFollowing] = useState(false);
  return (
    <ProfileScreen
      tab={tab} onTab={setTab}
      project={project} onProject={projects ? setProject : undefined}
      following={following} onFollow={() => setFollowing((v) => !v)}
      nav="explore"
    />
  );
}

// ── Today. Tapping a story opens it and the back chevron returns — the app's own
//    behaviour, and the reason this chapter is worth showing live.
export function DiscoverDemo() {
  const [open, setOpen] = useState(null);
  return open === null
    ? <FeedScreen onOpen={setOpen} />
    : <ReleaseScreen index={open} onBack={() => setOpen(null)} />;
}

// ── Explore, with the real Advanced Search sheet over it.
export function ExploreDemo({ openSheet = false }) {
  const [sheet, setSheet] = useState(openSheet);
  const [filters, setFilters] = useState([]);
  return (
    <ExploreScreen
      activeFilters={filters}
      dimNonMatching={filters.length > 0}
      sheet={sheet ? (
        <AdvancedSearch
          onClose={() => setSheet(false)}
          onApply={(picked) => { setFilters(picked); setSheet(false); }}
        />
      ) : null}
      onOpenSheet={() => setSheet(true)}
    />
  );
}

// ── The media grid. No viewer exists in the presentation build, so it stays a live
//    screen without a fabricated lightbox.
export function MediaDemo() { return <MediaScreen />; }
