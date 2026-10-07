import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const B=process.argv[2]||"http://localhost:5197";
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
for(const [route,label] of [["/","home"],["/pro","pro"]]){
  const p=await b.newPage(); await p.setCacheEnabled(false);
  await p.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
  await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
  await p.goto(B+route,{waitUntil:"domcontentloaded",timeout:90000}); await sleep(5500);
  await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Explore the product"]'); if(e)e.click();});
  await sleep(1000);
  for(let k=0;k<2;k++){ await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Next"]'); if(e&&!e.disabled)e.click();}); await sleep(800); }
  console.log(label.padEnd(6), JSON.stringify(await p.evaluate(()=>{
    const f=[...document.querySelectorAll("iframe")].find(x=>(x.src||"").includes("/app?"));
    if(!f) return {none:true};
    const r=f.getBoundingClientRect();
    const cs=getComputedStyle(f);
    // the logical size the iframe is laid out at, before any transform
    const logical={w:parseFloat(cs.width),h:parseFloat(cs.height)};
    let scale=1; const m=(cs.transform||"").match(/matrix\(([-\d.]+)/); if(m) scale=+m[1];
    // the clipping box it sits inside
    const par=f.parentElement.getBoundingClientRect();
    return { rendered:{w:Math.round(r.width),h:Math.round(r.height)}, logical, scale:+scale.toFixed(4),
             clip:{w:Math.round(par.width),h:Math.round(par.height)},
             overflowRight: Math.round(r.right - par.right) };
  })));
  await p.close();
}
await b.close();
