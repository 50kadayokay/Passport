import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const p=await b.newPage();
await p.setViewport({width:1680,height:1050});
const t0=Date.now(); const main=[], frame=[];
p.on("response",r=>{
  const inF = r.frame() && r.frame()!==p.mainFrame();
  const rec={t:Date.now()-t0,url:r.url(),type:r.request().resourceType()};
  (inF?frame:main).push(rec);
});
await p.goto("https://mineex.ca/",{waitUntil:"domcontentloaded"});
await sleep(8000);
const imgs=main.filter(r=>r.type==="image");
console.log("MAIN PAGE images before 3s:", imgs.filter(r=>r.t<3000).length, "| total:", imgs.length);
console.log("\ntop main-page images by time (first 18):");
for(const r of imgs.slice(0,18)) console.log("  ",String(r.t).padStart(5)+"ms", r.url.split("/").pop().slice(0,52));
console.log("\nIFRAME requests:", frame.length, "| first at", frame.length?frame[0].t:"-","ms");
await b.close();
