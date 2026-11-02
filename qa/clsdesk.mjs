import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
for(const [W,H,tag] of [[1680,1050,"desktop"],[390,740,"mobile"]]){
 for(const route of ["/","/pro","/investor"]){
  const p=await b.newPage();
  await p.setViewport({width:W,height:H,deviceScaleFactor:1,isMobile:W<760,hasTouch:W<760});
  await p.evaluateOnNewDocument(()=>{window.__cls=0;new PerformanceObserver(l=>{for(const e of l.getEntries()) if(!e.hadRecentInput) window.__cls+=e.value;}).observe({type:"layout-shift",buffered:true});});
  await p.goto("http://localhost:5197"+route,{waitUntil:"networkidle2",timeout:60000}); await sleep(4000);
  const H2=await p.evaluate(()=>document.body.scrollHeight);
  if(W<760){ for(let y=0;y<H2;y+=500){ await p.evaluate(v=>window.scrollTo(0,v),y); await sleep(120);} }
  else { await p.mouse.move(840,520); for(let k=0;k<40;k++){ await p.mouse.wheel({deltaY:150}); await sleep(120);} }
  console.log(`${tag.padEnd(8)} ${route.padEnd(11)} CLS ${(await p.evaluate(()=>window.__cls||0)).toFixed(3)}`);
  await p.close();
 }
}
await b.close();
