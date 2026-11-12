// Reuse two verified historical films and produce exact 16-card prefixes.
// No Runway calls, gameplay rules, source edits or frame-image banks.
import {readFile,writeFile,mkdir,copyFile,stat,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync,spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
if(path.resolve(process.cwd())!==root)throw Error('Run from dealer checkout.');
const archive='D:/dealer-archive/snyggare-dealer';
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const audit=JSON.parse(await readFile('evidence/sequence-reuse-audit.json','utf8'));
const manifestFile='data/manifest.json',manifestText=await readFile(manifestFile,'utf8'),manifest=JSON.parse(manifestText);
const now=new Date().toISOString();
const imported=[] as {path:string;sha256:string;bytes:number;source:string;role:string}[];
async function importFile(source:string,dest:string,expected:string,role:string){
 if(!source.replaceAll('\\','/').startsWith(archive+'/'))throw Error('Outside approved archive.');
 const bytes=await readFile(source);if(hash(bytes)!==expected)throw Error(`Changed archive source: ${source}`);
 await mkdir(path.dirname(dest),{recursive:true});
 if(await stat(dest).catch(()=>null)){if(hash(await readFile(dest))!==expected)throw Error(`Existing import differs: ${dest}`);}
 else await copyFile(source,dest,1);
 const record={path:dest,sha256:expected,bytes:bytes.length,source,role};imported.push(record);return record;
}
const review=await importFile(`${archive}/references/pamela-goal-film-review.json`,'assets/sequences/pamela-r2/review-manifest.json','56eec07608af6519951f7fcc22781a427ed6153ceaec060efe9b6991c0b91a19','historical-sequence-review-manifest');
const timeline=await importFile(audit.exactTimelineRef.path,'assets/sequences/pamela-r2/timeline.json','b9500e990de4a0e021042efbb5ae4dc123513b94fb96c30aef39c982406281fa','historical-sequence-timeline');
const plan=JSON.parse(await readFile(timeline.path,'utf8'));
const reviewData=JSON.parse(await readFile(review.path,'utf8'));
if(plan.format.fps!==30||plan.planned.at(-1).outputRange[1]!==3598)throw Error('Unexpected timeline.');
const prefix=plan.planned.filter((s:any)=>s.outputRange[1]<=3296);
if(prefix.at(-1).to.kind!=='VILA'||prefix.at(-1).boardAfter.length!==16||prefix.at(-1).outputRange[1]!==3296)throw Error('16-card boundary is not occupied IDLE.');
const prepared=[] as {id:string;view:string;source:string;width:number;height:number;frames:number;cards:number;original:{path:string;sha256:string};range:number[]}[];
for(const candidate of audit.readyReviewFilms){
 const view=candidate.id==='wide'?'native':'portrait';
 const id=`pamela-sequence-17-${view}-r2`,dest=`assets/motions/${id}/source.mp4`;
 const original=await importFile(candidate.source.path,dest,candidate.source.sha256,'historical-composited-sequence-original');
 prepared.push({id,view,source:dest,width:candidate.width,height:candidate.height,frames:3598,cards:17,original,range:[0,3598]});
 const shortId=`pamela-sequence-16-${view}-r2`;
 prepared.push({id:shortId,view,source:`assets/motions/${shortId}/review.mp4`,width:candidate.width,height:candidate.height,frames:3296,cards:16,original,range:[0,3296]});
}
await mkdir('.runtime/sequence-review',{recursive:true});
const jobs=prepared.filter(p=>p.cards===16).map(async item=>{
 if(await stat(item.source).catch(()=>null))return;
 await mkdir(path.dirname(item.source),{recursive:true});
 const temp=item.source.replace('.mp4','.partial.mp4');
 const args=['-hide_banner','-loglevel','error','-n','-threads','1','-i',item.original.path,'-vf','trim=end_frame=3296,setpts=PTS-STARTPTS','-an','-c:v','libx264','-preset','fast','-crf','18','-threads','2','-pix_fmt','yuv420p','-movflags','+faststart',temp];
 await new Promise<void>((resolve,reject)=>{const child=spawn('ffmpeg',args,{windowsHide:true,stdio:['ignore','ignore','pipe'],env:{...process.env,TEMP:'D:/dealer-scratch/tmp',TMP:'D:/dealer-scratch/tmp'}});let errors='';child.stderr.on('data',b=>{errors+=b;});child.on('error',reject);child.on('close',code=>code===0?resolve():reject(Error(`FFmpeg ${code}: ${errors.slice(-2000)}`)));});
 await rename(temp,item.source);
});
const outcomes=await Promise.allSettled(jobs);for(const result of outcomes)if(result.status==='rejected')throw result.reason;
const library=JSON.parse(await readFile('data/library.json','utf8'));
const generated=[];
for(const item of prepared){
 const bytes=await readFile(item.source),sha256=hash(bytes);
 const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-threads','1','-count_frames','-show_entries','stream=codec_type,width,height,r_frame_rate,nb_read_frames','-of','json',item.source],{encoding:'utf8',windowsHide:true}));
 const stream=probe.streams.find((s:any)=>s.codec_type==='video');
 if(stream?.width!==item.width||stream?.height!==item.height||stream?.r_frame_rate!=='30/1'||Number(stream?.nb_read_frames)!==item.frames||probe.streams.some((s:any)=>s.codec_type==='audio'))throw Error(`Output format mismatch: ${item.id}`);
 if(item.cards===16)imported.push({path:item.source,sha256,bytes:bytes.length,source:`${item.original.path}#frames=0:3296`,role:'derived-16-card-sequence-review'});
 const motionPath=`motions/${item.id}.json`;
 const title=`Helsekvens · ${item.cards} kort · ${item.view==='native'?'dator':'mobil'}`;
 const segments=plan.planned.filter((s:any)=>s.outputRange[1]<=item.frames).map((s:any)=>({id:s.id,instance:s.instance,from:s.from,to:s.to,outputRange:s.outputRange,activeSlot:s.activeSlot??null,boardBefore:s.boardBefore,boardAfter:s.boardAfter,sourceSides:s.sourceSides??null,bound:s.bound}));
 const motion={schemaVersion:1,id:item.id,dealer:'pamela',kind:'sequence',source:{path:item.source,sha256,bytes:bytes.length,width:item.width,height:item.height,fps:30,frames:item.frames},provenance:{method:item.cards===17?'byte-identical historical reuse':'frame-exact prefix, H264 re-encode',originalPath:item.original.path,originalSha256:item.original.sha256,sourceRange:item.range,archiveReview:review,archiveTimeline:timeline,audit:'evidence/sequence-reuse-audit.json',importedAt:now},sequence:{startPose:'IDLE',endPose:'IDLE',startBoard:[],endBoard:segments.at(-1).boardAfter,playerCards:14,dealerCards:item.cards-14,sourceOrder:'P7 to P1, D.C1, P7 to P1, D.C2; optional reveal and D.C3',loopToEmptyStartAllowed:false,scoutOwnsRevealAndDraw:true,segments},placementBinding:{basis:'historical qualified timeline; not current editor draft',currentDraftMatched:false,sourceWidth:1764,sourceHeight:1174,calibratedToCurrentPlan:false},review:{decision:'PENDING',userApproved:false,basis:'Recovered complete review candidate. Source hashes and frame counts verified; current continuous playback and visual review required.',limitations:audit.archiveQualifications},scoutIntegrated:false,published:false};
 if(await stat(motionPath).catch(()=>null)){const old=JSON.parse(await readFile(motionPath,'utf8'));if(old.source.sha256!==sha256)throw Error('Registered source changed.');}else await writeFile(motionPath,JSON.stringify(motion,null,2)+'\n',{flag:'wx'});
 const entry={id:item.id,title,path:item.source,sha256,width:item.width,height:item.height,fps:30,frameCount:item.frames,view:item.view,kind:'sequence',status:null,motionRef:motionPath,chapters:[...reviewData.chapters.filter((c:any)=>c.frame<item.frames&&!c.filmId),{label:`Vila · ${item.cards} kort`,frame:item.frames-1}],description:`ÅTERFUNNEN KANDIDAT: två kort till P1–P7 och ${item.cards-14} till dealern. ${item.cards===16?'D.C2 förblir dolt; filmen slutar i vila.':'Innehåller separat reveal av D.C2 och tredje kort; Scout ska styra dessa val.'} Historiska placeringar, inte det aktuella placeringsutkastet. Blå/gul visar kortsidor; slutmaterial saknas. Kända skarv-/maskbegränsningar kvarstår. Slutet får inte loopas till ett tomt bord.`};
 const existing=library.items.find((e:any)=>e.id===item.id);if(existing){if(existing.sha256!==sha256)throw Error('Library hash changed.');}else library.items.push(entry);
 generated.push({id:item.id,path:item.source,sha256,bytes:bytes.length,frames:item.frames,width:item.width,height:item.height,sourceRange:item.range,frameCountVerifiedByDecode:true});
}
for(const file of imported){const old=manifest.files.find((f:any)=>f.path===file.path);if(old&&old.sha256!==file.sha256)throw Error(`Manifest conflict: ${file.path}`);if(!old)manifest.files.push(file);}
await writeFile(manifestFile,(JSON.stringify(manifest,null,2)+'\n').replaceAll('\n',manifestText.includes('\r\n')?'\r\n':'\n'));
await writeFile('data/library.json',JSON.stringify(library,null,2)+'\n');
await writeFile('evidence/sequence-review-production.json',JSON.stringify({schemaVersion:1,createdAt:now,noPaidGeneration:true,sourceAudit:'evidence/sequence-reuse-audit.json',sourceTimeline:timeline,archivePosterObserved:{path:`${archive}/runs/20261110-pamela-goal-scene/take-09/decoded-board-842dd48296/pamela-vila-17-kort.png`,sha256:'ba8e116bf90b475e3ce1fb63c14d8a0cd91b9f388f647babdcd5f7a5c332f639'},jobs:generated,trim:{range:[0,3296],units:'source frames at 30fps',retimed:false,pngFrameBankCreated:false,maxConcurrentEncoders:2,threadsPerEncoder:2},currentDraftMatched:false,productionAccepted:false},null,2)+'\n');
console.log(JSON.stringify({registered:generated,libraryCount:library.items.length,noPaidGeneration:true}));
