// Frame by frame what a laid deal does with its card, as numbers to read beside the sheet: how far the card's middle
// moves and how far it turns since the frame before, how much of its face the bank's camera sees, how large it is drawn,
// how far her left fingertips are from it, how far her right elbow is below her right shoulder, and the angle between her
// right forearm and the camera's line of sight to it (near 0: the forearm points at the camera and is drawn short). A card
// that moves less than 1 mm and turns less than 1 degree stands still. The turn counts a card and the same card with its
// ends swapped as one (a card is the same rectangle either way).
//   node dealer3d/tools/deal-check.ts dealer3d/data/giv-fran-2-3-p4-e.json [from] [to]
import {readFile} from 'node:fs/promises';
import {CARD, TABLE_LENS, filmEye, see, cross, length, sub, add, mul, type Vec3} from '../../src/table-lens.ts';

const [file, from = '0', to = '89'] = process.argv.slice(2); if (!file) throw Error('usage: deal-check.ts <data json> [from] [to]');
const data = JSON.parse(await readFile(file, 'utf8')), eye = filmEye(TABLE_LENS), deg = (r: number) => r * 180 / Math.PI;
type F = {card: {c: Vec3; l: Vec3; n: Vec3}; L: {p: Vec3[]}; R: {p: Vec3[]; s: Vec3; e: Vec3; w: Vec3}};
const corners = (f: F) => { const a = cross(f.card.n, f.card.l), h = CARD.height / 2, w = CARD.width / 2; return [[h, w], [h, -w], [-h, -w], [-h, w]].map(([x, y]) => add(f.card.c, add(mul(f.card.l, x), mul(a, y)))); };
const drawn = (f: F) => { const p = corners(f).map(q => see(eye, q)!); let s = 0; for (let k = 0; k < 4; k++) { const a = p[k], b = p[(k + 1) % 4]; s += a.x * b.y - b.x * a.y; } return Math.abs(s) / 2; };
const turn = (a: F, b: F) => Math.min(...[1, -1].map(e => { const A = [a.card.l, a.card.n, cross(a.card.n, a.card.l)], bl = mul(b.card.l, e), B = [bl, b.card.n, cross(b.card.n, bl)], tr = A.reduce((s, v, k) => s + v[0] * B[k][0] + v[1] * B[k][1] + v[2] * B[k][2], 0); return deg(Math.acos(Math.max(-1, Math.min(1, (tr - 1) / 2)))); }));
const forearm = (f: F) => { const v = sub(f.R.w, f.R.e), d = sub(f.R.e, eye.position); return deg(Math.acos(Math.abs(v[0] * d[0] + v[1] * d[1] + v[2] * d[2]) / length(v) / length(d))); };
const face = (f: F) => { const d = sub(eye.position, f.card.c); return deg(Math.asin((f.card.n[0] * d[0] + f.card.n[1] * d[1] + f.card.n[2] * d[2]) / length(d))); };
const leftOn = (f: F) => Math.min(...f.L.p.map(q => { const d = sub(q, f.card.c), a = cross(f.card.n, f.card.l); return Math.hypot(Math.max(0, Math.abs(d[0] * f.card.l[0] + d[1] * f.card.l[1] + d[2] * f.card.l[2]) - CARD.height / 2), Math.max(0, Math.abs(d[0] * a[0] + d[1] * a[1] + d[2] * a[2]) - CARD.width / 2), d[0] * f.card.n[0] + d[1] * f.card.n[1] + d[2] * f.card.n[2]); }));
console.log('ruta  flytt mm  vrid°  mot kameran°  yta bp²  vänster från kortet mm  höjd mm  armbåge under axel mm  underarm mot siktlinjen°');
for (let i = Math.max(1, Number(from)); i <= Number(to); i++) { const a: F = data.frames[i - 1], b: F = data.frames[i];
  console.log(`${String(i).padStart(4)}  ${(length(sub(b.card.c, a.card.c)) * 1000).toFixed(1).padStart(8)}  ${turn(a, b).toFixed(1).padStart(5)}  ${face(b).toFixed(0).padStart(12)}  ${drawn(b).toFixed(0).padStart(7)}  ${(leftOn(b) * 1000).toFixed(0).padStart(22)}  ${(b.card.c[1] * 1000).toFixed(0).padStart(7)}  ${((b.R.s[1] - b.R.e[1]) * 1000).toFixed(0).padStart(21)}  ${forearm(b).toFixed(0).padStart(24)}`); }
