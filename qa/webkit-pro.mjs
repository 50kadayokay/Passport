// The Pro page in WEBKIT — the engine Safari actually uses. Every earlier test was Chrome,
// which is very likely why this reproduces for the user and not in CI.
import { webkit } from "playwright-core";
const BASE = process.argv[2] || "https://mineex.ca";
const sleep = m => new Promise(r => setTimeout(r, m));
const b = await webkit.launch();
for (const [w,h] of [[1440,900],[1240,820]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0,120)));
  p.on('console', m => { if (m.type()==='error') errs.push('console: '+m.text().slice(0,110)); });
  await p.goto(BASE + "/pro", { waitUntil: 'load', timeout: 90000 });
  await sleep(6000);
  const chap = () => p.evaluate(() => (document.body.innerText.match(/\d\d\s*\/\s*\d\d/)||[])[0] || '?');
  const start = await chap();
  await p.mouse.move(Math.round(w/2), Math.round(h/2));
  const trail = [start];
  for (let i=0;i<6;i++) { await p.mouse.wheel(0, 420); await sleep(700); trail.push(await chap()); }
  // and back up
  for (let i=0;i<3;i++) { await p.mouse.wheel(0, -420); await sleep(700); }
  const back = await chap();
  const advanced = trail[trail.length-1] !== start;
  console.log(`WebKit ${w}x${h}  ${start} -> ${trail.slice(1).join(' ')} | back: ${back}  ${advanced?'ADVANCES':'*** FROZEN ***'}`);
  if (errs.length) console.log('   errors:', errs.slice(0,3));
  await ctx.close();
}
await b.close();
