import * as THREE from '../references/card-materials/vendor/three.module.js';

type Spatial<T> = T & { position: InstanceType<typeof THREE.Vector3>; rotation: InstanceType<typeof THREE.Euler> };
type StudyRenderer = InstanceType<typeof THREE.WebGLRenderer> & { shadowMap: { enabled: boolean; type: number } };
type StudyMaterial = InstanceType<typeof THREE.MeshStandardMaterial>;
const StudyMesh = THREE.Mesh as unknown as new (geometry: InstanceType<typeof THREE.BufferGeometry>, material: StudyMaterial | StudyMaterial[]) => Spatial<InstanceType<typeof THREE.Mesh>>;

export const CHIP = { radius: 1.55, thickness: 0.25, bevel: 0.055, radialSegments: 128, bevelSegments: 6, tableGap: 0.008 } as const;
export const CHIP_VALUES = ['1','5','25','100','500','1000'] as const;
export const CHIP_COLOURS = {
  black: { label: 'Svart', ink: '#17191d' },
  red: { label: 'Röd', ink: '#992e3b' },
  blue: { label: 'Blå', ink: '#24577e' },
  green: { label: 'Grön', ink: '#2c6656' },
  purple: { label: 'Lila', ink: '#65487f' },
} as const;
export const CHIP_PRINT = { paper: '#eeeeee', ink: '#0a0b0d', yellow: '#edce39' } as const;
// These match the independent card study. Lighting never alters the printed albedo.
export const CHIP_LIGHTS = {
  warm: { key: '#ffe0b2', fill: '#f1e8dc', sky: '#ffedda', ground: '#31312e', softbox: '#ffe7c5', bounce: '#b9b1a3' },
  neutral: { key: '#ffffff', fill: '#e7edf1', sky: '#f1f2f3', ground: '#2e3231', softbox: '#eeeeee', bounce: '#adb3b6' },
  cool: { key: '#d7e8ff', fill: '#dfeaff', sky: '#e2edff', ground: '#2b3038', softbox: '#dbe9ff', bounce: '#a1b4c9' },
} as const;
export type ChipValue = typeof CHIP_VALUES[number];
export type ChipColour = keyof typeof CHIP_COLOURS;
export type ChipLightProfile = keyof typeof CHIP_LIGHTS;
export type ChipSide = 'front' | 'back';
export type ChipPose = 'tilted' | 'flat';
export type ChipStudyState = { value: ChipValue; colour: ChipColour; side: ChipSide; pose: ChipPose; lightProfile: ChipLightProfile; gloss: number };
export type ChipStudyController = {
  setValue(value: ChipValue): void; setColour(colour: ChipColour): void; showSide(side: ChipSide): void;
  setPose(pose: ChipPose): void; setLightProfile(profile: ChipLightProfile): void; setGloss(gloss: number): void;
  getState(): ChipStudyState; dispose(): void;
};
declare global { interface Window { chipMaterialStudy?: ChipStudyController } }
const clamp=(value:number,low:number,high:number)=>Math.min(high,Math.max(low,Number.isFinite(value)?value:low));

/** Eight equal inlays, symmetric on both faces. They never encode side or hidden state. */
export function isChipInlaySegment(segment: number) {
  const index=((segment%CHIP.radialSegments)+CHIP.radialSegments)%CHIP.radialSegments;
  const within=index%(CHIP.radialSegments/8);
  return within<2 || within>=CHIP.radialSegments/8-2;
}

/** One closed revolved surface, with tangent quarter-circle bevels and four material groups. */
export function createChipSurface() {
  const { radius, thickness, bevel, radialSegments, bevelSegments }=CHIP;
  const profile:{radius:number;z:number}[]=[];
  for(let step=0;step<=bevelSegments;step++) {
    const angle=step/bevelSegments*Math.PI/2;
    profile.push({radius:radius-bevel+bevel*Math.sin(angle),z:thickness/2-bevel+bevel*Math.cos(angle)});
  }
  for(let step=0;step<=bevelSegments;step++) {
    const angle=step/bevelSegments*Math.PI/2;
    profile.push({radius:radius-bevel+bevel*Math.cos(angle),z:-thickness/2+bevel-bevel*Math.sin(angle)});
  }
  const positions:number[]=[0,0,thickness/2],uv:number[]=[0.5,0.5];
  for(let ring=0;ring<profile.length;ring++) for(let segment=0;segment<radialSegments;segment++) {
    const angle=segment/radialSegments*Math.PI*2,{radius:r,z}=profile[ring];
    const x=Math.cos(angle)*r,y=Math.sin(angle)*r,u=0.5+x/(radius*2);
    positions.push(x,y,z);
    uv.push(ring===profile.length-1?1-u:u,0.5+y/(radius*2));
  }
  const bottomCentre=positions.length/3;positions.push(0,0,-thickness/2);uv.push(0.5,0.5);
  const indices:number[]=[],groups:{start:number;count:number;materialIndex:number}[]=[];
  const vertex=(ring:number,segment:number)=>1+ring*radialSegments+(segment%radialSegments);
  let start=indices.length;
  for(let segment=0;segment<radialSegments;segment++)indices.push(0,vertex(0,segment),vertex(0,segment+1));
  groups.push({start,count:indices.length-start,materialIndex:0});start=indices.length;
  for(let segment=0;segment<radialSegments;segment++)indices.push(bottomCentre,vertex(profile.length-1,segment+1),vertex(profile.length-1,segment));
  groups.push({start,count:indices.length-start,materialIndex:1});
  for(const inlay of [false,true]) {
    start=indices.length;
    for(let ring=0;ring<profile.length-1;ring++)for(let segment=0;segment<radialSegments;segment++) {
      if(isChipInlaySegment(segment)!==inlay)continue;
      const a=vertex(ring,segment),b=vertex(ring,segment+1),c=vertex(ring+1,segment),d=vertex(ring+1,segment+1);
      indices.push(a,c,b,b,c,d);
    }
    groups.push({start,count:indices.length-start,materialIndex:inlay?3:2});
  }
  return {positions:new Float32Array(positions),uv:new Float32Array(uv),indices:new Uint16Array(indices),groups,profileRings:profile.length};
}

export function createChipGeometry() {
  const data=createChipSurface(),geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(data.positions,3));
  geometry.setAttribute('uv',new THREE.BufferAttribute(data.uv,2));
  geometry.setIndex(new THREE.BufferAttribute(data.indices,1));
  for(const group of data.groups)geometry.addGroup(group.start,group.count,group.materialIndex);
  geometry.computeVertexNormals();geometry.computeBoundingSphere();return geometry;
}

/** Two fixed inspection poses, no animation, gravity, bounce or accumulating transform. */
export function evaluateChipPose(pose: ChipPose, side: ChipSide) {
  const rotation=new THREE.Euler(pose==='flat'?-Math.PI/2:-0.72,side==='back'?Math.PI:0,0);
  if(pose==='tilted')rotation.y+=0.28;
  const matrix=new THREE.Matrix4().makeRotationFromEuler(rotation).elements,{positions}=createChipSurface();
  let minimumY=Infinity;
  for(let i=0;i<positions.length;i+=3)minimumY=Math.min(minimumY,matrix[1]*positions[i]+matrix[5]*positions[i+1]+matrix[9]*positions[i+2]);
  return {rotation,y:-minimumY+CHIP.tableGap+(pose==='tilted'?0.15:0),minimumY};
}

export function chipMaterialParameters(gloss: number) {
  const amount=clamp(gloss,0,1);
  return {color:'#ffffff',roughness:0.64-amount*0.28,metalness:0,clearcoat:0.06+amount*0.3,
    clearcoatRoughness:0.5-amount*0.2,specularIntensity:0.36+amount*0.2,envMapIntensity:0.4,ior:1.48,iridescence:0};
}

type ColouredLight={color:InstanceType<typeof THREE.Color>};
export function applyChipLights(profile:ChipLightProfile,key:ColouredLight,fill:ColouredLight,hemisphere:ColouredLight&{groundColor:InstanceType<typeof THREE.Color>}) {
  const light=CHIP_LIGHTS[profile];key.color.set(light.key);fill.color.set(light.fill);hemisphere.color.set(light.sky);hemisphere.groundColor.set(light.ground);
}

function canvas(width:number,height:number) {
  const element=document.createElement('canvas');element.width=width;element.height=height;
  const context=element.getContext('2d');if(!context)throw Error('Canvas 2D saknas.');return {element,context};
}

/** The same flat artwork is used on both faces, with no light or sheen baked in. */
export function createChipPrint(value:ChipValue,colour:ChipColour) {
  if(!CHIP_VALUES.includes(value)||!Object.hasOwn(CHIP_COLOURS,colour))throw Error('Ogiltig valör eller markerfärg.');
  const {element,context:ctx}=canvas(1024,1024);
  ctx.fillStyle=CHIP_COLOURS[colour].ink;ctx.fillRect(0,0,1024,1024);
  ctx.fillStyle=CHIP_PRINT.yellow;
  for(let i=0;i<8;i++) {
    const middle=i*Math.PI/4,half=Math.PI/32;
    ctx.beginPath();ctx.arc(512,512,512,middle-half,middle+half);ctx.arc(512,512,420,middle+half,middle-half,true);ctx.closePath();ctx.fill();
  }
  ctx.strokeStyle=CHIP_PRINT.yellow;ctx.lineWidth=8;ctx.beginPath();ctx.arc(512,512,385,0,Math.PI*2);ctx.stroke();
  ctx.fillStyle=CHIP_PRINT.paper;ctx.beginPath();ctx.arc(512,512,364,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#d2d2d2';ctx.lineWidth=4;ctx.beginPath();ctx.arc(512,512,342,0,Math.PI*2);ctx.stroke();
  ctx.fillStyle=CHIP_PRINT.ink;ctx.beginPath();ctx.roundRect(412,259,200,100,16);ctx.fill();
  ctx.fillStyle=CHIP_PRINT.yellow;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='700 68px "Segoe UI", Arial, sans-serif';ctx.fillText('SG',512,310);
  ctx.fillStyle=CHIP_PRINT.ink;ctx.font=`650 ${value==='1000'?158:210}px "Segoe UI", Arial, sans-serif`;ctx.fillText(value==='1000'?'1 000':value,512,528,590);
  ctx.strokeStyle=CHIP_PRINT.yellow;ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(444,661);ctx.lineTo(580,661);ctx.stroke();
  ctx.font='600 42px "Segoe UI", Arial, sans-serif';ctx.textAlign='left';
  const parts=[['scout',CHIP_PRINT.ink],['/',CHIP_PRINT.yellow],['gaming',CHIP_PRINT.ink]] as const;
  let cursor=512-parts.reduce((sum,[text])=>sum+ctx.measureText(text).width,0)/2;
  for(const [text,ink] of parts){ctx.fillStyle=ink;ctx.fillText(text,cursor,717);cursor+=ctx.measureText(text).width;}
  return element;
}

function printTexture(value:ChipValue,colour:ChipColour) {
  const texture=new THREE.CanvasTexture(createChipPrint(value,colour));texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;return texture;
}

function surfaceGrain() {
  const {element,context}=canvas(128,128),image=context.createImageData(128,128);
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){const value=234+((x*37+y*19+(x*y)%29)%19);image.data.set([value,value,value,255],(y*128+x)*4);}
  context.putImageData(image,0,0);
  const texture=new THREE.CanvasTexture(element);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(7,7);texture.anisotropy=8;return texture;
}

function studioEnvironment(renderer:StudyRenderer,profile:ChipLightProfile) {
  const light=CHIP_LIGHTS[profile],{element,context:ctx}=canvas(1024,512);
  ctx.fillStyle='#333638';ctx.fillRect(0,0,1024,512);
  ctx.filter='blur(24px)';ctx.fillStyle=light.softbox;ctx.fillRect(200,50,270,170);ctx.fillStyle=light.bounce;ctx.fillRect(720,95,100,230);ctx.filter='none';
  const texture=new THREE.CanvasTexture(element);texture.colorSpace=THREE.SRGBColorSpace;texture.mapping=THREE.EquirectangularReflectionMapping;
  const generator=new THREE.PMREMGenerator(renderer),target=generator.fromEquirectangular(texture);texture.dispose();generator.dispose();return target;
}

export function mountChipMaterialStudy(host:HTMLElement):ChipStudyController {
  const element=<T extends HTMLElement>(id:string)=>{const found=host.querySelector<T>(`#${id}`);if(!found)throw Error(`Kontroll saknas: ${id}`);return found;};
  const stage=element<HTMLDivElement>('ch-stage'),surface=element<HTMLCanvasElement>('ch-canvas'),status=element<HTMLOutputElement>('ch-status');
  const valueInput=element<HTMLSelectElement>('ch-value'),colourInput=element<HTMLSelectElement>('ch-colour'),glossInput=element<HTMLInputElement>('ch-gloss'),glossOutput=element<HTMLOutputElement>('ch-gloss-value');
  const sideButtons=host.querySelectorAll<HTMLButtonElement>('[data-chip-side]'),poseButtons=host.querySelectorAll<HTMLButtonElement>('[data-chip-pose]'),lightButtons=host.querySelectorAll<HTMLButtonElement>('[data-chip-light]');
  const state:ChipStudyState={value:'100',colour:'black',side:'front',pose:'tilted',lightProfile:'neutral',gloss:0.4};
  let disposed=false,request=0;
  const abort=new AbortController(),signal=abort.signal;
  const renderer=new THREE.WebGLRenderer({canvas:surface,antialias:true,alpha:false,powerPreference:'low-power'}) as StudyRenderer;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#0d1416');
  const camera=new THREE.PerspectiveCamera(34,1,0.1,40) as Spatial<InstanceType<typeof THREE.PerspectiveCamera>>;camera.position.set(0,4.8,8.3);camera.lookAt(0,0.9,0);
  let environment=studioEnvironment(renderer,state.lightProfile);scene.environment=environment.texture;
  const hemisphere=new THREE.HemisphereLight('#f1f2f3','#2e3231',1.05);scene.add(hemisphere);
  const key=new THREE.DirectionalLight('#ffffff',2.05) as Spatial<InstanceType<typeof THREE.DirectionalLight>>;key.position.set(-3.5,7,5);key.castShadow=true;
  key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-5,right:5,top:5,bottom:-5,near:0.1,far:25});key.shadow.bias=-0.0001;key.shadow.normalBias=0.006;scene.add(key);
  const fill=new THREE.DirectionalLight('#e7edf1',0.55) as Spatial<InstanceType<typeof THREE.DirectionalLight>>;fill.position.set(4,3,-3);scene.add(fill);
  const tableGeometry=new THREE.CircleGeometry(3.8,96),tableMaterial=new THREE.MeshStandardMaterial({color:'#142a27',roughness:0.98,metalness:0});
  const table=new StudyMesh(tableGeometry,tableMaterial);table.rotation.x=-Math.PI/2;table.receiveShadow=true;scene.add(table);
  const grain=surfaceGrain();let faceTexture=printTexture(state.value,state.colour);
  const options={...chipMaterialParameters(state.gloss),roughnessMap:grain,bumpMap:grain,bumpScale:0.0015};
  // A shared print texture deliberately prevents a different reverse pattern.
  const frontMaterial=new THREE.MeshPhysicalMaterial({...options,map:faceTexture}),backMaterial=new THREE.MeshPhysicalMaterial({...options,map:faceTexture});
  const edgeMaterial=new THREE.MeshPhysicalMaterial({...options,color:CHIP_COLOURS[state.colour].ink}),inlayMaterial=new THREE.MeshPhysicalMaterial({...options,color:CHIP_PRINT.yellow});
  const geometry=createChipGeometry(),chip=new StudyMesh(geometry,[frontMaterial,backMaterial,edgeMaterial,inlayMaterial]);chip.castShadow=true;scene.add(chip);
  const materialUpdate=()=>{const {color,...parameters}=chipMaterialParameters(state.gloss);for(const material of [frontMaterial,backMaterial,edgeMaterial,inlayMaterial])Object.assign(material,parameters);frontMaterial.color.set(color);backMaterial.color.set(color);edgeMaterial.color.set(CHIP_COLOURS[state.colour].ink);inlayMaterial.color.set(CHIP_PRINT.yellow);};
  const printUpdate=()=>{const old=faceTexture;faceTexture=printTexture(state.value,state.colour);for(const material of [frontMaterial,backMaterial]){material.map=faceTexture;material.needsUpdate=true;}old.dispose();edgeMaterial.color.set(CHIP_COLOURS[state.colour].ink);};
  const pressed=(buttons:NodeListOf<HTMLButtonElement>,attribute:'chipSide'|'chipPose'|'chipLight',value:string)=>{for(const button of buttons)button.setAttribute('aria-pressed',String(button.dataset[attribute]===value));};
  function render(){request=0;if(disposed||document.hidden)return;const pose=evaluateChipPose(state.pose,state.side);chip.rotation.copy(pose.rotation);chip.position.set(0,pose.y,0);renderer.render(scene,camera);stage.dataset.pose=state.pose;stage.dataset.side=state.side;stage.dataset.lightProfile=state.lightProfile;glossOutput.textContent=`${Math.round(state.gloss*100)} %`;status.textContent=state.pose==='flat'?'Plan på bordet · stilla':'Lutad presentationsvy · stilla';}
  function schedule(){if(!disposed&&!request&&!document.hidden)request=window.requestAnimationFrame(render);}
  function resize(){const width=Math.max(1,stage.clientWidth),height=Math.max(1,stage.clientHeight);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();schedule();}
  const observer=new ResizeObserver(resize);observer.observe(stage);
  const controller:ChipStudyController={
    setValue(value){if(disposed)return;if(!CHIP_VALUES.includes(value))throw Error('Ogiltig markervalör.');if(state.value===value)return;state.value=value;valueInput.value=value;printUpdate();schedule();},
    setColour(colour){if(disposed)return;if(!Object.hasOwn(CHIP_COLOURS,colour))throw Error('Ogiltig markerfärg.');if(state.colour===colour)return;state.colour=colour;colourInput.value=colour;printUpdate();schedule();},
    showSide(side){if(disposed||!['front','back'].includes(side))return;state.side=side;pressed(sideButtons,'chipSide',side);schedule();},
    setPose(pose){if(disposed||!['tilted','flat'].includes(pose))return;state.pose=pose;pressed(poseButtons,'chipPose',pose);schedule();},
    setLightProfile(profile){if(disposed||!Object.hasOwn(CHIP_LIGHTS,profile)||state.lightProfile===profile)return;state.lightProfile=profile;applyChipLights(profile,key,fill,hemisphere);const previous=environment;environment=studioEnvironment(renderer,profile);scene.environment=environment.texture;previous.dispose();pressed(lightButtons,'chipLight',profile);schedule();},
    setGloss(gloss){if(disposed)return;state.gloss=clamp(gloss,0,1);glossInput.value=String(state.gloss);materialUpdate();schedule();},
    getState(){return {...state};},
    dispose(){if(disposed)return;disposed=true;abort.abort();observer.disconnect();if(request)cancelAnimationFrame(request);geometry.dispose();for(const material of [frontMaterial,backMaterial,edgeMaterial,inlayMaterial])material.dispose();faceTexture.dispose();grain.dispose();environment.dispose();tableGeometry.dispose();tableMaterial.dispose();key.shadow.map?.dispose();renderer.dispose();if(window.chipMaterialStudy===controller)delete window.chipMaterialStudy;},
  };
  valueInput.addEventListener('change',()=>controller.setValue(valueInput.value as ChipValue),{signal});colourInput.addEventListener('change',()=>controller.setColour(colourInput.value as ChipColour),{signal});glossInput.addEventListener('input',()=>controller.setGloss(Number(glossInput.value)),{signal});
  for(const button of sideButtons)button.addEventListener('click',()=>controller.showSide(button.dataset.chipSide as ChipSide),{signal});
  for(const button of poseButtons)button.addEventListener('click',()=>controller.setPose(button.dataset.chipPose as ChipPose),{signal});
  for(const button of lightButtons)button.addEventListener('click',()=>controller.setLightProfile(button.dataset.chipLight as ChipLightProfile),{signal});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){if(request)cancelAnimationFrame(request);request=0;}else schedule();},{signal});
  window.addEventListener('pagehide',event=>{if(!event.persisted)controller.dispose();},{signal});
  applyChipLights(state.lightProfile,key,fill,hemisphere);materialUpdate();resize();return controller;
}

if(typeof document!=='undefined') {
  const host=document.querySelector<HTMLElement>('[data-chip-material-study]');
  if(host){try{window.chipMaterialStudy=mountChipMaterialStudy(host);}catch{const status=host.querySelector('#ch-status');if(status)status.textContent='Markerprovet kunde inte starta. WebGL krävs i den här vyn.';host.setAttribute('data-render-error','true');}}
}
