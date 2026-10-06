// Decoded-image memory: width*height*4 bytes per image actually loaded. This never shows
// up in performance.memory, but it is what kills a tab on iOS.
import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const p=await b.newPage();
await p.setViewport({width:390,height:740,deviceScaleFactor:2,isMobile:true,hasTouch:true});
await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
const seen=new Map();
p.on("response",async r=>{ if(r.request().resourceType()==="image"){ try{ const b2=await r.buffer(); seen.set(r.url(),b2.length);}catch(_){} } });
await p.goto("http://localhost:5197/",{waitUntil:"networkidle2",timeout:60000}); await sleep(4000);
const H=await p.evaluate(()=>document.body.scrollHeight);
for(let y=0;y<H;y+=500){ await p.evaluate(v=>window.scrollTo(0,v),y); await sleep(130); }
await sleep(2500);
// decoded size of every image the page has, incl. CSS backgrounds
const dec=await p.evaluate(async()=>{
  const urls=new Set();
  document.querySelectorAll("img").forEach(i=>{ if(i.currentSrc) urls.add(i.currentSrc); });
  document.querySelectorAll("*").forEach(e=>{ const bg=getComputedStyle(e).backgroundImage;
    if(bg&&bg!=="none"){ const m=bg.match(/url\(["']?(.*?)["']?\)/); if(m&&m[1]&&!m[1].startsWith("data:")) urls.add(new URL(m[1],location.href).href); } });
  const out=[];
  for(const u of urls){ await new Promise(res=>{ const im=new Image(); im.onload=()=>{out.push({u,w:im.naturalWidth,h:im.naturalHeight}); res();}; im.onerror=()=>res(); im.src=u; }); }
  return out;
});
let total=0; const rows=[];
for(const d of dec){ const mb=(d.w*d.h*4)/1048576; total+=mb; rows.push([mb,d.w+"x"+d.h,d.u.split("/").pop().slice(0,36)]); }
rows.sort((a,c)=>c[0]-a[0]);
console.log("images on page:",dec.length);
console.log("DECODED BITMAP TOTAL: ~"+total.toFixed(0)+" MB");
console.log("\nlargest:");
for(const r of rows.slice(0,12)) console.log("   "+r[0].toFixed(1).padStart(6)+" MB  "+r[1].padEnd(11)+r[2]);
await b.close();
