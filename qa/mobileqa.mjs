import puppeteer from "puppeteer-core";
const base=(p)=>(/\.html($|\?)/.test(p)?"http://localhost:5198":"http://localhost:5197")+p;
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const ROUTES=[["home","/"],["pro","/pro"],["investor","/investor"],["conference","/conference-mode"],
["gallery","/conference-mode"],["pricing","/pricing"],["compare","/compare"],["contact","/contact"],
["getstarted","/get-started"],["getapp","/get-the-app"],["android","/android"],
["privacy","/privacy.html"],["terms","/terms.html"],["support","/support.html"],
["template","/site?conftemplate=1&t=keynote&c=vilcanota-demo"]];
const SIZES=[[390,844,"iPhone 12/13/14"],[393,852,"iPhone 15/16"],[430,932,"iPhone 15/16 Pro Max"]];
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
for(const [W,H,name] of SIZES){
  console.log(`\n=== ${W}x${H}  (${name}) ===`);
  console.log("route        pageH   overflowX  text   errs  tinyTxt  tapSmall");
  for(const [r,path] of ROUTES){
    const p=await b.newPage();
    await p.setViewport({width:W,height:H,deviceScaleFactor:2,isMobile:true,hasTouch:true});
    await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
    await p.setCacheEnabled(false);
    let errs=0; p.on("pageerror",()=>errs++); p.on("console",m=>{if(m.type()==="error")errs++;});
    try{await p.goto(base(path),{waitUntil:"networkidle2",timeout:45000});}catch{}
    await sleep(5200);
    await p.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=600){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,120));}window.scrollTo(0,0);});
    await sleep(1400);
    const m=await p.evaluate(()=>{
      const vw=window.innerWidth;
      const tiny=[...document.querySelectorAll("p,span,li,a,div")].filter(e=>e.children.length===0&&(e.textContent||"").trim().length>10&&parseFloat(getComputedStyle(e).fontSize)<14).length;
      const taps=[...document.querySelectorAll("button,a,input,select,textarea")].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&(r.height<40||r.width<40);}).length;
      return {h:document.body.scrollHeight,over:document.documentElement.scrollWidth>vw+1,
        text:document.body.innerText.replace(/\s+/g," ").trim().length,tiny,taps};
    });
    console.log(r.padEnd(12),String(m.h).padEnd(7),String(m.over).padEnd(10),String(m.text).padEnd(6),String(errs).padEnd(5),String(m.tiny).padEnd(8),m.taps);
    await p.close();
  }
}
await b.close();
