// Two or more finished cycles from A2.1 chained into ONE motion the page plays (the format of dealer3d/data/giv-*.json for
// several cards: card.id and laid, as dealer3d/tools/deal-film.ts writes them), in a tempo of its own. Jakob 2026-11-24:
// several cards in one film from A2.1, faster, and the deals and returns cut out of it.
//   node dealer3d/tools/docka-kedja.ts --cykler dealer3d/data/<cykel>.json,dealer3d/data/<cykel>.json[,...] --out dealer3d/data/<ny>.json
//        [--fps 24|30] [--ut 1.3] [--leda 0.3] [--ater 0.8] [--slag 0.4] [--svans 0.125]
// Each cycle (dealer3d/tools/docka-cykel.ts --from A2.1) is retimed piece by piece: its lead at the shoe (to the frame the card
// leaves it) to --leda seconds, the deal from there to the frame the card lies to --ut minus --leda, the hold on the laid card
// as long as it is, and the return to the frame she is back in A2.1 to --ater (never fewer frames). Between two cards she stands
// still in A2.1 for --slag seconds, where a film is cut, and the film ends standing so for --svans.
// Every cycle is read off its own film and begins in its own A2.1; the film stands in the first cycle's. A later cycle eases from
// that pose to its own over its lead, while its card still sits in the shoe, and back to it over its return, once the hand has
// left the card. A laid card lies on (laid), the next card is in her hand at the shoe from the frame she is back (card.id: one
// card leaves the shoe a deal), and her eyes are written per frame (g): on the card until it lies, up toward the players as the
// stage has them (dealer3d/src/stage.ts), and back on the card in the shoe by the time she is back in A2.1.
// Reads only the cycles and writes a new file: the cycles, and the films made of them, stay as they are.
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {fileURLToPath} from 'node:url';
import {filmEye, see, type Vec3} from '../../src/table-lens.ts';
import {filmLens} from '../src/world.ts';
import {axesOf, between, local, placed, type Axes} from '../src/hand-pose.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const USAGE = 'node dealer3d/tools/docka-kedja.ts --cykler <cykel.json>,<cykel.json>[,...] --out dealer3d/data/<ny>.json [--fps 24|30] [--ut 1.3] [--leda 0.3] [--ater 0.8] [--slag 0.4] [--svans 0.125]';
const {values} = parseArgs({options: {cykler: {type: 'string'}, out: {type: 'string'}, fps: {type: 'string'}, ut: {type: 'string'}, leda: {type: 'string'}, ater: {type: 'string'},
  slag: {type: 'string'}, svans: {type: 'string'}, help: {type: 'boolean'}}});
const fail = (why: string): never => { console.error(why); process.exit(1); };
if (values.help) { console.log(USAGE); process.exit(0); }
if (!values.cykler || !values.out) fail(USAGE);
const seconds = (v: string | undefined, fallback: number, flag: string) => { if (v === undefined) return fallback; const n = Number(v); if (!v.trim() || !Number.isFinite(n) || n < 0) fail(`${flag} ska vara sekunder, 0 eller mer.`); return n; };
const FPS = values.fps === undefined ? 24 : values.fps === '24' || values.fps === '30' ? Number(values.fps) : fail('--fps ska vara 24 eller 30.');
const tempo = {ut: seconds(values.ut, 1.3, '--ut'), leda: seconds(values.leda, 0.3, '--leda'), ater: seconds(values.ater, 0.8, '--ater'), slag: seconds(values.slag, 0.4, '--slag'), svans: seconds(values.svans, 0.125, '--svans')};
if (tempo.leda <= 0 || tempo.leda >= tempo.ut) fail('--leda ska vara över 0 och kortare än --ut.');
if (tempo.ater <= 0) fail('--ater ska vara över 0.');

type Limb = {s: Vec3; e: Vec3; w: Vec3; k?: number; p: Vec3[]};
type Card = {c: Vec3; l: Vec3; n: Vec3; id?: number};
type Frame = {card: Card; L: Limb; R: Limb; h: Vec3; g?: Vec3};
type Cycle = {about?: string; film?: string; to?: string[]; hand?: string; shoe?: string; fps: number; frameCount: number; leavesShoe: number; edge: number[]; folds: number; rests: number;
  handSize?: unknown; palm?: number; throughShoe?: number; hip: number[]; doll?: string; frames: Frame[]; cycle?: {holdThrough: number; readyFrom: number}; made?: {from?: string; place?: string; clip?: string}};

const rel = (p: string) => path.relative(ROOT, path.resolve(ROOT, p)).split(path.sep).join('/');
const files = values.cykler!.split(',').map(s => s.trim()).filter(Boolean);
if (files.length < 2) fail('--cykler ska ha två cykler eller fler, med komma emellan.');
const sources: Record<string, string> = {}, cycles: Cycle[] = [];
for (const f of files) { const b = await readFile(path.resolve(ROOT, f)); sources[rel(f)] = createHash('sha256').update(b).digest('hex'); cycles.push(JSON.parse(b.toString('utf8').replace(/^\uFEFF/, ''))); }

const mm = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 1000;
const mix = (a: number[], b: number[], t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const plus = (a: number[], d: number[], t: number): Vec3 => [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t];
const minus = (a: number[], b: number[]): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const unit = (v: number[]): Vec3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
const r4 = (v: number[]) => v.map(x => Math.round(x * 1e4) / 1e4) as Vec3;
const limbPoints = (l: Limb) => [l.s, l.e, l.w, ...l.p];
const eye = filmEye(filmLens()), px = (a: number[], b: number[]) => { const s = see(eye, a as Vec3), t = see(eye, b as Vec3); return s && t ? Math.hypot(s.x - t.x, s.y - t.y) : Infinity; };

// What the cycles must share to be one film: the doll, the hip, the card in the shoe; each from A2.1, back in its own first pose.
const first = cycles[0], start = first.frames[0], shoeCard = start.card;
cycles.forEach((m, i) => {
  const name = files[i], c = m.cycle;
  if (m.made?.from !== 'A2.1') fail(`${name}: ingen cykel från A2.1 (dealer3d/tools/docka-cykel.ts --from A2.1).`);
  if (!c || !Number.isInteger(c.holdThrough) || !Number.isInteger(c.readyFrom)) fail(`${name}: saknar återgången (cycle.holdThrough, cycle.readyFrom).`);
  if (m.frameCount !== m.frames.length || !(0 < m.leavesShoe && m.leavesShoe < m.rests && m.rests <= c!.holdThrough && c!.holdThrough < c!.readyFrom && c!.readyFrom < m.frameCount)) fail(`${name}: rutorna går inte i ordning (lämnar skon, ligger, hålls, åter).`);
  if (m.doll !== first.doll) fail(`${name}: dockan ${m.doll}, den första cykelns ${first.doll}.`);
  if (JSON.stringify(m.hip) !== JSON.stringify(first.hip)) fail(`${name}: höften står inte där den första cykelns står.`);
  if (mm(m.frames[0].card.c, shoeCard.c) > 0.5) fail(`${name}: kortet i skon står ${mm(m.frames[0].card.c, shoeCard.c).toFixed(1)} mm från den första cykelns.`);
  const back = m.frames[c!.readyFrom], own = m.frames[0];
  const open = Math.max(mm(back.h, own.h), ...(['R', 'L'] as const).flatMap(s => limbPoints(back[s]).map((p, j) => mm(p, limbPoints(own[s])[j]))));
  if (open > 1) fail(`${name}: återgången når inte cykelns första ställning (${open.toFixed(1)} mm ifrån i ruta ${c!.readyFrom}).`);
});

// A hand is moved whole: its wrist, its turn (dealer3d/src/hand-pose.ts axes) and its fingers' shape against them, so that no
// bone grows or shrinks between two poses (point by point, the bones of a hand turning fast came up to 4 mm short).
const SIGN = {R: 1, L: -1} as const;
const handMix = (pa: Vec3[], pb: Vec3[], k: number, sign: number): Vec3[] => {
  if (k <= 0) return pa; const A = axesOf(pa, sign), B = axesOf(pb, sign), la = local(pa, A);
  return placed(reshaped(la, la, local(pb, B), k), between(A, B, k), mix(pa[0], pb[0], k));
};
/** A cycle at a fractional frame. */
const sample = (m: Cycle, at: number): Frame => {
  const i = Math.min(m.frameCount - 2, Math.max(0, Math.floor(at))), k = Math.min(1, Math.max(0, at - i)), a = m.frames[i], b = m.frames[i + 1];
  const limb = (x: Limb, y: Limb, sign: number): Limb => { const p = handMix(x.p, y.p, k, sign); return {s: mix(x.s, y.s, k), e: mix(x.e, y.e, k), w: p[0], ...(x.k !== undefined ? {k: x.k} : {}), p}; };
  const bl = dot(a.card.l, b.card.l) < 0 ? b.card.l.map(x => -x) : b.card.l, long = unit(mix(a.card.l, bl, k)), toward = mix(a.card.n, b.card.n, k), d = dot(toward, long);
  return {card: {c: mix(a.card.c, b.card.c, k), l: long, n: unit([toward[0] - long[0] * d, toward[1] - long[1] * d, toward[2] - long[2] * d])}, L: limb(a.L, b.L, SIGN.L), R: limb(a.R, b.R, SIGN.R), h: mix(a.h, b.h, k)};
};
/** From a cycle's own first pose to the film's (the first cycle's): the shoulder, elbow and head as steps, the hand as a step of its wrist, a turn, and each bone turned from its way in the one shape to its way in the other. */
type HandShift = {from: Axes; to: Axes; own: Vec3[]; film: Vec3[]; wrist: Vec3; s: Vec3; e: Vec3};
type Shift = {R: HandShift; L: HandShift; h: Vec3};
const handShift = (own: Limb, film: Limb, sign: number): HandShift => {
  const A = axesOf(own.p, sign), B = axesOf(film.p, sign);
  return {from: A, to: B, own: local(own.p, A), film: local(film.p, B), wrist: minus(film.p[0], own.p[0]), s: minus(film.s, own.s), e: minus(film.e, own.e)};
};
const PARENT = [-1, 0, 1, 2, 3, 0, 5, 6, 7, 0, 9, 10, 11, 0, 13, 14, 15, 0, 17, 18, 19]; // the 21 points of a hand, each from the one it hangs on
const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const turnedAbout = (v: Vec3, axis: Vec3, angle: number): Vec3 => { const c = Math.cos(angle), s = Math.sin(angle), kv = dot(axis, v), kxv = cross3(axis, v); return [0, 1, 2].map(i => v[i] * c + kxv[i] * s + axis[i] * kv * (1 - c)) as Vec3; };
/** A shape (local) with a share of each bone's turn from `from` to `to`, every bone as long as it was. */
const reshaped = (shape: Vec3[], from: Vec3[], to: Vec3[], share: number): Vec3[] => {
  const out: Vec3[] = [shape[0]];
  for (let j = 1; j < shape.length; j++) {
    const p = PARENT[j], bone = minus(shape[j], shape[p]), a = unit(minus(from[j], from[p])), b = unit(minus(to[j], to[p])), axis = cross3(a, b), sin = Math.hypot(axis[0], axis[1], axis[2]);
    out[j] = plus(out[p], sin < 1e-9 ? bone : turnedAbout(bone, unit(axis), Math.atan2(sin, dot(a, b)) * share), 1);
  }
  return out;
};
const shiftTo = (m: Cycle): Shift => ({R: handShift(m.frames[0].R, start.R, SIGN.R), L: handShift(m.frames[0].L, start.L, SIGN.L), h: minus(start.h, m.frames[0].h)});
/** v turned as the axes `from` are turned into `to`. */
const turn = (from: Axes, to: Axes, v: Vec3): Vec3 => { const x = dot(v, from.forward), y = dot(v, from.palm), z = dot(v, from.across); return [0, 1, 2].map(i => to.forward[i] * x + to.palm[i] * y + to.across[i] * z) as Vec3; };
const shiftLimb = (l: Limb, d: HandShift, share: number, sign: number): Limb => {
  if (share <= 0) return l;
  const A = axesOf(l.p, sign), full: Axes = {forward: turn(d.from, d.to, A.forward), palm: turn(d.from, d.to, A.palm), across: turn(d.from, d.to, A.across)};
  const p = placed(reshaped(local(l.p, A), d.own, d.film, share), between(A, full, share), plus(l.p[0], d.wrist, share));
  return {...l, s: plus(l.s, d.s, share), e: plus(l.e, d.e, share), w: p[0], p};
};
const shifted = (f: Frame, d: Shift, share: number): Frame => ({...f, R: shiftLimb(f.R, d.R, share, SIGN.R), L: shiftLimb(f.L, d.L, share, SIGN.L), h: plus(f.h, d.h, share)});
const players = (h: Vec3): Vec3 => [h[0], h[1] - 0.25, h[2] + 1.2]; // where the stage has her look up to once the card lies

const n = {lead: Math.max(1, Math.round(tempo.leda * FPS)), deal: Math.max(1, Math.round((tempo.ut - tempo.leda) * FPS)), back: Math.max(1, Math.ceil(tempo.ater * FPS - 1e-9)), beat: Math.round(tempo.slag * FPS), tail: Math.max(1, Math.round(tempo.svans * FPS))};
type Out = Frame & {card: Card & {id: number}; g: Vec3};
const frames: Out[] = [], laid: {from: number; c: Vec3; l: Vec3; n: Vec3}[] = [], still: {from: number; through: number}[] = [];
const cards: {to: string; film: string | undefined; cycle: string; frames: Record<string, number>; seconds: {out: number; hold: number; back: number}; restMm: number}[] = [];
const standing = (id: number): Out => ({card: {c: shoeCard.c, l: shoeCard.l, n: shoeCard.n, id}, L: start.L, R: start.R, h: start.h, g: shoeCard.c});

cycles.forEach((m, k) => {
  const c = m.cycle!, hold = Math.max(1, Math.round((c.holdThrough - m.rests) / m.fps * FPS)), lands = n.lead + n.deal, held = lands + hold, N = held + n.back;
  const knots: [number, number][] = [[0, 0], [n.lead, m.leavesShoe], [lands, m.rests], [held, c.holdThrough], [N, c.readyFrom]];
  const sourceAt = (f: number) => { for (let i = 1; i < knots.length; i++) if (f <= knots[i][0]) { const [f0, s0] = knots[i - 1], [f1, s1] = knots[i]; return s0 + (s1 - s0) * (f - f0) / (f1 - f0); } return c.readyFrom; };
  const outAt = (s: number) => { for (let i = 1; i < knots.length; i++) if (s <= knots[i][1]) { const [f0, s0] = knots[i - 1], [f1, s1] = knots[i]; return Math.round(f0 + (f1 - f0) * (s - s0) / (s1 - s0)); } return N; };
  const d = shiftTo(m), begin = frames.length, rest = m.frames[m.frameCount - 1].card, after = (N - lands) / FPS, up = Math.min(0.65, 0.6 * after);
  for (let f = 0; f < N; f++) {
    const w = f <= n.lead ? 1 - smooth(f / n.lead) : f >= held ? smooth((f - held) / n.back) : 0, s = shifted(sample(m, sourceAt(f)), d, w), t = (f - lands) / FPS;
    const g = t <= 0 ? s.card.c : t <= up ? mix(s.card.c, players(s.h), 0.75 * smooth(t / up)) : mix(mix(s.card.c, players(s.h), 0.75), shoeCard.c, smooth((t - up) / (after - up)));
    frames.push({...s, card: {...s.card, id: k}, g});
  }
  laid.push({from: frames.length, c: rest.c, l: rest.l, n: rest.n});
  cards.push({to: m.to?.[0] ?? m.made?.place ?? '?', film: m.film, cycle: rel(files[k]),
    frames: {start: begin, leavesShoe: begin + n.lead, edgeFrom: begin + outAt(m.edge[0]), edgeTo: begin + outAt(m.edge[1]), folds: begin + outAt(m.folds), rests: begin + lands, holdThrough: begin + held, back: begin + N},
    seconds: {out: lands / FPS, hold: hold / FPS, back: n.back / FPS}, restMm: Math.round(mm(sample(m, m.rests).card.c, rest.c) * 10) / 10});
  const count = k < cycles.length - 1 ? n.beat : n.tail;
  if (count) still.push({from: frames.length, through: frames.length + count - 1});
  for (let i = 0; i < count; i++) frames.push(standing(k + 1));
});

// Checks: one card leaves the shoe a deal and never comes back to it; the still beats as the film camera sees them.
const away = (f: Out) => mm(f.card.c, shoeCard.c) > 5;
for (let id = 0; id <= cycles.length; id++) {
  const run = frames.filter(f => f.card.id === id), leaves = run.filter((f, i) => i > 0 && away(f) && !away(run[i - 1])).length, back = run.filter((f, i) => i > 0 && !away(f) && away(run[i - 1])).length;
  if (id < cycles.length ? leaves !== 1 || back !== 0 || away(run[0]) : run.some(away)) fail(`Kort ${id + 1}: lämnar skon ${leaves} gånger och kommer tillbaka ${back} gånger (ska vara 1 och 0${id === cycles.length ? '; det sista sitter kvar i handen' : ''}).`);
}
const off = (a: Out, b: Out) => Math.max(px(a.h, b.h), px(a.card.c, b.card.c), ...(['R', 'L'] as const).flatMap(s => limbPoints(a[s]).map((p, j) => px(p, limbPoints(b[s])[j]))));
const within = still.map(r => { let through = r.through; while (through + 1 < frames.length && off(frames[through + 1], frames[0]) <= 2) through++;
  return {...r, stillThrough: through, mostPx: Math.max(...frames.slice(r.from, through + 1).map(f => off(f, frames[0])))}; });

const out = values.out!, places = cards.map(c => c.to).join(', '), doll = first.doll === 'paow' ? 'Paow' : 'Standarddockan', duration = frames.length / FPS;
const about = `${doll}, från A2.1 ${cards.length} kort i en film (${places}), ut och åter i A2.1 per kort i egen takt: ut ${tempo.ut} s, åter ${(n.back / FPS).toFixed(2)} s, stilla ${(n.beat / FPS).toFixed(2)} s i A2.1 mellan korten, där filmen klipps. Kedjad ur ${cards.map(c => c.cycle).join(' och ')}. Skriven av dealer3d/tools/docka-kedja.ts; filmas med render-reference.ts --seconds ${duration} --fps ${FPS}.`;
const c0 = cards[0].frames;
const motion = {about, film: first.film, films: cards.map(c => c.film), to: cards.map(c => c.to), hand: first.hand, shoe: first.shoe, loose: 0, fps: FPS, frameCount: frames.length,
  leavesShoe: c0.leavesShoe, edge: [c0.edgeFrom, c0.edgeTo], folds: c0.folds, rests: c0.rests, handSize: first.handSize, palm: first.palm, throughShoe: Math.max(...cycles.map(m => m.throughShoe ?? 0)), hip: first.hip, doll: first.doll,
  laid: laid.map(l => ({from: l.from, c: r4(l.c), l: r4(l.l), n: r4(l.n)})), kedja: {cards, still: within.map(w => ({from: w.from, through: w.through, stillThrough: w.stillThrough, mostPx: Math.round(w.mostPx * 100) / 100})), tempo, frames: n},
  made: {tool: 'dealer3d/tools/docka-kedja.ts', cycles: cards.map(c => c.cycle), tempo, fps: FPS, sources},
  frames: frames.map(f => ({card: {c: r4(f.card.c), l: r4(f.card.l), n: r4(f.card.n), id: f.card.id}, L: {...f.L, s: r4(f.L.s), e: r4(f.L.e), w: r4(f.L.w), p: f.L.p.map(r4)}, R: {...f.R, s: r4(f.R.s), e: r4(f.R.e), w: r4(f.R.w), p: f.R.p.map(r4)}, h: r4(f.h), g: r4(f.g)}))};
await writeFile(path.resolve(ROOT, out), JSON.stringify(motion) + '\n', {flag: 'wx'});

console.log(`skrev ${rel(out)}: ${frames.length} rutor à ${FPS}/s (${duration.toFixed(3)} s), ${cards.length} kort`);
for (const [i, c] of cards.entries()) console.log(`kort ${i + 1} till ${c.to} (${c.cycle}): ut ruta ${c.frames.start}-${c.frames.rests} (${c.seconds.out.toFixed(2)} s, lämnar skon ${c.frames.leavesShoe}), hålls till ${c.frames.holdThrough}, åter till ${c.frames.back} (${c.seconds.back.toFixed(2)} s); kortet ligger kvar från ruta ${laid[i].from}`);
for (const w of within) console.log(`stilla ruta ${w.from}-${w.through}, inom 2 px från startrutan t.o.m. ruta ${w.stillThrough} (${w.stillThrough - w.from + 1} rutor, högst ${w.mostPx.toFixed(2)} px: händer, huvud och kortet i handen)`);
const name = path.basename(out, '.json');
console.log(`rendera: node dealer3d/tools/render-reference.ts --motion ${rel(out)} --out D:/dealer-scratch/tmp/dealer-3d/ut/${name} --seconds ${duration} --fps ${FPS}`);
