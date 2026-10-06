import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
for(const route of ["/","/pro","/investor"]){
  const p=await b.newPage();
  await p.setViewport({width:390,height:844,deviceScaleFactor:3,isMobile:true,hasTouch:true});
  await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
  await p.goto("http://localhost:5197"+route,{waitUntil:"networkidle2"}); await sleep(4000);
  const counts=[];
  for(let i=0;i<=16;i++){
    await p.evaluate((y)=>window.scrollTo(0,document.body.scrollHeight*y), i/16);
    await sleep(850);   // settled: what a reader actually has mounted
    counts.push(await p.evaluate(()=>document.querySelectorAll('[role="group"]').length));
  }
  console.log(route.padEnd(11),"settled scenes per stop:",counts.join(""),"| max",Math.max(...counts));
  await p.close();
}
await b.close();
