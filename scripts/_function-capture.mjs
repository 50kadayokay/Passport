// Capture-on-apply for the production migration runner (S4's 2026-11-01 audit:
// four functions the pending files replace have drifted in production, so the
// repo rollbacks would restore the REPO's text, not production's).
//
// Before a file is applied, every function it creates, replaces, alters, drops
// or re-grants is read from production -- pg_get_functiondef, owner and ACL --
// and written to a gitignored file that puts exactly that back:
//   supabase/audit/results/apply-capture-<file>-<timestamp>.sql
//
// The parts (only writeCaptureFile touches the disk; the rest only the client handed in):
//   functionTargets(sql)     which signatures a file touches; fails CLOSED
//   captureFunctions(client) reads them in a READ ONLY transaction
//   formatCaptureRollback    the production-exact rollback (bodies verbatim)
//   readCapture              parses that file back (the round trip the tests check)
//   writeCaptureFile         writes it: gitignored dir only, mode 600, never overwrites
// Bodies are never printed. secretFindings() reports secret-like strings in a
// body by kind and count only.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export class CaptureAmbiguous extends Error {
  constructor(message) { super(message); this.name = "CaptureAmbiguous"; }
}
const ambiguous = (m) => { throw new CaptureAmbiguous(m); };
const md5 = (s) => crypto.createHash("md5").update(String(s), "utf8").digest("hex");

// ---- splitting a file into top-level statements ------------------------------------
/** Top-level statements, comments removed, quotes and dollar-quoted bodies kept
 *  intact (a `;` inside them does not split). Unterminated quoting refuses. */
export function topLevelStatements(sql) {
  const s = String(sql), out = [];
  let cur = "", i = 0;
  while (i < s.length) {
    const c = s[i], two = s.slice(i, i + 2);
    if (two === "--") { const j = s.indexOf("\n", i); i = j < 0 ? s.length : j; cur += " "; continue; }
    if (two === "/*") {
      let depth = 0, j = i;
      do {
        if (s.startsWith("/*", j)) { depth++; j += 2; } else if (s.startsWith("*/", j)) { depth--; j += 2; } else if (j >= s.length) ambiguous("unterminated /* comment */"); else j++;
      } while (depth > 0);
      i = j; cur += " "; continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      for (;;) {
        if (j >= s.length) ambiguous(`unterminated ${c === "'" ? "string" : "quoted identifier"}`);
        if (s[j] === c) { if (s[j + 1] === c) { j += 2; continue; } break; }
        j++;
      }
      cur += s.slice(i, j + 1); i = j + 1; continue;
    }
    if (c === "$") {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(s.slice(i));
      if (m && !/[A-Za-z0-9_]/.test(s[i - 1] || "")) {
        const end = s.indexOf(m[0], i + m[0].length);
        if (end < 0) ambiguous(`unterminated dollar quote ${m[0]}`);
        cur += s.slice(i, end + m[0].length); i = end + m[0].length; continue;
      }
    }
    if (c === ";") { if (cur.trim()) out.push(cur.trim()); cur = ""; i++; continue; }
    cur += c; i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// ---- signatures --------------------------------------------------------------------
const MULTIWORD = /^(double precision|character varying|bit varying|(timestamp|time) with(out)? time zone)(\s*\(\s*\d+\s*\))?(\s*\[\s*\])*$/;
const ONE_TYPE = /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?(\s*\(\s*\d+(\s*,\s*\d+)?\s*\))?(\s*\[\s*\])*$/;

/** Split on commas not inside parentheses. */
function splitTop(text) {
  const parts = []; let depth = 0, cur = "";
  for (const ch of text) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { parts.push(cur); cur = ""; } else cur += ch;
  }
  if (cur.trim() || parts.length) parts.push(cur);
  return parts.map((p) => p.trim());
}

/** One argument's TYPE, for the identity signature. Refuses anything it cannot
 *  be sure of: OUT / INOUT / VARIADIC, quoted names, %TYPE, unknown shapes. */
export function argType(arg) {
  let a = arg.replace(/\s+/g, " ").trim().toLowerCase();
  if (/["%]/.test(a)) ambiguous(`argument '${arg}': quoted names and %TYPE are not parsed`);
  a = a.split(/\s+default\s+|\s*=\s*/)[0].trim();
  let words = a.split(" ");
  if (words[0] === "in") words = words.slice(1);
  if (["out", "inout", "variadic"].includes(words[0])) ambiguous(`argument '${arg}': ${words[0].toUpperCase()} arguments are not parsed`);
  const whole = words.join(" "), rest = words.slice(1).join(" ");
  if (MULTIWORD.test(whole) || (words.length === 1 && ONE_TYPE.test(whole))) return whole.replace(/\s*\[\s*\]/g, "[]").replace(/\s*\(\s*/g, "(").replace(/\s*\)/g, ")");
  if (words.length >= 2 && /^[a-z_][a-z0-9_]*$/.test(words[0]) && (MULTIWORD.test(rest) || (words.length === 2 && ONE_TYPE.test(rest))))
    return rest.replace(/\s*\[\s*\]/g, "[]").replace(/\s*\(\s*/g, "(").replace(/\s*\)/g, ")");
  ambiguous(`argument '${arg}': cannot tell its name from its type`);
}

/** `schema.name(args)` at the start of `text` -> { sig, schema, name, types, rest }. */
function readSignature(text, where) {
  const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(/.exec(text);
  if (!m) ambiguous(`${where}: expected schema.name(arguments) -- unqualified or quoted function names are not parsed`);
  let depth = 1, j = m[0].length;
  for (; j < text.length && depth; j++) { if (text[j] === "(") depth++; if (text[j] === ")") depth--; }
  if (depth) ambiguous(`${where}: unbalanced parentheses in the argument list`);
  const inner = text.slice(m[0].length, j - 1).trim();
  const types = inner ? splitTop(inner).map(argType) : [];
  const schema = m[1].toLowerCase(), name = m[2].toLowerCase();
  return { sig: `${schema}.${name}(${types.join(", ")})`, schema, name, types, rest: text.slice(j).trim() };
}

/** A list of signatures (DROP FUNCTION a(..), b(..) / GRANT .. ON FUNCTION a(..), b(..)). */
function readSignatureList(text, where) {
  const sigs = []; let rest = text;
  for (;;) {
    const r = readSignature(rest, where); sigs.push(r); rest = r.rest;
    if (!rest.startsWith(",")) return { sigs, rest };
    rest = rest.slice(1).trim();
  }
}

/**
 * Every function signature a migration touches, in file order, deduplicated:
 *   [{ sig, schema, name, types, reasons: ["create or replace", "grant", ...] }]
 * Fails CLOSED (CaptureAmbiguous) on anything it cannot pin to an exact
 * signature: procedures and routines, unqualified or quoted names, OUT/VARIADIC
 * arguments, DROP .. CASCADE, ON ALL FUNCTIONS, and DO blocks that create,
 * alter or drop functions, or grant on functions they do not name literally.
 */
export function functionTargets(sql) {
  const found = new Map();
  const add = (r, reason) => {
    const t = found.get(r.sig) || { sig: r.sig, schema: r.schema, name: r.name, types: r.types, reasons: [] };
    if (!t.reasons.includes(reason)) t.reasons.push(reason);
    found.set(r.sig, t);
  };
  for (const raw of topLevelStatements(sql)) {
    const st = raw.replace(/\s+/g, " ");
    const head = st.slice(0, 200).toLowerCase();
    let m;
    if (/^create (or replace )?(procedure|aggregate)\b/.test(head) || /^(alter|drop) (procedure|routine|aggregate)\b/.test(head))
      ambiguous(`'${st.slice(0, 60)}...': procedures, routines and aggregates are not captured`);
    if ((m = /^create (or replace )?function /i.exec(st))) { add(readSignature(st.slice(m[0].length), "CREATE FUNCTION"), m[1] ? "create or replace" : "create"); continue; }
    if ((m = /^alter function /i.exec(st))) { add(readSignature(st.slice(m[0].length), "ALTER FUNCTION"), "alter"); continue; }
    if ((m = /^drop function (if exists )?/i.exec(st))) {
      const { sigs, rest } = readSignatureList(st.slice(m[0].length), "DROP FUNCTION");
      if (/\bcascade\b/i.test(rest)) ambiguous(`DROP FUNCTION ... CASCADE drops whatever depends on it; not captured`);
      for (const r of sigs) add(r, "drop"); continue;
    }
    if (/^(grant|revoke) /i.test(st) && /\bon (all )?(functions|function|routines?|procedures?)\b/i.test(st)) {
      if (/\bon (all functions|all routines|all procedures|routines?|procedures?)\b/i.test(st)) ambiguous(`'${st.slice(0, 70)}...': only ON FUNCTION <signature> is captured`);
      const at = /\bon function /i.exec(st);
      for (const r of readSignatureList(st.slice(at.index + at[0].length), `${st.slice(0, 6).toUpperCase().trim()} ON FUNCTION`).sigs) add(r, st.slice(0, 6).toLowerCase().trim());
      continue;
    }
    if (/^do\b/i.test(st)) {
      const body = st;
      if (/\b(create|alter|drop)\s+(or\s+replace\s+)?(function|procedure|routine)\b/i.test(body)) ambiguous("a DO block creates, alters or drops a function dynamically; not captured");
      if (/\bon\s+(all\s+)?(function|functions|routine|procedure)\b/i.test(body)) {
        const literals = [...body.matchAll(/'([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*\s*\([^')]*\))'/gi)].map((x) => x[1]);
        if (!literals.length || /\bon\s+all\s+functions\b/i.test(body)) ambiguous("a DO block grants or revokes on functions it does not name literally; not captured");
        for (const l of literals) add(readSignature(l, "DO block literal"), "dynamic grant");
      }
    }
  }
  return [...found.values()];
}

// ---- reading production -------------------------------------------------------------
const Q = {
  types: `/* capture:types */ select t, to_regtype(t) is not null ok from unnest($1::text[]) t`,
  resolve: `/* capture:resolve */ select to_regprocedure($1)::oid::bigint oid`,
  fn: `/* capture:function */ select p.oid::regprocedure::text ident, pg_get_functiondef(p.oid) def, pg_get_userbyid(p.proowner) owner, p.prokind::text kind, p.proacl is null acl_default
         from pg_proc p where p.oid = $1::oid`,
  acl: `/* capture:acl */ select case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end grantee, a.privilege_type privilege, a.is_grantable grantable
          from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where p.oid = $1::oid`,
  overloads: `/* capture:overloads */ select p.oid::regprocedure::text ident from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = $1 and p.proname = $2 order by 1`,
};
export const CAPTURE_QUERIES = Q;
const aclKey = (rows) => rows.map((r) => `${r.grantee}:${r.privilege}:${r.grantable ? "g" : "-"}`).sort();

async function readOne(client, t) {
  const types = (await client.query(Q.types, [t.types])).rows;
  const bad = types.filter((r) => !r.ok).map((r) => r.t);
  if (bad.length) ambiguous(`${t.sig}: production does not know the type(s) ${bad.join(", ")} -- cannot tell 'absent' from 'misparsed'`);
  const oid = (await client.query(Q.resolve, [t.sig])).rows[0]?.oid ?? null;
  const overloads = (await client.query(Q.overloads, [t.schema, t.name])).rows.map((r) => r.ident);
  if (oid == null) return { ...t, existed: false, overloads };
  const f = (await client.query(Q.fn, [oid])).rows[0];
  if (!f) ambiguous(`${t.sig}: resolved, then not found`);
  if (f.kind !== "f") ambiguous(`${t.sig}: prokind '${f.kind}' is not a plain function`);
  const acl = (await client.query(Q.acl, [oid])).rows.map((r) => ({ grantee: r.grantee, privilege: r.privilege, grantable: !!r.grantable }));
  return { ...t, existed: true, ident: f.ident, def: f.def, defMd5: md5(f.def), owner: f.owner, aclDefault: !!f.acl_default, acl, aclKey: aclKey(acl), overloads };
}

/** Read every target in ONE read-only transaction. */
export async function captureFunctions(client, targets) {
  await client.query("begin read only");
  try {
    const out = [];
    for (const t of targets) {
      const c = await readOne(client, t);
      // Two spellings of one signature (timestamptz / timestamp with time zone) are one function.
      const same = c.existed && out.find((x) => x.existed && x.ident === c.ident);
      if (same) { for (const r of c.reasons) if (!same.reasons.includes(r)) same.reasons.push(r); continue; }
      out.push(c);
    }
    return out;
  } finally {
    await client.query("rollback");
  }
}

/** Inside the migration's transaction, before its body: production must still
 *  hold exactly what was captured (nothing changed between capture and apply). */
export async function verifyCaptureUnchanged(client, captured) {
  const now = [];
  for (const c of captured) now.push(await readOne(client, c));
  for (let i = 0; i < captured.length; i++) {
    const a = captured[i], b = now[i];
    if (a.existed !== b.existed || (a.existed && (a.defMd5 !== b.defMd5 || a.owner !== b.owner || a.aclKey.join() !== b.aclKey.join())))
      throw new Error(`${a.sig} changed between the capture and the apply; rolled back, nothing applied`);
  }
}

// ---- secret-like strings ----------------------------------------------------------
const SECRETS = [
  ["jwt", /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g],
  ["stripe key", /\b(sk|rk)_(live|test)_[A-Za-z0-9]{10,}/g],
  ["webhook secret", /\bwhsec_[A-Za-z0-9]{10,}/g],
  ["supabase secret key", /\bsb_secret_[A-Za-z0-9_-]{10,}/g],
  ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
  ["connection string with password", /\bpostgres(?:ql)?:\/\/[^\s:/@]+:[^\s@]+@/gi],
  ["aws key", /\bAKIA[0-9A-Z]{16}\b/g],
  ["github token", /\bgh[pousr]_[A-Za-z0-9]{20,}/g],
  ["slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/g],
  ["provider api key", /\bsk-(ant-)?[A-Za-z0-9_-]{20,}/g],
  ["assigned secret", /\b(api[_-]?key|secret|password|passwd|token|bearer)\b\s*(:=|=|:)\s*'[^'\s]{12,}'/gi],
];
/** [{ kind, count }] -- never the values. */
export function secretFindings(text) {
  const out = [];
  for (const [kind, re] of SECRETS) { const n = (String(text).match(re) || []).length; if (n) out.push({ kind, count: n }); }
  return out;
}

// ---- the rollback file -------------------------------------------------------------
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const grantee = (g) => (g === "PUBLIC" ? "public" : g);
const BEGIN_MARK = (n, ident) => `-- >>> captured definition ${n}: ${ident}`;
const END_MARK = (n) => `-- <<< end of captured definition ${n}`;

/**
 * The production-exact rollback for what was captured. Restores, for every
 * function that EXISTED before the file ran: its definition (create or
 * replace, verbatim from pg_get_functiondef) and its ACL (every current grant
 * revoked, then the captured grants). Functions that did not exist are listed,
 * not dropped: the file's repo rollback removes them. Ends by checking each
 * restored function against the captured md5 and ACL, raising if any differs.
 */
export function formatCaptureRollback(captured, meta) {
  const existed = captured.filter((c) => c.existed), absent = captured.filter((c) => !c.existed);
  const manifest = {
    file: meta.file, sha256: meta.sha256, ref: meta.ref, captured_at: meta.at,
    functions: captured.map((c) => (c.existed
      ? { sig: c.sig, ident: c.ident, existed: true, def_md5: c.defMd5, owner: c.owner, acl_default: c.aclDefault, acl: c.acl, overloads: c.overloads }
      : { sig: c.sig, existed: false, overloads: c.overloads })),
  };
  const L = [];
  L.push(`-- PRODUCTION-EXACT ROLLBACK, captured from ${meta.ref} at ${meta.at}`);
  L.push(`-- immediately BEFORE ${meta.file} (sha256 ${meta.sha256}) was applied, by scripts/apply-migrations-production.mjs.`);
  L.push(`-- LOCAL ONLY (supabase/audit/results/ is gitignored). It holds production's function bodies verbatim: never commit or paste it.`);
  L.push(`--`);
  L.push(`-- Use: run the repo rollback (supabase/rollbacks/${meta.file.replace(/\.sql$/, ".rollback.sql")}) first, then this file, to put back`);
  L.push(`-- production's own definitions and grants where they had drifted from the repo. Review it before running.`);
  L.push(`-- ${existed.length} function(s) restored; ${absent.length} did not exist before the file and are left to the repo rollback.`);
  L.push(`-- A changed return type or argument name makes CREATE OR REPLACE fail loudly here; that function then needs a reviewed DROP first.`);
  L.push(`-- capture-manifest: ${JSON.stringify(manifest)}`);
  L.push("");
  for (const c of absent) {
    L.push(`-- did not exist before ${meta.file}: ${c.sig}${c.overloads.length ? `   (other overloads then: ${c.overloads.join("; ")})` : ""}`);
  }
  if (absent.length) L.push("");
  L.push("begin;");
  L.push("");
  existed.forEach((c, i) => {
    L.push(BEGIN_MARK(i + 1, c.ident));
    L.push(`-- owner ${c.owner}; md5 ${c.defMd5}; touched by the file as: ${c.reasons.join(", ")}`);
    L.push(c.def.replace(/\s+$/, "") + ";");
    L.push(END_MARK(i + 1));
    L.push("");
  });
  if (existed.length) {
    L.push("-- grants: revoke whatever is there now, then restore what was captured");
    L.push("do $capture_acl$");
    L.push("declare r record;");
    L.push("begin");
    L.push("  for r in");
    L.push("    select p.oid::regprocedure fn, case when a.grantee = 0 then 'public' else a.grantee::regrole::text end who");
    L.push("      from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a");
    L.push(`     where p.oid = any (array[${existed.map((c) => `${lit(c.ident)}::regprocedure`).join(", ")}]::oid[])`);
    L.push("  loop");
    L.push("    execute format('revoke all on function %s from %s', r.fn, r.who);");
    L.push("  end loop;");
    L.push("end $capture_acl$;");
    for (const c of existed) for (const a of c.acl) {
      L.push(`grant ${a.privilege.toLowerCase()} on function ${c.ident} to ${grantee(a.grantee)}${a.grantable ? " with grant option" : ""};`);
    }
    L.push("");
    L.push("-- check: every restored function matches the capture, or nothing is committed");
    L.push("do $capture_verify$");
    L.push("begin");
    for (const c of existed) {
      L.push(`  if md5(pg_get_functiondef(${lit(c.ident)}::regprocedure)) <> ${lit(c.defMd5)}`);
      L.push(`     or (select string_agg((case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end) || ':' || a.privilege_type || ':' || case when a.is_grantable then 'g' else '-' end, ',' order by 1 collate "C")`);
      L.push(`           from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where p.oid = ${lit(c.ident)}::regprocedure) is distinct from ${lit(c.aclKey.join(","))}`);
      L.push(`     or (select pg_get_userbyid(proowner) from pg_proc where oid = ${lit(c.ident)}::regprocedure) <> ${lit(c.owner)} then`);
      L.push(`    raise exception 'capture rollback: % does not match the capture', ${lit(c.ident)};`);
      L.push("  end if;");
    }
    L.push("end $capture_verify$;");
    L.push("");
  }
  L.push("commit;");
  return L.join("\n") + "\n";
}

/** Parse a capture rollback back into { manifest, defs: { ident: def } }; every
 *  def's md5 must equal the manifest's. */
export function readCapture(text) {
  const line = String(text).split("\n").find((l) => l.startsWith("-- capture-manifest: "));
  if (!line) throw new Error("not a capture file: no capture-manifest line");
  const manifest = JSON.parse(line.slice("-- capture-manifest: ".length));
  const defs = {};
  manifest.functions.filter((f) => f.existed).forEach((f, i) => {
    const b = text.indexOf(BEGIN_MARK(i + 1, f.ident) + "\n"), e = text.indexOf("\n" + END_MARK(i + 1));
    if (b < 0 || e < b) throw new Error(`capture file: definition ${i + 1} (${f.ident}) is missing`);
    const block = text.slice(b + BEGIN_MARK(i + 1, f.ident).length + 1, e).split("\n").slice(1).join("\n").replace(/;$/, "");
    if (md5(block) !== f.def_md5 && md5(block + "\n") !== f.def_md5) throw new Error(`capture file: definition ${i + 1} (${f.ident}) does not match its md5`);
    defs[f.ident] = block;
  });
  return { manifest, defs };
}

export const captureFileName = (file, at) => `apply-capture-${file.replace(/\.sql$/, "")}-${at.replace(/[:.]/g, "-")}.sql`;

export const CAPTURE_DIR = "supabase/audit/results";
/** True when git ignores `p` (so the capture can never be committed by accident). */
export const gitIgnores = (p) => spawnSync("git", ["check-ignore", "-q", "--no-index", p], { encoding: "utf8" }).status === 0;

/**
 * Write the capture rollback. Refuses (throws) unless the directory is
 * gitignored; creates the file 0600 and never overwrites one. Prints, through
 * `say`, only paths, counts and secret KINDS -- never a body or a secret.
 * Returns { path, sha256 }.
 */
export function writeCaptureFile(captured, meta, { dir = CAPTURE_DIR, say = () => {}, isIgnored = gitIgnores } = {}) {
  const file = path.join(dir, captureFileName(meta.file, meta.at));
  if (!isIgnored(file)) throw new Error(`${dir} is not gitignored; refusing to write production's function bodies where they could be committed`);
  const text = formatCaptureRollback(captured, meta);
  readCapture(text);   // round-trips, or nothing is written
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const fd = fs.openSync(file, "wx", 0o600);
  try { fs.writeSync(fd, text); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  for (const c of captured.filter((x) => x.existed)) {
    const f = secretFindings(c.def);
    if (f.length) say(`   capture: ${c.ident} holds secret-like string(s) (${f.map((x) => `${x.kind} x${x.count}`).join(", ")}); kept in the file, not shown here`);
  }
  return { path: file, sha256: crypto.createHash("sha256").update(text).digest("hex") };
}
