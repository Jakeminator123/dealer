// Page code of sound.html: the sound lab ("Ljud-labb"). The sounds of the table (chips and cards) and the rooms'
// backgrounds, all made in the browser with the Web Audio API: no audio files, nothing downloaded, every sound tunable here.
// A lab on a side track: the game does not use it yet. createSound() is the interface the game will use later.
//
// The first half has no page and no audio context in it: seeded randomness, what each sound is made of (its plan, drawn
// from a seed so that no two clicks are alike and a test can repeat them), the sounds themselves as samples, the rooms'
// recipes and the planner that says what happens in a room when, and the measuring used by the tests and the proof.
// tools/lab-sound.test.ts runs it under Node. The second half puts it on a Web Audio graph (createSound) and is the page,
// started only where there is a document. Importing the module never touches AudioContext.

// ── names, defaults and levels ──────────────────────────────────────────────
export type RoomSound = 'salong' | 'panorama' | 'la' | 'skog' | 'hall';
export type ChipKind = 'felt' | 'stack' | 'take' | 'sweep';
export type CardKind = 'draw' | 'land' | 'turn';
export type ChipOptions = {count?: number; height?: number; pan?: number; strength?: number};
export type CardOptions = {pan?: number};
export type SoundSettings = {volume: number; effects: number; ambience: number; music: number; muted: boolean};
export type SoundState = SoundSettings & {unlocked: boolean; room: RoomSound | null; track: MusicTrack | null};
export type Sound = {
  /** Call from a user gesture: creates or resumes the AudioContext (browsers allow no sound before one). */
  unlock(): void;
  chip(kind: ChipKind, options?: ChipOptions): void;
  card(kind: CardKind, options?: CardOptions): void;
  /** Crossfades to the room's background; null fades it out. A room chosen before unlock() starts with the sound. */
  ambience(room: RoomSound | null): void;
  /** Fades to the track (crossfading from one that plays); null fades the music out. A track chosen before unlock() starts with the sound. */
  music(track: MusicTrack | null): void;
  set(patch: Partial<SoundSettings>): void;
  state(): SoundState;
  dispose(): void;
  /** For a level meter: the output's left and right analysers once there is an audio context, otherwise null. */
  taps(): {left: AnalyserNode; right: AnalyserNode} | null;
};

export const ROOM_IDS: RoomSound[] = ['salong', 'panorama', 'la', 'skog', 'hall'];
/** The chooser on the page, in its order; null is no background. */
export const ROOMS: {id: RoomSound | null; label: string; note: string}[] = [
  {id: null, label: 'Tyst', note: 'Ingen bakgrund. Bara markerna och korten hörs.'},
  {id: 'salong', label: 'Salong', note: 'En lugn salong: ett lågt rumsbrus, ett svagt sorl långt bort och då och då ett glas.'},
  {id: 'panorama', label: 'Las Vegas', note: 'En stor spelhall i Las Vegas: sorl från många människor, spelautomater och mynt långt bort.'},
  {id: 'la', label: 'Skyline', note: 'En takvåning över staden i skymningen: vind, ett lågt brus från staden och trafik långt nere.'},
  {id: 'skog', label: 'Skog', note: 'En skog: vind i lövverket och fåglar, några nära och några längre bort.'},
  {id: 'hall', label: 'Spelhall', note: 'En spelhall med automaterna nära: elektroniska pip och slingor, ventilationens brus och sorl.'},
];
export const SOUND_DEFAULTS: SoundSettings = {volume: 1, effects: 1, ambience: 0.5, music: 0.5, muted: false};

export const LEVEL = {
  /** No single table sound peaks above this, in dBFS of its own samples (hard to one side; in the middle each channel is 3 dB lower). */
  ceilingDb: -6.5,
  /** The safety net on the output. It sits above the effects' ceiling, so that it only acts when many sounds pile up. */
  limiter: {thresholdDb: -3, ratio: 20, attack: 0.002, release: 0.12},
  /** Seconds between two rooms. */
  crossfade: 1.5,
  /** Time constant of a slider or the mute button, seconds: quick, but without a click. */
  slide: 0.015,
  /** How far ahead the rooms' events are planned and put on the graph, seconds. */
  lookahead: 1.5,
  /** The table's own little room when there is no background, dB of reverb. */
  quietWetDb: -24,
  /**
   * Where every room sits at the default Bakgrund (50 %): its A-weighted RMS over a minute, dB of full scale. A chip on chips
   * peaks around −11 dBFS in the middle, so the background lies some 30 dB under the clicks and about 12 dB under their
   * loudest 50 ms. The rooms' trimDb are measured to it.
   */
  ambienceDbA: -43,
  /**
   * Where every music track sits at the default Musik (50 %): A-weighted RMS over two minutes, dB of full scale. Five dB over
   * the backgrounds and well under the clicks, whose energy lies above 2 kHz where the music has little. The tracks' trimDb
   * are measured to it.
   */
  musicDbA: -38,
  /** Seconds the music takes to fade in, and out when it stops or gives way to another track. */
  musicIn: 2, musicOut: 2.5,
  /** On a change of track the new one begins this long after the old one starts to fade, so that two keys overlap little. */
  musicGap: 0.8,
};

const TAU = 2 * Math.PI;
export const clamp = (v: number, a: number, b: number) => v < a ? a : v > b ? b : v;
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const num = (v: unknown, otherwise: number) => typeof v === 'number' && Number.isFinite(v) ? v : otherwise;
export const dbToGain = (db: number) => Math.pow(10, db / 20);
export const gainToDb = (gain: number) => gain > 0 ? 20 * Math.log10(gain) : -Infinity;
/** A slider's 0–1 as a gain: the square, so that the lower half of the slider is not all silence. */
export const sliderGain = (v: number) => { const x = clamp01(num(v, 0)); return x * x; };
/**
 * The gain the browser's DynamicsCompressorNode adds by itself (the Web Audio specification's makeup gain: the inverse of
 * what the curve does to a full-scale signal, to the power 0.6). The engine takes it off again after the limiter, so that a
 * sound under the threshold leaves at the level it came in.
 */
export function limiterMakeup(thresholdDb: number, ratio: number): number { return dbToGain(-0.6 * thresholdDb * (1 - 1 / ratio)); }

// ── seeded randomness ───────────────────────────────────────────────────────
export type Rng = {next(): number; range(a: number, b: number): number; int(a: number, b: number): number; chance(p: number): boolean; pick<T>(list: readonly T[]): T; normal(): number; seed(): number};
/** mulberry32: small, fast, and the same numbers for the same seed everywhere. */
export function createRng(seed: number): Rng {
  let s = Math.floor(num(seed, 0)) >>> 0;
  const next = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return {
    next, range: (a, b) => a + (b - a) * next(), int: (a, b) => a + Math.floor(next() * (b - a + 1)), chance: p => next() < p,
    pick: list => list[Math.floor(next() * list.length)],
    normal: () => Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(TAU * next()),
    seed: () => Math.floor(next() * 4294967296),
  };
}
const within = (rng: Rng, range: readonly number[]) => rng.range(range[0], range[1]);
function weighted<T>(rng: Rng, entries: readonly (readonly [T, number])[]): T {
  let total = 0; for (const [, w] of entries) total += w;
  let x = rng.next() * total; for (const [value, w] of entries) { x -= w; if (x < 0) return value; }
  return entries[entries.length - 1][0];
}

// ── small signal pieces ─────────────────────────────────────────────────────
/** Every rendered sound starts with this much silence, so that its first sample is zero; the engine starts it this much early. */
export const LEAD = 0.001;
type Coeffs = {b0: number; b1: number; b2: number; a1: number; a2: number};
/** A biquad (Robert Bristow-Johnson's cookbook). q is the plain quality factor; the band-pass peaks at 0 dB. */
function coeffs(type: 'lowpass' | 'highpass' | 'bandpass' | 'peak', hz: number, q: number, rate: number, db = 0): Coeffs {
  const w = TAU * Math.min(hz, rate * 0.49) / rate, cos = Math.cos(w), alpha = Math.sin(w) / (2 * q), A = Math.pow(10, db / 40);
  let b0 = 0, b1 = 0, b2 = 0, a0 = 1 + alpha, a1 = -2 * cos, a2 = 1 - alpha;
  if (type === 'lowpass') { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0; }
  else if (type === 'highpass') { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0; }
  else if (type === 'bandpass') { b0 = alpha; b2 = -alpha; }
  else { b0 = 1 + alpha * A; b1 = -2 * cos; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a2 = 1 - alpha / A; }
  return {b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0};
}
function filter(x: Float32Array, c: Coeffs): Float32Array {
  let z1 = 0, z2 = 0;
  for (let i = 0; i < x.length; i++) { const v = x[i], y = c.b0 * v + z1; z1 = c.b1 * v - c.a1 * y + z2; z2 = c.b2 * v - c.a2 * y; x[i] = y; }
  return x;
}
/** A band-pass whose centre moves from one frequency to another (evenly in pitch) over [start, end) of x, in place. */
function sweepBand(x: Float32Array, start: number, end: number, from: number, to: number, q: number, rate: number) {
  let z1 = 0, z2 = 0, c = coeffs('bandpass', from, q, rate);
  for (let i = start; i < end && i < x.length; i++) {
    if ((i - start) % 32 === 0) c = coeffs('bandpass', from * Math.pow(to / from, (i - start) / Math.max(1, end - start)), q, rate);
    const v = x[i], y = c.b0 * v + z1; z1 = c.b1 * v - c.a1 * y + z2; z2 = c.b2 * v - c.a2 * y; x[i] = y;
  }
}
function peakOf(x: Float32Array): number { let p = 0; for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > p) p = a; } return p; }
function scaleTo(x: Float32Array, peak: number): Float32Array { const p = peakOf(x); if (p > 0) { const k = peak / p; for (let i = 0; i < x.length; i++) x[i] *= k; } return x; }
/** Adds part to out at the given level, part first brought to a peak of 1: the parts of a sound are mixed by their peaks. */
function mixUnit(out: Float32Array, part: Float32Array, db: number) {
  if (db < -70) return; const p = peakOf(part); if (!p) return;
  const k = dbToGain(db) / p; for (let i = 0; i < out.length && i < part.length; i++) out[i] += part[i] * k;
}
/** A raised-cosine fade to zero over the last samples, so that nothing ends with a step. */
function fadeOut(x: Float32Array, samples: number) { const n = Math.min(samples, x.length); for (let i = 0; i < n; i++) x[x.length - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / n); }
function fadeIn(x: Float32Array, samples: number) { const n = Math.min(samples, x.length); for (let i = 0; i < n; i++) x[i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / n); }
const white = (rng: Rng) => rng.next() * 2 - 1;
function whiteNoise(n: number, rng: Rng): Float32Array { const x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = white(rng); return x; }
/** Pink noise (Paul Kellet's filter): equal energy per octave, the colour of a room's air. */
function pinkNoise(n: number, rng: Rng): Float32Array {
  const x = new Float32Array(n); let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = white(rng);
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    x[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
  }
  return x;
}
/** Brown noise: falls 6 dB an octave above about 150 Hz (at 48 kHz) and is flat below, so it rumbles without drifting. */
function brownNoise(n: number, rng: Rng): Float32Array { const x = new Float32Array(n); let y = 0; for (let i = 0; i < n; i++) { y = (y + 0.02 * white(rng)) / 1.02; x[i] = y * 3.5; } return x; }

/** A half-sine force pulse added to x: a contact lasting width samples whose samples sum to area. */
function pulse(x: Float32Array, at: number, width: number, area: number) {
  const n = Math.max(2, Math.round(width)), start = Math.round(at); let sum = 0;
  for (let k = 0; k < n; k++) sum += Math.sin(Math.PI * (k + 0.5) / n);
  for (let k = 0; k < n; k++) if (start + k >= 0 && start + k < x.length) x[start + k] += area * Math.sin(Math.PI * (k + 0.5) / n) / sum;
}
/** A short burst of noise added to x, dying away with the time constant decay (samples). */
function burst(x: Float32Array, rng: Rng, at: number, decay: number, amp: number) {
  const start = Math.round(at), n = Math.round(decay * 5);
  for (let k = 0; k < n && start + k < x.length; k++) x[start + k] += amp * white(rng) * Math.exp(-k / decay) * Math.min(1, (k + 1) / 3);
}
/** One mode of a struck body: a frequency, its share of the ringing and its decay time constant (seconds). */
export type Mode = {f: number; a: number; tau: number};
/**
 * Rings a set of modes with the force in exc and adds them to out: one two-pole resonator per mode, scaled so that a pulse of
 * area 1 rings a mode at amplitude a. What reaches the ear is the air pushed by the surface's acceleration, which has no net
 * offset, so each resonator has a zero at 0 Hz (the band-pass form): a struck body gives no DC. damp: from that sample on,
 * every mode dies factor times faster (a chip that has come to lie flat is held by what it lies on).
 */
function ring(out: Float32Array, exc: Float32Array, modes: Mode[], rate: number, damp?: {at: number; factor: number}) {
  let first = 0, last = exc.length - 1; while (last > 0 && exc[last] === 0) last--; while (first < last && exc[first] === 0) first++;
  for (const m of modes) {
    if (m.f >= rate * 0.45 || m.f <= 0 || !m.a) continue;
    const theta = TAU * m.f / rate, g = m.a / 2, c = 2 * Math.cos(theta);
    let r = Math.exp(-1 / (m.tau * rate)), a1 = c * r, a2 = -r * r, y1 = 0, y2 = 0, x1 = 0, x2 = 0;
    const end = Math.min(out.length, last + Math.ceil(10 * m.tau * rate) + 1);
    if (damp && damp.at < first) { r = Math.exp(-damp.factor / (m.tau * rate)); a1 = c * r; a2 = -r * r; }
    for (let n = first; n < end; n++) {
      if (damp && n === damp.at) { r = Math.exp(-damp.factor / (m.tau * rate)); a1 = c * r; a2 = -r * r; }
      const x = exc[n], y = g * (x - x2) + a1 * y1 + a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; out[n] += y;
    }
  }
}
/** Rings modes with a few contacts (seconds after at) into out, working only over the span they need: for many small bodies in one long sound. */
function strike(out: Float32Array, at: number, contacts: {at: number; force: number; width: number}[], modes: Mode[], rate: number) {
  const tau = Math.max(...modes.map(m => m.tau)), end = Math.max(...contacts.map(c => c.at + c.width)), span = Math.ceil((end + 10 * tau) * rate) + 2, offset = Math.round(at * rate);
  const exc = new Float32Array(span), rung = new Float32Array(span);
  for (const c of contacts) pulse(exc, c.at * rate, c.width * rate, c.force);
  ring(rung, exc, modes, rate);
  for (let i = 0; i < span && offset + i < out.length; i++) if (offset + i >= 0) out[offset + i] += rung[i];
}
/** The slope of a force: what a hard body radiates when it is stopped short, before anything rings. */
function slope(exc: Float32Array, rate: number): Float32Array {
  const x = new Float32Array(exc.length); for (let i = 1; i < exc.length; i++) x[i] = exc[i] - exc[i - 1];
  return filter(filter(x, coeffs('highpass', 2000, 0.7, rate)), coeffs('lowpass', Math.min(14000, rate * 0.4), 0.7, rate));
}

// ── chips ───────────────────────────────────────────────────────────────────
// A casino chip of compressed clay composite: 39 mm across, 3.3 mm thick, about 10 g. Struck, it rings like a free disc. The
// first bending mode of such a disc, from the plate formula with a stiffness of 2–3 GPa, lies around 2–2.9 kHz; the next modes
// are fixed multiples of it (Leissa's table for a free circular plate, Poisson's ratio about 0.33). Clay composite is lossy,
// so each mode dies within milliseconds and the higher ones faster: a click with a short ring, not a bell. No measured
// spectrum of real chips was found (2026-11-11); these are physics and judgement, and every number is here to be tuned by ear.
//
// One chip put down on another is more than one tick: the contact force rings both chips (two slightly different discs, so
// their partials beat), the stack and the table under it give a short low knock, the hard contact itself clicks, the rough
// edge adds a breath of noise, and most chips land on an edge first and slap flat a few milliseconds later, after which the
// chip is held and stops ringing. A tall stack is heavier (a lower, louder knock) and its chips may rattle.
export const CHIP = {
  base: [2250, 2900], ratios: [1, 1.729, 2.328, 3.906, 4.112, 6.3],
  levels: [[1, 1], [0.45, 0.9], [0.5, 1], [0.25, 0.55], [0.25, 0.55], [0.1, 0.3]],
  /** Loss factor: a mode at f rings with the time constant 1 / (π f loss). Raise it for a duller chip, lower it for a ringing one. */
  loss: [0.01, 0.017],
  stackLoss: 1.6, settledLoss: 2.6, feltLoss: 2.4, heldLoss: 1.8, // how much faster a chip dies on a stack, lying flat, on felt, between fingers
  contact: [0.00007, 0.00016], // seconds a chip touches a chip, hardest to softest: the shorter, the brighter
  feltContact: [0.0008, 0.0018], // the felt gives, so the table under it is struck softly
  body: [190, 320], bodyTau: [0.004, 0.009], // the stack and table under a chip on chips
  feltBody: [240, 430], feltBodyTau: [0.004, 0.008], // the table under the felt
  peakDb: {stack: -8, felt: -13, take: -14, sweep: -17},
  strength: 0.8,
};
export type Contact = {at: number; force: number; width: number; body: number}; // seconds after the hit; width: contact on the chips; body: the softer pulse the stack and table get
export type ChipHit = {
  type: 'hit'; at: number; pan: number; peak: number; seed: number; surface: 'chip' | 'felt'; height: number;
  contacts: Contact[]; falling: Mode[]; struck: Mode[]; settleAt: number | null; rattle: {at: number; force: number}[]; body: Mode[];
  /** dB of each part before the whole is brought to its peak. */
  mix: {modes: number; body: number; tick: number; grit: number; brush: number; scrape: number};
  scrape: {at: number; seconds: number; hz: number} | null;
};
/** Chips sliding over the felt as the dealer rakes them in. */
export type Friction = {type: 'friction'; at: number; pan: number; panTo: number; peak: number; seed: number; seconds: number; hz: number};
export type ChipVoice = ChipHit | Friction;

function chipModes(rng: Rng, base: number, loss: number): Mode[] {
  return CHIP.ratios.map((ratio, i) => { const f = base * ratio * rng.range(0.985, 1.015); return {f, a: within(rng, CHIP.levels[i]), tau: 1 / (Math.PI * f * loss * rng.range(0.9, 1.15))}; });
}
/** One chip meeting a chip or the felt. held: a chip between fingers (being taken), which neither bounces nor slaps flat. */
function chipHit(rng: Rng, o: {at: number; surface: 'chip' | 'felt'; height: number; pan: number; strength: number; peakDb: number; held?: boolean}): ChipHit {
  const s = clamp(o.strength, 0.02, 1), heavy = clamp(o.height, 0, 20) / 20, felt = o.surface === 'felt';
  const loss = within(rng, CHIP.loss), base = within(rng, CHIP.base);
  const width = lerp(CHIP.contact[1], CHIP.contact[0], Math.sqrt(s)) * rng.range(0.85, 1.15) * (o.held ? 1.4 : 1);
  const falling = chipModes(rng, base, loss * (felt ? CHIP.feltLoss : o.held ? CHIP.heldLoss : 1));
  const struck = felt ? [] : chipModes(rng, base * rng.range(0.94, 1.06), loss * CHIP.stackLoss * (1 + 0.5 * heavy));
  const first: Contact = {at: 0, force: 1, width: felt ? width * 1.6 : width, body: felt ? within(rng, CHIP.feltContact) : width * rng.range(5, 8)};
  const contacts = [first];
  let settleAt: number | null = null;
  if (!o.held && rng.chance(felt ? 0.6 : 0.75)) {
    settleAt = felt ? rng.range(0.006, 0.022) : rng.range(0.003, 0.016);
    contacts.push({at: settleAt, force: rng.range(0.35, 0.8), width: first.width * 1.2, body: first.body * 1.2});
    if (rng.chance(0.3)) contacts.push({at: settleAt + rng.range(0.002, 0.007), force: rng.range(0.12, 0.3), width: first.width * 1.3, body: first.body});
  }
  const rattle: {at: number; force: number}[] = [];
  if (!felt && rng.chance(Math.min(0.65, 0.08 * o.height))) for (let k = rng.int(1, 3); k > 0; k--) rattle.push({at: rng.range(0.008, 0.04), force: rng.range(0.05, 0.15)});
  const bodyF = felt ? within(rng, CHIP.feltBody) : within(rng, CHIP.body) * (1 - 0.22 * heavy), bodyTau = within(rng, felt ? CHIP.feltBodyTau : CHIP.bodyTau);
  const body: Mode[] = [{f: bodyF, a: 1, tau: bodyTau}, {f: bodyF * rng.range(2.3, 3.1), a: rng.range(0.25, 0.45), tau: bodyTau * 0.5}];
  const mix = felt
    ? {modes: rng.range(-1, 2), body: 0, tick: -80, grit: rng.range(-26, -20), brush: rng.range(-14, -9), scrape: -80}
    : {modes: 0, body: rng.range(-21, -16) + 5 * heavy, tick: rng.range(-12, -6), grit: rng.range(-22, -15), brush: -80, scrape: -80};
  const peakDb = Math.min(LEVEL.ceilingDb, o.peakDb + 16 * Math.log10(s) + rng.range(-1.2, 1.2));
  return {type: 'hit', at: o.at, pan: clamp(o.pan, -1, 1), peak: dbToGain(peakDb), seed: rng.seed(), surface: o.surface, height: o.height, contacts, falling, struck, settleAt, rattle, body, mix, scrape: null};
}
/**
 * When each chip of a small stack set down by hand lands, seconds from the first: they slip from the fingers one by one, a
 * little faster the more there are, unevenly, now and then two almost together.
 */
export function rippleTimes(count: number, rng: Rng): number[] {
  const n = Math.round(clamp(count, 1, 60)), times = [0], mean = Math.max(0.026, 0.056 - 0.0015 * Math.min(n, 20));
  for (let i = 1; i < n; i++) {
    const gap = rng.chance(0.12) ? rng.range(0.004, 0.009) : clamp(mean * Math.exp(0.28 * rng.normal()) * (1 - 0.18 * Math.sin(Math.PI * i / n)), 0.014, 0.11);
    times.push(times[i - 1] + gap);
  }
  return times;
}
/**
 * Everything a chip() call plays, drawn from rng. felt: one chip on the felt (with count, the rest land on it). stack: on a
 * stack of height chips (default 1; 0 means the first lands on the felt). take: a chip slid off a stack and lifted. sweep:
 * the dealer rakes in count chips (default 10).
 */
export function chipPlan(kind: ChipKind, options: ChipOptions, rng: Rng): ChipVoice[] {
  const strength = clamp(num(options.strength, CHIP.strength), 0, 1), pan = clamp(num(options.pan, 0), -1, 1);
  const count = Math.round(clamp(num(options.count, kind === 'sweep' ? 10 : 1), 1, 60)), height = Math.round(clamp(num(options.height, 1), 0, 60));
  if (strength <= 0) return [];
  if (kind === 'sweep') return sweepPlan(count, pan, strength, rng);
  if (kind === 'take') return [takeHit(rng, Math.max(1, height), pan, strength)];
  const first = kind === 'felt' ? 0 : height, many = count > 1;
  return rippleTimes(count, rng).map((at, i) => {
    const onFelt = first + i === 0;
    return chipHit(rng, {at, surface: onFelt ? 'felt' : 'chip', height: first + i, pan: pan + (many ? rng.range(-0.04, 0.04) : 0), strength: strength * (many ? rng.range(0.65, 1) : 1), peakDb: (onFelt ? CHIP.peakDb.felt : CHIP.peakDb.stack) - (many ? 1.5 : 0)});
  });
}
/** A chip taken back: it scrapes off the top of the stack, and clicks lightly as it clears the edge. */
function takeHit(rng: Rng, height: number, pan: number, strength: number): ChipHit {
  const seconds = rng.range(0.03, 0.075), hit = chipHit(rng, {at: 0, surface: 'chip', height, pan, strength, peakDb: CHIP.peakDb.take, held: true}), shift = seconds + rng.range(0, 0.008);
  for (const c of hit.contacts) c.at += shift;
  for (const r of hit.rattle) r.at += shift;
  if (rng.chance(0.5)) hit.contacts.push({at: shift + rng.range(0.012, 0.03), force: rng.range(0.12, 0.25), width: hit.contacts[0].width, body: hit.contacts[0].body});
  hit.scrape = {at: 0, seconds, hz: rng.range(2800, 4800)}; hit.mix.scrape = rng.range(-9, -5);
  return hit;
}
/** The dealer's rake: the pile slides over the felt toward the tray, chips knocking into each other, firmest as it comes together. */
function sweepPlan(count: number, pan: number, strength: number, rng: Rng): ChipVoice[] {
  const seconds = clamp(0.4 + 0.04 * count, 0.45, 1.4), to = pan * 0.5, crowd = 3 * Math.log2(Math.max(1, count / 10)); // many chips: each knock a little softer
  const voices: ChipVoice[] = [{type: 'friction', at: 0, pan, panTo: to, peak: dbToGain(CHIP.peakDb.sweep - 4 + 10 * Math.log10(strength) + rng.range(-1, 1)), seed: rng.seed(), seconds, hz: rng.range(1200, 2200)}];
  const knocks = Math.round(count * 1.8) + rng.int(0, 3);
  for (let i = 0; i < knocks; i++) {
    const at = seconds * (0.08 + 0.84 * Math.pow(rng.next(), 0.6)), where = at / seconds;
    voices.push(chipHit(rng, {at, surface: rng.chance(0.2) ? 'felt' : 'chip', height: rng.int(1, 3), pan: lerp(pan + rng.range(-0.35, 0.35), to, where), strength: strength * (rng.chance(1 / 8) ? rng.range(0.6, 0.9) : rng.range(0.12, 0.6)), peakDb: CHIP.peakDb.sweep - crowd}));
  }
  for (let k = rng.int(3, 6); k > 0; k--) voices.push(chipHit(rng, {at: seconds * rng.range(0.9, 1), surface: 'chip', height: rng.int(2, 6), pan: to + rng.range(-0.1, 0.1), strength: strength * rng.range(0.5, 0.8), peakDb: CHIP.peakDb.sweep - crowd}));
  return voices.sort((a, b) => a.at - b.at);
}
/** The samples of one chip hit, mono, at the given rate: LEAD seconds of silence, then the hit, ending in silence. */
export function renderChipHit(hit: ChipHit, rate: number): Float32Array {
  const rng = createRng(hit.seed), lead = LEAD * rate;
  const lastAt = Math.max(0, ...hit.contacts.map(c => c.at), ...hit.rattle.map(r => r.at), hit.scrape ? hit.scrape.at + hit.scrape.seconds : 0);
  const tau = Math.max(...hit.falling.map(m => m.tau), ...hit.struck.map(m => m.tau), ...hit.body.map(m => m.tau));
  const length = Math.ceil(lead + (lastAt + 8 * tau + 0.004) * rate);
  const force = new Float32Array(length), knock = new Float32Array(length);
  for (const c of hit.contacts) { pulse(force, lead + c.at * rate, c.width * rate, c.force); pulse(knock, lead + c.at * rate, c.body * rate, c.force); }
  const modes = new Float32Array(length);
  ring(modes, force, hit.falling, rate, hit.settleAt === null ? undefined : {at: Math.round(lead + hit.settleAt * rate), factor: CHIP.settledLoss});
  if (hit.struck.length) { const struck = force.slice(); for (const r of hit.rattle) pulse(struck, lead + r.at * rate, CHIP.contact[1] * rate, r.force); ring(modes, struck, hit.struck, rate); }
  const body = new Float32Array(length); ring(body, knock, hit.body, rate);
  // The rough, slightly worn edge of a clay chip gives a breath of noise at each contact; on felt, the felt itself brushes.
  const grit = new Float32Array(length), brush = new Float32Array(length);
  for (const c of hit.contacts) { burst(grit, rng, lead + c.at * rate, 0.0004 * rate, c.force); burst(brush, rng, lead + c.at * rate, rng.range(0.003, 0.007) * rate, c.force); }
  filter(grit, coeffs('highpass', 4500, 0.7, rate)); filter(filter(brush, coeffs('lowpass', 1800, 0.7, rate)), coeffs('highpass', 200, 0.7, rate));
  const out = new Float32Array(length);
  mixUnit(out, modes, hit.mix.modes); mixUnit(out, body, hit.mix.body); mixUnit(out, slope(force, rate), hit.mix.tick); mixUnit(out, grit, hit.mix.grit); mixUnit(out, brush, hit.mix.brush);
  if (hit.scrape) mixUnit(out, renderScrape(hit.scrape, hit.falling, rate, rng, length), hit.mix.scrape);
  fadeOut(out, Math.round(0.003 * rate));
  return scaleTo(out, hit.peak);
}
/** A chip sliding off another: friction in tiny grabs (stick and slip), which also rings the chip a little. */
function renderScrape(s: {at: number; seconds: number; hz: number}, modes: Mode[], rate: number, rng: Rng, length: number): Float32Array {
  const out = new Float32Array(length), start = Math.round((LEAD + s.at) * rate), n = Math.round(s.seconds * rate), a = Math.exp(-TAU * 500 / rate);
  let rough = 0;
  for (let k = 0; k < n && start + k < length; k++) {
    const x = k / n; rough = (1 - a) * Math.abs(white(rng)) * 2 + a * rough;
    const env = Math.sin(Math.PI / 2 * Math.min(1, x / 0.3)) ** 2 * (x > 0.6 ? Math.cos(Math.PI / 2 * (x - 0.6) / 0.4) ** 2 : 1);
    out[start + k] = white(rng) * (0.35 + rough) * env;
  }
  const rung = new Float32Array(length); ring(rung, out, modes.map(m => ({...m, a: m.a * 0.05})), rate);
  sweepBand(out, start, start + n, s.hz, s.hz * 0.8, 1.4, rate);
  mixUnit(out, rung, -8);
  return out;
}
/** The rake's long slide over the felt: a soft hiss in grains, swelling and fading with the stroke. */
export function renderFriction(v: Friction, rate: number): Float32Array {
  const rng = createRng(v.seed), n = Math.ceil((LEAD + v.seconds) * rate), start = Math.round(LEAD * rate), x = new Float32Array(n), a = Math.exp(-TAU * 120 / rate);
  const wobble = [rng.range(0.7, 1), rng.range(0.8, 1), rng.range(0.6, 1), rng.range(0.85, 1)];
  let rough = 0;
  for (let k = start; k < n; k++) {
    const t = (k - start) / (n - start), w = wobble[Math.min(3, Math.floor(t * 4))], env = Math.sin(Math.PI / 2 * Math.min(1, t / 0.12)) ** 2 * (t > 0.72 ? Math.cos(Math.PI / 2 * (t - 0.72) / 0.28) ** 2 : 1);
    rough = (1 - a) * Math.abs(white(rng)) * 2 + a * rough;
    x[k] = white(rng) * (0.4 + rough) * env * w;
  }
  const low = filter(x.slice(), coeffs('lowpass', 500, 0.7, rate));
  filter(x, coeffs('bandpass', v.hz, 0.9, rate));
  mixUnit(x, low, -9); fadeOut(x, Math.round(0.01 * rate));
  return scaleTo(x, v.peak);
}
export const renderChipVoice = (v: ChipVoice, rate: number) => v.type === 'hit' ? renderChipHit(v, rate) : renderFriction(v, rate);

// ── cards ───────────────────────────────────────────────────────────────────
// Paper on plastic and felt: no ringing to speak of, so the cards are made of noise. slide: friction with a moving band
// (rough, in grains). snap: the card springing flat as it clears an edge, a crisp short resonance. flap: the puff of air and
// felt as a card lands. tap: its edge knocking the table through the felt.
export type CardPart =
  | {type: 'slide'; at: number; seconds: number; from: number; to: number; q: number; db: number; grain: number}
  | {type: 'snap'; at: number; hz: number; tau: number; db: number}
  | {type: 'flap'; at: number; seconds: number; hz: number; db: number}
  | {type: 'tap'; at: number; hz: number; tau: number; db: number};
export type CardVoice = {kind: CardKind; pan: number; peak: number; seed: number; parts: CardPart[]};
export const CARD = {peakDb: {draw: -17, land: -15, turn: -14} as Record<CardKind, number>};
/** draw: out of the shoe. land: set down on the felt. turn: flipped over where it lies. */
export function cardPlan(kind: CardKind, options: CardOptions, rng: Rng): CardVoice {
  const pan = clamp(num(options.pan, 0), -1, 1), parts: CardPart[] = [];
  if (kind === 'draw') {
    const seconds = rng.range(0.13, 0.22);
    if (rng.chance(0.5)) parts.push({type: 'tap', at: 0, hz: rng.range(1800, 2600), tau: 0.0015, db: rng.range(-16, -11)}); // the fingertip on the card
    parts.push({type: 'slide', at: 0.005, seconds, from: rng.range(2000, 2800), to: rng.range(3600, 5200), q: rng.range(0.9, 1.4), db: 0, grain: rng.range(0.4, 0.7)});
    parts.push({type: 'snap', at: 0.005 + seconds * rng.range(0.88, 0.98), hz: rng.range(1400, 2400), tau: rng.range(0.0018, 0.0035), db: rng.range(-8, -3)}); // clear of the shoe's lip
    parts.push({type: 'flap', at: 0.005 + seconds, seconds: rng.range(0.03, 0.06), hz: rng.range(600, 1000), db: rng.range(-16, -11)});
  } else if (kind === 'land') {
    parts.push({type: 'flap', at: 0, seconds: rng.range(0.025, 0.045), hz: rng.range(500, 900), db: 0});
    parts.push({type: 'tap', at: rng.range(0.002, 0.006), hz: rng.range(320, 520), tau: rng.range(0.004, 0.008), db: rng.range(-6, -2)});
    parts.push({type: 'slide', at: rng.range(0.006, 0.014), seconds: rng.range(0.04, 0.09), from: rng.range(2600, 3400), to: rng.range(1500, 2100), q: 1, db: rng.range(-15, -9), grain: 0.7});
  } else {
    parts.push({type: 'slide', at: 0, seconds: rng.range(0.03, 0.05), from: 2400, to: 3400, q: 1.2, db: rng.range(-14, -10), grain: 0.6}); // a finger under the edge
    const snap = rng.range(0.035, 0.06);
    parts.push({type: 'snap', at: snap, hz: rng.range(1800, 3200), tau: rng.range(0.002, 0.0035), db: 0});
    parts.push({type: 'slide', at: snap + 0.01, seconds: rng.range(0.07, 0.11), from: 500, to: 900, q: 0.8, db: rng.range(-22, -17), grain: 0.1}); // the card turning in the air
    const land = snap + rng.range(0.12, 0.18);
    parts.push({type: 'flap', at: land, seconds: rng.range(0.025, 0.04), hz: rng.range(500, 900), db: rng.range(-5, -2)});
    parts.push({type: 'tap', at: land + 0.003, hz: rng.range(320, 520), tau: 0.005, db: rng.range(-9, -5)});
  }
  return {kind, pan, peak: dbToGain(Math.min(LEVEL.ceilingDb, CARD.peakDb[kind] + rng.range(-1.2, 1.2))), seed: rng.seed(), parts};
}
export function renderCard(v: CardVoice, rate: number): Float32Array {
  const rng = createRng(v.seed), end = Math.max(...v.parts.map(p => p.at + (p.type === 'slide' || p.type === 'flap' ? p.seconds : 10 * p.tau)));
  const length = Math.ceil((LEAD + end + 0.01) * rate), out = new Float32Array(length);
  for (const p of v.parts) {
    const x = new Float32Array(length), start = Math.round((LEAD + p.at) * rate);
    if (p.type === 'slide') {
      const n = Math.round(p.seconds * rate), a = Math.exp(-TAU * 250 / rate); let rough = 0;
      for (let k = 0; k < n && start + k < length; k++) {
        const t = k / n; rough = (1 - a) * Math.abs(white(rng)) * 2 + a * rough;
        x[start + k] = white(rng) * (1 - p.grain + p.grain * rough * 1.6) * Math.sin(Math.PI / 2 * Math.min(1, t / 0.2)) ** 2 * (t > 0.65 ? Math.cos(Math.PI / 2 * (t - 0.65) / 0.35) ** 2 : 1);
      }
      sweepBand(x, start, start + n, p.from, p.to, p.q, rate);
    } else if (p.type === 'snap') {
      const exc = new Float32Array(length); pulse(exc, start, 0.00008 * rate, 1);
      ring(x, exc, [{f: p.hz, a: 1, tau: p.tau}, {f: p.hz * 1.62, a: 0.5, tau: p.tau * 0.7}, {f: p.hz * 2.7, a: 0.3, tau: p.tau * 0.5}], rate);
      mixUnit(x, slope(exc, rate), -12);
      const air = new Float32Array(length); burst(air, rng, start, 0.0015 * rate, 1); mixUnit(x, filter(air, coeffs('highpass', 2000, 0.7, rate)), -10);
    } else if (p.type === 'flap') {
      const n = Math.round(p.seconds * rate);
      for (let k = 0; k < n && start + k < length; k++) x[start + k] = white(rng) * Math.min(1, k / (0.002 * rate)) * Math.exp(-3 * k / n) * (1 - k / n);
      filter(filter(filter(x, coeffs('lowpass', p.hz, 0.7, rate)), coeffs('lowpass', p.hz * 1.5, 0.7, rate)), coeffs('highpass', 120, 0.7, rate));
    } else {
      const exc = new Float32Array(length); pulse(exc, start, 0.0008 * rate, 1);
      ring(x, exc, [{f: p.hz, a: 1, tau: p.tau}, {f: p.hz * 2.3, a: 0.35, tau: p.tau * 0.5}], rate);
    }
    mixUnit(out, x, p.db);
  }
  fadeOut(out, Math.round(0.004 * rate));
  return scaleTo(out, v.peak);
}

// ── the rooms' one-shots ────────────────────────────────────────────────────
// Everything that happens in a room now and then is one of these, rendered as samples when it is planned: a voice saying a
// phrase, a glass, coins into a tray, a slot machine, a bird, a car going by, a far horn. Each is drawn from its own seed, so
// nothing in a room comes back the same. They are rendered at a peak of 1; the planner gives each its level and distance.
export type Voice = {f0: number; formant: number; breath: number; rate: number}; // pitch (Hz), formant scale, breathiness, syllables a second
export type Species = 'tweet' | 'trill' | 'warble' | 'whistle' | 'coo' | 'chip';
export type Wave = 'square' | 'triangle' | 'bell';
export type SlotStyle = 'blip' | 'jingle' | 'reel' | 'win';
export type OneShot =
  | {type: 'phrase'; voice: Voice; seed: number}
  | {type: 'glass'; style: 'toast' | 'set' | 'ice'; f0: number; seed: number}
  | {type: 'coins'; count: number; f0: number; seed: number}
  | {type: 'slot'; style: SlotStyle; root: number; wave: Wave; seed: number}
  | {type: 'bird'; species: Species; pitch: number; song: number; seed: number}
  | {type: 'car'; seconds: number; hz: number; heavy: boolean; seed: number}
  | {type: 'horn'; hz: number; seed: number};

// A voice far off: a buzz at the voice's pitch through three formant resonators (Dennis Klatt's cascade), syllable by
// syllable with a vowel each (Peterson and Barney's averages for men; women's are scaled up), a falling pitch over the
// phrase, and a hiss or a burst where a consonant begins. Nobody can make out words at that distance, and the room's
// reverb and the distance's low-pass blur it further; what must come through is the rhythm and the pitch of people talking.
const VOWELS: [number, number, number][] = [[270, 2290, 3010], [390, 1990, 2550], [530, 1840, 2480], [660, 1720, 2410], [730, 1090, 2440], [570, 840, 2410], [440, 1020, 2240], [300, 870, 2240], [640, 1190, 2390], [490, 1350, 1690]];
export type Syllable = {at: number; seconds: number; vowel: [number, number, number]; stress: number; onset: 'none' | 'fric' | 'stop'; pitch: number};
export function phraseScript(voice: Voice, seed: number): {syllables: Syllable[]; seconds: number} {
  const rng = createRng(seed), n = rng.int(3, 11), question = rng.chance(0.2), accent = rng.int(0, n - 1), syllables: Syllable[] = [];
  let t = 0.03;
  for (let i = 0; i < n; i++) {
    const seconds = rng.range(0.7, 1.3) / voice.rate, x = n > 1 ? i / (n - 1) : 0, r = rng.next();
    const pitch = (1.1 - 0.22 * x) * (i === accent ? 1.12 : 1) * (question && i === n - 1 ? 1.22 : 1) * Math.exp(0.03 * rng.normal());
    syllables.push({at: t, seconds, vowel: rng.pick(VOWELS), stress: i === accent ? 1 : rng.range(0.5, 0.85), onset: r < 0.4 ? 'fric' : r < 0.65 ? 'stop' : 'none', pitch});
    t += seconds;
  }
  return {syllables, seconds: t + 0.08};
}
function klatt(hz: number, bandwidth: number, rate: number): [number, number, number] {
  const c = -Math.exp(-TAU * bandwidth / rate), b = 2 * Math.exp(-Math.PI * bandwidth / rate) * Math.cos(TAU * Math.min(hz, rate * 0.45) / rate);
  return [1 - b - c, b, c];
}
export function renderPhrase(shot: {voice: Voice; seed: number}, rate: number): Float32Array {
  const {voice} = shot, {syllables, seconds} = phraseScript(voice, shot.seed), rng = createRng(shot.seed ^ 0x5bd1e995);
  const lead = Math.round(LEAD * rate), n = lead + Math.ceil(seconds * rate), voiced = new Float32Array(n), noisy = new Float32Array(n);
  const fric = coeffs('bandpass', Math.min(rate * 0.4, rng.range(3800, 5600)), 1.5, rate), stop = coeffs('bandpass', 2200, 0.8, rate);
  let s = 0, phase = 0, f0 = voice.f0 * syllables[0].pitch, jitter = 0, amp = 0, hiss = 0, burstAmp = 0;
  const F = syllables[0].vowel.map(f => f * voice.formant), state = [0, 0, 0, 0, 0, 0], k: [number, number, number][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  let ampTarget = 0, hissTarget = 0, burstTarget = 0, fz1 = 0, fz2 = 0, sz1 = 0, sz2 = 0;
  const glide = (tau: number) => 1 - Math.exp(-32 / (tau * rate)), pitchGlide = glide(0.04), formantGlide = glide(0.025), smooth = 1 - Math.exp(-1 / (0.004 * rate));
  for (let i = lead; i < n; i++) {
    if ((i - lead) % 32 === 0) {
      const t = (i - lead) / rate;
      while (s < syllables.length - 1 && t >= syllables[s + 1].at) s++;
      const syl = syllables[s], x = clamp01((t - syl.at) / syl.seconds), last = s === syllables.length - 1, onset = syl.onset === 'none' ? 0.08 : 0.25;
      f0 += (voice.f0 * syl.pitch - f0) * pitchGlide;
      for (let j = 0; j < 3; j++) { F[j] += (syl.vowel[j] * voice.formant - F[j]) * formantGlide; k[j] = klatt(F[j], [70, 100, 140][j] * voice.formant, rate); }
      ampTarget = t > syl.at + syl.seconds ? 0 : syl.stress * (x < onset ? 0 : x < onset + 0.12 ? (x - onset) / 0.12 : x < 0.7 ? 1 : 1 - (1 - (last ? 0 : 0.25)) * (x - 0.7) / 0.3);
      hissTarget = syl.onset === 'fric' && x < onset ? Math.sin(Math.PI * x / onset) * 0.35 : 0;
      burstTarget = syl.onset === 'stop' && x > onset - 0.06 && x < onset ? 0.5 : 0;
    }
    amp += (ampTarget - amp) * smooth; hiss += (hissTarget - hiss) * smooth; burstAmp += (burstTarget - burstAmp) * smooth * 4;
    const dt = f0 * (1 + jitter) / rate;
    phase += dt; if (phase >= 1) { phase -= 1; jitter = clamp(jitter * 0.7 + 0.006 * rng.normal(), -0.02, 0.02); }
    // A sawtooth without aliasing (PolyBLEP), a little breath on it.
    let saw = 2 * phase - 1;
    if (phase < dt) { const u = phase / dt; saw -= u + u - u * u - 1; } else if (phase > 1 - dt) { const u = (phase - 1) / dt; saw -= u * u + u + u + 1; }
    let v = saw + voice.breath * white(rng);
    for (let j = 0; j < 3; j++) { const y = k[j][0] * v + k[j][1] * state[2 * j] + k[j][2] * state[2 * j + 1]; state[2 * j + 1] = state[2 * j]; state[2 * j] = y; v = y; }
    const w = white(rng), fy = fric.b0 * w + fz1; fz1 = fric.b1 * w - fric.a1 * fy + fz2; fz2 = fric.b2 * w - fric.a2 * fy;
    const sy = stop.b0 * w + sz1; sz1 = stop.b1 * w - stop.a1 * sy + sz2; sz2 = stop.b2 * w - stop.a2 * sy;
    voiced[i] = v * amp; noisy[i] = fy * hiss + sy * burstAmp;
  }
  // The consonants sit about 16 dB under the vowels, by their average levels, as in speech.
  const rms = (x: Float32Array) => { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / x.length); }, rv = rms(voiced), rn = rms(noisy);
  const out = new Float32Array(n); for (let i = 0; i < n; i++) out[i] = voiced[i] / (rv || 1) + (rn ? noisy[i] / rn * dbToGain(-16) : 0);
  fadeOut(out, Math.round(0.02 * rate));
  return scaleTo(out, 1);
}

// A glass: a thin shell whose rim rings in modes at about 1 : 2.8 : 5.4 : 8.8, long, each split in two by the glass's own
// unevenness, so that it beats slowly. Two glasses touched together, one set down on a table, or ice knocking inside one.
const GLASS = {ratios: [1, 2.83, 5.43, 8.78], taus: [[0.8, 1.4], [0.35, 0.55], [0.12, 0.2], [0.05, 0.09]], levels: [[1, 1], [0.45, 0.75], [0.3, 0.55], [0.15, 0.35]]};
function glassModes(rng: Rng, f0: number): Mode[] {
  return GLASS.ratios.flatMap((ratio, i) => { const f = f0 * ratio, split = rng.range(0.4, 1.8), a = within(rng, GLASS.levels[i]) / 2, tau = within(rng, GLASS.taus[i]); return [{f: f - split / 2, a, tau}, {f: f + split / 2, a, tau}]; });
}
export function renderGlass(shot: Extract<OneShot, {type: 'glass'}>, rate: number): Float32Array {
  const rng = createRng(shot.seed), lead = LEAD * rate;
  const seconds = shot.style === 'toast' ? 2.6 : shot.style === 'set' ? 1.4 : 2.4, n = Math.ceil(lead + seconds * rate), out = new Float32Array(n);
  if (shot.style === 'toast') {
    const exc = new Float32Array(n); pulse(exc, lead, 0.00005 * rate, 1); if (rng.chance(0.3)) pulse(exc, lead + rng.range(0.008, 0.02) * rate, 0.00006 * rate, 0.3);
    const a = new Float32Array(n), b = new Float32Array(n); ring(a, exc, glassModes(rng, shot.f0), rate); ring(b, exc, glassModes(rng, shot.f0 * rng.range(1.02, 1.09)), rate);
    mixUnit(out, a, 0); mixUnit(out, b, rng.range(-4, 0)); mixUnit(out, slope(exc, rate), -18);
  } else if (shot.style === 'set') {
    const hard = new Float32Array(n), soft = new Float32Array(n); pulse(hard, lead, 0.00012 * rate, 1); pulse(soft, lead, 0.0012 * rate, 1);
    const fb = rng.range(1800, 2800), thump = new Float32Array(n), base = new Float32Array(n), rim = new Float32Array(n);
    ring(thump, soft, [{f: rng.range(150, 240), a: 1, tau: 0.012}, {f: rng.range(500, 800), a: 0.4, tau: 0.005}], rate);
    ring(base, hard, [{f: fb, a: 1, tau: rng.range(0.015, 0.035)}, {f: fb * 1.93, a: 0.5, tau: 0.012}, {f: fb * 3.1, a: 0.3, tau: 0.007}], rate);
    ring(rim, hard, glassModes(rng, shot.f0), rate);
    mixUnit(out, thump, 0); mixUnit(out, base, -4); mixUnit(out, rim, -18);
  } else {
    const glass = glassModes(rng, shot.f0), knocks = new Float32Array(n), ice = new Float32Array(n);
    let t = 0.03;
    for (let k = rng.int(3, 7); k > 0; k--) {
      const force = rng.range(0.4, 1), fi = rng.range(3500, 6500);
      strike(ice, LEAD + t, [{at: 0, force, width: 0.0001}], [{f: fi, a: 1, tau: rng.range(0.003, 0.006)}, {f: fi * 1.7, a: 0.5, tau: 0.003}, {f: fi * 2.6, a: 0.3, tau: 0.002}], rate);
      pulse(knocks, lead + t * rate, 0.0001 * rate, force * rng.range(0.25, 0.6)); // the same knock, weaker, into the glass
      t += rng.range(0.04, 0.16);
    }
    const rim = new Float32Array(n); ring(rim, knocks, glass, rate);
    mixUnit(out, ice, 0); mixUnit(out, rim, -6);
  }
  fadeOut(out, Math.round(0.01 * rate));
  return scaleTo(out, 1);
}
// Coins paid out into a metal tray: each coin a small, bright, ringing disc (a struck coin rings for a tenth of a second, far
// longer than a clay chip), bouncing once, and the tray humming under them all.
export function renderCoins(shot: Extract<OneShot, {type: 'coins'}>, rate: number): Float32Array {
  const rng = createRng(shot.seed), lead = LEAD * rate, step = 1 / rng.range(9, 14), times: number[] = [];
  let t = 0.01; for (let i = 0; i < shot.count; i++) { times.push(t); t += step * rng.range(0.75, 1.25); }
  const n = Math.ceil(lead + (t + 0.9) * rate), coins = new Float32Array(n), tray = new Float32Array(n), trayExc = new Float32Array(n);
  for (const at of times) {
    const force = rng.range(0.4, 1), f1 = shot.f0 * rng.range(0.92, 1.08);
    strike(coins, LEAD + at, [{at: 0, force, width: 0.00006}, {at: rng.range(0.008, 0.03), force: force * 0.3, width: 0.00006}], [1, 1.53, 2.27, 2.95, 3.6].map((r, i) => ({f: f1 * r, a: [1, 0.7, 0.5, 0.35, 0.2][i] * rng.range(0.5, 1), tau: [0.12, 0.09, 0.06, 0.045, 0.03][i] * rng.range(0.7, 1.3)})), rate);
    pulse(trayExc, lead + at * rate, 0.0003 * rate, force);
  }
  const ft = rng.range(650, 1100); ring(tray, trayExc, [{f: ft, a: 1, tau: rng.range(0.3, 0.6)}, {f: ft * 2.4, a: 0.5, tau: 0.2}, {f: ft * 3.9, a: 0.3, tau: 0.1}], rate);
  const out = new Float32Array(n); mixUnit(out, coins, 0); mixUnit(out, tray, -10); fadeOut(out, Math.round(0.02 * rate));
  return scaleTo(out, 1);
}
// A slot machine: soft square, triangle or bell tones on a pentatonic scale (machines are tuned to never sound wrong), a
// whirr of ticks while the reels spin and a knock as each stops, and bells ringing in a win.
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];
const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const PARTIALS: Record<Wave, [number, number, number][]> = { // ratio, level, decay (seconds; 0 for a held note)
  square: [[1, 1, 0], [3, 0.33, 0], [5, 0.2, 0], [7, 0.14, 0], [9, 0.11, 0]],
  triangle: [[1, 1, 0], [3, 0.11, 0], [5, 0.04, 0]],
  bell: [[1, 1, 0.5], [2.76, 0.45, 0.28], [5.4, 0.25, 0.15], [8.93, 0.12, 0.09]],
};
/** One note added to out. The sine runs by recursion (two multiplications a sample), so that a bell's long tail is cheap. */
function tone(out: Float32Array, at: number, seconds: number, hz: number, wave: Wave, amp: number, rate: number) {
  const start = Math.round(at * rate), len = Math.max(16, Math.round(seconds * rate)), attack = (wave === 'bell' ? 0.002 : 0.004) * rate;
  for (const [ratio, level, decay] of PARTIALS[wave]) {
    const f = hz * ratio; if (f > rate * 0.45) continue;
    const w = TAU * f / rate, c = 2 * Math.cos(w), tail = decay ? Math.round(5 * decay * rate) : len, fall = decay ? Math.exp(-1 / (decay * rate)) : 1, fade = tail * 0.85;
    let s1 = 0, s0 = -Math.sin(w), env = amp * level;
    for (let k = 0; k < tail && start + k < out.length; k++) {
      const s = c * s1 - s0; s0 = s1; s1 = s; // sin(w (k + 1))
      let e = env * (k < attack ? k / attack : 1);
      if (decay) { env *= fall; if (k > fade) e *= (tail - k) / (tail - fade); } // a bell dies away, its last fifteenth faded to nothing
      else { const x = k / len; e *= (x < 0.3 ? 1 - 1.5 * x : 0.55) * (x > 0.75 ? (1 - x) * 4 : 1); } // a held note: a little fall, then let go
      out[start + k] += e * s0;
    }
  }
}
export function renderSlot(shot: Extract<OneShot, {type: 'slot'}>, rate: number): Float32Array {
  const rng = createRng(shot.seed), notes: [number, number, number, Wave, number][] = [], knocks: [number, number, boolean][] = [];
  let t = LEAD + 0.005;
  const jingle = (count: number, from: number, wave: Wave) => { let idx = from; for (let i = 0; i < count; i++) { const d = rng.range(0.07, 0.1) * (i === count - 1 ? 2.5 : 1); notes.push([t, d, shot.root + PENTA[idx], wave, 0.9]); t += d; idx = clamp(idx + rng.pick([1, 1, 1, 2, -1]), 0, PENTA.length - 1); } };
  if (shot.style === 'blip') for (let k = rng.int(1, 3); k > 0; k--) { const d = rng.range(0.04, 0.09); notes.push([t, d, shot.root + rng.pick(PENTA.slice(4, 10)), shot.wave, 1]); t += d + rng.range(0.02, 0.05); }
  else if (shot.style === 'jingle') jingle(rng.int(4, 9), rng.int(0, 3), shot.wave);
  else if (shot.style === 'reel') {
    const spin = rng.range(1, 2.2), every = 1 / rng.range(18, 26);
    for (; t < spin; t += every * rng.range(0.9, 1.1)) knocks.push([t, rng.range(0.4, 0.7), false]);
    for (let k = 0; k < 3; k++) { t += rng.range(0.22, 0.38); knocks.push([t, 1, true]); notes.push([t + 0.01, 0.06, shot.root + PENTA[4 + k], shot.wave, 0.6]); }
    t += 0.3;
  } else {
    const bells = rng.int(6, 14), every = 1 / rng.range(8, 11), start = t;
    for (let k = 0; k < bells; k++) notes.push([start + k * every, 0.08, shot.root + 24, 'bell', 0.7]);
    jingle(rng.int(8, 12), 0, shot.wave === 'bell' ? 'triangle' : shot.wave);
    t = Math.max(t, start + bells * every);
  }
  const n = Math.ceil((t + 1.6) * rate), out = new Float32Array(n);
  for (const [at, d, midi, wave, amp] of notes) tone(out, at, d, midiHz(midi), wave, amp, rate);
  if (knocks.length) {
    const exc = new Float32Array(n), soft = new Float32Array(n), mech = new Float32Array(n);
    for (const [at, force, stop] of knocks) { pulse(exc, at * rate, 0.0001 * rate, force * (stop ? 0.6 : 1)); if (stop) pulse(soft, at * rate, 0.0015 * rate, force); }
    ring(mech, exc, [{f: 2400, a: 1, tau: 0.0015}, {f: 320, a: 0.5, tau: 0.004}], rate); ring(mech, soft, [{f: 210, a: 3, tau: 0.02}], rate);
    mixUnit(out, mech, notes.length ? -6 : 0);
  }
  const quiet = peakOf(out) * 1e-4; let last = n - 1; while (last > 0 && Math.abs(out[last]) <= quiet) last--; // a bell's tail ends -80 dB down
  const trimmed = out.slice(0, Math.min(n, last + Math.round(0.01 * rate))); fadeOut(trimmed, Math.round(0.005 * rate));
  return scaleTo(trimmed, 1);
}
// Birds: generic songbirds, not any one species. Each individual keeps its own song (song seed) and sings it again and again
// with small differences (seed): a run of falling tweets, a fast trill, a wandering warble, two or three pure whistles, a far
// dove's low hoots, a single sharp call.
type Note = {at: number; seconds: number; from: number; to: number; amp: number; vibrato: number};
export function birdScript(species: Species, pitch: number, song: number, seed: number): {notes: Note[]; seconds: number} {
  const s = createRng(song), v = createRng(seed), notes: Note[] = [], p = pitch * v.range(0.98, 1.02), pace = v.range(0.94, 1.06);
  let t = 0.01;
  const add = (seconds: number, from: number, to: number, amp: number, gap: number, vibrato = 0) => { notes.push({at: t, seconds: seconds * pace, from: from * p, to: to * p, amp, vibrato}); t += (seconds + gap) * pace; };
  if (species === 'tweet') { const count = Math.max(2, s.int(3, 6) + v.int(-1, 1)), hi = s.range(4600, 5600), lo = s.range(3000, 3800), len = s.range(0.05, 0.08), gap = s.range(0.06, 0.1); for (let i = 0; i < count; i++) add(len, hi * (1 - 0.02 * i), lo, 1 - 0.08 * i, gap); }
  else if (species === 'trill') { const count = s.int(10, 20) + v.int(-2, 2), f = s.range(4200, 5600), len = s.range(0.018, 0.03), gap = s.range(0.008, 0.016); for (let i = 0; i < count; i++) { const x = i / count; add(len, f * (1 - 0.1 * x), f * (1.08 - 0.1 * x), Math.sin(Math.PI / 2 * Math.min(1, x * 4)) * (1 - 0.4 * x), gap); } }
  else if (species === 'warble') { const count = s.int(14, 26); let f = s.range(2600, 4200); for (let i = 0; i < count; i++) { const to = s.range(2200, 5000) * v.range(0.97, 1.03); add(s.range(0.04, 0.1), f, to, s.chance(0.12) ? 0 : s.range(0.5, 1), 0, 0.03); f = to; } }
  else if (species === 'whistle') { const count = s.int(2, 3), fs = [s.range(3000, 3800), s.range(2300, 2900), s.range(2800, 3500)]; for (let i = 0; i < count; i++) add(s.range(0.18, 0.32), fs[i], fs[i] * s.range(0.97, 1.03), 0.9, s.range(0.04, 0.1)); }
  else if (species === 'coo') { const count = s.int(3, 5), base = s.range(420, 560), amps = [0.6, 1, 0.75, 0.7, 0.7]; for (let i = 0; i < count; i++) add(s.range(0.25, 0.42), base * (i === 1 ? 1.06 : 1), base * (i === 1 ? 1 : 0.96), amps[i], s.range(0.08, 0.2)); }
  else { const count = v.chance(0.3) ? 2 : 1, len = s.range(0.014, 0.024), hi = s.range(5200, 6400), lo = s.range(3800, 4600); for (let i = 0; i < count; i++) add(len, hi, lo, 1, 0.06); }
  return {notes, seconds: t + 0.05};
}
export function renderBird(shot: Extract<OneShot, {type: 'bird'}>, rate: number): Float32Array {
  const {notes, seconds} = birdScript(shot.species, shot.pitch, shot.song, shot.seed), n = Math.ceil((LEAD + seconds) * rate), out = new Float32Array(n);
  let phase = 0;
  for (const note of notes) {
    const start = Math.round((LEAD + note.at) * rate), len = Math.max(8, Math.round(note.seconds * rate));
    for (let k = 0; k < len && start + k < n; k++) {
      const x = k / len, f = note.from * Math.pow(note.to / note.from, x) * (1 + note.vibrato * Math.sin(TAU * 38 * k / rate));
      phase += TAU * Math.min(f, rate * 0.45) / rate;
      const env = Math.sin(Math.PI / 2 * Math.min(1, x / 0.15)) ** 2 * Math.cos(Math.PI / 2 * Math.max(0, (x - 0.7) / 0.3)) ** 2;
      out[start + k] += note.amp * env * (Math.sin(phase) + 0.08 * Math.sin(2 * phase) + 0.03 * Math.sin(3 * phase));
    }
  }
  return scaleTo(out, 1);
}
// A car far below: tyre and road noise swelling as it comes and fading as it goes, its band a little higher coming than going
// (the Doppler shift), a truck heavier and lower. The pan moves with it (the planner's panTo).
export function renderCar(shot: Extract<OneShot, {type: 'car'}>, rate: number): Float32Array {
  const rng = createRng(shot.seed), n = Math.ceil((LEAD + shot.seconds) * rate), mid = shot.seconds * rng.range(0.42, 0.58), width = shot.seconds * rng.range(0.12, 0.2);
  const road = pinkNoise(n, rng), rumble = filter(brownNoise(n, rng), coeffs('lowpass', 140, 0.7, rate)), out = new Float32Array(n);
  let z1 = 0, z2 = 0, c = coeffs('bandpass', shot.hz, 0.7, rate);
  for (let i = 0; i < n; i++) {
    const t = i / rate - LEAD;
    if (i % 64 === 0) c = coeffs('bandpass', shot.hz * (1 + 0.07 * Math.tanh((mid - t) / width)), 0.7, rate);
    const y = c.b0 * road[i] + z1; z1 = c.b1 * road[i] - c.a1 * y + z2; z2 = c.b2 * road[i] - c.a2 * y;
    out[i] = t < 0 ? 0 : (y + rumble[i] * (shot.heavy ? 0.9 : 0.35)) / (1 + ((t - mid) / width) ** 2);
  }
  fadeIn(out, Math.round(0.6 * rate)); fadeOut(out, Math.round(0.6 * rate));
  return scaleTo(out, 1);
}
// A car horn far off: two tones a third apart, buzzy, one or two taps.
export function renderHorn(shot: Extract<OneShot, {type: 'horn'}>, rate: number): Float32Array {
  const rng = createRng(shot.seed), f2 = shot.hz * rng.range(1.19, 1.26), taps: [number, number][] = [[0.01, rng.range(0.2, 0.55)]];
  if (rng.chance(0.4)) taps.push([taps[0][0] + taps[0][1] + rng.range(0.1, 0.2), rng.range(0.15, 0.3)]);
  const end = taps[taps.length - 1][0] + taps[taps.length - 1][1], n = Math.ceil((LEAD + end + 0.05) * rate), out = new Float32Array(n);
  for (const [at, seconds] of taps) {
    const start = Math.round((LEAD + at) * rate), len = Math.round(seconds * rate);
    for (let k = 0; k < len && start + k < n; k++) {
      const env = Math.min(1, k / (0.02 * rate)) * Math.min(1, (len - k) / (0.05 * rate)), t = k / rate; let v = 0;
      for (let h = 1; h <= 8; h++) v += (Math.sin(TAU * shot.hz * h * t) + Math.sin(TAU * f2 * h * t + h)) / h;
      out[start + k] += v * env;
    }
  }
  filter(filter(out, coeffs('lowpass', 1500, 0.7, rate)), coeffs('lowpass', 1500, 0.7, rate));
  return scaleTo(out, 1);
}
export function renderShot(shot: OneShot, rate: number): Float32Array {
  switch (shot.type) {
    case 'phrase': return renderPhrase(shot, rate);
    case 'glass': return renderGlass(shot, rate);
    case 'coins': return renderCoins(shot, rate);
    case 'slot': return renderSlot(shot, rate);
    case 'bird': return renderBird(shot, rate);
    case 'car': return renderCar(shot, rate);
    case 'horn': return renderHorn(shot, rate);
  }
}
/** Voices, cars and horns hold nothing above a few kHz, so they are made at half the context's rate (half the work). */
export const shotRate = (shot: OneShot, rate: number) => shot.type === 'phrase' || shot.type === 'car' || shot.type === 'horn' ? rate / 2 : rate;
/** How long a one-shot lasts, seconds, without rendering it (exact for phrases, birds and cars). */
export function shotSeconds(shot: OneShot): number {
  if (shot.type === 'phrase') return phraseScript(shot.voice, shot.seed).seconds;
  if (shot.type === 'bird') return birdScript(shot.species, shot.pitch, shot.song, shot.seed).seconds;
  if (shot.type === 'car') return shot.seconds;
  return shot.type === 'glass' ? 2.5 : shot.type === 'coins' ? shot.count / 10 + 0.9 : shot.type === 'slot' ? 2 : 1;
}

// ── loops: the rooms' steady beds and their reverb ──────────────────────────
// A bed is a long loop of noise played through filters. The loop's end runs into its start through an equal-power
// crossfade, so that there is no seam; loops are 10–20 s and of different lengths, and the planner keeps moving their levels
// and filters, so that nothing repeats in a way one can follow.
export const LOOP_RMS = 0.25;
/** Seconds of each loop: all over ten, and no two come back into step within a minute, so that layers never line up again. */
export const LOOPS: Record<Bed['source'], number> = {white: 10.9, pink: 11.3, brown: 12.7, rustle: 13.3, babble: 19.7};
/** x holds length + fade samples; returns length samples whose end flows into their start. */
export function seamless(x: Float32Array, length: number, fade: number): Float32Array {
  const out = x.slice(0, length);
  for (let i = 0; i < fade; i++) { const w = (i + 0.5) / fade * Math.PI / 2; out[i] = x[i] * Math.sin(w) + x[length + i] * Math.cos(w); }
  return out;
}
function rmsTo(x: Float32Array, rms: number): Float32Array { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; const k = s > 0 ? rms / Math.sqrt(s / x.length) : 0; for (let i = 0; i < x.length; i++) x[i] *= k; return x; }
/** Two channels of seamless noise (left and right independent), at LOOP_RMS. */
export function noiseLoop(color: 'white' | 'pink' | 'brown', seconds: number, rate: number, seed: number): Float32Array[] {
  const rng = createRng(seed), length = Math.round(seconds * rate), fade = Math.round(0.25 * rate);
  return [0, 1].map(() => {
    const x = color === 'white' ? whiteNoise(length + fade, rng) : color === 'pink' ? pinkNoise(length + fade, rng) : brownNoise(length + fade, rng);
    filter(x, coeffs('highpass', 25, 0.7, rate)); // nothing below hearing: no offset, no wasted headroom
    return rmsTo(seamless(x, length, fade), LOOP_RMS);
  });
}
/**
 * A crowd too far off to hear any one voice: streams of noise shaped like speech (most energy around 500 Hz, little above
 * 3 kHz), each gated by its own syllables and phrases, spread between left and right. The voiced phrases the planner adds on
 * top give it pitch; this keeps the murmur from ever stopping.
 */
export function babbleLoop(seconds: number, rate: number, seed: number, streams: number): Float32Array[] {
  const length = Math.round(seconds * rate), fade = Math.round(0.6 * rate), n = length + fade, left = new Float32Array(n), right = new Float32Array(n);
  for (let s = 0; s < streams; s++) {
    const rng = createRng(seed + s * 7919), env = new Float32Array(n);
    for (let t = rng.range(0, 1.5); t < n / rate;) {
      const syllables = rng.int(3, 12), pace = rng.range(3.5, 5.5);
      for (let k = 0; k < syllables; k++) {
        const d = rng.range(0.7, 1.3) / pace, amp = rng.range(0.4, 1), a = Math.round(t * rate), b = Math.min(n, Math.round((t + d * 1.15) * rate));
        for (let i = a; i < b; i++) { const v = amp * Math.sin(Math.PI * (i - a) / (b - a)) ** 2; if (v > env[i]) env[i] = v; }
        t += d;
      }
      t += rng.range(0.25, 1.8);
    }
    const x = pinkNoise(n, rng);
    filter(filter(filter(x, coeffs('highpass', 160, 0.7, rate)), coeffs('peak', rng.range(450, 650), 1, rate, 6)), coeffs('lowpass', Math.min(2600, rate * 0.4), 0.7, rate));
    // A far crowd comes from everywhere at once: each stream mostly on one side, a little on the other, so that the two sides
    // are largely different (panning every stream into both would make the crowd sound narrow, like one place).
    const bleed = rng.range(0.12, 0.28), gl = s % 2 ? bleed : 1, gr = s % 2 ? 1 : bleed;
    for (let i = 0; i < n; i++) { const v = x[i] * env[i]; left[i] += v * gl; right[i] += v * gr; }
  }
  return [rmsTo(seamless(left, length, fade), LOOP_RMS), rmsTo(seamless(right, length, fade), LOOP_RMS)];
}
/** Wind in leaves: hundreds of tiny dry ticks a second (leaves touching), loudness spread wide, and a little steady hiss. */
export function rustleLoop(seconds: number, rate: number, seed: number): Float32Array[] {
  const rng = createRng(seed), length = Math.round(seconds * rate), fade = Math.round(0.3 * rate), n = length + fade;
  return [0, 1].map(() => {
    const x = new Float32Array(n);
    for (let t = 0; t < n / rate; t += -Math.log(1 - rng.next()) / 700) {
      const start = Math.round(t * rate), decay = rng.range(0.0003, 0.002) * rate, amp = 0.3 * Math.exp(0.55 * rng.normal());
      for (let k = 0; k < decay * 4 && start + k < n; k++) x[start + k] += amp * white(rng) * Math.exp(-k / decay);
    }
    for (let i = 0; i < n; i++) x[i] += 0.08 * white(rng);
    filter(filter(filter(x, coeffs('highpass', 1100, 0.7, rate)), coeffs('peak', 3200, 1, rate, 4)), coeffs('lowpass', Math.min(7000, rate * 0.45), 0.7, rate));
    return rmsTo(seamless(x, length, fade), LOOP_RMS);
  });
}
/**
 * A room's reverb as an impulse response: two channels of noise dying away over seconds (−60 dB at the end), the high
 * frequencies first (damping 0–1), after a short gap (predelay). Each channel has an energy of 1, so that the reverb of a
 * steady sound is as loud as the sound.
 */
export function reverbImpulse(seconds: number, rate: number, seed: number, damping: number, predelay: number): Float32Array[] {
  const rng = createRng(seed), start = Math.round(predelay * rate), n = start + Math.ceil(seconds * rate);
  return [0, 1].map(() => {
    const x = new Float32Array(n); let lp = 0, energy = 0;
    for (let i = start; i < n; i++) {
      const t = (i - start) / rate, cutoff = Math.min(rate * 0.45, 12000 * Math.exp(-damping * 5 * t / seconds) + 600), a = Math.exp(-TAU * cutoff / rate);
      lp = (1 - a) * white(rng) + a * lp;
      const v = lp * Math.sqrt((1 + a) / (1 - a)) * Math.exp(-6.91 * t / seconds) * Math.min(1, (i - start + 1) / (0.002 * rate));
      x[i] = v; energy += v * v;
    }
    const k = 1 / Math.sqrt(energy || 1); for (let i = 0; i < n; i++) x[i] *= k;
    return x;
  });
}

// ── the rooms ───────────────────────────────────────────────────────────────
// A room is beds (steady loops through filters, each with a level in dB, some drifting slowly and some following the wind's
// gusts) and generators of one-shots (voices, glasses, slot machines, coins, birds, cars, horns), each at a distance.
// Levels are relative within a room; trimDb brings the whole room to LEVEL.ambienceDbA at the default Bakgrund (measured
// 2026-11-11 over a minute of each room rendered offline; the proof in assets/proofs/ljud-labb/ has the numbers). A distance
// is a level, a low-pass (air and walls take the highs) and a share of reverb.
export type Distance = 'near' | 'mid' | 'far' | 'distant';
export const DISTANCE: Record<Distance, {db: number; lowpass: number; wet: number}> = {
  near: {db: 0, lowpass: 12000, wet: 0.15}, mid: {db: -6, lowpass: 6000, wet: 0.35}, far: {db: -12, lowpass: 3000, wet: 0.6}, distant: {db: -18, lowpass: 1600, wet: 0.85},
};
export type Bed = {
  id: string; source: 'pink' | 'brown' | 'white' | 'babble' | 'rustle'; db: number; wet?: number;
  filters: {type: 'lowpass' | 'highpass' | 'bandpass'; hz: number; q?: number}[];
  /** The level wanders up to ±db, a new aim every few seconds. */
  drift?: {db: number; every: [number, number]};
  /** The level follows the wind: db more from calm to gust; hz moves the first filter from calm to gust. */
  gust?: {db: number; hz?: [number, number]};
};
export type RoomRecipe = {
  trimDb: number; reverb: {seconds: number; damping: number; predelay: number}; effectsWetDb: number; beds: Bed[];
  /** Seconds between two changes of the wind. */
  gust?: [number, number];
  talkers?: {count: number; distance: Distance[]; db: number; pause: [number, number]};
  glass?: {every: [number, number]; distance: Distance[]; db: number};
  slots?: {machines: number; distance: Distance[]; db: number; every: Record<SlotStyle, [number, number]>};
  coins?: {every: [number, number]; distance: Distance[]; db: number};
  birds?: {count: number; db: number};
  cars?: {every: [number, number]; seconds: [number, number]; distance: Distance[]; db: number};
  horns?: {every: [number, number]; db: number};
};
export const ROOM_RECIPES: Record<RoomSound, RoomRecipe> = {
  // A quiet lounge: the room's own low tone, a little air, a murmur far off, now and then a voice and a glass.
  salong: {
    trimDb: -11, reverb: {seconds: 1.1, damping: 0.5, predelay: 0.012}, effectsWetDb: -22,
    beds: [
      {id: 'tone', source: 'brown', db: -8, filters: [{type: 'lowpass', hz: 300}, {type: 'highpass', hz: 45}], drift: {db: 1.5, every: [6, 14]}},
      {id: 'air', source: 'pink', db: -14, filters: [{type: 'highpass', hz: 150}, {type: 'lowpass', hz: 1100}], drift: {db: 2, every: [8, 18]}},
      {id: 'murmur', source: 'babble', db: -6, wet: 0.5, filters: [{type: 'lowpass', hz: 1500}, {type: 'highpass', hz: 160}], drift: {db: 3, every: [7, 16]}},
    ],
    talkers: {count: 2, distance: ['far', 'distant'], db: -4, pause: [1.5, 6]},
    glass: {every: [6, 20], distance: ['mid', 'far'], db: -9},
  },
  // A large Las Vegas casino: the crowd is the room, slot machines twinkle all over it far off, coins now and then.
  panorama: {
    trimDb: -21.5, reverb: {seconds: 3.2, damping: 0.65, predelay: 0.035}, effectsWetDb: -18,
    beds: [
      {id: 'air', source: 'pink', db: -6, wet: 0.6, filters: [{type: 'lowpass', hz: 2400}, {type: 'highpass', hz: 120}], drift: {db: 1.5, every: [8, 20]}},
      {id: 'rumble', source: 'brown', db: -14, filters: [{type: 'lowpass', hz: 160}, {type: 'highpass', hz: 40}], drift: {db: 1, every: [10, 20]}},
      {id: 'murmur', source: 'babble', db: 0, wet: 0.8, filters: [{type: 'lowpass', hz: 2200}, {type: 'highpass', hz: 150}], drift: {db: 2, every: [6, 14]}},
      {id: 'murmur2', source: 'babble', db: -3, wet: 0.9, filters: [{type: 'lowpass', hz: 1600}, {type: 'highpass', hz: 150}], drift: {db: 2.5, every: [9, 19]}},
    ],
    talkers: {count: 8, distance: ['far', 'distant'], db: 0, pause: [0.3, 3]},
    slots: {machines: 10, distance: ['far', 'distant'], db: -2, every: {blip: [3, 10], jingle: [8, 28], reel: [6, 18], win: [50, 140]}},
    coins: {every: [10, 30], distance: ['far', 'distant'], db: 0},
  },
  // A penthouse over the city at dusk: the city's low hum, traffic far below, wind round the building.
  la: {
    trimDb: -6.5, reverb: {seconds: 2.4, damping: 0.75, predelay: 0.08}, effectsWetDb: -30, gust: [2, 7],
    beds: [
      {id: 'city', source: 'brown', db: -10, filters: [{type: 'lowpass', hz: 200}, {type: 'highpass', hz: 40}], drift: {db: 1, every: [10, 25]}},
      {id: 'traffic', source: 'pink', db: -6, wet: 0.3, filters: [{type: 'lowpass', hz: 900}, {type: 'highpass', hz: 150}], drift: {db: 3, every: [5, 15]}},
      {id: 'wind', source: 'pink', db: -8, filters: [{type: 'lowpass', hz: 500}, {type: 'highpass', hz: 60}], gust: {db: 10, hz: [300, 1100]}},
      {id: 'whistle', source: 'white', db: -28, filters: [{type: 'bandpass', hz: 700, q: 9}], gust: {db: 12, hz: [450, 1100]}},
    ],
    cars: {every: [2.5, 9], seconds: [4.5, 10], distance: ['far', 'distant'], db: 0},
    horns: {every: [25, 70], db: -10},
  },
  // A forest: leaves in the wind, the wind itself low under them, and birds near and far.
  skog: {
    trimDb: -20.5, reverb: {seconds: 1.4, damping: 0.6, predelay: 0.02}, effectsWetDb: -32, gust: [1.5, 6],
    beds: [
      {id: 'leaves', source: 'rustle', db: 0, filters: [{type: 'highpass', hz: 900}, {type: 'lowpass', hz: 7500}], gust: {db: 12}},
      {id: 'wind', source: 'pink', db: -12, filters: [{type: 'lowpass', hz: 350}], gust: {db: 8, hz: [200, 700]}},
      {id: 'air', source: 'brown', db: -22, filters: [{type: 'lowpass', hz: 160}, {type: 'highpass', hz: 40}]},
    ],
    birds: {count: 5, db: -4},
  },
  // A gaming hall with the machines close by: ventilation, a fan's hum, a moderate murmur, the machines all round.
  hall: {
    trimDb: -16.5, reverb: {seconds: 1.3, damping: 0.5, predelay: 0.015}, effectsWetDb: -21,
    beds: [
      {id: 'vent', source: 'brown', db: -8, filters: [{type: 'lowpass', hz: 300}, {type: 'highpass', hz: 45}], drift: {db: 0.5, every: [10, 20]}},
      {id: 'fan', source: 'pink', db: -12, filters: [{type: 'bandpass', hz: 118, q: 6}], drift: {db: 1, every: [5, 12]}},
      {id: 'air', source: 'pink', db: -10, filters: [{type: 'highpass', hz: 300}, {type: 'lowpass', hz: 1600}], drift: {db: 1, every: [8, 16]}},
      {id: 'murmur', source: 'babble', db: -3, wet: 0.5, filters: [{type: 'lowpass', hz: 2600}, {type: 'highpass', hz: 170}], drift: {db: 2.5, every: [6, 14]}},
    ],
    talkers: {count: 3, distance: ['mid', 'far'], db: -4, pause: [1, 5]},
    slots: {machines: 6, distance: ['near', 'mid'], db: -4, every: {blip: [2.5, 9], jingle: [8, 24], reel: [5, 14], win: [45, 120]}},
    coins: {every: [25, 60], distance: ['mid'], db: -4},
  },
};
const SLOT_STYLES: SlotStyle[] = ['blip', 'jingle', 'reel', 'win'];
const SPECIES: [Species, number, [number, number]][] = [['tweet', 3, [1.5, 4]], ['trill', 2, [2, 5]], ['warble', 2, [1, 3]], ['whistle', 2, [2, 5]], ['coo', 1, [3, 7]], ['chip', 2, [0.6, 2.5]]];

/** Something to do in a room at a time (seconds from the room's start): move a bed, or play a one-shot. */
export type AmbienceEvent =
  | {kind: 'mod'; at: number; layer: string; db: number; hz?: number; glide: number}
  | {kind: 'shot'; at: number; shot: OneShot; db: number; pan: number; panTo: number; lowpass: number; wet: number; seconds: number};
/**
 * What happens in a room and when, from a seed. plan(from, to) gives the events in [from, to) in order; called window after
 * window it gives exactly what one call over the whole span would, so the live page (a window every quarter second) and an
 * offline render agree. Nothing in it repeats: every event draws new numbers.
 */
export function createPlanner(room: RoomSound, seed: number) {
  const recipe = ROOM_RECIPES[room], rng = createRng(seed);
  type Gen = {next: number; fire(at: number): AmbienceEvent[]};
  const gens: Gen[] = [];
  const shot = (at: number, one: OneShot, db: number, distance: Distance, pan: number, panTo = pan): AmbienceEvent => {
    const d = DISTANCE[distance];
    return {kind: 'shot', at, shot: one, db: db + d.db + rng.range(-2, 2), pan: clamp(pan, -1, 1), panTo: clamp(panTo, -1, 1), lowpass: d.lowpass * rng.range(0.85, 1.15), wet: d.wet, seconds: shotSeconds(one)};
  };
  for (const bed of recipe.beds) if (bed.drift) {
    const drift = bed.drift, g: Gen = {next: within(rng, drift.every), fire(at) { const glide = within(rng, drift.every); g.next = at + glide; return [{kind: 'mod', at, layer: bed.id, db: bed.db + rng.range(-drift.db, drift.db), glide}]; }};
    gens.push(g);
  }
  if (recipe.gust) {
    const every = recipe.gust; let wind = 0.5;
    const g: Gen = {next: 0, fire(at) {
      const glide = within(rng, every); g.next = at + glide; wind = clamp(wind + 0.35 * rng.normal() + 0.25 * (0.45 - wind), 0, 1);
      return recipe.beds.filter(b => b.gust).map(b => ({kind: 'mod' as const, at, layer: b.id, db: b.db + b.gust!.db * (wind - 0.5), hz: b.gust!.hz ? b.gust!.hz[0] * Math.pow(b.gust!.hz[1] / b.gust!.hz[0], wind) : undefined, glide}));
    }};
    gens.push(g);
  }
  if (recipe.talkers) {
    const spec = recipe.talkers;
    // People come and go: now and then a talker is someone else, with another voice in another place.
    const person = () => { const woman = rng.chance(0.5); return {voice: {f0: woman ? rng.range(165, 235) : rng.range(90, 140), formant: woman ? rng.range(1.12, 1.22) : rng.range(0.95, 1.05), breath: rng.range(0.02, 0.08), rate: rng.range(3.8, 5.4)}, pan: rng.range(-0.85, 0.85), distance: rng.pick(spec.distance)}; };
    for (let i = 0; i < spec.count; i++) {
      let who = person();
      const g: Gen = {next: rng.range(0, 2.5), fire(at) { if (rng.chance(0.12)) who = person(); const one: OneShot = {type: 'phrase', voice: who.voice, seed: rng.seed()}, e = shot(at, one, spec.db, who.distance, who.pan); g.next = at + e.seconds + within(rng, spec.pause); return [e]; }};
      gens.push(g);
    }
  }
  if (recipe.glass) {
    const spec = recipe.glass, g: Gen = {next: rng.range(1, spec.every[1]), fire(at) {
      g.next = at + within(rng, spec.every);
      const style = weighted(rng, [['toast', 0.25], ['set', 0.45], ['ice', 0.3]] as const);
      return [shot(at, {type: 'glass', style, f0: rng.range(650, 1100), seed: rng.seed()}, spec.db, rng.pick(spec.distance), rng.range(-0.85, 0.85))];
    }};
    gens.push(g);
  }
  if (recipe.slots) {
    const spec = recipe.slots;
    for (let m = 0; m < spec.machines; m++) {
      const machine = {root: rng.int(62, 79), wave: rng.pick<Wave>(['square', 'triangle', 'bell', 'square', 'triangle']), pan: rng.range(-0.9, 0.9), distance: rng.pick(spec.distance)};
      for (const style of SLOT_STYLES) {
        const every = spec.every[style], g: Gen = {next: rng.range(0, every[1]), fire(at) {
          g.next = at + within(rng, every);
          return [shot(at, {type: 'slot', style, root: machine.root, wave: style === 'win' ? 'bell' : machine.wave, seed: rng.seed()}, spec.db + (style === 'win' ? 2 : style === 'blip' ? -3 : 0), machine.distance, machine.pan)];
        }};
        gens.push(g);
      }
    }
  }
  if (recipe.coins) {
    const spec = recipe.coins, g: Gen = {next: rng.range(2, spec.every[1]), fire(at) { g.next = at + within(rng, spec.every); return [shot(at, {type: 'coins', count: rng.int(8, 30), f0: rng.range(3000, 4800), seed: rng.seed()}, spec.db, rng.pick(spec.distance), rng.range(-0.9, 0.9))]; }};
    gens.push(g);
  }
  if (recipe.birds) {
    const spec = recipe.birds;
    const bird = () => { const species = weighted(rng, SPECIES.map(([s, w]) => [s, w] as const)); return {species, pitch: rng.range(0.88, 1.12), song: rng.seed(), pan: rng.range(-0.9, 0.9), distance: rng.pick<Distance>(['near', 'mid', 'mid', 'far', 'far', 'distant']), left: rng.int(2, 7)}; };
    for (let i = 0; i < spec.count; i++) {
      let who = bird();
      // A bird sings its song a few times with short pauses, then is quiet a while; sometimes another takes its place.
      const g: Gen = {next: rng.range(0, 6), fire(at) {
        const e = shot(at, {type: 'bird', species: who.species, pitch: who.pitch, song: who.song, seed: rng.seed()}, spec.db + (who.species === 'coo' ? -6 : 0), who.distance, who.pan);
        if (--who.left > 0) g.next = at + e.seconds + within(rng, SPECIES.find(s => s[0] === who.species)![2]);
        else { g.next = at + e.seconds + rng.range(8, 30); who = rng.chance(0.4) ? bird() : {...who, left: rng.int(2, 7), pan: clamp(who.pan + rng.range(-0.3, 0.3), -1, 1)}; }
        return [e];
      }};
      gens.push(g);
    }
  }
  if (recipe.cars) {
    const spec = recipe.cars, g: Gen = {next: rng.range(0, 3), fire(at) {
      g.next = at + within(rng, spec.every);
      const heavy = rng.chance(0.2), side = rng.chance(0.5) ? 1 : -1, from = side * rng.range(0.4, 1);
      return [shot(at, {type: 'car', seconds: within(rng, spec.seconds) * (heavy ? 1.3 : 1), hz: heavy ? rng.range(350, 600) : rng.range(500, 950), heavy, seed: rng.seed()}, spec.db + (heavy ? 2 : 0), rng.pick(spec.distance), from, -side * rng.range(0.3, 1))];
    }};
    gens.push(g);
  }
  if (recipe.horns) {
    const spec = recipe.horns, g: Gen = {next: rng.range(8, spec.every[1]), fire(at) { g.next = at + within(rng, spec.every); return [shot(at, {type: 'horn', hz: rng.range(380, 440), seed: rng.seed()}, spec.db, 'distant', rng.range(-0.9, 0.9))]; }};
    gens.push(g);
  }
  return {
    recipe,
    plan(from: number, to: number): AmbienceEvent[] {
      const out: AmbienceEvent[] = [];
      for (;;) {
        let first: Gen | null = null;
        for (const g of gens) if (g.next < to && (!first || g.next < first.next)) first = g;
        if (!first) break;
        for (const e of first.fire(first.next)) if (e.at >= from) out.push(e);
      }
      return out.sort((a, b) => a.at - b.at);
    },
  };
}
export type Planner = ReturnType<typeof createPlanner>;

// ── music ───────────────────────────────────────────────────────────────────
// Four tracks for a quiet evening at the table, made like everything else here: every note is synthesised in the browser as
// it is needed, nothing is downloaded. A composer writes a track as it plays, a phrase (eight bars or so) at a time, from a
// seed: a chord progression drawn from the moves the style makes (functional harmony: ii goes to V, V to I, and so on), always
// in one key, each phrase closing on a cadence; chords voiced so that every voice moves as little as it can to the next chord;
// a bass line that lands on the root of each new chord and walks or steps there; and the rhythm of the style (the trio's
// swing, the bossa's syncopation, a slow pulse at night). Every phrase is drawn anew, so the music does not come round again
// within the hour. The instruments are additive and FM synthesis of sines and filtered noise: no square or saw waves, and every
// note sits in equal temperament at A = 440 Hz.
export type MusicTrack = 'lounge' | 'natt' | 'bossa' | 'stilla';
export const MUSIC_IDS: MusicTrack[] = ['lounge', 'natt', 'bossa', 'stilla'];
/** The tracks on the page, in its order (the page adds Tyst, no music, before them). */
export const MUSIC: {id: MusicTrack; label: string; note: string}[] = [
  {id: 'lounge', label: 'Lounge', note: 'En lugn trio i baren: elpiano, kontrabas och vispar på virveln, med swing.'},
  {id: 'natt', label: 'Natt', note: 'Sent och elektroniskt: mjuka klangmattor, en långsam puls, en djup bas och ett eko.'},
  {id: 'bossa', label: 'Bossa', note: 'Bossa nova: nylonsträngad gitarr, kontrabas, kantslag och shaker.'},
  {id: 'stilla', label: 'Stilla', note: 'Långa, stilla klanger utan takt, och en ljus klocka då och då.'},
];
/** The page's music chooser: Tyst first, as for the backgrounds. */
export const TRACKS: {id: MusicTrack | null; label: string; note: string}[] = [{id: null, label: 'Tyst', note: 'Ingen musik.'}, ...MUSIC];
export type ScaleName = 'major' | 'dorian';
export const SCALES: Record<ScaleName, number[]> = {major: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10]};
const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
export const pcOf = (midi: number) => ((midi % 12) + 12) % 12;
export const midiToHz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
/** A seventh chord on a degree of the key (0 = I), its pitch classes, and the tensions that sit well on it (null: none). */
export type Chord = {degree: number; name: string; quality: 'maj7' | 'm7' | '7' | 'm7b5'; root: number; third: number; fifth: number; seventh: number; ninth: number | null; eleventh: number | null; thirteenth: number | null};
export function chordOf(key: number, scale: ScaleName, degree: number): Chord {
  const s = SCALES[scale], pc = (i: number) => (key + s[(degree + i) % 7]) % 12, root = pc(0), iv = (i: number) => (pc(i) - root + 12) % 12;
  const minor = iv(2) === 3, quality = !minor ? (iv(6) === 11 ? 'maj7' : '7') : iv(4) === 6 ? 'm7b5' : 'm7';
  return {
    degree, name: NOTE_NAMES[root] + quality, quality, root, third: pc(2), fifth: pc(4), seventh: pc(6),
    ninth: iv(1) === 2 ? pc(1) : null, // never a flat ninth
    eleventh: (minor ? iv(3) === 5 : iv(3) === 6) ? pc(3) : null, // the eleventh on a minor chord; on a major one only the raised (Lydian) one
    thirteenth: iv(5) === 9 && quality !== 'm7b5' ? pc(5) : null, // never a flat thirteenth
  };
}
export const chordTones = (c: Chord) => [c.root, c.third, c.fifth, c.seventh];
export const chordColours = (c: Chord) => [c.ninth, c.eleventh, c.thirteenth].filter((x): x is number => x !== null);
/**
 * The pitch classes a keyboard or guitar plays for a chord. rootless: the bass has the root, so the third and seventh say
 * what the chord is and a ninth and a fifth or thirteenth colour it (the jazz pianist's way). open: root, fifth, ninth,
 * third and seventh spread wide, for the long still chords.
 */
export function voicingTones(c: Chord, rng: Rng, kind: 'rootless' | 'open'): number[] {
  const ninth = c.ninth ?? c.root;
  if (kind === 'open') return [c.root, c.fifth, ninth, c.third, c.seventh];
  if (c.quality === '7') return [c.third, c.seventh, ninth, c.thirteenth ?? c.fifth];
  if (c.quality === 'm7b5') return [c.third, c.fifth, c.seventh, c.eleventh ?? c.root];
  if (c.quality === 'm7') return [c.third, c.seventh, ninth, c.eleventh !== null && rng.chance(0.3) ? c.eleventh : c.fifth];
  return [c.third, c.seventh, ninth, c.thirteenth !== null && rng.chance(0.3) ? c.thirteenth : c.fifth];
}
/**
 * Voice leading: places the pitch classes within range so that the chord spans no more than span semitones, has no minor
 * second between neighbouring voices and nothing closer than a minor third low down (where close notes turn to mud), and moves
 * as little as possible from the last chord (each voice to its counterpart), drawn a little toward the middle of the range.
 */
export function voiceLead(pcs: number[], previous: number[] | null, range: [number, number], span: number): number[] {
  const options = pcs.map(pc => { const list: number[] = []; for (let m = range[0]; m <= range[1]; m++) if (pcOf(m) === pc) list.push(m); return list; });
  const centre = (range[0] + range[1]) / 2, mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length, pick: number[] = [];
  let best: number[] | null = null, bestCost = Infinity, strict = true;
  const walk = (i: number) => {
    if (i < options.length) { for (const m of options[i]) { pick.push(m); walk(i + 1); pick.pop(); } return; }
    const v = [...pick].sort((a, b) => a - b);
    if (v[v.length - 1] - v[0] > span) return;
    for (let k = 1; k < v.length; k++) { const gap = v[k] - v[k - 1]; if (gap < 1 || (strict && (gap === 1 || (v[k - 1] < 55 && gap < 3)))) return; }
    let cost = 0.4 * Math.abs(mean(v) - centre);
    if (previous && previous.length === v.length) for (let k = 0; k < v.length; k++) cost += Math.abs(v[k] - previous[k]);
    else if (previous && previous.length) cost += v.length * Math.abs(mean(v) - mean(previous));
    if (cost < bestCost) { bestCost = cost; best = v; }
  };
  walk(0); if (!best) { strict = false; walk(0); }
  return best ?? pcs.map(pc => range[0] + ((pc - pcOf(range[0]) + 12) % 12)).sort((a, b) => a - b);
}
/**
 * The note of pitch class pc nearest to near, within range (which spans an octave or more). pull: how much a semitone from the
 * middle of the range counts against a note, so that a line drifting toward an edge comes back before it must leap.
 */
export function nearestNote(pc: number, near: number, range: [number, number], pull = 0): number {
  const centre = (range[0] + range[1]) / 2, cost = (m: number) => Math.abs(m - near) + pull * Math.abs(m - centre);
  let best = -1; for (let m = range[0]; m <= range[1]; m++) if (pcOf(m) === pc && (best < 0 || cost(m) < cost(best))) best = m;
  return best;
}
/**
 * The octave of each root a bass plays through a phrase (the last chord given is the next phrase's first): chosen for the
 * whole phrase at once (a shortest path), so that every move is a fifth or less where the range allows, an octave if it must,
 * and the line stays near the middle rather than drifting to an edge it would have to leap back from. from: the note the
 * line stands on; if it is the first chord's root, the line starts there.
 */
export function bassRoots(chords: Chord[], from: number | null, range: [number, number]): number[] {
  const centre = (range[0] + range[1]) / 2, leap = (a: number, b: number) => { const d = Math.abs(a - b); return d <= 7 ? d : d === 12 ? 14 : 40 + d; };
  const options = chords.map((c, i) => { const list: number[] = []; if (i === 0 && from !== null && pcOf(from) === c.root) return [from]; for (let m = range[0]; m <= range[1]; m++) if (pcOf(m) === c.root) list.push(m); return list; });
  let cost = options[0].map(m => (from === null ? 0 : leap(from, m)) + 0.3 * Math.abs(m - centre));
  const back: number[][] = [];
  for (let i = 1; i < options.length; i++) {
    const row: number[] = [], arg: number[] = [];
    for (const m of options[i]) { let best = Infinity, which = 0; options[i - 1].forEach((p, k) => { const c = cost[k] + leap(p, m); if (c < best) { best = c; which = k; } }); row.push(best + 0.3 * Math.abs(m - centre)); arg.push(which); }
    cost = row; back.push(arg);
  }
  // The phrase ends within six semitones of the middle where it can: from there the next root is a fifth or less away, in range.
  const room = (range[1] - range[0]) / 2 - 6;
  cost = cost.map((c, j) => c + 4 * Math.max(0, Math.abs(options[options.length - 1][j] - centre) - room));
  let k = cost.indexOf(Math.min(...cost)); const out = [options[options.length - 1][k]];
  for (let i = back.length - 1; i >= 0; i--) { k = back[i][k]; out.unshift(options[i][k]); }
  return out;
}
/**
 * The note a bass plays just before it reaches target, coming from: a half step below or above (the chromatic approach), the
 * scale step below or above, or the target's fifth; never more than a fifth from where it comes from, never a repeat.
 */
export function approachNote(rng: Rng, scale: number[], target: number, from: number, range: [number, number]): number {
  let below = target - 1; while (!scale.includes(pcOf(below))) below--;
  let above = target + 1; while (!scale.includes(pcOf(above))) above++;
  const options = ([[target - 1, 3], [target + 1, 2], [below, 2], [above, 2], [target + 7, 1], [target - 5, 1]] as [number, number][])
    .filter(([m]) => m >= range[0] && m <= range[1] && m !== from && m !== target && Math.abs(m - from) <= 7);
  return options.length ? weighted(rng, options) : target + (target - 1 >= range[0] ? -1 : 1);
}
const stepWeight = (step: number) => step <= 2 ? 3 : step <= 4 ? 2.5 : step === 5 ? 1.5 : step === 7 ? 1 : 0.3;
/**
 * A walking bass over one chord: the root on the first beat, a chord tone on the second, then scale tones toward the note that
 * approaches the next root, one note a beat. Every step is a fifth or less.
 */
export function walkLine(rng: Rng, scale: number[], chord: Chord, root: number, next: number, beats: number, range: [number, number]): number[] {
  const line = [root]; if (beats < 2) return line;
  const approach = approachNote(rng, scale, next, root, range), tones = chordTones(chord);
  for (let b = 1; b < beats - 1; b++) {
    const prev = line[b - 1], left = beats - 1 - b, options: [number, number][] = [];
    for (let m = prev - 7; m <= prev + 7; m++) {
      if (m < range[0] || m > range[1] || m === prev || (left === 1 && m === approach) || !scale.includes(pcOf(m))) continue;
      if (b === 1 && !tones.includes(pcOf(m))) continue; // the second beat spells the chord
      if (Math.abs(m - approach) > (left === 1 ? 5 : 2 + 3 * left)) continue; // stay within reach of the approach
      options.push([m, stepWeight(Math.abs(m - prev)) * (tones.includes(pcOf(m)) ? 1.5 : 1)]);
    }
    line.push(options.length ? weighted(rng, options) : prev + Math.sign(approach - prev) * Math.min(2, Math.abs(approach - prev)));
  }
  line.push(approach);
  return line;
}

/** One stretch of a phrase on one chord: a degree of the key for so many beats. */
export type Slot = {degree: number; beats: number};
type Moves = Record<number, [number, number][]>;
export type HarmonySpec = {
  key: number; scale: ScaleName;
  /** Beats in a phrase; a phrase is built of groups (one long chord, or two shorter ones in the same span) and ends on a cadence. */
  beats: number; groups: [number[], number][]; cadences: [Slot[], number][];
  /** Where each degree may go next, with weights; reopen: where a phrase may start after one that closed on the tonic. */
  moves: Moves; reopen: [number, number][];
};
/** The chords of one phrase, from start: free moves first, the last of them leaning toward the cadence, then the cadence. */
export function phraseSlots(h: HarmonySpec, rng: Rng, start: number): Slot[] {
  const cadence = h.cadences.length ? weighted(rng, h.cadences) : [], sum = (list: number[]) => list.reduce((a, b) => a + b, 0), lengths: number[] = [];
  for (let left = h.beats - sum(cadence.map(s => s.beats)); left > 0;) {
    const fits = h.groups.filter(([g]) => sum(g) <= left);
    if (!fits.length) { if (lengths.length) lengths[lengths.length - 1] += left; else lengths.push(left); break; }
    const group = weighted(rng, fits); lengths.push(...group); left -= sum(group);
  }
  const slots: Slot[] = []; let degree = start;
  lengths.forEach((beats, i) => {
    if (i > 0) {
      const last = i === lengths.length - 1 && cadence.length > 0, target = cadence[0]?.degree;
      let options = h.moves[degree].filter(([d]) => !last || d !== target);
      if (!options.length) options = h.moves[degree];
      degree = weighted(rng, options.map(([d, w]) => [d, last && h.moves[d]?.some(([e]) => e === target) ? 3 * w : w] as const));
    }
    slots.push({degree, beats});
  });
  return [...slots, ...cadence.map(s => ({...s}))];
}
/** Where the next phrase starts: home after a phrase that leans there, otherwise on with the progression. */
function phraseStart(h: HarmonySpec, rng: Rng, last: number | null): number {
  if (last === null) return 0;
  if (last !== 0 && h.moves[last].some(([d]) => d === 0) && rng.chance(0.85)) return 0;
  return weighted(rng, last === 0 ? h.reopen : h.moves[last]);
}

export type MusicPart = 'keys' | 'bass' | 'guitar' | 'pad' | 'sub' | 'bell' | 'swish' | 'tap' | 'chick' | 'kick' | 'snare' | 'hat' | 'shaker' | 'rim';
/** One note (or drum hit) of a track: seconds from the track's start, how long it is held, its pitch and strength (0–1). */
export type MusicNote = {at: number; seconds: number; part: MusicPart; midi: number; velocity: number; pan: number; seed: number; attack?: number; release?: number};
export type MusicRecipe = {
  tempo: number; swing: number; harmony: HarmonySpec;
  /** Brings the track to LEVEL.musicDbA at the default Musik level (measured; see the proof). */
  trimDb: number;
  reverb: {seconds: number; damping: number; predelay: number};
  /** An echo: its delay in beats, how much comes back each time, and how dark each repeat gets. */
  echo?: {beats: number; feedback: number; lowpass: number};
  /** Each part's level (dB), its share of the reverb, and of the echo. */
  mix: Partial<Record<MusicPart, {db: number; wet: number; echo?: number}>>;
};
// Where the major-key tracks go from each degree: I to ii, vi, IV or iii; ii mostly to V; V home or to vi; never to vii.
const MAJOR_MOVES: Moves = {
  0: [[1, 3], [5, 3], [3, 3], [2, 1.2]], 1: [[4, 6], [2, 1], [3, 0.6]], 2: [[5, 4], [3, 2], [1, 1.5]],
  3: [[4, 2], [2, 1.5], [1, 1.5], [0, 2]], 4: [[0, 6], [5, 2], [2, 0.5]], 5: [[1, 4], [3, 2.5], [4, 1]],
};
const slots = (...pairs: [number, number][]): Slot[] => pairs.map(([degree, beats]) => ({degree, beats}));
export const MUSIC_RECIPES: Record<MusicTrack, MusicRecipe> = {
  // A trio at 88 to the minute in F major: electric piano comping, a walking or two-beat bass, brushes. Phrases of eight bars
  // closing on ii–V–I, V–I, a turnaround or a half cadence.
  lounge: {
    tempo: 88, swing: 0.64, trimDb: 6.1, reverb: {seconds: 1.8, damping: 0.55, predelay: 0.02},
    harmony: {key: 5, scale: 'major', beats: 32, groups: [[[4], 3], [[2, 2], 1.2]], moves: MAJOR_MOVES, reopen: [[0, 2], [3, 1.5], [5, 1.5], [1, 1]],
      cadences: [[slots([1, 2], [4, 2], [0, 4]), 3], [slots([4, 4], [0, 4]), 1.5], [slots([0, 2], [5, 2], [1, 2], [4, 2]), 2], [slots([1, 4], [4, 4]), 1.5], [slots([3, 4], [4, 4]), 0.8]]},
    mix: {keys: {db: 0, wet: 0.3}, bass: {db: 0, wet: 0.08}, swish: {db: -14, wet: 0.2}, tap: {db: -6, wet: 0.25}, chick: {db: -8, wet: 0.15}},
  },
  // Late, electronic, at 76 to the minute in D Dorian: pads, a sub bass on the pulse of a soft kick, a snare on the third
  // beat (half time), quiet hats, and bell arpeggios into an echo. A chord lasts two bars; every phrase leads back to i.
  natt: {
    tempo: 76, swing: 0.56, trimDb: 1.5, reverb: {seconds: 2.8, damping: 0.6, predelay: 0.03}, echo: {beats: 0.75, feedback: 0.38, lowpass: 2600},
    harmony: {key: 2, scale: 'dorian', beats: 32, groups: [[[8], 3], [[4, 4], 1]],
      moves: {0: [[3, 4], [6, 3], [2, 2], [4, 1.5]], 2: [[3, 3], [6, 2], [0, 1.5]], 3: [[0, 4], [6, 2], [4, 1]], 4: [[0, 3], [2, 1.5], [6, 1.5]], 6: [[0, 4], [3, 2], [2, 1.5]]},
      reopen: [[3, 1], [6, 1], [2, 1]], cadences: [[slots([3, 8]), 2], [slots([6, 8]), 2], [slots([4, 8]), 1], [slots([2, 4], [3, 4]), 1]]},
    mix: {pad: {db: -2, wet: 0.45}, sub: {db: -1, wet: 0}, kick: {db: -2, wet: 0.04}, snare: {db: -5, wet: 0.5}, hat: {db: -5, wet: 0.2}, bell: {db: -12, wet: 0.35, echo: 0.55}},
  },
  // Bossa nova at 124 to the minute in G major: nylon guitar in the bossa's syncopation, a bass on one and three with the
  // pickups between, a cross-stick on the clave and a shaker. A chord lasts one or two bars; phrases close on ii–V–I.
  bossa: {
    tempo: 124, swing: 0.5, trimDb: 2.6, reverb: {seconds: 1.5, damping: 0.55, predelay: 0.015},
    harmony: {key: 7, scale: 'major', beats: 32, groups: [[[8], 2], [[4, 4], 2]], moves: MAJOR_MOVES, reopen: [[0, 2], [3, 1.5], [1, 1]],
      cadences: [[slots([1, 4], [4, 4], [0, 8]), 3], [slots([3, 4], [4, 4], [0, 8]), 1.5], [slots([5, 4], [1, 4], [4, 8]), 1], [slots([1, 8], [4, 8]), 1]]},
    mix: {guitar: {db: 0, wet: 0.22}, bass: {db: 0, wet: 0.06}, rim: {db: -2, wet: 0.15}, shaker: {db: -5, wet: 0.12}},
  },
  // Still, in E-flat major, without a beat to hear: open chords of five voices that swell in over seconds and fade as the next
  // comes, a low root under them, and now and then a bell on a note of the chord.
  stilla: {
    tempo: 64, swing: 0.5, trimDb: -1.8, reverb: {seconds: 4.5, damping: 0.55, predelay: 0.04},
    harmony: {key: 3, scale: 'major', beats: 40, groups: [[[8], 2], [[10], 1], [[12], 2]], cadences: [],
      moves: {0: [[3, 4], [5, 3], [1, 1.5], [2, 1]], 1: [[3, 2], [0, 2], [5, 1]], 2: [[5, 3], [3, 2]], 3: [[0, 4], [5, 2], [1, 1.5], [2, 1]], 5: [[3, 4], [0, 2], [1, 1.5]]},
      reopen: [[3, 4], [5, 3], [1, 1.5], [2, 1]]},
    mix: {pad: {db: 0, wet: 0.5}, sub: {db: -3, wet: 0.2}, bell: {db: -5, wet: 0.6}},
  },
};
/** A beat's place in time, in beats, with swing: an off-beat eighth comes late (0.5: straight, 2/3: a triplet feel). */
export const swungBeat = (beat: number, swing: number) => { const whole = Math.floor(beat + 1e-9); return Math.abs(beat - whole - 0.5) < 1e-6 ? whole + swing : beat; };
type Span = {beat: number; beats: number; chord: Chord};
type Memory = {voicing: number[] | null; bass: number | null; top: number | null};
type Writing = {rng: Rng; spans: Span[]; next: Chord; beats: number; phrase: number; memory: Memory; scale: number[]; spb: number; time: (beat: number) => number};
export type ChordSpan = {at: number; seconds: number; chord: Chord};
/** A note with its seed; a few milliseconds of human unevenness are the caller's (human()). */
function note(rng: Rng, at: number, seconds: number, part: MusicPart, midi: number, velocity: number, pan: number, extra?: {attack?: number; release?: number}): MusicNote {
  return {at: Math.max(0, at), seconds, part, midi, velocity: clamp(velocity, 0.05, 1), pan: clamp(pan, -1, 1), seed: rng.seed(), ...extra};
}
const human = (rng: Rng, ms: number) => clamp(rng.normal() * ms / 2000, -ms / 1000, ms / 1000);
const spanAt = (spans: Span[], beat: number) => { let s = spans[0]; for (const x of spans) if (x.beat <= beat + 1e-9) s = x; return s; };
/** The notes of chord tones and colours of a chord within range, low to high: what a melody over it may use. */
const chordNotes = (c: Chord, range: [number, number]) => { const pcs = [...chordTones(c), ...chordColours(c)], out: number[] = []; for (let m = range[0]; m <= range[1]; m++) if (pcs.includes(pcOf(m))) out.push(m); return out; };
/** The bass's roots for the phrase's spans and the chord after them; the last is kept for the next phrase to start on. */
const phraseRoots = (w: Writing, range: [number, number]) => { const roots = bassRoots([...w.spans.map(s => s.chord), w.next], w.memory.bass, range); w.memory.bass = roots[roots.length - 1]; return roots; };
/** A chord's fifth in the bass, the one of the two (above or below the root) that is nearer to where the line goes next. */
const bassFifth = (chord: Chord, root: number, toward: number, range: [number, number]) => [root + 7, root - 5].filter(m => m >= range[0] && m <= range[1] && pcOf(m) === chord.fifth).sort((a, b) => Math.abs(a - toward) - Math.abs(b - toward))[0] ?? root;

const COMP4: [[number, number][], number][] = [[[[0, 1.6]], 2], [[[0, 0.9], [1.5, 2.2]], 3], [[[1.5, 2]], 1.5], [[[0, 3.6]], 1.2], [[[1, 0.8], [2.5, 1.2]], 1.2], [[[0, 0.9], [2, 1.6]], 1.5], [[[2.5, 1.3]], 0.6]];
const COMP2: [[number, number][], number][] = [[[[0, 1.6]], 3], [[[0, 0.8], [1.5, 0.45]], 1.5], [[[0.5, 1.3]], 1]];
/** The trio: comping on the electric piano (a few rhythms, each chord voiced from the last), a fill now and then, bass, brushes. */
function writeLounge(w: Writing): MusicNote[] {
  const {rng, spans, time, spb, memory} = w, out: MusicNote[] = [], low: [number, number] = [28, 50], keys: [number, number] = [52, 74];
  const walk = w.phrase > 0 && rng.chance(0.65), fills = w.phrase === 0 ? 0.15 : rng.range(0.15, 0.45), roots = phraseRoots(w, low);
  spans.forEach((s, i) => {
    const root = roots[i], nextRoot = roots[i + 1];
    // Bass: walking a note a beat, or two to the bar (root, then the fifth or an approach to the next root).
    let line: [number, number, number][];
    if (walk) line = walkLine(rng, w.scale, s.chord, root, nextRoot, s.beats, low).map((m, b) => [b, m, 0.92]);
    else if (s.beats >= 4) { const fifth = bassFifth(s.chord, root, nextRoot, low), second = Math.abs(fifth - nextRoot) <= 7 && rng.chance(0.6) ? fifth : approachNote(rng, w.scale, nextRoot, root, low); line = [[0, root, 1.9], [2, second, 1.9]]; }
    else line = [[0, root, 1.9]];
    for (const [b, m, len] of line) out.push(note(rng, time(s.beat + b) + human(rng, 8), len * spb, 'bass', m, (b === 0 ? 0.72 : 0.6) + rng.range(-0.05, 0.05), 0.02));
    // Keys: one voicing for the chord, struck in one of the comping rhythms, sometimes rolled.
    const voicing = voiceLead(voicingTones(s.chord, rng, 'rootless'), memory.voicing, keys, 13); memory.voicing = voicing;
    for (const [b, len] of weighted(rng, s.beats >= 4 ? COMP4 : COMP2)) {
      const at = time(s.beat + b) + human(rng, 8), roll = rng.chance(0.25) ? rng.range(0.008, 0.02) : rng.range(0.001, 0.005), v = rng.range(0.38, 0.55);
      voicing.forEach((m, k) => out.push(note(rng, at + k * roll, Math.min(len, s.beats - b) * spb, 'keys', m, v + (k === voicing.length - 1 ? 0.06 : 0) + rng.range(-0.03, 0.03), -0.15 + rng.range(-0.04, 0.04))));
    }
  });
  // Fills: a few swung eighths of the right hand late in a bar, on the notes of the chord sounding, stepping one way and then
  // perhaps back, the last held.
  for (let bar = 0; bar < w.beats / 4; bar++) {
    if (!rng.chance(fills)) continue;
    const from = bar * 4 + (rng.chance(0.5) ? 2 : 2.5), count = rng.int(3, 5);
    let m = memory.top ?? 72, dir = rng.chance(0.5) ? 1 : -1;
    for (let k = 0; k < count && from + k * 0.5 <= bar * 4 + 3.5; k++) {
      const beat = from + k * 0.5, choices = chordNotes(spanAt(spans, beat).chord, [65, 84]);
      let pick = dir > 0 ? choices.find(x => x > m) : [...choices].reverse().find(x => x < m);
      if (pick === undefined || (k > 0 && rng.chance(0.2))) { dir = -dir; pick = dir > 0 ? choices.find(x => x > m) : [...choices].reverse().find(x => x < m); }
      if (pick === undefined) break;
      m = pick; const last = k === count - 1 || from + (k + 1) * 0.5 > bar * 4 + 3.5;
      out.push(note(rng, time(beat) + human(rng, 8), (last ? 1.2 : 0.45) * spb, 'keys', m, rng.range(0.3, 0.42), 0.12));
    }
    memory.top = m;
  }
  // Brushes: a sweep each half bar, a tap on two and four (and now and then a soft one on the "and"), the hi-hat's foot on two and four.
  for (let bar = 0; bar < w.beats / 4; bar++) {
    const b0 = bar * 4;
    for (const b of [0, 2]) out.push(note(rng, time(b0 + b), 2 * spb * 0.96, 'swish', 0, rng.range(0.5, 0.65), 0.3));
    for (const b of [1, 3]) {
      out.push(note(rng, time(b0 + b) + human(rng, 6), 0.2, 'tap', 0, (walk ? 0.58 : 0.45) + rng.range(-0.05, 0.05), 0.25));
      out.push(note(rng, time(b0 + b) + human(rng, 4), 0.1, 'chick', 0, rng.range(0.36, 0.46), -0.3));
      if (walk && rng.chance(0.3)) out.push(note(rng, time(b0 + b + 1.5) + human(rng, 6), 0.15, 'tap', 0, rng.range(0.2, 0.3), 0.25));
    }
  }
  return out;
}
/** Night: pads, a sub bass on the pulse, kick and half-time snare, hats, and bell arpeggios in some phrases. */
function writeNatt(w: Writing): MusicNote[] {
  const {rng, spans, time, spb, memory} = w, out: MusicNote[] = [], low: [number, number] = [26, 50];
  const arp = w.phrase === 0 ? 0 : weighted(rng, [[0, 1], [0.45, 1.5], [0.75, 1.2]] as const), drums = w.phrase === 0 || !rng.chance(0.15), from = w.phrase === 0 ? 4 : 0, roots = phraseRoots(w, low);
  spans.forEach((s, i) => {
    const root = roots[i], nextRoot = roots[i + 1];
    const voicing = voiceLead(voicingTones(s.chord, rng, 'rootless'), memory.voicing, [53, 74], 14); memory.voicing = voicing;
    voicing.forEach((m, k) => out.push(note(rng, time(s.beat) + k * 0.012, s.beats * spb + 0.15, 'pad', m, rng.range(0.45, 0.55), (k / (voicing.length - 1) - 0.5) * 0.8, {attack: 0.7, release: 1.6})));
    for (let bar = 0; bar < s.beats / 4; bar++) {
      const b0 = s.beat + bar * 4, last = bar === s.beats / 4 - 1;
      out.push(note(rng, time(b0), 2.25 * spb, 'sub', root, 0.72, 0, {attack: 0.012, release: 0.2}));
      if (!last) out.push(note(rng, time(b0 + 2.5), 1.25 * spb, 'sub', root, 0.55, 0, {attack: 0.012, release: 0.2}));
      else {
        const fifth = bassFifth(s.chord, root, nextRoot, low), other = Math.abs(fifth - nextRoot) <= 7 && rng.chance(0.5) ? fifth : root;
        out.push(note(rng, time(b0 + 2.5), 0.75 * spb, 'sub', other, 0.55, 0, {attack: 0.012, release: 0.15}));
        if (rng.chance(0.6)) out.push(note(rng, time(b0 + 3.5), 0.45 * spb, 'sub', approachNote(rng, w.scale, nextRoot, other, low), 0.5, 0, {attack: 0.012, release: 0.12}));
      }
    }
  });
  for (let bar = 0; bar < w.beats / 4; bar++) {
    const b0 = bar * 4;
    if (drums && bar >= from) {
      out.push(note(rng, time(b0), 0.6, 'kick', 0, rng.range(0.7, 0.8), 0));
      if (rng.chance(0.5)) out.push(note(rng, time(b0 + 2.5), 0.6, 'kick', 0, rng.range(0.45, 0.55), 0));
      out.push(note(rng, time(b0 + 2) + human(rng, 6), 0.4, 'snare', 0, rng.range(0.5, 0.6), 0.05));
    }
    for (let e = 0; e < 8; e++) if (bar >= Math.min(from, 2) && rng.chance(0.85)) out.push(note(rng, time(b0 + e / 2) + human(rng, 5), 0.06, 'hat', 0, (e % 2 ? 0.34 : 0.22) + rng.range(-0.05, 0.05) - (drums ? 0 : 0.08), 0.35));
    // Bells: a figure on the notes of the chord, up, down or both, into the echo.
    if (arp && rng.chance(arp)) {
      const figure = weighted(rng, [[[0, 1, 2, 3], 1], [[0, 0.5, 1.5, 2.5], 1.5], [[0, 1.5, 3], 1.5], [[0.5, 1, 2, 3.5], 1]] as const), shape = rng.pick(['up', 'down', 'both'] as const);
      let m = memory.top ?? 74, dir = shape === 'down' ? -1 : 1;
      for (const b of figure) {
        const choices = chordNotes(spanAt(spans, b0 + b).chord, [64, 86]);
        let pick = dir > 0 ? choices.find(x => x > m) : [...choices].reverse().find(x => x < m);
        if (pick === undefined || (shape === 'both' && rng.chance(0.35))) { dir = -dir; pick = dir > 0 ? choices.find(x => x > m) : [...choices].reverse().find(x => x < m); }
        if (pick === undefined) continue;
        m = pick; out.push(note(rng, time(b0 + b) + human(rng, 4), 0.5, 'bell', m, rng.range(0.32, 0.45), rng.chance(0.5) ? -0.35 : 0.35));
      }
      memory.top = m;
    }
  }
  return out;
}
const CLAVE = [0, 3, 6, 10, 13];
const BOSSA_GUITAR: [number[], number][] = [[CLAVE, 2], [[0, 2, 5, 8, 10, 13], 1.5], [[0, 3, 5, 8, 11, 13], 1.5], [[0, 3, 6, 8, 11, 14], 1]];
/** Bossa: the guitar's chords in eighths over two bars, the bass's one and three with pickups, a cross-stick on the clave, a shaker. */
function writeBossa(w: Writing): MusicNote[] {
  const {rng, spans, time, spb, memory} = w, out: MusicNote[] = [], low: [number, number] = [31, 52], beats = w.beats, roots = phraseRoots(w, low);
  const voicings = new Map<Span, number[]>();
  for (const s of spans) { const v = voiceLead(voicingTones(s.chord, rng, 'rootless'), memory.voicing, [52, 71], 12); memory.voicing = v; voicings.set(s, v); }
  for (let block = 0; block < beats / 8; block++) {
    const hits = weighted(rng, BOSSA_GUITAR).map(e => block * 8 + e / 2);
    hits.forEach((beat, k) => {
      const s = spanAt(spans, beat), voicing = voicings.get(s)!, until = Math.min(k + 1 < hits.length ? hits[k + 1] : block * 8 + 8, s.beat + s.beats), at = time(beat) + human(rng, 6), v = (beat % 4 === 0 ? 0.55 : 0.47) + rng.range(-0.05, 0.05);
      voicing.forEach((m, j) => out.push(note(rng, at + j * rng.range(0.002, 0.006), Math.min(1.5, (until - beat) * 0.85) * spb, 'guitar', m, v + rng.range(-0.04, 0.04), -0.2 + (j - 1.5) * 0.06)));
    });
    for (const e of CLAVE) if (w.phrase > 0 || block > 0) out.push(note(rng, time(block * 8 + e / 2) + human(rng, 5), 0.1, 'rim', 0, rng.range(0.42, 0.55), 0.25));
  }
  for (let bar = 0; bar < beats / 4; bar++) {
    // On one and three the root and the fifth (the one nearer where the line goes), each with its pickup an eighth before.
    const b0 = bar * 4, s = spanAt(spans, b0), index = spans.indexOf(s), changes = s.beat + s.beats <= b0 + 4, root = roots[index];
    const nextRoot = changes ? roots[index + 1] : root, fifth = bassFifth(s.chord, root, changes ? nextRoot : root + (rng.chance(0.5) ? 7 : -7), low);
    out.push(note(rng, time(b0) + human(rng, 5), 1.35 * spb, 'bass', root, 0.72 + rng.range(-0.04, 0.04), 0.02));
    out.push(note(rng, time(b0 + 1.5) + human(rng, 5), 0.4 * spb, 'bass', fifth, 0.45, 0.02));
    out.push(note(rng, time(b0 + 2) + human(rng, 5), 1.35 * spb, 'bass', fifth, 0.62 + rng.range(-0.04, 0.04), 0.02));
    const pickup = Math.abs(fifth - nextRoot) <= 7 ? nextRoot : approachNote(rng, w.scale, nextRoot, fifth, low); // the next root, or a note leading to it where that is too far
    if (pickup !== nextRoot || rng.chance(0.8)) out.push(note(rng, time(b0 + 3.5) + human(rng, 5), 0.4 * spb, 'bass', pickup, 0.45, 0.02));
    for (let e = 0; e < 8; e++) if (w.phrase > 0 || bar >= 2) out.push(note(rng, time(b0 + e / 2) + human(rng, 4), 0.08, 'shaker', 0, (e % 2 ? 0.42 : 0.28) + rng.range(-0.05, 0.05), -0.35));
  }
  return out;
}
/** Still: five-voice chords that swell and fade into each other, a low root, a bell now and then on a note of the chord. */
function writeStilla(w: Writing): MusicNote[] {
  const {rng, spans, time, spb, memory} = w, out: MusicNote[] = [], roots = phraseRoots(w, [26, 55]);
  spans.forEach((s, i) => {
    const voicing = voiceLead(voicingTones(s.chord, rng, 'open'), memory.voicing, [46, 79], 26), at = time(s.beat), seconds = s.beats * spb; memory.voicing = voicing;
    voicing.forEach((m, k) => out.push(note(rng, at + k * 0.04, seconds, 'pad', m, rng.range(0.4, 0.48), (k / (voicing.length - 1) - 0.5) * 1.1, {attack: 2.6, release: 3.4})));
    out.push(note(rng, at, seconds, 'sub', roots[i], 0.5, 0, {attack: 2, release: 3}));
    const bells: number[] = []; for (let k = rng.int(0, 2) + (s.beats >= 10 ? 1 : 0); k > 0; k--) bells.push(rng.range(1.5, Math.max(1.6, seconds - 1)));
    bells.sort((a, b) => a - b);
    let lastAt = -9;
    for (const t of bells) {
      if (t - lastAt < 1.5) continue;
      const choices = chordNotes(s.chord, [70, 89]).filter(m => m !== memory.top), near = memory.top ?? 79;
      const m = weighted(rng, choices.map(x => [x, 1 / (1 + Math.abs(x - near) / 3)] as const));
      out.push(note(rng, at + t, 1.4, 'bell', m, rng.range(0.25, 0.38), rng.range(-0.6, 0.6))); memory.top = m; lastAt = t;
    }
  });
  return out;
}
const WRITERS: Record<MusicTrack, (w: Writing) => MusicNote[]> = {lounge: writeLounge, natt: writeNatt, bossa: writeBossa, stilla: writeStilla};
/**
 * A track as it plays, from a seed. plan(from, to) gives its notes in [from, to), seconds from the track's start, in order;
 * window after window it gives exactly what one call over the whole span would (as the rooms' planner does). chords: every
 * chord written so far with its time, for the tests and the proof.
 */
export function createComposer(track: MusicTrack, seed: number) {
  const recipe = MUSIC_RECIPES[track], h = recipe.harmony, harmonyRng = createRng(seed), rng = createRng((seed ^ 0x2545f491) >>> 0), spb = 60 / recipe.tempo;
  const scale = SCALES[h.scale].map(i => (h.key + i) % 12), pending: MusicNote[] = [], chords: ChordSpan[] = [], queue: Slot[][] = [], memory: Memory = {voicing: null, bass: null, top: null};
  let t0 = 0.05, last: number | null = null, phrase = 0;
  const harmony = () => { const s = phraseSlots(h, harmonyRng, phraseStart(h, harmonyRng, last)); last = s[s.length - 1].degree; queue.push(s); };
  function write() {
    while (queue.length < 2) harmony();
    const list = queue.shift()!, start = t0; let beat = 0;
    const spans = list.map(s => { const span = {beat, beats: s.beats, chord: chordOf(h.key, h.scale, s.degree)}; beat += s.beats; return span; });
    for (const s of spans) chords.push({at: start + s.beat * spb, seconds: s.beats * spb, chord: s.chord});
    pending.push(...WRITERS[track]({rng, spans, next: chordOf(h.key, h.scale, queue[0][0].degree), beats: beat, phrase, memory, scale, spb, time: b => start + swungBeat(b, recipe.swing) * spb}));
    pending.sort((a, b) => a.at - b.at);
    t0 += beat * spb; phrase++;
  }
  return {
    recipe, scale, chords,
    plan(from: number, to: number): MusicNote[] {
      while (t0 - 0.1 < to) write();
      let n = 0; while (n < pending.length && pending[n].at < to) n++;
      return pending.splice(0, n).filter(e => e.at >= from);
    },
  };
}
export type Composer = ReturnType<typeof createComposer>;

// The instruments. Pitched ones are sums of sines (each harmonic with its own level and decay, the sine by recursion, so
// that a long note is cheap) or two-operator FM for the electric piano; drums are filtered noise and struck resonators, like
// the table's sounds. Each note is rendered with LEAD seconds of silence first and ends in silence. They are rendered at
// their velocity, not to a peak, so that loud and soft stay apart; the recipe's mix and trim set the level.
/** Hits with air in them are made at the context's rate; tones and the brush's long sweep at half of it, pads and the sub at a quarter. */
export const musicRate = (part: MusicPart, rate: number) => part === 'pad' || part === 'sub' ? rate / 4 : ['tap', 'chick', 'hat', 'shaker', 'rim'].includes(part) ? rate : rate / 2;
const rise = (k: number, n: number) => k >= n ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * k / n);
/** Adds harmonics [ratio, level, decay (s; 0 holds)] of f to out from start: a raised-cosine attack, their decays, and from hold on a release. */
function harmonics(out: Float32Array, start: number, f: number, list: [number, number, number][], rate: number, attack: number, hold: number, release: number, amp: number) {
  const total = out.length - start, att = Math.max(1, Math.round(attack * rate)), rel = Math.exp(-1 / (release * rate)), top = rate * 0.42;
  for (const [ratio, level, tau] of list) {
    const hz = f * ratio; if (hz >= top || !level) continue;
    const w = TAU * hz / rate, c = 2 * Math.cos(w), fall = tau > 0 ? Math.exp(-1 / (tau * rate)) : 1;
    let s1 = 0, s0 = -Math.sin(w), e = amp * level, r = 1;
    for (let k = 0; k < total; k++) {
      const s = c * s1 - s0; s0 = s1; s1 = s;
      out[start + k] += e * r * rise(k, att) * s0;
      e *= fall; if (k >= hold) r *= rel;
    }
  }
}
/** Electric piano (a tine piano, FM with the modulator at the note's own pitch): bright at the strike, mellowing as it rings. */
function renderKeys(n: MusicNote, rate: number): Float32Array {
  const f = midiToHz(n.midi), v = n.velocity, tau = clamp(2.4 * Math.sqrt(220 / f), 0.7, 4), start = Math.round(LEAD * rate), hold = Math.round(n.seconds * rate);
  const out = new Float32Array(start + hold + Math.round(0.6 * rate)), w = TAU * f / rate, att = Math.round(0.0025 * rate);
  const fast = Math.exp(-1 / (tau * 0.3 * rate)), slow = Math.exp(-1 / (tau * rate)), bark = Math.exp(-1 / (0.22 * rate)), rel = Math.exp(-1 / (0.1 * rate));
  let a = 0.55, b = 0.45, index = 0.6 + 2.2 * v, r = 1;
  for (let k = 0; k < out.length - start; k++) {
    const p = w * k; out[start + k] = 0.15 * v * (a + b) * r * rise(k, att) * Math.sin(p + (index + 0.35 + 0.4 * v) * Math.sin(p));
    a *= fast; b *= slow; index *= bark; if (k >= hold) r *= rel;
  }
  fadeOut(out, Math.round(0.01 * rate)); return out;
}
/** A double bass plucked: a round fundamental, quicker upper harmonics, a soft thump of the finger. */
function renderBass(n: MusicNote, rate: number): Float32Array {
  const f = midiToHz(n.midi), v = n.velocity, tau = clamp(1.6 * Math.pow(55 / f, 0.3), 0.6, 2.2), start = Math.round(LEAD * rate), hold = Math.round(n.seconds * rate);
  const out = new Float32Array(start + hold + Math.round(0.45 * rate)), rng = createRng(n.seed);
  harmonics(out, start, f, [[1, 1, tau], [2, 0.6, tau / 1.9], [3, 0.32, tau / 2.7], [4, 0.16, tau / 3.5], [5, 0.08, tau / 4.3], [6, 0.04, tau / 5]], rate, 0.006, hold, 0.07, 0.2 * v);
  const thump = new Float32Array(out.length); burst(thump, rng, start, 0.012 * rate, 1); filter(filter(thump, coeffs('lowpass', 400, 0.7, rate)), coeffs('highpass', 40, 0.7, rate));
  mixUnit(out, thump, gainToDb(0.04 * v)); fadeOut(out, Math.round(0.01 * rate)); return out;
}
/** A nylon string plucked: harmonics shaped by where the finger plucks, the high ones dying first, damped when let go. */
function renderGuitar(n: MusicNote, rate: number): Float32Array {
  const f = midiToHz(n.midi), v = n.velocity, rng = createRng(n.seed), at = rng.range(0.15, 0.21), tau = clamp(2.4 * Math.pow(196 / f, 0.35), 0.8, 3.5), start = Math.round(LEAD * rate), hold = Math.round(n.seconds * rate);
  const out = new Float32Array(start + hold + Math.round(0.5 * rate)), list: [number, number, number][] = [];
  for (let h = 1; h <= 10; h++) list.push([h, Math.abs(Math.sin(Math.PI * h * at)) / Math.pow(h, 1.1), tau / (1 + 0.25 * Math.pow(h - 1, 1.3))]);
  harmonics(out, start, f, list, rate, 0.0015, hold, 0.08, 0.15 * v);
  const pluck = new Float32Array(out.length); burst(pluck, rng, start, 0.004 * rate, 1); filter(pluck, coeffs('lowpass', 2500, 0.7, rate));
  mixUnit(out, pluck, gainToDb(0.017 * v)); fadeOut(out, Math.round(0.01 * rate)); return out;
}
/** A soft bell (celesta-like, harmonic, so it never clashes with the chord): seconds sets how long it rings. */
function renderBell(n: MusicNote, rate: number): Float32Array {
  const f = midiToHz(n.midi), tau = clamp(n.seconds * 2.2, 0.5, 4), start = Math.round(LEAD * rate), out = new Float32Array(start + Math.round(5.5 * tau * rate));
  harmonics(out, start, f, [[1, 1, tau], [2, 0.28, tau * 0.4], [3, 0.1, tau * 0.18], [4, 0.05, tau * 0.1]], rate, 0.003, out.length, 1, 0.5 * n.velocity);
  fadeOut(out, Math.round(0.4 * tau * rate)); return out;
}
/** A sub bass: a sine with a little of its octave and twelfth, so that it is heard on small speakers too. */
function renderSub(n: MusicNote, rate: number): Float32Array {
  const f = midiToHz(n.midi), release = n.release ?? 0.2, start = Math.round(LEAD * rate), hold = Math.round(n.seconds * rate), out = new Float32Array(start + hold + Math.round(4.6 * release * rate));
  harmonics(out, start, f, [[1, 1, 0], [2, 0.22, 0], [3, 0.06, 0]], rate, n.attack ?? 0.012, hold, release, 0.25 * n.velocity);
  fadeOut(out, Math.round(Math.min(0.5, release) * rate)); return out;
}
/**
 * A pad: three voices, one in tune and two a few cents either side and softer (a shallow, uneven beating, like a section
 * rather than one player; two equal voices would cancel fully once a second), soft harmonics falling 5 dB an octave and
 * more, opening a little as it swells in over attack seconds and closing as it fades over release seconds. voices: which of
 * the three to make (the page makes the in-tune one and the other two in separate tasks; summed, they are the whole note).
 */
export const PAD_VOICES = [[0, 1], [-4, 0.55], [5, 0.45]] as const;
export function renderPad(n: MusicNote, rate: number, voices: readonly number[] = [0, 1, 2]): Float32Array {
  // The release is cut at −30 dB (and faded): under the reverb and the next chord nobody hears the rest, and long pads are the
  // costliest notes to make. For the same reason the side voices have only the harmonics where their beating is heard.
  const f = midiToHz(n.midi), attack = n.attack ?? 1, release = n.release ?? 2, start = Math.round(LEAD * rate), hold = Math.round(n.seconds * rate), length = hold + Math.round(3.5 * release * rate);
  const out = new Float32Array(start + length), att = Math.round(attack * rate), relK = Math.exp(-1 / (release * rate)), block = 64, rng = createRng(n.seed);
  const env = new Float32Array(Math.ceil(length / block) + 1), bright = new Float32Array(env.length), skips = PAD_VOICES.map(() => rng.int(0, 400));
  let r = 1;
  for (let j = 0; j < env.length; j++) { const k = j * block; if (k >= hold) r = Math.pow(relK, k - hold); env[j] = rise(k, att) * r; bright[j] = 0.25 + 0.35 * rise(k, att) * (0.4 + 0.6 * r); }
  for (const v of voices) {
    const [cents, level] = PAD_VOICES[v], hz = f * Math.pow(2, cents / 1200), skip = skips[v];
    for (let h = 1; h <= (v === 0 ? 6 : 3); h++) { // the sixth harmonic of the brightest pad is 40 dB under the first; no further
      if (hz * h > rate * 0.35) break;
      const w = TAU * hz * h / rate, c = 2 * Math.cos(w), base = 0.17 * level * n.velocity / Math.pow(h, 1.8);
      let s1 = Math.sin(w * skip), s0 = Math.sin(w * (skip - 1)), a = base * env[0]; // each voice from its own phase, so that they do not start in step
      for (let j = 0; j + 1 < env.length; j++) {
        const next = base * env[j + 1] * Math.pow(bright[j + 1], h - 1), step = (next - a) / block, end = Math.min(length, (j + 1) * block);
        for (let k = j * block; k < end; k++) { const s = c * s1 - s0; s0 = s1; s1 = s; out[start + k] += a * s0; a += step; }
        a = next;
      }
    }
  }
  fadeOut(out, Math.round(Math.min(0.5, release) * rate)); return out;
}
/** Noise shaped by an envelope function of the time from the note's start (seconds), into a fresh buffer of seconds. */
function noiseHit(rng: Rng, rate: number, seconds: number, env: (t: number) => number): Float32Array {
  const start = Math.round(LEAD * rate), x = new Float32Array(start + Math.round(seconds * rate));
  for (let k = 0; k < x.length - start; k++) x[start + k] = white(rng) * env(k / rate);
  return x;
}
function renderDrum(n: MusicNote, rate: number): Float32Array {
  const rng = createRng(n.seed), v = n.velocity, start = Math.round(LEAD * rate);
  let out: Float32Array, peak = 0.5;
  if (n.part === 'swish') { // a brush drawn across the snare head: grainy noise swelling and easing over the stroke
    const a = Math.exp(-TAU * 80 / rate); let rough = 0;
    out = noiseHit(rng, rate, n.seconds, t => { const x = t / n.seconds; rough = (1 - a) * Math.abs(white(rng)) * 2 + a * rough; return Math.pow(Math.sin(Math.PI * x), 1.5) * (0.7 + 0.3 * x) * (0.5 + rough); });
    filter(filter(out, coeffs('bandpass', 3500, 0.7, rate)), coeffs('highpass', 900, 0.7, rate)); peak = 0.25;
  } else if (n.part === 'tap' || n.part === 'snare') { // the brush slapped on the snare, or a soft snare: a head, wires, and a short body
    const tap = n.part === 'tap', head = noiseHit(rng, rate, 0.4, t => Math.exp(-t / (tap ? 0.03 : 0.09)) * rise(t * rate, 0.001 * rate)), wires = noiseHit(rng, rate, 0.4, t => Math.exp(-t / (tap ? 0.08 : 0.14)));
    filter(filter(head, coeffs('bandpass', tap ? 2800 : 2000, 0.6, rate)), coeffs('highpass', 600, 0.7, rate)); filter(wires, coeffs('highpass', 2500, 0.7, rate));
    const exc = new Float32Array(head.length), body = new Float32Array(head.length); pulse(exc, start, 0.0015 * rate, 1); ring(body, exc, [{f: 188, a: 1, tau: tap ? 0.04 : 0.07}, {f: 330, a: 0.5, tau: 0.035}], rate);
    out = new Float32Array(head.length); mixUnit(out, head, 0); mixUnit(out, wires, tap ? -12 : -8); mixUnit(out, body, tap ? -10 : -5); peak = tap ? 0.7 : 1;
  } else if (n.part === 'chick' || n.part === 'hat') { // the hi-hat: closed by the foot, or tapped with a stick
    out = noiseHit(rng, rate, 0.15, t => Math.exp(-t / (n.part === 'chick' ? 0.02 : 0.022)) * rise(t * rate, 0.0008 * rate));
    filter(filter(out, coeffs('highpass', n.part === 'chick' ? 5000 : 7000, 0.7, rate)), coeffs('highpass', 5000, 0.7, rate)); peak = 0.8;
  } else if (n.part === 'shaker') { // a shaker: the beads rush in and settle
    out = noiseHit(rng, rate, 0.12, t => t < 0.012 ? rise(t, 0.012) : Math.exp(-(t - 0.012) / 0.03));
    filter(out, coeffs('bandpass', 5500, 1.2, rate)); peak = 0.3;
  } else if (n.part === 'rim') { // the stick laid across the snare, its shaft on the rim: a dry woody knock
    out = new Float32Array(start + Math.round(0.15 * rate)); const exc = new Float32Array(out.length); pulse(exc, start, 0.0002 * rate, 1);
    ring(out, exc, [{f: 1700 * rng.range(0.98, 1.02), a: 1, tau: 0.01}, {f: 520, a: 0.7, tau: 0.02}, {f: 3300, a: 0.3, tau: 0.005}], rate); mixUnit(out, slope(exc, rate), -14);
  } else { // a soft kick: a low sine falling in pitch, a little click on top
    out = new Float32Array(start + Math.round(0.9 * rate)); let phase = 0;
    for (let k = 0; k < out.length - start; k++) { const t = k / rate; phase += TAU * (48 + 75 * Math.exp(-t / 0.03)) / rate; out[start + k] = Math.sin(phase) * Math.exp(-t / 0.2) * rise(k, 0.001 * rate); }
    const click = noiseHit(rng, rate, 0.9, t => Math.exp(-t / 0.003)); filter(click, coeffs('lowpass', 2000, 0.7, rate)); mixUnit(out, click, -22); peak = 0.8;
  }
  fadeOut(out, Math.round(0.005 * rate));
  return scaleTo(out, peak * v);
}
/** The samples of one note of a track, mono, at the rate given (musicRate of its part). */
export function renderMusicNote(n: MusicNote, rate: number): Float32Array {
  switch (n.part) {
    case 'keys': return renderKeys(n, rate);
    case 'bass': return renderBass(n, rate);
    case 'guitar': return renderGuitar(n, rate);
    case 'bell': return renderBell(n, rate);
    case 'sub': return renderSub(n, rate);
    case 'pad': return renderPad(n, rate);
    default: return renderDrum(n, rate);
  }
}

// ── measuring ───────────────────────────────────────────────────────────────
/** In-place radix-2 FFT of a complex signal; the length must be a power of two. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1, ang = -TAU / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const p = i + k, q = p + half, br = re[q] * cr - im[q] * ci, bi = re[q] * ci + im[q] * cr;
        re[q] = re[p] - br; im[q] = im[p] - bi; re[p] += br; im[p] += bi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
/** The power spectrum of a mono signal averaged over Hann-windowed frames of size samples (half overlapping). */
export function powerSpectrum(x: Float32Array, size = 2048): Float64Array {
  const power = new Float64Array(size / 2 + 1), re = new Float64Array(size), im = new Float64Array(size);
  const hop = size / 2, frames = Math.max(1, Math.floor((x.length - size) / hop) + 1);
  for (let f = 0; f < frames; f++) {
    re.fill(0); im.fill(0);
    for (let i = 0; i < size; i++) { const j = f * hop + i; re[i] = j < x.length ? x[j] * (0.5 - 0.5 * Math.cos(TAU * i / size)) : 0; }
    fft(re, im);
    for (let k = 0; k <= size / 2; k++) power[k] += (re[k] * re[k] + im[k] * im[k]) / frames;
  }
  return power;
}
export const BANDS: [string, number, number][] = [['<250', 0, 250], ['250-1k', 250, 1000], ['1-2k', 1000, 2000], ['2-4k', 2000, 4000], ['4-8k', 4000, 8000], ['8k+', 8000, Infinity]];
export type Measure = {
  seconds: number; peakDb: number; peakAt: number; rmsDb: number;
  /** From the first to the last sample within 50 dB of the peak. */
  activeSeconds: number; activeRmsDb: number;
  /** From the peak until the signal stays 40 dB under it. */
  ringSeconds: number;
  centroidHz: number; above2k: number; loudestHz: number; bands: Record<string, number>;
  dc: number; clipped: number; startDb: number; endDb: number;
};
/** The numbers the tests and the proof judge a sound by: level, length, where its energy lies, and whether it is clean. */
export function measure(channels: Float32Array[], rate: number): Measure {
  const n = channels[0].length; let peak = 0, peakAt = 0, sum2 = 0, clipped = 0, dc = 0;
  for (const c of channels) { let s = 0; for (let i = 0; i < n; i++) { const v = c[i], a = Math.abs(v); if (a > peak) { peak = a; peakAt = i; } sum2 += v * v; if (a >= 0.9999) clipped++; s += v; } dc = Math.max(dc, Math.abs(s / n)); }
  const above = (i: number, level: number) => channels.some(c => Math.abs(c[i]) > level), floor = peak * dbToGain(-50), tail = peak * dbToGain(-40);
  let first = 0, last = n - 1, ringEnd = peakAt;
  while (first < n - 1 && !above(first, floor)) first++;
  while (last > first && !above(last, floor)) last--;
  for (let i = n - 1; i > peakAt; i--) if (above(i, tail)) { ringEnd = i; break; }
  let active2 = 0; for (const c of channels) for (let i = first; i <= last; i++) active2 += c[i] * c[i];
  const mono = new Float32Array(last - first + 1); for (const c of channels) for (let i = first; i <= last; i++) mono[i - first] += c[i] / channels.length;
  const size = 2048, power = powerSpectrum(mono, size), hz = (k: number) => k * rate / size;
  let total = 0, weighted = 0, high = 0, loudest = 0; const bands: Record<string, number> = {};
  for (const [name] of BANDS) bands[name] = 0;
  for (let k = 1; k < power.length; k++) { const f = hz(k), p = power[k]; total += p; weighted += p * f; if (f > 2000) high += p; if (p > power[loudest]) loudest = k; for (const [name, lo, hi] of BANDS) if (f >= lo && f < hi) bands[name] += p; }
  for (const [name] of BANDS) bands[name] = total ? bands[name] / total : 0;
  const edge = (from: number, to: number) => { let m = 0; for (const c of channels) for (let i = Math.max(0, from); i < Math.min(n, to); i++) m = Math.max(m, Math.abs(c[i])); return gainToDb(m); };
  return {
    seconds: n / rate, peakDb: gainToDb(peak), peakAt: peakAt / rate, rmsDb: gainToDb(Math.sqrt(sum2 / (n * channels.length))),
    activeSeconds: (last - first + 1) / rate, activeRmsDb: gainToDb(Math.sqrt(active2 / ((last - first + 1) * channels.length))), ringSeconds: (ringEnd - peakAt) / rate,
    centroidHz: total ? weighted / total : 0, above2k: total ? high / total : 0, loudestHz: hz(loudest), bands, dc, clipped, startDb: edge(0, 32), endDb: edge(n - 32, n),
  };
}
/** 16-bit PCM WAV, channels interleaved. */
export function encodeWav(channels: Float32Array[], rate: number): Uint8Array {
  const c = channels.length, n = channels[0].length, bytes = new Uint8Array(44 + n * c * 2), view = new DataView(bytes.buffer);
  const text = (at: number, s: string) => { for (let i = 0; i < s.length; i++) bytes[at + i] = s.charCodeAt(i); };
  text(0, 'RIFF'); view.setUint32(4, 36 + n * c * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, c, true); view.setUint32(24, rate, true); view.setUint32(28, rate * c * 2, true); view.setUint16(32, c * 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, n * c * 2, true);
  for (let i = 0, p = 44; i < n; i++) for (let ch = 0; ch < c; ch++, p += 2) view.setInt16(p, Math.round(clamp(channels[ch][i], -1, 1) * 32767), true);
  return bytes;
}

// ── the engine: everything above on a Web Audio graph ───────────────────────
// effects (chips and cards) ─┬──────────────────────────────┐
//                            └─ table reverb (room's share) ┴─ effects gain ─┐
// room A: beds + one-shots + room reverb ─ trim ─ fade ─┐                    ├─ master ─ limiter ─ makeup off ─ speakers
// room B (while crossfading) ─────────────── trim ─ fade ┴─ ambience gain ───┤                              └─ meter
// track A: notes + its reverb (+ echo) ───── trim ─ fade ┬─ music gain ──────┘
// track B (while crossfading) ────────────── trim ─ fade ┘
type Song = {id: MusicTrack; t0: number; fade: GainNode; dry: GainNode; send: GainNode; echo: GainNode | null; nodes: AudioNode[]; sources: Set<AudioScheduledSourceNode>; composer: Composer; until: number; closed: boolean};
type Room ={id: RoomSound; t0: number; fade: GainNode; dry: GainNode; send: GainNode; layers: Map<string, {gain: GainNode; filters: BiquadFilterNode[]}>; sources: Set<AudioScheduledSourceNode>; planner: Planner; until: number; closed: boolean};
/** Moves a parameter from wherever it is now to target over seconds, without a jump. in/out: equal-power curves for a crossfade. */
function glide(param: AudioParam, target: number, seconds: number, now: number, shape: 'in' | 'out' | 'line' = 'line') {
  const p = param as AudioParam & {cancelAndHoldAtTime?: (t: number) => AudioParam}, from = param.value;
  if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(now); else { param.cancelScheduledValues(now); param.setValueAtTime(from, now); }
  const curve = new Float32Array(64);
  for (let i = 0; i < 64; i++) { const x = i / 63, w = shape === 'in' ? Math.sin(x * Math.PI / 2) : shape === 'out' ? 1 - Math.cos(x * Math.PI / 2) : x; curve[i] = from + (target - from) * w; }
  try { param.setValueCurveAtTime(curve, now + 0.005, seconds); } catch { param.linearRampToValueAtTime(target, now + 0.005 + seconds); }
}
function createEngine(ctx: BaseAudioContext, seed: number, live: boolean) {
  const rng = createRng(seed), rate = ctx.sampleRate;
  const master = ctx.createGain(), limiter = ctx.createDynamicsCompressor(), makeup = ctx.createGain(), effects = ctx.createGain(), ambience = ctx.createGain(), tableSend = ctx.createGain(), table = ctx.createConvolver();
  limiter.threshold.value = LEVEL.limiter.thresholdDb; limiter.knee.value = 0; limiter.ratio.value = LEVEL.limiter.ratio; limiter.attack.value = LEVEL.limiter.attack; limiter.release.value = LEVEL.limiter.release;
  makeup.gain.value = 1 / limiterMakeup(LEVEL.limiter.thresholdDb, LEVEL.limiter.ratio);
  const buffer = (channels: Float32Array[], bufferRate: number) => { const b = ctx.createBuffer(channels.length, channels[0].length, bufferRate); channels.forEach((c, i) => b.getChannelData(i).set(c)); return b; };
  table.normalize = false; table.buffer = buffer(reverbImpulse(0.45, rate, seed ^ 0x7ab1e, 0.6, 0.004), rate);
  tableSend.gain.value = dbToGain(LEVEL.quietWetDb); tableSend.connect(table); table.connect(effects);
  const musicBus = ctx.createGain(); musicBus.connect(master);
  effects.connect(master); ambience.connect(master); master.connect(limiter); limiter.connect(makeup); makeup.connect(ctx.destination);
  const split = ctx.createChannelSplitter(2), left = ctx.createAnalyser(), right = ctx.createAnalyser(); left.fftSize = right.fftSize = 2048;
  makeup.connect(split); split.connect(left, 0); split.connect(right, 1);
  // Loops and reverbs are made the first time a room needs them and kept.
  const made = new Map<string, AudioBuffer>();
  const once = (key: string, make: () => AudioBuffer) => { let b = made.get(key); if (!b) { b = make(); made.set(key, b); } return b; };
  const loopOf = (source: Bed['source']) => once(source, () =>
    source === 'babble' ? buffer(babbleLoop(LOOPS.babble, rate / 4, seed + 11, 10), rate / 4) // a far crowd holds nothing above 3 kHz: a quarter of the rate
    : source === 'rustle' ? buffer(rustleLoop(LOOPS.rustle, rate / 2, seed + 12), rate / 2)
    : source === 'brown' ? buffer(noiseLoop('brown', LOOPS.brown, rate / 2, seed + 13), rate / 2)
    : buffer(noiseLoop(source, LOOPS[source], rate, seed + (source === 'pink' ? 14 : 15)), rate));
  /** Plays one sound of samples at when: low-pass (a distance), level, place, and a share to a reverb. Kept in keep until it ends. */
  function play(data: Float32Array, dataRate: number, when: number, o: {pan: number; panTo?: number; seconds?: number; gain?: number; lowpass?: number; wet?: number; echo?: [AudioNode, number]}, dry: AudioNode, send: AudioNode, keep?: Set<AudioScheduledSourceNode>) {
    const src = ctx.createBufferSource(), nodes: AudioNode[] = [src]; src.buffer = buffer([data], dataRate);
    let head: AudioNode = src;
    if (o.lowpass && o.lowpass < dataRate * 0.45) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = o.lowpass; lp.Q.value = -3; head.connect(lp); head = lp; nodes.push(lp); }
    const gain = ctx.createGain(), panner = ctx.createStereoPanner(); gain.gain.value = o.gain ?? 1; panner.pan.value = o.pan; nodes.push(gain, panner);
    if (o.panTo !== undefined && o.panTo !== o.pan && o.seconds) { panner.pan.setValueAtTime(o.pan, Math.max(when, ctx.currentTime)); panner.pan.linearRampToValueAtTime(o.panTo, Math.max(when, ctx.currentTime) + o.seconds); }
    head.connect(gain); gain.connect(panner); panner.connect(dry);
    if (o.wet === undefined || o.wet === 1) panner.connect(send); else if (o.wet > 0) { const w = ctx.createGain(); w.gain.value = o.wet; panner.connect(w); w.connect(send); nodes.push(w); }
    if (o.echo && o.echo[1] > 0) { const e = ctx.createGain(); e.gain.value = o.echo[1]; panner.connect(e); e.connect(o.echo[0]); nodes.push(e); }
    src.start(Math.max(when, ctx.currentTime)); keep?.add(src);
    src.onended = () => { keep?.delete(src); for (const node of nodes) node.disconnect(); };
  }
  // ── rooms ──
  // Making a room's loops takes up to a fifth of a second the first time. Live, that work waits for its own turn after the
  // press that chose the room, so that a chip asked for in the same press is not held up; each bed then comes in softly as
  // its loop is ready, under the room's own fade. Offline it is done at once.
  const later = (fn: () => void) => { if (live) setTimeout(fn, 0); else fn(); };
  let current: Room | null = null; const rooms = new Set<Room>();
  function open(id: RoomSound, now: number): Room {
    const recipe = ROOM_RECIPES[id], fade = ctx.createGain(), dry = ctx.createGain(), send = ctx.createGain(), verb = ctx.createConvolver();
    fade.gain.value = 0; fade.connect(ambience); dry.gain.value = dbToGain(recipe.trimDb); dry.connect(fade);
    verb.normalize = false; send.connect(verb); verb.connect(dry);
    const room: Room = {id, t0: now, fade, dry, send, layers: new Map(), sources: new Set(), planner: createPlanner(id, rng.seed()), until: 0, closed: false};
    later(() => { if (!room.closed) verb.buffer = once(`reverb:${id}`, () => buffer(reverbImpulse(recipe.reverb.seconds, rate, seed + id.length * 31, recipe.reverb.damping, recipe.reverb.predelay), rate)); });
    for (const bed of recipe.beds) later(() => {
      if (room.closed) return;
      // A slightly different speed per bed: two beds made from the same loop then come round at different times.
      const src = ctx.createBufferSource(); src.buffer = loopOf(bed.source); src.loop = true; src.playbackRate.value = rng.range(0.97, 1.03);
      let head: AudioNode = src;
      const filters = bed.filters.map(f => { const node = ctx.createBiquadFilter(); node.type = f.type; node.frequency.value = f.hz; node.Q.value = f.type === 'bandpass' ? f.q ?? 1 : 20 * Math.log10(f.q ?? Math.SQRT1_2); head.connect(node); head = node; return node; }); // Web Audio's low- and high-pass take Q in dB
      const gain = ctx.createGain(), at = ctx.currentTime; head.connect(gain); gain.connect(dry);
      if (at - now < 0.01) gain.gain.value = dbToGain(bed.db); else { gain.gain.value = 0; gain.gain.setTargetAtTime(dbToGain(bed.db), at, 0.12); } // a bed that comes late fades in
      if (bed.wet) { const w = ctx.createGain(); w.gain.value = bed.wet; gain.connect(w); w.connect(send); }
      src.start(at, rng.range(0, src.buffer.duration)); // each layer starts somewhere else in its loop
      room.layers.set(bed.id, {gain, filters}); room.sources.add(src);
    });
    glide(fade.gain, 1, LEVEL.crossfade, now, 'in'); rooms.add(room);
    return room;
  }
  function close(room: Room, now: number) {
    room.closed = true; glide(room.fade.gain, 0, LEVEL.crossfade, now, 'out');
    if (live) setTimeout(() => drop(room), (LEVEL.crossfade + 0.6) * 1000);
  }
  function drop(room: Room) { for (const s of room.sources) { try { s.stop(); } catch { /* already stopped */ } s.disconnect(); } room.sources.clear(); room.fade.disconnect(); rooms.delete(room); }
  /** Plans the current room up to LEVEL.lookahead ahead and puts what comes on the graph. */
  function pump() {
    const room = current; if (!room) return;
    const now = ctx.currentTime, to = now + LEVEL.lookahead - room.t0;
    if (to <= room.until) return;
    const events = room.planner.plan(room.until, to); room.until = to;
    for (const e of events) {
      const when = room.t0 + e.at; if (when < now - 0.05) continue; // fell behind (a sleeping tab): skip rather than pile up
      if (e.kind === 'mod') { const layer = room.layers.get(e.layer); if (!layer) continue; layer.gain.gain.setTargetAtTime(dbToGain(e.db), when, e.glide / 3); if (e.hz !== undefined) layer.filters[0].frequency.setTargetAtTime(e.hz, when, e.glide / 3); continue; }
      const r = shotRate(e.shot, rate);
      play(renderShot(e.shot, r), r, when - LEAD, {pan: e.pan, panTo: e.panTo, seconds: e.seconds, gain: dbToGain(e.db), lowpass: e.lowpass, wet: e.wet}, room.dry, room.send, room.sources);
    }
  }
  // ── music ──
  // A track is its notes into a trim and a fade, with its own reverb (and echo) inside the fade, so that a track fading out
  // takes its tails with it. Its notes are written and rendered LEVEL.lookahead ahead, as the rooms' one-shots are.
  let song: Song | null = null; const songs = new Set<Song>();
  function openSong(id: MusicTrack, now: number, delay: number): Song {
    const recipe = MUSIC_RECIPES[id], fade = ctx.createGain(), dry = ctx.createGain(), send = ctx.createGain(), verb = ctx.createConvolver(), nodes: AudioNode[] = [fade, dry, send, verb];
    fade.gain.value = 0; fade.connect(musicBus); dry.gain.value = dbToGain(recipe.trimDb); dry.connect(fade);
    verb.normalize = false; send.connect(verb); verb.connect(dry);
    later(() => { verb.buffer = once(`music-reverb:${id}`, () => buffer(reverbImpulse(recipe.reverb.seconds, rate, seed + 97 * id.length, recipe.reverb.damping, recipe.reverb.predelay), rate)); });
    let echo: GainNode | null = null;
    if (recipe.echo) { // a delay line feeding itself through a low-pass: each repeat quieter and darker; the repeats reach the reverb too
      echo = ctx.createGain(); const delay = ctx.createDelay(2), back = ctx.createGain(), dark = ctx.createBiquadFilter();
      delay.delayTime.value = recipe.echo.beats * 60 / recipe.tempo; back.gain.value = recipe.echo.feedback; dark.type = 'lowpass'; dark.frequency.value = recipe.echo.lowpass;
      echo.connect(delay); delay.connect(dark); dark.connect(back); back.connect(delay); dark.connect(dry); const w = ctx.createGain(); w.gain.value = 0.4; dark.connect(w); w.connect(send);
      nodes.push(echo, delay, back, dark, w);
    }
    const at = now + delay, s: Song = {id, t0: at, fade, dry, send, echo, nodes, sources: new Set(), composer: createComposer(id, rng.seed()), until: 0, closed: false};
    glide(fade.gain, 1, LEVEL.musicIn, at, 'in'); songs.add(s);
    return s;
  }
  function closeSong(s: Song, now: number) {
    s.closed = true; glide(s.fade.gain, 0, LEVEL.musicOut, now, 'out');
    if (live) setTimeout(() => dropSong(s), (LEVEL.musicOut + 0.6) * 1000);
  }
  function dropSong(s: Song) { for (const src of s.sources) { try { src.stop(); } catch { /* already stopped */ } src.disconnect(); } s.sources.clear(); for (const node of s.nodes) node.disconnect(); songs.delete(s); }
  // Live, each note is rendered in a task of its own, so that a chord of long pads (up to some 40 ms a note) never holds the
  // page for long in one piece: frames and presses get in between. The notes are written 1.5 s ahead, so that is time enough.
  const jobs: (() => void)[] = []; let working = false;
  const work = () => { const job = jobs.shift(); if (!job) { working = false; return; } job(); setTimeout(work, 0); };
  /** Writes the playing track up to LEVEL.lookahead ahead and puts its notes on the graph. */
  function pumpMusic() {
    const s = song; if (!s) return;
    const now = ctx.currentTime, to = now + LEVEL.lookahead - s.t0;
    if (to <= s.until) return;
    const notes = s.composer.plan(s.until, to), mix = MUSIC_RECIPES[s.id].mix; s.until = to;
    for (const n of notes) {
      const part = mix[n.part]; if (!part) continue;
      const r = musicRate(n.part, rate), late = () => !songs.has(s) || s.t0 + n.at < ctx.currentTime - 0.05; // dropped meanwhile, or fell behind (a sleeping tab): skip
      const put = (data: Float32Array) => play(data, r, s.t0 + n.at - LEAD, {pan: n.pan, gain: dbToGain(part.db), wet: part.wet, echo: s.echo && part.echo ? [s.echo, part.echo] : undefined}, s.dry, s.send, s.sources);
      if (!live) { put(renderMusicNote(n, r)); continue; }
      if (n.part === 'pad') { // the costliest note: its in-tune voice in one task, the two beside it in the next
        let first: Float32Array | null = null;
        jobs.push(() => { if (!late()) first = renderPad(n, r, [0]); }, () => { if (!first || late()) return; const rest = renderPad(n, r, [1, 2]); for (let i = 0; i < first.length; i++) first[i] += rest[i]; put(first); });
      } else jobs.push(() => { if (!late()) put(renderMusicNote(n, r)); });
      if (!working) { working = true; setTimeout(work, 0); }
    }
  }
  return {
    taps: {left, right},
    chip(kind: ChipKind, options: ChipOptions) { const now = ctx.currentTime + 0.005; for (const v of chipPlan(kind, options, rng)) play(renderChipVoice(v, rate), rate, now + v.at - LEAD, {pan: v.pan, panTo: v.type === 'friction' ? v.panTo : undefined, seconds: v.type === 'friction' ? v.seconds : undefined}, effects, tableSend); },
    card(kind: CardKind, options: CardOptions) { const v = cardPlan(kind, options, rng); play(renderCard(v, rate), rate, ctx.currentTime + 0.005 - LEAD, {pan: v.pan}, effects, tableSend); },
    ambience(id: RoomSound | null) {
      if ((current?.id ?? null) === id) return;
      const now = ctx.currentTime;
      if (current) close(current, now);
      current = id ? open(id, now) : null; later(pump);
      glide(tableSend.gain, dbToGain(id ? ROOM_RECIPES[id].effectsWetDb : LEVEL.quietWetDb), LEVEL.crossfade, now);
    },
    music(id: MusicTrack | null) {
      if ((song?.id ?? null) === id) return;
      const now = ctx.currentTime, changing = song !== null;
      if (song) closeSong(song, now);
      song = id ? openSong(id, now, changing ? LEVEL.musicGap : 0.02) : null; later(pumpMusic);
    },
    apply(s: SoundSettings, instantly = false) {
      const now = ctx.currentTime, to = (param: AudioParam, v: number) => { if (instantly) param.value = v; else param.setTargetAtTime(v, now, LEVEL.slide); };
      to(master.gain, s.muted ? 0 : sliderGain(s.volume)); to(effects.gain, sliderGain(s.effects)); to(ambience.gain, sliderGain(s.ambience)); to(musicBus.gain, sliderGain(s.music));
    },
    pump() { pump(); pumpMusic(); },
    dispose() { for (const room of [...rooms]) drop(room); current = null; for (const s of [...songs]) dropSong(s); song = null; },
  };
}
type Engine = ReturnType<typeof createEngine>;

/** createSound and, for the offline renderer, its pump (the planner's clock, which the live page drives with a timer). */
function makeSound(options: {seed?: number; context?: BaseAudioContext}) {
  const settings: SoundSettings = {...SOUND_DEFAULTS}, own = !options.context, seed = num(options.seed, (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
  let ctx: BaseAudioContext | null = options.context ?? null, engine: Engine | null = null, room: RoomSound | null = null, track: MusicTrack | null = null, asked = !own, timer: ReturnType<typeof setInterval> | null = null, disposed = false;
  const start = () => { if (!engine && ctx) { engine = createEngine(ctx, seed, own); engine.apply(settings, true); if (room) engine.ambience(room); if (track) engine.music(track); } };
  const running = () => !!ctx && (!own || (ctx as AudioContext).state === 'running');
  if (ctx) start();
  const sound: Sound = {
    unlock() {
      if (disposed) return;
      asked = true;
      if (!ctx) {
        const Context = (globalThis as {AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext}).AudioContext ?? (globalThis as {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
        if (!Context) return;
        try { ctx = new Context({latencyHint: 'interactive'}); } catch { return; }
        start(); timer = setInterval(() => { if (running()) engine?.pump(); }, 250);
      }
      if (own && (ctx as AudioContext).state === 'suspended') void (ctx as AudioContext).resume().catch(() => {});
    },
    // A sound asked for in the same gesture as unlock() is scheduled on the waking context and plays as soon as it runs.
    chip(kind, o) { if (asked && engine && ctx?.state !== 'closed') engine.chip(kind, o ?? {}); },
    card(kind, o) { if (asked && engine && ctx?.state !== 'closed') engine.card(kind, o ?? {}); },
    ambience(next) { room = next && ROOM_IDS.includes(next) ? next : null; engine?.ambience(room); },
    music(next) { track = next && MUSIC_IDS.includes(next) ? next : null; engine?.music(track); },
    set(patch) {
      for (const name of ['volume', 'effects', 'ambience', 'music'] as const) if (typeof patch?.[name] === 'number' && Number.isFinite(patch[name])) settings[name] = clamp01(patch[name]!);
      if (typeof patch?.muted === 'boolean') settings.muted = patch.muted;
      engine?.apply(settings);
    },
    state: () => ({unlocked: running(), ...settings, room, track}),
    dispose() { disposed = true; if (timer) clearInterval(timer); engine?.dispose(); if (own && ctx && ctx.state !== 'closed') void (ctx as AudioContext).close().catch(() => {}); ctx = null; engine = null; },
    taps: () => engine?.taps ?? null,
  };
  return {sound, pump: () => engine?.pump()};
}
/** The sound of the table and the room. seed: the same seed gives the same variations (by default a new one each time). */
export function createSound(options: {seed?: number; context?: BaseAudioContext} = {}): Sound { return makeSound(options).sound; }
/**
 * Renders seconds of sound offline (OfflineAudioContext, faster than real time, the same graph as the live page): each action
 * runs at its time, as a press on the page would. Returns the two channels at the output, after the limiter.
 */
export async function renderOffline(seconds: number, actions: {at: number; run: (sound: Sound) => void}[], options: {seed?: number; sampleRate?: number} = {}): Promise<{channels: Float32Array[]; sampleRate: number}> {
  const rate = options.sampleRate ?? 48000, ctx = new OfflineAudioContext({numberOfChannels: 2, length: Math.ceil(seconds * rate), sampleRate: rate});
  const {sound, pump} = makeSound({seed: options.seed ?? 1, context: ctx}), quantum = 128 / rate, points = new Map<number, (() => void)[]>();
  const add = (t: number, fn: () => void) => { const k = Math.round(t / quantum) * quantum; if (k >= seconds) return; const list = points.get(k) ?? []; list.push(fn); points.set(k, list); };
  for (const a of actions) add(a.at, () => a.run(sound));
  for (let t = 0.5; t < seconds; t += 0.5) add(t, () => {}); // the planner's clock: the live page pumps every quarter second, a half is enough ahead of 1.5 s
  for (const fn of points.get(0) ?? []) fn(); pump(); points.delete(0);
  for (const [t, list] of [...points].sort((a, b) => a[0] - b[0])) void ctx.suspend(t).then(() => { for (const fn of list) fn(); pump(); void ctx.resume(); });
  const rendered = await ctx.startRendering();
  return {channels: [rendered.getChannelData(0), rendered.getChannelData(1)], sampleRate: rate};
}

// ── the page ────────────────────────────────────────────────────────────────
type Button = {label: string; play: (sound: Sound, ui: {strength: number; height: number; pan: number}) => void};
/** The page's buttons, in order; keys 1–9 play them too. */
export const BUTTONS: {chips: Button[]; cards: Button[]} = {
  chips: [
    {label: 'Marker på filt', play: (s, u) => s.chip('felt', {pan: u.pan, strength: u.strength})},
    {label: 'Marker på marker', play: (s, u) => s.chip('stack', {height: Math.max(1, u.height), pan: u.pan, strength: u.strength})},
    {label: 'Fem marker', play: (s, u) => s.chip('stack', {count: 5, height: u.height, pan: u.pan, strength: u.strength})},
    {label: 'Tjugo marker', play: (s, u) => s.chip('stack', {count: 20, height: u.height, pan: u.pan, strength: u.strength})},
    {label: 'Ta tillbaka en marker', play: (s, u) => s.chip('take', {height: Math.max(1, u.height), pan: u.pan, strength: u.strength})},
    {label: 'Dealern drar in en hög', play: (s, u) => s.chip('sweep', {count: 12, pan: u.pan, strength: u.strength})},
  ],
  cards: [
    {label: 'Kort ur skon', play: (s, u) => s.card('draw', {pan: u.pan})},
    {label: 'Kort landar', play: (s, u) => s.card('land', {pan: u.pan})},
    {label: 'Kort vänds', play: (s, u) => s.card('turn', {pan: u.pan})},
  ],
};
export const panText = (v: number) => Math.abs(v) < 0.025 ? 'mitten' : `${v < 0 ? 'vänster' : 'höger'} ${Math.round(Math.abs(v) * 100)} %`;
export const heightText = (h: number) => h === 0 ? 'ingen, filten' : `${h} marker`;
/** A level for the meter, in whole dBFS with a real minus sign (the unit stands by the meter). */
export const dbText = (db: number) => Number.isFinite(db) ? `${db < 0 ? '−' : ''}${Math.abs(db).toFixed(0)}` : '−∞';

function start() {
  const $ = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids); return n; };
  const query = new URLSearchParams(location.search), sound = createSound(), ui = {strength: CHIP.strength, height: 0, pan: 0};
  let last = '', lastAt = 0;
  if (!('AudioContext' in window) && !('webkitAudioContext' in window)) $('fail').textContent = 'Den här webbläsaren kan inte spela upp ljud som görs i sidan (Web Audio saknas).';
  const all = [...BUTTONS.chips, ...BUTTONS.cards];
  const press = (button: Button) => { sound.unlock(); button.play(sound, ui); last = button.label; lastAt = performance.now(); sync(); };
  const fill = (box: HTMLElement, list: Button[]) => box.replaceChildren(...list.map(b => el('button', {type: 'button', onclick: () => press(b)}, el('span', {textContent: b.label}), el('kbd', {textContent: String(all.indexOf(b) + 1)}))));
  fill($('chips'), BUTTONS.chips); fill($('cards'), BUTTONS.cards);
  const rooms = $('rooms');
  rooms.replaceChildren(...ROOMS.map(r => { const b = el('button', {type: 'button', textContent: r.label, onclick: () => { sound.unlock(); sound.ambience(r.id); sync(); }}); b.dataset.value = r.id ?? ''; return b; }));
  const tracks = $('tracks');
  tracks.replaceChildren(...TRACKS.map(t => { const b = el('button', {type: 'button', textContent: t.label, onclick: () => { sound.unlock(); sound.music(t.id); sync(); }}); b.dataset.value = t.id ?? ''; return b; }));
  const sliders: (() => void)[] = [];
  function slider(id: string, value: () => number, set: (v: number) => void, text: (v: number) => string) {
    const input = $<HTMLInputElement>(id), out = $(`${id}-out`);
    const show = () => { input.value = String(Math.round(value() * (id === 'height' ? 1 : 100))); out.textContent = text(value()); };
    input.addEventListener('input', () => { set(Number(input.value) / (id === 'height' ? 1 : 100)); show(); });
    sliders.push(show);
  }
  const percent = (v: number) => `${Math.round(v * 100)} %`;
  slider('strength', () => ui.strength, v => { ui.strength = v; }, percent);
  slider('height', () => ui.height, v => { ui.height = Math.round(v); }, heightText);
  slider('pan', () => ui.pan, v => { ui.pan = v; }, panText);
  for (const name of ['volume', 'effects', 'ambience', 'music'] as const) slider(name, () => sound.state()[name], v => sound.set({[name]: v}), percent);
  $('mute').addEventListener('click', () => { sound.set({muted: !sound.state().muted}); sync(); });
  addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey || (event.target as HTMLElement).closest('input')) return;
    const n = Number(event.key); if (n >= 1 && n <= all.length) { press(all[n - 1]); event.preventDefault(); }
    else if (event.key === 'm' || event.key === 'M') { sound.unlock(); sound.set({muted: !sound.state().muted}); sync(); }
  });
  function sync() {
    const s = sound.state(), room = ROOMS.find(r => r.id === s.room)!, track = TRACKS.find(t => t.id === s.track)!;
    for (const b of rooms.children) b.setAttribute('aria-pressed', String((b as HTMLElement).dataset.value === (s.room ?? '')));
    for (const b of tracks.children) b.setAttribute('aria-pressed', String((b as HTMLElement).dataset.value === (s.track ?? '')));
    for (const show of sliders) show();
    $('room-note').textContent = room.note; $('track-note').textContent = track.note;
    $('mute').textContent = s.muted ? 'Sätt på ljudet' : 'Stäng av ljudet'; $('mute').setAttribute('aria-pressed', String(s.muted));
    $('start-note').classList.toggle('done', s.unlocked);
    const chip = (text: string, tone = '') => el('span', {className: `chip ${tone}`, textContent: text});
    $('hud').replaceChildren(chip('Labb · ändrar inget i spelet', 'lab'), chip(`Bakgrund: ${room.label}`), chip(`Musik: ${track.label}`), ...(s.muted ? [chip('Ljudet är avstängt', 'warn')] : []), ...(!s.unlocked ? [chip('Väntar på första trycket')] : []));
    $('hint').hidden = s.unlocked;
  }
  // ── the picture: what is playing, as a spectrum and a level ──
  const canvas = $<HTMLCanvasElement>('view'), g = canvas.getContext('2d')!, meterFill = $('meter-fill'), hold = $('meter-hold'), meterOut = $('meter-out');
  let wasUnlocked = false, held = -Infinity, heldAt = 0, shown = -Infinity, before = performance.now();
  const freq = new Float32Array(1024), freq2 = new Float32Array(1024), wave = new Float32Array(2048), wave2 = new Float32Array(2048);
  function frame(now: number) {
    requestAnimationFrame(frame);
    const s = sound.state(); if (s.unlocked !== wasUnlocked) { wasUnlocked = s.unlocked; sync(); }
    const box = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio, 2), w = Math.max(1, Math.round(box.width * dpr)), h = Math.max(1, Math.round(box.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    g.fillStyle = '#0b0c0c'; g.fillRect(0, 0, w, h);
    const taps = sound.taps(); let peak = 0;
    if (taps) {
      taps.left.getFloatFrequencyData(freq); taps.right.getFloatFrequencyData(freq2); taps.left.getFloatTimeDomainData(wave); taps.right.getFloatTimeDomainData(wave2);
      for (let i = 0; i < wave.length; i++) peak = Math.max(peak, Math.abs(wave[i]), Math.abs(wave2[i]));
      // The spectrum: 96 bars from 30 Hz to 18 kHz, evenly in pitch, −110 to −20 dB.
      const bars = 96, nyquist = taps.left.context.sampleRate / 2, top = h * 0.08, bottom = h * 0.72, gap = Math.max(1, w / bars * 0.18);
      g.fillStyle = 'rgba(217,185,106,.85)';
      for (let b = 0; b < bars; b++) {
        const f0 = 30 * Math.pow(600, b / bars), f1 = 30 * Math.pow(600, (b + 1) / bars), k0 = Math.floor(f0 / nyquist * freq.length), k1 = Math.max(k0 + 1, Math.ceil(f1 / nyquist * freq.length));
        let p = 0; for (let k = k0; k < k1 && k < freq.length; k++) p += Math.pow(10, freq[k] / 10) + Math.pow(10, freq2[k] / 10);
        const db = 10 * Math.log10(p / (2 * (k1 - k0)) + 1e-14), x = clamp01((db + 110) / 90);
        g.fillRect(b * w / bars + gap / 2, bottom - x * (bottom - top), w / bars - gap, x * (bottom - top));
      }
      g.fillStyle = '#93a098'; g.font = `${11 * dpr}px system-ui, sans-serif`;
      for (const [f, label] of [[100, '100 Hz'], [1000, '1 kHz'], [10000, '10 kHz']] as const) g.fillText(label, Math.log(f / 30) / Math.log(600) * w + 4 * dpr, bottom + 14 * dpr);
      // The waveform of the last 43 ms, under the spectrum.
      const mid = h * 0.86, amp = h * 0.1; g.strokeStyle = 'rgba(232,236,233,.7)'; g.lineWidth = dpr; g.beginPath();
      for (let x = 0; x < w; x++) { const i = Math.floor(x / w * wave.length), v = (wave[i] + wave2[i]) / 2; if (x) g.lineTo(x, mid - v * amp * 2); else g.moveTo(x, mid - v * amp * 2); }
      g.stroke();
    }
    // The level: falls 20 dB a second, the highest of the last 1,5 s held.
    const db = gainToDb(peak), dt = clamp((now - before) / 1000, 0, 0.1); before = now;
    shown = Math.max(db, (Number.isFinite(shown) ? shown : -90) - 20 * dt);
    if (db >= held || now - heldAt > 1500) { held = db; heldAt = now; }
    const place = (v: number) => `${clamp01((v + 60) / 60) * 100}%`;
    meterFill.style.width = place(shown); hold.style.left = place(held);
    meterOut.textContent = taps ? `${dbText(shown < -59 ? -Infinity : Math.round(shown))} · topp ${dbText(held < -59 ? -Infinity : Math.round(held))}` : '–';
    if (last && now - lastAt < 1600) { g.fillStyle = `rgba(232,236,233,${1 - (now - lastAt) / 1600})`; g.font = `600 ${15 * dpr}px system-ui, sans-serif`; g.fillText(last, 14 * dpr, h * 0.2); }
  }
  const asked = query.get('room'); if (asked !== null) sound.ambience(ROOM_IDS.includes(asked as RoomSound) ? asked as RoomSound : null);
  const askedTrack = query.get('music'); if (askedTrack !== null) sound.music(MUSIC_IDS.includes(askedTrack as MusicTrack) ? askedTrack as MusicTrack : null);
  sync(); requestAnimationFrame(frame);
  // For the proof recorder and the console: the sound itself, the offline renderer and the measuring.
  Object.assign(window, {soundLab: Object.assign(sound, {ready: Promise.resolve(true), render: renderOffline, measure, encodeWav, powerSpectrum, fft, chipPlan, cardPlan, createRng, ROOMS, BUTTONS, LEVEL, ROOM_RECIPES, MUSIC, MUSIC_RECIPES, createComposer, renderMusicNote, musicRate})});
}
// Under Node (the tests) only the first half is used. The page half starts only on sound.html itself (its body carries
// data-page="ljud-labb"); the game and any other page that imports the module get its exports and nothing else.
if (typeof document !== 'undefined' && document.body?.dataset.page === 'ljud-labb') try { start(); } catch (error) { const box = document.getElementById('fail'); if (box && !box.textContent) box.textContent = 'Ljud-labbet kunde inte starta. Ladda om sidan; om det inte hjälper, säg till.'; console.error(error); }
