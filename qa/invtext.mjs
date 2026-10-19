import puppeteer from "puppeteer-core";
const sleep=m=>new Promise(r=>setTimeout(r,m));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],defaultViewport:{width:1440,height:900}});
for(const base of process.argv.slice(2)){
  const p=await b.newPage();
  await p.goto(base+"/investor",{waitUntil:'networkidle2',timeout:90000});
  await sleep(4000);
  const at=async(y)=>{ await p.evaluate(v=>window.scrollTo(0,v),y); await sleep(1200);
    return p.evaluate(()=>{
      const eye=[...document.querySelectorAll('span')].filter(e=>/^0\d$/.test((e.textContent||'').trim()))
        .map(e=>{const r=e.getBoundingClientRect();return {t:e.textContent.trim(),l:Math.round(r.left),top:Math.round(r.top),vis:r.width>0&&r.top<innerHeight&&r.bottom>0};});
      return {eyebrows:eye.length, visible:eye.filter(x=>x.vis).map(x=>`${x.t}@${x.l},${x.top}`), docH:document.body.scrollHeight};
    }); };
  console.log(base.replace('https://','').slice(0,30).padEnd(32), 'y=0  ', JSON.stringify(await at(0)));
  console.log(''.padEnd(32), 'y=1200', JSON.stringify(await at(1200)));
  await p.close();
}
await b.close();
