import * as THREE from '../references/card-materials/vendor/three.module.js';

// r167 defines Object3D transforms and renderer.shadowMap dynamically. Describe only
// those public properties here; the unchanged vendor module supplies the other types.
type Spatial<T> = T & { position: InstanceType<typeof THREE.Vector3>; rotation: InstanceType<typeof THREE.Euler> };
type StudyRenderer = InstanceType<typeof THREE.WebGLRenderer> & { shadowMap: { enabled: boolean; type: number } };
type StudyMaterial = InstanceType<typeof THREE.MeshStandardMaterial>;
const StudyMesh = THREE.Mesh as unknown as new (geometry: InstanceType<typeof THREE.BufferGeometry>, material: StudyMaterial | StudyMaterial[]) => Spatial<InstanceType<typeof THREE.Mesh>>;

export const CARD = { width: 2.5, height: 3.5, thickness: 0.025, radius: 0.18, columns: 48, rows: 96, maxBend: 0.18, tableGap: 0.008 } as const;
export const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'] as const;
export const SUITS = ['spades','hearts','diamonds','clubs'] as const;
export type CardValue = { rank: typeof RANKS[number]; suit: typeof SUITS[number] };
export type CardSide = 'front' | 'back';
export type CardLightProfile = 'warm' | 'neutral' | 'cool';
type Phase = 'air' | 'landing' | 'landed';
export type CardStudyState = { card: CardValue; side: CardSide; bend: number; gloss: number; lightProfile: CardLightProfile; phase: Phase; landingProgress: number; effectiveBend: number };
export type CardStudyController = {
  setCard(value: CardValue): void; showSide(side: CardSide): void; setBend(radians: number): void;
  setGloss(value: number): void; setLightProfile(profile: CardLightProfile): void;
  land(): void; lift(): void; getState(): CardStudyState; dispose(): void;
};
declare global { interface Window { cardMaterialStudy?: CardStudyController } }
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, Number.isFinite(value) ? value : low));

// Scout's scout/gaming wordmark and framed mark are read-only design references.
// The yellow SG treatment is this study's requested adaptation, not an official logo asset.
// Paper stays neutral: light colour belongs to the scene, never the face texture.
export const CARD_PRINT = { paper: '#f2f2f2', ink: '#0a0b0d', red: '#a32635', yellow: '#edce39', line: '#bba335' } as const;
export const CARD_LIGHTS = {
  warm: { label: 'Varmt', key: '#ffe0b2', fill: '#f1e8dc', sky: '#ffedda', ground: '#31312e', softbox: '#ffe7c5', bounce: '#b9b1a3' },
  neutral: { label: 'Neutralt', key: '#ffffff', fill: '#e7edf1', sky: '#f1f2f3', ground: '#2e3231', softbox: '#eeeeee', bounce: '#adb3b6' },
  cool: { label: 'Svalt', key: '#d7e8ff', fill: '#dfeaff', sky: '#e2edff', ground: '#2b3038', softbox: '#dbe9ff', bounce: '#a1b4c9' },
} as const;

type ColouredLight = { color: InstanceType<typeof THREE.Color> };
export function applyCardLights(profile: CardLightProfile, key: ColouredLight, fill: ColouredLight, hemisphere: ColouredLight & { groundColor: InstanceType<typeof THREE.Color> }) {
  const light=CARD_LIGHTS[profile];
  key.color.set(light.key);fill.color.set(light.fill);hemisphere.color.set(light.sky);hemisphere.groundColor.set(light.ground);
}

export function paperMaterialParameters(gloss: number) {
  const amount = clamp(gloss, 0, 1);
  return { color: '#ffffff', roughness: 0.7 - amount * 0.26, metalness: 0,
    clearcoat: 0.06 + amount * 0.26, clearcoatRoughness: 0.5 - amount * 0.18,
    specularIntensity: 0.3 + amount * 0.22, envMapIntensity: 0.38, ior: 1.46, iridescence: 0 };
}

export function landingProgressAt(elapsedMilliseconds: number) {
  const t = clamp(elapsedMilliseconds / 1100, 0, 1);
  return t === 1 ? 1 : 1 - Math.pow(1 - t, 3);
}

/** One closed indexed surface: front, back and the connecting paper edge. Units are model units. */
export function createCardSurface(bend = 0) {
  const { width, height, thickness, radius, columns, rows } = CARD;
  const count = (columns + 1) * (rows + 1);
  const positions = new Float32Array(count * 2 * 3), uv = new Float32Array(count * 2 * 2);
  const curvature = clamp(bend, 0, CARD.maxBend) / (height / 2);
  for (let side = 0; side < 2; side++) for (let row = 0; row <= rows; row++) {
    const y = (row / rows - 0.5) * height;
    const cornerY = Math.max(0, Math.abs(y) - (height / 2 - radius));
    const halfWidth = width / 2 - radius + Math.sqrt(Math.max(0, radius * radius - cornerY * cornerY));
    const angle = curvature * y, sine = Math.sin(angle), cosine = Math.cos(angle);
    const centreY = curvature === 0 ? y : sine / curvature;
    const centreZ = curvature === 0 ? 0 : (1 - cosine) / curvature;
    const z = (side === 0 ? 1 : -1) * thickness / 2;
    for (let col = 0; col <= columns; col++) {
      const index = side * count + row * (columns + 1) + col;
      const x = (col / columns * 2 - 1) * halfWidth;
      positions.set([x, centreY - z * sine, centreZ + z * cosine], index * 3);
      const u = (x + width / 2) / width;
      // The reverse is viewed from -Z; mirror its UV, not its readable print.
      uv.set([side === 0 ? u : 1 - u, (y + height / 2) / height], index * 2);
    }
  }
  const indices: number[] = [], groups: { start: number; count: number; materialIndex: number }[] = [];
  for (let side = 0; side < 2; side++) {
    const start = indices.length, offset = side * count;
    for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
      const a = offset + row * (columns + 1) + col, b = a + 1, d = a + columns + 1, c = d + 1;
      indices.push(...(side === 0 ? [a,b,d,b,c,d] : [a,d,b,b,d,c]));
    }
    groups.push({ start, count: indices.length - start, materialIndex: side });
  }
  const perimeter: number[] = [];
  for (let col = 0; col <= columns; col++) perimeter.push(col);
  for (let row = 1; row <= rows; row++) perimeter.push(row * (columns + 1) + columns);
  for (let col = columns - 1; col >= 0; col--) perimeter.push(rows * (columns + 1) + col);
  for (let row = rows - 1; row > 0; row--) perimeter.push(row * (columns + 1));
  const edgeStart = indices.length;
  for (let i = 0; i < perimeter.length; i++) {
    const a = perimeter[i], b = perimeter[(i + 1) % perimeter.length];
    indices.push(a, a + count, b, b, a + count, b + count);
  }
  groups.push({ start: edgeStart, count: indices.length - edgeStart, materialIndex: 2 });
  return { positions, uv, indices: new Uint16Array(indices), groups, faceVertexCount: count };
}

export function createCardGeometry(bend = 0) {
  const data = createCardSurface(bend), geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(data.uv, 2));
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
  for (const group of data.groups) geometry.addGroup(group.start, group.count, group.materialIndex);
  geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}

/** Deterministic presentation pose, with geometric table clearance. No gravity or hand-contact solver. */
export function evaluateCardPose(progress: number, side: CardSide, bend: number) {
  const landing = clamp(progress, 0, 1), effectiveBend = clamp(bend, 0, CARD.maxBend) * (1 - landing);
  const rotation = new THREE.Euler(-0.28 - (Math.PI / 2 - 0.28) * landing, side === 'back' ? Math.PI : 0, 0.065 * (1 - landing));
  const matrix = new THREE.Matrix4().makeRotationFromEuler(rotation).elements;
  const data = createCardSurface(effectiveBend);
  let minimumY = Infinity;
  for (let i = 0; i < data.positions.length; i += 3) minimumY = Math.min(minimumY, matrix[1] * data.positions[i] + matrix[5] * data.positions[i + 1] + matrix[9] * data.positions[i + 2]);
  return { positions: data.positions, effectiveBend, rotation, y: -minimumY + CARD.tableGap + 0.32 * (1 - landing), minimumY };
}

export function validateCard(value: CardValue): CardValue {
  if (!value || !RANKS.includes(value.rank) || !SUITS.includes(value.suit)) throw Error('Kortvärdet måste innehålla giltig rank och suit.');
  return { rank: value.rank, suit: value.suit };
}

const suitGlyph = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' } as const;
function canvas(width: number, height: number) {
  const element = document.createElement('canvas'); element.width = width; element.height = height;
  const context = element.getContext('2d'); if (!context) throw Error('Canvas 2D saknas.');
  return { element, context };
}
function drawWordmark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, ink: string) {
  ctx.font = `600 ${size}px "Segoe UI", Arial, sans-serif`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const parts = [['scout', ink], ['/', CARD_PRINT.yellow], ['gaming', ink]] as const;
  let cursor = x - parts.reduce((sum, [text]) => sum + ctx.measureText(text).width, 0) / 2;
  for (const [text, colour] of parts) { ctx.fillStyle = colour; ctx.fillText(text, cursor, y); cursor += ctx.measureText(text).width; }
}

/** Flat ink only. Highlights and paper grain are supplied by physical material maps. */
export function createCardPrint(value?: CardValue) {
  const { element, context: ctx } = canvas(750, 1050);
  ctx.fillStyle = value ? CARD_PRINT.paper : CARD_PRINT.ink; ctx.fillRect(0, 0, 750, 1050);
  ctx.strokeStyle = value ? '#c7c7c7' : CARD_PRINT.yellow; ctx.lineWidth = value ? 6 : 8;
  ctx.beginPath(); ctx.roundRect(25, 25, 700, 1000, 38); ctx.stroke();
  if (value) {
    // Short yellow rails give the frame definition without competing with the pips.
    ctx.strokeStyle = CARD_PRINT.line; ctx.lineWidth = 7; ctx.lineCap = 'round';
    for (const x of [39, 711]) { ctx.beginPath(); ctx.moveTo(x, 265); ctx.lineTo(x, 785); ctx.stroke(); }
    const brand = () => {
      ctx.fillStyle = CARD_PRINT.ink; ctx.beginPath(); ctx.roundRect(326, 58, 98, 64, 9); ctx.fill();
      ctx.fillStyle = CARD_PRINT.yellow; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '700 42px "Segoe UI", Arial, sans-serif'; ctx.fillText('SG', 375, 91);
      drawWordmark(ctx, 375, 153, 24, CARD_PRINT.ink);
      ctx.strokeStyle = CARD_PRINT.line; ctx.lineWidth = 6;
      for (const [start,end] of [[209,300],[450,541]]) { ctx.beginPath(); ctx.moveTo(start,91); ctx.lineTo(end,91); ctx.stroke(); }
    };
    brand(); ctx.save(); ctx.translate(750, 1050); ctx.rotate(Math.PI); brand(); ctx.restore();
    const glyph = suitGlyph[value.suit], ink = ['hearts','diamonds'].includes(value.suit) ? CARD_PRINT.red : CARD_PRINT.ink;
    ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const corner = () => { ctx.font = '600 89px Georgia, serif'; ctx.fillText(value.rank, 90, 100); ctx.font = '74px "Segoe UI Symbol", serif'; ctx.fillText(glyph, 90, 184); };
    corner(); ctx.save(); ctx.translate(750,1050); ctx.rotate(Math.PI); corner(); ctx.restore();
    const numeric = Number(value.rank);
    if (value.rank === 'A') { ctx.font = '230px "Segoe UI Symbol", serif'; ctx.fillText(glyph,375,525); }
    else if (Number.isInteger(numeric)) {
      const pips: Record<number, [number,number][]> = {
        2:[[0, -0.7],[0,0.7]],3:[[0,-0.7],[0,0],[0,0.7]],
        4:[[-1,-0.7],[1,-0.7],[-1,0.7],[1,0.7]],
        5:[[-1,-0.7],[1,-0.7],[0,0],[-1,0.7],[1,0.7]],
        6:[[-1,-0.7],[1,-0.7],[-1,0],[1,0],[-1,0.7],[1,0.7]],
        7:[[-1,-0.7],[1,-0.7],[0,-0.35],[-1,0],[1,0],[-1,0.7],[1,0.7]],
        8:[[-1,-0.7],[1,-0.7],[0,-0.35],[-1,0],[1,0],[0,0.35],[-1,0.7],[1,0.7]],
        9:[[-1,-0.75],[1,-0.75],[-1,-0.25],[1,-0.25],[0,0],[-1,0.25],[1,0.25],[-1,0.75],[1,0.75]],
        10:[[-1,-0.75],[1,-0.75],[0,-0.5],[-1,-0.25],[1,-0.25],[-1,0.25],[1,0.25],[0,0.5],[-1,0.75],[1,0.75]],
      };
      ctx.font = '95px "Segoe UI Symbol", serif';
      for (const [x,y] of pips[numeric]) { ctx.save(); ctx.translate(375+x*130,525+y*390); if (y>0) ctx.rotate(Math.PI); ctx.fillText(glyph,0,0); ctx.restore(); }
    } else {
      ctx.strokeStyle = CARD_PRINT.line; ctx.lineWidth = 7; ctx.beginPath(); ctx.roundRect(195,255,360,540,18); ctx.stroke();
      ctx.font = '150px Georgia, serif'; ctx.fillText(value.rank,375,465); ctx.font = '110px "Segoe UI Symbol", serif'; ctx.fillText(glyph,375,625);
    }
  } else {
    ctx.save(); ctx.beginPath(); ctx.roundRect(49,49,652,952,20); ctx.clip();
    ctx.strokeStyle = '#3a3521'; ctx.lineWidth = 4;
    for (let x=-1050;x<1800;x+=54) { ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+1050,1050);ctx.stroke();ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x-1050,1050);ctx.stroke(); }
    ctx.restore(); ctx.strokeStyle=CARD_PRINT.line;ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(49,49,652,952,20);ctx.stroke();
    ctx.fillStyle=CARD_PRINT.ink;ctx.beginPath();ctx.roundRect(142,337,466,376,22);ctx.fill();
    // The bracket motif echoes Scout's framed S mark; SG is a study monogram.
    ctx.strokeStyle=CARD_PRINT.yellow;ctx.lineWidth=9;ctx.lineCap='square';
    for (const [x,y,sx,sy] of [[170,365,1,1],[580,365,-1,1],[580,685,-1,-1],[170,685,1,-1]]) {
      ctx.beginPath();ctx.moveTo(x,y+sy*46);ctx.lineTo(x,y);ctx.lineTo(x+sx*46,y);ctx.stroke();
    }
    ctx.fillStyle=CARD_PRINT.yellow;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='700 166px "Segoe UI", Arial, sans-serif';ctx.fillText('SG',375,490);
    drawWordmark(ctx,375,615,40,CARD_PRINT.paper);
    for (const [y,rotation] of [[178,0],[872,Math.PI]]) {
      ctx.save();ctx.translate(375,y);ctx.rotate(rotation);ctx.fillStyle=CARD_PRINT.yellow;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='43px "Segoe UI Symbol", serif';ctx.fillText('♠  ♥  ♦  ♣',0,0);ctx.restore();
    }
  }
  return element;
}

function printTexture(value?: CardValue) {
  const element = createCardPrint(value);
  const texture = new THREE.CanvasTexture(element); texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8; return texture;
}

function paperGrain() {
  const { element, context: ctx } = canvas(128,128), image = ctx.createImageData(128,128);
  for (let y=0;y<128;y++) for (let x=0;x<128;x++) {
    const at=(y*128+x)*4;
    // A fixed integer pattern, with no RNG or time-dependent texture shimmer.
    const value=229+((x*37+y*17+(x*y)%23)%24);
    image.data.set([value,value,value,255],at);
  }
  ctx.putImageData(image,0,0);
  const texture=new THREE.CanvasTexture(element);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(5,7);texture.anisotropy=8;
  return texture;
}

function studioEnvironment(renderer: StudyRenderer, profile: CardLightProfile) {
  const light=CARD_LIGHTS[profile];
  const { element, context: ctx } = canvas(1024,512);
  ctx.fillStyle='#333638';ctx.fillRect(0,0,1024,512);
  ctx.filter='blur(24px)';ctx.fillStyle=light.softbox;ctx.fillRect(200,50,270,170);ctx.fillStyle=light.bounce;ctx.fillRect(720,95,100,230);ctx.filter='none';
  const texture = new THREE.CanvasTexture(element); texture.colorSpace=THREE.SRGBColorSpace;texture.mapping=THREE.EquirectangularReflectionMapping;
  const generator = new THREE.PMREMGenerator(renderer); const target = generator.fromEquirectangular(texture);
  texture.dispose();generator.dispose();return target;
}

export function mountCardMaterialStudy(host: HTMLElement): CardStudyController {
  const element = <T extends HTMLElement>(id: string) => { const found = host.querySelector<T>(`#${id}`); if (!found) throw Error(`Kontroll saknas: ${id}`); return found; };
  const stage = element<HTMLDivElement>('cm-stage'), surface = element<HTMLCanvasElement>('cm-canvas'), status = element<HTMLOutputElement>('cm-status');
  const ranks=element<HTMLSelectElement>('cm-rank'),suits=element<HTMLSelectElement>('cm-suit'),bendInput=element<HTMLInputElement>('cm-bend'),glossInput=element<HTMLInputElement>('cm-gloss');
  const frontButton=element<HTMLButtonElement>('cm-front'),backButton=element<HTMLButtonElement>('cm-back'),landButton=element<HTMLButtonElement>('cm-land'),liftButton=element<HTMLButtonElement>('cm-lift');
  const lightButtons=host.querySelectorAll<HTMLButtonElement>('[data-card-light]');
  const bendValue=host.querySelector<HTMLOutputElement>('#cm-bend-value'),glossValue=host.querySelector<HTMLOutputElement>('#cm-gloss-value');
  const state: CardStudyState = { card:{rank:'A',suit:'spades'},side:'front',bend:0.07,gloss:0.35,lightProfile:'neutral',phase:'air',landingProgress:0,effectiveBend:0.07 };
  let disposed=false,request=0,landingStart=0,hiddenAt=0;
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const abort=new AbortController(), signal=abort.signal;
  const renderer=new THREE.WebGLRenderer({canvas:surface,antialias:true,alpha:false,powerPreference:'low-power'}) as StudyRenderer;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,1.75));renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#0d1416');
  const camera=new THREE.PerspectiveCamera(35,1,0.1,40) as Spatial<InstanceType<typeof THREE.PerspectiveCamera>>;camera.position.set(0,5.3,8.4);camera.lookAt(0,1.1,0);
  let environment=studioEnvironment(renderer,state.lightProfile);scene.environment=environment.texture;
  const hemisphere=new THREE.HemisphereLight('#f1f2f3','#2e3231',1.05);scene.add(hemisphere);
  const key=new THREE.DirectionalLight('#ffffff',2.05) as Spatial<InstanceType<typeof THREE.DirectionalLight>>;key.position.set(-3.5,7,5);key.castShadow=true;
  key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-5,right:5,top:5,bottom:-5,near:0.1,far:25});key.shadow.bias=-0.0001;key.shadow.normalBias=0.006;scene.add(key);
  const fill=new THREE.DirectionalLight('#e7edf1',0.55) as Spatial<InstanceType<typeof THREE.DirectionalLight>>;fill.position.set(4,3,-3);scene.add(fill);
  const tableGeometry=new THREE.CircleGeometry(4.2,96),tableMaterial=new THREE.MeshStandardMaterial({color:'#142a27',roughness:0.98,metalness:0});
  const table=new StudyMesh(tableGeometry,tableMaterial);table.rotation.x=-Math.PI/2;table.receiveShadow=true;scene.add(table);
  let faceTexture=printTexture(state.card);const backTexture=printTexture();
  const grain=paperGrain(),materialOptions={...paperMaterialParameters(state.gloss),roughnessMap:grain,bumpMap:grain,bumpScale:0.002};
  const frontMaterial=new THREE.MeshPhysicalMaterial({...materialOptions,map:faceTexture});
  const backMaterial=new THREE.MeshPhysicalMaterial({...materialOptions,map:backTexture});
  const edgeMaterial=new THREE.MeshStandardMaterial({color:'#dedede',roughness:0.85,metalness:0});
  const geometry=createCardGeometry(state.bend),card=new StudyMesh(geometry,[frontMaterial,backMaterial,edgeMaterial]);card.castShadow=true;scene.add(card);
  const positionAttribute=geometry.getAttribute('position') as InstanceType<typeof THREE.BufferAttribute>;
  const materialUpdate=()=>{const {color,...parameters}=paperMaterialParameters(state.gloss);for(const material of [frontMaterial,backMaterial]){Object.assign(material,parameters);material.color.set(color);}};
  function render(now: number) {
    request=0;if(disposed||document.hidden)return;
    if(state.phase==='landing') { state.landingProgress=reducedMotion.matches?1:landingProgressAt(now-landingStart);if(state.landingProgress===1)state.phase='landed'; }
    const pose=evaluateCardPose(state.landingProgress,state.side,state.bend);state.effectiveBend=pose.effectiveBend;
    positionAttribute.array.set(pose.positions);positionAttribute.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingSphere();
    card.rotation.copy(pose.rotation);card.position.set(0,pose.y,0);
    renderer.render(scene,camera);stage.dataset.phase=state.phase;stage.dataset.lightProfile=state.lightProfile;
    if(bendValue)bendValue.textContent=`${(state.bend*180/Math.PI).toFixed(1).replace('.',',')}°`;
    if(glossValue)glossValue.textContent=`${Math.round(state.gloss*100)} %`;
    bendInput.disabled=state.phase!=='air';
    if(state.phase==='landed'){status.textContent='Landat · plant och stilla';landButton.disabled=true;liftButton.disabled=false;}
    else if(state.phase==='landing'){status.textContent='Landar · böjningen planar ut';landButton.disabled=true;liftButton.disabled=true;}
    else{status.textContent='I luften · kontrollerad böjning';landButton.disabled=false;liftButton.disabled=true;}
    // No perpetual render loop, time-driven flex, drift or bounce in either resting pose.
    if(state.phase==='landing')request=window.requestAnimationFrame(render);
  }
  function schedule(){if(!disposed&&!request&&!document.hidden)request=window.requestAnimationFrame(render);}
  function resize(){const width=Math.max(1,stage.clientWidth),height=Math.max(1,stage.clientHeight);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();schedule();}
  const observer=new ResizeObserver(resize);observer.observe(stage);
  const controller:CardStudyController={
    setCard(value){if(disposed)return;state.card=validateCard(value);ranks.value=state.card.rank;suits.value=state.card.suit;const old=faceTexture;faceTexture=printTexture(state.card);frontMaterial.map=faceTexture;frontMaterial.needsUpdate=true;old.dispose();schedule();},
    showSide(side){if(disposed||!['front','back'].includes(side))return;state.side=side;frontButton.setAttribute('aria-pressed',String(side==='front'));backButton.setAttribute('aria-pressed',String(side==='back'));schedule();},
    setBend(value){if(disposed)return;state.bend=clamp(value,0,CARD.maxBend);bendInput.value=String(state.bend);schedule();},
    setGloss(value){if(disposed)return;state.gloss=clamp(value,0,1);glossInput.value=String(state.gloss);materialUpdate();schedule();},
    setLightProfile(profile){if(disposed||!Object.hasOwn(CARD_LIGHTS,profile)||state.lightProfile===profile)return;state.lightProfile=profile;applyCardLights(profile,key,fill,hemisphere);const previous=environment;environment=studioEnvironment(renderer,profile);scene.environment=environment.texture;previous.dispose();for(const button of lightButtons)button.setAttribute('aria-pressed',String(button.dataset.cardLight===profile));schedule();},
    land(){if(disposed||state.phase!=='air')return;landingStart=performance.now();state.phase=reducedMotion.matches?'landed':'landing';if(reducedMotion.matches)state.landingProgress=1;schedule();},
    lift(){if(disposed)return;state.phase='air';state.landingProgress=0;schedule();},
    getState(){return {...state,card:{...state.card}};},
    dispose(){if(disposed)return;disposed=true;abort.abort();observer.disconnect();if(request)cancelAnimationFrame(request);geometry.dispose();frontMaterial.dispose();backMaterial.dispose();edgeMaterial.dispose();faceTexture.dispose();backTexture.dispose();grain.dispose();environment.dispose();tableGeometry.dispose();tableMaterial.dispose();key.shadow.map?.dispose();renderer.dispose();if(window.cardMaterialStudy===controller)delete window.cardMaterialStudy;},
  };
  const setSelectedCard=()=>controller.setCard({rank:ranks.value as CardValue['rank'],suit:suits.value as CardValue['suit']});
  ranks.addEventListener('change',setSelectedCard,{signal});suits.addEventListener('change',setSelectedCard,{signal});
  frontButton.addEventListener('click',()=>controller.showSide('front'),{signal});backButton.addEventListener('click',()=>controller.showSide('back'),{signal});
  bendInput.addEventListener('input',()=>controller.setBend(Number(bendInput.value)),{signal});glossInput.addEventListener('input',()=>controller.setGloss(Number(glossInput.value)),{signal});
  for(const button of lightButtons)button.addEventListener('click',()=>controller.setLightProfile(button.dataset.cardLight as CardLightProfile),{signal});
  landButton.addEventListener('click',()=>controller.land(),{signal});liftButton.addEventListener('click',()=>controller.lift(),{signal});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){hiddenAt=performance.now();if(request)cancelAnimationFrame(request);request=0;}else{if(state.phase==='landing'&&hiddenAt)landingStart+=performance.now()-hiddenAt;hiddenAt=0;schedule();}},{signal});
  window.addEventListener('pagehide',event=>{if(!event.persisted)controller.dispose();},{signal});
  reducedMotion.addEventListener('change',schedule,{signal});applyCardLights(state.lightProfile,key,fill,hemisphere);materialUpdate();resize();return controller;
}

if(typeof document!=='undefined'){
  const host=document.querySelector<HTMLElement>('[data-card-material-study]');
  if(host){try{window.cardMaterialStudy=mountCardMaterialStudy(host);}catch{const status=host.querySelector('#cm-status');if(status)status.textContent='3D-provet kunde inte starta. WebGL krävs i den här vyn.';host.setAttribute('data-render-error','true');}}
}
