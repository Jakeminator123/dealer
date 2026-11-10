import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {inspectBlob,inspectDocument,parsePush,dirtyTestInputs,scanRange} from './publication-check.ts';

function fixture(t:TestContext){
  const root=mkdtempSync(path.join(tmpdir(),'dealer-publication-test-'));
  t.after(()=>{assert.equal(path.dirname(root),path.resolve(tmpdir()));assert.ok(path.basename(root).startsWith('dealer-publication-test-'));rmSync(root,{recursive:true,force:true});});
  const env={...process.env};for(const key of ['GIT_DIR','GIT_WORK_TREE','GIT_INDEX_FILE','GIT_COMMON_DIR','GIT_OBJECT_DIRECTORY','GIT_ALTERNATE_OBJECT_DIRECTORIES'])delete env[key];
  const git=(...args:string[])=>execFileSync('git',args,{cwd:root,env,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git('init');git('config','user.name','Publication test');git('config','user.email','test@example.invalid');git('config','core.hooksPath',path.join(root,'no-hooks'));
  const commit=(name:string,text:string)=>{mkdirSync(path.dirname(path.join(root,name)),{recursive:true});writeFileSync(path.join(root,name),text);git('add','--',name);git('commit','-m','Fixture');return git('rev-parse','HEAD');};
  return {root,git,commit};
}

test('private paths, media and token-like values block without exposing the value',()=>{
  for(const name of ['assets/source.png','output/movie.mp4','.env.local','nested/.env.secret','private/info.json','nested/node_modules/module.js','.runtime/log.json'])assert.ok(inspectBlob(name,Buffer.from('{}')).some(f=>f.level==='RED'),name);
  const token='gh'+'p_'+'x'.repeat(30);
  const result=inspectBlob('src/client.ts',Buffer.from('const value="'+token+'"'));
  assert.ok(result.some(f=>f.level==='RED'));assert.ok(!JSON.stringify(result).includes(token));
  assert.deepEqual(inspectBlob('src/client.ts',Buffer.from('const key = process.env.RUNWAY_API_KEY;')),[]);
});

test('documentation warnings remain warnings; user placement drafts are not test inputs',()=>{
  assert.equal(inspectDocument('docs/DRIFT.md','line\n'.repeat(151))[0].level,'YELLOW');
  assert.equal(inspectDocument('docs/new-plan.md','# Plan')[0].level,'YELLOW');
  assert.deepEqual(inspectDocument('docs/DRIFT.md','# Drift'),[]);
  assert.deepEqual(dirtyTestInputs(['placements/default.json','HANDOFF.md']),[]);
  assert.deepEqual(dirtyTestInputs(['src/lab-ui.ts','package-lock.json','placements/default.json']),['src/lab-ui.ts','package-lock.json']);
});

test('pre-push parses new branches and multiple refs; deletion adds no objects',()=>{
  const a='a'.repeat(40),b='b'.repeat(40),z='0'.repeat(40);
  assert.deepEqual(parsePush(`refs/heads/a ${a} refs/heads/a ${z}\nrefs/heads/b ${b} refs/heads/b ${a}`),[{local:a,remote:z},{local:b,remote:a}]);
  assert.deepEqual(parsePush(`(delete) ${z} refs/heads/a ${a}`),[]);
  assert.throws(()=>parsePush('bad input'));
});

test('a secret removed in the last commit is still detected in the push interval',t=>{
  const f=fixture(t),base=f.commit('README.md','# Fixture');
  f.commit('src/config.ts','const key="'+'gh'+'p_'+'q'.repeat(30)+'";');
  const head=f.commit('src/config.ts','const key=process.env.API_KEY;');
  assert.ok(scanRange(f.root,head,base).some(x=>x.level==='RED'&&x.path==='src/config.ts'));
});

test('a forbidden alias of an existing blob is caught even after that alias is removed',t=>{
  const f=fixture(t),base=f.commit('safe.json','{}');
  f.commit('.env.local','{}');f.git('rm','.env.local');f.git('commit','-m','Remove alias');
  assert.ok(scanRange(f.root,f.git('rev-parse','HEAD'),base).some(x=>x.level==='RED'&&x.path==='.env.local'));
  assert.deepEqual(scanRange(f.root,base,''),[]);
});

test('a hook inherited GIT_DIR cannot redirect an explicit repository scan',t=>{
  const f=fixture(t),base=f.commit('README.md','# Fixture');
  const head=f.commit('output/should-stay-local.json','{}');
  const previous=process.env.GIT_DIR;
  try{
    process.env.GIT_DIR=path.resolve('.git');
    assert.ok(scanRange(f.root,head,base).some(x=>x.path==='output/should-stay-local.json'&&x.level==='RED'));
  }finally{
    if(previous===undefined)delete process.env.GIT_DIR;else process.env.GIT_DIR=previous;
  }
});
