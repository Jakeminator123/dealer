import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const digest=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(await readFile('data/manifest.json','utf8')); // its paths are relative to the repo root
// An entry with `archived` has left the project for that archive (V6, Jakob's yes 2026-11-20); its hash still names the file there.
const here=manifest.files.filter((f:{archived?:string})=>!f.archived);
for(const file of here){
 const resolved=path.resolve(file.path);
 if(!resolved.startsWith(process.cwd()+path.sep))throw Error('Nonlocal input: '+file.path);
 if(digest(await readFile(resolved))!==file.sha256)throw Error('Changed input: '+file.path);
}
console.log(`Verified ${here.length} registered local files (${manifest.files.length-here.length} archived).`);
