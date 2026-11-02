import puppeteer from "puppeteer-core";
const BASE=process.argv[2]||"http://localhost:5188";
const sleep=m=>new Promise(r=>setTimeout(r,m));
for(const [mob,label] of [[true,'iPhone 390x844 DPR3'],[false,'desktop 1440x900']]){
  const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],
    defaultViewport: mob?{width:390,height:844,deviceScaleFactor:3,isMobile:true,hasTouch:true}:{width:1440,height:900}});
  for(const path of ['/home','/investor','/pro']){
    const p=await b.newPage();
    await p.goto(BASE+path,{waitUntil:'networkidle2',timeout:90000});
    await sleep(9000);
    const r=await p.evaluate(()=>{
      const posters=[...document.querySelectorAll('img')].filter(i=>/opening-poster/.test(i.currentSrc||i.src||''));
      const f=document.querySelector('iframe'); let live=0; try{live=(f?.contentDocument?.body?.innerText||'').trim().length;}catch(_){}
      return {posterImgs:posters.length, appText:live, iframe:!!f};
    });
    console.log(`${label.padEnd(20)} ${path.padEnd(11)} poster<img> in DOM: ${r.posterImgs}  app alive: ${r.appText>60}  iframe: ${r.iframe}`);
    await p.close();
  }
  await b.close();
}
