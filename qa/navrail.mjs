import puppeteer from "puppeteer-core";
const sleep=m=>new Promise(r=>setTimeout(r,m));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],defaultViewport:{width:1440,height:900}});
for(const path of ['/investor','/pro','/home']){
  const p=await b.newPage();
  await p.goto("https://mineex.ca"+path,{waitUntil:'networkidle2',timeout:90000});
  await sleep(4500);
  const r=await p.evaluate(()=>{
    const navs=[...document.querySelectorAll('nav')].map(n=>{const c=getComputedStyle(n);const q=n.getBoundingClientRect();
      return {label:n.getAttribute('aria-label'),pos:c.position,left:Math.round(q.left),vis:q.width>0&&q.height>0,z:c.zIndex,kids:n.children.length};});
    return navs.filter(n=>n.pos==='fixed'||/jump|section/i.test(n.label||''));
  });
  console.log(path.padEnd(11), JSON.stringify(r));
  await p.close();
}
await b.close();
