import puppeteer from "puppeteer-core";
const base=(p)=>(/\.html($|\?)/.test(p)?"http://localhost:5198":"http://localhost:5197")+p;
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const p=await b.newPage();
await p.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
await p.goto(base(process.argv[2]),{waitUntil:"networkidle2"}).catch(()=>{});
await new Promise(r=>setTimeout(r,5500));
console.log(await p.evaluate(()=>[...document.querySelectorAll("button,a,input,select,textarea")].map(e=>{const r=e.getBoundingClientRect();return{tag:e.tagName.toLowerCase(),type:e.type||"",w:Math.round(r.width),h:Math.round(r.height),txt:(e.textContent||e.value||e.getAttribute("aria-label")||"").trim().slice(0,28)};}).filter(o=>o.w>0&&o.h>0&&(o.h<40||o.w<40))));
await b.close();
