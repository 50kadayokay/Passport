// When does the PHONE look complete to a human — poster or live app, either counts.
import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
for(const r of ["/","/pro","/investor"]){
  const p=await b.newPage();
  await p.setViewport({width:1680,height:1050});
  const t0=Date.now();
  await p.goto("https://mineex.ca"+r,{waitUntil:"domcontentloaded",timeout:60000});
  let poster=null, live=null;
  for(let i=0;i<300;i++){
    const s=await p.evaluate(()=>{
      const img=[...document.querySelectorAll("img")].find(i=>i.src.includes("opening-poster"));
      const posterUp = !!(img && img.complete && img.naturalWidth>0);
      const f=document.querySelector(".mx-demo iframe");
      let liveUp=false;
      if(f){ try{const d=f.contentDocument; liveUp=!!(d&&((d.body&&d.body.innerText)||"").trim().length>40);}catch(_){liveUp=true;} }
      return {posterUp,liveUp};
    });
    if(s.posterUp&&poster===null) poster=Date.now()-t0;
    if(s.liveUp&&live===null) live=Date.now()-t0;
    if(poster!==null&&live!==null) break;
    await sleep(80);
  }
  console.log(r.padEnd(11),"PHONE LOOKS COMPLETE:",String(poster).padStart(5),"ms  | live app ready:",String(live).padStart(5),"ms");
  await p.close();
}
await b.close();
