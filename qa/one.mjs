import puppeteer from "puppeteer-core";
import fs from "fs";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const [dir,path,name,W,H]=[process.argv[2],process.argv[3],process.argv[4],+process.argv[5],+process.argv[6]];
fs.mkdirSync(dir,{recursive:true});
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const p=await b.newPage();
await p.setViewport({width:W,height:H,deviceScaleFactor:2});
await p.goto("http://localhost:5197"+path,{waitUntil:"networkidle2"}).catch(()=>{});
await sleep(6000);
await p.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=600){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,120));}window.scrollTo(0,0);});
await sleep(1800);
const h=await p.evaluate(()=>document.body.scrollHeight);
for(const [tag,y] of [["top",0],["mid",Math.round(h*0.42)],["bot",Math.max(0,h-H)]]){
  await p.evaluate((yy)=>window.scrollTo(0,yy),y); await sleep(900);
  await p.screenshot({path:`${dir}/${name}-${tag}.png`});
}
await b.close(); console.log("ok");
