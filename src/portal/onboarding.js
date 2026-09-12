// onboarding.js — Phase 6B. The company onboarding "state" is DERIVED from real company/
// profile/entitlement data, not a persisted state machine. This keeps it self-correcting
// (resumes wherever the data actually is) and — importantly — does NOT assume the profile was
// pre-populated before invitation. It supports two population paths:
//   • CONCIERGE (prebuilt): profile already has content → "Your investor profile is ready."
//   • FUTURE AUTOMATED (Phase 7): profile is empty → the profile/projects steps guide the owner
//     to complete it (today via the editor; Phase 7 will attach an automated "Build my profile"
//     action to the same `profileState:'empty'` fork — this file already distinguishes it).
// No fake/extraction UI is created here — only the state fork that a later phase plugs into.
import { computeHealth } from "./health.js";

// The current MineEx company agreement version. Bump when the legal text changes; the acceptance
// row is keyed on it. Grandfather rows (version 'grandfathered-pre-6b') also satisfy the gate.
export const AGREEMENT_VERSION = "2026-09-01";

const has = (v) => v != null && String(v).trim() !== "";

// Is the canonical profile populated enough to look like a real investor profile?
// 'ready' → concierge/automated build has produced content. 'empty' → nothing meaningful yet.
export function profileState(pp = {}) {
  const co = pp.COMPANY || {};
  const pf = pp.PROJECTS_FULL || {};
  const richProject = Object.values(pf).some((p) => p && (p.content || (Array.isArray(p.snap) && p.snap.length) || (Array.isArray(p.cards) && p.cards.length)));
  const hasNarrative = has(pp.ONE_LINER) || (Array.isArray(pp.THESIS) && pp.THESIS.length > 0) || (Array.isArray(pp.BRIEF_SECTIONS) && pp.BRIEF_SECTIONS.length > 0);
  const ready = has(co.name) && (richProject || hasNarrative);
  return ready ? "ready" : "empty";
}

// Derive the whole onboarding view-model. `entitled` = the company has portal access (from the
// existing entitlement/subscription system). `agreementAccepted` = a company_has_agreement result.
// `profile` is the canonical profile (for computeHealth); `pp` is profile.pp.
export function deriveOnboarding({ company = {}, profile = {}, pp = {}, entitled = false, agreementAccepted = false, stats = {} }) {
  const isLive = company.status === "published";
  const pstate = profileState(pp);
  const health = computeHealth(profile, stats);
  const nameOk = has((pp.COMPANY || {}).name) || has(company.name);

  // Step model — each derived from real data. `action` tells the Home which existing surface to open.
  const steps = [
    { key: "agreement", title: "Accept the company agreement", action: "agreement", done: agreementAccepted },
    { key: "plan",      title: "Confirm your plan",             action: "billing",   done: entitled },
    {
      key: "profile",
      // Copy forks on whether a profile was prebuilt for them or still needs building.
      title: pstate === "ready" ? "Review your company profile" : "Complete your company profile",
      action: "profile",
      done: nameOk && (pstate === "ready" || health.pct >= 40),
    },
    {
      key: "projects",
      title: pstate === "ready" ? "Review your projects" : "Add your projects",
      action: "projects",
      done: Object.keys(pp.PROJECTS_FULL || {}).length > 0,
    },
    { key: "preview", title: "Preview your investor profile", action: "preview", done: false /* momentary action, never "done" */ },
    { key: "golive",  title: "Go live on MineEx",             action: "golive",  done: isLive },
  ];

  // Go-Live is unlockable once the security/quality gates the RPC enforces are met client-side too.
  const canGoLive = agreementAccepted && entitled && nameOk;
  const requiredDone = agreementAccepted && entitled;   // agreement + plan are the hard gates

  return {
    isLive,
    profileState: pstate,          // 'ready' (concierge/automated) | 'empty' (needs building)
    agreementAccepted,
    entitled,
    healthPct: health.pct,
    steps,
    canGoLive,
    requiredDone,
    // Onboarding UI shows until the company is live. After go-live, Home reverts to the normal
    // control-center (health score continues as ongoing guidance).
    showOnboarding: !isLive,
    // Headline fork: prebuilt vs. needs-building.
    headline: pstate === "ready" ? "Your investor profile is ready." : "Let's build your investor profile.",
    subhead: pstate === "ready"
      ? "We've already populated your company and project information. Review it, make any changes, and publish when you're ready."
      : "Add your company and project details below. Review, preview, and publish when you're ready.",
  };
}
