// Company Brand Kit — the constraints the renderer obeys (stage 12 builds the
// manager UI; the shape is fixed here so the themes can be written against it).
//
// A brand kit is RULES, not decoration. It answers: which two colours may appear,
// which typeface pairing, where the logo is allowed to sit, what legal line must
// ride along. Restrained branding is enforced by giving the renderer very little
// to work with — there is no "accent gradient", no icon set, no third colour.

export interface BrandPalette {
  /** Primary text colour on light grounds. */
  ink: string;
  /** Light ground. */
  paper: string;
  /** Dark ground (dark themes invert ink/paper against this). */
  ground: string;
  /** THE accent. One. Used for a rule, a figure, or a fill — never all three at once. */
  accent: string;
  /** Secondary text / hairlines. Derived from ink when absent. */
  muted?: string;
}

export interface BrandTypography {
  /** Display face for headlines and large metrics. */
  display: string;
  /** Text face for body and captions. */
  text: string;
  /** Optional monospace for hole IDs, coordinates and tables. */
  mono?: string;
  /** Global type-scale multiplier, 0.9–1.15. Nudges density, never rewrites the scale. */
  scale?: number;
}

export interface BrandAssets {
  logoLight?: string;
  logoDark?: string;
  wordmark?: string;
  /** Curated photography — the renderer only ever uses images from here. */
  photos: BrandImage[];
  /** Project maps, cross-sections, plan views. */
  maps: BrandImage[];
}

export interface BrandImage {
  id: string;
  url: string;
  caption?: string;
  credit?: string;
  /** 0–1 focal point so cropping keeps the subject, not the centre of the file. */
  focal?: { x: number; y: number };
  tags?: string[];
}

export type LogoPlacement = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "none";

export interface BrandRules {
  logoPlacement: LogoPlacement;
  /** Show the logo on the first and last slide only — the default, and the restrained one. */
  logoOnEverySlide: boolean;
  /** Legal line the export must carry when the release is forward-looking. */
  disclaimer?: string;
  /** e.g. "TSXV: KRS · OTCQB: KRSLF". Rendered once, small, never repeated per slide. */
  tickerLockup?: string;
  website?: string;
}

export interface BrandKit {
  id: string;
  companyId: string;
  name: string;
  palette: BrandPalette;
  typography: BrandTypography;
  assets: BrandAssets;
  rules: BrandRules;
  defaultThemeId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BrandKitRow {
  id: string;
  company_id: string;
  name: string;
  palette: Partial<BrandPalette> | null;
  typography: Partial<BrandTypography> | null;
  assets: Partial<BrandAssets> | null;
  rules: Partial<BrandRules> | null;
  default_theme_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Neutral fallback so the renderer always has a complete, usable kit. */
export const DEFAULT_BRAND: Omit<BrandKit, "id" | "companyId" | "createdAt" | "updatedAt"> = {
  name: "Default",
  palette: { ink: "#111214", paper: "#FAF9F7", ground: "#0B0C0E", accent: "#B4531F", muted: "#6B6F76" },
  typography: { display: "'Fraunces', Georgia, serif", text: "'Inter', system-ui, sans-serif", mono: "'IBM Plex Mono', monospace", scale: 1 },
  assets: { photos: [], maps: [] },
  rules: { logoPlacement: "bottom-left", logoOnEverySlide: false },
  defaultThemeId: null,
};

export function toBrandKit(row: BrandKitRow): BrandKit {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name || DEFAULT_BRAND.name,
    palette: { ...DEFAULT_BRAND.palette, ...(row.palette || {}) },
    typography: { ...DEFAULT_BRAND.typography, ...(row.typography || {}) },
    assets: { ...DEFAULT_BRAND.assets, ...(row.assets || {}), photos: row.assets?.photos || [], maps: row.assets?.maps || [] },
    rules: { ...DEFAULT_BRAND.rules, ...(row.rules || {}) },
    defaultThemeId: row.default_theme_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
