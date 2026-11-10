// Proof of "rendered cards on top of the film": the film keeps dealer, hand and motion, the card is a
// rendered layer that follows the tracked colour surface. Keeps the green background.
//   node tools/render-card-proof.ts [--stress] [--ramp-frames <n>] [--out <dir>]
// Needs assets/tracking/<deal clip>/card-track.json from tools/track-card.ts. Writes under
// D:/dealer-scratch/review/claude-overlay/: ra.mp4 (film as is), b1-samma-plats.mp4, b2-kort-2.mp4,
// jamforelse.mp4, contact sheets, index.html and proof.json. --stress adds two B2 variants (double and
// reversed displacement). Frames are piped; nothing is dumped to disk.
import {readFile, writeFile, mkdir, statfs} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawn, execFileSync, type ChildProcess} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import {classify, morph, homography, project, grown, inside, centre, signedArea, dist, offsetRamp, YELLOW, BLUE, TABLE, SKIN, DARK, TINT, SHADE, type Pt, type Side} from '../src/card-track.ts';
import {validatePlan, flatQuad, quad as freeQuad} from '../src/placement-model.ts';

if (path.resolve(process.cwd()) !== path.resolve(fileURLToPath(new URL('../', import.meta.url)))) throw Error('Run from the dealer checkout.');
sharp.concurrency(1);
const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const DEAL = 'pamela-p4-c1-plan-deal-02', RETURN = 'pamela-p4-c1-plan-return-ready-01', CUT = 105, FROM = 'P4.C1', TO = 'P4.C2';
const OUT = arg('--out') ?? 'D:/dealer-scratch/review/claude-overlay', STRESS = process.argv.includes('--stress'), RAMP_FRAMES = Number(arg('--ramp-frames') ?? 8);
const W = 1764, H = 1174, N = W * H, FPS = 30, RIM = 2.5; // RIM: the pale rim outside the tracked colour core
const env = existsSync('D:/dealer-scratch/tmp') ? {...process.env, TEMP: 'D:/dealer-scratch/tmp', TMP: 'D:/dealer-scratch/tmp'} : process.env;
const ffmpeg = process.env.FFMPEG ?? 'ffmpeg';
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

// ---- inputs ----
type TrackFrame = {frame: number; side: Side; quad: number[][] | null; edge: number[][] | null; area: number; confidence: number; shoeShare?: number};
const trackBytes = await readFile(`assets/tracking/${DEAL}/card-track.json`).catch(() => { throw Error(`Run: node tools/track-card.ts ${DEAL}`); });
const track: {source: {sha256: string}; frames: TrackFrame[]; edgeWindow: [number, number] | null; restFrom: number | null; restQuad: number[][] | null; shoeWindow: {box: number[]} | null} = JSON.parse(trackBytes.toString());
const dealVideo = `assets/motions/${DEAL}/source.mp4`, returnVideo = `assets/motions/${RETURN}/source.mp4`;
if (sha(await readFile(dealVideo)) !== track.source.sha256) throw Error('The deal clip changed since it was tracked.');
if (!track.edgeWindow || track.restFrom === null || !track.restQuad || track.restFrom >= CUT) throw Error('The track has no flip or no resting card before the cut.');
const pts = (q: number[][]): Pt[] => q.map(([x, y]) => ({x, y}));
const planBytes = await readFile('placements/default.json'), plan = JSON.parse(planBytes.toString()); validatePlan(plan);
const planQuad = (target: string): Pt[] => { const g = plan.targets[target].geometry.native, ref = plan.targets['P4.C1'].geometry.native;
  const q = plan.tableProjection?.mode === 'flat' ? flatQuad(g, ref, 'native', plan.tableProjection.heading) : freeQuad(g, 'native'); return q.map((p: Pt) => ({x: p.x * (W - 1) / 1761, y: p.y})); };
const first = planQuad(FROM), second = planQuad(TO), restFilm = grown(pts(track.restQuad), RIM);
if (signedArea(first) <= 0 || signedArea(second) <= 0) throw Error('Plan quads must run clockwise from the top left.');
// Each resting corner is paired with the nearest corner of the plan's first card; the same corner of the second card is where it must end up.
const pair = restFilm.map(p => first.reduce((best, q, k) => dist(p, q) < dist(p, first[best]) ? k : best, 0));
if (new Set(pair).size !== 4) throw Error('The resting card does not line up with the planned first card.');
const landingShift = restFilm.map((p, k) => ({x: second[pair[k]].x - p.x, y: second[pair[k]].y - p.y}));
const meanShift = {x: landingShift.reduce((s, p) => s + p.x, 0) / 4, y: landingShift.reduce((s, p) => s + p.y, 0) / 4};
const rampStart = track.edgeWindow[0] - 1, rampEnd = track.edgeWindow[1] + 1 + RAMP_FRAMES;
const free = await statfs(path.parse(path.resolve(OUT)).root).then(s => Number(s.bavail) * Number(s.bsize)).catch(() => Infinity);
if (free < 2 * 2 ** 30) throw Error('Less than 2 GB free on the review drive.');
await mkdir(OUT, {recursive: true});

// ---- card artwork: generated here, deliberately neither yellow nor blue so film colour that is left over stands out ----
const TW = 384, TH = 536, spade = 'M0,-.5C.16,-.3 .5,-.12 .5,.08A.25,.25 0 0 1 0,.08A.25,.25 0 0 1-.5,.08C-.5,-.12-.16,-.3 0,-.5ZM.06,.2C.06,.38 .16,.46 .27,.5L-.27,.5C-.16,.46-.06,.38-.06,.2Z';
const letterA = 'M0,1L.38,0L.62,0L1,1L.78,1L.7,.76L.3,.76L.22,1ZM.36,.58L.64,.58L.5,.16Z';
const index = `<g fill="#0a0b0d"><path transform="translate(26,30) scale(56,70)" fill-rule="evenodd" d="${letterA}"/><path transform="translate(54,138) scale(52)" d="${spade}"/></g>`;
const faceSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TW}" height="${TH}"><rect x="1" y="1" width="${TW - 2}" height="${TH - 2}" rx="24" fill="#f4f2ec" stroke="#8a8f99" stroke-width="2.5"/>
  ${index}<g transform="rotate(180 ${TW / 2} ${TH / 2})">${index}</g><path transform="translate(${TW / 2},${TH / 2 - 6}) scale(230)" fill="#0a0b0d" d="${spade}"/></svg>`;
const lattice = Array.from({length: 15}, (_, k) => `<path d="M${-TH + k * 64},0L${k * 64},${TH}M${k * 64},0L${-TH + k * 64},${TH}" stroke="#f4f2ec" stroke-width="5" opacity=".55"/>`).join('');
const backSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TW}" height="${TH}"><defs><clipPath id="c"><rect x="30" y="30" width="${TW - 60}" height="${TH - 60}" rx="12"/></clipPath></defs>
  <rect x="1" y="1" width="${TW - 2}" height="${TH - 2}" rx="24" fill="#f4f2ec" stroke="#8a8f99" stroke-width="2.5"/><rect x="30" y="30" width="${TW - 60}" height="${TH - 60}" rx="12" fill="#a51d2d"/>
  <g clip-path="url(#c)">${lattice}</g><circle cx="${TW / 2}" cy="${TH / 2}" r="74" fill="#a51d2d" stroke="#f4f2ec" stroke-width="10"/><path transform="translate(${TW / 2},${TH / 2}) rotate(45) scale(62)" fill="#f4f2ec" d="M-.5,-.5H.5V.5H-.5Z"/></svg>`;
type Tex = {w: number; h: number; px: Buffer}[];
async function texture(svg: string, name: string): Promise<Tex> {
  const png = await sharp(Buffer.from(svg)).png().toBuffer(); await writeFile(`${OUT}/${name}.png`, png); const levels: Tex = [];
  for (const scale of [1, 2, 4, 8]) { const w = Math.round(TW / scale), h = Math.round(TH / scale); levels.push({w, h, px: await sharp(png).resize(w, h, {kernel: 'lanczos3'}).ensureAlpha().raw().toBuffer()}); }
  return levels;
}
const face = await texture(faceSvg, 'kort-framsida'), back = await texture(backSvg, 'kort-baksida');
const PAPER = [226, 224, 216]; // the cut edge of the card, seen edge-on

// ---- frame plumbing ----
async function* decode(file: string, count = 0): AsyncGenerator<Buffer> {
  const child = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', file, ...(count ? ['-frames:v', String(count)] : []), '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true, env});
  let frame = Buffer.allocUnsafe(N * 3), filled = 0;
  for await (const chunk of child.stdout as AsyncIterable<Buffer>) { let at = 0;
    while (at < chunk.length) { const take = Math.min(chunk.length - at, frame.length - filled); chunk.copy(frame, filled, at, at + take); filled += take; at += take;
      if (filled === frame.length) { yield frame; frame = Buffer.allocUnsafe(N * 3); filled = 0; } } }
}
/** The chained film: the deal up to the cut, then the whole return. `deal` is the deal frame index, or null in the return. */
async function* film(): AsyncGenerator<{rgb: Buffer; n: number; deal: number | null}> {
  let n = 0, k = 0; for await (const rgb of decode(dealVideo, CUT)) yield {rgb, n: n++, deal: k++};
  if (k < CUT) throw Error('The deal clip is shorter than the cut frame.');
  for await (const rgb of decode(returnVideo)) yield {rgb, n: n++, deal: null};
}
function encoder(file: string): {child: ChildProcess; write: (b: Buffer) => Promise<void>; close: () => Promise<void>} {
  const child = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-g', '15', '-movflags', '+faststart', file], {stdio: ['pipe', 'ignore', 'inherit'], windowsHide: true, env});
  const done = new Promise<void>((resolve, reject) => { child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(Error(`ffmpeg ${code} for ${file}`))); });
  return {child, write: async b => { if (!child.stdin!.write(b)) await new Promise(resolve => child.stdin!.once('drain', resolve)); }, close: async () => { child.stdin!.end(); await done; }};
}

// ---- compositing ----
type Box = {x0: number; y0: number; w: number; h: number};
const boxOf = (p: Pt[], pad: number): Box => { const x0 = Math.max(0, Math.floor(Math.min(...p.map(q => q.x)) - pad)), y0 = Math.max(0, Math.floor(Math.min(...p.map(q => q.y)) - pad));
  return {x0, y0, w: Math.max(1, Math.min(W - 1, Math.ceil(Math.max(...p.map(q => q.x)) + pad)) - x0 + 1), h: Math.max(1, Math.min(H - 1, Math.ceil(Math.max(...p.map(q => q.y)) + pad)) - y0 + 1)}; };
const pick = (cls: Uint8Array, b: Box, test: (c: number, i: number) => boolean): Uint8Array => { const m = new Uint8Array(b.w * b.h); for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) { const i = (y + b.y0) * W + x + b.x0; if (test(cls[i], i)) m[y * b.w + x] = 1; } return m; };
/** Skin (and the dark sleeve when asked) with small holes closed and thin lines, such as a skin-toned card rim, dropped. */
const hand = (cls: Uint8Array, b: Box, sleeve: boolean): Uint8Array => { const raw = pick(cls, b, c => c === SKIN || (sleeve && c === DARK)); return morph(morph(morph(morph(raw, b.w, b.h, 2, true), b.w, b.h, 2, false), b.w, b.h, 1, false), b.w, b.h, 1, true); };
/** Film pixels that carry card colour: the tracked yellow or blue, yellow in finger shadow, yellow blur over the table, and blue mixed into its surroundings. */
const cardish = (rgb: Buffer, cls: Uint8Array, i: number, tint: boolean) => cls[i] === YELLOW || cls[i] === BLUE || cls[i] === SHADE || (tint && cls[i] === TINT) || (rgb[i * 3 + 2] > rgb[i * 3] + 40 && rgb[i * 3 + 2] > 0.6 * rgb[i * 3 + 1]);
const cover = (q: Pt[], x: number, y: number) => (+inside(q, x - 0.25, y - 0.25) + +inside(q, x + 0.25, y - 0.25) + +inside(q, x - 0.25, y + 0.25) + +inside(q, x + 0.25, y + 0.25)) / 4;
const UNIT: Pt[] = [{x: 0, y: 0}, {x: 1, y: 0}, {x: 1, y: 1}, {x: 0, y: 1}];
const ribbon = (s: Pt[], half: number, extend = 0): Pt[] => { const l = dist(s[0], s[1]) || 1, ux = (s[1].x - s[0].x) / l, uy = (s[1].y - s[0].y) / l, a = {x: s[0].x - ux * extend, y: s[0].y - uy * extend}, b = {x: s[1].x + ux * extend, y: s[1].y + uy * extend};
  const q = [{x: a.x - uy * half, y: a.y + ux * half}, {x: b.x - uy * half, y: b.y + ux * half}, {x: b.x + uy * half, y: b.y - ux * half}, {x: a.x + uy * half, y: a.y - ux * half}]; return signedArea(q) < 0 ? q.reverse() : q; };
const onto = (s: Pt[], x: number, y: number): Pt => { const l = dist(s[0], s[1]) || 1, ux = (s[1].x - s[0].x) / l, uy = (s[1].y - s[0].y) / l, t = (x - s[0].x) * ux + (y - s[0].y) * uy; return {x: s[0].x + ux * t, y: s[0].y + uy * t}; };

/**
 * Warps a texture onto a quad given in texture order. `allow` is how much of the card shows at a pixel
 * and `shade` its brightness. `beyond` (optional) marks film pixels that still show card colour up to
 * `over` px outside the quad - the card's end between or under fingertips - which get the card's margin.
 * `fringe` (optional) gives, for a soft finger edge over the table, the share of table in that pixel;
 * that share is swapped for card instead of covering the finger. `mark` receives the alpha put down.
 */
function paint(dst: Buffer, q: Pt[], tex: Tex, allow: (x: number, y: number) => number, shade: (x: number, y: number) => number,
  opt: {mark?: (x: number, y: number, a: number) => void; beyond?: (x: number, y: number) => boolean; over?: number; fringe?: (x: number, y: number) => number} = {}) {
  if (signedArea(q) <= 1) return; const h = homography(q, UNIT), wide = opt.beyond ? grown(q, opt.over ?? 12) : q, b = boxOf(wide, 1), level = tex[Math.max(0, Math.min(tex.length - 1, Math.round(Math.log2(Math.sqrt(TW * TH / signedArea(q))) - 0.3)))];
  for (let y = b.y0; y < b.y0 + b.h; y++) for (let x = b.x0; x < b.x0 + b.w; x++) { let c = cover(q, x, y), see = c ? allow(x, y) : 0, spill = false, soft = 0;
    if (c < 1 && opt.beyond && inside(wide, x, y) && opt.beyond(x, y)) { c = 1; see = 1; spill = true; }
    if (c && see <= 0 && opt.fringe) { soft = opt.fringe(x, y); if (soft > 0) see = soft; }
    if (!c || see <= 0) continue;
    const t = project(h, x, y), lo = spill ? 0.035 : 0, tu = Math.min(1 - lo, Math.max(lo, t.x)), tv = Math.min(1 - lo, Math.max(lo, t.y));
    const u = Math.min(level.w - 1.001, Math.max(0, tu * level.w - 0.5)), v = Math.min(level.h - 1.001, Math.max(0, tv * level.h - 0.5)), iu = Math.floor(u), iv = Math.floor(v), fu = u - iu, fv = v - iv;
    const o = (iv * level.w + iu) * 4, tap = (k: number) => (level.px[o + k] * (1 - fu) + level.px[o + 4 + k] * fu) * (1 - fv) + (level.px[o + level.w * 4 + k] * (1 - fu) + level.px[o + level.w * 4 + 4 + k] * fu) * fv;
    const a = c * see * tap(3) / 255, s = shade(x, y), i = (y * W + x) * 3; if (a <= 0) continue;
    for (let k = 0; k < 3; k++) { const card = Math.min(255, tap(k) * s); dst[i + k] = Math.round(Math.min(255, Math.max(0, soft > 0 ? dst[i + k] + a * (card - GREEN[k]) : card * a + dst[i + k] * (1 - a)))); }
    opt.mark?.(x, y, a); }
}
/** The card seen edge-on: a soft pale line. */
function paintEdge(dst: Buffer, s: Pt[], width: number, allow: (x: number, y: number) => number, shade: number) {
  const half = Math.min(2, Math.max(0.9, width / 4)), q = ribbon(s, half + 1.5), b = boxOf(q, 1), l = dist(s[0], s[1]) || 1, ux = (s[1].x - s[0].x) / l, uy = (s[1].y - s[0].y) / l;
  for (let y = b.y0; y < b.y0 + b.h; y++) for (let x = b.x0; x < b.x0 + b.w; x++) { const t = Math.min(l, Math.max(0, (x - s[0].x) * ux + (y - s[0].y) * uy)), d = Math.hypot(x - s[0].x - ux * t, y - s[0].y - uy * t);
    const a = Math.min(1, Math.max(0, half + 0.6 - d)) * 0.9 * allow(x, y), i = (y * W + x) * 3; if (a > 0) for (let k = 0; k < 3; k++) dst[i + k] = Math.round(PAPER[k] * shade * a + dst[i + k] * (1 - a)); }
}
/** Film card colour that the rendered card did not cover (blur, rim, rounded corners) takes the colour found just outside it, looking away from `origin`. */
function despill(dst: Buffer, rgb: Buffer, cls: Uint8Array, b: Box, origin: (x: number, y: number) => Pt, done: (x: number, y: number) => boolean, keep: number[] | null, tint: boolean) {
  for (let y = b.y0; y < b.y0 + b.h; y++) for (let x = b.x0; x < b.x0 + b.w; x++) { const i = y * W + x; if (!cardish(rgb, cls, i, tint) || done(x, y)) continue;
    if (keep && x >= keep[0] - 4 && x <= keep[2] + 4 && y >= keep[1] - 4 && y <= keep[3] + 4) continue; // the seated card in the shoe window is not ours to clean
    const c = origin(x, y), l = Math.hypot(x - c.x, y - c.y) || 1, dx = (x - c.x) / l, dy = (y - c.y) / l;
    for (let k = 1; k <= 20; k++) { const xx = Math.round(x + dx * k), yy = Math.round(y + dy * k); if (xx < 0 || yy < 0 || xx >= W || yy >= H) break; const j = yy * W + xx; if (cardish(rgb, cls, j, tint)) continue; for (let q = 0; q < 3; q++) dst[i * 3 + q] = rgb[j * 3 + q]; break; } }
}
/** Brightness of the film's own card at each pixel relative to a lit card, so its shading carries over. */
const filmShade = (rgb: Buffer, cls: Uint8Array, side: Side) => { let sum = 0, n = 0; const kind = side === 'BACK' ? YELLOW : BLUE, of = (i: number) => side === 'BACK' ? (rgb[i * 3] + rgb[i * 3 + 1]) / 440 : rgb[i * 3 + 2] / 224;
  return {of, kind, mean: (b: Box) => { for (let y = b.y0; y < b.y0 + b.h; y++) for (let x = b.x0; x < b.x0 + b.w; x++) { const i = y * W + x; if (cls[i] === kind) { sum += of(i); n++; } } return n ? Math.min(1.08, Math.max(0.5, sum / n)) : 0.85; }}; };

/** B1 and the first part of B2: the rendered card replaces the film's card where the film shows card colour, so fingers stay in front. */
function inPlace(dst: Buffer, rgb: Buffer, cls: Uint8Array, state: State) {
  if (state.quad && (state.side === 'BACK' || state.side === 'FRONT')) { const q = grown(state.quad, RIM), b = boxOf(q, 18), light = filmShade(rgb, cls, state.side), flat = light.mean(b), c = centre(q);
    const own = pick(cls, b, k => k === light.kind || (state.side === 'BACK' && k === SHADE)), near = morph(own, b.w, b.h, 3, true), skin = morph(hand(cls, b, false), b.w, b.h, 1, true), drawn = new Uint8Array(b.w * b.h), at = (x: number, y: number) => (y - b.y0) * b.w + x - b.x0;
    const outside = shoeBox && state.shoe ? (x: number, y: number) => !(x >= shoeBox[0] - 4 && x <= shoeBox[2] + 4 && y >= shoeBox[1] - 4 && y <= shoeBox[3] + 4) : () => true; // beside the shoe window the colour beyond the quad is the seated card
    paint(dst, q, state.side === 'BACK' ? back : face, (x, y) => near[at(x, y)] && !skin[at(x, y)] ? 1 : 0, (x, y) => own[at(x, y)] ? Math.min(1.08, Math.max(0.5, light.of(y * W + x))) : flat,
      {mark: (x, y, a) => { if (a > 0.6) drawn[at(x, y)] = 1; }, beyond: (x, y) => own[at(x, y)] === 1 && outside(x, y), over: 12});
    despill(dst, rgb, cls, boxOf(q, 16), () => c, (x, y) => drawn[at(x, y)] === 1, shoeBox, state.side === 'BACK');
  } else if (state.edge) { const s = state.edge, b = boxOf(s, 30), skin = morph(hand(cls, b, false), b.w, b.h, 1, true), at = (x: number, y: number) => (y - b.y0) * b.w + x - b.x0, lane = ribbon(s, 14, 26);
    despill(dst, rgb, cls, b, (x, y) => onto(s, x, y), (x, y) => !inside(lane, x, y), shoeBox, true);
    paintEdge(dst, s, state.width, (x, y) => skin[at(x, y)] ? 0 : 1, 0.9); }
}
/**
 * Removes the film's card: its colour, rim and blur are refilled from the clean table found to the left,
 * right, above and below, nearer samples counting more (tools/build-anchor.ts fills along rows only).
 * Returns which pixels were refilled; there the rendered cards may show.
 */
function erase(dst: Buffer, rgb: Buffer, cls: Uint8Array, state: State): (x: number, y: number) => boolean {
  const shape = state.quad ? grown(state.quad, RIM + 12) : state.edge ? ribbon(state.edge, 12, 26) : null; if (!shape) return () => false;
  const b = boxOf(shape, 12), front = hand(cls, b, true), at = (x: number, y: number) => (y - b.y0) * b.w + x - b.x0, tint = state.side !== 'FRONT';
  const solid = state.quad ? null : pick(cls, b, c => c !== TABLE), thick = solid && morph(morph(solid, b.w, b.h, 4, false), b.w, b.h, 5, true); // edge-on: whatever is thinner than a finger is card
  const core = pick(cls, b, (c, i) => cardish(rgb, cls, i, tint) || (!!solid && c !== TABLE)); for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) { const i = y * b.w + x; if (core[i] && (front[i] || !inside(shape, x + b.x0, y + b.y0) || (thick && thick[i] && !cardish(rgb, cls, (y + b.y0) * W + x + b.x0, tint)))) core[i] = 0; }
  const hole = morph(core, b.w, b.h, state.quad ? 5 : 2, true); for (let i = 0; i < hole.length; i++) if (front[i]) hole[i] = 0;
  const inHole = (x: number, y: number) => x >= b.x0 && x < b.x0 + b.w && y >= b.y0 && y < b.y0 + b.h && hole[at(x, y)] === 1;
  for (let y = b.y0; y < b.y0 + b.h; y++) for (let x = b.x0; x < b.x0 + b.w; x++) { if (!hole[at(x, y)]) continue; const acc = [0, 0, 0]; let total = 0;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) for (let k = 1; k <= 90; k++) { const xx = x + dx * k, yy = y + dy * k; if (xx < 0 || yy < 0 || xx >= W || yy >= H) break; const j = yy * W + xx; if (cls[j] !== TABLE || inHole(xx, yy)) continue;
      const wgt = 1 / (k * k); for (let q = 0; q < 3; q++) acc[q] += rgb[j * 3 + q] * wgt; total += wgt; break; }
    if (total) for (let q = 0; q < 3; q++) dst[(y * W + x) * 3 + q] = Math.round(acc[q] / total); }
  const copy = Buffer.from(dst.subarray(b.y0 * W * 3, (b.y0 + b.h) * W * 3)), row = (i: number) => (i - b.y0 * W) * 3; // soften the seams between the four directions
  for (let y = b.y0 + 1; y < b.y0 + b.h - 1; y++) for (let x = b.x0 + 1; x < b.x0 + b.w - 1; x++) { if (!hole[at(x, y)]) continue; const i = y * W + x; for (let j = 0; j < 3; j++) { let sum = 0, n = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (inHole(x + dx, y + dy)) { sum += copy[row(i + dy * W + dx) + j]; n++; } dst[i * 3 + j] = Math.round(sum / n); } }
  return inHole;
}
/**
 * A card lying on (or coming down onto) the table, shown only where the film shows table or where the
 * film's own card was removed - so the whole hand, its shadows between the fingers included, stays in
 * front. It is darkened like the table under it, so the hand's shadow falls on it. `ground` 0..1: how
 * much of that table shadow applies (a card still in the air only takes its own shading).
 */
function onTable(dst: Buffer, bare: Buffer, rgb: Buffer, cls: Uint8Array, gone: (x: number, y: number) => boolean, q: Pt[], tex: Tex, base: number, ground: number) {
  const b = boxOf(q, 6), at = (x: number, y: number) => (y - b.y0) * b.w + x - b.x0, shade = new Float32Array(b.w * b.h);
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) { let sum = 0, n = 0; // table brightness around the pixel, from `bare`: the frame before any card is drawn
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + b.x0 + dx, yy = y + b.y0 + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const i = (yy * W + xx) * 3, r = bare[i], g = bare[i + 1], bl = bare[i + 2]; if (g > r + 35 && g > bl + 35) { sum += g; n++; } }
    shade[y * b.w + x] = n >= 3 ? Math.min(1, Math.max(0.45, sum / n / lit)) : 0.6; }
  paint(dst, q, tex, (x, y) => gone(x, y) || cls[y * W + x] === TABLE ? 1 : 0, (x, y) => base * (1 - ground + ground * shade[at(x, y)]),
    {fringe: (x, y) => cls[y * W + x] === TINT ? Math.min(1, Math.max(0, 1 - rgb[(y * W + x) * 3] / 220)) : 0});
}

// ---- the versions ----
type State = {side: Side; quad: Pt[] | null; edge: Pt[] | null; width: number; resting: boolean; shoe: boolean};
const shoeBox = track.shoeWindow?.box ?? null, restState: State = {side: 'FRONT', quad: pts(track.restQuad), edge: null, width: 0, resting: true, shoe: false};
const stateAt = (deal: number | null): State => { if (deal === null || deal >= track.restFrom!) return restState; const f = track.frames[deal];
  return {side: f.side, quad: f.quad && pts(f.quad), edge: f.edge && pts(f.edge), width: f.edge ? f.area / (dist(pts(f.edge)[0], pts(f.edge)[1]) || 1) : 0, resting: false, shoe: (f.shoeShare ?? 0) > 0.02}; };
let lit = 208, GREEN = [16, 208, 56];
function sameSpot(rgb: Buffer, cls: Uint8Array, state: State): Buffer { const out = Buffer.from(rgb); inPlace(out, rgb, cls, state); return out; }
/** Card 1 lies at the plan's first quad from the start; the dealt card is moved by `scale` times the planned step, eased in from the edge-on frames. */
function secondCard(rgb: Buffer, cls: Uint8Array, state: State, deal: number | null, scale: number): Buffer {
  const out = Buffer.from(rgb), share = deal === null ? 1 : offsetRamp(deal, rampStart, rampEnd), light = state.side === 'BACK' || state.side === 'FRONT' ? filmShade(rgb, cls, state.side) : null;
  if (share <= 0) { onTable(out, rgb, rgb, cls, () => false, first, face, 1, 1); inPlace(out, rgb, cls, state); return out; }
  const base = state.quad && light ? light.mean(boxOf(state.quad, 4)) : 0.9, gone = erase(out, rgb, cls, state), bare = Buffer.from(out); onTable(out, bare, rgb, cls, gone, first, face, 1, 1);
  if (state.quad) { const full = grown(state.quad, RIM), q = full.map((p, k) => ({x: p.x + landingShift[k].x * share * scale, y: p.y + landingShift[k].y * share * scale}));
    onTable(out, bare, rgb, cls, gone, q, state.side === 'BACK' ? back : face, state.resting ? 1 : base, state.resting ? 1 : deal === null ? 1 : offsetRamp(deal, track.restFrom! - 8, track.restFrom!));
  } else if (state.edge) { const s = state.edge.map(p => ({x: p.x + meanShift.x * share * scale, y: p.y + meanShift.y * share * scale}));
    paintEdge(out, s, state.width, (x, y) => gone(x, y) || cls[y * W + x] === TABLE ? 1 : cls[y * W + x] === TINT ? 0.5 : 0, 0.9); }
  return out;
}

const versions: {file: string; label: string; make: (rgb: Buffer, cls: Uint8Array, state: State, deal: number | null) => Buffer}[] = [
  {file: 'ra.mp4', label: 'Råfilm', make: rgb => rgb},
  {file: 'b1-samma-plats.mp4', label: 'B1 samma plats', make: sameSpot},
  {file: 'b2-kort-2.mp4', label: 'B2 kort 2 från samma film', make: (rgb, cls, state, deal) => secondCard(rgb, cls, state, deal, 1)},
  ...(STRESS ? [{file: 'b2-dubbel.mp4', label: 'B2 dubbel förskjutning', make: (rgb: Buffer, cls: Uint8Array, state: State, deal: number | null) => secondCard(rgb, cls, state, deal, 2)},
    {file: 'b2-motsatt.mp4', label: 'B2 motsatt håll', make: (rgb: Buffer, cls: Uint8Array, state: State, deal: number | null) => secondCard(rgb, cls, state, deal, -1)}] : []),
];
let frames = 0;
for (let v = 0; v < versions.length; v += 3) { const batch = versions.slice(v, v + 3).map(x => ({...x, enc: encoder(`${OUT}/${x.file}`)})); frames = 0; // one decoder and at most three encoders at a time
  for await (const {rgb, deal} of film()) { const cls = classify(rgb, N), state = stateAt(deal);
    { const b = boxOf([...first, ...second], 120), g: number[][] = []; // the lit table around the cards, per frame: the film's brightness is not constant (its first frame is brighter)
      for (let y = b.y0; y < b.y0 + b.h; y += 2) for (let x = b.x0; x < b.x0 + b.w; x += 2) if (cls[y * W + x] === TABLE) g.push([rgb[(y * W + x) * 3 + 1], rgb[(y * W + x) * 3], rgb[(y * W + x) * 3 + 2]]);
      g.sort((a, c) => a[0] - c[0]); if (g.length > 200) { const p = g[Math.floor(g.length * 0.75)]; lit = p[0]; GREEN = [p[1], p[0], p[2]]; } }
    for (const x of batch) await x.enc.write(x.make(rgb, cls, state, deal)); frames++; }
  for (const x of batch) await x.enc.close(); }

// ---- comparison film, contact sheets, page ----
const run = (args: string[]) => execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], {env, stdio: ['ignore', 'ignore', 'inherit'], windowsHide: true});
const font = "fontfile='C\\:/Windows/Fonts/arial.ttf'", number = (x: number, y: number, size: number) => `drawtext=${font}:text='%{n}':x=${x}:y=${y}:fontsize=${size}:fontcolor=white:box=1:boxcolor=black@0.6`;
const title = (text: string) => `drawtext=${font}:text='${text}':x=16:y=h-48:fontsize=30:fontcolor=white:box=1:boxcolor=black@0.6`;
run(['-i', `${OUT}/ra.mp4`, '-i', `${OUT}/b1-samma-plats.mp4`, '-i', `${OUT}/b2-kort-2.mp4`, '-filter_complex',
  `[0:v]${number(16, 16, 40)},${title('Råfilm')},scale=882:-2[a];[1:v]${title('B1 samma plats')},scale=882:-2[b];[2:v]${title('B2 kort 2 från samma film')},scale=882:-2[c];[a][b][c]hstack=3`,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', `${OUT}/jamforelse.mp4`]);
// Each tile carries its true frame number: the number is drawn before frames are selected.
const sheets: {file: string; text: string; input: string; select: string; crop: number[]; tile: string; zoom?: number}[] = [
  {file: 'ark-1-b1-ur-skon.png', text: 'B1: kortet lämnar skon, ruta 0–38', input: 'b1-samma-plats.mp4', select: 'between(n\\,0\\,38)*not(mod(n\\,2))', crop: [380, 340, 1100, 580], tile: '5x4'},
  {file: 'ark-2-b1-vandning.png', text: 'B1: vändning baksida – kant – framsida, ruta 44–59', input: 'b1-samma-plats.mp4', select: 'between(n\\,44\\,59)', crop: [300, 240, 800, 760], tile: '4x4', zoom: 2},
  {file: 'ark-3-b1-landning.png', text: 'B1: bärs ut, läggs och släpps, ruta 60–117', input: 'b1-samma-plats.mp4', select: 'between(n\\,60\\,117)*not(mod(n\\,3))', crop: [300, 280, 740, 880], tile: '5x4', zoom: 1.5},
  {file: 'ark-4-b2-vandning.png', text: 'B2: förskjutningen kommer in vid kantläget, ruta 50–65', input: 'b2-kort-2.mp4', select: 'between(n\\,50\\,65)', crop: [340, 300, 760, 820], tile: '4x4', zoom: 2},
  {file: 'ark-5-b2-landning.png', text: 'B2: kort 2 läggs över kort 1, ruta 66–123', input: 'b2-kort-2.mp4', select: 'between(n\\,66\\,123)*not(mod(n\\,3))', crop: [320, 280, 740, 880], tile: '5x4', zoom: 1.5},
  {file: 'ark-6-b2-retur.png', text: 'B2: handen lämnar korten, ruta 105–162', input: 'b2-kort-2.mp4', select: 'between(n\\,105\\,162)*not(mod(n\\,3))', crop: [420, 320, 720, 840], tile: '5x4'},
  {file: 'ark-7-jamforelse.png', text: 'Råfilm | B1 | B2 vid ruta 20, 46, 54, 62, 80, 100, 140', input: 'jamforelse.mp4', select: 'eq(n\\,20)+eq(n\\,46)+eq(n\\,54)+eq(n\\,62)+eq(n\\,80)+eq(n\\,100)+eq(n\\,140)', crop: [2646, 586, 0, 0], tile: '1x7'},
  ...(STRESS ? [{file: 'ark-8-b2-dubbel.png', text: 'Stressprov: dubbel förskjutning, ruta 54–111', input: 'b2-dubbel.mp4', select: 'between(n\\,54\\,111)*not(mod(n\\,3))', crop: [380, 300, 740, 860], tile: '5x4'},
    {file: 'ark-9-b2-motsatt.png', text: 'Stressprov: förskjutning åt motsatt håll, ruta 54–111', input: 'b2-motsatt.mp4', select: 'between(n\\,54\\,111)*not(mod(n\\,3))', crop: [380, 300, 700, 860], tile: '5x4'}] : []),
];
for (const s of sheets) { const [cw, ch, cx, cy] = s.crop, own = s.input === 'jamforelse.mp4' ? '' : `${number(cx + 6, cy + 6, Math.round(26 / (s.zoom ?? 1)))},`;
  run(['-i', `${OUT}/${s.input}`, '-vf', `${own}select='${s.select}',crop=${cw}:${ch}:${cx}:${cy}${s.zoom ? `,scale=iw*${s.zoom}:-2` : ''},tile=${s.tile}`, '-frames:v', '1', `${OUT}/${s.file}`]); }

const videos = versions.map(v => `<figure><video src="${v.file}" muted playsinline preload="auto"></video><figcaption>${v.label}</figcaption></figure>`).join('');
const html = `<!doctype html><html lang="sv"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Renderat kort ovanpå filmen</title>
<style>body{margin:0;padding:16px;font:15px/1.45 system-ui,sans-serif;background:#14161a;color:#e8e9ec}h1{font-size:20px;margin:0 0 4px}p{margin:4px 0 12px;max-width:110ch;color:#b9bcc4}
.row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}figure{margin:0}video,img{width:100%;display:block;background:#000;border-radius:6px}figcaption{padding:4px 2px;font-weight:600}
.bar{position:sticky;top:0;z-index:2;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 0;background:#14161a}button,select{font:inherit;padding:6px 12px;border-radius:6px;border:1px solid #444a55;background:#22262d;color:inherit;cursor:pointer}
input[type=range]{flex:1;min-width:200px}#no{font-variant-numeric:tabular-nums;min-width:22ch}.keys button{padding:4px 9px}h2{font-size:16px;margin:24px 0 6px}.sheet{margin:0 0 18px}@media(max-width:900px){.row{grid-template-columns:1fr}}</style>
<h1>Renderat kort ovanpå filmen – prov P4</h1>
<p>Samma film i alla rutor: giv ${DEAL} ruta 0–${CUT - 1}, sedan retur ${RETURN}. Filmens gula och blå kortyta är ersatt av ett renderat kort (röd baksida, spader ess). Grönt som syns är filmens bakgrund; gult eller blått som syns är rester av filmens kort.
B2 lägger kort 1 på planens ${FROM} från start och flyttar det utdelade kortet till planens ${TO}; förskjutningen ökar från kantläget (ruta ${rampStart}) till full vid ruta ${rampEnd}.</p>
<div class="bar"><button id="play">Spela</button><button id="back">◀ 1 ruta</button><button id="fwd">1 ruta ▶</button><select id="rate"><option value="1">1×</option><option value="0.5">0,5×</option><option value="0.25" selected>0,25×</option><option value="0.1">0,1×</option></select>
<input id="seek" type="range" min="0" max="${frames - 1}" value="0"><span id="no"></span><span class="keys">Hoppa till: ${[['Ur skon', 14], ['Kantläge', track.edgeWindow[0] - 2], ['Landning', track.restFrom - 8], ['Skarv', CUT - 2], ['Handen lämnar', CUT + 20]].map(([t, f]) => `<button data-f="${f}">${t} (${f})</button>`).join(' ')}</span></div>
<div class="row">${videos}</div>
<h2>Bildark med verkliga rutnummer</h2>${sheets.map(s => `<figure class="sheet"><figcaption>${s.text}</figcaption><a href="${s.file}"><img src="${s.file}" loading="lazy" alt="${s.text}"></a></figure>`).join('')}
${existsSync(`${OUT}/sparning-giv.mp4`) ? '<h2>Spårningen på givfilmen</h2><p>Kontur per ruta: rosa = baksida, röd = framsida, vit linje = kantläge. Vit punkt = hörn 0, tjock sida = kortbildens överkant.</p><video src="sparning-giv.mp4" controls muted loop playsinline style="max-width:1100px"></video>' : ''}
<h2>Kortbilder</h2><div class="row"><figure><img src="kort-baksida.png" alt="Renderad baksida" style="max-width:192px"><figcaption>Baksida</figcaption></figure><figure><img src="kort-framsida.png" alt="Renderad framsida" style="max-width:192px"><figcaption>Framsida</figcaption></figure></div>
<script>const v=[...document.querySelectorAll('.row video')],fps=${FPS},last=${frames - 1},seek=document.getElementById('seek'),no=document.getElementById('no'),play=document.getElementById('play'),rate=document.getElementById('rate');let f=0,timer=null;
const show=n=>{f=Math.max(0,Math.min(last,n));for(const x of v)x.currentTime=(f+.5)/fps;seek.value=f;no.textContent='ruta '+f+(f<${CUT}?' (giv '+f+')':' (retur '+(f-${CUT})+')');};
const stop=()=>{clearInterval(timer);timer=null;play.textContent='Spela';},go=()=>{timer=setInterval(()=>show(f>=last?0:f+1),1000/fps/Number(rate.value));play.textContent='Paus';};
play.onclick=()=>timer?stop():go();rate.onchange=()=>{if(timer){stop();go();}};document.getElementById('back').onclick=()=>{stop();show(f-1);};document.getElementById('fwd').onclick=()=>{stop();show(f+1);};seek.oninput=()=>{stop();show(Number(seek.value));};
for(const b of document.querySelectorAll('[data-f]'))b.onclick=()=>{stop();show(Number(b.dataset.f));};addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){stop();show(f-1);}if(e.key==='ArrowRight'){stop();show(f+1);}if(e.key===' '){e.preventDefault();play.onclick();}});show(0);</script></html>
`;
await writeFile(`${OUT}/index.html`, html);
const proof = {schemaVersion: 1, createdAt: new Date().toISOString(), tool: 'tools/render-card-proof.ts', film: {deal: DEAL, dealFrames: [0, CUT - 1], return: RETURN, frames, fps: FPS, width: W, height: H}, track: {path: `assets/tracking/${DEAL}/card-track.json`, sha256: sha(trackBytes), edgeWindow: track.edgeWindow, restFrom: track.restFrom},
  plan: {path: 'placements/default.json', sha256: sha(planBytes), read: 'only', first: {target: FROM, quad: first}, second: {target: TO, quad: second}}, filmRestQuadWithRim: restFilm, landingShiftPerCorner: landingShift, meanShift, ramp: {from: rampStart, fullAt: rampEnd, shape: 'smoothstep'}, rimPx: RIM,
  outputs: [...versions.map(v => v.file), 'jamforelse.mp4', ...sheets.map(s => s.file), 'index.html', 'kort-framsida.png', 'kort-baksida.png']};
await writeFile(`${OUT}/proof.json`, JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify({out: OUT, frames, meanShift, ramp: proof.ramp, outputs: proof.outputs}));
