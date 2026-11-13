// The lab server hands out the modules in SCRIPTS (tools/lab-routes.ts) and it serves the working tree. A module that imports a
// neighbour in src/ which the list does not name therefore loads in no browser: the import answers 404 and the whole page, the
// game and the scene with it, stays dead until the list is changed and the server restarted. That happened twice on 2026-11-13.
// This test reads every listed module as the browser gets it and says which neighbour is missing, so the fault shows before a
// page is loaded:   node --test tools/lab-modules.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {SCRIPTS, VENDOR, forBrowser} from './lab-routes.ts';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** The relative module addresses a browser module asks for: static and dynamic imports and re-exports, comments left out. */
export function importsOf(code: string): string[] {
  const bare = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const found = new Set<string>();
  for (const m of bare.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"]+)\1/g)) found.add(m[2]);
  return [...found];
}
/** The address the browser asks the server for, as it resolves an import from the module's own address (query left out). */
export const asked = (from: string, spec: string) => new URL(spec, `http://lab${from}`).pathname;
/** Whether the server has something to answer with: a listed module or vendor file, or, outside the root, a file of the checkout. */
function handedOut(address: string): boolean {
  if (address in SCRIPTS || address in VENDOR) return true;
  if (/^\/[^/]+$/.test(address) || address.startsWith('/vendor/')) return false; // a neighbour in src/, or three.js: the lists decide
  const file = path.join(repo, address);
  return existsSync(file) || existsSync(file.replace(/\.js$/, '.ts'));
}

test('importsOf reads static, dynamic and re-exported neighbours as the browser gets them, and skips comments', () => {
  const source = "import {a} from './a.ts';\nimport type {B} from './b.ts';\nexport {c} from \"./c.js\";\nconst d = await import('./d.ts');\nimport './e.ts';\n// import {x} from './not.ts';\n/* from './nor.ts' */\nimport * as T from 'three';\nexport const n: number = 1;\n";
  assert.deepEqual(importsOf(forBrowser(source)).sort(), ['./a.js', './c.js', './d.js', './e.js'], 'a type-only import is gone before the browser sees the module');
  assert.equal(asked('/game-page.js', './game-film.js'), '/game-film.js');
  assert.equal(asked('/game-page.js', '../game/session.js'), '/game/session.js');
  assert.equal(asked('/materials/source/src/card-material-study.js', '../references/x.js?v=1'), '/materials/source/references/x.js');
});

test('every neighbour that a module of the lab server imports is handed out too', () => {
  const missing: string[] = [];
  for (const [address, file] of Object.entries(SCRIPTS)) {
    // A listed module that has not been written is answered with an empty module (tools/preview.ts), so it breaks nothing.
    if (!existsSync(path.join(repo, file))) continue;
    for (const spec of importsOf(forBrowser(readFileSync(path.join(repo, file), 'utf8')))) {
      const want = asked(address, spec);
      if (!handedOut(want)) missing.push(`${file} imports ${spec}, and the server has nothing at ${want}: add the module to SCRIPTS in tools/lab-routes.ts and restart the lab server`);
    }
  }
  assert.deepEqual(missing, []);
});
