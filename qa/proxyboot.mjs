import puppeteer from "puppeteer-core";
const U=process.argv[2];
const sleep=m=>new Promise(r=>setTimeout(r,m));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],defaultViewport:{width:390,height:844,deviceScaleFactor:3,isMobile:true}});
const p=await b.newPage();
const bad=[]; p.on('requestfailed',r=>bad.push(r.url().split('/').pop()));
p.on('response',r=>{ if(r.status()>=400) bad.push(r.status()+' '+r.url().split('/').pop()); });
await p.goto(U+"/app?c=kingsmen-resources",{waitUntil:'networkidle2',timeout:90000});
await sleep(6000);
const r=await p.evaluate(()=>({ origin:location.origin, path:location.pathname,
  textLen:(document.body.innerText||'').trim().length,
  mounted:!!document.getElementById('root')?.children.length,
  sample:(document.body.innerText||'').trim().slice(0,70).replace(/\n/g,' ') }));
console.log(JSON.stringify(r,null,1));
console.log('failed/4xx requests:', bad.length?bad.slice(0,5):'none');
await b.close();
