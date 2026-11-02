import puppeteer from "puppeteer-core";
const sleep=m=>new Promise(r=>setTimeout(r,m));
const BASE=process.argv[2];
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],defaultViewport:{width:1440,height:900}});
const p=await b.newPage();
const t0=Date.now();
await p.goto(BASE+"/conference-mode",{waitUntil:'domcontentloaded',timeout:90000});
await sleep(2500);
await p.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=400){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,140));}});
// track each iframe from the moment it appears until its document has content
const seen = new Map();
for (let t=0; t<50; t++) {
  const now = Date.now()-t0;
  const rows = await p.evaluate(()=>[...document.querySelectorAll('iframe')].map((f,i)=>{
    let len=0; try{len=(f.contentDocument?.body?.innerText||'').trim().length;}catch(_){}
    return {i, src:(f.src||'').slice(-28), len};
  }));
  for (const r of rows) {
    const k=r.src; if(!seen.has(k)) seen.set(k,{appeared:now,painted:null});
    const e=seen.get(k); if(e.painted===null && r.len>40) e.painted=now;
  }
  if ([...seen.values()].filter(e=>e.painted!==null).length >= 16) break;
  await sleep(700);
}
const done=[...seen.values()].filter(e=>e.painted!==null);
const boots=done.map(e=>e.painted-e.appeared).sort((a,b)=>a-b);
console.log(`decks seen: ${seen.size}, painted: ${done.length}`);
console.log(`per-deck boot time (appeared -> painted): min ${boots[0]}ms  median ${boots[Math.floor(boots.length/2)]}ms  max ${boots[boots.length-1]}ms`);
console.log(`last deck painted at ${Math.max(...done.map(e=>e.painted))}ms from navigation`);
await b.close();
