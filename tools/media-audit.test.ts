// tools/media-audit.ts: what a folder of the ignored media is, and whether anything uses it. Pure logic only; no media is read.
import test from 'node:test';
import assert from 'node:assert/strict';
import {unitOf, unitsOf, rank, roleClaims, playedTakes, judgedBy, pathsIn, idsNamed, whatOf, type Claim} from './media-audit.ts';

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
    {id: 'p', role: 'prov', proof: 'paow-runda'},
    {id: 'r', role: 'referens', path: 'assets/reference/v6.mp4'},
  ]}}};
  const by = Object.fromEntries(roleClaims(roles, new Set(['paow-vila-01-01'])).map(c => [c.path, c.use]));
  assert.deepEqual(by, {'assets/keystones/paow-staende/keystone.png': 'visas', 'assets/anchors/paow-vila-ung-2/anchor.png': 'visas', 'assets/anchors/paow-vila-kavaj/anchor.png': 'bara registrerad',
    'assets/films/paow/ny-giv/source.mp4': 'bara registrerad', 'assets/motions/paow-vila-01-01/source.mp4': 'spelas', 'assets/proofs/paow-runda': 'bara registrerad', 'assets/reference/v6.mp4': 'referens'});
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
