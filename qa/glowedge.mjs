// Find the hard horizontal edge in the tablet section and name the element that makes it.
import puppeteer from "puppeteer-core";
import sharp from "sharp";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const B=process.argv[2]||"http://localhost:5197";
const OUT="/private/tmp/claude-501/-Users-leifer-Passport-V1/4d9fc2e9-c8af-4a55-9854-42380ee52983/scratchpad";
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const p=await b.newPage(); await p.setCacheEnabled(false);
await p.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
await p.goto(B+"/",{waitUntil:"domcontentloaded",timeout:90000}); await sleep(6000);
await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Explore the product"]'); if(e)e.click();});
await sleep(900);
// advance until the tablet chapter is on screen
for(let k=0;k<9;k++){ await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Next"]'); if(e&&!e.disabled)e.click();}); await sleep(700); }
await sleep(2000);
const head=await p.evaluate(()=>(document.querySelector("h2")||{}).innerText?.slice(0,40));
const buf=await p.screenshot();
await sharp(buf).toFile(`${OUT}/tablet-section.png`);
const {data,info}=await sharp(buf).raw().toBuffer({resolveWithObject:true});
const W=info.width,H=info.height,C=info.channels;
const row=(y)=>{let r=0,g=0,bl=0,n=0;
  for(let x=Math.floor(W*0.08);x<W*0.92;x+=5){const k=(y*W+x)*C; r+=data[k];g+=data[k+1];bl+=data[k+2];n++;}
  return [r/n,g/n,bl/n];};
let worst=0,at=0;
for(let y=Math.floor(H*0.82);y<H*0.99;y++){
  const a=row(y-1),c=row(y+1);
  const d=Math.abs(a[0]-c[0])+Math.abs(a[1]-c[1])+Math.abs(a[2]-c[2]);
  if(d>worst){worst=d;at=y;}
}
const cssY=Math.round(at/2);
console.log(`chapter "${head}"  sharpest horizontal edge: delta ${worst.toFixed(1)} at css y=${cssY}`);
console.log(JSON.stringify(await p.evaluate((y)=>{
  const hits=[];
  document.querySelectorAll("*").forEach(el=>{
    const q=el.getBoundingClientRect();
    if(q.width<100||q.height<30) return;
    if(Math.abs(q.bottom-y)<6){
      const cs=getComputedStyle(el);
      hits.push({tag:el.tagName.toLowerCase()+(el.className&&typeof el.className==="string"?"."+el.className.split(" ").filter(Boolean).slice(0,2).join("."):""),
        bottom:Math.round(q.bottom), h:Math.round(q.height), overflow:cs.overflow, bg:cs.backgroundColor.slice(0,24),
        bgImg:(cs.backgroundImage||"none").slice(0,40), tf:cs.transform==="none"?"none":"yes", mask:(cs.webkitMaskImage||cs.maskImage||"none").slice(0,24)});
    }});
  return hits.slice(0,6);
},cssY),null,1));
await b.close();
