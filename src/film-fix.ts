// Fixing a delivered film, written as data: a short list of named operations, applied in order, that a reviewer can write and a
// person can read (tools/film-review.md). Pure: frames come and go through a FrameStore (8-bit RGB, rows top down, no padding) and
// pictures as Picture; no files, no FFmpeg (tools/film-fix.ts decodes, applies, encodes and writes the receipt).
//
// What can be fixed this way: a few frames (trim, hold, blend), a few pixels where nothing moves (patch), a colour (key) and a level
// (level). What cannot: a hand's or a body's motion, a card that changes shape in the hand, a wrong path. Every operation has a limit
// that keeps it a repair (LIMITS); beyond it the whole list is refused with the reason, in Swedish, and nothing is written. The tempo
// is never changed: speed is always refused.
//
// Frame numbers are always the delivered film's, the numbers a reviewer reads off it. trim drops frames only when the copy is
// written, so frame f of the film is frame f - (frames trimmed at the start) of the copy.
//
// Lessons behind the limits (docs/DRIFT.md, "Lärdomar som gäller"): cutting WAN 3's two last frames and evening the green per frame
// hold up in review; painting over a still area holds; painting where the hand moves fails.

export type RGB = [number, number, number];
export type Rect = {x: number; y: number; w: number; h: number};
export type Range = [number, number];
/** A picture: 8-bit RGB (3 bytes per pixel) or grey (1 byte per pixel, a mask), rows top down. */
export type Picture = {width: number; height: number; channels?: 1 | 3; data: Uint8Array};
/** The film's frames, each width × height × 3 bytes. get returns the frame as it stands now; set replaces it. */
export interface FrameStore {readonly count: number; readonly width: number; readonly height: number; get(index: number): Uint8Array; set(index: number, data: Uint8Array): void}

export type TrimOp = {op: 'trim'; start?: number; end?: number; why?: string};
export type HoldOp = {op: 'hold'; frames: Range; from?: number; why?: string};
export type BlendOp = {op: 'blend'; frames: Range; why?: string};
export type PatchOp = {op: 'patch'; frames: Range; from: number; area?: Rect; mask?: string; why?: string};
export type KeyOp = {op: 'key'; frames?: Range; area?: Rect; colour?: RGB; to?: RGB | 'key'; tolerance?: number; why?: string};
export type LevelOp = {op: 'level'; frames?: Range; reference: string; tone?: boolean; toneFrame?: number; why?: string};
export type SpeedOp = {op: 'speed'; why?: string; [key: string]: unknown};
export type FixOp = TrimOp | HoldOp | BlendOp | PatchOp | KeyOp | LevelOp | SpeedOp;
export const OPS = ['trim', 'hold', 'blend', 'patch', 'key', 'level', 'speed'] as const;
const FIELDS: Record<string, string[]> = {trim: ['start', 'end'], hold: ['frames', 'from'], blend: ['frames'], patch: ['frames', 'from', 'area', 'mask'],
  key: ['frames', 'area', 'colour', 'to', 'tolerance'], level: ['frames', 'reference', 'tone', 'toneFrame'], speed: []};

/** The limits that keep each operation a repair. A pixel "moves" when a channel differs by more than `moved` levels. */
export const LIMITS = {
  moved: 24,
  trimFrames: 3,          // at most 3 frames off each end: WAN 3's two dark last frames, a generated film's bright first frames
  holdRun: 3,             // at most 3 frames in a row replaced by a neighbour
  holdMoving: 0.002,      // across the held run at most 0.2 % of the picture may move: a held frame inside motion is a visible stall
  blendRun: 4,            // at most 4 frames in a row replaced by a blend of the two good frames around them
  blendMoving: 0.004,     // between those two frames at most 0.4 % of the picture may move: a blend of motion is a double image
  patchArea: 0.02,        // at most 2 % of the picture per frame
  patchRing: 8,           // the surroundings measured: 8 px round the area
  patchRingMoving: 0.02,  // at most 2 % of the surroundings may differ between the source frame and a patched frame
  patchRingMean: 6,       // and on average by at most 6 levels: the area does not lie where something moves
  keyTolerance: 40,       // a key reaches at most 40 levels from its colour
  keyDefault: 8,          // and 8 when the list says nothing: a wide key flattens a green that has a gradient and draws its contour
  keyShift: 24,           // and sets a colour at most 24 levels from it per channel: a level, not a recolour
  levelGreen: 30,         // the green moves at most 30 levels per channel to the reference's
  levelReach: 190,        // px: how wide the level's correction is smoothed, so that it carries a drift and never a shadow
  levelGain: [0.85, 1.15] as const,
  levelLift: 25,
};
// The scene's key (src/scene3d-film.ts): s = (G - max(R, B)) / (keyG - max(keyR, keyB)), with the key read from the frame itself in a
// corner that stays empty; a pixel is all screen from s >= hi. Here the same rule is taken about the key colour's strongest channel.
export const SCREEN = {lo: 0.12, hi: 0.9};
// The corner the green reference is read in (as the review templates measure it: x 20..260, y 20..260 of 1764 × 1174).
export const CORNER = {x0: 20 / 1764, x1: 260 / 1764, y0: 20 / 1174, y1: 260 / 1174};
// Left of the shoe: only the dealer (the tone match measures her, not the shoe or the card in it). 1150 of 1764.
const PERSON_X = 1150 / 1764;

export type OpReport = {step: number; op: string; why: string | null; frames: Range[]; changedFrames: number; pixelsChanged: number; maxPixelDiff: number; measures: Record<string, unknown>};
export type FixResult = {ok: true; reports: OpReport[]; keep: Range; frameShift: number; changed: number[]} | {ok: false; refusals: string[]; reports: OpReport[]};

// ── Reading a fix list ──────────────────────────────────────────────────────
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const int = (v: unknown): v is number => Number.isInteger(v);
const isRange = (v: unknown): v is Range => Array.isArray(v) && v.length === 2 && int(v[0]) && int(v[1]) && v[0] >= 0 && v[1] >= v[0];
const isRGB = (v: unknown): v is RGB => Array.isArray(v) && v.length === 3 && v.every(c => int(c) && c >= 0 && c <= 255);
const isRect = (v: unknown): v is Rect => isObject(v) && Object.keys(v).every(k => ['x', 'y', 'w', 'h'].includes(k)) && int(v.x) && int(v.y) && int(v.w) && int(v.h) && v.x >= 0 && v.y >= 0 && v.w > 0 && v.h > 0;
const label = (i: number, op: string) => `Steg ${i + 1} (${op})`;

/** The fix list as written (a JSON array), checked for shape only. Unknown operations and fields are refused, so a typo is not ignored. */
export function readFixes(value: unknown): {ops: FixOp[]; refusals: string[]} {
  const refusals: string[] = [];
  if (!Array.isArray(value) || !value.length) return {ops: [], refusals: ['Rättningslistan ska vara en lista med minst ett steg.']};
  value.forEach((raw, i) => {
    if (!isObject(raw) || typeof raw.op !== 'string') return void refusals.push(`Steg ${i + 1}: varje steg är ett objekt med op.`);
    const op = raw.op, at = label(i, op);
    if (!(OPS as readonly string[]).includes(op)) return void refusals.push(`${at}: okänd åtgärd; de som finns är ${OPS.join(', ')}.`);
    if (op === 'speed') return void refusals.push(`${at}: tempot ändras aldrig. En film som går för fort eller för långsamt beställs om.`);
    const extra = Object.keys(raw).filter(k => k !== 'op' && k !== 'why' && !FIELDS[op].includes(k));
    if (extra.length) refusals.push(`${at}: okänt fält ${extra.join(', ')}.`);
    if (raw.why !== undefined && typeof raw.why !== 'string') refusals.push(`${at}: why är en text.`);
    if (op === 'trim' && (!(raw.start === undefined || (int(raw.start) && raw.start >= 0)) || !(raw.end === undefined || (int(raw.end) && raw.end >= 0)) || !(Number(raw.start ?? 0) + Number(raw.end ?? 0) > 0))) refusals.push(`${at}: start och end är antal rutor (heltal), minst en av dem över 0.`);
    if (['hold', 'blend', 'patch'].includes(op) && !isRange(raw.frames)) refusals.push(`${at}: frames ska vara [första, sista] ruta.`);
    if (['key', 'level'].includes(op) && raw.frames !== undefined && !isRange(raw.frames)) refusals.push(`${at}: frames ska vara [första, sista] ruta eller utelämnas (hela filmen).`);
    if ((op === 'hold' && raw.from !== undefined || op === 'patch') && !(int(raw.from) && raw.from >= 0)) refusals.push(`${at}: from är en ruta i filmen.`);
    if (op === 'patch' && (raw.area === undefined) === (raw.mask === undefined)) refusals.push(`${at}: ange antingen area {x, y, w, h} eller mask (en PNG).`);
    if ((op === 'patch' || op === 'key') && raw.area !== undefined && !isRect(raw.area)) refusals.push(`${at}: area ska vara {x, y, w, h} i bildpunkter.`);
    if (op === 'patch' && raw.mask !== undefined && (typeof raw.mask !== 'string' || !raw.mask)) refusals.push(`${at}: mask är sökvägen till en PNG.`);
    if (op === 'key') {
      if (raw.colour !== undefined && !isRGB(raw.colour)) refusals.push(`${at}: colour ska vara [r, g, b] (0–255) eller utelämnas (rutans eget gröna).`);
      if (raw.to !== undefined && raw.to !== 'key' && !isRGB(raw.to)) refusals.push(`${at}: to ska vara [r, g, b] eller "key".`);
      if (raw.tolerance !== undefined && !(int(raw.tolerance) && raw.tolerance >= 0 && raw.tolerance <= LIMITS.keyTolerance)) refusals.push(`${at}: tolerance är 0–${LIMITS.keyTolerance} nivåer.`);
    }
    if (op === 'level') {
      if (typeof raw.reference !== 'string' || !raw.reference) refusals.push(`${at}: reference är sökvägen till bilden med rätt grönt och ton.`);
      if (raw.tone !== undefined && typeof raw.tone !== 'boolean') refusals.push(`${at}: tone är true eller false.`);
      if (raw.toneFrame !== undefined && !(int(raw.toneFrame) && raw.toneFrame >= 0)) refusals.push(`${at}: toneFrame är en ruta i filmen.`);
    }
  });
  return {ops: refusals.length ? [] : value as FixOp[], refusals};
}

/** The pictures a list needs (level references and patch masks), by the path written in it. */
export const picturesOf = (ops: readonly FixOp[]): string[] => [...new Set(ops.flatMap(op => op.op === 'level' ? [op.reference] : op.op === 'patch' && op.mask ? [op.mask] : []))];

// ── What a list does, before any pixel is touched ───────────────────────────
type Film = {count: number; width: number; height: number};
const trimOf = (ops: readonly FixOp[]) => { const t = ops.find((o): o is TrimOp => o.op === 'trim'); return {start: t?.start ?? 0, end: t?.end ?? 0}; };
/** The frames each step changes (trim: none; key and level: their range, the whole kept film when none is given). */
export function targetsOf(op: FixOp, film: Film, ops: readonly FixOp[]): Range | null {
  const {start, end} = trimOf(ops), whole: Range = [start, film.count - 1 - end];
  if (op.op === 'hold' || op.op === 'blend' || op.op === 'patch') return op.frames;
  if (op.op === 'key' || op.op === 'level') return op.frames ?? whole;
  return null;
}

/** The limits that can be judged without the pixels. Empty: the list may be applied. */
export function checkFixes(ops: readonly FixOp[], film: Film, pictures: Record<string, Picture> = {}): string[] {
  const refusals: string[] = [], {start, end} = trimOf(ops), last = film.count - 1, kept = (f: number) => f >= start && f <= last - end;
  if (ops.filter(o => o.op === 'trim').length > 1) refusals.push('Bara ett trim-steg per lista.');
  if (start > LIMITS.trimFrames || end > LIMITS.trimFrames) refusals.push(`trim: högst ${LIMITS.trimFrames} rutor i var ände; mer än så är ett utsnitt (derived) och ingen rättning.`);
  if (film.count - start - end < 2) refusals.push('trim: filmen måste ha minst två rutor kvar.');
  ops.forEach((op, i) => {
    const at = label(i, op.op), range = targetsOf(op, film, ops);
    if (op.op === 'speed') refusals.push(`${at}: tempot ändras aldrig.`);
    if (range) {
      if (range[1] > last) refusals.push(`${at}: ruta ${range[1]} finns inte; filmen har rutorna 0–${last}.`);
      else if (!kept(range[0]) || !kept(range[1])) refusals.push(`${at}: rutorna ${range[0]}–${range[1]} klipps bort av trim.`);
    }
    const run = range ? range[1] - range[0] + 1 : 0;
    if (op.op === 'hold') {
      if (run > LIMITS.holdRun) refusals.push(`${at}: högst ${LIMITS.holdRun} rutor i rad hålls; ${run} är en frusen rörelse.`);
      if (op.from !== undefined && (op.from > last || !kept(op.from) || (op.from >= op.frames[0] && op.from <= op.frames[1]))) refusals.push(`${at}: from ${op.from} måste vara en kvarvarande ruta utanför ${op.frames[0]}–${op.frames[1]}.`);
      if (op.from === undefined && ![op.frames[0] - 1, op.frames[1] + 1].some(f => f >= 0 && f <= last && kept(f))) refusals.push(`${at}: ingen god ruta intill ${op.frames[0]}–${op.frames[1]}.`);
    }
    if (op.op === 'blend') {
      if (run > LIMITS.blendRun) refusals.push(`${at}: högst ${LIMITS.blendRun} rutor i rad blandas; ${run} är en ny rörelse, inte en lagning.`);
      if (!(op.frames[0] - 1 >= 0 && kept(op.frames[0] - 1) && op.frames[1] + 1 <= last && kept(op.frames[1] + 1))) refusals.push(`${at}: en blandning behöver en god ruta före och en efter ${op.frames[0]}–${op.frames[1]}.`);
    }
    if (op.op === 'patch') {
      if (op.from > last || !kept(op.from) || (op.from >= op.frames[0] && op.from <= op.frames[1])) refusals.push(`${at}: from ${op.from} måste vara en kvarvarande ruta utanför ${op.frames[0]}–${op.frames[1]}.`);
      const size = op.area ? (op.area.x + op.area.w <= film.width && op.area.y + op.area.h <= film.height ? op.area.w * op.area.h : -1) : maskSize(pictures[op.mask!], film);
      if (size === -1) refusals.push(`${at}: ytan ligger utanför bilden (${film.width} × ${film.height}).`);
      else if (size === -2) refusals.push(`${at}: masken ${op.mask} saknas eller har inte filmens storlek.`);
      else if (size === 0) refusals.push(`${at}: ytan är tom.`);
      else if (size > LIMITS.patchArea * film.width * film.height) refusals.push(`${at}: ytan är ${pct(size / (film.width * film.height))} av bilden; högst ${pct(LIMITS.patchArea)} lagas.`);
    }
    if (op.op === 'key' && op.area && (op.area.x + op.area.w > film.width || op.area.y + op.area.h > film.height)) refusals.push(`${at}: ytan ligger utanför bilden (${film.width} × ${film.height}).`);
    if (op.op === 'key' && op.colour && isRGB(op.to) && Math.max(...op.to.map((c, k) => Math.abs(c - op.colour![k]))) > LIMITS.keyShift) refusals.push(`${at}: ${op.to.join(',')} ligger mer än ${LIMITS.keyShift} nivåer från ${op.colour.join(',')}; det är en omfärgning, ingen lagning.`);
    if (op.op === 'level') {
      if (!pictures[op.reference]) refusals.push(`${at}: referensbilden ${op.reference} saknas.`);
      if (op.toneFrame !== undefined && (op.toneFrame > last || !kept(op.toneFrame))) refusals.push(`${at}: toneFrame ${op.toneFrame} är ingen kvarvarande ruta.`);
    }
  });
  return refusals;
}
const pct = (v: number) => `${(Math.round(v * 1000) / 10).toString().replace('.', ',')} %`;
function maskSize(mask: Picture | undefined, film: Film): number {
  if (!mask || mask.width !== film.width || mask.height !== film.height) return -2;
  const ch = mask.channels ?? 3; let n = 0;
  for (let i = 0; i < film.width * film.height; i++) if (mask.data[i * ch] > 127) n++;
  return n;
}

// ── Pixels ──────────────────────────────────────────────────────────────────
/** How two frames differ inside a mask (all pixels without one): the share of pixels that move, the mean and the largest channel step. */
export function difference(a: Uint8Array, b: Uint8Array, pixels: number, inside?: Uint8Array | null): {share: number; mean: number; max: number; count: number} {
  let moved = 0, sum = 0, max = 0, n = 0;
  for (let p = 0; p < pixels; p++) {
    if (inside && !inside[p]) continue;
    const i = p * 3, d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
    n++; sum += d; if (d > max) max = d; if (d > LIMITS.moved) moved++;
  }
  return {share: n ? moved / n : 0, mean: n ? sum / n : 0, max, count: n};
}
const changed = (a: Uint8Array, b: Uint8Array, pixels: number) => { let n = 0, max = 0; for (let p = 0; p < pixels; p++) { const i = p * 3, d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])); if (d) { n++; if (d > max) max = d; } } return {n, max}; };
const clamp = (v: number) => v < 0 ? 0 : v > 255 ? 255 : Math.round(v);

/** Dilation of a 0/1 mask by r pixels (a square), with nothing outside the picture. */
export function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const across = new Uint8Array(w * h), out = new Uint8Array(w * h), row = new Int32Array(w + 1), col = new Int32Array(h + 1);
  for (let y = 0; y < h; y++) { row[0] = 0; for (let x = 0; x < w; x++) row[x + 1] = row[x] + mask[y * w + x]; for (let x = 0; x < w; x++) across[y * w + x] = row[Math.min(w, x + r + 1)] - row[Math.max(0, x - r)] > 0 ? 1 : 0; }
  for (let x = 0; x < w; x++) { col[0] = 0; for (let y = 0; y < h; y++) col[y + 1] = col[y] + across[y * w + x]; for (let y = 0; y < h; y++) out[y * w + x] = col[Math.min(h, y + r + 1)] - col[Math.max(0, y - r)] > 0 ? 1 : 0; }
  return out;
}
/** Erosion of a 0/1 mask by r pixels; outside the picture does not erode (as OpenCV's default). */
export const erode = (mask: Uint8Array, w: number, h: number, r: number): Uint8Array => dilate(mask.map(v => v ? 0 : 1), w, h, r).map(v => v ? 0 : 1);

// The frame's own green, read in the empty corner: the median per channel (a few noisy pixels do not move it).
export function cornerColour(frame: Uint8Array, w: number, h: number): RGB {
  const x0 = Math.round(CORNER.x0 * w), x1 = Math.max(x0 + 1, Math.round(CORNER.x1 * w)), y0 = Math.round(CORNER.y0 * h), y1 = Math.max(y0 + 1, Math.round(CORNER.y1 * h));
  const lists: number[][] = [[], [], []];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) for (let c = 0; c < 3; c++) lists[c].push(frame[(y * w + x) * 3 + c]);
  return lists.map(v => { v.sort((a, b) => a - b); return v[v.length >> 1]; }) as RGB;
}

// The green of the screen as a smooth field over the whole picture, the way efterarbete.py and gron-till-niva.py take it: at an
// eighth of the size, the pure screen (G - max(R, B) > 50 and G > 110, one small pixel in from its edge) blurred and divided by its
// own blurred coverage, then brought back to full size. Where she is, the field carries the green around her.
export function smoothGreen(frame: Uint8Array, w: number, h: number): Float32Array {
  const {small, solid, sw, sh} = eighth(frame, w, h), weight = new Float32Array(sw * sh), sum = new Float32Array(sw * sh * 3);
  for (let p = 0; p < sw * sh; p++) { weight[p] = solid[p]; for (let c = 0; c < 3; c++) sum[p * 3 + c] = small[p * 3 + c] * solid[p]; }
  const wBlur = gauss(weight, sw, sh, 1, 8), sBlur = gauss(sum, sw, sh, 3, 8), field = new Float32Array(sw * sh * 3);
  for (let p = 0; p < sw * sh; p++) for (let c = 0; c < 3; c++) field[p * 3 + c] = sBlur[p * 3 + c] / Math.max(1e-3, wBlur[p]);
  return upscale(field, sw, sh, w, h);
}
// A picture at an eighth of its size (area mean) and where it is clean screen: G - max(R, B) > 50 and G > 110, one small pixel in.
function eighth(frame: Uint8Array, w: number, h: number) {
  const sw = Math.ceil(w / 8), sh = Math.ceil(h / 8), small = new Float32Array(sw * sh * 3), pure = new Uint8Array(sw * sh);
  for (let sy = 0; sy < sh; sy++) for (let sx = 0; sx < sw; sx++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = sy * 8; y < Math.min(h, sy * 8 + 8); y++) for (let x = sx * 8; x < Math.min(w, sx * 8 + 8); x++) { const i = (y * w + x) * 3; r += frame[i]; g += frame[i + 1]; b += frame[i + 2]; n++; }
    const k = (sy * sw + sx) * 3; small[k] = r / n; small[k + 1] = g / n; small[k + 2] = b / n;
    pure[sy * sw + sx] = small[k + 1] - Math.max(small[k], small[k + 2]) > 50 && small[k + 1] > 110 ? 1 : 0;
  }
  return {small, solid: erode(pure, sw, sh, 1), sw, sh};
}
// Back to full size, bilinear with pixel centres on pixel centres.
function upscale(field: Float32Array, sw: number, sh: number, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h * 3), fx = sw / w, fy = sh / h;
  for (let y = 0; y < h; y++) {
    const v = Math.min(sh - 1, Math.max(0, (y + 0.5) * fy - 0.5)), y0 = Math.floor(v), y1 = Math.min(sh - 1, y0 + 1), ty = v - y0;
    for (let x = 0; x < w; x++) {
      const u = Math.min(sw - 1, Math.max(0, (x + 0.5) * fx - 0.5)), x0 = Math.floor(u), x1 = Math.min(sw - 1, x0 + 1), tx = u - x0;
      for (let c = 0; c < 3; c++) {
        const a = field[(y0 * sw + x0) * 3 + c], b = field[(y0 * sw + x1) * 3 + c], d = field[(y1 * sw + x0) * 3 + c], e = field[(y1 * sw + x1) * 3 + c];
        out[(y * w + x) * 3 + c] = (a * (1 - tx) + b * tx) * (1 - ty) + (d * (1 - tx) + e * tx) * ty;
      }
    }
  }
  return out;
}
/**
 * What level adds to a frame's screen: the reference's green minus the frame's, measured only where both are clean screen, and
 * blurred wide (LIMITS.levelReach, about 190 px at the bank's size). Only a drift of the whole green moves: a shadow in the reference
 * (a hand hovering over a seat) is never painted into a frame where the hand is not, nor a frame's own shadow lifted away. Tried on
 * pamela-p4-c1-plan-deal-02 against its landing anchor: the narrow field of efterarbete.py stamped the anchor's hand shadow onto the
 * table of every frame, 58 levels deep.
 */
export const levelField = (reference: Uint8Array, frame: Uint8Array, w: number, h: number): Float32Array => fieldOf(eighth(reference, w, h), eighth(frame, w, h), w, h);
function fieldOf(a: ReturnType<typeof eighth>, b: ReturnType<typeof eighth>, w: number, h: number): Float32Array {
  const n = a.sw * a.sh, weight = new Float32Array(n), sum = new Float32Array(n * 3), mean = [0, 0, 0];
  let count = 0;
  for (let p = 0; p < n; p++) if (a.solid[p] && b.solid[p]) { weight[p] = 1; count++; for (let c = 0; c < 3; c++) { const d = a.small[p * 3 + c] - b.small[p * 3 + c]; sum[p * 3 + c] = d; mean[c] += d; } }
  const wBlur = gauss(weight, a.sw, a.sh, 1, LIMITS.levelReach / 8), sBlur = gauss(sum, a.sw, a.sh, 3, LIMITS.levelReach / 8), field = new Float32Array(n * 3);
  // Far from any clean screen in both, the field leans softly towards the mean correction.
  let top = 0; for (let p = 0; p < n; p++) if (wBlur[p] > top) top = wBlur[p];
  const k = 0.01 * top || 1;
  for (let p = 0; p < n; p++) for (let c = 0; c < 3; c++) field[p * 3 + c] = (sBlur[p * 3 + c] + k * (count ? mean[c] / count : 0)) / (wBlur[p] + k);
  return upscale(field, a.sw, a.sh, w, h);
}
function gauss(src: Float32Array, w: number, h: number, ch: number, sigma: number): Float32Array {
  const r = Math.ceil(3 * sigma), kernel = Array.from({length: 2 * r + 1}, (_, i) => Math.exp(-((i - r) ** 2) / (2 * sigma * sigma))), mid = new Float32Array(src.length), out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < ch; c++) { let s = 0; for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < w) s += kernel[k + r] * src[(y * w + xx) * ch + c]; } mid[(y * w + x) * ch + c] = s; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < ch; c++) { let s = 0; for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < h) s += kernel[k + r] * mid[(yy * w + x) * ch + c]; } out[(y * w + x) * ch + c] = s; }
  return out;
}

/** A picture at another size, bilinear (a reference of 1764 × 1174 against a Kling film of 1764 × 1172). Grey pictures become RGB. */
export function resize(picture: Picture, w: number, h: number): Uint8Array {
  const ch = picture.channels ?? 3, out = new Uint8Array(w * h * 3), at = (x: number, y: number, c: number) => picture.data[(y * picture.width + x) * ch + (ch === 1 ? 0 : c)];
  if (picture.width === w && picture.height === h && ch === 3) return picture.data;
  for (let y = 0; y < h; y++) {
    const v = Math.min(picture.height - 1, Math.max(0, (y + 0.5) * picture.height / h - 0.5)), y0 = Math.floor(v), y1 = Math.min(picture.height - 1, y0 + 1), ty = v - y0;
    for (let x = 0; x < w; x++) {
      const u = Math.min(picture.width - 1, Math.max(0, (x + 0.5) * picture.width / w - 0.5)), x0 = Math.floor(u), x1 = Math.min(picture.width - 1, x0 + 1), tx = u - x0;
      for (let c = 0; c < 3; c++) out[(y * w + x) * 3 + c] = clamp((at(x0, y0, c) * (1 - tx) + at(x1, y0, c) * tx) * (1 - ty) + (at(x0, y1, c) * (1 - tx) + at(x1, y1, c) * tx) * ty);
    }
  }
  return out;
}

// ── Applying a list ─────────────────────────────────────────────────────────
/**
 * Applies the list to the store, step by step, each step on the frames as the steps before it left them. The store is changed in
 * place: give it a copy of the film. On a refusal the work stops at that step and the store is left part-changed (the caller writes
 * nothing). keep: the frames the copy is made of; frameShift: how far frame numbers move (trim at the start).
 */
export function applyFixes(store: FrameStore, ops: readonly FixOp[], pictures: Record<string, Picture> = {}): FixResult {
  const film = {count: store.count, width: store.width, height: store.height}, reports: OpReport[] = [];
  const first = checkFixes(ops, film, pictures);
  if (first.length) return {ok: false, refusals: first, reports};
  const {start, end} = trimOf(ops), w = film.width, h = film.height, pixels = w * h, touched = new Set<number>();
  for (const [i, op] of ops.entries()) {
    const at = label(i, op.op), range = targetsOf(op, film, ops), report: OpReport = {step: i + 1, op: op.op, why: op.why ?? null, frames: range ? [range] : [], changedFrames: 0, pixelsChanged: 0, maxPixelDiff: 0, measures: {}};
    reports.push(report);
    const put = (f: number, next: Uint8Array) => { const was = store.get(f), d = changed(was, next, pixels); if (d.n) { report.changedFrames++; report.pixelsChanged += d.n; report.maxPixelDiff = Math.max(report.maxPixelDiff, d.max); touched.add(f); store.set(f, next); } };
    const refuse = (reason: string) => ({ok: false as const, refusals: [`${at}: ${reason}`], reports});
    if (op.op === 'trim') { report.frames = []; report.measures = {dropStart: start ? [0, start - 1] : null, dropEnd: end ? [film.count - end, film.count - 1] : null}; continue; }
    if (op.op === 'hold') {
      const [a, b] = op.frames, kept = (f: number) => f >= start && f <= film.count - 1 - end, around = [a - 1, b + 1].filter(f => f >= 0 && f < film.count && kept(f));
      let still: {share: number; between: Range};
      if (op.from !== undefined) { const shares = around.map(n => ({share: difference(store.get(op.from!), store.get(n), pixels).share, between: [op.from!, n] as Range})); still = shares.sort((x, y) => y.share - x.share)[0] ?? {share: 1, between: [op.from, op.from]}; }
      else if (around.length === 2) still = {share: difference(store.get(around[0]), store.get(around[1]), pixels).share, between: [around[0], around[1]]};
      else { const s = around[0], outer = s === a - 1 ? s - 1 : s + 1; if (outer < 0 || outer >= film.count || !kept(outer)) return refuse(`ingen ruta att mäta stillheten mot intill ${s}.`); still = {share: difference(store.get(s), store.get(outer), pixels).share, between: [s, outer]}; }
      report.measures = {movingShare: round4(still.share), measuredBetween: still.between, limit: LIMITS.holdMoving};
      if (still.share > LIMITS.holdMoving) return refuse(`${pct(still.share)} av bilden rör sig mellan ruta ${still.between[0]} och ${still.between[1]} (högst ${pct(LIMITS.holdMoving)}): att hålla en ruta här fryser en rörelse.`);
      for (let f = a; f <= b; f++) { const source = op.from ?? (around.length === 2 ? (f - around[0] <= around[1] - f ? around[0] : around[1]) : around[0]); put(f, store.get(source).slice()); }
      report.measures.sources = op.from !== undefined ? [op.from] : around;
      continue;
    }
    if (op.op === 'blend') {
      const [a, b] = op.frames, before = store.get(a - 1), after = store.get(b + 1), d = difference(before, after, pixels), n = b - a + 2;
      report.measures = {movingShare: round4(d.share), between: [a - 1, b + 1], limit: LIMITS.blendMoving};
      if (d.share > LIMITS.blendMoving) return refuse(`${pct(d.share)} av bilden rör sig mellan ruta ${a - 1} och ${b + 1} (högst ${pct(LIMITS.blendMoving)}): en blandning av rörelse ger en dubbelbild.`);
      for (let f = a; f <= b; f++) { const t = (f - a + 1) / n, next = new Uint8Array(pixels * 3); for (let k = 0; k < next.length; k++) next[k] = clamp(before[k] * (1 - t) + after[k] * t); put(f, next); }
      continue;
    }
    if (op.op === 'patch') {
      const area = new Uint8Array(pixels);
      if (op.area) { for (let y = op.area.y; y < op.area.y + op.area.h; y++) area.fill(1, y * w + op.area.x, y * w + op.area.x + op.area.w); }
      else { const m = pictures[op.mask!], ch = m.channels ?? 3; for (let p = 0; p < pixels; p++) area[p] = m.data[p * ch] > 127 ? 1 : 0; }
      const ring = dilate(area, w, h, LIMITS.patchRing); for (let p = 0; p < pixels; p++) if (area[p]) ring[p] = 0;
      const source = store.get(op.from), worst = {share: 0, mean: 0, frame: -1};
      for (let f = op.frames[0]; f <= op.frames[1]; f++) { const d = difference(source, store.get(f), pixels, ring); if (d.share > worst.share || (d.share === worst.share && d.mean > worst.mean)) Object.assign(worst, {share: d.share, mean: d.mean, frame: f}); }
      report.measures = {areaShare: round4(area.reduce((s, v) => s + v, 0) / pixels), ringMovingShare: round4(worst.share), ringMean: Math.round(worst.mean * 100) / 100, worstFrame: worst.frame, from: op.from, limits: {ringMoving: LIMITS.patchRingMoving, ringMean: LIMITS.patchRingMean}};
      if (worst.share > LIMITS.patchRingMoving || worst.mean > LIMITS.patchRingMean) return refuse(`omkring ytan skiljer ruta ${worst.frame} från ruta ${op.from} (${pct(worst.share)} av kanten rör sig, i snitt ${Math.round(worst.mean * 10) / 10} nivåer; högst ${pct(LIMITS.patchRingMoving)} och ${LIMITS.patchRingMean}): något rör sig där, och att måla där en hand rör sig håller inte.`);
      for (let f = op.frames[0]; f <= op.frames[1]; f++) { const next = store.get(f).slice(); for (let p = 0; p < pixels; p++) if (area[p]) { next[p * 3] = source[p * 3]; next[p * 3 + 1] = source[p * 3 + 1]; next[p * 3 + 2] = source[p * 3 + 2]; } put(f, next); }
      continue;
    }
    if (op.op === 'key') {
      const tol = op.tolerance ?? LIMITS.keyDefault, box = op.area ?? {x: 0, y: 0, w, h}, shifts: number[] = [];
      for (let f = range![0]; f <= range![1]; f++) {
        const frame = store.get(f), key = op.colour ?? cornerColour(frame, w, h), target: RGB = op.to === undefined || op.to === 'key' ? key : op.to;
        const shift = Math.max(...target.map((c, k) => Math.abs(c - key[k]))); shifts.push(shift);
        if (shift > LIMITS.keyShift) return refuse(`i ruta ${f} ligger ${target.join(',')} ${shift} nivåer från nyckelfärgen ${key.join(',')} (högst ${LIMITS.keyShift}): det är en omfärgning, ingen lagning.`);
        const dom = key[1] >= key[0] && key[1] >= key[2] ? 1 : key[2] >= key[0] ? 2 : 0, o1 = (dom + 1) % 3, o2 = (dom + 2) % 3, dk = Math.max(key[dom] - Math.max(key[o1], key[o2]), 0.05 * 255);
        const next = frame.slice();
        for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) {
          const i = (y * w + x) * 3, s = (frame[i + dom] - Math.max(frame[i + o1], frame[i + o2])) / dk;
          if (s >= SCREEN.hi && Math.abs(frame[i] - key[0]) <= tol && Math.abs(frame[i + 1] - key[1]) <= tol && Math.abs(frame[i + 2] - key[2]) <= tol) { next[i] = target[0]; next[i + 1] = target[1]; next[i + 2] = target[2]; }
        }
        put(f, next);
      }
      report.measures = {tolerance: tol, colour: op.colour ?? 'rutans eget gröna (hörnet)', to: op.to ?? 'key', largestShift: Math.max(0, ...shifts), rule: `bakgrund: (dominant − max(övriga)) / nyckelns ≥ ${SCREEN.hi} och högst ${tol} nivåer från nyckeln per kanal`};
      continue;
    }
    if (op.op === 'level') {
      const ref = resize(pictures[op.reference], w, h), refSmall = eighth(ref, w, h);
      let gain: RGB = [1, 1, 1], lift: RGB = [0, 0, 0];
      if (op.tone) {
        const toneFrame = op.toneFrame ?? range![0], frame = store.get(toneFrame), chroma = (d: Uint8Array, p: number) => d[p * 3 + 1] - Math.max(d[p * 3], d[p * 3 + 2]);
        const both = new Uint8Array(pixels); for (let y = 0; y < h; y++) for (let x = 0; x < Math.floor(PERSON_X * w); x++) { const p = y * w + x; both[p] = chroma(ref, p) < 20 && chroma(frame, p) < 20 ? 1 : 0; }
        const person = erode(both, w, h, 3), stats = (d: Uint8Array) => [0, 1, 2].map(c => { let s = 0, q = 0, n = 0; for (let p = 0; p < pixels; p++) if (person[p]) { const v = d[p * 3 + c]; s += v; q += v * v; n++; } const m = n ? s / n : 0; return {m, sd: n ? Math.sqrt(Math.max(0, q / n - m * m)) : 0, n}; });
        const a = stats(ref), b = stats(frame);
        if (!a[0].n) return refuse('ingen del av henne syns i både referensen och ruta ' + toneFrame + '; tonen kan inte mätas.');
        gain = [0, 1, 2].map(c => a[c].sd / Math.max(1e-3, b[c].sd)) as RGB; lift = [0, 1, 2].map(c => a[c].m - gain[c] * b[c].m) as RGB;
        report.measures.tone = {frame: toneFrame, gain: gain.map(round4), lift: lift.map(v => Math.round(v * 100) / 100), pixels: a[0].n};
        if (gain.some(g => g < LIMITS.levelGain[0] || g > LIMITS.levelGain[1]) || lift.some(l => Math.abs(l) > LIMITS.levelLift)) return refuse(`tonen skiljer för mycket från referensen (förstärkning ${gain.map(g => g.toFixed(3)).join(', ')}, lyft ${lift.map(l => l.toFixed(1)).join(', ')}; tillåtet ${LIMITS.levelGain.join('–')} och ±${LIMITS.levelLift}): det är en annan bild, ingen nivå.`);
      }
      const x0 = Math.round(CORNER.x0 * w), x1 = Math.max(x0 + 1, Math.round(CORNER.x1 * w)), y0 = Math.round(CORNER.y0 * h), y1 = Math.max(y0 + 1, Math.round(CORNER.y1 * h));
      let largest = 0;
      for (let f = range![0]; f <= range![1]; f++) {
        // The frame's own screen level says how much of each pixel is screen (its green share, as efterarbete.py takes it); the
        // correction is the wide field above, so only the screen and the screen's share of soft edges and hair move.
        const frame = store.get(f), gk = smoothGreen(frame, w, h), corr = fieldOf(refSmall, eighth(frame, w, h), w, h), shift = [0, 0, 0]; let n = 0;
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const k = (y * w + x) * 3; for (let c = 0; c < 3; c++) shift[c] += corr[k + c]; n++; }
        const worst = Math.max(...shift.map(v => Math.abs(v / n))); largest = Math.max(largest, worst);
        if (worst > LIMITS.levelGreen) return refuse(`i ruta ${f} ligger det gröna ${Math.round(worst)} nivåer från referensens (högst ${LIMITS.levelGreen}): det är en annan bild, ingen nivå.`);
        const next = new Uint8Array(pixels * 3);
        for (let p = 0; p < pixels; p++) {
          const i = p * 3, screen = gk[i + 1] - Math.max(gk[i], gk[i + 2]), share = Math.min(1, Math.max(0, (frame[i + 1] - Math.max(frame[i], frame[i + 2])) / Math.max(1, screen)));
          for (let c = 0; c < 3; c++) { const v = frame[i + c]; next[i + c] = clamp(v + share * corr[i + c] + (1 - share) * (v * (gain[c] - 1) + lift[c])); }
        }
        put(f, next);
      }
      report.measures = {...report.measures, reference: op.reference, largestGreenShift: Math.round(largest * 10) / 10, limit: LIMITS.levelGreen};
      continue;
    }
  }
  return {ok: true, reports, keep: [start, film.count - 1 - end], frameShift: start, changed: [...touched].sort((a, b) => a - b)};
}
const round4 = (v: number) => Math.round(v * 10000) / 10000;

/** A store over frames held in memory (tests, small films). */
export function memoryStore(width: number, height: number, frames: Uint8Array[]): FrameStore & {frames: Uint8Array[]} {
  return {width, height, frames, get count() { return frames.length; }, get: i => frames[i], set: (i, data) => { frames[i] = data; }};
}
