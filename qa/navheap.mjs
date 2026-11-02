import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox","--js-flags=--expose-gc"]});
const p=await b.newPage();
await p.setViewport({width:1680,height:1050});
await p.goto("http://localhost:5197/",{waitUntil:"networkidle2"}); await sleep(3500);
const cycle=["/pro","/investor","/conference-mode","/pricing","/home"];
const read=async()=>{ const c=await p.target().createCDPSession(); await c.send("HeapProfiler.collectGarbage").catch(()=>{});
  return p.evaluate(()=>performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):0); };
console.log("start heap:", await read(),"MB");
for(let lap=1;lap<=4;lap++){
  for(const d of cycle){
    await p.evaluate((x)=>{const a=[...document.querySelectorAll("a[href]")].find(y=>new URL(y.href,location.origin).pathname===x); if(a)a.click();},d);
    await sleep(1400);
  }
  console.log(`after lap ${lap} (${lap*cycle.length} navigations):`, await read(),"MB | nodes",
    await p.evaluate(()=>document.querySelectorAll("*").length), "| iframes", await p.evaluate(()=>document.querySelectorAll("iframe").length));
}
await b.close();
