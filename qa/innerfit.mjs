// Inside the embedded app: does the bottom nav stay seated at the bottom of the frame at
// every state, and does any scroller overshoot its content?
import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const B=process.argv[2]||"http://localhost:5197";
const ROUTE=process.argv[3]||"/pro";
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const p=await b.newPage(); await p.setCacheEnabled(false);
await p.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
await p.goto(B+ROUTE,{waitUntil:"domcontentloaded",timeout:90000}); await sleep(5500);
await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Explore the product"]'); if(e)e.click();});
await sleep(1200);
for(let i=0;i<14;i++){
  await sleep(1500);
  const fr=p.frames().find(f=>/\/app\?/.test(f.url()));
  if(!fr){ console.log(`state ${i}: no app frame`); }
  else {
    const r=await fr.evaluate(()=>{
      const vh=innerHeight, vw=innerWidth;
      // the app's bottom tab bar
      const bars=[...document.querySelectorAll("nav,div")].filter(e=>{
        const s=getComputedStyle(e), q=e.getBoundingClientRect();
        return (s.position==="fixed"||s.position==="absolute") && q.width>vw*0.8 && q.height>40 && q.height<110 && q.bottom>vh*0.6;});
      const bar=bars.sort((a,c)=>c.getBoundingClientRect().bottom-a.getBoundingClientRect().bottom)[0];
      const br=bar?bar.getBoundingClientRect():null;
      // any scroller past its end?
      let over=0;
      document.querySelectorAll("*").forEach(e=>{const s=e.scrollHeight-e.clientHeight;
        if(s>4&&e.scrollTop>s+1) over=Math.max(over,Math.round(e.scrollTop-s));});
      const body=document.body.getBoundingClientRect();
      return { vh, navBottom: br?Math.round(br.bottom):null, gap: br?Math.round(vh-br.bottom):null,
               bodyBottom:Math.round(body.bottom), bodyGap:Math.round(vh-body.bottom),
               overscroll:over, docScroll:Math.round(document.scrollingElement.scrollTop) };
    }).catch(e=>({err:String(e).slice(0,50)}));
    const flag = r.gap!==null && r.gap>2 ? `  ← NAV LIFTED ${r.gap}px` : "";
    console.log(`state ${String(i).padStart(2)}: navGap ${r.gap}  bodyGap ${r.bodyGap}  docScroll ${r.docScroll}  overscroll ${r.overscroll}${flag}`);
  }
  const more=await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Next"]'); if(!e||e.disabled) return false; e.click(); return true;});
  if(!more) break;
}
await b.close();
