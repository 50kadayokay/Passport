// Frame smoothness INSIDE the phone's iframe — where the card flip, the status bar and
// the deck bars actually animate. Same-origin, so we can run a sampler in that document.
import puppeteer from "puppeteer-core";
const BASE=process.argv[2], LABEL=process.argv[3], N=Number(process.argv[4]||3);
const sleep=m=>new Promise(r=>setTimeout(r,m));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],
  defaultViewport:{width:390,height:844,deviceScaleFactor:3,isMobile:true,hasTouch:true}});
const res={};
for(const path of (process.env.PATHS||'/home,/pro').split(',')){
  const runs=[];
  for(let i=0;i<N;i++){
    const p=await b.newPage(); await p.setCacheEnabled(false);
    const c=await p.createCDPSession(); await c.send('Network.enable');
    await c.send('Network.emulateNetworkConditions',{offline:false,latency:40,downloadThroughput:10*1024*1024/8,uploadThroughput:3*1024*1024/8});
    await c.send('Emulation.setCPUThrottlingRate',{rate:4});
    await p.goto(BASE+path,{waitUntil:'domcontentloaded',timeout:90000});
    // Install the sampler THE MOMENT the iframe document exists. Waiting 6s meant sampling
    // after the opening animation and the card flip had already finished, which is exactly
    // the window being complained about.
    let ok=false;
    for(let k=0;k<120 && !ok;k++){
      ok = await p.evaluate(()=>{ const f=document.querySelector('iframe'); if(!f) return false;
      try{ const w=f.contentWindow; if(!w) return false;
        w.__j={long:0,total:0,worst:0};
        const J=w.__j; let last=w.performance.now();
        const tick=(t)=>{const d=t-last;last=t;J.total++; if(d>32){J.long++; if(d>J.worst)J.worst=Math.round(d);} if(w.performance.now()-0<60000&&J.total<1200) w.requestAnimationFrame(tick);};
        w.requestAnimationFrame(tick); return true; }catch(_){return false;} });
      if(!ok) await sleep(100);
    }
    await sleep(12000);                        // sample through the flip / status-bar animation
    const j = await p.evaluate(()=>{ const f=document.querySelector('iframe');
      try{ return f.contentWindow.__j || null; }catch(_){ return null; } });
    if(ok&&j) runs.push(j);
    await p.close();
  }
  if(!runs.length){ res[path]='could not sample'; continue; }
  const med=k=>[...runs.map(r=>r[k])].sort((a,b)=>a-b)[Math.floor(runs.length/2)];
  const pct = runs.map(r=>r.total?Math.round(r.long/r.total*1000)/10:0);
  res[path]={dropped:med('long'), worst:med('worst'), frames:med('total'),
             pctDropped: [...pct].sort((a,b)=>a-b)[Math.floor(pct.length/2)], all:runs.map(r=>r.long).join('/')};
}
console.log(LABEL);
for(const k in res){ const r=res[k];
  console.log(typeof r==='string' ? `  ${k.padEnd(8)} ${r}` :
    `  ${k.padEnd(8)} frames ${String(r.frames).padStart(4)}  dropped ${String(r.dropped).padStart(3)} (${r.all})  ${String(r.pctDropped).padStart(4)}%  worst ${String(r.worst).padStart(4)}ms`); }
await b.close();
