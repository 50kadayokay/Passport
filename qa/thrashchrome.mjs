// Hard swiping WHILE the viewport height changes — Safari retracting and restoring its
// chrome mid-gesture. The plain thrash test holds the height constant and never reproduced
// the user's crash; this is the closer approximation. (It is still an approximation:
// headless Chrome resolves svh/dvh/lvh identically because it has no chrome of its own.)
import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const BASE=process.argv[2]||"https://mineex.ca";
const ROUTE=process.argv[3]||"/pro";
const N=+(process.argv[4]||80);
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const p=await b.newPage();
const SMALL=740, BIG=844;   // chrome shown / chrome hidden
await p.setViewport({width:390,height:SMALL,deviceScaleFactor:2,isMobile:true,hasTouch:true});
await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
let dead=false; const errs=[];
p.on("pageerror",e=>errs.push("PAGEERROR "+e.message.slice(0,140)));
p.on("console",m=>{if(m.type()==="error")errs.push("CONSOLE "+m.text().slice(0,140));});
p.on("crash",()=>{dead=true;errs.push("*** RENDERER CRASHED ***");});
await p.goto(BASE+ROUTE,{waitUntil:"domcontentloaded",timeout:90000}); await sleep(5500);

// Does the stage actually fill the window, at both heights?
const gap=async(tag)=>{ try{ return await p.evaluate(()=>{
  // the pinned stage, found by behaviour so it works on builds with and without the class
  let st=null;
  for(const el of document.querySelectorAll("div,section")){
    if(getComputedStyle(el).position!=="sticky") continue;
    const r=el.getBoundingClientRect();
    if(r.height>200 && (!st || r.height>st.getBoundingClientRect().height)) st=el;
  }
  if(!st) return {err:"no sticky stage"};
  const r=st.getBoundingClientRect();
  return { stage:Math.round(r.height), win:window.innerHeight, gap:Math.round(window.innerHeight-r.height) };
}); }catch(e){ return {err:String(e).slice(0,60)}; } };

console.log(`${ROUTE}`);
console.log("  at", SMALL, JSON.stringify(await gap()));
await p.setViewport({width:390,height:BIG,deviceScaleFactor:2,isMobile:true,hasTouch:true}); await sleep(900);
console.log("  at", BIG, JSON.stringify(await gap()), " <- gap>0 means a strip of bare page under the stage");

let big=true, peak=0;
for(let i=1;i<=N && !dead;i++){
  await p.touchscreen.touchStart(195, big?780:700);
  for(let s=1;s<=4;s++) await p.touchscreen.touchMove(195, Math.round((big?780:700) - s*170));
  await p.touchscreen.touchEnd();
  if(i%3===0){ big=!big; try{ await p.setViewport({width:390,height:big?BIG:SMALL,deviceScaleFactor:2,isMobile:true,hasTouch:true}); }catch(_){ dead=true; } }
  await sleep(35);
  if(i%20===0){
    const r=await gap(); if(!r||r.err){ dead=true; break; }
    const m=await p.evaluate(()=>performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):-1).catch(()=>-1);
    peak=Math.max(peak,m);
    console.log(`   ${String(i).padStart(3)} flicks + ${Math.floor(i/3)} chrome flips  stage ${r.stage}/${r.win}  gap ${r.gap}  heap ${m}MB`);
  }
}
console.log(dead?"  *** TAB DIED ***":"  survived");
console.log("  errors:",errs.length?[...new Set(errs)].slice(0,6):"none");
await b.close();
