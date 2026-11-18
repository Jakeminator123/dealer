// The two-hand deal from pose 2.3 as numbers the page plays (the format of dealer3d/data/giv-*.json), laid by
// dealer3d/src/two-hand.ts in a real dealer's tempo (dealer3d/src/real-deal.ts).
//   node dealer3d/tools/deal-film.ts --to P4.C1 --seconds 3 --out dealer3d/data/giv-fran-2-3-p4.json
//   node dealer3d/tools/deal-film.ts --to all --seconds 8 --lead 27 --out dealer3d/data/giv-fran-2-3-alla.json
//   node dealer3d/tools/deal-film.ts --to P5.C1 --seconds 3 --right-at 1180,887,83 --out dealer3d/data/giv-fran-2-3-p5.json
//   node dealer3d/tools/deal-film.ts --to P5.C1 --seconds 3 --right-at 1180,887,83 --beats 5.5,17.5,22.5,34.5,37.5,48.8,54.5,66.5 --out dealer3d/data/giv-fran-2-3-p5-langsam.json
// --to: one place of the plan (it takes the real moments of the seat that lies as it does: P4 takes S4's), or "all": the
//   seven seats in the order a dealer deals them (seat 7, at her left by the shoe, first) and then her own card.
// --right-at: the film begins with her right hand where the approved anchor picture has it (dealer3d/src/two-hand.ts, startOnAnchor).
// --lead: the frame on which her left fingers "lie on the first card" (the film stands in pose 2.3 until the card moves).
// Reads dealer3d/data/till-ankare-2-3.json (its last frame is where this film begins) and placements/default.json.
// Prints the beats, what each card asks of the body, and what to look for before a film is made of it.
import {readFile, writeFile} from 'node:fs/promises';
import {CARD, TABLE_LENS, filmEye, length, see, sub, cross, type Vec3} from '../../src/table-lens.ts';
import {spots} from '../src/world.ts';
import {LIMITS, joints, type ArmPose} from '../src/capture.ts';
import {sideSeen} from '../src/deal.ts';
import {REAL_DEAL} from '../src/real-deal.ts';
import {TWO_HAND, shoeHolds, startOnAnchor, twoHandDeal, type Limb, type Pace, type Place, type Still} from '../src/two-hand.ts';
import type {RealCard} from '../src/real-deal.ts';

const arg = (name: string, fallback?: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const out = arg('--out'), to = arg('--to'); if (!out || !to) throw Error('usage: deal-film.ts --to <P4.C1 | all> --seconds <n> [--lead <frames>] --out <json>');
const FPS = 30, N = Math.round(Number(arg('--seconds', '3')) * FPS), own = arg('--beats')?.split(',').map(Number) ?? null, lead = own ? 0 : Number(arg('--lead', '2')), lens = TABLE_LENS, eye = filmEye(lens);
if (own && (own.length !== 8 || to === 'all' || to.includes(','))) throw Error('--beats takes eight frames (b,c,d,e,l,f,g,h) and one place');
const pose = JSON.parse(await readFile(new URL('../data/till-ankare-2-3.json', import.meta.url), 'utf8')), plan = JSON.parse(await readFile(new URL('../../placements/default.json', import.meta.url), 'utf8'));
const last = pose.frames[pose.frameCount - 1], all = spots(plan, lens), spot = (id: string) => { const s = all.find(s => s.id === id); if (!s) throw Error(`The plan has no place ${id}.`); return s.at; };
// The real dealer's S1 is the seat at her left, by the shoe: the plan's seat 7. Her own card is the plan's D.C1.
const realOf = (id: string) => { const m = /^P([1-7])\.C1$/.exec(id); return REAL_DEAL[id === 'D.C1' ? 7 : m ? 7 - Number(m[1]) : -1] ?? (() => { throw Error(`No real card to take the moments of for ${id}.`); })(); };
// --beats: the film's own moments in frames, for a film slower than the real dealer (b,c,d,e,l,f,g,h as in dealer3d/src/real-deal.ts; a is frame 0). Where the hands
// change is still the real card's; the card does not stand still between being stood up and falling, and the left hand goes back to the shoe as much slower as the film is.
const paced = (r: RealCard): {real: RealCard; pace: Pace} => { if (!own) return {real: r, pace: {}}; const [b, c, d, e, l, f, g, h] = own.map(x => x / FPS), slower = (h - b) / (Math.max(r.h, r.g + TWO_HAND.settle) - r.b);
  return {real: {...r, a: 0, b, c, d, e, l, f, g, h, i: h + 0.2}, pace: {flowing: true, leftBack: Math.round(TWO_HAND.leftBack * slower * 1000) / 1000}}; };
const ids = to === 'all' ? ['P7.C1', 'P6.C1', 'P5.C1', 'P4.C1', 'P3.C1', 'P2.C1', 'P1.C1', 'D.C1'] : to.split(','), places: Place[] = ids.map(id => ({id, at: spot(id), real: paced(realOf(id)).real})), pace = paced(realOf(ids[0])).pace;
// --right-at: her right hand as the approved anchor picture has it, where that differs from the pose film (the middle fingertip's pixel in the bank's picture, and the way the hand points).
const rightAt = arg('--right-at')?.split(',').map(Number) ?? null, posed: Still = {L: last.L, R: last.R, h: last.h}, start = rightAt ? startOnAnchor(lens, posed, {x: rightAt[0], y: rightAt[1]}, rightAt[2]) : posed;
// A film in its own tempo ends on the picture the film in the real tempo ends on: that film is laid first, for its elbows.
if (own) { const real = twoHandDeal(lens, start, ids.map(id => ({id, at: spot(id), real: realOf(id)})), 2, FPS, N).frames[N - 1]; pace.elbows = {L: real.L.e, R: real.R.e}; }
const deal = twoHandDeal(lens, start, places, lead, FPS, N, pace), {frames, beats} = deal;

// ---- what it asks, and what to look for --------------------------------------------------------------------------
const f3 = (v: number[]) => '(' + v.map(n => n.toFixed(3)).join(', ') + ')', s2 = (frame: number) => `${frame.toFixed(1)} (${(frame / FPS).toFixed(2)} s)`, armOf = (a: Limb): ArmPose => ({shoulder: a.s, elbow: a.e, wrist: a.w, stretch: a.k, points: a.p});
const unwrap = (v: number[]) => { const o = [v[0]]; for (let i = 1; i < v.length; i++) { let d = v[i] - v[i - 1]; while (d > 180) d -= 360; while (d < -180) d += 360; o.push(o[i - 1] + d); } return o; };
const tipAt = see(eye, start.R.p[12])!, lines: string[] = [`${ids.join(', ')}: ${N} rutor, ${FPS} per sekund, ${(N / FPS).toFixed(1)} s. Stilla i pose 2.3 till ruta ${beats[0].b.toFixed(1)}; allt ligger still från ruta ${Math.ceil(Math.max(beats[beats.length - 1].h, beats[beats.length - 1].l + 9)) + 4}.`];
for (const [k, b] of beats.entries()) { const c = deal.cards[k];
  lines.push(`${b.to}: kortet börjar ut ${s2(b.b)}, ute ${s2(b.c)}, höger hand tar ${s2(b.d)}, står på kant ${s2(b.e)}, vänster släpper ${s2(b.l)}, vändningen klar ${s2(b.turned)}, tar i filten ${s2(b.g)}, ligger ${s2(b.h)}${b.i === null ? '' : ', höger släpper ' + s2(b.i)}.`,
    `   handbytet ${f3(c.take)}, ${(length(sub(c.take, deal.made.mouth)) * 100).toFixed(0)} cm från mynningens mitt; vänster släpper vid ${f3(c.go)}; kortet ligger ${f3(c.centre)}, fingertopparna ${f3(c.grip)}; handen pekar ${c.handYaw.toFixed(0)}° (0 = mot spelarna, 90 = åt bildens höger); kroppen ger ${(c.bodyShare * 100).toFixed(0)} % av sitt tillägg; vändningen i luften ${c.turn.angle.toFixed(0)}° kring ${f3(c.turn.axis)}; vänster hand vriden ${c.left.swing.toFixed(0)}°, tippad ${c.left.tilt.toFixed(0)}°.`); }
const asked: Record<string, {wrist: number; elbow: number[]; twist: number; fingers: number[]; far: number}> = {};
for (const [side, sign] of [['L', -1], ['R', 1]] as const) { const j = frames.map(f => joints(armOf(f[side]), sign)), twist = unwrap(j.map(x => x.twist).filter(v => v !== null) as number[]), bends = j.flatMap(x => x.fingers.flat());
  asked[side] = {wrist: Math.max(...j.map(x => x.wrist)), elbow: [Math.min(...j.map(x => x.elbow)), Math.max(...j.map(x => x.elbow))], twist: Math.max(...twist) - Math.min(...twist), fingers: [Math.min(...bends), Math.max(...bends)], far: Math.max(...frames.map(f => length(sub(f[side].w, f[side].s))))}; }
for (const [side, name] of [['L', 'Vänster'], ['R', 'Höger']] as const) { const a = asked[side]; lines.push(`${name} arm: handled högst ${a.wrist.toFixed(0)}° (gräns ${LIMITS.wrist}), armbåge ${a.elbow.map(n => n.toFixed(0)).join('–')}° (gräns ${LIMITS.elbow}), underarmens vridning ${a.twist.toFixed(0)}° (gräns ${LIMITS.twistSpan}), fingerleder ${a.fingers.map(n => n.toFixed(0)).join(' till ')}° (gräns −${LIMITS.fingerBack} till ${LIMITS.fingerBend}), som längst ${(a.far * 100).toFixed(0)} cm från axeln (armen 55).`); }
const inside = shoeHolds(lens), mixed = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const through = frames.map((f, i) => f.R.p.some(inside) || [0.2, 0.4, 0.6, 0.8].some(t => inside(mixed(f.R.e, f.R.w, t))) ? i : -1).filter(i => i >= 0);
const nearest = frames.map((f, i) => ({i, d: Math.min(...f.R.p.flatMap(p => f.L.p.map(q => length(sub(p, q)))))})).reduce((m, x) => x.d < m.d ? x : m);
const cardOf = (f: typeof frames[number]) => ({centre: f.card.c, long: f.card.l, normal: f.card.n, across: cross(f.card.n, f.card.l)}), lowest = Math.min(...frames.map(f => { const c = cardOf(f); return c.centre[1] - CARD.height / 2 * Math.abs(c.long[1]) - CARD.width / 2 * Math.abs(c.across[1]); }));
const sides = frames.map(f => sideSeen(cardOf(f), eye.position, 0)), seen: string[] = []; frames.forEach((f, i) => { if (i === 0 || f.card.id !== frames[i - 1].card.id) seen.push(`${beats[f.card.id].to}:`); if (i > 0 && f.card.id === frames[i - 1].card.id && sides[i] !== sides[i - 1]) seen.push(`${sides[i] === 'FRONT' ? 'framsidan' : 'baksidan'} från ruta ${i}`); });
const lowestPoint = Math.min(...frames.flatMap(f => [...f.L.p, ...f.R.p].map(p => p[1]))), endAt = see(eye, frames[N - 1].card.c)!;
if (rightAt) lines.push(`Höger hand lagd på ankarets: långfingrets topp på bildpunkt (${tipAt.x.toFixed(0)}, ${tipAt.y.toFixed(0)}), handen pekar ${rightAt[2]}°; handleden flyttad ${(length(sub(start.R.w, posed.R.w)) * 100).toFixed(1)} cm från posfilmens, nu ${f3(start.R.w)}.`);
lines.push(deal.forced.length ? `ARMBÅGEN HAR INGEN FRI PLATS (kropp, bord eller sko i vägen) i ${deal.forced.join(' ')}: se på de rutorna.` : 'Armbågarna har en fri plats i varje ruta (inte i kroppen, bordet eller skon).');
for (const [k, b] of beats.entries()) { const mine = frames.map((f, i) => f.card.id === k ? i : -1).filter(i => i >= 0), span = (list: number[]) => list.length ? (list[0] === list[list.length - 1] ? `ruta ${list[0]}` : `ruta ${list[0]}–${list[list.length - 1]}`) : 'ingen ruta';
  const toEye = (i: number) => { const c = cardOf(frames[i]), d = sub(eye.position, c.centre), n = length(d); return Math.asin((c.normal[0] * d[0] + c.normal[1] * d[1] + c.normal[2] * d[2]) / n) * 180 / Math.PI; }; // degrees the face is turned toward the camera: 0 on edge, negative the back
  const stands = mine.filter(i => i > b.d && frames[i].card.l[1] < -Math.cos(25 * Math.PI / 180)), edge = mine.filter(i => i > b.d && i < b.h && Math.abs(toEye(i)) < 12), blue = mine.filter(i => toEye(i) >= 12), still = mine.filter(i => i >= b.h);
  lines.push(`${b.to}, vad bankens kamera ser: kortet står rest (inom 25° från lodrätt) ${span(stands)}; på kant mot kameran (inom 12°) ${span(edge)}; framsidan (blått) från ruta ${blue[0]}; ligger still från ruta ${still[0]}. Största vridning mellan två rutor från handbytet tills det ligger: ${Math.max(...mine.filter(i => i > b.d && i <= b.h + 1).map(i => { const a = cardOf(frames[i - 1]), c = cardOf(frames[i]); return Math.acos(Math.min(1, (a.long[0] * c.long[0] + a.long[1] * c.long[1] + a.long[2] * c.long[2] + a.normal[0] * c.normal[0] + a.normal[1] * c.normal[1] + a.normal[2] * c.normal[2] + a.across[0] * c.across[0] + a.across[1] * c.across[1] + a.across[2] * c.across[2] - 1) / 2)) * 180 / Math.PI; })).toFixed(0)}°, minsta ${Math.min(...mine.filter(i => i > b.d + 1 && i < b.g).map(i => { const a = cardOf(frames[i - 1]), c = cardOf(frames[i]); return Math.acos(Math.min(1, (a.long[0] * c.long[0] + a.long[1] * c.long[1] + a.long[2] * c.long[2] + a.normal[0] * c.normal[0] + a.normal[1] * c.normal[1] + a.normal[2] * c.normal[2] + a.across[0] * c.across[0] + a.across[1] * c.across[1] + a.across[2] * c.across[2] - 1) / 2)) * 180 / Math.PI; })).toFixed(1)}° (0 vore ett kort som står stilla).`); }
lines.push(`Höger hand eller underarm inne i skon: ${through.length ? 'ruta ' + through.join(' ') : 'aldrig'}. Händerna som närmast varandra ${(nearest.d * 1000).toFixed(0)} mm (ruta ${nearest.i}). Lägsta punkt av en hand ${(lowestPoint * 1000).toFixed(0)} mm över filten, av kortet ${(lowest * 1000).toFixed(1)} mm.`,
  `Bankens kamera ser: ${seen.join(' ')}.`, `Sista kortet ligger på bildpunkt (${endAt.x.toFixed(1)}, ${endAt.y.toFixed(1)}).`);
console.log(lines.join('\n'));

const r4 = (v: number[]) => v.map(x => Math.round(x * 10000) / 10000), limb = (a: Limb) => ({s: r4(a.s), e: r4(a.e), w: r4(a.w), k: 1, p: a.p.map(r4)}), r1 = (x: number | null) => x === null ? null : Math.round(x * 10) / 10;
const turnsAt = (k: number) => { const i = frames.findIndex((f, j) => j > 0 && f.card.id === k && frames[j - 1].card.id === k && sides[j] !== sides[j - 1]); return i < 0 ? Math.round(beats[k].turned) : i; };
await writeFile(out, JSON.stringify({about: 'The two-hand deal from pose 2.3, laid by dealer3d/tools/deal-film.ts (dealer3d/src/two-hand.ts). A model in a real dealer\'s tempo: the moments of each card and where the hands change are read off a film of a real dealer (dealer3d/src/real-deal.ts), the hands\' shapes and the start are the pose film\'s, everything between is drawn. Same frame and fields as the read deals; card.id says which card is in play, laid lists the cards that lie and from which frame, beats the moments of every card in frames.',
  film: 'tvahandsgiv-modell', pose: 'from-2.3', pace: own ? {real: places[0].real, ...pace} : null, rightAt: rightAt ? {x: rightAt[0], y: rightAt[1], yaw: rightAt[2]} : null, to: ids, loose: 0, fps: FPS, frameCount: N, leavesShoe: Math.round(beats[0].c), edge: [turnsAt(0), turnsAt(0)], folds: Math.round(beats[0].g), rests: Math.ceil(beats[0].h), handSize: pose.handSize, palm: pose.palm, throughShoe: through.length, elbowForced: deal.forced, hip: pose.hip,
  beats: beats.map(b => ({to: b.to, a: r1(b.a), b: r1(b.b), c: r1(b.c), d: r1(b.d), e: r1(b.e), l: r1(b.l), turned: r1(b.turned), f: r1(b.f), g: r1(b.g), h: r1(b.h), i: r1(b.i)})), turns: deal.cards.map(c => ({axis: r4(c.turn.axis), angle: Math.round(c.turn.angle * 10) / 10})),
  laid: deal.laid.map(c => ({from: c.from, c: r4(c.c), l: r4(c.l), n: r4(c.n)})), frames: frames.map(f => ({card: {c: r4(f.card.c), l: r4(f.card.l), n: r4(f.card.n), id: f.card.id}, L: limb(f.L), R: limb(f.R), h: r4(f.h), g: r4(f.g)}))}) + '\n');
