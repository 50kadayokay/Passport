import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const p=await b.newPage();
await p.setViewport({width:390,height:844,deviceScaleFactor:3,isMobile:true,hasTouch:true});
await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
let errs=[]; p.on("pageerror",e=>errs.push(e.message)); p.on("console",m=>{if(m.type()==="error")errs.push(m.text());});
await p.goto("http://localhost:5197/",{waitUntil:"networkidle2"});
await sleep(4000);
// scroll the PROJECTS section into view
const y=await p.evaluate(()=>{const h=[...document.querySelectorAll("h2")].find(e=>e.textContent.includes("Let investors explore"));
  return h?Math.round(window.scrollY+h.getBoundingClientRect().top-70):0;});
await p.evaluate((yy)=>window.scrollTo(0,yy),y); await sleep(1800);
const sec=await p.evaluateHandle(()=>{const h=[...document.querySelectorAll("h2")].find(e=>e.textContent.includes("Let investors explore"));return h.closest("section");});
await sec.screenshot({path:"/tmp/proof-projects.png"});
const m=await p.evaluate(()=>{
  const h=[...document.querySelectorAll("h2")].find(e=>e.textContent.includes("Let investors explore"));
  const sec=h.closest("section");
  const dev=sec.querySelector('[role="group"]');
  const r=dev.getBoundingClientRect();
  return { phoneCssWidth:getComputedStyle(dev).width, phonePx:Math.round(r.width), phoneH:Math.round(r.height),
    vwPct:+(r.width/window.innerWidth*100).toFixed(1),
    sectionNodes:sec.querySelectorAll("*").length, pageNodes:document.querySelectorAll("*").length,
    iframes:document.querySelectorAll("iframe").length,
    sectionH:Math.round(sec.getBoundingClientRect().height),
    tabButtons:dev.querySelectorAll("button").length };
});
console.log(JSON.stringify(m,null,1));
// INTERACT: tap the second project, then the Timeline tab
const before=await p.evaluate(()=>document.querySelector('[role="group"]').innerText.slice(0,120));
await p.evaluate(()=>{const d=document.querySelector('[role="group"]');
  const b=[...d.querySelectorAll("button")].find(x=>x.textContent.trim()==="Almoloya"); if(b)b.click();});
await sleep(900);
await p.evaluate(()=>{const d=document.querySelector('[role="group"]');
  const b=[...d.querySelectorAll('button[aria-label="timeline"]')][0]; if(b)b.click();});
await sleep(1100);
const sec2=await p.evaluateHandle(()=>{const h=[...document.querySelectorAll("h2")].find(e=>e.textContent.includes("Let investors explore"));return h.closest("section");});
await sec2.screenshot({path:"/tmp/proof-projects-after.png"});
const after=await p.evaluate(()=>document.querySelector('[role="group"]').innerText.slice(0,120));
console.log("\nBEFORE tap:",JSON.stringify(before));
console.log("AFTER  tap:",JSON.stringify(after));
console.log("changed:",before!==after);
// unmount check: scroll far away
await p.evaluate(()=>window.scrollTo(0,0)); await sleep(1600);
console.log("\nafter scrolling away — page nodes:",await p.evaluate(()=>document.querySelectorAll("*").length),
            "| device present:",await p.evaluate(()=>!!document.querySelector('[role="group"]')));
console.log("errors:",errs.length?errs:"none");
await b.close();
