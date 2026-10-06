import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
for(const [route,name] of [["/","home"],["/pro","pro"],["/investor","investor"]]){
  const p=await b.newPage();
  await p.setViewport({width:390,height:740,deviceScaleFactor:2,isMobile:true,hasTouch:true});
  await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
  const cdp=await p.target().createCDPSession();
  await p.goto("http://localhost:5197"+route,{waitUntil:"networkidle2",timeout:60000}); await sleep(5000);
  const gc=async()=>{ await cdp.send("HeapProfiler.collectGarbage").catch(()=>{}); await sleep(400);
    return p.evaluate(()=>performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):0); };
  const at=[]; at.push(["idle", await gc()]);
  // one full slow pass, like a reader
  const H=await p.evaluate(()=>document.body.scrollHeight);
  for(let y=0;y<H;y+=400){ await p.evaluate(v=>window.scrollTo(0,v),y); await sleep(90); }
  at.push(["after 1 pass", await gc()]);
  for(let lap=0;lap<2;lap++){ for(let y=H;y>0;y-=400){ await p.evaluate(v=>window.scrollTo(0,v),y); await sleep(50);} for(let y=0;y<H;y+=400){ await p.evaluate(v=>window.scrollTo(0,v),y); await sleep(50);} }
  at.push(["after 5 passes", await gc()]);
  console.log(name.padEnd(10), at.map(([k,v])=>`${k}: ${v}MB`).join(" | "),
    "| nodes", await p.evaluate(()=>document.querySelectorAll("*").length));
  await p.close();
}
await b.close();
