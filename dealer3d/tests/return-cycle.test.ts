// The return laid after a deal (src/return-cycle.ts): the arms keep their lengths and the fingers their bones, and the tool
// never writes over a film that is there. Pilot H is the deal it is run on here; what H itself looks like is not held.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { BODY } from '../src/body.ts';
import { length, sub } from '../src/camera.ts';
import { buildReturnCycle } from '../src/return-cycle.ts';
import type { DealFrame, Limb } from '../src/two-hand.ts';

const sourcePath = 'dealer3d/data/giv-fran-2-3-p4-grepp-pilot-h.json';
const sourceBytes = readFileSync(new URL('../data/giv-fran-2-3-p4-grepp-pilot-h.json', import.meta.url));
const sourceSha256 = createHash('sha256').update(sourceBytes).digest('hex');
const source = { path: sourcePath, sha256: sourceSha256 };
const H: { fps: number; frameCount: number; rests: number; frames: DealFrame[]; planSha256: string; places: unknown } = JSON.parse(sourceBytes.toString('utf8'));

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
  }
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
