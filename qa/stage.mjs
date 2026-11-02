import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const p=await b.newPage();
await p.setViewport({width:390,height:740,deviceScaleFactor:2,isMobile:true,hasTouch:true});
await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
await p.goto("http://localhost:5197/?realwalk=1",{waitUntil:"networkidle2"}); await sleep(5000);
await p.evaluate(()=>window.scrollTo(0,document.body.scrollHeight*0.25)); await sleep(2200);
console.log(await p.evaluate(()=>{
  const story=document.querySelector(".mx-story");
  const grid=story&&story.firstElementChild;
  const kids=grid?[...grid.children]:[];
  const demo=document.querySelector(".mx-demo");
  const frame=document.querySelector(".mx-demo iframe");
  const r=(e)=>e?{t:Math.round(e.getBoundingClientRect().top),h:Math.round(e.getBoundingClientRect().height),w:Math.round(e.getBoundingClientRect().width)}:null;
  return {
    viewport:innerHeight,
    story:r(story),
    gridRows:kids.map(k=>r(k)),
    demo:r(demo),
    iframeScaled: frame?Math.round(frame.getBoundingClientRect().width):null,
  };
}));
await b.close();
