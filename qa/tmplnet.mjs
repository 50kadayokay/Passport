import puppeteer from "puppeteer-core";
const URL=process.argv[2];
const sleep=m=>new Promise(r=>setTimeout(r,m));
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],defaultViewport:{width:1440,height:900}});
const p=await b.newPage();
await p.setCacheEnabled(false);                      // COLD, like a first visit
const c=await p.createCDPSession(); await c.send('Network.enable');
await c.send('Network.emulateNetworkConditions',{offline:false,latency:40,downloadThroughput:10*1024*1024/8,uploadThroughput:3*1024*1024/8});
await c.send('Emulation.setCPUThrottlingRate',{rate:4});
const t0=Date.now(); const js=[];
p.on('response', async r=>{ const u=r.url(); if(!/\.js(\?|$)/.test(u)) return;
  let kb=0; try{ kb=Math.round((await r.buffer()).length/1024); }catch(_){}
  js.push({f:u.split('/').pop().split('-')[0], kb, at:Date.now()-t0}); });
await p.goto(URL,{waitUntil:'domcontentloaded',timeout:120000});
await sleep(30000);
js.sort((a,b)=>b.kb-a.kb);
const total=js.reduce((s,x)=>s+x.kb,0);
console.log(`JS downloaded: ${js.length} files, ${(total/1024).toFixed(2)} MB`);
for(const x of js.slice(0,10)) console.log(`  ${String(x.kb).padStart(5)}KB  arrived @${String(x.at).padStart(6)}ms  ${x.f}`);
console.log('last JS arrived @', Math.max(...js.map(x=>x.at)), 'ms');
await b.close();
