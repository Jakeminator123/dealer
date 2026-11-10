import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { defaultPlan, validatePlan } from '../src/placement-model.ts';
export class StoreError extends Error { status: number; constructor(status:number,message:string){super(message);this.status=status;} }
export function placementStore(root: string) {
 const file=path.join(root,'placements/default.json');let queue=Promise.resolve();
 const revision=(text:string)=>'"'+createHash('sha256').update(text).digest('hex')+'"';
 async function load(){let text:string;try{text=await readFile(file,'utf8');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;text=JSON.stringify(defaultPlan(),null,2)+'\n';}const plan:unknown=JSON.parse(text);validatePlan(plan);return {plan,revision:revision(text)};}
 async function save(value:unknown,expected:string|undefined){
  validatePlan(value);const plan=structuredClone(value);
  const task=queue.then(async()=>{const before=await load();if(!expected)throw new StoreError(428,'Läs placeringarna innan du sparar.');if(before.revision!==expected)throw new StoreError(409,'Placeringarna har ändrats i en annan flik. Exportera ditt utkast och läs sedan in senaste.');
   plan.updatedAt=new Date().toISOString();const text=JSON.stringify(plan,null,2)+'\n';await mkdir(path.dirname(file),{recursive:true});await mkdir(path.join(root,'.runtime'),{recursive:true});await writeFile(path.join(root,'.runtime/placement-previous.json'),JSON.stringify(before.plan,null,2)+'\n');
   const temporary=path.join(root,'placements',`.${randomUUID()}.tmp`);await writeFile(temporary,text,{flag:'wx'});await rename(temporary,file);return {plan,revision:revision(text)};});
  queue=task.then(()=>{},()=>{});return task;
 }
 return {load,save};
}
