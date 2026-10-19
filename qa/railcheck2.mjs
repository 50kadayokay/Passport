import { webkit } from "playwright-core";
const BASE = process.argv[2] || "http://localhost:5188";
const sleep = m => new Promise(r => setTimeout(r, m));
const b = await webkit.launch();
const p = await (await b.newContext({ viewport:{width:1440,height:900} })).newPage();
for (const path of ["/investor","/pro","/home"]) {
  await p.goto(BASE+path, { waitUntil:'load', timeout:90000 });
  await sleep(4000);
  const at = async (y) => { await p.evaluate(v=>window.scrollTo(0,v), y); await sleep(1100);
    return p.evaluate(() => {
      const n = document.querySelector('nav[aria-label="Jump to section"]');
      if (!n) return { rail:false };
      const r = n.getBoundingClientRect(); const cs = getComputedStyle(n);
      const items=[...n.querySelectorAll('.mx-jump, .inv-tick')]; const dots = items.map(b => b.getAttribute('aria-current')==='true' ? '|' : '.');
      return { rail:true, dots:dots.join(''), left:Math.round(r.left), opacity:cs.opacity, count: items.length, active: items.findIndex(b=>b.getAttribute('aria-current')==='true') };
    }); };
  const a = await at(0), bb = await at(1400), c = await at(5200), d = await at(12000);
  console.log(`${path.padEnd(10)} rail=${a.rail} left=${a.left??'-'} labels=${a.labels||'-'}`);
  console.log(`${''.padEnd(10)} y=0 ${a.dots||'-'} (${a.opacity})  y=1400 ${bb.dots||'-'}  y=5200 ${c.dots||'-'}  y=12000 ${d.dots||'-'}`);
}
await b.close();
