import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
console.log("route            nodes   listeners  jsHeapMB  iframes  imgs  docs");
for(const [n,r] of [["home","/"],["pro","/pro"],["investor","/investor"],["conference","/conference-mode"],["pricing","/pricing"]]){
  const p=await b.newPage();
  await p.setViewport({width:390,height:844,deviceScaleFactor:3,isMobile:true,hasTouch:true});
  await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
  await p.goto("https://mineex.ca"+r,{waitUntil:"networkidle2",timeout:45000}).catch(()=>{});
  await sleep(5000);
  await p.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=500){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,90));}});
  await sleep(2000);
  const cdp=await p.target().createCDPSession(); await cdp.send("Performance.enable"); const m=await cdp.send("Performance.getMetrics");
  const g=(k)=>Math.round((m.metrics.find(x=>x.name===k)||{value:0}).value);
  const extra=await p.evaluate(()=>({f:document.querySelectorAll("iframe").length,i:document.querySelectorAll("img").length}));
  console.log(n.padEnd(16),String(g("Nodes")).padEnd(7),String(g("JSEventListeners")).padEnd(10),String(Math.round(g("JSHeapUsedSize")/1048576)).padEnd(9),String(extra.f).padEnd(8),String(extra.i).padEnd(5),g("Documents"));
  await p.close();
}
await b.close();
