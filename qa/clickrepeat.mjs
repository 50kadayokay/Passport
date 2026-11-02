import puppeteer from "puppeteer-core";
const BASE=process.argv[2], LABEL=process.argv[3], N=Number(process.argv[4]||3);
const sleep=m=>new Promise(r=>setTimeout(r,m));
const times=[], decks=[];
for(let i=0;i<N;i++){
  const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],defaultViewport:{width:1440,height:900}});
  const p=await b.newPage(); await p.setCacheEnabled(false);
  const c=await p.createCDPSession(); await c.send('Network.enable');
  await c.send('Network.emulateNetworkConditions',{offline:false,latency:40,downloadThroughput:10*1024*1024/8,uploadThroughput:3*1024*1024/8});
  await c.send('Emulation.setCPUThrottlingRate',{rate:4});
  await p.goto(BASE+'/conference-mode',{waitUntil:'domcontentloaded',timeout:120000});
  await sleep(7000);
  const d=await p.evaluate(()=>document.querySelectorAll('iframe').length);
  await p.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';});
  const hit=await p.evaluate(async()=>{const find=()=>{for(const e of document.querySelectorAll('*')){const bg=getComputedStyle(e).backgroundImage||'';
      if(/\/thumbs\/folio\./i.test(bg))return e;}return null;};
    const el=find();if(!el)return null;el.scrollIntoView({block:'center',behavior:'instant'});
    let last=-1;for(let k=0;k<40;k++){await new Promise(r=>requestAnimationFrame(r));if(Math.round(scrollY)===last)break;last=Math.round(scrollY);}
    await new Promise(r=>setTimeout(r,250));const r=find().getBoundingClientRect();
    return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};});
  if(!hit){ await b.close(); continue; }
  const t0=Date.now(); await p.mouse.click(hit.x,hit.y);
  let usable=null;
  while(Date.now()-t0<45000){
    let len=0; try{ len=await p.evaluate(()=>{let n=0;for(const g of document.querySelectorAll('iframe')){try{const dd=g.contentDocument;n=Math.max(n,(dd?.body?.innerText||'').trim().length);}catch(_){}}return n;}); }catch(_){}
    if(len>400){usable=Date.now()-t0;break;}
    await sleep(150);
  }
  times.push(usable??45000); decks.push(d);
  await b.close();
}
const med=[...times].sort((a,b)=>a-b)[Math.floor(times.length/2)];
console.log(`${LABEL.padEnd(42)} decks@7s ${decks.join('/')}  click->usable ${times.join(' / ')}  median ${med}ms`);
