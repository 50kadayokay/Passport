import puppeteer from "puppeteer-core";
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const p=await b.newPage();
await p.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
await p.goto("http://localhost:5197"+process.argv[2],{waitUntil:"networkidle2"}).catch(()=>{});
await new Promise(r=>setTimeout(r,5000));
console.log(await p.evaluate(()=>({url:location.href,hasIncluded:document.body.innerText.includes("What's included"),hasNotSure:document.body.innerText.includes("Not sure which plan fits"),w:innerWidth})));
await b.close();
