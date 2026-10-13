// WHEN does each part of the hero composition appear? Probe installed before page code runs,
// sampling every animation frame, timestamps from navigation start.
import puppeteer from "puppeteer-core";
const BASE = process.argv[2] || "https://mineex.ca";
const MOB = !!process.env.MOBILE;
const sleep=m=>new Promise(r=>setTimeout(r,m));

const PROBE = `
window.__t = { text:null, shell:null, screen:null, iframe:null, appPainted:null, frames:0 };
(() => {
  const T = window.__t;
  const vis = el => { if(!el) return false; const r=el.getBoundingClientRect(), c=getComputedStyle(el);
    return r.width>30 && r.height>30 && r.top<innerHeight && r.bottom>0 && c.opacity!=='0' && c.visibility!=='hidden'; };
  const now = () => +performance.now().toFixed(1);
  const tick = () => {
    T.frames++;
    if (T.text===null) { const h=[...document.querySelectorAll('h1,h2')].find(x=>vis(x)&&(x.textContent||'').trim().length>6); if(h) T.text=now(); }
    // the hardware shell: the device render image (phone-79 family), as <img> or background
    if (T.shell===null) {
      const img=[...document.querySelectorAll('img')].find(i=>/phone-79|hero-hand-phone/.test(i.currentSrc||i.src||'')&&i.complete&&i.naturalWidth>0&&vis(i));
      const bg=[...document.querySelectorAll('*')].find(e=>/phone-79/.test(getComputedStyle(e).backgroundImage||'')&&vis(e));
      if(img||bg) T.shell=now();
    }
    // the accurate screen: the captured opening frame inside the device
    if (T.screen===null) { const po=[...document.querySelectorAll('img')].find(i=>/opening-poster/.test(i.currentSrc||i.src||'')&&i.complete&&i.naturalWidth>0&&vis(i)); if(po) T.screen=now(); }
    if (T.iframe===null) { const f=[...document.querySelectorAll('iframe')].find(vis); if(f) T.iframe=now(); }
    if (T.appPainted===null) { for(const f of document.querySelectorAll('iframe')){ try{ const d=f.contentDocument;
      if(d && (d.body?.innerText||'').trim().length>60){ T.appPainted=now(); break; } }catch(_){}} }
    if (performance.now() < 25000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();
`;

const b = await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],
  defaultViewport: MOB?{width:390,height:844,deviceScaleFactor:3,isMobile:true,hasTouch:true}:{width:1440,height:900}});

const run = async (path, throttle) => {
  const p = await b.newPage();
  await p.evaluateOnNewDocument(PROBE);
  if (throttle) { const c=await p.createCDPSession(); await c.send('Network.enable');
    await c.send('Network.emulateNetworkConditions',{offline:false,latency:40,downloadThroughput:10*1024*1024/8,uploadThroughput:3*1024*1024/8});
    await c.send('Emulation.setCPUThrottlingRate',{rate:4}); }
  await p.goto(BASE+path,{waitUntil:'domcontentloaded',timeout:60000});
  await sleep(12000);
  const t = await p.evaluate(()=>window.__t);
  const fmt = v => v===null ? '    —' : String(Math.round(v)).padStart(5);
  console.log(`${(MOB?'mob ':'dsk ')}${path.padEnd(11)}${throttle?'throttled':'fast     '}  text${fmt(t.text)}  shell${fmt(t.shell)}  screen${fmt(t.screen)}  iframe${fmt(t.iframe)}  appPainted${fmt(t.appPainted)}`);
  await p.close();
  return t;
};
console.log('all times ms from navigation start\n');
for (const path of ['/investor','/pro','/home']) { await run(path,false); }
console.log('');
for (const path of ['/investor','/pro']) { await run(path,true); }
await b.close();
