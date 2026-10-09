// Investor copy vs the device, stepping with the ARROW controls (the page no longer
// scrolls, so the old scroll-driven probe measured nothing and reported a false pass).
import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const B=process.argv[2]||"http://localhost:5197";
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
for(const [W,H] of [[390,844],[390,740],[390,690],[393,852],[430,932]]){
  const p=await b.newPage(); await p.setCacheEnabled(false);
  await p.setViewport({width:W,height:H,deviceScaleFactor:2,isMobile:true,hasTouch:true});
  await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
  await p.goto(B+"/investor",{waitUntil:"domcontentloaded",timeout:90000}); await sleep(5000);
  let worst=-9999, txt="", at=0;
  for(let i=0;i<22;i++){
    const r=await p.evaluate(()=>{
      let dev=null;
      for(const el of document.querySelectorAll("div")){
        const bi=getComputedStyle(el).backgroundImage||"";
        if(bi.includes("pro-phone-79")&&!bi.includes("blur")){const rr=el.getBoundingClientRect();
          if(rr.height>200&&(!dev||rr.top<dev.top))dev=rr;}}
      if(!dev) return null;
      let col=null; for(const el of document.querySelectorAll("div[style*='opacity']")){
        const rr=el.getBoundingClientRect(); const cs=getComputedStyle(el);
        if(rr.top<=dev.top+2&&rr.bottom>=dev.bottom-2&&rr.width>=dev.width-4&&cs.opacity!=="1") col=+cs.opacity; }
      if(col!==null&&col<0.05) return {skip:true};
      let low=-9999,t="";
      for(const el of document.querySelectorAll("h1,h2,h3,p,li,span,a")){
        const s=(el.innerText||"").trim(); if(s.length<10||el.closest("nav,header")) continue;
        if(el.querySelector("h1,h2,h3,p,li,span,a")) continue;
        const cs=getComputedStyle(el); if(cs.opacity==="0"||cs.visibility==="hidden") continue;
        let fixed=false; for(let a=el;a&&a!==document.body;a=a.parentElement){ if(getComputedStyle(a).position==="fixed"){fixed=true;break;} }
        if(fixed) continue;
        const rr=el.getBoundingClientRect(); if(rr.height<6||rr.width<30) continue;
        if(rr.right<dev.left||rr.left>dev.right) continue;
        if(rr.bottom-dev.top>low){low=rr.bottom-dev.top;t=s.slice(0,40);}
      }
      return {over:Math.round(low),txt:t};
    });
    if(r&&!r.skip&&r.over>worst){worst=r.over;txt=r.txt;at=i;}
    const more=await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Next"]'); if(!e||e.disabled) return false; e.click(); return true;});
    await sleep(430);
    if(!more) break;
  }
  console.log(`${W}x${H}  ${worst>0?"OVERLAP "+worst+"px":"clear "+(-worst)+"px"}  beat ${at}  "${txt}"`);
  await p.close();
}
await b.close();
