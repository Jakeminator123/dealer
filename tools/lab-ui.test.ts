import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {createContext,runInContext} from 'node:vm';
import * as model from '../src/placement-model.ts';

// Execute the real UI module with a small DOM port and controllable HTTP replies.
// No local server or user's placement file is changed by these race regressions.
async function setup(){
 const elements=new Map<string,any>();
 const listeners=new Map<string,(()=>void)[]>();
 function element(id:string):any{
  if(!elements.has(id))elements.set(id,{
   value:'0',checked:false,clientWidth:1000,style:{},dataset:{},inert:false,
   classList:{toggle(){},remove(){}},setAttribute(){},addEventListener(type:string,fn:()=>void){const key=`${id}:${type}`;listeners.set(key,[...(listeners.get(key)??[]),fn]);},
   append(){},replaceChildren(){},insertAdjacentHTML(){},querySelectorAll(){return [];},
  });
  return elements.get(id);
 }
 const pending:((value:unknown)=>void)[]=[], material:unknown[][]=[];
 const context=createContext({...model,structuredClone,console,innerHeight:1000,
  document:{getElementById:element,querySelector:element,querySelectorAll:()=>[],createElement:element},
  window:{addEventListener(){},cardMaterialStudy:{
   setBend(value:number){material.push(['bend',value]);},
   setGloss(value:number){material.push(['gloss',value]);},
   showSide(value:string){material.push(['side',value]);},
  }},
  ResizeObserver:class {observe(){}},cancelAnimationFrame(){},
  fetch:()=>new Promise(resolve=>pending.push(resolve)),
 });
 const source=await readFile(new URL('../src/lab-ui.ts',import.meta.url),'utf8');
 runInContext(stripTypeScriptTypes(source).replace(/^import[^\n]+\n/gm,''),context);
 const reply=(plan:model.PlacementPlan,revision='test')=>{
  const next=pending.shift();assert.ok(next);next({ok:true,json:async()=>({plan:structuredClone(plan),revision})});
 };
 assert.equal(element('.workspace').inert,true);
 reply(model.defaultPlan());await new Promise(setImmediate);
 assert.equal(element('.workspace').inert,false);
 return {context,element,reply,material,fire:(id:string,type:string)=>listeners.get(`${id}:${type}`)?.forEach(fn=>fn())};
}

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
