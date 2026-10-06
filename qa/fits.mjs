// Does every element of the deck actually fit inside the sticky viewport?
import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
for(const [W,H] of [[390,844],[390,740],[390,690],[393,748],[430,800]]){
 for(const [route,name] of [["/","home"],["/pro","pro"],["/investor","investor"]]){
  const p=await b.newPage();
  await p.setViewport({width:W,height:H,deviceScaleFactor:2,isMobile:true,hasTouch:true});
  await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
  await p.goto("http://localhost:5197"+route,{waitUntil:"networkidle2"}); await sleep(3800);
  let worst=null;
  for(let f=12;f<=62;f+=5){
    await p.evaluate(x=>window.scrollTo(0,document.body.scrollHeight*x/100),f); await sleep(500);
    const m=await p.evaluate(()=>{
      const g=document.querySelector('[role="group"]'); if(!g) return null;
      const sticky=g.closest("div[style*='sticky']") || g.parentElement.parentElement;
      const sr=sticky.getBoundingClientRect();
      // the deepest visible text in the copy block
      const copy=sticky.querySelector(".mx-copyin");
      if(!copy) return null;
      const ps=[...copy.querySelectorAll("p,h3")];
      const lowest=Math.max(...ps.map(e=>e.getBoundingClientRect().bottom));
      const dots=sticky.querySelector("div[aria-hidden][style*='flex']");
      return { stickyBottom:Math.round(sr.bottom), copyBottom:Math.round(lowest),
               overflowPx: Math.round(lowest - sr.bottom) };
    });
    if(m && (worst===null || m.overflowPx>worst.overflowPx)) worst=m;
  }
  const bad = worst && worst.overflowPx > 0;
  console.log(`${W}x${H} ${name.padEnd(9)} copy bottom ${worst?worst.copyBottom:"-"} vs viewport ${worst?worst.stickyBottom:"-"}  ${bad?"❌ CLIPPED by "+worst.overflowPx+"px":"✅ fits"}`);
  await p.close();
 }
}
await b.close();
