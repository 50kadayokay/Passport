// Does the app inside the phone actually REQUEST the URLs the parent warms?
import puppeteer from "puppeteer-core";
const BASE = process.argv[2] || "https://mineex.ca";
const b = await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],defaultViewport:{width:1440,height:900}});
const p = await b.newPage();
const reqs = [];
p.on('request', r => { if (/image|\.webp|\.jpg|\.png/.test(r.resourceType()+r.url())) reqs.push({url:r.url(), frame: r.frame()?.parentFrame() ? 'IFRAME' : 'main'}); });
await p.goto(BASE+"/home",{waitUntil:"networkidle2",timeout:60000});
await new Promise(r=>setTimeout(r,6000));
// scroll through the whole page so every chapter mounts
await p.evaluate(async () => { for (let y=0; y<document.body.scrollHeight; y+=600){ window.scrollTo(0,y); await new Promise(r=>setTimeout(r,120)); } });
await new Promise(r=>setTimeout(r,5000));
const pp = reqs.filter(r=>/\/pp\//.test(r.url));
const iframeImgs = reqs.filter(r=>r.frame==='IFRAME');
const ppInIframe = iframeImgs.filter(r=>/\/pp\//.test(r.url));
console.log('/pp/ requested by PARENT (the warm):', pp.filter(r=>r.frame==='main').length);
console.log('/pp/ requested by the APP IFRAME   :', ppInIframe.length);
console.log('total iframe image requests        :', iframeImgs.length);
console.log('\nsample of what the IFRAME actually asks for:');
for (const r of iframeImgs.slice(0,8)) console.log('  ', r.url.replace(/^https?:\/\/[^/]+/,'').slice(0,78));
await b.close();
