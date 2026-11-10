// Read status/download for existing experiments only. This tool cannot submit
// a paid generation. Full prompts and input hashes remain in generation.json.
import {readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
if(path.resolve(process.cwd())!==path.resolve(fileURLToPath(new URL('../',import.meta.url))))throw Error('Run from the dealer checkout.');
const ids:Record<string,string>={p6:'pamela-p6-c1-left-turn-pilot-01','p7-1':'pamela-p7-c1-left-turn-pilot-01','p7-2':'pamela-p7-c1-left-turn-pilot-02','p7-pink':'pamela-p7-c1-left-pink-pilot-01','p7-direct':'pamela-p7-c1-left-direct-pilot-01'};
const id=ids[process.argv[2]];
if(!id)throw Error('Choose existing experiment: p6, p7-1, p7-2, p7-pink or p7-direct. No new job is submitted.');
const directory=`assets/motions/${id}`,receiptPath=`${directory}/generation.json`;
const receipt=JSON.parse(await readFile(receiptPath,'utf8'));
if(!/^[a-f0-9-]{36}$/.test(receipt.taskId))throw Error('Missing task identity.');
const key=process.env.RUNWAY_API_KEY;if(!key)throw Error('Use node --env-file=.env.local tools/collect-pilot.ts <experiment>.');
const response=await fetch(`https://api.dev.runwayml.com/v1/tasks/${receipt.taskId}`,{headers:{Authorization:`Bearer ${key}`,'X-Runway-Version':'2024-11-06'},signal:AbortSignal.timeout(30000)});
if(!response.ok)throw Error(`Runway status HTTP ${response.status}`);
const task=await response.json();console.log(JSON.stringify({taskId:receipt.taskId,status:task.status,progress:task.progress}));
const checked={...receipt,status:task.status,lastCheckedAt:new Date().toISOString(),progress:task.progress};
if(task.status==='SUCCEEDED'){
 const file=`${directory}/source.mp4`;
 if(!await stat(file).catch(()=>null)){
  if(typeof task.output?.[0]!=='string'||!task.output[0].startsWith('https://'))throw Error('Missing HTTPS video output.');
  const download=await fetch(task.output[0]);if(!download.ok)throw Error(`Output HTTP ${download.status}`);
  await writeFile(file,Buffer.from(await download.arrayBuffer()),{flag:'wx'});
 }
 const bytes=await readFile(file),sha256=createHash('sha256').update(bytes).digest('hex');
 if(receipt.output?.sha256&&receipt.output.sha256!==sha256)throw Error('Existing output does not match recorded hash.');
 await writeFile(receiptPath,JSON.stringify({...checked,completedAt:receipt.completedAt??checked.lastCheckedAt,output:{path:file,sha256,bytes:bytes.length}},null,2)+'\n');
 console.log(JSON.stringify({file,bytes:bytes.length,sha256}));
}else{
 await writeFile(receiptPath,JSON.stringify(checked,null,2)+'\n');
 if(task.status==='FAILED'||task.status==='CANCELLED')process.exitCode=1;
}
