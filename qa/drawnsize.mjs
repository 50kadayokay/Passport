import puppeteer from "puppeteer-core";
const BASE = process.argv[2] || "https://mineex.ca";
for (const dpr of [2, 3]) {
  const b = await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],defaultViewport:{width:1440,height:900,deviceScaleFactor:dpr}});
  const p = await b.newPage();
  await p.goto(BASE+"/home",{waitUntil:"networkidle2",timeout:60000});
  await new Promise(r=>setTimeout(r,5000));
  await p.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=600){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,110));}});
  await new Promise(r=>setTimeout(r,4000));
  const rows = [];
  for (const f of p.frames()) {
    try {
      const r = await f.evaluate((dpr) => [...document.querySelectorAll('img')]
        .filter(i=>/kingsmen-fixture/.test(i.currentSrc||i.src))
        .map(i=>{ const q=i.getBoundingClientRect();
          return {f:(i.currentSrc||i.src).split('/').pop(), cssW:Math.round(q.width), cssH:Math.round(q.height),
                  devW:Math.round(q.width*dpr), natW:i.naturalWidth}; }), dpr);
      rows.push(...r);
    } catch(_){}
  }
  const best = {};
  for (const r of rows) { if (!best[r.f] || r.devW > best[r.f].devW) best[r.f] = r; }
  console.log(`\nDPR ${dpr} — largest each fixture is ever DRAWN at:`);
  for (const k in best) { const r=best[k];
    console.log(`  ${k.padEnd(22)} css ${String(r.cssW).padStart(4)}px  device ${String(r.devW).padStart(4)}px  source ${r.natW}px  ratio ${(r.natW/Math.max(r.devW,1)).toFixed(1)}x`); }
  await b.close();
}
