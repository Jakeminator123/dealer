// The automatic check of a delivered deal, before any reviewer sees it (the plan of the reference-film trials,
// D:/dealer-scratch/tmp/giv-experiment-2/STANDARD.md point 4; the main agent's decision 2026-11-17). It reads the card's
// measures per frame (the largest yellow and the largest blue blob outside the shoe, by the colour rules of
// src/card-track.ts; tools/film-after.ts measures them and writes this check into after.json) and answers with fails and
// remarks. Jakob's rule: he judges the card on sight and the reviewer the measures. So what he rejects on sight is a FAIL,
// and a take that fails is not given to a reviewer: the colour changing without a turn, the card turning back or going on
// edge a second time (the colour changing once too often), the wrong side up at the end, a card far from a real card's
// size, a card laid off the last picture (the return that follows would jump), a printed card, a second card. What the
// reviewer catches and he does not mind on sight is a REMARK, written and shown, never a stop: where the turn happens, a
// card somewhat larger than a real one, a light rim, the card moving a little after the fingers left it (trial 2C: the
// reviewer 2/5, Jakob "C nyp ser bra ut!"), the hand laid again or hopping in the last frames, a still start.
//
// Size is measured against a REAL card through the table's lens (src/table-lens.ts), never against the plan's old drawing:
// a real card is longer on screen held up in the hand (seen almost straight on, 88 mm about 100 px) than lying
// (foreshortened, about 72 px deep), so the card in the hand is compared with a real card seen straight on at the depth
// where its lowest edge meets the felt, by area (the square root of the blob's pixels over the straight-on card's): a long
// side alone is stretched by motion blur in a fast swing (trial 2B's blob 2.0-2.6 : 1 where a card is 1.4 : 1). The laid
// card is compared with the last picture's card, which the plan's rule draws as a real card at its place
// (src/card-plan.ts planCardQuad).
// Thresholds come from the fifteen takes of the trials of 2026-11-17 (tools/deal-check.test.ts holds them as numbers):
// see THRESHOLDS. Pure: no files, no frames. The same measures run on a reference film (checkReference) say whether it
// is a clean deal to copy: one turn through the edge, on edge only in the turn, a card of a real size, plain colours.
import { CARD, TABLE_LENS, filmEye, length, onPlane, sub, type Lens } from './table-lens.ts';

/** One colour blob of the card in a frame: its pixel count, centre, box, extents along its main axes and the share of light pixels in a 6 px ring round it. */
export type Blob = { n: number; centre: [number, number]; bbox: [number, number, number, number]; long: number; short: number; paleRingPct: number; /** Its mean colour, red, green, blue. */ rgb?: [number, number, number] };
/** One frame's card measures: the largest yellow blob outside the shoe's window, the largest blue one, the yellow inside the window. */
export type FrameCard = {
  f: number; dealtYellow: Blob | null; blue: Blob | null; windowYellow?: number; windowBlue?: number;
  /** Optional, from the pixel pass: card pixels that are neither yellow nor blue (a green or turquoise blend of the two). */
  mixed?: number;
};
/** What the check is given besides the frames: the rate, where the card should lie (the last picture's card), and optional pixel measures of tools/film-after.ts. */
export type DealContext = {
  fps: number;
  /** The last picture's card: its box and centre in film pixels (measured on last.png with the same colour rule). */
  lastCard: { bbox: [number, number, number, number]; centre: [number, number]; n?: number };
  /** The card lands open (blue up) or closed (yellow up). */
  side?: 'FRONT' | 'BACK';
  lens?: Lens;
  /** Optional, from the after-work's pixel pass: change per frame on the subject (mean), for the still start and the last frames. */
  changePerFrame?: number[];
  /** Optional: frames where a second card blob over 400 px stands outside the shoe; frames where the card's inside is printed. */
  secondCardFrames?: number[];
  printedFrames?: number[];
  /** Optional, from the pixel pass with the hand's mask: frames where the lying card moves with no skin within 6 px of it. */
  unheldMoveFrames?: number[];
};
export type Finding = { code: string; text: string; frames?: number[] };
export type DealCheck = { pass: boolean; fails: Finding[]; remarks: Finding[]; measures: Record<string, number | number[] | null> };

/**
 * The thresholds and the takes they come from (V: measured on the takes; S: set between what held and what fell).
 * edge: a frame where the card shows less than this share of its laid area counts as on edge (trial 1's edge frames 2–5 %
 * of the laid card; the narrowest held broad face 35 %). broad: a frame showing at least this share is a broad face.
 * sizeFail/sizeRemark: the card in the hand against a real card turned to the camera, median over the frames it is
 * held (S: Jakob passed C1 at +25–35 % by the reviewer's eye and rejected B on its turn, not its size; the WAN takes of
 * trial 1 that were 33–40 % long in the hand against the plan were never shown to him). land: the laid card's box edges
 * against the last picture's (held: 0–2 px in every Kling take with a reference; B 0–6 px where fingertips cover).
 */
export const THRESHOLDS = {
  edge: 0.2, broad: 0.5, sustain: 5, secondEdgeRun: 2, blueDiffers: 0.25,
  sizeFail: 1.25, sizeRemark: 1.1, laidSize: 0.2,
  landFail: 15, landRemark: 5,
  paleRemark: 6,
  lastStepRemark: 3,
  stillStartFrames: 12, stillStartChange: 1,
} as const;

/** A reference film's edge: a frame showing less than this share of the laid card (see checkReference). */
export const REFERENCE_EDGE = 0.3;
const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const runs = (frames: number[]) => { const out: number[][] = []; for (const f of frames) { const r = out.at(-1); if (r && f === r.at(-1)! + 1) r.push(f); else out.push([f]); } return out; };

/** The length on screen of a real card turned to the camera with its lowest edge where the pixel's ray meets the felt; null above the horizon. */
export function realFacingLong(px: { x: number; y: number }, lens: Lens = TABLE_LENS): number | null {
  const eye = filmEye(lens), at = onPlane(eye, px.x, px.y);
  return at ? (lens.focalPx * CARD.height) / length(sub(at, eye.position)) : null;
}

/** The turn and the card's colours, frame by frame: what both a delivered take and a reference film are judged on. */
export function cardStory(frames: readonly FrameCard[], options: { side?: 'FRONT' | 'BACK'; lens?: Lens; settle?: [number, number] | null; edge?: number } = {}) {
  const T = THRESHOLDS, lens = options.lens ?? TABLE_LENS;
  // The next card in the shoe is no dealt card: a yellow blob on the shoe's side (x over 1050) that stands still through the
  // last frames is the shoe's card, wherever another dealer's shoe stands (Pamela's window lies outside the bank's window
  // box), and every yellow blob within 30 px of it is left out.
  const byFrame = [...frames].sort((a, b) => a.f - b.f), tail = byFrame.slice(-8).map((x) => x.dealtYellow).filter((b): b is Blob => !!b && b.centre[0] > 1050);
  const shoe = tail.length >= 6 && tail.every((b) => Math.hypot(b.centre[0] - tail[0].centre[0], b.centre[1] - tail[0].centre[1]) < 4) ? tail[0].centre : null;
  const sorted = shoe ? byFrame.map((x) => (x.dealtYellow && Math.hypot(x.dealtYellow.centre[0] - shoe[0], x.dealtYellow.centre[1] - shoe[1]) < 30 ? { ...x, dealtYellow: null } : x)) : byFrame;
  const last = sorted.slice(-8);
  const laidArea = median(last.map((x) => (options.side === 'BACK' ? x.dealtYellow?.n : x.blue?.n) ?? 0).filter((n) => n > 0)) ?? 0;
  const yellow = (x: FrameCard) => x.dealtYellow?.n ?? 0, blue = (x: FrameCard) => x.blue?.n ?? 0;
  const broad = laidArea * T.broad, edge = laidArea * (options.edge ?? T.edge);
  const isBroadBlue = (i: number) => sorted.slice(i, i + T.sustain).length === T.sustain && sorted.slice(i, i + T.sustain).every((x) => blue(x) >= broad);
  const firstBlueIdx = sorted.findIndex((_, i) => isBroadBlue(i));
  const firstBlue = firstBlueIdx >= 0 ? sorted[firstBlueIdx].f : null;
  const yellowBefore = sorted.filter((x) => (firstBlue === null || x.f < firstBlue) && yellow(x) >= broad);
  const lastYellow = yellowBefore.length ? yellowBefore.at(-1)!.f : null;
  const between = sorted.filter((x) => lastYellow !== null && firstBlue !== null && x.f > lastYellow && x.f < firstBlue);
  const edgeFrames = between.filter((x) => yellow(x) < edge && blue(x) < edge).map((x) => x.f);
  const yellowAfterBlue = firstBlue === null ? [] : sorted.filter((x) => x.f > firstBlue && yellow(x) >= broad).map((x) => x.f);
  // Where the card comes to lie: from the first frame whose blue centre is within 25 px of the last frames' and stays there.
  const end = options.settle ?? (last.length && last.at(-1)!.blue ? last.at(-1)!.blue!.centre : null);
  const near = (x: FrameCard) => !!(end && x.blue && Math.hypot(x.blue.centre[0] - end[0], x.blue.centre[1] - end[1]) <= 25 && blue(x) >= broad);
  let laidIdx = sorted.length - 1;
  while (laidIdx > 0 && near(sorted[laidIdx - 1])) laidIdx--;
  const laid = near(sorted[laidIdx]) ? sorted[laidIdx].f : null;
  // A second edge: after the first broad blue and before the card lies, the blue vanishes to an edge for a run of frames.
  const vanished = firstBlue === null ? [] : sorted.filter((x) => x.f > firstBlue && (laid === null || x.f < laid) && blue(x) < edge && yellow(x) < broad).map((x) => x.f);
  // A card carried with its face to the camera and laid down passes edge-on once with the same face (Paow's Primär to seat 1,
  // paow-giv-2-1-p1-06-01 frames 75–80: blue 115 before, 128 after in mean brightness); a card that turns a second time shows
  // another blue after the edge (trial 2B: 76 before, 111 after, the reviewer's "blue on both sides", Jakob's "färgerna
  // växlar en gång för mycket"). So an edge after the turn is a second turn where the blue before and after differ in mean
  // brightness by more than BLUE_DIFFERS, a lay-down where they do not, and a second turn where the colour is not known.
  const brightness = (b: Blob | null | undefined) => (b?.rgb ? (b.rgb[0] + b.rgb[1] + b.rgb[2]) / 3 : null);
  const edgeRuns = runs(vanished).filter((r) => r.length >= T.secondEdgeRun).map((r) => {
    const before = [...sorted].reverse().find((x) => x.f < r[0] && blue(x) >= broad)?.blue, after = sorted.find((x) => x.f > r.at(-1)! && blue(x) >= edge)?.blue;
    const a = brightness(before), b = brightness(after);
    return { frames: r, laidThrough: a !== null && b !== null && Math.abs(b / a - 1) <= T.blueDiffers, before: a, after: b };
  });
  const secondEdge = edgeRuns.filter((e) => !e.laidThrough).flatMap((e) => e.frames);
  const layEdge = edgeRuns.filter((e) => e.laidThrough).flatMap((e) => e.frames);
  // The card in the hand: every frame before it lies where a broad face shows, by area against a real card seen straight on.
  const held = sorted.filter((x) => laid === null || x.f < laid).map((x) => (yellow(x) >= broad ? x.dealtYellow : blue(x) >= broad ? x.blue : null)).filter((b): b is Blob => !!b);
  const ratios = held.map((b) => { const real = realFacingLong({ x: b.centre[0], y: b.bbox[3] }, lens); return real ? Math.sqrt(b.n / (real * real * (CARD.width / CARD.height))) : null; }).filter((r): r is number => r !== null);
  const pale = median(last.map((x) => x.blue?.paleRingPct ?? 0));
  // Laid yellow at its place and turned there afterwards (film-review: never laid yellow at the place and turned after).
  const lastYellowAt = lastYellow === null ? null : sorted.find((x) => x.f === lastYellow)?.dealtYellow?.centre ?? null;
  // Lying still (under 2 px a frame) within 60 px of the place before the turn: trial 1's WAN take A t3 lay yellow 44 px
  // short of the place in frames 64–76 and was lifted and turned after; a dragged card moves, a carried one is not there.
  const yellowLaid = !end || lastYellow === null ? [] : sorted.filter((x, i) => {
    const prev = sorted[i - 1]?.dealtYellow;
    return x.f <= lastYellow && yellow(x) >= broad && !!prev && Math.hypot(x.dealtYellow!.centre[0] - end[0], x.dealtYellow!.centre[1] - end[1]) <= 60 && Math.hypot(x.dealtYellow!.centre[0] - prev.centre[0], x.dealtYellow!.centre[1] - prev.centre[1]) < 2;
  }).map((x) => x.f);
  // A colour change on a broad face (green or turquoise between yellow and blue), where the pixel pass gives the blend.
  const mixedBroad = between.filter((x) => (x.mixed ?? 0) >= broad).map((x) => x.f);
  return { laidArea, lastYellow, firstBlue, edgeFrames, yellowAfterBlue, laid, secondEdge, layEdge, sizeMedian: median(ratios), sizeMax: ratios.length ? Math.max(...ratios) : null, pale, sorted, lastYellowAt, yellowLaid, mixedBroad };
}

/** The check of a delivered deal: fails stop it before a reviewer, remarks go with it. */
export function checkDeal(frames: readonly FrameCard[], ctx: DealContext): DealCheck {
  const T = THRESHOLDS, open = (ctx.side ?? 'FRONT') === 'FRONT';
  const s = cardStory(frames, { side: ctx.side, lens: ctx.lens, settle: ctx.lastCard.centre });
  const fails: Finding[] = [], remarks: Finding[] = [];
  const lastFrames = s.sorted.slice(-8);
  if (!s.laidArea) {
    // No blue at the end of an open deal: a yellow card lying there is the wrong side up.
    const yellowAtEnd = open ? lastFrames.filter((x) => (x.dealtYellow?.n ?? 0) >= 1000).map((x) => x.f) : [];
    if (yellowAtEnd.length >= 4) fails.push({ code: 'fel-sida-sist', text: 'Kortet ligger gult i de sista rutorna: fel sida upp.', frames: yellowAtEnd });
    else fails.push({ code: 'inget-kort-sist', text: `Inget ${open ? 'blått' : 'gult'} kort ligger i de sista rutorna.` });
  }
  if (open && s.laidArea) {
    // The right side up at the end: blue lies, no broad yellow in the last frames.
    const yellowAtEnd = lastFrames.filter((x) => (x.dealtYellow?.n ?? 0) >= s.laidArea * T.broad).map((x) => x.f);
    if (yellowAtEnd.length) fails.push({ code: 'fel-sida-sist', text: 'Gult syns brett i de sista rutorna: fel sida upp.', frames: yellowAtEnd });
    if (s.firstBlue === null) fails.push({ code: 'aldrig-blatt', text: 'Kortet blir aldrig brett blått i fem rutor i följd.' });
    else if (s.lastYellow === null) fails.push({ code: 'aldrig-gult', text: 'Kortet syns aldrig brett gult före det blå: ingen vändning att se.' });
    else if (!s.edgeFrames.length) fails.push({ code: 'fargbyte-utan-kant', text: `Gult blir blått utan en ruta på kant (ruta ${s.lastYellow}–${s.firstBlue}).`, frames: [s.lastYellow, s.firstBlue] });
    else if (s.mixedBroad.length) fails.push({ code: 'fargbyte-pa-bred-yta', text: 'Kortet byter färg på bred yta (grönt eller turkos) i stället för att gå på kant.', frames: s.mixedBroad });
    if (runs(s.yellowLaid).some((r) => r.length >= T.sustain)) fails.push({ code: 'lagt-gult-forst', text: 'Kortet ligger gult på platsen innan det vänds.', frames: s.yellowLaid });
    if (s.yellowAfterBlue.length) fails.push({ code: 'vant-tillbaka', text: 'Brett gult igen efter det blå: kortet vänds tillbaka.', frames: s.yellowAfterBlue });
    if (s.secondEdge.length) fails.push({ code: 'andra-kanten', text: 'Kortet går på kant en gång till efter vändningen, innan det ligger: färgen växlar en gång för mycket.', frames: s.secondEdge });
  }
  if (s.sizeMedian !== null && s.sizeMedian > T.sizeFail) fails.push({ code: 'for-stort', text: `Kortet i handen är ${Math.round((s.sizeMedian - 1) * 100)} % större än ett verkligt kort sett rakt framifrån där (median).` });
  else if (s.sizeMedian !== null && s.sizeMedian > T.sizeRemark) remarks.push({ code: 'stort', text: `Kortet i handen är ${Math.round((s.sizeMedian - 1) * 100)} % större än ett verkligt kort sett rakt framifrån där (median; största ${Math.round(((s.sizeMax ?? 1) - 1) * 100)} %).` });
  const laidN = median(lastFrames.map((x) => x.blue?.n ?? 0).filter((n) => n > 0));
  if (open && laidN && ctx.lastCard.n && Math.abs(laidN / ctx.lastCard.n - 1) > T.laidSize) remarks.push({ code: 'lagt-storlek', text: `Det lagda kortet syns med ${Math.round((laidN / ctx.lastCard.n) * 100)} % av sista bildens kortyta (fingrarna kan täcka).` });
  // The laid card against the last picture's: its box edges (the fingertips may cover one edge, so the third worst counts).
  const final = lastFrames.at(-1)?.blue ?? null;
  if (final && open) {
    const d = final.bbox.map((v, i) => Math.abs(v - ctx.lastCard.bbox[i])).sort((a, b) => a - b), off = d[2];
    if (off > T.landFail) fails.push({ code: 'fel-plats', text: `Kortet ligger ${off} px från sista bildens kort: returen hoppar.` });
    else if (off > T.landRemark) remarks.push({ code: 'plats', text: `Kortet ligger ${off} px från sista bildens kort.` });
  }
  if (ctx.printedFrames?.length) fails.push({ code: 'tryck', text: 'Kortet har tryck.', frames: ctx.printedFrames });
  if (ctx.secondCardFrames?.length) fails.push({ code: 'andra-kortet', text: 'Ett andra kort syns utanför skon.', frames: ctx.secondCardFrames });
  // Remarks.
  if (s.pale !== null && s.pale > T.paleRemark) remarks.push({ code: 'ljus-kant', text: `Ljus kant runt det lagda kortet (${s.pale} % av ringen).` });
  if (s.layEdge.length) remarks.push({ code: 'lagt-genom-kant', text: 'Kortet passerar kantläget när det läggs ned, med samma blå före och efter.', frames: s.layEdge });
  // A card that moves with no finger on it (trial 2C) needs the hand's mask; the card's centre alone moves 8–24 px after it
  // lies in every one of the fifteen takes, as fingers cover and uncover it. Given by the pixel pass: a remark, never a stop.
  if (ctx.unheldMoveFrames?.length) remarks.push({ code: 'kortet-glider', text: 'Kortet flyttar sig utan att ett finger håller det.', frames: ctx.unheldMoveFrames });
  const change = ctx.changePerFrame;
  if (change?.length) {
    const tail = change.slice(-3);
    if (tail.some((c) => c > T.lastStepRemark)) remarks.push({ code: 'hopp-sist', text: `Ett steg över ${T.lastStepRemark} i de sista rutorna: handen hoppar till sista bilden.` });
    let still = 0; while (still + 1 < change.length && change[still + 1] < T.stillStartChange) still++;
    if (still >= T.stillStartFrames) remarks.push({ code: 'stilla-start', text: `Nästan stilla i början (${still} rutor).` });
  }
  return {
    pass: fails.length === 0, fails, remarks,
    measures: {
      laidArea: s.laidArea, lastBroadYellow: s.lastYellow, firstBroadBlue: s.firstBlue, edgeFrames: s.edgeFrames, laidFrom: s.laid, secondEdge: s.secondEdge, sizeMedian: s.sizeMedian, sizeMax: s.sizeMax, paleRingPct: s.pale,
      turnFromPlace: s.lastYellowAt ? Math.round(Math.hypot(s.lastYellowAt[0] - ctx.lastCard.centre[0], s.lastYellowAt[1] - ctx.lastCard.centre[1])) : null,
    },
  };
}

/** A reference film checked before it is offered: one turn through the edge, on edge only in the turn, a real card's size, plain colours. */
export function checkReference(frames: readonly FrameCard[], options: { lens?: Lens } = {}): DealCheck & { clean: boolean } {
  // A rendered film is sharp: its frames sample the turn without motion blur, and the narrowest of them shows 16–29 % of the
  // laid card (the dummy's films to seats 1–6 of 2026-11-18), where a filmed edge frame shows under 20 %. A reference's edge
  // is therefore any frame under REFERENCE_EDGE of the laid card; Pamela's film to seat 1 narrows only to 65 %.
  const s = cardStory(frames, { lens: options.lens, edge: REFERENCE_EDGE });
  const fails: Finding[] = [], remarks: Finding[] = [];
  if (!s.laidArea) fails.push({ code: 'inget-kort-sist', text: 'Inget blått kort ligger i de sista rutorna.' });
  else if (s.firstBlue === null || s.lastYellow === null) fails.push({ code: 'ingen-vandning', text: 'Ingen vändning från brett gult till brett blått.' });
  else if (!s.edgeFrames.length) fails.push({ code: 'fargbyte-utan-kant', text: 'Gult blir blått utan en ruta på kant.' });
  if (s.yellowAfterBlue.length) fails.push({ code: 'vant-tillbaka', text: 'Brett gult igen efter det blå.', frames: s.yellowAfterBlue });
  if (s.secondEdge.length) fails.push({ code: 'andra-kanten', text: 'På kant en gång till efter vändningen.', frames: s.secondEdge });
  if (s.layEdge.length) remarks.push({ code: 'lagt-genom-kant', text: 'Kortet passerar kantläget när det läggs ned (samma blå).', frames: s.layEdge });
  // On edge before the turn (a card swung edge-on out of the window, as Pamela's film to seat 1, frames 29–33): the model
  // turns the card where the reference shows it on edge.
  const edgeEarly = s.lastYellow === null ? [] : s.sorted.filter((x) => x.f < s.lastYellow! && (x.dealtYellow?.n ?? 0) > 0 && (x.dealtYellow!.n < s.laidArea * THRESHOLDS.edge) && s.sorted.some((y) => y.f < x.f && (y.dealtYellow?.n ?? 0) >= s.laidArea * THRESHOLDS.broad)).map((x) => x.f);
  const early = runs(edgeEarly).filter((r) => r.length >= 2).flat();
  if (early.length) fails.push({ code: 'kant-fore-vandningen', text: 'Kortet står på kant mot kameran före vändningen: modellen vänder det där.', frames: early });
  if (s.sizeMedian !== null && s.sizeMedian > THRESHOLDS.sizeRemark) (s.sizeMedian > THRESHOLDS.sizeFail ? fails : remarks).push({ code: 'storlek', text: `Kortet i handen är ${Math.round((s.sizeMedian - 1) * 100)} % längre än ett verkligt kort där.` });
  // On a light grey table (a rendered film) the ring round the card is light everywhere: no rim can be read there.
  if (s.pale !== null && s.pale > THRESHOLDS.paleRemark && s.pale < 80) remarks.push({ code: 'ljus-kant', text: `Ljus kant runt det lagda kortet (${s.pale} %).` });
  return { pass: fails.length === 0, clean: fails.length === 0 && remarks.length === 0, fails, remarks, measures: { laidArea: s.laidArea, lastBroadYellow: s.lastYellow, firstBroadBlue: s.firstBlue, edgeFrames: s.edgeFrames, edgeBeforeTurn: early, sizeMedian: s.sizeMedian, sizeMax: s.sizeMax, paleRingPct: s.pale } };
}
