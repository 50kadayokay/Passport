// Where does the app's own status bar and bottom nav land relative to the screen opening?
import puppeteer from "puppeteer-core";
import sharp from "sharp";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const B=process.argv[2]||"http://localhost:5197", ROUTE=process.argv[3]||"/pro";
const OUT="/private/tmp/claude-501/-Users-leifer-Passport-V1/4d9fc2e9-c8af-4a55-9854-42380ee52983/scratchpad";
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const p=await b.newPage(); await p.setCacheEnabled(false);
await p.setViewport({width:390,height:844,deviceScaleFactor:3,isMobile:true,hasTouch:true});
await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
await p.goto(B+ROUTE,{waitUntil:"domcontentloaded",timeout:90000}); await sleep(6000);
const geom=await p.evaluate(()=>{
  const f=[...document.querySelectorAll("iframe")].find(x=>{const q=x.getBoundingClientRect(); return q.height>200&&q.width>100;});
  const a=f.parentElement.getBoundingClientRect();           // app layer (scaled)
  let op=null;
  for(const el of document.querySelectorAll("div")){
    const s=getComputedStyle(el), q=el.getBoundingClientRect();
    if(q.height>200&&el.getAttribute("aria-hidden")==="true"&&s.backgroundColor==="rgb(244, 245, 247)"){op=q;break;}}
  const cs=getComputedStyle(f);
  return { app:{top:a.top,bottom:a.bottom,h:a.height,left:a.left,w:a.width},
           opening:op?{top:op.top,bottom:op.bottom,h:op.height,left:op.left,w:op.width}:null,
           iframeAttr:{w:f.getAttribute("width"),h:f.getAttribute("height")}, transform:cs.transform };
});
console.log("GEOMETRY", JSON.stringify(geom,null,1));
// inside the app: where is its status bar / top chrome?
const fr=p.frames().find(f=>/\/app\?/.test(f.url()));
if(fr){
  console.log("INSIDE APP", JSON.stringify(await fr.evaluate(()=>{
    const vh=innerHeight, vw=innerWidth;
    const txt=[...document.querySelectorAll("*")].find(e=>(e.textContent||"").trim()==="9:41");
    const r=txt?txt.getBoundingClientRect():null;
    return { innerW:vw, innerH:vh, statusBarTop: r?Math.round(r.top):null, statusBarH: r?Math.round(r.height):null,
             docH:Math.round(document.documentElement.scrollHeight) };
  }),null,1));
}
// zoom the top of the phone
const box=await p.evaluate(()=>{let d=null;for(const el of document.querySelectorAll("div")){
  const bi=getComputedStyle(el).backgroundImage||"";
  if(bi.includes("pro-phone-79")&&!bi.includes("blur")){const q=el.getBoundingClientRect();
    if(q.height>200&&(!d||q.top<d.top))d={x:q.left,y:q.top,w:q.width,h:q.height};}}return d;});
await p.screenshot({path:`${OUT}/phonetop.png`,clip:{x:Math.round(box.x),y:Math.round(box.y),width:Math.round(box.w),height:Math.round(box.h*0.22)}});
await b.close();
