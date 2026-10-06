import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const p=await b.newPage();
await p.setViewport({width:390,height:740,deviceScaleFactor:2,isMobile:true,hasTouch:true});
await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
await p.evaluateOnNewDocument(()=>{ window.__s=[];
  new PerformanceObserver(l=>{for(const e of l.getEntries()) if(!e.hadRecentInput&&e.value>0.01)
    window.__s.push({v:+e.value.toFixed(3), scrollY:Math.round(window.scrollY), srcs:(e.sources||[]).map(x=>{
      const n=x.node; if(!n||!n.getBoundingClientRect) return "?";
      const r=n.getBoundingClientRect(); const cs=n.className&&typeof n.className==="string"?"."+n.className.split(" ").filter(Boolean).slice(0,2).join("."):"";
      return `${n.tagName}${cs} ${Math.round(r.width)}x${Math.round(r.height)} prev→now ${Math.round(x.previousRect.top)}→${Math.round(x.currentRect.top)}`;})});
  }).observe({type:"layout-shift",buffered:true});});
await p.goto("http://localhost:5197/investor",{waitUntil:"networkidle2"}); await sleep(4000);
const H=await p.evaluate(()=>document.body.scrollHeight);
for(let y=0;y<H;y+=500){ await p.evaluate(v=>window.scrollTo(0,v),y); await sleep(170); }
const sh=await p.evaluate(()=>window.__s.sort((a,b)=>b.v-a.v).slice(0,4));
for(const s of sh) console.log(s.v, "@scrollY", s.scrollY, "|", s.srcs.join("  ;;  "));
await b.close();
