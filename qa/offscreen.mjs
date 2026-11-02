import puppeteer from "puppeteer-core";
const BASE = process.argv[2] || "http://localhost:5188";
const b = await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],defaultViewport:{width:1440,height:900}});
for (const path of ["/home","/pro","/investor","/conference-mode"]) {
  const p = await b.newPage();
  await p.goto(BASE+path,{waitUntil:"networkidle2",timeout:60000});
  await new Promise(r=>setTimeout(r,3500));
  const r = await p.evaluate(()=>{
    const imgs=[...document.querySelectorAll('img')].filter(i=>i.currentSrc);
    const off=imgs.filter(i=>{const q=i.getBoundingClientRect(); return q.bottom<0||q.top>innerHeight;});
    return { total:imgs.length, offscreen:off.length,
             offscreenEager: off.filter(i=>i.loading!=='lazy').length,
             offscreenEagerKB: 'n/a',
             lazy: imgs.filter(i=>i.loading==='lazy').length };
  });
  console.log(`${path.padEnd(18)} imgs=${String(r.total).padStart(3)}  offscreen=${String(r.offscreen).padStart(3)}  offscreen-but-eager=${String(r.offscreenEager).padStart(3)}  lazy-tagged=${r.lazy}`);
  await p.close();
}
await b.close();
