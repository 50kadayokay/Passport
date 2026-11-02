import puppeteer from "puppeteer-core";
const BASE=process.argv[2]||"https://mineex.ca";
const sleep=m=>new Promise(r=>setTimeout(r,m));
const PROBE=`
window.__m={};
(()=>{const M=window.__m;const now=()=>+performance.now().toFixed(0);
 const shown=el=>{if(!el)return false;const r=el.getBoundingClientRect();
   if(!(r.width>30&&r.height>30&&r.top<innerHeight&&r.bottom>0))return false;
   let n=el;while(n&&n!==document.documentElement){const c=getComputedStyle(n);
     if(c.opacity==='0'||c.visibility==='hidden'||c.display==='none')return false;n=n.parentElement;}
   return true;};
 const mark=(k,v)=>{if(M[k]==null&&v)M[k]=now();};
 const tick=()=>{
   mark('textPainted',[...document.querySelectorAll('h1,h2')].some(x=>shown(x)&&(x.textContent||'').trim().length>6));
   const shellEl=[...document.querySelectorAll('img')].find(i=>/phone-79|hero-hand-phone/.test(i.currentSrc||i.src||''));
   mark('shellInDom',!!shellEl);
   mark('shellShown',shellEl&&shellEl.complete&&shellEl.naturalWidth>0&&shown(shellEl));
   const po=[...document.querySelectorAll('img')].find(i=>/opening-poster/.test(i.currentSrc||i.src||''));
   mark('posterInDom',!!po);
   mark('posterLoaded',po&&po.complete&&po.naturalWidth>0);
   mark('posterShown',po&&po.complete&&po.naturalWidth>0&&shown(po));
   const f=[...document.querySelectorAll('iframe')][0];
   mark('iframeInDom',!!f);
   let len=0;try{len=(f?.contentDocument?.body?.innerText||'').trim().length;}catch(_){}
   mark('appPainted',len>60);
   if(performance.now()<22000)requestAnimationFrame(tick);};
 requestAnimationFrame(tick);})();`;
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],defaultViewport:{width:1440,height:900}});
for(const path of ['/home','/pro','/investor']){
  const p=await b.newPage(); await p.evaluateOnNewDocument(PROBE);
  if(process.env.THROTTLE!=='0'){ const c=await p.createCDPSession(); await c.send('Network.enable');
    await c.send('Network.emulateNetworkConditions',{offline:false,latency:40,downloadThroughput:10*1024*1024/8,uploadThroughput:3*1024*1024/8});
    await c.send('Emulation.setCPUThrottlingRate',{rate:4}); }
  await p.goto(BASE+path,{waitUntil:'domcontentloaded',timeout:60000});
  await sleep(16000);
  const m=await p.evaluate(()=>window.__m);
  const f=k=>String(m[k]??'—').padStart(6);
  const gap = (m.posterShown!=null&&m.textPainted!=null)? (m.posterShown-m.textPainted) : null;
  console.log(`${path.padEnd(11)} text${f('textPainted')} posterShown${f('posterShown')} app${f('appPainted')}   GAP text->screen ${String(gap??'—').padStart(6)}ms`);
  await p.close();
}
await b.close();
