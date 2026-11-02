import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const p=await b.newPage();
await p.setViewport({width:390,height:740,deviceScaleFactor:2,isMobile:true,hasTouch:true});
await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
await p.goto("http://localhost:5197/investor",{waitUntil:"networkidle2"}); await sleep(4000);
const H=await p.evaluate(()=>document.body.scrollHeight);
const hs=[];
for(let i=0;i<20;i++){
  await p.evaluate(v=>window.scrollTo(0,v), Math.round(H*i/20)); await sleep(500);
  const h=await p.evaluate(()=>{const n=document.querySelector(".mx-invstage .mx-label"); if(!n) return null;
    const box=n.parentElement; return Math.round(box.getBoundingClientRect().height);});
  if(h) hs.push(h);
}
console.log("copy block heights across beats:", hs.join(", "));
console.log("max:", Math.max(...hs), "| median:", hs.sort((a,b)=>a-b)[Math.floor(hs.length/2)]);
await b.close();
