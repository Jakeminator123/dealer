// Geometry-owned marker overlay after the photographic palm edit from imagegen.
// The actual AI image and the exact sent derivative are both retained.
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {validatePlan,flatQuad,quad} from '../src/placement-model.ts';
sharp.concurrency(1);
const dir='assets/motions/pamela-p4-c1-palm-up-01';
if(await stat(dir).catch(()=>null))throw Error('Palm inputs already exist; do not overwrite.');
const imagePath=process.argv[2];if(!imagePath)throw Error('Supply the inspected imagegen output path.');
const original=await readFile(imagePath),planBytes=await readFile('placements/default.json'),plan=JSON.parse(planBytes.toString());validatePlan(plan);
const start=await readFile('assets/motions/pamela-p4-c1-color-control-01/start.png');
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
if(hash(start)!=='a2fc6d3565ca711015c9b547671bf33e97eea4c2281e75841690f8848b422f45')throw Error('Unexpected first anchor');
const W=1764,H=1174,meta=await sharp(original).metadata();
if(meta.width!==1536||meta.height!==1024)throw Error('Review imagegen geometry before normalization');
const normalized=await sharp(original).resize(W,H,{fit:'fill'}).removeAlpha().raw().toBuffer();
let minX=W,minY=H,maxX=-1,maxY=-1,count=0;
for(let y=1000;y<H-10;y++)for(let x=650;x<1050;x++){const p=(y*W+x)*3,r=normalized[p],g=normalized[p+1],b=normalized[p+2];if(b>130&&b>g*1.4&&b>r*2){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);count++;}}
if(count<1500||count>12000||minY<1030||maxY>1150||maxX-minX>130)throw Error('Unexpected geometric card marker');
const rect={left:minX-6,right:maxX+6,top:minY-6,bottom:maxY+6};
const clean=Buffer.from(normalized),corners=[[rect.left,rect.top],[rect.right,rect.top],[rect.left,rect.bottom],[rect.right,rect.bottom]];
const colors=corners.map(([x,y])=>Array.from(normalized.subarray((y*W+x)*3,(y*W+x)*3+3)));
if(colors.some(([r,g,b])=>g<r+110||g<b+110))throw Error('Marker removal would touch photographic foreground');
for(let y=rect.top;y<=rect.bottom;y++)for(let x=rect.left;x<=rect.right;x++){const u=(x-rect.left)/(rect.right-rect.left),v=(y-rect.top)/(rect.bottom-rect.top),p=(y*W+x)*3;for(let c=0;c<3;c++)clean[p+c]=Math.round((colors[0][c]*(1-u)+colors[1][c]*u)*(1-v)+(colors[2][c]*(1-u)+colors[3][c]*u)*v);}
const g=plan.targets['P4.C1'].geometry.native,nativePoints=plan.tableProjection?.mode==='flat'?flatQuad(g,g,'native',plan.tableProjection.heading):quad(g,'native'),points=nativePoints.map(p=>({x:p.x*1763/1761,y:p.y}));
if(points.some(p=>p.x<790||p.x>930||p.y<1030||p.y>1150))throw Error('P4 target outside clear marker corridor');
const marker=Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><polygon points="${points.map(p=>`${p.x},${p.y}`).join(' ')}" fill="#075ad8" stroke="#d8e4ef" stroke-width="1" stroke-linejoin="round"/></svg>`);
const end=await sharp(clean,{raw:{width:W,height:H,channels:3}}).composite([{input:marker}]).png().toBuffer(),after=await sharp(end).removeAlpha().raw().toBuffer();
const box={left:Math.floor(Math.min(...points.map(p=>p.x)))-2,right:Math.ceil(Math.max(...points.map(p=>p.x)))+2,top:Math.floor(Math.min(...points.map(p=>p.y)))-2,bottom:Math.ceil(Math.max(...points.map(p=>p.y)))+2};
let changed=0;for(let y=0;y<H;y++)for(let x=0;x<W;x++){const p=(y*W+x)*3;if(!after.subarray(p,p+3).equals(normalized.subarray(p,p+3))){changed++;if(!((x>=rect.left&&x<=rect.right&&y>=rect.top&&y<=rect.bottom)||(x>=box.left&&x<=box.right&&y>=box.top&&y<=box.bottom)))throw Error('Image changed outside geometric marker');}}
await mkdir(dir,{recursive:true});
for(const[name,b]of [['start.png',start],['end.png',end],['imagegen-end.png',original],['placement-plan.json',planBytes]]as const)await writeFile(`${dir}/${name}`,b,{flag:'wx'});
const inputs={start:{path:`${dir}/start.png`,sha256:hash(start)},end:{path:`${dir}/end.png`,sha256:hash(end)},placementRef:{path:`${dir}/placement-plan.json`,sha256:hash(planBytes),source:'placements/default.json',updatedAt:plan.updatedAt,plannedTarget:'P4.C1'},imageEdit:{tool:'built-in imagegen',originalEditedImage:{path:`${dir}/imagegen-end.png`,sha256:hash(original),width:meta.width,height:meta.height},request:'Correct anatomical left hand to visibly open palm up after release; preserve Pamela, green plate, resting hand and shoe.',normalization:{from:[1536,1024],to:[W,H],fit:'fill'},geometricMarker:{method:'Only flat green marker corridor reconstructed from its four clean corners, then exact saved-plan SVG target; all other normalized pixels identical',removedBlueBoundingBox:[minX,minY,maxX,maxY],changedPixels:changed,nativePoints,submittedPoints:points},limitations:'AI edit may change photographic details; visual identity, anatomy and continuity require review. Exact marker position is planned; generated motion still requires measured landing.'}};
await writeFile(`${dir}/inputs.json`,JSON.stringify(inputs,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({start:inputs.start,end:inputs.end,plan:inputs.placementRef,marker:inputs.imageEdit.geometricMarker}));
