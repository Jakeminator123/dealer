/** Local Pamela matte candidate. Source RGB/geometry is preserved; no video timing work.
 * d<8 pixels remain exactly opaque and byte-identical. Edge colors are reconstructed
 * against nearby foreground and green-screen samples; this is not a semantic matte.
 */
export function keyPamelaFrame(source:Buffer,W:number,H:number):{rgb:Buffer;alpha:Float32Array}{
  if(source.length!==W*H*3)throw new Error('keyPamelaFrame expects native packed RGB24');
  const count=W*H,rgb=Buffer.from(source),alpha=new Float32Array(count);
  const foreground=new Uint8Array(count),background=new Uint8Array(count),dominance=new Int16Array(count);
  const stride=W+1,integral=new Uint32Array((W+1)*(H+1));
  const clamp=(v:number,a=0,b=1)=>Math.min(b,Math.max(a,v));
  for(let y=0;y<H;y++){
    let rowSum=0;
    for(let x=0;x<W;x++){
      const p=y*W+x,i=p*3,r=source[i],g=source[i+1],b=source[i+2],d=g-Math.max(r,b);
      const darkNeutral=(d<28&&g<150&&Math.max(r,b)>g*.65)||(g<40&&d<30);
      dominance[p]=d;foreground[p]=(d<8||darkNeutral)?1:0;
      // Do not key mildly green-lit black jacket/grey shoe interiors. Despill this
      // additional opaque class gently; the original d<8 core remains byte-exact.
      if(d>=8&&darkNeutral)rgb[i+1]=Math.round(g-Math.max(0,d-4)*.5);
      background[p]=(d>145||(d>45&&r<g*.18&&b<g*.4))?1:0;
      alpha[p]=foreground[p]?1:background[p]?0:clamp(1-d/215);
      rowSum+=foreground[p];integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+rowSum;
    }
  }
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
    const p=y*W+x,d=dominance[p];if(foreground[p]||d>215)continue;
    const x0=Math.max(0,x-6),y0=Math.max(0,y-6),x1=Math.min(W,x+7),y1=Math.min(H,y+7);
    const fgCount=integral[y1*stride+x1]-integral[y0*stride+x1]-integral[y1*stride+x0]+integral[y0*stride+x0];
    if(!fgCount){alpha[p]=0;continue;}
    let fp=-1,bp=-1;
    for(let rad=1;rad<=6&&(fp<0||bp<0);rad++){
      for(let yy=Math.max(0,y-rad);yy<=Math.min(H-1,y+rad);yy++)for(let xx=Math.max(0,x-rad);xx<=Math.min(W-1,x+rad);xx++){
        if(Math.max(Math.abs(xx-x),Math.abs(yy-y))!==rad)continue;
        const q=yy*W+xx;if(fp<0&&foreground[q])fp=q;if(bp<0&&background[q])bp=q;
      }
    }
    if(fp<0){alpha[p]=0;continue;}
    const bg=bp>=0?[source[bp*3],source[bp*3+1],source[bp*3+2]]:[2,222,30];
    let numerator=0,denominator=0;
    for(let c=0;c<3;c++){const v=source[fp*3+c]-bg[c];numerator+=(source[p*3+c]-bg[c])*v;denominator+=v*v;}
    const a=clamp(numerator/Math.max(1,denominator));alpha[p]=a;
    for(let c=0;c<3;c++){
      const unmixed=(source[p*3+c]-(1-a)*bg[c])/Math.max(.15,a);
      rgb[p*3+c]=Math.round(clamp(unmixed,Math.max(0,source[fp*3+c]-35),Math.min(255,source[fp*3+c]+35)));
    }
    rgb[p*3+1]=Math.min(rgb[p*3+1],Math.max(rgb[p*3],rgb[p*3+2])+2);
  }
  // At most a 1px cross-neighbour feather on the existing partial-alpha band.
  // Do not expand matte into uncorrected green pixels or change opaque source core.
  const softened=Float32Array.from(alpha);
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
    const p=y*W+x;if(foreground[p]||alpha[p]===0||alpha[p]===1)continue;
    softened[p]=alpha[p]*.8+(alpha[p-1]+alpha[p+1]+alpha[p-W]+alpha[p+W])*.05;
  }
  return {rgb,alpha:softened};
}
