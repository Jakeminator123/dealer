// The gaming hall: a room behind the dealer, built here and fetched by src/scene3d-room.ts the first time it is shown.
// A dim hall of slot machines with a low ceiling, a bar in the far corner, neon on the walls and a low smoke over the carpet.
// The machines are generic: an upright cabinet with a lit sign on top, a glass with reels in a glowing surround, a second
// painted glass and a button deck. Words and symbols are common property (sevens, cherries, bars, stars); no brand is copied.
//
// Dealer metres as in every room: the felt is y = 0, -z is behind the dealer, the camera looks toward -z from about
// (0, 0.25, 0.76). The dealer hides a wedge of about 20 degrees to each side, so what is seen lies left and right of it.
//
// Cost: eleven draw calls and about 12 000 triangles, no lamps and no shadows. Every surface gets its light from one
// painted map of the carpet (`light`), so the glow on the floor, on the cabinets and in the smoke agree. Everything that
// moves is worked out in the shaders from the one clock `update` is given, so a frame at a given time always looks the same.
import * as T from 'three';
import type {BuiltRoom} from './scene3d-room.ts';

const FLOOR = -0.92, TOP = 2.4; // the carpet as in every room; the ceiling is lower than the salon's
export const HALL = {halfWidth: 9.6, back: -14, front: 5.4};
const MAP = {x: -10, z: -14.4, size: 20}; // the square of carpet that the light map covers
const WINS = 4; // how many machines can flash a win; each has a slot in the uniforms

// ---- what stands where (pure, also read by tools/scene3d-hall.test.ts) --------------------------------------------------
const lcg = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v)), smooth = (v: number) => { const t = clamp01(v); return t * t * (3 - 2 * t); };
// The colours a machine can have: pink, blue, amber, green, violet, red, cyan.
export const TINTS: number[][] = [[1, 0.13, 0.5], [0.16, 0.42, 1], [1, 0.6, 0.1], [0.1, 0.95, 0.4], [0.62, 0.24, 1], [1, 0.14, 0.08], [0.08, 0.85, 1]];
// turn: radians about the vertical, 0 = facing the camera. period, offset: one spin-and-rest of the reels, seconds.
// every > 0: each `every`th spin ends in a win (slot = its place in the win uniforms).
export type Machine = {x: number; z: number; turn: number; tint: number; seed: number; period: number; offset: number; every: number; slot: number};
export type Layout = {machines: Machine[]; downlights: number[][]; winners: Machine[]};
export function hallLayout(): Layout {
  const random = lcg(77), machines: Machine[] = [];
  const one = (x: number, z: number, turn: number, tint: number): Machine => { const period = 6.5 + random() * 6, m = {x, z, turn, tint, seed: random(), period, offset: random() * period, every: 0, slot: -1}; machines.push(m); return m; };
  const bank = (x: number, z: number, turn: number, tints: number[]) => tints.map((tint, i) => { const along = (i - (tints.length - 1) / 2) * 0.74; return one(x + Math.cos(turn) * along, z - Math.sin(turn) * along, turn, tint); });
  // Closest, at the edges of the picture and so the least blurred: an arc on each side, turned toward the table.
  const nearLeft = [one(-3.2, -3.2, 0.5, 2), one(-3.9, -2.8, 0.55, 5), one(-4.6, -2.35, 0.6, 2)];
  // The three that are seen best get seeds that make them video machines with dark glass (a classic's pale reel strips are
  // too large a light area that close) and give the first one the sevens on its glass and its sign.
  [0.43, 0.61, 0.83].forEach((seed, i) => { nearLeft[i].seed = seed; });
  one(3.95, -2.7, -0.55, 1); one(4.65, -2.25, -0.6, 4);
  // Banks at different distances, left and right of the wedge the dealer hides, with gaps to see past them.
  const midLeft = bank(-4.85, -6.0, 0.12, [4, 0, 0]), midRight = bank(3.75, -4.3, -0.3, [1, 6, 1]), farRight = bank(4.4, -9.0, -0.1, [2, 5, 2, 0]);
  bank(-3.2, -9.6, 0.1, [6, 1, 6]); bank(-7.3, -9.8, 0.3, [3, 3, 2]); bank(7.3, -6.4, -0.5, [0, 4, 0]);
  // Across the back, either side of the doorway; the bar has the left corner.
  bank(-3.2, -13.25, 0, [5, 2, 5]); bank(4.6, -13.25, 0, [3, 6, 6, 4, 1, 1]);
  // Along both side walls, facing in, in runs of one colour.
  for (const side of [-1, 1]) for (let z = side < 0 ? -10.6 : -12.4, i = 0, tint = 0; z < 3.4; z += 0.76, i++) { if (i % 3 === 0) tint = Math.floor(random() * TINTS.length); one(side * 8.95, z, -side * Math.PI / 2, tint); }
  // The four that win now and then. Their periods share no beat, so the wins wander apart.
  const winner = (m: Machine, slot: number, period: number, every: number, offset: number) => Object.assign(m, {slot, period, every, offset});
  const winners = [winner(nearLeft[0], 0, 8.5, 5, 30), winner(midRight[0], 1, 9.2, 6, 21), winner(midLeft[2], 2, 7.9, 8, 40), winner(farRight[1], 3, 10.1, 7, 55)];
  // Warm lamps in the ceiling, over open carpet and never in the wedge behind the dealer's head.
  const downlights = [[-3.6, -3.2], [3.6, -3.2], [-3.6, -8], [3.6, -7.6], [-6, -5.6], [6, -4.6], [-6, -10.4], [6, -10.4], [-6, -0.8], [6, -0.8], [-6, 4], [6, 4]];
  return {machines, downlights, winners};
}
// How strongly a machine shows a win at a time: 0 almost always; on every `every`th spin it rises as the last reel has
// stopped and fades before the next spin. The shader stops the reels on sevens across the middle on exactly those spins.
export function winLevel(seconds: number, m: {period: number; offset: number; every: number}): number {
  if (!(m.every > 0) || !(m.period > 0) || !Number.isFinite(seconds)) return 0;
  const c = (seconds + m.offset) / m.period, spin = Math.floor(c), phase = c - spin;
  if (((spin % m.every) + m.every) % m.every !== 0) return 0;
  return smooth((phase - 0.62) / 0.03) * (1 - smooth((phase - 0.9) / 0.08));
}

// ---- triangles ----------------------------------------------------------------------------------------------------------
// Flat-shaded triangle soup. `extra` is whatever a shader wants per corner, the same count for every corner of one soup.
type V3 = number[];
type Soup = {position: number[]; normal: number[]; uv: number[]; extra: number[]};
const soup = (): Soup => ({position: [], normal: [], uv: [], extra: []});
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// A flat four-cornered face: its centre, the half-vector to its right and the half-vector up. uv runs 0-1 across it, times `tile`.
function quad(s: Soup, c: V3, r: V3, u: V3, extra: number[] = [], tile: number[] = [1, 1]) {
  const n = cross(r, u), l = Math.hypot(n[0], n[1], n[2]) || 1;
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) { s.position.push(c[0] + a * r[0] + b * u[0], c[1] + a * r[1] + b * u[1], c[2] + a * r[2] + b * u[2]); s.normal.push(n[0] / l, n[1] / l, n[2] / l); s.uv.push((a + 1) / 2 * tile[0], (b + 1) / 2 * tile[1]); s.extra.push(...extra); }
}
function box(s: Soup, cx: number, cy: number, cz: number, w: number, h: number, d: number, extra: number[]) {
  const x = w / 2, y = h / 2, z = d / 2;
  quad(s, [cx, cy, cz + z], [x, 0, 0], [0, y, 0], extra); quad(s, [cx, cy, cz - z], [-x, 0, 0], [0, y, 0], extra);
  quad(s, [cx + x, cy, cz], [0, 0, -z], [0, y, 0], extra); quad(s, [cx - x, cy, cz], [0, 0, z], [0, y, 0], extra);
  quad(s, [cx, cy + y, cz], [x, 0, 0], [0, 0, -z], extra); quad(s, [cx, cy - y, cz], [x, 0, 0], [0, 0, z], extra);
}
// An upright round thing (a stool's foot, post and seat), flat-sided, with a lid.
function tube(s: Soup, cx: number, cz: number, y0: number, y1: number, r: number, sides: number, extra: number[]) {
  for (let i = 0; i < sides; i++) {
    const a = i / sides * Math.PI * 2, b = (i + 1) / sides * Math.PI * 2, m = (a + b) / 2, half = r * Math.tan(Math.PI / sides) * Math.cos(Math.PI / sides), out = r * Math.cos(Math.PI / sides);
    quad(s, [cx + Math.cos(m) * out, (y0 + y1) / 2, cz + Math.sin(m) * out], [Math.sin(m) * half, 0, -Math.cos(m) * half], [0, (y1 - y0) / 2, 0], extra);
    for (const [px, pz] of [[0, 0], [Math.cos(b) * r, Math.sin(b) * r], [Math.cos(a) * r, Math.sin(a) * r]]) { s.position.push(cx + px, y1, cz + pz); s.normal.push(0, 1, 0); s.uv.push(0.5, 0.5); s.extra.push(...extra); }   // a slice of the lid
  }
}
// Soup to geometry. `split` names the shader attributes the extras become, in order, with their sizes.
function geometry(s: Soup, split: [string, number][] = []) {
  const g = new T.BufferGeometry(), count = s.position.length / 3, each = split.reduce((sum, [, size]) => sum + size, 0);
  g.setAttribute('position', new T.Float32BufferAttribute(s.position, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(s.normal, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(s.uv, 2));
  let skip = 0; for (const [name, size] of split) { const data = new Float32Array(count * size); for (let i = 0; i < count; i++) for (let k = 0; k < size; k++) data[i * size + k] = s.extra[i * each + skip + k]; g.setAttribute(name, new T.BufferAttribute(data, size)); skip += size; }
  return g;
}

// ---- one machine, in its own metres: standing on y = 0, its front toward +z --------------------------------------------------
const SHELL = [0.05, 0.047, 0.056, 0], TRIM = [0.13, 0.12, 0.115, 0], CHROME = [0.34, 0.34, 0.37, 0], LEATHER = [0.24, 0.055, 0.07, 0];
function stool(s: Soup, x: number, z: number) { tube(s, x, z, 0, 0.03, 0.2, 10, CHROME); tube(s, x, z, 0.03, 0.6, 0.028, 6, CHROME); tube(s, x, z, 0.6, 0.68, 0.19, 12, LEATHER); }
function machineBody(): Soup {
  const s = soup();
  box(s, 0, 0.36, 0, 0.62, 0.72, 0.56, SHELL);       // the base, with the lower glass on its front
  box(s, 0, 0.755, 0.22, 0.66, 0.07, 0.4, TRIM);     // the button deck juts out over it
  box(s, 0, 1.29, -0.08, 0.62, 1.0, 0.4, SHELL);     // the tower that carries the two glasses
  box(s, 0, 1.82, -0.08, 0.14, 0.06, 0.1, TRIM);     // neck
  box(s, 0, 1.97, -0.08, 0.56, 0.24, 0.1, SHELL);    // the sign on top
  stool(s, 0, 0.84);
  return s;
}
// The lit faces. extra = which part: 1 reels in their surround, 2 upper glass, 3 top sign, 4 lower glass, 5 buttons, 6 light strips.
const SCREEN = [0, 1.08, 0.127];
function machineFaces(): Soup {
  const s = soup();
  quad(s, SCREEN, [0.26, 0, 0], [0, 0.25, 0], [1]);
  quad(s, [0, 1.585, 0.127], [0.25, 0, 0], [0, 0.13, 0], [2]);
  quad(s, [0, 1.97, -0.027], [0.26, 0, 0], [0, 0.1, 0], [3]);
  quad(s, [0, 0.38, 0.283], [0.23, 0, 0], [0, 0.19, 0], [4]);
  quad(s, [0, 0.793, 0.25], [0.28, 0, 0], [0, 0, -0.1], [5]);
  for (const x of [-0.292, 0.292]) quad(s, [x, 1.29, 0.127], [0.014, 0, 0], [0, 0.49, 0], [6]);
  return s;
}

// ---- paint ------------------------------------------------------------------------------------------------------------------
type C2 = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
function paint(w: number, h: number, draw: (c: C2, w: number, h: number) => void, repeat = false) {
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h; draw(canvas.getContext('2d')!, w, h);
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 8;
  if (repeat) texture.wrapS = texture.wrapT = T.RepeatWrapping;
  return texture;
}
const rgba = (c: number[], a: number) => `rgba(${c.slice(0, 3).map(v => Math.round(clamp01(v) * 255)).join(',')},${a})`;
// A round thing with the light on its upper left.
const ball = (c: C2, x: number, y: number, r: number, light: string, mid: string, dark: string) => { const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.08, x, y, r); g.addColorStop(0, light); g.addColorStop(0.45, mid); g.addColorStop(1, dark); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); };
const glowAt = (c: C2, x: number, y: number, r: number, colour: string, clear: string) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, colour); g.addColorStop(1, clear); c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r); };
const text = (c: C2, s: string, x: number, y: number, font: string, fill: string | CanvasGradient, stroke = '', width = 0) => { c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round'; if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.strokeText(s, x, y); } c.fillStyle = fill; c.fillText(s, x, y); };
const upDown = (c: C2, y0: number, y1: number, ...stops: string[]) => { const g = c.createLinearGradient(0, y0, 0, y1); stops.forEach((stop, i) => g.addColorStop(i / (stops.length - 1), stop)); return g; };
const star = (c: C2, x: number, y: number, R: number, r: number) => { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r : R; c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } c.closePath(); };
const at = (c: C2, x: number, y: number, scale: number, draw: (c: C2) => void) => { c.save(); c.translate(x, y); c.scale(scale, scale); draw(c); c.restore(); };
const HEAVY = '"Arial Black", Impact, "Helvetica Neue", Arial, sans-serif';
// The eight reel symbols, each drawn about the origin in a box of 100: seven, cherries, bar, star, bell, lemon, diamond, clover.
const SYMBOLS: ((c: C2) => void)[] = [
  c => text(c, '7', -2, 4, 'italic 900 104px Georgia, "Times New Roman", serif', upDown(c, -40, 40, '#ff7a52', '#e3121a', '#8a0010'), '#ffd76a', 8),
  c => { c.strokeStyle = '#3d9a35'; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.moveTo(-20, 10); c.quadraticCurveTo(-12, -26, 10, -40); c.quadraticCurveTo(24, -14, 22, 14); c.stroke();
    c.fillStyle = '#46b53c'; c.beginPath(); c.ellipse(27, -38, 17, 7, -0.3, 0, TAU); c.fill(); ball(c, -20, 20, 21, '#ffb0a0', '#e21a2a', '#7a0012'); ball(c, 22, 24, 21, '#ffb0a0', '#e21a2a', '#7a0012'); },
  c => { for (const y of [-24, 0, 24]) { c.fillStyle = '#16130f'; c.strokeStyle = '#e6b84a'; c.lineWidth = 3; c.beginPath(); c.roundRect(-44, y - 10, 88, 20, 4); c.fill(); c.stroke(); text(c, 'BAR', 0, y + 1, `900 17px ${HEAVY}`, '#f6e9c4'); } },
  c => { star(c, 0, 2, 46, 20); c.fillStyle = upDown(c, -44, 46, '#fff6b0', '#ffc832', '#d98a00'); c.fill(); c.strokeStyle = '#8a5200'; c.lineWidth = 3; c.stroke(); },
  c => { c.fillStyle = upDown(c, -42, 40, '#fff0a0', '#f0b020', '#a86a00'); c.beginPath(); c.moveTo(-34, 24); c.bezierCurveTo(-22, 10, -26, -36, 0, -38); c.bezierCurveTo(26, -36, 22, 10, 34, 24); c.closePath(); c.fill(); c.beginPath(); c.roundRect(-38, 22, 76, 11, 5); c.fill(); ball(c, 0, 38, 8, '#fff0a0', '#e0a010', '#8a5200'); ball(c, 0, -40, 6, '#fff0a0', '#e0a010', '#8a5200'); },
  c => { c.save(); c.rotate(-0.35); c.fillStyle = upDown(c, -30, 30, '#fff9a0', '#ffe030', '#d0a000'); c.beginPath(); c.ellipse(0, 0, 42, 29, 0, 0, TAU); c.fill(); c.beginPath(); c.ellipse(43, 0, 8, 6, 0, 0, TAU); c.ellipse(-43, 0, 8, 6, 0, 0, TAU); c.fill(); c.restore(); },
  c => { c.fillStyle = upDown(c, -34, 40, '#d8fbff', '#3cc4f0', '#1470b8'); c.beginPath(); c.moveTo(-38, -10); c.lineTo(-19, -34); c.lineTo(19, -34); c.lineTo(38, -10); c.lineTo(0, 40); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 2; c.beginPath(); c.moveTo(-38, -10); c.lineTo(38, -10); c.moveTo(-19, -34); c.lineTo(-10, -10); c.lineTo(0, 40); c.lineTo(10, -10); c.lineTo(19, -34); c.stroke(); },
  c => { c.strokeStyle = '#1f8a3a'; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, 6); c.quadraticCurveTo(4, 30, 16, 42); c.stroke(); for (const [x, y] of [[-17, -17], [17, -17], [-17, 13], [17, 13]]) ball(c, x, y - 2, 19, '#9af0a8', '#2fbf55', '#0e6a2a'); },
];
// One picture holds everything the machines and the far screen show. Rows, in pixels from the top:
//   0 symbols (8 x 128)   168 top signs (4 x 256 x 100, grey: the shader colours them)   276 upper glass (3 x 340 x 176)
//   460 lower glass (3 x 300 x 248)   716 button deck (280 x 96)   820 pages of the far screen (3 x 340 x 140)
const ATLAS = 1024;
function paintAtlas(c: C2) {
  SYMBOLS.forEach((draw, i) => at(c, i * 128 + 64, 64, 1.05, draw));
  ['777', 'STARS', 'BONUS', 'GOLD 7'].forEach((word, i) => { const x = i * 256, y = 168, g = c.createRadialGradient(x + 128, y + 50, 10, x + 128, y + 50, 150); g.addColorStop(0, '#808080'); g.addColorStop(1, '#2c2c2c'); c.fillStyle = g; c.fillRect(x, y, 256, 100);
    text(c, word, x + 128, y + 54, `900 ${word.length > 4 ? 44 : word.length > 3 ? 50 : 66}px ${HEAVY}`, '#ffffff', '#0b0b0b', 9); });
  const rays = (x: number, y: number, r: number, colour: string) => { c.fillStyle = colour; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; c.beginPath(); c.moveTo(x, y); c.arc(x, y, r, a, a + TAU / 24); c.closePath(); c.fill(); } };
  const panel = (x: number, y: number, w: number, h: number, inner: string, outer: string, draw: () => void) => { c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); const g = c.createRadialGradient(x + w / 2, y + h / 2, 8, x + w / 2, y + h / 2, w * 0.62); g.addColorStop(0, inner); g.addColorStop(1, outer); c.fillStyle = g; c.fillRect(x, y, w, h); draw(); c.restore(); };
  // upper glass: sevens on rays, a bonus among stars, fruit
  panel(0, 276, 340, 176, '#7a1420', '#1c040a', () => { rays(170, 364, 260, 'rgba(255,190,80,.16)'); [[78, 0.95], [170, 1.3], [262, 0.95]].forEach(([x, k]) => at(c, x, 364, k, SYMBOLS[0])); });
  panel(340, 276, 340, 176, '#1c3a9a', '#050a26', () => { for (const [x, y, r] of [[48, 40, 20], [300, 44, 24], [36, 140, 15], [306, 136, 18], [170, 28, 12], [110, 150, 10], [236, 152, 12]]) { star(c, 340 + x, 276 + y, r, r * 0.45); c.fillStyle = '#ffd95a'; c.fill(); } text(c, 'BONUS', 510, 366, `900 62px ${HEAVY}`, upDown(c, 336, 396, '#fff6c0', '#ffbe2e', '#c87800'), '#3a1400', 10); });
  panel(680, 276, 340, 176, '#1c6a34', '#04160c', () => { rays(850, 364, 260, 'rgba(190,255,120,.1)'); [[1, 64, 0.95], [4, 148, 0.9], [5, 232, 0.9], [7, 304, 0.8]].forEach(([i, x, k]) => at(c, 680 + x, 368, k, SYMBOLS[i])); });
  // lower glass: what the symbols pay, a star, a field of diamonds
  panel(0, 460, 300, 248, '#2a2030', '#0a070d', () => { [0, 2, 3, 1].forEach((sym, row) => { for (let k = 0; k < 3; k++) at(c, 44 + k * 46, 496 + row * 58, 0.42, SYMBOLS[sym]); text(c, ['500', '100', '40', '10'][row], 236, 498 + row * 58, `900 34px ${HEAVY}`, '#ffd76a', '#2a1200', 5); }); });
  panel(300, 460, 300, 248, '#6a1a8a', '#12041c', () => { rays(450, 584, 220, 'rgba(255,220,120,.16)'); star(c, 450, 588, 96, 42); c.fillStyle = upDown(c, 490, 690, '#fff6b0', '#ffc832', '#c87800'); c.fill(); c.strokeStyle = '#5a2c00'; c.lineWidth = 5; c.stroke(); });
  panel(600, 460, 300, 248, '#8a1a1a', '#1a0406', () => { for (let j = 0; j < 5; j++) for (let i = 0; i < 6; i++) { const x = 600 + i * 60 + (j % 2) * 30, y = 470 + j * 56; c.beginPath(); c.moveTo(x, y - 24); c.lineTo(x + 26, y); c.lineTo(x, y + 24); c.lineTo(x - 26, y); c.closePath(); c.fillStyle = (i + j) % 2 ? 'rgba(255,200,90,.5)' : 'rgba(255,240,200,.16)'; c.fill(); } at(c, 750, 584, 1.5, SYMBOLS[6]); });
  // button deck: five small lit buttons, five bet keys, the big one to the right
  c.fillStyle = '#0c0c0f'; c.fillRect(0, 716, 280, 96);
  ['#ff4a4a', '#ffd040', '#40c0ff', '#62ff86', '#ff86e2'].forEach((colour, i) => { ball(c, 30 + i * 40, 742, 13, '#ffffff', colour, colour); c.fillStyle = 'rgba(255,246,220,.85)'; c.beginPath(); c.roundRect(15 + i * 40, 772, 30, 20, 4); c.fill(); });
  ball(c, 240, 764, 30, '#f4ffe0', '#58e03a', '#1c7a14');
  // far screen: the pot, three sevens, a bonus
  panel(0, 820, 340, 140, '#8a0c1c', '#200408', () => { text(c, 'JACKPOT', 170, 852, `900 30px ${HEAVY}`, '#ffd76a', '#2a0800', 6); text(c, '128 450', 170, 910, `900 58px ${HEAVY}`, upDown(c, 884, 936, '#ffffff', '#ffe9a0', '#ffb020'), '#2a0800', 8); });
  panel(340, 820, 340, 140, '#12409a', '#040c26', () => { rays(510, 890, 240, 'rgba(120,200,255,.14)'); [86, 170, 254].forEach(x => at(c, 340 + x, 892, 1.15, SYMBOLS[0])); });
  panel(680, 820, 340, 140, '#5a1a9a', '#10041e', () => { for (const [x, r] of [[40, 22], [300, 22], [84, 12], [256, 12]]) { star(c, 680 + x, 890, r, r * 0.45); c.fillStyle = '#ffd95a'; c.fill(); } text(c, 'BONUS', 850, 892, `900 54px ${HEAVY}`, upDown(c, 866, 918, '#fff6c0', '#ffbe2e', '#c87800'), '#2a0c00', 9); });
}
// Neon tubes on black, added to the wall behind them: [x, y, w, h] in a picture of 1024 x 512.
const NEON = {bar: [0, 0, 380, 190], sevens: [380, 0, 300, 190], star: [680, 0, 190, 190], cherries: [870, 0, 154, 190], jackpot: [0, 190, 620, 150]};
function paintNeon(c: C2, w: number, h: number) {
  c.fillStyle = '#000'; c.fillRect(0, 0, w, h); c.lineJoin = c.lineCap = 'round';
  // every tube twice: a wide coloured line with a glow, then a thin pale core
  const tube = (colour: string, width: number, path: () => void) => { c.shadowColor = colour; c.shadowBlur = 26; c.strokeStyle = colour; c.lineWidth = width; path(); path(); c.shadowBlur = 5; c.strokeStyle = '#fff4ea'; c.lineWidth = width * 0.34; path(); c.shadowBlur = 0; };
  const word = (s: string, x: number, y: number, font: string, colour: string, width: number) => { c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle'; tube(colour, width, () => c.strokeText(s, x, y)); };
  word('Bar', 190, 98, 'italic 700 150px "Segoe Script", "Brush Script MT", "Snell Roundhand", cursive', '#ff3d8f', 8);
  word('777', 530, 98, `900 124px ${HEAVY}`, '#ff3a2a', 8);
  tube('#ffd23a', 8, () => { star(c, 775, 100, 76, 32); c.stroke(); });
  tube('#ff3a4a', 7, () => { c.beginPath(); c.arc(920, 128, 28, 0, TAU); c.moveTo(1002, 138); c.arc(974, 138, 28, 0, TAU); c.stroke(); });
  tube('#49e05a', 6, () => { c.beginPath(); c.moveTo(916, 100); c.quadraticCurveTo(930, 50, 960, 30); c.quadraticCurveTo(978, 70, 974, 110); c.stroke(); });
  word('JACKPOT', 310, 266, `900 104px ${HEAVY}`, '#ffb020', 7);
}
// Carpet, one repeat of 2.4 m: wine red with gold rings, teal petals and gold diamonds, as busy as a hall's carpet is.
function paintCarpet(c: C2, w: number) {
  const random = lcg(19); c.fillStyle = '#2b0f18'; c.fillRect(0, 0, w, w);
  for (let i = 0; i < 9000; i++) { c.fillStyle = random() > 0.5 ? `rgba(120,40,60,${0.08 + random() * 0.2})` : `rgba(0,0,0,${0.1 + random() * 0.25})`; c.fillRect(random() * w, random() * w, 2, 2); }
  const cell = w / 2;
  for (let i = 0; i <= 2; i++) for (let j = 0; j <= 2; j++) { const x = i * cell, y = j * cell;   // shapes on the tile's edges are drawn on both, so the repeat has no seam
    c.fillStyle = '#c9963c'; c.beginPath(); c.moveTo(x, y - 40); c.lineTo(x + 26, y); c.lineTo(x, y + 40); c.lineTo(x - 26, y); c.closePath(); c.fill(); c.fillStyle = '#2b0f18'; c.beginPath(); c.arc(x, y, 9, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(201,150,60,.55)'; c.lineWidth = 4; c.beginPath(); c.arc(x, y, 62, 0, TAU); c.stroke(); }
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { const x = (i + 0.5) * cell, y = (j + 0.5) * cell;
    c.strokeStyle = '#c9963c'; c.lineWidth = 6; c.beginPath(); c.arc(x, y, 92, 0, TAU); c.stroke(); c.strokeStyle = 'rgba(160,40,60,.9)'; c.lineWidth = 10; c.beginPath(); c.arc(x, y, 78, 0, TAU); c.stroke();
    for (let k = 0; k < 8; k++) { c.save(); c.translate(x, y); c.rotate(k * Math.PI / 4); c.fillStyle = k % 2 ? '#1f7a74' : '#2a5a9a'; c.beginPath(); c.ellipse(0, -40, 13, 30, 0, 0, TAU); c.fill(); c.restore(); }
    ball(c, x, y, 15, '#f0c060', '#c9963c', '#7a5218'); }
}
// A stretch of side wall, 3.2 m wide and floor to ceiling: dark plum paper over a wood dado, a brass rail, and one wall lamp
// high up that washes the paper above the machines.
function paintWall(c: C2, w: number, h: number) {
  const random = lcg(31); c.fillStyle = upDown(c, 0, h, '#1a0f15', '#22131a', '#160d11'); c.fillRect(0, 0, w, h);
  c.fillStyle = 'rgba(255,220,200,.035)'; for (let j = 0; j < 12; j++) for (let i = 0; i < 12; i++) { const x = i * 44 + (j % 2) * 22, y = j * 30; c.beginPath(); c.moveTo(x, y - 11); c.lineTo(x + 8, y); c.lineTo(x, y + 11); c.lineTo(x - 8, y); c.closePath(); c.fill(); }
  const dado = h * 0.7; c.fillStyle = '#130b09'; c.fillRect(0, dado, w, h - dado);
  for (let x = 0; x < w; x += 8) { c.fillStyle = `rgba(0,0,0,${random() * 0.3})`; c.fillRect(x, dado, 3, h - dado); }
  c.strokeStyle = 'rgba(120,84,40,.5)'; c.lineWidth = 2; for (let i = 0; i < 4; i++) c.strokeRect(14 + i * (w / 4), dado + 22, w / 4 - 28, h - dado - 44);
  c.fillStyle = '#7a5626'; c.fillRect(0, dado - 4, w, 5); c.fillRect(0, 9, w, 3); c.fillStyle = '#0e0809'; c.fillRect(0, 0, 14, h); c.fillRect(w - 14, 0, 14, h); c.fillStyle = '#5c401c'; c.fillRect(14, 0, 2, dado); c.fillRect(w - 16, 0, 2, dado);
  c.globalCompositeOperation = 'lighter'; c.save(); c.translate(w / 2, h * 0.2); c.scale(0.62, 1); glowAt(c, 0, -30, 150, 'rgba(255,150,70,.5)', 'rgba(255,150,70,0)'); glowAt(c, 0, 40, 190, 'rgba(255,140,60,.34)', 'rgba(255,140,60,0)'); c.restore();
  c.globalCompositeOperation = 'source-over'; c.fillStyle = '#ffe2b0'; c.beginPath(); c.roundRect(w / 2 - 8, h * 0.2 - 16, 16, 32, 6); c.fill();
}
// The whole back wall, 19.2 m in 2048 pixels: the bar's lit shelves in the left corner, a curtained doorway in the middle
// (the dealer hides it), framed pictures under small lamps to the right.
function paintBack(c: C2, w: number, h: number) {
  const random = lcg(47), px = (x: number) => (x + HALL.halfWidth) / (2 * HALL.halfWidth) * w, py = (above: number) => h - above / (TOP - FLOOR) * h, m = w / (2 * HALL.halfWidth);
  c.fillStyle = upDown(c, 0, h, '#1a0f15', '#22131a', '#160d11'); c.fillRect(0, 0, w, h); c.fillStyle = '#130b09'; c.fillRect(0, py(1), w, h); c.fillStyle = '#7a5626'; c.fillRect(0, py(1) - 3, w, 4); c.fillRect(0, 8, w, 3);
  // doorway with a dark red curtain
  c.fillStyle = '#06030a'; c.fillRect(px(-1.5), py(2.7), 3 * m, h); for (let x = px(-1.4); x < px(1.4); x += 14) { c.fillStyle = `rgba(${90 + random() * 50},12,24,${0.3 + random() * 0.3})`; c.fillRect(x, py(2.6), 8, h); }
  // the bar: a dark mirror with three glass shelves lit from below, and bottles
  const x0 = px(-8.8), x1 = px(-5.0); c.fillStyle = upDown(c, py(2.7), py(1), '#241a14', '#3a2616', '#1a100a'); c.fillRect(x0, py(2.75), x1 - x0, py(1) - py(2.75)); c.strokeStyle = '#8a6630'; c.lineWidth = 4; c.strokeRect(x0, py(2.75), x1 - x0, py(1) - py(2.75));
  for (let shelf = 0; shelf < 3; shelf++) { const y = py(1.32 + shelf * 0.47);
    c.globalCompositeOperation = 'lighter'; c.fillStyle = upDown(c, y - 62, y + 6, 'rgba(255,170,80,0)', 'rgba(255,170,80,.5)'); c.fillRect(x0 + 8, y - 62, x1 - x0 - 16, 68); c.globalCompositeOperation = 'source-over';
    for (let x = x0 + 18; x < x1 - 22; x += 13 + random() * 9) { const tall = 20 + random() * 16, wide = 7 + random() * 4, k = random(), colour = k < 0.55 ? [0.9, 0.5 + random() * 0.2, 0.12] : k < 0.75 ? [0.2, 0.55, 0.3] : k < 0.9 ? [0.75, 0.8, 0.85] : [0.8, 0.25, 0.3];
      c.fillStyle = rgba(colour, 0.85); c.beginPath(); c.roundRect(x, y - tall, wide, tall, [wide / 2, wide / 2, 1, 1]); c.fill(); c.fillRect(x + wide / 2 - 1.5, y - tall - 11, 3, 13); c.fillStyle = 'rgba(255,240,210,.45)'; c.fillRect(x + 1.5, y - tall + 5, 1.5, tall - 9); }
    c.fillStyle = '#ffdf9a'; c.fillRect(x0 + 8, y, x1 - x0 - 16, 3); }
  // pictures under their own small lamps, and wall lamps between
  for (const x of [-3.6, 2.9, 5.6, 8.2]) { const cx = px(x), top = py(2.45); c.globalCompositeOperation = 'lighter'; c.save(); c.translate(cx, top); c.scale(1, 1.5); glowAt(c, 0, 20, 90, 'rgba(255,170,90,.42)', 'rgba(255,170,90,0)'); c.restore(); c.globalCompositeOperation = 'source-over';
    c.fillStyle = '#8a6630'; c.fillRect(cx - 62, top + 14, 124, 96); c.fillStyle = ['#3a1020', '#10203a', '#2a1a08', '#0e2a1c'][Math.floor(random() * 4)]; c.fillRect(cx - 56, top + 20, 112, 84); at(c, cx, top + 62, 0.62, SYMBOLS[Math.floor(random() * 8)]); c.fillStyle = '#ffe2b0'; c.fillRect(cx - 22, top + 2, 44, 5); }
}
// Ceiling, one coffer of 2.4 m: a dark recess between flat beams.
function paintCeiling(c: C2, w: number) {
  c.fillStyle = '#130e10'; c.fillRect(0, 0, w, w); const b = 30; c.fillStyle = '#0a0808'; c.fillRect(b, b, w - 2 * b, w - 2 * b);
  const g = c.createRadialGradient(w / 2, w / 2, 20, w / 2, w / 2, w * 0.6); g.addColorStop(0, 'rgba(46,32,28,.5)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(b, b, w - 2 * b, w - 2 * b);
  c.strokeStyle = 'rgba(120,84,40,.3)'; c.lineWidth = 3; c.strokeRect(b + 1, b + 1, w - 2 * b - 2, w - 2 * b - 2); c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 8; c.strokeRect(b + 10, b + 10, w - 2 * b - 20, w - 2 * b - 20);
}
// The light on the carpet, seen from above (far end of the hall at the top): a dim general light, darker close round every
// machine, a pool of the machine's colour in front of it, warm pools under the ceiling lamps and by the bar.
function paintLight(c: C2, size: number, layout: Layout) {
  const m = size / MAP.size, px = (x: number) => (x - MAP.x) * m, py = (z: number) => (z - MAP.z) * m;
  const pool = (x: number, z: number, r: number, colour: number[], strength: number) => { const g = c.createRadialGradient(px(x), py(z), 0, px(x), py(z), r * m); g.addColorStop(0, rgba(colour, strength)); g.addColorStop(0.45, rgba(colour, strength * 0.4)); g.addColorStop(1, rgba(colour, 0)); c.fillStyle = g; c.fillRect(px(x) - r * m, py(z) - r * m, 2 * r * m, 2 * r * m); };
  c.fillStyle = 'rgb(40,34,36)'; c.fillRect(0, 0, size, size);
  for (const k of layout.machines) pool(k.x, k.z, 0.8, [0, 0, 0], 0.8);
  c.globalCompositeOperation = 'lighter';
  for (const k of layout.machines) pool(k.x + Math.sin(k.turn) * 0.95, k.z + Math.cos(k.turn) * 0.95, 1.55, TINTS[k.tint], 0.5);
  for (const [x, z] of layout.downlights) pool(x, z, 1.7, [1, 0.72, 0.42], 0.5);
  pool(-6.9, -12.3, 3.2, [1, 0.6, 0.25], 0.45); pool(5.3, -8.2, 2.4, [1, 0.5, 0.3], 0.25);
  c.globalCompositeOperation = 'source-over';
}
// Cloud for the smoke: three different soft fields in the three colour channels, each repeating without a seam.
function cloudTexture() {
  const N = 256, data = new Uint8Array(N * N * 4), random = lcg(5);
  [[3, 6, 12, 24, 48], [5, 10, 20, 40, 80], [4, 8, 16, 32, 64]].forEach((octaves, channel) => {
    const field = new Float32Array(N * N); let lo = Infinity, hi = -Infinity;
    octaves.forEach((cells, o) => { const grid = Float32Array.from({length: cells * cells}, random), weight = 0.5 ** o;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const fx = x / N * cells, fy = y / N * cells, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = smooth(fx - x0), ty = smooth(fy - y0), x1 = (x0 + 1) % cells, y1 = (y0 + 1) % cells;
        field[y * N + x] += weight * ((grid[y0 * cells + x0] * (1 - tx) + grid[y0 * cells + x1] * tx) * (1 - ty) + (grid[y1 * cells + x0] * (1 - tx) + grid[y1 * cells + x1] * tx) * ty); } });
    for (const v of field) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    for (let i = 0; i < N * N; i++) data[i * 4 + channel] = Math.round((field[i] - lo) / (hi - lo) * 255);
  });
  for (let i = 0; i < N * N; i++) data[i * 4 + 3] = 255;
  const texture = new T.DataTexture(data, N, N, T.RGBAFormat); texture.wrapS = texture.wrapT = T.RepeatWrapping; texture.magFilter = T.LinearFilter; texture.minFilter = T.LinearMipmapLinearFilter; texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}

// ---- shaders ----------------------------------------------------------------------------------------------------------------
const f1 = (v: number) => v.toFixed(3);
const COMMON = `
float h1(float n){ n = fract(n * .1031); n *= n + 33.33; n *= n + n; return fract(n); }
vec2 mapUv(vec2 xz){ return vec2((xz.x - (${f1(MAP.x)})) / ${f1(MAP.size)}, 1. - (xz.y - (${f1(MAP.z)})) / ${f1(MAP.size)}); }
const float FLOOR = ${f1(FLOOR)}; const float MAP_GAIN = 1.7;`;
// The room's own distance fog (three's, set by scene3d-room.ts from what buildHall returns), thickened by the smoke.
// take: how much of it a surface takes; a lamp or a screen shines through and takes less.
// (A line that starts with # must stand on a line of its own, hence the line breaks round these pieces.)
const FOG_VERTEX = '\n#ifdef USE_FOG\nvarying float vFogDepth;\n#endif\n', FOG_DEPTH = '\n#ifdef USE_FOG\nvFogDepth = -mv.z;\n#endif\n';
const FOG_FRAGMENT = `
uniform float haze;
#ifdef USE_FOG
uniform vec3 fogColor; uniform float fogNear, fogFar; varying float vFogDepth;
#endif
vec3 hazed(vec3 c, float take){
#ifdef USE_FOG
  float f = min(1., smoothstep(fogNear, fogFar, vFogDepth) * (1. + 1.3 * haze));
  return mix(c, fogColor * (1. + 2.5 * haze), f * take);
#else
  return c;
#endif
}`;
// Walls, ceiling and back wall: a painted picture, brightened.
const FLAT_VERTEX = `varying vec2 vUv; ${FOG_VERTEX} void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.); ${FOG_DEPTH} gl_Position = projectionMatrix * mv; }`;
const FLAT_FRAGMENT = `varying vec2 vUv; uniform sampler2D map; uniform float gain; ${FOG_FRAGMENT} void main(){ gl_FragColor = vec4(hazed(texture2D(map, vUv).rgb * gain, 1.), 1.); }`;
// Carpet: the pattern times the light map, plus the pulse of a machine that is winning.
const FLOOR_VERTEX = `varying vec3 vP; ${FOG_VERTEX} void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.); ${FOG_DEPTH} gl_Position = projectionMatrix * mv; }`;
const FLOOR_FRAGMENT = `varying vec3 vP; uniform sampler2D carpet, light; uniform vec3 winAt[${WINS}], winGlow[${WINS}]; ${COMMON} ${FOG_FRAGMENT}
void main(){
  vec3 lit = texture2D(light, mapUv(vP.xz)).rgb * MAP_GAIN;
  for (int i = 0; i < ${WINS}; i++) { vec2 d = vP.xz - winAt[i].xz; lit += winGlow[i] / (1. + dot(d, d) * 2.5); }
  gl_FragColor = vec4(hazed(texture2D(carpet, vP.xz / 2.4).rgb * lit, 1.), 1.);
}`;
// Cabinets, stools, the bar and the ceiling lamps: a paint colour per corner (base.w = 1: a lamp, shown as it is), lit by the
// carpet's light half a step out from the face, a little from above, and by the machine's own screen on its own front.
const BODY_VERTEX = `attribute vec4 base;
#ifdef USE_INSTANCING
attribute vec3 tint;
#endif
uniform sampler2D light; varying vec3 vColour; varying float vTake; varying vec2 vUv; ${COMMON} ${FOG_VERTEX}
void main(){
  vUv = uv;
#ifdef USE_INSTANCING
  mat4 m = instanceMatrix; vec3 own = tint;
#else
  mat4 m = mat4(1.); vec3 own = vec3(0.);
#endif
  vec4 p = m * vec4(position, 1.); vec3 n = normalize(mat3(m) * normal), front = mat3(m) * vec3(0., 0., 1.); float h = p.y - FLOOR;
  vec3 pool = texture2D(light, mapUv(p.xz + n.xz * .5)).rgb * MAP_GAIN;
  vec3 lit = pool * (.45 * exp(-h * .8)) * (1. - .45 * abs(n.y)) + vec3(.09, .07, .06) * (.45 + .55 * n.y) + own * (.15 * max(0., dot(n, front)) * smoothstep(.3, 1., h));
  vColour = base.w > .5 ? base.rgb : base.rgb * lit; vTake = base.w > .5 ? .35 : 1.;
  vec4 mv = modelViewMatrix * p; ${FOG_DEPTH} gl_Position = projectionMatrix * mv;
}`;
// Every flat face is a little darker toward its edges, which is enough to make a box read as a made thing and not a block.
const BODY_FRAGMENT = `varying vec3 vColour; varying float vTake; varying vec2 vUv; ${FOG_FRAGMENT}
void main(){ float edge = min(min(vUv.x, 1. - vUv.x), min(vUv.y, 1. - vUv.y)); gl_FragColor = vec4(hazed(vColour * mix(1., .62 + .38 * smoothstep(0., .14, edge), step(.5, vTake)), vTake), 1.); }`;
// The lit faces of a machine. info: seed, spin period, its offset, wins every so many spins. look: reels across, 1 = dark video
// glass (0 = ivory reel strips), which upper glass, win slot + 1.
// (flat: what is the same at all four corners of a face reaches every pixel exactly as given. Left to blend, a 5 arrives
// as 4.9999 in one pixel and 5.0001 in the next, and whatever is counted with it comes out speckled.)
const FACE_VARYING = 'varying vec2 vUv; flat varying float vPart, vWin; flat varying vec3 vTint; flat varying vec4 vInfo, vLook;';
const FACE_VERTEX = `attribute float part; attribute vec3 tint; attribute vec4 info, look; uniform float winLevel[${WINS}];
${FACE_VARYING} ${FOG_VERTEX}
void main(){
  vUv = uv; vPart = part; vTint = tint; vInfo = info; vLook = look; vWin = 0.;
  for (int i = 0; i < ${WINS}; i++) if (abs(look.w - 1. - float(i)) < .5) vWin = winLevel[i];
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.); ${FOG_DEPTH} gl_Position = projectionMatrix * mv;
}`;
const FACE_FRAGMENT = `uniform sampler2D atlas; uniform float time, glow;
${FACE_VARYING} ${COMMON} ${FOG_FRAGMENT}
// A tile of the atlas, r = x, y, w, h in pixels from the top left. gx, gy: how fast uv changes across the screen, taken once
// at the top of main, because a lookup inside a branch may not work that out for itself.
vec4 tile(vec2 uv, vec4 r, vec2 gx, vec2 gy){ vec2 k = r.zw / ${ATLAS}.; return textureGrad(atlas, vec2(r.x + uv.x * r.z, ${ATLAS}. - r.y - (1. - uv.y) * r.w) / ${ATLAS}., gx * k, gy * k); }
vec3 reels(vec2 uv, vec2 gx, vec2 gy){
  float n = vLook.x; vec2 g = vec2(uv.x * n, uv.y * 3.); float col = floor(g.x);
  float c = (time + vInfo.z) / vInfo.y, spin = floor(c), phase = c - spin;
  // each reel passes a whole number of symbols per spin, fast at first and easing to a stop, left reel first; all rest from .6
  float travel = 14. + 5. * col, u = clamp(phase / (.32 + .28 * (col + 1.) / n), 0., 1.), rest = 1. - u;
  float y = g.y + (spin + 1. - rest * rest * rest) * travel, row = floor(y);
  float id = floor(h1(row * 1.37 + col * 17.3 + vInfo.x * 91.) * 7.999);
  if (vInfo.w > .5 && abs(mod(row - 1. - travel, vInfo.w * travel)) < .5) id = 0.;   // a winning spin stops on sevens across the middle
  // a turning reel is a smear: the lookup is told the picture moves fast up and down, and blurs it that way
  vec2 k = vec2(n, 3. * (1. + 14. * rest * rest * step(u, .999)));
  vec4 s = tile(.04 + vec2(fract(g.x), fract(y)) * .92, vec4(id * 128., 0., 128., 128.), gx * k, gy * k);
  vec3 paper = mix(vec3(.42, .38, .31), vTint * .2 + .025, vLook.y);
  float drum = .4 + .6 * sin(3.1416 * uv.y), gap = smoothstep(0., .05, fract(g.x)) * smoothstep(1., .95, fract(g.x));
  vec3 c3 = (paper * (1. - s.a) + s.rgb) * drum * (.2 + .8 * gap);
  return c3 * (1. + vWin * (.3 + .8 * (.5 + .5 * sin(time * 7.)) * (1. - smoothstep(.13, .2, abs(uv.y - .5)))));
}
void main(){
  vec2 gx = dFdx(vUv), gy = dFdy(vUv); vec3 c; float beat = .5 + .5 * sin(time * 7.), seed = vInfo.x;   // a win beats about once a second
  if (vPart < 1.5) {          // the reels behind glass, in a surround that glows in the machine's colour
    vec2 edge = vec2(.03 / .52, .03 / .5), p = (vUv - edge) / (1. - 2. * edge);
    if (p.x > 0. && p.x < 1. && p.y > 0. && p.y < 1.) c = reels(p, gx / (1. - 2. * edge), gy / (1. - 2. * edge)) * 1.5;
    else { vec2 into = min(vUv, 1. - vUv) / edge; c = vTint * (1.7 + .5 * sin(time * .7 + seed * 40.) + 3. * vWin * beat) * (.35 + .65 * sin(3.1416 * min(into.x, into.y))); }   // a tube of light: brightest along its middle
  } else if (vPart < 2.5) {   // the painted glass above, with a sheen that passes now and then
    float sweep = fract(time / (5. + 4. * seed) + seed * 3.) * 4. - 1.5;
    c = tile(vUv, vec4(vLook.z * 340., 276., 340., 176.), gx, gy).rgb * (.75 + 1.1 * smoothstep(.14, 0., abs(vUv.x + vUv.y * .4 - sweep)));
  } else if (vPart < 3.5) {   // the sign on top: a word on a lit plate, and a row of bulbs chasing round its edge
    float l = tile(vUv, vec4(floor(fract(seed * 7.) * 3.999) * 256., 168., 256., 100.), gx, gy).r;
    c = vTint * (.25 + 1.9 * l) + vec3(1., .9, .7) * smoothstep(.75, 1., l);
    vec2 m = vec2(.52, .2), p = vUv * m; float d = min(min(p.x, m.x - p.x), min(p.y, m.y - p.y));
    if (d < .026) {
      float s = p.y < .026 ? p.x : p.x > m.x - .026 ? m.x + p.y : p.y > m.y - .026 ? 2. * m.x + m.y - p.x : 2. * m.x + 2. * m.y - p.y, k = s / .04;
      float on = step(mod(floor(k) - floor(time * (3. + 9. * vWin)), 3.), .5), bulb = smoothstep(.46, .22, length(vec2(fract(k) - .5, (d - .013) / .04)));
      c = mix(vec3(.02), vec3(3.4, 2.5, 1.1) * (.14 + .86 * on), bulb);
    }
    c *= 1. + 1.4 * vWin * beat;
  } else if (vPart < 4.5) c = tile(vUv, vec4(floor(fract(seed * 13.) * 2.999) * 300., 460., 300., 248.), gx, gy).rgb * .45;   // the glass below
  else if (vPart < 5.5) c = tile(vUv, vec4(0., 716., 280., 96.), gx, gy).rgb * .9;                                         // buttons
  else c = vTint * (1.5 + .9 * sin(vUv.y * 7. - time * 1.3 + seed * 30.) + 3. * vWin * beat) * (.3 + .7 * sin(3.1416 * vUv.x));   // strips of light up the front edges
  gl_FragColor = vec4(hazed(c * glow, .45), 1.);
}`;
// Neon on the walls, added to what is behind it. flicker = 1: the tube that the lab's flicker switch plays with.
const NEON_VERTEX = 'attribute vec4 rect; attribute float flicker; uniform float lamp; varying vec2 vUv; varying float vLevel; void main(){ vUv = (vec2(rect.x, 512. - rect.y - rect.w) + uv * rect.zw) / vec2(1024., 512.); vLevel = mix(1., lamp * lamp, flicker); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }';
const NEON_FRAGMENT = 'uniform sampler2D map; varying vec2 vUv; varying float vLevel; void main(){ vec3 c = texture2D(map, vUv).rgb; gl_FragColor = vec4(c * c * 5. * vLevel, 0.); }';
// The far screen: three pages that take turns, with a short fade between them, and a light running along its lower edge.
const PAGE_FRAGMENT = `uniform sampler2D atlas; uniform float time; varying vec2 vUv; ${FOG_FRAGMENT}
vec3 page(float i){ return texture2D(atlas, vec2(i * 340. + 2. + vUv.x * 336., ${ATLAS}. - 820. - (1. - vUv.y) * 140.) / ${ATLAS}.).rgb; }
void main(){ float c = time / 9., k = floor(c); vec3 col = mix(page(mod(k, 3.)), page(mod(k + 1., 3.)), smoothstep(.93, 1., c - k));
  col += vec3(1., .7, .3) * step(vUv.y, .05) * step(.5, fract(vUv.x * 14. - time * .6)); gl_FragColor = vec4(hazed(col * 1.5, .45), 1.); }`;
// Light caught in the air, added to the picture: a soft halo a step in front of every screen, and a cone under every
// ceiling lamp. Both are faint in clear air and grow with the smoke. uv is the corner, -1 to 1; shape = half width, half
// height, kind (0 halo, 1 cone), seed. A halo's normal is the way its screen faces: seen from behind it is not there.
const GLOW_VERTEX = `attribute vec4 shape; attribute vec3 colour; uniform float air; varying vec2 vC; varying vec3 vColour; varying vec2 vKind;
void main(){
  float k = length(modelViewMatrix[0].xyz), level; vec4 mv = modelViewMatrix * vec4(position, 1.);
  if (shape.z < .5) { level = (.09 + .3 * air) * smoothstep(-.1, .7, dot(normalize(normalMatrix * normal), normalize(-mv.xyz))); mv.xyz *= 1. - .35 * k / length(mv.xyz); mv.xy += uv * shape.xy * k; }
  else { level = .012 + .06 * air; vec3 up = normalize((modelViewMatrix * vec4(0., 1., 0., 0.)).xyz); mv.xyz += (normalize(cross(up, vec3(0., 0., 1.))) * uv.x * shape.x + up * uv.y * shape.y) * k; }
  vC = uv; vColour = colour * level; vKind = shape.zw; gl_Position = projectionMatrix * mv;
}`;
const GLOW_FRAGMENT = `uniform sampler2D cloud; uniform float time; varying vec2 vC; varying vec3 vColour; varying vec2 vKind;
void main(){
  float a;
  if (vKind.x < .5) { float r = dot(vC, vC); a = max(0., exp(-r * 4.5) - .0111); }
  else { float down = .5 - .5 * vC.y, wide = mix(.07, 1., down), x = abs(vC.x) / wide;   // narrow at the lamp, wide and thin at the carpet
    float drift = textureLod(cloud, vec2(vC.x * .3 + vKind.y * 5., down * .5 - time * .006 + vKind.y * 3.), 1.).g;
    a = exp(-x * x * 3.) * .16 / (wide + .1) * (.45 + 1.1 * drift) * smoothstep(1., .82, down) * smoothstep(0., .03, down) * (1. - smoothstep(.75, 1., x)); }
  gl_FragColor = vec4(vColour * a, 0.);
}`;
// The low smoke: upright sheets across the hall, one behind the other, each a slice through slowly drifting cloud that is
// thick at the carpet and ragged at the top. It takes its light from the carpet's light map under it, so it glows in the
// colour of whatever machine it drifts past. info = seed, and 1 for the sheets that stand along the side aisles.
const SMOKE_VERTEX = `attribute vec2 info; varying vec3 vP; varying vec3 vInfo;
void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.); float k = length(modelViewMatrix[0].xyz);
  vInfo = vec3(info.x, mix(position.x, position.z, info.y), smoothstep(.8, 2., -mv.z / k)); gl_Position = projectionMatrix * mv; }`;
const SMOKE_FRAGMENT = `uniform sampler2D cloud, light; uniform float time, air; uniform vec3 winAt[${WINS}], winGlow[${WINS}]; varying vec3 vP; varying vec3 vInfo; ${COMMON}
void main(){
  float h = vP.y - FLOOR, seed = vInfo.x, way = (fract(seed * 7.3) > .5 ? 1. : -1.) * (.6 + fract(seed * 3.1));   // every sheet drifts its own way
  vec2 q = vec2(vInfo.y * .085 + seed * 1.7, h * .2 + seed * .9);
  // three sizes of cloud; each pushes the next one about, which is what makes it curl instead of slide
  float big = texture2D(cloud, q + vec2(time * .007 * way, time * .0016)).r;
  float mid = texture2D(cloud, q * 3.1 + vec2(-time * .013 * way, -time * .004) + big * .3).g;
  float fine = texture2D(cloud, q * 7.3 + vec2(time * .019 * way, -time * .008) + mid * .2).b;
  float n = big * .5 + mid * .33 + fine * .17;
  float top = (.18 + 1.35 * smoothstep(.34, .78, n)) * (.8 + .5 * air);    // how high it stands here, metres
  float body = 1. - smoothstep(0., top, h);
  float d = body * body * (.06 + 1.7 * smoothstep(.28, .8, n)) * (1.25 + air) * .5;   // thin between the banks of it, so that it reads as drifting smoke and not as an even mist
  d *= smoothstep(0., .25, h) * (1. - smoothstep(1.5, 1.9, h)) * vInfo.z;  // no line where a sheet meets the carpet, its top edge or the lens
  vec3 lit = vec3(.05, .042, .046) + texture2D(light, mapUv(vP.xz)).rgb * (2.1 * exp(-h * .9));
  for (int i = 0; i < ${WINS}; i++) { vec2 e = vP.xz - winAt[i].xz; lit += winGlow[i] * (.4 / (1. + dot(e, e) * 2.5)); }
  gl_FragColor = vec4(lit * d, d * .5);
}`;

// ---- the hall -----------------------------------------------------------------------------------------------------------------
export function buildHall(): BuiltRoom {
  const group = new T.Group(), layout = hallLayout(), {halfWidth: X, back, front} = HALL, depth = (front - back) / 2, midZ = (front + back) / 2, height = TOP - FLOOR, midY = (TOP + FLOOR) / 2;
  // what the shaders share: the clock, how much smoke, the haze it adds to the distance, the flickering tube, the wins
  const time = {value: 0}, air = {value: 0}, haze = {value: 0}, lamp = {value: 1}, glow = {value: 0.55};
  const winLevels = new Float32Array(WINS), winAt = new Float32Array(WINS * 3), winGlow = new Float32Array(WINS * 3);
  layout.winners.forEach((m, i) => { winAt[i * 3] = m.x + Math.sin(m.turn) * 0.8; winAt[i * 3 + 2] = m.z + Math.cos(m.turn) * 0.8; });
  const wins = {winLevel: {value: winLevels}, winAt: {value: winAt}, winGlow: {value: winGlow}};
  const shader = (vertexShader: string, fragmentShader: string, uniforms: Record<string, {value: unknown}>, more: Record<string, unknown> = {}) =>
    new T.ShaderMaterial({vertexShader, fragmentShader, fog: true, uniforms: {fogColor: {value: new T.Color()}, fogNear: {value: 1}, fogFar: {value: 100}, haze, ...uniforms}, ...more});
  // light added to the picture, leaving its alpha alone; the smoke also dims what is behind it
  const added = {transparent: true, depthWrite: false, fog: false, blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneFactor, blendSrcAlpha: T.ZeroFactor, blendDstAlpha: T.OneFactor};
  const mesh = (geo: T.BufferGeometry, material: T.Material, order = 0) => { const m = new T.Mesh(geo, material); m.frustumCulled = false; m.renderOrder = order; group.add(m); return m; };

  const atlas = paint(ATLAS, ATLAS, paintAtlas); atlas.premultiplyAlpha = true;
  const light = paint(512, 512, c => paintLight(c, 512, layout)), cloud = cloudTexture();

  // floor, ceiling, walls
  { const s = soup(); quad(s, [0, FLOOR, midZ], [X, 0, 0], [0, 0, -depth]); mesh(geometry(s), shader(FLOOR_VERTEX, FLOOR_FRAGMENT, {carpet: {value: paint(512, 512, paintCarpet, true)}, light: {value: light}, ...wins})); }
  { const s = soup(); quad(s, [0, TOP, midZ], [X, 0, 0], [0, 0, depth], [], [2 * X / 2.4, 2 * depth / 2.4]); mesh(geometry(s), shader(FLAT_VERTEX, FLAT_FRAGMENT, {map: {value: paint(512, 512, paintCeiling, true)}, gain: {value: 1.3}})); }
  { const s = soup(), tile = [2 * depth / 3.2, 1]; quad(s, [-X, midY, midZ], [0, 0, -depth], [0, height / 2, 0], [], tile); quad(s, [X, midY, midZ], [0, 0, depth], [0, height / 2, 0], [], tile); quad(s, [0, midY, front], [-X, 0, 0], [0, height / 2, 0], [], [2 * X / 3.2, 1]);
    mesh(geometry(s), shader(FLAT_VERTEX, FLAT_FRAGMENT, {map: {value: paint(512, 512, paintWall, true)}, gain: {value: 1.6}})); }
  { const s = soup(); quad(s, [0, midY, back], [X, 0, 0], [0, height / 2, 0]); mesh(geometry(s), shader(FLAT_VERTEX, FLAT_FRAGMENT, {map: {value: paint(2048, 384, paintBack)}, gain: {value: 1.6}})); }

  // the machines: two instanced meshes that share the placing, the cabinets and their lit faces
  { const count = layout.machines.length, tint = new Float32Array(count * 3), info = new Float32Array(count * 4), look = new Float32Array(count * 4), place = new T.Object3D();
    const bodies = new T.InstancedMesh(geometry(machineBody(), [['base', 4]]), shader(BODY_VERTEX, BODY_FRAGMENT, {light: {value: light}}), count);
    const faces = new T.InstancedMesh(geometry(machineFaces(), [['part', 1]]), shader(FACE_VERTEX, FACE_FRAGMENT, {atlas: {value: atlas}, time, glow, winLevel: wins.winLevel}, {polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2}), count);
    layout.machines.forEach((m, i) => { place.position.set(m.x, FLOOR, m.z); place.rotation.y = m.turn; place.updateMatrix(); bodies.setMatrixAt(i, place.matrix); faces.setMatrixAt(i, place.matrix);
      tint.set(TINTS[m.tint], i * 3); info.set([m.seed, m.period, m.offset, m.every], i * 4); const video = m.seed > 0.2 ? 1 : 0; look.set([video ? 5 : 3, video, Math.floor(m.seed * 977) % 3, m.slot + 1], i * 4); });
    for (const item of [bodies, faces]) { item.geometry.setAttribute('tint', new T.InstancedBufferAttribute(tint, 3)); item.frustumCulled = false; group.add(item); }
    faces.geometry.setAttribute('info', new T.InstancedBufferAttribute(info, 4)); faces.geometry.setAttribute('look', new T.InstancedBufferAttribute(look, 4)); }

  // everything else that is solid: the bar with its stools and the light under its top, the far screen's case, the ceiling lamps
  { const s = soup(), wood = [0.3, 0.16, 0.09, 0], brass = [0.6, 0.44, 0.2, 0];
    box(s, -6.9, FLOOR + 0.55, -12.75, 3.6, 1.1, 0.6, wood); box(s, -6.9, FLOOR + 1.12, -12.7, 3.76, 0.05, 0.78, brass); quad(s, [-6.9, FLOOR + 1.06, -12.44], [1.76, 0, 0], [0, 0.018, 0], [3.2, 1.6, 0.5, 1]);
    for (let i = 0; i < 5; i++) stool(s, -8.3 + i * 0.7, -11.95);
    box(s, 5.3, 1.72, -9.5, 2.42, 1.07, 0.1, [0.06, 0.055, 0.06, 0]); for (const x of [4.5, 6.1]) box(s, x, 2.33, -9.5, 0.04, 0.16, 0.04, CHROME);
    for (const [x, z] of layout.downlights) quad(s, [x, TOP - 0.004, z], [0.055, 0, 0], [0, 0, 0.055], [2.6, 1.8, 0.95, 1]);   // small square lamps set in the ceiling, facing down
    mesh(geometry(s, [['base', 4]]), shader(BODY_VERTEX, BODY_FRAGMENT, {light: {value: light}})); }

  // neon: the bar's sign flickers with the lab's switch, the others burn steadily
  { const s = soup(), wall = X - 0.03, sign = (c: V3, r: V3, tall: number, rect: number[], flicker = 0) => quad(s, c, r, [0, tall, 0], [...rect, flicker]);
    sign([-6.9, 1.9, back + 0.03], [0.75, 0, 0], 0.375, NEON.bar, 1); sign([6.4, 1.92, back + 0.03], [1.3, 0, 0], 0.315, NEON.jackpot);
    sign([wall, 1.85, -5.6], [0, 0, 0.6], 0.38, NEON.sevens); sign([-wall, 1.85, -4.6], [0, 0, -0.36], 0.36, NEON.star); sign([-wall, 1.85, -7.4], [0, 0, -0.3], 0.37, NEON.cherries);
    mesh(geometry(s, [['rect', 4], ['flicker', 1]]), new T.ShaderMaterial({vertexShader: NEON_VERTEX, fragmentShader: NEON_FRAGMENT, uniforms: {map: {value: paint(1024, 512, paintNeon)}, lamp}, ...added}), 1); }

  // the far screen
  { const s = soup(); quad(s, [5.3, 1.72, -9.44], [1.15, 0, 0], [0, 0.475, 0]); mesh(geometry(s), shader(FLAT_VERTEX, PAGE_FRAGMENT, {atlas: {value: atlas}, time})); }

  // light in the air
  { const s = soup(), sprite = (c: V3, facing: V3, w: number, h: number, kind: number, seed: number, colour: number[]) => { for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) { s.position.push(...c); s.normal.push(...facing); s.uv.push(a, b); s.extra.push(w, h, kind, seed, ...colour); } };
    for (const m of layout.machines) { const fx = Math.sin(m.turn), fz = Math.cos(m.turn); sprite([m.x + fx * SCREEN[2], FLOOR + SCREEN[1] + 0.15, m.z + fz * SCREEN[2]], [fx, 0, fz], 0.95, 0.95, 0, m.seed, TINTS[m.tint].map(v => v * 0.8 + 0.12)); }
    layout.downlights.forEach(([x, z], i) => sprite([x, midY, z], [0, 0, 1], 0.8, height / 2, 1, (i * 0.37) % 1, [1, 0.74, 0.44]));
    mesh(geometry(s, [['shape', 4], ['colour', 3]]), new T.ShaderMaterial({vertexShader: GLOW_VERTEX, fragmentShader: GLOW_FRAGMENT, uniforms: {cloud: {value: cloud}, time, air}, ...added}), 2); }

  // the smoke, far sheets first so that the near ones lie over them
  { const s = soup(), tall = 0.95; let seed = 0.13; const next = () => (seed = (seed * 7.31 + 0.137) % 1);
    for (const z of [-13.2, -11.9, -10.7, -9.6, -8.6, -7.7, -6.9, -6.1, -5.4, -4.7, -4.1, -3.5, -2.9, -2.3, -1.7]) quad(s, [0, FLOOR + tall, z], [X, 0, 0], [0, tall, 0], [next(), 0]);
    for (const x of [8.5, 7, 5.6, 4.3, 3.1]) for (const side of [-1, 1]) quad(s, [side * x, FLOOR + tall, 1.9], [0, 0, 3.3], [0, tall, 0], [next(), 1]);
    mesh(geometry(s, [['info', 2]]), new T.ShaderMaterial({vertexShader: SMOKE_VERTEX, fragmentShader: SMOKE_FRAGMENT, uniforms: {cloud: {value: cloud}, light: {value: light}, time, air, winAt: wins.winAt, winGlow: wins.winGlow},
      ...added, blendDst: T.OneMinusSrcAlphaFactor, side: T.DoubleSide}), 3); }

  return {
    group, fog: {color: 0x150d12, near: 4, far: 44},
    update(seconds, live) {
      time.value = seconds; air.value = clamp01(live.air || 0); haze.value = 0.25 + 0.75 * air.value; lamp.value = Number.isFinite(live.lamp) ? live.lamp : 1;
      // a winning machine's light on the carpet and in the smoke beats with its screen (the same sine as in the shader), but shallowly
      layout.winners.forEach((m, i) => { const level = winLevel(seconds, m), beat = 0.7 + 0.3 * Math.sin(seconds * 7); winLevels[i] = level; for (let k = 0; k < 3; k++) winGlow[i * 3 + k] = TINTS[m.tint][k] * level * beat * 0.8; });
      return 1; // the hall's own lamps do not dim the room; the flickering lamp is one neon tube
    },
  };
}
