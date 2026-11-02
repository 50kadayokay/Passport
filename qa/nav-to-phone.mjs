// Click a nav tab, then measure until the PAGE IS ACTUALLY USABLE:
//   heading   destination copy on screen
//   device    the phone/tablet frame visible
//   screen    its screen filled (poster or live app) — what a visitor calls "loaded"
import puppeteer from "puppeteer-core";
const BASE=process.argv[2], LABEL=process.argv[3]||BASE;
const sleep=m=>new Promise(r=>setTimeout(r,m));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],defaultViewport:{width:1440,height:900}});
console.log(`\n=== ${LABEL} ===`);
console.log('tab          heading   device    screen');
for (const href of ['/pro','/investor','/conference-mode']) {
  const p=await b.newPage();
  if (process.env.COLD==='1') await p.setCacheEnabled(false);
  await p.goto(BASE+'/home',{waitUntil:'networkidle2',timeout:90000});
  await sleep(2500);
  const prev = await p.evaluate(()=>{const h=[...document.querySelectorAll('h1,h2')].find(x=>{const r=x.getBoundingClientRect();return r.width>0&&r.top<innerHeight&&r.bottom>0&&getComputedStyle(x).opacity!=='0'&&(x.textContent||'').trim().length>6;});return h?h.textContent.trim().slice(0,40):null;});
  // Tag the iframes that are ALREADY here (the home page has its own phone), so the probe
  // can only ever report the DESTINATION's device, not the one it is leaving.
  await p.evaluate(()=>{ document.querySelectorAll('iframe').forEach(f=>{ f.dataset.mxOld='1'; }); });
  const t0=Date.now();
  await p.evaluate(h=>document.querySelector(`a[href="${h}"]`).dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window})), href);
  let head=null, dev=null, scr=null;
  while (Date.now()-t0 < 25000 && (!head||!dev||!scr)) {
    const r = await p.evaluate((prev)=>{
      const vis=el=>{if(!el)return false;const q=el.getBoundingClientRect();if(!(q.width>30&&q.height>30&&q.top<innerHeight&&q.bottom>0))return false;
        let n=el;while(n&&n!==document.documentElement){const c=getComputedStyle(n);if(c.opacity==='0'||c.visibility==='hidden'||c.display==='none')return false;n=n.parentElement;}return true;};
      const h=[...document.querySelectorAll('h1,h2')].find(x=>vis(x)&&(x.textContent||'').trim().length>6);
      const f=[...document.querySelectorAll('iframe')].find(x=>x.dataset.mxOld!=='1');
      let inner=0; try{inner=(f?.contentDocument?.body?.innerText||'').trim().length;}catch(_){}
      const po=[...document.querySelectorAll('img')].find(i=>/opening-poster/.test(i.currentSrc||'')&&i.complete&&i.naturalWidth>0&&vis(i));
      return { head: h && h.textContent.trim().slice(0,40)!==prev, dev: !!(f&&vis(f)), scr: inner>60 || !!po };
    }, prev).catch(()=>({}));
    const el = Date.now()-t0;
    if (r.head && head===null) head=el;
    if (r.dev && dev===null) dev=el;
    if (r.scr && scr===null) scr=el;
    await sleep(60);
  }
  console.log(`${href.padEnd(13)}${String(head??'>25s').padStart(6)}ms${String(dev??'>25s').padStart(8)}ms${String(scr??'>25s').padStart(8)}ms`);
  await p.close();
}
await b.close();
