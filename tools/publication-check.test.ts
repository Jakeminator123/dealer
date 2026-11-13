import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,mkdirSync,rmSync,readFileSync,readdirSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {inspectBlob,parsePush,dirtyTestInputs,scanRange,TESTS,CANONICAL} from './publication-check.ts';

function fixture(t:TestContext){
  const root=mkdtempSync(path.join(tmpdir(),'dealer-publication-test-'));
  t.after(()=>{assert.equal(path.dirname(root),path.resolve(tmpdir()));assert.ok(path.basename(root).startsWith('dealer-publication-test-'));rmSync(root,{recursive:true,force:true});});
  const env={...process.env};for(const key of ['GIT_DIR','GIT_WORK_TREE','GIT_INDEX_FILE','GIT_COMMON_DIR','GIT_OBJECT_DIRECTORY','GIT_ALTERNATE_OBJECT_DIRECTORIES'])delete env[key];
  const git=(...args:string[])=>execFileSync('git',args,{cwd:root,env,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git('init');git('config','user.name','Publication test');git('config','user.email','test@example.invalid');git('config','core.hooksPath',path.join(root,'no-hooks'));
  // add -f: the fixture commits names that a machine's own ignore rules may hold back (.env.local in a global excludes
  // file, as in an outside sandbox); what is tested is the scan of the history, not what git add lets through.
  const commit=(name:string,text:string)=>{mkdirSync(path.dirname(path.join(root,name)),{recursive:true});writeFileSync(path.join(root,name),text);git('add','-f','--',name);git('commit','-m','Fixture');return git('rev-parse','HEAD');};
  return {root,git,commit};
}

test('private paths, media and token-like values block without exposing the value',()=>{
  for(const name of ['assets/source.png','output/movie.mp4','.env.local','nested/.env.secret','private/info.json','nested/node_modules/module.js','.runtime/log.json'])assert.ok(inspectBlob(name,Buffer.from('{}')).some(f=>f.level==='RED'),name);
  const token='gh'+'p_'+'x'.repeat(30);
  const result=inspectBlob('src/client.ts',Buffer.from('const value="'+token+'"'));
  assert.ok(result.some(f=>f.level==='RED'));assert.ok(!JSON.stringify(result).includes(token));
  assert.deepEqual(inspectBlob('src/client.ts',Buffer.from('const key = process.env.RUNWAY_API_KEY;')),[]);
});

test('documents are not measured: a long document or a new page under docs/ gives no finding',t=>{
  const f=fixture(t),base=f.commit('README.md','# Fixture');
  f.commit('docs/DRIFT.md','line\n'.repeat(400));
  const head=f.commit('docs/new-subject.md','# A new subject');
  assert.deepEqual(scanRange(f.root,head,base),[]);
});

test('the canonical documents, whose absence stops a push, are all in the repository',()=>{
  assert.deepEqual(CANONICAL.filter(name=>!existsSync(name)),[]);
});

test('user placement drafts are not test inputs',()=>{
  assert.deepEqual(dirtyTestInputs(['placements/default.json','HANDOFF.md']),[]);
  assert.deepEqual(dirtyTestInputs(['src/lab-ui.ts','package-lock.json','placements/default.json']),['src/lab-ui.ts','package-lock.json']);
  assert.deepEqual(dirtyTestInputs(['studio/app/page.tsx','studio/package.json','studio/lib/api.ts','src/studio/x.ts']),['src/studio/x.ts']);
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

test('the two lists of tests agree, and every test file is in them',()=>{
  // "npm test" (package.json) and the pre-push run (TESTS) are two lists by hand; a test left out of either never runs
  // there. The studio's tests go as one pattern, which node --test expands itself.
  const script=JSON.parse(readFileSync('package.json','utf8')).scripts.test as string;
  const listed=script.split(/\s+/).filter(word=>word.endsWith('.test.ts'));
  assert.deepEqual(listed,[...TESTS],'package.json and TESTS in tools/publication-check.ts list the same tests in the same order');
  assert.ok(listed.includes('studio/tests/*.test.ts'),'the tests of the studio are part of the run');
  const onDisk=readdirSync('tools').filter(name=>name.endsWith('.test.ts')).map(name=>'tools/'+name).sort();
  assert.deepEqual(onDisk.filter(name=>!listed.includes(name)),[],'a test file in tools/ that no list names');
  assert.deepEqual(listed.filter(name=>name.startsWith('tools/')&&!onDisk.includes(name)),[],'a listed test that is not there');
});
