import { webkit } from "playwright-core";
const BASE = process.argv[2] || "https://mineex.ca";
const sleep = m => new Promise(r => setTimeout(r, m));
const b = await webkit.launch();
const p = await (await b.newContext({ viewport:{width:1440,height:900} })).newPage();
await p.goto(BASE+"/pro", { waitUntil:'load', timeout:90000 });
await sleep(6000);
await p.mouse.move(720,450);
const st = () => p.evaluate(() => { try { const s=window.__demoState&&window.__demoState(); return s?s.cur:null; } catch(e){ return null; } });
// Real trackpads emit a STREAM of small deltas. FIRM_DELTA=10 filters "stray micro-scroll";
// a gentle two-finger glide may never produce a single event above it.
for (const d of [3, 6, 9, 12, 20]) {
  await p.goto(BASE+"/pro", { waitUntil:'load', timeout:90000 }); await sleep(5000);
  await p.mouse.move(720,450);
  const before = await st();
  for (let i=0;i<40;i++){ await p.mouse.wheel(0, d); await sleep(16); }   // ~0.65s glide
  await sleep(900);
  const after = await st();
  console.log(`  deltaY=${String(d).padStart(2)} x40 (total ${d*40})  cur ${before} -> ${after}  ${after>before?'advances':'*** NO MOVEMENT ***'}`);
}
await b.close();
