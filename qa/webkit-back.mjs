import { webkit } from "playwright-core";
const BASE = process.argv[2] || "https://mineex.ca";
const sleep = m => new Promise(r => setTimeout(r, m));
const b = await webkit.launch();
const p = await (await b.newContext({ viewport:{width:1440,height:900} })).newPage();
await p.goto(BASE+"/pro", { waitUntil:'load', timeout:90000 });
await sleep(6000);
await p.mouse.move(720,450);
const st = () => p.evaluate(() => { try { const s=window.__demoState&&window.__demoState(); return s?`cur=${s.cur}${s.animating?' ANIM':''}`:'none'; } catch(e){ return 'err'; } });
const sy = () => p.evaluate(() => Math.round(window.scrollY));
console.log('start        ', await st(), 'scrollY=' + await sy());
for (let i=0;i<5;i++){ await p.mouse.wheel(0,420); await sleep(800); }
console.log('after 5 down ', await st(), 'scrollY=' + await sy());
for (let i=0;i<6;i++){ await p.mouse.wheel(0,-420); await sleep(800); console.log(`  up #${i+1}      `, await st(), 'scrollY=' + await sy()); }
await b.close();
