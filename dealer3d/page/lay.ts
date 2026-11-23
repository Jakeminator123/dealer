// The two-hand deal from pose 2.3 laid as a function, for the doll lab (dealer3d/page/docka.ts): what
// dealer3d/tools/deal-film.ts does from its flags, done from a recipe in memory, so that a deal can be laid again while a
// slider is moved. Pure: no I/O and no three.js. The laying itself is dealer3d/src/two-hand.ts, as for the tool.
//
// A recipe is the tool's flags for one film, read back out of a deal the tool wrote (dealer3d/data/giv-fran-2-3-*.json
// carries them in `pace`, `rightAt`, `poseFilm` and its frame count): laid again from its own recipe a stored deal comes
// back to the last digit kept (`node --test dealer3d/page/lab.test.ts` holds the deals recipeFor names to that, frame for
// frame; all but seat 6's roll, whose place has moved 2.4 mm in the plan since it was laid). What
// the lab steers is a handful of those flags and nothing else: --turn-near, wait in --shared (or the beat l of --beats
// where the hands do not share the card), --carry, --grip-yaw, --body, and all of --beats for the tempo. (The tool is a
// script that runs on import, so the page cannot call it. When its body moves into dealer3d/src/ as a function, this
// file's layDeal goes and both call that.)
import {SHOE, SHOE_LAID_BEFORE_20261123, TABLE_LENS, cross, filmEye, shoeCard, shoePose, type Shoe, type Vec3} from '../../src/table-lens.ts';
import {spots, type Plan} from '../src/world.ts';
import {arm, standing, turned} from '../src/body.ts';
import {sideSeen} from '../src/deal.ts';
import {REAL_DEAL, type RealCard} from '../src/real-deal.ts';
import {TWO_HAND, contactGripFits, shoeHolds, startOnAnchor, twoHandDeal, type Limb, type Pace, type Still} from '../src/two-hand.ts';
import {naturalPace} from '../src/natural.ts';

export const FPS = 30;
const BEATS = ['b', 'c', 'd', 'e', 'l', 'f', 'g', 'h'] as const;
/** A deal as the tool wrote it, as far as a recipe is read from it. */
export type Stored = {fps: number; frameCount: number; to: string[]; poseFilm?: string; rightAt?: {x: number; y: number; yaw: number} | null; pace: (Pace & {real: RealCard}) | null};
/** The pose film a deal begins on the last frame of (dealer3d/data/till-ankare-2-3*.json). */
export type PoseFilm = {frameCount: number; frames: (Still & {card: unknown})[]; body?: {lean: number; twist: number}; handSize: unknown; palm: unknown; hip: Vec3};
/** The tool's flags for one film: its length in frames, --beats (frames from 0: b,c,d,e,l,f,g,h), --pose-film, --right-at, and every other flag as the Pace it gave. */
export type Recipe = {from: string; frames: number; beats: number[]; poseFilm: string | null; rightAt: {x: number; y: number; yaw: number} | null; pace: Pace; endElbows: boolean};
/**
 * What the lab steers, each in place of the recipe's own (null, and nought for turnLater, and 1 for tempo: the recipe as it is).
 * `turnNear`: the share of the way from the hand change to the place the card has gone, lying flat, when the turn begins
 * (Pace.turnNear; 0: turned all the way from the hand change, as without the flag). `turnLater`: frames the turn begins
 * later than the recipe has it: where both hands have the card through the change (sweep with sharedChange) that is
 * `wait` of --shared, else the beat l, when her left hand lets go. `carry`: metres the held corner is over the felt half
 * way through the turn. `gripYaw`: degrees her hand lies off the card's long side (Pace.gripYaw; the contact grips only).
 * `body`: degrees [leaning sideways, the right shoulder forward, leaning forward] she has at the place, in place of what
 * the reach asks. `tempo`: how many times faster the deal is laid (every beat that much sooner; the still end keeps its length).
 */
export type Steer = {turnNear: number | null; turnLater: number; carry: number | null; gripYaw: number | null; body: [number, number, number] | null; tempo: number};
export const NO_STEER: Steer = {turnNear: null, turnLater: 0, carry: null, gripYaw: null, body: null, tempo: 1};
/** The turn at the place, as the trial of 2026-11-23 has it for the doll paow (dealer3d/LASMIG.md, "Vändningen vid platsen"): --turn-near 0.7, wait=14 and --grip-yaw -20, on a sweep recipe. */
export const TURN_AT_PLACE = {turnNear: 0.7, wait: 14, gripYaw: -20};
/** Whether both hands have the card through the change in this recipe: then the turn waits on `wait`, and the contact grip has a yaw to steer. */
export const shares = (recipe: Recipe): boolean => recipe.pace.contactGrip === 'sweep' && !!recipe.pace.sharedChange;

/** The recipe a stored deal was laid from. Throws for a deal that was not laid in a tempo of its own (the lab steers --beats). */
export function recipeOf(name: string, stored: Stored): Recipe {
  if (!stored.pace || stored.to.length !== 1 || stored.fps !== FPS) throw Error(`${name}: not one card laid with --beats at ${FPS} frames a second.`);
  // leftBack, elbows and base are not flags: the tool works them out (from the beats, a film in the real tempo, and the pose film).
  const {real, leftBack: _leftBack, elbows, base: _base, ...pace} = stored.pace;
  return {from: name, frames: stored.frameCount, beats: BEATS.map(k => Math.round(real[k] * FPS * 1e6) / 1e6), poseFilm: stored.poseFilm ?? null, rightAt: stored.rightAt ?? null, pace, endElbows: !!elbows};
}

/** The beats and the length of a recipe as steered: the tempo first, then (where the hands do not share the card) the moment her left hand lets go, a tenth of a frame the finest. */
export function steered(recipe: Recipe, steer: Steer): {frames: number; beats: number[]} {
  const tenth = (x: number) => Math.round(x * 10) / 10, tail = recipe.frames - recipe.beats[7], beats = recipe.beats.map(x => steer.tempo === 1 ? x : tenth(x / steer.tempo));
  if (steer.turnLater && !shares(recipe)) beats[4] = tenth(beats[4] + steer.turnLater);
  return {frames: steer.tempo === 1 ? recipe.frames : Math.round(beats[7] + tail), beats};
}

/** The real card whose moments and hand change a place takes, as the tool chooses it: a seat's own (the real dealer's S1 is the plan's seat 7), her own first card, and for the second card of a seat its first card's. Beyond the tool: her own third card, an open card as her first, takes her first card's (the tool has no flags for it yet). Her second card is laid closed, which no deal here does. */
export function realOf(id: string): RealCard {
  const m = /^P([1-7]).C[12]$/.exec(id), real = /^D.C[13]$/.test(id) ? REAL_DEAL[7] : m ? REAL_DEAL[7 - Number(m[1])] : null;
  if (!real) throw Error(`No real card to take the moments of for ${id}.`);
  return real;
}

const r4 = (v: number[]) => v.map(x => Math.round(x * 10000) / 10000), r1 = (x: number | null) => x === null ? null : Math.round(x * 10) / 10;
/**
 * One card dealt from pose 2.3 to `target` of the plan, laid from `recipe` as steered: the deal in the format of
 * dealer3d/data/giv-*.json, as the tool writes it, for the standard doll. `pose` is the recipe's pose film (the film begins
 * on its last frame). Throws where two-hand.ts does: a hand out of reach, a turn with too few frames.
 * `lab`: what the lab shows beside the film: the body she has at the place when nothing steers it (degrees, [sideways,
 * the right shoulder forward, forward], as two-hand.ts works it out from the reach), and the recipe and steering themselves.
 * `natural`: the hands hand the card over without meeting (dealer3d/src/natural.ts `naturalPace`, the doll lab's
 * "Naturlig"); without it the recipe lays the deal it always laid. `shoe`: the shoe it is laid with, the films' (SHOE)
 * by default; a stored deal is laid again with the one it was laid with (SHOE_LAID_BEFORE_20261123 before 2026-11-23).
 */
export function layDeal(input: {plan: Plan; target: string; recipe: Recipe; pose: PoseFilm; steer?: Steer; natural?: boolean; shoe?: Shoe}) {
  const {plan, target, recipe, pose} = input, steer = input.steer ?? NO_STEER, lens = TABLE_LENS, shoe = input.shoe ?? SHOE;
  const all = spots(plan, lens), spot = all.find(s => s.id === target); if (!spot) throw Error(`The plan has no place ${target}.`);
  const {frames: N, beats: own} = steered(recipe, steer), mode = recipe.pace.contactGrip;
  if (mode && !contactGripFits(target, mode)) throw Error(`${target}: the ${mode === true ? 'contact' : mode} grip does not lay a card there.`);
  if (/^P[1-7]\.C2$/.test(target) && mode !== 'sweep') throw Error(`${target}: a seat's second card is laid with the sweep.`);
  // The film's own moments in place of the real card's; her left hand goes back to the shoe as much slower as the film is (the tool's `paced`).
  const r = realOf(target), [b, c, d, e, l, f, g, h] = own.map(x => x / FPS), slower = (h - b) / (Math.max(r.h, r.g + TWO_HAND.settle) - r.b);
  const real: RealCard = {...r, a: 0, b, c, d, e, l, f, g, h, i: h + 0.2};
  let pace: Pace = {...recipe.pace, flowing: true, leftBack: Math.round(TWO_HAND.leftBack * slower * 1000) / 1000};
  if (input.natural) pace = naturalPace(pace);
  if (steer.carry !== null) pace.carry = steer.carry;
  if (steer.body) pace.body = steer.body;
  if (steer.turnNear !== null) { if (steer.turnNear > 0) pace.turnNear = steer.turnNear; else delete pace.turnNear; }
  if (steer.gripYaw !== null && pace.contactGrip) pace.gripYaw = steer.gripYaw;
  if (steer.turnLater && shares(recipe)) pace.shared = {...pace.shared, wait: Math.max(0, (pace.shared?.wait ?? 1) + steer.turnLater)};
  if (recipe.poseFilm && pose.body) pace.base = [pose.body.lean, pose.body.twist];
  const last = pose.frames[pose.frameCount - 1], posed: Still = {L: last.L, R: last.R, h: last.h, ...(recipe.poseFilm ? {g: last.g} : {})};
  const start = recipe.rightAt ? startOnAnchor(lens, posed, {x: recipe.rightAt.x, y: recipe.rightAt.y}, recipe.rightAt.yaw, shoe) : posed;
  // A film in its own tempo ends on the picture the film in the real tempo ends on: that film is laid first, for its elbows.
  if (recipe.endElbows) { const end = twoHandDeal(lens, start, [{id: target, at: spot.at, real: r}], 2, FPS, N, {shoe, ...(pace.base ? {base: pace.base} : {}), ...(pace.takeAt ? {takeAt: pace.takeAt} : {}), ...(pace.seenForearm ? {seenForearm: pace.seenForearm} : {}), ...(pace.clearTrunk ? {clearTrunk: pace.clearTrunk} : {}), ...(pace.steady ? {steady: pace.steady} : {})}).frames[N - 1]; pace.elbows = {L: end.L.e, R: end.R.e}; }
  const deal = twoHandDeal(lens, start, [{id: target, at: spot.at, real}], 0, FPS, N, {...pace, shoe}), {frames, beats} = deal;

  const eye = filmEye(lens), inside = shoeHolds(lens, 0.005, shoe), mixed = (p: Vec3, q: Vec3, t: number): Vec3 => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
  const through = frames.map((fr, i) => fr.R.p.some(inside) || [0.2, 0.4, 0.6, 0.8].some(t => inside(mixed(fr.R.e, fr.R.w, t))) ? i : -1).filter(i => i >= 0);
  const sides = frames.map(fr => sideSeen({centre: fr.card.c, long: fr.card.l, normal: fr.card.n, across: cross(fr.card.n, fr.card.l)}, eye.position, 0));
  const turnsAt = (() => { const i = frames.findIndex((_, j) => j > 0 && sides[j] !== sides[j - 1]); return i < 0 ? Math.round(beats[0].turned) : i; })();
  const limb = (a: Limb) => ({s: r4(a.s), e: r4(a.e), w: r4(a.w), k: 1, p: a.p.map(r4)});
  // What the reach asks of her body at the place (two-hand.ts, the cards' `more`), for the lab's sliders to start from.
  const hip = standing(lens).hip, toward = [spot.at[0] - hip[0], spot.at[2] - hip[2]], far = Math.hypot(toward[0], toward[1]) || 1, share = deal.cards[0].bodyShare, clamp = (v: number) => Math.max(0, Math.min(1, v));
  const asked: [number, number, number] = pace.body ?? [TWO_HAND.sway * Math.max(-1, Math.min(1, spot.at[0] / 0.5)) + toward[0] / far * TWO_HAND.lean * share, 6 * clamp(-spot.at[0] / 0.5) + TWO_HAND.twist * share * clamp((spot.at[0] + 0.1) / 0.3), toward[1] / far * TWO_HAND.lean * share];
  return {about: 'The two-hand deal from pose 2.3, laid in the doll lab by dealer3d/page/lay.ts as dealer3d/tools/deal-film.ts lays it (dealer3d/src/two-hand.ts), from the recipe in `lab` (the flags of the stored deal it names, and what was steered). Same frame and fields as the deals the tool writes.',
    film: 'tvahandsgiv-modell', pose: 'from-2.3', ...(recipe.poseFilm ? {poseFilm: recipe.poseFilm} : {}), places: [{id: target, at: spot.at, pixel: spot.pixel}], pace: {real, ...pace}, rightAt: recipe.rightAt, to: [target], loose: 0, fps: FPS, frameCount: N,
    leavesShoe: Math.round(beats[0].c), edge: [turnsAt, turnsAt], folds: Math.round(beats[0].g), rests: Math.ceil(beats[0].h), handSize: pose.handSize, palm: pose.palm, throughShoe: through.length, elbowForced: deal.forced, hip: pose.hip,
    beats: beats.map(x => ({to: x.to, a: r1(x.a), b: r1(x.b), c: r1(x.c), d: r1(x.d), e: r1(x.e), l: r1(x.l), turned: r1(x.turned), f: r1(x.f), g: r1(x.g), h: r1(x.h), i: r1(x.i)})), turns: deal.cards.map(x => ({axis: r4(x.turn.axis), angle: Math.round(x.turn.angle * 10) / 10})),
    laid: deal.laid.map(x => ({from: x.from, c: r4(x.c), l: r4(x.l), n: r4(x.n)})), frames: frames.map(fr => ({card: {c: r4(fr.card.c), l: r4(fr.card.l), n: r4(fr.card.n), id: fr.card.id}, L: limb(fr.L), R: limb(fr.R), h: r4(fr.h), g: r4(fr.g)})),
    lab: {recipe: recipe.from, steer, bodyAsked: asked.map(x => Math.round(x * 10) / 10) as [number, number, number], carry: pace.carry ?? TWO_HAND.heights.carry, ...(input.natural ? {natural: true} : {})}};
}
export type LaidDeal = ReturnType<typeof layDeal>;

/**
 * A stored motion (a pose film) as the lab shows it with the films' shoe: in the frames where its card stands in the shoe
 * of before 2026-11-23 (within a millimetre of that shoe's card), the card stands as much moved into the films' shoe; the
 * hands are as they are (on paow, pose-on-doll has them where her picture has them). The file is not changed.
 */
export function cardInFilmsShoe<M extends {frames: {card: {c: number[]; l: number[]; n: number[]}}[]}>(motion: M): M {
  const lens = TABLE_LENS, basis = (s: Shoe) => { const k = shoeCard(shoePose(lens, s), s); return {o: k.centre, b: [k.up, k.across, cross(k.up, k.across)]}; };
  const from = basis(SHOE_LAID_BEFORE_20261123), to = basis(SHOE), dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const turn = (v: number[]) => { const q = from.b.map(e => dot(v, e)); return [0, 1, 2].map(i => to.b[0][i] * q[0] + to.b[1][i] * q[1] + to.b[2][i] * q[2]); };
  const near = (c: number[]) => Math.hypot(c[0] - from.o[0], c[1] - from.o[1], c[2] - from.o[2]) < 0.001;
  return {...motion, frames: motion.frames.map(f => near(f.card.c) ? {...f, card: {...f.card, c: turn(f.card.c.map((x, i) => x - from.o[i])).map((x, i) => x + to.o[i]), l: turn(f.card.l), n: turn(f.card.n)}} : f)};
}

/**
 * Where a place of the plan takes its recipe from (a deal of dealer3d/data/), or why the lab lays no deal to it. Each
 * place was tried on both dolls from every recipe that could fit, 2026-11-23 (no elbow forced, no hand through the shoe,
 * no frame where paow's arm is too short):
 * - Seats 1 to 5, both cards: the seat's own sweep, the gällande recipe (LASMIG "svep24d"); the second card with the
 *   first card's, as the tool lays it, and seat 4's second with its own stored one.
 * - Seats 6 and 7, first card, and her own first card: the older roll (-f), the only deal made for them.
 * - Seat 6, second card: a seat's second card is laid with the sweep only, and none is made for seat 6; seat 5's sweep
 *   reaches it (`lent`). Seat 7's second card: no sweep reaches it (the right arm, 0.54 m from the shoulder).
 * - Her own third card: her first card's roll (`lent`; the tool has no flags for it). Her second card is laid closed,
 *   and every deal here turns the card.
 */
export type PlaceRecipe = {recipe: string; lent?: 'seat 5' | 'her first card'} | {none: 'reach' | 'closed'};
export function recipeFor(target: string): PlaceRecipe | null {
  const m = /^P([1-7])\.C([12])$/.exec(target), sweep = (n: number | string) => `giv-fran-2-3-p${n}-grepp-svep-d`;
  if (m) { const n = Number(m[1]), second = m[2] === '2';
    if (n <= 5) return {recipe: sweep(n === 4 && second ? '4c2' : n)};
    if (!second) return {recipe: `giv-fran-2-3-p${n}-f`};
    return n === 6 ? {recipe: sweep(5), lent: 'seat 5'} : {none: 'reach'}; }
  if (target === 'D.C1') return {recipe: 'giv-fran-2-3-d-f'};
  if (target === 'D.C3') return {recipe: 'giv-fran-2-3-d-f', lent: 'her first card'};
  return target === 'D.C2' ? {none: 'closed'} : null;
}

/**
 * The pose a deal begins in and, with its return, ends in (Jakob 2026-11-23: "A2.1, A2.2 och A2.3 är olika in- och
 * utgångar", a saved deal per player and per entry). A2.3: every deal laid above. A2.1, the pinch at the shoe: the deals
 * read off Pamela's film (READ_DEALS), the only deals from it there are; nothing in them is steered. A2.2: not built, only
 * its anchor picture is; no pose is read off it and no deal begins in it.
 */
export type Entry = 'A2.1' | 'A2.2' | 'A2.3';
/** A saved standard's name (dealer3d/standard/<name>.json): <doll>-<place> from A2.3, as every standard saved before the entries were, and <doll>-a2-1-<place> (a2-2-) from the others. */
export const standardName = (doll: string, entry: Entry, place: string) => `${doll}-${entry === 'A2.3' ? '' : `${entry.toLowerCase().replace('.', '-')}-`}${place.toLowerCase().replace('.', '')}`;
/** The one-hand deals from A2.1 (dealer3d/data/, laid into the room by dealer3d/tools/lift.ts from her hand and the card in Pamela's film): her left hand takes the card out of the shoe and lays it; all four begin on the same frame, the pose A2.1. */
export const READ_DEALS: Record<string, string> = {'P1.C1': 'giv-pamela-p1', 'P3.C1': 'giv-pamela-p3', 'P4.C1': 'giv-pamela-p4', 'P5.C1': 'giv-pamela-p5'};
export type EntryPlace = PlaceRecipe | {read: string} | {none: 'unread' | 'unbuilt'};
/** Where a deal from `entry` to a place of the plan comes from, or why there is none; null for a place the lab does not know. */
export function placeFrom(entry: Entry, target: string): EntryPlace | null {
  const known = recipeFor(target); if (!known || entry === 'A2.3') return known;
  if (entry === 'A2.2') return {none: 'unbuilt'};
  return Object.hasOwn(READ_DEALS, target) ? {read: READ_DEALS[target]} : 'none' in known ? known : {none: 'unread'};
}

/** A deal read off a film, as dealer3d/data/giv-pamela-*.json have it (one card, her left hand holding it, no gaze point). */
export type ReadFrame = {card: {c: number[]; l: number[]; n: number[]; id?: number}; L: {s: number[]; e: number[]; w: number[]; k: number; p: number[][]}; R: unknown; h: number[]; g?: number[]};
export type ReadStored = {fps: number; frameCount: number; rests: number; to?: unknown; frames: ReadFrame[]} & Record<string, unknown>;
const READ_CARRY = 0.2; // metres the card goes from the shoe of before over which the move into the films' shoe eases out
/**
 * A deal from A2.1 (READ_DEALS) as the lab lays it, to `place`, with the films' shoe: it was read with the shoe of before
 * 2026-11-23, 3 cm off. While its card is in that shoe's window the card and her left hand, which holds it, are moved as
 * one into the films' shoe (the move cardInFilmsShoe gives the card), and as the card goes out the move eases off over
 * READ_CARRY metres, so that the card is laid where it was read; the left arm is laid again to the moved wrist (body.ts
 * arm, the standard's bones), her right hand and head are as read. Every card has the id 0 (one card). The file is not changed.
 */
export function readDeal(name: string, stored: ReadStored, place: string | null) {
  const lens = TABLE_LENS, basis = (s: Shoe) => { const k = shoeCard(shoePose(lens, s), s); return {o: k.centre, b: [k.up, k.across, cross(k.up, k.across)]}; };
  const from = basis(SHOE_LAID_BEFORE_20261123), to = basis(SHOE);
  // The turn from the one shoe's card to the other's (to.b[i] from.b[i]ᵀ summed) as an axis and an angle, so that part of it can be taken.
  const M = [0, 1, 2].map(r => [0, 1, 2].map(c => from.b.reduce((s, e, i) => s + to.b[i][r] * e[c], 0)));
  const angle = Math.acos(Math.max(-1, Math.min(1, (M[0][0] + M[1][1] + M[2][2] - 1) / 2))), sk: Vec3 = [M[2][1] - M[1][2], M[0][2] - M[2][0], M[1][0] - M[0][1]], n = Math.hypot(...sk), axis: Vec3 = n > 1e-12 ? [sk[0] / n, sk[1] / n, sk[2] / n] : [1, 0, 0];
  const step = [0, 1, 2].map(i => to.o[i] - from.o[i]);
  const moved = (p: number[], w: number) => { const q = turned([p[0] - from.o[0], p[1] - from.o[1], p[2] - from.o[2]], axis, angle * w); return [0, 1, 2].map(i => from.o[i] + step[i] * w + q[i]); };
  const turnedBy = (v: number[], w: number) => turned(v as Vec3, axis, angle * w) as number[];
  const frames = stored.frames.map(f => {
    const away = Math.hypot(f.card.c[0] - from.o[0], f.card.c[1] - from.o[1], f.card.c[2] - from.o[2]), x = Math.min(1, away / READ_CARRY), w = 1 - x * x * (3 - 2 * x);
    const card = {c: f.card.c, l: f.card.l, n: f.card.n, id: 0};
    if (w <= 0) return {...f, card};
    const wrist = moved(f.L.w, w) as Vec3, laid = arm(f.L.s as Vec3, wrist, [f.L.e[0] - f.L.s[0], f.L.e[1] - f.L.s[1], f.L.e[2] - f.L.s[2]]);
    if (!laid.reached) throw Error(`${name}: her left arm does not reach the films' shoe at frame ${stored.frames.indexOf(f)}.`);
    return {...f, card: {c: moved(f.card.c, w), l: turnedBy(f.card.l, w), n: turnedBy(f.card.n, w), id: 0}, L: {...f.L, e: laid.elbow, w: laid.wrist, p: f.L.p.map((q, k) => k ? moved(q, w) : laid.wrist)}};
  });
  return {...stored, to: place ? [place] : [], frames, lab: {read: name}};
}
export type ReadDeal = ReturnType<typeof readDeal>;
