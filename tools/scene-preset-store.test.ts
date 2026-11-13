// Offline tests for the presets of the 3D scene (tools/scene-preset-store.ts) and the three that ship in data/scene-presets/.
// Every write goes to a temporary copy; the checkout's own presets and room register are only read.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, readdir, rm, copyFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {scenePresetStore} from './scene-preset-store.ts';
import {DEFAULTS} from '../src/scene3d-view.ts';
import {SHIPPED, SLOTS, effective, slotLabel, slotName, slotsOf} from '../studio/lib/scene-presets.ts';

const base = existsSync('D:/dealer-scratch/tmp') ? 'D:/dealer-scratch/tmp' : os.tmpdir();
async function temp(t: {after(fn: () => Promise<void>): void}) {
  const root = await mkdtemp(path.join(base, 'scene-presets-')); t.after(() => rm(root, {recursive: true, force: true}));
  await mkdir(path.join(root, 'data/scene-presets'), {recursive: true});
  await copyFile('data/scene-rooms.json', path.join(root, 'data/scene-rooms.json'));
  for (const p of SHIPPED) await copyFile(`data/scene-presets/${p.name}.json`, path.join(root, `data/scene-presets/${p.name}.json`));
  return root;
}
const fails = (status: number) => (error: unknown) => (error as {status?: number}).status === status;
const mine = {label: 'Kväll i skogen', about: 'Prov', state: {room: 'skog', dust: 0.8, felt: 'vin', cards: true}};

test('the three shipped presets: in the checkout, read-only, and exactly what the brief says', async () => {
  const store = scenePresetStore(process.cwd()), {presets, problems} = await store.list();
  assert.deepEqual(problems, []);
  assert.deepEqual(presets.filter(p => p.shipped).map(p => p.name), ['basgrund', 'levande', 'rumsstudien']);
  for (const p of SHIPPED) {
    const file = JSON.parse(await readFile(`data/scene-presets/${p.name}.json`, 'utf8'));
    assert.deepEqual(file, p, `${p.name}.json is SHIPPED in studio/lib/scene-presets.ts`);
  }
  const [basgrund, levande, rumsstudien] = SHIPPED.map(p => effective(DEFAULTS, p.state));
  // basgrund: what src/game-page.ts sets (lines 39, 57-58, 173), the rest the scene's defaults
  assert.deepEqual(SHIPPED[0].state, {format: 'fill', room: 'panorama', blur: 5, tray: true, cards: true, pitch: -8, zoom: 0.84, roomShift: 'shimmer'});
  const game = await readFile('src/game-page.ts', 'utf8');
  assert.match(game, /const FRAMING = \{wide: \{pitch: -8, zoom: 0\.84\}/);
  assert.match(game, /\?\.id \?\? 'panorama';/);
  assert.match(game, /scene\.set\(\{format: 'fill', room: room as never, blur: ROOMS\.find\(r => r\.id === room\)!\.blur, tray: true, cards: true, pitch: Number\(query\.get\('pitch'\) \?\? FRAMING\.wide\.pitch\), zoom: Number\(query\.get\('zoom'\) \?\? FRAMING\.wide\.zoom\)\}\)/);
  assert.match(game, /scene\.set\(\{roomShift: 'shimmer', room: id, blur: next\.blur\}/);
  const vegas = JSON.parse(await readFile('data/scene-rooms.json', 'utf8')).rooms.find((r: {id: string}) => r.id === 'panorama');
  assert.equal(vegas.blur, basgrund.blur); assert.equal(vegas.game, true);
  // levande: basgrund plus the look Jakob remembers, the camera leaning without swaying (Jakob 2026-11-13); rumsstudien:
  // levande plus the room study's table
  assert.deepEqual({...levande, mode: basgrund.mode, focus: basgrund.focus, dust: basgrund.dust, clock: basgrund.clock}, basgrund);
  assert.deepEqual([levande.mode, levande.sway, levande.focus, levande.dust, levande.clock], ['lean', false, 'follow', 0.6, true]);
  assert.deepEqual({...rumsstudien, surface: levande.surface, base: levande.base, shadowAbove: levande.shadowAbove, lamp: levande.lamp}, levande);
  assert.deepEqual([rumsstudien.surface, rumsstudien.base, rumsstudien.shadowAbove, rumsstudien.lamp], ['photo', 'legs', 0, 0.5]);
  assert.match(SHIPPED[2].about, /Inte bedömd av Jakob/);
});

test('his own preset: saved, listed after the shipped ones, overwritten only against its revision, taken away', async t => {
  const root = await temp(t), store = scenePresetStore(root);
  const made = await store.save('kvall-i-skogen', mine, undefined);
  assert.equal(made.preset.name, 'kvall-i-skogen'); assert.equal(made.preset.shipped, false); assert.match(made.preset.revision, /^"[0-9a-f]{64}"$/);
  assert.ok(!Number.isNaN(Date.parse(made.preset.updatedAt)));
  const text = await readFile(path.join(root, 'data/scene-presets/kvall-i-skogen.json'), 'utf8');
  assert.deepEqual(Object.keys(JSON.parse(text)), ['schemaVersion', 'name', 'label', 'about', 'state', 'updatedAt']);
  assert.ok(text.endsWith('}\n'));
  const {presets} = await store.list();
  assert.deepEqual(presets.map(p => p.name), ['basgrund', 'levande', 'rumsstudien', 'kvall-i-skogen']);
  assert.equal((await store.load('kvall-i-skogen')).preset.revision, made.preset.revision);
  // an existing name: never without the revision, never against an old one
  await assert.rejects(store.save('kvall-i-skogen', mine, undefined), fails(428));
  await assert.rejects(store.save('kvall-i-skogen', mine, '"0"'), fails(409));
  const again = await store.save('kvall-i-skogen', {...mine, state: {dust: 0.2}}, made.preset.revision);
  assert.deepEqual(again.preset.state, {dust: 0.2});
  await assert.rejects(store.remove('kvall-i-skogen', undefined), fails(428));
  await assert.rejects(store.remove('kvall-i-skogen', made.preset.revision), fails(409));
  assert.deepEqual(await store.remove('kvall-i-skogen', again.preset.revision), {name: 'kvall-i-skogen', removed: true});
  await assert.rejects(store.load('kvall-i-skogen'), fails(404));
  await assert.rejects(store.remove('kvall-i-skogen', again.preset.revision), fails(404));
  await assert.rejects(store.save('kvall-i-skogen', mine, again.preset.revision), fails(409)); // gone in the meantime
  assert.deepEqual((await readdir(path.join(root, 'data/scene-presets'))).sort(), ['basgrund.json', 'levande.json', 'rumsstudien.json']); // no temporary file left
});

test('a place (Profilval 3) is an ordinary preset of his: made without If-Match, read by name, overwritten against its revision, emptied', async t => {
  const root = await temp(t), store = scenePresetStore(root), name = slotName(3);
  await assert.rejects(store.load(name), fails(404)); // an empty place: no file
  const made = await store.save(name, {label: slotLabel(3), about: '', state: {dust: 0.3, sway: false}}, undefined);
  assert.equal(made.preset.shipped, false);
  // the game and the Casino view read it as any preset: /api/scene-presets/profilval-3, ?forval=profilval-3
  const read = (await store.load(name)).preset;
  assert.deepEqual([read.name, read.label, read.state, read.revision], [name, 'Profilval 3', {dust: 0.3, sway: false}, made.preset.revision]);
  assert.deepEqual(slotsOf((await store.list()).presets).map(p => p?.name ?? null), [null, null, name, null, null, null, null, null, null, null]);
  // a filled place is never written over without the revision the page read, nor against an old one
  await assert.rejects(store.save(name, {label: slotLabel(3), state: {dust: 0.9}}, undefined), fails(428));
  const again = await store.save(name, {label: slotLabel(3), state: {dust: 0.9}}, made.preset.revision);
  await assert.rejects(store.save(name, {label: slotLabel(3), state: {dust: 0.1}}, made.preset.revision), fails(409));
  assert.deepEqual((await store.load(name)).preset.state, {dust: 0.9});
  await store.remove(name, again.preset.revision);
  assert.deepEqual(slotsOf((await store.list()).presets), Array(SLOTS).fill(null));
});

test('the shipped presets cannot be written or taken away', async t => {
  const root = await temp(t), store = scenePresetStore(root), {preset} = await store.load('basgrund');
  assert.equal(preset.shipped, true);
  await assert.rejects(store.save('basgrund', mine, preset.revision), fails(403));
  await assert.rejects(store.remove('levande', (await store.load('levande')).preset.revision), fails(403));
  assert.deepEqual(JSON.parse(await readFile(path.join(root, 'data/scene-presets/basgrund.json'), 'utf8')), SHIPPED[0]);
});

test('every key is checked against the catalogue: unknown keys, values out of range and rooms the scene lacks are refused', async t => {
  const root = await temp(t), store = scenePresetStore(root);
  const refused = async (value: unknown, words: RegExp, name = 'prov') => { await assert.rejects(store.save(name, value, undefined), (e: unknown) => fails(400)(e) && words.test((e as Error).message)); };
  await refused({...mine, state: {dust: 0.8, glitter: 1}}, /okänd nyckel glitter/);
  await refused({...mine, state: {dust: 1.5}}, /dust ska ligga mellan 0 och 1/);
  await refused({...mine, state: {sway: 'yes'}}, /sway ska vara sant eller falskt/);
  await refused({...mine, state: {felt: 'pink'}}, /felt känner inte till "pink"/);
  await refused({...mine, state: {room: 'manen'}}, /room känner inte till "manen"/);
  await refused({...mine, state: {marks: 'rings,stars'}}, /marks känner inte till stars/);
  await refused({...mine, state: {logo: 'x'.repeat(29)}}, /logo får vara högst 28 tecken/);
  await refused({...mine, state: {yaw: Number.NaN}}, /yaw ska vara ett tal/);
  await refused({...mine, state: []}, /state ska vara ett objekt/);
  await refused({...mine, label: ''}, /label ska vara/);
  await refused({...mine, extra: 1}, /okänt fält extra/);
  await refused({...mine, name: 'annat'}, /namnet i förvalet och i adressen skiljer sig/);
  await refused(mine, /a–z/, 'Stora-Bokstäver');
  await assert.rejects(store.load('../placements/default'), fails(400));
  // what the scene has: built rooms, register rooms, scale 0 (the contract's k), marks as a list
  const ok = await store.save('prov', {...mine, state: {room: 'dimskog', scale: 0, marks: 'rings,numbers', logo: 'SCOUT', filmWarm: -0.2}}, undefined);
  assert.equal(ok.preset.state.room, 'dimskog');
  await store.save('hall', {...mine, state: {room: 'hall'}}, undefined);
});

test('a broken file is named, not served as a preset', async t => {
  const root = await temp(t), store = scenePresetStore(root);
  await writeFile(path.join(root, 'data/scene-presets/trasig.json'), '{"schemaVersion":1,"label":"x","state":{"dust":9}}');
  await writeFile(path.join(root, 'data/scene-presets/inte-json.json'), '{');
  const {presets, problems} = await store.list();
  assert.deepEqual(presets.map(p => p.name), ['basgrund', 'levande', 'rumsstudien']);
  assert.equal(problems.length, 2);
  await assert.rejects(store.load('trasig'), fails(500));
});
