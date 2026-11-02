import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
for(const [u,name] of [["/app?c=kingsmen-resources&embed=1","app (home/pro)"],["/appdemo?embed=1","appdemo (investor)"]]){
  const p=await b.newPage();
  await p.setViewport({width:393,height:852,deviceScaleFactor:2});
  await p.goto("http://localhost:5197"+u,{waitUntil:"networkidle2",timeout:60000});
  await sleep(6000);
  const m=await p.evaluate(()=>{
    // the bottom nav: the lowest element row containing several svg icons
    const cands=[...document.querySelectorAll("div,nav,footer")].filter(e=>{
      const r=e.getBoundingClientRect();
      return r.height>40 && r.height<140 && r.width>innerWidth*0.8 && r.bottom>innerHeight-180 && e.querySelectorAll("svg").length>=4;
    }).sort((a,c)=>c.getBoundingClientRect().top-a.getBoundingClientRect().top);
    const n=cands[0]; if(!n) return {found:false};
    const r=n.getBoundingClientRect();
    const cs=getComputedStyle(n);
    return {found:true, navTop:Math.round(r.top), navH:Math.round(r.height), navBottom:Math.round(r.bottom),
      gapBelow: Math.round(innerHeight-r.bottom), padBottom:cs.paddingBottom, viewportH:innerHeight};
  });
  console.log(name.padEnd(20), JSON.stringify(m));
  await p.close();
}
await b.close();
