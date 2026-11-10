import { VIEWS, TARGETS, defaultPlan, validatePlan, quad, flatQuad, snapPoint, motionNodes, constrain, fromPixels, toPixels, otherHand, otherSide, sequence, angleToward } from './placement-model.js';
import type { PlacementPlan, View, Geometry, Intent, Hand, Side } from './placement-model.js';
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const input=(id:string)=>$<HTMLInputElement>(id);
let plan:PlacementPlan, revision='', savedSignature='', view:View='native', selected='P4.C2', dirty=false, busy=false, materialReady=false, reloadArmed=false;
let history:PlacementPlan[]=[];
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
function changed(){dirty=JSON.stringify(plan)!==savedSignature;reloadArmed=false;$('message').hidden=true;paint(false);}
const target=()=>plan.targets[selected==='shoe'?'P4.C2':selected];
const geometry=()=>target().geometry[view];
function setPanel(name:string){if(selected==='shoe'&&name!=='placement')return;document.querySelectorAll<HTMLButtonElement>('[data-panel]').forEach(b=>{const on=b.dataset.panel===name;b.setAttribute('aria-pressed',String(on));$(`panel-${b.dataset.panel}`).hidden=!on;});if(name==='material')void material();}
async function material(){
 try{if(!materialReady){await import('../materials/source/src/card-material-study.js');materialReady=true;}syncMaterial();}catch{$('cm-status').textContent='3D-materialet kunde inte öppnas. Placeringarna kan fortfarande redigeras.';}
}
function syncMaterial(){const c=window.cardMaterialStudy;if(!c)return;const t=target();c.setBend(t.material.bend);c.setGloss(t.material.gloss);c.showSide(t.intent.endSide==='FRONT'?'front':'back');}
function choose(id:string){stopMotion();selected=id;if(id==='shoe')setPanel('placement');paint();syncMaterial();}
function paint(fields=true){
 if(!plan)return;const p=VIEWS[view],isShoe=selected==='shoe',g=geometry(),t=target(),point=isShoe?plan.shoe[view]:g,px=toPixels(point,view);
 (document.querySelector('.workspace') as HTMLElement).inert=busy;
 $('stage').classList.toggle('portrait',view==='portrait');$<HTMLImageElement>('stage-image').src=p.background;
 $('stage').classList.toggle('solid-cards',input('solid-cards').checked);sizeStage();
 $('board').setAttribute('viewBox',`0 0 ${p.width} ${p.height}`);$('view-size').textContent=`${p.width} × ${p.height} · ${p.profileId}`;
 for(const v of ['native','portrait'])$(`view-${v}`).setAttribute('aria-pressed',String(view===v));
 $('selected-label').textContent=isShoe?'SKO':selected;$('coordinate-readout').textContent=`${Math.round(px.x)}, ${Math.round(px.y)} px · ${view==='native'?'dator':'mobil'}`;
 $('inspector-title').textContent=isShoe?'Skons uttag':`${selected[0]==='D'?'Dealer':`Spelare ${selected[1]}`} · kort ${selected.at(-1)}`;
 $('placement-status').textContent=!isShoe&&g.reviewed?'KONTROLLERAD':'UTKAST';
 $('review-count').textContent=`${TARGETS.filter(id=>plan.targets[id].geometry[view].reviewed).length} av 16 kontrollerade`;
 $('save-state').textContent=busy?'Sparar…':dirty?'Osparade ändringar':plan.updatedAt?'Sparat lokalt':'Startförslag · osparat';
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
 $('plane-note').textContent=input('flat-plane').checked?'Jämförelse: ett plant bord från P4. Samma fysiska kortstorlek och riktning; bildcentrum bevaras. Inte kamerakalibrerat eller sparat.':'Ditt utkast: varje kort har sin sparade rotation och perspektivbredd.';
 $('plane-controls').hidden=!input('flat-plane').checked;
 for(const id of ['angle','angle-number','angle-zero','angle-quarter','angle-centre','straighten','width','height','taper','shape-rectangle'])($<HTMLInputElement|HTMLButtonElement>(id)).disabled=input('flat-plane').checked;
 if(fields){input('coord-u').value=(point.u*100).toFixed(2);input('coord-v').value=(point.v*100).toFixed(2);input('width').value=(g.width*100).toFixed(2);input('height').value=(g.height*100).toFixed(2);input('angle').value=String(g.angle);input('angle-number').value=String(Math.round(g.angle*10)/10);input('taper').value=String(g.taper);input('reviewed').checked=g.reviewed;
  $<HTMLSelectElement>('take-hand').value=t.intent.takeHand;$<HTMLSelectElement>('start-side').value=t.intent.startSide;$<HTMLSelectElement>('end-side').value=t.intent.endSide;input('pass').checked=t.intent.pass;input('turn').checked=t.intent.turn;
 }
 $('angle-value').textContent=`${Math.round(g.angle)}°`;$('taper-value').textContent=`${Math.round(g.taper*100)} %`;
 $('side-back').setAttribute('aria-pressed',String(t.intent.endSide==='BACK'));$('side-front').setAttribute('aria-pressed',String(t.intent.endSide==='FRONT'));
 const h=t.intent.pass?otherHand(t.intent.takeHand):t.intent.takeHand;$('release-hand').textContent=h==='LH'?'Vänster · LH':'Höger · RH';
}
async function load(){const res=await fetch('/api/placements');if(!res.ok)throw Error('Placeringarna kunde inte läsas.');const data=await res.json();validatePlan(data.plan);plan=data.plan;savedSignature=JSON.stringify(plan);revision=data.revision;dirty=false;history=[];paint();}
function editGeometry(key:keyof Geometry,value:number|boolean){checkpoint();if(selected==='shoe'){if(key==='u'||key==='v')plan.shoe[view][key]=Math.max(0,Math.min(1,value as number));}else{const g={...geometry(),[key]:value,reviewed:key==='reviewed'?value:false} as Geometry;target().geometry[view]=constrain(g,view);}changed();paint();}
for(const seat of [...Array.from({length:7},(_,i)=>`P${i+1}`),'D']){
 const row=document.createElement('div');row.className='slot-row';row.innerHTML=`<span class="seat"><b>${seat==='D'?'♦':seat[1]}</b>${seat==='D'?'Dealer':`Spelare ${seat[1]}`}</span>`;
 for(const n of [1,2]){const b=document.createElement('button');b.textContent=String(n);b.dataset.slot=`${seat}.C${n}`;b.setAttribute('aria-label',`${seat} kort ${n}`);b.addEventListener('click',()=>choose(b.dataset.slot!));row.append(b);}$('slot-list').append(row);
}
for(const v of ['native','portrait'] as View[])$(`view-${v}`).addEventListener('click',()=>{stopMotion();view=v;paint();});
document.querySelectorAll<HTMLButtonElement>('[data-panel]').forEach(b=>b.addEventListener('click',()=>setPanel(b.dataset.panel!)));
$('select-shoe').addEventListener('click',()=>choose('shoe'));
for(const id of ['show-all','show-grid','solid-cards','flat-plane','plane-heading'])$(id).addEventListener('change',()=>{stopMotion();paint(false);});
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
$('save').addEventListener('click',async()=>{try{validatePlan(plan);busy=true;paint(false);const res=await fetch('/api/placements',{method:'PUT',headers:{'content-type':'application/json','if-match':revision},body:JSON.stringify(plan)});const data=await res.json();if(!res.ok){if(res.status===409)$('reload').hidden=false;throw Error(data.error||'Det gick inte att spara.');}plan=data.plan;savedSignature=JSON.stringify(plan);revision=data.revision;dirty=false;history=[];$('message').hidden=true;}catch(e){message((e as Error).message);}finally{busy=false;paint();}});
$('reload').addEventListener('click',async()=>{if(dirty&&!reloadArmed){message('Exportera först om du vill behålla ditt utkast. Tryck Läs in igen för att ersätta det.');reloadArmed=true;return;}try{await load();reloadArmed=false;$('reload').hidden=true;$('message').hidden=true;}catch(e){message((e as Error).message);}});
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
 const id=(e.target as Element).closest('[data-target]')?.getAttribute('data-target');if(!id)return;
 if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(id);return;}
 const dirs:Record<string,number[]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};if(!dirs[e.key])return;
 e.preventDefault();selected=id;checkpoint();const rotate=!!(e.target as Element).closest('[data-rotate]');
 if(rotate){const change=(e.shiftKey?15:1)*(e.key==='ArrowLeft'||e.key==='ArrowDown'?-1:1);target().geometry[view]=constrain({...geometry(),angle:((geometry().angle+change+540)%360)-180,reviewed:false},view);}
 else {const p=VIEWS[view],d=dirs[e.key],step=e.shiftKey?10:1,old=id==='shoe'?plan.shoe[view]:geometry(),pos={u:Math.max(0,Math.min(1,old.u+d[0]*step/(p.width-1))),v:Math.max(0,Math.min(1,old.v-d[1]*step/(p.height-1)))};if(id==='shoe')plan.shoe[view]=pos;else target().geometry[view]=constrain({...geometry(),...pos,reviewed:false},view);}
 changed();paint();board.querySelector<SVGElement>(`[data-${rotate?'rotate':'target'}="${id}"]`)?.focus();
});
type Film={id:string;title:string;path:string;kind:string;status:string|null;description?:string;reviewDecision?:string;width:number;height:number;frameCount:number;fps:number};
let films:Film[]=[];
const filmPlayer=$<HTMLVideoElement>('film-player');
function selectFilm(item:Film){
 filmPlayer.pause();filmPlayer.src=item.path;filmPlayer.load();$('film-title').textContent=item.title;
 const decisions:Record<string,string>={PENDING:'VÄNTAR PÅ GRANSKNING',ACCEPTED:'GODKÄND',APPROVED:'GODKÄND',REJECTED:'AVVISAD',UNKNOWN:'STATUS SAKNAS'};
 $('film-status').textContent=item.status==='REFERENCE'?'VALD REFERENS':decisions[item.reviewDecision??'UNKNOWN']??'GRANSKNINGSPROV';
 $('film-info').textContent=`${item.width} × ${item.height} · ${(item.frameCount/item.fps).toFixed(2)} s`;
 $('film-note').textContent=item.description??(item.kind==='diagnostic'?'Grönt inspelningsmaterial med gul–gul-korrigering. Rörelsen är villkorligt godkänd; kanter och överlapp återstår att granska.':'Komponerad V6-referens. Rummet och bordet är redan inlagda i den här filmen.');
 document.querySelectorAll<HTMLButtonElement>('[data-film]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.film===item.id)));
}
async function openLibrary(green=false){
 const dialog=$<HTMLDialogElement>('library');dialog.showModal();
 try{
  const res=await fetch('/api/library');if(!res.ok)throw Error();const data=await res.json();films=data.items;$('film-list').replaceChildren();
  if(!films.length){$('film-list').textContent='Inga filmer finns i det lokala biblioteket ännu.';return;}
  for(const item of films){
   const button=document.createElement('button');button.dataset.film=item.id;button.className='film-choice';
   const label=document.createElement('strong');label.textContent=item.kind==='diagnostic'?'Grön film · gul–gul':item.kind==='reference'?(item.width>item.height?'V6 · dator':'V6 · mobil'):item.title;
   const detail=document.createElement('span');detail.textContent=`${item.width} × ${item.height} · ${(item.frameCount/item.fps).toFixed(1)} s`;
   button.append(label,detail);button.addEventListener('click',()=>selectFilm(item));$('film-list').append(button);
  }
  selectFilm((green?films.find(f=>f.kind==='diagnostic'):null)??films[0]);
 }catch{$('film-list').textContent='Filmbiblioteket kunde inte läsas.';}
}
$('open-library').addEventListener('click',()=>void openLibrary());$('open-green').addEventListener('click',()=>void openLibrary(true));
$('film-play').addEventListener('click',()=>{if(filmPlayer.paused)void filmPlayer.play().catch(()=>$('film-note').textContent='Uppspelningen kunde inte startas. Prova videons inbyggda spelknapp.');else filmPlayer.pause();});
for(const event of ['play','pause','ended'])filmPlayer.addEventListener(event,()=>$('film-play').textContent=filmPlayer.paused?'Spela filmen':'Pausa filmen');
filmPlayer.addEventListener('error',()=>$('film-note').textContent='Filen kunde inte spelas. Kontrollera att filmen finns lokalt.');
$('close-library').addEventListener('click',()=>{$<HTMLDialogElement>('library').close();});
$('library').addEventListener('close',()=>{$('library').querySelectorAll('video').forEach(v=>v.pause());});
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
new ResizeObserver(()=>{if(plan)paint(false);}).observe(stageWrap);
window.addEventListener('resize',()=>{if(plan)paint(false);});
void load().catch(e=>message((e as Error).message));
