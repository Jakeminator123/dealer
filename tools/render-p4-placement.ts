// Explicit one-shot local rendering of a source-bound P4 placement candidate.
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import sharp from 'sharp';
import {validatePlan,flatQuad,quad} from '../src/placement-model.ts';
import {createP4PlacementRetarget,P4_SOURCE_SHA,P4_NATIVE,type XY} from '../src/p4-placement-retarget.ts';
import {keyPamelaFrame} from '../src/pamela-key.ts';
import {buildPamelaContactLayers} from '../src/pamela-contact-shadow.ts';
sharp.concurrency(1);
const id='pamela-p4-c1-plan-retarget-02',dir=`assets/motions/${id}`;
const source='assets/motions/pamela-p4-c1-source-turn/source.mp4',planSource='placements/default.json';
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const sourceBytes=await readFile(source);if(hash(sourceBytes)!==P4_SOURCE_SHA)throw Error('Source changed');
const planBytes=await readFile(planSource),plan=JSON.parse(planBytes.toString());validatePlan(plan);
if(plan.targets['P4.C1'].intent.takeHand!=='LH'||plan.targets['P4.C1'].intent.startSide!=='BACK'||plan.targets['P4.C1'].intent.endSide!=='FRONT'||plan.targets['P4.C1'].intent.pass)throw Error('P4 intent differs');
const g=plan.targets['P4.C1'].geometry.native;
const points=plan.tableProjection?.mode==='flat'?flatQuad(g,g,'native',plan.tableProjection.heading):quad(g,'native');
const target=points.map(p=>[p.x,p.y] as XY),warp=createP4PlacementRetarget(target,P4_SOURCE_SHA);
if(!process.argv.includes('--render')){console.log(JSON.stringify({id,planSha:hash(planBytes),target,diagnostics:warp.diagnostics()}));process.exit(0);}
if(await stat(dir).catch(()=>null))throw Error('Candidate already exists; never overwrite an earlier review');
await mkdir(dir,{recursive:true});await writeFile(`${dir}/placement-plan.json`,planBytes,{flag:'wx'});
await writeFile(`${dir}/request.lock`,'Local render only, no paid API request\n',{flag:'wx'});
const {width:W,height:H}=P4_NATIVE,frameBytes=W*H*3;
// Keep the green plate for physical-motion acceptance. A generic chroma key
// removes the green-reflected thin card edge and must not hide that evidence.
const executable=process.env.FFMPEG??'ffmpeg';
// Explicit even chroma offset: the earlier x=1 was rounded to0 for yuv420p.
const decoder=spawn(executable,['-v','error','-threads','1','-i',source,'-vf','crop=1762:1174:0:0','-frames:v','89','-f','rawvideo','-pix_fmt','rgb24','-threads','1','pipe:1'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
const output=`${dir}/preview.mp4`,encoder=spawn(executable,['-v','error','-nostdin','-f','rawvideo','-pix_fmt','rgb24','-s',`${W}x${H}`,'-r','30','-i','pipe:0','-an','-c:v','libx264','-crf','17','-preset','fast','-pix_fmt','yuv420p','-threads','1','-movflags','+faststart','-n',output],{windowsHide:true,stdio:['pipe','ignore','pipe']});
let decoderError='',encoderError='';decoder.stderr.on('data',b=>decoderError+=b);encoder.stderr.on('data',b=>encoderError+=b);
const decodeDone=once(decoder,'close'),encodeDone=once(encoder,'close');
let pending=Buffer.alloc(0),frame=0,unchangedFlipFrames=0;
const checks:number[]=[0,48,57,60,63,70,76,77,78,88];
try {
 for await(const chunk of decoder.stdout){pending=Buffer.concat([pending,chunk]);while(pending.length>=frameBytes){const raw=pending.subarray(0,frameBytes);pending=pending.subarray(frameBytes);const moved=warp.apply(raw,frame);if(frame<=63){if(!moved.equals(raw))throw Error('Physical turn pixels changed');unchangedFlipFrames++;}
  const out=moved;
  for(let y=760;y<900;y++)for(let x=540;x<=840;x++){const p=(y*W+x)*3;if(!out.subarray(p,p+3).equals(raw.subarray(p,p+3)))throw Error('Resting right-hand protected region changed');}
  if(checks.includes(frame))await sharp(out,{raw:{width:W,height:H,channels:3}}).png().toFile(`${dir}/f${String(frame).padStart(3,'0')}.png`);
  if(!encoder.stdin.write(out))await once(encoder.stdin,'drain');frame++;if(frame%30===0)console.log(`P4 ${frame}/89`);
 }}
 encoder.stdin.end();const [dc]=await decodeDone,[ec]=await encodeDone;if(dc!==0||ec!==0||frame!==89||pending.length)throw Error(`Incomplete P4 render ${frame}: ${decoderError} ${encoderError}`);
}catch(error){decoder.kill();encoder.kill();throw error;}
const result=await readFile(output),probe=JSON.parse(execFileSync(process.env.FFPROBE??'ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height,r_frame_rate,nb_frames,duration','-of','json',output],{encoding:'utf8',windowsHide:true})).streams[0];
if(probe.width!==W||probe.height!==H||Number(probe.nb_frames)!==89||probe.r_frame_rate!=='30/1')throw Error('Output format mismatch');
const code=[];for(const path of ['src/p4-placement-retarget.ts','src/placement-model.ts','tools/render-p4-placement.ts'])code.push({path,sha256:hash(await readFile(path))});
const receipt={schemaVersion:1,id,createdAt:new Date().toISOString(),source:{path:source,sha256:P4_SOURCE_SHA,cut:[0,89],crop:{left:0,right:2,reason:'explicit even chroma-aligned crop from1764 to1762; no rescaling'}},code,placementRef:{path:`${dir}/placement-plan.json`,sha256:hash(planBytes),source:planSource,unchangedDuringRender:hash(await readFile(planSource))===hash(planBytes),updatedAt:plan.updatedAt},output:{path:output,sha256:hash(result),bytes:result.length,width:W,height:H,fps:30,frameCount:89},physicalIntent:{takeHand:'LH',startSide:'BACK',endSide:'FRONT',turn:true,pass:false},warp:{...warp.diagnostics(),unchangedFlipFrames,restingHandProtectedRectangle:[540,760,840,899]},acceptance:{decision:'PENDING',sourceTurn:'preserved original pixels through frame63',landedContour:'target quad is inferred from original rim; measure encoded output before acceptance',contact:'hand and card share the same mapping, review required',returnToShoe:false},limitations:['Local two-dimensional warp, not a new recorded/anatomically reconstructed movement.','P4.C1 only; no return, C2, full deal or Scout integration.','Current saved file is frozen; unsaved browser edits are not included.','Original green plate retained: generic keying erases the thin reflected edge; dedicated edge matte remains.','No replacement of original card surfaces or V6 source.'],apiJobs:0};
await writeFile(`${dir}/render.json`,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(receipt));
