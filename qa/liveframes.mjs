// How many live product iframes run at once during the app walkthrough?
import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const B=process.argv[2]||"http://localhost:5197";
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const p=await b.newPage(); await p.setCacheEnabled(false);
await p.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
await p.goto(B+"/",{waitUntil:"domcontentloaded",timeout:90000}); await sleep(5500);
await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Explore the product"]'); if(e)e.click();});
await sleep(1000);
for(let i=0;i<9;i++){
  const r=await p.evaluate(()=>({n:document.querySelectorAll("iframe").length,
    srcs:[...document.querySelectorAll("iframe")].map(f=>(f.src||"").includes("confv3")?"conf":"app")}));
  console.log(`state ${i}: ${r.n} iframe(s) [${r.srcs.join(", ")}]`);
  const more=await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Next"]'); if(!e||e.disabled) return false; e.click(); return true;});
  if(!more) break; await sleep(900);
}
await b.close();
