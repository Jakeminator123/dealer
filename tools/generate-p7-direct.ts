// One P7 correction. Prepare is local; --submit can create exactly one paid task.
// Never remove request.lock, including after timeout or an uncertain response.
import sharp from 'sharp';
import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {validatePlan,flatQuad,quad} from '../src/placement-model.ts';
import type {PlacementPlan} from '../src/placement-model.ts';

const root=fileURLToPath(new URL('../',import.meta.url));
if(path.resolve(process.cwd())!==path.resolve(root))throw Error('Run from dealer checkout.');
sharp.concurrency(1);
const id='pamela-p7-c1-left-direct-pilot-01',dir=`assets/motions/${id}`;
const receiptPath=`${dir}/generation.json`;
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const promptText='Locked camera, one continuous six-second shot. Preserve the exact woman, clothes, green studio and black shoe. Her anatomical LEFT hand is on screen RIGHT and handles the card throughout. Draw ONE magenta card just clear of the shoe outlet, then immediately sweep it low diagonally toward the empty lower-RIGHT landing spot shown in the last image. The entire dealing action stays beside and in front of the shoe, on the RIGHT side of her body. While traveling outward, her left thumb and fingertips roll the card over exactly ONCE through an edge-on position: the original upper physical face ends DOWN, the original underside ends UP. This is a real 180-degree turnover, not a flat spin. Without stopping to show it, lower that same card flat at the new lower-right position, release it by 3.5 seconds, then return the empty left hand to the original shoe-ready pose by 5.3 seconds and settle. The new card stays on the table. The existing centre card stays untouched. No travel toward the centre card, no hand transfer, no display pause, no second turnover. Natural following gaze and subtle right-hand movement are allowed. Both card faces are plain magenta tracking surfaces, no print. Keep fingertip contact until release; preserve a thin rigid card, all fingers, body scale and camera framing. End with the same body, hand and gaze anchor as the first image, plus one new card on the table and the next card ready in the shoe.';

await mkdir(dir,{recursive:true});
if(!await stat(receiptPath).catch(()=>null)){
 const planSource='.runtime/public-qa/saved-flat-plan.json';
 const planBytes=await readFile(planSource);
 if(hash(planBytes)!=='a8389f0c5b588705a631102e2539a8c4079aa0e7fac16f841415fb463d5d8479')throw Error('Review changed public plan before preparing.');
 const plan=JSON.parse(planBytes.toString()) as PlacementPlan;validatePlan(plan);
 const intent=plan.targets['P7.C1'].intent;
 if(intent.takeHand!=='LH'||intent.startSide!=='BACK'||intent.endSide!=='FRONT'||intent.pass||!intent.turn)throw Error('Unexpected P7 intent.');
 const startSource='assets/motions/pamela-p7-c1-left-pink-pilot-01/start.png';
 const start=await readFile(startSource);
 if(hash(start)!=='373dc2b2a9b1415c22da6ef8f466690eaff676507c418d16956e922717193e73')throw Error('Changed source anchor.');
 const metadata=await sharp(start).metadata();
 if(metadata.width!==1764||metadata.height!==1174)throw Error('Unexpected source geometry.');
 const nativePoints=plan.tableProjection?.mode==='flat'?flatQuad(plan.targets['P7.C1'].geometry.native,plan.targets['P4.C1'].geometry.native,'native',plan.tableProjection.heading):quad(plan.targets['P7.C1'].geometry.native,'native');
 // Explicit endpoint-normalized image-space mapping. This is a planned target,
 // not measured camera calibration or an integrated V6 render transform.
 const points=nativePoints.map(p=>({x:p.x*1763/1761,y:p.y}));
 if(points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<1350||p.x>1600||p.y<870||p.y>1060))throw Error('Unexpected P7 target corridor.');
 const endpointDiagram=Buffer.from(`<svg width="1764" height="1174" xmlns="http://www.w3.org/2000/svg"><polygon points="${points.map(p=>`${p.x},${p.y}`).join(' ')}" fill="#ff00ff"/></svg>`);
 const end=await sharp(start).composite([{input:endpointDiagram}]).png().toBuffer();
 const before=await sharp(start).removeAlpha().raw().toBuffer(),after=await sharp(end).removeAlpha().raw().toBuffer();
 let changedPixels=0;
 for(let p=0;p<1764*1174;p++)if(!before.subarray(p*3,p*3+3).equals(after.subarray(p*3,p*3+3))){const x=p%1764,y=Math.floor(p/1764);if(x<Math.floor(Math.min(...points.map(p=>p.x)))-1||x>Math.ceil(Math.max(...points.map(p=>p.x)))+1||y<Math.floor(Math.min(...points.map(p=>p.y)))-1||y>Math.ceil(Math.max(...points.map(p=>p.y)))+1)throw Error('Anchor changed outside target.');changedPixels++;}
 if(changedPixels<1500||changedPixels>16000)throw Error('Unexpected endpoint area.');
 for(const [name,bytes] of [['start.png',start],['end.png',end],['placement-plan.json',planBytes]] as const)await writeFile(`${dir}/${name}`,bytes,{flag:'wx'});
 const receipt={schemaVersion:1,id,provider:'Runway developer API',endpoint:'/v1/image_to_video',model:'wan3',duration:6,ratio:'auto_1080p',audio:false,promptText,status:'PREPARED',estimatedCredits:120,createdAt:new Date().toISOString(),sourceAnchor:{path:startSource,sha256:hash(start)},start:{path:`${dir}/start.png`,sha256:hash(start)},end:{path:`${dir}/end.png`,sha256:hash(end)},placementRef:{path:`${dir}/placement-plan.json`,sha256:hash(planBytes),source:planSource,updatedAt:plan.updatedAt},plannedTarget:{id:'P7.C1',nativePoints,points,calibrated:false,mapping:{from:[1762,1174],to:[1764,1174],xScale:1763/1761,yScale:1,method:'normalized pixel endpoints; provisional source-image mapping'}},inputOverlay:{method:'deterministic geometric target diagram over preserved anchor',changedPixels,allOtherPixelsIdentical:true},physicalIntent:{takeHand:'LH',releaseHand:'LH',startSide:'BACK',endSide:'FRONT',turnCount:1,pass:false,returnAnchor:'same shoe-ready pose, new card retained'},colorDoesNotProvePhysicalSide:true,reviewDecision:'PENDING'};
 await writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
}
const receipt=JSON.parse(await readFile(receiptPath,'utf8'));
if(!process.argv.includes('--submit')){console.log(JSON.stringify({id,status:receipt.status,estimatedCredits:receipt.estimatedCredits,target:receipt.plannedTarget,start:receipt.start.path,end:receipt.end.path}));process.exit(0);}
if(receipt.status!=='PREPARED')throw Error(`Already requested or needs inspection: ${receipt.status}`);
const key=process.env.RUNWAY_API_KEY;if(!key)throw Error('Load dealer/.env.local explicitly.');
const start=await readFile(receipt.start.path),end=await readFile(receipt.end.path);
if(hash(start)!==receipt.start.sha256||hash(end)!==receipt.end.sha256||hash(await readFile(receipt.placementRef.path))!==receipt.placementRef.sha256||receipt.promptText!==promptText)throw Error('Prepared input changed.');
await writeFile(`${dir}/request.lock`,new Date().toISOString(),{flag:'wx'});
receipt.status='SUBMITTING';receipt.requestedAt=new Date().toISOString();
await writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n');
const body={model:receipt.model,promptText:receipt.promptText,duration:receipt.duration,ratio:receipt.ratio,audio:false,promptImage:[{uri:`data:image/png;base64,${start.toString('base64')}`,position:'first'},{uri:`data:image/png;base64,${end.toString('base64')}`,position:'last'}]};
const response=await fetch('https://api.dev.runwayml.com/v1/image_to_video',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','X-Runway-Version':'2024-11-06'},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
if(!response.ok)throw Error(`Runway HTTP ${response.status}; inspect before any retry.`);
const task=await response.json();if(typeof task.id!=='string')throw Error('Missing task ID; inspect before retry.');
receipt.status='PENDING';receipt.taskId=task.id;await writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({id,taskId:task.id,status:receipt.status,estimatedCredits:receipt.estimatedCredits}));
