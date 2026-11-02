import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
for(const [tag,url] of [["current","http://localhost:5197/"],["fastphone","http://localhost:5197/?fastphone=1"]]){
  const p=await b.newPage();
  await p.setViewport({width:1680,height:1050});
  let bytes=0; p.on("response",r=>{const l=+(r.headers()["content-length"]||0); bytes+=l;});
  const t0=Date.now();
  await p.goto(url,{waitUntil:"domcontentloaded",timeout:60000});
  // when does the phone show real content?
  let ready=null;
  for(let i=0;i<200;i++){
    const ok=await p.evaluate(()=>{
      const f=document.querySelector(".mx-demo iframe, .mx-story iframe");
      if(f){ try{ const d=f.contentDocument; return !!(d&&((d.body&&d.body.innerText)||"").trim().length>40);}catch(_){return true;} }
      // DOM variant: look for the profile screen's own text
      return document.body.innerText.includes("Kingsmen Resources");
    });
    if(ok){ ready=Date.now()-t0; break; }
    await sleep(100);
  }
  // scroll into the app chapter so the phone is on screen, then shoot
  await p.evaluate(()=>window.scrollTo(0,window.innerHeight*2.2)); await sleep(2500);
  await p.screenshot({path:`/tmp/phone-${tag}.png`});
  console.log(tag.padEnd(10),"phone content visible:",String(ready).padStart(6),"ms | transferred ~",Math.round(bytes/1048576),"MB");
  await p.close();
}
await b.close();
