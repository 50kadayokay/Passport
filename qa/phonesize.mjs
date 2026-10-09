// The device render's size on each phone page. Home is the reference.
import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const B=process.argv[2]||"http://localhost:5197";
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
for(const [route,label] of [["/","home"],["/pro","pro"],["/investor","investor"]]){
  const p=await b.newPage(); await p.setCacheEnabled(false);
  await p.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
  await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
  await p.goto(B+route,{waitUntil:"domcontentloaded",timeout:90000}); await sleep(5200);
  // advance a couple of states so the device is definitely mounted and visible
  for(let k=0;k<2;k++){ await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Next"]'); if(e&&!e.disabled)e.click();}); await sleep(700); }
  console.log(label.padEnd(9), JSON.stringify(await p.evaluate(()=>{
    // the hardware box: the element carrying the phone's 971/1620 aspect
    let best=null;
    for(const el of document.querySelectorAll("div")){
      const cs=getComputedStyle(el);
      const r=el.getBoundingClientRect();
      if(r.width<60||r.height<120) continue;
      const ar=r.width/r.height;
      if(Math.abs(ar-971/1620)<0.02 && (!best||r.width>best.w)) best={w:Math.round(r.width),h:Math.round(r.height),top:Math.round(r.top),bottom:Math.round(r.bottom)};
    }
    return best||{none:true};
  })));
  await p.close();
}
await b.close();
