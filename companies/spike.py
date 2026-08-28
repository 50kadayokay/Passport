# Basic-page spike, ZERO external dependencies: commodity inferred by matching the
# company NAME against a keyword map (deterministic, no API, no hallucination), region
# from the TMX data, a templated factual blurb. Reports name-match coverage across all
# 898 and renders an HTML preview of a spread. Names with no commodity word are left
# "n/a" — those are exactly the ones a later Claude/data pass would fill.
import json, re, html

companies = json.load(open("mining.json"))

# Ordered so more specific terms win; each -> canonical commodity label.
KEYS = [
    (r"\bgold|aurum|golden\b", "Gold"), (r"\bsilver|argent\b", "Silver"),
    (r"\bcopper|cuprum\b", "Copper"), (r"\blithium\b", "Lithium"),
    (r"\buranium\b", "Uranium"), (r"\bnickel\b", "Nickel"), (r"\bcobalt\b", "Cobalt"),
    (r"\bzinc\b", "Zinc"), (r"\bpotash\b", "Potash"), (r"\bdiamond", "Diamonds"),
    (r"\bgraphite\b", "Graphite"), (r"\brare earth|\bree\b", "Rare Earths"),
    (r"\bplatinum|palladium|\bpgm", "PGMs"), (r"\btungsten\b", "Tungsten"),
    (r"\bmolybden", "Molybdenum"), (r"\bvanadium\b", "Vanadium"),
    (r"\btin\b", "Tin"), (r"\bmanganese\b", "Manganese"), (r"\bantimony\b", "Antimony"),
    (r"\btantalum|niobium\b", "Tantalum/Niobium"), (r"\biron ore|\biron\b", "Iron Ore"),
    (r"\bcoal\b", "Coal"), (r"\bhelium\b", "Helium"), (r"\blead\b", "Lead"),
    (r"\bbase metal", "Base Metals"), (r"\bpolymetallic\b", "Polymetallic"),
]
def commodities(name):
    n = name.lower(); out = []
    for pat, label in KEYS:
        if re.search(pat, n) and label not in out:
            out.append(label)
    return out

for c in companies:
    c["commodities"] = commodities(c["name"])

matched = [c for c in companies if c["commodities"]]
print(f"name-match coverage: {len(matched)}/{len(companies)} = {100*len(matched)//len(companies)}%")
from collections import Counter
top = Counter(x for c in matched for x in c["commodities"]).most_common(10)
print("top commodities:", top)

# Preview: a spread of 18 (mix of matched + a couple n/a to show the honest gap).
sample = companies[::max(1, len(companies)//18)][:18]
def initials(n):
    return "".join(w[0] for w in re.sub(r"[^A-Za-z ]", "", n).split()[:2]).upper() or "?"
COLORS = ["#0e7a53", "#b0762e", "#2563eb", "#5b57c9", "#0e8ba8", "#c2410c"]
cards = ""
for i, c in enumerate(sample):
    coms = c["commodities"]
    chips = "".join(f'<span class="chip">{x}</span>' for x in coms) or '<span class="chip muted">Commodity — n/a</span>'
    region = html.escape(", ".join(x for x in [c["province"], c["country"]] if x))
    lead = coms[0].lower() if coms else "mineral"
    blurb = f"TSX Venture-listed {html.escape(lead)} {'exploration ' if coms else ''}company based in {region}."
    cards += f"""
    <div class="card"><div class="head">
      <div class="avatar" style="background:{COLORS[i%len(COLORS)]}">{initials(c['name'])}</div>
      <div class="id"><div class="name">{html.escape(c['name'])}</div>
      <div class="tick">{html.escape(c['symbol'])}.V · TSXV</div></div></div>
      <div class="chips">{chips}<span class="chip loc">📍 {region}</span></div>
      <div class="blurb">{blurb}</div>
      <div class="foot"><span class="claim">Claim this profile →</span></div></div>"""

page = """<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<style>body{margin:0;background:#eef2f5;font-family:-apple-system,system-ui,sans-serif;padding:20px}
h1{font-size:15px;color:#0f172a;max-width:430px;margin:0 auto 4px}p.sub{font-size:12px;color:#64748b;max-width:430px;margin:0 auto 14px}
.wrap{max-width:430px;margin:0 auto;display:flex;flex-direction:column;gap:12px}
.card{background:#fff;border-radius:16px;padding:16px;box-shadow:0 1px 2px rgba(15,23,42,.05),0 10px 24px -18px rgba(15,23,42,.4)}
.head{display:flex;gap:12px;align-items:center}.avatar{width:46px;height:46px;border-radius:50%;display:grid;place-items:center;color:#fff;font-weight:800;font-size:15px;flex:0 0 auto}
.name{font-weight:800;font-size:15px;color:#0f172a;line-height:1.2}.tick{font-size:12px;font-weight:700;color:#64748b;margin-top:2px}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}.chip{background:#ecfdf5;color:#047857;font-weight:700;font-size:11.5px;padding:5px 10px;border-radius:999px}
.chip.muted{background:#f1f5f9;color:#94a3b8}.chip.loc{background:#f8fafc;color:#475569}
.blurb{font-size:13px;color:#475569;line-height:1.5;margin-top:11px}
.foot{margin-top:13px;padding-top:11px;border-top:1px solid #f1f5f9}.claim{color:#059669;font-weight:800;font-size:12.5px}</style>
<h1>Basic pages — spike (TMX data only, $0)</h1><p class=sub>Commodity matched from the company name; region from TMX. Price/logo/website would come from a data feed later.</p>
<div class=wrap>__CARDS__</div>"""
open("spike-preview.html", "w").write(page.replace("__CARDS__", cards))
print("rendered", len(sample), "preview pages -> spike-preview.html")
