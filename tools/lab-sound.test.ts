import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROOMS, ROOM_IDS, ROOM_RECIPES, SOUND_DEFAULTS, LEVEL, CHIP, CARD, DISTANCE, LOOPS, LOOP_RMS, LEAD, BUTTONS,
  createRng, createSound, sliderGain, dbToGain, gainToDb, limiterMakeup, chipPlan, rippleTimes, renderChipHit, renderChipVoice, cardPlan, renderCard,
  renderShot, shotRate, shotSeconds, phraseScript, createPlanner, noiseLoop, babbleLoop, rustleLoop, reverbImpulse, measure, encodeWav, fft, panText, heightText,
  type ChipHit, type ChipVoice, type OneShot, type AmbienceEvent,
} from '../src/lab-sound.ts';

const RATE = 48000;
const median = (values: number[]) => { const a = [...values].sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
const finite = (x: Float32Array) => x.every(Number.isFinite);
/** The voices of one call summed as one channel, each at full gain: the loudest a hard pan to one side could make them. */
function mixdown(voices: ChipVoice[], rate = RATE): Float32Array {
  const parts = voices.map(v => ({at: Math.round(v.at * rate), data: renderChipVoice(v, rate)}));
  const out = new Float32Array(Math.max(...parts.map(p => p.at + p.data.length)));
  for (const p of parts) for (let i = 0; i < p.data.length; i++) out[p.at + i] += p.data[i];
  return out;
}
const hits = (voices: ChipVoice[]) => voices.filter((v): v is ChipHit => v.type === 'hit');

test('the module is read without a page or an audio context, and offers what the game and the page ask for', () => {
  assert.equal(typeof document, 'undefined');
  assert.equal(typeof (globalThis as {AudioContext?: unknown}).AudioContext, 'undefined', 'Node has no Web Audio: nothing here may need it');
  assert.deepEqual(ROOMS.map(r => r.label), ['Tyst', 'Salong', 'Las Vegas', 'Skyline', 'Skog', 'Spelhall']);
  assert.deepEqual(ROOMS.map(r => r.id), [null, ...ROOM_IDS]);
  assert.deepEqual(ROOM_IDS, ['salong', 'panorama', 'la', 'skog', 'hall']);
  for (const r of ROOMS) assert.ok(r.note.length > 20, `${r.label} says what it is`);
  assert.deepEqual([...BUTTONS.chips, ...BUTTONS.cards].map(b => b.label), ['Marker på filt', 'Marker på marker', 'Fem marker', 'Tjugo marker', 'Ta tillbaka en marker', 'Dealern drar in en hög', 'Kort ur skon', 'Kort landar', 'Kort vänds']);
  assert.equal(panText(0), 'mitten'); assert.equal(panText(-0.4), 'vänster 40 %'); assert.equal(panText(1), 'höger 100 %');
  assert.equal(heightText(0), 'ingen, filten'); assert.equal(heightText(3), '3 marker');
});

test('createSound keeps its settings and room before there is any sound, and does nothing it cannot', () => {
  const sound = createSound({seed: 1});
  for (const name of ['unlock', 'chip', 'card', 'ambience', 'set', 'state', 'dispose', 'taps'] as const) assert.equal(typeof sound[name], 'function');
  assert.deepEqual(sound.state(), {unlocked: false, ...SOUND_DEFAULTS, room: null});
  sound.unlock(); sound.chip('stack', {count: 5}); sound.card('draw'); // no AudioContext here: quietly nothing
  assert.equal(sound.state().unlocked, false); assert.equal(sound.taps(), null);
  sound.ambience('skog'); assert.equal(sound.state().room, 'skog', 'a room chosen early starts with the sound');
  sound.ambience('nowhere' as never); assert.equal(sound.state().room, null);
  sound.set({volume: 2, effects: -1, ambience: 0.3, muted: true}); sound.set({volume: Number.NaN});
  assert.deepEqual(sound.state(), {unlocked: false, volume: 1, effects: 0, ambience: 0.3, muted: true, room: null});
  sound.dispose(); sound.unlock(); assert.equal(sound.state().unlocked, false);
});

test('seeded randomness repeats for a seed and differs between seeds', () => {
  const a = createRng(42), b = createRng(42), c = createRng(43);
  const take = (r: ReturnType<typeof createRng>) => Array.from({length: 50}, () => r.next());
  const fromA = take(a); assert.deepEqual(take(b), fromA); assert.notDeepEqual(take(c), fromA);
  const r = createRng(7);
  for (let i = 0; i < 2000; i++) { const x = r.next(), y = r.range(-2, 3), z = r.int(1, 3); assert.ok(x >= 0 && x < 1 && y >= -2 && y < 3 && z >= 1 && z <= 3 && Number.isInteger(z)); }
  const ints = new Set(Array.from({length: 300}, () => r.int(1, 3))); assert.deepEqual([...ints].sort(), [1, 2, 3], 'both ends of int are reached');
});

test('levels: sliders, decibels and the limiter makeup the engine takes off again', () => {
  assert.equal(sliderGain(0), 0); assert.equal(sliderGain(1), 1); assert.equal(sliderGain(0.5), 0.25); assert.equal(sliderGain(7), 1); assert.equal(sliderGain(Number.NaN), 0);
  assert.ok(Math.abs(gainToDb(dbToGain(-6)) + 6) < 1e-9); assert.equal(gainToDb(0), -Infinity);
  // The specification's makeup for threshold −3 dB and ratio 20: a full-scale signal comes out at −2.85 dB, made up by 0.6 of that.
  assert.ok(Math.abs(gainToDb(limiterMakeup(-3, 20)) - 1.71) < 1e-9);
  assert.ok(LEVEL.ceilingDb < -6, 'single sounds peak below −6 dBFS');
  assert.ok(LEVEL.limiter.thresholdDb > LEVEL.ceilingDb, 'the limiter sits above the sounds, so that it only acts on a pile-up');
  assert.ok(LEVEL.crossfade >= 1 && LEVEL.crossfade <= 2);
  assert.ok(SOUND_DEFAULTS.ambience < SOUND_DEFAULTS.effects);
});

test('a chip plan repeats for a seed, stays in its ranges and never repeats a click', () => {
  for (const kind of ['felt', 'stack', 'take', 'sweep'] as const) assert.deepEqual(chipPlan(kind, {count: 4, height: 2}, createRng(9)), chipPlan(kind, {count: 4, height: 2}, createRng(9)), `${kind} repeats`);
  const rng = createRng(3), seen: ChipHit[] = [];
  for (let i = 0; i < 40; i++) {
    const [hit] = hits(chipPlan('stack', {height: 2}, rng)); seen.push(hit);
    assert.equal(hit.surface, 'chip'); assert.ok(hit.peak <= dbToGain(LEVEL.ceilingDb) + 1e-12);
    const f1 = hit.falling[0].f; assert.ok(f1 > CHIP.base[0] * 0.98 && f1 < CHIP.base[1] * 1.02, `first mode ${f1}`);
    for (let m = 1; m < hit.falling.length; m++) assert.ok(Math.abs(hit.falling[m].f / f1 / CHIP.ratios[m] - 1) < 0.035, 'the disc keeps its mode ratios');
    assert.ok(hit.falling.every(m => m.tau > 0 && m.tau < 0.02), 'clay dies within milliseconds');
    assert.ok(hit.struck.length === CHIP.ratios.length && Math.abs(hit.struck[0].f / f1 - 1) < 0.08, 'the chip below is a slightly different disc');
    const width = hit.contacts[0].width; assert.ok(width >= CHIP.contact[0] * 0.8 && width <= CHIP.contact[1] * 1.2);
    assert.ok(hit.contacts.every((c, j) => j === 0 || c.at > hit.contacts[j - 1].at), 'bounces come after the landing');
  }
  for (let i = 1; i < seen.length; i++) assert.notEqual(seen[i].falling[0].f, seen[i - 1].falling[0].f);
  const pitches = new Set(seen.map(h => Math.round(h.falling[0].f / 20))); assert.ok(pitches.size > 15, 'pitch spreads');
  const peaks = seen.map(h => gainToDb(h.peak)); assert.ok(Math.max(...peaks) - Math.min(...peaks) > 1.2, 'level varies a little');
  assert.ok(seen.filter(h => h.settleAt !== null).length > 20 && seen.some(h => h.settleAt === null), 'most land on an edge and then slap flat; not all');
  // Strength: softer is quieter and duller (a longer contact).
  const soft = hits(chipPlan('stack', {strength: 0.2}, createRng(5)))[0], hard = hits(chipPlan('stack', {strength: 1}, createRng(5)))[0];
  assert.ok(soft.peak < hard.peak && soft.contacts[0].width > hard.contacts[0].width);
  assert.deepEqual(chipPlan('stack', {strength: 0}, createRng(1)), []);
});

test('a ripple of chips: as many as asked, one after another, quickly and unevenly', () => {
  for (const n of [1, 5, 20]) {
    const totals: number[] = [];
    for (let seed = 1; seed <= 30; seed++) {
      const times = rippleTimes(n, createRng(seed));
      assert.equal(times.length, n); assert.equal(times[0], 0);
      for (let i = 1; i < n; i++) { const gap = times[i] - times[i - 1]; assert.ok(gap >= 0.004 && gap <= 0.11, `gap ${gap}`); }
      totals.push(times[n - 1]);
    }
    if (n === 5) assert.ok(median(totals) > 0.1 && median(totals) < 0.3, `five chips take ${median(totals)} s`);
    if (n === 20) assert.ok(median(totals) > 0.3 && median(totals) < 0.8, `twenty chips take ${median(totals)} s`);
  }
  const gaps = rippleTimes(20, createRng(4)).slice(1).map((t, i, a) => t - (i ? a[i - 1] : 0));
  assert.ok(Math.max(...gaps) / Math.min(...gaps) > 2, 'not a metronome');
  // A stack set down where there are none starts on the felt; the rest land on it, the stack growing.
  const five = hits(chipPlan('stack', {count: 5, height: 0}, createRng(2)));
  assert.deepEqual(five.map(h => h.surface), ['felt', 'chip', 'chip', 'chip', 'chip']); assert.deepEqual(five.map(h => h.height), [0, 1, 2, 3, 4]);
  assert.deepEqual(hits(chipPlan('stack', {count: 3, height: 6}, createRng(2))).map(h => h.height), [6, 7, 8]);
  assert.deepEqual(hits(chipPlan('felt', {count: 2}, createRng(2))).map(h => h.surface), ['felt', 'chip']);
});

test('a taller stack sounds a little different: a lower, heavier knock and more rattle', () => {
  const low = Array.from({length: 40}, (_, i) => hits(chipPlan('stack', {height: 1}, createRng(100 + i)))[0]);
  const tall = Array.from({length: 40}, (_, i) => hits(chipPlan('stack', {height: 18}, createRng(100 + i)))[0]);
  assert.ok(median(tall.map(h => h.body[0].f)) < median(low.map(h => h.body[0].f)) * 0.9);
  assert.ok(median(tall.map(h => h.mix.body)) > median(low.map(h => h.mix.body)) + 3);
  assert.ok(tall.filter(h => h.rattle.length).length > low.filter(h => h.rattle.length).length + 10);
});

test('a chip click: silent at both ends, at its planned peak, short, and bright like clay; on felt dull with a faint click', () => {
  const stats = (kind: 'felt' | 'stack') => Array.from({length: 24}, (_, i) => {
    const [hit] = hits(chipPlan(kind, {height: 2}, createRng(200 + i))), x = renderChipHit(hit, RATE);
    assert.ok(finite(x)); assert.equal(x[0], 0, 'starts in silence'); assert.ok(Math.round(LEAD * RATE) > 10 && x.slice(0, Math.round(LEAD * RATE) - 2).every(v => v === 0));
    const m = measure([x], RATE);
    assert.ok(Math.abs(m.peakDb - gainToDb(hit.peak)) < 0.01 && m.peakDb <= LEVEL.ceilingDb + 1e-9, `peak ${m.peakDb}`);
    assert.ok(m.endDb < -70, `ends in silence (${m.endDb} dB)`); assert.equal(m.clipped, 0); assert.ok(m.dc < 1e-3);
    return m;
  });
  const stack = stats('stack'), felt = stats('felt');
  const c = median(stack.map(m => m.centroidHz)), h = median(stack.map(m => m.above2k)), ring = median(stack.map(m => m.ringSeconds));
  assert.ok(c > 2000 && c < 4000, `clink centroid ${c} Hz`); assert.ok(h > 0.7, `clink above 2 kHz ${h}`); assert.ok(ring > 0.01 && ring < 0.08, `clink rings ${ring} s`);
  const fc = median(felt.map(m => m.centroidHz)), fh = median(felt.map(m => m.above2k));
  assert.ok(fc < 1200, `felt centroid ${fc} Hz`); assert.ok(fh > 0.01 && fh < 0.3, `felt has a faint click above 2 kHz (${fh})`);
  assert.ok(median(felt.map(m => m.peakDb)) < median(stack.map(m => m.peakDb)) - 2, 'felt is quieter than a chip on chips');
  // No two clicks are the same: different samples and different loudest frequency.
  const loudest = new Set(stack.map(m => Math.round(m.loudestHz))); assert.ok(loudest.size > 8);
});

test('many chips at once stay under −6 dBFS even summed at full gain', () => {
  for (let seed = 1; seed <= 8; seed++) {
    for (const [kind, o] of [['stack', {count: 5, height: 0, strength: 1}], ['stack', {count: 20, height: 3, strength: 1}], ['sweep', {count: 10, strength: 1}], ['sweep', {count: 20, strength: 1}], ['sweep', {count: 40, strength: 1}], ['take', {strength: 1}]] as const) {
      const m = measure([mixdown(chipPlan(kind, o, createRng(seed)))], RATE);
      assert.ok(m.peakDb < -6, `${kind} ${JSON.stringify(o)} seed ${seed}: ${m.peakDb.toFixed(2)} dBFS`);
    }
  }
});

test('taking a chip back scrapes first and clicks lightly; the rake slides, knocks, and gathers toward the dealer', () => {
  const [take] = hits(chipPlan('take', {height: 4}, createRng(11)));
  assert.ok(take.scrape && take.scrape.at === 0 && take.contacts[0].at >= take.scrape.seconds, 'the click comes as the chip clears the edge');
  assert.ok(gainToDb(take.peak) < CHIP.peakDb.stack, 'lighter than a chip put down');
  const sweep = chipPlan('sweep', {count: 12, pan: 0.6}, createRng(12)), friction = sweep.find(v => v.type === 'friction')!;
  assert.ok(friction && friction.type === 'friction' && friction.panTo === 0.3 && friction.seconds > 0.6 && friction.seconds < 1.2);
  const knocks = hits(sweep); assert.ok(knocks.length >= 12 * 1.8 + 3);
  const late = knocks.filter(k => k.at > friction.seconds / 2).length; assert.ok(late > knocks.length / 2, 'the pile clatters most as it comes together');
  assert.ok(sweep.every((v, i) => i === 0 || v.at >= sweep[i - 1].at));
});

test('cards: out of the shoe a rising slide and a snap, landing a soft flap and tap, turning a snap and then a landing', () => {
  for (const kind of ['draw', 'land', 'turn'] as const) {
    assert.deepEqual(cardPlan(kind, {pan: 0.2}, createRng(1)), cardPlan(kind, {pan: 0.2}, createRng(1)));
    const rng = createRng(30), ms: ReturnType<typeof measure>[] = [];
    for (let i = 0; i < 12; i++) {
      const v = cardPlan(kind, {}, rng), x = renderCard(v, RATE), m = measure([x], RATE); ms.push(m);
      assert.ok(finite(x) && x[0] === 0 && m.endDb < -60 && m.peakDb <= LEVEL.ceilingDb + 1e-9 && Math.abs(m.peakDb - gainToDb(v.peak)) < 0.01);
      assert.ok(Math.abs(m.peakDb - CARD.peakDb[kind]) < 1.3);
    }
    if (kind === 'draw') { const slide = cardPlan('draw', {}, createRng(2)).parts.find(p => p.type === 'slide')!; assert.ok(slide.type === 'slide' && slide.to > slide.from, 'the band rises as the card speeds out'); assert.ok(median(ms.map(m => m.centroidHz)) > 3000); assert.ok(median(ms.map(m => m.activeSeconds)) > 0.12); }
    if (kind === 'land') { assert.ok(median(ms.map(m => m.centroidHz)) < 2500); assert.ok(median(ms.map(m => m.activeSeconds)) < 0.12); }
    if (kind === 'turn') { const parts = cardPlan('turn', {}, createRng(3)).parts, snap = parts.find(p => p.type === 'snap')!, land = parts.filter(p => p.type === 'flap').pop()!; assert.ok(land.at - snap.at > 0.1, 'it lands a moment after the flick'); }
  }
});

test('every one-shot of the rooms renders clean, at a peak of 1, as long as planned', () => {
  const shots: OneShot[] = [
    {type: 'phrase', voice: {f0: 200, formant: 1.17, breath: 0.04, rate: 4.6}, seed: 1},
    {type: 'glass', style: 'toast', f0: 800, seed: 2}, {type: 'glass', style: 'set', f0: 900, seed: 3}, {type: 'glass', style: 'ice', f0: 1000, seed: 4},
    {type: 'coins', count: 12, f0: 4000, seed: 5},
    ...(['blip', 'jingle', 'reel', 'win'] as const).map((style, i) => ({type: 'slot' as const, style, root: 70, wave: 'square' as const, seed: 6 + i})),
    ...(['tweet', 'trill', 'warble', 'whistle', 'coo', 'chip'] as const).map((species, i) => ({type: 'bird' as const, species, pitch: 1, song: 20 + i, seed: 30 + i})),
    {type: 'car', seconds: 6, hz: 700, heavy: true, seed: 9}, {type: 'horn', hz: 410, seed: 10},
  ];
  for (const shot of shots) {
    const rate = shotRate(shot, RATE), x = renderShot(shot, rate), m = measure([x], rate), name = `${shot.type} ${JSON.stringify(shot).slice(0, 60)}`;
    assert.ok(finite(x), name); assert.ok(Math.abs(m.peakDb) < 1e-6, name); assert.ok(m.startDb < -60, `${name} starts in silence`); assert.ok(m.endDb < -50, `${name} ends in silence (${m.endDb})`);
    if (shot.type === 'phrase' || shot.type === 'bird' || shot.type === 'car') assert.ok(Math.abs(x.length / rate - LEAD - shotSeconds(shot)) < 0.01, `${name} lasts as planned`);
    assert.deepEqual(renderShot(shot, rate), x, `${name} repeats`);
  }
  assert.equal(shotRate({type: 'phrase', voice: {f0: 1, formant: 1, breath: 0, rate: 4}, seed: 1}, 48000), 24000);
  const a = phraseScript({f0: 120, formant: 1, breath: 0, rate: 4.5}, 1), b = phraseScript({f0: 120, formant: 1, breath: 0, rate: 4.5}, 2);
  assert.notDeepEqual(a, b); assert.ok(a.syllables.length >= 3 && a.syllables.every((s, i) => i === 0 || s.at > a.syllables[i - 1].at));
  // A birdsong is high, a dove low; a far voice is all below 2 kHz.
  const centroid = (shot: OneShot) => measure([renderShot(shot, shotRate(shot, RATE))], shotRate(shot, RATE)).centroidHz;
  assert.ok(centroid(shots.find(s => s.type === 'bird' && s.species === 'trill')!) > 3500);
  assert.ok(centroid(shots.find(s => s.type === 'bird' && s.species === 'coo')!) < 1000);
  assert.ok(centroid(shots[0]) < 2000);
});

test('the rooms plan the same for a seed, window by window as in one go, and keep making new things', () => {
  const kinds: Record<string, string[]> = {salong: ['phrase', 'glass'], panorama: ['phrase', 'slot', 'coins'], la: ['car', 'horn'], skog: ['bird'], hall: ['phrase', 'slot']};
  for (const room of ROOM_IDS) {
    const whole = createPlanner(room, 17).plan(0, 120), windows = createPlanner(room, 17), pieces: AmbienceEvent[] = [];
    for (let t = 0; t < 120; t += 0.25) pieces.push(...windows.plan(t, t + 0.25));
    assert.deepEqual(pieces, whole, `${room}: a quarter second at a time is the same as two minutes at once`);
    assert.notDeepEqual(createPlanner(room, 18).plan(0, 60), createPlanner(room, 17).plan(0, 60));
    assert.ok(whole.every((e, i) => i === 0 || e.at >= whole[i - 1].at) && whole.every(e => e.at >= 0 && e.at < 120));
    const shots = whole.filter((e): e is Extract<AmbienceEvent, {kind: 'shot'}> => e.kind === 'shot');
    for (const kind of kinds[room]) assert.ok(shots.some(e => e.shot.type === kind), `${room} has ${kind}`);
    assert.equal(new Set(shots.map(e => e.shot.seed)).size, shots.length, `${room}: no one-shot is played twice`);
    assert.ok(shots.every(e => e.pan >= -1 && e.pan <= 1 && e.panTo >= -1 && e.panTo <= 1 && e.db < 6 && e.lowpass > 1000 && e.wet >= 0 && e.wet <= 1));
    // Something happens all through, not in bursts with long silences: no minute-long gap of one-shots, and the beds keep moving.
    const times = shots.map(e => e.at); let gap = times[0]; for (let i = 1; i < times.length; i++) gap = Math.max(gap, times[i] - times[i - 1]);
    assert.ok(gap < 30, `${room}: longest pause ${gap.toFixed(1)} s`);
    const moved = new Set(whole.filter(e => e.kind === 'mod').map(e => e.kind === 'mod' ? e.layer : '')), recipe = ROOM_RECIPES[room];
    for (const bed of recipe.beds) if (bed.drift || bed.gust) assert.ok(moved.has(bed.id), `${room}: ${bed.id} moves`);
    for (const bed of recipe.beds) for (const f of bed.filters) assert.ok(f.hz > 20 && f.hz < 20000);
  }
  // Talkers come and go and each voice says something new; birds repeat their own song with small differences.
  const vegas = createPlanner('panorama', 3).plan(0, 60).filter(e => e.kind === 'shot' && e.shot.type === 'phrase');
  assert.ok(vegas.length > 60, `a crowd: ${vegas.length} phrases a minute`);
  const birds = createPlanner('skog', 3).plan(0, 120).flatMap(e => e.kind === 'shot' && e.shot.type === 'bird' ? [e.shot] : []);
  const songs = new Map<number, number>(); for (const b of birds) songs.set(b.song, (songs.get(b.song) ?? 0) + 1);
  assert.ok([...songs.values()].some(n => n >= 2), 'a bird sings its song again'); assert.ok(songs.size >= 4, 'several birds');
});

test('distances: farther is quieter, darker and more reverb', () => {
  const order = (['near', 'mid', 'far', 'distant'] as const).map(d => DISTANCE[d]);
  for (let i = 1; i < order.length; i++) assert.ok(order[i].db < order[i - 1].db && order[i].lowpass < order[i - 1].lowpass && order[i].wet > order[i - 1].wet);
});

test('loops run into themselves without a seam, at their level, left and right apart', () => {
  const rate = 8000, check = (name: string, channels: Float32Array[]) => {
    assert.equal(channels.length, 2);
    for (const x of channels) {
      const steps = Array.from({length: x.length - 1}, (_, i) => Math.abs(x[i + 1] - x[i])).sort((a, b) => a - b), p999 = steps[Math.floor(steps.length * 0.999)];
      assert.ok(Math.abs(x[0] - x[x.length - 1]) <= p999, `${name}: the step from end to start is an ordinary step`);
      const rms = (a: number, b: number) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };
      const edge = Math.round(rate * 0.6), whole = rms(0, x.length);
      assert.ok(Math.abs(whole - LOOP_RMS) < 1e-3, `${name} at its level`);
      if (name !== 'babble') assert.ok(Math.abs(gainToDb(rms(0, edge) / rms(edge, x.length - edge))) < 1.5, `${name}: no dip or swell where the loop joins`);
    }
    let lr = 0, ll = 0, rr = 0; for (let i = 0; i < channels[0].length; i++) { lr += channels[0][i] * channels[1][i]; ll += channels[0][i] ** 2; rr += channels[1][i] ** 2; }
    // A crowd panned across the field shares some of each voice between the sides; noise is fully apart.
    const corr = Math.abs(lr / Math.sqrt(ll * rr)); assert.ok(corr < (name === 'babble' ? 0.6 : 0.1), `${name}: left and right are not the same (${corr.toFixed(2)})`);
  };
  for (const color of ['white', 'pink', 'brown'] as const) check(color, noiseLoop(color, 10, rate, 1));
  check('rustle', rustleLoop(10, 16000, 2));
  check('babble', babbleLoop(12, rate, 3, 6));
  const lengths = Object.values(LOOPS); assert.ok(lengths.every(s => s >= 10)); assert.equal(new Set(lengths).size, lengths.length);
  // Two loops come back into step where whole turns of each meet: none within a quarter second of each other inside a minute.
  for (const a of lengths) for (const b of lengths) if (a < b) for (let m = 1; m * a < 60; m++) for (let n = 1; n * b < 60; n++) assert.ok(Math.abs(m * a - n * b) > 0.25, `${m} × ${a} s and ${n} × ${b} s line up`);
});

test('a reverb dies away, its highs first, with an energy of 1 per channel', () => {
  const rate = 16000, [l, r] = reverbImpulse(1.2, rate, 4, 0.6, 0.02), start = Math.round(0.02 * rate);
  assert.ok(l.slice(0, start).every(v => v === 0), 'a gap before the first reflection');
  const energy = (x: Float32Array, a: number, b: number) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return s; };
  assert.ok(Math.abs(energy(l, 0, l.length) - 1) < 1e-4 && Math.abs(energy(r, 0, r.length) - 1) < 1e-4);
  const tenth = Math.round(l.length / 10); assert.ok(energy(l, l.length - tenth, l.length) < 1e-4 * energy(l, start, start + tenth));
  const early = measure([l.slice(start, start + 2048)], rate), late = measure([l.slice(l.length / 2, l.length / 2 + 2048)], rate);
  assert.ok(late.centroidHz < early.centroidHz * 0.8, 'darker as it dies');
});

test('measuring: a sine is where it should be, and silence, offset and clipping are seen', () => {
  const rate = 48000, x = new Float32Array(rate).map((_, i) => 0.5 * Math.sin(2 * Math.PI * 1000 * i / rate)), m = measure([x], rate);
  assert.ok(Math.abs(m.peakDb + 6.02) < 0.01 && Math.abs(m.rmsDb + 9.03) < 0.01);
  assert.ok(Math.abs(m.centroidHz - 1000) < 40 && Math.abs(m.loudestHz - 1000) < 25 && m.above2k < 0.01 && m.bands['250-1k'] + m.bands['1-2k'] > 0.99);
  const y = new Float32Array(1000).fill(0.1); y[500] = 1; const n = measure([y], rate);
  assert.ok(Math.abs(n.dc - 0.1009) < 1e-3); assert.equal(n.clipped, 1);
  const z = new Float32Array(4800); z[2400] = 0.5; const k = measure([z, new Float32Array(4800)], rate); assert.equal(k.startDb, -Infinity); assert.ok(Math.abs(k.peakAt - 0.05) < 1e-9);
});

test('the FFT is a DFT, and a WAV file has its header and samples where players look for them', () => {
  const re = new Float64Array([1, 2, 0, -1, 0.5, 0, 0, 3]), im = new Float64Array(8), naive = Array.from({length: 8}, (_, k) => { let a = 0, b = 0; re.forEach((v, n) => { a += v * Math.cos(-2 * Math.PI * k * n / 8); b += v * Math.sin(-2 * Math.PI * k * n / 8); }); return [a, b]; });
  fft(re, im); naive.forEach(([a, b], k) => { assert.ok(Math.abs(re[k] - a) < 1e-9 && Math.abs(im[k] - b) < 1e-9); });
  const wav = encodeWav([new Float32Array([0, 0.5, -1, 1]), new Float32Array([0.25, 0, 0, -0.5])], 44100), view = new DataView(wav.buffer);
  assert.equal(String.fromCharCode(...wav.slice(0, 4)), 'RIFF'); assert.equal(String.fromCharCode(...wav.slice(8, 16)), 'WAVEfmt ');
  assert.equal(view.getUint32(4, true), wav.length - 8); assert.equal(view.getUint16(22, true), 2); assert.equal(view.getUint32(24, true), 44100); assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getUint32(40, true), 16); assert.equal(wav.length, 44 + 16);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(i => view.getInt16(44 + 2 * i, true)), [0, 8192, 16384, 0, -32767, 0, 32767, -16383]);
});
