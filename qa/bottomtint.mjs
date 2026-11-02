// The page's own background at its BOTTOM rows must match #fbfcfe (251,252,254).
// Any residual tint there meets the browser UI as a visible full-width step — which a
// headless screenshot cannot show, because it has no browser UI to meet.
import puppeteer from "puppeteer-core";
import sharp from "sharp";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const B=process.argv[2]||"http://localhost:5197";
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const p=await b.newPage(); await p.setCacheEnabled(false);
await p.setViewport({width:390,height:844,deviceScaleFactor:3,isMobile:true,hasTouch:true});
await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
await p.goto(B+"/",{waitUntil:"domcontentloaded",timeout:90000}); await sleep(9000);
await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Explore the product"]'); if(e)e.click();});
await sleep(900);
for(let i=0;i<8;i++){ await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Next"]'); if(e&&!e.disabled)e.click();}); await sleep(900); }
await sleep(3000);
const {data,info}=await sharp(await p.screenshot()).raw().toBuffer({resolveWithObject:true});
const W=info.width,H=info.height,C=info.channels;
const avg=(y,x0,x1)=>{let r=0,g=0,bl=0,n=0;for(let x=x0;x<x1;x+=3){const i=(y*W+x)*C;r+=data[i];g+=data[i+1];bl+=data[i+2];n++;}return [r,g,bl].map(v=>Math.round(v/n));};
const target=[251,252,254];
console.log("page bottom rows vs #fbfcfe (251,252,254):");
for(const frac of [0.90,0.94,0.97,0.995]){
  const y=Math.min(H-2,Math.round(H*frac));
  const L=avg(y,40,Math.round(W*0.35)), R=avg(y,Math.round(W*0.6),W-40);
  const dev=Math.max(...L.map((v,i)=>Math.abs(v-target[i])), ...R.map((v,i)=>Math.abs(v-target[i])));
  console.log(`  ${(frac*100).toFixed(1)}%  left ${L.join(",")}  glowSide ${R.join(",")}   max deviation ${dev}${dev>4?"  <<< VISIBLE STEP vs browser UI":""}`);
}
await b.close();
