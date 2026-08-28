# Enrich the 898 TSXV mining companies into basic-listing rows using Claude's built-in
# web_search tool (reliable + one key only). Claude searches the web per company and
# returns grounded {commodities, stage, jurisdiction, website, description}.
#   python3 enrich.py [LIMIT]     e.g. `python3 enrich.py 8` to test cheaply first.
# Key: ANTHROPIC_API_KEY from env or companies/keys.env.
import json, os, re, sys, time, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))

def load_keys():
    k = {}
    if os.environ.get("ANTHROPIC_API_KEY"):
        k["ANTHROPIC_API_KEY"] = os.environ["ANTHROPIC_API_KEY"]
    try:
        for line in open(os.path.join(HERE, "keys.env")):
            m = re.match(r'\s*([A-Z_]+)\s*=\s*"?([^"\n]+)', line)
            if m and m.group(1) not in k:
                k[m.group(1)] = m.group(2).strip()
    except Exception:
        pass
    return k
KEYS = load_keys()
LIMIT = int(sys.argv[1]) if len(sys.argv) > 1 else None

PROV = {"BC": "British Columbia", "ON": "Ontario", "QC": "Quebec", "AB": "Alberta",
        "SK": "Saskatchewan", "MB": "Manitoba", "NS": "Nova Scotia", "NB": "New Brunswick",
        "NL": "Newfoundland and Labrador", "PE": "Prince Edward Island", "YT": "Yukon",
        "NT": "Northwest Territories", "NU": "Nunavut", "NV": "Nevada", "CO": "Colorado",
        "AZ": "Arizona", "ID": "Idaho", "UT": "Utah", "WA": "Washington", "AK": "Alaska"}
def hq(c):
    full = PROV.get((c.get("province") or "").strip(), (c.get("province") or "").strip())
    return ", ".join(dict.fromkeys([x for x in [full, (c.get("country") or "").strip()] if x]))

ACCENT = {"Gold": "#a9791a", "Silver": "#8a94a6", "Copper": "#b5613b", "Lithium": "#3f6070",
          "Nickel": "#3f6070", "Cobalt": "#3f6070", "Uranium": "#4b7a5a", "Zinc": "#6b7280",
          "Potash": "#b08d57", "Diamonds": "#5b6b8c", "Graphite": "#475569", "Rare Earths": "#5b7a5a"}
def accent(coms):
    for c in coms:
        if c in ACCENT: return ACCENT[c]
    return "#556173"

def research(c):
    user = (f'Company: {c["name"]} (TSXV: {c["symbol"]}), head office {hq(c) or "Canada"}. '
            "Search the web for this junior mining company, then return ONLY a JSON object (no other text) with keys:\n"
            '"commodities": array of the metals/minerals they explore or mine (e.g. ["Gold"], ["Nickel","Cobalt"]); [] if you cannot tell.\n'
            '"stage": one of "Explorer","Developer","Producer","Royalty".\n'
            '"jurisdiction": where their mineral PROJECTS are, as "Region, Country" (e.g. "Nevada, USA","Sonora, Mexico","Ontario, Canada"); "" if unknown. This is the PROJECT location, NOT the head office.\n'
            '"website": their official website URL, or "".\n'
            f'"description": 1-2 factual sentences on what they do, based ONLY on what you find, ending that it is TSX Venture-listed. If you find nothing specific, use exactly: "{c["name"]} is a TSX Venture-listed mineral exploration company."\n'
            "Rules: never invent projects, deposits, grades, or places not in the search results. Prefer the company's own site or filings.")
    body = {"model": "claude-haiku-4-5-20251001", "max_tokens": 1024,
            "tools": [{"type": "web_search_20250305", "name": "web_search", "max_uses": 3}],
            "messages": [{"role": "user", "content": user}]}
    for attempt in range(3):
        try:
            req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=json.dumps(body).encode(),
                headers={"x-api-key": KEYS["ANTHROPIC_API_KEY"], "anthropic-version": "2023-06-01", "content-type": "application/json"})
            d = json.load(urllib.request.urlopen(req, timeout=120))
            txt = "".join(b.get("text", "") for b in d.get("content", []) if b.get("type") == "text")
            m = re.search(r"\{.*\}", txt, re.S)
            return json.loads(m.group(0)) if m else {}
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 529) and attempt < 2:
                time.sleep(5 * (attempt + 1)); continue
            print(f"  ! {c['symbol']} HTTP {e.code}: {e.read()[:120].decode('utf-8','ignore')}")
            return {}
        except Exception as e:
            if attempt < 2: time.sleep(3); continue
            print(f"  ! {c['symbol']} {type(e).__name__}: {e}")
            return {}

DATE = "Aug 2026"
def main():
    companies = json.load(open(os.path.join(HERE, "mining.json")))
    if LIMIT: companies = companies[:LIMIT]
    # Resumable checkpoint: each company's result is appended to progress.jsonl as soon
    # as it's done, so a stop (sleep, Ctrl-C, crash) loses nothing — re-running skips
    # what's already there and continues. Delete progress.jsonl to force a fresh run.
    PROG = os.path.join(HERE, "progress.jsonl")
    done = {}
    if os.path.exists(PROG):
        for line in open(PROG):
            try: rec = json.loads(line); done[rec["symbol"]] = rec["r"]
            except Exception: pass
    print(f"researching {len(companies)} companies via Claude web search… ({len(done)} already done)")
    pf = open(PROG, "a")
    for i, c in enumerate(companies):
        if c["symbol"] in done:
            c["_r"] = done[c["symbol"]] or {}
        else:
            c["_r"] = research(c) or {}
            r = c["_r"]
            # Only checkpoint SUCCESSES — an empty result (credit error, timeout) is left
            # un-checkpointed so a later resume retries it instead of saving the failure.
            if r.get("commodities") or r.get("description") or r.get("website") or r.get("jurisdiction"):
                pf.write(json.dumps({"symbol": c["symbol"], "r": r}) + "\n"); pf.flush()
            time.sleep(0.4)
        if (i + 1) % 10 == 0 or i + 1 == len(companies):
            print(f"  {i+1}/{len(companies)}")
    pf.close()

    rows = []
    for c in companies:
        r = c["_r"]
        coms = [x for x in (r.get("commodities") or []) if isinstance(x, str)]
        website = (r.get("website") or "").strip()
        src = re.sub(r"^https?://(www\.)?", "", website).split("/")[0] if website else "web sources"
        slug = re.sub(r"[^a-z0-9]+", "-", c["name"].lower()).strip("-")
        desc = (r.get("description") or "").strip() or f'{c["name"]} is a TSX Venture-listed mineral exploration company.'
        rows.append({"slug": slug, "name": c["name"], "primary_ticker": f'TSXV: {c["symbol"]}', "status": "published",
            "profile": {"pp": {"TIER": "listing",
                "COMPANY": {"name": c["name"], "stage": (r.get("stage") or "Explorer"), "jurisdiction": (r.get("jurisdiction") or "").strip(),
                            "headquarters": hq(c), "commodity": " · ".join(coms[:2]), "website": website, "ticker": f'TSXV: {c["symbol"]}'},
                "EXCHANGES": [{"sym": c["symbol"], "ex": "TSXV", "yahoo": c["apiSymbol"]}],
                "LISTING_BRIEF": desc, "ONE_LINER": desc, "BRAND": accent(coms),
                "AVATAR": "", "STATUS_IMG": "", "LOGO": "",
                "LISTING_SOURCE": {"label": src, "date": DATE, "facts": "TMX Listed Issuers"}}}})
    json.dump(rows, open(os.path.join(HERE, "enriched.json"), "w"), indent=1)
    gc = sum(1 for r in rows if r["profile"]["pp"]["COMPANY"]["commodity"])
    gj = sum(1 for r in rows if r["profile"]["pp"]["COMPANY"]["jurisdiction"])
    gw = sum(1 for r in rows if r["profile"]["pp"]["COMPANY"]["website"])
    print(f"wrote enriched.json — {len(rows)} rows | commodity {gc} | jurisdiction {gj} | website {gw}")

if __name__ == "__main__":
    main()
