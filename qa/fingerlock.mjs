// Can a finger on the simulated screen move ANY scroller inside the app?
import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const B=process.argv[2]||"http://localhost:5197";
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
for(const [route,label] of [["/pro","pro"],["/","home"],["/investor","investor"]]){
  const p=await b.newPage(); await p.setCacheEnabled(false);
  await p.setViewport({width:390,height:844,deviceScaleFactor:3,isMobile:true,hasTouch:true});
  await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
  await p.goto(B+route,{waitUntil:"domcontentloaded",timeout:90000}); await sleep(6000);
  await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Explore the product"]'); if(e)e.click();});
  await sleep(900);
  for(let k=0;k<7;k++){ await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Next"]'); if(e&&!e.disabled)e.click();}); await sleep(600); }
  await sleep(1500);
  const snap=async()=>{
    const fr=p.frames().find(f=>/\/app(demo)?\b|\/app\?/.test(f.url()));
    if(!fr) return null;
    return fr.evaluate(()=>{
      const o={win:Math.round(scrollY),doc:Math.round(document.scrollingElement.scrollTop),tops:[]};
      [document.documentElement,document.body,...document.querySelectorAll("*")].forEach(e=>{
        if(e.scrollHeight-e.clientHeight>4) o.tops.push(Math.round(e.scrollTop));});
      const st=[...document.querySelectorAll("*")].find(e=>(e.textContent||"").trim()==="9:41");
      o.status = st?Math.round(st.getBoundingClientRect().top):null;
      return o;
    }).catch(()=>null);
  };
  const before=await snap();
  // finger inside the phone screen, hard drags both ways, repeated
  const box=await p.evaluate(()=>{const f=[...document.querySelectorAll("iframe")].find(x=>{const q=x.getBoundingClientRect();return q.height>200;});
    const q=f.getBoundingClientRect(); return {cx:Math.round(q.left+q.width/2), top:Math.round(q.top), bot:Math.round(q.bottom)};});
  for(let k=0;k<8;k++){
    await p.touchscreen.touchStart(box.cx, box.bot-40);
    for(let y=box.bot-40;y>=box.top+40;y-=40) await p.touchscreen.touchMove(box.cx,y);
    await p.touchscreen.touchEnd();
    await p.touchscreen.touchStart(box.cx, box.top+40);
    for(let y=box.top+40;y<=box.bot-40;y+=40) await p.touchscreen.touchMove(box.cx,y);
    await p.touchscreen.touchEnd();
  }
  await sleep(1200);
  const after=await snap();
  if(!before||!after){ console.log(label.padEnd(9),"no app frame to measure"); await p.close(); continue; }
  const same = JSON.stringify(before)===JSON.stringify(after);
  const moved = before.tops.map((v,i)=>Math.abs(v-(after.tops[i]??v))).filter(d=>d>0);
  console.log(label.padEnd(9), same?"LOCKED ✓  nothing moved":`MOVED ✗ deltas ${moved.slice(0,5)} win ${before.win}->${after.win} status ${before.status}->${after.status}`);
  await p.close();
}
await b.close();
