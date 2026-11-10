// Explicitly requested color/motion controls: byte-identical historic P4.C1
// anchors and prompt. Prepare is local; --submit creates at most one paid task.
import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

if(path.resolve(process.cwd())!==path.resolve(fileURLToPath(new URL('../',import.meta.url))))throw Error('Run from the dealer checkout.');
const kling=process.argv.includes('--kling');
const id=kling?'pamela-p4-c1-kling-control-01':'pamela-p4-c1-color-control-01',dir=`assets/motions/${id}`,receiptPath=`${dir}/generation.json`;
const archive='D:/dealer-archive/snyggare-dealer/runs/20261110-pamela-goal-pilot/center-arc-01/p4-c1';
const sources=[
 {name:'start.png',sha256:'a2fc6d3565ca711015c9b547671bf33e97eea4c2281e75841690f8848b422f45'},
 {name:'end.png',sha256:'c30be996971282c737825a9439e3d303728086c391d8bbb14a67a8fc826e784b'},
 {name:'plan.json',sha256:'dc3d88069afeb232f6ed5b388b29a39f051c9d7303167d8ead477ba880d4f6fe'},
 {name:'prompt.txt',sha256:'1e5c0abca098d18083f2f558c7ab2c50064e7d051a2842cf721dac122973648d'}
];
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
await mkdir(dir,{recursive:true});
if(!await stat(receiptPath).catch(()=>null)){
 const imported=[];
 for(const source of sources){
  const bytes=await readFile(`${archive}/${source.name}`);
  if(hash(bytes)!==source.sha256)throw Error(`Historic input changed: ${source.name}`);
  const target=`${dir}/${source.name}`;
  if(await stat(target).catch(()=>null)){if(hash(await readFile(target))!==source.sha256)throw Error(`Local input changed: ${source.name}`);}
  else await writeFile(target,bytes,{flag:'wx'});
  imported.push({...source,source:`${archive}/${source.name}`,path:target,bytes:bytes.length});
 }
 const promptText=(await readFile(`${dir}/prompt.txt`,'utf8')).trim();
 const plan=JSON.parse(await readFile(`${dir}/plan.json`,'utf8'));
 if(plan.promptText && plan.promptText!==promptText)throw Error('Historic prompt mismatch.');
 const receipt={schemaVersion:1,id,provider:'Runway developer API',endpoint:'/v1/image_to_video',model:kling?'kling3.0_pro':'wan3',duration:4,ratio:kling?null:'auto_1080p',audio:false,promptText,status:'PREPARED',estimatedCredits:kling?48:80,createdAt:new Date().toISOString(),start:imported[0],end:imported[1],registeredArchiveReads:imported,placementRef:{path:`${dir}/plan.json`,sha256:sources[2].sha256,basis:'Exact historic P4.C1 control; not the current editable placement draft'},physicalIntent:{takeHand:'LH',releaseHand:'LH',startSide:'BACK',endSide:'FRONT',turnCount:1,pass:false,terminalPose:'fingers clear after landing; return to shoe is a separate forward segment'},colorConvention:{BACK:'yellow',FRONT:'blue',pink:'separate material tracking surface, unused in this control'},colorDoesNotProvePhysicalSide:true,postProcessing:'none; inspect the unmodified generated original',reviewDecision:'PENDING'};
 await writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
}
const receipt=JSON.parse(await readFile(receiptPath,'utf8'));
for(const input of receipt.registeredArchiveReads)if(hash(await readFile(input.path))!==input.sha256)throw Error(`Prepared input changed: ${input.name}`);
if(receipt.promptText!==(await readFile(`${dir}/prompt.txt`,'utf8')).trim())throw Error('Prepared prompt changed.');
if(receipt.model!==(kling?'kling3.0_pro':'wan3')||receipt.duration!==4||receipt.audio!==false||receipt.ratio!==(kling?null:'auto_1080p'))throw Error('Prepared provider parameters changed.');
if(!process.argv.includes('--submit')){console.log(JSON.stringify({id,status:receipt.status,estimatedCredits:receipt.estimatedCredits,start:receipt.start.path,end:receipt.end.path,prompt:`${dir}/prompt.txt`}));process.exit(0);}
if(receipt.status!=='PREPARED')throw Error(`Already requested or uncertain: ${receipt.status}. Inspect; never remove request.lock to retry.`);
const key=process.env.RUNWAY_API_KEY;if(!key)throw Error('Load dealer/.env.local explicitly.');
await writeFile(`${dir}/request.lock`,new Date().toISOString(),{flag:'wx'});
receipt.status='SUBMITTING';receipt.requestedAt=new Date().toISOString();
await writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n');
const start=await readFile(receipt.start.path),end=await readFile(receipt.end.path);
const body={model:receipt.model,promptText:receipt.promptText,duration:4,...(kling?{}:{ratio:'auto_1080p'}),audio:false,promptImage:[{uri:`data:image/png;base64,${start.toString('base64')}`,position:'first'},{uri:`data:image/png;base64,${end.toString('base64')}`,position:'last'}]};
const response=await fetch('https://api.dev.runwayml.com/v1/image_to_video',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','X-Runway-Version':'2024-11-06'},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
if(!response.ok)throw Error(`Runway HTTP ${response.status}; inspect before any retry.`);
const task=await response.json();if(typeof task.id!=='string'||!/^[a-f0-9-]{36}$/.test(task.id))throw Error('Missing task identity; inspect before any retry.');
receipt.status='PENDING';receipt.taskId=task.id;
await writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({id,taskId:task.id,status:receipt.status,estimatedCredits:receipt.estimatedCredits}));
