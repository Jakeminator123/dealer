/** Isolated source-evidenced contact candidate. Does not move RGB, body, hands, or cards.
 * Apply shadowAlpha multiplicatively to the tabletop stage, then composite keyed RGB
 * with foregroundAlpha. Remove the old fixed torso rectangle when using this result.
 * Input may be a local arm-warped raw plate, provided it retains the same source plane.
 */
export type PamelaContactOptions={
  tableY?:number;
  cutoffY?:number;
  torsoX?:[number,number];
  shadowStrength?:number;
  shadowCap?:number;
  shadowOwnerX?:[number,number];
  exclusionFeather?:number;
  excludeShadowRects?:Array<{x:number;y:number;width:number;height:number}>;
};
export const PAMELA_CONTACT_DEFAULTS={tableY:817,cutoffY:829,torsoX:[670,1080] as [number,number],shadowStrength:.7,shadowCap:.24,shadowOwnerX:[500,1160] as [number,number],exclusionFeather:16};
const clamp=(v:number,a=0,b=1)=>Math.min(b,Math.max(a,v));
const smooth=(v:number)=>{const t=clamp(v);return t*t*(3-2*t);};
export function buildPamelaContactLayers(source:Buffer,keyAlpha:Float32Array,W:number,H:number,options:PamelaContactOptions={}){
  if(W!==1762||H!==1174)throw new Error('Pamela contact calibration requires native 1762x1174; transform the completed layers together');
  if(source.length!==W*H*3||keyAlpha.length!==W*H)throw new Error('Native RGB24/keyAlpha dimensions differ');
  const cfg={...PAMELA_CONTACT_DEFAULTS,...options},n=W*H;
  const skin=new Uint8Array(n),dark=new Uint8Array(n),green=new Uint8Array(n),support=new Uint8Array(n);
  const shadowAlpha=new Float32Array(n),torsoOcclusion=new Float32Array(n),foregroundAlpha=Float32Array.from(keyAlpha);
  const [sx0,sx1]=cfg.shadowOwnerX;
  const yMin=Math.max(0,cfg.tableY-90),yMax=Math.min(H-1,1145);
  for(let y=yMin;y<=yMax;y++)for(let x=380;x<Math.min(W,1730);x++){
    const p=y*W+x,i=p*3,r=source[i],g=source[i+1],b=source[i+2];
    skin[p]=r>95&&r>g*1.12&&g>b*1.07?1:0;
    dark[p]=Math.max(r,g,b)<165&&g-Math.max(r,b)<40&&keyAlpha[p]>.75?1:0;
    // Contact shadows in the source reach G=64 with R=B=0. A bright-screen
    // threshold would leave light holes directly beneath the fingers.
    green[p]=g>32&&g>r*1.55&&g>b*1.55&&g-Math.max(r,b)>28?1:0;
    if(x>=sx0&&x<=sx1&&y>=cfg.tableY-70&&keyAlpha[p]>.8&&(skin[p]||dark[p]))support[p]=1;
  }
  const col=new Float32Array(W),armProtected=new Uint8Array(W);
  const [tx0,tx1]=cfg.torsoX;
  for(let x=Math.max(0,tx0);x<=Math.min(W-1,tx1);x++){
    let belowDark=0,belowSkin=0;
    for(let y=cfg.cutoffY+5;y<=Math.min(H-1,cfg.cutoffY+40);y++){belowDark+=dark[y*W+x];belowSkin+=skin[y*W+x];}
    // A black sleeve continuing in front of the contact line is foreground, not torso.
    if(belowDark>=3||belowSkin>=3){armProtected[x]=1;continue;}
    let bottom=-1,darkRows=0,clearRows=0;
    for(let y=cfg.tableY-2;y<=cfg.cutoffY+3;y++)if(dark[y*W+x]&&!skin[y*W+x]){darkRows++;bottom=y;}
    for(let y=cfg.cutoffY+5;y<=cfg.cutoffY+12;y++)if(green[y*W+x]||skin[y*W+x]||keyAlpha[y*W+x]<.1)clearRows++;
    if(darkRows>=3&&bottom>=cfg.tableY&&clearRows>=6)col[x]=1;
  }
  // Preserve the keyed sleeve edge beside every column with a below-table sleeve.
  // Repair small confidence gaps before feathering; isolated short runs are cuff
  // fragments, not the broad body ending on the source support plane.
  const protectedSeed=Uint8Array.from(armProtected);
  for(let x=tx0;x<=tx1;x++)if(protectedSeed[x])for(let xx=Math.max(tx0,x-4);xx<=Math.min(tx1,x+4);xx++)armProtected[xx]=1;
  for(let x=tx0;x<=tx1;x++)if(armProtected[x])col[x]=0;
  let last=-1;
  for(let x=tx0;x<=tx1;x++){
    if(armProtected[x]){last=-1;continue;}
    if(col[x]){if(last>=0&&x-last<=13)for(let xx=last+1;xx<x;xx++)col[xx]=1;last=x;}
  }
  for(let x=tx0;x<=tx1;){if(!col[x]){x++;continue;}const start=x;while(x<=tx1&&col[x])x++;if(x-start<25)for(let xx=start;xx<x;xx++)col[xx]=0;}
  let occludedPixels=0,skinChanged=0,protectedSleeveChanged=0;
  for(let x=Math.max(2,tx0);x<=Math.min(W-3,tx1);x++){
    if(armProtected[x])continue;
    let columnWeight=0,totalWeight=0;
    for(let dx=-14;dx<=14;dx++){const w=15-Math.abs(dx);totalWeight+=w;columnWeight+=w*(col[x+dx]??0);}
    columnWeight/=totalWeight;
    if(columnWeight===0)continue;
    // Blend the measured endpoint into the contact line over 14 native pixels.
    // Moving the mask's top, rather than leaving a partly opaque vertical strip,
    // avoids the fixed rectangle's two exposed vertical walls.
    const maskTop=cfg.tableY-1+(1-columnWeight)*(cfg.cutoffY-cfg.tableY+3);
    for(let y=cfg.tableY-2;y<=cfg.cutoffY+4;y++){
      const p=y*W+x;if(keyAlpha[p]<.01)continue;
      // Protect actual skin with one native-pixel guard; preserve the keyed edge too.
      let skinGuard=0;for(let yy=y-1;yy<=y+1;yy++)for(let xx=x-1;xx<=x+1;xx++)skinGuard|=skin[yy*W+xx];
      if(skinGuard)continue;
      const a=smooth((y-maskTop)/3);
      torsoOcclusion[p]=a;foregroundAlpha[p]*=1-a;if(a>.01)occludedPixels++;
      if(skin[p]&&a>.001)skinChanged++;
    }
  }
  // Green-channel local upper envelope. Its difference from the original measures
  // observed green-plane darkening; it does not recover physical light or depth.
  const rowMax=new Uint8Array(n),localMax=new Uint8Array(n);
  const bx0=Math.max(0,sx0-80),bx1=Math.min(W-1,sx1+80),by0=Math.max(0,cfg.tableY-25),by1=Math.min(H-1,1145);
  for(let y=by0;y<=by1;y++){
    const queue:number[]=[];let head=0;
    for(let x=bx0-48;x<=bx1+48;x++){
      if(x>=0&&x<W){const p=y*W+x,v=green[p]?source[p*3+1]:0;while(queue.length>head){const q=queue[queue.length-1],qv=green[y*W+q]?source[(y*W+q)*3+1]:0;if(qv>v)break;queue.pop();}queue.push(x);}
      const at=x-48;while(queue.length>head&&queue[head]<at-48)head++;
      if(at>=bx0&&at<=bx1&&queue.length>head){const q=y*W+queue[head];rowMax[y*W+at]=green[q]?source[q*3+1]:0;}
    }
  }
  for(let x=bx0;x<=bx1;x++){
    const queue:number[]=[];let head=0;
    for(let y=by0-20;y<=by1+20;y++){
      if(y>=by0&&y<=by1){const v=rowMax[y*W+x];while(queue.length>head&&rowMax[queue[queue.length-1]*W+x]<=v)queue.pop();queue.push(y);}
      const at=y-20;while(queue.length>head&&queue[head]<at-20)head++;
      if(at>=by0&&at<=by1&&queue.length>head)localMax[at*W+x]=rowMax[queue[head]*W+x];
    }
  }
  // Chamfer distance to observed hand/sleeve pixels limits support, not a fabricated ellipse.
  const distance=new Float32Array(n);distance.fill(1e6);
  for(let y=yMin;y<=yMax;y++)for(let x=bx0;x<=bx1;x++){const p=y*W+x;if(support[p])distance[p]=0;else if(y>yMin&&x>bx0)distance[p]=Math.min(distance[p],distance[p-1]+1,distance[p-W]+1,distance[p-W-1]+1.4142);}
  for(let y=yMax;y>=yMin;y--)for(let x=bx1;x>=bx0;x--){const p=y*W+x;if(y<yMax&&x<bx1)distance[p]=Math.min(distance[p],distance[p+1]+1,distance[p+W]+1,distance[p+W+1]+1.4142);}
  let shadowPixels=0,maxShadow=0,shadowOnForeground=0;
  for(let y=cfg.tableY+19;y<=Math.min(H-1,1140);y++)for(let x=sx0;x<=Math.min(W-1,sx1);x++){
    const p=y*W+x;if(!green[p]||keyAlpha[p]>.95||distance[p]>85)continue;
    let exclusionWeight=1;
    for(const r of options.excludeShadowRects??[]){
      const dx=Math.max(r.x-x,0,x-(r.x+r.width)),dy=Math.max(r.y-y,0,y-(r.y+r.height));
      exclusionWeight=Math.min(exclusionWeight,smooth(Math.hypot(dx,dy)/Math.max(1,cfg.exclusionFeather)));
    }
    if(exclusionWeight===0)continue;
    const baseline=localMax[p];if(baseline<100)continue;
    const observed=Math.max(0,1-source[p*3+1]/baseline-.035);
    const a=Math.min(cfg.shadowCap,observed*cfg.shadowStrength)*smooth((85-distance[p])/35)*exclusionWeight;
    shadowAlpha[p]=a;if(a>.005)shadowPixels++;maxShadow=Math.max(maxShadow,a);if(keyAlpha[p]>.99&&a>.001)shadowOnForeground++;
  }
  for(let x=tx0;x<=tx1;x++)if(armProtected[x])for(let y=cfg.tableY-2;y<=cfg.cutoffY+4;y++)if(foregroundAlpha[y*W+x]!==keyAlpha[y*W+x])protectedSleeveChanged++;
  return {foregroundAlpha,shadowAlpha,torsoOcclusion,diagnostics:{status:'source-evidenced-candidate-not-temporal-acceptance',occludedPixels,skinChanged,protectedSleeveChanged,shadowPixels,maxShadow,shadowOnForeground,torsoColumns:Array.from(col).flatMap((v,x)=>v?[x]:[]),protectedArmColumns:Array.from(armProtected).flatMap((v,x)=>v?[x]:[]),parameters:cfg,uncertainty:'Shadow shape derives from source green-plane darkening; absolute opacity, search envelope and 85px support distance are estimates. No physical depth recovered.'}};
}
