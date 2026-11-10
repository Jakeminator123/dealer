// A bounded 2D correction of the verified P4.C1 original. This preserves its
// photographed turn and jointly deforms hand, card and contact shadow afterwards.
// It is a review candidate, not recovered 3D anatomy or camera calibration.
export type XY = [number, number];
export const P4_SOURCE_SHA = '4153a54702edd316744ae39a64d7b6094e5bcdcd2020a1852850a4c3a9aaa1fe';
export const P4_SOURCE_QUAD: XY[] = [[842,1011],[919,1011],[920,1080],[840,1080]];
export const P4_NATIVE = {width:1762,height:1174};
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const smooth=(a:number,b:number,v:number)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
function projective(from:XY[],to:XY[]) {
 const rows:number[][]=[];
 for(let i=0;i<4;i++){const[x,y]=from[i],[u,v]=to[i];rows.push([x,y,1,0,0,0,-u*x,-u*y,u],[0,0,0,x,y,1,-v*x,-v*y,v]);}
 for(let c=0;c<8;c++) {let p=c;for(let r=c+1;r<8;r++)if(Math.abs(rows[r][c])>Math.abs(rows[p][c]))p=r;[rows[c],rows[p]]=[rows[p],rows[c]];const d=rows[c][c];if(Math.abs(d)<1e-10)throw Error('Degenerate landing quad');for(let j=c;j<9;j++)rows[c][j]/=d;for(let r=0;r<8;r++)if(r!==c){const m=rows[r][c];for(let j=c;j<9;j++)rows[r][j]-=m*rows[c][j];}}
 const h=rows.map(r=>r[8]);return ([x,y]:XY):XY=>{const d=h[6]*x+h[7]*y+1;if(Math.abs(d)<.1)throw Error('Unbounded projection');return [(h[0]*x+h[1]*y+h[2])/d,(h[3]*x+h[4]*y+h[5])/d];};
}
export function createP4PlacementRetarget(target:XY[],sourceSha:string) {
 if(sourceSha!==P4_SOURCE_SHA)throw Error('P4 source hash mismatch');
 if(target.length!==4||target.flat().some(v=>!Number.isFinite(v)))throw Error('Invalid target');
 // Deliberately bounded to a nearby P4 plan. Do not silently apply this arm warp
 // to another seat, radically different card size, or a differently framed source.
 for(let i=0;i<4;i++)if(Math.hypot(target[i][0]-P4_SOURCE_QUAD[i][0],target[i][1]-P4_SOURCE_QUAD[i][1])>100)throw Error('P4 correction exceeds validated 100px corridor');
 const project=projective(P4_SOURCE_QUAD,target);
 const map=(x:number,y:number,t:number):XY=>{const restGuard=1-smooth(840,890,x);const w=t*smooth(670,820,x)*(1-smooth(1040,1170,x))*smooth(760+140*restGuard,940+60*restGuard,y);if(w===0)return[x,y];const q=project([x,y]);return [x+w*(q[0]-x),y+w*(q[1]-y)];};
 const jacobian=(x:number,y:number,t:number)=>{const p=map(x,y,t),dx=map(x+.01,y,t),dy=map(x,y+.01,t);return [(dx[0]-p[0])*100,(dy[0]-p[0])*100,(dx[1]-p[1])*100,(dy[1]-p[1])*100];};
 let minimumJacobian=Infinity,maximumDisplacement=0;
 for(let y=760;y<1174;y+=3)for(let x=670;x<1170;x+=3)for(const t of [.25,.5,.75,1]){const[a,b,c,d]=jacobian(x,y,t),det=a*d-b*c;minimumJacobian=Math.min(minimumJacobian,det);const q=map(x,y,t);maximumDisplacement=Math.max(maximumDisplacement,Math.hypot(q[0]-x,q[1]-y));if(det<.3)throw Error('Unsafe P4 deformation: folded/compressed foreground');}
 const cornerError=Math.max(...P4_SOURCE_QUAD.map((p,i)=>{const q=map(...p,1);return Math.hypot(q[0]-target[i][0],q[1]-target[i][1]);}));
 if(cornerError>.001)throw Error('Target lies outside fully supported area');
 const maps=new Map<number,{indices:Int32Array;weights:Float32Array}>();
 let maxInverseError=0;
 const {width:W,height:H}=P4_NATIVE,left=670,top=760,rw=501,rh=H-top;
 function inverseMap(t:number) {
  const cached=maps.get(t);if(cached)return cached;
  const indices=new Int32Array(rw*rh),weights=new Float32Array(rw*rh*2);
  for(let y=top;y<H;y++)for(let x=left;x<=1170;x++){
   let sx=x,sy=y;
   for(let it=0;it<9;it++){const q=map(sx,sy,t),ex=q[0]-x,ey=q[1]-y;if(Math.hypot(ex,ey)<.0005)break;const[a,b,c,d]=jacobian(sx,sy,t),det=a*d-b*c;if(det<.25)throw Error('Unsafe inverse deformation');sx-=(d*ex-b*ey)/det;sy-=(-c*ex+a*ey)/det;}
   const q=map(sx,sy,t),error=Math.hypot(q[0]-x,q[1]-y);maxInverseError=Math.max(maxInverseError,error);if(error>.02||sx<0||sy<0||sx>W-1||sy>H-1)throw Error('P4 inverse map has no safe source pixel');
   const ix=Math.min(W-2,Math.floor(sx)),iy=Math.min(H-2,Math.floor(sy)),k=(y-top)*rw+x-left;indices[k]=iy*W+ix;weights[k*2]=sx-ix;weights[k*2+1]=sy-iy;
  }
  const result={indices,weights};maps.set(t,result);return result;
 }
 function apply(raw:Buffer,sourceFrame:number) {
  if(raw.length!==W*H*3||!Number.isInteger(sourceFrame)||sourceFrame<0||sourceFrame>=120)throw Error('P4 raw/source-frame mismatch');
  // The observed BACK -> EDGE -> FRONT phase48..63 is preserved exactly.
  const t=smooth(63,76,sourceFrame);if(t===0)return Buffer.from(raw);
  const {indices,weights}=inverseMap(t),out=Buffer.from(raw);
  for(let y=top;y<H;y++)for(let x=left;x<=1170;x++){const k=(y-top)*rw+x-left,q=indices[k],fx=weights[k*2],fy=weights[k*2+1],p=(y*W+x)*3;for(let c=0;c<3;c++)out[p+c]=Math.round((raw[q*3+c]*(1-fx)+raw[(q+1)*3+c]*fx)*(1-fy)+(raw[(q+W)*3+c]*(1-fx)+raw[(q+W+1)*3+c]*fx)*fy);}
  return out;
 }
 return {apply,map,diagnostics:()=>({minimumJacobian,maximumDisplacement,cornerError,maxInverseError,unmodifiedSourceFrames:[0,64],transitionSourceFrames:[64,76],sourceQuad:P4_SOURCE_QUAD,targetQuad:target,method:'bounded projective foreground deformation; hand/card/shadow use one continuous map; no colour switch, generated pixels, retiming or pose interpolation'})};
}
