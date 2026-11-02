import puppeteer from "puppeteer-core";
const U=process.argv[2]; const sleep=m=>new Promise(r=>setTimeout(r,m));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],defaultViewport:{width:390,height:844,deviceScaleFactor:3,isMobile:true}});
const p=await b.newPage();
const api=[];
p.on('response',r=>{ const u=r.url(); if(/supabase|\/api\//.test(u)) api.push(r.status()+' '+u.split('/').slice(2,4).join('/').slice(0,34)); });
await p.goto(U+"/app?c=kingsmen-resources",{waitUntil:'networkidle2',timeout:90000});
await sleep(7000);
const r=await p.evaluate(()=>({ origin:location.origin.replace(/^https?:\/\//,'').slice(0,34),
  text:(document.body.innerText||'').trim().length,
  storageWorks:(()=>{try{localStorage.setItem('_t','1');localStorage.removeItem('_t');return true;}catch(_){return false;}})() }));
console.log(JSON.stringify(r));
console.log('data/API responses:', api.length ? api.slice(0,4) : 'none seen');
await b.close();
