import { webkit } from "playwright-core";
const sleep=m=>new Promise(r=>setTimeout(r,m));
const b=await webkit.launch();
for (const BASE of process.argv.slice(2)) {
  const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,140)));
  p.on('console',m=>{ if(m.type()==='error') errs.push('console: '+m.text().slice(0,130)); });
  p.on('requestfailed',r=>errs.push('FAILED '+r.url().split('/').pop().slice(0,40)));
  await p.goto(BASE+"/investor",{waitUntil:'load',timeout:90000});
  await sleep(7000);
  const r=await p.evaluate(()=>{
    const vis=el=>{ if(!el) return false; const q=el.getBoundingClientRect();
      if(!(q.width>20&&q.height>20&&q.top<innerHeight&&q.bottom>0)) return false;
      let n=el; while(n&&n!==document.documentElement){const c=getComputedStyle(n);
        if(c.opacity==='0'||c.visibility==='hidden'||c.display==='none') return false; n=n.parentElement;} return true; };
    const f=document.querySelector('iframe');
    const phoneImgs=[...document.querySelectorAll('img')].filter(i=>/phone-79|hero-hand|cutout/.test(i.currentSrc||i.src||''));
    const phoneBg=[...document.querySelectorAll('*')].filter(e=>/phone-79|cutout/.test(getComputedStyle(e).backgroundImage||''));
    return { iframe: !!f, iframeVisible: vis(f), iframeRect: f?[Math.round(f.getBoundingClientRect().width),Math.round(f.getBoundingClientRect().height)]:null,
             phoneImgs: phoneImgs.map(i=>({f:(i.currentSrc||i.src).split('/').pop(), vis:vis(i), loaded:i.complete&&i.naturalWidth>0})),
             phoneBgEls: phoneBg.length, phoneBgVisible: phoneBg.filter(vis).length };
  });
  console.log(BASE.replace('https://','').slice(0,42));
  console.log('   ', JSON.stringify(r));
  if(errs.length) console.log('    ERRORS:', errs.slice(0,4));
  await p.close();
}
await b.close();
