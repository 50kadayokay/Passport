import { webkit } from "playwright-core";
const sleep=m=>new Promise(r=>setTimeout(r,m));
const BASE=process.argv[2];
const b=await webkit.launch();
const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
await p.goto(BASE+"/pro",{waitUntil:'load',timeout:90000});
await sleep(7000);
// watch every wheel the page receives and what the demo state is doing
await p.evaluate(()=>{
  window.__w=[];
  addEventListener('wheel', e => { let s=null; try{s=window.__demoState&&window.__demoState();}catch(_){}
    window.__w.push({dy:Math.round(e.deltaY), cur:s?s.cur:null, anim:s?s.animating:null, dp:e.defaultPrevented}); }, {capture:true});
});
await p.mouse.move(720,450);
const st=()=>p.evaluate(()=>{try{const s=window.__demoState();return {cur:s.cur,anim:s.animating};}catch(e){return null;}});
for (let g=1; g<=6; g++) {
  await p.evaluate(()=>{window.__w=[];});
  for (let i=0;i<30;i++){ await p.mouse.wheel(0,8); await sleep(16); }
  await sleep(1000);
  const w = await p.evaluate(()=>({ n:window.__w.length, first:window.__w[0], last:window.__w[window.__w.length-1] }));
  console.log(`glide ${g}: state=${JSON.stringify(await st())}  wheelsSeen=${w.n}  first=${JSON.stringify(w.first)}  last=${JSON.stringify(w.last)}`);
}
await b.close();
