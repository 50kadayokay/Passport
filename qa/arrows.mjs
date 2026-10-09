// Arrow-driven walkthroughs: one press = one state, no self-motion, page does not scroll.
import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const B=process.argv[2]||"http://localhost:5197";
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
for(const [route,label] of [["/","home"],["/pro","pro"],["/investor","investor"]]){
  const p=await b.newPage(); await p.setCacheEnabled(false);
  const errs=[]; p.on("pageerror",e=>errs.push(e.message.slice(0,90)));
  await p.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
  await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
  await p.goto(B+route,{waitUntil:"domcontentloaded",timeout:90000}); await sleep(5200);
  // the opening screen offers a single centred "down" control; press it to start the story
  const started=await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Explore the product"]'); if(!e) return false; e.click(); return true;});
  if(started) await sleep(900);
  const info=await p.evaluate(()=>({
    pageH:document.body.scrollHeight, win:innerHeight,
    next:!!document.querySelector('button[aria-label="Next"]'),
    prev:!!document.querySelector('button[aria-label="Previous"]'),
    prevDisabled:(document.querySelector('button[aria-label="Previous"]')||{}).disabled,
  }));
  // press Next 5x, read the beat counter / state each time
  const seen=[];
  for(let k=0;k<5;k++){
    const ok=await p.evaluate(()=>{const el=document.querySelector('button[aria-label="Next"]'); if(!el||el.disabled) return false; el.click(); return true;});
    if(!ok){seen.push("disabled");break;}
    await sleep(800);
    seen.push(await p.evaluate(()=>{ try{const s=window.__demoState&&window.__demoState(); if(s) return s.cur;}catch(_){}
      const m=(document.body.innerText.match(/(\d+)\s*\/\s*\d+/)||[])[1]; return m?+m:"?";}));
  }
  // then Back twice
  const back=[];
  for(let k=0;k<2;k++){
    await p.evaluate(()=>{const el=document.querySelector('button[aria-label="Previous"]'); if(el&&!el.disabled) el.click();});
    await sleep(800);
    back.push(await p.evaluate(()=>{ try{const s=window.__demoState&&window.__demoState(); if(s) return s.cur;}catch(_){}
      const m=(document.body.innerText.match(/(\d+)\s*\/\s*\d+/)||[])[1]; return m?+m:"?";}));
  }
  const after=await p.evaluate(()=>({pageH:document.body.scrollHeight, y:Math.round(scrollY)}));
  console.log(label.padEnd(9),
    `arrows:${info.next&&info.prev?"yes":"NO"}  prevDisabledAtStart:${info.prevDisabled}`,
    `pageH ${info.pageH}/${info.win}`, `forward ${JSON.stringify(seen)}`, `back ${JSON.stringify(back)}`,
    `scrollY ${after.y}`, errs.length?`ERRORS ${errs.slice(0,2)}`:"");
  await p.close();
}
await b.close();
