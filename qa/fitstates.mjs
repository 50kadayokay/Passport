// Every state, forward then backward: the app must stay exactly on the screen opening, the
// status bar must stay at the top of the app viewport, the bottom nav flush at its bottom.
import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const B=process.argv[2]||"http://localhost:5197";
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
for(const [route,label] of [["/pro","pro"],["/","home"],["/investor","investor"]]){
  const p=await b.newPage(); await p.setCacheEnabled(false);
  await p.setViewport({width:390,height:844,deviceScaleFactor:3,isMobile:true,hasTouch:true});
  await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
  await p.goto(B+route,{waitUntil:"domcontentloaded",timeout:90000}); await sleep(6000);
  await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Explore the product"]'); if(e)e.click();});
  await sleep(1000);
  const measure=async()=>{
    const g=await p.evaluate(()=>{
      const f=[...document.querySelectorAll("iframe")].find(x=>{const q=x.getBoundingClientRect(); return q.height>200&&q.width>100;});
      if(!f) return null;
      const a=f.parentElement.getBoundingClientRect();
      let op=null;
      for(const el of document.querySelectorAll("div")){
        const s=getComputedStyle(el), q=el.getBoundingClientRect();
        if(q.height>200&&el.getAttribute("aria-hidden")==="true"&&s.backgroundColor==="rgb(244, 245, 247)"){op=q;break;}}
      if(!op) return null;
      return { dTop:+(a.top-op.top).toFixed(2), dBot:+(a.bottom-op.bottom).toFixed(2),
               dLeft:+(a.left-op.left).toFixed(2), dRight:+(a.right-op.right).toFixed(2), absTop:+a.top.toFixed(1) };
    });
    const fr=p.frames().find(f=>/\/app\?/.test(f.url()));
    const inner=fr?await fr.evaluate(()=>{
      const vh=innerHeight;
      const bars=[...document.querySelectorAll("nav,div")].filter(e=>{const s=getComputedStyle(e),q=e.getBoundingClientRect();
        return (s.position==="fixed"||s.position==="absolute")&&q.width>innerWidth*0.8&&q.height>40&&q.height<110&&q.bottom>vh*0.6;});
      const bar=bars.sort((a,c)=>c.getBoundingClientRect().bottom-a.getBoundingClientRect().bottom)[0];
      return { navGap: bar?Math.round(vh-bar.getBoundingClientRect().bottom):null, scroll:Math.round(document.scrollingElement.scrollTop) };
    }).catch(()=>null):null;
    return {g,inner};
  };
  let worst=0, tops=new Set(), bad=[];
  const seq=[];
  for(let i=0;i<20;i++){
    await sleep(900);
    const {g,inner}=await measure();
    if(g){ worst=Math.max(worst,Math.abs(g.dTop),Math.abs(g.dBot),Math.abs(g.dLeft),Math.abs(g.dRight));
      tops.add(g.absTop);
      if(inner&&inner.navGap>2) bad.push(`s${i} navGap ${inner.navGap}`); }
    const more=await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Next"]'); if(!e||e.disabled) return false; e.click(); return true;});
    seq.push(i); if(!more) break;
  }
  for(let i=0;i<20;i++){
    const more=await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Previous"]'); if(!e||e.disabled) return false; e.click(); return true;});
    if(!more) break;
    await sleep(750);
    const {g,inner}=await measure();
    if(g){ worst=Math.max(worst,Math.abs(g.dTop),Math.abs(g.dBot),Math.abs(g.dLeft),Math.abs(g.dRight)); tops.add(g.absTop);
      if(inner&&inner.navGap>2) bad.push(`back navGap ${inner.navGap}`); }
  }
  console.log(label.padEnd(9),`states ${seq.length}  worst edge offset ${worst}px  distinct device tops ${[...tops].length}  ${bad.length?("ISSUES "+bad.slice(0,3)):"nav flush at every state ✓"}`);
  await p.close();
}
await b.close();
