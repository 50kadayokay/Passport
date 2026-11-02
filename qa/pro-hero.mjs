import { webkit } from "playwright-core";
const sleep=m=>new Promise(r=>setTimeout(r,m));
const BASE=process.argv[2];
const b=await webkit.launch();
const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,130)));
p.on('console',m=>{ if(m.type()==='error') errs.push('console: '+m.text().slice(0,120)); });
await p.goto(BASE+"/pro",{waitUntil:'load',timeout:90000});
await sleep(7000);
const look = () => p.evaluate(()=>{
  const h=[...document.querySelectorAll('h1,h2')].find(x=>{const q=x.getBoundingClientRect();const c=getComputedStyle(x);
    return q.width>0&&q.top<innerHeight&&q.bottom>0&&c.opacity!=='0'&&(x.textContent||'').trim().length>6;});
  return { heading: h?h.textContent.trim().slice(0,44):null, scrollY:Math.round(window.scrollY),
           chapter:(document.body.innerText.match(/\d\d\s*\/\s*\d\d/)||[])[0]||null, docH:document.body.scrollHeight };
});
console.log('AT LOAD  ', JSON.stringify(await look()));
await p.mouse.move(720,450);
// realistic trackpad glide: ~60Hz stream of small deltas
for (let g=1; g<=4; g++) {
  for (let i=0;i<30;i++){ await p.mouse.wheel(0,8); await sleep(16); }
  await sleep(900);
  console.log(`after glide ${g}`, JSON.stringify(await look()));
}
await p.screenshot({path:'/tmp/pro-after.png'});
if(errs.length) console.log('ERRORS:', errs.slice(0,4));
await b.close();
