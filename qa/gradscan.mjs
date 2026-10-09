// Scan EVERY conference state, at two heights, for a horizontal cutoff below the device.
import puppeteer from "puppeteer-core";
import sharp from "sharp";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const B=process.argv[2]||"http://localhost:5197";
const OUT="/private/tmp/claude-501/-Users-leifer-Passport-V1/4d9fc2e9-c8af-4a55-9854-42380ee52983/scratchpad";
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
for(const [VW,VH] of [[390,844],[390,740]]){
  const p=await b.newPage(); await p.setCacheEnabled(false);
  await p.setViewport({width:VW,height:VH,deviceScaleFactor:3,isMobile:true,hasTouch:true});
  await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
  await p.goto(B+"/",{waitUntil:"domcontentloaded",timeout:90000}); await sleep(9000);
  await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Explore the product"]'); if(e)e.click();});
  await sleep(900);
  for(let i=0;i<14;i++){
    await sleep(1100);
    const lbl=await p.evaluate(()=>{const t=document.body.innerText.replace(/\s+/g," ");
      const m=t.match(/(\d\d)\s*\/\s*0?4\s*·\s*([A-Z ]+)/); return m?m[0]:null;});
    const dev=await p.evaluate(()=>{const el=document.querySelector(".mx-cdev"); if(!el) return null;
      const q=el.getBoundingClientRect(); return {bottom:q.bottom};});
    if(lbl && dev){
      const shot=await p.screenshot();
      const {data,info}=await sharp(shot).raw().toBuffer({resolveWithObject:true});
      const W=info.width,H=info.height,C=info.channels;
      const px=(x,y)=>{const i=(y*W+x)*C;return [data[i],data[i+1],data[i+2]];};
      const lo=Math.min(H-8, Math.round((dev.bottom+28)*3));
      const hist={}; let best=0;
      for(let x=8;x<W-8;x+=3) for(let y=lo;y<H-4;y++){
        const a=px(x,y-2),c=px(x,y+2);
        const d=Math.abs(a[0]-c[0])+Math.abs(a[1]-c[1])+Math.abs(a[2]-c[2]);
        if(d>4){hist[y]=(hist[y]||0)+1; if(d>best)best=d;}
      }
      const top=Object.entries(hist).map(([y,n])=>[+y,n]).sort((a,c)=>c[1]-a[1])[0]||[0,0];
      const cols=Math.floor((W-16)/3);
      console.log(`${VW}x${VH} ${lbl.padEnd(22)} belowY=${lo} maxDelta=${best} worstRow=${top[0]} cols=${top[1]}/${cols} ${top[1]>cols*0.4?"<<< CUTOFF":"clean"}`);
      if(top[1]>cols*0.4) await sharp(shot).toFile(`${OUT}/cut-${VW}x${VH}-${lbl.replace(/\W/g,"")}.png`);
    }
    const more=await p.evaluate(()=>{const e=document.querySelector('button[aria-label="Next"]'); if(!e||e.disabled) return false; e.click(); return true;});
    if(!more) break;
  }
  await p.close();
}
await b.close();
