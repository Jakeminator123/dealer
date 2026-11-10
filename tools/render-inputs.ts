import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

export type PinnedInput={path:string;sha256:string};
const digest=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');

// Pin once before workers start. Check the exact bytes used for decoding,
// including masks; a later restore of the file must not hide a changed read.
export async function pinInputs(files:Iterable<string>,resolve:(file:string)=>string):Promise<PinnedInput[]>{
 const result:PinnedInput[]=[];
 for(const file of new Set(files))result.push({path:file,sha256:digest(await readFile(resolve(file)))});
 return result;
}

export async function readPinnedInput(file:string,expected:string|undefined):Promise<Buffer>{
 if(!expected||!/^[a-f0-9]{64}$/.test(expected))throw Error(`Unpinned render input: ${file}`);
 const bytes=await readFile(file);
 if(digest(bytes)!==expected)throw Error(`Render input changed after setup: ${file}`);
 return bytes;
}
