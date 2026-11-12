// Presets of the 3D scene for the studio's Scen view: data/scene-presets/<name>.json, one look each (studio/lib/scene-presets.ts
// says what a preset is, studio/lib/scene-keys.ts what every key may hold). The lab server (tools/preview.ts, /api/scene-presets)
// reads them for its pages and writes Jakob's own on his click. Like the placement store: every write is checked against the
// catalogue, made against the revision the page last read (If-Match), queued, and written to a temporary file that is renamed
// into place. The three that ship with the lab (basgrund, levande, rumsstudien) are read-only here. A room must be one the
// scene has: a built room or an entry of data/scene-rooms.json.
import {readFile, readdir, writeFile, mkdir, rename, unlink} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import path from 'node:path';
import {StoreError} from './placement-store.ts';
import {BUILT_ROOMS} from '../studio/lib/scene-keys.ts';
import {OWN_LIMIT, PRESET_NAME, NAME_LIMIT, SHIPPED_NAMES, isShipped, validatePreset, type ScenePreset} from '../studio/lib/scene-presets.ts';

export type StoredPreset = ScenePreset & {shipped: boolean; revision: string};

export function scenePresetStore(root: string) {
 const dir=path.join(root,'data/scene-presets');let queue=Promise.resolve();
 const revision=(text:string)=>'"'+createHash('sha256').update(text).digest('hex')+'"';
 const fileOf=(name:string)=>{if(!PRESET_NAME.test(name)||name.length>NAME_LIMIT)throw new StoreError(400,'Namnet får bara ha a–z, 0–9 och bindestreck.');return path.join(dir,name+'.json');};
 // The rooms the scene has: the built ones and every entry of the register that has an id (the scene leaves out a broken entry; a preset naming it falls back to the salon there).
 const rooms=async()=>{let ids:string[]=[];try{const list=JSON.parse(await readFile(path.join(root,'data/scene-rooms.json'),'utf8'))?.rooms;if(Array.isArray(list))ids=list.map((r:{id?:unknown})=>r?.id).filter((id:unknown):id is string=>typeof id==='string');}catch{}return [...BUILT_ROOMS.map(r=>r.value),...ids];};
 const readText=async(name:string)=>{try{return await readFile(fileOf(name),'utf8');}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}};
 // A file as the pages get it. A file that does not hold up is an error of the lab, not of the page.
 function parse(name:string,text:string,known:string[]):StoredPreset{
  let value:unknown;try{value=JSON.parse(text);}catch{throw new StoreError(500,`Förvalet ${name} är inte giltig JSON.`);}
  const {preset,errors}=validatePreset(value,name,known);if(!preset)throw new StoreError(500,`Förvalet ${name} håller inte: ${errors.join('; ')}.`);
  const updatedAt=typeof (value as {updatedAt?:unknown}).updatedAt==='string'?(value as {updatedAt:string}).updatedAt:'';
  return {...preset,updatedAt,shipped:isShipped(name),revision:revision(text)};
 }
 /** Every preset: the shipped ones in their order, then his own, newest first. A file that does not hold up is named in problems. */
 async function list(){
  const known=await rooms(),presets:StoredPreset[]=[],problems:string[]=[];
  const names=(await readdir(dir).catch(()=>[] as string[])).filter(file=>file.endsWith('.json')).map(file=>file.slice(0,-5)).filter(name=>PRESET_NAME.test(name)&&name.length<=NAME_LIMIT);
  for(const name of names){const text=await readText(name);if(text===null)continue;try{presets.push(parse(name,text,known));}catch(error){problems.push((error as Error).message);}}
  const order=(p:StoredPreset)=>p.shipped?SHIPPED_NAMES.indexOf(p.name):SHIPPED_NAMES.length;
  presets.sort((a,b)=>order(a)-order(b)||b.updatedAt.localeCompare(a.updatedAt)||a.name.localeCompare(b.name));
  return {schemaVersion:1 as const,presets,problems};
 }
 async function load(name:string){const text=await readText(name);if(text===null)throw new StoreError(404,'Det finns inget förval med det namnet.');return {preset:parse(name,text,await rooms())};}
 /**
  * Saves his preset. A new name is written without If-Match; an existing one only against the revision last read. The answer
  * is the preset as kept, with its new revision.
  */
 async function save(name:string,value:unknown,expected:string|undefined){
  const file=fileOf(name);
  if(isShipped(name))throw new StoreError(403,'Förvalet följer med labbet och kan inte skrivas över. Spara under ett eget namn.');
  const {preset,errors}=validatePreset(value,name,await rooms());
  if(!preset)throw new StoreError(400,`Förvalet håller inte: ${errors.join('; ')}.`);
  const task=queue.then(async()=>{
   const before=await readText(name);
   if(before!==null&&!expected)throw new StoreError(428,'Det finns redan ett förval med det namnet. Läs det innan du sparar över det.');
   if(before!==null&&revision(before)!==expected)throw new StoreError(409,'Förvalet har ändrats i en annan flik. Läs in det igen.');
   if(before===null&&expected)throw new StoreError(409,'Förvalet finns inte längre. Spara det som nytt.');
   if(before===null&&(await list()).presets.filter(p=>!p.shipped).length>=OWN_LIMIT)throw new StoreError(409,`Det finns redan ${OWN_LIMIT} egna förval. Ta bort något först.`);
   const kept:ScenePreset={...preset,updatedAt:new Date().toISOString()},text=JSON.stringify(kept,null,2)+'\n';
   await mkdir(dir,{recursive:true});const temporary=path.join(dir,`.${randomUUID()}.tmp`);await writeFile(temporary,text,{flag:'wx'});await rename(temporary,file);
   return {preset:{...kept,shipped:false,revision:revision(text)}};
  });
  queue=task.then(()=>{},()=>{});return task;
 }
 /** Takes away one of his presets, against the revision last read. */
 async function remove(name:string,expected:string|undefined){
  const file=fileOf(name);
  if(isShipped(name))throw new StoreError(403,'Förvalet följer med labbet och kan inte tas bort.');
  const task=queue.then(async()=>{
   const before=await readText(name);
   if(before===null)throw new StoreError(404,'Det finns inget förval med det namnet.');
   if(!expected)throw new StoreError(428,'Läs förvalet innan du tar bort det.');
   if(revision(before)!==expected)throw new StoreError(409,'Förvalet har ändrats i en annan flik. Läs in det igen.');
   await unlink(file);return {name,removed:true};
  });
  queue=task.then(()=>{},()=>{});return task;
 }
 return {list,load,save,remove};
}
