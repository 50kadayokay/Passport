// How much of the device's screen is blank at each state? The recording shows the app
// rendering as a mostly-white rectangle on several beats.
import puppeteer from "puppeteer-core";
import fs from "fs";
import sharp from "sharp";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const B=process.argv[2]||"http://localhost:5197";
const ROUTE=process.argv[3]||"/";
const OUT="/private/tmp/claude-501/-Users-leifer-Passport-V1/4d9fc2e9-c8af-4a55-9854-42380ee52983/scratchpad/blank";
fs.mkdirSync(OUT,{recursive:true});
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const p=await b.newPage(); await p.setCacheEnabled(false);
await p.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
await p.goto(B+ROUTE,{waitUntil:"domcontentloaded",timeout:90000}); await sleep(5500);
await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Explore the product"]'); if(e)e.click();});
await sleep(1200);
for(let i=0;i<10;i++){
  await sleep(1800);                       // generous: well past any transition
  const box=await p.evaluate(()=>{
    let dev=null;
    for(const el of document.querySelectorAll("div")){
      const bi=getComputedStyle(el).backgroundImage||"";
      if(bi.includes("pro-phone-79")&&!bi.includes("blur")){const r=el.getBoundingClientRect();
        if(r.height>200&&(!dev||r.top<dev.top))dev={x:r.left,y:r.top,w:r.width,h:r.height};}}
    return dev;
  });
  if(box){
    const clip={x:Math.round(box.x+box.w*0.10),y:Math.round(box.y+box.h*0.10),
                width:Math.round(box.w*0.80),height:Math.round(box.h*0.78)};
    const buf=await p.screenshot({clip});
    const {data,info}=await sharp(buf).raw().toBuffer({resolveWithObject:true});
    let near=0,tot=0;
    for(let k=0;k<data.length;k+=info.channels*7){
      const r=data[k],g=data[k+1],bl=data[k+2];
      if(r>243&&g>243&&bl>243) near++; tot++;
    }
    fs.writeFileSync(`${OUT}/${ROUTE.replace(/\W/g,"")||"home"}-${i}.png`, buf);
    console.log(`state ${i}: screen ${Math.round(near/tot*100)}% near-white`);
  } else console.log(`state ${i}: no device`);
  const more=await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Next"]'); if(!e||e.disabled) return false; e.click(); return true;});
  if(!more) break;
}
await b.close();
