// FIX 1: the blue ring must fit inside its clip edge at every phone width.
// FIX 2: no hard horizontal edge below the stand in the Conference state.
import puppeteer from "puppeteer-core";
import sharp from "sharp";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const B=process.argv[2]||"http://localhost:5197";
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
for(const W of [375,390,393,430]){
  const p=await b.newPage(); await p.setCacheEnabled(false);
  await p.setViewport({width:W,height:844,deviceScaleFactor:3,isMobile:true,hasTouch:true});
  await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
  await p.goto(B+"/",{waitUntil:"domcontentloaded",timeout:90000}); await sleep(6500);
  await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Explore the product"]'); if(e)e.click();});
  await sleep(900);
  for(let i=0;i<3;i++){ await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Next"]'); if(e&&!e.disabled)e.click();}); await sleep(1100); }
  const fr=p.frames().find(f=>/\/app\?/.test(f.url()));
  let r={none:true};
  for(let t=0;t<12;t++){
    await sleep(300);
    const got=fr? await fr.evaluate(()=>{
    const c=[...document.querySelectorAll("*")].find(e=>{const cs=getComputedStyle(e);
      return /flex-1/.test(e.className||"")&&/rounded/.test(e.className||"")
        && /rgba\(37, 99, 235/.test(cs.boxShadow||"") && e.getBoundingClientRect().width>150;});
    if(!c) return {none:true};
    const q=c.getBoundingClientRect();
    const sp=parseFloat((getComputedStyle(c).boxShadow.match(/0px (\d+(?:\.\d+)?)px$/)||[0,2])[1])||2;
    // the clipping ancestor
    let clip=null;
    for(let a=c.parentElement;a;a=a.parentElement){ const cs=getComputedStyle(a);
      if(cs.overflow!=="visible"){ clip=a.getBoundingClientRect(); break; } }
    return { card:`${Math.round(q.left)}→${Math.round(q.right)}`, ringRight:Math.round(q.right+sp),
             clipRight: clip?Math.round(clip.right):null,
             fits: clip? (q.right+sp)<=clip.right+0.5 : true };
    }).catch(()=>null) : null;
    if(got && !got.none){ r=got; break; }
  }
  console.log(`${W}px  ${JSON.stringify(r)}  ${r.fits?"RING FITS ✓":"CLIPPED ✗"}`);
  await p.close();
}
await b.close();
