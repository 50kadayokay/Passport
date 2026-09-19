// ─────────────────────────────────────────────────────────────────────────────
// Marketing site content.
//
// Everything here is REAL product content, lifted from the live MineEx app so the
// marketing page shows the actual product rather than invented screens:
//   • Kingsmen Resources — the app's published flagship profile
//   • the published company directory (real TSX-V listings that genuinely appear
//     in Explore)
//   • real press releases with the app's own summary / why-it-matters / takeaways
//   • real project photography served from the app's media bucket
//
// NOTHING in this file is a fabricated metric, customer, testimonial or price.
// Where a screen would normally show live investor engagement, the marketing UI
// labels it as demonstration data instead of inventing numbers.
//
// The public brand is MineEx everywhere on this surface.
// ─────────────────────────────────────────────────────────────────────────────

// Project photography is served from the app's media bucket, but re-encoded
// locally at the two sizes this page actually paints (thumbnail and card). The
// originals are 975–1500 px and ~3.5 MB in total; decoding those into 130 px
// mosaic tiles is what makes a long scrolling page stutter.
const M = "/marketing";
const pair = (name) => ({ src: `${M}/${name}.webp`, sm: `${M}/${name}-sm.webp` });

export const IMG = {
  avatar: `${M}/kingsmen-avatar.webp`,
  status: `${M}/kingsmen-status.webp`,
  // White/transparent horizontal wordmark for the identity-card front. Drop the
  // file at public/marketing/kingsmen-logo.webp; the front falls back to the
  // avatar + name until it exists.
  logo: `${M}/kingsmen-logo.webp`,
  drill: pair("site-7-active-drill-site"),
  colonial: pair("site-8-colonial-era-workings"),
  adit: pair("site-9-historic-adit"),
  field: pair("site-10-field-review"),
  mineAdit: pair("site-11-mine-adit"),
  sampling: pair("site-13-surface-sampling"),
  timbered: pair("site-14-timbered-workings"),
  shaft: pair("site-15-historic-shaft"),
  district: pair("site-17-district-overview"),
  aerial: pair("site-18-drill-site-aerial"),
  rig: pair("site-19-drill-rig"),
};

// The demo company shown throughout — a real, published MineEx profile.
export const CO = {
  name: "Kingsmen Resources",
  legalName: "Kingsmen Resources Ltd.",
  slogan: "Chihuahua's preeminent explorationist",
  website: "kingsmenresources.com",
  listings: [
    ["TSX.V", "KNG"],
    ["OTCQB", "KNGRF"],
    ["FSE", "TUY"],
  ],
  facts: [
    { label: "Commodity", value: "Silver · Gold", icon: "gem" },
    { label: "Jurisdiction", value: "Mexico", icon: "pin" },
    { label: "Flagship project", value: "Las Coloradas", icon: "mountain" },
    { label: "Stage", value: "Explorer", icon: "trend" },
    { label: "Projects", value: "2 Projects", icon: "layers" },
    { label: "Current focus", value: "Active Drilling", icon: "activity", live: true },
  ],
  status: {
    headline: "26-Hole Drill Campaign",
    detail: "Phase 1 diamond drilling is actively underway at Las Coloradas.",
    done: 14,
    total: 26,
    unit: "holes",
    latest: "Three drill holes submitted to the lab for assays.",
    impact: "Could expand the high-grade silver system.",
    next: "Phase 1 Assays",
    eta: "Expected H2 2026",
  },
  capital: {
    headline: "Fully Funded Through 2026",
    desc: "The C$13M February bought deal fully funds the planned 2026 exploration program, with no near-term financing required.",
    rows: [
      ["Cash", "C$4.2M"],
      ["Debt", "C$0"],
      ["Financing", "C$13.0M"],
      ["Shares outstanding", "34,523,086"],
    ],
    note: "Bought Deal · Feb 2026",
  },
  keyPoints: [
    "Fully funded through 2026 with a C$13M February bought deal",
    "Active 26-hole Phase 1 diamond drill campaign at Las Coloradas",
    "New high-grade silver discovery: 241 g/t AgEq including 525 g/t AgEq",
    "District-scale package expanded via the Claudia 2 acquisition",
  ],
};

// The 60-second AI Brief, as the app's own analyzer produces it (BRIEF_SECTIONS
// in the shipped app). Orientation, not data — every line is drawn from the real
// Kingsmen facts above, nothing invented.
export const BRIEF = [
  { k: "What they do", v: "A silver–gold explorer in Chihuahua, Mexico, advancing the Las Coloradas flagship alongside the Almoloya project." },
  { k: "Why it matters", bullets: CO.keyPoints },
  { k: "Right now", v: CO.status.detail },
];

export const PROJECTS = [
  {
    name: "Las Coloradas",
    district: "Parral District, Chihuahua, Mexico",
    image: IMG.aerial.src,
    stage: "Drilling",
    snapshot: [
      ["Land", "32 km²"],
      ["Commodities", "Silver and Gold"],
      ["Targets", "High-grade Ag-Au structures"],
    ],
  },
  {
    name: "Almoloya",
    district: "Sierra de Almoloya, Chihuahua, Mexico",
    image: IMG.district.src,
    stage: "Exploration",
    snapshot: [
      ["Land", "28 km²"],
      ["Commodities", "Silver and Gold"],
      ["Targets", "Vein systems, largely undrilled"],
    ],
  },
];

// The real Kingsmen board & management, as the app's Leadership tab lists them.
export const TEAM = [
  { name: "Scott Emerson", role: "President, CEO & Director", initials: "SE", verified: true, bio: "Resource and technology executive with senior management and directorship experience across public companies." },
  { name: "Rodney B. Johnston", role: "Director", initials: "RJ", bio: "FCPA, FCA who retired from PricewaterhouseCoopers LLP after 35 years in audit and advisory." },
  { name: "Nick DeMare", role: "CFO & Director", initials: "ND", bio: "President of Chase Management since 1991, providing accounting, compliance and corporate services to public companies." },
  { name: "Kieran Downes", role: "Director", initials: "KD", bio: "Professional Geologist with over 40 years of diversified experience in gold, base metals and industrial minerals." },
];

// Real releases, with the summary layer the app actually produces.
export const RELEASES = [
  {
    date: "2026-05-12",
    d: "May 12",
    label: "60 km² satellite topo survey",
    category: "Exploration",
    impact: "Notable",
    headline:
      "Kingsmen Completes 60 km² Precision Satellite Topographic Surveys at Las Coloradas and Almoloya",
    why: "Precision topography sharpens drill-hole positioning across both projects.",
    takeaways: [
      "60 km² satellite topo (LC 32 + Almoloya 28 km²)",
      "Feeds a full 3D geological model",
      "Supports the active drill program",
    ],
  },
  {
    date: "2026-04-07",
    d: "Apr 7",
    label: "Acquires Claudia 2 claim & Saddle target",
    category: "Acquisition",
    impact: "High",
    headline:
      "Kingsmen Acquires 100% Ownership of the Claudia 2 Claim, Adding Never-Drilled Saddle Target",
    why: "Adds a large, never-drilled target royalty-free — district upside at low cost.",
    takeaways: [
      "100% of Claudia 2 acquired, NSR-free",
      "Adds the never-drilled Saddle target",
      "District-scale southerly extensions",
    ],
  },
  {
    date: "2026-02-17",
    d: "Feb 17",
    label: "Unveils fully-funded 2026 plan",
    category: "Financing",
    impact: "High",
    headline:
      "Kingsmen Resources Announces Exploration Plans for Las Coloradas and Almoloya Following Fully Funded Financing",
    why: "A funded, detailed plan turns capital into a concrete catalyst calendar.",
    takeaways: [
      "2026 plans for Las Coloradas & Almoloya",
      "~700 m of Soledad still untested",
      "1.7 km Soledad II largely undrilled",
    ],
  },
  {
    date: "2026-02-11",
    d: "Feb 11",
    label: "Closes C$13M bought deal",
    category: "Financing",
    key: true,
    impact: "Transformational",
    headline:
      "Kingsmen Resources Announces Closing of Bought Deal Private Placement for Gross Proceeds of C$13 Million",
    why: "Closing at C$13M makes the company fully funded and removes the dilution overhang.",
    takeaways: [
      "C$13.0M gross proceeds",
      "Fully funded through 2026",
      "No near-term financing required",
    ],
  },
];

// A real newswire release, verbatim, for the "before" side of the reading
// experience — the wall of text an investor is asked to parse today.
export const RAW_RELEASE = {
  title: "Kingsmen Expands Land Position in Historic Mine District",
  dateline:
    "Vancouver, British Columbia--(Newsfile Corp. - April 4, 2023)",
  body: `Kingsmen Resources Ltd. (TSXV: KNG) (OTCQB: KNGRD) ("Kingsmen" or the "Company") is pleased to report the acquisition of a new 342 hectare claim adjacent to its 100%-owned, brownfield Las Coloradas high-grade vein, silver-gold-lead-zinc-copper project located in the SE part of the Parral mining district of Chihuahua, Mexico (www.kingsmenresources.com). The claim was purchased from an arm's length vendor independent from the company and the vendor of the Las Coloradas project, claims, and is unencumbered by any royalties or other interests. The claim is an exempt transaction under policies of the TSX.V.

The newly acquired claim immediately adjoins the Company's Las Coloradas project area to the west and south giving the Company control over this significant area. The claim covers prospective geology, and structural and geophysical targets, and will now form part of the Las Coloradas project. As well, a prominent northeast structural trend has been noted in the geology. A northeast structural trend is the main control on mineralization at Discovery Silver's Cordero silver deposit, 35 km northeast of Parral.

Scott Emerson, President: "The acquisition is in line with our aggressive strategy to become the pre-eminent explorer in this historic mining district."`,
};

// Real published listings from the MineEx directory (public TSX-V companies that
// genuinely appear in Explore). Shown as directory results — not as customers.
export const DIRECTORY = [
  { name: "Kingsmen Resources Ltd.", ticker: "TSXV: KNG", commodity: "Silver · Gold", region: "Chihuahua, Mexico", stage: "Explorer", mono: "KR", tint: "#0f766e", featured: true },
  { name: "Argenta Silver Corp.", ticker: "TSXV: AGAG", commodity: "Silver", region: "Salta, Argentina", stage: "Explorer", mono: "AS", tint: "#334155" },
  { name: "Capitan Silver Corp.", ticker: "TSXV: CAPT", commodity: "Gold · Silver", region: "Durango, Mexico", stage: "Explorer", mono: "CS", tint: "#475569" },
  { name: "Canadian Gold Corp.", ticker: "TSXV: CGC", commodity: "Gold", region: "Manitoba, Canada", stage: "Developer", mono: "CG", tint: "#7c2d12" },
  { name: "Canadian Critical Minerals", ticker: "TSXV: CCMI", commodity: "Copper · Gold", region: "British Columbia, Canada", stage: "Developer", mono: "CC", tint: "#1e3a5f" },
  { name: "Canadian Gold Resources Ltd.", ticker: "TSXV: CAN", commodity: "Gold · Silver", region: "Quebec, Canada", stage: "Explorer", mono: "CR", tint: "#3f3f46" },
];

// The channels a junior's story is scattered across today.
export const CHANNELS = [
  "Corporate website",
  "Newswire",
  "LinkedIn",
  "X",
  "Email",
  "Presentations",
  "YouTube",
  "Conferences",
];

// The end-to-end journey the page walks through.
export const JOURNEY = [
  { id: "discover", label: "Discover", note: "An investor finds you in Explore." },
  { id: "learn", label: "Learn", note: "Your full story, structured for reading." },
  { id: "follow", label: "Follow", note: "Interest becomes a standing connection." },
  { id: "updates", label: "Updates", note: "Every release reaches their feed." },
  { id: "media", label: "Media", note: "Video and imagery carry what text can't." },
  { id: "conference", label: "Conference", note: "The booth presents, the QR captures." },
  { id: "reengage", label: "Re-engage", note: "The relationship keeps compounding." },
];
