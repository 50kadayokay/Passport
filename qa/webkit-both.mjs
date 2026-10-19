import { webkit } from "playwright-core";
const BASE = process.argv[2];
const sleep = m => new Promise(r => setTimeout(r, m));
const b = await webkit.launch();
const p = await (await b.newContext({ viewport:{width:1440,height:900} })).newPage();
await p.goto(BASE+"/pro", { waitUntil:'load', timeout:90000 }); await sleep(6000);
await p.mouse.move(720,450);
const st = () => p.evaluate(() => { try { return window.__demoState?.().cur ?? null; } catch(e){ return null; } });
const glide = async (dir, n=40, d=6) => { for (let i=0;i<n;i++){ await p.mouse.wheel(0, dir*d); await sleep(16); } await sleep(900); };
const fwd = [await st()];
for (let i=0;i<4;i++){ await glide(1); fwd.push(await st()); }
console.log('  gentle glides FORWARD: ' + fwd.join(' -> '));
const back = [await st()];
for (let i=0;i<4;i++){ await glide(-1); back.push(await st()); }
console.log('  gentle glides BACK   : ' + back.join(' -> '));
await b.close();
