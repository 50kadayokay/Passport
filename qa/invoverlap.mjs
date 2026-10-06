// Investor overlap, measured against the PHONE'S OWN rendered box (a CSS background-image
// div, not an <img> — the selector my first probe used matched nothing and read "no overlap").
import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const BASE=process.argv[2]||"https://mineex.ca";
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
for(const [W,H] of [[390,844],[390,740],[390,690],[393,852],[430,932]]){
  const p=await b.newPage();
  await p.setViewport({width:W,height:H,deviceScaleFactor:2,isMobile:true,hasTouch:true});
  await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
  await p.goto(BASE+"/investor",{waitUntil:"networkidle2",timeout:60000}); await sleep(4000);
  const PH=await p.evaluate(()=>document.body.scrollHeight);
  let worst=-9999, worstAt="", worstTxt="";
  for(let i=0;i<=28;i++){
    await p.evaluate(y=>window.scrollTo(0,y),Math.round(PH*(i/28))); await sleep(430);
    const r=await p.evaluate(()=>{
      // the phone: the div whose background-image is the hardware photo
      let dev=null;
      for(const el of document.querySelectorAll("div")){
        const bi=getComputedStyle(el).backgroundImage||"";
        if(bi.includes("pro-phone-79")&&!bi.includes("blur")){ const rr=el.getBoundingClientRect();
          if(rr.height>200&&(!dev||rr.top<dev.top)) dev=rr; }
      }
      if(!dev) return null;
      // opacity of the whole device column (0 on the endpoint beats)
      let op=1; let n=document.elementFromPoint(dev.left+dev.width/2,Math.max(1,dev.top+5));
      for(const el of document.querySelectorAll("div[style*='opacity']")){
        const cs=getComputedStyle(el); const rr=el.getBoundingClientRect();
        if(rr.top<=dev.top+2&&rr.bottom>=dev.bottom-2&&rr.width>=dev.width-4&&cs.opacity!=="1"){ op=+cs.opacity; }
      }
      let low=-9999, txt="";
      for(const el of document.querySelectorAll("h1,h2,h3,p,li,span,a")){
        const t=(el.innerText||"").trim(); if(t.length<10) continue;
        if(el.querySelector("h1,h2,h3,p,li,span,a")) continue;   // leaf text only
        const cs=getComputedStyle(el); if(cs.opacity==="0"||cs.visibility==="hidden") continue;
        // skip page chrome: the nav's "Get the App" sits over the device by design
        if(el.closest("nav,header")) continue;
        let fixed=false; for(let a=el;a&&a!==document.body;a=a.parentElement){
          if(getComputedStyle(a).position==="fixed"){ fixed=true; break; } }
        if(fixed) continue;
        const rr=el.getBoundingClientRect(); if(rr.height<6||rr.width<30) continue;
        if(rr.bottom<0||rr.top>innerHeight) continue;
        const horiz=!(rr.right<dev.left||rr.left>dev.right);
        if(!horiz) continue;
        const over=rr.bottom-dev.top;     // >0 means text reaches into the device box
        if(over>low){ low=over; txt=t.slice(0,40); }
      }
      return { over:Math.round(low), txt, op:+op.toFixed(2), devTop:Math.round(dev.top) };
    });
    if(!r) continue;
    if(r.op>0.05 && r.over>worst){ worst=r.over; worstAt=`y=${Math.round(PH*(i/28))}`; worstTxt=r.txt; }
  }
  console.log(`${W}x${H}  worst text-into-device: ${worst>0?"OVERLAP "+worst+"px":"clear "+(-worst)+"px"}  ${worstAt}  "${worstTxt}"`);
  await p.close();
}
await b.close();
