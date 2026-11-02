import puppeteer from "puppeteer-core";
const BASE=process.argv[2];
const sleep=m=>new Promise(r=>setTimeout(r,m));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],defaultViewport:{width:1440,height:900}});
const p=await b.newPage(); await p.setCacheEnabled(false);
const c=await p.createCDPSession(); await c.send('Network.enable');
await c.send('Network.emulateNetworkConditions',{offline:false,latency:40,downloadThroughput:10*1024*1024/8,uploadThroughput:3*1024*1024/8});
await c.send('Emulation.setCPUThrottlingRate',{rate:4});
let bytes=0, reqs=0; const t0=Date.now(); const timeline=[];
p.on('response', async r=>{ reqs++; try{ bytes+=(await r.buffer()).length; }catch(_){} });
await p.goto(BASE+'/conference-mode',{waitUntil:'domcontentloaded',timeout:120000});
for (const at of [2000,5000,10000,20000,30000,45000]) {
  while(Date.now()-t0<at) await sleep(200);
  const s = await p.evaluate(()=>{ const f=[...document.querySelectorAll('iframe')]; let painted=0;
    for(const g of f){try{const d=g.contentDocument; if((d?.body?.innerText||'').trim().length>40)painted++;}catch(_){}}
    return {iframes:f.length, painted}; });
  timeline.push({at, ...s, reqs, mb:+(bytes/1048576).toFixed(2)});
}
console.log('gallery /conference-mode, cold, 40ms/10Mbps/4x CPU');
for(const t of timeline) console.log(`  @${String(t.at).padStart(5)}ms  iframes ${String(t.iframes).padStart(2)}  painted ${String(t.painted).padStart(2)}  requests ${String(t.reqs).padStart(3)}  ${String(t.mb).padStart(5)} MB`);
await b.close();
