import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const p=await b.newPage();
await p.setViewport({width:1680,height:1050});
const t0=Date.now(); const big=[];
p.on("response",async r=>{
  try{ const len=+(r.headers()["content-length"]||0);
    if(len>80000) big.push([Math.round(len/1024)+"KB", r.url().split("/").pop().slice(0,46), (Date.now()-t0)+"ms"]); }catch(_){}
});
await p.goto("https://mineex.ca/",{waitUntil:"domcontentloaded"});
await sleep(9000);
console.log("iframe srcs:", await p.evaluate(()=>[...document.querySelectorAll("iframe")].map(f=>f.src.slice(0,80))));
console.log("\npayloads > 80KB, in load order:");
for(const r of big.sort((a,c)=>parseInt(a[2])-parseInt(c[2]))) console.log("  ",r[0].padStart(8), r[2].padStart(7), r[1]);
await b.close();
