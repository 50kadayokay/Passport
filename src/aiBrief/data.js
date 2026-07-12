// App-level content for the Passport AI Brief consumer app.
// This is the market/discovery data that is NOT part of a company profile
// (live prices, peer companies, the activity wire). The Kingsmen company
// PROFILE itself is read from Supabase at runtime — see App.jsx / CompanyProfile.

// The slug whose profile we load from Supabase.
export const KINGSMEN_SLUG = "kingsmen-resources";

// Today → Today's Market strip
export const MARKET = [
  { key: "GOLD", price: "$2,680", change: "+0.8%", up: true },
  { key: "SILVER", price: "$34.10", change: "+1.9%", up: true },
  { key: "COPPER", price: "$4.62", change: "−0.3%", up: false },
  { key: "URANIUM", price: "$85.50", change: "+0.5%", up: true },
  { key: "LITHIUM", price: "$13,900", change: "−1.2%", up: false },
];

// Peer companies shown across Today / Explore / Following.
// `logo` is a monogram tile spec (letters + colors) except Kingsmen, which
// uses its brand mark. `id === KINGSMEN_SLUG` is the one wired to Supabase.
export const COMPANIES = [
  {
    id: "kingsmen-resources",
    name: "Kingsmen Resources",
    exchange: "TSX.V",
    ticker: "KNG",
    commodities: ["Silver", "Gold"],
    location: "Chihuahua, Mexico",
    price: "C$0.21",
    change: "+4.2%",
    up: true,
    tag: "MOST FOLLOWED",
    verified: true,
    logo: { mono: "KR", bg: "#0f172a", fg: "#f59e0b", brand: true },
  },
  {
    id: "aurum-peak",
    name: "Aurum Peak Gold",
    exchange: "TSX.V",
    ticker: "AUP",
    commodities: ["Gold"],
    location: "Nevada, USA",
    price: "C$1.12",
    change: "+2.0%",
    up: true,
    tag: "MOST VIEWED",
    logo: { mono: "AP", bg: "#c99a3a", fg: "#fff" },
  },
  {
    id: "sierra-argent",
    name: "Sierra Argent Mining",
    exchange: "TSX.V",
    ticker: "AGX",
    commodities: ["Silver"],
    location: "Durango, Mexico",
    price: "C$0.38",
    change: "−1.1%",
    up: false,
    tag: "FASTEST GROWING",
    logo: { mono: "SA", bg: "#647089", fg: "#fff" },
  },
  {
    id: "cordillera-copper",
    name: "Cordillera Copper",
    exchange: "TSX.V",
    ticker: "CUP",
    commodities: ["Copper"],
    location: "Atacama, Chile",
    price: "C$0.74",
    change: "+0.5%",
    up: true,
    tag: "MOST SAVED",
    logo: { mono: "CC", bg: "#b0552f", fg: "#fff" },
  },
  {
    id: "salar-lithium",
    name: "Salar Lithium Corp",
    exchange: "TSX.V",
    ticker: "LIT",
    commodities: ["Lithium"],
    location: "Salta, Argentina",
    price: "C$0.29",
    change: "−2.4%",
    up: false,
    tag: "",
    logo: { mono: "SL", bg: "#3f9e8c", fg: "#fff" },
  },
];

export const byId = (id) => COMPANIES.find((c) => c.id === id);

// Today → Featured Update
export const FEATURED = {
  badge: "PASSPORT",
  title: "Kingsmen Resources is the most-followed explorer this week",
  source: "Passport Intelligence",
  time: "1h ago",
};

// Today → Latest Activity wire
export const ACTIVITY = [
  { kind: "COMPANY", who: "Kingsmen Resources", time: "2h", title: "Hole 14 completed at Las Coloradas", icon: "drill", verified: true },
  { kind: "MARKET", who: "Market Data", time: "3h", title: "Silver breaks US$34/oz as industrial and investment demand converge", icon: "market" },
  { kind: "COMPANY", who: "Aurum Peak Gold", time: "2d", title: "Closes C$6.0M bought deal", icon: "doc" },
  { kind: "INDUSTRY", who: "Industry Wire", time: "8h", title: "Mexico clarifies concession framework for junior explorers", icon: "globe" },
  { kind: "COMPANY", who: "Kingsmen Resources", time: "4d", title: "CEO site update from Las Coloradas", icon: "video", verified: true },
  { kind: "MARKET", who: "Market Data", time: "10h", title: "Gold holds near record as rate-cut bets firm up", icon: "market" },
];

// Explore → filter chips
export const EXPLORE_FILTERS = ["Trending", "Silver", "Gold", "Analysts", "Copper", "Drilling Now"];

// Profile tab
export const ACCOUNT = {
  name: "Retail Investor",
  meta: "Passport member · Junior mining",
  initials: "JJ",
  stats: [
    { value: "1", label: "FOLLOWING" },
    { value: "3", label: "ALERTS" },
    { value: "12", label: "CATALYSTS" },
  ],
  menu: [
    [
      { icon: "bell", title: "Notifications", sub: "Catalyst & company alerts" },
      { icon: "price", title: "Price Alerts", sub: "Target prices & moves" },
    ],
    [
      { icon: "wallet", title: "Holdings" },
      { icon: "search", title: "Saved Searches" },
      { icon: "scope", title: "Watchlists" },
    ],
    [
      { icon: "analytics", title: "Analytics", sub: "Coming soon" },
      { icon: "settings", title: "Settings" },
    ],
  ],
};
