// Her voice when a talk film may not be heard (src/scene3d-voice.ts), with stand-ins: no browser, no media. What a phone needs
// of it: the film's sound is read once and set against the film's own frames, it stops when the film does, and it is set anew
// when the film stalls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createVoice} from '../src/scene3d-voice.ts';
import type {PageAudio} from '../src/page-audio.ts';

// A video element as far as the layer uses it: events, a clock, and frames the test presents.
class BareVideo extends EventTarget { paused = false; currentTime = 0; playbackRate = 1; }
class FakeVideo extends BareVideo {
  requests = new Map<number, (now: number, meta: {mediaTime: number; expectedDisplayTime: number}) => void>(); next = 1;
  requestVideoFrameCallback(call: (now: number, meta: {mediaTime: number; expectedDisplayTime: number}) => void) { const id = this.next++; this.requests.set(id, call); return id; }
  cancelVideoFrameCallback(id: number) { this.requests.delete(id); }
  /** The film gets going: the part's first frame, which stood waiting, and the one after it. The layer sets no sound against these. */
  run(at: number) { this.present(0.004, at - 80); this.present(0.046, at - 40); }
  /** The browser presents the frame of film time `mediaTime`, shown at `at` ms on the page's clock. */
  present(mediaTime: number, at: number) { const calls = [...this.requests.values()]; this.requests.clear(); for (const call of calls) call(at, {mediaTime, expectedDisplayTime: at}); }
}
type Started = {when: number; offset: number; rate: number; stopped: number | null};
// The page's audio as far as the layer uses it: context time 5 s is page time `tied` ms.
function stage(state: 'running' | 'suspended' = 'running') {
  const clock = {ms: 1000}, started: Started[] = [], reads: string[] = [];
  const context = {state, currentTime: 5, outputLatency: 0, baseLatency: 0, destination: {}, getOutputTimestamp: () => ({contextTime: 5, performanceTime: 1000}),
    createGain: () => ({gain: {value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}}, connect: (to: unknown) => to}),
    createBufferSource: () => { const s: Started = {when: -1, offset: -1, rate: 1, stopped: null}; return {buffer: null as unknown, playbackRate: {set value(v: number) { s.rate = v; }}, connect: (to: unknown) => to,
      start: (when: number, offset: number) => { s.when = when; s.offset = offset; started.push(s); }, stop: (when: number) => { s.stopped = when; }}; }};
  const audio: PageAudio = {context: () => context as unknown as AudioContext, get running() { return context.state === 'running'; }, wake() { context.state = 'running'; }, dispose() {}};
  const voice = createVoice(audio, {now: () => clock.ms, read: async path => { reads.push(path); if (path === 'trasig.mp4') throw Error('kan inte avkodas'); return {duration: 3} as AudioBuffer; }});
  return {clock, started, reads, context, audio, voice};
}
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const near = (a: number, b: number, what: string) => assert.ok(Math.abs(a - b) < 1e-6, `${what}: ${a} mot ${b}`);

test('a refused talk film is spoken through the page\'s audio, its sound set against the frame the film shows', async () => {
  const {clock, started, reads, voice} = stage(), video = new FakeVideo();
  assert.equal(voice.needed, false);
  voice.refused({path: 'tal.mp4'}, video as unknown as HTMLVideoElement); assert.equal(voice.needed, true, 'this browser needs the layer'); await settle();
  assert.deepEqual(reads, ['tal.mp4']); assert.equal(started.length, 0, 'nothing is set before the film has presented a frame');
  video.run(1000); assert.equal(started.length, 0, 'nor against the frame that stood waiting or the one after it: the film is only getting going');
  // The film shows the frame of 0.10 s at page time 1000 ms, which is now. The sound is set 60 ms ahead: the film is then at
  // 0.16 s, and context time 5 s is page time 1000 ms, so it begins at 5.06 s from 0.16 s into the film's sound.
  video.present(0.10, 1000);
  assert.equal(started.length, 1); near(started[0].when, 5.06, 'when'); near(started[0].offset, 0.16, 'from where in the film\'s sound');
  const log = voice.log.at(-1)!; assert.equal(log.heard, true); assert.equal(log.startedAt, 1060); assert.equal(log.filmTime, 0.16); assert.equal(log.read, 'ready');
  // Frames that come as they should leave the sound alone: the frame of 0.60 s is due at 1060 + 440 = 1500 ms.
  clock.ms = 1500; video.present(0.60, 1500); clock.ms = 1540; video.present(0.64, 1560); assert.equal(started.length, 1); assert.equal(log.resyncs, 0);
  voice.dispose();
});

test('the voice stops when the film does, and a sound read too late is never begun', async () => {
  const {started, voice} = stage(), video = new FakeVideo();
  voice.refused({path: 'tal.mp4'}, video as unknown as HTMLVideoElement); await settle(); video.run(1000); video.present(0.10, 1000); assert.equal(started.length, 1);
  video.dispatchEvent(new Event('pause')); // the part ended or was cut: the queue stops its element
  assert.ok(started[0].stopped !== null, 'the sound is stopped'); assert.equal(voice.log.at(-1)!.ended, 'filmen stannade'); assert.equal(video.requests.size, 0, 'and no frame is asked for any more');
  video.present(0.5, 1400); assert.equal(started.length, 1, 'a later frame of the same element begins nothing');
  // A film cut before its sound was read: the line is over when the samples arrive.
  const late = new FakeVideo(); voice.refused({path: 'annan.mp4'}, late as unknown as HTMLVideoElement); late.dispatchEvent(new Event('pause')); await settle(); late.present(0.2, 1500);
  assert.equal(started.length, 1); assert.equal(voice.log.at(-1)!.heard, false);
  voice.dispose();
});

test('a film that stalls gets its sound set anew from the frame it shows, a few times and then no more', async () => {
  const {clock, started, voice} = stage(), video = new FakeVideo();
  voice.refused({path: 'tal.mp4'}, video as unknown as HTMLVideoElement); await settle(); video.run(1000); video.present(0.10, 1000);
  // The frame of 0.50 s was due at 1400 ms and is shown at 1600: the film stood still for 200 ms. The sound is stopped and set
  // again, 60 ms ahead of now, from where the film then is.
  clock.ms = 1600; video.present(0.50, 1600);
  assert.equal(started.length, 2); assert.ok(started[0].stopped !== null); near(started[1].offset, 0.56, 'from where the film is'); near(started[1].when, 5.66, 'when'); assert.equal(voice.log.at(-1)!.resyncs, 1);
  for (const [film, at] of [[0.7, 2100], [0.9, 2600], [1.1, 3100]]) { clock.ms = at; video.present(film, at); }
  assert.equal(voice.log.at(-1)!.ended, 'filmen hackar', 'the fourth stall ends the line'); assert.equal(started.length, 4);
  voice.dispose();
});

test('nothing is set while the page\'s audio is not running; the first frame after a touch begins the line from where the film is', async () => {
  const {clock, started, audio, voice} = stage('suspended'), video = new FakeVideo();
  voice.refused({path: 'tal.mp4'}, video as unknown as HTMLVideoElement); await settle(); video.run(1000); video.present(0.10, 1000); assert.equal(started.length, 0);
  audio.wake(); clock.ms = 1500; video.present(0.60, 1500);
  assert.equal(started.length, 1); near(started[0].offset, 0.66, 'the line is joined where the film is');
  voice.dispose();
});

test('a film\'s sound is read once however often its line is said, a film without readable sound is left unsaid, and a line near its end is not begun', async () => {
  const {clock, started, reads, voice} = stage(), a = new FakeVideo(), b = new FakeVideo(), c = new FakeVideo(), d = new FakeVideo();
  voice.refused({path: 'tal.mp4'}, a as unknown as HTMLVideoElement); await settle(); a.run(1000); a.present(0.1, 1000); a.dispatchEvent(new Event('ended'));
  voice.refused({path: 'tal.mp4'}, b as unknown as HTMLVideoElement); await settle(); clock.ms = 2000; b.run(2000); b.present(0.1, 2000);
  assert.deepEqual(reads, ['tal.mp4'], 'read once'); assert.equal(started.length, 2);
  voice.refused({path: 'trasig.mp4'}, c as unknown as HTMLVideoElement); await settle(); c.run(2100); c.present(0.1, 2100);
  assert.ok(started[1].stopped !== null, 'a new line ends the one before it'); assert.equal(started.length, 2); assert.equal(voice.log.at(-1)!.read, 'failed'); assert.equal(voice.log.at(-1)!.ended, 'inget ljud');
  voice.refused({path: 'tal.mp4'}, d as unknown as HTMLVideoElement); await settle(); clock.ms = 3000; d.run(3000); d.present(2.95, 3000);
  assert.equal(started.length, 2); assert.equal(voice.log.at(-1)!.ended, 'inget kvar att säga');
  voice.dispose();
});

test('without frame times the element\'s own clock sets the sound, and dispose ends the line', async () => {
  const {started, voice} = stage(), video = new BareVideo(); video.currentTime = 0.3;
  voice.refused({path: 'tal.mp4'}, video as unknown as HTMLVideoElement); await settle();
  assert.equal(started.length, 1, 'set as soon as the sound is read, from the clock'); near(started[0].offset, 0.36, 'from where the clock is');
  voice.dispose(); assert.ok(started[0].stopped !== null); assert.equal(voice.log.at(-1)!.ended, 'sidan stängdes');
  voice.refused({path: 'tal.mp4'}, new BareVideo() as unknown as HTMLVideoElement); assert.equal(voice.log.length, 1, 'nothing after dispose');
});
