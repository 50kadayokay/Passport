// Per-COLUMN horizontal-edge detection. Averaging across the width hides a localised
// boundary; this finds the strongest edge in any single column and reports how many
// columns share that row (a real cutoff is a line, so many columns agree on one y).
import puppeteer from "puppeteer-core";
import sharp from "sharp";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const B=process.argv[2]||"http://localhost:5197";
const OUT="/private/tmp/claude-501/-Users-leifer-Passport-V1/4d9fc2e9-c8af-4a55-9854-42380ee52983/scratchpad";
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const p=await b.newPage(); await p.setCacheEnabled(false);
await p.setViewport({width:390,height:844,deviceScaleFactor:3,isMobile:true,hasTouch:true});
await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
await p.goto(B+"/",{waitUntil:"domcontentloaded",timeout:90000}); await sleep(9000);
await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Explore the product"]'); if(e)e.click();});
await sleep(900);
for(let i=0;i<8;i++){ await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Next"]'); if(e&&!e.disabled)e.click();}); await sleep(900); }
await sleep(3500);
const shot=await p.screenshot();
await sharp(shot).toFile(`${OUT}/grad-now.png`);
const {data,info}=await sharp(shot).raw().toBuffer({resolveWithObject:true});
const W=info.width,H=info.height,C=info.channels;
const px=(x,y)=>{const i=(y*W+x)*C; return [data[i],data[i+1],data[i+2]];};
const hist={};
let best={d:0};
for(let x=8;x<W-8;x+=3){
  for(let y=Math.floor(H*0.55);y<H-4;y++){
    const a=px(x,y-2), c=px(x,y+2);
    const d=Math.abs(a[0]-c[0])+Math.abs(a[1]-c[1])+Math.abs(a[2]-c[2]);
    if(d>8){ hist[y]=(hist[y]||0)+1; if(d>best.d) best={d,x,y}; }
  }
}
const rows=Object.entries(hist).map(([y,n])=>[+y,n]).sort((a,c)=>c[1]-a[1]).slice(0,5);
console.log("strongest single-column edge:", JSON.stringify(best));
console.log("rows where MANY columns change at once (y, columnCount):", JSON.stringify(rows));
console.log("image", W+"x"+H, " (a real horizontal cutoff = one y shared by hundreds of columns)");
await b.close();
