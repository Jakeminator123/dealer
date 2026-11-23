// The order of films after the player asks for a step (src/game-film.ts leave, play), played by the real film queue
// (src/scene3d-film.ts createPlayers) over fake <video> elements on a mocked clock. Jakob 2026-11-23: the rests already queued are
// ignored when Dela ut is pressed, so that A1 to A2.n comes first and the deal after it. What holds: the rest on screen plays to
// its last frame, where she stands on A1; no other rest comes between; the entry is the next film, and the deal follows it.
import test, {type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {createSession} from '../game/session.ts';
import {buildGraph} from '../src/clip-graph.ts';
import {cardRecords} from '../src/game-director.ts';
import {createFilm} from '../src/game-film.ts';
import {createLayout} from '../src/game-table.ts';
import {tableCards, cardFaces} from '../src/game-view.ts';
import {defaultPlan} from '../src/placement-model.ts';
import {createPlayers} from '../src/scene3d-film.ts';

// Every fixture film is 120 frames at 30 fps; a film is read LOAD_MS after its source is set, a seek takes 10 ms.
const FRAMES = 120, FPS = 30, LOAD_MS = 100;
type FrameCall = (now: number, meta: {mediaTime: number}) => void;
class FakeVideo {
  muted = true; playsInline = false; preload = ''; playbackRate = 1; paused = true; ended = false; seeking = false; readyState = 0; networkState = 0; error = null;
  #src = ''; #t = 0; #gen = 0; #id = 0; #tick: ReturnType<typeof setTimeout> | null = null;
  #on = new Map<string, Set<{call: () => void; once: boolean}>>(); #calls = new Map<number, FrameCall>();
  get src() { return this.#src; }
  set src(path: string) { this.#src = path; const gen = ++this.#gen; this.readyState = 0; setTimeout(() => { if (gen !== this.#gen) return; this.readyState = 4; this.#emit('loadeddata'); this.#run(); }, LOAD_MS); }
  get currentSrc() { return this.#src; }
  get duration() { return FRAMES / FPS; }
  get currentTime() { return this.#t; }
  set currentTime(seconds: number) { this.#t = seconds; this.seeking = true; this.ended = false; this.#stop(); const gen = this.#gen;
    const done = () => { if (gen !== this.#gen) return; if (this.readyState < 2) { setTimeout(done, 5); return; } this.seeking = false; this.#emit('seeked'); this.#present(); this.#run(); };
    setTimeout(done, 10); }
  addEventListener(type: string, call: () => void, o: {once?: boolean; signal?: AbortSignal} = {}) { let set = this.#on.get(type); if (!set) this.#on.set(type, set = new Set()); const entry = {call, once: !!o.once}; set.add(entry); o.signal?.addEventListener('abort', () => set.delete(entry)); }
  requestVideoFrameCallback(call: FrameCall) { this.#calls.set(++this.#id, call); return this.#id; }
  cancelVideoFrameCallback(id: number) { this.#calls.delete(id); }
  play() { this.paused = false; this.ended = false; this.#run(); return Promise.resolve(); }
  pause() { this.paused = true; this.#stop(); }
  removeAttribute() { this.#src = ''; this.#gen++; this.readyState = 0; this.pause(); }
  load() {}
  #emit(type: string) { for (const e of [...this.#on.get(type) ?? []]) { if (e.once) this.#on.get(type)!.delete(e); e.call(); } }
  #present() { const calls = [...this.#calls.values()], meta = {mediaTime: Math.floor(this.#t * FPS + 1e-3) / FPS}; this.#calls.clear(); for (const call of calls) call(0, meta); }
  #stop() { if (this.#tick) clearTimeout(this.#tick); this.#tick = null; }
  #run() { this.#stop(); if (this.paused || this.seeking || this.readyState < 2) return; const frame = Math.floor(this.#t * FPS + 1e-3);
    this.#tick = setTimeout(() => { this.#tick = null; this.#t = (frame + 1) / FPS;
      if (this.#t >= this.duration - 1e-6) { this.#t = this.duration; this.paused = this.ended = true; this.#present(); this.#emit('ended'); return; }
      this.#present(); this.#run(); }, Math.ceil(1000 / FPS / this.playbackRate)); }
}

// Paow's films for seat 4 (the dealer's cards are laid without a hand) and two rest films, as in tools/game-view.test.ts.
function fixtureBank() {
  const jobs = [['in', 'IDLE', 'READY', 'ENTRY'], ['deal', 'READY', 'P4.C1', 'DEAL'], ['back', 'P4.C1', 'READY', 'RETURN'], ['rest-4', 'P4.C1', 'IDLE', 'RETURN'], ['ut', 'READY', 'IDLE', 'RETURN'], ['vila-a', 'IDLE', 'IDLE', 'IDLE'], ['vila-b', 'IDLE', 'IDLE', 'IDLE']]
    .map(([id, from, to, kind]) => ({id, kind, target: kind === 'DEAL' ? to : null, from, to, model: 'wan3', duration: 4, ratio: 'auto_1080p', audio: false, promptText: 'fixture', first: {file: {path: 'assets/anchors/x/anchor.png', sha256: 'a'.repeat(64)}}, purpose: 'fixture', dealer: 'paow'}));
  return {jobs, motions: Object.fromEntries(jobs.map(j => [j.id, {source: {fps: FPS, frames: FRAMES, sha256: 'a'.repeat(64)}, review: {decision: 'ACCEPTED'}, motion: j.id.startsWith('vila') ? {idle: {calm: true, weight: 20}} : {physicalEndSide: 'FRONT'}}])),
    receipts: Object.fromEntries(jobs.map(j => [j.id, {status: 'SUCCEEDED'}])), media: Object.fromEntries(jobs.map(j => [j.id, {video: `assets/motions/${j.id}/source.mp4`}]))};
}
const card = (text: string) => ({r: text.slice(0, -1), s: text.slice(-1)});
function openingDeal() {
  const s = createSession({balance: 1000, shoe: {mode: 'stacked', seed: 'order', cards: 'K♠ 7♦ 6♥ 10♣ 5♦'.split(' ').map(card)}});
  const next = s.command({op: 'start', bets: [{seat: 4, main: 10}], requestId: 'r1', expectedVersion: s.state().ver}), table = tableCards(next);
  return {signals: next.events, next: {table, records: cardRecords(table, cardFaces(next))}};
}
const nameOf = (path: string) => path.split('/')[2];

/**
 * The game at rest on the mocked clock; the player asks for the opening deal `click` ms into the second rest on screen, and the
 * engine answers `answer` ms later. Returns the films shown from that rest on, and the last frame it showed before the next film.
 */
async function askDuringRest(t: TestContext, click: number, answer: number) {
  t.mock.timers.enable({apis: ['setTimeout']});
  (globalThis as {document?: unknown}).document = {createElement: () => new FakeVideo()};
  t.after(() => { delete (globalThis as {document?: unknown}).document; });
  let now = 0; const shown: {at: number; name: string}[] = [], seen: {name: string; frame: number}[] = [];
  const players = createPlayers((_texture, path) => shown.push({at: now, name: nameOf(path)}), () => {}); t.after(() => players.dispose());
  const film = createFilm(players, buildGraph(fixtureBank() as never, {dealer: 'paow'}), createLayout(defaultPlan()), async () => null, () => 0);
  const run = async (ms: number) => { for (const end = now + ms; now < end; now += 2) { t.mock.timers.tick(2); await new Promise(r => setImmediate(r)); seen.push({name: nameOf(players.path), frame: players.frame()}); } };
  film.set({table: {hands: [], dealer: []}, records: [], lying: []}); film.expect([4]);
  while (shown.length < 2 && now < 20000) await run(2);
  const rest = shown[1]; assert.match(rest.name, /^vila/);
  await run(click);
  assert.ok(players.diagnosis().elements.some(e => e.startsWith('+')), 'a rest waits behind the one on screen, as the loop asks for it ahead');
  film.leave(); const {signals, next} = openingDeal(); setTimeout(() => { void film.play(signals, next); }, answer);
  await run(15000);
  const after = shown.slice(shown.indexOf(rest) + 1), last = Math.max(...seen.filter(s => s.name === rest.name).map(s => s.frame));
  return {rest: rest.name, after: after.map(s => s.name), last};
}

test('Dela ut in the middle of a rest: the rest plays to its end, then the entry and the deal, no queued rest between', async t => {
  const {after, last} = await askDuringRest(t, 1000, 300);
  assert.deepEqual(after.slice(0, 3), ['in', 'deal', 'rest-4'], 'the entry is the next film, the deal follows');
  assert.equal(last, FRAMES - 3 - 1, 'the rest was shown to its last played frame (idleRange): she stands on A1 when the entry begins');
});

test('Dela ut at the very end of a rest, the answer later than its end: its last frame stands, then the entry, no rest between', async t => {
  const {after, last} = await askDuringRest(t, 3700, 600);
  assert.deepEqual(after.slice(0, 3), ['in', 'deal', 'rest-4']);
  assert.equal(last, FRAMES - 3 - 1);
});
