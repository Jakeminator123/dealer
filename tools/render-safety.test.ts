import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {loadPamelaMesh} from '../src/pamela-card-mesh.ts';
import {createPamelaCardContactV6Renderer} from '../src/pamela-card-contact-v6.ts';
import {PAMELA_CARD_SOURCE_SHA256} from '../src/pamela-card-surfaces.ts';
import {pinInputs,readPinnedInput} from './render-inputs.ts';

async function temporary(t:TestContext){
 const dir=await mkdtemp(path.join(tmpdir(),'dealer-render-test-'));
 t.after(async()=>{
  assert.equal(path.dirname(dir),path.resolve(tmpdir()));
  assert.ok(path.basename(dir).startsWith('dealer-render-test-'));
  await rm(dir,{recursive:true,force:true});
 });
 return dir;
}
const sample=()=>({sourceSha256:PAMELA_CARD_SOURCE_SHA256,frames:[
 {sourceFrame:10,side:'BACK',sections:[{v:0,left:[10,10],right:[20,10]},{v:1,left:[10,20],right:[20,20]}]},
 {sourceFrame:12,side:'FRONT',sections:[{v:0,left:[12,10],right:[22,10]},{v:1,left:[12,20],right:[22,20]}]},
]});

test('mesh rejects unknown sides, invalid frames and malformed coordinates before rendering',async t=>{
 const dir=await temporary(t),file=path.join(dir,'mesh.json');
 const invalid:((value:ReturnType<typeof sample>)=>void)[]=[
  value=>{value.frames[0].side='UNKNOWN';},
  value=>{value.frames[0].sourceFrame=-1;},
  value=>{value.frames[0].sourceFrame=180;},
  value=>{value.frames[0].sourceFrame=10.5;},
  value=>{value.frames[1].sourceFrame=10;},
  value=>{value.frames[0].sections[0].left=[NaN,0];},
  value=>{value.frames[0].sections[1].v=0;},
 ];
 for(const mutate of invalid){const value=sample();mutate(value);await writeFile(file,JSON.stringify(value));await assert.rejects(loadPamelaMesh(file));}
 await writeFile(file,JSON.stringify(sample()));
 const mesh=await loadPamelaMesh(file);
 assert.equal(mesh(10)?.side,'BACK');assert.equal(mesh(11)?.side,'BACK');assert.equal(mesh(12)?.side,'FRONT');
 assert.deepEqual(mesh(11)?.sections[0].left,[11,10]);
 assert.throws(()=>mesh(-1));assert.throws(()=>mesh(NaN));
});

test('renderer reads only the requested asset root and never falls back to live files',async t=>{
 const dir=await temporary(t);
 await assert.rejects(createPamelaCardContactV6Renderer(undefined,dir),/ENOENT/);
 await mkdir(path.join(dir,'assets/tracking'),{recursive:true});
 await writeFile(path.join(dir,'assets/tracking/card-mesh.json'),JSON.stringify(sample()));
 await writeFile(path.join(dir,'assets/tracking/nail-guards.json'),JSON.stringify({sourceSha256:'wrong',frames:[]}));
 await assert.rejects(createPamelaCardContactV6Renderer(undefined,dir),/Nail guard source mismatch/);
});

test('a temporary source or mask change is rejected at the actual read, even if later restored',async t=>{
 const dir=await temporary(t),file=path.join(dir,'mask.png'),original=Buffer.from('original mask bytes');
 await writeFile(file,original);
 const pinned=await pinInputs(['mask.png','mask.png'],name=>path.join(dir,name));
 assert.equal(pinned.length,1);
 const bytes=await readPinnedInput(file,pinned[0].sha256);
 await writeFile(file,'temporary altered bytes');
 await assert.rejects(readPinnedInput(file,pinned[0].sha256),/changed after setup/);
 await writeFile(file,original);
 assert.deepEqual(bytes,original);
 assert.deepEqual(await readPinnedInput(file,pinned[0].sha256),await readFile(file));
 await assert.rejects(readPinnedInput(file,undefined),/Unpinned/);
});
