// ─────────────────────────────────────────────────────────────────────────────
// ProjectsDemo — the Projects chapter's live screen.
//
// It renders the SAME component the marketing site already uses for this screen,
// AppUI's ProfileScreen, and supplies the state that makes it respond: which profile
// tab is open and which project is selected. AppUI is the presentation build of the
// app (see its header) — a few hundred nodes of ordinary React, not PassportProto and
// not an iframe — so a page can afford to have it live.
//
// Nothing is invented here: the tabs, the project selector, the imagery and the
// figures are the component's own, and the only thing this file adds is the state a
// finger needs in order to change something.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from "react";
import { ProfileScreen } from "../ui/AppUI.jsx";

export default function ProjectsDemo() {
  const [tab, setTab] = useState("projects");
  const [project, setProject] = useState(0);
  return (
    <ProfileScreen
      tab={tab} onTab={setTab}
      project={project} onProject={setProject}
      nav="explore"
    />
  );
}
