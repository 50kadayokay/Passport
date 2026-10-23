import puppeteer from "puppeteer-core";
const BASE = process.argv[2] || "https://mineex.ca";
const MOB = !!process.env.MOBILE;
const sleep=m=>new Promise(r=>setTimeout(r,m));
const b = await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],
  defaultViewport: MOB?{width:390,height:844,deviceScaleFactor:3,isMobile:true,hasTouch:true}:{width:1440,height:900}});
const p = await b.newPage();
await p.goto(BASE+"/conference-mode",{waitUntil:"networkidle2",timeout:60000});
await sleep(2500);
// mount every tile, then kill smooth scrolling so coordinates are stable when we click
await p.evaluate(async()=>{ for(let y=0;y<document.body.scrollHeight;y+=500){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,120));} });
await sleep(1200);
await p.evaluate(()=>{ document.documentElement.style.scrollBehavior='auto'; });

const slugs = await p.evaluate(()=>{ const s=new Set();
  for(const e of document.querySelectorAll('*')){const bg=getComputedStyle(e).backgroundImage||'';const m=/\/thumbs\/([a-z0-9]+)\./i.exec(bg);if(m)s.add(m[1]);}
  return [...s]; });

let pass=0, fail=0;
for (const slug of slugs) {
  // position it, wait for the scroll to actually settle, THEN measure
  const hit = await p.evaluate(async (s)=>{
    const find=()=>{ for(const e of document.querySelectorAll('*')){const bg=getComputedStyle(e).backgroundImage||'';
      if(new RegExp(`/thumbs/${s}\\.`,'i').test(bg)) return e;} return null; };
    const el=find(); if(!el) return null;
    el.scrollIntoView({block:'center', behavior:'instant'});
    let last=-1; for(let i=0;i<40;i++){ await new Promise(r=>requestAnimationFrame(r));
      if(Math.round(window.scrollY)===last) break; last=Math.round(window.scrollY); }
    await new Promise(r=>setTimeout(r,250));
    const el2=find(); const r=el2.getBoundingClientRect();
    const cx=Math.round(r.left+r.width/2), cy=Math.round(r.top+r.height/2);
    const top=document.elementFromPoint(cx,cy);
    let n=top,h=0,href=null; while(n&&h<8){ if(n.tagName==='A'&&n.getAttribute('href')){href=n.getAttribute('href');break;} n=n.parentElement;h++; }
    return { cx, cy, inView: r.top>=0&&r.bottom<=innerHeight, href, topEl: top?top.tagName:null };
  }, slug);
  if (!hit) { console.log(`FAIL ${slug} — tile gone`); fail++; continue; }
  if (!hit.href) { console.log(`FAIL ${slug.padEnd(12)} no link reachable at tile centre (topEl=${hit.topEl})`); fail++; continue; }

  await Promise.all([ p.waitForNavigation({waitUntil:'networkidle2',timeout:45000}).catch(()=>{}), p.mouse.click(hit.cx, hit.cy) ]);
  await sleep(3000);
  const r = await p.evaluate(()=>{ const fr=[...document.querySelectorAll('iframe')]; let len=0;
    for(const f of fr){try{const d=f.contentDocument;len=Math.max(len,(d?.body?.innerText||'').trim().length);}catch(_){}}
    return { url:location.search, len, back: [...document.querySelectorAll('a,button')].some(x=>/back to templates/i.test(x.textContent||'')) }; });
  const ok = r.len>120 && r.back && r.url.includes(slug);
  console.log(`${ok?'PASS':'FAIL'} ${slug.padEnd(12)} opened=${String(r.len).padStart(5)}ch back=${r.back} url=${r.url.slice(0,44)}`);
  ok?pass++:fail++;
  await p.goto(BASE+"/conference-mode",{waitUntil:"networkidle2",timeout:60000});
  await sleep(1800);
  await p.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=500){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,110));}});
  await sleep(900);
  await p.evaluate(()=>{ document.documentElement.style.scrollBehavior='auto'; });
}
console.log(`\n${MOB?'MOBILE':'DESKTOP'}: ${pass} pass, ${fail} fail`);
await b.close();
process.exit(fail?1:0);
