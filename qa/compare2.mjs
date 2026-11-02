import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
for(const [tag,url] of [["current","http://localhost:5197/"],["fastphone","http://localhost:5197/?fastphone=1"]]){
  const p=await b.newPage();
  await p.setViewport({width:1680,height:1050});
  await p.goto(url,{waitUntil:"networkidle2",timeout:60000});
  await sleep(3000);
  // advance into the app chapter with real wheel gestures
  for(let i=0;i<3;i++){
    await p.mouse.move(840,520);
    for(let k=0;k<6;k++){ await p.mouse.wheel({deltaY:120}); await sleep(30); }
    await sleep(1400);
  }
  await sleep(2500);
  await p.screenshot({path:`/tmp/app-${tag}.png`});
  console.log(tag,"captured |",await p.evaluate(()=>{const h=document.querySelector(".mx-story h2, .mx-story h3");return h?h.textContent.slice(0,50):"(no beat copy)";}));
  await p.close();
}
await b.close();
