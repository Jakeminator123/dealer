// Keeps D:/dealer-scratch in order. It deletes what can be made again and that nobody uses, moves old screenshots and
// finished work folders to D:/dealer-archive/slask with a ledger (arkiv.json) from which every move can be undone, and
// keeps everything else. A dry run is the default; --kor acts, and --kor --tyst acts without a person watching and then
// only on rules that need no judgment. The rules are data just below; the protections after them cannot be switched off.
// Sizes come from lstat. The only files read are the steering documents, data/*.json and the agents' memory, because
// they name the folders that are alive; links and junctions are never followed.
import {readdirSync,lstatSync,readFileSync,writeFileSync,renameSync,rmSync,mkdirSync,existsSync,realpathSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export type Action='RADERA'|'ARKIVERA';
// One rule: what it matches (a folder name, a file name, a Chrome profile by its contents, or a session folder directly
// under tmp/ or review/), how many days since the last change it waits, whether it may run unattended, and why.
export type Rule={name:string;action:Action;dir?:RegExp;file?:RegExp;profile?:boolean;session?:boolean;except?:RegExp;days:number;safe:boolean;reason:string};

// The rules, in the order they are tried. RADERA rules are tried over the whole tree first; ARKIVERA rules then see what
// is left. A rule with safe:false needs judgment: it runs only when named with --regel, never with --tyst.
export const RULES:Rule[]=[
 {name:'chrome-profil',action:'RADERA',profile:true,except:/meshy/i,days:1,safe:true,reason:'Headless Chrome-profil (mappen har Default/ och Chromes egna filer); skapas på nytt vid nästa start. En profil med "meshy" i sökvägen kan bära Jakobs inloggning och lämnas.'},
 {name:'node_modules',action:'RADERA',dir:/^node_modules$/i,days:3,safe:true,reason:'npm-beroenden; npm install gör om dem.'},
 {name:'node-cache',action:'RADERA',dir:/^node-compile-cache$/i,days:1,safe:true,reason:'Nodes kompileringscache; byggs om av sig själv.'},
 {name:'python-cache',action:'RADERA',dir:/^(pip-cache|__pycache__)$/i,days:3,safe:true,reason:'pip:s nedladdningscache och Pythons bytekod; görs om vid behov.'},
 {name:'chrome-temp',action:'RADERA',dir:/^scoped_dir\d+_\d+$/i,days:1,safe:true,reason:'Chromes egna tillfälliga mappar.'},
 {name:'tmp-filer',action:'RADERA',file:/\.tmp$/i,days:1,safe:true,reason:'Lösa tillfälliga filer från Node och verktyg.'},
 {name:'loggar',action:'RADERA',file:/\.log$/i,days:7,safe:true,reason:'Körloggar; efter en vecka har de gjort sitt.'},
 {name:'skarmbilder',action:'ARKIVERA',dir:/^(shots|screenshots|frames|frames3d|dump\d*|previews)$/i,days:7,safe:true,reason:'Skärmbilder och rutdumpar. Ingen arbetar i dem efter en vecka, men de kan förklara ett beslut i efterhand, så de flyttas i stället för att raderas.'},
 {name:'kontaktark',action:'ARKIVERA',dir:/^(sheets|crops|look|granskning(-.*)?|claude-eyes-.*)$/i,days:7,safe:false,reason:'Kontaktark och granskningsunderlag. HANDOFF: behåll kontaktark som stöder beslut. Kräver dom.'},
 {name:'avslutad-session',action:'ARKIVERA',session:true,days:14,safe:false,reason:'En sessions arbetsmapp (tmp/<session> eller review/<mapp>) som ingen har ändrat på två veckor. Kräver dom: sessionen kan vara pausad.'},
];

// Folders that are never deleted or moved, wherever they are, and never taken along with a folder around them.
export const NEVER:{name:RegExp;reason:string}[]=[
 {name:/^chrome-meshy$/i,reason:'Jakobs inloggade Meshy-fönster (DRIFT, minnet meshy-window).'},
];
// A folder holding one of these files holds paid films and pictures or their receipts: it is never deleted or moved.
export const LEDGER=/^(bestallningar.*\.json|order-.*\.json|uploads-.*\.json|tasks-.*\.json|.*kvitto.*|receipt.*\.json|request\.lock)$/i;
// Films and sound are never deleted, whatever folder they are in.
export const MEDIA=/\.(mp4|mov|webm|mkv|wav|mp3|m4a)$/i;
// The documents read on every run for paths they name (relative to the repo), and the agents' memory beside them.
export const SOURCES=['HANDOFF.md','README.md','AGENTS.md','docs/*.md','data/*.json'];
export const DEFAULTS={root:'D:/dealer-scratch',archive:'D:/dealer-archive/slask',days:3,maxSeconds:90,lockHours:2};

const DAY=864e5;
const posix=(p:string)=>p.replaceAll('\\','/');
const key=(rel:string)=>rel.toLowerCase(); // Windows paths compare without case
const inside=(child:string,parent:string)=>{const r=path.relative(parent,child);return r!==''&&!r.startsWith('..')&&!path.isAbsolute(r);};
const gb=(bytes:number)=>(bytes/1e9).toFixed(2).replace('.',',')+' GB';
const when=(ms:number)=>new Date(ms).toLocaleString('sv-SE',{dateStyle:'short',timeStyle:'short'});

// --- The tree, measured with lstat only -----------------------------------------------------------------------------
export type Entry={rel:string;abs:string;name:string;dir:boolean;link:boolean;size:number;files:number;newest:number;children:Entry[];
 ledgers:string[];odd:string;hasMedia:boolean;profile:boolean;venv:boolean;never:boolean};

function walk(abs:string,rel:string,deadline:number,ignore:Set<string>=new Set()):Entry{
 const st=lstatSync(abs),name=rel?path.posix.basename(rel):'';
 const e:Entry={rel,abs,name,dir:st.isDirectory()&&!st.isSymbolicLink(),link:st.isSymbolicLink(),size:0,files:0,newest:st.mtimeMs,children:[],ledgers:[],odd:'',hasMedia:false,profile:false,venv:false,never:NEVER.some(n=>n.name.test(name))};
 if(e.link){e.odd='länk';return e;}
 if(!e.dir){e.size=st.size;e.files=1;e.hasMedia=MEDIA.test(name);return e;}
 // A folder whose entries this run removed has a new time of its own; that is not someone else's work.
 if(ignore.has(key(rel)))e.newest=0;
 if(Date.now()>deadline)throw Error('Genomgången tog för lång tid; inget är ändrat.');
 let names:string[];
 try{names=readdirSync(abs);}catch{e.odd='oläsbar';return e;}
 for(const child of names){
  let c:Entry;
  try{c=walk(path.join(abs,child),rel?rel+'/'+child:child,deadline,ignore);}catch(error){if(error instanceof Error&&error.message.startsWith('Genomgången'))throw error;e.odd||='oläsbar';continue;}
  e.children.push(c);e.size+=c.size;e.files+=c.files;e.newest=Math.max(e.newest,c.newest);e.hasMedia||=c.hasMedia;
  if(c.odd&&!e.odd)e.odd=c.odd;
  if(!c.dir&&!c.link&&LEDGER.test(child))e.ledgers.push(c.rel);
  if(!c.dir&&child==='pyvenv.cfg')e.venv=true;
 }
 const has=(n:string)=>e.children.some(c=>c.name===n);
 e.profile=e.children.some(c=>c.dir&&c.name==='Default')&&['Local State','Crashpad','GrShaderCache','ShaderCache','component_crx_cache'].some(has);
 return e;
}

function indexOf(tree:Entry){const map=new Map<string,Entry>(),all:Entry[]=[];const add=(e:Entry)=>{map.set(key(e.rel),e);all.push(e);e.children.forEach(add);};add(tree);return {map,all};}

// --- Paths that documents and running processes name ----------------------------------------------------------------
export type Anchor={segs:RegExp[];kind:'dokument'|'process'|'liggare'|'aldrig'|'python';text:string};
const segRegex=(s:string)=>new RegExp('^'+s.split('*').map(p=>p.replace(/[.+?^${}()|[\]\\]/g,'\\$&')).join('.*')+'$','i');
// related: the candidate lies in the anchored folder, is it, or holds it. All three keep the candidate.
export const related=(rel:string,segs:RegExp[])=>{const parts=rel.split('/'),k=Math.min(parts.length,segs.length);for(let i=0;i<k;i++)if(!segs[i].test(parts[i]))return false;return true;};

function expand(text:string,limit=32):string[]{
 const m=/\{([^{}]*)\}/.exec(text);if(!m)return [text];
 const out:string[]=[];for(const alt of m[1].split(','))for(const t of expand(text.slice(0,m.index)+alt+text.slice(m.index+m[0].length),limit))if(out.length<limit)out.push(t);
 return out;
}
// The segments of a named path below the root, cut where a placeholder (<id>, …) begins.
function segments(relText:string):string[]{
 const out:string[]=[];
 for(let s of posix(relText).split('/')){
  if(!s||s==='.')continue;
  if(s==='..'||/[<>…$]|\.\.\./.test(s))break;
  s=s.replace(/[.:;,]+$/,'');if(!s)break;
  out.push(s);
 }
 return out;
}
// Every path below the root that a text names: written out from the root (D:/dealer-scratch/…, also with backslashes
// or JSON-escaped), or in backticks relative to it (`tmp/x`, `review/x`) or to tmp (`paow/skript/`, `trailer*/clips`).
export function namedIn(text:string,root:string,sessions:Set<string>):Array<{segs:string[];line:number;text:string}>{
 const found:Array<{segs:string[];line:number;text:string}>=[];
 const rootPattern=posix(root).replace(/\/+$/,'').split('/').map(p=>p.replace(/[.+?^${}()|[\]\\]/g,'\\$&')).join('[\\\\/]+');
 const absolute=new RegExp(rootPattern+'((?:[\\\\/]+(?:[^\\s`\'"()\\[\\]|,;{}\\\\/]|\\{[^}\\s]*\\})+)*)','gi');
 text.split('\n').forEach((lineText,i)=>{
  for(const m of lineText.matchAll(absolute))for(const t of expand(m[1]??'')){const segs=segments(t);if(segs.length)found.push({segs,line:i+1,text:m[0]});}
  for(const m of lineText.matchAll(/`([^`\s]+)`/g)){
   const token=posix(m[1]).replace(/^\.\//,'');if(!token.includes('/')||/^[a-z]:/i.test(token))continue;
   const first=token.split('/')[0];
   const base=['tmp','review','renders'].includes(first.toLowerCase())?'':[...sessions].some(s=>segRegex(first).test(s))?'tmp/':null;
   if(base===null)continue;
   for(const t of expand(token)){const segs=segments(base+t);if(segs.length)found.push({segs,line:i+1,text:m[1]});}
  }
 });
 return found;
}

// A named file keeps itself, and its folder too when that lies below a session folder (a report and its pictures); a
// file directly in a session folder does not freeze the whole session. A named folder keeps everything in it. Names
// that reach no deeper than tmp/ or review/ keep nothing below them.
function anchorFor(segs:string[],map:Map<string,Entry>,kind:Anchor['kind'],text:string,processFile=false):Anchor[]{
 if(segs.length<2)return [];
 const literal=!segs.some(s=>s.includes('*')),entry=literal?map.get(key(segs.join('/'))):undefined;
 const isFile=entry?!entry.dir:/\.[a-z0-9]{1,5}$/i.test(segs.at(-1)!);
 const out:Anchor[]=[{segs:segs.map(segRegex),kind,text}];
 const parent=segs.slice(0,-1);
 if(isFile&&(parent.length>=3||(processFile&&parent.length>=2)))out.push({segs:parent.map(segRegex),kind,text});
 return out;
}

export type Proc={pid:number;cmd:string};
export function runningCommands():Proc[]{
 const out=process.platform==='win32'
  ?execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId)`t$($_.CommandLine)" }'],{encoding:'utf8',maxBuffer:64*1024*1024,windowsHide:true,stdio:['ignore','pipe','ignore']})
  :execFileSync('ps',['-eo','pid=,args='],{encoding:'utf8',maxBuffer:64*1024*1024});
 return out.split(/\r?\n/).map(line=>{const m=/^\s*(\d+)\s+(.*)$/.exec(line);return m?{pid:Number(m[1]),cmd:m[2]}:null;}).filter((p):p is Proc=>!!p&&!!p.cmd.trim());
}
// Paths below the root that a command line names; the folder of a named file counts as in use.
function processAnchors(procs:Proc[],root:string,map:Map<string,Entry>):Anchor[]{
 const rootLower=posix(root).replace(/\/+$/,'').toLowerCase(),out:Anchor[]=[];
 for(const p of procs){
  if(p.pid===process.pid||p.pid===process.ppid)continue;
  const cmd=posix(p.cmd).replace(/\/{2,}/g,'/').toLowerCase();
  let at=cmd.indexOf(rootLower);
  while(at>=0){
   const tail=cmd.slice(at+rootLower.length),m=/^(\/[^\s"'`;|<>]*)?/.exec(tail);
   if(m&&(tail===''||/^[\/\s"'`;]/.test(tail)))out.push(...anchorFor(segments(m[1]??''),map,'process',`process ${p.pid}: ${p.cmd.trim().slice(0,90)}`,true));
   at=cmd.indexOf(rootLower,at+1);
  }
 }
 return out;
}

function memoryDir(repo:string){const name=path.resolve(repo).replace(/[^A-Za-z0-9]/g,'-');return path.join(os.homedir(),'.claude','projects',name,'memory');}
function sourceFiles(repo:string,memory:string|null):string[]{
 const files:string[]=[];
 for(const pattern of SOURCES){
  if(!pattern.includes('*')){const f=path.join(repo,pattern);if(existsSync(f))files.push(f);continue;}
  const [dir,glob]=[path.join(repo,path.posix.dirname(pattern)),segRegex(path.posix.basename(pattern))];
  if(existsSync(dir))for(const n of readdirSync(dir).sort())if(glob.test(n))files.push(path.join(dir,n));
 }
 if(memory&&existsSync(memory))for(const n of readdirSync(memory).sort())if(n.endsWith('.md'))files.push(path.join(memory,n));
 return files;
}

// --- The plan ---------------------------------------------------------------------------------------------------------
export type Why={kind:'ålder'|'dokument'|'process'|'liggare'|'aldrig'|'python'|'länk'|'media'|'undantag';text:string};
export type Item={rel:string;rule:Rule;size:number;files:number;newest:number;why:Why[];status:'utförs'|'kräver dom'|'ej vald'|'skyddat'};
type Ctx={root:string;map:Map<string,Entry>;anchors:Anchor[];now:number;days:number;selected:Set<string>|null};

function protections(e:Entry,rule:Rule|null,ctx:Ctx):Why[]{
 const why:Why[]=[],seen=new Set<string>();
 for(const a of ctx.anchors)if(related(e.rel,a.segs)){const t=a.text;if(seen.has(a.kind+t))continue;seen.add(a.kind+t);why.push({kind:a.kind,text:t});}
 if(rule?.except?.test(e.rel))why.push({kind:'undantag',text:`regeln ${rule.name} undantar sökvägar med ${rule.except.source}`});
 if(e.odd)why.push({kind:'länk',text:e.odd==='länk'?'innehåller en länk eller junction, som aldrig följs':'kunde inte läsas helt'});
 const days=Math.max(ctx.days,rule?.days??0);
 if(e.newest>ctx.now-days*DAY)why.push({kind:'ålder',text:`ändrad ${when(e.newest)} (gräns ${days} dygn)`});
 if(rule?.action==='RADERA'&&e.hasMedia)why.push({kind:'media',text:'innehåller film eller ljud, som aldrig raderas'});
 return why;
}
const matches=(r:Rule,e:Entry)=>(r.profile?e.dir&&e.profile:r.dir?e.dir&&r.dir.test(e.name):r.file?!e.dir&&r.file.test(e.name):r.session?e.dir&&e.rel.split('/').length===2:false);

export function plan(tree:Entry,ctx:Ctx):Item[]{
 const status=(rule:Rule,why:Why[]):Item['status']=>why.length?'skyddat':ctx.selected?(ctx.selected.has(rule.name)?'utförs':'ej vald'):rule.safe?'utförs':'kräver dom';
 const pass=(rules:Rule[],skip:Set<string>,deleted:Item[])=>{
  const out:Item[]=[];
  const visit=(e:Entry,acc:Item[])=>{
   for(const c of e.children){
    if(c.link||skip.has(key(c.rel)))continue;
    const rule=c.rel.split('/').length>=2?rules.find(r=>matches(r,c)):undefined;
    // A Chrome profile or a Python environment is one thing: no rule looks inside it (a profile's LevelDB keeps
    // *.log files that are not logs).
    const whole=c.profile||c.venv;
    if(!rule){if(c.dir&&!whole)visit(c,acc);continue;}
    const why=protections(c,rule,ctx);
    const gone=deleted.filter(d=>d.rel.startsWith(c.rel+'/'));
    const item:Item={rel:c.rel,rule,size:c.size-gone.reduce((s,d)=>s+d.size,0),files:c.files-gone.reduce((s,d)=>s+d.files,0),newest:c.newest,why,status:status(rule,why)};
    if(item.status==='utförs'||rule.action==='RADERA'||!c.dir||whole){acc.push(item);continue;}
    // A folder that would be moved but is protected or waits for judgment is looked into: a smaller match inside it
    // may be free (shots/ in a session a document names by one file, or in a session nobody has judged yet). A
    // protected folder is reported only when nothing inside it matches; one waiting for judgment is reported
    // beside what is moved from inside it first. What a deletion rule matched is never looked into.
    const inner:Item[]=[];visit(c,inner);
    if(why.length){acc.push(...(inner.length?inner:[item]));continue;}
    const first=inner.filter(i=>i.status==='utförs');
    item.size-=first.reduce((s,i)=>s+i.size,0);item.files-=first.reduce((s,i)=>s+i.files,0);
    acc.push(...first,item);
   }
  };
  visit(tree,out);return out;
 };
 const removing=pass(RULES.filter(r=>r.action==='RADERA'),new Set(),[]);
 // What a deletion rule matched is not looked at again for moving; what will be deleted is not counted in a move.
 const deleted=removing.filter(i=>i.status==='utförs');
 const moving=pass(RULES.filter(r=>r.action==='ARKIVERA'),new Set(removing.map(d=>key(d.rel))),deleted);
 return [...removing,...moving];
}

// --- Ledger and execution ---------------------------------------------------------------------------------------------
export type Post={post:number;atgard:Action;regel:string;fran:string;till?:string;tid:string;byte:number;filer:number;status:'flyttar'|'arkiverad'|'raderad'|'misslyckad'|'aterstalld';aterstalld?:string;fel?:string};
type Ledger={beskrivning:string;poster:Post[]};
const ledgerPath=(archive:string)=>path.join(archive,'arkiv.json');
function readLedger(archive:string):Ledger{
 const f=ledgerPath(archive);
 if(!existsSync(f))return {beskrivning:'Liggare för städningen av D:/dealer-scratch (tools/scratch-clean.ts). ARKIVERA-poster flyttas tillbaka med: npm run stada -- --aterstall <post>.',poster:[]};
 return JSON.parse(readFileSync(f,'utf8')) as Ledger;
}
function writeLedger(archive:string,ledger:Ledger){mkdirSync(archive,{recursive:true});const f=ledgerPath(archive);writeFileSync(f+'.tmp',JSON.stringify(ledger,null,1)+'\n');renameSync(f+'.tmp',f);}

function lock(archive:string,hours:number){
 mkdirSync(archive,{recursive:true});const f=path.join(archive,'.stada.lock');
 for(let attempt=0;attempt<2;attempt++){
  try{const fd=openSync(f,'wx');writeFileSync(fd,JSON.stringify({pid:process.pid,tid:new Date().toISOString()}));closeSync(fd);return ()=>{try{unlinkSync(f);}catch{}};}
  catch{let stale=false;try{stale=Date.now()-lstatSync(f).mtimeMs>hours*3600e3;}catch{}if(!stale)break;try{unlinkSync(f);}catch{}}
 }
 throw Error('En annan städning pågår (arkivets .stada.lock); inget är ändrat.');
}

export type Env={root?:string;archive?:string;repo?:string;memory?:string|null;processes?:Proc[];now?:number;maxSeconds?:number;out?:(line:string)=>void;err?:(line:string)=>void};
const FLAGS=new Set(['--kor','--tyst','--lista','--regler','--hjalp']),VALUED=new Set(['--regel','--dygn','--nu','--forklara','--aterstall']);

function parse(argv:string[]){
 const flags=new Set<string>(),values=new Map<string,string>();
 for(let i=0;i<argv.length;i++){
  const a=argv[i];
  if(FLAGS.has(a))flags.add(a);
  else if(VALUED.has(a)){const v=argv[++i];if(v===undefined||v.startsWith('--'))throw Error(`${a} behöver ett värde.`);values.set(a,v);}
  else throw Error(`Okänt argument: ${a}. Giltiga: ${[...FLAGS,...VALUED].join(' ')}`);
 }
 return {flags,values};
}

function checkRoots(root:string,archive:string,repo:string){
 if(path.parse(root).root===root)throw Error('Roten får inte vara en hel disk.');
 for(const [a,b] of [[archive,root],[root,archive],[repo,root],[root,repo]])if(a===b||inside(a,b))throw Error(`Roten, arkivet och repot måste ligga isär: ${a} / ${b}`);
}

export function run(argv:string[],env:Env={}):number{
 const out=env.out??((l:string)=>console.log(l)),err=env.err??((l:string)=>console.error(l));
 try{return runInner(argv,env,out);}catch(error){err('[stada] '+(error instanceof Error?error.message:String(error)));return 1;}
}

function runInner(argv:string[],env:Env,out:(l:string)=>void):number{
 const {flags,values}=parse(argv);
 if(flags.has('--hjalp')){out('npm run stada [-- --kor] [--tyst] [--regel a,b] [--dygn N] [--lista] [--regler] [--nu ÅÅÅÅ-MM-DD] [--forklara <sökväg>] [--aterstall <post>]');return 0;}
 if(flags.has('--regler')){for(const r of RULES)out(`${r.name.padEnd(17)} ${r.action.padEnd(8)} ${String(r.days).padStart(2)} dygn  ${r.safe?'säker  ':'kräver dom'}  ${r.reason}`);return 0;}
 const root=path.resolve(env.root??DEFAULTS.root),archive=path.resolve(env.archive??DEFAULTS.archive);
 const repo=path.resolve(env.repo??path.join(path.dirname(fileURLToPath(import.meta.url)),'..'));
 checkRoots(root,archive,repo);
 const act=flags.has('--kor'),quiet=flags.has('--tyst');
 if(quiet&&!act)throw Error('--tyst gäller bara tillsammans med --kor.');
 if(values.has('--aterstall'))return restore(values.get('--aterstall')!,root,archive,out);
 const days=values.has('--dygn')?Number(values.get('--dygn')):DEFAULTS.days;
 if(!Number.isFinite(days)||days<1)throw Error('--dygn måste vara minst 1: det nyss ändrade skyddas alltid.');
 let now=env.now??Date.now();
 if(values.has('--nu')){if(act)throw Error('--nu gäller bara torrkörning.');now=Date.parse(values.get('--nu')!);if(!Number.isFinite(now))throw Error('--nu: ange ett datum, till exempel 2026-11-26.');}
 const selected=values.has('--regel')?new Set(values.get('--regel')!.split(',').map(s=>s.trim()).filter(Boolean)):null;
 for(const name of selected??[]){const r=RULES.find(x=>x.name===name);if(!r)throw Error(`Ingen regel heter ${name}.`);if(quiet&&!r.safe)throw Error(`--tyst utför aldrig en regel som kräver dom (${name}).`);}
 if(!existsSync(root))throw Error(`Slasken finns inte: ${root}`);
 if(!existsSync(path.join(repo,'HANDOFF.md')))throw Error(`HANDOFF.md saknas i ${repo}; utan styrdokumenten vet verktyget inte vad som lever.`);

 const started=Date.now(),deadline=started+(env.maxSeconds??DEFAULTS.maxSeconds)*1000;
 const tree=walk(root,'',deadline),{map,all}=indexOf(tree);
 const sessions=new Set(all.filter(e=>e.dir&&e.rel.split('/').length===2&&e.rel.toLowerCase().startsWith('tmp/')).map(e=>e.name));
 const anchors:Anchor[]=[];
 // Documents and memory, read on every run.
 const memory=env.memory===undefined?memoryDir(repo):env.memory;
 const sources=sourceFiles(repo,memory);let named=0;
 for(const f of sources){
  const label=inside(f,repo)?posix(path.relative(repo,f)):'minnet/'+path.basename(f);
  for(const n of namedIn(readFileSync(f,'utf8'),root,sessions)){const a=anchorFor(n.segs,map,'dokument',`${label}:${n.line} ${n.text}`);if(a.length)named++;anchors.push(...a);}
 }
 // Paid material, Python environments and the never-list, found in the tree itself.
 for(const e of all){
  if(e.ledgers.length&&e.rel)anchors.push({segs:e.rel.split('/').map(segRegex),kind:'liggare',text:`beställningsliggare eller kvitto (${e.ledgers[0]}${e.ledgers.length>1?` och ${e.ledgers.length-1} till`:''})`});
  if(e.venv)anchors.push({segs:e.rel.split('/').map(segRegex),kind:'python',text:`Python-miljö (${e.rel}/pyvenv.cfg)`});
  if(e.never&&e.dir)anchors.push({segs:e.rel.split('/').map(segRegex),kind:'aldrig',text:NEVER.find(n=>n.name.test(e.name))!.reason});
 }
 // Running processes. Without them nothing is done: a folder in use must not go.
 let procs=env.processes,procNote='';
 if(!procs){try{procs=runningCommands();}catch{procs=[];procNote='processlistan gick inte att läsa';if(act)throw Error('Processlistan gick inte att läsa; inget är ändrat.');}}
 const procAnchors=processAnchors(procs,root,map);anchors.push(...procAnchors);
 const ctx:Ctx={root,map,anchors,now,days,selected};
 const items=plan(tree,ctx);
 const seconds=((Date.now()-started)/1000).toFixed(0);

 if(values.has('--forklara'))return explain(values.get('--forklara')!,root,map,items,ctx,out);

 if(!act){report(items,{root,all:tree,seconds,days,named,sources:sources.length,procs:new Set(procAnchors.map(a=>a.text)).size,ledgers:anchors.filter(a=>a.kind==='liggare').length,procNote,now,list:flags.has('--lista')},out);return 0;}

 // Acting: each folder is measured again just before it goes, and left if anything about it has changed.
 const release=lock(archive,DEFAULTS.lockHours);
 const done={deleted:[] as Item[],moved:[] as Item[],failed:[] as Array<{item:Item;why:string}>},touched=new Set<string>();
 try{
  const ledger=readLedger(archive);let next=Math.max(0,...ledger.poster.map(p=>p.post))+1;
  const month=(()=>{const d=new Date(now);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;})();
  const realRoot=realpathSync(root);
  for(const item of items.filter(i=>i.status==='utförs')){
   const abs=path.join(root,...item.rel.split('/'));
   const fail=(why:string)=>{done.failed.push({item,why});};
   if(!existsSync(abs)){fail('finns inte längre');continue;}
   let fresh:Entry;
   try{fresh=walk(abs,item.rel,Date.now()+60_000,touched);}catch{fail('gick inte att mäta igen');continue;}
   const real=realpathSync(abs);
   if(!inside(real,realRoot)){fail('ligger inte längre i slasken');continue;}
   const again=protections(fresh,item.rule,ctx).filter(w=>w.kind==='ålder'||w.kind==='länk'||w.kind==='media');
   const anyLedger=(x:Entry):boolean=>x.ledgers.length>0||x.children.some(anyLedger);
   if(anyLedger(fresh)||again.length){fail(again[0]?.text??'en liggare har tillkommit');continue;}
   const post:Post={post:next++,atgard:item.rule.action,regel:item.rule.name,fran:posix(abs),tid:new Date().toISOString(),byte:fresh.size,filer:fresh.files,status:'flyttar'};
   if(item.rule.action==='RADERA'){
    try{rmSync(abs,{recursive:true,force:false,maxRetries:2});post.status='raderad';done.deleted.push(item);}
    catch(error){post.status='misslyckad';post.fel=String(error instanceof Error?error.message:error).slice(0,200);fail('kunde inte raderas helt');}
    ledger.poster.push(post);
   }else{
    const target=path.join(archive,month,...item.rel.split('/'));
    if(existsSync(target)){fail('arkivet har redan en mapp med samma sökväg denna månad');next--;continue;}
    post.till=posix(target);ledger.poster.push(post);writeLedger(archive,ledger); // the intent is written before the move
    try{mkdirSync(path.dirname(target),{recursive:true});renameSync(abs,target);post.status='arkiverad';done.moved.push(item);}
    catch(error){post.status='misslyckad';post.fel=String(error instanceof Error?error.message:error).slice(0,200);fail('kunde inte flyttas');}
   }
   writeLedger(archive,ledger);
   const parts=item.rel.split('/');for(let n=parts.length-1;n>=1;n--)touched.add(key(parts.slice(0,n).join('/')));
  }
 }finally{release();}
 const sum=(list:Item[])=>list.reduce((s,i)=>s+i.size,0);
 const waiting=items.filter(i=>i.status==='kräver dom');
 if(quiet)out(`stada ${when(Date.now())}: raderat ${done.deleted.length} st ${gb(sum(done.deleted))}, arkiverat ${done.moved.length} st ${gb(sum(done.moved))}${done.failed.length?`, lämnat ${done.failed.length} st`:''}, väntar på dom ${waiting.length} st ${gb(sum(waiting))}.`);
 else{
  for(const i of done.deleted)out(`raderad   ${gb(i.size).padStart(9)}  ${i.rel}  [${i.rule.name}]`);
  for(const i of done.moved)out(`arkiverad ${gb(i.size).padStart(9)}  ${i.rel}  [${i.rule.name}]`);
  for(const f of done.failed)out(`lämnad    ${gb(f.item.size).padStart(9)}  ${f.item.rel}  (${f.why})`);
  out(`Raderat ${gb(sum(done.deleted))}, arkiverat ${gb(sum(done.moved))} till ${posix(archive)}. Liggare: ${posix(ledgerPath(archive))}. Väntar på dom: ${waiting.length} st ${gb(sum(waiting))}.`);
 }
 return done.failed.some(f=>f.why.startsWith('kunde inte'))?1:0;
}

function restore(which:string,root:string,archive:string,out:(l:string)=>void):number{
 const ledger=readLedger(archive),post=ledger.poster.find(p=>String(p.post)===which);
 if(!post)throw Error(`Ingen post ${which} i ${posix(ledgerPath(archive))}.`);
 if(post.atgard!=='ARKIVERA'||!post.till)throw Error(`Post ${which} är en radering; den går inte att återställa.`);
 if(post.status!=='arkiverad')throw Error(`Post ${which} har status ${post.status}.`);
 const from=path.resolve(post.fran),to=path.resolve(post.till);
 if(!inside(from,root))throw Error(`Post ${which} pekar utanför slasken (${post.fran}); inget flyttat.`);
 if(!inside(to,archive))throw Error(`Post ${which} pekar utanför arkivet (${post.till}); inget flyttat.`);
 if(!existsSync(to))throw Error(`Det arkiverade finns inte: ${post.till}`);
 if(existsSync(from))throw Error(`Platsen är upptagen: ${post.fran}; inget flyttat.`);
 if(lstatSync(to).isSymbolicLink())throw Error('Det arkiverade är en länk; inget flyttat.');
 // The way back may not run through a link that has appeared in the scratch folder since.
 let near=path.dirname(from);while(!existsSync(near))near=path.dirname(near);
 if(near!==root&&!inside(realpathSync(near),realpathSync(root)))throw Error(`Vägen tillbaka går genom en länk ut ur slasken (${posix(near)}); inget flyttat.`);
 const release=lock(archive,DEFAULTS.lockHours);
 try{mkdirSync(path.dirname(from),{recursive:true});renameSync(to,from);post.status='aterstalld';post.aterstalld=new Date().toISOString();writeLedger(archive,ledger);}
 finally{release();}
 out(`Återställd post ${which}: ${post.till} → ${post.fran}`);
 return 0;
}

function explain(arg:string,root:string,map:Map<string,Entry>,items:Item[],ctx:Ctx,out:(l:string)=>void):number{
 const abs=path.isAbsolute(arg)?path.resolve(arg):path.resolve(root,arg);
 if(!inside(abs,root)){out(`${posix(arg)}: utanför ${posix(root)}. Verktyget rör aldrig något där.`);return 0;}
 const rel=posix(path.relative(root,abs)),e=map.get(key(rel));
 if(!e){out(`${rel}: finns inte (eller ligger bakom en länk, som aldrig följs).`);return 0;}
 out(`${rel}: ${gb(e.size)}, ${e.files} filer, senast ändrad ${when(e.newest)}.`);
 const cover=items.find(i=>i.rel===e.rel||e.rel.startsWith(i.rel+'/'));
 if(cover){
  const verb=cover.status==='utförs'?cover.rule.action+':':cover.status==='skyddat'?'BEHÅLL, fast':`${cover.rule.action} först efter dom (${cover.status}):`;
  out(`  ${verb} regeln ${cover.rule.name} träffar${cover.rel!==e.rel?` ${cover.rel}, där den ligger`:''}. ${cover.rule.reason}`);
  for(const w of cover.why)out(`  skydd: ${w.kind}: ${w.text}`);
 }else{
  const inner=items.filter(i=>i.rel.startsWith(e.rel+'/'));
  out(`  BEHÅLL${inner.length?' som helhet':''}: ingen regel träffar ${inner.length?'mappen själv':'den'}.`);
  for(const i of inner.slice(0,12))out(`  innehåller ${i.rel} (${i.rule.name}, ${i.status}, ${gb(i.size)})`);
  const own=protections(e,null,{...ctx,days:ctx.days});
  for(const w of own)out(`  skydd: ${w.kind}: ${w.text}`);
 }
 return 0;
}

function report(items:Item[],o:{root:string;all:Entry;seconds:string;days:number;named:number;sources:number;procs:number;ledgers:number;procNote:string;now:number;list:boolean},out:(l:string)=>void){
 const sum=(list:Item[])=>list.reduce((s,i)=>s+i.size,0),cell=(list:Item[])=>list.length?`${String(list.length).padStart(3)} st ${gb(sum(list)).padStart(9)}`:''.padStart(16);
 out(`Städning av ${posix(o.root)}: torrkörning, inget ändras${o.now<Date.now()-6e4||o.now>Date.now()+6e4?` (räknat som om det vore ${when(o.now)})`:''}. Utför med: npm run stada -- --kor`);
 out(`Genomgånget ${o.all.files} filer, ${gb(o.all.size)} på ${o.seconds} s. Skydd: ändrat senaste ${o.days} dygn; ${o.named} sökvägar i ${o.sources} dokument; ${o.procs} processer; ${o.ledgers} mappar med liggare eller kvitto${o.procNote?`; OBS ${o.procNote}`:''}.`);
 out('');
 out(`${'regel'.padEnd(17)} ${'åtgärd'.padEnd(8)} ${'utförs'.padEnd(16)} ${'kräver dom'.padEnd(16)} ${'skyddat'.padEnd(16)}`);
 for(const r of RULES){
  const mine=items.filter(i=>i.rule===r);
  out(`${r.name.padEnd(17)} ${r.action.padEnd(8)} ${cell(mine.filter(i=>i.status==='utförs'))} ${cell(mine.filter(i=>i.status==='kräver dom'||i.status==='ej vald'))} ${cell(mine.filter(i=>i.status==='skyddat'))}`);
 }
 const run=items.filter(i=>i.status==='utförs'),judged=items.filter(i=>i.status==='kräver dom'||i.status==='ej vald'),kept=items.filter(i=>i.status==='skyddat');
 out('');
 out(`Summa: radera ${gb(sum(run.filter(i=>i.rule.action==='RADERA')))}; arkivera ${gb(sum(run.filter(i=>i.rule.action==='ARKIVERA')))}; väntar på dom ${gb(sum(judged))}; skyddade träffar ${gb(sum(kept))}.`);
 const byKind=new Map<string,Item[]>();for(const i of kept){const k=i.why[0].kind;byKind.set(k,[...(byKind.get(k)??[]),i]);}
 if(byKind.size)out('Skyddade träffar efter första skälet: '+[...byKind].map(([k,l])=>`${k} ${l.length} st ${gb(sum(l))}`).join('; ')+'.');
 if(!o.list){out('Varje träff: --lista. Varför något lämnas: --forklara <sökväg>. Reglerna: --regler.');return;}
 out('');
 for(const i of [...items].sort((a,b)=>a.rel.localeCompare(b.rel))){
  const tag=i.status==='utförs'?i.rule.action:i.status==='skyddat'?'SKYDDAT':i.status.toUpperCase();
  out(`${tag.padEnd(10)} ${gb(i.size).padStart(9)}  ${i.rel}  [${i.rule.name}]${i.why.length?'  '+i.why.slice(0,2).map(w=>w.kind+': '+w.text).join(' | '):''}`);
 }
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))process.exitCode=run(process.argv.slice(2));
