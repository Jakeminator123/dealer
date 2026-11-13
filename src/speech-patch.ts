// The mouth patch: a spoken line laid on a film while the film plays (docs/TAL.md, the mouth layer). One patch is one film and
// one line in one language and voice: the box round her mouth in the film's own pixels for every frame the line covers, kept
// as one picture of cells (the strip), the line's sound as a file of its own, and a record that binds them (patch.json). The
// scene lays the cell of the frame on screen over that very frame (src/scene3d-mouth.ts); the film, its card track and Jakob's
// verdict stay as they are, and the same deal plays with or without speech.
//
// No file and no page in here: the record's type and its rules, the strip's layout, the colour of a cell, the sound file, and
// where in a chain of films a line can be laid. tools/speech-patch.ts cuts and checks patches with it, and the speech tool
// writes patches with tools/speech-patch.ts writePatch.
//
// Where a patch lies: assets/speech/<dealer>/patches/<id>/ with patch.json, mouth.webp (or mouth.png) and line.wav, and every
// patch the game may use is named in data/speech-patches.json.

/** The contract's fixed parts. maxSide: the strip's longest side in pixels (a texture every phone takes). */
export const PATCH = {schemaVersion: 1, kind: 'mouth-patch', maxSide: 4096, colour: 'bt709-tv', soundRate: 24000} as const;

export type PatchBox = {x: number; y: number; w: number; h: number};
/**
 * film: the film file the patch is made over (a clip's source.mp4; a take cut out of it shares its frame numbers), its sha256,
 * and its own frame rate, frames and size. line: the line's key (data/speech.json), language, the text as the voice reads it,
 * and the voice's name as the game asks for it ('Paow'). box: film pixels, y down, even numbers. feather: the edge in pixels
 * (featherMask in src/speech-plan.ts). Cell i of the strip is the film's frame first + i, and weighs weights[i] (the gate).
 * strip: the cells w × h without gaps, row by row, `columns` to a row (stripLayout); RGB without alpha or colour profile,
 * converted by cellRgb. sound: the line alone, 16-bit PCM mono; its first sample is heard at startsAtSeconds in the film's
 * time (from its frame 0, at rate 1). made: who made it, from what, with which bridge. check: what the maker measured.
 */
export type MouthPatch = {
  schemaVersion: 1; kind: 'mouth-patch'; id: string; dealer: string;
  film: {id: string; path: string; sha256: string; fps: number; frames: number; width: number; height: number};
  line: {key: string; language: string; text: string; voice: string; voiceId?: string};
  box: PatchBox; feather: number; first: number; count: number; weights: number[];
  strip: {path: string; type: 'image/webp' | 'image/png'; lossless: true; columns: number; rows: number; width: number; height: number; colour: 'bt709-tv'; sha256: string};
  sound: {path: string; type: 'audio/wav'; rate: number; channels: 1; samples: number; startsAtSeconds: number; endsAtSeconds: number; sha256: string};
  made: {by: string; at: string; from: {path: string; sha256: string}; bridge?: {cropX: number; padY: number}; gate?: Record<string, number>; changed?: PatchBox; renderer?: Record<string, unknown>};
  check?: Record<string, unknown>;
};
/** The register the game reads (data/speech-patches.json): every patch it may use, with the sha256 of its record. */
export type PatchRegister = {schemaVersion: 1; about?: string; patches: {id: string; dealer: string; film: string; line: string; language: string; voice: string; path: string; sha256: string}[]};

// ── the strip ────────────────────────────────────────────────────────────────
/** The strip for so many cells of w × h: as square as it can be, no side over maxSide. Throws when they do not fit. */
export function stripLayout(count: number, w: number, h: number, maxSide: number = PATCH.maxSide): {columns: number; rows: number; width: number; height: number} {
  if (![count, w, h].every(n => Number.isInteger(n) && n > 0)) throw Error('invalid_strip');
  let best: {columns: number; rows: number; width: number; height: number} | null = null;
  for (let columns = 1; columns <= count; columns++) {
    const rows = Math.ceil(count / columns), width = columns * w, height = rows * h;
    if (width > maxSide || height > maxSide || (columns > 1 && Math.ceil(count / (columns - 1)) === rows)) continue; // a column more that saves no row is waste
    if (!best || Math.max(width, height) < Math.max(best.width, best.height) || (Math.max(width, height) === Math.max(best.width, best.height) && width * height < best.width * best.height)) best = {columns, rows, width, height};
  }
  if (!best) throw Error('strip_too_large');
  return best;
}
/** Where cell i lies in the strip: its top left pixel. */
export const cellAt = (i: number, columns: number, w: number, h: number) => ({x: (i % columns) * w, y: Math.floor(i / columns) * h});
/** The frames a gate draws in: from the first weight above 0 to the last, or null when it draws in none. */
export function patchRange(weights: readonly number[]): {first: number; count: number} | null {
  const first = weights.findIndex(w => w > 0); if (first < 0) return null;
  let last = weights.length - 1; while (weights[last] <= 0) last--;
  return {first, count: last - first + 1};
}
/**
 * The edge's weight at a point of the box (x, y in pixels from its top left corner, continuous): what featherMask in
 * src/speech-plan.ts gives at a pixel's centre, 0 at the box's edge and 1 `feather` pixels in, eased. The scene's shader
 * computes the same (MOUTH_GLSL in src/scene3d-mouth.ts).
 */
export function maskAt(x: number, y: number, w: number, h: number, feather: number): number {
  const d = Math.min(x, w - x, y, h - y); if (d <= 0) return 0;
  const t = Math.min(1, d / Math.max(1, feather)); return t * t * (3 - 2 * t);
}

// ── the colour of a cell ─────────────────────────────────────────────────────
// The bank's films and the renderer's answers are planar Y, Cb, Cr 4:2:0 without colour tags, and Chrome shows an untagged film
// of the bank's size with BT.709 and limited range (the scene lane's measurement 2026-11-13, VideoFrame.colorSpace bt709). A
// cell is the same samples turned to RGB the same way, so that it shows as the film beside it does; FFmpeg's default for an
// untagged film (BT.601) would give her another skin tone inside the box. Chroma lies between the luma samples as `siting`
// says: 'centre' (half a pixel right and down of the even luma sample: how a GPU samples the half-size colour planes) or 'left'
// (beside the even sample, as H.264 marks it by default); between two colour samples it is read linearly.
export type Siting = 'centre' | 'left';
export const CELL_SITING: Siting = 'centre';
const KR = 0.2126, KB = 0.0722, KG = 1 - KR - KB;
const YS = 255 / 219, CS = 255 / 224, RV = 2 * (1 - KR), BU = 2 * (1 - KB), GU = 2 * KB * (1 - KB) / KG, GV = 2 * KR * (1 - KR) / KG;
const byte = (v: number) => v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v);
/** One sample of BT.709 limited range as RGB bytes (0 to 255, rounded). */
export function rgb709(y: number, cb: number, cr: number): [number, number, number] {
  const l = (y - 16) * YS, u = (cb - 128) * CS, v = (cr - 128) * CS;
  return [byte(l + RV * v), byte(l - GU * u - GV * v), byte(l + BU * u)];
}
/**
 * The box of one frame as RGB bytes. frame: planar 4:2:0 as FFmpeg writes it raw (luma, then Cb and Cr at half size), width ×
 * height. (x0, y0): the box's top left corner in that frame's pixels (for a renderer's answer: the film's box less cropX, plus
 * padY). out: w × h × 3 bytes written at (outX, outY) of a picture `outWidth` pixels wide (the strip).
 */
export function cellRgb(frame: Uint8Array, width: number, height: number, x0: number, y0: number, w: number, h: number, out: Uint8Array, outWidth: number, outX = 0, outY = 0, siting: Siting = CELL_SITING): void {
  if (frame.length !== width * height * 3 / 2 || width % 2 || height % 2) throw Error('invalid_frame');
  if (x0 < 0 || y0 < 0 || x0 + w > width || y0 + h > height) throw Error('box_outside_frame');
  const cw = width / 2, ch = height / 2, U = width * height, V = U + cw * ch;
  const chroma = (plane: number, fx: number, fy: number) => {
    const ax = Math.min(cw - 1, Math.max(0, fx)), ay = Math.min(ch - 1, Math.max(0, fy)), ix = Math.floor(ax), iy = Math.floor(ay), tx = ax - ix, ty = ay - iy, jx = Math.min(cw - 1, ix + 1), jy = Math.min(ch - 1, iy + 1);
    const a = frame[plane + iy * cw + ix], b = frame[plane + iy * cw + jx], c = frame[plane + jy * cw + ix], d = frame[plane + jy * cw + jx];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  };
  for (let j = 0; j < h; j++) {
    const y = y0 + j, fy = (y - 0.5) / 2; // the colour rows sit halfway between two luma rows
    for (let i = 0; i < w; i++) {
      // where luma column x lies among the colour columns: beside the even column ('left'), or halfway to the next ('centre')
      const x = x0 + i, fx = siting === 'left' ? x / 2 : (x - 0.5) / 2, o = ((outY + j) * outWidth + outX + i) * 3;
      const [r, g, b] = rgb709(frame[y * width + x], chroma(U, fx, fy), chroma(V, fx, fy));
      out[o] = r; out[o + 1] = g; out[o + 2] = b;
    }
  }
}

// ── the sound file ───────────────────────────────────────────────────────────
/** A WAV file of 16-bit PCM samples (little-endian, as the speech tool keeps them). */
export function wavBytes(pcm: Uint8Array, rate: number = PATCH.soundRate, channels = 1): Uint8Array {
  if (pcm.length % (2 * channels)) throw Error('invalid_pcm');
  const out = new Uint8Array(44 + pcm.length), view = new DataView(out.buffer), text = (at: number, s: string) => { for (let i = 0; i < s.length; i++) out[at + i] = s.charCodeAt(i); };
  text(0, 'RIFF'); view.setUint32(4, 36 + pcm.length, true); text(8, 'WAVE'); text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * channels * 2, true); view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, pcm.length, true);
  out.set(pcm, 44); return out;
}
/** The samples of a 16-bit PCM WAV file, each channel's as floats from −1 to 1. Throws on any other kind of file. */
export function readWav(bytes: Uint8Array): {rate: number; channels: number; samples: number; data: Float32Array<ArrayBuffer>[]} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (bytes.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw Error('not_wav');
  let at = 12, rate = 0, channels = 0, bits = 0, format = 0, data: Uint8Array | null = null;
  while (at + 8 <= bytes.length) { const id = tag(at), size = view.getUint32(at + 4, true), body = at + 8;
    if (id === 'fmt ') { format = view.getUint16(body, true); channels = view.getUint16(body + 2, true); rate = view.getUint32(body + 4, true); bits = view.getUint16(body + 14, true); }
    else if (id === 'data') data = bytes.subarray(body, Math.min(bytes.length, body + size));
    at = body + size + (size % 2); }
  if (format !== 1 || bits !== 16 || !channels || !rate || !data) throw Error('wav_not_pcm16');
  const samples = Math.floor(data.length / 2 / channels), out = Array.from({length: channels}, () => new Float32Array(samples)), pcm = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let k = 0; k < samples; k++) for (let c = 0; c < channels; c++) out[c][k] = pcm.getInt16((k * channels + c) * 2, true) / 32768;
  return {rate, channels, samples, data: out};
}

// ── what a record must hold ──────────────────────────────────────────────────
const isHex = (s: unknown) => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
const whole = (n: unknown, low = 0) => typeof n === 'number' && Number.isInteger(n) && n >= low;
const plain = (s: unknown) => typeof s === 'string' && /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/.test(s);
/** What is wrong with a patch record, in Swedish; empty when it holds. Only the record: the files are tools/speech-patch.ts check's. */
export function patchProblems(value: unknown): string[] {
  const p = value as MouthPatch, out: string[] = [];
  if (!p || typeof p !== 'object') return ['Posten är inget objekt.'];
  if (p.schemaVersion !== 1 || p.kind !== 'mouth-patch') out.push('Posten ska ha schemaVersion 1 och kind "mouth-patch".');
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(String(p.id)) || !plain(p.dealer)) out.push('id och dealer ska vara små bokstäver, siffror och bindestreck.');
  const f = p.film;
  if (!f || !plain(f.id) || typeof f.path !== 'string' || !/^assets\/motions\/[a-z0-9-]+\/source\.mp4$/.test(f.path) || !isHex(f.sha256) || !(typeof f.fps === 'number' && f.fps > 0) || !whole(f.frames, 1) || !whole(f.width, 2) || !whole(f.height, 2)) out.push('film ska ha id, path (assets/motions/<klipp>/source.mp4), sha256, fps, frames, width och height.');
  const l = p.line;
  if (!l || !/^[a-z0-9]{1,24}$/.test(String(l.key)) || !/^[a-z]{2}$/.test(String(l.language)) || typeof l.text !== 'string' || !l.text.trim() || typeof l.voice !== 'string' || !l.voice.trim()) out.push('line ska ha key, language, text och voice.');
  const b = p.box;
  if (!b || ![b.x, b.y].every(n => whole(n)) || ![b.w, b.h].every(n => whole(n, 2)) || [b.x, b.y, b.w, b.h].some(n => n % 2)) out.push('box ska vara jämna heltal (filmerna är 4:2:0).');
  else if (f && (b.x + b.w > f.width || b.y + b.h > f.height)) out.push('Lådan går utanför filmens bild.');
  if (!whole(p.feather, 1) || (b && p.feather * 2 > Math.min(b.w, b.h))) out.push('feather ska vara ett heltal, högst halva lådans minsta sida.');
  if (!whole(p.first) || !whole(p.count, 1)) out.push('first och count ska vara heltal, count minst 1.');
  else if (f && p.first + p.count > f.frames) out.push(`Lappens rutor ${p.first}–${p.first + p.count - 1} går utanför filmens ${f.frames}.`);
  if (!Array.isArray(p.weights) || p.weights.length !== p.count || p.weights.some(w => typeof w !== 'number' || !(w >= 0 && w <= 1))) out.push('weights ska ha en vikt per ruta, 0–1.');
  else if (!(p.weights[0] > 0) || !(p.weights[p.count - 1] > 0)) out.push('Första och sista rutan ska ha vikt över 0 (rutor utan mun tas bort i ändarna).');
  const s = p.strip;
  if (!s || !/^mouth\.(webp|png)$/.test(String(s.path)) || !['image/webp', 'image/png'].includes(s.type) || s.lossless !== true || s.colour !== PATCH.colour || !isHex(s.sha256)) out.push('strip ska vara mouth.webp eller mouth.png, förlustfri, colour "bt709-tv", med sha256.');
  else if (b && whole(p.count, 1)) { let lay = null; try { lay = stripLayout(p.count, b.w, b.h); } catch { /* reported below */ }
    if (!lay || s.columns !== lay.columns || s.rows !== lay.rows || s.width !== lay.width || s.height !== lay.height) out.push(`Rutnätet ska vara ${lay ? `${lay.columns} × ${lay.rows} rutor, ${lay.width} × ${lay.height}` : 'högst 4096 punkter per sida'} (stripLayout).`); }
  const a = p.sound;
  if (!a || a.path !== 'line.wav' || a.type !== 'audio/wav' || !whole(a.rate, 8000) || a.channels !== 1 || !whole(a.samples, 1) || !isHex(a.sha256) || typeof a.startsAtSeconds !== 'number' || !(a.startsAtSeconds >= 0)) out.push('sound ska vara line.wav (16-bit PCM, mono) med rate, samples, startsAtSeconds och sha256.');
  else {
    if (Math.abs(a.endsAtSeconds - (a.startsAtSeconds + a.samples / a.rate)) > 0.0015) out.push('sound.endsAtSeconds ska vara startsAtSeconds + samples / rate.');
    if (f && a.endsAtSeconds > f.frames / f.fps + 1e-6) out.push('Ljudet slutar efter filmen.');
  }
  if (!p.made || typeof p.made.by !== 'string' || typeof p.made.at !== 'string' || !p.made.from || !isHex(p.made.from.sha256)) out.push('made ska säga by, at och from (med sha256).');
  return out;
}

// ── where a line can be laid ─────────────────────────────────────────────────
/** A part of a chain as the game builds it: the film's file, its own frames start … end − 1 (end null: to the film's end, `frames`), its rate. */
export type ChainPart = {path: string; start?: number; end?: number | null; fps?: number; frames?: number | null};
/** The cell of a film frame, or −1 when the patch has none for it. */
export const cellOf = (p: Pick<MouthPatch, 'first' | 'count'>, frame: number) => frame >= p.first && frame < p.first + p.count ? frame - p.first : -1;
/** Whether a patch lies wholly inside a part: the same film and every one of its frames in the part's cut. */
export function fitsPart(p: Pick<MouthPatch, 'film' | 'first' | 'count'>, part: ChainPart): boolean {
  const start = part.start ?? 0, end = part.end ?? p.film.frames;
  return part.path === p.film.path && (part.fps ?? 30) === p.film.fps && start <= p.first && p.first + p.count <= end;
}
/** The rule of the game: how late after a chain begins a line before it may still be said over one of its films, in seconds. */
export const LATE_SECONDS = 8;
/**
 * Which lines of a step are said over which films of its chain. lines: the keys due in the step, in order; a line that belongs to
 * a later part than the first (the dealer's line belongs to the hole card's turn) says from which part (`from`). parts: the
 * chain's films in order. patches: those the game may use (its dealer, language and voice; their film's sha256 the bank's).
 * Each line goes over the first part from its own that has a patch for it, if that patch fits the part, the part carries no other
 * line, and its sound begins at most `late` seconds after its own part begins (the parts between counted at their own speed,
 * which is the slowest they play). Returns per line the part's index and the patch, or null: that line is said as before (its
 * talk film at rest, or as text). Lines are never laid on one part together, and a later line never on an earlier part.
 */
export type DueLine = string | {key: string; from?: number};
export function placeLines(lines: readonly DueLine[], parts: readonly ChainPart[], patches: readonly MouthPatch[], late = LATE_SECONDS): ({part: number; patch: MouthPatch} | null)[] {
  const starts: number[] = []; let t = 0;
  for (const part of parts) { starts.push(t); const fps = part.fps ?? 30, end = part.end ?? part.frames ?? patches.find(p => p.film.path === part.path)?.film.frames ?? null; t += end === null ? Infinity : Math.max(0, end - (part.start ?? 0)) / fps; }
  let after = -1; const taken = new Set<number>();
  return lines.map(line => {
    const key = typeof line === 'string' ? line : line.key, from = Math.min(parts.length, Math.max(0, typeof line === 'string' ? 0 : line.from ?? 0));
    for (let i = Math.max(after + 1, from); i < parts.length; i++) {
      if (taken.has(i)) continue;
      const patch = patches.find(p => p.line.key === key && fitsPart(p, parts[i])); if (!patch) continue;
      const begins = starts[i] - (starts[from] ?? 0) + patch.sound.startsAtSeconds - (parts[i].start ?? 0) / patch.film.fps;
      if (!(begins <= late)) return null;
      taken.add(i); after = i; return {part: i, patch};
    }
    return null;
  });
}
