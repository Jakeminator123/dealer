// Brings a delivered film into the bank's frame and measures it (src/film-after.ts): the after-work that tonight's orders ran as
// Python in a scratch folder (D:/dealer-scratch/tmp/paow/skript/efterarbete.py, slutkoll.py, kantkoll.py, filmmatt.py), the same
// frames without Python. Orders nothing and spends nothing.
//   node tools/film-after.ts <order id> <take> [flags]
// Reads data/orders/<id>.json (the model, first.png and the anchor it was copied from, last.png, the motion's target) and the
// delivery assets/orders/<id>/take-<n>/source.mp4, which is only read. Writes beside it, never over anything:
//   after.mp4   the bank's frame (1764 × 1174) at the delivery's own rate, no sound; H.264 CRF 12, preset slow, 4:2:0, encoded by
//               FFmpeg from BGR frames exactly as the script did, so the same frames give the same file
//   after.json  the receipt: the treatment and why, every flag, the frames cut, the scaling, the tone lock's gain and lift, the
//               pictures with their SHA-256, the original's SHA-256 before and after (unchanged), and every measure: the green
//               before and after, slutkoll (on the delivery and on after.mp4), kantkoll on the first and last frame, filmmatt's
//               pixel half; --compare adds the frame-by-frame comparison with another film
// The treatment follows the model (TREATMENTS in src/film-after.ts): WAN 3 cuts its two dark last frames and lifts the person to
// first.png; Kling 4 keeps every frame and is scaled from 1172 to 1174 rows; Kling 3.0 4K is scaled down and lifted. The green
// comes from the anchor first.png was copied from (its from.path), as every after-work tonight used it. A delivery that is not
// the first picture's shape (width/height within 1 %) is refused: fitting it to the bank's frame is the main agent's and Jakob's.
// The delivery's colour tags are ignored on decoding, as OpenCV did (a Kling 4 film is tagged BT.709 and was read as BT.601).
// Flags, the cases the scripts had:
//   --keep-tail | --cut <n>   keep every frame | cut the n last frames (default by the model: WAN 3 cuts 2)
//   --lock | --no-lock        lift the person to first.png's levels, or not (default by the model)
//   --fps <rate>              the rate written (default: the delivery's own, e.g. 24 for Kling)
//   --anchor <png>            the picture whose green is wanted (default: the anchor first.png comes from)
//   --seats <P1.C1,…>         the targets filmmatt measures the landing at (default: the order's motion.target)
//   --out <dir>               write after.mp4 and after.json into that folder instead (a trial; nothing beside the original)
//   --compare <film>          compare after.mp4 frame by frame with another film (tonight's Python after.mp4)
// Exit code 2 and the reason in Swedish when the run is refused; nothing is then written.
import {readFile, writeFile, mkdir, rename, rm, stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import {probe, sha256File, type Probe} from './film-fix.ts';
import {orderTake, OrderError} from './order-collect.ts';
import {BANK, TREATMENTS, resizeCubic, smoothGreen, toneLock, levelFrame, NO_TONE, cornerMean, endCheck, edgeCheck, filmMeasure, seam, round, type Tone, type PlanTarget} from '../src/film-after.ts';

const ROOT = process.cwd(), scratch = 'D:/dealer-scratch/tmp', env = existsSync(scratch) ? {...process.env, TEMP: scratch, TMP: scratch} : process.env;
const ffmpeg = process.env.FFMPEG ?? 'ffmpeg';
/** The encoding, argument for argument as efterarbete.py called FFmpeg. */
export const ENCODE = ['-an', '-c:v', 'libx264', '-crf', '12', '-preset', 'slow', '-pix_fmt', 'yuv420p'];
// Decoding as OpenCV did: every frame as it comes, BGR, the stream's colour tags set aside (OpenCV converts with BT.601).
const DECODE_FILTER = 'setparams=colorspace=unknown:color_primaries=unknown:color_trc=unknown:range=unknown';
export const SHAPE_TOLERANCE = 0.01;

export class Refused extends Error {}
const posix = (file: string) => { const rel = path.relative(ROOT, path.resolve(file)); return (!rel.startsWith('..') && !path.isAbsolute(rel) ? rel : path.resolve(file)).split(path.sep).join('/'); };

/** A picture as OpenCV reads it: 8-bit BGR, no colour management. */
export async function readPicture(file: string): Promise<{width: number; height: number; data: Uint8Array; sha256: string}> {
  const bytes = await readFile(file), {data, info} = await sharp(bytes).removeAlpha().raw().toBuffer({resolveWithObject: true});
  const out = new Uint8Array(info.width * info.height * 3), ch = info.channels;
  for (let p = 0; p < info.width * info.height; p++) { const s = p * ch; out[p * 3] = data[s + (ch >= 3 ? 2 : 0)]; out[p * 3 + 1] = data[s + (ch >= 3 ? 1 : 0)]; out[p * 3 + 2] = data[s]; }
  return {width: info.width, height: info.height, data: out, sha256: createHash('sha256').update(bytes).digest('hex')};
}

/** The frames of a film as OpenCV's VideoCapture gives them: BGR, w × h × 3 bytes each. */
export async function* decode(file: string, w: number, h: number): AsyncGenerator<Uint8Array> {
  const bytes = w * h * 3, child = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', file, '-map', '0:v:0', '-vf', DECODE_FILTER, '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-'], {stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env});
  let err = ''; child.stderr!.on('data', c => { err += c; });
  const done = new Promise<number>(resolve => child.on('close', code => resolve(code ?? 1)));
  let frame = new Uint8Array(bytes), filled = 0, complete = false;
  try {
    for await (const chunk of child.stdout as AsyncIterable<Buffer>) {
      let at = 0;
      while (at < chunk.length) { const take = Math.min(chunk.length - at, bytes - filled); frame.set(chunk.subarray(at, at + take), filled); filled += take; at += take;
        if (filled === bytes) { yield frame; frame = new Uint8Array(bytes); filled = 0; } }
    }
    complete = true;
  } finally { if (!complete) child.kill(); }
  const code = await done;
  if (code !== 0) throw Error(`ffmpeg ${code}: ${err.trim().slice(0, 400)}`);
  if (filled) throw Error(`${file}: en halv ruta på slutet (${filled} av ${bytes} byte).`);
}

/** An encoder fed BGR frames, as efterarbete.py fed its FFmpeg. */
function encoder(file: string, w: number, h: number, fps: string) {
  const child = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', `${w}x${h}`, '-r', fps, '-i', '-', ...ENCODE, file], {stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true, env});
  let err = ''; child.stderr!.on('data', c => { err += c; });
  const done = new Promise<void>((resolve, reject) => { child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(Error(`ffmpeg ${code}: ${err.trim().slice(0, 400)}`))); });
  return {
    write: async (frame: Uint8Array) => { if (!child.stdin!.write(frame)) await new Promise(resolve => child.stdin!.once('drain', resolve)); },
    end: async () => { child.stdin!.end(); await done; },
    abort: async () => { child.stdin!.destroy(); child.kill(); await done.catch(() => undefined); },
  };
}

/** The rate as efterarbete.py wrote it to FFmpeg: a whole number when it is one ("24", "30"). */
export function rateText(fps: string): string { const [n, d] = fps.split('/').map(Number); return d && n % d === 0 ? String(n / d) : fps; }
/** Whether a delivery has the first picture's shape (width/height within SHAPE_TOLERANCE): Kling 4's 1764 × 1172 does, 16:9 does not. */
export function sameShape(w: number, h: number, pw: number, ph: number): boolean { return Math.abs(w / h - pw / ph) / (pw / ph) <= SHAPE_TOLERANCE; }

export type Options = {cut?: number; lock?: boolean; fps?: string; anchor?: string; seats?: string[]; out?: string; compare?: string};
/** Reads the flags; unknown flags are refused, so that a typo is not ignored. */
export function readFlags(args: string[]): Options {
  const o: Options = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i], value = () => { const v = args[++i]; if (v === undefined || v.startsWith('--')) throw new Refused(`${a} behöver ett värde.`); return v; };
    if (a === '--keep-tail') o.cut = 0;
    else if (a === '--cut') { const n = Number(value()); if (!Number.isInteger(n) || n < 0 || n > 3) throw new Refused('--cut är 0–3 rutor (WAN 3:s två mörka sista rutor; mer än så är ett utsnitt).'); o.cut = n; }
    else if (a === '--lock') o.lock = true;
    else if (a === '--no-lock') o.lock = false;
    else if (a === '--fps') { o.fps = value(); if (!/^\d+(\/\d+)?$/.test(o.fps)) throw new Refused('--fps är ett tal eller ett bråk (24, 30, 30000/1001).'); }
    else if (a === '--anchor') o.anchor = value();
    else if (a === '--seats') o.seats = value().split(',').filter(Boolean);
    else if (a === '--out') o.out = value();
    else if (a === '--compare') o.compare = value();
    else throw new Refused(`Okänd flagga ${a}.`);
  }
  return o;
}

type Picture = Awaited<ReturnType<typeof readPicture>>;
export type FilmComparison = {other: string; otherSha256: string; identicalFile: boolean; frames: [number, number]; identicalFrames: number; meanAbs: number; maxAbs: number; differingShare: number;
  worstFrame: {frame: number; meanAbs: number; maxAbs: number} | null; histogram: Record<string, number>; perFrame: {frame: number; meanAbs: number; maxAbs: number}[]};

/** The whole run for one take. Nothing is written beside the original unless every step holds; after.mp4 is written under a temporary name first. */
export async function afterWork(id: string, take: number, options: Options = {}, root = ROOT): Promise<{record: Record<string, unknown>; film: string; receipt: string}> {
  const {order, folder} = await orderTake(root, id, take);
  if (order.kind !== 'FILM') throw new Refused(`${id} är en ${order.kind}, ingen film: stillbilder efterarbetas med tools/still-after.ts.`);
  const model = String(order.generation?.model ?? ''), treatment = TREATMENTS[model];
  if (!treatment) throw new Refused(`${id}: modellen ${model || '(ingen)'} har inget efterarbete här; det finns för ${Object.keys(TREATMENTS).join(', ')}.`);
  const takeDir = path.join(folder, `take-${take}`), source = path.join(takeDir, 'source.mp4');
  if (!existsSync(source)) throw new Refused(`Leveransen saknas: ${posix(source)}.`);
  const pics = (order as {pictures?: {name: string; path: string | null; from?: {path?: string}}[]}).pictures ?? [];
  const firstEntry = pics.find(p => p.name === 'first.png'), firstFile = path.join(folder, 'first.png'), lastFile = path.join(folder, 'last.png');
  if (!existsSync(firstFile)) throw new Refused(`${id}: first.png saknas (${posix(firstFile)}); utan den finns varken grönt eller ton att gå efter.`);
  const anchorFile = options.anchor ? path.resolve(options.anchor) : firstEntry?.from?.path && existsSync(path.join(root, firstEntry.from.path)) ? path.join(root, firstEntry.from.path) : firstFile;
  const outDir = options.out ? path.resolve(options.out) : takeDir, film = path.join(outDir, 'after.mp4'), receipt = path.join(outDir, 'after.json'), part = path.join(outDir, 'after.part.mp4');
  for (const f of [film, receipt]) if (existsSync(f)) throw new Refused(`${posix(f)} finns redan; efterarbetet skriver aldrig över (det som ligger där kan vara det som banken gjordes av).`);
  if (path.resolve(film) === path.resolve(source)) throw new Refused('Utfilen får inte vara originalet.');

  const facts: Probe = probe(source), anchor = await readPicture(anchorFile), first = await readPicture(firstFile), last = existsSync(lastFile) ? await readPicture(lastFile) : null;
  const W = anchor.width, H = anchor.height;
  if (W !== BANK.width || H !== BANK.height) throw new Refused(`Ankaret ${posix(anchorFile)} är ${W} × ${H}, inte bankens ${BANK.width} × ${BANK.height}.`);
  if (first.width !== W || first.height !== H || (last && (last.width !== W || last.height !== H))) throw new Refused('first.png och last.png ska ha bankens storlek.');
  if (!sameShape(facts.width, facts.height, W, H)) throw new Refused(`Leveransen är ${facts.width} × ${facts.height} (bredd/höjd ${round(facts.width / facts.height, 3)}), inte första bildens form ${round(W / H, 3)}: stanna och rapportera; passningen till bankens ram är huvudagentens och Jakobs.`);
  const cut = options.cut ?? treatment.cutTail, lock = options.lock ?? treatment.lock, fps = rateText(options.fps ?? facts.fps), rate = (([n, d]) => n / (d || 1))(fps.split('/').map(Number));
  const scaled = facts.width !== W || facts.height !== H, seats = options.seats ?? (typeof (order.motion as {target?: unknown} | null)?.target === 'string' ? [String((order.motion as {target: string}).target)] : []);
  const other = options.compare ? path.resolve(options.compare) : null;
  if (other) { if (!existsSync(other)) throw new Refused(`${posix(other)} finns inte.`); const o = probe(other); if (o.width !== W || o.height !== H) throw new Refused(`${posix(other)} är ${o.width} × ${o.height}; jämförelsen kräver bankens ram.`); }
  const sourceSha = await sha256File(source);

  await mkdir(outDir, {recursive: true});
  const gt = smoothGreen(anchor.data, W, H), started = Date.now();
  let tone: Tone | null = null, index = 0, written = 0, firstLevels: [number[], number[]] | null = null, lastLevels: [number[], number[]] | null = null;
  const queue: Uint8Array[] = [], sourceEnd = last ? endCheck(last.data, W, H) : null, enc = encoder(part, W, H, fps);
  let whole = false, encoded = false;
  try {
    for await (const raw of decode(source, facts.width, facts.height)) {
      const frame = scaled ? resizeCubic(raw, facts.width, facts.height, W, H) : raw;
      if (index++ === 0 && lock) {
        tone = toneLock(first.data, frame, W, H);
        if (!tone.pixels) throw new Refused('Ingen del av henne syns i både first.png och filmens första ruta; tonlåset kan inte mätas (--no-lock om det är meningen).');
      }
      sourceEnd?.add(frame);
      queue.push(frame);
      if (queue.length > cut) {
        const f = queue.shift()!, o = levelFrame(f, gt, W, H, tone ?? NO_TONE), levels: [number[], number[]] = [cornerMean(f, W, H), cornerMean(o, W, H)];
        if (!firstLevels) firstLevels = levels; lastLevels = levels;
        await enc.write(o); written++;
      }
    }
    await enc.end(); encoded = true;
    if (index !== facts.frames) throw Error(`Avkodningen gav ${index} rutor, ffprobe räknade ${facts.frames}.`);
    const record = await measures();
    await rename(part, film);
    await writeFile(receipt, JSON.stringify(record, null, 2) + '\n', {flag: 'wx'});
    whole = true;
    return {record, film, receipt};
  } finally { if (!whole) { if (!encoded) await enc.abort(); await rm(part, {force: true}); } }

  // The measures, on the film as written (decoded again, as the scripts read after.mp4), and the comparison when asked.
  async function measures() {
  const out = probe(part), measure = filmMeasure(W, H, rate), endAfter = last ? endCheck(last.data, W, H) : null, plan = await planTargets(root);
  let f0: Uint8Array | null = null, fl: Uint8Array | null = null, comparison: FilmComparison | null = null;
  const cmp = other ? comparer(other) : null;
  const otherFrames = other ? decode(other, W, H)[Symbol.asyncIterator]() : null;
  for await (const frame of decode(part, W, H)) {
    if (!f0) f0 = frame.slice(); fl = frame;
    measure.add(frame); endAfter?.add(frame);
    if (otherFrames && cmp) { const next = await otherFrames.next(); cmp.add(frame, next.done ? null : next.value); }
  }
  if (otherFrames && cmp) { for (let next = await otherFrames.next(); !next.done; next = await otherFrames.next()) cmp.add(null, next.value); comparison = await cmp.result(await sha256File(part)); }
  const sourceAfter = await sha256File(source);
  if (sourceAfter !== sourceSha) throw Error('Originalet ändrades under körningen.');
  const t = tone ?? {...NO_TONE, pixels: 0}, rgb = (v: number[]) => [v[2], v[1], v[0]];
  const record = {schemaVersion: 1, tool: 'tools/film-after.ts', createdAt: new Date().toISOString(), seconds: round((Date.now() - started) / 1000, 1),
    order: id, take, model, treatment: {...treatment, cutTail: cut, lock, fps, flags: options, scaledFrom: scaled ? [facts.width, facts.height] : null,
      scaling: scaled ? 'varje ruta skalad rakt till bankens ram, bikubiskt (OpenCV INTER_CUBIC), som efterarbete.py' : null, soundDropped: facts.audio,
      colourTagsIgnored: Object.keys(facts.colour).length ? facts.colour : null, port: 'efterarbete.py, slutkoll.py, kantkoll.py och filmmatt.py:s pixeldel (src/film-after.ts)'},
    pictures: {anchor: {path: posix(anchorFile), sha256: anchor.sha256, why: 'det gröna som varje ruta förs till'}, first: {path: posix(firstFile), sha256: first.sha256, why: lock ? 'tonlåsets referens' : 'startskarven'},
      ...(last ? {last: {path: posix(lastFile), sha256: last.sha256, why: 'slutkoll och slutskarven'}} : {})},
    source: {path: posix(source), sha256: sourceSha, sha256After: sourceAfter, untouched: true, bytes: (await stat(source)).size, width: facts.width, height: facts.height, fps: facts.fps, frames: facts.frames, audio: facts.audio, colour: facts.colour},
    output: {path: posix(film), sha256: await sha256File(part), bytes: (await stat(part)).size, width: out.width, height: out.height, fps: out.fps, frames: out.frames, audio: out.audio, encoding: `FFmpeg ${ENCODE.join(' ')} från BGR-rutor`,
      dropped: cut ? [facts.frames - cut, facts.frames - 1] : null, frameMap: 'samma rutnummer som originalet'},
    tone: lock ? {gainRGB: rgb(t.gain).map(v => round(v, 4)), liftRGB: rgb(t.lift).map(v => round(v, 2)), pixels: t.pixels} : null,
    // As efterarbete.py printed it (gain and lift in OpenCV's B, G, R; greens R, G, B), for a line-by-line comparison with tonight's notes.
    efterarbete: {frames: written, gainBGR: t.gain.map(v => round(v, 3)), liftBGR: t.lift.map(v => round(v, 2)), greenBefore: {first: firstLevels?.[0], last: lastLevels?.[0]}, greenAfter: {first: firstLevels?.[1], last: lastLevels?.[1]}},
    slutkoll: {source: sourceEnd?.result() ?? null, after: endAfter?.result() ?? null},
    kantkoll: {firstFrame: f0 ? edgeCheck(f0, W, H) : null, lastFrame: fl ? edgeCheck(fl, W, H) : null},
    filmmatt: {...measure.result(seats, plan), startSeam: f0 ? seam(f0, first.data) : null, endSeam: fl && last ? seam(fl, last.data) : null},
    ...(comparison ? {comparison} : {}),
    review: 'Efterarbetet ersätter ingen granskning: varje ruta granskas i full upplösning (tools/order-clerk.md, avsnitt 6–8).'};
  if (record.output.frames !== written) throw Error(`after.mp4 har ${record.output.frames} rutor, ${written} skrevs.`);
  return record;
  }
}

async function planTargets(root: string): Promise<Record<string, PlanTarget>> {
  const file = path.join(root, 'placements', 'default.json');
  if (!existsSync(file)) return {};
  const targets = JSON.parse(await readFile(file, 'utf8')).targets ?? {};
  return Object.fromEntries(Object.entries(targets).map(([k, v]) => [k, (v as {geometry: {native: PlanTarget}}).geometry.native]));
}

/** Frame by frame against another film: identical frames, the mean and largest difference per value, and how the differences spread. */
function comparer(other: string) {
  const perFrame: {frame: number; meanAbs: number; maxAbs: number}[] = [], hist = new Float64Array(256);
  let mine = 0, theirs = 0, identical = 0, sum = 0, values = 0, max = 0, differing = 0;
  return {
    add(a: Uint8Array | null, b: Uint8Array | null) {
      if (a) mine++; if (b) theirs++;
      if (!a || !b) return;
      let s = 0, m = 0, d = 0;
      for (let i = 0; i < a.length; i++) { const v = Math.abs(a[i] - b[i]); s += v; if (v > m) m = v; if (v) d++; hist[v]++; }
      if (!m) identical++;
      sum += s; values += a.length; differing += d; max = Math.max(max, m);
      perFrame.push({frame: perFrame.length, meanAbs: round(s / a.length, 4), maxAbs: m});
    },
    async result(mineSha: string): Promise<FilmComparison> {
      const otherSha = await sha256File(other), worst = perFrame.reduce<typeof perFrame[number] | null>((w, f) => !w || f.meanAbs > w.meanAbs ? f : w, null), histogram: Record<string, number> = {};
      for (let v = 0; v < 256; v++) if (hist[v]) histogram[String(v)] = hist[v];
      return {other: posix(other), otherSha256: otherSha, identicalFile: otherSha === mineSha, frames: [mine, theirs], identicalFrames: identical, meanAbs: values ? round(sum / values, 5) : 0, maxAbs: max,
        differingShare: values ? round(differing / values, 6) : 0, worstFrame: worst, histogram, perFrame};
    },
  };
}

if (import.meta.main) {
  const [id, takeText, ...rest] = process.argv.slice(2);
  if (!id || !takeText) { console.error('Användning: node tools/film-after.ts <beställnings-id> <tagning> [--keep-tail|--cut n] [--lock|--no-lock] [--fps r] [--anchor png] [--seats P1.C1] [--out mapp] [--compare film]'); process.exit(1); }
  try {
    const {record, film, receipt} = await afterWork(id, Number(takeText), readFlags(rest));
    const r = record as Record<string, any>;
    console.log(JSON.stringify({film: posix(film), receipt: posix(receipt), model: r.model, frames: r.output.frames, size: [r.output.width, r.output.height], fps: r.output.fps, cutTail: r.treatment.cutTail, lock: r.treatment.lock,
      efterarbete: r.efterarbete, slutkoll: r.slutkoll.after, kantkollLast: r.kantkoll.lastFrame && {dark: r.kantkoll.lastFrame.darkGreenPixelsAboveEdge, bodyEnds: r.kantkoll.lastFrame.bodyEnds},
      filmmatt: {frozenFrames: r.filmmatt.frozenFrames, green: r.filmmatt.green, landing: r.filmmatt.landing, startSeam: r.filmmatt.startSeam, endSeam: r.filmmatt.endSeam},
      comparison: r.comparison && {identicalFile: r.comparison.identicalFile, frames: r.comparison.frames, identicalFrames: r.comparison.identicalFrames, meanAbs: r.comparison.meanAbs, maxAbs: r.comparison.maxAbs, differingShare: r.comparison.differingShare}}, null, 2));
    if (!rest.includes('--out')) console.log(`Nästa: node tools/order-put.ts status ${id} ${takeText} EFTERARBETAD --file ${posix(film)} --note "tools/film-after.ts (${r.model}): ..."`);
  } catch (e) {
    if (e instanceof Refused || e instanceof OrderError) { console.error(e.message); process.exit(2); }
    throw e;
  }
}
