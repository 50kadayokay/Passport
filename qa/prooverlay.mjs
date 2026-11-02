import puppeteer from "puppeteer-core";
const BASE=process.argv[2]||"https://mineex.ca";
const sleep=m=>new Promise(r=>setTimeout(r,m));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],defaultViewport:{width:1440,height:900}});
const p=await b.newPage();
await p.goto(BASE+"/pro",{waitUntil:'networkidle2',timeout:90000});
await sleep(5000);
const look = async (tag) => console.log(tag, JSON.stringify(await p.evaluate(()=>{
  const top = document.elementFromPoint(innerWidth/2, innerHeight/2);
  const fixedFull = [...document.querySelectorAll('div')].filter(d=>{const c=getComputedStyle(d);const r=d.getBoundingClientRect();
    return c.position==='fixed' && r.width>=innerWidth-2 && r.height>=innerHeight-2;})
    .map(d=>{const c=getComputedStyle(d);return {z:c.zIndex, opacity:c.opacity, vis:c.visibility, transform:c.transform.slice(0,30), pe:c.pointerEvents, kids:d.children.length};});
  const h=[...document.querySelectorAll('h1,h2')].find(x=>{const r=x.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0&&r.width>0&&getComputedStyle(x).opacity!=='0';});
  return { topElementAtCentre: top?top.tagName+'.'+String(top.className).slice(0,22):null,
           fullScreenFixedLayers: fixedFull, heading: h?h.textContent.trim().slice(0,44):null,
           chapterLabel: (document.body.innerText.match(/\d\d\s*\/\s*\d\d/)||[])[0]||null };
})));
await look('initial :');
await p.mouse.move(720,500);
for(let i=0;i<5;i++){ await p.mouse.wheel({deltaY:500}); await sleep(650); }
await look('after 5 :');
for(let i=0;i<5;i++){ await p.mouse.wheel({deltaY:-500}); await sleep(650); }
await look('back up:');
await b.close();
