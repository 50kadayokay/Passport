import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
for(const route of ["/","/pro","/investor"]){
  const p=await b.newPage();
  await p.setViewport({width:1680,height:1050,deviceScaleFactor:1});
  const t0=Date.now(); const frames=[];
  p.on("request",r=>{ if(r.resourceType()==="document"&&r.frame()!==p.mainFrame()) frames.push(["req",r.url().slice(0,70),Date.now()-t0]); });
  await p.goto("https://mineex.ca"+route,{waitUntil:"domcontentloaded",timeout:60000});
  // poll until an iframe exists AND has painted content
  let firstIframe=null, contentReady=null;
  for(let i=0;i<300;i++){
    const s=await p.evaluate(()=>{
      const fs=[...document.querySelectorAll("iframe")];
      let painted=0;
      for(const f of fs){ try{ const d=f.contentDocument; if(d&&((d.body&&d.body.innerText)||"").trim().length>40) painted++; }catch(_){ painted++; } }
      return {n:fs.length,painted};
    });
    if(s.n>0&&firstIframe===null) firstIframe=Date.now()-t0;
    if(s.painted>0){ contentReady=Date.now()-t0; break; }
    await sleep(100);
  }
  console.log(route.padEnd(11),"iframe in DOM:",String(firstIframe).padStart(6),"ms | CONTENT VISIBLE:",String(contentReady).padStart(6),"ms");
  await p.close();
}
await b.close();
