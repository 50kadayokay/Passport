// Node runtime probe. Reports which forwarding headers reached the function and
// the socket address Vercel's proxy connected from. See ../README.md.
import { describe } from "../_echo.js";

export default function handler(req, res) {
  const headers = Object.fromEntries(Object.entries(req.headers || {}).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v.join(", ") : v]));
  const body = describe("node", headers, {
    method: req.method,
    path: String(req.url || "").split("?")[0],
    socketRemoteAddress: (req.socket && req.socket.remoteAddress) || null,
  });
  res.setHeader("cache-control", "no-store");
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.statusCode = 200;
  res.end(JSON.stringify(body));
}
