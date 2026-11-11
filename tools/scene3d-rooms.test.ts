// The register of the 3D scene's 360-degree rooms (data/scene-rooms.json) and how the scene reads it (readRegister in
// src/scene3d-room.ts). Nothing here needs a browser or the pictures themselves.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FIRST_PANORAMAS, firstPanoramas, readRegister} from '../src/scene3d-room.ts';

type Entry = Record<string, unknown> & {id: string; source: Record<string, unknown>};
const register = JSON.parse(readFileSync(new URL('../data/scene-rooms.json', import.meta.url), 'utf8')) as {rooms: Entry[]};
const {rooms, problems} = readRegister(register);
const ROOM_SOUNDS = ['salong', 'panorama', 'la', 'skog', 'hall']; // RoomSound of src/lab-sound.ts
const URLS = {panorama: 'assets/scene/panorama-vegas.jpg', la: 'assets/scene/panorama-la.jpg', skog: 'assets/scene/panorama-skog.jpg'};
const pick = (o: object, keys: string[]) => Object.fromEntries(keys.map(k => [k, (o as Record<string, unknown>)[k]]));
const LOOK = ['id', 'blur', 'exposure', 'turn', 'mirror', 'air', 'tint', 'light'];

test('every entry of the register can be used, once', () => {
  assert.deepEqual(problems, []);
  assert.equal(rooms.length, register.rooms.length);
  assert.equal(new Set(rooms.map(r => r.id)).size, rooms.length);
});

test('the first three rooms are as the scene had them before the register, and stay in the game', () => {
  assert.deepEqual(rooms.slice(0, 3).map(r => r.id), ['panorama', 'la', 'skog']);
  for (const first of FIRST_PANORAMAS) {
    const r = rooms.find(r => r.id === first.id)!;
    assert.deepEqual(pick(r, LOOK), pick(first, LOOK), `${first.id} har ändrats`);
    assert.equal(r.file, URLS[first.id as keyof typeof URLS]); assert.equal(r.game, true);
  }
  // a page that gives no register gets the same three, with its own paths
  assert.deepEqual(firstPanoramas(URLS).map(p => [p.id, p.file]), Object.entries(URLS));
});

test('every room says where its picture came from', () => {
  for (const r of register.rooms) {
    assert.match(String(r.sha256), /^[0-9a-f]{64}$/, r.id); assert.ok(Number.isInteger(r.bytes) && (r.bytes as number) > 0, r.id);
    const [w, h] = r.size as number[]; assert.ok(w > 0 && w === 2 * h, `${r.id}: en 360°-bild är dubbelt så bred som hög`);
    assert.ok(String(r.author).trim() && String(r.licence).trim(), r.id);
    if (r.kind === 'photo') {
      assert.equal(r.licence, 'CC0', r.id); assert.match(String(r.page), /^https:\/\/polyhaven\.com\/a\/[a-z0-9_]+$/, r.id);
      assert.match(String(r.source.url), /^https:\/\/dl\.polyhaven\.org\//, r.id); assert.match(String(r.source.sha256), /^[0-9a-f]{64}$/, r.id);
    } else assert.ok(typeof r.source.file === 'string' && typeof r.source.prompt === 'string', `${r.id}: en genererad bild pekar ut originalet och prompten`);
  }
});

test('every room is heard with a room sound that exists, and its picture lies where the lab server lends it out', () => {
  const served = /^assets\/scene\/(rooms\/[a-z0-9][a-z0-9_-]*\.jpg)$/; // tools/preview.ts: sceneMedia, plus the three named files
  for (const r of rooms) {
    assert.ok(ROOM_SOUNDS.includes(r.sound), `${r.id}: ljudet ${r.sound}`);
    assert.ok(served.test(r.file) || Object.values(URLS).includes(r.file), `${r.id}: ${r.file}`);
  }
});

test('a photograph added after the first three is shown the right way round', () => {
  // the sphere mirrors a picture unless the room says otherwise; writing in a photograph would read backwards
  for (const r of rooms.slice(3)) if (r.kind === 'photo') assert.equal(r.mirror, false, r.id);
});

test('readRegister leaves out what the scene cannot use and says why', () => {
  assert.deepEqual(readRegister(null), {rooms: [], problems: ['rumsregistret saknar listan rooms']});
  const good = {...register.rooms[3], id: 'prov'};
  const bad = [{...good, id: 'hall'}, {...good}, {...good, id: 'fil', file: 'assets/other/x.jpg'}, {...good, id: 'farg', tint: {back: [1, 1], front: [1, 1, 1]}},
    {...good, id: 'oskarpa', blur: 99}, {...good, id: 'vrid', turn: '10'}, {...good, id: 'ljus', light: 'sun'}];
  const read = readRegister({rooms: [good, ...bad]});
  assert.deepEqual(read.rooms.map(r => r.id), ['prov']);
  assert.equal(read.problems.length, bad.length);
  for (const [i, word] of ['ett byggt rum', 'två gånger', 'file', 'tint', 'blur', 'turn', 'light'].entries()) assert.ok(read.problems[i].includes(word), read.problems[i]);
  // what the pages do not read is not carried along
  assert.equal('sha256' in read.rooms[0], false);
});
