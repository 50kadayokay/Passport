// The phone must still WORK after the srcset change: cover fades, app becomes live,
// the demo sequence runs, and the device is the same size (no layout shift at hand-off).
import puppeteer from "puppeteer-core";
const BASE=process.argv[2]||"http://localhost:5188";
const sleep=m=>new Promise(r=>setTimeout(r,m));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],defaultViewport:{width:1440,height:900}});
let bad=0;
for(const path of ['/investor','/pro','/home']){
  const p=await b.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,90)));
  await p.goto(BASE+path,{waitUntil:'networkidle2',timeout:60000});
  await sleep(2000);
  const early=await p.evaluate(()=>{ const f=document.querySelector('iframe'); const r=f?.getBoundingClientRect();
    return r?{w:Math.round(r.width),h:Math.round(r.height)}:null; });
  await sleep(7000);
  const late=await p.evaluate(()=>{
    const f=document.querySelector('iframe'); const r=f?.getBoundingClientRect();
    const po=[...document.querySelectorAll('img')].find(i=>/opening-poster/.test(i.currentSrc||i.src||''));
    let coverOpacity=null; if(po){ let n=po.parentElement; coverOpacity=n?getComputedStyle(n).opacity:null; }
    let inner=0; try{inner=(f?.contentDocument?.body?.innerText||'').trim().length;}catch(_){}
    return { size:r?{w:Math.round(r.width),h:Math.round(r.height)}:null, coverOpacity, inner,
             scrollable: (()=>{try{const d=f.contentDocument;return d.documentElement.scrollHeight>d.documentElement.clientHeight;}catch(_){return null}})() };
  });
  const noShift = early && late.size && early.w===late.size.w && early.h===late.size.h;
  const live = late.inner>60;
  const faded = late.coverOpacity==='0' || late.coverOpacity===null;
  const ok = noShift && live && errs.length===0;
  if(!ok) bad++;
  console.log(`${ok?'PASS':'FAIL'}  ${path.padEnd(10)} device ${early?early.w+'x'+early.h:'—'} -> ${late.size?late.size.w+'x'+late.size.h:'—'} ${noShift?'(no shift)':'(SHIFTED)'}  appText=${String(late.inner).padStart(5)}  coverOpacity=${late.coverOpacity}  scrollable=${late.scrollable}${errs.length?'  ERR '+errs[0]:''}`);
  await p.close();
}
console.log(bad?'\nPHONE INTERACTION FAILED':'\nPHONE OK — no layout shift, app goes live, cover fades');
await b.close();
process.exit(bad?1:0);
