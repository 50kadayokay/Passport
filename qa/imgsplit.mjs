import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],defaultViewport:{width:1440,height:900}});
const p = await b.newPage();
const seen = [];
p.on('response', async (r) => {
  const ct = r.headers()['content-type'] || '';
  if (!/image\//.test(ct)) return;
  let len = Number(r.headers()['content-length'] || 0);
  seen.push({ url: r.url(), kb: Math.round(len/1024), frame: r.frame() ? (r.frame().parentFrame() ? 'IFRAME' : 'main') : '?' });
});
await p.goto(process.argv[2] || "http://localhost:5188/home", {waitUntil:"networkidle2",timeout:60000});
await new Promise(r=>setTimeout(r,3000));
const sum = (f) => seen.filter(s=>s.frame===f).reduce((a,s)=>a+s.kb,0);
console.log('main frame :', seen.filter(s=>s.frame==='main').length, 'images', Math.round(sum('main')/1024*100)/100, 'MB');
console.log('iframe     :', seen.filter(s=>s.frame==='IFRAME').length, 'images', Math.round(sum('IFRAME')/1024*100)/100, 'MB');
console.log('\ntop 12 by size:');
for (const s of seen.sort((a,b)=>b.kb-a.kb).slice(0,12)) console.log(`  ${String(s.kb).padStart(5)}KB  ${s.frame.padEnd(7)} ${s.url.split('/').pop().slice(0,44)}`);
await b.close();
