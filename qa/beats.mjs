import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
for(const [route,name] of [["/","home"],["/pro","pro"],["/investor","investor"]]){
  const p=await b.newPage();
  await p.setViewport({width:390,height:740,deviceScaleFactor:2,isMobile:true,hasTouch:true});
  await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
  await p.goto("http://localhost:5197"+route,{waitUntil:"networkidle2",timeout:60000}); await sleep(5500);
  const seen=new Set(); const H=await p.evaluate(()=>document.body.scrollHeight);
  for(let y=0;y<H;y+=Math.max(240,Math.round(H/45))){
    await p.evaluate(v=>window.scrollTo(0,v),y); await sleep(260);
    const t=await p.evaluate(()=>{const l=document.querySelector(".mx-label"); return l?l.innerText.replace(/\s+/g," ").trim():null;});
    if(t) seen.add(t);
  }
  console.log(name.padEnd(10),"pageH",String(H).padStart(6),"| distinct beats seen:",seen.size);
  if(seen.size<=3) console.log("   ",[...seen].slice(0,4));
  await p.close();
}
await b.close();
