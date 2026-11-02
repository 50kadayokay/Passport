import puppeteer from "puppeteer-core";
const BASE = process.argv[2] || "https://mineex.ca";
const sleep=m=>new Promise(r=>setTimeout(r,m));
for (const mob of [false,true]) {
  const b = await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],
    defaultViewport: mob?{width:390,height:844,deviceScaleFactor:3,isMobile:true,hasTouch:true}:{width:1440,height:900}});
  const p = await b.newPage();
  await p.goto(BASE+"/conference-mode",{waitUntil:"networkidle2",timeout:60000});
  await sleep(2500);
  await p.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=500){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,120));}});
  await sleep(1000);
  let pass=0, fail=0;
  for (const slug of ['terminal2','folio','vista','cirrus']) {
    const box = await p.evaluate((s)=>{
      for(const e of document.querySelectorAll('*')){
        const bg=getComputedStyle(e).backgroundImage||'';
        if(!new RegExp(`/thumbs/${s}\\.`,'i').test(bg)) continue;
        e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect();
        return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width};
      } return null;
    }, slug);
    if(!box){ console.log(`${mob?'mob':'dsk'}  FAIL ${slug} — no tile`); fail++; continue; }
    await sleep(400);
    const box2 = await p.evaluate((s)=>{ for(const e of document.querySelectorAll('*')){const bg=getComputedStyle(e).backgroundImage||'';
      if(!new RegExp(`/thumbs/${s}\\.`,'i').test(bg))continue; const r=e.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2};} return null;}, slug);
    // A tile click is a FULL document navigation (the template route is not an intercepted
    // marketing path), so the old execution context dies — wait for the new document.
    await Promise.all([
      p.waitForNavigation({waitUntil:'networkidle2', timeout:45000}).catch(()=>{}),
      p.mouse.click(box2.x, box2.y),
    ]);
    await sleep(3200);
    const opened = await p.evaluate(()=>{ const fr=[...document.querySelectorAll('iframe')]; let len=0;
      for(const f of fr){try{const d=f.contentDocument;len=Math.max(len,(d?.body?.innerText||'').trim().length);}catch(_){}}
      return {url:location.search, innerLen:len}; });
    // return to the gallery using the on-page control
    const backClicked = await p.evaluate(()=>{ const a=[...document.querySelectorAll('a,button')].find(x=>/back to templates/i.test(x.textContent||''));
      if(!a) return false; a.click(); return true; });
    await p.waitForNavigation({waitUntil:'networkidle2', timeout:45000}).catch(()=>{});
    await sleep(2600);
    const backOk = await p.evaluate(()=> /conference/.test(location.search+location.pathname) &&
      [...document.querySelectorAll('*')].some(e=>/thumbs\//.test(getComputedStyle(e).backgroundImage||'')));
    const ok = opened.innerLen>120 && backClicked && backOk;
    console.log(`${mob?'mob':'dsk'}  ${ok?'PASS':'FAIL'} ${slug.padEnd(10)} opened=${String(opened.innerLen).padStart(5)}ch  backControl=${backClicked}  galleryBack=${backOk}`);
    ok?pass++:fail++;
    if(!backOk){ await p.goto(BASE+"/conference-mode",{waitUntil:"networkidle2"}); await sleep(2000);
      await p.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=500){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,110));}}); await sleep(800); }
  }
  console.log(`${mob?'MOBILE':'DESKTOP'}: ${pass} pass ${fail} fail\n`);
  await b.close();
}
