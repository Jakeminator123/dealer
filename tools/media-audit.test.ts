// tools/media-audit.ts: what a folder of the ignored media is, and whether anything uses it. Pure logic only; no media is read.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {unitOf, unitsOf, rank, roleClaims, playedTakes, judgedBy, pathsIn, idsNamed, whatOf, measureCard, cardVerdict, cardWords, cameraOf, findCard, edgeRowOf, boxOff, fitAll, type Claim, type FitRule} from './media-audit.ts';
import {classify} from '../src/card-track.ts';

test('a unit is the folder that is one thing, at its top folder\'s depth', () => {
  assert.equal(unitOf('assets/motions/paow-vila-01-01/source.mp4'), 'assets/motions/paow-vila-01-01');
  assert.equal(unitOf('assets/films/pamela/b20-p3-c1-plan-deal-03-ref/source.mp4'), 'assets/films/pamela/b20-p3-c1-plan-deal-03-ref');
  assert.equal(unitOf('assets/speech/paow/patches/paow-mun-x/patch.json'), 'assets/speech/paow/patches/paow-mun-x', 'a mouth patch is one level further down');
  assert.equal(unitOf('assets/speech/paow/paow-tal-hej-sv-10/source.mp4'), 'assets/speech/paow/paow-tal-hej-sv-10');
  assert.equal(unitOf('assets/props/source/tray-meshy.glb'), 'assets/props/source/tray-meshy.glb', 'each Meshy source is its own unit');
  assert.equal(unitOf('assets/props/tray.glb'), 'assets/props/tray.glb', 'a file higher up than the depth is its own unit');
  assert.equal(unitOf('assets/frames/deal/frame-127.png'), 'assets/frames/deal');
  assert.equal(unitOf('output/v6/take-01/render/a.png'), 'output/v6/take-01');
  assert.equal(unitOf('src/clip-graph.ts'), null, 'only assets/ and output/');
});

test('units sum their files and keep the first and last date', () => {
  const day = (d: string) => Date.parse(`${d}T12:00:00Z`);
  const [u] = unitsOf([{path: 'assets/orders/o-1/receipt.json', bytes: 10, mtimeMs: day('2026-11-12')}, {path: 'assets/orders/o-1/take-1/source.mp4', bytes: 90, mtimeMs: day('2026-11-14')}]);
  assert.deepEqual({path: u.path, top: u.top, bytes: u.bytes, files: u.files, made: u.made, changed: u.changed}, {path: 'assets/orders/o-1', top: 'assets/orders', bytes: 100, files: 2, made: '2026-11-12', changed: '2026-11-14'});
});

test('the strongest use wins, with only its reasons; nothing named is okänd', () => {
  const units = unitsOf([{path: 'assets/motions/a/source.mp4', bytes: 1, mtimeMs: 0}, {path: 'assets/motions/b/source.mp4', bytes: 1, mtimeMs: 0}]);
  const claims: Claim[] = [
    {path: 'assets/motions/a', use: 'bara registrerad', why: 'data/clip-jobs.json a'},
    {path: 'assets/motions/a/source.mp4', use: 'spelas', why: 'huvudtagning'},
    {path: 'assets/motions', use: 'visas', why: 'a claim on the top folder says nothing about one film'},
  ];
  const [a, b] = rank(units, claims);
  assert.deepEqual([a.use, a.why], ['spelas', ['huvudtagning']]);
  assert.deepEqual([b.use, b.why], ['okänd', []]);
});

test('Material: a superseded picture and a film outside the bank are only registered; what holds or is a candidate is shown', () => {
  const roles = {dealers: {paow: {entries: [
    {id: 'k', role: 'keystone', path: 'assets/keystones/paow-staende/keystone.png', state: 'gäller'},
    {id: 'c', role: 'ankare-1', path: 'assets/anchors/paow-vila-ung-2/anchor.png', state: 'kandidat'},
    {id: 'e', role: 'ankare-1', path: 'assets/anchors/paow-vila-kavaj/anchor.png', state: 'ersatt'},
    {id: 'f', role: 'film', path: 'assets/films/paow/ny-giv/source.mp4', note: 'Utanför banken.'},
    {id: 'g', role: 'film', path: 'assets/motions/paow-vila-01-01/source.mp4'},
    {id: 'r', role: 'referens', path: 'assets/reference/v6.mp4'},
  ]}}};
  const by = Object.fromEntries(roleClaims(roles, new Set(['paow-vila-01-01'])).map(c => [c.path, c.use]));
  assert.deepEqual(by, {'assets/keystones/paow-staende/keystone.png': 'visas', 'assets/anchors/paow-vila-ung-2/anchor.png': 'visas', 'assets/anchors/paow-vila-kavaj/anchor.png': 'bara registrerad',
    'assets/films/paow/ny-giv/source.mp4': 'bara registrerad', 'assets/motions/paow-vila-01-01/source.mp4': 'spelas', 'assets/reference/v6.mp4': 'referens'});
});

test('the bank plays the main take and a rest with weight, never a rejected take', () => {
  const job = (id: string, from: string, to: string, kind: string) => ({id, kind, from, to, target: null, model: 'kling4', duration: 5, ratio: '1764:1174', audio: false, promptText: '', first: {}, purpose: '', dealer: 'paow'});
  const data = {
    jobs: [job('deal-a', 'READY', 'P4.C1', 'DEAL'), job('deal-b', 'READY', 'P4.C1', 'DEAL'), job('rest-a', 'IDLE', 'IDLE', 'IDLE'), job('rest-b', 'IDLE', 'IDLE', 'IDLE')],
    motions: {'deal-a': {review: {decision: 'APPROVED'}}, 'deal-b': {review: {decision: 'REJECTED'}}, 'rest-a': {review: {decision: 'APPROVED'}, motion: {idle: {weight: 2, calm: true}}}, 'rest-b': {review: {decision: 'APPROVED'}, motion: {idle: {weight: 0, calm: false}}}},
    media: {'deal-a': {video: 'x'}, 'deal-b': {video: 'x'}, 'rest-a': {video: 'x'}, 'rest-b': {video: 'x'}},
  };
  const played = playedTakes(data as never, ['paow']);
  assert.ok(played.get('deal-a')?.startsWith('huvudtagning'));
  assert.ok(played.has('rest-a'));
  assert.equal(played.has('deal-b'), false, 'rejected');
  assert.equal(played.has('rest-b'), false, 'weight 0 and not on request: the idle never picks it');
});

test('Jakob\'s verdict is his words or his yes; a provisional verdict is not his', () => {
  assert.equal(judgedBy({userReview: 'Bra', userAccepted: false}), 'Jakob');
  assert.equal(judgedBy({userAccepted: true}), 'Jakob');
  assert.equal(judgedBy({userAccepted: false, provisional: {by: 'huvudagenten'}}), null);
  assert.equal(judgedBy(undefined), null);
});

test('paths and proof ids are read out of a text', () => {
  assert.deepEqual(pathsIn('se "assets/films/pamela/b20/source.mp4", och output\\v6\\take-01/.'), ['assets/films/pamela/b20/source.mp4', 'output/v6/take-01']);
  assert.deepEqual(idsNamed('Prov `kort-en-linje` och assets/proofs/paow-runda/a.png, men inte kort-en-linje-2', ['kort-en-linje', 'paow-runda', 'kort-en']), ['kort-en-linje', 'paow-runda']);
});

test('a document names an id only exactly: trailer-noir is not found inside trailer-noir-3', () => {
  const handoff = 'noir-trailer 3 och filmen före spelet (`assets/films/intro/noir-3/`), Prov `trailer-noir-3` och paow-runda-6-steg.';
  assert.deepEqual(idsNamed(handoff, ['trailer-noir', 'trailer-noir-3', 'paow-runda', 'noir-3']), ['trailer-noir-3', 'noir-3']);
  assert.deepEqual(idsNamed('se paow-tal-reel-demo8 och paow-tal-reel-demo', ['paow-tal-reel-demo', 'paow-tal-reel-demo8', 'paow-tal-reel-demo2']), ['paow-tal-reel-demo', 'paow-tal-reel-demo8']);
  assert.deepEqual(idsNamed('frames/deal och native.jpg', ['deal', 'native.jpg']), ['native.jpg'], 'a plain short word does not count');
});

test('every unit says what it is in Swedish', () => {
  const u = (p: string) => whatOf({path: p, top: p.split('/').slice(0, 2).join('/'), bytes: 0, files: 0, made: '', changed: ''});
  assert.match(u('assets/films/pamela/b20-p3-c1-plan-deal-03-ref'), /^Pamelas film utanför banken/);
  assert.match(u('assets/orders/paow-ankare-2-1'), /beställning/);
  assert.match(u('output/v6/take-01'), /V6/);
});

// ── Fit ─────────────────────────────────────────────────────────────────────
const RULE: FitRule = {placePx: 15, sizeShare: 0.12, handsPx: 8};
const square = (x: number, y: number, s: number) => [{x, y}, {x: x + s, y}, {x: x + s, y: y + s}, {x, y: y + s}];

test('a card is measured by how far its middle lies from the rule\'s and by the root of the areas', () => {
  const m = measureCard(square(110, 110, 80), square(100, 100, 100), 'P7.C1');
  assert.deepEqual(m, {distancePx: 0, size: 0.8, card: 'P7.C1'}, 'same middle, 80 % of the side');
  assert.equal(cardVerdict(m, RULE), 'äldre plan', 'a fifth smaller is more than the 12 % allowed');
  assert.equal(cardWords(m), 'Kortet ligger 0 px från platsen P7.C1 och är 20 % mindre än kortet dagens plan ritar (planCardQuad).');
  assert.equal(cardVerdict(measureCard(square(108, 100, 100), square(100, 100, 100), 'P4.C1'), RULE), 'stämmer', '8 px off and the same size');
  assert.equal(cardVerdict(measureCard(square(120, 100, 100), square(100, 100, 100), 'P4.C1'), RULE), 'äldre plan', '20 px off');
});

test('the camera is told by the frame: the bank\'s 1764 × 1174, V6\'s 1762 × 1174 is another', () => {
  const bank = {width: 1764, height: 1174};
  assert.equal(cameraOf(1764, 1174, bank), 'bankens');
  assert.equal(cameraOf(1762, 1174, bank), 'annan');
  assert.equal(cameraOf(1536, 1024, bank), 'annan');
});

test('the card is found by the films\' colours near the rule\'s card, and the table edge where the felt fills the middle', () => {
  const w = 200, h = 200, rgb = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 3, felt = y >= 120, card = x >= 90 && x < 130 && y >= 140 && y < 180;
    const [r, g, b] = card ? [232, 208, 8] : felt ? [20, 120, 40] : [90, 60, 50]; rgb[i] = r; rgb[i + 1] = g; rgb[i + 2] = b; }
  const cls = classify(rgb, w * h), found = findCard(cls, w, h, square(95, 140, 40), 30)!;
  const m = measureCard(found, square(90, 140, 40), 'P4.C1');
  assert.ok(m.distancePx < 1 && Math.abs(m.size - 1) < 0.05, JSON.stringify(m));
  assert.equal(edgeRowOf(cls, w, h), 120);
  assert.equal(findCard(cls, w, h, square(10, 10, 20), 5), null, 'no card there');
  assert.equal(boxOff([700, 780, 836, 872], [703, 781, 836, 872]), 3);
});

test('rest hands use the held image for each dealer and require a measurable reference', async t => {
  const root = mkdtempSync(path.join(tmpdir(), 'dealer-fit-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  for (const dir of ['data/orders', 'motions', 'src', 'evidence', 'placements']) mkdirSync(path.join(root, dir), {recursive: true});
  const entry = (id: string, state: string, role = 'ankare-1', frame?: number) => ({id, state, role, frame, path: `assets/anchors/${id}/image.png`});
  writeFileSync(path.join(root, 'data/media-roles.json'), JSON.stringify({dealers: {
    pamela: {entries: [entry('pamela-proposal', 'kandidat'), entry('pamela-holds', 'gäller')]},
    paow: {entries: [entry('paow-too-far', 'kandidat'), entry('paow-holds', 'gäller', 'ankare-1', 17), entry('paow-good', 'kandidat'),
      entry('paow-one-hand', 'kandidat'), entry('paow-at-shoe', 'gäller', 'ankare-2.1')]},
    missing: {entries: [entry('missing-holds', 'gäller'), entry('missing-proposal', 'kandidat')]},
  }}));
  writeFileSync(path.join(root, 'data/dealer-standard.json'), JSON.stringify({
    hands: {leftInPicture: {box: [300, 300, 329, 329]}, rightInPicture: {box: [410, 300, 439, 329]}, fitTolerancePx: {hands: 8}},
    shoe: {box: [500, 300, 580, 340]},
  }));
  const sourceBytes = Buffer.from('synthetic reference source');
  for (const id of ['pamela-holds', 'paow-holds']) {
    const folder = path.join(root, 'assets/anchors', id);
    mkdirSync(folder, {recursive: true});
    writeFileSync(path.join(folder, 'image.png'), sourceBytes);
  }
  const poses: Record<string, number[]> = {
    'pamela-holds': [300, 410], 'pamela-proposal': [303, 413], 'paow-holds': [325, 435], 'paow-good': [329, 439],
    'paow-too-far': [343, 453], 'paow-one-hand': [329], 'paow-at-shoe': [325, 435], 'missing-proposal': [302, 412],
  };
  const {entries} = await fitAll(root, async (_repo, file, frame) => {
    const name = file.split('/')[2], hands = poses[name];
    if (!hands) return null;
    if (name === 'paow-holds') assert.equal(frame, 17);
    const w = 1764, h = 1174, rgb = new Uint8Array(w * h * 3);
    for (const left of hands) for (let y = 300; y < 325; y++) for (let x = left; x < left + 25; x++) {
      const i = (y * w + x) * 3;
      rgb[i] = 200; rgb[i + 1] = 140; rgb[i + 2] = 115;
    }
    const shoe = name === 'paow-one-hand' ? 512 : 500;
    for (let y = 300; y < 311; y++) for (let x = shoe; x < shoe + 11; x++) {
      const i = (y * w + x) * 3;
      rgb[i] = 232; rgb[i + 1] = 208; rgb[i + 2] = 8;
    }
    return {rgb, w, h};
  });

  assert.equal(entries['pamela-proposal'].measured?.leftInPicture, 3);
  assert.equal(entries['paow-good'].verdict, 'stämmer');
  assert.equal(entries['paow-good'].measured?.leftInPicture, 4);
  assert.equal(entries['paow-good'].measured?.rightInPicture, 4);
  assert.deepEqual(entries['paow-good'].measured?.calibration, {
    dealer: 'paow', role: 'ankare-1', entry: 'paow-holds', path: 'assets/anchors/paow-holds/image.png', frame: 17,
    sha256: createHash('sha256').update(sourceBytes).digest('hex'),
  });
  assert.match(entries['paow-holds'].words, /kalibreringsbild/);
  assert.equal(entries['paow-too-far'].verdict, 'avviker');
  assert.equal(entries['paow-too-far'].measured?.leftInPicture, 18);
  for (const id of ['paow-one-hand', 'paow-at-shoe', 'missing-proposal']) assert.equal(entries[id].verdict, 'går inte att mäta', id);
  assert.equal(entries['paow-one-hand'].measured?.shoeOffPx, 12);
  assert.match(entries['missing-proposal'].words, /gällande ankare 1/);
  assert.equal(entries['missing-proposal'].measured?.calibration, undefined);
});
