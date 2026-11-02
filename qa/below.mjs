import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
for(const [u,name] of [["/app?c=kingsmen-resources&embed=1","app"],["/appdemo?embed=1","appdemo"]]){
  const p=await b.newPage();
  await p.setViewport({width:393,height:852,deviceScaleFactor:2});
  await p.goto("http://localhost:5197"+u,{waitUntil:"networkidle2"}); await sleep(6000);
  const m=await p.evaluate(()=>{
    const navs=[...document.querySelectorAll("div,nav,footer")].filter(e=>{
      const r=e.getBoundingClientRect();
      return r.height>40&&r.height<140&&r.width>innerWidth*0.8&&r.bottom>innerHeight-180&&e.querySelectorAll("svg").length>=4;
    }).sort((a,c)=>c.getBoundingClientRect().top-a.getBoundingClientRect().top);
    const n=navs[0]; const r=n.getBoundingClientRect();
    const par=n.parentElement, pr=par.getBoundingClientRect(), pcs=getComputedStyle(par);
    // anything painted below the nav?
    const below=[...document.querySelectorAll("*")].filter(e=>{
      const b2=e.getBoundingClientRect();
      return b2.top>=r.bottom-1 && b2.height>2 && b2.width>40;
    }).slice(0,4).map(e=>e.tagName+"."+(typeof e.className==="string"?e.className.split(" ")[0]:"")+" h="+Math.round(e.getBoundingClientRect().height));
    return {navBottom:Math.round(r.bottom), vh:innerHeight,
      parent:{bottom:Math.round(pr.bottom), h:Math.round(pr.height), padB:pcs.paddingBottom, pos:pcs.position},
      below};
  });
  console.log(name.padEnd(9), JSON.stringify(m));
  await p.close();
}
await b.close();
