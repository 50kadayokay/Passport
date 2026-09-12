// Single source of truth for the Company Profile section/subsection navigation, shared by the
// editor (src/portal/ProfileEditor.jsx) and the Portal sidebar (src/portal/Portal.jsx) so the
// sidebar's expandable "Company Profile" menu and the editor stay in lockstep. Keys/titles MUST
// match the in-editor STEPS. Kept in its own tiny module so the Portal shell can read it without
// eagerly pulling in the (lazy-loaded) editor.

export const PROFILE_SECTIONS = [
  { key: "overview", label: "Overview", steps: [
    { key: "images", title: "Images" },
    { key: "details", title: "Company details" },
    { key: "brief", title: "Investment story" },
  ] },
  { key: "projects", label: "Projects", steps: [{ key: "projects", title: "Project details" }] },
  { key: "timeline", label: "Timeline", steps: [{ key: "timeline", title: "Timeline & updates" }] },
  { key: "capital", label: "Capital", steps: [
    { key: "shares", title: "Share structure" },
    { key: "funding", title: "Funding status" },
    { key: "ownership", title: "Ownership" },
  ] },
  { key: "team", label: "Team", steps: [{ key: "team", title: "Team & leadership" }] },
];

// BASIC tier edits only Overview + Timeline (mirrors visibleTabs in the editor).
export const visibleProfileSections = (tier) =>
  String(tier || "").toLowerCase() === "basic"
    ? PROFILE_SECTIONS.filter((s) => s.key === "overview" || s.key === "timeline")
    : PROFILE_SECTIONS;
