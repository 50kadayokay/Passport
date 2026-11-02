// Real touch swipes, not scrollTo — the thing my scroll tests never exercised.
import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const route=process.argv[2]||"/";
const p=await b.newPage();
await p.setViewport({width:390,height:740,deviceScaleFactor:2,isMobile:true,hasTouch:true});
await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
const errs=[]; p.on("pageerror",e=>errs.push("PAGEERROR "+e.message.slice(0,160)));
p.on("console",m=>{if(m.type()==="error")errs.push("CONSOLE "+m.text().slice(0,160));});
p.on("crash",()=>errs.push("TAB CRASHED"));
await p.goto("http://localhost:5197"+route,{waitUntil:"networkidle2",timeout:60000}); await sleep(5000);
const cdp=await p.target().createCDPSession(); await cdp.send("Performance.enable");
const heap=async()=>{const m=(await cdp.send("Performance.getMetrics")).metrics; return Math.round((m.find(x=>x.name==="JSHeapUsedSize")||{}).value/1048576);};
console.log("start heap",await heap(),"MB");
let dead=false;
for(let i=1;i<=40;i++){
  try{
    await p.touchscreen.touchStart(195,620);
    for(let y=620;y>140;y-=60){ await p.touchscreen.touchMove(195,y); await sleep(12); }
    await p.touchscreen.touchEnd();
  }catch(e){ console.log("swipe",i,"FAILED:",e.message.slice(0,90)); dead=true; break; }
  await sleep(260);
  if(i%10===0){
    try{ console.log(` after ${i} swipes — heap ${await heap()}MB | nodes ${await p.evaluate(()=>document.querySelectorAll("*").length)} | iframes ${await p.evaluate(()=>document.querySelectorAll("iframe").length)} | scrollY ${await p.evaluate(()=>Math.round(window.scrollY))}`); }
    catch(e){ console.log(" page unresponsive at swipe",i,":",e.message.slice(0,90)); dead=true; break; }
  }
}
console.log(dead?"❌ DIED":"✅ survived 40 swipes");
console.log("errors:",errs.length?errs.slice(0,6):"none");
await b.close();
