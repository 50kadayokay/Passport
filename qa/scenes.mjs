import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const route=process.argv[2]||"/";
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const p=await b.newPage();
await p.setViewport({width:390,height:844,deviceScaleFactor:3,isMobile:true,hasTouch:true});
await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
let errs=[]; p.on("pageerror",e=>errs.push(e.message)); p.on("console",m=>{if(m.type()==="error")errs.push(m.text().slice(0,160));});
const writes=[]; p.on("request",r=>{const u=r.url(),m=r.method();
  if(m!=="GET"||/supabase|postmark|\/api\//i.test(u)) writes.push(m+" "+u.slice(0,110));});
await p.goto("http://localhost:5197"+route,{waitUntil:"networkidle2"}); await sleep(4000);
let maxScenes=0,maxNodes=0,shift=0;
await p.evaluate(()=>{window.__cls=0;try{new PerformanceObserver(l=>{for(const e of l.getEntries()) if(!e.hadRecentInput) window.__cls+=e.value;}).observe({type:"layout-shift",buffered:true});}catch(_){}});
// stress: top -> bottom -> top -> bottom
const H=await p.evaluate(()=>document.body.scrollHeight);
const stops=[];for(let i=0;i<=20;i++)stops.push(i/20);
for(const pass of [stops,[...stops].reverse(),stops,[...stops].reverse()]){
  for(const f of pass){
    await p.evaluate((y)=>window.scrollTo(0,document.body.scrollHeight*y),f); await sleep(210);
    const m=await p.evaluate(()=>({s:document.querySelectorAll('[role="group"]').length,n:document.querySelectorAll("*").length}));
    maxScenes=Math.max(maxScenes,m.s); maxNodes=Math.max(maxNodes,m.n);
  }
}
const cdp=await p.target().createCDPSession(); await cdp.send("Performance.enable");
const mm=(await cdp.send("Performance.getMetrics")).metrics;
shift=await p.evaluate(()=>window.__cls||0);
console.log(route.padEnd(12),"maxScenes",maxScenes,"| peakNodes",maxNodes,
  "| heapMB",Math.round((mm.find(x=>x.name==="JSHeapUsedSize")||{}).value/1048576),
  "| iframes",await p.evaluate(()=>document.querySelectorAll("iframe").length),
  "| CLS",shift.toFixed(4),
  "| overflowX",await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),
  "| errs",errs.length);
if(errs.length)console.log("  errors:",errs.slice(0,3));
if(writes.length)console.log("  NON-GET/API requests:",writes.slice(0,6)); else console.log("  production writes: none");
await b.close();
