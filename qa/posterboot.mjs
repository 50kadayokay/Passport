import puppeteer from "puppeteer-core";
const BASE=process.argv[2]||"http://localhost:5188";
const sleep=m=>new Promise(r=>setTimeout(r,m));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],
  defaultViewport:{width:390,height:844,deviceScaleFactor:3,isMobile:true,hasTouch:true}});
for(const path of ['/investor','/home']){
  const p=await b.newPage(); await p.setCacheEnabled(false);
  const c=await p.createCDPSession(); await c.send('Network.enable');
  await c.send('Network.emulateNetworkConditions',{offline:false,latency:40,downloadThroughput:10*1024*1024/8,uploadThroughput:3*1024*1024/8});
  await c.send('Emulation.setCPUThrottlingRate',{rate:4});
  await p.goto(BASE+path,{waitUntil:'domcontentloaded',timeout:90000});
  const seen=[];
  for(const at of [500,1500,3000,5000,8000,12000]){
    await sleep(at===500?500:0);
    while(true){ const el=await p.evaluate(()=>performance.now()); if(el>=at) break; await sleep(60); }
    const r=await p.evaluate(()=>{
      const po=[...document.querySelectorAll('img')].find(i=>/opening-poster/.test(i.currentSrc||i.src||''));
      let vis=false; if(po){ let n=po.parentElement; vis=n?getComputedStyle(n).opacity!=='0':false; }
      return {present:!!po, coverVisible:vis};
    });
    seen.push(`${at}ms:${r.present?(r.coverVisible?'SHOWN':'faded'):'gone'}`);
  }
  console.log(`${path.padEnd(11)} ${seen.join('  ')}`);
  await p.close();
}
await b.close();
