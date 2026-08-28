# Recover Argenta's rich profile (overwritten by a slug collision during the 898 load)
# from the saved build version, and delete the duplicate basic-listing rows.
import json, urllib.request, os, re
U = "https://rvptronniomlqumjhyrr.supabase.co"
K = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or re.search(r'SUPABASE_SERVICE_ROLE_KEY\s*=\s*"?([^"\n]+)', open(os.path.join(os.path.dirname(__file__), "keys.env")).read()).group(1).strip()
H = {"apikey": K, "Authorization": f"Bearer {K}", "Content-Type": "application/json"}

def get(path):
    return json.load(urllib.request.urlopen(urllib.request.Request(f"{U}/rest/v1/{path}", headers=H)))
def post(path, body, prefer):
    urllib.request.urlopen(urllib.request.Request(f"{U}/rest/v1/{path}", data=json.dumps(body).encode(), headers={**H, "Prefer": prefer}, method="POST"))
def delete(path):
    urllib.request.urlopen(urllib.request.Request(f"{U}/rest/v1/{path}", headers={**H, "Prefer": "return=minimal"}, method="DELETE"))

# 1) restore Argenta's rich profile from the latest saved build version
ver = get("company_profile_versions?slug=eq.argenta-2-0-test&select=profile&order=created_at.desc&limit=1")[0]["profile"]
try:
    ver["pp"]["COMPANY"]["name"] = "Argenta Silver Corp."
except Exception:
    pass
post("companies?on_conflict=slug",
     [{"slug": "argenta-silver-corp", "name": "Argenta Silver Corp.", "primary_ticker": "TSXV: AGAG", "status": "published", "profile": ver}],
     "resolution=merge-duplicates,return=minimal")
print("restored argenta-silver-corp (rich, tier:", repr(ver.get("pp", {}).get("TIER")), ")")

# 2) delete duplicate basic-listing rows (kept the canonical ones)
for slug in ["kingsmen-resources-ltd", "1911-gold", "abcourt-mines", "acdc-battery-metals", "1844-resources"]:
    try:
        delete(f"companies?slug=eq.{slug}")
        print("deleted dup:", slug)
    except Exception as e:
        print("delete error", slug, e)
print("done")
