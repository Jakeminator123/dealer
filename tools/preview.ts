import http from 'node:http';
import {readFile,mkdir,writeFile,stat,unlink} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
import path from 'node:path';
import {placementStore,StoreError} from './placement-store.ts';
const port=4319,origin=`http://127.0.0.1:${port}`,state='.runtime/preview.json';
if(process.argv.includes('--stop')||process.argv.includes('--status')){
 const s=JSON.parse(await readFile(state,'utf8'));
 if(s.root!==process.cwd()||s.port!==port)throw Error('Preview identity differs');
 const stop=process.argv.includes('--stop');
 const r=await fetch(origin+(stop?'/stop':'/health'),{method:stop?'POST':'GET',headers:stop?{'x-dealer-token':s.token}:{}});
 if(!r.ok)throw Error('Preview control failed');console.log(await r.text());
}else{
 const manifest=JSON.parse(await readFile('manifest.json','utf8'));
 const allowed=new Set(['preview.html','lab.html','lab.css','assets/lab/native.jpg','assets/lab/portrait.jpg','materials/kortmaterial.html','materials/markermaterial.html',...manifest.files.map((f:{path:string})=>f.path).filter((p:string)=>p.startsWith('assets/')||p.startsWith('materials/')||p.startsWith('output/v6/'))]);
 const scripts:Record<string,string>={'/preview-ui.js':'src/preview-ui.ts','/lab-ui.js':'src/lab-ui.ts','/placement-model.js':'src/placement-model.ts','/materials/source/src/card-material-study.js':'materials/source/src/card-material-study.ts'};
 const placements=placementStore(process.cwd());
 const library=async()=>{try{const data=JSON.parse(await readFile('data/library.json','utf8'));data.items=await Promise.all(data.items.filter((item:{path:string})=>typeof item.path==='string'&&/^(assets\/|output\/v6\/)/.test(item.path)&&path.posix.normalize(item.path)===item.path&&!item.path.includes('\\')&&item.path.endsWith('.mp4')).map(async(item:{motionRef?:string})=>{if(item.motionRef&&/^motions\/[a-z0-9-]+\.json$/.test(item.motionRef)){try{const motion=JSON.parse(await readFile(item.motionRef,'utf8'));return {...item,reviewDecision:motion.review?.decision??'PENDING'};}catch{return {...item,reviewDecision:'UNKNOWN'};}}return item;}));return data;}catch{return {schemaVersion:1,items:[]};}};
 const token=randomUUID();let lastSeen=Date.now();
 const types:Record<string,string>={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mp4':'video/mp4','.png':'image/png','.jpg':'image/jpeg','.json':'application/json'};
 const stop=()=>server.close();
 const server=http.createServer(async(req,res)=>{
  try{
   res.setHeader('Cache-Control','no-store');
   if(req.headers.host!==`127.0.0.1:${port}`){res.writeHead(403).end();return;}
   const url=new URL(req.url??'/',origin);
   if(url.pathname==='/health'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({name:'dealer',root:process.cwd(),pid:process.pid,port}));return;}
   if(url.pathname==='/stop'&&req.method==='POST'&&req.headers['x-dealer-token']===token){res.end('Stopped dealer preview');stop();return;}
   if(url.pathname==='/heartbeat'&&req.method==='POST'&&req.headers.origin===origin){lastSeen=Date.now();res.end('ok');return;}
   if(url.pathname==='/api/placements'){
    res.setHeader('Content-Type','application/json; charset=utf-8');
    if(req.method==='GET'){res.end(JSON.stringify(await placements.load()));return;}
    if(req.method!=='PUT'){res.writeHead(405).end();return;}
    if(req.headers.origin!==origin){res.writeHead(403).end(JSON.stringify({error:'Spara från det lokala labbet.'}));return;}
    if(!req.headers['content-type']?.startsWith('application/json')){res.writeHead(415).end(JSON.stringify({error:'JSON krävs.'}));return;}
    if(Number(req.headers['content-length']??0)>65536){res.writeHead(413).end(JSON.stringify({error:'Placeringsfilen är för stor.'}));return;}
    try{
     let size=0;const chunks:Buffer[]=[];for await(const chunk of req){size+=chunk.length;if(size>65536)throw new StoreError(413,'Placeringsfilen är för stor.');chunks.push(chunk);}
     const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
     const result=await placements.save(value,typeof req.headers['if-match']==='string'?req.headers['if-match']:undefined);
     res.end(JSON.stringify(result));
    }catch(error){res.writeHead(error instanceof StoreError?error.status:400).end(JSON.stringify({error:(error as Error).message}));}return;
   }
   if(url.pathname==='/api/library'&&req.method==='GET'){res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(await library()));return;}
   if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end();return;}
   if(scripts[url.pathname]){res.setHeader('Content-Type','text/javascript');res.end(stripTypeScriptTypes(await readFile(scripts[url.pathname],'utf8')));return;}
   const file=url.pathname==='/'?'lab.html':decodeURIComponent(url.pathname.slice(1));
   if(!allowed.has(file)&&!(await library()).items.some((item:{path:string})=>item.path===file)){res.writeHead(404).end();return;}
   const size=(await stat(file)).size,ext=file.slice(file.lastIndexOf('.'));
   res.setHeader('Content-Type',types[ext]??'application/octet-stream');res.setHeader('Accept-Ranges','bytes');
   let start=0,end=size-1;
   if(req.headers.range){
    const m=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
    if(!m){res.writeHead(416,{'Content-Range':`bytes */${size}`}).end();return;}
    start=Number(m[1]);end=m[2]?Number(m[2]):end;
    if(start>end||end>=size){res.writeHead(416,{'Content-Range':`bytes */${size}`}).end();return;}
    res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':end-start+1});
   }else res.setHeader('Content-Length',size);
   if(req.method==='HEAD'){res.end();return;}
   const stream=createReadStream(file,{start,end});stream.on('error',()=>res.destroy());stream.pipe(res);res.on('close',()=>stream.destroy());
  }catch{if(!res.headersSent)res.writeHead(500);res.end();}
 });
 const timer=setInterval(()=>{if(Date.now()-lastSeen>60000)stop();},5000);timer.unref();
 server.on('error',error=>{console.error(error.message);process.exitCode=1;});
 server.on('close',()=>{clearInterval(timer);void unlink(state).catch(()=>{});});
 server.listen(port,'127.0.0.1',async()=>{await mkdir('.runtime',{recursive:true});await writeFile(state,JSON.stringify({root:process.cwd(),port,pid:process.pid,parent:process.ppid,executable:process.execPath,script:'tools/preview.ts',startedAt:new Date().toISOString(),token}));console.log(origin);});
 process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
