import puppeteer from "puppeteer-core";
const sleep=m=>new Promise(r=>setTimeout(r,m));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],defaultViewport:{width:1440,height:900}});
const p=await b.newPage();
await p.evaluateOnNewDocument(`
  window.__ev=[];
  addEventListener('mx:navchange',()=>window.__ev.push('navchange@'+Math.round(performance.now())));
  addEventListener('popstate',()=>window.__ev.push('popstate@'+Math.round(performance.now())));
  const st=history.pushState.bind(history);
  history.pushState=function(a,b,u){ window.__ev.push('pushState '+u+'@'+Math.round(performance.now())); return st(a,b,u); };
  const so=window.scrollTo.bind(window);
  window.scrollTo=function(...a){ window.__ev.push('scrollTo('+a.join(',')+')@'+Math.round(performance.now())); return so(...a); };
`);
await p.goto("https://mineex.ca/pro",{waitUntil:'networkidle2',timeout:90000});
await sleep(4000);
await p.evaluate(()=>{window.__ev=[];});
for(let i=0;i<4;i++){ await p.evaluate(()=>window.scrollBy(0,600)); await sleep(600); }
console.log(JSON.stringify(await p.evaluate(()=>({events:window.__ev.slice(0,14), scrollY:Math.round(scrollY), url:location.pathname+location.search})),null,1));
await b.close();
