import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const p=await b.newPage();
await p.setViewport({width:390,height:844,deviceScaleFactor:3,isMobile:true,hasTouch:true});
await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
let errs=[]; p.on("pageerror",e=>errs.push(e.message)); p.on("console",m=>{if(m.type()==="error")errs.push(m.text().slice(0,140));});
await p.goto("http://localhost:5197/",{waitUntil:"networkidle2"}); await sleep(4000);
// find the deck and step through it
const H=await p.evaluate(()=>document.body.scrollHeight);
let shots=0;
for(const frac of [0.16,0.22,0.28,0.34,0.40,0.46]){
  await p.evaluate((f)=>window.scrollTo(0,document.body.scrollHeight*f),frac);
  await sleep(1100);
  const info=await p.evaluate(()=>{
    const g=document.querySelector('[role="group"]');
    const h3=[...document.querySelectorAll("h3")].find(e=>e.offsetParent);
    return { device: g?Math.round(g.getBoundingClientRect().width):null,
             copy: h3?h3.textContent.slice(0,44):null };
  });
  if(info.device){ await p.screenshot({path:`/tmp/deck-${shots++}.png`}); }
  console.log("at",(frac*100).toFixed(0)+"%","| device px:",info.device,"| copy:",info.copy);
}
console.log("errors:",errs.length?errs.slice(0,2):"none");
await b.close();
