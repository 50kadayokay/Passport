import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const p=await b.newPage();
await p.setViewport({width:1680,height:1050});
const t0=Date.now(); const reqs=[];
p.on("response",async r=>{
  const f=r.frame();
  const inIframe = f && f!==p.mainFrame();
  const len=+(r.headers()["content-length"]||0);
  reqs.push({t:Date.now()-t0, kb:Math.round(len/1024), url:r.url(), inIframe, type:r.request().resourceType()});
});
await p.goto("https://mineex.ca/app?c=kingsmen-resources&embed=1",{waitUntil:"domcontentloaded",timeout:60000});
let ready=null;
for(let i=0;i<250;i++){
  const ok=await p.evaluate(()=>document.body && document.body.innerText.includes("Kingsmen"));
  if(ok){ ready=Date.now()-t0; break; } await sleep(100);
}
await sleep(4000);
console.log("APP ALONE — content visible at", ready, "ms");
const js=reqs.filter(r=>r.type==="script").sort((a,c)=>c.kb-a.kb).slice(0,8);
console.log("\nlargest scripts:");
for(const r of js) console.log("  ",String(r.kb).padStart(5)+"KB", String(r.t).padStart(5)+"ms", r.url.split("/").pop().slice(0,44));
const img=reqs.filter(r=>r.type==="image");
console.log("\nimages:", img.length, "totalling ~", Math.round(img.reduce((s,r)=>s+r.kb,0)/1024), "MB");
const remote=img.filter(r=>!r.url.includes("mineex.ca"));
console.log("remote (non-mineex) images:", remote.length, "— first at", remote.length?remote[0].t:"-", "ms");
const late=reqs.filter(r=>r.t>(ready||0)).length;
console.log("requests AFTER content was visible:", late);
await b.close();
