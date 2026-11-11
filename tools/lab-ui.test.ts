import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {createContext,runInContext} from 'node:vm';
import * as model from '../src/placement-model.ts';
import * as clipGraph from '../src/clip-graph.ts';
import * as cardOverlay from '../src/card-overlay.ts';

// Execute the real UI module with a small DOM port and controllable HTTP replies.
// No local server or user's placement file is changed by these race regressions.
async function setup(search=''){
 const elements=new Map<string,any>();
 const listeners=new Map<string,((event?:unknown)=>void)[]>();
 const fire=(id:string,type:string,event?:unknown)=>listeners.get(`${id}:${type}`)?.forEach(fn=>fn(event));
 function element(id:string):any{
  if(!elements.has(id))elements.set(id,{
   value:'0',checked:false,clientWidth:1000,style:{},dataset:{},inert:false,
   classList:{toggle(){},remove(){}},setAttribute(){},addEventListener(type:string,fn:()=>void){const key=`${id}:${type}`;listeners.set(key,[...(listeners.get(key)??[]),fn]);},
   append(){},replaceChildren(){},insertAdjacentHTML(){},querySelectorAll(){return [];},
   // A media element that loads at once: enough for the clip bank's players to cue, play and step.
   removeEventListener(){},removeAttribute(){},pause(){},blur(){},async play(){},load(){queueMicrotask(()=>{fire(id,'loadedmetadata');fire(id,'seeked');});},
  });
  return elements.get(id);
 }
 const pending:{url:string;resolve:(value:unknown)=>void}[]=[], material:unknown[][]=[], requests:string[]=[], calls:{url:string;init?:{method?:string;headers?:Record<string,string>;body?:string}}[]=[];
 // Answers the oldest waiting request, or the oldest one to a given address.
 const respond=(value:unknown,url?:string)=>{const at=url?pending.findIndex(p=>p.url===url):0;assert.ok(at>=0&&pending[at],`no pending request${url?` to ${url}`:''}`);pending.splice(at,1)[0].resolve(value);};
 const context=createContext({...model,structuredClone,console,URLSearchParams,location:{search},innerHeight:1000,
  setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,requestAnimationFrame:()=>0,
  document:{getElementById:element,querySelector:element,querySelectorAll:()=>[],createElement:element},
  window:{addEventListener(){},cardMaterialStudy:{
   setBend(value:number){material.push(['bend',value]);},
   setGloss(value:number){material.push(['gloss',value]);},
   showSide(value:string){material.push(['side',value]);},
  }},
  ResizeObserver:class {observe(){}},cancelAnimationFrame(){},
  fetch:(url:unknown,init?:{method?:string})=>{requests.push(`${init?.method??'GET'} ${url}`);calls.push({url:String(url),init});return new Promise(resolve=>pending.push({url:String(url),resolve}));},
 });
 const source=await readFile(new URL('../src/lab-ui.ts',import.meta.url),'utf8');
 runInContext(stripTypeScriptTypes(source).replace(/^import[^\n]+\n/gm,''),context);
 const reply=(plan:model.PlacementPlan,revision='test')=>respond({ok:true,json:async()=>({plan:structuredClone(plan),revision})},'/api/placements');
 assert.equal(element('.workspace').inert,true);
 reply(model.defaultPlan());await new Promise(setImmediate);
 assert.equal(element('.workspace').inert,false);
 return {context,element,reply,respond,requests,calls,material,fire};
}
const settle=async()=>{for(let i=0;i<4;i++)await new Promise(setImmediate);};

test('reload locks editing; a queued edit is preserved and its undo history survives',async()=>{
 const {context,element,reply}=await setup();
 const loading=runInContext('load()',context);
 assert.equal(element('.workspace').inert,true);
 assert.equal(element('reload').disabled,true);
 runInContext("checkpoint();plan.targets['P4.C2'].geometry.native.angle=17;changed();",context);
 reply(model.defaultPlan());
 await assert.rejects(loading,/Utkastet ändrades/);
 assert.equal(runInContext("plan.targets['P4.C2'].geometry.native.angle",context),17);
 assert.equal(runInContext('history.length',context),1);
 assert.equal(runInContext('dirty',context),true);
 assert.equal(element('.workspace').inert,false);
});

test('out-of-order reloads cannot replace newer data or unlock it; material is resynchronized',async()=>{
 const {context,element,reply,material}=await setup();
 const older=runInContext('load()',context),newer=runInContext('load()',context);
 const oldPlan=model.defaultPlan();oldPlan.targets['P4.C2'].geometry.native.angle=12;
 reply(oldPlan,'old');await older;
 assert.equal(element('.workspace').inert,true);
 assert.notEqual(runInContext("plan.targets['P4.C2'].geometry.native.angle",context),12);
 const latest=model.defaultPlan(),target=latest.targets['P4.C2'];
 target.geometry.native.angle=23;target.material.bend=.12;target.material.gloss=.8;
 target.intent.endSide='FRONT';target.intent.turn=true;
 reply(latest,'new');await newer;
 assert.equal(element('.workspace').inert,false);
 assert.equal(runInContext("plan.targets['P4.C2'].geometry.native.angle",context),23);
 assert.equal(runInContext('revision',context),'new');
 assert.deepEqual(material.slice(-3),[['bend',.12],['gloss',.8],['side','front']]);
});

test('flat board is the default; changing mode and heading enters the saved plan without moving centres',async()=>{
 const {context,element,fire}=await setup();
 assert.equal(element('flat-plane').checked,true);
 const geometry=runInContext('JSON.stringify(plan.targets)',context);
 element('flat-plane').checked=false;fire('flat-plane','change');
 element('plane-heading').value='15';fire('plane-heading','change');
 assert.equal(runInContext('plan.tableProjection.mode',context),'individual');
 assert.equal(runInContext('plan.tableProjection.heading',context),15);
 assert.equal(runInContext('dirty',context),true);
 assert.equal(element('save').disabled,false);
 assert.equal(runInContext('JSON.stringify(plan.targets)',context),geometry);
});

test('loading a legacy plan offers a save for the new flat default while preserving its coordinates',async()=>{
 const {context,element,reply}=await setup(),legacy=model.defaultPlan();
 delete legacy.tableProjection;
 const geometry=JSON.stringify(legacy.targets),loading=runInContext('load()',context);
 reply(legacy);await loading;
 assert.equal(element('flat-plane').checked,true);
 assert.equal(runInContext('dirty',context),true);
 assert.equal(element('save').disabled,false);
 assert.equal(runInContext('JSON.stringify(plan.targets)',context),geometry);
});

test('film review seeks source frames at the clip fps and clears a pending seek when selecting another clip',async()=>{
 const {context,element,fire}=await setup();
 const before=runInContext('JSON.stringify(plan)',context),player=element('film-player');
 player.pause=()=>{};player.load=()=>{player.currentTime=0;player.readyState=0;};
 const clip={id:'review-24',title:'Review',path:'assets/review.mp4',kind:'candidate',status:null,width:100,height:100,frameCount:72,fps:24};
 context.reviewClip=clip;
 runInContext('selectFilm(reviewClip,31)',context);
 assert.equal(player.currentTime,0);
 player.readyState=1;fire('film-player','loadedmetadata');
 assert.ok(Math.abs(player.currentTime-(31.001/24))<1e-8);
 assert.match(element('film-frame').textContent,/Ruta 31 \/ 71/);
 runInContext('seekFilm(9999)',context);
 assert.ok(player.currentTime<3);assert.match(element('film-frame').textContent,/Ruta 71 \/ 71/);
 runInContext('selectFilm(reviewClip,31);selectFilm({...reviewClip,id:"next"})',context);
 player.readyState=1;fire('film-player','loadedmetadata');
 assert.equal(player.currentTime,0);
 assert.equal(runInContext('JSON.stringify(plan)',context),before);
 assert.equal(runInContext('dirty',context),false);
 const urls:string[]=[];context.URL=URL;context.location.href='http://127.0.0.1:4319/lab.html?clip=next&frame=31';
 context.window.history={replaceState(_state:unknown,_title:string,url:URL){urls.push(String(url));}};
 player.currentTime=2;fire('film-player','seeked');
 assert.equal(new URL(urls.at(-1)!).searchParams.get('frame'),'48');
 player.currentTime=2.5;fire('film-player','pause');
 assert.equal(new URL(urls.at(-1)!).searchParams.get('frame'),'60');
});

// One complete P4.C1 chain as /api/clip-bank would return it.
function clipBank(){
 const sha='b'.repeat(64),video=(id:string)=>`assets/motions/${id}/source.mp4`,image={file:{path:'assets/anchors/ready/anchor.png',sha256:sha}};
 const job=(id:string,from:string,to:string,first:unknown=image)=>({id,kind:from==='READY'?'DEAL':'RETURN',target:'P4.C1',from,to,model:'wan3',duration:from==='READY'?4:3,ratio:'auto_1080p',audio:false,
  promptText:from==='READY'?'Locked camera. One continuous, calm and unhurried four-second deal directly in front, centred in the image.':'Locked camera. One plain solid blue card lies flat and still on the table in front of her.',first,last:image,purpose:'fixture'});
 const start={frame:{video:video('pamela-p4-c1-plan-deal-02'),videoSha256:sha,index:105}};
 const jobs=[job('pamela-p4-c1-plan-deal-02','READY','LAND(P4.C1)'),job('pamela-p4-c1-plan-return-ready-01','LAND(P4.C1)','READY',start),job('pamela-p4-c1-plan-return-idle-01','LAND(P4.C1)','IDLE',start)];
 return {schemaVersion:1,budget:{maximumCredits:1500},jobs,
  motions:Object.fromEntries(jobs.map((j,i)=>[j.id,{source:{fps:30,frames:i?90:120,sha256:sha},motion:{physicalEndSide:'FRONT'},review:{decision:'PENDING',basis:'<img src=x onerror=alert(1)> f105'}}])),
  receipts:Object.fromEntries(jobs.map(j=>[j.id,{status:'SUCCEEDED',estimatedCredits:j.duration*20}])),
  media:Object.fromEntries(jobs.map(j=>[j.id,{video:video(j.id),first:null,last:null}]))};
}

test('the clip bank says it is local-only when its module or endpoint is missing and leaves the placement draft alone',async()=>{
 const {context,element,respond,requests}=await setup();
 const before=runInContext('JSON.stringify(plan)',context);
 // This VM has no module loader, exactly as the public site has no clip-graph.js.
 runInContext("setTab('clipbank')",context);await settle();
 assert.match(element('kb-notice').textContent,/finns bara lokalt/);assert.equal(element('kb-notice').hidden,false);
 assert.equal(element('.workspace').hidden,true);assert.equal(element('clipbank').hidden,false);
 // With the module present but no endpoint the tab still opens, with the same notice.
 context.testGraph=clipGraph;runInContext('clipGraph=testGraph',context);
 const opening=runInContext('openClipBank()',context);await settle();
 respond({ok:false});await opening;
 assert.match(element('kb-notice').textContent,/finns bara lokalt/);assert.equal(element('kb-count').textContent,'Finns bara lokalt');
 runInContext("setTab('placement')",context);
 assert.equal(element('.workspace').hidden,false);assert.equal(element('clipbank').hidden,true);
 assert.equal(runInContext('JSON.stringify(plan)',context),before);assert.equal(runInContext('dirty',context),false);
 assert.deepEqual(requests,['GET /api/placements','GET /api/clip-bank']);
});

test('the clip bank draws every edge, opens a deep-linked edge, drafts a missing job and builds a round without writing anything',async()=>{
 const {context,element,respond,requests,fire}=await setup('?tab=klippbank&edge=p4c1>idle'),bank=clipBank();
 await settle();
 context.testGraph=clipGraph;runInContext('clipGraph=testGraph',context);
 const opening=runInContext('openClipBank()',context);await settle();
 respond({ok:true,text:async()=>JSON.stringify(bank)});await opening;
 assert.equal(element('kb-notice').hidden,true);
 assert.equal(element('kb-count').textContent,'3 av 51 kanter klara');
 assert.match(element('kb-count-detail').textContent,/saknas 48 · D\.C3 0 av 3 · 200 av 1500 credits beställda/);
 const tree=element('kb-tree').innerHTML;
 assert.equal(tree.match(/class="kb-edge /g).length,54);assert.equal(tree.match(/class="kb-node/g).length,17);assert.equal(tree.match(/class="kb-hub/g).length,2);
 assert.match(tree,/class="kb-edge s-UNREVIEWED sel" data-edge="P4\.C1&#62;IDLE"/);
 assert.match(tree,/class="kb-edge s-MISSING" data-edge="READY&#62;D\.C2"/);
 // The deep link selected the edge, its main take and the frame its return starts on.
 assert.equal(element('kb-edge-title').textContent,'P4.C1>IDLE');
 assert.equal(runInContext('kbTake',context),'pamela-p4-c1-plan-return-idle-01');
 assert.match(element('kb-facts').innerHTML,/ruta f105 i <code>pamela-p4-c1-plan-deal-02<\/code> · passar bara den tagningen/);
 assert.equal(element('kb-prompt').textContent,bank.jobs[2].promptText);
 assert.equal(element('kb-player').src,'assets/motions/pamela-p4-c1-plan-return-idle-01/source.mp4');
 // Text from job and review files is shown as text, never run as markup.
 assert.match(element('kb-review').innerHTML,/&#60;img src=x onerror=alert\(1\)&#62; f105/);assert.doesNotMatch(element('kb-review').innerHTML,/<img/);
 // The deal is cut at the frame its returns start on.
 runInContext("kbSelect('READY>P4.C1')",context);
 assert.match(element('kb-facts').innerHTML,/ruta f105 · <code>plan-return-ready-01<\/code>, <code>plan-return-idle-01<\/code> startar på den rutan och passar bara den här tagningen/);
 assert.equal(element('kb-cut-frame').textContent,'Till landningsrutan f105');
 // A missing edge offers a copyable draft in the job file's shape; nothing is saved.
 runInContext("kbSelect('READY>P2.C1')",context);
 assert.equal(element('kb-take').hidden,true);assert.equal(element('kb-draft').open,true);
 const draft=JSON.parse(element('kb-draft-json').textContent);
 assert.deepEqual([draft.id,draft.kind,draft.to,draft.model,draft.duration],['pamela-p2-c1-plan-deal-01','DEAL','LAND(P2.C1)','wan3',4]);
 // The round builder starts on the seats that can be played and names every gap.
 runInContext("kbPanel='round';paintBank()",context);
 assert.equal(element('kb-seq').value,'IDLE>READY | READY>P4.C1 | P4.C1>READY | READY>D.C1 | D.C1>READY | READY>P4.C2 | P4.C2>READY | READY>D.C2 | D.C2>IDLE');
 assert.match(element('kb-seq-count').textContent,/^9 steg · 2 spelbara · 7 luckor · 6,5 s film$/);
 assert.match(element('kb-steps').innerHTML,/ruta 0–104 · klipps vid landningsrutan f105/);assert.match(element('kb-steps').innerHTML,/startar på landningsrutan f105/);
 assert.equal(element('kb-steps').innerHTML.match(/class="kb-chip gap"/g).length,7);
 runInContext("kbSeats.add('P1');kbDealer=false;kbRoundChanged(false)",context);
 assert.equal(element('kb-seq').value,'IDLE>READY | READY>P1.C1 | P1.C1>READY | READY>P4.C1 | P4.C1>READY | READY>P1.C2 | P1.C2>READY | READY>P4.C2 | P4.C2>IDLE');
 // A hand-written string replaces the round in canonical form; a typo is reported and changes nothing.
 element('kb-seq').value='ready>p4c1 | p4.c1>idle';fire('kb-apply-seq','click');
 assert.equal(element('kb-seq').value,'READY>P4.C1 | P4.C1>IDLE');assert.match(element('kb-seq-count').textContent,/^2 steg · 2 spelbara · 0 luckor · 6,5 s film · ändrad för hand$/);
 element('kb-seq').value='READY>P4.C1 | P4.C1>P1.C1';fire('kb-apply-seq','click');
 assert.match(element('kb-seq-error').textContent,/Kunde inte tolka: P4\.C1>P1\.C1/);assert.equal(runInContext('kbSteps.length',context),2);
 assert.deepEqual(requests,['GET /api/placements','GET /api/clip-bank']);
 assert.equal(runInContext('dirty',context),false);
});

const served=(bank:unknown)=>({ok:true,text:async()=>JSON.stringify(bank)});
// Opens the clip bank tab on a given bank, with the graph module in place.
async function openBank(bank:unknown,search=''){
 const lab=await setup(search);await settle();
 lab.context.testGraph=clipGraph;runInContext('clipGraph=testGraph',lab.context);
 const opening=runInContext("tab='clipbank';openClipBank()",lab.context);await settle();
 lab.respond(served(bank),'/api/clip-bank');await opening;await settle();
 return lab;
}

test('the clip bank re-reads itself: a rendering film shows as such, a finished one is announced, and the view is left alone',async()=>{
 const bank:any=clipBank(),{context,element,respond,requests,fire}=await openBank(bank);
 const poll=async(reply:unknown)=>{const tick=runInContext('kbRefresh()',context);await settle();respond(reply,'/api/clip-bank');await tick;};
 assert.equal(element('kb-count').textContent,'3 av 51 kanter klara');assert.equal(runInContext('kbEdge',context),'READY>P4.C1');
 let loads=0;const player=element('kb-player'),film=player.src;player.load=()=>{loads++;};
 // Unchanged data repaints nothing.
 element('kb-tree').innerHTML='untouched';await poll(served(bank));
 assert.equal(element('kb-tree').innerHTML,'untouched');
 // A newly ordered job shows as rendering on its edge, without an announcement.
 const job={...bank.jobs[0],id:'pamela-p2-c1-plan-deal-01',target:'P2.C1',to:'LAND(P2.C1)'};
 bank.jobs.push(job);bank.receipts[job.id]={status:'RUNNING',estimatedCredits:80};bank.media[job.id]={video:null,first:null,last:null};
 await poll(served(bank));
 assert.match(element('kb-tree').innerHTML,/class="kb-edge s-ORDERED" data-edge="READY&#62;P2\.C1"[^]*?class="kb-render"/);
 assert.match(element('kb-count-detail').textContent,/renderas 1/);assert.equal(element('kb-notices').innerHTML,'');
 // The selection and the film being watched are untouched by the re-read.
 assert.equal(runInContext('kbEdge',context),'READY>P4.C1');assert.equal(player.src,film);assert.equal(loads,0);
 // When the film arrives it is announced once, and the count moves.
 bank.receipts[job.id].status='SUCCEEDED';bank.media[job.id].video='assets/motions/pamela-p2-c1-plan-deal-01/source.mp4';
 await poll(served(bank));
 assert.match(element('kb-notices').innerHTML,/Ny film klar: <code>READY&#62;P2\.C1<\/code>/);assert.equal(element('kb-notices').innerHTML.match(/data-news=/g).length,1);
 assert.equal(element('kb-count').textContent,'4 av 51 kanter klara');assert.equal(loads,0);
 // Without contact the view stays as it is and says so; the next successful read clears the warning.
 await poll({ok:false});
 assert.match(element('kb-live').textContent,/Ingen kontakt/);assert.equal(element('kb-count').textContent,'4 av 51 kanter klara');
 await poll(served(bank));
 assert.equal(element('kb-live').textContent,'Uppdateras automatiskt');
 // The announcement opens that take.
 fire('kb-notices','click',{target:{closest:()=>({dataset:{news:job.id}})}});
 assert.equal(runInContext('kbEdge',context),'READY>P2.C1');assert.equal(runInContext('kbTake',context),job.id);assert.equal(element('kb-notices').innerHTML,'');
 assert.ok(requests.every(request=>request.startsWith('GET ')));
});

test('giv + retur plays from a card as one chain and can be stepped frame by frame across the cut',async()=>{
 const {context,element,fire}=await openBank(clipBank());
 const state=()=>JSON.parse(runInContext('JSON.stringify({index:kbChain.index,playing:kbChain.playing,src:kbVideos[kbChain.active].src,time:kbVideos[kbChain.active].currentTime})',context));
 const at=(frame:number)=>Math.abs(state().time-(frame+.001)/30)<1e-9;
 runInContext("kbSelect('READY>P4.C1');kbPlayPair('IDLE')",context);await settle();
 assert.equal(runInContext('kbPanel',context),'round');assert.equal(element('kb-seq').value,'READY>P4.C1 | P4.C1>IDLE');
 assert.deepEqual([state().index,state().playing,state().src],[0,true,'assets/motions/pamela-p4-c1-plan-deal-02/source.mp4']);assert.ok(at(0));
 // One frame forward pauses the chain and shows the next source frame.
 runInContext('kbChainStep(1)',context);await settle();
 assert.equal(state().playing,false);assert.ok(at(1));
 assert.equal(element('kb-chain-status').textContent,'Steg 1 av 2 · READY>P4.C1 · ruta 1 / 104 · pausad');
 // Past the deal's last shown frame (104, the frame before its landing frame) comes the return's first frame.
 runInContext('kbVideos[kbChain.active].currentTime=104.001/30;kbChainStep(1)',context);await settle();
 assert.deepEqual([state().index,state().src],[1,'assets/motions/pamela-p4-c1-plan-return-idle-01/source.mp4']);assert.ok(at(0));
 assert.equal(element('kb-chain-status').textContent,'Steg 2 av 2 · P4.C1>IDLE · ruta 0 / 89 · pausad');
 // And back again over the same cut.
 runInContext('kbChainStep(-1)',context);await settle();
 assert.equal(state().index,0);assert.ok(at(104));
 // The play button continues from where the stepping stopped, and pauses again.
 fire('kb-chain-play','click');assert.equal(state().playing,true);assert.equal(element('kb-chain-play').textContent,'Pausa');
 fire('kb-chain-play','click');assert.equal(state().playing,false);assert.equal(element('kb-chain-play').textContent,'Fortsätt');
 // Replaying a step starts it from its first frame even though the film stood at the cut.
 runInContext('kbPlayStep(0)',context);await settle();
 assert.ok(at(0));assert.equal(state().playing,true);
});

test('experiments, derived takes and replaced takes each have their place: a chain to play, a folded row and a read-only list',async()=>{
 const bank:any=clipBank(),sha='c'.repeat(64),ready2='assets/motions/pamela-p1-c1-ready2-01/source.mp4';
 const extra=(id:string,from:string,to:string,kind:string,decision:string,bytes?:number)=>{
  bank.jobs.push({...bank.jobs[0],id,kind,target:null,from,to});bank.motions[id]={source:{fps:30,frames:120,sha256:sha,bytes},review:{decision}};
  bank.receipts[id]={status:'SUCCEEDED',estimatedCredits:80};bank.media[id]={video:`assets/motions/${id}/source.mp4`,first:null,last:null};
 };
 extra('pamela-p4-c1-plan-deal-01','READY','LAND(P4.C1)','DEAL','REJECTED',11443369);bank.jobs.at(-1).target='P4.C1';
 extra('pamela-readyb-draw-01','READY-B','DRAWN','ENTRY','REJECTED');extra('pamela-p4-c1-drawn-deal-01','DRAWN','LAND(P4.C1)','DEAL','ACCEPTED');
 bank.derived=[{id:'pamela-readyb-draw-cut-01',kind:'ENTRY',from:'READY-B',to:'DRAWN',clip:'pamela-p1-c1-ready2-01',frames:[0,50],purpose:'Real draw-out from an older clip.'}];
 bank.motions['pamela-readyb-draw-cut-01']={source:{fps:30,frames:360}};bank.media['pamela-readyb-draw-cut-01']={video:ready2,first:null,last:null};
 // A deep link may carry a whole chain, experiment edges included.
 const {context,element,fire}=await openBank(bank,'?tab=klippbank&round=READY-B>DRAWN|DRAWN>P4.C1');
 assert.equal(runInContext('kbPanel',context),'round');assert.equal(element('kb-seq').value,'READY-B>DRAWN | DRAWN>P4.C1');
 assert.match(element('kb-seq-count').textContent,/^2 steg · 2 spelbara · 0 luckor · 5,7 s film · ändrad för hand$/);
 assert.match(element('kb-steps').innerHTML,/readyb-draw-cut-01 · ruta 0–50</);
 // The 51 edges are counted as before; experiments are counted and listed on their own, as a chain to compare with the model's way.
 assert.equal(element('kb-count').textContent,'3 av 51 kanter klara');assert.match(element('kb-count-detail').textContent,/experiment 2/);
 assert.equal(element('kb-experiments').hidden,false);
 assert.match(element('kb-experiment-chains').innerHTML,/<b>P4\.C1<\/b><button class="model" data-chain-model="P4\.C1"[^>]*>▶ A · <code>READY&#62;P4\.C1<\/code><\/button><button data-chain="0"[^>]*>▶ B · <code>READY-B → DRAWN → P4\.C1<\/code><\/button><\/div>$/);
 assert.match(element('kb-experiment-edges').innerHTML,/data-edge="READY-B&#62;DRAWN"[^]*data-edge="DRAWN&#62;P4\.C1"/);assert.equal(element('kb-experiment-count').textContent,'Enskilda experimentkanter (2)');
 assert.equal(element('kb-tree').innerHTML.match(/class="kb-edge /g).length,54);
 fire('kb-experiment-chains','click',{target:{closest:()=>({dataset:{chainModel:'P4.C1'}})}});await settle();
 assert.equal(element('kb-seq').value,'READY>P4.C1');
 fire('kb-experiment-chains','click',{target:{closest:()=>({dataset:{chain:'0'}})}});await settle();
 assert.equal(element('kb-seq').value,'READY-B>DRAWN | DRAWN>P4.C1');
 assert.equal(runInContext('kbVideos[kbChain.active].src',context),ready2);
 // By default an edge shows what matters now; the rejected take waits behind one folded row.
 runInContext("kbSelect('READY>P4.C1')",context);
 assert.match(element('kb-takes').innerHTML,/data-take="pamela-p4-c1-plan-deal-02"/);assert.doesNotMatch(element('kb-takes').innerHTML,/plan-deal-01/);
 assert.match(element('kb-takes-old').innerHTML,/data-take="pamela-p4-c1-plan-deal-01"/);assert.equal(element('kb-old').hidden,false);
 assert.equal(element('kb-old-summary').textContent,'Ersatta och underkända (1)');assert.notEqual(element('kb-old').open,true);
 runInContext("kbSelect('READY>P4.C1','pamela-p4-c1-plan-deal-01')",context);
 assert.equal(element('kb-old').open,true);
 // The clean-up list is information only: what is rejected or replaced, and how large it is.
 assert.equal(element('kb-cleanup').hidden,false);assert.equal(element('kb-cleanup-summary').textContent,'Städlista · 2 tagningar · 10,9 MB');
 assert.match(element('kb-cleanup-rows').innerHTML,/<td>pamela-p4-c1-plan-deal-01<\/td><td>READY&#62;P4\.C1<\/td><td>underkänd<\/td><td>10,9 MB<\/td>/);
 assert.doesNotMatch(element('kb-cleanup-rows').innerHTML,/<button/);
 // An experiment edge has the same detail view. Its derived take says which frames of which film it shows.
 runInContext("kbSelect('READY-B>DRAWN')",context);
 assert.match(element('kb-edge-sub').textContent,/Experiment utanför nodträdet/);assert.equal(element('kb-draft').hidden,true);
 assert.equal(runInContext('kbTake',context),'pamela-readyb-draw-cut-01');assert.equal(element('kb-player').src,ready2);
 assert.match(element('kb-facts').innerHTML,/ruta 0–50 ur <code>pamela-p1-c1-ready2-01<\/code>/);assert.equal(element('kb-prompt-box').hidden,true);assert.equal(element('kb-images').innerHTML,'');
});

test('the proof tab plays a proof folder with frame stepping, and the mobile view says its framing is provisional',async()=>{
 const {context,element,respond,requests,fire}=await setup('?tab=prov&proof=card-overlay&file=b2-kort-2.mp4&frame=103');
 const file=(name:string)=>({name,path:`assets/proofs/card-overlay/${name}`,kind:name.endsWith('.mp4')?'video':'image',bytes:9000000}),player=element('pf-player');
 player.duration=6.5;player.readyState=1;
 respond({ok:true,json:async()=>({proofs:[{id:'card-overlay',title:null,description:null,labels:null,chapters:null,fps:30,files:['ark-1-b1-ur-skon.png','b2-kort-2.mp4','jamforelse.mp4','ra.mp4'].map(file)}]})},'/api/proofs');await settle();
 assert.equal(element('proofs').hidden,false);assert.equal(element('.workspace').hidden,true);assert.equal(element('pf-notice').hidden,true);
 assert.equal(element('pf-title').textContent,'Renderat kort ovanpå filmen — en film, två kortplatser');
 // The comparison comes first; the deep link chose another film and a frame in it.
 assert.match(element('pf-files').innerHTML,/data-file="jamforelse\.mp4" aria-pressed="false"[^]*data-file="ra\.mp4"[^]*data-file="b2-kort-2\.mp4" aria-pressed="true"/);
 assert.equal(player.src,'assets/proofs/card-overlay/b2-kort-2.mp4');
 assert.ok(Math.abs(player.currentTime-103.001/30)<1e-9);assert.equal(element('pf-frame').textContent,'Ruta 103 / 194 · 30 fps');
 fire('pf-next','click');assert.equal(element('pf-frame').textContent,'Ruta 104 / 194 · 30 fps');
 fire('pf-chapters','click',{target:{closest:()=>({dataset:{frame:'88'}})}});assert.equal(element('pf-frame').textContent,'Ruta 88 / 194 · 30 fps');
 assert.match(element('pf-chapters').innerHTML,/data-frame="88"/);assert.match(element('pf-sheets').innerHTML,/src="assets\/proofs\/card-overlay\/ark-1-b1-ur-skon\.png"/);
 // Without the endpoint (the public site) the tab says so instead of failing.
 const again=runInContext('openProofs()',context);await settle();respond({ok:false},'/api/proofs');await again;
 assert.match(element('pf-notice').textContent,/finns bara lokalt/);assert.equal(element('pf-body').hidden,true);
 assert.ok(requests.every(request=>request.startsWith('GET ')));
 // Placement tab: the note is shown in the mobile view only.
 runInContext("setTab('placement')",context);
 assert.equal(element('mobile-note').hidden,true);
 fire('view-portrait','click');assert.equal(element('mobile-note').hidden,false);
 fire('view-native','click');assert.equal(element('mobile-note').hidden,true);
});

test('a review decision is written only by its button, against the revision that was read, and the view says what happened',async()=>{
 const bank:any=clipBank(),id='pamela-p4-c1-plan-deal-02',address=`/api/clip-bank/review/${id}`;
 bank.revisions={[id]:'"rev-1"'};bank.motions[id].review.userReview='Jakob 2026-11-10: bra grepp';
 const {context,element,respond,requests,calls,fire}=await openBank(bank),press=(decision:string)=>fire('kb-decide','click',{target:{closest:()=>({dataset:{decide:decision}})}});
 // Opening the tab, the edge and the take writes nothing; the note shows the stored words without name and date.
 assert.ok(requests.every(request=>request.startsWith('GET ')));
 assert.equal(element('kb-decide').hidden,false);assert.equal(element('kb-note').value,'bra grepp');assert.equal(element('kb-note').disabled,false);
 assert.match(element('kb-decide-state').textContent,/Ett klick sparar beslutet och anteckningen i motions\/pamela-p4-c1-plan-deal-02\.json/);
 // A take without a record in motions/ cannot be decided: it says so, and its buttons do nothing.
 runInContext("kbSelect('P4.C1>READY')",context);
 assert.match(element('kb-decide-state').textContent,/Kan inte sparas ännu: pamela-p4-c1-plan-return-ready-01 har ingen post i motions\//);assert.equal(element('kb-note').disabled,true);
 press('REJECTED');await settle();assert.ok(requests.every(request=>request.startsWith('GET ')));
 // One press sends one PUT with the decision, the note and the revision; while it is on its way a second press is ignored.
 runInContext("kbSelect('READY>P4.C1')",context);element('kb-note').value='fingret går igenom kortet';
 press('REJECTED');press('ACCEPTED');await settle();
 const puts=calls.filter(call=>call.init?.method==='PUT');
 assert.equal(puts.length,1);assert.equal(puts[0].url,address);assert.equal(puts[0].init!.headers!['if-match'],'"rev-1"');
 assert.deepEqual(JSON.parse(puts[0].init!.body!),{decision:'REJECTED',note:'fingret går igenom kortet'});
 assert.equal(element('kb-decide-state').textContent,'Sparar beslutet…');
 // The answer is shown, and the bank is read again so every view carries what is now on disk.
 bank.motions[id].review={decision:'REJECTED',userReview:'Jakob 2026-11-11: fingret går igenom kortet'};bank.revisions[id]='"rev-2"';
 respond({ok:true,json:async()=>({revision:'"rev-2"',review:bank.motions[id].review})},address);await settle();
 respond(served(bank),'/api/clip-bank');await settle();
 assert.equal(element('kb-decide-state').textContent,'Sparat i motions/pamela-p4-c1-plan-deal-02.json · Jakob 2026-11-11: fingret går igenom kortet');
 assert.match(element('kb-review').innerHTML,/UNDERKÄND/);assert.equal(runInContext('kbGraph.takes[kbTake].revision',context),'"rev-2"');
 // A refusal (someone else changed the record) is shown as such and nothing is assumed saved.
 press('ACCEPTED');await settle();
 assert.equal(calls.filter(call=>call.init?.method==='PUT').at(-1)!.init!.headers!['if-match'],'"rev-2"');
 respond({ok:false,json:async()=>({error:'Posten har ändrats sedan den lästes.'})},address);await settle();
 assert.equal(element('kb-decide-state').textContent,'Inte sparat: Posten har ändrats sedan den lästes.');
 assert.equal(calls.filter(call=>call.init?.method==='PUT').length,2);
});

test('the rendered card says when it is not available, and a take shows its card track and where the card goes in front of the hand',async()=>{
 const bank:any=clipBank(),id='pamela-p4-c1-plan-deal-02',track=`assets/tracking/${id}/card-track.json`,rules=`assets/tracking/${id}/overrides.json`;
 bank.media[id].track=track;bank.media[id].overrides=rules;
 const {context,element,respond,requests}=await openBank(bank);
 // Without the overlay modules (the public site, or this VM) the take still opens; the track is simply not read.
 assert.match(element('kb-facts').innerHTML,/<dt>Kortspår<\/dt><dd>kunde inte läsas<\/dd>/);
 runInContext('ov.on=true;ovLoad()',context);await settle();
 assert.equal(runInContext('ovState',context),'missing');assert.equal(element('kb-card').hidden,true);assert.equal(runInContext("ovStatus('take')",context),'Det renderade kortet finns bara lokalt.');
 assert.ok(!requests.some(request=>request.includes('tracking')||request.includes('scene-contract')));
 // With the model in place the track and the overrides are read once, read-only, and described in the take detail.
 context.testOverlay=cardOverlay;runInContext('ovModel=testOverlay;ovData.clear();ovReading.clear();paintEdge()',context);await settle();
 const quad=[[800,1000],[870,1000],[870,1060],[800,1060]],frames=Array.from({length:6},(_,i)=>({frame:i,side:i<3?'BACK':'FRONT',quad,edge:null,confidence:.9}));
 respond({ok:true,json:async()=>({width:1764,height:1174,frames,edgeWindow:null,flips:[{from:2,to:3,quarterTurns:1}],restFrom:4,restQuad:quad})},track);
 respond({ok:true,json:async()=>({cardInFront:[{from:2,to:3,note:'<b>fingertopp</b>'}]})},rules);await settle();
 assert.match(element('kb-facts').innerHTML,/<dt>Kortspår<\/dt><dd>BACK 0–2 · FRONT 3–5 · sätts om 1 kvartsvarv vid ruta 2–3 · vilar från ruta 4<\/dd>/);
 assert.match(element('kb-facts').innerHTML,/<dt>Kort framför handen<\/dt><dd>ruta 2–3 · &#60;b&#62;fingertopp&#60;\/b&#62; · ur <code>assets\/tracking\/pamela-p4-c1-plan-deal-02\/overrides\.json<\/code><\/dd>/);
 assert.equal(requests.filter(request=>request.includes('tracking')).length,2);assert.ok(requests.every(request=>request.startsWith('GET ')));
 // A take without a track says how to get one.
 runInContext("kbSelect('P4.C1>READY')",context);
 assert.match(element('kb-facts').innerHTML,/<dt>Kortspår<\/dt><dd>saknas · renderat kort kräver <code>node tools\/track-card\.ts pamela-p4-c1-plan-return-ready-01<\/code><\/dd>/);
});

test('a corrected copy is labelled as such, a slow-motion take plays at its own speed and a reversed film can be chosen',async()=>{
 const bank:any=clipBank(),id='pamela-p4-c1-plan-deal-02',copy=`${id}-edit-01`;
 bank.edits=[{id:copy,source:{clip:id},model:'aleph2',promptText:'One correction only.',purpose:'grip'}];
 bank.media[copy]={video:`assets/motions/${copy}/source.mp4`,reversed:`assets/motions/${copy}/source-reversed.mp4`,first:null,last:null};bank.receipts[copy]={status:'SUCCEEDED',estimatedCredits:60};
 bank.jobs[0].playbackSpeed=2;
 const {context,element,fire,requests}=await openBank(bank),player=element('kb-player');
 // The copy sits among the takes of the same edge, saying what it is a copy of. Being the newest unreviewed take with a return that fits, it is the main take.
 assert.match(element('kb-takes').innerHTML,/data-take="pamela-p4-c1-plan-deal-02-edit-01"[^>]*><b>plan-deal-02-edit-01<\/b><span>huvudtagning · rättad kopia av plan-deal-02 · 2×<\/span>/);
 // The slow-motion take plays at twice the chosen speed; frame numbers are the file's.
 runInContext("kbSelect('READY>P4.C1','pamela-p4-c1-plan-deal-02')",context);await settle();
 element('kb-speed').value='1';fire('kb-player','loadedmetadata');assert.equal(player.playbackRate,2);
 element('kb-speed').value='0.5';fire('kb-speed','change');assert.equal(player.playbackRate,1);
 assert.match(element('kb-facts').innerHTML,/<dt>Uppspelning<\/dt><dd>filmen är gjord i slow motion och spelas här i 2×/);assert.equal(element('kb-reverse-box').hidden,true);
 // The copy: detail says so, keeps its source's viewing speed (same timing), and offers its reversed film.
 runInContext(`kbSelect('READY>P4.C1','${copy}')`,context);await settle();
 assert.match(element('kb-facts').innerHTML,/<dt>Rättad kopia<\/dt><dd>av <code>pamela-p4-c1-plan-deal-02<\/code>/);assert.equal(element('kb-prompt').textContent,'One correction only.');
 assert.equal(player.src,`assets/motions/${copy}/source.mp4`);assert.equal(element('kb-reverse-box').hidden,false);
 element('kb-speed').value='1';fire('kb-speed','change');assert.equal(player.playbackRate,2);
 element('kb-reverse').checked=true;fire('kb-reverse','change');
 assert.equal(player.src,`assets/motions/${copy}/source-reversed.mp4`);assert.match(element('kb-facts').innerHTML,/<dt>Baklänges<\/dt><dd>den omvända filen spelas/);
 // Another take always opens forwards again.
 runInContext("kbSelect('READY>P4.C1','pamela-p4-c1-plan-deal-02')",context);
 assert.equal(player.src,'assets/motions/pamela-p4-c1-plan-deal-02/source.mp4');assert.equal(element('kb-reverse').checked,false);
 assert.ok(requests.every(request=>request.startsWith('GET ')));
});
