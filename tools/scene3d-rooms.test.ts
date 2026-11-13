// The register of the 3D scene's 360-degree rooms (data/scene-rooms.json) and how the scene reads it (readRegister in
// src/scene3d-room.ts). Nothing here needs a browser or the pictures themselves.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {FIRST_PANORAMAS, ROOM_LIFE, firstPanoramas, lifeAspect, lifeFeather, lifePatch, readRegister} from '../src/scene3d-room.ts';

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

test('Venedig with the people removed is the same room as Venedig, from the same photograph, and stays in the lab', () => {
  const venedig = register.rooms.find(r => r.id === 'venedig')!, empty = register.rooms.find(r => r.id === 'venedig-tom')!;
  assert.deepEqual(pick(rooms.find(r => r.id === 'venedig-tom')!, LOOK.slice(1)), pick(rooms.find(r => r.id === 'venedig')!, LOOK.slice(1)));
  assert.deepEqual(empty.size, venedig.size); assert.equal(empty.game, false); assert.equal(empty.kind, 'photo'); assert.equal(empty.licence, 'CC0');
  for (const key of ['url', 'sha256', 'size', 'bytes']) assert.deepEqual(empty.source[key], venedig.source[key], `source.${key}`);
  assert.equal(empty.source.from, venedig.file); assert.match(String(empty.note), /borttaget av en bildmodell/); assert.match(String(empty.source.made), /image model/);
  assert.notEqual(empty.sha256, venedig.sha256); assert.notEqual(empty.file, venedig.file);
});

test('life in a room: each line names a room of the register, a film where the lab server lends it out, and a box of its picture', () => {
  for (const [id, lines] of Object.entries(ROOM_LIFE)) {
    assert.ok(rooms.some(r => r.id === id), `${id} är inget rum i registret`);
    for (const line of lines!) {
      assert.match(line.url, /^assets\/scene\/rooms\/[a-z0-9][a-z0-9_-]*\.mp4$/, id);
      const [u0, v0, u1, v1] = line.box; assert.ok(u0 >= 0 && u0 < u1 && u1 <= 1 && v0 >= 0 && v0 < v1 && v1 <= 1, `${id}: rutan`);
      assert.ok(line.feather > 0 && line.feather < 0.25, `${id}: kanten`);
      assert.ok(Math.abs(lifeAspect(line.box) / (854 / 480) - 1) < 0.01, `${id}: rutan har filmens form (854 × 480)`);
    }
  }
  assert.deepEqual(Object.keys(ROOM_LIFE), ['venedig']);
});

test('a film lies on its room sphere where its box is in the picture, the right way round, mirrored or not', () => {
  const TAU = 2 * Math.PI, close = (a: number, b: number, what: string) => assert.ok(Math.abs(a - b) < 1e-6, `${what}: ${a} ${b}`);
  const back = (x: number, y: number, z: number) => { let phi = Math.atan2(z, -x); if (phi < 0) phi += TAU; return {u: phi / TAU, v: Math.acos(y / Math.hypot(x, y, z)) / Math.PI}; };
  // the room's own sphere (createRooms): three's SphereGeometry gives a vertex the u of its phi and the v of its theta
  const ball = new T.SphereGeometry(60, 64, 32), bp = ball.attributes.position, bu = ball.attributes.uv;
  for (let i = 0; i < bp.count; i++) { const d = back(bp.getX(i), bp.getY(i), bp.getZ(i)); if (Math.abs(bp.getY(i)) > 59 || bu.getX(i) < 1e-3 || bu.getX(i) > 1 - 1e-3) continue; close(d.u, bu.getX(i), 'u'); close(d.v, 1 - bu.getY(i), 'v'); }
  for (const mirror of [false, true]) {
    const box = ROOM_LIFE.venedig![0].box, p = lifePatch(box, mirror), patch = new T.SphereGeometry(58, 8, 4, p.phiStart, p.phiLength, p.thetaStart, p.thetaLength), pos = patch.attributes.position, uv = patch.attributes.uv;
    assert.equal(p.flip, !mirror);
    for (let i = 0; i < pos.count; i++) {
      // where the room shows this direction in its picture (a picture shown the right way round is read backwards across) ...
      const d = back(pos.getX(i), pos.getY(i), pos.getZ(i)), pictureU = mirror ? d.u : 1 - d.u;
      // ... and what the film shows there (the material reads it backwards across when flip)
      const filmU = p.flip ? 1 - uv.getX(i) : uv.getX(i), filmV = 1 - uv.getY(i);
      close(pictureU, box[0] + filmU * (box[2] - box[0]), `u, mirror ${mirror}`); close(d.v, box[1] + filmV * (box[3] - box[1]), `v, mirror ${mirror}`);
    }
  }
});

test('a film fades into the room over the same picture pixels on every side, and shows whole in its middle', () => {
  const f = 0.08, a = 16 / 9;
  assert.equal(lifeFeather(0.5, 0.5, f, a), 1); for (const [u, v] of [[0, 0.5], [1, 0.5], [0.5, 0], [0.5, 1]]) assert.equal(lifeFeather(u, v, f, a), 0);
  for (const t of [0.2, 0.5, 0.8]) { close3(lifeFeather(t * f, 0.5, f, a), lifeFeather(0.5, t * f * a, f, a)); close3(lifeFeather(t * f, 0.5, f, a), lifeFeather(1 - t * f, 0.5, f, a)); }
  let last = -1; for (let u = 0; u <= 0.5; u += 0.01) { const v = lifeFeather(u, 0.5, f, a); assert.ok(v >= last && v >= 0 && v <= 1); last = v; }
  function close3(x: number, y: number) { assert.ok(Math.abs(x - y) < 1e-9, `${x} ${y}`); }
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
