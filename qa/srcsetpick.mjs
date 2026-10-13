import puppeteer from "puppeteer-core";
const BASE=process.argv[2]||"http://localhost:5188";
const sleep=m=>new Promise(r=>setTimeout(r,m));
for(const [w,h,dpr,label] of [[1440,900,1,'desktop DPR1'],[1440,900,2,'desktop DPR2'],[1440,900,3,'desktop DPR3'],[390,844,3,'iPhone DPR3']]){
  const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],
    defaultViewport:{width:w,height:h,deviceScaleFactor:dpr,isMobile:w<760,hasTouch:w<760}});
  for(const path of ['/home','/investor']){
    const p=await b.newPage();
    await p.goto(BASE+path,{waitUntil:'networkidle2',timeout:60000});
    await sleep(4500);
    const r=await p.evaluate((dpr)=>[...document.querySelectorAll('img')].filter(i=>/opening-poster/.test(i.currentSrc||i.src||''))
      .map(i=>{const q=i.getBoundingClientRect();
        return {chosen:(i.currentSrc||'').split('/').pop(), cssW:Math.round(q.width), needDev:Math.round(q.width*dpr), natW:i.naturalWidth};}),dpr);
    // naturalWidth is DENSITY-CORRECTED under a w-descriptor srcset, so it cannot be used
    // to judge resolution. Compare the chosen FILE's real pixel width instead.
    const FILEW = { '.sm.webp':590, '.md.webp':768, 'app-opening-poster.webp':1024, 'appdemo-opening-poster.webp':1179 };
    for(const x of r){
      const realW = x.chosen.endsWith('.sm.webp') ? 590 : x.chosen.endsWith('.md.webp') ? 768 : (FILEW[x.chosen]||0);
      const ok = realW >= x.needDev;
      x.natW = realW;
      console.log(`${label.padEnd(13)} ${path.padEnd(10)} ${String(x.chosen).padEnd(32)} slot ${String(x.cssW).padStart(3)}css = ${String(x.needDev).padStart(4)}dev  source ${String(x.natW).padStart(4)}  ${ok?'OK':'*** UNDER-SIZED ***'}`);
    }
    await p.close();
  }
  await b.close();
}
