// The page's one audio context (src/page-audio.ts), with stand-ins: no browser. What her voice needs of it on a phone: the
// context is woken inside a touch, the same context is handed to every layer, and nothing is left behind when the page goes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createPageAudio} from '../src/page-audio.ts';

// A context as far as the module uses it: suspended until resumed, as a phone's browser makes it.
class FakeContext {
  state = 'suspended'; sampleRate = 48000; destination = {}; resumes = 0; started = 0; closed = false;
  resume() { this.resumes++; this.state = 'running'; return Promise.resolve(); }
  close() { this.closed = true; this.state = 'closed'; return Promise.resolve(); }
  createBuffer() { return {}; }
  createBufferSource() { return {buffer: null as unknown, connect: () => {}, start: () => { this.started++; }}; }
}
const page = (options: {playback?: boolean} = {}) => { const target = new EventTarget(), made: FakeContext[] = [];
  const audio = createPageAudio({target, ...options, make: () => { const c = new FakeContext(); made.push(c); return c as unknown as AudioContext; }});
  return {target, made, audio}; };

test('the context is woken inside a touch and not before: a finger let go, a click or a key, but not a finger put down', () => {
  const {target, made, audio} = page();
  assert.equal(audio.running, false); assert.equal(made.length, 0, 'nothing is made before it is asked for');
  const context = audio.context() as unknown as FakeContext; assert.equal(made.length, 1); assert.equal(context.resumes, 0, 'made outside a touch it is left suspended'); assert.equal(audio.running, false);
  target.dispatchEvent(new Event('touchstart')); target.dispatchEvent(new Event('pointerdown')); assert.equal(context.resumes, 0, 'a finger put down is no touch to a browser');
  target.dispatchEvent(new Event('touchend')); assert.equal(context.resumes, 1); assert.equal(context.started, 1, 'with a silent sample started in the touch'); assert.equal(audio.running, true);
  target.dispatchEvent(new Event('click')); assert.equal(context.resumes, 1, 'a running context is left alone');
  context.state = 'suspended'; target.dispatchEvent(new Event('keydown')); assert.equal(context.resumes, 2, 'a context the browser suspended again is woken by the next touch');
  assert.equal(audio.context(), context as unknown as AudioContext, 'every layer gets the same context'); assert.equal(made.length, 1);
  audio.dispose();
});

test('a touch before any layer has asked makes the context, so that the first line already finds it running', () => {
  const {target, made, audio} = page();
  target.dispatchEvent(new Event('pointerup')); assert.equal(made.length, 1); assert.equal(made[0].resumes, 1); assert.equal(audio.running, true);
  audio.dispose();
});

test('with playback her voice is asked to be heard with the ringer off, where the browser has that word', () => {
  const nav = (globalThis as {navigator?: object}).navigator ?? ((globalThis as {navigator?: object}).navigator = {}), had = Object.getOwnPropertyDescriptor(nav, 'audioSession'), session = {type: 'auto'};
  Object.defineProperty(nav, 'audioSession', {value: session, configurable: true});
  try {
    const plain = page(); plain.audio.wake(); assert.equal(session.type, 'auto', 'not asked for: the phone\'s switch decides'); plain.audio.dispose();
    const loud = page({playback: true}); loud.audio.wake(); assert.equal(session.type, 'playback'); loud.audio.dispose();
  } finally { if (had) Object.defineProperty(nav, 'audioSession', had); else delete (nav as {audioSession?: unknown}).audioSession; }
});

test('dispose closes the context and hears no more touches', () => {
  const {target, made, audio} = page(); audio.wake(); const context = made[0];
  audio.dispose(); assert.equal(context.closed, true);
  target.dispatchEvent(new Event('click')); assert.equal(made.length, 1, 'no new context after dispose'); assert.equal(audio.context(), null); assert.equal(audio.running, false);
  audio.dispose();
});
