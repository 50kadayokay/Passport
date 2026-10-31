# Vendored fonts (og-news)

`api/og-news.js` renders share cards with Inter. The two weights it uses are
vendored here so the Edge function needs no network to render (it used to
fetch them from cdn.jsdelivr.net on every cold start).

| File | Source | sha256 |
|---|---|---|
| `inter-latin-500-normal.woff` | npm `@fontsource/inter@5.2.6`, `files/` | `9b42c108da48b5ed55a3072e815ffee2d271562e6c0dd6998910e8f9c09e0a3d` |
| `inter-latin-800-normal.woff` | npm `@fontsource/inter@5.2.6`, `files/` | `a2fdc5be8acd75fe8f3fd9de8179828d04fd884c155cd6b63fec23b33651ec88` |

These are the same files the old CDN URLs served
(`cdn.jsdelivr.net/npm/@fontsource/inter/files/…` is a mirror of that npm
package). Licence: SIL Open Font License 1.1 — `LICENSE-Inter-OFL.txt`.
