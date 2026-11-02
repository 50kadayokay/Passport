import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],defaultViewport:{width:1440,height:900}});
const p = await b.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,140)));
const url = process.argv[2];
await p.goto(url,{waitUntil:"networkidle2",timeout:60000});
for (const t of [1500, 4000, 8000]) {
  await new Promise(r=>setTimeout(r,t===1500?1500:t-(t===4000?1500:4000)));
  const r = await p.evaluate(()=>{
    const fr=[...document.querySelectorAll('iframe')];
    let inner=0, innerTxt='';
    for(const f of fr){ try{const d=f.contentDocument; const t=(d?.body?.innerText||'').trim(); if(t.length>inner){inner=t.length; innerTxt=t.slice(0,60);} }catch(_){}}
    return { outerText:(document.body.innerText||'').trim().slice(0,70), outerLen:(document.body.innerText||'').trim().length,
             iframes:fr.length, innerLen:inner, innerTxt,
             visibleImgs:[...document.querySelectorAll('img')].filter(i=>i.complete&&i.naturalWidth>0).length };
  });
  console.log(`t=${t}ms`, JSON.stringify(r));
}
if(errs.length) console.log('PAGE ERRORS:', errs.slice(0,3));
await b.close();
