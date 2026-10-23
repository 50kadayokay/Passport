import { webkit, chromium } from "playwright-core";
const BASE = process.argv[2] || "https://mineex.ca";
const sleep = m => new Promise(r => setTimeout(r, m));
for (const [name, engine] of [["WebKit", webkit], ["Chromium", chromium]]) {
  const b = await engine.launch();
  const p = await (await b.newContext({ viewport:{width:1440,height:900} })).newPage();
  await p.goto(BASE+"/pro", { waitUntil:'load', timeout:90000 });
  await sleep(6000);
  await p.mouse.move(720,450);
  const read = () => p.evaluate(() => { try { const s = window.__demoState && window.__demoState(); return s ? {cur:s.cur, animating:s.animating} : null; } catch(e){ return 'err'; } });
  const chap = () => p.evaluate(() => (document.body.innerText.match(/\d\d\s*\/\s*\d\d/)||[])[0]||'?');
  const log = [];
  for (let i=0;i<8;i++){ await p.mouse.wheel(0,420); await sleep(750); log.push(`${await chap()}${JSON.stringify(await read())}`); }
  console.log(`${name}: ` + log.join('  '));
  await b.close();
}
