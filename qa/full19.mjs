import { webkit } from "playwright-core";
const sleep=m=>new Promise(r=>setTimeout(r,m));
const BASE=process.argv[2];
const b=await webkit.launch();
const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
await p.goto(BASE+"/pro",{waitUntil:'load',timeout:90000});
await sleep(7000);
const st=()=>p.evaluate(()=>{try{return window.__demoState().cur;}catch(e){return null;}});
// Park the cursor OVER THE PHONE — the iframe that steals focus.
const box = await p.evaluate(()=>{ const f=document.querySelector('iframe'); if(!f) return null;
  const r=f.getBoundingClientRect(); return {x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2)}; });
console.log('cursor parked over the phone at', JSON.stringify(box));
await p.mouse.move(box.x, box.y);
const glide = async (dir) => { for (let i=0;i<30;i++){ await p.mouse.wheel(0, dir*8); await sleep(16); } await sleep(1400); };
const fwd=[await st()]; let stalls=0;
for (let i=0;i<22;i++){ const was=await st(); await glide(1); const now=await st(); if(now===was) stalls++; fwd.push(now); }
console.log('FORWARD :', fwd.join('>'), `  stalls=${stalls}`);
const back=[await st()]; let bstalls=0;
for (let i=0;i<22;i++){ const was=await st(); await glide(-1); const now=await st(); if(now===was) bstalls++; back.push(now); }
console.log('BACKWARD:', back.join('>'), `  stalls=${bstalls}`);
await b.close();
