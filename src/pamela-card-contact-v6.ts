import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {keyPamelaFrame} from './pamela-key.ts';
import {buildPamelaContactLayers} from './pamela-contact-shadow.ts';
import {retargetPamelaC2Frame,PAMELA_C2_SOURCE_SHA256} from './pamela-c2-retarget.ts';
import {preparePamelaCardSurface,PAMELA_SG_BACK_SVG} from './pamela-card-surfaces.ts';
import {loadPamelaMesh,preparePamelaMesh,paintPamelaMesh} from './pamela-card-mesh.ts';
import {buildPamelaCardShadow,applyPamelaCardShadow} from './pamela-card-shadow.ts';
// Local V6 experiment. V4/V5 and all source frames remain unchanged.
sharp.concurrency(1);

type Point=[number,number];type Quad=[Point,Point,Point,Point];
const W=1762,H=1174,run='assets/scene';
const landed:Quad=[[820,1026],[943,1026],[963,1091],[802,1093]];
const shoeQuad:Quad=[[1297,756],[1340,779],[1284,857],[1240,830]];
const clamp=(x:number,a=0,b=1)=>Math.min(b,Math.max(a,x));
const shifted=(q:Quad,dx:number)=>q.map(([x,y])=>[x+dx,y]) as Quad;
export type PamelaCardContactV4Frame={raw:Buffer;clip:'approach'|'deal'|'retreat'|'idle';sourceFrame:number;dealOrdinal?:number;priorCards?:number;mask?:Buffer;shoeMask?:Buffer;contour?:Point[];quad?:Quad|null};
function insideShoe(x:number,y:number){let inside=false;for(let i=0,j=3;i<4;j=i++)if((shoeQuad[i][1]>y)!==(shoeQuad[j][1]>y)&&x<(shoeQuad[j][0]-shoeQuad[i][0])*(y-shoeQuad[i][1])/(shoeQuad[j][1]-shoeQuad[i][1])+shoeQuad[i][0])inside=!inside;return inside;}
function measuredShoeMask(raw:Buffer,moving?:Buffer){
 const mask=Buffer.alloc(W*H);
 for(let y=756;y<=857;y++)for(let x=1240;x<=1340;x++)if(insideShoe(x,y)){
  const p=y*W+x;if(moving?.[p])continue;const i=p*3,r=raw[i],g=raw[i+1],b=raw[i+2];
  const confidence=Math.min(clamp((Math.min(r,b)-95)/45),clamp((53-(r-b))/28),clamp((36-(r-g))/21),clamp((83-(g-r))/32),clamp((91-(g-b))/32));
  if(confidence>=30/255)mask[p]=Math.round(confidence*255);
 }
 return mask;
}
function homography(q:Quad){
 const uv=[[0,0],[1,0],[1,1],[0,1]],rows:number[][]=[];
 for(let i=0;i<4;i++){const[x,y]=q[i],[u,v]=uv[i];rows.push([x,y,1,0,0,0,-u*x,-u*y,u],[0,0,0,x,y,1,-v*x,-v*y,v]);}
 for(let c=0;c<8;c++){let p=c;for(let r=c+1;r<8;r++)if(Math.abs(rows[r][c])>Math.abs(rows[p][c]))p=r;[rows[c],rows[p]]=[rows[p],rows[c]];const d=rows[c][c];if(Math.abs(d)<1e-8)return null;for(let k=c;k<9;k++)rows[c][k]/=d;for(let r=0;r<8;r++)if(r!==c){const f=rows[r][c];for(let k=c;k<9;k++)rows[r][k]-=f*rows[c][k];}}
 return rows.map(r=>r[8]);
}
function inferredQuad(contour:Point[]):Quad|null{
 if(contour.length<4)return null;
 const scores=[(p:Point)=>p[0]+p[1],(p:Point)=>-p[0]+p[1],(p:Point)=>-p[0]-p[1],(p:Point)=>p[0]-p[1]];
 const q=scores.map(s=>contour.reduce((a,p)=>s(p)<s(a)?p:a)) as Quad;
 return new Set(q.map(p=>p.join(','))).size===4?q:null;
}
function paint(out:Buffer,tex:Buffer,q:Quad,coverage?:Float32Array,mask?:Buffer,raw?:Buffer){
 const h=homography(q);if(!h)return 0;
 // A mask defines the paper silhouette. Extend edge UVs to observed mask pixels
 // outside the inferred quad rather than retaining a second original paper rim.
 let left=W,right=-1,top=H,bottom=-1;
 if(mask){for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(mask[y*W+x]){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}}
 else{left=Math.floor(Math.min(...q.map(p=>p[0])));right=Math.ceil(Math.max(...q.map(p=>p[0])));top=Math.floor(Math.min(...q.map(p=>p[1])));bottom=Math.ceil(Math.max(...q.map(p=>p[1])));}
 let extended=0;
 for(let y=Math.max(0,top);y<=Math.min(H-1,bottom);y++)for(let x=Math.max(0,left);x<=Math.min(W-1,right);x++){
  const p=y*W+x,a=mask?mask[p]/255:1;if(!a)continue;
  const d=h[6]*x+h[7]*y+1;if(Math.abs(d)<1e-8)continue;
  const u=(h[0]*x+h[1]*y+h[2])/d,v=(h[3]*x+h[4]*y+h[5])/d;
  const outside=u<0||u>1||v<0||v>1;if(outside&&!mask)continue;if(outside)extended++;
  const tx=clamp(u)*209,ty=clamp(v)*293,x0=Math.floor(tx),y0=Math.floor(ty),fx=tx-x0,fy=ty-y0,i=p*3;
  const t=(y0*210+x0)*3,tr=(y0*210+Math.min(209,x0+1))*3,tb=(Math.min(293,y0+1)*210+x0)*3,tbr=(Math.min(293,y0+1)*210+Math.min(209,x0+1))*3;
  const light=raw?clamp((raw[i]+raw[i+1]+raw[i+2])/(3*244),.65,1.05):.93;
  for(let c=0;c<3;c++){const ink=(tex[t+c]*(1-fx)+tex[tr+c]*fx)*(1-fy)+(tex[tb+c]*(1-fx)+tex[tbr+c]*fx)*fy;out[i+c]=Math.round(clamp(out[i+c]*(1-a)+ink*light*a,0,255));}
  if(coverage)coverage[p]=a+coverage[p]*(1-a);
 }
 return extended;
}
export async function createPamelaCardContactV6Renderer(meshPath='assets/tracking/card-mesh.json'){
 const cardMesh=await loadPamelaMesh(meshPath);
 const nailGuards=JSON.parse(await readFile('assets/tracking/nail-guards.json','utf8'));
 if(nailGuards.sourceSha256!==PAMELA_C2_SOURCE_SHA256)throw Error('Nail guard source mismatch');
 const options={retargetSecond:true,contact:true,cardSurfaceFix:{sourceSha256:PAMELA_C2_SOURCE_SHA256}};
 const roomPath=`${run}/room.png`,table=await readFile(`${run}/table.png`);
 const room=await sharp(roomPath).resize(W,H,{fit:'contain',background:'#24201d'}).removeAlpha().blur(8).modulate({brightness:.58,saturation:.65}).toBuffer();
 const stage=await sharp(room).composite([{input:table}]).removeAlpha().raw().toBuffer();
 const portraitRoom=await sharp(roomPath).resize(1080,1920,{fit:'cover'}).blur(8).modulate({brightness:.58,saturation:.65}).toBuffer();
 const felt=await sharp(table).extract({left:278,top:838,width:1200,height:336}).resize(1080,1086).toBuffer();
 const rail=await sharp(table).extract({left:278,top:817,width:1200,height:21}).resize(1080,19).toBuffer();
 const portraitStage=await sharp(portraitRoom).composite([{input:felt,left:0,top:834},{input:rail,left:0,top:815}]).removeAlpha().toBuffer();
 const texture=async(rank:string,suit:string,color:string)=>sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="210" height="294"><rect width="210" height="294" fill="#f7f4e9"/><g fill="${color}" font-family="Arial,sans-serif" text-anchor="middle"><text x="30" y="52" font-size="52" font-weight="bold">${rank}</text><text x="30" y="94" font-size="43">${suit}</text><text x="105" y="187" font-size="88">${suit}</text><g transform="translate(210 294) rotate(180)"><text x="30" y="52" font-size="52" font-weight="bold">${rank}</text><text x="30" y="94" font-size="43">${suit}</text></g></g></svg>`)).removeAlpha().raw().toBuffer();
 const textures=[await texture('A','♠','#161b20'),await texture('K','♥','#a52d32')];
 const backTexture=options.cardSurfaceFix?await sharp(Buffer.from(PAMELA_SG_BACK_SVG)).removeAlpha().raw().toBuffer():null;
 const canonicalPath='assets/frames/deal/frame-127.png';
 const canonicalRaw=await sharp(await readFile(canonicalPath)).removeAlpha().raw().toBuffer();
 const canonicalKey=keyPamelaFrame(canonicalRaw,W,H);
 const canonicalMasks=[Buffer.alloc(W*H),Buffer.alloc(W*H)];
 const canonicalShifted=[canonicalRaw,Buffer.alloc(W*H*3)];
 for(let y=1022;y<=1100;y++)for(let x=798;x<=966;x++){
  const p=y*W+x,i=p*3;
  // Only the source-bound paper region: retain the rounded rim, not a new quad silhouette.
  const a=canonicalRaw[i]>75&&canonicalRaw[i+2]>40?canonicalKey.alpha[p]:0;
  canonicalMasks[0][p]=Math.round(a*255);canonicalMasks[1][p+46]=Math.round(a*255);
  for(let c=0;c<3;c++)canonicalShifted[1][(p+46)*3+c]=canonicalRaw[i+c];
 }
 const cardShadows=canonicalMasks.map(mask=>buildPamelaCardShadow(mask,W,H));
 const handContract=JSON.parse(await readFile('assets/tracking/hand-occlusion.json','utf8'));
 if(handContract.sourceSha256!==PAMELA_C2_SOURCE_SHA256)throw Error('Hand matte source mismatch');
 const handMasks=new Map<number,Buffer>();
 for(const f of handContract.frames){
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="black"/>${f.polygons.map((p:Point[])=>`<polygon points="${p.map(x=>x.join(',')).join(' ')}" fill="white"/>`).join('')}</svg>`;
  let raster=sharp(Buffer.from(svg));if(f.featherPixels>=.3)raster=raster.blur(f.featherPixels);
  handMasks.set(f.sourceFrame,await raster.greyscale().raw().toBuffer());
 }
 function card(out:Buffer,n:number,coverage:Float32Array,sourceLight?:Buffer){
  const dx=options.retargetSecond&&n===1?46:0,q=shifted(landed,dx);
  applyPamelaCardShadow(out,coverage,cardShadows[n]);
  paint(out,textures[n],q,coverage,canonicalMasks[n],sourceLight??canonicalShifted[n]);
 }
 return async(input:PamelaCardContactV4Frame)=>{
  if(input.raw.length!==W*H*3)throw Error('Native RGB dimensions do not match scene calibration');
  let raw=input.raw,mask=input.mask,contour=input.contour??[],quad=input.quad??null,warp:null|ReturnType<typeof retargetPamelaC2Frame>=null;
  if(input.clip==='deal'&&input.dealOrdinal===1&&options.retargetSecond){
   if(!mask)throw Error('C2 requires the measured visible-card mask');
   warp=retargetPamelaC2Frame({sourceRGB:raw,visibleCardMask:mask,width:W,height:H,sourceFrameIndex:input.sourceFrame,sourceSha256:PAMELA_C2_SOURCE_SHA256,contourNative:contour});
   raw=warp.rgb;mask=warp.visibleCardMask;contour=warp.geometry.movingContourNative;if(quad)quad=quad.map(warp.mapPoint) as Quad;
  }
  const keyed=keyPamelaFrame(raw,W,H),out=Buffer.from(stage),coverage=new Float32Array(W*H),rgb=Buffer.from(keyed.rgb);
  const mesh=input.clip==='deal'?cardMesh(input.sourceFrame,warp?.mapPoint):null;
  const measuredShoe=input.shoeMask??measuredShoeMask(raw,mask);
  const polygons=(nailGuards.frames.find((f:{sourceFrame:number})=>f.sourceFrame===input.sourceFrame)?.polygons??[]) as Point[][];
  const guards=warp?polygons.map(poly=>poly.map(warp!.mapPoint)):polygons;
  const meshSurface=mesh&&mask?preparePamelaMesh(raw,mesh,W,H,mask,measuredShoe,guards):null;
  const surface=options.cardSurfaceFix&&input.clip==='deal'&&mask?preparePamelaCardSurface({sourceRGB:raw,visibleMask:mask,width:W,height:H,sourceFrameIndex:input.sourceFrame,sourceSha256:options.cardSurfaceFix.sourceSha256}):null;
  const dx=options.retargetSecond&&input.dealOrdinal===1?46:0;
  const stable=input.clip==='deal'&&input.sourceFrame>=108;
  const removal=stable?{x:793+dx,y:1018,width:182,height:87}:null;
  const contact=options.contact?buildPamelaContactLayers(raw,keyed.alpha,W,H,{excludeShadowRects:removal?[removal]:[]}):null;
  const alpha=contact?.foregroundAlpha??keyed.alpha;
  const shoeMask=meshSurface?.stationaryMask??measuredShoe;
  // The stationary shoe presentation has no deal-frame timeline. Idle can be360frames.
  const shoe=preparePamelaCardSurface({sourceRGB:raw,visibleMask:shoeMask,width:W,height:H,sourceFrameIndex:0,sourceSha256:PAMELA_C2_SOURCE_SHA256});
  for(let p=0;p<W*H;p++)if(shoe.coverage[p]>0)alpha[p]=Math.max(alpha[p],shoe.coverage[p]);
  paint(rgb,backTexture!,shoeQuad,undefined,shoe.paintMask,raw);
  for(let n=0;n<(input.priorCards??0);n++)card(out,n,coverage);
  if(stable)card(out,input.dealOrdinal??0,coverage,input.sourceFrame<126?raw:undefined);
  if(contact)for(let p=0;p<W*H;p++){const a=contact.shadowAlpha[p];if(!a)continue;for(let c=0;c<3;c++)out[p*3+c]*=1-a;coverage[p]=a+coverage[p]*(1-a);}
  let extendedMaskPixels=0;
  if(meshSurface&&mesh&&!stable){
   for(let p=0;p<W*H;p++)if(meshSurface.coverage[p]>0)alpha[p]=Math.max(alpha[p],meshSurface.coverage[p]);
   paintPamelaMesh(rgb,mesh.side==='BACK'?backTexture!:textures[input.dealOrdinal??0],raw,meshSurface);
  }else if(surface&&!stable){
   // Surface opacity is independent of key colour and is protected after the
   // torso/contact pass. Source fingers remain outside the observed support.
   for(let p=0;p<W*H;p++)if(surface.coverage[p]>0){alpha[p]=Math.max(alpha[p],surface.coverage[p]);if(surface.side.side==='UNKNOWN')for(let c=0;c<3;c++)rgb[p*3+c]=raw[p*3+c];}
   if(surface.side.side!=='UNKNOWN'){
    let q=quad??inferredQuad(contour);
    if(input.sourceFrame>=98&&contour.length){
     // The full lower/outer paper edges remain observed while fingers hide TL.
     // Map a fixed card-local UV layout to that bounding support, not finger extrema.
     const xs=contour.map(p=>p[0]),ys=contour.map(p=>p[1]);
     const left=Math.min(...xs),top=Math.min(...ys),width=Math.max(...xs)-left,height=Math.max(...ys)-top;
     const target=landed.map(([x,y])=>[left+(x-800)*width/164,top+(y-1024)*height/74] as Point) as Quad;
     const t=clamp((input.sourceFrame-98)/4);
     q=q?q.map(([x,y],i)=>[x+(target[i][0]-x)*t,y+(target[i][1]-y)*t] as Point) as Quad:target;
    }
    if(q)extendedMaskPixels=paint(rgb,surface.side.side==='BACK'?backTexture!:textures[input.dealOrdinal??0],q,undefined,surface.paintMask,raw);
   }
  }else if(!options.cardSurfaceFix&&input.clip==='deal'&&input.sourceFrame>=48&&input.sourceFrame<118&&!(input.sourceFrame>=54&&input.sourceFrame<=73)&&mask){
   const q=quad??inferredQuad(contour);if(q)extendedMaskPixels=paint(rgb,textures[input.dealOrdinal??0],q,undefined,mask,raw);
  }
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   const p=y*W+x,i=p*3;let a=alpha[p];
   if(stable&&removal&&x>=removal.x&&x<removal.x+removal.width&&y>=removal.y&&y<removal.y+removal.height){
    const support=canonicalMasks[input.dealOrdinal??0][p]/255;
    const hand=input.sourceFrame<=116?handMasks.get(input.sourceFrame):null;
    if(input.sourceFrame<=116&&!hand)throw Error(`Missing manual hand matte ${input.sourceFrame}`);
    const handAlpha=hand&&x>=dx?hand[y*W+x-dx]/255:0;
    // Full observed paper support is replaced once; fingers stay above it.
    // Feathering belongs to the manually reviewed hand matte, never to a face dissolve.
    a*=1-support*(1-handAlpha);
   }
   if(a)for(let c=0;c<3;c++)out[i+c]=Math.round(rgb[i+c]*a+out[i+c]*(1-a));coverage[p]=a+coverage[p]*(1-a);
  }
  const rgba=Buffer.alloc(W*H*4);
  for(let p=0;p<W*H;p++){const a=coverage[p];if(a<.004)continue;for(let c=0;c<3;c++)rgba[p*4+c]=Math.round(clamp((out[p*3+c]-stage[p*3+c]*(1-a))/a,0,255));rgba[p*4+3]=Math.round(a*255);}
  const projected=await sharp(rgba,{raw:{width:W,height:H,channels:4}}).resize(1586,1057).extract({left:250,top:0,width:1080,height:1057}).png().toBuffer();
  const portrait=await sharp(portraitStage).composite([{input:projected,left:0,top:80}]).removeAlpha().raw().toBuffer();
  return {native:out,portrait,warpedRaw:raw,warpedMask:mask,diagnostics:{extendedMaskPixels,stablePaper:stable,canonicalPaperSource:canonicalPath,handMatteSourceFrame:stable&&input.sourceFrame<=116?input.sourceFrame:null,shoe:shoe.diagnostics,shoeSide:'BACK: authored stationary outlet-card presentation',contact:contact?.diagnostics,warp:warp?.diagnostics,mesh:meshSurface?.diagnostics??null,cardSurface:surface?{...surface.side,...surface.diagnostics}:null,artwork:'Source-bound piecewise card mesh for extraction/turn/bend; original paper lighting and skin occlusion. Retains V5 release support from108. No physical3D reconstruction or face interpolation.'}};
 };
}
