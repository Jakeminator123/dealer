import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';

// Bottom-up: the documents follow what is there (Jakob 2026-11-20, in Beslut: "dokumentation ändras utifrån vad som
// faktiskt finns"). A path in backticks in a document that Git keeps names a file or folder that is there, so a file
// that is removed or renamed takes its mentions with it in the same change (AGENTS.md, "Git och samarbete": döda
// sökvägar). A path is read from the repository's root and from the document's own folder (dealer3d/LASMIG.md names its
// own `tools/` and `data/`). A path that Git ignores counts as there: it lives on a machine and never in a checkout (the
// studio's build in studio/out/, node_modules, tools/python/.venv/, media), so the test gives the same answer here and in
// a clean checkout such as push-clean's. Not checked: a path with a placeholder or a pattern in it, a path outside the
// repository, and the receipts in evidence/, which describe the repository as it was.

/** A mention that is history on purpose: the file is gone and the sentence says so. */
const HISTORY: {doc: string; path: string}[] = [
];

const FOLDERS = /^(?:\.\.\/)*(?:src|tools|data|docs|studio|dealer3d|game|pages|cloud|motions|placements|materials|functions|tests|page)\//;

/** Git without what a hook may have exported, so it reads the checkout the test runs in (as tools/publication-check.ts). */
function git(args:string[],input?:string):string {
  const env={...process.env};
  for(const key of ['GIT_DIR','GIT_WORK_TREE','GIT_INDEX_FILE','GIT_COMMON_DIR','GIT_OBJECT_DIRECTORY','GIT_ALTERNATE_OBJECT_DIRECTORIES'])delete env[key];
  return execFileSync('git',args,{env,input,encoding:'utf8',maxBuffer:32*1024*1024,stdio:['pipe','pipe','pipe']});
}

/** The documents Git keeps, without the receipts. */
const documents=()=>git(['ls-files','-z','--','*.md']).split('\0').filter(name=>name&&!name.startsWith('evidence/'));

/**
 * Of these paths, the ones Git ignores. A path named without a trailing slash may be a folder, and a rule for folders
 * only (`out/`) matches a folder that is not there only when it is asked about with the slash, so each is asked both ways.
 */
export function ignoredByGit(paths:string[]):Set<string> {
  if(!paths.length)return new Set();
  let out:string;
  try{out=git(['check-ignore','--stdin','-z'],paths.flatMap(p=>[p,p+'/']).join('\0')+'\0');}
  catch(error){const e=error as {status?:number;stdout?:string};if(e.status!==1)throw error;out=e.stdout??'';} // 1: none ignored
  return new Set(out.split('\0').filter(Boolean).map(p=>p.replace(/\/$/,'')));
}

/** The paths in backticks on one line of a document, each with the places in the repository it may mean. */
export function mentions(doc:string,line:string):{named:string;places:string[]}[] {
  const found:{named:string;places:string[]}[]=[];
  for(const match of line.matchAll(/`([^`\s]+)`/g)){
    const named=match[1].replace(/[),.;]+$/,'').replace(/:\d+(?:[–-]\d+)?$/,'').replace(/[#?].*$/,'');
    if(!FOLDERS.test(named)||/[*<>{}$]|\.\.\.|…/.test(named))continue;
    const places=[...new Set([named,path.posix.join(path.posix.dirname(doc),named)].map(p=>path.posix.normalize(p).replace(/\/$/,'')))]
      .filter(p=>p!=='..'&&!p.startsWith('../'));
    if(places.length)found.push({named,places});
  }
  return found;
}

/** The paths named on one line that are not there. */
export const deadPaths=(doc:string,line:string,isThere:(p:string)=>boolean)=>
  mentions(doc,line).filter(m=>!m.places.some(isThere)).map(m=>m.named);

test('a path in backticks in a document names a file or folder that is there',()=>{
  const docs=documents();
  assert.ok(['AGENTS.md','docs/SYSTEM.md','dealer3d/LASMIG.md'].every(d=>docs.includes(d))&&docs.some(d=>d.startsWith('.claude/skills/')),'the documents were found');
  const lines=docs.flatMap(doc=>readFileSync(doc,'utf8').split('\n').map((line,i)=>({doc,line,at:i+1})));
  const missing=[...new Set(lines.flatMap(({doc,line})=>mentions(doc,line).flatMap(m=>m.places)))].filter(p=>!existsSync(p));
  const ignored=ignoredByGit(missing);
  const isThere=(p:string)=>existsSync(p)||ignored.has(p);
  const dead:string[]=[];
  for(const {doc,line,at} of lines)for(const named of deadPaths(doc,line,isThere)){
    if(!HISTORY.some(h=>h.doc===doc&&h.path===named))dead.push(`${doc}:${at} ${named}`);
  }
  assert.deepEqual(dead,[],'a document names a path that is not there: change the document in the same change, or say in it that the file is gone');
});

test('each mention kept as history is still in its document, and its file is still gone',()=>{
  for(const h of HISTORY){
    assert.ok(readFileSync(h.doc,'utf8').includes('`'+h.path+'`'),`${h.doc} no longer names ${h.path}: take it out of HISTORY`);
    assert.ok(!existsSync(h.path),`${h.path} is there again: take it out of HISTORY`);
  }
});

test('what Git ignores counts as there, also a folder that is missing from a checkout',()=>{
  const ignored=ignoredByGit(['studio/out','studio/out/bygge.json','studio/node_modules','tools/python/.venv','tools/python/models','assets/x.png','tools/borta.ts','docs']);
  assert.deepEqual([...ignored].sort(),['assets/x.png','studio/node_modules','studio/out','studio/out/bygge.json','tools/python/.venv','tools/python/models']);
});

test('how a path is read: line numbers, anchors, the document\'s own folder and the edge of the repository',()=>{
  const there=new Set(['src/a.ts','dealer3d/tools/b.ts','docs']);
  const isThere=(p:string)=>there.has(p);
  assert.deepEqual(deadPaths('docs/X.md','`src/a.ts:12–14` och `src/a.ts#del` och `src/a.ts?x=1`',isThere),[]);
  assert.deepEqual(deadPaths('dealer3d/LASMIG.md','`tools/b.ts` och `../src/a.ts`',isThere),[]);
  assert.deepEqual(deadPaths('docs/X.md','`src/borta.ts`, `tools/c.ts`',isThere),['src/borta.ts','tools/c.ts']);
  assert.deepEqual(deadPaths('docs/X.md','`assets/film.mp4` `src/<namn>.ts` `data/*.json` `scene3d.html` `npm test`',isThere),[]);
  assert.deepEqual(mentions('README.md','`../tools/annat-repo.ts`'),[],'a path outside the repository is not checked');
});
