import puppeteer from "puppeteer-core";
const sleep=m=>new Promise(r=>setTimeout(r,m));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],
  defaultViewport:{width:390,height:844,deviceScaleFactor:3,isMobile:true,hasTouch:true}});
const p=await b.newPage();
await p.goto("https://mineex.ca/home?mxdiag=1",{waitUntil:'networkidle2',timeout:90000});
await sleep(7000);
const r=await p.evaluate(()=>{
  const txt=(document.body.innerText||'');
  const hit=/diag|DIAG|poster|decoded|boot|verdict/i.test(txt);
  const panel=[...document.querySelectorAll('*')].find(e=>/mxdiag|diag/i.test(e.className||'')||/DIAG/.test((e.textContent||'').slice(0,40)));
  return { diagTextPresent:hit, panelEl: panel?panel.tagName:null, firstChars: txt.slice(0,120).replace(/\n/g,' ') };
});
console.log(JSON.stringify(r,null,1));
await b.close();
