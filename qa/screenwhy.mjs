import puppeteer from "puppeteer-core";
const BASE=process.argv[2]||"https://mineex.ca", PATH=process.argv[3]||"/investor";
const sleep=m=>new Promise(r=>setTimeout(r,m));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],defaultViewport:{width:1440,height:900}});
const p=await b.newPage();
const net=[];
p.on('response',r=>{ if(/poster/.test(r.url())) net.push({u:r.url().split('/').pop(),st:r.status(),t:Date.now()}); });
const t0=Date.now();
await p.goto(BASE+PATH,{waitUntil:'domcontentloaded',timeout:60000});
await sleep(9000);
console.log(JSON.stringify(await p.evaluate(()=>{
  const all=[...document.querySelectorAll('img')].filter(i=>/poster/.test(i.currentSrc||i.src||''));
  return { posterImgs: all.map(i=>{ const r=i.getBoundingClientRect(), c=getComputedStyle(i);
      return { src:(i.currentSrc||i.src).split('/').pop(), complete:i.complete, nat:i.naturalWidth,
               w:Math.round(r.width), h:Math.round(r.height), top:Math.round(r.top),
               opacity:c.opacity, visibility:c.visibility,
               parentOpacity: i.parentElement?getComputedStyle(i.parentElement).opacity:null }; }),
    iframes:[...document.querySelectorAll('iframe')].map(f=>{ const r=f.getBoundingClientRect();
      let len=0; try{len=(f.contentDocument?.body?.innerText||'').trim().length;}catch(_){}
      return { src:(f.src||'').split('/').slice(3).join('/').slice(0,40), w:Math.round(r.width), h:Math.round(r.height), top:Math.round(r.top), innerLen:len }; }) };
}),null,1));
console.log('poster responses:', net.map(n=>`${n.u} ${n.st} @${n.t-t0}ms`).join(' | ')||'none');
await b.close();
