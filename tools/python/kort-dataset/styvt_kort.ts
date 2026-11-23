// Steg 7, det styva kortet (Jakob 2026-11-23: "ett kort ska ju bara kunna inneha som en enda storlek", "jämna ut korten",
// "att de listar ut vinkel och eller vy", "aningen större för det kommer närmre kameran"). Modellens hörn per ruta blir här ETT
// riktigt kort (63 x 88 mm) som ses genom bordets lins (src/table-lens.ts), som korten som ligger. Kortet har sex mått per ruta:
//   1. Var det är och åt vilket håll det pekar: mitten av modellens kort, och dit kortets långsidor pekar, lagda på ett plan
//      strax över filten.
//   2. Höjden över filten: av hur stort filmens kort är mot ett kort som ligger på filten, högst STIFF.lift och mycket trögt, så
//      att storleken på bilden bara ändras lite och långsamt (kortet kommer närmare kameran, eller läggs ner).
//   3. Hur det lutar: en vinkel kring långsidan och en kring kortsidan. Den ena går hela varvet (ett kort som vänds går ett halvt
//      varv), den andra är en lutning. Fyra hörn i en ruta passar ofta två lutningar lika bra; därför söks vinkeln för alla
//      rutor på en gång: den väg som ligger närmast modellens kontur, visar den sida modellen såg, rör sig minst och slutar i
//      kortet som ligger.
//   4. Varje mått jämnas över hela filmen (en ruta som sticker ut ensam förbigås, ett kort som verkligen rör sig fort följs),
//      och slutar i kortet som ligger. Rutor utan kort, med bara en linje eller en bit av kortet bärs av rutorna omkring. Rör
//      sig alla hörn mindre än STIFF.still bildpunkter står kortet helt stilla.
// Storleken på bilden ändras alltså bara av avståndet till kameran (högst några procent) och av att kortet lutar. Filmens eget
// kort är inget styvt kort (det är ofta 5-10 % större i handen än när det ligger), så det ritade kortet följer inte filmens
// kontur ruta för ruta. Varje ruta får `film` (filmens kort, det som filmens egen färg tas bort efter) och `quad` (det riktiga
// kortet, delat med överläggets marginal, så att det ritade kortet har planens storlek hela vägen och inte krymper när det
// landar). En film där det styva kortet hamnar mer än STIFF.fits bildpunkter från modellens hörn (kortet bärs högt i luften, som
// i de äldre filmerna) behåller modellens rutor.
import {TABLE_LENS, CARD, filmEye, see, onPlane, add, sub, mul, dot, cross, length, type Vec3} from '../../../src/table-lens.ts';
import {centre, signedArea, type Pt, type Side} from '../../../src/card-track.ts';
import {MARGIN, plausible, type CardTrack} from '../../../src/card-overlay.ts';

// reach: a measure within this many pixels of the model's is pulled to it by the square of the distance, one further off by the
// distance itself. lambda, huber: how hard the card is held to an even motion (1: a pixel of unevenness costs as much as a pixel
// from the model), and the unevenness, in pixels, beyond which a quick change of pace is let through. lift: the highest the card
// is carried over the felt, metres. liftPace: lambda for the height. still: see 4 above. small: a quad whose longest side is under this
// share of the film's usual is a piece of the card and only says where the card is. pace, swing, most: what a degree of lean from one
// frame to the next costs (per squared pixel at the card's edge), the most the lean changes in a frame, and the most the card
// leans about its other side, degrees. face: what a frame costs, in pixels, when the card shows another side than the model saw.
// fits: the most the stiff card may lie from the model's corners (the median over the film, pixels) for the film to get it.
// weights: how much a frame's card counts by where it came from.
export const STIFF = {reach: 3, lambda: 1, huber: 2, lift: 0.05, liftPace: 4, still: 0.6, small: 0.6, pace: 0.03, swing: 45, most: 80, face: 12, fits: 8, weights: {modell: 1, styv: 0.5, idag: 0.5, kept: 0.15, linje: 0.3, bit: 0.1}};
export type Frame = {frame: number; side: Side; quad: number[][] | null; edge: number[][] | null; area?: number; confidence?: number; shoeShare?: number; note?: string; film?: number[][] | null};
export type Source = 'modell' | 'linje' | 'styv' | null;
export type Stiff = {fran: number; filmkort: [number, number]; ryck: [number, number]; franModellen: number; burna: number; hojd: number; kant: number; lutar: [number, number][]; kring: string};
type Pose = {c: Vec3; a: Vec3; u: Vec3}; // the card's middle (metres), its short and its long direction
type Obs = {quad: Pt[] | null; at: Pt; w: number; side: 'BACK' | 'FRONT' | null; run: number};

const eye = filmEye(TABLE_LENS), SIGN = [[-1, 1], [1, 1], [1, -1], [-1, -1]], REAL: [number, number] = [CARD.width, CARD.height];
const DIHEDRAL = [0, 1, 2, 3].flatMap(k => [1, -1].map(d => [0, 1, 2, 3].map(j => (((d * j + k) % 4) + 4) % 4)));
const pt = (p: number[]): Pt => ({x: p[0], y: p[1]}), r1 = (v: number) => Math.round(v * 10) / 10, arr = (q: Pt[]) => q.map(p => [r1(p.x), r1(p.y)]);
const P = (X: Vec3): Pt => see(eye, X) ?? {x: 1e6, y: 1e6}, far = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : 0; };
const about = (q: Pt[], s: number): Pt[] => { const c = centre(q); return q.map(p => ({x: c.x + (p.x - c.x) * s, y: c.y + (p.y - c.y) * s})); };
const facing = (p: Pose): 'BACK' | 'FRONT' => dot(cross(p.a, p.u), sub(eye.position, p.c)) > 0 ? 'BACK' : 'FRONT';
const corners = (p: Pose, size: [number, number], map = [0, 1, 2, 3]) => map.map(k => P(add(p.c, add(mul(p.a, SIGN[k][0] * size[0] / 2), mul(p.u, SIGN[k][1] * size[1] / 2)))));
const rot = (v: Vec3, k: Vec3, t: number): Vec3 => add(add(mul(v, Math.cos(t)), mul(cross(k, v), Math.sin(t))), mul(k, dot(k, v) * (1 - Math.cos(t)))); // v turned the angle t about the unit vector k
/**
 * The path of an angle over the film, on a grid of whole degrees from `lo` to `hi` (a full circle with `wrap`): the one whose
 * frames cost the least (`cost`), that moves the least from frame to frame (`pace` per squared degree, at most STIFF.swing
 * degrees a frame), and that is followed by `end`, where the card lies. With `wrap` the path is not folded back into the grid:
 * a card turned over ends half a turn from where it began.
 */
function walk(n: number, cost: (i: number, deg: number) => number, lo: number, hi: number, wrap: boolean, end: number, pace: number): number[] {
  const S = hi - lo + 1, R = STIFF.swing, fold = (s: number) => wrap ? ((s % S) + S) % S : s, sum = Array.from({length: n}, () => new Float64Array(S)), back = Array.from({length: n}, () => new Int16Array(S));
  for (let t = 0; t < n; t++) for (let s = 0; s < S; s++) { let least = 0, by = 0;
    if (t > 0) { least = Infinity; for (let d = -R; d <= R; d++) { const r = fold(s + d); if (r < 0 || r >= S) continue; const v = sum[t - 1][r] + pace * d * d; if (v < least) { least = v; by = d; } } }
    sum[t][s] = least + cost(t, lo + s); back[t][s] = by; }
  let s = fold(end - lo), deg = end, least = Infinity; for (let d = -R; d <= R; d++) { const r = fold(end - lo + d); if (r < 0 || r >= S) continue; const v = sum[n - 1][r] + pace * d * d; if (v < least) { least = v; s = r; deg = end + d; } }
  const out: number[] = new Array(n); for (let t = n - 1; t >= 0; t--) { out[t] = deg; const d = back[t][s]; deg += d; s = fold(s + d); }
  return out;
}
/** A quad laid on the plane `lift` metres over the felt: its middle, its long and its short side (metres), and the way its long side points. */
function laid(q: Pt[], lift: number, longFirst: boolean) {
  const G = q.map(p => onPlane(eye, p.x, p.y, lift)); if (G.some(g => !g)) return null; const [g0, g1, g2, g3] = G as Vec3[];
  const e01 = mul(add(sub(g1, g0), sub(g2, g3)), 0.5), e03 = mul(add(sub(g3, g0), sub(g2, g1)), 0.5), [long, short] = longFirst ? [e01, e03] : [e03, e01];
  return {c: mul(add(add(g0, g1), add(g2, g3)), 0.25), long: length(long), short: length(short), heading: Math.atan2(long[0], -long[2]), first: length(e01) >= length(e03)};
}
/** A banded system solved by Cholesky; null when the matrix is not positive. */
function solveBand(A: Float64Array, g: Float64Array, N: number, band: number): Float64Array | null {
  for (let j = 0; j < N; j++) { const k0 = Math.max(0, j - band); let d = A[j * N + j]; for (let k = k0; k < j; k++) d -= A[j * N + k] ** 2; if (!(d > 1e-14)) return null; d = Math.sqrt(d); A[j * N + j] = d;
    for (let i = j + 1; i <= Math.min(N - 1, j + band); i++) { let s = A[i * N + j]; for (let k = Math.max(k0, i - band); k < j; k++) s -= A[i * N + k] * A[j * N + k]; A[i * N + j] = s / d; } }
  const y = new Float64Array(N), x = new Float64Array(N);
  for (let i = 0; i < N; i++) { let s = g[i]; for (let k = Math.max(0, i - band); k < i; k++) s -= A[i * N + k] * y[k]; y[i] = s / A[i * N + i]; }
  for (let i = N - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k <= Math.min(N - 1, i + band); k++) s -= A[k * N + i] * x[k]; x[i] = s / A[i * N + i]; }
  return x;
}
/**
 * One measure made even over the film: as close to what the frames say (`values`, null where a frame says nothing, each counting
 * `weights`) as an even motion allows, and ending in `end`, where the card lies. All in pixels (STIFF.reach, STIFF.huber).
 */
export function even(values: (number | null)[], weights: number[], end: number, lambda: number = STIFF.lambda): number[] {
  const n = values.length, known = values.map((v, i) => v === null ? -1 : i).filter(i => i >= 0), x = new Float64Array(n), tail = [end, end, end], at = (i: number) => i < n ? x[i] : tail[i - n];
  for (let i = 0; i < n; i++) { const lo = known.filter(k => k <= i).pop(), hi = known.find(k => k >= i), a = lo === undefined ? null : values[lo]!, b = hi === undefined ? end : values[hi]!, t0 = lo ?? -1, t1 = hi ?? n;
    x[i] = a === null ? b : t1 === t0 ? a : a + (b - a) * (i - t0) / (t1 - t0); }
  for (let round = 0; round < 12; round++) { const A = new Float64Array(n * n), g = new Float64Array(n), R = STIFF.reach, H = STIFF.huber;
    for (let i = 0; i < n; i++) { A[i * n + i] += 1e-9; const v = values[i]; if (v === null) continue; const e = Math.abs(x[i] - v), w = weights[i] * (e <= R ? 1 : R / e); A[i * n + i] += w; g[i] += w * v; }
    for (let i = 1; i < n + 2; i++) { const e = Math.abs(at(i - 1) - 2 * at(i) + at(i + 1)) * lambda, w = lambda * lambda * (e <= H ? 1 : H / e), coef = [1, -2, 1];
      for (let p = 0; p < 3; p++) { const f = i - 1 + p; if (f >= n) continue; for (let q = 0; q < 3; q++) { const h = i - 1 + q; if (h < n) A[f * n + h] += w * coef[p] * coef[q]; else g[f] -= w * coef[p] * coef[q] * tail[h - n]; } } }
    const next = solveBand(A, g, n, 2); if (!next) break; let moved = 0; for (let i = 0; i < n; i++) { moved = Math.max(moved, Math.abs(next[i] - x[i])); x[i] = next[i]; } if (moved < 0.01) break; }
  return [...x];
}

/**
 * The frames with the card as one stiff card (see the head of this file), and what came of it; null for a film whose card never
 * comes to rest on the felt, or where the fit does not hold: such a film keeps the frames it had.
 */
export function rigidFrames(track: CardTrack, frames: Frame[], from: Source[]): {frames: Frame[]; stats: Stiff} | null {
  const end = track.restFrom, rq = track.restQuad?.length === 4 ? track.restQuad.map(pt) : null; if (end == null || !rq || end > frames.length) return null;
  const flat = (f: Frame | undefined): f is Frame & {quad: number[][]; side: 'BACK' | 'FRONT'} => !!f && (f.side === 'BACK' || f.side === 'FRONT') && f.quad?.length === 4;
  let first = -1; for (let i = Math.max(0, track.leavesShoe ?? 0); i < end && first < 0; i++) if ((from[i] === 'modell' || from[i] === 'styv') && flat(frames[i])) first = i;
  if (first < 0 || end - first < 4) return null;
  // the film's own card, measured where it lies, as shares of a real card; and where and how it lies
  const lying = laid(rq, 0, true); if (!lying) return null;
  const clamp = (v: number) => Math.max(0.6, Math.min(1.3, v)), share: [number, number] = [clamp(Math.min(lying.long, lying.short) / CARD.width), clamp(Math.max(lying.long, lying.short) / CARD.height)], film: [number, number] = [CARD.width * share[0], CARD.height * share[1]];
  const rest = laid(rq, 0, lying.first)!, px = eye.focalPx / Math.max(0.3, dot(sub(rest.c, eye.position), eye.forward)), arm = CARD.height / 2 * px; // pixels per metre at the table, and per radian at the card's end
  let lyingSide: Side = frames[end]?.side ?? 'NONE'; for (let i = end - 1; i >= first && lyingSide !== 'BACK' && lyingSide !== 'FRONT'; i--) lyingSide = frames[i].side;
  // what each frame says: a card, a place, or nothing
  const n = end - first, W = STIFF.weights, longest = (q: Pt[]) => Math.max(far(q[0], q[1]) + far(q[2], q[3]), far(q[1], q[2]) + far(q[3], q[0])) / 2, usual = median(frames.slice(first, end).filter((f, i) => from[first + i] === 'modell' && flat(f)).map(f => longest(f.quad!.map(pt)))) || longest(rq);
  const obs: (Obs | null)[] = [];
  for (let i = first; i < end; i++) { const f = frames[i];
    if ((f.shoeShare ?? 0) >= 0.9) obs.push(null);
    else if (flat(f)) { const q = f.quad.map(pt), small = longest(q) < STIFF.small * usual;
      obs.push(small ? {quad: null, at: centre(q), w: W.bit, side: null, run: -1} : {quad: q, at: centre(q), side: f.side, run: -1, w: from[i] === 'modell' ? W.modell : from[i] === 'styv' ? W.styv : /last known shape kept/.test(f.note ?? '') ? W.kept : W.idag}); }
    else if (f.side === 'EDGE' && f.edge?.length === 2) obs.push({quad: null, at: centre(f.edge.map(pt)), w: W.linje, side: null, run: -1});
    else obs.push(null); }
  // a side seen for one or two frames inside the other side is a misread side: such a frame only says where the card is
  const cards = () => obs.map((o, i) => o?.quad ? i : -1).filter(i => i >= 0);
  for (let list = cards(), i = 0; i < list.length;) { let j = i; while (j < list.length && obs[list[j]]!.side === obs[list[i]]!.side) j++;
    if (j - i < 3 && i > 0 && j < list.length) for (let k = i; k < j; k++) { const o = obs[list[k]]!; obs[list[k]] = {...o, quad: null, w: W.bit, side: null}; } i = j; }
  const changes: [number, number][] = []; // the last frame of one side and the first of the next
  { let run = -1, side: Side | null = null, last = -1; for (const i of cards()) { if (obs[i]!.side !== side) { if (side) changes.push([last, i]); run++; side = obs[i]!.side; } obs[i]!.run = run; last = i; } }
  const list = cards(); if (list.length < 3) return null;
  if (lyingSide !== 'BACK' && lyingSide !== 'FRONT') lyingSide = obs[list[list.length - 1]]!.side!;
  if (obs[list[list.length - 1]]!.side !== lyingSide) changes.push([list[list.length - 1], n]); // the card turns over as it is laid
  const near = (i: number) => changes.some(([a, b]) => i > a - 2 && i < b + 2); // frames in a turn-over say nothing of size or direction
  // which pair of a quad's sides is the card's long one, frame by frame (the model does not number the corners by the card): the
  // pair that, laid on the felt, gives a card's proportions, unless the card would then point another way than in the frame before
  const longFirst = new Map<number, boolean>(); { const tries = list.map(i => [true, false].map(first => { const l = laid(obs[i]!.quad!, 0, first); return l ? {heading: l.heading, off: Math.abs(Math.log(l.long / l.short * CARD.width / CARD.height))} : {heading: 0, off: 9}; }));
    const bend = (a: number, b: number) => Math.abs(a - b - Math.PI * Math.round((a - b) / Math.PI)), sum = tries.map(t => t.map(v => 3 * v.off)), back = tries.map(() => [0, 0]);
    for (let t = 1; t < list.length; t++) for (const s of [0, 1]) { const via = [0, 1].map(r => sum[t - 1][r] + 2 * bend(tries[t - 1][r].heading, tries[t][s].heading) / (list[t] - list[t - 1])); back[t][s] = via[1] < via[0] ? 1 : 0; sum[t][s] += Math.min(via[0], via[1]); }
    for (let t = list.length - 1, s = sum[t][1] < sum[t][0] ? 1 : 0; t >= 0; s = back[t][s], t--) longFirst.set(list[t], s === 0); }
  // 2. the height: how large the film's card is against a card on the felt, seen from the camera's height
  const lay = (i: number, lift: number) => laid(obs[i]!.quad!, lift, longFirst.get(i)!);
  const lift = even(obs.map((o, i) => { const l = o?.quad && !near(i) ? lay(i, 0) : null; if (!l) return null; const size = Math.sqrt(l.long / film[1] * l.short / film[0]); return Math.max(0, Math.min(STIFF.lift, eye.position[1] * (1 - 1 / size))) * px; }), obs.map(o => o?.w ?? 0), 0, STIFF.liftPace).map(v => Math.max(0, Math.min(STIFF.lift, v / px)));
  // 1 and 4. where the card is and which way it points, on the plane at that height, made even over the film
  const place = obs.map((o, i) => { if (!o) return null; if (o.quad) return lay(i, lift[i])?.c ?? null; return onPlane(eye, o.at.x, o.at.y, lift[i]); });
  const xs = even(place.map(p => p ? p[0] * px : null), obs.map(o => o?.w ?? 0), rest.c[0] * px), zs = even(place.map(p => p ? p[2] * px : null), obs.map(o => o?.w ?? 0), rest.c[2] * px);
  const half = (v: number, by: number) => v + Math.PI * Math.round((by - v) / Math.PI); // a card's two ends are alike: its direction is known to a half turn
  const raw: (number | null)[] = obs.map(() => null); { let last: number | null = null; for (const i of list) { if (near(i)) continue; const l = lay(i, lift[i]); if (!l) continue; last = last === null ? l.heading : half(l.heading, last); raw[i] = last; } }
  const lastHeading = [...raw].reverse().find(v => v !== null) ?? rest.heading, headings = even(raw.map(v => v === null ? null : v * arm), obs.map(o => o?.w ?? 0), half(rest.heading, lastHeading) * arm).map(v => v / arm);
  // 3. how the card leans: two angles, one about its long side and one about its short side, laid on the flat card. One of them
  // goes the whole way round (a card that is turned over goes half a turn), the other leans at most STIFF.most degrees. Each is
  // first sought on a grid of whole degrees, for all frames at once: the path that lies closest to the model's outline and shows
  // the side the model saw, moves the least from frame to frame, and ends in the card lying. Four corners alone often fit two
  // leans equally well; the whole path, ending flat, is what settles which. Then each frame's angle is sought finely about that
  // path and made even over the film. Both ways to share the two angles are tried; the one closest to the model is kept.
  const RAD = Math.PI / 180, weights = obs.map(o => o?.w ?? 0), lands = lyingSide === 'BACK' ? 0 : 180, landsHeading = half(rest.heading, lastHeading);
  let heading = headings;
  const poseOf = (i: number, kring: string, round: number, lean: number, h = heading[i]): Pose => { const c: Vec3 = [xs[i] / px, lift[i], zs[i] / px], a: Vec3 = [Math.cos(h), 0, Math.sin(h)], u: Vec3 = [Math.sin(h), 0, -Math.cos(h)];
    if (kring === 'long') { const a1 = rot(a, u, round * RAD); return {c, a: a1, u: rot(u, a1, lean * RAD)}; } const u1 = rot(u, a, round * RAD); return {c, u: u1, a: rot(a, u1, lean * RAD)}; };
  const miss = (pose: Pose, q: Pt[]) => Math.min(...DIHEDRAL.map(m => { const c = corners(pose, film, m); return q.reduce((s, v, j) => s + Math.min(30, far(v, c[j])), 0) / 4; }));
  const cost = (i: number, pose: Pose) => { const o = obs[i]; return o?.quad ? o.w * (miss(pose, o.quad) + (facing(pose) === o.side ? 0 : STIFF.face)) : 0; };
  // an angle sought finely, frame by frame, about the path it has, and made even; `lever` is how many pixels a degree moves the card's edge
  const settle = (start: number[], at: (i: number, deg: number) => Pose, end: number, lever: number, span = 3) => even(start.map((deg, i) => { if (!obs[i]?.quad) return null; let best = deg, least = Infinity;
    for (let d = -span; d <= span; d += 0.25) { const v = cost(i, at(i, deg + d)) + 0.02 * Math.abs(d); if (v < least) { least = v; best = deg + d; } } return best * lever; }), weights, end * lever).map(v => v / lever);
  const leanBy = (kring: string) => { const levers = [film[0], film[1]].map(s => s / 2 * px * RAD), [l1, l2] = kring === 'long' ? levers : [levers[1], levers[0]];
    let round = settle(walk(n, (i, deg) => cost(i, poseOf(i, kring, deg, 0)), -180, 179, true, lands, STIFF.pace * l1 * l1), (i, deg) => poseOf(i, kring, deg, 0), lands, l1);
    let lean = settle(walk(n, (i, deg) => cost(i, poseOf(i, kring, round[i], deg)), -STIFF.most, STIFF.most, false, 0, STIFF.pace * l2 * l2), (i, deg) => poseOf(i, kring, round[i], deg), 0, l2);
    round = settle(round, (i, deg) => poseOf(i, kring, deg, lean[i]), lands, l1); lean = settle(lean, (i, deg) => poseOf(i, kring, round[i], deg), 0, l2);
    return {kring, round, lean, l1, l2, cost: obs.reduce((s, _, i) => s + cost(i, poseOf(i, kring, round[i], lean[i])), 0) + (kring === 'short' ? 1 : 0)}; };
  const led = [leanBy('long'), leanBy('short')].sort((a, b) => a.cost - b.cost)[0], kring = led.kring; let {round, lean} = led;
  // the direction once more, now that the lean is known (a card that leans does not point where its outline on the felt does), and the angles after it
  heading = settle(headings.map(h => h / RAD), (i, deg) => poseOf(i, kring, round[i], lean[i], deg * RAD), landsHeading / RAD, arm * RAD, 8).map(v => v * RAD);
  round = settle(round, (i, deg) => poseOf(i, kring, deg, lean[i]), lands, led.l1); lean = settle(lean, (i, deg) => poseOf(i, kring, round[i], deg), 0, led.l2);
  const final = obs.map((_, i) => poseOf(i, kring, round[i], lean[i])); if (final.some(p => ![...p.c, ...p.a, ...p.u].every(Number.isFinite))) return null;
  // 5. the frames. The corners go the same way round on the screen as the lying card's, and begin on the same kind of side (long
  // or short); of the two corners that leaves to begin at, the one that lies nearest the frame after, so that the card runs into
  // the lying card corner by corner. (The model's own numbering is not used: it does not follow the card.)
  const wind = Math.sign(signedArea(rq)) || 1, order: number[][] = new Array(n); { let next: Pt[] = rq;
    for (let i = n - 1; i >= 0; i--) { const all = corners(final[i], REAL), way = Math.sign(signedArea(all)) || 1, fits = DIHEDRAL.filter(m => ((m[1] - m[0] + 4) % 4 === 1) === (way === wind) && ((m[0] + m[1]) % 4 === 1) !== lying.first);
      order[i] = fits.map(m => ({m, d: m.reduce((t, k, j) => t + far(all[k], next[j]), 0)})).sort((p, q) => p.d - q.d)[0].m; next = order[i].map(k => all[k]); } }
  const out = frames.map(f => ({...f})), size = Math.sqrt(share[0] * share[1]), fit: number[] = []; let held: {own: Pt[]; real: Pt[]; side: string} | null = null, carried = 0, thin = 0;
  for (let i = Math.max(0, track.leavesShoe ?? 0); i < first; i++) { const f = frames[i]; if (flat(f) && (f.shoeShare ?? 0) < 0.9) out[i] = {...f, film: f.quad, quad: arr(about(f.quad.map(pt), 1 / (size * MARGIN)))}; }
  for (let i = 0; i < n; i++) { const pose = final[i], f = frames[first + i], side = facing(pose), map = order[i], o = obs[i], sure = !!o?.quad && from[first + i] === 'modell';
    let own = corners(pose, film, map), real = corners(pose, REAL, map);
    if (sure) fit.push(miss(pose, o!.quad!));
    if (held && held.side === side && real.every((p, k) => far(p, held!.real[k]) < STIFF.still)) { own = held.own; real = held.real; } else held = {own, real, side};
    if (!o?.quad) carried++;
    const drawn = about(real, 1 / MARGIN), note = `stiff card: ${o?.quad ? sure ? 'the model\'s card' : 'the track\'s card' : 'carried by the frames around it'}`;
    if (plausible(drawn) && plausible(own)) out[first + i] = {...f, side, quad: arr(drawn), film: sure && plausible(o!.quad!) ? f.quad : arr(own), edge: null, confidence: o?.quad ? f.confidence : 0.5, note};
    else { thin++; const ends = (v: Vec3, l: number) => [P(add(pose.c, mul(v, l / 2))), P(sub(pose.c, mul(v, l / 2)))], lu = ends(pose.u, REAL[1]), la = ends(pose.a, REAL[0]), line = far(lu[0], lu[1]) >= far(la[0], la[1]) ? lu : la;
      out[first + i] = far(line[0], line[1]) > 2 && far(line[0], line[1]) < 1e4 ? {...f, side: 'EDGE', quad: null, film: null, edge: arr(line), confidence: 0.5, note: 'stiff card: on its edge'} : {...f}; } }
  // a line runs the way the card's length ran in the frame before it
  for (let i = first + 1; i < end; i++) { const f = out[i], p = out[i - 1]; if (f.side !== 'EDGE' || !f.edge) continue; const q = p.quad?.map(pt);
    const d = q ? (far(q[0], q[1]) + far(q[2], q[3]) <= far(q[1], q[2]) + far(q[3], q[0]) ? {x: q[2].x + q[3].x - q[0].x - q[1].x, y: q[2].y + q[3].y - q[0].y - q[1].y} : {x: q[1].x + q[2].x - q[0].x - q[3].x, y: q[1].y + q[2].y - q[0].y - q[3].y}) : p.edge?.length === 2 ? {x: p.edge[1][0] - p.edge[0][0], y: p.edge[1][1] - p.edge[0][1]} : null;
    if (d && (f.edge[1][0] - f.edge[0][0]) * d.x + (f.edge[1][1] - f.edge[0][1]) * d.y < 0) f.edge = [f.edge[1], f.edge[0]]; }
  if (!(median(fit) <= STIFF.fits)) return null;
  // how unevenly the corners move from frame to frame (the mean second difference, pixels): the model's own, and the drawn card's
  const jerk = (list: Frame[]) => { let sum = 0, count = 0; for (let i = first + 1; i + 1 < end; i++) { const [a, b, c] = [list[i - 1], list[i], list[i + 1]]; if (!flat(a) || !flat(b) || !flat(c) || a.side !== b.side || b.side !== c.side) continue;
    for (let k = 0; k < 4; k++) { sum += Math.hypot(a.quad[k][0] - 2 * b.quad[k][0] + c.quad[k][0], a.quad[k][1] - 2 * b.quad[k][1] + c.quad[k][1]); count++; } } return count ? Math.round(sum / count * 100) / 100 : 0; };
  const two = (v: number) => Math.round(v * 100) / 100, stands: [number, number][] = []; // the frames where the card stands more than twenty degrees off the felt
  final.forEach((p, i) => { if (Math.abs(cross(p.a, p.u)[1]) > Math.cos(20 * RAD)) return; const last = stands[stands.length - 1]; if (last && last[1] === first + i - 1) last[1] = first + i; else stands.push([first + i, first + i]); });
  return {frames: out, stats: {fran: first, filmkort: [two(share[0]), two(share[1])], ryck: [jerk(frames), two(jerk(out) * MARGIN)], franModellen: two(median(fit)), burna: carried, hojd: Math.round(Math.max(...lift) * 1000) / 10, kant: thin,
    lutar: stands, kring}};
}
