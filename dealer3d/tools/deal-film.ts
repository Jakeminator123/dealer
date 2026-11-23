// The two-hand deal from pose 2.3 as numbers the page plays (the format of dealer3d/data/giv-*.json), laid by
// dealer3d/src/two-hand.ts in a real dealer's tempo (dealer3d/src/real-deal.ts).
//   node dealer3d/tools/deal-film.ts --to P4.C1 --seconds 3 --out dealer3d/data/giv-fran-2-3-p4.json
//   node dealer3d/tools/deal-film.ts --to all --seconds 8 --lead 27 --out dealer3d/data/giv-fran-2-3-alla.json
//   node dealer3d/tools/deal-film.ts --to P5.C1 --seconds 3 --right-at 1180,887,83 --out dealer3d/data/giv-fran-2-3-p5.json
//   node dealer3d/tools/deal-film.ts --to P5.C1 --seconds 3 --right-at 1180,887,83 --beats 5.5,17.5,22.5,34.5,37.5,48.8,54.5,66.5 --out dealer3d/data/giv-fran-2-3-p5-langsam.json
// --to: one place of the plan (it takes the real moments of the seat that lies as it does: P4 takes S4's, and a seat's second
//   card, with --contact-grip sweep or at P4.C2 landing, its first card's), or "all": the
//   seven seats in the order a dealer deals them (seat 7, at her left by the shoe, first) and then her own card.
// --right-at: the film begins with her right hand where the approved anchor picture has it (dealer3d/src/two-hand.ts, startOnAnchor).
// --lead: the frame on which her left fingers "lie on the first card" (the film stands in pose 2.3 until the card moves).
// --pose-film <name>: the film begins on the last frame of dealer3d/data/<name>.json instead (till-ankare-2-3-c: the upright
//   pose), her trunk as that film has it (its `body`) and her eyes where it left them. --take-at x,y: the pixel of the bank's
//   picture where her right fingertips take the card, when that is not where her hand lies at the start. --lean-from <frame>:
//   her trunk begins to lean toward the place from that frame. --seen-forearm <weight>: her left elbow is kept where the
//   bank's camera sees the forearm from the side. --clear-trunk <weight>: her elbows are kept where no forearm goes through
//   her trunk. --steady <weight>: her right elbow's way is chosen over the whole film, against the square of its steps
//   (Pace in dealer3d/src/two-hand.ts).
// Reads dealer3d/data/till-ankare-2-3.json (its last frame is where this film begins) and placements/default.json.
// Prints the beats, what each card asks of the body, and what to look for before a film is made of it.
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {CARD, TABLE_LENS, filmEye, length, onPlane, see, sub, cross, type Vec3} from '../../src/table-lens.ts';
import {spots} from '../src/world.ts';
import {LIMITS, joints, type ArmPose} from '../src/capture.ts';
import {sideSeen} from '../src/deal.ts';
import {REAL_DEAL} from '../src/real-deal.ts';
import {TWO_HAND, contactGripFits, shoeHolds, startOnAnchor, twoHandDeal, type Limb, type Pace, type Place, type Still} from '../src/two-hand.ts';
import type {RealCard} from '../src/real-deal.ts';

const arg = (name: string, fallback?: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const out = arg('--out'), to = arg('--to'); if (!out || !to) throw Error('usage: deal-film.ts --to <P4.C1 | all> --seconds <n> [--lead <frames>] [--plan <plan.json>] --out <json>');
const FPS = 30, N = Math.round(Number(arg('--seconds', '3')) * FPS), own = arg('--beats')?.split(',').map(Number) ?? null, lead = own ? 0 : Number(arg('--lead', '2')), lens = TABLE_LENS, eye = filmEye(lens);
if (own && (own.length !== 8 || to === 'all' || to.includes(','))) throw Error('--beats takes eight frames (b,c,d,e,l,f,g,h) and one place');
const planPath = arg('--plan');
if (process.argv.includes('--plan') && (!planPath || planPath.startsWith('--'))) throw Error('--plan needs a placement JSON file.');
const poseFilm = arg('--pose-film') ?? null; if (poseFilm !== null && !/^[a-z0-9-]+$/.test(poseFilm)) throw Error('--pose-film takes the name of a film in dealer3d/data, without .json.');
const pose = JSON.parse(await readFile(new URL(`../data/${poseFilm ?? 'till-ankare-2-3'}.json`, import.meta.url), 'utf8'));
const planBytes = await readFile(planPath ?? new URL('../../placements/default.json', import.meta.url));
const plan = JSON.parse(planBytes.toString('utf8').replace(/^\uFEFF/, ''));
const last = pose.frames[pose.frameCount - 1], all = spots(plan, lens), spot = (id: string) => { const s = all.find(s => s.id === id); if (!s) throw Error(`The plan has no place ${id}.`); return s.at; };
// A seat's second card (P1.C2 to P7.C2) is laid with the sweep (Jakob 2026-11-21: the drag with a hand change from A2.3 to P4.C2),
// or at P4.C2 with the landing grip as before; secondCardPilot is that landing pilot, with its own body and elbows below.
const contactMode = arg('--contact-grip'), secondCard = /^P[1-7]\.C2$/.test(to), secondCardPilot = to === 'P4.C2' && contactMode === 'landing';
if (secondCard && contactMode !== 'sweep' && !secondCardPilot) throw Error(`--to ${to} needs --contact-grip sweep${to === 'P4.C2' ? ' or landing' : ''}.`);
// The real dealer's S1 is the seat at her left, by the shoe: the plan's seat 7. Her own card is the plan's D.C1.
// A second card borrows its seat's first card's timing and handover only (P4.C2 takes S4's). Its own plan spot is passed to the solver.
const realOf = (id: string) => { const timing = secondCard && id === to ? id.replace(/\.C2$/, '.C1') : id, m = /^P([1-7])\.C1$/.exec(timing); return REAL_DEAL[timing === 'D.C1' ? 7 : m ? 7 - Number(m[1]) : -1] ?? (() => { throw Error(`No real card to take the moments of for ${id}.`); })(); };
// --meet 1, --push <metres>, --swing <degrees>, and for version -e --single 1, --real-take 1, --reach <metres>, --carry <metres>, --turned-at <metres>, --turn-near <share of the way gone when the turn begins>, and for version -f --roll 1, --grip-bend <0-1>, --grip-yaw <degrees the hand lies off the card's long side in the contact grip>, --hand-over-yaw <degrees>, --body <side,twist,forward degrees>, --tuck <weight> (with --beats): see Pace in dealer3d/src/two-hand.ts.
// --beats: the film's own moments in frames, for a film slower than the real dealer (b,c,d,e,l,f,g,h as in dealer3d/src/real-deal.ts; a is frame 0). Where the hands
// change is still the real card's; the card does not stand still between being stood up and falling, and the left hand goes back to the shoe as much slower as the film is.
const paced = (r: RealCard): {real: RealCard; pace: Pace} => { if (!own) return {real: r, pace: {}}; const [b, c, d, e, l, f, g, h] = own.map(x => x / FPS), slower = (h - b) / (Math.max(r.h, r.g + TWO_HAND.settle) - r.b);
  return {real: {...r, a: 0, b, c, d, e, l, f, g, h, i: h + 0.2}, pace: {flowing: true, leftBack: Math.round(TWO_HAND.leftBack * slower * 1000) / 1000, ...(arg('--meet') === '1' ? {meeting: true} : {}), ...(arg('--push') ? {push: Number(arg('--push'))} : {}), ...(arg('--swing') ? {swing: Number(arg('--swing'))} : {}), ...(arg('--single') === '1' ? {single: true} : {}), ...(arg('--real-take') === '1' ? {realTake: true} : {}), ...(arg('--reach') ? {reach: Number(arg('--reach'))} : {}), ...(arg('--carry') ? {carry: Number(arg('--carry'))} : {}), ...(arg('--turned-at') ? {turnedAt: Number(arg('--turned-at'))} : {}), ...(arg('--turn-near') ? {turnNear: Number(arg('--turn-near'))} : {}), ...(arg('--grip-yaw') ? {gripYaw: Number(arg('--grip-yaw'))} : {}), ...(arg('--roll') === '1' ? {roll: true} : {}), ...(arg('--grip-bend') ? {gripBend: Number(arg('--grip-bend'))} : {}), ...(arg('--hand-over-yaw') ? {handOverYaw: Number(arg('--hand-over-yaw'))} : {}), ...(arg('--body') ? {body: arg('--body')!.split(',').map(Number) as [number, number, number]} : {}), ...(arg('--tuck') ? {tuck: Number(arg('--tuck'))} : {})}}; };
const ids = to === 'all' ? ['P7.C1', 'P6.C1', 'P5.C1', 'P4.C1', 'P3.C1', 'P2.C1', 'P1.C1', 'D.C1'] : to.split(','), places: Place[] = ids.map(id => ({id, at: spot(id), real: paced(realOf(id)).real})), pace = paced(realOf(ids[0])).pace;
// --contact-grip 1 is the original P4 contact pilot. The landing variant keeps its index on the card through release.
// The sweep variant keeps the whole grip until the card lies, and lays it in one movement (Pace in dealer3d/src/two-hand.ts).
if (process.argv.includes('--contact-grip')) {
  const mode = contactMode === 'landing' || contactMode === 'sweep' ? contactMode : true;
  if (!(contactMode === '1' || mode !== true) || !own || !contactGripFits(to, mode) || !pace.single || !pace.meeting || !pace.roll) {
    throw Error('--contact-grip 1|landing|sweep requires --to P4.C1 (P4.C2 with landing, the first or second card of any seat with sweep), --beats, --meet 1, --single 1 and --roll 1.');
  }
  pace.contactGrip = mode;
}
// --shared-change 1 (with --contact-grip sweep): both hands have the card for a while at the hand change (Pace in dealer3d/src/two-hand.ts).
if (arg('--shared-change') === '1') { if (pace.contactGrip !== 'sweep') throw Error('--shared-change 1 requires --contact-grip sweep.'); pace.sharedChange = true; }
// --shared key=value,...: this film's own values for the shared hand change (Pace.shared; the keys of TWO_HAND.shared, and soft and wait). A list is written a:b:c, soft is 1 or 0.
if (arg('--shared')) { if (!pace.sharedChange) throw Error('--shared requires --shared-change 1.'); const known = [...Object.keys(TWO_HAND.shared), 'soft', 'wait'];
  pace.shared = Object.fromEntries(arg('--shared')!.split(',').map(pair => { const [key, value] = pair.split('='); if (!known.includes(key) || value === undefined || value.split(':').some(v => !Number.isFinite(Number(v)))) throw Error(`--shared: ${pair} is not one of ${known.join(', ')} with a number.`);
    return [key, key === 'soft' ? value === '1' : value.includes(':') ? value.split(':').map(Number) : Number(value)]; })); }
if (poseFilm && pose.body) pace.base = [pose.body.lean, pose.body.twist];
if (arg('--take-at')) { const [x, y] = arg('--take-at')!.split(',').map(Number), q = onPlane(eye, x, y, CARD.thickness / 2); if (!q) throw Error('--take-at: the pixel is not on the felt.'); pace.takeAt = [q[0], q[2]]; }
if (arg('--lean-from')) pace.leanFrom = Number(arg('--lean-from'));
if (arg('--seen-forearm')) pace.seenForearm = Number(arg('--seen-forearm'));
if (arg('--clear-trunk')) pace.clearTrunk = Number(arg('--clear-trunk'));
if (arg('--steady')) pace.steady = Number(arg('--steady'));
// At C2 the elbows are solved through the release. Pulling them toward the ordinary deal's last pose overbends the wrist.
if (secondCardPilot) {
  const yaw = Number(arg('--hand-over-yaw', '180'));
  if (yaw !== 180) throw Error('P4.C2 needs --hand-over-yaw 180 for its long-edge turn.');
  pace.handOverYaw = yaw;
  pace.body ??= [0, 0, 2];
}
// --right-at: her right hand as the approved anchor picture has it, where that differs from the pose film (the middle fingertip's pixel in the bank's picture, and the way the hand points).
const rightAt = arg('--right-at')?.split(',').map(Number) ?? null, posed: Still = {L: last.L, R: last.R, h: last.h, ...(poseFilm ? {g: last.g} : {})}, start = rightAt ? startOnAnchor(lens, posed, {x: rightAt[0], y: rightAt[1]}, rightAt[2]) : posed;
// A film in its own tempo ends on the picture the film in the real tempo ends on: that film is laid first, for its elbows.
// --end-elbows 0: the elbows are not brought to those of the film in the real tempo at the end (that film's elbow can stand out from her side, as for D.C1).
if (own && arg('--end-elbows', secondCardPilot ? '0' : '1') !== '0') { const real = twoHandDeal(lens, start, ids.map(id => ({id, at: spot(id), real: realOf(id)})), 2, FPS, N, {...(pace.base ? {base: pace.base} : {}), ...(pace.takeAt ? {takeAt: pace.takeAt} : {}), ...(pace.seenForearm ? {seenForearm: pace.seenForearm} : {}), ...(pace.clearTrunk ? {clearTrunk: pace.clearTrunk} : {}), ...(pace.steady ? {steady: pace.steady} : {})}).frames[N - 1]; pace.elbows = {L: real.L.e, R: real.R.e}; }
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
if (secondCardPilot && Math.max(asked.L.wrist, asked.R.wrist) > LIMITS.wrist) throw Error(`P4.C2: the wrist exceeds ${LIMITS.wrist}° (left ${asked.L.wrist.toFixed(2)}°, right ${asked.R.wrist.toFixed(2)}°).`);
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
  ...(pace.contactGrip ? {
    planSha256: createHash('sha256').update(planBytes).digest('hex'),
    actualIntent: {takeHand: 'LH', startSide: 'BACK', endSide: 'FRONT', pass: true, turn: true, grip: 'DRAG', turnAt: 'AIR', flipAxis: 'LONG_EDGE'},
    ...(secondCardPilot ? {trial: {timingTarget: 'P4.C1', placementTarget: 'P4.C2', planIntent: plan.targets[to].intent ?? null,
      ik: {body: pace.body, endElbows: !!pace.elbows, wristDegrees: {L: r1(asked.L.wrist), R: r1(asked.R.wrist)}, wristLimitDegrees: LIMITS.wrist}}} : {}),
  } : {}),
  film: 'tvahandsgiv-modell', pose: 'from-2.3', ...(poseFilm ? {poseFilm} : {}), places: ids.map(id => ({id, at: spot(id), pixel: all.find(s => s.id === id)!.pixel})), pace: own ? {real: places[0].real, ...pace} : null, rightAt: rightAt ? {x: rightAt[0], y: rightAt[1], yaw: rightAt[2]} : null, to: ids, loose: 0, fps: FPS, frameCount: N, leavesShoe: Math.round(beats[0].c), edge: [turnsAt(0), turnsAt(0)], folds: Math.round(beats[0].g), rests: Math.ceil(beats[0].h), handSize: pose.handSize, palm: pose.palm, throughShoe: through.length, elbowForced: deal.forced, hip: pose.hip,
  beats: beats.map(b => ({to: b.to, a: r1(b.a), b: r1(b.b), c: r1(b.c), d: r1(b.d), e: r1(b.e), l: r1(b.l), turned: r1(b.turned), f: r1(b.f), g: r1(b.g), h: r1(b.h), i: r1(b.i)})), turns: deal.cards.map(c => ({axis: r4(c.turn.axis), angle: Math.round(c.turn.angle * 10) / 10})),
  laid: deal.laid.map(c => ({from: c.from, c: r4(c.c), l: r4(c.l), n: r4(c.n)})), frames: frames.map(f => ({card: {c: r4(f.card.c), l: r4(f.card.l), n: r4(f.card.n), id: f.card.id}, L: limb(f.L), R: limb(f.R), h: r4(f.h), g: r4(f.g)}))}) + '\n', pace.contactGrip ? {flag: 'wx'} : undefined);
