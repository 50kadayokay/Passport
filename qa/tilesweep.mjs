import puppeteer from "puppeteer-core";
const BASE = process.argv[2] || "https://mineex.ca";
const sleep=m=>new Promise(r=>setTimeout(r,m));
const b = await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],defaultViewport:{width:1440,height:900}});
const p = await b.newPage();
await p.goto(BASE+"/conference-mode",{waitUntil:"networkidle2",timeout:60000});
await sleep(2500);
await p.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=500){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,120));}});
await sleep(1200);
// Each tile's slug + the href/onclick target it will navigate to
const tiles = await p.evaluate(()=>{
  const out=[],seen=new Set();
  for(const e of document.querySelectorAll('*')){
    const bg=getComputedStyle(e).backgroundImage||''; const m=/\/thumbs\/([a-z0-9]+)\./i.exec(bg);
    if(!m||seen.has(m[1]))continue; seen.add(m[1]);
    let n=e,h=0,href=null;
    while(n&&h<8){ if(n.tagName==='A'&&n.getAttribute('href')){href=n.getAttribute('href');break;} n=n.parentElement;h++; }
    out.push({slug:m[1],href});
  }
  return out;
});
console.log(`${tiles.length} tiles\n`);
let ok=0,bad=0;
for(const t of tiles){
  const page2 = await b.newPage();
  const url = t.href ? (t.href.startsWith('http')?t.href:BASE+t.href) : null;
  if(!url){ console.log(`?     ${t.slug.padEnd(12)} no href found`); bad++; await page2.close(); continue; }
  await page2.goto(url,{waitUntil:"networkidle2",timeout:60000}).catch(()=>{});
  await sleep(3500);
  const r = await page2.evaluate(()=>{
    const fr=[...document.querySelectorAll('iframe')];
    let inner='',len=0;
    for(const f of fr){ try{const d=f.contentDocument;const t=(d?.body?.innerText||'').trim(); if(t.length>len){len=t.length;inner=t;} }catch(_){}}
    return { innerLen:len, locked:/not available|isn.t published|Profile not available/i.test(inner), head:inner.slice(0,46).replace(/\n/g,' ') };
  });
  const good = r.innerLen>120 && !r.locked;
  console.log(`${good?'PASS':'FAIL'}  ${t.slug.padEnd(12)} ${String(url).replace(BASE,'').slice(0,52).padEnd(52)} ${good?'':'LOCKED '}“${r.head}”`);
  good?ok++:bad++;
  await page2.close();
}
console.log(`\n${ok} working, ${bad} broken`);
await b.close();
