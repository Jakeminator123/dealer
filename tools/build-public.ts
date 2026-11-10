import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { stripTypeScriptTypes } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePlan } from '../src/placement-model.ts';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
if (path.resolve(process.cwd()) !== root) throw Error('Run from the dealer checkout.');
const deploy = path.join(root, '.runtime', 'public-deploy');
const output = path.join(deploy, '.vercel', 'output');
const staticRoot = path.join(output, 'static');
// This one fixed build-output tree is disposable. Never follow user-supplied paths.
if (output !== path.resolve(root, '.runtime/public-deploy/.vercel/output')) throw Error('Unsafe build output.');
await rm(output, { recursive: true, force: true });
await mkdir(staticRoot, { recursive: true });
const files: { path: string; bytes: number; sha256: string }[] = [];
const digest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
async function emit(relative: string, content: Buffer | string) {
  if (path.posix.normalize(relative) !== relative || relative.startsWith('../') || relative.includes('\\')) throw Error('Unsafe public path.');
  const file = path.join(staticRoot, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
  files.push({ path: relative, bytes: Buffer.byteLength(content), sha256: digest(content) });
}
async function copy(relative: string, source = relative, expected?: string) {
  if (path.posix.normalize(source) !== source || source.startsWith('../') || source.includes('\\') || path.isAbsolute(source)) throw Error('Unsafe public source.');
  const sourcePath = path.join(root, source), bytes = await readFile(sourcePath);
  if (expected && digest(bytes) !== expected) throw Error(`Source hash mismatch: ${source}`);
  await emit(relative, bytes);
}
async function compile(source: string, destination: string, prefix = '') {
  const ts = await readFile(path.join(root, source), 'utf8');
  const js = stripTypeScriptTypes(ts).replaceAll("'./placement-model.ts'", "'./placement-model.js'")
    .replaceAll("'Sparat lokalt'", "'Sparat i webbläsaren'");
  await emit(destination, prefix + js);
}
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
// Never publish the user's modified file or unsaved browser draft by accident.
const initialText = execFileSync('git', ['show', 'HEAD:placements/default.json'], { cwd: root, encoding: 'utf8' });
const initialPlan = JSON.parse(initialText); validatePlan(initialPlan);
await emit('data/default-plan.json', JSON.stringify({ plan: initialPlan, revision: digest(initialText) }));
const library = JSON.parse(await readFile(path.join(root, 'data/library.json'), 'utf8'));
for (const item of library.items) {
  if (item.motionRef) {
    if (!/^motions\/[a-z0-9-]+\.json$/.test(item.motionRef)) throw Error('Invalid motion reference.');
    const motion = JSON.parse(await readFile(path.join(root, item.motionRef), 'utf8'));
    item.reviewDecision = motion.review?.decision ?? 'UNKNOWN';
  }
  if (!/^(assets\/|output\/v6\/)/.test(item.path) || !item.path.endsWith('.mp4')) throw Error('Invalid film path.');
  await copy(item.path, item.path, item.sha256);
}
await emit('data/public-library.json', JSON.stringify(library));
let html = await readFile(path.join(root, 'lab.html'), 'utf8');
html = html.replace('<body>', '<body><div style="background:#30213f;color:#efeaf7;padding:8px 24px;font:13px Segoe UI,sans-serif">Publikt labb · Dina ändringar sparas bara i den här webbläsaren. Exportera en placeringsfil för att flytta dem till det lokala labbet.</div>')
  .replace('<script type="module" src="preview-ui.js"></script>', '')
  .replace('Sparas lokalt', 'Sparas i webbläsaren');
await emit('index.html', html); await emit('lab.html', html);
await copy('lab.css');
await compile('src/lab-ui.ts', 'lab-ui.js', "import { publicFetch as fetch } from './public-storage.js';\n");
await compile('src/placement-model.ts', 'placement-model.js');
await compile('src/public-storage.ts', 'public-storage.js');
await compile('materials/source/src/card-material-study.ts', 'materials/source/src/card-material-study.js');
await copy('materials/source/references/card-materials/vendor/three.module.js');
await copy('materials/source/references/card-materials/vendor/LICENSE');
for (const item of ['assets/lab/native.jpg', 'assets/lab/portrait.jpg', 'materials/kortmaterial.js', 'materials/markermaterial.js']) await copy(item);
for (const item of ['materials/kortmaterial.html', 'materials/markermaterial.html']) {
  let material = await readFile(path.join(root, item), 'utf8');
  material = material.replace('<script type="module" src="/preview-ui.js"></script>', '').replaceAll('../preview.html', '../lab.html');
  await emit(item, material);
}
await emit('preview.html', '<!doctype html><html lang="sv"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=lab.html"><title>Dealer</title><a href="lab.html">Öppna Dealer-labbet</a></html>');
await emit('robots.txt', 'User-agent: *\nDisallow: /\n');
const totalBytes = files.reduce((total, file) => total + file.bytes, 0);
if (totalBytes > 250_000_000) throw Error('Public bundle unexpectedly exceeds 250 MB.');
await writeFile(path.join(output, 'config.json'), JSON.stringify({ version: 3 }, null, 2));
await writeFile(path.join(deploy, 'package.json'), JSON.stringify({ private: true, name: 'dealer-public-output', version: '1.0.0' }));
await writeFile(path.join(deploy, 'vercel.json'), JSON.stringify({ framework: null, buildCommand: null, installCommand: null }, null, 2));
const receipt = { builtAt: new Date().toISOString(), sourceCommit, initialPlanSource: 'HEAD:placements/default.json', browserLocalWritesOnly: true, totalBytes, files };
await writeFile(path.join(root, '.runtime', 'public-build.json'), JSON.stringify(receipt, null, 2));
console.log(JSON.stringify({ output, files: files.length, totalBytes, sourceCommit, initialPlanSource: receipt.initialPlanSource }));
