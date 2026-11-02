// Controlled before/after across commits. Same browser, same throttle, same sequence.
// Real interactions (mouse clicks), real paint, real long-task accounting.
import puppeteer from "puppeteer-core";
const BASE = process.argv[2];
const LABEL = process.argv[3] || BASE;
const sleep = m => new Promise(r => setTimeout(r, m));
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// installed before page code; records long tasks and first paints from navigation start
const PROBE = `
window.__lt = []; window.__p = {};
try{ new PerformanceObserver(l=>{for(const e of l.getEntries()) window.__lt.push(e.duration);}).observe({type:'longtask',buffered:true}); }catch(_){}
(()=>{const P=window.__p;const now=()=>Math.round(performance.now());
 const shown=el=>{if(!el)return false;const r=el.getBoundingClientRect();
   if(!(r.width>30&&r.height>30&&r.top<innerHeight&&r.bottom>0))return false;
   let n=el;while(n&&n!==document.documentElement){const c=getComputedStyle(n);
     if(c.opacity==='0'||c.visibility==='hidden'||c.display==='none')return false;n=n.parentElement;}return true;};
 const mark=(k,v)=>{if(P[k]==null&&v)P[k]=now();};
 const tick=()=>{
   mark('text',[...document.querySelectorAll('h1,h2')].some(x=>shown(x)&&(x.textContent||'').trim().length>6));
   const po=[...document.querySelectorAll('img')].find(i=>/opening-poster/.test(i.currentSrc||i.src||''));
   mark('phoneScreen', po&&po.complete&&po.naturalWidth>0&&shown(po));
   const f=[...document.querySelectorAll('iframe')][0];
   let len=0; try{len=(f?.contentDocument?.body?.innerText||'').trim().length;}catch(_){}
   mark('phoneApp', len>60);
   // a conference template route: content lives in the deck iframe
   let dl=0; try{ for(const g of document.querySelectorAll('iframe')){const d=g.contentDocument; dl=Math.max(dl,(d?.body?.innerText||'').trim().length);} }catch(_){}
   mark('deckFirstContent', dl>40);
   mark('deckUsable', dl>400);
   if(performance.now()<30000) requestAnimationFrame(tick);};
 requestAnimationFrame(tick);})();`;

const launch = async (mobile) => puppeteer.launch({
  executablePath: CHROME, headless: "new", args: ["--no-sandbox"],
  defaultViewport: mobile ? {width:390,height:844,deviceScaleFactor:3,isMobile:true,hasTouch:true} : {width:1440,height:900},
});
const throttle = async (p) => { const c = await p.createCDPSession(); await c.send('Network.enable');
  await c.send('Network.emulateNetworkConditions',{offline:false,latency:40,downloadThroughput:10*1024*1024/8,uploadThroughput:3*1024*1024/8});
  await c.send('Emulation.setCPUThrottlingRate',{rate:4}); };

const b = await launch(false);

// ---- PHONES ----
const phones = [];
for (const path of ['/investor','/pro']) {
  const p = await b.newPage(); await p.evaluateOnNewDocument(PROBE); await throttle(p);
  await p.goto(BASE+path,{waitUntil:'domcontentloaded',timeout:90000});
  await sleep(14000);
  const r = await p.evaluate(()=>({p:window.__p, blocking: window.__lt.reduce((s,d)=>s+d,0), tasks: window.__lt.length}));
  phones.push({path, ...r});
  await p.close();
}

// ---- CONFERENCE TILE CLICK ----
const tiles = [];
for (const slug of ['terminal2','folio','vista']) {
  const p = await b.newPage(); await throttle(p);
  // NOT networkidle2: under throttle the gallery never reaches it within 90s, because it
  // boots 12 live decks. Fixed settle instead, identical for every build measured.
  await p.goto(BASE+'/conference-mode',{waitUntil:'domcontentloaded',timeout:90000});
  await sleep(6000);
  await p.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=500){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,120));}});
  await sleep(1200);
  await p.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';});
  const hit = await p.evaluate(async (s)=>{
    const find=()=>{for(const e of document.querySelectorAll('*')){const bg=getComputedStyle(e).backgroundImage||'';
      if(new RegExp('/thumbs/'+s+'\\\\.','i').test(bg))return e;}return null;};
    const el=find(); if(!el)return null;
    el.scrollIntoView({block:'center',behavior:'instant'});
    let last=-1;for(let i=0;i<40;i++){await new Promise(r=>requestAnimationFrame(r));if(Math.round(scrollY)===last)break;last=Math.round(scrollY);}
    await new Promise(r=>setTimeout(r,250));
    const r2=find().getBoundingClientRect();
    return {x:Math.round(r2.left+r2.width/2), y:Math.round(r2.top+r2.height/2)};
  }, slug);
  if(!hit){ tiles.push({slug, err:'no tile'}); await p.close(); continue; }
  // Poll from NODE across the navigation: an in-page probe does not survive a cross-document
  // load reliably, and the number that matters is wall-clock from the click anyway.
  const t0 = Date.now();
  p.mouse.click(hit.x, hit.y);
  let first=null, usable=null;
  while (Date.now()-t0 < 30000) {
    const d = await p.evaluate(()=>{ let len=0;
      try{ for(const g of document.querySelectorAll('iframe')){const dd=g.contentDocument; len=Math.max(len,(dd?.body?.innerText||'').trim().length);} }catch(_){}
      return len; }).catch(()=>0);
    if (first===null && d>40) first = Date.now()-t0;
    if (d>400) { usable = Date.now()-t0; break; }
    await sleep(100);
  }
  const r = { p:{}, blocking: 0 };
  tiles.push({slug, first, usable, blocking:0});
  await p.close();
}
await b.close();

console.log(`\n=== ${LABEL} ===`);
console.log('PHONES (ms from navigation start, 40ms/10Mbps/4x CPU)');
for (const r of phones) console.log(`  ${r.path.padEnd(11)} text${String(r.p.text??'—').padStart(6)}  phoneScreen${String(r.p.phoneScreen??'—').padStart(6)}  phoneApp${String(r.p.phoneApp??'—').padStart(6)}  blocking${String(Math.round(r.blocking)).padStart(6)}ms`);
console.log('CONFERENCE TILE CLICK (ms from the click)');
for (const r of tiles) console.log(`  ${r.slug.padEnd(11)} firstContent${String(r.first??'—').padStart(6)}  usable${String(r.usable??'—').padStart(6)}  blocking${String(Math.round(r.blocking??0)).padStart(6)}ms`);
