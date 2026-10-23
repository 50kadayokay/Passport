import puppeteer from "puppeteer-core";
const sleep=m=>new Promise(r=>setTimeout(r,m));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],defaultViewport:{width:1440,height:900}});
for (const base of [process.argv[2]]) {
  const p=await b.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,150)));
  p.on('requestfailed',r=>errs.push('FAILED '+r.url().split('/').pop()+' '+(r.failure()?.errorText||'')));
  p.on('response',r=>{ if(r.status()>=400 && /\.js|\.css/.test(r.url())) errs.push('HTTP '+r.status()+' '+r.url().split('/').pop()); });
  await p.goto(base+"/investor",{waitUntil:'networkidle2',timeout:90000});
  await sleep(5000);
  // the rail = the numbered section markers (01..07) down the left
  const r = await p.evaluate(()=>{
    const nums=[...document.querySelectorAll('*')].filter(e=>e.children.length===0 && /^0[1-9]$/.test((e.textContent||'').trim()));
    const left=nums.filter(e=>e.getBoundingClientRect().left < innerWidth*0.3);
    return { numberedMarkers: nums.length, onTheLeft: left.length,
             sample: left.slice(0,5).map(e=>{const q=e.getBoundingClientRect();return `${e.textContent.trim()}@${Math.round(q.left)},${Math.round(q.top)}`;}) };
  });
  console.log(base.replace('https://','').slice(0,34).padEnd(36), JSON.stringify(r));
  if(errs.length) console.log('   errors:', errs.slice(0,4));
  await p.close();
}
await b.close();
