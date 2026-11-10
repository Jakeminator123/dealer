// One bounded motion-only experiment. Default prepares local input; --submit
// submits it once. A persisted request lock prevents accidental duplicate jobs.
import sharp from 'sharp';
import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
if(path.resolve(process.cwd())!==path.resolve(root))throw Error('Run from the dealer checkout.');
const id='pamela-p7-c1-left-pink-pilot-01',dir=`assets/motions/${id}`;
const source='assets/motions/pamela-p4-c2-left-closed-closed/source.mp4';
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const promptText='Locked camera, continuous natural dealing motion. Same woman and her anatomical LEFT hand on viewer right. Her left hand slides the top magenta card out of the shoe, keeps it low over the felt, turns it over ONCE with one small wrist roll while moving right, lays it flat in the exact new-card location in the last frame, releases it and returns empty to its original shoe pose. The card goes directly from draw to table. Her other hand rests naturally; her gaze follows the card. The dealt card stays a plain solid magenta rectangle on BOTH SIDES; this color is only a tracking surface. Preserve the card shape and natural fingertip grip. No hand transfer, no raised display pause, no second roll. Keep the existing centre card stationary.';
await mkdir(dir,{recursive:true});
const receiptPath=`${dir}/generation.json`;
if(!await stat(receiptPath).catch(()=>null)){
 const originalPath=`${dir}/source-anchor.png`;
 execFileSync(process.env.FFMPEG||'ffmpeg',['-v','error','-i',source,'-frames:v','1','-y',originalPath],{windowsHide:true});
 const {data,info}=await sharp(originalPath).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const rgb=Buffer.from(data),mask=Buffer.alloc(info.width*info.height);let changed=0;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
  const i=(y*info.width+x)*3,r=data[i],g=data[i+1],b=data[i+2];
  // Card-face cores only, bounded away from the face/body and shoe housing.
  const shoe=x>=1234&&x<=1348&&y>=758&&y<=865&&r>180&&g>165&&b<95&&Math.abs(r-g)<75;
  const centre=x>=830&&x<=930&&y>=1000&&y<=1090&&b>115&&r<65&&g<145;
  if(shoe||centre){rgb[i]=255;rgb[i+1]=0;rgb[i+2]=255;mask[y*info.width+x]=255;changed++;}
 }
 if(changed<5000||changed>16000)throw Error(`Unexpected card mask size: ${changed}`);
 await sharp(rgb,{raw:{width:info.width,height:info.height,channels:3}}).png().toFile(`${dir}/start.png`);
 await sharp(mask,{raw:{width:info.width,height:info.height,channels:1}}).png().toFile(`${dir}/input-mask.png`);
 const spec=JSON.parse(await readFile('assets/motions/pamela-p7-c1-left-turn-pilot-02/overlay-spec.json','utf8'));
 const svg=Buffer.from(`<svg width="${info.width}" height="${info.height}" xmlns="http://www.w3.org/2000/svg"><polygon points="${spec.points.map((p:{x:number;y:number})=>`${p.x},${p.y}`).join(' ')}" fill="#ff00ff"/></svg>`);
 await sharp(`${dir}/start.png`).composite([{input:svg}]).png().toFile(`${dir}/end.png`);
 const start=await readFile(`${dir}/start.png`),end=await readFile(`${dir}/end.png`);
 await writeFile(receiptPath,JSON.stringify({id,provider:'Runway developer API',endpoint:'/v1/image_to_video',model:'wan3',duration:6,ratio:'auto_1080p',audio:false,promptText,status:'PREPARED',estimatedCredits:120,source:{path:source,sha256:hash(await readFile(source))},start:{path:`${dir}/start.png`,sha256:hash(start)},end:{path:`${dir}/end.png`,sha256:hash(end)},inputOverlay:{rgb:[255,0,255],mask:`${dir}/input-mask.png`,changedPixels:changed,method:'bounded deterministic card-face overlay; all other source pixels preserved'},plannedTarget:{id:'P7.C1',points:spec.points,calibrated:false},physicalIntent:{takeHand:'LH',releaseHand:'LH',startSide:'BACK',endSide:'FRONT',turnCount:1,pass:false},colorDoesNotProvePhysicalSide:true},null,2)+'\n',{flag:'wx'});
}
const receipt=JSON.parse(await readFile(receiptPath,'utf8'));
if(!process.argv.includes('--submit')){console.log(JSON.stringify({id,status:receipt.status,start:receipt.start.path,end:receipt.end.path,changedPixels:receipt.inputOverlay.changedPixels,estimatedCredits:receipt.estimatedCredits}));process.exit(0);}
if(receipt.status!=='PREPARED')throw Error(`Already requested or needs manual review: ${receipt.status}`);
const key=process.env.RUNWAY_API_KEY;if(!key)throw Error('Load dealer/.env.local explicitly.');
const start=await readFile(receipt.start.path),end=await readFile(receipt.end.path);
if(hash(start)!==receipt.start.sha256||hash(end)!==receipt.end.sha256)throw Error('Prepared inputs changed.');
await writeFile(`${dir}/request.lock`,new Date().toISOString(),{flag:'wx'});
receipt.status='SUBMITTING';receipt.requestedAt=new Date().toISOString();
await writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n');
const body={model:receipt.model,promptText:receipt.promptText,duration:receipt.duration,ratio:receipt.ratio,audio:false,promptImage:[{uri:`data:image/png;base64,${start.toString('base64')}`,position:'first'},{uri:`data:image/png;base64,${end.toString('base64')}`,position:'last'}]};
const response=await fetch('https://api.dev.runwayml.com/v1/image_to_video',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','X-Runway-Version':'2024-11-06'},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
if(!response.ok)throw Error(`Runway HTTP ${response.status}; inspect before any retry.`);
const task=await response.json();if(typeof task.id!=='string')throw Error('Missing task ID; inspect before retry.');
receipt.status='PENDING';receipt.taskId=task.id;await writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({id,taskId:task.id,status:receipt.status,estimatedCredits:receipt.estimatedCredits}));
