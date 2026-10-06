import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
for(const [route,name] of [["/","home"],["/pro","pro"],["/investor","investor"],["/conference-mode","conference"]]){
  const p=await b.newPage();
  await p.setViewport({width:390,height:740,deviceScaleFactor:2,isMobile:true,hasTouch:true});
  await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
  await p.goto("http://localhost:5197"+route,{waitUntil:"networkidle2",timeout:60000}); await sleep(3500);
  const H=await p.evaluate(()=>document.body.scrollHeight);
  for(let y=0;y<H;y+=500){ await p.evaluate(v=>window.scrollTo(0,v),y); await sleep(110); }
  await sleep(2000);
  const t=await p.evaluate(async()=>{
    const urls=new Set();
    document.querySelectorAll("img").forEach(i=>{ if(i.currentSrc) urls.add(i.currentSrc); });
    document.querySelectorAll("*").forEach(e=>{const bg=getComputedStyle(e).backgroundImage;
      if(bg&&bg!=="none"){const m=bg.match(/url\(["']?(.*?)["']?\)/); if(m&&m[1]&&!m[1].startsWith("data:")) urls.add(new URL(m[1],location.href).href);}});
    let mb=0;
    for(const u of urls){ await new Promise(r=>{const im=new Image(); im.onload=()=>{mb+=(im.naturalWidth*im.naturalHeight*4)/1048576; r();}; im.onerror=()=>r(); im.src=u;}); }
    return {mb:Math.round(mb), n:urls.size};
  });
  console.log(name.padEnd(11),"decoded bitmap ~"+String(t.mb).padStart(4)+"MB across",t.n,"images");
  await p.close();
}
await b.close();
