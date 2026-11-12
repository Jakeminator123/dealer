import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync,utimesSync,readdirSync,lstatSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {run,namedIn,RULES,type Proc} from './scratch-clean.ts';

const DAY=864e5;
const posix=(p:string)=>p.replaceAll('\\','/');
// A scratch folder in miniature, an archive beside it, a repo with its steering documents and the agents' memory.
function world(){
 const base=mkdtempSync(path.join(tmpdir(),'dealer-stad-'));
 const root=path.join(base,'scratch'),archive=path.join(base,'arkiv','slask'),repo=path.join(base,'repo'),memory=path.join(base,'minne');
 for(const d of [path.join(root,'tmp'),path.join(root,'review'),path.join(repo,'docs'),path.join(repo,'data'),memory])mkdirSync(d,{recursive:true});
 writeFileSync(path.join(repo,'HANDOFF.md'),'# Handoff\n');
 const at=(rel:string)=>path.join(root,...rel.split('/'));
 const put=(rel:string,text='x')=>{const f=at(rel);mkdirSync(path.dirname(f),{recursive:true});writeFileSync(f,text);return f;};
 const profile=(rel:string)=>{put(rel+'/Default/Preferences','{}');put(rel+'/Local State','{}');put(rel+'/Default/Local Storage/leveldb/000003.log','l');};
 // Every entry below a folder gets the same time, children before their folder, links left alone.
 const age=(days:number,rel='')=>{
  const when=new Date(Date.now()-days*DAY);
  const set=(p:string)=>{const st=lstatSync(p);if(st.isSymbolicLink())return;if(st.isDirectory())for(const n of readdirSync(p))set(path.join(p,n));utimesSync(p,when,when);};
  set(rel?at(rel):root);
 };
 const exists=(rel:string)=>existsSync(at(rel));
 const go=(argv:string[],processes:Proc[]=[])=>{const lines:string[]=[];const code=run(argv,{root,archive,repo,memory,processes,out:l=>lines.push(l),err:l=>lines.push(l)});return {code,text:lines.join('\n')};};
 const ledger=()=>JSON.parse(readFileSync(path.join(archive,'arkiv.json'),'utf8')) as {poster:Array<{post:number;atgard:string;regel:string;fran:string;till?:string;status:string}>};
 const snapshot=()=>{const out:string[]=[];const walk=(p:string)=>{const st=lstatSync(p);out.push(`${posix(path.relative(base,p))} ${st.size} ${st.mtimeMs}`);if(st.isDirectory()&&!st.isSymbolicLink())for(const n of readdirSync(p).sort())walk(path.join(p,n));};walk(base);return out;};
 const done=()=>rmSync(base,{recursive:true,force:true});
 return {base,root,archive,repo,memory,at,put,profile,age,exists,go,ledger,snapshot,done};
}
const month=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;};

test('a dry run reports what it would do and changes nothing',()=>{
 const w=world();
 try{
  w.profile('tmp/a/chrome-profile');w.put('tmp/b/shots/1.png');w.put('tmp/c/sheets/1.png');w.put('tmp/x.tmp');w.age(30);
  w.age(10,'tmp/c'); // too young to move the session as a whole, old enough for its contact sheets
  const before=w.snapshot(),r=w.go(['--lista']);
  assert.equal(r.code,0,r.text);
  assert.match(r.text,/torrkörning, inget ändras/);
  assert.match(r.text,/RADERA\s+\S+ GB\s+tmp\/a\/chrome-profile/);
  assert.match(r.text,/ARKIVERA\s+\S+ GB\s+tmp\/b\/shots/);
  assert.match(r.text,/KRÄVER DOM\s+\S+ GB\s+tmp\/c\/sheets/);
  assert.deepEqual(w.snapshot(),before);
  assert.equal(existsSync(w.archive),false);
 }finally{w.done();}
});

test('a Chrome profile is deleted, but never chrome-meshy, one under a Meshy folder, or one a running process names',()=>{
 const w=world();
 try{
  for(const p of ['tmp/a/chrome-profile','tmp/spelagent/chrome-meshy','tmp/meshy-bord/chrome-profile','tmp/b/chrome-profile-9'])w.profile(p);
  w.age(30);
  const chrome:Proc={pid:4242,cmd:`"C:\\Program Files\\Google\\Chrome\\chrome.exe" --headless --user-data-dir=${path.join(w.root,'tmp','b','chrome-profile-9')} --remote-debugging-port=9341`};
  const r=w.go(['--kor'],[chrome]);
  assert.equal(r.code,0,r.text);
  assert.equal(w.exists('tmp/a/chrome-profile'),false);
  for(const kept of ['tmp/spelagent/chrome-meshy/Default/Preferences','tmp/meshy-bord/chrome-profile/Local State','tmp/b/chrome-profile-9/Default/Local Storage/leveldb/000003.log'])assert.ok(w.exists(kept),kept);
  assert.deepEqual(w.ledger().poster.map(p=>[p.atgard,p.regel,p.status]),[['RADERA','chrome-profil','raderad']]);
  assert.match(w.go(['--forklara','tmp/b/chrome-profile-9'],[chrome]).text,/process 4242/);
 }finally{w.done();}
});

test('a folder a steering document, a data file or the memory names is kept, written out or relative',()=>{
 const w=world();
 try{
  for(const s of ['c','c2','d','e'])w.put(`tmp/${s}/shots/1.png`);
  w.put('tmp/c3/rapport/RAPPORT.md');w.put('tmp/c3/rapport/frames/1.png');w.put('tmp/c3/tool.mjs');w.put('tmp/c3/shots/1.png');
  writeFileSync(path.join(w.repo,'HANDOFF.md'),`# Handoff\n\nSkärmbilderna ligger i ${posix(w.root)}/tmp/c/shots/.\n`);
  writeFileSync(path.join(w.repo,'docs','DRIFT.md'),'Se `c2/shots` och verktyget `c3/tool.mjs`.\n');
  writeFileSync(path.join(w.repo,'data','scene.json'),JSON.stringify({report:path.join(w.root,'tmp','c3','rapport','RAPPORT.md')}));
  writeFileSync(path.join(w.memory,'note.md'),`Underlag: ${path.join(w.root,'tmp','e','shots')} (Windows-stavning).\n`);
  w.age(30);
  const r=w.go(['--kor']);
  assert.equal(r.code,0,r.text);
  for(const kept of ['tmp/c/shots/1.png','tmp/c2/shots/1.png','tmp/c3/rapport/frames/1.png','tmp/e/shots/1.png'])assert.ok(w.exists(kept),kept);
  // A file named directly in a session folder keeps itself, not the whole session.
  assert.equal(w.exists('tmp/c3/shots'),false);assert.ok(w.exists('tmp/c3/tool.mjs'));
  assert.equal(w.exists('tmp/d/shots'),false);
  assert.ok(existsSync(path.join(w.archive,month(),'tmp','d','shots','1.png')));
  assert.match(w.go(['--forklara','tmp/c/shots']).text,/BEHÅLL[\s\S]*HANDOFF\.md:3/);
  assert.match(w.go(['--forklara',path.join(w.root,'tmp','c3','rapport','frames')]).text,/data\/scene\.json:1/);
 }finally{w.done();}
});

test('what has changed in the last days is kept, and that protection cannot be switched off',()=>{
 const w=world();
 try{
  w.put('tmp/f/node_modules/p/index.js');w.put('tmp/g/node_modules/p/index.js');w.put('tmp/h/shots/1.png');w.age(30);
  const now=new Date();utimesSync(w.at('tmp/f/node_modules/p/index.js'),now,now);
  w.age(5,'tmp/h/shots'); // older than the three days kept, younger than the week screenshots wait
  const r=w.go(['--kor']);
  assert.equal(r.code,0,r.text);
  assert.ok(w.exists('tmp/f/node_modules/p/index.js'));
  assert.equal(w.exists('tmp/g/node_modules'),false);
  assert.ok(w.exists('tmp/h/shots/1.png'));
  for(const days of ['0','-1','x'])assert.equal(w.go(['--kor','--dygn',days]).code,1,days);
  assert.equal(w.go(['--kor','--nu','2027-01-01']).code,1);
 }finally{w.done();}
});

test('moving keeps the folder structure, and the ledger is enough to move it back',()=>{
 const w=world();
 try{
  w.put('tmp/h/sub/shots/a.png','A');w.put('tmp/h/sub/shots/deep/b.png','B');w.put('tmp/h/keep.txt');w.age(30);
  const r=w.go(['--kor']);
  assert.equal(r.code,0,r.text);
  const target=path.join(w.archive,month(),'tmp','h','sub','shots');
  assert.equal(readFileSync(path.join(target,'a.png'),'utf8'),'A');
  assert.equal(readFileSync(path.join(target,'deep','b.png'),'utf8'),'B');
  assert.equal(w.exists('tmp/h/sub/shots'),false);assert.ok(w.exists('tmp/h/keep.txt'));
  const post=w.ledger().poster.find(p=>p.atgard==='ARKIVERA')!;
  assert.deepEqual([post.regel,post.status,post.fran,post.till],['skarmbilder','arkiverad',posix(w.at('tmp/h/sub/shots')),posix(target)]);
  const back=w.go(['--aterstall',String(post.post)]);
  assert.equal(back.code,0,back.text);
  assert.equal(readFileSync(w.at('tmp/h/sub/shots/deep/b.png'),'utf8'),'B');
  assert.equal(existsSync(target),false);
  assert.equal(w.ledger().poster.find(p=>p.post===post.post)!.status,'aterstalld');
  assert.equal(w.go(['--aterstall',String(post.post)]).code,1); // only once
 }finally{w.done();}
});

test('nothing outside the root is touched: no link is followed and no ledger post leads out',()=>{
 const w=world();
 try{
  const outside=path.join(w.base,'utanfor');mkdirSync(path.join(outside,'shots'),{recursive:true});writeFileSync(path.join(outside,'shots','victim.png'),'v');
  w.put('tmp/j/shots/real.png');
  const linked=[[path.join(outside,'shots'),w.at('tmp/i/shots')],[outside,w.at('tmp/j/shots/ut')]].every(([target,at])=>{mkdirSync(path.dirname(at),{recursive:true});try{symlinkSync(target,at,'junction');return true;}catch{return false;}});
  w.age(30);utimesSync(path.join(outside,'shots','victim.png'),new Date(0),new Date(0));
  const r=w.go(['--kor']);
  assert.equal(r.code,0,r.text);
  assert.ok(existsSync(path.join(outside,'shots','victim.png')));
  if(linked){
   assert.ok(lstatSync(w.at('tmp/i/shots')).isSymbolicLink());
   assert.ok(w.exists('tmp/j/shots/real.png')); // a folder holding a link is left whole
  }
  assert.match(w.go(['--forklara',path.join(w.root,'..','utanfor')]).text,/utanför/);
  // A ledger post that someone has pointed out of the scratch folder is refused.
  const till=path.join(w.archive,month(),'tmp','k');mkdirSync(till,{recursive:true});
  writeFileSync(path.join(w.archive,'arkiv.json'),JSON.stringify({beskrivning:'',poster:[{post:7,atgard:'ARKIVERA',regel:'skarmbilder',fran:posix(path.join(w.root,'..','utanfor','k')),till:posix(till),tid:'',byte:0,filer:0,status:'arkiverad'}]}));
  const back=w.go(['--aterstall','7']);
  assert.equal(back.code,1);assert.match(back.text,/utanför slasken/);assert.ok(existsSync(till));
  // The archive may not lie in the scratch folder, nor the repo.
  assert.equal(run([],{root:w.root,archive:w.at('tmp/arkiv'),repo:w.repo,memory:w.memory,processes:[],out:()=>{},err:()=>{}}),1);
  assert.equal(run([],{root:w.root,archive:w.archive,repo:w.at('tmp/repo'),memory:w.memory,processes:[],out:()=>{},err:()=>{}}),1);
 }finally{w.done();}
});

test('a folder with an order ledger or a receipt is never deleted or moved, and films are never deleted',()=>{
 const w=world();
 try{
  w.put('tmp/k/bestallningar-b1.json','[]');w.put('tmp/k/film.mp4');w.put('tmp/k/shots/1.png');w.put('tmp/k/node_modules/p/i.js');w.put('tmp/k/sheets/1.png');
  w.put('tmp/l/b2/kvitto.json','{}');w.put('tmp/l/b2/frames/1.png');w.put('tmp/l/b2/clip.mp4');
  w.put('tmp/m/node_modules/clip.mp4');
  w.age(30);w.age(5,'tmp/m'); // old enough for node_modules, too young to move the session

  const r=w.go(['--kor','--regel','node_modules,skarmbilder,kontaktark,avslutad-session']);
  assert.equal(r.code,0,r.text);
  for(const kept of ['tmp/k/film.mp4','tmp/k/shots/1.png','tmp/k/node_modules/p/i.js','tmp/k/sheets/1.png','tmp/l/b2/frames/1.png','tmp/l/b2/clip.mp4','tmp/m/node_modules/clip.mp4'])assert.ok(w.exists(kept),kept);
  // tmp/l itself holds no ledger, but it holds a folder that does, so it is not moved as a whole either.
  assert.ok(w.exists('tmp/l/b2/kvitto.json'));
  assert.match(w.go(['--forklara','tmp/k/shots']).text,/liggare/);
 }finally{w.done();}
});

test('--tyst carries out only rules that need no judgment',()=>{
 const w=world();
 try{
  w.put('tmp/n/sheets/1.png');w.put('tmp/o/notes.txt');w.put('tmp/p/shots/1.png');w.put('tmp/q.tmp');w.age(30);
  assert.equal(w.go(['--tyst']).code,1); // only together with --kor
  const refused=w.go(['--kor','--tyst','--regel','kontaktark']);
  assert.equal(refused.code,1);assert.match(refused.text,/kräver dom/);
  assert.ok(w.exists('tmp/n/sheets/1.png'));assert.ok(w.exists('tmp/q.tmp'));
  const r=w.go(['--kor','--tyst']);
  assert.equal(r.code,0,r.text);
  assert.equal(r.text.split('\n').length,1);assert.match(r.text,/^stada \d{4}-\d\d-\d\d \d\d:\d\d: raderat 1 st .*arkiverat 1 st/);
  assert.ok(w.exists('tmp/n/sheets/1.png'));assert.ok(w.exists('tmp/o/notes.txt'));
  assert.equal(w.exists('tmp/p/shots'),false);assert.equal(w.exists('tmp/q.tmp'),false);
  // With a person at the keyboard a rule that needs judgment runs when it is named.
  assert.equal(w.go(['--kor','--regel','kontaktark']).code,0);
  assert.equal(w.exists('tmp/n/sheets'),false);
 }finally{w.done();}
});

test('paths are found written out, relative to tmp, with globs and braces, and cut at placeholders',()=>{
 const sessions=new Set(['paow','trailer','trailer-2','bakgrund-3d']);
 const text=['Se `D:/dealer-scratch/tmp/paow/skript/` och `trailer*/clips`, `bakgrund-3d/{kort,rail}`.',
  'Film: "D:\\\\dealer-scratch\\\\review\\\\scen\\\\a.mp4", mall `mcp/order-<omgång>.json`, D:/dealer-scratch/tmp/<session>/x och `assets/motions/x`.'].join('\n');
 const found=namedIn(text,'D:/dealer-scratch',sessions).map(n=>[n.line,n.segs.join('/')]);
 assert.deepEqual(found,[[1,'tmp/paow/skript'],[1,'tmp/trailer*/clips'],[1,'tmp/bakgrund-3d/kort'],[1,'tmp/bakgrund-3d/rail'],[2,'review/scen/a.mp4'],[2,'tmp']]);
});

test('the rules are data: each has a unique name, an action, an age and a reason, and only moving may need judgment',()=>{
 assert.equal(new Set(RULES.map(r=>r.name)).size,RULES.length);
 for(const r of RULES){
  assert.ok(['RADERA','ARKIVERA'].includes(r.action),r.name);
  assert.ok(r.days>=1&&r.reason.length>20,r.name);
  assert.equal([r.dir,r.file,r.profile,r.session].filter(Boolean).length,1,r.name);
  if(r.action==='RADERA')assert.equal(r.safe,true,r.name);
 }
});
