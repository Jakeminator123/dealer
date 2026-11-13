// Her voice when a talk film may not be heard. A talk film carries its own sound (tools/speech.ts), and the film queue starts
// it with sound once the page has been touched (src/scene3d-film.ts). A phone's browser refuses that start: there a film is
// heard only when it is started inside a touch of its own, and the queue starts films from frames and timers. The queue then
// plays the film muted, so the round goes on, and tells this layer (refused). The layer reads the film's sound track once, as
// samples, and plays it through the page's audio (src/page-audio.ts), set against the film's own frames as the mouth layer sets
// a line's sound (src/scene3d-mouth.ts): the sample of the film time on screen is heard as that frame is shown.
//
// Only that case. Where the browser lets the film sound (a desktop), nothing here runs and nothing is fetched. A page that has
// not been touched plays its talk films muted without asking, as before, and is not spoken for either.
//
// The sound is read from the film itself (decodeAudioData takes the sound track of an MP4 that has a picture track). That costs
// the film's bytes once more the first time a line is said, so that first time the voice joins a moment into the line, from where
// the film is by then; a line said again is in step from its first frame. A small sound file beside each talk film would take that
// wait away; the reader is an option (read) so that it can be put in.
import type {PageAudio} from './page-audio.ts';

/** What the layer needs of the part the queue could not start with sound. */
export type VoicePart = {path: string};
/** What one line did, for a proof recorder: when it was refused and begun (ms on the page's clock), the film time its first sample was set for, and why it ended. */
export type VoiceLog = {path: string; refusedAt: number; read: 'reading' | 'ready' | 'failed'; startedAt: number | null; filmTime: number | null; heard: boolean; resyncs: number; endedAt: number | null; ended: string; note: string[]};
type Sound = {state: 'reading' | 'ready' | 'failed'; buffer: AudioBuffer | null; error: string; done: Promise<void>};
type Frame = {mediaTime: number; expectedDisplayTime: number};
type Line = {path: string; video: HTMLVideoElement; off: AbortController; asked: number; source: AudioBufferSourceNode | null; gain: GainNode | null; at: number; film: number; rate: number; seen: number; moved: number; log: VoiceLog};
// LEAD: seconds from now that a sound is set to begin (enough for the audio thread to take it). DRIFT: ms a shown frame may lie
// from where the sound is before the sound is set anew. RESYNCS: how often in one line, before it is ended instead (a film that
// stalls again and again). FADE: seconds a stopped sound takes to fall silent, so that it does not click. TAIL: with less than
// this left of the film's sound there is nothing to say. RUNNING: how many different frames the film must have presented before
// its sound is set. The part's first frame stands waiting when the film is started, and the film gets going a frame later than
// that frame's time says: set against it, the sound lay a frame ahead of the picture through the whole line (measured: 41 to 44
// ms). A talk film's sound begins 0.22 s in, so the wait costs nothing of the line.
const LEAD = 0.06, DRIFT = 80, RESYNCS = 3, FADE = 0.03, TAIL = 0.1, RUNNING = 3;

/**
 * audio: the page's audio. options.read: how a film's sound becomes samples (the default fetches the film and decodes its sound
 * track); options.now: the page's clock in ms, for a test.
 */
export function createVoice(audio: PageAudio, options: {read?: (path: string, context: AudioContext) => Promise<AudioBuffer>; now?: () => number} = {}) {
  const now = options.now ?? (() => performance.now()), sounds = new Map<string, Sound>(), logs: VoiceLog[] = [];
  const reader = options.read ?? (async (path: string, context: AudioContext) => { const res = await fetch(path); if (!res.ok) throw Error(`${path}: ${res.status}`); return await context.decodeAudioData(await res.arrayBuffer()); });
  let line: Line | null = null, gone = false, needed = false;
  // A film's sound, read once. A film that cannot be read or has no sound track stays unread: the line is then not heard, as before.
  function read(path: string): Sound {
    let s = sounds.get(path); if (s) return s;
    const item: Sound = s = {state: 'reading', buffer: null, error: '', done: Promise.resolve()}, context = audio.context();
    if (!context) { item.state = 'failed'; item.error = 'inget Web Audio'; }
    else item.done = reader(path, context).then(buffer => { item.buffer = buffer; item.state = 'ready'; }, error => { item.state = 'failed'; item.error = String((error as Error)?.message ?? error); });
    sounds.set(path, item); return item;
  }
  // Stops a line's sound, faded.
  function hush(l: Line) {
    const context = audio.context();
    if (l.source && l.gain && context) { const t = context.currentTime; try { l.gain.gain.setValueAtTime(l.gain.gain.value, t); l.gain.gain.linearRampToValueAtTime(0, t + FADE); l.source.stop(t + FADE + 0.01); } catch { /* already stopped */ } }
    l.source = null; l.gain = null;
  }
  function end(l: Line, why: string) {
    if (l.log.endedAt !== null) return;
    l.log.endedAt = Math.round(now()); l.log.ended = why; l.off.abort();
    if (l.asked && l.video.cancelVideoFrameCallback) l.video.cancelVideoFrameCallback(l.asked);
    hush(l); if (line === l) line = null;
  }
  // Sets the sound against a frame the film has just presented: the sample of the film time that is on screen LEAD from now
  // begins then. With the page's audio not running (not yet woken by a touch) nothing is set, and the next frame tries again.
  function set(l: Line, buffer: AudioBuffer, frame: Frame): void {
    const context = audio.context(); if (!context || context.state !== 'running') { if (!l.log.note.includes('sidans ljud går inte än')) l.log.note.push('sidans ljud går inte än'); return; }
    const rate = l.video.playbackRate || 1, start = Math.max(now() + LEAD * 1000, frame.expectedDisplayTime), film = frame.mediaTime + (start - frame.expectedDisplayTime) / 1000 * rate;
    if (film >= buffer.duration - TAIL) { end(l, 'inget kvar att säga'); return; }
    const stamp = context.getOutputTimestamp?.(), at = stamp && stamp.performanceTime && stamp.contextTime !== undefined ? stamp.contextTime + (start - stamp.performanceTime) / 1000 : context.currentTime + (start - now()) / 1000 - (context.outputLatency || 0) - (context.baseLatency || 0);
    const source = context.createBufferSource(), gain = context.createGain(); source.buffer = buffer; source.playbackRate.value = rate; source.connect(gain).connect(context.destination);
    source.start(Math.max(context.currentTime, at), Math.max(0, film));
    l.source = source; l.gain = gain; l.at = start; l.film = film; l.rate = rate;
    if (l.log.startedAt === null) { l.log.startedAt = Math.round(start); l.log.filmTime = Number(film.toFixed(3)); l.log.heard = true; }
  }
  // Every frame the film presents: the sound is set once the film runs (RUNNING), and held against each frame after that. A film that has stalled or
  // jumped (a frame shown more than DRIFT ms from where the sound is) gets its sound set anew from that frame.
  function watch(l: Line, buffer: AudioBuffer) {
    const onFrame = (frame: Frame, clock = false) => { if (line !== l || gone) return;
      if (frame.mediaTime > l.seen + 1e-4) l.moved++; l.seen = frame.mediaTime;
      if (!l.source) { if (clock || l.moved >= RUNNING) set(l, buffer, frame); }
      else { const due = l.at + (frame.mediaTime - l.film) * 1000 / l.rate, off = frame.expectedDisplayTime - due;
        if (Math.abs(off) > DRIFT) { if (l.log.resyncs >= RESYNCS) { l.log.note.push(`filmen ${Math.round(off)} ms från ljudet för fjärde gången`); end(l, 'filmen hackar'); return; }
          l.log.resyncs++; l.log.note.push(`filmen ${Math.round(off)} ms från ljudet vid ${frame.mediaTime.toFixed(2)} s: ljudet sattes om`); hush(l); set(l, buffer, frame); } } };
    const v = l.video;
    if (v.requestVideoFrameCallback) { const call = (_: number, meta: {mediaTime: number; expectedDisplayTime: number}) => { if (line !== l || gone) return; onFrame(meta); if (line === l) l.asked = v.requestVideoFrameCallback(call); }; l.asked = v.requestVideoFrameCallback(call); }
    // Without frame times (an older phone): the element's clock, read as the film gets going and a few times a second after.
    else { const tick = () => onFrame({mediaTime: v.currentTime, expectedDisplayTime: now()}, true); v.addEventListener('timeupdate', tick, {signal: l.off.signal}); if (!v.paused) tick(); }
  }
  return {
    /**
     * The film queue's word that a film with sound was refused its start and now plays muted: `video` is that film's element. The
     * film's sound is read (once per film) and played against the film until the element stops: the part ends or is cut, the
     * queue is paused or taken down.
     */
    refused(part: VoicePart, video: HTMLVideoElement): void {
      if (gone) return; needed = true; if (line) end(line, 'en ny replik');
      const log: VoiceLog = {path: part.path, refusedAt: Math.round(now()), read: 'reading', startedAt: null, filmTime: null, heard: false, resyncs: 0, endedAt: null, ended: '', note: []}; logs.push(log); if (logs.length > 40) logs.shift();
      const l: Line = line = {path: part.path, video, off: new AbortController(), asked: 0, source: null, gain: null, at: 0, film: 0, rate: 1, seen: -1, moved: 0, log};
      for (const type of ['pause', 'ended', 'emptied']) video.addEventListener(type, () => end(l, type === 'pause' ? 'filmen stannade' : type === 'ended' ? 'filmen tog slut' : 'filmen togs bort'), {signal: l.off.signal});
      const sound = read(part.path);
      void sound.done.then(() => { log.read = sound.state === 'ready' ? 'ready' : 'failed'; if (line !== l || gone) return;
        if (!sound.buffer) { log.note.push(`ljudet kunde inte läsas (${sound.error})`); end(l, 'inget ljud'); return; }
        watch(l, sound.buffer); });
    },
    /** Reads a talk film's sound ahead, so that its line is in step from the first frame. Worth the film's bytes only where starts are refused (needed). */
    preload(path: string): Promise<void> { return gone ? Promise.resolve() : read(path).done; },
    /** Whether this page has had a start with sound refused: the browser is one that needs this layer. */
    get needed() { return needed; },
    /** What the last lines did (newest last), for a proof recorder. */
    get log(): readonly VoiceLog[] { return logs; },
    dispose() { if (gone) return; if (line) end(line, 'sidan stängdes'); gone = true; sounds.clear(); },
  };
}
export type Voice = ReturnType<typeof createVoice>;
