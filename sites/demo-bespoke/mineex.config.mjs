// The site's own declaration of what MineEx may edit.
//
// This file is the SOURCE of the manifest. `build.mjs` uploads it, and the
// MineEx editor renders its controls from it. Nothing here describes how any of
// this looks — the animation, typography and layout live in render.mjs and are
// deliberately unreachable from the editor.
//
// Note what is NOT declared: the strata band's colours, the hero's type scale,
// the easing on the marker reveal. A field the manifest does not mention cannot
// be reached by the editor at all.

export default {
  contract: "1.0",
  site: { key: "demo-bespoke", version: "2026.10.1" },
  sections: [
    {
      type: "hero",
      label: "Opening",
      description: "Full-height type-led opening. The backdrop is cropped to 21:9 and tinted by the theme.",
      singleton: true,
      fields: [
        { key: "kicker",   type: "text", label: "Kicker", max: 40, help: "Small line above the headline." },
        { key: "headline", type: "text", label: "Headline", max: 80, required: true },
        { key: "standfirst", type: "richtext", label: "Standfirst", max: 320, marks: ["bold", "italic", "link"] },
        { key: "backdrop", type: "image", label: "Backdrop", ratio: "21:9" },
      ],
    },
    {
      type: "strata",
      label: "Strata column",
      description: "The animated core-sample column. Bands are drawn from the values below; the animation is not configurable.",
      fields: [
        { key: "heading", type: "text", label: "Heading", max: 60 },
        {
          key: "bands", type: "list", label: "Bands", min: 2, max: 8,
          of: [
            { key: "label", type: "text", label: "Label", max: 32, required: true },
            { key: "depth", type: "number", label: "Depth (m)", min: 0, max: 5000 },
            { key: "tone", type: "enum", label: "Tone", options: ["ochre", "rust", "slate", "gold"] },
          ],
        },
      ],
    },
    {
      type: "projects",
      label: "Projects",
      description: "Renders the company's canonical project records. Only the framing is editable here.",
      fields: [
        { key: "heading", type: "text", label: "Heading", max: 60 },
        { key: "intro", type: "richtext", label: "Intro", max: 400 },
        { key: "featured", type: "reference", label: "Lead project", to: "project" },
      ],
    },
    {
      type: "news",
      label: "Press releases",
      description: "Pulls published releases from MineEx. Nothing is copied — this always shows what is live.",
      fields: [
        { key: "heading", type: "text", label: "Heading", max: 60 },
        { key: "limit", type: "number", label: "How many to show", min: 1, max: 20 },
      ],
    },
  ],
};
