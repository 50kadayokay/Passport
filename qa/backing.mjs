// Expose the screen backing (the layer visible whenever the embedded app is not painting)
// and report its colour. Black here = the black bar on a real device.
import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const B=process.argv[2]||"http://localhost:5197";
const OUT="/private/tmp/claude-501/-Users-leifer-Passport-V1/4d9fc2e9-c8af-4a55-9854-42380ee52983/scratchpad";
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
for(const [route,label] of [["/pro","pro"],["/","home"],["/investor","investor"]]){
  const p=await b.newPage(); await p.setCacheEnabled(false);
  await p.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
  await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
  await p.goto(B+route,{waitUntil:"domcontentloaded",timeout:90000}); await sleep(5200);
  await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Explore the product"]'); if(e)e.click();});
  await sleep(900);
  for(let k=0;k<9;k++){ await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Next"]'); if(e&&!e.disabled)e.click();}); await sleep(450); }
  await sleep(1200);
  // hide every product iframe → whatever is behind it is what a stalled frame shows
  const r=await p.evaluate(()=>{
    document.querySelectorAll("iframe").forEach(f=>{f.style.visibility="hidden";});
    let op=null;
    for(const el of document.querySelectorAll("div")){
      const s=getComputedStyle(el), q=el.getBoundingClientRect();
      if(q.height>200&&q.width>100&&/^rgb\(/.test(s.backgroundColor)&&s.position==="absolute"&&el.getAttribute("aria-hidden")==="true"){
        if(!op||q.top<op.top){op={top:q.top,bg:s.backgroundColor};}}}
    return op;
  });
  await sleep(500);
  const box=await p.evaluate(()=>{
    let dev=null;
    for(const el of document.querySelectorAll("div")){
      const bi=getComputedStyle(el).backgroundImage||"";
      if(bi.includes("pro-phone-79")&&!bi.includes("blur")){const q=el.getBoundingClientRect();
        if(q.height>200&&(!dev||q.top<dev.top))dev={x:q.left,y:q.top,w:q.width,h:q.height};}}
    return dev;
  });
  if(box){
    const clip={x:Math.round(box.x+box.w*0.2),y:Math.round(box.y+box.h*0.70),width:Math.round(box.w*0.6),height:Math.round(box.h*0.22)};
    await p.screenshot({path:`${OUT}/backing-${label}.png`,clip});
    const px=await p.evaluate((c)=>{return null;},clip);
  }
  console.log(label.padEnd(9),"screen backing colour:",r?r.bg:"not found");
  await p.close();
}
await b.close();
