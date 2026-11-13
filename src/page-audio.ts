// The page's one AudioContext for her voice: the mouth layer's lines (src/scene3d-mouth.ts) and the voice of a talk film whose
// start with sound the browser refused (src/scene3d-voice.ts). A phone's browser lets a page sound only from inside a touch: a
// context made or resumed anywhere else stays suspended there, however long ago the page was touched. So the context is woken
// in the touch itself, at every touch until it runs (a browser may suspend it again when the page is hidden), and both layers
// take it from here instead of making their own in the middle of a drawn frame.
//
// What a touch is follows the browsers' rule for user activation: a pointer or a finger let go (pointerup, touchend), a click, a
// key or a mouse button pressed. A finger put down (touchstart, pointerdown of a touch) is none.

/** The session type a phone's browser may have (Safari): 'playback' is heard with the ringer switched off, as a film's own sound is. */
type Session = {type?: string};
export type PageAudio = {
  /** The context, made on the first call; suspended until the page has been touched where the browser asks for that. Null where there is no Web Audio. */
  context(): AudioContext | null;
  /** Whether sound set now would be heard. */
  readonly running: boolean;
  /** Wakes the context. Called by the page's touches; a caller that stands inside a touch of its own may call it too. */
  wake(): void;
  dispose(): void;
};
const TOUCHES = ['pointerup', 'touchend', 'click', 'keydown', 'mousedown'] as const;

/**
 * options.target: where touches are heard (the window). options.playback: on a phone, her voice is heard with the ringer
 * switched off, as the talk film's own sound would be (navigator.audioSession, where the browser has it); without it the
 * phone's switch silences the page's audio. options.make: the context's maker, for a test.
 */
export function createPageAudio(options: {target?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> | null; playback?: boolean; make?: () => AudioContext} = {}): PageAudio {
  const target = options.target === undefined ? (globalThis as {window?: EventTarget}).window ?? null : options.target;
  let ctx: AudioContext | null = null, gone = false, session = false;
  const make = (): AudioContext | null => {
    if (ctx || gone) return ctx;
    if (options.make) ctx = options.make(); else if (globalThis.AudioContext) ctx = new AudioContext({latencyHint: 'interactive'});
    return ctx;
  };
  function wake() {
    if (gone) return;
    const c = make(); if (!c) return;
    if (options.playback && !session) { session = true; try { const s = (globalThis.navigator as {audioSession?: Session} | undefined)?.audioSession; if (s && s.type !== 'playback') s.type = 'playback'; } catch { /* a browser that will not: the ringer's switch then decides */ } }
    if (c.state !== 'running') {
      void c.resume().catch(() => {});
      // One silent sample, started inside the touch: older phone browsers open the page's audio on a started source, not on resume().
      try { const source = c.createBufferSource(); source.buffer = c.createBuffer(1, 1, c.sampleRate); source.connect(c.destination); source.start(0); } catch { /* nothing to open with */ }
    }
  }
  for (const type of TOUCHES) target?.addEventListener(type, wake, {capture: true, passive: true});
  return {
    context() {
      const c = make();
      // Outside a touch: a desktop browser resumes a context once the page has been touched at all; a phone's does not, and wake() does it there.
      if (c && c.state === 'suspended' && globalThis.navigator?.userActivation?.hasBeenActive) void c.resume().catch(() => {});
      return c;
    },
    get running() { return !!ctx && ctx.state === 'running'; },
    wake,
    dispose() { if (gone) return; gone = true; for (const type of TOUCHES) target?.removeEventListener(type, wake, {capture: true}); void ctx?.close().catch(() => {}); ctx = null; },
  };
}
