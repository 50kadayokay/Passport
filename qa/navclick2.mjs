import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const p=await b.newPage();
await p.setViewport({width:1680,height:1050});
await p.goto("http://localhost:5197/",{waitUntil:"networkidle2",timeout:60000});
await sleep(4000);
for(const [label,sel] of [["Pro",'a[href="/pro"]'],["Conference",'a[href="/conference-mode"]'],["Investor",'a[href="/investor"]'],["Pricing",'a[href="/pricing"]']]){
  const el=await p.$(sel);
  if(!el){ console.log(label,"— link not found"); continue; }
  const t0=Date.now();
  let navStart=null;
  const onNav=()=>{ if(navStart===null) navStart=Date.now()-t0; };
  p.once("framenavigated",onNav);
  await el.click();
  // wait until the destination has meaningful content
  let painted=null;
  for(let i=0;i<300;i++){
    try{
      const ok=await p.evaluate(()=>document.body && document.body.innerText.replace(/\s+/g," ").trim().length>300);
      if(ok){ painted=Date.now()-t0; break; }
    }catch(_){}
    await sleep(60);
  }
  console.log(label.padEnd(11),"full page load?",(await p.evaluate(()=>performance.getEntriesByType("navigation")[0]?.type)),
    "| content at", String(painted).padStart(5),"ms");
  await p.goto("http://localhost:5197/",{waitUntil:"networkidle2"}); await sleep(3000);
}
await b.close();
