import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const BASE=process.argv[2]||"http://localhost:5197";
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
for(const [W,H] of [[390,844],[390,690]]){
  const p=await b.newPage();
  await p.setViewport({width:W,height:H,deviceScaleFactor:2,isMobile:true,hasTouch:true});
  await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
  await p.goto(BASE+"/",{waitUntil:"networkidle2",timeout:60000}); await sleep(5000);
  const PH=await p.evaluate(()=>document.body.scrollHeight);
  await p.evaluate(()=>window.scrollTo(0,document.body.scrollHeight)); await sleep(2600);
  const r=await p.evaluate(()=>{
    const t=document.body.innerText.replace(/\s+/g," ");
    return { priced:/\/ month|per month|12-month agreement/i.test(t), url:location.pathname,
             head:t.slice(0,130) };
  });
  console.log(`${W}x${H} pageH ${PH} url ${r.url} → pricing visible: ${r.priced?"YES":"NO"}`);
  console.log("   ", r.head);
  await p.screenshot({path:`/private/tmp/claude-501/-Users-leifer-Passport-V1/4d9fc2e9-c8af-4a55-9854-42380ee52983/scratchpad/home-bottom-${W}x${H}.png`});
  // and scrolling back up must close it again
  await p.evaluate(()=>window.scrollTo(0,document.body.scrollHeight-2200)); await sleep(1800);
  const back=await p.evaluate(()=>location.pathname);
  console.log(`    scroll back up → url ${back} (should leave /pricing)`);
  await p.close();
}
await b.close();
