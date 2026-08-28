# Upsert the 4 basic-listing companies with the corrected field semantics:
#   jurisdiction = where the mineral PROJECTS are (from the description) — investor-relevant
#   headquarters = corporate head office (TMX head-office province) — kept separate
#   website      = the company's own site
# Reversible: DELETE by slug or set status='draft'. Run: python3 load4.py
import json, os, re, urllib.request

U = "https://rvptronniomlqumjhyrr.supabase.co"
def _svc_key():
    if os.environ.get("SUPABASE_SERVICE_ROLE_KEY"):
        return os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    here = os.path.dirname(__file__)
    for path, pat in [(os.path.join(here, "service-key.txt"), r'(sb_secret_[^\s"]+|eyJ[^\s"]+)'),
                      (os.path.join(here, "..", ".env.local"), r'SUPABASE_SERVICE_ROLE_KEY\s*=\s*"?([^"\n]+)"?')]:
        try:
            m = re.search(pat, open(path).read())
            if m: return m.group(1).strip()
        except Exception: pass
    raise SystemExit("Paste the service_role key into companies/service-key.txt (see chat).")
K = _svc_key()

DATE = "Aug 2026"  # when this batch was compiled — passed in, not computed, for reproducibility

def row(slug, name, sym, commodity, jurisdiction, headquarters, stage, brief, one, website, accent, source):
    return {
        "slug": slug, "name": name, "primary_ticker": f"TSXV: {sym}", "status": "published",
        "profile": {"pp": {
            "TIER": "listing",
            "COMPANY": {"name": name, "stage": stage, "jurisdiction": jurisdiction,
                        "headquarters": headquarters, "commodity": commodity,
                        "website": website, "ticker": f"TSXV: {sym}"},
            "EXCHANGES": [{"sym": sym, "ex": "TSXV", "yahoo": f"{sym}.V"}],
            "LISTING_BRIEF": brief, "ONE_LINER": one, "BRAND": accent,
            "AVATAR": "", "STATUS_IMG": "", "LOGO": "",
            # Provenance — where each listing's descriptive fields came from + when (legal defensibility).
            "LISTING_SOURCE": {"label": source, "date": DATE, "facts": "TMX Listed Issuers"},
        }},
    }

ROWS = [
    row("1911-gold", "1911 Gold Corporation", "AUMB", "Gold", "Manitoba, Canada", "British Columbia, Canada", "Developer",
        "1911 Gold is an advanced-stage gold explorer and developer in Manitoba's Rice Lake district, holding roughly 62,000 hectares around the fully permitted True North mine and mill. It is working toward a district-scale gold operation built on that existing infrastructure.",
        "Advanced-stage gold explorer in Manitoba's Rice Lake district.", "https://1911gold.com", "#a9791a", "1911gold.com"),
    row("abcourt-mines", "Abcourt Mines Inc.", "ABI", "Gold · Silver", "Quebec, Canada", "Quebec, Canada", "Developer",
        "Abcourt Mines is an emerging gold producer in Quebec's Abitibi mining camp. It is advancing the Sleeping Giant mine and mill toward commercial production and running a 20,000 m drill campaign at its Flordin-Cartwright project.",
        "Emerging gold producer in Quebec's Abitibi camp.", "https://abcourt.com", "#a9791a", "abcourt.com"),
    row("acdc-battery-metals", "AC/DC Battery Metals Inc.", "ACDC", "Nickel · Cobalt", "British Columbia, Canada", "British Columbia, Canada", "Explorer",
        "AC/DC Battery Metals is an exploration company focused on battery and critical minerals in British Columbia. It holds a 100% interest in its ~6,125-hectare Nickel Project in the Takla Lake area, targeting nickel, cobalt and chromium deposits.",
        "Battery-metals explorer in British Columbia's Takla Lake area.", "", "#3f6070", "public company filings"),
    row("1844-resources", "1844 Resources Inc.", "EFF", "", "", "Saskatchewan, Canada", "Explorer",
        "1844 Resources Inc. is a TSX Venture-listed mineral exploration company headquartered in Saskatchewan, Canada.",
        "TSXV-listed mineral exploration company.", "", "#556173", "TSX Venture listing"),
]

def main():
    req = urllib.request.Request(
        f"{U}/rest/v1/companies?on_conflict=slug",
        data=json.dumps(ROWS).encode(),
        headers={"apikey": K, "Authorization": f"Bearer {K}", "Content-Type": "application/json",
                 "Prefer": "resolution=merge-duplicates,return=representation"},
        method="POST")
    out = json.load(urllib.request.urlopen(req, timeout=30))
    print("upserted", len(out), "rows:", [r["slug"] for r in out])

if __name__ == "__main__":
    main()
