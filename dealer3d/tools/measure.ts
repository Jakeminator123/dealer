// The calibration this lane proposes, as numbers: the family of lenses the film allows, the one chosen, a real card at
// every place of Jakob's plan against the plan's own outline, and the next card in the shoe against the film's.
//   node dealer3d/tools/measure.ts [--json <file>]
// Reads placements/default.json (never writes it). Prints a report; with --json also writes the figures to a file.
import {readFile, writeFile} from 'node:fs/promises';
import {CARD, FILM, drawnCard, filmEye, fovYDeg, horizonRow, lensForFocal, onPlane, see, type Lens, type Pixel} from '../src/camera.ts';
import {ASSUMED, MEASURED, SHOE, anchors, bodyUnder, cardInSpace, dealerEdge, filmLens, realCardAt, seatEye, shoeCard, shoeCardQuad, shoePose, sides, spots, type Plan} from '../src/world.ts';
import {planQuad, type PlacementPlan} from '../../src/placement-model.ts';

const root = new URL('../../', import.meta.url), plan = JSON.parse(await readFile(new URL('placements/default.json', root), 'utf8')) as Plan & PlacementPlan;
const deg = (r: number) => r * 180 / Math.PI, f1 = (n: number) => n.toFixed(1), f2 = (n: number) => n.toFixed(2), f3 = (n: number) => n.toFixed(3);
const lines: string[] = [], say = (s = '') => lines.push(s);

// 1. The family: with the card at seat 4 held to its film size and shape, every focal length gives one lens. What each
// lens makes of the dealer's own body says which of them she was drawn with.
const chosen: Lens = filmLens();
say('1. Linser som alla ger filmens kort vid plats 4 (nära kant 84,5 och djup 72 bildpunkter), och vad var och en gör av dealerns kropp');
say('   brännvidd px | bildvinkel | lutning ned | höjd över filten | till kortet | kortets avsmalning | knogar mm | axlar mm | pupiller mm');
const family: Record<string, unknown>[] = [];
for (const focalPx of [800, 886, 1000, 1270, 1500, chosen.focalPx, 2000, 2300]) {
  const l = lensForFocal(anchors().card, focalPx), m = drawnCard(l, MEASURED.restingCard.centre)!, at = onPlane(filmEye(l), MEASURED.restingCard.centre.x, MEASURED.restingCard.centre.y)!, body = bodyUnder(l);
  const slant = Math.hypot(at[0], at[1] - l.height, at[2]);
  family.push({focalPx, fovYDeg: fovYDeg(focalPx), pitchDeg: deg(l.pitch), heightM: l.height, cardDistanceM: slant, taper: m.taper, knucklesMm: body.knuckles * 1000, shouldersMm: body.shoulders * 1000, pupilsMm: body.pupils * 1000});
  say(`   ${f1(focalPx).padStart(12)} | ${f1(fovYDeg(focalPx)).padStart(9)}° | ${f1(deg(l.pitch)).padStart(10)}° | ${f3(l.height).padStart(14)} m | ${f3(slant).padStart(9)} m | ${f3(m.taper).padStart(18)} | ${f1(body.knuckles * 1000).padStart(9)} | ${f1(body.shoulders * 1000).padStart(8)} | ${f1(body.pupils * 1000).padStart(11)}${focalPx === chosen.focalPx ? '   <- vald' : ''}`);
}
say(`   Verkliga mått: knogar ${f1(ASSUMED.knuckleBreadth * 1000)} mm (70–80), kavajens axlar cirka ${f1(ASSUMED.shoulderBreadth * 1000)} mm, pupiller ${f1(ASSUMED.pupilDistance * 1000)} mm.`);
say(`   Planens kort smalnar av till 0,870 (Jakobs val), filmens kort till ${f3(MEASURED.restingCard.farPx / MEASURED.restingCard.nearPx)} (77,5 / 84,5 på fyra gångers förstoring, ±0,015).`);

// 2. The chosen lens.
const lens: Lens = chosen, eye = filmEye(lens), edge = dealerEdge(lens);
say(); say(`2. Vald lins (den av linserna ovan som ritar hennes knogar, axlar och pupiller närmast verklig storlek): brännvidd ${f1(lens.focalPx)} px, bildvinkel ${f1(fovYDeg(lens.focalPx))}°, lutning ${f2(deg(lens.pitch))}° ned, ${f3(lens.height)} m över filten, horisont på rad ${f1(horizonRow(lens))}`);
say(`   Dealerns kant (rad ${MEASURED.dealerEdgeRow}) ligger ${f3(-edge[2])} m framför kameran.`);

// 3. A real card at every place of the plan, against the plan's own outline there.
say(); say('3. Ett verkligt kort (63 × 88 mm, plant, kortsidan mot kameran) på planens platser, mot planens egen kontur');
say('   plats | på filten x, från dealerkanten (m) | verkligt: nära, bortre, djup, avsmalning | planen: nära, bortre, djup, avsmalning | verkligt/plan (nära kant)');
const places: Record<string, unknown>[] = [];
for (const s of spots(plan, lens)) {
  const real = realCardAt(lens, s.pixel)!, q = (planQuad(plan, s.id, 'native') as Pixel[]).map(p => ({x: p.x * (FILM.width - 1) / 1761, y: p.y})), byRow = [...q].sort((a, b) => a.y - b.y), d = (a: Pixel, b: Pixel) => Math.hypot(a.x - b.x, a.y - b.y);
  const farP = d(byRow[0], byRow[1]), nearP = d(byRow[2], byRow[3]), depthP = (byRow[2].y + byRow[3].y) / 2 - (byRow[0].y + byRow[1].y) / 2;
  places.push({id: s.id, x: s.at[0], fromDealerEdge: s.at[2] - edge[2], real, plan: {near: nearP, far: farP, depth: depthP, taper: farP / nearP}});
  say(`   ${s.id.padEnd(5)} | ${f3(s.at[0]).padStart(6)}, ${f3(s.at[2] - edge[2])} | ${f1(real.near)}, ${f1(real.far)}, ${f1(real.depth)}, ${f3(real.taper)} | ${f1(nearP)}, ${f1(farP)}, ${f1(depthP)}, ${f3(farP / nearP)} | ${f2(real.near / nearP)}`);
}

// 4. The next card in the shoe.
const pose = shoePose(lens), inShoe = shoeCard(pose), drawn = cardInSpace(inShoe.centre, inShoe.up, inShoe.across).map(p => see(eye, p)!) as Pixel[], model = sides(drawn);
const middle = (q: Pixel[]) => ({x: q.reduce((s, p) => s + p.x, 0) / 4, y: q.reduce((s, p) => s + p.y, 0) / 4}), against = (film: Pixel[]) => { const f = sides(film), r = sides(shoeCardQuad(middle(film), 1, lens)); return {f, r, long: f.long / r.long, short: f.short / r.short}; };
const windowCard = against(MEASURED.shoeWindowCard), pinchCard = against(MEASURED.shoeCard);
say(); say('4. Kortet i skon');
say(`   Skons fot på filten: ${f3(pose.footLength)} m lång (en verklig sko är 0,38–0,45 m), främre änden ${f3(pose.front[0])} m åt höger och ${f3(pose.front[2] - edge[2])} m framför dealerkanten.`);
say(`   Kortet i skons fönster (ruta 120): ${f1(windowCard.f.short)} × ${f1(windowCard.f.long)} px. Ett verkligt kort mot frontplattan (lutad ${Math.round(deg(SHOE.plateLean))}° från filten) med samma mittpunkt: ${f1(windowCard.r.short)} × ${f1(windowCard.r.long)} px. Filmens är ${f2(windowCard.long)} gånger det verkliga på längden.`);
say(`   Samma kort där skomodellen själv ställer det (mitt i skon, ${f1(Math.hypot(middle(drawn).x - middle(MEASURED.shoeWindowCard).x, middle(drawn).y - middle(MEASURED.shoeWindowCard).y))} px från filmens): ${f1(model.short)} × ${f1(model.long)} px, alltså ${f2(windowCard.f.long / model.long)} gånger.`);
say(`   Kortet i nypet (ankare 2.1, spårets ruta 0): ${f1(pinchCard.f.short)} × ${f1(pinchCard.f.long)} px mot ${f1(pinchCard.r.short)} × ${f1(pinchCard.r.long)}: ${f2(pinchCard.long)} gånger på längden.`);
const square = lens.focalPx / Math.hypot(inShoe.centre[0], inShoe.centre[1] - lens.height, inShoe.centre[2]);
say(`   Som mest (kortet vänt rakt mot kameran på samma ställe): ${f1(CARD.width * square)} × ${f1(CARD.height * square)} px.`);

// 5. The seats' eyes.
say(); say('5. Stolarnas ögon (filmkameran buren runt mitten av dealerns kant)');
const seats: Record<string, unknown>[] = [];
for (let n = 1; n <= 7; n++) { const e = seatEye(n, plan, lens), angle = deg(Math.atan2(e.position[0] - edge[0], e.position[2] - edge[2])); seats.push({seat: n, angleDeg: angle, position: e.position}); say(`   stol ${n}: ${f1(angle).padStart(6)}°, öga (${f2(e.position[0])}, ${f2(e.position[1])}, ${f2(e.position[2])})`); }

console.log(lines.join('\n'));
const at = process.argv.indexOf('--json');
if (at > 0 && process.argv[at + 1]) await writeFile(process.argv[at + 1], JSON.stringify({film: FILM, card: CARD, measured: MEASURED, assumed: ASSUMED, family, lens: {...lens, pitchDeg: deg(lens.pitch), fovYDeg: fovYDeg(lens.focalPx), horizonRow: horizonRow(lens)}, dealerEdge: edge, places, shoe: {pose, card: inShoe, window: windowCard, pinch: pinchCard, atModelPlace: model}, seats}, null, 1) + '\n');
