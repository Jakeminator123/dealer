// Measures a dealer's body in the bank's frame against the doll's: SAM 3D Body's reading of her anchor pictures
// (dealer3d/tools/docka-sam.py) laid into the 3D scene's metres, and her outline on the green, beside the same measures of a
// doll of dealer3d/src/doll.ts. What it prints is what the doll "paow" in doll.ts is written from.
//   node dealer3d/tools/docka-mat.ts --sam <folder of docka-sam.py> [--doll standard] [--behind-edge <metres>] [--out <file.json>]
// SAM reads her at its own idea of her size and distance. The reading is scaled about the camera until her shoulder joints
// stand on an upright plane behind the table edge: the picture stays the same to the pixel, and every length is then in
// the scene's metres (the factor is printed; near 1 means SAM and the scene agree). Which plane: --behind-edge, else the
// doll's own (a doll placed by joints), else the 0.18 m the standard doll has always stood at (world.ts ASSUMED).
// Where she really is, her hands say: `handsOnFelt` is how far behind the edge her shoulders are when the reading is as big
// and as far away as it must be for a hand's lowest finger joint to lie a finger's half thickness (8 mm) over the felt. It
// holds for a hand that does lie on the felt (both in her rest anchor); read it there and measure with that --behind-edge.
// (Paow, 2026-11-23: 0.37 to 0.39 m from four touches on anchors 1 and 2.3, not 0.18; at 0.18 every length came out 9 % short.)
import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {add, dot, filmEye, length, mul, onUpright, see, sub, unit, type Pixel, type Vec3} from '../src/camera.ts';
import {ASSUMED, dealerEdge, filmLens} from '../src/world.ts';
import {DOLLS, dollFrame, type Doll} from '../src/doll.ts';

const arg = (name: string, fallback?: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const folder = arg('--sam'); if (!folder) throw Error('usage: docka-mat.ts --sam <folder> [--doll standard] [--out file.json]');
const sam = JSON.parse(readFileSync(path.join(folder, 'sam.json'), 'utf8')), lens = filmLens(), eye = filmEye(lens);
const doll: Doll = DOLLS[arg('--doll', 'standard')!], plane = dealerEdge(lens)[2] - Number(arg('--behind-edge', String(doll.place.kind === 'joints' ? doll.place.behindEdge : ASSUMED.shouldersBehindEdge)));
const f: Vec3 = unit(eye.forward), r: Vec3 = [1, 0, 0], u: Vec3 = [0, -f[2], f[1]]; // the camera's in, right and up in the world (filmEye: right is +x)
const toWorld = (p: number[]): Vec3 => add(eye.position, add(add(mul(r, p[0]), mul(u, -p[1])), mul(f, p[2])));
const J = (name: string) => sam.jointNames.indexOf(name), K = (name: string) => sam.keypointNames.indexOf(name);
const mm = (n: number) => Math.round(n * 1000), deg = (n: number) => Math.round(n * 1800 / Math.PI) / 10, px = (p: Pixel | null) => p ? [Math.round(p.x), Math.round(p.y)] : null;
const mid = (a: Vec3, b: Vec3): Vec3 => mul(add(a, b), 0.5);

/** One picture's reading, scaled onto the scene's shoulder plane. */
function reading(i: number) {
  const pic = sam.pictures[i], raw = (pic.joints as number[][]).map(toWorld), rawKp = (pic.keypoints as number[][]).map(toWorld);
  const shoulders = mid(raw[J('r_uparm')], raw[J('l_uparm')]), s = (plane - eye.position[2]) / (shoulders[2] - eye.position[2]);
  const scaled = (p: Vec3): Vec3 => add(eye.position, mul(sub(p, eye.position), s));
  const bytes = readFileSync(path.join(folder, `${path.basename(path.dirname(pic.picture))}-${path.basename(pic.picture, '.png')}.verts.f32`));
  const raw32 = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4), verts: Vec3[] = [];
  for (let k = 0; k < raw32.length; k += 3) verts.push(scaled(toWorld([raw32[k], raw32[k + 1], raw32[k + 2]])));
  // Where her shoulders would be if a hand lay on the felt: the factor that brings the hand's lowest finger joint to 8 mm over it.
  const onFelt = (side: 'right' | 'left') => { const first = K(`${side}-thumb-tip`), low = Math.min(...rawKp.slice(first, first + 20).map(p => p[1])), k = (eye.position[1] - 0.008) / (eye.position[1] - low);
    return {factor: Math.round(k * 1000) / 1000, behindEdgeMm: mm(dealerEdge(lens)[2] - (eye.position[2] + (shoulders[2] - eye.position[2]) * k))}; };
  return {pic, s, joint: (n: string) => scaled(raw[J(n)]), key: (n: string) => scaled(rawKp[K(n)]), verts, handsOnFelt: {right: onFelt('right'), left: onFelt('left')}};
}

/** Her measures from one reading: bones, shoulders, neck, head and the lean of her trunk. */
function hers(i: number) {
  const R = reading(i), j = R.joint, k = R.key;
  const sR = j('r_uparm'), sL = j('l_uparm'), eR = j('r_lowarm'), eL = j('l_lowarm'), wR = j('r_wrist'), wL = j('l_wrist'), root = j('root'), hipR = j('r_upleg'), hipL = j('l_upleg');
  const neck = j('c_neck'), head = j('c_head'), shoulderMid = mid(sR, sL), hipMid = mid(hipR, hipL);
  const up = unit(sub(neck, mid(j('c_spine0'), root))), across = unit(sub(sL, sR)), fwd = unit([up[1] * across[2] - up[2] * across[1], up[2] * across[0] - up[0] * across[2], up[0] * across[1] - up[1] * across[0]]);
  // The head's surface: the vertices near the head joint. Heights are plumb (world up); the crown is the highest of them, the
  // chin the lowest of those under the nose and no more than 3.5 cm behind its tip (the throat lies farther back).
  const along = (p: Vec3) => dot(sub(p, neck), up), ahead = (p: Vec3) => dot(sub(p, neck), fwd), side = (p: Vec3) => dot(sub(p, neck), across), high = (p: Vec3) => p[1];
  const skull = R.verts.filter(p => length(sub(p, head)) < 0.25 && high(p) > neck[1]), nose = k('nose');
  const crown = skull.reduce((a, b) => high(b) > high(a) ? b : a), front = skull.filter(p => ahead(p) > ahead(nose) - 0.035 && Math.abs(side(p) - side(nose)) < 0.02 && high(p) < high(nose) && high(p) > high(nose) - 0.1), chin = front.reduce((a, b) => high(b) < high(a) ? b : a);
  const eyes = mid(j('r_eye'), j('l_eye')), band = skull.filter(p => Math.abs(high(p) - high(eyes)) < 0.015), wide = Math.max(...band.map(side)) - Math.min(...band.map(side)), deep = Math.max(...band.map(ahead)) - Math.min(...band.map(ahead));
  // The neck: the surface 3 to 6 cm over the neck joint and within 8 cm of the line from it to the head joint, its mean distance from that line.
  const neckLine = unit(sub(head, neck)), offLine = (p: Vec3) => { const d = sub(p, neck); return length(sub(d, mul(neckLine, dot(d, neckLine)))); };
  const ring = R.verts.filter(p => dot(sub(p, neck), neckLine) > 0.03 && dot(sub(p, neck), neckLine) < 0.06 && offLine(p) < 0.08), neckRadius = ring.reduce((n, p) => n + offLine(p), 0) / ring.length;
  // The trunk's breadth and depth at heights between hip and shoulders: the surface farther than 7 cm from both upper arms' bones.
  const offSegment = (p: Vec3, a: Vec3, b: Vec3) => { const d = sub(b, a), t = Math.max(0, Math.min(1, dot(sub(p, a), d) / dot(d, d))); return length(sub(p, add(a, mul(d, t)))); };
  const hipMidAt = mid(hipR, hipL), trunkUp = unit(sub(mid(sR, sL), hipMidAt)), tallTrunk = length(sub(mid(sR, sL), hipMidAt));
  const trunkVerts = R.verts.filter(p => offSegment(p, sR, eR) > 0.07 && offSegment(p, sL, eL) > 0.07 && offSegment(p, eR, wR) > 0.06 && offSegment(p, eL, wL) > 0.06 && Math.abs(dot(sub(p, hipMidAt), across)) < 0.25);
  // A limb's mean radius: the surface within 6 cm of the middle third of its bone.
  const limbRadius = (a: Vec3, b: Vec3) => { const d = sub(b, a), l = length(d), ring = R.verts.filter(p => { const t = dot(sub(p, a), d) / (l * l); return t > 0.33 && t < 0.67 && offSegment(p, a, b) < 0.06; }); return mm(ring.reduce((n, p) => n + offSegment(p, a, b), 0) / ring.length); };
  const breadth = (k0: number) => { const band = trunkVerts.filter(p => Math.abs(dot(sub(p, hipMidAt), trunkUp) / tallTrunk - k0) < 0.04); if (band.length < 20) return null; const a = band.map(p => dot(sub(p, hipMidAt), across)), d = band.map(p => dot(sub(p, hipMidAt), fwd)); return {at: k0, wide: mm(Math.max(...a) - Math.min(...a)), deep: mm(Math.max(...d) - Math.min(...d))}; };
  const world = (p: Vec3) => p.map(n => Math.round(n * 10000) / 10000) as Vec3, worldUp: Vec3 = [0, 1, 0];
  const leanFwd = Math.atan2(dot(sub(shoulderMid, hipMid), [0, 0, 1]), dot(sub(shoulderMid, hipMid), worldUp)); // + toward the camera
  const upper = sub(neck, j('c_spine2')), upperLean = Math.atan2(upper[2], upper[1]); // the upper back alone: what the picture shows of her trunk
  const twist = Math.atan2(-(sL[2] - sR[2]), sL[0] - sR[0]); // + her left shoulder back
  return {
    picture: R.pic.picture, scale: Math.round(R.s * 10000) / 10000, handsOnFelt: R.handsOnFelt,
    bones: {upperArm: [mm(length(sub(eR, sR))), mm(length(sub(eL, sL)))], forearm: [mm(length(sub(wR, eR))), mm(length(sub(wL, eL)))],
      upperArmRadius: [limbRadius(sR, eR), limbRadius(sL, eL)], forearmRadius: [limbRadius(eR, wR), limbRadius(eL, wL)]},
    shoulders: {jointsApart: mm(length(sub(sL, sR))), acromionApart: mm(length(sub(k('left-acromion'), k('right-acromion')))), jointsPx: [px(see(eye, sR)), px(see(eye, sL))], acromionPx: [px(see(eye, k('right-acromion'))), px(see(eye, k('left-acromion')))],
      acromionOverJoint: [mm(k('right-acromion')[1] - sR[1]), mm(k('left-acromion')[1] - sL[1])], tilt: deg(Math.atan2(sL[1] - sR[1], sL[0] - sR[0])), neckKeyOverJoints: mm(k('neck')[1] - shoulderMid[1]), neckKeyPx: px(see(eye, k('neck')))},
    neck: {jointOverShoulderJoints: mm(neck[1] - shoulderMid[1]), headJointOverNeckJoint: mm(length(sub(head, neck))), radius: mm(neckRadius), chinOverShoulderJoints: mm(chin[1] - shoulderMid[1]), chinOverAcromion: mm(chin[1] - mid(k('left-acromion'), k('right-acromion'))[1])},
    head: {crownToChin: mm(high(crown) - high(chin)), wide: mm(wide), deep: mm(deep), crownPx: px(see(eye, crown)), chinPx: px(see(eye, chin)), headJointPx: px(see(eye, head)), middlePx: px(see(eye, mid(crown, chin))),
      middleAheadOfShoulders: mm(mid(crown, chin)[2] - shoulderMid[2]), headJointAheadOfShoulders: mm(head[2] - shoulderMid[2]), eyesAheadOfShoulders: mm(eyes[2] - shoulderMid[2]), eyesOverShoulderJoints: mm(eyes[1] - shoulderMid[1]), chinOverShoulderJoints: mm(chin[1] - shoulderMid[1])},
    trunk: {hipToShoulders: mm(length(sub(shoulderMid, hipMid))), hipBelowFelt: mm(-hipMid[1]), hipBehindShoulders: mm(shoulderMid[2] - hipMid[2]), leanDeg: deg(leanFwd), upperBackLeanDeg: deg(upperLean), twistDeg: deg(twist), hipsApart: mm(length(sub(hipL, hipR))),
      breadths: [0.3, 0.45, 0.6, 0.7, 0.8, 0.88].map(breadth)},
    points: {shoulders: [world(sR), world(sL)], elbows: [world(eR), world(eL)], wrists: [world(wR), world(wL)], hip: world(hipMid), neck: world(neck), head: world(head), eyes: world(eyes), crown: world(crown), chin: world(chin), acromion: [world(k('right-acromion')), world(k('left-acromion'))],
      neckPx: px(see(eye, neck)), shoulderMidPx: px(see(eye, shoulderMid))},
  };
}

/** Her outline on the green: for each column the first row from the top that is not the key (the head, hair and shoulders). */
async function outline(picture: string, columns: number[]) {
  const {data, info} = await sharp(picture).removeAlpha().raw().toBuffer({resolveWithObject: true});
  const keyed = (x: number, y: number) => { const o = (y * info.width + x) * 3, R = data[o], G = data[o + 1], B = data[o + 2]; return G > 120 && G > R * 1.35 && G > B * 1.35; };
  return Object.fromEntries(columns.map(x => { let y = 0; while (y < 700 && keyed(x, y)) y++; return [x, y]; }));
}

/** The doll's own measures in the same terms. */
function dolls(d: Doll) {
  const fr = dollFrame(lens, d), [sR, sL] = fr.shoulders, m = mid(sR, sL), headR = fr.headRadius * d.shape.headScale, chinY = fr.head[1] - headR * d.shape.skull[1];
  return {name: d.name, bones: {upperArm: mm(d.upperArm), forearm: mm(d.forearm)}, shoulders: {jointsApart: mm(length(sub(sL, sR))), jointsPx: [px(see(eye, sR)), px(see(eye, sL))], topOverJoints: mm(d.shape.shoulderBall), topPx: px(see(eye, [sR[0], sR[1] + d.shape.shoulderBall, sR[2]]))},
    neck: {baseOverShoulderJoints: mm(fr.neck[1] - m[1]), chinOverShoulderJoints: mm(chinY - m[1]), chinOverShoulderTop: mm(chinY - m[1] - d.shape.shoulderBall), radius: mm(d.shape.neck.radius[0])},
    head: {crownToChin: mm(2 * headR * d.shape.skull[1]), wide: mm(2 * headR * d.shape.skull[0]), deep: mm(2 * headR * d.shape.skull[2]), chinPx: px(see(eye, [fr.head[0], chinY, fr.head[2]])), crownPx: px(see(eye, [fr.head[0], fr.head[1] + headR * d.shape.skull[1], fr.head[2]])), overShoulderJoints: mm(fr.head[1] - m[1])},
    trunk: {hipToShoulders: mm(length(sub(m, fr.hip))), hipBelowFelt: mm(-fr.hip[1])}};
}

const read = sam.pictures.map((_: unknown, i: number) => hers(i));
const columns = [-260, -220, -200, -180, -160, -140, -120, -100].flatMap(dx => [866 + dx, 866 - dx]).sort((a, b) => a - b);
const outlines = await Promise.all(sam.pictures.map((p: {picture: string}) => outline(p.picture, columns)));
// Her outline's rows as heights on the shoulder plane, over her shoulder joints' mean row there.
const rowToMetres = (x: number, y: number) => onUpright(eye, x, y, plane)?.[1] ?? NaN;
const result = {lens, shoulderPlaneZ: plane, doll: dolls(doll), her: read.map((h: ReturnType<typeof hers>, i: number) => ({...h, outline: Object.fromEntries(Object.entries(outlines[i]).map(([x, y]) => [x, {row: y, overShoulderJointsMm: mm(rowToMetres(Number(x), y as number) - (h.points.shoulders[0][1] + h.points.shoulders[1][1]) / 2)}]))}))};
console.log(JSON.stringify(result, null, 1));
const out = arg('--out'); if (out) writeFileSync(out, JSON.stringify(result, null, 1) + '\n');
