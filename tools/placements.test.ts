import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {defaultPlan,validatePlan,toPixels,fromPixels,quad,flatQuad,snapPoint,motionNodes,constrain,sequence,TARGETS,angleToward} from '../src/placement-model.ts';
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
 const text=sequence('P4.C2',{takeHand:'LH',startSide:'BACK',endSide:'BACK',pass:true,turn:false});assert.match(text,/PASS\(LH>RH,BACK\)/);assert.match(text,/RELEASE\(RH\)/);assert.doesNotMatch(text,/\bTURN\(/);assert.match(text,/RETURN\(SHOE_READY\)$/);
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
 const intent={takeHand:'LH' as const,startSide:'BACK' as const,endSide:'FRONT' as const,pass:true,turn:true};
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
