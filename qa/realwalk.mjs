import puppeteer from "puppeteer-core";
import fs from "fs";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
fs.mkdirSync("/tmp/mxreal",{recursive:true});
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
for(const [route,name] of [["/?realwalk=1","home"],["/pro?realwalk=1","pro"],["/investor?realwalk=1","investor"]]){
  const p=await b.newPage();
  await p.setViewport({width:390,height:740,deviceScaleFactor:2,isMobile:true,hasTouch:true});
  await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
  let errs=0; p.on("pageerror",()=>errs++);
  await p.goto("http://localhost:5197"+route,{waitUntil:"networkidle2",timeout:60000}); await sleep(6000);
  const m=await p.evaluate(()=>({h:document.body.scrollHeight, iframes:document.querySelectorAll("iframe").length,
    nodes:document.querySelectorAll("*").length, over:document.documentElement.scrollWidth>innerWidth+1,
    text:document.body.innerText.replace(/\s+/g," ").trim().length}));
  await p.screenshot({path:`/tmp/mxreal/${name}-0.png`});
  for(const f of [0.25,0.45]){ await p.evaluate(x=>window.scrollTo(0,document.body.scrollHeight*x),f); await sleep(1800);
    await p.screenshot({path:`/tmp/mxreal/${name}-${Math.round(f*100)}.png`}); }
  console.log(name.padEnd(10), JSON.stringify({...m, errs}));
  await p.close();
}
await b.close();
