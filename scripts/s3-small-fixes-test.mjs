// S3 follow-ups for S4 (offline): listDocuments reports failure, AuthGate's
// admin check never hangs or mislabels a failed check, DesktopOnly names the
// portal, DeliveryOps names S2's listeners.
//   node scripts/s3-small-fixes-test.mjs
import fs from "node:fs";
import { installBrowserGlobals, installFetch, signIn, loadBundle, json, reporter, STUB_SB } from "./_portal-offline.mjs";

const { ok, section, done } = reporter("s3-small-fixes");
installBrowserGlobals();
let mode = "ok";
installFetch(async (req) => {
  if (req.url.origin !== STUB_SB) return undefined;
  if (mode === "down") throw new TypeError("fetch failed");
  if (mode === "500") return json({ message: "boom" }, 500);
  if (mode === "junk") return new Response("<html>", { status: 200 });
  if (req.url.pathname === "/rest/v1/documents") return json(mode === "empty" ? [] : [{ id: "d1", filename: "a.pdf", extracted_text: "  text " }, null, { nope: 1 }]);
  if (req.url.pathname === "/rest/v1/profiles") return json([{ role: "admin" }]);
  return undefined;
});
const M = await loadBundle("smallfixes", `
  export { listDocuments } from "./src/lib/memory.js";
  export { loadPlatformRole } from "./src/lib/portalGate.js";
`);
signIn({ id: "u-1", email: "a@stub.invalid" });

section("memory.js listDocuments");
{
  const rows = await M.listDocuments("c1");
  ok(rows.length === 1 && rows[0].hasText && rows[0].textPreview === "  text " && rows[0].extracted_text === undefined, "rows mapped as before; malformed rows dropped");
  mode = "empty"; ok((await M.listDocuments("c1")).length === 0, "no documents -> [] (only case that is empty)");
  ok((await M.listDocuments("")).length === 0, "no company id -> []");
  for (const m of ["down", "500", "junk"]) {
    mode = m; let e = null;
    try { await M.listDocuments("c1"); } catch (x) { e = x; }
    ok(e && e.code === "documents_unavailable" && /Couldn't load your documents/.test(e.message), `${m}: throws documents_unavailable (was: [] -> "No documents yet")`);
  }
  mode = "ok";
  const callers = { "src/portal/Documents.jsx": /listDocuments\(companyId\)\s*\.then\([^)]*\)[^]*?\.catch\(\(\) => \{ setLoadErr\(true\)/, "src/console/CompanyMemory.jsx": /listDocuments\(companyId\)\.then\(setDocs\)\.catch\(/, "src/lib/mineiq.js": /listDocuments\(companyId\)\.catch\(/ };
  for (const [f, re] of Object.entries(callers)) ok(re.test(fs.readFileSync(f, "utf8")), `caller ${f} handles the throw`);
  const users = fs.readFileSync("src/lib/memory.js", "utf8").match(/listDocuments\(/g).length;
  ok(users === 1, "memory.js itself does not call listDocuments (no hidden caller)");
}

section("AuthGate requireAdmin");
{
  const ag = fs.readFileSync("src/auth/AuthGate.jsx", "utf8");
  ok(/loadPlatformRole\(\)\s*\.then\(\(r\) => \{ if \(alive\) setRole\(r\.ok \? \(r\.role \|\| "company"\) : "error"\); \}\)\s*\.catch\(\(\) => \{ if \(alive\) setRole\("error"\); \}\)/.test(ag), "a failed or thrown check -> 'error', never a forever-loader or 'Admins only'");
  ok(/role === "error"/.test(ag) && /Couldn't check access/.test(ag) && /setAttempt\(\(a\) => a \+ 1\)/.test(ag) && /\[signedIn, requireAdmin, attempt\]/.test(ag), "error screen: 'Couldn't check access' with Retry that re-runs the check");
  ok(/if \(role !== "admin"\)/.test(ag) && /Admins only/.test(ag), "a real non-admin answer still gets 'Admins only'");
  mode = "ok"; ok((await M.loadPlatformRole()).role === "admin", "loadPlatformRole: admin");
  mode = "500"; ok((await M.loadPlatformRole()).ok === false, "loadPlatformRole: 5xx -> not ok (getMyRole answered null -> 'Admins only' for a real admin)");
  mode = "down"; ok((await M.loadPlatformRole()).ok === false, "loadPlatformRole: offline -> not ok (getMyRole threw -> loader forever)");
  mode = "ok";
}

section("DesktopOnly / DeliveryOps");
{
  const main = fs.readFileSync("src/main.jsx", "utf8");
  ok(/function DesktopOnly\(\{ children, title = "Onboarding is a desktop tool"/.test(main) && /\{title\}<\/h1>/.test(main), "DesktopOnly takes a title; onboarding keeps its old copy by default");
  ok(/isPortal \? \(\s*<DesktopOnly title="The Company Portal is a desktop tool"/.test(main), "/portal says 'The Company Portal is a desktop tool'");
  const d = fs.readFileSync("src/admin/DeliveryOps.jsx", "utf8");
  ok(/site_content_v1: "Company website", conference_content_v1: "Conference booth"/.test(d), "DeliveryOps names site_content_v1 and conference_content_v1");
}
done();
