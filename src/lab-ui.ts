import { VIEWS, TARGETS, defaultPlan, validatePlan, quad, constrain, fromPixels, toPixels, otherHand, otherSide, sequence } from './placement-model.js';
import type { PlacementPlan, View, Geometry, Intent, Hand, Side } from './placement-model.js';
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const input=(id:string)=>$<HTMLInputElement>(id);
let plan:PlacementPlan, revision='', view:View='native', selected='P4.C2', dirty=false, busy=false, materialReady=false, reloadArmed=false;
let history:PlacementPlan[]=[];
const baseline=defaultPlan();
function message(text:string){$('message').textContent=text;$('message').hidden=false;}
function checkpoint(){history.push(structuredClone(plan));if(history.length>30)history.shift();}
function changed(){dirty=true;reloadArmed=false;$('message').hidden=true;paint(false);}
const target=()=>plan.targets[selected==='shoe'?'P4.C2':selected];
const geometry=()=>target().geometry[view];
function setPanel(name:string){if(selected==='shoe'&&name!=='placement')return;document.querySelectorAll<HTMLButtonElement>('[data-panel]').forEach(b=>{const on=b.dataset.panel===name;b.setAttribute('aria-pressed',String(on));$(`panel-${b.dataset.panel}`).hidden=!on;});if(name==='material')void material();}
async function material(){
 try{if(!materialReady){await import('../materials/source/src/card-material-study.js');materialReady=true;}syncMaterial();}catch{$('cm-status').textContent='3D-materialet kunde inte öppnas. Placeringarna kan fortfarande redigeras.';}
}
function syncMaterial(){const c=window.cardMaterialStudy;if(!c)return;const t=target();c.setBend(t.material.bend);c.setGloss(t.material.gloss);c.showSide(t.intent.endSide==='FRONT'?'front':'back');}
function choose(id:string){selected=id;if(id==='shoe')setPanel('placement');paint();syncMaterial();}
function paint(fields=true){
 if(!plan)return;const p=VIEWS[view],isShoe=selected==='shoe',g=geometry(),t=target(),point=isShoe?plan.shoe[view]:g,px=toPixels(point,view);
 (document.querySelector('.workspace') as HTMLElement).inert=busy;
 $('stage').classList.toggle('portrait',view==='portrait');$<HTMLImageElement>('stage-image').src=p.background;
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
  const tr=plan.targets[id],q=quad(tr.geometry[view],view),c=toPixels(tr.geometry[view],view),active=selected===id,color=tr.intent.endSide==='BACK'?'#fff16a':'#8abcec';
  return `<g class="card-shape ${active?'selected':''}" data-target="${id}" style="--card-color:${color}" role="button" tabindex="0" aria-label="Flytta ${id}"><title>${id} · ${tr.intent.endSide==='BACK'?'stängt':'öppet'}</title><polygon points="${q.map(v=>`${v.x},${v.y}`).join(' ')}"/>${active?q.map(v=>`<circle class="handle" cx="${v.x}" cy="${v.y}" r="${2.8*unit}"/>`).join(''):''}${active||id.endsWith('1')?`<text style="font-size:${10*unit}px" x="${c.x}" y="${Math.max(...q.map(v=>v.y))+15*unit}" text-anchor="middle">${active?id:id.split('.')[0]}</text>`:''}</g>`;
 }).join('');
 const s=toPixels(plan.shoe[view],view),r=6*unit;
 $('contours').insertAdjacentHTML('beforeend',`<g data-target="shoe" class="card-shape ${isShoe?'selected':''}" role="button" tabindex="0" aria-label="Flytta skons uttag" style="--card-color:#dfb9ed"><polygon points="${s.x},${s.y-r} ${s.x+r},${s.y} ${s.x},${s.y+r} ${s.x-r},${s.y}"/><text style="font-size:${10*unit}px" x="${s.x}" y="${s.y-r-6*unit}" text-anchor="middle">SKO</text></g>`);
 $('sequence').textContent=isShoe?'TAKE · gemensam startpunkt i den valda vyn':sequence(selected,t.intent);
 if(fields){input('coord-u').value=(point.u*100).toFixed(2);input('coord-v').value=(point.v*100).toFixed(2);input('width').value=(g.width*100).toFixed(2);input('height').value=(g.height*100).toFixed(2);input('angle').value=String(g.angle);input('taper').value=String(g.taper);input('reviewed').checked=g.reviewed;
  $<HTMLSelectElement>('take-hand').value=t.intent.takeHand;$<HTMLSelectElement>('start-side').value=t.intent.startSide;$<HTMLSelectElement>('end-side').value=t.intent.endSide;input('pass').checked=t.intent.pass;input('turn').checked=t.intent.turn;
 }
 $('angle-value').textContent=`${Math.round(g.angle)}°`;$('taper-value').textContent=`${Math.round(g.taper*100)} %`;
 const h=t.intent.pass?otherHand(t.intent.takeHand):t.intent.takeHand;$('release-hand').textContent=h==='LH'?'Vänster · LH':'Höger · RH';
}
async function load(){const res=await fetch('/api/placements');if(!res.ok)throw Error('Placeringarna kunde inte läsas.');const data=await res.json();validatePlan(data.plan);plan=data.plan;revision=data.revision;dirty=false;history=[];paint();}
function editGeometry(key:keyof Geometry,value:number|boolean){checkpoint();if(selected==='shoe'){if(key==='u'||key==='v')plan.shoe[view][key]=Math.max(0,Math.min(1,value as number));}else{const g={...geometry(),[key]:value,reviewed:key==='reviewed'?value:false} as Geometry;target().geometry[view]=constrain(g,view);}changed();paint();}
for(const seat of [...Array.from({length:7},(_,i)=>`P${i+1}`),'D']){
 const row=document.createElement('div');row.className='slot-row';row.innerHTML=`<span class="seat"><b>${seat==='D'?'♦':seat[1]}</b>${seat==='D'?'Dealer':`Spelare ${seat[1]}`}</span>`;
 for(const n of [1,2]){const b=document.createElement('button');b.textContent=String(n);b.dataset.slot=`${seat}.C${n}`;b.setAttribute('aria-label',`${seat} kort ${n}`);b.addEventListener('click',()=>choose(b.dataset.slot!));row.append(b);}$('slot-list').append(row);
}
for(const v of ['native','portrait'] as View[])$(`view-${v}`).addEventListener('click',()=>{view=v;paint();});
document.querySelectorAll<HTMLButtonElement>('[data-panel]').forEach(b=>b.addEventListener('click',()=>setPanel(b.dataset.panel!)));
$('select-shoe').addEventListener('click',()=>choose('shoe'));
for(const id of ['show-all','show-grid'])$(id).addEventListener('change',()=>paint(false));
for(const [id,key,min,max,factor] of [['coord-u','u',0,100,100],['coord-v','v',0,100,100],['width','width',.5,25,100],['height','height',.5,25,100],['angle','angle',-180,180,1],['taper','taper',.4,1.6,1]] as const){
 let edited=false;
 const commitValue=()=>{edited=false;const value=input(id).valueAsNumber;if(!Number.isFinite(value)||value<min||value>max){message(`Välj ett värde mellan ${min} och ${max}.`);paint();return;}const current=selected==='shoe'&&(key==='u'||key==='v')?plan.shoe[view][key]:geometry()[key];if(value/factor!==current)editGeometry(key,value/factor);};
 input(id).addEventListener(id==='angle'||id==='taper'?'input':'change',commitValue);
 if(id!=='angle'&&id!=='taper'){input(id).addEventListener('input',()=>{edited=true;});input(id).addEventListener('blur',()=>{if(edited)commitValue();});}
}
input('reviewed').addEventListener('change',()=>editGeometry('reviewed',input('reviewed').checked));
function editIntent(key:keyof Intent,value:string|boolean){checkpoint();const i=target().intent;(i as unknown as Record<string,unknown>)[key]=value;
 if(key==='turn')i.endSide=i.turn?otherSide(i.startSide):i.startSide;else if(key==='startSide'||key==='endSide')i.turn=i.startSide!==i.endSide;changed();paint();syncMaterial();}
$('take-hand').addEventListener('change',()=>editIntent('takeHand',$<HTMLSelectElement>('take-hand').value as Hand));
$('start-side').addEventListener('change',()=>editIntent('startSide',$<HTMLSelectElement>('start-side').value as Side));
$('end-side').addEventListener('change',()=>editIntent('endSide',$<HTMLSelectElement>('end-side').value as Side));
for(const id of ['pass','turn'])input(id).addEventListener('change',()=>editIntent(id as 'pass'|'turn',input(id).checked));
for(const [id,key] of [['cm-bend','bend'],['cm-gloss','gloss']] as const)input(id).addEventListener('input',()=>{checkpoint();target().material[key]=input(id).valueAsNumber;changed();});
$('undo').addEventListener('click',()=>{if(history.length){plan=history.pop()!;changed();paint();syncMaterial();}});
$('reset-selected').addEventListener('click',()=>{checkpoint();if(selected==='shoe')plan.shoe[view]=structuredClone(baseline.shoe[view]);else target().geometry[view]=structuredClone(baseline.targets[selected].geometry[view]);changed();paint();});
$('save').addEventListener('click',async()=>{try{validatePlan(plan);busy=true;paint(false);const res=await fetch('/api/placements',{method:'PUT',headers:{'content-type':'application/json','if-match':revision},body:JSON.stringify(plan)});const data=await res.json();if(!res.ok){if(res.status===409)$('reload').hidden=false;throw Error(data.error||'Det gick inte att spara.');}plan=data.plan;revision=data.revision;dirty=false;history=[];$('message').hidden=true;}catch(e){message((e as Error).message);}finally{busy=false;paint();}});
$('reload').addEventListener('click',async()=>{if(dirty&&!reloadArmed){message('Exportera först om du vill behålla ditt utkast. Tryck Läs in igen för att ersätta det.');reloadArmed=true;return;}try{await load();reloadArmed=false;$('reload').hidden=true;$('message').hidden=true;}catch(e){message((e as Error).message);}});
$('export').addEventListener('click',()=>{const blob=new Blob([JSON.stringify(plan,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='pamela-placeringar.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
let drag:{id:string;du:number;dv:number}|null=null;
const board=$<SVGSVGElement & HTMLElement>('board');
function pointer(e:PointerEvent){const r=board.getBoundingClientRect(),p=VIEWS[view];return fromPixels((e.clientX-r.left)/r.width*p.width,(e.clientY-r.top)/r.height*p.height,view);}
board.addEventListener('pointerdown',e=>{if(e.button!==0||busy)return;const id=(e.target as Element).closest('[data-target]')?.getAttribute('data-target');if(!id)return;e.preventDefault();choose(id);checkpoint();const point=id==='shoe'?plan.shoe[view]:geometry(),at=pointer(e);drag={id,du:at.u-point.u,dv:at.v-point.v};board.setPointerCapture(e.pointerId);});
board.addEventListener('pointermove',e=>{if(!drag)return;const at=pointer(e),pos={u:Math.max(0,Math.min(1,at.u-drag.du)),v:Math.max(0,Math.min(1,at.v-drag.dv))};if(drag.id==='shoe')plan.shoe[view]=pos;else plan.targets[drag.id].geometry[view]=constrain({...geometry(),...pos,reviewed:false},view);changed();paint();});
for(const type of ['pointerup','pointercancel'])board.addEventListener(type,()=>{drag=null;});
board.addEventListener('keydown',e=>{const id=(e.target as Element).closest('[data-target]')?.getAttribute('data-target');if(!id)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(id);return;}const dirs:Record<string,number[]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};if(!dirs[e.key])return;e.preventDefault();selected=id;checkpoint();const p=VIEWS[view],d=dirs[e.key],step=e.shiftKey?10:1,old=id==='shoe'?plan.shoe[view]:geometry(),pos={u:Math.max(0,Math.min(1,old.u+d[0]*step/(p.width-1))),v:Math.max(0,Math.min(1,old.v-d[1]*step/(p.height-1)))};if(id==='shoe')plan.shoe[view]=pos;else target().geometry[view]=constrain({...geometry(),...pos,reviewed:false},view);changed();paint();board.querySelector<SVGGElement>(`[data-target="${id}"]`)?.focus();});
$('open-library').addEventListener('click',async()=>{
 const dialog=$<HTMLDialogElement>('library');dialog.showModal();
 try{
  const res=await fetch('/api/library');if(!res.ok)throw Error();const data=await res.json();$('film-list').replaceChildren();
  if(!data.items.length)$('film-list').textContent='Inga filmer finns i det lokala biblioteket ännu.';
  const decisions:Record<string,string>={PENDING:'VÄNTAR PÅ GRANSKNING',ACCEPTED:'GODKÄND',APPROVED:'GODKÄND',REJECTED:'AVVISAD',UNKNOWN:'STATUS SAKNAS'};
  for(const item of data.items){
   const article=document.createElement('article');article.className='film';
   const video=document.createElement('video');video.src=item.path;video.controls=true;video.preload='metadata';video.setAttribute('aria-label',item.title);
   const heading=document.createElement('h3');heading.textContent=item.title;
   const status=document.createElement('span');status.className='status-pill';status.textContent=item.status==='REFERENCE'?'VALD REFERENS':decisions[item.reviewDecision]??'GRANSKNINGSPROV';
   const p=document.createElement('p');p.textContent=`${item.width} × ${item.height} · ${(item.frameCount/item.fps).toFixed(2)} s`;
   article.append(video,heading,status,p);$('film-list').append(article);
  }
 }catch{$('film-list').textContent='Filmbiblioteket kunde inte läsas.';}
});
$('close-library').addEventListener('click',()=>{$<HTMLDialogElement>('library').close();});
$('library').addEventListener('close',()=>{$('library').querySelectorAll('video').forEach(v=>v.pause());});
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
new ResizeObserver(()=>{if(plan)paint(false);}).observe($('stage'));
void load().catch(e=>message((e as Error).message));
