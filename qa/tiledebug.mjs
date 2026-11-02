import puppeteer from "puppeteer-core";
const BASE=process.argv[2]||"http://localhost:5188";
const sleep=m=>new Promise(r=>setTimeout(r,m));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],defaultViewport:{width:1440,height:900}});
const p=await b.newPage();
const c=await p.createCDPSession(); await c.send('Network.enable');
await c.send('Network.emulateNetworkConditions',{offline:false,latency:40,downloadThroughput:10*1024*1024/8,uploadThroughput:3*1024*1024/8});
await c.send('Emulation.setCPUThrottlingRate',{rate:4});
await p.goto(BASE+'/conference-mode',{waitUntil:'domcontentloaded',timeout:90000});
await sleep(6000);
await p.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=500){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,120));}});
await sleep(1500);
await p.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';});
const hit=await p.evaluate(async()=>{
  const find=()=>{for(const e of document.querySelectorAll('*')){const bg=getComputedStyle(e).backgroundImage||'';
    if(/\/thumbs\/folio\./i.test(bg))return e;}return null;};
  const el=find(); if(!el)return null;
  el.scrollIntoView({block:'center',behavior:'instant'});
  let last=-1;for(let i=0;i<40;i++){await new Promise(r=>requestAnimationFrame(r));if(Math.round(scrollY)===last)break;last=Math.round(scrollY);}
  await new Promise(r=>setTimeout(r,250));
  const r=find().getBoundingClientRect();
  return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};
});
console.log('tile at', hit, '| url before:', (await p.url()).slice(-30));
const t0=Date.now();
await p.mouse.click(hit.x,hit.y);
for (const at of [1000,3000,6000,10000,16000,24000]) {
  while(Date.now()-t0 < at) await sleep(100);
  let info;
  try {
    info = await p.evaluate(()=>{ let len=0, n=0;
      for(const g of document.querySelectorAll('iframe')){ n++; try{const d=g.contentDocument; len=Math.max(len,(d?.body?.innerText||'').trim().length);}catch(_){} }
      return {url:location.search.slice(0,46), outer:(document.body.innerText||'').trim().length, iframes:n, innerMax:len, ready:document.readyState}; });
  } catch(e){ info={err:String(e).slice(0,60)}; }
  console.log(`+${String(at).padStart(5)}ms`, JSON.stringify(info));
}
await b.close();
