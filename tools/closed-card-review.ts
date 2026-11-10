/** Local diagnostic recolour only. No pose changes, interpolation or provider calls. */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const root='assets/motions/pamela-p4-c2-left-closed-closed';
const source=`${root}/source.mp4`, output=`${root}/review-v04`;
const expected='e3b38f89eb6cb14f8dc240c5fdecce814850bb87285ebe540084c33af82b2ad7';
if(createHash('sha256').update(await readFile(source)).digest('hex')!==expected)throw Error('Source changed');
await mkdir(output,{recursive:false});
const W=1764,H=1174,N=W*H,B=N*3;
const children:ReturnType<typeof spawn>[]=[];
function launch(args:string[]){
 const p=spawn('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-threads','1',...args],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 let errors='';p.stderr!.on('data',b=>errors+=b);children.push(p);
 const done=once(p,'close').then(([code])=>{if(code!==0)throw Error(errors||`FFmpeg exit ${code}`);});
 done.catch(()=>{});return {p,done};
}
const decoder=launch(['-i',source,'-f','rawvideo','-pix_fmt','rgb24','-threads','1','pipe:1']);
const rawArgs=['-f','rawvideo','-pix_fmt','rgb24','-s',`${W}x${H}`,'-r','30','-i','pipe:0','-an'];
const preview=launch([...rawArgs,'-c:v','libx264','-preset','fast','-crf','16','-pix_fmt','yuv420p','-threads','1','-movflags','+faststart','-n',`${output}/preview.mp4`]);
const mask=launch([...rawArgs,'-c:v','ffv1','-level','3','-pix_fmt','bgr0','-threads','1','-n',`${output}/labels.mkv`]);
async function send(child:typeof preview,frame:Buffer){if(!child.p.stdin!.write(frame))await once(child.p.stdin!,'drain');}
const rows:object[]=[], picks=new Set([0,45,55,61,63,68,75,85,95,105,119]);
// Estimated lower edge of C2 from sampled source crops. Used only to separate overlapping
// diagnostic colour cores; not a production quad or an animation transform.
const guides=[[72,860,1010,940,965],[75,861,1038.5,940,992],[78,866.5,1057,940,1006],
 [81,868,1065,940,1014.5],[84,868,1070,940,1029],[87,869,1071.5,942,1032.5],
 [90,868,1071,944,1048.5],[93,866.5,1071,945,1061],[96,868,1071,947,1068],
 [100,867,1070,947,1069],[119,868.6,1067,945.6,1067]];
function c2At(frame:number,x:number,y:number){
 if(frame<72)return false;
 const right=guides.findIndex(k=>k[0]>=frame),b=guides[right<0?guides.length-1:right],a=guides[Math.max(0,right-1)];
 const t=a[0]===b[0]?0:(frame-a[0])/(b[0]-a[0]);
 const [lx,ly,rx,ry]=[1,2,3,4].map(i=>a[i]+(b[i]-a[i])*t);
 const left=lx+(frame<80?Math.max(0,ly-y)*.075:0);
 return x>=left&&y<=ly+(ry-ly)*(x-lx)/(rx-lx);
}
let carry=Buffer.alloc(0), frame=0;
try{
 for await(const data of decoder.p.stdout!){
  carry=Buffer.concat([carry,data]);
  while(carry.length>=B){
   const original=carry.subarray(0,B);carry=carry.subarray(B);
   const labels=Buffer.alloc(B), edited=Buffer.from(original), types=new Uint8Array(N);
   // Diagnostic colour cores; edge/skin spill still requires visual QA.
   for(let y=500;y<1100;y++)for(let x=800;x<1720;x++){
    const i=y*W+x,o=i*3,r=original[o],g=original[o+1],b=original[o+2];
    if(r>65&&g>65&&b<Math.min(r,g)*.4&&Math.abs(r-g)<Math.max(r,g)*.34)types[i]=1;
    else if(b>65&&b-r>42&&b-g>22)types[i]=2;
   }
   for(let y=500;y<1100;y++)for(let x=800;x<1720;x++){
    const i=y*W+x;if(types[i]!==2)continue;
    const priorCard=x>=840&&x<=926&&y>=1006&&y<=1085;
    types[i]=priorCard&&!c2At(frame,x,y)?2:1;
   }
   let yellow=0,blue=0;
   for(let i=0;i<N;i++)if(types[i]){
    const o=i*3,t=types[i];if(t===1){labels[o]=labels[o+1]=255;yellow++;}else{labels[o+2]=255;blue++;}
    edited[o]=labels[o];edited[o+1]=labels[o+1];edited[o+2]=labels[o+2];
    // A two-pixel inner contour is a preview style, never a mask class.
    if([i-2,i+2,i-W*2,i+W*2].some(n=>types[n]!==t)){edited[o]=52;edited[o+1]=48;edited[o+2]=20;}
   }
   if(blue<1000||yellow<100)throw Error(`Missing colour class at f${frame}`);
   rows.push({frame,yellow,blue});
   if(picks.has(frame))await sharp(edited,{raw:{width:W,height:H,channels:3}}).resize(882,587).png().toFile(`${output}/f${String(frame).padStart(3,'0')}.png`);
   await send(preview,edited);await send(mask,labels);frame++;
  }
 }
 if(carry.length||frame!==120)throw Error(`Unexpected frame count: ${frame}`);
 preview.p.stdin!.end();mask.p.stdin!.end();
 await Promise.all([decoder.done,preview.done,mask.done]);
 await writeFile(`${output}/receipt.json`,JSON.stringify({source,sourceSha256:expected,frames:frame,width:W,height:H,fps:30,colors:{closed:[255,255,0],open:[0,0,255],none:[0,0,0]},note:'Diagnostic colour-core masks; not final alpha mattes. Edge/skin spill and the overlap guide require full-resolution QA. Inner contour only in preview.',guides,rows},null,2)+'\n');
 console.log(JSON.stringify({output,frames:frame}));
}catch(e){for(const p of children)if(p.exitCode===null)p.kill();throw e;}
