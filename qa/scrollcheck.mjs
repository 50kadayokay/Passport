import puppeteer from "puppeteer-core";
const BASE=process.argv[2]||"https://mineex.ca";
const sleep=m=>new Promise(r=>setTimeout(r,m));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],defaultViewport:{width:1440,height:900}});
for(const path of ['/pro','/investor']){
  const p=await b.newPage();
  await p.goto(BASE+path,{waitUntil:'networkidle2',timeout:90000});
  await sleep(4000);
  const trail=[];
  for(let i=0;i<10;i++){
    await p.evaluate(()=>window.scrollBy(0,700));
    await sleep(500);
    trail.push(await p.evaluate(()=>Math.round(window.scrollY)));
  }
  const url=await p.evaluate(()=>location.pathname+location.search);
  const stuck = trail.filter(v=>v===0).length;
  console.log(`${path.padEnd(11)} scrollY after 10 scrolls: ${trail.join(',')}  |  snapped-to-0: ${stuck}/10  |  url now: ${url}`);
  await p.close();
}
await b.close();
