import puppeteer from "puppeteer-core";
const base=(p)=>(/\.html($|\?)/.test(p)?"http://localhost:5198":"http://localhost:5197")+p;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ROUTES = [
  ["home","/"],["pro","/pro"],["investor","/investor"],["conference","/conference-mode"],
  ["pricing","/pricing"],["compare","/compare"],["contact","/contact"],["getstarted","/get-started"],
  ["getapp","/get-the-app"],["android","/android"],
  ["privacy","/privacy.html"],["terms","/terms.html"],["support","/support.html"],
  ["template","/site?conftemplate=1&t=keynote&c=vilcanota-demo"],
];
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
console.log("route        pageH   overflow  minDev%  blankFr  text   errs  tinyTxt  tapSmall");
for (const [name, r] of ROUTES) {
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
  await p.setCacheEnabled(false);
  let errs = 0; p.on("pageerror", () => errs++); p.on("console", m => { if (m.type()==="error") errs++; });
  try { await p.goto(base(r), { waitUntil: "networkidle2", timeout: 45000 }); } catch {}
  await sleep(6500);
  await p.evaluate(async () => { for (let y=0;y<document.body.scrollHeight;y+=500){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,170));} window.scrollTo(0,0); });
  await sleep(2500);
  const m = await p.evaluate(() => {
    const vw = window.innerWidth;
    const fr = [...document.querySelectorAll("iframe")].map(f=>Math.round(f.getBoundingClientRect().width)).filter(w=>w>0);
    const tiny = [...document.querySelectorAll("p,span,li,a,div")].filter(e=>e.children.length===0&&(e.textContent||"").trim().length>10&&parseFloat(getComputedStyle(e).fontSize)<14).length;
    const taps = [...document.querySelectorAll("button,a")].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&(r.height<40||r.width<40);}).length;
    return { h: document.body.scrollHeight, over: document.documentElement.scrollWidth>vw+1,
      minDev: fr.length?Math.round(Math.min(...fr)/vw*100):null, nf: fr.length,
      text: document.body.innerText.replace(/\s+/g," ").trim().length, tiny, taps };
  });
  let blank=0;
  for (const f of p.frames().filter(f=>f!==p.mainFrame())) { try{const t=await f.evaluate(()=> (document.body?document.body.innerText:"").trim().length); if(t<15)blank++;}catch{blank++;} }
  console.log(name.padEnd(12), String(m.h).padEnd(7), String(m.over).padEnd(9), String(m.minDev??"—").padEnd(8), String(blank+"/"+m.nf).padEnd(8), String(m.text).padEnd(6), String(errs).padEnd(5), String(m.tiny).padEnd(8), m.taps);
  for (const [tag, y] of [["top",0],["mid",Math.round(m.h*0.42)],["bot",Math.max(0,m.h-844)]]) {
    await p.evaluate((yy)=>window.scrollTo(0,yy), y); await sleep(900);
    await p.screenshot({ path: `/tmp/mxshots/${name}-${tag}.png` });
  }
  await p.close();
}
await b.close();
