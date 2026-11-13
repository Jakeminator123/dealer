// Offline tests for the pure card-tracking logic. Synthetic frames only: no media, sharp, ffmpeg or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {is, classify, YELLOW, BLUE, TABLE, SKIN, DARK, TINT, SHADE, OTHER, blobs, pieces, persistent, measure, hull, fitQuad, orderCorners, alignCorners, carryAcrossFlip,
  signedArea, dist, centre, sideOf, EDGE_THICKNESS, MIN_AREA, smooth, offsetRamp, homography, project, follower, buildTrack, thinSliver, settleRaws, isPale, paleMask, SMEAR, type Pt, type Raw} from '../src/card-track.ts';

const GREEN = [10, 208, 56], LIT = [232, 208, 4], FACE = [6, 112, 224], BLACK = [20, 20, 20], RIM = [235, 225, 160], FLESH = [240, 172, 140];
const W = 320, H = 240, N = W * H;
type Shape = {q: Pt[]; colour: number[]};
const rect = (x: number, y: number, w: number, h: number): Pt[] => [{x, y}, {x: x + w, y}, {x: x + w, y: y + h}, {x, y: y + h}];
const turned = (cx: number, cy: number, w: number, h: number, deg: number): Pt[] => { const a = deg * Math.PI / 180; return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => ({x: cx + x * Math.cos(a) - y * Math.sin(a), y: cy + x * Math.sin(a) + y * Math.cos(a)})); };
const within = (q: Pt[], x: number, y: number) => q.every((a, i) => { const b = q[(i + 1) % 4]; return (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) >= 0; });
/** A frame of table green with convex shapes painted in order (pixel centres at x+0.5, y+0.5). */
function frame(shapes: Shape[]): Uint8Array {
  const rgb = new Uint8Array(N * 3); for (let i = 0; i < N; i++) rgb.set(GREEN, i * 3);
  for (const s of shapes) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (within(s.q, x + 0.5, y + 0.5)) rgb.set(s.colour, (y * W + x) * 3);
  return rgb;
}
const grow = (q: Pt[], d: number): Pt[] => { const c = centre(q); return q.map(p => ({x: p.x + Math.sign(p.x - c.x) * d, y: p.y + Math.sign(p.y - c.y) * d})); };
const nearest = (q: Pt[], p: Pt) => Math.min(...q.map(c => dist(c, p)));
const maskOfShape = (q: Pt[], hole?: (x: number, y: number) => boolean) => { const m = new Uint8Array(N); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (within(q, x + 0.5, y + 0.5) && !hole?.(x + 0.5, y + 0.5)) m[y * W + x] = 1; return m; };
// Outlines are in pixel-edge coordinates (a pixel covers x-0.5..x+0.5), shapes above in pixel-centre+0.5 coordinates: half a pixel apart.
const shift = (q: Pt[]): Pt[] => q.map(p => ({x: p.x - 0.5, y: p.y - 0.5}));

test('colour rules: card sides, table, hand and the shoe frame are told apart', () => {
  assert.ok(is.yellow(232, 208, 4), 'lit back'); assert.ok(is.yellow(112, 160, 16), 'back tilted away from the light');
  assert.ok(is.blue(0, 112, 224), 'face'); assert.ok(!is.blue(10, 208, 56)); assert.ok(!is.yellow(10, 208, 56), 'table green');
  assert.ok(!is.yellow(240, 172, 140) && is.skin(240, 172, 140), 'skin'); assert.ok(!is.yellow(144, 112, 48) && !is.skin(144, 112, 48), 'tan frame of the shoe window is neither card nor hand');
  assert.ok(is.shade(176, 128, 0) && !is.yellow(176, 128, 0), 'back in finger shadow is its own class');
  const cls = classify(Uint8Array.from([...LIT, ...FACE, ...GREEN, ...FLESH, ...BLACK, 90, 160, 20, 176, 128, 0, 200, 200, 200]), 8);
  assert.deepEqual([...cls], [YELLOW, BLUE, TABLE, SKIN, DARK, TINT, SHADE, OTHER]);
});

test('side classification: colour decides, a thin shape is edge-on whatever its colour, too little is nothing', () => {
  assert.equal(sideOf(4000, 0, 55), 'BACK'); assert.equal(sideOf(0, 4000, 55), 'FRONT'); assert.equal(sideOf(300, 2000, 30), 'FRONT');
  assert.equal(sideOf(600, 0, EDGE_THICKNESS - 1), 'EDGE'); assert.equal(sideOf(0, 600, 3), 'EDGE');
  assert.equal(sideOf(MIN_AREA - 1, 0, 40), 'NONE'); assert.equal(sideOf(0, 0, 0), 'NONE');
});

test('quad fit: a turned card comes back within a pixel and a half, in clockwise texture order', () => {
  for (const deg of [0, 17, 33, 61, -25]) { const truth = turned(160, 120, 50, 80, deg), blob = blobs(maskOfShape(truth), W, H)[0], quad = measure(blob, W).quad!;
    assert.ok(quad, `quad at ${deg} degrees`); for (const p of shift(truth)) assert.ok(nearest(quad, p) < 1.5, `corner at ${deg} degrees is ${nearest(quad, p).toFixed(2)} px off`);
    const ordered = orderCorners(quad); assert.ok(signedArea(ordered) > 0, 'clockwise on screen');
    assert.ok(dist(ordered[0], ordered[1]) < dist(ordered[1], ordered[2]), 'side 0-1 is a short side');
    assert.ok(ordered[0].x + ordered[0].y + ordered[1].x + ordered[1].y <= ordered[2].x + ordered[2].y + ordered[3].x + ordered[3].y, 'and it is the upper left one'); }
});

test('quad fit: a corner hidden under a fingertip is rebuilt from the two edges that lead to it', () => {
  const truth = turned(160, 120, 56, 96, 28), corner = truth[0];
  const cornerBite = measure(blobs(maskOfShape(truth, (x, y) => Math.hypot(x - corner.x, y - corner.y) < 11), W, H)[0], W).quad!;
  for (const p of shift(truth)) assert.ok(nearest(cornerBite, p) < 2.5, `corner bite: ${nearest(cornerBite, p).toFixed(2)} px off`);
  // The fingertip lies over the top edge next to the corner: only a shoulder of the corner region and the far part of the edge stay visible.
  const along = {x: (truth[1].x - truth[0].x) / 56, y: (truth[1].y - truth[0].y) / 56}, tip = {x: corner.x + along.x * 16 - along.y * -2, y: corner.y + along.y * 16 + along.x * -2};
  const edgeBite = measure(blobs(maskOfShape(truth, (x, y) => Math.hypot(x - tip.x, y - tip.y) < 13), W, H)[0], W).quad!;
  for (const p of shift(truth)) assert.ok(nearest(edgeBite, p) < 4, `edge bite: ${nearest(edgeBite, p).toFixed(2)} px off`);
});

test('corner ordering: first sight is top left first; a card foreshortened to near square uses the more level sides as top and bottom', () => {
  const upright = orderCorners([{x: 60, y: 90}, {x: 20, y: 90}, {x: 20, y: 30}, {x: 60, y: 30}]); // given anticlockwise, starting bottom right
  assert.deepEqual(upright, [{x: 20, y: 30}, {x: 60, y: 30}, {x: 60, y: 90}, {x: 20, y: 90}]);
  const lying = orderCorners([{x: 80, y: 12}, {x: 10, y: 30}, {x: 10, y: 0}, {x: 80, y: -18}].reverse()); // oblong, turned on its side: short sides left and right
  assert.ok(dist(lying[0], lying[1]) < dist(lying[1], lying[2]) && signedArea(lying) > 0);
  const table = orderCorners([{x: 891, y: 1133.5}, {x: 817.5, y: 1133.5}, {x: 817.5, y: 1069.5}, {x: 887.2, y: 1069.5}]); // 72 x 64: a portrait card seen at table angle
  assert.deepEqual(table[0], {x: 817.5, y: 1069.5}); assert.deepEqual(table[1], {x: 887.2, y: 1069.5});
});

test('corner identity: survives a re-ordered fit, a moving card and a slow turn', () => {
  let prev = orderCorners(turned(100, 100, 40, 60, 0));
  for (let k = 1; k <= 30; k++) { const now = turned(100 + 9 * k, 100 + 2 * k, 40, 60, 4 * k), scrambled = [now[(k + 1) % 4], now[(k + 2) % 4], now[(k + 3) % 4], now[k % 4]];
    const kept = alignCorners(prev, k % 2 ? scrambled : [...scrambled].reverse()); for (let c = 0; c < 4; c++) assert.ok(dist(kept[c], now[c]) < 1e-9, `corner ${c} at step ${k}`); prev = kept; }
});

test('flip: a rigid card that turns over keeps its ends, and the new side is clockwise in its own texture order', () => {
  const before = [{x: 100, y: 100}, {x: 104, y: 110}, {x: 20, y: 150}, {x: 16, y: 140}]; // narrow, ends are sides 0-1 and 3-2
  const turnedOver = [{x: 96, y: 118}, {x: 100, y: 106}, {x: 12, y: 146}, {x: 8, y: 158}]; // each corner passed the line: physical order now runs anticlockwise
  assert.ok(signedArea(before) > 0 && signedArea(turnedOver) < 0);
  const after = carryAcrossFlip(before, [turnedOver[2], turnedOver[3], turnedOver[0], turnedOver[1]]);
  assert.ok(signedArea(after) > 0, 'texture order of the new side is clockwise');
  assert.deepEqual(after, [turnedOver[1], turnedOver[0], turnedOver[3], turnedOver[2]], 'left and right swap, each end keeps its two corners');
});

test('smoothing does not lag: straight and evenly accelerating motion pass unchanged, jitter on a still card shrinks', () => {
  const line = Array.from({length: 20}, (_, t) => 5 + 31 * t), curve = Array.from({length: 20}, (_, t) => 3 + 12 * t + 1.5 * t * t);
  smooth(line).forEach((v, t) => assert.ok(Math.abs(v! - line[t]) < 1e-9)); smooth(curve).forEach((v, t) => assert.ok(Math.abs(v! - curve[t]) < 1e-9));
  const still = Array.from({length: 40}, (_, t) => 100 + ((t * 7919) % 13 - 6) / 6), out = smooth(still) as number[], spread = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + (x - 100) ** 2, 0) / v.length);
  assert.ok(spread(out.slice(3, -3)) < 0.75 * spread(still.slice(3, -3)), 'jitter is reduced');
  assert.deepEqual(smooth([1, null, 5, 6, 7, null]), [1, null, 5, 6, 7, null], 'gaps stay gaps and are not smoothed across');
});

test('offset ramp: nothing before the edge-on frames, everything from the end, eased in between', () => {
  assert.equal(offsetRamp(40, 52, 64), 0); assert.equal(offsetRamp(52, 52, 64), 0); assert.equal(offsetRamp(64, 52, 64), 1); assert.equal(offsetRamp(90, 52, 64), 1);
  assert.equal(offsetRamp(58, 52, 64), 0.5); let last = 0; for (let f = 52; f <= 64; f++) { const v = offsetRamp(f, 52, 64); assert.ok(v >= last); last = v; }
  assert.ok(offsetRamp(53, 52, 64) < 0.03, 'starts gently'); assert.ok(offsetRamp(63, 52, 64) > 0.97, 'ends gently');
});

test('homography maps the four corners onto each other', () => {
  const from = [{x: 0, y: 0}, {x: 1, y: 0}, {x: 1, y: 1}, {x: 0, y: 1}], to = [{x: 820, y: 1071}, {x: 885, y: 1071}, {x: 888.6, y: 1130.8}, {x: 816.3, y: 1130.8}], h = homography(from, to);
  from.forEach((p, k) => assert.ok(dist(project(h, p.x, p.y), to[k]) < 1e-6)); assert.ok(within(to, project(h, 0.5, 0.5).x, project(h, 0.5, 0.5).y));
});

test('two cards that touch through a gap in the rim are parted at the rim', () => {
  const mask = new Uint8Array(N); for (let y = 40; y < 100; y++) for (let x = 40; x < 80; x++) mask[y * W + x] = 1; for (let y = 104; y < 164; y++) for (let x = 40; x < 80; x++) mask[y * W + x] = 1;
  for (let y = 100; y < 104; y++) for (let x = 52; x < 60; x++) mask[y * W + x] = 1; // an 8 px wide bridge across a 4 px rim
  assert.equal(blobs(mask, W, H).length, 1, 'one connected shape');
  const parts = pieces(mask, W, H); assert.equal(parts.length, 2); for (const p of parts) assert.ok(Math.abs(p.area - 2400) < 40, `each card keeps its own area, got ${p.area}`);
  assert.ok(Math.abs(parts[0].cy - parts[1].cy) > 55);
});

test('hull is clockwise on screen and the quad fit refuses what cannot be a quad', () => {
  const h = hull([{x: 0, y: 0}, {x: 10, y: 0}, {x: 10, y: 10}, {x: 0, y: 10}, {x: 5, y: 5}]); assert.equal(h.length, 4); assert.ok(signedArea(h) > 0);
  assert.equal(fitQuad([{x: 0, y: 0}, {x: 10, y: 0}, {x: 5, y: 8}]), null);
});

// ---- a whole deal, synthetic: seated card, pulled out over the next seated card, carried, turned edge-on, laid face up ----
const SEAT = {x: 220, y: 60}, CARD = {w: 40, h: 60};
function dealFrame(f: number): {rgb: Uint8Array; card: Pt[] | null; side: string} {
  const shoe: Shape[] = [{q: rect(200, 44, 90, 100), colour: BLACK}, {q: rect(SEAT.x, SEAT.y, CARD.w, CARD.h), colour: LIT}]; // the next card sits in the window all along
  const x = f < 5 ? SEAT.x : Math.max(60, SEAT.x - 12 * (f - 4)), y = f < 9 ? SEAT.y : Math.min(150, SEAT.y + 9 * (f - 8));
  const width = f < 13 ? 40 : f === 13 ? 28 : f === 14 ? 16 : f === 15 ? 6 : f === 16 ? 16 : f === 17 ? 28 : 40, side = f < 15 ? 'BACK' : f === 15 ? 'EDGE' : 'FRONT';
  const card = rect(x + (CARD.w - width) / 2, y, width, CARD.h), finger: Shape = {q: rect(x + 12, y - 30, 14, 36), colour: FLESH};
  return {rgb: frame([...shoe, {q: grow(card, 2), colour: RIM}, {q: card, colour: f < 16 ? LIT : FACE}, ...(f < 30 ? [finger] : [])]), card, side};
}
function track(make: (f: number) => Uint8Array, count: number): {raws: Raw[]; shoe: Uint8Array} {
  const counts = new Uint16Array(N); for (let f = 0; f < count; f++) { const cls = classify(make(f), N); for (let i = 0; i < N; i++) if (cls[i] === YELLOW) counts[i]++; }
  const shoe = persistent(counts, count), step = follower(W, H, shoe), raws: Raw[] = []; for (let f = 0; f < count; f++) raws.push(step(classify(make(f), N)));
  return {raws, shoe};
}

test('the seated card in the shoe window is ignored, yet the dealt card is followed out of that same window', () => {
  const {raws, shoe} = track(f => dealFrame(f).rgb, 40);
  let seat = 0; for (let i = 0; i < N; i++) seat += shoe[i]; assert.ok(Math.abs(seat - CARD.w * CARD.h) < 60, `the persistent yellow is the seated card, got ${seat} px`);
  assert.equal(raws[0].side, 'BACK'); assert.ok(raws[0].shoeShare > 0.9, 'frame 0: the card about to be dealt is still the seated one');
  for (let f = 0; f < 40; f++) { const truth = dealFrame(f); if (truth.side === 'EDGE') continue; const got = raws[f];
    assert.equal(got.side, truth.side, `side at frame ${f}`); assert.ok(got.corners, `quad at frame ${f}`);
    const c = centre(got.corners!), want = centre(shift(truth.card!)); assert.ok(dist(c, want) < 6, `frame ${f}: found ${c.x.toFixed(1)},${c.y.toFixed(1)}, card is at ${want.x.toFixed(1)},${want.y.toFixed(1)}`); }
  for (let f = 9; f < 40; f++) assert.ok(raws[f].shoeShare < 0.05, `frame ${f}: once out, nothing of the seated card is taken along`);
  assert.equal(raws[15].side, 'EDGE'); assert.ok(raws[15].segment && dist(...raws[15].segment!) > 45, 'the edge-on frame gives a line along the card');
});

test('a whole track: side ranges, the edge window, the resting quad in texture order and the confidence', () => {
  const {raws} = track(f => dealFrame(f).rgb, 40), t = buildTrack(raws);
  assert.deepEqual(t.ranges.BACK, [[0, 14]]); assert.deepEqual(t.ranges.EDGE, [[15, 15]]); assert.deepEqual(t.ranges.FRONT, [[16, 39]]); assert.deepEqual(t.edgeWindow, [15, 15]);
  assert.ok(t.leavesShoe !== null && t.leavesShoe >= 6 && t.leavesShoe <= 8, `leaves the shoe at ${t.leavesShoe}`);
  assert.ok(t.restFrom !== null && t.restFrom >= 18 && t.restFrom <= 22, `rest from ${t.restFrom}`);
  const truth = shift(rect(60, 150, 40, 60)); t.restQuad!.forEach((p, k) => assert.ok(dist(p, truth[k]) < 1.5, `resting corner ${k} in texture order: ${JSON.stringify(p)}`));
  for (const f of t.frames) { if (f.quad) assert.ok(signedArea(f.quad) > 0, `frame ${f.frame} clockwise`); assert.ok(f.confidence >= 0 && f.confidence <= 1); }
  assert.ok(t.frames[39].confidence >= 0.9 && t.frames[15].confidence <= 0.6, 'a resting card is trusted more than an edge-on line');
  assert.ok(t.restJitter && t.restJitter.clearMax < 1, 'a still card stays still');
});

test('a return clip: the blue card on the table is the card, the yellow one in the shoe never is', () => {
  const still = (f: number) => frame([{q: rect(200, 44, 90, 100), colour: BLACK}, {q: rect(SEAT.x, SEAT.y, CARD.w, CARD.h), colour: LIT}, {q: grow(rect(60, 150, 44, 40), 2), colour: RIM}, {q: rect(60, 150, 44, 40), colour: FACE},
    ...(f >= 4 && f < 12 ? [{q: rect(70, 120, 50, 50), colour: FLESH}] : [])]); // the hand passes over the card
  const {raws} = track(still, 16), t = buildTrack(raws);
  for (const r of raws) { assert.equal(r.side, 'FRONT'); assert.ok(centre(r.corners!).x < 120, 'never the shoe card'); }
  assert.equal(t.restFrom, 0); assert.deepEqual(t.ranges.FRONT, [[0, 15]]); assert.ok(t.frames[6].note?.includes('covered'), 'a card half under the hand keeps its resting quad');
  const truth = shift(rect(60, 150, 44, 40)); t.restQuad!.forEach((p, k) => assert.ok(dist(p, truth[k]) < 1.5, `corner ${k}`));
});

test('edge-on without colour: a thin line beside a thick hand is found, the hand is not', () => {
  const line = turned(120, 120, 90, 3, -30), palm = rect(165, 70, 60, 60), cls = classify(frame([{q: palm, colour: FLESH}, {q: line, colour: [150, 150, 140]}]), N);
  const found = thinSliver(cls, W, H, turned(120, 120, 60, 10, -30)); assert.ok(found, 'sliver found');
  assert.ok(dist(...found!.segment) > 70 && dist(...found!.segment) < 100); assert.ok(found!.mean < 6);
  assert.equal(thinSliver(classify(frame([{q: palm, colour: FLESH}]), N), W, H, turned(120, 120, 60, 10, -30)), null);
});

test('leaving the shoe: a fit that runs long over the window is held to the length of the card', () => {
  const quad = (dx: number, extra: number): Pt[] => [{x: 100 + dx, y: 50}, {x: 140 + dx, y: 50}, {x: 140 + dx, y: 110 + extra}, {x: 100 + dx, y: 110 + extra}];
  const raw = (dx: number, extra: number, shoeShare: number): Raw => ({side: 'BACK', corners: quad(dx, extra), segment: null, area: 2400, fill: 0.95, thickness: 40, shoeShare, note: ''});
  const t = buildTrack([raw(0, 0, 0.97), raw(0, 0, 0.97), raw(0, 0, 0.96), raw(0, -6, 0.8), raw(0, -12 + 20, 0.6), raw(0, -18 + 25, 0.4), raw(-20, -24, 0), raw(-40, -24, 0)].map((r, k) => k >= 3 ? {...r, corners: r.corners!.map(p => ({x: p.x, y: p.y - 6 * (k - 2)}))} : r));
  const length = (f: number) => dist(t.frames[f].quad![1], t.frames[f].quad![2]);
  assert.ok(length(4) < 63 && length(5) < 63, `long sides stay card length, got ${length(4).toFixed(1)} and ${length(5).toFixed(1)}`); assert.ok(t.frames[4].note?.includes('shortened'));
  assert.ok(Math.abs(t.frames[4].quad![0].y - (50 - 12)) < 3, 'the leading end is left where it was found');
});

// ── The marker rule: what a film can show is known, so findings that contradict it are another object ──
const seen = (side: Raw['side'], q: Pt[] | null, area = 4000): Raw => ({side, corners: q, segment: null, area, fill: 1, thickness: 40, shoeShare: 0, note: ''});
const none: Raw = {side: 'NONE', corners: null, segment: null, area: 0, fill: 0, thickness: 0, shoeShare: 0, note: 'nothing'};

test('a deal turns once: findings on the wrong side of the turn are dropped and the holes are bridged from the frames around them', () => {
  const at = (i: number) => rect(100 + i * 4, 60 + i, 60, 80);
  const raws: Raw[] = Array.from({length: 40}, (_, i) => seen(i < 20 ? 'BACK' : 'FRONT', at(i)));
  raws[8] = seen('FRONT', rect(10, 10, 60, 80));           // a blue card that lay there before, picked for one frame
  raws[27] = seen('BACK', rect(250, 20, 50, 70)); raws[28] = seen('BACK', rect(250, 20, 50, 70)); // the seated yellow card, picked for two
  raws[12] = none; raws[13] = none;                          // lost for two frames in the hand
  raws[33] = {...none, side: 'EDGE', segment: [{x: 5, y: 5}, {x: 60, y: 5}]}; // thin to the eye for a frame, long after the turn
  raws[18] = {...none, side: 'EDGE', segment: [{x: 172, y: 78}, {x: 232, y: 158}]}; // really edge-on, right at the turn: stays as found
  raws[19] = none; raws[20] = none;                          // lost at the turn itself
  const out = settleRaws(raws, 'DEAL');
  assert.deepEqual(out.map(r => r.side[0]).join(''), 'BBBBBBBBBBBBBBBBBBEEEFFFFFFFFFFFFFFFFFFF');
  assert.deepEqual(out[18].segment, raws[18].segment); assert.match(out[33].note, /bridged/);
  // Bridged shapes lie between their neighbours, corner for corner.
  for (const i of [8, 12, 13, 27, 28, 33]) { assert.match(out[i].note, /bridged/); out[i].corners!.forEach((p, c) => assert.ok(dist(p, at(i)[c]) < 1e-6, `frame ${i} corner ${c}`)); }
  // The lost turn is an edge-on card on the line between the two shapes, not a hole.
  for (const i of [19, 20]) { assert.equal(out[i].corners, null); assert.ok(out[i].segment); assert.ok(dist(centre(out[i].segment!), centre(at(i))) < 4); }
  assert.deepEqual(out[5], raws[5]); assert.equal(raws[8].side, 'FRONT', 'the findings themselves are not changed');
  // A hole that is too long stays a hole, and a film the job file does not know is left as found.
  const long = raws.map((r, i) => i >= 2 && i < 19 ? none : r);
  assert.equal(settleRaws(long, 'DEAL').filter(r => r.side === 'NONE').length, 19); // frames 2–20: longer than can be bridged
  assert.deepEqual(settleRaws([seen('FRONT', at(0)), seen('BACK', at(1)), seen('FRONT', at(2))], 'OTHER').map(r => r.side), ['FRONT', 'BACK', 'FRONT']);
});

test('a printed or washed-out face is followed as a pale shape, but only where the card was expected', () => {
  const WHITE = [236, 234, 228], CREAM = [238, 226, 205];
  assert.ok(isPale(236, 234, 228) && isPale(238, 226, 205), 'a printed face and a blouse are both pale');
  assert.ok(!isPale(...(LIT as [number, number, number])) && !isPale(...(FACE as [number, number, number])) && !isPale(...(GREEN as [number, number, number])) && !isPale(...(FLESH as [number, number, number])) && !isPale(...(RIM as [number, number, number])), 'card colours, table, skin and the rim are not');
  const blouse = rect(20, 10, 90, 70), at = (x: number) => rect(x, 150, 58, 36);
  const run = (shapes: Shape[][], withPale = true) => { const step = follower(W, H, null); return shapes.map(s => { const rgb = frame(s); return step(classify(rgb, N), withPale ? paleMask(rgb, N) : null); }); };
  // Back, back, then the same card white for three frames (moving on by its own step), then blue.
  const film: Shape[][] = [[{q: blouse, colour: CREAM}, {q: at(60), colour: LIT}], [{q: blouse, colour: CREAM}, {q: at(70), colour: LIT}], [{q: blouse, colour: CREAM}, {q: at(80), colour: WHITE}],
    [{q: blouse, colour: CREAM}, {q: at(90), colour: WHITE}], [{q: blouse, colour: CREAM}, {q: at(100), colour: WHITE}], [{q: blouse, colour: CREAM}, {q: at(110), colour: FACE}], [{q: blouse, colour: CREAM}, {q: at(120), colour: FACE}]];
  const raws = run(film);
  assert.deepEqual(raws.map(r => r.side), ['BACK', 'BACK', 'FRONT', 'FRONT', 'FRONT', 'FRONT', 'FRONT']);
  assert.match(raws[2].note, /pale face/); assert.ok(nearest(raws[3].corners!, {x: 90, y: 150}) < 2.5, 'the quad is the white card, not the blouse');
  assert.ok(raws.every(r => !r.corners || centre(r.corners).y > 140), 'the blouse is never the card: it is larger than a card and away from where the card was expected');
  // Without the pale mask the same frames show no flat card there, as before: a line at best.
  assert.ok(run(film, false).slice(2, 5).every(r => r.side === 'NONE' || r.side === 'EDGE'));
  // The turn is then at the first pale frame, and nothing needs bridging.
  const settled = settleRaws(raws, 'DEAL');
  assert.deepEqual(settled.map(r => r.side), ['BACK', 'BACK', 'FRONT', 'FRONT', 'FRONT', 'FRONT', 'FRONT']); assert.ok(settled.every(r => !/bridged/.test(r.note)));
  // A finger over the white card: the pale shape is an L, its own quad would be filled poorly, so the expected shape is moved onto it.
  const finger = rect(100, 150, 30, 20), covered = run([[{q: at(60), colour: LIT}], [{q: at(70), colour: LIT}], [{q: at(80), colour: WHITE}, {q: finger, colour: FLESH}, {q: rect(80, 186, 20, 34), colour: WHITE}]]);
  assert.equal(covered[2].side, 'FRONT'); assert.match(covered[2].note, /expected shape moved/);
  const [cw, ch] = [dist(covered[2].corners![0], covered[2].corners![1]), dist(covered[2].corners![1], covered[2].corners![2])]; assert.ok(Math.abs(cw - 58) < 3 && Math.abs(ch - 36) < 3, 'the card keeps the size it had');
  // Once the blue face has been seen, a pale shape at the card's place is no longer taken for the card (a nail, a rim, a highlight on a card under the hand).
  const after = run([[{q: at(60), colour: LIT}], [{q: at(70), colour: FACE}], [{q: at(80), colour: FACE}], [{q: at(90), colour: WHITE}]]);
  assert.deepEqual(after.slice(0, 3).map(r => r.side), ['BACK', 'FRONT', 'FRONT']); assert.ok(!/pale/.test(after[3].note) && after[3].side !== 'FRONT');
  // A pale shape that is thin is the card edge-on, found as any line is; a pale speck (a nail) is nothing.
  const thin = run([[{q: at(60), colour: LIT}], [{q: at(70), colour: LIT}], [{q: rect(80, 165, 58, 5), colour: WHITE}]]);
  assert.equal(thin[2].side, 'EDGE'); assert.ok(thin[2].segment && dist(...thin[2].segment) > 45);
  assert.equal(run([[{q: at(60), colour: LIT}], [{q: at(70), colour: LIT}], [{q: rect(95, 160, 9, 9), colour: WHITE}]])[2].side, 'NONE');
});

test('a card smeared in a fast carry keeps its place and takes its shape from the frames around it', () => {
  // The card moves 30 px a frame. In frames 6-8 only its sharp core is found (a small quad), in frame 11 a corner goes astray.
  const at = (i: number) => rect(40 + i * 30, 60 + i * 3, 60, 90), core = (i: number) => rect(40 + i * 30 + 20, 60 + i * 3 + 30, 20, 30);
  const astray = (i: number): Pt[] => { const q = at(i); return [q[0], q[1], {x: q[2].x + 70, y: q[2].y + 10}, q[3]]; };
  const raws: Raw[] = Array.from({length: 18}, (_, i) => seen('BACK', i >= 6 && i <= 8 ? core(i) : i === 11 ? astray(i) : at(i)));
  const out = settleRaws(raws, 'OTHER');
  for (const i of [6, 7, 8]) { assert.match(out[i].note, /smeared/); assert.ok(dist(centre(out[i].corners!), centre(core(i))) < 1e-6, 'its own place');
    out[i].corners!.forEach((p, c) => assert.ok(dist(p, at(i)[c]) < 1e-6, `frame ${i} corner ${c}: the size of the frames around it`)); }
  assert.match(out[11].note, /smeared/); assert.ok(Math.abs(dist(out[11].corners![1], out[11].corners![2]) - 90) < 1 && Math.abs(dist(out[11].corners![2], out[11].corners![3]) - 60) < 1, 'a lopsided quad becomes a card again');
  assert.ok(dist(centre(out[11].corners!), centre(astray(11))) < 1e-6);
  for (const i of [0, 5, 9, 10, 12, 17]) assert.deepEqual(out[i], raws[i], `frame ${i} is sound and stays as found`);
  // A card at rest is never touched, however its quad looks: a finger over it is handled by the rules for a lying card.
  const still: Raw[] = Array.from({length: 12}, (_, i) => seen('FRONT', i === 5 ? rect(100, 100, 20, 30) : rect(90, 80, 60, 90)));
  assert.deepEqual(settleRaws(still, 'OTHER')[5].corners, still[5].corners);
  // Without sound findings on both sides it stays as it was found.
  const lone: Raw[] = Array.from({length: 8}, (_, i) => seen('BACK', i >= 5 ? core(i) : at(i)));
  assert.deepEqual(settleRaws(lone, 'OTHER').map(r => r.corners), lone.map(r => r.corners));
  assert.deepEqual(SMEAR, {step: 12, reach: 10, small: 0.6, lopsided: 1.8});
});

test('a return shows one side all through, and a card mostly hidden under the hand keeps its last known shape', () => {
  const lie = rect(120, 100, 70, 60), raws: Raw[] = Array.from({length: 12}, () => seen('FRONT', lie, 4200));
  raws[3] = seen('BACK', rect(260, 30, 50, 70)); raws[4] = {...none, side: 'EDGE', segment: [{x: 0, y: 0}, {x: 40, y: 0}]};
  raws[7] = seen('FRONT', rect(120, 100, 30, 60), 1500); raws[8] = seen('FRONT', rect(122, 100, 22, 60), 1100); // the hand covers most of it
  const out = settleRaws(raws, 'RETURN');
  assert.ok(out.every(r => r.side === 'FRONT'));
  for (const i of [3, 4, 7, 8]) out[i].corners!.forEach((p, c) => assert.ok(dist(p, lie[c]) < 1e-6, `frame ${i}`));
  assert.match(out[7].note, /last known shape kept/); assert.match(out[3].note, /bridged/);
  // A card that really moves away is not held back.
  const moved = settleRaws([seen('FRONT', lie, 4200), seen('FRONT', rect(300, 100, 30, 60), 1500)], 'RETURN');
  assert.equal(moved[1].corners![0].x, 300);
});

// A crossed quad lays the card through infinity: the tracker never writes one, and the drawing never draws one (card-overlay.ts poseAt).
test('a crossed, folded or empty quad is unsound; a short run of them is bridged from its neighbours, a long one loses its quad', async () => {
  const {sound, soundFrames, SOUND} = await import('../src/card-track.ts');
  const {poseAt} = await import('../src/card-overlay.ts');
  const card = (x: number): Pt[] => [{x, y: 100}, {x: x + 60, y: 100}, {x: x + 60, y: 180}, {x, y: 180}];
  const crossed = (x: number): Pt[] => [{x, y: 100}, {x: x + 60, y: 100}, {x, y: 180}, {x: x + 60, y: 180}];
  assert.equal(sound(card(0)), true); assert.equal(sound(crossed(0)), false); assert.equal(sound([{x: 0, y: 0}, {x: 10, y: 0}, {x: 20, y: 0}, {x: 30, y: 0}]), false);
  assert.equal(sound([{x: 1123, y: 688}, {x: 1135, y: 700}, {x: 1108, y: 712}, {x: 1095, y: 712}]), true, 'a thin card seen nearly edge-on is still a card');
  const frame = (i: number, q: Pt[]) => ({frame: i, side: 'BACK' as const, quad: q, edge: null, area: Math.abs(signedArea(q)), confidence: 0.6});
  const short = Array.from({length: 12}, (_, i) => frame(i, i >= 4 && i <= 7 ? crossed(i * 10) : card(i * 10)));
  assert.deepEqual(soundFrames(short), {bridged: [4, 5, 6, 7], dropped: []});
  for (const f of short) assert.ok(sound(f.quad), `frame ${f.frame} sound`);
  assert.ok(Math.abs(short[5].quad![0].x - 50) < 1e-9, 'bridged corner by corner between frames 3 and 8');
  const long = Array.from({length: 20}, (_, i) => frame(i, i >= 4 && i < 4 + SOUND.bridge + 1 ? crossed(i * 10) : card(i * 10)));
  assert.equal(soundFrames(long).dropped.length, SOUND.bridge + 1); assert.equal(long[5].quad, null);
  const huge = Array.from({length: 20}, (_, i) => frame(i, i === 9 ? [{x: 0, y: 0}, {x: 300, y: 0}, {x: 300, y: 300}, {x: 0, y: 300}] : card(i * 10)));
  assert.deepEqual(soundFrames(huge), {bridged: [9], dropped: []}, 'a quad far larger than the frames around it is two things taken for one');
  // the drawing: a crossed quad in a track gives no card in that frame, the frames around it give theirs
  const track = {width: 1764, height: 1174, edgeWindow: null, restFrom: null, restQuad: null, frames: [0, 1, 2].map(i => ({frame: i, side: 'BACK' as const, quad: (i === 1 ? crossed(100) : card(100)).map(p => [p.x, p.y]), edge: null}))};
  assert.equal(poseAt(track, null, 1, 1.2)?.quad, null); assert.ok(poseAt(track, null, 0, 1.2)?.quad); assert.ok(poseAt(track, null, 2, 1.2)?.quad);
  const big = {...track, frames: [{frame: 0, side: 'BACK' as const, quad: [[0, 0], [400, 0], [400, 400], [0, 400]], edge: null}]};
  assert.equal(poseAt(big, null, 0, 1.2)?.quad, null, 'larger than any card a film holds');
});

test('a track marked not good enough in the hand (hand: false) draws no card while it is carried, and the card once it lies', async () => {
  const {poseAt} = await import('../src/card-overlay.ts');
  const q = (x: number) => [[x, 100], [x + 60, 100], [x + 60, 180], [x, 180]];
  const frames = Array.from({length: 10}, (_, i) => ({frame: i, side: 'FRONT' as const, quad: q(i < 6 ? i * 20 : 120), edge: null}));
  const track = {width: 1764, height: 1174, hand: false, edgeWindow: null, restFrom: 6, restQuad: q(120), frames};
  for (const i of [0, 3, 5]) assert.equal(poseAt(track, null, i, 1.2)?.quad, null, `frame ${i} in the hand`);
  for (const i of [6, 9]) assert.ok(poseAt(track, null, i, 1.2)?.quad, `frame ${i} lying`);
  assert.ok(poseAt({...track, hand: undefined}, null, 3, 1.2)?.quad, 'without the mark the card is drawn in the hand as before');
});
