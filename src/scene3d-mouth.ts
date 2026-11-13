// The mouth layer: a spoken line laid on the film that is playing, from a mouth patch made in advance (src/speech-patch.ts).
// No graphics card in the game and no new film: the patch's cell for the frame on screen is mixed into the film's own colour in
// the film shader, before the key, so that she is keyed, shaded and lit as she always is (src/scene3d-film.ts calls mouthOver
// where it reads the film), and the line's sound is played with Web Audio so that it is heard as the film shows its frames.
//
// A part of the film queue carries a patch in `mouth` (MouthPart). The layer reads the patch's strip and sound in advance
// (preload); when the part comes on screen with both read, every drawn frame gets the cell of the film frame on screen, and the
// sound is set to begin when the frame of its first sample is shown. A patch that is not read in time is not laid: the part plays
// as it always did and the line is the chat's text (begin(false)). The sound follows the page's rule for spoken films: it is
// heard once the page has been touched, and before that the mouth moves without it, as a talk film then plays muted.
import * as T from 'three';
import {cellAt, cellOf, readWav, type MouthPatch} from './speech-patch.ts';

// The shader's half (src/scene3d-film.ts puts it in its fragment shader and calls mouthOver on the film's colour where it reads
// it). uv: the film's own texture coordinate (y up) of the pixel being drawn, after any frame of its own or life in her body has
// moved it, so the patch moves with her. mouthFilm: the film's own size in pixels; mouthBox: x, y, w, h in them (y down);
// mouthCell: the cell's corner in the strip and mouthStrip the strip's size, in pixels (y down, the strip is not flipped);
// mouthWeight: the gate's weight of this frame; mouthFeather: the edge (featherMask in src/speech-plan.ts, maskAt in
// src/speech-patch.ts). The mix is in the film's coded values, as the speech tool lays a mouth back.
export const MOUTH_GLSL = `uniform sampler2D mouthMap; uniform float mouthOn, mouthWeight, mouthFeather; uniform vec4 mouthBox; uniform vec2 mouthCell, mouthStrip, mouthFilm;
vec3 mouthOver(vec2 uv, vec3 c){
  if (mouthOn < .5) return c;
  vec2 p = vec2(uv.x, 1. - uv.y) * mouthFilm - mouthBox.xy;
  float d = min(min(p.x, mouthBox.z - p.x), min(p.y, mouthBox.w - p.y)); if (d <= 0.) return c;
  float t = min(1., d / max(1., mouthFeather)), m = t * t * (3. - 2. * t) * mouthWeight;
  vec2 q = clamp(p, vec2(.5), mouthBox.zw - .5) + mouthCell; // read inside the cell, never from the one beside it
  return mix(c, textureLod(mouthMap, q / mouthStrip, 0.).rgb, m);
}`;
export type MouthUniforms = {mouthMap: {value: T.Texture | null}; mouthOn: {value: number}; mouthWeight: {value: number}; mouthFeather: {value: number}; mouthBox: {value: T.Vector4}; mouthCell: {value: T.Vector2}; mouthStrip: {value: T.Vector2}; mouthFilm: {value: T.Vector2}};
/** The shader's uniforms, nothing laid. */
export const mouthUniforms = (): MouthUniforms => ({mouthMap: {value: null}, mouthOn: {value: 0}, mouthWeight: {value: 0}, mouthFeather: {value: 24}, mouthBox: {value: new T.Vector4()}, mouthCell: {value: new T.Vector2()}, mouthStrip: {value: new T.Vector2(1, 1)}, mouthFilm: {value: new T.Vector2(1764, 1174)}});
/** What is laid on the frame being drawn: the strip, the cell and its weight, the box and the film's size. Null: nothing. */
export type MouthShown = {texture: T.Texture; cell: {x: number; y: number}; weight: number; patch: Pick<MouthPatch, 'box' | 'feather' | 'film' | 'strip'>};
export function putMouth(u: MouthUniforms, shown: MouthShown | null): void {
  u.mouthOn.value = shown && shown.weight > 0 ? 1 : 0; if (!shown) { u.mouthMap.value = null; return; }
  const {box, feather, film, strip} = shown.patch;
  u.mouthMap.value = shown.texture; u.mouthWeight.value = shown.weight; u.mouthFeather.value = feather;
  u.mouthBox.value.set(box.x, box.y, box.w, box.h); u.mouthCell.value.set(shown.cell.x, shown.cell.y); u.mouthStrip.value.set(strip.width, strip.height); u.mouthFilm.value.set(film.width, film.height);
}

/** A patch as a part of the film queue carries it: its record, the folder its files are read from (ending in /), and what is done when its line begins (said: false when it could not be laid, and the line is the chat's text). */
export type MouthPart = {patch: MouthPatch; base: string; begin?: (said: boolean) => void};
/** What the layer needs of the part on screen. */
type Shown = {mouth?: MouthPart | null; fps?: number} | null;
type Read = {patch: MouthPatch; state: 'reading' | 'ready' | 'failed'; texture: T.Texture | null; sound: AudioBuffer | null; error: string; done: Promise<void>};
/** One line being said: the part it is laid on, when its sound was set to begin (ms on the page's clock) and what was seen. */
type Line = {part: MouthPart; read: Read | null; video: HTMLVideoElement | null; source: AudioBufferSourceNode | null; gain: GainNode | null; at: number; begun: boolean; cut: boolean; asked: number;
  meta: {mediaTime: number; expectedDisplayTime: number; rate: number} | null; log: LineLog};
/** What a line did, for the proof recorder: when its sound was set to begin and against which frame, and per drawn frame with a
 * cell [ms on the page's clock, the film frame laid for, the cell, the frame of the element's picture now, the frame of its clock]. */
export type LineLog = {id: string; said: boolean | null; heard: boolean; soundAt: number | null; soundFrame: number | null; shown: [number, number, number, number, number][]; note: string[]};
// LEAD: seconds before its first sample that a line's sound is set to begin (late enough that the film plays at its pace, early
// enough to set it). DRIFT: ms a shown frame may lie from where the sound is before the line is ended.
const LEAD = 0.25, DRIFT = 80;

// options: the page's clock (now, ms) and how a call is put off (later); a test hands in its own of both.
export function createMouthLayer(set: (shown: MouthShown | null) => void, options: {now?: () => number; later?: (call: () => void, ms: number) => void} = {}) {
  const now = options.now ?? (() => performance.now()), later = options.later ?? ((call: () => void, ms: number) => { setTimeout(call, ms); }), reads = new Map<string, Read>(), logs: LineLog[] = [];
  // ended: the patch of the last line, while its part is still on screen (a line ended early is not begun again)
  let line: Line | null = null, ended: MouthPart | null = null, gone = false, audio: AudioContext | null = null, shownLast = false;
  const keyOf = (p: MouthPart) => `${p.base}${p.patch.id}:${p.patch.strip.sha256}:${p.patch.sound.sha256}`;
  // The strip and the sound of a patch, read once. A file whose bytes are not the record's is not used.
  function read(p: MouthPart): Read {
    const key = keyOf(p); let r = reads.get(key); if (r) return r;
    const item: Read = r = {patch: p.patch, state: 'reading', texture: null, sound: null, error: '', done: Promise.resolve()};
    const bytes = async (path: string, sha256: string) => { const res = await fetch(p.base + path); if (!res.ok) throw Error(`${path}: ${res.status}`); const data = new Uint8Array(await res.arrayBuffer());
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map(b => b.toString(16).padStart(2, '0')).join(''); if (hash !== sha256) throw Error(`${path}: inte postens sha256`); return data; };
    item.done = (async () => {
      const [strip, wav] = await Promise.all([bytes(p.patch.strip.path, p.patch.strip.sha256), bytes(p.patch.sound.path, p.patch.sound.sha256)]);
      const bitmap = await createImageBitmap(new Blob([strip], {type: p.patch.strip.type}), {colorSpaceConversion: 'none', premultiplyAlpha: 'none', imageOrientation: 'none'});
      if (bitmap.width !== p.patch.strip.width || bitmap.height !== p.patch.strip.height) throw Error('rutnätet har fel storlek');
      const texture = new T.Texture(bitmap as unknown as HTMLImageElement); texture.colorSpace = T.NoColorSpace; texture.flipY = false; texture.generateMipmaps = false; texture.minFilter = texture.magFilter = T.LinearFilter; texture.needsUpdate = true;
      const pcm = readWav(wav), sound = new AudioBuffer({length: pcm.samples, sampleRate: pcm.rate, numberOfChannels: 1}); sound.copyToChannel(pcm.data[0], 0);
      if (gone) { texture.dispose(); bitmap.close(); return; }
      item.texture = texture; item.sound = sound; item.state = 'ready';
    })().catch(error => { item.state = 'failed'; item.error = String((error as Error)?.message ?? error); });
    reads.set(key, item); return item;
  }
  // The page's audio, made the first time a line is to be heard; it runs once the page has been touched.
  function context(): AudioContext | null {
    if (!globalThis.AudioContext) return null;
    if (!audio) audio = new AudioContext({latencyHint: 'interactive'});
    if (audio.state === 'suspended' && globalThis.navigator?.userActivation?.hasBeenActive) void audio.resume().catch(() => {});
    return audio;
  }
  // The film frame of the picture the video element gives now (its own timestamp); without VideoFrame the element's clock. The scene
  // gives the layer the frame its film queue says is shown (the one the cards are drawn for); this is for a page that does not.
  function frameOn(video: HTMLVideoElement, fps: number): number {
    if (globalThis.VideoFrame) { try { const frame = new VideoFrame(video), at = frame.timestamp; frame.close(); return Math.floor(at / 1e6 * fps + 1e-3); } catch { /* no frame yet */ } }
    return Math.floor(video.currentTime * fps + 1e-3);
  }
  // A frame's display, for the sound: requestVideoFrameCallback gives the media time of each frame presented and when it shows.
  // Once the sound plays, every frame is held against it: a film that stalls or jumps (a frame shown more than DRIFT ms from where
  // the sound is) ends the line, sound and mouth, rather than let her speak out of step.
  function watch(l: Line, video: HTMLVideoElement) {
    if (!video.requestVideoFrameCallback) return;
    const call = (_: number, meta: VideoFrameCallbackMetadata) => { if (line !== l || gone) return;
      l.meta = {mediaTime: meta.mediaTime, expectedDisplayTime: meta.expectedDisplayTime, rate: video.playbackRate || 1}; schedule(l);
      if (l.begun && l.at) { const p = l.part.patch, due = l.at + (meta.mediaTime - p.sound.startsAtSeconds) * 1000 / l.meta.rate, off = meta.expectedDisplayTime - due;
        if (meta.mediaTime >= p.sound.startsAtSeconds && Math.abs(off) > DRIFT) { l.log.note.push(`filmen ${Math.round(off)} ms från ljudet vid ruta ${Math.floor(meta.mediaTime * p.film.fps + 1e-3)}: repliken avbröts`); l.cut = true; stopLine(l); return; } }
      l.asked = video.requestVideoFrameCallback(call); };
    l.asked = video.requestVideoFrameCallback(call);
  }
  // Sets the line's sound to begin as the film's time of its first sample is shown, once that is less than LEAD away; or, with
  // the page silent, only says when it begins. A line found late by more than a few frames is not heard. A film that stands still
  // (a lab page stepping it frame by frame) shows each frame's mouth and sets no sound.
  function schedule(l: Line) {
    if (l.begun || !l.meta || !l.read?.sound || l.video?.paused) return;
    const p = l.part.patch, t0 = p.sound.startsAtSeconds, show = l.meta.expectedDisplayTime + (t0 - l.meta.mediaTime) * 1000 / l.meta.rate, wait = show - now();
    if (wait > LEAD * 1000) return;
    // a page that has been touched but whose sound is still starting (resume takes a moment) gets until the frame before the line
    const ctx = context(), heard = !!ctx && ctx.state === 'running';
    if (!heard && ctx && globalThis.navigator?.userActivation?.hasBeenActive && wait > 1000 / p.film.fps) return;
    l.begun = true; l.log.soundFrame = Math.floor(t0 * p.film.fps + 1e-3);
    if (heard) {
      const stamp = ctx!.getOutputTimestamp?.(), at = stamp && stamp.performanceTime && stamp.contextTime !== undefined ? stamp.contextTime + (show - stamp.performanceTime) / 1000 : ctx!.currentTime + wait / 1000 - (ctx!.outputLatency || 0) - (ctx!.baseLatency || 0);
      const late = ctx!.currentTime - at;
      if (late > 0.12) { l.log.note.push(`ljudet ${Math.round(late * 1000)} ms sent: inte sagt`); l.cut = true; stopLine(l); return; }
      const source = ctx!.createBufferSource(), gain = ctx!.createGain(); source.buffer = l.read.sound; source.connect(gain).connect(ctx!.destination);
      if (late > 0) source.start(ctx!.currentTime, late); else source.start(at);
      l.source = source; l.gain = gain; l.log.heard = true;
    }
    l.at = show; l.log.soundAt = show;
    later(() => { if (line === l && !gone && !l.cut) finish(l, true); }, Math.max(0, wait));
  }
  // begin is called once per line: true as its sound begins, false when it was not said (its text then stands in the chat).
  function finish(l: Line, said: boolean) { if (l.log.said !== null) return; l.log.said = said; l.part.begin?.(said); }
  // Ends a line: its frame watch, its sound (faded over 30 ms, no click), and its begin if that has not come.
  function stopLine(l: Line) {
    if (l.asked && l.video?.cancelVideoFrameCallback) l.video.cancelVideoFrameCallback(l.asked);
    if (l.source && audio) { const t = audio.currentTime; l.gain!.gain.setValueAtTime(l.gain!.gain.value, t); l.gain!.gain.linearRampToValueAtTime(0, t + 0.03); l.source.stop(t + 0.04); }
    l.source = null; finish(l, false);
    if (line === l) { line = null; ended = l.part; }
  }
  return {
    /** Reads patches ahead (their strips and sounds), so that a line can begin the moment its film does; done when all are read or failed. */
    preload(parts: MouthPart[]): Promise<void> { return gone ? Promise.resolve() : Promise.all(parts.map(p => read(p).done)).then(() => {}); },
    /** Whether a patch's files are read: 'ready', 'reading', 'failed' or 'unknown'. */
    state(p: MouthPart) { return reads.get(keyOf(p))?.state ?? 'unknown'; },
    /**
     * Each drawn frame: the part on screen, its video and the film frame shown (the film queue's frame(), which the cards use). Lays
     * that frame's cell (or nothing), begins a line when its part comes on screen and ends it when the part goes.
     */
    update(part: Shown, video: HTMLVideoElement | null, shownFrame?: number) {
      if (gone) return;
      const mouth = part?.mouth ?? null;
      if (line && line.part !== mouth) stopLine(line);
      if (ended && ended !== mouth) ended = null;
      if (mouth && !line && mouth !== ended) {
        const r = read(mouth), log: LineLog = {id: mouth.patch.id, said: null, heard: false, soundAt: null, soundFrame: null, shown: [], note: []}; logs.push(log); if (logs.length > 40) logs.shift();
        line = {part: mouth, read: r.state === 'ready' ? r : null, video, source: null, gain: null, at: 0, begun: false, cut: false, asked: 0, meta: null, log};
        if (!line.read) { log.note.push(`lappen inte inläst (${r.state}${r.error ? `: ${r.error}` : ''})`); const l = line; line = null; ended = mouth; finish(l, false); }
        else { context(); if (video) watch(line, video); } // the page's sound is started now, well before the line's first sample
      }
      let shown: MouthShown | null = null;
      if (line?.read?.texture && !line.cut && video && video.readyState >= 2) {
        const p = line.part.patch, frame = shownFrame ?? frameOn(video, p.film.fps), i = cellOf(p, frame);
        if (i >= 0) { shown = {texture: line.read.texture, cell: cellAt(i, p.strip.columns, p.box.w, p.box.h), weight: p.weights[i], patch: p};
          if (line.log.shown.length < 2000) line.log.shown.push([Math.round(now()), frame, i, frameOn(video, p.film.fps), Math.floor(video.currentTime * p.film.fps + 1e-3)]); }
      }
      if (shown || shownLast) set(shown); shownLast = !!shown;
    },
    /** What the last lines did (newest last), for the proof recorder. */
    get log(): readonly LineLog[] { return logs; },
    /** The page's audio, when a line has made it (the proof recorder taps it). */
    get audio() { return audio; },
    dispose() {
      if (gone) return; if (line) stopLine(line); gone = true; set(null); shownLast = false;
      for (const r of reads.values()) { r.texture?.dispose(); ((r.texture?.image ?? null) as ImageBitmap | null)?.close?.(); } reads.clear();
      void audio?.close().catch(() => {}); audio = null;
    },
  };
}
export type MouthLayer = ReturnType<typeof createMouthLayer>;
