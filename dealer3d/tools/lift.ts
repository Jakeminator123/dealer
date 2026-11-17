// Lays a film's hands and body into the room and writes the deal as numbers the page and the tests read.
//   node dealer3d/tools/lift.ts --marks <landmarks.json from tools/python/landmarks.py> --track <card-track.json> --out dealer3d/data/<name>.json [--to P1.C1]
// Reads both files (and, with --to, placements/default.json, never writing it) and writes one: per frame the card, both
// arms and the 21 points of each hand, in metres (rounded to a tenth of a millimetre). --to moves the read deal to another
// card place of the plan. Prints what it measured: the size of her hands, how far every joint goes, and how the card in
// her fingers agrees with the film's own card.
import {readFile, writeFile} from 'node:fs/promises';
import {TABLE_LENS, filmEye, length, see, sub} from '../../src/table-lens.ts';
import {LIMITS, joints, moved, perform, type Landmarks, type Track} from '../src/capture.ts';
import {spots, type Plan} from '../src/world.ts';
import {sideSeen} from '../src/deal.ts';

const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const marksPath = arg('--marks'), trackPath = arg('--track'), out = arg('--out'), to = arg('--to'); if (!marksPath || !trackPath || !out) throw Error('usage: lift.ts --marks <json> --track <json> --out <json> [--to <place>]');
const marks = JSON.parse(await readFile(marksPath, 'utf8')) as Landmarks, track = JSON.parse(await readFile(trackPath, 'utf8')) as Track, lens = TABLE_LENS, eye = filmEye(lens);
const read = perform(lens, marks, track, {away: arg('--away') ? Number(arg('--away')) : undefined});
const place = to ? spots(JSON.parse(await readFile(new URL('../../placements/default.json', import.meta.url), 'utf8')) as Plan, lens).find(s => s.id === to) : null; if (to && !place) throw Error(`The plan has no place ${to}.`);
const p = place ? moved(lens, read, place.at) : read;
const span = (v: number[]) => `${Math.min(...v).toFixed(0)} till ${Math.max(...v).toFixed(0)}`, f1 = (n: number) => n.toFixed(1), lines: string[] = [];
const unwrap = (v: number[]) => { const o = [v[0]]; for (let i = 1; i < v.length; i++) { let d = v[i] - v[i - 1]; while (d > 180) d -= 360; while (d < -180) d += 360; o.push(o[i - 1] + d); } return o; };

lines.push(`${p.film}${to ? `, flyttad till ${to} (handen svängd ${(p as {swing?: number}).swing?.toFixed(0)}° kring sitt grepp)` : ''}: ${p.frameCount} rutor, ${p.fps} per sekund. Kortet lämnar skon ruta ${p.leavesShoe}, står på kant ruta ${p.edge[0]}–${p.edge[1]}, fälls från ruta ${p.folds}, ligger från ruta ${p.rests}.`);
lines.push(`Handens storlek mot MediaPipes: vänster ${p.handSize.L.toFixed(2)}, höger ${p.handSize.R.toFixed(2)}. Handflatans håll: ${p.palm}.`);
for (const [side, sign] of [['L', p.palm], ['R', -p.palm]] as const) {
  const j = p.moments.map(m => joints(m[side], sign)), twist = unwrap(j.filter(x => x.twist !== null).map(x => x.twist as number)), hand = p.moments.map(m => m[side].points);
  lines.push(`${side === 'L' ? 'Vänster arm (delar)' : 'Höger arm (vilar)'}: armbåge ${span(j.map(x => x.elbow))}° (högst ${LIMITS.elbow}), handled ${span(j.map(x => x.wrist))}° (högst ${LIMITS.wrist}), underarmens vridning ${span(twist)}° (spann ${(Math.max(...twist) - Math.min(...twist)).toFixed(0)}, högst ${LIMITS.twistSpan}), fingerleder ${span(j.flatMap(x => x.fingers.flat()))}° (${-LIMITS.fingerBack} till ${LIMITS.fingerBend}), armen sträckt högst ${Math.max(...j.map(x => x.stretch)).toFixed(3)} gånger (högst ${LIMITS.stretch}).`);
  lines.push(`  handled över filten ${span(hand.map(h => h[0][1] * 1000))} mm, lägsta fingertopp ${span(hand.map(h => Math.min(...[4, 8, 12, 16, 20].map(k => h[k][1])) * 1000))} mm, handled till långfingrets knoge ${span(hand.map(h => length(sub(h[9], h[0])) * 1000))} mm, knogbredd ${span(hand.map(h => length(sub(h[5], h[17])) * 1000))} mm.`);
}
// The card against the film's own card: how far apart their middles are in the picture, and which side the camera sees.
const sides = p.moments.map(m => sideSeen(m.card, eye.position, 6)[0]);
if (!to) { const miss: number[] = []; let agree = 0, counted = 0;
  for (const f of track.frames) { const m = p.moments[f.frame]; if (!m) continue; const seen = sideSeen(m.card, eye.position, 6);
    const pts = f.quad ?? f.edge; if (pts && f.frame >= p.leavesShoe) { const c = see(eye, m.card.centre)!; miss.push(Math.hypot(c.x - pts.reduce((s, q) => s + q[0], 0) / pts.length, c.y - pts.reduce((s, q) => s + q[1], 0) / pts.length)); }
    if (f.side === 'BACK' || f.side === 'FRONT' || f.side === 'EDGE') { counted++; if (f.side === seen || f.side === 'EDGE' || seen === 'EDGE') agree++; } }
  const sorted = [...miss].sort((a, b) => a - b);
  lines.push(`Kortet mot filmens kort: mittpunkterna skiljer ${f1(sorted[sorted.length >> 1])} bildpunkter i mitten, högst ${f1(sorted[sorted.length - 1])}; kameran ser samma sida som spåret i ${agree} av ${counted} rutor.`);
} else { const end = see(eye, p.moments[p.frameCount - 1].card.centre)!; lines.push(`Kortet ligger till slut på bildpunkt ${f1(end.x)}, ${f1(end.y)}; planens ${to} är ${f1(place!.pixel.x)}, ${f1(place!.pixel.y)}.`); }
// How far the card's held short end is from her fingers (the middle of thumb tip and forefinger tip), while she has it and until it lies.
const hold = p.moments.slice(p.leavesShoe + 5, p.rests + 1).map(m => { const end = [0, 1, 2].map(k => m.card.centre[k] + m.card.long[k] * (0.088 / 2 - 0.012)), grip = [0, 1, 2].map(k => (m.L.points[4][k] + m.L.points[8][k]) / 2); return Math.hypot(end[0] - grip[0], end[1] - grip[1], end[2] - grip[2]) * 1000; }).sort((a, b) => a - b);
lines.push(`Kortets hållna ände mot hennes grepp (tumme och pekfinger), från att kortet är ute ur skon tills det ligger: ${f1(hold[hold.length >> 1])} mm i mitten, högst ${f1(hold[hold.length - 1])} mm.`);
lines.push(`Sidan kameran ser, ruta för ruta (B baksida, E kant, F framsida): ${sides.join('')}`);
if (!to) lines.push(`Spårets sidor:                                                        ${track.frames.map(f => f.side === 'FRONT' ? 'F' : f.side === 'BACK' ? 'B' : f.side === 'EDGE' ? 'E' : '-').join('')}`);
console.log(lines.join('\n'));

const r = (v: number[]) => v.map(x => Math.round(x * 10000) / 10000), armOut = (a: (typeof p.moments)[number]['L']) => ({s: r(a.shoulder), e: r(a.elbow), w: r(a.wrist), k: Math.round(a.stretch * 1000) / 1000, p: a.points.map(r)});
await writeFile(out, JSON.stringify({about: 'One deal laid into the room by dealer3d/tools/lift.ts from MediaPipe landmarks and the card track of the film named' + (to ? `, and moved to the card place ${to} of the plan (hand and card as read, arm and body a model)` : '') + '. Metres in the table lens\'s world (x toward image right, y up from the felt, z toward the camera). Per frame: card (c centre, l long side toward the held end, n the way its face looks), L her left arm and hand (the dealing one), R her right: s shoulder, e elbow, w wrist, k how many times the arm is stretched, p the 21 points of the hand in MediaPipe\'s order; h head, and hip once.',
  film: p.film, to: to ?? null, fps: p.fps, frameCount: p.frameCount, leavesShoe: p.leavesShoe, edge: p.edge, folds: p.folds, rests: p.rests, handSize: p.handSize, palm: p.palm, hip: r(p.moments[0].hip),
  frames: p.moments.map(m => ({card: {c: r(m.card.centre), l: r(m.card.long), n: r(m.card.normal)}, L: armOut(m.L), R: armOut(m.R), h: r(m.head)}))}) + '\n');
