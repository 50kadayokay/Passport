// Does the iPad have content at each conference state, or is it the empty placeholder?
import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const B=process.argv[2]||"http://localhost:5197";
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const p=await b.newPage(); await p.setCacheEnabled(false);
await p.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
await p.goto(B+"/",{waitUntil:"domcontentloaded",timeout:90000}); await sleep(6000);
await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Explore the product"]'); if(e)e.click();});
await sleep(900);
for(let i=0;i<14;i++){
  await sleep(1300);
  const head=await p.evaluate(()=>(document.querySelector("h2")||{}).innerText?.slice(0,30));
  const confFrames=p.frames().filter(f=>/confv3demo/.test(f.url()));
  let txt="(no tablet frame)";
  if(confFrames.length){
    txt=await confFrames[0].evaluate(()=>{
      const t=(document.body.innerText||"").replace(/\s+/g," ").trim();
      return t? t.slice(0,46) : "(EMPTY)";
    }).catch(()=>"(unreadable)");
  }
  if(/conference|upgrade|templates|investors|booth|unmistak/i.test(head||"")) console.log(`state ${String(i).padStart(2)} "${head}" → tablet: ${txt}`);
  const more=await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Next"]'); if(!e||e.disabled) return false; e.click(); return true;});
  if(!more) break;
}
await b.close();
