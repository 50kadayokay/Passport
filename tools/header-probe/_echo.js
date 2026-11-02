// The one piece of logic both probe functions share: given the headers a request
// arrived with, report the ones that decide "which host" and "which client".
//
// SAFE BY CONSTRUCTION
//   • reads no environment variable, holds no secret, makes no outbound call;
//   • imports nothing (no node: modules, no MineEx code);
//   • echoes only the forwarding headers below plus header NAMES -- never the
//     value of anything that could be a credential (cookies, authorization,
//     Vercel's protection-bypass headers), so a caller learns nothing it did
//     not already send, apart from what the platform added.

export const FORWARDING_HEADERS = [
  "host",
  "x-forwarded-host",
  "x-forwarded-for",
  "x-forwarded-proto",
  "x-forwarded-port",
  "x-real-ip",
  "x-vercel-forwarded-for",
  "x-vercel-deployment-url",
  "x-vercel-ip-country",
  "forwarded",
  "x-client-ip",
  "cf-connecting-ip",
  "true-client-ip",
];

const NEVER_ECHO = /^(cookie|authorization|proxy-authorization|x-vercel-protection-bypass|x-vercel-set-bypass-cookie|x-vercel-oidc-token)$/i;

/** headers: a plain lowercase-keyed object. */
export function describe(runtime, headers, extra = {}) {
  const forwarding = {};
  for (const h of FORWARDING_HEADERS) if (headers[h] !== undefined) forwarding[h] = String(headers[h]).slice(0, 300);
  return {
    probe: "mineex-header-probe",
    runtime,
    forwarding,
    headerNames: Object.keys(headers).filter((k) => !NEVER_ECHO.test(k)).sort(),
    withheld: Object.keys(headers).filter((k) => NEVER_ECHO.test(k)).sort(),
    ...extra,
  };
}
