#!/usr/bin/env python3
"""Parse migration SQL against the real PostgreSQL grammar.

    python3 scripts/sql-parse-check.py supabase/migrations/0065a_*.sql
    python3 scripts/sql-parse-check.py            # every migration

WHY THIS EXISTS
---------------
There is no local Postgres on this machine, so a migration's first contact with
a parser was the production SQL editor. A syntax error there is discovered half
way through a transaction. This checks three layers without a database:

  1. the file's top-level grammar (CREATE FUNCTION, CREATE INDEX, GRANT, ...)
  2. each plpgsql function body's block structure, under its own declared
     header (a `language sql` body is not plpgsql; a trigger body cannot be
     round-tripped by pglast, and layer 1 covers both)
  3. each `return query <SQL>;` as standalone SQL -- the layer that matters
     most, because a $$-quoted body is an opaque string to layer 1 and a
     mistake inside it parses perfectly there

WHAT IT CANNOT DO
-----------------
It is a parser, not a planner and not a database. It does not know whether a
column exists, whether a type is assignable to the declared return table,
whether a policy admits a row, or what a query returns. A file that passes here
can still fail on the first row it touches. Applying to an isolated database is
the only thing that answers those questions.

Requires `pglast` (pip install pglast). Without it this prints SKIP and exits 0,
because a check that silently did not run must not look like a check that passed.
"""
import re, sys, glob

try:
    import pglast
    from pglast import parser
except ImportError:
    print("  SKIP  sql-parse-check: pglast is not installed (pip install pglast).")
    print("        The SQL in supabase/migrations was NOT parsed by this run.")
    sys.exit(0)

paths = sys.argv[1:] or sorted(glob.glob("supabase/migrations/*.sql"))
failures = []

def strip_comments(text):
    return "\n".join(re.sub(r"--.*$", "", line) for line in text.splitlines())

for path in paths:
    src = open(path).read()
    label = path.split("/")[-1]

    try:
        stmts = parser.parse_sql(src)
    except Exception as e:
        failures.append(f"{label}: top-level grammar: {e}")
        print(f"  FAIL  {label}  top-level: {e}")
        continue

    # Only LIVE definitions. A rollback block is commented out, so its bodies
    # reduce to nothing and would otherwise report a bogus syntax error.
    live = strip_comments(src)
    # Capture the header with each body, because how a body must be checked
    # depends on it: a `language sql` body is not plpgsql at all, and a trigger
    # function's `new` record only exists when the function returns trigger.
    # Wrapping everything as a plain plpgsql function reported 56 false
    # failures across migrations that have all run in production for months.
    fns = re.findall(
        r"create or replace function public\.(\w+)\s*\([\s\S]*?\)\s*"
        r"(returns[\s\S]*?)\bas \$\$([\s\S]*?)\$\$;", live)
    bodies = [b for _, _, b in fns]
    checked = 0

    for name, header, body in fns:
        head = " ".join(header.split())
        if "language plpgsql" not in head.lower():
            continue   # a `language sql` body is checked as SQL by layer 1
        if re.search(r"returns\s+trigger", head, re.I):
            continue   # pglast cannot round-trip a trigger body; layer 1 has it
        # The declared header, verbatim. Substituting a guess for it is what
        # produced the earlier false failures: forcing `setof record` onto a
        # function that returns jsonb makes its every `return x;` illegal.
        wrapped = (f"create or replace function public.{name}() {head} as $$ {body} $$")
        try:
            pglast.parse_plpgsql(wrapped)
        except Exception as e:
            failures.append(f"{label}: {name}: plpgsql: {e}")
            print(f"  FAIL  {label}  {name}  plpgsql: {e}")
            continue

        for m in re.finditer(r"\breturn query\b", body):
            i, depth = m.end(), 0
            while i < len(body):
                c = body[i]
                if c == "(": depth += 1
                elif c == ")": depth -= 1
                elif c == ";" and depth == 0: break
                i += 1
            query = body[m.end():i].strip()
            try:
                parser.parse_sql(query)
                checked += 1
            except Exception as e:
                failures.append(f"{label}: {name}: return query: {e}")
                print(f"  FAIL  {label}  {name}  return query: {e}")

    print(f"  ok    {label}  {len(stmts)} statements, "
          f"{len(bodies)} function bod{'y' if len(bodies) == 1 else 'ies'}, "
          f"{checked} embedded quer{'y' if checked == 1 else 'ies'}")

print(f"\n  {len(paths)} file(s) parsed, {len(failures)} failure(s)")
print("  A pass here is a grammar pass only -- not a proof the SQL is correct.\n")
sys.exit(1 if failures else 0)
