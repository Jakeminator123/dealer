/** Small presentation shadow derived from the measured paper silhouette.
 * Build once per stationary paper mask. Apply immediately before painting that
 * card so later cards occlude earlier shadows in the same order as the paper.
 * This does not alter paper, artwork, source lighting, geometry or hand mattes.
 */
export type PamelaCardShadowOptions={sigma?:number;offsetX?:number;offsetY?:number;opacity?:number};
export const PAMELA_CARD_SHADOW_DEFAULTS=Object.freeze({sigma:.85,offsetX:-.4,offsetY:.75,opacity:.12});
export type PamelaCardShadow={
  width:number;height:number;alpha:Float32Array;
  bounds:{left:number;top:number;right:number;bottom:number}|null;
  diagnostics:{pixels:number;alphaSum:number;maxAlpha:number;parameters:Required<PamelaCardShadowOptions>};
};

export function buildPamelaCardShadow(paperMask:Uint8Array,width:number,height:number,options:PamelaCardShadowOptions={}):PamelaCardShadow{
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||paperMask.length!==width*height)throw Error('Paper mask dimensions differ');
  const cfg={...PAMELA_CARD_SHADOW_DEFAULTS,...options};
  if(!Object.values(cfg).every(Number.isFinite)||cfg.sigma<=0||cfg.sigma>8||cfg.opacity<0||cfg.opacity>1||Math.abs(cfg.offsetX)>16||Math.abs(cfg.offsetY)>16)throw Error('Invalid card shadow parameters');
  const alpha=new Float32Array(width*height);
  let left=width,top=height,right=-1,bottom=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(paperMask[y*width+x]){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
  const diagnostics={pixels:0,alphaSum:0,maxAlpha:0,parameters:cfg};
  if(right<left||cfg.opacity===0)return {width,height,alpha,bounds:null,diagnostics};
  const radius=Math.ceil(cfg.sigma*3),padding=radius+Math.ceil(Math.max(Math.abs(cfg.offsetX),Math.abs(cfg.offsetY)))+1;
  left=Math.max(0,left-padding);top=Math.max(0,top-padding);right=Math.min(width-1,right+padding);bottom=Math.min(height-1,bottom+padding);
  const patchWidth=right-left+1,patchHeight=bottom-top+1;
  const horizontal=new Float32Array(patchWidth*patchHeight),blurred=new Float32Array(horizontal.length);
  const kernel=Array.from({length:radius*2+1},(_,i)=>Math.exp(-((i-radius)**2)/(2*cfg.sigma**2)));
  const weight=kernel.reduce((a,b)=>a+b,0);for(let k=0;k<kernel.length;k++)kernel[k]/=weight;
  for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
    let sum=0;for(let k=-radius;k<=radius;k++)if(x+k>=0&&x+k<width)sum+=paperMask[y*width+x+k]/255*kernel[k+radius];
    horizontal[(y-top)*patchWidth+x-left]=sum;
  }
  for(let y=0;y<patchHeight;y++)for(let x=0;x<patchWidth;x++){
    let sum=0;for(let k=-radius;k<=radius;k++)if(y+k>=0&&y+k<patchHeight)sum+=horizontal[(y+k)*patchWidth+x]*kernel[k+radius];
    blurred[y*patchWidth+x]=sum;
  }
  const sample=(x:number,y:number)=>x<0||y<0||x>=patchWidth||y>=patchHeight?0:blurred[y*patchWidth+x];
  for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
    const p=y*width+x;
    if(paperMask[p]===255)continue;
    const sx=x-left-cfg.offsetX,sy=y-top-cfg.offsetY,x0=Math.floor(sx),y0=Math.floor(sy),fx=sx-x0,fy=sy-y0;
    const spread=(sample(x0,y0)*(1-fx)+sample(x0+1,y0)*fx)*(1-fy)+(sample(x0,y0+1)*(1-fx)+sample(x0+1,y0+1)*fx)*fy;
    const a=cfg.opacity*spread*(1-paperMask[p]/255);
    if(a<1/1024)continue;
    alpha[p]=a;diagnostics.pixels++;diagnostics.alphaSum+=a;diagnostics.maxAlpha=Math.max(diagnostics.maxAlpha,a);
  }
  return {width,height,alpha,bounds:{left,top,right,bottom},diagnostics};
}

export function applyPamelaCardShadow(rgb:Uint8Array,coverage:Float32Array,shadow:PamelaCardShadow):void{
  const {width,height,alpha,bounds}=shadow;
  if(rgb.length!==width*height*3||coverage.length!==width*height)throw Error('Card shadow destination dimensions differ');
  if(!bounds)return;
  for(let y=bounds.top;y<=bounds.bottom;y++)for(let x=bounds.left;x<=bounds.right;x++){
    const p=y*width+x,a=alpha[p];if(a===0)continue;
    for(let c=0;c<3;c++)rgb[p*3+c]=Math.round(rgb[p*3+c]*(1-a));
    coverage[p]=a+coverage[p]*(1-a);
  }
}
