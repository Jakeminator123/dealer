// Offline tests for the automatic check of a delivered deal (src/deal-check.ts): the sixteen takes of the reference-film
// trials of 2026-11-17 and 18 as numbers (tools/fixtures/deal-check-takes.json: per frame the largest yellow and blue blob, reduced
// from the trials' measures, no media), each against what the independent reviewer and Jakob said; and made-up frames for
// every fail and remark the takes did not show.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { THRESHOLDS, checkDeal, checkReference, realFacingLong, type Blob, type FrameCard } from '../src/deal-check.ts';
import { TABLE_LENS } from '../src/table-lens.ts';

type Fixture = { take: string; fps: number; lastCard: { bbox: [number, number, number, number]; centre: [number, number] }; frames: [number, number[] | null, number[] | null][] };
const blob = (b: number[] | null): Blob | null => (b ? { n: b[0], centre: [b[1], b[2]], bbox: [b[3], b[4], b[5], b[6]], long: b[7], short: b[8], paleRingPct: b[9], ...(b.length >= 13 ? { rgb: [b[10], b[11], b[12]] as [number, number, number] } : {}) } : null);
const framesOf = (t: Fixture): FrameCard[] => t.frames.map(([f, y, b]) => ({ f, dealtYellow: blob(y), blue: blob(b) }));

test('the sixteen takes of the trials: the check fails what Jakob rejects on sight, and lets the rest go to the reviewer', async () => {
  const takes: Fixture[] = JSON.parse(await readFile('tools/fixtures/deal-check-takes.json', 'utf8'));
  assert.equal(takes.length, 16);
  const result = Object.fromEntries(takes.map((t) => [t.take, checkDeal(framesOf(t), { fps: t.fps, lastCard: t.lastCard })]));
  // The reviewer (and Jakob where he judged): what each take was, and what the check says.
  const expected: Record<string, { pass: boolean; fails?: string[]; why: string }> = {
    'giv1 A Kling 4 t1': { pass: true, why: 'reviewer 4/5' },
    'giv1 A Kling 4 t2': { pass: true, why: 'reviewer 4/5' },
    'giv1 C Kling 4 t1': { pass: true, why: 'reviewer 4/5' },
    'giv1 C Kling 4 t2': { pass: true, why: 'reviewer 3/5: the card twists on the felt with no finger, which needs the hand mask (a remark)' },
    'giv1 A WAN 3 t1': { pass: true, why: 'reviewer: 40 % long against the plan; against a real card seen straight on 17 % (a remark)' },
    'giv1 A WAN 3 t2': { pass: true, why: 'reviewer: colour change on a broad face, which needs the blend pixels of the pixel pass' },
    'giv1 A WAN 3 t3': { pass: false, fails: ['lagt-gult-forst'], why: 'reviewer: laid yellow short of the place, lifted and turned after' },
    'giv1 B WAN 3 t1': { pass: true, why: 'reviewer: a blended frame and the hand leaving, which need the pixel pass and the hand mask' },
    'giv1 C WAN 3 t1': { pass: true, why: 'reviewer: 33 % long against the plan; a real card seen straight on' },
    'giv1 D WAN 3 t1': { pass: true, why: 'reviewer: 35 % long against the plan; a real card seen straight on' },
    'giv2 A t1': { pass: true, why: 'reviewer 4/5; Jakob: "Alla A-filmer ser bra ut"' },
    'giv2 A t2': { pass: true, why: 'reviewer 3/5; Jakob: "Alla A-filmer ser bra ut"' },
    'giv2 B t1': { pass: false, fails: ['andra-kanten'], why: 'reviewer 1/5; Jakob: "färgerna växlar en gång för mycket"' },
    'giv2 B t2': { pass: false, fails: ['andra-kanten'], why: 'reviewer 1/5; Jakob: the same' },
    'giv2 C t1': { pass: true, why: 'reviewer 2/5 for the card gliding with no finger; Jakob: "C nyp ser bra ut!"' },
    // Trial 2C2: the dummy's film read off a real hand. Its two remarks (the fingers lifted for five frames at the end, the
    // held card about 20 % longer than the dummy's at the same moment) need the hand mask and the reference's card.
    'giv2 C2 t1': { pass: true, why: 'reviewer 4/5, usable with remarks' },
  };
  for (const [take, want] of Object.entries(expected)) {
    const c = result[take];
    assert.equal(c.pass, want.pass, `${take}: ${want.why} (${c.fails.map((f) => f.code).join(', ')})`);
    if (want.fails) assert.deepEqual(c.fails.map((f) => f.code), want.fails, take);
  }
  // The turn: every take turns through at least one edge frame, in the frames the trials' sheets showed.
  assert.deepEqual(result['giv2 A t1'].measures.edgeFrames, [58, 59, 60, 61, 62, 63, 64]);
  assert.deepEqual(result['giv2 C t1'].measures.edgeFrames, [45, 46]);
  assert.deepEqual(result['giv2 B t1'].measures.edgeFrames, [27]);
  // Size against a real card seen straight on: the held card of every Kling take with a reference is within it; trial
  // 2B's card, which the reviewer called 15–30 % over a real card by its long side, is a real card by area (the long side
  // is stretched by motion blur in the swing).
  for (const take of ['giv1 A Kling 4 t1', 'giv2 A t2', 'giv2 C t1']) assert.ok((result[take].measures.sizeMedian as number) < THRESHOLDS.sizeRemark, take);
  for (const take of ['giv2 B t1', 'giv2 B t2']) assert.ok(Math.abs((result[take].measures.sizeMedian as number) - 1) < 0.05, take);
  assert.deepEqual(result['giv1 A WAN 3 t1'].remarks.map((r) => r.code), ['stort']);
  // The check spares the reviewer three of the fifteen; none that Jakob or the reviewer passed is failed.
  assert.equal(Object.values(result).filter((c) => !c.pass).length, 3);
});

// A made-up deal: yellow carried, on edge, blue laid at (850, 1100), 24 frames a second.
const card = (n: number, x: number, y: number, extra: Partial<Blob> = {}): Blob => ({ n, centre: [x, y], bbox: [x - 40, y - 35, x + 40, y + 35], long: 110, short: 70, paleRingPct: 0, ...extra });
function deal(story: ('Y' | 'E' | 'B' | 'L' | 'y')[]): FrameCard[] {
  return story.map((s, f) => {
    const x = 1200 - f * 10, y = 900 + f * 5;
    if (s === 'Y') return { f, dealtYellow: card(6000, x, y), blue: null };
    if (s === 'y') return { f, dealtYellow: card(6000, 850, 1100), blue: null }; // yellow lying at the place
    if (s === 'E') return { f, dealtYellow: null, blue: null };
    if (s === 'B') return { f, dealtYellow: null, blue: card(6000, x, y) };
    return { f, dealtYellow: null, blue: card(5000, 850, 1100) };
  });
}
const ctx = { fps: 24, lastCard: { bbox: [810, 1065, 890, 1135] as [number, number, number, number], centre: [850, 1100] as [number, number], n: 5000 } };
const seq = (...parts: [string, number][]) => parts.flatMap(([s, k]) => Array(k).fill(s)) as ('Y' | 'E' | 'B' | 'L' | 'y')[];

test('made-up deals: every fail Jakob sees and every remark the reviewer measures', () => {
  const codes = (frames: FrameCard[], extra = {}) => { const c = checkDeal(frames, { ...ctx, ...extra }); return [c.pass, c.fails.map((f) => f.code), c.remarks.map((r) => r.code)]; };
  // A clean deal: yellow, two frames on edge, blue, laid.
  assert.deepEqual(codes(deal(seq(['Y', 20], ['E', 2], ['B', 10], ['L', 20]))), [true, [], []]);
  // A colour change without a turn: yellow straight to blue.
  assert.deepEqual(codes(deal(seq(['Y', 20], ['B', 10], ['L', 20])))[1], ['fargbyte-utan-kant']);
  // Turned back: broad yellow again after the blue.
  assert.deepEqual(codes(deal(seq(['Y', 20], ['E', 2], ['B', 6], ['Y', 4], ['E', 1], ['B', 6], ['L', 20])))[1], ['vant-tillbaka']);
  // On edge a second time before it lies: the colour changes once too often.
  assert.deepEqual(codes(deal(seq(['Y', 20], ['E', 2], ['B', 8], ['E', 3], ['L', 20])))[1], ['andra-kanten']);
  // With the colour known: the same blue before and after that edge is the card laid down through it (a remark, as in
  // Paow's Primär paow-giv-2-1-p1-06-01); another blue after it is a second turn (trial 2B: 76 before, 111 after).
  const withBlue = (frames: FrameCard[], before: [number, number, number], after: [number, number, number]) => frames.map((x) => (x.blue ? { ...x, blue: { ...x.blue, rgb: x.f < 33 ? before : after } } : x));
  const twice = deal(seq(['Y', 20], ['E', 2], ['B', 8], ['E', 3], ['L', 20]));
  assert.deepEqual(codes(withBlue(twice, [2, 123, 220], [12, 136, 237])).slice(1), [[], ['lagt-genom-kant']]);
  assert.deepEqual(codes(withBlue(twice, [9, 76, 143], [11, 131, 190]))[1], ['andra-kanten']);
  // The wrong side up at the end.
  assert.ok((codes(deal(seq(['Y', 20], ['E', 2], ['B', 10], ['L', 12], ['y', 8])))[1] as string[]).includes('fel-sida-sist'));
  // Laid yellow at the place and turned there after.
  assert.ok((codes(deal(seq(['Y', 10], ['y', 8], ['E', 2], ['B', 6], ['L', 20])))[1] as string[]).includes('lagt-gult-forst'));
  // A blend of yellow and blue on a broad face between them (from the pixel pass).
  const blended = deal(seq(['Y', 20], ['E', 2], ['B', 10], ['L', 20])).map((x) => (x.f === 20 || x.f === 21 ? { ...x, mixed: 4000 } : x));
  assert.deepEqual(codes(blended)[1], ['fargbyte-pa-bred-yta']);
  // Laid off the last picture: 20 px is a fail (the return would jump), 8 px a remark.
  const off = (dx: number) => deal(seq(['Y', 20], ['E', 2], ['B', 10], ['L', 20])).map((x) => (x.blue && x.f >= 32 ? { ...x, blue: card(5000, 850 + dx, 1100 + dx) } : x));
  assert.deepEqual(codes(off(20))[1], ['fel-plats']);
  assert.deepEqual(codes(off(8))[2], ['plats']);
  // Too large in the hand against a real card seen straight on, a printed card, a second card: fails.
  const big = deal(seq(['Y', 20], ['E', 2], ['B', 10], ['L', 20])).map((x) => (x.dealtYellow ? { ...x, dealtYellow: { ...x.dealtYellow, n: 30000 } } : x));
  assert.ok((codes(big)[1] as string[]).includes('for-stort'));
  assert.deepEqual(codes(deal(seq(['Y', 20], ['E', 2], ['B', 10], ['L', 20])), { printedFrames: [30], secondCardFrames: [12] })[1], ['tryck', 'andra-kortet']);
  // Remarks only: a light rim round the laid card, the card moving with no finger on it, a hop in the last frames, a still start.
  const rim = deal(seq(['Y', 20], ['E', 2], ['B', 10], ['L', 20])).map((x) => (x.f >= 32 ? { ...x, blue: card(5000, 850, 1100, { paleRingPct: 12 }) } : x));
  assert.deepEqual(codes(rim), [true, [], ['ljus-kant']]);
  const change = [0, ...Array(14).fill(0.2), ...Array(34).fill(2), 1, 4, 5];
  assert.deepEqual(codes(deal(seq(['Y', 20], ['E', 2], ['B', 10], ['L', 20])), { unheldMoveFrames: [40, 41], changePerFrame: change }), [true, [], ['kortet-glider', 'hopp-sist', 'stilla-start']]);
});

test('a real card seen straight on through the table\'s lens: larger near the camera, about 100 px at the hand\'s depth', () => {
  const near = realFacingLong({ x: 856, y: 1130 }), far = realFacingLong({ x: 856, y: 900 });
  assert.ok(near! > far!, 'nearer is larger');
  assert.ok(near! > 100 && near! < 130, String(near));
  assert.ok(far! > 80 && far! < 105, String(far));
  assert.equal(realFacingLong({ x: 856, y: -600 }, TABLE_LENS), null, 'above the horizon (row -507 under this lens)');
});

test('a reference film is checked before it is offered: on edge only in the turn, plain, a real card\'s size', () => {
  const clean = checkReference(deal(seq(['Y', 20], ['E', 2], ['B', 10], ['L', 20])));
  assert.deepEqual([clean.pass, clean.clean], [true, true]);
  // On edge to the camera while it swings out of the window, before the turn (Pamela's film to seat 1, frames 29–33).
  const swing = deal(seq(['Y', 6], ['Y', 0], ['E', 0], ['Y', 6], ['E', 2], ['B', 10], ['L', 20])).map((x) => (x.f === 3 || x.f === 4 ? { ...x, dealtYellow: card(400, 1170, 915) } : x));
  assert.deepEqual(checkReference(swing).fails.map((f) => f.code), ['kant-fore-vandningen']);
  const rim = deal(seq(['Y', 20], ['E', 2], ['B', 10], ['L', 20])).map((x) => (x.f >= 32 ? { ...x, blue: card(5000, 850, 1100, { paleRingPct: 15 }) } : x));
  assert.deepEqual([checkReference(rim).pass, checkReference(rim).clean, checkReference(rim).remarks.map((r) => r.code)], [true, false, ['ljus-kant']]);
});
