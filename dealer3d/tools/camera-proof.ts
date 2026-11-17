// Pictures for the question "one camera for the cards and the dealer": a real film frame with the plan's card outlines,
// with real cards under the lens that fits the dealer's body, with both, and the shoe's card enlarged.
//   node dealer3d/tools/camera-proof.ts --frame <a frame with the card standing in the shoe, 1764 x 1174> [--pinch <the pinch frame>] --out <folder>
// Reads placements/default.json (never writes it) and the frame; writes four PNG files and proof.json into the folder.
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import sharp from 'sharp';
import {FILM, cardCorners, filmEye, see, quadMeasure, type Pixel} from '../src/camera.ts';
import {MEASURED, filmLens, shoeCardQuad, sides, spots, type Plan} from '../src/world.ts';
import {planQuad, type PlacementPlan} from '../../src/placement-model.ts';

const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const framePath = arg('--frame'), pinchPath = arg('--pinch'), out = arg('--out'); if (!framePath || !out) throw Error('usage: camera-proof.ts --frame <png> [--pinch <png>] --out <folder>');
const plan = JSON.parse(await readFile(new URL('../../placements/default.json', import.meta.url), 'utf8')) as Plan & PlacementPlan, lens = filmLens(), eye = filmEye(lens);
const YELLOW = '#ffd21f', BLUE = '#39b6ff', INK = '#0c1418', comma = (n: number, d = 2) => n.toFixed(d).replace('.', ',');
const poly = (q: Pixel[], stroke: string, fill: string, width = 2.5, dash = '') => `<polygon points="${q.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
const text = (x: number, y: number, s: string, size = 24, fill = '#fff', anchor = 'middle', weight = 600) => `<text x="${x}" y="${y}" font-family="Segoe UI, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" paint-order="stroke" stroke="${INK}" stroke-width="${size / 5}" stroke-linejoin="round">${s}</text>`;
const svg = (w: number, h: number, body: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`);

// The plan's outline (native pixels, 1762 wide) in film pixels, and a real card at the same place.
const places = spots(plan, lens).map(s => {
  const planned = (planQuad(plan, s.id, 'native') as Pixel[]).map(p => ({x: p.x * (FILM.width - 1) / 1761, y: p.y})), real = cardCorners(s.at).map(p => see(eye, p)!) as Pixel[];
  const byRow = [...planned].sort((a, b) => a.y - b.y), near = Math.hypot(byRow[2].x - byRow[3].x, byRow[2].y - byRow[3].y);
  return {id: s.id, pixel: s.pixel, planned, real, ratio: quadMeasure(real).near / near};
});
const ratioOf = (id: string) => places.find(p => p.id === id)!.ratio, mean = (...ids: string[]) => ids.reduce((s, id) => s + ratioOf(id), 0) / ids.length;
const groups = [{name: 'Plats 4', r: mean('P4.C1')}, {name: 'Plats 3 och 5', r: mean('P3.C1', 'P5.C1')}, {name: 'Plats 2 och 6', r: mean('P2.C1', 'P6.C1')}, {name: 'Plats 1 och 7', r: mean('P1.C1', 'P7.C1')}, {name: 'Dealerns kort', r: mean('D.C1', 'D.C2')}];

const frame = sharp(framePath), meta = await frame.metadata(); if (meta.width !== FILM.width || meta.height !== FILM.height) throw Error(`The frame is ${meta.width} x ${meta.height}, not ${FILM.width} x ${FILM.height}.`);
const base = await frame.png().toBuffer(), W = FILM.width, H = FILM.height;

// The shoe. The card standing in the shoe's window is read off the frame itself: the yellow pixels inside the tracker's
// shoe window (its colour rule, tools/track-card.ts), and their four corners as the outermost points along the two
// diagonals of their own principal axes. A real card of the model shoe is laid on the same middle, so only sizes differ.
const box = {left: 1150, top: 690, width: 320, height: 220};
async function yellowCard(png: Buffer): Promise<Pixel[]> {
  const {data, info} = await sharp(png).extract(box).removeAlpha().raw().toBuffer({resolveWithObject: true}), pts: Pixel[] = [];
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) { const i = (y * info.width + x) * 3, r = data[i], g = data[i + 1], b = data[i + 2];
    if (r > 95 && g > 95 && g > 0.82 * r && r > 0.6 * g && b < 0.45 * Math.min(r, g)) pts.push({x: x + box.left, y: y + box.top}); }
  if (pts.length < 500) throw Error('No yellow card in the shoe window of this frame.');
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  let xx = 0, xy = 0, yy = 0; for (const p of pts) { xx += (p.x - cx) ** 2; xy += (p.x - cx) * (p.y - cy); yy += (p.y - cy) ** 2; }
  const angle = Math.atan2(2 * xy, xx - yy) / 2, u = {x: Math.cos(angle), y: Math.sin(angle)}, v = {x: -u.y, y: u.x};
  // In the card's own axes it is a box 2a long and 2b wide; its corners are the outermost points along (u/a ± v/b).
  let a = 0, b = 0; for (const p of pts) { a = Math.max(a, Math.abs((p.x - cx) * u.x + (p.y - cy) * u.y)); b = Math.max(b, Math.abs((p.x - cx) * v.x + (p.y - cy) * v.y)); }
  const far = (sa: number, sb: number) => pts.reduce((best, p) => { const s = sa * ((p.x - cx) * u.x + (p.y - cy) * u.y) / a + sb * ((p.x - cx) * v.x + (p.y - cy) * v.y) / b; return s > best.s ? {s, p} : best; }, {s: -Infinity, p: pts[0]}).p;
  const q = [far(1, 1), far(1, -1), far(-1, -1), far(-1, 1)]; // around the card; sides() wants short sides at 0-1 and 3-2
  return [q[0], q[1], q[2], q[3]];
}
const mid = (q: Pixel[]) => ({x: q.reduce((s, p) => s + p.x, 0) / q.length, y: q.reduce((s, p) => s + p.y, 0) / q.length});
const onto = (q: Pixel[]) => shoeCardQuad(mid(q), 1, lens); // a real card leaning on the shoe's plate, its middle on the film card's middle
const inWindow = await yellowCard(base), windowSides = sides(inWindow), pinchSides = sides(MEASURED.shoeCard), realSides = sides(onto(inWindow));
const long = windowSides.long / realSides.long, pinchLong = pinchSides.long / sides(onto(MEASURED.shoeCard)).long;
await mkdir(out, {recursive: true});
const write = async (name: string, body: string, extra = 0, under = '') => {
  const picture = await sharp(base).composite([{input: svg(W, H, body), left: 0, top: 0}]).png().toBuffer();
  if (!extra) return writeFile(`${out}/${name}`, picture);
  await writeFile(`${out}/${name}`, await sharp({create: {width: W, height: H + extra, channels: 3, background: INK}}).composite([{input: picture, left: 0, top: 0}, {input: svg(W, extra, under), left: 0, top: H}]).png().toBuffer());
};
const head = (s: string) => text(40, 64, s, 40, '#fff', 'start', 700);
const plans = places.map(p => poly(p.planned, YELLOW, 'rgba(255,210,31,0.22)')).join(''), reals = places.map(p => poly(p.real, BLUE, 'rgba(57,182,255,0.28)')).join('');
await write('1-planens-kort.png', plans + head('Planens kort i dag'));
await write('2-verkliga-kort.png', reals + head('Verkliga kort, samma platser'));
const marks = [['P1.C1', -84, -30], ['P2.C1', -84, -36], ['P3.C1', -78, -42], ['P4.C1', -96, 8], ['P5.C1', 128, -42], ['P6.C1', 134, -36], ['P7.C1', 128, -30], ['D.C1', -92, 10]] as const;
const numbers = marks.map(([id, dx, dy]) => { const p = places.find(q => q.id === id)!; return text(p.pixel.x + dx, p.pixel.y + dy, `× ${comma(p.ratio)}`, 26, '#fff'); }).join('');
const cell = W / (groups.length + 1), table = groups.map((g, i) => text(cell * (i + 0.5), 46, g.name, 24, '#9fb4bd', 'middle', 500) + text(cell * (i + 0.5), 96, `× ${comma(g.r)}`, 40, '#fff', 'middle', 700)).join('')
  + text(cell * (groups.length + 0.5), 46, 'Kortet i skons fönster', 24, '#9fb4bd', 'middle', 500) + text(cell * (groups.length + 0.5), 96, `× ${comma(long)}`, 40, '#fff', 'middle', 700);
await write('3-bada.png', places.map(p => poly(p.real, BLUE, 'rgba(57,182,255,0.20)') + poly(p.planned, YELLOW, 'none', 2.5)).join('') + numbers + head('Gult: planen. Blått: verkligt kort, så många gånger större'), 130, table);

// The shoe, three times enlarged: the card standing in the window (this frame), and the card in the pinch (the anchor frame).
const k = 3, at = (p: Pixel): Pixel => ({x: (p.x - box.left) * k, y: (p.y - box.top) * k}), pw = box.width * k, ph = box.height * k;
const panel = async (png: Buffer, filmQuad: Pixel[], title: string, s: {short: number; long: number}) => sharp(await sharp(png).extract(box).resize(pw, ph, {kernel: 'cubic'}).png().toBuffer()).composite([{input: svg(pw, ph,
  poly(filmQuad.map(at), YELLOW, 'none', 3.5) + poly(onto(filmQuad).map(at), BLUE, 'rgba(57,182,255,0.22)', 3.5) + text(28, 50, title, 34, '#fff', 'start', 700)
  + text(28, 92, `Gult: filmens kort, ${comma(s.short, 0)} × ${comma(s.long, 0)}`, 25, YELLOW, 'start') + text(28, 126, `Blått: verkligt kort, ${comma(sides(onto(filmQuad)).short, 0)} × ${comma(sides(onto(filmQuad)).long, 0)}`, 25, BLUE, 'start')), left: 0, top: 0}]).png().toBuffer();
const pinch = pinchPath ? await sharp(pinchPath).png().toBuffer() : null;
const panels = [await panel(base, inWindow, 'I skons fönster', windowSides), ...(pinch ? [await panel(pinch, MEASURED.shoeCard, 'I nypet (ankare 2.1)', pinchSides)] : [])];
await writeFile(`${out}/4-skon.png`, await sharp({create: {width: pw * panels.length + 12 * (panels.length - 1), height: ph, channels: 3, background: INK}}).composite(panels.map((input, i) => ({input, left: i * (pw + 12), top: 0}))).png().toBuffer());

const files = ['3-bada.png', '1-planens-kort.png', '2-verkliga-kort.png', '4-skon.png'];
await writeFile(`${out}/proof.json`, JSON.stringify({
  schemaVersion: 1, createdAt: new Date().toISOString().slice(0, 10),
  tool: 'node dealer3d/tools/camera-proof.ts (3D-banan). Rutorna är ruta 120 och ruta 0 av paow-giv-2-1-p4-11-01; planen är placements/default.json; linsen är filmLens() i dealer3d/src/world.ts. Inga källfiler ändrade.',
  title: 'Korten och dealern: två kameror',
  description: `Planens kort (gult) och hennes kropp är ritade med olika kameror. Blått är ett verkligt kort (63 × 88 mm) på samma plats, sett med den lins som ger hennes knogar, axlar och ögon verklig storlek (brännvidd ${Math.round(lens.focalPx)} bildpunkter, ${comma(lens.height)} m över filten). Vid plats 4 är planen rätt. Närmare dealern är planens kort för små: ${groups.slice(1).map(g => `${g.name.toLowerCase()} ${comma(g.r)} gånger`).join(', ')}. Kortet som står i skons fönster är ${comma(long)} gånger ett verkligt kort på längden, alltså i stort sett rätt; i nypet (ankare 2.1) är det ${comma(pinchLong)} gånger. Skons kort ser stort ut för att korten närmast dealern är för små. Måtten på hennes kropp är lästa för ögat (±10 bildpunkter). Frågan till dig: ska kortplanen ritas med verkligt perspektiv (plats 4 som i dag, korten närmare dealern större)?`,
  labels: {
    '3-bada.png': 'Båda (gult är planens kort, blått ett verkligt kort på samma plats; talet säger hur många gånger större det verkliga är)',
    '1-planens-kort.png': 'Planen i dag (de sexton kortplatserna som planen ritar dem)',
    '2-verkliga-kort.png': 'Verkliga kort (samma platser, sedda med linsen som passar hennes kropp)',
    '4-skon.png': 'Skon (filmens kort mot ett verkligt kort, tre gånger förstorat och lagda på samma mittpunkt: till vänster kortet i skons fönster, till höger kortet i nypet)',
  },
  verdicts: Object.fromEntries(files.map(f => [f, 'unreviewed'])),
}, null, 2) + '\n');
console.log(groups.map(g => `${g.name} ${comma(g.r)}`).join(' · '), `· skons fönster ${comma(long)} (film ${comma(windowSides.short, 1)} × ${comma(windowSides.long, 1)}) · nypet ${comma(pinchLong)} (spår ${comma(pinchSides.short, 1)} × ${comma(pinchSides.long, 1)}) · verkligt ${comma(realSides.short, 1)} × ${comma(realSides.long, 1)}`);
console.log('fönstrets hörn', inWindow.map(p => `${p.x},${p.y}`).join(' '));
