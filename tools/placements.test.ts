import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {defaultPlan,validatePlan,toPixels,fromPixels,quad,flatQuad,snapPoint,motionNodes,constrain,sequence,TARGETS,PLAYER_TARGETS,INTENT_DEFAULTS,TECHNIQUES,angleToward,applyTechnique,techniqueOf,copyChoices,scaleCards,SHOE_CARD,VIEWS,type Intent,type Technique} from '../src/placement-model.ts';
import {placementStore,StoreError} from './placement-store.ts';

test('pixel-centre transforms are invertible at both image edges and interior',()=>{
 for(const view of ['native','portrait'] as const)for(const point of [{u:0,v:0},{u:1,v:1},{u:.5,v:.5},{u:.234,v:.892}]){
  const px=toPixels(point,view),back=fromPixels(px.x,px.y,view);assert.ok(Math.abs(back.u-point.u)<1e-12);assert.ok(Math.abs(back.v-point.v)<1e-12);
 }assert.deepEqual(toPixels({u:.5,v:.5},'native'),{x:880.5,y:586.5});
});
test('sixteen draft slots have independent view geometry and coherent motion plans',()=>{
 const p=defaultPlan();validatePlan(p);assert.equal(Object.keys(p.targets).length,16);assert.equal(p.targets['D.C2'].intent.turn,false);assert.equal(p.targets['P4.C2'].intent.endSide,'BACK');assert.equal(p.targets['P4.C2'].intent.turn,false);
 const old=structuredClone(p.targets['P4.C2'].geometry.portrait);p.targets['P4.C2'].geometry.native.u=.7;assert.deepEqual(p.targets['P4.C2'].geometry.portrait,old);
 for(const id of TARGETS)assert.equal(p.targets[id].geometry.native.reviewed,false);
 const text=sequence('P4.C2',{takeHand:'LH',startSide:'BACK',endSide:'BACK',pass:true,turn:false,...INTENT_DEFAULTS});assert.match(text,/PASS\(LH>RH,BACK\)/);assert.match(text,/RELEASE\(RH\)/);assert.doesNotMatch(text,/\bTURN\(/);assert.match(text,/RETURN\(SHOE_READY\)$/);
});

test('saved table projection is optional for legacy files and rejects unsupported settings',async()=>{
 const plan=defaultPlan();assert.deepEqual(plan.tableProjection,{mode:'flat',heading:0});
 const legacy=structuredClone(plan);delete legacy.tableProjection;validatePlan(legacy);
 for(const projection of [{mode:'spherical',heading:0},{mode:'flat',heading:22},{mode:'flat',heading:0,extra:true},null]){
  assert.throws(()=>validatePlan({...plan,tableProjection:projection}));
 }
});
test('card tops can point up, right, left or down in either view',()=>{
 for(const view of ['native','portrait'] as const){
  const from={u:.5,v:.5};
  assert.equal(angleToward(from,{u:.5,v:.8},view),0);
  assert.equal(angleToward(from,{u:.8,v:.5},view),90);
  assert.equal(angleToward(from,{u:.2,v:.5},view),-90);
  assert.equal(angleToward(from,{u:.5,v:.2},view),-180);
  assert.equal(angleToward(from,from,view),0);
 }
});
test('rotated silhouettes are constrained in pixel space, not stretched normalized angles',()=>{
 const g={u:.99,v:.01,width:.12,height:.08,angle:70,taper:1.4,reviewed:false};const c=constrain(g,'native');const q=quad(c,'native');
 assert.ok(q.every(p=>p.x>=0&&p.y>=0&&p.x<=1761+.00001&&p.y<=1173+.00001));
 const unrotated=quad({...g,u:.5,v:.5,angle:0,taper:1},'native'),rotated=quad({...g,u:.5,v:.5,angle:90,taper:1},'native');
 assert.ok(Math.abs(Math.abs(unrotated[1].x-unrotated[0].x)-Math.abs(rotated[1].y-rotated[0].y))<1e-9);
});
test('one flat plane preserves P4 corners and all image centres without changing a plan',()=>{
 const plan=defaultPlan(),before=JSON.stringify(plan);
 for(const view of ['native','portrait'] as const){
  const reference=plan.targets['P4.C1'].geometry[view],original=quad(reference,view),same=flatQuad(reference,reference,view);
  original.forEach((p,i)=>assert.ok(Math.hypot(p.x-same[i].x,p.y-same[i].y)<1e-6));
  for(const target of Object.values(plan.targets))for(const angle of [-90,-45,0,45,90]){
   const q=flatQuad(target.geometry[view],reference,view,angle),c=q.reduce((s,p)=>({x:s.x+p.x/4,y:s.y+p.y/4}),{x:0,y:0}),want=toPixels(target.geometry[view],view);
   assert.ok(q.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));assert.ok(Math.hypot(c.x-want.x,c.y-want.y)<1e-6);
  }
  const a={...reference,u:.25},b={...reference,u:.75},qa=flatQuad(a,reference,view),qb=flatQuad(b,reference,view);
  // Same depth on the same plane: equal scale and horizontal edges, no fan rotation.
  assert.ok(Math.abs(qa[0].y-qa[1].y)<1e-6);assert.ok(Math.abs(qb[0].y-qb[1].y)<1e-6);
  assert.ok(Math.abs((qa[1].x-qa[0].x)-(qb[1].x-qb[0].x))<1e-6);
 }
 assert.equal(JSON.stringify(plan),before);
});
test('snap is stable in pixel coordinates and respects both image boundaries',()=>{
 for(const view of ['native','portrait'] as const)for(const step of [5,10,20]){
  const once=snapPoint({u:.832,v:.19},view,step);assert.deepEqual(snapPoint(once,view,step),once);
  const px=toPixels(once,view);assert.ok(Math.abs(px.x/step-Math.round(px.x/step))<1e-9);assert.ok(Math.abs(px.y/step-Math.round(px.y/step))<1e-9);
  for(const p of [{u:0,v:0},{u:1,v:1}]){const q=snapPoint(p,view,step);assert.ok(q.u>=0&&q.u<=1&&q.v>=0&&q.v<=1);}
 }
});
test('node map separates hand transfer from a real side turn',()=>{
 const intent:Intent={takeHand:'LH',startSide:'BACK',endSide:'FRONT',pass:true,turn:true,...INTENT_DEFAULTS};
 const nodes=motionNodes('P7.C1',intent);assert.deepEqual(nodes.map(n=>n.id),['ready','take','pass','turn','land','release','return']);assert.equal(nodes.find(n=>n.id==='release')?.detail,'RH');
 assert.ok(!motionNodes('D.C2',{...intent,endSide:'BACK',turn:false}).some(n=>n.id==='turn'));
});
test('invalid geometry, unknown fields and false side-change claims are rejected',()=>{
 for(const mutate of [(p:any)=>p.targets['P1.C1'].geometry.native.u=NaN,(p:any)=>p.targets['P1.C1'].geometry.native.width=3,(p:any)=>p.targets['P1.C1'].geometry.native.u=0,(p:any)=>p.targets['P1.C1'].intent.turn=false,(p:any)=>p.targets['P1.C1'].intent.takeHand=['LH'],(p:any)=>p.targets['P1.C1'].intent.startSide=['BACK'],(p:any)=>p.file='../outside.json']){const p=defaultPlan();mutate(p);assert.throws(()=>validatePlan(p));}
});
test('concurrent stale saves cannot overwrite another tab, and previous data is retained',async()=>{
 const base=path.resolve(tmpdir()),dir=await mkdtemp(path.join(base,'dealer-placement-test-'));assert.ok(path.resolve(dir).startsWith(base+path.sep));
 try{const store=placementStore(dir),initial=await store.load();const a=structuredClone(initial.plan),b=structuredClone(initial.plan);a.targets['P4.C2'].geometry.native.u=.6;b.targets['P4.C2'].geometry.native.u=.7;
  const results=await Promise.allSettled([store.save(a,initial.revision),store.save(b,initial.revision)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const rejected=results.find(r=>r.status==='rejected') as PromiseRejectedResult;assert.ok(rejected.reason instanceof StoreError);assert.equal(rejected.reason.status,409);
  const saved=await store.load();assert.equal(saved.plan.targets['P4.C2'].geometry.native.u,.6);assert.ok(saved.plan.updatedAt);assert.equal(JSON.parse(await readFile(path.join(dir,'.runtime/placement-previous.json'),'utf8')).targets['P4.C2'].geometry.native.u,initial.plan.targets['P4.C2'].geometry.native.u);
  await assert.rejects(store.save(a,undefined),(e:StoreError)=>e.status===428);
 }finally{assert.ok(path.resolve(dir).startsWith(base+path.sep+'dealer-placement-test-'));await rm(dir,{recursive:true,force:true});}
});

// A plan as it was saved before grip and turnAt existed.
const legacyPlan=()=>{const plan=defaultPlan() as any;for(const t of Object.values(plan.targets) as any[]){delete t.intent.grip;delete t.intent.turnAt;}return plan;};
const INTENT_KEYS=['takeHand','startSide','endSide','pass','turn','grip','turnAt'];
test('plans saved before grip and turnAt load with their defaults, and the two keys validate strictly',()=>{
 const legacy=legacyPlan();validatePlan(legacy);
 for(const id of TARGETS){assert.deepEqual(Object.keys(legacy.targets[id].intent),INTENT_KEYS);assert.equal(legacy.targets[id].intent.grip,'PINCH');assert.equal(legacy.targets[id].intent.turnAt,'AIR');}
 // One key present keeps its value; only the missing one is filled.
 const partial=legacyPlan();partial.targets['P2.C1'].intent.grip='DRAG';validatePlan(partial);assert.equal(partial.targets['P2.C1'].intent.grip,'DRAG');assert.equal(partial.targets['P2.C1'].intent.turnAt,'AIR');
 for(const mutate of [(i:any)=>i.grip='SLIDE',(i:any)=>i.grip=null,(i:any)=>i.grip=['DRAG'],(i:any)=>i.turnAt='FLOOR',(i:any)=>i.turnAt=true,(i:any)=>i.speed=1]){const p=defaultPlan();mutate(p.targets['P3.C2'].intent);assert.throws(()=>validatePlan(p));}
 // A plan that fails is not half filled in.
 const broken=legacyPlan();broken.targets['D.C2'].geometry.native.u=NaN;assert.throws(()=>validatePlan(broken));assert.equal(Object.hasOwn(broken.targets['P1.C1'].intent,'grip'),false);
});
test('the tracked plan files load with the new keys filled in: the saved draft, the proposals and a frozen reference',async()=>{
 for(const file of ['placements/default.json','placements/proposals/forslag.json','placements/proposals/forslag-slump.json','placements/references/p7-direct-pilot-01.json']){
  const plan=JSON.parse(await readFile(file,'utf8'));validatePlan(plan);
  for(const id of TARGETS)assert.deepEqual(Object.keys(plan.targets[id].intent).slice(-2),['grip','turnAt'],`${file} ${id}`);
 }
});
test('the store reads an older file with the defaults and writes the two keys when it saves',async()=>{
 const base=path.resolve(tmpdir()),dir=await mkdtemp(path.join(base,'dealer-placement-test-'));assert.ok(path.resolve(dir).startsWith(base+path.sep));
 try{
  await mkdir(path.join(dir,'placements'));await writeFile(path.join(dir,'placements/default.json'),JSON.stringify(legacyPlan(),null,2)+'\n');
  const store=placementStore(dir),read=await store.load();assert.equal(read.plan.targets['P5.C1'].intent.grip,'PINCH');assert.equal(read.plan.targets['P5.C1'].intent.turnAt,'AIR');
  // A client that still sends the older shape gets the keys written too.
  await store.save(legacyPlan(),read.revision);const text=await readFile(path.join(dir,'placements/default.json'),'utf8');
  assert.equal(text.match(/"grip": "PINCH"/g)?.length,16);assert.equal(text.match(/"turnAt": "AIR"/g)?.length,16);
 }finally{assert.ok(path.resolve(dir).startsWith(base+path.sep+'dealer-placement-test-'));await rm(dir,{recursive:true,force:true});}
});
test('the sequence and the node map show a dragged card and where the turn happens',()=>{
 const drag:Intent={takeHand:'LH',startSide:'BACK',endSide:'FRONT',pass:false,turn:true,grip:'DRAG',turnAt:'PLACE'};
 assert.equal(sequence('P2.C1',drag),'P2.C1 | DRAG(LH,BACK) > TURN(LH,BACK>FRONT,PLACE) > LAND(FRONT) > RELEASE(LH) > RETURN(SHOE_READY)');
 assert.equal(sequence('P2.C1',{...drag,grip:'PINCH',turnAt:'AIR'}),'P2.C1 | TAKE(LH,BACK) > TURN(LH,BACK>FRONT,AIR) > LAND(FRONT) > RELEASE(LH) > RETURN(SHOE_READY)');
 assert.match(sequence('P2.C1',{...drag,pass:true,turnAt:'AIR'}),/^P2\.C1 \| DRAG\(LH,BACK\) > PASS\(LH>RH,BACK\) > TURN\(RH,BACK>FRONT,AIR\) > LAND\(FRONT\) > RELEASE\(RH\)/);
 // Laid closed and turned later: no TURN at all, whatever the place of a turn says.
 assert.equal(sequence('D.C2',{...drag,endSide:'BACK',turn:false}),'D.C2 | DRAG(LH,BACK) > LAND(BACK) > RELEASE(LH) > RETURN(SHOE_READY)');
 const nodes=motionNodes('P2.C1',drag);assert.equal(nodes.find(n=>n.id==='take')?.label,'DRAG');assert.equal(nodes.find(n=>n.id==='turn')?.detail,'BACK → FRONT · PLACE');
 assert.equal(motionNodes('P2.C1',{...drag,grip:'PINCH'}).find(n=>n.id==='take')?.label,'TAKE');
});
test('a technique sets how the card is taken and turned in one go and leaves the hand choices alone',()=>{
 const start:Intent={takeHand:'RH',startSide:'FRONT',endSide:'BACK',pass:true,turn:true,grip:'PINCH',turnAt:'AIR'};
 for(const name of Object.keys(TECHNIQUES) as Technique[]){
  const intent=applyTechnique(start,name),plan=defaultPlan();plan.targets['P6.C1'].intent=intent;validatePlan(plan);
  assert.equal(techniqueOf(intent),name);assert.equal(intent.takeHand,'RH');assert.equal(intent.pass,true);assert.equal(intent.startSide,'BACK');
 }
 assert.deepEqual(applyTechnique(start,'pinch-air'),{...start,startSide:'BACK',endSide:'FRONT',turn:true,grip:'PINCH',turnAt:'AIR'});
 assert.deepEqual(applyTechnique(start,'drag-place'),{...start,startSide:'BACK',endSide:'FRONT',turn:true,grip:'DRAG',turnAt:'PLACE'});
 assert.deepEqual(applyTechnique(start,'drag-closed'),{...start,startSide:'BACK',endSide:'BACK',turn:false,grip:'DRAG',turnAt:'AIR'});
 const plan=defaultPlan();assert.equal(techniqueOf(plan.targets['P1.C1'].intent),'pinch-air');assert.equal(techniqueOf(plan.targets['D.C2'].intent),null);
 // Where a card is not turned, the place of a turn does not decide the technique.
 assert.equal(techniqueOf({...applyTechnique(start,'drag-closed'),turnAt:'PLACE'}),'drag-closed');
});
test('motion and material are copied to the chosen cards only, as a new plan',()=>{
 const plan=defaultPlan();plan.targets['P3.C1'].intent={...applyTechnique(plan.targets['P3.C1'].intent,'drag-place'),takeHand:'RH'};plan.targets['P5.C2'].material={bend:.14,gloss:.5};
 const before=JSON.stringify(plan),moved=copyChoices(plan,'P3.C1','intent',PLAYER_TARGETS);
 assert.equal(JSON.stringify(plan),before);assert.equal(PLAYER_TARGETS.length,14);assert.ok(PLAYER_TARGETS.every(id=>id[0]==='P'));validatePlan(moved);
 for(const id of TARGETS){
  assert.deepEqual(moved.targets[id].intent,id[0]==='P'?plan.targets['P3.C1'].intent:plan.targets[id].intent,id);
  assert.deepEqual(moved.targets[id].geometry,plan.targets[id].geometry);assert.deepEqual(moved.targets[id].material,plan.targets[id].material);
 }
 assert.notEqual(moved.targets['P1.C1'].intent,moved.targets['P2.C1'].intent);
 const coated=copyChoices(plan,'P5.C2','material',TARGETS);
 for(const id of TARGETS){assert.deepEqual(coated.targets[id].material,{bend:.14,gloss:.5});assert.deepEqual(coated.targets[id].intent,plan.targets[id].intent);}
 assert.throws(()=>copyChoices(plan,'shoe','intent',PLAYER_TARGETS));assert.throws(()=>copyChoices(plan,'P1.C1','intent',['P9.C1']));
});
test('all cards scale by one factor in one view, keep centre and angle, and stop at the model\'s limits',()=>{
 const plan=defaultPlan();plan.targets['P2.C1'].geometry.native.angle=30;plan.targets['P6.C2'].geometry.native.reviewed=true;
 const before=JSON.stringify(plan),{plan:next,limited}=scaleCards(plan,'native',1.2);
 assert.equal(JSON.stringify(plan),before);assert.deepEqual(limited,[]);validatePlan(next);
 for(const id of TARGETS){
  const g=plan.targets[id].geometry.native,h=next.targets[id].geometry.native;
  assert.ok(Math.abs(h.width-g.width*1.2)<1e-12);assert.ok(Math.abs(h.height-g.height*1.2)<1e-12);
  assert.deepEqual({u:h.u,v:h.v,angle:h.angle,taper:h.taper,reviewed:h.reviewed},{u:g.u,v:g.v,angle:g.angle,taper:g.taper,reviewed:false});
  assert.deepEqual(next.targets[id].geometry.portrait,plan.targets[id].geometry.portrait);
  // Drawn on the flat table every centre stays where it was.
  const q=flatQuad(h,next.targets['P4.C1'].geometry.native,'native'),c=q.reduce((s,p)=>({x:s.x+p.x/4,y:s.y+p.y/4}),{x:0,y:0}),want=toPixels(g,'native');assert.ok(Math.hypot(c.x-want.x,c.y-want.y)<1e-6);
 }
 // Near the right edge a card grows only until its outline meets the edge, a large one stops at a quarter of the picture, a tiny one at the smallest size.
 const edge=defaultPlan(),right=edge.targets['P7.C2'].geometry.native;right.angle=0;right.u=(1761-38)/1761;edge.targets['P1.C1'].geometry.native.width=.2;edge.targets['P3.C1'].geometry.native.width=.006;validatePlan(edge);
 const grown=scaleCards(edge,'native',1.5);validatePlan(grown.plan);assert.deepEqual(grown.limited,['P1.C1','P7.C2']);
 assert.ok(Math.abs(Math.max(...quad(grown.plan.targets['P7.C2'].geometry.native,'native').map(p=>p.x))-1761)<1e-6);assert.equal(grown.plan.targets['P7.C2'].geometry.native.u,right.u);
 assert.ok(Math.abs(grown.plan.targets['P1.C1'].geometry.native.width-.25)<1e-12);assert.ok(Math.abs(grown.plan.targets['P2.C1'].geometry.native.width-edge.targets['P2.C1'].geometry.native.width*1.5)<1e-12);
 const shrunk=scaleCards(edge,'native',.5);validatePlan(shrunk.plan);assert.deepEqual(shrunk.limited,['P3.C1']);assert.ok(Math.abs(shrunk.plan.targets['P3.C1'].geometry.native.width-.005)<1e-12);
 // A factor of 1 changes nothing, not even the check marks; a factor outside 0.50–2.50 is refused.
 assert.deepEqual(scaleCards(plan,'portrait',1).plan,plan);
 for(const factor of [.45,2.55,Number.NaN])assert.throws(()=>scaleCards(plan,'native',factor));
});

test('the yellow card the lab paints in the shoe window lies in the picture, around the shoe point of the plan',()=>{
 const plan=defaultPlan();
 for(const view of ['native','portrait'] as const){
  const q=SHOE_CARD[view],p=VIEWS[view],s=toPixels(plan.shoe[view],view);assert.equal(q.length,4);
  for(const c of q)assert.ok(c.x>0&&c.y>0&&c.x<p.width-1&&c.y<p.height-1);
  // clockwise in picture coordinates (y down), and the shoe point on the inner side of every edge
  for(let i=0;i<4;i++){const a=q[i],b=q[(i+1)%4];assert.ok((b.x-a.x)*(s.y-a.y)-(b.y-a.y)*(s.x-a.x)>0,`${view} edge ${i}`);}
  // a standing card: about twice as long as it is wide in the picture
  const side=(i:number)=>Math.hypot(q[(i+1)%4].x-q[i].x,q[(i+1)%4].y-q[i].y);assert.ok(side(1)/side(0)>1.6&&side(1)/side(0)<2.6);
 }
});
