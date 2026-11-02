// Prove the form admits a failed notification. The API call is intercepted locally,
// so nothing is stored and no mail is attempted.
import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
for (const [emailed,tag] of [[false,"failed"],[true,"ok"]]) {
  const p=await b.newPage();
  await p.setViewport({width:390,height:844,deviceScaleFactor:3,isMobile:true,hasTouch:true});
  await p.setRequestInterception(true);
  p.on("request",r=>{
    if(r.url().includes("/api/contact")) return r.respond({status:200,contentType:"application/json",
      body:JSON.stringify({ok:true,stored:true,emailed})});
    r.continue();
  });
  await p.goto("http://localhost:5197/contact",{waitUntil:"networkidle2"}); await sleep(3500);
  await p.type("#c-name","Jane Example"); await p.type("#c-email","jane@example.com"); await p.type("#c-company","Example Mining");
  await p.evaluate(()=>document.querySelector('button[type="submit"]').click());
  await sleep(1400);
  await p.screenshot({path:`/tmp/formstate-${tag}.png`});
  console.log(tag.padEnd(7), JSON.stringify((await p.evaluate(()=>document.body.innerText)).replace(/\s+/g," ").match(/(Thanks — we've got it\.|Saved, but please email us directly\.)[^]{0,170}/)?.[0]||"NO MATCH"));
  await p.close();
}
await b.close();
