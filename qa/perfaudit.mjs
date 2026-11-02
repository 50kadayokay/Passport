// Performance audit of the phone/tablet demos on a phone viewport.
import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const B=process.argv[2]||"http://localhost:5197", ROUTE=process.argv[3]||"/";
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const p=await b.newPage(); await p.setCacheEnabled(false);
await p.setViewport({width:390,height:844,deviceScaleFactor:3,isMobile:true,hasTouch:true});
await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
// a real iPhone is far slower than this Mac; throttle so the numbers mean something
const cdp=await p.target().createCDPSession();
await cdp.send("Emulation.setCPUThrottlingRate",{rate:6});
await p.goto(B+ROUTE,{waitUntil:"domcontentloaded",timeout:120000}); await sleep(7000);
await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Explore the product"]'); if(e)e.click();});
await sleep(1500);

console.log("=== COMPOSITING / PAINT COST (counts of expensive effects on screen) ===");
console.log(JSON.stringify(await p.evaluate(()=>{
  const out={backdropFilter:[],blurFilter:[],masks:0,bigShadows:0,willChange:[],iframes:0,transformedIframeParents:0,stickies:0,totalEls:0};
  document.querySelectorAll("*").forEach(el=>{
    out.totalEls++;
    const s=getComputedStyle(el), r=el.getBoundingClientRect();
    const onScreen = r.width>4&&r.height>4&&r.bottom>0&&r.top<innerHeight;
    const bf=s.backdropFilter||s.webkitBackdropFilter||"none";
    if(bf!=="none"&&onScreen) out.backdropFilter.push(`${el.tagName}.${(el.className||"").toString().split(" ")[0]} ${Math.round(r.width)}x${Math.round(r.height)} ${bf.slice(0,24)}`);
    if(s.filter&&s.filter.includes("blur")&&onScreen){const m=s.filter.match(/blur\(([\d.]+)px\)/); out.blurFilter.push(`${Math.round(r.width)}x${Math.round(r.height)} blur ${m?m[1]:"?"}`);}
    if((s.webkitMaskImage||s.maskImage||"none")!=="none"&&onScreen) out.masks++;
    if(s.boxShadow&&s.boxShadow!=="none"){const m=s.boxShadow.match(/(\d+)px/g); if(m&&m.some(v=>parseInt(v)>24)) out.bigShadows++;}
    if(s.willChange&&s.willChange!=="auto") out.willChange.push(`${(el.className||"").toString().split(" ")[0]||el.tagName}:${s.willChange}`);
    if(s.position==="sticky") out.stickies++;
  });
  document.querySelectorAll("iframe").forEach(f=>{ out.iframes++;
    for(let a=f.parentElement;a&&a!==document.body;a=a.parentElement){
      if(getComputedStyle(a).transform!=="none"){out.transformedIframeParents++;break;} } });
  out.backdropFilter=out.backdropFilter.slice(0,6); out.blurFilter=out.blurFilter.slice(0,6);
  out.willChange=[...new Set(out.willChange)].slice(0,8);
  return out;
},null,1)));

console.log("\n=== FRAME COST DURING AN ARROW PRESS (6x CPU throttle) ===");
await p.evaluate(()=>{ window.__f=[]; let last=performance.now();
  const tick=()=>{const n=performance.now(); window.__f.push(n-last); last=n; requestAnimationFrame(tick);}; requestAnimationFrame(tick);
  window.__long=[]; try{ new PerformanceObserver(l=>{for(const e of l.getEntries()) window.__long.push(Math.round(e.duration));}).observe({entryTypes:["longtask"]}); }catch(_){}
});
await sleep(600);
for(let k=0;k<4;k++){ await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Next"]'); if(e&&!e.disabled)e.click();}); await sleep(1600); }
console.log(JSON.stringify(await p.evaluate(()=>{
  const f=window.__f.filter(x=>x>0).slice(5);
  const sorted=[...f].sort((a,b)=>a-b);
  const pc=q=>Math.round(sorted[Math.floor(sorted.length*q)]||0);
  return { frames:f.length, medianMs:pc(0.5), p90Ms:pc(0.9), worstMs:Math.round(Math.max(...f)),
           over32ms:f.filter(x=>x>32).length, longTasks:window.__long.length,
           longestTaskMs:window.__long.length?Math.max(...window.__long):0 };
},null,1)));
await b.close();
