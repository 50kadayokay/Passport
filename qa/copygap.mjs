// How long is the beat copy invisible during flings? The screen recording showed it absent
// for ~1s at a time, which is most of why the walkthrough reads as "glitchy".
import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const BASE=process.argv[2]||"http://localhost:5197";
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const p=await b.newPage();
await p.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
await p.goto(BASE+"/pro",{waitUntil:"domcontentloaded",timeout:90000}); await sleep(5500);
await p.evaluate(()=>{ window.__vis=[];
  const tick=()=>{ const el=[...document.querySelectorAll(".mx-story-m h2")][0];
    let op=0; if(el){ op=1; for(let a=el;a&&a.nodeType===1;a=a.parentElement){ const o=+getComputedStyle(a).opacity; if(!isNaN(o)) op*=o; } }
    window.__vis.push([performance.now(), el?+op.toFixed(2):0]); requestAnimationFrame(tick); };
  requestAnimationFrame(tick); });
for(let i=0;i<6;i++){
  await p.touchscreen.touchStart(195,790);
  for(let s=1;s<=4;s++) await p.touchscreen.touchMove(195,790-s*175);
  await p.touchscreen.touchEnd();
  await sleep(1500);
}
const r=await p.evaluate(()=>{ const v=window.__vis; let worst=0,cur=0,start=0;
  for(let i=1;i<v.length;i++){ if(v[i][1]<0.1){ if(!cur){cur=1;start=v[i][0];} } else { if(cur){ worst=Math.max(worst,v[i][0]-start); cur=0; } } }
  if(cur) worst=Math.max(worst,v[v.length-1][0]-start);
  const blank=v.filter(x=>x[1]<0.1).length;
  return { samples:v.length, blankFrames:blank, pctBlank:Math.round(blank/v.length*100), longestBlankMs:Math.round(worst) }; });
console.log(BASE, JSON.stringify(r));
await b.close();
