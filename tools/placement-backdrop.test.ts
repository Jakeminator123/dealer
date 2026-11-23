// The pure parts of tools/placement-backdrop.ts: where the dolls' pictures lie, the dolls in the studio's list (whose doll
// lies under the cards) and film and plan pixels. The stills themselves need the lab server and Chrome and are not made
// here. Run: node --test tools/placement-backdrop.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {DOLL_BACKDROPS, VIEWS} from '../src/placement-model.ts';
import {STILLS, dollFor, readPlacementAddress, shownBackdrop, stillsFor, type Film} from '../studio/lib/placement.ts';
import {DOLL_RECEIPT, FILM, FOLDER, PLAN, RECEIPT, dollStill, filmToPlan, planToFilm} from './placement-backdrop.ts';

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
  assert.equal(dollFor('ada').id, 'docka-standard', 'a dealer without a doll of her own');
  assert.equal(dollFor('nydealer').id, 'docka-standard', 'a dealer who comes later');
  assert.deepEqual(stillsFor('paow').map(s => s.id), ['docka-paow', 'docka-standard']);
  assert.deepEqual(stillsFor('ada').map(s => s.id), ['docka-standard', 'docka-paow']);
  // nothing chosen: the default follows the chosen dealer
  assert.deepEqual(shownBackdrop(null, [], 'paow'), {kind: 'still', still: 'docka-paow', path: 'assets/lab/placement-backdrop/docka-paow.jpg'});
  assert.deepEqual(shownBackdrop(null, [], 'ada'), {kind: 'still', still: 'docka-standard', path: 'assets/lab/placement-backdrop/docka-standard.jpg'});
});

test("the address names a doll or a film; an old link's bakgrund=neutral, and any unknown name, lands on the dealer's doll", () => {
  const address = readPlacementAddress(new URLSearchParams('bakgrund=docka-standard'));
  assert.equal(address.backdrop, 'docka-standard');
  assert.deepEqual(shownBackdrop(address.backdrop, [], 'paow'), {kind: 'still', still: 'docka-standard', path: 'assets/lab/placement-backdrop/docka-standard.jpg'}, 'another doll than her own can be chosen');
  const old = readPlacementAddress(new URLSearchParams('plats=p4c2&bakgrund=neutral'));
  assert.equal(old.backdrop, 'neutral');
  assert.deepEqual(shownBackdrop(old.backdrop, [], 'paow'), shownBackdrop(null, [], 'paow'), "Siluett's old link shows the dealer's doll");
  assert.deepEqual(shownBackdrop(old.backdrop, [], 'ada'), shownBackdrop(null, [], 'ada'));
  assert.deepEqual(shownBackdrop('docka-okand', [], 'paow'), shownBackdrop(null, [], 'paow'), 'an unknown name');
  assert.equal(readPlacementAddress(new URLSearchParams('plats=p4c2')).backdrop, null);
  const film: Film = {id: 'paow-giv-p4-c2-01', title: 'A2.3 → A3P4C2', path: 'assets/motions/paow-giv-p4-c2-01/source.mp4', width: 1764, height: 1174, frames: 90, fps: 30, start: 0, target: 'P4.C2'};
  assert.deepEqual(shownBackdrop(film.id, [film], 'paow'), {kind: 'film', film});
  assert.deepEqual(shownBackdrop(film.id, [], 'ada'), shownBackdrop(null, [], 'ada'), "a film that is not the chosen dealer's is never shown");
});

test('film pixels and plan pixels: the two ends meet, and one is the other undone', () => {
  assert.deepEqual(filmToPlan({x: 0, y: 0}), {x: 0, y: 0});
  const end = filmToPlan({x: FILM.width - 1, y: FILM.height - 1});
  assert.ok(Math.abs(end.x - (PLAN.width - 1)) < 1e-9 && Math.abs(end.y - (PLAN.height - 1)) < 1e-9);
  const p = {x: 853.3, y: 1101.5}, back = filmToPlan(planToFilm(p));
  assert.ok(Math.abs(back.x - p.x) < 1e-9 && Math.abs(back.y - p.y) < 1e-9);
  assert.ok(Math.abs(planToFilm({x: 880, y: 0}).x - 880 * 1763 / 1761) < 1e-9);
});
