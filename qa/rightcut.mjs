// Inside the embedded app: is anything wider than the viewport (cut off on the right)?
import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const B=process.argv[2]||"http://localhost:5197", ROUTE=process.argv[3]||"/";
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const p=await b.newPage(); await p.setCacheEnabled(false);
await p.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
await p.goto(B+ROUTE,{waitUntil:"domcontentloaded",timeout:90000}); await sleep(6000);
await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Explore the product"]'); if(e)e.click();});
await sleep(900);
for(let i=0;i<12;i++){
  await sleep(900);
  const fr=p.frames().find(f=>/\/app(demo)?\b|\/app\?/.test(f.url()));
  if(fr){
    const r=await fr.evaluate(()=>{
      const W=innerWidth; const over=[];
      document.querySelectorAll("*").forEach(el=>{
        const q=el.getBoundingClientRect();
        if(q.width<40||q.height<10) return;
        if(q.right>W+1 && q.top<innerHeight && q.bottom>0){
          const t=(el.innerText||"").trim().slice(0,34);
          over.push({el:el.tagName.toLowerCase()+(el.className&&typeof el.className==="string"?"."+el.className.split(" ").filter(Boolean)[0]:""),
            right:Math.round(q.right), over:Math.round(q.right-W), txt:t});
        }});
      return { W, docW:Math.round(document.documentElement.scrollWidth), worst:over.sort((a,c)=>c.over-a.over).slice(0,3) };
    }).catch(()=>null);
    if(r && r.worst.length) console.log(`state ${i}: viewport ${r.W} docW ${r.docW}  OVERFLOW:`, JSON.stringify(r.worst));
  }
  const more=await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Next"]'); if(!e||e.disabled) return false; e.click(); return true;});
  if(!more) break;
}
console.log("done");
await b.close();
