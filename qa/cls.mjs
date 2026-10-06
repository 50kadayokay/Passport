import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const p=await b.newPage();
await p.setViewport({width:390,height:844,deviceScaleFactor:3,isMobile:true,hasTouch:true});
await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
await p.evaluateOnNewDocument(()=>{ window.__shifts=[];
  new PerformanceObserver(l=>{ for(const e of l.getEntries()) if(!e.hadRecentInput)
    window.__shifts.push({v:+e.value.toFixed(4), srcs:(e.sources||[]).map(s=>{
      const n=s.node; return n? (n.tagName+(n.className&&typeof n.className==='string'?'.'+n.className.split(' ')[0]:'')+' "'+(n.innerText||'').slice(0,28).replace(/\s+/g,' ')+'"') : '?';})});
  }).observe({type:"layout-shift",buffered:true});
});
await p.goto("http://localhost:5197/investor",{waitUntil:"networkidle2"}); await sleep(3500);
for(let f=0;f<=100;f+=6){ await p.evaluate(x=>window.scrollTo(0,document.body.scrollHeight*x/100),f); await sleep(240); }
const sh=await p.evaluate(()=>window.__shifts.sort((a,b)=>b.v-a.v).slice(0,6));
for(const s of sh) console.log(s.v, "|", s.srcs.join(" ;; ").slice(0,150));
await b.close();
