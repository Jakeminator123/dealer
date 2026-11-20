// The test "one deal, two chairs" (Beslut 3d-prov-en-giv-tva-stolar, 2026-11-20): lays one motion source into the 3D room
// and writes what the test's page plays (dealer3d/page/prov.ts): the card frame by frame, where the figure stands, the beats.
//   node dealer3d/tools/prov-lay.ts --source sam    SAM 3D Body's reading of a film (dealer3d/tools/prov-sam.py) and the film's card track
//   node dealer3d/tools/prov-lay.ts --source pack   the bought clip (Card Games Animation Pack) on the pack's own mannequin
//        [--work .runtime/3d-prov] [--film paow-giv-2-3-p4-h24-cykel-02-01] [--start 10.4] [--table]
// No graphics card and no browser: it reads, measures and writes <work>/scene/<source>.json. The pack's files and SAM's
// output stay in <work>, outside Git (the pack has no licence text: local use only).
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import * as T from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {CARD, add, dot, filmEye, mul, see, sub, unit, type Vec3} from '../src/camera.ts';
import {dealerEdge, filmLens, shoeCard, shoePose, spots} from '../src/world.ts';
import {alongLike, between, cardInHand, cardsFromTrack, inShoe, lyingAt, offCard, overFelt, type CardTrack} from '../src/prov-card.ts';
import type {CardPose} from '../src/deal.ts';

const arg = (name: string, fallback?: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const source = arg('--source'), work = arg('--work', '.runtime/3d-prov')!, FPS = 24, FRAMES = 97;
if (source !== 'sam' && source !== 'pack') throw Error('usage: prov-lay.ts --source sam|pack');
const lens = filmLens(), eye = filmEye(lens), edge = dealerEdge(lens), plan = JSON.parse(readFileSync('placements/default.json', 'utf8')), seat4 = spots(plan, lens).find(s => s.id === 'P4.C1')!.at, shoe = shoeCard(shoePose(lens));
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const median = (v: number[]) => [...v].sort((a, b) => a - b)[v.length >> 1], r = (v: number[], d = 5) => v.map(x => +x.toFixed(d)), mm = (x: number) => `${(x * 1000).toFixed(0)} mm`;
const smooth = (t: number) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
// The page draws a figure of its own; the stage's white doll is hidden but still solved, so each frame carries a plain arm for it.
const limb = (s: Vec3, e: Vec3, w: Vec3) => ({s: r(s), e: r(e), w: r(w), k: 0, p: Array.from({length: 21}, (_, j) => r([w[0] + j * 0.002, w[1], w[2] + (j % 4) * 0.002]))});
const cardOut = (c: CardPose) => ({c: r(c.centre), l: r(c.long), n: r(c.normal)});

function laySam() {
  const dir = path.join(work, 'sam/read'), sam = JSON.parse(readFileSync(path.join(dir, 'sam.json'), 'utf8')), film = arg('--film', path.basename(path.dirname(sam.film)))!, bytes = readFileSync(path.join(dir, 'verts.f32'));
  const verts = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)), V: number = sam.vertices, n: number = sam.frames.length, step: number = sam.frames[1] - sam.frames[0], N: string[] = sam.names;
  if (sam.frameCount !== FRAMES || sam.fps !== FPS || verts.length !== n * V * 3) throw Error('The reading is not the film this test is laid out for.');
  // SAM's frame is the film camera's: x to the right, y down, z into the picture, metres. The room: the camera 1.11 m over the felt, looking 25 degrees down.
  const f = eye.forward, up: Vec3 = [0, -f[2], f[1]], h = eye.position[1];
  const world = (p: ArrayLike<number>, s: number, o = 0): Vec3 => [s * p[o], h + s * (-p[o + 1] * up[1] + p[o + 2] * f[1]), s * (-p[o + 1] * up[2] + p[o + 2] * f[2])];
  // How large and how far: one picture cannot say, and the felt can. Enlarging the figure about the camera leaves the film's
  // picture as it is, so each frame has one scale at which the lowest point of her hands just touches the felt (`contact`).
  // Where she rests her hands on the table that is her true scale (`rest`); a frame that would push a hand through the felt
  // at that scale is drawn at its own contact scale instead, eased over the neighbouring frames.
  // Her hands' skin: every point of the body within 4 cm of a joint of a hand (SAM's joints 21-62: both hands, wrists included).
  const HAND_JOINTS = Array.from({length: 42}, (_, j) => 21 + j), handSkin: number[][] = sam.frames.map((_: number, i: number) => { const own: number[] = [], P: number[][] = sam.joints[i];
    for (let v = 0, o = i * V * 3; v < V; v++, o += 3) if (HAND_JOINTS.some(j => (verts[o] - P[j][0]) ** 2 + (verts[o + 1] - P[j][1]) ** 2 + (verts[o + 2] - P[j][2]) ** 2 < 0.04 ** 2)) own.push(o); return own; });
  const contact: number[] = handSkin.map(own => Math.min(...own.map(o => h / (verts[o + 1] * up[1] - verts[o + 2] * f[1])))), rest = median(contact.filter((_, i) => sam.frames[i] <= 8 || sam.frames[i] >= 86));
  const held = contact.map(c => Math.min(rest, c)), low = held.map((_, i) => Math.min(...held.slice(Math.max(0, i - 1), i + 2))), scale = low.map((_, i) => { let total = 0, sum = 0; for (let j = Math.max(0, i - 3); j <= Math.min(n - 1, i + 3); j++) { const k = Math.exp(-((j - i) ** 2) / 2); total += k; sum += low[j] * k; } return sum / total; });
  const lowest = handSkin.map((own, i) => Math.min(...own.map(o => world(verts, scale[i], o)[1])));
  const joints = (fr: number): Vec3[] => { const at = Math.min(n - 1, fr / step), i = Math.min(n - 2, Math.floor(at)), t = at - i; return sam.joints[i].map((p: number[], k: number) => lerp(world(p, scale[i]), world(sam.joints[i + 1][k], scale[i + 1]), t)); };
  const J = Array.from({length: FRAMES}, (_, fr) => joints(fr)), k = (name: string) => { const i = N.indexOf(name); if (i < 0) throw Error(`SAM has no joint ${name}.`); return i; };

  // Which hand holds the card: the one whose thumb, forefinger or middle finger ends nearest the middle of the film's card.
  const track: CardTrack = JSON.parse(readFileSync(`assets/tracking/${film}/card-track.json`, 'utf8')), leaves = track.leavesShoe ?? 0, rests = track.restFrom ?? FRAMES - 1;
  const ends = {L: ['left-thumb-tip', 'left-index-tip', 'left-middle-tip'].map(k), R: ['right-thumb-tip', 'right-index-tip', 'right-middle-tip'].map(k)};
  const nearest = (fr: number, side: 'L' | 'R') => { const q = track.frames[fr]?.quad; if (q?.length !== 4) return null; const c = [0, 1].map(a => (q[0][a] + q[1][a] + q[2][a] + q[3][a]) / 4); return Math.min(...ends[side].map(j => { const p = see(eye, J[fr][j])!; return Math.hypot(p.x - c[0], p.y - c[1]); })); };
  let handOver = rests; for (let fr = rests - 1; fr >= leaves; fr--) { const a = nearest(fr, 'L'), b = nearest(fr, 'R'); if (a === null || b === null) continue; if (b < a) handOver = fr; else break; } // the right hand's from here to where the card lies
  const gripOf = (fr: number, side: 'L' | 'R') => lerp(J[fr][ends[side][0]], J[fr][ends[side][1]], 0.5);
  const grips = J.map((_, fr) => fr < handOver - 1 ? gripOf(fr, 'L') : fr > handOver + 1 ? gripOf(fr, 'R') : lerp(gripOf(fr, 'L'), gripOf(fr, 'R'), (fr - handOver + 1) / 2));
  const laid = cardsFromTrack(lens, track, grips, shoe);
  // When the right hand lets go: the first frame after the card lies where none of its finger ends is within a card's length of the card's middle.
  let lets = FRAMES - 1; for (let fr = rests; fr < FRAMES; fr++) if (Math.min(...ends.R.map(j => dist(J[fr][j], laid.cards[fr].centre))) > CARD.height) { lets = fr; break; }

  const hip = lerp(J[0][k('left-hip')], J[0][k('right-hip')], 0.5);
  const read = {film: `SAM 3D Body: ${film}`, fps: FPS, frameCount: FRAMES, leavesShoe: laid.leaves, edge: laid.edge, folds: laid.folds, rests: laid.rests, hip: r(hip),
    frames: J.map((p, fr) => ({card: cardOut(laid.cards[fr]), L: limb(p[k('left-shoulder')], p[k('left-elbow')], p[k('left-wrist')]), R: limb(p[k('right-shoulder')], p[k('right-elbow')], p[k('right-wrist')]), h: r(p[k('nose')])}))};
  // Measures. How far the fingers that hold the card are from the card (the card follows the film's picture, the fingers SAM's depth): 0 on the card itself.
  const carried = Array.from({length: laid.folds - laid.leaves - 4}, (_, i) => laid.leaves + 5 + i), off = carried.map(fr => offCard(laid.cards[fr], grips[fr]));
  const pushing = Array.from({length: rests - laid.folds}, (_, i) => laid.folds + i), tipOnCard = pushing.map(fr => dist(J[fr][k('right-index-tip')], laid.cards[fr].centre));
  const measures = {film, framesRead: n, everyNth: step, vertices: V, triangles: sam.triangles, secondsPerFrame: +(sam.secondsPerFrame.reduce((a: number, b: number) => a + b, 0) / n).toFixed(2), reprojectionMaxPx: sam.reprojectionMaxPx,
    scaleAtRest: +rest.toFixed(4), scaleLeast: +Math.min(...scale).toFixed(4), scaleLeastAtFrame: sam.frames[scale.indexOf(Math.min(...scale))], lowestOverTableMm: {least: +(Math.min(...lowest) * 1000).toFixed(1), most: +(Math.max(...lowest) * 1000).toFixed(1)},
    cardFramesSeen: laid.seen, turn: laid.turn && {...laid.turn, degrees: +laid.turn.degrees.toFixed(0)}, fingersOffCardWhileCarriedMm: {median: +(median(off) * 1000).toFixed(0), most: +(Math.max(...off) * 1000).toFixed(0)},
    forefingerFromCardMiddleWhileLayingMm: {median: +(median(tipOnCard) * 1000).toFixed(0)}, liesFromSeat4Mm: +(dist([laid.place[0], 0, laid.place[2]], seat4) * 1000).toFixed(1), neckDepthSpreadMm: +((Math.max(...sam.joints.map((p: number[][]) => p[k('neck')][2])) - Math.min(...sam.joints.map((p: number[][]) => p[k('neck')][2]))) * 1000).toFixed(0)};
  if (process.argv.includes('--table')) { console.log('read frame: contact scale, used scale, lowest point over the table'); sam.frames.forEach((fr: number, i: number) => console.log(String(fr).padStart(3), contact[i].toFixed(4), scale[i].toFixed(4), mm(lowest[i])));
    for (let fr = leaves - 2; fr <= Math.min(FRAMES - 1, rests + 8); fr += 2) console.log(String(fr).padStart(3), track.frames[fr].side.padEnd(5), 'card', r(laid.cards[fr].centre, 3).join(','), 'face looks', r(laid.cards[fr].normal, 2).join(','), '| L', nearest(fr, 'L')?.toFixed(0), 'R', nearest(fr, 'R')?.toFixed(0), 'px | grip', r(grips[fr], 3).join(',')); }
  return {source, label: 'SAM 3D Body', fps: FPS, frameCount: FRAMES, read, beats: {leavesShoe: laid.leaves, handOver, turn: laid.turn ? [laid.turn.from, laid.turn.to] : null, lies: laid.rests, letsGo: lets},
    figure: {kind: 'sam', verts: '/prov/sam/read/verts.f32', faces: '/prov/sam/read/faces.u32', vertices: V, readFrames: sam.frames, scale: r(scale, 5), eyeHeight: h, forward: f, up}, measures};
}

function layPack() {
  (globalThis as {window?: unknown}).window ??= globalThis; (globalThis as {self?: unknown}).self ??= globalThis; // three's FBX reader asks for them
  const load = (file: string) => { const b = readFileSync(path.join(work, 'pack', file)); return new FBXLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, ''); };
  const characterFile = 'MightyCat_Queen.fbx', clipFile = 'AS_Blackjack_Dealer_DealCard.FBX', who = load(characterFile), clip = load(clipFile).animations[0], start = Number(arg('--start', '10.4'));
  if (start + (FRAMES - 1) / FPS > clip.duration) throw Error(`The clip is ${clip.duration.toFixed(2)} s: no room for ${FRAMES} frames from ${start} s.`);
  const mixer = new T.AnimationMixer(who); mixer.clipAction(clip).play();
  const skins: T.SkinnedMesh[] = []; who.traverse(o => { if ((o as T.SkinnedMesh).isSkinnedMesh) skins.push(o as T.SkinnedMesh); });
  const at = (fr: number) => { mixer.setTime(start + fr / FPS); who.updateMatrixWorld(true); }, v = new T.Vector3();
  // The pack's own frame: centimetres, z up, she faces -y, her left hand toward +x. Until the table's height is known: metres, y up, facing +z.
  let tableCm = 0; const pre = (p: T.Vector3): Vec3 => [p.x * 0.01, (p.z - tableCm) * 0.01, -p.y * 0.01], bone = (name: string): Vec3 => { const o = who.getObjectByName(name); if (!o) throw Error(`The mannequin has no bone ${name}.`); return pre(o.getWorldPosition(v)); };
  // The skin of the hands, to find the table (the lowest point of the resting hands) and how far a finger reaches beyond its last joint.
  const handSkin: {mesh: T.SkinnedMesh; index: number; bone: string}[] = [];
  for (const mesh of skins) { const si = mesh.geometry.getAttribute('skinIndex'), sw = mesh.geometry.getAttribute('skinWeight');
    for (let i = 0; i < si.count; i++) { let best = 0; for (let c = 1; c < 4; c++) if (sw.getComponent(i, c) > sw.getComponent(i, best)) best = c; const name = mesh.skeleton.bones[si.getComponent(i, best)].name; if (/^(hand|thumb|index|middle|ring|pinky)_/.test(name)) handSkin.push({mesh, index: i, bone: name}); } }
  const skinAt = (s: {mesh: T.SkinnedMesh; index: number}): Vec3 => pre(s.mesh.getVertexPosition(s.index, v).applyMatrix4(s.mesh.matrixWorld));
  at(0); const restLow = Math.min(...handSkin.map(s => skinAt(s)[1])); tableCm = restLow * 100; // from here on `pre` has the felt at y = 0
  const beyond = (last: string, before: string) => { const a = bone(last), d = unit(sub(a, bone(before))); return Math.max(...handSkin.filter(s => s.bone === last).map(s => dot(sub(skinAt(s), a), d))); };
  const reach = Object.fromEntries(['thumb_03_l', 'thumb_03_r', 'index_03_l', 'index_03_r'].map(b => [b, beyond(b, b.replace('03', '02'))]));
  const pad = (side: 'l' | 'r', finger: 'thumb' | 'index'): Vec3 => { const last = `${finger}_03_${side}`, a = bone(last); return add(a, mul(unit(sub(a, bone(`${finger}_02_${side}`))), Math.max(0, reach[last] - 0.008))); }; // the middle of the finger's pad, 8 mm in from its end
  const hold = (side: 'l' | 'r') => cardInHand({wrist: bone(`hand_${side}`), forefinger: bone(`index_01_${side}`), littleFinger: bone(`pinky_01_${side}`), middle: bone(`middle_01_${side}`), thumbEnd: pad(side, 'thumb'), forefingerEnd: pad(side, 'index')}, side === 'l');
  const frames = Array.from({length: FRAMES}, (_, fr) => { at(fr); return {L: hold('l'), R: hold('r'), low: Math.min(...handSkin.map(s => skinAt(s)[1])), pelvis: bone('pelvis'), head: bone('head'),
    arms: {L: [bone('upperarm_l'), bone('lowerarm_l'), bone('hand_l')], R: [bone('upperarm_r'), bone('lowerarm_r'), bone('hand_r')]}}; });
  // The beats, read off the motion. The left hand takes the card where it is farthest out to her left; the hands meet where
  // the two grips are nearest each other; the right hand lets go where its grip is farthest out toward the players.
  const level = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]), most = (from: number, to: number, value: (fr: number) => number) => { let best = from; for (let fr = from; fr <= to; fr++) if (value(fr) > value(best)) best = fr; return best; };
  const letsGo = most(0, FRAMES - 1, fr => frames[fr].R.grip[2]), takes = most(0, letsGo, fr => frames[fr].L.grip[0]), handOver = most(takes, letsGo, fr => -dist(frames[fr].L.grip, frames[fr].R.grip));
  // The card in her hands: with the left hand from where it takes it, passed to the right over three frames, with the right hand,
  // and from the frame it is let go it falls as a thrown thing does (the hand's own speed, gravity) and lies flat.
  const waiting = frames[takes].L, cards: CardPose[] = [];
  for (let fr = 0; fr <= letsGo; fr++) { const before = cards[fr - 1]?.long ?? waiting.long, left = alongLike(frames[Math.max(fr, takes)].L, before), right = alongLike(frames[fr].R, before);
    cards.push(fr < handOver - 1 ? left : fr > handOver + 1 ? right : between(left, right, (fr - handOver + 1) / 2)); }
  const let0 = cards[letsGo], speed = mul(sub(let0.centre, cards[letsGo - 1].centre), FPS), G = 9.81, low0 = CARD.thickness / 2, fall = (speed[1] + Math.sqrt(speed[1] ** 2 + 2 * G * Math.max(0, let0.centre[1] - low0))) / G;
  const lands: Vec3 = [let0.centre[0] + speed[0] * fall, low0, let0.centre[2] + speed[2] * fall], lying = lyingAt(lands, let0.long, let0.normal[1] > 0), liesFrom = letsGo + Math.ceil(fall * FPS);
  for (let fr = letsGo + 1; fr < FRAMES; fr++) { const t = (fr - letsGo) / FPS; cards.push(t >= fall ? lying : overFelt({...between(let0, lying, smooth(t / fall)), centre: [let0.centre[0] + speed[0] * t, let0.centre[1] + speed[1] * t - G * t * t / 2, let0.centre[2] + speed[2] * t]})); }
  // Where she sits: the card lands on seat 4's place, and she is turned about that point so that the card she takes waits as near the shoe's card as her reach allows.
  const turnedBy = (p: Vec3, yaw: number): Vec3 => [p[0] * Math.cos(yaw) + p[2] * Math.sin(yaw), p[1], -p[0] * Math.sin(yaw) + p[2] * Math.cos(yaw)], placed = (p: Vec3, yaw: number): Vec3 => add(turnedBy(sub(p, [lands[0], 0, lands[2]]), yaw), [seat4[0], 0, seat4[2]]);
  let yaw = 0; for (let d = -30; d <= 30; d += 0.05) if (level(placed(waiting.centre, d * Math.PI / 180), shoe.centre) < level(placed(waiting.centre, yaw), shoe.centre)) yaw = d * Math.PI / 180;
  const W = (p: Vec3) => placed(p, yaw), D = (p: Vec3) => turnedBy(p, yaw), out = (c: CardPose): CardPose => ({centre: W(c.centre), long: D(c.long), normal: D(c.normal), across: D(c.across)});
  // The same placing as one matrix for the page: pack centimetres (z up) to the room's metres.
  const matrix = new T.Matrix4().makeTranslation(seat4[0], 0, seat4[2]).multiply(new T.Matrix4().makeRotationY(yaw)).multiply(new T.Matrix4().makeTranslation(-lands[0], -tableCm * 0.01, -lands[2])).multiply(new T.Matrix4().makeScale(0.01, 0.01, 0.01)).multiply(new T.Matrix4().makeRotationX(-Math.PI / 2));
  at(0); const check = who.getObjectByName('hand_r')!.getWorldPosition(new T.Vector3()).applyMatrix4(matrix), same = dist([check.x, check.y, check.z], W(frames[0].arms.R[2])); if (same > 1e-6) throw Error(`The matrix and the placing disagree by ${same} m.`);
  // Before she takes it the card stands in this table's shoe, and it comes to her fingers over the three frames before the take:
  // her reach is the pack's own table's, and ends beside this shoe's card, not on it (measured below).
  const standing = inShoe(shoe), shown = cards.map((c, fr) => fr >= takes ? out(c) : between(standing, alongLike(out(c), standing.long), smooth((fr - takes + 3) / 3)));
  const read = {film: 'Card Games Animation Pack: AS_Blackjack_Dealer_DealCard', fps: FPS, frameCount: FRAMES, leavesShoe: takes, edge: [letsGo, letsGo], folds: letsGo, rests: liesFrom, hip: r(W(frames[0].pelvis)),
    frames: frames.map((m, fr) => ({card: cardOut(shown[fr]), L: limb(W(m.arms.L[0]), W(m.arms.L[1]), W(m.arms.L[2])), R: limb(W(m.arms.R[0]), W(m.arms.R[1]), W(m.arms.R[2])), h: r(W(m.head))}))};
  const carrying = frames.slice(handOver, letsGo + 1), palmDown = carrying.map(m => Math.acos(Math.max(-1, Math.min(1, -m.R.palm[1]))) * 180 / Math.PI), triangles = skins.reduce((s, m) => s + (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3, 0);
  const measures = {clip: clipFile, character: characterFile, clipSeconds: +clip.duration.toFixed(2), startSeconds: start, bones: new Set(clip.tracks.map(t => t.name.split('.')[0])).size, meshes: skins.length, triangles, tableInPackCm: +tableCm.toFixed(1), yawDegrees: +(yaw * 180 / Math.PI).toFixed(2),
    takesBesideShoeCardMm: +(level(W(waiting.centre), shoe.centre) * 1000).toFixed(0), takesAt: r(W(waiting.centre), 3), shoeCardAt: r(shoe.centre, 3), pelvisAt: r(W(frames[0].pelvis), 3), headAt: r(W(frames[0].head), 3),
    rightPalmFromStraightDownDegrees: {least: +Math.min(...palmDown).toFixed(0), most: +Math.max(...palmDown).toFixed(0)}, faceUpWhenItLies: let0.normal[1] > 0,
    palmsApartAtHandOverDegrees: +(Math.acos(Math.max(-1, Math.min(1, dot(frames[handOver].L.normal, frames[handOver].R.normal)))) * 180 / Math.PI).toFixed(0), // under 90: the card keeps its side through the hand-over
    letsGoMmOverFelt: +(let0.centre[1] * 1000).toFixed(0), speedAtLetGoMetresPerSecond: +Math.hypot(...speed).toFixed(2), fallSeconds: +fall.toFixed(3), carriedInFallMm: +(level(lands, let0.centre) * 1000).toFixed(0),
    pinchMm: {leftAtTake: +(frames[takes].L.pinch * 1000).toFixed(0), rightAtHandOver: +(frames[handOver].R.pinch * 1000).toFixed(0), rightAtLetGo: +(frames[letsGo].R.pinch * 1000).toFixed(0), rightThreeFramesAfter: +(frames[Math.min(FRAMES - 1, letsGo + 3)].R.pinch * 1000).toFixed(0)},
    thumbOffCardMm: {leftWhileItHolds: +(median(frames.slice(takes, handOver).map(m => m.L.thumbGap)) * 1000).toFixed(0), rightWhileItHolds: +(median(carrying.map(m => m.R.thumbGap)) * 1000).toFixed(0)},
    handsLowestOverFeltMm: {least: +(Math.min(...frames.map(m => m.low)) * 1000).toFixed(1), atRest: 0}, gripsApartAtHandOverMm: +(dist(frames[handOver].L.grip, frames[handOver].R.grip) * 1000).toFixed(0),
    stillAtStartMmPerFrame: +(dist(frames[1].arms.L[2], frames[0].arms.L[2]) * 1000).toFixed(1), stillAtEndMmPerFrame: +(dist(frames[FRAMES - 1].arms.R[2], frames[FRAMES - 2].arms.R[2]) * 1000).toFixed(1), fingerBeyondLastJointMm: Object.fromEntries(Object.entries(reach).map(([b, x]) => [b, +(x * 1000).toFixed(0)]))};
  if (process.argv.includes('--table')) for (let fr = 0; fr < FRAMES; fr += 2) { const m = frames[fr]; console.log(String(fr).padStart(3), (start + fr / FPS).toFixed(2), 'L grip', r(W(m.L.grip), 3).join(','), 'pinch', mm(m.L.pinch), 'palm y', m.L.palm[1].toFixed(2), '| R grip', r(W(m.R.grip), 3).join(','), 'pinch', mm(m.R.pinch), 'palm y', m.R.palm[1].toFixed(2), '| grips apart', mm(dist(m.L.grip, m.R.grip)), '| card', r(shown[fr].centre, 3).join(','), 'thumb off card L', mm(m.L.thumbGap), 'R', mm(m.R.thumbGap), 'hands low', mm(m.low)); }
  return {source, label: 'Köpta klippet', fps: FPS, frameCount: FRAMES, read, beats: {takes, handOver, letsGo, lies: liesFrom},
    figure: {kind: 'pack', character: `/prov/pack/${characterFile}`, clip: `/prov/pack/${clipFile}`, start, matrix: matrix.toArray()}, measures};
}

const scene = source === 'sam' ? laySam() : layPack(), out = path.join(work, 'scene');
mkdirSync(out, {recursive: true}); writeFileSync(path.join(out, `${source}.json`), JSON.stringify(scene) + '\n');
console.log(JSON.stringify({beats: scene.beats, measures: scene.measures}, null, 1));
console.log(`wrote ${path.join(out, `${source}.json`)}`);
