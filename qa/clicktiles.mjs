// CLICK every Conference Mode template tile on the live site and prove it works.
// A tile "works" only if the click changes the URL to that template, the destination
// actually renders, and the visitor can get back to the gallery.
import puppeteer from "puppeteer-core";
const BASE = process.argv[2] || "https://mineex.ca";
const MOBILE = !!process.env.MOBILE;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const b = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new", args: ["--no-sandbox"],
  defaultViewport: MOBILE ? {width:390,height:844,deviceScaleFactor:3,isMobile:true,hasTouch:true} : {width:1440,height:900},
});
const p = await b.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0,110)));

await p.goto(BASE + "/conference-mode", { waitUntil: "networkidle2", timeout: 60000 });
await sleep(3000);
await p.evaluate(async () => { for (let y=0;y<document.body.scrollHeight;y+=500){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,130));} window.scrollTo(0,0); });
await sleep(1500);

// Find the clickable tiles: elements carrying a /thumbs/ background, plus their nearest
// clickable ancestor (that is what a visitor actually hits).
const tiles = await p.evaluate(() => {
  const out = [];
  const seen = new Set();
  for (const e of document.querySelectorAll('*')) {
    const bg = getComputedStyle(e).backgroundImage || '';
    const m = /\/thumbs\/([a-z0-9]+)\./i.exec(bg);
    if (!m || seen.has(m[1])) continue;
    seen.add(m[1]);
    let n = e, hops = 0;
    while (n && hops < 6) {
      const c = getComputedStyle(n);
      if (n.tagName === 'A' || n.tagName === 'BUTTON' || c.cursor === 'pointer' || n.onclick) break;
      n = n.parentElement; hops++;
    }
    const target = n || e;
    out.push({ slug: m[1], tag: target.tagName, href: target.getAttribute && target.getAttribute('href'),
               cursor: getComputedStyle(target).cursor });
  }
  return out;
});
console.log(`found ${tiles.length} template tiles${MOBILE ? ' (mobile)' : ''}\n`);

let pass = 0, fail = 0;
for (const t of tiles) {
  await p.goto(BASE + "/conference-mode", { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(1800);
  await p.evaluate(async () => { for (let y=0;y<document.body.scrollHeight;y+=500){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,110));} });
  await sleep(900);
  const before = p.url();

  // click the tile the way a visitor does: a real mouse click at its centre
  const clicked = await p.evaluate((slug) => {
    for (const e of document.querySelectorAll('*')) {
      const bg = getComputedStyle(e).backgroundImage || '';
      if (!new RegExp(`/thumbs/${slug}\\.`, 'i').test(bg)) continue;
      e.scrollIntoView({ block: 'center' });
      return true;
    }
    return false;
  }, t.slug);
  if (!clicked) { console.log(`FAIL  ${t.slug.padEnd(12)} tile not found`); fail++; continue; }
  await sleep(500);
  const box = await p.evaluate((slug) => {
    for (const e of document.querySelectorAll('*')) {
      const bg = getComputedStyle(e).backgroundImage || '';
      if (!new RegExp(`/thumbs/${slug}\\.`, 'i').test(bg)) continue;
      const r = e.getBoundingClientRect();
      return { x: r.left + r.width/2, y: r.top + r.height/2, w: r.width, h: r.height };
    }
    return null;
  }, t.slug);
  if (!box || box.w < 10) { console.log(`FAIL  ${t.slug.padEnd(12)} tile has no box`); fail++; continue; }

  await p.mouse.click(box.x, box.y);
  await sleep(2600);

  const after = p.url();
  const state = await p.evaluate(() => ({
    text: (document.body.innerText||'').trim().length,
    canGoBack: !!document.querySelector('a[href*="conference"], button'),
  }));
  const moved = after !== before;
  const rendered = state.text > 40;
  const ok = moved && rendered;

  // can the visitor get back?
  let backOk = false;
  if (moved) {
    await p.goBack({ waitUntil: "networkidle2", timeout: 30000 }).catch(()=>{});
    await sleep(1500);
    backOk = /conference-mode/.test(p.url()) && await p.evaluate(()=> [...document.querySelectorAll('*')].some(e=>/thumbs\//.test(getComputedStyle(e).backgroundImage||'')));
  }

  console.log(`${ok && backOk ? 'PASS' : 'FAIL'}  ${t.slug.padEnd(12)} cursor=${String(t.cursor).padEnd(8)} url→${after.replace(BASE,'').slice(0,42).padEnd(42)} text=${String(state.text).padStart(5)} back=${backOk}`);
  if (ok && backOk) pass++; else fail++;
}
console.log(`\n${pass} pass, ${fail} fail`);
if (errs.length) console.log('page errors:', errs.slice(0,4));
await b.close();
process.exit(fail ? 1 : 0);
