// The app-layer wrapper must not be scrollable. Force a scroll on it and confirm it refuses
// — this is the exact mechanism the device log caught (dTop -6 persisting from state 12).
import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const B=process.argv[2]||"http://localhost:5197";
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
for(const [route,label] of [["/pro","pro"],["/","home"],["/investor","investor"]]){
  const p=await b.newPage(); await p.setCacheEnabled(false);
  await p.setViewport({width:390,height:844,deviceScaleFactor:3,isMobile:true,hasTouch:true});
  await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
  await p.goto(B+route,{waitUntil:"domcontentloaded",timeout:90000}); await sleep(6000);
  await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Explore the product"]'); if(e)e.click();});
  await sleep(900);
  const r=await p.evaluate(()=>{
    const f=[...document.querySelectorAll("iframe")].find(x=>{const q=x.getBoundingClientRect();return q.height>200&&q.width>100;});
    if(!f) return {err:"no frame"};
    const w=f.parentElement;
    const before=f.getBoundingClientRect().top;
    const ov=getComputedStyle(w).overflow;
    // this is precisely what Safari did on the device
    w.scrollTop=40; w.scrollLeft=12;
    const applied={top:w.scrollTop,left:w.scrollLeft};
    const after=f.getBoundingClientRect().top;
    w.scrollTop=0; w.scrollLeft=0;
    return { overflow:ov, scrollApplied:applied, frameMoved:+(after-before).toFixed(1) };
  });
  console.log(label.padEnd(9), `overflow:${r.overflow}  forced scroll -> ${JSON.stringify(r.scrollApplied)}  frame moved ${r.frameMoved}px`,
    (r.scrollApplied && r.scrollApplied.top===0 && r.frameMoved===0) ? " LOCKED ✓" : " STILL SCROLLABLE ✗");
  await p.close();
}
await b.close();
