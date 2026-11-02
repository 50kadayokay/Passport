// Acceptance: a finger dragged over the device must move nothing, on every phone page.
import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const B=process.argv[2]||"http://localhost:5197";
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
for(const [route,label] of [["/","home"],["/pro","pro"],["/investor","investor"]]){
  const p=await b.newPage(); await p.setCacheEnabled(false);
  await p.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
  await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
  await p.goto(B+route,{waitUntil:"domcontentloaded",timeout:90000}); await sleep(5200);
  await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Explore the product"]'); if(e)e.click();});
  await sleep(1000);
  for(let k=0;k<2;k++){ await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Next"]'); if(e&&!e.disabled)e.click();}); await sleep(700); }
  const before=await p.evaluate(()=>{
    const f=[...document.querySelectorAll("iframe")].find(x=>(x.src||"").includes("/app?"));
    return {y:Math.round(scrollY), app:f?Math.round(f.parentElement.getBoundingClientRect().top):null,
            dots:!!document.querySelector('[aria-hidden="true"] span')&&document.querySelectorAll("span").length};
  });
  // aggressive drags straight over the device, both directions
  for(let k=0;k<6;k++){
    await p.touchscreen.touchStart(195,560);
    for(let yy=560;yy>=180;yy-=60) await p.touchscreen.touchMove(195,yy);
    await p.touchscreen.touchEnd();
    await p.touchscreen.touchStart(195,250);
    for(let yy=250;yy<=700;yy+=60) await p.touchscreen.touchMove(195,yy);
    await p.touchscreen.touchEnd();
  }
  await sleep(900);
  const after=await p.evaluate(()=>{
    const f=[...document.querySelectorAll("iframe")].find(x=>(x.src||"").includes("/app?"));
    let inner=null; return {y:Math.round(scrollY), app:f?Math.round(f.parentElement.getBoundingClientRect().top):null};
  });
  const fr=p.frames().find(f=>/\/app\?/.test(f.url()));
  const innerScroll=fr?await fr.evaluate(()=>{let m=0;document.querySelectorAll("*").forEach(e=>{if(e.scrollTop>m)m=e.scrollTop;});return Math.round(m);}).catch(()=>-1):-1;
  console.log(label.padEnd(9),`pageY ${before.y}->${after.y}`, `deviceTop ${before.app}->${after.app}`,
    `innerMaxScroll ${innerScroll}`, (before.y===after.y&&before.app===after.app)?"UNMOVED ✓":"MOVED ✗");
  await p.close();
}
await b.close();
