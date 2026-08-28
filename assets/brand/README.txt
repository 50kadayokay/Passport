MineEx brand assets
===================

THE ICON is the drill core on its own — four strata on near-black. This is what
ships as the app/PWA/favicon icon.

  Geometry (as shares of the tile, so it scales to any size):
    core width    14.0625%   (144 on a 1024 tile)
    core height   46.875%    (480 on a 1024 tile)
    corner radius 23.611% of the core width (34 on a 1024 tile) — a soft rounded
                  rectangle, NOT a full capsule
    centred both ways, background #0B0D10
  Do not change these without a reason; the icon is signed off at exactly these
  proportions.

  Glare: a soft light sweep off the top-left corner, laid over the tile — light
  catching the face of the icon. The CORE ARTWORK IS NEVER SHADED; it stays exactly
  the flat signed-off bands. Set GLARE = "none" in make-icons.cjs and the output is
  byte-for-byte identical to the approved reference. Other options in that file:
  "streak" (a narrow reflected band), "edge" (sweep plus a lit top edge), "glass"
  (a hard diagonal — the iOS 6 look, avoid).

THE MARK is the core standing in for the M's first stroke, with a 14px gap so it
reads as a physical object rather than a striped letter stroke. NOTE: the mark's
core still has full-capsule ends, so it does not yet match the icon's softer 23.6%
rounding — align it if the two are ever used side by side. Use it for the
wordmark lockup, the site and anywhere with room; it is NOT the app icon, because
below ~40px the letter and the core compete.

Strata, top to bottom — surface downward, value increasing with depth:
  overburden   #7A4E33
  copper       #C4633B
  silver       #B6BCC3
  gold         #D9A24C
  ink          #0B0D10

REGENERATING
  node assets/brand/make-icons.cjs
  Rewrites every shipped icon and the whole iOS set from one source. Edit that file
  rather than any generated SVG/PNG.

SHIPPED (already installed in the app)
  public/icon-192.png            PWA
  public/icon-512.png            PWA
  public/icon-maskable-512.png   Android maskable. The core already sits well
                                 inside the 80% safe zone at this size, so it is
                                 the same artwork as the standard icon.
  public/apple-touch-icon.png    180px
  public/favicon-32.png
  public/booth-icon.svg          Conference Mode home-screen icon. This replaces a
                                 green "P" that was still shipping the old codename.
  assets/app-icon.svg            the master

app/
  icon-master.svg                square, full-bleed, no transparency
  icon-maskable-master.svg
  ios/icon-20 … icon-1024        full iOS raster set. icon-1024.png is the App Store
                                 build: square, opaque, no alpha. Do NOT pre-round
                                 it — Apple applies its own mask and rejects icons
                                 that carry rounding or an alpha channel.

FOR CANVA / DECKS (transparent, trimmed, oversized)
  mineex-core-sample.png         the core alone
  mineex-mark-white/-ink.png     the full mark
  mineex-wordmark-white/-ink.png "MineEx" as artwork
  mineex-icon-dark/-light-1024   rounded, for mockups only

  Use the PNGs. The wordmark SVG carries live text set in Helvetica Neue, so Canva
  will substitute a font and it will look wrong. Canva has Inter built in, which is
  the face the brand notes specify (Inter SemiBold, -3 tracking).

KNOWN LIMIT
  A slender vertical mark thins out at the smallest sizes. The icon is solid down
  to ~40px; at 29px and 20px (Settings, Spotlight) it reads as a band of colour
  rather than a recognisable core. If that matters, the fix is a small-size variant
  with a wider core and two bands instead of four.

_previous/
  The icons that were shipping before this change. They were NOT tracked in git, so
  this folder is the only copy — keep it until you're sure.
