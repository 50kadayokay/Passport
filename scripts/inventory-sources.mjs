// Read-only public inventory. The target is explicit (no production default; script-target-guard-test).
const URL = process.env.INVENTORY_SUPABASE_URL, KEY = process.env.INVENTORY_SUPABASE_ANON_KEY;
if (!URL || !KEY) { console.error("  REFUSING: set INVENTORY_SUPABASE_URL and INVENTORY_SUPABASE_ANON_KEY (the project you mean)."); process.exit(2); }
const h={apikey:KEY,Authorization:`Bearer ${KEY}`};
// FULL inventory — no date filter — to catch every source the classifier can see.
const rows=await (await fetch(`${URL}/rest/v1/news_public?select=id,title,source_key,source_name,is_press_release,context,canonical_url,event_type&order=published_at.desc&limit=1000`,{headers:h})).json();
console.log(`Total news_public rows: ${rows.length}\n`);
console.log("===== #2  SOURCE_KEY INVENTORY (evidence per source) =====");
const by={};
for(const r of rows){const k=r.source_key||"(none)";(by[k]=by[k]||[]).push(r);}
for(const k of Object.keys(by).sort((a,b)=>by[b].length-by[a].length)){
  const g=by[k];
  const prFlag=g.filter(r=>r.is_press_release===true).length;
  const falseFlag=g.filter(r=>r.is_press_release===false).length;
  const nullFlag=g.filter(r=>r.is_press_release==null).length;
  const urlPR=g.filter(r=>/\/press[-_]releases?\//i.test(r.canonical_url||"")).length;
  const host=(()=>{try{return new URL(g[0].canonical_url).host;}catch{return "?";}})();
  console.log(`\n  ${k}  (n=${g.length}, host=${host}, name="${g[0].source_name}")`);
  console.log(`     is_press_release: true=${prFlag} false=${falseFlag} null=${nullFlag} | URL under /press-releases/: ${urlPR}/${g.length}`);
  console.log(`     e.g. "${(g[0].title||'').slice(0,64)}"`);
}
console.log("\n\n===== #5  EMPTY-CONTEXT AUDIT (Why It Matters missing) =====");
const empty=rows.filter(r=>!(r.context&&String(r.context).trim()));
console.log(`${empty.length} of ${rows.length} rows have empty context.\n`);
const ec={}; for(const r of empty){const k=r.event_type||"(none)";ec[k]=(ec[k]||0)+1;}
console.log("by event_type:",JSON.stringify(ec));
console.log("\nid | source_key | is_PR_flag | event_type | title");
for(const r of empty.slice(0,40)) console.log(`${String(r.id).slice(0,8)} | ${(r.source_key||'').slice(0,20)} | ${String(r.is_press_release)} | ${(r.event_type||'-').slice(0,14)} | ${(r.title||'').slice(0,60)}`);
