// Does each surface still RENDER what it is supposed to render?
import puppeteer from "puppeteer-core";
const BASE = process.argv[2] || "http://localhost:5188";
const b = await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],defaultViewport:{width:1440,height:900}});
const page = await b.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0,120)));
page.on('console', m => { if (m.type()==='error') errs.push(m.text().slice(0,120)); });

const check = async (path, wants) => {
  await page.goto(BASE+path, {waitUntil:"networkidle2", timeout:60000});
  await new Promise(r=>setTimeout(r,4000));
  const r = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('img')].filter(i=>i.complete&&i.naturalWidth>0);
    const frames = [...document.querySelectorAll('iframe')];
    let framePainted = 0;
    for (const f of frames) { try { const d=f.contentDocument; if (d && (d.body?.innerText||'').trim().length>30) framePainted++; } catch(_){} }
    const hero = [...document.querySelectorAll('h1,h2')].find(h=>{const q=h.getBoundingClientRect();return q.width>0&&q.top<innerHeight&&q.bottom>0&&getComputedStyle(h).opacity!=='0'&&(h.textContent||'').trim().length>6;});
    return { loadedImgs: imgs.length, iframes: frames.length, framePainted,
             hero: hero ? hero.textContent.trim().slice(0,42) : null,
             thumbTiles: [...document.querySelectorAll('*')].filter(e=>/thumbs\//.test(getComputedStyle(e).backgroundImage||'')).length,
             heroPhone: [...document.querySelectorAll('img')].some(i=>/hero-hand-phone/.test(i.src)&&i.complete&&i.naturalWidth>0) };
  });
  const ok = Object.entries(wants).every(([k,v]) => typeof v==='function' ? v(r[k]) : r[k]===v);
  console.log(`${ok?'PASS':'FAIL'}  ${path.padEnd(18)} imgs=${String(r.loadedImgs).padStart(3)} thumbs=${String(r.thumbTiles).padStart(2)} iframes=${r.iframes} painted=${r.framePainted} hero="${r.hero}"`);
  return ok;
};

let allOk = true;
allOk &= await check("/home",            { heroPhone: true, hero: h=>!!h, framePainted: n=>n>=1 });
allOk &= await check("/pro",             { hero: h=>!!h, iframes: n=>n>=1 });
allOk &= await check("/investor",        { hero: h=>!!h, framePainted: n=>n>=1 });
allOk &= await check("/conference-mode", { hero: h=>!!h, thumbTiles: n=>n>=10, framePainted: n=>n>=10 });
allOk &= await check("/pricing",         { hero: h=>!!h });
allOk &= await check("/get-the-app",     { hero: h=>!!h });
console.log(errs.length ? `\nconsole/page errors:\n  ${errs.slice(0,6).join('\n  ')}` : "\nno console or page errors");
console.log(allOk ? "\nALL SURFACES OK" : "\nSOME SURFACES FAILED");
await b.close();
process.exit(allOk ? 0 : 1);
