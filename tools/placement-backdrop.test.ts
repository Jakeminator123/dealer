// The pure parts of tools/placement-backdrop.ts: film and plan pixels, the patches that tell dealer from shoe, a doll at the
// table and the dolls in the studio's list (whose doll lies under the cards), the card in a picture, and the scene's look.
// The stills themselves need the lab server and Chrome and are not made here. Run: node --test tools/placement-backdrop.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {FELT_MARKS} from '../src/scene3d-table.ts';
import {DOLL_BACKDROPS, VIEWS} from '../src/placement-model.ts';
import {STILLS, dollFor, readPlacementAddress, shownBackdrop, stillsFor, type Film} from '../studio/lib/placement.ts';
import {SHIPPED} from '../studio/lib/scene-presets.ts';
import {
  DOLL_RECEIPT, FILM, FOLDER, MARKS, PLAN, RECEIPT, cardIn, dollOver, dollStill, differs, filmToPlan, grown, lookOf, patchIn, patches, planToFilm, quadCentre,
} from './placement-backdrop.ts';

test("a doll's picture lies in the backdrops' folder, beside the hash-locked V6 pictures and never on them, its still and the receipts beside it", () => {
  assert.equal(FOLDER, 'assets/lab/placement-backdrop');
  assert.equal(RECEIPT, 'assets/lab/placement-backdrop/receipt.json');
  assert.deepEqual(DOLL_BACKDROPS.map(d => d.doll), ['standard', 'paow']);
  for (const d of DOLL_BACKDROPS) {
    assert.equal(d.id, `docka-${d.doll}`);
    assert.equal(d.native, `${FOLDER}/docka-${d.doll}.jpg`);
    assert.equal(dollStill(d.doll), `${FOLDER}/docka-${d.doll}.png`);
    assert.ok(!([VIEWS.native.background, VIEWS.portrait.background] as string[]).includes(d.native));
    assert.equal('portrait' in d, false, 'Mobil has no home view of the scene to match');
  }
  assert.equal(DOLL_RECEIPT, 'assets/lab/placement-backdrop/docka-receipt.json');
});

test("under the cards lies the chosen dealer's doll: her own, or the standard doll for a dealer without one; the other dolls follow in the list", () => {
  assert.deepEqual(STILLS.map(s => [s.id, s.word, s.path]), DOLL_BACKDROPS.map(d => [d.id, `Docka: ${d.doll.charAt(0).toUpperCase()}${d.doll.slice(1)}`, d.native]));
  assert.deepEqual(STILLS.map(s => s.word), ['Docka: Standard', 'Docka: Paow'], 'the list says Docka and no other word (Jakob 2026-11-23: the doll takes over from Siluett)');
  assert.equal(dollFor('paow').id, 'docka-paow');
  assert.equal(dollFor('pamela').id, 'docka-standard', 'a dealer without a doll of her own');
  assert.equal(dollFor('nydealer').id, 'docka-standard', 'a dealer who comes later');
  assert.deepEqual(stillsFor('paow').map(s => s.id), ['docka-paow', 'docka-standard']);
  assert.deepEqual(stillsFor('pamela').map(s => s.id), ['docka-standard', 'docka-paow']);
  // nothing chosen: the default follows the chosen dealer
  assert.deepEqual(shownBackdrop(null, [], 'paow'), {kind: 'still', still: 'docka-paow', path: 'assets/lab/placement-backdrop/docka-paow.jpg'});
  assert.deepEqual(shownBackdrop(null, [], 'pamela'), {kind: 'still', still: 'docka-standard', path: 'assets/lab/placement-backdrop/docka-standard.jpg'});
});

test("the address names a doll or a film; an old link's bakgrund=neutral, and any unknown name, lands on the dealer's doll", () => {
  const address = readPlacementAddress(new URLSearchParams('bakgrund=docka-standard'));
  assert.equal(address.backdrop, 'docka-standard');
  assert.deepEqual(shownBackdrop(address.backdrop, [], 'paow'), {kind: 'still', still: 'docka-standard', path: 'assets/lab/placement-backdrop/docka-standard.jpg'}, 'another doll than her own can be chosen');
  const old = readPlacementAddress(new URLSearchParams('plats=p4c2&bakgrund=neutral'));
  assert.equal(old.backdrop, 'neutral');
  assert.deepEqual(shownBackdrop(old.backdrop, [], 'paow'), shownBackdrop(null, [], 'paow'), "Siluett's old link shows the dealer's doll");
  assert.deepEqual(shownBackdrop(old.backdrop, [], 'pamela'), shownBackdrop(null, [], 'pamela'));
  assert.deepEqual(shownBackdrop('docka-okand', [], 'paow'), shownBackdrop(null, [], 'paow'), 'an unknown name');
  assert.equal(readPlacementAddress(new URLSearchParams('plats=p4c2')).backdrop, null);
  const film: Film = {id: 'paow-giv-p4-c2-01', title: 'A2.3 → A3P4C2', path: 'assets/motions/paow-giv-p4-c2-01/source.mp4', width: 1764, height: 1174, frames: 90, fps: 30, start: 0, target: 'P4.C2'};
  assert.deepEqual(shownBackdrop(film.id, [film], 'paow'), {kind: 'film', film});
  assert.deepEqual(shownBackdrop(film.id, [], 'pamela'), shownBackdrop(null, [], 'pamela'), "a film that is not the chosen dealer's is never shown");
});

test('a doll at the table: the table where the doll is clear, the doll over the table, the shoe over the doll', async () => {
  const film = {width: 64, height: 24}, plan = {width: 62, height: 24};
  const table = new Uint8Array(film.width * film.height * 3), shoe = new Uint8Array(film.width * film.height * 4);
  for (let i = 0; i < film.width * film.height; i++) table.set([10, 120, 60], i * 3);
  for (let y = 2; y <= 21; y++) for (let x = 2; x <= 24; x++) shoe.set([200, 30, 30, 255], (y * film.width + x) * 4);
  const rgba = new Uint8Array(plan.width * plan.height * 4);
  for (let y = 4; y <= 19; y++) for (let x = 14; x <= 40; x++) rgba.set([240, 240, 240, 255], (y * plan.width + x) * 4);
  const doll = await sharp(rgba, {raw: {...plan, channels: 4}}).png().toBuffer();
  const out = await dollOver({data: table, ...film}, {data: shoe, ...film}, doll, plan);
  const {data, info} = await sharp(out).removeAlpha().raw().toBuffer({resolveWithObject: true});
  assert.deepEqual([info.width, info.height], [plan.width, plan.height]);
  const at = (x: number, y: number) => [...data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3)];
  const near = (got: number[], want: number[], what: string) => assert.ok(got.every((v, i) => Math.abs(v - want[i]) <= 2), `${what}: ${got}`);
  near(at(52, 12), [10, 120, 60], 'the table where the doll is clear');
  near(at(30, 12), [240, 240, 240], 'the doll over the table');
  near(at(19, 12), [200, 30, 30], 'the shoe over the doll');
  near(at(7, 12), [200, 30, 30], 'the shoe over the table');
  near(at(30, 1), [10, 120, 60], 'the table above the doll');
  const flat = await sharp(rgba, {raw: {...plan, channels: 4}}).removeAlpha().png().toBuffer();
  await assert.rejects(dollOver({data: table, ...film}, {data: shoe, ...film}, flat, plan), /genomskinlig/, 'a doll without alpha would hide the table');
  await assert.rejects(dollOver({data: table, ...film}, {data: shoe, ...film}, doll, film), /64 × 24/, 'a doll in film pixels is not resized here');
});

test('film pixels and plan pixels: the two ends meet, and one is the other undone', () => {
  assert.deepEqual(filmToPlan({x: 0, y: 0}), {x: 0, y: 0});
  const end = filmToPlan({x: FILM.width - 1, y: FILM.height - 1});
  assert.ok(Math.abs(end.x - (PLAN.width - 1)) < 1e-9 && Math.abs(end.y - (PLAN.height - 1)) < 1e-9);
  const p = {x: 853.3, y: 1101.5}, back = filmToPlan(planToFilm(p));
  assert.ok(Math.abs(back.x - p.x) < 1e-9 && Math.abs(back.y - p.y) < 1e-9);
  assert.ok(Math.abs(planToFilm({x: 880, y: 0}).x - 880 * 1763 / 1761) < 1e-9);
});

test('patches: what differs falls into connected pieces, the one in a box is found, and a piece grows', () => {
  const W = 12, H = 6, a = new Uint8Array(W * H * 3), b = new Uint8Array(W * H * 3);
  const dot = (x: number, y: number, v = 200) => { b[(y * W + x) * 3 + 1] = v; };
  for (const [x, y] of [[1, 1], [2, 1], [2, 2]]) dot(x, y); // a piece on the left
  for (const [x, y] of [[8, 3], [9, 3], [9, 4], [10, 4]]) dot(x, y); // a piece on the right
  dot(5, 5, 3); // below the level: not a difference
  const mask = differs(a, b, 4);
  assert.equal(mask.reduce((s, v) => s + v, 0), 7);
  const {labels, list} = patches(mask, W, H);
  assert.equal(list.length, 2);
  assert.deepEqual(list.map(p => [p.pixels, p.box]), [[3, [1, 1, 2, 2]], [4, [8, 3, 10, 4]]]);
  assert.equal(patchIn(labels, W, [7.6, 2.4, 11, 5]), 1);
  assert.equal(patchIn(labels, W, [4, 0, 6, 5]), null);
  const g = grown(labels, 0, W, H, 1); let n = 0, x0 = W, x1 = 0; g.forEach((v, i) => { if (v) { n++; x0 = Math.min(x0, i % W); x1 = Math.max(x1, i % W); } });
  assert.deepEqual([x0, x1], [0, 3]);
  assert.equal(n, 15);
});

test('a card in a picture: its face\'s pixels, centre and extent; a quad\'s area centre', () => {
  const W = 40, H = 30, rgb = new Uint8Array(W * H * 3).fill(30);
  for (let y = 10; y <= 19; y++) for (let x = 5; x <= 14; x++) { const i = (y * W + x) * 3; rgb[i] = 0; rgb[i + 1] = 115; rgb[i + 2] = 235; }
  const card = cardIn(rgb, W, [0, 0, 39, 29], 'FRONT')!;
  assert.equal(card.pixels, 100);
  assert.deepEqual([card.centre, card.box], [{x: 9.5, y: 14.5}, [5, 10, 14, 19]]);
  assert.equal(cardIn(rgb, W, [0, 0, 39, 29], 'BACK'), null);
  assert.equal(cardIn(rgb, W, [20, 0, 39, 29], 'FRONT'), null);
  const c = quadCentre([{x: 0, y: 0}, {x: 10, y: 0}, {x: 10, y: 4}, {x: 0, y: 4}]);
  assert.ok(Math.abs(c.x - 5) < 1e-9 && Math.abs(c.y - 2) < 1e-9);
});

test('the look: the shipped Basgrund at the home view, still, without rendered cards and without the printed card boxes', () => {
  const base = SHIPPED.find(p => p.name === 'basgrund')!.state, look = lookOf(base);
  assert.equal(look.room, base.room);
  assert.equal(look.tray, base.tray);
  assert.deepEqual([look.yaw, look.pitch, look.zoom, look.dx, look.dy, look.dz, look.sway, look.format], [0, 0, 1, 0, 0, 0, false, 'desk']);
  assert.deepEqual([look.cards, look.focus, look.dust, look.clock], [false, 'off', 0, false]);
  assert.deepEqual(MARKS.split(','), FELT_MARKS.filter(m => m !== 'boxes'));
});
