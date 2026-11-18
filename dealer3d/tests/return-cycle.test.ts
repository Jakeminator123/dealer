import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { BODY } from '../src/body.ts';
import { add, length, sub, type Vec3 } from '../src/camera.ts';
import { buildReturnCycle } from '../src/return-cycle.ts';
import type { DealFrame, Limb } from '../src/two-hand.ts';

const sourcePath = 'dealer3d/data/giv-fran-2-3-p4-grepp-pilot-h.json';
const sourceBytes = readFileSync(new URL('../data/giv-fran-2-3-p4-grepp-pilot-h.json', import.meta.url));
const sourceSha256 = '93b713c4c9a17f390b6ac54aaa86f34e8a8eb9e3510ceedc63d21f62007ee3c1';
const source = { path: sourcePath, sha256: sourceSha256 };
const H: { fps: number; frameCount: number; rests: number; frames: DealFrame[]; planSha256: string; places: unknown } = JSON.parse(sourceBytes.toString('utf8'));

test('H return keeps the deal, releases the wrist upward and restores the exact actor and gaze', () => {
  assert.equal(createHash('sha256').update(sourceBytes).digest('hex'), sourceSha256);
  const cycle = buildReturnCycle(H, source);
  const { holdThrough, liftStarts, liftEnds, readyFrom } = cycle.cycle;
  assert.deepEqual({ holdThrough, liftStarts, liftEnds, readyFrom, frames: cycle.frameCount }, {
    holdThrough: 76, liftStarts: 77, liftEnds: 82, readyFrom: 116, frames: 120,
  });
  assert.equal(cycle.frames.length, 120);
  assert.equal(cycle.planSha256, H.planSha256);
  assert.deepEqual(cycle.places, H.places);
  assert.deepEqual(cycle.frames.slice(0, liftStarts), H.frames.slice(0, liftStarts));
  assert.equal(H.frames.length, 90);
  const held = H.frames[holdThrough];
  assert.ok(cycle.frames[liftStarts].R.w[1] > held.R.w[1]);
  for (const axis of [0, 2]) {
    assert.ok(Math.abs(cycle.frames[liftEnds].R.w[axis] - held.R.w[axis]) < 1e-9);
  }
  assert.ok(Math.abs(cycle.frames[liftEnds].R.w[1] - held.R.w[1] - 0.022) < 1e-9);
  for (const frame of cycle.frames.slice(liftStarts)) assert.deepEqual(frame.card, held.card);
  for (const frame of cycle.frames.slice(readyFrom)) assert.deepEqual(frame, { ...H.frames[0], card: held.card });
  assert.deepEqual(buildReturnCycle(H, source), cycle);
});

function checkArm(limb: Limb, held: Limb) {
  assert.ok(Math.abs(length(sub(limb.e, limb.s)) - BODY.upperArm) < 1e-9);
  assert.ok(Math.abs(length(sub(limb.w, limb.e)) - BODY.forearm) < 1e-9);
  assert.deepEqual(limb.p[0], limb.w);
  for (const [a, b] of [[2, 3], [5, 6], [6, 7], [7, 8], [9, 10], [13, 14], [17, 18]]) {
    assert.ok(Math.abs(length(sub(limb.p[a], limb.p[b])) - length(sub(held.p[a], held.p[b]))) < 1e-9);
  }
}

test('the lowered return uses solved arm lengths and preserves finger bones', () => {
  const cycle = buildReturnCycle(H, source);
  const held = H.frames[cycle.cycle.holdThrough];
  const end = H.frames[0].R;
  for (const frame of cycle.frames.slice(cycle.cycle.liftStarts, cycle.cycle.readyFrom)) {
    checkArm(frame.L, held.L);
    checkArm(frame.R, held.R);
    assert.ok(frame.R.w[1] <= Math.max(held.R.w[1], end.w[1]) + cycle.cycle.liftMeters + 1e-9);
    assert.ok(frame.R.e[1] < 0.11, 'right elbow stays low through the H return');
  }
});

test('a different target stays where its own deal put it', () => {
  const frames = H.frames.map((frame, i) => {
    const offset: Vec3 = [0.06 * Math.min(1, i / H.rests), 0, -0.03];
    const move = (point: Vec3) => add(point, offset);
    const moveLimb = ({ s, e, w, p, k }: Limb): Limb => ({ s: move(s), e: move(e), w: move(w), p: p.map(move), k });
    return { L: moveLimb(frame.L), R: moveLimb(frame.R), h: move(frame.h), g: move(frame.g), card: { ...frame.card, c: move(frame.card.c) } };
  });
  const cycle = buildReturnCycle({ ...H, frames }, source, { holdThrough: 74, readyFrom: 111, durationSeconds: 3.8 });
  const first = cycle.frames[0];
  const laid = frames[74].card;
  assert.notDeepEqual(laid.c, H.frames[74].card.c);
  assert.equal(cycle.frames.length, 114);
  assert.deepEqual(cycle.frames[111], { ...first, card: laid });
  for (const frame of cycle.frames.slice(74)) assert.deepEqual(frame.card, laid);
});

test('rejects early holds, moving cards, missing ready time and an unreachable wrist', () => {
  assert.throws(() => buildReturnCycle(H, source, { holdThrough: 69 }), /settled card/);
  assert.throws(() => buildReturnCycle({ ...H, rests: 69 }, source), /flat and stationary/);
  const frames = structuredClone(H.frames);
  frames[80].card.c[0] += 0.01;
  assert.throws(() => buildReturnCycle({ ...H, frames }, source), /flat and stationary/);
  frames[80].card.id += 1;
  assert.throws(() => buildReturnCycle({ ...H, frames }, source), /single-card deal/);
  assert.throws(() => buildReturnCycle(H, source, { readyFrom: 78 }), /lift and return/);
  assert.throws(() => buildReturnCycle(H, source, { durationSeconds: 4.01 }), /aligned to the source FPS/);
  assert.throws(() => buildReturnCycle(H, source, { liftMeters: 1 }), /Unreachable R wrist at frame/);
});

test('a short cycle leaves time after the lift and rejects a snap into the ready pose', () => {
  assert.throws(() => buildReturnCycle(H, source, { holdThrough: 76, readyFrom: 79, durationSeconds: 83 / 30 }), /lift and return/);
  assert.throws(() => buildReturnCycle(H, source, { holdThrough: 76, readyFrom: 86, durationSeconds: 90 / 30 }), /return moves too far/);
  const quick = buildReturnCycle(H, source, { holdThrough: 76, readyFrom: 106, durationSeconds: 3.6 });
  assert.equal(quick.cycle.liftEnds, 82);
  assert.deepEqual(quick.frames[106], { ...H.frames[0], card: H.frames[76].card });
  assert.ok(length(sub(quick.frames[106].R.p[8], quick.frames[105].R.p[8])) < 0.001);
});

test('CLI writes new motion with source provenance and refuses replacement', () => {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const folder = mkdtempSync(path.join(tmpdir(), 'dealer-return-cycle-'));
  const out = path.join(folder, 'cycle.json');
  const invoke = () => spawnSync(process.execPath, [
    'dealer3d/tools/return-cycle.ts', sourcePath, out, '--hold', '76', '--ready', '106', '--duration', '3.6', '--lift', '0.02',
  ], { cwd: root, encoding: 'utf8', windowsHide: true });
  try {
    const first = invoke();
    assert.equal(first.status, 0, first.stderr);
    const bytes = readFileSync(out);
    const produced = JSON.parse(bytes.toString('utf8'));
    assert.equal(produced.frameCount, 108);
    assert.equal(produced.cycle.readyFrom, 106);
    assert.equal(produced.cycle.liftMeters, 0.02);
    assert.equal(produced.cycle.source, sourcePath);
    assert.equal(produced.cycle.sourceSha256, sourceSha256);
    assert.deepEqual(produced.frames[107], { ...H.frames[0], card: H.frames[76].card });
    const retry = invoke();
    assert.notEqual(retry.status, 0);
    assert.match(retry.stderr, /EEXIST/);
    assert.deepEqual(readFileSync(out), bytes);
  } finally {
    try { unlinkSync(out); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    rmdirSync(folder);
  }
});
