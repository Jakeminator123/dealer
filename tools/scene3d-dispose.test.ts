// The film queue taken down (createPlayers().dispose in src/scene3d-film.ts), with stand-in video elements: no browser, no media.
// What a React view needs of it: every element the queue made is stopped and emptied, its frame requests and listeners are
// gone, its texture is freed, and nothing the queue does afterwards reaches the page. Also where a part of a chain ends and starts.
import test from 'node:test';
import assert from 'node:assert/strict';

let readyAtStart = 2; // readyState of a new element: 2 = its first frame is decoded
let refuse: string | null = null; // the name of the error a film with sound is refused with when it is started, as a browser does
// A video element as far as the queue uses it. An EventTarget, so listeners added with a signal really go when it aborts.
// BareVideo: a browser without frame requests (three and the queue test for the method itself).
class BareVideo extends EventTarget {
  muted = false; playsInline = false; preload = ''; currentTime = 0; readyState = readyAtStart; seeking = false; duration = 2; playbackRate = 1; videoWidth = 1764;
  paused = true; loads = 0; attrs = new Map<string, string>(); requests = new Map<number, (now: number, meta: {mediaTime: number}) => void>(); next = 1;
  get src() { return this.attrs.get('src') ?? ''; } set src(v: string) { this.attrs.set('src', v); }
  removeAttribute(name: string) { this.attrs.delete(name); }
  load() { this.loads++; }
  play() { if (refuse && !this.muted) return Promise.reject(Object.assign(Error(refuse), {name: refuse})); this.paused = false; return Promise.resolve(); }
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

function queue(hooks: Parameters<typeof createPlayers>[2] = {}) {
  made = []; const seen = {shows: 0, changes: 0, textures: [] as {addEventListener(type: string, call: () => void): void}[]};
  const players = createPlayers(texture => { seen.shows++; seen.textures.push(texture); }, () => { seen.changes++; }, hooks);
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

// ---- the frame the queue reports (players.frame, step): the same rule as where a part ends --------------------------------
test('every frame start in whole microseconds reads as its own frame, by the one rule, and players.frame follows it', async () => {
  const {frameAtTime} = await import('../src/scene3d-film.ts');
  for (let f = 0; f < 300; f++) { assert.equal(frameAtTime(at(f)), f, `frame ${f} at ${at(f)} s`); assert.equal(frameAtTime((f + 0.5) / 30), f); assert.equal(frameAtTime(at(f + 1) - 1e-4), f, `a tenth of a millisecond before frame ${f + 1}`); }
  assert.equal(frameAtTime(Math.round(58 / 25 * 1e6) / 1e6, 25), 58, 'a film at its own rate');
  const {players} = queue();
  players.play([{path: 'a.mp4'}], {cut: true}); await settle();
  const a = made[0], misread: number[] = [];
  for (let f = 0; f < 60; f++) { a.currentTime = at(f); if (players.frame() !== f) misread.push(f); }
  assert.deepEqual(misread, [], 'frames players.frame() read one too low');
  a.currentTime = at(58); players.toggle(true); const stepped = players.step(1);
  assert.equal(a.currentTime, (59 + 0.5) / 30, 'a step goes from frame 58, not 57');
  a.dispatchEvent(new Event('seeked')); a.present(); await stepped; assert.equal(players.frame(), 59);
  players.dispose();
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

test('a film that cannot be read is a gap: the chain plays what is left and ends, and the next chain goes straight in', async () => {
  withFrameCalls = true;
  for (const early of [true, false]) { // the error comes while the film is only being fetched ahead, or once its part has been entered
    readyAtStart = 2; const {players} = queue(), shown: number[] = [], errors: string[] = []; let ended = 0;
    players.play([{path: 'a.mp4'}, {path: 'b.mp4'}, {path: 'c.mp4'}], {onPart: index => shown.push(index), onEnd: () => ended++, onError: error => errors.push(error.message)}); await settle();
    assert.deepEqual(shown, [0]); const b = made.find(v => v.src === 'b.mp4')!; assert.ok(b, 'the next part is fetched ahead');
    if (early) b.dispatchEvent(new Event('error')); else b.readyState = 0; // not decoded yet: its part will wait on its first frame
    made.find(v => v.src === 'a.mp4')!.dispatchEvent(new Event('ended')); await settle();
    if (!early) { assert.deepEqual(shown, [0], 'the second part waits on its first frame'); b.dispatchEvent(new Event('error')); await settle(); }
    assert.deepEqual(shown, [0, 2], 'the third part plays in the second one\'s place'); assert.equal(errors.length, 1); assert.match(errors[0], /b\.mp4/); assert.equal(ended, 0);
    made.find(v => v.src === 'c.mp4')!.dispatchEvent(new Event('ended')); await settle();
    assert.equal(ended, 1, 'the chain ends'); players.dispose();
  }
  // one part alone that cannot be read: the chain ends at once, and a chain asked for after it goes in without waiting behind it
  readyAtStart = 0; const {players, seen} = queue(); let ended = 0, errors = 0;
  players.play([{path: 'gone.mp4'}], {onEnd: () => ended++, onError: () => errors++}); await settle(); assert.equal(seen.shows, 0);
  made[0].dispatchEvent(new Event('error')); await settle(); assert.equal(errors, 1); assert.equal(ended, 1);
  readyAtStart = 2; players.play([{path: 'next.mp4'}]); await settle(); assert.equal(seen.shows, 1, 'the next chain is on screen'); assert.equal(players.path, 'next.mp4');
  // a loop of nothing but gaps ends instead of going round for ever
  readyAtStart = 0; const loop = queue(); let loopEnded = 0, loopErrors = 0;
  loop.players.play([{path: 'x.mp4'}, {path: 'y.mp4'}], {loop: true, onEnd: () => loopEnded++, onError: () => loopErrors++}); await settle();
  for (let round = 0; round < 6 && !loopEnded; round++) { for (const v of [...made]) if (v.attrs.has('src')) v.dispatchEvent(new Event('error')); await settle(); }
  assert.equal(loopEnded, 1); assert.ok(loopErrors >= 2 && loopErrors <= 4, `${loopErrors} errors`);
  readyAtStart = 2; players.dispose(); loop.players.dispose();
});

test('a spoken line is never hurried, and the tempo leaves it and a rest film alone', async () => {
  withFrameCalls = true; readyAtStart = 2; const {players} = queue();
  players.tempo(2); players.play([{path: 'tal.mp4', sound: true}]); await settle(); players.hurry(1.5); assert.equal(made[0].playbackRate, 1, 'a talk film keeps its speed under tempo and hurry');
  players.play([{path: 'vila.mp4', rest: true}], {cut: true}); await settle(); assert.equal(made.find(v => v.src === 'vila.mp4')!.playbackRate, 1, 'a rest film keeps its speed under the tempo');
  players.hurry(1.5); assert.equal(made.find(v => v.src === 'vila.mp4')!.playbackRate, 1.5, 'a rest film can be played out faster before a deal');
  players.play([{path: 'giv.mp4'}], {cut: true}); await settle(); assert.equal(made.find(v => v.src === 'giv.mp4')!.playbackRate, 2, 'a deal takes the tempo');
  players.tempo(1); assert.equal(made.find(v => v.src === 'giv.mp4')!.playbackRate, 1); players.dispose();
});

test('a film with sound that the browser refuses to start is shown muted; a start that a pause interrupted is left standing', async () => {
  // told: what the queue said through its hook (refused), for the layer that then speaks the line (src/scene3d-voice.ts)
  withFrameCalls = true; readyAtStart = 2; const told: {path: string; video: unknown}[] = [], {players} = queue({refused: (part, video) => told.push({path: part.path, video})}), wait = () => new Promise(resolve => setTimeout(resolve, 90));
  const nav = (globalThis as {navigator?: object}).navigator ?? ((globalThis as {navigator?: object}).navigator = {}), had = Object.getOwnPropertyDescriptor(nav, 'userActivation');
  Object.defineProperty(nav, 'userActivation', {value: {hasBeenActive: true}, configurable: true}); // the page has been touched: a line is started with its sound
  try {
    players.play([{path: 'hord.mp4', sound: true}]); await wait();
    assert.equal(made.find(v => v.src === 'hord.mp4')!.muted, false, 'a line is heard where the browser lets it'); assert.equal(told.length, 0, 'and nothing is said about it');
    refuse = 'NotAllowedError'; players.play([{path: 'tal.mp4', sound: true}], {cut: true}); await wait();
    const tal = made.find(v => v.src === 'tal.mp4')!;
    assert.equal(tal.muted, true, 'refused with sound: muted'); assert.equal(tal.paused, false, 'and running, so the round goes on');
    assert.equal(told.length, 1, 'the page is told once'); assert.equal(told[0].path, 'tal.mp4'); assert.equal(told[0].video, tal, 'with the part and its element');
    refuse = 'AbortError'; players.play([{path: 'tal2.mp4', sound: true}], {cut: true}); await wait();
    const tal2 = made.find(v => v.src === 'tal2.mp4')!;
    assert.equal(tal2.muted, false, 'another refusal is not answered by muting'); assert.equal(tal2.paused, true, 'and the film is not started again'); assert.equal(told.length, 1, 'nor is the page told');
  } finally { refuse = null; if (had) Object.defineProperty(nav, 'userActivation', had); else delete (nav as {userActivation?: unknown}).userActivation; players.dispose(); }
});

// ---- where a part starts (enter() in the queue): its first frame is drawn before its film runs ----------------------------
// A part waits inside its first frame. Started when the queue changed part, its film had run on before the picture was drawn, and
// at one start in four a frame among its first two was never seen; so the film starts in the animation frame after the change.
test('a part that waits on its first frame is shown at once and its film starts when that frame has been drawn', async () => {
  const frames: (() => void)[] = [], g = globalThis as {requestAnimationFrame?: unknown}, draw = () => { for (const call of frames.splice(0)) call(); };
  g.requestAnimationFrame = (call: () => void) => frames.push(call);
  try {
    const {players} = queue();
    players.play([{path: 'a.mp4', end: 30}, {path: 'b.mp4', start: 12}], {cut: true}); await settle();
    const a = made[0], b = made.find(v => v.src === 'b.mp4')!;
    assert.equal(players.path, 'a.mp4'); assert.ok(a.paused, 'shown, and standing until it has been drawn');
    draw(); assert.ok(!a.paused, 'the drawing is done: it runs');
    assert.ok(b.paused && Math.abs(b.currentTime - 12.1 / 30) < 1e-9, 'the next part waits a tenth of a frame into its first frame');
    a.present(at(29)); a.present(at(30)); assert.equal(players.path, 'b.mp4'); assert.ok(b.paused, 'the change of film does not start it');
    draw(); assert.ok(!b.paused);
    // paused between the change and the drawing: the drawing does not start it, playing on does
    players.play([{path: 'c.mp4'}], {cut: true}); const c = made.find(v => v.src === 'c.mp4')!; assert.equal(players.path, 'c.mp4');
    players.toggle(true); draw(); await wait(80); assert.ok(c.paused, 'a paused queue stays paused'); players.toggle(false); assert.ok(!c.paused);
    players.dispose();
    // a film that is not ready when it is entered runs from the entry, and is shown on the first frame it presents
    readyAtStart = 0; const late = queue(); late.players.play([{path: 'd.mp4'}]); await settle();
    const d = made[0]; assert.ok(!d.paused, 'it runs at once: standing, an element that is not ready stays so'); assert.equal(late.players.path, '');
    d.readyState = 2; d.present(0.02); assert.equal(late.players.path, 'd.mp4'); late.players.dispose();
  } finally { readyAtStart = 2; delete g.requestAnimationFrame; }
});

test('where the page draws nothing a part is started by the timer, so a round is never left waiting', async () => {
  const g = globalThis as {requestAnimationFrame?: unknown}; g.requestAnimationFrame = () => 0; // a hidden tab: asked for, never answered
  try {
    const {players} = queue();
    players.play([{path: 'a.mp4'}, {path: 'b.mp4'}], {cut: true}); await settle();
    const a = made[0]; assert.ok(a.paused); await wait(80); assert.ok(!a.paused, 'started 50 ms after the change');
    a.dispatchEvent(new Event('ended')); const b = made.find(v => v.src === 'b.mp4')!; assert.equal(players.path, 'b.mp4'); assert.ok(b.paused);
    await wait(80); assert.ok(!b.paused, 'and the next part the same way');
    // a part that was left before its timer came is not started by it
    players.play([{path: 'c.mp4'}], {cut: true}); const c = made.find(v => v.src === 'c.mp4')!; players.play([{path: 'e.mp4'}], {cut: true});
    await wait(80); assert.ok(c.paused, 'the part that was left stands');
    players.dispose(); await wait(80); for (const v of made) assert.ok(emptied(v));
  } finally { delete g.requestAnimationFrame; }
});
