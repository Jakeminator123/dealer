// The dolls: one named set of measures each (Jakob 2026-11-21: "Kanske kan man ta mått för respektive dealer?"). A doll is
// where the upright figure's joints are in the bank's frame, how long its bones are, how far it may bend, and the shapes the
// stage draws round its joints. Pure: no I/O and no three.js.
//   standard   the white figure every deal and film until 2026-11-21 was made with; its numbers are those of body.ts BODY
//              and dealer3d/src/stage.ts as they stood, and give the same frames to the last digit
//   paow       a stand-in with Paow's own measures, read by SAM 3D Body on her anchors 1 and 2.3 (dealer3d/tools/docka-sam.py,
//              dealer3d/tools/docka-mat.ts): straight trunk, sloping shoulders, a neck, the head over the trunk
// `about` says of each measure whether it is measured (mätt, and on what) or guessed (gissat, and why).
// A doll from SAM with all its joints (fingers, face) is a doll whose `skeleton` is filled: the names, parents and rest
// places of the joints, read as dealer3d/tools/docka-sam.py reads them; see DollSkeleton.
import {add, filmEye, length, mul, onUpright, sub, type Lens, type Pixel, type Vec3} from './camera.ts';
import {ASSUMED, MEASURED, dealerEdge} from './world.ts';

export type Frame = {hip: Vec3; shoulders: [Vec3, Vec3]; neck: Vec3; head: Vec3; headRadius: number}; // shoulders: her right (image left), her left (image right)
/**
 * Where the upright figure is.
 * 'film': as the standard has always been placed: the jacket's shoulder points of paow-nyp-ung-1 read by eye, taken
 *   `jointIn` of the way in, the neck `neckOver` metres over their middle, the head between the top of the hair and the chin.
 * 'joints': the joint centres as a reading of her picture has them, as pixels of the bank's frame on the upright plane of
 *   her shoulders (0.18 m behind the table edge), each with how far it stands ahead of that plane (metres, toward the
 *   camera); the head's radius is her skull's (crown to chin, halved), not her hair's.
 */
export type DollPlace =
  | {kind: 'film'; jointIn: number; neckOver: number}
  | {kind: 'joints'; shoulders: [Pixel, Pixel]; neck: Pixel; head: Pixel; ahead: {shoulders: [number, number]; neck: number; head: number}; headRadius: number};
/** The shapes drawn round the joints (dealer3d/src/stage.ts), metres. */
export type DollShape = {
  /** 'bar': one straight cylinder between the shoulder joints (the standard's yoke). 'slope': one from a point `footOver` metres over the shoulders' middle (along the trunk) down to each shoulder joint, as shoulders slope from the neck. */
  yoke: {kind: 'bar'; radius: number} | {kind: 'slope'; radius: number; footOver: number};
  shoulderBall: number; elbowBall: number; wristBall: number;
  upperArmRadius: [number, number]; forearmRadius: [number, number];
  /** The neck from the frame's neck up to `intoHead` of the head's radius under the head's middle, radius at the foot and at the top. */
  neck: {radius: [number, number]; intoHead: number};
  /** The head: a ball of the frame's head radius times `scale`, stretched by `skull` (across, up, deep). */
  headScale: number; skull: Vec3;
  /**
   * The trunk between the hip and the shoulders' middle, leaning and turning with them. 'egg' (the standard's): one egg
   * reaching `wide` times the shoulders' span to each side, `tall` times hip-to-shoulders up and down from its middle and
   * `deep` metres to the front and back, its middle `at` of the way from the hip to the shoulders. 'profile': one smooth
   * body turned about its upright axis, `profile` its half-width (times the shoulders' span) at heights (times
   * hip-to-shoulders over the hip), from the bottom up and closing at the top, and `deep` its depth as a share of its width.
   */
  trunk: {kind: 'egg'; wide: number; tall: number; deep: number; at: number} | {kind: 'profile'; profile: [number, number][]; deep: number};
};
/** All the joints of a doll that came out of SAM 3D Body (127 for MHR: fingers, face, tongue and twist joints among them): names, each joint's parent (-1 for the root), and where each is in the doll's rest pose, metres in the scene. */
export type DollSkeleton = {names: string[]; parents: number[]; rest: Vec3[]; source: string};
export type Doll = {
  name: string;
  upperArm: number; forearm: number;
  /** How far the dealing wrist may be from the shoulder before she bends (body.ts solveBody), and how far she may bend and turn, radians. */
  reach: number; mostLean: number; mostTwist: number;
  hipBelowFelt: number;
  place: DollPlace; shape: DollShape; skeleton?: DollSkeleton;
  about: Record<string, string>;
};

export const STANDARD: Doll = {
  name: 'standard',
  upperArm: 0.29, forearm: 0.26, reach: 0.535, mostLean: 0.6, mostTwist: 0.6, hipBelowFelt: 0.2,
  place: {kind: 'film', jointIn: 0.82, neckOver: 0.03},
  shape: {yoke: {kind: 'bar', radius: 0.052}, shoulderBall: 0.055, elbowBall: 0.04, wristBall: 0.031, upperArmRadius: [0.047, 0.04], forearmRadius: [0.038, 0.03],
    neck: {radius: [0.04, 0.036], intoHead: 0.6}, headScale: 0.92, skull: [0.74, 1, 0.86], trunk: {kind: 'egg', wide: 0.47, tall: 0.56, deep: 0.095, at: 0.52}},
  about: {all: 'som dockan har varit sedan 2026-11-17: axlarna i kavajens axelpunkter (paow-nyp-ung-1, lästa med ögat) 0,82 in, huvudet mellan hårets topp och hakan, armarna 0,29 och 0,26 m antagna'},
};

// Paow's measures. SAM 3D Body read her anchors 1 (paow-vila-tatuerad) and 2.3 (paow-ankare-2-3-c) in the bank's frame
// (dealer3d/tools/docka-sam.py); dealer3d/tools/docka-mat.ts laid each reading into the scene, scaled about the eye so that
// her shoulder joints lie on the plane she sits in (0.978 and 0.991), and measured it. Places are anchor 1's, where she sits
// still and straight. "mätt" is a measure of those readings (mean of the two where both are good); "gissat" is not.
export const PAOW: Doll = {
  name: 'paow',
  upperArm: 0.266, forearm: 0.252, reach: 0.504, mostLean: 0.6, mostTwist: 0.6, hipBelowFelt: 0.154,
  place: {kind: 'joints', shoulders: [{x: 687, y: 445.5}, {x: 1045, y: 445.5}], neck: {x: 865.5, y: 432.6}, head: {x: 864.1, y: 208.8}, ahead: {shoulders: [0, 0], neck: 0.011, head: 0.011}, headRadius: 0.1075},
  shape: {yoke: {kind: 'slope', radius: 0.045, footOver: 0.05}, shoulderBall: 0.045, elbowBall: 0.036, wristBall: 0.027, upperArmRadius: [0.044, 0.037], forearmRadius: [0.032, 0.026],
    neck: {radius: [0.062, 0.046], intoHead: 0.6}, headScale: 1, skull: [0.71, 1, 0.93],
    trunk: {kind: 'profile', deep: 0.68, profile: [[0.2, 0.4], [0.33, 0.39], [0.45, 0.365], [0.55, 0.375], [0.62, 0.395], [0.7, 0.435], [0.8, 0.468], [0.88, 0.472], [0.95, 0.445], [1, 0.4], [1.05, 0.32], [1.09, 0.2], [1.115, 0.08], [1.12, 0]]}},
  about: {
    upperArm: 'mätt: axel- till armbågsled 266 och 265 mm (ankare 1 och 2.3)',
    forearm: 'mätt: armbågs- till handled 251 och 253 mm',
    reach: 'gissat: armarnas summa gånger 0,972, samma andel som standarddockans 0,535 av 0,55',
    mostLean: 'gissat: som standarddockan', mostTwist: 'gissat: som standarddockan',
    hipBelowFelt: 'mätt längd, gissad hållning: höftled till axelleder 460 och 467 mm; rak bål rakt under axlarna (höfterna syns inte, SAM lägger dem 12-16 cm framför)',
    shoulders: 'mätt: axellederna på rad 448 och 443 (1764x1174), 333 mm isär; jämnade till rad 445,5. Standarddockans leder ligger 4 cm högre, i hennes akromion',
    neck: 'mätt: halsleden 17 och 23 mm över axellederna, 11 mm framför; halsen 55 mm i radie 3-6 cm upp, där den vidgas mot axlarna; ritad 62 mm vid foten och 46 vid huvudet (gissat: foten vidgas mot nacken och axlarna)',
    head: 'mätt: skallen 215 mm från hjässa till haka, 152 bred och 200 djup vid ögonen, mitten 84 mm över huvudleden; utan hår. Hakan på rad 323 (med ögat 322)',
    yoke: 'mätt mot hennes kontur på greenen: 45 mm över lederna vid axelspetsen och 61 mm 12 cm från mitten, en lutning på 14-15 grader',
    shoulderBall: 'mätt: akromion 39-41 mm över axelleden, konturen 42-47',
    arms: 'mätt: överarmen 43-46 mm och underarmen 31-32 mm i radie; avsmalningen, armbågs- och handledskulan gissade',
    trunk: 'mätt vid 0,8-0,88 av höft-axel: 316 bred och 201-213 djup; vid 0,7: 291 bred; vid 0,6: 259 och 191; dockan har 314, 312, 290 och 263 där, och djupet 0,68 av bredden (214 vid bröstet). Midjan (243 bred vid 0,45), höfterna under filten och toppen under oket gissade: låren skymmer i läsningen',
  },
};

/** The upright figure, as the film has her: joints on the plane she sits in, a little behind the table edge. */
export function dollFrame(lens: Lens, doll: Doll = STANDARD): Frame {
  const eye = filmEye(lens), z = dealerEdge(lens)[2] - ASSUMED.shouldersBehindEdge, at = (x: number, y: number) => onUpright(eye, x, y, z)!;
  const p = doll.place;
  if (p.kind === 'film') {
    const a = at(MEASURED.shoulders.a.x, MEASURED.shoulders.a.y), b = at(MEASURED.shoulders.b.x, MEASURED.shoulders.b.y), mid = mul(add(a, b), 0.5), k = p.jointIn;
    const midX = (MEASURED.pupils.a.x + MEASURED.pupils.b.x) / 2, crown = at(midX, MEASURED.crownRow), chin = at(midX, MEASURED.chinRow);
    return {hip: [mid[0], -doll.hipBelowFelt, z], shoulders: [add(mid, mul(sub(a, mid), k)), add(mid, mul(sub(b, mid), k))], neck: [mid[0], mid[1] + p.neckOver, z], head: mul(add(crown, chin), 0.5), headRadius: length(sub(crown, chin)) / 2};
  }
  // A point a reading put `ahead` metres before the plane, on the ray through its pixel (so that it is drawn on that pixel).
  const ahead = (q: Pixel, by: number): Vec3 => onUpright(eye, q.x, q.y, z + by)!;
  const a = ahead(p.shoulders[0], p.ahead.shoulders[0]), b = ahead(p.shoulders[1], p.ahead.shoulders[1]), mid = mul(add(a, b), 0.5);
  return {hip: [mid[0], -doll.hipBelowFelt, z], shoulders: [a, b], neck: ahead(p.neck, p.ahead.neck), head: ahead(p.head, p.ahead.head), headRadius: p.headRadius};
}

export const DOLLS: Record<string, Doll> = {standard: STANDARD, paow: PAOW};
/** The doll of a name; an unknown name is an error, not the standard. */
export function dollNamed(name: string | null | undefined): Doll {
  const d = DOLLS[name ?? 'standard']; if (!d) throw Error(`Ingen docka heter ${name}.`); return d;
}
