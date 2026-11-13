export type View = 'native' | 'portrait';
export type Hand = 'LH' | 'RH';
export type Side = 'BACK' | 'FRONT';
export type Point = { u: number; v: number };
export type Geometry = Point & { width: number; height: number; angle: number; taper: number; reviewed: boolean };
// grip: how the card leaves the shoe. PINCH = pinched in the shoe's window and lifted (anchor 2, position 1); DRAG = fingertips
// on the card in the shoe's mouth, slid out along the felt (anchor 2, position 2). turnAt: where a turned card is turned, on the
// way (AIR) or at its place on the felt (PLACE); it only means something when turn is true. A card turned later needs no value
// of its own: it is turn=false with endSide equal to startSide (closed), as the dealer's second card is.
export type Grip = 'PINCH' | 'DRAG';
export type TurnAt = 'AIR' | 'PLACE';
export type Intent = { takeHand: Hand; startSide: Side; endSide: Side; pass: boolean; turn: boolean; grip: Grip; turnAt: TurnAt };
export const GRIPS: readonly Grip[] = ['PINCH','DRAG'];
export const TURN_PLACES: readonly TurnAt[] = ['AIR','PLACE'];
// Plans saved before grip and turnAt existed lack them; validatePlan fills these in when a plan is read.
export const INTENT_DEFAULTS: Readonly<Pick<Intent,'grip'|'turnAt'>> = Object.freeze({grip:'PINCH',turnAt:'AIR'});
export type Target = { geometry: Record<View, Geometry>; intent: Intent; material: { bend: number; gloss: number } };
export type TableProjection = { mode:'flat'|'individual'; heading:number };
export type PlacementPlan = { schemaVersion: 1; id: 'pamela-table'; space: 'image-normalized-bottom-up'; updatedAt: string | null; shoe: Record<View, Point>; targets: Record<string, Target>; tableProjection?:TableProjection };
export const PLANE_HEADINGS=[-90,-45,-15,0,15,45,90] as const;
export const VIEWS = { native: { width: 1762, height: 1174, label: 'Dator', profileId: 'v6-native', background: 'assets/lab/native.jpg' }, portrait: { width: 1080, height: 1920, label: 'Mobil', profileId: 'v6-portrait', background: 'assets/lab/portrait.jpg' } } as const;
// The neutral backdrop of the studio's Placering view (Jakob 2026-11-13: no dealer's picture, and the table the studio uses):
// the 3D scene's table at its home view, a neutral figure and the bank's shoe, in the view's own pixels. Built by
// tools/placement-backdrop.ts with a receipt beside it; outside Git like all media. Only Dator has one: the scene has no home
// view that matches the Mobil view's pixels (a separate V6 composition), so Mobil keeps its V6 picture.
export const NEUTRAL_BACKDROP = { native: 'assets/lab/placement-backdrop/native.jpg' } as const;
export const TARGETS = [...Array.from({length:7},(_,i)=>`P${i+1}`),'D'].flatMap(p=>[`${p}.C1`,`${p}.C2`]);
export const PLAYER_TARGETS = TARGETS.filter(id=>id[0]==='P');
// The card standing in the shoe's window in the lab's two background pictures: its corners in the picture's pixels, clockwise
// from the upper one. The pictures show the game's own card back there (black and gold); the lab paints the place yellow, the
// colour a closed card has in the films and in the plan (Jakob 2026-11-11). Measured in assets/lab/native.jpg and portrait.jpg.
export const SHOE_CARD: Readonly<Record<View, readonly {x:number;y:number}[]>> = {
 native:[{x:1298,y:757.5},{x:1337,y:780},{x:1285,y:854},{x:1244,y:829}],
 portrait:[{x:922.5,y:763.5},{x:955,y:777.5},{x:904.5,y:849.5},{x:867.5,y:826.5}],
};
export const otherHand = (h: Hand): Hand => h==='LH'?'RH':'LH';
export const otherSide = (s: Side): Side => s==='BACK'?'FRONT':'BACK';
export function toPixels(point: Point, view: View) { const p=VIEWS[view]; return { x:point.u*(p.width-1), y:(1-point.v)*(p.height-1) }; }
export function fromPixels(x: number,y: number,view: View): Point { const p=VIEWS[view];return {u:x/(p.width-1),v:1-y/(p.height-1)}; }
export function angleToward(from: Point,to: Point,view: View): number {
 const a=toPixels(from,view),b=toPixels(to,view);
 if(Math.hypot(b.x-a.x,b.y-a.y)<.001)return 0;
 const degrees=Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI+90;
 return ((degrees+540)%360)-180;
}
// A single projective plane derived from P4. Saving this visual projection
// does not make it a camera calibration; that still needs measured correspondences.
export function flatQuad(g: Geometry, reference: Geometry, view: View, heading=0) {
 const p=VIEWS[view],origin=toPixels(reference,view),wanted=toPixels(g,view);
 const w=reference.width*(p.width-1)/2,h=reference.height*(p.height-1)/2;
 const k=(reference.taper-1)/(reference.taper+1),roll=reference.angle*Math.PI/180,a=heading*Math.PI/180;
 const project=(x:number,y:number)=>{const d=1+k*y,X=w*(1+k)*x/d,Y=h*(y+k)/d;return {x:origin.x+X*Math.cos(roll)-Y*Math.sin(roll),y:origin.y+X*Math.sin(roll)+Y*Math.cos(roll)};};
 const dx=wanted.x-origin.x,dy=wanted.y-origin.y,lx=dx*Math.cos(roll)+dy*Math.sin(roll),ly=-dx*Math.sin(roll)+dy*Math.cos(roll);
 let cy=(ly/h-k)/(1-k*ly/h),cx=lx*(1+k*cy)/(w*(1+k));
 const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>({x:x*Math.cos(a)-y*Math.sin(a)/.714,y:x*Math.sin(a)*.714+y*Math.cos(a)}));
 const shape=(x:number,y:number)=>corners.map(q=>project(x+q.x,y+q.y));
 const centre=(x:number,y:number)=>shape(x,y).reduce((s,q)=>({x:s.x+q.x/4,y:s.y+q.y/4}),{x:0,y:0});
 // Preserve the existing image centre, including P4's exact original corners.
 for(let i=0;i<8;i++){const c=centre(cx,cy),ex=wanted.x-c.x,ey=wanted.y-c.y;if(Math.hypot(ex,ey)<1e-8)break;const e=.0001,px=centre(cx+e,cy),py=centre(cx,cy+e),xx=(px.x-c.x)/e,xy=(py.x-c.x)/e,yx=(px.y-c.y)/e,yy=(py.y-c.y)/e,d=xx*yy-xy*yx;cx+=(ex*yy-ey*xy)/d;cy+=(ey*xx-ex*yx)/d;}
 return shape(cx,cy);
}
export function snapPoint(point: Point, view: View, step: number): Point {
 if(step<=0)return {...point};const p=toPixels(point,view),v=VIEWS[view];
 return fromPixels(Math.max(0,Math.min(v.width-1,Math.round(p.x/step)*step)),Math.max(0,Math.min(v.height-1,Math.round(p.y/step)*step)),view);
}
// The step that takes the card from the shoe: TAKE (pinch and lift) or DRAG (slid out along the felt); the place of a turn.
const takeStep=(intent:Intent)=>intent.grip==='DRAG'?'DRAG':'TAKE';
const turnPlace=(intent:Intent)=>intent.turnAt==='PLACE'?'PLACE':'AIR';
export function motionNodes(id:string,intent:Intent){const hand=intent.pass?otherHand(intent.takeHand):intent.takeHand;
 return [{id:'ready',label:'SHOE_READY',detail:intent.startSide}, {id:'take',label:takeStep(intent),detail:intent.takeHand},...(intent.pass?[{id:'pass',label:'PASS',detail:`${intent.takeHand} → ${hand}`}]:[]),...(intent.turn?[{id:'turn',label:'TURN',detail:`${intent.startSide} → ${intent.endSide} · ${turnPlace(intent)}`}]:[]),{id:'land',label:'LAND',detail:`${id} · ${intent.endSide}`},{id:'release',label:'RELEASE',detail:hand},{id:'return',label:'RETURN',detail:'SHOE_READY'}];
}
export function quad(g: Geometry, view: View) {
 const p=VIEWS[view],c=toPixels(g,view),w=g.width*(p.width-1)/2,h=g.height*(p.height-1)/2,a=g.angle*Math.PI/180;
 return [[-w*g.taper,-h],[w*g.taper,-h],[w,h],[-w,h]].map(([x,y])=>({x:c.x+x*Math.cos(a)-y*Math.sin(a),y:c.y+x*Math.sin(a)+y*Math.cos(a)}));
}
export function constrain(g: Geometry,view: View): Geometry {
 const p=VIEWS[view],q=quad(g,view),xs=q.map(p=>p.x),ys=q.map(p=>p.y);
 const dx=Math.max(0,-Math.min(...xs))-Math.max(0,Math.max(...xs)-(p.width-1));
 const dy=Math.max(0,-Math.min(...ys))-Math.max(0,Math.max(...ys)-(p.height-1));
 return {...g,u:g.u+dx/(p.width-1),v:g.v-dy/(p.height-1)};
}
export function sequence(id: string, intent: Intent) {
 const hand=intent.pass?otherHand(intent.takeHand):intent.takeHand;
 return [`${id} | ${takeStep(intent)}(${intent.takeHand},${intent.startSide})`,...(intent.pass?[`PASS(${intent.takeHand}>${hand},${intent.startSide})`]:[]),...(intent.turn?[`TURN(${hand},${intent.startSide}>${intent.endSide},${turnPlace(intent)})`]:[]),`LAND(${intent.endSide})`,`RELEASE(${hand})`,`RETURN(SHOE_READY)`].join(' > ');
}
// One-click dealing techniques of the lab's Rörelse panel. Each sets how the card is taken and turned and its two sides; which
// hand takes it and a hand change (PASS) are separate choices and are left as they are, so a technique can be combined with PASS.
export const TECHNIQUES = {
 'pinch-air':{grip:'PINCH',startSide:'BACK',endSide:'FRONT',turn:true,turnAt:'AIR'},
 'drag-place':{grip:'DRAG',startSide:'BACK',endSide:'FRONT',turn:true,turnAt:'PLACE'},
 'drag-closed':{grip:'DRAG',startSide:'BACK',endSide:'BACK',turn:false,turnAt:'AIR'},
} as const satisfies Record<string,Omit<Intent,'takeHand'|'pass'>>;
export type Technique = keyof typeof TECHNIQUES;
export function applyTechnique(intent: Intent, name: Technique): Intent { return {...intent,...TECHNIQUES[name]}; }
// The technique an intent follows, if any; where a card is not turned, the place of a turn does not count.
export function techniqueOf(intent: Intent): Technique | null {
 return (Object.keys(TECHNIQUES) as Technique[]).find(name=>Object.entries(TECHNIQUES[name]).every(([key,value])=>(key==='turnAt'&&!intent.turn)||intent[key as keyof Intent]===value))??null;
}
// Copies one card's motion choices (intent) or material to other cards. Returns a new plan; the given one is left alone.
export function copyChoices(plan: PlacementPlan, from: string, key: 'intent' | 'material', to: readonly string[]): PlacementPlan {
 const source=plan.targets[from];if(!source)throw Error('Välj ett kort att kopiera från.');
 const next=structuredClone(plan);
 for(const id of to){if(!next.targets[id])throw Error(`Okänd kortplats ${id}.`);if(key==='intent')next.targets[id].intent={...source.intent};else next.targets[id].material={...source.material};}
 return next;
}
export const CARD_SCALE = { min: .5, max: 2.5, step: .05 } as const;
// Multiplies width and height of every card in one view by one factor. Each card keeps its centre, angle and taper. A card that the
// factor would take past the model's limits (size .005–.25 of the picture, the whole outline inside it) gets the nearest factor that
// fits and is listed in `limited`. A changed place is marked unchecked, as every other geometry edit in the lab does.
export function scaleCards(plan: PlacementPlan, view: View, factor: number): { plan: PlacementPlan; limited: string[] } {
 if(!Number.isFinite(factor)||factor<CARD_SCALE.min||factor>CARD_SCALE.max)throw Error(`Välj en faktor mellan ${CARD_SCALE.min} och ${CARD_SCALE.max}.`);
 const next=structuredClone(plan),limited:string[]=[],p=VIEWS[view];
 for(const id of TARGETS){
  const g=plan.targets[id].geometry[view];let f=factor;
  if(factor>1){
   // The outline's corners move away from the centre in proportion to the factor; stop where the first one meets an edge.
   const c=toPixels(g,view);f=Math.min(f,.25/g.width,.25/g.height);
   for(const q of quad(g,view)){const dx=q.x-c.x,dy=q.y-c.y;
    if(dx>0)f=Math.min(f,(p.width-1-c.x)/dx);else if(dx<0)f=Math.min(f,c.x/-dx);
    if(dy>0)f=Math.min(f,(p.height-1-c.y)/dy);else if(dy<0)f=Math.min(f,c.y/-dy);}
   f=Math.max(1,f);
  }else f=Math.min(1,Math.max(f,.005/g.width,.005/g.height));
  if(Math.abs(f-factor)>1e-9)limited.push(id);
  if(f===1)continue;
  next.targets[id].geometry[view]={...g,width:Math.min(.25,Math.max(.005,g.width*f)),height:Math.min(.25,Math.max(.005,g.height*f)),reviewed:false};
 }
 return {plan:next,limited};
}
// ── Edits of a plan, shared by every page that changes one (the studio's Placering view; the old lab has its own copy inline) ──
// Each returns a new plan and leaves the given one alone. The rules are the old lab's (src/lab-ui.ts): a place that is moved,
// turned or resized is marked unchecked in that view, its outline is kept inside the picture, and a card's sides and TURN agree.
/** A card place (P1.C1 … D.C2) or the shoe's take-off point. */
export type Place = string;
export const SHOE = 'shoe';
const unit = (x: number) => Math.max(0, Math.min(1, x));
const placeOf = (plan: PlacementPlan, id: string) => { const t = plan.targets[id]; if (!t) throw Error(`Okänd kortplats ${id}.`); return t; };
/**
 * The quad a card is drawn with in a view: the plan's own drawing rule, as the game lays its cards (src/game-table.ts). On a flat
 * table (tableProjection.mode 'flat') every card is P4.C1's outline carried over one plane to its own centre (flatQuad); otherwise
 * each card has its own angle, size and taper (quad). A plan without tableProjection is drawn card by card, as the game does.
 */
export function planQuad(plan: PlacementPlan, id: string, view: View) {
 const g = placeOf(plan, id).geometry[view], t = plan.tableProjection;
 return t?.mode === 'flat' ? flatQuad(g, plan.targets['P4.C1'].geometry[view], view, t.heading) : quad(g, view);
}
/**
 * Changes a place's geometry in one view. The shoe has only u and v, each kept within the picture. A card is marked unchecked
 * unless the change is its checked mark itself; size and taper are held to the model's limits, the angle to −180…180, and the
 * whole outline is moved back inside the picture (constrain).
 */
export function editPlace(plan: PlacementPlan, id: Place, view: View, patch: Partial<Geometry>): PlacementPlan {
 const next = structuredClone(plan);
 if (id === SHOE) { const s = next.shoe[view]; if (typeof patch.u === 'number') s.u = unit(patch.u); if (typeof patch.v === 'number') s.v = unit(patch.v); return next; }
 const target = placeOf(next, id), g: Geometry = {...target.geometry[view], ...patch};
 if (!Object.hasOwn(patch, 'reviewed')) g.reviewed = false;
 g.u = unit(g.u); g.v = unit(g.v); g.width = Math.min(.25, Math.max(.005, g.width)); g.height = Math.min(.25, Math.max(.005, g.height));
 g.taper = Math.min(1.6, Math.max(.4, g.taper)); g.angle = g.angle > 180 || g.angle < -180 ? ((g.angle % 360) + 540) % 360 - 180 : g.angle;
 target.geometry[view] = constrain(g, view);
 return next;
}
/** One motion choice of a card. Turning the card and its two sides agree: TURN flips the landing side, a changed side sets TURN. */
export function editIntent<K extends keyof Intent>(plan: PlacementPlan, id: string, key: K, value: Intent[K]): PlacementPlan {
 const next = structuredClone(plan), i = placeOf(next, id).intent;
 i[key] = value;
 if (key === 'turn') i.endSide = i.turn ? otherSide(i.startSide) : i.startSide;
 else if (key === 'startSide' || key === 'endSide') i.turn = i.startSide !== i.endSide;
 return next;
}
/** A card's bend and gloss, held to the model's limits (bend 0–0.18, gloss 0–1). */
export function editMaterial(plan: PlacementPlan, id: string, patch: Partial<Target['material']>): PlacementPlan {
 const next = structuredClone(plan), m = placeOf(next, id).material;
 if (typeof patch.bend === 'number') m.bend = Math.min(.18, Math.max(0, patch.bend));
 if (typeof patch.gloss === 'number') m.gloss = Math.min(1, Math.max(0, patch.gloss));
 return next;
}
/** The table's projection (flat from P4.C1 with a heading, or card by card). Every place in both views is then unchecked. */
export function setTableProjection(plan: PlacementPlan, projection: TableProjection): PlacementPlan {
 if (!['flat','individual'].includes(projection.mode) || !PLANE_HEADINGS.includes(projection.heading as typeof PLANE_HEADINGS[number])) throw Error('Ogiltigt bordperspektiv eller riktning.');
 const next = structuredClone(plan); next.tableProjection = {mode: projection.mode, heading: projection.heading};
 for (const t of Object.values(next.targets)) for (const v of ['native','portrait'] as View[]) t.geometry[v].reviewed = false;
 return next;
}
/** Every player card's angle to 0° in one view (the dealer's two cards are left), unchecked and kept inside the picture. */
export function straightenPlayers(plan: PlacementPlan, view: View): PlacementPlan {
 const next = structuredClone(plan);
 for (const id of PLAYER_TARGETS) next.targets[id].geometry[view] = constrain({...next.targets[id].geometry[view], angle: 0, reviewed: false}, view);
 return next;
}
/** A place snapped to a grid of `step` pixels; a card's angle also to the nearest 5°. */
export function snapPlace(plan: PlacementPlan, id: Place, view: View, step: number): PlacementPlan {
 const next = structuredClone(plan);
 if (id === SHOE) { next.shoe[view] = snapPoint(next.shoe[view], view, step); return next; }
 const target = placeOf(next, id), g = target.geometry[view];
 target.geometry[view] = constrain({...g, ...snapPoint(g, view, step), angle: Math.round(g.angle / 5) * 5, reviewed: false}, view);
 return next;
}
/** A place back to the start proposal (defaultPlan) in one view. */
export function resetPlace(plan: PlacementPlan, id: Place, view: View): PlacementPlan {
 const next = structuredClone(plan), start = defaultPlan();
 if (id === SHOE) next.shoe[view] = structuredClone(start.shoe[view]);
 else { placeOf(next, id); next.targets[id].geometry[view] = structuredClone(start.targets[id].geometry[view]); }
 return next;
}
/** The angle that turns a card toward the dealer: toward the middle of the dealer's two cards. */
export function dealerAngle(plan: PlacementPlan, id: string, view: View): number {
 const a = plan.targets['D.C1'].geometry[view], b = plan.targets['D.C2'].geometry[view];
 return angleToward(placeOf(plan, id).geometry[view], {u: (a.u + b.u) / 2, v: (a.v + b.v) / 2}, view);
}
export function defaultPlan(): PlacementPlan {
 const targets: Record<string,Target>={};
 for(const id of TARGETS){const dealer=id[0]==='D',seat=dealer?3:Number(id[1])-1,second=id.endsWith('2'),v=.08+Math.abs(seat-3)*.025,closed=(dealer&&second)||id==='P4.C2';
  targets[id]={geometry:{native:{u:dealer?.5+(second?.027:0):.13+seat*.12+(second?.025:0),v:dealer?.21:v+(second?.008:0),width:.041,height:.051,angle:0,taper:.9,reviewed:false},portrait:{u:dealer?.47+(second?.048:0):.10+seat*.125+(second?.035:0),v:dealer?.49:.16+Math.abs(seat-3)*.055+(second?.005:0),width:.06,height:.04,angle:0,taper:.9,reviewed:false}},intent:{takeHand:'LH',startSide:'BACK',endSide:closed?'BACK':'FRONT',pass:false,turn:!closed,...INTENT_DEFAULTS},material:{bend:.07,gloss:.35}};
 }
 return {schemaVersion:1,id:'pamela-table',space:'image-normalized-bottom-up',updatedAt:null,shoe:{native:{u:.733,v:.322},portrait:{u:.84,v:.58}},targets,tableProjection:{mode:'flat',heading:0}};
}
function object(v:unknown): v is Record<string,unknown>{return !!v&&typeof v==='object'&&!Array.isArray(v);}
function keys(v:unknown,list:string[]): asserts v is Record<string,unknown>{if(!object(v)||Object.keys(v).sort().join('|')!==list.sort().join('|'))throw Error('Felaktiga fält i placeringsfilen.');}
function number(v:unknown,lo:number,hi:number){if(typeof v!=='number'||!Number.isFinite(v)||v<lo||v>hi)throw Error('Koordinat eller reglage ligger utanför tillåtet intervall.');}
// Checks a plan strictly and, once all of it has passed, fills in the intent keys an older file lacks (grip, turnAt) with their
// defaults, in place: every reader gets a complete plan, and a save or export writes the keys.
export function validatePlan(value: unknown): asserts value is PlacementPlan {
 keys(value,['schemaVersion','id','space','updatedAt','shoe','targets',...(object(value)&&Object.hasOwn(value,'tableProjection')?['tableProjection']:[])]);
 if(Object.hasOwn(value,'tableProjection')){
  keys(value.tableProjection,['mode','heading']);
  if(!['flat','individual'].includes(value.tableProjection.mode as string)||!PLANE_HEADINGS.includes(value.tableProjection.heading as typeof PLANE_HEADINGS[number]))throw Error('Ogiltigt bordperspektiv eller riktning.');
 }
 if(value.schemaVersion!==1||value.id!=='pamela-table'||value.space!=='image-normalized-bottom-up'||!(value.updatedAt===null||(typeof value.updatedAt==='string'&&value.updatedAt.length<40&&Number.isFinite(Date.parse(value.updatedAt)))))throw Error('Okänd placering eller bildrymd.');
 keys(value.shoe,['native','portrait']);keys(value.targets,[...TARGETS]);
 for(const view of ['native','portrait'] as View[]){const s=value.shoe[view];keys(s,['u','v']);number(s.u,0,1);number(s.v,0,1);}
 for(const target of Object.values(value.targets)){
  keys(target,['geometry','intent','material']);keys(target.geometry,['native','portrait']);keys(target.intent,['takeHand','startSide','endSide','pass','turn',...Object.keys(INTENT_DEFAULTS).filter(key=>object(target.intent)&&Object.hasOwn(target.intent,key))]);keys(target.material,['bend','gloss']);
  const i=target.intent;if(typeof i.takeHand!=='string'||typeof i.startSide!=='string'||typeof i.endSide!=='string'||!['LH','RH'].includes(i.takeHand)||!['BACK','FRONT'].includes(i.startSide)||!['BACK','FRONT'].includes(i.endSide)||typeof i.pass!=='boolean'||typeof i.turn!=='boolean'||i.turn!==(i.startSide!==i.endSide))throw Error('Sidbyte kräver TURN; handbyte och kortvändning är skilda val.');
  if(Object.hasOwn(i,'grip')&&!GRIPS.includes(i.grip as Grip))throw Error('Okänt grepp vid skon: PINCH eller DRAG.');
  if(Object.hasOwn(i,'turnAt')&&!TURN_PLACES.includes(i.turnAt as TurnAt))throw Error('Okänd plats för vändningen: AIR eller PLACE.');
  number(target.material.bend,0,.18);number(target.material.gloss,0,1);
  for(const view of ['native','portrait'] as View[]){const g=target.geometry[view];keys(g,['u','v','width','height','angle','taper','reviewed']);number(g.u,0,1);number(g.v,0,1);number(g.width,.005,.25);number(g.height,.005,.25);number(g.angle,-180,180);number(g.taper,.4,1.6);if(typeof g.reviewed!=='boolean')throw Error('Granskningsstatus saknas.');
   const p=VIEWS[view];if(quad(g as Geometry,view).some(q=>q.x<-.01||q.y<-.01||q.x>p.width-1+.01||q.y>p.height-1+.01))throw Error('Hela kortkonturen måste ligga inom bildytan.');
  }
 }
 for(const target of Object.values(value.targets) as {intent:Record<string,unknown>}[])for(const [key,fallback] of Object.entries(INTENT_DEFAULTS))if(!Object.hasOwn(target.intent,key))target.intent[key]=fallback;
}
