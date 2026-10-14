// Gallery cost + real tile-click timing, cold cache, identical throttle. For A/B across builds.
import puppeteer from "puppeteer-core";
const BASE=process.argv[2], LABEL=process.argv[3];
const sleep=m=>new Promise(r=>setTimeout(r,m));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],defaultViewport:{width:1440,height:900}});
const thr=async p=>{const c=await p.createCDPSession();await c.send('Network.enable');
  await c.send('Network.emulateNetworkConditions',{offline:false,latency:40,downloadThroughput:10*1024*1024/8,uploadThroughput:3*1024*1024/8});
  await c.send('Emulation.setCPUThrottlingRate',{rate:4});};

// 1) gallery cost
let p=await b.newPage(); await p.setCacheEnabled(false); await thr(p);
let bytes=0,reqs=0; p.on('response',async r=>{reqs++;try{bytes+=(await r.buffer()).length;}catch(_){}});
const t0=Date.now();
await p.goto(BASE+'/conference-mode',{waitUntil:'domcontentloaded',timeout:120000});
await sleep(8000);
const g=await p.evaluate(()=>{const f=[...document.querySelectorAll('iframe')];let painted=0;
  for(const x of f){try{const d=x.contentDocument;if((d?.body?.innerText||'').trim().length>40)painted++;}catch(_){}}
  return {iframes:f.length,painted};});
console.log(`${LABEL}\n  gallery @8s: ${g.iframes} iframes, ${g.painted} painted, ${reqs} requests, ${(bytes/1048576).toFixed(2)} MB`);
await p.close();

// 2) tile click AT 7s (what a visitor does: look, then click)
p=await b.newPage(); await p.setCacheEnabled(false); await thr(p);
await p.goto(BASE+'/conference-mode',{waitUntil:'domcontentloaded',timeout:120000});
await sleep(7000);
await p.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=500){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,120));}});
await sleep(1200);
await p.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';});
const hit=await p.evaluate(async()=>{const find=()=>{for(const e of document.querySelectorAll('*')){const bg=getComputedStyle(e).backgroundImage||'';
    if(/\/thumbs\/folio\./i.test(bg))return e;}return null;};
  const el=find();if(!el)return null;el.scrollIntoView({block:'center',behavior:'instant'});
  let last=-1;for(let i=0;i<40;i++){await new Promise(r=>requestAnimationFrame(r));if(Math.round(scrollY)===last)break;last=Math.round(scrollY);}
  await new Promise(r=>setTimeout(r,250));const r=find().getBoundingClientRect();
  return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};});
if(!hit){console.log('  tile: NOT FOUND');}
else{
  const c0=Date.now(); await p.mouse.click(hit.x,hit.y);
  let first=null,full=null;
  while(Date.now()-c0<40000){
    let len=0; try{ len=await p.evaluate(()=>{let n=0;for(const g of document.querySelectorAll('iframe')){try{const d=g.contentDocument;n=Math.max(n,(d?.body?.innerText||'').trim().length);}catch(_){}}return n;}); }catch(_){}
    if(first===null&&len>40)first=Date.now()-c0;
    if(len>400){full=Date.now()-c0;break;}
    await sleep(150);
  }
  console.log(`  tile click -> first content ${first??'>40000'}ms, usable ${full??'>40000'}ms`);
}
await b.close();
