import puppeteer from "puppeteer-core";
const BASE = process.argv[2] || "http://localhost:5188";
const b = await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],defaultViewport:{width:390,height:844,deviceScaleFactor:3}});
let bad = 0;
for (const path of ["/appdemo?embed=1", "/app?c=kingsmen-resources&embed=1", "/app?c=kingsmen-resources"]) {
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0,100)));
  p.on('console', m => { if (m.type()==='error' && !/favicon|404/i.test(m.text())) errs.push(m.text().slice(0,100)); });
  await p.goto(BASE+path,{waitUntil:"networkidle2",timeout:60000});
  await new Promise(r=>setTimeout(r,5000));
  const r = await p.evaluate(()=>({
    text: (document.body.innerText||'').trim().length,
    imgs: [...document.querySelectorAll('img')].filter(i=>i.complete&&i.naturalWidth>0).length,
    hasRoot: !!document.getElementById('root')?.children.length,
  }));
  const ok = r.text > 80 && r.hasRoot && errs.length === 0;
  if (!ok) bad++;
  console.log(`${ok?'PASS':'FAIL'}  ${path.padEnd(38)} text=${String(r.text).padStart(5)} imgs=${r.imgs}${errs.length?'  ERR: '+errs[0]:''}`);
  await p.close();
}
await b.close();
console.log(bad ? '\nAPP CHECK FAILED' : '\nAPP OK — boots, renders, no errors');
process.exit(bad?1:0);
