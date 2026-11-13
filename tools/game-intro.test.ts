// The film before the game (src/game-intro.ts): its states and every way out of them, where the film lies on each kind of stage,
// and that nothing of it is left when it is done. The page part runs on a small stand-in for the DOM.
//   node --test tools/game-intro.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FILM} from '../src/scene3d-geometry.ts';
import {INTRO_FRAME, INTRO_FRAMING, INTRO_FILM, INTRO_START, createIntro, introLayout, introNext, type IntroSignal, type IntroState} from '../src/game-intro.ts';

const run = (signals: IntroSignal[], from: IntroState = INTRO_START) => signals.reduce(introNext, from);

test('the states: the press plays, the end fades, the fade ends; played only when the film ran to its end', () => {
  assert.deepEqual(run(['play']), {phase: 'playing', played: false});
  assert.deepEqual(run(['play', 'ended']), {phase: 'fading', played: true});
  assert.deepEqual(run(['play', 'ended', 'faded']), {phase: 'done', played: true});
  assert.deepEqual(run(['ended']), INTRO_START, 'no end before the film');
  assert.deepEqual(run(['faded']), INTRO_START, 'no fade before one is begun');
  assert.deepEqual(run(['play', 'play']), {phase: 'playing', played: false}, 'a second press changes nothing');
  assert.deepEqual(run(['play', 'ended', 'ended', 'error', 'play']), {phase: 'fading', played: true}, 'nothing but the fade\'s end or a skip leaves the fade');
  const done = run(['play', 'ended', 'faded']);
  for (const s of ['play', 'ended', 'skip', 'error', 'faded'] as IntroSignal[]) assert.deepEqual(introNext(done, s), done, `${s} after the end`);
});

test('a skip works in every state, and a film that fails counts as one', () => {
  assert.deepEqual(run(['skip']), {phase: 'fading', played: false}, 'from the start picture');
  assert.deepEqual(run(['play', 'skip']), {phase: 'fading', played: false}, 'during the film');
  assert.deepEqual(run(['play', 'ended', 'skip']), {phase: 'done', played: true}, 'during the fade: it ends at once');
  assert.deepEqual(run(['skip', 'skip']), {phase: 'done', played: false});
  assert.deepEqual(run(['error']), {phase: 'fading', played: false}, 'a poster or film that fails before the press');
  assert.deepEqual(run(['play', 'error']), {phase: 'fading', played: false}, 'a film that cannot be played');
  assert.deepEqual(run(['play', 'error', 'faded']), {phase: 'done', played: false});
});

test('the constants are the scene\'s, the contract\'s and the game page\'s', () => {
  assert.deepEqual([INTRO_FRAME.width, INTRO_FRAME.height], [FILM.width, FILM.height]);
  const contract = JSON.parse(readFileSync(new URL('../data/scene-contract.json', import.meta.url), 'utf8'));
  assert.equal(INTRO_FRAME.focalPx, contract.keyFigures.focalPx.value);
  const page = readFileSync(new URL('../src/game-page.ts', import.meta.url), 'utf8'), m = /const FRAMING = \{wide: \{pitch: (-?[\d.]+), zoom: ([\d.]+)\}, tall: \{pitch: (-?[\d.]+), zoom: ([\d.]+)\}, tallBelow: ([\d.]+)/.exec(page);
  assert.ok(m, 'FRAMING in src/game-page.ts');
  assert.deepEqual(INTRO_FRAMING, {lying: {pitch: Number(m![1]), zoom: Number(m![2])}, tall: {pitch: Number(m![3]), zoom: Number(m![4])}, tallBelow: Number(m![5])});
  assert.deepEqual([INTRO_FILM.zoom, INTRO_FILM.pitch], [INTRO_FRAMING.lying.zoom, INTRO_FRAMING.lying.pitch], 'the film was made at the lying framing');
});

test('where the film lies: at the game\'s own scale and middle, covering where it can', () => {
  const near = (a: number, b: number, what: string) => assert.ok(Math.abs(a - b) < 0.01, `${what}: ${a} against ${b}`);
  const at = introLayout(1920, 1080);
  assert.equal(at.tall, false); assert.equal(at.covers, true); near(at.film.x, 0, 'x'); near(at.film.y, 0, 'y'); near(at.film.width, 1920, 'width');
  const ten = introLayout(1920, 1200); // 16:10: the game keeps the frame's height, the film covers and spills at the sides
  assert.equal(ten.covers, true); near(ten.film.height, 1200, '16:10 height'); near(ten.film.x, (1920 - 1200 * 16 / 9) / 2, '16:10 x');
  const wide = introLayout(2560, 1080); // about 21:9: the same height, bars at the sides
  assert.equal(wide.covers, false); near(wide.film.width, 1920, '21:9 width'); near(wide.film.x, 320, '21:9 x');
  const four = introLayout(1440, 1080); // 4:3: the game keeps the frame's width; the film is wider than the stage and not as high
  assert.equal(four.covers, false); near(four.film.width, 1440 * 1920 / 1080 * 1174 / 1764, '4:3 width'); near(four.film.y + four.film.height / 2, 540, '4:3 middle');
  const phone = introLayout(390, 844); // standing: the whole film on black, growing toward the game's far larger picture of her
  assert.equal(phone.tall, true); near(phone.film.width, 390, 'standing: whole film'); assert.ok(phone.end.width > 2.5 * phone.film.width, 'and the game shows her far larger');
  for (const l of [at, ten, wide, four]) assert.deepEqual(l.film, l.end, 'lying: where the film lies is where the game has her');
});

// ── the page, on a stand-in for the DOM ──
type Listener = (e: Record<string, unknown>) => void;
class El {
  style: Record<string, string> & {cssText?: string} = {}; dataset: Record<string, string> = {}; attrs: Record<string, string> = {}; children: El[] = []; parent: El | null = null;
  listeners = new Map<string, Set<Listener>>(); textContent = ''; type = ''; alt = ''; decoding = ''; offsetWidth = 1; focused = false; tag: string; doc: Doc;
  constructor(tag: string, doc: Doc) { this.tag = tag; this.doc = doc; }
  setAttribute(k: string, v: string) { this.attrs[k] = v; } removeAttribute(k: string) { delete this.attrs[k]; if (k === 'src') (this as unknown as {src: string}).src = ''; }
  append(...els: El[]) { for (const e of els) { e.parent = this; this.children.push(e); } }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); this.parent = null; }
  addEventListener(t: string, f: Listener) { if (!this.listeners.has(t)) this.listeners.set(t, new Set()); this.listeners.get(t)!.add(f); }
  removeEventListener(t: string, f: Listener) { this.listeners.get(t)?.delete(f); }
  fire(t: string, extra: Record<string, unknown> = {}) { for (const f of [...this.listeners.get(t) ?? []]) f({target: this, preventDefault() {}, ...extra}); }
  focus() { this.focused = true; } get ownerDocument() { return this.doc; }
  getBoundingClientRect() { return {width: 1920, height: 1080, left: 0, top: 0}; }
}
class Video extends El {
  src = ''; preload = ''; muted = true; playsInline = false; controls = true; disablePictureInPicture = false; currentTime = 0; paused = true; ended = false; loads = 0; playAnswer: 'ok' | 'fail' = 'ok';
  play() { if (this.playAnswer === 'fail') return Promise.reject(Error('NotAllowedError')); this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; } load() { this.loads++; }
}
class Doc extends El { made: El[] = []; constructor() { super('#document', null as unknown as Doc); this.doc = this; }
  createElement(tag: string) { const e = tag === 'video' ? new Video(tag, this) : new El(tag, this); this.made.push(e); return e; } }
const observers: {observed: number; disconnected: boolean}[] = [];
(globalThis as Record<string, unknown>).ResizeObserver = class { o = {observed: 0, disconnected: false}; constructor() { observers.push(this.o); } observe() { this.o.observed++; } disconnect() { this.o.disconnected = true; } };
const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));
function setup(answer: 'ok' | 'fail' = 'ok') {
  const doc = new Doc(), stage = doc.createElement('div'), canvas = doc.createElement('canvas'); stage.append(canvas); doc.made.length = 0;
  const intro = createIntro(stage as unknown as HTMLElement, canvas as unknown as HTMLCanvasElement, {film: 'film.mp4', poster: 'poster.jpg', fade: {lying: 0.02, tall: 0.02}});
  const root = stage.children.find(c => c !== canvas)!, video = doc.made.find(e => e instanceof Video) as Video, buttons = doc.made.filter(e => e.tag === 'button');
  video.playAnswer = answer;
  return {doc, stage, canvas, intro, root, video, play: buttons.find(b => b.textContent === 'Spela')!, skip: buttons.find(b => b.textContent === 'Hoppa över')!};
}
/** Nothing left: the stage holds only the canvas, no listener on the document, the observer let go, the film's source released. */
function assertGone(s: ReturnType<typeof setup>) {
  assert.deepEqual(s.stage.children, [s.canvas], 'only the canvas is left on the stage');
  assert.equal([...s.doc.listeners.values()].reduce((n, l) => n + l.size, 0), 0, 'no listener left on the document');
  assert.equal(observers.at(-1)!.disconnected, true, 'the resize observer is let go');
  assert.equal(s.video.src, '', 'the film\'s source is released'); assert.ok(s.video.loads >= 1, 'and the element told to drop its data');
  assert.equal(s.video.paused, true);
}

test('the page: the start picture fetches no film; the press plays with sound; the end fades into the game; then nothing is left', async () => {
  const s = setup();
  assert.equal(s.video.src, '', 'no film is fetched before the press'); assert.equal(s.video.preload, 'none'); assert.equal(s.video.playsInline, true);
  assert.equal(s.play.focused, true, 'the keyboard starts on "Spela"');
  s.play.fire('click');
  assert.equal(s.video.src, 'film.mp4'); assert.equal(s.video.muted, false, 'with sound'); assert.equal(s.video.paused, false);
  s.video.fire('ended');
  assert.equal(s.root.style.opacity, '0', 'the fade has begun');
  s.root.fire('transitionend', {propertyName: 'opacity'});
  assert.deepEqual(await s.intro, {played: true});
  assertGone(s);
});

test('the page: "Hoppa över", Escape, a film that fails, and a fade the browser never reports', async () => {
  const a = setup(); a.skip.fire('click'); a.root.fire('transitionend', {propertyName: 'opacity'});
  assert.deepEqual(await a.intro, {played: false}); assertGone(a);
  const b = setup(); b.play.fire('click'); b.doc.fire('keydown', {key: 'Escape'}); b.root.fire('transitionend', {propertyName: 'opacity'});
  assert.deepEqual(await b.intro, {played: false}, 'Escape during the film'); assertGone(b);
  const c = setup('fail'); c.play.fire('click'); await tick();
  assert.equal(c.root.style.opacity, '0', 'a refused play fades into the game');
  c.root.fire('transitionend', {propertyName: 'opacity'}); assert.deepEqual(await c.intro, {played: false}); assertGone(c);
  const d = setup(); d.play.fire('click'); d.video.fire('error');
  assert.deepEqual(await d.intro, {played: false}, 'a film that breaks, and no transitionend: the timer ends the fade'); assertGone(d);
  const e = setup(); e.play.fire('click'); e.video.fire('ended'); e.doc.fire('keydown', {key: 'Escape'});
  assert.deepEqual(await e.intro, {played: true}, 'Escape during the fade ends it at once and keeps played'); assertGone(e);
});
