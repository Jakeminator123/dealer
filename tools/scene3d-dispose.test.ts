// The film queue taken down (createPlayers().dispose in src/scene3d-film.ts), with stand-in video elements: no browser, no media.
// What a React view needs of it: every element the queue made is stopped and emptied, its frame requests and listeners are
// gone, its texture is freed, and nothing the queue does afterwards reaches the page. Also where a part of a chain ends.
import test from 'node:test';
import assert from 'node:assert/strict';

let readyAtStart = 2; // readyState of a new element: 2 = its first frame is decoded
// A video element as far as the queue uses it. An EventTarget, so listeners added with a signal really go when it aborts.
// BareVideo: a browser without frame requests (three and the queue test for the method itself).
class BareVideo extends EventTarget {
  muted = false; playsInline = false; preload = ''; currentTime = 0; readyState = readyAtStart; seeking = false; duration = 2; playbackRate = 1; videoWidth = 1764;
  paused = true; loads = 0; attrs = new Map<string, string>(); requests = new Map<number, (now: number, meta: {mediaTime: number}) => void>(); next = 1;
  get src() { return this.attrs.get('src') ?? ''; } set src(v: string) { this.attrs.set('src', v); }
  removeAttribute(name: string) { this.attrs.delete(name); }
  load() { this.loads++; }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  // the browser presents a frame: every waiting request is answered once
  present(mediaTime = this.currentTime) { const calls = [...this.requests.values()]; this.requests.clear(); for (const call of calls) call(0, {mediaTime}); }
}
class FakeVideo extends BareVideo {
  requestVideoFrameCallback(call: (now: number, meta: {mediaTime: number}) => void) { const id = this.next++; this.requests.set(id, call); return id; }
  cancelVideoFrameCallback(id: number) { this.requests.delete(id); }
}
let made: BareVideo[] = [], withFrameCalls = true;
(globalThis as {document?: unknown}).document = {createElement: (tag: string) => { assert.equal(tag, 'video'); const v = withFrameCalls ? new FakeVideo() : new BareVideo(); made.push(v); return v; }};
const {createPlayers} = await import('../src/scene3d-film.ts');

function queue() {
  made = []; const seen = {shows: 0, changes: 0, textures: [] as {addEventListener(type: string, call: () => void): void}[]};
  const players = createPlayers(texture => { seen.shows++; seen.textures.push(texture); }, () => { seen.changes++; });
  return {players, seen};
}
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const emptied = (v: BareVideo) => v.paused && !v.attrs.has('src') && v.loads > 0 && v.requests.size === 0;

test('dispose empties every element of a playing queue: the one on screen, the next one waiting and the preloaded', async () => {
  const {players, seen} = queue();
  players.play([{path: 'a.mp4'}, {path: 'b.mp4'}], {loop: true}); players.preload(['c.mp4']); await settle();
  assert.equal(seen.shows, 1); assert.equal(made.length, 3); assert.ok(made.some(v => v.requests.size > 0), 'the queue and its textures wait on frames');
  let freed = 0; for (const t of seen.textures) t.addEventListener('dispose', () => freed++);
  players.dispose();
  for (const v of made) assert.ok(emptied(v), `${v.src || 'a video'} is left running, with a source or a frame request`);
  assert.equal(freed, seen.textures.length, 'the texture on screen is freed');
  assert.equal(players.current, null); assert.equal(players.count, 0); assert.equal(players.path, ''); assert.equal(players.part, null); assert.equal(players.frame(), 0); assert.ok(players.paused);
});

test('after dispose a video event, a late frame and every call are harmless and reach nobody', async () => {
  const {players, seen} = queue();
  players.play([{path: 'a.mp4'}]); await settle(); const before = {...seen, count: made.length};
  players.dispose();
  for (const v of made) { v.dispatchEvent(new Event('ended')); v.dispatchEvent(new Event('error')); v.dispatchEvent(new Event('timeupdate')); v.present(1.9); }
  players.play([{path: 'd.mp4'}], {cut: true}); players.preload(['e.mp4']); players.hurry(2); players.toggle(); await players.step(1); await players.seek(0, 0.5);
  await players.load([{path: 'f.mp4'}]); players.dispose(); await settle();
  assert.equal(made.length, before.count, 'no new element after dispose'); assert.equal(seen.shows, before.shows); assert.equal(seen.changes, before.changes);
});

test('a part that waits on its first frame is not shown after dispose, also where the browser has no frame requests', async () => {
  for (const frames of [true, false]) {
    withFrameCalls = frames; const {players, seen} = queue();
    players.play([{path: 'a.mp4'}]); await settle(); made[0].readyState = 0;
    players.play([{path: 'b.mp4'}], {cut: true}); const waiting = made[made.length - 1]; waiting.readyState = 0;
    const shows = seen.shows; players.dispose();
    waiting.readyState = 2; waiting.present(0.02); await new Promise(resolve => setTimeout(resolve, 60)); // past the 40 ms fallback timer
    assert.equal(seen.shows, shows, frames ? 'shown by a frame request' : 'shown by the fallback timer');
    for (const v of made) assert.ok(emptied(v));
  }
  withFrameCalls = true;
});

// ---- where a part ends (enter() in the queue): its last frame is drawn before the next part takes its place --------------
// A frame request is answered in the rendering step that draws that frame, before the scene's own animation frame, so the
// change of film must not come with the last frame itself. Media times as the browser gives them, in whole microseconds.
const at = (frame: number) => Math.round(frame / 30 * 1e6) / 1e6, wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test('a part with an end changes film on the first frame past its last, not on its last', async () => {
  const {players} = queue();
  players.play([{path: 'a.mp4', end: 58}, {path: 'b.mp4'}], {cut: true}); await settle();
  const a = made[0]; assert.equal(players.path, 'a.mp4');
  a.present(at(56)); a.present(at(57)); assert.equal(players.path, 'a.mp4', 'frame 57, the last, is still drawn');
  a.present(at(58)); assert.equal(players.path, 'b.mp4', 'frame 58 (1.933333 s, 57.99999 frames) is past the end: the change comes at once');
  assert.ok(a.paused, 'the part that is done stops where it is'); players.dispose();
});

test('a part that ends with its clip changes film one frame time after its last frame, at the rate it plays, or on ended', async () => {
  const {players} = queue(); // duration 2 s: frames 0 to 59
  players.play([{path: 'a.mp4', rate: 0.5}, {path: 'b.mp4'}, {path: 'c.mp4'}], {cut: true}); await settle();
  const a = made[0]; a.present(at(59)); await wait(30);
  assert.equal(players.path, 'a.mp4', 'at half speed the last frame stays for about 67 ms'); await wait(60);
  assert.equal(players.path, 'b.mp4');
  const b = made.find(v => v.src === 'b.mp4')!; b.present(at(59)); b.dispatchEvent(new Event('ended'));
  assert.equal(players.path, 'c.mp4', 'ended changes at once'); await wait(50); assert.equal(players.path, 'c.mp4', 'and the timer of the last frame does not change again');
  players.dispose();
});

test('a part waiting on the time of its last frame is not changed after dispose or while paused', async () => {
  for (const how of ['dispose', 'pause'] as const) {
    const {players, seen} = queue();
    players.play([{path: 'a.mp4', end: 30}, {path: 'b.mp4'}], {cut: true}); await settle();
    made[0].present(at(29)); const shows = seen.shows; if (how === 'dispose') players.dispose(); else players.toggle(true);
    await wait(60); assert.equal(seen.shows, shows, how); assert.equal(players.path, how === 'dispose' ? '' : 'a.mp4');
    if (how === 'pause') { players.toggle(false); made[0].present(at(30)); assert.equal(players.path, 'b.mp4', 'played on, the frame past the end changes it'); players.dispose(); }
  }
});

test('a chain loaded with load() is taken down too, and a load that is still waiting never shows', async () => {
  const {players, seen} = queue();
  await players.load([{path: 'a.mp4', end: 30}, {path: 'b.mp4'}]); assert.equal(seen.shows, 1);
  players.dispose(); for (const v of made) assert.ok(emptied(v));
  for (const ready of [2, 0]) { // decoded at once (the await is still pending at dispose), or waiting on its data
    readyAtStart = ready; const other = queue();
    const pending = other.players.load([{path: 'c.mp4'}]); other.players.dispose(); made[0].readyState = 2; made[0].dispatchEvent(new Event('loadeddata'));
    await Promise.race([pending, settle()]); assert.equal(other.seen.shows, 0); assert.ok(emptied(made[0]));
  }
  readyAtStart = 2;
});
