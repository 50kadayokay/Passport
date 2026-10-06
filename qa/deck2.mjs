import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const p=await b.newPage();
await p.setViewport({width:390,height:844,deviceScaleFactor:3,isMobile:true,hasTouch:true});
await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
await p.goto("http://localhost:5197/",{waitUntil:"networkidle2"}); await sleep(4000);
const seen=[];
for(let f=10;f<=62;f+=3){
  await p.evaluate((x)=>window.scrollTo(0,document.body.scrollHeight*x/100),f);
  await sleep(700);
  const s=await p.evaluate(()=>{
    const g=document.querySelector('[role="group"]');
    if(!g) return null;
    const copy=g.parentElement.parentElement.querySelector(".mx-copyin");
    const screenTxt=(g.innerText||"").replace(/\s+/g," ").slice(0,42);
    return copy?{eyebrow:copy.querySelector("p").innerText.replace(/\s+/g," "),screen:screenTxt}:null;
  });
  if(s && (!seen.length || seen[seen.length-1].eyebrow!==s.eyebrow)) seen.push({f,...s});
}
console.log("beats seen while scrolling:");
for(const s of seen) console.log("  at",s.f+"%","|",s.eyebrow.padEnd(16),"| screen:",s.screen);
console.log("\ndistinct beats:",seen.length);
await b.close();
