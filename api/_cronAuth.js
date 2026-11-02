// Trusted scheduler authentication for /api/dispatch (D22 Phase 3).
//
// VERCEL CRON sends a GET with `Authorization: Bearer <CRON_SECRET>` when the
// project has a CRON_SECRET (Vercel docs, "Securing cron jobs"). That header is
// the ONLY thing that authenticates a scheduled run: never the user agent, never
// x-vercel-cron-schedule (both are client-settable).
//
//   * The secret must be configured and at least CRON_SECRET_MIN characters;
//     unset or short is a refusal, not an open door (fail closed).
//   * Compared in constant time.
//   * On STAGING the production name CRON_SECRET is forbidden outright
//     (api/_stagingEnv.js), so a production secret can never be loaded there;
//     staging uses STAGING_CRON_SECRET instead.
//
// HEALTH (for an external uptime monitor) uses a SEPARATE token,
// DISPATCH_HEALTH_TOKEN: a monitoring service holding it can read liveness but
// cannot trigger a dispatch run.

import crypto from "node:crypto";
import { IS_STAGING } from "./_stagingEnv.js";

export const CRON_SECRET_MIN = 16;

function bearerOf(req) {
  const h = (req && req.headers) || {};
  const m = /^Bearer\s+(.+)$/.exec(String(h.authorization || h.Authorization || "").trim());
  return m ? m[1] : "";
}

function equal(got, want) {
  const a = Buffer.from(String(got), "utf8"), b = Buffer.from(String(want), "utf8");
  // Compare b with itself when the lengths differ, so the work stays constant.
  return crypto.timingSafeEqual(a.length === b.length ? a : b, b) && a.length === b.length;
}

export function cronSecret() {
  return String((IS_STAGING ? process.env.STAGING_CRON_SECRET : process.env.CRON_SECRET) || "");
}

/** Is this request a genuine scheduled run? */
export function isTrustedCron(req) {
  const want = cronSecret();
  if (want.length < CRON_SECRET_MIN) return false;
  const got = bearerOf(req);
  return !!got && equal(got, want);
}

/** May this request read dispatcher health? */
export function isHealthReader(req) {
  const want = String(process.env.DISPATCH_HEALTH_TOKEN || "");
  if (want.length < CRON_SECRET_MIN) return false;
  const got = bearerOf(req);
  return !!got && equal(got, want);
}
