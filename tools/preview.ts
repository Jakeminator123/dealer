import http from 'node:http';
import {readFile,mkdir,writeFile,stat,unlink,realpath,readdir} from 'node:fs/promises';
import {createReadStream,existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
import path from 'node:path';
import {placementStore,StoreError} from './placement-store.ts';
import {reviewStore} from './review-store.ts';
import {createSession,SessionError,type Session,type SessionOptions} from '../game/session.ts';
import {tabRegistry,localPath,type Tab,type Reason} from './tab-registry.ts';
import {resolveStudio} from './studio-files.ts';
const port=4319,origin=`http://127.0.0.1:${port}`,state='.runtime/preview.json';
const args=process.argv.slice(2),has=(flag:string)=>args.includes(flag);
// The same checkout, whatever case the shell wrote the drive letter in (Git Bash and PowerShell differ on Windows).
const sameRoot=(a:unknown,b:string)=>typeof a==='string'&&(process.platform==='win32'?path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase():path.resolve(a)===path.resolve(b));
const readState=async()=>{try{return JSON.parse(await readFile(state,'utf8')) as {root?:string;token?:string};}catch{return null;}};
const health=async()=>{try{const r=await fetch(origin+'/health',{signal:AbortSignal.timeout(1500)});return r.ok?await r.json() as {name?:string;root?:string}:null;}catch{return null;}};
// Starts the server as its own process, without a window, with scratch on D: where that folder exists, and waits until it
// answers. It stops by itself when the lab tab has been closed for a minute. On Windows a child started by Node inherits
// the caller's open handles, so a server started that way would hold the caller's output pipe and a command that reads it
// (an agent's shell, "| more") would never end. Start-Process hands the start to the shell, which passes no handles on.
const startServer=async()=>{
 const scratch='D:/dealer-scratch/tmp',env=existsSync(scratch)?{...process.env,TEMP:scratch,TMP:scratch}:process.env;
 const quote=(text:string)=>`'${text.replaceAll("'","''")}'`;
 if(process.platform==='win32')spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Start-Process -FilePath ${quote(process.execPath)} -ArgumentList 'tools/preview.ts' -WorkingDirectory ${quote(process.cwd())} -WindowStyle Hidden`],{env,stdio:'ignore',windowsHide:true});
 else spawn(process.execPath,['tools/preview.ts'],{cwd:process.cwd(),env,detached:true,stdio:'ignore'}).unref();
 for(let i=0;i<60;i++){await new Promise(done=>setTimeout(done,250));if(await health())return;}
 throw Error('Labbservern startade inte.');
};
if(has('--restart')){
 // A new server for changed server code, without losing the lab tab: the tab is told, waits and reloads by itself.
 const alive=await health();
 if(alive&&(alive.name!=='dealer'||!sameRoot(alive.root,process.cwd())))throw Error('Preview identity differs');
 if(alive){const s=await readState();if(!s?.token)throw Error('Preview control failed');
  const r=await fetch(origin+'/stop?restart=1',{method:'POST',headers:{'x-dealer-token':s.token}});if(!r.ok)throw Error('Preview control failed');
  for(let i=0;i<40&&await health();i++)await new Promise(done=>setTimeout(done,250));}
 await startServer();console.log(alive?'Labbservern är omstartad; labbfliken laddar om sig själv.':'Labbservern är startad.');
}else if(has('--stop')||has('--status')){
 const alive=await health();
 // Not running is an answer, not a failure; a status file left by a server that was killed is cleared on the way.
 if(!alive){const s=await readState();if(s&&sameRoot(s.root,process.cwd()))await unlink(state).catch(()=>{});console.log('Labbservern är inte igång.');}
 else if(alive.name!=='dealer'||!sameRoot(alive.root,process.cwd()))throw Error('Preview identity differs');
 else if(has('--status'))console.log(JSON.stringify(alive));
 else{const s=await readState();if(!s?.token)throw Error('Preview control failed');
  const r=await fetch(origin+'/stop',{method:'POST',headers:{'x-dealer-token':s.token}});
  if(!r.ok)throw Error('Preview control failed');console.log(await r.text());}
}else if(has('--open')){
 // The one way to put a lab page in front of Jakob: node tools/preview.ts --open "lab.html?tab=prov" (START.cmd does this
 // with the lab's first page). The server is started if it is not running, the page is shown in the lab tab that is
 // already open, and only when there is none is a tab opened. Opening the address itself adds a tab every time.
 const wanted=args[args.indexOf('--open')+1],target=localPath(wanted&&!wanted.startsWith('--')?wanted:'lab.html',origin);
 if(!target)throw Error('Ange en sida i labbet, till exempel lab.html?tab=prov');
 let alive=await health();
 if(alive&&(alive.name!=='dealer'||!sameRoot(alive.root,process.cwd())))throw Error('Preview identity differs');
 if(!alive)await startServer();
 let s=await readState();for(let i=0;i<20&&!s?.token;i++){await new Promise(done=>setTimeout(done,100));s=await readState();}
 const r=await fetch(origin+'/tab/show',{method:'POST',headers:{'x-dealer-token':s?.token??'','content-type':'application/json'},body:JSON.stringify({url:target})});
 if(!r.ok)throw Error('Preview control failed');
 if((await r.json() as {reused:boolean}).reused)console.log(`Visas i den öppna labbfliken: ${origin}${target}`);
 else{
  const [command,list]:[string,string[]]=process.platform==='win32'?['rundll32',['url.dll,FileProtocolHandler',origin+target]]:process.platform==='darwin'?['open',[origin+target]]:['xdg-open',[origin+target]];
  spawn(command,list,{detached:true,stdio:'ignore'}).unref();console.log(`Öppnade labbfliken: ${origin}${target}`);
 }
}else{
 const manifest=JSON.parse(await readFile('manifest.json','utf8'));
 const allowed=new Set(['preview.html','lab.html','lab.css','scene3d.html','game.html','game.css','props.html','props.css','data/props.json','sound.html','sound.css','generation.html','data/p4-generation-review.json','data/scene-contract.json','data/scene-rooms.json','assets/lab/native.jpg','assets/lab/portrait.jpg','assets/scene/room.png','assets/scene/panorama-vegas.jpg','assets/scene/panorama-la.jpg','assets/scene/panorama-skog.jpg',...['room-panorama','room-la','room-skog','room-hall','room-salong','dealer-pamela'].map(name=>`assets/scene/thumbs/${name}.jpg`),...['wood_table-diffuse','wood_table-nor_gl','wood_table-rough','brown_leather-nor_gl','brown_leather-rough','denim_fabric-nor_gl','denim_fabric-rough'].map(name=>`assets/scene/materials/${name}.webp`),'materials/kortmaterial.html','materials/markermaterial.html',...manifest.files.map((f:{path:string})=>f.path).filter((p:string)=>p.startsWith('assets/')||p.startsWith('materials/')||p.startsWith('output/v6/'))]);
 const scripts:Record<string,string>={'/preview-ui.js':'src/preview-ui.ts','/lab-ui.js':'src/lab-ui.ts','/placement-model.js':'src/placement-model.ts','/clip-graph.js':'src/clip-graph.ts','/card-track.js':'src/card-track.ts','/card-overlay.js':'src/card-overlay.ts','/card-overlay-view.js':'src/card-overlay-view.ts','/scene-geometry.js':'src/scene-geometry.ts',...Object.fromEntries(['geometry','film','light','table','rail','props','cards','deal','room','hall','exit','cardlab','shift','view','ui'].map(name=>[`/scene3d-${name}.js`,`src/scene3d-${name}.ts`])),...Object.fromEntries(['page','overlay','view','film','director','table','chat','panel'].map(name=>[`/game-${name}.js`,`src/game-${name}.ts`])),'/game3d-chips.js':'src/game3d-chips.ts','/game3d-props.js':'src/game3d-props.ts','/game3d-tray.js':'src/game3d-tray.ts','/props-lab.js':'src/props-lab.ts','/props-stage.js':'src/props-stage.ts','/lab-sound.js':'src/lab-sound.ts','/materials/source/src/card-material-study.js':'materials/source/src/card-material-study.ts','/materials/source/src/chip-material-study.js':'materials/source/src/chip-material-study.ts'};
 // Modules that are also run by Node name their neighbours with .ts; the browser asks for the same file as .js.
 const forBrowser=(source:string)=>stripTypeScriptTypes(source).replace(/((?:from|import)\s*\(?\s*)(['"])([^'"\n]+)\.ts\2/g,'$1$2$3.js$2');
 // three.js for the 3D scene (scene3d.html maps the bare name "three" to /vendor/three.module.js): exactly the two files its module build
 // consists of, read from the pinned dependency. Nothing else under node_modules is reachable.
 const vendor:Record<string,string>={'/vendor/three.module.js':'node_modules/three/build/three.module.js','/vendor/three.core.js':'node_modules/three/build/three.core.js',
  // The GLB reader for table props (game.html maps "three/addons/" to /vendor/): the loader and the one helper it imports.
  '/vendor/loaders/GLTFLoader.js':'node_modules/three/examples/jsm/loaders/GLTFLoader.js','/vendor/utils/BufferGeometryUtils.js':'node_modules/three/examples/jsm/utils/BufferGeometryUtils.js',
  // For the model lab (props.html): turning a model with the mouse, and a neutral room to reflect in polished materials.
  '/vendor/controls/OrbitControls.js':'node_modules/three/examples/jsm/controls/OrbitControls.js','/vendor/environments/RoomEnvironment.js':'node_modules/three/examples/jsm/environments/RoomEnvironment.js'};
 // Table props made by tools/prop-glb.ts: assets/props/<id>.glb, and only where the file really lies in that folder.
 const propFile=async(file:string)=>{const m=/^assets\/props\/([a-z0-9]+(?:-[a-z0-9]+)*\.glb)$/.exec(file);if(!m)return false;try{return await realpath(file)===path.join(await realpath('assets/props'),m[1]);}catch{return false;}};
 const placements=placementStore(process.cwd()),reviews=reviewStore(process.cwd());
 const library=async()=>{try{const data=JSON.parse(await readFile('data/library.json','utf8'));data.items=await Promise.all(data.items.filter((item:{path:string})=>typeof item.path==='string'&&/^(assets\/|output\/v6\/)/.test(item.path)&&path.posix.normalize(item.path)===item.path&&!item.path.includes('\\')&&item.path.endsWith('.mp4')).map(async(item:{motionRef?:string})=>{if(item.motionRef&&/^motions\/[a-z0-9-]+\.json$/.test(item.motionRef)){try{const motion=JSON.parse(await readFile(item.motionRef,'utf8'));return {...item,reviewDecision:motion.review?.decision??'PENDING'};}catch{return {...item,reviewDecision:'UNKNOWN'};}}return item;}));return data;}catch{return {schemaVersion:1,items:[]};}};
 // Read-only clip bank for the lab: the tracked jobs and review decisions plus a fixed, non-secret
 // projection of each local receipt. Task ids, balances and credentials never leave this process.
 const clipId=/^[a-z0-9]+(?:-[a-z0-9]+)*$/,clipMedia=/^assets\/motions\/([a-z0-9]+(?:-[a-z0-9]+)*)\/(source\.mp4|source-reversed\.mp4|first\.png|last\.png)$/;
 const readJson=async(file:string)=>{try{return JSON.parse(await readFile(file,'utf8'));}catch{return null;}};
 // derived: an edge take that is frames A–B of an existing clip ("derived": [{id, kind, from, to, clip, frames: [A, B]}] in the job file).
 const clipJobs=async()=>{const file=await readJson('data/clip-jobs.json'),named=(list:unknown)=>(Array.isArray(list)?list:[]).filter((item:{id?:unknown})=>typeof item?.id==='string'&&clipId.test(item.id));
  // edits: corrected copies of a clip ("edits": [{id, source: {clip}, …}]); their films lie in assets/motions/<edit id>/ like any other clip.
  const jobs=named(file?.jobs) as {id:string}[],edits=named(file?.edits).filter((e:{source?:{clip?:unknown}})=>typeof e.source?.clip==='string') as {id:string}[];
  return {file,jobs,edits,clips:[...jobs,...edits],derived:named(file?.derived).filter((d:{clip?:unknown})=>typeof d.clip==='string'&&clipId.test(d.clip)) as {id:string;clip:string}[]};};
 // Only source.mp4, source-reversed.mp4, first.png and last.png of a clip named in data/clip-jobs.json, and only where the file really lies in that folder.
 const confined=async(id:string,name:string)=>{try{return await realpath(`assets/motions/${id}/${name}`)===path.join(await realpath('assets/motions'),id,name);}catch{return false;}};
 const clipFile=async(file:string)=>{const m=clipMedia.exec(file);if(!m)return false;const {clips,derived}=await clipJobs();return (clips.some(job=>job.id===m[1])||derived.some(d=>d.clip===m[1]))&&await confined(m[1],m[2]);};
 // Card tracks from tools/track-card.ts and hand-written occlusion overrides, for the same clips and with the same confinement.
 const trackMedia=/^assets\/tracking\/([a-z0-9]+(?:-[a-z0-9]+)*)\/(card-track\.json|card-track-grip\.json|receipt\.json|overrides\.json)$/;
 const tracked=async(id:string,name:string)=>{try{return await realpath(`assets/tracking/${id}/${name}`)===path.join(await realpath('assets/tracking'),id,name);}catch{return false;}};
 const trackFile=async(file:string)=>{const m=trackMedia.exec(file);if(!m)return false;const {clips,derived}=await clipJobs();return (clips.some(job=>job.id===m[1])||derived.some(d=>d.clip===m[1]))&&await tracked(m[1],m[2]);};
 const tracking=async(id:string)=>({track:await tracked(id,'card-track.json')?`assets/tracking/${id}/card-track.json`:null,overrides:await tracked(id,'overrides.json')?`assets/tracking/${id}/overrides.json`:null});
 // Proofs: finished comparison films and contact sheets under assets/proofs/<id>/. Read-only, and only mp4, png and json.
 // Rooms for the 3D scene: panoramas under assets/scene/rooms/ and the menu's pictures under assets/scene/thumbs/ (local media, listed in data/scene-rooms.json). Read-only, jpg only.
 const sceneMedia=/^assets\/scene\/(rooms|thumbs)\/([a-z0-9][a-z0-9_-]*\.jpg)$/;
 const sceneFile=async(file:string)=>{const m=sceneMedia.exec(file);if(!m)return false;try{return await realpath(file)===path.join(await realpath('assets/scene'),m[1],m[2]);}catch{return false;}};
 const proofFile=/^assets\/proofs\/((?:[a-z0-9][a-z0-9._-]*\/)+[a-z0-9][a-z0-9._-]*\.(?:mp4|png|json))$/;
 const proofPath=async(file:string)=>{const m=proofFile.exec(file);if(!m)return false;try{return await realpath(file)===path.join(await realpath('assets/proofs'),...m[1].split('/'));}catch{return false;}};
 const proofs=async()=>{
  const list:unknown[]=[];
  for(const dir of await readdir('assets/proofs',{withFileTypes:true}).catch(()=>[])){
   if(!dir.isDirectory()||!clipId.test(dir.name))continue;
   const base=`assets/proofs/${dir.name}`,info=await readJson(`${base}/proof.json`),files:unknown[]=[];let changed=0;
   for(const entry of await readdir(base,{withFileTypes:true}).catch(()=>[])){const file=`${base}/${entry.name}`;if(entry.isFile()&&/\.(?:mp4|png)$/.test(entry.name)&&await proofPath(file)){const s=await stat(file);changed=Math.max(changed,s.mtimeMs);files.push({name:entry.name,path:file,kind:entry.name.endsWith('.mp4')?'video':'image',bytes:s.size});}}
   list.push({id:dir.name,title:typeof info?.title==='string'?info.title:null,description:typeof info?.description==='string'?info.description:null,labels:info?.labels&&typeof info.labels==='object'?info.labels:null,verdicts:info?.verdicts&&typeof info.verdicts==='object'?info.verdicts:null,updatedAt:Math.round(changed)||null,chapters:Array.isArray(info?.chapters)?info.chapters:null,fps:Number(info?.film?.fps)||30,files});
  }
  return {schemaVersion:1,proofs:list};
 };
 const clipBank=async()=>{
  const {file,jobs,edits,clips,derived}=await clipJobs(),motions:Record<string,unknown>={},receipts:Record<string,unknown>={},media:Record<string,unknown>={},revisions:Record<string,string>={};
  // The revision of a motion record is what a review decision must present to be saved (If-Match).
  const motionOf=async(id:string)=>{try{const text=await readFile(`motions/${id}.json`,'utf8');revisions[id]=reviews.revisionOf(text);return JSON.parse(text);}catch{return null;}};
  // A derived take borrows its film, film facts and card track from the clip it is cut from; a review of its own may lie in motions/<id>.json.
  await Promise.all(derived.map(async take=>{
   const own=await motionOf(take.id),clip=await readJson(`motions/${take.clip}.json`);
   motions[take.id]={source:clip?.source,motion:own?.motion,review:own?.review};
   media[take.id]={video:await confined(take.clip,'source.mp4')?`assets/motions/${take.clip}/source.mp4`:null,first:null,last:null,...await tracking(take.clip)};
  }));
  await Promise.all(clips.map(async job=>{
   const dir=`assets/motions/${job.id}`,motion=await motionOf(job.id),receipt=await readJson(`${dir}/generation.json`);
   if(motion)motions[job.id]={source:motion.source,motion:motion.motion,review:motion.review};
   if(receipt)receipts[job.id]={status:receipt.status,estimatedCredits:receipt.estimatedCredits,requestedAt:receipt.requestedAt,completedAt:receipt.completedAt,output:receipt.output?{bytes:receipt.output.bytes,fps:receipt.output.fps,frames:receipt.output.frames,width:receipt.output.width,height:receipt.output.height}:null};
   const present=async(name:string)=>await confined(job.id,name)?`${dir}/${name}`:null;
   media[job.id]={video:await present('source.mp4'),reversed:await present('source-reversed.mp4'),first:await present('first.png'),last:await present('last.png'),...await tracking(job.id)};
  }));
  return {schemaVersion:1,readable:!!file,budget:file?.budget??null,jobs,derived,edits,motions,receipts,media,revisions};
 };
 // One session per table name (?table=…, "main" when none): a second tab or a test plays its own table and leaves the first alone.
 const games=new Map<string,Session>(),tableName=(url:URL)=>{const name=url.searchParams.get('table')??'main';return /^[a-z0-9-]{1,40}$/.test(name)?name:null;};
 const tableOf=(name:string)=>{let game=games.get(name);if(!game){if(games.size>=24)games.delete(games.keys().next().value!);game=createSession();games.set(name,game);}return game;};
 // The lab's pages: one tab at a time (tools/tab-registry.ts). A page with a stream keeps the server up for as long as it is open.
 const token=randomUUID(),tabs=tabRegistry();
 const types:Record<string,string>={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mp4':'video/mp4','.png':'image/png','.jpg':'image/jpeg','.json':'application/json','.glb':'model/gltf-binary'};
 // Streams and films in flight would hold the server open: the lab tab is told first, and what is still connected after half a second is cut.
 const stop=(reason:Reason='stop')=>{tabs.retire(reason);server.close();setTimeout(()=>server.closeAllConnections(),500).unref();};
 const server=http.createServer(async(req,res)=>{
  try{
   res.setHeader('Cache-Control','no-store');
   if(req.headers.host!==`127.0.0.1:${port}`){res.writeHead(403).end();return;}
   const url=new URL(req.url??'/',origin);
   if(url.pathname==='/health'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({name:'dealer',root:process.cwd(),pid:process.pid,port,tabs:tabs.status()}));return;}
   if(url.pathname==='/stop'&&req.method==='POST'&&req.headers['x-dealer-token']===token){res.end('Stopped dealer preview');stop(url.searchParams.get('restart')==='1'?'restart':'stop');return;}
   if(url.pathname==='/heartbeat'&&req.method==='POST'&&req.headers.origin===origin){tabs.touch();res.end('ok');return;}
   // The stream of a lab page (src/preview-ui.ts), from a page of this lab only. What the server has to say to the tab goes out here.
   if(url.pathname==='/tab/events'&&req.method==='GET'){
    const id=url.searchParams.get('id')??'',page=localPath(url.searchParams.get('page')??'/',origin);
    if(req.headers['sec-fetch-site']!=='same-origin'||!/^[0-9a-f-]{8,40}$/.test(id)||!page){res.writeHead(400).end();return;}
    res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Connection':'keep-alive'});res.write(': dealer lab tab\n\n');
    const tab:Tab={id,page,send:event=>{res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);if(event.type==='retire')res.end();}};
    const ping=setInterval(()=>res.write(': ping\n\n'),20000);
    res.on('close',()=>{clearInterval(ping);tabs.disconnect(tab);});tabs.connect(tab);return;
   }
   // Show a page in the lab tab (node tools/preview.ts --open): answered with whether a tab was open to show it in.
   if(url.pathname==='/tab/show'&&req.method==='POST'&&req.headers['x-dealer-token']===token){
    res.setHeader('Content-Type','application/json; charset=utf-8');
    let size=0;const chunks:Buffer[]=[];for await(const chunk of req){size+=chunk.length;if(size>4096){res.writeHead(413).end();return;}chunks.push(chunk);}
    let wanted:unknown;try{wanted=JSON.parse(Buffer.concat(chunks).toString('utf8')).url;}catch{wanted=null;}
    const target=localPath(wanted,origin);if(!target){res.writeHead(400).end(JSON.stringify({error:'Bara sidor i labbet kan visas.'}));return;}
    res.end(JSON.stringify(tabs.show(target)));return;
   }
   if(url.pathname==='/api/placements'){
    res.setHeader('Content-Type','application/json; charset=utf-8');
    // A proposal beside Jakob's draft (placements/proposals/<name>.json): read-only, for a lab page that is asked for it by name. His draft is the plan without a name, and the only one that can be saved.
    const proposal=url.searchParams.get('plan');
    if(proposal!==null){if(req.method!=='GET'||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(proposal)){res.writeHead(405).end(JSON.stringify({error:'Ett förslag kan bara läsas.'}));return;}
     try{res.end(JSON.stringify({plan:JSON.parse(await readFile(path.join('placements/proposals',proposal+'.json'),'utf8')),proposal}));}catch{res.writeHead(404).end(JSON.stringify({error:'Det finns inget förslag med det namnet.'}));}return;}
    if(req.method==='GET'){res.end(JSON.stringify(await placements.load()));return;}
    if(req.method!=='PUT'){res.writeHead(405).end();return;}
    if(req.headers.origin!==origin){res.writeHead(403).end(JSON.stringify({error:'Spara från det lokala labbet.'}));return;}
    if(!req.headers['content-type']?.startsWith('application/json')){res.writeHead(415).end(JSON.stringify({error:'JSON krävs.'}));return;}
    if(Number(req.headers['content-length']??0)>65536){res.writeHead(413).end(JSON.stringify({error:'Placeringsfilen är för stor.'}));return;}
    try{
     let size=0;const chunks:Buffer[]=[];for await(const chunk of req){size+=chunk.length;if(size>65536)throw new StoreError(413,'Placeringsfilen är för stor.');chunks.push(chunk);}
     const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
     const result=await placements.save(value,typeof req.headers['if-match']==='string'?req.headers['if-match']:undefined);
     res.end(JSON.stringify(result));
    }catch(error){res.writeHead(error instanceof StoreError?error.status:400).end(JSON.stringify({error:(error as Error).message}));}return;
   }
   if(url.pathname==='/api/library'&&req.method==='GET'){res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(await library()));return;}
   if(url.pathname==='/api/clip-bank'&&req.method==='GET'){res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(await clipBank()));return;}
   // The one write besides placements: a review decision for a clip of the job file. It rewrites only the review block
   // of motions/<id>.json, from this page only, and only against the revision the page last read.
   if(url.pathname.startsWith('/api/clip-bank/review/')){
    const id=url.pathname.slice('/api/clip-bank/review/'.length);
    res.setHeader('Content-Type','application/json; charset=utf-8');
    if(req.method!=='PUT'){res.writeHead(405).end();return;}
    if(req.headers.origin!==origin){res.writeHead(403).end(JSON.stringify({error:'Spara från det lokala labbet.'}));return;}
    if(!req.headers['content-type']?.startsWith('application/json')){res.writeHead(415).end(JSON.stringify({error:'JSON krävs.'}));return;}
    if(Number(req.headers['content-length']??0)>8192){res.writeHead(413).end(JSON.stringify({error:'Beslutet är för stort.'}));return;}
    try{
     const {clips,derived}=await clipJobs();
     if(!clips.some(job=>job.id===id)&&!derived.some(take=>take.id===id))throw new StoreError(404,'Klippet finns inte i jobbfilen.');
     let size=0;const chunks:Buffer[]=[];for await(const chunk of req){size+=chunk.length;if(size>8192)throw new StoreError(413,'Beslutet är för stort.');chunks.push(chunk);}
     res.end(JSON.stringify(await reviews.save(id,JSON.parse(Buffer.concat(chunks).toString('utf8')),typeof req.headers['if-match']==='string'?req.headers['if-match']:undefined)));
    }catch(error){res.writeHead(error instanceof StoreError?error.status:400).end(JSON.stringify({error:(error as Error).message}));}return;
   }
   // The game: local single-player blackjack sessions, kept in this process only (game/session.ts). Rules, shuffle, card
   // values and money live there; the page sends commands and plays what comes back. GET reads the state, POST /command
   // plays one command, POST /new starts over (a balance and, for demos, a seeded or stacked shoe). From this page only.
   if(url.pathname==='/api/game'&&req.method==='GET'){res.setHeader('Content-Type','application/json; charset=utf-8');const name=tableName(url);if(!name){res.writeHead(400).end(JSON.stringify({error:{code:'INVALID_TABLE',message:'Ogiltigt bordsnamn.'}}));return;}res.end(JSON.stringify(tableOf(name).state()));return;}
   if(url.pathname==='/api/game/command'||url.pathname==='/api/game/new'){
    res.setHeader('Content-Type','application/json; charset=utf-8');
    const refuse=(status:number,code:string,message:string)=>{res.writeHead(status).end(JSON.stringify({error:{code,message}}));};
    if(req.method!=='POST'){res.writeHead(405).end();return;}
    if(req.headers.origin!==origin){refuse(403,'FORBIDDEN','Spela från det lokala labbet.');return;}
    if(!req.headers['content-type']?.startsWith('application/json')){refuse(415,'JSON_REQUIRED','JSON krävs.');return;}
    const name=tableName(url);if(!name){refuse(400,'INVALID_TABLE','Ogiltigt bordsnamn.');return;}
    try{
     let size=0;const chunks:Buffer[]=[];for await(const chunk of req){size+=chunk.length;if(size>16384)throw new SessionError('TOO_LARGE','Kommandot är för stort.',413);chunks.push(chunk);}
     let body:unknown;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new SessionError('INVALID_COMMAND','Kommandot är inte giltig JSON.',400);}
     if(url.pathname==='/api/game/new'){const game=createSession(body as SessionOptions);games.delete(name);if(games.size>=24)games.delete(games.keys().next().value!);games.set(name,game);res.end(JSON.stringify(game.state()));}
     else res.end(JSON.stringify(tableOf(name).command(body)));
    }catch(error){if(error instanceof SessionError)refuse(error.status,error.code,error.message);else refuse(500,'INTERNAL','Spelet kunde inte svara.');}
    return;
   }
   if(url.pathname==='/api/proofs'&&req.method==='GET'){res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(await proofs()));return;}
   if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end();return;}
   if(scripts[url.pathname]||vendor[url.pathname]){
    let source:string;try{source=await readFile(scripts[url.pathname]??vendor[url.pathname],'utf8');}catch{res.writeHead(404).end();return;} // a module that has not been written yet
    res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(scripts[url.pathname]?forBrowser(source):source);return;
   }
   // The studio (studio/, built to static files): everything under /studio/ is read from studio/out/ (tools/studio-files.ts).
   // It is a client of this server like the lab's own pages: same origin, same routes, same single tab.
   let file:string,type:string;
   const studio=url.pathname==='/studio'||url.pathname.startsWith('/studio/')?await resolveStudio(url.pathname):null;
   if(studio){
    if(studio.kind==='redirect'){res.writeHead(301,{Location:studio.to+url.search}).end();return;}
    if(studio.kind==='unbuilt'){res.writeHead(503,{'Content-Type':'text/html; charset=utf-8'}).end('<!doctype html><html lang="sv"><meta charset="utf-8"><title>Dealer · Studio</title><body style="margin:0;height:100vh;display:grid;place-items:center;background:#0d0f0e;color:#e8ece9;font:15px system-ui,sans-serif"><p>Studion är inte byggd på den här datorn. Kör <code>npm --prefix studio ci</code> och <code>npm --prefix studio run build</code>, och ladda om. <a style="color:#d9b96a" href="/lab.html">Till labbet</a></p></body></html>');return;}
    if(studio.kind==='none'){res.writeHead(404).end();return;}
    file=studio.file;type=studio.type;
   }else{
    file=url.pathname==='/'?'lab.html':decodeURIComponent(url.pathname.slice(1));
    if(!allowed.has(file)&&!await clipFile(file)&&!await trackFile(file)&&!await proofPath(file)&&!await sceneFile(file)&&!await propFile(file)&&!(await library()).items.some((item:{path:string})=>item.path===file)){res.writeHead(404).end();return;}
    type=types[file.slice(file.lastIndexOf('.'))]??'application/octet-stream';
   }
   const size=await stat(file).then(s=>s.isFile()?s.size:-1,()=>-1);
   if(size<0){res.writeHead(404).end();return;} // allowed, but not on this machine
   res.setHeader('Content-Type',type);res.setHeader('Accept-Ranges','bytes');
   let start=0,end=size-1;
   if(req.headers.range){
    const m=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
    if(!m){res.writeHead(416,{'Content-Range':`bytes */${size}`}).end();return;}
    start=Number(m[1]);end=m[2]?Number(m[2]):end;
    if(start>end||end>=size){res.writeHead(416,{'Content-Range':`bytes */${size}`}).end();return;}
    res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':end-start+1});
   }else res.setHeader('Content-Length',size);
   if(req.method==='HEAD'){res.end();return;}
   const stream=createReadStream(file,{start,end});stream.on('error',()=>res.destroy());stream.pipe(res);res.on('close',()=>stream.destroy());
  }catch{if(!res.headersSent)res.writeHead(500);res.end();}
 });
 const timer=setInterval(()=>{if(tabs.idleFor()>60000)stop();},5000);timer.unref();
 // The port is taken: by this lab's own server (nothing to do), or by something else (an error).
 server.on('error',async(error:NodeJS.ErrnoException)=>{const mine=error.code==='EADDRINUSE'?await health():null;
  if(mine?.name==='dealer'&&sameRoot(mine.root,process.cwd()))console.log(`Labbservern går redan: ${origin}`);else{console.error(error.message);process.exitCode=1;}});
 server.on('close',()=>{clearInterval(timer);void unlink(state).catch(()=>{});});
 server.listen(port,'127.0.0.1',async()=>{await mkdir('.runtime',{recursive:true});await writeFile(state,JSON.stringify({root:process.cwd(),port,pid:process.pid,parent:process.ppid,executable:process.execPath,script:'tools/preview.ts',startedAt:new Date().toISOString(),token}));console.log(origin);});
 process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
}
