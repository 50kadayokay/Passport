import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const p=await b.newPage();
await p.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
await p.goto("http://localhost:5197/",{waitUntil:"networkidle2"}).catch(()=>{});
await sleep(6000);
await p.click('button[aria-label="Menu"]');
await sleep(700);
await p.screenshot({path:"/tmp/mxshots/menu-open.png"});
const m=await p.evaluate(()=>{
  const rows=[...document.querySelectorAll('div[style*="position: fixed"] a')].map(a=>{const r=a.getBoundingClientRect();return {t:a.textContent.trim(),w:Math.round(r.width),h:Math.round(r.height),y:Math.round(r.top)};}).filter(r=>r.h>0);
  return {bodyOverflow:getComputedStyle(document.body).overflow, navH:getComputedStyle(document.documentElement).getPropertyValue("--mx-nav-h").trim(), rows};
});
console.log(JSON.stringify(m,null,1));
await b.close();
