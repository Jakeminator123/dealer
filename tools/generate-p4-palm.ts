// User-requested corrected palm-up end-anchor trial. One explicit paid request.
import {readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {validatePlan} from '../src/placement-model.ts';
if(path.resolve(process.cwd())!==path.resolve(fileURLToPath(new URL('../',import.meta.url))))throw Error('Run from dealer checkout.');
const id='pamela-p4-c1-palm-up-01',dir=`assets/motions/${id}`,receiptPath=`${dir}/generation.json`;
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const promptText='One continuous six-second shot, fixed camera. Same Pamela and green studio. Her LEFT hand, on screen RIGHT, pinches one card at the shoe, yellow back facing up. Pull it clear. Keeping the SAME grip, tip the card upright so its thin edge faces the camera, then turn her left forearm PALM UP. The yellow side rotates downward and the opposite blue side rotates upward through that visible edge position. Carry the card on the palm-up fingertips to the blue footprint in the final image. Lower the blue face-up card onto the table, then slide the supporting fingers out from UNDER it. Finish with the EMPTY OPEN LEFT PALM visible beside the card, exactly as in the final image. Keep the palm up after release. The right hand rests. The next shoe card stays yellow. One rigid card and one physical turnover; no hand transfer, flat spin, colour morph or second turnover. No return to the shoe in this shot.';
const inputs=JSON.parse(await readFile(`${dir}/inputs.json`,'utf8'));
for(const file of [inputs.start,inputs.end,inputs.placementRef])if(hash(await readFile(file.path))!==file.sha256)throw Error('Prepared input hash changed');
const plan=JSON.parse(await readFile(inputs.placementRef.path,'utf8'));validatePlan(plan);
if(plan.targets['P4.C1'].intent.takeHand!=='LH'||plan.targets['P4.C1'].intent.startSide!=='BACK'||plan.targets['P4.C1'].intent.endSide!=='FRONT'||plan.targets['P4.C1'].intent.pass)throw Error('Frozen P4 intent mismatch');
if(!await stat(receiptPath).catch(()=>null))await writeFile(receiptPath,JSON.stringify({schemaVersion:1,id,createdAt:new Date().toISOString(),provider:'Runway developer API',endpoint:'/v1/image_to_video',model:'wan3',duration:6,ratio:'auto_1080p',audio:false,estimatedCredits:120,promptText,status:'PREPARED',...inputs,physicalIntent:{takeHand:'LH',releaseHand:'LH',startSide:'BACK',endSide:'FRONT',pass:false,turnCount:1,finalPalm:'UP_AND_VISIBLE',returnToShoe:false},v6VideoSubmitted:false,referenceVideoSubmitted:false,intermediateImageSubmitted:false,reviewDecision:'PENDING'},null,2)+'\n',{flag:'wx'});
const r=JSON.parse(await readFile(receiptPath,'utf8'));
if(r.promptText!==promptText||r.model!=='wan3'||r.duration!==6||r.ratio!=='auto_1080p'||r.audio!==false)throw Error('Prepared parameters changed');
if(!process.argv.includes('--submit')){console.log(JSON.stringify({id,status:r.status,start:r.start.path,end:r.end.path,promptText,estimatedCredits:r.estimatedCredits}));process.exit(0);}
if(r.status!=='PREPARED')throw Error(`Existing or uncertain request:${r.status}; never retry automatically`);
const key=process.env.RUNWAY_API_KEY;if(!key)throw Error('Load only dealer/.env.local');
const image=async(file:string)=>`data:image/png;base64,${(await readFile(file)).toString('base64')}`;
const body={model:'wan3',duration:6,ratio:'auto_1080p',audio:false,promptText,promptImage:[{uri:await image(r.start.path),position:'first'},{uri:await image(r.end.path),position:'last'}]};
await writeFile(`${dir}/request.lock`,new Date().toISOString(),{flag:'wx'});
r.status='SUBMITTING';r.requestedAt=new Date().toISOString();await writeFile(receiptPath,JSON.stringify(r,null,2)+'\n');
const response=await fetch('https://api.dev.runwayml.com/v1/image_to_video',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','X-Runway-Version':'2024-11-06'},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
if(!response.ok)throw Error(`Runway HTTP${response.status}; retain uncertain lock and inspect before retry`);
const task=await response.json();if(typeof task.id!=='string'||!/^[a-f0-9-]{36}$/.test(task.id))throw Error('Missing task identity');
r.status='PENDING';r.taskId=task.id;await writeFile(receiptPath,JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({id,taskId:r.taskId,status:r.status,estimatedCredits:r.estimatedCredits}));
