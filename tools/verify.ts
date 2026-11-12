import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const digest=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(await readFile('data/manifest.json','utf8')); // its paths are relative to the repo root
for(const file of manifest.files){
 const resolved=path.resolve(file.path);
 if(!resolved.startsWith(process.cwd()+path.sep))throw Error('Nonlocal input: '+file.path);
 if(digest(await readFile(resolved))!==file.sha256)throw Error('Changed input: '+file.path);
}
console.log(`Verified ${manifest.files.length} registered local files.`);
if(process.argv.includes('--frames')){
 const {default:sharp}=await import('sharp');
 const {createPamelaCardContactV6Renderer}=await import('../src/pamela-card-contact-v6.ts');
 const plan=JSON.parse(await readFile('assets/timeline.json','utf8'));
 const tracks=JSON.parse(await readFile('assets/tracking/card-tracks.json','utf8'));
 const render=await createPamelaCardContactV6Renderer();
 const checks=manifest.files.filter((f:{role:string})=>f.role==='uncompressed-reference-frame');
 const results=[];
 for(const check of checks){
  const frame=Number(check.path.match(/native-(\d+)\.png$/)[1]), entry=plan.timeline[frame];
  const name=`frame-${String(entry.sourceFrame+1).padStart(3,'0')}.png`;
  const source=await readFile(`${plan.sources[entry.clip].dir}/${name}`);
  const raw=await sharp(source).removeAlpha().raw().toBuffer();
  const data={...entry,raw};
  if(entry.clip==='deal'){
   const track=tracks.frames[entry.sourceFrame];
   if(digest(source)!==track.frameSha256)throw Error('Source raster mismatch');
   data.mask=await sharp(`assets/tracking/moving-mask/${name}`).greyscale().raw().toBuffer();
   data.shoeMask=await sharp(`assets/tracking/shoe-mask/${name}`).greyscale().raw().toBuffer();
   data.contour=track.moving.contourNative;data.quad=track.moving.quadNative;
  }
  const actual=(await render(data)).native;
  const expected=await sharp(check.path).removeAlpha().raw().toBuffer();
  if(!actual.equals(expected))throw Error('Rendered pixels differ at frame '+frame);
  results.push({frame,pixelIdentical:true});console.log('Pixel-identical frame '+frame);
 }
 await mkdir('output/verification',{recursive:true});
 const receipt={createdAt:new Date().toISOString(),node:process.version,sharp:sharp.versions,checks:results,fullMovieVerified:false};
 await writeFile('output/verification/frames.json',JSON.stringify(receipt,null,2)+'\n');
}
