// The after-work of a delivered film, ported from the Python that tonight's ordering ran (D:/dealer-scratch/tmp/paow/skript/:
// efterarbete.py, slutkoll.py, kantkoll.py and the pixel half of filmmatt.py), so that the same delivery gives the same frames.
// Pure: frames come and go as 8-bit BGR, OpenCV's order (3 bytes per pixel, rows top down, no padding); no files, no FFmpeg
// (tools/film-after.ts decodes, applies, encodes and writes the receipt). BGR and not the repo's usual RGB because OpenCV's blur
// handles the last few values of a row in another way than the rest, so which colour lands there decides the last bit; the
// colours a person reads (the receipt's greens) are printed in RGB.
//
// What the after-work does and why (D:/dealer-scratch/tmp/paow/LASMIG.md, docs/DRIFT.md "Lärdomar som gäller"):
//   - WAN 3 darkens its two last frames in every film: they are cut (TREATMENTS.wan3.cutTail).
//   - Every frame's green is brought to the green of the anchor the film starts in: background, soft edges and the green share in
//     hair alike, which also takes out the drift WAN 3 adds after the first frame. Nothing of the person is repainted.
//   - lock: the person is lifted to the levels of the picture the film was started in (WAN 3 darkens every film by about four
//     levels), one gain and one lift per channel measured on her in that picture against the film's first frame.
//   - A film of another size than the bank's frame (Kling 4: 1764 × 1172; Kling 3.0 4K: 3528 × 2348) is scaled to it first.
//
// Same result: the scripts ran on OpenCV 5.0 (the venv of D:/dealer-scratch/tmp/filmagent/py), so the steps below follow
// OpenCV's own arithmetic where it decides a pixel: the area mean at an eighth (rounded to bytes, halves to even), the Gaussian
// blur in single precision with its fused multiply-adds, the bilinear and bicubic scaling as OpenCV 5.0 does it for floats, NumPy's
// single-precision sums and the final truncation to bytes. Compared against tonight's after.mp4 files with tools/film-after.ts
// --compare (2026-11-13): WAN 3 and the 4K film byte-identical; Kling 4 about ten values a frame one level apart before encoding.

/** Three values per pixel; in a frame and in the tone they are B, G, R (OpenCV's order). */
export type Triple = [number, number, number];
export type RGB = Triple;
/** A picture: 8-bit BGR, rows top down. */
export type Picture = {width: number; height: number; data: Uint8Array};

// ── The bank's frame and the treatments ─────────────────────────────────────
export const BANK = {width: 1764, height: 1174};
/** Left of the shoe: only the dealer (the tone lock and the end check measure her, not the shoe or the card in it). */
export const PERSON_RIGHT = 1150;
/** The corner the green level is read in, as the scripts print it: x 0..95, y 0..95. */
export const CORNER = 96;

export type Treatment = {model: string; cutTail: number; lock: boolean; why: string};
/**
 * What each model's delivery gets, as tonight's orders did (the ordering agents' notes in the receipts' histories):
 * WAN 3 `--lock first.png` (the two last frames cut, the person lifted), Kling 4 `--keep-tail --fps 24` (no cut, no lock),
 * Kling 3.0 4K `--keep-tail --fps 24 --lock first.png` (paow-ingang-2-1-02). The frame rate is always the delivery's own.
 */
export const TREATMENTS: Record<string, Treatment> = {
  'wan3': {model: 'wan3', cutTail: 2, lock: true, why: 'WAN 3: de två sista rutorna mörknar och klipps; hela filmen är cirka fyra nivåer mörk och lyfts till första bilden'},
  'kling-4': {model: 'kling-4', cutTail: 0, lock: false, why: 'Kling 4: 1764 × 1172 skalas till 1764 × 1174, ljudet tas bort, inga rutor klipps'},
  'kling-3-4k': {model: 'kling-3-4k', cutTail: 0, lock: true, why: 'Kling 3.0 4K: skalas ner till bankens ram, inga rutor klipps, personen lyfts till första bilden'},
};

// ── OpenCV's arithmetic ─────────────────────────────────────────────────────
const f32 = Math.fround;
/** cvRound: the nearest integer, halves to even (the SSE2 conversion in the default rounding mode). NaN gives 0 once saturated. */
export function cvRound(v: number): number { const r = Math.round(v); return r - v === 0.5 && (r & 1) ? r - 1 : r; }
const sat8 = (v: number) => v !== v ? 0 : v < 0 ? 0 : v > 255 ? 255 : v;

/** cv2.resize(im, None, fx=0.125, fy=0.125, INTER_AREA) on an 8-bit picture of ch channels: whole 8 × 8 blocks, the part blocks at the far edges averaged over what lies inside. */
export function areaEighth(src: Uint8Array, w: number, h: number, ch = 3): {data: Uint8Array; width: number; height: number} {
  const dw = cvRound(w * 0.125), dh = cvRound(h * 0.125), out = new Uint8Array(dw * dh * ch), whole = Math.floor(w / 8);
  for (let dy = 0; dy < dh; dy++) {
    const y0 = dy * 8, y1 = Math.min(h, y0 + 8), fullRow = y0 + 8 <= h;
    for (let dx = 0; dx < dw; dx++) {
      const x0 = dx * 8, x1 = Math.min(w, x0 + 8), fast = fullRow && dx < whole;
      for (let c = 0; c < ch; c++) {
        let s = 0, n = 0;
        for (let y = y0; y < y1; y++) { let i = (y * w + x0) * ch + c; for (let x = x0; x < x1; x++, i += ch) { s += src[i]; n++; } }
        out[(dy * dw + dx) * ch + c] = sat8(cvRound(fast ? s / 64 : f32(s / n)));
      }
    }
  }
  return {data: out, width: dw, height: dh};
}

type AreaTab = {di: Int32Array; si: Int32Array; alpha: Float32Array; size: number};
function areaTab(ssize: number, dsize: number, cn: number, scale: number): AreaTab {
  const di = new Int32Array(ssize * 2 + 2), si = new Int32Array(ssize * 2 + 2), alpha = new Float32Array(ssize * 2 + 2);
  let k = 0;
  for (let dx = 0; dx < dsize; dx++) {
    const fsx1 = dx * scale, fsx2 = fsx1 + scale, cell = Math.min(scale, ssize - fsx1);
    let sx1 = Math.ceil(fsx1), sx2 = Math.floor(fsx2);
    sx2 = Math.min(sx2, ssize - 1); sx1 = Math.min(sx1, sx2);
    if (sx1 - fsx1 > 1e-3) { di[k] = dx * cn; si[k] = (sx1 - 1) * cn; alpha[k++] = (sx1 - fsx1) / cell; }
    for (let sx = sx1; sx < sx2; sx++) { di[k] = dx * cn; si[k] = sx * cn; alpha[k++] = 1 / cell; }
    if (fsx2 - sx2 > 1e-3) { di[k] = dx * cn; si[k] = sx2 * cn; alpha[k++] = Math.min(Math.min(fsx2 - sx2, 1), cell) / cell; }
  }
  return {di, si, alpha, size: k};
}
/** cv2.resize(im, (dw, dh), INTER_AREA) for a reduction that is not a whole number in both directions (filmmatt.py's quarter frame). 8-bit, 3 channels. */
export function areaResize(src: Uint8Array, w: number, h: number, dw: number, dh: number): Uint8Array {
  const sx = w / dw, sy = h / dh, out = new Uint8Array(dw * dh * 3);
  if (Number.isInteger(sx) && Number.isInteger(sy)) {
    // OpenCV's fast path: whole blocks, the sum times 1/area in single precision.
    const area = sx * sy, scale = f32(1 / area);
    for (let dy = 0; dy < dh; dy++) for (let dx = 0; dx < dw; dx++) for (let c = 0; c < 3; c++) {
      let s = 0; for (let y = dy * sy; y < dy * sy + sy; y++) for (let x = dx * sx; x < dx * sx + sx; x++) s += src[(y * w + x) * 3 + c];
      out[(dy * dw + dx) * 3 + c] = sat8(cvRound(f32(s * scale)));
    }
    return out;
  }
  const xt = areaTab(w, dw, 3, 1 / (dw / w)), yt = areaTab(h, dh, 1, 1 / (dh / h)), width = dw * 3;
  const buf = new Float32Array(width), sum = new Float32Array(width);
  let prev = yt.di[0];
  for (let j = 0; j < yt.size; j++) {
    const beta = yt.alpha[j], dy = yt.di[j], row = yt.si[j] * w * 3;
    buf.fill(0);
    for (let k = 0; k < xt.size; k++) { const s = row + xt.si[k], d = xt.di[k], a = xt.alpha[k]; buf[d] = f32(buf[d] + f32(src[s] * a)); buf[d + 1] = f32(buf[d + 1] + f32(src[s + 1] * a)); buf[d + 2] = f32(buf[d + 2] + f32(src[s + 2] * a)); }
    if (dy !== prev) { for (let x = 0; x < width; x++) { out[prev * width + x] = sat8(cvRound(sum[x])); sum[x] = f32(beta * buf[x]); } prev = dy; }
    else for (let x = 0; x < width; x++) sum[x] = f32(sum[x] + f32(beta * buf[x]));
  }
  for (let x = 0; x < width; x++) out[prev * width + x] = sat8(cvRound(sum[x]));
  return out;
}

/** Erosion of a 0/1 mask by a kw × kh rectangle; outside the picture does not erode (OpenCV's default border for erode). */
export function erode(mask: Uint8Array, w: number, h: number, kw: number, kh = kw): Uint8Array {
  const rx = kw >> 1, ry = kh >> 1, across = new Uint8Array(w * h), out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) { let run = 0; const zero = new Int32Array(w + 1); for (let x = 0; x < w; x++) { if (!mask[y * w + x]) run++; zero[x + 1] = run; }
    for (let x = 0; x < w; x++) across[y * w + x] = zero[Math.min(w, x + rx + 1)] - zero[Math.max(0, x - rx)] === 0 ? 1 : 0; }
  for (let x = 0; x < w; x++) { let run = 0; const zero = new Int32Array(h + 1); for (let y = 0; y < h; y++) { if (!across[y * w + x]) run++; zero[y + 1] = run; }
    for (let y = 0; y < h; y++) out[y * w + x] = zero[Math.min(h, y + ry + 1)] - zero[Math.max(0, y - ry)] === 0 ? 1 : 0; }
  return out;
}
/** Dilation of a 0/1 mask by a kw × kh rectangle; nothing outside the picture. */
export function dilate(mask: Uint8Array, w: number, h: number, kw: number, kh = kw): Uint8Array {
  const inverse = new Uint8Array(w * h); for (let p = 0; p < w * h; p++) inverse[p] = mask[p] ? 0 : 1;
  const e = erode(inverse, w, h, kw, kh); for (let p = 0; p < w * h; p++) e[p] = e[p] ? 0 : 1;
  return e;
}

/** cv::getGaussianKernel(n, sigma, CV_32F): the bit-exact double kernel, normalised, then cast to single precision. */
export function gaussianKernel(n: number, sigma: number): Float32Array {
  const scale2 = -0.125 / (sigma * sigma), half = (n - 1) >> 1, values: number[] = [];
  let sum = 0;
  for (let i = 0, x = 1 - n; i < half; i++, x += 2) { const t = Math.exp(x * x * scale2); values.push(t); sum += t; }
  sum = sum * 2 + 1; if (!(n & 1)) sum += 1;
  const mul = 1 / sum, out = new Float32Array(n);
  for (let i = 0; i < half; i++) out[i] = out[n - 1 - i] = values[i] * mul;
  out[half] = mul; if (!(n & 1)) out[half + 1] = mul;
  return out;
}
const reflect101 = (p: number, n: number) => { if (n === 1) return 0; while (p < 0 || p >= n) p = p < 0 ? -p : 2 * n - 2 - p; return p; };
/**
 * cv2.GaussianBlur(src, (0, 0), sigma) on a single-precision picture of ch channels: a 8σ+1 kernel, the border reflected without
 * its edge pixel (BORDER_REFLECT_101), rows first and then columns, as OpenCV's AVX2 code adds them: fused multiply-adds in
 * blocks of 8 along a row and 16 down a column, plain single-precision steps for the few values left at the end of a row.
 */
export function gaussianBlur(src: Float32Array, w: number, h: number, ch: number, sigma: number): Float32Array {
  const n = (cvRound(sigma * 8 + 1) | 1), r = n >> 1, k = gaussianKernel(n, sigma), width = w * ch;
  const rows = new Float32Array(w * h * ch), out = new Float32Array(w * h * ch), line = new Float32Array((w + 2 * r) * ch);
  const rowVec = Math.floor(width / 8) * 8;
  for (let y = 0; y < h; y++) {
    for (let x = -r; x < w + r; x++) { const sxp = reflect101(x, w); for (let c = 0; c < ch; c++) line[(x + r) * ch + c] = src[(y * w + sxp) * ch + c]; }
    for (let i = 0; i < width; i++) {
      let s: number;
      if (i < rowVec) { s = 0; for (let t = 0; t < n; t++) s = f32(line[i + t * ch] * k[t] + s); }
      else { s = f32(k[0] * line[i]); for (let t = 1; t < n; t++) s = f32(s + f32(k[t] * line[i + t * ch])); }
      rows[y * width + i] = s;
    }
  }
  const colVec = Math.floor(width / 16) * 16 + Math.floor((width - Math.floor(width / 16) * 16) / 8) * 8, kc = k.subarray(r), below = new Int32Array(r + 1), above = new Int32Array(r + 1);
  for (let y = 0; y < h; y++) {
    for (let t = 0; t <= r; t++) { below[t] = reflect101(y + t, h) * width; above[t] = reflect101(y - t, h) * width; }
    const mid = below[0], o = y * width;
    for (let i = 0; i < width; i++) {
      let s: number;
      if (i < colVec) { s = f32(rows[mid + i] * kc[0]); for (let t = 1; t <= r; t++) s = f32(f32(rows[below[t] + i] + rows[above[t] + i]) * kc[t] + s); }
      else { s = f32(kc[0] * rows[mid + i]); for (let t = 1; t <= r; t++) s = f32(s + f32(kc[t] * f32(rows[below[t] + i] + rows[above[t] + i]))); }
      out[o + i] = s;
    }
  }
  return out;
}

type Taps = {ofs: Int32Array; t: Float32Array};
// Where each output pixel samples: the source position in double precision, clamped at the edges (the weight then 0).
function linearTaps(ssize: number, dsize: number): Taps {
  const ofs = new Int32Array(dsize), t = new Float32Array(dsize), ratio = ssize / dsize;
  for (let d = 0; d < dsize; d++) {
    const at = (d + 0.5) * ratio - 0.5; let s = Math.floor(at), f = at - s;
    if (s < 0) { s = 0; f = 0; }
    if (s >= ssize - 1) { s = ssize - 1; f = 0; }
    ofs[d] = s; t[d] = f;
  }
  return {ofs, t};
}
/**
 * cv2.resize(src, (dw, dh), INTER_LINEAR) on a single-precision picture of ch channels (the smooth green back to full size), as
 * OpenCV 5.0 computes it for floats: the position in double precision, the weight in single, and two steps along x and one down,
 * each a fused a + t·(b − a). Matched every value of the anchor's field against the script's.
 */
export function resizeLinear(src: Float32Array, sw: number, sh: number, ch: number, dw: number, dh: number): Float32Array {
  const xt = linearTaps(sw, dw), yt = linearTaps(sh, dh), out = new Float32Array(dw * dh * ch), width = dw * ch;
  const at = (y: number, x: number, c: number) => src[(y * sw + x) * ch + c];
  for (let dy = 0; dy < dh; dy++) {
    const y0 = yt.ofs[dy], y1 = Math.min(sh - 1, y0 + 1), ty = yt.t[dy], o = dy * width;
    for (let dx = 0; dx < dw; dx++) {
      const x0 = xt.ofs[dx], x1 = Math.min(sw - 1, x0 + 1), tx = xt.t[dx];
      for (let c = 0; c < ch; c++) {
        const a = at(y0, x0, c), b = at(y0, x1, c), p = at(y1, x0, c), q = at(y1, x1, c);
        const r0 = f32(a + tx * f32(b - a)), r1 = f32(p + tx * f32(q - p));
        out[o + dx * ch + c] = f32(r0 + ty * f32(r1 - r0));
      }
    }
  }
  return out;
}

const A = -0.75;
function cubicCoeffs(x: number): [number, number, number, number] {
  const c0 = f32(f32(f32(f32(f32(f32(A * f32(x + 1)) - f32(5 * A)) * f32(x + 1)) + f32(8 * A)) * f32(x + 1)) - f32(4 * A));
  const c1 = f32(f32(f32(f32(f32(f32(A + 2) * x) - f32(A + 3)) * x) * x) + 1);
  const y = f32(1 - x), c2 = f32(f32(f32(f32(f32(f32(A + 2) * y) - f32(A + 3)) * y) * y) + 1);
  return [c0, c1, c2, f32(f32(f32(1 - c0) - c1) - c2)];
}
function cubicTaps(ssize: number, dsize: number): {ofs: Int32Array; a: Float32Array} {
  const ofs = new Int32Array(dsize), a = new Float32Array(dsize * 4), ratio = ssize / dsize;
  for (let d = 0; d < dsize; d++) { const at = (d + 0.5) * ratio - 0.5, s = Math.floor(at); ofs[d] = s; a.set(cubicCoeffs(f32(at - s)), d * 4); }
  return {ofs, a};
}
const sum4 = (p0: number, p1: number, p2: number, p3: number, a: Float32Array, k: number) => f32(f32(f32(p0 * a[k]) + f32(p1 * a[k + 1])) + f32(f32(p2 * a[k + 2]) + f32(p3 * a[k + 3])));
/**
 * cv2.resize(src, (dw, dh), INTER_CUBIC) on an 8-bit BGR picture, as OpenCV 5.0 computes it: the position in double precision, the
 * four weights (a = −0.75) in single, along x into single-precision rows (the border repeated) and then down, rounded half to even
 * at the end. Exact on the 4K film's halving; on Kling 4's 1172 → 1174 rows about eight values a frame fall on the other side of a
 * half (one level), where OpenCV's own order of the four products is not known.
 */
export function resizeCubic(src: Uint8Array, sw: number, sh: number, dw: number, dh: number): Uint8Array {
  const ch = 3, xt = cubicTaps(sw, dw), yt = cubicTaps(sh, dh), width = dw * ch, out = new Uint8Array(dh * width), cache = new Map<number, Float32Array>();
  const horizontal = (sy: number) => {
    let row = cache.get(sy); if (row) return row;
    row = new Float32Array(width); const base = sy * sw * ch, at = (x: number, c: number) => src[base + Math.min(sw - 1, Math.max(0, x)) * ch + c];
    for (let d = 0; d < dw; d++) { const x = xt.ofs[d]; for (let c = 0; c < ch; c++) row[d * ch + c] = sum4(at(x - 1, c), at(x, c), at(x + 1, c), at(x + 2, c), xt.a, d * 4); }
    cache.set(sy, row); if (cache.size > 8) cache.delete(cache.keys().next().value!);
    return row;
  };
  const clampY = (y: number) => Math.min(sh - 1, Math.max(0, y));
  for (let dy = 0; dy < dh; dy++) {
    const s = yt.ofs[dy], r0 = horizontal(clampY(s - 1)), r1 = horizontal(clampY(s)), r2 = horizontal(clampY(s + 1)), r3 = horizontal(clampY(s + 2)), o = dy * width;
    for (let x = 0; x < width; x++) out[o + x] = sat8(cvRound(sum4(r0[x], r1[x], r2[x], r3[x], yt.a, dy * 4)));
  }
  return out;
}

// ── The green and the tone ──────────────────────────────────────────────────
const chromaAt = (d: Uint8Array | Float32Array, i: number) => d[i + 1] - Math.max(d[i], d[i + 2]);

/**
 * The green of the screen as a smooth field over the whole picture (efterarbete.py's smooth_green): at an eighth of the size,
 * the pure screen (G − max(R, B) > 50 and G > 110, one small pixel in from its edge) blurred with σ 8 and divided by its own
 * blurred coverage, then brought back to full size. Where she is, the field carries the green around her. BGR, float.
 */
export function smoothGreen(frame: Uint8Array, w: number, h: number): Float32Array {
  const small = areaEighth(frame, w, h), sw = small.width, sh = small.height, n = sw * sh, pure0 = new Uint8Array(n);
  for (let p = 0; p < n; p++) { const i = p * 3; pure0[p] = small.data[i + 1] - Math.max(small.data[i], small.data[i + 2]) > 50 && small.data[i + 1] > 110 ? 1 : 0; }
  const pure = erode(pure0, sw, sh, 3), weighted = new Float32Array(n * 3), cover = new Float32Array(n);
  for (let p = 0; p < n; p++) { cover[p] = pure[p]; for (let c = 0; c < 3; c++) weighted[p * 3 + c] = small.data[p * 3 + c] * pure[p]; }
  const num = gaussianBlur(weighted, sw, sh, 3, 8), den = gaussianBlur(cover, sw, sh, 1, 8), field = new Float32Array(n * 3), floor = f32(1e-3);
  for (let p = 0; p < n; p++) { const d = Math.max(floor, den[p]); for (let c = 0; c < 3; c++) field[p * 3 + c] = f32(num[p * 3 + c] / d); }
  return resizeLinear(field, sw, sh, 3, w, h);
}

export type Tone = {gain: RGB; lift: RGB; pixels: number; startMean: RGB; startSpread: RGB; frameMean: RGB; frameSpread: RGB};
/** NumPy's mean and standard deviation of float32 values along the first axis: a running single-precision sum per channel. */
function stats32(values: Uint8Array, idx: Int32Array, count: number): {mean: RGB; std: RGB} {
  const mean = [0, 0, 0] as RGB, std = [0, 0, 0] as RGB;
  for (let c = 0; c < 3; c++) {
    let s = 0; for (let j = 0; j < count; j++) s = f32(s + values[idx[j] + c]);
    const m = f32(s / count); let q = 0;
    for (let j = 0; j < count; j++) { const d = f32(values[idx[j] + c] - m); q = f32(q + f32(d * d)); }
    mean[c] = m; std[c] = f32(Math.sqrt(f32(q / count)));
  }
  return {mean, std};
}
/**
 * The tone lock (efterarbete.py --lock): where both the start picture and the film's first frame show her (no green dominance
 * of 20 or more, 3 px in, left of the shoe), one gain and one lift per channel that give the frame her spread and mean in the
 * start picture. Applied to every frame where it is not screen.
 */
export function toneLock(start: Uint8Array, first: Uint8Array, w: number, h: number): Tone {
  const both = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) both[p] = chromaAt(start, p * 3) < 20 && chromaAt(first, p * 3) < 20 ? 1 : 0;
  const person = erode(both, w, h, 7), idx = new Int32Array(w * h); let n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < Math.min(w, PERSON_RIGHT); x++) if (person[y * w + x]) idx[n++] = (y * w + x) * 3;
  const a = stats32(start, idx, n), b = stats32(first, idx, n), floor = f32(1e-3);
  const gain = [0, 1, 2].map(c => f32(a.std[c] / Math.max(floor, b.std[c]))) as RGB, lift = [0, 1, 2].map(c => f32(a.mean[c] - f32(gain[c] * b.mean[c]))) as RGB;
  return {gain, lift, pixels: n, startMean: a.mean, startSpread: a.std, frameMean: b.mean, frameSpread: b.std};
}
export const NO_TONE = {gain: [1, 1, 1] as RGB, lift: [0, 0, 0] as RGB};

/**
 * One frame brought to the anchor's green (efterarbete.py's loop): how much of each pixel is screen (its green dominance against
 * the frame's own smooth green, 0..1) decides how much of the green difference it gets; the rest of it gets the tone lock.
 * Single precision step by step as NumPy evaluates it, truncated to bytes at the end as astype(uint8) does.
 */
export function levelFrame(frame: Uint8Array, anchorGreen: Float32Array, w: number, h: number, tone: {gain: RGB; lift: RGB} = NO_TONE): Uint8Array {
  const gk = smoothGreen(frame, w, h), out = new Uint8Array(w * h * 3), g1 = tone.gain.map(g => f32(g - 1)), lift = tone.lift;
  for (let p = 0; p < w * h; p++) {
    const i = p * 3, screen = Math.max(1, f32(gk[i + 1] - Math.max(gk[i], gk[i + 2]))), share = Math.min(1, Math.max(0, f32(chromaAt(frame, i) / screen))), rest = f32(1 - share);
    for (let c = 0; c < 3; c++) {
      const v = frame[i + c], moved = f32(v + f32(share * f32(anchorGreen[i + c] - gk[i + c]))), toned = f32(rest * f32(f32(v * g1[c]) + lift[c])), o = f32(moved + toned);
      out[i + c] = o <= 0 ? 0 : o >= 255 ? 255 : Math.trunc(o);
    }
  }
  return out;
}

/** The mean colour of the corner (x, y below 96) of a BGR frame, as the scripts print the green: R, G, B with one decimal. */
export function cornerMean(frame: Uint8Array, w: number, h: number, size = CORNER): RGB {
  const s = [0, 0, 0]; let n = 0;
  for (let y = 0; y < Math.min(size, h); y++) for (let x = 0; x < Math.min(size, w); x++) { const i = (y * w + x) * 3; s[0] += frame[i + 2]; s[1] += frame[i + 1]; s[2] += frame[i]; n++; }
  return s.map(v => round(v / n, 1)) as RGB;
}
/** Python's round(x, n) for the values printed in a receipt. */
export const round = (v: number, n: number) => Number(v.toFixed(n));
/** NumPy's array.round(n): x · 10ⁿ in double precision, rounded half to even (42.45 → 42.4, where Python's round gives 42.5). */
export const npRound = (v: number, n: number) => { const p = 10 ** n; return cvRound(v * p) / p; };


// ── Measures ────────────────────────────────────────────────────────────────
export type Blob = {left: number; top: number; width: number; height: number; area: number; cx: number; cy: number};
/**
 * cv2.connectedComponentsWithStats(mask, connectivity 8): every 8-connected group of set pixels with its box, area and centroid,
 * numbered in the order of each group's first pixel row by row (labels 1.., 0 = not set). OpenCV's own numbering scans two rows at
 * a time, so two groups that begin on neighbouring rows may come in the other order; only ties in a sort by size see that.
 */
export function components(mask: Uint8Array, w: number, h: number): {labels: Int32Array; blobs: Blob[]} {
  const labels = new Int32Array(w * h), parent: number[] = [0];
  const find = (a: number) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const union = (a: number, b: number) => { a = find(a); b = find(b); if (a !== b) { if (a < b) parent[b] = a; else parent[a] = b; } return Math.min(a, b); };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x; if (!mask[p]) continue;
    let l = 0;
    const around = [x > 0 ? p - 1 : -1, y > 0 && x > 0 ? p - w - 1 : -1, y > 0 ? p - w : -1, y > 0 && x < w - 1 ? p - w + 1 : -1];
    for (const q of around) if (q >= 0 && labels[q]) l = l ? union(l, labels[q]) : find(labels[q]);
    if (!l) { l = parent.length; parent.push(l); }
    labels[p] = l;
  }
  const index = new Int32Array(parent.length), acc: {left: number; top: number; right: number; bottom: number; area: number; sx: number; sy: number}[] = [];
  for (let l = 1; l < parent.length; l++) if (find(l) === l) { index[l] = acc.length + 1; acc.push({left: w, top: h, right: -1, bottom: -1, area: 0, sx: 0, sy: 0}); }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x; if (!labels[p]) continue;
    const k = index[find(labels[p])], b = acc[k - 1]; labels[p] = k;
    b.area++; b.sx += x; b.sy += y; if (x < b.left) b.left = x; if (x > b.right) b.right = x; if (y < b.top) b.top = y; if (y > b.bottom) b.bottom = y;
  }
  return {labels, blobs: acc.map(b => ({left: b.left, top: b.top, width: b.right - b.left + 1, height: b.bottom - b.top + 1, area: b.area, cx: b.sx / b.area, cy: b.sy / b.area}))};
}
const isGreen = (d: Uint8Array, i: number) => d[i + 1] - Math.max(d[i], d[i + 2]) > 50 && d[i + 1] > 110;
/** NumPy's median: the middle value, or the mean of the two middle ones. */
export const median = (v: ArrayLike<number>) => { const s = Float64Array.from(v).sort(), n = s.length; return n ? (n & 1 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };

/** kantkoll.py: the table's back edge on an anchor or a frame (ground standard, row 831.5). */
export type EdgeCheck = {green: RGB; darkGreenPixelsAboveEdge: number; blobs: {box: number[]; pixels: number; deepest: number}[]; bodyEnds: {columns: number; min: number; median: number; max: number} | null; betweenHands: {min: number; median: number; max: number} | null};
export const EDGE = {row: 832, darkBy: 10, bodyRows: [825, 831] as const};
/**
 * Above the edge the green is even: no green pixel 10 levels or more darker than the background further than 2 px from the person
 * or the shoe (a shadow under an elbow or beside the shoe would be such pixels); and where the body ends (per column under the
 * torso, the last row that is not green, where she is unbroken for 150 rows above it). A BGR picture of the bank's size.
 */
export function edgeCheck(im: Uint8Array, w: number, h: number): EdgeCheck {
  const n = w * h, solid = new Uint8Array(n);
  for (let p = 0; p < n; p++) { const i = p * 3; solid[p] = im[i + 1] - Math.max(im[i], im[i + 2]) < 15 ? 1 : 0; }
  const ch: number[][] = [[], [], []];
  for (let y = 20; y < Math.min(h, 120); y++) for (let x = 20; x < Math.min(w, 320); x++) for (let c = 0; c < 3; c++) ch[c].push(im[(y * w + x) * 3 + c]);
  const ref = ch.map(median), near = dilate(solid, w, h, 5), dark = new Uint8Array(n);
  for (let p = 0; p < Math.min(n, EDGE.row * w); p++) { const i = p * 3; dark[p] = !near[p] && im[i + 1] <= ref[1] - EDGE.darkBy && im[i + 2] <= ref[2] + 25 && im[i] <= ref[0] + 25 ? 1 : 0; }
  const {labels, blobs} = components(dark, w, h), deepest = blobs.map(() => 255);
  for (let p = 0; p < n; p++) if (labels[p]) deepest[labels[p] - 1] = Math.min(deepest[labels[p] - 1], im[p * 3 + 1]);
  const found = blobs.map((b, k) => ({box: [b.left, b.top, b.left + b.width, b.top + b.height], pixels: b.area, deepest: Math.trunc(ref[1] - deepest[k])})).filter(b => b.pixels >= 12).sort((a, b) => b.pixels - a.pixels);
  const ends = new Map<number, number>();
  for (let x = 560; x < Math.min(w, 1180); x++) {
    let y = -1; for (let yy = Math.min(h, 900) - 1; yy >= 0; yy--) if (solid[yy * w + x]) { y = yy; break; }
    if (y > 150) { let all = true; for (let yy = y - 150; yy < y; yy++) if (!solid[yy * w + x]) { all = false; break; } if (all) ends.set(x, y); }
  }
  const rows = [...ends.values()], torso = [...ends].filter(([x]) => x >= 840 && x <= 905).map(([, y]) => y);
  let darkCount = 0; for (let p = 0; p < n; p++) darkCount += dark[p];
  return {green: [Math.trunc(ref[2]), Math.trunc(ref[1]), Math.trunc(ref[0])], darkGreenPixelsAboveEdge: darkCount, blobs: found.slice(0, 8),
    bodyEnds: rows.length ? {columns: rows.length, min: Math.min(...rows), median: median(rows), max: Math.max(...rows)} : null,
    betweenHands: torso.length ? {min: Math.min(...torso), median: median(torso), max: Math.max(...torso)} : null};
}

/**
 * slutkoll.py: does a film end in its end picture? Over the person only (the end picture's own outline, left of the shoe, 2 px in):
 * the mean change from frame to frame in the last 8 frames, each of those frames' mean difference to the end picture, the largest
 * change anywhere, and the warmth of her skin (red minus green, median) in the film against the picture. Fed frame by frame.
 */
export function endCheck(end: Uint8Array, w: number, h: number) {
  const n = w * h, body0 = new Uint8Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < Math.min(w, PERSON_RIGHT); x++) body0[y * w + x] = isGreen(end, (y * w + x) * 3) ? 0 : 1;
  const body = erode(body0, w, h, 5), skin: number[] = [], bodyIdx: number[] = [];
  for (let p = 0; p < n; p++) if (body[p]) {
    const i = p * 3, b = end[i], g = end[i + 1], r = end[i + 2]; bodyIdx.push(i);
    if (r > g + 12 && r > b + 20 && g < r * 0.84 && b > 70 && r > 150) skin.push(i);
  }
  const warm = (im: Uint8Array) => { if (!skin.length) return null; const v = skin.map(i => im[i + 2] - im[i + 1]).sort((a, b) => a - b), k = v.length; return round(k & 1 ? v[k >> 1] : f32(f32(v[k / 2 - 1] + v[k / 2]) / 2), 1); };
  const diff = (a: Uint8Array, c: Uint8Array) => { let s = 0; for (const i of bodyIdx) s += Math.abs(a[i] - c[i]) + Math.abs(a[i + 1] - c[i + 1]) + Math.abs(a[i + 2] - c[i + 2]); return round(s / (bodyIdx.length * 3), 2); };
  const recent: Uint8Array[] = [], changes: number[] = [];
  let count = 0, first: number | null = null;
  return {
    add(frame: Uint8Array) {
      if (count === 0) first = warm(frame);
      if (recent.length) changes.push(diff(frame, recent[recent.length - 1]));
      recent.push(frame.slice()); if (recent.length > 10) recent.shift();
      count++;
    },
    result() {
      let best = -1, bestAt = 0; changes.forEach((d, k) => { if (d > best) { best = d; bestAt = k + 1; } });
      return {frames: count, changePerFrameLast8: changes.slice(-8), toEndPictureLast8: recent.slice(-8).map(f => diff(f, end)), largestChangeAnywhere: [best, bestAt],
        skinWarmth: {frame0: first, frameMinus10: recent.length === 10 ? warm(recent[0]) : null, lastFrame: recent.length ? warm(recent[recent.length - 1]) : null, endPicture: warm(end)}};
    },
  };
}

// filmmatt.py's pixel half: format, green level, frozen frames, evenness, coloured cards, landing and the seams against the first
// and last pictures. Its hands and body come from MediaPipe and are not ported (handsFound, bodyFound, --ref).
export const SHOE_WINDOW = [1215, 720, 1365, 880];
export type CardBlob = {c: 'Y' | 'B'; x: number; y: number; area: number; inShoe: boolean};
/** The card colours of the lab's rules (src/card-track.ts), in single precision as the script computes them: yellow back, blue face. */
export function cardBlobs(bgr: Uint8Array, w: number, h: number, scale = 1): CardBlob[] {
  const n = w * h, yellow = new Uint8Array(n), blue = new Uint8Array(n), k82 = f32(0.82), k6 = f32(0.6), k45 = f32(0.45), k15 = f32(1.5), k115 = f32(1.15);
  for (let p = 0; p < n; p++) {
    const i = p * 3, b = bgr[i], g = bgr[i + 1], r = bgr[i + 2];
    const y = r > 95 && g > 95 && g > f32(k82 * r) && r > f32(k6 * g) && b < f32(k45 * Math.min(r, g));
    yellow[p] = y ? 1 : 0; blue[p] = !y && b > 90 && b > f32(k15 * r) && b > f32(k115 * g) ? 1 : 0;
  }
  const out: CardBlob[] = [], [x0, y0, x1, y1] = SHOE_WINDOW;
  for (const [mask, c] of [[yellow, 'Y'], [blue, 'B']] as const) for (const s of components(mask, w, h).blobs) {
    const area = s.area * scale * scale; if (area < 50) continue;
    const cx = s.cx * scale, cy = s.cy * scale;
    out.push({c, x: round(cx, 1), y: round(cy, 1), area: Math.trunc(area), inShoe: x0 < cx && cx < x1 && y0 < cy && cy < y1});
  }
  return out;
}
/** The seam between a frame and a picture (filmmatt.py's still_compare): the largest channel difference per pixel, its mean and how many pixels differ by more than 24. */
export function seam(frame: Uint8Array, picture: Uint8Array): {meanDiff: number; pixelsOver24: number; shareOver24: number} {
  const n = frame.length / 3; let s = 0, over = 0;
  for (let p = 0; p < n; p++) { const i = p * 3, d = Math.max(Math.abs(frame[i] - picture[i]), Math.abs(frame[i + 1] - picture[i + 1]), Math.abs(frame[i + 2] - picture[i + 2])); s += d; if (d > 24) over++; }
  return {meanDiff: round(s / n, 2), pixelsOver24: over, shareOver24: round(over / n, 4)};
}
export type PlanTarget = {u: number; v: number; width: number; height: number};
/** Fed frame by frame; result() gives filmmatt.py's summary without its MediaPipe parts. */
export function filmMeasure(w: number, h: number, fps: number) {
  const scale = BANK.width / w, c = Math.max(8, Math.trunc(96 / scale)), qw = Math.trunc(w / 4), qh = Math.trunc(h / 4);
  const frames: {i: number; greenTop: number[]; greenLow: number[]; step: number | null; cards: CardBlob[]}[] = [];
  let prev: Uint8Array | null = null;
  const mean = (frame: Uint8Array, y0: number) => { const s = [0, 0, 0]; let k = 0; for (let y = y0; y < y0 + c; y++) for (let x = 0; x < c; x++) { const i = (y * w + x) * 3; s[0] += frame[i + 2]; s[1] += frame[i + 1]; s[2] += frame[i]; k++; } return s.map(v => round(v / k, 1)); };
  return {
    add(frame: Uint8Array) {
      const small = areaResize(frame, w, h, qw, qh);
      let step: number | null = null;
      if (prev) { let s = 0; for (let k = 0; k < small.length; k++) s += Math.abs(small[k] - prev[k]); step = round(s / small.length, 3); }
      prev = small;
      frames.push({i: frames.length, greenTop: mean(frame, 0), greenLow: mean(frame, h - c), step, cards: cardBlobs(frame, w, h, scale)});
    },
    result(seats: string[] = [], plan: Record<string, PlanTarget> = {}) {
      const fr = frames, steps = Float32Array.from(fr.slice(1).map(f => f.step!)), med = f32(median(steps));
      const limit = f32(Math.max(0.15, f32(0.25 * med))), moving = Array.from(steps, s => s > limit);
      const frozen = fr.slice(1).filter((_, k) => steps[k] < f32(0.06)).map(f => f.i), rel: number[] = [];
      for (let i = 2; i < steps.length - 2; i++) if (moving.slice(i - 2, i + 3).every(Boolean)) { let s = 0; for (let k = i - 2; k < i + 3; k++) s = f32(s + steps[k]); const m = f32(s / 5); rel.push(f32(Math.abs(f32(steps[i] - m)) / m)); }
      const top = fr.map(f => f.greenTop), low = fr.map(f => f.greenLow), medOf = (rows: number[][]) => [0, 1, 2].map(k => median(rows.map(r => r[k])));
      const jumps = top.slice(1).map((t, k) => Math.max(...t.map((v, j) => Math.abs(v - top[k][j])))), topMed = medOf(top), lowMed = medOf(low);
      const movingCard = (cards: CardBlob[]) => cards.filter(b => !b.inShoe).reduce<CardBlob | null>((best, b) => !best || b.area > best.area ? b : best, null);
      const seen = fr.map(f => [f.i, movingCard(f.cards)] as const), yellowF = seen.filter(([, b]) => b?.c === 'Y').map(([i]) => i), blueF = seen.filter(([, b]) => b?.c === 'B').map(([i]) => i);
      const endBlue = fr.length ? fr[fr.length - 1].cards.filter(b => b.c === 'B' && !b.inShoe) : [];
      const landing: Record<string, unknown> = {};
      for (const seat of seats) {
        const number = /^\d+$/.test(seat), key = number ? `P${seat}.C1` : seat, g = plan[key];
        if (!g) { landing[key] = 'saknas i planen'; continue; }
        const tx = g.u * (BANK.width - 1), ty = (1 - g.v) * (BANK.height - 1);
        const near = endBlue.reduce<CardBlob | null>((best, b) => !best || Math.hypot(b.x - tx, b.y - ty) < Math.hypot(best.x - tx, best.y - ty) ? b : best, null);
        landing[number ? `P${seat}` : key] = near ? {fromPlan: round(Math.hypot(near.x - tx, near.y - ty), 1), area: near.area, planArea: Math.trunc(g.width * BANK.width * g.height * BANK.height)} : null;
      }
      return {size: [w, h], fps: round(fps, 3), frameCount: fr.length, seconds: round(fr.length / fps, 3), bankFormat: w === BANK.width && h === BANK.height && Math.abs(fps - 30) < 0.01,
        green: {topFirst: top[0], topMedian: topMed.map(v => npRound(v, 1)), topLast: top[top.length - 1], lowMedian: lowMed.map(v => npRound(v, 1)), topVsLow: round(Math.max(...topMed.map((v, k) => Math.abs(v - lowMed[k]))), 1),
          drift: round(Math.max(...top.flatMap(t => t.map((v, k) => Math.abs(v - top[0][k])))), 1), largestJump: jumps.length ? round(Math.max(...jumps), 1) : 0, jumpAtFrame: jumps.length ? jumps.indexOf(Math.max(...jumps)) + 1 : null},
        frozenFrames: frozen.length, frozenAt: frozen.slice(0, 40), unevenness: rel.length ? round(median(rel), 3) : null,
        card: {yellowFrames: yellowF.length, blueFrames: blueF.length, noCardFrames: seen.filter(([, b]) => !b).length, firstYellow: yellowF[0] ?? null, firstBlue: blueF[0] ?? null,
          seatedCardFrames: fr.filter(f => f.cards.some(b => b.inShoe && b.c === 'Y')).length, largestArea: Math.max(0, ...seen.map(([, b]) => b?.area ?? 0)), blueOnTableAtEnd: endBlue.map(b => ({x: b.x, y: b.y, area: b.area}))},
        ...(seats.length ? {landing} : {}),
        notPorted: 'handsFound, bodyFound och --ref (MediaPipe) finns bara i filmmatt.py'};
    },
  };
}
