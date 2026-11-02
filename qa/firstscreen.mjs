// When does the FIRST walkthrough screen have all its imagery, and what is on the wire?
import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const B=process.argv[2]||"http://localhost:5197";
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const p=await b.newPage(); await p.setCacheEnabled(false);
await p.setViewport({width:390,height:844,deviceScaleFactor:3,isMobile:true,hasTouch:true});
await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
const cdp=await p.target().createCDPSession();
await cdp.send("Emulation.setCPUThrottlingRate",{rate:4});
await cdp.send("Network.enable");
await cdp.send("Network.emulateNetworkConditions",{offline:false,latency:150,downloadThroughput:1.6*1024*1024/8,uploadThroughput:750*1024/8});
let news=0, newsBytes=0, fixture=0;
p.on("response",r=>{const u=r.url();
  if(/jmn_feeder|globe\/2026|newsfile|\.jpg-6ac|\.png-6ac/.test(u)) news++;
  if(/kingsmen-fixture/.test(u)) fixture++;});
const t0=Date.now();
await p.goto(B+"/",{waitUntil:"domcontentloaded",timeout:120000});
let done=null;
for(let i=0;i<70;i++){
  await sleep(500);
  const fr=p.frames().find(f=>/\/app\?/.test(f.url()));
  if(!fr) continue;
  const r=await fr.evaluate(()=>{
    const ov=document.querySelector('[data-page="overview"]');
    if(!ov) return null;
    const imgs=[...ov.querySelectorAll("img")];
    return { n:imgs.length, ok:imgs.filter(i=>i.complete&&i.naturalWidth>0).length };
  }).catch(()=>null);
  if(r && r.n>0 && r.ok===r.n){ done=Date.now()-t0; break; }
}
console.log(`first-screen imagery complete: ${done!==null?done+"ms":"NOT within 35s"}`);
console.log(`requests — news/feed images: ${news}   first-screen fixtures: ${fixture}`);
await b.close();
