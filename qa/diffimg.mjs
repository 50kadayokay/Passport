import sharp from "sharp";
const [a,b,out]=process.argv.slice(2);
const [x,y]=await Promise.all([sharp(a).raw().toBuffer({resolveWithObject:true}),sharp(b).raw().toBuffer({resolveWithObject:true})]);
const {width,height,channels}=x.info; const o=Buffer.alloc(width*height*3);
for(let i=0,j=0;i<x.data.length;i+=channels,j+=3){
  const d=Math.abs(x.data[i]-y.data[i])+Math.abs(x.data[i+1]-y.data[i+1])+Math.abs(x.data[i+2]-y.data[i+2]);
  if(d>18){o[j]=255;o[j+1]=0;o[j+2]=0;} else {const g=Math.round(255-(255-x.data[i])*0.25);o[j]=o[j+1]=o[j+2]=g;}
}
await sharp(o,{raw:{width,height,channels:3}}).png().toFile(out);
console.log("→",out);
