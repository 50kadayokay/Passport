import puppeteer from "puppeteer-core";
const BASE=process.argv[2]||"https://mineex.ca";
const sleep=m=>new Promise(r=>setTimeout(r,m));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
for (const [w,h] of [[1440,900],[1240,820],[1512,860]]) {
  const p=await b.newPage(); await p.setViewport({width:w,height:h});
  await p.goto(BASE+"/pro",{waitUntil:'networkidle2',timeout:90000});
  await sleep(5000);
  const ch=()=>p.evaluate(()=>(document.body.innerText.match(/\d\d\s*\/\s*\d\d/)||[])[0]||'?');
  const start=await ch();
  await p.mouse.move(Math.round(w/2),Math.round(h/2));
  // TRACKPAD: many small deltas in quick succession, the way a two-finger swipe arrives
  for(let burst=0;burst<4;burst++){
    for(let i=0;i<25;i++){ await p.mouse.wheel({deltaY:12}); await sleep(16); }
    await sleep(500);
  }
  const after=await ch();
  console.log(`${w}x${h}  trackpad-style: ${start} -> ${after}  ${start===after?'*** FROZEN ***':'advances'}`);
  await p.close();
}
await b.close();
