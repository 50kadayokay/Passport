// Re-capture /marketing/appshots/*.webp at a device pixel ratio that matches real phones.
import puppeteer from "puppeteer-core";
import sharp from "sharp";
import fs from "fs";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const DPR=3, W=390, H=844;
const NAMES=process.argv.slice(2);
const OUT="/tmp/appshots-new"; fs.mkdirSync(OUT,{recursive:true});
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox","--force-device-scale-factor=3"]});
for(const n of NAMES){
  const p=await b.newPage();
  await p.setViewport({width:W,height:H,deviceScaleFactor:DPR});
  await p.goto(`http://localhost:5197/site?appshot=${n}`,{waitUntil:"networkidle2",timeout:45000}).catch(()=>{});
  await sleep(3500);
  const el=await p.$("#appshot-stage");
  if(!el){console.log(n,"NO STAGE");await p.close();continue;}
  const png=`${OUT}/${n}.png`;
  await el.screenshot({path:png});
  const m=await sharp(png).metadata();
  await sharp(png).webp({quality:88}).toFile(`${OUT}/${n}.webp`);
  const kb=Math.round(fs.statSync(`${OUT}/${n}.webp`).size/1024);
  console.log(n.padEnd(12), m.width+"x"+m.height, kb+"KB");
  await p.close();
}
await b.close();
