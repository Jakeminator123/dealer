// node --test dealer3d/page/server.test.ts
// The doll lab's routes (dealer3d/page/server.ts) on a real local server over a temporary folder: "Spara som standard"
// writes one file into dealer3d/standard/ and nowhere else, only from the lab's own origin, only under a name that is a
// doll and a place, only a motion that names the same doll and place; what the routes hand out is the page, its modules
// and the motions, never another file of the repo. And every module the page asks for is one the routes hand out, so
// that the page loads in a browser. Needs no media and no browser.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {existsSync, readFileSync} from 'node:fs';
import {mkdtemp, mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {stripTypeScriptTypes} from 'node:module';
import {STANDARDS, dollLabRoutes, faultOf, placeOf} from './server.ts';
import {VENDOR} from '../../tools/lab-routes.ts';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const limb = () => ({s: [0, 0.4, -2], e: [0.1, 0.2, -1.9], w: [0.2, 0.1, -1.8], k: 1, p: Array.from({length: 21}, (_, i) => [0.2 + i / 1000, 0.1, -1.8])});
const frame = () => ({card: {c: [0, 0, -1.5], l: [0, 0, 1], n: [0, 1, 0], id: 0}, L: limb(), R: limb(), h: [0, 0.7, -2], g: [0, 0, -1.5]});
const motion = (doll: string, to: string) => ({about: 'test', film: 'tvahandsgiv-modell', fps: 30, frameCount: 2, leavesShoe: 0, edge: [1, 1], folds: 1, rests: 1, hip: [0, -0.3, -2], to: [to], doll, frames: [frame(), frame()], lab: {recipe: 'x'}});

async function lab(run: (at: {root: string; origin: string; ask: (method: string, address: string, body?: unknown, headers?: Record<string, string>) => Promise<{status: number; type: string; text: string}>}) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'docklabb-'));
  await mkdir(path.join(root, 'dealer3d/page'), {recursive: true}); await mkdir(path.join(root, 'dealer3d/src'), {recursive: true}); await mkdir(path.join(root, 'dealer3d/data'), {recursive: true}); await mkdir(path.join(root, 'placements'), {recursive: true}); await mkdir(path.join(root, 'src'), {recursive: true});
  await writeFile(path.join(root, 'dealer3d/page/docka.html'), '<!doctype html><title>Docklabb</title>');
  await writeFile(path.join(root, 'dealer3d/page/docka.ts'), 'export const a: number = 1;\n'); await writeFile(path.join(root, 'dealer3d/src/stage.ts'), 'export type T = {a: string};\nexport const b = 2;\n');
  await writeFile(path.join(root, 'src/table-lens.ts'), 'export const c: number = 3;\n'); await writeFile(path.join(root, 'src/secret.ts'), 'export const no = 1;\n'); await writeFile(path.join(root, '.env'), 'KEY=1\n');
  await writeFile(path.join(root, 'dealer3d/data/giv.json'), '{"fps":30}'); await writeFile(path.join(root, 'placements/default.json'), '﻿{"targets":{}}');
  let origin = '';
  let handle: ReturnType<typeof dollLabRoutes>;
  const server = http.createServer(async (req, res) => { if (!await handle(req, res, new URL(req.url ?? '/', origin))) res.writeHead(418).end('not the doll lab'); });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done)); const port = (server.address() as {port: number}).port; origin = `http://127.0.0.1:${port}`; handle = dollLabRoutes({root, origin});
  const ask = (method: string, address: string, body?: unknown, headers: Record<string, string> = {}) => new Promise<{status: number; type: string; text: string}>((done, fail) => {
    const text = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
    // http.request with the path as written, not fetch: a path with dots in it reaches the server as it is.
    const req = http.request({host: '127.0.0.1', port, path: address, method, headers: {...(text === undefined ? {} : {'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(text))}), ...headers}}, res => { const parts: Buffer[] = [];
      res.on('data', d => parts.push(d)); res.on('end', () => done({status: res.statusCode ?? 0, type: String(res.headers['content-type'] ?? ''), text: Buffer.concat(parts).toString('utf8')})); });
    req.on('error', fail); req.end(text); });
  try { await run({root, origin, ask}); } finally { await new Promise(done => server.close(done)); await rm(root, {recursive: true, force: true}); }
}
/** Every file under `root`, as paths with forward slashes. */
async function files(root: string, at = ''): Promise<string[]> {
  const out: string[] = []; for (const e of await readdir(path.join(root, at), {withFileTypes: true})) { const p = at ? `${at}/${e.name}` : e.name; if (e.isDirectory()) out.push(...await files(root, p)); else out.push(p); }
  return out.sort();
}

test('a standard is saved into its own folder, and read back', () => lab(async ({root, origin, ask}) => {
  assert.deepEqual(JSON.parse((await ask('GET', '/dealer3d/standard')).text), {standards: []});
  const before = await files(root), saved = await ask('PUT', '/dealer3d/standard/paow-p6c1.json', motion('paow', 'P6.C1'), {Origin: origin});
  assert.equal(saved.status, 200, saved.text); assert.equal(JSON.parse(saved.text).saved, `${STANDARDS}/paow-p6c1.json`);
  assert.deepEqual(await files(root), [...before, 'dealer3d/standard/paow-p6c1.json'].sort()); // one new file, no temporary one left
  assert.deepEqual(JSON.parse(await readFile(path.join(root, STANDARDS, 'paow-p6c1.json'), 'utf8')), motion('paow', 'P6.C1'));
  const list = JSON.parse((await ask('GET', '/dealer3d/standard')).text).standards; assert.equal(list.length, 1); assert.deepEqual({name: list[0].name, doll: list[0].doll, place: list[0].place}, {name: 'paow-p6c1', doll: 'paow', place: 'P6.C1'});
  assert.deepEqual(JSON.parse((await ask('GET', '/dealer3d/standard/paow-p6c1.json')).text), motion('paow', 'P6.C1'));
  // Saved again it is replaced, not added to.
  assert.equal((await ask('PUT', '/dealer3d/standard/paow-p6c1.json', {...motion('paow', 'P6.C1'), about: 'again'}, {Origin: origin})).status, 200);
  assert.equal(JSON.parse(await readFile(path.join(root, STANDARDS, 'paow-p6c1.json'), 'utf8')).about, 'again'); assert.equal((await files(root)).length, before.length + 1);
  assert.equal((await ask('PUT', '/dealer3d/standard/standard-dc3.json', motion('standard', 'D.C3'), {Origin: origin})).status, 200);
  // A deal from another entry than A2.3 has the entry in its name, and says it in lab.from.
  const fromA21 = {...motion('paow', 'P4.C1'), lab: {read: 'x', from: 'A2.1'}}, a21 = await ask('PUT', '/dealer3d/standard/paow-a2-1-p4c1.json', fromA21, {Origin: origin}); assert.equal(a21.status, 200, a21.text);
  assert.deepEqual(JSON.parse(a21.text).standards.map((s: {name: string; from: string; place: string}) => [s.name, s.from, s.place]), [['paow-a2-1-p4c1', 'A2.1', 'P4.C1'], ['paow-p6c1', 'A2.3', 'P6.C1'], ['standard-dc3', 'A2.3', 'D.C3']]);
}));

test('nothing is written outside the folder, under another name, from another origin, or of another shape', () => lab(async ({root, origin, ask}) => {
  const before = await files(root), good = motion('paow', 'P6.C1'), own = {Origin: origin};
  const refused: [string, string, unknown, Record<string, string>, number][] = [
    ['another origin', '/dealer3d/standard/paow-p6c1.json', good, {Origin: 'http://127.0.0.1:9'}, 403],
    ['no origin', '/dealer3d/standard/paow-p6c1.json', good, {}, 403],
    ['a path out of the folder', '/dealer3d/standard/../data/giv.json', good, own, 405],
    ['a path out of the folder, written with %2F', '/dealer3d/standard/..%2F..%2Fplacements%2Fdefault.json', good, own, 400],
    ['a path out of the folder, written with a backslash', '/dealer3d/standard/..%5Cdata%5Cpaow-p6c1.json', good, own, 400],
    ['a folder below', '/dealer3d/standard/x/paow-p6c1.json', good, own, 405],
    ['a name that is no doll and place', '/dealer3d/standard/giv.json', good, own, 400],
    ['a place the plan has not', '/dealer3d/standard/paow-p8c1.json', motion('paow', 'P8.C1'), own, 400],
    ['a capital in the name', '/dealer3d/standard/Paow-p6c1.json', good, own, 400],
    ['a motion file of the lane', '/dealer3d/data/giv.json', good, own, 405],
    ['the plan', '/dealer3d/plan', good, own, 405],
    ['a page module', '/dealer3d/page/docka.ts', good, own, 405],
    ['another doll than the name says', '/dealer3d/standard/standard-p6c1.json', good, own, 400],
    ['another place than the name says', '/dealer3d/standard/paow-p6c2.json', good, own, 400],
    ['another entry than the name says', '/dealer3d/standard/paow-a2-1-p6c1.json', good, own, 400],
    ['an entry the name does not say', '/dealer3d/standard/paow-p6c1.json', {...good, lab: {from: 'A2.1'}}, own, 400],
    ['an entry there is none of', '/dealer3d/standard/paow-a2-3-p6c1.json', {...good, lab: {from: 'A2.3'}}, own, 400],
    ['a frame count that is not the frames', '/dealer3d/standard/paow-p6c1.json', {...good, frameCount: 3}, own, 400],
    ['a hand of twenty points', '/dealer3d/standard/paow-p6c1.json', {...good, frames: [frame(), {...frame(), R: {...limb(), p: limb().p.slice(1)}}]}, own, 400],
    ['a number that is none', '/dealer3d/standard/paow-p6c1.json', JSON.stringify(good).replace('[0,0.4,-2]', '[0,"x",-2]'), own, 400],
    ['a field no motion has', '/dealer3d/standard/paow-p6c1.json', {...good, script: 'x'}, own, 400],
    ['no JSON', '/dealer3d/standard/paow-p6c1.json', '{"fps":', own, 400],
    ['an array', '/dealer3d/standard/paow-p6c1.json', [good], own, 400],
    ['too large', '/dealer3d/standard/paow-p6c1.json', {...good, about: 'x'.repeat(1_600_000)}, own, 413],
  ];
  for (const [what, address, body, headers, status] of refused) { const answer = await ask('PUT', address, body, headers); assert.equal(answer.status, status, `${what}: ${answer.status} ${answer.text.slice(0, 120)}`); }
  assert.equal((await ask('PUT', '/dealer3d/standard/paow-p6c1.json', 'fps=30', {Origin: origin, 'Content-Type': 'text/plain'})).status, 415);
  for (const method of ['POST', 'DELETE', 'PATCH']) assert.equal((await ask(method, '/dealer3d/standard/paow-p6c1.json', good, own)).status, 405, method);
  assert.deepEqual(await files(root), before);
  assert.equal(faultOf('paow-p6c1', good), null); assert.equal(placeOf('p6c1'), 'P6.C1'); assert.equal(placeOf('dc3'), 'D.C3');
}));

test('the routes hand out the page, its modules without types, the motions and the plan, and nothing else', () => lab(async ({ask}) => {
  const page = await ask('GET', '/dealer3d/docka'); assert.equal(page.status, 200); assert.match(page.type, /^text\/html/);
  for (const [address, has] of [['/dealer3d/page/docka.ts', 'export const a = 1;'], ['/dealer3d/src/stage.ts', 'export const b = 2;'], ['/src/table-lens.ts', 'export const c = 3;']]) {
    const answer = await ask('GET', address); assert.equal(answer.status, 200, address); assert.match(answer.type, /^text\/javascript/); assert.equal(answer.text.replace(/ +/g, ' ').includes(has.replace(/ +/g, ' ')), true, `${address}: ${answer.text}`); assert.doesNotMatch(answer.text, /: number|export type/); }
  assert.equal((await ask('GET', '/dealer3d/data/giv.json')).text, '{"fps":30}');
  assert.equal((await ask('GET', '/dealer3d/plan')).text, '{"targets":{}}'); // without the file's byte order mark
  for (const address of ['/src/secret.ts', '/dealer3d/src/../../.env', '/dealer3d/page/..%2F..%2F.env', '/dealer3d/data/..%2F..%2F.env.json', '/dealer3d/standard/..%2F..%2Fplacements%2Fdefault.json', '/dealer3d/page/docka.html', '/dealer3d/data/none.json', '/dealer3d/standard/paow-p1c1.json', '/dealer3d/x'])
    assert.match(String((await ask('GET', address)).status), /^(404|418)$/, address);
  assert.equal((await ask('GET', '/api/orders')).status, 418); assert.equal((await ask('GET', '/studio/')).status, 418); // not the doll lab's: left to the lab server
}));

test('every module the page asks for is one the routes hand out', () => {
  // The page's own import map: three and its addons come from the lab server's /vendor/ (tools/lab-routes.ts VENDOR).
  const html = readFileSync(path.join(REPO, 'dealer3d/page/docka.html'), 'utf8'), map = JSON.parse(/<script type="importmap">([\s\S]*?)<\/script>/.exec(html)![1]).imports as Record<string, string>;
  const seen = new Set<string>(), queue = [...html.matchAll(/<script type="module" src="(\/dealer3d\/[^"]+)"/g)].map(m => m[1]); assert.ok(queue.length, 'the page loads a module of its own');
  while (queue.length) { const address = queue.pop()!; if (seen.has(address)) continue; seen.add(address);
    const m = /^\/dealer3d\/(page|src)\/([\w-]+)\.ts$/.exec(address), file = m ? `dealer3d/${m[1]}/${m[2]}.ts` : address === '/src/table-lens.ts' ? 'src/table-lens.ts' : null;
    assert.ok(file && existsSync(path.join(REPO, file)), `${address} is not handed out`);
    // As the browser gets it: the types, and with them the imports of types only, taken off; comments left out.
    const code = stripTypeScriptTypes(readFileSync(path.join(REPO, file), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const found of code.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"\n]+)\1/g)) { const spec = found[2];
      if (spec.startsWith('.')) queue.push(new URL(spec, `http://lab${address}`).pathname);
      else { const prefix = Object.keys(map).filter(k => spec === k || (k.endsWith('/') && spec.startsWith(k))).sort((a, b) => b.length - a.length)[0]; assert.ok(prefix, `${address} asks for ${spec}, which the page's import map does not name`);
        const at = map[prefix] + spec.slice(prefix.length); assert.ok(Object.hasOwn(VENDOR, at), `${address} asks for ${spec} (${at}), which the lab server's VENDOR does not hand out`); } } }
  assert.ok(seen.has('/dealer3d/src/stage.ts') && seen.has('/src/table-lens.ts'));
});
