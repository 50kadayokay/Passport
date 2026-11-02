import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const p=await b.newPage();
await p.setViewport({width:390,height:740,deviceScaleFactor:2,isMobile:true,hasTouch:true});
await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
const cdp=await p.target().createCDPSession();
await p.goto("http://localhost:5197/",{waitUntil:"networkidle2"}); await sleep(5000);
const gc=async()=>{ await cdp.send("HeapProfiler.collectGarbage").catch(()=>{}); await sleep(300);
  return p.evaluate(()=>performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):0); };
const H=await p.evaluate(()=>document.body.scrollHeight);
for(const f of [0,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1.0]){
  await p.evaluate((v)=>window.scrollTo(0,v), Math.round(H*f)); await sleep(900);
  const m=await p.evaluate(()=>({ imgs:document.querySelectorAll("img").length, iframes:document.querySelectorAll("iframe").length,
    nodes:document.querySelectorAll("*").length }));
  console.log(`${String(Math.round(f*100)).padStart(3)}%  heap ${String(await gc()).padStart(4)}MB | imgs ${String(m.imgs).padStart(3)} | iframes ${m.iframes} | nodes ${m.nodes}`);
}
await b.close();
