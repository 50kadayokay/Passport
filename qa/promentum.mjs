// How many demo states does ONE hard fling drive? Walking every state a momentum fling
// crosses is what looked like the Pro demo "changing pages on its own" after the finger
// left the glass. Counts real __demoGo calls per fling.
// Also reports whether the element that PAINTS the dark background is matched by the
// phone dvh rule (the black-line fix) -- targeting only; headless cannot prove behaviour.
import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const BASE=process.argv[2]||"http://localhost:5197";
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const p=await b.newPage();
await p.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
await p.goto(BASE+"/pro",{waitUntil:"domcontentloaded",timeout:90000}); await sleep(5500);

// wrap __demoGo so every state change the page drives is recorded
await p.evaluate(()=>{ window.__calls=[]; const real=window.__demoGo;
  if(real){ window.__demoGo=(i)=>{ window.__calls.push(i); return real(i); }; } });

const bg=await p.evaluate(()=>{
  const el=document.querySelector(".mx-story-m");
  if(!el) return {err:"no .mx-story-m (not the mobile branch?)"};
  const cs=getComputedStyle(el);
  // is any rule in the page's stylesheets targeting it with dvh?
  let ruleFound=false;
  for(const sh of document.styleSheets){ let rules; try{ rules=sh.cssRules; }catch(_){ continue; }
    const walk=(rs)=>{ for(const r of rs){ if(r.cssRules) walk(r.cssRules);
      else if(r.selectorText && /mx-story-m/.test(r.selectorText) && /dvh/.test(r.cssText)) ruleFound=true; } };
    if(rules) walk(rules); }
  return { bg:cs.backgroundColor, h:Math.round(el.getBoundingClientRect().height), win:innerHeight, dvhRule:ruleFound };
});
console.log("background painter .mx-story-m:", JSON.stringify(bg));

let prev=0;
console.log("\nflings (each a hard throw, then 1.6s to let momentum finish):");
let worst=0;
for(let i=1;i<=8;i++){
  await p.evaluate(()=>window.__calls.length=0);
  await p.touchscreen.touchStart(195,790);
  for(let s=1;s<=4;s++) await p.touchscreen.touchMove(195,790-s*175);
  await p.touchscreen.touchEnd();
  await sleep(1600);
  const r=await p.evaluate(()=>({calls:window.__calls.slice(), y:Math.round(scrollY)}));
  worst=Math.max(worst,r.calls.length);
  console.log(`  ${i}: y${String(r.y).padStart(6)}  __demoGo fired ${r.calls.length}x  ${JSON.stringify(r.calls).slice(0,70)}`);
}
console.log(`\n  worst: ${worst} state changes from a single fling`);
await b.close();
