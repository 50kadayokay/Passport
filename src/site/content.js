// Marketing content — centralized so it can later be moved into a Supabase
// table and edited from Mission Control (CMS). Nothing here is hardcoded deep
// in components; every page reads from this module.

export const NAV_LINKS = [
  { label: "Features", href: "/features" },
  { label: "Pricing", href: "/pricing" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

export const HERO = {
  eyebrow: "Passport for Mining",
  headline: "The operating system for modern mining companies.",
  sub: "Turn dense filings into a living, mobile-first investor profile — built in minutes, published to an app where retail investors discover, follow, and track you.",
  primary: { label: "Start free trial", href: "/signup?type=company" },
  secondary: { label: "Book a demo", href: "/demo" },
};

export const FEATURES = [
  { title: "Company Profiles", body: "A premium, always-current profile that replaces your clunky IR page and the “email me the deck” dance." },
  { title: "Investor App", body: "Retail investors discover, follow, and track juniors in a modern app — your story, where the audience actually is." },
  { title: "AI Company Briefs", body: "Your technical story translated to “explain it in 60 seconds” — the plain-English read investors actually finish." },
  { title: "Interactive Timelines", body: "Milestones and catalysts laid out visually, so momentum is obvious at a glance." },
  { title: "Project Pages", body: "Snapshot, stage, and technical intelligence per project — structured, scannable, investor-ready." },
  { title: "Capital Structure", body: "Share structure, financing, and ownership in a clean snapshot — the numbers investors ask for first." },
  { title: "QR Codes", body: "Print it for the booth. Investors scan → full profile → follow → app install. Your cheapest growth loop." },
  { title: "Company Analytics", body: "See what investors actually read across every channel you already share — intel you’ve never had." },
];

export const PLANS = [
  {
    id: "starter", name: "Starter", tagline: "Get your Passport live.",
    monthly: 149, annual: 119,
    features: ["Company profile + AI Brief", "Investor-app listing", "Booth QR code", "Basic analytics", "Email support"],
    cta: { label: "Start free trial", href: "/signup?type=company&plan=starter" },
  },
  {
    id: "pro", name: "Professional", tagline: "Reach and measure your audience.", recommended: true,
    monthly: 449, annual: 359,
    features: ["Everything in Starter", "Follower analytics (private)", "Notify-followers push", "Smart-link tracking", "Featured placement credits", "Priority support"],
    cta: { label: "Start free trial", href: "/signup?type=company&plan=pro" },
  },
  {
    id: "enterprise", name: "Enterprise", tagline: "For issuers who go all-in.",
    monthly: null, annual: null,
    features: ["Everything in Professional", "Dedicated onboarding", "Multi-project portfolios", "Custom campaigns", "API access", "Dedicated manager"],
    cta: { label: "Book a demo", href: "/demo" },
  },
];

export const FAQ = [
  { q: "What is Passport?", a: "A platform that turns a mining company’s story into a living, mobile-first investor profile, and puts it in front of retail investors in a discovery app." },
  { q: "Do I need to talk to sales to get started?", a: "No. Start a free trial, onboard yourself in minutes, and publish your profile live — no calls required." },
  { q: "How does onboarding work?", a: "You enter your details and upload your materials, review each section, approve, and publish. Your profile goes live on the investor app instantly." },
  { q: "Can I edit my profile after publishing?", a: "Yes — log back in any time to update your status, projects, capital, and more. Changes publish live." },
  { q: "How do investors find my company?", a: "Through the Passport investor app’s discovery feeds and your own booth QR code and shareable profile link." },
];

export const CONTACT = {
  sales: "sales@passport.example",
  support: "support@passport.example",
  linkedin: "https://linkedin.com",
  x: "https://x.com",
};
