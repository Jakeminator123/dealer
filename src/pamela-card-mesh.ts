import {readFile} from 'node:fs/promises';
import {PAMELA_CARD_SOURCE_SHA256} from './pamela-card-surfaces.ts';

export type MeshPoint=[number,number];
export type CardSection={v:number;left:MeshPoint;right:MeshPoint};
export type CardMeshFrame={sourceFrame:number;side:'BACK'|'FRONT';sections:CardSection[];note?:string;textureRotate180?:boolean};
export type MeshContract={sourceSha256:string;frames:CardMeshFrame[]};
const clamp=(v:number,a=0,b=1)=>Math.max(a,Math.min(b,v));
type Vertex={point:MeshPoint;uv:MeshPoint};
const pointAt=(a:MeshPoint,b:MeshPoint,t:number):MeshPoint=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];

/** Piecewise projection of measured paper edges. It does not reconstruct hidden hands or physical depth. */
export async function loadPamelaMesh(path:string){
  const contract=JSON.parse(await readFile(path,'utf8')) as MeshContract;
  if(contract.sourceSha256!==PAMELA_CARD_SOURCE_SHA256)throw Error('Card mesh source mismatch');
  const frames=contract.frames.sort((a,b)=>a.sourceFrame-b.sourceFrame);
  for(const frame of frames){
    if(frame.sections.length<2||frame.sections[0].v!==0||frame.sections.at(-1)!.v!==1)throw Error('Mesh must cover card-local v=0..1');
    for(let i=1;i<frame.sections.length;i++)if(frame.sections[i].v<=frame.sections[i-1].v)throw Error('Unordered card sections');
  }
  return (index:number,mapPoint:(p:MeshPoint)=>MeshPoint=p=>p):CardMeshFrame|null=>{
    if(!frames.length||index<frames[0].sourceFrame||index>frames.at(-1)!.sourceFrame)return null;
    const next=frames.findIndex(f=>f.sourceFrame>=index),a=frames[Math.max(0,next-1)],b=frames[next];
    const t=a.sourceFrame===b.sourceFrame?0:(index-a.sourceFrame)/(b.sourceFrame-a.sourceFrame);
    const sample=(frame:CardMeshFrame,v:number)=>{
      const end=frame.sections.findIndex(s=>s.v>=v),start=Math.max(0,end-1),s=frame.sections[start],e=frame.sections[end];
      const f=e.v===s.v?0:(v-s.v)/(e.v-s.v);
      return {left:pointAt(s.left,e.left,f),right:pointAt(s.right,e.right,f)};
    };
    const sections=Array.from({length:17},(_,i)=>{
      const v=i/16,sa=sample(a,v),sb=sample(b,v);
      return {v,left:mapPoint(pointAt(sa.left,sb.left,t)),right:mapPoint(pointAt(sa.right,sb.right,t))};
    });
    const source=index===b.sourceFrame?b:a;
    return {sourceFrame:index,side:source.side,sections,note:source.note,textureRotate180:source.textureRotate180};
  };
}

function triangles(mesh:CardMeshFrame):[Vertex,Vertex,Vertex][]{
  const out:[Vertex,Vertex,Vertex][]=[];
  for(let i=0;i<mesh.sections.length-1;i++){
    const a=mesh.sections[i],b=mesh.sections[i+1];
    const al={point:a.left,uv:[0,a.v] as MeshPoint},ar={point:a.right,uv:[1,a.v] as MeshPoint};
    const bl={point:b.left,uv:[0,b.v] as MeshPoint},br={point:b.right,uv:[1,b.v] as MeshPoint};
    out.push([al,ar,br],[al,br,bl]);
  }
  return out;
}

export function projectPamelaMesh(mesh:CardMeshFrame,width:number,height:number){
  const uv=new Float32Array(width*height*2);uv.fill(-1);
  for(const [a,b,c] of triangles(mesh)){
    const [ax,ay]=a.point,[bx,by]=b.point,[cx,cy]=c.point;
    const d=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);if(Math.abs(d)<.0001)continue;
    const x0=Math.max(0,Math.floor(Math.min(ax,bx,cx))),x1=Math.min(width-1,Math.ceil(Math.max(ax,bx,cx)));
    const y0=Math.max(0,Math.floor(Math.min(ay,by,cy))),y1=Math.min(height-1,Math.ceil(Math.max(ay,by,cy)));
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const wa=((by-cy)*(x+.5-cx)+(cx-bx)*(y+.5-cy))/d;
      const wb=((cy-ay)*(x+.5-cx)+(ax-cx)*(y+.5-cy))/d,wc=1-wa-wb;
      if(wa<-.00001||wb<-.00001||wc<-.00001)continue;
      const p=(y*width+x)*2;uv[p]=clamp(wa*a.uv[0]+wb*b.uv[0]+wc*c.uv[0]);uv[p+1]=clamp(wa*a.uv[1]+wb*b.uv[1]+wc*c.uv[1]);
    }
  }
  return uv;
}

function insidePolygon(x:number,y:number,polygon:MeshPoint[]){
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++)if((polygon[i][1]>y)!==(polygon[j][1]>y)&&x<(polygon[j][0]-polygon[i][0])*(y-polygon[i][1])/(polygon[j][1]-polygon[i][1])+polygon[i][0])inside=!inside;
  return inside;
}
export function preparePamelaMesh(raw:Buffer,mesh:CardMeshFrame,width:number,height:number,existingMoving:Buffer,existingShoe:Buffer,excludePolygons:MeshPoint[][]=[]){
  const uv=projectPamelaMesh(mesh,width,height),mask=Buffer.alloc(width*height),stationaryMask=Buffer.from(existingShoe);
  // Observed paper can extend a few pixels past authored section endpoints.
  // Extend UVs only into the measured moving-card support, never into a new silhouette.
  let left=width,top=height,right=-1,bottom=-1,extendedObservedPixels=0;
  for(let p=0;p<existingMoving.length;p++)if(existingMoving[p]||uv[p*2]>=0){
    const x=p%width,y=Math.floor(p/width);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
  }
  if(right>=left){
    const rw=right-left+1,rh=bottom-top+1,nearest=new Int32Array(rw*rh),queue=new Int32Array(rw*rh);nearest.fill(-1);
    let tail=0;
    for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
      const p=y*width+x,j=(y-top)*rw+x-left;if(uv[p*2]>=0){nearest[j]=p;queue[tail++]=j;}
    }
    for(let head=0;head<tail;head++){
      const j=queue[head],x=j%rw,y=Math.floor(j/rw);
      for(const next of [x>0?j-1:-1,x+1<rw?j+1:-1,y>0?j-rw:-1,y+1<rh?j+rw:-1]){
        if(next>=0&&nearest[next]<0){nearest[next]=nearest[j];queue[tail++]=next;}
      }
    }
    for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
      const p=y*width+x;if(!existingMoving[p]||uv[p*2]>=0)continue;
      const near=nearest[(y-top)*rw+x-left];if(near<0)continue;
      uv[p*2]=uv[near*2];uv[p*2+1]=uv[near*2+1];extendedObservedPixels++;
    }
  }
  let observedPixels=0,skinExcluded=0;
  for(let p=0;p<mask.length;p++){
    if(uv[p*2]<0)continue;
    // The lifted paper owns this footprint; the stationary shoe may not overprint it.
    stationaryMask[p]=0;
    const i=p*3,r=raw[i],g=raw[i+1],b=raw[i+2];
    if((r>95&&r>g*1.12&&g>b*1.07)||excludePolygons.some(poly=>insidePolygon(p%width+.5,Math.floor(p/width)+.5,poly))){skinExcluded++;continue;}
    const observed=Math.min(clamp((Math.min(r,b)-95)/45),clamp((53-(r-b))/28),clamp((36-(r-g))/21),clamp((83-(g-r))/32),clamp((91-(g-b))/32));
    const a=Math.max(existingMoving[p]/255,existingShoe[p]/255,observed);
    if(a>=30/255){mask[p]=Math.round(a*255);observedPixels++;}
  }
  // Match the existing conservative edge policy while making observed paper opaque.
  const coverage=new Float32Array(width*height),paintMask=Buffer.from(mask);
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
    const p=y*width+x;if(!mask[p])continue;
    const interior=mask[p-1]&&mask[p+1]&&mask[p-width]&&mask[p+width];
    coverage[p]=interior?1:mask[p]/255;paintMask[p]=Math.round(coverage[p]*255);
  }
  return {uv,coverage,paintMask,stationaryMask,textureRotate180:mesh.textureRotate180===true,diagnostics:{observedPixels,skinExcluded,extendedObservedPixels,sections:mesh.sections.length,side:mesh.side,projection:'source-bound piecewise paper mesh; original per-pixel lighting; no optical flow or frame interpolation'}};
}

export function paintPamelaMesh(out:Buffer,texture:Buffer,raw:Buffer,surface:ReturnType<typeof preparePamelaMesh>){
  for(let p=0;p<surface.paintMask.length;p++){
    const a=surface.paintMask[p]/255;if(!a)continue;
    const u=surface.uv[p*2],v=surface.uv[p*2+1];
    const x=(surface.textureRotate180?1-u:u)*209,y=(surface.textureRotate180?1-v:v)*293,x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0,i=p*3;
    const t=(y0*210+x0)*3,tr=(y0*210+Math.min(209,x0+1))*3,tb=(Math.min(293,y0+1)*210+x0)*3,tbr=(Math.min(293,y0+1)*210+Math.min(209,x0+1))*3;
    const light=clamp((raw[i]+raw[i+1]+raw[i+2])/(3*244),.65,1.05);
    for(let c=0;c<3;c++){
      const ink=(texture[t+c]*(1-fx)+texture[tr+c]*fx)*(1-fy)+(texture[tb+c]*(1-fx)+texture[tbr+c]*fx)*fy;
      out[i+c]=Math.round(clamp(out[i+c]*(1-a)+ink*light*a,0,255));
    }
  }
}
