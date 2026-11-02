import puppeteer from "puppeteer-core";
import sharp from "sharp";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
for(const [route,name,wheels] of [["/","home",3],["/pro","pro",1],["/investor","investor",1]]){
  const p=await b.newPage();
  await p.setViewport({width:1680,height:1050,deviceScaleFactor:2});
  await p.goto("http://localhost:5197"+route,{waitUntil:"networkidle2",timeout:60000});
  await sleep(5000);
  for(let i=0;i<wheels;i++){ await p.mouse.move(840,520); for(let k=0;k<6;k++){await p.mouse.wheel({deltaY:120}); await sleep(30);} await sleep(1400); }
  await sleep(2500);
  const box=await p.evaluate(()=>{const f=document.querySelector("iframe"); const r=f.getBoundingClientRect();
    return {x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width*0.92),h:Math.round(r.height*0.92)};});
  await p.screenshot({path:`/tmp/nav-${name}-full.png`});
  // crop the bottom third of the device
  await sharp(`/tmp/nav-${name}-full.png`)
    .extract({left:box.x*2, top:(box.y+Math.round(box.h*0.72))*2, width:box.w*2, height:Math.round(box.h*0.30)*2})
    .toFile(`/tmp/nav-${name}.png`);
  console.log(name,"cropped at",JSON.stringify(box));
  await p.close();
}
await b.close();
