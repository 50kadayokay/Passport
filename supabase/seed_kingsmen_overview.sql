-- seed_kingsmen_overview.sql
-- Loads REAL Kingsmen content (extracted from the prototype: status, brief,
-- capital, projects) into the live profile, mapped to the app's schema.
-- Shallow-merges via || so company identity, brand, team, timeline, media are
-- left untouched. Run in Supabase → SQL Editor, then refresh Kingsmen on your phone.

update public.companies
set profile = profile || '{
  "companyStatus": {
    "statusHeadline": "26-Hole Drill Campaign",
    "statusHeadlineSubtext": "Phase 1 diamond drilling is actively underway at Las Coloradas.",
    "latestUpdate": "Three drill holes submitted to the lab for assays.",
    "nextCatalyst": "Phase 1 Assays",
    "expected": "Expected H2 2026",
    "investmentImpact": "Could expand the high-grade silver system.",
    "progressBar": { "enabled": true, "current": 14, "total": 26, "unit": "holes", "label": "holes" }
  },
  "companyBrief": {
    "headline": "High-grade silver-gold exploration in the Parral district, Mexico",
    "shortSummary": "Kingsmen is drilling high-grade silver-gold targets across a district-scale land package in the Parral Mining District, Chihuahua, Mexico, fully funded through 2026 by a C$13M bought deal, with an active 26-hole Phase 1 campaign at Las Coloradas.",
    "businessDescription": "Kingsmen Resources Ltd. is a junior explorer advancing the Las Coloradas and Almoloya silver-gold projects in the Parral Mining District of Chihuahua, Mexico.",
    "keyPoints": [
      "Fully funded through 2026 with a C$13M February bought deal, no near-term financing required",
      "Active 26-hole Phase 1 diamond drill campaign at Las Coloradas (14 of 26 holes complete)",
      "New high-grade silver discovery: 241 g/t AgEq including 525 g/t AgEq with gold",
      "Mineralization continuity confirmed 70 m down-dip: 15.7 m at 74 g/t AgEq including 704 g/t AgEq",
      "District-scale package expanded via 100% acquisition of the Claudia 2 claim and Saddle target"
    ]
  },
  "capital": {
    "financing": "C$13M Bought Deal",
    "financingNote": "February 2026",
    "cash": "C$13.0M",
    "cashNote": "Current treasury",
    "debt": "$0",
    "outstanding": "34,523,086",
    "fd": "44,933,584",
    "ownership": ""
  },
  "projects": [
    {
      "id": "las-coloradas", "name": "Las Coloradas", "enabled": true,
      "description": "Flagship silver-gold project in the Parral Mining District, Chihuahua, and the focus of the active Phase 1 drill campaign.",
      "snapshot": { "location": "Parral District, Chihuahua, Mexico", "commodities": "Silver and Gold", "land": "32 km2", "targets": "High-grade Ag-Au structures" },
      "geo": { "district": "Parral District, Chihuahua, Mexico" },
      "stageIdx": 1, "gallery": []
    },
    {
      "id": "almoloya", "name": "Almoloya", "enabled": true,
      "description": "Gold-silver project in the Parral District with high-grade surface samples returned from the South Block.",
      "snapshot": { "location": "Parral District, Chihuahua, Mexico", "commodities": "Gold and Silver", "land": "28 km2", "targets": "South Block gold-silver samples" },
      "geo": { "district": "Parral District, Chihuahua, Mexico" },
      "stageIdx": 0, "gallery": []
    }
  ]
}'::jsonb
where slug = 'kingsmen-resources';
