// Does the walkthrough's copy AND device fit inside the viewport at real Safari heights?
import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
for(const [W,H] of [[390,844],[390,740],[390,690],[393,748],[430,800]]){
 for(const [route,name] of [["/","home"],["/pro","pro"],["/investor","investor"]]){
  const p=await b.newPage();
  await p.setViewport({width:W,height:H,deviceScaleFactor:2,isMobile:true,hasTouch:true});
  await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
  await p.goto("http://localhost:5197"+route,{waitUntil:"networkidle2",timeout:60000}); await sleep(5000);
  let worst=null;
  for(const f of [0.18,0.30,0.42,0.54]){
    await p.evaluate(x=>window.scrollTo(0,document.body.scrollHeight*x),f); await sleep(700);
    const m=await p.evaluate(()=>{
      const lab=document.querySelector(".mx-label"); if(!lab) return null;
      const stage=lab.closest("div[style*='sticky']")||lab.closest("section")||document.body;
      const sr=stage.getBoundingClientRect();
      const body=lab.parentElement.querySelector("p.mx-lead");
      const dev=document.querySelector(".mx-demo");
      const lowCopy=body?body.getBoundingClientRect().bottom:0;
      const lowDev=dev?dev.getBoundingClientRect().bottom:0;
      return { over: Math.round(Math.max(lowCopy,lowDev)-Math.min(sr.bottom,innerHeight)),
               devW: dev?Math.round(dev.getBoundingClientRect().width):0 };
    });
    if(m && (worst===null||m.over>worst.over)) worst=m;
  }
  const bad=worst&&worst.over>2;
  console.log(`${W}x${H} ${name.padEnd(9)} ${bad?"❌ overflows by "+worst.over+"px":"✅ fits"}`);
  await p.close();
 }
}
await b.close();
