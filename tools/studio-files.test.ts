import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {resolveStudio} from './studio-files.ts';

// A built studio in miniature, and a file beside it that must never be handed out.
const built=async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'dealer-studio-')),out=path.join(root,'out');
 await mkdir(path.join(out,'karta'),{recursive:true});await mkdir(path.join(out,'_next/static/chunks'),{recursive:true});
 await writeFile(path.join(out,'index.html'),'<p>start</p>');await writeFile(path.join(out,'karta/index.html'),'<p>karta</p>');
 await writeFile(path.join(out,'_next/static/chunks/a_1.js'),'1');await writeFile(path.join(out,'index.txt'),'rsc');
 await writeFile(path.join(out,'notes.md'),'not a kind of file a built studio has');await writeFile(path.join(root,'secret.txt'),'outside');
 return {root,out};
};

test('pages and their files are found, a folder by its index page',async()=>{
 const {root,out}=await built();
 try{
  const start=await resolveStudio('/studio/',out);
  assert.equal(start.kind,'file');assert.equal(start.kind==='file'&&start.type,'text/html; charset=utf-8');assert.ok(start.kind==='file'&&start.file.endsWith('index.html'));
  const page=await resolveStudio('/studio/karta/',out);
  assert.ok(page.kind==='file'&&page.file.endsWith(path.join('karta','index.html')));
  const chunk=await resolveStudio('/studio/_next/static/chunks/a_1.js',out);
  assert.equal(chunk.kind==='file'&&chunk.type,'text/javascript; charset=utf-8');
  assert.equal((await resolveStudio('/studio/index.txt',out)).kind,'file');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('an address without its closing slash is sent to the one with it',async()=>{
 const {root,out}=await built();
 try{
  assert.deepEqual(await resolveStudio('/studio',out),{kind:'redirect',to:'/studio/'});
  assert.deepEqual(await resolveStudio('/studio/karta',out),{kind:'redirect',to:'/studio/karta/'});
 }finally{await rm(root,{recursive:true,force:true});}
});

test('nothing outside the built folder, and no other kind of file, is handed out',async()=>{
 const {root,out}=await built();
 try{
  for(const address of ['/studio/../secret.txt','/studio/%2e%2e/secret.txt','/studio/karta/..%2f..%2fsecret.txt','/studio/..\\secret.txt','/studio/%5c..%5csecret.txt','/studio//etc/passwd','/studio/C:/Windows/win.ini','/studio/%00','/studio/%','/studio/missing.js','/studio/notes.md','/studiox/index.html','/lab.html'])
   assert.equal((await resolveStudio(address,out)).kind,'none',address);
  // A link inside the folder that leads out of it is not followed (where the system lets a test make one).
  const made=await symlink(path.join(root,'secret.txt'),path.join(out,'leak.txt')).then(()=>true,()=>false);
  if(made)assert.equal((await resolveStudio('/studio/leak.txt',out)).kind,'none');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('a studio that has not been built says so',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'dealer-studio-'));
 try{
  assert.deepEqual(await resolveStudio('/studio/',path.join(root,'out')),{kind:'unbuilt'});
  await mkdir(path.join(root,'out'));
  assert.deepEqual(await resolveStudio('/studio/karta/',path.join(root,'out')),{kind:'unbuilt'});
 }finally{await rm(root,{recursive:true,force:true});}
});
