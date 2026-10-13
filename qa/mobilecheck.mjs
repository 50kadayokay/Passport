import puppeteer from "puppeteer-core";
const BASE = process.argv[2] || "https://mineex.ca";
const b = await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],defaultViewport:{width:390,height:844,deviceScaleFactor:3,isMobile:true,hasTouch:true}});

// /home — is a phone render actually ON SCREEN on mobile, whatever image it uses?
let p = await b.newPage();
await p.goto(BASE+"/home",{waitUntil:"networkidle2",timeout:60000});
await new Promise(r=>setTimeout(r,5000));
console.log("HOME (mobile):", JSON.stringify(await p.evaluate(()=>{
  const vis = el => { const r=el.getBoundingClientRect(); return r.width>40&&r.height>40&&r.top<innerHeight&&r.bottom>0; };
  const imgs=[...document.querySelectorAll('img')].filter(i=>i.complete&&i.naturalWidth>0&&vis(i))
    .map(i=>({f:i.currentSrc.split('/').pop(), w:Math.round(i.getBoundingClientRect().width)}));
  const bgs=[...document.querySelectorAll('*')].filter(e=>/url\(/.test(getComputedStyle(e).backgroundImage||'')&&vis(e))
    .map(e=>(/url\("?([^")]+)"?\)/.exec(getComputedStyle(e).backgroundImage)||[])[1]||'').map(u=>u.split('/').pop()).slice(0,6);
  return { visibleImgs: imgs, visibleBackgrounds: bgs, iframeOnScreen: [...document.querySelectorAll('iframe')].some(vis) };
})), null, 1);
await p.close();

// /conference-mode — do the 16 thumbnails actually DISPLAY, and is any tile empty?
p = await b.newPage();
await p.goto(BASE+"/conference-mode",{waitUntil:"networkidle2",timeout:60000});
await new Promise(r=>setTimeout(r,5000));
await p.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=500){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,140));}});
await new Promise(r=>setTimeout(r,3000));
console.log("CONFERENCE (mobile):", JSON.stringify(await p.evaluate(()=>{
  const tiles=[...document.querySelectorAll('*')].filter(e=>/thumbs\//.test(getComputedStyle(e).backgroundImage||''));
  const onScreen=tiles.filter(e=>{const r=e.getBoundingClientRect();return r.width>40&&r.top<innerHeight&&r.bottom>0;});
  const loaded=performance.getEntriesByType('resource').filter(r=>/\/thumbs\//.test(r.name));
  return { tilesWithThumbnail: tiles.length, thumbRequests: loaded.length,
           thumbBytesKB: Math.round(loaded.reduce((s,r)=>s+(r.encodedBodySize||0),0)/1024),
           iframes: document.querySelectorAll('iframe').length,
           anyTileEmpty: tiles.filter(e=>!/url\(/.test(getComputedStyle(e).backgroundImage||'')).length };
})), null, 1);
await p.close();
await b.close();
