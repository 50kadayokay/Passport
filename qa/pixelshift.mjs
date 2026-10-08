// Pixel-level assertion: crop the phone SCREEN at every state and find where the rendered
// content actually starts and ends. No DOM selectors — they measured hidden elements before.
import puppeteer from "puppeteer-core";
import sharp from "sharp";
import fs from "fs";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const B=process.argv[2]||"http://localhost:5197", ROUTE=process.argv[3]||"/pro";
const OUT="/private/tmp/claude-501/-Users-leifer-Passport-V1/4d9fc2e9-c8af-4a55-9854-42380ee52983/scratchpad/px";
fs.mkdirSync(OUT,{recursive:true});
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const p=await b.newPage(); await p.setCacheEnabled(false);
await p.setViewport({width:390,height:844,deviceScaleFactor:3,isMobile:true,hasTouch:true});
await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
await p.goto(B+ROUTE,{waitUntil:"domcontentloaded",timeout:90000}); await sleep(6500);
await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Explore the product"]'); if(e)e.click();});
await sleep(1200);
// the screen opening, in page px
const op=await p.evaluate(()=>{
  for(const el of document.querySelectorAll("div")){
    const s=getComputedStyle(el), q=el.getBoundingClientRect();
    if(q.height>200&&el.getAttribute("aria-hidden")==="true"&&s.backgroundColor==="rgb(244, 245, 247)")
      return {x:q.left,y:q.top,w:q.width,h:q.height};
  } return null;});
console.log("screen opening:",JSON.stringify(op));
console.log("st | beat                         | firstContentRow lastContentRow  (rows from the TOP of the opening)");
let base=null;
for(let i=0;i<22;i++){
  await sleep(1300);
  const beat=await p.evaluate(()=>{const h=document.querySelector("h2"); const l=document.querySelector(".mx-label");
    return ((l?l.innerText.replace(/\s+/g," "):"")+" "+(h?h.innerText:"")).trim().slice(0,28);});
  const clip={x:Math.round(op.x),y:Math.round(op.y),width:Math.round(op.w),height:Math.round(op.h)};
  const buf=await p.screenshot({clip});
  const {data,info}=await sharp(buf).raw().toBuffer({resolveWithObject:true});
  const W=info.width,H=info.height,C=info.channels;
  // a "content row" differs from the flat screen background (#f4f5f7)
  const isContent=(y)=>{ let n=0;
    for(let x=Math.floor(W*0.12);x<W*0.88;x+=4){ const k=(y*W+x)*C;
      const r=data[k],g=data[k+1],bl=data[k+2];
      if(Math.abs(r-244)>10||Math.abs(g-245)>10||Math.abs(bl-247)>10) n++; }
    return n>3; };
  let first=-1,last=-1;
  for(let y=0;y<H;y++) if(isContent(y)){first=y;break;}
  for(let y=H-1;y>=0;y--) if(isContent(y)){last=y;break;}
  if(base===null) base={first,last};
  const d=(first!==base.first||Math.abs(last-base.last)>2)?`  <<< SHIFT first ${base.first}->${first}, last ${base.last}->${last}`:"";
  console.log(`${String(i).padStart(2)} | ${beat.padEnd(28)} | ${String(first).padStart(3)} ${String(last).padStart(5)}${d}`);
  if(d) await sharp(buf).toFile(`${OUT}/shift-${i}.png`);
  const more=await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Next"]'); if(!e||e.disabled) return false; e.click(); return true;});
  if(!more) break;
}
await b.close();
