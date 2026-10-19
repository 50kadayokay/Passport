import { webkit } from "playwright-core";
const sleep=m=>new Promise(r=>setTimeout(r,m));
const b=await webkit.launch();
const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
await p.goto(process.argv[2]+"/pro",{waitUntil:'load',timeout:90000});
await sleep(7000);
const box=await p.evaluate(()=>{const f=document.querySelector('iframe');const r=f.getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};});
await p.mouse.move(box.x,box.y);
const st=()=>p.evaluate(()=>{try{const s=window.__demoState();return{cur:s.cur,anim:s.animating};}catch(e){return null;}});
const glide=async d=>{for(let i=0;i<30;i++){await p.mouse.wheel(0,d*8);await sleep(16);}await sleep(850);};
for(let i=0;i<10;i++) await glide(1);
console.log('at top:', JSON.stringify(await st()));
for(let i=0;i<10;i++){
  const before=await st();
  // sample animating DURING the glide
  await p.evaluate(()=>{window.__anim=[];const t=setInterval(()=>{try{window.__anim.push(window.__demoState().animating);}catch(e){}},40);setTimeout(()=>clearInterval(t),1400);});
  await glide(-1);
  const after=await st();
  const anim=await p.evaluate(()=>window.__anim.filter(Boolean).length);
  console.log(`  back ${i+1}: ${before.cur} -> ${after.cur} ${after.cur===before.cur?'*** STALL ***':''}  animSamplesDuringGlide=${anim}`);
}
await b.close();
