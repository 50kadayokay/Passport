import puppeteer from "puppeteer-core";
import fs from "fs";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
fs.mkdirSync("/tmp/mxdeck",{recursive:true});
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
for(const [route,name,stops] of [["/","home",[12,22,32,46]],["/pro","pro",[12,26,40,56]],["/investor","investor",[14,30,46,62]]]){
  const p=await b.newPage();
  await p.setViewport({width:390,height:844,deviceScaleFactor:3,isMobile:true,hasTouch:true});
  await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
  await p.goto("http://localhost:5197"+route,{waitUntil:"networkidle2"}); await sleep(4000);
  let n=0;
  for(const f of stops){
    await p.evaluate(x=>window.scrollTo(0,document.body.scrollHeight*x/100),f);
    await sleep(1200);
    await p.screenshot({path:`/tmp/mxdeck/${name}-${n++}.png`});
  }
  await p.close();
  console.log(name,"captured");
}
await b.close();
