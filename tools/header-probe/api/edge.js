// Edge runtime probe -- the runtime og-news uses. Same report as node.js, minus
// the socket address, which the Edge runtime does not expose. See ../README.md.
import { describe } from "../_echo.js";

export const config = { runtime: "edge" };

export default function handler(request) {
  const headers = {};
  request.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
  const body = describe("edge", headers, { method: request.method, path: new URL(request.url).pathname });
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
