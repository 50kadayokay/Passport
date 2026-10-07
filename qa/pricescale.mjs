// Does the pricing content rescale while you scroll? (Fit re-measuring = cards shrink.)
import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const p=await b.newPage(); await p.setCacheEnabled(false);
await p.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
await p.goto((process.argv[2]||"http://localhost:5197")+"/pricing",{waitUntil:"networkidle2",timeout:90000}); await sleep(4000);
const H=await p.evaluate(()=>document.body.scrollHeight);
const widths=[];
for(let i=0;i<=8;i++){
  await p.evaluate(y=>scrollTo(0,y),Math.round(H*(i/8))); await sleep(700);
  widths.push(await p.evaluate(()=>{
    let w=0,t="none";
    for(const el of document.querySelectorAll("div")){
      const tr=getComputedStyle(el).transform;
      if(tr&&tr!=="none"&&tr.startsWith("matrix")) { const m=tr.match(/matrix\(([-\d.]+)/); if(m&&+m[1]!==1){t=(+m[1]).toFixed(3);} }
    }
    const card=[...document.querySelectorAll("*")].find(e=>(e.innerText||"").trim().startsWith("Pro")&&e.getBoundingClientRect().width>120);
    w=card?Math.round(card.getBoundingClientRect().width):0;
    return {scale:t, cardW:w};
  }));
}
console.log(JSON.stringify(widths));
const scales=[...new Set(widths.map(w=>w.scale))];
console.log("distinct scales seen:", scales.join(" | "), scales.length===1?"→ STABLE":"→ RESCALING WHILE SCROLLING");
await b.close();
