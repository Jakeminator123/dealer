import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,mkdirSync,rmSync,readFileSync,readdirSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {stripTypeScriptTypes} from 'node:module';
import {inspectBlob,parsePush,dirtyTestInputs,scanRange,listedTests,reusablePass,sameNodeMajor,buildTreeOf,REUSE_HOURS} from './publication-check.ts';

function fixture(t:TestContext){
  // The repository lies one folder down, as dealer does: what the check puts beside it (the build tree, push-logg) then
  // stays inside the test's own folder.
  const top=mkdtempSync(path.join(tmpdir(),'dealer-publication-test-')),root=path.join(top,'dealer');
  mkdirSync(root);
  t.after(()=>{assert.equal(path.dirname(top),path.resolve(tmpdir()));assert.ok(path.basename(top).startsWith('dealer-publication-test-'));rmSync(top,{recursive:true,force:true,maxRetries:5,retryDelay:100});});
  const env={...process.env};for(const key of ['GIT_DIR','GIT_WORK_TREE','GIT_INDEX_FILE','GIT_COMMON_DIR','GIT_OBJECT_DIRECTORY','GIT_ALTERNATE_OBJECT_DIRECTORIES'])delete env[key];
  const gitIn=(cwd:string,...args:string[])=>execFileSync('git',args,{cwd,env,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const git=(...args:string[])=>gitIn(root,...args);
  git('init');git('config','user.name','Publication test');git('config','user.email','test@example.invalid');git('config','core.hooksPath',path.join(root,'no-hooks'));
  const write=(name:string,text:string)=>{mkdirSync(path.dirname(path.join(root,name)),{recursive:true});writeFileSync(path.join(root,name),text);};
  // add -f: the fixture commits names that a machine's own ignore rules may hold back (.env.local in a global excludes
  // file, as in an outside sandbox); what is tested is the scan of the history, not what git add lets through.
  const commitAll=(files:Record<string,string>)=>{for(const [name,text] of Object.entries(files))write(name,text);git('add','-f','--',...Object.keys(files));git('commit','-m','Fixture');return git('rev-parse','HEAD');};
  const commit=(name:string,text:string)=>commitAll({[name]:text});
  return {top,root,env,git,gitIn,write,commit,commitAll};
}

// A repository the check can judge from start to end, and the check run in it as the pre-push hook runs it: the script is
// this repository's, the repository it judges is the folder it is started in. The suite the fixture names does not
// exist, so a run of it there would be red; its "npm run check" is a script that is green or red on the test's word.
const SCRIPT=path.resolve('tools/publication-check.ts');
function pushFixture(t:TestContext){
  const f=fixture(t);
  // The Node this repository pins, so that npm in the fixture's build tree is the one already installed.
  const pinned=JSON.parse(readFileSync('package.json','utf8')).volta.node as string;
  const base=f.commitAll({
    'README.md':'# Fixture\n',
    '.gitignore':'.runtime/\nnode_modules/\n',
    'package.json':JSON.stringify({private:true,volta:{node:pinned},scripts:{test:'node --test tools/missing.test.ts',check:'node tools/fixture-check.mjs'}}),
    'tools/fixture-check.mjs':"if(process.env.FIXTURE_CHECK==='red'){console.log('fixture test fails');process.exit(1);}\nconsole.log('fixture check green');\n",
  });
  const hook=(head:string,extra:Record<string,string>={})=>{
    const run=spawnSync(process.execPath,[SCRIPT,'--pre-push','origin','https://github.com/Jakeminator123/dealer.git'],{cwd:f.root,env:{...f.env,...extra},input:`refs/heads/main ${head} refs/heads/main ${base}\n`,encoding:'utf8'});
    return {code:run.status,out:`${run.stdout}${run.stderr}`};
  };
  // The receipt the check leaves in the main checkout's journal when the suite has gone green for a commit.
  const passed=(head:string)=>f.write(`.runtime/evidence/runs/${head}.json`,JSON.stringify({id:'fixture',kind:'publication',status:'pass',revision:head,dirtyInputs:[],finishedAt:new Date().toISOString(),counts:{fail:0}}));
  // Someone else's work in the tree: a changed tracked file and a new one.
  const open=()=>{f.write('README.md','# Someone is writing here\n');f.write('src/draft.ts','export const draft=1;\n');};
  const stillOpen=()=>{assert.equal(readFileSync(path.join(f.root,'README.md'),'utf8'),'# Someone is writing here\n');assert.equal(readFileSync(path.join(f.root,'src/draft.ts'),'utf8'),'export const draft=1;\n');assert.equal(f.git('status','--porcelain'),'M README.md\n?? src/draft.ts');};
  return {...f,base,hook,passed,open,stillOpen};
}

test('private paths, media and token-like values block without exposing the value',()=>{
  for(const name of ['assets/source.png','output/movie.mp4','.env.local','nested/.env.secret','private/info.json','nested/node_modules/module.js','.runtime/log.json'])assert.ok(inspectBlob(name,Buffer.from('{}')).some(f=>f.level==='RED'),name);
  // Binary material wherever it lands, also the picture, model and archive types that stills, props and rooms are kept in.
  for(const name of ['docs/bild.webp','studio/public/still.avif','src/prov.gif','data/bord.glb','data/rum.hdr','data/rum.exr','docs/rapport.pdf','data/bank.tar.gz','src/film.MP4'])assert.ok(inspectBlob(name,Buffer.from('{}')).some(f=>f.level==='RED'),name);
  for(const name of ['src/scene3d-film.ts','data/speech.json','docs/TAL.md','studio/app/icon.svg'])assert.ok(!inspectBlob(name,Buffer.from('{}')).some(f=>f.level==='RED'),name);
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

test('every file but the user card plan counts as open: studio, registers and documents too',()=>{
  assert.deepEqual(dirtyTestInputs(['placements/default.json','HANDOFF.md']),['HANDOFF.md']);
  assert.deepEqual(dirtyTestInputs(['src/sound.ts','package-lock.json','placements/default.json']),['src/sound.ts','package-lock.json']);
  const studio=['studio/app/page.tsx','studio/package.json','studio/lib/api.ts','src/studio/x.ts'];
  assert.deepEqual(dirtyTestInputs(studio),studio);
  const inputs=['data/order-methods.json','data/orders/new-draft.json','data/motions.jsonl','tools/texts/prompt.txt','.gitignore'];
  assert.deepEqual(dirtyTestInputs(inputs),inputs);
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

test('the push check runs the tests that npm test runs, and every test file of tools/ and the studio is among them',()=>{
  // The push check reads its tests from the test script in package.json (listedTests), so it and "npm test" run the
  // same files. The tests of tools/ and of the studio go as one pattern each, which node --test expands itself: a new
  // test file there runs without being written into a list, so none can be forgotten.
  const listed=listedTests(readFileSync('package.json','utf8'));
  for(const pattern of ['tools/*.test.ts','studio/tests/*.test.ts'])assert.ok(listed.includes(pattern),pattern+' is part of the run');
  assert.throws(()=>listedTests(JSON.stringify({scripts:{test:'node --test'}})),/inga testfiler/,'a test script that names no file stops the check');
  assert.throws(()=>listedTests(JSON.stringify({scripts:{}})),/inga testfiler/,'so does a package.json without one');
});

test('every TypeScript file that Node runs directly parses',()=>{
  // A script that nothing imports is in no test, so a broken one is found only when someone runs it:
  // tools/build-studio-snapshot.ts lay in main unable to parse from e2a95ae until the copy was to be published
  // (2026-11-18), after a text replacement whose new text held $' had pasted the rest of the file into one of its lines.
  // The studio's own files are built and type-checked by Next.js and are not read here.
  const files:string[]=[];
  const walk=(dir:string)=>{for(const entry of readdirSync(dir,{withFileTypes:true})){
    if(entry.name==='node_modules'||entry.name.startsWith('.'))continue;
    const rel=dir+'/'+entry.name;
    if(entry.isDirectory())walk(rel);else if(/\.m?ts$/.test(entry.name)&&!entry.name.endsWith('.d.ts'))files.push(rel);
  }};
  for(const folder of ['tools','src','cloud','game','dealer3d','pages','materials'])if(existsSync(folder))walk(folder);
  assert.ok(files.length>100,'the folders with code were read');
  const broken:string[]=[];
  for(const file of files){try{stripTypeScriptTypes(readFileSync(file,'utf8'));}catch(error){broken.push(file+': '+String((error as Error).message).split('\n')[0]);}}
  assert.deepEqual(broken,[],'files that do not parse');
});

test('the pre-push hook reuses only a passing check of this very HEAD, clean and recent; else the suite runs', () => {
  const head='a'.repeat(40),now=Date.parse('2026-11-21T17:00:00Z'),at=(hours:number)=>new Date(now-hours*3600e3).toISOString();
  const good={id:'ok',kind:'publication',status:'pass',revision:head,dirtyInputs:[],finishedAt:at(1),counts:{fail:0}};
  assert.equal(reusablePass([good],head,now)?.id,'ok');
  assert.equal(reusablePass([{...good,dirtyInputs:['placements/default.json']}],head,now)?.id,'ok','his card plan is the one exception, as in the check');
  for(const [why,bad] of [
    ['another HEAD',{...good,revision:'b'.repeat(40)}],
    ['an ordinary test run, not the check',{...good,kind:'tests'}],
    ['a failed or invalidated run',{...good,status:'invalidated'}],
    ['a failing test',{...good,counts:{fail:1}}],
    ['a dirty input',{...good,dirtyInputs:['tools/x.ts']}],
    ['no list of inputs',{...good,dirtyInputs:undefined}],
    ['too old',{...good,finishedAt:at(REUSE_HOURS+0.1)}],
    ['from the future',{...good,finishedAt:at(-1)}],
    ['no time',{...good,finishedAt:'x'}],
  ] as const) assert.equal(reusablePass([bad],head,now),null,why);
  assert.equal(reusablePass([],head,now),null);
});

test('the check asks for the same major version of Node as the project pins, not the same patch',()=>{
  assert.ok(sameNodeMajor('v24.22.3','24.22.3'));
  assert.ok(sameNodeMajor('v24.5.0','24.22.3'),'another patch of the same major version is the same Node here');
  assert.ok(!sameNodeMajor('v22.20.0','24.22.3'));
  assert.ok(!sameNodeMajor('v2.4.0','24.22.3'));
});

test('open files do not stop a push whose commit has passed the check, and a finding in the commits still stops it',t=>{
  const f=pushFixture(t),head=f.commit('src/done.ts','export const done=1;\n');
  f.open();f.passed(head);
  const pushed=f.hook(head);
  assert.equal(pushed.code,0,pushed.out);
  assert.match(pushed.out,/den körs inte en gång till/,'the green run of this commit is reused');
  assert.match(pushed.out,new RegExp(`Kontrollerad HEAD ${head}`));
  f.stillOpen();
  // The same open files and a passed suite, and a commit that carries what must not go out.
  const secret=f.commit('.env.local','{}');
  f.passed(secret);
  const stopped=f.hook(secret);
  assert.equal(stopped.code,1,stopped.out);
  assert.match(stopped.out,/\[RÖD\] \.env\.local: /);
  assert.match(stopped.out,/Publiceringen stoppad/);
  f.stillOpen();
});

test('with open files and no passed check the commit is tested in the build tree, and only a red check there stops the push',t=>{
  const f=pushFixture(t),head=f.commit('src/done.ts','export const done=1;\n'),tree=buildTreeOf(f.root);
  assert.equal(path.dirname(tree),f.top,'the build tree lies beside the repository');
  f.open();
  const missing=f.hook(head);
  assert.equal(missing.code,1,missing.out);
  assert.match(missing.out,/byggträdet där committen då testas saknas\. Skapa det en gång med: git worktree add --detach ".*dealer-bygg" main/);
  f.git('worktree','add','--detach',tree,f.base);mkdirSync(path.join(tree,'node_modules'));
  const green=f.hook(head);
  assert.equal(green.code,0,green.out);
  assert.match(green.out,/testas i byggträdet/);
  assert.match(green.out,/fixture check green/);
  assert.equal(f.gitIn(tree,'rev-parse','HEAD'),head,'what was tested is the pushed commit');
  assert.ok(!existsSync(path.join(tree,'src/draft.ts')),'and not the open files');
  f.stillOpen();
  const red=f.hook(head,{FIXTURE_CHECK:'red'});
  assert.equal(red.code,1,red.out);
  assert.match(red.out,/Kontrollen av committen [a-f0-9]{7} i byggträdet .*dealer-bygg stannade/);
  assert.match(red.out,/STOPP: npm run check \(kod 1\)/);
  f.stillOpen();
});
