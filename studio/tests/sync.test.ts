// Frame arithmetic of the film player and of Jämför's second film (studio/lib/sync.ts).
// Run from the repo root: node --test "studio/tests/sync.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FOLLOW,
  anchors,
  canAlignLanding,
  clampFrame,
  filmRange,
  follow,
  frameLabel,
  frameOfMediaTime,
  frameOfTime,
  partnerFrame,
  partnerPosition,
  playbackRate,
  rangeLength,
  seekTime,
  stepFrame,
  type Clip,
} from "../lib/sync.ts";

const clip = (extra: Partial<Clip> = {}): Clip => ({ fps: 30, range: { start: 0, end: 119 }, speed: 1, landing: null, ...extra });

test("a seek lands on the frame asked for, and reads back as it", () => {
  for (const fps of [24, 30, 60]) {
    for (const frame of [0, 1, 29, 88, 119, 359]) {
      assert.equal(frameOfTime(seekTime(frame, fps), fps), frame, `${frame} @ ${fps}`);
      // requestVideoFrameCallback reports the frame's own timestamp.
      assert.equal(frameOfMediaTime(frame / fps, fps), frame, `${frame} @ ${fps}`);
    }
  }
  assert.equal(seekTime(88, 30), 88.5 / 30);
  // A timestamp a hair off still names the frame.
  assert.equal(frameOfMediaTime(88 / 30 + 0.004, 30), 88);
  assert.equal(frameOfMediaTime(88 / 30 - 0.004, 30), 88);
  assert.equal(frameOfTime(0, 30), 0);
});

test("a frame's start time rounded to whole microseconds (as browsers give it) still names that frame", () => {
  // With a margin of a millionth, every third frame at 30 fps read one too low (1/30 s comes back as 0.033333 s).
  for (const fps of [24, 25, 30, 60]) {
    for (let frame = 0; frame < 600; frame++) {
      const micro = Math.round((frame / fps) * 1e6) / 1e6;
      assert.equal(frameOfTime(micro, fps), frame, `${frame} @ ${fps}: ${micro}`);
      // The end of a frame stays in it: a hundredth of a frame before the next one starts.
      assert.equal(frameOfTime(Math.round(((frame + 0.99) / fps) * 1e6) / 1e6, fps), frame, `end of ${frame} @ ${fps}`);
    }
  }
  // The same rule as the scene's frameAtTime (src/scene3d-film.ts): floor(seconds × fps + 1e-3).
  assert.equal(frameOfTime(0.033333, 30), 1);
  assert.equal(frameOfTime(0.066666, 30), 2);
  assert.equal(frameOfTime(2.966666, 30), 89);
});

test("ranges: the whole film, or frames A–B of a longer one", () => {
  assert.deepEqual(filmRange(120), { start: 0, end: 119 });
  assert.equal(filmRange(null), null);
  assert.equal(filmRange(0), null);
  assert.deepEqual(filmRange(360, { start: 0, end: 50 }), { start: 0, end: 50 });
  assert.deepEqual(filmRange(178, { start: 117, end: 200 }), { start: 117, end: 177 }); // never past the file
  assert.deepEqual(filmRange(null, { start: 3, end: 52 }), { start: 3, end: 52 });
  assert.equal(filmRange(100, { start: 120, end: 130 }), null);
  assert.equal(rangeLength({ start: 117, end: 177 }), 61);
  assert.equal(clampFrame(-3, { start: 0, end: 119 }), 0);
  assert.equal(clampFrame(130, { start: 0, end: 119 }), 119);
  assert.equal(stepFrame(119, 1, { start: 0, end: 119 }), 119);
  assert.equal(stepFrame(117, -1, { start: 117, end: 177 }), 117);
  assert.equal(stepFrame(88, -10, { start: 0, end: 119 }), 78);
});

test("the counter and the rate", () => {
  assert.equal(frameLabel(88, { start: 0, end: 119 }, 120), "ruta 88 / 120");
  assert.equal(frameLabel(130, { start: 117, end: 177 }, 178), "ruta 130 · 117–177");
  assert.equal(frameLabel(5, null, null), "ruta 5");
  assert.equal(playbackRate(0.5), 0.5);
  assert.equal(playbackRate(0.5, 2), 1); // a clip made in slow motion is watched at twice the speed
  assert.equal(playbackRate(1, 0), 1);
});

test("aligned on the start: same frame, same pace", () => {
  const a = clip();
  const b = clip({ range: { start: 0, end: 89 } });
  assert.deepEqual(partnerFrame(a, b, 0, "start"), { frame: 0, hold: null });
  assert.deepEqual(partnerFrame(a, b, 88, "start"), { frame: 88, hold: null });
  assert.deepEqual(partnerFrame(a, b, 89, "start"), { frame: 89, hold: null });
  // B is shorter: it holds its last frame while A goes on.
  assert.deepEqual(partnerFrame(a, b, 90, "start"), { frame: 89, hold: "after" });
  assert.deepEqual(partnerFrame(a, b, 119, "start"), { frame: 89, hold: "after" });
  // Landing asked for but missing: the start is used.
  assert.equal(anchors(a, b, "landing").align, "start");
  assert.equal(canAlignLanding(a, b), false);
});

test("aligned on the landing frame", () => {
  const a = clip({ landing: 105 });
  const b = clip({ landing: 88 });
  assert.equal(canAlignLanding(a, b), true);
  assert.deepEqual(anchors(a, b, "landing"), { a: 105, b: 88, align: "landing" });
  assert.deepEqual(partnerFrame(a, b, 105, "landing"), { frame: 88, hold: null });
  assert.deepEqual(partnerFrame(a, b, 17, "landing"), { frame: 0, hold: null });
  // Before B has started, B waits on its first frame.
  assert.deepEqual(partnerFrame(a, b, 16, "landing"), { frame: 0, hold: "before" });
  assert.deepEqual(partnerFrame(a, b, 0, "landing"), { frame: 0, hold: "before" });
  assert.deepEqual(partnerFrame(a, b, 119, "landing"), { frame: 102, hold: null });
  // A landing outside its own range cannot anchor.
  assert.equal(canAlignLanding(clip({ landing: 130 }), b), false);
});

test("frames A–B of a longer film follow their own numbering", () => {
  const a = clip();
  const b = clip({ range: { start: 117, end: 177 } }); // a derived take
  assert.deepEqual(partnerFrame(a, b, 0, "start"), { frame: 117, hold: null });
  assert.deepEqual(partnerFrame(a, b, 60, "start"), { frame: 177, hold: null });
  assert.deepEqual(partnerFrame(a, b, 61, "start"), { frame: 177, hold: "after" });
  // The other way round: B before its start never shows a frame outside its range.
  assert.deepEqual(partnerFrame(b, a, 117, "start"), { frame: 0, hold: null });
  assert.deepEqual(partnerFrame(b, a, 150, "start"), { frame: 33, hold: null });
});

test("other fps and speeds keep the same time", () => {
  // B at 24 fps: 24 of its frames pass while A passes 30.
  const a = clip();
  const b = clip({ fps: 24, range: { start: 0, end: 95 } });
  assert.equal(partnerPosition(a, b, 30, "start"), 24);
  assert.deepEqual(partnerFrame(a, b, 30, "start"), { frame: 24, hold: null });
  assert.deepEqual(partnerFrame(a, b, 29, "start"), { frame: 23, hold: null });
  // B made in slow motion (meant to be watched at 2×): it moves two frames for A's one.
  const slow = clip({ speed: 2, range: { start: 0, end: 239 } });
  assert.deepEqual(partnerFrame(a, slow, 10, "start"), { frame: 21, hold: null });
  assert.equal(partnerPosition(a, slow, 10, "start"), 20);
  assert.equal(partnerPosition(slow, a, 20, "start"), 10);
});

test("following: hold where B has no frame, seek when far off or stopped", () => {
  const range = { start: 0, end: 89 };
  const base = 0.5;
  assert.deepEqual(follow({ expected: 95, actual: 80, rate: base, base, fps: 30, range, playing: true }), { action: "hold", frame: 89 });
  assert.deepEqual(follow({ expected: 95, actual: 89.5, rate: base, base, fps: 30, range, playing: false }), { action: "none" });
  assert.deepEqual(follow({ expected: -2, actual: 0.5, rate: base, base, fps: 30, range, playing: false }), { action: "none" });
  assert.deepEqual(follow({ expected: -2, actual: 0.5, rate: base, base, fps: 30, range, playing: true }), { action: "hold", frame: 0 });
  // B stopped at its end while A looped back: seek and play again.
  assert.deepEqual(follow({ expected: 2.4, actual: 89.5, rate: base, base, fps: 30, range, playing: false }), { action: "seek", frame: 2 });
  // B stopped on its last frame while A still shows the frame that matches it: leave it.
  assert.deepEqual(follow({ expected: 89.7, actual: 89.5, rate: base, base, fps: 30, range, playing: false }), { action: "none" });
  // Stopped anywhere else while A plays: seek and play.
  assert.deepEqual(follow({ expected: 40.5, actual: 40.5, rate: base, base, fps: 30, range, playing: false }), { action: "seek", frame: 40 });
  assert.deepEqual(follow({ expected: 40.2, actual: 40.2 - FOLLOW.seekAt, rate: base, base, fps: 30, range, playing: true }), { action: "seek", frame: 40 });
});

test("following: within a frame nothing happens, a frame off is nudged back", () => {
  const range = { start: 0, end: 119 };
  const base = 0.5;
  assert.deepEqual(follow({ expected: 40.6, actual: 40.2, rate: base, base, fps: 30, range, playing: true }), { action: "none" });
  // One frame behind: faster, closing the gap in about half a second.
  const behind = follow({ expected: 41.2, actual: 40.2, rate: base, base, fps: 30, range, playing: true });
  assert.equal(behind.action, "rate");
  assert.ok(behind.action === "rate" && Math.abs(behind.rate - (base + 1 / (30 * FOLLOW.catchSeconds))) < 1e-9);
  // Ahead: slower.
  const ahead = follow({ expected: 40.2, actual: 42.2, rate: base, base, fps: 30, range, playing: true });
  assert.ok(ahead.action === "rate" && ahead.rate < base);
  // Never more than twice or less than half its own rate.
  const far = follow({ expected: 45, actual: 40, rate: 0.25, base: 0.25, fps: 30, range, playing: true });
  assert.ok(far.action === "rate" && far.rate === 0.5);
  // While nudged it keeps on until it is within a quarter frame, then gets its own rate back.
  const still = follow({ expected: 40.6, actual: 40.2, rate: 0.6, base, fps: 30, range, playing: true });
  assert.equal(still.action, "rate");
  assert.deepEqual(follow({ expected: 40.3, actual: 40.2, rate: 0.6, base, fps: 30, range, playing: true }), { action: "rate", rate: base });
});
