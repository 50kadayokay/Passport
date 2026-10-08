// Measure the RENDERED CONTENT inside the iframe relative to the screen opening, at every
// state. Outer iframe geometry is deliberately ignored here — it has been stable all along.
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
const inside=async()=>{
  const fr=p.frames().find(f=>/\/app(demo)?\b|\/app\?/.test(f.url()));
  if(!fr) return null;
  return fr.evaluate(()=>{
    const r=(e)=>{ if(!e) return null; const q=e.getBoundingClientRect();
      return {t:+q.top.toFixed(1), b:+q.bottom.toFixed(1), h:+q.height.toFixed(1)}; };
    const root=document.getElementById("root")||document.body.firstElementChild;
    const status=[...document.querySelectorAll("*")].find(e=>(e.textContent||"").trim()==="9:41");
    const bars=[...document.querySelectorAll("nav,div")].filter(e=>{const s=getComputedStyle(e),q=e.getBoundingClientRect();
      return (s.position==="fixed"||s.position==="absolute")&&q.width>innerWidth*0.8&&q.height>40&&q.height<110&&q.bottom>innerHeight*0.6;});
    const nav=bars.sort((a,c)=>c.getBoundingClientRect().bottom-a.getBoundingClientRect().bottom)[0];
    const cs=(e)=>e?getComputedStyle(e):null;
    const tf=(e)=>{const c=cs(e); return c&&c.transform!=="none"?c.transform:"none";};
    return {
      docScroll:Math.round(document.scrollingElement.scrollTop),
      bodyTf:tf(document.body), htmlTf:tf(document.documentElement), rootTf:tf(root),
      bodyTop:+document.body.getBoundingClientRect().top.toFixed(1),
      rootRect:r(root), statusRect:r(status), navRect:r(nav),
      innerH:innerHeight, bodyH:Math.round(document.body.scrollHeight),
      rootPos: root?cs(root).position:null, rootOv: root?cs(root).overflow:null,
      page: (document.querySelector("[data-page]")||{}).dataset?.page || null,
    };
  }).catch(()=>null);
};
let base=null;
console.log("st | page        | docScr bodyTop rootT statusT navB/innerH | bodyTf rootTf | DRIFT");
for(let i=0;i<22;i++){
  await sleep(1200);
  const v=await inside();
  if(v){
    if(!base) base={rootT:v.rootRect&&v.rootRect.t, statusT:v.statusRect&&v.statusRect.t, navB:v.navRect&&v.navRect.b};
    const d=[];
    if(v.rootRect&&base.rootT!=null&&Math.abs(v.rootRect.t-base.rootT)>0.5) d.push(`root ${base.rootT}->${v.rootRect.t}`);
    if(v.statusRect&&base.statusT!=null&&Math.abs(v.statusRect.t-base.statusT)>0.5) d.push(`status ${base.statusT}->${v.statusRect.t}`);
    if(v.navRect&&base.navB!=null&&Math.abs(v.navRect.b-base.navB)>0.5) d.push(`nav ${base.navB}->${v.navRect.b}`);
    console.log(`${String(i).padStart(2)} | ${String(v.page).padEnd(11)} | ${String(v.docScroll).padStart(6)} ${String(v.bodyTop).padStart(7)} ${String(v.rootRect?v.rootRect.t:"-").padStart(5)} ${String(v.statusRect?v.statusRect.t:"-").padStart(7)} ${String(v.navRect?v.navRect.b:"-").padStart(5)}/${v.innerH} | ${v.bodyTf.slice(0,16)} ${v.rootTf.slice(0,16)} | ${d.length?"<<< "+d.join(" ; "):""}`);
  }
  const more=await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Next"]'); if(!e||e.disabled) return false; e.click(); return true;});
  if(!more) break;
}
await b.close();
