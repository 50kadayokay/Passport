import { webkit } from "playwright-core";
const BASE = process.argv[2];
const sleep = m => new Promise(r => setTimeout(r, m));
const b = await webkit.launch();
const p = await (await b.newContext({ viewport:{width:1440,height:900} })).newPage();
await p.goto(BASE+"/pro", { waitUntil:'load', timeout:90000 }); await sleep(6000);
await p.mouse.move(720,450);
const st = () => p.evaluate(() => { try { return window.__demoState?.().cur ?? null; } catch(e){ return null; } });
const before = await st();
// A FIRM FLICK followed by a decaying momentum tail, the way macOS actually sends it.
for (const d of [90,80,65,50,38,28,20,14,10,7,5,3,2,1,1]) { await p.mouse.wheel(0, d); await sleep(16); }
await sleep(1200);
const after = await st();
console.log(`  flick + decaying inertia tail:  cur ${before} -> ${after}  (want +1, runaway would be +3 or more)`);
// backward with a gentle glide
for (let i=0;i<40;i++){ await p.mouse.wheel(0,-6); await sleep(16); }
await sleep(1000);
console.log(`  gentle glide BACK:              cur ${after} -> ${await st()}`);
await b.close();
