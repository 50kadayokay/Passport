import puppeteer from "puppeteer-core";
const sleep=m=>new Promise(r=>setTimeout(r,m));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],
  defaultViewport:{width:390,height:844,deviceScaleFactor:3,isMobile:true,hasTouch:true}});
for(const base of process.argv.slice(2)){
  const p=await b.newPage();
  await p.goto(base+"/home",{waitUntil:'domcontentloaded',timeout:90000});
  await sleep(5000);
  // scroll the whole page the way a visitor does, tracking decoded image memory
  const peak = await p.evaluate(async ()=>{
    let peakMB=0, peakImgs=0;
    const sample=()=>{ let px=0,n=0;
      const add=(w,h)=>{ if(w&&h){ px+=w*h; n++; } };
      for(const i of document.querySelectorAll('img')) add(i.naturalWidth,i.naturalHeight);
      for(const f of document.querySelectorAll('iframe')){ try{ for(const i of f.contentDocument.images) add(i.naturalWidth,i.naturalHeight);}catch(_){} }
      const mb=px*4/1048576; if(mb>peakMB){peakMB=mb;peakImgs=n;} };
    for(let y=0;y<document.body.scrollHeight;y+=400){ window.scrollTo(0,y); await new Promise(r=>setTimeout(r,170)); sample(); }
    return {peakDecodedMB:+peakMB.toFixed(1), images:peakImgs, docH:document.body.scrollHeight};
  });
  const mem = await p.evaluate(()=>performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):null);
  console.log(`${base.replace('https://','').slice(0,30).padEnd(32)} peak decoded ${String(peak.peakDecodedMB).padStart(6)} MB over ${String(peak.images).padStart(3)} images   JS heap ${mem} MB`);
  await p.close();
}
await b.close();
