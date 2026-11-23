// The doll lab's two ways of dealing (Jakob 2026-11-23, "vissa aningen konstiga ställningar görs lite naturligare som
// standard", for Paow), for dealer3d/page/docka.ts and dealer3d/tools/docka-cykel.ts. Pure: no I/O and no three.js.
// - "Naturlig": the deal laid from its recipe with the natural hand change (lay.ts `natural`), as steered but for the
//   body, posed on the doll as "Naturlig" has her (doll.ts naturalDoll: her left hand at the shoe as her picture has it)
//   and moved as a person moves (dealer3d/src/natural.ts), with the body's sliders, the shoulders and the elbows laid on
//   the doll herself as far as her arms reach: a slider there never makes the deal fail. Where nothing steers the hand's
//   angle on the card in a contact grip, it is NATURAL_GRIP_YAW_TAKE as her right hand takes the card and NATURAL_GRIP_YAW
//   once it is turned (gripYawsOf).
// - "Som förut": the deal as the lab laid it before (lay.ts without `natural`), posed on the doll as she is.
// - withReturn: either deal, or one read off a film (from A2.1), with its return to the pose it began in, in one motion.
// In "Naturlig" her right hand ends at the laid card as `landing` says (dealer3d/src/landing.ts); without one, or with the
// default, as it did before landings were made, to the last digit. Last, her free fingers keep to what a hand can do
// (dealer3d/src/hand-rule.ts `humaneMotion`, Jakob 2026-11-23: "inget finger kan försvinna på ett konstigt sätt").
import {layDeal, type PoseFilm, type Recipe, type Steer} from './lay.ts';
import {poseOnDoll, type PoseOptions} from './pose-on-doll.ts';
import {natural} from '../src/natural.ts';
import {LANDING_DEFAULT, landed, landingTimes, type Landing} from '../src/landing.ts';
import {TURN_DEFAULT, turnedInHand, type TurnId} from '../src/turn-in-hand.ts';
import {naturalDoll, type Doll} from '../src/doll.ts';
import {humaneMotion} from '../src/hand-rule.ts';
import {buildReturnCycle, type DealMotion, type ReturnCycleOptions} from '../src/return-cycle.ts';
import type {Plan} from '../src/world.ts';
import type {Lens} from '../src/camera.ts';

export type Way = 'naturlig' | 'forut';
/** What only "Naturlig" steers: each shoulder [up, forward] centimetres, each elbow out from her side [right, left] degrees (dealer3d/src/natural.ts NaturalSteer). */
export type Knobs = {shoulderR: [number, number]; shoulderL: [number, number]; elbowOut: [number, number]};
export const NO_KNOBS: Knobs = {shoulderR: [0, 0], shoulderL: [0, 0], elbowOut: [0, 0]};
/**
 * The hand's angle on the card in "Naturlig" where nothing steers it, degrees (the contact grips only), once the card is
 * turned and to the end (Steer.gripYawEnd): Jakob 2026-11-23, after saving seats 4 and 5 with the slider at −30, "Jag vill
 * ha denna vridning som standard-återställningens satta normala.. ser naturligare ut". As her right hand takes the card it
 * is NATURAL_GRIP_YAW_TAKE (Steer.gripYaw; Jakob the same evening, "Förinställt är -30 men rimligare är typ 17 grader för
 * när dealerns högerhand som tar emot kortet görs. Men sedan vid själva slutet när kortet är vänt och så vidare är det
 * snarare -30"), the hand going from the one to the other over the turn. "Som förut" keeps the recipe's own (15 in the sweep).
 */
export const NATURAL_GRIP_YAW = -30, NATURAL_GRIP_YAW_TAKE = 17;
/**
 * What "Naturlig" lays differently from what it laid before 2026-11-23, each to be had as before to make a film made then
 * again (dealer3d/tools/docka-cykel.ts --sam-hand, --recipe-grip-yaw, --fingrar-som-forut, --en-vinkel): `samHand`, her
 * left hand at the shoe as SAM read it (doll.ts `hand.left`); `recipeGripYaw`, the recipe's own angle of the hand on the
 * card where nothing steers it; `fingers`, her free fingers as her grip and the moving left them, without
 * dealer3d/src/hand-rule.ts; `oneGripYaw`, one angle of the hand on the card from the hand change to the end,
 * NATURAL_GRIP_YAW where nothing steers it (as the lab laid "Naturlig" on the day, before the evening).
 */
export type AsBefore = {samHand?: boolean; recipeGripYaw?: boolean; fingers?: boolean; oneGripYaw?: boolean};
/** The motion with her free fingers kept to what a hand can do, unless as before. */
const humaneUnless = <M extends {frames: unknown[]}>(motion: M, before: AsBefore = {}): M => before.fingers ? motion : humaneMotion(motion);
type Posed = {motion: {frames: unknown[]; frameCount: number}; receipt: {frames: {shortMm: [number, number]}[]}};

/** A motion made with the standard doll, on `doll`; and how far her arm is too short at the worst, millimetres. */
export function onDoll<M extends object>(lens: Lens, motion: M, doll: Doll, options?: PoseOptions): {motion: M & {doll: string}; shortMm: number} {
  if (doll.name === 'standard') return {motion: {...motion, doll: 'standard'}, shortMm: 0};
  const posed = poseOnDoll(lens, motion as never, doll, options) as unknown as Posed;
  return {motion: posed.motion as unknown as M & {doll: string}, shortMm: Math.max(0, ...posed.receipt.frames.flatMap(f => f.shortMm))};
}
/** The doll as a way has her: in "Naturlig" with her left hand at the shoe as her picture has it, unless as before. */
export const dollFor = (way: Way, doll: Doll, before: AsBefore = {}): Doll => way === 'naturlig' && !before.samHand ? naturalDoll(doll) : doll;
/**
 * The hand's angle on the card a recipe is laid with in a way, as steered, degrees: [as her right hand takes the card, once
 * it is turned], what the lab's two sliders show (null: no contact grip, no angle). A steering saved with one angle (gripYaw
 * and no gripYawEnd, as every standard saved before the two) keeps that angle all the way, as it was laid when saved.
 */
export function gripYawsOf(recipe: Recipe, steer: Steer, way: Way, before: AsBefore = {}): [number, number] | null {
  if (!recipe.pace.contactGrip) return null;
  if (way !== 'naturlig' || before.recipeGripYaw) { const g = steer.gripYaw ?? recipe.pace.gripYaw ?? 15; return [g, steer.gripYawEnd ?? recipe.pace.gripYawEnd ?? g]; }
  if (before.oneGripYaw || (steer.gripYaw !== null && steer.gripYawEnd == null)) { const g = steer.gripYaw ?? NATURAL_GRIP_YAW; return [g, steer.gripYawEnd ?? g]; }
  return [steer.gripYaw ?? NATURAL_GRIP_YAW_TAKE, steer.gripYawEnd ?? NATURAL_GRIP_YAW];
}

/** "Naturlig", first half: the deal to `target` with the natural hand change, steered by everything but the body, on the doll as "Naturlig" has her (`doll`, returned). Throws where layDeal does. */
export function layNatural(input: {plan: Plan; target: string; recipe: Recipe; pose: PoseFilm; steer: Steer; lens: Lens; doll: Doll; before?: AsBefore}) {
  const {plan, target, recipe, pose, steer, lens} = input, before = input.before ?? {}, doll = dollFor('naturlig', input.doll, before);
  // (the recipe's own angle is left to the recipe, and a second angle is given only where it differs from the first: the deal as it was laid before there were two)
  const yaws = gripYawsOf(recipe, steer, 'naturlig', before), {gripYawEnd: _end, ...rest} = steer;
  const gripYaw = yaws && !(before.recipeGripYaw && steer.gripYaw === null) ? yaws[0] : steer.gripYaw, end = yaws && yaws[1] !== yaws[0] ? {gripYawEnd: yaws[1]} : {};
  const deal = layDeal({plan, target, recipe, pose, steer: {...rest, gripYaw, ...end, body: null}, natural: true}), posed = onDoll(lens, deal, doll);
  return {deal, motion: posed.motion, shortMm: posed.shortMm, doll, before};
}
export type LaidNatural = ReturnType<typeof layNatural>;

/** The body the sliders ask of her laid on as the difference from what the deal asks (`lab.bodyAsked`); null: the deal's own. */
const bodyMore = (body: [number, number, number] | null, asked: [number, number, number]) => body ? body.map((x, k) => Math.round((x - asked[k]) * 1000) / 1000) as [number, number, number] : null;
/**
 * "Naturlig", second half: that deal moved as a person moves. `body`: the body the sliders ask of her at the place
 * (degrees [sideways toward seat 7, the right shoulder forward, forward], as Steer.body; null: the deal's own), laid on
 * as the difference from what the deal asks (`lab.bodyAsked`). `bodyShare`: the least share of that steering any frame
 * took (1: all of it; below 1 where her arms would not reach further).
 */
export function moveNatural(laid: LaidNatural, body: [number, number, number] | null, knobs: Knobs, lens: Lens, landing?: Landing, turn?: TurnId) {
  const {motion: moved, receipt} = natural(lens, laid.motion as never, laid.doll, {body: bodyMore(body, laid.deal.lab.bodyAsked), ...knobs});
  const inHand = turnedInHand(moved as never, laid.doll, turn ?? TURN_DEFAULT), motion = inHand.motion as typeof moved;
  const end = landed(motion, laid.doll, landing ?? {id: LANDING_DEFAULT}, landingTimes(motion as never));
  return {motion: humaneUnless(end.motion, laid.before) as unknown as typeof laid.motion, receipt, bodyShare: Math.min(...receipt.frames.map(f => f.bodyShare)), landing: end.receipt, turn: inHand.receipt};
}

/**
 * A deal and its return to the pose it began in, in one motion (Jakob 2026-11-23, "giv och återgång i en film"): what
 * dealer3d/tools/docka-cykel.ts writes for an order, and the lab shows with "Giv och återgång". `deal` is laid with the
 * standard doll: layNatural's or layDeal's `deal` (`way` "naturlig" or "forut"), or a deal from A2.1 (lay.ts readDeal,
 * `way` "read"). Its return is dealer3d/src/return-cycle.ts's (from A2.1 her left hand is lifted off the card, it laid
 * it; `source` is the file the deal was laid from); the whole is posed on the doll (a deal from A2.1 with the hands as
 * read) and in "Naturlig" moved as a person moves, what the sliders steer going out over the return.
 */
export function withReturn<D extends DealMotion & {lab?: {bodyAsked?: [number, number, number]}}>(deal: D, input: {way: Way | 'read'; body: [number, number, number] | null; knobs: Knobs; lens: Lens; doll: Doll;
  source: {path: string; sha256: string}; cycle?: ReturnCycleOptions; flatHand?: boolean; before?: AsBefore; landing?: Landing; turn?: TurnId}) {
  const {way, lens} = input, read = way === 'read', doll = read ? input.doll : dollFor(way, input.doll, input.before);
  const cycle = buildReturnCycle(deal, input.source, {...input.cycle, ...(read ? {liftHand: 'L' as const} : {})});
  const posed = onDoll(lens, cycle, doll, read ? {hands: 'motion'} : undefined);
  if (way !== 'naturlig') return {cycle, motion: posed.motion, shortMm: posed.shortMm, bodyShare: null, receipt: null, landing: null, turn: null};
  const moved = natural(lens, posed.motion as never, doll, {body: bodyMore(input.body, deal.lab!.bodyAsked!), ...input.knobs, steerOut: [cycle.cycle.liftStarts, cycle.cycle.readyFrom], ...(input.flatHand ? {flatHand: true} : {})});
  const inHand = turnedInHand(moved.motion as never, doll, input.turn ?? TURN_DEFAULT), motion = inHand.motion as typeof moved.motion;
  const end = landed(motion, doll, input.landing ?? {id: LANDING_DEFAULT}, landingTimes(motion as never, cycle.cycle));
  return {cycle, motion: humaneUnless(end.motion, input.before) as unknown as typeof posed.motion, shortMm: posed.shortMm, bodyShare: Math.min(...moved.receipt.frames.map(f => f.bodyShare)), receipt: moved.receipt, landing: end.receipt, turn: inHand.receipt};
}
