// Typeface loading for the design system.
//
// One place, because the workbench and the QA matrix both render slides and a
// theme that silently falls back to a system stack looks like a different theme.
// Production self-hosts these; the preview may pull them from a CDN.

import { useEffect } from "react";

const FAMILIES = [
  "Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500",
  "Newsreader:opsz,wght@6..72,300;6..72,400;6..72,500",
  "Inter:wght@400;500;600;700;800",
  "Archivo:wght@400;500;600;700;800",
  "Space+Grotesk:wght@400;500;600;700",
  "IBM+Plex+Mono:wght@400;500",
  "Playfair+Display:wght@400;500;700",
];

export const FONT_HREF =
  `https://fonts.googleapis.com/css2?${FAMILIES.map((f) => `family=${f}`).join("&")}&display=swap`;

export function useDesignFonts() {
  useEffect(() => {
    if (document.getElementById("studio-fonts")) return;
    const link = document.createElement("link");
    link.id = "studio-fonts";
    link.rel = "stylesheet";
    link.href = FONT_HREF;
    document.head.appendChild(link);
  }, []);
}
