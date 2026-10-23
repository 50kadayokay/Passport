import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],defaultViewport:{width:1440,height:900}});
const p = await b.newPage();
const url = process.argv[2] || "http://localhost:5188/home";
await p.goto(url,{waitUntil:"networkidle2",timeout:60000});
await new Promise(r=>setTimeout(r,2500));
const out = await p.evaluate(() => {
  const res = performance.getEntriesByType('resource').filter(r=>/\.(webp|jpg|jpeg|png|avif)/.test(r.name));
  const byOrigin = {};
  for (const r of res) {
    const o = new URL(r.name).origin + (/\/assets\//.test(r.name) ? ' (bundled)' : '');
    byOrigin[o] = byOrigin[o] || {count:0, mb:0};
    byOrigin[o].count++; byOrigin[o].mb += (r.encodedBodySize||0)/1048576;
  }
  for (const k in byOrigin) byOrigin[k].mb = +byOrigin[k].mb.toFixed(2);
  // DOM images: drawn size vs natural size, and whether on screen at this moment
  const imgs = [...document.querySelectorAll('img')].filter(i=>i.currentSrc).map(i=>{
    const r=i.getBoundingClientRect();
    return {drawnW:Math.round(r.width), natW:i.naturalWidth, onScreen:r.width>0&&r.top<innerHeight&&r.bottom>0, loading:i.loading};
  });
  const oversized = imgs.filter(i=>i.natW > i.drawnW*2 && i.drawnW>0).length;
  return {
    totalImageRequests: res.length,
    totalImageMB: +(res.reduce((s,r)=>s+(r.encodedBodySize||0),0)/1048576).toFixed(2),
    byOrigin,
    domImages: imgs.length,
    onScreenNow: imgs.filter(i=>i.onScreen).length,
    oversizedBy2xPlus: oversized,
    lazyTagged: imgs.filter(i=>i.loading==='lazy').length
  };
});
console.log(JSON.stringify(out,null,1));
await b.close();
