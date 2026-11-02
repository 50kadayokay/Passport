import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],defaultViewport:{width:1440,height:900}});
const p = await b.newPage();
await p.goto("http://localhost:5188/conference-mode",{waitUntil:"networkidle2",timeout:60000});
await new Promise(r=>setTimeout(r,4000));
console.log(JSON.stringify(await p.evaluate(() => {
  const bg = [...document.querySelectorAll('*')].filter(e=>/thumbs\//.test(getComputedStyle(e).backgroundImage||''));
  const thumbReqs = performance.getEntriesByType('resource').filter(r=>/\/thumbs\//.test(r.name));
  // any tile showing neither a thumbnail nor a painted deck?
  const frames=[...document.querySelectorAll('iframe')];
  let dark=0;
  for (const f of frames){ try{const d=f.contentDocument; const painted = d && (d.body?.innerText||'').trim().length>30; const r=f.getBoundingClientRect(); const vis=r.width>0&&r.top<innerHeight&&r.bottom>0; if(vis&&!painted) dark++; }catch(_){ } }
  return { tilesWithThumbBackground: bg.length, thumbnailRequests: thumbReqs.length,
           thumbBytesKB: Math.round(thumbReqs.reduce((s,r)=>s+(r.encodedBodySize||0),0)/1024),
           iframes: frames.length, visibleButUnpainted: dark };
}), null, 1));
await b.close();
