import { webkit } from "playwright-core";
const sleep=m=>new Promise(r=>setTimeout(r,m));
const BASE=process.argv[2];
const b=await webkit.launch();
const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push('pageerror: '+String(e).slice(0,130)));
p.on('console',m=>{ if(m.type()==='error') errs.push('console: '+m.text().slice(0,130)); });
p.on('requestfailed',r=>errs.push('FAILED '+r.url().slice(0,70)));
await p.goto(BASE+"/",{waitUntil:'load',timeout:90000});
await sleep(6000);
for (const label of ['Pro','Investor','Conference','Pricing']) {
  const before = p.url();
  const link = await p.$(`a[href]:has-text("${label}")`);
  if (!link) { console.log(`  ${label.padEnd(11)} NO LINK FOUND`); continue; }
  await link.click().catch(e=>errs.push('click: '+String(e).slice(0,80)));
  await sleep(2500);
  const after = p.url();
  const head = await p.evaluate(()=>{ const h=[...document.querySelectorAll('h1,h2')].find(x=>{const q=x.getBoundingClientRect();const c=getComputedStyle(x);return q.width>0&&q.top<innerHeight&&q.bottom>0&&c.opacity!=='0'&&(x.textContent||'').trim().length>6;}); return h?h.textContent.trim().slice(0,38):null; });
  console.log(`  ${label.padEnd(11)} ${before.replace(BASE,'')||'/'} -> ${after.replace(BASE,'')||'/'}  ${after!==before?'NAVIGATED':'*** NOTHING HAPPENED ***'}  "${head}"`);
  await p.goto(BASE+"/",{waitUntil:'load',timeout:90000}); await sleep(3500);
}
if(errs.length) console.log('\n  ERRORS:', [...new Set(errs)].slice(0,5));
await b.close();
