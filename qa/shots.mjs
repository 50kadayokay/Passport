import puppeteer from "puppeteer-core";
import fs from "fs";
const base=(p)=>(/\.html($|\?)/.test(p)?"http://localhost:5198":"http://localhost:5197")+p;
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const dir=process.argv[2], W=+(process.argv[3]||390), H=+(process.argv[4]||844), mob=W<760;
fs.mkdirSync(dir,{recursive:true});
const ROUTES=[["home","/"],["pro","/pro"],["investor","/investor"],["conference","/conference-mode"],
["pricing","/pricing"],["compare","/compare"],["contact","/contact"],["getstarted","/get-started"],
["template","/site?conftemplate=1&t=keynote&c=vilcanota-demo"],["privacy","/privacy.html"]];
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
for(const [r,path] of ROUTES){
  const p=await b.newPage();
  await p.setViewport({width:W,height:H,deviceScaleFactor:2,isMobile:mob,hasTouch:mob});
  if(mob) await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
  await p.setCacheEnabled(false);
  try{await p.goto(base(path),{waitUntil:"networkidle2",timeout:45000});}catch{}
  await sleep(6000);
  await p.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=600){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,120));}window.scrollTo(0,0);});
  await sleep(1800);
  const h=await p.evaluate(()=>document.body.scrollHeight);
  for(const [tag,y] of [["top",0],["mid",Math.round(h*0.42)],["bot",Math.max(0,h-H)]]){
    await p.evaluate((yy)=>window.scrollTo(0,yy),y); await sleep(900);
    await p.screenshot({path:`${dir}/${r}-${tag}.png`});
  }
  await p.close();
}
await b.close();
console.log("shots →",dir);
