// Frame-level smoothness INSIDE the phone, mobile viewport only.
// Counts long frames (>32ms = a dropped frame at 60fps) and total main-thread blocking
// during the window when the opening animation and the card flip run.
import puppeteer from "puppeteer-core";
const BASE=process.argv[2], LABEL=process.argv[3], N=Number(process.argv[4]||1);
const sleep=m=>new Promise(r=>setTimeout(r,m));
const PROBE=`
window.__f={long:0,total:0,worst:0,blocking:0,poster:null};
try{new PerformanceObserver(l=>{for(const e of l.getEntries())window.__f.blocking+=e.duration;}).observe({type:'longtask',buffered:true});}catch(_){}
(()=>{const F=window.__f;let last=performance.now();
 const tick=(t)=>{const d=t-last;last=t;F.total++;
   if(d>32){F.long++; if(d>F.worst)F.worst=Math.round(d);}
   if(F.poster===null){const p=[...document.querySelectorAll('img')].find(i=>/opening-poster/.test(i.currentSrc||''));
     if(p&&p.currentSrc)F.poster=p.currentSrc.split('/').pop();}
   if(performance.now()<14000)requestAnimationFrame(tick);};
 requestAnimationFrame(tick);})();`;
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],
  defaultViewport:{width:390,height:844,deviceScaleFactor:3,isMobile:true,hasTouch:true}});
const out=[];
for(const path of (process.env.PATHS||'/home,/pro').split(',')){
 const runs=[];
 for(let i=0;i<N;i++){
  const p=await b.newPage(); await p.evaluateOnNewDocument(PROBE); await p.setCacheEnabled(false);
  const c=await p.createCDPSession(); await c.send('Network.enable');
  await c.send('Network.emulateNetworkConditions',{offline:false,latency:40,downloadThroughput:10*1024*1024/8,uploadThroughput:3*1024*1024/8});
  await c.send('Emulation.setCPUThrottlingRate',{rate:4});   // a phone, not a Mac
  await p.goto(BASE+path,{waitUntil:'domcontentloaded',timeout:90000});
  await sleep(15000);
  const f=await p.evaluate(()=>window.__f);
  runs.push(f);
  await p.close();
 }
 const med=k=>[...runs.map(r=>r[k])].sort((a,b)=>a-b)[Math.floor(runs.length/2)];
 out.push({path, poster:runs[0].poster, long:med('long'), worst:med('worst'), blocking:med('blocking'),
           allLong:runs.map(r=>r.long).join('/'), allWorst:runs.map(r=>r.worst).join('/')});
}
console.log(LABEL);
for(const r of out) console.log(`  ${r.path.padEnd(8)} ${String(r.poster).padEnd(30)} dropped med ${String(r.long).padStart(3)} (${r.allLong})  worst med ${String(r.worst).padStart(4)}ms (${r.allWorst})  blocking ${String(Math.round(r.blocking)).padStart(5)}ms`);
await b.close();
