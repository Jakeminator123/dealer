import {execFileSync, spawnSync} from 'node:child_process';
import {existsSync, readFileSync, readdirSync, mkdirSync, statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Stop} from './clean-tree.ts';
import {checkClean, fileIo} from './push-clean.ts';

export type Finding = {level:'RED'|'YELLOW'; path:string; message:string};
// The tests the push check runs are the ones "npm test" runs: the test files named in the test script of package.json,
// read from the commit being checked. Until 2026-11-20 they were a second list here, kept equal to package.json by hand.
export function listedTests(packageJson:string):string[] {
  const script=JSON.parse(packageJson)?.scripts?.test;
  const tests=typeof script==='string'?script.split(/\s+/).filter(word=>word.endsWith('.test.ts')):[];
  if(!tests.length)throw Error('Skriptet test i package.json namnger inga testfiler; kontrollen vet inte vad som ska köras.');
  return tests;
}
// The documents every reader starts from: a push without one of them stops. Their length is not checked here (the cap on
// HANDOFF.md and on the lane files under docs/lage/ is held by tools/handoff.test.ts), and new pages under docs/ or
// tools/ are welcome where a subject needs one (AGENTS.md, "Var kunskap står").
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
  if(/\.(?:mp4|mov|webm|mkv|avi|wav|mp3|zip|7z|rar|gz|png|jpe?g|webp|avif|gif|glb|hdr|exr|pdf)$/i.test(name)) add('RED','Binärt material ska ligga utanför källrepot.');
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

// The gate claims to test HEAD, including studio code, fixtures and register/document checks. A test may import any
// tracked source or read JSON/Markdown, so an extension whitelist cannot establish that claim: a run in a working tree
// with a changed or untracked file tests something other than the commit. Only Jakob's card plan has the explicit
// committed-input exception. Open files never stop a push for that (Jakob 2026-11-23): the suite is then not run in that
// tree, and the commit is tested in the clean build tree instead (testInBuildTree).
export function dirtyTestInputs(names:string[]):string[] {
  return names.filter(name=>name!=='placements/default.json');
}

/** The Node that runs and the Node the project pins are the same major version; Volta holds the exact one where it is installed. */
export function sameNodeMajor(running:string,pinned:string):boolean {
  const major=(version:string)=>version.replace(/^v/,'').split('.')[0];
  return major(running)===major(pinned);
}

// A push runs the suite once (Jakob 2026-11-21: the tests are to be run seldom, not three times for one push). The
// pre-push hook does not run it again when the check (npm run check, here or in the build tree) has already passed it
// for this very HEAD: a receipt of kind publication with status pass, the same revision, no dirty input but the card plan
// and at most REUSE_HOURS old. With such a receipt the working tree is not asked about: what was tested is the commit.
// The scan of the outgoing commits still runs on every push, and npm run check itself always runs the suite.
export const REUSE_HOURS=6;
export type PassReceipt={id?:string;kind?:string;status?:string;revision?:string;dirtyInputs?:string[];finishedAt?:string;counts?:{fail?:number}};
export function reusablePass(receipts:PassReceipt[],head:string,now:number):PassReceipt|null {
  return receipts.find(r=>{
    const at=Date.parse(r.finishedAt??'');
    return r.kind==='publication'&&r.status==='pass'&&r.revision===head&&(r.counts?.fail??0)===0
      &&Array.isArray(r.dirtyInputs)&&dirtyTestInputs(r.dirtyInputs).length===0
      &&Number.isFinite(at)&&now-at>=0&&now-at<=REUSE_HOURS*3600e3;
  })??null;
}
// The receipts of the last REUSE_HOURS in the main checkout's journal (tools/evidence-store.ts writes them there, also
// from a linked worktree). A receipt that cannot be read is skipped: the suite then simply runs.
const mainCheckoutOf=(root:string)=>path.dirname(git(root,'rev-parse','--path-format=absolute','--git-common-dir').trim());
function recentReceipts(root:string,now:number):PassReceipt[] {
  const runs=path.join(mainCheckoutOf(root),'.runtime','evidence','runs');
  if(!existsSync(runs))return [];
  return readdirSync(runs).filter(name=>name.endsWith('.json')).flatMap(name=>{
    try{
      const file=path.join(runs,name);
      if(now-statSync(file).mtimeMs>REUSE_HOURS*3600e3)return [];
      return [JSON.parse(readFileSync(file,'utf8')) as PassReceipt];
    }catch{return [];}
  });
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

// The clean build tree beside the main checkout (AGENTS, "Git och samarbete": ../dealer-bygg): it stands between the
// times, and no session writes there.
export const buildTreeOf=(mainCheckout:string)=>path.join(path.dirname(mainCheckout),'dealer-bygg');
const samePath=(a:string,b:string)=>path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();

// The commit tested where nothing is open: the build tree is set to it and the check runs there (push-clean's steps
// without its push), so the open files of the tree the check was started in are neither tested nor touched. `base` is
// the commit the outgoing interval starts after, or '' when the remote's main is to be read.
function testInBuildTree(root:string,head:string,base:string,open:string[]) {
  const tree=buildTreeOf(mainCheckoutOf(root)),short=head.slice(0,7);
  const names=open.slice(0,5).join(', ')+(open.length>5?` och ${open.length-5} till`:'');
  if(samePath(tree,root))throw Error(`Byggträdet ${tree} har öppna filer (${names}). Det ska vara rent: ingen arbetar där.`);
  if(!existsSync(tree))throw Error(`Arbetsmappen har öppna filer (${names}), och byggträdet där committen då testas saknas. Skapa det en gång med: git worktree add --detach "${tree}" main`);
  console.log(`Arbetsmappen har öppna filer (${names}). De rörs inte och följer inte med: committen ${short} testas i byggträdet ${tree}. Det tar lika lång tid som testerna och visar inget förrän de är klara.`);
  try{checkClean(root,{commit:head,tree,dryRun:true,base},fileIo(tree));}
  catch(error){
    if(!(error instanceof Stop))throw error;
    throw Error(`Kontrollen av committen ${short} i byggträdet ${tree} stannade; stegens loggar ligger i ${path.join(path.dirname(tree),'push-logg')}.\n${error.message}`);
  }
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
  if(!sameNodeMajor(process.version,String(pkg.volta.node)))throw Error(`Använd samma huvudversion av Node som projektet (${pkg.volta.node}); aktuell ${process.version}.`);
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
  const findings=ranges.flatMap(r=>scanRange(root,r.local,r.remote));
  const names=git(root,'ls-tree','-r','--name-only','-z',head).split('\0');
  for(const name of CANONICAL)if(!names.includes(name))findings.push({level:'RED',path:name,message:'Ett kanoniskt dokument saknas; återställ eller samordna dokumentstrukturen.'});
  findings.forEach(emit);
  if(findings.some(f=>f.level==='RED'))throw Error('Publiceringen stoppad. Utred fynd och eventuell felaktig kontroll; använd inte --no-verify.');
  // From here on only a red test run on exactly this commit stops, never a file that lies open in the working tree.
  const tests=listedTests(git(root,'show',`${head}:package.json`));
  const sameHead=()=>{if(git(root,'rev-parse','HEAD').trim()!==head)throw Error('HEAD ändrades under kontrollen; kör om på stabil version.');};
  const reused=prePush?reusablePass(recentReceipts(root,Date.now()),head,Date.now()):null;
  if(reused)console.log(`Testsviten gick grön för samma HEAD i kontrollen ${reused.finishedAt} (körkvitto ${reused.id}); den körs inte en gång till.`);
  else{
    let open=changedTestInputs(root);
    if(!open.length){
      const env={...process.env,DEALER_TEST_KIND:'publication',DEALER_TEST_REVISION:head};
      const scratch=path.join(root,'.runtime','tmp');mkdirSync(scratch,{recursive:true});env.TEMP=scratch;env.TMP=scratch;
      const test=spawnSync(process.execPath,['--test','--test-concurrency=4','--test-reporter=spec','--test-reporter=./tools/test-receipt-reporter.ts','--test-reporter-destination=stdout','--test-reporter-destination=stderr',...tests],{cwd:root,env,stdio:'inherit'});
      sameHead();
      // A file written here while the suite ran makes that run say nothing about the commit, green or red: the commit
      // is tested once more where nothing is open.
      open=changedTestInputs(root);
      if(open.length)console.log('Filer ändrades i arbetsmappen medan testerna gick; den körningen räknas inte.');
      else if(test.error||test.status!==0)throw Error('Testkörningen misslyckades. Kontrollera både produktkod och test/hook innan publicering.');
    }
    if(open.length)testInBuildTree(root,head,ranges.length===1&&!zero.test(ranges[0].remote)?ranges[0].remote:'',open);
  }
  sameHead();
  console.log(`Kontrollerad HEAD ${head}; ${findings.filter(f=>f.level==='YELLOW').length} varningar. Eventuella Node-varningar visas separat. Detta verifierar inte media, rendering eller deploy.`);
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{main();}catch(error){console.error('[RÖD] '+(error instanceof Error?error.message:'Kontrollen misslyckades.'));process.exitCode=1;}
}
