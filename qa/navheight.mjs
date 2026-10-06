// Measure the app's visible screen box on each desktop surface.
import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
for(const [route,name,wheels] of [["/","home",3],["/pro","pro",1],["/investor","investor",1]]){
  const p=await b.newPage();
  await p.setViewport({width:1680,height:1050});
  await p.goto("http://localhost:5197"+route,{waitUntil:"networkidle2",timeout:60000});
  await sleep(5000);
  for(let i=0;i<wheels;i++){ await p.mouse.move(840,520); for(let k=0;k<6;k++){await p.mouse.wheel({deltaY:120}); await sleep(30);} await sleep(1400); }
  await sleep(2000);
  const m=await p.evaluate(()=>{
    const f=document.querySelector("iframe");
    if(!f) return null;
    const r=f.getBoundingClientRect();
    const img=[...document.querySelectorAll("img")].find(i=>i.src.includes("pro-phone-79"));
    const ir=img?img.getBoundingClientRect():null;
    return { iframe:{w:Math.round(r.width),h:Math.round(r.height),top:Math.round(r.top),left:Math.round(r.left)},
             photo: ir?{w:Math.round(ir.width),h:Math.round(ir.height),top:Math.round(ir.top)}:null,
             transform:getComputedStyle(f).transform.slice(0,46) };
  });
  console.log(name.padEnd(10), JSON.stringify(m));
  await p.close();
}
await b.close();
