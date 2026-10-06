import puppeteer from "puppeteer-core";
import sharp from "sharp";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const p=await b.newPage();
await p.setViewport({width:1680,height:1050});
await p.goto("https://mineex.ca/",{waitUntil:"domcontentloaded"});
await sleep(1600); await p.screenshot({path:"/tmp/swap-poster.png"});   // poster showing
await sleep(6000); await p.screenshot({path:"/tmp/swap-live.png"});     // live app settled
const [a,c]=await Promise.all([sharp("/tmp/swap-poster.png").raw().toBuffer({resolveWithObject:true}),
                               sharp("/tmp/swap-live.png").raw().toBuffer({resolveWithObject:true})]);
let d=0; for(let i=0;i<a.data.length;i+=4){ if(Math.abs(a.data[i]-c.data[i])>24||Math.abs(a.data[i+1]-c.data[i+1])>24||Math.abs(a.data[i+2]-c.data[i+2])>24) d++; }
console.log("poster frame vs live frame:", ((d/(a.data.length/4))*100).toFixed(2)+"% of pixels differ");
await b.close();
