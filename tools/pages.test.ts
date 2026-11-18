import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readdirSync, statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PAGES, SCRIPTS, VENDOR, studioAddress} from './lab-routes.ts';

// The pages beside the studio (pages/: the 3D page, Modeller, Ljud) and the game's (game/page/) lie in folders but keep
// their root addresses (tools/lab-routes.ts PAGES, served by tools/preview.ts), so that the references inside them resolve
// as before.
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const FOLDERS = ['pages', 'game/page'];
const pageFiles = (folder: string) => readdirSync(path.join(root, folder)).filter(name => /\.(?:html|css)$/.test(name)).map(name => `${folder}/${name}`);

test('every page of the map lies on disk, in one of the two folders, under the name of its address', () => {
  assert.deepEqual(Object.keys(PAGES).sort(), ['/game.css', '/game.html', '/props.css', '/props.html', '/scene3d.html', '/sound.css', '/sound.html', '/vinklar.html']);
  for (const [address, file] of Object.entries(PAGES)) {
    assert.ok(statSync(path.join(root, file)).isFile(), `${address}: ${file} is missing`);
    assert.ok(FOLDERS.includes(path.posix.dirname(file)), `${address}: ${file} lies outside ${FOLDERS.join(' and ')}`);
    assert.equal(address, `/${path.posix.basename(file)}`, `${file} keeps its name as its root address`);
  }
});

test('every page and style sheet in the two folders has an address', () => {
  const mapped = new Set(Object.values(PAGES));
  for (const folder of FOLDERS) for (const file of pageFiles(folder)) assert.ok(mapped.has(file), `${file} has no address in PAGES`);
  assert.equal(new Set(Object.values(PAGES)).size, Object.keys(PAGES).length, 'two addresses for one file');
});

test('no page address is also a module or vendor address', () => {
  for (const address of Object.keys(PAGES)) {
    assert.ok(!(address in SCRIPTS), `${address} is in SCRIPTS too`);
    assert.ok(!(address in VENDOR), `${address} is in VENDOR too`);
  }
});

test('the root holds no page, style sheet or manifest any more', () => {
  const left = readdirSync(root).filter(name => /\.(?:html|css)$/i.test(name) || name === 'manifest.json');
  assert.deepEqual(left, []);
  assert.ok(statSync(path.join(root, 'data/manifest.json')).isFile(), 'the manifest lies in data/');
  assert.ok(!existsSync(path.join(root, 'old-lab')), 'the old lab is gone: its pages are in pages/ or the studio');
});

test('the studio is the lab: "/" and /lab.html, also with ?gamla=1, lead to the studio view that does what the tab did', () => {
  const to = (address: string) => { const url = new URL(address, 'http://127.0.0.1:4319'); return studioAddress(url.pathname, url.searchParams); };
  assert.equal(to('/'), '/studio/');
  assert.equal(to('/lab.html'), '/studio/');
  assert.equal(to('/lab.html?tab=prov&proof=naturbord-runway'), '/studio/prov/?prov=naturbord-runway');
  assert.equal(to('/lab.html?tab=prov&proof=kort-matt-ur-filmen&file=1-bord.mp4'), '/studio/prov/?prov=kort-matt-ur-filmen&fil=1-bord.mp4');
  assert.equal(to('/lab.html?tab=granska&take=paow-giv-p4-01-deal&dealer=paow'), '/studio/granska/?dealer=paow&tagning=paow-giv-p4-01-deal');
  assert.equal(to('/lab.html?tab=klippbank&edge=READY%3EP4.C1'), '/studio/karta/');
  assert.equal(to('/lab.html?tab=placering'), '/studio/placering/');
  // The old lab's own address (the studio's former link "Gamla labbet") leads to the studio too, so old links still work.
  assert.equal(to('/lab.html?gamla=1'), '/studio/');
  assert.equal(to('/lab.html?gamla=1&tab=prov&proof=x'), '/studio/prov/?prov=x');
  assert.equal(to('/lab.html?gamla=1&dealer=paow'), '/studio/?dealer=paow');
  // Every other page keeps its address (the 3D page, the models, the sound, the game, the studio itself).
  for (const page of ['/scene3d.html', '/props.html', '/sound.html', '/game.html', '/studio/', '/studio/prov/', '/lab.css']) assert.equal(to(page), null, page);
  // The old lab's other pages have no address any more.
  for (const page of ['/lab.html', '/lab.css', '/preview.html', '/generation.html']) assert.ok(!(page in PAGES), page);
});
