import { webkit } from "playwright-core";
const sleep=m=>new Promise(r=>setTimeout(r,m));
const b=await webkit.launch();
const [base, path, out, scroll] = process.argv.slice(2);
const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
await p.goto(base+path,{waitUntil:'load',timeout:90000});
await sleep(2000);
if (scroll) { await p.evaluate(y=>window.scrollTo(0,+y), scroll); await sleep(2500); }
await sleep(5000);
await p.screenshot({ path: out });
console.log("saved", out);
await b.close();
