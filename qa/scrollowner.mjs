// Who inside the simulated phone accepts vertical scroll, and what happens at each state?
import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const B=process.argv[2]||"http://localhost:5197", ROUTE=process.argv[3]||"/pro";
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const p=await b.newPage(); await p.setCacheEnabled(false);
await p.setViewport({width:390,height:844,deviceScaleFactor:3,isMobile:true,hasTouch:true});
await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
await p.goto(B+ROUTE,{waitUntil:"domcontentloaded",timeout:90000}); await sleep(6000);
await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Explore the product"]'); if(e)e.click();});
await sleep(1000);
const probe=async()=>{
  const fr=p.frames().find(f=>/\/app\?/.test(f.url()));
  if(!fr) return null;
  return fr.evaluate(()=>{
    const sel=(e)=>e===document.documentElement?"<html>":e===document.body?"<body>":
      e.tagName.toLowerCase()+(e.id?"#"+e.id:"")+(e.className&&typeof e.className==="string"?"."+e.className.split(" ").filter(Boolean).slice(0,2).join("."):"");
    const scrollers=[];
    const all=[document.documentElement,document.body,...document.querySelectorAll("*")];
    for(const e of all){
      const sh=e.scrollHeight, ch=e.clientHeight;
      if(sh-ch>4){
        const cs=getComputedStyle(e);
        scrollers.push({el:sel(e), top:Math.round(e.scrollTop), range:sh-ch,
          oy:cs.overflowY, ta:cs.touchAction, ob:cs.overscrollBehaviorY});
      }
    }
    const nonzero=scrollers.filter(s=>s.top!==0);
    const root=document.getElementById("root")||document.body.firstElementChild;
    const status=[...document.querySelectorAll("*")].find(e=>(e.textContent||"").trim()==="9:41");
    const bars=[...document.querySelectorAll("nav,div")].filter(e=>{const s=getComputedStyle(e),q=e.getBoundingClientRect();
      return (s.position==="fixed"||s.position==="absolute")&&q.width>innerWidth*0.8&&q.height>40&&q.height<110&&q.bottom>innerHeight*0.6;});
    const nav=bars.sort((a,c)=>c.getBoundingClientRect().bottom-a.getBoundingClientRect().bottom)[0];
    return { winY:Math.round(scrollY), docTop:Math.round(document.scrollingElement.scrollTop),
             bodyTop:Math.round(document.body.scrollTop),
             rootTop: root?Math.round(root.getBoundingClientRect().top):null,
             statusTop: status?Math.round(status.getBoundingClientRect().top):null,
             navBottom: nav?Math.round(nav.getBoundingClientRect().bottom):null, innerH:innerHeight,
             scrollerCount:scrollers.length, nonzero:nonzero.slice(0,4), sample:scrollers.slice(0,3) };
  }).catch(()=>null);
};
console.log("state | winY docTop rootTop statusTop navBottom/innerH | scrollers | NONZERO");
for(let i=0;i<20;i++){
  await sleep(1100);
  const r=await probe();
  if(r){
    const flag = (r.nonzero.length?"  <<< "+r.nonzero.map(n=>`${n.el}=${n.top}`).join(", "):"");
    console.log(`${String(i).padStart(2)} | ${r.winY} ${r.docTop} ${r.rootTop} ${r.statusTop} ${r.navBottom}/${r.innerH} | ${r.scrollerCount}${flag}`);
  }
  const more=await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Next"]'); if(!e||e.disabled) return false; e.click(); return true;});
  if(!more) break;
}
console.log("\n--- scrollable elements present (first 3) ---");
const r=await probe(); console.log(JSON.stringify(r&&r.sample,null,1));
await b.close();
