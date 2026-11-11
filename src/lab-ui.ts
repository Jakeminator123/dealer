import { VIEWS, TARGETS, defaultPlan, validatePlan, quad, flatQuad, snapPoint, motionNodes, constrain, fromPixels, toPixels, otherHand, otherSide, sequence, angleToward } from './placement-model.js';
import type { PlacementPlan, View, Geometry, Intent, Hand, Side } from './placement-model.js';
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const input=(id:string)=>$<HTMLInputElement>(id);
let plan:PlacementPlan, revision='', savedSignature='', view:View='native', selected='P4.C2', dirty=false, busy=false, materialReady=false, reloadArmed=false;
let history:PlacementPlan[]=[];
let loadGeneration=0, editGeneration=0;
let zoom=1;
let motionFrame=0, motionStart=0;
const displayedQuad=(id:string)=>input('flat-plane').checked?flatQuad(plan.targets[id].geometry[view],plan.targets['P4.C1'].geometry[view],view,Number(input('plane-heading').value)):quad(plan.targets[id].geometry[view],view);
function stopMotion(){cancelAnimationFrame(motionFrame);motionFrame=0;$('motion-overlay').replaceChildren();$('play-path').textContent='Spela kortbana';document.querySelectorAll('.map-node').forEach(n=>n.classList.remove('playing'));}
const baseline=defaultPlan();
const stageWrap=document.querySelector('.stage-wrap') as HTMLElement;
function sizeStage(){const p=VIEWS[view],ratio=p.width/p.height,w=Math.min(stageWrap.clientWidth-2,Math.max(240,innerHeight-270)*ratio)*zoom;$('stage').style.width=`${w}px`;$('stage').style.height=`${w/ratio}px`;}
function setZoom(value:number){zoom=Math.max(.5,Math.min(3,value));sizeStage();$('zoom-reset').textContent=`${Math.round(zoom*100)} %`;paint(false);}
function message(text:string){$('message').textContent=text;$('message').hidden=false;}
function checkpoint(){history.push(structuredClone(plan));if(history.length>30)history.shift();}
function changed(){editGeneration++;dirty=JSON.stringify(plan)!==savedSignature;reloadArmed=false;$('message').hidden=true;paint(false);}
const target=()=>plan.targets[selected==='shoe'?'P4.C2':selected];
const geometry=()=>target().geometry[view];
function setPanel(name:string){if(selected==='shoe'&&name!=='placement')return;document.querySelectorAll<HTMLButtonElement>('[data-panel]').forEach(b=>{const on=b.dataset.panel===name;b.setAttribute('aria-pressed',String(on));$(`panel-${b.dataset.panel}`).hidden=!on;});if(name==='material')void material();}
async function material(){
 try{if(!materialReady){await import('../materials/source/src/card-material-study.js');materialReady=true;}syncMaterial();}catch{$('cm-status').textContent='3D-materialet kunde inte öppnas. Placeringarna kan fortfarande redigeras.';}
}
function syncMaterial(){const c=window.cardMaterialStudy;if(!c)return;const t=target();c.setBend(t.material.bend);c.setGloss(t.material.gloss);c.showSide(t.intent.endSide==='FRONT'?'front':'back');}
function choose(id:string){stopMotion();selected=id;if(id==='shoe')setPanel('placement');paint();syncMaterial();}
function paint(fields=true){
 (document.querySelector('.workspace') as HTMLElement).inert=busy;
 if(!plan)return;const p=VIEWS[view],isShoe=selected==='shoe',g=geometry(),t=target(),point=isShoe?plan.shoe[view]:g,px=toPixels(point,view);
 const projection=plan.tableProjection??{mode:'flat',heading:0};
 input('flat-plane').checked=projection.mode==='flat';input('plane-heading').value=String(projection.heading);
 $('stage').classList.toggle('portrait',view==='portrait');$<HTMLImageElement>('stage-image').src=p.background;
 $('stage').classList.toggle('solid-cards',input('solid-cards').checked);sizeStage();
 $('board').setAttribute('viewBox',`0 0 ${p.width} ${p.height}`);$('view-size').textContent=`${p.width} × ${p.height} · ${p.profileId}`;
 for(const v of ['native','portrait'])$(`view-${v}`).setAttribute('aria-pressed',String(view===v));
 $('selected-label').textContent=isShoe?'SKO':selected;$('coordinate-readout').textContent=`${Math.round(px.x)}, ${Math.round(px.y)} px · ${view==='native'?'dator':'mobil'}`;
 $('inspector-title').textContent=isShoe?'Skons uttag':`${selected[0]==='D'?'Dealer':`Spelare ${selected[1]}`} · kort ${selected.at(-1)}`;
 $('placement-status').textContent=!isShoe&&g.reviewed?'KONTROLLERAD':'UTKAST';
 $('review-count').textContent=`${TARGETS.filter(id=>plan.targets[id].geometry[view].reviewed).length} av 16 kontrollerade`;
 $('save-state').textContent=busy?'Arbetar…':dirty?'Osparade ändringar':plan.updatedAt?'Sparat lokalt':'Startförslag · osparat';
 $<HTMLButtonElement>('reload').disabled=busy;
 $<HTMLButtonElement>('save').disabled=busy||!dirty;$<HTMLButtonElement>('undo').disabled=!history.length||busy;
 $('select-shoe').setAttribute('aria-pressed',String(isShoe));$('card-geometry').hidden=isShoe;
 document.querySelectorAll<HTMLButtonElement>('[data-panel]').forEach(b=>b.disabled=isShoe&&b.dataset.panel!=='placement');
 document.querySelectorAll<HTMLButtonElement>('[data-slot]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.slot===selected)));
 const unit=p.width/Math.max(1,$('stage').clientWidth),all=input('show-all').checked;
 $('grid').hidden=!input('show-grid').checked;
 const visible=TARGETS.filter(id=>all||id===selected);
 $('contours').innerHTML=visible.map(id=>{
  const tr=plan.targets[id],q=displayedQuad(id),c=toPixels(tr.geometry[view],view),active=selected===id,color=tr.intent.endSide==='BACK'?'#ffff00':'#0000ff';
  const top={x:(q[0].x+q[1].x)/2,y:(q[0].y+q[1].y)/2},d=Math.hypot(top.x-c.x,top.y-c.y),handle={x:top.x+(top.x-c.x)/d*24*unit,y:top.y+(top.y-c.y)/d*24*unit};
  const rotate=active&&!input('flat-plane').checked?`<line class="rotation-stem" x1="${top.x}" y1="${top.y}" x2="${handle.x}" y2="${handle.y}"/><circle class="rotation-handle" data-target="${id}" data-rotate="${id}" cx="${handle.x}" cy="${handle.y}" r="${7*unit}" role="button" tabindex="0" aria-label="Rotera ${id}"/>`:'';
  return `<g class="card-shape ${active?'selected':''}" data-target="${id}" style="--card-color:${color}" role="button" tabindex="0" aria-label="Flytta ${id}"><title>${id} · ${tr.intent.endSide==='BACK'?'stängt':'öppet'}</title><polygon points="${q.map(v=>`${v.x},${v.y}`).join(' ')}"/>${active?q.map(v=>`<circle class="handle" cx="${v.x}" cy="${v.y}" r="${2.8*unit}"/>`).join(''):''}${active||id.endsWith('1')?`<text style="font-size:${12*unit}px" x="${c.x}" y="${Math.max(...q.map(v=>v.y))+18*unit}" text-anchor="middle">${active?id:id.split('.')[0]}</text>`:''}</g>${rotate}`;
 }).join('');
 const s=toPixels(plan.shoe[view],view),r=6*unit;
 $('contours').insertAdjacentHTML('beforeend',`<g data-target="shoe" class="card-shape ${isShoe?'selected':''}" role="button" tabindex="0" aria-label="Flytta skons uttag" style="--card-color:#dfb9ed"><polygon points="${s.x},${s.y-r} ${s.x+r},${s.y} ${s.x},${s.y+r} ${s.x-r},${s.y}"/><text style="font-size:${10*unit}px" x="${s.x}" y="${s.y-r-6*unit}" text-anchor="middle">SKO</text></g>`);
 $('sequence').textContent=isShoe?'TAKE · gemensam startpunkt i den valda vyn':sequence(selected,t.intent);
 $('node-map').innerHTML=motionNodes(isShoe?'P4.C2':selected,t.intent).map((n,i)=>`${i?'<span class="map-arrow">→</span>':''}<div class="map-node" data-node="${n.id}"><b>${n.label}</b><span>${n.detail}</span></div>`).join('');
 $('plane-note').textContent=input('flat-plane').checked?'Plant bord från P4. Bildcentrum bevaras. Läge och riktning sparas med placeringarna. Kameran är inte kalibrerad.':'Varje kort använder sin egen sparade rotation och perspektivbredd.';
 $('plane-controls').hidden=!input('flat-plane').checked;$('mobile-note').hidden=view!=='portrait';
 for(const id of ['angle','angle-number','angle-zero','angle-quarter','angle-centre','straighten','width','height','taper','shape-rectangle'])($<HTMLInputElement|HTMLButtonElement>(id)).disabled=input('flat-plane').checked;
 if(fields){input('coord-u').value=(point.u*100).toFixed(2);input('coord-v').value=(point.v*100).toFixed(2);input('width').value=(g.width*100).toFixed(2);input('height').value=(g.height*100).toFixed(2);input('angle').value=String(g.angle);input('angle-number').value=String(Math.round(g.angle*10)/10);input('taper').value=String(g.taper);input('reviewed').checked=g.reviewed;
  $<HTMLSelectElement>('take-hand').value=t.intent.takeHand;$<HTMLSelectElement>('start-side').value=t.intent.startSide;$<HTMLSelectElement>('end-side').value=t.intent.endSide;input('pass').checked=t.intent.pass;input('turn').checked=t.intent.turn;
 }
 $('angle-value').textContent=`${Math.round(g.angle)}°`;$('taper-value').textContent=`${Math.round(g.taper*100)} %`;
 $('side-back').setAttribute('aria-pressed',String(t.intent.endSide==='BACK'));$('side-front').setAttribute('aria-pressed',String(t.intent.endSide==='FRONT'));
 const sideLabel=(side:string)=>side==='BACK'?'gul / stängt':'blå / öppet';
 $('side-guide').textContent=`Start i skon: ${sideLabel(t.intent.startSide)} → landning här: ${sideLabel(t.intent.endSide)}. Färgen på bordet visar slutsidan. Befintliga filmer ändras inte av detta val.`;
 const h=t.intent.pass?otherHand(t.intent.takeHand):t.intent.takeHand;$('release-hand').textContent=h==='LH'?'Vänster · LH':'Höger · RH';
}
async function load(){
 const generation=++loadGeneration, edits=editGeneration;
 busy=true;stopMotion();drag=null;paint(false);
 try{
  const res=await fetch('/api/placements');if(!res.ok)throw Error('Placeringarna kunde inte läsas.');
  const data=await res.json();validatePlan(data.plan);
  if(generation!==loadGeneration)return;
  if(edits!==editGeneration)throw Error('Utkastet ändrades under inläsningen och har behållits. Läs in igen för att ersätta det.');
  plan=data.plan;savedSignature=JSON.stringify(plan);revision=data.revision;
  if(!plan.tableProjection)plan.tableProjection={mode:'flat',heading:0};
  dirty=JSON.stringify(plan)!==savedSignature;history=[];syncMaterial();
 }finally{if(generation===loadGeneration){busy=false;paint();}}
}
function editGeometry(key:keyof Geometry,value:number|boolean){checkpoint();if(selected==='shoe'){if(key==='u'||key==='v')plan.shoe[view][key]=Math.max(0,Math.min(1,value as number));}else{const g={...geometry(),[key]:value,reviewed:key==='reviewed'?value:false} as Geometry;target().geometry[view]=constrain(g,view);}changed();paint();}
for(const seat of [...Array.from({length:7},(_,i)=>`P${i+1}`),'D']){
 const row=document.createElement('div');row.className='slot-row';row.innerHTML=`<span class="seat"><b>${seat==='D'?'♦':seat[1]}</b>${seat==='D'?'Dealer':`Spelare ${seat[1]}`}</span>`;
 for(const n of [1,2]){const b=document.createElement('button');b.textContent=String(n);b.dataset.slot=`${seat}.C${n}`;b.setAttribute('aria-label',`${seat} kort ${n}`);b.addEventListener('click',()=>choose(b.dataset.slot!));row.append(b);}$('slot-list').append(row);
}
for(const v of ['native','portrait'] as View[])$(`view-${v}`).addEventListener('click',()=>{stopMotion();view=v;paint();});
document.querySelectorAll<HTMLButtonElement>('[data-panel]').forEach(b=>b.addEventListener('click',()=>setPanel(b.dataset.panel!)));
$('select-shoe').addEventListener('click',()=>choose('shoe'));
for(const id of ['show-all','show-grid','solid-cards'])$(id).addEventListener('change',()=>{stopMotion();paint(false);});
for(const id of ['flat-plane','plane-heading'])$(id).addEventListener('change',()=>{
 if(busy)return;stopMotion();checkpoint();
 plan.tableProjection={mode:input('flat-plane').checked?'flat':'individual',heading:Number(input('plane-heading').value)};
 for(const tr of Object.values(plan.targets))for(const v of ['native','portrait'] as View[])tr.geometry[v].reviewed=false;
 changed();
});
for(const [id,key,min,max,factor] of [['coord-u','u',0,100,100],['coord-v','v',0,100,100],['width','width',.5,25,100],['height','height',.5,25,100],['angle','angle',-180,180,1],['angle-number','angle',-180,180,1],['taper','taper',.4,1.6,1]] as const){
 let edited=false;
 const commitValue=()=>{edited=false;const value=input(id).valueAsNumber;if(!Number.isFinite(value)||value<min||value>max){message(`Välj ett värde mellan ${min} och ${max}.`);paint();return;}const current=selected==='shoe'&&(key==='u'||key==='v')?plan.shoe[view][key]:geometry()[key];if(value/factor!==current)editGeometry(key,value/factor);};
 input(id).addEventListener(id==='angle'||id==='taper'?'input':'change',commitValue);
 if(id!=='angle'&&id!=='taper'){input(id).addEventListener('input',()=>{edited=true;});input(id).addEventListener('blur',()=>{if(edited)commitValue();});}
}
$('angle-zero').addEventListener('click',()=>editGeometry('angle',0));
$('angle-quarter').addEventListener('click',()=>editGeometry('angle',((geometry().angle+630)%360)-180));
$('angle-centre').addEventListener('click',()=>{const a=plan.targets['D.C1'].geometry[view],b=plan.targets['D.C2'].geometry[view];editGeometry('angle',angleToward(geometry(),{u:(a.u+b.u)/2,v:(a.v+b.v)/2},view));});
$('shape-rectangle').addEventListener('click',()=>editGeometry('taper',1));
$('zoom-in').addEventListener('click',()=>setZoom(zoom+.25));$('zoom-out').addEventListener('click',()=>setZoom(zoom-.25));$('zoom-reset').addEventListener('click',()=>setZoom(1));
stageWrap.addEventListener('wheel',e=>{if(e.ctrlKey){e.preventDefault();setZoom(zoom+(e.deltaY<0?.1:-.1));}},{passive:false});
input('reviewed').addEventListener('change',()=>editGeometry('reviewed',input('reviewed').checked));
function editIntent(key:keyof Intent,value:string|boolean){checkpoint();const i=target().intent;(i as unknown as Record<string,unknown>)[key]=value;
 if(key==='turn')i.endSide=i.turn?otherSide(i.startSide):i.startSide;else if(key==='startSide'||key==='endSide')i.turn=i.startSide!==i.endSide;changed();paint();syncMaterial();}
$('take-hand').addEventListener('change',()=>editIntent('takeHand',$<HTMLSelectElement>('take-hand').value as Hand));
$('start-side').addEventListener('change',()=>editIntent('startSide',$<HTMLSelectElement>('start-side').value as Side));
$('end-side').addEventListener('change',()=>editIntent('endSide',$<HTMLSelectElement>('end-side').value as Side));
for(const id of ['pass','turn'])input(id).addEventListener('change',()=>editIntent(id as 'pass'|'turn',input(id).checked));
$('side-back').addEventListener('click',()=>editIntent('endSide','BACK'));$('side-front').addEventListener('click',()=>editIntent('endSide','FRONT'));
for(const [id,key] of [['cm-bend','bend'],['cm-gloss','gloss']] as const)input(id).addEventListener('input',()=>{checkpoint();target().material[key]=input(id).valueAsNumber;changed();});
$('undo').addEventListener('click',()=>{if(history.length){plan=history.pop()!;changed();paint();syncMaterial();}});
$('reset-selected').addEventListener('click',()=>{checkpoint();if(selected==='shoe')plan.shoe[view]=structuredClone(baseline.shoe[view]);else target().geometry[view]=structuredClone(baseline.targets[selected].geometry[view]);changed();paint();});
$('save').addEventListener('click',async()=>{if(busy)return;try{validatePlan(plan);busy=true;paint(false);const res=await fetch('/api/placements',{method:'PUT',headers:{'content-type':'application/json','if-match':revision},body:JSON.stringify(plan)});const data=await res.json();if(!res.ok){if(res.status===409)$('reload').hidden=false;throw Error(data.error||'Det gick inte att spara.');}plan=data.plan;savedSignature=JSON.stringify(plan);revision=data.revision;dirty=false;history=[];$('message').hidden=true;}catch(e){message((e as Error).message);}finally{busy=false;paint();}});
$('reload').addEventListener('click',async()=>{if(busy)return;if(dirty&&!reloadArmed){message('Exportera först om du vill behålla ditt utkast. Tryck Läs in igen för att ersätta det.');reloadArmed=true;return;}try{await load();reloadArmed=false;$('reload').hidden=true;$('message').hidden=true;}catch(e){message((e as Error).message);}});
$('export').addEventListener('click',()=>{const blob=new Blob([JSON.stringify(plan,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='pamela-placeringar.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
$('import-plan').addEventListener('click',()=>input('import-file').click());
input('import-file').addEventListener('change',async()=>{try{const file=input('import-file').files?.[0];if(!file)return;if(file.size>65536)throw Error('Placeringsfilen är för stor.');const imported=JSON.parse(await file.text());validatePlan(imported);stopMotion();checkpoint();plan=imported;changed();paint();message('Utkastet är inläst. Det ersätter inget på disk förrän du sparar.');}catch(e){message((e as Error).message);}finally{input('import-file').value='';}});
$('export-plane').addEventListener('click',()=>{const data={schemaVersion:1,kind:'flat-plane-comparison',view,reference:'P4.C1',referenceGeometry:plan.targets['P4.C1'].geometry[view],heading:Number(input('plane-heading').value),calibrated:false,targets:Object.fromEntries(TARGETS.map(id=>[id,{centre:toPixels(plan.targets[id].geometry[view],view),corners:displayedQuad(id)}]))};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`plant-bord-${view}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
$('straighten').addEventListener('click',()=>{stopMotion();checkpoint();for(const id of TARGETS.filter(id=>id[0]==='P'))plan.targets[id].geometry[view]={...plan.targets[id].geometry[view],angle:0,reviewed:false};changed();paint();});
$('snap-selected').addEventListener('click',()=>{stopMotion();checkpoint();const step=Number(input('snap-step').value);if(selected==='shoe')plan.shoe[view]=snapPoint(plan.shoe[view],view,step);else target().geometry[view]=constrain({...geometry(),...snapPoint(geometry(),view,step),angle:Math.round(geometry().angle/5)*5,reviewed:false},view);changed();paint();});
$('play-path').addEventListener('click',()=>{if(motionFrame){stopMotion();return;}if(selected==='shoe')choose('P7.C1');motionStart=performance.now();$('play-path').textContent='Stoppa prov';motionFrame=requestAnimationFrame(animatePath);});
function animatePath(now:number){
 const t=Math.min(1,(now-motionStart)/6000),tr=target(),start=toPixels(plan.shoe[view],view),end=toPixels(geometry(),view),q=displayedQuad(selected);
 const clamp=(x:number)=>Math.max(0,Math.min(1,x)),ease=(x:number)=>x*x*(3-2*x),travel=ease(clamp((t-.08)/.5)),flip=tr.intent.turn?ease(clamp((t-.19)/.23)):0;
 const c={x:start.x+(end.x-start.x)*travel,y:start.y+(end.y-start.y)*travel-Math.sin(Math.PI*travel)*100};
 const cosine=Math.cos(flip*Math.PI),side=cosine>=0?tr.intent.startSide:tr.intent.endSide,color=side==='BACK'?'#ffff00':'#0000ff';
 const points=t>=.58?q:q.map(p=>({x:c.x+(p.x-end.x)*cosine,y:c.y+p.y-end.y}));
 const returning=ease(clamp((t-.68)/.26)),hand={x:c.x+(start.x-c.x)*returning,y:c.y+(start.y-c.y)*returning};
 const phase=t<.08?'ready':t<.19?'take':t<.42?(tr.intent.turn?'turn':tr.intent.pass?'pass':'take'):t<.58?'land':t<.68?'release':t<.94?'return':'ready';
 const handName=tr.intent.pass&&t>=.18?otherHand(tr.intent.takeHand):tr.intent.takeHand;
 $('motion-overlay').innerHTML=`<path d="M${start.x},${start.y} Q${(start.x+end.x)/2},${Math.min(start.y,end.y)-150} ${end.x},${end.y}" fill="none" stroke="#d3b4ff" stroke-width="3" stroke-dasharray="9 8"/><polygon points="${points.map(p=>`${p.x},${p.y}`).join(' ')}" fill="${color}" stroke="#fff" stroke-width="2"/><circle cx="${hand.x}" cy="${hand.y-30}" r="20" fill="#221330" stroke="#d3b4ff" stroke-width="3"/><text x="${hand.x}" y="${hand.y-24}" text-anchor="middle" font-size="17" fill="white">${handName}</text>`;
 document.querySelectorAll<HTMLElement>('[data-node]').forEach(n=>n.classList.toggle('playing',n.dataset.node===phase));
 if(t<1)motionFrame=requestAnimationFrame(animatePath);else{motionFrame=0;$('play-path').textContent='Spela kortbana';}
}
let drag:{id:string;du:number;dv:number;rotate:boolean}|null=null;
const board=$<SVGSVGElement & HTMLElement>('board');
function pointer(e:PointerEvent){const r=board.getBoundingClientRect(),p=VIEWS[view];return fromPixels((e.clientX-r.left)/r.width*p.width,(e.clientY-r.top)/r.height*p.height,view);}
board.addEventListener('pointerdown',e=>{if(e.button!==0||busy)return;const id=(e.target as Element).closest('[data-target]')?.getAttribute('data-target');if(!id)return;const rotate=!!(e.target as Element).closest('[data-rotate]');e.preventDefault();if(selected!==id)choose(id);checkpoint();const point=id==='shoe'?plan.shoe[view]:geometry(),at=pointer(e);drag={id,du:at.u-point.u,dv:at.v-point.v,rotate};board.setPointerCapture(e.pointerId);});
board.addEventListener('pointermove',e=>{if(!drag)return;const at=pointer(e);if(drag.rotate){let angle=angleToward(geometry(),at,view);if(e.shiftKey)angle=Math.round(angle/15)*15;target().geometry[view]=constrain({...geometry(),angle,reviewed:false},view);}else{const pos={u:Math.max(0,Math.min(1,at.u-drag.du)),v:Math.max(0,Math.min(1,at.v-drag.dv))};if(drag.id==='shoe')plan.shoe[view]=pos;else plan.targets[drag.id].geometry[view]=constrain({...geometry(),...pos,reviewed:false},view);}changed();paint();});
for(const type of ['pointerup','pointercancel'])board.addEventListener(type,()=>{if(drag)board.querySelector<SVGElement>(`[data-${drag.rotate?'rotate':'target'}="${drag.id}"]`)?.focus();drag=null;});
board.addEventListener('keydown',e=>{
 if(busy)return;
 const id=(e.target as Element).closest('[data-target]')?.getAttribute('data-target');if(!id)return;
 if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(id);return;}
 const dirs:Record<string,number[]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};if(!dirs[e.key])return;
 e.preventDefault();selected=id;checkpoint();const rotate=!!(e.target as Element).closest('[data-rotate]');
 if(rotate){const change=(e.shiftKey?15:1)*(e.key==='ArrowLeft'||e.key==='ArrowDown'?-1:1);target().geometry[view]=constrain({...geometry(),angle:((geometry().angle+change+540)%360)-180,reviewed:false},view);}
 else {const p=VIEWS[view],d=dirs[e.key],step=e.shiftKey?10:1,old=id==='shoe'?plan.shoe[view]:geometry(),pos={u:Math.max(0,Math.min(1,old.u+d[0]*step/(p.width-1))),v:Math.max(0,Math.min(1,old.v-d[1]*step/(p.height-1)))};if(id==='shoe')plan.shoe[view]=pos;else target().geometry[view]=constrain({...geometry(),...pos,reviewed:false},view);}
 changed();paint();board.querySelector<SVGElement>(`[data-${rotate?'rotate':'target'}="${id}"]`)?.focus();
});
type Film={id:string;title:string;path:string;kind:string;status:string|null;description?:string;reviewDecision?:string;width:number;height:number;frameCount:number;fps:number;chapters?:{label:string;frame:number}[]};
let films:Film[]=[];
let selectedFilm:Film|null=null,pendingFilmFrame:number|null=null;
const filmPlayer=$<HTMLVideoElement>('film-player');
// Source-frame stepping shared by the film library and the clip bank.
const frameAt=(video:HTMLVideoElement,fps:number,count:number)=>Math.max(0,Math.min(count-1,Math.floor(video.currentTime*fps+1e-4)));
const frameTime=(frame:number,fps:number)=>(frame+.001)/fps;
function filmFrame(){return selectedFilm?frameAt(filmPlayer,selectedFilm.fps,selectedFilm.frameCount):0;}
function filmLink(frame=0){if(!selectedFilm||!window.history)return;const url=new URL(location.href);url.searchParams.set('clip',selectedFilm.id);if(frame)url.searchParams.set('frame',String(frame));else url.searchParams.delete('frame');window.history.replaceState(null,'',url);}
function showFilmFrame(){if(selectedFilm)$('film-frame').textContent=`Ruta ${filmFrame()} / ${selectedFilm.frameCount-1} · ${selectedFilm.fps} fps`;}
function seekFilm(frame:number){if(!selectedFilm||!Number.isSafeInteger(frame))return;filmPlayer.pause();const target=Math.max(0,Math.min(selectedFilm.frameCount-1,frame));if(filmPlayer.readyState<1){pendingFilmFrame=target;return;}filmPlayer.currentTime=frameTime(target,selectedFilm.fps);pendingFilmFrame=null;filmLink(target);showFilmFrame();}
function selectFilm(item:Film,frame=0){
 selectedFilm=item;pendingFilmFrame=Number.isSafeInteger(frame)&&frame>0?Math.min(frame,item.frameCount-1):null;
 filmPlayer.pause();filmPlayer.src=item.path;filmPlayer.load();$('film-title').textContent=item.title;
 filmPlayer.playbackRate=Number($<HTMLSelectElement>('film-speed').value)||1;filmLink(pendingFilmFrame??0);showFilmFrame();
 const decisions:Record<string,string>={PENDING:'VÄNTAR PÅ GRANSKNING',ACCEPTED:'GODKÄND',APPROVED:'GODKÄND',REJECTED:'AVVISAD',SECONDARY:'SEKUNDÄRT ALTERNATIV',UNKNOWN:'STATUS SAKNAS'};
 $('film-status').textContent=item.status==='REFERENCE'?'VALD REFERENS':decisions[item.reviewDecision??'UNKNOWN']??'GRANSKNINGSPROV';
 $('film-info').textContent=`${item.width} × ${item.height} · ${(item.frameCount/item.fps).toFixed(2)} s`;
 $('film-note').textContent=item.description??(item.kind==='diagnostic'?'Diagnostiskt färgprov. Bedöm fysisk vändning i originalet; överlagd färg är inte bevis för kortsidan.':'Komponerad V6-referens. Rummet och bordet är redan inlagda i den här filmen.');
 $('film-chapters').replaceChildren();
 for(const chapter of item.chapters??[]){if(!Number.isSafeInteger(chapter.frame)||chapter.frame<0||chapter.frame>=item.frameCount)continue;const button=document.createElement('button');button.textContent=chapter.label;button.title=`Ruta ${chapter.frame}`;button.addEventListener('click',()=>seekFilm(chapter.frame));$('film-chapters').append(button);}
 document.querySelectorAll<HTMLButtonElement>('[data-film]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.film===item.id)));
}
async function openLibrary(green=false,clipId?:string,frame=0){
 const dialog=$<HTMLDialogElement>('library');dialog.showModal();
 try{
  const res=await fetch('/api/library');if(!res.ok)throw Error();const older:Film[]=(await res.json()).items;
  // What matters now comes first: the clip bank's main takes and accepted variants. The historical films stay, folded away.
  let current:Film[]=[];
  try{clipGraph??=await import('./clip-graph.js');if(!kbGraph)await kbRead();current=kbFilms();}catch{/* no clip bank on the public site */}
  films=[...current,...older];$('film-list').replaceChildren();
  if(!films.length){$('film-list').textContent='Inga filmer finns i det lokala biblioteket ännu.';return;}
  const chosen=(clipId?films.find(f=>f.id===clipId):null)??(green?(films.find(f=>f.id==='pamela-p4-c2-source-turn')??films.find(f=>f.kind==='diagnostic')):null)??films[0];
  let open=!current.length||older.includes(chosen);
  const heading=(text:string)=>{const el=document.createElement('div');el.className='film-group';el.textContent=text;$('film-list').append(el);};
  const choice=(item:Film,old:boolean)=>{
   const button=document.createElement('button');button.dataset.film=item.id;button.className='film-choice';if(old){button.dataset.old='1';button.hidden=!open;}
   const label=document.createElement('strong');label.textContent=item.kind==='reference'?(item.width>item.height?'V6 · dator':'V6 · mobil'):item.title;
   const detail=document.createElement('span');detail.textContent=`${item.width} × ${item.height} · ${(item.frameCount/item.fps).toFixed(1)} s`;
   button.append(label,detail);button.addEventListener('click',()=>selectFilm(item));$('film-list').append(button);
  };
  heading('AKTUELL KLIPPBANK');
  if(!current.length){const none=document.createElement('p');none.className='tiny';none.textContent=clipGraph&&kbGraph?'Inga klara klipp ännu.':'Finns bara lokalt.';$('film-list').append(none);}
  for(const item of current)choice(item,false);
  const toggle=document.createElement('button');toggle.className='film-toggle';
  const label=()=>{toggle.textContent=`${open?'▾':'▸'} Äldre prov och referenser (${older.length})`;toggle.setAttribute('aria-expanded',String(open));};
  toggle.addEventListener('click',()=>{open=!open;label();$('film-list').querySelectorAll<HTMLElement>('[data-old]').forEach(b=>{b.hidden=!open;});});
  label();$('film-list').append(toggle);
  for(const item of older)choice(item,true);
  selectFilm(chosen,frame);
 }catch{$('film-list').textContent='Filmbiblioteket kunde inte läsas.';}
}
$('open-library').addEventListener('click',()=>void openLibrary());$('open-green').addEventListener('click',()=>void openLibrary(true));
$('film-play').addEventListener('click',()=>{if(filmPlayer.paused)void filmPlayer.play().catch(()=>$('film-note').textContent='Uppspelningen kunde inte startas. Prova videons inbyggda spelknapp.');else filmPlayer.pause();});
$('film-prev-frame').addEventListener('click',()=>seekFilm(filmFrame()-1));$('film-next-frame').addEventListener('click',()=>seekFilm(filmFrame()+1));
$('film-speed').addEventListener('change',()=>{const speed=Number($<HTMLSelectElement>('film-speed').value);if([.25,.5,1].includes(speed))filmPlayer.playbackRate=speed;});
filmPlayer.addEventListener('loadedmetadata',()=>{if(pendingFilmFrame!==null)seekFilm(pendingFilmFrame);else showFilmFrame();});
for(const event of ['timeupdate','seeked'])filmPlayer.addEventListener(event,showFilmFrame);
for(const event of ['seeked','pause'])filmPlayer.addEventListener(event,()=>{if(selectedFilm&&filmPlayer.readyState>=1)filmLink(filmFrame());});
for(const event of ['play','pause','ended'])filmPlayer.addEventListener(event,()=>$('film-play').textContent=filmPlayer.paused?'Spela filmen':'Pausa filmen');
filmPlayer.addEventListener('error',()=>$('film-note').textContent='Filen kunde inte spelas. Kontrollera att filmen finns lokalt.');
$('close-library').addEventListener('click',()=>{$<HTMLDialogElement>('library').close();});
$('library').addEventListener('close',()=>{$('library').querySelectorAll('video').forEach(v=>v.pause());});
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
new ResizeObserver(()=>{if(plan)paint(false);}).observe(stageWrap);
window.addEventListener('resize',()=>{if(plan)paint(false);});

// ── Klippbank ───────────────────────────────────────────────────────────────
// Nodträd, kantdetalj och rundbyggare. Läser /api/clip-bank och spelar lokala filmer; grafen räknas
// i src/clip-graph.ts. Skriver aldrig jobb, placeringar eller beställningar.
type ClipGraph=typeof import('./clip-graph.js');
type KbGraph=import('./clip-graph.js').Graph;
type KbEdge=import('./clip-graph.js').Edge;
type KbTake=import('./clip-graph.js').Take;
type KbSegment=import('./clip-graph.js').Segment;
type KbStep=import('./clip-graph.js').Step;
type KbImage=import('./clip-graph.js').ImageRef;
let clipGraph:ClipGraph|null=null,kbGraph:KbGraph|null=null,kbState:'idle'|'loading'|'ready'|'local'|'error'='idle',kbLinked=false;
let tab:'placement'|'clipbank'='placement',kbPanel:'edge'|'round'='edge',kbEdge='READY>P4.C1',kbNode='P4.C1',kbTake='',kbPendingFrame:number|null=null,kbDraftFor='';
let kbSteps:KbStep[]=[],kbSegments:KbSegment[]=[],kbCustom=false,kbDealer=true,kbSeatsChosen=false;
// One film per seat (the default, Jakob's decision 2026-11-11) or one film per card; lab.html?…&filmer=kort keeps the second.
let kbMode:'SEAT'|'CARD'=new URLSearchParams(location.search).get('filmer')==='kort'?'CARD':'SEAT';
const kbBuildOptions=()=>({mode:kbMode,holeCardDown:input('kb-hole').checked});
function kbRebuild(){if(clipGraph&&kbText){kbGraph=clipGraph.buildGraph(JSON.parse(kbText),kbBuildOptions());kbKeepSelection();}}
function kbSetMode(mode:'SEAT'|'CARD'){if(mode===kbMode||kbState!=='ready')return;kbMode=mode;kbRebuild();kbStopChain();if(!kbCustom)kbSteps=clipGraph!.roundSequence(kbRoundOptions());paintBank();kbLink();}
// Card centres from the placement plan in the film's pixels (the plan's native view is two pixels narrower than the film).
const kbPlaces=()=>plan?Object.fromEntries(TARGETS.map(id=>{const p=toPixels(plan.targets[id].geometry.native,'native');return [id,{x:p.x*1763/1761,y:p.y}];})):null;
// How far a seat's second card lies from its first, in native pixels. The still-image trial on P4 held up to about 45–50.
const KB_REACH=50;
const kbReach=(second:string)=>{const a=plan?.targets[`${second.split('.')[0]}.C1`],b=plan?.targets[second];if(!a||!b)return null;const p=toPixels(a.geometry.native,'native'),q=toPixels(b.geometry.native,'native');return Math.round(Math.hypot(q.x-p.x,q.y-p.y));};
const kbFilm=(e:KbEdge)=>e.shares?kbGraph!.edge[e.shares]:e; // the edge whose film an edge plays
const kbSeats=new Set<string>();
const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>`&#${c.charCodeAt(0)};`);
// A status is never colour alone: every state has its own glyph, line style and label.
const KB_GLYPH:Record<string,string>={MISSING:'○',PREPARED:'◔',ORDERED:'◑',UNREVIEWED:'●',ACCEPTED:'✓',VARIANT:'◆',REJECTED:'✕'};
const KB_PLURAL:Record<string,string>={ACCEPTED:'godkända',UNREVIEWED:'klara, ogranskade',VARIANT:'bara variant',ORDERED:'renderas',PREPARED:'förberedda',REJECTED:'underkända',MISSING:'saknas'};
const kbChip=(status:string,text:string)=>`<span class="kb-chip s-${status}"><i>${KB_GLYPH[status]}</i>${esc(text)}</span>`;
const kbShort=(id:string,target:string|null)=>id.replace(/^pamela-/,'').replace(target?`${target.toLowerCase().replace('.','-')}-`:'','');
const kbHub=(e:{target:string|null;from:string})=>e.target??(e.from==='READY'?'READY':'IDLE');
const kbKnown=(id:string)=>!!kbGraph?.edge[id]?.experiment; // an experiment edge may be written into a round by its own name
const kbTakeStatus=(t:KbTake)=>t.variant?'VARIANT':t.decision==='ACCEPTED'?'ACCEPTED':'UNREVIEWED';
// What an edge says about itself wherever it is named: status plus the two kinds of extra takes beside the main one.
const kbEdgeNote=(e:KbEdge)=>`${e.status==='UNREVIEWED'&&e.main?.decision==='SECONDARY'?'klar, sekundär':clipGraph!.STATUS_LABEL[e.status]}${e.hasVariant?' · variant finns':''}${e.hubVariants.length?` · variant-start ${e.hubVariants.join(', ')}`:''}${e.status==='ORDERED'?'':e.rendering?` · ${e.rendering} renderas`:e.main&&e.inProgress?' · ny tagning förberedd':''}`;
const kbEdgeChip=(e:KbEdge)=>{const f=kbFilm(e);return `<button class="kb-edge-chip s-${f.status}" data-edge="${esc(e.id)}" aria-pressed="${e.id===kbEdge}"><i>${KB_GLYPH[f.status]}</i><code>${esc(e.id)}</code><span>${esc(f===e?kbEdgeNote(e):`spelar ${f.id} · ${kbEdgeNote(f)}`)}</span></button>`;};
async function kbCopy(text:string,button:HTMLElement){
 try{await navigator.clipboard.writeText(text);}catch{const area=document.createElement('textarea');area.value=text;document.body.append(area);area.select();document.execCommand('copy');area.remove();}
 const label=button.textContent;button.textContent='Kopierat ✓';setTimeout(()=>{button.textContent=label;},1400);
}
function setTab(name:'placement'|'clipbank'|'proofs'|'review'){
 tab=name;stopMotion();
 (document.querySelector('.workspace') as HTMLElement).hidden=name!=='placement';$('clipbank').hidden=name!=='clipbank';$('proofs').hidden=name!=='proofs';$('review').hidden=name!=='review';
 for(const t of ['placement','clipbank','proofs','review'])$(`tab-${t}`).classList.toggle('active',t===name);
 if(name!=='clipbank')kbStopChain();
 if(name!=='clipbank'&&name!=='review')kbPlayer.pause();
 if(name!=='review'){$('kb-take-home').append(kbTakeBox);rvHtml='';} // the take detail goes back to its place in the Klippbank
 if(name!=='proofs')pfPlayer.pause();
 if(name==='review'){kbPanel='edge';rvEnter=true;void openClipBank();return;}
 if(name==='clipbank'){void openClipBank();return;}
 if(name==='proofs'){void openProofs();return;}
 if(plan)paint(false);kbLink();
}
let kbText='',kbBusy=false;
const kbNews:{id:string;edge:string;failed:boolean}[]=[];
// The take an edge opens on: its main take, else the newest one that still matters, else whatever there is.
const kbFirstTake=(e:KbEdge)=>e.main?.id??[...e.takes].reverse().find(t=>clipGraph!.isCurrent(e,t))?.id??e.takes.at(-1)?.id??'';
function kbKeepSelection(){
 const g=kbGraph!;if(!g.edge[kbEdge]){kbEdge='READY>P4.C1';kbNode='P4.C1';}
 if(g.takes[kbTake]?.edge!==kbEdge)kbTake=kbFirstTake(g.edge[kbEdge]);
}
// Reads the bank from the server. Returns false when nothing has changed since the last read.
async function kbRead(){
 const res=await fetch('/api/clip-bank');if(!res.ok)throw Error();
 const text=await res.text();if(kbGraph&&text===kbText)return false;
 const before=kbGraph,next=clipGraph!.buildGraph(JSON.parse(text),kbBuildOptions());
 // A film that arrives (or fails) while the tab is open is announced; the first read announces nothing.
 if(before)for(const t of Object.values(next.takes)){const failed=t.stage==='FAILED';if((t.stage==='DONE'||failed)&&before.takes[t.id]?.stage!==t.stage&&!kbNews.some(n=>n.id===t.id))kbNews.unshift({id:t.id,edge:t.edge,failed});}
 kbNews.splice(5);kbGraph=next;kbText=text;kbKeepSelection();
 return true;
}
function kbOnline(ok:boolean){$('kb-live').classList.toggle('off',!ok);$('kb-live').textContent=ok?'Uppdateras automatiskt':'Ingen kontakt med labbservern · försöker igen';}
async function openClipBank(){
 if(kbState==='loading')return;
 const reload=kbState==='ready';kbState='loading';if(!reload)paintBank(); // a re-read keeps the current view until the new data is in
 try{clipGraph??=await import('./clip-graph.js');}catch{kbState='local';paintBank();return;}
 try{await kbRead();}catch{kbGraph=null;kbText='';kbState=location.hostname==='127.0.0.1'?'error':'local';paintBank();return;}
 kbState='ready';kbOnline(true);
 if(!kbLinked){kbLinked=true;kbApplyLink();kbRebuild();}
 // Start the round builder on what can be played today: seats whose first card already has a deal.
 if(!kbSeatsChosen){kbSeatsChosen=true;for(const seat of clipGraph.SEATS)if(kbGraph!.edge[`READY>${seat}.C1`].main)kbSeats.add(seat);if(!kbSeats.size)for(const seat of clipGraph.SEATS)kbSeats.add(seat);}
 if(!kbCustom)kbSteps=clipGraph.roundSequence(kbRoundOptions());
 paintBank();kbLink();
}
// While the tab is visible the bank is re-read every few seconds. Selection, open panels and playing
// films are left alone: only what changed in the data is repainted.
async function kbRefresh(){
 if(kbBusy||kbState!=='ready')return;kbBusy=true;
 try{const changed=await kbRead();kbOnline(true);if(changed&&kbState==='ready')paintBank();}
 catch{kbOnline(false);} // keep what is on screen; the next tick tries again
 finally{kbBusy=false;}
}
setInterval(()=>{if((tab!=='clipbank'&&tab!=='review')||document.hidden)return;if(kbState==='ready')void kbRefresh();else if(kbState==='error')void openClipBank();},4000);
// lab.html?tab=klippbank&edge=READY>P4.C1[&take=<jobb-id>&frame=105]
// or &round=<kantlista> (READY>P2.C1|P2.C1>READY, "@<jobb-id>" låser en tagning) or &round=P1,P4[&dealer=0&cards=1&hole=0&third=1]
function kbApplyLink(){
 const G=clipGraph!,p=new URLSearchParams(location.search),raw=(p.get('edge')??'').trim(),frame=Number(p.get('frame'));
 // A model edge in any spelling (a READY variant opens its model edge), or an experiment exactly as its job wrote it.
 const e=kbGraph!.edge[G.parseEdge(raw)?.base??raw];
 if(e){kbEdge=e.id;if(!e.experiment)kbNode=kbHub(e);kbTake=p.get('take')??'';kbPendingFrame=Number.isSafeInteger(frame)&&frame>0?frame:null;}
 const round=p.get('round'),list=round?.includes('>')?round:p.get('seq'); // a round is either seats or an explicit list of edges
 if(round===null&&list===null)return;
 kbPanel='round';
 if(round!==null&&round!==list){kbSeatsChosen=true;for(const seat of round.toUpperCase().split(','))if(G.SEATS.includes(seat.trim()))kbSeats.add(seat.trim());}
 kbDealer=p.get('dealer')!=='0';input('kb-hole').checked=p.get('hole')!=='0';input('kb-third').checked=p.get('third')==='1';$<HTMLSelectElement>('kb-cards').value=p.get('cards')==='1'?'1':'2';
 const parsed=list?G.parseSequence(list,kbKnown):null;if(parsed?.steps.length){kbSteps=parsed.steps;kbCustom=true;}
}
function kbLink(){
 if(!window.history)return;const url=new URL(location.href);
 for(const key of ['tab','edge','take','round','dealer','cards','hole','third','seq','proof','file','filmer'])url.searchParams.delete(key);
 if(tab==='proofs'){url.searchParams.set('tab','prov');if(pfId)url.searchParams.set('proof',pfId);if(pfFile)url.searchParams.set('file',pfFile);}
 if(tab==='review'){url.searchParams.set('tab','granska');if(kbTake)url.searchParams.set('take',kbTake);}
 if(tab==='clipbank'){
  url.searchParams.set('tab','klippbank');if(kbMode==='CARD')url.searchParams.set('filmer','kort');
  if(kbPanel==='edge'){url.searchParams.set('edge',kbEdge);if(kbTake&&kbTake!==kbGraph?.edge[kbEdge]?.main?.id)url.searchParams.set('take',kbTake);}
  else{
   if(kbCustom&&clipGraph)url.searchParams.set('round',clipGraph.formatSequence(kbSteps).replaceAll(' ',''));
   else{url.searchParams.set('round',[...kbSeats].sort().join(','));if(!kbDealer)url.searchParams.set('dealer','0');if($<HTMLSelectElement>('kb-cards').value==='1')url.searchParams.set('cards','1');if(input('kb-third').checked)url.searchParams.set('third','1');}
   if(!input('kb-hole').checked)url.searchParams.set('hole','0');
  }
 }
 window.history.replaceState(null,'',url);
}
const kbRoundOptions=()=>({seats:[...kbSeats],dealer:kbDealer,cards:Number($<HTMLSelectElement>('kb-cards').value)||2,thirdDealerCard:input('kb-third').checked});
function kbResolve(){kbSegments=clipGraph&&kbGraph?clipGraph.resolveRound(kbGraph,kbSteps,{holeCardDown:input('kb-hole').checked,places:kbPlaces()}):[];}
function paintBank(){
 const ready=kbState==='ready'&&!!kbGraph&&!!clipGraph;
 $('clipbank').classList.toggle('kb-off',!ready);$('kb-notice').hidden=ready;
 $('kb-notice').textContent=kbState==='local'?'Klippbanken finns bara lokalt. Öppna det lokala labbet (START.cmd) för nodträd, tagningar och rundbyggare.':kbState==='error'?'Klippbanken kunde inte läsas. Starta om den lokala förhandsvisningen (STOPP.cmd och sedan START.cmd) och öppna fliken igen.':'Läser klippbanken…';
 if(!ready){$('kb-count').textContent=kbState==='local'?'Finns bara lokalt':kbState==='error'?'Kunde inte läsas':'Läser klippbanken…';$('kb-count-detail').textContent='';paintReview();return;}
 $('kb-notices').innerHTML=kbNews.map(n=>`<span class="kb-news${n.failed?' failed':''}"><button data-news="${esc(n.id)}" title="Visa tagningen">${n.failed?'Misslyckades':'Ny film klar'}: <code>${esc(n.edge)}</code></button><button data-news-close="${esc(n.id)}" aria-label="Stäng meddelandet">✕</button></span>`).join('');
 kbResolve();paintSummary();paintTree();paintNode();
 document.querySelectorAll<HTMLButtonElement>('[data-kb-panel]').forEach(b=>{const on=b.dataset.kbPanel===kbPanel;b.setAttribute('aria-pressed',String(on));$(`kb-panel-${b.dataset.kbPanel}`).hidden=!on;});
 if(kbPanel==='edge')paintEdge();else paintRound();
 ovSync();paintReview();
}
function paintSummary(){
 const G=clipGraph!,s=kbGraph!.summary,f=s.films,seat=f.mode==='SEAT',shown=G.STATUSES.filter(k=>s.byStatus[k]);
 document.querySelectorAll<HTMLButtonElement>('[data-kb-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.kbMode===f.mode)));
 // Seat mode answers "how much is done": of the films the bank needs, how many exist, and how many of those are candidates or carry known flaws.
 $('kb-mode-note').textContent=seat?`En film per plats: ${f.total} filmer behövs. Platsens andra kort spelar första kortets tre filmer med det renderade kortet flyttat; ${kbGraph!.edge['READY>D.C2'].shares?'dealerns andra kort gör likadant när det ligger öppet':'dealerns andra kort ligger stängt och har egna filmer'}.`:'En film per kort: varje kort har egna filmer, 51 kanter.';
 $('kb-count').textContent=seat?`${f.done} av ${f.total} filmer finns · ${f.total?Math.round(100*f.done/f.total):0} %`:`${s.done} av ${s.total} kanter klara`;
 $('kb-count-detail').textContent=[...(seat?[`kandidater ${f.candidates}`,`kända brister ${f.flaws}`,`saknas ${f.missing}`]:shown.map(k=>`${KB_PLURAL[k]} ${s.byStatus[k]}`)),`D.C3 ${s.optional.done} av ${s.optional.total}`,...(s.experiments.total?[`experiment ${s.experiments.total}`]:[]),...(s.credits.committed===null?[]:[`${s.credits.committed}${s.credits.maximum===null?'':` av ${s.credits.maximum}`} credits beställda`])].join(' · ');
 $('kb-meter').innerHTML=seat?([['s-UNREVIEWED','kandidater',f.candidates],['s-UNREVIEWED flaw','kända brister',f.flaws],['s-MISSING','saknas',f.missing]] as [string,string,number][]).filter(part=>part[2]).map(([cls,label,n])=>`<span class="${cls}" style="flex:${n}" title="${label}: ${n}"></span>`).join('')
  :shown.map(k=>`<span class="s-${k}" style="flex:${s.byStatus[k]}" title="${KB_PLURAL[k]}: ${s.byStatus[k]}"></span>`).join('');
 $('kb-legend').innerHTML=['MISSING','PREPARED','ORDERED','UNREVIEWED','ACCEPTED','REJECTED'].map(k=>`<span class="kb-key"><svg viewBox="0 0 34 12" aria-hidden="true"><g class="kb-edge s-${k}"><line class="ln" x1="2" y1="6" x2="22" y2="6"/><path class="head" d="M32,6 L22,1 L22,11 Z"/>${k==='REJECTED'?'<path class="kb-cross" d="M8,2 l8,8 m0,-8 l-8,8"/>':k==='ORDERED'?'<circle class="kb-render" cx="12" cy="6" r="3.5"/>':''}</g></svg>${G.STATUS_LABEL[k as keyof typeof G.STATUS_LABEL]}</span>`).join('')
  +'<span class="kb-key"><svg viewBox="0 0 12 12" aria-hidden="true"><rect class="kb-variant" x="2.5" y="2.5" width="7" height="7" transform="rotate(45 6 6)"/></svg>variant finns</span><span class="kb-key"><svg viewBox="0 0 12 12" aria-hidden="true"><rect class="kb-start" x="2.5" y="2.5" width="7" height="7" transform="rotate(45 6 6)"/></svg>variant-start finns</span><span class="kb-key"><i class="swatch blue"></i>öppet kort</span><span class="kb-key"><i class="swatch yellow"></i>stängt kort</span>';
}
// Schematic table. READY feeds one rail (deal down, return up); IDLE has its own rail, so no lines cross.
function paintTree(){
 if(!clipGraph||!kbGraph)return;
 const G=clipGraph,g=kbGraph,T=G.TREE,w=T.nodeWidth/2,h=T.nodeHeight/2,cards=[...G.TARGETS,...G.OPTIONAL_TARGETS],inRound=kbPanel==='round',round=new Set(inRound?kbSegments.map(s=>s.film?.id??s.edge?.id??s.id):[]),chosen=g.edge[kbEdge]?.shares??kbEdge;
 const at=G.tableLayout(plan?Object.fromEntries(TARGETS.map(id=>[id,toPixels(plan.targets[id].geometry.native,'native')])):null);
 const live=(e:KbEdge)=>e.takes.filter(t=>G.isCurrent(e,t)).length; // replaced and rejected takes stay out of the picture
 const tip=(e:KbEdge)=>`${e.id} · ${kbEdgeNote(e)}${live(e)>1?` · ${live(e)} aktuella tagningar`:''}${e.takes.length>live(e)?` · ${e.takes.length-live(e)} ersatta eller underkända`:''}`;
 const group=(id:string,inner:string)=>{const e=g.edge[id];return `<g class="kb-edge s-${e.status}${id===chosen&&!inRound?' sel':''}${round.has(id)?' in-round':''}" data-edge="${esc(id)}" role="button" tabindex="0" aria-label="${esc(tip(e))}"><title>${esc(tip(e))}</title>${inner}</g>`;};
 const head=(x:number,y:number,angle:number)=>`<path class="head" d="M0,0 L-10,-5.5 L-10,5.5 Z" transform="translate(${x} ${y}) rotate(${angle})"/>`;
 const marks=(e:KbEdge,x:number,y:number)=>(e.hasVariant||e.status==='VARIANT'?`<rect class="kb-variant" x="${x-4.5}" y="${y-4.5}" width="9" height="9" transform="rotate(45 ${x} ${y})"/>`:'')+(e.status==='REJECTED'?`<path class="kb-cross" d="M${x-4},${y-4} l8,8 m0,-8 l-8,8"/>`:'');
 // A hollow diamond near the READY end: a take exists that starts from (or returns to) another READY pose.
 // With several takes the edge stays one line: a small number beside it says how many, a pulsing dot that one is rendering.
 const line=(id:string,x1:number,y1:number,x2:number,y2:number,label='',side=0)=>{const e=g.edge[id],d=Math.hypot(x2-x1,y2-y1),ex=x2-(x2-x1)/d*7,ey=y2-(y2-y1)/d*7,k=e.from==='READY'?.26:.74,sx=x1+(x2-x1)*k,sy=y1+(y2-y1)*k,mx=(x1+x2)/2,my=(y1+y2)/2;
  return group(id,`<line class="hit" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><line class="ln" x1="${x1}" y1="${y1}" x2="${ex}" y2="${ey}"/>${head(x2,y2,Math.atan2(y2-y1,x2-x1)*180/Math.PI)}${marks(e,mx,my)}${e.hubVariants.length?`<rect class="kb-start" x="${sx-4.5}" y="${sy-4.5}" width="9" height="9" transform="rotate(45 ${sx} ${sy})"/>`:''}${e.rendering?`<circle class="kb-render" cx="${x1+(x2-x1)*(1-k)}" cy="${y1+(y2-y1)*(1-k)}" r="4.5"/>`:''}${side&&live(e)>1?`<text class="kb-count-n" x="${mx+side*9}" y="${my+3.5}" text-anchor="${side<0?'end':'start'}">${live(e)}</text>`:''}${label}`);};
 const text=(id:string,x:number,y:number,anchor='middle')=>`<text class="kb-edge-label" x="${x}" y="${y}" text-anchor="${anchor}">${esc(id)}</text>`;
 const stubs=(id:string,p=at[id])=>{const dir=id[0]==='D'?-1:1,near=p.y-dir*h,far=p.y+dir*h,rail=dir<0?T.idleRail:T.idleBus;
  return line(`READY>${id}`,p.x-9,T.readyBus+dir*3,p.x-9,near-dir,'',-1)+line(`${id}>READY`,p.x+9,near-dir,p.x+9,T.readyBus+dir*4,'',1)+line(`${id}>IDLE`,p.x,far+dir,p.x,rail-dir*3,'',1);};
 const node=(id:string)=>{const p=at[id],done=g.edges.filter(e=>e.target===id&&e.main).length,side=plan?.targets[id]?.intent.endSide??G.wantedSide(id);
  return `<g class="kb-node${id===kbNode&&!inRound?' sel':''}${done===3?' full':done?' part':''}${G.OPTIONAL_TARGETS.includes(id)?' optional':''}" data-node="${id}" role="button" tabindex="0" aria-label="${id}, ${done} av 3 kanter klara"><title>${id} · ${esc(G.describeNode(id))} · ${done} av 3 kanter klara</title><rect x="${p.x-w}" y="${p.y-h}" width="${w*2}" height="${h*2}" rx="7"/><rect class="side ${side==='BACK'?'back':'front'}" x="${p.x+w-13}" y="${p.y-h+5}" width="8" height="8" rx="2"/><text class="name" x="${p.x}" y="${p.y+3}" text-anchor="middle">${id}</text><text class="count" x="${p.x}" y="${p.y+19}" text-anchor="middle">${done}/3</text></g>`;};
 // Seat mode: a seat whose second card shares the first card's films is one node with both cards and the seat's three edges.
 const pairs=[...G.SEATS,'D'].filter(s=>!!g.edge[`READY>${s}.C2`].shares),solo=cards.filter(id=>!pairs.includes(id.split('.')[0])||G.OPTIONAL_TARGETS.includes(id)),mid=(s:string)=>({x:(at[`${s}.C1`].x+at[`${s}.C2`].x)/2,y:at[`${s}.C1`].y});
 const seatNode=(s:string)=>{const p=mid(s),c1=`${s}.C1`,c2=`${s}.C2`,done=g.edges.filter(e=>e.target===c1&&e.main).length,reach=kbReach(c2),far=reach!==null&&reach>KB_REACH,label=`${s} · ${s==='D'?'Dealer':`Spelare ${s[1]}`} · en film för båda korten · ${done} av 3 filmer finns${reach===null?'':` · kort 2 flyttas ${reach} px${far?` (över ${KB_REACH} px)`:''}`}`;
  return `<g class="kb-node seat${[c1,c2].includes(kbNode)&&!inRound?' sel':''}${done===3?' full':done?' part':''}" data-node="${c1}" role="button" tabindex="0" aria-label="${esc(label)}"><title>${esc(label)}</title><rect x="${p.x-52}" y="${p.y-h}" width="104" height="${h*2}" rx="7"/><text class="name" x="${p.x}" y="${p.y-9}" text-anchor="middle">${s}</text><text class="share${far?' far':''}" x="${p.x}" y="${p.y+6}" text-anchor="middle">C1 · C2 ${reach===null?'delar film':`${far?'⚠ ':''}+${reach} px`}</text><text class="count" x="${p.x}" y="${p.y+21}" text-anchor="middle">${done}/3</text></g>`;};
 const hub=(id:string,sub:string)=>{const p=at[id];return `<g class="kb-hub${id===kbNode&&!inRound?' sel':''}" data-node="${id}" role="button" tabindex="0" aria-label="${id}, ${sub}"><title>${id} · ${esc(G.describeNode(id))}</title><rect x="${p.x-70}" y="${p.y-26}" width="140" height="52" rx="10"/><text class="name" x="${p.x}" y="${p.y}" text-anchor="middle">${id}</text><text class="count" x="${p.x}" y="${p.y+16}" text-anchor="middle">${sub}</text></g>`;};
 const px=G.TARGETS.filter(id=>id[0]==='P').map(id=>at[id].x),dx=cards.filter(id=>id[0]==='D').map(id=>at[id].x);
 $('kb-tree').classList.toggle('round',kbPanel==='round'); // the round's own path stays lit, the rest steps back
 $('kb-tree').innerHTML=`<path class="kb-rail" d="M${T.readyTrunk},96 V${T.readyBus} H${Math.min(...px,...dx)-9}"/><path class="kb-rail idle" d="M${T.idleTrunk},96 V${T.idleBus} H${Math.max(...px)}"/><path class="kb-rail idle" d="M${T.idleTrunk},${T.idleRail} H${Math.max(...dx)}"/>`
  +`<text class="kb-rail-label" x="${T.readyTrunk-14}" y="${T.readyBus-11}" text-anchor="end">READY · HANDEN VID SKON</text><text class="kb-rail-label" x="${T.idleTrunk+14}" y="${T.idleBus+21}">IDLE · VILA</text>`
  +line('IDLE>READY',170,58,830,58,text('IDLE>READY',500,48))+line('READY>IDLE',830,82,170,82,text('READY>IDLE',500,101))
  +group('IDLE>IDLE',`<path class="hit" d="M72,44 C54,2 142,2 122,44"/><path class="ln" d="M72,44 C54,2 140,2 124,38"/>${head(122,44,115)}${marks(g.edge['IDLE>IDLE'],97,13)}${text('IDLE>IDLE',146,24,'start')}`)
  +solo.map(id=>stubs(id)).join('')+pairs.map(s=>stubs(`${s}.C1`,mid(s))).join('')+solo.map(node).join('')+pairs.map(seatNode).join('')+hub('IDLE','vila')+hub('READY','redo vid skon');
}
function paintNode(){
 const G=clipGraph!,g=kbGraph!,atHub=kbNode==='IDLE'||kbNode==='READY',seat=kbNode.split('.')[0],second=`${seat}.C2`,paired=!atHub&&!G.OPTIONAL_TARGETS.includes(kbNode)&&!!g.edge[`READY>${second}`]?.shares,card=paired?`${seat}.C1`:kbNode;
 const ids=atHub?['IDLE>READY','READY>IDLE','IDLE>IDLE']:[`READY>${card}`,`${card}>READY`,`${card}>IDLE`];
 $('kb-node-title').textContent=paired?`${seat} · ${seat==='D'?'Dealer':`Spelare ${seat[1]}`} · en film för båda korten`:`${kbNode} · ${G.describeNode(kbNode)}`;
 // The seat's second card: no film of its own, how far the rendered card is moved, and any film that was made for it anyway.
 const reach=paired?kbReach(second):null,own=paired?g.edges.filter(e=>e.target===second&&e.takes.some(G.playable)):[];
 $('kb-node-share').hidden=!paired;
 if(paired)$('kb-node-share').innerHTML=`<p>Kort 2 (<code>${esc(second)}</code>) har ingen egen film. Det spelar platsens tre filmer, och det renderade kortet flyttas${reach===null?'':` ${reach} px`} till sin plats.${reach!==null&&reach>KB_REACH?` <span class="far">⚠ Över ${KB_REACH} px: stillbildsprovet på P4 höll till ungefär 45–50 px.</span>`:''}</p><button data-play-second="READY" title="Spelar platsens giv och retur med det renderade kortet på kort 2:s plats">▶ Kort 2: giv + retur till READY</button>${own.map(e=>`<button data-edge="${esc(e.id)}" title="Används bara när en runda namnger tagningen">egen film för kort 2 · <code>${esc(e.id)}</code></button>`).join('')}`;
 $('kb-node-edges').innerHTML=ids.map(id=>kbEdgeChip(g.edge[id])).join('');$('kb-node-play').hidden=!!G.hubOf(kbNode);
 // Jobs whose from/to is outside the model are never hidden: they get their own group and the same detail view.
 const chains=G.experimentChains(g);
 $('kb-experiments').hidden=!g.experiments.length&&!chains.length;$('kb-experiment-edges').innerHTML=g.experiments.map(kbEdgeChip).join('');
 $('kb-experiment-more').hidden=!g.experiments.length;$('kb-experiment-count').textContent=`Enskilda experimentkanter (${g.experiments.length})`;if(g.edge[kbEdge]?.experiment)$<HTMLDetailsElement>('kb-experiment-more').open=true;
 // An experiment that leads to a card is a second way to deal it. One row per card: A plays the model's own way, each B one experiment chain.
 const cards=[...new Set(chains.map(c=>c.target))];
 $('kb-experiment-chains').innerHTML=cards.map(card=>`<div class="kb-chain-row"><b>${esc(card??'Övrigt')}</b>${card?`<button class="model" data-chain-model="${esc(card)}" title="Modellens väg till samma kort, att jämföra med">▶ A · <code>READY&#62;${esc(card)}</code></button>`:''}${chains.map((c,i)=>c.target===card?`<button data-chain="${i}" title="${c.steps.length} ${c.steps.length>1?'filmer':'film'} i följd">▶ B · <code>${esc(c.nodes.join(' → '))}</code></button>`:'').join('')}</div>`).join('');
 // Read-only list of what could be archived later: nothing is removed from here.
 const left=G.leftovers(g),size=(bytes:number|null)=>bytes===null?'okänd storlek':`${(bytes/1048576).toFixed(1).replace('.',',')} MB`;
 $('kb-cleanup').hidden=!left.length;$('kb-cleanup-summary').textContent=`Städlista · ${left.length} ${left.length===1?'tagning':'tagningar'} · ${size(left.reduce((sum,l)=>sum+(l.bytes??0),0))}`;
 $('kb-cleanup-rows').innerHTML=left.map(l=>`<tr><td>${esc(l.take.id)}</td><td>${esc(l.edge.id)}</td><td>${l.role==='REJECTED'?'underkänd':l.role==='FAILED'?'misslyckad':l.edge.main?`ersatt av ${esc(kbShort(l.edge.main.id,l.edge.target))}`:'inte vald'}</td><td>${size(l.bytes)}</td></tr>`).join('');
}
// The clip bank as films for the library: per edge its main take, then accepted variants and variant starts.
function kbFilms():Film[]{
 const G=clipGraph!,g=kbGraph!;
 return [...g.edges,...g.experiments].flatMap(e=>e.takes.filter(t=>G.playable(t)&&G.isCurrent(e,t)&&!!t.media.video&&!t.segment).sort((a,b)=>Number(b===e.main)-Number(a===e.main)).map(t=>({id:t.id,title:`${e.id}${t===e.main?'':` · ${G.ROLE_LABEL[G.takeRole(e,t)]}`}`,path:t.media.video!,kind:'clipbank',status:null,
  description:`${e.experiment?'Experiment utanför nodträdet':G.describeEdge(e)} · ${t.id}. Granska tagningen i Klippbanken.`,reviewDecision:t.decision,width:t.motion?.source?.width??t.receipt?.output?.width??1764,height:t.motion?.source?.height??t.receipt?.output?.height??1174,frameCount:t.frames??Math.max(1,Math.round(t.job.duration*(t.fps??30))),fps:t.fps??30})));
}
// Loads a chain into the round builder and plays it at once.
function kbPlaySteps(steps:KbStep[]){kbSteps=steps;kbPanel='round';kbCustom=true;kbPlayer.pause();paintBank();kbLink();void kbPlayStep(0);}
$('kb-experiment-chains').addEventListener('click',event=>{
 const d=(event.target as Element).closest<HTMLElement>('button')?.dataset,chains=clipGraph&&kbGraph?clipGraph.experimentChains(kbGraph):[];if(!d)return;
 if(d.chain!==undefined){if(chains[Number(d.chain)])kbPlaySteps(chains[Number(d.chain)].steps);return;}
 // The same card the model's way: its deal, and its return to IDLE if any experiment chain to that card also goes on to a rest pose.
 const card=d.chainModel;if(!card||!kbGraph!.edge[`READY>${card}`])return;
 kbPlaySteps([{from:'READY',to:card},...(chains.some(c=>c.target===card&&c.nodes.at(-1)!==card)?[{from:card,to:'IDLE'}]:[])]);
});
function kbSelect(edgeId:string,takeId=''){
 const e=kbGraph?.edge[edgeId];if(!e)return;
 kbEdge=edgeId;if(!e.experiment)kbNode=kbHub(e);kbTake=kbGraph!.takes[takeId]?.edge===edgeId?takeId:kbFirstTake(e);kbPendingFrame=null;
 if(kbPanel!=='edge'){kbPanel='edge';kbStopChain();}
 paintBank();kbLink();
}
function paintEdge(){
 const G=clipGraph!,g=kbGraph!,e=g.edge[kbEdge],t=g.takes[kbTake]?.edge===e.id?g.takes[kbTake]:null;
 $('kb-edge-title').textContent=e.id;$('kb-edge-sub').textContent=e.experiment?'Experiment utanför nodträdet. Räknas inte bland de 51 kanterna och ingår inte i rundor.':`${G.describeEdge(e)}.${e.optional?' Valfri kant: det tredje dealerkortet räknas inte in i de 51.':''}`;
 const film=kbFilm(e),shared=film!==e,far=shared?kbReach(e.target!):null;
 $('kb-edge-status').className=`kb-chip s-${film.status}`;$('kb-edge-status').innerHTML=`<i>${KB_GLYPH[film.status]}</i>${esc(shared?`delar film · ${kbEdgeNote(film)}`:kbEdgeNote(e))}`;
 // A shared step says in plain words which film it plays and how far the card is moved.
 $('kb-share').hidden=!shared;
 if(shared)$('kb-share').innerHTML=`<p>En film per plats: det här steget har ingen egen film. Det spelar <code>${esc(film.id)}</code>${film.main?` (tagning <code>${esc(kbShort(film.main.id,film.target))}</code>)`:', som ännu saknar film'}, och det renderade kortet ritas${far===null?' på kortets egen plats':` ${far} px bort, på platsen för ${esc(e.target)}`}. Filmens eget kort täcks.${far!==null&&far>KB_REACH?` <span class="far">⚠ Över ${KB_REACH} px: stillbildsprovet på P4 höll till ungefär 45–50 px.</span>`:''}</p><button data-edge="${esc(film.id)}">Visa platsens film</button><button data-play-shared="1"${film.main?'':' disabled'} title="Spelar steget i rundbyggaren med Renderat kort på">▶ Spela steget med flyttat kort</button>`;
 // Only what matters now is shown: the main take, accepted variants, variant starts and films on their way.
 // Rejected and replaced takes are kept behind one folded row, which opens by itself when one of them is selected.
 const tab=(x:KbTake)=>{const role=G.takeRole(e,x),sub=role==='WAITING'?G.STAGE_LABEL[x.stage]:shared&&(role==='MAIN'||role==='OTHER')?'egen film för kort 2':role==='OTHER'?(x.decision==='SECONDARY'?'sekundär':x.editOf&&x.decision==='PENDING'?'ogranskad':e.main?'ersatt':'alternativ'):role==='START'?`variant-start ${esc(x.hub)}`:G.ROLE_LABEL[role];
  return `<button class="kb-take-tab r-${role}" data-take="${esc(x.id)}" aria-pressed="${x===t}" title="${esc(x.id)}"><b>${esc(kbShort(x.id,e.target))}</b><span>${sub}${x.segment?' · utsnitt':''}${x.editOf?` · rättad kopia av ${esc(kbShort(x.editOf,e.target))}`:''}${x.speed!==1?` · ${String(x.speed).replace('.',',')}×`:''}</span></button>`;};
 const sorted=[...e.takes].sort((a,b)=>Number(b===e.main)-Number(a===e.main)||b.order-a.order),old=sorted.filter(x=>!G.isCurrent(e,x));
 $('kb-takes').innerHTML=sorted.filter(x=>G.isCurrent(e,x)).map(tab).join('');$('kb-takes-old').innerHTML=old.map(tab).join('');
 $('kb-old').hidden=!old.length;$('kb-old-summary').textContent=`Ersatta och underkända (${old.length})`;if(t&&old.includes(t))$<HTMLDetailsElement>('kb-old').open=true;
 $('kb-take').hidden=!t;$('kb-empty').hidden=e.takes.length>0;$('kb-empty').textContent=shared?'Kort 2 har ingen egen film och behöver ingen: steget spelar platsens film.':'Ingen tagning finns för den här kanten ännu.';
 if(t)paintTake(e,t);else{kbPlayer.pause();paintDecide(null);}
 const draft=G.draftJob(g,e.id,{holeCardDown:input('kb-hole').checked});
 if(kbDraftFor!==e.id){kbDraftFor=e.id;$<HTMLDetailsElement>('kb-draft').open=!e.takes.length&&!shared;}
 $('kb-draft').hidden=!draft; // an experiment has no recipe to draft from
 $('kb-draft-summary').textContent=shared?'Jobbutkast för en egen film för kort 2 (behövs inte med en film per plats)':e.takes.length?'Jobbutkast för en ny tagning':'Jobbutkast för den saknade kanten';
 $('kb-draft-json').textContent=draft?JSON.stringify(draft.job,null,2):'';
 $('kb-draft-notes').innerHTML=(draft?.notes??[]).map(note=>`<li>${esc(note)}</li>`).join('');
}
function paintTake(e:KbEdge,t:KbTake){
 if(kbPlayer.dataset.take!==t.id)kbReversed=false; // every take opens forwards
 const G=clipGraph!,job=t.job,src=(kbReversed&&t.media.reversed)||t.media.video||'',source=t.motion?.source,out=t.receipt?.output,cut=t.kind==='DEAL'?t.landingFrame:null;
 $('kb-reverse-box').hidden=!t.media.reversed;input('kb-reverse').checked=kbReversed;
 if(kbPlayer.dataset.take!==t.id||kbPlayer.dataset.src!==src){kbPlayer.pause();kbPlayer.dataset.take=t.id;kbPlayer.dataset.src=src;if(t.segment&&kbPendingFrame===null)kbPendingFrame=t.segment.start||null;if(src){kbPlayer.src=src;kbPlayer.load();}else kbPlayer.removeAttribute('src');}
 kbPlayer.hidden=!src;$('kb-player-missing').hidden=!!src;$('kb-player-missing').textContent=t.stage==='DONE'?'Filmen finns bara lokalt.':`Ingen film ännu · ${G.STAGE_LABEL[t.stage]}.`;
 for(const id of ['kb-play','kb-prev-frame','kb-next-frame'])$<HTMLButtonElement>(id).disabled=!src;
 $('kb-cut-frame').hidden=cut===null||!src;$('kb-cut-frame').textContent=`Till landningsrutan f${cut}`;kbShowFrame();
 const day=(value?:string)=>value?` ${esc(String(value).slice(0,10))}`:'',width=source?.width??out?.width,height=source?.height??out?.height,seam=t.motion?.motion?.startsOn?.seamPixelsOverThreshold;
 // A derived take was never generated: it shows a range of frames from a film that already exists.
 const facts:[string,string][]=[['Klipp',`<code>${esc(t.id)}</code>`],...(t.segment?[['Utsnitt',t.segment.clip===t.id?`ruta ${t.segment.start}–${t.segment.end} av filmens egna rutor · resten av filmen spelas inte`:`ruta ${t.segment.start}–${t.segment.end} ur <code>${esc(t.segment.clip)}</code> · ingen ny film, inga credits`]] as [string,string][]:[['Modell',`${esc(job.model)} · ${esc(job.duration)} s · ${esc(job.ratio)} · ${job.audio?'med ljud':'utan ljud'}`],['Credits',`${esc(t.credits)}${t.receipt?'':' (beräknat)'}`]] as [string,string][]),
  ['Läge',t.segment?(t.stage==='DONE'?'klar · filmen finns':'filmen saknas på den här datorn'):t.stage==='DONE'?`klar${day(t.receipt?.completedAt)}`:t.stage==='ORDERED'?`${t.receipt?.status==='THROTTLED'?'i kö hos Runway':'renderas hos Runway'} · beställd${day(t.receipt?.requestedAt)}`:t.stage==='PREPARED'?'förberedd · indata frysta, inte beställd':t.stage==='FAILED'?'misslyckad hos Runway':'jobb skrivet · indata inte frysta']];
 if(t.frames)facts.push(['Film',`${width&&height?`${esc(width)} × ${esc(height)} · `:''}${esc(t.frames)} rutor · ${esc(t.fps??30)} fps`]);
 if(t.editOf)facts.push(['Rättad kopia',`av <code>${esc(t.editOf)}</code> · samma kant, samma bilder; bara det prompten nämner är ändrat${t.kind==='DEAL'?' · returer klippta ur källklippet följer även kopian; den skarven är inte uppmätt för kopian':''}`]);
 if(t.speed!==1)facts.push(['Uppspelning',`filmen är gjord i slow motion och spelas här i ${esc(String(t.speed).replace('.',','))}× · rutnumren är filens egna`]);
 if(t.media.reversed)facts.push(['Baklänges',kbReversed?'den omvända filen spelas · rutnumren räknas från filmens slut':'en omvänd fil finns · kryssa i Spela baklänges under filmen']);
 // Which cut rule applies: a return cut from one frame of this clip fits only this take; a return from the landing anchor fits them all.
 if(t.kind==='DEAL'){
  const back=G.returnsOf(kbGraph!,t),names=(list:KbTake[])=>list.map(x=>`<code>${esc(kbShort(x.id,e.target))}</code>`).join(', ');
  if(back.frame.length)facts.push(['Klipps vid',`ruta f${cut} · ${names(back.frame)} startar på den rutan och passar bara den här tagningen${t.landingConflict?' (returerna är oense om rutan)':''}`]);
  if(back.anchor.length)facts.push([back.frame.length?'Eller vid':'Klipps vid',`sista rutan · ${names(back.anchor)} startar från landningsankaret som den här tagningen slutar på, och passar varje tagning som slutar där`]);
  if(!back.frame.length&&!back.anchor.length)facts.push(['Klipps vid',cut===null?'okänt · ingen retur finns ännu, given spelas till sista rutan':`ruta f${cut} · angiven landningsruta`]);
 }
 if(t.anchorStart)facts.push(['Startar på',`landningsankaret <code>${esc(t.anchorStart.split('/').at(-2)??t.anchorStart)}</code> · passar varje giv till ${esc(e.from)} som slutar på det ankaret; given spelas till sin sista ruta`]);
 else if(t.startsOn)facts.push(['Startar på',`ruta f${t.startsOn.frame} i <code>${esc(t.startsOn.clip??t.startsOn.video)}</code>${t.kind==='RETURN'?` · passar bara den tagningen, som klipps vid samma ruta${typeof seam==='number'?` · ${seam} avvikande pixlar i skarven`:''}`:' · startbilden är hämtad därifrån; inget klipps för det'}`]);
 // What the card track says about this film, and where the card is drawn in front of the hand by hand-written rule.
 if(src){const data=ovData.get(t.id);
  if(!t.media.track)facts.push(['Kortspår','saknas ännu · filmens eget kort visas som det är']);
  else if(!data){facts.push(['Kortspår','läser…']);void ovRead(t).then(()=>{if(kbState==='ready'&&kbPanel==='edge'&&kbTake===t.id)paintEdge();});}
  else if(!data.track||!ovModel)facts.push(['Kortspår','kunde inte läsas']);
  else{facts.push(['Kortspår',esc(ovModel.describeTrack(data.track))]);
   facts.push(['Kort framför handen',data.overrides.length?data.overrides.map(o=>`ruta ${o.from}–${o.to}${o.note?` · ${esc(o.note)}`:''}`).join('<br>')+` · ur <code>${esc(t.media.overrides)}</code>`:'inga undantag · handen ligger alltid framför kortet']);
   // The measured answer to "is everything covered", and how far the rendered card is moved to end on the plan's place.
   const c=data.coverage;
   facts.push(['Täckning',c?`${ovCovers(c)}${c.covered?' · filmens eget kort syns inte i någon ruta':` · ${c.leakFrames} rutor, som mest ${c.worst.pixels} bildpunkter i ruta ${c.worst.frame}`} (uppmätt vid kortskala ${String(c.scale).replace('.',',')})`:'inte uppmätt ännu']);
   if(c&&c.landsOffPlanPx!==null)facts.push(['Landning',`filmens kort landar ${String(c.landsOffPlanPx).replace('.',',')} px från planens plats${c.offPlanFlag?' ⚠ över 50 px':''} · det renderade kortet flyttas dit, lite i taget från skon`]);
   if(c&&c.filmRestPx!==null&&c.scaleNeeded!==null)facts.push(['Kortstorlek',`filmens kort i vila är ${String(c.filmRestPx).replace('.',',')} px, planens kort ${String(c.planRestPx).replace('.',',')} px · kortskala ${String(c.scaleNeeded).replace('.',',')} räcker för 20 % marginal${c.scaleNeeded>c.scale?' ⚠ mer än förvalet':''}`]);}
 }
 facts.push(['Syfte',esc(job.purpose)]);
 $('kb-facts').innerHTML=facts.map(([key,value])=>`<dt>${key}</dt><dd>${value}</dd>`).join('');
 const review=t.motion?.review,role=G.takeRole(e,t);
 $('kb-review').innerHTML=`<div class="kb-review-head"><span class="eyebrow">GRANSKNING</span><span class="status-pill role">${G.ROLE_LABEL[role].toUpperCase()}</span>${t.stage==='DONE'?`<span class="status-pill d-${esc(t.decision)}">${esc((G.DECISION_LABEL[t.decision]??t.decision).toUpperCase())}${t.variant?' SOM VARIANT':''}</span>`:''}${review?.userAccepted?'<span class="status-pill d-ACCEPTED">GODKÄND AV JAKOB</span>':''}</div>`
  +(review?([['Grund',review.basis],['Begränsning',review.limitations],['Jakobs ord',review.userReview]] as [string,string|undefined][]).filter(row=>row[1]).map(row=>`<p><b>${row[0]}</b>${esc(row[1])}</p>`).join(''):`<p class="quiet">${t.stage==='DONE'?'Ingen granskning är registrerad i motions/ ännu.':'Granskas när filmen är klar.'}</p>`);
 const image=(label:string,ref:KbImage,path?:string|null)=>`<figure>${path?`<a href="${esc(path)}" target="_blank" rel="noopener" title="Öppna i full storlek"><img src="${esc(path)}" alt="${label}" loading="lazy"></a>`:`<div class="kb-noimage">${t.stage==='WRITTEN'?'Bilden är inte fryst ännu':'Finns bara lokalt'}</div>`}<figcaption><b>${label}</b><span>${esc(ref?.frame?`ruta f${ref.frame.index} ur ${G.clipOfVideo(ref.frame.video)??ref.frame.video}`:ref?.file?.path)}</span>${ref?.note?`<small>${esc(ref.note)}</small>`:''}</figcaption></figure>`;
 $('kb-images').innerHTML=t.segment?'':image('Första bild',job.first,t.media.first)+image('Sista bild',job.last,t.media.last);
 $('kb-prompt').textContent=job.promptText;$('kb-prompt-box').hidden=!job.promptText;
 paintDecide(t);
}
const kbPlayer=$<HTMLVideoElement>('kb-player');
const kbSpeed=(id:string)=>{const speed=Number($<HTMLSelectElement>(id).value);return [.25,.5,1].includes(speed)?speed:1;};
let kbReversed=false;
// The chosen speed times the speed the take is meant to be watched at.
const kbRate=()=>kbSpeed('kb-speed')*(kbGraph?.takes[kbTake]?.speed??1);
function kbClip(){const t=kbGraph?.takes[kbTake];if(!t?.media.video)return null;const fps=t.fps??30;return {fps,frames:t.frames??Math.max(1,Math.round((kbPlayer.duration||0)*fps))};}
function kbShowFrame(){const c=kbClip(),scrub=input('kb-scrub');$('kb-frame').textContent=c?`Ruta ${frameAt(kbPlayer,c.fps,c.frames)} / ${c.frames-1} · ${c.fps} fps`:'';scrub.disabled=!c;if(c){scrub.max=String(c.frames-1);scrub.value=String(frameAt(kbPlayer,c.fps,c.frames));}}
function kbSeek(frame:number){const c=kbClip();if(!c||!Number.isSafeInteger(frame))return;kbPlayer.pause();const target=Math.max(0,Math.min(c.frames-1,frame));if(kbPlayer.readyState<1){kbPendingFrame=target;return;}kbPlayer.currentTime=frameTime(target,c.fps);kbPendingFrame=null;kbShowFrame();}
$('kb-play').addEventListener('click',()=>{if(kbPlayer.paused)void kbPlayer.play().catch(()=>{});else kbPlayer.pause();});
for(const [id,step] of [['kb-prev-frame',-1],['kb-next-frame',1]] as const)$(id).addEventListener('click',()=>{const c=kbClip();if(c)kbSeek(frameAt(kbPlayer,c.fps,c.frames)+step);});
$('kb-cut-frame').addEventListener('click',()=>{const cut=kbGraph?.takes[kbTake]?.landingFrame;if(typeof cut==='number')kbSeek(cut);});
$('kb-scrub').addEventListener('input',()=>kbSeek(Number(input('kb-scrub').value))); // one step of the slider is one frame of the film
$('kb-speed').addEventListener('change',()=>{kbPlayer.playbackRate=kbRate();});
$('kb-reverse').addEventListener('change',()=>{kbReversed=input('kb-reverse').checked;kbPendingFrame=null;if(kbState==='ready'&&kbPanel==='edge')paintEdge();});
kbPlayer.addEventListener('loadedmetadata',()=>{kbPlayer.playbackRate=kbRate();if(kbPendingFrame!==null)kbSeek(kbPendingFrame);else kbShowFrame();});
for(const event of ['timeupdate','seeked'])kbPlayer.addEventListener(event,kbShowFrame);
for(const event of ['play','pause','ended'])kbPlayer.addEventListener(event,()=>{$('kb-play').textContent=kbPlayer.paused?'Spela':'Pausa';});
kbPlayer.addEventListener('error',()=>{if(!kbPlayer.dataset.src)return;kbPlayer.hidden=true;$('kb-player-missing').hidden=false;$('kb-player-missing').textContent='Filmen kunde inte spelas. Kontrollera att den finns lokalt.';});
// Rundbyggare: en kedja av kanter spelas som en film i två staplade videoelement. Nästa film laddas
// i elementet som ligger under det synliga och lyfts fram i klippögonblicket.
function kbRoundChanged(custom:boolean){kbCustom=custom;if(!custom)kbSteps=clipGraph!.roundSequence(kbRoundOptions());kbStopChain();kbResolve();paintTree();paintRound();kbLink();}
function paintRound(){
 const G=clipGraph!,g=kbGraph!,frames=(s:KbSegment)=>s.gap?0:Math.max(0,(s.end??s.take?.frames??0)-s.start),gaps=kbSegments.filter(s=>s.gap).length;
 document.querySelectorAll<HTMLButtonElement>('[data-kb-seat]').forEach(b=>b.setAttribute('aria-pressed',String(kbSeats.has(b.dataset.kbSeat!))));$('kb-dealer').setAttribute('aria-pressed',String(kbDealer));
 $('kb-seq-count').textContent=kbSegments.length?`${kbSegments.length} steg · ${kbSegments.length-gaps} spelbara · ${gaps} ${gaps===1?'lucka':'luckor'} · ${kbSegments.reduce((sum,s)=>sum+frames(s)/s.fps,0).toFixed(1).replace('.',',')} s film${kbCustom?' · ändrad för hand':''}`:'';
 $('kb-steps').innerHTML=kbSegments.map(s=>{const own=s.edge,e=s.film??own,t=s.take,lent=!!own&&e!==own,takes=e?[...e.takes.filter(G.playable),...(lent?own!.takes.filter(G.playable):[])]:[],seam=!!t?.startsOn&&t.startsOn.clip===kbSegments[s.index-1]?.take?.id;
  const state=s.gap?`<span class="kb-chip gap"><i>○</i>${G.GAP_LABEL[s.gap]}</span>`:kbChip(kbTakeStatus(t!),t===e!.main?G.STATUS_LABEL[e!.status]:G.ROLE_LABEL[G.takeRole(e!,t!)]);
  const pick=takes.length>1?`<select data-step-take="${s.index}" aria-label="Tagning för steg ${s.index+1}">${takes.map(o=>`<option value="${esc(o.id)}"${o===t?' selected':''}>${esc(kbShort(o.id,e!.target))} · ${lent&&own!.takes.includes(o)?'egen film för kort 2':G.ROLE_LABEL[G.takeRole(e!,o)]}</option>`).join('')}</select>`:'';
  const detail=t?`${esc(kbShort(t.id,e!.target))}${s.gap?'':` · ruta ${s.start}–${kbLast(s)}${s.cut==='FRAME'?` · klipps vid landningsrutan f${s.end}`:s.cut==='END'?' · spelas till sista rutan':''}${seam?` · startar på landningsrutan f${t.startsOn!.frame}`:t.anchorStart?' · startar från landningsankaret':''}`}${lent?` · platsens film <code>${esc(e!.id)}</code>${s.shift?` · kortet flyttas ${Math.round(Math.hypot(s.shift.x,s.shift.y))} px`:''}`:''}`:lent?`platsens film <code>${esc(e!.id)}</code> saknas`:'';
  return `<li class="kb-step${s.gap?' gap':''}" data-step="${s.index}"><button class="kb-step-play" data-step-play="${s.index}" title="Spela från det här steget"><span>${s.index+1}</span><code>${esc(s.id)}</code>${s.side?`<i class="swatch ${s.side==='BACK'?'yellow':'blue'}" title="${s.side==='BACK'?'stängt kort':'öppet kort'}"></i>`:''}</button>${state}<span class="kb-step-pick">${pick}</span><span class="kb-step-tools"><button data-step-open="${s.index}" title="Visa kantdetalj" aria-label="Visa kantdetalj för ${esc(s.id)}">↗</button><button data-step-move="${s.index}" data-by="-1" title="Flytta upp" aria-label="Flytta upp steg ${s.index+1}">↑</button><button data-step-move="${s.index}" data-by="1" title="Flytta ned" aria-label="Flytta ned steg ${s.index+1}">↓</button><button data-step-del="${s.index}" title="Ta bort steget" aria-label="Ta bort steg ${s.index+1}">✕</button></span>${detail?`<p class="kb-step-detail">${detail}</p>`:''}${s.notes.map(note=>`<p class="kb-step-note">${esc(note)}</p>`).join('')}</li>`;}).join('')||'<li class="kb-empty">Välj minst en plats eller dealern.</li>';
 $('kb-chain-bar').innerHTML=kbSegments.map(s=>`<button class="${s.gap?'gap':`s-${kbTakeStatus(s.take!)}`}" data-step-play="${s.index}" style="flex:${Math.max(24,frames(s))}" title="${s.index+1}. ${esc(s.id)}${s.gap?` · ${G.GAP_LABEL[s.gap]}`:''}" aria-label="Spela från steg ${s.index+1}, ${esc(s.id)}"></button>`).join('');
 const seq=$<HTMLTextAreaElement>('kb-seq');if(document.activeElement!==seq)seq.value=G.formatSequence(kbSteps);
 const end=kbSteps.at(-1)?.to??'IDLE',last=G.hubOf(end)??end,next=g.edges.filter(e=>e.from===last);
 $('kb-add-edge').innerHTML=next.map(e=>`<option value="${esc(e.id)}">${esc(e.id)} · ${G.STATUS_LABEL[e.status]}</option>`).join('');
 for(const id of ['kb-add-edge','kb-add-step'])$<HTMLButtonElement>(id).disabled=!next.length; // nothing in the model continues from an experiment's own rest pose
 // Show the first playable frame instead of an empty player.
 const first=kbSegments.find(s=>!s.gap);if(kbChain.index<0&&first){void kbPrepare(kbVideos[kbChain.active],first);kbVideos.forEach((v,i)=>v.classList.toggle('on',i===kbChain.active));}
 paintChain();
}
const kbVideos=[$<HTMLVideoElement>('kb-chain-a'),$<HTMLVideoElement>('kb-chain-b')],kbReady=new WeakMap<HTMLVideoElement,Promise<boolean>>();
const kbChain={index:-1,playing:false,token:0,frame:0,timer:0,active:0};
// Loads a segment and resolves once its first frame is decoded, so a cut never shows a blank element.
function kbPrepare(el:HTMLVideoElement,seg:KbSegment):Promise<boolean>{
 const key=`${seg.index}:${seg.video}`;
 if(el.dataset.seg===key&&kbReady.has(el))return kbReady.get(el)!;
 el.dataset.seg=key;
 const ready=new Promise<boolean>(resolve=>{
  const finish=(ok:boolean)=>{clearTimeout(limit);el.removeEventListener('seeked',seeked);el.removeEventListener('error',failed);resolve(ok&&el.dataset.seg===key);};
  const seeked=()=>finish(true),failed=()=>finish(false),limit=setTimeout(()=>finish(el.readyState>=2),6000);
  el.addEventListener('seeked',seeked);el.addEventListener('error',failed);
  el.addEventListener('loadedmetadata',()=>{if(el.dataset.seg===key)el.currentTime=frameTime(seg.start,seg.fps);},{once:true});
  el.pause();el.src=seg.video!;el.load();
 });
 kbReady.set(el,ready);return ready;
}
const kbShown=(seg:KbSegment|undefined)=>!!seg&&!seg.gap&&kbVideos[kbChain.active].dataset.seg===`${seg.index}:${seg.video}`;
const kbLast=(seg:KbSegment)=>Math.max(seg.start,(seg.end??seg.take?.frames??seg.start+1)-1); // the last source frame a segment shows
function kbChainStatus(note=''){
 const seg=kbSegments[kbChain.index],el=kbVideos[kbChain.active];
 $('kb-chain-status').textContent=note||(seg?`Steg ${seg.index+1} av ${kbSegments.length} · ${seg.id}${kbShown(seg)?` · ruta ${frameAt(el,seg.fps,kbLast(seg)+1)} / ${kbLast(seg)}`:''}${kbChain.playing?'':' · pausad'}`:kbSegments.length?'Redo att spela.':'');
}
function paintChain(note=''){
 const seg=kbSegments[kbChain.index],gap=seg?.gap&&clipGraph?seg:null;
 document.querySelectorAll<HTMLElement>('#kb-steps [data-step],#kb-chain-bar [data-step-play]').forEach(n=>n.classList.toggle('current',Number(n.dataset.step??n.dataset.stepPlay)===kbChain.index));
 document.querySelectorAll<SVGElement>('#kb-tree [data-edge]').forEach(n=>n.classList.toggle('playing',!!seg&&n.dataset.edge===(seg.film?.id??seg.edge?.id??seg.id)));
 $('kb-chain-play').textContent=kbChain.playing?'Pausa':kbChain.index>=0?'Fortsätt':'Spela rundan';$<HTMLButtonElement>('kb-chain-play').disabled=!kbSegments.length;
 $('kb-chain-gap').hidden=!gap;
 if(gap)$('kb-chain-gap').innerHTML=`<b>${clipGraph!.GAP_LABEL[gap.gap!]}: ${esc(gap.id)}</b><span>${gap.gap==='MISSING'?'Ingen tagning finns för den här kanten.':gap.gap==='WAITING'?'Tagningen är förberedd eller beställd men inte klar.':gap.gap==='REJECTED'?'Alla tagningar är underkända.':gap.gap==='LOCAL_ONLY'?'Filmen ligger bara på den lokala datorn.':'Kanten finns inte i klippmodellen.'}</span>`;
 $('kb-chain-label').hidden=!seg;$('kb-chain-label').textContent=seg?`${seg.index+1} / ${kbSegments.length} · ${seg.id}`:'';
 kbChainStatus(note);ovSync();
}
// Every chain action first halts whatever ran before; the token makes a superseded load or timer give up.
function kbHalt(){kbChain.token++;clearTimeout(kbChain.timer);cancelAnimationFrame(kbChain.frame);kbChain.playing=false;for(const v of kbVideos)v.pause();}
function kbStopChain(){kbHalt();kbChain.index=-1;if(clipGraph)paintChain();}
// Brings one segment into view, paused on a frame (its first by default), and starts loading the film after it.
async function kbCue(index:number,frame?:number):Promise<'ok'|'failed'|'stale'>{
 const seg=kbSegments[index],token=kbChain.token;
 let slot=kbVideos.findIndex(v=>v.dataset.seg===`${seg.index}:${seg.video}`);if(slot<0)slot=1-kbChain.active;
 const el=kbVideos[slot],ok=await kbPrepare(el,seg);
 if(token!==kbChain.token)return 'stale';
 if(!ok)return 'failed';
 const time=frameTime(frame??seg.start,seg.fps);if(Math.abs(el.currentTime-time)>.0005)el.currentTime=time; // a reused element may stand anywhere
 kbVideos[1-slot].pause();kbVideos.forEach((v,i)=>v.classList.toggle('on',i===slot));kbChain.active=slot;ovSync();
 const next=kbSegments.slice(index+1).find(s=>!s.gap);if(next)void kbPrepare(kbVideos[1-slot],next);
 return 'ok';
}
// Plays the segment in view up to its cut, or its last frame, and then moves on to the next step.
function kbRun(){
 const index=kbChain.index,seg=kbSegments[index],el=kbVideos[kbChain.active],token=kbChain.token;
 // The cut: leave a deal half a frame before the frame its return starts on; the return shows that same frame next.
 const limit=seg.end===null?Infinity:(seg.end-.5)/seg.fps;
 el.playbackRate=kbSpeed('kb-chain-speed')*(seg.take?.speed??1);void el.play().catch(()=>{});
 const watch=()=>{if(token!==kbChain.token)return;kbChainStatus();if(el.ended||el.currentTime>=limit){el.pause();void kbPlayStep(index+1);return;}kbChain.frame=requestAnimationFrame(watch);};
 kbChain.frame=requestAnimationFrame(watch);
}
async function kbPlayStep(index:number){
 kbHalt();const token=kbChain.token,seg=kbSegments[index];
 if(!seg){kbChain.index=-1;paintChain(kbSegments.length?'Rundan är slut.':'');return;}
 kbChain.index=index;kbChain.playing=true;paintChain();
 const skip=()=>{kbChain.timer=Number(setTimeout(()=>{if(token===kbChain.token)void kbPlayStep(index+1);},1300));};
 // A gap is shown as a card over the last frame and then skipped; the next film loads meanwhile.
 if(seg.gap){const next=kbSegments.slice(index+1).find(s=>!s.gap);if(next)void kbPrepare(kbVideos[1-kbChain.active],next);skip();return;}
 const state=await kbCue(index);
 if(state==='stale')return;
 if(state==='failed'){$('kb-chain-gap').hidden=false;$('kb-chain-gap').innerHTML=`<b>kunde inte spelas: ${esc(seg.id)}</b><span>Kontrollera att filmen finns lokalt.</span>`;skip();return;}
 kbRun();
}
// One frame at a time, also across a cut: past a film's last frame comes the first frame of the next film.
async function kbChainStep(dir:-1|1){
 if(!kbSegments.length)return;
 kbHalt();
 const seg=kbSegments[kbChain.index],el=kbVideos[kbChain.active],shown=kbShown(seg);
 if(shown){const frame=frameAt(el,seg.fps,kbLast(seg)+1)+dir;if(frame>=seg.start&&frame<=kbLast(seg)){el.currentTime=frameTime(frame,seg.fps);paintChain();return;}}
 let at=shown?kbChain.index+dir:kbChain.index>=0?kbChain.index:dir>0?0:kbSegments.length-1;
 while(kbSegments[at]?.gap)at+=dir;
 const target=kbSegments[at];if(!target){paintChain();return;}
 kbChain.index=at;paintChain();
 if(await kbCue(at,dir>0?target.start:kbLast(target))!=='stale')paintChain();
}
// The film being looked at in the edge detail, then its way back: one click from a card to a seamless pair.
function kbPlayPair(to:string){
 const G=clipGraph!,g=kbGraph!,target=kbNode,viewed=g.takes[kbTake];if(!g.edge[`READY>${target}`]||G.hubOf(target))return;
 const pin=(edge:string)=>viewed?.edge===edge&&G.playable(viewed)&&viewed!==g.edge[edge].main?{take:viewed.id}:{};
 kbPlaySteps([{from:viewed?.edge===`READY>${target}`&&viewed.hub?viewed.hub:'READY',to:target,...pin(`READY>${target}`)},{from:target,to,...pin(`${target}>${to}`)}]);
}
$('kb-node-play').addEventListener('click',event=>{const to=(event.target as Element).closest<HTMLElement>('[data-play-to]')?.dataset.playTo;if(to)kbPlayPair(to);});
$('kb-chain-play').addEventListener('click',()=>{
 if(!kbSegments.length)return;
 const seg=kbSegments[kbChain.index];
 if(kbChain.playing){kbHalt();paintChain();}
 else if(!seg)void kbPlayStep(0);
 else if(!kbShown(seg))void kbPlayStep(kbChain.index); // paused on a gap, or before the film came into view
 else{kbChain.token++;kbChain.playing=true;paintChain();kbRun();}
});
$('kb-chain-stop').addEventListener('click',()=>{kbStopChain();paintRound();});
$('kb-chain-prev').addEventListener('click',()=>void kbChainStep(-1));$('kb-chain-next').addEventListener('click',()=>void kbChainStep(1));
$('kb-chain-speed').addEventListener('change',()=>{kbVideos[kbChain.active].playbackRate=kbSpeed('kb-chain-speed')*(kbSegments[kbChain.index]?.take?.speed??1);});
$('kb-chain-bar').addEventListener('click',event=>{const el=(event.target as Element).closest<HTMLElement>('[data-step-play]');if(el)void kbPlayStep(Number(el.dataset.stepPlay));});
document.querySelectorAll<HTMLButtonElement>('[data-kb-seat]').forEach(b=>b.addEventListener('click',()=>{const seat=b.dataset.kbSeat!;if(!kbSeats.delete(seat))kbSeats.add(seat);kbRoundChanged(false);}));
$('kb-dealer').addEventListener('click',()=>{kbDealer=!kbDealer;kbRoundChanged(false);});
for(const id of ['kb-third','kb-cards'])$(id).addEventListener('change',()=>kbRoundChanged(false));
$('kb-hole').addEventListener('change',()=>{kbRebuild();kbRoundChanged(kbCustom);paintSummary();paintNode();}); // an open hole card ends on the same side as the first dealer card and then shares its films
$('kb-reset-round').addEventListener('click',()=>kbRoundChanged(false));
$('kb-add-step').addEventListener('click',()=>{const e=clipGraph?.parseEdge($<HTMLSelectElement>('kb-add-edge').value);if(e){kbSteps=[...kbSteps,e];kbRoundChanged(true);}});
$('kb-apply-seq').addEventListener('click',()=>{
 const parsed=clipGraph!.parseSequence($<HTMLTextAreaElement>('kb-seq').value,kbKnown);
 $('kb-seq-error').textContent=parsed.errors.length?`Kunde inte tolka: ${parsed.errors.join(', ')}`:parsed.steps.length?'':'Skriv minst en kant, till exempel READY>P4.C1.';
 if(parsed.errors.length||!parsed.steps.length)return;
 kbSteps=parsed.steps;$('kb-seq').blur();kbRoundChanged(true);
});
$('kb-copy-seq').addEventListener('click',()=>void kbCopy($<HTMLTextAreaElement>('kb-seq').value,$('kb-copy-seq')));
$('kb-steps').addEventListener('click',event=>{
 const d=(event.target as Element).closest<HTMLElement>('button')?.dataset;if(!d)return;
 if(d.stepPlay!==undefined)void kbPlayStep(Number(d.stepPlay));
 else if(d.stepOpen!==undefined)kbSelect(kbSegments[Number(d.stepOpen)].id,kbSegments[Number(d.stepOpen)].take?.id);
 else if(d.stepDel!==undefined){kbSteps=kbSteps.filter((_,i)=>i!==Number(d.stepDel));kbRoundChanged(true);}
 else if(d.stepMove!==undefined){const i=Number(d.stepMove),j=i+Number(d.by),steps=[...kbSteps];if(j<0||j>=steps.length)return;[steps[i],steps[j]]=[steps[j],steps[i]];kbSteps=steps;kbRoundChanged(true);}
});
$('kb-steps').addEventListener('change',event=>{const el=event.target as HTMLSelectElement,i=Number(el.dataset.stepTake);if(el.dataset.stepTake===undefined)return;kbSteps=kbSteps.map((s,n)=>n===i?{from:s.from,to:s.to,...(el.value===(kbSegments[i].film??kbSegments[i].edge)?.main?.id?{}:{take:el.value})}:s);kbRoundChanged(true);});
const kbPick=(event:Event)=>{const d=(event.target as Element).closest<HTMLElement>('[data-edge],[data-node]')?.dataset;if(!d)return false;kbSelect(d.edge??(d.node==='IDLE'?'IDLE>READY':d.node==='READY'?'READY>IDLE':`READY>${d.node}`));return true;};
$('kb-tree').addEventListener('click',kbPick);$('kb-node-edges').addEventListener('click',kbPick);
document.querySelectorAll<HTMLButtonElement>('[data-kb-mode]').forEach(b=>b.addEventListener('click',()=>kbSetMode(b.dataset.kbMode==='CARD'?'CARD':'SEAT')));
// A second card played through the seat's film is only meaningful with the rendered card, so these buttons switch it on.
const kbPlayShifted=(steps:KbStep[])=>{ov.on=true;if(ovState==='idle')void ovLoad();kbPlaySteps(steps);};
$('kb-node-share').addEventListener('click',event=>{if(kbPick(event))return;const to=(event.target as Element).closest<HTMLElement>('[data-play-second]')?.dataset.playSecond,second=`${kbNode.split('.')[0]}.C2`;if(to&&kbGraph?.edge[`READY>${second}`])kbPlayShifted([{from:'READY',to:second},{from:second,to}]);});
$('kb-share').addEventListener('click',event=>{if(kbPick(event))return;const e=kbGraph?.edge[kbEdge];if(e&&(event.target as Element).closest('[data-play-shared]'))kbPlayShifted([{from:e.from,to:e.to}]);});
$('kb-tree').addEventListener('keydown',event=>{const key=(event as KeyboardEvent).key;if((key==='Enter'||key===' ')&&kbPick(event)){event.preventDefault();$('kb-tree').querySelector<SVGElement>('.kb-edge.sel')?.focus();}});
for(const id of ['kb-takes','kb-takes-old'])$(id).addEventListener('click',event=>{const take=(event.target as Element).closest<HTMLElement>('[data-take]')?.dataset.take;if(take){kbTake=take;kbPendingFrame=null;paintEdge();kbLink();}});
document.querySelectorAll<HTMLButtonElement>('[data-kb-panel]').forEach(b=>b.addEventListener('click',()=>{kbPanel=b.dataset.kbPanel as 'edge'|'round';kbStopChain();kbPlayer.pause();paintBank();kbLink();}));
$('kb-refresh').addEventListener('click',()=>void openClipBank());
$('kb-notices').addEventListener('click',event=>{
 const d=(event.target as Element).closest<HTMLElement>('button')?.dataset,id=d?.news??d?.newsClose,at=kbNews.findIndex(n=>n.id===id);if(at<0)return;
 const [news]=kbNews.splice(at,1);if(d!.news!==undefined)kbSelect(news.edge,news.id);else paintBank();
});
$('kb-copy-prompt').addEventListener('click',()=>void kbCopy($('kb-prompt').textContent??'',$('kb-copy-prompt')));
$('kb-copy-draft').addEventListener('click',()=>void kbCopy($('kb-draft-json').textContent??'',$('kb-copy-draft')));
// ── Renderat kort över filmen ───────────────────────────────────────────────
// Kortet ritas av src/card-overlay-view.ts med Materialpanelens eget kort. Var det ligger kommer ur
// kortspåret (tools/track-card.ts) och hur stort ur scenkontraktet. Filmen själv ändras aldrig.
type OvView=typeof import('./card-overlay-view.js');
type OvModel=typeof import('./card-overlay.js');
type OvTrack=import('./card-overlay.js').CardTrack;
type OvScene=import('./card-overlay.js').Scene;
// coverage: what tools/card-coverage.ts measured for the film: in which frames the film's own card still shows, and how far beside the plan it lands.
type OvCoverage={covered:boolean;leakFrames:number;leakRanges:[number,number][];worst:{frame:number;pixels:number};landsOffPlanPx:number|null;offPlanFlag:boolean;filmRestPx:number|null;planRestPx:number|null;scaleNeeded:number|null;scale:number};
type OvData={track:OvTrack|null;overrides:import('./card-overlay.js').Override[];coverage:OvCoverage|null};
// The plan's quad for a card, in the film's pixels: where the rendered card is to end, whatever the film's own landing.
const kbLand=(card:string|null|undefined)=>{const g=card?plan?.targets[card]?.geometry.native:null;if(!g)return null;
 const q=plan.tableProjection?.mode==='flat'?flatQuad(g,plan.targets['P4.C1'].geometry.native,'native',plan.tableProjection.heading??0):quad(g,'native');return q.map((p:{x:number;y:number})=>({x:p.x*1763/1761,y:p.y}));};
const ovCovers=(c:OvCoverage)=>c.covered?'täcker allt':`läcker ruta ${c.leakRanges.slice(0,4).map(([a,b])=>a===b?`${a}`:`${a}–${b}`).join(', ')}${c.leakRanges.length>4?' …':''}`;
// Kortskala 1,2: the plan's card and a fifth more, the same at every seat, so the film's card is covered without the cards dominating the table.
const ov={on:false,split:false,scale:1.2,rank:'A',suit:'spades',side:'TRACK'};
let ovView:OvView|null=null,ovModel:OvModel|null=null,ovScene:OvScene|null=null,ovState:'idle'|'loading'|'ready'|'missing'='idle',ovScaleSet=false,ovError='';
const ovData=new Map<string,OvData>(),ovReading=new Map<string,Promise<OvData>>(),ovLayers=new Map<string,ReturnType<OvView['createCardOverlay']>>();
// A take's card track and occlusion overrides, read once per take. A missing file is simply "no track".
function ovRead(take:KbTake):Promise<OvData>{
 const known=ovReading.get(take.id);if(known)return known;
 const json=async(path?:string|null)=>{if(!path)return null;try{const res=await fetch(path);return res.ok?await res.json():null;}catch{return null;}};
 const reading=(async()=>{
  let data:OvData={track:null,overrides:[],coverage:null};
  try{ovModel??=await import('./card-overlay.js');const [track,overrides,receipt]=await Promise.all([json(take.media.track),json(take.media.overrides),json(take.media.track?.replace(/card-track\.json$/,'receipt.json'))]);data={track:track&&Array.isArray(track.frames)?track:null,overrides:ovModel.overridesOf(overrides),coverage:receipt?.coverage&&Array.isArray(receipt.coverage.leakRanges)?receipt.coverage:null};}catch{/* no overlay model here: nothing to show */}
  ovData.set(take.id,data);return data;
 })();
 ovReading.set(take.id,reading);return reading;
}
async function ovLoad(){
 if(ovState!=='idle')return;ovState='loading';ovSync();
 try{
  [ovModel,ovView]=await Promise.all([import('./card-overlay.js'),import('./card-overlay-view.js')]);
  try{const res=await fetch('data/scene-contract.json');ovScene=res.ok?ovModel.sceneOf(await res.json()):null;}catch{ovScene=null;}
  if(!ovScaleSet)ov.scale=ovModel.MARGIN;
  ovState='ready';
 }catch{ovState='missing';}
 ovSync();
}
// The card a take deals or leaves, for the bend and gloss set on that card in the Material panel.
type OvExtra={shift?:{x:number;y:number}|null;land?:{x:number;y:number}[]|null;placed?:{quad:{x:number;y:number}[];back:boolean}[]};
function ovOptions(take:KbTake,frame:number,data:OvData|undefined,extra:OvExtra={}){
 const edge=kbGraph?.edge[take.edge],card=edge?.target??[edge?.to,edge?.from].find(node=>!!node&&!!plan?.targets[node]),material=card?plan?.targets[card]?.material:undefined;
 return {scale:ov.scale,split:ov.split,card:{rank:ov.rank,suit:ov.suit} as never,side:ov.side as 'TRACK'|'BACK'|'FRONT',bend:material?.bend??.07,gloss:material?.gloss??.35,inFront:!!data&&!!ovModel&&ovModel.cardInFront(data.overrides,frame),shift:extra.shift??null,land:extra.land??null,placed:extra.placed??[]};
}
function ovPaint(name:'take'|'chain',video:HTMLVideoElement,take:KbTake|null|undefined,frame:number,visible:boolean,extra:OvExtra={}){
 const canvas=$<HTMLCanvasElement>(name==='take'?'kb-card':'kb-chain-card'),active=ov.on&&ovState==='ready'&&visible&&!!take?.media.video;
 canvas.hidden=!active;$(name==='take'?'kb-video-box':'kb-chain-box').classList.toggle('split',active&&ov.split);
 if(name==='take')kbPlayer.controls=!active; // the browser's own control bar would lie over the table where cards land; the frame slider below takes its place
 if(!active||!take)return;
 const data=ovData.get(take.id);if(!data)void ovRead(take).then(()=>ovSync()); // drawn again when the track has arrived
 try{
  let layer=ovLayers.get(name);if(!layer){layer=ovView!.createCardOverlay(canvas);ovLayers.set(name,layer);}
  layer.draw(video,frame,data?.track??null,ovScene,ovOptions(take,frame,data,extra));ovError='';
 }catch{ovError='Kortet kunde inte ritas. WebGL krävs för det renderade kortet.';}
}
const ovTakeNow=()=>kbGraph?.takes[kbTake]??null;
const ovSegmentNow=()=>kbSegments[kbChain.index]??(kbChain.index<0?kbSegments.find(s=>!s.gap):undefined);
function ovTake(frame?:number){const t=ovTakeNow(),c=kbClip(),shown=frame??(c?frameAt(kbPlayer,c.fps,c.frames):0);
 ovPaint('take',kbPlayer,t,kbReversed&&c?c.frames-1-shown:shown,(tab==='review'||(tab==='clipbank'&&kbPanel==='edge'))&&!!c,{land:t?kbLand(rvCard(kbGraph!.edge[t.edge])):null});} // the track counts the forward film's frames
// The cards dealt earlier in the round, which the film in view does not show. Each lies where the last film that had it as its
// own card left it (its return if that has been played, else its deal), moved with that step's shift. lost: cards whose film has no track.
function ovPlaced(index:number){
 const seg=kbSegments[index],mine=seg?.kind==='DEAL'?seg.to:seg?.from,lie=new Map<string,{quad:{x:number;y:number}[];back:boolean}>(),lost=new Set<string>();
 if(ovModel)for(const s of kbSegments.slice(0,Math.max(0,index))){
  const card=s.kind==='DEAL'?s.to:s.kind==='RETURN'&&s.edge?.target?s.from:null;
  if(!card||!s.take||s.gap||card===mine){if(card===mine){lie.delete(card);lost.delete(card);}continue;}
  const data=ovData.get(s.take.id);if(!data){void ovRead(s.take).then(()=>ovSync());continue;}
  const put=data.track?ovModel.placedCard(data.track,ovScene,ov.scale,s.shift,kbLand(card)):null;
  if(put){lie.set(card,{quad:put.quad,back:(ov.side==='TRACK'?(s.kind==='DEAL'&&s.side?s.side:put.side):ov.side)==='BACK'});lost.delete(card);}else if(!lie.has(card))lost.add(card);
 }
 return {cards:[...lie.values()],lost:[...lost]};
}
function ovChain(frame?:number){const seg=ovSegmentNow(),video=kbVideos[kbChain.active],shown=!!seg&&!seg.gap&&video.dataset.seg===`${seg.index}:${seg.video}`;
 ovPaint('chain',video,shown?seg!.take:null,frame??(shown?frameAt(video,seg!.fps,seg!.take?.frames??100000):0),tab==='clipbank'&&kbPanel==='round'&&shown,shown&&ov.on&&ovState==='ready'?{shift:seg!.shift,land:kbLand(seg!.edge?rvCard(seg!.edge):null),placed:ovPlaced(seg!.index).cards}:{});}
function ovStatus(name:string){
 if(!ov.on)return '';
 if(ovState==='loading')return 'Läser in kortmaterialet…';
 if(ovState==='missing')return 'Det renderade kortet finns bara lokalt.';
 if(ovError)return ovError;
 const take=name==='take'?ovTakeNow():ovSegmentNow()?.take;if(!take?.media.video)return 'Ingen film att rita kortet på.';
 const data=ovData.get(take.id);if(!data)return 'Läser kortspåret…';
 // In the chain: what the seat film is doing for this step, and which earlier cards lie on the table.
 const seg=name==='chain'?ovSegmentNow():undefined,laid=seg?ovPlaced(seg.index):{cards:[],lost:[]};
 const round=`${seg?.shift?` · platsens film, kortet flyttat ${Math.round(Math.hypot(seg.shift.x,seg.shift.y))} px till ${seg.edge?.target}`:''}${laid.cards.length?` · ${laid.cards.length} tidigare kort ligger kvar`:''}${laid.lost.length?` · ${laid.lost.join(', ')} saknar spår och visas inte`:''}`;
 if(!data.track)return `Den här filmen har inget kortspår ännu, så det renderade kortet kan inte följa den: filmens eget kort visas som det är.${round}`;
 return `Spår: ${ovModel!.describeTrack(data.track)}${ovScene?'':' · scenkontraktet saknas, kortet förstoras kring sin mitt'}${data.overrides.length?` · framför handen ruta ${data.overrides.map(o=>`${o.from}–${o.to}`).join(', ')}`:''}${round}`;
}
function ovSync(){
 document.querySelectorAll<HTMLElement>('[data-overlay]').forEach(box=>{
  box.hidden=false;
  box.querySelectorAll<HTMLInputElement>('[data-ov]').forEach(el=>{const key=el.dataset.ov as keyof typeof ov;if(el.type==='checkbox')el.checked=!!ov[key];else el.value=String(ov[key]);el.disabled=key!=='on'&&!ov.on;});
  box.querySelector('[data-ov-scale]')!.textContent=ov.scale.toFixed(2).replace('.',',');
 });
 ovTake();ovChain();
 document.querySelectorAll<HTMLElement>('[data-overlay]').forEach(box=>{box.querySelector('[data-ov-status]')!.textContent=ovStatus(box.dataset.overlay!);});
}
document.querySelectorAll<HTMLElement>('[data-overlay]').forEach(box=>{for(const type of ['input','change'])box.addEventListener(type,event=>{
 const el=event.target as HTMLInputElement,key=el.dataset?.ov;if(!key)return;
 if(key==='on')ov.on=el.checked;else if(key==='split')ov.split=el.checked;else if(key==='scale'){ov.scale=Math.max(1,Math.min(2.5,Number(el.value)||1.2));ovScaleSet=true;}else if(key==='rank')ov.rank=el.value;else if(key==='suit')ov.suit=el.value;else if(key==='side')ov.side=el.value;
 if(ov.on&&ovState==='idle')void ovLoad();else ovSync();
});});
// The overlay is drawn for the frame the film actually shows: on every presented frame where the browser
// reports them, and after every seek, so stepping one frame moves film and card together.
const ovWatch=(video:HTMLVideoElement,draw:(frame?:number)=>void,fps:()=>number)=>{
 const tick=(_now:number,meta:{mediaTime:number})=>{if(ov.on&&ovState==='ready')draw(Math.round(meta.mediaTime*fps()));(video as never as {requestVideoFrameCallback(fn:typeof tick):void}).requestVideoFrameCallback(tick);};
 if('requestVideoFrameCallback' in video)(video as never as {requestVideoFrameCallback(fn:typeof tick):void}).requestVideoFrameCallback(tick);
 for(const type of ['seeked','loadeddata'])video.addEventListener(type,()=>{if(ov.on&&ovState==='ready')draw();});
};
ovWatch(kbPlayer,ovTake,()=>ovTakeNow()?.fps??30);
for(const video of kbVideos)ovWatch(video,frame=>{if(video===kbVideos[kbChain.active])ovChain(frame);},()=>ovSegmentNow()?.fps??30);
ovSync();

// ── Granskningsbeslut ───────────────────────────────────────────────────────
// Det enda labbet skriver utöver placeringarna: review-blocket i motions/<id>.json, via ett knapptryck.
// Inget skrivs vid inläsning, och varje skrivning visar vad som sparades och var.
let kbNoteFor='',kbSaving=false,kbSaved={id:'',text:'',failed:false};
function paintDecide(t:KbTake|null){
 const box=$('kb-decide');box.hidden=!t;if(!t)return;
 const can=t.stage==='DONE'&&!!t.revision&&!kbSaving,current=t.stage!=='DONE'?'':t.variant?'VARIANT':t.decision,note=$<HTMLTextAreaElement>('kb-note');
 box.querySelectorAll<HTMLButtonElement>('[data-decide]').forEach(b=>{b.disabled=!can||(b.dataset.decide==='PENDING'&&current==='PENDING');b.setAttribute('aria-pressed',String(b.dataset.decide===current));});
 if(kbNoteFor!==t.id){kbNoteFor=t.id;note.value=String(t.motion?.review?.userReview??'').replace(/^\S+ \d{4}-\d{2}-\d{2}: /,'');} // the stored note without its name and date
 note.disabled=!can;
 const state=$('kb-decide-state'),mine=kbSaved.id===t.id;
 state.classList.toggle('saved',mine&&!kbSaved.failed);state.classList.toggle('failed',mine&&kbSaved.failed);
 state.textContent=kbSaving?'Sparar beslutet…':mine?kbSaved.text:t.stage!=='DONE'?'Beslut kan sättas när filmen är klar.':!t.revision?`Kan inte sparas ännu: ${t.id} har ingen post i motions/. Den skapas när klippet registreras.`:`Ett klick sparar beslutet och anteckningen i motions/${t.id}.json. Inget annat i filen ändras.`;
}
async function kbDecide(decision:string){
 const t=kbGraph?.takes[kbTake];if(!t?.revision||t.stage!=='DONE'||kbSaving)return;
 // In the review list a decided film leaves the list, so the film after it opens by itself.
 const lists=tab==='review'?rvLists():null,waiting=lists?[...lists.main,...lists.other,...lists.rejected].map(x=>x.t.id):[],place=waiting.indexOf(t.id),after=place<0?'':waiting[place+1]??waiting[place-1]??'';
 kbSaving=true;paintDecide(t);
 try{
  const res=await fetch(`/api/clip-bank/review/${t.id}`,{method:'PUT',headers:{'content-type':'application/json','if-match':t.revision},body:JSON.stringify({decision,note:$<HTMLTextAreaElement>('kb-note').value})});
  const data=await res.json();if(!res.ok)throw Error(data.error||'Beslutet kunde inte sparas.');
  kbSaved={id:t.id,text:`Sparat i motions/${t.id}.json · ${data.review?.userReview??'återställd: filmen väntar på ditt beslut igen'}`,failed:false};kbNoteFor='';rvNext=after;rvStep=tab==='review'&&decision==='REJECTED'?t.edge:'';
  await kbRead().catch(()=>{}); // the bank is read again so every view shows the decision that is now on disk
 }catch(error){kbSaved={id:t.id,text:`Inte sparat: ${(error as Error).message}`,failed:true};}
 finally{kbSaving=false;if(kbState==='ready')paintBank();}
}
$('kb-decide').addEventListener('click',event=>{const decision=(event.target as Element).closest<HTMLElement>('[data-decide]')?.dataset.decide;if(decision)void kbDecide(decision);});

// ── Granska ─────────────────────────────────────────────────────────────────
// Every finished film that still lacks Jakob's own word, in dealing order. The open row holds the Klippbank's own take detail
// (film, frame stepping, rendered card, findings, decision buttons), moved here while the tab is open: nothing is built twice.
const kbTakeBox=$('kb-take');
let rvHtml='',rvNext='',rvStep='',rvLinked=false,rvEnter=false;
type RvItem={t:KbTake;e:KbEdge};
const rvCard=(e:KbEdge)=>e.target??/(?:P[1-7]|D)\.C[1-3]/.exec(e.id)?.[0]??null; // an experiment is filed with the card it deals or leaves
// Dealing order: the entry, each seat (first card, then second; deal, return to READY, return to IDLE), the dealer, exit and idle, the rest.
function rvKey(e:KbEdge){
 const card=rvCard(e);
 if(e.id==='IDLE>READY')return 0;
 if(!card)return e.experiment?99000:90000+(e.kind==='IDLE'?100:0);
 return (card[0]==='D'?8:Number(card[1]))*1000+Number(card.at(-1))*100+(e.kind==='DEAL'?0:clipGraph!.hubOf(e.to)==='READY'?10:20)+(e.experiment?5:0);
}
const rvGroup=(e:KbEdge)=>{const card=rvCard(e);return card?(card[0]==='D'?'Dealern':card.split('.')[0]):e.experiment?'Variant B och experiment utan kort':e.id==='IDLE>READY'?'Ingång':'Utgång och vila';};
// What a film is, in plain words: who gets the card, which step, and where the film comes from. The id is shown small beside it.
function rvTitle(e:KbEdge,t:KbTake){
 const G=clipGraph!,card=rvCard(e),seat=card?card.split('.')[0]:'',n=card?Number(card.at(-1)):0,old=/arkiv/.test(t.id),b=!!t.hub||/drawn|readyb|idleb/.test(t.id)||/DRAWN|READY-|IDLE-/.test(e.id);
 // A seat film from another series than the plan's (an early "calm" take) says so, or two rows would read the same.
 const series=card?t.id.replace(/^pamela-/,'').split('-').filter(w=>!/^(p\d|d|c\d|plan|deal|return|ready|idle|\d+|drawn|readyb|idleb|arkiv|reveal|edit|slow)$/.test(w)).join(' '):'';
 const who=!card?'':seat==='D'?`Dealerns ${['första','andra','tredje'][n-1]} kort`:`${seat}${n>1?` · kort ${n}`:''}`;
 const step=/REVEAL/.test(e.id)?'kortet vänds upp':e.kind==='DEAL'&&card?'giv':e.kind==='RETURN'&&card?`retur till ${G.hubOf(e.to)==='READY'?'redo':'vila'}`:e.experiment?`${e.from} → ${e.to}`:e.kind==='ENTRY'?'Ingång · från vila till skon':e.kind==='IDLE'?'Vila · stilla klipp':'Utgång · från skon till vila';
 const tags=[old?'ur gamla labbet':'',b?'variant B':'',e.experiment&&!b?'experiment':'',t.editOf?'rättad kopia':'',t.segment&&!old?'utsnitt':'',t.speed!==1?'slow motion':'',series?`serie ”${series}”`:''].filter(Boolean),no=Number(/-(\d+)$/.exec(t.id)?.[1]??0);
 return [who,step,...tags,no>1||(no&&!tags.length)?`tagning ${no}`:''].filter(Boolean).join(' · ');
}
function rvLists(){
 const all:RvItem[]=kbGraph?[...kbGraph.edges,...kbGraph.experiments].flatMap(e=>e.takes.filter(t=>t.stage==='DONE').map(t=>({t,e}))).sort((a,b)=>rvKey(a.e)-rvKey(b.e)||a.t.order-b.t.order):[];
 const open=all.filter(x=>!x.t.motion?.review?.userReview);
 // What matters is the films the bank needs: the main take of every needed step. Those he has not decided lead the list; other takes,
 // variants and experiments wait folded, and what the reviewers have already rejected comes last.
 const needed=kbGraph?kbGraph.summary.films.required.map(id=>kbGraph!.edge[id]):[],mains=new Set(needed.flatMap(e=>e.main?[e.main.id]:[]));
 const word=(e:KbEdge)=>e.main?.motion?.review?.userReview;
 return {main:open.filter(x=>mains.has(x.t.id)),other:open.filter(x=>!mains.has(x.t.id)&&x.t.decision!=='REJECTED'),rejected:open.filter(x=>x.t.decision==='REJECTED'),done:all.filter(x=>!!x.t.motion?.review?.userReview),
  tally:{total:needed.length,approved:needed.filter(e=>word(e)&&e.main!.decision==='ACCEPTED').length,waiting:needed.filter(e=>e.main&&!word(e)).length,missing:needed.filter(e=>!e.main).length,settled:needed.filter(e=>word(e)&&e.main!.decision!=='ACCEPTED').length}};
}
function rvOpen(id:string){
 const t=kbGraph?.takes[id];if(!t)return;
 const e=kbGraph!.edge[t.edge];kbEdge=e.id;kbTake=t.id;if(!e.experiment)kbNode=kbHub(e);kbPanel='edge';kbPendingFrame=null;kbPlayer.pause();paintBank();kbLink();
}
function paintReview(){
 const ready=kbState==='ready'&&!!kbGraph&&!!clipGraph;
 if(!ready){$('tab-review').textContent='Granska';if(tab==='review'){$('rv-notice').hidden=false;$('rv-notice').textContent=kbState==='local'?'Granskningslistan finns bara lokalt. Öppna det lokala labbet (START.cmd).':kbState==='error'?'Klippbanken kunde inte läsas. Starta om den lokala förhandsvisningen (STOPP.cmd och sedan START.cmd).':'Läser klippbanken…';}return;}
 const G=clipGraph!,{main,other,rejected,done,tally}=rvLists(),todo=[...main,...other],all=[...todo,...rejected,...done];
 $('tab-review').textContent=`Granska · ${main.length}`;
 if(tab!=='review')return;
 $('rv-notice').hidden=true;
 // Which film is open: the one a link names, the one after a decision just made, the one already open, else the first one waiting.
 if(!rvLinked){rvLinked=true;rvNext=new URLSearchParams(location.search).get('take')??'';}
 // After a rejection the next best take of the same step, if there is one, has taken its place among the main films: that one opens.
 const heir=rvStep?kbGraph!.edge[rvStep]?.main:null,want=heir&&main.some(x=>x.t.id===heir.id)?heir.id:rvNext,enter=rvEnter;rvNext='';rvStep='';rvEnter=false; // coming into the tab starts at the top of the list
 const next=(want&&all.find(x=>x.t.id===want))||(!enter&&all.some(x=>x.t.id===kbTake)?null:todo[0]??rejected[0]??done[0]??null);
 if(next&&next.t.id!==kbTake){rvOpen(next.t.id);return;}
 // The coverage measured for each film is read once, in the background, and the list is painted again when it is all in.
 const unread=all.filter(x=>x.t.media.track&&!ovData.has(x.t.id)&&!ovReading.has(x.t.id));
 if(unread.length)void Promise.all(unread.map(x=>ovRead(x.t))).then(()=>{if(tab==='review'&&kbState==='ready')paintReview();});
 const word=(t:KbTake)=>t.variant?'godkänd som variant':G.DECISION_LABEL[t.decision]??t.decision;
 const row=({t,e}:RvItem)=>{const open=t.id===kbTake,r=t.motion?.review,mine=r?.userReview;
  return `<article class="rv-row${open?' open':''}"><button class="rv-row-head" data-rv-open="${esc(t.id)}" aria-expanded="${open}"><span class="rv-title">${esc(rvTitle(e,t))}</span><span class="status-pill d-${esc(t.decision)}">${esc(`${mine?'ditt beslut':'granskarna'}: ${word(t)}`)}</span>${t.revision?'':'<span class="status-pill">kan inte sparas ännu</span>'}${ovData.get(t.id)?.coverage?`<span class="status-pill${ovData.get(t.id)!.coverage!.covered?' d-ACCEPTED':''}">renderat kort: ${esc(ovCovers(ovData.get(t.id)!.coverage!))}</span>`:''}<code>${esc(t.id)}</code></button>`
   +(open?'<div id="rv-slot" class="rv-slot"></div>':`<div class="rv-find">${mine?`<p><b>Dina ord</b>${esc(mine)}</p>`:''}${r?.basis?`<p><b>Granskaren</b>${esc(r.basis)}</p>`:''}${r?.limitations?`<p><b>Begränsning</b>${esc(r.limitations)}</p>`:''}</div>`)+'</article>';};
 const list=(items:RvItem[])=>{let last='';return items.map(x=>{const g=rvGroup(x.e),head=g===last?'':`<h3 class="rv-group">${esc(g)}</h3>`;last=g;return head+row(x);}).join('');};
 const html=[list(main),list(rejected),list(done),list(other)];
 $('rv-count').textContent=`Av de ${tally.total} filmer som behövs är ${tally.approved} godkända, ${tally.waiting} väntar på dig och ${tally.missing} saknas${tally.settled?` (${tally.settled} har du bedömt utan att godkänna)`:''}. ${main.length?'Titta på filmen, skriv gärna en rad och tryck Godkänn, Variant eller Underkänn: nästa film öppnas då av sig själv.':'Ingen huvudfilm väntar på ditt beslut just nu.'}`;
 $('rv-main-title').textContent=`Huvudfilmer som väntar på dig (${main.length})`;
 $('rv-other').hidden=!other.length;$('rv-other-summary').textContent=`Övriga tagningar (${other.length}) · andra tagningar, varianter, variant B och experiment`;
 $('rv-saved').hidden=!kbSaved.id||kbSaved.failed;$('rv-saved').textContent=kbSaved.failed?'':kbSaved.text;
 $('rv-rejected').hidden=!rejected.length;$('rv-rejected-summary').textContent=`Redan underkända av granskarna (${rejected.length}) · väntar också på ditt ord`;
 $('rv-done').hidden=!done.length;$('rv-done-summary').textContent=`Avgjorda (${done.length}) · öppna en film för att ändra beslutet`;
 if(html.join('\u0000')!==rvHtml){
  // The lists are rebuilt only when they change, and never with the take detail inside them.
  rvHtml=html.join('\u0000');$('kb-take-home').append(kbTakeBox);
  $('rv-list').innerHTML=html[0];$('rv-rejected-list').innerHTML=html[1];$('rv-done-list').innerHTML=html[2];$('rv-other-list').innerHTML=html[3];
 }
 if(rejected.some(x=>x.t.id===kbTake))$<HTMLDetailsElement>('rv-rejected').open=true;
 if(other.some(x=>x.t.id===kbTake))$<HTMLDetailsElement>('rv-other').open=true;
 if(done.some(x=>x.t.id===kbTake))$<HTMLDetailsElement>('rv-done').open=true;
 document.getElementById('rv-slot')?.append(kbTakeBox);
}
$('review').addEventListener('click',event=>{const id=(event.target as Element).closest<HTMLElement>('[data-rv-open]')?.dataset.rvOpen;if(id&&id!==kbTake)rvOpen(id);});

// ── Prov ────────────────────────────────────────────────────────────────────
// Färdiga jämförelsefilmer och bildark under assets/proofs/<id>/, lästa via /api/proofs. Samma rutstegning som överallt annars.
type Proof={id:string;title:string|null;description:string|null;labels:Record<string,string>|null;chapters:{label:string;frame:number}[]|null;fps:number;files:{name:string;path:string;kind:string;bytes:number}[]};
// Text for proofs that do not describe themselves; a proof.json with title, description, labels and chapters goes first.
const PROOF_TEXT:Record<string,{title:string;description:string;labels:Record<string,string>;chapters:{label:string;frame:number}[]}>={'card-overlay':{title:'Renderat kort ovanpå filmen — en film, två kortplatser',
 description:'Samma film i alla prov: given till P4.C1 och returen till READY. Filmens gula och blå kortyta är ersatt av ett renderat kort. B2 lägger kort 1 på P4.C1 från start och flyttar det utdelade kortet till P4.C2 med samma film.',
 labels:{'jamforelse.mp4':'Jämförelse · råfilm | B1 | B2','ra.mp4':'Råfilm','b1-samma-plats.mp4':'B1 · samma plats','b2-kort-2.mp4':'B2 · kort 2 från samma film','b2-dubbel.mp4':'Stressprov · dubbel förskjutning','b2-motsatt.mp4':'Stressprov · motsatt håll','sparning-giv.mp4':'Spårningen på givfilmen'},
 chapters:[{label:'Ur skon',frame:14},{label:'Kantläge',frame:51},{label:'Landning',frame:88},{label:'Skarv',frame:103},{label:'Handen lämnar',frame:125}]}};
let proofs:Proof[]=[],pfState:'idle'|'loading'|'ready'|'local'='idle',pfLinked=false,pfId='',pfFile='',pfPending:number|null=null;
const pfPlayer=$<HTMLVideoElement>('pf-player');
const pfProof=()=>proofs.find(p=>p.id===pfId);
const pfLabel=(p:Proof,name:string)=>p.labels?.[name]??PROOF_TEXT[p.id]?.labels[name]??name.replace(/\.(?:mp4|png)$/,'').replaceAll('-',' ');
const pfClip=()=>{const fps=pfProof()?.fps??30;return {fps,frames:Math.max(1,Math.round((pfPlayer.duration||0)*fps))};};
function pfShowFrame(){const c=pfClip();$('pf-frame').textContent=pfPlayer.duration?`Ruta ${frameAt(pfPlayer,c.fps,c.frames)} / ${c.frames-1} · ${c.fps} fps`:'';}
function pfSeek(frame:number){if(!Number.isSafeInteger(frame))return;pfPlayer.pause();if(pfPlayer.readyState<1){pfPending=frame;return;}const c=pfClip();pfPlayer.currentTime=frameTime(Math.max(0,Math.min(c.frames-1,frame)),c.fps);pfPending=null;pfShowFrame();}
async function openProofs(){
 if(pfState==='loading')return;
 pfState='loading';
 try{const res=await fetch('/api/proofs');if(!res.ok)throw Error();const list=(await res.json()).proofs;if(!Array.isArray(list))throw Error();proofs=list;pfState='ready';}catch{proofs=[];pfState='local';}
 // lab.html?tab=prov&proof=card-overlay[&file=jamforelse.mp4&frame=103]
 if(!pfLinked&&pfState==='ready'){pfLinked=true;const p=new URLSearchParams(location.search),frame=Number(p.get('frame'));pfId=p.get('proof')??'';pfFile=p.get('file')??'';pfPending=Number.isSafeInteger(frame)&&frame>0?frame:null;}
 paintProofs();kbLink();
}
function paintProofs(){
 const ready=pfState==='ready'&&proofs.length>0,p=ready?pfProof()??proofs[0]:undefined;
 $('pf-notice').hidden=ready;$('pf-notice').textContent=pfState==='local'?'Proven finns bara lokalt. Öppna det lokala labbet (START.cmd).':pfState==='ready'?'Inga prov finns ännu under assets/proofs/.':'Läser prov…';
 $('pf-body').hidden=!p;
 $('pf-folders').innerHTML=proofs.map(x=>`<button class="film-choice" data-proof="${esc(x.id)}" aria-pressed="${x===p}"><strong>${esc(x.title??PROOF_TEXT[x.id]?.title??x.id)}</strong><span>${x.files.filter(f=>f.kind==='video').length} filmer · ${x.files.filter(f=>f.kind==='image').length} bilder</span></button>`).join('');
 if(!p)return;
 // Films in the order the proof names them (the comparison first), anything unnamed after that.
 const order=Object.keys(p.labels??PROOF_TEXT[p.id]?.labels??{}),rank=(name:string)=>(order.indexOf(name)+1)||order.length+1,videos=p.files.filter(f=>f.kind==='video').sort((a,b)=>rank(a.name)-rank(b.name));
 pfId=p.id;const file=videos.find(f=>f.name===pfFile)??videos[0];pfFile=file?.name??'';
 $('pf-id').textContent=`PROV · ${p.id}`;$('pf-title').textContent=p.title??PROOF_TEXT[p.id]?.title??p.id;$('pf-note').textContent=p.description??PROOF_TEXT[p.id]?.description??'';
 $('pf-files').innerHTML=videos.map(f=>`<button class="kb-take-tab" data-file="${esc(f.name)}" aria-pressed="${f===file}" title="${esc(f.name)}"><b>${esc(pfLabel(p,f.name))}</b><span>${esc(f.name)} · ${(f.bytes/1048576).toFixed(1).replace('.',',')} MB</span></button>`).join('');
 if(file&&pfPlayer.dataset.src!==file.path){pfPlayer.pause();pfPlayer.dataset.src=file.path;pfPlayer.src=file.path;pfPlayer.load();}
 $('pf-chapters').innerHTML=(p.chapters??PROOF_TEXT[p.id]?.chapters??[]).filter(c=>Number.isSafeInteger(c?.frame)&&c.frame>=0).map(c=>`<button data-frame="${c.frame}" title="Ruta ${c.frame}">${esc(c.label)} · ${c.frame}</button>`).join('');
 $('pf-sheets').innerHTML=p.files.filter(f=>f.kind==='image').map(f=>`<figure><a href="${esc(f.path)}" target="_blank" rel="noopener" title="Öppna i full storlek"><img src="${esc(f.path)}" alt="${esc(pfLabel(p,f.name))}" loading="lazy"></a><figcaption>${esc(pfLabel(p,f.name))}</figcaption></figure>`).join('');
 pfShowFrame();
}
$('pf-folders').addEventListener('click',event=>{const id=(event.target as Element).closest<HTMLElement>('[data-proof]')?.dataset.proof;if(id){pfId=id;pfFile='';pfPending=null;paintProofs();kbLink();}});
$('pf-files').addEventListener('click',event=>{const name=(event.target as Element).closest<HTMLElement>('[data-file]')?.dataset.file;if(name){pfFile=name;pfPending=null;paintProofs();kbLink();}});
$('pf-chapters').addEventListener('click',event=>{const frame=(event.target as Element).closest<HTMLElement>('[data-frame]')?.dataset.frame;if(frame!==undefined)pfSeek(Number(frame));});
$('pf-play').addEventListener('click',()=>{if(pfPlayer.paused)void pfPlayer.play().catch(()=>{});else pfPlayer.pause();});
for(const [id,step] of [['pf-prev',-1],['pf-next',1]] as const)$(id).addEventListener('click',()=>{const c=pfClip();pfSeek(frameAt(pfPlayer,c.fps,c.frames)+step);});
$('pf-speed').addEventListener('change',()=>{pfPlayer.playbackRate=kbSpeed('pf-speed');});
pfPlayer.addEventListener('loadedmetadata',()=>{pfPlayer.playbackRate=kbSpeed('pf-speed');if(pfPending!==null)pfSeek(pfPending);else pfShowFrame();});
for(const event of ['timeupdate','seeked'])pfPlayer.addEventListener(event,pfShowFrame);
for(const event of ['play','pause','ended'])pfPlayer.addEventListener(event,()=>{$('pf-play').textContent=pfPlayer.paused?'Spela':'Pausa';});
$('tab-placement').addEventListener('click',()=>setTab('placement'));$('tab-clipbank').addEventListener('click',()=>setTab('clipbank'));$('tab-proofs').addEventListener('click',()=>setTab('proofs'));
// The 3D scene is a page of its own, served by the local preview only: its link shows when the page is there.
if(location.hostname==='127.0.0.1')void fetch('scene3d.html',{method:'HEAD'}).then(res=>{$('nav-scene3d').hidden=!res.ok;}).catch(()=>{});
const startTab=new URLSearchParams(location.search).get('tab');if(startTab==='klippbank')setTab('clipbank');else if(startTab==='prov')setTab('proofs');else if(startTab==='granska')setTab('review');
// On the local lab the bank is read once at start, so the Granska tab can say how many films are waiting.
else if(location.hostname==='127.0.0.1')void openClipBank();
void load().then(()=>{const params=new URLSearchParams(location.search),clip=params.get('clip'),frame=Number(params.get('frame')??0);if(clip)void openLibrary(false,clip,frame);if(tab==='clipbank'&&kbState==='ready')paintTree();}).catch(e=>message((e as Error).message));
