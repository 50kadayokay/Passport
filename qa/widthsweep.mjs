import { webkit } from "playwright-core";
const sleep=m=>new Promise(r=>setTimeout(r,m));
const BASE=process.argv[2];
const b=await webkit.launch();
for (const [w,h] of [[1024,768],[1180,800],[1280,800],[1366,768],[1440,900],[1512,860],[1680,1050],[1920,1080],[2560,1440]]) {
  const p=await (await b.newContext({viewport:{width:w,height:h}})).newPage();
  await p.goto(BASE+"/investor",{waitUntil:'load',timeout:90000});
  await sleep(6500);
  const r=await p.evaluate(()=>{
    const vis=el=>{ if(!el) return false; const q=el.getBoundingClientRect();
      if(!(q.width>20&&q.height>20&&q.top<innerHeight&&q.bottom>0&&q.left<innerWidth&&q.right>0)) return false;
      let n=el; while(n&&n!==document.documentElement){const c=getComputedStyle(n);
        if(c.opacity==='0'||c.visibility==='hidden'||c.display==='none') return false; n=n.parentElement;} return true; };
    const f=document.querySelector('iframe'); const q=f?f.getBoundingClientRect():null;
    let inner=0; try{ inner=(f?.contentDocument?.body?.innerText||'').trim().length; }catch(_){}
    return { vis: vis(f), rect: q?[Math.round(q.left),Math.round(q.top),Math.round(q.width),Math.round(q.height)]:null, inner };
  });
  console.log(`  ${String(w).padStart(4)}x${String(h).padStart(4)}  phone=${r.vis?'VISIBLE':'*** MISSING ***'}  rect=${JSON.stringify(r.rect)}  appText=${r.inner}`);
  await p.close();
}
await b.close();
