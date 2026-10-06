import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const p=await b.newPage();
await p.setViewport({width:1680,height:1050});
let errs=[]; p.on("pageerror",e=>errs.push(e.message.slice(0,120))); p.on("console",m=>{if(m.type()==="error")errs.push(m.text().slice(0,120));});
await p.goto("http://localhost:5197/",{waitUntil:"networkidle2"}); await sleep(3500);
const order=["/pro","/investor","/conference-mode","/pricing","/","/investor","/pro","/"];
for(const dest of order){
  await p.evaluate((d)=>{const a=[...document.querySelectorAll("a[href]")].find(x=>new URL(x.href,location.origin).pathname===d); if(a)a.click();},dest);
  await sleep(1800);
  const s=await p.evaluate(()=>({
    path:location.pathname,
    htmlClass:document.documentElement.className||"(none)",
    bodyOverflow:getComputedStyle(document.body).overflow,
    scrollBehavior:getComputedStyle(document.documentElement).scrollBehavior,
    iframes:document.querySelectorAll("iframe").length,
    nodes:document.querySelectorAll("*").length,
    textLen:document.body.innerText.replace(/\s+/g," ").trim().length,
  }));
  console.log(dest.padEnd(17), "→", s.path.padEnd(17), "nodes",String(s.nodes).padStart(5), "iframes",s.iframes, "| html:",s.htmlClass, "| overflow:",s.bodyOverflow, "| text:",s.textLen);
}
console.log("\nerrors:",errs.length?errs.slice(0,4):"none");
const heap=await p.evaluate(()=>performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):null);
console.log("heap after 8 navigations:",heap,"MB");
await b.close();
