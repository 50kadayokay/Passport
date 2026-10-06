import puppeteer from "puppeteer-core";
const base=(p)=>(/\.html($|\?)/.test(p)?"http://localhost:5198":"http://localhost:5197")+p;
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const route=process.argv[2];
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const p=await b.newPage();
await p.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
await p.setCacheEnabled(false);
await p.goto(base(route),{waitUntil:"networkidle2",timeout:45000}).catch(()=>{});
await sleep(5000);
await p.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=600){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,120));}window.scrollTo(0,0);});
await sleep(1500);
const out=await p.evaluate(()=>{
  const sig=(e)=>{let n=e,parts=[];for(let i=0;i<3&&n&&n.tagName;i++){parts.unshift(n.tagName.toLowerCase()+(n.className&&typeof n.className==="string"?"."+n.className.trim().split(/\s+/).slice(0,2).join("."):""));n=n.parentElement;}return parts.join(">");};
  const tiny=[...document.querySelectorAll("p,span,li,a,div")].filter(e=>e.children.length===0&&(e.textContent||"").trim().length>10&&parseFloat(getComputedStyle(e).fontSize)<14)
    .map(e=>({fs:getComputedStyle(e).fontSize,txt:(e.textContent||"").trim().slice(0,52),sig:sig(e)}));
  const taps=[...document.querySelectorAll("button,a")].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&(r.height<40||r.width<40);})
    .map(e=>{const r=e.getBoundingClientRect();return{w:Math.round(r.width),h:Math.round(r.height),txt:(e.textContent||"").trim().slice(0,32),sig:sig(e)};});
  const group=(arr,k)=>{const m={};for(const a of arr){const key=k(a);(m[key]=m[key]||{n:0,ex:a}).n++;}return Object.entries(m).sort((x,y)=>y[1].n-x[1].n);};
  return {tiny:group(tiny,a=>a.fs+" | "+a.sig),taps:group(taps,a=>a.w+"x"+a.h+" | "+a.sig)};
});
console.log("--- TINY TEXT ---");for(const[k,v]of out.tiny)console.log(String(v.n).padStart(3),k,"::",v.ex.txt);
console.log("--- SMALL TAPS ---");for(const[k,v]of out.taps)console.log(String(v.n).padStart(3),k,"::",v.ex.txt);
await b.close();
