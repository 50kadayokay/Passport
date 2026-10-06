import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
for(const [W,H,tag] of [[390,740,"portrait"],[740,390,"landscape"]]){
  const p=await b.newPage();
  await p.setViewport({width:W,height:H,deviceScaleFactor:2,isMobile:true,hasTouch:true});
  await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
  await p.goto("http://localhost:5197/site?conftemplate=1&t=keynote&c=vilcanota-demo",{waitUntil:"networkidle2"});
  await sleep(6000);
  await p.screenshot({path:`/tmp/tpl-${tag}.png`});
  console.log(tag, "|", (await p.evaluate(()=>document.body.innerText.replace(/\s+/g," ").trim())).slice(0,150));
  await p.close();
}
await b.close();
