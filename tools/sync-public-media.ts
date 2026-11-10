// Upload only the selected library MP4s. Credentials stay in the local runtime
// env file/process memory; the public manifest contains no credential or query.
// Preview: node tools/sync-public-media.ts. Upload: add --upload.
// The development-only store token belongs in .runtime/blob-sync/.env.local,
// outside the public deployment directory.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {parseEnv} from 'node:util';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
if(path.resolve(process.cwd())!==root)throw Error('Run from the dealer checkout.');
const identity={provider:'vercel-blob',projectId:'prj_7zd112w6MIX9YnpcR7Nj64Ke50yk',teamId:'team_Scxorb9qtZHjNae1YEQnFCaT',storeId:'store_qeojzIHuA5ewT4uO',access:'public'} as const;
const project=JSON.parse(await readFile('.runtime/public-deploy/.vercel/project.json','utf8'));
if(project.projectId!==identity.projectId||project.orgId!==identity.teamId)throw Error('Vercel project identity mismatch.');
type Entry={id:string;path:string;url:string;sha256:string;bytes:number};
type LibraryItem={id:string;path:string;sha256:string};
const digest=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const library=JSON.parse(await readFile('data/library.json','utf8')) as {items:LibraryItem[]};
if(![8,9].includes(library.items.length)||new Set(library.items.map(item=>item.id)).size!==library.items.length||!library.items.some(item=>item.id==='pamela-p7-c1-left-direct-pilot-01')||(library.items.length===9&&!library.items.some(item=>item.id==='pamela-p7-c1-left-turn-pilot-03')))throw Error('Review the upload scope: seven existing films, the secondary P7 direct trial and optionally the explicitly requested P7 turn trial 03.');
const selected=[] as (LibraryItem&{bytes:number})[];
for(const item of library.items){
 if(!/^(assets\/|output\/v6\/)[a-zA-Z0-9/_.-]+\.mp4$/.test(item.path)||item.path.includes('..')||!/^([a-f0-9]{64})$/.test(item.sha256))throw Error('Invalid library media path or hash.');
 const file=await readFile(path.join(root,item.path));
 if(digest(file)!==item.sha256)throw Error(`Local source hash mismatch: ${item.id}`);
 selected.push({...item,bytes:file.length});
}
const totalBytes=selected.reduce((sum,item)=>sum+item.bytes,0);
if(totalBytes>250_000_000)throw Error('Selected media unexpectedly exceeds 250 MB.');
const manifestFile='data/public-media.json',progressFile='.runtime/blob-sync/progress.json';
const existing=await readFile(manifestFile,'utf8').then(JSON.parse).catch(()=>null);
const progress=await readFile(progressFile,'utf8').then(JSON.parse).catch(()=>null);
for(const receipt of [existing,progress])if(receipt&&(receipt.storeId!==identity.storeId||receipt.projectId!==identity.projectId||receipt.teamId!==identity.teamId))throw Error('Existing Blob receipt identity mismatch.');
const known:Entry[]=[...(existing?.entries??[]),...(progress?.entries??[])];
const saved=new Map(known.map(entry=>[`${entry.id}:${entry.sha256}`,entry]));
const reused=selected.filter(item=>known.some(entry=>entry.id===item.id&&entry.sha256===item.sha256)).length;
console.log(JSON.stringify({mode:process.argv.includes('--upload')?'upload':'plan',...identity,files:selected.length,totalBytes,newUploads:selected.length-reused}));
if(!process.argv.includes('--upload'))process.exit(0);

const configured=parseEnv(await readFile('.runtime/blob-sync/.env.local','utf8'));
const token=configured.BLOB_READ_WRITE_TOKEN;
if(!token?.startsWith(`vercel_blob_rw_${identity.storeId.slice(6)}_`))throw Error('Unexpected Blob credential identity.');
const wrapper=execFileSync('volta',['which','vercel'],{encoding:'utf8',windowsHide:true}).trim();
const packageRoot=path.join(path.dirname(wrapper),'node_modules/vercel');
const cliPackage=JSON.parse(readFileSync(path.join(packageRoot,'package.json'),'utf8'));
const cli=path.resolve(packageRoot,cliPackage.bin.vercel);
const env={...process.env,BLOB_READ_WRITE_TOKEN:token};
// The CLI provisioning response included an OIDC token without BLOB_STORE_ID.
// Use this store's explicit read/write credential without changing cloud auth.
delete env.VERCEL_OIDC_TOKEN;delete env.BLOB_STORE_ID;
await mkdir('.runtime/blob-sync',{recursive:true});
const entries:Entry[]=[];
let uploaded=0;
for(const item of selected){
 const pathname=`dealer/${item.sha256}.mp4`;
 let url=known.find(entry=>entry.id===item.id&&entry.sha256===item.sha256)?.url;
 if(!url){
  // CLI Boolean flags take no value. Omitting these uses the verified defaults:
  // addRandomSuffix=false, allowOverwrite=false, multipart=true.
  const result=spawnSync(process.execPath,[cli,'blob','put',path.join(root,item.path),'--access','public','--pathname',pathname,'--content-type','video/mp4','--cache-control-max-age','31536000','--scope','scoutgaming','--no-color'],{cwd:root,env,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:4_000_000});
  const output=`${result.stdout??''}\n${result.stderr??''}`.replaceAll(token,'[redacted]').replace(/\u001b\[[0-9;]*m/g,'');
  if(result.status!==0)throw Error(`Upload failed for ${item.id}: ${output.slice(-1500)}`);
  url=output.match(/https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/[^\s"'<>)]*/i)?.[0];
  if(!url)throw Error(`Upload succeeded for ${item.id}, but its public URL needs inspection before any retry.`);
  uploaded++;
 }
 const parsed=new URL(url);
 if(parsed.protocol!=='https:'||parsed.hostname!==`${identity.storeId.slice(6).toLowerCase()}.public.blob.vercel-storage.com`||parsed.pathname!==`/${pathname}`||parsed.search||parsed.hash)throw Error('Unexpected public Blob URL.');
 // Keep the uploaded URL even if a later download is interrupted. Every reused
 // URL is still re-read and verified before it enters the public manifest.
 saved.set(`${item.id}:${item.sha256}`,{id:item.id,path:item.path,url,sha256:item.sha256,bytes:item.bytes});
 await writeFile(progressFile,JSON.stringify({...identity,entries:[...saved.values()]},null,2)+'\n');
 // Re-read every public object and hash it before publishing the final manifest.
 const response=await fetch(url,{signal:AbortSignal.timeout(120000)});
 if(!response.ok)throw Error(`Anonymous verification HTTP ${response.status}: ${item.id}`);
 if(!(response.headers.get('content-type')??'').startsWith('video/mp4'))throw Error(`Unexpected content type: ${item.id}`);
 const remote=Buffer.from(await response.arrayBuffer());
 if(remote.length!==item.bytes||digest(remote)!==item.sha256)throw Error(`Public object hash mismatch: ${item.id}`);
 entries.push({id:item.id,path:item.path,url,sha256:item.sha256,bytes:item.bytes});
 console.log(JSON.stringify({id:item.id,verified:true,bytes:item.bytes,completed:entries.length,total:selected.length}));
}
// Re-check the library did not change while uploads were running.
const current=JSON.parse(await readFile('data/library.json','utf8')) as {items:LibraryItem[]};
if(JSON.stringify(current.items.map(({id,path,sha256})=>({id,path,sha256})))!==JSON.stringify(library.items.map(({id,path,sha256})=>({id,path,sha256}))))throw Error('Library changed during upload; final manifest not written.');
await writeFile(manifestFile,JSON.stringify({schemaVersion:1,...identity,entries},null,2)+'\n');
await writeFile('evidence/public-media-verification.json',JSON.stringify({verifiedAt:new Date().toISOString(),...identity,files:entries.length,totalBytes,uploaded,reused:entries.length-uploaded,verification:'Anonymous HTTPS GET, video/mp4, exact byte count and SHA-256 for every selected film',contentAddressed:true,overwriteAllowed:false,manifest:manifestFile,credentialEnvironment:'development only',localLibraryUnchanged:true},null,2)+'\n');
console.log(JSON.stringify({manifest:manifestFile,files:entries.length,totalBytes,uploaded,verified:true}));
