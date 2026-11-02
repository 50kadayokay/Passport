import puppeteer from "puppeteer-core";
const BASE = process.argv[2] || "http://localhost:5188";
for (const dpr of [2,3]) {
  const b = await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],defaultViewport:{width:1440,height:900,deviceScaleFactor:dpr}});
  const p = await b.newPage();
  await p.goto(BASE+"/home",{waitUntil:"networkidle2",timeout:60000});
  await new Promise(r=>setTimeout(r,4000));
  await p.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=600){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,110));}});
  await new Promise(r=>setTimeout(r,3500));
  const best = await p.evaluate((dpr)=>{
    const out={};
    const note=(src,w,h)=>{ const k=src.split('/').pop().split('?')[0]; const dw=Math.round(w*dpr);
      if(!out[k]||dw>out[k].devW) out[k]={cssW:Math.round(w),devW:dw}; };
    for (const i of document.querySelectorAll('img')) { const r=i.getBoundingClientRect(); if(i.currentSrc&&r.width>0) note(i.currentSrc,r.width,r.height); }
    for (const e of document.querySelectorAll('*')) { const bg=getComputedStyle(e).backgroundImage||''; const m=/url\("?([^")]+)"?\)/.exec(bg);
      if(m){ const r=e.getBoundingClientRect(); if(r.width>0) note(m[1],r.width,r.height); } }
    return out;
  }, dpr);
  console.log(`\nDPR ${dpr}:`);
  for (const k in best) if(/poster|phone|hero/i.test(k)) console.log(`  ${k.padEnd(32)} css ${String(best[k].cssW).padStart(4)}  device ${String(best[k].devW).padStart(4)}`);
  await b.close();
}
