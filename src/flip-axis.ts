// Which edge the dealt card turns about, read from its card track (src/card-track.ts; assets/tracking/<clip>/card-track.json).
// Pure: no DOM, no files, no media. Numbers are pixels of the film; text for people is Swedish.
//
// What the measure rests on. A card that turns about an axis keeps its extent along that axis: in the picture its length
// along the axis and the direction of that length stay (up to the slow change of perspective and the hand's own turning in
// the picture plane). Its extent across the axis swings out of the picture plane and shrinks toward the moment the card is
// edge-on to the camera; at that moment the whole card projects onto one line that runs along the axis.
//   LÅNGSIDAN: the card rolls about its long edge or its length (a key turned in the fingers); the width shrinks, the length
//              stays, and the edge-on line runs along the card's length.
//   KORTSIDAN: the card folds over (or stands on) a short edge; the length shrinks, the width stays, and the edge-on line runs
//              along the card's width, across its former length.
// The line's direction is the reliable part, not its length: seen edge-on, a card of sides A (along the axis) and W shows a
// line of A·sin φ + W·cos φ, where φ is the angle between the axis and the line of sight. An axis across the view gives a
// line of the axis side's length; an axis pointing into the table, as when a card dealt to the side folds end over end,
// gives a line longer than either side. Length is reported, never decisive.
// The card's length and width are read from the principal axes of the track's quad, not from its four fitted sides: near the
// turn the fingers lie over a corner and the fitted sides go lopsided or swap names (the corner order slips a quarter turn),
// while the outline's main direction and extents stay sound. The length is the long axis where the card is seen most openly
// before the turn (largest area, out of the shoe window), followed frame by frame through the hand's own turning; a card is
// 88 × 63 mm (1.4 : 1), so an open view shows its long axis as the longer one.
//
// Where it can be fooled:
//   - A card seen open but strongly foreshortened (lying in depth, pointing at the camera) can show its width as the longer
//     axis; below FLIP.oblong the reading says so. Only the eye settles such a film.
//   - A card tilted nearly edge-on to the camera in the carry narrows without turning; the tracker drops edge-on frames far
//     from the one turn (settleRaws), but a tilt just before the turn still reads as narrowing.
//   - The edge-on line is "anything thin that is not table" near where the card was expected: a finger, its shadow or a
//     blur streak can stand in for it, and it is often only part of the card. Lines longer than FLIP.maxLine card lengths
//     are not used.
//   - A track that loses the card in the turn (NONE frames) or bridges it (interpolated lines) has no observed line.
//   - A swap between two frames (back in one, face in the next, nothing thin between) shows no axis at all.
//   - A finding the tracker kept, bridged, smeared or moved is not an observation and is skipped; so are fits of low confidence.
//   - Perspective: a card near the camera is larger and a card lying in depth looks short along the depth. Extents are only
//     compared with the same card a few frames earlier, never across the table.
//   - Height above the felt cannot be read from one camera: a point higher in the picture is higher or further away.
export type XY = [number, number];
export type FlipFrame = {frame: number; side: 'BACK' | 'EDGE' | 'FRONT' | 'NONE'; quad: XY[] | null; edge: [XY, XY] | null; area?: number; confidence?: number; shoeShare?: number; note?: string};
export type FlipTrack = {frames: FlipFrame[]; restQuad?: XY[] | null};
export type Axis = 'KORTSIDAN' | 'LÅNGSIDAN' | 'OKLART';
/** The outline's principal axes: extent along the main direction, extent across it, and the main direction (0–180°). */
export type Shape = {major: number; minor: number; angle: number};
export type Extent = {before: number; atTurn: number; ratio: number};
export type FlipReading = {
  answer: Axis; leaning: Exclude<Axis, 'OKLART'> | null; reason: string; text: string[]; checks: string[];
  turn: {lastBack: number; firstFront: number; edgeFrames: number[]; seenEdgeFrames: number[]; lostFrames: number[]; start: number; end: number; frames: number} | null;
  reference: {frames: number[]; length: number; width: number; oblong: number; angle: number; widthAngle: number} | null;
  near: {frames: number[]; handTurned: number; jumps: number[]} | null;
  length: Extent | null; width: Extent | null;
  shape: 'KORTSIDAN' | 'LÅNGSIDAN' | 'BÅDA' | 'INGET' | 'SVAGT' | null;
  line: {frames: number[]; length: number; perLength: number; perWidth: number; angle: number; toLength: number; toWidth: number; toTravel: number | null; says: Exclude<Axis, 'OKLART'> | null} | null;
  open: {side: 'BACK' | 'FRONT'; frame: number; oblong: number; off: number; says: Exclude<Axis, 'OKLART'> | null}[];
  votes: {by: string; says: Exclude<Axis, 'OKLART'>}[];
  after: {frames: number[]; along: Extent; across: Extent} | null;
  travel: {angle: number; px: number} | null;
  height: {dx: number; dy: number; cardLengths: number; note: string} | null;
};
// changed/kept: an extent counts as shrunk below `changed` of its reference and as kept from `kept`; `margin` separates a lean.
// along/apart: the line runs along a direction within `along` degrees, and at least `apart` degrees closer to it than to the other.
// back/gap: the reference lies `gap` to `back` frames before the last back; near: frames averaged at each side of the turn.
// sure: the lowest confidence of a fit that counts near the turn. follow: the main direction is followed from frame to frame
// while the outline is this oblong and turns less than `step` degrees a frame. started/open: the turn begins where the width
// (or length) falls under `started` of its reference and ends where the opening face reaches `open` of its own.
// oblong: below this ratio the long axis is not told from the short one. Set on the bank 2026-11-12 against frames read by eye.
// hole: this many frames in a row without a sure view of the back end the reference window. side/across: an open view next to
// the turn (within `side` frames) says the line runs along its length within `along` degrees, across it from `across` degrees.
export const FLIP = {changed: 0.6, kept: 0.7, margin: 0.2, along: 25, apart: 20, across: 60, maxLine: 1.6, back: 20, gap: 3, near: 2, sure: 0.4, follow: 1.25, step: 30, started: 0.85, open: 0.85, oblong: 1.2, narrow: 2.4, hole: 3, side: 10};

const NOT_SEEN = /kept|bridged|interpolated|moved onto|smeared|covered|shortened/;
const round = (v: number, d = 0) => { const k = 10 ** d; return Math.round(v * k) / k; };
const dist = (a: XY, b: XY) => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** Direction of a segment as an undirected angle, 0 ≤ angle < 180, against the horizontal of the picture. */
export const axial = (a: XY, b: XY) => ((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI) % 180 + 180) % 180;
/** Smallest angle between two undirected directions, 0–90. */
export const axialDiff = (x: number, y: number) => { const d = Math.abs(x - y) % 180; return Math.min(d, 180 - d); };
/** Signed turn from one undirected direction to another, −90 to 90. */
const axialTurn = (from: number, to: number) => { let d = ((to - from) % 180 + 180) % 180; if (d > 90) d -= 180; return d; };
/** Mean of undirected directions (doubled angles), weighted. */
export const axialMean = (angles: number[], weights: number[] = angles.map(() => 1)) => {
  let c = 0, s = 0; angles.forEach((a, i) => { c += weights[i] * Math.cos(a * Math.PI / 90); s += weights[i] * Math.sin(a * Math.PI / 90); });
  return ((Math.atan2(s, c) * 90 / Math.PI) % 180 + 180) % 180;
};
/** Extent of a set of points along a direction (degrees). */
export const extentAlong = (pts: XY[], angle: number) => { const c = Math.cos(angle * Math.PI / 180), s = Math.sin(angle * Math.PI / 180), t = pts.map(p => p[0] * c + p[1] * s); return Math.max(...t) - Math.min(...t); };
/** Principal axes of a quad from its corners (for a parallelogram the corners' spread is proportional to the area's). */
export function shapeOf(q: XY[]): Shape {
  const cx = q.reduce((s, p) => s + p[0], 0) / q.length, cy = q.reduce((s, p) => s + p[1], 0) / q.length; let xx = 0, xy = 0, yy = 0;
  for (const p of q) { xx += (p[0] - cx) ** 2; xy += (p[0] - cx) * (p[1] - cy); yy += (p[1] - cy) ** 2; }
  const angle = ((Math.atan2(2 * xy, xx - yy) * 90 / Math.PI) % 180 + 180) % 180;
  return {major: extentAlong(q, angle), minor: extentAlong(q, angle + 90), angle};
}
/** Direction of the quad's sides that run most across a given direction: the card's width as drawn, not merely the perpendicular. */
const acrossSides = (q: XY[], angle: number) => { const a = axialMean([axial(q[0], q[1]), axial(q[3], q[2])]), b = axialMean([axial(q[1], q[2]), axial(q[0], q[3])]); return axialDiff(a, angle) >= axialDiff(b, angle) ? a : b; };
const centre = (f: FlipFrame): XY | null => f.quad ? [f.quad.reduce((s, p) => s + p[0], 0) / f.quad.length, f.quad.reduce((s, p) => s + p[1], 0) / f.quad.length] : f.edge ? [(f.edge[0][0] + f.edge[1][0]) / 2, (f.edge[0][1] + f.edge[1][1]) / 2] : null;
const flat = (f: FlipFrame, side: 'BACK' | 'FRONT') => f.side === side && !!f.quad && f.quad.length === 4 && !NOT_SEEN.test(f.note ?? '');
const sure = (f: FlipFrame) => (f.confidence ?? 1) >= FLIP.sure;
const seenEdge = (f: FlipFrame) => f.side === 'EDGE' && !!f.edge && !NOT_SEEN.test(f.note ?? '');
const extent = (before: number, atTurn: number): Extent => ({before: round(before), atTurn: round(atTurn), ratio: round(atTurn / Math.max(before, 1e-6), 2)});
const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
const span = (list: number[]) => list.length === 0 ? '' : list.length === 1 ? `${list[0]}` : `${list[0]}–${list[list.length - 1]}`;
const say = (v: number) => String(round(v)).replace('.', ',');
const say2 = (v: number) => String(round(v, 2)).replace('.', ',');
const word = (a: Exclude<Axis, 'OKLART'>) => a === 'LÅNGSIDAN' ? 'långsidan' : 'kortsidan';

/**
 * Reads the one turn of a deal track. `range` limits the reading to the frames of a derived take ([first, last], inclusive).
 * The turn is the last flat back before the first flat face; the reference is the most open view of the back before it.
 */
export function readFlip(track: FlipTrack, range: [number, number] | null = null): FlipReading {
  const frames = track.frames.filter(f => !range || (f.frame >= range[0] && f.frame <= range[1])), at = new Map(frames.map(f => [f.frame, f]));
  const none = (reason: string, checks: string[] = []): FlipReading => ({answer: 'OKLART', leaning: null, reason, text: [reason, ...checks], checks, turn: null, reference: null, near: null, length: null, width: null, shape: null, line: null, open: [], votes: [], after: null, travel: null, height: null});
  const firstFront = frames.find(f => f.side === 'FRONT' && f.quad)?.frame;
  if (firstFront === undefined) return none(frames.some(f => f.side === 'BACK') ? 'Ingen vändning i spåret: kortet syns bara med baksidan upp.' : 'Ingen vändning i spåret: kortet syns aldrig med baksidan upp.');
  const backs = frames.filter(f => f.frame < firstFront && f.side === 'BACK' && f.quad);
  if (!backs.length) return none('Ingen vändning i spåret: kortet syns bara med framsidan upp.');
  const lastBack = backs[backs.length - 1].frame, between = frames.filter(f => f.frame > lastBack && f.frame < firstFront);
  const edgeFrames = between.filter(f => f.side === 'EDGE').map(f => f.frame), seen = between.filter(seenEdge), lostFrames = between.filter(f => f.side === 'NONE').map(f => f.frame), checks: string[] = [];
  if (lostFrames.length) checks.push(`Spåret tappar kortet i vändningen (ruta ${span(lostFrames)}).`);
  if (!edgeFrames.length) checks.push(`Kortet byter sida mellan ruta ${lastBack} och ${firstFront} utan någon ruta på kant.`);
  else if (!seen.length) checks.push(`Kanten i ruta ${span(edgeFrames)} är ifylld mellan grannrutorna, inte sedd.`);

  // The reference: the most open views of the back before the turn, out of the shoe window, fits of good confidence first.
  // It lies after the last hole in the track (FLIP.hole frames without a sure view of the back): across a hole the hand may
  // have turned the card in the picture, and a direction from before it no longer says where the card's length points.
  let from = lastBack - FLIP.back;
  for (let f = lastBack, run = 0; f >= lastBack - FLIP.back; f--) { const fr = at.get(f); if (fr && flat(fr, 'BACK') && sure(fr)) run = 0; else if (++run >= FLIP.hole) { from = f + run; break; } }
  const inWindow = (gap: number) => frames.filter(f => flat(f, 'BACK') && f.frame >= from && f.frame <= lastBack - gap && (f.shoeShare ?? 0) < 0.5);
  if (from > lastBack - FLIP.back && !inWindow(1).length) { checks.push(`Spåret ser inte kortet säkert efter ruta ${from - FLIP.hole} före vändningen; referensen tas före hålet.`); from = lastBack - FLIP.back; }
  else if (from > lastBack - FLIP.back) checks.push(`Spåret har ett hål före vändningen; referensen tas efter det (från ruta ${from}).`);
  const window = inWindow(FLIP.gap).length ? inWindow(FLIP.gap) : inWindow(1);
  const good = window.filter(f => (f.confidence ?? 1) >= 0.6), pool0 = good.length >= 2 ? good : window.length ? window : frames.filter(f => flat(f, 'BACK') && f.frame >= from && f.frame <= lastBack && (f.shoeShare ?? 0) < 0.5);
  if (!pool0.length) return none('Oklart: kortets baksida syns aldrig ordentligt före vändningen.', checks);
  // Only an oblong view shows which axis is the length: a near-square one is foreshortened along one of them. Among the
  // oblong views the largest is the most open; without any, the largest view is used and the reading says it is unsure.
  const oblongs = pool0.filter(f => { const s = shapeOf(f.quad!); return s.major >= FLIP.follow * s.minor; }), pool = oblongs.length ? oblongs : pool0;
  const top = [...pool].sort((x, y) => (y.area ?? 0) - (x.area ?? 0)).slice(0, 3).sort((x, y) => x.frame - y.frame), shapes = top.map(f => shapeOf(f.quad!));
  const refAngle = axialMean(shapes.map(s => s.angle), shapes.map(s => s.major - s.minor + 1e-6)), refLength = mean(top.map(f => extentAlong(f.quad!, refAngle))), refWidth = mean(top.map(f => extentAlong(f.quad!, refAngle + 90)));
  const widthAngle = axialMean(top.map(f => acrossSides(f.quad!, refAngle))), oblong = refLength / Math.max(refWidth, 1e-6);
  if (oblong < FLIP.oblong) checks.push(`Före vändningen syns kortet nästan kvadratiskt (${say(refLength)} mot ${say(refWidth)} px): vilken axel som är kortets längd är osäkert.`);
  // Follow the length's direction through the hand's own turning, from the reference to the turn. A jump of the main direction
  // while the outline is still oblong is either the length folding below the width (a turn about the short edge) or a bad fit.
  let angle = refAngle; const jumps: number[] = [];
  for (const f of frames) { if (f.frame <= top[top.length - 1].frame || f.frame > lastBack || !flat(f, 'BACK') || !sure(f)) continue; const s = shapeOf(f.quad!);
    if (s.major < FLIP.follow * s.minor) continue;
    if (axialDiff(s.angle, angle) <= FLIP.step) angle = s.angle; else if (axialDiff(s.angle, angle) >= 45) jumps.push(f.frame); }
  const handTurned = axialTurn(refAngle, angle);
  // At the turn: the last sure views of the back, measured along the followed length and across it.
  const near = frames.filter(f => flat(f, 'BACK') && f.frame <= lastBack && f.frame >= lastBack - 6 && sure(f)).slice(-FLIP.near);
  if (!near.length) checks.push(`Spåret ser inte kortet säkert de sista rutorna före vändningen (ruta ${lastBack - 6}–${lastBack}).`);
  const length = near.length ? extent(refLength, mean(near.map(f => extentAlong(f.quad!, angle)))) : null, width = near.length ? extent(refWidth, mean(near.map(f => extentAlong(f.quad!, angle + 90)))) : null;
  const shape: FlipReading['shape'] = !length || !width ? null : width.ratio < FLIP.changed && length.ratio >= FLIP.kept ? 'LÅNGSIDAN' : length.ratio < FLIP.changed && width.ratio >= FLIP.kept ? 'KORTSIDAN'
    : width.ratio < FLIP.changed && length.ratio < FLIP.changed ? 'BÅDA' : width.ratio >= FLIP.changed && length.ratio >= FLIP.changed && Math.abs(width.ratio - length.ratio) < FLIP.margin ? 'INGET' : 'SVAGT';
  // A weak change gives no leaning: read by eye (pamela-p7-c1-plan-deal-02), a card carried fast and already nearly on edge
  // loses length to blur and foreshortening while its width has nothing left to lose.
  const shapeLeans: Exclude<Axis, 'OKLART'> | null = shape === 'LÅNGSIDAN' || shape === 'KORTSIDAN' ? shape : shape === 'BÅDA' && width && length && Math.abs(width.ratio - length.ratio) >= FLIP.margin ? (width.ratio < length.ratio ? 'LÅNGSIDAN' : 'KORTSIDAN') : null;
  if (oblong > FLIP.narrow) checks.push(`Kortet bärs redan smalt före vändningen (${say2(oblong)} : 1): bredden har lite kvar att förlora.`);

  // How the hand travels around the turn: from a few frames before it to a few after.
  const before = frames.filter(f => f.frame <= lastBack - 4 && centre(f)).slice(-1)[0] ?? backs[0], after = frames.find(f => f.frame >= firstFront + 4 && centre(f)) ?? frames[frames.length - 1];
  const c0 = centre(before), c1 = centre(after), travel = c0 && c1 && dist(c0, c1) >= 8 ? {angle: round(((Math.atan2(c1[1] - c0[1], c1[0] - c0[0]) * 180 / Math.PI) + 360) % 360), px: round(dist(c0, c1))} : null;
  // The edge-on line: the observed thin frames, with a sane length, against the followed length and the width as drawn.
  const lines = seen.filter(f => dist(f.edge![0], f.edge![1]) <= FLIP.maxLine * refLength);
  if (seen.length > lines.length) checks.push(`${seen.length - lines.length} kantlinje(r) längre än ${say2(FLIP.maxLine)} kortlängder räknas inte (troligen hand eller skugga).`);
  let line: FlipReading['line'] = null;
  if (lines.length) {
    const lengths = lines.map(f => dist(f.edge![0], f.edge![1])), lineAngle = axialMean(lines.map(f => axial(f.edge![0], f.edge![1])), lengths), longest = Math.max(...lengths);
    const toLength = axialDiff(lineAngle, angle), toWidth = axialDiff(lineAngle, widthAngle + handTurned);
    const says = toLength <= FLIP.along && toWidth >= toLength + FLIP.apart ? 'LÅNGSIDAN' : toWidth <= FLIP.along && toLength >= toWidth + FLIP.apart ? 'KORTSIDAN' : null;
    line = {frames: lines.map(f => f.frame), length: round(longest), perLength: round(longest / refLength, 2), perWidth: round(longest / refWidth, 2), angle: round(lineAngle), toLength: round(toLength), toWidth: round(toWidth), toTravel: travel ? round(axialDiff(lineAngle, travel.angle % 180)) : null, says};
  }

  // After the turn: the face opens again; measured along the line (or the followed length) and across it.
  const fronts = frames.filter(f => flat(f, 'FRONT') && f.frame >= firstFront && sure(f)), opened = fronts.filter(f => f.frame >= firstFront + FLIP.gap && f.frame <= firstFront + 15);
  const axisAngle = line?.angle ?? angle; let afterRead: FlipReading['after'] = null, frontAcross = 0;
  if (fronts.length && opened.length) {
    const ftop = [...opened].sort((x, y) => (y.area ?? 0) - (x.area ?? 0)).slice(0, 3), first = fronts.slice(0, FLIP.near);
    frontAcross = mean(ftop.map(f => extentAlong(f.quad!, axisAngle + 90)));
    afterRead = {frames: first.map(f => f.frame), along: extent(mean(ftop.map(f => extentAlong(f.quad!, axisAngle))), mean(first.map(f => extentAlong(f.quad!, axisAngle)))), across: extent(frontAcross, mean(first.map(f => extentAlong(f.quad!, axisAngle + 90))))};
  }

  // The open face right after the turn, in the same place and perspective as the line: does the line run along the card's
  // length there (its main direction) or across it? The most open sure view of the face within FLIP.side frames counts.
  // The back before the turn is not asked the same: read by eye (pamela-p5-c1-drawn-deal-02, pamela-arkiv-d-c3-third-join),
  // its most open view lies 8–10 frames back and the hand has turned the card 45–55° in the picture since, so it votes wrong;
  // the followed length (the line against it) already carries that view through the hand's turning.
  const openView = (side: 'BACK' | 'FRONT'): FlipReading['open'][number] | null => {
    if (!line) return null;
    const list = frames.filter(f => flat(f, side) && sure(f) && (side === 'BACK' ? f.frame <= lastBack && f.frame >= lastBack - FLIP.side : f.frame >= firstFront && f.frame <= firstFront + FLIP.side));
    const best = [...list].sort((x, y) => (y.area ?? 0) - (x.area ?? 0))[0]; if (!best) return null;
    const s = shapeOf(best.quad!), off = axialDiff(s.angle, line.angle), oblongHere = s.major >= FLIP.follow * s.minor;
    return {side, frame: best.frame, oblong: round(s.major / Math.max(s.minor, 1e-6), 2), off: round(off), says: !oblongHere ? null : off <= FLIP.along ? 'LÅNGSIDAN' : off >= FLIP.across ? 'KORTSIDAN' : null};
  };
  const open = [openView('FRONT')].filter((v): v is NonNullable<typeof v> => !!v);

  // The verdict. Votes: how the outline changes into the turn (only a clear change votes), the line against the followed length,
  // and the open view on each side of the turn. An answer needs a seen line, two votes for it and none against; otherwise the
  // reading is OKLART with the majority as its leaning. Without a line only the outline speaks, and only as a leaning.
  let answer: Axis = 'OKLART', leaning: Exclude<Axis, 'OKLART'> | null = null, reason: string;
  const votes: {by: string; says: Exclude<Axis, 'OKLART'>}[] = [];
  if (shape === 'LÅNGSIDAN' || shape === 'KORTSIDAN') votes.push({by: 'konturen', says: shape});
  if (line?.says) votes.push({by: 'kantlinjen', says: line.says});
  for (const v of open) if (v.says) votes.push({by: v.side === 'BACK' ? 'baksidan strax före' : 'framsidan strax efter', says: v.says});
  const forL = votes.filter(v => v.says === 'LÅNGSIDAN'), forK = votes.filter(v => v.says === 'KORTSIDAN'), list = (v: typeof votes) => v.map(x => x.by).join(', ');
  const turns = (a: Exclude<Axis, 'OKLART'>) => a === 'LÅNGSIDAN' ? 'Kortet rullar kring långsidan' : 'Kortet fälls kring kortsidan';
  if (shape === 'BÅDA') { leaning = forL.length > forK.length ? 'LÅNGSIDAN' : forK.length > forL.length ? 'KORTSIDAN' : shapeLeans;
    reason = `Oklart: båda måtten krymper in i vändningen (längden till ${say2(length!.ratio)}, bredden till ${say2(width!.ratio)} av referensen): kortet glider under handen, bort från kameran eller tappas av spåret${leaning ? `; lutar åt ${word(leaning)}` : ''}.`; }
  else if (line && (forL.length >= 2 && !forK.length || forK.length >= 2 && !forL.length)) { answer = forL.length ? 'LÅNGSIDAN' : 'KORTSIDAN';
    reason = `${turns(answer)}: kantlinjen går längs kortets ${answer === 'LÅNGSIDAN' ? 'längd' : 'bredd'} (${list(answer === 'LÅNGSIDAN' ? forL : forK)} säger samma).`; }
  else if (forL.length && forK.length) { leaning = forL.length > forK.length ? 'LÅNGSIDAN' : forK.length > forL.length ? 'KORTSIDAN' : null; reason = `Oklart: måtten säger emot varandra (långsidan: ${list(forL)}; kortsidan: ${list(forK)}).`; }
  else if (!line) { leaning = shapeLeans; reason = `Oklart: ingen sedd ruta där kortet står på kant${shape === 'BÅDA' ? '; båda måtten krymper' : ''}${shapeLeans ? `; konturen lutar åt ${word(shapeLeans)}` : ''}.`; }
  else { leaning = votes[0]?.says ?? shapeLeans; reason = `Oklart: för lite stöd${votes.length ? ` (bara ${list(votes)})` : ''}${shape === 'BÅDA' ? '; båda måtten krymper' : ''}${leaning ? `; lutar åt ${word(leaning)}` : ''}.`; }

  // The turn in frames: from where the shrinking extent leaves its reference until the face is open again across the axis.
  const shrinking = (answer === 'OKLART' ? leaning : answer) === 'KORTSIDAN' ? 0 : 90, refOf = shrinking ? refWidth : refLength; let start = lastBack;
  for (const f of [...frames].reverse()) { if (f.frame > lastBack || !flat(f, 'BACK')) continue; if (extentAlong(f.quad!, angle + shrinking) / refOf >= FLIP.started) break; start = f.frame; if (f.frame < lastBack - FLIP.back) break; }
  let end = firstFront;
  if (frontAcross > 0) for (const f of fronts) { end = f.frame; if (extentAlong(f.quad!, axisAngle + 90) / frontAcross >= FLIP.open) break; }
  // Where it turns against where it comes to rest: up in the picture is higher or further away, the track cannot tell which.
  const restC = track.restQuad && track.restQuad.length === 4 ? [mean(track.restQuad.map(p => p[0])), mean(track.restQuad.map(p => p[1]))] as XY : null;
  const turnC: XY | null = lines.length ? [mean(lines.map(f => centre(f)![0])), mean(lines.map(f => centre(f)![1]))] : (() => { const a = centre(at.get(lastBack)!), b = centre(at.get(firstFront)!); return a && b ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as XY : null; })();
  const height = restC && turnC ? {dx: round(turnC[0] - restC[0]), dy: round(restC[1] - turnC[1]), cardLengths: round((restC[1] - turnC[1]) / refLength, 2), note: 'Kortets mitt i vändningen mot dess mitt i vila, i bildpunkter (dy > 0: vändningen sker högre upp i bilden). Höjd och djup går inte att skilja i en kamera.'} : null;

  const reading: FlipReading = {answer, leaning, reason, text: [], checks, turn: {lastBack, firstFront, edgeFrames, seenEdgeFrames: seen.map(f => f.frame), lostFrames, start, end, frames: end - start + 1},
    reference: {frames: top.map(f => f.frame), length: round(refLength), width: round(refWidth), oblong: round(oblong, 2), angle: round(refAngle), widthAngle: round(widthAngle)},
    near: {frames: near.map(f => f.frame), handTurned: round(handTurned), jumps}, length, width, shape, line, open, votes, after: afterRead, travel, height};
  reading.text = describe(reading);
  return reading;
}

/** The reading in plain Swedish, one line per fact, every number checkable against the track. */
export function describe(r: FlipReading): string[] {
  if (!r.turn || !r.reference) return [r.reason, ...r.checks];
  const out = [r.reason, `Vändningen: sista baksida ruta ${r.turn.lastBack}, första framsida ruta ${r.turn.firstFront}${r.turn.edgeFrames.length ? `, på kant ruta ${span(r.turn.edgeFrames)}${r.turn.seenEdgeFrames.length < r.turn.edgeFrames.length ? ` (sedd i ${r.turn.seenEdgeFrames.length ? span(r.turn.seenEdgeFrames) : 'ingen'})` : ''}` : ''}; från ruta ${r.turn.start} till ${r.turn.end}, ${r.turn.frames} rutor.`,
    `Före (ruta ${r.reference.frames.join(', ')}): kortets längd ${r.reference.length} px i ${r.reference.angle}°, bredd ${r.reference.width} px (${say2(r.reference.oblong)} : 1).`];
  if (r.length && r.width && r.near) out.push(`In i vändningen (ruta ${r.near.frames.join(', ')}): längden ${r.length.before} → ${r.length.atTurn} px (${say2(r.length.ratio)}), bredden ${r.width.before} → ${r.width.atTurn} px (${say2(r.width.ratio)}); handen har vridit kortet ${Math.abs(r.near.handTurned)}° i bildplanet${r.near.jumps.length ? `; huvudriktningen hoppar i ruta ${r.near.jumps.join(', ')}` : ''}.`);
  if (r.line) out.push(`På kant (ruta ${r.line.frames.join(', ')}): linje ${r.line.length} px = ${say2(r.line.perLength)} kortlängder = ${say2(r.line.perWidth)} kortbredder; ${r.line.angle}° mot vågrätt, ${r.line.toLength}° från kortets längd, ${r.line.toWidth}° från dess bredd${r.line.toTravel === null ? '' : `, ${r.line.toTravel}° från handens färdriktning`}.`);
  for (const v of r.open) out.push(`${v.side === 'BACK' ? 'Baksidan strax före' : 'Framsidan strax efter'} (ruta ${v.frame}, ${say2(v.oblong)} : 1): huvudriktningen ${v.off}° från kantlinjen${v.says ? `, säger ${word(v.says)}` : ''}.`);
  if (r.after) out.push(`Efter (ruta ${r.after.frames.join(', ')}): längs axeln ${r.after.along.atTurn} av ${r.after.along.before} px, tvärs axeln ${r.after.across.atTurn} av ${r.after.across.before} px.`);
  if (r.travel) out.push(`Handen färdas ${r.travel.px} px i riktning ${r.travel.angle}° kring vändningen.`);
  if (r.height) out.push(`Vändningens mitt ligger ${Math.abs(r.height.dy)} px ${r.height.dy >= 0 ? 'ovanför' : 'nedanför'} viloplatsen i bilden (${say2(Math.abs(r.height.cardLengths))} kortlängder) och ${Math.abs(r.height.dx)} px åt ${r.height.dx >= 0 ? 'höger' : 'vänster'}; höjd och djup går inte att skilja.`);
  return [...out, ...r.checks];
}
