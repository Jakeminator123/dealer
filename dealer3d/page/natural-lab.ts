// The doll lab's two ways of dealing (Jakob 2026-11-23, "vissa aningen konstiga ställningar görs lite naturligare som
// standard", for Paow), for dealer3d/page/docka.ts. Pure: no I/O and no three.js.
// - "Naturlig": the deal laid from its recipe with the natural hand change (lay.ts `natural`), as steered but for the
//   body, posed on the doll (pose-on-doll.ts) and moved as a person moves (dealer3d/src/natural.ts), with the body's
//   sliders, the shoulders and the elbows laid on the doll herself as far as her arms reach: a slider there never makes
//   the deal fail.
// - "Som förut": the deal as the lab laid it before (lay.ts without `natural`), posed on the doll.
import {layDeal, type PoseFilm, type Recipe, type Steer} from './lay.ts';
import {poseOnDoll} from './pose-on-doll.ts';
import {natural} from '../src/natural.ts';
import type {Plan} from '../src/world.ts';
import type {Lens} from '../src/camera.ts';
import type {Doll} from '../src/doll.ts';

export type Way = 'naturlig' | 'forut';
/** What only "Naturlig" steers: each shoulder [up, forward] centimetres, each elbow out from her side [right, left] degrees (dealer3d/src/natural.ts NaturalSteer). */
export type Knobs = {shoulderR: [number, number]; shoulderL: [number, number]; elbowOut: [number, number]};
export const NO_KNOBS: Knobs = {shoulderR: [0, 0], shoulderL: [0, 0], elbowOut: [0, 0]};
type Posed = {motion: {frames: unknown[]; frameCount: number}; receipt: {frames: {shortMm: [number, number]}[]}};

/** A motion made with the standard doll, on `doll`; and how far her arm is too short at the worst, millimetres. */
export function onDoll<M extends object>(lens: Lens, motion: M, doll: Doll): {motion: M & {doll: string}; shortMm: number} {
  if (doll.name === 'standard') return {motion: {...motion, doll: 'standard'}, shortMm: 0};
  const posed = poseOnDoll(lens, motion as never, doll) as unknown as Posed;
  return {motion: posed.motion as unknown as M & {doll: string}, shortMm: Math.max(0, ...posed.receipt.frames.flatMap(f => f.shortMm))};
}

/** "Naturlig", first half: the deal to `target` with the natural hand change, steered by everything but the body, on the doll. Throws where layDeal does. */
export function layNatural(input: {plan: Plan; target: string; recipe: Recipe; pose: PoseFilm; steer: Steer; lens: Lens; doll: Doll}) {
  const {plan, target, recipe, pose, steer, lens, doll} = input;
  const deal = layDeal({plan, target, recipe, pose, steer: {...steer, body: null}, natural: true}), posed = onDoll(lens, deal, doll);
  return {deal, motion: posed.motion, shortMm: posed.shortMm};
}
export type LaidNatural = ReturnType<typeof layNatural>;

/**
 * "Naturlig", second half: that deal moved as a person moves. `body`: the body the sliders ask of her at the place
 * (degrees [sideways toward seat 7, the right shoulder forward, forward], as Steer.body; null: the deal's own), laid on
 * as the difference from what the deal asks (`lab.bodyAsked`). `bodyShare`: the least share of that steering any frame
 * took (1: all of it; below 1 where her arms would not reach further).
 */
export function moveNatural(laid: LaidNatural, body: [number, number, number] | null, knobs: Knobs, lens: Lens, doll: Doll) {
  const asked = laid.deal.lab.bodyAsked, more = body ? body.map((x, k) => Math.round((x - asked[k]) * 1000) / 1000) as [number, number, number] : null;
  const {motion, receipt} = natural(lens, laid.motion as never, doll, {body: more, ...knobs});
  return {motion: motion as typeof laid.motion, receipt, bodyShare: Math.min(...receipt.frames.map(f => f.bodyShare))};
}
