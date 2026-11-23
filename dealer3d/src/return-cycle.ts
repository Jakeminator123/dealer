import { arm, BODY } from './body.ts';
import { length, sub, type Vec3 } from './camera.ts';
import { axesOf, between, local, placed, shapeBetween } from './hand-pose.ts';
import type { CardAt, DealFrame, Limb } from './two-hand.ts';

export type DealMotion = {
  fps: number;
  frameCount: number;
  rests: number;
  frames: readonly DealFrame[];
};

export type ReturnCycleOptions = {
  holdThrough?: number;
  readyFrom?: number;
  durationSeconds?: number;
  liftMeters?: number;
  /** The hand that laid the card and is lifted off it: the right (two-hand deals from A2.3, the default) or the left (the one-hand deals read from Pamela's film, A2.1). */
  liftHand?: 'L' | 'R';
};

type Source = { path: string; sha256: string };

function vector(value: unknown): value is Vec3 {
  return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
}

function limb(value: Limb | undefined): value is Limb {
  return !!value && vector(value.s) && vector(value.e) && vector(value.w) && Number.isFinite(value.k) &&
    Array.isArray(value.p) && value.p.length === 21 && value.p.every(vector);
}

function sameCard(a: CardAt, b: CardAt): boolean {
  return a.id === b.id && a.c.every((x, i) => x === b.c[i]) &&
    a.l.every((x, i) => x === b.l[i]) && a.n.every((x, i) => x === b.n[i]);
}

function atRest(card: CardAt): boolean {
  // World coordinates are in metres. A laid card is flat on the felt at y=0.
  return Math.abs(card.c[1]) <= 0.001 && Math.abs(card.l[1]) <= 0.001 && Math.abs(length(card.l) - 1) <= 0.001 &&
    Math.abs(card.n[0]) <= 0.001 && Math.abs(card.n[1] - 1) <= 0.001 && Math.abs(card.n[2]) <= 0.001;
}

function validateMotion(motion: DealMotion): void {
  if (!motion || !Number.isSafeInteger(motion.fps) || motion.fps < 1 ||
      !Array.isArray(motion.frames) || motion.frames.length !== motion.frameCount ||
      !Number.isSafeInteger(motion.rests) || motion.rests < 1 || motion.rests >= motion.frameCount - 1) {
    throw new Error('Expected a timed deal with at least two frames of a settled card');
  }
  const cardId = motion.frames[0]?.card?.id;
  // A deal read from a film (dealer3d/data/giv-pamela-*.json) has no gaze point g in any frame; a laid deal has it in every frame.
  const gazes = motion.frames[0]?.g !== undefined;
  for (const [i, frame] of motion.frames.entries()) {
    const card = frame?.card;
    if (!card || !Number.isSafeInteger(card.id) || card.id !== cardId ||
        !vector(card.c) || !vector(card.l) || !vector(card.n) ||
        !limb(frame.L) || !limb(frame.R) || !vector(frame.h) || (gazes ? !vector(frame.g) : frame.g !== undefined)) {
      throw new Error(`Invalid single-card deal at frame ${i}`);
    }
  }
  const laid = motion.frames[motion.rests].card;
  if (!atRest(laid) || !motion.frames.slice(motion.rests).every(frame => sameCard(frame.card, laid))) {
    throw new Error('The card is not flat and stationary from the declared rest frame');
  }
}

function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function ease(t: number): number {
  return t * t * t * (10 + t * (-15 + 6 * t));
}

function checkBoneLengths(shoulder: Vec3, elbow: Vec3, wrist: Vec3, name: string, frame: number, tolerance: number) {
  if (Math.abs(length(sub(elbow, shoulder)) - BODY.upperArm) > tolerance ||
      Math.abs(length(sub(wrist, elbow)) - BODY.forearm) > tolerance) {
    throw new Error(`Invalid ${name} arm bones at frame ${frame}`);
  }
}

// This is a continuity ceiling for the generated return, in metres/second for each tracked body or hand point.
const MAX_RETURN_POINT_SPEED = 2;

function checkReturnStep(from: DealFrame, to: DealFrame, fps: number, frame: number) {
  const movesTooFar = (a: Vec3, b: Vec3) => length(sub(a, b)) > MAX_RETURN_POINT_SPEED / fps;
  const armMovesTooFar = (a: Limb, b: Limb) => movesTooFar(a.s, b.s) || movesTooFar(a.e, b.e) || a.p.some((p, i) => movesTooFar(p, b.p[i]));
  if (movesTooFar(from.h, to.h) || armMovesTooFar(from.L, to.L) || armMovesTooFar(from.R, to.R)) {
    throw new Error(`The return moves too far into frame ${frame} at ${fps} fps; allow more time to return`);
  }
}

function returningLimb(from: Limb, to: Limb, side: 'L' | 'R', fromFrame: number) {
  if ([from, to].some(limb => length(sub(limb.p[0], limb.w)) > 0.0002)) throw new Error(`Detached ${side} hand pose`);
  const sign = side === 'R' ? 1 : -1;
  const fromAxes = axesOf(from.p, sign);
  const toAxes = axesOf(to.p, sign);
  if ([fromAxes, toAxes].some(axes => length(axes.across) < 0.99)) throw new Error(`Degenerate ${side} hand pose`);
  const fromShape = local(from.p, fromAxes);
  const toShape = local(to.p, toAxes);
  const fromPole = sub(from.e, from.s);
  const toPole = sub(to.e, to.s);
  // Imported poses can be rounded to four decimal places.
  checkBoneLengths(from.s, from.e, from.w, side, fromFrame, 0.0002);
  checkBoneLengths(to.s, to.e, to.w, side, 0, 0.0002);

  return (t: number, lift: number, frame: number): Limb => {
    const shoulder = lerp(from.s, to.s, t);
    const wrist = lerp(from.w, to.w, t);
    wrist[1] += lift;
    const result = arm(shoulder, wrist, lerp(fromPole, toPole, t));
    if (!result.reached) throw new Error(`Unreachable ${side} wrist at frame ${frame}`);
    checkBoneLengths(shoulder, result.elbow, result.wrist, side, frame, 1e-9);
    return {
      s: shoulder, e: result.elbow, w: result.wrist,
      k: from.k + (to.k - from.k) * t,
      p: placed(shapeBetween(fromShape, toShape, t), between(fromAxes, toAxes, t), result.wrist),
    };
  };
}

/** Preserve the deal through the hold, then return the actor to frame zero while the laid card stays on the table. */
export function buildReturnCycle<T extends DealMotion>(motion: T, source: Source, options: ReturnCycleOptions = {}) {
  validateMotion(motion);
  const { fps } = motion;
  const holdThrough = options.holdThrough ?? motion.rests + Math.max(1, Math.round(fps / 5));
  const readyFrom = options.readyFrom ?? holdThrough + Math.max(3, Math.round(fps * 4 / 3));
  const durationSeconds = options.durationSeconds ?? (readyFrom + Math.max(1, Math.round(fps * 2 / 15))) / fps;
  const liftMeters = options.liftMeters ?? 0.022;
  const liftHand = options.liftHand ?? 'R';
  if (liftHand !== 'L' && liftHand !== 'R') throw new Error('The lifted hand is L or R');
  const frameCount = Math.round(durationSeconds * fps);
  if (!Number.isSafeInteger(holdThrough) || holdThrough < motion.rests || holdThrough >= motion.frameCount) {
    throw new Error('The hold must end at an existing frame at or after the settled card');
  }
  const liftEnds = holdThrough + Math.max(1, Math.round(fps / 5));
  if (!Number.isSafeInteger(readyFrom) || readyFrom < liftEnds + 2 || readyFrom >= frameCount ||
      !Number.isSafeInteger(frameCount) || frameCount >= 2 ** 32 || Math.abs(frameCount - durationSeconds * fps) > 1e-6) {
    throw new Error('Expected time to lift and return, a ready frame, and a duration aligned to the source FPS');
  }
  if (!Number.isFinite(liftMeters) || liftMeters <= 0) throw new Error('Lift height must be positive and finite');

  const start = motion.frames[0];
  const hold = motion.frames[holdThrough];
  const ready = { ...start, card: hold.card };
  const returnLeft = returningLimb(hold.L, start.L, 'L', holdThrough);
  const returnRight = returningLimb(hold.R, start.R, 'R', holdThrough);
  const frames = motion.frames.slice(0, holdThrough + 1);
  for (let i = holdThrough + 1; i < readyFrom; i++) {
    const t = i <= liftEnds ? 0 : ease((i - liftEnds) / (readyFrom - liftEnds));
    const lift = i <= liftEnds ? liftMeters * ease((i - holdThrough) / (liftEnds - holdThrough)) : liftMeters * (1 - t);
    frames.push({
      ...hold,
      L: returnLeft(t, liftHand === 'L' ? lift : 0, i),
      R: returnRight(t, liftHand === 'R' ? lift : 0, i),
      h: lerp(hold.h, start.h, t),
      ...(hold.g ? { g: lerp(hold.g, start.g, t) } : {}),
    });
  }
  for (let i = readyFrom; i < frameCount; i++) frames.push(ready);
  for (let i = holdThrough + 1; i <= readyFrom; i++) checkReturnStep(frames[i - 1], frames[i], fps, i);

  return {
    ...motion,
    frameCount,
    frames,
    cycle: {
      source: source.path,
      sourceSha256: source.sha256,
      holdThrough,
      liftStarts: holdThrough + 1,
      liftEnds,
      readyFrom,
      durationSeconds: frameCount / fps,
      liftMeters,
      ...(liftHand === 'L' ? { liftHand } : {}),
      method: 'Vertical wrist lift, eased reach to the original pose, and solved arm joints. The laid card remains on the table.',
    },
  };
}
