import puppeteer from "puppeteer-core";
const BASE = process.argv[2] || "http://localhost:5188";
for (const [w,h,label] of [[375,812,'mobile'],[1440,900,'desktop']]) {
  const b = await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"],defaultViewport:{width:w,height:h}});
  for (const path of ["/home","/pro"]) {
    const p = await b.newPage();
    await p.evaluateOnNewDocument(`
      window.__lcp = null;
      new PerformanceObserver((l) => { const e = l.getEntries().pop();
        window.__lcp = { url: e.url || null, size: e.size,
          tag: e.element ? e.element.tagName : null,
          bg: e.element ? (getComputedStyle(e.element).backgroundImage||'').slice(0,90) : null }; })
        .observe({type:'largest-contentful-paint', buffered:true});
    `);
    await p.goto(BASE+path,{waitUntil:"networkidle2",timeout:60000});
    await new Promise(r=>setTimeout(r,3500));
    const lcp = await p.evaluate(()=>window.__lcp);
    console.log(`${label.padEnd(8)} ${path.padEnd(10)} ${lcp ? (lcp.url || lcp.bg || lcp.tag) : 'none'}`);
    await p.close();
  }
  await b.close();
}
