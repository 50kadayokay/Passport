// Frame smoothness INSIDE the phone's app frame — installed via addScriptToEvaluateOnNewDocument
// so it is present in EVERY document, including the iframe's own and any remount.
import puppeteer from "puppeteer-core";
const BASE=process.argv[2], LABEL=process.argv[3], N=Number(process.argv[4]||3);
const MOB = process.env.DESKTOP!=='1';
const sleep=m=>new Promise(r=>setTimeout(r,m));
const PROBE = `
(() => {
  if (window.__jank) return;
  const J = { long:0, total:0, worst:0, blocking:0, t0: performance.now(), isChild: window !== window.top, url: location.pathname+location.search };
  window.__jank = J;
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) J.blocking += e.duration; })
          .observe({ type:'longtask', buffered:true }); } catch(_) {}
  let last = performance.now();
  const tick = (t) => { const d = t - last; last = t; J.total++;
    if (d > 32) { J.long++; if (d > J.worst) J.worst = Math.round(d); }
    requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
})();`;

const b = await puppeteer.launch({ executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless:"new", args:["--no-sandbox"],
  defaultViewport: MOB ? {width:390,height:844,deviceScaleFactor:3,isMobile:true,hasTouch:true} : {width:1440,height:900} });

const agg = {};
for (const path of (process.env.PATHS || '/home,/pro').split(',')) {
  const runs = [];
  for (let i=0;i<N;i++) {
    const p = await b.newPage(); await p.setCacheEnabled(false);
    const c = await p.createCDPSession();
    await c.send('Page.enable'); await c.send('Network.enable');
    await c.send('Page.addScriptToEvaluateOnNewDocument', { source: PROBE });   // ALL frames
    await c.send('Network.emulateNetworkConditions',{offline:false,latency:40,downloadThroughput:10*1024*1024/8,uploadThroughput:3*1024*1024/8});
    await c.send('Emulation.setCPUThrottlingRate',{rate:4});
    await p.goto(BASE+path,{waitUntil:'domcontentloaded',timeout:90000});
    await sleep(4000);
    // SCROLL THROUGH THE WALKTHROUGH. These animations are scroll-driven, and an iframe
    // that is off-screen has its animation frames throttled to nothing — which is why a
    // stationary sample recorded exactly one frame. This is also simply how the page is
    // used: the flip, the capital bar, the outlines and the deck bars all play as the
    // visitor scrolls into them.
    await p.evaluate(async () => {
      const H = document.body.scrollHeight;
      for (let y = 0; y <= H; y += 260) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 220)); }
    });
    await sleep(3000);
    let best = null;
    for (const f of p.frames()) {
      try { const j = await f.evaluate(()=>window.__jank||null);
        if (j && j.isChild && (!best || j.total > best.total)) best = j; } catch(_) {}
    }
    if (best) runs.push(best);
    await p.close();
  }
  if (!runs.length) { agg[path] = 'no child frame sampled'; continue; }
  const med = k => [...runs.map(r=>r[k])].sort((a,b)=>a-b)[Math.floor(runs.length/2)];
  agg[path] = { frames: med('total'), dropped: med('long'), worst: med('worst'), blocking: Math.round(med('blocking')),
                all: runs.map(r=>r.long).join('/'), fps: Math.round(med('total')/18) };
}
console.log(`${LABEL}  [${MOB?'iPhone 390x844 DPR3':'desktop'}, 4x CPU, inside the app frame]`);
for (const k in agg) { const r = agg[k];
  console.log(typeof r === 'string' ? `  ${k.padEnd(9)} ${r}`
    : `  ${k.padEnd(9)} ${String(r.fps).padStart(2)}fps  frames ${String(r.frames).padStart(4)}  dropped ${String(r.dropped).padStart(3)} (${r.all})  worst ${String(r.worst).padStart(4)}ms  blocking ${String(r.blocking).padStart(5)}ms`); }
await b.close();
