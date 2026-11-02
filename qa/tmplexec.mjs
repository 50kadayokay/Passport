import puppeteer from "puppeteer-core";
const URL=process.argv[2], CPU=Number(process.env.CPU||4);
const sleep=m=>new Promise(r=>setTimeout(r,m));
const PROBE=`
window.__lt=[];window.__m={};
try{new PerformanceObserver(l=>{for(const e of l.getEntries())window.__lt.push({s:Math.round(e.startTime),d:Math.round(e.duration)});}).observe({type:'longtask',buffered:true});}catch(_){}
(()=>{const M=window.__m;const now=()=>Math.round(performance.now());const mark=(k,v)=>{if(M[k]==null&&v)M[k]=now();};
 const tick=()=>{ mark('rootChildren', document.getElementById('root')?.children.length>0);
  mark('anyText',(document.body.innerText||'').trim().length>5);
  mark('iframeInDom', document.querySelectorAll('iframe').length>0);
  let len=0;try{for(const g of document.querySelectorAll('iframe')){const d=g.contentDocument;len=Math.max(len,(d?.body?.innerText||'').trim().length);}}catch(_){}
  mark('deckText', len>40); mark('deckFull', len>400);
  if(performance.now()<40000)requestAnimationFrame(tick);};
 requestAnimationFrame(tick);})();`;
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],defaultViewport:{width:1440,height:900}});
const p=await b.newPage(); await p.evaluateOnNewDocument(PROBE); await p.setCacheEnabled(false);
const c=await p.createCDPSession(); await c.send('Network.enable');
await c.send('Network.emulateNetworkConditions',{offline:false,latency:40,downloadThroughput:10*1024*1024/8,uploadThroughput:3*1024*1024/8});
await c.send('Emulation.setCPUThrottlingRate',{rate:CPU});
const xhr=[]; p.on('response',r=>{ if(/supabase|rest\/v1|\/api\//.test(r.url())) xhr.push({u:r.url().split('/').slice(3).join('/').slice(0,54), st:r.status()}); });
await p.goto(URL,{waitUntil:'domcontentloaded',timeout:120000});
await sleep(35000);
const m=await p.evaluate(()=>({m:window.__m, lt:window.__lt}));
console.log(`CPU throttle ${CPU}x`);
console.log(' milestones:', JSON.stringify(m.m));
const tot=m.lt.reduce((s,x)=>s+x.d,0);
console.log(` long tasks: ${m.lt.length}, total blocking ${tot}ms, longest ${Math.max(0,...m.lt.map(x=>x.d))}ms`);
console.log(' worst 6:', m.lt.sort((a,b)=>b.d-a.d).slice(0,6).map(x=>`${x.d}ms@${x.s}`).join(' '));
console.log(' data requests:', xhr.length ? xhr.map(x=>x.st+' '+x.u).join('\n                ') : 'none');
await b.close();
