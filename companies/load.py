# Upsert companies/enriched.json into the live Supabase companies table, in batches.
# Idempotent (on_conflict=slug → merge). Usage: python3 load.py
# Reversible: DELETE the listing rows, or set status='draft'.
import json, os, re, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
U = "https://rvptronniomlqumjhyrr.supabase.co"

def svc_key():
    if os.environ.get("SUPABASE_SERVICE_ROLE_KEY"):
        return os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    for path, pat in [(os.path.join(HERE, "keys.env"), r'SUPABASE_SERVICE_ROLE_KEY\s*=\s*"?([^"\n]+)'),
                      (os.path.join(HERE, "service-key.txt"), r'(sb_secret_[^\s"]+|eyJ[^\s"]+)')]:
        try:
            m = re.search(pat, open(path).read())
            if m: return m.group(1).strip()
        except Exception: pass
    raise SystemExit("Add SUPABASE_SERVICE_ROLE_KEY to keys.env (see chat).")

def main():
    K = svc_key()
    rows = json.load(open(os.path.join(HERE, "enriched.json")))

    # GUARD: never overwrite an existing RICH (non-listing) published profile. A basic
    # listing's slug can collide with a real profile (e.g. "Argenta Silver Corp." ->
    # argenta-silver-corp). Skip any such slug before upserting.
    hdr = {"apikey": K, "Authorization": f"Bearer {K}"}
    req = urllib.request.Request(f"{U}/rest/v1/companies?status=eq.published&select=slug,tier:profile->pp->TIER", headers=hdr)
    existing = json.load(urllib.request.urlopen(req, timeout=60))
    rich = {r["slug"] for r in existing if (r.get("tier") or "") != "listing"}
    before = len(rows)
    rows = [r for r in rows if r["slug"] not in rich]
    if before != len(rows):
        print(f"guard: skipped {before - len(rows)} rows colliding with existing rich profiles: {sorted(rich & {r['slug'] for r in json.load(open(os.path.join(HERE, 'enriched.json')))})[:6]}")
    print(f"loading {len(rows)} rows…")
    for i in range(0, len(rows), 100):
        batch = rows[i:i + 100]
        req = urllib.request.Request(f"{U}/rest/v1/companies?on_conflict=slug",
            data=json.dumps(batch).encode(),
            headers={"apikey": K, "Authorization": f"Bearer {K}", "Content-Type": "application/json",
                     "Prefer": "resolution=merge-duplicates,return=minimal"}, method="POST")
        try:
            urllib.request.urlopen(req, timeout=90)
            print(f"  loaded {min(i+100, len(rows))}/{len(rows)}")
        except Exception as e:
            print(f"  batch {i} error:", e)
    print("done")

if __name__ == "__main__":
    main()
