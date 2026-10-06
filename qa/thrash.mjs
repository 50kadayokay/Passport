// HARD swiping: fast, long flicks with no settle time between them — the thing the gentle
// 40-swipe test never did. Watches for the renderer dying (Safari's "a problem repeatedly
// occurred"), and reports iframe count + DECODED BITMAP bytes, which is what actually
// killed the tab last time and never shows up in performance.memory.
import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const BASE=process.argv[2]||"https://mineex.ca";
const ROUTE=process.argv[3]||"/";
const N=+(process.argv[4]||60);
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const p=await b.newPage();
await p.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
let dead=false, errs=[];
p.on("pageerror",e=>errs.push("PAGEERROR "+e.message.slice(0,140)));
p.on("console",m=>{if(m.type()==="error")errs.push("CONSOLE "+m.text().slice(0,140));});
p.on("crash",()=>{dead=true;errs.push("*** RENDERER CRASHED ***");});
await p.goto(BASE+ROUTE,{waitUntil:"domcontentloaded",timeout:90000}); await sleep(5500);

const probe=async()=>{ try{ return await p.evaluate(()=>{
  let px=0,n=0; const seen=new Set();
  const add=(w,h,k)=>{ if(!w||!h||seen.has(k))return; seen.add(k); px+=w*h; n++; };
  for(const im of document.images){ if(im.naturalWidth) add(im.naturalWidth,im.naturalHeight,im.currentSrc||im.src); }
  for(const el of document.querySelectorAll("*")){ const bi=getComputedStyle(el).backgroundImage;
    if(!bi||bi==="none")continue; const m=bi.match(/url\("?([^")]+)"?\)/g)||[];
    for(const u of m){ const src=u.replace(/^url\("?|"?\)$/g,""); if(seen.has(src))continue;
      const r=el.getBoundingClientRect(); add(Math.max(r.width,1)*3,Math.max(r.height,1)*3,src); } }
  return { mb:Math.round(px*4/1048576), imgs:n,
           iframes:document.querySelectorAll("iframe").length,
           nodes:document.querySelectorAll("*").length,
           heap: performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):-1,
           y:Math.round(window.scrollY) }; }); }catch(e){ return null; } };

const start=await probe();
console.log(`${ROUTE}  start: bitmap ${start.mb}MB/${start.imgs}img  iframes ${start.iframes}  nodes ${start.nodes}  heap ${start.heap}MB`);

let peak={mb:0,iframes:0,nodes:0};
for(let i=1;i<=N && !dead;i++){
  // a HARD flick: long throw, few steps, no pause afterwards
  const up = i % 7 !== 0;             // mostly down the page, occasionally back up
  const y0 = up?780:120, y1 = up?90:800;
  await p.touchscreen.touchStart(195,y0);
  const stepN=4, dy=(y1-y0)/stepN;
  for(let s=1;s<=stepN;s++) await p.touchscreen.touchMove(195,Math.round(y0+dy*s));
  await p.touchscreen.touchEnd();
  await sleep(40);                    // deliberately far too short to settle
  if(i%10===0){
    const r=await probe();
    if(!r){ dead=true; break; }
    peak.mb=Math.max(peak.mb,r.mb); peak.iframes=Math.max(peak.iframes,r.iframes); peak.nodes=Math.max(peak.nodes,r.nodes);
    console.log(`  ${String(i).padStart(3)} flicks  y${String(r.y).padStart(5)}  bitmap ${String(r.mb).padStart(4)}MB/${String(r.imgs).padStart(3)}img  iframes ${r.iframes}  nodes ${r.nodes}  heap ${r.heap}MB`);
  }
}
console.log(dead ? "  *** TAB DIED ***" : "  survived");
console.log("  peak: bitmap",peak.mb+"MB  iframes",peak.iframes,"  nodes",peak.nodes);
console.log("  errors:",errs.length?[...new Set(errs)].slice(0,5):"none");
await b.close();
