// Capture the REAL app's opening frame, to show instantly while it boots.
import puppeteer from "puppeteer-core";
import sharp from "sharp";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const W=393,H=852;
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const p=await b.newPage();
await p.setViewport({width:W,height:H,deviceScaleFactor:3});
await p.goto("https://mineex.ca/app?c=kingsmen-resources&embed=1",{waitUntil:"networkidle2",timeout:60000});
await sleep(9000);   // let imagery settle so the poster matches the settled first frame
await p.screenshot({path:"/tmp/app-poster.png"});
const m=await sharp("/tmp/app-poster.png").metadata();
await sharp("/tmp/app-poster.png").webp({quality:90}).toFile("public/marketing/app-opening-poster.webp");
const fs=await import("fs");
console.log("poster:", m.width+"x"+m.height, Math.round(fs.statSync("public/marketing/app-opening-poster.webp").size/1024)+"KB");
await b.close();
