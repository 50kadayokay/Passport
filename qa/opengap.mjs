// Does the app layer stop covering the screen opening at any state? (black backing showing)
import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const B=process.argv[2]||"http://localhost:5197", ROUTE=process.argv[3]||"/pro";
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const p=await b.newPage(); await p.setCacheEnabled(false);
await p.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
await p.goto(B+ROUTE,{waitUntil:"domcontentloaded",timeout:90000}); await sleep(5200);
await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Explore the product"]'); if(e)e.click();});
await sleep(1100);
const read=()=>p.evaluate(()=>{
  const f=[...document.querySelectorAll("iframe")].find(x=>(x.src||"").includes("/app?"));
  if(!f) return null;
  const a=f.parentElement.getBoundingClientRect();
  let op=null;
  for(const el of document.querySelectorAll("div")){
    const cs=getComputedStyle(el);
    if(cs.backgroundColor==="rgb(0, 0, 0)" && el.getBoundingClientRect().height>200){ op=el.getBoundingClientRect(); break; } }
  if(!op) return null;
  return { bottomGap:Math.round(op.bottom-a.bottom), topGap:Math.round(a.top-op.top),
           head:(document.querySelector("h2")||{}).innerText?.trim().slice(0,30) };
});
for(let i=0;i<16;i++){
  await sleep(1400);
  const r=await read();
  if(r) console.log(`state ${String(i).padStart(2)}: bottomGap ${String(r.bottomGap).padStart(4)}  topGap ${String(r.topGap).padStart(4)}${r.bottomGap>1?"  ← BLACK SHOWING":""}   "${r.head}"`);
  const more=await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Next"]'); if(!e||e.disabled) return false; e.click(); return true;});
  if(!more) break;
}
await b.close();
