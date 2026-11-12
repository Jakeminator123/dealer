// The studio (studio/, a Next.js app) is built to static files in studio/out/, and the lab server hands them out
// under /studio/. This is the one place that turns an address into a file there. It never leaves that folder, it
// never lists it, and it hands out only the kinds of file a built studio consists of.
import {realpath,stat} from 'node:fs/promises';
import path from 'node:path';

export const STUDIO_TYPES:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.txt':'text/plain; charset=utf-8','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
export type StudioAnswer={kind:'file';file:string;type:string}|{kind:'redirect';to:string}|{kind:'unbuilt'}|{kind:'none'};

const isFile=(file:string)=>stat(file).then(s=>s.isFile(),()=>false);

// pathname: the address as asked for ("/studio/karta/"); out: the built studio. A folder is answered with its
// index.html, and a folder asked for without its closing slash is sent to the address with it, so that the page's
// own relative links keep working.
export async function resolveStudio(pathname:string,out='studio/out'):Promise<StudioAnswer>{
 if(pathname==='/studio')return {kind:'redirect',to:'/studio/'};
 if(!pathname.startsWith('/studio/'))return {kind:'none'};
 const base=await realpath(out).catch(()=>null);
 if(!base||!await isFile(path.join(base,'index.html')))return {kind:'unbuilt'};
 let wanted:string;try{wanted=decodeURIComponent(pathname.slice('/studio/'.length));}catch{return {kind:'none'};}
 if(/[\\\0:]/.test(wanted)||wanted.startsWith('/')||wanted.split('/').some(part=>part==='..'||part==='.'))return {kind:'none'};
 // Only what really lies in the built folder: a link that leads out of it is not followed.
 const inside=async(relative:string)=>{const real=await realpath(path.join(base,relative)).catch(()=>null);return real&&(real===base||real.startsWith(base+path.sep))?real:null;};
 const folder=wanted===''||wanted.endsWith('/');
 const file=await inside(folder?wanted+'index.html':wanted);
 if(file&&await isFile(file)){const type=STUDIO_TYPES[path.extname(file).toLowerCase()];return type?{kind:'file',file,type}:{kind:'none'};}
 // A view's prefetch file: the page asks for "karta/__next.karta.__PAGE__.txt", and the export writes the same segments as
 // folders, "karta/__next.karta/__PAGE__.txt". Without this every change of view would be a whole page load.
 const at=wanted.lastIndexOf('/')+1,parts=wanted.slice(at).replace(/\.txt$/,'').split('.');
 if(wanted.endsWith('.txt')&&parts[0]==='__next'&&parts.length>=3){
  const nested=await inside(`${wanted.slice(0,at)}__next.${parts[1]}/${parts.slice(2).join('/')}.txt`);
  if(nested&&await isFile(nested))return {kind:'file',file:nested,type:STUDIO_TYPES['.txt']};
 }
 if(!folder){const index=await inside(wanted+'/index.html');if(index&&await isFile(index))return {kind:'redirect',to:pathname+'/'};}
 return {kind:'none'};
}
