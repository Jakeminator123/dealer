// The two explicitly requested READY2 trials. Preparation never submits a job.
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import {validatePlan,flatQuad,quad} from '../src/placement-model.ts';
if(path.resolve(process.cwd())!==path.resolve(fileURLToPath(new URL('../',import.meta.url))))throw Error('Run from dealer checkout.');
sharp.concurrency(1);
const selected=process.argv[2];
if(selected!=='p4'&&selected!=='p1')throw Error('Choose the requested p4 or p1 trial.');
const target=selected==='p4'?'P4.C1':'P1.C1';
const id=`pamela-${selected}-c1-ready2-01`,dir=`assets/motions/${id}`,receiptPath=`${dir}/generation.json`;
const startPath='assets/motions/pamela-p4-c1-shoe-contact-01/ready-02.png';
const startHash='8309fdadbbced3b72d84053232f8cddda8080e9df7674d76873d436935de3eb7';
const hash=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
const start=await readFile(startPath);if(hash(start)!==startHash)throw Error('READY2 anchor changed.');
if(!await stat(receiptPath).catch(()=>null)){
 if(await stat(dir).catch(()=>null))throw Error('Partial preparation exists; inspect before proceeding.');
 const planBytes=await readFile('placements/default.json'),plan=JSON.parse(planBytes.toString());validatePlan(plan);
 const intent=plan.targets[target].intent;
 if(intent.takeHand!=='LH'||intent.startSide!=='BACK'||intent.endSide!=='FRONT'||intent.pass||!intent.turn)throw Error('Saved target intent differs from requested same-LH turn.');
 const geometry=plan.targets[target].geometry.native,reference=plan.targets['P4.C1'].geometry.native;
 const nativePoints=plan.tableProjection?.mode==='flat'?flatQuad(geometry,reference,'native',plan.tableProjection.heading):quad(geometry,'native');
 const points=nativePoints.map(p=>({x:p.x*1763/1761,y:p.y}));
 const W=1764,H=1174,metadata=await sharp(start).metadata();if(metadata.width!==W||metadata.height!==H)throw Error('Unexpected start dimensions.');
 const raw=await sharp(start).removeAlpha().raw().toBuffer();
 const bounds={left:Math.floor(Math.min(...points.map(p=>p.x)))-3,right:Math.ceil(Math.max(...points.map(p=>p.x)))+3,top:Math.floor(Math.min(...points.map(p=>p.y)))-3,bottom:Math.ceil(Math.max(...points.map(p=>p.y)))+3};
 if(bounds.left<0||bounds.top<0||bounds.right>=W||bounds.bottom>=H)throw Error('Landing footprint is outside the source frame.');
 for(let y=bounds.top;y<=bounds.bottom;y++)for(let x=bounds.left;x<=bounds.right;x++){const p=(y*W+x)*3;if(raw[p+1]<raw[p]+90||raw[p+1]<raw[p+2]+90)throw Error('Landing footprint intersects photographic foreground.');}
 const overlay=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><polygon points="${points.map(p=>`${p.x},${p.y}`).join(' ')}" fill="#075ad8" stroke="#e0e4ed" stroke-width="1" stroke-linejoin="round"/></svg>`);
 const end=await sharp(raw,{raw:{width:W,height:H,channels:3}}).composite([{input:overlay}]).png().toBuffer();
 const after=await sharp(end).removeAlpha().raw().toBuffer();let changedPixels=0;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const p=(y*W+x)*3;if(!after.subarray(p,p+3).equals(raw.subarray(p,p+3))){changedPixels++;if(x<bounds.left||x>bounds.right||y<bounds.top||y>bounds.bottom)throw Error('End anchor differs outside the intended card footprint.');}}
 const destination=selected==='p4'?'straight forward to the central foreground':'across her body to the far LEFT foreground, leaning naturally without changing hands';
 const promptText=`One continuous 12-second shot, locked camera. Preserve Pamela, green studio, shoe, framing and scale. Start in READY2. Her anatomical LEFT hand (screen right) uses index and middle finger pads to slide ONE rigid card DOWN the shoe ramp and OUT through its LOW FRONT opening, yellow back visible. Pull it fully clear before lifting. With the SAME LEFT HAND, adjust to a thumb-and-finger edge grip and turn the entire card over ONCE during the reach: broad yellow narrows to a thin pale edge, then the opposite blue face opens UP before any table contact. Keep the card flat, not folded. Reach ${destination}. By 6s place it exactly at the sole blue card footprint in LAST (centre ${(geometry.u*100).toFixed(2)}% from left, ${((1-geometry.v)*100).toFixed(2)}% from top). Release all fingers and leave the blue card motionless. Return the visibly EMPTY left hand to READY2 by 9s; hold through 12s. The other hand rests and the next shoe card stays yellow. No hand transfer, colour morph, extra turn, sliding the placed card or removing it.`;
 await mkdir(dir,{recursive:true});
 await writeFile(`${dir}/end.png`,end,{flag:'wx'});await writeFile(`${dir}/placement-plan.json`,planBytes,{flag:'wx'});await writeFile(`${dir}/prompt.txt`,promptText+'\n',{flag:'wx'});
 const receipt={schemaVersion:1,id,target,createdAt:new Date().toISOString(),status:'PREPARED',provider:'Runway developer API',endpoint:'/v1/image_to_video',model:'wan3',duration:12,ratio:'auto_1080p',audio:false,estimatedCredits:240,promptText,start:{path:startPath,sha256:startHash,position:'first'},end:{path:`${dir}/end.png`,sha256:hash(end),position:'last'},placementRef:{path:`${dir}/placement-plan.json`,sha256:hash(planBytes),source:'placements/default.json',updatedAt:plan.updatedAt,plannedTarget:target},landing:{nativePoints,submittedPoints:points,coordinateMapping:'native x*(1764-1)/(1762-1); y unchanged',endAnchorMethod:'Immutable READY2 plus plan-owned blue card polygon only',changedPixels,bounds},physicalIntent:{takeHand:'LH',releaseHand:'LH',startSide:'BACK',endSide:'FRONT',turnCount:1,pass:false,returnToShoe:true},v6VideoSubmitted:false,referenceVideoSubmitted:false,intermediateImageSubmitted:false,reviewDecision:'PENDING'};
 await writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
}
const r=JSON.parse(await readFile(receiptPath,'utf8'));
if(r.id!==id||r.target!==target||r.model!=='wan3'||r.duration!==12||r.estimatedCredits!==240||r.ratio!=='auto_1080p'||r.audio!==false)throw Error('Prepared request contract changed.');
for(const f of [r.start,r.end,r.placementRef])if(hash(await readFile(f.path))!==f.sha256)throw Error('Prepared input changed.');
if(!process.argv.includes('--submit')){console.log(JSON.stringify({id,target,status:r.status,start:r.start,end:r.end,plan:r.placementRef,landing:r.landing,promptText:r.promptText,estimatedCredits:r.estimatedCredits}));process.exit(0);}
if(r.status!=='PREPARED')throw Error('Existing or uncertain task: never resubmit automatically.');
const key=process.env.RUNWAY_API_KEY;if(!key)throw Error('Load the existing dealer/.env.local credential.');
const headers={Authorization:`Bearer ${key}`,'X-Runway-Version':'2024-11-06','Content-Type':'application/json'};
const org=await fetch('https://api.dev.runwayml.com/v1/organization',{headers,signal:AbortSignal.timeout(30000)});
if(!org.ok)throw Error(`Account preflight HTTP ${org.status}`);const account=await org.json();if(account.creditBalance<r.estimatedCredits)throw Error('Insufficient developer credits for this one requested trial.');
const image=async(file:string)=>`data:image/png;base64,${(await readFile(file)).toString('base64')}`;
const body={model:r.model,duration:r.duration,ratio:r.ratio,audio:r.audio,promptText:r.promptText,promptImage:[{uri:await image(r.start.path),position:'first'},{uri:await image(r.end.path),position:'last'}]};
await writeFile(`${dir}/request.lock`,new Date().toISOString(),{flag:'wx'});r.status='SUBMITTING';r.requestedAt=new Date().toISOString();await writeFile(receiptPath,JSON.stringify(r,null,2)+'\n');
const response=await fetch('https://api.dev.runwayml.com/v1/image_to_video',{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
if(!response.ok)throw Error(`Runway HTTP ${response.status}; keep uncertain lock and inspect, no automatic retry.`);
const task=await response.json();if(typeof task.id!=='string'||!/^[a-f0-9-]{36}$/.test(task.id))throw Error('No reliable task identity returned.');
r.status='PENDING';r.taskId=task.id;await writeFile(receiptPath,JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({id,taskId:r.taskId,status:r.status,estimatedCredits:r.estimatedCredits}));
