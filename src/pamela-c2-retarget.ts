/** V4 local C2 candidate. The old long return folded from source120 onward;
 * the free hand now returns smoothly during118..124, while the card stays+46.
 * Coordinates and timing are inferred control choices;
 * source pixels and the visible-card mask remain bound to the exact source hash.
 * This is an image warp, not a new recorded movement or a recovered 3D arm.
 */
export const PAMELA_C2_SOURCE_SHA256='2445bb2ef5122fe558134d582533d277603da72c4b98b6c782be01a5bf06235a';
export const PAMELA_C2_RETARGET_STATUS='v4-candidate-short-free-hand-return' as const;
type Point=[number,number];
type Row={strength:number;right:number;end:number};
export type PamelaC2RetargetInput={
  sourceRGB:Buffer;visibleCardMask:Buffer;width:number;height:number;
  sourceFrameIndex:number;sourceSha256:string;contourNative?:Point[];
};
const clamp=(v:number,a=0,b=1)=>Math.min(b,Math.max(a,v));
const smooth=(a:number,b:number,v:number)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
export function pamelaC2HandShift(frame:number){
  if(frame<=77)return 0;
  if(frame<94)return 46*smooth(77,94,frame);
  if(frame<=118)return 46;
  if(frame<124)return 46*(1-smooth(118,124,frame));
  return 0;
}
export function retargetPamelaC2Frame(input:PamelaC2RetargetInput){
  const {sourceRGB:source,visibleCardMask:mask,width:W,height:H,sourceFrameIndex:frame}=input;
  if(input.sourceSha256!==PAMELA_C2_SOURCE_SHA256||W!==1762||H!==1174||source.length!==W*H*3||mask.length!==W*H)throw Error('Pamela C2 source binding mismatch');
  if(!Number.isInteger(frame)||frame<0||frame>=180)throw Error('Invalid source frame');
  const amount=pamelaC2HandShift(frame),cardAmount=frame>=118?46:amount;
  const cardRight=new Int16Array(H);cardRight.fill(-1);
  const handRight=new Int16Array(H);handRight.fill(-1);
  let skinTop=840,cardTop=H;
  for(let y=680;y<1125;y++)for(let x=540;x<1160;x++){
    const p=y*W+x,i=p*3;
    if(mask[p]>30){cardRight[y]=Math.max(cardRight[y],x);cardTop=Math.min(cardTop,y);}
    // The warm ivory blouse is not a hand seed. In this reach the active hand
    // is visually below y730; the zero-shift earlier handoff needs no seed.
    if(y>=730&&x<940&&source[i]-source[i+1]>30&&source[i]-source[i+2]>60&&source[i]>140){skinTop=Math.min(skinTop,y);handRight[y]=Math.max(handRight[y],x);}
  }
  const rigidFromY=clamp(Math.min(skinTop-6,cardTop-4),710,840);
  const rows:Row[]=Array.from({length:H},()=>({strength:0,right:820,end:940}));
  let minJacobian=1,maxCardShiftError=0;
  for(let y=681;y<1125;y++){
    let strength=amount*smooth(680,rigidFromY,y);
    if(frame>=118)strength+=(46-strength)*smooth(1005,1020,y);
    strength*=1-smooth(1110,1125,y);
    const baseRight=y<740?760+(y-680)*.5:y<800?790+(y-740)*.5:820;
    const right=Math.max(baseRight,cardRight[y]>=0?cardRight[y]+12:0,handRight[y]>=0?handRight[y]+12:0);
    const end=940+310*smooth(850,910,y);
    const jac=1-1.5*strength/Math.max(1,end-right);
    minJacobian=Math.min(minJacobian,jac);
    if(strength>0&&jac<=.1)throw Error(`Unsafe fold/compression at source frame ${frame}, row ${y}, Jacobian bound ${jac.toFixed(3)}; stop this technique.`);
    rows[y]={strength,right,end};
  }
  const displacement=(x:number,y:number)=>{
    const row=rows[clamp(Math.round(y),0,H-1)];
    return row.strength*smooth(400,540,x)*(1-smooth(row.right,row.end,x));
  };
  const mapPoint=(p:Point):Point=>[p[0]+displacement(p[0],p[1]),p[1]];
  const rgb=Buffer.from(source),visibleCardMask=Buffer.from(mask),warpSupportMask=Buffer.alloc(W*H);
  for(let y=681;y<1125;y++){
    const row=rows[y];if(row.strength<1e-8)continue;
    let sx=399;
    for(let x=400;x<=Math.min(W-2,Math.ceil(row.end));x++){
      while(sx+1<W-1&&(sx+1)+displacement(sx+1,y)<x)sx++;
      const a=sx+displacement(sx,y),b=sx+1+displacement(sx+1,y);
      const f=clamp((x-a)/Math.max(1e-9,b-a)),p=y*W+x,q=y*W+sx;
      for(let c=0;c<3;c++)rgb[p*3+c]=Math.round(source[q*3+c]*(1-f)+source[(q+1)*3+c]*f);
      visibleCardMask[p]=Math.round(mask[q]*(1-f)+mask[q+1]*f);
      warpSupportMask[p]=Math.round(255*clamp(Math.abs(x-(sx+f))/46));
    }
  }
  for(let y=680;y<1125;y++)for(let x=540;x<1160;x++)if(mask[y*W+x]>=128)maxCardShiftError=Math.max(maxCardShiftError,Math.abs(displacement(x,y)-cardAmount));
  const originalLanding:Point[]=[[820,1026],[943,1026],[963,1093],[802,1093]];
  return {rgb,visibleCardMask,warpSupportMask,mapPoint,
    geometry:{sourceFrameIndex:frame,card1QuadNative:originalLanding,card2LandingQuadNative:originalLanding.map(([x,y])=>[x+46,y] as Point),movingContourNative:(input.contourNative??[]).map(mapPoint),postReleasePropRemovalRect:frame>=118?{left:838,top:1018,width:182,height:87}:null},
    diagnostics:{handShiftPixels:amount,cardShiftPixels:cardAmount,rigidFromY,anchorY:680,minimumHorizontalJacobianBound:minJacobian,maxObservedCardShiftErrorPixels:maxCardShiftError,interpolation:'horizontal bilinear inverse warp; no source hole filling',semantics:'Only the visible-card mask is measured. Hand support, elbow anchor, displacement field and timing are inferred.'}};
}
