import puppeteer from "puppeteer-core";
const BASE=process.argv[2]||"https://mineex.ca";
const sleep=m=>new Promise(r=>setTimeout(r,m));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],defaultViewport:{width:1440,height:900}});
const p=await b.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,160)));
p.on('console',m=>{ if(m.type()==='error') errs.push('console: '+m.text().slice(0,140)); });
await p.goto(BASE+"/pro",{waitUntil:'networkidle2',timeout:90000});
await sleep(5000);
const geom = await p.evaluate(()=>({
  bodyH: document.body.scrollHeight, docH: document.documentElement.scrollHeight, innerH: innerHeight,
  htmlOverflow: getComputedStyle(document.documentElement).overflow,
  bodyOverflow: getComputedStyle(document.body).overflow,
  scrollers: [...document.querySelectorAll('*')].filter(e=>{const c=getComputedStyle(e);
    return /auto|scroll/.test(c.overflowY) && e.scrollHeight > e.clientHeight+40;}).slice(0,4)
    .map(e=>({cls:String(e.className).slice(0,26), sh:e.scrollHeight, ch:e.clientHeight})),
}));
console.log('geometry:', JSON.stringify(geom));
await p.mouse.move(720,500);
const states=[];
for(let i=0;i<6;i++){ await p.mouse.wheel({deltaY:400}); await sleep(700);
  states.push(await p.evaluate(()=>{ const sc=[...document.querySelectorAll('*')].filter(e=>{const c=getComputedStyle(e);return /auto|scroll/.test(c.overflowY)&&e.scrollHeight>e.clientHeight+40;});
    return `win:${Math.round(scrollY)} inner:${sc.map(e=>Math.round(e.scrollTop)).join('/')||'-'}`; })); }
console.log('after wheels:', states.join('  |  '));
console.log('visible heading now:', await p.evaluate(()=>{const h=[...document.querySelectorAll('h1,h2')].find(x=>{const r=x.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0&&r.width>0;}); return h?h.textContent.trim().slice(0,46):null;}));
if(errs.length) console.log('ERRORS:', errs.slice(0,5));
await b.close();
