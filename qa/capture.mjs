// Capture one named chapter section on a mobile page, optionally after interacting.
import puppeteer from "puppeteer-core";
import fs from "fs";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
fs.mkdirSync("/tmp/mxfinal",{recursive:true});
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});

async function page(route){
  const p=await b.newPage();
  await p.setViewport({width:390,height:844,deviceScaleFactor:3,isMobile:true,hasTouch:true});
  await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
  await p.goto("http://localhost:5197"+route,{waitUntil:"networkidle2"}); await sleep(4200);
  return p;
}
// scroll so the section containing `text` is in view, return its element handle
async function section(p,text){
  await p.evaluate((t)=>{const h=[...document.querySelectorAll("h1,h2,h3")].find(e=>e.textContent.includes(t));
    if(h){const s=h.closest("section");window.scrollTo(0,window.scrollY+s.getBoundingClientRect().top-56);}},text);
  await sleep(1600);
  return p.evaluateHandle((t)=>{const h=[...document.querySelectorAll("h1,h2,h3")].find(e=>e.textContent.includes(t));return h.closest("section");},text);
}
async function shot(p,text,name){ const s=await section(p,text); await s.screenshot({path:`/tmp/mxfinal/${name}.png`}); }
async function viewport(p,name){ await p.screenshot({path:`/tmp/mxfinal/${name}.png`}); }

const job=process.argv[2];

if(job==="home"){
  const p=await page("/");
  await viewport(p,"home-hero");
  await shot(p,"Let investors explore","home-projects");
  await shot(p,"Put the financial picture","home-capital");
  await shot(p,"Build your investor presence","home-cta");
  // interaction: tap Almoloya then Progress tab
  await section(p,"Let investors explore");
  await p.evaluate(()=>{const d=[...document.querySelectorAll('[role="group"]')].find(x=>x.innerText.includes("Projects"));
    const b=[...d.querySelectorAll("button")].find(x=>x.textContent.trim()==="Almoloya"); if(b)b.click();});
  await sleep(700);
  await p.evaluate(()=>{const d=[...document.querySelectorAll('[role="group"]')].find(x=>x.innerText.includes("Almoloya")||x.innerText.includes("Projects"));
    const b=d.querySelector('button[aria-label="capital"]'); if(b)b.click();});
  await sleep(1000);
  await shot(p,"Let investors explore","home-projects-after");
  await p.close();
}
if(job==="pro"){
  const p=await page("/pro");
  await viewport(p,"pro-hero");
  await shot(p,"Your company, built for investors","pro-overview");
  await shot(p,"Turn years of disclosure","pro-timeline");
  await shot(p,"Make your capital position","pro-capital");
  await shot(p,"Keep your investor content","pro-media");
  await shot(p,"Ready to build your investor presence","pro-cta");
  await section(p,"Your company, built for investors");
  await p.evaluate(()=>{const d=document.querySelector('[role="group"]'); const b=d&&d.querySelector('button[aria-label="team"]'); if(b)b.click();});
  await sleep(1000);
  await shot(p,"Your company, built for investors","pro-overview-after");
  await p.close();
}
if(job==="investor"){
  const p=await page("/investor");
  await viewport(p,"inv-hero");
  await shot(p,"news, in one feed","inv-discover");
  await shot(p,"Find companies worth understanding","inv-explore");
  await shot(p,"whole company story","inv-research");
  await shot(p,"One app for the junior mining market","inv-cta");
  // interaction: open Advanced Search, tick Gold
  await section(p,"Find companies worth understanding");
  await p.evaluate(()=>{const d=[...document.querySelectorAll('[role="group"]')].find(x=>x.innerText.includes("Explore"));
    const b=[...d.querySelectorAll("button")].find(x=>x.textContent.includes("Advanced Search")); if(b)b.click();});
  await sleep(900);
  await shot(p,"Find companies worth understanding","inv-advanced-open");
  await p.evaluate(()=>{const d=[...document.querySelectorAll('[role="group"]')].find(x=>x.innerText.includes("Advanced Search"));
    const b=[...d.querySelectorAll("button")].find(x=>x.textContent.trim().startsWith("Gold")); if(b)b.click();});
  await sleep(800);
  await shot(p,"Find companies worth understanding","inv-advanced-picked");
  await p.close();
}
await b.close(); console.log("captured",job);
