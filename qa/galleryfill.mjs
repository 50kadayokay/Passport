import puppeteer from "puppeteer-core";
const BASE=process.argv[2], LABEL=process.argv[3];
const sleep=m=>new Promise(r=>setTimeout(r,m));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],defaultViewport:{width:1440,height:900}});
const p=await b.newPage(); await p.setCacheEnabled(false);
const c=await p.createCDPSession(); await c.send('Network.enable');
await c.send('Network.emulateNetworkConditions',{offline:false,latency:40,downloadThroughput:10*1024*1024/8,uploadThroughput:3*1024*1024/8});
await c.send('Emulation.setCPUThrottlingRate',{rate:4});
const t0=Date.now();
await p.goto(BASE+'/conference-mode',{waitUntil:'domcontentloaded',timeout:120000});
await sleep(3000);
await p.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=400){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,160));}});
const marks=[];
for(const at of [8000,15000,25000,40000,60000]){
  while(Date.now()-t0<at) await sleep(200);
  const s=await p.evaluate(()=>{const f=[...document.querySelectorAll('iframe')];let painted=0;
    for(const g of f){try{const d=g.contentDocument;if((d?.body?.innerText||'').trim().length>40)painted++;}catch(_){}}
    const tiles=[...document.querySelectorAll('*')].filter(e=>/thumbs\//.test(getComputedStyle(e).backgroundImage||'')).length;
    return {iframes:f.length,painted,tiles};});
  marks.push({at,...s});
}
console.log(LABEL);
for(const m of marks) console.log(`  @${String(m.at/1000).padStart(3)}s  thumbnails ${String(m.tiles).padStart(2)}  live decks ${String(m.iframes).padStart(2)}  painted ${String(m.painted).padStart(2)}`);
await b.close();
