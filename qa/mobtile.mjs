import puppeteer from "puppeteer-core";
const BASE = process.argv[2] || "https://mineex.ca";
const sleep=m=>new Promise(r=>setTimeout(r,m));
const b = await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],
  defaultViewport:{width:390,height:844,deviceScaleFactor:3,isMobile:true,hasTouch:true}});
const p = await b.newPage();
await p.goto(BASE+"/conference-mode",{waitUntil:"networkidle2",timeout:60000});
await sleep(2500);
await p.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=500){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,120));}});
await sleep(1200);
const out = await p.evaluate(()=>{
  const res=[];
  const seen=new Set();
  for(const e of document.querySelectorAll('*')){
    const bg=getComputedStyle(e).backgroundImage||''; const m=/\/thumbs\/([a-z0-9]+)\./i.exec(bg);
    if(!m||seen.has(m[1]))continue; seen.add(m[1]);
    e.scrollIntoView({block:'center'});
    const r=e.getBoundingClientRect();
    const cx=Math.round(r.left+r.width/2), cy=Math.round(r.top+r.height/2);
    const top=document.elementFromPoint(cx,cy);
    // walk up from the top-most element looking for a link
    let n=top,h=0,href=null,tag=null;
    while(n&&h<8){ if(n.tagName==='A'&&n.getAttribute('href')){href=n.getAttribute('href');tag='A';break;} n=n.parentElement;h++; }
    res.push({slug:m[1], w:Math.round(r.width), h:Math.round(r.height),
              inView: r.top>=0&&r.bottom<=innerHeight,
              topEl: top? top.tagName+'.'+String(top.className||'').slice(0,18) : null,
              reachableHref: href });
  }
  return res;
});
for(const r of out) console.log(`${r.slug.padEnd(12)} ${String(r.w).padStart(3)}x${String(r.h).padStart(3)} inView=${String(r.inView).padEnd(5)} topEl=${String(r.topEl).padEnd(26)} href=${r.reachableHref||'— NONE —'}`);
await b.close();
