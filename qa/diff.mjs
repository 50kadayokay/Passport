// Pixel-compare two screenshot folders. Used to prove the DESKTOP composition is unchanged.
import fs from "fs";
import path from "path";
import sharp from "sharp";
const [a,bd]=process.argv.slice(2);
const files=fs.readdirSync(a).filter(f=>f.endsWith(".png")).sort();
let worst=0;
for(const f of files){
  const p2=path.join(bd,f);
  if(!fs.existsSync(p2)){ console.log(f.padEnd(22),"MISSING in B"); continue; }
  const [x,y]=await Promise.all([sharp(path.join(a,f)).raw().toBuffer({resolveWithObject:true}),
                                 sharp(p2).raw().toBuffer({resolveWithObject:true})]);
  if(x.info.width!==y.info.width||x.info.height!==y.info.height){
    console.log(f.padEnd(22),`SIZE ${x.info.width}x${x.info.height} vs ${y.info.width}x${y.info.height}`); worst=100; continue;
  }
  let diff=0; const n=x.data.length;
  for(let i=0;i<n;i+=4){ if(Math.abs(x.data[i]-y.data[i])>6||Math.abs(x.data[i+1]-y.data[i+1])>6||Math.abs(x.data[i+2]-y.data[i+2])>6) diff++; }
  const pct=(diff/(n/4))*100; worst=Math.max(worst,pct);
  console.log(f.padEnd(22), pct.toFixed(3)+"% px differ");
}
console.log("\nworst:",worst.toFixed(3)+"%");
