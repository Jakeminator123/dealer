import {execFileSync, spawnSync} from 'node:child_process';
import {readFileSync, existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export type Finding = {level:'RED'|'YELLOW'; path:string; message:string};
export const TESTS = ['tools/placements.test.ts','tools/public-storage.test.ts','tools/lab-ui.test.ts','tools/render-safety.test.ts','tools/publication-check.test.ts','tools/clip-job.test.ts','tools/clip-graph.test.ts','tools/card-track.test.ts','tools/scene-geometry.test.ts','tools/scene3d-geometry.test.ts','tools/clip-edit.test.ts','tools/card-overlay.test.ts','tools/review-store.test.ts','tools/game-director.test.ts','tools/game-rules.test.ts','tools/game-rng.test.ts','tools/game-shoe.test.ts','tools/game-presentation.test.ts','tools/game-session.test.ts','tools/game-seats.test.ts','tools/game-fuzz.test.ts','tools/game-view.test.ts','tools/game3d-chips.test.ts','tools/prop-glb.test.ts','tools/props-lab.test.ts','tools/scene3d-hall.test.ts','tools/lab-sound.test.ts','tools/scene3d-shift.test.ts','tools/scene3d-rooms.test.ts','tools/tab-registry.test.ts','tools/studio-files.test.ts','tools/scene3d-dispose.test.ts','tools/scratch-clean.test.ts','tools/scene3d-looks.test.ts','tools/studio-freeze.test.ts','tools/studio-lock.test.ts','tools/scene-preset-store.test.ts','tools/knowledge.test.ts','tools/bot.test.ts','tools/media-roles.test.ts','tools/pages.test.ts','tools/flip-axis.test.ts','tools/game-look.test.ts','tools/order-model.test.ts','tools/order-prompts.test.ts','tools/order-images.test.ts','tools/order-routes.test.ts','tools/order-put.test.ts','tools/film-fix.test.ts','tools/register-order.test.ts','tools/placement-backdrop.test.ts','tools/order-ledger.test.ts','tools/scene-material.test.ts','tools/order-methods.test.ts','tools/produce.test.ts','tools/order-bring.test.ts','studio/tests/*.test.ts','tools/film-after.test.ts','tools/still-after.test.ts','tools/speech-plan.test.ts','tools/review-put.test.ts','tools/speech-lines.test.ts','tools/scene3d-matte.test.ts'];
// The documents every reader starts from: a push without one of them stops. Their length is not checked, and new pages
// under docs/ or tools/ are welcome where a subject needs one (AGENTS.md, "Var kunskap står").
export const CANONICAL = ['AGENTS.md','README.md','HANDOFF.md','docs/SYSTEM.md','docs/DRIFT.md'];
const zero = /^0+$/;
const oid = /^[a-f0-9]{40,64}$/i;
const git = (root:string,...args:string[]) => {
  const env={...process.env};
  // Hooks may export GIT_DIR. Fixtures and other explicit roots must stay isolated.
  for(const key of ['GIT_DIR','GIT_WORK_TREE','GIT_INDEX_FILE','GIT_COMMON_DIR','GIT_OBJECT_DIRECTORY','GIT_ALTERNATE_OBJECT_DIRECTORIES'])delete env[key];
  return execFileSync('git',args,{cwd:root,env,encoding:'utf8',maxBuffer:32*1024*1024,stdio:['ignore','pipe','pipe']});
};
const changedTestInputs=(root:string)=>dirtyTestInputs([
  ...git(root,'diff','--name-only','-z','HEAD').split('\0'),
  ...git(root,'ls-files','--others','--exclude-standard','-z').split('\0'),
].filter(Boolean));

export function inspectBlob(name:string, bytes:Buffer):Finding[] {
  const result:Finding[]=[];
  const add=(level:Finding['level'],message:string)=>result.push({level,path:name,message});
  if(/(^|\/)(?:assets|output|private|node_modules|\.runtime)(\/|$)|(^|\/)\.env[^/]*$/i.test(name)) add('RED','Lokal media, miljö eller arbetsdata får inte publiceras i Git.');
  if(/\.(?:mp4|mov|webm|mkv|avi|wav|mp3|zip|7z|rar|png|jpe?g)$/i.test(name)) add('RED','Binärt material ska ligga utanför källrepot.');
  if(bytes.length>5*1024*1024) add('RED','Filen överstiger 5 MiB; granska lagringsplatsen.');
  const text=bytes.toString('utf8');
  // Only report file names, never the matching credential or source line.
  if(/gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{32,}|AKIA[A-Z0-9]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)
    || /(?:api[_-]?key|secret|password|token)\s*[:=]\s*["'][A-Za-z0-9_+\/=.-]{24,}["']/i.test(text)) add('RED','Möjlig incheckad hemlighet; utred utan att skriva ut värdet.');
  return result;
}

export function parsePush(input:string):Array<{local:string;remote:string}> {
  return input.trim().split(/\r?\n/).filter(Boolean).map(line=>{
    const parts=line.trim().split(/\s+/);
    if(parts.length!==4||!oid.test(parts[1])||!oid.test(parts[3]))throw Error('Ogiltiga pre-push-referenser.');
    return {local:parts[1],remote:parts[3]};
  }).filter(row=>!zero.test(row.local)); // A ref deletion introduces no objects.
}

// The studio (studio/) has its own package, type check and build, and its builders work in it while other steps are
// pushed: an uncommitted file there does not stop a push by itself. Its own tests (studio/tests/) run with the others
// since 2026-11-13 (they stood outside every run until then, and two were red unseen), so a red studio test stops the
// push; a green one may have run against a working copy that differs from HEAD, which is weaker evidence than for
// src/ and tools/. Its files are checked like all others once they are committed.
export function dirtyTestInputs(names:string[]):string[] {
  return names.filter(name=>!name.startsWith('studio/')).filter(name=>/\.(?:ts|tsx|js|mjs|cjs|css|html)$/.test(name)||/^package(?:-lock)?\.json$/.test(name)||name.startsWith('.githooks/')||name.startsWith('.github/'));
}

export function scanRange(root:string,head:string,base:string):Finding[] {
  if(!oid.test(head)|| (base&&!oid.test(base)))throw Error('Kontrollen kräver exakta commit-ID.');
  const args=['rev-list','--objects',head,...(base&&!zero.test(base)?['--not',base]:[])];
  const findings:Finding[]=[];
  const objects=git(root,...args).trim().split('\n').filter(Boolean);
  for(const line of objects){
    const split=line.indexOf(' ');if(split<0)continue;
    const hash=line.slice(0,split),name=line.slice(split+1).replace(/\r$/,'');
    if(git(root,'cat-file','-t',hash).trim()!=='blob')continue;
    const size=Number(git(root,'cat-file','-s',hash));
    if(size>5*1024*1024){findings.push({level:'RED',path:name,message:'Historisk fil överstiger 5 MiB; kontrollera hela pushintervallet.'});continue;}
    findings.push(...inspectBlob(name,Buffer.from(git(root,'cat-file','blob',hash))));
  }
  // Check paths at every incoming commit too: identical blobs may occur at several names.
  const commits=git(root,'rev-list',head,...(base&&!zero.test(base)?['--not',base]:[])).trim().split('\n').filter(Boolean);
  for(const commit of commits){
    const names=git(root,'diff-tree','--root','--no-commit-id','--name-only','-z','-r','-m','--diff-filter=ACMRT',commit).split('\0').filter(Boolean);
    for(const name of names) findings.push(...inspectBlob(name,Buffer.alloc(0)));
  }
  return [...new Map(findings.map(f=>[JSON.stringify(f),f])).values()];
}

function emit(f:Finding) {
  console.log(`[${f.level==='RED'?'RÖD':'GUL'}] ${f.path}: ${f.message}`);
  if(process.env.GITHUB_ACTIONS==='true') {
    const escape=(s:string)=>s.replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A');
    console.log(`::${f.level==='RED'?'error':'warning'}::${escape(f.path+': '+f.message)}`);
  }
}

function main() {
  const root=git(process.cwd(),'rev-parse','--show-toplevel').trim();
  const pkg=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8'));
  if(process.version!==`v${pkg.volta.node}`)throw Error(`Använd projektets Volta Node ${pkg.volta.node}; aktuell ${process.version}.`);
  if(process.argv.includes('--install')){
    let current='';try{current=git(root,'config','--get','core.hooksPath').trim();}catch{}
    if(current&&current!=='.githooks')throw Error('Befintlig hooksPath måste samordnas först: '+current);
    git(root,'config','--local','core.hooksPath','.githooks');
    console.log('Lokal pre-push installerad; ingen bakgrundsprocess startad.');return;
  }
  const head=git(root,'rev-parse','HEAD').trim();
  const prePush=process.argv.includes('--pre-push');
  let ranges:Array<{local:string;remote:string}>;
  if(prePush){
    const destination=process.argv.at(-1)??'';
    if(!/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)Jakeminator123\/dealer(?:\.git)?$/i.test(destination))throw Error('Pushmålet är inte det verifierade dealer-repot.');
    ranges=parsePush(readFileSync(0,'utf8'));
    if(ranges.some(r=>r.local!==head))throw Error('Pushkontrollen testar aktuell HEAD; byt till den commit som ska pushas.');
  }else{
    const index=process.argv.indexOf('--base');
    let base=index>=0?process.argv[index+1]:process.env.PUBLICATION_BASE;
    if(!base){try{base=git(root,'rev-parse','@{upstream}').trim();}catch{base='';}}
    ranges=[{local:head,remote:base??''}];
  }
  if(!ranges.length){console.log('Ingen ny commit att kontrollera.');return;}
  const dirty=changedTestInputs(root);
  if(dirty.length)throw Error('Testindata skiljer sig från HEAD: '+dirty.join(', ')+'. Samordna arbetet; återställ inte någon annans filer.');
  const findings=ranges.flatMap(r=>scanRange(root,r.local,r.remote));
  const names=git(root,'ls-tree','-r','--name-only','-z',head).split('\0');
  for(const name of CANONICAL)if(!names.includes(name))findings.push({level:'RED',path:name,message:'Ett kanoniskt dokument saknas; återställ eller samordna dokumentstrukturen.'});
  findings.forEach(emit);
  if(findings.some(f=>f.level==='RED'))throw Error('Publiceringen stoppad. Utred fynd och eventuell felaktig kontroll; använd inte --no-verify.');
  const env={...process.env};
  if(process.platform==='win32'&&existsSync('D:/dealer-scratch/tmp')){env.TEMP='D:/dealer-scratch/tmp';env.TMP=env.TEMP;}
  const test=spawnSync(process.execPath,['--test','--test-concurrency=4',...TESTS],{cwd:root,env,stdio:'inherit'});
  if(test.error||test.status!==0)throw Error('Testkörningen misslyckades. Kontrollera både produktkod och test/hook innan publicering.');
  if(git(root,'rev-parse','HEAD').trim()!==head||changedTestInputs(root).length)throw Error('Kod eller HEAD ändrades under kontrollen; kör om på stabil version.');
  console.log(`Kontrollerad HEAD ${head}; ${findings.filter(f=>f.level==='YELLOW').length} varningar. Eventuella Node-varningar visas separat. Detta verifierar inte media, rendering eller deploy.`);
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{main();}catch(error){console.error('[RÖD] '+(error instanceof Error?error.message:'Kontrollen misslyckades.'));process.exitCode=1;}
}
