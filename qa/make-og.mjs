// Capture the live hero at Open Graph dimensions. No redesign — this is a photograph
// of the page as it already exists.
import puppeteer from "puppeteer-core";
const sleep=m=>new Promise(r=>setTimeout(r,m));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],
  defaultViewport:{width:1200,height:630,deviceScaleFactor:2}});
const p=await b.newPage();
await p.goto(process.argv[2]||"https://mineex.ca/home",{waitUntil:'networkidle2',timeout:90000});
await sleep(9000);                       // let the hero image and phone settle
await p.evaluate(()=>window.scrollTo(0,0));
await sleep(1200);
await p.screenshot({path:"/tmp/og-hero.png"});
console.log("captured /tmp/og-hero.png");
await b.close();
